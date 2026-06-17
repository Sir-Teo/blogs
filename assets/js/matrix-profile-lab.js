(function (global) {
  "use strict";

  var COLORS = {
    anomaly: "#be123c",
    dark: "#0f172a",
    grid: "#e6edf3",
    motifA: "#2563eb",
    motifB: "#0f766e",
    muted: "#5d6872",
    panel: "#f8fafc",
    purple: "#7c3aed",
    rule: "#d7dee5",
    signal: "#172026",
    text: "#172026",
    trueMark: "#f59e0b",
    white: "#ffffff"
  };

  var DEFAULTS = {
    contrast: 45,
    mode: "znorm",
    noise: 14,
    scenario: "valve",
    seed: 41,
    window: 44
  };

  var MODES = {
    raw: "raw Euclidean",
    znorm: "z-normalized"
  };

  var SCENARIOS = {
    drift: "motifs under drift",
    pulse: "bursty sensor",
    valve: "scaled valve cycle"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      contrast: Math.round(clamp(finite(Number(raw.contrast), DEFAULTS.contrast), 0, 80)),
      mode: MODES[raw.mode] ? raw.mode : DEFAULTS.mode,
      noise: Math.round(clamp(finite(Number(raw.noise), DEFAULTS.noise), 0, 35)),
      scenario: SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      window: Math.round(clamp(finite(Number(raw.window), DEFAULTS.window), 24, 76))
    };
  }

  function makeRng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rng) {
    var u1 = Math.max(1e-12, rng());
    var u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function motifShape(t, scenario) {
    var x = clamp(t, 0, 1);
    if (scenario === "pulse") {
      var rise = Math.exp(-120 * (x - 0.28) * (x - 0.28));
      var rebound = Math.exp(-70 * (x - 0.62) * (x - 0.62));
      return 1.35 * rise - 0.82 * rebound + 0.18 * Math.sin(4 * Math.PI * x);
    }
    if (scenario === "drift") {
      return 0.82 * Math.sin(2 * Math.PI * x) + 0.56 * Math.sin(4 * Math.PI * x + 0.4) - 0.7 * (x - 0.5);
    }
    var open = Math.exp(-85 * (x - 0.24) * (x - 0.24));
    var close = Math.exp(-95 * (x - 0.72) * (x - 0.72));
    return 1.1 * open - 0.92 * close + 0.28 * Math.sin(2 * Math.PI * x + 0.2);
  }

  function addMotif(series, start, width, gain, offset, scenario) {
    for (var k = 0; k < width; k += 1) {
      var t = k / Math.max(1, width - 1);
      var taper = Math.sin(Math.PI * t);
      series[start + k] += offset + gain * taper * motifShape(t, scenario);
    }
  }

  function makeSeries(params) {
    var n = 320;
    var rng = makeRng(params.seed * 7919 + params.window * 101);
    var series = new Array(n);
    var i;
    for (i = 0; i < n; i += 1) {
      var t = i / n;
      var seasonal = 0.35 * Math.sin(2 * Math.PI * (2.1 * t + 0.08)) + 0.18 * Math.sin(2 * Math.PI * (6.3 * t + 0.21));
      var drift = 0;
      if (params.scenario === "drift") drift = 1.25 * (t - 0.48) + 0.28 * Math.sin(2 * Math.PI * t);
      if (params.scenario === "pulse") drift = 0.24 * Math.sin(2 * Math.PI * 0.8 * t) - 0.2 * (t - 0.5);
      if (params.scenario === "valve") drift = 0.42 * Math.sin(2 * Math.PI * 0.55 * t);
      series[i] = seasonal + drift + (params.noise / 100) * normal(rng);
    }

    var starts;
    if (params.scenario === "drift") starts = [52, 168, 248];
    else if (params.scenario === "pulse") starts = [38, 136, 234];
    else starts = [64, 174, 254];

    var c = params.contrast / 100;
    addMotif(series, starts[0], params.window, 1.0 + 0.25 * c, -0.1, params.scenario);
    addMotif(series, starts[1], params.window, 0.58 + 0.1 * c, 0.84 * c, params.scenario);
    addMotif(series, starts[2], params.window, 0.84 + 0.08 * c, -0.56 * c, params.scenario);

    var discordStart = params.scenario === "pulse" ? 280 : 28;
    var discordWidth = Math.max(12, Math.round(params.window * 0.62));
    for (i = 0; i < discordWidth && discordStart + i < n; i += 1) {
      var u = i / Math.max(1, discordWidth - 1);
      var shock = Math.sin(Math.PI * u) * (1.3 + 0.7 * c);
      series[discordStart + i] += shock * (params.scenario === "drift" ? -1 : 1);
    }

    return {
      discordStart: discordStart,
      motifStarts: starts,
      series: series
    };
  }

  function prefixStats(series) {
    var sum = new Array(series.length + 1);
    var sumsq = new Array(series.length + 1);
    sum[0] = 0;
    sumsq[0] = 0;
    for (var i = 0; i < series.length; i += 1) {
      sum[i + 1] = sum[i] + series[i];
      sumsq[i + 1] = sumsq[i] + series[i] * series[i];
    }
    return { sum: sum, sumsq: sumsq };
  }

  function windowMoments(stats, start, width) {
    var s = stats.sum[start + width] - stats.sum[start];
    var ss = stats.sumsq[start + width] - stats.sumsq[start];
    var mean = s / width;
    var variance = Math.max(0, ss / width - mean * mean);
    return { mean: mean, stdev: Math.sqrt(variance) };
  }

  function distance(series, moments, i, j, width, mode) {
    var sum = 0;
    var ai = moments[i];
    var bj = moments[j];
    var denomA = ai.stdev > 1e-8 ? ai.stdev : 1;
    var denomB = bj.stdev > 1e-8 ? bj.stdev : 1;
    for (var k = 0; k < width; k += 1) {
      var a = series[i + k];
      var b = series[j + k];
      if (mode === "znorm") {
        a = (a - ai.mean) / denomA;
        b = (b - bj.mean) / denomB;
      }
      var d = a - b;
      sum += d * d;
    }
    return Math.sqrt(sum / width);
  }

  function computeMatrixProfile(series, width, mode) {
    var count = series.length - width + 1;
    var stats = prefixStats(series);
    var moments = new Array(count);
    var profile = new Array(count);
    var neighbor = new Array(count);
    var i;
    for (i = 0; i < count; i += 1) {
      moments[i] = windowMoments(stats, i, width);
      profile[i] = Infinity;
      neighbor[i] = -1;
    }

    var exclusion = Math.max(1, Math.floor(width / 4));
    var rows = [];
    for (i = 0; i < count; i += 1) {
      var row = new Array(count);
      for (var z = 0; z < count; z += 1) row[z] = Infinity;
      rows[i] = row;
    }

    for (i = 0; i < count; i += 1) {
      for (var j = i + exclusion + 1; j < count; j += 1) {
        var d = distance(series, moments, i, j, width, mode);
        rows[i][j] = d;
        rows[j][i] = d;
        if (d < profile[i]) {
          profile[i] = d;
          neighbor[i] = j;
        }
        if (d < profile[j]) {
          profile[j] = d;
          neighbor[j] = i;
        }
      }
    }

    var motif = 0;
    var discord = 0;
    for (i = 0; i < count; i += 1) {
      if (profile[i] < profile[motif]) motif = i;
      if (profile[i] > profile[discord] && profile[i] < Infinity) discord = i;
    }

    return {
      count: count,
      discord: discord,
      distances: rows,
      exclusion: exclusion,
      mode: mode,
      motif: motif,
      neighbor: neighbor,
      profile: profile,
      width: width
    };
  }

  function nearAny(value, starts, tolerance) {
    for (var i = 0; i < starts.length; i += 1) {
      if (Math.abs(value - starts[i]) <= tolerance) return true;
    }
    return false;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var generated = makeSeries(params);
    var mp = computeMatrixProfile(generated.series, params.window, params.mode);
    var motifMate = mp.neighbor[mp.motif];
    var hitTolerance = Math.max(6, Math.round(params.window * 0.35));
    var motifHit = nearAny(mp.motif, generated.motifStarts, hitTolerance) && nearAny(motifMate, generated.motifStarts, hitTolerance);
    return {
      discordDistance: mp.profile[mp.discord],
      generated: generated,
      matrixProfile: mp,
      motifDistance: mp.profile[mp.motif],
      motifHit: motifHit,
      motifMate: motifMate,
      params: params
    };
  }

  function audit() {
    var defaultRun = evaluate(DEFAULTS);
    var rawRun = evaluate(Object.assign({}, DEFAULTS, { mode: "raw" }));
    var wideWindow = evaluate(Object.assign({}, DEFAULTS, { window: 68 }));
    return {
      defaultDiscordDistance: Number(defaultRun.discordDistance.toFixed(3)),
      defaultMotifDistance: Number(defaultRun.motifDistance.toFixed(3)),
      defaultMotifHit: defaultRun.motifHit,
      rawMotifDistance: Number(rawRun.motifDistance.toFixed(3)),
      rawMotifHit: rawRun.motifHit,
      wideWindowMotifHit: wideWindow.motifHit
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
    return Number(value).toFixed(digits);
  }

  function setOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "noise" || key === "contrast") value = value + "%";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var metrics = root.querySelector("[data-metrics]");
    if (!metrics) return;
    var mp = result.matrixProfile;
    var mate = result.motifMate;
    var rows = [
      ["motif distance", fmt(result.motifDistance, 3)],
      ["motif starts", result.matrixProfile.motif + " / " + mate],
      ["motif hit", result.motifHit ? "yes" : "no"],
      ["discord start", String(mp.discord)],
      ["discord/motif", fmt(result.discordDistance / Math.max(1e-9, result.motifDistance), 1) + "x"],
      ["subsequences", String(mp.count)]
    ];
    metrics.innerHTML = rows.map(function (row) {
      return '<div class="mp-lab__metric"><span>' + row[0] + '</span><strong>' + row[1] + "</strong></div>";
    }).join("");
  }

  function clear(ctx) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, x + 14, y + 23);
  }

  function range(values) {
    var min = Infinity;
    var max = -Infinity;
    values.forEach(function (value) {
      if (value < min) min = value;
      if (value > max) max = value;
    });
    if (Math.abs(max - min) < 1e-9) {
      min -= 1;
      max += 1;
    }
    return { min: min, max: max };
  }

  function drawGrid(ctx, x, y, w, h, rows) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 1; i < rows; i += 1) {
      var yy = y + h * i / rows;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }
  }

  function drawSeries(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "time series and selected subsequences");
    var pad = { l: 20, r: 16, t: 38, b: 26 };
    var px = x + pad.l;
    var py = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var series = result.generated.series;
    var r = range(series);
    drawGrid(ctx, px, py, pw, ph, 4);

    function sx(i) { return px + pw * i / (series.length - 1); }
    function sy(v) { return py + ph - ph * (v - r.min) / (r.max - r.min); }

    function shade(start, width, color, alpha) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(sx(start), py, Math.max(2, sx(start + width) - sx(start)), ph);
      ctx.globalAlpha = 1;
    }

    result.generated.motifStarts.forEach(function (start) {
      shade(start, result.params.window, COLORS.trueMark, 0.12);
    });
    shade(result.matrixProfile.motif, result.params.window, COLORS.motifA, 0.16);
    shade(result.motifMate, result.params.window, COLORS.motifB, 0.16);
    shade(result.matrixProfile.discord, result.params.window, COLORS.anomaly, 0.12);

    ctx.strokeStyle = COLORS.signal;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    for (var i = 0; i < series.length; i += 1) {
      var xx = sx(i);
      var yy = sy(series[i]);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("gold bands are injected repeats; blue/green are the discovered nearest pair", px, y + h - 8);
  }

  function drawProfile(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "matrix profile");
    var pad = { l: 36, r: 16, t: 38, b: 28 };
    var px = x + pad.l;
    var py = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var values = result.matrixProfile.profile.filter(Number.isFinite);
    var r = range(values);
    r.min = Math.min(0, r.min);
    drawGrid(ctx, px, py, pw, ph, 4);

    function sx(i) { return px + pw * i / (result.matrixProfile.profile.length - 1); }
    function sy(v) { return py + ph - ph * (v - r.min) / (r.max - r.min); }

    ctx.strokeStyle = COLORS.purple;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.matrixProfile.profile.forEach(function (value, i) {
      var xx = sx(i);
      var yy = sy(value);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    function dot(index, color, label) {
      var xx = sx(index);
      var yy = sy(result.matrixProfile.profile[index]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(xx, yy, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = COLORS.text;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(label, xx + 7, yy - 6);
    }
    dot(result.matrixProfile.motif, COLORS.motifA, "motif");
    dot(result.matrixProfile.discord, COLORS.anomaly, "discord");

    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("low means repeated; high means isolated", px, y + h - 8);
  }

  function drawDistanceProfile(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "distance profile from motif query");
    var pad = { l: 34, r: 16, t: 38, b: 28 };
    var px = x + pad.l;
    var py = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var query = result.matrixProfile.motif;
    var row = result.matrixProfile.distances[query];
    var finiteValues = row.filter(Number.isFinite);
    var r = range(finiteValues);
    r.min = 0;

    function sx(i) { return px + pw * i / (row.length - 1); }
    function sy(v) { return py + ph - ph * (v - r.min) / (r.max - r.min); }

    drawGrid(ctx, px, py, pw, ph, 4);
    ctx.fillStyle = "rgba(100, 116, 139, 0.16)";
    ctx.fillRect(sx(Math.max(0, query - result.matrixProfile.exclusion)), py, Math.max(2, sx(Math.min(row.length - 1, query + result.matrixProfile.exclusion)) - sx(Math.max(0, query - result.matrixProfile.exclusion))), ph);

    ctx.strokeStyle = COLORS.motifA;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    var started = false;
    row.forEach(function (value, i) {
      if (!Number.isFinite(value)) return;
      var xx = sx(i);
      var yy = sy(value);
      if (!started) {
        ctx.moveTo(xx, yy);
        started = true;
      } else {
        ctx.lineTo(xx, yy);
      }
    });
    ctx.stroke();

    var mate = result.motifMate;
    ctx.fillStyle = COLORS.motifB;
    ctx.beginPath();
    ctx.arc(sx(mate), sy(row[mate]), 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("gray band is the self-match exclusion zone", px, y + h - 8);
  }

  function drawHeatmap(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "all-pairs distance sketch");
    var pad = { l: 16, r: 16, t: 38, b: 18 };
    var px = x + pad.l;
    var py = y + pad.t;
    var size = Math.min(w - pad.l - pad.r, h - pad.t - pad.b);
    var rows = result.matrixProfile.distances;
    var count = rows.length;
    var bins = 72;
    var finiteValues = [];
    for (var i = 0; i < count; i += 1) {
      for (var j = 0; j < count; j += 1) {
        if (Number.isFinite(rows[i][j])) finiteValues.push(rows[i][j]);
      }
    }
    var r = range(finiteValues);
    var cell = size / bins;
    for (var by = 0; by < bins; by += 1) {
      for (var bx = 0; bx < bins; bx += 1) {
        var ii = Math.floor((by + 0.5) * count / bins);
        var jj = Math.floor((bx + 0.5) * count / bins);
        var value = rows[ii][jj];
        if (!Number.isFinite(value)) {
          ctx.fillStyle = "#e2e8f0";
        } else {
          var t = clamp((value - r.min) / (r.max - r.min), 0, 1);
          var red = Math.round(30 + 190 * t);
          var green = Math.round(100 + 50 * (1 - t));
          var blue = Math.round(150 + 50 * (1 - t));
          ctx.fillStyle = "rgb(" + red + "," + green + "," + blue + ")";
        }
        ctx.fillRect(px + bx * cell, py + by * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    function mark(a, b, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + size * a / count - 4, py + size * b / count - 4, 8, 8);
      ctx.strokeRect(px + size * b / count - 4, py + size * a / count - 4, 8, 8);
    }
    mark(result.matrixProfile.motif, result.motifMate, COLORS.white);
    mark(result.matrixProfile.discord, result.matrixProfile.neighbor[result.matrixProfile.discord], COLORS.anomaly);
  }

  function drawOverlay(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "motif pair overlay");
    var pad = { l: 34, r: 16, t: 38, b: 28 };
    var px = x + pad.l;
    var py = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var width = result.params.window;
    var starts = [result.matrixProfile.motif, result.motifMate];
    var all = [];
    starts.forEach(function (start) {
      for (var k = 0; k < width; k += 1) all.push(result.generated.series[start + k]);
    });
    var r = range(all);
    drawGrid(ctx, px, py, pw, ph, 4);

    function drawOne(start, color) {
      var moments = windowMoments(prefixStats(result.generated.series), start, width);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (var k = 0; k < width; k += 1) {
        var raw = result.generated.series[start + k];
        var value = result.params.mode === "znorm" ? (raw - moments.mean) / Math.max(1e-8, moments.stdev) : raw;
        var localRange = result.params.mode === "znorm" ? { min: -2.4, max: 2.4 } : r;
        var xx = px + pw * k / (width - 1);
        var yy = py + ph - ph * (value - localRange.min) / (localRange.max - localRange.min);
        if (k === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }

    drawOne(starts[0], COLORS.motifA);
    drawOne(starts[1], COLORS.motifB);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(result.params.mode === "znorm" ? "overlay is normalized before comparison" : "raw comparison keeps level and scale", px, y + h - 8);
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    clear(ctx);
    drawSeries(ctx, result, 18, 18, 884, 214);
    drawProfile(ctx, result, 18, 250, 422, 214);
    drawDistanceProfile(ctx, result, 464, 250, 438, 214);
    drawHeatmap(ctx, result, 18, 482, 286, 250);
    drawOverlay(ctx, result, 328, 482, 574, 250);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__matrixProfileLabResult = result;
  }

  function init(root) {
    if (!root || root.__matrixProfileLabInitialized) return;
    root.__matrixProfileLabInitialized = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function initAll() {
    document.querySelectorAll("[data-matrix-profile-lab]").forEach(init);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MatrixProfileLab = api;
})(typeof window !== "undefined" ? window : globalThis);
