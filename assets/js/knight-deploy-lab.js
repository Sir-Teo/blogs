(function (global) {
  "use strict";

  var FACTS = {
    servers: 8,
    observedParentOrders: 212,
    observedMinutes: 45,
    observedExecutions: 4000000,
    observedShares: 397000000,
    observedGrossPosition: 6650000000,
    observedLoss: 460000000
  };

  var CALIBRATION = {
    executionsPerParentMinute: FACTS.observedExecutions / (FACTS.observedParentOrders * FACTS.observedMinutes),
    sharesPerExecution: FACTS.observedShares / FACTS.observedExecutions,
    dollarsPerShareLoss: FACTS.observedLoss / FACTS.observedShares,
    dollarsPerShareGross: FACTS.observedGrossPosition / FACTS.observedShares
  };

  var DEFAULTS = {
    staleServers: 1,
    badParentOrders: 212,
    exposureMinutes: 45,
    executionsPerParentMinute: Math.round(CALIBRATION.executionsPerParentMinute),
    deploymentCheck: 0,
    routerGuard: 0,
    outputCap: 40,
    capitalGuard: 0,
    capitalLimit: 50
  };

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    bad: "#be123c",
    warn: "#b45309",
    good: "#0f766e",
    blue: "#2563eb",
    server: "#e3e9ef",
    white: "#ffffff"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      staleServers: clamp(Math.round(Number(raw.staleServers == null ? DEFAULTS.staleServers : raw.staleServers)), 0, 3),
      badParentOrders: clamp(Math.round(Number(raw.badParentOrders == null ? DEFAULTS.badParentOrders : raw.badParentOrders)), 0, 420),
      exposureMinutes: clamp(Number(raw.exposureMinutes == null ? DEFAULTS.exposureMinutes : raw.exposureMinutes), 1, 60),
      executionsPerParentMinute: clamp(Number(raw.executionsPerParentMinute == null ? DEFAULTS.executionsPerParentMinute : raw.executionsPerParentMinute), 50, 700),
      deploymentCheck: Number(raw.deploymentCheck == null ? DEFAULTS.deploymentCheck : raw.deploymentCheck) ? 1 : 0,
      routerGuard: Number(raw.routerGuard == null ? DEFAULTS.routerGuard : raw.routerGuard) ? 1 : 0,
      outputCap: clamp(Math.round(Number(raw.outputCap == null ? DEFAULTS.outputCap : raw.outputCap)), 5, 500),
      capitalGuard: Number(raw.capitalGuard == null ? DEFAULTS.capitalGuard : raw.capitalGuard) ? 1 : 0,
      capitalLimit: clamp(Number(raw.capitalLimit == null ? DEFAULTS.capitalLimit : raw.capitalLimit), 5, 500)
    };
  }

  function round(value, digits) {
    var scale = Math.pow(10, digits || 0);
    return Math.round(value * scale) / scale;
  }

  function money(value) {
    var abs = Math.abs(value);
    if (abs >= 1e9) return "$" + (value / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return "$" + (value / 1e6).toFixed(1) + "M";
    if (abs >= 1e3) return "$" + (value / 1e3).toFixed(1) + "K";
    return "$" + value.toFixed(0);
  }

  function number(value) {
    var abs = Math.abs(value);
    if (abs >= 1e9) return (value / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return (value / 1e6).toFixed(1) + "M";
    if (abs >= 1e3) return (value / 1e3).toFixed(1) + "K";
    return value.toFixed(0);
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var effectiveStaleServers = params.deploymentCheck ? 0 : params.staleServers;
    var activeParentOrders = params.badParentOrders * effectiveStaleServers;
    var rawRate = activeParentOrders * params.executionsPerParentMinute;
    var rawExecutions = rawRate * params.exposureMinutes;
    var routerLimitExecutions = params.routerGuard ? activeParentOrders * params.outputCap : Infinity;
    var capitalLimitExecutions = params.capitalGuard ?
      (params.capitalLimit * 1000000) / (CALIBRATION.sharesPerExecution * CALIBRATION.dollarsPerShareLoss) :
      Infinity;
    var executions = Math.min(rawExecutions, routerLimitExecutions, capitalLimitExecutions);
    if (!Number.isFinite(executions) || executions < 0) executions = 0;

    var activeMinutes = rawRate > 0 ? Math.min(params.exposureMinutes, executions / rawRate) : 0;
    var shares = executions * CALIBRATION.sharesPerExecution;
    var grossPosition = shares * CALIBRATION.dollarsPerShareGross;
    var estimatedLoss = shares * CALIBRATION.dollarsPerShareLoss;
    var amplification = activeParentOrders > 0 ? executions / activeParentOrders : 0;

    var stopReason = "manual stop at exposure horizon";
    if (params.deploymentCheck && params.staleServers > 0) stopReason = "deployment check catches mismatch";
    else if (executions === 0) stopReason = "no stale server receives the flag";
    else if (params.routerGuard && executions >= routerLimitExecutions - 1e-6 && routerLimitExecutions <= capitalLimitExecutions && routerLimitExecutions <= rawExecutions) stopReason = "router output cap stops loop";
    else if (params.capitalGuard && executions >= capitalLimitExecutions - 1e-6 && capitalLimitExecutions < routerLimitExecutions && capitalLimitExecutions <= rawExecutions) stopReason = "capital guard stops loop";

    var result = {
      params: params,
      constants: CALIBRATION,
      effectiveStaleServers: effectiveStaleServers,
      activeParentOrders: activeParentOrders,
      rawExecutions: rawExecutions,
      executions: executions,
      shares: shares,
      grossPosition: grossPosition,
      estimatedLoss: estimatedLoss,
      activeMinutes: activeMinutes,
      amplification: amplification,
      stopReason: stopReason
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var checks = [];
    function check(name, passed) {
      checks.push({ name: name, passed: !!passed });
    }

    var baseline = !result.params.deploymentCheck &&
      !result.params.routerGuard &&
      !result.params.capitalGuard &&
      result.params.staleServers === 1 &&
      result.params.badParentOrders === FACTS.observedParentOrders &&
      Math.abs(result.params.exposureMinutes - FACTS.observedMinutes) < 1e-9;

    check("outputs are finite and non-negative", [
      result.executions,
      result.shares,
      result.grossPosition,
      result.estimatedLoss,
      result.activeMinutes,
      result.amplification
    ].every(function (value) { return Number.isFinite(value) && value >= 0; }));

    check("deployment check prevents stale-server activation", !result.params.deploymentCheck || result.effectiveStaleServers === 0);
    check("zero stale servers cause zero erroneous executions", result.params.staleServers !== 0 || result.executions === 0);
    check("actual executions do not exceed raw loop", result.executions <= result.rawExecutions + 1e-6);
    check("router guard enforces per-parent cap", !result.params.routerGuard || result.executions <= result.activeParentOrders * result.params.outputCap + 1e-6);
    check("capital guard enforces configured loss bound", !result.params.capitalGuard || result.estimatedLoss <= result.params.capitalLimit * 1000000 + 1);
    if (baseline) {
      check("default calibration is near SEC execution count", Math.abs(result.executions - FACTS.observedExecutions) / FACTS.observedExecutions < 0.002);
      check("default calibration is near SEC share count", Math.abs(result.shares - FACTS.observedShares) / FACTS.observedShares < 0.002);
      check("default calibration is near SEC loss scale", Math.abs(result.estimatedLoss - FACTS.observedLoss) / FACTS.observedLoss < 0.002);
    }

    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function auditGrid() {
    return [
      {},
      { deploymentCheck: 1 },
      { routerGuard: 1, outputCap: 25 },
      { capitalGuard: 1, capitalLimit: 20 },
      { staleServers: 0 },
      { staleServers: 2, badParentOrders: 120, exposureMinutes: 20, executionsPerParentMinute: 350 }
    ].map(function (row) {
      var result = evaluate(row);
      return {
        params: result.params,
        executions: result.executions,
        shares: result.shares,
        estimatedLoss: result.estimatedLoss,
        activeMinutes: result.activeMinutes,
        amplification: result.amplification,
        passed: result.audit.passed,
        checks: result.audit.checks
      };
    });
  }

  function metric(label, value, className) {
    return '<div class="knight-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 900));
    var cssHeight = cssWidth < 700 ? 800 : 570;
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
    if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    else ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, COLORS.muted, 11, 560);
  }

  function drawServers(ctx, box, result) {
    panel(ctx, box, "deployment state", "eight routers; stale nodes can still call old code");
    var cols = 4;
    var gap = 10;
    var cellW = Math.floor((box.w - 40 - gap * (cols - 1)) / cols);
    var cellH = Math.min(46, Math.floor((box.h - 86 - gap) / 2));
    var startX = box.x + 20;
    var startY = box.y + 64;
    for (var i = 0; i < FACTS.servers; i += 1) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var x = startX + col * (cellW + gap);
      var y = startY + row * (cellH + gap);
      var stale = i < result.params.staleServers;
      var active = i < result.effectiveStaleServers;
      ctx.fillStyle = active ? "rgba(190, 18, 60, 0.13)" : (stale ? "rgba(180, 83, 9, 0.12)" : COLORS.faint);
      ctx.strokeStyle = active ? COLORS.bad : (stale ? COLORS.warn : COLORS.rule);
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, cellW, cellH, 6);
      else ctx.rect(x, y, cellW, cellH);
      ctx.fill();
      ctx.stroke();
      text(ctx, "server " + (i + 1), x + 10, y + 18, active ? COLORS.bad : COLORS.text, 11, 760);
      text(ctx, active ? "stale + live" : (stale ? "caught" : "new code"), x + 10, y + 35, active ? COLORS.bad : COLORS.muted, 10, 650);
    }
    var status = result.params.deploymentCheck ? "verification before open" : "no deployment parity check";
    text(ctx, status, box.x + 18, box.y + box.h - 18, result.params.deploymentCheck ? COLORS.good : COLORS.warn, 12, 760);
  }

  function drawTimeline(ctx, box, result) {
    panel(ctx, box, "execution growth", "repeated child orders accumulate until a stop condition");
    var left = box.x + 42;
    var right = box.x + box.w - 24;
    var top = box.y + 70;
    var bottom = box.y + box.h - 44;
    var width = right - left;
    var height = bottom - top;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    var maxExec = Math.max(result.rawExecutions, FACTS.observedExecutions, 1);
    var rawX = left + width;
    var actualX = left + width * (result.activeMinutes / result.params.exposureMinutes);
    var rawY = bottom - height * Math.min(1, result.rawExecutions / maxExec);
    var actualY = bottom - height * Math.min(1, result.executions / maxExec);
    ctx.strokeStyle = "rgba(190, 18, 60, 0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(rawX, rawY);
    ctx.stroke();
    ctx.strokeStyle = result.executions < result.rawExecutions ? COLORS.good : COLORS.bad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(actualX, actualY);
    ctx.stroke();
    ctx.fillStyle = result.executions < result.rawExecutions ? COLORS.good : COLORS.bad;
    ctx.beginPath();
    ctx.arc(actualX, actualY, 5, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, number(result.executions) + " executions", left, top - 10, result.executions < result.rawExecutions ? COLORS.good : COLORS.bad, 12, 760);
    text(ctx, round(result.activeMinutes, 2) + " active min", actualX, bottom + 22, COLORS.muted, 10, 650, "center");
    text(ctx, round(result.params.exposureMinutes, 1) + " min horizon", right, bottom + 22, COLORS.muted, 10, 650, "right");
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "loss-scale ledger", "calibrated from SEC volumes, shares, gross exposure, and loss");
    var rows = [
      ["bad parent orders", number(result.activeParentOrders), COLORS.text],
      ["child executions", number(result.executions), result.executions > 1000000 ? COLORS.bad : COLORS.good],
      ["shares", number(result.shares), COLORS.blue],
      ["gross position scale", money(result.grossPosition), COLORS.warn],
      ["estimated loss scale", money(result.estimatedLoss), result.estimatedLoss > 100000000 ? COLORS.bad : COLORS.good],
      ["amplification", round(result.amplification, 0) + "x", COLORS.text]
    ];
    var y = box.y + 68;
    rows.forEach(function (row) {
      text(ctx, row[0], box.x + 18, y, COLORS.muted, 11, 650);
      text(ctx, row[1], box.x + box.w - 18, y, row[2], 12, 780, "right");
      y += 29;
    });
  }

  function drawControls(ctx, box, result) {
    panel(ctx, box, "control effect", "compare raw loop volume with the simulated stopped volume");
    var left = box.x + 22;
    var right = box.x + box.w - 26;
    var top = box.y + 76;
    var max = Math.max(result.rawExecutions, FACTS.observedExecutions, 1);
    [
      ["raw loop", result.rawExecutions, COLORS.bad],
      ["actual", result.executions, result.executions < result.rawExecutions ? COLORS.good : COLORS.bad]
    ].forEach(function (row, i) {
      var y = top + i * 54;
      var w = (right - left - 96) * row[1] / max;
      text(ctx, row[0], left, y, COLORS.text, 12, 720);
      ctx.fillStyle = row[2];
      ctx.fillRect(left, y + 13, Math.max(1, w), 18);
      text(ctx, number(row[1]), left + Math.max(1, w) + 10, y + 28, row[2], 12, 760);
    });
    text(ctx, result.stopReason, left, box.y + box.h - 24, result.executions < result.rawExecutions ? COLORS.good : COLORS.warn, 12, 760);
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
      var h = Math.floor((height - gap * 3) / 4);
      drawServers(ctx, { x: 0, y: 0, w: width, h: h }, result);
      drawTimeline(ctx, { x: 0, y: h + gap, w: width, h: h }, result);
      drawLedger(ctx, { x: 0, y: 2 * (h + gap), w: width, h: h }, result);
      drawControls(ctx, { x: 0, y: 3 * (h + gap), w: width, h: height - 3 * (h + gap) }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.44);
      var rightW = width - leftW - gap2;
      var halfH = Math.floor((height - gap2) / 2);
      drawServers(ctx, { x: 0, y: 0, w: leftW, h: halfH }, result);
      drawLedger(ctx, { x: 0, y: halfH + gap2, w: leftW, h: height - halfH - gap2 }, result);
      drawTimeline(ctx, { x: leftW + gap2, y: 0, w: rightW, h: halfH }, result);
      drawControls(ctx, { x: leftW + gap2, y: halfH + gap2, w: rightW, h: height - halfH - gap2 }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      if (input.type === "checkbox") raw[input.getAttribute("data-param")] = input.checked ? 1 : 0;
      else raw[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      staleServers: String(result.params.staleServers),
      badParentOrders: String(result.params.badParentOrders),
      exposureMinutes: result.params.exposureMinutes.toFixed(1),
      executionsPerParentMinute: result.params.executionsPerParentMinute.toFixed(0),
      outputCap: String(result.params.outputCap),
      capitalLimit: "$" + result.params.capitalLimit.toFixed(0) + "M"
    };
    Object.keys(values).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && input.type !== "checkbox" && input.value !== String(result.params[key])) input.value = String(result.params[key]);
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Executions", number(result.executions), result.executions > 1000000 ? "knight-lab__metric--bad" : "knight-lab__metric--good"),
        metric("Shares", number(result.shares)),
        metric("Gross Scale", money(result.grossPosition), result.grossPosition > 1000000000 ? "knight-lab__metric--bad" : ""),
        metric("Loss Scale", money(result.estimatedLoss), result.estimatedLoss > 100000000 ? "knight-lab__metric--bad" : "knight-lab__metric--good"),
        metric("Stop", result.stopReason, result.executions < result.rawExecutions ? "knight-lab__metric--good" : "knight-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "This is a calibrated toy model, not a reconstruction of Knight's actual order book or liquidation.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__knightResult = result;
  }

  function init(root) {
    if (!root || root.__knightReady) return;
    root.__knightReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-knight-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    calibration: CALIBRATION,
    evaluate: evaluate,
    facts: FACTS
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.KnightDeployLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
