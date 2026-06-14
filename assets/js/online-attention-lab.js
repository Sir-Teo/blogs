(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    naive: "#be123c",
    online: "#0f766e",
    tile: "#2563eb",
    state: "#7c3aed",
    weight: "#b45309",
    faint: "#f8fafc"
  };

  var DEFAULTS = {
    tokens: 768,
    headDim: 64,
    tile: 64,
    spread: 55,
    precision: 2
  };

  var VALUE_DIM = 6;

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
      tokens: snap(raw.tokens, DEFAULTS.tokens, 128, 4096, 64),
      headDim: snap(raw.headDim, DEFAULTS.headDim, 16, 192, 16),
      tile: snap(raw.tile, DEFAULTS.tile, 16, 192, 16),
      spread: snap(raw.spread, DEFAULTS.spread, 10, 120, 1),
      precision: snap(raw.precision, DEFAULTS.precision, 2, 4, 2)
    };
  }

  function formatBytes(bytes) {
    if (!isFinite(bytes)) return "n/a";
    var units = ["B", "KiB", "MiB", "GiB"];
    var value = bytes;
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2) + " " + units[unit];
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="online-attn-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function pseudoNoise(i) {
    var x = Math.sin((i + 1) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function queryComponent(j, d) {
    var x = (j + 1) / d;
    return Math.sin(13.1 * x) + 0.55 * Math.cos(31.7 * x) + 0.18 * Math.sin(71.3 * x);
  }

  function keyComponent(i, j, d) {
    var a = (i + 3) * (j + 5);
    return Math.sin(0.013 * a) + 0.42 * Math.cos(0.021 * (i + 11) * (j + 1)) + 0.12 * Math.sin((j + 1) / d * 19);
  }

  function valueComponent(i, c) {
    return Math.sin(0.017 * (i + 1) * (c + 2)) + 0.6 * Math.cos(0.031 * (i + 7) * (c + 1));
  }

  function computeScores(params) {
    var n = params.tokens;
    var d = params.headDim;
    var scores = new Array(n);
    var q = new Array(d);
    for (var j = 0; j < d; j += 1) q[j] = queryComponent(j, d);

    var mean = 0;
    for (var i = 0; i < n; i += 1) {
      var dot = 0;
      for (var k = 0; k < d; k += 1) dot += q[k] * keyComponent(i, k, d);
      var recency = 0.35 * i / Math.max(1, n - 1);
      var landmark = i === Math.floor(n * 0.17) ? 0.9 : 0;
      var noise = 0.18 * (pseudoNoise(i) - 0.5);
      scores[i] = dot / Math.sqrt(d) + recency + landmark + noise;
      mean += scores[i];
    }
    mean /= n;

    var scale = params.spread / 45;
    for (var s = 0; s < n; s += 1) scores[s] = (scores[s] - mean) * scale;
    return scores;
  }

  function stableAttention(scores) {
    var n = scores.length;
    var m = -Infinity;
    for (var i = 0; i < n; i += 1) if (scores[i] > m) m = scores[i];
    var denom = 0;
    var out = Array(VALUE_DIM).fill(0);
    var weights = new Array(n);
    for (var j = 0; j < n; j += 1) {
      var w = Math.exp(scores[j] - m);
      weights[j] = w;
      denom += w;
      for (var c = 0; c < VALUE_DIM; c += 1) out[c] += w * valueComponent(j, c);
    }
    var entropy = 0;
    var maxWeight = 0;
    for (var k = 0; k < n; k += 1) {
      weights[k] /= denom;
      maxWeight = Math.max(maxWeight, weights[k]);
      if (weights[k] > 0) entropy -= weights[k] * Math.log(weights[k]);
    }
    for (var v = 0; v < VALUE_DIM; v += 1) out[v] /= denom;
    return {
      denom: denom,
      entropy: entropy / Math.log(n),
      max: m,
      maxWeight: maxWeight,
      out: out,
      weights: weights
    };
  }

  function onlineAttention(scores, tile) {
    var n = scores.length;
    var m = -Infinity;
    var l = 0;
    var out = Array(VALUE_DIM).fill(0);
    var steps = [];

    for (var start = 0; start < n; start += tile) {
      var end = Math.min(n, start + tile);
      var blockMax = -Infinity;
      for (var i = start; i < end; i += 1) if (scores[i] > blockMax) blockMax = scores[i];
      var nextM = Math.max(m, blockMax);
      var oldScale = m === -Infinity ? 0 : Math.exp(m - nextM);
      var blockDenom = 0;

      l *= oldScale;
      for (var c = 0; c < VALUE_DIM; c += 1) out[c] *= oldScale;

      for (var j = start; j < end; j += 1) {
        var w = Math.exp(scores[j] - nextM);
        blockDenom += w;
        for (var v = 0; v < VALUE_DIM; v += 1) out[v] += w * valueComponent(j, v);
      }
      l += blockDenom;
      m = nextM;
      steps.push({
        blockMax: blockMax,
        denom: l,
        end: end,
        max: m,
        rescale: oldScale,
        start: start
      });
    }

    var normalized = out.map(function (x) { return x / l; });
    return { denom: l, max: m, out: normalized, steps: steps };
  }

  function estimateMemory(params) {
    var n = params.tokens;
    var d = params.headDim;
    var b = params.precision;
    var t = Math.min(params.tile, n);
    var materializedBytes = 2 * n * n * b;
    var intermediateTraffic = 4 * n * n * b;
    var onlineStateBytes = 2 * n * 4;
    var tileScratchBytes = (2 * t * d * b) + (t * t * 4) + (t * VALUE_DIM * b);
    return {
      intermediateTraffic: intermediateTraffic,
      materializedBytes: materializedBytes,
      onlineStateBytes: onlineStateBytes,
      ratio: materializedBytes / Math.max(1, onlineStateBytes),
      tileScratchBytes: tileScratchBytes
    };
  }

  function memoryCurve(params) {
    var points = [];
    var maxN = Math.max(4096, params.tokens);
    for (var n = 128; n <= maxN; n *= 2) {
      var p = {
        headDim: params.headDim,
        precision: params.precision,
        tile: params.tile,
        tokens: n
      };
      var mem = estimateMemory(p);
      points.push({
        materialized: mem.materializedBytes,
        n: n,
        online: mem.onlineStateBytes,
        scratch: mem.tileScratchBytes
      });
    }
    if (!points.some(function (row) { return row.n === params.tokens; })) {
      var current = estimateMemory(params);
      points.push({
        materialized: current.materializedBytes,
        n: params.tokens,
        online: current.onlineStateBytes,
        scratch: current.tileScratchBytes
      });
      points.sort(function (a, b) { return a.n - b.n; });
    }
    return points;
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var scores = computeScores(params);
    var naive = stableAttention(scores);
    var online = onlineAttention(scores, Math.min(params.tile, params.tokens));
    var maxError = 0;
    for (var i = 0; i < naive.out.length; i += 1) {
      maxError = Math.max(maxError, Math.abs(naive.out[i] - online.out[i]));
    }
    return {
      curve: memoryCurve(params),
      memory: estimateMemory(params),
      naive: naive,
      online: online,
      params: params,
      scores: scores,
      maxError: maxError
    };
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

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function label(ctx, text, x, y, align, color) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawLine(ctx, points, xScale, yScale, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, i) {
      var x = xScale(point);
      var y = yScale(point);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawMemoryPanel(ctx, result, box) {
    panelTitle(ctx, box, "Off-chip intermediates", "materialized attention grows quadratically");
    var plot = { x: box.x + 54, y: box.y + 56, w: box.w - 78, h: box.h - 94 };
    drawAxis(ctx, plot);
    var points = result.curve;
    var minN = points[0].n;
    var maxN = points[points.length - 1].n;
    var maxY = Math.max.apply(null, points.map(function (p) { return p.materialized; }));
    var minY = Math.max(1, Math.min.apply(null, points.map(function (p) { return p.online; })));
    function sx(p) {
      return plot.x + (Math.log2(p.n) - Math.log2(minN)) / (Math.log2(maxN) - Math.log2(minN)) * plot.w;
    }
    function sy(v) {
      return plot.y + plot.h - (Math.log2(v) - Math.log2(minY)) / Math.max(1e-9, Math.log2(maxY) - Math.log2(minY)) * plot.h;
    }
    for (var i = 1; i <= 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    drawLine(ctx, points, sx, function (p) { return sy(p.materialized); }, COLORS.naive, 2.4);
    drawLine(ctx, points, sx, function (p) { return sy(p.online); }, COLORS.online, 2.2);
    drawLine(ctx, points, sx, function (p) { return sy(p.scratch); }, COLORS.tile, 1.8);
    label(ctx, String(minN), plot.x, plot.y + plot.h + 18, "left");
    label(ctx, String(maxN), plot.x + plot.w, plot.y + plot.h + 18, "right");
    label(ctx, formatBytes(maxY), plot.x - 8, plot.y, "right");
    label(ctx, formatBytes(minY), plot.x - 8, plot.y + plot.h, "right");
    label(ctx, "scores+probs", plot.x + 8, plot.y + 16, "left", COLORS.naive);
    label(ctx, "online m,l", plot.x + 8, plot.y + 34, "left", COLORS.online);
    label(ctx, "tile scratch", plot.x + 8, plot.y + 52, "left", COLORS.tile);
  }

  function drawSoftmaxPanel(ctx, result, box) {
    panelTitle(ctx, box, "Streaming softmax state", "running max rescales the denominator");
    var steps = result.online.steps;
    var plot = { x: box.x + 48, y: box.y + 58, w: box.w - 72, h: box.h - 96 };
    drawAxis(ctx, plot);
    var maxDenom = Math.max.apply(null, steps.map(function (s) { return s.denom; }).concat([1]));
    var minMax = Math.min.apply(null, steps.map(function (s) { return s.max; }));
    var maxMax = Math.max.apply(null, steps.map(function (s) { return s.max; }));
    function sx(s) { return plot.x + s.end / result.params.tokens * plot.w; }
    function syDenom(v) { return plot.y + plot.h - Math.log1p(v) / Math.log1p(maxDenom) * plot.h; }
    function syMax(v) { return plot.y + plot.h - (v - minMax) / Math.max(1e-9, maxMax - minMax) * plot.h; }
    drawLine(ctx, steps, sx, function (s) { return syDenom(s.denom); }, COLORS.state, 2.4);
    drawLine(ctx, steps, sx, function (s) { return syMax(s.max); }, COLORS.tile, 2);
    steps.forEach(function (s) {
      var x = sx(s);
      var h = Math.max(2, (1 - s.rescale) * 34);
      ctx.fillStyle = "rgba(190,18,60,0.23)";
      ctx.fillRect(x - 2, plot.y + plot.h - h, 4, h);
    });
    label(ctx, "denominator l", plot.x + 8, plot.y + 16, "left", COLORS.state);
    label(ctx, "running max m", plot.x + 8, plot.y + 34, "left", COLORS.tile);
    label(ctx, "rescale spikes", plot.x + 8, plot.y + 52, "left", COLORS.naive);
  }

  function drawTrafficPanel(ctx, result, box) {
    panelTitle(ctx, box, "Intermediate traffic model", "what changes is movement, not the math");
    var plot = { x: box.x + 22, y: box.y + 58, w: box.w - 44, h: box.h - 96 };
    var bars = [
      { label: "write/read S,P", value: result.memory.intermediateTraffic, color: COLORS.naive },
      { label: "online state", value: result.memory.onlineStateBytes, color: COLORS.online },
      { label: "tile scratch", value: result.memory.tileScratchBytes, color: COLORS.tile }
    ];
    var maxValue = Math.max.apply(null, bars.map(function (b) { return b.value; }));
    var barW = Math.min(92, (plot.w - 36) / bars.length);
    bars.forEach(function (bar, i) {
      var x = plot.x + i * (barW + 18) + 4;
      var h = Math.max(2, Math.log1p(bar.value) / Math.log1p(maxValue) * plot.h);
      ctx.fillStyle = bar.color;
      ctx.fillRect(x, plot.y + plot.h - h, barW, h);
      label(ctx, bar.label, x + barW / 2, plot.y + plot.h + 17, "center");
      label(ctx, formatBytes(bar.value), x + barW / 2, plot.y + plot.h - h - 12, "center", COLORS.text);
    });
  }

  function drawWeightsPanel(ctx, result, box) {
    panelTitle(ctx, box, "One query row", "attention weights are normalized once at the end");
    var plot = { x: box.x + 44, y: box.y + 58, w: box.w - 68, h: box.h - 96 };
    drawAxis(ctx, plot);
    var weights = result.naive.weights;
    var n = weights.length;
    var bins = Math.min(96, n);
    var binned = [];
    for (var b = 0; b < bins; b += 1) {
      var start = Math.floor(b * n / bins);
      var end = Math.floor((b + 1) * n / bins);
      var maxW = 0;
      for (var i = start; i < end; i += 1) maxW = Math.max(maxW, weights[i]);
      binned.push(maxW);
    }
    var maxWeight = Math.max.apply(null, binned.concat([1e-9]));
    binned.forEach(function (w, i) {
      var x = plot.x + i / bins * plot.w;
      var bw = Math.max(1, plot.w / bins - 1);
      var h = Math.max(1, w / maxWeight * plot.h);
      ctx.fillStyle = COLORS.weight;
      ctx.fillRect(x, plot.y + plot.h - h, bw, h);
    });
    label(ctx, "position", plot.x + plot.w, plot.y + plot.h + 18, "right");
    label(ctx, "max row weight " + formatNumber(result.naive.maxWeight, 3), plot.x + 8, plot.y + 16, "left", COLORS.weight);
    label(ctx, "entropy " + formatNumber(result.naive.entropy, 2), plot.x + 8, plot.y + 34, "left", COLORS.text);
    label(ctx, "error " + result.maxError.toExponential(1), plot.x + 8, plot.y + 52, "left", COLORS.online);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 680;
    var height = compact ? 920 : 650;
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

    var gap = compact ? 22 : 26;
    var boxW = compact ? width - 24 : (width - 36 - gap) / 2;
    var boxH = compact ? 205 : 280;
    var left = 12;
    var right = compact ? 12 : left + boxW + gap;
    var top = 14;
    var boxes = compact ? [
      { x: left, y: top, w: boxW, h: boxH },
      { x: left, y: top + boxH + gap, w: boxW, h: boxH },
      { x: left, y: top + 2 * (boxH + gap), w: boxW, h: boxH },
      { x: left, y: top + 3 * (boxH + gap), w: boxW, h: boxH }
    ] : [
      { x: left, y: top, w: boxW, h: boxH },
      { x: right, y: top, w: boxW, h: boxH },
      { x: left, y: top + boxH + gap, w: boxW, h: boxH },
      { x: right, y: top + boxH + gap, w: boxW, h: boxH }
    ];

    drawMemoryPanel(ctx, result, boxes[0]);
    drawSoftmaxPanel(ctx, result, boxes[1]);
    drawTrafficPanel(ctx, result, boxes[2]);
    drawWeightsPanel(ctx, result, boxes[3]);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function updateControls(root, params) {
    var values = {
      headDim: params.headDim,
      precision: params.precision === 2 ? "fp16/bf16" : "fp32",
      spread: params.spread + "%",
      tile: params.tile,
      tokens: params.tokens.toLocaleString()
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function render(root) {
    var result = evaluate(paramsFromRoot(root));
    updateControls(root, result.params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Output error", result.maxError.toExponential(2)),
        metric("Matrix avoided", formatBytes(result.memory.materializedBytes)),
        metric("Intermediate traffic", formatBytes(result.memory.intermediateTraffic)),
        metric("Online state", formatBytes(result.memory.onlineStateBytes)),
        metric("Reduction", formatNumber(result.memory.ratio, 1) + "x")
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas && canvas.getContext) drawChart(canvas, result);
  }

  function init(root) {
    var frame = 0;
    function requestRender() {
      if (frame) global.cancelAnimationFrame(frame);
      frame = global.requestAnimationFrame(function () {
        frame = 0;
        render(root);
      });
    }
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
    });
    global.addEventListener("resize", requestRender);
    render(root);
  }

  function boot() {
    global.document.querySelectorAll("[data-online-attention-lab]").forEach(init);
  }

  global.OnlineAttentionLab = {
    evaluate: evaluate,
    onlineAttention: onlineAttention,
    stableAttention: stableAttention
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.OnlineAttentionLab;
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
