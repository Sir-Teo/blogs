(function (global) {
  "use strict";

  var COLORS = {
    belady: "#111827",
    lru: "#be123c",
    lfu: "#7c3aed",
    gate: "#0f766e",
    scan: "#d97706",
    hot: "#2563eb",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    band: "#eef2ff"
  };

  var POLICIES = [
    { color: COLORS.belady, key: "belady", label: "Belady" },
    { color: COLORS.lru, key: "lru", label: "LRU" },
    { color: COLORS.lfu, key: "lfu", label: "LFU" },
    { color: COLORS.gate, key: "gate", label: "freq gate" }
  ];

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
    if (Math.abs(value) < 1e-12) return "0.0%";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="cache-policy-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
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

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function cleanParams(params) {
    return {
      cacheSize: clamp(Math.round(params.cacheSize), 8, 96),
      hotSet: clamp(Math.round(params.hotSet), 8, 160),
      locality: clamp(params.locality, 30, 95) / 100,
      requests: clamp(Math.round(params.requests), 600, 5000),
      scanEvery: clamp(Math.round(params.scanEvery), 3, 24),
      scanLength: clamp(Math.round(params.scanLength), 0, 400),
      shift: clamp(params.shift, 0, 100) / 100
    };
  }

  function hotItem(params, t, phase) {
    var base = phase ? 10000 : 0;
    var skew = uniform(t * 19 + phase * 100003, 0x51f15eed);
    if (skew < params.locality) {
      var top = Math.max(2, Math.round(params.hotSet * 0.28));
      return base + Math.floor(uniform(t * 23 + 11 + phase * 1009, 0xbadc0de) * top);
    }
    return base + Math.floor(uniform(t * 29 + 17 + phase * 2003, 0xdecafbad) * params.hotSet);
  }

  function makeTrace(params) {
    var trace = [];
    var cycle = 0;
    var scanSerial = 0;
    var phase = 0;
    while (trace.length < params.requests) {
      if (!phase && params.shift > 0 && trace.length >= params.requests * params.shift) {
        phase = 1;
      }
      for (var i = 0; i < params.hotSet && trace.length < params.requests; i += 1) {
        trace.push({ key: hotItem(params, trace.length + i, phase), phase: phase, type: "hot" });
      }
      cycle += 1;
      if (params.scanLength > 0 && cycle % params.scanEvery === 0) {
        for (var s = 0; s < params.scanLength && trace.length < params.requests; s += 1) {
          trace.push({ key: 200000 + scanSerial, phase: phase, type: "scan" });
          scanSerial += 1;
        }
      }
    }
    return trace;
  }

  function emptyStats(policy, trace) {
    return {
      cache: [],
      evictions: 0,
      hits: 0,
      hitTimeline: [],
      hotHits: 0,
      hotRequests: 0,
      misses: 0,
      policy: policy,
      scanAdmitted: 0,
      scanRequests: 0,
      traceLength: trace.length
    };
  }

  function finishStats(stats, trace, cacheSet) {
    var hotInCache = 0;
    cacheSet.forEach(function (key) {
      if (key < 10000 || (key >= 10000 && key < 200000)) hotInCache += 1;
    });
    stats.cache = Array.from(cacheSet);
    stats.hitRate = stats.hits / Math.max(1, trace.length);
    stats.hotHitRate = stats.hotHits / Math.max(1, stats.hotRequests);
    stats.hotResident = hotInCache;
    stats.scanAdmitRate = stats.scanAdmitted / Math.max(1, stats.scanRequests);
    return stats;
  }

  function simulateLRU(trace, params) {
    var stats = emptyStats("lru", trace);
    var cache = new Map();
    trace.forEach(function (req, i) {
      var hit = cache.has(req.key);
      if (req.type === "hot") stats.hotRequests += 1;
      else stats.scanRequests += 1;
      if (hit) {
        stats.hits += 1;
        if (req.type === "hot") stats.hotHits += 1;
        cache.delete(req.key);
        cache.set(req.key, i);
      } else {
        stats.misses += 1;
        if (cache.size >= params.cacheSize) {
          var victim = cache.keys().next().value;
          cache.delete(victim);
          stats.evictions += 1;
        }
        cache.set(req.key, i);
        if (req.type === "scan") stats.scanAdmitted += 1;
      }
      stats.hitTimeline.push(hit ? 1 : 0);
    });
    return finishStats(stats, trace, new Set(cache.keys()));
  }

  function simulateLFU(trace, params) {
    var stats = emptyStats("lfu", trace);
    var cache = new Map();
    var globalCounts = new Map();
    trace.forEach(function (req, i) {
      globalCounts.set(req.key, (globalCounts.get(req.key) || 0) + 1);
      var hit = cache.has(req.key);
      if (req.type === "hot") stats.hotRequests += 1;
      else stats.scanRequests += 1;
      if (hit) {
        stats.hits += 1;
        if (req.type === "hot") stats.hotHits += 1;
        var entry = cache.get(req.key);
        entry.count += 1;
        entry.last = i;
      } else {
        stats.misses += 1;
        if (cache.size >= params.cacheSize) {
          var victimKey = null;
          var victimEntry = null;
          cache.forEach(function (entry, key) {
            if (!victimEntry || entry.count < victimEntry.count || (entry.count === victimEntry.count && entry.last < victimEntry.last)) {
              victimKey = key;
              victimEntry = entry;
            }
          });
          cache.delete(victimKey);
          stats.evictions += 1;
        }
        cache.set(req.key, { count: globalCounts.get(req.key), last: i });
        if (req.type === "scan") stats.scanAdmitted += 1;
      }
      stats.hitTimeline.push(hit ? 1 : 0);
    });
    return finishStats(stats, trace, new Set(cache.keys()));
  }

  function simulateGate(trace, params) {
    var stats = emptyStats("gate", trace);
    var cache = new Map();
    var counts = new Map();
    var sample = 0;
    var window = Math.max(100, Math.round(params.requests / 3));
    trace.forEach(function (req, i) {
      sample += 1;
      counts.set(req.key, (counts.get(req.key) || 0) + 1);
      if (sample % window === 0) {
        counts.forEach(function (count, key) {
          var next = Math.floor(count / 2);
          if (next) counts.set(key, next);
          else counts.delete(key);
        });
      }
      var hit = cache.has(req.key);
      if (req.type === "hot") stats.hotRequests += 1;
      else stats.scanRequests += 1;
      if (hit) {
        stats.hits += 1;
        if (req.type === "hot") stats.hotHits += 1;
        cache.delete(req.key);
        cache.set(req.key, i);
      } else {
        stats.misses += 1;
        if (cache.size < params.cacheSize) {
          cache.set(req.key, i);
          if (req.type === "scan") stats.scanAdmitted += 1;
        } else {
          var victim = cache.keys().next().value;
          var incomingScore = counts.get(req.key) || 0;
          var victimScore = counts.get(victim) || 0;
          if (incomingScore > victimScore) {
            cache.delete(victim);
            cache.set(req.key, i);
            stats.evictions += 1;
            if (req.type === "scan") stats.scanAdmitted += 1;
          }
        }
      }
      stats.hitTimeline.push(hit ? 1 : 0);
    });
    return finishStats(stats, trace, new Set(cache.keys()));
  }

  function nextUseTable(trace) {
    var next = new Array(trace.length);
    var seen = new Map();
    for (var i = trace.length - 1; i >= 0; i -= 1) {
      var key = trace[i].key;
      next[i] = seen.has(key) ? seen.get(key) : Infinity;
      seen.set(key, i);
    }
    return next;
  }

  function simulateBelady(trace, params) {
    var stats = emptyStats("belady", trace);
    var nextUse = nextUseTable(trace);
    var cache = new Map();
    trace.forEach(function (req, i) {
      var hit = cache.has(req.key);
      if (req.type === "hot") stats.hotRequests += 1;
      else stats.scanRequests += 1;
      if (hit) {
        stats.hits += 1;
        if (req.type === "hot") stats.hotHits += 1;
        cache.set(req.key, nextUse[i]);
      } else {
        stats.misses += 1;
        if (cache.size >= params.cacheSize) {
          var victimKey = null;
          var farthest = -1;
          cache.forEach(function (future, key) {
            if (future > farthest) {
              farthest = future;
              victimKey = key;
            }
          });
          cache.delete(victimKey);
          stats.evictions += 1;
        }
        cache.set(req.key, nextUse[i]);
        if (req.type === "scan") stats.scanAdmitted += 1;
      }
      stats.hitTimeline.push(hit ? 1 : 0);
    });
    return finishStats(stats, trace, new Set(cache.keys()));
  }

  function windowedRates(stats, width) {
    var out = [];
    for (var i = 0; i < stats.hitTimeline.length; i += width) {
      var slice = stats.hitTimeline.slice(i, i + width);
      var hits = slice.reduce(function (sum, value) { return sum + value; }, 0);
      out.push({ index: i, rate: hits / Math.max(1, slice.length) });
    }
    return out;
  }

  function reuseDistances(trace) {
    var last = new Map();
    var distances = [];
    var stack = [];
    trace.forEach(function (req) {
      if (last.has(req.key)) {
        var pos = stack.indexOf(req.key);
        distances.push(pos < 0 ? Infinity : pos);
        if (pos >= 0) stack.splice(pos, 1);
      } else {
        distances.push(Infinity);
      }
      stack.unshift(req.key);
      last.set(req.key, true);
      if (stack.length > 500) stack.pop();
    });
    return distances;
  }

  function reuseHistogram(trace) {
    var bins = [
      { count: 0, label: "0-7", max: 7, min: 0 },
      { count: 0, label: "8-31", max: 31, min: 8 },
      { count: 0, label: "32-95", max: 95, min: 32 },
      { count: 0, label: "96+", max: Infinity, min: 96 },
      { count: 0, label: "cold", max: Infinity, min: Infinity }
    ];
    reuseDistances(trace).forEach(function (distance) {
      if (!isFinite(distance)) bins[4].count += 1;
      else if (distance <= 7) bins[0].count += 1;
      else if (distance <= 31) bins[1].count += 1;
      else if (distance <= 95) bins[2].count += 1;
      else bins[3].count += 1;
    });
    return bins;
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var trace = makeTrace(clean);
    var policies = {
      belady: simulateBelady(trace, clean),
      gate: simulateGate(trace, clean),
      lfu: simulateLFU(trace, clean),
      lru: simulateLRU(trace, clean)
    };
    return {
      params: clean,
      policies: policies,
      reuse: reuseHistogram(trace),
      timeline: {
        belady: windowedRates(policies.belady, 80),
        gate: windowedRates(policies.gate, 80),
        lfu: windowedRates(policies.lfu, 80),
        lru: windowedRates(policies.lru, 80)
      },
      trace: trace
    };
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

  function drawHitPanel(ctx, result, box) {
    panelTitle(ctx, box, "Hit rate", "Belady is an oracle; online policies guess from history");
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 58, h: box.h - 86 };
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.rule;
    [0.5, 0.9].forEach(function (level) {
      var y = plot.y + plot.h - level * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(formatPercent(level * 100), plot.x - 6, y - 6);
    });
    var gap = plot.w / POLICIES.length;
    POLICIES.forEach(function (policy, i) {
      var stat = result.policies[policy.key];
      var x = plot.x + i * gap + gap * 0.22;
      var w = gap * 0.5;
      var h = stat.hitRate * plot.h;
      ctx.fillStyle = policy.color;
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatPercent(stat.hitRate * 100), x + w / 2, plot.y + plot.h - h - 8);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(policy.label, x + w / 2, plot.y + plot.h + 14);
    });
    ctx.textAlign = "left";
  }

  function drawTimelinePanel(ctx, result, box) {
    panelTitle(ctx, box, "Locality over time", "scans make recency look like a bad forecast");
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 60, h: box.h - 82 };
    drawAxis(ctx, plot);
    function xScale(i, count) { return plot.x + i / Math.max(1, count - 1) * plot.w; }
    function yScale(v) { return plot.y + plot.h - v * plot.h; }
    ["belady", "lru", "gate"].forEach(function (key) {
      var rows = result.timeline[key];
      ctx.strokeStyle = COLORS[key];
      ctx.lineWidth = key === "belady" ? 1.8 : 2.2;
      ctx.beginPath();
      rows.forEach(function (row, i) {
        var x = xScale(i, rows.length);
        var y = yScale(row.rate);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("LRU gap " + formatPercent((result.policies.belady.hitRate - result.policies.lru.hitRate) * 100), plot.x, plot.y + 14);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("black Belady, red LRU, green admission gate", plot.x, plot.y + 38);
  }

  function drawReusePanel(ctx, result, box) {
    panelTitle(ctx, box, "Reuse-distance shape", "a cache miss means reuse exceeded resident memory");
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 58, h: box.h - 82 };
    var bins = result.reuse;
    var max = Math.max.apply(null, bins.map(function (b) { return b.count; }).concat([1]));
    drawAxis(ctx, plot);
    var gap = plot.w / bins.length;
    bins.forEach(function (bin, i) {
      var x = plot.x + i * gap + gap * 0.18;
      var w = gap * 0.56;
      var h = bin.count / max * plot.h;
      ctx.fillStyle = bin.label === "cold" ? COLORS.scan : COLORS.hot;
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatPercent(bin.count / result.trace.length * 100), x + w / 2, plot.y + plot.h - h - 8);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(bin.label, x + w / 2, plot.y + plot.h + 14);
    });
    ctx.textAlign = "left";
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Cache ledger", "admission is separate from eviction");
    var lru = result.policies.lru;
    var gate = result.policies.gate;
    var belady = result.policies.belady;
    var rows = [
      ["requests", formatNumber(result.trace.length)],
      ["cache size", formatNumber(result.params.cacheSize)],
      ["hot set", formatNumber(result.params.hotSet)],
      ["scan length", formatNumber(result.params.scanLength)],
      ["Belady hit", formatPercent(belady.hitRate * 100)],
      ["LRU hot hit", formatPercent(lru.hotHitRate * 100)],
      ["gate hot hit", formatPercent(gate.hotHitRate * 100)],
      ["LRU scan admits", formatPercent(lru.scanAdmitRate * 100)],
      ["gate scan admits", formatPercent(gate.scanAdmitRate * 100)],
      ["gate hot resident", formatNumber(gate.hotResident)]
    ];
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 64 };
    var rowGap = Math.min(23, Math.max(17, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.25)" : "transparent";
      ctx.fillRect(plot.x, y - 2, plot.w, rowGap);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row[0], plot.x + 4, y + 13);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(row[1], plot.x + plot.w - 4, y + 13);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 1040 : 700;
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
      drawHitPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 250 });
      drawTimelinePanel(ctx, result, { x: margin, y: 308, w: panelW, h: 222 });
      drawReusePanel(ctx, result, { x: margin, y: 560, w: panelW, h: 220 });
      drawLedgerPanel(ctx, result, { x: margin, y: 810, w: panelW, h: 198 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawHitPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 318 });
      drawTimelinePanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 318 });
      drawReusePanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 246 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 246 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      cacheSize: formatNumber(result.params.cacheSize),
      hotSet: formatNumber(result.params.hotSet),
      locality: formatPercent(result.params.locality * 100),
      requests: formatNumber(result.params.requests),
      scanEvery: formatNumber(result.params.scanEvery),
      scanLength: formatNumber(result.params.scanLength),
      shift: result.params.shift ? formatPercent(result.params.shift * 100) : "off"
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Belady hit rate", formatPercent(result.policies.belady.hitRate * 100)),
        metric("LRU hit rate", formatPercent(result.policies.lru.hitRate * 100)),
        metric("LFU hit rate", formatPercent(result.policies.lfu.hitRate * 100)),
        metric("Gate hit rate", formatPercent(result.policies.gate.hitRate * 100)),
        metric("LRU scan admits", formatPercent(result.policies.lru.scanAdmitRate * 100)),
        metric("Gate scan admits", formatPercent(result.policies.gate.scanAdmitRate * 100))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-cache-policy-lab]")).forEach(init);
  }

  var api = {
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.CacheReplacementLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
