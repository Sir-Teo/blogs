(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    grid: "#edf2f7",
    none: "#be123c",
    clamp: "#2563eb",
    backcalc: "#0f766e",
    setpoint: "#111827",
    actuator: "#b45309"
  };

  var DEFAULTS = {
    high: 150,
    limit: 100,
    kp: 140,
    ki: 45,
    kb: 70
  };

  var MODES = [
    { id: "none", label: "no anti-windup", color: COLORS.none },
    { id: "clamp", label: "conditional integration", color: COLORS.clamp },
    { id: "backcalc", label: "back-calculation", color: COLORS.backcalc }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      high: Math.round(clamp(finite(Number(raw.high), DEFAULTS.high), 80, 180)) / 100,
      limit: Math.round(clamp(finite(Number(raw.limit), DEFAULTS.limit), 60, 120)) / 100,
      kp: Math.round(clamp(finite(Number(raw.kp), DEFAULTS.kp), 40, 240)) / 100,
      ki: Math.round(clamp(finite(Number(raw.ki), DEFAULTS.ki), 0, 100)) / 100,
      kb: Math.round(clamp(finite(Number(raw.kb), DEFAULTS.kb), 0, 160)) / 100,
      low: 0.45,
      tau: 3,
      deadTime: 0.6,
      firstStep: 4,
      drop: 28,
      duration: 60,
      dt: 0.02
    };
  }

  function setpointAt(t, params) {
    if (t < params.firstStep) return 0;
    return t < params.drop ? params.high : params.low;
  }

  function simulateMode(params, mode) {
    var dt = params.dt;
    var steps = Math.round(params.duration / dt);
    var delaySteps = Math.max(1, Math.round(params.deadTime / dt));
    var delay = [];
    for (var d = 0; d < delaySteps; d += 1) delay.push(0);
    var y = 0;
    var integral = 0;
    var samples = [];
    var maxAbsIntegral = 0;
    var saturationSteps = 0;
    var maxCommand = 0;

    for (var step = 0; step <= steps; step += 1) {
      var t = step * dt;
      var r = setpointAt(t, params);
      var e = r - y;
      var raw = params.kp * e + integral;
      var u = clamp(raw, -params.limit, params.limit);
      var saturated = Math.abs(raw - u) > 1e-10;
      var di = params.ki * e;
      if (mode === "clamp") {
        if ((raw >= params.limit && e > 0) || (raw <= -params.limit && e < 0)) di = 0;
      } else if (mode === "backcalc") {
        di = params.ki * e + params.kb * (u - raw);
      }
      integral += di * dt;
      maxAbsIntegral = Math.max(maxAbsIntegral, Math.abs(integral));
      if (saturated) saturationSteps += 1;
      maxCommand = Math.max(maxCommand, Math.abs(raw));
      delay.push(u);
      var delayed = delay.shift();
      y += ((delayed - y) / params.tau) * dt;
      samples.push({
        t: t,
        r: r,
        y: y,
        e: e,
        u: u,
        raw: raw,
        integral: integral,
        saturated: saturated
      });
    }

    var afterDrop = samples.filter(function (row) { return row.t >= params.drop; });
    var band = 0.02;
    var peak = Math.max.apply(null, afterDrop.map(function (row) { return row.y; }));
    var valley = Math.min.apply(null, afterDrop.map(function (row) { return row.y; }));
    var linear = afterDrop.filter(function (row) { return !row.saturated; })[0];
    var reentry = linear ? linear.t - params.drop : null;
    var settling = null;
    for (var i = 0; i < afterDrop.length; i += 1) {
      var ok = true;
      for (var j = i; j < afterDrop.length; j += 1) {
        if (Math.abs(afterDrop[j].y - params.low) > band) {
          ok = false;
          break;
        }
      }
      if (ok) {
        settling = afterDrop[i].t - params.drop;
        break;
      }
    }
    var iae = afterDrop.reduce(function (sum, row) {
      return sum + Math.abs(row.y - params.low) * dt;
    }, 0);
    return {
      mode: mode,
      label: MODES.filter(function (row) { return row.id === mode; })[0].label,
      color: MODES.filter(function (row) { return row.id === mode; })[0].color,
      samples: samples,
      metrics: {
        peakAfterDrop: peak,
        valleyAfterDrop: valley,
        reentryTime: reentry,
        settlingTime: settling,
        iaeAfterDrop: iae,
        maxAbsIntegral: maxAbsIntegral,
        saturationFraction: saturationSteps / samples.length,
        maxCommand: maxCommand,
        finalError: params.low - samples[samples.length - 1].y
      }
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var modes = MODES.map(function (mode) {
      return simulateMode(params, mode.id);
    });
    var result = {
      params: params,
      modes: modes,
      setpointSamples: modes[0].samples.map(function (row) {
        return { t: row.t, r: row.r };
      })
    };
    result.audit = audit(result);
    return result;
  }

  function audit(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var expected = Math.round(result.params.duration / result.params.dt) + 1;
    result.modes.forEach(function (mode) {
      check(mode.mode + " sample count", mode.samples.length === expected);
      check(mode.mode + " finite samples", mode.samples.every(function (row) {
        return Number.isFinite(row.t) && Number.isFinite(row.y) &&
          Number.isFinite(row.u) && Number.isFinite(row.raw) &&
          Number.isFinite(row.integral);
      }));
      check(mode.mode + " actuator limit respected", mode.samples.every(function (row) {
        return row.u <= result.params.limit + 1e-12 && row.u >= -result.params.limit - 1e-12;
      }));
      check(mode.mode + " finite IAE", Number.isFinite(mode.metrics.iaeAfterDrop) && mode.metrics.iaeAfterDrop >= 0);
    });
    var none = findMode(result, "none");
    var clampMode = findMode(result, "clamp");
    var backcalc = findMode(result, "backcalc");
    var windupScenario = result.params.high > result.params.limit + 0.05 && result.params.ki > 0.05;
    var backcalcEnabled = result.params.kb > 0.05;
    if (windupScenario && backcalcEnabled) {
      check("windup grows larger integral", none.metrics.maxAbsIntegral > backcalc.metrics.maxAbsIntegral);
      check("back calculation lowers post-drop error area", backcalc.metrics.iaeAfterDrop < none.metrics.iaeAfterDrop);
      check("plain integrator stays saturated longer", none.metrics.reentryTime == null || none.metrics.reentryTime > backcalc.metrics.reentryTime + 5);
      check("back calculation settles by end", backcalc.metrics.settlingTime != null);
    }
    if (windupScenario) {
      check("clamping lowers post-drop error area", clampMode.metrics.iaeAfterDrop < none.metrics.iaeAfterDrop);
      check("clamping settles by end", clampMode.metrics.settlingTime != null);
    }
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function auditGrid() {
    var cases = [
      { high: 150, limit: 100, kp: 140, ki: 45, kb: 70 },
      { high: 170, limit: 100, kp: 140, ki: 45, kb: 70 },
      { high: 150, limit: 80, kp: 120, ki: 35, kb: 60 },
      { high: 120, limit: 90, kp: 180, ki: 55, kb: 90 },
      { high: 160, limit: 110, kp: 100, ki: 60, kb: 120 }
    ].map(function (raw, index) {
      var result = evaluate(raw);
      var none = findMode(result, "none");
      var clampMode = findMode(result, "clamp");
      var backcalc = findMode(result, "backcalc");
      return {
        caseId: index + 1,
        high: result.params.high,
        limit: result.params.limit,
        kp: result.params.kp,
        ki: result.params.ki,
        kb: result.params.kb,
        noneReentryTime: none.metrics.reentryTime,
        clampReentryTime: clampMode.metrics.reentryTime,
        backcalcReentryTime: backcalc.metrics.reentryTime,
        noneIaeAfterDrop: none.metrics.iaeAfterDrop,
        clampIaeAfterDrop: clampMode.metrics.iaeAfterDrop,
        backcalcIaeAfterDrop: backcalc.metrics.iaeAfterDrop,
        noneMaxAbsIntegral: none.metrics.maxAbsIntegral,
        clampMaxAbsIntegral: clampMode.metrics.maxAbsIntegral,
        backcalcMaxAbsIntegral: backcalc.metrics.maxAbsIntegral,
        clampSettlingTime: clampMode.metrics.settlingTime,
        backcalcSettlingTime: backcalc.metrics.settlingTime,
        passed: result.audit.passed,
        checks: result.audit.checks.map(function (row) {
          return {
            name: row.name,
            ok: row.ok
          };
        }),
        passedChecks: result.audit.checks.filter(function (row) { return row.ok; }).length,
        totalChecks: result.audit.checks.length,
        failedChecks: result.audit.checks.filter(function (row) { return !row.ok; }).map(function (row) { return row.name; })
      };
    });
    var passedCases = cases.filter(function (row) { return row.passed; }).length;
    var passedChecks = cases.reduce(function (sum, row) {
      return sum + row.passedChecks;
    }, 0);
    var totalChecks = cases.reduce(function (sum, row) {
      return sum + row.totalChecks;
    }, 0);
    var errors = [];
    cases.forEach(function (row) {
      row.failedChecks.forEach(function (check) {
        errors.push("case " + row.caseId + ": " + check);
      });
    });
    return {
      ok: passedCases === cases.length && passedChecks === totalChecks,
      cases: cases,
      errors: errors,
      passed: passedCases,
      passedChecks: passedChecks,
      totalChecks: totalChecks,
      total: cases.length
    };
  }

  function findMode(result, id) {
    return result.modes.filter(function (row) { return row.mode === id; })[0];
  }

  function fmt(value, digits) {
    if (value == null) return ">32";
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function pct(value) {
    return Math.round(value * 100) + "%";
  }

  function metric(label, value, className) {
    return '<div class="pid-windup-lab__metric ' + (className || "") + '"><span>' +
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
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, { color: COLORS.muted, size: 10, weight: 600 });
  }

  function extent(values) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = Math.max(0.05, (max - min) * 0.08);
    return { min: min - pad, max: max + pad };
  }

  function mapX(plot, t, params) {
    return plot.x + t / params.duration * plot.w;
  }

  function mapY(plot, value, domain) {
    return plot.y + plot.h - (value - domain.min) / (domain.max - domain.min) * plot.h;
  }

  function drawSeries(ctx, plot, rows, getter, domain, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = mapX(plot, row.t, { duration: rows[rows.length - 1].t });
      var y = mapY(plot, getter(row), domain);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawPlotFrame(ctx, plot, result, domain, label) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    [result.params.firstStep, result.params.drop].forEach(function (t) {
      var x = mapX(plot, t, result.params);
      ctx.strokeStyle = "rgba(23,32,38,0.18)";
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    });
    text(ctx, label, plot.x, plot.y - 12, { color: COLORS.muted, size: 10, weight: 700 });
    text(ctx, fmt(domain.max, 1), plot.x - 8, plot.y + 4, { color: COLORS.muted, size: 9, align: "right" });
    text(ctx, fmt(domain.min, 1), plot.x - 8, plot.y + plot.h - 4, { color: COLORS.muted, size: 9, align: "right" });
  }

  function drawResponse(ctx, result, box) {
    panel(ctx, box, "plant response", "the target drops after the unreachable request has charged the integrator");
    var plot = { x: box.x + 52, y: box.y + 74, w: box.w - 78, h: box.h - 108 };
    var values = [];
    result.modes.forEach(function (mode) {
      mode.samples.forEach(function (row) { values.push(row.y); });
    });
    result.setpointSamples.forEach(function (row) { values.push(row.r); });
    var domain = extent(values.concat([0, result.params.limit, result.params.low]));
    drawPlotFrame(ctx, plot, result, domain, "output y(t)");
    drawSeries(ctx, plot, result.modes[0].samples, function (row) { return row.r; }, domain, COLORS.setpoint, 1.4);
    result.modes.forEach(function (mode) {
      drawSeries(ctx, plot, mode.samples, function (row) { return row.y; }, domain, mode.color, 2.2);
    });
    text(ctx, "setpoint", plot.x + plot.w - 4, mapY(plot, result.params.high, domain) - 10, { color: COLORS.setpoint, size: 10, weight: 750, align: "right" });
    text(ctx, "drop", mapX(plot, result.params.drop, result.params) + 4, plot.y + 14, { color: COLORS.muted, size: 10, weight: 750 });
  }

  function drawController(ctx, result, box) {
    panel(ctx, box, "controller command", "raw PI demand can keep shouting after the actuator is already pinned");
    var plot = { x: box.x + 52, y: box.y + 74, w: box.w - 78, h: box.h - 108 };
    var rawValues = [];
    result.modes.forEach(function (mode) {
      mode.samples.forEach(function (row) { rawValues.push(row.raw); });
    });
    var domain = extent(rawValues.concat([-result.params.limit, result.params.limit]));
    drawPlotFrame(ctx, plot, result, domain, "raw command v(t)");
    ctx.strokeStyle = COLORS.actuator;
    ctx.lineWidth = 1.4;
    [result.params.limit, -result.params.limit].forEach(function (limit) {
      ctx.beginPath();
      ctx.moveTo(plot.x, mapY(plot, limit, domain));
      ctx.lineTo(plot.x + plot.w, mapY(plot, limit, domain));
      ctx.stroke();
    });
    result.modes.forEach(function (mode) {
      drawSeries(ctx, plot, mode.samples, function (row) { return row.raw; }, domain, mode.color, 2);
    });
    text(ctx, "+/- actuator", plot.x + plot.w, mapY(plot, result.params.limit, domain) - 11, { color: COLORS.actuator, size: 10, weight: 750, align: "right" });
  }

  function drawIntegrator(ctx, result, box) {
    panel(ctx, box, "integrator state", "anti-windup is bookkeeping for the hidden accumulator");
    var plot = { x: box.x + 52, y: box.y + 74, w: box.w - 78, h: box.h - 108 };
    var values = [];
    result.modes.forEach(function (mode) {
      mode.samples.forEach(function (row) { values.push(row.integral); });
    });
    var domain = extent(values.concat([0]));
    drawPlotFrame(ctx, plot, result, domain, "integral contribution");
    result.modes.forEach(function (mode) {
      drawSeries(ctx, plot, mode.samples, function (row) { return row.integral; }, domain, mode.color, 2.2);
    });
  }

  function drawBars(ctx, result, box) {
    panel(ctx, box, "post-drop audit", "after the target becomes reachable again");
    var maxIae = Math.max.apply(null, result.modes.map(function (mode) { return mode.metrics.iaeAfterDrop; }));
    var x0 = box.x + 138;
    var w = box.w - 170;
    result.modes.forEach(function (mode, i) {
      var y = box.y + 66 + i * 56;
      text(ctx, mode.label, box.x + 18, y + 8, { color: mode.color, size: 11, weight: 800 });
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(x0, y, w, 15);
      ctx.fillStyle = mode.color;
      ctx.fillRect(x0, y, mode.metrics.iaeAfterDrop / maxIae * w, 15);
      text(ctx, "IAE " + fmt(mode.metrics.iaeAfterDrop, 2), x0 + w, y + 8, { color: COLORS.text, size: 10, weight: 750, align: "right" });
      text(ctx, "linear " + fmt(mode.metrics.reentryTime, 1) + "s, settle " + fmt(mode.metrics.settlingTime, 1) + "s", x0, y + 32, { color: COLORS.muted, size: 10, weight: 650 });
    });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    var gap = 14;
    var col = Math.floor((width - gap * 3) / 2);
    drawResponse(ctx, result, { x: gap, y: gap, w: col, h: 260 });
    drawController(ctx, result, { x: gap * 2 + col, y: gap, w: col, h: 260 });
    drawIntegrator(ctx, result, { x: gap, y: 288, w: col, h: height - 302 });
    drawBars(ctx, result, { x: gap * 2 + col, y: 288, w: col, h: height - 302 });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      output.textContent = fmt(params[key], 2);
    });
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result.params);
    var none = findMode(result, "none");
    var clampMode = findMode(result, "clamp");
    var backcalc = findMode(result, "backcalc");
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("plain re-entry", fmt(none.metrics.reentryTime, 1) + "s", "pid-windup-lab__metric--bad"),
        metric("back-calc re-entry", fmt(backcalc.metrics.reentryTime, 1) + "s", "pid-windup-lab__metric--good"),
        metric("plain max integral", fmt(none.metrics.maxAbsIntegral, 2)),
        metric("back-calc IAE", fmt(backcalc.metrics.iaeAfterDrop, 2), "pid-windup-lab__metric--good"),
        metric("clamp IAE", fmt(clampMode.metrics.iaeAfterDrop, 2)),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "pid-windup-lab__metric--good" : "pid-windup-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "The high request is " + fmt(result.params.high, 2) +
        " with actuator limit +/-" + fmt(result.params.limit, 2) +
        ". After the drop, plain PI takes " + fmt(none.metrics.reentryTime, 1) +
        "s to leave saturation; back-calculation takes " + fmt(backcalc.metrics.reentryTime, 1) + "s.";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__pidWindupResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__pidWindupReady) return;
    root.__pidWindupReady = true;
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
        Array.prototype.slice.call(global.document.querySelectorAll("[data-pid-windup-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-pid-windup-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    normalize: normalize,
    simulateMode: simulateMode
  };

  global.PIDWindupLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
