(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    trueBar: "#0f766e",
    estimate: "#b45309",
    error: "#be123c",
    bound: "#6d28d9",
    probe: "#2563eb",
    falsePositive: "#c2410c",
    heavy: "#0f766e"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function bucketFor(key, row, width) {
    return hash32(Math.imul(key + 1, 1000003) ^ Math.imul(row + 7, 9176), 0x9e3779b9 + row * 2654435761) % width;
  }

  function formatCount(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "m";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    return String(Math.round(value));
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="cms-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var index = clamp(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1);
    return sorted[index];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var universe = clamp(Math.round(raw.universe == null ? 512 : raw.universe), 64, 1024);
    return {
      depth: clamp(Math.round(raw.depth == null ? 4 : raw.depth), 1, 8),
      probeRank: clamp(Math.round(raw.probeRank == null ? 80 : raw.probeRank), 1, universe),
      skew: clamp(raw.skew == null ? 110 : Number(raw.skew), 50, 200) / 100,
      streamLength: clamp(Math.round(raw.streamLength == null ? 40000 : raw.streamLength), 5000, 120000),
      threshold: clamp(raw.threshold == null ? 2 : Number(raw.threshold), 0.5, 10) / 100,
      universe: universe,
      width: clamp(Math.round(raw.width == null ? 64 : raw.width), 8, 256)
    };
  }

  function zipfCounts(params) {
    var weights = [];
    var totalWeight = 0;
    for (var i = 1; i <= params.universe; i += 1) {
      var weight = 1 / Math.pow(i, params.skew);
      weights.push(weight);
      totalWeight += weight;
    }
    var items = [];
    var assigned = 0;
    for (var j = 0; j < params.universe; j += 1) {
      var exact = params.streamLength * weights[j] / totalWeight;
      var count = Math.floor(exact);
      assigned += count;
      items.push({
        count: count,
        estimate: 0,
        error: 0,
        fractional: exact - count,
        key: j,
        label: "k" + String(j + 1),
        rank: j + 1
      });
    }
    var remaining = params.streamLength - assigned;
    items.slice().sort(function (a, b) {
      if (b.fractional !== a.fractional) return b.fractional - a.fractional;
      return a.rank - b.rank;
    }).slice(0, remaining).forEach(function (item) {
      items[item.key].count += 1;
    });
    return items;
  }

  function buildSketch(params, items) {
    var table = [];
    for (var row = 0; row < params.depth; row += 1) {
      var cells = new Array(params.width);
      for (var col = 0; col < params.width; col += 1) cells[col] = 0;
      table.push(cells);
    }
    items.forEach(function (item) {
      if (!item.count) return;
      for (var row = 0; row < params.depth; row += 1) {
        table[row][bucketFor(item.key, row, params.width)] += item.count;
      }
    });
    return table;
  }

  function estimateRows(table, params, item) {
    var rows = [];
    for (var row = 0; row < params.depth; row += 1) {
      var bucket = bucketFor(item.key, row, params.width);
      rows.push({
        bucket: bucket,
        row: row,
        value: table[row][bucket]
      });
    }
    return rows;
  }

  function annotateItems(items, table, params) {
    items.forEach(function (item) {
      var rows = estimateRows(table, params, item);
      item.rows = rows;
      item.estimate = Math.min.apply(null, rows.map(function (row) { return row.value; }));
      item.error = item.estimate - item.count;
    });
  }

  function topBy(items, field, n) {
    return items.slice().sort(function (a, b) {
      if (b[field] !== a[field]) return b[field] - a[field];
      return a.rank - b.rank;
    }).slice(0, n);
  }

  function setOf(rows) {
    var out = {};
    rows.forEach(function (row) {
      out[row.key] = true;
    });
    return out;
  }

  function histogram(values, bins, maxValue) {
    var out = [];
    var max = Math.max(1, maxValue);
    for (var i = 0; i < bins; i += 1) out.push({ lo: max * i / bins, hi: max * (i + 1) / bins, count: 0 });
    values.forEach(function (value) {
      var index = Math.min(bins - 1, Math.floor(value / max * bins));
      out[index].count += 1;
    });
    return out;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var items = zipfCounts(params);
    var table = buildSketch(params, items);
    annotateItems(items, table, params);
    var errors = items.map(function (item) { return item.error; }).sort(function (a, b) { return a - b; });
    var thresholdCount = params.threshold * params.streamLength;
    var trueHeavy = items.filter(function (item) { return item.count >= thresholdCount; });
    var reported = items.filter(function (item) { return item.estimate >= thresholdCount; });
    var falsePositives = reported.filter(function (item) { return item.count < thresholdCount; });
    var trueTop = topBy(items, "count", 12);
    var estTop = topBy(items, "estimate", 12);
    var trueTop10 = setOf(topBy(items, "count", 10));
    var estTop10 = topBy(items, "estimate", 10);
    var topOverlap = estTop10.filter(function (item) { return trueTop10[item.key]; }).length;
    var probe = items[params.probeRank - 1];
    var epsilon = Math.E / params.width;
    var bound = epsilon * params.streamLength;
    var maxError = errors[errors.length - 1] || 0;
    return {
      bound: bound,
      delta: Math.exp(-params.depth),
      epsilon: epsilon,
      errors: errors,
      falsePositives: falsePositives,
      histogram: histogram(errors, 14, Math.max(bound, maxError)),
      items: items,
      maxError: maxError,
      memoryCells: params.depth * params.width,
      p50Error: quantile(errors, 0.5),
      p95Error: quantile(errors, 0.95),
      params: params,
      probe: probe,
      reported: reported,
      table: table,
      thresholdCount: thresholdCount,
      topEstimate: estTop,
      topOverlap: topOverlap,
      topPrecision: topOverlap / 10,
      topTrue: trueTop,
      trueHeavy: trueHeavy
    };
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
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

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
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
    panelTitle(ctx, box, "Top keys", "true count versus Count-Min estimate");
    var rows = result.topTrue;
    var plot = { x: box.x + 48, y: box.y + 52, w: box.w - 64, h: box.h - 84 };
    drawAxis(ctx, plot);
    var maxCount = Math.max.apply(null, rows.map(function (row) { return row.estimate; }));
    var gap = plot.w / rows.length;
    rows.forEach(function (item, i) {
      var x = plot.x + i * gap + gap * 0.17;
      var barW = gap * 0.28;
      var trueH = item.count / maxCount * plot.h;
      var estH = item.estimate / maxCount * plot.h;
      ctx.fillStyle = COLORS.trueBar;
      ctx.fillRect(x, plot.y + plot.h - trueH, barW, trueH);
      ctx.fillStyle = COLORS.estimate;
      ctx.fillRect(x + barW + 2, plot.y + plot.h - estH, barW, estH);
      label(ctx, String(item.rank), x + barW, plot.y + plot.h + 13, "center");
    });
    label(ctx, formatCount(maxCount), plot.x - 7, plot.y, "right");
    label(ctx, "teal true, amber estimate", plot.x, box.y + box.h - 13, "left");
    label(ctx, "threshold " + formatCount(result.thresholdCount), plot.x + plot.w, box.y + box.h - 13, "right", COLORS.bound);
  }

  function drawHeatmapPanel(ctx, result, box) {
    panelTitle(ctx, box, "Sketch table", "probe buckets outlined in blue");
    var table = result.table;
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 58, h: box.h - 90 };
    var cellW = plot.w / result.params.width;
    var cellH = plot.h / result.params.depth;
    var maxCell = 1;
    table.forEach(function (row) {
      row.forEach(function (value) { maxCell = Math.max(maxCell, value); });
    });
    for (var r = 0; r < result.params.depth; r += 1) {
      for (var c = 0; c < result.params.width; c += 1) {
        var value = table[r][c];
        var intensity = Math.log1p(value) / Math.log1p(maxCell);
        var red = Math.round(248 - 132 * intensity);
        var green = Math.round(250 - 70 * intensity);
        var blue = Math.round(252 - 40 * intensity);
        ctx.fillStyle = "rgb(" + red + "," + green + "," + blue + ")";
        ctx.fillRect(plot.x + c * cellW, plot.y + r * cellH, Math.max(1, cellW), Math.max(1, cellH));
      }
      label(ctx, "r" + String(r + 1), plot.x - 8, plot.y + r * cellH + cellH / 2, "right");
    }
    result.probe.rows.forEach(function (row) {
      ctx.strokeStyle = COLORS.probe;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(plot.x + row.bucket * cellW, plot.y + row.row * cellH, Math.max(2, cellW), Math.max(2, cellH));
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    label(ctx, "width " + result.params.width + " x depth " + result.params.depth, plot.x, box.y + box.h - 13, "left");
    label(ctx, "dark cells carry more collision mass", plot.x + plot.w, box.y + box.h - 13, "right");
  }

  function drawErrorPanel(ctx, result, box) {
    panelTitle(ctx, box, "Overcount histogram", "errors are estimate minus truth");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 66, h: box.h - 88 };
    drawAxis(ctx, plot);
    var maxBin = Math.max.apply(null, result.histogram.map(function (bin) { return bin.count; }));
    var maxX = result.histogram[result.histogram.length - 1].hi || 1;
    result.histogram.forEach(function (bin, i) {
      var x = plot.x + i / result.histogram.length * plot.w;
      var w = plot.w / result.histogram.length - 2;
      var h = bin.count / Math.max(1, maxBin) * plot.h;
      ctx.fillStyle = COLORS.error;
      ctx.globalAlpha = 0.82;
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
      ctx.globalAlpha = 1;
    });
    var boundX = plot.x + Math.min(1, result.bound / maxX) * plot.w;
    ctx.strokeStyle = COLORS.bound;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(boundX, plot.y);
    ctx.lineTo(boundX, plot.y + plot.h);
    ctx.stroke();
    label(ctx, "0", plot.x, plot.y + plot.h + 14, "center");
    label(ctx, formatCount(maxX), plot.x + plot.w, plot.y + plot.h + 14, "center");
    label(ctx, "epsilon*N bound " + formatCount(result.bound), plot.x, box.y + box.h - 13, "left", COLORS.bound, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "max " + formatCount(result.maxError), plot.x + plot.w, box.y + box.h - 13, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawGatePanel(ctx, result, box) {
    panelTitle(ctx, box, "Heavy-hitter gate", "reported keys sit above the estimated threshold");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 66, h: box.h - 88 };
    drawAxis(ctx, plot);
    var maxShare = Math.max(result.topEstimate[0].estimate, result.topTrue[0].count, result.thresholdCount) / result.params.streamLength * 1.12;
    function scale(value) {
      return plot.y + plot.h - value / result.params.streamLength / maxShare * plot.h;
    }
    var thresholdY = scale(result.thresholdCount);
    ctx.strokeStyle = COLORS.bound;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(plot.x, thresholdY);
    ctx.lineTo(plot.x + plot.w, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
    result.items.forEach(function (item) {
      var x = plot.x + (item.rank - 1) / Math.max(1, result.params.universe - 1) * plot.w;
      var y = scale(item.estimate);
      var isFalsePositive = item.estimate >= result.thresholdCount && item.count < result.thresholdCount;
      ctx.fillStyle = isFalsePositive ? COLORS.falsePositive : (item.count >= result.thresholdCount ? COLORS.heavy : "#94a3b8");
      ctx.globalAlpha = item.rank === result.params.probeRank ? 1 : 0.72;
      ctx.beginPath();
      ctx.arc(x, y, item.rank === result.params.probeRank ? 4 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    label(ctx, "rank 1", plot.x, plot.y + plot.h + 14, "left");
    label(ctx, "rank " + result.params.universe, plot.x + plot.w, plot.y + plot.h + 14, "right");
    label(ctx, "green true heavy, rust false positive", plot.x, box.y + box.h - 13, "left");
    label(ctx, "phi " + formatPercent(result.params.threshold * 100, 1), plot.x + plot.w, box.y + box.h - 13, "right", COLORS.bound);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 600;
    var height = compact ? 1080 : 700;
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
    var margin = compact ? 22 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawTopPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 246 });
      drawHeatmapPanel(ctx, result, { x: margin, y: 306, w: panelW, h: 230 });
      drawErrorPanel(ctx, result, { x: margin, y: 568, w: panelW, h: 212 });
      drawGatePanel(ctx, result, { x: margin, y: 812, w: panelW, h: 228 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawTopPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 302 });
      drawHeatmapPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 302 });
      drawErrorPanel(ctx, result, { x: margin, y: 382, w: panelW2, h: 258 });
      drawGatePanel(ctx, result, { x: margin + panelW2 + gap, y: 382, w: panelW2, h: 258 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      depth: String(result.params.depth),
      probeRank: String(result.params.probeRank),
      skew: result.params.skew.toFixed(2),
      streamLength: formatCount(result.params.streamLength),
      threshold: formatPercent(result.params.threshold * 100, 1),
      universe: String(result.params.universe),
      width: String(result.params.width)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var probeInput = root.querySelector('input[data-param="probeRank"]');
    if (probeInput) {
      probeInput.max = String(result.params.universe);
      if (Number(probeInput.value) > result.params.universe) probeInput.value = String(result.params.universe);
    }
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("memory", formatCount(result.memoryCells) + " counters"),
        metric("epsilon*N", formatCount(result.bound)),
        metric("p95 overcount", formatCount(result.p95Error)),
        metric("max overcount", formatCount(result.maxError)),
        metric("top-10 precision", formatPercent(result.topPrecision * 100, 0)),
        metric("false positives", String(result.falsePositives.length)),
        metric("probe " + result.probe.label, formatCount(result.probe.count) + " -> " + formatCount(result.probe.estimate)),
        metric("failure delta", formatNumber(result.delta, 4))
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
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-cms-lab]")).forEach(init);
  }

  var api = {
    bucketFor: bucketFor,
    cleanParams: cleanParams,
    simulate: simulate,
    zipfCounts: zipfCounts
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.CountMinSketchLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
