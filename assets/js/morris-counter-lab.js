(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    exact: "#334155",
    morris: "#0f766e",
    theory: "#2563eb",
    warn: "#b45309",
    bad: "#be123c",
    good: "#15803d",
    purple: "#7c3aed",
    softGreen: "#ecfdf5",
    softBlue: "#eff6ff",
    softAmber: "#fffbeb"
  };

  var DEFAULTS = {
    events: 80000,
    precision: 30,
    bits: 8,
    trials: 900,
    replicas: 1,
    seed: 53
  };

  var AUDIT_CACHE = null;

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function clampInt(value, lo, hi) {
    value = Number(value);
    if (!Number.isFinite(value)) return lo;
    return clamp(Math.round(value), lo, hi);
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      events: clampInt(finite(raw.events, DEFAULTS.events), 100, 200000),
      precision: clampInt(finite(raw.precision, DEFAULTS.precision), 4, 120),
      bits: clampInt(finite(raw.bits, DEFAULTS.bits), 4, 12),
      trials: clampInt(finite(raw.trials, DEFAULTS.trials), 200, 2500),
      replicas: clampInt(finite(raw.replicas, DEFAULTS.replicas), 1, 16),
      seed: clampInt(finite(raw.seed, DEFAULTS.seed), 1, 9999)
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

  function baseFromPrecision(precision) {
    return 1 + 1 / precision;
  }

  function estimateFromRegister(x, precision) {
    return precision * (Math.pow(baseFromPrecision(precision), x) - 1);
  }

  function incrementProbability(x, precision) {
    return Math.pow(baseFromPrecision(precision), -x);
  }

  function maxRegister(bits) {
    return Math.pow(2, bits) - 1;
  }

  function maxEstimate(bits, precision) {
    return estimateFromRegister(maxRegister(bits), precision);
  }

  function geometricWait(probability, rng) {
    if (probability >= 1) return 1;
    if (probability <= 0) return Infinity;
    var u = clamp(rng(), Number.EPSILON, 1 - Number.EPSILON);
    return Math.floor(Math.log(1 - u) / Math.log(1 - probability)) + 1;
  }

  function runCounter(events, precision, bits, rng, keepTrace) {
    var x = 0;
    var seen = 0;
    var maxX = maxRegister(bits);
    var trace = keepTrace ? [{ seen: 0, register: 0, estimate: 0 }] : null;

    while (seen < events && x < maxX) {
      var wait = geometricWait(incrementProbability(x, precision), rng);
      if (seen + wait > events) break;
      seen += wait;
      x += 1;
      if (trace) trace.push({ seen: seen, register: x, estimate: estimateFromRegister(x, precision) });
    }

    return {
      estimate: estimateFromRegister(x, precision),
      register: x,
      saturated: x >= maxX && seen < events,
      seenAtLastJump: seen,
      trace: trace
    };
  }

  function runAveragedCounter(events, precision, bits, replicas, rng, keepTrace) {
    var sum = 0;
    var registers = [];
    var saturated = 0;
    var trace = null;
    for (var r = 0; r < replicas; r += 1) {
      var run = runCounter(events, precision, bits, rng, keepTrace && r === 0);
      sum += run.estimate;
      registers.push(run.register);
      if (run.saturated) saturated += 1;
      if (run.trace) trace = run.trace;
    }
    return {
      estimate: sum / replicas,
      registers: registers,
      saturated: saturated,
      trace: trace
    };
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var at = (sorted.length - 1) * q;
    var lo = Math.floor(at);
    var hi = Math.ceil(at);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  }

  function summarize(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var sum = values.reduce(function (a, b) { return a + b; }, 0);
    var mean = values.length ? sum / values.length : 0;
    var variance = values.length > 1
      ? values.reduce(function (acc, value) { return acc + Math.pow(value - mean, 2); }, 0) / (values.length - 1)
      : 0;
    return {
      mean: mean,
      p05: quantile(sorted, 0.05),
      p50: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      sd: Math.sqrt(variance),
      sorted: sorted
    };
  }

  function theoretical(events, precision, replicas) {
    var variance = events * Math.max(0, events - 1) / (2 * precision * replicas);
    return {
      mean: events,
      relativeSd: events > 0 ? Math.sqrt(variance) / events : 0,
      sd: Math.sqrt(variance),
      variance: variance
    };
  }

  function distribution(params) {
    var rng = makeRng(params.seed);
    var rows = [];
    var errors = [];
    var saturatedTrials = 0;
    for (var i = 0; i < params.trials; i += 1) {
      var run = runAveragedCounter(params.events, params.precision, params.bits, params.replicas, rng, i === 0);
      var relError = (run.estimate - params.events) / params.events;
      if (run.saturated) saturatedTrials += 1;
      rows.push({
        estimate: run.estimate,
        registers: run.registers,
        relativeError: relError,
        saturated: run.saturated > 0,
        trace: run.trace,
        trial: i
      });
      errors.push(relError);
    }
    return {
      errors: errors,
      rows: rows,
      saturatedTrials: saturatedTrials,
      summary: summarize(rows.map(function (row) { return row.estimate; })),
      errorSummary: summarize(errors)
    };
  }

  function exactSmallDistribution(events, precision) {
    var dist = [1];
    for (var step = 0; step < events; step += 1) {
      var next = new Array(dist.length + 1).fill(0);
      for (var x = 0; x < dist.length; x += 1) {
        var p = incrementProbability(x, precision);
        next[x] += dist[x] * (1 - p);
        next[x + 1] += dist[x] * p;
      }
      dist = next;
    }
    var mean = 0;
    var second = 0;
    for (var j = 0; j < dist.length; j += 1) {
      var est = estimateFromRegister(j, precision);
      mean += dist[j] * est;
      second += dist[j] * est * est;
    }
    return {
      dist: dist,
      mean: mean,
      variance: second - mean * mean
    };
  }

  function tradeoffRows(params) {
    var rows = [];
    [5, 8, 12, 20, 30, 45, 70, 100, 120].forEach(function (precision) {
      rows.push({
        bits: params.bits,
        maxEstimate: maxEstimate(params.bits, precision),
        precision: precision,
        relativeSd: theoretical(params.events, precision, params.replicas).relativeSd
      });
    });
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var dist = distribution(params);
    var theory = theoretical(params.events, params.precision, params.replicas);
    var capacity = maxEstimate(params.bits, params.precision);
    var trace = dist.rows[0] && dist.rows[0].trace ? dist.rows[0].trace : [];
    return {
      capacity: capacity,
      dist: dist,
      params: params,
      theory: theory,
      trace: trace,
      tradeoff: tradeoffRows(params)
    };
  }

  function runAudit() {
    function auditCheck(name, passed) {
      return {
        name: name,
        passed: Boolean(passed)
      };
    }

    function failedNames(checks) {
      return checks.filter(function (check) { return !check.passed; }).map(function (check) { return check.name; });
    }

    function passedCount(checks) {
      return checks.filter(function (check) { return check.passed; }).length;
    }

    var exact = [0, 1, 2, 8, 35, 60].map(function (events) {
      var precision = 30;
      var actual = exactSmallDistribution(events, precision);
      var expected = theoretical(events, precision, 1);
      var meanOk = Math.abs(actual.mean - events) < 1e-9;
      var varianceOk = Math.abs(actual.variance - expected.variance) < 1e-7;
      var checks = [
        auditCheck("exact expectation equals count", meanOk),
        auditCheck("exact variance matches formula", varianceOk)
      ];
      return {
        checks: checks,
        events: events,
        failedChecks: failedNames(checks),
        meanOk: meanOk,
        passed: checks.every(function (check) { return check.passed; }),
        passedChecks: passedCount(checks),
        totalChecks: checks.length,
        varianceOk: varianceOk
      };
    });
    var scenarios = [
      DEFAULTS,
      { events: 1000, precision: 8, bits: 8, trials: 1200, replicas: 1, seed: 5 },
      { events: 40000, precision: 60, bits: 9, trials: 1200, replicas: 4, seed: 17 },
      { events: 160000, precision: 12, bits: 10, trials: 900, replicas: 2, seed: 29 }
    ].map(function (raw) {
      var result = evaluate(raw);
      var se = result.theory.sd / Math.sqrt(result.params.trials);
      var meanOk = Math.abs(result.dist.summary.mean - result.params.events) <= Math.max(2, 5 * se);
      var noBadSaturation = result.dist.saturatedTrials === 0 || result.params.events > result.capacity * 0.85;
      var deterministic = JSON.stringify(evaluate(raw).dist.rows.slice(0, 3).map(function (row) {
        return Math.round(row.estimate);
      })) === JSON.stringify(result.dist.rows.slice(0, 3).map(function (row) {
        return Math.round(row.estimate);
      }));
      var checks = [
        auditCheck("seeded replay is deterministic", deterministic),
        auditCheck("empirical mean is inside standard-error envelope", meanOk),
        auditCheck("saturation is either absent or explicitly near capacity", noBadSaturation)
      ];
      return {
        checks: checks,
        deterministic: deterministic,
        events: result.params.events,
        failedChecks: failedNames(checks),
        meanOk: meanOk,
        noBadSaturation: noBadSaturation,
        observedMean: result.dist.summary.mean,
        passed: checks.every(function (check) { return check.passed; }),
        passedChecks: passedCount(checks),
        saturatedTrials: result.dist.saturatedTrials,
        totalChecks: checks.length,
        theoreticalMean: result.theory.mean
      };
    });
    var passed = exact.filter(function (row) { return row.passed; }).length +
      scenarios.filter(function (row) { return row.passed; }).length;
    var total = exact.length + scenarios.length;
    var passedChecks = exact.concat(scenarios).reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = exact.concat(scenarios).reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    var failures = exact.concat(scenarios).filter(function (row) { return !row.passed; }).map(function (row) {
      return {
        events: row.events,
        failedChecks: row.failedChecks
      };
    });
    return {
      exact: exact,
      failures: failures,
      ok: passed === total && passedChecks === totalChecks,
      passed: passed,
      passedChecks: passedChecks,
      total: total,
      totalChecks: totalChecks,
      scenarios: scenarios
    };
  }

  function formatInt(value) {
    if (!Number.isFinite(value)) return "inf";
    if (Math.abs(value) >= 1000000000) return value.toExponential(2);
    return Math.round(value).toLocaleString("en-US");
  }

  function fmt(value, digits) {
    return Number(value).toFixed(digits == null ? 2 : digits);
  }

  function pct(value) {
    return fmt(100 * value, 1) + "%";
  }

  function setupCanvas(canvas, cssHeight) {
    var width = Math.max(320, Math.round(canvas.getBoundingClientRect().width || canvas.width || 900));
    var dpr = global.devicePixelRatio || 1;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, cssHeight);
    return { ctx: ctx, height: cssHeight, width: width };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function text(ctx, value, x, y, size, color, weight, align, baseline) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(String(value), x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    text(ctx, title, box.x + 16, box.y + 26, 13, COLORS.text, 760);
    if (subtitle) text(ctx, subtitle, box.x + 16, box.y + 45, 10, COLORS.muted, 620);
  }

  function drawTracePanel(ctx, result, box) {
    panel(ctx, box, "one register run", "a logarithmic staircase updated by random jumps");
    var trace = result.trace;
    var plot = { x: box.x + 54, y: box.y + 72, w: box.w - 84, h: box.h - 112 };
    var maxY = Math.max(result.params.events, trace.reduce(function (m, row) { return Math.max(m, row.estimate); }, 1));
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (var g = 0; g <= 4; g += 1) {
      var gy = plot.y + plot.h - g * plot.h / 4;
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.exact;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y);
    ctx.stroke();
    ctx.strokeStyle = COLORS.morris;
    ctx.lineWidth = 2;
    ctx.beginPath();
    var lastX = plot.x;
    var lastY = plot.y + plot.h;
    ctx.moveTo(lastX, lastY);
    trace.forEach(function (row) {
      var x = plot.x + row.seen / result.params.events * plot.w;
      var y = plot.y + plot.h - row.estimate / maxY * plot.h;
      ctx.lineTo(x, lastY);
      ctx.lineTo(x, y);
      lastX = x;
      lastY = y;
    });
    ctx.lineTo(plot.x + plot.w, lastY);
    ctx.stroke();
    ctx.lineWidth = 1;
    text(ctx, "exact", plot.x + plot.w - 4, plot.y + 12, 10, COLORS.exact, 700, "right");
    text(ctx, "Morris estimate", plot.x + 6, lastY - 8, 10, COLORS.morris, 700);
    text(ctx, "register X = " + (trace.length ? trace[trace.length - 1].register : 0), box.x + 16, box.y + box.h - 24, 11, COLORS.text, 700);
  }

  function drawErrorPanel(ctx, result, box) {
    panel(ctx, box, "relative error", "trial distribution versus theoretical scale");
    var errors = result.dist.errors;
    var bins = 24;
    var lo = Math.min(-0.8, result.dist.errorSummary.p05 * 1.3);
    var hi = Math.max(0.8, result.dist.errorSummary.p95 * 1.3);
    var counts = new Array(bins).fill(0);
    errors.forEach(function (error) {
      var idx = clamp(Math.floor((error - lo) / (hi - lo) * bins), 0, bins - 1);
      counts[idx] += 1;
    });
    var plot = { x: box.x + 48, y: box.y + 72, w: box.w - 78, h: box.h - 122 };
    var maxCount = counts.reduce(function (a, b) { return Math.max(a, b); }, 1);
    counts.forEach(function (count, i) {
      var x = plot.x + i * plot.w / bins;
      var w = Math.max(1, plot.w / bins - 2);
      var h = count / maxCount * plot.h;
      ctx.fillStyle = COLORS.morris;
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
    });
    var zeroX = plot.x + (0 - lo) / (hi - lo) * plot.w;
    ctx.strokeStyle = COLORS.exact;
    ctx.beginPath();
    ctx.moveTo(zeroX, plot.y - 8);
    ctx.lineTo(zeroX, plot.y + plot.h + 8);
    ctx.stroke();
    var sd = result.theory.relativeSd;
    var left = plot.x + (-2 * sd - lo) / (hi - lo) * plot.w;
    var right = plot.x + (2 * sd - lo) / (hi - lo) * plot.w;
    ctx.fillStyle = "rgba(37, 99, 235, 0.13)";
    ctx.fillRect(left, plot.y, right - left, plot.h);
    text(ctx, "-2sd", left, plot.y + plot.h + 18, 10, COLORS.theory, 700, "center");
    text(ctx, "+2sd", right, plot.y + plot.h + 18, 10, COLORS.theory, 700, "center");
    text(ctx, "mean error " + pct((result.dist.summary.mean - result.params.events) / result.params.events), box.x + 16, box.y + box.h - 36, 11, COLORS.text, 700);
    text(ctx, "empirical p05..p95: " + pct(result.dist.errorSummary.p05) + " to " + pct(result.dist.errorSummary.p95), box.x + 16, box.y + box.h - 18, 10, COLORS.muted, 650);
  }

  function drawTradeoffPanel(ctx, result, box) {
    panel(ctx, box, "fixed-width bargain", "higher precision lowers noise but lowers range");
    var rows = result.tradeoff;
    var plot = { x: box.x + 62, y: box.y + 74, w: box.w - 94, h: box.h - 120 };
    var maxCap = rows.reduce(function (m, row) { return Math.max(m, row.maxEstimate); }, 1);
    var maxSd = rows.reduce(function (m, row) { return Math.max(m, row.relativeSd); }, 0.01);
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + i * plot.h / 4;
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
    }
    ctx.stroke();
    rows.forEach(function (row, index) {
      var x = plot.x + index * plot.w / Math.max(1, rows.length - 1);
      var capY = plot.y + plot.h - Math.log10(Math.max(1, row.maxEstimate)) / Math.log10(maxCap) * plot.h;
      var sdY = plot.y + row.relativeSd / maxSd * plot.h;
      ctx.fillStyle = row.precision === result.params.precision ? COLORS.warn : COLORS.theory;
      ctx.beginPath();
      ctx.arc(x, capY, row.precision === result.params.precision ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = row.precision === result.params.precision ? COLORS.warn : COLORS.purple;
      ctx.beginPath();
      ctx.arc(x, sdY, row.precision === result.params.precision ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (index % 2 === 0) text(ctx, row.precision, x, plot.y + plot.h + 18, 9, COLORS.muted, 650, "center");
    });
    text(ctx, "range", plot.x + plot.w - 2, plot.y + 14, 10, COLORS.theory, 700, "right");
    text(ctx, "noise", plot.x + plot.w - 2, plot.y + plot.h - 4, 10, COLORS.purple, 700, "right");
    text(ctx, "max " + formatInt(result.capacity) + "; theory sd " + pct(result.theory.relativeSd), box.x + 16, box.y + box.h - 24, 11, COLORS.text, 700);
  }

  function drawRegisterPanel(ctx, result, box) {
    panel(ctx, box, "register decoding", "stored exponent maps back to an unbiased estimate");
    var maxX = maxRegister(result.params.bits);
    var shown = Math.min(maxX, 40);
    var plot = { x: box.x + 54, y: box.y + 72, w: box.w - 84, h: box.h - 112 };
    var maxY = estimateFromRegister(shown, result.params.precision);
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (var g = 0; g <= 4; g += 1) {
      var y = plot.y + plot.h - g * plot.h / 4;
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.morris;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var x = 0; x <= shown; x += 1) {
      var px = plot.x + x / shown * plot.w;
      var py = plot.y + plot.h - estimateFromRegister(x, result.params.precision) / maxY * plot.h;
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    var current = result.dist.rows[0] ? result.dist.rows[0].registers[0] : 0;
    var marker = Math.min(current, shown);
    var mx = plot.x + marker / shown * plot.w;
    var my = plot.y + plot.h - estimateFromRegister(marker, result.params.precision) / maxY * plot.h;
    ctx.fillStyle = COLORS.warn;
    ctx.beginPath();
    ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, "X", plot.x, plot.y + plot.h + 20, 10, COLORS.muted, 650, "center");
    text(ctx, String(shown), plot.x + plot.w, plot.y + plot.h + 20, 10, COLORS.muted, 650, "center");
    text(ctx, "estimate at X=" + current + ": " + formatInt(estimateFromRegister(current, result.params.precision)), box.x + 16, box.y + box.h - 38, 11, COLORS.text, 700);
    text(ctx, "increment probability there: " + pct(incrementProbability(current, result.params.precision)), box.x + 16, box.y + box.h - 20, 10, COLORS.muted, 650);
  }

  function draw(result, canvas) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var compact = width < 760;
    var prepared = setupCanvas(canvas, compact ? 1120 : 760);
    var ctx = prepared.ctx;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = prepared.width - 2 * pad;
    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawTracePanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawErrorPanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawTradeoffPanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawRegisterPanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }
    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawTracePanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawErrorPanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawTradeoffPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawRegisterPanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function metric(label, value, klass) {
    return "<div class=\"morris-counter-lab__metric " + (klass || "") + "\"><span>" +
      label + "</span><strong>" + value + "</strong></div>";
  }

  function setOutput(root, key, value) {
    var out = root.querySelector("[data-output=\"" + key + "\"]");
    if (out) out.textContent = value;
  }

  function syncControls(root, result) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (result.params[key] != null) input.value = result.params[key];
    });
    setOutput(root, "events", formatInt(result.params.events));
    setOutput(root, "precision", String(result.params.precision));
    setOutput(root, "bits", String(result.params.bits));
    setOutput(root, "trials", formatInt(result.params.trials));
    setOutput(root, "replicas", String(result.params.replicas));
    setOutput(root, "seed", String(result.params.seed));
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncControls(root, result);

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var saturatedClass = result.dist.saturatedTrials ? "morris-counter-lab__metric--warn" : "";
      metrics.innerHTML = [
        metric("empirical mean", formatInt(result.dist.summary.mean)),
        metric("true count", formatInt(result.params.events)),
        metric("theory rel sd", pct(result.theory.relativeSd)),
        metric("p05..p95", pct(result.dist.errorSummary.p05) + " to " + pct(result.dist.errorSummary.p95)),
        metric("max decoded", formatInt(result.capacity), saturatedClass),
        metric("saturated trials", formatInt(result.dist.saturatedTrials), saturatedClass)
      ].join("");
    }

    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "The estimator is unbiased before register saturation. Raising precision lowers variance but also lowers the largest count that fits in a fixed-width register.";
    }

    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__morrisCounterResult = result;
  }

  function init(root) {
    if (!root || root.__morrisCounterReady) return;
    root.__morrisCounterReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { render(root); }, 70);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__morrisCounterResult) {
          var canvas = root.querySelector("canvas[data-canvas]");
          if (canvas) draw(root.__morrisCounterResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__morrisCounterResult) {
          var canvas = root.querySelector("canvas[data-canvas]");
          if (canvas) draw(root.__morrisCounterResult, canvas);
        }
      });
    }
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-morris-counter-lab]")).forEach(init);
  }

  function auditMorrisCounterLab() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  var api = {
    auditMorrisCounterLab: auditMorrisCounterLab,
    cleanParams: cleanParams,
    estimateFromRegister: estimateFromRegister,
    evaluate: evaluate,
    exactSmallDistribution: exactSmallDistribution,
    runAudit: runAudit,
    runCounter: runCounter,
    theoretical: theoretical
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MorrisCounterLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
