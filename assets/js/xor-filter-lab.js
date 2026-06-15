(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    slot: "#94a3b8",
    edge: "rgba(100, 116, 139, 0.20)",
    peeled: "#0f766e",
    core: "#be123c",
    table: "#2563eb",
    xor: "#7c3aed",
    amber: "#b45309",
    good: "#0f766e",
    bad: "#be123c"
  };

  var DEFAULTS = {
    keys: 96,
    overhead: 24,
    bits: 8,
    retries: 6,
    trials: 48,
    seed: 1
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      keys: clamp(Math.round(Number(raw.keys == null ? DEFAULTS.keys : raw.keys)), 24, 220),
      overhead: clamp(Math.round(Number(raw.overhead == null ? DEFAULTS.overhead : raw.overhead)), 4, 50),
      bits: clamp(Math.round(Number(raw.bits == null ? DEFAULTS.bits : raw.bits)), 4, 14),
      retries: clamp(Math.round(Number(raw.retries == null ? DEFAULTS.retries : raw.retries)), 1, 16),
      trials: clamp(Math.round(Number(raw.trials == null ? DEFAULTS.trials : raw.trials)), 16, 96),
      seed: clamp(Math.round(Number(raw.seed == null ? DEFAULTS.seed : raw.seed)), 1, 9999)
    };
  }

  function hash32(x, seed) {
    var h = (x ^ seed ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function segmentSize(params) {
    return Math.max(8, Math.ceil(params.keys * (1 + params.overhead / 100) / 3));
  }

  function capacity(params) {
    return 3 * segmentSize(params);
  }

  function fingerprint(key, params, seed) {
    var mask = (1 << params.bits) - 1;
    return hash32(key + 0x100000, seed ^ 0x6d2b79f5) & mask;
  }

  function locations(key, params, seed) {
    var s = segmentSize(params);
    return [
      hash32(key + 1, seed ^ 0x13579bdf) % s,
      s + hash32(key + 7, seed ^ 0x2468ace0) % s,
      2 * s + hash32(key + 13, seed ^ 0xf00dd00d) % s
    ];
  }

  function makeEdges(params, seed) {
    var c = capacity(params);
    var slotEdges = [];
    var edges = [];
    for (var i = 0; i < c; i += 1) slotEdges.push([]);
    for (var key = 0; key < params.keys; key += 1) {
      var locs = locations(key, params, seed);
      var edge = {
        id: key,
        key: key,
        locs: locs,
        fp: fingerprint(key, params, seed)
      };
      edges.push(edge);
      locs.forEach(function (slot) { slotEdges[slot].push(edge.id); });
    }
    return { edges: edges, slotEdges: slotEdges };
  }

  function peel(params, seed) {
    var graph = makeEdges(params, seed);
    var slotEdges = graph.slotEdges;
    var edges = graph.edges;
    var active = edges.map(function () { return true; });
    var degree = slotEdges.map(function (list) { return list.length; });
    var queue = [];
    var stack = [];
    var trace = [{ peeled: 0, remaining: edges.length }];

    degree.forEach(function (d, i) {
      if (d === 1) queue.push(i);
    });

    function activeEdgeAt(slot) {
      var list = slotEdges[slot];
      for (var i = 0; i < list.length; i += 1) {
        if (active[list[i]]) return list[i];
      }
      return -1;
    }

    while (queue.length) {
      var slot = queue.shift();
      if (degree[slot] !== 1) continue;
      var edgeId = activeEdgeAt(slot);
      if (edgeId < 0) continue;
      var edge = edges[edgeId];
      active[edgeId] = false;
      stack.push({ edgeId: edgeId, key: edge.key, slot: slot, locs: edge.locs, fp: edge.fp });
      edge.locs.forEach(function (loc) {
        degree[loc] -= 1;
        if (degree[loc] === 1) queue.push(loc);
      });
      trace.push({ peeled: stack.length, remaining: edges.length - stack.length });
    }

    var coreEdges = edges.filter(function (edge) { return active[edge.id]; });
    var coreSlots = [];
    degree.forEach(function (d, slot) {
      if (d > 0) coreSlots.push(slot);
    });
    return {
      edges: edges,
      slotEdges: slotEdges,
      stack: stack,
      trace: trace,
      success: stack.length === edges.length,
      coreEdges: coreEdges,
      coreSlots: coreSlots,
      degree: degree
    };
  }

  function assignTable(params, seed, mapping) {
    var table = [];
    for (var i = 0; i < capacity(params); i += 1) table.push(0);
    for (var s = mapping.stack.length - 1; s >= 0; s -= 1) {
      var row = mapping.stack[s];
      table[row.slot] = row.locs.reduce(function (acc, slot) {
        return acc ^ table[slot];
      }, row.fp);
    }
    return table;
  }

  function queryKey(key, params, seed, table) {
    var locs = locations(key, params, seed);
    var got = locs.reduce(function (acc, slot) { return acc ^ table[slot]; }, 0);
    return got === fingerprint(key, params, seed);
  }

  function buildOnce(params, seed, options) {
    options = options || {};
    var mapping = peel(params, seed);
    var table = null;
    var falseNegatives = null;
    var falsePositiveRate = null;
    var falsePositiveCount = null;
    var probes = options.probes || 8192;

    if (mapping.success && !options.mapOnly) {
      table = assignTable(params, seed, mapping);
      falseNegatives = 0;
      for (var key = 0; key < params.keys; key += 1) {
        if (!queryKey(key, params, seed, table)) falseNegatives += 1;
      }
      falsePositiveCount = 0;
      for (var i = 0; i < probes; i += 1) {
        var absent = 1000003 + 17 * i + params.keys * 131;
        if (queryKey(absent, params, seed, table)) falsePositiveCount += 1;
      }
      falsePositiveRate = falsePositiveCount / probes;
    }

    return {
      seed: seed,
      success: mapping.success,
      mapping: mapping,
      table: table,
      falseNegatives: falseNegatives,
      falsePositiveRate: falsePositiveRate,
      falsePositiveCount: falsePositiveCount,
      probes: probes
    };
  }

  function buildFilter(params) {
    var attempts = [];
    for (var attempt = 0; attempt < params.retries; attempt += 1) {
      var seed = params.seed + attempt * 10007;
      var result = buildOnce(params, seed, { probes: 8192 });
      attempts.push(result);
      if (result.success) {
        result.attempts = attempts;
        result.attemptNumber = attempt + 1;
        return result;
      }
    }
    var last = attempts[attempts.length - 1];
    last.attempts = attempts;
    last.attemptNumber = attempts.length;
    return last;
  }

  function sweep(params) {
    var overheads = [4, 8, 12, 16, 20, 24, 28, 32, 36, 42, 50];
    return overheads.map(function (overhead) {
      var ok = 0;
      for (var t = 0; t < params.trials; t += 1) {
        var trialParams = {
          keys: params.keys,
          overhead: overhead,
          bits: params.bits,
          retries: 1,
          trials: params.trials,
          seed: params.seed + 7919 * (t + 1)
        };
        if (buildOnce(trialParams, trialParams.seed, { mapOnly: true }).success) ok += 1;
      }
      return { overhead: overhead, successRate: ok / params.trials, successes: ok, trials: params.trials };
    });
  }

  function auditResult(result) {
    var target = result.targetFpr;
    var fprOk = !result.build.success || Math.abs(result.build.falsePositiveRate - target) < Math.max(0.012, 4 * Math.sqrt(target * (1 - target) / result.build.probes));
    var insertedOk = !result.build.success || result.build.falseNegatives === 0;
    var tableOk = !result.build.success || result.build.table.length === result.capacity;
    var peelOk = result.build.mapping.stack.length + result.build.mapping.coreEdges.length === result.params.keys;
    var sweepOk = result.sweep.every(function (row) {
      return row.successRate >= 0 && row.successRate <= 1 && row.successes <= row.trials;
    });
    var equationsOk = !result.build.success || result.insertedChecks.every(function (ok) { return ok; });
    return {
      passed: fprOk && insertedOk && tableOk && peelOk && sweepOk && equationsOk,
      fprOk: fprOk,
      insertedOk: insertedOk,
      tableOk: tableOk,
      peelOk: peelOk,
      sweepOk: sweepOk,
      equationsOk: equationsOk
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var c = capacity(params);
    var build = buildFilter(params);
    var checks = [];
    if (build.success) {
      for (var key = 0; key < Math.min(params.keys, 24); key += 1) {
        checks.push(queryKey(key, params, build.seed, build.table));
      }
    }
    var result = {
      params: params,
      capacity: c,
      segmentSize: segmentSize(params),
      bitsPerKey: c * params.bits / params.keys,
      targetFpr: 1 / Math.pow(2, params.bits),
      build: build,
      sweep: sweep(params),
      insertedChecks: checks
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditGrid() {
    var total = 0;
    var passed = 0;
    var scenarios = [];
    [48, 96, 160].forEach(function (keys) {
      [16, 24, 36].forEach(function (overhead) {
        [6, 10].forEach(function (bits) {
          scenarios.push({ keys: keys, overhead: overhead, bits: bits, retries: 8, trials: 20, seed: 31 + keys + overhead + bits });
        });
      });
    });
    scenarios.forEach(function (params) {
      total += 1;
      var result = evaluate(params);
      var ok = result.audit.peelOk && result.audit.sweepOk;
      if (result.build.success) ok = ok && result.audit.insertedOk && result.audit.equationsOk && result.audit.tableOk;
      if (ok) passed += 1;
    });
    var defaultResult = evaluate(DEFAULTS);
    return {
      total: total,
      passed: passed,
      defaultPassed: defaultResult.audit.passed && defaultResult.build.success,
      defaultSuccess: defaultResult.build.success,
      defaultFalsePositiveRate: defaultResult.build.falsePositiveRate,
      defaultTargetFpr: defaultResult.targetFpr
    };
  }

  function formatNumber(value, digits) {
    return Number(value).toLocaleString("en-US", {
      maximumFractionDigits: digits == null ? 2 : digits,
      minimumFractionDigits: digits == null ? 0 : digits
    });
  }

  function formatPercent(value, digits) {
    return formatNumber(100 * value, digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="xor-filter-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 900);
    var height = width < 560 ? 980 : 760;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function label(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.muted;
    ctx.font = (opts.weight || "600") + " " + (opts.size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "middle";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, box.x + 14, box.y + 17, { color: COLORS.text, size: 13, weight: "750" });
    label(ctx, subtitle, box.x + 14, box.y + 36, { color: COLORS.muted, size: 11, weight: "550" });
  }

  function slotPoint(slot, result, plot) {
    var s = result.segmentSize;
    var part = Math.floor(slot / s);
    var local = slot % s;
    var xs = [plot.x + plot.w * 0.16, plot.x + plot.w * 0.50, plot.x + plot.w * 0.84];
    return {
      x: xs[part],
      y: plot.y + (local + 0.5) / s * plot.h
    };
  }

  function drawHypergraph(ctx, box, result) {
    panel(ctx, box, "peelable hypergraph", result.build.success ? "all keys peel; reverse order assigns slots" : "a nonempty core blocks this seed");
    var plot = { x: box.x + 22, y: box.y + 58, w: box.w - 44, h: box.h - 91 };
    var s = result.segmentSize;
    for (var part = 0; part < 3; part += 1) {
      var x = plot.x + plot.w * (0.16 + part * 0.34);
      ctx.strokeStyle = "rgba(100, 116, 139, 0.22)";
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      label(ctx, "h" + part, x, plot.y - 12, { align: "center", color: COLORS.muted, size: 10, weight: "750" });
      for (var i = 0; i < s; i += Math.max(1, Math.ceil(s / 42))) {
        var p = slotPoint(part * s + i, result, plot);
        ctx.fillStyle = COLORS.slot;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    var core = {};
    result.build.mapping.coreEdges.forEach(function (edge) { core[edge.id] = true; });
    var edges = result.build.mapping.edges;
    var drawLimit = Math.min(edges.length, box.w < 460 ? 95 : 150);
    for (var e = 0; e < drawLimit; e += 1) {
      var edge = edges[e];
      var p0 = slotPoint(edge.locs[0], result, plot);
      var p1 = slotPoint(edge.locs[1], result, plot);
      var p2 = slotPoint(edge.locs[2], result, plot);
      ctx.strokeStyle = core[edge.id] ? "rgba(190, 18, 60, 0.74)" : COLORS.edge;
      ctx.lineWidth = core[edge.id] ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    label(ctx, result.build.mapping.stack.length + " peeled / " + result.params.keys + " keys", plot.x, box.y + box.h - 24, { color: COLORS.peeled, size: 12, weight: "800" });
    label(ctx, result.build.mapping.coreEdges.length + " core edges", plot.x + plot.w, box.y + box.h - 24, { align: "right", color: result.build.mapping.coreEdges.length ? COLORS.core : COLORS.good, size: 12, weight: "800" });
  }

  function drawPeelTrace(ctx, box, result) {
    panel(ctx, box, "peeling ledger", "degree-one slots remove one equation at a time");
    var plot = { x: box.x + 42, y: box.y + 64, w: box.w - 64, h: box.h - 96 };
    var trace = result.build.mapping.trace;
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    for (var g = 0; g <= 4; g += 1) {
      var y = plot.y + plot.h * g / 4;
      ctx.strokeStyle = "rgba(100, 116, 139, 0.14)";
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    function xScale(i) { return plot.x + i / Math.max(1, trace.length - 1) * plot.w; }
    function yScale(rem) { return plot.y + plot.h - rem / result.params.keys * plot.h; }
    ctx.strokeStyle = COLORS.peeled;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    trace.forEach(function (row, i) {
      var x = xScale(i);
      var y = yScale(row.remaining);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (result.build.mapping.coreEdges.length) {
      var coreY = yScale(result.build.mapping.coreEdges.length);
      ctx.strokeStyle = COLORS.core;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(plot.x, coreY);
      ctx.lineTo(plot.x + plot.w, coreY);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, "core", plot.x + plot.w - 4, coreY - 8, { align: "right", color: COLORS.core, size: 10, weight: "800" });
    }
    label(ctx, "remaining keys", box.x + 14, plot.y - 12, { color: COLORS.muted, size: 10 });
    label(ctx, "peel steps", plot.x + plot.w, box.y + box.h - 20, { align: "right", color: COLORS.muted, size: 10 });
  }

  function drawTable(ctx, box, result) {
    panel(ctx, box, "xor table", result.build.success ? "three stored values reproduce each key fingerprint" : "no assignment until the core peels");
    var plot = { x: box.x + 16, y: box.y + 58, w: box.w - 32, h: box.h - 86 };
    var table = result.build.table || [];
    var cols = Math.ceil(Math.sqrt(result.capacity * plot.w / Math.max(1, plot.h)));
    var rows = Math.ceil(result.capacity / cols);
    var cell = Math.min(plot.w / cols, plot.h / rows);
    var offsetX = plot.x + (plot.w - cols * cell) / 2;
    for (var i = 0; i < result.capacity; i += 1) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var x = offsetX + col * cell;
      var y = plot.y + row * cell;
      var value = table[i] || 0;
      var segment = Math.floor(i / result.segmentSize);
      var hue = segment === 0 ? COLORS.table : (segment === 1 ? COLORS.xor : COLORS.amber);
      ctx.fillStyle = result.build.success ? shade(hue, value / Math.max(1, Math.pow(2, result.params.bits) - 1)) : "#eef2f5";
      ctx.fillRect(x, y, Math.max(1, cell - 1), Math.max(1, cell - 1));
    }
    label(ctx, result.capacity + " slots x " + result.params.bits + " bits", plot.x, box.y + box.h - 22, { color: COLORS.table, size: 12, weight: "800" });
    label(ctx, formatNumber(result.bitsPerKey, 2) + " bits/key", plot.x + plot.w, box.y + box.h - 22, { align: "right", color: COLORS.text, size: 12, weight: "800" });
  }

  function shade(hex, t) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    var mix = 0.18 + 0.72 * t;
    r = Math.round(255 * (1 - mix) + r * mix);
    g = Math.round(255 * (1 - mix) + g * mix);
    b = Math.round(255 * (1 - mix) + b * mix);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawSweep(ctx, box, result) {
    panel(ctx, box, "one-seed build success", "more slack leaves fewer unpeelable cores");
    var plot = { x: box.x + 42, y: box.y + 62, w: box.w - 62, h: box.h - 96 };
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    for (var g = 0; g <= 4; g += 1) {
      var y = plot.y + plot.h * g / 4;
      ctx.strokeStyle = "rgba(100, 116, 139, 0.14)";
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, formatPercent(1 - g / 4, 0), plot.x - 8, y, { align: "right", color: COLORS.muted, size: 9 });
    }
    var rows = result.sweep;
    var barW = plot.w / rows.length * 0.68;
    rows.forEach(function (row, i) {
      var x = plot.x + (i + 0.5) / rows.length * plot.w;
      var h = row.successRate * plot.h;
      ctx.fillStyle = Math.abs(row.overhead - result.params.overhead) < 0.1 ? COLORS.xor : "rgba(124, 58, 237, 0.32)";
      ctx.fillRect(x - barW / 2, plot.y + plot.h - h, barW, h);
      if (i % 2 === 0) label(ctx, String(row.overhead), x, plot.y + plot.h + 13, { align: "center", color: COLORS.muted, size: 9 });
    });
    label(ctx, "overhead %", plot.x + plot.w, box.y + box.h - 18, { align: "right", color: COLORS.muted, size: 10 });
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (width < 560) {
      var gap = 14;
      var h1 = 360;
      var h2 = 190;
      var h3 = 190;
      drawHypergraph(ctx, { x: 0, y: 0, w: width, h: h1 }, result);
      drawPeelTrace(ctx, { x: 0, y: h1 + gap, w: width, h: h2 }, result);
      drawTable(ctx, { x: 0, y: h1 + h2 + 2 * gap, w: width, h: h3 }, result);
      drawSweep(ctx, { x: 0, y: h1 + h2 + h3 + 3 * gap, w: width, h: height - h1 - h2 - h3 - 3 * gap }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.58);
      var upperH = Math.round(height * 0.58);
      drawHypergraph(ctx, { x: 0, y: 0, w: leftW, h: height }, result);
      drawPeelTrace(ctx, { x: leftW + gap2, y: 0, w: width - leftW - gap2, h: Math.round((upperH - gap2) * 0.48) }, result);
      drawTable(ctx, { x: leftW + gap2, y: Math.round((upperH - gap2) * 0.48) + gap2, w: width - leftW - gap2, h: upperH - Math.round((upperH - gap2) * 0.48) - gap2 }, result);
      drawSweep(ctx, { x: leftW + gap2, y: upperH + gap2, w: width - leftW - gap2, h: height - upperH - gap2 }, result);
    }
  }

  function render(root) {
    var params = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(params);
    var values = {
      keys: String(result.params.keys),
      overhead: result.params.overhead + "%",
      bits: String(result.params.bits),
      retries: String(result.params.retries),
      trials: String(result.params.trials),
      seed: String(result.params.seed)
    };
    Object.keys(values).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && input.value !== String(result.params[key])) input.value = String(result.params[key]);
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    var core = result.build.mapping.coreEdges.length;
    if (metrics) {
      metrics.innerHTML = [
        metric("Build", result.build.success ? "success in " + result.build.attemptNumber : "core remains"),
        metric("Peeled keys", result.build.mapping.stack.length + " / " + result.params.keys),
        metric("Core edges", String(core)),
        metric("Observed FPR", result.build.success ? formatPercent(result.build.falsePositiveRate, 2) : "n/a"),
        metric("Target FPR", formatPercent(result.targetFpr, 2)),
        metric("Bits/key", formatNumber(result.bitsPerKey, 2)),
        metric("Audit", result.audit.passed ? "passed" : "check")
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__xorFilterResult = result;
  }

  function init(root) {
    if (!root || root.__xorFilterReady) return;
    root.__xorFilterReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-xor-filter-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    buildOnce: buildOnce,
    evaluate: evaluate,
    fingerprint: fingerprint,
    locations: locations,
    peel: peel,
    queryKey: queryKey
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.XorFilterLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
