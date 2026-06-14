(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    pos: "#0f766e",
    neg: "#c2410c",
    auc: "#2563eb",
    pr: "#7c3aed",
    threshold: "#be123c",
    budget: "#64748b",
    loss: "#dc2626"
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

  function uniform(index, seed) {
    return (hash32((index + 1) | 0, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 1, seed));
    var u2 = uniform(index * 2 + 2, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    var ax = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * ax);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
    return sign * y;
  }

  function normalCdf(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }

  function normalPdf(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 3 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function formatPct(value, digits) {
    var places = digits == null ? 1 : digits;
    return (100 * value).toFixed(places) + "%";
  }

  function metric(label, value) {
    return '<div class="auc-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      actionRate: clamp(raw.actionRate == null ? 5 : Number(raw.actionRate), 1, 40) / 100,
      prevalence: clamp(raw.prevalence == null ? 5 : Number(raw.prevalence), 1, 50) / 100,
      separation: clamp(raw.separation == null ? 140 : Number(raw.separation), 0, 300) / 100,
      threshold: clamp(raw.threshold == null ? 140 : Number(raw.threshold), -250, 400) / 100
    };
  }

  function rates(params, threshold) {
    var tpr = 1 - normalCdf(threshold - params.separation);
    var fpr = 1 - normalCdf(threshold);
    var predicted = params.prevalence * tpr + (1 - params.prevalence) * fpr;
    var precision = predicted > 0 ? params.prevalence * tpr / predicted : 1;
    var falsePerHit = params.prevalence * tpr > 0 ? (1 - params.prevalence) * fpr / (params.prevalence * tpr) : Infinity;
    var accuracy = params.prevalence * tpr + (1 - params.prevalence) * (1 - fpr);
    return {
      accuracy: accuracy,
      actionRate: predicted,
      falsePerHit: falsePerHit,
      fpr: fpr,
      precision: precision,
      recall: tpr,
      threshold: threshold,
      tpr: tpr
    };
  }

  function thresholdForActionRate(params, actionRate) {
    var low = -5;
    var high = params.separation + 5;
    for (var i = 0; i < 70; i += 1) {
      var mid = (low + high) / 2;
      if (rates(params, mid).actionRate > actionRate) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  function makeCurves(params) {
    var rows = [];
    var hi = params.separation + 5;
    var lo = -5;
    for (var i = 0; i <= 160; i += 1) {
      var t = hi - (hi - lo) * i / 160;
      rows.push(rates(params, t));
    }
    var ap = 0;
    var previousRecall = 0;
    rows.forEach(function (row) {
      var delta = Math.max(0, row.recall - previousRecall);
      ap += row.precision * delta;
      previousRecall = row.recall;
    });
    return { ap: ap, rows: rows };
  }

  function makePairGrid(params) {
    var positives = [];
    var negatives = [];
    for (var i = 0; i < 22; i += 1) {
      positives.push(params.separation + normal(i, 0xA0C));
      negatives.push(normal(i, 0xBEE));
    }
    positives.sort(function (a, b) { return b - a; });
    negatives.sort(function (a, b) { return b - a; });
    var wins = 0;
    var ties = 0;
    positives.forEach(function (p) {
      negatives.forEach(function (n) {
        if (p > n) wins += 1;
        else if (p === n) ties += 1;
      });
    });
    return {
      negatives: negatives,
      positives: positives,
      sampleAuc: (wins + 0.5 * ties) / (positives.length * negatives.length)
    };
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var auc = normalCdf(params.separation / Math.SQRT2);
    var threshold = rates(params, params.threshold);
    var budgetThreshold = thresholdForActionRate(params, params.actionRate);
    var budget = rates(params, budgetThreshold);
    var curves = makeCurves(params);
    return {
      auc: auc,
      budget: budget,
      curves: curves.rows,
      averagePrecision: curves.ap,
      pairGrid: makePairGrid(params),
      params: params,
      threshold: threshold
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

  function drawDistributions(ctx, result, box) {
    panelTitle(ctx, box, "Score distributions", "same ranking can feed very different action rules");
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 62, h: box.h - 88 };
    drawAxis(ctx, plot);
    var minX = -4;
    var maxX = Math.max(4, result.params.separation + 4);
    var maxY = Math.max(normalPdf(0), normalPdf(0));
    function xScale(x) { return plot.x + (x - minX) / (maxX - minX) * plot.w; }
    function yScale(y) { return plot.y + plot.h - y / maxY * plot.h * 0.88; }
    [
      { mean: 0, color: COLORS.neg, label: "negative" },
      { mean: result.params.separation, color: COLORS.pos, label: "positive" }
    ].forEach(function (dist) {
      ctx.strokeStyle = dist.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i = 0; i <= 120; i += 1) {
        var x = minX + (maxX - minX) * i / 120;
        var y = normalPdf(x - dist.mean);
        var px = xScale(x);
        var py = yScale(y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    [
      { threshold: result.threshold.threshold, color: COLORS.threshold, text: "threshold" },
      { threshold: result.budget.threshold, color: COLORS.budget, text: "budget cut" }
    ].forEach(function (line) {
      var x = xScale(line.threshold);
      ctx.strokeStyle = line.color;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      label(ctx, line.text, x + 4, plot.y + 12, "left", line.color);
    });
    label(ctx, "negative score density", plot.x, box.y + box.h - 13, "left", COLORS.neg);
    label(ctx, "positive score density", plot.x + plot.w, box.y + box.h - 13, "right", COLORS.pos);
  }

  function drawRoc(ctx, result, box) {
    panelTitle(ctx, box, "ROC curve", "AUC is the average pairwise win probability");
    var plot = { x: box.x + 44, y: box.y + 54, w: box.w - 68, h: box.h - 88 };
    drawAxis(ctx, plot);
    function xScale(x) { return plot.x + x * plot.w; }
    function yScale(y) { return plot.y + plot.h - y * plot.h; }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(0));
    ctx.lineTo(xScale(1), yScale(1));
    ctx.stroke();
    ctx.strokeStyle = COLORS.auc;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    result.curves.forEach(function (row, i) {
      var x = xScale(row.fpr);
      var y = yScale(row.tpr);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    [
      { row: result.threshold, color: COLORS.threshold },
      { row: result.budget, color: COLORS.budget }
    ].forEach(function (point) {
      ctx.fillStyle = point.color;
      ctx.beginPath();
      ctx.arc(xScale(point.row.fpr), yScale(point.row.tpr), 4.5, 0, Math.PI * 2);
      ctx.fill();
    });
    label(ctx, "FPR", plot.x + plot.w, plot.y + plot.h + 15, "right");
    label(ctx, "TPR", plot.x - 9, plot.y, "right");
    label(ctx, "AUC " + formatNumber(result.auc, 3), plot.x, box.y + box.h - 13, "left", COLORS.auc, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "red threshold, gray budget", plot.x + plot.w, box.y + box.h - 13, "right");
  }

  function drawPr(ctx, result, box) {
    panelTitle(ctx, box, "Precision-recall curve", "prevalence enters after the ranking is scored");
    var plot = { x: box.x + 44, y: box.y + 54, w: box.w - 68, h: box.h - 88 };
    drawAxis(ctx, plot);
    function xScale(x) { return plot.x + x * plot.w; }
    function yScale(y) { return plot.y + plot.h - y * plot.h; }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(result.params.prevalence));
    ctx.lineTo(xScale(1), yScale(result.params.prevalence));
    ctx.stroke();
    ctx.strokeStyle = COLORS.pr;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    result.curves.forEach(function (row, i) {
      var x = xScale(row.recall);
      var y = yScale(row.precision);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    [
      { row: result.threshold, color: COLORS.threshold },
      { row: result.budget, color: COLORS.budget }
    ].forEach(function (point) {
      ctx.fillStyle = point.color;
      ctx.beginPath();
      ctx.arc(xScale(point.row.recall), yScale(point.row.precision), 4.5, 0, Math.PI * 2);
      ctx.fill();
    });
    label(ctx, "recall", plot.x + plot.w, plot.y + plot.h + 15, "right");
    label(ctx, "precision", plot.x - 9, plot.y, "right");
    label(ctx, "AP " + formatNumber(result.averagePrecision, 3), plot.x, box.y + box.h - 13, "left", COLORS.pr, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "baseline " + formatPct(result.params.prevalence, 0), plot.x + plot.w, box.y + box.h - 13, "right");
  }

  function drawPairGrid(ctx, result, box) {
    panelTitle(ctx, box, "Pairwise ledger", "each cell asks whether one positive outranks one negative");
    var positives = result.pairGrid.positives;
    var negatives = result.pairGrid.negatives;
    var n = positives.length;
    var size = Math.min((box.w - 60) / n, (box.h - 82) / n);
    var left = box.x + 44;
    var top = box.y + 54;
    for (var r = 0; r < n; r += 1) {
      for (var c = 0; c < n; c += 1) {
        var win = positives[r] > negatives[c];
        ctx.fillStyle = win ? "rgba(37, 99, 235, 0.75)" : "rgba(220, 38, 38, 0.56)";
        ctx.fillRect(left + c * size, top + r * size, Math.max(1, size - 1), Math.max(1, size - 1));
      }
    }
    label(ctx, "negative sample rank", left + n * size, top + n * size + 15, "right");
    label(ctx, "positive", left - 8, top, "right");
    label(ctx, "sample pair win rate " + formatNumber(result.pairGrid.sampleAuc, 3), box.x, box.y + box.h - 13, "left", COLORS.auc, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "blue win, red inversion", box.x + box.w, box.y + box.h - 13, "right");
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
      drawDistributions(ctx, result, { x: margin, y: 28, w: panelW, h: 244 });
      drawRoc(ctx, result, { x: margin, y: 306, w: panelW, h: 230 });
      drawPr(ctx, result, { x: margin, y: 570, w: panelW, h: 230 });
      drawPairGrid(ctx, result, { x: margin, y: 834, w: panelW, h: 206 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawDistributions(ctx, result, { x: margin, y: 30, w: panelW2, h: 302 });
      drawRoc(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 302 });
      drawPr(ctx, result, { x: margin, y: 382, w: panelW2, h: 258 });
      drawPairGrid(ctx, result, { x: margin + panelW2 + gap, y: 382, w: panelW2, h: 258 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      actionRate: formatPct(result.params.actionRate, 0),
      prevalence: formatPct(result.params.prevalence, 0),
      separation: result.params.separation.toFixed(2),
      threshold: result.params.threshold.toFixed(2)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("AUC", formatNumber(result.auc, 3)),
        metric("average precision", formatNumber(result.averagePrecision, 3)),
        metric("threshold precision", formatPct(result.threshold.precision, 1)),
        metric("threshold recall", formatPct(result.threshold.recall, 1)),
        metric("threshold FPR", formatPct(result.threshold.fpr, 1)),
        metric("budget precision", formatPct(result.budget.precision, 1)),
        metric("budget recall", formatPct(result.budget.recall, 1)),
        metric("false per hit", formatNumber(result.threshold.falsePerHit, 2))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-auc-lab]")).forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    normalCdf: normalCdf,
    rates: rates,
    simulate: simulate,
    thresholdForActionRate: thresholdForActionRate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.AucPairwiseLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
