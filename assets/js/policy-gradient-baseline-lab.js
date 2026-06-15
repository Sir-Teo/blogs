(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    raw: "#be123c",
    average: "#7c3aed",
    optimal: "#0f766e",
    trueGrad: "#2563eb",
    curve: "#d97706",
    good: "#15803d",
    bad: "#b91c1c"
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(random) {
    var u = Math.max(1e-12, random());
    var v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function sigmoid(theta) {
    if (theta >= 0) {
      var e = Math.exp(-theta);
      return 1 / (1 + e);
    }
    var z = Math.exp(theta);
    return z / (1 + z);
  }

  function logit(p) {
    var q = clamp(p, 1e-6, 1 - 1e-6);
    return Math.log(q / (1 - q));
  }

  function cleanParams(raw) {
    raw = raw || {};
    var prob = clamp(Number(raw.prob == null ? 0.12 : raw.prob), 0.03, 0.95);
    return {
      batch: clamp(Math.round(raw.batch == null ? 80 : raw.batch), 10, 500),
      gap: clamp(Number(raw.gap == null ? 2.0 : raw.gap), 0.1, 5.0),
      lr: clamp(Number(raw.lr == null ? 0.08 : raw.lr), 0.005, 0.35),
      noise: clamp(Number(raw.noise == null ? 0.60 : raw.noise), 0, 3.0),
      offset: clamp(Number(raw.offset == null ? 6.0 : raw.offset), 0, 16),
      prob: prob,
      seed: clamp(Math.round(raw.seed == null ? 43 : raw.seed), 1, 9999),
      updates: clamp(Math.round(raw.updates == null ? 90 : raw.updates), 10, 240)
    };
  }

  function design(rawParams, thetaOverride) {
    var params = cleanParams(rawParams);
    var theta = thetaOverride == null ? logit(params.prob) : thetaOverride;
    var p = sigmoid(theta);
    var mu0 = params.offset;
    var mu1 = params.offset + params.gap;
    var grad = p * (1 - p) * (mu1 - mu0);
    var avgReward = (1 - p) * mu0 + p * mu1;
    var optimalBaseline = (1 - p) * mu1 + p * mu0;
    return {
      avgReward: avgReward,
      grad: grad,
      mu0: mu0,
      mu1: mu1,
      optimalBaseline: optimalBaseline,
      params: params,
      p: p,
      theta: theta
    };
  }

  function estimatorVariance(rawParams, baseline, thetaOverride) {
    var d = design(rawParams, thetaOverride);
    var p = d.p;
    var q = 1 - p;
    var sigma2 = d.params.noise * d.params.noise;
    var second = p * (Math.pow(d.mu1 - baseline, 2) + sigma2) * q * q
      + q * (Math.pow(d.mu0 - baseline, 2) + sigma2) * p * p;
    return Math.max(0, second - d.grad * d.grad);
  }

  function baselines(rawParams, thetaOverride) {
    var d = design(rawParams, thetaOverride);
    return {
      average: d.avgReward,
      none: 0,
      optimal: d.optimalBaseline
    };
  }

  function oneSampleEstimate(d, baseline, random) {
    var action = random() < d.p ? 1 : 0;
    var mean = action ? d.mu1 : d.mu0;
    var reward = mean + d.params.noise * normal(random);
    var score = action - d.p;
    return {
      action: action,
      estimate: (reward - baseline) * score,
      reward: reward,
      score: score
    };
  }

  function batchEstimate(rawParams, baseline, random, thetaOverride) {
    var d = design(rawParams, thetaOverride);
    var sum = 0;
    var rewardSum = 0;
    var better = 0;
    for (var i = 0; i < d.params.batch; i += 1) {
      var sample = oneSampleEstimate(d, baseline, random);
      sum += sample.estimate;
      rewardSum += sample.reward;
      better += sample.action;
    }
    return {
      betterRate: better / d.params.batch,
      estimate: sum / d.params.batch,
      meanReward: rewardSum / d.params.batch
    };
  }

  function summarize(rawParams, batches, seed) {
    var params = cleanParams(rawParams);
    var d = design(params);
    var base = baselines(params);
    var methods = [
      { key: "none", label: "no baseline", color: COLORS.raw, baseline: base.none },
      { key: "average", label: "average reward", color: COLORS.average, baseline: base.average },
      { key: "optimal", label: "score-weighted", color: COLORS.optimal, baseline: base.optimal }
    ];
    var random = rng(seed * 1000003 + params.batch * 97 + Math.round(params.prob * 10000));

    return methods.map(function (method, methodIndex) {
      var values = [];
      var sum = 0;
      var sumSq = 0;
      for (var i = 0; i < batches; i += 1) {
        var r = batchEstimate(params, method.baseline, random, d.theta);
        values.push(r.estimate);
        sum += r.estimate;
        sumSq += r.estimate * r.estimate;
      }
      var mean = sum / batches;
      var variance = Math.max(0, sumSq / batches - mean * mean);
      return {
        baseline: method.baseline,
        color: method.color,
        exactBatchVariance: estimatorVariance(params, method.baseline, d.theta) / params.batch,
        key: method.key,
        label: method.label,
        mean: mean,
        methodIndex: methodIndex,
        values: values,
        variance: variance
      };
    });
  }

  function varianceCurve(rawParams) {
    var params = cleanParams(rawParams);
    var d = design(params);
    var lo = Math.min(0, d.mu0, d.mu1, d.optimalBaseline) - Math.max(1, params.gap * 0.55);
    var hi = Math.max(d.mu0, d.mu1, d.optimalBaseline, d.avgReward) + Math.max(1, params.gap * 0.55);
    var points = [];
    for (var i = 0; i < 80; i += 1) {
      var b = lo + (hi - lo) * i / 79;
      points.push({ baseline: b, variance: estimatorVariance(params, b, d.theta) / params.batch });
    }
    return points;
  }

  function learningCurves(rawParams) {
    var params = cleanParams(rawParams);
    var initialTheta = logit(params.prob);
    var keys = ["none", "average", "optimal"];
    return keys.map(function (key, methodIndex) {
      var theta = initialTheta;
      var random = rng(params.seed * 700001 + 1739 * (methodIndex + 1));
      var path = [];
      for (var step = 0; step <= params.updates; step += 1) {
        var d = design(params, theta);
        path.push({
          expectedReward: d.avgReward,
          p: d.p,
          step: step,
          theta: theta
        });
        if (step === params.updates) break;
        var base = baselines(params, theta);
        var baseline = key === "none" ? base.none : key === "average" ? base.average : base.optimal;
        var estimate = batchEstimate(params, baseline, random, theta).estimate;
        theta = clamp(theta + params.lr * estimate, -6, 6);
      }
      return {
        color: key === "none" ? COLORS.raw : key === "average" ? COLORS.average : COLORS.optimal,
        key: key,
        label: key === "none" ? "no baseline" : key === "average" ? "average reward" : "score-weighted",
        path: path
      };
    });
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var d = design(params);
    var base = baselines(params);
    var batches = clamp(Math.round(420 + params.batch * 1.3), 360, 900);
    var summaries = summarize(params, batches, params.seed + 17);
    return {
      baselines: base,
      curve: varianceCurve(params),
      design: d,
      learning: learningCurves(params),
      params: params,
      summaries: summaries
    };
  }

  function runAudit() {
    var cases = 0;
    var ok = 0;
    var failures = [];
    var configs = [
      { prob: 0.12, offset: 6, gap: 2, noise: 0.6, batch: 80, lr: 0.08 },
      { prob: 0.50, offset: 4, gap: 1.4, noise: 1.2, batch: 60, lr: 0.07 },
      { prob: 0.80, offset: 9, gap: 2.5, noise: 0.4, batch: 120, lr: 0.05 },
      { prob: 0.25, offset: 0.2, gap: 0.7, noise: 0, batch: 40, lr: 0.12 }
    ];
    configs.forEach(function (cfg, i) {
      [cfg.offset, cfg.offset + 5].forEach(function (offset, j) {
        cases += 1;
        var params = {
          batch: cfg.batch,
          gap: cfg.gap,
          lr: cfg.lr,
          noise: cfg.noise,
          offset: offset,
          prob: cfg.prob,
          seed: 11 + 101 * i + j,
          updates: 40
        };
        var d = design(params);
        var base = baselines(params);
        var eps = 1e-5;
        var plus = design(params, d.theta + eps).avgReward;
        var minus = design(params, d.theta - eps).avgReward;
        var finiteDiff = (plus - minus) / (2 * eps);
        var varNone = estimatorVariance(params, base.none, d.theta);
        var varAvg = estimatorVariance(params, base.average, d.theta);
        var varOpt = estimatorVariance(params, base.optimal, d.theta);
        var nearLeft = estimatorVariance(params, base.optimal - 0.05, d.theta);
        var nearRight = estimatorVariance(params, base.optimal + 0.05, d.theta);
        var shifted = design(Object.assign({}, params, { offset: offset + 3 }));
        var shiftedOptVar = estimatorVariance(Object.assign({}, params, { offset: offset + 3 }), shifted.optimalBaseline, shifted.theta);
        var noBaselineShifted = estimatorVariance(Object.assign({}, params, { offset: offset + 3 }), 0, shifted.theta);
        var checks = [
          Math.abs(d.grad - finiteDiff) < 1e-8,
          Math.abs(d.grad - expectedEstimate(params, base.none, d.theta)) < 1e-10,
          Math.abs(d.grad - expectedEstimate(params, base.average, d.theta)) < 1e-10,
          Math.abs(d.grad - expectedEstimate(params, base.optimal, d.theta)) < 1e-10,
          varOpt <= varAvg + 1e-10,
          varOpt <= varNone + 1e-10,
          varOpt <= nearLeft + 1e-10 && varOpt <= nearRight + 1e-10,
          Math.abs(varOpt - shiftedOptVar) < 1e-10,
          noBaselineShifted > varNone || offset === 0,
          isFinite(evaluate(params).learning[2].path.slice(-1)[0].p)
        ];
        var passed = checks.every(Boolean);
        if (passed) ok += 1;
        else failures.push({ checks: checks, params: params, varNone: varNone, varAvg: varAvg, varOpt: varOpt });
      });
    });
    return {
      cases: cases,
      failures: failures.slice(0, 3),
      ok: ok
    };
  }

  function expectedEstimate(rawParams, baseline, thetaOverride) {
    var d = design(rawParams, thetaOverride);
    return d.p * (d.mu1 - baseline) * (1 - d.p)
      + (1 - d.p) * (d.mu0 - baseline) * (0 - d.p);
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function pct(value, digits) {
    return fmt(100 * value, digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="pg-baseline-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function text(ctx, value, x, y, color, size, weight, align, baseline) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 12, box.y + 21, COLORS.text, 13, 780);
    if (subtitle) text(ctx, subtitle, box.x + 12, box.y + 38, COLORS.muted, 10, 650);
  }

  function drawScatter(ctx, result, box) {
    panel(ctx, box, "batch gradient estimates", "same expected gradient, different noise");
    var values = [];
    result.summaries.forEach(function (summary) { values = values.concat(summary.values); });
    values.push(result.design.grad);
    var minX = Math.min.apply(null, values);
    var maxX = Math.max.apply(null, values);
    var padX = Math.max(0.04, (maxX - minX) * 0.08);
    minX -= padX;
    maxX += padX;
    var plot = { x: box.x + 58, y: box.y + 54, w: box.w - 86, h: box.h - 86 };
    function x(v) { return plot.x + (v - minX) / Math.max(1e-9, maxX - minX) * plot.w; }
    function y(i) { return plot.y + 28 + i * (plot.h - 56) / 2; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gx = plot.x + plot.w * g / 4;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y);
      ctx.lineTo(gx, plot.y + plot.h);
      ctx.stroke();
      text(ctx, fmt(minX + (maxX - minX) * g / 4, 2), gx, plot.y + plot.h + 18, COLORS.muted, 9, 600, "center");
    }
    ctx.strokeStyle = COLORS.trueGrad;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x(result.design.grad), plot.y);
    ctx.lineTo(x(result.design.grad), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "true", x(result.design.grad), plot.y - 8, COLORS.trueGrad, 10, 780, "center");

    result.summaries.forEach(function (summary, i) {
      text(ctx, summary.label, box.x + 12, y(i) + 4, summary.color, 10, 760);
      ctx.fillStyle = summary.color;
      summary.values.slice(0, 170).forEach(function (v, j) {
        var jitter = (((j * 37) % 19) - 9) * 0.72;
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(x(v), y(i) + jitter, 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = summary.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x(summary.mean), y(i) - 14);
      ctx.lineTo(x(summary.mean), y(i) + 14);
      ctx.stroke();
    });
  }

  function drawVarianceCurve(ctx, result, box) {
    panel(ctx, box, "baseline sweep", "minimum variance is score-squared weighted");
    var points = result.curve;
    var minB = points[0].baseline;
    var maxB = points[points.length - 1].baseline;
    var maxV = Math.max.apply(null, points.map(function (p) { return p.variance; })) * 1.08;
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 72, h: box.h - 88 };
    function x(v) { return plot.x + (v - minB) / Math.max(1e-9, maxB - minB) * plot.w; }
    function y(v) { return plot.y + (1 - v / Math.max(1e-9, maxV)) * plot.h; }

    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
      text(ctx, fmt(maxV * (1 - i / 4), 3), plot.x - 8, gy + 4, COLORS.muted, 9, 600, "right");
    }

    ctx.strokeStyle = COLORS.curve;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(function (point, i) {
      if (i === 0) ctx.moveTo(x(point.baseline), y(point.variance));
      else ctx.lineTo(x(point.baseline), y(point.variance));
    });
    ctx.stroke();

    [
      { label: "0", value: result.baselines.none, color: COLORS.raw },
      { label: "avg", value: result.baselines.average, color: COLORS.average },
      { label: "opt", value: result.baselines.optimal, color: COLORS.optimal }
    ].forEach(function (mark, i) {
      var px = x(mark.value);
      ctx.strokeStyle = mark.color;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, plot.y);
      ctx.lineTo(px, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, mark.label, px, plot.y + plot.h + 18 + (i === 1 ? 13 : 0), mark.color, 9, 760, "center");
    });
    text(ctx, "baseline value", plot.x + plot.w, box.y + box.h - 14, COLORS.muted, 10, 650, "right");
  }

  function drawLearning(ctx, result, box) {
    panel(ctx, box, "learning with sampled gradients", "probability of choosing the better action");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 74, h: box.h - 88 };
    function x(step) { return plot.x + step / result.params.updates * plot.w; }
    function y(p) { return plot.y + (1 - p) * plot.h; }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
      text(ctx, pct(1 - i / 4, 0), plot.x - 8, gy + 4, COLORS.muted, 9, 600, "right");
    }
    result.learning.forEach(function (series) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.path.forEach(function (point, i) {
        if (i === 0) ctx.moveTo(x(point.step), y(point.p));
        else ctx.lineTo(x(point.step), y(point.p));
      });
      ctx.stroke();
      var last = series.path[series.path.length - 1];
      text(ctx, pct(last.p, 0), x(last.step), y(last.p) - 5, series.color, 9, 760, "right");
    });
    text(ctx, "updates", plot.x + plot.w, box.y + box.h - 14, COLORS.muted, 10, 650, "right");
  }

  function draw(result, canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(280, Math.floor(rect.width || canvas.clientWidth || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var narrow = cssWidth < 560;
    var pad = narrow ? 12 : 18;
    var gap = narrow ? 14 : 18;
    var panelH = narrow ? 250 : 248;
    var cssHeight = narrow ? pad * 2 + panelH * 3 + gap * 2 : pad * 2 + panelH * 2 + gap;
    var targetWidth = Math.round(cssWidth * ratio);
    var targetHeight = Math.round(cssHeight * ratio);
    canvas.style.height = cssHeight + "px";
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (narrow) {
      drawScatter(ctx, result, { x: pad, y: pad, w: cssWidth - 2 * pad, h: panelH });
      drawVarianceCurve(ctx, result, { x: pad, y: pad + panelH + gap, w: cssWidth - 2 * pad, h: panelH });
      drawLearning(ctx, result, { x: pad, y: pad + 2 * (panelH + gap), w: cssWidth - 2 * pad, h: panelH });
    } else {
      drawScatter(ctx, result, { x: pad, y: pad, w: cssWidth - 2 * pad, h: panelH });
      drawVarianceCurve(ctx, result, { x: pad, y: pad + panelH + gap, w: (cssWidth - 3 * pad) * 0.50, h: panelH });
      drawLearning(ctx, result, { x: pad + (cssWidth - 3 * pad) * 0.50 + gap, y: pad + panelH + gap, w: cssWidth - (pad + (cssWidth - 3 * pad) * 0.50 + gap) - pad, h: panelH });
    }
  }

  function readParams(lab) {
    function number(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      var value = input ? Number(input.value) : fallback;
      return isFinite(value) ? value : fallback;
    }
    return {
      batch: number("batch", 80),
      gap: number("gap", 200) / 100,
      lr: number("lr", 8) / 100,
      noise: number("noise", 60) / 100,
      offset: number("offset", 600) / 100,
      prob: number("prob", 12) / 100,
      seed: number("seed", 43),
      updates: number("updates", 90)
    };
  }

  function updateOutputs(lab, params) {
    var labels = {
      batch: String(params.batch),
      gap: fmt(params.gap, 2),
      lr: fmt(params.lr, 2),
      noise: fmt(params.noise, 2),
      offset: fmt(params.offset, 2),
      prob: pct(params.prob, 0),
      seed: String(params.seed),
      updates: String(params.updates)
    };
    Object.keys(labels).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(lab) {
    var params = cleanParams(readParams(lab));
    var result = evaluate(params);
    var audit = cachedAudit();
    updateOutputs(lab, params);

    var none = result.summaries.filter(function (s) { return s.key === "none"; })[0];
    var avg = result.summaries.filter(function (s) { return s.key === "average"; })[0];
    var opt = result.summaries.filter(function (s) { return s.key === "optimal"; })[0];
    var varianceCut = 1 - opt.exactBatchVariance / Math.max(1e-12, none.exactBatchVariance);
    var avgPenalty = avg.exactBatchVariance / Math.max(1e-12, opt.exactBatchVariance);

    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("true gradient", fmt(result.design.grad, 3)),
        metric("best baseline", fmt(result.baselines.optimal, 2)),
        metric("avg baseline", fmt(result.baselines.average, 2)),
        metric("variance cut", pct(varianceCut, 1)),
        metric("avg penalty", fmt(avgPenalty, 1) + "x"),
        metric("audit", audit.ok + "/" + audit.cases)
      ].join("");
    }

    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function init(lab) {
    var frame = null;
    function redrawSoon() {
      if (frame != null) return;
      if (!global.requestAnimationFrame) {
        render(lab);
        return;
      }
      frame = global.requestAnimationFrame(function () {
        frame = null;
        render(lab);
      });
    }

    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redrawSoon);
      input.addEventListener("change", redrawSoon);
    });
    if (global.addEventListener) global.addEventListener("resize", redrawSoon);
    render(lab);
  }

  function initAll() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-pg-baseline-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    baselines: baselines,
    design: design,
    estimatorVariance: estimatorVariance,
    evaluate: evaluate,
    expectedEstimate: expectedEstimate,
    runAudit: runAudit,
    summarize: summarize
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PolicyGradientBaselineLab = api;
})(typeof window !== "undefined" ? window : globalThis);
