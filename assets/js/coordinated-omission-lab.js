(function (global) {
  "use strict";

  var COLORS = {
    open: "#0f766e",
    closed: "#be123c",
    corrected: "#2563eb",
    queue: "#7c3aed",
    pause: "#d97706",
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

  function formatMs(value) {
    if (!isFinite(value)) return "n/a";
    if (value >= 1000) return (value / 1000).toFixed(2) + " s";
    if (value >= 100) return value.toFixed(0) + " ms";
    if (value >= 10) return value.toFixed(1) + " ms";
    return value.toFixed(2) + " ms";
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="co-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
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

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function cleanParams(params) {
    return {
      duration: clamp(params.duration, 8, 45),
      load: clamp(params.load, 35, 98) / 100,
      meanService: clamp(params.meanService, 2, 30),
      pauseDuration: clamp(params.pauseDuration, 0, 500),
      pauseEvery: clamp(params.pauseEvery, 1.5, 12),
      serviceCv: clamp(params.serviceCv, 0, 250) / 100
    };
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var pos = (sorted.length - 1) * p;
    var lo = Math.floor(pos);
    var hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function makePauses(params) {
    var pauses = [];
    var every = params.pauseEvery * 1000;
    var duration = params.pauseDuration;
    if (duration <= 0) return pauses;
    for (var start = 1300; start < params.duration * 1000 + duration; start += every) {
      var jitter = 180 * Math.sin(start / 917);
      var s = Math.max(0, start + jitter);
      pauses.push({ end: s + duration, start: s });
    }
    return pauses;
  }

  function baseService(params, index, seed) {
    var meanService = params.meanService;
    var cv = params.serviceCv;
    if (cv <= 0.001) return meanService;
    var sigma = Math.sqrt(Math.log(1 + cv * cv));
    var mu = Math.log(meanService) - 0.5 * sigma * sigma;
    return Math.exp(mu + sigma * normal(index + 911, seed));
  }

  function applyPauses(start, work, pauses) {
    var finish = start + work;
    pauses.forEach(function (pause) {
      if (start < pause.end && finish > pause.start) {
        finish += pause.end - Math.max(start, pause.start);
      }
    });
    return finish - start;
  }

  function serviceTime(params, pauses, requestIndex, modeSeed, start) {
    var base = baseService(params, requestIndex, modeSeed);
    return applyPauses(start, base, pauses);
  }

  function summarize(records, durationMs) {
    var latencies = records.map(function (row) { return row.latency; });
    return {
      count: records.length,
      max: latencies.length ? Math.max.apply(null, latencies) : 0,
      mean: mean(latencies),
      p50: percentile(latencies, 0.50),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      throughput: records.length / Math.max(1e-9, durationMs / 1000)
    };
  }

  function bucketize(records, durationMs, bucketMs) {
    var n = Math.ceil(durationMs / bucketMs);
    var buckets = [];
    for (var i = 0; i < n; i += 1) {
      buckets.push({ count: 0, latencySum: 0, maxLatency: 0, p99: 0, samples: [], t: i * bucketMs });
    }
    records.forEach(function (row) {
      var index = clamp(Math.floor(row.arrival / bucketMs), 0, n - 1);
      var bucket = buckets[index];
      bucket.count += 1;
      bucket.latencySum += row.latency;
      bucket.maxLatency = Math.max(bucket.maxLatency, row.latency);
      bucket.samples.push(row.latency);
    });
    buckets.forEach(function (bucket) {
      bucket.meanLatency = bucket.count ? bucket.latencySum / bucket.count : 0;
      bucket.p99 = percentile(bucket.samples, 0.99);
    });
    return buckets;
  }

  function simulateOpenLoop(params, pauses, intervalMs, durationMs) {
    var records = [];
    var queueSamples = [];
    var serverFree = 0;
    for (var i = 0, arrival = 0; arrival < durationMs; i += 1, arrival += intervalMs) {
      var start = Math.max(arrival, serverFree);
      var service = serviceTime(params, pauses, i, 0x51f15eed, start);
      var finish = start + service;
      records.push({
        arrival: arrival,
        finish: finish,
        latency: finish - arrival,
        queueDelay: start - arrival,
        service: service,
        start: start
      });
      serverFree = finish;
    }
    var bucketMs = 250;
    for (var t = 0; t < durationMs; t += bucketMs) {
      var depth = records.filter(function (row) {
        return row.arrival <= t && row.finish > t;
      }).length;
      queueSamples.push({ depth: depth, t: t });
    }
    return { records: records, queueSamples: queueSamples };
  }

  function correctedValues(latency, expectedInterval) {
    var values = [latency];
    for (var missing = latency - expectedInterval; missing > expectedInterval * 0.5; missing -= expectedInterval) {
      values.push(missing);
    }
    return values;
  }

  function simulateClosedLoop(params, pauses, intervalMs, durationMs) {
    var records = [];
    var corrected = [];
    var think = Math.max(0, intervalMs - params.meanService);
    var arrival = 0;
    for (var i = 0; arrival < durationMs; i += 1) {
      var start = arrival;
      var service = serviceTime(params, pauses, i, 0xbadc0de, start);
      var finish = start + service;
      var latency = finish - arrival;
      records.push({
        arrival: arrival,
        finish: finish,
        latency: latency,
        queueDelay: 0,
        service: service,
        start: start
      });
      correctedValues(latency, intervalMs).forEach(function (value) {
        corrected.push({ arrival: arrival, latency: value });
      });
      arrival = finish + think;
    }
    return { corrected: corrected, records: records };
  }

  function percentileCurve(records) {
    var latencies = records.map(function (row) { return row.latency; }).sort(function (a, b) { return a - b; });
    var ps = [0.5, 0.75, 0.9, 0.95, 0.975, 0.99, 0.995, 0.999];
    return ps.map(function (p) {
      return { p: p, value: percentile(latencies, p) };
    });
  }

  function kingmanApprox(params, intervalMs) {
    var rho = params.load;
    var ca2 = 0;
    var cs2 = params.serviceCv * params.serviceCv;
    if (rho >= 1) return Infinity;
    return (rho / (1 - rho)) * ((ca2 + cs2) / 2) * params.meanService;
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var durationMs = clean.duration * 1000;
    var intervalMs = clean.meanService / clean.load;
    var pauses = makePauses(clean);
    var open = simulateOpenLoop(clean, pauses, intervalMs, durationMs);
    var closed = simulateClosedLoop(clean, pauses, intervalMs, durationMs);
    var openSummary = summarize(open.records, durationMs);
    var closedSummary = summarize(closed.records, durationMs);
    var correctedSummary = summarize(closed.corrected, durationMs);
    var openBuckets = bucketize(open.records, durationMs, 1000);
    var closedBuckets = bucketize(closed.records, durationMs, 1000);
    return {
      closed: closed,
      closedBuckets: closedBuckets,
      closedCurve: percentileCurve(closed.records),
      closedSummary: closedSummary,
      correctedCurve: percentileCurve(closed.corrected),
      correctedSummary: correctedSummary,
      intervalMs: intervalMs,
      kingmanWait: kingmanApprox(clean, intervalMs),
      omissionFactor: open.records.length / Math.max(1, closed.records.length),
      open: open,
      openBuckets: openBuckets,
      openCurve: percentileCurve(open.records),
      openSummary: openSummary,
      params: clean,
      pauses: pauses
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

  function drawPercentilePanel(ctx, result, box) {
    panelTitle(ctx, box, "Percentile report", "same service, different measurement contracts");
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var curves = [
      { color: COLORS.open, rows: result.openCurve },
      { color: COLORS.closed, rows: result.closedCurve },
      { color: COLORS.corrected, rows: result.correctedCurve }
    ];
    var max = Math.max.apply(null, curves.reduce(function (acc, curve) {
      return acc.concat(curve.rows.map(function (row) { return row.value; }));
    }, [result.params.meanService * 2]));
    max *= 1.12;
    function xScale(p) { return plot.x + (p - 0.5) / (0.999 - 0.5) * plot.w; }
    function yScale(ms) { return plot.y + plot.h - clamp(ms / max, 0, 1) * plot.h; }
    drawAxis(ctx, plot);
    curves.forEach(function (curve) {
      ctx.strokeStyle = curve.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      curve.rows.forEach(function (row, i) {
        var x = xScale(row.p);
        var y = yScale(row.value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      curve.rows.forEach(function (row) {
        ctx.fillStyle = curve.color;
        ctx.beginPath();
        ctx.arc(xScale(row.p), yScale(row.value), 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("open p99 " + formatMs(result.openSummary.p99), plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("closed p99 " + formatMs(result.closedSummary.p99), plot.x, plot.y + 38);
    ctx.textAlign = "center";
    [0.5, 0.9, 0.99, 0.999].forEach(function (p) {
      ctx.fillText("p" + formatNumber(p * 100), xScale(p), plot.y + plot.h + 14);
    });
    ctx.textAlign = "right";
    ctx.fillText(formatMs(max), plot.x - 7, plot.y + 4);
    ctx.fillText("0", plot.x - 7, plot.y + plot.h);
    ctx.textAlign = "left";
  }

  function drawSamplesPanel(ctx, result, box) {
    panelTitle(ctx, box, "Samples per second", "the closed-loop generator goes quiet during pain");
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var maxCount = Math.max.apply(null, result.openBuckets.concat(result.closedBuckets).map(function (bucket) {
      return bucket.count;
    }).concat([1]));
    function xScale(t) { return plot.x + t / (result.params.duration * 1000) * plot.w; }
    function yScale(count) { return plot.y + plot.h - count / maxCount * plot.h; }
    drawAxis(ctx, plot);
    result.pauses.forEach(function (pause) {
      ctx.fillStyle = COLORS.pause;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(xScale(pause.start), plot.y, Math.max(2, xScale(pause.end) - xScale(pause.start)), plot.h);
      ctx.globalAlpha = 1;
    });
    [
      { buckets: result.openBuckets, color: COLORS.open },
      { buckets: result.closedBuckets, color: COLORS.closed }
    ].forEach(function (series) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.buckets.forEach(function (bucket, i) {
        var x = xScale(bucket.t);
        var y = yScale(bucket.count);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(formatNumber(result.omissionFactor) + "x", plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("more intended open-loop samples", plot.x + 58, plot.y + 22);
    ctx.textAlign = "center";
    [0, result.params.duration / 2, result.params.duration].forEach(function (t) {
      ctx.fillText(formatNumber(t) + "s", xScale(t * 1000), plot.y + plot.h + 14);
    });
    ctx.textAlign = "right";
    ctx.fillText(String(maxCount), plot.x - 7, plot.y + 4);
    ctx.fillText("0", plot.x - 7, plot.y + plot.h);
    ctx.textAlign = "left";
  }

  function drawQueuePanel(ctx, result, box) {
    panelTitle(ctx, box, "Queue and latency over time", "pauses become backlog under open-loop load");
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var maxDepth = Math.max.apply(null, result.open.queueSamples.map(function (row) { return row.depth; }).concat([1]));
    var maxLatency = Math.max.apply(null, result.openBuckets.map(function (row) { return row.p99; }).concat([result.params.meanService * 2]));
    function xScale(t) { return plot.x + t / (result.params.duration * 1000) * plot.w; }
    function yDepth(depth) { return plot.y + plot.h - depth / maxDepth * plot.h; }
    function yLatency(ms) { return plot.y + plot.h - ms / maxLatency * plot.h; }
    drawAxis(ctx, plot);
    result.pauses.forEach(function (pause) {
      ctx.fillStyle = COLORS.pause;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(xScale(pause.start), plot.y, Math.max(2, xScale(pause.end) - xScale(pause.start)), plot.h);
      ctx.globalAlpha = 1;
    });
    ctx.strokeStyle = COLORS.queue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.open.queueSamples.forEach(function (row, i) {
      var x = xScale(row.t);
      var y = yDepth(row.depth);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.strokeStyle = COLORS.open;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.openBuckets.forEach(function (row, i) {
      var x = xScale(row.t);
      var y = yLatency(row.p99);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("L=lambda W", plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("queue depth purple, open p99 green", plot.x, plot.y + 38);
    ctx.textAlign = "right";
    ctx.fillText(String(maxDepth), plot.x - 7, plot.y + 4);
    ctx.fillText("0", plot.x - 7, plot.y + plot.h);
    ctx.textAlign = "left";
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Measurement ledger", "a benchmark is a traffic model, not just a stopwatch");
    var plot = { x: box.x, y: box.y + 50, w: box.w, h: box.h - 64 };
    var rows = [
      { label: "open p99", value: result.openSummary.p99, scale: result.openSummary.p99, color: COLORS.open, text: formatMs(result.openSummary.p99) },
      { label: "closed p99", value: result.closedSummary.p99, scale: result.openSummary.p99, color: COLORS.closed, text: formatMs(result.closedSummary.p99) },
      { label: "corrected p99", value: result.correctedSummary.p99, scale: result.openSummary.p99, color: COLORS.corrected, text: formatMs(result.correctedSummary.p99) },
      { label: "closed samples", value: result.closedSummary.count, scale: result.openSummary.count, color: COLORS.closed, text: result.closedSummary.count + " / " + result.openSummary.count },
      { label: "Kingman wait", value: result.kingmanWait, scale: result.openSummary.p99, color: COLORS.queue, text: formatMs(result.kingmanWait) }
    ];
    var rowGap = Math.min(36, Math.max(24, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      var barW = plot.w - 174;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 124, y, barW, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 124, y, Math.max(1, barW * clamp(row.value / Math.max(1e-9, row.scale), 0, 1)), 18);
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
      drawPercentilePanel(ctx, result, { x: margin, y: 28, w: panelW, h: 286 });
      drawSamplesPanel(ctx, result, { x: margin, y: 342, w: panelW, h: 206 });
      drawQueuePanel(ctx, result, { x: margin, y: 576, w: panelW, h: 206 });
      drawLedgerPanel(ctx, result, { x: margin, y: 810, w: panelW, h: 136 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawPercentilePanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 320 });
      drawSamplesPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 320 });
      drawQueuePanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 244 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 244 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var values = {
      duration: formatNumber(result.params.duration) + " s",
      load: formatPercent(result.params.load * 100),
      meanService: formatMs(result.params.meanService),
      pauseDuration: formatMs(result.params.pauseDuration),
      pauseEvery: formatNumber(result.params.pauseEvery) + " s",
      serviceCv: formatPercent(result.params.serviceCv * 100)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Open p99", formatMs(result.openSummary.p99)),
        metric("Closed p99", formatMs(result.closedSummary.p99)),
        metric("Corrected p99", formatMs(result.correctedSummary.p99)),
        metric("Omitted samples", formatPercent((1 - result.closedSummary.count / result.openSummary.count) * 100)),
        metric("Offered interval", formatMs(result.intervalMs)),
        metric("Open throughput", formatNumber(result.openSummary.throughput) + "/s")
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-coordinated-omission-lab]")).forEach(init);
  }

  var api = {
    correctedValues: correctedValues,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.CoordinatedOmissionLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
