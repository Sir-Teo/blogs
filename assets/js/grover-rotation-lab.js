(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    good: "#0f766e",
    bad: "#be123c",
    ideal: "#2563eb",
    actual: "#7c3aed",
    amber: "#b45309",
    faintBlue: "#dbeafe",
    faintTeal: "#ccfbf1"
  };

  var DEFAULTS = {
    qubits: 12,
    marked: 1,
    iterations: 50,
    phaseError: 0
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var qubits = clamp(Math.round(number(raw, "qubits")), 6, 18);
    var n = Math.pow(2, qubits);
    var marked = clamp(Math.round(number(raw, "marked")), 1, Math.min(512, n - 1));
    return {
      qubits: qubits,
      n: n,
      marked: marked,
      iterations: clamp(Math.round(number(raw, "iterations")), 0, 640),
      phaseError: clamp(Math.round(number(raw, "phaseError")), -35, 35)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (digits != null) return value.toFixed(digits);
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="grover-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function c(re, im) {
    return { re: re, im: im };
  }

  function cadd(a, b) {
    return c(a.re + b.re, a.im + b.im);
  }

  function cmul(a, b) {
    return c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  }

  function cscale(a, s) {
    return c(a.re * s, a.im * s);
  }

  function cabs2(a) {
    return a.re * a.re + a.im * a.im;
  }

  function phase(degrees) {
    var angle = Math.PI + degrees * Math.PI / 180;
    return c(Math.cos(angle), Math.sin(angle));
  }

  function baseGeometry(params) {
    var a = params.marked / params.n;
    var theta = Math.asin(Math.sqrt(a));
    var classicalExpected = (params.n + 1) / (params.marked + 1);
    var approximatePeak = Math.max(0, Math.round(Math.PI / (4 * theta) - 0.5));
    var scanLimit = clamp(Math.ceil(Math.PI / (2 * theta)) + 2, 2, 1400);
    var bestT = 0;
    var bestP = 0;
    for (var t = 0; t <= scanLimit; t += 1) {
      var p = idealSuccess(theta, t);
      if (p > bestP) {
        bestP = p;
        bestT = t;
      }
    }
    return {
      a: a,
      theta: theta,
      sGood: Math.sqrt(a),
      sBad: Math.sqrt(1 - a),
      approximatePeak: approximatePeak,
      bestT: bestT,
      bestP: bestP,
      classicalExpected: classicalExpected
    };
  }

  function idealSuccess(theta, iterations) {
    var angle = (2 * iterations + 1) * theta;
    var s = Math.sin(angle);
    return s * s;
  }

  function sequence(params, maxIterations, phaseError) {
    var geom = baseGeometry(params);
    var p = phase(phaseError);
    var d = c(p.re - 1, p.im);
    var good = c(geom.sGood, 0);
    var bad = c(geom.sBad, 0);
    var rows = [];

    for (var t = 0; t <= maxIterations; t += 1) {
      rows.push({
        t: t,
        good: good,
        bad: bad,
        success: clamp(cabs2(good), 0, 1),
        norm: cabs2(good) + cabs2(bad),
        ideal: idealSuccess(geom.theta, t)
      });
      if (t === maxIterations) break;

      var afterOracleGood = cmul(p, good);
      var afterOracleBad = bad;
      var dot = cadd(cscale(afterOracleGood, geom.sGood), cscale(afterOracleBad, geom.sBad));
      good = cadd(afterOracleGood, cscale(cmul(d, dot), geom.sGood));
      bad = cadd(afterOracleBad, cscale(cmul(d, dot), geom.sBad));
    }

    return rows;
  }

  function phaseSweep(params, iteration) {
    var rows = [];
    for (var error = -35; error <= 35; error += 2.5) {
      var seq = sequence(params, iteration, error);
      rows.push({ error: error, success: seq[seq.length - 1].success });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var geom = baseGeometry(params);
    var maxIterations = clamp(Math.max(params.iterations, geom.bestT * 2 + 6, 20), 20, 1400);
    var rows = sequence(params, maxIterations, params.phaseError);
    var current = rows[params.iterations];
    var actualBest = rows.reduce(function (best, row) {
      return row.success > best.success ? row : best;
    }, rows[0]);
    var idealCurrent = idealSuccess(geom.theta, params.iterations);
    var sweep = phaseSweep(params, geom.bestT);
    var uniformPerItem = 1 / params.n;
    var markedPerItem = current.success / params.marked;
    var unmarkedPerItem = (1 - current.success) / Math.max(1, params.n - params.marked);
    var normError = Math.abs(current.norm - 1);
    var speedup = geom.classicalExpected / Math.max(1, geom.bestT);

    return {
      params: params,
      geom: geom,
      rows: rows,
      current: current,
      actualBest: actualBest,
      idealCurrent: idealCurrent,
      sweep: sweep,
      ledger: {
        uniformPerItem: uniformPerItem,
        markedPerItem: markedPerItem,
        unmarkedPerItem: unmarkedPerItem,
        markedLift: markedPerItem / uniformPerItem,
        unmarkedLift: unmarkedPerItem / uniformPerItem
      },
      checks: {
        probabilityFinite: Number.isFinite(current.success),
        probabilityBounded: current.success >= -1e-9 && current.success <= 1 + 1e-9,
        normPreserved: normError < 1e-9,
        bestIterationFinite: Number.isFinite(geom.bestT)
      },
      speedup: speedup,
      normError: normError
    };
  }

  function updateControls(root, params) {
    Object.keys(DEFAULTS).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && String(input.value) !== String(params[key])) input.value = params[key];
    });
    var marked = root.querySelector('[data-param="marked"]');
    if (marked) marked.max = String(Math.min(512, params.n - 1));
  }

  function updateOutputs(root, result) {
    root.querySelectorAll("[data-output]").forEach(function (node) {
      var key = node.getAttribute("data-output");
      if (key === "n") node.textContent = "2^" + result.params.qubits + " = " + formatNumber(result.params.n);
      else if (key === "marked") node.textContent = String(result.params.marked);
      else if (key === "iterations") node.textContent = String(result.params.iterations);
      else if (key === "phaseError") node.textContent = (result.params.phaseError >= 0 ? "+" : "") + result.params.phaseError + " deg";
      else if (key === "qubits") node.textContent = String(result.params.qubits);
    });
  }

  function updateMetrics(root, result) {
    var node = root.querySelector("[data-metrics]");
    if (!node) return;
    var audit = result.checks.probabilityFinite && result.checks.probabilityBounded && result.checks.normPreserved && result.checks.bestIterationFinite ? "pass" : "check";
    node.innerHTML = [
      metric("Search space", "N = " + formatNumber(result.params.n)),
      metric("Marked fraction", "a = " + formatNumber(result.geom.a, 5)),
      metric("First peak", result.geom.bestT + " queries"),
      metric("Current success", formatPercent(result.current.success, 2)),
      metric("Classical mean", formatNumber(result.geom.classicalExpected) + " probes"),
      metric("Audit", audit)
    ].join("");
  }

  function setupCanvas(canvas, height) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var dpr = clamp(global.devicePixelRatio || 1, 1, 2);
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function roundedRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 16, box.y + 27, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, box.x + 16, box.y + 45, 10, COLORS.muted, 600);
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawGeometryPanel(ctx, result, box) {
    panel(ctx, box, "two-amplitude plane", "the algorithm rotates toward the marked axis");
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2 + 22;
    var radius = Math.min(box.w, box.h) * 0.34;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(cx - radius - 8, cy);
    ctx.lineTo(cx + radius + 8, cy);
    ctx.moveTo(cx, cy + radius + 8);
    ctx.lineTo(cx, cy - radius - 8);
    ctx.stroke();
    drawText(ctx, "marked", cx + radius + 10, cy + 4, 10, COLORS.good, 700);
    drawText(ctx, "unmarked", cx + 8, cy - radius - 10, 10, COLORS.bad, 700);

    function map(vx, vy) {
      return { x: cx + vx * radius, y: cy - vy * radius };
    }

    var maxDots = Math.min(result.rows.length, 140);
    var stride = Math.max(1, Math.floor(result.rows.length / maxDots));
    ctx.fillStyle = COLORS.faintBlue;
    for (var i = 0; i < result.rows.length; i += stride) {
      var angle = (2 * result.rows[i].t + 1) * result.geom.theta;
      var p = map(Math.sin(angle), Math.cos(angle));
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    var start = map(result.geom.sGood, result.geom.sBad);
    var currentAngle = (2 * result.params.iterations + 1) * result.geom.theta;
    var current = map(Math.sin(currentAngle), Math.cos(currentAngle));
    var target = map(1, 0);

    ctx.strokeStyle = COLORS.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(start.x, start.y);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.beginPath();
    ctx.arc(start.x, start.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COLORS.ideal;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    ctx.fillStyle = COLORS.ideal;
    ctx.beginPath();
    ctx.arc(current.x, current.y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.good;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
    ctx.fill();
    drawText(ctx, "start", start.x + 7, start.y - 7, 10, COLORS.muted, 650);
    drawText(ctx, "query " + result.params.iterations, current.x + 7, current.y - 7, 10, COLORS.ideal, 760);
    drawText(ctx, "all marked", target.x - 4, target.y + 18, 10, COLORS.good, 700, "center");
  }

  function drawCurvePanel(ctx, result, box) {
    panel(ctx, box, "success over oracle calls", "one call too many can rotate past the answer");
    var plot = { x: box.x + 44, y: box.y + 65, w: box.w - 70, h: box.h - 108 };
    drawAxis(ctx, plot);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h - g / 4 * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }

    function xy(row, value) {
      return {
        x: plot.x + row.t / result.rows[result.rows.length - 1].t * plot.w,
        y: plot.y + plot.h - clamp(value, 0, 1) * plot.h
      };
    }

    ctx.strokeStyle = COLORS.ideal;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    result.rows.forEach(function (row, index) {
      var p = xy(row, row.ideal);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    ctx.strokeStyle = COLORS.actual;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    result.rows.forEach(function (row, index) {
      var p = xy(row, row.success);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    var current = xy(result.current, result.current.success);
    ctx.fillStyle = COLORS.actual;
    ctx.beginPath();
    ctx.arc(current.x, current.y, 5, 0, Math.PI * 2);
    ctx.fill();

    var peakX = plot.x + result.geom.bestT / result.rows[result.rows.length - 1].t * plot.w;
    ctx.strokeStyle = COLORS.good;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(peakX, plot.y);
    ctx.lineTo(peakX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "first peak", peakX + 5, plot.y + 14, 10, COLORS.good, 700);
    drawText(ctx, "0", plot.x, plot.y + plot.h + 18, 10, COLORS.muted, 650);
    drawText(ctx, String(result.rows[result.rows.length - 1].t), plot.x + plot.w, plot.y + plot.h + 18, 10, COLORS.muted, 650, "right");
    drawText(ctx, "ideal", plot.x + 8, plot.y + 16, 10, COLORS.ideal, 760);
    drawText(ctx, "actual phase", plot.x + 52, plot.y + 16, 10, COLORS.actual, 760);
  }

  function drawLedgerPanel(ctx, result, box) {
    panel(ctx, box, "measurement ledger", "amplitude moves probability mass, not labels");
    var x = box.x + 34;
    var y = box.y + 72;
    var w = box.w - 68;
    var barH = 24;
    var success = clamp(result.current.success, 0, 1);

    ctx.fillStyle = COLORS.bad;
    ctx.globalAlpha = 0.16;
    roundedRect(ctx, x, y, w, barH, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.good;
    roundedRect(ctx, x, y, w * success, barH, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.stroke();
    drawText(ctx, "marked probability " + formatPercent(success, 2), x, y - 10, 11, COLORS.good, 760);
    drawText(ctx, "unmarked " + formatPercent(1 - success, 2), x + w, y - 10, 11, COLORS.bad, 760, "right");

    var rows = [
      { label: "per marked item", value: result.ledger.markedLift, color: COLORS.good },
      { label: "per unmarked item", value: result.ledger.unmarkedLift, color: COLORS.bad },
      { label: "query speedup", value: result.speedup, color: COLORS.ideal }
    ];
    var max = Math.max.apply(null, rows.map(function (row) { return Math.log10(Math.max(1e-9, row.value)); }));
    max = Math.max(1, max);
    rows.forEach(function (row, index) {
      var yy = y + 58 + index * 50;
      var logValue = Math.log10(Math.max(1e-9, row.value));
      var len = clamp(logValue / max, 0, 1) * w;
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.rule;
      roundedRect(ctx, x, yy, w, 16, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = row.color;
      roundedRect(ctx, x, yy, len, 16, 5);
      ctx.fill();
      drawText(ctx, row.label, x, yy - 8, 10, COLORS.muted, 650);
      drawText(ctx, formatNumber(row.value, row.value < 10 ? 2 : 1) + "x", x + w, yy - 8, 10, row.color, 760, "right");
    });

    drawText(ctx, "uniform baseline = one over N", x, box.y + box.h - 22, 10, COLORS.muted, 650);
  }

  function drawPhasePanel(ctx, result, box) {
    panel(ctx, box, "phase calibration", "wrong reflections miss the peak coherently");
    var plot = { x: box.x + 44, y: box.y + 65, w: box.w - 70, h: box.h - 108 };
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h - g / 4 * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }

    function xFor(error) {
      return plot.x + (error + 35) / 70 * plot.w;
    }

    ctx.strokeStyle = COLORS.actual;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    result.sweep.forEach(function (row, index) {
      var x = xFor(row.error);
      var y = plot.y + plot.h - row.success * plot.h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    var currentX = xFor(result.params.phaseError);
    var currentY = plot.y + plot.h - sequence(result.params, result.geom.bestT, result.params.phaseError)[result.geom.bestT].success * plot.h;
    ctx.fillStyle = COLORS.actual;
    ctx.beginPath();
    ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
    ctx.fill();

    var zeroX = xFor(0);
    ctx.strokeStyle = COLORS.good;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(zeroX, plot.y);
    ctx.lineTo(zeroX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "-35 deg", plot.x, plot.y + plot.h + 18, 10, COLORS.muted, 650);
    drawText(ctx, "+35 deg", plot.x + plot.w, plot.y + plot.h + 18, 10, COLORS.muted, 650, "right");
    drawText(ctx, "at first peak query " + result.geom.bestT, plot.x + 8, plot.y + 16, 10, COLORS.actual, 760);
  }

  function draw(result, canvas) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var compact = width < 650;
    var prepared = setupCanvas(canvas, compact ? 1120 : 760);
    var ctx = prepared.ctx;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = prepared.width - 2 * pad;

    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawGeometryPanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawCurvePanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawLedgerPanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawPhasePanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }

    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawGeometryPanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawCurvePanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawLedgerPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawPhasePanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function renderOne(root) {
    var result = evaluate(readParams(root));
    updateControls(root, result.params);
    updateOutputs(root, result);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__groverResult = result;
  }

  function initOne(root) {
    if (root.__groverReady) return;
    root.__groverReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { renderOne(root); }, 70);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__groverResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__groverResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__groverResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__groverResult, canvas);
        }
      });
    }
    renderOne(root);
  }

  function init() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-grover-rotation-lab]")).forEach(initOne);
  }

  var api = {
    baseGeometry: baseGeometry,
    cleanParams: cleanParams,
    evaluate: evaluate,
    idealSuccess: idealSuccess,
    sequence: sequence
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.GroverRotationLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
