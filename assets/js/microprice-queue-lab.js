(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    bid: "#2563eb",
    ask: "#be123c",
    micro: "#0f766e",
    weighted: "#7c3aed",
    flow: "#b45309",
    grid: "#edf2f7"
  };

  var DEFAULTS = {
    bid: 30,
    ask: 26,
    pressure: 0,
    trials: 5000,
    seed: 29
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      bid: Math.round(clamp(finite(Number(raw.bid), DEFAULTS.bid), 1, 90)),
      ask: Math.round(clamp(finite(Number(raw.ask), DEFAULTS.ask), 1, 90)),
      pressure: Math.round(clamp(finite(Number(raw.pressure), DEFAULTS.pressure), -80, 80)),
      trials: Math.round(clamp(finite(Number(raw.trials), DEFAULTS.trials), 500, 12000)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 9999))
    };
  }

  function lcg(seed) {
    var state = seed >>> 0;
    return function () {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function sideProbability(params) {
    var skew = params.pressure / 100;
    var askRate = Math.exp(skew);
    var bidRate = Math.exp(-skew);
    return askRate / (askRate + bidRate);
  }

  function upProbabilityExact(bid, ask, pAskEvent) {
    var dp = [];
    for (var a = 0; a <= ask; a += 1) {
      dp[a] = [];
      for (var b = 0; b <= bid; b += 1) dp[a][b] = 0;
    }
    for (var b0 = 0; b0 <= bid; b0 += 1) dp[0][b0] = 1;
    for (var a0 = 1; a0 <= ask; a0 += 1) dp[a0][0] = 0;
    for (var a1 = 1; a1 <= ask; a1 += 1) {
      for (var b1 = 1; b1 <= bid; b1 += 1) {
        dp[a1][b1] = pAskEvent * dp[a1 - 1][b1] + (1 - pAskEvent) * dp[a1][b1 - 1];
      }
    }
    return dp[ask][bid];
  }

  function weightedMidTicks(bid, ask) {
    return 0.5 * (bid - ask) / Math.max(1, bid + ask);
  }

  function runRace(params, rand, keepPath) {
    var bid = params.bid;
    var ask = params.ask;
    var pAsk = sideProbability(params);
    var events = 0;
    var path = [{ event: 0, bid: bid, ask: ask }];
    while (bid > 0 && ask > 0) {
      events += 1;
      if (rand() < pAsk) ask -= 1;
      else bid -= 1;
      if (keepPath) path.push({ event: events, bid: bid, ask: ask });
    }
    return {
      up: ask === 0,
      events: events,
      path: path
    };
  }

  function simulate(params) {
    var rand = lcg(0x9E3779B9 ^ Math.imul(params.seed, 1009) ^ Math.imul(params.bid, 17) ^ Math.imul(params.ask, 31) ^ Math.imul(params.pressure + 100, 43));
    var up = 0;
    var totalEvents = 0;
    var maxEvents = params.bid + params.ask - 1;
    var bins = [];
    var binCount = 12;
    for (var i = 0; i < binCount; i += 1) bins[i] = { start: i / binCount * maxEvents, end: (i + 1) / binCount * maxEvents, count: 0 };
    var sample = runRace(params, rand, true);
    for (var t = 0; t < params.trials; t += 1) {
      var race = runRace(params, rand, false);
      if (race.up) up += 1;
      totalEvents += race.events;
      var idx = Math.min(binCount - 1, Math.floor(race.events / Math.max(1, maxEvents + 1) * binCount));
      bins[idx].count += 1;
    }
    return {
      upRate: up / params.trials,
      meanEvents: totalEvents / params.trials,
      sample: sample,
      bins: bins
    };
  }

  function curve(params) {
    var total = params.bid + params.ask;
    var pAsk = sideProbability(params);
    var rows = [];
    for (var bid = 1; bid < total; bid += 1) {
      var ask = total - bid;
      var p = upProbabilityExact(bid, ask, pAsk);
      rows.push({
        bid: bid,
        ask: ask,
        imbalance: (bid - ask) / total,
        exactTicks: p - 0.5,
        weightedTicks: weightedMidTicks(bid, ask)
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var pAsk = sideProbability(params);
    var exactUp = upProbabilityExact(params.bid, params.ask, pAsk);
    var sim = simulate(params);
    var weighted = weightedMidTicks(params.bid, params.ask);
    var raceMicro = exactUp - 0.5;
    var result = {
      params: params,
      sideProbability: pAsk,
      exactUp: exactUp,
      simulation: sim,
      weightedTicks: weighted,
      raceMicroTicks: raceMicro,
      curve: curve(params)
    };
    result.audit = audit(result);
    return result;
  }

  function audit(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var params = result.params;
    var balanced = evaluateCore({ bid: 30, ask: 30, pressure: 0, trials: 1000, seed: 1 });
    var bidHeavy = evaluateCore({ bid: 45, ask: 15, pressure: 0, trials: 1000, seed: 2 });
    var askHeavy = evaluateCore({ bid: 15, ask: 45, pressure: 0, trials: 1000, seed: 3 });
    var buyPressure = evaluateCore({ bid: 30, ask: 30, pressure: 60, trials: 1000, seed: 4 });
    check("exact probability is bounded", result.exactUp >= 0 && result.exactUp <= 1);
    check("microprice lies inside spread", result.raceMicroTicks >= -0.5 && result.raceMicroTicks <= 0.5);
    check("weighted mid lies inside spread", result.weightedTicks >= -0.5 && result.weightedTicks <= 0.5);
    check("monte carlo close to exact", Math.abs(result.simulation.upRate - result.exactUp) < Math.max(0.035, 4 / Math.sqrt(params.trials)));
    check("sample path terminates at a quote depletion", result.simulation.sample.path[result.simulation.sample.path.length - 1].bid === 0 || result.simulation.sample.path[result.simulation.sample.path.length - 1].ask === 0);
    check("balanced book has fair race", Math.abs(balanced.exactUp - 0.5) < 1e-12);
    check("more bid depth tilts up under symmetric flow", bidHeavy.exactUp > 0.98 && askHeavy.exactUp < 0.02);
    check("buy pressure tilts up", buyPressure.exactUp > balanced.exactUp);
    check("curve has one row per alternate split", result.curve.length === params.bid + params.ask - 1);
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function evaluateCore(raw) {
    var params = normalize(raw);
    var pAsk = sideProbability(params);
    return {
      params: params,
      exactUp: upProbabilityExact(params.bid, params.ask, pAsk),
      weightedTicks: weightedMidTicks(params.bid, params.ask)
    };
  }

  function auditGrid() {
    var cases = [
      { bid: 30, ask: 26, pressure: 0, trials: 5000, seed: 29 },
      { bid: 20, ask: 20, pressure: 0, trials: 5000, seed: 11 },
      { bid: 15, ask: 55, pressure: 35, trials: 6000, seed: 71 },
      { bid: 70, ask: 12, pressure: -40, trials: 6000, seed: 9 },
      { bid: 35, ask: 35, pressure: -65, trials: 7000, seed: 43 }
    ].map(function (raw, index) {
      var result = evaluate(raw);
      var failedChecks = result.audit.checks.filter(function (row) {
        return !row.ok;
      }).map(function (row) {
        return row.name;
      });
      return {
        caseId: index + 1,
        bid: result.params.bid,
        ask: result.params.ask,
        pressure: result.params.pressure,
        trials: result.params.trials,
        seed: result.params.seed,
        askEventProbability: result.sideProbability,
        exactUp: result.exactUp,
        simulatedUp: result.simulation.upRate,
        monteCarloError: Math.abs(result.simulation.upRate - result.exactUp),
        raceMicroTicks: result.raceMicroTicks,
        weightedTicks: result.weightedTicks,
        meanEvents: result.simulation.meanEvents,
        checks: result.audit.checks,
        passedChecks: result.audit.checks.length - failedChecks.length,
        passed: result.audit.passed,
        failedChecks: failedChecks,
        totalChecks: result.audit.checks.length
      };
    });
    var passedChecks = cases.reduce(function (sum, row) {
      return sum + row.passedChecks;
    }, 0);
    var totalChecks = cases.reduce(function (sum, row) {
      return sum + row.totalChecks;
    }, 0);
    var byCase = cases.map(function (row) {
      return {
        caseId: row.caseId,
        bid: row.bid,
        ask: row.ask,
        pressure: row.pressure,
        passed: row.passed ? 1 : 0,
        total: 1,
        passedChecks: row.passedChecks,
        totalChecks: row.totalChecks
      };
    });
    return {
      byCase: byCase,
      cases: cases,
      ok: cases.every(function (row) { return row.passed; }) && passedChecks === totalChecks,
      passed: cases.filter(function (row) { return row.passed; }).length,
      passedChecks: passedChecks,
      totalChecks: totalChecks,
      total: cases.length
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function pct(value, digits) {
    return fmt(100 * value, digits == null ? 1 : digits) + "%";
  }

  function signedTicks(value) {
    return (value >= 0 ? "+" : "") + fmt(value, 3) + " ticks";
  }

  function intFmt(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function metric(label, value, className) {
    return '<div class="micro-lab__metric ' + (className || "") + '"><span>' +
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
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, { size: 10, weight: 600, color: COLORS.muted });
  }

  function drawBook(ctx, result, box) {
    panel(ctx, box, "one-spread book", "mid, weighted mid, and race-implied microprice");
    var plot = { x: box.x + 28, y: box.y + 68, w: box.w - 56, h: 112 };
    var maxDepth = Math.max(result.params.bid, result.params.ask, 1);
    var midX = plot.x + plot.w / 2;
    var bidW = plot.w * 0.42 * result.params.bid / maxDepth;
    var askW = plot.w * 0.42 * result.params.ask / maxDepth;
    ctx.fillStyle = "#e8f0ff";
    ctx.fillRect(midX - bidW, plot.y + 10, bidW, 32);
    ctx.fillStyle = "#fee2e2";
    ctx.fillRect(midX, plot.y + 58, askW, 32);
    text(ctx, "bid queue " + result.params.bid, midX - bidW + 6, plot.y + 26, { color: COLORS.bid, weight: 800 });
    text(ctx, "ask queue " + result.params.ask, midX + askW - 6, plot.y + 74, { color: COLORS.ask, weight: 800, align: "right" });
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(midX, plot.y);
    ctx.lineTo(midX, plot.y + plot.h);
    ctx.stroke();
    text(ctx, "mid", midX, plot.y + plot.h + 16, { color: COLORS.muted, align: "center", size: 10 });

    var axis = { x: plot.x, y: box.y + box.h - 48, w: plot.w };
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(axis.x, axis.y);
    ctx.lineTo(axis.x + axis.w, axis.y);
    ctx.stroke();
    [-0.5, 0, 0.5].forEach(function (tick) {
      var x = axis.x + (tick + 0.5) * axis.w;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(x, axis.y - 5);
      ctx.lineTo(x, axis.y + 5);
      ctx.stroke();
      text(ctx, tick === 0 ? "mid" : (tick > 0 ? "ask" : "bid"), x, axis.y + 18, { align: "center", color: COLORS.muted, size: 10 });
    });
    [
      { label: "weighted", value: result.weightedTicks, color: COLORS.weighted, y: axis.y - 24 },
      { label: "race", value: result.raceMicroTicks, color: COLORS.micro, y: axis.y - 9 }
    ].forEach(function (marker) {
      var x = axis.x + (marker.value + 0.5) * axis.w;
      ctx.fillStyle = marker.color;
      ctx.beginPath();
      ctx.arc(x, marker.y, 4, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, marker.label, x + 7, marker.y, { color: marker.color, size: 10, weight: 800 });
    });
  }

  function drawRace(ctx, result, box) {
    panel(ctx, box, "sample depletion race", "one deterministic path from the seeded simulator");
    var path = result.simulation.sample.path;
    var plot = { x: box.x + 42, y: box.y + 62, w: box.w - 68, h: box.h - 94 };
    var maxQ = Math.max(result.params.bid, result.params.ask, 1);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    function point(row, key) {
      return {
        x: plot.x + row.event / Math.max(1, path[path.length - 1].event) * plot.w,
        y: plot.y + plot.h - row[key] / maxQ * plot.h
      };
    }
    [
      { key: "bid", color: COLORS.bid },
      { key: "ask", color: COLORS.ask }
    ].forEach(function (series) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      path.forEach(function (row, i) {
        var p = point(row, series.key);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    });
    var up = result.simulation.sample.up;
    text(ctx, up ? "ask depleted first: uptick" : "bid depleted first: downtick", plot.x + 8, plot.y + 16, { color: up ? COLORS.micro : COLORS.ask, weight: 850 });
    text(ctx, "events until move: " + path[path.length - 1].event, plot.x + 8, plot.y + 36, { color: COLORS.muted, size: 10 });
  }

  function drawCurve(ctx, result, box) {
    panel(ctx, box, "same total depth, different split", "exact race microprice versus weighted-mid shortcut");
    var plot = { x: box.x + 46, y: box.y + 64, w: box.w - 74, h: box.h - 98 };
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    for (var g = -0.5; g <= 0.5001; g += 0.25) {
      var y = plot.y + plot.h - (g + 0.5) * plot.h;
      ctx.strokeStyle = g === 0 ? "#cbd5e1" : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    function drawLine(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      result.curve.forEach(function (row, i) {
        var x = plot.x + (row.imbalance + 1) / 2 * plot.w;
        var y = plot.y + plot.h - (row[key] + 0.5) * plot.h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    drawLine("weightedTicks", COLORS.weighted);
    drawLine("exactTicks", COLORS.micro);
    var currentImb = (result.params.bid - result.params.ask) / (result.params.bid + result.params.ask);
    var cx = plot.x + (currentImb + 1) / 2 * plot.w;
    ctx.strokeStyle = COLORS.flow;
    ctx.beginPath();
    ctx.moveTo(cx, plot.y);
    ctx.lineTo(cx, plot.y + plot.h);
    ctx.stroke();
    text(ctx, "imbalance", plot.x + plot.w, box.y + box.h - 18, { color: COLORS.muted, size: 10, align: "right" });
    text(ctx, "race", plot.x + 10, plot.y + 16, { color: COLORS.micro, weight: 850 });
    text(ctx, "weighted", plot.x + 58, plot.y + 16, { color: COLORS.weighted, weight: 850 });
  }

  function drawHistogram(ctx, result, box) {
    panel(ctx, box, "Monte Carlo audit", "seeded races against the exact first-depletion probability");
    var plot = { x: box.x + 34, y: box.y + 64, w: box.w - 68, h: box.h - 118 };
    var max = Math.max.apply(null, result.simulation.bins.map(function (bin) { return bin.count; }).concat([1]));
    result.simulation.bins.forEach(function (bin, i) {
      var w = plot.w / result.simulation.bins.length - 2;
      var h = plot.h * bin.count / max;
      var x = plot.x + i * plot.w / result.simulation.bins.length;
      var y = plot.y + plot.h - h;
      ctx.fillStyle = COLORS.flow;
      ctx.fillRect(x, y, w, h);
    });
    text(ctx, "exact uptick probability", plot.x, box.y + box.h - 42, { color: COLORS.muted, size: 10, weight: 700 });
    text(ctx, pct(result.exactUp, 1), plot.x + 142, box.y + box.h - 42, { color: COLORS.micro, size: 15, weight: 850 });
    text(ctx, "simulated", plot.x, box.y + box.h - 20, { color: COLORS.muted, size: 10, weight: 700 });
    text(ctx, pct(result.simulation.upRate, 1), plot.x + 70, box.y + box.h - 20, { color: COLORS.flow, size: 13, weight: 850 });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    var gap = 14;
    var leftW = Math.floor(w * 0.48);
    drawBook(ctx, result, { x: gap, y: gap, w: leftW - gap, h: 330 });
    drawHistogram(ctx, result, { x: gap, y: 358, w: leftW - gap, h: h - 372 });
    drawRace(ctx, result, { x: leftW + gap, y: gap, w: w - leftW - 2 * gap, h: 330 });
    drawCurve(ctx, result, { x: leftW + gap, y: 358, w: w - leftW - 2 * gap, h: h - 372 });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setOutputs(root, result) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "pressure") output.textContent = (result.params.pressure >= 0 ? "+" : "") + result.params.pressure + "%";
      else if (key === "trials") output.textContent = intFmt(result.params.trials);
      else output.textContent = result.params[key];
    });
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("uptick probability", pct(result.exactUp, 1), "micro-lab__metric--good"),
        metric("race microprice", signedTicks(result.raceMicroTicks), "micro-lab__metric--good"),
        metric("weighted mid", signedTicks(result.weightedTicks)),
        metric("simulation", pct(result.simulation.upRate, 1)),
        metric("mean events", fmt(result.simulation.meanEvents, 1)),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "micro-lab__metric--good" : "micro-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "Bid depth " + result.params.bid + ", ask depth " + result.params.ask +
        ", flow skew " + (result.params.pressure >= 0 ? "+" : "") + result.params.pressure +
        "%. Exact race microprice is " + signedTicks(result.raceMicroTicks) +
        "; weighted-mid shortcut is " + signedTicks(result.weightedTicks) + ".";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__micropriceQueueResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__micropriceQueueReady) return;
    root.__micropriceQueueReady = true;
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
        Array.prototype.slice.call(global.document.querySelectorAll("[data-microprice-queue-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-microprice-queue-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    normalize: normalize,
    upProbabilityExact: upProbabilityExact,
    weightedMidTicks: weightedMidTicks,
    runRace: runRace
  };

  global.MicropriceQueueLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
