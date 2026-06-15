(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    exact: "#0f766e",
    rdp: "#2563eb",
    tail: "#dc2626",
    sample: "#f59e0b",
    one: "#7c3aed",
    dark: "#0f172a"
  };

  var DEFAULTS = {
    sigma: 80,
    releases: 120,
    deltaExp: 6,
    epsilon: 60,
    samples: 5000,
    seed: 31
  };

  var SQRT2 = Math.SQRT2;
  var LN10 = Math.LN10;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      sigma: clamp(Math.round(readNumber(raw, "sigma")), 10, 120),
      releases: clamp(Math.round(readNumber(raw, "releases")), 1, 400),
      deltaExp: clamp(Math.round(readNumber(raw, "deltaExp")), 3, 12),
      epsilon: clamp(Math.round(readNumber(raw, "epsilon")), 0, 160),
      samples: clamp(Math.round(readNumber(raw, "samples") / 500) * 500, 1000, 9000),
      seed: clamp(Math.round(readNumber(raw, "seed")), 1, 9999)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
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

  function erfc(x) {
    var z = Math.abs(x);
    var t = 1 / (1 + z / 2);
    var ans = t * Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
      t * (-0.82215223 + t * 0.17087277))))))))
    );
    return x >= 0 ? ans : 2 - ans;
  }

  function normalCdf(x) {
    return 0.5 * erfc(-x / SQRT2);
  }

  function normalSf(x) {
    return 0.5 * erfc(x / SQRT2);
  }

  function normalPdf(x, mean, sd) {
    var z = (x - mean) / sd;
    return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
  }

  function inverseNormal(p) {
    var lo = -12;
    var hi = 12;
    for (var i = 0; i < 70; i += 1) {
      var mid = (lo + hi) / 2;
      if (normalCdf(mid) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function log10(value) {
    return Math.log(value) / LN10;
  }

  function gaussianPrivacyLoss(sigma, releases) {
    var mean = releases / (2 * sigma * sigma);
    return {
      mean: mean,
      variance: releases / (sigma * sigma),
      sd: Math.sqrt(releases) / sigma
    };
  }

  function privacyLossTail(epsilon, sigma, releases) {
    var loss = gaussianPrivacyLoss(sigma, releases);
    if (loss.sd === 0) return epsilon < loss.mean ? 1 : 0;
    return normalSf((epsilon - loss.mean) / loss.sd);
  }

  function tailEpsilon(delta, sigma, releases) {
    var loss = gaussianPrivacyLoss(sigma, releases);
    return loss.mean + loss.sd * inverseNormal(1 - delta);
  }

  function analyticDelta(epsilon, sigma, releases) {
    var distance = Math.sqrt(releases);
    var a = distance / (2 * sigma) - epsilon * sigma / distance;
    var b = -distance / (2 * sigma) - epsilon * sigma / distance;
    var value = normalCdf(a) - Math.exp(epsilon) * normalCdf(b);
    return clamp(value, 0, 1);
  }

  function exactEpsilon(delta, sigma, releases) {
    if (analyticDelta(0, sigma, releases) <= delta) return 0;
    var lo = 0;
    var hi = 1;
    while (analyticDelta(hi, sigma, releases) > delta && hi < 512) hi *= 2;
    for (var i = 0; i < 70; i += 1) {
      var mid = (lo + hi) / 2;
      if (analyticDelta(mid, sigma, releases) > delta) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function rdpEpsilon(delta, sigma, releases) {
    var logInvDelta = Math.log(1 / delta);
    var alpha = 1 + Math.sqrt(2 * sigma * sigma * logInvDelta / releases);
    var epsilon = releases * alpha / (2 * sigma * sigma) + logInvDelta / (alpha - 1);
    return {
      alpha: alpha,
      epsilon: epsilon
    };
  }

  function gaussianSample(rng) {
    var u1 = Math.max(1e-12, rng());
    var u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function makeSamples(params, loss) {
    var rng = makeRng(params.seed);
    var rows = [];
    var above = 0;
    for (var i = 0; i < params.samples; i += 1) {
      var value = loss.mean + loss.sd * gaussianSample(rng);
      if (value > params.epsilonValue) above += 1;
      rows.push(value);
    }
    return {
      values: rows,
      empiricalTail: above / params.samples
    };
  }

  function makeEpsilonCurves(params) {
    var rows = [];
    var maxK = 400;
    var delta = params.delta;
    for (var i = 0; i <= 90; i += 1) {
      var k = Math.max(1, Math.round(1 + (maxK - 1) * i / 90));
      if (rows.length && rows[rows.length - 1].k === k) continue;
      rows.push({
        k: k,
        exact: exactEpsilon(delta, params.sigmaValue, k),
        rdp: rdpEpsilon(delta, params.sigmaValue, k).epsilon,
        tail: tailEpsilon(delta, params.sigmaValue, k)
      });
    }
    return rows;
  }

  function makeDeltaCurve(params) {
    var rdp = rdpEpsilon(params.delta, params.sigmaValue, params.releases);
    var xMax = Math.max(params.epsilonValue, params.exactEpsilon, rdp.epsilon, params.tailEpsilon, 2) * 1.18;
    var rows = [];
    for (var i = 0; i <= 120; i += 1) {
      var epsilon = xMax * i / 120;
      rows.push({
        epsilon: epsilon,
        analytic: analyticDelta(epsilon, params.sigmaValue, params.releases),
        tail: privacyLossTail(epsilon, params.sigmaValue, params.releases)
      });
    }
    return rows;
  }

  function makeRdpCurve(params) {
    var rows = [];
    var maxAlpha = Math.max(32, Math.min(512, params.rdp.alpha * 3));
    for (var i = 0; i <= 120; i += 1) {
      var u = i / 120;
      var alpha = 1.01 * Math.pow(maxAlpha / 1.01, u);
      rows.push({
        alpha: alpha,
        epsilon: params.releases * alpha / (2 * params.sigmaValue * params.sigmaValue) +
          Math.log(1 / params.delta) / (alpha - 1)
      });
    }
    return rows;
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    params.sigmaValue = params.sigma / 10;
    params.epsilonValue = params.epsilon / 10;
    params.delta = Math.pow(10, -params.deltaExp);
    var loss = gaussianPrivacyLoss(params.sigmaValue, params.releases);
    var oneLoss = gaussianPrivacyLoss(params.sigmaValue, 1);
    params.exactEpsilon = exactEpsilon(params.delta, params.sigmaValue, params.releases);
    params.tailEpsilon = tailEpsilon(params.delta, params.sigmaValue, params.releases);
    params.rdp = rdpEpsilon(params.delta, params.sigmaValue, params.releases);
    var samples = makeSamples(params, loss);
    var tailAtProbe = privacyLossTail(params.epsilonValue, params.sigmaValue, params.releases);
    var deltaAtProbe = analyticDelta(params.epsilonValue, params.sigmaValue, params.releases);
    var curves = {
      epsilon: makeEpsilonCurves(params),
      delta: makeDeltaCurve(params),
      rdp: makeRdpCurve(params)
    };
    var checks = {
      finite: Number.isFinite(params.exactEpsilon) && Number.isFinite(params.rdp.epsilon) && Number.isFinite(params.tailEpsilon),
      ordered: params.exactEpsilon <= params.tailEpsilon + 1e-8 && params.exactEpsilon <= params.rdp.epsilon + 1e-8,
      deltaMonotone: curves.delta.every(function (row, i, arr) {
        return i === 0 || row.analytic <= arr[i - 1].analytic + 1e-8;
      }),
      sampleClose: Math.abs(samples.empiricalTail - tailAtProbe) < Math.max(0.035, 4 * Math.sqrt(Math.max(1e-9, tailAtProbe * (1 - tailAtProbe)) / params.samples)),
      bounded: deltaAtProbe >= 0 && deltaAtProbe <= 1 && tailAtProbe >= 0 && tailAtProbe <= 1
    };
    return {
      params: params,
      loss: loss,
      oneLoss: oneLoss,
      samples: samples,
      curves: curves,
      summary: {
        exactEpsilon: params.exactEpsilon,
        rdpEpsilon: params.rdp.epsilon,
        tailEpsilon: params.tailEpsilon,
        rdpAlpha: params.rdp.alpha,
        deltaAtProbe: deltaAtProbe,
        tailAtProbe: tailAtProbe,
        empiricalTail: samples.empiricalTail,
        meanLoss: loss.mean,
        sdLoss: loss.sd
      },
      checks: checks
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(digits == null ? 1 : digits);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatSci(value) {
    if (!Number.isFinite(value)) return "n/a";
    if (value === 0) return "0";
    var exponent = Math.floor(log10(Math.abs(value)));
    var mantissa = value / Math.pow(10, exponent);
    return mantissa.toFixed(2) + "e" + exponent;
  }

  function metric(label, value) {
    return '<div class="privacy-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function syncOutputs(root, result) {
    var p = result.params;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      sigma: formatNumber(p.sigmaValue, 1),
      releases: p.releases,
      deltaExp: "1e-" + p.deltaExp,
      epsilon: formatNumber(p.epsilonValue, 1),
      samples: p.samples,
      seed: p.seed
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (values[key] != null) output.textContent = values[key];
    });
  }

  function renderMetrics(root, result) {
    var target = root.querySelector("[data-metrics]");
    if (!target) return;
    var audit = Object.keys(result.checks).every(function (key) { return result.checks[key]; }) ? "passed" : "check";
    target.innerHTML = [
      metric("Exact epsilon", formatNumber(result.summary.exactEpsilon, 2)),
      metric("RDP epsilon", formatNumber(result.summary.rdpEpsilon, 2)),
      metric("Tail epsilon", formatNumber(result.summary.tailEpsilon, 2)),
      metric("delta at probe", formatSci(result.summary.deltaAtProbe)),
      metric("Pr[L > eps]", formatSci(result.summary.tailAtProbe)),
      metric("Audit", audit)
    ].join("");
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 560 ? 1160 : 780;
    var ratio = Math.min(2, global.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssWidth * ratio) || canvas.height !== Math.round(cssHeight * ratio)) {
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      canvas.style.height = cssHeight + "px";
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var trimmed = text;
    while (trimmed.length > 4 && ctx.measureText(trimmed + "...").width > maxWidth) trimmed = trimmed.slice(0, -1);
    return trimmed.trim() + "...";
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, rect.x + 14, rect.y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(fitText(ctx, subtitle, rect.w - 28), rect.x + 14, rect.y + 42);
    }
  }

  function axes(ctx, plot) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
  }

  function drawLine(ctx, rows, sx, sy, key, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = sx(row);
      var y = sy(row[key]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawDistribution(ctx, rect, result) {
    panel(ctx, rect, "Privacy loss", "one Gaussian release versus the composed transcript");
    var plot = { x: rect.x + 42, y: rect.y + 62, w: rect.w - 62, h: rect.h - 100 };
    var loss = result.loss;
    var one = result.oneLoss;
    var epsilon = result.params.epsilonValue;
    var xMin = Math.min(-0.5, loss.mean - 4.2 * loss.sd, one.mean - 4.2 * one.sd);
    var xMax = Math.max(epsilon * 1.12 + 0.2, loss.mean + 4.2 * loss.sd, one.mean + 4.2 * one.sd);
    var yMax = Math.max(normalPdf(loss.mean, loss.mean, loss.sd), normalPdf(one.mean, one.mean, one.sd)) * 1.16;
    function sxValue(x) { return plot.x + (x - xMin) / (xMax - xMin) * plot.w; }
    function syValue(y) { return plot.y + plot.h * (1 - y / yMax); }
    axes(ctx, plot);

    var bins = 42;
    var counts = Array.from({ length: bins }, function () { return 0; });
    result.samples.values.forEach(function (value) {
      var b = Math.floor((value - xMin) / (xMax - xMin) * bins);
      if (b >= 0 && b < bins) counts[b] += 1;
    });
    var binW = (xMax - xMin) / bins;
    ctx.fillStyle = "rgba(245, 158, 11, 0.28)";
    counts.forEach(function (count, i) {
      var density = count / Math.max(1, result.samples.values.length) / binW;
      var x = sxValue(xMin + i * binW);
      var y = syValue(density);
      var w = Math.max(1, plot.w / bins - 1);
      ctx.fillRect(x, y, w, plot.y + plot.h - y);
    });

    var rows = [];
    for (var i = 0; i <= 160; i += 1) {
      var x = xMin + (xMax - xMin) * i / 160;
      rows.push({ x: x, composed: normalPdf(x, loss.mean, loss.sd), single: normalPdf(x, one.mean, one.sd) });
    }
    drawLine(ctx, rows, function (row) { return sxValue(row.x); }, syValue, "single", COLORS.one, 1.6);
    drawLine(ctx, rows, function (row) { return sxValue(row.x); }, syValue, "composed", COLORS.exact, 2.4);

    var epsX = sxValue(epsilon);
    ctx.strokeStyle = COLORS.tail;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(epsX, plot.y);
    ctx.lineTo(epsX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.tail;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText("epsilon", Math.min(epsX + 5, plot.x + plot.w - 56), plot.y + 14);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("L", plot.x + plot.w - 10, plot.y + plot.h + 22);
  }

  function drawEpsilonCurves(ctx, rect, result) {
    panel(ctx, rect, "Composing releases", "epsilon for fixed delta as the transcript grows");
    var plot = { x: rect.x + 42, y: rect.y + 62, w: rect.w - 62, h: rect.h - 98 };
    var rows = result.curves.epsilon;
    var maxY = Math.max.apply(null, rows.map(function (row) { return Math.max(row.exact, row.rdp, row.tail); })) * 1.08;
    function sx(row) { return plot.x + (row.k - 1) / 399 * plot.w; }
    function sy(value) { return plot.y + plot.h * (1 - value / maxY); }
    axes(ctx, plot);
    drawLine(ctx, rows, sx, sy, "tail", COLORS.tail, 1.8);
    drawLine(ctx, rows, sx, sy, "rdp", COLORS.rdp, 2);
    drawLine(ctx, rows, sx, sy, "exact", COLORS.exact, 2.4);
    var x = plot.x + (result.params.releases - 1) / 399 * plot.w;
    ctx.strokeStyle = COLORS.dark;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText("k=" + result.params.releases, Math.min(x + 5, plot.x + plot.w - 52), plot.y + 14);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("400 releases", plot.x + plot.w - 74, plot.y + plot.h + 22);
  }

  function drawDeltaCurve(ctx, rect, result) {
    panel(ctx, rect, "Delta curve", "exact Gaussian DP is below the one-sided loss tail");
    var plot = { x: rect.x + 44, y: rect.y + 62, w: rect.w - 64, h: rect.h - 98 };
    var rows = result.curves.delta;
    var yMin = -Math.max(12, result.params.deltaExp + 1);
    function sx(row) { return plot.x + row.epsilon / rows[rows.length - 1].epsilon * plot.w; }
    function yLog(value) { return clamp(log10(Math.max(1e-16, value)), yMin, 0); }
    function syLog(value) { return plot.y + plot.h * (1 - (yLog(value) - yMin) / (0 - yMin)); }
    axes(ctx, plot);
    drawLine(ctx, rows, sx, syLog, "tail", COLORS.tail, 1.8);
    drawLine(ctx, rows, sx, syLog, "analytic", COLORS.exact, 2.4);
    var targetY = syLog(result.params.delta);
    ctx.strokeStyle = COLORS.dark;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(plot.x, targetY);
    ctx.lineTo(plot.x + plot.w, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("target delta", plot.x + 4, targetY - 5);
    ctx.fillText("epsilon", plot.x + plot.w - 44, plot.y + plot.h + 22);
  }

  function drawRdpCurve(ctx, rect, result) {
    panel(ctx, rect, "RDP accountant", "choose the Renyi order that gives the tightest conversion");
    var plot = { x: rect.x + 42, y: rect.y + 62, w: rect.w - 62, h: rect.h - 98 };
    var rows = result.curves.rdp;
    var maxAlpha = rows[rows.length - 1].alpha;
    var maxY = Math.max.apply(null, rows.map(function (row) { return Math.min(row.epsilon, result.summary.rdpEpsilon * 3); }));
    function sx(row) { return plot.x + log10(row.alpha / 1.01) / log10(maxAlpha / 1.01) * plot.w; }
    function sy(value) { return plot.y + plot.h * (1 - Math.min(value, maxY) / maxY); }
    axes(ctx, plot);
    drawLine(ctx, rows, sx, sy, "epsilon", COLORS.rdp, 2.4);
    var opt = { alpha: result.summary.rdpAlpha, epsilon: result.summary.rdpEpsilon };
    ctx.fillStyle = COLORS.sample;
    ctx.beginPath();
    ctx.arc(sx(opt), sy(opt.epsilon), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText("alpha=" + formatNumber(opt.alpha, 1), Math.min(sx(opt) + 7, plot.x + plot.w - 72), sy(opt.epsilon) - 7);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("Renyi order", plot.x + plot.w - 76, plot.y + plot.h + 22);
  }

  function drawLegend(ctx, x, y) {
    var items = [
      ["exact Gaussian", COLORS.exact],
      ["RDP conversion", COLORS.rdp],
      ["loss tail", COLORS.tail],
      ["Monte Carlo", COLORS.sample]
    ];
    ctx.font = "12px system-ui, sans-serif";
    items.forEach(function (item, i) {
      var ox = x + i * 108;
      ctx.fillStyle = item[1];
      ctx.beginPath();
      ctx.arc(ox, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(item[0], ox + 8, y);
    });
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    var width = frame.width;
    var height = frame.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);
    var pad = 14;
    if (width < 560) {
      drawDistribution(ctx, { x: pad, y: pad, w: width - pad * 2, h: 286 }, result);
      drawEpsilonCurves(ctx, { x: pad, y: 316, w: width - pad * 2, h: 260 }, result);
      drawDeltaCurve(ctx, { x: pad, y: 592, w: width - pad * 2, h: 250 }, result);
      drawRdpCurve(ctx, { x: pad, y: 858, w: width - pad * 2, h: height - 872 }, result);
      drawLegend(ctx, pad + 18, height - 18);
    } else {
      var colW = (width - pad * 3) / 2;
      drawDistribution(ctx, { x: pad, y: pad, w: colW, h: 370 }, result);
      drawEpsilonCurves(ctx, { x: pad * 2 + colW, y: pad, w: colW, h: 370 }, result);
      drawDeltaCurve(ctx, { x: pad, y: 402, w: colW, h: height - 416 }, result);
      drawRdpCurve(ctx, { x: pad * 2 + colW, y: 402, w: colW, h: height - 416 }, result);
      drawLegend(ctx, pad + 18, height - 18);
    }
  }

  function render(root) {
    var result = simulate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__privacyResult = result;
  }

  function init(root) {
    if (!root || root.__privacyReady) return;
    root.__privacyReady = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    var resizeTimer = null;
    global.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(root); }, 120);
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-privacy-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    normalCdf: normalCdf,
    analyticDelta: analyticDelta,
    exactEpsilon: exactEpsilon,
    rdpEpsilon: rdpEpsilon,
    privacyLossTail: privacyLossTail,
    simulate: simulate,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PrivacyLossLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
