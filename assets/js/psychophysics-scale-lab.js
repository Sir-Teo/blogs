(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    log: "#0f766e",
    linear: "#2563eb",
    power: "#b45309",
    marker: "#7c3aed",
    red: "#be123c",
    white: "#ffffff"
  };

  var DEFAULTS = {
    weber: 8,
    exponent: 0.6,
    criterion: 75,
    reference: 16,
    maxIntensity: 128
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    var maxIntensity = clamp(Math.round(Number(raw.maxIntensity == null ? DEFAULTS.maxIntensity : raw.maxIntensity)), 48, 512);
    var reference = clamp(Math.round(Number(raw.reference == null ? DEFAULTS.reference : raw.reference)), 4, Math.max(8, Math.floor(maxIntensity / 2)));
    return {
      weber: clamp(Number(raw.weber == null ? DEFAULTS.weber : raw.weber), 2, 30),
      exponent: clamp(Number(raw.exponent == null ? DEFAULTS.exponent : raw.exponent), 0.25, 1.6),
      criterion: clamp(Number(raw.criterion == null ? DEFAULTS.criterion : raw.criterion), 60, 90),
      reference: reference,
      maxIntensity: maxIntensity
    };
  }

  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    var ax = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * ax);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
    return sign * y;
  }

  function normalCdf(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }

  function inverseNormal(p) {
    var lo = -8;
    var hi = 8;
    for (var i = 0; i < 80; i += 1) {
      var mid = (lo + hi) / 2;
      if (normalCdf(mid) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function log2(x) {
    return Math.log(x) / Math.LN2;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function scaleValue(kind, x, params) {
    if (kind === "linear") return x;
    if (kind === "power") return Math.pow(x, params.exponent);
    return Math.log(x);
  }

  function invertScale(kind, y, params) {
    if (kind === "linear") return y;
    if (kind === "power") return Math.pow(Math.max(0, y), 1 / params.exponent);
    return Math.exp(y);
  }

  function threshold(kind, params) {
    var w = params.weber / 100;
    var ref = params.reference;
    return scaleValue(kind, ref * (1 + w), params) - scaleValue(kind, ref, params);
  }

  function jndAt(kind, intensity, params) {
    var base = scaleValue(kind, intensity, params);
    var target = base + threshold(kind, params);
    var next = invertScale(kind, target, params);
    var delta = Math.max(0, next - intensity);
    return {
      intensity: intensity,
      delta: delta,
      ratio: delta / intensity
    };
  }

  function detectionProbability(kind, intensity, deltaRatio, params) {
    var z = inverseNormal(params.criterion / 100);
    var delta = Math.max(0, intensity * deltaRatio);
    var evidence = scaleValue(kind, intensity + delta, params) - scaleValue(kind, intensity, params);
    return normalCdf(z * evidence / Math.max(1e-12, threshold(kind, params)));
  }

  function logSpace(min, max, n) {
    var out = [];
    var lo = Math.log(min);
    var hi = Math.log(max);
    for (var i = 0; i < n; i += 1) out.push(Math.exp(lerp(lo, hi, i / Math.max(1, n - 1))));
    return out;
  }

  function ladder(params) {
    var values = [1];
    var ratio = 1 + params.weber / 100;
    while (values[values.length - 1] * ratio <= params.maxIntensity && values.length < 96) {
      values.push(values[values.length - 1] * ratio);
    }
    return values;
  }

  function buildCurves(params) {
    var intensities = logSpace(1, params.maxIntensity, 42);
    var kinds = ["linear", "log", "power"];
    var jnds = {};
    var scales = {};
    kinds.forEach(function (kind) {
      jnds[kind] = intensities.map(function (x) { return jndAt(kind, x, params); });
      var raw = intensities.map(function (x) { return scaleValue(kind, x, params); });
      var min = raw[0];
      var max = raw[raw.length - 1];
      scales[kind] = intensities.map(function (x, i) {
        return { intensity: x, value: (raw[i] - min) / Math.max(1e-12, max - min) };
      });
    });

    var maxRatio = Math.max.apply(null, kinds.flatMap(function (kind) {
      return jnds[kind].map(function (row) { return row.ratio; });
    }));
    var psychometric = [];
    for (var i = 0; i <= 60; i += 1) {
      var ratio = (params.weber / 100) * 3 * i / 60;
      psychometric.push({
        ratio: ratio,
        log: detectionProbability("log", params.reference, ratio, params),
        power: detectionProbability("power", params.reference, ratio, params),
        linear: detectionProbability("linear", params.reference, ratio, params)
      });
    }

    return {
      intensities: intensities,
      scales: scales,
      jnds: jnds,
      maxRatio: maxRatio,
      psychometric: psychometric,
      ladder: ladder(params)
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var curves = buildCurves(params);
    var ref = params.reference;
    var w = params.weber / 100;
    var refRows = {
      linear: jndAt("linear", ref, params),
      log: jndAt("log", ref, params),
      power: jndAt("power", ref, params)
    };
    var low = 4;
    var high = Math.min(params.maxIntensity, Math.max(32, params.reference * 4));
    var result = {
      params: params,
      curves: curves,
      refRows: refRows,
      lowRows: {
        linear: jndAt("linear", low, params),
        log: jndAt("log", low, params),
        power: jndAt("power", low, params)
      },
      highRows: {
        linear: jndAt("linear", high, params),
        log: jndAt("log", high, params),
        power: jndAt("power", high, params)
      },
      jndStepsAcrossRange: Math.log(params.maxIntensity) / Math.log(1 + w),
      stevensRangeRatio: Math.pow(params.maxIntensity / 1, params.exponent),
      thresholdProbability: detectionProbability("log", ref, w, params)
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var checks = [];
    function check(name, passed) {
      checks.push({ name: name, passed: !!passed });
    }

    var params = result.params;
    var w = params.weber / 100;
    var z = inverseNormal(params.criterion / 100);
    check("inverse normal round trip", Math.abs(normalCdf(z) - params.criterion / 100) < 1e-6);
    check("log threshold reaches requested criterion", Math.abs(result.thresholdProbability - params.criterion / 100) < 1e-6);
    ["linear", "log", "power"].forEach(function (kind) {
      check(kind + " reference ratio normalized to Weber fraction", Math.abs(result.refRows[kind].ratio - w) < 1e-10);
      check(kind + " reference JND positive", result.refRows[kind].delta > 0 && Number.isFinite(result.refRows[kind].delta));
    });
    var logRatios = result.curves.jnds.log.map(function (row) { return row.ratio; });
    var logMax = Math.max.apply(null, logRatios);
    var logMin = Math.min.apply(null, logRatios);
    check("log scale keeps JND ratio constant", Math.abs(logMax - logMin) < 1e-10);
    var linearDeltas = result.curves.jnds.linear.map(function (row) { return row.delta; });
    var linMax = Math.max.apply(null, linearDeltas);
    var linMin = Math.min.apply(null, linearDeltas);
    check("linear scale keeps absolute JND constant", Math.abs(linMax - linMin) < 1e-10);
    check("ladder grows by fixed ratios", result.curves.ladder.every(function (value, i, arr) {
      return i === 0 || Math.abs(value / arr[i - 1] - (1 + w)) < 1e-12;
    }));
    check("all psychometric probabilities bounded", result.curves.psychometric.every(function (row) {
      return ["linear", "log", "power"].every(function (kind) {
        return row[kind] >= 0.5 && row[kind] <= 1;
      });
    }));

    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function auditGrid() {
    return [
      {},
      { weber: 5, exponent: 0.33, criterion: 70, reference: 12, maxIntensity: 96 },
      { weber: 12, exponent: 1.2, criterion: 80, reference: 24, maxIntensity: 256 },
      { weber: 20, exponent: 0.75, criterion: 85, reference: 32, maxIntensity: 128 }
    ].map(function (row) { return evaluate(row).audit; });
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="psychophysics-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 900));
    var cssHeight = cssWidth < 700 ? 780 : 620;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, COLORS.muted, 11, 560);
  }

  function axes(ctx, plot, xLabel, yLabel) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    text(ctx, xLabel, plot.x + plot.w, plot.y + plot.h + 22, COLORS.muted, 10, 600, "right");
    text(ctx, yLabel, plot.x, plot.y - 7, COLORS.muted, 10, 600, "left");
  }

  function drawLine(ctx, points, sx, sy, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, i) {
      var x = sx(point);
      var y = sy(point);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawScalePanel(ctx, box, result) {
    panel(ctx, box, "three candidate rulers", "all normalized to the same vertical range");
    var plot = { x: box.x + 42, y: box.y + 62, w: box.w - 60, h: box.h - 94 };
    axes(ctx, plot, "stimulus intensity, log axis", "internal units");
    var params = result.params;
    var xmin = Math.log(1);
    var xmax = Math.log(params.maxIntensity);
    function sx(point) { return plot.x + (Math.log(point.intensity) - xmin) / (xmax - xmin) * plot.w; }
    function sy(point) { return plot.y + plot.h - point.value * plot.h; }
    drawLine(ctx, result.curves.scales.linear, sx, sy, COLORS.linear, 2);
    drawLine(ctx, result.curves.scales.log, sx, sy, COLORS.log, 2.5);
    drawLine(ctx, result.curves.scales.power, sx, sy, COLORS.power, 2);
    text(ctx, "linear", plot.x + plot.w - 8, sy(result.curves.scales.linear[result.curves.scales.linear.length - 1]) + 12, COLORS.linear, 11, 760, "right");
    text(ctx, "log", plot.x + plot.w - 8, sy(result.curves.scales.log[result.curves.scales.log.length - 1]) + 28, COLORS.log, 11, 760, "right");
    text(ctx, "power", plot.x + plot.w - 8, sy(result.curves.scales.power[result.curves.scales.power.length - 1]) + 44, COLORS.power, 11, 760, "right");
    var refX = plot.x + (Math.log(params.reference) - xmin) / (xmax - xmin) * plot.w;
    ctx.strokeStyle = COLORS.marker;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(refX, plot.y);
    ctx.lineTo(refX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "reference", refX + 5, plot.y + 13, COLORS.marker, 10, 700);
  }

  function drawJndPanel(ctx, box, result) {
    panel(ctx, box, "difference threshold", "how big a change must be, relative to the background");
    var plot = { x: box.x + 48, y: box.y + 62, w: box.w - 66, h: box.h - 96 };
    axes(ctx, plot, "stimulus intensity, log axis", "Delta / I");
    var params = result.params;
    var xmin = Math.log(1);
    var xmax = Math.log(params.maxIntensity);
    var ymax = Math.max(result.curves.maxRatio * 1.08, params.weber / 100 * 1.6);
    function sx(point) { return plot.x + (Math.log(point.intensity) - xmin) / (xmax - xmin) * plot.w; }
    function sy(point) { return plot.y + plot.h - point.ratio / ymax * plot.h; }
    drawLine(ctx, result.curves.jnds.linear, sx, sy, COLORS.linear, 2);
    drawLine(ctx, result.curves.jnds.log, sx, sy, COLORS.log, 2.5);
    drawLine(ctx, result.curves.jnds.power, sx, sy, COLORS.power, 2);
    [params.weber / 100, ymax / 2].forEach(function (ratio) {
      var y = plot.y + plot.h - ratio / ymax * plot.h;
      ctx.strokeStyle = ratio === params.weber / 100 ? COLORS.log : COLORS.rule;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, formatPercent(ratio, 1), plot.x - 7, y + 3, COLORS.muted, 10, 600, "right");
    });
  }

  function drawPsychometricPanel(ctx, box, result) {
    panel(ctx, box, "two-alternative detection curve", "probability correct at the reference stimulus");
    var plot = { x: box.x + 44, y: box.y + 62, w: box.w - 62, h: box.h - 96 };
    axes(ctx, plot, "relative change", "P(correct)");
    var maxRatio = result.params.weber / 100 * 3;
    function sx(point) { return plot.x + point.ratio / maxRatio * plot.w; }
    function syValue(value) { return plot.y + plot.h - (value - 0.5) / 0.5 * plot.h; }
    drawLine(ctx, result.curves.psychometric, sx, function (p) { return syValue(p.linear); }, COLORS.linear, 1.8);
    drawLine(ctx, result.curves.psychometric, sx, function (p) { return syValue(p.log); }, COLORS.log, 2.5);
    drawLine(ctx, result.curves.psychometric, sx, function (p) { return syValue(p.power); }, COLORS.power, 1.8);
    var wx = plot.x + (result.params.weber / 100) / maxRatio * plot.w;
    var cy = syValue(result.params.criterion / 100);
    ctx.strokeStyle = COLORS.marker;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(wx, plot.y);
    ctx.lineTo(wx, plot.y + plot.h);
    ctx.moveTo(plot.x, cy);
    ctx.lineTo(plot.x + plot.w, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, formatPercent(result.params.weber / 100, 1), wx, plot.y + plot.h + 18, COLORS.marker, 10, 700, "center");
    text(ctx, result.params.criterion + "%", plot.x - 7, cy + 3, COLORS.marker, 10, 700, "right");
  }

  function drawLadderPanel(ctx, box, result) {
    panel(ctx, box, "equal JND ladder", "constant ratios become equal log intervals");
    var values = result.curves.ladder;
    var left = box.x + 18;
    var right = box.x + box.w - 18;
    var top = box.y + 68;
    var linearY = top + 34;
    var logY = top + 104;
    var max = result.params.maxIntensity;
    function xLinear(v) { return left + (v - 1) / (max - 1) * (right - left); }
    function xLog(v) { return left + Math.log(v) / Math.log(max) * (right - left); }
    [[linearY, xLinear, "linear axis"], [logY, xLog, "log axis"]].forEach(function (row) {
      var y = row[0];
      var fn = row[1];
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      values.forEach(function (v, i) {
        if (i % Math.max(1, Math.floor(values.length / 20)) !== 0 && i !== values.length - 1) return;
        var x = fn(v);
        ctx.strokeStyle = i === 0 || i === values.length - 1 ? COLORS.marker : COLORS.log;
        ctx.beginPath();
        ctx.moveTo(x, y - 16);
        ctx.lineTo(x, y + 16);
        ctx.stroke();
      });
      text(ctx, row[2], left, y - 24, COLORS.muted, 11, 650);
    });
    text(ctx, values.length + " equal-ratio steps from 1 to " + formatNumber(values[values.length - 1], 1), left, box.y + box.h - 22, COLORS.text, 12, 720);
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    if (width < 700) {
      var gap = 14;
      var h = Math.floor((height - 3 * gap) / 4);
      drawScalePanel(ctx, { x: 0, y: 0, w: width, h: h }, result);
      drawJndPanel(ctx, { x: 0, y: h + gap, w: width, h: h }, result);
      drawPsychometricPanel(ctx, { x: 0, y: 2 * (h + gap), w: width, h: h }, result);
      drawLadderPanel(ctx, { x: 0, y: 3 * (h + gap), w: width, h: height - 3 * (h + gap) }, result);
    } else {
      var gap2 = 16;
      var w = Math.floor((width - gap2) / 2);
      var h2 = Math.floor((height - gap2) / 2);
      drawScalePanel(ctx, { x: 0, y: 0, w: w, h: h2 }, result);
      drawJndPanel(ctx, { x: w + gap2, y: 0, w: width - w - gap2, h: h2 }, result);
      drawPsychometricPanel(ctx, { x: 0, y: h2 + gap2, w: w, h: height - h2 - gap2 }, result);
      drawLadderPanel(ctx, { x: w + gap2, y: h2 + gap2, w: width - w - gap2, h: height - h2 - gap2 }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      weber: result.params.weber.toFixed(0) + "%",
      exponent: result.params.exponent.toFixed(2),
      criterion: result.params.criterion.toFixed(0) + "%",
      reference: String(result.params.reference),
      maxIntensity: String(result.params.maxIntensity)
    };
    Object.keys(values).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && input.value !== String(result.params[key])) input.value = String(result.params[key]);
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Weber JND", formatPercent(result.refRows.log.ratio, 1)),
        metric("JND at ref", formatNumber(result.refRows.log.delta, 2)),
        metric("Log steps", formatNumber(result.jndStepsAcrossRange, 1)),
        metric("Linear JND at high", formatPercent(result.highRows.linear.ratio, 2)),
        metric("Power JND at high", formatPercent(result.highRows.power.ratio, 2)),
        metric("Audit", result.audit.passed ? "passed" : "check")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "At the reference intensity, all three rulers are normalized to the same " + values.weber +
        " JND. Away from that reference, only the log ruler keeps Delta/I constant.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__psychophysicsResult = result;
  }

  function init(root) {
    if (!root || root.__psychophysicsReady) return;
    root.__psychophysicsReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-psychophysics-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    detectionProbability: detectionProbability,
    evaluate: evaluate,
    inverseNormal: inverseNormal,
    jndAt: jndAt,
    normalCdf: normalCdf,
    threshold: threshold
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PsychophysicsScaleLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
