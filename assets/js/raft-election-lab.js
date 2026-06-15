(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#eef2f6",
    panel: "#f8fafc",
    first: "#0f766e",
    split: "#be123c",
    rpc: "#2563eb",
    timeout: "#7c3aed",
    retry: "#d97706",
    gray: "#94a3b8",
    good: "#15803d",
    bad: "#b91c1c"
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cleanParams(raw) {
    raw = raw || {};
    var nodes = clamp(Math.round(raw.nodes == null ? 5 : raw.nodes), 3, 9);
    if (nodes % 2 === 0) nodes += nodes >= 9 ? -1 : 1;
    return {
      broadcast: clamp(Number(raw.broadcast == null ? 15 : raw.broadcast), 1, 120),
      minTimeout: clamp(Number(raw.minTimeout == null ? 150 : raw.minTimeout), 20, 600),
      nodes: nodes,
      seed: clamp(Math.round(raw.seed == null ? 41 : raw.seed), 1, 999),
      spread: clamp(Number(raw.spread == null ? 150 : raw.spread), 0, 500),
      trials: clamp(Math.round(raw.trials == null ? 1200 : raw.trials), 100, 6000)
    };
  }

  function cleanProbability(nodes, spread, broadcast) {
    if (broadcast <= 0) return 1;
    if (spread <= 0 || broadcast >= spread) return 0;
    return Math.pow(1 - broadcast / spread, nodes);
  }

  function drawOneRound(params, random) {
    var rows = [];
    for (var i = 0; i < params.nodes; i += 1) {
      rows.push({
        id: i,
        timeout: params.minTimeout + (params.spread <= 0 ? 0 : random() * params.spread)
      });
    }
    rows.sort(function (a, b) {
      if (a.timeout !== b.timeout) return a.timeout - b.timeout;
      return a.id - b.id;
    });
    var first = rows[0];
    var second = rows[1];
    var gap = second.timeout - first.timeout;
    var clean = gap > params.broadcast;
    return {
      clean: clean,
      firstId: first.id,
      firstTimeout: first.timeout,
      gap: gap,
      rpcDeadline: first.timeout + params.broadcast,
      rows: rows,
      secondId: second.id,
      secondTimeout: second.timeout
    };
  }

  function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    var pos = clamp(p, 0, 1) * (sorted.length - 1);
    var lo = Math.floor(pos);
    var hi = Math.ceil(pos);
    var t = pos - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams);
    var random = rng(params.seed * 1000003 + params.nodes * 7919 + Math.round(params.spread * 13));
    var cleanCount = 0;
    var gapSum = 0;
    var firstSum = 0;
    var gaps = [];
    var example = null;

    for (var t = 0; t < params.trials; t += 1) {
      var round = drawOneRound(params, random);
      if (t === 0) example = round;
      if (round.clean) cleanCount += 1;
      gapSum += round.gap;
      firstSum += round.firstTimeout;
      gaps.push(round.gap);
    }

    gaps.sort(function (a, b) { return a - b; });
    var empirical = cleanCount / params.trials;
    var formula = cleanProbability(params.nodes, params.spread, params.broadcast);
    var expectedFirst = params.minTimeout + (params.spread <= 0 ? 0 : params.spread / (params.nodes + 1));
    var oneRoundFloor = expectedFirst + params.broadcast;
    var retryMultiplier = formula > 0 ? 1 / formula : Infinity;

    return {
      avgFirstTimeout: firstSum / params.trials,
      avgGap: gapSum / params.trials,
      cleanCount: cleanCount,
      cleanFormula: formula,
      cleanRate: empirical,
      example: example,
      expectedFirstTimeout: expectedFirst,
      gapP10: quantile(gaps, 0.10),
      gapP50: quantile(gaps, 0.50),
      gapP90: quantile(gaps, 0.90),
      oneRoundFloor: oneRoundFloor,
      params: params,
      retryMultiplier: retryMultiplier,
      timeoutRatio: params.broadcast > 0 ? params.minTimeout / params.broadcast : Infinity
    };
  }

  function runAudit() {
    var cases = 0;
    var ok = 0;
    var failures = [];
    var spreads = [0, 20, 50, 100, 150, 300];
    var broadcasts = [5, 15, 30, 60];
    var nodeCounts = [3, 5, 7, 9];
    nodeCounts.forEach(function (nodes) {
      spreads.forEach(function (spread) {
        broadcasts.forEach(function (broadcast) {
          cases += 1;
          var exact = cleanProbability(nodes, spread, broadcast);
          var result = simulate({
            broadcast: broadcast,
            minTimeout: 150,
            nodes: nodes,
            seed: 11 + nodes + spread + broadcast,
            spread: spread,
            trials: 6000
          });
          var tolerance = exact === 0 || exact === 1 ? 0.002 : 0.035;
          var passed = Math.abs(result.cleanRate - exact) <= tolerance &&
            result.gapP10 <= result.gapP50 &&
            result.gapP50 <= result.gapP90 &&
            result.expectedFirstTimeout >= 150 &&
            isFinite(result.avgGap);
          if (spread > broadcast && nodes < 9) {
            var wider = cleanProbability(nodes, spread + 50, broadcast);
            passed = passed && wider >= exact;
          }
          if (passed) ok += 1;
          else failures.push({
            broadcast: broadcast,
            exact: exact,
            nodes: nodes,
            rate: result.cleanRate,
            spread: spread
          });
        });
      });
    });
    return {
      cases: cases,
      failures: failures.slice(0, 4),
      ok: ok
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return "inf";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value) {
    return '<div class="raft-election-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, box.x + 12, box.y + 21, COLORS.text, 13, 780);
    if (subtitle) label(ctx, subtitle, box.x + 12, box.y + 38, COLORS.muted, 10, 650);
  }

  function drawTimeline(ctx, result, box) {
    var clean = result.example.clean;
    panel(ctx, box, "one election timeout race", clean ? "first candidate has room to broadcast" : "second timeout lands inside the RPC window");
    var rows = result.example.rows;
    var maxT = result.params.minTimeout + Math.max(result.params.spread, result.params.broadcast) + result.params.broadcast * 1.25;
    var minT = Math.max(0, result.params.minTimeout - result.params.broadcast * 1.3);
    var plot = { x: box.x + 62, y: box.y + 58, w: box.w - 88, h: box.h - 92 };
    function x(t) {
      return plot.x + (t - minT) / Math.max(1e-9, maxT - minT) * plot.w;
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gx = plot.x + plot.w * g / 4;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y - 10);
      ctx.lineTo(gx, plot.y + plot.h + 10);
      ctx.stroke();
      label(ctx, fmt(minT + (maxT - minT) * g / 4, 0) + "ms", gx, plot.y + plot.h + 28, COLORS.muted, 9, 600, "center");
    }

    var firstX = x(result.example.firstTimeout);
    var deadlineX = x(result.example.rpcDeadline);
    ctx.fillStyle = clean ? "rgba(15,118,110,0.10)" : "rgba(190,18,60,0.10)";
    ctx.fillRect(firstX, plot.y - 14, Math.max(1, deadlineX - firstX), plot.h + 28);
    ctx.strokeStyle = clean ? COLORS.first : COLORS.split;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(deadlineX, plot.y - 15);
    ctx.lineTo(deadlineX, plot.y + plot.h + 15);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "RPC window", firstX + 4, plot.y - 21, clean ? COLORS.first : COLORS.split, 10, 760);

    rows.forEach(function (row, i) {
      var y = plot.y + i * plot.h / Math.max(1, rows.length - 1);
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, "S" + row.id, box.x + 16, y + 4, COLORS.muted, 10, 700);
      ctx.fillStyle = i === 0 ? (clean ? COLORS.first : COLORS.split) : COLORS.timeout;
      ctx.beginPath();
      ctx.arc(x(row.timeout), y, i === 0 ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (i === 0) label(ctx, "first", x(row.timeout) + 7, y + 4, clean ? COLORS.first : COLORS.split, 9, 760);
      if (i === 1) label(ctx, "second", x(row.timeout) + 7, y + 4, COLORS.timeout, 9, 760);
    });

    label(ctx, "gap " + fmt(result.example.gap, 1) + "ms vs RPC " + fmt(result.params.broadcast, 0) + "ms", box.x + 12, box.y + box.h - 14, clean ? COLORS.first : COLORS.split, 11, 780);
  }

  function drawCurve(ctx, result, box) {
    panel(ctx, box, "randomness buys separation", "P(clean) = (1 - rpc/spread)^nodes in the simple gap model");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 74, h: box.h - 88 };
    var maxSpread = Math.max(80, result.params.spread * 1.35, result.params.broadcast * 5);
    function x(spread) { return plot.x + spread / maxSpread * plot.w; }
    function y(prob) { return plot.y + (1 - prob) * plot.h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var py = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, py);
      ctx.lineTo(plot.x + plot.w, py);
      ctx.stroke();
      label(ctx, fmt(100 * (1 - i / 4), 0) + "%", plot.x - 8, py + 4, COLORS.muted, 9, 600, "right");
    }
    for (var j = 0; j <= 4; j += 1) {
      var px = plot.x + plot.w * j / 4;
      ctx.beginPath();
      ctx.moveTo(px, plot.y);
      ctx.lineTo(px, plot.y + plot.h);
      ctx.stroke();
      label(ctx, fmt(maxSpread * j / 4, 0), px, plot.y + plot.h + 18, COLORS.muted, 9, 600, "center");
    }

    ctx.strokeStyle = COLORS.rpc;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var s = 0; s <= 100; s += 1) {
      var spread = maxSpread * s / 100;
      var prob = cleanProbability(result.params.nodes, spread, result.params.broadcast);
      if (s === 0) ctx.moveTo(x(spread), y(prob));
      else ctx.lineTo(x(spread), y(prob));
    }
    ctx.stroke();

    var cx = x(result.params.spread);
    var cy = y(result.cleanFormula);
    ctx.fillStyle = COLORS.rpc;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.split;
    ctx.beginPath();
    ctx.arc(cx, y(result.cleanRate), 3.5, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, "spread (ms)", plot.x + plot.w, plot.y + plot.h + 36, COLORS.muted, 9, 650, "right");
    label(ctx, "formula", cx + 8, cy - 6, COLORS.rpc, 10, 760);
    label(ctx, "simulation", cx + 8, y(result.cleanRate) + 13, COLORS.split, 10, 760);
  }

  function bar(ctx, x, y, w, h, value, max, color, labelText, valueText) {
    ctx.fillStyle = "#edf2f7";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(value / Math.max(1e-9, max), 0, 1), h);
    label(ctx, labelText, x, y - 5, COLORS.muted, 9, 700);
    label(ctx, valueText, x + w + 8, y + h - 3, COLORS.text, 10, 760);
  }

  function drawBudget(ctx, result, box) {
    panel(ctx, box, "availability budget", "timeouts trade fast recovery against accidental elections");
    var x = box.x + 118;
    var w = box.w - 176;
    var y = box.y + 68;
    var cleanPct = 100 * result.cleanFormula;
    var retryCap = Math.min(10, result.retryMultiplier);
    var ratioCap = Math.min(20, result.timeoutRatio);

    bar(ctx, x, y, w, 16, cleanPct, 100, result.cleanFormula > 0.75 ? COLORS.first : COLORS.retry, "clean round", fmt(cleanPct, 1) + "%");
    bar(ctx, x, y + 42, w, 16, retryCap, 10, COLORS.retry, "retry multiplier", isFinite(result.retryMultiplier) ? fmt(result.retryMultiplier, 2) + "x" : "inf");
    bar(ctx, x, y + 84, w, 16, ratioCap, 20, result.timeoutRatio >= 10 ? COLORS.first : COLORS.split, "timeout / RPC", fmt(result.timeoutRatio, 1) + "x");
    bar(ctx, x, y + 126, w, 16, result.oneRoundFloor, 650, COLORS.gray, "one-round floor", fmt(result.oneRoundFloor, 0) + "ms");

    var note = result.timeoutRatio >= 10 ? "heartbeat margin is about an order of magnitude" : "heartbeat margin is thin";
    label(ctx, note, box.x + 14, box.y + box.h - 17, result.timeoutRatio >= 10 ? COLORS.first : COLORS.split, 10, 760);
  }

  function draw(result, canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(280, Math.floor(rect.width || canvas.clientWidth || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var narrow = cssWidth < 560;
    var pad = narrow ? 12 : 18;
    var gap = narrow ? 14 : 18;
    var panelH = narrow ? 260 : 248;
    var cssHeight = narrow ? pad * 2 + panelH * 3 + gap * 2 : pad * 2 + panelH * 2 + gap;
    var targetWidth = Math.round(cssWidth * ratio);
    var targetHeight = Math.round(cssHeight * ratio);
    canvas.style.height = cssHeight + "px";
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (narrow) {
      drawTimeline(ctx, result, { x: pad, y: pad, w: cssWidth - 2 * pad, h: panelH });
      drawCurve(ctx, result, { x: pad, y: pad + panelH + gap, w: cssWidth - 2 * pad, h: panelH });
      drawBudget(ctx, result, { x: pad, y: pad + 2 * (panelH + gap), w: cssWidth - 2 * pad, h: panelH });
    } else {
      drawTimeline(ctx, result, { x: pad, y: pad, w: cssWidth - 2 * pad, h: panelH });
      drawCurve(ctx, result, { x: pad, y: pad + panelH + gap, w: (cssWidth - 3 * pad) * 0.55, h: panelH });
      drawBudget(ctx, result, { x: pad + (cssWidth - 3 * pad) * 0.55 + gap, y: pad + panelH + gap, w: cssWidth - (pad + (cssWidth - 3 * pad) * 0.55 + gap) - pad, h: panelH });
    }
  }

  function readParams(lab) {
    function number(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      var value = input ? Number(input.value) : fallback;
      return isFinite(value) ? value : fallback;
    }
    return {
      broadcast: number("broadcast", 15),
      minTimeout: number("minTimeout", 150),
      nodes: number("nodes", 5),
      seed: number("seed", 41),
      spread: number("spread", 150),
      trials: number("trials", 1200)
    };
  }

  function updateOutputs(lab, params) {
    var labels = {
      broadcast: fmt(params.broadcast, 0) + "ms",
      minTimeout: fmt(params.minTimeout, 0) + "ms",
      nodes: String(params.nodes),
      seed: String(params.seed),
      spread: fmt(params.spread, 0) + "ms",
      trials: String(params.trials)
    };
    Object.keys(labels).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(lab) {
    var params = cleanParams(readParams(lab));
    var result = simulate(params);
    var audit = cachedAudit();
    updateOutputs(lab, params);

    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("clean election", fmt(100 * result.cleanRate, 1) + "%"),
        metric("formula", fmt(100 * result.cleanFormula, 1) + "%"),
        metric("median gap", fmt(result.gapP50, 1) + "ms"),
        metric("retry multiplier", isFinite(result.retryMultiplier) ? fmt(result.retryMultiplier, 2) + "x" : "inf"),
        metric("timeout/RPC", fmt(result.timeoutRatio, 1) + "x"),
        metric("audit", audit.ok + "/" + audit.cases)
      ].join("");
    }

    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function init(lab) {
    var frame = null;
    function redrawSoon() {
      if (frame != null) return;
      if (!global.requestAnimationFrame) {
        render(lab);
        return;
      }
      frame = global.requestAnimationFrame(function () {
        frame = null;
        render(lab);
      });
    }

    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () { render(lab); });
      input.addEventListener("change", function () { render(lab); });
    });
    if (global.addEventListener) global.addEventListener("resize", redrawSoon);
    render(lab);
  }

  function initAll() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-raft-election-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    cleanProbability: cleanProbability,
    drawOneRound: drawOneRound,
    runAudit: runAudit,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.RaftElectionLab = api;
})(typeof window !== "undefined" ? window : globalThis);
