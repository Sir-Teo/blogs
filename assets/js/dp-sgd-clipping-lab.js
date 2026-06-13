(function (global) {
  "use strict";

  var COLORS = {
    common: "#2563eb",
    rare: "#be123c",
    raw: "#64748b",
    clipped: "#0f766e",
    noisy: "#7c3aed",
    noise: "#b45309",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#edf2f7"
  };
  var POPULATION = 50000;
  var DELTA = 1e-6;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function norm(vector) {
    return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function mul(vector, scale) {
    return { x: vector.x * scale, y: vector.y * scale };
  }

  function mean(vectors) {
    if (!vectors.length) return { x: 0, y: 0 };
    var total = vectors.reduce(function (acc, vector) {
      acc.x += vector.x;
      acc.y += vector.y;
      return acc;
    }, { x: 0, y: 0 });
    return mul(total, 1 / vectors.length);
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "inf";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatEpsilon(value) {
    if (!isFinite(value)) return "inf";
    if (value >= 100) return value.toFixed(0);
    if (value >= 10) return value.toFixed(1);
    if (value >= 1) return value.toFixed(2);
    return value.toFixed(3);
  }

  function formatPercent(value) {
    return value.toFixed(value < 10 ? 1 : 0) + "%";
  }

  function metric(label, value) {
    return '<div class="dpsgd-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
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

  function clipGradient(vector, clipNorm) {
    var length = norm(vector);
    if (length <= clipNorm || length === 0) return { x: vector.x, y: vector.y, scale: 1 };
    var scale = clipNorm / length;
    return { x: vector.x * scale, y: vector.y * scale, scale: scale };
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function rdpApproxEpsilon(params, sigmaOverride) {
    var sigma = sigmaOverride == null ? params.noiseMultiplier : sigmaOverride;
    if (sigma <= 0) return Infinity;
    var q = clamp(params.batchSize / POPULATION, 0, 1);
    var logDelta = Math.log(1 / DELTA);
    var best = Infinity;
    var orders = [];
    for (var a = 2; a <= 64; a += 1) orders.push(a);
    [72, 80, 96, 128, 192, 256].forEach(function (a) { orders.push(a); });

    orders.forEach(function (alpha) {
      var rdp = params.steps * q * q * alpha / (2 * sigma * sigma);
      var eps = rdp + logDelta / (alpha - 1);
      if (eps < best) best = eps;
    });
    return best;
  }

  function makeGradients(params) {
    var rng = makeRng(1701 + params.clipNorm * 1009 + params.rareShare * 37 + params.rareNorm * 131 + params.batchSize * 7);
    var rareProbability = clamp(params.rareShare / 100, 0, 0.8);
    var count = 320;
    var gradients = [];
    var commonAngle = -0.18;
    var rareAngle = 1.2;

    for (var i = 0; i < count; i += 1) {
      var isRare = rng() < rareProbability;
      var baseNorm = isRare ? params.rareNorm : 1.15;
      var angle = (isRare ? rareAngle : commonAngle) + normal(rng) * (isRare ? 0.16 : 0.22);
      var radius = Math.max(0.04, baseNorm * (1 + normal(rng) * (isRare ? 0.18 : 0.14)));
      var raw = {
        x: Math.cos(angle) * radius + normal(rng) * 0.08,
        y: Math.sin(angle) * radius + normal(rng) * 0.08
      };
      var clipped = clipGradient(raw, params.clipNorm);
      gradients.push({
        clipped: { x: clipped.x, y: clipped.y },
        isRare: isRare,
        raw: raw,
        retention: clipped.scale
      });
    }
    return gradients;
  }

  function averageRetention(gradients, rare) {
    var selected = gradients.filter(function (row) { return row.isRare === rare; });
    if (!selected.length) return 1;
    return selected.reduce(function (sum, row) { return sum + row.retention; }, 0) / selected.length;
  }

  function simulate(params) {
    var gradients = makeGradients(params);
    var rawMean = mean(gradients.map(function (row) { return row.raw; }));
    var clippedMean = mean(gradients.map(function (row) { return row.clipped; }));
    var bias = sub(clippedMean, rawMean);
    var rawNorm = norm(rawMean);
    var clippedNorm = norm(clippedMean);
    var biasNorm = norm(bias);
    var cos = rawNorm * clippedNorm === 0 ? 1 : (rawMean.x * clippedMean.x + rawMean.y * clippedMean.y) / (rawNorm * clippedNorm);
    var angleError = Math.acos(clamp(cos, -1, 1)) * 180 / Math.PI;
    var coordinateNoise = params.noiseMultiplier * params.clipNorm / params.batchSize;
    var highDimNoise = params.noiseMultiplier * params.clipNorm * Math.sqrt(params.dimension) / params.batchSize;
    var rng = makeRng(9901 + params.steps * 17 + params.noiseMultiplier * 997 + params.dimension);
    var noisyMean = add(clippedMean, {
      x: normal(rng) * coordinateNoise,
      y: normal(rng) * coordinateNoise
    });
    var epsilon = rdpApproxEpsilon(params);
    var q = params.batchSize / POPULATION;

    return {
      angleError: angleError,
      biasNorm: biasNorm,
      clippedMean: clippedMean,
      clippedNorm: clippedNorm,
      commonRetention: averageRetention(gradients, false),
      coordinateNoise: coordinateNoise,
      epsilon: epsilon,
      gradients: gradients,
      highDimNoise: highDimNoise,
      noiseToSignal: clippedNorm === 0 ? Infinity : highDimNoise / clippedNorm,
      noisyMean: noisyMean,
      q: q,
      rareRetention: averageRetention(gradients, true),
      rawMean: rawMean,
      rawNorm: rawNorm,
      relativeBias: rawNorm === 0 ? 0 : biasNorm / rawNorm,
      signalToNoise: highDimNoise === 0 ? Infinity : clippedNorm / highDimNoise
    };
  }

  function frontier(params, result) {
    var out = [];
    for (var sigma = 0.35; sigma <= 4.001; sigma += 0.05) {
      var noiseNorm = sigma * params.clipNorm * Math.sqrt(params.dimension) / params.batchSize;
      out.push({
        epsilon: rdpApproxEpsilon(params, sigma),
        sigma: sigma,
        snr: noiseNorm === 0 ? Infinity : result.clippedNorm / noiseNorm
      });
    }
    return out;
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

  function drawArrow(ctx, origin, vector, xScale, yScale, color, label) {
    var x0 = xScale(origin.x);
    var y0 = yScale(origin.y);
    var x1 = xScale(origin.x + vector.x);
    var y1 = yScale(origin.y + vector.y);
    var angle = Math.atan2(y1 - y0, x1 - x0);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 8 * Math.cos(angle - 0.45), y1 - 8 * Math.sin(angle - 0.45));
    ctx.lineTo(x1 - 8 * Math.cos(angle + 0.45), y1 - 8 * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();

    if (label) {
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(label, x1 + 6, y1 - 4);
    }
  }

  function drawCloud(ctx, result, params, box) {
    panelTitle(ctx, box, "Per-example gradients", "clipping bounds contribution before noise");
    var size = Math.min(box.w, box.h - 38);
    var plot = { x: box.x + (box.w - size) / 2, y: box.y + 38, w: size, h: size };
    var maxNorm = params.clipNorm;
    result.gradients.forEach(function (row) {
      maxNorm = Math.max(maxNorm, norm(row.raw), norm(row.clipped));
    });
    maxNorm = Math.max(1, maxNorm * 1.08);
    var xScale = function (x) { return plot.x + plot.w * (x + maxNorm) / (2 * maxNorm); };
    var yScale = function (y) { return plot.y + plot.h - plot.h * (y + maxNorm) / (2 * maxNorm); };

    ctx.strokeStyle = COLORS.faint;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.beginPath();
    ctx.moveTo(xScale(-maxNorm), yScale(0));
    ctx.lineTo(xScale(maxNorm), yScale(0));
    ctx.moveTo(xScale(0), yScale(-maxNorm));
    ctx.lineTo(xScale(0), yScale(maxNorm));
    ctx.stroke();

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(xScale(0), yScale(0), plot.w * params.clipNorm / (2 * maxNorm), 0, Math.PI * 2);
    ctx.stroke();

    result.gradients.forEach(function (row) {
      var rawX = xScale(row.raw.x);
      var rawY = yScale(row.raw.y);
      var clippedX = xScale(row.clipped.x);
      var clippedY = yScale(row.clipped.y);
      if (row.retention < 0.995) {
        ctx.strokeStyle = row.isRare ? "rgba(190,18,60,0.18)" : "rgba(37,99,235,0.12)";
        ctx.beginPath();
        ctx.moveTo(rawX, rawY);
        ctx.lineTo(clippedX, clippedY);
        ctx.stroke();
      }
      ctx.fillStyle = row.isRare ? "rgba(190,18,60,0.72)" : "rgba(37,99,235,0.55)";
      ctx.beginPath();
      ctx.arc(rawX, rawY, row.isRare ? 2.4 : 2, 0, Math.PI * 2);
      ctx.fill();
    });

    drawArrow(ctx, { x: 0, y: 0 }, result.rawMean, xScale, yScale, COLORS.raw, "raw");
    drawArrow(ctx, { x: 0, y: 0 }, result.clippedMean, xScale, yScale, COLORS.clipped, "clipped");

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("circle radius C = " + formatNumber(params.clipNorm), plot.x + 8, plot.y + plot.h - 18);
  }

  function drawMeanPanel(ctx, result, params, box) {
    panelTitle(ctx, box, "One DP-SGD update", "projection of raw, clipped, and noisy means");
    var plot = { x: box.x + 36, y: box.y + 44, w: box.w - 50, h: Math.max(126, box.h * 0.45) };
    var vectors = [result.rawMean, result.clippedMean, result.noisyMean];
    var maxNorm = Math.max(params.clipNorm, result.highDimNoise, 1);
    vectors.forEach(function (v) { maxNorm = Math.max(maxNorm, norm(v)); });
    maxNorm *= 1.22;
    var xScale = function (x) { return plot.x + plot.w * (x + maxNorm) / (2 * maxNorm); };
    var yScale = function (y) { return plot.y + plot.h - plot.h * (y + maxNorm) / (2 * maxNorm); };

    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(xScale(-maxNorm), yScale(0));
    ctx.lineTo(xScale(maxNorm), yScale(0));
    ctx.moveTo(xScale(0), yScale(-maxNorm));
    ctx.lineTo(xScale(0), yScale(maxNorm));
    ctx.stroke();

    drawArrow(ctx, { x: 0, y: 0 }, result.rawMean, xScale, yScale, COLORS.raw, "raw");
    drawArrow(ctx, { x: 0, y: 0 }, result.clippedMean, xScale, yScale, COLORS.clipped, "clipped");
    drawArrow(ctx, { x: 0, y: 0 }, result.noisyMean, xScale, yScale, COLORS.noisy, "noisy");

    var ledgerY = plot.y + plot.h + 42;
    var rows = [
      { label: "clipped signal", value: result.clippedNorm, color: COLORS.clipped },
      { label: "clipping bias", value: result.biasNorm, color: COLORS.rare },
      { label: "DP noise norm", value: result.highDimNoise, color: COLORS.noise }
    ];
    var maxBar = rows.reduce(function (acc, row) { return Math.max(acc, row.value); }, 0.1);
    rows.forEach(function (row, index) {
      var y = ledgerY + index * 26;
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, box.x, y + 5);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x + 104, y - 5, box.w - 150, 14);
      ctx.fillStyle = row.color;
      ctx.fillRect(box.x + 104, y - 5, (box.w - 150) * row.value / maxBar, 14);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(formatNumber(row.value), box.x + box.w, y + 5);
      ctx.textAlign = "left";
    });
  }

  function drawFrontier(ctx, result, params, box) {
    panelTitle(ctx, box, "Noise multiplier frontier", "small-q RDP approximation; lower epsilon means stronger privacy");
    var points = frontier(params, result).filter(function (point) {
      return isFinite(point.epsilon) && isFinite(point.snr) && point.epsilon > 0 && point.snr > 0;
    });
    var plot = { x: box.x + 52, y: box.y + 42, w: box.w - 66, h: box.h - 72 };
    drawAxis(ctx, plot);

    var logEps = points.map(function (point) { return Math.log10(point.epsilon); });
    var logSnr = points.map(function (point) { return Math.log10(point.snr); });
    var minX = Math.min.apply(null, logEps);
    var maxX = Math.max.apply(null, logEps);
    var minY = Math.min.apply(null, logSnr);
    var maxY = Math.max.apply(null, logSnr);
    if (maxX === minX) maxX += 1;
    if (maxY === minY) maxY += 1;
    var xPad = (maxX - minX) * 0.1;
    var yPad = (maxY - minY) * 0.15;
    minX -= xPad;
    maxX += xPad;
    minY -= yPad;
    maxY += yPad;

    var xScale = function (value) { return plot.x + plot.w * (Math.log10(value) - minX) / (maxX - minX); };
    var yScale = function (value) { return plot.y + plot.h - plot.h * (Math.log10(value) - minY) / (maxY - minY); };

    [0, 0.5, 1].forEach(function (tick) {
      var y = lerp(plot.y + plot.h, plot.y, tick);
      ctx.strokeStyle = COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });

    ctx.strokeStyle = COLORS.noisy;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xScale(point.epsilon);
      var y = yScale(point.snr);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    var currentX = xScale(result.epsilon);
    var currentY = yScale(result.signalToNoise);
    ctx.fillStyle = COLORS.rare;
    ctx.beginPath();
    ctx.arc(currentX, currentY, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    [0, 0.5, 1].forEach(function (tick) {
      var logValue = lerp(minX, maxX, tick);
      var value = Math.pow(10, logValue);
      ctx.fillText(formatEpsilon(value), plot.x + plot.w * tick, plot.y + plot.h + 11);
    });
    ctx.save();
    ctx.translate(plot.x - 36, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("signal / noise", 0, 0);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.fillText("approx epsilon", plot.x + plot.w - 78, plot.y + plot.h + 28);
  }

  function drawChart(canvas, result, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 850 : 650;
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
      drawCloud(ctx, result, params, { x: margin, y: 26, w: panelW, h: 290 });
      drawMeanPanel(ctx, result, params, { x: margin, y: 340, w: panelW, h: 230 });
      drawFrontier(ctx, result, params, { x: margin, y: 614, w: panelW, h: 208 });
    } else {
      var gap = 42;
      var topW = (width - margin * 2 - gap) / 2;
      drawCloud(ctx, result, params, { x: margin, y: 28, w: topW, h: 330 });
      drawMeanPanel(ctx, result, params, { x: margin + topW + gap, y: 28, w: topW, h: 330 });
      drawFrontier(ctx, result, params, { x: margin, y: 398, w: width - margin * 2, h: 220 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var values = {
      batchSize: params.batchSize.toLocaleString(),
      clipNorm: formatNumber(params.clipNorm),
      dimension: params.dimension.toLocaleString(),
      noiseMultiplier: formatNumber(params.noiseMultiplier),
      rareNorm: formatNumber(params.rareNorm),
      rareShare: formatPercent(params.rareShare),
      steps: params.steps.toLocaleString()
    };

    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Approx epsilon*", formatEpsilon(result.epsilon)),
        metric("Sample rate", formatPercent(result.q * 100)),
        metric("Clipping bias", formatPercent(result.relativeBias * 100)),
        metric("Angle error", formatNumber(result.angleError) + " deg"),
        metric("Rare retention", formatPercent(result.rareRetention * 100)),
        metric("Signal/noise", formatNumber(result.signalToNoise) + "x")
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-dpsgd-lab]")).forEach(init);
  }

  var api = {
    frontier: frontier,
    rdpApproxEpsilon: rdpApproxEpsilon,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.DpSgdClippingLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
