(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    loop: "#0f766e",
    delay: "#2563eb",
    blocker: "#be123c",
    cap: "#7c3aed",
    shed: "#64748b",
    worker: "#b45309",
    io: "#0891b2",
    white: "#ffffff"
  };

  var DEFAULTS = {
    arrivalRate: 150,
    cpuMs: 2.4,
    heavyCpuMs: 48,
    heavyShare: 4,
    ioMs: 35,
    policy: "queue",
    queueLimit: 90,
    seed: 17,
    workerThreads: 0
  };

  var POLICIES = ["queue", "shed"];
  var HORIZON_MS = 8500;
  var DRAIN_MS = 5000;
  var BUCKET_MS = 250;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function nearest(value, allowed, fallback) {
    value = String(value == null ? fallback : value);
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function numberParam(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      arrivalRate: Math.round(clamp(numberParam(raw, "arrivalRate"), 20, 260)),
      cpuMs: Math.round(clamp(numberParam(raw, "cpuMs"), 0.4, 8) * 10) / 10,
      heavyCpuMs: Math.round(clamp(numberParam(raw, "heavyCpuMs"), 8, 120)),
      heavyShare: Math.round(clamp(numberParam(raw, "heavyShare"), 0, 25)),
      ioMs: Math.round(clamp(numberParam(raw, "ioMs"), 5, 140)),
      policy: nearest(raw.policy, POLICIES, DEFAULTS.policy),
      queueLimit: Math.round(clamp(numberParam(raw, "queueLimit"), 8, 240)),
      seed: Math.round(clamp(numberParam(raw, "seed"), 1, 999)),
      workerThreads: Math.round(clamp(numberParam(raw, "workerThreads"), 0, 4))
    };
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rng) {
    var u = Math.max(1e-9, rng());
    var v = Math.max(1e-9, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function logNormalMean(mean, sigma, rng) {
    var mu = Math.log(Math.max(1e-6, mean)) - sigma * sigma / 2;
    return Math.exp(mu + sigma * normal(rng));
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = clamp(Math.ceil(p * sorted.length) - 1, 0, sorted.length - 1);
    return sorted[index];
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function formatMs(value) {
    if (!Number.isFinite(value)) return "n/a";
    if (value >= 1000) return (value / 1000).toFixed(2) + " s";
    if (value >= 100) return value.toFixed(0) + " ms";
    if (value >= 10) return value.toFixed(1) + " ms";
    return value.toFixed(2) + " ms";
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(value < 10 ? 1 : 0) + "%";
  }

  function metric(label, value) {
    return '<div class="event-loop-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function binaryInsert(events, event) {
    var lo = 0;
    var hi = events.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      var other = events[mid];
      if (other.ready < event.ready || (other.ready === event.ready && other.seq < event.seq)) lo = mid + 1;
      else hi = mid;
    }
    events.splice(lo, 0, event);
  }

  function makeRequest(id, arrival, rng, params) {
    var heavy = rng() < params.heavyShare / 100;
    var io = clamp(logNormalMean(params.ioMs, 0.55, rng), 1, params.ioMs * 8);
    var baseCpu = clamp(logNormalMean(params.cpuMs, 0.38, rng), 0.08, params.cpuMs * 5);
    var heavyCpu = heavy ? params.heavyCpuMs * (0.78 + 0.44 * rng()) : 0;
    return {
      arrival: arrival,
      baseCpu: baseCpu,
      completedAt: null,
      droppedAt: null,
      heavy: heavy,
      heavyCpu: heavyCpu,
      id: id,
      io: io,
      offloaded: false,
      workerWait: 0
    };
  }

  function generateRequests(params) {
    var rng = makeRng(1009 + params.seed * 131 + params.arrivalRate * 17 + params.heavyShare * 43 + params.heavyCpuMs * 7);
    var requests = [];
    var t = 0;
    while (t < HORIZON_MS) {
      var u = Math.max(1e-9, rng());
      t += -Math.log(u) * 1000 / params.arrivalRate;
      if (t >= HORIZON_MS) break;
      requests.push(makeRequest(requests.length, t, rng, params));
      if (rng() < 0.025) {
        var burst = 1 + Math.floor(rng() * 4);
        for (var b = 0; b < burst; b += 1) {
          var bt = t + rng() * 14;
          if (bt < HORIZON_MS) requests.push(makeRequest(requests.length, bt, rng, params));
        }
      }
    }
    requests.sort(function (a, b) { return a.arrival - b.arrival; });
    requests.forEach(function (req, index) { req.id = index; });
    return requests;
  }

  function backlogAt(intervals, ready) {
    var count = 0;
    for (var i = intervals.length - 1; i >= 0; i -= 1) {
      if (intervals[i].end <= ready) break;
      if (intervals[i].end > ready) count += 1;
    }
    return count;
  }

  function earliestWorker(workerFree) {
    var best = 0;
    for (var i = 1; i < workerFree.length; i += 1) {
      if (workerFree[i] < workerFree[best]) best = i;
    }
    return best;
  }

  function bucketStats(values) {
    return {
      max: values.length ? Math.max.apply(null, values) : 0,
      mean: mean(values),
      p95: percentile(values, 0.95)
    };
  }

  function buildTrace(intervals, requests, params, lastTime) {
    var buckets = [];
    var bucketCount = Math.max(1, Math.ceil(lastTime / BUCKET_MS));
    for (var i = 0; i < bucketCount; i += 1) {
      buckets.push({
        completions: 0,
        depth: 0,
        delayValues: [],
        dropped: 0,
        heavyReady: 0,
        ready: 0,
        t: i * BUCKET_MS
      });
    }

    intervals.forEach(function (interval) {
      var bi = clamp(Math.floor(interval.ready / BUCKET_MS), 0, buckets.length - 1);
      buckets[bi].ready += 1;
      buckets[bi].delayValues.push(interval.start - interval.ready);
      if (interval.heavy && interval.type === "handler") buckets[bi].heavyReady += 1;
    });

    requests.forEach(function (req) {
      if (req.completedAt != null) {
        var ci = clamp(Math.floor(req.completedAt / BUCKET_MS), 0, buckets.length - 1);
        buckets[ci].completions += 1;
      }
      if (req.droppedAt != null) {
        var di = clamp(Math.floor(req.droppedAt / BUCKET_MS), 0, buckets.length - 1);
        buckets[di].dropped += 1;
      }
    });

    for (var b = 0; b < buckets.length; b += 1) {
      var start = buckets[b].t;
      var end = start + BUCKET_MS;
      var maxDepth = 0;
      for (var s = 0; s < 5; s += 1) {
        var t = start + (s + 0.5) * BUCKET_MS / 5;
        var depth = 0;
        for (var j = 0; j < intervals.length; j += 1) {
          if (intervals[j].ready <= t && intervals[j].end > t) depth += 1;
        }
        maxDepth = Math.max(maxDepth, depth);
      }
      buckets[b].depth = maxDepth;
      buckets[b].delay = bucketStats(buckets[b].delayValues);
      buckets[b].mid = (start + end) / 2;
    }
    return buckets;
  }

  function latencyHistogram(values, bins) {
    var p99 = percentile(values, 0.99);
    var maxValue = Math.max(40, p99 * 1.25, percentile(values, 0.95) + 20);
    var rows = [];
    for (var i = 0; i < bins; i += 1) rows.push({ lo: maxValue * i / bins, hi: maxValue * (i + 1) / bins, count: 0 });
    values.forEach(function (value) {
      var index = clamp(Math.floor(value / maxValue * bins), 0, bins - 1);
      rows[index].count += 1;
    });
    return { maxValue: maxValue, rows: rows };
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var requests = generateRequests(params);
    var events = [];
    var seq = 0;
    var intervals = [];
    var workerFree = [];
    var workerIntervals = [];
    var dropped = 0;
    var loopCpu = 0;
    var loopFree = 0;
    var workerWaits = [];

    for (var w = 0; w < params.workerThreads; w += 1) workerFree.push(0);
    requests.forEach(function (req) {
      binaryInsert(events, { ready: req.arrival + req.io, req: req, seq: seq += 1, type: "handler" });
    });

    while (events.length) {
      var event = events.shift();
      if (event.ready > HORIZON_MS + DRAIN_MS && event.type === "handler") {
        event.req.droppedAt = event.ready;
        dropped += 1;
        continue;
      }

      if (event.type === "handler" && params.policy === "shed" && backlogAt(intervals, event.ready) >= params.queueLimit) {
        event.req.droppedAt = event.ready;
        dropped += 1;
        continue;
      }

      var req = event.req;
      var start = Math.max(loopFree, event.ready);
      var service = req.baseCpu;
      var finalCallback = false;
      if (event.type === "workerDone") {
        service = Math.max(0.35, req.baseCpu * 0.24 + 0.45);
        finalCallback = true;
      } else if (req.heavy && params.workerThreads > 0) {
        service = Math.max(0.35, req.baseCpu * 0.35 + 0.55);
      } else if (req.heavy) {
        service += req.heavyCpu;
      }
      var end = start + service;
      loopFree = end;
      loopCpu += service;
      intervals.push({
        end: end,
        heavy: req.heavy,
        ready: event.ready,
        reqId: req.id,
        service: service,
        start: start,
        type: event.type
      });

      if (event.type === "handler" && req.heavy && params.workerThreads > 0) {
        var workerIndex = earliestWorker(workerFree);
        var workerStart = Math.max(end, workerFree[workerIndex]);
        var workerEnd = workerStart + req.heavyCpu;
        req.offloaded = true;
        req.workerWait = workerStart - end;
        workerWaits.push(req.workerWait);
        workerFree[workerIndex] = workerEnd;
        workerIntervals.push({
          end: workerEnd,
          reqId: req.id,
          start: workerStart,
          worker: workerIndex
        });
        binaryInsert(events, { ready: workerEnd, req: req, seq: seq += 1, type: "workerDone" });
      } else if (event.type === "handler" || finalCallback) {
        req.completedAt = end;
      }
    }

    var completed = requests.filter(function (req) { return req.completedAt != null; });
    var heavyCompleted = completed.filter(function (req) { return req.heavy; });
    var normalCompleted = completed.filter(function (req) { return !req.heavy; });
    var offloaded = completed.filter(function (req) { return req.offloaded; });
    var latencies = completed.map(function (req) { return req.completedAt - req.arrival; });
    var heavyLatencies = heavyCompleted.map(function (req) { return req.completedAt - req.arrival; });
    var delayValues = intervals.map(function (interval) { return interval.start - interval.ready; });
    var serviceValues = intervals.map(function (interval) { return interval.service; });
    var lastLoopEnd = intervals.reduce(function (best, interval) { return Math.max(best, interval.end); }, HORIZON_MS);
    var lastWorkerEnd = workerIntervals.reduce(function (best, interval) { return Math.max(best, interval.end); }, 0);
    var lastTime = Math.min(Math.max(HORIZON_MS, lastLoopEnd, lastWorkerEnd), HORIZON_MS + DRAIN_MS);
    var trace = buildTrace(intervals, requests, params, lastTime);
    var maxDepth = trace.reduce(function (best, row) { return Math.max(best, row.depth); }, 0);
    var baseLoad = params.arrivalRate * (params.cpuMs + params.heavyShare / 100 * params.heavyCpuMs) / 1000;

    return {
      completed: completed,
      dropped: dropped,
      heavyCompleted: heavyCompleted,
      heavyLatencies: heavyLatencies,
      histogram: latencyHistogram(latencies, 26),
      intervals: intervals,
      lastTime: lastTime,
      latencies: latencies,
      maxDepth: maxDepth,
      normalCompleted: normalCompleted,
      offloaded: offloaded,
      params: params,
      requests: requests,
      serviceValues: serviceValues,
      stats: {
        arrivalCount: requests.length,
        baseLoopLoad: baseLoad,
        completedCount: completed.length,
        droppedCount: dropped,
        loopCpu: loopCpu,
        loopDelayMean: mean(delayValues),
        loopDelayP95: percentile(delayValues, 0.95),
        loopDelayP99: percentile(delayValues, 0.99),
        loopServiceP99: percentile(serviceValues, 0.99),
        loopUtilization: loopCpu / Math.max(1, lastLoopEnd),
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
        workerWaitP95: percentile(workerWaits, 0.95)
      },
      trace: trace,
      workerIntervals: workerIntervals,
      workerWaits: workerWaits
    };
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      raw[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    return raw;
  }

  function updateOutputs(root, params) {
    var display = {
      arrivalRate: params.arrivalRate + " / s",
      cpuMs: formatMs(params.cpuMs),
      heavyCpuMs: formatMs(params.heavyCpuMs),
      heavyShare: params.heavyShare + "%",
      ioMs: formatMs(params.ioMs),
      queueLimit: String(params.queueLimit),
      seed: String(params.seed),
      workerThreads: params.workerThreads === 0 ? "off" : String(params.workerThreads)
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")] || "";
    });
  }

  function renderMetrics(root, result) {
    var stats = result.stats;
    var shedRate = result.requests.length ? 100 * result.dropped / result.requests.length : 0;
    var html = [
      metric("completed", stats.completedCount + " / " + stats.arrivalCount),
      metric("shed", formatPercent(shedRate)),
      metric("p99 response", formatMs(stats.p99)),
      metric("p99 loop delay", formatMs(stats.loopDelayP99)),
      metric("max loop backlog", formatNumber(result.maxDepth)),
      metric("loop utilization", formatPercent(100 * stats.loopUtilization)),
      metric("worker p95 wait", result.params.workerThreads ? formatMs(stats.workerWaitP95) : "off")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
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
    return { ctx: ctx, height: targetHeight, width: width };
  }

  function roundRect(ctx, x, y, w, h, r) {
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

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(title, box.x + 13, box.y + 23);
  }

  function label(ctx, text, x, y, color, align, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "12px system-ui, -apple-system, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function drawGrid(ctx, plot) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h - i * plot.h / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawLine(ctx, rows, xFn, yFn, color, width) {
    if (!rows.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = xFn(row);
      var y = yFn(row);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawBacklog(ctx, result, box) {
    panel(ctx, box, "Ready callbacks serialize");
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 62, h: box.h - 82 };
    var maxDepth = Math.max(1, result.maxDepth, result.params.policy === "shed" ? result.params.queueLimit : 0);
    var maxReady = result.trace.reduce(function (best, row) { return Math.max(best, row.ready); }, 1);
    function sx(t) { return plot.x + clamp(t / result.lastTime, 0, 1) * plot.w; }
    function syDepth(v) { return plot.y + plot.h - clamp(v / maxDepth, 0, 1.05) * plot.h; }
    drawGrid(ctx, plot);

    result.trace.forEach(function (row) {
      var x = sx(row.t);
      var w = Math.max(1, plot.w * BUCKET_MS / result.lastTime - 1);
      var h = row.ready / maxReady * plot.h * 0.35;
      ctx.fillStyle = COLORS.io;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
      ctx.globalAlpha = 1;
    });

    drawLine(ctx, result.trace, function (row) { return sx(row.mid); }, function (row) { return syDepth(row.depth); }, COLORS.loop, 2.4);

    result.intervals.forEach(function (interval) {
      if (!(interval.heavy && interval.type === "handler" && interval.service > result.params.cpuMs * 2.5)) return;
      var x = sx(interval.start);
      var w = Math.max(1.5, sx(interval.end) - x);
      ctx.fillStyle = COLORS.blocker;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(x, plot.y + 6, w, 16);
      ctx.globalAlpha = 1;
    });

    if (result.params.policy === "shed") {
      ctx.strokeStyle = COLORS.cap;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(plot.x, syDepth(result.params.queueLimit));
      ctx.lineTo(plot.x + plot.w, syDepth(result.params.queueLimit));
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, "cap", plot.x + plot.w - 22, syDepth(result.params.queueLimit) - 5, COLORS.cap);
    }

    label(ctx, "backlog", plot.x, plot.y + 14, COLORS.loop, "left", "700 12px system-ui, sans-serif");
    label(ctx, "ready I/O", plot.x + 76, plot.y + 14, COLORS.io, "left", "700 12px system-ui, sans-serif");
    label(ctx, "slow CPU", plot.x + 156, plot.y + 14, COLORS.blocker, "left", "700 12px system-ui, sans-serif");
    label(ctx, "time", plot.x + plot.w - 25, plot.y + plot.h + 25);
  }

  function drawDelay(ctx, result, box) {
    panel(ctx, box, "Event-loop delay");
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 62, h: box.h - 82 };
    var maxDelay = Math.max(1, result.stats.loopDelayP99 * 1.2, result.trace.reduce(function (best, row) { return Math.max(best, row.delay.p95); }, 0));
    function sx(t) { return plot.x + clamp(t / result.lastTime, 0, 1) * plot.w; }
    function sy(v) { return plot.y + plot.h - clamp(v / maxDelay, 0, 1.08) * plot.h; }
    drawGrid(ctx, plot);
    result.trace.forEach(function (row) {
      if (!row.dropped) return;
      var x = sx(row.t);
      var w = Math.max(2, plot.w * BUCKET_MS / result.lastTime - 1);
      ctx.fillStyle = COLORS.shed;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(x, plot.y + plot.h - 12 - row.dropped * 2, w, Math.min(36, 12 + row.dropped * 2));
      ctx.globalAlpha = 1;
    });
    drawLine(ctx, result.trace, function (row) { return sx(row.mid); }, function (row) { return sy(row.delay.p95); }, COLORS.delay, 2.3);
    label(ctx, "p95 callback wait", plot.x, plot.y + 14, COLORS.delay, "left", "700 12px system-ui, sans-serif");
    label(ctx, "shed", plot.x + 124, plot.y + 14, COLORS.shed, "left", "700 12px system-ui, sans-serif");
    label(ctx, formatMs(maxDelay), plot.x, plot.y - 7, COLORS.muted);
    label(ctx, "time", plot.x + plot.w - 25, plot.y + plot.h + 25);
  }

  function drawHistogram(ctx, result, box) {
    panel(ctx, box, "Response latency");
    var plot = { x: box.x + 42, y: box.y + 45, w: box.w - 62, h: box.h - 86 };
    var hist = result.histogram;
    var maxCount = hist.rows.reduce(function (best, row) { return Math.max(best, row.count); }, 1);
    drawGrid(ctx, plot);
    hist.rows.forEach(function (row, i) {
      var bw = plot.w / hist.rows.length - 2;
      var x = plot.x + i * plot.w / hist.rows.length + 1;
      var h = row.count / maxCount * plot.h;
      ctx.fillStyle = COLORS.delay;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(x, plot.y + plot.h - h, Math.max(1, bw), h);
      ctx.globalAlpha = 1;
    });
    function mark(value, color, text, yOffset) {
      var x = plot.x + clamp(value / hist.maxValue, 0, 1) * plot.w;
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, text, x + 4, plot.y + 14 + yOffset, color);
    }
    mark(result.stats.p95, COLORS.loop, "p95", 0);
    mark(result.stats.p99, COLORS.blocker, "p99", 16);
    label(ctx, "0", plot.x, plot.y + plot.h + 22);
    label(ctx, formatMs(hist.maxValue), plot.x + plot.w - 54, plot.y + plot.h + 22);
  }

  function drawOutcomes(ctx, result, box) {
    panel(ctx, box, "Where the work went");
    var plot = { x: box.x + 30, y: box.y + 50, w: box.w - 48, h: box.h - 84 };
    var total = Math.max(1, result.requests.length);
    var normal = result.normalCompleted.length;
    var heavyInline = result.heavyCompleted.length - result.offloaded.length;
    var offloaded = result.offloaded.length;
    var shed = result.dropped;
    var rows = [
      { color: COLORS.loop, label: "normal callbacks", value: normal },
      { color: COLORS.blocker, label: "slow inline", value: heavyInline },
      { color: COLORS.worker, label: "worker offload", value: offloaded },
      { color: COLORS.shed, label: "shed", value: shed }
    ];
    var x = plot.x;
    rows.forEach(function (row) {
      var w = row.value / total * plot.w;
      if (w > 0) {
        ctx.fillStyle = row.color;
        ctx.globalAlpha = 0.78;
        ctx.fillRect(x, plot.y, w, 30);
        ctx.globalAlpha = 1;
      }
      x += w;
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, 30);

    rows.forEach(function (row, index) {
      var y = plot.y + 60 + index * 27;
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y - 11, 12, 12);
      label(ctx, row.label, plot.x + 20, y, COLORS.text);
      label(ctx, row.value + " (" + formatPercent(100 * row.value / total) + ")", plot.x + plot.w - 82, y, row.color);
    });

    var ioWait = mean(result.requests.map(function (req) { return req.io; }));
    var loopService = mean(result.serviceValues);
    label(ctx, "mean I/O wait " + formatMs(ioWait), plot.x, plot.y + plot.h - 24, COLORS.io, "left", "700 12px system-ui, sans-serif");
    label(ctx, "mean loop service " + formatMs(loopService), plot.x + 150, plot.y + plot.h - 24, COLORS.loop, "left", "700 12px system-ui, sans-serif");
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 700;
    var setup = setupCanvas(canvas, compact ? 1040 : 720);
    var ctx = setup.ctx;
    if (compact) {
      drawBacklog(ctx, result, { x: 8, y: 8, w: setup.width - 16, h: 248 });
      drawDelay(ctx, result, { x: 8, y: 268, w: setup.width - 16, h: 248 });
      drawHistogram(ctx, result, { x: 8, y: 528, w: setup.width - 16, h: 248 });
      drawOutcomes(ctx, result, { x: 8, y: 788, w: setup.width - 16, h: 244 });
    } else {
      var col = Math.round((setup.width - 28) / 2);
      drawBacklog(ctx, result, { x: 8, y: 8, w: col, h: 350 });
      drawDelay(ctx, result, { x: col + 20, y: 8, w: setup.width - col - 28, h: 350 });
      drawHistogram(ctx, result, { x: 8, y: 374, w: col, h: 338 });
      drawOutcomes(ctx, result, { x: col + 20, y: 374, w: setup.width - col - 28, h: 338 });
    }
  }

  function render(root) {
    var result = simulate(parseParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-event-loop-lab]")).forEach(function (root) {
      if (root.__eventLoopLabReady) return;
      root.__eventLoopLabReady = true;
      var schedule = null;
      function requestRender() {
        if (schedule && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(schedule);
        schedule = typeof global.requestAnimationFrame === "function"
          ? global.requestAnimationFrame(function () {
            schedule = null;
            render(root);
          })
          : global.setTimeout(function () {
            schedule = null;
            render(root);
          }, 16);
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      global.addEventListener("resize", requestRender);
    });
  }

  function audit() {
    var failures = [];
    function assert(name, condition) {
      if (!condition) failures.push(name);
    }
    function run(raw) {
      var result = simulate(raw);
      var accounted = result.stats.completedCount + result.stats.droppedCount;
      assert("all requests accounted " + JSON.stringify(raw), accounted === result.stats.arrivalCount);
      assert("finite p99 " + JSON.stringify(raw), Number.isFinite(result.stats.p99));
      assert("finite loop delay " + JSON.stringify(raw), Number.isFinite(result.stats.loopDelayP99));
      assert("nonnegative delays " + JSON.stringify(raw), result.intervals.every(function (i) { return i.start >= i.ready && i.end >= i.start; }));
      assert("reasonable utilization " + JSON.stringify(raw), result.stats.loopUtilization >= 0 && result.stats.loopUtilization < 1.8);
      return result;
    }
    var base = run(DEFAULTS);
    var noHeavy = run(Object.assign({}, DEFAULTS, { heavyShare: 0 }));
    assert("heavy callbacks raise loop delay", base.stats.loopDelayP99 > noHeavy.stats.loopDelayP99);
    var shed = run(Object.assign({}, DEFAULTS, { arrivalRate: 230, policy: "shed", queueLimit: 24 }));
    var queued = run(Object.assign({}, DEFAULTS, { arrivalRate: 230, policy: "queue", queueLimit: 24 }));
    assert("shed policy drops under overload", shed.dropped > 0);
    assert("shed policy bounds max depth", shed.maxDepth <= 30);
    assert("queueing costs accepted-tail latency", queued.stats.p99 >= shed.stats.p99 || shed.dropped / shed.requests.length > 0.15);
    var offload = run(Object.assign({}, DEFAULTS, { workerThreads: 3 }));
    assert("worker offload lowers loop delay", offload.stats.loopDelayP99 < base.stats.loopDelayP99);
    for (var rate = 40; rate <= 260; rate += 55) {
      for (var heavy = 0; heavy <= 20; heavy += 10) {
        run(Object.assign({}, DEFAULTS, { arrivalRate: rate, heavyShare: heavy, policy: rate > 180 ? "shed" : "queue", workerThreads: heavy >= 10 ? 2 : 0 }));
      }
    }
    return { failures: failures, ok: failures.length === 0 };
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.EventLoopBackpressureLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
