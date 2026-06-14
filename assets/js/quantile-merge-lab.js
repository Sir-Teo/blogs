(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    trueQ: "#0f766e",
    naive: "#be123c",
    weighted: "#b45309",
    sketch: "#2563eb",
    traffic: "#7c3aed",
    gray: "#64748b"
  };

  var DEFAULTS = {
    shards: 6,
    samples: 6000,
    imbalance: 72,
    tail: 55,
    percentile: 95,
    budget: 64,
    seed: 29
  };

  var BUDGET_GRID = [8, 12, 16, 24, 32, 48, 64, 96, 128, 192];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32((index + 1) | 0, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 1, seed));
    var u2 = uniform(index * 2 + 2, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 1 : digits;
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="quantile-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function cleanParams(raw) {
    raw = raw || {};
    var imbalanceRaw = raw.imbalance == null ? DEFAULTS.imbalance : Number(raw.imbalance);
    var tailRaw = raw.tail == null ? DEFAULTS.tail : Number(raw.tail);
    if (imbalanceRaw <= 1) imbalanceRaw *= 100;
    if (tailRaw <= 1) tailRaw *= 100;
    return {
      budget: clamp(Math.round(raw.budget == null ? DEFAULTS.budget : raw.budget), 8, 192),
      imbalance: clamp(imbalanceRaw, 0, 95) / 100,
      percentile: clamp(raw.percentile == null ? DEFAULTS.percentile : Number(raw.percentile), 50, 99),
      samples: clamp(Math.round(raw.samples == null ? DEFAULTS.samples : raw.samples), 1000, 16000),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 99),
      shards: clamp(Math.round(raw.shards == null ? DEFAULTS.shards : raw.shards), 2, 12),
      tail: clamp(tailRaw, 0, 100) / 100
    };
  }

  function readState(container, previous) {
    var raw = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var display = {
      budget: String(params.budget),
      imbalance: Math.round(params.imbalance * 100) + "%",
      percentile: "p" + params.percentile,
      samples: formatNumber(params.samples, 0),
      seed: String(params.seed),
      shards: String(params.shards),
      tail: Math.round(params.tail * 100) + "%"
    };
    Object.keys(display).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = display[key];
      });
    });
  }

  function shardWeights(params) {
    var weights = [];
    var decay = 0.25 + 3.5 * params.imbalance;
    var sum = 0;
    for (var i = 0; i < params.shards; i += 1) {
      var w = Math.exp(-decay * i / Math.max(1, params.shards - 1));
      w *= 0.88 + 0.24 * uniform(i * 13 + 5, params.seed);
      weights.push(w);
      sum += w;
    }
    return weights.map(function (w) { return w / sum; });
  }

  function shardCounts(params, weights) {
    var counts = weights.map(function (w) {
      return Math.max(12, Math.floor(w * params.samples));
    });
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    var i = 0;
    while (total < params.samples) {
      counts[i % counts.length] += 1;
      total += 1;
      i += 1;
    }
    while (total > params.samples) {
      var j = counts.length - 1 - (i % counts.length);
      if (counts[j] > 12) {
        counts[j] -= 1;
        total -= 1;
      }
      i += 1;
    }
    return counts;
  }

  function latencyValue(shard, index, params) {
    var hot = shard === params.shards - 1 ? 1 : 0;
    var warm = shard / Math.max(1, params.shards - 1);
    var base = 18 + 22 * warm + 8 * Math.sin((shard + 1) * 0.9);
    var sigma = 0.22 + 0.42 * params.tail + 0.12 * warm;
    var z = normal(index * 19 + shard * 10007, params.seed ^ 0x51f15e);
    var value = base * Math.exp(sigma * z - 0.5 * sigma * sigma);
    var burstProbability = (0.004 + 0.06 * params.tail) * (hot ? 5.5 : 0.7 + 1.5 * warm);
    if (uniform(index * 97 + shard * 31, params.seed ^ 0xbadc0de) < burstProbability) {
      var burst = 3.5 + 11 * params.tail + 4 * hot;
      value += base * burst * (0.45 + uniform(index * 53 + shard * 11, params.seed));
    }
    return value;
  }

  function makeData(params) {
    var weights = shardWeights(params);
    var counts = shardCounts(params, weights);
    var shards = [];
    var all = [];
    for (var s = 0; s < params.shards; s += 1) {
      var values = [];
      for (var i = 0; i < counts[s]; i += 1) values.push(latencyValue(s, i, params));
      values.sort(function (a, b) { return a - b; });
      shards.push({ count: counts[s], index: s, values: values, weight: counts[s] / params.samples });
      all = all.concat(values);
    }
    all.sort(function (a, b) { return a - b; });
    return { all: all, shards: shards };
  }

  function quantileSorted(values, p) {
    if (!values.length) return NaN;
    var rank = Math.ceil(p * values.length) - 1;
    return values[clamp(rank, 0, values.length - 1)];
  }

  function rankOf(values, x) {
    var lo = 0;
    var hi = values.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (values[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function compressWeighted(items, budget) {
    if (!items.length) return [];
    items = items.slice().sort(function (a, b) { return a.value - b.value; });
    var total = items.reduce(function (sum, item) { return sum + item.weight; }, 0);
    if (items.length <= budget) return items;
    var out = [];
    var target = total / budget;
    var bucketWeight = 0;
    var bucketSum = 0;
    for (var i = 0; i < items.length; i += 1) {
      bucketWeight += items[i].weight;
      bucketSum += items[i].value * items[i].weight;
      if (bucketWeight >= target && out.length < budget - 1) {
        out.push({ value: bucketSum / bucketWeight, weight: bucketWeight });
        bucketWeight = 0;
        bucketSum = 0;
      }
    }
    if (bucketWeight > 0) out.push({ value: bucketSum / bucketWeight, weight: bucketWeight });
    return out;
  }

  function buildSketchFromSorted(values, budget) {
    var n = values.length;
    if (!n) return [];
    var items = [];
    var step = n / budget;
    var start = 0;
    for (var b = 0; b < budget && start < n; b += 1) {
      var end = Math.min(n, Math.round((b + 1) * step));
      if (end <= start) end = start + 1;
      var mid = Math.min(n - 1, Math.floor((start + end - 1) / 2));
      items.push({ value: values[mid], weight: end - start });
      start = end;
    }
    return compressWeighted(items, budget);
  }

  function mergeSketches(sketches, budget) {
    var items = [];
    sketches.forEach(function (sketch) {
      items = items.concat(sketch);
    });
    return compressWeighted(items, budget);
  }

  function sketchQuantile(sketch, p) {
    if (!sketch.length) return NaN;
    var total = sketch.reduce(function (sum, item) { return sum + item.weight; }, 0);
    var target = p * total;
    var running = 0;
    for (var i = 0; i < sketch.length; i += 1) {
      running += sketch[i].weight;
      if (running >= target) return sketch[i].value;
    }
    return sketch[sketch.length - 1].value;
  }

  function cdfPoints(values, maxPoints) {
    var out = [];
    var n = values.length;
    var count = Math.min(maxPoints, n);
    for (var i = 0; i < count; i += 1) {
      var idx = Math.min(n - 1, Math.round(i * (n - 1) / Math.max(1, count - 1)));
      out.push({ p: (idx + 1) / n, value: values[idx] });
    }
    return out;
  }

  function budgetSweep(data, params, p) {
    return BUDGET_GRID.filter(function (b) { return b <= params.samples / 4; }).map(function (budget) {
      var shardSketches = data.shards.map(function (shard) {
        return buildSketchFromSorted(shard.values, Math.max(4, Math.min(budget, shard.values.length)));
      });
      var merged = mergeSketches(shardSketches, budget);
      var q = sketchQuantile(merged, p);
      return {
        budget: budget,
        rankError: rankOf(data.all, q) / data.all.length - p,
        value: q
      };
    });
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var p = params.percentile / 100;
    var data = makeData(params);
    var shardRows = data.shards.map(function (shard) {
      return {
        count: shard.count,
        index: shard.index,
        pValue: quantileSorted(shard.values, p),
        weight: shard.weight
      };
    });
    var exact = quantileSorted(data.all, p);
    var naive = shardRows.reduce(function (sum, row) { return sum + row.pValue; }, 0) / shardRows.length;
    var weighted = shardRows.reduce(function (sum, row) { return sum + row.pValue * row.weight; }, 0);
    var shardSketches = data.shards.map(function (shard) {
      return buildSketchFromSorted(shard.values, Math.max(4, Math.min(params.budget, shard.values.length)));
    });
    var mergedSketch = mergeSketches(shardSketches, params.budget);
    var sketch = sketchQuantile(mergedSketch, p);
    var sketchRank = rankOf(data.all, sketch) / data.all.length;
    return {
      cdf: cdfPoints(data.all, 180),
      exact: exact,
      naive: naive,
      params: params,
      p: p,
      shardRows: shardRows,
      sketch: sketch,
      sketchRankError: sketchRank - p,
      sketchSize: mergedSketch.length,
      sweep: budgetSweep(data, params, p),
      total: data.all.length,
      weighted: weighted
    };
  }

  function updateMetrics(node, result) {
    node.innerHTML = [
      metric("True global", formatNumber(result.exact, 1) + " ms"),
      metric("Avg shard p", formatNumber(result.naive, 1) + " ms"),
      metric("Weighted avg p", formatNumber(result.weighted, 1) + " ms"),
      metric("Merged sketch", formatNumber(result.sketch, 1) + " ms"),
      metric("Sketch rank error", (100 * result.sketchRankError).toFixed(2) + " pts"),
      metric("Sketch size", result.sketchSize + " centroids")
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.floor(rect.width || 900));
    var height = width < 700 ? 980 : 680;
    var ratio = root.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function label(ctx, text, x, y, color, align, size) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, heading) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    label(ctx, heading, x + 12, y + 22, COLORS.text, "left", 13);
  }

  function maxValue(result) {
    var values = [result.exact, result.naive, result.weighted, result.sketch];
    result.shardRows.forEach(function (row) { values.push(row.pValue); });
    return Math.max.apply(null, values) * 1.12;
  }

  function drawShardPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Shard traffic and local percentiles");
    var pad = { l: 38, r: 16, t: 44, b: 34 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var maxP = maxValue(result);
    var maxCount = Math.max.apply(null, result.shardRows.map(function (row) { return row.count; }));
    var bw = pw / result.shardRows.length * 0.62;
    result.shardRows.forEach(function (row, i) {
      var cx = left + (i + 0.5) * pw / result.shardRows.length;
      var th = (row.count / maxCount) * ph * 0.9;
      ctx.fillStyle = COLORS.traffic;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(cx - bw / 2, top + ph - th, bw, th);
      ctx.globalAlpha = 1;
      var py = top + ph - (row.pValue / maxP) * ph;
      ctx.fillStyle = COLORS.naive;
      ctx.beginPath();
      ctx.arc(cx, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, String(i + 1), cx, y + h - 12, COLORS.muted, "center", 11);
    });
    var exactY = top + ph - (result.exact / maxP) * ph;
    line(ctx, left, exactY, left + pw, exactY, COLORS.trueQ, 1.5);
    label(ctx, "global p" + result.params.percentile, left + 6, exactY - 5, COLORS.trueQ, "left", 11);
    label(ctx, "purple bars traffic; red dots local p", left + 8, top + 12, COLORS.muted, "left", 11);
  }

  function drawCdfPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "The global percentile is a rank, not an average");
    var pad = { l: 48, r: 16, t: 44, b: 34 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var maxX = maxValue(result);
    function px(v) { return left + clamp(v / maxX, 0, 1) * pw; }
    function py(p) { return top + ph - p * ph; }
    line(ctx, left, top + ph, left + pw, top + ph, COLORS.rule, 1);
    line(ctx, left, top, left, top + ph, COLORS.rule, 1);
    ctx.strokeStyle = COLORS.gray;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.cdf.forEach(function (point, i) {
      var xx = px(point.value);
      var yy = py(point.p);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    [
      { color: COLORS.trueQ, label: "true", value: result.exact },
      { color: COLORS.naive, label: "avg", value: result.naive },
      { color: COLORS.weighted, label: "w avg", value: result.weighted },
      { color: COLORS.sketch, label: "sketch", value: result.sketch }
    ].forEach(function (item, i) {
      var xx = px(item.value);
      line(ctx, xx, top, xx, top + ph, item.color, 1.4);
      label(ctx, item.label, xx + 3, top + 14 + i * 13, item.color, "left", 11);
    });
    line(ctx, left, py(result.p), left + pw, py(result.p), COLORS.trueQ, 1);
    label(ctx, "rank p" + result.params.percentile, left + 8, py(result.p) - 5, COLORS.trueQ, "left", 11);
  }

  function drawEstimatorPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Estimator ledger");
    var pad = { l: 42, r: 18, t: 48, b: 42 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var rows = [
      { color: COLORS.trueQ, label: "true", value: result.exact },
      { color: COLORS.naive, label: "avg", value: result.naive },
      { color: COLORS.weighted, label: "w avg", value: result.weighted },
      { color: COLORS.sketch, label: "sketch", value: result.sketch }
    ];
    var maxY = Math.max.apply(null, rows.map(function (row) { return row.value; })) * 1.12;
    line(ctx, left, top + ph, left + pw, top + ph, COLORS.rule, 1);
    rows.forEach(function (row, i) {
      var bw = Math.min(52, pw / (rows.length * 1.8));
      var xx = left + (i + 0.5) * pw / rows.length - bw / 2;
      var bh = row.value / maxY * ph;
      var yy = top + ph - bh;
      ctx.fillStyle = row.color;
      ctx.fillRect(xx, yy, bw, bh);
      label(ctx, formatNumber(row.value, 1), xx + bw / 2, yy - 6, COLORS.text, "center", 11);
      label(ctx, row.label, xx + bw / 2, y + h - 14, COLORS.muted, "center", 11);
    });
  }

  function drawBudgetPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Sketch budget controls rank error");
    var pad = { l: 48, r: 18, t: 44, b: 36 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var rows = result.sweep;
    var maxErr = Math.max.apply(null, rows.map(function (row) { return Math.abs(row.rankError); }).concat([0.002]));
    function px(i) { return left + (i / Math.max(1, rows.length - 1)) * pw; }
    function py(e) { return top + ph / 2 - e / maxErr * (ph * 0.43); }
    line(ctx, left, top + ph / 2, left + pw, top + ph / 2, COLORS.rule, 1);
    line(ctx, left, top, left, top + ph, COLORS.rule, 1);
    ctx.strokeStyle = COLORS.sketch;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var xx = px(i);
      var yy = py(row.rankError);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    rows.forEach(function (row, i) {
      var selected = row.budget === result.params.budget;
      ctx.fillStyle = selected ? COLORS.naive : COLORS.sketch;
      ctx.beginPath();
      ctx.arc(px(i), py(row.rankError), selected ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (i % 2 === 0) label(ctx, String(row.budget), px(i), y + h - 12, COLORS.muted, "center", 11);
    });
    label(ctx, "centroids", left + pw / 2, y + h - 10, COLORS.muted, "center", 11);
    label(ctx, "rank error", x + 10, top + 12, COLORS.muted, "left", 11);
  }

  function draw(result, canvas) {
    if (!canvas) return;
    var prepared = setupCanvas(canvas);
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 16;
    var gap = 14;
    if (width < 700) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawShardPanel(ctx, result, pad, pad, width - pad * 2, panelH);
      drawCdfPanel(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawEstimatorPanel(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawBudgetPanel(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }
    var halfW = (width - pad * 2 - gap) / 2;
    var halfH = (height - pad * 2 - gap) / 2;
    drawShardPanel(ctx, result, pad, pad, halfW, halfH);
    drawCdfPanel(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawEstimatorPanel(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawBudgetPanel(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-quantile-merge-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    buildSketchFromSorted: buildSketchFromSorted,
    cleanParams: cleanParams,
    evaluate: evaluate,
    mergeSketches: mergeSketches,
    quantileSorted: quantileSorted,
    sketchQuantile: sketchQuantile
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.QuantileMergeLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
