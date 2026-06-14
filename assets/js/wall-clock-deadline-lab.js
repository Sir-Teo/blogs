(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    wall: "#be123c",
    mono: "#0f766e",
    deadline: "#7c3aed",
    completion: "#2563eb",
    lease: "#b45309",
    overlap: "#dc2626",
    sweep: "#64748b",
    white: "#ffffff"
  };

  var DEFAULTS = {
    adjustMs: 600,
    budgetMs: 800,
    driftPpm: 0,
    eventPct: 40,
    holderSkewMs: -250,
    leaseTtlMs: 1200,
    mode: "step",
    operationMs: 650
  };

  var MODES = ["none", "step", "slew", "smear"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function nearest(value, allowed, fallback) {
    value = String(value == null ? fallback : value);
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function numberParam(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      adjustMs: Math.round(clamp(numberParam(raw, "adjustMs"), -1200, 1200)),
      budgetMs: Math.round(clamp(numberParam(raw, "budgetMs"), 150, 2000)),
      driftPpm: Math.round(clamp(numberParam(raw, "driftPpm"), -900, 900)),
      eventPct: Math.round(clamp(numberParam(raw, "eventPct"), 5, 95)),
      holderSkewMs: Math.round(clamp(numberParam(raw, "holderSkewMs"), -900, 900)),
      leaseTtlMs: Math.round(clamp(numberParam(raw, "leaseTtlMs"), 300, 3000)),
      mode: nearest(raw.mode, MODES, DEFAULTS.mode),
      operationMs: Math.round(clamp(numberParam(raw, "operationMs"), 100, 2500))
    };
  }

  function eventTime(params) {
    return params.budgetMs * params.eventPct / 100;
  }

  function adjustmentAt(t, params, horizon) {
    if (params.mode === "none") return 0;
    var e = eventTime(params);
    if (params.mode === "step") return t >= e ? params.adjustMs : 0;
    if (params.mode === "slew") {
      if (t <= e) return 0;
      var done = e + params.budgetMs;
      if (t >= done) return params.adjustMs;
      return params.adjustMs * (t - e) / Math.max(1, done - e);
    }
    if (params.mode === "smear") {
      return params.adjustMs * clamp(t / Math.max(1, horizon), 0, 1);
    }
    return 0;
  }

  function wallReading(t, params, horizon, skewMs) {
    return t * (1 + params.driftPpm / 1000000) + (skewMs || 0) + adjustmentAt(t, params, horizon);
  }

  function firstCross(fn, horizon) {
    var step = Math.max(1, horizon / 2000);
    var lastT = 0;
    var lastV = fn(0);
    if (lastV >= 0) return 0;
    for (var t = step; t <= horizon + step / 2; t += step) {
      var v = fn(t);
      if (v >= 0) {
        var lo = lastT;
        var hi = t;
        for (var i = 0; i < 34; i += 1) {
          var mid = (lo + hi) / 2;
          if (fn(mid) >= 0) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      lastT = t;
      lastV = v;
    }
    return Infinity;
  }

  function horizonFor(params) {
    return Math.max(
      2600,
      params.budgetMs * 3.2 + Math.abs(params.adjustMs) * 1.4,
      params.operationMs * 1.4 + Math.abs(params.adjustMs),
      params.leaseTtlMs * 2.3 + Math.abs(params.holderSkewMs) + Math.abs(params.adjustMs)
    );
  }

  function timeoutResult(params, overrideAdjust) {
    var p = Object.assign({}, params);
    if (overrideAdjust != null) p.adjustMs = overrideAdjust;
    var horizon = horizonFor(p);
    var startWall = wallReading(0, p, horizon, 0);
    var wallAt = firstCross(function (t) {
      return wallReading(t, p, horizon, 0) - startWall - p.budgetMs;
    }, horizon);
    var monoAt = p.budgetMs;
    var wallOutcome = p.operationMs <= wallAt ? "complete" : "timeout";
    var monoOutcome = p.operationMs <= monoAt ? "complete" : "timeout";
    var falseEarly = wallOutcome === "timeout" && monoOutcome === "complete";
    var lateTimeout = wallAt - monoAt > 1 && monoOutcome === "timeout";
    return {
      wallAt: wallAt,
      monoAt: monoAt,
      wallError: wallAt - monoAt,
      wallOutcome: wallOutcome,
      monoOutcome: monoOutcome,
      falseEarly: falseEarly,
      lateTimeout: lateTimeout,
      horizon: horizon
    };
  }

  function leaseResult(params) {
    var horizon = horizonFor(params);
    var expiryTimestamp = params.leaseTtlMs;
    var holderStopsAt = firstCross(function (t) {
      return wallReading(t, params, horizon, params.holderSkewMs) - expiryTimestamp;
    }, horizon);
    var coordinatorRegrantsAt = params.leaseTtlMs;
    return {
      coordinatorRegrantsAt: coordinatorRegrantsAt,
      durationStopsAt: params.leaseTtlMs,
      earlyRelease: Math.max(0, coordinatorRegrantsAt - holderStopsAt),
      expiryTimestamp: expiryTimestamp,
      holderStopsAt: holderStopsAt,
      overlap: Math.max(0, holderStopsAt - coordinatorRegrantsAt)
    };
  }

  function makeTrace(params, horizon) {
    var rows = [];
    var n = 220;
    var startWall = wallReading(0, params, horizon, 0);
    for (var i = 0; i <= n; i += 1) {
      var t = horizon * i / n;
      rows.push({
        real: t,
        monotonicElapsed: t,
        wallElapsed: wallReading(t, params, horizon, 0) - startWall,
        holderWall: wallReading(t, params, horizon, params.holderSkewMs)
      });
    }
    return rows;
  }

  function sweepRows(params) {
    var rows = [];
    for (var j = -1200; j <= 1200; j += 60) {
      var p = Object.assign({}, params, { mode: params.mode === "none" ? "step" : params.mode });
      var row = timeoutResult(p, j);
      rows.push({ adjustMs: j, error: row.wallError });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var timeout = timeoutResult(params);
    var lease = leaseResult(params);
    var horizon = Math.max(timeout.horizon, horizonFor(params));
    return {
      params: params,
      timeout: timeout,
      lease: lease,
      eventAt: eventTime(params),
      horizon: horizon,
      trace: makeTrace(params, horizon),
      sweep: sweepRows(params)
    };
  }

  function formatMs(value) {
    if (!Number.isFinite(value)) return "never";
    var sign = value < 0 ? "-" : "";
    return sign + Math.abs(value).toFixed(Math.abs(value) >= 100 ? 0 : 1) + " ms";
  }

  function formatPpm(value) {
    return (value > 0 ? "+" : "") + value + " ppm";
  }

  function metric(label, value) {
    return '<div class="wall-clock-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      raw[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    return raw;
  }

  function updateOutputs(root, params) {
    var display = {
      adjustMs: formatMs(params.adjustMs),
      budgetMs: formatMs(params.budgetMs),
      driftPpm: formatPpm(params.driftPpm),
      eventPct: params.eventPct + "%",
      holderSkewMs: formatMs(params.holderSkewMs),
      leaseTtlMs: formatMs(params.leaseTtlMs),
      operationMs: formatMs(params.operationMs)
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")] || "";
    });
  }

  function renderMetrics(root, result) {
    var t = result.timeout;
    var l = result.lease;
    var verdict = t.falseEarly ? "false timeout" : (t.lateTimeout ? "late timeout" : t.wallOutcome);
    var html = [
      metric("wall outcome", verdict),
      metric("wall fires at", formatMs(t.wallAt)),
      metric("wall error", formatMs(t.wallError)),
      metric("monotonic fires at", formatMs(t.monoAt)),
      metric("lease overlap", formatMs(l.overlap)),
      metric("holder stops at", formatMs(l.holderStopsAt))
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var height = targetHeight;
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
  }

  function roundRect(ctx, x, y, w, h, r) {
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

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(title, box.x + 13, box.y + 23);
  }

  function label(ctx, text, x, y, color, align, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "12px system-ui, -apple-system, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function drawGrid(ctx, plot, zeroY) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h - i * plot.h / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    if (Number.isFinite(zeroY)) {
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, zeroY);
      ctx.lineTo(plot.x + plot.w, zeroY);
      ctx.stroke();
    }
  }

  function line(ctx, rows, x, y, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var px = x(row);
      var py = y(row);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawClockTraces(ctx, result, box) {
    panel(ctx, box, "Wall time can jump; elapsed time should not");
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 60, h: box.h - 78 };
    var maxY = Math.max(result.params.budgetMs * 1.45, result.params.operationMs * 1.1, result.params.budgetMs + Math.abs(result.params.adjustMs) * 1.2);
    var x = function (row) { return plot.x + row.real / Math.max(1, result.params.budgetMs * 1.7) * plot.w; };
    var y = function (value) { return plot.y + plot.h - clamp(value / maxY, -0.08, 1.08) * plot.h; };
    drawGrid(ctx, plot, y(0));
    line(ctx, result.trace.filter(function (r) { return r.real <= result.params.budgetMs * 1.7; }), x, function (row) { return y(row.wallElapsed); }, COLORS.wall, 2.3);
    line(ctx, result.trace.filter(function (r) { return r.real <= result.params.budgetMs * 1.7; }), x, function (row) { return y(row.monotonicElapsed); }, COLORS.mono, 2.1, [6, 5]);
    ctx.strokeStyle = COLORS.deadline;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, y(result.params.budgetMs));
    ctx.lineTo(plot.x + plot.w, y(result.params.budgetMs));
    ctx.stroke();
    ctx.setLineDash([]);
    var eventX = plot.x + result.eventAt / (result.params.budgetMs * 1.7) * plot.w;
    ctx.strokeStyle = COLORS.wall;
    ctx.beginPath();
    ctx.moveTo(eventX, plot.y);
    ctx.lineTo(eventX, plot.y + plot.h);
    ctx.stroke();
    label(ctx, "deadline", plot.x + plot.w - 54, y(result.params.budgetMs) - 6, COLORS.deadline);
    label(ctx, "wall", plot.x + 8, plot.y + 18, COLORS.wall, "left", "700 12px system-ui, sans-serif");
    label(ctx, "monotonic", plot.x + 8, plot.y + 36, COLORS.mono, "left", "700 12px system-ui, sans-serif");
    label(ctx, "real time", plot.x + plot.w - 52, plot.y + plot.h + 23);
  }

  function drawOperation(ctx, result, box) {
    panel(ctx, box, "Timeout decision");
    var plot = { x: box.x + 32, y: box.y + 54, w: box.w - 50, h: box.h - 84 };
    var maxT = Math.max(result.params.operationMs, result.timeout.wallAt, result.timeout.monoAt, result.params.budgetMs) * 1.15;
    function sx(t) { return plot.x + clamp(t / maxT, 0, 1.05) * plot.w; }
    function bar(y, end, color, text) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(plot.x, y, Math.max(2, sx(end) - plot.x), 20);
      ctx.globalAlpha = 1;
      label(ctx, text, plot.x, y - 6, color, "left", "700 12px system-ui, sans-serif");
      label(ctx, formatMs(end), sx(end) + 4, y + 15, COLORS.muted);
    }
    bar(plot.y + 4, result.params.operationMs, COLORS.completion, "operation completes");
    bar(plot.y + 52, result.timeout.wallAt, COLORS.wall, "wall-clock timeout");
    bar(plot.y + 100, result.timeout.monoAt, COLORS.mono, "monotonic timeout");
    ctx.strokeStyle = COLORS.deadline;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(result.params.budgetMs), plot.y - 10);
    ctx.lineTo(sx(result.params.budgetMs), plot.y + 132);
    ctx.stroke();
    ctx.setLineDash([]);
    var note = result.timeout.falseEarly
      ? "wall clock fired before a request that should have completed"
      : (result.timeout.lateTimeout ? "wall clock waited beyond the intended budget" : "wall and monotonic agree on this outcome");
    label(ctx, note, plot.x, box.y + box.h - 18, result.timeout.falseEarly || result.timeout.lateTimeout ? COLORS.wall : COLORS.muted);
  }

  function drawLease(ctx, result, box) {
    panel(ctx, box, "Absolute-expiry lease");
    var plot = { x: box.x + 34, y: box.y + 54, w: box.w - 52, h: box.h - 82 };
    var maxT = Math.max(result.lease.holderStopsAt, result.lease.coordinatorRegrantsAt, result.params.leaseTtlMs) * 1.2;
    function sx(t) { return plot.x + clamp(t / maxT, 0, 1.05) * plot.w; }
    ctx.fillStyle = COLORS.lease;
    ctx.globalAlpha = 0.68;
    ctx.fillRect(plot.x, plot.y + 4, Math.max(2, sx(result.lease.holderStopsAt) - plot.x), 24);
    ctx.globalAlpha = 1;
    label(ctx, "holder A believes lease is valid", plot.x, plot.y - 4, COLORS.lease, "left", "700 12px system-ui, sans-serif");
    ctx.fillStyle = COLORS.mono;
    ctx.globalAlpha = 0.68;
    ctx.fillRect(plot.x, plot.y + 62, Math.max(2, sx(result.lease.durationStopsAt) - plot.x), 22);
    ctx.globalAlpha = 1;
    label(ctx, "duration measured locally by monotonic clock", plot.x, plot.y + 54, COLORS.mono, "left", "700 12px system-ui, sans-serif");
    ctx.strokeStyle = COLORS.deadline;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(result.lease.coordinatorRegrantsAt), plot.y - 12);
    ctx.lineTo(sx(result.lease.coordinatorRegrantsAt), plot.y + 102);
    ctx.stroke();
    ctx.setLineDash([]);
    if (result.lease.overlap > 0) {
      ctx.fillStyle = COLORS.overlap;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(sx(result.lease.coordinatorRegrantsAt), plot.y - 8, sx(result.lease.holderStopsAt) - sx(result.lease.coordinatorRegrantsAt), 116);
      ctx.globalAlpha = 1;
      label(ctx, "overlap " + formatMs(result.lease.overlap), sx(result.lease.coordinatorRegrantsAt) + 5, plot.y + 112, COLORS.overlap);
    } else if (result.lease.earlyRelease > 0) {
      label(ctx, "early release " + formatMs(result.lease.earlyRelease), sx(result.lease.holderStopsAt) + 5, plot.y + 34, COLORS.muted);
    }
    label(ctx, "coordinator regrants", sx(result.lease.coordinatorRegrantsAt) + 4, plot.y - 14, COLORS.deadline);
    label(ctx, "real time", plot.x + plot.w - 50, plot.y + plot.h + 22);
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "Step-size sensitivity");
    var plot = { x: box.x + 42, y: box.y + 44, w: box.w - 60, h: box.h - 76 };
    var maxAbs = result.sweep.reduce(function (best, row) {
      return Math.max(best, Math.abs(row.error));
    }, 1);
    function sx(row) { return plot.x + (row.adjustMs + 1200) / 2400 * plot.w; }
    function sy(v) { return plot.y + plot.h / 2 - (v / Math.max(1, maxAbs)) * (plot.h * 0.43); }
    drawGrid(ctx, plot, sy(0));
    line(ctx, result.sweep, sx, function (row) { return sy(row.error); }, COLORS.sweep, 2);
    var current = { adjustMs: result.params.adjustMs, error: result.timeout.wallError };
    ctx.fillStyle = COLORS.wall;
    ctx.beginPath();
    ctx.arc(sx(current), sy(current.error), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.mono;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, sy(0));
    ctx.lineTo(plot.x + plot.w, sy(0));
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "wall timeout error", plot.x, plot.y + 14, COLORS.sweep, "left", "700 12px system-ui, sans-serif");
    label(ctx, "monotonic stays at zero error", plot.x, plot.y + 32, COLORS.mono);
    label(ctx, "clock adjustment", plot.x + plot.w - 92, plot.y + plot.h + 22);
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 700;
    var setup = setupCanvas(canvas, compact ? 980 : 700);
    var ctx = setup.ctx;
    if (compact) {
      drawClockTraces(ctx, result, { x: 8, y: 8, w: setup.width - 16, h: 236 });
      drawOperation(ctx, result, { x: 8, y: 256, w: setup.width - 16, h: 228 });
      drawLease(ctx, result, { x: 8, y: 496, w: setup.width - 16, h: 228 });
      drawSweep(ctx, result, { x: 8, y: 736, w: setup.width - 16, h: 236 });
    } else {
      var col = Math.round((setup.width - 28) / 2);
      drawClockTraces(ctx, result, { x: 8, y: 8, w: col, h: 330 });
      drawOperation(ctx, result, { x: col + 20, y: 8, w: setup.width - col - 28, h: 330 });
      drawLease(ctx, result, { x: 8, y: 354, w: col, h: 338 });
      drawSweep(ctx, result, { x: col + 20, y: 354, w: setup.width - col - 28, h: 338 });
    }
  }

  function render(root) {
    var result = evaluate(parseParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-wall-clock-lab]")).forEach(function (root) {
      if (root.__wallClockReady) return;
      root.__wallClockReady = true;
      var schedule = null;
      function requestRender() {
        if (schedule && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(schedule);
        schedule = typeof global.requestAnimationFrame === "function"
          ? global.requestAnimationFrame(function () {
            schedule = null;
            render(root);
          })
          : global.setTimeout(function () {
            schedule = null;
            render(root);
          }, 16);
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      global.addEventListener("resize", requestRender);
    });
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    timeoutResult: timeoutResult,
    wallReading: wallReading
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.WallClockDeadlineLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
