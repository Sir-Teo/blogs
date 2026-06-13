(function () {
  var COLORS = {
    good: "#0f766e",
    recall: "#2563eb",
    warn: "#b45309",
    bad: "#be123c",
    purple: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5"
  };

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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dot(a, b) {
    var total = 0;
    for (var i = 0; i < a.length; i += 1) total += a[i] * b[i];
    return total;
  }

  function norm(a) {
    return Math.sqrt(Math.max(1e-12, dot(a, a)));
  }

  function unit(vector) {
    var scale = norm(vector);
    return vector.map(function (value) { return value / scale; });
  }

  function randomUnit(rand, dims) {
    var vector = [];
    for (var i = 0; i < dims; i += 1) vector.push(normal(rand));
    return unit(vector);
  }

  function mixVectors(a, b, t) {
    var out = [];
    for (var i = 0; i < a.length; i += 1) out.push((1 - t) * a[i] + t * b[i]);
    return unit(out);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="superposition-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function makeDictionary(params) {
    var rand = rng(20260613 + params.features * 13 + params.dims * 17 + params.cluster * 19);
    var dims = params.dims;
    var features = params.features;
    var cluster = params.cluster / 100;
    var groups = Math.max(2, Math.min(dims + 1, Math.round(Math.sqrt(features))));
    var centers = [];
    var dictionary = [];

    for (var g = 0; g < groups; g += 1) centers.push(randomUnit(rand, dims));

    for (var i = 0; i < features; i += 1) {
      var base;
      if (dims === 2) {
        var angle = 2 * Math.PI * i / features;
        var groupAngle = 2 * Math.PI * (i % groups) / groups;
        var mixedAngle = (1 - cluster) * angle + cluster * groupAngle;
        mixedAngle += (0.10 + 0.26 * cluster) * normal(rand) / Math.sqrt(features);
        base = [Math.cos(mixedAngle), Math.sin(mixedAngle)];
      } else {
        var broad = randomUnit(rand, dims);
        var center = centers[i % groups];
        base = mixVectors(broad, center, 0.18 + 0.74 * cluster);
      }
      dictionary.push(unit(base));
    }

    return dictionary;
  }

  function gramStats(dictionary) {
    var values = [];
    var maxCoherence = 0;
    var meanCoherence = 0;
    var count = 0;

    for (var i = 0; i < dictionary.length; i += 1) {
      for (var j = i + 1; j < dictionary.length; j += 1) {
        var value = Math.abs(dot(dictionary[i], dictionary[j]));
        values.push(value);
        maxCoherence = Math.max(maxCoherence, value);
        meanCoherence += value;
        count += 1;
      }
    }

    values.sort(function (a, b) { return a - b; });
    return {
      maxCoherence: maxCoherence,
      meanCoherence: count ? meanCoherence / count : 0,
      p90Coherence: values.length ? values[Math.floor(0.9 * (values.length - 1))] : 0,
      values: values
    };
  }

  function topPositiveIndices(scores, k, threshold) {
    var order = scores.map(function (score, index) {
      return { score: score, index: index };
    });
    order.sort(function (a, b) { return b.score - a.score; });

    var selected = [];
    for (var i = 0; i < order.length && selected.length < k; i += 1) {
      if (order[i].score > threshold) selected.push(order[i]);
    }
    return selected;
  }

  function reconstruct(dictionary, selected, x) {
    var dims = dictionary[0].length;
    var xhat = [];
    var residual = [];
    for (var d = 0; d < dims; d += 1) {
      xhat.push(0);
      residual.push(x[d]);
    }

    selected.forEach(function (item) {
      var vector = dictionary[item.index];
      var coeff = Math.max(0, dot(vector, residual));
      for (var d = 0; d < dims; d += 1) xhat[d] += coeff * vector[d];
      for (var r = 0; r < dims; r += 1) residual[r] -= coeff * vector[r];
    });
    return xhat;
  }

  function simulateWithDictionary(params, dictionary, overrideThreshold) {
    var rand = rng(
      909090
      + params.features * 23
      + params.dims * 29
      + params.density * 31
      + params.noise * 37
      + params.topK * 41
    );
    var threshold = typeof overrideThreshold === "number" ? overrideThreshold : params.threshold / 100;
    var density = params.density / 100;
    var noise = params.noise / 100;
    var samples = 700;
    var dims = params.dims;
    var features = params.features;
    var featureStats = [];
    var totals = {
      falseNegative: 0,
      falsePositive: 0,
      predicted: 0,
      trueActive: 0,
      truePositive: 0
    };
    var squaredError = 0;
    var squaredSignal = 0;
    var activePerSample = 0;
    var spillover = 0;
    var spilloverCount = 0;

    for (var f = 0; f < features; f += 1) {
      featureStats.push({ active: 0, predicted: 0, truePositive: 0 });
    }

    for (var sample = 0; sample < samples; sample += 1) {
      var z = [];
      var x = [];
      var active = 0;
      for (var d = 0; d < dims; d += 1) x.push(noise * 0.18 * normal(rand));

      for (var i = 0; i < features; i += 1) {
        var coeff = rand() < density ? 0.35 + Math.pow(rand(), 0.55) : 0;
        z.push(coeff);
        if (coeff > 0) {
          active += 1;
          featureStats[i].active += 1;
          for (var dim = 0; dim < dims; dim += 1) x[dim] += coeff * dictionary[i][dim];
        }
      }

      activePerSample += active;
      totals.trueActive += active;

      var scores = dictionary.map(function (vector) { return dot(vector, x); });
      var selected = topPositiveIndices(scores, params.topK, threshold);
      var selectedSet = {};
      selected.forEach(function (item) {
        selectedSet[item.index] = true;
        featureStats[item.index].predicted += 1;
      });

      for (var j = 0; j < features; j += 1) {
        var isActive = z[j] > 0;
        var isPredicted = Boolean(selectedSet[j]);
        if (isActive && isPredicted) {
          totals.truePositive += 1;
          featureStats[j].truePositive += 1;
        } else if (isActive && !isPredicted) {
          totals.falseNegative += 1;
        } else if (!isActive && isPredicted) {
          totals.falsePositive += 1;
        }
        if (isPredicted) totals.predicted += 1;
      }

      for (var a = 0; a < features; a += 1) {
        if (z[a] <= 0) continue;
        for (var b = 0; b < features; b += 1) {
          if (a === b) continue;
          spillover += Math.max(0, z[a] * dot(dictionary[a], dictionary[b]));
          spilloverCount += 1;
        }
      }

      var xhat = reconstruct(dictionary, selected, x);
      for (var e = 0; e < dims; e += 1) {
        squaredError += Math.pow(x[e] - xhat[e], 2);
        squaredSignal += Math.pow(x[e], 2);
      }
    }

    var precision = totals.predicted ? totals.truePositive / totals.predicted : 1;
    var recall = totals.trueActive ? totals.truePositive / totals.trueActive : 1;
    var f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    var deadLatents = featureStats.filter(function (stat) { return stat.predicted === 0; }).length;
    var recalls = featureStats.map(function (stat) {
      return stat.active ? stat.truePositive / stat.active : 1;
    });

    return {
      activePerSample: activePerSample / samples,
      deadLatents: deadLatents,
      dictionary: dictionary,
      f1: f1,
      featureStats: featureStats,
      precision: precision,
      recall: recall,
      recalls: recalls,
      reconstructionError: squaredSignal ? squaredError / squaredSignal : 0,
      spillover: spilloverCount ? spillover / spilloverCount : 0,
      threshold: threshold,
      totals: totals
    };
  }

  function runSimulation(params) {
    var dictionary = makeDictionary(params);
    var stats = gramStats(dictionary);
    var result = simulateWithDictionary(params, dictionary);
    result.gram = stats;
    return result;
  }

  function thresholdSweep(params) {
    var dictionary = makeDictionary(params);
    var points = [];
    for (var t = 0; t <= 110; t += 10) {
      var result = simulateWithDictionary(params, dictionary, t / 100);
      points.push({
        f1: result.f1,
        precision: result.precision,
        recall: result.recall,
        reconstructionError: result.reconstructionError,
        threshold: t / 100
      });
    }
    return points;
  }

  function drawLabel(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function mixChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function mixColor(from, to, t) {
    var a = hexToRgb(from);
    var b = hexToRgb(to);
    return "rgb(" + mixChannel(a.r, b.r, t) + "," + mixChannel(a.g, b.g, t) + "," + mixChannel(a.b, b.b, t) + ")";
  }

  function drawDictionary(ctx, result, left, top, width, height) {
    var cx = left + width / 2;
    var cy = top + height / 2 + 8;
    var radius = Math.min(width, height) * 0.38;

    drawLabel(ctx, "Feature directions", left, top - 14, "left", "bottom", COLORS.text);
    drawLabel(ctx, "2-D projection of dictionary columns", left + width, top - 14, "right", "bottom", COLORS.muted);

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();

    result.dictionary.forEach(function (vector, index) {
      var x = vector[0] || 0;
      var y = vector[1] || 0;
      var length = Math.sqrt(x * x + y * y) || 1e-9;
      var recall = result.recalls[index];
      var color = mixColor(COLORS.bad, COLORS.good, clamp(recall, 0, 1));

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * x / length, cy - radius * y / length);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx + radius * x / length, cy - radius * y / length, 2.7, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.lineWidth = 1;
    drawLabel(ctx, "green = recovered often", left, top + height - 4, "left", "bottom", COLORS.muted);
  }

  function drawCoherence(ctx, result, left, top, width, height) {
    var n = result.dictionary.length;
    var cell = Math.min(width, height) / n;
    var matrixSize = cell * n;
    var x0 = left + (width - matrixSize) / 2;
    var y0 = top + (height - matrixSize) / 2 + 8;

    drawLabel(ctx, "Interference matrix", left, top - 14, "left", "bottom", COLORS.text);
    drawLabel(ctx, "|cosine|", left + width, top - 14, "right", "bottom", COLORS.muted);

    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j < n; j += 1) {
        var value = i === j ? 1 : Math.abs(dot(result.dictionary[i], result.dictionary[j]));
        ctx.fillStyle = i === j ? "#172026" : mixColor("#f8fafc", COLORS.purple, Math.pow(value, 0.8));
        ctx.fillRect(x0 + j * cell, y0 + i * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x0, y0, matrixSize, matrixSize);
  }

  function drawBars(ctx, result, left, top, width, height) {
    var bars = [
      { key: "precision", label: "precision", value: result.precision, color: COLORS.good },
      { key: "recall", label: "recall", value: result.recall, color: COLORS.recall },
      { key: "f1", label: "F1", value: result.f1, color: COLORS.warn },
      { key: "loss", label: "1 - loss", value: clamp(1 - result.reconstructionError, 0, 1), color: COLORS.purple }
    ];
    var gap = 12;
    var barHeight = (height - gap * (bars.length - 1)) / bars.length;

    drawLabel(ctx, "Recovery ledger", left, top - 14, "left", "bottom", COLORS.text);

    bars.forEach(function (bar, index) {
      var y = top + index * (barHeight + gap);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, y, width, barHeight);
      ctx.fillStyle = bar.color;
      ctx.fillRect(left, y, width * clamp(bar.value, 0, 1), barHeight);
      drawLabel(ctx, bar.label, left + 8, y + barHeight / 2, "left", "middle", "#ffffff");
      drawLabel(ctx, formatPercent(bar.value, 0), left + width - 8, y + barHeight / 2, "right", "middle", bar.value > 0.32 ? "#ffffff" : COLORS.text);
    });
  }

  function drawSweep(ctx, points, params, left, top, width, height) {
    function xScale(value) {
      return left + value / 1.1 * width;
    }
    function yScale(value) {
      return top + height - clamp(value, 0, 1) * height;
    }

    drawLabel(ctx, "Threshold sweep", left, top - 14, "left", "bottom", COLORS.text);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, width, height);

    [0, 0.5, 1].forEach(function (tick) {
      var y = yScale(tick);
      ctx.strokeStyle = COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      drawLabel(ctx, formatPercent(tick), left - 8, y, "right", "middle", COLORS.muted);
    });

    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach(function (point, index) {
        var x = xScale(point.threshold);
        var y = yScale(point[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    line("precision", COLORS.good);
    line("recall", COLORS.recall);
    line("f1", COLORS.warn);

    var current = params.threshold / 100;
    var x = xScale(current);
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + height);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLabel(ctx, "threshold", left + width / 2, top + height + 24, "center", "top", COLORS.muted);
    drawLabel(ctx, "precision", left + width - 82, top + 18, "left", "middle", COLORS.good);
    drawLabel(ctx, "recall", left + width - 82, top + 36, "left", "middle", COLORS.recall);
    drawLabel(ctx, "F1", left + width - 82, top + 54, "left", "middle", COLORS.warn);
  }

  function drawUsage(ctx, result, left, top, width, height) {
    var stats = result.featureStats;
    var maxPredicted = stats.reduce(function (best, stat) {
      return Math.max(best, stat.predicted);
    }, 1);
    var gap = 2;
    var barWidth = Math.max(2, (width - gap * (stats.length - 1)) / stats.length);

    drawLabel(ctx, "Latent usage", left, top - 14, "left", "bottom", COLORS.text);
    drawLabel(ctx, result.deadLatents + " dead", left + width, top - 14, "right", "bottom", COLORS.muted);

    stats.forEach(function (stat, index) {
      var h = stat.predicted / maxPredicted * height;
      var recall = stat.active ? stat.truePositive / stat.active : 1;
      ctx.fillStyle = stat.predicted ? mixColor(COLORS.bad, COLORS.good, recall) : COLORS.rule;
      ctx.fillRect(left + index * (barWidth + gap), top + height - h, barWidth, h);
    });

    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, width, height);
  }

  function drawChart(canvas, result, points, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 790 : 640;
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

    var left = compact ? 54 : 58;
    var right = compact ? 18 : 24;
    var plotW = width - left - right;

    if (compact) {
      drawDictionary(ctx, result, left, 44, plotW, 190);
      drawCoherence(ctx, result, left, 290, plotW, 210);
      drawBars(ctx, result, left, 554, plotW, 94);
      drawSweep(ctx, points, params, left, 700, plotW, 70);
    } else {
      drawDictionary(ctx, result, left, 44, plotW * 0.48, 224);
      drawCoherence(ctx, result, left + plotW * 0.55, 44, plotW * 0.45, 224);
      drawBars(ctx, result, left, 330, plotW * 0.36, 130);
      drawUsage(ctx, result, left + plotW * 0.44, 330, plotW * 0.56, 130);
      drawSweep(ctx, points, params, left, 530, plotW, 82);
    }
  }

  function parseParams(root) {
    var params = {
      cluster: 18,
      density: 7,
      dims: 8,
      features: 18,
      noise: 6,
      threshold: 28,
      topK: 4
    };

    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      params[key] = Number(input.value);
    });

    params.topK = Math.min(params.topK, params.features);
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "density" || key === "noise" || key === "cluster") output.textContent = params[key] + "%";
      else if (key === "threshold") output.textContent = formatNumber(params[key] / 100, 2);
      else output.textContent = String(params[key]);
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = runSimulation(params);
    var points = thresholdSweep(params);
    var metrics = root.querySelector("[data-metrics]");
    var canvas = root.querySelector("[data-canvas]");

    updateOutputs(root, params);
    metrics.innerHTML = [
      metric("features / dim", formatNumber(params.features / params.dims, 1)),
      metric("F1 recovery", formatPercent(result.f1, 1)),
      metric("precision", formatPercent(result.precision, 1)),
      metric("recall", formatPercent(result.recall, 1)),
      metric("max overlap", formatPercent(result.gram.maxCoherence, 0)),
      metric("recon loss", formatPercent(result.reconstructionError, 1))
    ].join("");
    drawChart(canvas, result, points, params);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-superposition-lab]"));
    labs.forEach(function (root) {
      var schedule = null;
      function requestRender() {
        if (schedule) window.cancelAnimationFrame(schedule);
        schedule = window.requestAnimationFrame(function () {
          schedule = null;
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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      gramStats: gramStats,
      makeDictionary: makeDictionary,
      runSimulation: runSimulation,
      thresholdSweep: thresholdSweep
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
