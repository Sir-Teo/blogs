(function () {
  var COLORS = {
    bar: "#0f766e",
    error: "#be123c",
    muted: "#5d6872",
    outlier: "#b45309",
    protected: "#7c3aed",
    rule: "#d7dee5",
    text: "#172026"
  };

  var BATCH = 96;
  var DIMS = 64;
  var OUT = 48;

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function formatPercent(value) {
    return Math.round(value * 100) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits);
  }

  function makeProblem(params) {
    var rand = rng(7717 + params.outliers * 13 + params.outlierScale * 31);
    var outlierCount = Math.round(DIMS * params.outliers / 100);
    var activations = [];
    var weights = [];

    for (var i = 0; i < BATCH; i += 1) {
      var row = [];
      for (var d = 0; d < DIMS; d += 1) {
        var scale = d < outlierCount ? params.outlierScale : 1;
        var value = scale * normal(rand);
        if (d < outlierCount && rand() < 0.08) value *= 1.8;
        row.push(value);
      }
      activations.push(row);
    }

    for (var j = 0; j < DIMS; j += 1) {
      var wRow = [];
      for (var k = 0; k < OUT; k += 1) {
        var structured = Math.sin((j + 1) * (k + 3) * 0.07) * 0.25;
        var salient = j < outlierCount ? 1.15 : 1;
        wRow.push(salient * (0.55 * normal(rand) + structured));
      }
      weights.push(wRow);
    }

    return { activations: activations, weights: weights, outlierCount: outlierCount };
  }

  function matmul(activations, weights, channels) {
    var selected = channels || null;
    var out = [];
    for (var i = 0; i < activations.length; i += 1) {
      var row = Array(OUT).fill(0);
      var channelList = selected || activations[i].map(function (_, index) { return index; });
      for (var c = 0; c < channelList.length; c += 1) {
        var d = channelList[c];
        var a = activations[i][d];
        for (var k = 0; k < OUT; k += 1) row[k] += a * weights[d][k];
      }
      out.push(row);
    }
    return out;
  }

  function rmsByChannel(activations) {
    var rms = Array(DIMS).fill(0);
    for (var d = 0; d < DIMS; d += 1) {
      var sum = 0;
      for (var i = 0; i < BATCH; i += 1) sum += activations[i][d] * activations[i][d];
      rms[d] = Math.sqrt(sum / BATCH);
    }
    return rms;
  }

  function smoothProblem(problem, rms, alpha) {
    var logTotal = 0;
    var scales = rms.map(function (value) {
      return Math.pow(Math.max(value, 1e-6), alpha);
    });
    scales.forEach(function (value) { logTotal += Math.log(value); });
    var geometricMean = Math.exp(logTotal / scales.length);
    scales = scales.map(function (value) { return value / geometricMean; });

    var activations = problem.activations.map(function (row) {
      return row.map(function (value, d) { return value / scales[d]; });
    });
    var weights = problem.weights.map(function (row, d) {
      return row.map(function (value) { return value * scales[d]; });
    });
    return { activations: activations, weights: weights, scales: scales };
  }

  function protectedChannels(rms, protectedPercent) {
    var count = Math.round(DIMS * protectedPercent / 100);
    var ranked = rms.map(function (value, index) { return { index: index, value: value }; })
      .sort(function (a, b) { return b.value - a.value; });
    return ranked.slice(0, count).map(function (item) { return item.index; });
  }

  function makeChannelMask(channels) {
    var mask = Array(DIMS).fill(false);
    channels.forEach(function (index) { mask[index] = true; });
    return mask;
  }

  function quantizeValue(value, scale, qmax) {
    if (scale <= 0) return { value: 0, code: 0 };
    var code = Math.max(-qmax, Math.min(qmax, Math.round(value / scale)));
    return { value: code * scale, code: code };
  }

  function quantizeActivations(activations, protectedMask, qmax, outlierCount) {
    var quantized = [];
    var quietCodes = {};
    for (var i = 0; i < activations.length; i += 1) {
      var maxAbs = 0;
      for (var d = 0; d < DIMS; d += 1) {
        if (!protectedMask[d]) maxAbs = Math.max(maxAbs, Math.abs(activations[i][d]));
      }
      var scale = maxAbs / qmax || 1;
      var row = [];
      for (var j = 0; j < DIMS; j += 1) {
        if (protectedMask[j]) {
          row.push(activations[i][j]);
        } else {
          var q = quantizeValue(activations[i][j], scale, qmax);
          row.push(q.value);
          if (j >= outlierCount) quietCodes[q.code] = true;
        }
      }
      quantized.push(row);
    }
    return { values: quantized, quietLevelShare: Object.keys(quietCodes).length / (2 * qmax + 1) };
  }

  function quantizeWeights(weights, protectedMask, qmax, groupSize) {
    var quantized = weights.map(function (row) { return row.slice(); });
    for (var start = 0; start < DIMS; start += groupSize) {
      var end = Math.min(DIMS, start + groupSize);
      for (var k = 0; k < OUT; k += 1) {
        var maxAbs = 0;
        for (var d = start; d < end; d += 1) {
          if (!protectedMask[d]) maxAbs = Math.max(maxAbs, Math.abs(weights[d][k]));
        }
        var scale = maxAbs / qmax || 1;
        for (var j = start; j < end; j += 1) {
          if (!protectedMask[j]) quantized[j][k] = quantizeValue(weights[j][k], scale, qmax).value;
        }
      }
    }
    return quantized;
  }

  function outputStats(reference, estimate) {
    var err2 = 0;
    var ref2 = 0;
    var dot = 0;
    var est2 = 0;
    var absErr = [];
    for (var i = 0; i < reference.length; i += 1) {
      var row = [];
      for (var k = 0; k < reference[i].length; k += 1) {
        var diff = estimate[i][k] - reference[i][k];
        err2 += diff * diff;
        ref2 += reference[i][k] * reference[i][k];
        est2 += estimate[i][k] * estimate[i][k];
        dot += reference[i][k] * estimate[i][k];
        row.push(Math.abs(diff));
      }
      absErr.push(row);
    }
    return {
      absErr: absErr,
      cosine: dot / Math.sqrt(Math.max(ref2 * est2, 1e-12)),
      relRmse: Math.sqrt(err2 / Math.max(ref2, 1e-12))
    };
  }

  function median(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    return sorted[Math.floor(sorted.length / 2)];
  }

  function evaluate(params) {
    var problem = makeProblem(params);
    var originalRms = rmsByChannel(problem.activations);
    var protectedList = protectedChannels(originalRms, params.protected);
    var protectedMask = makeChannelMask(protectedList);
    var smoothed = smoothProblem(problem, originalRms, params.smooth / 100);
    var smoothRms = rmsByChannel(smoothed.activations);
    var qmax = Math.pow(2, params.bits - 1) - 1;
    var actQuant = quantizeActivations(smoothed.activations, protectedMask, qmax, problem.outlierCount);
    var weightQuant = quantizeWeights(smoothed.weights, protectedMask, qmax, params.groupSize);
    var reference = matmul(problem.activations, problem.weights);
    var estimate = matmul(actQuant.values, weightQuant);
    var stats = outputStats(reference, estimate);
    var fp16Bytes = DIMS * OUT * 2;
    var protectedCount = protectedList.length;
    var quantizedWeights = (DIMS - protectedCount) * OUT * params.bits / 8;
    var protectedWeights = protectedCount * OUT * 2;
    var scaleBytes = Math.ceil(DIMS / params.groupSize) * OUT * 2;
    var compressedBytes = quantizedWeights + protectedWeights + scaleBytes;
    var maxRms = Math.max.apply(null, smoothRms);
    var medRms = median(smoothRms);

    return {
      compression: fp16Bytes / compressedBytes,
      outlierCount: problem.outlierCount,
      protectedList: protectedList,
      protectedMask: protectedMask,
      quietLevelShare: actQuant.quietLevelShare,
      rms: smoothRms,
      scaleRatio: maxRms / Math.max(medRms, 1e-9),
      stats: stats
    };
  }

  function metric(label, value) {
    return '<div class="quant-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawLabel(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(330, parentWidth);
    var height = width < 560 ? 560 : 500;
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

    var compact = width < 560;
    var left = compact ? 42 : 58;
    var right = compact ? 18 : 34;
    var top = 36;
    var plotW = width - left - right;
    var rmsHeight = compact ? 150 : 170;
    var sorted = result.rms.map(function (value, index) {
      return { index: index, value: value };
    }).sort(function (a, b) { return b.value - a.value; });
    var maxRms = Math.max.apply(null, result.rms);
    var barW = plotW / sorted.length;

    drawLabel(ctx, "Activation channel RMS after smoothing", left, top - 12, "left", "bottom", COLORS.text);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + rmsHeight);
    ctx.lineTo(width - right, top + rmsHeight);
    ctx.stroke();

    sorted.forEach(function (item, rank) {
      var h = item.value / maxRms * rmsHeight;
      var color = item.index < result.outlierCount ? COLORS.outlier : COLORS.bar;
      if (result.protectedMask[item.index]) color = COLORS.protected;
      ctx.fillStyle = color;
      ctx.fillRect(left + rank * barW, top + rmsHeight - h, Math.max(1, barW - 1), h);
    });
    drawLabel(ctx, "sorted channels", left + plotW / 2, top + rmsHeight + 20, "center", "top", COLORS.muted);

    var heatTop = top + rmsHeight + (compact ? 54 : 62);
    var heatH = compact ? 230 : 220;
    var heatW = plotW;
    var cellW = heatW / OUT;
    var cellH = heatH / BATCH;
    var maxErr = 0;
    result.stats.absErr.forEach(function (row) {
      row.forEach(function (value) { maxErr = Math.max(maxErr, value); });
    });

    drawLabel(ctx, "Output absolute error heatmap", left, heatTop - 12, "left", "bottom", COLORS.text);
    for (var i = 0; i < BATCH; i += 1) {
      for (var k = 0; k < OUT; k += 1) {
        var intensity = maxErr > 0 ? Math.sqrt(result.stats.absErr[i][k] / maxErr) : 0;
        var red = Math.round(255 - 65 * (1 - intensity));
        var green = Math.round(245 - 215 * intensity);
        var blue = Math.round(245 - 195 * intensity);
        ctx.fillStyle = "rgb(" + red + "," + green + "," + blue + ")";
        ctx.fillRect(left + k * cellW, heatTop + i * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, heatTop, heatW, heatH);
    drawLabel(ctx, "batch examples", left - 8, heatTop + heatH / 2, "right", "middle", COLORS.muted);
    drawLabel(ctx, "output dimensions", left + heatW / 2, heatTop + heatH + 22, "center", "top", COLORS.muted);

    var footerTop = heatTop + heatH + (compact ? 56 : 58);
    var compressionW = plotW * Math.min(result.compression / 8, 1);
    var errorW = plotW * Math.min(result.stats.relRmse / 0.5, 1);
    drawLabel(ctx, "Weight compression vs fp16", left, footerTop, "left", "middle", COLORS.muted);
    ctx.fillStyle = "#edf2f7";
    ctx.fillRect(left, footerTop + 16, plotW, 18);
    ctx.fillStyle = COLORS.bar;
    ctx.fillRect(left, footerTop + 16, compressionW, 18);
    drawLabel(ctx, formatNumber(result.compression, 2) + "x", width - right, footerTop + 25, "right", "middle", COLORS.text);

    drawLabel(ctx, "Relative output RMSE", left, footerTop + 58, "left", "middle", COLORS.muted);
    ctx.fillStyle = "#fff1f2";
    ctx.fillRect(left, footerTop + 74, plotW, 18);
    ctx.fillStyle = COLORS.error;
    ctx.fillRect(left, footerTop + 74, errorW, 18);
    drawLabel(ctx, formatPercent(result.stats.relRmse), width - right, footerTop + 83, "right", "middle", COLORS.text);
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });

    var outputs = {
      bits: String(params.bits),
      groupSize: String(params.groupSize),
      outliers: params.outliers + "%",
      outlierScale: params.outlierScale + "x",
      smooth: params.smooth + "%",
      protected: params.protected + "%"
    };
    Object.keys(outputs).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = outputs[key];
    });

    var result = evaluate(params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Relative output RMSE", formatPercent(result.stats.relRmse)),
        metric("Output cosine", formatNumber(result.stats.cosine, 4)),
        metric("Activation scale ratio", formatNumber(result.scaleRatio, 1) + "x"),
        metric("Quiet-code usage", formatPercent(result.quietLevelShare)),
        metric("Protected channels", String(result.protectedList.length)),
        metric("Weight compression", formatNumber(result.compression, 2) + "x")
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
    window.addEventListener("resize", redraw);
    redraw();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-quant-lab]").forEach(init);
  });
}());
