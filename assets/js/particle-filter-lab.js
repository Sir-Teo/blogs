(function (global) {
  "use strict";

  var COLORS = {
    truth: "#0f766e",
    mean: "#2563eb",
    band: "#dbeafe",
    particle: "#64748b",
    observation: "#d97706",
    resample: "#7c3aed",
    bad: "#be123c",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc"
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

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="particle-filter-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
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
      assumedObservationNoise: clamp(params.assumedObservationNoise, 0.25, 6),
      inspectTime: clamp(Math.round(params.inspectTime), 0, 109),
      observationNoise: clamp(params.observationNoise, 0.25, 6),
      particles: clamp(Math.round(params.particles), 60, 1400),
      processNoise: clamp(params.processNoise, 0.5, 8),
      resampleThreshold: clamp(params.resampleThreshold, 0, 95) / 100
    };
  }

  function transitionMean(x, t) {
    return 0.5 * x + 25 * x / (1 + x * x) + 8 * Math.cos(1.2 * t);
  }

  function observationMean(x) {
    return x * x / 20;
  }

  function logNormalDensity(y, mean, sd) {
    var s = Math.max(1e-6, sd);
    var z = (y - mean) / s;
    return -0.5 * (Math.log(2 * Math.PI * s * s) + z * z);
  }

  function generateTruth(params) {
    var rows = [];
    var x = 0;
    for (var t = 0; t < 110; t += 1) {
      x = transitionMean(x, t) + params.processNoise * normal(t + 17, 0x51f15eed);
      var y = observationMean(x) + params.observationNoise * normal(t + 307, 0xbadc0de);
      rows.push({ t: t, truth: x, observation: y });
    }
    return rows;
  }

  function normalizeLogWeights(logWeights) {
    var maxLog = Math.max.apply(null, logWeights);
    var weights = [];
    var sum = 0;
    for (var i = 0; i < logWeights.length; i += 1) {
      var w = Math.exp(logWeights[i] - maxLog);
      weights.push(w);
      sum += w;
    }
    for (var j = 0; j < weights.length; j += 1) weights[j] /= sum;
    return { logSum: maxLog + Math.log(sum), weights: weights };
  }

  function effectiveSampleSize(weights) {
    var sumSq = 0;
    for (var i = 0; i < weights.length; i += 1) sumSq += weights[i] * weights[i];
    return 1 / Math.max(1e-12, sumSq);
  }

  function weightedSummary(particles, weights) {
    var mean = 0;
    for (var i = 0; i < particles.length; i += 1) mean += particles[i] * weights[i];
    var variance = 0;
    for (var j = 0; j < particles.length; j += 1) {
      var d = particles[j] - mean;
      variance += weights[j] * d * d;
    }
    var pairs = particles.map(function (x, k) {
      return { x: x, w: weights[k] };
    }).sort(function (a, b) { return a.x - b.x; });
    function q(prob) {
      var acc = 0;
      for (var k = 0; k < pairs.length; k += 1) {
        acc += pairs[k].w;
        if (acc >= prob) return pairs[k].x;
      }
      return pairs[pairs.length - 1].x;
    }
    return {
      mean: mean,
      q05: q(0.05),
      q10: q(0.10),
      q50: q(0.50),
      q90: q(0.90),
      q95: q(0.95),
      sd: Math.sqrt(Math.max(0, variance))
    };
  }

  function systematicResample(particles, weights, ancestors, seed) {
    var n = particles.length;
    var newParticles = [];
    var newAncestors = [];
    var offset = uniform(seed, 0x6d2b79f5) / n;
    var cumulative = weights[0];
    var i = 0;
    for (var j = 0; j < n; j += 1) {
      var target = offset + j / n;
      while (target > cumulative && i < n - 1) {
        i += 1;
        cumulative += weights[i];
      }
      newParticles.push(particles[i]);
      newAncestors.push(ancestors[i]);
    }
    return { ancestors: newAncestors, particles: newParticles };
  }

  function countUnique(values) {
    var seen = Object.create(null);
    var count = 0;
    values.forEach(function (value) {
      if (seen[value]) return;
      seen[value] = true;
      count += 1;
    });
    return count;
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var truth = generateTruth(clean);
    var n = clean.particles;
    var particles = [];
    var weights = [];
    var ancestors = [];
    for (var i = 0; i < n; i += 1) {
      particles.push(8 * normal(i + 700, 0x1234abcd));
      weights.push(1 / n);
      ancestors.push(i);
    }

    var rows = [];
    var snapshots = [];
    var logLikelihood = 0;
    var resamples = 0;
    var sqError = 0;
    var covered = 0;
    var essSum = 0;
    var minEss = n;

    for (var t = 0; t < truth.length; t += 1) {
      var propagated = [];
      for (var p = 0; p < n; p += 1) {
        propagated.push(transitionMean(particles[p], t) + clean.processNoise * normal(t * n + p + 1109, 0x9e3779b9));
      }
      particles = propagated;

      var logWeights = [];
      for (var k = 0; k < n; k += 1) {
        logWeights.push(Math.log(Math.max(1e-300, weights[k])) +
          logNormalDensity(truth[t].observation, observationMean(particles[k]), clean.assumedObservationNoise));
      }
      var normalized = normalizeLogWeights(logWeights);
      weights = normalized.weights;
      logLikelihood += normalized.logSum;

      var ess = effectiveSampleSize(weights);
      var summary = weightedSummary(particles, weights);
      var row = {
        ess: ess,
        mean: summary.mean,
        q05: summary.q05,
        q10: summary.q10,
        q50: summary.q50,
        q90: summary.q90,
        q95: summary.q95,
        resampled: false,
        t: t,
        truth: truth[t].truth,
        observation: truth[t].observation,
        uniqueAncestors: countUnique(ancestors)
      };
      rows.push(row);
      snapshots.push({ particles: particles.slice(), weights: weights.slice(), row: row });

      var error = summary.mean - truth[t].truth;
      sqError += error * error;
      if (truth[t].truth >= summary.q10 && truth[t].truth <= summary.q90) covered += 1;
      essSum += ess;
      minEss = Math.min(minEss, ess);

      if (clean.resampleThreshold > 0 && ess < clean.resampleThreshold * n) {
        var resampled = systematicResample(particles, weights, ancestors, t * 7919 + n);
        particles = resampled.particles;
        ancestors = resampled.ancestors;
        weights = new Array(n).fill(1 / n);
        row.resampled = true;
        row.uniqueAncestors = countUnique(ancestors);
        resamples += 1;
      }
    }

    var inspectTime = clamp(clean.inspectTime, 0, rows.length - 1);
    return {
      coverage80: covered / rows.length,
      finalUniqueAncestors: rows[rows.length - 1].uniqueAncestors,
      inspect: snapshots[inspectTime],
      logLikelihoodPerStep: logLikelihood / rows.length,
      minEss: minEss / n,
      params: clean,
      resamples: resamples,
      rmse: Math.sqrt(sqError / rows.length),
      rows: rows,
      snapshots: snapshots,
      avgEss: essSum / (rows.length * n)
    };
  }

  function extent(rows, accessors) {
    var min = Infinity;
    var max = -Infinity;
    rows.forEach(function (row) {
      accessors.forEach(function (fn) {
        var value = fn(row);
        if (value === null || value === undefined || !isFinite(value)) return;
        if (value < min) min = value;
        if (value > max) max = value;
      });
    });
    if (!isFinite(min) || !isFinite(max)) return { min: -1, max: 1 };
    if (max === min) {
      min -= 1;
      max += 1;
    }
    var pad = (max - min) * 0.08;
    return { min: min - pad, max: max + pad };
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

  function drawLine(ctx, rows, xScale, yScale, accessor, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = xScale(row.t);
      var y = yScale(accessor(row));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawStatePanel(ctx, result, box) {
    panelTitle(ctx, box, "Hidden state", "posterior bands can be more honest than a single line");
    var rows = result.rows;
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var domain = extent(rows, [
      function (r) { return r.truth; },
      function (r) { return r.q05; },
      function (r) { return r.q95; },
      function (r) { return r.observation > 0 ? Math.sqrt(20 * r.observation) : null; },
      function (r) { return r.observation > 0 ? -Math.sqrt(20 * r.observation) : null; }
    ]);
    function xScale(t) { return plot.x + t / (rows.length - 1) * plot.w; }
    function yScale(value) { return plot.y + plot.h - (value - domain.min) / (domain.max - domain.min) * plot.h; }
    drawAxis(ctx, plot);

    ctx.fillStyle = COLORS.band;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = xScale(row.t);
      var y = yScale(row.q10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (var j = rows.length - 1; j >= 0; j -= 1) {
      ctx.lineTo(xScale(rows[j].t), yScale(rows[j].q90));
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COLORS.observation;
    ctx.globalAlpha = 0.40;
    rows.forEach(function (row) {
      if (row.observation <= 0) return;
      var root = Math.sqrt(20 * row.observation);
      [root, -root].forEach(function (candidate) {
        ctx.beginPath();
        ctx.arc(xScale(row.t), yScale(candidate), 1.7, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.globalAlpha = 1;

    drawLine(ctx, rows, xScale, yScale, function (r) { return r.truth; }, COLORS.truth, 2.3);
    drawLine(ctx, rows, xScale, yScale, function (r) { return r.mean; }, COLORS.mean, 2.1);

    ctx.strokeStyle = COLORS.observation;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(xScale(result.params.inspectTime), plot.y);
    ctx.lineTo(xScale(result.params.inspectTime), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(formatNumber(domain.max), plot.x - 7, plot.y + 4);
    ctx.fillText(formatNumber(domain.min), plot.x - 7, plot.y + plot.h);
    ctx.textAlign = "left";
  }

  function drawParticlePanel(ctx, result, box) {
    panelTitle(ctx, box, "Particle posterior at t=" + result.params.inspectTime, "one observation can support two signs");
    var snapshot = result.inspect;
    var row = snapshot.row;
    var particles = snapshot.particles;
    var weights = snapshot.weights;
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var summary = weightedSummary(particles, weights);
    var values = particles.concat([row.truth, summary.mean, summary.q05, summary.q95]);
    if (row.observation > 0) {
      values.push(Math.sqrt(20 * row.observation));
      values.push(-Math.sqrt(20 * row.observation));
    }
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = (max - min || 1) * 0.12;
    min -= pad;
    max += pad;
    var bins = 32;
    var counts = new Array(bins).fill(0);
    particles.forEach(function (x, i) {
      var index = Math.floor((x - min) / (max - min) * bins);
      counts[clamp(index, 0, bins - 1)] += weights[i];
    });
    var maxCount = Math.max.apply(null, counts.concat([1e-9]));
    function xScale(value) { return plot.x + (value - min) / (max - min) * plot.w; }
    function yScale(value) { return plot.y + plot.h - value / maxCount * plot.h; }
    drawAxis(ctx, plot);
    ctx.fillStyle = COLORS.particle;
    ctx.globalAlpha = 0.62;
    counts.forEach(function (count, i) {
      var binW = plot.w / bins;
      var x = plot.x + i * binW;
      var y = yScale(count);
      ctx.fillRect(x, y, Math.max(1, binW - 1), plot.y + plot.h - y);
    });
    ctx.globalAlpha = 1;

    function marker(value, color, label, dashed) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (dashed) ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(xScale(value), plot.y);
      ctx.lineTo(xScale(value), plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, xScale(value), plot.y + 12);
    }
    marker(row.truth, COLORS.truth, "truth", false);
    marker(summary.mean, COLORS.mean, "mean", false);
    if (row.observation > 0) {
      var root = Math.sqrt(20 * row.observation);
      marker(root, COLORS.observation, "+obs", true);
      marker(-root, COLORS.observation, "-obs", true);
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("ESS " + formatPercent(row.ess / result.params.particles * 100), plot.x, plot.y + 38);
  }

  function drawEssPanel(ctx, result, box) {
    panelTitle(ctx, box, "Weight degeneracy", "ESS falls when only a few particles carry belief");
    var rows = result.rows;
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    function xScale(t) { return plot.x + t / (rows.length - 1) * plot.w; }
    function yScale(value) { return plot.y + plot.h - clamp(value, 0, 1) * plot.h; }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.rule;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(result.params.resampleThreshold));
    ctx.lineTo(plot.x + plot.w, yScale(result.params.resampleThreshold));
    ctx.stroke();
    ctx.setLineDash([]);
    drawLine(ctx, rows, xScale, yScale, function (r) { return r.ess / result.params.particles; }, COLORS.bad, 2);
    rows.forEach(function (row) {
      if (!row.resampled) return;
      ctx.fillStyle = COLORS.resample;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(xScale(row.t) - 1.5, plot.y, 3, plot.h);
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(formatPercent(result.avgEss * 100), plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("average ESS / N", plot.x + 92, plot.y + 22);
    ctx.textAlign = "right";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(formatPercent(tick * 100), plot.x - 7, yScale(tick) + 4);
    });
    ctx.textAlign = "left";
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Filter ledger", "resampling buys usable weights, then spends diversity");
    var plot = { x: box.x, y: box.y + 50, w: box.w, h: box.h - 64 };
    var rows = [
      { label: "RMSE", value: result.rmse, scale: 12, color: COLORS.mean, text: formatNumber(result.rmse) },
      { label: "80% coverage", value: result.coverage80, scale: 1, color: COLORS.truth, text: formatPercent(result.coverage80 * 100) },
      { label: "min ESS / N", value: result.minEss, scale: 1, color: COLORS.bad, text: formatPercent(result.minEss * 100) },
      { label: "final ancestors", value: result.finalUniqueAncestors / result.params.particles, scale: 1, color: COLORS.resample, text: result.finalUniqueAncestors + " / " + result.params.particles },
      { label: "resamples", value: result.resamples, scale: 35, color: COLORS.observation, text: String(result.resamples) }
    ];
    var rowGap = Math.min(36, Math.max(24, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 120, y, plot.w - 174, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 120, y, Math.max(1, (plot.w - 174) * clamp(row.value / row.scale, 0, 1)), 18);
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
      drawStatePanel(ctx, result, { x: margin, y: 28, w: panelW, h: 286 });
      drawParticlePanel(ctx, result, { x: margin, y: 342, w: panelW, h: 206 });
      drawEssPanel(ctx, result, { x: margin, y: 576, w: panelW, h: 206 });
      drawLedgerPanel(ctx, result, { x: margin, y: 810, w: panelW, h: 136 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawStatePanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 320 });
      drawParticlePanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 320 });
      drawEssPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 244 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 244 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var values = {
      assumedObservationNoise: formatNumber(result.params.assumedObservationNoise),
      inspectTime: String(result.params.inspectTime),
      observationNoise: formatNumber(result.params.observationNoise),
      particles: Math.round(result.params.particles).toLocaleString(),
      processNoise: formatNumber(result.params.processNoise),
      resampleThreshold: formatPercent(result.params.resampleThreshold * 100)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("RMSE", formatNumber(result.rmse)),
        metric("Avg ESS", formatPercent(result.avgEss * 100)),
        metric("Min ESS", formatPercent(result.minEss * 100)),
        metric("Resamples", String(result.resamples)),
        metric("80% coverage", formatPercent(result.coverage80 * 100)),
        metric("Final ancestors", result.finalUniqueAncestors + " / " + result.params.particles)
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-particle-filter-lab]")).forEach(init);
  }

  var api = {
    effectiveSampleSize: effectiveSampleSize,
    generateTruth: generateTruth,
    simulate: simulate,
    systematicResample: systematicResample
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ParticleFilterLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
