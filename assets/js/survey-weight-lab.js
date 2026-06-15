(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    naive: "#be123c",
    ht: "#2563eb",
    hajek: "#0f766e",
    clipped: "#7c3aed",
    sample: "#d97706",
    truth: "#172026",
    grid: "#eef2f5"
  };

  var ESTIMATORS = [
    { key: "naive", label: "naive mean", color: COLORS.naive },
    { key: "ht", label: "Horvitz-Thompson", color: COLORS.ht },
    { key: "hajek", label: "Hajek ratio", color: COLORS.hajek },
    { key: "clipped", label: "clipped ratio", color: COLORS.clipped }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(random) {
    var u1 = Math.max(1e-12, random());
    var u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      cap: clamp(Number(raw.cap == null ? 18 : raw.cap), 4, 80),
      expectedSample: clamp(Math.round(raw.expectedSample == null ? 260 : raw.expectedSample), 80, 900),
      outcomeSlope: clamp(Number(raw.outcomeSlope == null ? 1.65 : raw.outcomeSlope), -1.5, 3),
      population: clamp(Math.round(raw.population == null ? 1800 : raw.population), 600, 5000),
      seed: clamp(Math.round(raw.seed == null ? 47 : raw.seed), 1, 999),
      tilt: clamp(Number(raw.tilt == null ? 1.8 : raw.tilt), -2.5, 2.5),
      trials: clamp(Math.round(raw.trials == null ? 700 : raw.trials), 120, 2000)
    };
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
  }

  function variance(values, center) {
    if (values.length <= 1) return 0;
    var c = center == null ? mean(values) : center;
    return values.reduce(function (sum, value) {
      var d = value - c;
      return sum + d * d;
    }, 0) / (values.length - 1);
  }

  function quantile(sortedValues, p) {
    if (!sortedValues.length) return NaN;
    var index = clamp(p, 0, 1) * (sortedValues.length - 1);
    var lo = Math.floor(index);
    var hi = Math.ceil(index);
    var t = index - lo;
    return sortedValues[lo] * (1 - t) + sortedValues[hi] * t;
  }

  function generatePopulation(rawParams) {
    var params = cleanParams(rawParams);
    var random = rng(params.seed * 1000003 + params.population * 17);
    var rows = [];
    var rawPi = [];
    for (var i = 0; i < params.population; i += 1) {
      var x = (i + 0.5) / params.population;
      var texture = 0.24 * Math.sin(2 * Math.PI * (2.2 * x + 0.07 * params.seed));
      var noise = (0.45 + 0.55 * x) * normal(random);
      var y = 35 + 24 * params.outcomeSlope * (x - 0.5) + 8 * texture + 4.2 * noise;
      var visibility = Math.exp(params.tilt * (2 * x - 1 + 0.16 * Math.sin(6 * Math.PI * x)));
      rows.push({ x: x, y: y, visibility: visibility });
      rawPi.push(visibility);
    }

    var rawMean = mean(rawPi);
    var base = params.expectedSample / params.population;
    var piTotal = 0;
    rows.forEach(function (row) {
      row.pi = clamp(base * row.visibility / rawMean, 0.006, 0.92);
      row.weight = 1 / row.pi;
      piTotal += row.pi;
    });

    return {
      params: params,
      rows: rows,
      trueMean: mean(rows.map(function (row) { return row.y; })),
      expectedN: piTotal
    };
  }

  function estimateFromSample(population, sample, cap) {
    var n = sample.length;
    if (!n) {
      return {
        clipped: NaN,
        ess: 0,
        hajek: NaN,
        ht: NaN,
        maxWeight: 0,
        naive: NaN,
        n: 0,
        weightSum: 0
      };
    }

    var naive = mean(sample.map(function (row) { return row.y; }));
    var htTotal = 0;
    var weightSum = 0;
    var clippedNumerator = 0;
    var clippedDenominator = 0;
    var hajekNumerator = 0;
    var weightSq = 0;
    var maxWeight = 0;

    sample.forEach(function (row) {
      var w = row.weight;
      var clippedWeight = Math.min(w, cap);
      htTotal += row.y / row.pi;
      hajekNumerator += w * row.y;
      weightSum += w;
      weightSq += w * w;
      clippedNumerator += clippedWeight * row.y;
      clippedDenominator += clippedWeight;
      maxWeight = Math.max(maxWeight, w);
    });

    return {
      clipped: clippedNumerator / Math.max(1e-12, clippedDenominator),
      ess: weightSum * weightSum / Math.max(1e-12, weightSq),
      hajek: hajekNumerator / Math.max(1e-12, weightSum),
      ht: htTotal / population.rows.length,
      maxWeight: maxWeight,
      naive: naive,
      n: n,
      weightSum: weightSum
    };
  }

  function drawSample(population, random) {
    var sample = [];
    population.rows.forEach(function (row) {
      if (random() < row.pi) sample.push(row);
    });
    return sample;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams);
    var population = generatePopulation(params);
    var estimates = {
      clipped: [],
      hajek: [],
      ht: [],
      naive: []
    };
    var avgN = 0;
    var avgEss = 0;
    var avgMaxWeight = 0;
    var firstSample = null;

    for (var t = 0; t < params.trials; t += 1) {
      var random = rng(params.seed * 10000019 + t * 7919 + Math.round(params.tilt * 1000));
      var sample = drawSample(population, random);
      if (t === 0) firstSample = sample;
      var est = estimateFromSample(population, sample, params.cap);
      avgN += est.n;
      avgEss += est.ess;
      avgMaxWeight += est.maxWeight;
      ESTIMATORS.forEach(function (item) {
        estimates[item.key].push(est[item.key]);
      });
    }

    avgN /= params.trials;
    avgEss /= params.trials;
    avgMaxWeight /= params.trials;

    var summaries = {};
    ESTIMATORS.forEach(function (item) {
      var values = estimates[item.key].filter(isFinite);
      var estimateMean = mean(values);
      var bias = estimateMean - population.trueMean;
      var sd = Math.sqrt(variance(values, estimateMean));
      var rmse = Math.sqrt(values.reduce(function (sum, value) {
        var d = value - population.trueMean;
        return sum + d * d;
      }, 0) / Math.max(1, values.length));
      var sorted = values.slice().sort(function (a, b) { return a - b; });
      summaries[item.key] = {
        bias: bias,
        mean: estimateMean,
        p05: quantile(sorted, 0.05),
        p50: quantile(sorted, 0.50),
        p95: quantile(sorted, 0.95),
        rmse: rmse,
        sd: sd
      };
    });

    return {
      avgEss: avgEss,
      avgMaxWeight: avgMaxWeight,
      avgN: avgN,
      designEffect: avgN / Math.max(1e-12, avgEss),
      estimates: estimates,
      firstSample: firstSample || [],
      params: params,
      population: population,
      summaries: summaries
    };
  }

  function runAudit() {
    var flat = simulate({ seed: 13, population: 1400, expectedSample: 240, outcomeSlope: 1.4, tilt: 0, cap: 40, trials: 1200 });
    var tilted = simulate({ seed: 47, population: 1800, expectedSample: 260, outcomeSlope: 1.65, tilt: 1.8, cap: 18, trials: 1000 });
    var negative = simulate({ seed: 71, population: 1500, expectedSample: 230, outcomeSlope: 1.5, tilt: -1.7, cap: 18, trials: 900 });
    var checks = [
      Math.abs(flat.summaries.ht.bias) < 0.18,
      Math.abs(flat.summaries.naive.bias) < 0.25,
      Math.abs(tilted.summaries.ht.bias) < Math.abs(tilted.summaries.naive.bias) * 0.35,
      tilted.summaries.naive.bias > 1.0,
      negative.summaries.naive.bias < -1.0,
      isFinite(tilted.summaries.hajek.rmse),
      tilted.avgEss < tilted.avgN,
      tilted.designEffect > 1
    ];
    return {
      cases: checks.length,
      flatHtBias: flat.summaries.ht.bias,
      ok: checks.filter(Boolean).length,
      tiltedHtBias: tilted.summaries.ht.bias,
      tiltedNaiveBias: tilted.summaries.naive.bias
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value) {
    return '<div class="survey-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.faint;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, x + 12, y + 21, COLORS.text, 13, 750);
  }

  function drawPopulation(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "finite population and inclusion chance");
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 62, h: box.h - 68 };
    var rows = result.population.rows;
    var yValues = rows.map(function (row) { return row.y; });
    var minY = Math.min.apply(null, yValues);
    var maxY = Math.max.apply(null, yValues);
    function x(row) { return plot.x + row.x * plot.w; }
    function y(row) { return plot.y + (1 - (row.y - minY) / Math.max(1e-9, maxY - minY)) * plot.h; }
    function yPi(row) { return plot.y + (1 - row.pi / 0.92) * plot.h; }

    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var gy = plot.y + plot.h * g / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }

    var step = Math.max(1, Math.floor(rows.length / 460));
    for (var i = 0; i < rows.length; i += step) {
      var row = rows[i];
      ctx.fillStyle = COLORS.muted;
      ctx.globalAlpha = 0.18 + 0.58 * row.pi / 0.92;
      ctx.beginPath();
      ctx.arc(x(row), y(row), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.beginPath();
    for (var j = 0; j < rows.length; j += step) {
      var item = rows[j];
      if (j === 0) ctx.moveTo(x(item), yPi(item));
      else ctx.lineTo(x(item), yPi(item));
    }
    ctx.strokeStyle = COLORS.sample;
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, "outcome", plot.x, plot.y - 10, COLORS.muted, 10, 650);
    label(ctx, "inclusion probability", plot.x + plot.w, plot.y - 10, COLORS.sample, 10, 700, "right");
  }

  function drawDistributions(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "repeated sample estimates");
    var values = [];
    ESTIMATORS.forEach(function (item) {
      values = values.concat(result.estimates[item.key]);
    });
    values.push(result.population.trueMean);
    var minX = Math.min.apply(null, values);
    var maxX = Math.max.apply(null, values);
    var pad = Math.max(1, (maxX - minX) * 0.12);
    minX -= pad;
    maxX += pad;
    var plot = { x: box.x + 84, y: box.y + 40, w: box.w - 112, h: box.h - 64 };
    function x(value) { return plot.x + (value - minX) / Math.max(1e-9, maxX - minX) * plot.w; }

    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var gx = plot.x + plot.w * g / 4;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y - 6);
      ctx.lineTo(gx, plot.y + plot.h + 6);
      ctx.stroke();
    }
    var tx = x(result.population.trueMean);
    ctx.strokeStyle = COLORS.truth;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(tx, plot.y - 8);
    ctx.lineTo(tx, plot.y + plot.h + 8);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "truth", tx + 4, plot.y + 10, COLORS.truth, 10, 750);

    ESTIMATORS.forEach(function (item, i) {
      var y = plot.y + 26 + i * (plot.h - 22) / ESTIMATORS.length;
      var summary = result.summaries[item.key];
      label(ctx, item.label, box.x + 12, y + 4, item.color, 10, 750);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x(summary.p05), y);
      ctx.lineTo(x(summary.p95), y);
      ctx.stroke();
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x(summary.p50), y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = item.color;
      ctx.globalAlpha = 0.18;
      var sampleValues = result.estimates[item.key];
      var stride = Math.max(1, Math.floor(sampleValues.length / 90));
      for (var j = 0; j < sampleValues.length; j += stride) {
        ctx.fillRect(x(sampleValues[j]), y - 10, 1, 20);
      }
      ctx.globalAlpha = 1;
    });
  }

  function drawBias(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "bias, RMSE, and weight tail");
    var left = { x: box.x + 56, y: box.y + 42, w: box.w * 0.50 - 72, h: box.h - 78 };
    var right = { x: box.x + box.w * 0.56, y: box.y + 42, w: box.w * 0.40 - 30, h: box.h - 78 };
    var maxAbs = Math.max.apply(null, ESTIMATORS.map(function (item) {
      var s = result.summaries[item.key];
      return Math.max(Math.abs(s.bias), s.rmse);
    }).concat([1]));
    function y(value) { return left.y + left.h * (1 - (value + maxAbs) / (2 * maxAbs)); }
    var zeroY = y(0);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left.x, zeroY);
    ctx.lineTo(left.x + left.w, zeroY);
    ctx.stroke();
    ESTIMATORS.forEach(function (item, i) {
      var slot = left.w / ESTIMATORS.length;
      var cx = left.x + i * slot + slot / 2;
      var bias = result.summaries[item.key].bias;
      var rmse = result.summaries[item.key].rmse;
      ctx.fillStyle = item.color;
      ctx.globalAlpha = 0.82;
      ctx.fillRect(cx - 13, Math.min(zeroY, y(bias)), 10, Math.abs(y(bias) - zeroY));
      ctx.globalAlpha = 0.30;
      ctx.fillRect(cx + 3, y(rmse), 10, left.y + left.h - y(rmse));
      ctx.globalAlpha = 1;
      label(ctx, item.key, cx, left.y + left.h + 16, COLORS.muted, 10, 650, "center");
    });
    label(ctx, "solid = bias, pale = RMSE", left.x, box.y + box.h - 12, COLORS.muted, 10, 650);

    var weights = result.population.rows.map(function (row) { return row.weight; }).sort(function (a, b) { return b - a; });
    var maxW = Math.max.apply(null, weights);
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + right.h);
    ctx.lineTo(right.x + right.w, right.y + right.h);
    ctx.stroke();
    ctx.beginPath();
    weights.forEach(function (w, i) {
      var px = right.x + i / Math.max(1, weights.length - 1) * right.w;
      var py = right.y + (1 - w / maxW) * right.h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = COLORS.sample;
    ctx.lineWidth = 2;
    ctx.stroke();
    var capY = right.y + (1 - result.params.cap / maxW) * right.h;
    ctx.strokeStyle = COLORS.clipped;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(right.x, capY);
    ctx.lineTo(right.x + right.w, capY);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "largest weights", right.x, right.y - 10, COLORS.sample, 10, 700);
    label(ctx, "cap", right.x + right.w, capY - 4, COLORS.clipped, 10, 700, "right");
  }

  function draw(result, canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(280, Math.floor(rect.width || canvas.clientWidth || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var narrow = cssWidth < 520;
    var pad = narrow ? 12 : 18;
    var gap = narrow ? 14 : 18;
    var panelH = narrow ? 250 : 236;
    var cssHeight = pad * 2 + panelH * 3 + gap * 2;
    var targetWidth = Math.round(cssWidth * ratio);
    var targetHeight = Math.round(cssHeight * ratio);
    canvas.style.height = cssHeight + "px";
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    drawPopulation(ctx, result, { x: pad, y: pad, w: cssWidth - 2 * pad, h: panelH });
    drawDistributions(ctx, result, { x: pad, y: pad + panelH + gap, w: cssWidth - 2 * pad, h: panelH });
    drawBias(ctx, result, { x: pad, y: pad + 2 * (panelH + gap), w: cssWidth - 2 * pad, h: panelH });
  }

  function readParams(lab) {
    function number(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      var value = input ? Number(input.value) : fallback;
      return isFinite(value) ? value : fallback;
    }
    return {
      cap: number("cap", 18),
      expectedSample: number("expectedSample", 260),
      outcomeSlope: number("outcomeSlope", 165) / 100,
      population: number("population", 1800),
      seed: number("seed", 47),
      tilt: number("tilt", 180) / 100,
      trials: number("trials", 700)
    };
  }

  function updateOutputs(lab, params) {
    var labels = {
      cap: formatNumber(params.cap, 0),
      expectedSample: String(params.expectedSample),
      outcomeSlope: formatNumber(params.outcomeSlope, 2),
      population: String(params.population),
      seed: String(params.seed),
      tilt: formatNumber(params.tilt, 2),
      trials: String(params.trials)
    };
    Object.keys(labels).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(lab) {
    var params = cleanParams(readParams(lab));
    updateOutputs(lab, params);
    var result = simulate(params);
    var audit = runAudit();
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("true mean", formatNumber(result.population.trueMean, 2)),
        metric("avg sample", formatNumber(result.avgN, 1)),
        metric("naive bias", formatNumber(result.summaries.naive.bias, 2)),
        metric("HT bias", formatNumber(result.summaries.ht.bias, 2)),
        metric("avg ESS", formatNumber(result.avgEss, 1)),
        metric("audit", audit.ok + "/" + audit.cases)
      ].join("");
    }
    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function init(lab) {
    var frame = null;
    function redrawSoon() {
      if (frame != null) return;
      if (!global.requestAnimationFrame) {
        render(lab);
        return;
      }
      frame = global.requestAnimationFrame(function () {
        frame = null;
        render(lab);
      });
    }
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () { render(lab); });
      input.addEventListener("change", function () { render(lab); });
    });
    if (global.addEventListener) global.addEventListener("resize", redrawSoon);
    render(lab);
  }

  function initAll() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-survey-weight-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    cleanParams: cleanParams,
    estimateFromSample: estimateFromSample,
    generatePopulation: generatePopulation,
    runAudit: runAudit,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SurveyWeightLab = api;
})(typeof window !== "undefined" ? window : globalThis);
