(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d8e0e8",
    grid: "#edf2f7",
    rollback: "#be123c",
    predict: "#7c3aed",
    lockstep: "#2563eb",
    ok: "#0f766e",
    warn: "#d97706",
    actual: "#172026",
    ghost: "#94a3b8",
    bg: "#ffffff"
  };

  var DEFAULTS = {
    rtt: 80,
    jitter: 14,
    inputDelay: 2,
    volatility: 24,
    rollbackWindow: 8,
    simCost: 18
  };

  var FRAME_MS = 1000 / 60;
  var FRAMES = 240;
  var SPEED = 1.35;
  var CURVE_DELAYS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      rtt: snap(raw.rtt, DEFAULTS.rtt, 20, 220, 5),
      jitter: snap(raw.jitter, DEFAULTS.jitter, 0, 90, 1),
      inputDelay: snap(raw.inputDelay, DEFAULTS.inputDelay, 0, 8, 1),
      volatility: snap(raw.volatility, DEFAULTS.volatility, 0, 100, 1),
      rollbackWindow: snap(raw.rollbackWindow, DEFAULTS.rollbackWindow, 2, 16, 1),
      simCost: snap(raw.simCost, DEFAULTS.simCost, 5, 80, 1)
    };
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rng) {
    var u = Math.max(1e-9, rng());
    var v = Math.max(1e-9, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value) {
    return '<div class="rollback-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function generateInputs(params) {
    var rng = makeRng(0xC0FFEE);
    var pChange = 0.015 + 0.26 * params.volatility / 100;
    var inputs = [];
    var current = 0;
    for (var frame = 0; frame < FRAMES + 40; frame += 1) {
      if (rng() < pChange) {
        var roll = rng();
        if (roll < 0.36) current = -1;
        else if (roll < 0.72) current = 1;
        else current = 0;
      }
      if (rng() < 0.018 * params.volatility / 100) current = -current;
      inputs.push(current);
    }
    return inputs;
  }

  function generateDelays(params) {
    var rng = makeRng(0xBAD5EED);
    var oneWay = params.rtt / 2;
    var delays = [];
    for (var frame = 0; frame < FRAMES + 40; frame += 1) {
      var spike = rng() < 0.025 + params.jitter / 2800 ? params.jitter * (0.8 + 1.2 * rng()) : 0;
      var delayMs = oneWay + params.jitter * 0.55 * normal(rng) + spike;
      delayMs = clamp(delayMs, 1, 280);
      delays.push(Math.ceil(delayMs / FRAME_MS));
    }
    return delays;
  }

  function actualPositions(inputs) {
    var positions = [0];
    for (var frame = 0; frame < inputs.length; frame += 1) {
      positions[frame + 1] = positions[frame] + inputs[frame] * SPEED;
    }
    return positions;
  }

  function percentile(values, q) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = clamp(Math.floor((sorted.length - 1) * q), 0, sorted.length - 1);
    return sorted[index];
  }

  function simulateRollback(params, inputs, delays, actual) {
    var predInput = [];
    var knownInput = [];
    var predicted = [0];
    var knownThrough = -1;
    var currentSim = -1;
    var lastKnownInput = 0;
    var events = [];
    var frameRows = [];
    var totalRollbackFrames = 0;
    var maxRollback = 0;
    var hardSnaps = 0;
    var budgetMisses = 0;
    var absErrors = [];
    var predictedFrames = 0;

    function recomputeFrom(startFrame) {
      var from = Math.max(0, startFrame);
      if (from === 0) predicted[0] = 0;
      for (var k = from; k <= currentSim; k += 1) {
        predicted[k + 1] = predicted[k] + predInput[k] * SPEED;
      }
    }

    for (var renderFrame = 0; renderFrame < FRAMES; renderFrame += 1) {
      var eventDepth = 0;
      var eventKind = "";

      for (var f = 0; f <= Math.min(renderFrame, inputs.length - 1); f += 1) {
        if (knownInput[f] == null && f + delays[f] <= renderFrame) {
          knownInput[f] = inputs[f];
          if (f > knownThrough) knownThrough = f;
          lastKnownInput = inputs[f];
          if (f <= currentSim && predInput[f] !== inputs[f]) {
            var depth = currentSim - f + 1;
            predInput[f] = inputs[f];
            if (depth <= params.rollbackWindow) {
              recomputeFrom(f);
              events.push({ frame: renderFrame, sourceFrame: f, depth: depth, hard: false });
              totalRollbackFrames += depth;
              maxRollback = Math.max(maxRollback, depth);
              eventDepth = Math.max(eventDepth, depth);
              eventKind = "rollback";
              if (depth * params.simCost > 100) budgetMisses += 1;
            } else {
              predicted[currentSim + 1] = actual[currentSim + 1];
              hardSnaps += 1;
              events.push({ frame: renderFrame, sourceFrame: f, depth: depth, hard: true });
              eventDepth = Math.max(eventDepth, depth);
              eventKind = "snap";
            }
          }
        }
      }

      var targetSim = Math.max(-1, renderFrame - params.inputDelay);
      while (currentSim < targetSim) {
        currentSim += 1;
        if (knownInput[currentSim] != null) predInput[currentSim] = knownInput[currentSim];
        else {
          predInput[currentSim] = currentSim > 0 ? predInput[currentSim - 1] : lastKnownInput;
          predictedFrames += 1;
        }
        predicted[currentSim + 1] = predicted[currentSim] + predInput[currentSim] * SPEED;
      }

      var visibleFrame = Math.max(0, currentSim);
      var err = Math.abs((predicted[visibleFrame + 1] || 0) - (actual[visibleFrame + 1] || 0));
      absErrors.push(err);
      frameRows.push({
        frame: renderFrame,
        visibleFrame: visibleFrame,
        knownThrough: knownThrough,
        delay: delays[renderFrame] || 0,
        predictedInput: predInput[visibleFrame] || 0,
        actualInput: inputs[visibleFrame] || 0,
        predicted: predicted[visibleFrame + 1] || 0,
        actual: actual[visibleFrame + 1] || 0,
        absError: err,
        eventDepth: eventDepth,
        eventKind: eventKind,
        predictedAhead: knownThrough < visibleFrame
      });
    }

    return {
      avgError: absErrors.reduce(function (a, b) { return a + b; }, 0) / absErrors.length,
      p95Error: percentile(absErrors, 0.95),
      budgetMisses: budgetMisses,
      events: events,
      frames: frameRows,
      hardSnaps: hardSnaps,
      inputLatencyMs: params.inputDelay * FRAME_MS,
      maxRollback: maxRollback,
      predictedShare: predictedFrames / Math.max(1, FRAMES - params.inputDelay),
      rollbackFramesPerMinute: totalRollbackFrames * (60 * 60 / FRAMES),
      rollbackEventsPerMinute: events.filter(function (e) { return !e.hard; }).length * (60 * 60 / FRAMES),
      totalRollbackFrames: totalRollbackFrames
    };
  }

  function simulateLockstep(params, delays) {
    var late = 0;
    var lateDepth = 0;
    var maxLate = 0;
    for (var frame = 0; frame < FRAMES; frame += 1) {
      var excess = Math.max(0, delays[frame] - params.inputDelay);
      if (excess > 0) {
        late += 1;
        lateDepth += excess;
        maxLate = Math.max(maxLate, excess);
      }
    }
    return {
      inputLatencyMs: params.inputDelay * FRAME_MS,
      lateShare: late / FRAMES,
      stallFramesPerMinute: lateDepth * (60 * 60 / FRAMES),
      maxLate: maxLate
    };
  }

  function evaluateAt(rawParams, inputDelay) {
    var params = cleanParams(rawParams);
    params.inputDelay = inputDelay;
    var inputs = generateInputs(params);
    var delays = generateDelays(params);
    var actual = actualPositions(inputs);
    return {
      params: params,
      inputs: inputs,
      delays: delays,
      actual: actual,
      rollback: simulateRollback(params, inputs, delays, actual),
      lockstep: simulateLockstep(params, delays)
    };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var selected = evaluateAt(params, params.inputDelay);
    var curve = CURVE_DELAYS.map(function (d) {
      return evaluateAt(params, d);
    });
    return {
      params: params,
      selected: selected,
      curve: curve
    };
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function label(ctx, text, x, y, align, color) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
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

  function drawLine(ctx, points, sx, sy, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (p, i) {
      var x = sx(p);
      var y = sy(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawTradeoffPanel(ctx, result, box) {
    panelTitle(ctx, box, "Delay buys fewer surprises", "input buffer versus correction pressure");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 72, h: box.h - 92 };
    drawAxis(ctx, plot);
    var maxY = 1;
    result.curve.forEach(function (row) {
      maxY = Math.max(maxY, row.rollback.rollbackFramesPerMinute, row.lockstep.stallFramesPerMinute);
    });
    maxY *= 1.08;
    function sx(row) { return plot.x + row.params.inputDelay / 8 * plot.w; }
    function sy(value) { return plot.y + plot.h - value / maxY * plot.h; }
    for (var i = 1; i <= 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    drawLine(ctx, result.curve, sx, function (row) { return sy(row.rollback.rollbackFramesPerMinute); }, COLORS.rollback, 2.5);
    drawLine(ctx, result.curve, sx, function (row) { return sy(row.lockstep.stallFramesPerMinute); }, COLORS.lockstep, 2.2);
    var selectedX = plot.x + result.params.inputDelay / 8 * plot.w;
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(selectedX, plot.y);
    ctx.lineTo(selectedX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "rollback resim frames/min", plot.x + 8, plot.y + 16, "left", COLORS.rollback);
    label(ctx, "lockstep stall frames/min", plot.x + 8, plot.y + 34, "left", COLORS.lockstep);
    label(ctx, "0f", plot.x, plot.y + plot.h + 18, "left");
    label(ctx, "8f", plot.x + plot.w, plot.y + plot.h + 18, "right");
    label(ctx, Math.round(maxY) + "/min", plot.x - 8, plot.y, "right");
  }

  function drawTimelinePanel(ctx, result, box) {
    panelTitle(ctx, box, "Four seconds of local time", "purple means predicted remote input; red means correction");
    var rows = result.selected.rollback.frames;
    var plot = { x: box.x + 16, y: box.y + 54, w: box.w - 32, h: box.h - 92 };
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    rows.forEach(function (row) {
      var x = plot.x + row.frame / (FRAMES - 1) * plot.w;
      if (row.predictedAhead) {
        ctx.fillStyle = "rgba(124, 58, 237, 0.20)";
        ctx.fillRect(x, plot.y, Math.max(1, plot.w / FRAMES), plot.h);
      }
      if (row.eventDepth) {
        ctx.fillStyle = row.eventKind === "snap" ? COLORS.warn : COLORS.rollback;
        var barH = Math.min(plot.h, row.eventDepth / result.params.rollbackWindow * plot.h);
        ctx.fillRect(x, plot.y + plot.h - barH, Math.max(2, plot.w / FRAMES), barH);
      }
    });
    for (var i = 0; i <= 4; i += 1) {
      var xx = plot.x + plot.w * i / 4;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(xx, plot.y + plot.h);
      ctx.lineTo(xx, plot.y + plot.h + 5);
      ctx.stroke();
      label(ctx, i + "s", xx, plot.y + plot.h + 18, "center");
    }
    label(ctx, "predicted", plot.x + 8, plot.y + 16, "left", COLORS.predict);
    label(ctx, "rollback depth", plot.x + 8, plot.y + 34, "left", COLORS.rollback);
  }

  function drawErrorPanel(ctx, result, box) {
    panelTitle(ctx, box, "Prediction error", "distance between predicted and true remote state");
    var rows = result.selected.rollback.frames;
    var plot = { x: box.x + 44, y: box.y + 54, w: box.w - 66, h: box.h - 92 };
    var maxErr = 1;
    rows.forEach(function (row) { maxErr = Math.max(maxErr, row.absError); });
    maxErr *= 1.1;
    drawAxis(ctx, plot);
    for (var i = 1; i <= 3; i += 1) {
      var y = plot.y + plot.h * i / 3;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    drawLine(ctx, rows, function (row) {
      return plot.x + row.frame / (FRAMES - 1) * plot.w;
    }, function (row) {
      return plot.y + plot.h - row.absError / maxErr * plot.h;
    }, COLORS.warn, 2);
    label(ctx, "0", plot.x - 8, plot.y + plot.h, "right");
    label(ctx, formatNumber(maxErr, 1), plot.x - 8, plot.y, "right");
    label(ctx, "p95 error " + formatNumber(result.selected.rollback.p95Error, 1), plot.x + 8, plot.y + 18, "left", COLORS.warn);
  }

  function drawArenaPanel(ctx, result, box) {
    panelTitle(ctx, box, "One reconstructed worldline", "actual remote state versus the local speculative copy");
    var rows = result.selected.rollback.frames;
    var row = rows[Math.min(rows.length - 1, 180)];
    var history = rows.slice(0, 181);
    var all = [];
    history.forEach(function (r) {
      all.push(r.actual);
      all.push(r.predicted);
    });
    var minX = Math.min.apply(null, all.concat([-10]));
    var maxX = Math.max.apply(null, all.concat([10]));
    var plot = { x: box.x + 22, y: box.y + 78, w: box.w - 44, h: box.h - 130 };
    function sx(v) { return plot.x + (v - minX) / Math.max(1, maxX - minX) * plot.w; }
    var mid = plot.y + plot.h / 2;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, mid);
    ctx.lineTo(plot.x + plot.w, mid);
    ctx.stroke();
    ctx.strokeStyle = "rgba(23, 32, 38, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach(function (r, i) {
      var x = sx(r.actual);
      var y = mid - 26 - 8 * Math.sin(i / 8);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.strokeStyle = "rgba(124, 58, 237, 0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach(function (r, i) {
      var x = sx(r.predicted);
      var y = mid + 26 + 8 * Math.cos(i / 9);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = COLORS.actual;
    ctx.beginPath();
    ctx.arc(sx(row.actual), mid - 26, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = COLORS.predict;
    ctx.beginPath();
    ctx.arc(sx(row.predicted), mid + 26, 8, 0, 2 * Math.PI);
    ctx.fill();
    label(ctx, "actual remote", plot.x, box.y + box.h - 48, "left", COLORS.actual);
    label(ctx, "local speculative copy", plot.x, box.y + box.h - 28, "left", COLORS.predict);
    label(ctx, "frame " + row.visibleFrame, plot.x + plot.w, box.y + box.h - 38, "right", COLORS.muted);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 680;
    var height = compact ? 960 : 700;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    var gap = compact ? 22 : 26;
    var boxW = compact ? width - 24 : (width - 36 - gap) / 2;
    var boxH = compact ? 220 : 305;
    var left = 12;
    var right = compact ? 12 : left + boxW + gap;
    var top = 14;
    var boxes = compact ? [
      { x: left, y: top, w: boxW, h: boxH },
      { x: left, y: top + boxH + gap, w: boxW, h: boxH },
      { x: left, y: top + 2 * (boxH + gap), w: boxW, h: boxH },
      { x: left, y: top + 3 * (boxH + gap), w: boxW, h: boxH }
    ] : [
      { x: left, y: top, w: boxW, h: boxH },
      { x: right, y: top, w: boxW, h: boxH },
      { x: left, y: top + boxH + gap, w: boxW, h: boxH },
      { x: right, y: top + boxH + gap, w: boxW, h: boxH }
    ];

    drawTradeoffPanel(ctx, result, boxes[0]);
    drawTimelinePanel(ctx, result, boxes[1]);
    drawErrorPanel(ctx, result, boxes[2]);
    drawArenaPanel(ctx, result, boxes[3]);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function updateControls(root, params) {
    var values = {
      inputDelay: params.inputDelay + "f",
      jitter: params.jitter + "ms",
      rollbackWindow: params.rollbackWindow + "f",
      rtt: params.rtt + "ms",
      simCost: params.simCost + "%",
      volatility: params.volatility + "%"
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function render(root) {
    var result = evaluate(paramsFromRoot(root));
    updateControls(root, result.params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var rb = result.selected.rollback;
      var ls = result.selected.lockstep;
      metrics.innerHTML = [
        metric("Input delay", formatNumber(rb.inputLatencyMs, 0) + "ms"),
        metric("Corrections", rb.events.length),
        metric("Resim frames", rb.totalRollbackFrames),
        metric("Max rollback", rb.maxRollback + "f"),
        metric("Lockstep stalls", formatPct(ls.lateShare)),
        metric("P95 error", formatNumber(rb.p95Error, 1) + "u")
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas && canvas.getContext) drawChart(canvas, result);
  }

  function init(root) {
    var frame = 0;
    function requestRender() {
      if (frame) global.cancelAnimationFrame(frame);
      frame = global.requestAnimationFrame(function () {
        frame = 0;
        render(root);
      });
    }
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
    });
    global.addEventListener("resize", requestRender);
    render(root);
  }

  function boot() {
    global.document.querySelectorAll("[data-rollback-netcode-lab]").forEach(init);
  }

  global.RollbackNetcodeLab = {
    evaluate: evaluate,
    cleanParams: cleanParams
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.RollbackNetcodeLab;
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
