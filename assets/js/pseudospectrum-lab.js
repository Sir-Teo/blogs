(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    stable: "#0f766e",
    growth: "#dc2626",
    pseudo: "#7c3aed",
    perturb: "#2563eb",
    orange: "#ea580c",
    dark: "#0f172a"
  };

  var DEFAULTS = {
    slow: 35,
    fast: 210,
    coupling: 22,
    epsilon: 4,
    angle: 80,
    seed: 23
  };

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
    var slow = clampInt(readNumber(raw, "slow"), 5, 120);
    var fast = clampInt(readNumber(raw, "fast"), 40, 420);
    return {
      slow: slow,
      fast: Math.max(fast, slow + 10),
      coupling: clampInt(readNumber(raw, "coupling"), 0, 60),
      epsilon: clampInt(readNumber(raw, "epsilon"), 1, 15),
      angle: clampInt(readNumber(raw, "angle"), 0, 180),
      seed: clampInt(readNumber(raw, "seed"), 1, 9999)
    };
  }

  function model(raw) {
    var p = cleanParams(raw);
    return {
      params: p,
      slow: p.slow / 100,
      fast: p.fast / 100,
      coupling: p.coupling,
      epsilon: p.epsilon / 100
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

  function norm2Upper(a, b, d) {
    var tr = a * a + b * b + d * d;
    var det = a * a * d * d;
    var disc = Math.max(0, tr * tr - 4 * det);
    return Math.sqrt(Math.max(0, (tr + Math.sqrt(disc)) / 2));
  }

  function expEntries(m, t) {
    var eFast = Math.exp(-m.fast * t);
    var eSlow = Math.exp(-m.slow * t);
    var off;
    if (Math.abs(m.fast - m.slow) < 1e-12) off = m.coupling * t * eSlow;
    else off = m.coupling * (eSlow - eFast) / (m.fast - m.slow);
    return { a: eFast, b: off, d: eSlow };
  }

  function expNorm(m, t) {
    var e = expEntries(m, t);
    return norm2Upper(e.a, e.b, e.d);
  }

  function vectorAt(m, t, angleDeg) {
    var theta = angleDeg * Math.PI / 180;
    var x0 = Math.cos(theta);
    var y0 = Math.sin(theta);
    var e = expEntries(m, t);
    return {
      x: e.a * x0 + e.b * y0,
      y: e.d * y0,
      norm: Math.sqrt(Math.pow(e.a * x0 + e.b * y0, 2) + Math.pow(e.d * y0, 2))
    };
  }

  function transientRows(m) {
    var rows = [];
    var tMax = Math.max(4 / m.slow, 2.5);
    var peak = { t: 0, norm: 1 };
    for (var i = 0; i <= 220; i += 1) {
      var t = tMax * i / 220;
      var norm = expNorm(m, t);
      var v = vectorAt(m, t, m.params.angle);
      rows.push({ t: t, norm: norm, vectorNorm: v.norm, x: v.x, y: v.y });
      if (norm > peak.norm) peak = { t: t, norm: norm };
    }
    return { rows: rows, peak: peak, tMax: tMax };
  }

  function complexAbs2(re, im) {
    return re * re + im * im;
  }

  function sigmaMinResolventDenominator(m, xr, yi) {
    var aRe = xr + m.fast;
    var dRe = xr + m.slow;
    var aAbs = complexAbs2(aRe, yi);
    var dAbs = complexAbs2(dRe, yi);
    var off = m.coupling;
    var trace = aAbs + dAbs + off * off;
    var det = aAbs * dAbs;
    var disc = Math.max(0, trace * trace - 4 * det);
    return Math.sqrt(Math.max(0, (trace - Math.sqrt(disc)) / 2));
  }

  function resolventNorm(m, xr, yi) {
    var sigmaMin = sigmaMinResolventDenominator(m, xr, yi);
    if (sigmaMin < 1e-12) return 1e12;
    return 1 / sigmaMin;
  }

  function pseudospectrumGrid(m) {
    var xMin = -Math.max(m.fast, m.slow) - 0.8;
    var xMax = Math.max(0.8, m.epsilon * Math.max(1, m.coupling) + 0.18);
    var yMax = Math.max(1.5, Math.min(6.5, 0.75 + m.epsilon * Math.max(1, m.coupling) * 1.6));
    var nx = 132;
    var ny = 94;
    var values = [];
    var threshold = 1 / Math.max(1e-9, m.epsilon);
    var pseudoAbscissa = -Infinity;
    var maxNorm = 0;
    for (var j = 0; j < ny; j += 1) {
      var row = [];
      var y = yMax - 2 * yMax * j / (ny - 1);
      for (var i = 0; i < nx; i += 1) {
        var x = xMin + (xMax - xMin) * i / (nx - 1);
        var rn = resolventNorm(m, x, y);
        maxNorm = Math.max(maxNorm, rn);
        if (rn >= threshold) pseudoAbscissa = Math.max(pseudoAbscissa, x);
        row.push(rn);
      }
      values.push(row);
    }
    return {
      values: values,
      xMin: xMin,
      xMax: xMax,
      yMax: yMax,
      nx: nx,
      ny: ny,
      threshold: threshold,
      maxNorm: maxNorm,
      pseudoAbscissa: pseudoAbscissa === -Infinity ? -Math.min(m.fast, m.slow) : pseudoAbscissa
    };
  }

  function eig2(a, b, c, d) {
    var tr = a + d;
    var det = a * d - b * c;
    var disc = tr * tr - 4 * det;
    if (disc >= 0) {
      var s = Math.sqrt(disc);
      return [
        { re: (tr + s) / 2, im: 0 },
        { re: (tr - s) / 2, im: 0 }
      ];
    }
    var imag = Math.sqrt(-disc) / 2;
    return [
      { re: tr / 2, im: imag },
      { re: tr / 2, im: -imag }
    ];
  }

  function perturbationCloud(m) {
    var rng = makeRng(m.params.seed);
    var rows = [];
    var maxReal = -Infinity;
    for (var i = 0; i < 180; i += 1) {
      var e11 = normal(rng);
      var e12 = normal(rng);
      var e21 = normal(rng);
      var e22 = normal(rng);
      var scale = m.epsilon / Math.sqrt(e11 * e11 + e12 * e12 + e21 * e21 + e22 * e22);
      var vals = eig2(-m.fast + scale * e11, m.coupling + scale * e12, scale * e21, -m.slow + scale * e22);
      vals.forEach(function (value) {
        rows.push(value);
        maxReal = Math.max(maxReal, value.re);
      });
    }
    return { rows: rows, maxReal: maxReal };
  }

  function eigenAngle(m) {
    if (m.coupling === 0) return 90;
    return Math.atan(Math.abs((m.fast - m.slow) / m.coupling)) * 180 / Math.PI;
  }

  function evaluate(raw) {
    var m = model(raw);
    var transient = transientRows(m);
    var grid = pseudospectrumGrid(m);
    var cloud = perturbationCloud(m);
    var angle = eigenAngle(m);
    var spectralAbscissa = -Math.min(m.fast, m.slow);
    var checks = {
      finite: Number.isFinite(transient.peak.norm) && Number.isFinite(grid.maxNorm) && Number.isFinite(cloud.maxReal),
      stableEigenvalues: spectralAbscissa < 0,
      amplificationBound: transient.peak.norm >= 1,
      gridShape: grid.values.length === grid.ny && grid.values[0].length === grid.nx,
      perturbationCount: cloud.rows.length === 360
    };
    return {
      params: m.params,
      model: m,
      transient: transient,
      grid: grid,
      cloud: cloud,
      eigenAngle: angle,
      spectralAbscissa: spectralAbscissa,
      pseudoAbscissa: grid.pseudoAbscissa,
      checks: checks
    };
  }

  function fixed(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="pseudo-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function syncOutputs(root, result) {
    var p = result.params;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      slow: fixed(p.slow / 100, 2),
      fast: fixed(p.fast / 100, 2),
      coupling: p.coupling,
      epsilon: fixed(p.epsilon / 100, 2),
      angle: p.angle,
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
      metric("Eigenvalue abscissa", fixed(result.spectralAbscissa, 2)),
      metric("Peak amplification", fixed(result.transient.peak.norm, 2) + "x"),
      metric("Peak time", fixed(result.transient.peak.t, 2)),
      metric("Eps-pseudo abscissa", fixed(result.pseudoAbscissa, 2)),
      metric("Eigenvector angle", fixed(result.eigenAngle, 1) + " deg"),
      metric("Audit", audit)
    ].join("");
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 680 ? 1100 : 780;
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
      ctx.fillText(fitText(ctx, subtitle, rect.w - 28), rect.x + 14, rect.y + 42);
    }
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var trimmed = text;
    while (trimmed.length > 4 && ctx.measureText(trimmed + "...").width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed.trim() + "...";
  }

  function heatColor(value, threshold) {
    var x = clamp((Math.log10(Math.max(1e-9, value)) - Math.log10(threshold / 8)) / 3, 0, 1);
    var r = clamp(Math.round(245 - 70 * (1 - x) + 18 * x), 0, 255);
    var g = clamp(Math.round(247 - 170 * x), 0, 255);
    var b = clamp(Math.round(250 - 65 * x), 0, 255);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawPseudospectrum(ctx, rect, result) {
    panel(ctx, rect, "Pseudospectrum", "heat is ||(zI - A)^-1||; black dots are eigenvalues");
    var g = result.grid;
    var plot = { x: rect.x + 45, y: rect.y + 58, w: rect.w - 65, h: rect.h - 92 };
    var cellW = plot.w / g.nx;
    var cellH = plot.h / g.ny;
    for (var j = 0; j < g.ny; j += 1) {
      for (var i = 0; i < g.nx; i += 1) {
        ctx.fillStyle = heatColor(g.values[j][i], g.threshold);
        ctx.fillRect(plot.x + i * cellW, plot.y + j * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
    function sx(x) { return plot.x + (x - g.xMin) / (g.xMax - g.xMin) * plot.w; }
    function sy(y) { return plot.y + (g.yMax - y) / (2 * g.yMax) * plot.h; }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.dark;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(sx(0), plot.y);
    ctx.lineTo(sx(0), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    [-result.model.fast, -result.model.slow].forEach(function (x) {
      ctx.fillStyle = COLORS.dark;
      ctx.beginPath();
      ctx.arc(sx(x), sy(0), 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = COLORS.pseudo;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx(result.pseudoAbscissa), sy(-g.yMax));
    ctx.lineTo(sx(result.pseudoAbscissa), sy(g.yMax));
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("Re z", plot.x + plot.w - 30, plot.y + plot.h + 24);
    ctx.fillText("0", sx(0) + 4, plot.y + plot.h + 24);
    ctx.fillText(plot.w < 320 ? "eps edge" : "eps contour right edge", plot.x + 10, rect.y + rect.h - 13);
  }

  function drawTransient(ctx, rect, result) {
    panel(ctx, rect, "Transient growth", "stable spectrum, finite-time growth");
    var plot = { x: rect.x + 48, y: rect.y + 58, w: rect.w - 68, h: rect.h - 94 };
    var rows = result.transient.rows;
    var maxY = Math.max(1.05, result.transient.peak.norm * 1.12);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var k = 0; k <= 4; k += 1) {
      var gy = plot.y + plot.h - plot.h * k / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }
    function sx(t) { return plot.x + t / result.transient.tMax * plot.w; }
    function sy(v) { return plot.y + plot.h - clamp(v / maxY, 0, 1) * plot.h; }
    ctx.strokeStyle = COLORS.growth;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      if (i === 0) ctx.moveTo(sx(row.t), sy(row.norm));
      else ctx.lineTo(sx(row.t), sy(row.norm));
    });
    ctx.stroke();
    ctx.strokeStyle = COLORS.perturb;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      if (i === 0) ctx.moveTo(sx(row.t), sy(row.vectorNorm));
      else ctx.lineTo(sx(row.t), sy(row.vectorNorm));
    });
    ctx.stroke();
    ctx.fillStyle = COLORS.growth;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("operator norm", plot.x, rect.y + 54);
    ctx.fillStyle = COLORS.perturb;
    ctx.fillText("chosen vector", plot.x + 98, rect.y + 54);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("0", plot.x - 18, plot.y + plot.h + 4);
    ctx.fillText(fixed(maxY, 1), plot.x - 32, plot.y + 4);
    ctx.fillText("t", plot.x + plot.w - 8, plot.y + plot.h + 24);
  }

  function drawCloud(ctx, rect, result) {
    panel(ctx, rect, "Perturbed eigenvalues", "random E with ||E||_F = eps");
    var g = result.grid;
    var plot = { x: rect.x + 45, y: rect.y + 58, w: rect.w - 65, h: rect.h - 92 };
    function sx(x) { return plot.x + (x - g.xMin) / (g.xMax - g.xMin) * plot.w; }
    function sy(y) { return plot.y + (g.yMax - y) / (2 * g.yMax) * plot.h; }
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(sx(0), plot.y);
    ctx.lineTo(sx(0), plot.y + plot.h);
    ctx.stroke();
    result.cloud.rows.forEach(function (z) {
      ctx.fillStyle = z.re > 0 ? COLORS.growth : COLORS.perturb;
      ctx.globalAlpha = z.re > 0 ? 0.78 : 0.42;
      ctx.beginPath();
      ctx.arc(sx(z.re), sy(z.im), 2.1, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    [-result.model.fast, -result.model.slow].forEach(function (x) {
      ctx.fillStyle = COLORS.dark;
      ctx.beginPath();
      ctx.arc(sx(x), sy(0), 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("max perturbed Re: " + fixed(result.cloud.maxReal, 2), plot.x + 8, rect.y + rect.h - 14);
  }

  function drawVector(ctx, rect, result) {
    panel(ctx, rect, "Mode geometry", "near-parallel eigenvectors hide energy");
    var cx = rect.x + rect.w * 0.5;
    var cy = rect.y + rect.h * 0.55;
    var radius = Math.min(rect.w, rect.h) * 0.28;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    var angle = result.eigenAngle * Math.PI / 180;
    var v2 = { x: Math.cos(angle), y: Math.sin(angle) };
    function arrow(v, color, label, offset) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * v.x, cy - radius * v.y);
      ctx.stroke();
      ctx.beginPath();
      var endX = cx + radius * v.x;
      var endY = cy - radius * v.y;
      ctx.arc(endX, endY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      var labelWidth = ctx.measureText(label).width;
      var labelX = endX + 8;
      if (labelX + labelWidth > rect.x + rect.w - 8) labelX = endX - labelWidth - 8;
      labelX = clamp(labelX, rect.x + 8, rect.x + rect.w - labelWidth - 8);
      var labelY = clamp(endY + offset, rect.y + 58, rect.y + rect.h - 20);
      ctx.fillText(label, labelX, labelY);
    }
    arrow({ x: 1, y: 0 }, COLORS.stable, "fast eigenvector", 16);
    arrow(v2, COLORS.growth, "slow eigenvector", -12);
    var chosen = result.params.angle * Math.PI / 180;
    arrow({ x: Math.cos(chosen), y: Math.sin(chosen) }, COLORS.perturb, "chosen initial", 14);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("angle: " + fixed(result.eigenAngle, 1) + " deg", rect.x + 16, rect.y + rect.h - 18);
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
      drawPseudospectrum(ctx, { x: pad, y: pad, w: width - pad * 2, h: 300 }, result);
      drawTransient(ctx, { x: pad, y: 330, w: width - pad * 2, h: 250 }, result);
      drawCloud(ctx, { x: pad, y: 596, w: width - pad * 2, h: 240 }, result);
      drawVector(ctx, { x: pad, y: 852, w: width - pad * 2, h: height - 866 }, result);
    } else {
      var colW = (width - pad * 3) / 2;
      drawPseudospectrum(ctx, { x: pad, y: pad, w: colW, h: 390 }, result);
      drawTransient(ctx, { x: pad * 2 + colW, y: pad, w: colW, h: 390 }, result);
      drawCloud(ctx, { x: pad, y: 418, w: colW, h: height - 432 }, result);
      drawVector(ctx, { x: pad * 2 + colW, y: 418, w: colW, h: height - 432 }, result);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__pseudospectrumResult = result;
  }

  function init(root) {
    if (!root || root.__pseudospectrumReady) return;
    root.__pseudospectrumReady = true;
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
    global.document.querySelectorAll("[data-pseudospectrum-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    model: model,
    expEntries: expEntries,
    expNorm: expNorm,
    resolventNorm: resolventNorm,
    pseudospectrumGrid: pseudospectrumGrid,
    perturbationCloud: perturbationCloud,
    evaluate: evaluate,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PseudospectrumLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
