(function () {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    exact: "#2563eb",
    nearest: "#be123c",
    stochastic: "#0f766e",
    band: "rgba(15, 118, 110, 0.16)",
    sweepNeg: "#f3c7c7",
    sweepFlat: "#edf2f7",
    sweepPos: "#bfe7d6",
    target: "#7c3aed",
    update: "#b45309"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rng(seed) {
    var state = mix32(seed || 1);
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(random) {
    var u = Math.max(1e-12, random());
    var v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function roundNearest(x, quantum, min, max) {
    return clamp(Math.round(x / quantum) * quantum, min, max);
  }

  function roundStochastic(x, quantum, random, min, max) {
    if (x <= min) return min;
    if (x >= max) return max;
    var lower = Math.floor(x / quantum) * quantum;
    var upper = lower + quantum;
    lower = clamp(lower, min, max);
    upper = clamp(upper, min, max);
    if (Math.abs(upper - lower) < 1e-12) return lower;
    var pUp = clamp((x - lower) / (upper - lower), 0, 1);
    return random() < pUp ? upper : lower;
  }

  function expectedStochasticRound(x, quantum, min, max) {
    if (x <= min) return min;
    if (x >= max) return max;
    var lower = Math.floor(x / quantum) * quantum;
    var upper = lower + quantum;
    lower = clamp(lower, min, max);
    upper = clamp(upper, min, max);
    if (Math.abs(upper - lower) < 1e-12) return lower;
    var pUp = clamp((x - lower) / (upper - lower), 0, 1);
    return lower * (1 - pUp) + upper * pUp;
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="sr-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function defaultParams(overrides) {
    var params = {
      batch: 16,
      learningRate: 0.035,
      microStep: 22,
      noise: 8,
      paths: 160,
      quantum: 0.05,
      seed: 17,
      steps: 180
    };
    if (overrides) {
      Object.keys(overrides).forEach(function (key) {
        params[key] = overrides[key];
      });
    }
    params.batch = Math.max(1, Math.round(params.batch));
    params.learningRate = clamp(params.learningRate, 0.005, 0.16);
    params.microStep = clamp(params.microStep, 1, 90);
    params.noise = clamp(params.noise, 0, 60);
    params.paths = Math.max(16, Math.round(params.paths));
    params.quantum = clamp(params.quantum, 0.01, 0.2);
    params.seed = Math.max(1, Math.round(params.seed));
    params.steps = Math.max(30, Math.round(params.steps));
    return params;
  }

  function makeNoise(params) {
    var random = rng(params.seed * 1009 + params.steps * 37 + params.batch * 17);
    var sigma = params.noise / 100 / Math.sqrt(params.batch);
    var out = [];
    for (var i = 0; i < params.steps; i += 1) {
      out.push(sigma === 0 ? 0 : sigma * gaussian(random));
    }
    return out;
  }

  function simulateOptimizer(params, mode, noise, seed) {
    var target = 1;
    var min = -0.5;
    var max = 1.6;
    var random = rng(seed || params.seed);
    var w = mode === "precise" ? 0 : roundNearest(0, params.quantum, min, max);
    var history = [w];
    var unchangedRun = 0;
    var stuckAt = null;

    for (var step = 0; step < params.steps; step += 1) {
      var gradient = w - target + noise[step];
      var proposal = w - params.learningRate * gradient;
      var next = proposal;
      if (mode === "nearest") next = roundNearest(proposal, params.quantum, min, max);
      if (mode === "stochastic") next = roundStochastic(proposal, params.quantum, random, min, max);
      if (Math.abs(next - w) < 1e-12) unchangedRun += 1;
      else unchangedRun = 0;
      if (mode === "nearest" && stuckAt == null && unchangedRun >= 12 && Math.abs(next - target) > params.quantum) {
        stuckAt = step - 10;
      }
      w = next;
      history.push(w);
    }

    return {
      final: w,
      gap: Math.abs(w - target),
      history: history,
      stuckAt: stuckAt
    };
  }

  function quantile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var idx = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
    var lo = Math.floor(idx);
    var hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function summarizePaths(paths) {
    var steps = paths[0].history.length;
    var mean = [];
    var p10 = [];
    var p90 = [];
    for (var i = 0; i < steps; i += 1) {
      var column = paths.map(function (path) { return path.history[i]; });
      mean.push(column.reduce(function (sum, value) { return sum + value; }, 0) / column.length);
      p10.push(quantile(column, 0.1));
      p90.push(quantile(column, 0.9));
    }
    return {
      finalValues: paths.map(function (path) { return path.final; }),
      mean: mean,
      p10: p10,
      p90: p90
    };
  }

  function simulateAccumulator(params, mode, seed) {
    var min = -0.5;
    var max = 6;
    var random = rng(seed || params.seed);
    var increment = params.quantum * params.microStep / 100;
    var x = 0;
    var history = [x];
    for (var step = 0; step < params.steps; step += 1) {
      var proposal = x + increment;
      if (mode === "precise") x = proposal;
      else if (mode === "nearest") x = roundNearest(proposal, params.quantum, min, max);
      else x = roundStochastic(proposal, params.quantum, random, min, max);
      history.push(x);
    }
    return {
      exactFinal: increment * params.steps,
      final: x,
      history: history,
      increment: increment
    };
  }

  function summarizeAccumulator(params) {
    var exact = simulateAccumulator(params, "precise");
    var nearest = simulateAccumulator(params, "nearest");
    var paths = [];
    for (var i = 0; i < params.paths; i += 1) {
      paths.push(simulateAccumulator(params, "stochastic", params.seed * 7919 + i * 104729));
    }
    var summary = summarizePaths(paths);
    return {
      exact: exact,
      nearest: nearest,
      stochastic: summary
    };
  }

  function sweep(params) {
    var quanta = [0.02, 0.03, 0.04, 0.05, 0.07, 0.09, 0.12];
    var rates = [0.015, 0.025, 0.035, 0.05, 0.075, 0.11];
    var cells = [];
    var wins = 0;
    var total = 0;
    rates.forEach(function (rate) {
      quanta.forEach(function (quantum) {
        var local = defaultParams({
          batch: params.batch,
          learningRate: rate,
          microStep: params.microStep,
          noise: 0,
          paths: 64,
          quantum: quantum,
          seed: params.seed,
          steps: params.steps
        });
        var result = simulateAll(local, true);
        var nearestGap = result.nearest.gap;
        var srGap = Math.abs(result.stochastic.mean[result.stochastic.mean.length - 1] - 1);
        var improvement = nearestGap - srGap;
        if (improvement > quantum * 0.15) wins += 1;
        total += 1;
        cells.push({
          improvement: improvement,
          quantum: quantum,
          rate: rate
        });
      });
    });
    return {
      cells: cells,
      quanta: quanta,
      rates: rates,
      total: total,
      wins: wins
    };
  }

  function simulateAll(input, skipSweep) {
    var params = defaultParams(input);
    var noise = makeNoise(params);
    var exact = simulateOptimizer(params, "precise", noise, params.seed);
    var nearest = simulateOptimizer(params, "nearest", noise, params.seed);
    var paths = [];
    for (var i = 0; i < params.paths; i += 1) {
      paths.push(simulateOptimizer(params, "stochastic", noise, params.seed * 3571 + i * 2654435761));
    }
    var stochastic = summarizePaths(paths);
    var accumulator = summarizeAccumulator(params);
    var result = {
      accumulator: accumulator,
      exact: exact,
      nearest: nearest,
      params: params,
      stochastic: stochastic
    };
    if (!skipSweep) result.sweep = sweep(params);
    return result;
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(title, box.x, box.y - 12);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.fillText(subtitle, box.x + box.w, box.y - 12);
    }
  }

  function lineScales(box, n, minY, maxY) {
    return {
      x: function (i) {
        return box.x + i / Math.max(1, n - 1) * box.w;
      },
      y: function (value) {
        return box.y + box.h - (value - minY) / Math.max(1e-9, maxY - minY) * box.h;
      }
    };
  }

  function gridLines(ctx, box, ticks) {
    ctx.strokeStyle = COLORS.faint;
    ticks.forEach(function (t) {
      var y = box.y + box.h * t;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
    });
  }

  function drawLine(ctx, scales, values, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    values.forEach(function (value, i) {
      var x = scales.x(i);
      var y = scales.y(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawBand(ctx, scales, low, high) {
    ctx.fillStyle = COLORS.band;
    ctx.beginPath();
    low.forEach(function (value, i) {
      var x = scales.x(i);
      var y = scales.y(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (var i = high.length - 1; i >= 0; i -= 1) {
      ctx.lineTo(scales.x(i), scales.y(high[i]));
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawOptimizer(ctx, result, box) {
    panel(ctx, box, "Stored-weight optimizer", "target = 1");
    gridLines(ctx, box, [0, 0.25, 0.5, 0.75, 1]);
    var values = result.exact.history
      .concat(result.nearest.history)
      .concat(result.stochastic.p10)
      .concat(result.stochastic.p90);
    var minY = Math.min(-0.05, Math.min.apply(null, values) - 0.04);
    var maxY = Math.max(1.08, Math.max.apply(null, values) + 0.04);
    var scales = lineScales(box, result.exact.history.length, minY, maxY);
    drawBand(ctx, scales, result.stochastic.p10, result.stochastic.p90);
    drawLine(ctx, scales, result.exact.history, COLORS.exact, 2);
    drawLine(ctx, scales, result.nearest.history, COLORS.nearest, 2);
    drawLine(ctx, scales, result.stochastic.mean, COLORS.stochastic, 2);
    ctx.setLineDash([4, 4]);
    drawLine(ctx, scales, result.exact.history.map(function () { return 1; }), COLORS.target, 1);
    ctx.setLineDash([]);
    label(ctx, "exact", box.x + box.w - 74, box.y + 18, COLORS.exact);
    label(ctx, "nearest", box.x + box.w - 74, box.y + 36, COLORS.nearest);
    label(ctx, "SR mean", box.x + box.w - 74, box.y + 54, COLORS.stochastic);
    axisLabel(ctx, "steps", box.x + box.w, box.y + box.h + 20, "right");
  }

  function drawAccumulator(ctx, result, box) {
    panel(ctx, box, "Sub-grid ledger", "tiny update repeated");
    gridLines(ctx, box, [0, 0.25, 0.5, 0.75, 1]);
    var acc = result.accumulator;
    var values = acc.exact.history.concat(acc.nearest.history).concat(acc.stochastic.p90);
    var maxY = Math.max(0.1, Math.max.apply(null, values) * 1.05);
    var scales = lineScales(box, acc.exact.history.length, 0, maxY);
    drawBand(ctx, scales, acc.stochastic.p10, acc.stochastic.p90);
    drawLine(ctx, scales, acc.exact.history, COLORS.exact, 2);
    drawLine(ctx, scales, acc.nearest.history, COLORS.nearest, 2);
    drawLine(ctx, scales, acc.stochastic.mean, COLORS.stochastic, 2);
    label(ctx, "micro update = " + formatPercent(result.params.microStep / 100, 0) + " of one grid cell", box.x + 8, box.y + 18, COLORS.update);
  }

  function drawHistogram(ctx, result, box) {
    panel(ctx, box, "Final weights", "160 runs");
    var values = result.stochastic.finalValues;
    var q = result.params.quantum;
    var min = Math.min.apply(null, values.concat([result.nearest.final, result.exact.final, 0]));
    var max = Math.max.apply(null, values.concat([result.nearest.final, result.exact.final, 1]));
    min = Math.floor((min - q) / q) * q;
    max = Math.ceil((max + q) / q) * q;
    var bins = [];
    var nBins = Math.max(1, Math.round((max - min) / q) + 1);
    for (var i = 0; i < nBins; i += 1) bins.push(0);
    values.forEach(function (value) {
      var idx = clamp(Math.round((value - min) / q), 0, bins.length - 1);
      bins[idx] += 1;
    });
    var maxCount = Math.max.apply(null, bins.concat([1]));
    var barW = box.w / bins.length;
    bins.forEach(function (count, i) {
      var h = count / maxCount * box.h;
      ctx.fillStyle = COLORS.band;
      ctx.fillRect(box.x + i * barW + 1, box.y + box.h - h, Math.max(1, barW - 2), h);
    });
    drawMarker(ctx, box, min, max, result.nearest.final, COLORS.nearest, "nearest", 0);
    drawMarker(ctx, box, min, max, quantile(values, 0.5), COLORS.stochastic, "SR median", 15);
    drawMarker(ctx, box, min, max, result.exact.final, COLORS.exact, "exact", 30);
  }

  function drawMarker(ctx, box, min, max, value, color, text, offsetY) {
    var x = box.x + (value - min) / Math.max(1e-9, max - min) * box.w;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, box.y);
    ctx.lineTo(x, box.y + box.h);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, clamp(x, box.x + 30, box.x + box.w - 30), box.y + box.h + 8 + (offsetY || 0));
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "Dead-zone sweep", "SR closer to target");
    var sweepData = result.sweep;
    var padLeft = 42;
    var padBottom = 24;
    var grid = {
      x: box.x + padLeft,
      y: box.y + 8,
      w: box.w - padLeft - 4,
      h: box.h - padBottom - 8
    };
    var cellW = grid.w / sweepData.quanta.length;
    var cellH = grid.h / sweepData.rates.length;
    var maxAbs = sweepData.cells.reduce(function (m, cell) {
      return Math.max(m, Math.abs(cell.improvement));
    }, 1e-6);
    sweepData.cells.forEach(function (cell) {
      var col = sweepData.quanta.indexOf(cell.quantum);
      var row = sweepData.rates.indexOf(cell.rate);
      var t = clamp(cell.improvement / maxAbs, -1, 1);
      ctx.fillStyle = t >= 0 ? mixColor(COLORS.sweepFlat, COLORS.sweepPos, t) : mixColor(COLORS.sweepFlat, COLORS.sweepNeg, -t);
      ctx.fillRect(grid.x + col * cellW, grid.y + row * cellH, cellW - 1, cellH - 1);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    sweepData.rates.forEach(function (rate, row) {
      ctx.fillText(rate.toFixed(3), box.x + padLeft - 8, grid.y + row * cellH + cellH / 2);
    });
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    sweepData.quanta.forEach(function (quantum, col) {
      ctx.fillText(quantum.toFixed(2), grid.x + col * cellW + cellW / 2, grid.y + grid.h + 8);
    });
    axisLabel(ctx, "lr", box.x + 4, grid.y - 2, "left");
    axisLabel(ctx, "grid size", grid.x + grid.w, grid.y + grid.h + 23, "right");
  }

  function mixColor(a, b, t) {
    function hexToRgb(hex) {
      return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
      ];
    }
    var ca = hexToRgb(a);
    var cb = hexToRgb(b);
    var out = ca.map(function (v, i) {
      return Math.round(v + (cb[i] - v) * t);
    });
    return "rgb(" + out.join(",") + ")";
  }

  function label(ctx, text, x, y, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function axisLabel(ctx, text, x, y, align) {
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 820;
    var width = Math.max(320, parentWidth);
    var compact = width < 570;
    var height = compact ? 1040 : 720;
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

    var left = compact ? 48 : 54;
    var right = compact ? 16 : 22;
    var plotW = width - left - right;

    if (compact) {
      drawOptimizer(ctx, result, { x: left, y: 44, w: plotW, h: 210 });
      drawAccumulator(ctx, result, { x: left, y: 316, w: plotW, h: 190 });
      drawHistogram(ctx, result, { x: left, y: 574, w: plotW, h: 150 });
      drawSweep(ctx, result, { x: left, y: 802, w: plotW, h: 180 });
    } else {
      drawOptimizer(ctx, result, { x: left, y: 48, w: plotW * 0.58, h: 255 });
      drawHistogram(ctx, result, { x: left + plotW * 0.66, y: 48, w: plotW * 0.34, h: 160 });
      drawAccumulator(ctx, result, { x: left, y: 386, w: plotW * 0.48, h: 205 });
      drawSweep(ctx, result, { x: left + plotW * 0.56, y: 322, w: plotW * 0.44, h: 245 });
    }
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var value = Number(input.value);
      params[input.getAttribute("data-param")] = Number.isFinite(value) ? value : undefined;
    });
    return defaultParams(params);
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "learningRate") output.textContent = params.learningRate.toFixed(3);
      else if (key === "quantum") output.textContent = params.quantum.toFixed(3);
      else if (key === "noise") output.textContent = params.noise + "%";
      else if (key === "microStep") output.textContent = params.microStep + "%";
      else output.textContent = String(params[key]);
    });
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulateAll(params);
    var finalMean = result.stochastic.mean[result.stochastic.mean.length - 1];
    var accMean = result.accumulator.stochastic.mean[result.accumulator.stochastic.mean.length - 1];
    var accRatio = accMean / Math.max(1e-9, result.accumulator.exact.final);
    var metrics = root.querySelector("[data-metrics]");
    var canvas = root.querySelector("[data-canvas]");
    updateOutputs(root, params);
    metrics.innerHTML = [
      metric("nearest final", formatNumber(result.nearest.final, 3)),
      metric("SR mean final", formatNumber(finalMean, 3)),
      metric("exact final", formatNumber(result.exact.final, 3)),
      metric("nearest stuck", result.nearest.stuckAt == null ? "no" : "step " + result.nearest.stuckAt),
      metric("micro-update kept", formatPercent(accRatio, 1)),
      metric("sweep wins", result.sweep.wins + "/" + result.sweep.total)
    ].join("");
    drawChart(canvas, result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-sr-lab]"));
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
    var unbiased = 0;
    var unbiasedTotal = 0;
    [0.02, 0.05, 0.125].forEach(function (q) {
      for (var i = 1; i < 20; i += 1) {
        var x = 0.7 + q * i / 20;
        unbiasedTotal += 1;
        if (Math.abs(expectedStochasticRound(x, q, -2, 2) - x) < 1e-12) unbiased += 1;
      }
    });

    var optimizer = 0;
    var optimizerTotal = 0;
    [0.025, 0.05, 0.08, 0.11].forEach(function (q) {
      [0.02, 0.035, 0.05].forEach(function (lr) {
        var result = simulateAll({
          batch: 1024,
          learningRate: lr,
          microStep: 25,
          noise: 0,
          paths: 256,
          quantum: q,
          seed: 29,
          steps: 220
        }, true);
        var srGap = Math.abs(result.stochastic.mean[result.stochastic.mean.length - 1] - 1);
        optimizerTotal += 1;
        if (srGap + q * 0.75 < result.nearest.gap) optimizer += 1;
      });
    });

    return {
      optimizer: optimizer,
      optimizerTotal: optimizerTotal,
      passed: unbiased + optimizer,
      total: unbiasedTotal + optimizerTotal,
      unbiased: unbiased,
      unbiasedTotal: unbiasedTotal
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      audit: audit,
      defaultParams: defaultParams,
      expectedStochasticRound: expectedStochasticRound,
      roundNearest: roundNearest,
      roundStochastic: roundStochastic,
      simulateAll: simulateAll
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
