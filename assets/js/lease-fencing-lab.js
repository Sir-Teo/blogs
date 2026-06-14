(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    old: "#be123c",
    fresh: "#0f766e",
    lease: "#2563eb",
    padding: "#7c3aed",
    pause: "#b45309",
    fence: "#0f766e",
    warn: "#d97706",
    white: "#ffffff"
  };

  var DEFAULTS = {
    leaseTtlMs: 2000,
    paddingMs: 150,
    oldClockSkewMs: -250,
    pausePct: 35,
    pauseMs: 2200,
    oldWriteMs: 120,
    newWriteMs: 300
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numberParam(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      leaseTtlMs: Math.round(clamp(numberParam(raw, "leaseTtlMs"), 500, 5000)),
      paddingMs: Math.round(clamp(numberParam(raw, "paddingMs"), 0, 900)),
      oldClockSkewMs: Math.round(clamp(numberParam(raw, "oldClockSkewMs"), -900, 900)),
      pausePct: Math.round(clamp(numberParam(raw, "pausePct"), 5, 90)),
      pauseMs: Math.round(clamp(numberParam(raw, "pauseMs"), 0, 5000)),
      oldWriteMs: Math.round(clamp(numberParam(raw, "oldWriteMs"), 0, 1000)),
      newWriteMs: Math.round(clamp(numberParam(raw, "newWriteMs"), 0, 1000))
    };
  }

  function eventTimes(params) {
    var oldBeliefEndsAt = params.leaseTtlMs - params.oldClockSkewMs;
    var regrantAt = params.leaseTtlMs + params.paddingMs;
    var pauseAt = params.leaseTtlMs * params.pausePct / 100;
    var resumeAt = pauseAt + params.pauseMs;
    var oldWriteAt = resumeAt + params.oldWriteMs;
    var newWriteAt = regrantAt + params.newWriteMs;
    return {
      oldGrantAt: 0,
      oldExpiresAt: params.leaseTtlMs,
      oldBeliefEndsAt: oldBeliefEndsAt,
      regrantAt: regrantAt,
      newExpiresAt: regrantAt + params.leaseTtlMs,
      pauseAt: pauseAt,
      resumeAt: resumeAt,
      oldWriteAt: oldWriteAt,
      newWriteAt: newWriteAt
    };
  }

  function storageRace(times) {
    var events = [
      { actor: "old", token: 1, at: times.oldWriteAt },
      { actor: "new", token: 2, at: times.newWriteAt }
    ].sort(function (a, b) {
      if (Math.abs(a.at - b.at) < 1e-9) return b.token - a.token;
      return a.at - b.at;
    });
    var noFence = events.map(function (event) {
      return Object.assign({}, event, { accepted: true });
    });
    var maxToken = 0;
    var fenced = events.map(function (event) {
      var accepted = event.token >= maxToken;
      if (accepted) maxToken = event.token;
      return Object.assign({}, event, { accepted: accepted });
    });
    var acceptedFenced = fenced.filter(function (event) { return event.accepted; });
    return {
      noFence: noFence,
      fenced: fenced,
      finalNoFence: noFence[noFence.length - 1].actor,
      finalFenced: acceptedFenced[acceptedFenced.length - 1].actor,
      oldRejectedByFence: fenced.some(function (event) {
        return event.actor === "old" && !event.accepted;
      })
    };
  }

  function classifyPause(params, pauseMs) {
    var p = Object.assign({}, params, { pauseMs: pauseMs });
    var times = eventTimes(p);
    if (times.oldWriteAt <= times.regrantAt) return 0;
    if (times.oldWriteAt <= times.newWriteAt) return 1;
    return 2;
  }

  function sweepRows(params) {
    var rows = [];
    for (var pause = 0; pause <= 5000; pause += 50) {
      rows.push({
        pauseMs: pause,
        classId: classifyPause(params, pause)
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var times = eventTimes(params);
    var race = storageRace(times);
    var beliefOverlap = Math.max(0, times.oldBeliefEndsAt - times.regrantAt);
    var paddingSlack = Math.max(0, times.regrantAt - times.oldBeliefEndsAt);
    var lateOldWrite = times.oldWriteAt > times.regrantAt;
    var staleOverwrite = lateOldWrite && race.finalNoFence === "old";
    var horizon = Math.max(
      params.leaseTtlMs * 2.3 + params.paddingMs,
      times.newExpiresAt + 250,
      times.oldWriteAt + 450,
      times.newWriteAt + 450
    );
    return {
      params: params,
      times: times,
      race: race,
      sweep: sweepRows(params),
      summary: {
        beliefOverlap: beliefOverlap,
        paddingSlack: paddingSlack,
        lateOldWrite: lateOldWrite,
        staleOverwrite: staleOverwrite,
        oldRejectedByFence: race.oldRejectedByFence,
        finalNoFence: race.finalNoFence,
        finalFenced: race.finalFenced,
        horizon: horizon
      }
    };
  }

  function formatMs(value) {
    var sign = value < 0 ? "-" : "";
    return sign + Math.abs(value).toFixed(Math.abs(value) >= 100 ? 0 : 1) + " ms";
  }

  function formatPct(value) {
    return value + "%";
  }

  function metric(label, value) {
    return '<div class="lease-fencing-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      raw[key] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
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

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = targetHeight + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(targetHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, targetHeight);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, targetHeight);
    return { ctx: ctx, width: width, height: targetHeight };
  }

  function fitText(ctx, text, x, y, maxWidth) {
    text = String(text);
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }
    var out = text;
    while (out.length > 4 && ctx.measureText(out + "...").width > maxWidth) {
      out = out.slice(0, -1);
    }
    ctx.fillText(out + "...", x, y);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.panel;
    drawRoundedRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, Segoe UI, sans-serif";
    fitText(ctx, title, x + 12, y + 20, w - 24);
  }

  function drawAxis(ctx, scale, box, horizon) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x + box.w, box.y);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    for (var i = 0; i <= 4; i += 1) {
      var t = horizon * i / 4;
      var x = scale(t);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x, box.y);
      ctx.lineTo(x, box.y + box.h);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(Math.round(t) + "ms", x - 16, box.y + box.h + 15);
    }
  }

  function bar(ctx, scale, start, end, y, h, color, label, maxWidth) {
    var x1 = scale(start);
    var x2 = scale(end);
    var w = Math.max(2, x2 - x1);
    ctx.fillStyle = color;
    drawRoundedRect(ctx, x1, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = COLORS.white;
    ctx.font = "700 11px system-ui, -apple-system, Segoe UI, sans-serif";
    fitText(ctx, label, x1 + 5, y + h / 2 + 4, Math.min(maxWidth || w - 10, w - 10));
  }

  function marker(ctx, scale, t, y1, y2, color, label, align) {
    var x = scale(t);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "700 11px system-ui, -apple-system, Segoe UI, sans-serif";
    if (align === "right") fitText(ctx, label, x - 96, y1 - 6, 90);
    else fitText(ctx, label, x + 5, y1 - 6, 96);
  }

  function actorLabel(ctx, text, x, y) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "700 11px system-ui, -apple-system, Segoe UI, sans-serif";
    fitText(ctx, text, x, y, 78);
  }

  function drawLeasePanel(ctx, result, box) {
    var times = result.times;
    var params = result.params;
    var scale = function (t) {
      return box.x + clamp(t / result.summary.horizon, 0, 1) * box.w;
    };
    panel(ctx, box.x - 10, box.y - 42, box.w + 20, box.h + 78, "1. The lease is a timed promise, not a magic lock");
    drawAxis(ctx, scale, box, result.summary.horizon);
    actorLabel(ctx, "coordinator", box.x, box.y + 31);
    bar(ctx, scale, 0, times.oldExpiresAt, box.y + 40, 19, COLORS.lease, "old lease");
    bar(ctx, scale, times.oldExpiresAt, times.regrantAt, box.y + 40, 19, COLORS.padding, "wait");
    bar(ctx, scale, times.regrantAt, times.newExpiresAt, box.y + 40, 19, COLORS.fresh, "new lease");
    actorLabel(ctx, "old clock", box.x, box.y + 76);
    bar(ctx, scale, 0, times.oldBeliefEndsAt, box.y + 86, 19, COLORS.pause, "old believes valid");
    if (result.summary.beliefOverlap > 0) {
      bar(ctx, scale, times.regrantAt, times.oldBeliefEndsAt, box.y + 112, 15, COLORS.old, "overlap");
    } else {
      bar(ctx, scale, times.oldBeliefEndsAt, times.regrantAt, box.y + 112, 15, COLORS.fence, "slack");
    }
    marker(ctx, scale, times.oldExpiresAt, box.y + 30, box.y + 132, COLORS.lease, "expiry");
    marker(ctx, scale, times.regrantAt, box.y + 30, box.y + 132, COLORS.fresh, "regrant", "right");
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    fitText(ctx, "Old clock skew " + formatMs(params.oldClockSkewMs) + "; coordinator padding " + formatMs(params.paddingMs) + ".", box.x, box.y + 153, box.w);
  }

  function drawRacePanel(ctx, result, box) {
    var times = result.times;
    var scale = function (t) {
      return box.x + clamp(t / result.summary.horizon, 0, 1) * box.w;
    };
    panel(ctx, box.x - 10, box.y - 42, box.w + 20, box.h + 78, "2. A paused holder can still have an old write in flight");
    drawAxis(ctx, scale, box, result.summary.horizon);
    actorLabel(ctx, "old holder", box.x, box.y + 31);
    bar(ctx, scale, 0, times.pauseAt, box.y + 40, 18, COLORS.lease, "working");
    bar(ctx, scale, times.pauseAt, times.resumeAt, box.y + 40, 18, COLORS.pause, "paused");
    marker(ctx, scale, times.oldWriteAt, box.y + 36, box.y + 93, COLORS.old, "old write");
    actorLabel(ctx, "new holder", box.x, box.y + 86);
    bar(ctx, scale, times.regrantAt, times.newWriteAt, box.y + 94, 18, COLORS.fresh, "write after grant");
    marker(ctx, scale, times.newWriteAt, box.y + 90, box.y + 132, COLORS.fresh, "new write", "right");
    ctx.fillStyle = result.summary.staleOverwrite ? COLORS.old : COLORS.fresh;
    ctx.font = "700 12px system-ui, -apple-system, Segoe UI, sans-serif";
    var line = result.summary.staleOverwrite
      ? "Without a fence, the old epoch writes last."
      : "The stale write does not overwrite the new epoch in this timing.";
    fitText(ctx, line, box.x, box.y + 153, box.w);
  }

  function drawStoragePanel(ctx, result, box) {
    var events = result.race.noFence;
    var fenced = result.race.fenced;
    var scale = function (t) {
      return box.x + clamp(t / result.summary.horizon, 0, 1) * box.w;
    };
    panel(ctx, box.x - 10, box.y - 42, box.w + 20, box.h + 78, "3. The resource has to fence stale epochs");
    drawAxis(ctx, scale, box, result.summary.horizon);
    actorLabel(ctx, "no fence", box.x, box.y + 35);
    events.forEach(function (event) {
      var color = event.actor === "old" ? COLORS.old : COLORS.fresh;
      marker(ctx, scale, event.at, box.y + 46, box.y + 76, color, event.actor + " accepted");
    });
    actorLabel(ctx, "fenced", box.x, box.y + 95);
    fenced.forEach(function (event) {
      var color = event.accepted ? (event.actor === "old" ? COLORS.warn : COLORS.fence) : COLORS.old;
      marker(ctx, scale, event.at, box.y + 106, box.y + 137, color, event.actor + (event.accepted ? " accepted" : " rejected"), event.actor === "new" ? "right" : undefined);
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 12px system-ui, -apple-system, Segoe UI, sans-serif";
    fitText(ctx, "Final value without fence: " + result.summary.finalNoFence + "; with fence: " + result.summary.finalFenced + ".", box.x, box.y + 158, box.w);
  }

  function drawSweepPanel(ctx, result, box) {
    panel(ctx, box.x - 10, box.y - 42, box.w + 20, box.h + 75, "4. Sweep the pause duration");
    var rows = result.sweep;
    var w = box.w / rows.length;
    rows.forEach(function (row, i) {
      var color = row.classId === 0 ? COLORS.fence : (row.classId === 1 ? COLORS.warn : COLORS.old);
      ctx.fillStyle = color;
      ctx.fillRect(box.x + i * w, box.y + 34, Math.ceil(w), 44);
    });
    var currentX = box.x + clamp(result.params.pauseMs / 5000, 0, 1) * box.w;
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(currentX, box.y + 26);
    ctx.lineTo(currentX, box.y + 86);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("0ms", box.x, box.y + 100);
    ctx.fillText("5000ms", box.x + box.w - 45, box.y + 100);
    fitText(ctx, "green: old write before regrant; amber: late but before new write; red: old overwrites new without fencing", box.x, box.y + 121, box.w);
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 620;
    var setup = setupCanvas(canvas, compact ? 1040 : 780);
    var ctx = setup.ctx;
    var pad = compact ? 22 : 34;
    var innerW = setup.width - pad * 2;
    if (compact) {
      drawLeasePanel(ctx, result, { x: pad, y: 78, w: innerW, h: 168 });
      drawRacePanel(ctx, result, { x: pad, y: 326, w: innerW, h: 168 });
      drawStoragePanel(ctx, result, { x: pad, y: 574, w: innerW, h: 172 });
      drawSweepPanel(ctx, result, { x: pad, y: 826, w: innerW, h: 132 });
      return;
    }
    var colW = (innerW - 26) / 2;
    drawLeasePanel(ctx, result, { x: pad, y: 82, w: colW, h: 170 });
    drawRacePanel(ctx, result, { x: pad + colW + 26, y: 82, w: colW, h: 170 });
    drawStoragePanel(ctx, result, { x: pad, y: 366, w: colW, h: 174 });
    drawSweepPanel(ctx, result, { x: pad + colW + 26, y: 366, w: colW, h: 134 });
  }

  function renderMetrics(root, result) {
    var summary = result.summary;
    var fenceText = summary.oldRejectedByFence ? "old rejected" : "ordered";
    var rows = [
      metric("belief overlap", formatMs(summary.beliefOverlap)),
      metric("old write arrives", formatMs(result.times.oldWriteAt)),
      metric("new write arrives", formatMs(result.times.newWriteAt)),
      metric("without fence", summary.finalNoFence === "old" ? "old wins" : "new wins"),
      metric("with fence", fenceText),
      metric("padding slack", formatMs(summary.paddingSlack))
    ];
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = rows.join("");
  }

  function updateOutputs(root, params) {
    var display = {
      leaseTtlMs: formatMs(params.leaseTtlMs),
      paddingMs: formatMs(params.paddingMs),
      oldClockSkewMs: formatMs(params.oldClockSkewMs),
      pausePct: formatPct(params.pausePct),
      pauseMs: formatMs(params.pauseMs),
      oldWriteMs: formatMs(params.oldWriteMs),
      newWriteMs: formatMs(params.newWriteMs)
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")] || "";
    });
  }

  function render(root) {
    var params = parseParams(root);
    updateOutputs(root, params);
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (String(input.value) !== String(params[key])) input.value = params[key];
    });
    var result = evaluate(params);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
    root.__leaseFencingLast = result;
  }

  function initOne(root) {
    if (root.__leaseFencingReady) return;
    root.__leaseFencingReady = true;
    var pending = null;
    var schedule = function () {
      if (pending) global.cancelAnimationFrame(pending);
      pending = global.requestAnimationFrame(function () {
        pending = null;
        render(root);
      });
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render(root);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-lease-fencing-lab]")).forEach(initOne);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  global.LeaseFencingLab = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    storageRace: storageRace
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.LeaseFencingLab;
  }
})(typeof window !== "undefined" ? window : globalThis);
