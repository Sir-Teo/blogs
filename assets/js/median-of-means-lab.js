(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    mean: "#2563eb",
    trimmed: "#7c3aed",
    mom: "#0f766e",
    sample: "#94a3b8",
    outlier: "#b45309",
    bad: "#be123c"
  };

  var DEFAULTS = {
    scenario: "contaminated",
    n: 120,
    blocks: 9,
    trials: 900,
    seed: 31
  };

  var SCENARIOS = {
    gaussian: "Gaussian baseline",
    student: "Student t, 3 df",
    contaminated: "4% gross contamination",
    lognormal: "centered lognormal",
    pareto: "symmetric Pareto tail"
  };

  var METHODS = [
    { key: "mean", label: "sample mean", color: COLORS.mean },
    { key: "trimmed", label: "10% trimmed", color: COLORS.trimmed },
    { key: "mom", label: "median-of-means", color: COLORS.mom }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function nearestOdd(value) {
    value = Math.round(value);
    if (value % 2 === 0) value += 1;
    return value;
  }

  function normalize(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var n = Math.round(clamp(finite(Number(raw.n), DEFAULTS.n), 30, 360));
    var blocks = nearestOdd(clamp(finite(Number(raw.blocks), DEFAULTS.blocks), 3, Math.min(31, n)));
    blocks = clamp(blocks, 3, Math.min(31, n));
    if (blocks % 2 === 0) blocks -= 1;
    return {
      scenario: scenario,
      n: n,
      blocks: blocks,
      trials: Math.round(clamp(finite(Number(raw.trials), DEFAULTS.trials), 200, 2200)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 9999))
    };
  }

  function lcg(seed) {
    var state = seed >>> 0;
    return function () {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function studentT3(rand) {
    var z = normal(rand);
    var chi = 0;
    for (var i = 0; i < 3; i += 1) {
      var g = normal(rand);
      chi += g * g;
    }
    return z / Math.sqrt(chi / 3) / Math.sqrt(3);
  }

  function centeredLognormal(rand) {
    var sigma = 1.1;
    var mean = Math.exp(0.5 * sigma * sigma);
    var variance = (Math.exp(sigma * sigma) - 1) * Math.exp(sigma * sigma);
    return (Math.exp(sigma * normal(rand)) - mean) / Math.sqrt(variance);
  }

  function signedPareto(rand) {
    var alpha = 1.7;
    var mag = Math.pow(Math.max(1e-12, 1 - rand()), -1 / alpha);
    return (rand() < 0.5 ? -1 : 1) * mag;
  }

  function drawValue(params, rand) {
    if (params.scenario === "gaussian") return normal(rand);
    if (params.scenario === "student") return studentT3(rand);
    if (params.scenario === "lognormal") return centeredLognormal(rand);
    if (params.scenario === "pareto") return signedPareto(rand);
    if (rand() < 0.04) return 60 * normal(rand);
    return normal(rand);
  }

  function drawSample(params, rand) {
    var values = [];
    for (var i = 0; i < params.n; i += 1) values.push(drawValue(params, rand));
    return values;
  }

  function mean(values) {
    var total = 0;
    for (var i = 0; i < values.length; i += 1) total += values[i];
    return total / Math.max(1, values.length);
  }

  function median(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return 0.5 * (sorted[mid - 1] + sorted[mid]);
  }

  function trimmedMean(values, trimEachTail) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var cut = Math.floor(sorted.length * trimEachTail);
    var kept = sorted.slice(cut, sorted.length - cut);
    return mean(kept.length ? kept : sorted);
  }

  function blockMeans(values, blocks) {
    var out = [];
    for (var b = 0; b < blocks; b += 1) {
      var start = Math.floor(b * values.length / blocks);
      var end = Math.floor((b + 1) * values.length / blocks);
      out.push(mean(values.slice(start, end)));
    }
    return out;
  }

  function medianOfMeans(values, blocks) {
    return median(blockMeans(values, blocks));
  }

  function estimators(values, blocks) {
    return {
      mean: mean(values),
      trimmed: trimmedMean(values, 0.10),
      mom: medianOfMeans(values, blocks)
    };
  }

  function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    var idx = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
    var lo = Math.floor(idx);
    var hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
  }

  function summarize(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var sq = 0;
    for (var i = 0; i < values.length; i += 1) sq += values[i] * values[i];
    return {
      q50: quantile(sorted, 0.50),
      q80: quantile(sorted, 0.80),
      q90: quantile(sorted, 0.90),
      q95: quantile(sorted, 0.95),
      max: sorted[sorted.length - 1],
      rmse: Math.sqrt(sq / Math.max(1, values.length))
    };
  }

  function histogram(values, min, max, bins) {
    var counts = [];
    for (var i = 0; i < bins; i += 1) counts[i] = 0;
    values.forEach(function (value) {
      var idx = Math.floor((value - min) / Math.max(1e-12, max - min) * bins);
      idx = clamp(idx, 0, bins - 1);
      counts[idx] += 1;
    });
    return counts;
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var rand = lcg(0xBADC0DE ^ Math.imul(params.seed, 1009) ^ Math.imul(params.n, 17) ^ Math.imul(params.blocks, 31) ^ Math.imul(params.trials, 43));
    var first = drawSample(params, rand);
    var firstEstimates = estimators(first, params.blocks);
    var firstBlocks = blockMeans(first, params.blocks);
    var estimates = { mean: [], trimmed: [], mom: [] };
    var errors = { mean: [], trimmed: [], mom: [] };
    for (var t = 0; t < params.trials; t += 1) {
      var sample = drawSample(params, rand);
      var est = estimators(sample, params.blocks);
      METHODS.forEach(function (method) {
        estimates[method.key].push(est[method.key]);
        errors[method.key].push(Math.abs(est[method.key]));
      });
    }
    var summary = {};
    METHODS.forEach(function (method) {
      summary[method.key] = summarize(errors[method.key]);
    });
    var allEstimates = estimates.mean.concat(estimates.trimmed, estimates.mom).sort(function (a, b) { return a - b; });
    var lo = quantile(allEstimates, 0.02);
    var hi = quantile(allEstimates, 0.98);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    var hist = {};
    METHODS.forEach(function (method) {
      hist[method.key] = histogram(estimates[method.key], lo, hi, 44);
    });
    var result = {
      params: params,
      first: {
        values: first,
        blocks: firstBlocks,
        estimates: firstEstimates
      },
      estimates: estimates,
      errors: errors,
      summary: summary,
      histogram: { min: lo, max: hi, bins: hist }
    };
    result.audit = audit(result);
    return result;
  }

  function audit(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var recomputedBlocks = blockMeans(result.first.values, result.params.blocks);
    var recomputedMom = median(recomputedBlocks);
    var contaminated = evaluateCore({ scenario: "contaminated", n: 120, blocks: 9, trials: 700, seed: 13 });
    var gaussian = evaluateCore({ scenario: "gaussian", n: 120, blocks: 9, trials: 700, seed: 17 });
    check("all summaries finite", METHODS.every(function (method) {
      var s = result.summary[method.key];
      return [s.q50, s.q80, s.q90, s.q95, s.max, s.rmse].every(Number.isFinite);
    }));
    check("median-of-means equals median block mean", Math.abs(result.first.estimates.mom - recomputedMom) < 1e-12);
    check("block count is respected", result.first.blocks.length === result.params.blocks);
    check("histograms have fixed bin count", METHODS.every(function (method) { return result.histogram.bins[method.key].length === 44; }));
    check("contamination favors MOM over sample mean in p95", contaminated.summary.mom.q95 < contaminated.summary.mean.q95 * 0.72);
    check("Gaussian mean remains competitive", gaussian.summary.mean.rmse <= gaussian.summary.mom.rmse * 1.25);
    check("trimmed estimator finite", Number.isFinite(result.first.estimates.trimmed));
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function evaluateCore(raw) {
    var params = normalize(raw);
    var rand = lcg(0xC001D00D ^ Math.imul(params.seed, 997) ^ Math.imul(params.n, 19) ^ Math.imul(params.blocks, 37) ^ Math.imul(params.trials, 41));
    var errors = { mean: [], trimmed: [], mom: [] };
    for (var t = 0; t < params.trials; t += 1) {
      var est = estimators(drawSample(params, rand), params.blocks);
      METHODS.forEach(function (method) { errors[method.key].push(Math.abs(est[method.key])); });
    }
    var summary = {};
    METHODS.forEach(function (method) { summary[method.key] = summarize(errors[method.key]); });
    return { params: params, summary: summary };
  }

  function auditGrid() {
    return [
      { scenario: "contaminated", n: 120, blocks: 9, trials: 900, seed: 31 },
      { scenario: "gaussian", n: 120, blocks: 9, trials: 800, seed: 7 },
      { scenario: "student", n: 180, blocks: 11, trials: 850, seed: 11 },
      { scenario: "lognormal", n: 150, blocks: 9, trials: 850, seed: 23 },
      { scenario: "pareto", n: 180, blocks: 15, trials: 800, seed: 41 }
    ].map(evaluate);
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 3 : digits);
  }

  function metric(label, value, className) {
    return '<div class="mom-lab__metric ' + (className || "") + '"><span>' +
      label + "</span><strong>" + value + "</strong></div>";
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 18, { size: 12, weight: 800 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, { size: 10, color: COLORS.muted, weight: 600 });
  }

  function sampleRange(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var lo = quantile(sorted, 0.03);
    var hi = quantile(sorted, 0.97);
    var pad = Math.max(0.2, (hi - lo) * 0.08);
    return { min: lo - pad, max: hi + pad };
  }

  function drawSamplePanel(ctx, result, box) {
    panel(ctx, box, "one sample, split into firebreaks", "block means can be bad; the median asks how many blocks were bad");
    var plot = { x: box.x + 38, y: box.y + 66, w: box.w - 72, h: box.h - 104 };
    var range = sampleRange(result.first.values);
    var values = result.first.values;
    var blocks = result.params.blocks;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    values.forEach(function (value, i) {
      var block = Math.min(blocks - 1, Math.floor(i * blocks / values.length));
      var x = plot.x + (block + 0.5) / blocks * plot.w + ((i % 7) - 3) * 1.7;
      var y = plot.y + plot.h - (clamp(value, range.min, range.max) - range.min) / Math.max(1e-9, range.max - range.min) * plot.h;
      var clipped = value < range.min || value > range.max;
      ctx.fillStyle = clipped ? COLORS.outlier : COLORS.sample;
      ctx.globalAlpha = clipped ? 0.9 : 0.58;
      ctx.beginPath();
      ctx.arc(x, y, clipped ? 3.6 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    result.first.blocks.forEach(function (value, block) {
      var x = plot.x + (block + 0.5) / blocks * plot.w;
      var y = plot.y + plot.h - (clamp(value, range.min, range.max) - range.min) / Math.max(1e-9, range.max - range.min) * plot.h;
      ctx.strokeStyle = COLORS.mom;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - plot.w / blocks * 0.32, y);
      ctx.lineTo(x + plot.w / blocks * 0.32, y);
      ctx.stroke();
    });
    var zeroY = plot.y + plot.h - (0 - range.min) / Math.max(1e-9, range.max - range.min) * plot.h;
    ctx.strokeStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.moveTo(plot.x, zeroY);
    ctx.lineTo(plot.x + plot.w, zeroY);
    ctx.stroke();
    text(ctx, "green bars = block means", plot.x, box.y + box.h - 22, { color: COLORS.mom, size: 10, weight: 800 });
  }

  function drawErrorBars(ctx, result, box) {
    panel(ctx, box, "absolute error quantiles", "repeated samples, true mean = 0");
    var plot = { x: box.x + 120, y: box.y + 66, w: box.w - 154, h: box.h - 104 };
    var max = Math.max.apply(null, METHODS.map(function (method) { return result.summary[method.key].q95; }).concat([0.05]));
    METHODS.forEach(function (method, i) {
      var y = plot.y + i * 50;
      var s = result.summary[method.key];
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(plot.x, y, plot.w, 16);
      ctx.fillStyle = method.color;
      ctx.fillRect(plot.x, y, plot.w * s.q50 / max, 16);
      ctx.strokeStyle = method.color;
      ctx.lineWidth = 2;
      [s.q80, s.q90, s.q95].forEach(function (q) {
        var x = plot.x + plot.w * q / max;
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 22);
        ctx.stroke();
      });
      text(ctx, method.label, box.x + 18, y + 8, { color: method.color, weight: 800 });
      text(ctx, "p95 " + fmt(s.q95, 3), plot.x + plot.w + 8, y + 8, { color: COLORS.text, size: 10, weight: 750 });
    });
    text(ctx, "bar = median error; ticks = p80/p90/p95", plot.x, box.y + box.h - 22, { color: COLORS.muted, size: 10 });
  }

  function drawHistograms(ctx, result, box) {
    panel(ctx, box, "sampling distribution of estimates", "tails are clipped to the 2nd-98th percentile window for display");
    var plot = { x: box.x + 38, y: box.y + 66, w: box.w - 72, h: box.h - 100 };
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    var max = 1;
    METHODS.forEach(function (method) {
      max = Math.max(max, Math.max.apply(null, result.histogram.bins[method.key]));
    });
    METHODS.forEach(function (method, methodIndex) {
      var bins = result.histogram.bins[method.key];
      ctx.fillStyle = method.color;
      ctx.globalAlpha = 0.32 + methodIndex * 0.12;
      bins.forEach(function (count, i) {
        var bw = plot.w / bins.length;
        var h = plot.h * count / max;
        ctx.fillRect(plot.x + i * bw, plot.y + plot.h - h, Math.max(1, bw - 1), h);
      });
      ctx.globalAlpha = 1;
    });
    var zeroX = plot.x + (0 - result.histogram.min) / Math.max(1e-9, result.histogram.max - result.histogram.min) * plot.w;
    ctx.strokeStyle = COLORS.bad;
    ctx.beginPath();
    ctx.moveTo(zeroX, plot.y);
    ctx.lineTo(zeroX, plot.y + plot.h);
    ctx.stroke();
    METHODS.forEach(function (method, i) {
      text(ctx, method.label, plot.x + i * 118, box.y + box.h - 20, { color: method.color, size: 10, weight: 800 });
    });
  }

  function drawLedger(ctx, result, box) {
    panel(ctx, box, "audit ledger", "what this run checked");
    var x = box.x + 20;
    var y = box.y + 64;
    var rows = [
      ["scenario", SCENARIOS[result.params.scenario]],
      ["samples", String(result.params.n)],
      ["blocks", String(result.params.blocks)],
      ["trials", String(result.params.trials)],
      ["MOM p95 / mean p95", fmt(result.summary.mom.q95 / Math.max(1e-9, result.summary.mean.q95), 2)],
      ["audit", result.audit.passed ? "passed" : "check"]
    ];
    rows.forEach(function (row, i) {
      text(ctx, row[0], x, y + i * 28, { color: COLORS.muted, size: 10, weight: 700 });
      text(ctx, row[1], box.x + box.w - 20, y + i * 28, { align: "right", color: i === rows.length - 1 ? COLORS.mom : COLORS.text, size: 11, weight: 800 });
    });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    var gap = 14;
    var leftW = Math.floor(w * 0.54);
    drawSamplePanel(ctx, result, { x: gap, y: gap, w: leftW - gap, h: 338 });
    drawHistograms(ctx, result, { x: gap, y: 366, w: leftW - gap, h: h - 380 });
    drawErrorBars(ctx, result, { x: leftW + gap, y: gap, w: w - leftW - 2 * gap, h: 338 });
    drawLedger(ctx, result, { x: leftW + gap, y: 366, w: w - leftW - 2 * gap, h: h - 380 });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setOutputs(root, result) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "scenario") output.textContent = SCENARIOS[result.params.scenario];
      else output.textContent = result.params[key];
    });
    var blocks = root.querySelector('[data-param="blocks"]');
    if (blocks) blocks.value = String(result.params.blocks);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("mean p95 error", fmt(result.summary.mean.q95, 3)),
        metric("trimmed p95", fmt(result.summary.trimmed.q95, 3)),
        metric("MOM p95", fmt(result.summary.mom.q95, 3), "mom-lab__metric--good"),
        metric("MOM / mean", fmt(result.summary.mom.q95 / Math.max(1e-9, result.summary.mean.q95), 2), "mom-lab__metric--good"),
        metric("blocks", String(result.params.blocks)),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "mom-lab__metric--good" : "mom-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = SCENARIOS[result.params.scenario] + ": in " + result.params.trials +
        " repeated samples, median-of-means p95 absolute error is " + fmt(result.summary.mom.q95, 3) +
        " versus " + fmt(result.summary.mean.q95, 3) + " for the sample mean.";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__medianOfMeansResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__medianOfMeansReady) return;
    root.__medianOfMeansReady = true;
    var timer = null;
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(root); }, 35);
      });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-median-of-means-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-median-of-means-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    normalize: normalize,
    medianOfMeans: medianOfMeans,
    blockMeans: blockMeans,
    trimmedMean: trimmedMean
  };

  global.MedianOfMeansLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
