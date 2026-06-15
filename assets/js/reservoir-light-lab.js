(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e8eef4",
    panel: "#f8fafc",
    white: "#ffffff",
    trueLine: "#172026",
    uniform: "#be123c",
    power: "#b45309",
    ris: "#2563eb",
    temporal: "#0f766e",
    light: "#f59e0b",
    blocker: "#334155",
    pixel: "#8b5cf6"
  };

  var DEFAULTS = {
    lights: 192,
    candidates: 6,
    frames: 28,
    skew: 62,
    occlusion: 42,
    pixel: 54,
    seed: 17
  };

  var PIXELS = 64;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      lights: clamp(Math.round(number(raw, "lights")), 32, 512),
      candidates: clamp(Math.round(number(raw, "candidates")), 1, 28),
      frames: clamp(Math.round(number(raw, "frames")), 1, 96),
      skew: clamp(Math.round(number(raw, "skew")), 0, 100),
      occlusion: clamp(Math.round(number(raw, "occlusion")), 0, 80),
      pixel: clamp(Math.round(number(raw, "pixel")), 1, 100),
      seed: clamp(Math.round(number(raw, "seed")), 1, 9999)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    var d = digits == null ? 3 : digits;
    if (value === 0) return value.toFixed(d);
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 10) return value.toFixed(2);
    if (Math.abs(value) >= 1) return value.toFixed(d);
    if (Math.abs(value) >= 0.01) return value.toFixed(d + 1);
    return value.toExponential(2);
  }

  function metric(label, value) {
    return '<div class="reservoir-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = Math.max(1e-9, rand());
    var v = Math.max(1e-9, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function makeLights(params) {
    var rand = rng(1009 + params.seed * 97 + params.lights * 13 + params.skew * 31);
    var sigma = 0.35 + 1.1 * params.skew / 100;
    var lights = [];
    for (var i = 0; i < params.lights; i += 1) {
      var x = -0.18 + 1.36 * rand();
      var y = 0.16 + 0.98 * Math.pow(rand(), 0.72);
      var power = Math.exp(sigma * normal(rand));
      if (i < Math.max(2, Math.round(params.lights * 0.025))) {
        power *= 4.5 + 5.5 * rand() * params.skew / 100;
      }
      lights.push({
        id: i,
        x: x,
        y: y,
        power: power,
        radius: 2.5 + 5.5 * Math.sqrt(power / (1 + power))
      });
    }
    return lights;
  }

  function makeBlockers(params) {
    var count = Math.round(params.occlusion / 10);
    var rand = rng(5903 + params.seed * 53 + params.occlusion * 11);
    var blockers = [];
    for (var i = 0; i < count; i += 1) {
      var center = (i + 0.5) / Math.max(1, count);
      var jitter = (rand() - 0.5) * 0.08;
      var w = 0.016 + 0.024 * rand();
      var h = 0.20 + 0.52 * rand();
      var x = clamp(center + jitter, 0.06, 0.94) - w / 2;
      blockers.push({ x0: x, x1: x + w, y0: 0.035, y1: 0.035 + h });
    }
    return blockers;
  }

  function segmentIntersectsRect(x0, y0, x1, y1, rect) {
    var t0 = 0;
    var t1 = 1;
    var dx = x1 - x0;
    var dy = y1 - y0;

    function clip(p, q) {
      if (p === 0) return q >= 0;
      var r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    }

    return clip(-dx, x0 - rect.x0) &&
      clip(dx, rect.x1 - x0) &&
      clip(-dy, y0 - rect.y0) &&
      clip(dy, rect.y1 - y0) &&
      t1 > 1e-5 &&
      t0 < 1 - 1e-5;
  }

  function visible(px, light, blockers) {
    for (var i = 0; i < blockers.length; i += 1) {
      if (segmentIntersectsRect(px, 0, light.x, light.y, blockers[i])) return false;
    }
    return true;
  }

  function contribution(px, light, blockers) {
    if (!visible(px, light, blockers)) return 0;
    var dx = light.x - px;
    var dy = light.y;
    var d2 = dx * dx + dy * dy + 0.0025;
    var cos = dy / Math.sqrt(d2);
    return light.power * Math.max(0, cos) / (0.035 + d2);
  }

  function cdfFromWeights(weights) {
    var total = 0;
    var cdf = [];
    for (var i = 0; i < weights.length; i += 1) total += Math.max(0, weights[i]);
    var acc = 0;
    for (i = 0; i < weights.length; i += 1) {
      acc += Math.max(0, weights[i]) / total;
      cdf.push(acc);
    }
    cdf[cdf.length - 1] = 1;
    return { cdf: cdf, total: total };
  }

  function sampleCdf(cdf, rand) {
    var u = rand();
    var lo = 0;
    var hi = cdf.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (u <= cdf[mid]) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  function weightedReservoirUpdate(reservoir, item, weight, rand) {
    if (!(weight > 0)) return reservoir;
    reservoir.sum += weight;
    reservoir.count += 1;
    if (rand() < weight / reservoir.sum) reservoir.item = item;
    return reservoir;
  }

  function precompute(params) {
    var lights = makeLights(params);
    var blockers = makeBlockers(params);
    var powerWeights = lights.map(function (light) { return light.power; });
    var powerCdf = cdfFromWeights(powerWeights);
    var pixels = [];
    var matrix = [];
    var truth = [];
    for (var p = 0; p < PIXELS; p += 1) {
      var x = (p + 0.5) / PIXELS;
      pixels.push(x);
      var row = [];
      var sum = 0;
      for (var i = 0; i < lights.length; i += 1) {
        var value = contribution(x, lights[i], blockers);
        row.push(value);
        sum += value;
      }
      matrix.push(row);
      truth.push(sum);
    }
    return { lights: lights, blockers: blockers, pixels: pixels, matrix: matrix, truth: truth, powerCdf: powerCdf };
  }

  function rmse(estimate, truth) {
    var sum = 0;
    for (var i = 0; i < truth.length; i += 1) {
      var d = estimate[i] - truth[i];
      sum += d * d;
    }
    return Math.sqrt(sum / truth.length);
  }

  function sampleUniformEstimate(row, rand) {
    var index = Math.floor(rand() * row.length);
    return { estimate: row[index] * row.length, selected: index };
  }

  function samplePowerEstimate(row, powerCdf, rand) {
    var index = sampleCdf(powerCdf.cdf, rand);
    var q = Math.max(1e-12, powerCdf.cdf[index] - (index ? powerCdf.cdf[index - 1] : 0));
    return { estimate: row[index] / q, selected: index };
  }

  function sampleRisEstimate(row, powerCdf, candidates, rand) {
    var reservoir = { item: -1, sum: 0, count: 0 };
    for (var c = 0; c < candidates; c += 1) {
      var index = sampleCdf(powerCdf.cdf, rand);
      var q = Math.max(1e-12, powerCdf.cdf[index] - (index ? powerCdf.cdf[index - 1] : 0));
      weightedReservoirUpdate(reservoir, index, row[index] / q, rand);
    }
    return { estimate: reservoir.sum / candidates, selected: reservoir.item, weightSum: reservoir.sum };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var model = precompute(params);
    var rand = rng(8128 + params.seed * 101 + params.frames * 17 + params.candidates * 29);
    var temporalSum = new Array(PIXELS).fill(0);
    var temporalCount = new Array(PIXELS).fill(0);
    var temporalReservoirs = [];
    var selectedPixel = clamp(Math.round((params.pixel - 1) / 99 * (PIXELS - 1)), 0, PIXELS - 1);
    for (var p = 0; p < PIXELS; p += 1) temporalReservoirs.push({ item: -1, sum: 0, count: 0 });

    var estimates = {
      uniform: new Array(PIXELS).fill(0),
      power: new Array(PIXELS).fill(0),
      ris: new Array(PIXELS).fill(0),
      temporal: new Array(PIXELS).fill(0)
    };
    var selected = { uniform: -1, power: -1, ris: -1, temporal: -1 };
    var history = [];

    for (var frame = 1; frame <= params.frames; frame += 1) {
      for (p = 0; p < PIXELS; p += 1) {
        var row = model.matrix[p];
        var u = sampleUniformEstimate(row, rand);
        var pw = samplePowerEstimate(row, model.powerCdf, rand);
        var ris = sampleRisEstimate(row, model.powerCdf, params.candidates, rand);
        var temporal = sampleRisEstimate(row, model.powerCdf, params.candidates, rand);
        estimates.uniform[p] = u.estimate;
        estimates.power[p] = pw.estimate;
        estimates.ris[p] = ris.estimate;
        temporalSum[p] += temporal.weightSum;
        temporalCount[p] += params.candidates;
        estimates.temporal[p] = temporalSum[p] / temporalCount[p];
        if (p === selectedPixel) {
          selected.uniform = u.selected;
          selected.power = pw.selected;
          selected.ris = ris.selected;
        }
        for (var c = 0; c < params.candidates; c += 1) {
          var index = sampleCdf(model.powerCdf.cdf, rand);
          var q = Math.max(1e-12, model.powerCdf.cdf[index] - (index ? model.powerCdf.cdf[index - 1] : 0));
          weightedReservoirUpdate(temporalReservoirs[p], index, row[index] / q, rand);
        }
      }
      selected.temporal = temporalReservoirs[selectedPixel].item;
      history.push({
        frame: frame,
        uniform: rmse(estimates.uniform, model.truth),
        power: rmse(estimates.power, model.truth),
        ris: rmse(estimates.ris, model.truth),
        temporal: rmse(estimates.temporal, model.truth)
      });
    }

    var audit = auditResult(params, model);
    return {
      params: params,
      model: model,
      estimates: estimates,
      selected: selected,
      selectedPixel: selectedPixel,
      history: history,
      audit: audit,
      summary: summarize(model, estimates, history, selectedPixel)
    };
  }

  function summarize(model, estimates, history, pixel) {
    var last = history[history.length - 1];
    var ris = last.ris;
    var temporal = last.temporal;
    return {
      truePixel: model.truth[pixel],
      uniformRmse: last.uniform,
      powerRmse: last.power,
      risRmse: ris,
      temporalRmse: temporal,
      noiseCut: ris > 0 ? ris / Math.max(1e-12, temporal) : 1
    };
  }

  function auditReservoirDistribution() {
    var weights = [1, 2, 5, 8];
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var counts = [0, 0, 0, 0];
    var rand = rng(421337);
    var trials = 18000;
    for (var t = 0; t < trials; t += 1) {
      var r = { item: -1, sum: 0, count: 0 };
      for (var i = 0; i < weights.length; i += 1) weightedReservoirUpdate(r, i, weights[i], rand);
      counts[r.item] += 1;
    }
    var maxErr = 0;
    for (i = 0; i < weights.length; i += 1) {
      maxErr = Math.max(maxErr, Math.abs(counts[i] / trials - weights[i] / total));
    }
    return maxErr < 0.018;
  }

  function auditEstimator(model, pixel, candidates) {
    var rand = rng(819221);
    var row = model.matrix[pixel];
    var truth = model.truth[pixel];
    if (!(truth > 0)) return true;
    var trials = 7000;
    var power = 0;
    var ris = 0;
    for (var t = 0; t < trials; t += 1) {
      power += samplePowerEstimate(row, model.powerCdf, rand).estimate;
      ris += sampleRisEstimate(row, model.powerCdf, candidates, rand).estimate;
    }
    var powerRel = Math.abs(power / trials - truth) / truth;
    var risRel = Math.abs(ris / trials - truth) / truth;
    return powerRel < 0.055 && risRel < 0.055;
  }

  function auditResult(params, model) {
    var finite = model.truth.every(Number.isFinite) &&
      model.truth.every(function (x) { return x >= 0; }) &&
      model.matrix.every(function (row) { return row.every(Number.isFinite); });
    var positive = model.truth.some(function (x) { return x > 0; });
    var reservoir = auditReservoirDistribution();
    var estimator = auditEstimator(model, clamp(Math.round((params.pixel - 1) / 99 * (PIXELS - 1)), 0, PIXELS - 1), params.candidates);
    var checks = {
      finite: finite,
      positiveLight: positive,
      reservoirDistribution: reservoir,
      unbiasedEstimator: estimator
    };
    return {
      checks: checks,
      passed: Object.keys(checks).every(function (key) { return checks[key]; })
    };
  }

  function setCanvasSize(canvas) {
    var cssWidth = Math.max(320, Math.floor(canvas.parentElement ? canvas.parentElement.clientWidth : canvas.clientWidth || 640));
    var height = cssWidth < 560 ? 1120 : 780;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);
    return { ctx: ctx, width: cssWidth, height: height };
  }

  function drawPanel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, box.x + 14, box.y + 22);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 40);
    }
  }

  function extent(values, pad) {
    var min = Infinity;
    var max = -Infinity;
    values.forEach(function (v) {
      if (!Number.isFinite(v)) return;
      min = Math.min(min, v);
      max = Math.max(max, v);
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
    if (min === max) max = min + 1;
    var extra = (max - min) * (pad == null ? 0.1 : pad);
    return { min: Math.max(0, min - extra), max: max + extra };
  }

  function scale(domain, range) {
    var span = domain.max - domain.min || 1;
    return function (value) {
      return range.min + (value - domain.min) / span * (range.max - range.min);
    };
  }

  function drawGrid(ctx, plot, xTicks, yTicks) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= xTicks; i += 1) {
      var x = plot.x + plot.w * i / xTicks;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    for (var j = 0; j <= yTicks; j += 1) {
      var y = plot.y + plot.h * j / yTicks;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawLine(ctx, data, plot, sx, sy, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    data.forEach(function (value, i) {
      var x = sx(i);
      var y = sy(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawScene(ctx, box, result) {
    drawPanel(ctx, box, "many-light scene", "one surface point sees a sparse set of useful lights");
    var plot = { x: box.x + 18, y: box.y + 58, w: box.w - 36, h: box.h - 86 };
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.grid;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);

    function sx(x) { return plot.x + x * plot.w; }
    function sy(y) { return plot.y + plot.h - y / 1.2 * plot.h; }

    result.model.blockers.forEach(function (b) {
      ctx.fillStyle = "rgba(51, 65, 85, 0.72)";
      ctx.fillRect(sx(b.x0), sy(b.y1), Math.max(2, (b.x1 - b.x0) * plot.w), (b.y1 - b.y0) / 1.2 * plot.h);
    });

    var pixelX = result.model.pixels[result.selectedPixel];
    ctx.strokeStyle = "rgba(139, 92, 246, 0.35)";
    ctx.lineWidth = 1.5;
    ["uniform", "power", "ris", "temporal"].forEach(function (kind) {
      var id = result.selected[kind];
      if (id < 0) return;
      var light = result.model.lights[id];
      ctx.strokeStyle = kind === "temporal" ? "rgba(15, 118, 110, 0.48)" : "rgba(37, 99, 235, 0.18)";
      ctx.beginPath();
      ctx.moveTo(sx(pixelX), sy(0));
      ctx.lineTo(sx(light.x), sy(light.y));
      ctx.stroke();
    });

    result.model.lights.forEach(function (light) {
      var x = sx(light.x);
      var y = sy(light.y);
      if (x < plot.x - 10 || x > plot.x + plot.w + 10) return;
      var r = clamp(light.radius, 2.5, 8.5);
      ctx.fillStyle = "rgba(245, 158, 11, 0.28)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "rgba(180, 83, 9, 0.65)";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.4, r * 0.38), 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.x, sy(0));
    ctx.lineTo(plot.x + plot.w, sy(0));
    ctx.stroke();
    ctx.fillStyle = COLORS.pixel;
    ctx.beginPath();
    ctx.arc(sx(pixelX), sy(0), 5.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("selected pixel", sx(pixelX) + 8, sy(0) - 8);
  }

  function drawEstimates(ctx, box, result) {
    drawPanel(ctx, box, "one-frame estimates", "truth, noisy samples, and reservoirs");
    var plot = { x: box.x + 46, y: box.y + 88, w: box.w - 66, h: box.h - 122 };
    var values = result.model.truth.concat(result.estimates.uniform, result.estimates.power, result.estimates.ris, result.estimates.temporal);
    var sy = scale(extent(values, 0.12), { min: plot.y + plot.h, max: plot.y });
    var sx = scale({ min: 0, max: PIXELS - 1 }, { min: plot.x, max: plot.x + plot.w });
    drawGrid(ctx, plot, 4, 4);
    drawLine(ctx, result.estimates.uniform, plot, sx, sy, COLORS.uniform, 1.6, [3, 4]);
    drawLine(ctx, result.estimates.power, plot, sx, sy, COLORS.power, 1.7, [5, 4]);
    drawLine(ctx, result.estimates.ris, plot, sx, sy, COLORS.ris, 1.9);
    drawLine(ctx, result.estimates.temporal, plot, sx, sy, COLORS.temporal, 2.2);
    drawLine(ctx, result.model.truth, plot, sx, sy, COLORS.trueLine, 2.5);
    ctx.strokeStyle = COLORS.pixel;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 4]);
    var px = sx(result.selectedPixel);
    ctx.beginPath();
    ctx.moveTo(px, plot.y);
    ctx.lineTo(px, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLegend(ctx, plot.x + 4, box.y + 60, [
      ["truth", COLORS.trueLine],
      ["RIS", COLORS.ris],
      ["temporal", COLORS.temporal],
      ["uniform", COLORS.uniform]
    ], plot.w - 8);
  }

  function drawHistory(ctx, box, result) {
    drawPanel(ctx, box, "variance over frames", "reuse averages candidate streams");
    var plot = { x: box.x + 50, y: box.y + 58, w: box.w - 72, h: box.h - 92 };
    var vals = [];
    result.history.forEach(function (h) { vals.push(h.uniform, h.power, h.ris, h.temporal); });
    var minPositive = vals.reduce(function (m, v) { return v > 0 ? Math.min(m, v) : m; }, Infinity);
    var domain = { min: Math.log10(Math.max(1e-6, minPositive * 0.75)), max: Math.log10(Math.max.apply(null, vals) * 1.2) };
    var sy = scale(domain, { min: plot.y + plot.h, max: plot.y });
    var sx = scale({ min: 1, max: result.params.frames }, { min: plot.x, max: plot.x + plot.w });
    drawGrid(ctx, plot, 4, 4);
    function series(key) {
      return result.history.map(function (h) { return Math.log10(Math.max(1e-9, h[key])); });
    }
    drawLine(ctx, series("uniform"), plot, function (i) { return sx(i + 1); }, sy, COLORS.uniform, 1.5, [3, 4]);
    drawLine(ctx, series("power"), plot, function (i) { return sx(i + 1); }, sy, COLORS.power, 1.7, [5, 4]);
    drawLine(ctx, series("ris"), plot, function (i) { return sx(i + 1); }, sy, COLORS.ris, 2);
    drawLine(ctx, series("temporal"), plot, function (i) { return sx(i + 1); }, sy, COLORS.temporal, 2.2);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("log10 RMSE", plot.x, box.y + box.h - 17);
  }

  function drawWeights(ctx, box, result) {
    drawPanel(ctx, box, "selected pixel ledger", "green target versus amber proposal");
    var plot = { x: box.x + 46, y: box.y + 58, w: box.w - 68, h: box.h - 92 };
    var row = result.model.matrix[result.selectedPixel];
    var items = row.map(function (value, i) {
      var q = result.model.powerCdf.cdf[i] - (i ? result.model.powerCdf.cdf[i - 1] : 0);
      return { id: i, target: value, proposal: q * result.summary.truePixel };
    }).sort(function (a, b) { return b.target - a.target; }).slice(0, 16);
    var maxValue = Math.max.apply(null, items.map(function (d) { return Math.max(d.target, d.proposal); }).concat([1e-9]));
    var barH = plot.h / items.length;
    ctx.strokeStyle = COLORS.grid;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    items.forEach(function (d, i) {
      var y = plot.y + i * barH + 2;
      var targetW = plot.w * d.target / maxValue;
      var proposalW = plot.w * d.proposal / maxValue;
      ctx.fillStyle = "rgba(180, 83, 9, 0.22)";
      ctx.fillRect(plot.x, y + barH * 0.52, proposalW, Math.max(2, barH * 0.26));
      ctx.fillStyle = "rgba(15, 118, 110, 0.78)";
      ctx.fillRect(plot.x, y + barH * 0.12, targetW, Math.max(2, barH * 0.34));
      if (d.id === result.selected.temporal || d.id === result.selected.ris) {
        ctx.strokeStyle = COLORS.pixel;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(plot.x - 2, y + 1, plot.w + 4, barH - 3);
      }
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("green target; amber proposal", plot.x, box.y + box.h - 17);
  }

  function drawLegend(ctx, x, y, items, maxWidth) {
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    var offset = 0;
    var row = 0;
    items.forEach(function (item) {
      var itemWidth = Math.max(76, ctx.measureText(item[0]).width + 50);
      if (maxWidth && offset > 0 && offset + itemWidth > maxWidth) {
        offset = 0;
        row += 1;
      }
      var baseY = y + row * 16;
      ctx.strokeStyle = item[1];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + offset, baseY - 4);
      ctx.lineTo(x + offset + 18, baseY - 4);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(item[0], x + offset + 23, baseY);
      offset += itemWidth;
    });
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, frame.width, frame.height);
    var pad = 14;
    if (frame.width < 560) {
      drawScene(ctx, { x: pad, y: pad, w: frame.width - pad * 2, h: 260 }, result);
      drawEstimates(ctx, { x: pad, y: 290, w: frame.width - pad * 2, h: 278 }, result);
      drawHistory(ctx, { x: pad, y: 584, w: frame.width - pad * 2, h: 250 }, result);
      drawWeights(ctx, { x: pad, y: 850, w: frame.width - pad * 2, h: 254 }, result);
    } else {
      var col = (frame.width - pad * 3) / 2;
      drawScene(ctx, { x: pad, y: pad, w: col, h: 376 }, result);
      drawEstimates(ctx, { x: pad * 2 + col, y: pad, w: col, h: 376 }, result);
      drawHistory(ctx, { x: pad, y: 410, w: col, h: 354 }, result);
      drawWeights(ctx, { x: pad * 2 + col, y: 410, w: col, h: 354 }, result);
    }
  }

  function syncOutputs(root, result) {
    var values = {
      lights: result.params.lights,
      candidates: result.params.candidates,
      frames: result.params.frames,
      skew: result.params.skew + "%",
      occlusion: result.params.occlusion + "%",
      pixel: result.params.pixel,
      seed: result.params.seed
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = String(values[key]);
    });
  }

  function renderMetrics(root, result) {
    var node = root.querySelector("[data-metrics]");
    if (!node) return;
    node.innerHTML = [
      metric("True at pixel", fmt(result.summary.truePixel, 3)),
      metric("Uniform RMSE", fmt(result.summary.uniformRmse, 3)),
      metric("RIS RMSE", fmt(result.summary.risRmse, 3)),
      metric("Temporal RMSE", fmt(result.summary.temporalRmse, 3)),
      metric("Noise cut", fmt(result.summary.noiseCut, 2) + "x"),
      metric("Audit", result.audit.passed ? "passed" : "check")
    ].join("");
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__reservoirLightResult = result;
  }

  function init(root) {
    if (!root || root.__reservoirLightReady) return;
    root.__reservoirLightReady = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    var timer = null;
    global.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { render(root); }, 120);
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-reservoir-light-lab]").forEach(init);
  }

  var api = {
    auditResult: auditResult,
    cleanParams: cleanParams,
    contribution: contribution,
    evaluate: evaluate,
    makeLights: makeLights,
    precompute: precompute,
    sampleRisEstimate: sampleRisEstimate,
    weightedReservoirUpdate: weightedReservoirUpdate,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ReservoirLightLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
