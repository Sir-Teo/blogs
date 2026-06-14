(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    benford: "#7c3aed",
    observed: "#2563eb",
    uniform: "#94a3b8",
    bad: "#dc2626",
    warn: "#ea580c",
    ok: "#15803d",
    digit1: "#0f766e",
    digit2: "#2563eb",
    digit3: "#7c3aed",
    digit4: "#be123c",
    digit5: "#d97706",
    digit6: "#475569",
    digit7: "#0891b2",
    digit8: "#65a30d",
    digit9: "#dc2626"
  };

  var DEFAULTS = {
    mode: "scale-mixture",
    samples: 2400,
    decades: 5,
    roughness: 55,
    human: 0,
    seed: 31
  };

  var MODES = ["scale-mixture", "growth-path", "linear-range", "id-window"];
  var MULTIPLIERS = [1, 1.3, 2, 3, 5, 7, 10];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return min;
    return clamp(Math.round(n), min, max);
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var mode = String(raw.mode || DEFAULTS.mode);
    if (MODES.indexOf(mode) < 0) mode = DEFAULTS.mode;
    return {
      mode: mode,
      samples: clampInt(readNumber(raw, "samples"), 300, 6000),
      decades: clampInt(readNumber(raw, "decades"), 1, 8),
      roughness: clampInt(readNumber(raw, "roughness"), 0, 100),
      human: clampInt(readNumber(raw, "human"), 0, 45),
      seed: clampInt(readNumber(raw, "seed"), 1, 9999)
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

  function normal(rng) {
    var u = Math.max(1e-12, rng());
    var v = Math.max(1e-12, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function frac(value) {
    return value - Math.floor(value);
  }

  function benfordProb(digit) {
    return Math.log10(1 + 1 / digit);
  }

  var BENFORD = [];
  for (var bd = 1; bd <= 9; bd += 1) BENFORD.push(benfordProb(bd));

  function firstDigit(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    var m = Math.pow(10, frac(Math.log10(value)));
    return clamp(Math.floor(m + 1e-12), 1, 9);
  }

  function contaminate(value, params, rng) {
    if (params.human <= 0 || rng() * 100 >= params.human) return value;
    var exponent = Math.floor(Math.log10(value));
    var scale = Math.pow(10, exponent);
    var endings = [1.99, 2.49, 4.90, 4.99, 9.49, 9.90, 9.99];
    var chosen = endings[Math.floor(rng() * endings.length)];
    var jitter = 1 + (rng() - 0.5) * 0.012;
    return Math.max(1e-9, chosen * scale * jitter);
  }

  function generate(params) {
    var p = cleanParams(params);
    var rng = makeRng(p.seed);
    var values = [];
    var logs = [];
    var rough = p.roughness / 100;
    var maxLinear = Math.pow(10, p.decades);
    var growthLog = rng() * 0.7;

    for (var i = 0; i < p.samples; i += 1) {
      var logValue;
      var value;
      if (p.mode === "scale-mixture") {
        var center = Math.floor(rng() * p.decades) + rng();
        logValue = center + normal(rng) * (0.06 + 0.22 * rough);
        value = Math.pow(10, logValue);
      } else if (p.mode === "growth-path") {
        growthLog += 0.0035 * p.decades + normal(rng) * (0.006 + 0.026 * rough);
        logValue = growthLog;
        value = Math.pow(10, logValue);
      } else if (p.mode === "linear-range") {
        value = 1 + rng() * (maxLinear - 1);
        logValue = Math.log10(value);
      } else {
        var start = Math.pow(10, Math.max(2, Math.floor(p.decades / 2) + 2));
        value = start + Math.floor(rng() * 9000);
        logValue = Math.log10(value);
      }
      value = contaminate(value, p, rng);
      values.push(value);
      logs.push(Math.log10(value));
    }

    return { params: p, values: values, logs: logs };
  }

  function digitStats(values, multiplier) {
    var counts = new Array(9).fill(0);
    values.forEach(function (value) {
      var digit = firstDigit(value * (multiplier || 1));
      if (digit >= 1) counts[digit - 1] += 1;
    });
    var total = counts.reduce(function (sum, value) { return sum + value; }, 0);
    var probs = counts.map(function (count) { return total ? count / total : 0; });
    var mad = 0;
    var tvdUniform = 0;
    var chi = 0;
    var maxGap = 0;
    for (var i = 0; i < 9; i += 1) {
      var gap = probs[i] - BENFORD[i];
      mad += Math.abs(gap);
      maxGap = Math.max(maxGap, Math.abs(gap));
      chi += total * gap * gap / Math.max(1e-12, BENFORD[i]);
      tvdUniform += Math.abs(probs[i] - 1 / 9);
    }
    return {
      counts: counts,
      probs: probs,
      total: total,
      mad: mad / 9,
      chiSquare: chi,
      maxGap: maxGap,
      tvdUniform: tvdUniform / 2
    };
  }

  function mantissaStats(logs) {
    var bins = new Array(24).fill(0);
    var mantissas = logs.map(frac).sort(function (a, b) { return a - b; });
    mantissas.forEach(function (m) {
      bins[Math.min(bins.length - 1, Math.floor(m * bins.length))] += 1;
    });
    var total = Math.max(1, mantissas.length);
    var ks = 0;
    for (var i = 0; i < mantissas.length; i += 1) {
      var hi = (i + 1) / total;
      var lo = i / total;
      ks = Math.max(ks, Math.abs(hi - mantissas[i]), Math.abs(mantissas[i] - lo));
    }
    return {
      bins: bins.map(function (count) { return count / total; }),
      ks: ks,
      mantissas: mantissas
    };
  }

  function scaleTest(values) {
    var rows = [];
    var base = digitStats(values, 1).probs;
    MULTIPLIERS.forEach(function (multiplier) {
      var stats = digitStats(values, multiplier);
      var drift = 0;
      for (var i = 0; i < 9; i += 1) drift += Math.abs(stats.probs[i] - base[i]);
      rows.push({
        multiplier: multiplier,
        mad: stats.mad,
        chiSquare: stats.chiSquare,
        drift: drift / 2
      });
    });
    return rows;
  }

  function sampleRows(data) {
    var rows = [];
    var n = data.values.length;
    var step = Math.max(1, Math.floor(n / 180));
    for (var i = 0; i < n && rows.length < 180; i += step) {
      rows.push({
        value: data.values[i],
        log: data.logs[i],
        mantissa: frac(data.logs[i]),
        digit: firstDigit(data.values[i])
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var data = generate(raw);
    var stats = digitStats(data.values, 1);
    var mantissa = mantissaStats(data.logs);
    var scale = scaleTest(data.values);
    var maxScaleMad = scale.reduce(function (best, row) { return Math.max(best, row.mad); }, 0);
    var maxScaleDrift = scale.reduce(function (best, row) { return Math.max(best, row.drift); }, 0);
    var verdict = "Benford-like";
    if (stats.mad > 0.025 || mantissa.ks > 0.08 || maxScaleDrift > 0.09) verdict = "needs a model";
    if (stats.mad > 0.055 || mantissa.ks > 0.15 || maxScaleDrift > 0.18) verdict = "not Benford";
    var checks = {
      finite: data.values.every(Number.isFinite) && Number.isFinite(stats.chiSquare),
      digitAccounting: stats.counts.reduce(function (sum, count) { return sum + count; }, 0) === data.params.samples,
      mantissaRange: mantissa.mantissas.every(function (m) { return m >= 0 && m < 1; }),
      benfordNormalizes: Math.abs(BENFORD.reduce(function (s, p) { return s + p; }, 0) - 1) < 1e-12,
      scaleRows: scale.length === MULTIPLIERS.length
    };
    return {
      params: data.params,
      values: data.values,
      logs: data.logs,
      sample: sampleRows(data),
      stats: stats,
      mantissa: mantissa,
      scale: scale,
      maxScaleMad: maxScaleMad,
      maxScaleDrift: maxScaleDrift,
      verdict: verdict,
      checks: checks
    };
  }

  function pct(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function fixed(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="benford-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function syncOutputs(root, result) {
    var p = result.params;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      samples: p.samples,
      decades: p.decades,
      roughness: p.roughness,
      human: p.human + "%",
      seed: p.seed
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (values[key] != null) output.textContent = values[key];
    });
  }

  function modeLabel(mode) {
    if (mode === "scale-mixture") return "scale mixture";
    if (mode === "growth-path") return "growth path";
    if (mode === "linear-range") return "linear range";
    return "ID window";
  }

  function renderMetrics(root, result) {
    var target = root.querySelector("[data-metrics]");
    if (!target) return;
    var audit = Object.keys(result.checks).every(function (key) { return result.checks[key]; }) ? "passed" : "check";
    target.innerHTML = [
      metric("Generator", modeLabel(result.params.mode)),
      metric("First-digit MAD", pct(result.stats.mad, 2)),
      metric("Mantissa KS", fixed(result.mantissa.ks, 3)),
      metric("Scale drift", pct(result.maxScaleDrift, 1)),
      metric("Verdict", result.verdict),
      metric("Audit", audit)
    ].join("");
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 680 ? 1080 : 760;
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
      ctx.fillText(subtitle, rect.x + 14, rect.y + 42);
    }
  }

  function drawAxes(ctx, plot) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h - plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function digitColor(digit) {
    return COLORS["digit" + digit] || COLORS.observed;
  }

  function drawDigitPanel(ctx, rect, result) {
    panel(ctx, rect, "First digits", "bars are observed; dots are Benford probabilities");
    var plot = { x: rect.x + 40, y: rect.y + 58, w: rect.w - 58, h: rect.h - 92 };
    drawAxes(ctx, plot);
    var maxY = Math.max(0.34, Math.max.apply(null, result.stats.probs) * 1.15);
    var band = plot.w / 9;
    for (var i = 0; i < 9; i += 1) {
      var x = plot.x + i * band + band * 0.17;
      var w = band * 0.64;
      var barH = plot.h * result.stats.probs[i] / maxY;
      ctx.fillStyle = digitColor(i + 1);
      ctx.globalAlpha = 0.82;
      ctx.fillRect(x, plot.y + plot.h - barH, w, barH);
      ctx.globalAlpha = 1;
      var yBenford = plot.y + plot.h - plot.h * BENFORD[i] / maxY;
      ctx.fillStyle = COLORS.benford;
      ctx.beginPath();
      ctx.arc(x + w / 2, yBenford, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(String(i + 1), x + w / 2 - 3, plot.y + plot.h + 18);
    }
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("digit", plot.x + plot.w - 26, plot.y + plot.h + 34);
    ctx.fillText("0", plot.x - 18, plot.y + plot.h + 4);
    ctx.fillText(pct(maxY, 0), plot.x - 34, plot.y + 4);
  }

  function drawMantissaPanel(ctx, rect, result) {
    panel(ctx, rect, "Mantissas", "fractional parts of log10(value)");
    var plot = { x: rect.x + 40, y: rect.y + 58, w: rect.w - 58, h: rect.h - 92 };
    drawAxes(ctx, plot);
    var bins = result.mantissa.bins;
    var maxY = Math.max.apply(null, bins.concat([1 / bins.length])) * 1.2;
    var band = plot.w / bins.length;
    for (var i = 0; i < bins.length; i += 1) {
      var barH = plot.h * bins[i] / maxY;
      ctx.fillStyle = COLORS.observed;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(plot.x + i * band + 1, plot.y + plot.h - barH, Math.max(1, band - 2), barH);
      ctx.globalAlpha = 1;
    }
    var uniformY = plot.y + plot.h - plot.h * (1 / bins.length) / maxY;
    ctx.strokeStyle = COLORS.benford;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, uniformY);
    ctx.lineTo(plot.x + plot.w, uniformY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("0", plot.x - 12, plot.y + plot.h + 18);
    ctx.fillText("1", plot.x + plot.w - 6, plot.y + plot.h + 18);
    ctx.fillText("uniform mantissa", plot.x + 8, rect.y + rect.h - 14);
  }

  function drawScalePanel(ctx, rect, result) {
    panel(ctx, rect, "Scale stress test", "multiply every number and retest the digits");
    var plot = { x: rect.x + 46, y: rect.y + 58, w: rect.w - 66, h: rect.h - 92 };
    drawAxes(ctx, plot);
    var maxY = Math.max(0.06, Math.max.apply(null, result.scale.map(function (row) {
      return Math.max(row.mad, row.drift);
    })) * 1.25);
    var band = plot.w / result.scale.length;
    result.scale.forEach(function (row, i) {
      var x = plot.x + i * band + band * 0.24;
      var madH = plot.h * row.mad / maxY;
      var driftH = plot.h * row.drift / maxY;
      ctx.fillStyle = COLORS.benford;
      ctx.fillRect(x, plot.y + plot.h - madH, band * 0.2, madH);
      ctx.fillStyle = COLORS.warn;
      ctx.fillRect(x + band * 0.25, plot.y + plot.h - driftH, band * 0.2, driftH);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(String(row.multiplier), x - 2, plot.y + plot.h + 18);
    });
    ctx.fillStyle = COLORS.benford;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("MAD", plot.x, rect.y + 48);
    ctx.fillStyle = COLORS.warn;
    ctx.fillText("drift from original", plot.x + 42, rect.y + 48);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("x multiplier", plot.x + plot.w - 72, plot.y + plot.h + 34);
  }

  function drawMapPanel(ctx, rect, result) {
    panel(ctx, rect, "Log-scale map", "same numbers, viewed where first digits live");
    var plot = { x: rect.x + 28, y: rect.y + 58, w: rect.w - 46, h: rect.h - 88 };
    var logs = result.logs;
    var minLog = Math.min.apply(null, logs);
    var maxLog = Math.max.apply(null, logs);
    if (maxLog <= minLog) maxLog = minLog + 1;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    for (var d = Math.floor(minLog); d <= Math.ceil(maxLog); d += 1) {
      var gx = plot.x + (d - minLog) / (maxLog - minLog) * plot.w;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y);
      ctx.lineTo(gx, plot.y + plot.h);
      ctx.stroke();
    }
    result.sample.forEach(function (row, i) {
      var x = plot.x + (row.log - minLog) / (maxLog - minLog) * plot.w;
      var y = plot.y + 10 + ((i * 37) % Math.max(12, plot.h - 20));
      ctx.fillStyle = digitColor(row.digit);
      ctx.globalAlpha = 0.64;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("log10(value)", plot.x + plot.w - 76, plot.y + plot.h + 24);
    ctx.fillText(fixed(minLog, 1), plot.x, plot.y + plot.h + 24);
    ctx.fillText(fixed(maxLog, 1), plot.x + plot.w - 24, plot.y + plot.h + 24);
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
    if (width < 680) {
      drawDigitPanel(ctx, { x: pad, y: pad, w: width - pad * 2, h: 250 }, result);
      drawMantissaPanel(ctx, { x: pad, y: 280, w: width - pad * 2, h: 245 }, result);
      drawScalePanel(ctx, { x: pad, y: 540, w: width - pad * 2, h: 245 }, result);
      drawMapPanel(ctx, { x: pad, y: 800, w: width - pad * 2, h: height - 814 }, result);
    } else {
      var colW = (width - pad * 3) / 2;
      drawDigitPanel(ctx, { x: pad, y: pad, w: colW, h: 340 }, result);
      drawMantissaPanel(ctx, { x: pad * 2 + colW, y: pad, w: colW, h: 340 }, result);
      drawScalePanel(ctx, { x: pad, y: 368, w: colW, h: height - 382 }, result);
      drawMapPanel(ctx, { x: pad * 2 + colW, y: 368, w: colW, h: height - 382 }, result);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__benfordResult = result;
  }

  function init(root) {
    if (!root || root.__benfordReady) return;
    root.__benfordReady = true;
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
    global.document.querySelectorAll("[data-benford-scale-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    benfordProb: benfordProb,
    firstDigit: firstDigit,
    generate: generate,
    digitStats: digitStats,
    mantissaStats: mantissaStats,
    scaleTest: scaleTest,
    evaluate: evaluate,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.BenfordScaleLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
