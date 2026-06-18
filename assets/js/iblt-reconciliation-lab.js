(function (global) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    a: "#2563eb",
    b: "#be123c",
    common: "#64748b",
    iblt: "#0f766e",
    pure: "#16a34a",
    stuck: "#b45309",
    bad: "#dc2626",
    softGreen: "#ecfdf5",
    softRed: "#fff1f2"
  };

  var DEFAULTS = {
    common: 2500,
    difference: 84,
    factor: 2.2,
    hashes: 3,
    scenario: "balanced",
    seed: 29
  };

  var SCENARIOS = {
    balanced: "balanced edits",
    alice: "Alice has more",
    bob: "Bob has more",
    split: "partition burst"
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function intParam(value, fallback, min, max) {
    return Math.round(clamp(number(value, fallback), min, max));
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      common: intParam(raw.common, DEFAULTS.common, 100, 8000),
      difference: intParam(raw.difference, DEFAULTS.difference, 6, 360),
      factor: Math.round(clamp(number(raw.factor, DEFAULTS.factor), 1.05, 2.8) * 20) / 20,
      hashes: intParam(raw.hashes, DEFAULTS.hashes, 3, 6),
      scenario: SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario,
      seed: intParam(raw.seed, DEFAULTS.seed, 1, 9999)
    };
  }

  function mix32(x) {
    x = (x >>> 0) + 0x9e3779b9;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function keyFor(index, salt, seed) {
    var x = mix32((Math.imul(index + 1, 0x9e3779b1) ^ salt ^ Math.imul(seed, 0x85ebca6b)) >>> 0);
    return x === 0 ? 1 : x;
  }

  function makeKeys(count, salt, seed, used) {
    var out = [];
    var i = 0;
    while (out.length < count) {
      var key = keyFor(i, salt, seed);
      if (!used[key]) {
        used[key] = true;
        out.push(key);
      }
      i += 1;
    }
    return out;
  }

  function sorted(values) {
    return values.slice().sort(function (a, b) { return a - b; });
  }

  function sameArray(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function splitDifference(params) {
    var d = params.difference;
    if (params.scenario === "alice") return { aOnly: Math.max(1, Math.round(d * 0.78)), bOnly: d - Math.max(1, Math.round(d * 0.78)) };
    if (params.scenario === "bob") return { aOnly: Math.max(1, Math.round(d * 0.22)), bOnly: d - Math.max(1, Math.round(d * 0.22)) };
    if (params.scenario === "split") return { aOnly: Math.ceil(d / 2), bOnly: Math.floor(d / 2) };
    return { aOnly: Math.ceil(d / 2), bOnly: Math.floor(d / 2) };
  }

  function generateSets(params) {
    var used = {};
    var split = splitDifference(params);
    var common = makeKeys(params.common, 0x11111111, params.seed, used);
    var aOnly = makeKeys(split.aOnly, params.scenario === "split" ? 0x22220000 : 0x22222222, params.seed + 17, used);
    var bOnly = makeKeys(split.bOnly, params.scenario === "split" ? 0x2222ffff : 0x33333333, params.seed + 31, used);
    return {
      a: common.concat(aOnly),
      aOnly: sorted(aOnly),
      b: common.concat(bOnly),
      bOnly: sorted(bOnly),
      common: common
    };
  }

  function checksum(key) {
    return mix32((key ^ 0xa5a5a5a5) >>> 0);
  }

  function distinctIndices(key, hashes, cells, seed) {
    var out = [];
    var seen = {};
    for (var i = 0; i < hashes; i += 1) {
      var start = Math.floor(i * cells / hashes);
      var end = Math.floor((i + 1) * cells / hashes);
      var width = Math.max(1, end - start);
      var idx = start + (mix32((key ^ seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0) % width);
      if (!seen[idx]) {
        seen[idx] = true;
        out.push(idx);
      }
    }
    idx = mix32((key ^ seed ^ 0x7f4a7c15) >>> 0) % cells;
    while (out.length < hashes) {
      if (!seen[idx]) {
        seen[idx] = true;
        out.push(idx);
      }
      idx = (idx + 1) % cells;
    }
    return out;
  }

  function emptyTable(cells) {
    return Array.from({ length: cells }, function () {
      return { count: 0, keyXor: 0, hashXor: 0 };
    });
  }

  function cloneTable(table) {
    return table.map(function (cell) {
      return { count: cell.count, keyXor: cell.keyXor >>> 0, hashXor: cell.hashXor >>> 0 };
    });
  }

  function applyKey(table, key, sign, params) {
    var idxs = distinctIndices(key, params.hashes, table.length, params.seed);
    var h = checksum(key);
    idxs.forEach(function (idx) {
      var cell = table[idx];
      cell.count += sign;
      cell.keyXor = (cell.keyXor ^ key) >>> 0;
      cell.hashXor = (cell.hashXor ^ h) >>> 0;
    });
  }

  function buildTable(keys, cells, params) {
    var table = emptyTable(cells);
    keys.forEach(function (key) { applyKey(table, key, 1, params); });
    return table;
  }

  function subtractTables(a, b) {
    return a.map(function (cell, i) {
      return {
        count: cell.count - b[i].count,
        keyXor: (cell.keyXor ^ b[i].keyXor) >>> 0,
        hashXor: (cell.hashXor ^ b[i].hashXor) >>> 0
      };
    });
  }

  function isEmpty(cell) {
    return cell.count === 0 && cell.keyXor === 0 && cell.hashXor === 0;
  }

  function isPure(cell) {
    return Math.abs(cell.count) === 1 && cell.keyXor !== 0 && cell.hashXor === checksum(cell.keyXor);
  }

  function tableStats(table) {
    var nonempty = 0;
    var pure = 0;
    var positive = 0;
    var negative = 0;
    var stuck = 0;
    table.forEach(function (cell) {
      if (!isEmpty(cell)) {
        nonempty += 1;
        if (isPure(cell)) pure += 1;
        else stuck += 1;
        if (cell.count > 0) positive += 1;
        if (cell.count < 0) negative += 1;
      }
    });
    return { negative: negative, nonempty: nonempty, positive: positive, pure: pure, stuck: stuck };
  }

  function peel(diffTable, params) {
    var table = cloneTable(diffTable);
    var queue = [];
    var positives = [];
    var negatives = [];
    var trace = [];
    table.forEach(function (cell, i) {
      if (isPure(cell)) queue.push(i);
    });
    var initialPure = queue.length;
    var head = 0;
    while (head < queue.length) {
      var idx = queue[head];
      head += 1;
      var cell = table[idx];
      if (!isPure(cell)) continue;
      var key = cell.keyXor >>> 0;
      var sign = cell.count;
      if (sign > 0) positives.push(key);
      else negatives.push(key);
      trace.push({ index: idx, key: key, sign: sign });
      distinctIndices(key, params.hashes, table.length, params.seed).forEach(function (j) {
        table[j].count -= sign;
        table[j].keyXor = (table[j].keyXor ^ key) >>> 0;
        table[j].hashXor = (table[j].hashXor ^ checksum(key)) >>> 0;
        if (isPure(table[j])) queue.push(j);
      });
    }
    var residual = tableStats(table);
    return {
      initialPure: initialPure,
      negatives: sorted(negatives),
      positives: sorted(positives),
      residual: residual,
      success: residual.nonempty === 0,
      table: table,
      trace: trace
    };
  }

  function runOnce(params) {
    params = cleanParams(params);
    var sets = generateSets(params);
    var diffSize = sets.aOnly.length + sets.bOnly.length;
    var cells = Math.max(params.hashes + 1, Math.ceil(diffSize * params.factor));
    var aTable = buildTable(sets.a, cells, params);
    var bTable = buildTable(sets.b, cells, params);
    var diff = subtractTables(aTable, bTable);
    var before = tableStats(diff);
    var decoded = peel(diff, params);
    var exactA = sets.aOnly;
    var exactB = sets.bOnly;
    var decodedOk = decoded.success && sameArray(decoded.positives, exactA) && sameArray(decoded.negatives, exactB);
    var cellBytes = cells * 12;
    var listBytes = (sets.a.length + sets.b.length) * 4;
    var directBytes = diffSize * 4;
    return {
      audit: {
        commonCancels: tableStats(subtractTables(buildTable(sets.common, cells, params), buildTable(sets.common, cells, params))).nonempty === 0,
        decodedOk: decodedOk,
        noFalseNegative: decoded.positives.every(function (key) { return exactA.indexOf(key) !== -1; }) &&
          decoded.negatives.every(function (key) { return exactB.indexOf(key) !== -1; }),
        residualEmpty: decoded.residual.nonempty === 0,
        subtractionShape: before.nonempty <= Math.min(cells, diffSize * params.hashes)
      },
      before: before,
      bytes: {
        direct: directBytes,
        iblt: cellBytes,
        lists: listBytes
      },
      cells: cells,
      decoded: decoded,
      diffSize: diffSize,
      params: params,
      sets: sets
    };
  }

  function runSweep(params) {
    var factors = [1.05, 1.15, 1.25, 1.35, 1.5, 1.7, 1.9, 2.2, 2.55];
    var trials = 30;
    return factors.map(function (factor) {
      var ok = 0;
      var residual = 0;
      for (var i = 0; i < trials; i += 1) {
        var run = runOnce({
          common: params.common,
          difference: params.difference,
          factor: factor,
          hashes: params.hashes,
          scenario: params.scenario,
          seed: params.seed + i * 97
        });
        if (run.audit.decodedOk) ok += 1;
        residual += run.decoded.residual.nonempty;
      }
      return {
        factor: factor,
        residual: residual / trials,
        successRate: ok / trials
      };
    });
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var run = runOnce(params);
    run.sweep = runSweep(params);
    return run;
  }

  function runAudit() {
    var cases = [
      {},
      { scenario: "alice", common: 400, difference: 24, factor: 2.55, hashes: 3, seed: 7 },
      { scenario: "bob", common: 900, difference: 48, factor: 1.75, hashes: 4, seed: 13 },
      { scenario: "split", common: 1200, difference: 90, factor: 1.9, hashes: 3, seed: 31 },
      { scenario: "balanced", common: 3200, difference: 140, factor: 2.2, hashes: 5, seed: 101 }
    ];
    var details = cases.map(function (params) {
      var run = runOnce(params);
      var allEmpty = tableStats(emptyTable(run.cells)).nonempty === 0;
      var pureCellsValid = run.decoded.trace.every(function (row) {
        return row.sign === 1 || row.sign === -1;
      });
      return {
        cells: run.cells,
        decodedOk: run.audit.decodedOk,
        diffSize: run.diffSize,
        emptyTableOk: allEmpty,
        pureCellsValid: pureCellsValid,
        residual: run.decoded.residual.nonempty,
        scenario: run.params.scenario
      };
    });
    return {
      details: details,
      passed: details.every(function (row) {
        return row.decodedOk && row.emptyTableOk && row.pureCellsValid && row.residual === 0;
      })
    };
  }

  function formatInt(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatBytes(value) {
    if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + " MB";
    if (value >= 1024) return (value / 1024).toFixed(1) + " KB";
    return formatInt(value) + " B";
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setupCanvas(canvas, cssHeight) {
    var width = Math.max(320, Math.round(canvas.getBoundingClientRect().width || 900));
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
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.ink;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "alphabetic";
    ctx.fillText(String(value), x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    text(ctx, title, box.x + 16, box.y + 26, { size: 13, weight: 800 });
    if (subtitle) text(ctx, subtitle, box.x + 16, box.y + 45, { size: 10, color: COLORS.muted, weight: 650 });
  }

  function drawBar(ctx, x, y, w, h, color, label, value) {
    ctx.fillStyle = COLORS.grid;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(1, w * value), h);
    text(ctx, label, x, y - 7, { size: 10, color: COLORS.muted, weight: 700 });
  }

  function drawSets(ctx, result, box) {
    panel(ctx, box, "set ledger", "large overlap, small symmetric difference");
    var total = result.sets.common.length + result.sets.aOnly.length + result.sets.bOnly.length;
    var x = box.x + 22;
    var y = box.y + 82;
    var w = box.w - 44;
    var commonW = w * result.sets.common.length / total;
    var aW = w * result.sets.aOnly.length / total;
    var bW = w * result.sets.bOnly.length / total;
    ctx.fillStyle = COLORS.common;
    ctx.fillRect(x, y, commonW, 30);
    ctx.fillStyle = COLORS.a;
    ctx.fillRect(x + commonW, y, aW, 30);
    ctx.fillStyle = COLORS.b;
    ctx.fillRect(x + commonW + aW, y, bW, 30);
    text(ctx, "shared " + formatInt(result.sets.common.length), x, y + 52, { size: 11, color: COLORS.common, weight: 760 });
    text(ctx, "A only " + formatInt(result.sets.aOnly.length), x + w * 0.43, y + 52, { size: 11, color: COLORS.a, weight: 760 });
    text(ctx, "B only " + formatInt(result.sets.bOnly.length), x + w * 0.70, y + 52, { size: 11, color: COLORS.b, weight: 760 });
    y = box.y + box.h - 76;
    drawBar(ctx, x, y, w, 18, COLORS.iblt, "IBLT message " + formatBytes(result.bytes.iblt), result.bytes.iblt / Math.max(result.bytes.lists, result.bytes.iblt));
    drawBar(ctx, x, y + 40, w, 18, COLORS.muted, "full lists " + formatBytes(result.bytes.lists), 1);
  }

  function cellColor(cell) {
    if (isEmpty(cell)) return COLORS.rule;
    if (isPure(cell)) return cell.count > 0 ? COLORS.a : COLORS.b;
    return COLORS.stuck;
  }

  function drawCells(ctx, result, box) {
    panel(ctx, box, "subtracted table", "pure cells have count +/-1 and a matching checksum");
    var stats = result.before;
    var cols = Math.min(28, Math.max(12, Math.floor((box.w - 40) / 15)));
    var size = Math.min(13, (box.w - 44) / cols);
    var maxRows = Math.max(3, Math.floor((box.h - 188) / size));
    var shownCells = Math.min(result.cells, cols * maxRows, 112);
    var rows = Math.ceil(shownCells / cols);
    var x0 = box.x + 20;
    var y0 = box.y + 74;
    var diff = subtractTables(buildTable(result.sets.a, result.cells, result.params), buildTable(result.sets.b, result.cells, result.params));
    for (var i = 0; i < shownCells; i += 1) {
      var cx = x0 + (i % cols) * size;
      var cy = y0 + Math.floor(i / cols) * size;
      ctx.fillStyle = cellColor(diff[i]);
      ctx.fillRect(cx, cy, Math.max(2, size - 2), Math.max(2, size - 2));
    }
    var y = box.y + box.h - 70;
    var captionY = y0 + rows * size + 22;
    if (captionY < y - 12) {
      text(ctx, "showing " + shownCells + " of " + result.cells + " cells", x0, captionY, { size: 10, color: COLORS.muted, weight: 650 });
    }
    var metricW = (box.w - 44) / 3;
    text(ctx, "pure", x0, y, { size: 10, color: COLORS.muted, weight: 700 });
    text(ctx, formatInt(stats.pure), x0, y + 24, { size: 18, color: COLORS.iblt, weight: 820 });
    text(ctx, "nonempty", x0 + metricW, y, { size: 10, color: COLORS.muted, weight: 700 });
    text(ctx, formatInt(stats.nonempty), x0 + metricW, y + 24, { size: 18, color: COLORS.ink, weight: 820 });
    text(ctx, "stuck", x0 + metricW * 2, y, { size: 10, color: COLORS.muted, weight: 700 });
    text(ctx, formatInt(stats.stuck), x0 + metricW * 2, y + 24, { size: 18, color: COLORS.stuck, weight: 820 });
  }

  function drawPeel(ctx, result, box) {
    panel(ctx, box, "peeling run", "each decoded key deletes itself from its hash cells");
    var plot = { x: box.x + 24, y: box.y + 72, w: box.w - 48, h: box.h - 130 };
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    var trace = result.decoded.trace;
    var maxSteps = Math.max(1, trace.length);
    trace.slice(0, 180).forEach(function (row, i) {
      var x = plot.x + i * plot.w / Math.max(1, Math.min(maxSteps, 180) - 1);
      var h = 18 + (row.index % 17);
      ctx.fillStyle = row.sign > 0 ? COLORS.a : COLORS.b;
      ctx.fillRect(x, plot.y + plot.h - h, Math.max(2, plot.w / Math.max(60, Math.min(maxSteps, 180))), h);
    });
    if (!trace.length) {
      text(ctx, "no pure cell found", plot.x + 10, plot.y + plot.h / 2, { size: 14, color: COLORS.stuck, weight: 800 });
    }
    var verdict = result.audit.decodedOk ? "decoded exact difference" : "peeling stopped early";
    ctx.fillStyle = result.audit.decodedOk ? COLORS.softGreen : COLORS.softRed;
    roundedRect(ctx, box.x + 18, box.y + box.h - 58, box.w - 36, 38, 6);
    ctx.fill();
    text(ctx, verdict, box.x + 30, box.y + box.h - 34, {
      size: 13,
      color: result.audit.decodedOk ? COLORS.pure : COLORS.bad,
      weight: 820
    });
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "capacity sweep", "same workload, repeated seeds");
    var plot = { x: box.x + 42, y: box.y + 72, w: box.w - 70, h: box.h - 128 };
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h - g * plot.h / 4;
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.iblt;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.sweep.forEach(function (row, i) {
      var x = plot.x + i * plot.w / (result.sweep.length - 1);
      var y = plot.y + plot.h - row.successRate * plot.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
    result.sweep.forEach(function (row, i) {
      var x = plot.x + i * plot.w / (result.sweep.length - 1);
      var y = plot.y + plot.h - row.successRate * plot.h;
      ctx.fillStyle = Math.abs(row.factor - result.params.factor) < 0.026 ? COLORS.b : COLORS.iblt;
      ctx.beginPath();
      ctx.arc(x, y, Math.abs(row.factor - result.params.factor) < 0.026 ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
    text(ctx, "0%", plot.x - 8, plot.y + plot.h + 4, { size: 10, color: COLORS.muted, align: "right", weight: 650 });
    text(ctx, "100%", plot.x - 8, plot.y + 4, { size: 10, color: COLORS.muted, align: "right", weight: 650 });
    text(ctx, "cells / difference key", plot.x + plot.w, plot.y + plot.h + 32, { size: 10, color: COLORS.muted, align: "right", weight: 650 });
    text(ctx, "current " + result.params.factor.toFixed(2) + "x", plot.x, box.y + box.h - 22, { size: 11, color: COLORS.b, weight: 780 });
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
      drawSets(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawCells(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawPeel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawSweep(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }
    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawSets(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawCells(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawPeel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawSweep(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function metric(label, value, klass) {
    return "<div class=\"iblt-lab__metric " + (klass || "") + "\"><span>" +
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
    setOutput(root, "scenario", SCENARIOS[result.params.scenario]);
    setOutput(root, "common", formatInt(result.params.common));
    setOutput(root, "difference", formatInt(result.params.difference));
    setOutput(root, "factor", result.params.factor.toFixed(2) + "x");
    setOutput(root, "hashes", String(result.params.hashes));
    setOutput(root, "seed", String(result.params.seed));
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncControls(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var listRatio = result.bytes.iblt ? result.bytes.lists / result.bytes.iblt : 0;
      metrics.innerHTML = [
        metric("difference keys", formatInt(result.diffSize)),
        metric("table cells", formatInt(result.cells)),
        metric("message size", formatBytes(result.bytes.iblt)),
        metric("vs full lists", listRatio.toFixed(1) + "x smaller"),
        metric("residual cells", formatInt(result.decoded.residual.nonempty)),
        metric("audit", result.audit.decodedOk ? "passed" : "stuck", result.audit.decodedOk ? "iblt-lab__metric--good" : "iblt-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "The browser artifact uses XOR sums plus a 32-bit checksum. Real deployments choose hash widths, salts, and sizing from an explicit failure budget.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__ibltResult = result;
  }

  function init(root) {
    if (!root || root.__ibltReady) return;
    root.__ibltReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { render(root); }, 80);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__ibltResult) {
          var canvas = root.querySelector("canvas[data-canvas]");
          if (canvas) draw(root.__ibltResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__ibltResult) render(root);
      });
    }
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-iblt-lab]")).forEach(init);
  }

  function auditIBLTLab() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  var api = {
    auditIBLTLab: auditIBLTLab,
    cleanParams: cleanParams,
    distinctIndices: distinctIndices,
    evaluate: evaluate,
    isPure: isPure,
    peel: peel,
    runAudit: runAudit,
    runOnce: runOnce
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.IBLTReconciliationLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
