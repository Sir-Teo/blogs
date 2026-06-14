(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    source: "#0f766e",
    signal: "#2563eb",
    purple: "#7c3aed",
    heat: "#b45309",
    bad: "#be123c"
  };

  var DEFAULTS = {
    diffusion: 50,
    feed: 30,
    kill: 62,
    seed: 41,
    size: 12,
    steps: 900
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      diffusion: clamp(Number(raw.diffusion == null ? DEFAULTS.diffusion : raw.diffusion), 30, 80) / 100,
      feed: clamp(Number(raw.feed == null ? DEFAULTS.feed : raw.feed), 14, 98) / 1000,
      kill: clamp(Number(raw.kill == null ? DEFAULTS.kill : raw.kill), 45, 72) / 1000,
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 999),
      size: clamp(Number(raw.size == null ? DEFAULTS.size : raw.size), 4, 24) / 100,
      steps: clamp(Math.round(raw.steps == null ? DEFAULTS.steps : raw.steps), 180, 1800)
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="rd-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function idx(x, y, n) {
    return ((y + n) % n) * n + ((x + n) % n);
  }

  function makeInitialState(params, n) {
    var rand = rng(20260614 + params.seed * 211 + n * 17);
    var u = new Float64Array(n * n);
    var v = new Float64Array(n * n);
    var x;
    var y;
    var i;

    for (i = 0; i < u.length; i += 1) {
      u[i] = 1 + 0.006 * normal(rand);
      v[i] = Math.max(0, 0.002 * normal(rand));
    }

    var blobs = [
      { x: 0.50, y: 0.50, r: params.size },
      { x: 0.30 + 0.10 * rand(), y: 0.28 + 0.08 * rand(), r: params.size * 0.68 },
      { x: 0.70 - 0.10 * rand(), y: 0.72 - 0.08 * rand(), r: params.size * 0.62 }
    ];

    for (y = 0; y < n; y += 1) {
      for (x = 0; x < n; x += 1) {
        var px = (x + 0.5) / n;
        var py = (y + 0.5) / n;
        for (var b = 0; b < blobs.length; b += 1) {
          var dx = px - blobs[b].x;
          var dy = py - blobs[b].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < blobs[b].r * blobs[b].r) {
            var q = 1 - d2 / (blobs[b].r * blobs[b].r);
            i = idx(x, y, n);
            u[i] = 0.45 + 0.06 * normal(rand) - 0.10 * q;
            v[i] = 0.22 + 0.12 * q + 0.035 * normal(rand);
          }
        }
      }
    }

    return { u: u, v: v };
  }

  function lap(field, x, y, n) {
    return -field[idx(x, y, n)] +
      0.2 * (field[idx(x - 1, y, n)] + field[idx(x + 1, y, n)] + field[idx(x, y - 1, n)] + field[idx(x, y + 1, n)]) +
      0.05 * (field[idx(x - 1, y - 1, n)] + field[idx(x + 1, y - 1, n)] + field[idx(x - 1, y + 1, n)] + field[idx(x + 1, y + 1, n)]);
  }

  function simulate(params, options) {
    options = options || {};
    var n = options.n || 72;
    var state = makeInitialState(params, n);
    var u = state.u;
    var v = state.v;
    var nextU = new Float64Array(n * n);
    var nextV = new Float64Array(n * n);
    var du = 0.16;
    var dv = 0.16 * params.diffusion;
    var dt = 1.0;
    var trace = [];
    var checkpoint = Math.max(1, Math.floor(params.steps / 64));

    for (var step = 0; step <= params.steps; step += 1) {
      if (step % checkpoint === 0 || step === params.steps) {
        var s = summarize(u, v, n);
        trace.push({ active: s.activeShare, contrast: s.contrast, mass: s.meanV, step: step });
      }
      if (step === params.steps) break;

      for (var y = 0; y < n; y += 1) {
        for (var x = 0; x < n; x += 1) {
          var i = idx(x, y, n);
          var uvv = u[i] * v[i] * v[i];
          var nu = u[i] + (du * lap(u, x, y, n) - uvv + params.feed * (1 - u[i])) * dt;
          var nv = v[i] + (dv * lap(v, x, y, n) + uvv - (params.feed + params.kill) * v[i]) * dt;
          nextU[i] = clamp(nu, 0, 1.3);
          nextV[i] = clamp(nv, 0, 1.3);
        }
      }

      var tempU = u;
      u = nextU;
      nextU = tempU;
      var tempV = v;
      v = nextV;
      nextV = tempV;
    }

    return { n: n, trace: trace, u: u, v: v };
  }

  function summarize(u, v, n) {
    var mean = 0;
    var meanU = 0;
    var maxV = 0;
    var active = 0;
    var i;
    for (i = 0; i < v.length; i += 1) {
      mean += v[i];
      meanU += u[i];
      maxV = Math.max(maxV, v[i]);
      if (v[i] > 0.16) active += 1;
    }
    mean /= v.length;
    meanU /= u.length;

    var variance = 0;
    var edge = 0;
    var bins = new Array(24).fill(0);
    for (var y = 0; y < n; y += 1) {
      for (var x = 0; x < n; x += 1) {
        i = idx(x, y, n);
        var dvx = v[idx(x + 1, y, n)] - v[idx(x - 1, y, n)];
        var dvy = v[idx(x, y + 1, n)] - v[idx(x, y - 1, n)];
        edge += dvx * dvx + dvy * dvy;
        variance += Math.pow(v[i] - mean, 2);
        bins[clamp(Math.floor(v[i] * bins.length / 0.55), 0, bins.length - 1)] += 1;
      }
    }
    variance /= v.length;
    edge = Math.sqrt(edge / v.length);

    var entropy = 0;
    bins.forEach(function (count) {
      var p = count / v.length;
      if (p > 0) entropy -= p * Math.log(p);
    });

    return {
      activeShare: active / v.length,
      contrast: Math.sqrt(variance),
      edgeEnergy: edge,
      histogramSpread: Math.exp(entropy) / bins.length,
      maxV: maxV,
      meanU: meanU,
      meanV: mean
    };
  }

  function coarseMap(params) {
    var cells = [];
    var feeds = [];
    var kills = [];
    for (var fy = -2; fy <= 2; fy += 1) feeds.push(clamp(params.feed + fy * 0.006, 0.014, 0.098));
    for (var kx = -2; kx <= 2; kx += 1) kills.push(clamp(params.kill + kx * 0.004, 0.045, 0.072));
    for (var y = 0; y < feeds.length; y += 1) {
      for (var x = 0; x < kills.length; x += 1) {
        var local = Object.assign({}, params, { feed: feeds[y], kill: kills[x], steps: 260, size: params.size * 0.95 });
        var sim = simulate(local, { n: 30 });
        var stats = summarize(sim.u, sim.v, sim.n);
        cells.push({
          active: stats.activeShare,
          contrast: stats.contrast,
          feed: feeds[y],
          kill: kills[x],
          score: stats.contrast * Math.sqrt(stats.activeShare + 0.02),
          x: x,
          y: y
        });
      }
    }
    return { cells: cells, feeds: feeds, kills: kills };
  }

  function evaluate(rawParams, options) {
    options = options || {};
    var params = cleanParams(rawParams);
    var sim = simulate(params, { n: options.n || 72 });
    var stats = summarize(sim.u, sim.v, sim.n);
    return {
      map: options.map === false ? { cells: [] } : coarseMap(params),
      params: params,
      sim: sim,
      stats: stats
    };
  }

  function readState(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var values = {
      diffusion: Math.round(params.diffusion * 100) + "%",
      feed: formatNumber(params.feed, 3),
      kill: formatNumber(params.kill, 3),
      seed: String(params.seed),
      size: Math.round(params.size * 100) + "%",
      steps: String(params.steps)
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function updateMetrics(metrics, result) {
    metrics.innerHTML = [
      metric("V mass", formatNumber(result.stats.meanV, 3)),
      metric("contrast", formatNumber(result.stats.contrast, 3)),
      metric("active area", formatPercent(result.stats.activeShare, 1)),
      metric("edge energy", formatNumber(result.stats.edgeEnergy, 3)),
      metric("histogram spread", formatPercent(result.stats.histogramSpread, 1)),
      metric("peak V", formatNumber(result.stats.maxV, 3))
    ].join("");
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 680 ? 980 : 660;
    var ratio = root.devicePixelRatio || 1;
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 43, 11, COLORS.muted, 550);
  }

  function colorFor(v, u) {
    var t = clamp((v - 0.02) / 0.38, 0, 1);
    var wash = clamp((1 - u) * 0.7 + t, 0, 1);
    var r = Math.round(248 - 207 * t + 44 * wash);
    var g = Math.round(250 - 125 * t - 26 * wash);
    var b = Math.round(252 - 18 * t - 76 * wash);
    return [clamp(r, 20, 255), clamp(g, 40, 255), clamp(b, 60, 255)];
  }

  function drawField(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "chemical field", "brighter blue means more V after the rollout");
    var left = x + 20;
    var top = y + 58;
    var size = Math.min(w - 40, h - 82);
    var n = result.sim.n;
    var tile = root.document.createElement("canvas");
    tile.width = n;
    tile.height = n;
    var tctx = tile.getContext("2d");
    var image = tctx.createImageData(n, n);
    for (var i = 0; i < n * n; i += 1) {
      var c = colorFor(result.sim.v[i], result.sim.u[i]);
      image.data[4 * i] = c[0];
      image.data[4 * i + 1] = c[1];
      image.data[4 * i + 2] = c[2];
      image.data[4 * i + 3] = 255;
    }
    tctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile, left, top, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, size, size);
  }

  function drawTrace(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "rollout trace", "contrast and occupied area over simulation time");
    var left = x + 42;
    var right = x + w - 18;
    var top = y + 62;
    var bottom = y + h - 40;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    var maxContrast = Math.max.apply(null, result.sim.trace.map(function (p) { return p.contrast; }).concat([0.01]));
    var maxActive = Math.max.apply(null, result.sim.trace.map(function (p) { return p.active; }).concat([0.01]));

    function line(key, maxValue, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      result.sim.trace.forEach(function (point, index) {
        var xx = left + (right - left) * point.step / Math.max(1, result.params.steps);
        var yy = bottom - (bottom - top) * point[key] / Math.max(1e-9, maxValue);
        if (index === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    }

    line("contrast", maxContrast, COLORS.signal);
    line("active", maxActive, COLORS.heat);
    drawText(ctx, "contrast", left + 6, top + 14, 10, COLORS.signal, 750);
    drawText(ctx, "area", left + 6, top + 30, 10, COLORS.heat, 750);
    drawText(ctx, "steps", (left + right) / 2, y + h - 13, 10, COLORS.muted, 650, "center");
  }

  function drawMap(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "nearby parameter map", "local feed/kill sweep; hot cells make texture");
    var left = x + 42;
    var top = y + 60;
    var size = Math.min(w - 66, h - 94);
    var cell = size / 5;
    var maxScore = Math.max.apply(null, result.map.cells.map(function (c) { return c.score; }).concat([0.001]));
    result.map.cells.forEach(function (cellInfo) {
      var t = Math.sqrt(cellInfo.score / maxScore);
      ctx.fillStyle = "rgba(15,118,110," + (0.08 + 0.82 * t).toFixed(3) + ")";
      ctx.fillRect(left + cellInfo.x * cell, top + cellInfo.y * cell, Math.ceil(cell), Math.ceil(cell));
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, size, size);
    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = 2;
    ctx.strokeRect(left + 2 * cell + 2, top + 2 * cell + 2, cell - 4, cell - 4);
    drawText(ctx, "kill", left + size / 2, top + size + 24, 10, COLORS.muted, 650, "center");
    ctx.save();
    ctx.translate(left - 22, top + size / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "feed", 0, 0, 10, COLORS.muted, 650, "center");
    ctx.restore();
  }

  function drawHistogram(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "concentration histogram", "how much of the grid sits at each V level");
    var bins = new Array(24).fill(0);
    for (var i = 0; i < result.sim.v.length; i += 1) {
      bins[clamp(Math.floor(result.sim.v[i] * bins.length / 0.55), 0, bins.length - 1)] += 1;
    }
    var maxBin = Math.max.apply(null, bins.concat([1]));
    var left = x + 34;
    var right = x + w - 22;
    var top = y + 62;
    var bottom = y + h - 38;
    var barW = (right - left) / bins.length;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    bins.forEach(function (count, index) {
      var bh = (bottom - top) * count / maxBin;
      var t = index / (bins.length - 1);
      ctx.fillStyle = "rgba(124,58,237," + (0.18 + 0.70 * t).toFixed(3) + ")";
      ctx.fillRect(left + index * barW + 1, bottom - bh, Math.max(1, barW - 2), bh);
    });
    drawText(ctx, "low V", left, y + h - 13, 10, COLORS.muted, 650);
    drawText(ctx, "high V", right, y + h - 13, 10, COLORS.muted, 650, "right");
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 14;
    var gap = 14;

    if (width < 680) {
      var panelH = (height - 2 * pad - 3 * gap) / 4;
      drawField(ctx, result, pad, pad, width - 2 * pad, panelH);
      drawTrace(ctx, result, pad, pad + panelH + gap, width - 2 * pad, panelH);
      drawMap(ctx, result, pad, pad + 2 * (panelH + gap), width - 2 * pad, panelH);
      drawHistogram(ctx, result, pad, pad + 3 * (panelH + gap), width - 2 * pad, panelH);
      return;
    }

    var halfW = (width - 2 * pad - gap) / 2;
    var halfH = (height - 2 * pad - gap) / 2;
    drawField(ctx, result, pad, pad, halfW, halfH);
    drawTrace(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawMap(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawHistogram(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function initOne(container) {
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      var params = readState(container);
      updateOutputs(container, params);
      latest = evaluate({
        diffusion: params.diffusion * 100,
        feed: params.feed * 1000,
        kill: params.kill * 1000,
        seed: params.seed,
        size: params.size * 100,
        steps: params.steps
      });
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 30);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-reaction-diffusion-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    makeInitialState: makeInitialState,
    simulate: simulate,
    summarize: summarize
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ReactionDiffusionLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
