(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    best: "#64748b",
    target: "#be123c",
    sketch: "#2563eb",
    power: "#0f766e",
    amber: "#b45309",
    violet: "#7c3aed"
  };

  var DEFAULTS = {
    n: 96,
    targetRank: 12,
    oversampling: 8,
    power: 1,
    decay: 91,
    floor: 4,
    reps: 10,
    seed: 17
  };

  var P_GRID = [0, 2, 4, 6, 8, 12, 16, 20, 24];
  var Q_GRID = [0, 1, 2, 3];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32((index + 1) | 0, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 11, seed));
    var u2 = uniform(index * 2 + 12, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="rsvd-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function readState(container, previous) {
    var raw = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var n = clamp(Math.round(raw.n == null ? DEFAULTS.n : raw.n), 48, 128);
    var targetRank = clamp(Math.round(raw.targetRank == null ? DEFAULTS.targetRank : raw.targetRank), 4, Math.min(32, n - 8));
    var maxOversampling = Math.max(0, Math.min(24, n - targetRank - 1));
    return {
      decay: clamp(raw.decay == null ? DEFAULTS.decay : Number(raw.decay), 70, 98),
      floor: clamp(raw.floor == null ? DEFAULTS.floor : Number(raw.floor), 0, 16),
      n: n,
      oversampling: clamp(Math.round(raw.oversampling == null ? DEFAULTS.oversampling : raw.oversampling), 0, maxOversampling),
      power: clamp(Math.round(raw.power == null ? DEFAULTS.power : raw.power), 0, 3),
      reps: clamp(Math.round(raw.reps == null ? DEFAULTS.reps : raw.reps), 3, 16),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 99),
      targetRank: targetRank
    };
  }

  function updateOutputs(container, params) {
    var display = {
      decay: (params.decay / 100).toFixed(2),
      floor: params.floor.toFixed(0) + "%",
      n: String(params.n),
      oversampling: String(params.oversampling),
      power: String(params.power),
      reps: String(params.reps),
      seed: String(params.seed),
      targetRank: String(params.targetRank)
    };
    Object.keys(display).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = display[key];
      });
    });
  }

  function spectrum(params) {
    var ratio = params.decay / 100;
    var floor = params.floor / 100;
    var values = [];
    var top = 0;
    for (var i = 0; i < params.n; i += 1) {
      var knee = Math.pow(ratio, i);
      var tail = floor * Math.pow(0.992, i);
      var ripple = 1 + 0.018 * Math.sin((i + 1) * 1.7);
      var s = Math.max(1e-8, (knee + tail) * ripple);
      if (i === 0) top = s;
      values.push(s / top);
    }
    return values;
  }

  function tailEnergy(sigmas, start) {
    var sum = 0;
    for (var i = Math.max(0, start); i < sigmas.length; i += 1) sum += sigmas[i] * sigmas[i];
    return sum;
  }

  function sampleColumns(sigmas, ell, q, seed) {
    var n = sigmas.length;
    var cols = [];
    var exponent = 2 * q + 1;
    for (var c = 0; c < ell; c += 1) {
      var col = [];
      for (var r = 0; r < n; r += 1) {
        col.push(Math.pow(sigmas[r], exponent) * normal(r * 4099 + c * 131, seed));
      }
      cols.push(col);
    }
    return cols;
  }

  function dot(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += a[i] * b[i];
    return sum;
  }

  function norm(a) {
    return Math.sqrt(Math.max(0, dot(a, a)));
  }

  function subtractScaled(a, b, scale) {
    for (var i = 0; i < a.length; i += 1) a[i] -= scale * b[i];
  }

  function normalize(a, scale) {
    for (var i = 0; i < a.length; i += 1) a[i] /= scale;
  }

  function basisVector(n, index) {
    var v = new Array(n).fill(0);
    v[index % n] = 1;
    return v;
  }

  function orthonormalize(cols, n) {
    var q = [];
    cols.forEach(function (source, c) {
      var v = source.slice();
      for (var pass = 0; pass < 2; pass += 1) {
        q.forEach(function (basis) {
          subtractScaled(v, basis, dot(v, basis));
        });
      }
      var length = norm(v);
      if (length < 1e-10) {
        v = basisVector(n, c * 37 + 11);
        for (var retry = 0; retry < 2; retry += 1) {
          q.forEach(function (basis) {
            subtractScaled(v, basis, dot(v, basis));
          });
        }
        length = norm(v);
      }
      if (length > 1e-10) {
        normalize(v, length);
        q.push(v);
      }
    });
    return q;
  }

  function rowCapture(qCols, n) {
    var rows = new Array(n).fill(0);
    qCols.forEach(function (col) {
      for (var i = 0; i < n; i += 1) rows[i] += col[i] * col[i];
    });
    return rows.map(function (x) { return clamp(x, 0, 1); });
  }

  function runOnce(sigmas, params, oversampling, power, rep) {
    var ell = Math.min(params.n - 1, params.targetRank + oversampling);
    var seed = (params.seed * 100003 + rep * 9176 + power * 257 + oversampling * 73) >>> 0;
    var qCols = orthonormalize(sampleColumns(sigmas, ell, power, seed), params.n);
    var capture = rowCapture(qCols, params.n);
    var residualEnergy = 0;
    var capturedEnergy = 0;
    var topEnergy = 0;
    var topCaptured = 0;
    for (var i = 0; i < params.n; i += 1) {
      var e = sigmas[i] * sigmas[i];
      residualEnergy += e * (1 - capture[i]);
      capturedEnergy += e * capture[i];
      if (i < params.targetRank) {
        topEnergy += e;
        topCaptured += e * capture[i];
      }
    }
    return {
      capture: capture,
      capturedEnergy: capturedEnergy,
      ell: ell,
      residual: Math.sqrt(Math.max(0, residualEnergy)),
      topCaptured: topCaptured / Math.max(1e-12, topEnergy)
    };
  }

  function summarizeRuns(sigmas, params, oversampling, power, reps) {
    var rows = [];
    var meanCapture = new Array(params.n).fill(0);
    var residualSum = 0;
    var topCapturedSum = 0;
    var capturedEnergySum = 0;
    var ell = Math.min(params.n - 1, params.targetRank + oversampling);
    var bestTarget = Math.sqrt(tailEnergy(sigmas, params.targetRank));
    var bestSketch = Math.sqrt(tailEnergy(sigmas, ell));
    for (var rep = 0; rep < reps; rep += 1) {
      var row = runOnce(sigmas, params, oversampling, power, rep);
      rows.push(row);
      residualSum += row.residual;
      topCapturedSum += row.topCaptured;
      capturedEnergySum += row.capturedEnergy;
      for (var i = 0; i < meanCapture.length; i += 1) meanCapture[i] += row.capture[i] / reps;
    }
    rows.sort(function (a, b) { return a.residual - b.residual; });
    var meanResidual = residualSum / reps;
    return {
      bestSketch: bestSketch,
      bestTarget: bestTarget,
      capture: meanCapture,
      capturedEnergy: capturedEnergySum / reps,
      ell: ell,
      meanResidual: meanResidual,
      overSketchFloor: meanResidual / Math.max(1e-12, bestSketch),
      overTargetFloor: meanResidual / Math.max(1e-12, bestTarget),
      p10: rows[Math.floor(0.1 * (rows.length - 1))].residual / Math.max(1e-12, bestTarget),
      p90: rows[Math.ceil(0.9 * (rows.length - 1))].residual / Math.max(1e-12, bestTarget),
      power: power,
      oversampling: oversampling,
      topCaptured: topCapturedSum / reps
    };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var sigmas = spectrum(params);
    var current = summarizeRuns(sigmas, params, params.oversampling, params.power, params.reps);
    var noPower = summarizeRuns(sigmas, params, params.oversampling, 0, params.reps);
    var sweepReps = Math.min(params.reps, 8);
    var pSweep = P_GRID.filter(function (p) {
      return params.targetRank + p < params.n;
    }).map(function (p) {
      return summarizeRuns(sigmas, params, p, params.power, sweepReps);
    });
    var qSweep = Q_GRID.map(function (q) {
      return summarizeRuns(sigmas, params, params.oversampling, q, sweepReps);
    });
    return {
      current: current,
      noPower: noPower,
      params: params,
      pSweep: pSweep,
      qSweep: qSweep,
      sigmas: sigmas,
      totalNorm: Math.sqrt(tailEnergy(sigmas, 0))
    };
  }

  function updateMetrics(node, result) {
    var c = result.current;
    var passCount = 2 * result.params.power + 1;
    node.innerHTML = [
      metric("Samples", c.ell + " = " + result.params.targetRank + " + " + result.params.oversampling),
      metric("Residual / best rank-k", formatNumber(c.overTargetFloor, 2) + "x"),
      metric("Residual / best sketch", formatNumber(c.overSketchFloor, 2) + "x"),
      metric("Top-k energy seen", formatPercent(c.topCaptured, 1)),
      metric("Matrix passes", String(passCount))
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.floor(rect.width || 900));
    var height = width < 700 ? 980 : 680;
    var ratio = root.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function label(ctx, text, x, y, color, align, size) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function title(ctx, text, x, y) {
    label(ctx, text, x, y, COLORS.text, "left", 13);
  }

  function panel(ctx, x, y, w, h, heading) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    title(ctx, heading, x + 12, y + 22);
  }

  function drawSpectrum(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Singular spectrum");
    var pad = { l: 44, r: 16, t: 42, b: 34 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var sigmas = result.sigmas;
    var minLog = Math.log10(Math.max(1e-5, sigmas[sigmas.length - 1]));
    var maxLog = 0;
    function px(i) { return left + (i / (sigmas.length - 1)) * pw; }
    function py(s) {
      var t = (Math.log10(Math.max(1e-5, s)) - minLog) / Math.max(1e-9, maxLog - minLog);
      return top + (1 - t) * ph;
    }
    ctx.strokeStyle = COLORS.sketch;
    ctx.lineWidth = 2;
    ctx.beginPath();
    sigmas.forEach(function (s, i) {
      var xx = px(i);
      var yy = py(s);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    var kx = px(result.params.targetRank - 1);
    var lx = px(result.current.ell - 1);
    line(ctx, kx, top, kx, top + ph, COLORS.target, 1.5);
    line(ctx, lx, top, lx, top + ph, COLORS.power, 1.5);
    line(ctx, left, top + ph, left + pw, top + ph, COLORS.rule, 1);
    line(ctx, left, top, left, top + ph, COLORS.rule, 1);
    label(ctx, "k", kx + 4, top + 12, COLORS.target);
    label(ctx, "k+p", lx + 4, top + 28, COLORS.power);
    label(ctx, "singular direction", left + pw / 2, y + h - 10, COLORS.muted, "center");
    label(ctx, "log sigma", x + 10, top + 12, COLORS.muted);
  }

  function drawQSweep(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Power iteration narrows the gap");
    var pad = { l: 48, r: 18, t: 44, b: 34 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var rows = result.qSweep;
    var maxY = Math.max.apply(null, rows.map(function (r) { return r.overTargetFloor; }).concat([1.05]));
    maxY = Math.min(6, Math.max(1.2, maxY * 1.08));
    line(ctx, left, top + ph, left + pw, top + ph, COLORS.rule, 1);
    line(ctx, left, top, left, top + ph, COLORS.rule, 1);
    var bestY = top + ph - ph / maxY;
    line(ctx, left, bestY, left + pw, bestY, COLORS.best, 1);
    label(ctx, "best rank-k", left + 6, bestY - 5, COLORS.best);
    rows.forEach(function (row, i) {
      var bw = Math.min(48, pw / (rows.length * 1.8));
      var xx = left + (i + 0.5) * pw / rows.length - bw / 2;
      var yy = top + ph - (row.overTargetFloor / maxY) * ph;
      ctx.fillStyle = row.power === result.params.power ? COLORS.power : COLORS.sketch;
      ctx.fillRect(xx, yy, bw, top + ph - yy);
      label(ctx, "q=" + row.power, xx + bw / 2, y + h - 12, COLORS.muted, "center");
      label(ctx, formatNumber(row.overTargetFloor, 2), xx + bw / 2, yy - 5, COLORS.text, "center", 11);
    });
    label(ctx, "residual / best rank-k", x + 10, top + 10, COLORS.muted);
  }

  function drawPSweep(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Oversampling is insurance");
    var pad = { l: 48, r: 18, t: 42, b: 36 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var rows = result.pSweep;
    var maxY = Math.max.apply(null, rows.map(function (r) { return r.overTargetFloor; }).concat([1.05]));
    maxY = Math.min(6, Math.max(1.2, maxY * 1.08));
    function px(i) { return left + (i / Math.max(1, rows.length - 1)) * pw; }
    function py(v) { return top + ph - (v / maxY) * ph; }
    line(ctx, left, top + ph, left + pw, top + ph, COLORS.rule, 1);
    line(ctx, left, top, left, top + ph, COLORS.rule, 1);
    line(ctx, left, py(1), left + pw, py(1), COLORS.best, 1);
    ctx.strokeStyle = COLORS.violet;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var xx = px(i);
      var yy = py(row.overTargetFloor);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    rows.forEach(function (row, i) {
      var xx = px(i);
      var yy = py(row.overTargetFloor);
      ctx.fillStyle = row.oversampling === result.params.oversampling ? COLORS.target : COLORS.violet;
      ctx.beginPath();
      ctx.arc(xx, yy, row.oversampling === result.params.oversampling ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (i % 2 === 0) label(ctx, String(row.oversampling), xx, y + h - 12, COLORS.muted, "center", 11);
    });
    label(ctx, "p", left + pw + 4, y + h - 12, COLORS.muted);
    label(ctx, "residual / best rank-k", x + 10, top + 10, COLORS.muted);
  }

  function drawCapture(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Which directions the sketch sees");
    var pad = { l: 44, r: 18, t: 42, b: 34 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var n = result.params.n;
    function px(i) { return left + (i / (n - 1)) * pw; }
    function py(v) { return top + ph - clamp(v, 0, 1) * ph; }
    line(ctx, left, top + ph, left + pw, top + ph, COLORS.rule, 1);
    line(ctx, left, top, left, top + ph, COLORS.rule, 1);
    line(ctx, px(result.params.targetRank - 1), top, px(result.params.targetRank - 1), top + ph, COLORS.target, 1);
    [
      { rows: result.noPower.capture, color: COLORS.amber, name: "q=0" },
      { rows: result.current.capture, color: COLORS.power, name: "current q" }
    ].forEach(function (series) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.rows.forEach(function (v, i) {
        var xx = px(i);
        var yy = py(v);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(left + 4, top + 6, 10, 3);
    label(ctx, "q=0", left + 20, top + 11, COLORS.muted, "left", 11);
    ctx.fillStyle = COLORS.power;
    ctx.fillRect(left + 64, top + 6, 10, 3);
    label(ctx, "current q", left + 80, top + 11, COLORS.muted, "left", 11);
    label(ctx, "capture probability", x + 10, top + 10, COLORS.muted);
    label(ctx, "singular direction", left + pw / 2, y + h - 10, COLORS.muted, "center");
  }

  function draw(result, canvas) {
    if (!canvas) return;
    var prepared = setupCanvas(canvas);
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 16;
    var gap = 14;
    if (width < 700) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawSpectrum(ctx, result, pad, pad, width - pad * 2, panelH);
      drawQSweep(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawPSweep(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawCapture(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }
    var halfW = (width - pad * 2 - gap) / 2;
    var halfH = (height - pad * 2 - gap) / 2;
    drawSpectrum(ctx, result, pad, pad, halfW, halfH);
    drawQSweep(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawPSweep(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawCapture(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-rsvd-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    normal: normal,
    spectrum: spectrum
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RandomizedSVDLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
