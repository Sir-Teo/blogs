(function (global) {
  "use strict";

  var HORIZON = 240;
  var CHANGE_AT = 96;
  var MC_REPS = 80;

  var COLORS = {
    amber: "#d97706",
    axis: "#d7dee5",
    blue: "#2563eb",
    cusum: "#0f766e",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    ph: "#7c3aed",
    red: "#be123c",
    softAmber: "rgba(217, 119, 6, 0.15)",
    softBlue: "rgba(37, 99, 235, 0.12)",
    softGreen: "rgba(15, 118, 110, 0.13)",
    softPurple: "rgba(124, 58, 237, 0.12)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    scenario: "abrupt",
    seed: 29,
    shift: 1.1,
    noise: 1.0,
    target: 1.0,
    slack: 0.04,
    threshold: 8
  };

  var SCENARIOS = {
    abrupt: {
      label: "abrupt mean shift",
      note: "The mean jumps once and stays there. This is the classical one-sided CUSUM home court."
    },
    ramp: {
      label: "slow drift",
      note: "The mean moves gradually. The detector has to decide when enough weak evidence has accumulated."
    },
    variance: {
      label: "variance burst",
      note: "The mean does not move; the noise scale does. A mean-shift detector can still become jumpy."
    },
    stationary: {
      label: "no change",
      note: "The stream is stationary, so any alarm is a false alarm paid for by the threshold."
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value, fallback) {
    value = Number(value);
    return isFinite(value) ? value : fallback;
  }

  function snap(value, fallback, min, max, step) {
    var raw = number(value, fallback);
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      noise: snap(raw.noise, DEFAULTS.noise, 0.55, 1.85, 0.05),
      scenario: SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 9999, 1),
      shift: snap(raw.shift, DEFAULTS.shift, 0.25, 2.2, 0.05),
      slack: snap(raw.slack, DEFAULTS.slack, 0, 0.2, 0.01),
      target: snap(raw.target, DEFAULTS.target, 0.35, 2.2, 0.05),
      threshold: snap(raw.threshold, DEFAULTS.threshold, 3, 18, 0.5)
    };
  }

  function hash32(x) {
    x |= 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function rng(seed) {
    var state = hash32(seed || 1);
    return function () {
      state = hash32(state + 0x9e3779b9);
      return state / 4294967296;
    };
  }

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function meanAt(t, params, scenario) {
    if (scenario === "stationary" || scenario === "variance") return 0;
    if (scenario === "abrupt") return t >= CHANGE_AT ? params.shift * params.noise : 0;
    if (scenario === "ramp") {
      var progress = clamp((t - CHANGE_AT) / 80, 0, 1);
      return progress * params.shift * params.noise;
    }
    return 0;
  }

  function sigmaAt(t, params, scenario) {
    if (scenario === "variance" && t >= CHANGE_AT) return params.noise * (1 + 0.55 * params.shift);
    return params.noise;
  }

  function simulateStream(params, scenario, seedOffset) {
    params = cleanParams(params);
    scenario = scenario || params.scenario;
    var rand = rng(params.seed * 1009 + (seedOffset || 0) * 9176 + scenario.length * 97);
    var values = [];
    var means = [];
    var sigmas = [];
    for (var t = 0; t < HORIZON; t += 1) {
      var mu = meanAt(t, params, scenario);
      var sigma = sigmaAt(t, params, scenario);
      var seasonal = 0.08 * params.noise * Math.sin(t * 0.13 + params.seed * 0.01);
      var value = mu + seasonal + sigma * normal(rand);
      values.push(value);
      means.push(mu);
      sigmas.push(sigma);
    }
    return { changeAt: scenario === "stationary" ? null : CHANGE_AT, means: means, scenario: scenario, sigmas: sigmas, values: values };
  }

  function firstCrossing(stats, threshold) {
    for (var i = 0; i < stats.length; i += 1) {
      if (stats[i] >= threshold) return i;
    }
    return null;
  }

  function pageHinkleyThreshold(threshold) {
    return threshold * 2.4;
  }

  function runCusum(values, params, threshold) {
    params = cleanParams(params);
    threshold = threshold == null ? params.threshold : threshold;
    var delta = Math.max(params.target, 1e-6);
    var g = 0;
    var cumulative = 0;
    var minCumulative = 0;
    var stats = [];
    var increments = [];
    var explicit = [];
    for (var t = 0; t < values.length; t += 1) {
      var standardized = values[t] / params.noise;
      var inc = delta * (standardized - delta / 2);
      increments.push(inc);
      g = Math.max(0, g + inc);
      cumulative += inc;
      minCumulative = Math.min(minCumulative, cumulative);
      stats.push(g);
      explicit.push(cumulative - minCumulative);
    }
    return {
      alarm: firstCrossing(stats, threshold),
      explicit: explicit,
      increments: increments,
      stats: stats,
      threshold: threshold
    };
  }

  function runPageHinkley(values, params, threshold) {
    params = cleanParams(params);
    threshold = threshold == null ? params.threshold : threshold;
    var mean = 0;
    var cumulative = 0;
    var minCumulative = 0;
    var stats = [];
    var means = [];
    for (var t = 0; t < values.length; t += 1) {
      mean += (values[t] - mean) / (t + 1);
      cumulative += values[t] - mean - params.slack * params.noise;
      minCumulative = Math.min(minCumulative, cumulative);
      stats.push(cumulative - minCumulative);
      means.push(mean);
    }
    return {
      alarm: firstCrossing(stats, threshold),
      cumulative: cumulative,
      means: means,
      stats: stats,
      threshold: threshold
    };
  }

  function summarizeAlarm(alarm, changeAt) {
    if (alarm == null) return { delay: null, missed: true, preChange: false };
    if (changeAt != null && alarm < changeAt) return { delay: null, missed: false, preChange: true };
    return { delay: changeAt == null ? null : alarm - changeAt, missed: false, preChange: false };
  }

  function summarizeRuns(runs, changeAt) {
    var falseAlarms = 0;
    var preChange = 0;
    var misses = 0;
    var delays = [];
    var runLengths = [];
    runs.forEach(function (alarm) {
      if (changeAt == null) {
        if (alarm != null) falseAlarms += 1;
        runLengths.push(alarm == null ? HORIZON + 1 : alarm + 1);
      } else {
        var summary = summarizeAlarm(alarm, changeAt);
        if (summary.preChange) preChange += 1;
        if (summary.missed) misses += 1;
        if (summary.delay != null) delays.push(summary.delay);
      }
    });
    return {
      avgDelay: delays.length ? delays.reduce(function (a, b) { return a + b; }, 0) / delays.length : null,
      avgRunLength: runLengths.length ? runLengths.reduce(function (a, b) { return a + b; }, 0) / runLengths.length : null,
      detectionRate: changeAt == null ? null : delays.length / runs.length,
      falseAlarmRate: changeAt == null ? falseAlarms / runs.length : preChange / runs.length,
      missRate: changeAt == null ? null : misses / runs.length
    };
  }

  function monteCarlo(params, threshold) {
    params = cleanParams(params);
    threshold = threshold == null ? params.threshold : threshold;
    var noChangeCusum = [];
    var noChangePh = [];
    var changedCusum = [];
    var changedPh = [];
    var scenario = params.scenario === "stationary" ? "abrupt" : params.scenario;
    for (var r = 0; r < MC_REPS; r += 1) {
      var nullStream = simulateStream(params, "stationary", 2000 + r);
      noChangeCusum.push(runCusum(nullStream.values, params, threshold).alarm);
      noChangePh.push(runPageHinkley(nullStream.values, params, pageHinkleyThreshold(threshold)).alarm);

      var changedStream = simulateStream(params, scenario, 5000 + r);
      changedCusum.push(runCusum(changedStream.values, params, threshold).alarm);
      changedPh.push(runPageHinkley(changedStream.values, params, pageHinkleyThreshold(threshold)).alarm);
    }
    return {
      cusum: {
        change: summarizeRuns(changedCusum, CHANGE_AT),
        null: summarizeRuns(noChangeCusum, null)
      },
      ph: {
        change: summarizeRuns(changedPh, CHANGE_AT),
        null: summarizeRuns(noChangePh, null)
      },
      threshold: threshold
    };
  }

  function makeFrontier(params) {
    var thresholds = [4, 5.5, 7, 8.5, 10, 12, 14, 16];
    return thresholds.map(function (threshold) {
      return monteCarlo(params, threshold);
    });
  }

  function evaluate(raw, options) {
    var params = cleanParams(raw);
    options = options || {};
    var stream = simulateStream(params, params.scenario, 0);
    var cusum = runCusum(stream.values, params, params.threshold);
    var ph = runPageHinkley(stream.values, params, pageHinkleyThreshold(params.threshold));
    var mc = monteCarlo(params, params.threshold);
    var result = {
      cusum: cusum,
      mc: mc,
      params: params,
      ph: ph,
      stream: stream
    };
    if (options.frontier !== false) result.frontier = makeFrontier(params);
    return result;
  }

  function close(a, b, tol) {
    return Math.abs(a - b) <= (tol == null ? 1e-9 : tol);
  }

  function audit() {
    var params = cleanParams({ scenario: "abrupt", seed: 41, shift: 1.2, noise: 1, target: 1, threshold: 8, slack: 0.04 });
    var stream = simulateStream(params, "abrupt", 0);
    var cusum = runCusum(stream.values, params, 8);
    var ph = runPageHinkley(stream.values, params, 8);
    var displayedPh = runPageHinkley(stream.values, params, pageHinkleyThreshold(8));
    var maxIdentityError = 0;
    for (var i = 0; i < cusum.stats.length; i += 1) {
      maxIdentityError = Math.max(maxIdentityError, Math.abs(cusum.stats[i] - cusum.explicit[i]));
    }
    var low = firstCrossing(cusum.stats, 5);
    var high = firstCrossing(cusum.stats, 11);
    var monotone = (high == null && low != null) || (high != null && low != null && high >= low) || (high == null && low == null);
    var phNonnegative = ph.stats.every(function (value) { return value >= -1e-12; });
    var quiet = simulateStream(params, "stationary", 901);
    var quietAlarm = runCusum(quiet.values, params, 100).alarm;
    var mc = monteCarlo(params, 8);
    var bounded = [mc.cusum.null.falseAlarmRate, mc.ph.null.falseAlarmRate, mc.cusum.change.detectionRate, mc.ph.change.detectionRate].every(function (value) {
      return value == null || (value >= 0 && value <= 1);
    });
    var ok = maxIdentityError < 1e-10 && monotone && phNonnegative && quietAlarm == null && bounded;
    return {
      checks: {
        boundedRates: bounded,
        cusumIdentityError: maxIdentityError,
        highThresholdNoEarlyAlarm: monotone,
        pageHinkleyNonnegative: phNonnegative,
        quietHighThresholdHasNoAlarm: quietAlarm == null
      },
      ok: ok,
      sampleMetrics: {
        cusumAlarm: cusum.alarm,
        cusumDelay: cusum.alarm == null ? null : cusum.alarm - CHANGE_AT,
        falseAlarmRate: mc.cusum.null.falseAlarmRate,
        phAlarm: displayedPh.alarm
      }
    };
  }

  function percent(value, digits) {
    if (value == null || !isFinite(value)) return "n/a";
    return (value * 100).toFixed(digits == null ? 0 : digits) + "%";
  }

  function format(value, digits) {
    if (value == null || !isFinite(value)) return "n/a";
    return Number(value).toFixed(digits == null ? 1 : digits);
  }

  function alarmText(alarm, changeAt) {
    if (alarm == null) return "none";
    if (changeAt != null && alarm >= changeAt) return "+" + (alarm - changeAt);
    return String(alarm + 1);
  }

  function metric(label, value, tone) {
    return '<div class="seq-change-lab__metric ' + (tone || "") + '">' +
      "<span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function canvasSize(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.width || 760));
    var ratio = Number(canvas.getAttribute("data-ratio")) || 0.72;
    var height = Math.max(360, Math.round(width * ratio));
    var dpr = global.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.ink;
    ctx.font = (options.weight || 650) + " " + (options.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = "#e4e9ef";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 12, box.y + 17, { color: COLORS.ink, size: 12, weight: 750 });
    if (subtitle) drawText(ctx, subtitle, box.x + 12, box.y + 35, { color: COLORS.muted, size: 10, weight: 600 });
  }

  function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
    var span = Math.max(domainMax - domainMin, 1e-9);
    return function (value) {
      return rangeMin + (value - domainMin) / span * (rangeMax - rangeMin);
    };
  }

  function drawAxes(ctx, plot, yTicks) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= yTicks; i += 1) {
      var y = plot.y + i / yTicks * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    for (var j = 0; j <= 4; j += 1) {
      var x = plot.x + j / 4 * plot.w;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawLine(ctx, values, sx, sy, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    values.forEach(function (value, i) {
      var x = sx(i);
      var y = sy(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawAlarm(ctx, alarm, plot, color, label) {
    if (alarm == null) return;
    var x = plot.x + alarm / (HORIZON - 1) * plot.w;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, label, x + 4, plot.y + 12, { color: color, size: 10, weight: 800 });
  }

  function drawStream(ctx, box, result) {
    panel(ctx, box, "Stream", "observations, true mean, and first alarms");
    var plot = { x: box.x + 44, y: box.y + 48, w: box.w - 60, h: box.h - 70 };
    var all = result.stream.values.concat(result.stream.means);
    var min = Math.min.apply(null, all);
    var max = Math.max.apply(null, all);
    var pad = Math.max(0.5, (max - min) * 0.14);
    min -= pad;
    max += pad;
    var sx = scaleLinear(0, HORIZON - 1, plot.x, plot.x + plot.w);
    var sy = scaleLinear(min, max, plot.y + plot.h, plot.y);
    drawAxes(ctx, plot, 4);
    if (result.stream.changeAt != null) {
      var cx = sx(result.stream.changeAt);
      ctx.fillStyle = "rgba(217, 119, 6, 0.08)";
      ctx.fillRect(cx, plot.y, plot.x + plot.w - cx, plot.h);
      ctx.strokeStyle = COLORS.amber;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, plot.y);
      ctx.lineTo(cx, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      drawText(ctx, "change", cx + 5, plot.y + plot.h - 11, { color: COLORS.amber, size: 10, weight: 800 });
    }
    drawLine(ctx, result.stream.means, sx, sy, COLORS.amber, 2.2);
    drawLine(ctx, result.stream.values, sx, sy, COLORS.blue, 1.35);
    drawAlarm(ctx, result.cusum.alarm, plot, COLORS.cusum, "CUSUM");
    drawAlarm(ctx, result.ph.alarm, plot, COLORS.ph, "PH");
    drawText(ctx, format(max, 1), box.x + 10, plot.y, { color: COLORS.muted, size: 10, align: "left" });
    drawText(ctx, format(min, 1), box.x + 10, plot.y + plot.h, { color: COLORS.muted, size: 10, align: "left" });
  }

  function drawStats(ctx, box, result) {
    panel(ctx, box, "Evidence ledger", "recursive score versus alarm threshold");
    var plot = { x: box.x + 44, y: box.y + 48, w: box.w - 60, h: box.h - 70 };
    var max = Math.max(result.ph.threshold * 1.08, result.params.threshold * 1.15, Math.max.apply(null, result.cusum.stats), Math.max.apply(null, result.ph.stats));
    var sx = scaleLinear(0, HORIZON - 1, plot.x, plot.x + plot.w);
    var sy = scaleLinear(0, max, plot.y + plot.h, plot.y);
    drawAxes(ctx, plot, 4);
    var ty = sy(result.params.threshold);
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, ty);
    ctx.lineTo(plot.x + plot.w, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "threshold", plot.x + plot.w - 4, ty - 9, { color: COLORS.red, size: 10, align: "right", weight: 800 });
    var phy = sy(result.ph.threshold);
    ctx.strokeStyle = COLORS.ph;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, phy);
    ctx.lineTo(plot.x + plot.w, phy);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "PH threshold", plot.x + plot.w - 4, phy - 9, { color: COLORS.ph, size: 10, align: "right", weight: 800 });
    drawLine(ctx, result.cusum.stats, sx, sy, COLORS.cusum, 2.2);
    drawLine(ctx, result.ph.stats, sx, sy, COLORS.ph, 2);
    drawText(ctx, "CUSUM", plot.x + 10, plot.y + 15, { color: COLORS.cusum, size: 11, weight: 800 });
    drawText(ctx, "Page-Hinkley", plot.x + 78, plot.y + 15, { color: COLORS.ph, size: 11, weight: 800 });
  }

  function drawFrontier(ctx, box, result) {
    panel(ctx, box, "False alarms buy delay", "threshold sweep on shared Monte Carlo settings");
    var plot = { x: box.x + 48, y: box.y + 52, w: box.w - 70, h: box.h - 84 };
    var points = [];
    result.frontier.forEach(function (row) {
      points.push({ detector: "CUSUM", color: COLORS.cusum, delay: row.cusum.change.avgDelay, falseAlarm: row.cusum.null.falseAlarmRate, threshold: row.threshold });
      points.push({ detector: "PH", color: COLORS.ph, delay: row.ph.change.avgDelay, falseAlarm: row.ph.null.falseAlarmRate, threshold: row.threshold });
    });
    var maxDelay = Math.max(8, Math.max.apply(null, points.map(function (p) { return p.delay == null ? 0 : p.delay; })) * 1.15);
    var sx = scaleLinear(0, 1, plot.x, plot.x + plot.w);
    var sy = scaleLinear(0, maxDelay, plot.y + plot.h, plot.y);
    drawAxes(ctx, plot, 4);
    points.forEach(function (p) {
      if (p.delay == null) return;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.abs(p.threshold - result.params.threshold) < 1e-9 ? 1 : 0.46;
      ctx.beginPath();
      ctx.arc(sx(p.falseAlarm), sy(p.delay), Math.abs(p.threshold - result.params.threshold) < 1e-9 ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawText(ctx, "false alarm rate by " + HORIZON + " ticks", plot.x, box.y + box.h - 18, { color: COLORS.muted, size: 10, weight: 650 });
    drawText(ctx, "delay", plot.x - 28, plot.y + 3, { color: COLORS.muted, size: 10, weight: 650 });
  }

  function drawCanvas(canvas, result) {
    if (!canvas) return;
    var size = canvasSize(canvas);
    var ctx = size.ctx;
    var w = size.width;
    var h = size.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    var gap = 12;
    var topH = Math.max(180, Math.round(h * 0.43));
    var half = (w - gap) / 2;
    if (w < 680) {
      drawStream(ctx, { x: 0, y: 0, w: w, h: topH }, result);
      drawStats(ctx, { x: 0, y: topH + gap, w: w, h: topH }, result);
      drawFrontier(ctx, { x: 0, y: 2 * topH + 2 * gap, w: w, h: h - 2 * topH - 2 * gap }, result);
    } else {
      drawStream(ctx, { x: 0, y: 0, w: half, h: topH }, result);
      drawStats(ctx, { x: half + gap, y: 0, w: half, h: topH }, result);
      drawFrontier(ctx, { x: 0, y: topH + gap, w: w, h: h - topH - gap }, result);
    }
  }

  function renderMetrics(root, result) {
    var el = root.querySelector("[data-role='metrics']");
    if (!el) return;
    var changeAt = result.stream.changeAt;
    var cusumSummary = summarizeAlarm(result.cusum.alarm, changeAt);
    var phSummary = summarizeAlarm(result.ph.alarm, changeAt);
    el.innerHTML = [
      metric("CUSUM alarm", alarmText(result.cusum.alarm, changeAt), cusumSummary.preChange ? "seq-change-lab__metric--bad" : "seq-change-lab__metric--good"),
      metric("Page-Hinkley alarm", alarmText(result.ph.alarm, changeAt), phSummary.preChange ? "seq-change-lab__metric--bad" : "seq-change-lab__metric--good"),
      metric("CUSUM false alarms", percent(result.mc.cusum.null.falseAlarmRate, 0), result.mc.cusum.null.falseAlarmRate < 0.15 ? "seq-change-lab__metric--good" : "seq-change-lab__metric--warn"),
      metric("PH false alarms", percent(result.mc.ph.null.falseAlarmRate, 0), result.mc.ph.null.falseAlarmRate < 0.15 ? "seq-change-lab__metric--good" : "seq-change-lab__metric--warn"),
      metric("CUSUM avg delay", format(result.mc.cusum.change.avgDelay, 1), ""),
      metric("PH avg delay", format(result.mc.ph.change.avgDelay, 1), "")
    ].join("");
  }

  function renderNote(root, result) {
    var el = root.querySelector("[data-role='note']");
    if (!el) return;
    var cusumArl = result.mc.cusum.null.avgRunLength;
    var phArl = result.mc.ph.null.avgRunLength;
    el.textContent = SCENARIOS[result.params.scenario].note + " Monte Carlo uses " + MC_REPS +
      " no-change streams and " + MC_REPS + " changed streams. The no-change average run-length proxies are " +
      format(cusumArl, 1) + " ticks for CUSUM and " + format(phArl, 1) +
      " ticks for Page-Hinkley, capped by the " + HORIZON + "-tick lab horizon.";
  }

  function updateOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      var out = root.querySelector("[data-value='" + key + "']");
      if (!out) return;
      if (key === "scenario") out.textContent = SCENARIOS[params.scenario].label;
      else if (key === "threshold") out.textContent = format(params[key], 1);
      else if (key === "slack") out.textContent = format(params[key], 2);
      else out.textContent = format(params[key], key === "seed" ? 0 : 2).replace(/\.00$/, "");
    });
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function syncControls(root, params) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (params[key] != null && input.value !== String(params[key])) input.value = String(params[key]);
    });
  }

  function render(root) {
    var params = readParams(root);
    syncControls(root, params);
    updateOutputs(root, params);
    var result = evaluate(params);
    renderMetrics(root, result);
    renderNote(root, result);
    drawCanvas(root.querySelector("[data-role='canvas']"), result);
    root.__sequentialChangeResult = result;
  }

  function init(root) {
    if (!root || root.__sequentialChangeReady) return;
    root.__sequentialChangeReady = true;
    var schedule = function () {
      if (root.__sequentialChangeFrame) global.cancelAnimationFrame(root.__sequentialChangeFrame);
      root.__sequentialChangeFrame = global.requestAnimationFrame(function () {
        root.__sequentialChangeFrame = null;
        render(root);
      });
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    schedule();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-sequential-change-lab]")).forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    monteCarlo: monteCarlo,
    runCusum: runCusum,
    runPageHinkley: runPageHinkley,
    simulateStream: simulateStream
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SequentialChangeLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
