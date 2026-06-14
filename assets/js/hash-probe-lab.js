(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    empty: "#edf2f7",
    tombstone: "#d97706",
    linear: "#2563eb",
    robin: "#7c3aed",
    miss: "#64748b",
    skew: "#be123c"
  };

  var CAPACITY = 256;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32((index + 1) | 0, seed) + 0.5) / 4294967297;
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 1 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="hash-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[index];
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function variance(values) {
    if (!values.length) return 0;
    var avg = mean(values);
    return values.reduce(function (sum, value) {
      var delta = value - avg;
      return sum + delta * delta;
    }, 0) / values.length;
  }

  function distance(fromHome, slot, capacity) {
    return (slot - fromHome + capacity) % capacity;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var liveLoad = clamp(raw.liveLoad == null ? 82 : Number(raw.liveLoad), 40, 92);
    var tombstones = clamp(raw.tombstones == null ? 0 : Number(raw.tombstones), 0, 36);
    var maxTombstones = Math.max(0, 97 - liveLoad);
    tombstones = Math.min(tombstones, maxTombstones);
    return {
      liveLoad: liveLoad / 100,
      tombstoneLoad: tombstones / 100,
      skew: clamp(raw.skew == null ? 0 : Number(raw.skew), 0, 70) / 100,
      seed: clamp(raw.seed == null ? 17 : Number(raw.seed), 1, 99) | 0
    };
  }

  function homeFor(id, params, capacity) {
    var h = hash32(id * 2654435761, 0x9e3779b9 ^ params.seed);
    if (params.skew > 0 && uniform(id, 0x51ed ^ params.seed) < params.skew) {
      var hotWidth = Math.max(8, Math.round(capacity / 8));
      return h % hotWidth;
    }
    return h % capacity;
  }

  function makeRecord(id, params, capacity) {
    return {
      home: homeFor(id, params, capacity),
      id: id
    };
  }

  function emptyTable(capacity) {
    var table = [];
    for (var i = 0; i < capacity; i += 1) table.push({ state: "empty" });
    return table;
  }

  function insertLinear(table, record) {
    var capacity = table.length;
    var slot = record.home;
    var probes = 0;
    var firstDeleted = -1;
    while (probes < capacity) {
      var cell = table[slot];
      probes += 1;
      if (cell.state === "full" && cell.id === record.id) return { inserted: false, probes: probes };
      if (cell.state === "deleted" && firstDeleted < 0) firstDeleted = slot;
      if (cell.state === "empty") {
        var target = firstDeleted >= 0 ? firstDeleted : slot;
        table[target] = { state: "full", id: record.id, home: record.home };
        return { inserted: true, probes: probes };
      }
      slot = (slot + 1) % capacity;
    }
    return { inserted: false, probes: probes };
  }

  function insertRobin(table, record) {
    var capacity = table.length;
    var slot = record.home;
    var probeDistance = 0;
    var probes = 0;
    var carrying = { state: "full", id: record.id, home: record.home };
    while (probes < capacity) {
      var cell = table[slot];
      probes += 1;
      if (cell.state === "full" && cell.id === carrying.id) return { inserted: false, probes: probes };
      if (cell.state === "empty" || cell.state === "deleted") {
        table[slot] = carrying;
        return { inserted: true, probes: probes };
      }
      var residentDistance = distance(cell.home, slot, capacity);
      if (residentDistance < probeDistance) {
        table[slot] = carrying;
        carrying = cell;
        probeDistance = residentDistance;
      }
      slot = (slot + 1) % capacity;
      probeDistance += 1;
    }
    return { inserted: false, probes: probes };
  }

  function lookup(table, record) {
    var capacity = table.length;
    var slot = record.home;
    var probes = 0;
    while (probes < capacity) {
      var cell = table[slot];
      probes += 1;
      if (cell.state === "empty") return { found: false, probes: probes, slot: -1 };
      if (cell.state === "full" && cell.id === record.id) {
        return { found: true, probes: probes, slot: slot };
      }
      slot = (slot + 1) % capacity;
    }
    return { found: false, probes: probes, slot: -1 };
  }

  function markDeletes(table, records, count) {
    var chosen = records.slice().sort(function (a, b) {
      return hash32(a.id, 0xd1e7e ^ table.length) - hash32(b.id, 0xd1e7e ^ table.length);
    }).slice(0, count);
    var deleted = {};
    chosen.forEach(function (record) {
      var found = lookup(table, record);
      if (found.found) {
        table[found.slot] = { state: "deleted" };
        deleted[record.id] = true;
      }
    });
    return records.filter(function (record) { return !deleted[record.id]; });
  }

  function tableRuns(table) {
    var capacity = table.length;
    var occupied = table.map(function (cell) { return cell.state !== "empty"; });
    var runs = [];
    var seen = 0;
    var start = 0;
    while (start < capacity && occupied[start]) start += 1;
    var index = start;
    var current = 0;
    while (seen < capacity) {
      var slot = index % capacity;
      if (occupied[slot]) {
        current += 1;
      } else if (current) {
        runs.push(current);
        current = 0;
      }
      index += 1;
      seen += 1;
    }
    if (current) runs.push(current);
    return runs;
  }

  function summarizePolicy(table, liveRecords, params) {
    var hitProbes = liveRecords.map(function (record) { return lookup(table, record).probes; });
    var missProbes = [];
    for (var i = 0; i < 160; i += 1) {
      var missId = 1000000 + params.seed * 10000 + i * 17;
      missProbes.push(lookup(table, makeRecord(missId, params, table.length)).probes);
    }
    var fullCount = table.filter(function (cell) { return cell.state === "full"; }).length;
    var deletedCount = table.filter(function (cell) { return cell.state === "deleted"; }).length;
    var runs = tableRuns(table);
    return {
      avgHit: mean(hitProbes),
      deletedCount: deletedCount,
      fullCount: fullCount,
      hitP50: percentile(hitProbes, 0.5),
      hitP95: percentile(hitProbes, 0.95),
      hitP99: percentile(hitProbes, 0.99),
      hitProbes: hitProbes,
      hitVariance: variance(hitProbes),
      longestRun: runs.length ? Math.max.apply(null, runs) : 0,
      maxHit: hitProbes.length ? Math.max.apply(null, hitProbes) : 0,
      missAvg: mean(missProbes),
      missP95: percentile(missProbes, 0.95),
      missP99: percentile(missProbes, 0.99),
      missProbes: missProbes,
      probeLoad: (fullCount + deletedCount) / table.length,
      runs: runs,
      table: table
    };
  }

  function buildPolicy(params, policy) {
    var capacity = CAPACITY;
    var totalCount = Math.min(capacity - 2, Math.round(capacity * (params.liveLoad + params.tombstoneLoad)));
    var deleteCount = Math.max(0, totalCount - Math.round(capacity * params.liveLoad));
    var table = emptyTable(capacity);
    var records = [];
    var insertProbes = [];
    for (var i = 0; i < totalCount; i += 1) {
      var record = makeRecord(5000 + params.seed * 1000 + i, params, capacity);
      var result = policy === "robin" ? insertRobin(table, record) : insertLinear(table, record);
      if (result.inserted) {
        records.push(record);
        insertProbes.push(result.probes);
      }
    }
    var liveRecords = markDeletes(table, records, deleteCount);
    var summary = summarizePolicy(table, liveRecords, params);
    summary.insertAvg = mean(insertProbes);
    summary.insertP95 = percentile(insertProbes, 0.95);
    summary.liveRecords = liveRecords;
    summary.policy = policy;
    return summary;
  }

  function simulateCore(params) {
    return {
      capacity: CAPACITY,
      linear: buildPolicy(params, "linear"),
      params: params,
      robin: buildPolicy(params, "robin")
    };
  }

  function sweep(params) {
    var rows = [];
    for (var load = 45; load <= 92; load += 3) {
      var rawTombstones = Math.min(Math.round(params.tombstoneLoad * 100), Math.max(0, 97 - load));
      var p = cleanParams({
        liveLoad: load,
        seed: params.seed,
        skew: Math.round(params.skew * 100),
        tombstones: rawTombstones
      });
      var result = simulateCore(p);
      rows.push({
        linearHitP95: result.linear.hitP95,
        load: p.liveLoad,
        missP95: result.linear.missP95,
        probeLoad: result.linear.probeLoad,
        robinHitP95: result.robin.hitP95
      });
    }
    return rows;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var result = simulateCore(params);
    result.sweep = sweep(params);
    return result;
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
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

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawTableRows(ctx, result, box, policy, color, y) {
    var table = result[policy].table;
    var cols = 64;
    var gap = 1;
    var cellW = (box.w - 8 - (cols - 1) * gap) / cols;
    var cellH = 6;
    var maxAge = Math.max(1, result[policy].maxHit - 1);
    label(ctx, policy === "linear" ? "linear probing" : "Robin Hood", box.x, y - 9, "left", color, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    for (var i = 0; i < table.length; i += 1) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var x = box.x + col * (cellW + gap);
      var cy = y + row * (cellH + gap);
      var cell = table[i];
      if (cell.state === "empty") {
        ctx.fillStyle = COLORS.empty;
      } else if (cell.state === "deleted") {
        ctx.fillStyle = COLORS.tombstone;
      } else {
        var age = distance(cell.home, i, table.length);
        var alpha = 0.32 + 0.62 * Math.min(1, age / maxAge);
        ctx.fillStyle = color.replace(")", ", " + alpha + ")").replace("rgb", "rgba");
      }
      ctx.fillRect(x, cy, Math.max(1, cellW), cellH);
    }
  }

  function drawTablePanel(ctx, result, box) {
    panelTitle(ctx, box, "Table anatomy", "colored bars are occupied slots; amber bars are tombstones");
    drawTableRows(ctx, result, box, "linear", "rgb(37, 99, 235)", box.y + 56);
    drawTableRows(ctx, result, box, "robin", "rgb(124, 58, 237)", box.y + 134);
    var y = box.y + box.h - 16;
    [
      ["live", COLORS.linear],
      ["tombstone", COLORS.tombstone],
      ["empty", COLORS.empty]
    ].forEach(function (item, i) {
      var x = box.x + i * 92;
      ctx.fillStyle = item[1];
      ctx.fillRect(x, y - 5, 16, 8);
      label(ctx, item[0], x + 22, y, "left");
    });
    label(ctx, "longest run " + result.linear.longestRun + " slots", box.x + box.w, y, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function histogram(values, maxBin) {
    var bins = [];
    for (var i = 0; i <= maxBin; i += 1) bins.push(0);
    values.forEach(function (value) {
      bins[Math.min(maxBin, value)] += 1;
    });
    return bins;
  }

  function drawHistogramPanel(ctx, result, box) {
    panelTitle(ctx, box, "Successful lookup tail", "Robin Hood changes who pays the displacement bill");
    var maxBin = Math.min(48, Math.max(result.linear.maxHit, result.robin.maxHit, 10));
    var linearBins = histogram(result.linear.hitProbes, maxBin);
    var robinBins = histogram(result.robin.hitProbes, maxBin);
    var maxCount = Math.max(1, Math.max.apply(null, linearBins.concat(robinBins)));
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 60, h: box.h - 86 };
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    var barW = plot.w / (maxBin + 1);
    linearBins.forEach(function (count, i) {
      var h = count / maxCount * plot.h;
      ctx.fillStyle = "rgba(37, 99, 235, 0.42)";
      ctx.fillRect(plot.x + i * barW, plot.y + plot.h - h, Math.max(1, barW * 0.45), h);
    });
    robinBins.forEach(function (count, i) {
      var h = count / maxCount * plot.h;
      ctx.fillStyle = "rgba(124, 58, 237, 0.72)";
      ctx.fillRect(plot.x + i * barW + barW * 0.45, plot.y + plot.h - h, Math.max(1, barW * 0.45), h);
    });
    label(ctx, "1 probe", plot.x, plot.y + plot.h + 15, "left");
    label(ctx, maxBin + "+ probes", plot.x + plot.w, plot.y + plot.h + 15, "right");
    label(ctx, "blue linear, violet Robin Hood", plot.x, box.y + box.h - 13, "left");
    label(ctx, "variance ratio " + formatNumber(result.linear.hitVariance / Math.max(0.001, result.robin.hitVariance), 2) + "x", plot.x + plot.w, box.y + box.h - 13, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Probe ledger", "one extra slot of load can be many extra probes in the tail");
    var rows = [
      ["live load", result.linear.fullCount / result.capacity, result.robin.fullCount / result.capacity],
      ["probe load", result.linear.probeLoad, result.robin.probeLoad],
      ["hit avg", result.linear.avgHit, result.robin.avgHit],
      ["hit p95", result.linear.hitP95, result.robin.hitP95],
      ["hit p99", result.linear.hitP99, result.robin.hitP99],
      ["miss p95", result.linear.missP95, result.robin.missP95],
      ["hit variance", result.linear.hitVariance, result.robin.hitVariance]
    ];
    var start = box.y + 55;
    var rowH = Math.min(27, Math.max(20, (box.h - 78) / rows.length));
    label(ctx, "linear", box.x + box.w * 0.68, box.y + 43, "right", COLORS.linear, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "Robin Hood", box.x + box.w - 4, box.y + 43, "right", COLORS.robin, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    rows.forEach(function (row, i) {
      var y = start + i * rowH;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.24)" : "transparent";
      ctx.fillRect(box.x, y - 2, box.w, rowH);
      label(ctx, row[0], box.x + 4, y + rowH / 2, "left");
      var digits = row[0].indexOf("load") >= 0 ? 2 : 1;
      label(ctx, formatNumber(row[1], digits), box.x + box.w * 0.68, y + rowH / 2, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, formatNumber(row[2], digits), box.x + box.w - 4, y + rowH / 2, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
  }

  function drawSweepPanel(ctx, result, box) {
    panelTitle(ctx, box, "Load sweep", "hit tails split by policy; miss tails follow occupied runs");
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 62, h: box.h - 88 };
    var values = [];
    result.sweep.forEach(function (row) {
      values.push(row.linearHitP95, row.robinHitP95, row.missP95);
    });
    var maxY = Math.max(5, Math.max.apply(null, values)) * 1.1;
    function xScale(load) { return plot.x + (load - 0.45) / (0.92 - 0.45) * plot.w; }
    function yScale(value) { return plot.y + plot.h - value / maxY * plot.h; }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    [
      { key: "linearHitP95", color: COLORS.linear, width: 2.1 },
      { key: "robinHitP95", color: COLORS.robin, width: 2.1 },
      { key: "missP95", color: COLORS.miss, width: 1.8 }
    ].forEach(function (line) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.beginPath();
      result.sweep.forEach(function (row, i) {
        var x = xScale(row.load);
        var y = yScale(row[line.key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    var currentX = xScale(result.params.liveLoad);
    ctx.strokeStyle = COLORS.skew;
    ctx.beginPath();
    ctx.moveTo(currentX, plot.y);
    ctx.lineTo(currentX, plot.y + plot.h);
    ctx.stroke();
    label(ctx, "45%", plot.x, plot.y + plot.h + 15, "left");
    label(ctx, "92% live load", plot.x + plot.w, plot.y + plot.h + 15, "right");
    label(ctx, "p95 probes: blue hit, violet RH hit, gray miss", plot.x, box.y + box.h - 13, "left");
    label(ctx, "now", plot.x + plot.w, box.y + box.h - 13, "right", COLORS.skew);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 600;
    var height = compact ? 1080 : 700;
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
    var margin = compact ? 22 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawTablePanel(ctx, result, { x: margin, y: 28, w: panelW, h: 240 });
      drawHistogramPanel(ctx, result, { x: margin, y: 304, w: panelW, h: 230 });
      drawLedgerPanel(ctx, result, { x: margin, y: 568, w: panelW, h: 230 });
      drawSweepPanel(ctx, result, { x: margin, y: 832, w: panelW, h: 210 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawTablePanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 302 });
      drawHistogramPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 302 });
      drawLedgerPanel(ctx, result, { x: margin, y: 382, w: panelW2, h: 258 });
      drawSweepPanel(ctx, result, { x: margin + panelW2 + gap, y: 382, w: panelW2, h: 258 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      liveLoad: Math.round(result.params.liveLoad * 100) + "%",
      seed: String(result.params.seed),
      skew: Math.round(result.params.skew * 100) + "%",
      tombstones: Math.round(result.params.tombstoneLoad * 100) + "%"
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("live keys", formatNumber(result.linear.fullCount, 0)),
        metric("probe load", Math.round(result.linear.probeLoad * 100) + "%"),
        metric("linear hit p95", formatNumber(result.linear.hitP95, 0)),
        metric("Robin Hood hit p95", formatNumber(result.robin.hitP95, 0)),
        metric("miss p95", formatNumber(result.linear.missP95, 0)),
        metric("longest run", formatNumber(result.linear.longestRun, 0)),
        metric("variance cut", formatNumber(result.linear.hitVariance / Math.max(0.001, result.robin.hitVariance), 2) + "x"),
        metric("tombstones", formatNumber(result.linear.deletedCount, 0))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-hash-lab]")).forEach(init);
  }

  var api = {
    buildPolicy: buildPolicy,
    cleanParams: cleanParams,
    insertLinear: insertLinear,
    insertRobin: insertRobin,
    lookup: lookup,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.HashProbeLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
