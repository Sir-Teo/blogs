(function (global) {
  "use strict";

  var COLORS = {
    bit: "#0f766e",
    empty: "#edf2f7",
    current: "#2563eb",
    optimal: "#7c3aed",
    falsePositive: "#be123c",
    truePositive: "#0f766e",
    trueNegative: "#64748b",
    memory: "#b45309",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (value >= 10) return value.toFixed(1) + "%";
    if (value >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function metric(label, value) {
    return '<div class="bloom-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function positions(value, k, m, salt) {
    var h1 = hash32(value, 0x9e3779b9 ^ salt);
    var h2 = hash32(value, 0x85ebca6b ^ salt) | 1;
    var out = [];
    for (var i = 0; i < k; i += 1) {
      out.push(((h1 + Math.imul(i, h2)) >>> 0) % m);
    }
    return out;
  }

  function theoreticalFpr(n, m, k) {
    if (m <= 0 || k <= 0) return 1;
    return Math.pow(1 - Math.exp(-k * n / m), k);
  }

  function exactZeroProbability(n, m, k) {
    if (m <= 0) return 0;
    return Math.pow(1 - 1 / m, k * n);
  }

  function optimalK(bitsPerItem) {
    return Math.max(1, bitsPerItem * Math.LN2);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function buildFilter(params) {
    var n = params.items;
    var bitsPerItem = params.bitsPerItem;
    var m = Math.max(8, Math.round(n * bitsPerItem));
    var k = params.hashes;
    var bits = new Uint8Array(m);
    var salt = 20260613 + n * 17 + k * 31 + Math.round(bitsPerItem * 100);
    var set = Object.create(null);
    var duplicatePasses = params.duplicatePasses;

    for (var pass = 0; pass < duplicatePasses; pass += 1) {
      for (var i = 0; i < n; i += 1) {
        var key = i + 1;
        set[key] = true;
        var pos = positions(key, k, m, salt);
        for (var j = 0; j < pos.length; j += 1) bits[pos[j]] = 1;
      }
    }

    var ones = 0;
    for (var b = 0; b < bits.length; b += 1) ones += bits[b];
    return { bits: bits, m: m, n: n, k: k, salt: salt, set: set, ones: ones };
  }

  function query(filter, value) {
    var pos = positions(value, filter.k, filter.m, filter.salt);
    for (var i = 0; i < pos.length; i += 1) {
      if (!filter.bits[pos[i]]) return false;
    }
    return true;
  }

  function simulate(params) {
    var filter = buildFilter(params);
    var absentQueries = params.queries;
    var presentQueries = Math.round(absentQueries * params.presentShare / 100);
    var falsePositives = 0;
    var trueNegatives = 0;
    var truePositives = 0;
    var falseNegatives = 0;
    var absentBase = 1000000007;

    for (var i = 0; i < absentQueries; i += 1) {
      var absent = absentBase + i * 17;
      if (query(filter, absent)) falsePositives += 1;
      else trueNegatives += 1;
    }
    for (var j = 0; j < presentQueries; j += 1) {
      var present = 1 + (j * 37) % filter.n;
      if (query(filter, present)) truePositives += 1;
      else falseNegatives += 1;
    }

    var occupancy = filter.ones / filter.m;
    var empiricalFpr = absentQueries ? falsePositives / absentQueries : 0;
    var theory = theoreticalFpr(filter.n, filter.m, filter.k);
    var exactOccupancy = 1 - exactZeroProbability(filter.n, filter.m, filter.k);
    var optK = optimalK(params.bitsPerItem);
    var optFpr = theoreticalFpr(filter.n, filter.m, Math.max(1, Math.round(optK)));
    var exactBytes = filter.n * params.keyBytes;
    var filterBytes = filter.m / 8;

    return {
      absentQueries: absentQueries,
      empiricalFpr: empiricalFpr,
      exactBytes: exactBytes,
      exactOccupancy: exactOccupancy,
      falseNegatives: falseNegatives,
      falsePositives: falsePositives,
      filter: filter,
      filterBytes: filterBytes,
      occupancy: occupancy,
      optFpr: optFpr,
      optK: optK,
      params: params,
      presentQueries: presentQueries,
      theoryFpr: theory,
      trueNegatives: trueNegatives,
      truePositives: truePositives
    };
  }

  function fprCurve(params, n, m) {
    var out = [];
    for (var k = 1; k <= 18; k += 1) {
      out.push({ k: k, fpr: theoreticalFpr(n, m, k) });
    }
    return out;
  }

  function saturationCurve(params) {
    var out = [];
    var m = Math.round(params.items * params.bitsPerItem);
    for (var step = 0; step <= 24; step += 1) {
      var n = Math.max(1, Math.round(params.items * step / 24));
      var occupancy = 1 - exactZeroProbability(n, m, params.hashes);
      var fpr = theoreticalFpr(n, m, params.hashes);
      out.push({ n: n, occupancy: occupancy, fpr: fpr });
    }
    return out;
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function drawAxis(ctx, box) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();
  }

  function drawBitPanel(ctx, result, box) {
    panelTitle(ctx, box, "Bit array", "sampled view of the filter state");
    var plot = { x: box.x, y: box.y + 42, w: box.w, h: box.h - 54 };
    var cols = 40;
    var rows = 18;
    var cell = Math.min(plot.w / cols, plot.h / rows);
    var startX = plot.x + (plot.w - cols * cell) / 2;
    var startY = plot.y;
    var bits = result.filter.bits;
    var stride = Math.max(1, Math.floor(bits.length / (cols * rows)));
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var sample = (r * cols + c) * stride;
        ctx.fillStyle = bits[sample] ? COLORS.bit : COLORS.empty;
        ctx.fillRect(startX + c * cell, startY + r * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
      }
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(formatPercent(result.occupancy * 100), plot.x, plot.y + plot.h - 26);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("bits set; formula predicts " + formatPercent(result.exactOccupancy * 100), plot.x + 90, plot.y + plot.h - 20);
  }

  function drawCurvePanel(ctx, result, box) {
    panelTitle(ctx, box, "Hash probes", "too few leave zeros; too many oversaturate");
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 56, h: box.h - 72 };
    var curve = fprCurve(result.params, result.filter.n, result.filter.m);
    var maxFpr = Math.max.apply(null, curve.map(function (point) { return point.fpr; }).concat([result.empiricalFpr, 0.001]));
    maxFpr *= 1.2;
    drawAxis(ctx, plot);
    [0, 0.5, 1].forEach(function (tick) {
      var y = plot.y + plot.h - tick * plot.h;
      ctx.strokeStyle = COLORS.empty;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(formatPercent(maxFpr * tick * 100), plot.x - 8, y + 4);
    });
    function xScale(k) {
      return plot.x + (k - 1) / 17 * plot.w;
    }
    function yScale(fpr) {
      return plot.y + plot.h - clamp(fpr / maxFpr, 0, 1) * plot.h;
    }
    ctx.strokeStyle = COLORS.current;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    curve.forEach(function (point, index) {
      var x = xScale(point.k);
      var y = yScale(point.fpr);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    var currentX = xScale(result.filter.k);
    var currentY = yScale(result.theoryFpr);
    ctx.fillStyle = COLORS.falsePositive;
    ctx.beginPath();
    ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
    ctx.fill();

    var optX = xScale(result.optK);
    ctx.strokeStyle = COLORS.optimal;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(optX, plot.y);
    ctx.lineTo(optX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    [1, 6, 12, 18].forEach(function (k) {
      ctx.fillText(String(k), xScale(k), plot.y + plot.h + 12);
    });
    ctx.textAlign = "left";
    ctx.fillText("optimal k approx " + formatNumber(result.optK), plot.x + plot.w - 116, plot.y + 12);
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Query ledger", "Bloom filters have no false negatives for inserted keys");
    var plot = { x: box.x, y: box.y + 48, w: box.w, h: box.h - 58 };
    var rows = [
      { label: "true positives", value: result.truePositives, color: COLORS.truePositive },
      { label: "false positives", value: result.falsePositives, color: COLORS.falsePositive },
      { label: "true negatives", value: result.trueNegatives, color: COLORS.trueNegative },
      { label: "false negatives", value: result.falseNegatives, color: COLORS.memory }
    ];
    var maxValue = Math.max.apply(null, rows.map(function (row) { return row.value; }).concat([1]));
    rows.forEach(function (row, index) {
      var y = plot.y + index * 34;
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, plot.x, y + 11);
      ctx.fillStyle = COLORS.empty;
      ctx.fillRect(plot.x + 110, y, plot.w - 160, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 110, y, (plot.w - 160) * row.value / maxValue, 18);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(row.value.toLocaleString(), plot.x + plot.w, y + 12);
      ctx.textAlign = "left";
    });
  }

  function drawSaturationPanel(ctx, result, box) {
    panelTitle(ctx, box, "Saturation", "as inserts rise, the bit array loses discriminating power");
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 56, h: box.h - 72 };
    var curve = saturationCurve(result.params);
    var maxFpr = Math.max.apply(null, curve.map(function (point) { return point.fpr; }).concat([0.001]));
    drawAxis(ctx, plot);
    function xScale(n) {
      return plot.x + n / result.params.items * plot.w;
    }
    function yScale(value) {
      return plot.y + plot.h - clamp(value, 0, 1) * plot.h;
    }

    ctx.strokeStyle = COLORS.bit;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    curve.forEach(function (point, index) {
      var x = xScale(point.n);
      var y = yScale(point.occupancy);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = COLORS.falsePositive;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    curve.forEach(function (point, index) {
      var x = xScale(point.n);
      var y = yScale(maxFpr ? point.fpr / maxFpr : 0);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("occupancy", plot.x - 8, plot.y + 10);
    ctx.textAlign = "left";
    ctx.fillText("FPR scaled to max " + formatPercent(maxFpr * 100), plot.x + 8, plot.y + 10);
    ctx.textAlign = "center";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(formatNumber(result.params.items * tick), plot.x + plot.w * tick, plot.y + plot.h + 12);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 880 : 650;
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

    var margin = compact ? 24 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawBitPanel(ctx, result, { x: margin, y: 26, w: panelW, h: 232 });
      drawCurvePanel(ctx, result, { x: margin, y: 286, w: panelW, h: 214 });
      drawLedgerPanel(ctx, result, { x: margin, y: 534, w: panelW, h: 154 });
      drawSaturationPanel(ctx, result, { x: margin, y: 718, w: panelW, h: 134 });
    } else {
      var gap = 42;
      var topW = (width - margin * 2 - gap) / 2;
      drawBitPanel(ctx, result, { x: margin, y: 28, w: topW, h: 290 });
      drawCurvePanel(ctx, result, { x: margin + topW + gap, y: 28, w: topW, h: 290 });
      drawLedgerPanel(ctx, result, { x: margin, y: 366, w: topW, h: 220 });
      drawSaturationPanel(ctx, result, { x: margin + topW + gap, y: 366, w: topW, h: 220 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var values = {
      bitsPerItem: formatNumber(params.bitsPerItem),
      duplicatePasses: params.duplicatePasses + "x",
      hashes: String(params.hashes),
      items: params.items.toLocaleString(),
      keyBytes: params.keyBytes + " B",
      presentShare: formatPercent(params.presentShare),
      queries: params.queries.toLocaleString()
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Empirical FPR", formatPercent(result.empiricalFpr * 100)),
        metric("Formula FPR", formatPercent(result.theoryFpr * 100)),
        metric("Bits set", formatPercent(result.occupancy * 100)),
        metric("Optimal k", formatNumber(result.optK)),
        metric("Filter memory", formatNumber(result.filterBytes / 1024) + " KiB"),
        metric("Exact keys", formatNumber(result.exactBytes / 1024) + " KiB")
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-bloom-lab]")).forEach(init);
  }

  var api = {
    optimalK: optimalK,
    positions: positions,
    simulate: simulate,
    theoreticalFpr: theoreticalFpr
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.BloomFilterLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
