(function () {
  "use strict";

  var SCENARIOS = [
    {
      id: "null",
      label: "same Gaussian",
      note: "a calibration case: both samples are N(0, 1)"
    },
    {
      id: "mean",
      label: "small mean shift",
      note: "Q is moved right by a little more than half a standard deviation"
    },
    {
      id: "scale",
      label: "wider tails",
      note: "the means agree, but Q spreads its mass further out"
    },
    {
      id: "bump",
      label: "rare tail bump",
      note: "most of Q looks ordinary; a small component lives in the right tail"
    },
    {
      id: "shape",
      label: "same center, different shape",
      note: "P has two modes while Q is a single broad cloud"
    }
  ];

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    panel: "#f8fafc",
    p: "#2563eb",
    q: "#be123c",
    witness: "#0f766e",
    nullBar: "#cbd5e1",
    nullDark: "#64748b",
    selected: "#7c3aed",
    median: "#b45309"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(random, mean, sd) {
    var u = Math.max(1e-12, random());
    var v = Math.max(1e-12, random());
    var z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + sd * z;
  }

  function mixture(random, components) {
    var u = random();
    var acc = 0;
    for (var i = 0; i < components.length; i += 1) {
      acc += components[i].weight;
      if (u <= acc || i === components.length - 1) {
        return normal(random, components[i].mean, components[i].sd);
      }
    }
    return normal(random, 0, 1);
  }

  function sampleOne(random, scenario, group) {
    if (scenario.id === "mean") {
      return group === "p" ? normal(random, 0, 1) : normal(random, 0.58, 1);
    }
    if (scenario.id === "scale") {
      return group === "p" ? normal(random, 0, 0.78) : normal(random, 0, 1.45);
    }
    if (scenario.id === "bump") {
      if (group === "p") return normal(random, 0, 1);
      return mixture(random, [
        { weight: 0.88, mean: 0, sd: 1 },
        { weight: 0.12, mean: 2.9, sd: 0.32 }
      ]);
    }
    if (scenario.id === "shape") {
      if (group === "p") {
        return mixture(random, [
          { weight: 0.5, mean: -1.2, sd: 0.35 },
          { weight: 0.5, mean: 1.2, sd: 0.35 }
        ]);
      }
      return normal(random, 0, 1.05);
    }
    return normal(random, 0, 1);
  }

  function sampleScenario(scenarioIndex, n, seed) {
    var scenario = SCENARIOS[clamp(Math.round(scenarioIndex), 0, SCENARIOS.length - 1)];
    var random = rng(0x9E3779B1 ^ Math.imul(seed + 17, 0x85EBCA6B) ^ scenarioIndex);
    var p = [];
    var q = [];
    for (var i = 0; i < n; i += 1) p.push(sampleOne(random, scenario, "p"));
    for (var j = 0; j < n; j += 1) q.push(sampleOne(random, scenario, "q"));
    return { p: p, q: q, scenario: scenario };
  }

  function sigmaFromSlider(value) {
    var t = clamp(Number(value), 0, 100) / 100;
    return Math.exp(Math.log(0.12) + t * (Math.log(3.5) - Math.log(0.12)));
  }

  function defaultParams(input) {
    var params = {
      bandwidth: 57,
      n: 72,
      scenario: 1,
      seed: 31
    };
    if (input) {
      Object.keys(input).forEach(function (key) {
        params[key] = input[key];
      });
    }
    params.bandwidth = clamp(Number(params.bandwidth), 0, 100);
    params.n = Math.round(clamp(Number(params.n), 36, 128));
    params.scenario = Math.round(clamp(Number(params.scenario), 0, SCENARIOS.length - 1));
    params.seed = Math.round(clamp(Number(params.seed), 1, 999));
    params.sigma = sigmaFromSlider(params.bandwidth);
    params.permutations = 99;
    return params;
  }

  function kernel(x, y, sigma) {
    var d = x - y;
    return Math.exp(-0.5 * d * d / (sigma * sigma));
  }

  function kernelMatrix(values, sigma) {
    var n = values.length;
    var matrix = new Array(n);
    for (var i = 0; i < n; i += 1) {
      var row = new Array(n);
      matrix[i] = row;
      for (var j = 0; j <= i; j += 1) {
        var v = kernel(values[i], values[j], sigma);
        row[j] = v;
        if (i !== j) matrix[j][i] = v;
      }
    }
    return matrix;
  }

  function mmd2FromLabels(matrix, labels, nP) {
    var total = labels.length;
    var nQ = total - nP;
    var pp = 0;
    var qq = 0;
    var pq = 0;
    for (var i = 0; i < total; i += 1) {
      var li = labels[i];
      var row = matrix[i];
      for (var j = 0; j < total; j += 1) {
        if (li && labels[j]) pp += row[j];
        else if (!li && !labels[j]) qq += row[j];
        else pq += row[j];
      }
    }
    return pp / (nP * nP) + qq / (nQ * nQ) - pq / (nP * nQ);
  }

  function mmd2(p, q, sigma) {
    var values = p.concat(q);
    var labels = new Array(values.length);
    for (var i = 0; i < values.length; i += 1) labels[i] = i < p.length;
    return mmd2FromLabels(kernelMatrix(values, sigma), labels, p.length);
  }

  function permutationNull(matrix, nP, permutations, seed) {
    var total = matrix.length;
    var labels = new Array(total);
    var observedLabels = new Array(total);
    for (var i = 0; i < total; i += 1) {
      observedLabels[i] = i < nP;
      labels[i] = i < nP;
    }
    var observed = mmd2FromLabels(matrix, observedLabels, nP);
    var random = rng(seed ^ 0xA53A9B5D);
    var stats = [];
    var exceed = 0;
    for (var b = 0; b < permutations; b += 1) {
      for (var reset = 0; reset < total; reset += 1) labels[reset] = reset < nP;
      for (var k = total - 1; k > 0; k -= 1) {
        var pick = Math.floor(random() * (k + 1));
        var tmp = labels[k];
        labels[k] = labels[pick];
        labels[pick] = tmp;
      }
      var stat = mmd2FromLabels(matrix, labels, nP);
      stats.push(stat);
      if (stat >= observed - 1e-12) exceed += 1;
    }
    stats.sort(function (a, b) { return a - b; });
    return {
      mean: stats.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, stats.length),
      observed: observed,
      pValue: (exceed + 1) / (permutations + 1),
      q95: stats[Math.min(stats.length - 1, Math.floor(0.95 * stats.length))],
      stats: stats
    };
  }

  function pairwiseMedianDistance(values) {
    var dists = [];
    for (var i = 0; i < values.length; i += 1) {
      for (var j = i + 1; j < values.length; j += 1) {
        var d = Math.abs(values[i] - values[j]);
        if (d > 0) dists.push(d);
      }
    }
    if (!dists.length) return 1;
    dists.sort(function (a, b) { return a - b; });
    return dists[Math.floor(dists.length / 2)];
  }

  function rangeFor(values) {
    var min = values.reduce(function (m, value) { return Math.min(m, value); }, Infinity);
    var max = values.reduce(function (m, value) { return Math.max(m, value); }, -Infinity);
    var span = Math.max(1, max - min);
    return { min: min - 0.22 * span, max: max + 0.22 * span };
  }

  function witnessAt(x, p, q, sigma) {
    var a = 0;
    var b = 0;
    for (var i = 0; i < p.length; i += 1) a += kernel(x, p[i], sigma);
    for (var j = 0; j < q.length; j += 1) b += kernel(x, q[j], sigma);
    return a / p.length - b / q.length;
  }

  function witnessCurve(p, q, sigma, xRange) {
    var grid = [];
    var peak = { x: 0, y: 0 };
    var count = 150;
    for (var i = 0; i < count; i += 1) {
      var x = xRange.min + (xRange.max - xRange.min) * i / (count - 1);
      var y = witnessAt(x, p, q, sigma);
      grid.push({ x: x, y: y });
      if (Math.abs(y) > Math.abs(peak.y)) peak = { x: x, y: y };
    }
    return { grid: grid, peak: peak };
  }

  function bandwidthSweep(p, q, selectedSigma, medianSigma) {
    var points = [];
    var minSigma = 0.10;
    var maxSigma = 4.2;
    for (var i = 0; i < 28; i += 1) {
      var sigma = Math.exp(Math.log(minSigma) + i * (Math.log(maxSigma) - Math.log(minSigma)) / 27);
      points.push({ sigma: sigma, mmd2: mmd2(p, q, sigma) });
    }
    return {
      medianSigma: medianSigma,
      points: points,
      selectedSigma: selectedSigma
    };
  }

  function compute(input) {
    var params = defaultParams(input);
    var samples = sampleScenario(params.scenario, params.n, params.seed);
    var pooled = samples.p.concat(samples.q);
    var matrix = kernelMatrix(pooled, params.sigma);
    var nullResult = permutationNull(matrix, samples.p.length, params.permutations, params.seed + params.scenario * 101);
    var xRange = rangeFor(pooled);
    var medianSigma = pairwiseMedianDistance(pooled);
    var witness = witnessCurve(samples.p, samples.q, params.sigma, xRange);
    var sweep = bandwidthSweep(samples.p, samples.q, params.sigma, medianSigma);
    return {
      nullResult: nullResult,
      params: params,
      pooled: pooled,
      q: samples.q,
      p: samples.p,
      scenario: samples.scenario,
      sweep: sweep,
      witness: witness,
      xRange: xRange
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) > 0 && Math.abs(value) < 0.001) return value.toExponential(1);
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatP(value) {
    if (value <= 0.01) return "<= 0.01";
    return value.toFixed(2);
  }

  function metric(label, value) {
    return '<div class="mmd-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(title, box.x, box.y - 12);
    if (subtitle) {
      var titleW = ctx.measureText(title).width;
      var subW = ctx.measureText(subtitle).width;
      if (titleW + subW + 24 < box.w) {
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = "right";
        ctx.fillText(subtitle, box.x + box.w, box.y - 12);
      }
    }
  }

  function xMap(box, xRange, x) {
    return box.x + (x - xRange.min) / (xRange.max - xRange.min) * box.w;
  }

  function drawAxisLabels(ctx, box, xRange) {
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    [-2, 0, 2].forEach(function (x) {
      if (x < xRange.min || x > xRange.max) return;
      var px = xMap(box, xRange, x);
      ctx.strokeStyle = COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(px, box.y);
      ctx.lineTo(px, box.y + box.h);
      ctx.stroke();
      ctx.fillText(String(x), px, box.y + box.h + 6);
    });
  }

  function histogram(values, xRange, bins) {
    var counts = new Array(bins);
    for (var i = 0; i < bins; i += 1) counts[i] = 0;
    values.forEach(function (value) {
      var t = clamp((value - xRange.min) / (xRange.max - xRange.min), 0, 0.999999);
      counts[Math.floor(t * bins)] += 1;
    });
    return counts;
  }

  function drawSamplePanel(ctx, result, box) {
    panel(ctx, box, "Samples", result.scenario.label);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    var bins = 34;
    var pHist = histogram(result.p, result.xRange, bins);
    var qHist = histogram(result.q, result.xRange, bins);
    var maxCount = 1;
    pHist.concat(qHist).forEach(function (count) { maxCount = Math.max(maxCount, count); });
    var mid = box.y + box.h * 0.5;
    var binW = box.w / bins;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(box.x, mid);
    ctx.lineTo(box.x + box.w, mid);
    ctx.stroke();
    for (var i = 0; i < bins; i += 1) {
      var px = box.x + i * binW + 1;
      var pH = pHist[i] / maxCount * (box.h * 0.40);
      var qH = qHist[i] / maxCount * (box.h * 0.40);
      ctx.fillStyle = COLORS.p;
      ctx.globalAlpha = 0.68;
      ctx.fillRect(px, mid - pH, Math.max(1, binW - 2), pH);
      ctx.fillStyle = COLORS.q;
      ctx.fillRect(px, mid, Math.max(1, binW - 2), qH);
      ctx.globalAlpha = 1;
    }
    drawAxisLabels(ctx, box, result.xRange);
    ctx.fillStyle = COLORS.p;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("P", box.x + 10, box.y + 10);
    ctx.fillStyle = COLORS.q;
    ctx.fillText("Q", box.x + 10, box.y + box.h - 24);
  }

  function drawWitnessPanel(ctx, result, box) {
    panel(ctx, box, "Witness function", "positive means P has more kernel mass");
    var grid = result.witness.grid;
    var maxAbs = grid.reduce(function (m, point) {
      return Math.max(m, Math.abs(point.y));
    }, 1e-6);
    var mid = box.y + box.h * 0.5;
    function yMap(y) {
      return mid - y / maxAbs * (box.h * 0.42);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(box.x, mid);
    ctx.lineTo(box.x + box.w, mid);
    ctx.stroke();
    ctx.beginPath();
    grid.forEach(function (point, index) {
      var x = xMap(box, result.xRange, point.x);
      var y = yMap(point.y);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = COLORS.witness;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    var peak = result.witness.peak;
    var peakX = xMap(box, result.xRange, peak.x);
    var peakY = yMap(peak.y);
    ctx.fillStyle = peak.y >= 0 ? COLORS.p : COLORS.q;
    ctx.beginPath();
    ctx.arc(peakX, peakY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = peakX > box.x + box.w * 0.72 ? "right" : "left";
    ctx.textBaseline = "middle";
    ctx.fillText("largest |w| near " + formatNumber(peak.x, 2), peakX + (ctx.textAlign === "left" ? 8 : -8), peakY);
    drawAxisLabels(ctx, box, result.xRange);
  }

  function drawNullPanel(ctx, result, box) {
    panel(ctx, box, "Permutation null", "shuffle the labels, recompute MMD");
    var stats = result.nullResult.stats;
    var observed = result.nullResult.observed;
    var maxValue = Math.max(observed, stats[stats.length - 1] || 0, 1e-8);
    var bins = 22;
    var counts = new Array(bins);
    for (var i = 0; i < bins; i += 1) counts[i] = 0;
    stats.forEach(function (value) {
      counts[Math.min(bins - 1, Math.floor(value / maxValue * bins))] += 1;
    });
    var maxCount = counts.reduce(function (m, count) { return Math.max(m, count); }, 1);
    var inner = { x: box.x + 10, y: box.y + 12, w: box.w - 20, h: box.h - 34 };
    var barW = inner.w / bins;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    counts.forEach(function (count, index) {
      var h = count / maxCount * inner.h;
      ctx.fillStyle = COLORS.nullBar;
      ctx.fillRect(inner.x + index * barW + 1, inner.y + inner.h - h, Math.max(1, barW - 2), h);
    });
    function statX(value) {
      return inner.x + value / maxValue * inner.w;
    }
    ctx.strokeStyle = COLORS.nullDark;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(statX(result.nullResult.q95), inner.y);
    ctx.lineTo(statX(result.nullResult.q95), inner.y + inner.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.q;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(statX(observed), inner.y);
    ctx.lineTo(statX(observed), inner.y + inner.h);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = COLORS.q;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("observed", Math.min(inner.x + inner.w - 2, statX(observed) - 4), inner.y + 6);
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("p = " + formatP(result.nullResult.pValue), inner.x, box.y + box.h - 7);
    ctx.textAlign = "right";
    ctx.fillText("95% null", inner.x + inner.w, box.y + box.h - 7);
  }

  function drawSweepPanel(ctx, result, box) {
    panel(ctx, box, "Bandwidth sweep", "the kernel chooses a scale");
    var points = result.sweep.points;
    var minLog = Math.log(points[0].sigma);
    var maxLog = Math.log(points[points.length - 1].sigma);
    var maxY = points.reduce(function (m, point) { return Math.max(m, point.mmd2); }, 1e-8);
    var inner = { x: box.x + 12, y: box.y + 12, w: box.w - 24, h: box.h - 38 };
    function sx(sigma) {
      return inner.x + (Math.log(sigma) - minLog) / (maxLog - minLog) * inner.w;
    }
    function sy(value) {
      return inner.y + inner.h - value / maxY * inner.h;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y + inner.h);
    ctx.lineTo(inner.x + inner.w, inner.y + inner.h);
    ctx.stroke();
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = sx(point.sigma);
      var y = sy(point.mmd2);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    var marks = [
      { sigma: result.sweep.selectedSigma, color: COLORS.selected, label: "chosen" },
      { sigma: result.sweep.medianSigma, color: COLORS.median, label: "median" }
    ].filter(function (mark) {
      return mark.sigma >= points[0].sigma && mark.sigma <= points[points.length - 1].sigma;
    }).map(function (mark) {
      mark.x = sx(mark.sigma);
      return mark;
    }).sort(function (a, b) {
      return a.x - b.x;
    });
    marks.forEach(function (mark, index) {
      var x = mark.x;
      var row = 0;
      for (var previous = 0; previous < index; previous += 1) {
        if (Math.abs(x - marks[previous].x) < 52) row = Math.max(row, marks[previous].row + 1);
      }
      mark.row = row;
      ctx.strokeStyle = mark.color;
      ctx.beginPath();
      ctx.moveTo(x, inner.y);
      ctx.lineTo(x, inner.y + inner.h);
      ctx.stroke();
      ctx.fillStyle = mark.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(mark.label, clamp(x, inner.x + 24, inner.x + inner.w - 24), inner.y + 6 + row * 14);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("small sigma", inner.x, inner.y + inner.h + 7);
    ctx.textAlign = "right";
    ctx.fillText("large sigma", inner.x + inner.w, inner.y + inner.h + 7);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 820;
    var width = Math.max(320, parentWidth);
    var compact = width < 590;
    var height = compact ? 1040 : 760;
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    var left = compact ? 44 : 52;
    var right = compact ? 16 : 22;
    var plotW = width - left - right;
    if (compact) {
      drawSamplePanel(ctx, result, { x: left, y: 48, w: plotW, h: 170 });
      drawWitnessPanel(ctx, result, { x: left, y: 296, w: plotW, h: 180 });
      drawNullPanel(ctx, result, { x: left, y: 554, w: plotW, h: 170 });
      drawSweepPanel(ctx, result, { x: left, y: 804, w: plotW, h: 165 });
    } else {
      drawSamplePanel(ctx, result, { x: left, y: 54, w: plotW * 0.46, h: 235 });
      drawWitnessPanel(ctx, result, { x: left + plotW * 0.54, y: 54, w: plotW * 0.46, h: 235 });
      drawNullPanel(ctx, result, { x: left, y: 390, w: plotW * 0.46, h: 205 });
      drawSweepPanel(ctx, result, { x: left + plotW * 0.54, y: 390, w: plotW * 0.46, h: 205 });
    }
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      var value = Number(input.value);
      if (Number.isFinite(value)) params[key] = value;
    });
    return defaultParams(params);
  }

  function updateOutputs(root, result) {
    root.querySelector('[data-value="scenario"]').textContent = result.scenario.label;
    root.querySelector('[data-value="n"]').textContent = String(result.params.n);
    root.querySelector('[data-value="bandwidth"]').textContent = result.params.sigma.toFixed(2);
    root.querySelector('[data-value="seed"]').textContent = String(result.params.seed);
  }

  function peakLabel(peak) {
    var side = peak.y >= 0 ? "P" : "Q";
    return side + " @ " + peak.x.toFixed(2);
  }

  function render(root) {
    var result = compute(paramsFromRoot(root));
    var metrics = root.querySelector("[data-metrics]");
    var canvas = root.querySelector("[data-canvas]");
    updateOutputs(root, result);
    metrics.innerHTML = [
      metric("MMD squared", formatNumber(result.nullResult.observed, 4)),
      metric("permutation p", formatP(result.nullResult.pValue)),
      metric("sigma", result.params.sigma.toFixed(2)),
      metric("median heuristic", result.sweep.medianSigma.toFixed(2)),
      metric("witness peak", peakLabel(result.witness.peak)),
      metric("null 95%", formatNumber(result.nullResult.q95, 4))
    ].join("");
    drawChart(canvas, result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-mmd-lab]"));
    labs.forEach(function (root) {
      var frame = null;
      function requestRender() {
        if (frame) window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(function () {
          frame = null;
          render(root);
        });
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      window.addEventListener("resize", requestRender);
    });
  }

  function audit() {
    var checks = [];
    var x = [-1.2, -0.1, 0.4, 1.1];
    var y = [-0.8, 0.2, 0.9, 1.7];
    checks.push(["MMD is symmetric", Math.abs(mmd2(x, y, 0.9) - mmd2(y, x, 0.9)) < 1e-12]);
    checks.push(["identical samples have zero biased MMD", Math.abs(mmd2(x, x, 0.9)) < 1e-12]);
    checks.push(["Gaussian kernel is one on the diagonal", Math.abs(kernel(2.3, 2.3, 0.7) - 1) < 1e-12]);
    [0, 1, 2, 3, 4].forEach(function (scenario) {
      var result = compute({ scenario: scenario, n: 58, bandwidth: 57, seed: 41 });
      checks.push(["p-value in range for scenario " + scenario, result.nullResult.pValue > 0 && result.nullResult.pValue <= 1]);
      checks.push(["witness finite for scenario " + scenario, Number.isFinite(result.witness.peak.y)]);
      checks.push(["median heuristic positive for scenario " + scenario, result.sweep.medianSigma > 0]);
    });
    var shifted = compute({ scenario: 1, n: 86, bandwidth: 57, seed: 31 });
    var same = compute({ scenario: 0, n: 86, bandwidth: 57, seed: 31 });
    checks.push(["mean shift exceeds matched null statistic", shifted.nullResult.observed > same.nullResult.observed]);
    checks.push(["mean shift is detected for default-like seed", shifted.nullResult.pValue <= 0.08]);
    var passed = checks.filter(function (row) { return row[1]; }).length;
    return { passed: passed, total: checks.length, checks: checks };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      audit: audit,
      bandwidthSweep: bandwidthSweep,
      compute: compute,
      defaultParams: defaultParams,
      kernel: kernel,
      mmd2: mmd2,
      pairwiseMedianDistance: pairwiseMedianDistance,
      permutationNull: permutationNull,
      sampleScenario: sampleScenario,
      sigmaFromSlider: sigmaFromSlider,
      witnessAt: witnessAt
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
