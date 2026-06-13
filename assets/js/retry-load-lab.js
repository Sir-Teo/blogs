(function (global) {
  "use strict";

  var COLORS = {
    original: "#2563eb",
    retry: "#b45309",
    capacity: "#0f766e",
    queue: "#7c3aed",
    success: "#0f766e",
    wasted: "#be123c",
    failed: "#64748b",
    budget: "#f59e0b",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#edf2f7"
  };
  var DT = 20;
  var HORIZON_MS = 12000;
  var DRAIN_MS = 5000;
  var BUCKET_MS = 400;
  var WORKERS = 20;
  var MEAN_SERVICE_MS = 55;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
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

  function std(values) {
    if (values.length < 2) return 0;
    var m = mean(values);
    var v = values.reduce(function (sum, value) {
      var d = value - m;
      return sum + d * d;
    }, 0) / (values.length - 1);
    return Math.sqrt(v);
  }

  function formatMs(value) {
    if (!isFinite(value)) return "n/a";
    if (value >= 1000) return (value / 1000).toFixed(2) + " s";
    return value.toFixed(0) + " ms";
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(value < 10 ? 1 : 0) + "%";
  }

  function metric(label, value) {
    return '<div class="retry-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
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

  function serviceTime(rng, params) {
    var base = MEAN_SERVICE_MS * Math.exp(0.35 * normal(rng) - 0.06125);
    if (rng() < params.slowTail / 100) {
      base += 120 + 420 * rng() * rng();
    }
    return Math.max(8, base);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function retryDelay(params, attemptIndex, rng) {
    var base = params.backoffMs * Math.pow(2, Math.max(0, attemptIndex - 1));
    var jitter = params.jitter / 100;
    var low = Math.max(0, 1 - jitter);
    var high = 1 + jitter;
    return base * (low + (high - low) * rng());
  }

  function scheduleAttempt(schedule, time, attempt) {
    var slot = clamp(Math.floor(time / DT), 0, schedule.length - 1);
    if (!schedule[slot]) schedule[slot] = [];
    schedule[slot].push(attempt);
  }

  function simulate(params) {
    var capacityQps = WORKERS * 1000 / MEAN_SERVICE_MS;
    var externalQps = capacityQps * params.offeredLoad / 100;
    var rng = makeRng(9109 + params.offeredLoad * 17 + params.timeoutMs * 31 + params.maxAttempts * 97 + params.backoffMs * 13 + params.jitter * 7 + params.retryBudget * 19);
    var totalSlots = Math.ceil((HORIZON_MS + DRAIN_MS) / DT);
    var bucketCount = Math.ceil(HORIZON_MS / BUCKET_MS);
    var schedule = Array(totalSlots);
    var buckets = [];
    var roots = [];
    var queue = [];
    var active = [];
    var arrivalsCarry = 0;
    var retryLimit = Infinity;
    var retriesScheduled = 0;
    var stats = {
      activeSaturatedTicks: 0,
      budgetDrops: 0,
      canceledQueued: 0,
      duplicateWork: 0,
      external: 0,
      started: 0,
      successes: 0,
      timedOutAttempts: 0,
      wastedAfterTimeout: 0
    };

    for (var b = 0; b < bucketCount; b += 1) {
      buckets.push({ external: 0, retry: 0, queue: 0, samples: 0 });
    }

    function addBucket(time, key) {
      if (time >= HORIZON_MS) return;
      var index = clamp(Math.floor(time / BUCKET_MS), 0, bucketCount - 1);
      buckets[index][key] += 1;
    }

    function maybeRetry(root, attempt, time) {
      if (root.done) return;
      if (attempt.index >= params.maxAttempts) return;
      if (retriesScheduled >= retryLimit) {
        stats.budgetDrops += 1;
        return;
      }
      retriesScheduled += 1;
      root.attempts += 1;
      var delay = retryDelay(params, attempt.index, rng);
      var nextTime = time + delay;
      var next = {
        deadline: nextTime + params.timeoutMs,
        index: attempt.index + 1,
        rootId: attempt.rootId,
        scheduledAt: nextTime,
        timedOut: false,
        wasRetry: true
      };
      scheduleAttempt(schedule, nextTime, next);
      addBucket(nextTime, "retry");
    }

    function createExternal(time) {
      var root = {
        attempts: 1,
        completedAt: null,
        createdAt: time,
        done: false,
        id: roots.length
      };
      roots.push(root);
      stats.external += 1;
      var attempt = {
        deadline: time + params.timeoutMs,
        index: 1,
        rootId: root.id,
        scheduledAt: time,
        timedOut: false,
        wasRetry: false
      };
      queue.push(attempt);
      addBucket(time, "external");
    }

    retryLimit = Math.floor(Math.max(0, params.retryBudget / 100) * Math.max(1, externalQps * HORIZON_MS / 1000));

    for (var slot = 0; slot < totalSlots; slot += 1) {
      var time = slot * DT;
      if (time < HORIZON_MS) {
        arrivalsCarry += externalQps * DT / 1000;
        var arrivals = Math.floor(arrivalsCarry);
        arrivalsCarry -= arrivals;
        if (rng() < arrivalsCarry) {
          arrivals += 1;
          arrivalsCarry = 0;
        }
        for (var a = 0; a < arrivals; a += 1) createExternal(time);
      }

      if (schedule[slot]) {
        schedule[slot].forEach(function (attempt) { queue.push(attempt); });
      }

      for (var c = active.length - 1; c >= 0; c -= 1) {
        var running = active[c];
        if (!running.timedOut && time >= running.deadline && !roots[running.rootId].done) {
          running.timedOut = true;
          stats.timedOutAttempts += 1;
          maybeRetry(roots[running.rootId], running, time);
        }
        if (running.finishAt <= time) {
          active.splice(c, 1);
          var root = roots[running.rootId];
          if (root.done) {
            stats.duplicateWork += 1;
          } else if (running.timedOut || time > running.deadline) {
            stats.wastedAfterTimeout += 1;
          } else {
            root.done = true;
            root.completedAt = time;
            stats.successes += 1;
          }
        }
      }

      for (var q = 0; q < queue.length; q += 1) {
        var queued = queue[q];
        if (!queued.timedOut && time >= queued.deadline && !roots[queued.rootId].done) {
          queued.timedOut = true;
          stats.timedOutAttempts += 1;
          maybeRetry(roots[queued.rootId], queued, time);
          if (rng() < params.cancelEffectiveness / 100) {
            queued.canceled = true;
            stats.canceledQueued += 1;
          }
        }
      }

      while (active.length < WORKERS && queue.length) {
        var attempt = queue.shift();
        if (attempt.canceled) continue;
        var rootForAttempt = roots[attempt.rootId];
        if (rootForAttempt.done && rng() < params.cancelEffectiveness / 100) continue;
        attempt.finishAt = time + serviceTime(rng, params);
        active.push(attempt);
        stats.started += 1;
      }

      if (time < HORIZON_MS) {
        var bucket = buckets[Math.floor(time / BUCKET_MS)];
        bucket.queue += queue.length;
        bucket.samples += 1;
      }
      if (active.length >= WORKERS && queue.length) stats.activeSaturatedTicks += 1;
    }

    var latencies = [];
    var failed = 0;
    roots.forEach(function (root) {
      if (root.done) latencies.push(root.completedAt - root.createdAt);
      else failed += 1;
    });

    buckets.forEach(function (bucket) {
      bucket.queue = bucket.samples ? bucket.queue / bucket.samples : 0;
    });

    var retryBuckets = buckets.map(function (bucket) { return bucket.retry; });
    var retryMean = mean(retryBuckets);
    var retryBurst = retryMean > 0 ? std(retryBuckets) / retryMean : 0;
    var attemptsGenerated = roots.length + retriesScheduled;
    var totalAttempts = stats.started + stats.canceledQueued;
    var queueSamples = buckets.map(function (bucket) { return bucket.queue; });

    return {
      buckets: buckets,
      capacityQps: capacityQps,
      externalQps: externalQps,
      failed: failed,
      latencies: latencies,
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      queueP95: percentile(queueSamples, 0.95),
      retryBurst: retryBurst,
      retryLimit: retryLimit,
      retriesScheduled: retriesScheduled,
      roots: roots,
      stats: stats,
      successRate: roots.length ? stats.successes / roots.length : 0,
      attemptsGenerated: attemptsGenerated,
      totalAttempts: totalAttempts,
      workAmplification: roots.length ? attemptsGenerated / roots.length : 0
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

  function drawAxis(ctx, box) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();
  }

  function drawLoadPanel(ctx, result, box) {
    panelTitle(ctx, box, "Load over time", "original traffic, retries, and queue depth");
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 56, h: box.h - 70 };
    var maxQps = result.capacityQps;
    result.buckets.forEach(function (bucket) {
      var qps = (bucket.external + bucket.retry) * 1000 / BUCKET_MS;
      maxQps = Math.max(maxQps, qps);
    });
    maxQps *= 1.16;
    var maxQueue = Math.max(1, Math.max.apply(null, result.buckets.map(function (bucket) { return bucket.queue; })));

    drawAxis(ctx, plot);
    result.buckets.forEach(function (bucket, i) {
      var x = plot.x + i / result.buckets.length * plot.w;
      var w = Math.max(1, plot.w / result.buckets.length - 1);
      var externalH = plot.h * ((bucket.external * 1000 / BUCKET_MS) / maxQps);
      var retryH = plot.h * ((bucket.retry * 1000 / BUCKET_MS) / maxQps);
      ctx.fillStyle = "rgba(37,99,235,0.45)";
      ctx.fillRect(x, plot.y + plot.h - externalH, w, externalH);
      ctx.fillStyle = "rgba(180,83,9,0.62)";
      ctx.fillRect(x, plot.y + plot.h - externalH - retryH, w, retryH);
    });

    ctx.strokeStyle = COLORS.capacity;
    ctx.lineWidth = 2;
    var capY = plot.y + plot.h - result.capacityQps / maxQps * plot.h;
    ctx.beginPath();
    ctx.moveTo(plot.x, capY);
    ctx.lineTo(plot.x + plot.w, capY);
    ctx.stroke();

    ctx.strokeStyle = COLORS.queue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.buckets.forEach(function (bucket, index) {
      var x = plot.x + (index + 0.5) / result.buckets.length * plot.w;
      var y = plot.y + plot.h - bucket.queue / maxQueue * plot.h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("qps", plot.x - 8, plot.y + 8);
    ctx.textAlign = "left";
    ctx.fillText("queue", plot.x + plot.w - 34, plot.y + 8);
  }

  function drawLatencyPanel(ctx, result, box) {
    panelTitle(ctx, box, "Client latency", "successful roots only; timeouts become failures");
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 56, h: box.h - 72 };
    var max = Math.max(200, percentile(result.latencies, 0.995), result.p99);
    var bins = 28;
    var counts = Array(bins).fill(0);
    result.latencies.forEach(function (latency) {
      var index = clamp(Math.floor(latency / max * bins), 0, bins - 1);
      counts[index] += 1;
    });
    var maxCount = Math.max.apply(null, counts.concat([1]));
    drawAxis(ctx, plot);
    counts.forEach(function (count, index) {
      var x = plot.x + index / bins * plot.w;
      var w = Math.max(1, plot.w / bins - 1);
      var h = plot.h * count / maxCount;
      ctx.fillStyle = "rgba(15,118,110,0.55)";
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
    });

    [
      { label: "p95", value: result.p95, color: COLORS.retry },
      { label: "p99", value: result.p99, color: COLORS.wasted }
    ].forEach(function (mark) {
      var x = plot.x + clamp(mark.value / max, 0, 1) * plot.w;
      ctx.strokeStyle = mark.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.fillStyle = mark.color;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(mark.label + " " + formatMs(mark.value), x + 4, plot.y + 12);
    });

    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "center";
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(formatMs(max * tick), plot.x + plot.w * tick, plot.y + plot.h + 12);
    });
    ctx.textAlign = "left";
  }

  function drawFatePanel(ctx, result, box) {
    panelTitle(ctx, box, "Attempt fate ledger", "what retry policy turns into work");
    var plot = { x: box.x, y: box.y + 48, w: box.w, h: box.h - 58 };
    var rows = [
      { label: "successful roots", value: result.stats.successes, color: COLORS.success },
      { label: "failed roots", value: result.failed, color: COLORS.failed },
      { label: "wasted after timeout", value: result.stats.wastedAfterTimeout + result.stats.duplicateWork, color: COLORS.wasted },
      { label: "retry budget drops", value: result.stats.budgetDrops, color: COLORS.budget }
    ];
    var maxValue = Math.max.apply(null, rows.map(function (row) { return row.value; }).concat([1]));
    rows.forEach(function (row, index) {
      var y = plot.y + index * 34;
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, plot.x, y + 11);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 124, y, plot.w - 176, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 124, y, (plot.w - 176) * row.value / maxValue, 18);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(row.value.toLocaleString(), plot.x + plot.w, y + 12);
      ctx.textAlign = "left";
    });
  }

  function drawPolicyPanel(ctx, result, params, box) {
    panelTitle(ctx, box, "Policy gauges", "retries help only while they stay inside spare capacity");
    var plot = { x: box.x, y: box.y + 48, w: box.w, h: box.h - 58 };
    var gauges = [
      { label: "work amplification", value: clamp((result.workAmplification - 1) / 2.5, 0, 1), text: formatNumber(result.workAmplification) + "x", color: COLORS.retry },
      { label: "budget used", value: result.retryLimit ? result.retriesScheduled / result.retryLimit : 0, text: result.retriesScheduled + "/" + result.retryLimit, color: COLORS.budget },
      { label: "retry burstiness", value: clamp(result.retryBurst / 2.5, 0, 1), text: formatNumber(result.retryBurst), color: COLORS.queue },
      { label: "cancel effectiveness", value: params.cancelEffectiveness / 100, text: formatPercent(params.cancelEffectiveness), color: COLORS.capacity }
    ];
    gauges.forEach(function (gauge, index) {
      var y = plot.y + index * 36;
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(gauge.label, plot.x, y + 11);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 124, y, plot.w - 178, 18);
      ctx.fillStyle = gauge.color;
      ctx.fillRect(plot.x + 124, y, (plot.w - 178) * clamp(gauge.value, 0, 1), 18);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(gauge.text, plot.x + plot.w, y + 12);
      ctx.textAlign = "left";
    });
  }

  function drawChart(canvas, result, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 880 : 650;
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
      drawLoadPanel(ctx, result, { x: margin, y: 26, w: panelW, h: 240 });
      drawLatencyPanel(ctx, result, { x: margin, y: 298, w: panelW, h: 220 });
      drawFatePanel(ctx, result, { x: margin, y: 552, w: panelW, h: 150 });
      drawPolicyPanel(ctx, result, params, { x: margin, y: 724, w: panelW, h: 132 });
    } else {
      var gap = 42;
      var topW = (width - margin * 2 - gap) / 2;
      drawLoadPanel(ctx, result, { x: margin, y: 28, w: topW, h: 290 });
      drawLatencyPanel(ctx, result, { x: margin + topW + gap, y: 28, w: topW, h: 290 });
      drawFatePanel(ctx, result, { x: margin, y: 366, w: topW, h: 220 });
      drawPolicyPanel(ctx, result, params, { x: margin + topW + gap, y: 366, w: topW, h: 220 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var values = {
      backoffMs: formatMs(params.backoffMs),
      cancelEffectiveness: formatPercent(params.cancelEffectiveness),
      jitter: formatPercent(params.jitter),
      maxAttempts: String(params.maxAttempts),
      offeredLoad: formatPercent(params.offeredLoad),
      retryBudget: formatPercent(params.retryBudget),
      slowTail: formatPercent(params.slowTail),
      timeoutMs: formatMs(params.timeoutMs)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Success rate", formatPercent(result.successRate * 100)),
        metric("p99 latency", formatMs(result.p99)),
        metric("Work amp", formatNumber(result.workAmplification) + "x"),
        metric("Retry attempts", String(result.retriesScheduled)),
        metric("Queue p95", formatNumber(result.queueP95)),
        metric("Failed roots", String(result.failed))
      ].join("");
    }

    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result, params);
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-retry-lab]")).forEach(init);
  }

  var api = {
    simulate: simulate,
    serviceTime: serviceTime
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.RetryLoadLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
