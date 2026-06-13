(function (global) {
  "use strict";

  var COLORS = {
    correct: "#0f766e",
    error: "#be123c",
    timeout: "#64748b",
    boundary: "#172026",
    start: "#d97706",
    reward: "#2563eb",
    best: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    band: "#dbeafe"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="ddm-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32(index + 1, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2, seed));
    var u2 = uniform(index * 2 + 1, seed);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var position = (sorted.length - 1) * q;
    var lower = Math.floor(position);
    var upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function cleanParams(params) {
    return {
      boundary: clamp(params.boundary, 0.35, 2.6),
      drift: clamp(params.drift, 0.02, 1.8),
      errorCost: clamp(params.errorCost, 0, 3.5),
      nondecision: clamp(params.nondecision, 120, 800),
      noise: clamp(params.noise, 0.2, 2.4),
      startBias: clamp(params.startBias, -80, 80),
      trials: clamp(Math.round(params.trials), 80, 1200)
    };
  }

  function runTrial(params, trialIndex, keepPath) {
    var dt = 0.01;
    var maxTime = 4.2;
    var maxSteps = Math.round(maxTime / dt);
    var seed = 0x20260613 ^ Math.imul(trialIndex + 1, 0x9e3779b1);
    var boundary = params.boundary;
    var start = boundary * params.startBias / 100;
    var x = start;
    var path = keepPath ? [{ t: 0, x: x }] : null;
    var decision = x >= 0 ? 1 : -1;
    var hit = false;
    var step;

    for (step = 1; step <= maxSteps; step += 1) {
      x += params.drift * dt + params.noise * Math.sqrt(dt) * normal(step + 997, seed);
      if (keepPath && (step % 2 === 0 || x >= boundary || x <= -boundary)) {
        path.push({ t: step * dt, x: x });
      }
      if (x >= boundary || x <= -boundary) {
        hit = true;
        decision = x >= boundary ? 1 : -1;
        break;
      }
    }

    if (!hit) decision = x >= 0 ? 1 : -1;
    var decisionTime = Math.min(step * dt, maxTime);
    var rt = decisionTime + params.nondecision / 1000;
    var correct = decision === 1;
    return {
      correct: correct,
      decision: decision,
      decisionTime: decisionTime,
      end: x,
      path: path,
      rt: rt,
      timeout: !hit,
      trial: trialIndex
    };
  }

  function summarizeRows(rows, params) {
    var correctRows = rows.filter(function (row) { return row.correct && !row.timeout; });
    var errorRows = rows.filter(function (row) { return !row.correct && !row.timeout; });
    var timeoutRows = rows.filter(function (row) { return row.timeout; });
    var correctCount = rows.filter(function (row) { return row.correct; }).length;
    var errorCount = rows.length - correctCount;
    var sortedRt = rows.map(function (row) { return row.rt; }).sort(function (a, b) { return a - b; });
    var totalSeconds = rows.reduce(function (sum, row) { return sum + row.rt + 0.25; }, 0);
    var reward = (correctCount - params.errorCost * errorCount) / Math.max(1e-12, totalSeconds);
    return {
      accuracy: correctCount / rows.length,
      correctCount: correctCount,
      correctRt: mean(correctRows.map(function (row) { return row.rt; })),
      errorCount: errorCount,
      errorRt: mean(errorRows.map(function (row) { return row.rt; })),
      meanRt: mean(rows.map(function (row) { return row.rt; })),
      p10Rt: quantile(sortedRt, 0.1),
      p50Rt: quantile(sortedRt, 0.5),
      p90Rt: quantile(sortedRt, 0.9),
      rewardRate: reward,
      timeoutCount: timeoutRows.length,
      timeoutRate: timeoutRows.length / rows.length
    };
  }

  function simulateWithBoundary(params, boundary, seedShift, keepPaths) {
    var local = {
      boundary: boundary,
      drift: params.drift,
      errorCost: params.errorCost,
      nondecision: params.nondecision,
      noise: params.noise,
      startBias: params.startBias,
      trials: params.trials
    };
    var rows = [];
    var pathLimit = keepPaths ? Math.min(28, local.trials) : 0;
    for (var i = 0; i < local.trials; i += 1) {
      rows.push(runTrial(local, i + seedShift, i < pathLimit));
    }
    return {
      params: local,
      paths: rows.slice(0, pathLimit),
      rows: rows,
      summary: summarizeRows(rows, local)
    };
  }

  function sweepBoundaries(params) {
    var values = [];
    var sweepTrials = Math.min(360, params.trials);
    var base = {
      boundary: params.boundary,
      drift: params.drift,
      errorCost: params.errorCost,
      nondecision: params.nondecision,
      noise: params.noise,
      startBias: params.startBias,
      trials: sweepTrials
    };
    for (var i = 0; i <= 16; i += 1) {
      var boundary = 0.45 + i * (2.35 - 0.45) / 16;
      var result = simulateWithBoundary(base, boundary, 20000 + i * 911, false);
      values.push({
        accuracy: result.summary.accuracy,
        boundary: boundary,
        meanRt: result.summary.meanRt,
        rewardRate: result.summary.rewardRate
      });
    }
    values.sort(function (a, b) { return a.boundary - b.boundary; });
    return values;
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var main = simulateWithBoundary(clean, clean.boundary, 0, true);
    var sweep = sweepBoundaries(clean);
    var best = sweep.reduce(function (winner, row) {
      if (!winner || row.rewardRate > winner.rewardRate) return row;
      return winner;
    }, null);
    main.sweep = sweep;
    main.best = best;
    return main;
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
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

  function drawLine(ctx, points, xScale, yScale, color, width, alpha) {
    if (!points.length) return;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1.6;
    ctx.beginPath();
    points.forEach(function (point, i) {
      var x = xScale(point.t);
      var y = yScale(point.x);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawPathsPanel(ctx, result, box) {
    panelTitle(ctx, box, "Evidence paths", "each trajectory stops when it hits a boundary");
    var params = result.params;
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var maxTime = Math.max.apply(null, result.rows.map(function (row) { return row.decisionTime; }).concat([1.2]));
    maxTime = Math.min(4.2, Math.max(1.1, maxTime));
    function xScale(t) { return plot.x + clamp(t / maxTime, 0, 1) * plot.w; }
    function yScale(x) {
      var lo = -params.boundary * 1.12;
      var hi = params.boundary * 1.12;
      return plot.y + plot.h - (clamp(x, lo, hi) - lo) / (hi - lo) * plot.h;
    }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.boundary;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([5, 5]);
    [params.boundary, -params.boundary].forEach(function (boundary) {
      ctx.beginPath();
      ctx.moveTo(plot.x, yScale(boundary));
      ctx.lineTo(plot.x + plot.w, yScale(boundary));
      ctx.stroke();
    });
    ctx.strokeStyle = COLORS.start;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(params.boundary * params.startBias / 100));
    ctx.lineTo(plot.x + plot.w, yScale(params.boundary * params.startBias / 100));
    ctx.stroke();
    ctx.setLineDash([]);

    result.paths.forEach(function (row) {
      var color = row.timeout ? COLORS.timeout : (row.correct ? COLORS.correct : COLORS.error);
      drawLine(ctx, row.path, xScale, yScale, color, row.correct ? 1.45 : 1.7, row.timeout ? 0.45 : 0.62);
      var last = row.path[row.path.length - 1];
      ctx.fillStyle = color;
      ctx.globalAlpha = row.timeout ? 0.45 : 0.85;
      ctx.beginPath();
      ctx.arc(xScale(row.decisionTime), yScale(last.x), 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("+a", plot.x - 7, yScale(params.boundary) + 4);
    ctx.fillText("-a", plot.x - 7, yScale(-params.boundary) + 4);
    ctx.textAlign = "center";
    [0, Math.round(maxTime * 10) / 20, Math.round(maxTime * 10) / 10].forEach(function (tick) {
      ctx.fillText(formatNumber(tick) + "s", xScale(tick), plot.y + plot.h + 14);
    });
    ctx.textAlign = "left";
  }

  function drawHistogramPanel(ctx, result, box) {
    panelTitle(ctx, box, "Reaction-time density", "choices and latencies are fit together");
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var maxRt = Math.max.apply(null, result.rows.map(function (row) { return row.rt; }).concat([1]));
    var bins = 24;
    function histogram(predicate) {
      var counts = new Array(bins).fill(0);
      result.rows.forEach(function (row) {
        if (!predicate(row)) return;
        var index = Math.floor(row.rt / maxRt * bins);
        counts[clamp(index, 0, bins - 1)] += 1;
      });
      return counts;
    }
    var correct = histogram(function (row) { return row.correct && !row.timeout; });
    var error = histogram(function (row) { return !row.correct && !row.timeout; });
    var timeout = histogram(function (row) { return row.timeout; });
    var maxCount = Math.max.apply(null, correct.concat(error).concat(timeout).concat([1]));
    function xBin(i) { return plot.x + i / bins * plot.w; }
    function yScale(count) { return plot.y + plot.h - count / maxCount * plot.h; }
    drawAxis(ctx, plot);
    [
      { counts: correct, color: COLORS.correct, offset: 0 },
      { counts: error, color: COLORS.error, offset: 0.34 },
      { counts: timeout, color: COLORS.timeout, offset: 0.68 }
    ].forEach(function (series) {
      ctx.fillStyle = series.color;
      ctx.globalAlpha = series.color === COLORS.timeout ? 0.48 : 0.64;
      series.counts.forEach(function (count, i) {
        var binW = plot.w / bins;
        var x = xBin(i) + series.offset * binW / 3;
        var y = yScale(count);
        ctx.fillRect(x, y, Math.max(1, binW / 3), plot.y + plot.h - y);
      });
      ctx.globalAlpha = 1;
    });
    ctx.strokeStyle = COLORS.start;
    ctx.setLineDash([5, 5]);
    var ndX = plot.x + (result.params.nondecision / 1000) / maxRt * plot.w;
    ctx.beginPath();
    ctx.moveTo(ndX, plot.y);
    ctx.lineTo(ndX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    [0, maxRt / 2, maxRt].forEach(function (tick) {
      ctx.fillText(formatNumber(tick) + "s", plot.x + tick / maxRt * plot.w, plot.y + plot.h + 14);
    });
    ctx.textAlign = "left";
  }

  function drawSweepPanel(ctx, result, box) {
    panelTitle(ctx, box, "Boundary sweep", "caution can help accuracy while hurting reward rate");
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var sweep = result.sweep;
    var rewardMin = Math.min.apply(null, sweep.map(function (row) { return row.rewardRate; }));
    var rewardMax = Math.max.apply(null, sweep.map(function (row) { return row.rewardRate; }));
    var rewardPad = Math.max(0.05, (rewardMax - rewardMin) * 0.14);
    rewardMin -= rewardPad;
    rewardMax += rewardPad;
    function xScale(boundary) { return plot.x + (boundary - 0.45) / (2.35 - 0.45) * plot.w; }
    function yReward(value) { return plot.y + plot.h - (value - rewardMin) / (rewardMax - rewardMin) * plot.h; }
    function yAccuracy(value) { return plot.y + plot.h - clamp(value, 0, 1) * plot.h; }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.correct;
    ctx.lineWidth = 2;
    ctx.beginPath();
    sweep.forEach(function (row, i) {
      var x = xScale(row.boundary);
      var y = yAccuracy(row.accuracy);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.strokeStyle = COLORS.reward;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    sweep.forEach(function (row, i) {
      var x = xScale(row.boundary);
      var y = yReward(row.rewardRate);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    sweep.forEach(function (row) {
      var isCurrent = Math.abs(row.boundary - result.params.boundary) < 0.065;
      var isBest = result.best && row.boundary === result.best.boundary;
      ctx.fillStyle = isBest ? COLORS.best : (isCurrent ? COLORS.start : COLORS.reward);
      ctx.beginPath();
      ctx.arc(xScale(row.boundary), yReward(row.rewardRate), isBest || isCurrent ? 4.5 : 2.8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("best a " + formatNumber(result.best.boundary), plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("blue: reward/sec, green: accuracy", plot.x, plot.y + 38);
    ctx.textAlign = "center";
    [0.45, result.params.boundary, 2.35].forEach(function (tick) {
      ctx.fillText(formatNumber(tick), xScale(tick), plot.y + plot.h + 14);
    });
    ctx.textAlign = "right";
    ctx.fillText("100%", plot.x - 6, yAccuracy(1) + 4);
    ctx.fillText("0", plot.x - 6, yAccuracy(0) + 4);
    ctx.textAlign = "left";
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Decision ledger", "the model turns psychology into an accounting problem");
    var plot = { x: box.x, y: box.y + 50, w: box.w, h: box.h - 62 };
    var summary = result.summary;
    var rows = [
      { label: "correct choices", value: summary.correctCount, scale: result.rows.length, color: COLORS.correct, text: formatPercent(summary.accuracy * 100) },
      { label: "errors", value: summary.errorCount, scale: result.rows.length, color: COLORS.error, text: formatPercent((1 - summary.accuracy) * 100) },
      { label: "timeouts", value: summary.timeoutCount, scale: result.rows.length, color: COLORS.timeout, text: formatPercent(summary.timeoutRate * 100) },
      { label: "reward / sec", value: summary.rewardRate - Math.min(0, summary.rewardRate), scale: Math.max(0.05, Math.abs(summary.rewardRate), Math.abs(result.best.rewardRate)), color: COLORS.reward, text: formatNumber(summary.rewardRate) }
    ];
    var rowGap = Math.min(38, Math.max(25, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      var barW = Math.max(1, (plot.w - 176) * clamp(row.value / Math.max(1e-12, row.scale), 0, 1));
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 116, y, plot.w - 166, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 116, y, barW, 18);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.label, plot.x, y + 13);
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(row.text, plot.x + plot.w, y + 13);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 970 : 700;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    var margin = compact ? 24 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawPathsPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 286 });
      drawHistogramPanel(ctx, result, { x: margin, y: 342, w: panelW, h: 206 });
      drawSweepPanel(ctx, result, { x: margin, y: 576, w: panelW, h: 206 });
      drawLedgerPanel(ctx, result, { x: margin, y: 810, w: panelW, h: 136 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawPathsPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 320 });
      drawHistogramPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 320 });
      drawSweepPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 244 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 244 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var values = {
      boundary: formatNumber(result.params.boundary),
      drift: formatNumber(result.params.drift),
      errorCost: formatNumber(result.params.errorCost),
      nondecision: Math.round(result.params.nondecision) + " ms",
      noise: formatNumber(result.params.noise),
      startBias: formatPercent(result.params.startBias),
      trials: Math.round(result.params.trials).toLocaleString()
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Accuracy", formatPercent(result.summary.accuracy * 100)),
        metric("Mean RT", Math.round(result.summary.meanRt * 1000) + " ms"),
        metric("Median RT", Math.round(result.summary.p50Rt * 1000) + " ms"),
        metric("Error RT", result.summary.errorCount ? Math.round(result.summary.errorRt * 1000) + " ms" : "n/a"),
        metric("Reward / sec", formatNumber(result.summary.rewardRate)),
        metric("Best boundary", formatNumber(result.best.boundary))
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-ddm-lab]")).forEach(init);
  }

  var api = {
    runTrial: runTrial,
    simulate: simulate,
    sweepBoundaries: sweepBoundaries
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.DDMLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
