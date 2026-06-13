(function () {
  var COLORS = {
    bars: "#0f766e",
    expected: "#b45309",
    contrast: "#2563eb",
    hub: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5"
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

  function formatPercent(value) {
    return Math.round(value * 100) + "%";
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function makeVectors(count, dims, params, offset, kind) {
    var rand = rng(92821 + count * 17 + dims * 31 + params.cone * 43 + offset);
    var cone = params.cone / 100;
    var genericRate = kind === "item" ? params.generic / 100 : 0;
    var vectors = [];

    for (var i = 0; i < count; i += 1) {
      var vector = Array(dims);
      var generic = rand() < genericRate;
      var residualScale = generic ? 0.22 + 0.18 * rand() : 1;
      vector[0] = cone + residualScale * normal(rand);
      for (var d = 1; d < dims; d += 1) vector[d] = residualScale * normal(rand);
      vectors.push(vector);
    }
    return vectors;
  }

  function meanVector(vectors, dims) {
    var mean = Array(dims).fill(0);
    vectors.forEach(function (vector) {
      for (var d = 0; d < dims; d += 1) mean[d] += vector[d];
    });
    for (var i = 0; i < dims; i += 1) mean[i] /= vectors.length;
    return mean;
  }

  function normalize(vector) {
    var norm = Math.sqrt(vector.reduce(function (sum, value) { return sum + value * value; }, 0));
    if (norm === 0) return vector.map(function () { return 0; });
    return vector.map(function (value) { return value / norm; });
  }

  function postprocess(vectors, mean, alpha) {
    return vectors.map(function (vector) {
      var out = Array(vector.length);
      for (var d = 0; d < vector.length; d += 1) out[d] = vector[d] - alpha * mean[d];
      return normalize(out);
    });
  }

  function dot(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += a[i] * b[i];
    return sum;
  }

  function gini(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var total = sorted.reduce(function (sum, value) { return sum + value; }, 0);
    if (total === 0) return 0;
    var weighted = 0;
    for (var i = 0; i < sorted.length; i += 1) weighted += (i + 1) * sorted[i];
    return (2 * weighted) / (sorted.length * total) - (sorted.length + 1) / sorted.length;
  }

  function evaluate(params) {
    var items = makeVectors(params.items, params.dims, params, 7, "item");
    var queries = makeVectors(params.queries, params.dims, params, 13, "query");
    var mean = meanVector(items.concat(queries), params.dims);
    var alpha = params.decone / 100;
    var itemVectors = postprocess(items, mean, alpha);
    var queryVectors = postprocess(queries, mean, alpha);
    var counts = Array(params.items).fill(0);
    var nearestSum = 0;
    var farthestSum = 0;
    var medianSum = 0;
    var neighborSlots = params.queries * params.neighbors;

    queryVectors.forEach(function (query) {
      var sims = itemVectors.map(function (item, index) {
        return { index: index, score: dot(query, item) };
      });
      sims.sort(function (a, b) { return b.score - a.score; });
      for (var k = 0; k < params.neighbors; k += 1) counts[sims[k].index] += 1;
      nearestSum += sims[0].score;
      medianSum += sims[Math.floor(sims.length / 2)].score;
      farthestSum += sims[sims.length - 1].score;
    });

    var sortedCounts = counts.slice().sort(function (a, b) { return b - a; });
    var maxCount = sortedCounts[0];
    var topFive = sortedCounts.slice(0, 5).reduce(function (sum, value) { return sum + value; }, 0);
    var seen = counts.filter(function (value) { return value > 0; }).length;
    var expected = neighborSlots / params.items;
    var concentration = (nearestSum / params.queries) - (medianSum / params.queries);
    var farContrast = (nearestSum / params.queries) - (farthestSum / params.queries);

    return {
      concentration: concentration,
      counts: counts,
      expected: expected,
      farContrast: farContrast,
      gini: gini(counts),
      maxCount: maxCount,
      seen: seen,
      topFiveShare: topFive / neighborSlots,
      topShare: maxCount / neighborSlots
    };
  }

  function metric(label, value) {
    return '<div class="hubness-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawChart(canvas, result, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var height = 460;
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

    var compact = width < 560;
    var left = compact ? 48 : 58;
    var right = compact ? 24 : 34;
    var top = 36;
    var barHeight = compact ? 210 : 230;
    var bottom = top + barHeight;
    var plotWidth = width - left - right;
    var sorted = result.counts.slice().sort(function (a, b) { return b - a; });
    var shown = Math.min(sorted.length, compact ? 80 : 130);
    var maxCount = Math.max(1, sorted[0]);
    var barWidth = plotWidth / shown;

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("k-occurrence counts, sorted by popularity", left, top - 10);

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(width - right, bottom);
    ctx.stroke();

    [0, 0.5, 1].forEach(function (tick) {
      var value = maxCount * tick;
      var y = bottom - tick * barHeight;
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(value)), left - 8, y);
    });

    for (var i = 0; i < shown; i += 1) {
      var h = sorted[i] / maxCount * barHeight;
      ctx.fillStyle = i === 0 ? COLORS.hub : COLORS.bars;
      ctx.fillRect(left + i * barWidth, bottom - h, Math.max(1, barWidth - 1), h);
    }

    var expectedY = bottom - result.expected / maxCount * barHeight;
    ctx.strokeStyle = COLORS.expected;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(left, expectedY);
    ctx.lineTo(width - right, expectedY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.expected;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("uniform expectation", left + 6, expectedY - 4);

    var secondTop = bottom + 68;
    var secondHeight = 110;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, secondTop);
    ctx.lineTo(left, secondTop + secondHeight);
    ctx.lineTo(width - right, secondTop + secondHeight);
    ctx.stroke();

    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Similarity contrast", left, secondTop - 10);

    var contrastMax = Math.max(0.02, result.farContrast * 1.1);
    var bars = [
      { label: "nearest - median", value: result.concentration, color: COLORS.contrast },
      { label: "nearest - farthest", value: result.farContrast, color: COLORS.hub }
    ];
    bars.forEach(function (bar, index) {
      var y = secondTop + 20 + index * 42;
      var w = Math.min(plotWidth - 160, (plotWidth - 160) * bar.value / contrastMax);
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(bar.label, left + 116, y + 10);
      ctx.fillStyle = "#edf2f7";
      ctx.fillRect(left + 128, y, plotWidth - 160, 22);
      ctx.fillStyle = bar.color;
      ctx.fillRect(left + 128, y, w, 22);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.fillText(formatNumber(bar.value), left + 136 + w, y + 11);
    });

    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("showing top " + shown + " of " + params.items + " database vectors", left + plotWidth / 2, bottom + 16);
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });

    var values = {
      items: String(params.items),
      queries: String(params.queries),
      dims: String(params.dims),
      neighbors: String(params.neighbors),
      cone: params.cone + "%",
      generic: params.generic + "%",
      decone: params.decone + "%"
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var result = evaluate(params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Top hub share", formatPercent(result.topShare)),
        metric("Top 5 share", formatPercent(result.topFiveShare)),
        metric("Count gini", result.gini.toFixed(2)),
        metric("Vectors ever retrieved", formatPercent(result.seen / params.items)),
        metric("Top hub count", String(result.maxCount)),
        metric("Nearest/median gap", formatNumber(result.concentration))
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
    window.addEventListener("resize", redraw);
    redraw();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-hubness-lab]").forEach(init);
  });
}());
