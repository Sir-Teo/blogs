(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    path: "#2563eb",
    accept1: "#0f766e",
    accept0: "#be123c",
    undecided: "#94a3b8",
    curve: "#7c3aed",
    sample: "#d97706",
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

  function cleanParams(raw) {
    raw = raw || {};
    var p0 = clamp(Number(raw.p0 == null ? 0.50 : raw.p0), 0.05, 0.90);
    var p1 = clamp(Number(raw.p1 == null ? 0.58 : raw.p1), p0 + 0.01, 0.97);
    return {
      alpha: clamp(Number(raw.alpha == null ? 0.05 : raw.alpha), 0.001, 0.25),
      beta: clamp(Number(raw.beta == null ? 0.20 : raw.beta), 0.001, 0.45),
      maxN: clamp(Math.round(raw.maxN == null ? 420 : raw.maxN), 40, 1400),
      p0: p0,
      p1: p1,
      seed: clamp(Math.round(raw.seed == null ? 73 : raw.seed), 1, 999),
      trials: clamp(Math.round(raw.trials == null ? 900 : raw.trials), 120, 4000),
      trueP: clamp(Number(raw.trueP == null ? 0.58 : raw.trueP), 0.02, 0.98)
    };
  }

  function design(rawParams) {
    var params = cleanParams(rawParams);
    var success = Math.log(params.p1 / params.p0);
    var failure = Math.log((1 - params.p1) / (1 - params.p0));
    return {
      lower: Math.log(params.beta / (1 - params.alpha)),
      params: params,
      stepFailure: failure,
      stepSuccess: success,
      upper: Math.log((1 - params.beta) / params.alpha)
    };
  }

  function runOne(rawParams, trueP, random, keepPath) {
    var d = design(rawParams);
    var params = d.params;
    var llr = 0;
    var path = keepPath ? [{ n: 0, llr: 0 }] : null;
    var successes = 0;
    var n;

    for (n = 1; n <= params.maxN; n += 1) {
      if (random() < trueP) {
        successes += 1;
        llr += d.stepSuccess;
      } else {
        llr += d.stepFailure;
      }
      if (keepPath) path.push({ n: n, llr: llr });
      if (llr >= d.upper) {
        return { decision: "h1", llr: llr, n: n, path: path, successes: successes };
      }
      if (llr <= d.lower) {
        return { decision: "h0", llr: llr, n: n, path: path, successes: successes };
      }
    }

    return { decision: "open", llr: llr, n: params.maxN, path: path, successes: successes };
  }

  function summarize(rawParams, trueP, trials, seed) {
    var params = cleanParams(rawParams);
    var random = rng(seed * 1000003 + Math.round(trueP * 1000000) + params.maxN * 17);
    var counts = { h0: 0, h1: 0, open: 0 };
    var sampleSum = 0;
    var llrSum = 0;
    for (var i = 0; i < trials; i += 1) {
      var result = runOne(params, trueP, random, false);
      counts[result.decision] += 1;
      sampleSum += result.n;
      llrSum += result.llr;
    }
    return {
      accept0: counts.h0 / trials,
      accept1: counts.h1 / trials,
      avgLlr: llrSum / trials,
      avgN: sampleSum / trials,
      counts: counts,
      open: counts.open / trials,
      trueP: trueP,
      trials: trials
    };
  }

  function curve(rawParams) {
    var params = cleanParams(rawParams);
    var points = [];
    var lo = Math.max(0.02, params.p0 - 0.14);
    var hi = Math.min(0.98, params.p1 + 0.16);
    var grid = 21;
    var curveTrials = clamp(Math.round(params.trials * 0.35), 80, 900);
    for (var i = 0; i < grid; i += 1) {
      var p = lo + (hi - lo) * i / (grid - 1);
      points.push(summarize(params, p, curveTrials, params.seed + 31 * i));
    }
    return points;
  }

  function evaluate(rawParams) {
    var d = design(rawParams);
    var params = d.params;
    var oneRandom = rng(params.seed * 65537 + 99);
    var auditTrials = Math.max(2400, params.trials);
    var one = runOne(params, params.trueP, oneRandom, true);
    var summary = summarize(params, params.trueP, params.trials, params.seed + 7);
    var atNull = summarize(params, params.p0, auditTrials, params.seed + 101);
    var atAlt = summarize(params, params.p1, auditTrials, params.seed + 211);
    var points = curve(params);

    return {
      atAlt: atAlt,
      atNull: atNull,
      curve: points,
      design: d,
      one: one,
      params: params,
      summary: summary
    };
  }

  function runAudit() {
    var cases = 0;
    var ok = 0;
    var failures = [];
    var configs = [
      { p0: 0.50, p1: 0.58, alpha: 0.05, beta: 0.20, maxN: 420 },
      { p0: 0.20, p1: 0.30, alpha: 0.05, beta: 0.10, maxN: 360 },
      { p0: 0.65, p1: 0.75, alpha: 0.10, beta: 0.20, maxN: 300 },
      { p0: 0.42, p1: 0.50, alpha: 0.025, beta: 0.20, maxN: 520 }
    ];

    configs.forEach(function (cfg, i) {
      [cfg.p0, (cfg.p0 + cfg.p1) / 2, cfg.p1].forEach(function (p, j) {
        cases += 1;
        var params = {
          alpha: cfg.alpha,
          beta: cfg.beta,
          maxN: cfg.maxN,
          p0: cfg.p0,
          p1: cfg.p1,
          seed: 19 + i * 97 + j,
          trials: 1100,
          trueP: p
        };
        var result = evaluate(params);
        var checks = [
          result.design.upper > 0,
          result.design.lower < 0,
          result.design.stepSuccess > 0,
          result.design.stepFailure < 0,
          result.one.path.length === result.one.n + 1,
          result.atNull.accept1 <= cfg.alpha + 0.05,
          result.atAlt.accept0 <= cfg.beta + 0.07,
          result.curve[0].accept1 <= result.curve[result.curve.length - 1].accept1 + 0.06,
          isFinite(result.summary.avgN),
          result.summary.open < 0.35
        ];
        var passed = checks.every(Boolean);
        if (passed) ok += 1;
        else failures.push({ cfg: cfg, p: p, checks: checks, atNull: result.atNull, atAlt: result.atAlt });
      });
    });

    return {
      cases: cases,
      failures: failures.slice(0, 3),
      ok: ok
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function pct(value, digits) {
    return fmt(100 * value, digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="sprt-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, box.x + 12, box.y + 21, COLORS.text, 13, 780);
    if (subtitle) label(ctx, subtitle, box.x + 12, box.y + 38, COLORS.muted, 10, 650);
  }

  function drawPath(ctx, result, box) {
    panel(ctx, box, "one likelihood-ratio walk", "each outcome buys evidence until a boundary is crossed");
    var path = result.one.path;
    var d = result.design;
    var maxN = result.params.maxN;
    var minY = Math.min(d.lower * 1.14, result.one.llr, -1);
    var maxY = Math.max(d.upper * 1.14, result.one.llr, 1);
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 74, h: box.h - 88 };
    function x(n) { return plot.x + n / maxN * plot.w; }
    function y(v) { return plot.y + (1 - (v - minY) / Math.max(1e-9, maxY - minY)) * plot.h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var gx = plot.x + plot.w * i / 4;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y);
      ctx.lineTo(gx, plot.y + plot.h);
      ctx.stroke();
      label(ctx, fmt(maxN * i / 4, 0), gx, plot.y + plot.h + 18, COLORS.muted, 9, 600, "center");
    }
    [d.upper, 0, d.lower].forEach(function (v) {
      ctx.strokeStyle = v === 0 ? COLORS.rule : (v > 0 ? COLORS.accept1 : COLORS.accept0);
      ctx.setLineDash(v === 0 ? [] : [5, 4]);
      ctx.beginPath();
      ctx.moveTo(plot.x, y(v));
      ctx.lineTo(plot.x + plot.w, y(v));
      ctx.stroke();
      ctx.setLineDash([]);
    });
    label(ctx, "H1", plot.x + plot.w, y(d.upper) - 5, COLORS.accept1, 10, 760, "right");
    label(ctx, "H0", plot.x + plot.w, y(d.lower) + 13, COLORS.accept0, 10, 760, "right");

    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 2;
    ctx.beginPath();
    path.forEach(function (point, i) {
      if (i === 0) ctx.moveTo(x(point.n), y(point.llr));
      else ctx.lineTo(x(point.n), y(point.llr));
    });
    ctx.stroke();

    var last = path[path.length - 1];
    ctx.fillStyle = result.one.decision === "h1" ? COLORS.accept1 : result.one.decision === "h0" ? COLORS.accept0 : COLORS.undecided;
    ctx.beginPath();
    ctx.arc(x(last.n), y(last.llr), 5, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, result.one.decision.toUpperCase() + " at n=" + result.one.n, box.x + 12, box.y + box.h - 14, ctx.fillStyle, 11, 780);
  }

  function drawCurve(ctx, result, box, key, title, subtitle, color, formatValue) {
    panel(ctx, box, title, subtitle);
    var points = result.curve;
    var pMin = points[0].trueP;
    var pMax = points[points.length - 1].trueP;
    var yMax = key === "avgN" ? Math.max.apply(null, points.map(function (p) { return p.avgN; }).concat([result.params.maxN])) : 1;
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 74, h: box.h - 88 };
    function x(p) { return plot.x + (p - pMin) / Math.max(1e-9, pMax - pMin) * plot.w; }
    function y(v) { return plot.y + (1 - v / Math.max(1e-9, yMax)) * plot.h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
      var yValue = yMax * (1 - i / 4);
      label(ctx, formatValue(yValue), plot.x - 8, gy + 4, COLORS.muted, 9, 600, "right");
    }
    [result.params.p0, result.params.p1, result.params.trueP].forEach(function (p, i) {
      var px = x(p);
      ctx.strokeStyle = i === 0 ? COLORS.accept0 : i === 1 ? COLORS.accept1 : COLORS.sample;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(px, plot.y);
      ctx.lineTo(px, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(function (point, i) {
      var value = point[key];
      if (i === 0) ctx.moveTo(x(point.trueP), y(value));
      else ctx.lineTo(x(point.trueP), y(value));
    });
    ctx.stroke();
    label(ctx, "p0", x(result.params.p0), plot.y + plot.h + 18, COLORS.accept0, 9, 700, "center");
    label(ctx, "p1", x(result.params.p1), plot.y + plot.h + 18, COLORS.accept1, 9, 700, "center");
    label(ctx, "true", x(result.params.trueP), plot.y + plot.h + 34, COLORS.sample, 9, 700, "center");
  }

  function draw(result, canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(280, Math.floor(rect.width || canvas.clientWidth || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var narrow = cssWidth < 560;
    var pad = narrow ? 12 : 18;
    var gap = narrow ? 14 : 18;
    var panelH = narrow ? 260 : 248;
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
      drawPath(ctx, result, { x: pad, y: pad, w: cssWidth - 2 * pad, h: panelH });
      drawCurve(ctx, result, { x: pad, y: pad + panelH + gap, w: cssWidth - 2 * pad, h: panelH }, "accept1", "operating characteristic", "chance of stopping for H1", COLORS.curve, function (v) { return pct(v, 0); });
      drawCurve(ctx, result, { x: pad, y: pad + 2 * (panelH + gap), w: cssWidth - 2 * pad, h: panelH }, "avgN", "average sample number", "expected observations before stopping", COLORS.sample, function (v) { return fmt(v, 0); });
    } else {
      drawPath(ctx, result, { x: pad, y: pad, w: cssWidth - 2 * pad, h: panelH });
      drawCurve(ctx, result, { x: pad, y: pad + panelH + gap, w: (cssWidth - 3 * pad) * 0.52, h: panelH }, "accept1", "operating characteristic", "chance of stopping for H1", COLORS.curve, function (v) { return pct(v, 0); });
      drawCurve(ctx, result, { x: pad + (cssWidth - 3 * pad) * 0.52 + gap, y: pad + panelH + gap, w: cssWidth - (pad + (cssWidth - 3 * pad) * 0.52 + gap) - pad, h: panelH }, "avgN", "average sample number", "expected observations before stopping", COLORS.sample, function (v) { return fmt(v, 0); });
    }
  }

  function readParams(lab) {
    function number(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      var value = input ? Number(input.value) : fallback;
      return isFinite(value) ? value : fallback;
    }
    var p0 = number("p0", 50) / 100;
    return {
      alpha: number("alpha", 5) / 100,
      beta: number("beta", 20) / 100,
      maxN: number("maxN", 420),
      p0: p0,
      p1: p0 + number("lift", 8) / 100,
      seed: number("seed", 73),
      trials: number("trials", 900),
      trueP: number("trueP", 58) / 100
    };
  }

  function updateOutputs(lab, params) {
    var labels = {
      alpha: pct(params.alpha, 1),
      beta: pct(params.beta, 1),
      lift: pct(params.p1 - params.p0, 1),
      maxN: String(params.maxN),
      p0: pct(params.p0, 1),
      seed: String(params.seed),
      trials: String(params.trials),
      trueP: pct(params.trueP, 1)
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

    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("decision", result.one.decision.toUpperCase()),
        metric("avg samples", fmt(result.summary.avgN, 1)),
        metric("stop for H1", pct(result.summary.accept1, 1)),
        metric("open runs", pct(result.summary.open, 1)),
        metric("null H1 rate", pct(result.atNull.accept1, 1)),
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
      input.addEventListener("input", function () { render(lab); });
      input.addEventListener("change", function () { render(lab); });
    });
    if (global.addEventListener) global.addEventListener("resize", redrawSoon);
    render(lab);
  }

  function initAll() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-sprt-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    design: design,
    evaluate: evaluate,
    runAudit: runAudit,
    runOne: runOne,
    summarize: summarize
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SPRTLab = api;
})(typeof window !== "undefined" ? window : globalThis);
