(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    phi: "#2563eb",
    fixed: "#b45309",
    heartbeat: "#0f766e",
    crash: "#be123c",
    good: "#0f766e",
    bad: "#be123c",
    warn: "#b45309"
  };

  var DEFAULTS = {
    heartbeat: 1000,
    jitter: 140,
    pauseChance: 10,
    pauseSize: 1800,
    pauseMargin: 250,
    phiThreshold: 4,
    fixedTimeout: 1200,
    seed: 92
  };

  var CRASH_AT = 26000;
  var HORIZON = 39000;
  var STEP = 100;
  var WINDOW_SIZE = 48;
  var MIN_STD = 35;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function snap(value, fallback, min, max, step) {
    var raw = finite(Number(value), fallback);
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      heartbeat: snap(raw.heartbeat, DEFAULTS.heartbeat, 500, 2000, 100),
      jitter: snap(raw.jitter, DEFAULTS.jitter, 20, 500, 10),
      pauseChance: snap(raw.pauseChance, DEFAULTS.pauseChance, 0, 20, 1),
      pauseSize: snap(raw.pauseSize, DEFAULTS.pauseSize, 0, 3500, 100),
      pauseMargin: snap(raw.pauseMargin, DEFAULTS.pauseMargin, 0, 1200, 50),
      phiThreshold: snap(raw.phiThreshold, DEFAULTS.phiThreshold, 2, 10, 0.5),
      fixedTimeout: snap(raw.fixedTimeout, DEFAULTS.fixedTimeout, 800, 6000, 100),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1)
    };
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6d2b79f5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rand) {
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function mean(values) {
    if (!values.length) return 0;
    var total = 0;
    for (var i = 0; i < values.length; i += 1) total += values[i];
    return total / values.length;
  }

  function stddev(values) {
    if (values.length < 2) return MIN_STD;
    var m = mean(values);
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) {
      var d = values[i] - m;
      sum += d * d;
    }
    return Math.max(MIN_STD, Math.sqrt(sum / (values.length - 1)));
  }

  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    var z = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * z);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return sign * y;
  }

  function normalCdf(x, mu, sigma) {
    var s = Math.max(MIN_STD, sigma);
    return 0.5 * (1 + erf((x - mu) / (s * Math.SQRT2)));
  }

  function phiScore(elapsed, stats, pauseMargin) {
    var effective = Math.max(0, elapsed - pauseMargin);
    var tail = Math.max(1e-12, 1 - normalCdf(effective, stats.mean, stats.std));
    return -Math.log(tail) / Math.LN10;
  }

  function elapsedForPhi(stats, pauseMargin, threshold) {
    var lo = 0;
    var hi = Math.max(2000, stats.mean + pauseMargin + stats.std * 12);
    for (var i = 0; i < 44; i += 1) {
      var mid = (lo + hi) / 2;
      if (phiScore(mid, stats, pauseMargin) >= threshold) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  function makeTrace(raw) {
    var params = normalize(raw);
    var rand = rng(0x9e3779b9 ^ params.seed * 1009);
    var arrivals = [];
    var intervals = [];
    var pauses = [];
    var t = 0;
    while (t < CRASH_AT) {
      var base = params.heartbeat + gaussian(rand) * params.jitter;
      var paused = rand() < params.pauseChance / 100;
      var extra = paused ? params.pauseSize * (0.45 + 0.9 * rand()) : 0;
      var interval = clamp(base + extra, params.heartbeat * 0.35, params.heartbeat + params.pauseSize * 1.6 + params.jitter * 3);
      interval = Math.round(interval / 10) * 10;
      t += interval;
      if (t >= CRASH_AT) break;
      arrivals.push(t);
      intervals.push(interval);
      pauses.push(paused);
    }
    return {
      arrivals: arrivals,
      crashAt: CRASH_AT,
      horizon: HORIZON,
      intervals: intervals,
      params: params,
      pauses: pauses
    };
  }

  function statsFor(samples, heartbeat) {
    var seeded = samples.length ? samples : [heartbeat];
    return {
      mean: mean(seeded),
      std: stddev(seeded),
      count: samples.length
    };
  }

  function countEpisodes(records, key, beforeTime) {
    var active = false;
    var count = 0;
    for (var i = 0; i < records.length; i += 1) {
      var row = records[i];
      if (row.time >= beforeTime) break;
      if (row[key] && !active) {
        count += 1;
        active = true;
      }
      if (!row[key]) active = false;
    }
    return count;
  }

  function firstDetection(records, key, afterTime, threshold) {
    for (var i = 0; i < records.length; i += 1) {
      var row = records[i];
      if (row.time < afterTime) continue;
      if (key === "phi" && row.phi >= threshold) return row.time;
      if (key !== "phi" && row[key]) return row.time;
    }
    return null;
  }

  function simulateTrace(params, trace) {
    var arrivals = trace.arrivals;
    var arrivalIndex = 0;
    var lastHeartbeat = 0;
    var samples = [];
    var records = [];
    var heartbeatEvents = [{ time: 0, paused: false }];

    for (var now = 0; now <= trace.horizon; now += STEP) {
      while (arrivalIndex < arrivals.length && arrivals[arrivalIndex] <= now) {
        var arrived = arrivals[arrivalIndex];
        var interval = arrived - lastHeartbeat;
        samples.push(interval);
        if (samples.length > WINDOW_SIZE) samples.shift();
        lastHeartbeat = arrived;
        heartbeatEvents.push({ time: arrived, paused: trace.pauses[arrivalIndex] });
        arrivalIndex += 1;
      }

      var elapsed = now - lastHeartbeat;
      var stats = statsFor(samples, params.heartbeat);
      var phi = phiScore(elapsed, stats, params.pauseMargin);
      var phiSuspect = phi >= params.phiThreshold;
      var fixedSuspect = elapsed >= params.fixedTimeout;
      records.push({
        elapsed: elapsed,
        fixedSuspect: fixedSuspect,
        mean: stats.mean,
        phi: phi,
        phiSuspect: phiSuspect,
        sampleCount: stats.count,
        std: stats.std,
        time: now
      });
    }

    var phiDetection = firstDetection(records, "phi", trace.crashAt, params.phiThreshold);
    var fixedDetection = firstDetection(records, "fixedSuspect", trace.crashAt);
    var finalStats = records[records.length - 1] || { mean: params.heartbeat, std: MIN_STD, sampleCount: 0 };
    var result = {
      audit: null,
      crashAt: trace.crashAt,
      fixedDetection: fixedDetection,
      fixedFalse: countEpisodes(records, "fixedSuspect", trace.crashAt),
      heartbeatEvents: heartbeatEvents,
      intervals: trace.intervals,
      params: params,
      phiDetection: phiDetection,
      phiFalse: countEpisodes(records, "phiSuspect", trace.crashAt),
      records: records,
      stats: {
        count: finalStats.sampleCount,
        mean: finalStats.mean,
        std: finalStats.std,
        thresholdDelay: elapsedForPhi(finalStats, params.pauseMargin, params.phiThreshold)
      },
      trace: trace
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var arrivalsIncreasing = true;
    for (var i = 1; i < result.trace.arrivals.length; i += 1) {
      if (result.trace.arrivals[i] <= result.trace.arrivals[i - 1]) arrivalsIncreasing = false;
    }
    var arrivalsBeforeCrash = result.trace.arrivals.every(function (time) { return time < result.crashAt; });
    var finitePhi = result.records.every(function (row) {
      return Number.isFinite(row.phi) && row.phi >= 0;
    });
    var windowBounded = result.records.every(function (row) {
      return row.sampleCount <= WINDOW_SIZE;
    });
    var phiEventuallyDetects = result.phiDetection != null;
    var fixedEventuallyDetects = result.fixedDetection != null;
    var slowerThreshold = firstDetection(result.records, "phi", result.crashAt, Math.min(12, result.params.phiThreshold + 1));
    var thresholdMonotone = slowerThreshold == null || result.phiDetection == null || slowerThreshold >= result.phiDetection;
    return {
      arrivalsBeforeCrash: arrivalsBeforeCrash,
      arrivalsIncreasing: arrivalsIncreasing,
      finitePhi: finitePhi,
      fixedEventuallyDetects: fixedEventuallyDetects,
      passed: arrivalsIncreasing && arrivalsBeforeCrash && finitePhi && windowBounded && phiEventuallyDetects && fixedEventuallyDetects && thresholdMonotone,
      phiEventuallyDetects: phiEventuallyDetects,
      thresholdMonotone: thresholdMonotone,
      windowBounded: windowBounded
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    return simulateTrace(params, makeTrace(params));
  }

  function auditPhiAccrualLab() {
    var cases = [
      { label: "default noisy path", params: { heartbeat: 1000, jitter: 140, pauseChance: 10, pauseSize: 1800, pauseMargin: 250, phiThreshold: 4, fixedTimeout: 1200, seed: 92 } },
      { label: "quiet path", params: { heartbeat: 800, jitter: 60, pauseChance: 3, pauseSize: 900, pauseMargin: 150, phiThreshold: 3, fixedTimeout: 1600, seed: 7 } },
      { label: "bursty path", params: { heartbeat: 1200, jitter: 260, pauseChance: 12, pauseSize: 2400, pauseMargin: 600, phiThreshold: 6, fixedTimeout: 3600, seed: 87 } },
      { label: "very noisy path", params: { heartbeat: 1500, jitter: 450, pauseChance: 18, pauseSize: 3200, pauseMargin: 900, phiThreshold: 8, fixedTimeout: 5200, seed: 123 } }
    ];
    var passed = 0;
    var rows = cases.map(function (entry) {
      var result = evaluate(entry.params);
      if (result.audit.passed) passed += 1;
      return {
        failedChecks: Object.keys(result.audit).filter(function (key) {
          return key !== "passed" && !result.audit[key];
        }),
        fixedDetectionMs: result.fixedDetection == null ? null : result.fixedDetection - result.crashAt,
        fixedFalse: result.fixedFalse,
        heartbeat: result.params.heartbeat,
        label: entry.label,
        mean: result.stats.mean,
        passed: result.audit.passed,
        pauseMargin: result.params.pauseMargin,
        phiDetectionMs: result.phiDetection == null ? null : result.phiDetection - result.crashAt,
        phiFalse: result.phiFalse,
        phiThreshold: result.params.phiThreshold,
        seed: result.params.seed,
        std: result.stats.std
      };
    });
    return { cases: rows, passed: passed, total: cases.length };
  }

  function fmtMs(value) {
    if (value == null || !isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(value >= 10000 ? 1 : 2) + " s";
    return Math.round(value) + " ms";
  }

  function fmtNum(value, digits) {
    if (value == null || !isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value, tone) {
    var klass = "phi-lab__metric" + (tone ? " phi-lab__metric--" + tone : "");
    return '<div class="' + klass + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 900);
    var height = width < 650 ? 930 : 660;
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(value, x, y);
  }

  function truncate(ctx, value, maxWidth) {
    if (ctx.measureText(value).width <= maxWidth) return value;
    var out = value;
    while (out.length > 3 && ctx.measureText(out + "...").width > maxWidth) {
      out = out.slice(0, -1);
    }
    return out + "...";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 12, COLORS.text, 13, 760);
    if (subtitle) text(ctx, truncate(ctx, subtitle, box.w - 28), box.x + 14, box.y + 31, COLORS.muted, 11, 520);
  }

  function scale(domain, range) {
    var span = domain.max - domain.min || 1;
    return function (value) {
      return range.min + (value - domain.min) * (range.max - range.min) / span;
    };
  }

  function drawGrid(ctx, plot, xLines, yLines) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= xLines; i += 1) {
      var x = plot.x + plot.w * i / xLines;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    for (var j = 0; j <= yLines; j += 1) {
      var y = plot.y + plot.h * j / yLines;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawScore(ctx, box, result) {
    panel(ctx, box, "suspicion score", "phi rises as silence moves into the modeled tail");
    var plot = { x: box.x + 46, y: box.y + 64, w: box.w - 66, h: box.h - 112 };
    var maxPhi = result.records.reduce(function (m, row) { return Math.max(m, row.phi); }, result.params.phiThreshold + 1);
    maxPhi = Math.min(12, Math.max(6, Math.ceil(maxPhi + 0.5)));
    var sx = scale({ min: 0, max: result.trace.horizon }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: maxPhi }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 6, 4);

    var crashX = sx(result.crashAt);
    ctx.strokeStyle = "rgba(190, 18, 60, 0.55)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(crashX, plot.y - 4);
    ctx.lineTo(crashX, plot.y + plot.h + 18);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "crash", crashX + 5, plot.y - 18, COLORS.crash, 10, 760);

    var thresholdY = sy(result.params.phiThreshold);
    ctx.strokeStyle = "rgba(37, 99, 235, 0.55)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, thresholdY);
    ctx.lineTo(plot.x + plot.w, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "threshold " + fmtNum(result.params.phiThreshold, 1), plot.x + 6, thresholdY - 15, COLORS.phi, 10, 760);

    ctx.strokeStyle = COLORS.phi;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    result.records.forEach(function (row, index) {
      var x = sx(row.time);
      var y = sy(Math.min(maxPhi, row.phi));
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    var tickY = plot.y + plot.h + 13;
    result.heartbeatEvents.forEach(function (event) {
      var x = sx(event.time);
      ctx.strokeStyle = event.paused ? COLORS.fixed : COLORS.heartbeat;
      ctx.lineWidth = event.paused ? 2 : 1.4;
      ctx.beginPath();
      ctx.moveTo(x, tickY - (event.paused ? 9 : 5));
      ctx.lineTo(x, tickY + 5);
      ctx.stroke();
    });

    var yBand = plot.y + plot.h + 27;
    result.records.forEach(function (row) {
      if (!row.fixedSuspect && !row.phiSuspect) return;
      var x = sx(row.time);
      ctx.fillStyle = row.phiSuspect ? "rgba(37, 99, 235, 0.24)" : "rgba(180, 83, 9, 0.22)";
      ctx.fillRect(x, yBand, Math.max(1, plot.w / result.records.length + 0.5), 7);
      if (row.fixedSuspect) {
        ctx.fillStyle = "rgba(180, 83, 9, 0.28)";
        ctx.fillRect(x, yBand + 8, Math.max(1, plot.w / result.records.length + 0.5), 7);
      }
    });

    text(ctx, "0", plot.x - 8, sy(0) - 7, COLORS.muted, 10, 650, "right");
    text(ctx, String(maxPhi), plot.x - 8, sy(maxPhi) - 7, COLORS.muted, 10, 650, "right");
    text(ctx, "heartbeats and suspicion bands", plot.x, box.y + box.h - 24, COLORS.muted, 11, 520);
  }

  function drawHistogram(ctx, box, result) {
    panel(ctx, box, "learned interval model", "recent inter-arrival samples drive the tail probability");
    var plot = { x: box.x + 42, y: box.y + 64, w: box.w - 64, h: box.h - 104 };
    var maxInterval = Math.max.apply(null, result.intervals.concat([result.stats.thresholdDelay, result.params.fixedTimeout, result.params.heartbeat * 2]));
    maxInterval = Math.ceil(maxInterval / 500) * 500;
    var bins = 14;
    var counts = new Array(bins);
    for (var b = 0; b < bins; b += 1) counts[b] = 0;
    result.intervals.forEach(function (interval) {
      var bucket = clamp(Math.floor(interval / maxInterval * bins), 0, bins - 1);
      counts[bucket] += 1;
    });
    var maxCount = Math.max.apply(null, counts.concat([1]));
    var sx = scale({ min: 0, max: maxInterval }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: maxCount }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 3);

    counts.forEach(function (count, i) {
      var x0 = plot.x + i * plot.w / bins + 2;
      var w = plot.w / bins - 4;
      var y = sy(count);
      ctx.fillStyle = "rgba(15, 118, 110, 0.72)";
      ctx.fillRect(x0, y, w, plot.y + plot.h - y);
    });

    function marker(value, color, label, offset) {
      var x = sx(clamp(value, 0, maxInterval));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h + 4);
      ctx.stroke();
      text(ctx, label, x + 4, plot.y + 8 + offset, color, 10, 760);
    }

    marker(result.stats.mean, COLORS.heartbeat, "mean", 0);
    marker(result.stats.thresholdDelay, COLORS.phi, "phi fires", 15);
    marker(result.params.fixedTimeout, COLORS.fixed, "fixed", 30);

    text(ctx, "0 ms", plot.x, box.y + box.h - 26, COLORS.muted, 10, 520);
    text(ctx, fmtMs(maxInterval), plot.x + plot.w, box.y + box.h - 26, COLORS.muted, 10, 520, "right");
  }

  function drawComparison(ctx, box, result) {
    panel(ctx, box, "policy comparison", "false suspicion before crash versus delay after crash");
    var plot = { x: box.x + 118, y: box.y + 70, w: box.w - 154, h: box.h - 118 };
    var rows = [
      { color: COLORS.phi, delay: result.phiDetection == null ? null : result.phiDetection - result.crashAt, falseCount: result.phiFalse, label: "phi accrual" },
      { color: COLORS.fixed, delay: result.fixedDetection == null ? null : result.fixedDetection - result.crashAt, falseCount: result.fixedFalse, label: "fixed timer" }
    ];
    var maxDelay = Math.max.apply(null, rows.map(function (row) { return row.delay || 0; }).concat([1]));
    var maxFalse = Math.max.apply(null, rows.map(function (row) { return row.falseCount; }).concat([1]));
    rows.forEach(function (row, i) {
      var y = plot.y + i * 70;
      text(ctx, row.label, box.x + 16, y + 5, COLORS.text, 11, 760);
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(plot.x, y, plot.w, 13);
      ctx.fillRect(plot.x, y + 25, plot.w, 13);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, plot.w * (row.delay || 0) / maxDelay, 13);
      ctx.fillStyle = "rgba(190, 18, 60, 0.42)";
      ctx.fillRect(plot.x, y + 25, plot.w * row.falseCount / maxFalse, 13);
      text(ctx, fmtMs(row.delay), plot.x + plot.w + 8, y - 1, row.color, 10, 760);
      text(ctx, row.falseCount + " false", plot.x + plot.w + 8, y + 24, COLORS.crash, 10, 760);
    });
    text(ctx, "top bar: detection delay; bottom bar: false episodes", box.x + 16, box.y + box.h - 28, COLORS.muted, 11, 520);
  }

  function drawAudit(ctx, box, result) {
    panel(ctx, box, "simulation audit", "same trace, bounded window, finite scores");
    var rows = [
      ["arrivals strictly increase", result.audit.arrivalsIncreasing],
      ["no heartbeat after crash", result.audit.arrivalsBeforeCrash],
      ["phi stays finite and nonnegative", result.audit.finitePhi],
      ["sample window is bounded", result.audit.windowBounded],
      ["higher threshold is no earlier", result.audit.thresholdMonotone]
    ];
    var y = box.y + 61;
    rows.forEach(function (row) {
      ctx.fillStyle = row[1] ? "rgba(15, 118, 110, 0.11)" : "rgba(190, 18, 60, 0.10)";
      ctx.strokeStyle = row[1] ? "rgba(15, 118, 110, 0.28)" : "rgba(190, 18, 60, 0.28)";
      ctx.beginPath();
      ctx.roundRect(box.x + 16, y - 4, box.w - 32, 23, 6);
      ctx.fill();
      ctx.stroke();
      text(ctx, truncate(ctx, row[0], box.w - 88), box.x + 28, y, COLORS.text, 10.5, 650);
      text(ctx, row[1] ? "pass" : "fail", box.x + box.w - 28, y, row[1] ? COLORS.good : COLORS.bad, 10.5, 760, "right");
      y += 29;
    });
    text(ctx, "window samples: " + result.stats.count + "/" + WINDOW_SIZE, box.x + 18, box.y + box.h - 28, COLORS.muted, 11, 650);
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    if (width < 650) {
      var pad = 14;
      var gap = 14;
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawScore(ctx, { x: pad, y: pad, w: width - 2 * pad, h: panelH }, result);
      drawHistogram(ctx, { x: pad, y: pad + panelH + gap, w: width - 2 * pad, h: panelH }, result);
      drawComparison(ctx, { x: pad, y: pad + 2 * (panelH + gap), w: width - 2 * pad, h: panelH }, result);
      drawAudit(ctx, { x: pad, y: pad + 3 * (panelH + gap), w: width - 2 * pad, h: panelH }, result);
      return;
    }

    var outer = 16;
    var gap2 = 14;
    var halfW = (width - outer * 2 - gap2) / 2;
    var halfH = (height - outer * 2 - gap2) / 2;
    drawScore(ctx, { x: outer, y: outer, w: halfW, h: halfH }, result);
    drawHistogram(ctx, { x: outer + halfW + gap2, y: outer, w: halfW, h: halfH }, result);
    drawComparison(ctx, { x: outer, y: outer + halfH + gap2, w: halfW, h: halfH }, result);
    drawAudit(ctx, { x: outer + halfW + gap2, y: outer + halfH + gap2, w: halfW, h: halfH }, result);
  }

  function setOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      var value = params[key];
      if (key === "heartbeat" || key === "jitter" || key === "pauseSize" || key === "pauseMargin" || key === "fixedTimeout") value = value + " ms";
      if (key === "pauseChance") value = value + "%";
      if (key === "phiThreshold") value = fmtNum(value, 1);
      output.textContent = String(value);
    });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return normalize(raw);
  }

  function renderMetrics(root, result) {
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    holder.innerHTML = [
      metric("Phi detects", fmtMs(result.phiDetection == null ? null : result.phiDetection - result.crashAt), "good"),
      metric("Fixed detects", fmtMs(result.fixedDetection == null ? null : result.fixedDetection - result.crashAt)),
      metric("Phi false episodes", String(result.phiFalse), result.phiFalse <= result.fixedFalse ? "good" : "warn"),
      metric("Fixed false episodes", String(result.fixedFalse), result.fixedFalse > result.phiFalse ? "warn" : ""),
      metric("Mean +/- sd", fmtMs(result.stats.mean) + " +/- " + fmtMs(result.stats.std)),
      metric("Audit", result.audit.passed ? "pass" : "fail", result.audit.passed ? "good" : "bad")
    ].join("");
  }

  function init(root) {
    if (!root || root.__phiAccrualReady) return;
    root.__phiAccrualReady = true;
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var pending = false;

    function render() {
      pending = false;
      var params = readParams(root);
      setOutputs(root, params);
      var result = evaluate(params);
      root.__phiAccrualResult = result;
      renderMetrics(root, result);
      draw(result, canvas);
    }

    function schedule() {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(render);
    }

    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-phi-accrual-lab]")).forEach(init);
  }

  var api = {
    auditPhiAccrualLab: auditPhiAccrualLab,
    evaluate: evaluate,
    makeTrace: makeTrace,
    normalize: normalize,
    phiScore: phiScore
  };

  global.PhiAccrualLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
