(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    exact: "#334155",
    cm: "#be123c",
    cu: "#0f766e",
    bound: "#7c3aed",
    heat: "#d97706",
    blue: "#2563eb",
    soft: "#eef6ff"
  };

  var DEFAULTS = {
    events: 50000,
    vocabulary: 2000,
    skew: 105,
    width: 128,
    depth: 5,
    threshold: 10,
    queryRank: 6,
    seed: 37
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return min;
    return clamp(Math.round(n), min, max);
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      events: clampInt(readNumber(raw, "events"), 5000, 120000),
      vocabulary: clampInt(readNumber(raw, "vocabulary"), 100, 8000),
      skew: clampInt(readNumber(raw, "skew"), 0, 150),
      width: clampInt(readNumber(raw, "width"), 32, 512),
      depth: clampInt(readNumber(raw, "depth"), 1, 8),
      threshold: clampInt(readNumber(raw, "threshold"), 2, 60),
      queryRank: clampInt(readNumber(raw, "queryRank"), 1, 40),
      seed: clampInt(readNumber(raw, "seed"), 1, 9999)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function makeRng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash32(value, seed) {
    var h = (value ^ seed) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
  }

  function bucket(item, row, width, seed) {
    return hash32((item + 1) * 0x9e3779b1, seed ^ Math.imul(row + 1, 0x85ebca6b)) % width;
  }

  function makeWeights(vocabulary, skew) {
    var exponent = skew / 100;
    var cdf = new Float64Array(vocabulary);
    var total = 0;
    for (var i = 0; i < vocabulary; i += 1) {
      total += exponent === 0 ? 1 : 1 / Math.pow(i + 1, exponent);
      cdf[i] = total;
    }
    for (var j = 0; j < vocabulary; j += 1) cdf[j] /= total;
    return cdf;
  }

  function sampleCdf(cdf, u) {
    var lo = 0;
    var hi = cdf.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (cdf[mid] >= u) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  function makeTable(depth, width) {
    var rows = [];
    for (var r = 0; r < depth; r += 1) rows.push(new Uint32Array(width));
    return rows;
  }

  function updateClassic(table, item, width, seed) {
    for (var r = 0; r < table.length; r += 1) {
      table[r][bucket(item, r, width, seed)] += 1;
    }
  }

  function updateConservative(table, item, width, seed) {
    var positions = [];
    var min = Infinity;
    for (var r = 0; r < table.length; r += 1) {
      var b = bucket(item, r, width, seed);
      positions.push(b);
      if (table[r][b] < min) min = table[r][b];
    }
    for (var row = 0; row < table.length; row += 1) {
      var col = positions[row];
      if (table[row][col] === min) table[row][col] += 1;
    }
  }

  function estimate(table, item, width, seed) {
    var min = Infinity;
    for (var r = 0; r < table.length; r += 1) {
      var value = table[r][bucket(item, r, width, seed)];
      if (value < min) min = value;
    }
    return min;
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var at = (sorted.length - 1) * q;
    var lo = Math.floor(at);
    var hi = Math.ceil(at);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  }

  function summarize(items, key) {
    var errors = items.map(function (row) { return row[key]; }).sort(function (a, b) { return a - b; });
    var sum = errors.reduce(function (a, b) { return a + b; }, 0);
    return {
      mean: errors.length ? sum / errors.length : 0,
      p50: quantile(errors, 0.5),
      p95: quantile(errors, 0.95),
      max: errors.length ? errors[errors.length - 1] : 0
    };
  }

  function generate(params) {
    var p = cleanParams(params);
    var rng = makeRng(p.seed);
    var cdf = makeWeights(p.vocabulary, p.skew);
    var counts = new Uint32Array(p.vocabulary);
    var cm = makeTable(p.depth, p.width);
    var cu = makeTable(p.depth, p.width);
    for (var i = 0; i < p.events; i += 1) {
      var item = sampleCdf(cdf, rng());
      counts[item] += 1;
      updateClassic(cm, item, p.width, p.seed);
      updateConservative(cu, item, p.width, p.seed);
    }
    return { params: p, counts: counts, cm: cm, cu: cu };
  }

  function evaluate(raw) {
    var data = generate(raw);
    var p = data.params;
    var thresholdCount = p.events * p.threshold / 1000;
    var items = [];
    var observed = 0;
    var trueHeavy = 0;
    var cmReported = 0;
    var cuReported = 0;
    var cmFalsePositive = 0;
    var cuFalsePositive = 0;
    var cmFalseNegative = 0;
    var cuFalseNegative = 0;
    for (var item = 0; item < p.vocabulary; item += 1) {
      var exact = data.counts[item];
      if (exact > 0) observed += 1;
      var cmEstimate = estimate(data.cm, item, p.width, p.seed);
      var cuEstimate = estimate(data.cu, item, p.width, p.seed);
      var isHeavy = exact >= thresholdCount;
      var cmHit = cmEstimate >= thresholdCount;
      var cuHit = cuEstimate >= thresholdCount;
      if (isHeavy) trueHeavy += 1;
      if (cmHit) cmReported += 1;
      if (cuHit) cuReported += 1;
      if (cmHit && !isHeavy) cmFalsePositive += 1;
      if (cuHit && !isHeavy) cuFalsePositive += 1;
      if (!cmHit && isHeavy) cmFalseNegative += 1;
      if (!cuHit && isHeavy) cuFalseNegative += 1;
      items.push({
        item: item,
        count: exact,
        cm: cmEstimate,
        cu: cuEstimate,
        cmError: cmEstimate - exact,
        cuError: cuEstimate - exact
      });
    }
    items.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.item - b.item;
    });
    var query = items[Math.min(items.length - 1, p.queryRank - 1)];
    var epsilon = Math.E / p.width;
    var delta = Math.exp(-p.depth);
    var budget = epsilon * p.events;
    var cmSummary = summarize(items, "cmError");
    var cuSummary = summarize(items, "cuError");
    var checks = {
      bounded: items.every(function (row) { return row.cm >= row.count && row.cu >= row.count; }),
      finite: Number.isFinite(cmSummary.max) && Number.isFinite(cuSummary.max),
      noEnumeratedFalseNegatives: cmFalseNegative === 0 && cuFalseNegative === 0,
      itemCount: items.length === p.vocabulary
    };
    return {
      budget: budget,
      checks: checks,
      cmSummary: cmSummary,
      cuSummary: cuSummary,
      data: data,
      delta: delta,
      epsilon: epsilon,
      exactBytes: observed * 16,
      items: items,
      memoryBytes: p.width * p.depth * 4,
      observed: observed,
      params: p,
      query: query,
      thresholdCount: thresholdCount,
      threshold: {
        trueHeavy: trueHeavy,
        cmReported: cmReported,
        cuReported: cuReported,
        cmFalsePositive: cmFalsePositive,
        cuFalsePositive: cuFalsePositive,
        cmFalseNegative: cmFalseNegative,
        cuFalseNegative: cuFalseNegative
      }
    };
  }

  function formatInt(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return formatNumber(bytes, bytes < 10 ? 1 : 0) + " B";
    if (bytes < 1024 * 1024) return formatNumber(bytes / 1024, bytes < 10 * 1024 ? 1 : 0) + " KB";
    return formatNumber(bytes / (1024 * 1024), 1) + " MB";
  }

  function metric(label, value) {
    return '<div class="cms-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function updateControls(root, params) {
    Object.keys(params).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && String(input.value) !== String(params[key])) input.value = params[key];
    });
  }

  function updateOutputs(root, params) {
    var values = {
      events: formatInt(params.events),
      vocabulary: formatInt(params.vocabulary),
      skew: formatNumber(params.skew / 100, 2),
      width: formatInt(params.width),
      depth: formatInt(params.depth),
      threshold: formatPercent(params.threshold / 1000, 1),
      queryRank: "#" + params.queryRank,
      seed: String(params.seed)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-output="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function updateMetrics(root, result) {
    var node = root.querySelector("[data-metrics]");
    if (!node) return;
    var audit = result.checks.bounded && result.checks.finite && result.checks.noEnumeratedFalseNegatives && result.checks.itemCount ? "pass" : "check";
    node.innerHTML = [
      metric("Query key", "item " + (result.query.item + 1)),
      metric("True / CM / CU", formatInt(result.query.count) + " / " + formatInt(result.query.cm) + " / " + formatInt(result.query.cu)),
      metric("CM p95 error", formatInt(result.cmSummary.p95)),
      metric("Error budget", formatInt(result.budget)),
      metric("False positives", formatInt(result.threshold.cmFalsePositive) + " / " + formatInt(result.threshold.cuFalsePositive)),
      metric("Sketch memory", formatBytes(result.memoryBytes)),
      metric("Observed keys", formatInt(result.observed)),
      metric("Audit", audit)
    ].join("");
  }

  function setupCanvas(canvas, height) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var dpr = clamp(global.devicePixelRatio || 1, 1, 2);
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
  }

  function text(ctx, value, x, y, size, color, weight, align, baseline) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(value, x, y);
  }

  function roundedRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 16, box.y + 28, 13, COLORS.text, 760);
    if (subtitle) text(ctx, subtitle, box.x + 16, box.y + 46, 10, COLORS.muted, 600);
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

  function drawTopPanel(ctx, result, box) {
    panel(ctx, box, "top keys", "exact counts versus two sketches");
    var rows = result.items.slice(0, 12);
    var plot = { x: box.x + 54, y: box.y + 68, w: box.w - 78, h: box.h - 102 };
    var max = rows.reduce(function (m, row) { return Math.max(m, row.cm, row.cu, row.count); }, 1);
    rows.forEach(function (row, i) {
      var y = plot.y + i * plot.h / rows.length;
      var h = Math.max(5, plot.h / rows.length - 5);
      text(ctx, String(i + 1), plot.x - 14, y + h / 2, 9, COLORS.muted, 650, "right", "middle");
      [
        { key: "count", color: COLORS.exact, offset: 0 },
        { key: "cm", color: COLORS.cm, offset: h * 0.34 },
        { key: "cu", color: COLORS.cu, offset: h * 0.68 }
      ].forEach(function (bar) {
        ctx.fillStyle = bar.color;
        ctx.fillRect(plot.x, y + bar.offset, row[bar.key] / max * plot.w, Math.max(2, h * 0.25));
      });
      if (row.item === result.query.item) {
        ctx.strokeStyle = COLORS.bound;
        ctx.strokeRect(plot.x - 4, y - 1, plot.w + 8, h + 2);
      }
    });
    text(ctx, "exact", plot.x, box.y + box.h - 17, 10, COLORS.exact, 760);
    text(ctx, "classic CM", plot.x + 50, box.y + box.h - 17, 10, COLORS.cm, 760);
    text(ctx, "conservative", plot.x + 130, box.y + box.h - 17, 10, COLORS.cu, 760);
    text(ctx, "max " + formatInt(max), plot.x + plot.w, box.y + box.h - 17, 10, COLORS.muted, 650, "right");
  }

  function drawErrorPanel(ctx, result, box) {
    panel(ctx, box, "collision error", "additive noise by exact rank");
    var sample = result.items.slice(0, Math.min(180, result.items.length));
    var plot = { x: box.x + 48, y: box.y + 68, w: box.w - 72, h: box.h - 104 };
    var maxError = sample.reduce(function (m, row) { return Math.max(m, row.cmError, row.cuError); }, result.budget);
    maxError = Math.max(1, maxError * 1.08);
    drawAxis(ctx, plot);
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var yy = plot.y + plot.h - f * plot.h;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    });
    var budgetY = plot.y + plot.h - Math.min(1, result.budget / maxError) * plot.h;
    ctx.strokeStyle = COLORS.bound;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, budgetY);
    ctx.lineTo(plot.x + plot.w, budgetY);
    ctx.stroke();
    ctx.setLineDash([]);
    sample.forEach(function (row, i) {
      var x = plot.x + (i + 0.5) / sample.length * plot.w;
      var y1 = plot.y + plot.h - row.cmError / maxError * plot.h;
      var y2 = plot.y + plot.h - row.cuError / maxError * plot.h;
      ctx.fillStyle = COLORS.cm;
      ctx.fillRect(x - 1.5, y1 - 1.5, 3, 3);
      ctx.fillStyle = COLORS.cu;
      ctx.fillRect(x - 1.5, y2 - 1.5, 3, 3);
    });
    text(ctx, "0", plot.x - 8, plot.y + plot.h + 4, 10, COLORS.muted, 650, "right");
    text(ctx, formatInt(maxError), plot.x - 8, plot.y + 4, 10, COLORS.muted, 650, "right");
    text(ctx, "epsilon N", plot.x + plot.w, budgetY - 4, 10, COLORS.bound, 760, "right", "bottom");
    text(ctx, "rank", plot.x + plot.w, plot.y + plot.h + 18, 10, COLORS.muted, 650, "right");
  }

  function heatColor(t) {
    t = clamp(t, 0, 1);
    if (t < 0.5) {
      var a = t / 0.5;
      return "rgb(" + Math.round(238 + (254 - 238) * a) + "," + Math.round(246 + (243 - 246) * a) + "," + Math.round(255 + (199 - 255) * a) + ")";
    }
    var b = (t - 0.5) / 0.5;
    return "rgb(" + Math.round(254 + (190 - 254) * b) + "," + Math.round(243 + (18 - 243) * b) + "," + Math.round(199 + (60 - 199) * b) + ")";
  }

  function drawHeatPanel(ctx, result, box) {
    panel(ctx, box, "counter table", "classic CM rows; query cells outlined");
    var table = result.data.cm;
    var cols = Math.min(64, result.params.width);
    var group = Math.ceil(result.params.width / cols);
    var plot = { x: box.x + 38, y: box.y + 66, w: box.w - 60, h: box.h - 100 };
    var cellW = plot.w / cols;
    var cellH = plot.h / result.params.depth;
    var max = 1;
    table.forEach(function (row) {
      row.forEach(function (v) { if (v > max) max = v; });
    });
    for (var r = 0; r < result.params.depth; r += 1) {
      var queryBucket = bucket(result.query.item, r, result.params.width, result.params.seed);
      var queryGroup = Math.floor(queryBucket / group);
      for (var c = 0; c < cols; c += 1) {
        var start = c * group;
        var end = Math.min(result.params.width, start + group);
        var value = 0;
        for (var j = start; j < end; j += 1) value = Math.max(value, table[r][j]);
        ctx.fillStyle = heatColor(value / max);
        ctx.fillRect(plot.x + c * cellW, plot.y + r * cellH, Math.ceil(cellW), Math.ceil(cellH));
        if (c === queryGroup) {
          ctx.strokeStyle = COLORS.bound;
          ctx.lineWidth = 1.4;
          ctx.strokeRect(plot.x + c * cellW + 1, plot.y + r * cellH + 1, Math.max(2, cellW - 2), Math.max(2, cellH - 2));
        }
      }
      text(ctx, String(r + 1), plot.x - 10, plot.y + r * cellH + cellH / 2, 10, COLORS.muted, 650, "right", "middle");
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    text(ctx, "width " + result.params.width + ", depth " + result.params.depth, plot.x, plot.y + plot.h + 18, 10, COLORS.muted, 650);
    text(ctx, "max cell " + formatInt(max), plot.x + plot.w, plot.y + plot.h + 18, 10, COLORS.heat, 760, "right");
  }

  function drawThresholdPanel(ctx, result, box) {
    panel(ctx, box, "threshold audit", "enumerating the synthetic vocabulary");
    var plot = { x: box.x + 54, y: box.y + 76, w: box.w - 92, h: box.h - 126 };
    var rows = [
      { label: "true heavy", value: result.threshold.trueHeavy, color: COLORS.exact },
      { label: "CM reports", value: result.threshold.cmReported, color: COLORS.cm },
      { label: "CU reports", value: result.threshold.cuReported, color: COLORS.cu },
      { label: "CM false +", value: result.threshold.cmFalsePositive, color: COLORS.heat },
      { label: "CU false +", value: result.threshold.cuFalsePositive, color: COLORS.blue }
    ];
    var max = rows.reduce(function (m, row) { return Math.max(m, row.value); }, 1);
    rows.forEach(function (row, i) {
      var y = plot.y + i * plot.h / rows.length;
      var h = Math.max(14, plot.h / rows.length - 10);
      text(ctx, row.label, plot.x - 8, y + h / 2, 10, COLORS.muted, 650, "right", "middle");
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, row.value / max * plot.w, h);
      text(ctx, formatInt(row.value), plot.x + row.value / max * plot.w + 6, y + h / 2, 10, COLORS.text, 700, "left", "middle");
    });
    ctx.fillStyle = COLORS.soft;
    roundedRect(ctx, box.x + 16, box.y + box.h - 48, box.w - 32, 30, 6);
    ctx.fill();
    var note = box.w < 360
      ? "threshold = " + formatInt(result.thresholdCount) + "; no enumerated misses"
      : "threshold = " + formatInt(result.thresholdCount) + " events; enumerated true heavy keys have no misses";
    text(ctx, note, box.x + 28, box.y + box.h - 29, 10, COLORS.text, 650, "left", "middle");
  }

  function draw(result, canvas) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var compact = width < 560;
    var prepared = setupCanvas(canvas, compact ? 1120 : 760);
    var ctx = prepared.ctx;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = prepared.width - 2 * pad;
    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawTopPanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawErrorPanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawHeatPanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawThresholdPanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }
    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawTopPanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawErrorPanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawHeatPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawThresholdPanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function renderOne(root) {
    var result = evaluate(readParams(root));
    updateControls(root, result.params);
    updateOutputs(root, result.params);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__cmsResult = result;
  }

  function initOne(root) {
    if (root.__cmsReady) return;
    root.__cmsReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { renderOne(root); }, 80);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__cmsResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__cmsResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__cmsResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__cmsResult, canvas);
        }
      });
    }
    renderOne(root);
  }

  function init() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-count-min-sketch-lab]")).forEach(initOne);
  }

  var api = {
    bucket: bucket,
    cleanParams: cleanParams,
    estimate: estimate,
    evaluate: evaluate,
    hash32: hash32
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CountMinSketchLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
