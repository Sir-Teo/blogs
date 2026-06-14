(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    groupA: "#2563eb",
    groupB: "#be123c",
    batch: "#d97706",
    running: "#0f766e",
    eval: "#7c3aed",
    warn: "#b45309"
  };

  var DEFAULTS = {
    batchSize: 16,
    gap: 170,
    momentum: 90,
    noise: 70,
    seed: 53,
    sort: 70,
    steps: 120,
    testShare: 75
  };

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
      batchSize: snap(raw.batchSize, DEFAULTS.batchSize, 2, 128, 1),
      gap: snap(raw.gap, DEFAULTS.gap, 40, 260, 5) / 100,
      momentum: snap(raw.momentum, DEFAULTS.momentum, 0, 99, 1) / 100,
      noise: snap(raw.noise, DEFAULTS.noise, 20, 140, 5) / 100,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1),
      sort: snap(raw.sort, DEFAULTS.sort, 0, 100, 1) / 100,
      steps: snap(raw.steps, DEFAULTS.steps, 20, 260, 5),
      testShare: snap(raw.testShare, DEFAULTS.testShare, 0, 100, 1) / 100
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

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="bn-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function groupMean(group, params) {
    return group ? params.gap / 2 : -params.gap / 2;
  }

  function sampleValue(group, params, rand) {
    return groupMean(group, params) + params.noise * normal(rand);
  }

  function trueStats(shareB, params) {
    var meanA = -params.gap / 2;
    var meanB = params.gap / 2;
    var mean = (1 - shareB) * meanA + shareB * meanB;
    var varA = params.noise * params.noise + (meanA - mean) * (meanA - mean);
    var varB = params.noise * params.noise + (meanB - mean) * (meanB - mean);
    return {
      mean: mean,
      sd: Math.sqrt((1 - shareB) * varA + shareB * varB)
    };
  }

  function batchShare(params, rand) {
    var target = rand() < 0.5 ? 0.08 : 0.92;
    var jitter = (rand() - 0.5) * 0.16;
    return clamp((1 - params.sort) * 0.5 + params.sort * (target + jitter), 0.01, 0.99);
  }

  function makeBatch(params, rand, shareB) {
    var rows = [];
    for (var i = 0; i < params.batchSize; i += 1) {
      var group = rand() < shareB ? 1 : 0;
      rows.push({ group: group, x: sampleValue(group, params, rand) });
    }
    return rows;
  }

  function mean(values) {
    if (!values.length) return NaN;
    var total = 0;
    values.forEach(function (value) { total += value; });
    return total / values.length;
  }

  function variance(values, avg) {
    if (!values.length) return NaN;
    var total = 0;
    values.forEach(function (value) {
      var d = value - avg;
      total += d * d;
    });
    return total / values.length;
  }

  function normalizeBatch(batch, eps) {
    var xs = batch.map(function (row) { return row.x; });
    var mu = mean(xs);
    var v = variance(xs, mu);
    var sd = Math.sqrt(v + eps);
    var normalized = batch.map(function (row) {
      return {
        group: row.group,
        x: row.x,
        z: (row.x - mu) / sd
      };
    });
    return { mean: mu, normalized: normalized, sd: sd, variance: v };
  }

  function evaluateAtRunning(rows, runningMean, runningVar, eps) {
    var sd = Math.sqrt(Math.max(0, runningVar) + eps);
    var z = rows.map(function (row) {
      return {
        group: row.group,
        x: row.x,
        z: (row.x - runningMean) / sd
      };
    });
    return z;
  }

  function gateRate(rows) {
    if (!rows.length) return NaN;
    var hits = 0;
    rows.forEach(function (row) { if (row.z > 0) hits += 1; });
    return hits / rows.length;
  }

  function anchorCurve(params, runningMean, runningVar) {
    var eps = 1e-5;
    var anchor = groupMean(0, params);
    var out = [];
    var peerCount = Math.max(1, params.batchSize - 1);
    for (var raw = 0; raw <= 100; raw += 10) {
      var share = raw / 100;
      var bCount = Math.round(peerCount * share);
      var values = [anchor];
      for (var i = 0; i < peerCount; i += 1) {
        values.push(groupMean(i < bCount ? 1 : 0, params));
      }
      var mu = mean(values);
      var sd = Math.sqrt(variance(values, mu) + params.noise * params.noise + eps);
      out.push({
        shareB: share,
        z: (anchor - mu) / sd
      });
    }
    var evalZ = (anchor - runningMean) / Math.sqrt(Math.max(0, runningVar) + eps);
    var valuesOnly = out.map(function (row) { return row.z; });
    return {
      anchor: anchor,
      evalZ: evalZ,
      max: Math.max.apply(null, valuesOnly),
      min: Math.min.apply(null, valuesOnly),
      rows: out,
      spread: Math.max.apply(null, valuesOnly) - Math.min.apply(null, valuesOnly)
    };
  }

  function simulateOnce(params, seedOffset) {
    var rand = makeRng(params.seed * 1009 + params.batchSize * 17 + seedOffset * 7919);
    var eps = 1e-5;
    var runningMean = 0;
    var runningVar = 1;
    var trace = [];
    var lastBatch = null;
    var trainGateWindow = [];
    for (var step = 0; step < params.steps; step += 1) {
      var share = batchShare(params, rand);
      var batch = makeBatch(params, rand, share);
      var bn = normalizeBatch(batch, eps);
      runningMean = params.momentum * runningMean + (1 - params.momentum) * bn.mean;
      runningVar = params.momentum * runningVar + (1 - params.momentum) * bn.variance;
      var gate = gateRate(bn.normalized);
      if (step >= Math.max(0, params.steps - 32)) trainGateWindow.push(gate);
      trace.push({
        batchMean: bn.mean,
        batchSd: bn.sd,
        gate: gate,
        runningMean: runningMean,
        runningSd: Math.sqrt(Math.max(0, runningVar) + eps),
        shareB: share,
        step: step + 1
      });
      lastBatch = {
        batch: batch,
        normalized: bn.normalized,
        stats: bn
      };
    }

    var testRows = [];
    for (var i = 0; i < 3000; i += 1) {
      var group = rand() < params.testShare ? 1 : 0;
      testRows.push({ group: group, x: sampleValue(group, params, rand) });
    }
    var evalRows = evaluateAtRunning(testRows, runningMean, runningVar, eps);
    var evalZ = evalRows.map(function (row) { return row.z; });
    var evalMean = mean(evalZ);
    var evalSd = Math.sqrt(variance(evalZ, evalMean));
    var trainStats = trueStats(0.5, params);
    var testStats = trueStats(params.testShare, params);
    var trainGate = mean(trainGateWindow);
    var evalGate = gateRate(evalRows);
    return {
      anchor: anchorCurve(params, runningMean, runningVar),
      evalRows: evalRows,
      evalStats: {
        gate: evalGate,
        mean: evalMean,
        sd: evalSd
      },
      gateGap: evalGate - trainGate,
      lastBatch: lastBatch,
      params: params,
      running: {
        mean: runningMean,
        sd: Math.sqrt(Math.max(0, runningVar) + eps),
        variance: runningVar
      },
      testStats: testStats,
      trace: trace,
      trainGate: trainGate,
      trainStats: trainStats
    };
  }

  function batchSizeGrid(params) {
    var sizes = [2, 4, 8, 16, 32, 64, 128];
    return sizes.map(function (size, index) {
      var copy = {
        batchSize: size,
        gap: Math.round(params.gap * 100),
        momentum: Math.round(params.momentum * 100),
        noise: Math.round(params.noise * 100),
        seed: params.seed,
        sort: Math.round(params.sort * 100),
        steps: params.steps,
        testShare: Math.round(params.testShare * 100)
      };
      var result = simulateOnce(cleanParams(copy), 13 + index);
      return {
        batchSize: size,
        gateGap: result.gateGap,
        spread: result.anchor.spread
      };
    });
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var result = simulateOnce(params, 0);
    result.grid = batchSizeGrid(params);
    return result;
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || 720));
    var height = Math.max(650, Math.round(rect.height || canvas.clientHeight || 840));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || 500) + " " + (opts.size || 12) + "px " + (opts.family || "system-ui, sans-serif");
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(value, x, y);
  }

  function roundedRect(ctx, x, y, w, h, r) {
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

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 12, box.y + 22, { size: 12, weight: 780 });
    if (subtitle) text(ctx, subtitle, box.x + 12, box.y + 39, { color: COLORS.muted, size: 10 });
  }

  function drawBatch(ctx, box, result) {
    panel(ctx, box, "one training batch", "same rows before and after batch statistics");
    var raw = result.lastBatch.batch;
    var normalized = result.lastBatch.normalized;
    var values = raw.map(function (row) { return row.x; }).concat(normalized.map(function (row) { return row.z; }));
    var min = Math.min.apply(null, values.concat([-2.2]));
    var max = Math.max.apply(null, values.concat([2.2]));
    var pad = Math.max(0.3, (max - min) * 0.12);
    min -= pad;
    max += pad;
    var left = box.x + 42;
    var top = box.y + 54;
    var w = box.w - 62;
    var h = box.h - 82;
    function mapX(v) { return left + (v - min) / (max - min) * w; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var gx = Math.ceil(min); gx <= max; gx += 1) {
      ctx.beginPath();
      ctx.moveTo(mapX(gx), top);
      ctx.lineTo(mapX(gx), top + h);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    var yRaw = top + h * 0.34;
    var yNorm = top + h * 0.72;
    ctx.strokeStyle = COLORS.batch;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(mapX(result.lastBatch.stats.mean), top);
    ctx.lineTo(mapX(result.lastBatch.stats.mean), top + h);
    ctx.stroke();
    ctx.setLineDash([]);
    raw.forEach(function (row, i) {
      var jitter = ((i % 5) - 2) * 2.2;
      ctx.fillStyle = row.group ? COLORS.groupB : COLORS.groupA;
      ctx.beginPath();
      ctx.arc(mapX(row.x), yRaw + jitter, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = normalized[i].group ? COLORS.groupB : COLORS.groupA;
      ctx.beginPath();
      ctx.arc(mapX(normalized[i].z), yNorm + jitter, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    text(ctx, "raw x", left, yRaw - 18, { color: COLORS.muted, size: 10, weight: 700 });
    text(ctx, "train-mode z", left, yNorm - 18, { color: COLORS.muted, size: 10, weight: 700 });
    text(ctx, "batch mean", mapX(result.lastBatch.stats.mean) + 4, top + 13, { color: COLORS.batch, size: 10, weight: 700 });
    text(ctx, "feature value", left + w, top + h + 18, { align: "right", color: COLORS.muted, size: 10 });
  }

  function drawTrace(ctx, box, result) {
    panel(ctx, box, "running statistics", "mini-batch noise is filtered into eval mode");
    var rows = result.trace;
    var left = box.x + 42;
    var top = box.y + 52;
    var w = box.w - 62;
    var h = box.h - 78;
    var vals = rows.map(function (row) { return row.batchMean; }).concat(rows.map(function (row) { return row.runningMean; }), [result.trainStats.mean, result.testStats.mean]);
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    var pad = Math.max(0.25, (max - min) * 0.16);
    min -= pad;
    max += pad;
    function mapX(step) { return left + (step - 1) / Math.max(1, result.params.steps - 1) * w; }
    function mapY(v) { return top + (max - v) / (max - min) * h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var yy = top + i * h / 4;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(left + w, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    ctx.fillStyle = "rgba(217,119,6,0.28)";
    rows.forEach(function (row) {
      ctx.beginPath();
      ctx.arc(mapX(row.step), mapY(row.batchMean), 1.7, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = COLORS.running;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = mapX(row.step);
      var y = mapY(row.runningMean);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.strokeStyle = COLORS.eval;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(left, mapY(result.testStats.mean));
    ctx.lineTo(left + w, mapY(result.testStats.mean));
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "running mean", left + 6, mapY(result.running.mean) - 6, { color: COLORS.running, size: 10, weight: 720 });
    text(ctx, "test population mean", left + 6, mapY(result.testStats.mean) - 6, { color: COLORS.eval, size: 10 });
    text(ctx, "step", left + w, top + h + 17, { align: "right", color: COLORS.muted, size: 10 });
  }

  function drawAnchor(ctx, box, result) {
    panel(ctx, box, "same example, different neighbors", "train-mode output for a fixed group-A activation");
    var rows = result.anchor.rows;
    var values = rows.map(function (row) { return row.z; }).concat([result.anchor.evalZ]);
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = Math.max(0.15, (max - min) * 0.14);
    min -= pad;
    max += pad;
    var left = box.x + 42;
    var top = box.y + 52;
    var w = box.w - 62;
    var h = box.h - 78;
    function mapX(v) { return left + v * w; }
    function mapY(v) { return top + (max - v) / (max - min) * h; }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var yy = top + i * h / 4;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(left + w, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    ctx.strokeStyle = COLORS.eval;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(left, mapY(result.anchor.evalZ));
    ctx.lineTo(left + w, mapY(result.anchor.evalZ));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.groupA;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = mapX(row.shareB);
      var y = mapY(row.z);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    rows.forEach(function (row) {
      ctx.fillStyle = COLORS.groupA;
      ctx.beginPath();
      ctx.arc(mapX(row.shareB), mapY(row.z), 3, 0, Math.PI * 2);
      ctx.fill();
    });
    text(ctx, "eval-mode z", left + 6, mapY(result.anchor.evalZ) - 6, { color: COLORS.eval, size: 10 });
    text(ctx, "peer group-B share", left + w, top + h + 17, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "anchor z", left, top - 7, { color: COLORS.muted, size: 10 });
  }

  function drawGrid(ctx, box, result) {
    panel(ctx, box, "batch-size sensitivity", "context spread and train/eval gate drift");
    var rows = result.grid;
    var left = box.x + 42;
    var top = box.y + 52;
    var w = box.w - 62;
    var h = box.h - 78;
    var values = rows.map(function (row) { return Math.abs(row.gateGap); }).concat(rows.map(function (row) { return row.spread / 3; }), [0.01]);
    var max = Math.max.apply(null, values) * 1.2;
    function mapX(size) {
      return left + (Math.log(size) - Math.log(2)) / (Math.log(128) - Math.log(2)) * w;
    }
    function mapY(v) { return top + (max - v) / max * h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var yy = top + i * h / 4;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(left + w, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);

    function drawLine(field, scale, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach(function (row, index) {
        var x = mapX(row.batchSize);
        var y = mapY(Math.abs(row[field]) / scale);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      rows.forEach(function (row) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(mapX(row.batchSize), mapY(Math.abs(row[field]) / scale), 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    drawLine("gateGap", 1, COLORS.eval);
    drawLine("spread", 3, COLORS.groupA);
    text(ctx, "|gate gap|", left + 8, top + 15, { color: COLORS.eval, size: 10, weight: 720 });
    text(ctx, "anchor spread / 3", left + 8, top + 30, { color: COLORS.groupA, size: 10, weight: 720 });
    text(ctx, "batch size", left + w, top + h + 17, { align: "right", color: COLORS.muted, size: 10 });
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    var pad = width < 650 ? 10 : 14;
    if (width < 650) {
      var panelH = (height - 5 * pad) / 4;
      drawBatch(ctx, { x: pad, y: pad, w: width - 2 * pad, h: panelH }, result);
      drawTrace(ctx, { x: pad, y: 2 * pad + panelH, w: width - 2 * pad, h: panelH }, result);
      drawAnchor(ctx, { x: pad, y: 3 * pad + 2 * panelH, w: width - 2 * pad, h: panelH }, result);
      drawGrid(ctx, { x: pad, y: 4 * pad + 3 * panelH, w: width - 2 * pad, h: panelH }, result);
    } else {
      var colW = (width - 3 * pad) / 2;
      var rowH = (height - 3 * pad) / 2;
      drawBatch(ctx, { x: pad, y: pad, w: colW, h: rowH }, result);
      drawTrace(ctx, { x: 2 * pad + colW, y: pad, w: colW, h: rowH }, result);
      drawAnchor(ctx, { x: pad, y: 2 * pad + rowH, w: colW, h: rowH }, result);
      drawGrid(ctx, { x: 2 * pad + colW, y: 2 * pad + rowH, w: colW, h: rowH }, result);
    }
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (node) {
      raw[node.getAttribute("data-param")] = node.value;
    });
    return raw;
  }

  function syncOutputs(container, params) {
    var labels = {
      batchSize: String(params.batchSize),
      gap: params.gap.toFixed(2),
      momentum: params.momentum.toFixed(2),
      noise: params.noise.toFixed(2),
      seed: String(params.seed),
      sort: formatPercent(params.sort, 0),
      steps: String(params.steps),
      testShare: formatPercent(params.testShare, 0)
    };
    Object.keys(labels).forEach(function (key) {
      var out = container.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(container) {
    var result = evaluate(readParams(container));
    syncOutputs(container, result.params);
    var metrics = container.querySelector("[data-bn-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("running mean", formatNumber(result.running.mean, 2)),
        metric("running sd", formatNumber(result.running.sd, 2)),
        metric("eval z mean", formatNumber(result.evalStats.mean, 2)),
        metric("eval z sd", formatNumber(result.evalStats.sd, 2)),
        metric("gate gap", formatPercent(result.gateGap, 1)),
        metric("anchor spread", formatNumber(result.anchor.spread, 2))
      ].join("");
    }
    var canvas = container.querySelector("canvas");
    if (canvas) draw(result, canvas);
    container.__bnResult = result;
  }

  function init(container) {
    if (!container) return;
    container.querySelectorAll("[data-param]").forEach(function (node) {
      node.addEventListener("input", function () { render(container); });
      node.addEventListener("change", function () { render(container); });
    });
    render(container);
  }

  function initAll() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-batch-norm-context-lab]").forEach(init);
  }

  root.BatchNormContextLab = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    normalizeBatch: normalizeBatch,
    trueStats: trueStats
  };

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
