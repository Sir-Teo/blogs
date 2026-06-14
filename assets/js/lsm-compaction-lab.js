(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    mem: "#0f766e",
    l0: "#2563eb",
    level: "#7c3aed",
    tiered: "#d97706",
    obsolete: "#be123c",
    live: "#0f766e",
    tombstone: "#64748b"
  };

  var DEFAULTS = {
    deleteRate: 6,
    keyspace: 384,
    memtable: 48,
    operations: 1600,
    policy: "leveled",
    ratio: 4,
    seed: 37,
    skew: 72,
    workload: "hot"
  };

  var POLICIES = ["leveled", "tiered", "none"];
  var WORKLOADS = ["hot", "uniform", "append"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cleanParams(raw) {
    raw = raw || {};
    var policy = String(raw.policy || DEFAULTS.policy);
    var workload = String(raw.workload || DEFAULTS.workload);
    if (POLICIES.indexOf(policy) < 0) policy = DEFAULTS.policy;
    if (WORKLOADS.indexOf(workload) < 0) workload = DEFAULTS.workload;
    return {
      deleteRate: clamp(Number(raw.deleteRate == null ? DEFAULTS.deleteRate : raw.deleteRate), 0, 35) / 100,
      keyspace: clamp(Math.round(raw.keyspace == null ? DEFAULTS.keyspace : Number(raw.keyspace)), 64, 1024),
      memtable: clamp(Math.round(raw.memtable == null ? DEFAULTS.memtable : Number(raw.memtable)), 16, 128),
      operations: clamp(Math.round(raw.operations == null ? DEFAULTS.operations : Number(raw.operations)), 300, 4000),
      policy: policy,
      ratio: clamp(Math.round(raw.ratio == null ? DEFAULTS.ratio : Number(raw.ratio)), 2, 8),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : Number(raw.seed)), 1, 999),
      skew: clamp(Number(raw.skew == null ? DEFAULTS.skew : raw.skew), 0, 95) / 100,
      workload: workload
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="lsm-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function makeKey(params, i, rand) {
    if (params.workload === "append") return i;
    if (params.workload === "uniform") return Math.floor(rand() * params.keyspace);
    var hotSize = Math.max(4, Math.round(params.keyspace * 0.08));
    if (rand() < params.skew) return Math.floor(rand() * hotSize);
    return Math.floor(rand() * params.keyspace);
  }

  function entryArrayFromMap(map) {
    var rows = Array.from(map.values());
    rows.sort(function (a, b) { return a.key - b.key || a.seq - b.seq; });
    return rows.map(function (row) {
      return { deleted: row.deleted, key: row.key, seq: row.seq };
    });
  }

  function makeRun(entries, level, id) {
    var minKey = Infinity;
    var maxKey = -Infinity;
    var maxSeq = -Infinity;
    entries.forEach(function (entry) {
      minKey = Math.min(minKey, entry.key);
      maxKey = Math.max(maxKey, entry.key);
      maxSeq = Math.max(maxSeq, entry.seq);
    });
    return {
      entries: entries,
      id: id,
      level: level,
      maxKey: entries.length ? maxKey : 0,
      maxSeq: entries.length ? maxSeq : 0,
      minKey: entries.length ? minKey : 0
    };
  }

  function mergeRuns(runs, level, id) {
    var latest = new Map();
    runs.forEach(function (run) {
      run.entries.forEach(function (entry) {
        var prev = latest.get(entry.key);
        if (!prev || entry.seq > prev.seq) latest.set(entry.key, entry);
      });
    });
    return makeRun(entryArrayFromMap(latest), level, id);
  }

  function totalEntries(runs) {
    return runs.reduce(function (sum, run) { return sum + run.entries.length; }, 0);
  }

  function flattenLevels(levels) {
    var out = [];
    levels.forEach(function (runs) {
      runs.forEach(function (run) { out.push(run); });
    });
    return out;
  }

  function levelCapacity(params, level) {
    return params.memtable * Math.pow(params.ratio, level + 1);
  }

  function compactLeveled(levels, params, stats, trace, opCount, nextRunId) {
    var changed = true;
    while (changed) {
      changed = false;
      if ((levels[0] || []).length > params.ratio) {
        levels[1] = levels[1] || [];
        var inputs = levels[0].concat(levels[1]);
        var inputEntries = totalEntries(inputs);
        var output = mergeRuns(inputs, 1, nextRunId.value++);
        stats.compactionReadEntries += inputEntries;
        stats.compactionWriteEntries += output.entries.length;
        stats.maxCompactionInput = Math.max(stats.maxCompactionInput, inputEntries);
        stats.events.push({ input: inputEntries, level: 0, output: output.entries.length, policy: "leveled" });
        levels[0] = [];
        levels[1] = output.entries.length ? [output] : [];
        tracePoint(levels, trace, opCount, stats);
        changed = true;
      }
      for (var level = 1; level < 7; level += 1) {
        levels[level] = levels[level] || [];
        if (totalEntries(levels[level]) > levelCapacity(params, level)) {
          levels[level + 1] = levels[level + 1] || [];
          inputs = levels[level].concat(levels[level + 1]);
          inputEntries = totalEntries(inputs);
          output = mergeRuns(inputs, level + 1, nextRunId.value++);
          stats.compactionReadEntries += inputEntries;
          stats.compactionWriteEntries += output.entries.length;
          stats.maxCompactionInput = Math.max(stats.maxCompactionInput, inputEntries);
          stats.events.push({ input: inputEntries, level: level, output: output.entries.length, policy: "leveled" });
          levels[level] = [];
          levels[level + 1] = output.entries.length ? [output] : [];
          tracePoint(levels, trace, opCount, stats);
          changed = true;
        }
      }
    }
  }

  function compactTiered(levels, params, stats, trace, opCount, nextRunId) {
    var changed = true;
    while (changed) {
      changed = false;
      for (var level = 0; level < 8; level += 1) {
        levels[level] = levels[level] || [];
        if (levels[level].length >= params.ratio) {
          var inputs = levels[level].slice(0, params.ratio);
          var rest = levels[level].slice(params.ratio);
          var inputEntries = totalEntries(inputs);
          var output = mergeRuns(inputs, level + 1, nextRunId.value++);
          stats.compactionReadEntries += inputEntries;
          stats.compactionWriteEntries += output.entries.length;
          stats.maxCompactionInput = Math.max(stats.maxCompactionInput, inputEntries);
          stats.events.push({ input: inputEntries, level: level, output: output.entries.length, policy: "tiered" });
          levels[level] = rest;
          levels[level + 1] = levels[level + 1] || [];
          if (output.entries.length) levels[level + 1].push(output);
          tracePoint(levels, trace, opCount, stats);
          changed = true;
        }
      }
    }
  }

  function latestLogical(levels, memtable) {
    var latest = new Map();
    flattenLevels(levels).forEach(function (run) {
      run.entries.forEach(function (entry) {
        var prev = latest.get(entry.key);
        if (!prev || entry.seq > prev.seq) latest.set(entry.key, entry);
      });
    });
    memtable.forEach(function (entry, key) {
      var prev = latest.get(key);
      if (!prev || entry.seq > prev.seq) latest.set(key, entry);
    });
    return latest;
  }

  function tracePoint(levels, trace, opCount, stats) {
    if (trace.length > 180) return;
    var diskEntries = totalEntries(flattenLevels(levels));
    trace.push({
      compactionWriteEntries: stats.compactionWriteEntries,
      diskEntries: diskEntries,
      flushWriteEntries: stats.flushWriteEntries,
      op: opCount
    });
  }

  function analyze(levels, memtable, params, stats) {
    var latest = latestLogical(levels, memtable);
    var liveKeys = 0;
    var tombstoneKeys = 0;
    latest.forEach(function (entry) {
      if (entry.deleted) tombstoneKeys += 1;
      else liveKeys += 1;
    });

    var runs = flattenLevels(levels);
    var diskEntries = totalEntries(runs);
    var obsoleteEntries = 0;
    var tombstoneEntries = 0;
    runs.forEach(function (run) {
      run.entries.forEach(function (entry) {
        var cur = latest.get(entry.key);
        if (!cur || cur.seq !== entry.seq) obsoleteEntries += 1;
        if (entry.deleted) tombstoneEntries += 1;
      });
    });

    var readAmp = estimateReadAmp(runs, memtable, latest, params);
    var byLevel = levels.map(function (runsAtLevel, level) {
      return {
        entries: totalEntries(runsAtLevel || []),
        level: level,
        runs: (runsAtLevel || []).length
      };
    }).filter(function (row) { return row.entries || row.runs || row.level < 4; });

    return {
      byLevel: byLevel,
      diskEntries: diskEntries,
      liveKeys: liveKeys,
      obsoleteEntries: obsoleteEntries,
      readAmp: readAmp,
      runCount: runs.length,
      spaceAmp: diskEntries / Math.max(1, liveKeys),
      tombstoneEntries: tombstoneEntries,
      tombstoneKeys: tombstoneKeys,
      writeAmp: (stats.flushWriteEntries + stats.compactionWriteEntries) / Math.max(1, stats.userOperations)
    };
  }

  function estimateReadAmp(runs, memtable, latest, params) {
    var sortedRuns = runs.slice().sort(function (a, b) {
      return b.maxSeq - a.maxSeq || b.id - a.id;
    });
    var liveKeys = [];
    latest.forEach(function (entry, key) {
      if (!entry.deleted) liveKeys.push(key);
    });
    var rand = rng(8080 + params.seed * 31 + params.operations);
    var samples = 240;
    var checks = 0;
    var found = 0;
    var maxKnownKey = params.workload === "append" ? Math.max(params.operations, params.keyspace) : params.keyspace;
    for (var i = 0; i < samples; i += 1) {
      var key;
      if (liveKeys.length && rand() < 0.55) key = liveKeys[Math.floor(rand() * liveKeys.length)];
      else key = Math.floor(rand() * Math.max(1, maxKnownKey * 1.15));
      if (memtable.has(key)) {
        found += memtable.get(key).deleted ? 0 : 1;
        continue;
      }
      for (var j = 0; j < sortedRuns.length; j += 1) {
        var run = sortedRuns[j];
        if (key < run.minKey || key > run.maxKey) continue;
        checks += 1;
        var entry = findEntry(run.entries, key);
        if (entry) {
          found += entry.deleted ? 0 : 1;
          break;
        }
      }
    }
    return {
      averageChecks: checks / samples,
      foundRate: found / samples,
      samples: samples
    };
  }

  function findEntry(entries, key) {
    var lo = 0;
    var hi = entries.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (entries[mid].key === key) return entries[mid];
      if (entries[mid].key < key) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams);
    var rand = rng(20260614 + params.seed * 131);
    var levels = [];
    for (var i = 0; i < 10; i += 1) levels.push([]);
    var memtable = new Map();
    var nextRunId = { value: 1 };
    var stats = {
      compactionReadEntries: 0,
      compactionWriteEntries: 0,
      events: [],
      flushes: 0,
      flushWriteEntries: 0,
      maxCompactionInput: 0,
      userOperations: params.operations
    };
    var trace = [];

    function flush(opCount) {
      if (!memtable.size) return;
      var entries = entryArrayFromMap(memtable);
      var run = makeRun(entries, 0, nextRunId.value++);
      levels[0].push(run);
      stats.flushes += 1;
      stats.flushWriteEntries += entries.length;
      memtable = new Map();
      tracePoint(levels, trace, opCount, stats);
      if (params.policy === "leveled") compactLeveled(levels, params, stats, trace, opCount, nextRunId);
      else if (params.policy === "tiered") compactTiered(levels, params, stats, trace, opCount, nextRunId);
    }

    for (var op = 1; op <= params.operations; op += 1) {
      var key = makeKey(params, op - 1, rand);
      var deleted = rand() < params.deleteRate;
      memtable.set(key, { deleted: deleted, key: key, seq: op });
      if (memtable.size >= params.memtable) flush(op);
    }
    flush(params.operations);

    return {
      analysis: analyze(levels, memtable, params, stats),
      levels: levels,
      memtable: Array.from(memtable.values()),
      params: params,
      stats: stats,
      trace: trace
    };
  }

  function readState(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      if (input.tagName === "SELECT") raw[input.getAttribute("data-param")] = input.value;
      else raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var values = {
      deleteRate: Math.round(params.deleteRate * 100) + "%",
      keyspace: String(params.keyspace),
      memtable: String(params.memtable),
      operations: String(params.operations),
      ratio: String(params.ratio),
      seed: String(params.seed),
      skew: Math.round(params.skew * 100) + "%"
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function updateMetrics(metrics, result) {
    var a = result.analysis;
    metrics.innerHTML = [
      metric("run write amp", formatNumber(a.writeAmp, 2) + "x"),
      metric("point checks", formatNumber(a.readAmp.averageChecks, 2)),
      metric("space amp", formatNumber(a.spaceAmp, 2) + "x"),
      metric("stored entries", formatNumber(a.diskEntries, 0)),
      metric("obsolete share", formatPercent(a.obsoleteEntries / Math.max(1, a.diskEntries), 1)),
      metric("compactions", String(result.stats.events.length))
    ].join("");
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 700 ? 1060 : 700;
    var ratio = root.devicePixelRatio || 1;
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 43, 11, COLORS.muted, 550);
  }

  function drawLevels(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "physical layout", "each run is an immutable sorted table");
    var levels = result.analysis.byLevel.slice(0, 8);
    var maxEntries = Math.max.apply(null, levels.map(function (row) { return row.entries; }).concat([1]));
    var top = y + 64;
    var rowH = Math.min(30, (h - 90) / levels.length);
    var left = x + 54;
    var right = x + w - 24;
    levels.forEach(function (row, i) {
      var yy = top + i * rowH;
      drawText(ctx, "L" + row.level, x + 18, yy + 16, 11, COLORS.text, 720);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy + 4, right - left, 14);
      var bw = (right - left) * row.entries / maxEntries;
      ctx.fillStyle = row.level === 0 ? COLORS.l0 : COLORS.level;
      ctx.fillRect(left, yy + 4, bw, 14);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, yy + 4, right - left, 14);
      drawText(ctx, row.runs + " run" + (row.runs === 1 ? "" : "s") + ", " + formatNumber(row.entries, 0) + " entries", right, yy + 16, 10, COLORS.muted, 650, "right");
    });
    var memWidth = (right - left) * result.memtable.length / Math.max(1, result.params.memtable);
    ctx.fillStyle = COLORS.mem;
    ctx.fillRect(left, y + h - 28, memWidth, 10);
    drawText(ctx, "memtable " + result.memtable.length + "/" + result.params.memtable, left, y + h - 34, 10, COLORS.muted, 650);
  }

  function drawAmplification(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "amplification tradeoff", "compaction moves cost between writes, reads, and space");
    var a = result.analysis;
    var rows = [
      { color: COLORS.tiered, label: "run write amp", max: 8, value: a.writeAmp },
      { color: COLORS.l0, label: "point checks", max: 12, value: a.readAmp.averageChecks },
      { color: COLORS.level, label: "space amp", max: 8, value: a.spaceAmp },
      { color: COLORS.obsolete, label: "obsolete share", max: 1, value: a.obsoleteEntries / Math.max(1, a.diskEntries) }
    ];
    var left = x + 112;
    var right = x + w - 26;
    var top = y + 68;
    rows.forEach(function (row, i) {
      var yy = top + i * 38;
      drawText(ctx, row.label, x + 18, yy + 15, 11, COLORS.text, 650);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy + 4, right - left, 14);
      ctx.fillStyle = row.color;
      ctx.fillRect(left, yy + 4, (right - left) * Math.min(row.value / row.max, 1), 14);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, yy + 4, right - left, 14);
      var text = row.label === "obsolete share" ? formatPercent(row.value, 1) : formatNumber(row.value, 2) + (row.label === "point checks" ? "" : "x");
      drawText(ctx, text, right, yy + 15, 10, COLORS.muted, 650, "right");
    });
    drawText(ctx, "flush writes " + formatNumber(result.stats.flushWriteEntries, 0) + ", compaction writes " + formatNumber(result.stats.compactionWriteEntries, 0), x + 18, y + h - 30, 10, COLORS.muted, 650);
  }

  function drawTrace(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "debt over time", "stored entries rise on flushes and fall when obsolete versions merge away");
    var trace = result.trace;
    var left = x + 42;
    var right = x + w - 18;
    var top = y + 64;
    var bottom = y + h - 42;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    if (!trace.length) return;
    var maxDisk = Math.max.apply(null, trace.map(function (row) { return row.diskEntries; }).concat([1]));
    ctx.strokeStyle = COLORS.level;
    ctx.lineWidth = 2;
    ctx.beginPath();
    trace.forEach(function (row, i) {
      var xx = left + (right - left) * row.op / Math.max(1, result.params.operations);
      var yy = bottom - (bottom - top) * row.diskEntries / maxDisk;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    trace.forEach(function (row, i) {
      if (i % Math.max(1, Math.floor(trace.length / 40)) !== 0 && i !== trace.length - 1) return;
      var xx = left + (right - left) * row.op / Math.max(1, result.params.operations);
      var yy = bottom - (bottom - top) * row.diskEntries / maxDisk;
      ctx.fillStyle = COLORS.level;
      ctx.beginPath();
      ctx.arc(xx, yy, 2.4, 0, 2 * Math.PI);
      ctx.fill();
    });
    drawText(ctx, "ops", (left + right) / 2, y + h - 13, 10, COLORS.muted, 650, "center");
    drawText(ctx, "stored", x + 10, top + 5, 10, COLORS.muted, 650);
  }

  function drawEvents(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "compaction events", "input entries read versus surviving output entries");
    var events = result.stats.events.slice(-36);
    var left = x + 54;
    var right = x + w - 22;
    var top = y + 66;
    var maxInput = Math.max.apply(null, events.map(function (e) { return e.input; }).concat([1]));
    if (!events.length) {
      drawText(ctx, "No compaction has run. Reads and space are carrying the debt.", x + 20, top + 28, 12, COLORS.muted, 650);
      return;
    }
    var rowH = Math.min(20, (h - 92) / events.length);
    events.forEach(function (event, i) {
      var yy = top + i * rowH;
      drawText(ctx, "L" + event.level, x + 20, yy + 12, 10, COLORS.text, 650);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy + 3, right - left, 10);
      ctx.fillStyle = event.policy === "tiered" ? COLORS.tiered : COLORS.level;
      ctx.fillRect(left, yy + 3, (right - left) * event.input / maxInput, 10);
      ctx.fillStyle = COLORS.live;
      ctx.fillRect(left, yy + 14, (right - left) * event.output / maxInput, 3);
      if (i === events.length - 1) {
        drawText(ctx, event.input + " -> " + event.output, right, yy + 12, 10, COLORS.muted, 650, "right");
      }
    });
    drawText(ctx, "largest input " + formatNumber(result.stats.maxCompactionInput, 0) + " entries", left, y + h - 15, 10, COLORS.muted, 650);
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 18;
    var gap = 16;
    if (width < 700) {
      var panelH = (height - 2 * pad - 3 * gap) / 4;
      drawLevels(ctx, result, pad, pad, width - 2 * pad, panelH);
      drawAmplification(ctx, result, pad, pad + panelH + gap, width - 2 * pad, panelH);
      drawTrace(ctx, result, pad, pad + 2 * (panelH + gap), width - 2 * pad, panelH);
      drawEvents(ctx, result, pad, pad + 3 * (panelH + gap), width - 2 * pad, panelH);
      return;
    }
    var halfW = (width - 2 * pad - gap) / 2;
    var halfH = (height - 2 * pad - gap) / 2;
    drawLevels(ctx, result, pad, pad, halfW, halfH);
    drawAmplification(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawTrace(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawEvents(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function initOne(container) {
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      var params = readState(container);
      updateOutputs(container, params);
      latest = simulate(params);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-lsm-compaction-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    analyze: analyze,
    cleanParams: cleanParams,
    findEntry: findEntry,
    mergeRuns: mergeRuns,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LsmCompactionLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
