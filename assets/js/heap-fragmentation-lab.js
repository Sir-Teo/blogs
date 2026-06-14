(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    active: "#0f766e",
    waste: "#d97706",
    free: "#e6edf4",
    cached: "#7c3aed",
    first: "#2563eb",
    best: "#0f766e",
    classes: "#b45309",
    tcache: "#7c3aed",
    live: "#172026"
  };

  var DEFAULTS = {
    handoff: 65,
    liveSet: 100,
    operations: 1500,
    phaseShift: 80,
    seed: 39,
    smallBias: 45,
    threads: 4
  };

  var POLICIES = [
    { key: "first", name: "first fit", color: COLORS.first, classed: false, placement: "first", cache: false },
    { key: "best", name: "best fit", color: COLORS.best, classed: false, placement: "best", cache: false },
    { key: "classes", name: "size classes", color: COLORS.classes, classed: true, placement: "best", cache: false },
    { key: "tcache", name: "private caches", color: COLORS.tcache, classed: true, placement: "best", cache: true }
  ];

  var ALIGNMENT = 16;
  var PAGE = 4096;
  var MIN_SPLIT = 32;
  var CACHE_LIMIT = 1;

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
      handoff: snap(raw.handoff, DEFAULTS.handoff, 0, 100, 1) / 100,
      liveSet: snap(raw.liveSet, DEFAULTS.liveSet, 40, 360, 10),
      operations: snap(raw.operations, DEFAULTS.operations, 300, 3200, 50),
      phaseShift: snap(raw.phaseShift, DEFAULTS.phaseShift, 0, 100, 1) / 100,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1),
      smallBias: snap(raw.smallBias, DEFAULTS.smallBias, 5, 95, 1) / 100,
      threads: snap(raw.threads, DEFAULTS.threads, 1, 8, 1)
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

  function align(value) {
    return Math.max(ALIGNMENT, Math.ceil(value / ALIGNMENT) * ALIGNMENT);
  }

  function sizeClass(value) {
    var aligned = align(value);
    var classes = [
      16, 32, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256,
      320, 384, 448, 512, 640, 768, 896, 1024, 1280, 1536,
      1792, 2048, 2560, 3072, 3584, 4096
    ];
    for (var i = 0; i < classes.length; i += 1) {
      if (aligned <= classes[i]) return classes[i];
    }
    return Math.ceil(aligned / PAGE) * PAGE;
  }

  function formatBytes(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1048576) return (value / 1048576).toFixed(2) + " MiB";
    if (Math.abs(value) >= 1024) return (value / 1024).toFixed(1) + " KiB";
    return Math.round(value) + " B";
  }

  function formatRatio(value) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(2) + "x";
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="heap-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function pickIndex(items, rand) {
    return Math.floor(rand() * items.length);
  }

  function sampleFrom(items, rand) {
    return items[pickIndex(items, rand)];
  }

  function sampleRequestSize(params, step, rand) {
    var progress = step / Math.max(1, params.operations - 1);
    var afterTurn = progress > 0.47 ? (progress - 0.47) / 0.53 : 0;
    var smallProbability = clamp(params.smallBias - params.phaseShift * 0.62 * afterTurn, 0.05, 0.95);
    var awkward = rand() < 0.45 ? Math.floor(rand() * 11) : 0;

    if (rand() < smallProbability) {
      return sampleFrom([18, 24, 28, 32, 36, 40, 48, 56, 64, 72, 88, 96, 112], rand) + awkward;
    }

    if (rand() < 0.72) {
      return sampleFrom([128, 144, 160, 176, 192, 224, 256, 288, 320, 384, 448, 512], rand) + 2 * awkward;
    }

    return sampleFrom([640, 768, 896, 1024, 1280, 1536, 1792, 2048], rand) + 4 * awkward;
  }

  function sampleLifetime(params, rand) {
    var shortSpan = Math.max(8, Math.round(params.liveSet * 0.34));
    var longSpan = Math.max(40, Math.round(params.liveSet * 1.4));
    if (rand() < 0.68) return 4 + Math.floor(rand() * shortSpan);
    return shortSpan + Math.floor(rand() * longSpan);
  }

  function chooseFreeIndex(active, step, rand) {
    var due = [];
    for (var i = 0; i < active.length; i += 1) {
      if (active[i].expires <= step) due.push(i);
    }
    if (due.length) return due[pickIndex(due, rand)];
    return pickIndex(active, rand);
  }

  function generateTrace(raw) {
    var params = cleanParams(raw);
    var rand = makeRng(params.seed * 8191 + params.operations * 17 + params.threads * 131);
    var active = [];
    var events = [];
    var nextId = 1;
    var handoffFrees = 0;
    var allocBytes = 0;
    var maxLiveObjects = 0;

    for (var step = 0; step < params.operations; step += 1) {
      var forcedFree = active.length > 0 && active.some(function (item) { return item.expires <= step; }) && rand() < 0.78;
      var overTarget = active.length > params.liveSet && rand() < 0.84;
      var randomFree = active.length > params.liveSet * 0.45 && rand() < 0.18;

      if ((forcedFree || overTarget || randomFree) && active.length) {
        var index = chooseFreeIndex(active, step, rand);
        var object = active[index];
        active[index] = active[active.length - 1];
        active.pop();
        var freeThread = object.thread;
        if (params.threads > 1 && rand() < params.handoff) {
          freeThread = (object.thread + 1 + Math.floor(rand() * (params.threads - 1))) % params.threads;
          handoffFrees += 1;
        }
        events.push({
          freeThread: freeThread,
          id: object.id,
          kind: "free",
          ownerThread: object.thread,
          step: step
        });
      } else {
        var thread = Math.floor(rand() * params.threads);
        var request = sampleRequestSize(params, step, rand);
        var lifetime = sampleLifetime(params, rand);
        var id = nextId;
        nextId += 1;
        active.push({ expires: step + lifetime, id: id, request: request, thread: thread });
        allocBytes += request;
        maxLiveObjects = Math.max(maxLiveObjects, active.length);
        events.push({
          id: id,
          kind: "alloc",
          request: request,
          step: step,
          thread: thread
        });
      }
    }

    return {
      events: events,
      stats: {
        allocations: nextId - 1,
        allocBytes: allocBytes,
        frees: events.filter(function (event) { return event.kind === "free"; }).length,
        handoffFrees: handoffFrees,
        maxLiveObjects: maxLiveObjects
      },
      params: params
    };
  }

  function makeState(policy, params) {
    var caches = [];
    for (var i = 0; i < params.threads; i += 1) caches.push(new Map());
    return {
      active: new Map(),
      blocks: [],
      caches: caches,
      committed: 0,
      policy: policy
    };
  }

  function extendHeap(state, needed) {
    var amount = Math.max(PAGE, Math.ceil(needed / PAGE) * PAGE);
    var block = {
      size: amount,
      start: state.committed,
      status: "free"
    };
    state.blocks.push(block);
    state.committed += amount;
    return block;
  }

  function findFit(state, size) {
    var blocks = state.blocks;
    var bestIndex = -1;
    var bestSize = Infinity;
    for (var i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      if (block.status !== "free" || block.size < size) continue;
      if (state.policy.placement === "first") return i;
      if (block.size < bestSize) {
        bestSize = block.size;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function allocateFromFreeBlock(state, index, id, request, reserved, thread) {
    var block = state.blocks[index];
    var leftover = block.size - reserved;
    var allocatedSize = block.size;

    if (leftover >= MIN_SPLIT) {
      allocatedSize = reserved;
      var rest = {
        size: leftover,
        start: block.start + reserved,
        status: "free"
      };
      block.size = reserved;
      state.blocks.splice(index + 1, 0, rest);
    }

    block.status = "active";
    block.id = id;
    block.request = request;
    block.reserved = allocatedSize;
    block.thread = thread;
    state.active.set(id, block);
    return block;
  }

  function allocateCentral(state, event) {
    var request = event.request;
    var reserved = state.policy.classed ? sizeClass(request) : align(request);
    var index = findFit(state, reserved);
    if (index < 0) {
      extendHeap(state, reserved);
      index = findFit(state, reserved);
    }
    return allocateFromFreeBlock(state, index, event.id, request, reserved, event.thread);
  }

  function cacheListFor(state, thread, size) {
    var cache = state.caches[thread];
    var list = cache.get(size);
    if (!list) {
      list = [];
      cache.set(size, list);
    }
    return list;
  }

  function allocateWithCache(state, event) {
    var reserved = sizeClass(event.request);
    var list = cacheListFor(state, event.thread, reserved);
    if (list.length) {
      var block = list.pop();
      block.status = "active";
      block.id = event.id;
      block.request = event.request;
      block.reserved = block.size;
      block.thread = event.thread;
      block.cacheThread = null;
      state.active.set(event.id, block);
      return block;
    }
    return allocateCentral(state, event);
  }

  function mergeAround(state, index) {
    var blocks = state.blocks;
    if (index > 0 && blocks[index - 1].status === "free") {
      blocks[index - 1].size += blocks[index].size;
      blocks.splice(index, 1);
      index -= 1;
    }
    if (index + 1 < blocks.length && blocks[index + 1].status === "free") {
      blocks[index].size += blocks[index + 1].size;
      blocks.splice(index + 1, 1);
    }
  }

  function releaseBlockToCentral(state, block) {
    block.status = "free";
    block.id = null;
    block.request = 0;
    block.reserved = 0;
    block.thread = null;
    block.cacheThread = null;
    var index = state.blocks.indexOf(block);
    if (index >= 0) mergeAround(state, index);
  }

  function freeCentral(state, event) {
    var block = state.active.get(event.id);
    if (!block) return;
    state.active.delete(event.id);
    releaseBlockToCentral(state, block);
  }

  function freeWithCache(state, event) {
    var block = state.active.get(event.id);
    if (!block) return;
    state.active.delete(event.id);
    block.status = "cached";
    block.id = null;
    block.request = 0;
    block.reserved = 0;
    block.cacheThread = event.freeThread;
    var list = cacheListFor(state, event.freeThread, block.size);
    list.push(block);
    if (list.length > CACHE_LIMIT) {
      var drained = list.shift();
      releaseBlockToCentral(state, drained);
    }
  }

  function applyEvent(state, event) {
    if (event.kind === "alloc") {
      if (state.policy.cache) allocateWithCache(state, event);
      else allocateCentral(state, event);
    } else if (state.policy.cache) {
      freeWithCache(state, event);
    } else {
      freeCentral(state, event);
    }
  }

  function summarizeState(state) {
    var activeBytes = 0;
    var cachedBytes = 0;
    var freeBytes = 0;
    var internalWaste = 0;
    var largestFree = 0;
    var liveRequested = 0;

    state.blocks.forEach(function (block) {
      if (block.status === "active") {
        liveRequested += block.request;
        activeBytes += block.size;
        internalWaste += Math.max(0, block.size - block.request);
      } else if (block.status === "cached") {
        cachedBytes += block.size;
      } else if (block.status === "free") {
        freeBytes += block.size;
        largestFree = Math.max(largestFree, block.size);
      }
    });

    var slack = freeBytes + cachedBytes;
    return {
      activeBytes: activeBytes,
      cachedBytes: cachedBytes,
      committed: state.committed,
      external: freeBytes > 0 ? 1 - largestFree / freeBytes : 0,
      footprint: liveRequested > 0 ? state.committed / liveRequested : 1,
      freeBytes: freeBytes,
      internalWaste: internalWaste,
      largestFree: largestFree,
      liveRequested: liveRequested,
      privateSlack: slack > 0 ? cachedBytes / slack : 0
    };
  }

  function simulatePolicy(trace, policy, params) {
    var state = makeState(policy, params);
    var snapshots = [];
    var sampleEvery = Math.max(1, Math.floor(trace.events.length / 80));
    var peakCommitted = 0;
    var peakLive = 0;
    var peakFootprint = 1;

    for (var i = 0; i < trace.events.length; i += 1) {
      applyEvent(state, trace.events[i]);
      var summary = summarizeState(state);
      peakCommitted = Math.max(peakCommitted, summary.committed);
      peakLive = Math.max(peakLive, summary.liveRequested);
      if (summary.liveRequested > params.liveSet * 16) {
        peakFootprint = Math.max(peakFootprint, summary.footprint);
      }
      if (i % sampleEvery === 0 || i === trace.events.length - 1) {
        snapshots.push({
          cachedBytes: summary.cachedBytes,
          committed: summary.committed,
          external: summary.external,
          freeBytes: summary.freeBytes,
          liveRequested: summary.liveRequested,
          step: i
        });
      }
    }

    var finalSummary = summarizeState(state);
    return {
      blocks: state.blocks.map(function (block) {
        return {
          cacheThread: block.cacheThread,
          request: block.request || 0,
          size: block.size,
          start: block.start,
          status: block.status,
          thread: block.thread
        };
      }),
      color: policy.color,
      final: finalSummary,
      key: policy.key,
      name: policy.name,
      peaks: {
        committed: peakCommitted,
        footprint: peakLive > 0 ? peakCommitted / peakLive : 1,
        localFootprint: peakFootprint,
        live: peakLive
      },
      snapshots: snapshots
    };
  }

  function evaluate(raw) {
    var trace = generateTrace(raw);
    var params = trace.params;
    var policies = POLICIES.map(function (policy) {
      return simulatePolicy(trace, policy, params);
    });
    var byKey = {};
    policies.forEach(function (policy) { byKey[policy.key] = policy; });
    return {
      params: params,
      policies: policies,
      policyByKey: byKey,
      trace: trace.stats
    };
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || 720));
    var height = Math.max(620, Math.round(rect.height || canvas.clientHeight || 820));
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

  function drawPanel(ctx, x, y, w, h, title) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, x + 12, y + 22, { size: 12, weight: 760 });
  }

  function drawHeapMaps(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "final heap maps");
    var maxCommitted = Math.max.apply(null, result.policies.map(function (policy) {
      return policy.final.committed;
    }));
    var left = x + 118;
    var right = x + w - 14;
    var rowH = Math.max(20, Math.min(34, (h - 48) / result.policies.length - 8));
    var top = y + 42;

    result.policies.forEach(function (policy, row) {
      var yy = top + row * (rowH + 13);
      text(ctx, policy.name, x + 12, yy + rowH * 0.64, { color: policy.color, size: 12, weight: 760 });
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(left, yy, right - left, rowH);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, yy, right - left, rowH);

      policy.blocks.forEach(function (block) {
        var bx = left + (block.start / maxCommitted) * (right - left);
        var bw = Math.max(0.75, (block.size / maxCommitted) * (right - left));
        if (block.status === "free") {
          ctx.fillStyle = COLORS.free;
          ctx.fillRect(bx, yy, bw, rowH);
          return;
        }
        if (block.status === "cached") {
          ctx.fillStyle = COLORS.cached;
          ctx.globalAlpha = 0.82;
          ctx.fillRect(bx, yy, bw, rowH);
          ctx.globalAlpha = 1;
          return;
        }
        var usedW = Math.max(0.5, (Math.min(block.request, block.size) / block.size) * bw);
        ctx.fillStyle = COLORS.active;
        ctx.fillRect(bx, yy, usedW, rowH);
        if (usedW < bw) {
          ctx.fillStyle = COLORS.waste;
          ctx.fillRect(bx + usedW, yy, bw - usedW, rowH);
        }
      });
    });

    var legendY = y + h - 13;
    var legend = [
      ["live request", COLORS.active],
      ["rounding/waste", COLORS.waste],
      ["free hole", COLORS.free],
      ["private cache", COLORS.cached]
    ];
    var lx = x + 12;
    legend.forEach(function (item) {
      ctx.fillStyle = item[1];
      ctx.fillRect(lx, legendY - 8, 9, 9);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(lx, legendY - 8, 9, 9);
      text(ctx, item[0], lx + 14, legendY, { color: COLORS.muted, size: 11 });
      lx += 106;
    });
  }

  function drawSeries(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "footprint through the trace");
    var left = x + 48;
    var top = y + 42;
    var plotW = w - 70;
    var plotH = h - 70;
    var maxY = 1;
    result.policies.forEach(function (policy) {
      policy.snapshots.forEach(function (point) {
        maxY = Math.max(maxY, point.committed, point.liveRequested);
      });
    });

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    for (var gy = 0; gy <= 3; gy += 1) {
      var yy = top + plotH * gy / 3;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(left + plotW, yy);
      ctx.stroke();
    }

    function mapX(step) {
      return left + plotW * step / Math.max(1, result.params.operations - 1);
    }
    function mapY(value) {
      return top + plotH - plotH * value / maxY;
    }

    var liveSnapshots = result.policies[0].snapshots;
    ctx.strokeStyle = COLORS.live;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    liveSnapshots.forEach(function (point, i) {
      var px = mapX(point.step);
      var py = mapY(point.liveRequested);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    result.policies.forEach(function (policy) {
      ctx.strokeStyle = policy.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      policy.snapshots.forEach(function (point, i) {
        var px = mapX(point.step);
        var py = mapY(point.committed);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });

    text(ctx, formatBytes(maxY), left - 6, top + 4, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "0", left - 6, top + plotH, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "live bytes", left + 8, top + 14, { color: COLORS.live, size: 10 });
    text(ctx, "committed bytes", left + 8, top + 29, { color: COLORS.muted, size: 10 });
  }

  function drawLedger(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "where the final bytes are");
    var left = x + 112;
    var top = y + 42;
    var barH = Math.max(22, Math.min(32, (h - 56) / result.policies.length - 9));
    var maxCommitted = Math.max.apply(null, result.policies.map(function (policy) {
      return policy.final.committed;
    }));

    result.policies.forEach(function (policy, i) {
      var yy = top + i * (barH + 13);
      var final = policy.final;
      var scale = (w - 136) / maxCommitted;
      var cursor = left;
      var pieces = [
        [final.liveRequested, COLORS.active],
        [final.internalWaste, COLORS.waste],
        [final.freeBytes, COLORS.free],
        [final.cachedBytes, COLORS.cached]
      ];

      text(ctx, policy.name, x + 12, yy + barH * 0.65, { color: policy.color, size: 12, weight: 760 });
      pieces.forEach(function (piece) {
        var bw = piece[0] * scale;
        if (bw <= 0) return;
        ctx.fillStyle = piece[1];
        ctx.fillRect(cursor, yy, Math.max(0.75, bw), barH);
        cursor += bw;
      });
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, yy, Math.max(1, final.committed * scale), barH);
      text(ctx, formatRatio(final.footprint), left + final.committed * scale + 7, yy + barH * 0.65, { color: COLORS.muted, size: 11 });
    });
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    var pad = width < 620 ? 10 : 14;
    if (width < 620) {
      drawHeapMaps(ctx, result, pad, pad, width - 2 * pad, height * 0.35);
      drawSeries(ctx, result, pad, height * 0.37, width - 2 * pad, height * 0.29);
      drawLedger(ctx, result, pad, height * 0.68, width - 2 * pad, height * 0.29);
    } else {
      drawHeapMaps(ctx, result, pad, pad, width - 2 * pad, height * 0.36);
      drawSeries(ctx, result, pad, height * 0.40, width - 2 * pad, height * 0.29);
      drawLedger(ctx, result, pad, height * 0.72, width - 2 * pad, height * 0.25);
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
      handoff: formatPercent(params.handoff, 0),
      liveSet: String(params.liveSet),
      operations: String(params.operations),
      phaseShift: formatPercent(params.phaseShift, 0),
      seed: String(params.seed),
      smallBias: formatPercent(params.smallBias, 0),
      threads: String(params.threads)
    };
    Object.keys(labels).forEach(function (key) {
      var out = container.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(container) {
    var raw = readParams(container);
    var result = evaluate(raw);
    var params = result.params;
    syncOutputs(container, params);
    var metrics = container.querySelector("[data-heap-metrics]");
    var canvas = container.querySelector("canvas");
    var best = result.policyByKey.best.final;
    var first = result.policyByKey.first.final;
    var classes = result.policyByKey.classes.final;
    var tcache = result.policyByKey.tcache.final;
    var handoffRate = result.trace.frees > 0 ? result.trace.handoffFrees / result.trace.frees : 0;

    if (metrics) {
      metrics.innerHTML = [
        metric("best-fit footprint", formatRatio(best.footprint)),
        metric("first-fit penalty", formatBytes(Math.max(0, first.committed - best.committed))),
        metric("size-class waste", formatPercent(classes.internalWaste / Math.max(1, classes.liveRequested), 1)),
        metric("private cache slack", formatPercent(tcache.cachedBytes / Math.max(1, tcache.committed), 1)),
        metric("largest best-fit hole", formatBytes(best.largestFree)),
        metric("cross-thread frees", formatPercent(handoffRate, 0))
      ].join("");
    }

    if (canvas) draw(result, canvas);
    container.__heapFragmentationResult = result;
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
    root.document.querySelectorAll("[data-heap-fragmentation-lab]").forEach(init);
  }

  root.HeapFragmentationLab = {
    align: align,
    cleanParams: cleanParams,
    evaluate: evaluate,
    generateTrace: generateTrace,
    sizeClass: sizeClass
  };

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
