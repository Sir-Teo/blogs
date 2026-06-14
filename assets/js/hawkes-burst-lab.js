(function (root) {
  "use strict";

  var COLORS = {
    hawkes: "#be123c",
    poisson: "#2563eb",
    intensity: "#d97706",
    baseline: "#0f766e",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    burst: "#7c3aed"
  };

  var DEFAULTS = {
    baseline: 80,
    branching: 65,
    decay: 180,
    horizon: 80,
    seed: 3,
    binCount: 32
  };

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
      baseline: snap(raw.baseline, DEFAULTS.baseline, 20, 260, 5) / 100,
      branching: snap(raw.branching, DEFAULTS.branching, 0, 95, 5) / 100,
      decay: snap(raw.decay, DEFAULTS.decay, 40, 600, 10) / 100,
      horizon: snap(raw.horizon, DEFAULTS.horizon, 30, 160, 5),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1),
      binCount: DEFAULTS.binCount
    };
  }

  function lcg(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function expRand(rand, rate) {
    return -Math.log(Math.max(1e-12, 1 - rand())) / Math.max(1e-12, rate);
  }

  function poissonSample(rand, mean) {
    if (mean <= 0) return 0;
    if (mean < 35) {
      var limit = Math.exp(-mean);
      var p = 1;
      var k = 0;
      do {
        k += 1;
        p *= rand();
      } while (p > limit);
      return k - 1;
    }
    var z = Math.sqrt(-2 * Math.log(Math.max(1e-12, rand()))) * Math.cos(2 * Math.PI * rand());
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * z));
  }

  function simulateHawkes(params) {
    var rand = lcg(params.seed * 1000003 + 0x5eed);
    var mu = params.baseline;
    var beta = params.decay;
    var alpha = params.branching * beta;
    var initialExcitation = params.branching > 0 ? mu * params.branching / Math.max(1e-9, 1 - params.branching) : 0;
    var t = 0;
    var excitation = initialExcitation;
    var events = [];
    var intensityPoints = [{ t: 0, value: mu + excitation }];
    var maxEvents = 8000;

    while (t < params.horizon && events.length < maxEvents) {
      var upper = Math.max(mu + excitation, 1e-9);
      var wait = expRand(rand, upper);
      var nextT = t + wait;
      if (nextT > params.horizon) {
        excitation *= Math.exp(-beta * (params.horizon - t));
        intensityPoints.push({ t: params.horizon, value: mu + excitation });
        break;
      }
      excitation *= Math.exp(-beta * wait);
      t = nextT;
      var lambdaBefore = mu + excitation;
      if (rand() <= lambdaBefore / upper) {
        events.push({ t: t, lambdaBefore: lambdaBefore, parentShare: excitation / Math.max(lambdaBefore, 1e-12) });
        intensityPoints.push({ t: t, value: lambdaBefore });
        excitation += alpha;
        intensityPoints.push({ t: t, value: mu + excitation });
      } else {
        intensityPoints.push({ t: t, value: lambdaBefore });
      }
    }
    return { events: events, initialExcitation: initialExcitation, intensityPoints: compressIntensity(intensityPoints, params.horizon) };
  }

  function compressIntensity(points, horizon) {
    if (points.length < 600) return points;
    var out = [{ t: 0, value: points[0].value }];
    var stride = Math.ceil(points.length / 520);
    for (var i = 1; i < points.length - 1; i += stride) out.push(points[i]);
    out.push(points[points.length - 1] || { t: horizon, value: 0 });
    return out;
  }

  function simulatePoisson(params, rate) {
    var rand = lcg(params.seed * 1000003 + 0xc0ffee);
    var events = [];
    var t = 0;
    while (t < params.horizon && events.length < 8000) {
      t += expRand(rand, rate);
      if (t <= params.horizon) events.push({ t: t });
    }
    return events;
  }

  function binCounts(events, params) {
    var counts = new Array(params.binCount).fill(0);
    var width = params.horizon / params.binCount;
    events.forEach(function (event) {
      var index = clamp(Math.floor(event.t / width), 0, params.binCount - 1);
      counts[index] += 1;
    });
    return counts;
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function variance(values) {
    if (values.length < 2) return 0;
    var m = mean(values);
    var sum = 0;
    values.forEach(function (value) {
      var diff = value - m;
      sum += diff * diff;
    });
    return sum / (values.length - 1);
  }

  function interarrivals(events, horizon) {
    var out = [];
    var prev = 0;
    events.forEach(function (event) {
      out.push(event.t - prev);
      prev = event.t;
    });
    if (events.length) out.push(horizon - prev);
    return out.filter(function (x) { return x > 0; });
  }

  function gapStats(events, horizon) {
    var gaps = interarrivals(events, horizon);
    var m = mean(gaps);
    var sd = Math.sqrt(variance(gaps));
    var maxGap = gaps.reduce(function (best, value) { return Math.max(best, value); }, 0);
    return { mean: m, cv: m > 0 ? sd / m : 0, maxGap: maxGap };
  }

  function fano(counts) {
    var m = mean(counts);
    return m > 0 ? variance(counts) / m : 0;
  }

  function maxRun(counts) {
    return counts.reduce(function (best, value) { return Math.max(best, value); }, 0);
  }

  function histogram(values, maxValue, bins) {
    var counts = new Array(bins).fill(0);
    values.forEach(function (value) {
      var index = clamp(Math.floor(value / maxValue * bins), 0, bins - 1);
      counts[index] += 1;
    });
    return counts;
  }

  function timeRescaledResiduals(events, params, initialExcitation) {
    var mu = params.baseline;
    var beta = params.decay;
    var alpha = params.branching * beta;
    var residuals = [];
    var excitation = initialExcitation || 0;
    var last = 0;
    events.forEach(function (event) {
      var dt = event.t - last;
      var area = mu * dt + excitation * (1 - Math.exp(-beta * dt)) / beta;
      residuals.push(area);
      excitation *= Math.exp(-beta * dt);
      excitation += alpha;
      last = event.t;
    });
    return residuals;
  }

  function ksExpOne(residuals) {
    if (!residuals.length) return 0;
    var sorted = residuals.slice().sort(function (a, b) { return a - b; });
    var d = 0;
    for (var i = 0; i < sorted.length; i += 1) {
      var cdf = 1 - Math.exp(-sorted[i]);
      var below = i / sorted.length;
      var above = (i + 1) / sorted.length;
      d = Math.max(d, Math.abs(cdf - below), Math.abs(above - cdf));
    }
    return d;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var stationaryRate = params.branching >= 1 ? Infinity : params.baseline / Math.max(1e-9, 1 - params.branching);
    var hawkes = simulateHawkes(params);
    var poissonEvents = simulatePoisson(params, stationaryRate);
    var hawkesBins = binCounts(hawkes.events, params);
    var poissonBins = binCounts(poissonEvents, params);
    var hGaps = gapStats(hawkes.events, params.horizon);
    var pGaps = gapStats(poissonEvents, params.horizon);
    var residuals = timeRescaledResiduals(hawkes.events, params, hawkes.initialExcitation);
    var maxGap = Math.max(hGaps.maxGap, pGaps.maxGap, 1);
    return {
      params: params,
      alpha: params.branching * params.decay,
      stationaryRate: stationaryRate,
      hawkes: {
        events: hawkes.events,
        intensityPoints: hawkes.intensityPoints,
        bins: hawkesBins,
        fano: fano(hawkesBins),
        gaps: hGaps,
        residuals: residuals,
        ks: ksExpOne(residuals),
        maxBin: maxRun(hawkesBins),
        expectedEndogenousShare: params.branching,
        estimatedEndogenousShare: Math.max(0, 1 - params.baseline * params.horizon / Math.max(1, hawkes.events.length))
      },
      poisson: {
        events: poissonEvents,
        bins: poissonBins,
        fano: fano(poissonBins),
        gaps: pGaps,
        maxBin: maxRun(poissonBins)
      },
      gapHistogramMax: maxGap,
      histograms: {
        hawkes: histogram(interarrivals(hawkes.events, params.horizon), maxGap, 20),
        poisson: histogram(interarrivals(poissonEvents, params.horizon), maxGap, 20)
      }
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatRate(value) {
    return formatNumber(value, 2) + "/t";
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="hawkes-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function roundedRect(ctx, x, y, w, h, r) {
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

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width));
    var height = width < 620 ? 1180 : 760;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 750);
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 43, COLORS.muted, 11, 600);
  }

  function plotBox(box, top, right, bottom, left) {
    return {
      x: box.x + left,
      y: box.y + top,
      w: box.w - left - right,
      h: box.h - top - bottom
    };
  }

  function drawAxes(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.grid;
    for (var i = 1; i < 4; i += 1) {
      var x = plot.x + plot.w * i / 4;
      var y = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawTimeline(ctx, box, result) {
    panel(ctx, box, "Intensity remembers", "Hawkes event rug and conditional intensity");
    var plot = plotBox(box, 68, 22, 52, 48);
    drawAxes(ctx, plot);
    var maxLambda = Math.max(result.stationaryRate * 1.4, result.params.baseline);
    result.hawkes.intensityPoints.forEach(function (p) {
      maxLambda = Math.max(maxLambda, p.value);
    });
    function xScale(t) { return plot.x + t / result.params.horizon * plot.w; }
    function yScale(v) { return plot.y + plot.h - clamp(v / maxLambda, 0, 1) * plot.h; }

    ctx.strokeStyle = COLORS.baseline;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(result.params.baseline));
    ctx.lineTo(plot.x + plot.w, yScale(result.params.baseline));
    ctx.stroke();
    ctx.strokeStyle = COLORS.poisson;
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(result.stationaryRate));
    ctx.lineTo(plot.x + plot.w, yScale(result.stationaryRate));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = COLORS.intensity;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.hawkes.intensityPoints.forEach(function (point, index) {
      var x = xScale(point.t);
      var y = yScale(point.value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    result.hawkes.events.forEach(function (event) {
      var x = xScale(event.t);
      ctx.strokeStyle = event.parentShare > 0.5 ? COLORS.burst : COLORS.hawkes;
      ctx.lineWidth = event.parentShare > 0.5 ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(x, plot.y + plot.h + 5);
      ctx.lineTo(x, plot.y + plot.h + 24);
      ctx.stroke();
    });
    drawText(ctx, "baseline", plot.x + 7, yScale(result.params.baseline) - 5, COLORS.baseline, 10, 750);
    drawText(ctx, "same-mean Poisson rate", plot.x + 7, yScale(result.stationaryRate) - 5, COLORS.poisson, 10, 750);
    drawText(ctx, "time", plot.x + plot.w / 2, box.y + box.h - 16, COLORS.muted, 11, 650, "center");
  }

  function drawBins(ctx, box, result) {
    panel(ctx, box, "Same mean, different counts", "equal-width time bins");
    var plot = plotBox(box, 68, 18, 46, 42);
    drawAxes(ctx, plot);
    var maxCount = Math.max(result.hawkes.maxBin, result.poisson.maxBin, 1);
    var groupW = plot.w / result.params.binCount;
    for (var i = 0; i < result.params.binCount; i += 1) {
      var h1 = result.hawkes.bins[i] / maxCount * plot.h;
      var h2 = result.poisson.bins[i] / maxCount * plot.h;
      var x = plot.x + i * groupW;
      ctx.fillStyle = COLORS.hawkes;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(x + 1, plot.y + plot.h - h1, Math.max(1, groupW * 0.42), h1);
      ctx.fillStyle = COLORS.poisson;
      ctx.globalAlpha = 0.62;
      ctx.fillRect(x + groupW * 0.48, plot.y + plot.h - h2, Math.max(1, groupW * 0.42), h2);
      ctx.globalAlpha = 1;
    }
    drawText(ctx, "Hawkes Fano " + formatNumber(result.hawkes.fano, 2), plot.x + 8, plot.y + 18, COLORS.hawkes, 11, 750);
    drawText(ctx, "Poisson Fano " + formatNumber(result.poisson.fano, 2), plot.x + 8, plot.y + 36, COLORS.poisson, 11, 750);
  }

  function drawGaps(ctx, box, result) {
    panel(ctx, box, "Interarrival gaps", "bursts create many short waits and long quiet periods");
    var plot = plotBox(box, 68, 18, 46, 46);
    drawAxes(ctx, plot);
    var maxCount = Math.max.apply(null, result.histograms.hawkes.concat(result.histograms.poisson).concat([1]));
    var barW = plot.w / result.histograms.hawkes.length;
    for (var i = 0; i < result.histograms.hawkes.length; i += 1) {
      var h1 = result.histograms.hawkes[i] / maxCount * plot.h;
      var h2 = result.histograms.poisson[i] / maxCount * plot.h;
      var x = plot.x + i * barW;
      ctx.fillStyle = COLORS.hawkes;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(x + 1, plot.y + plot.h - h1, Math.max(1, barW * 0.42), h1);
      ctx.fillStyle = COLORS.poisson;
      ctx.globalAlpha = 0.62;
      ctx.fillRect(x + barW * 0.48, plot.y + plot.h - h2, Math.max(1, barW * 0.42), h2);
      ctx.globalAlpha = 1;
    }
    drawText(ctx, "gap", plot.x + plot.w / 2, box.y + box.h - 16, COLORS.muted, 11, 650, "center");
    drawText(ctx, "Hawkes CV " + formatNumber(result.hawkes.gaps.cv, 2), plot.x + 8, plot.y + 18, COLORS.hawkes, 11, 750);
    drawText(ctx, "Poisson CV " + formatNumber(result.poisson.gaps.cv, 2), plot.x + 8, plot.y + 36, COLORS.poisson, 11, 750);
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "Branching ledger", "one event can buy more event risk");
    var x = box.x + 18;
    var y = box.y + 72;
    var rows = [
      ["baseline rate", formatRate(result.params.baseline), COLORS.baseline],
      ["excitation jump alpha", formatNumber(result.alpha, 2), COLORS.intensity],
      ["decay beta", formatNumber(result.params.decay, 2), COLORS.muted],
      ["branching ratio alpha/beta", formatPercent(result.params.branching, 0), COLORS.hawkes],
      ["stationary mean rate", formatRate(result.stationaryRate), COLORS.poisson],
      ["Hawkes events", String(result.hawkes.events.length), COLORS.hawkes],
      ["Poisson events", String(result.poisson.events.length), COLORS.poisson],
      ["time-rescale KS", formatNumber(result.hawkes.ks, 3), COLORS.burst]
    ];
    rows.forEach(function (row, index) {
      var yy = y + index * 27;
      drawText(ctx, row[0], x, yy, COLORS.muted, 11, 650);
      drawText(ctx, row[1], box.x + box.w - 18, yy, row[2], 12, 800, "right");
    });
    var dangerY = box.y + box.h - 46;
    var n = result.params.branching;
    ctx.fillStyle = n >= 0.9 ? "#fff1f2" : (n >= 0.75 ? "#fff7ed" : "#ecfdf5");
    ctx.strokeStyle = n >= 0.9 ? COLORS.hawkes : (n >= 0.75 ? COLORS.intensity : COLORS.baseline);
    roundedRect(ctx, x, dangerY, box.w - 36, 28, 7);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, n >= 0.9 ? "near critical: bursts can dominate" : (n >= 0.75 ? "high memory: clusters matter" : "subcritical: clusters die out"), box.x + box.w / 2, dangerY + 18, ctx.strokeStyle, 11, 780, "center");
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    if (width < 620) {
      var gap = 16;
      var h = 278;
      drawTimeline(ctx, { x: 12, y: 12, w: width - 24, h: h }, result);
      drawBins(ctx, { x: 12, y: 12 + h + gap, w: width - 24, h: h }, result);
      drawGaps(ctx, { x: 12, y: 12 + 2 * (h + gap), w: width - 24, h: h }, result);
      drawLedger(ctx, { x: 12, y: 12 + 3 * (h + gap), w: width - 24, h: h }, result);
      return;
    }
    var margin = 18;
    var gapX = 18;
    var gapY = 18;
    var boxW = (width - 2 * margin - gapX) / 2;
    var boxH = (setup.height - 2 * margin - gapY) / 2;
    drawTimeline(ctx, { x: margin, y: margin, w: boxW, h: boxH }, result);
    drawBins(ctx, { x: margin + boxW + gapX, y: margin, w: boxW, h: boxH }, result);
    drawGaps(ctx, { x: margin, y: margin + boxH + gapY, w: boxW, h: boxH }, result);
    drawLedger(ctx, { x: margin + boxW + gapX, y: margin + boxH + gapY, w: boxW, h: boxH }, result);
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(container, params) {
    var values = {
      baseline: formatRate(params.baseline),
      branching: formatPercent(params.branching, 0),
      decay: formatNumber(params.decay, 2),
      horizon: String(params.horizon),
      seed: String(params.seed)
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function render(container) {
    var result = evaluate(readParams(container));
    updateOutputs(container, result.params);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("stationary rate", formatRate(result.stationaryRate)),
        metric("Hawkes events", String(result.hawkes.events.length)),
        metric("Poisson events", String(result.poisson.events.length)),
        metric("Hawkes Fano", formatNumber(result.hawkes.fano, 2)),
        metric("Poisson Fano", formatNumber(result.poisson.fano, 2)),
        metric("endogenous share", formatPercent(result.hawkes.estimatedEndogenousShare, 0))
      ].join("");
    }
    var canvas = container.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function mount(container) {
    var redraw = function () { render(container); };
    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    render(container);
    if (root.ResizeObserver) {
      var observer = new root.ResizeObserver(function () { render(container); });
      observer.observe(container);
    }
  }

  function init() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-hawkes-burst-lab]").forEach(mount);
  }

  root.HawkesBurstLab = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    simulateHawkes: simulateHawkes,
    simulatePoisson: simulatePoisson,
    timeRescaledResiduals: timeRescaledResiduals
  };

  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : this);
