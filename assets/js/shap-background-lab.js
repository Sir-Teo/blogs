(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    x1: "#0f766e",
    x2: "#c2410c",
    interventional: "#2563eb",
    conditional: "#7c3aed",
    baseline: "#64748b",
    point: "#be123c"
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
    var u1 = Math.max(1e-12, uniform(index * 2 + 3, seed));
    var u2 = uniform(index * 2 + 4, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="shap-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      beta1: clamp(raw.beta1 == null ? 140 : Number(raw.beta1), -250, 250) / 100,
      beta2: clamp(raw.beta2 == null ? 0 : Number(raw.beta2), -250, 250) / 100,
      gamma: clamp(raw.gamma == null ? 0 : Number(raw.gamma), -200, 200) / 100,
      rho: clamp(raw.rho == null ? 75 : Number(raw.rho), -90, 90) / 100,
      x1: clamp(raw.x1 == null ? 120 : Number(raw.x1), -250, 250) / 100,
      x2: clamp(raw.x2 == null ? 110 : Number(raw.x2), -250, 250) / 100
    };
  }

  function predict(params, x1, x2) {
    return params.beta1 * x1 + params.beta2 * x2 + params.gamma * x1 * x2;
  }

  function coalitionValues(params, rhoOverride) {
    var rho = rhoOverride == null ? params.rho : rhoOverride;
    var x1 = params.x1;
    var x2 = params.x2;
    var f12 = predict(params, x1, x2);
    return {
      conditional: {
        both: f12,
        empty: params.gamma * rho,
        x1: params.beta1 * x1 + params.beta2 * rho * x1 + params.gamma * rho * x1 * x1,
        x2: params.beta1 * rho * x2 + params.beta2 * x2 + params.gamma * rho * x2 * x2
      },
      interventional: {
        both: f12,
        empty: params.gamma * rho,
        x1: params.beta1 * x1,
        x2: params.beta2 * x2
      }
    };
  }

  function shapley(values) {
    var phi1 = 0.5 * ((values.x1 - values.empty) + (values.both - values.x2));
    var phi2 = 0.5 * ((values.x2 - values.empty) + (values.both - values.x1));
    return {
      base: values.empty,
      gap: values.both - values.empty - phi1 - phi2,
      phi1: phi1,
      phi2: phi2,
      prediction: values.both
    };
  }

  function sampleBackground(params, count) {
    var rows = [];
    var scale = Math.sqrt(Math.max(0, 1 - params.rho * params.rho));
    for (var i = 0; i < count; i += 1) {
      var z1 = normal(i * 3 + 1, 0x5151);
      var z2 = normal(i * 3 + 2, 0x91e10);
      rows.push({ x1: z1, x2: params.rho * z1 + scale * z2 });
    }
    return rows;
  }

  function sweep(params) {
    var rows = [];
    for (var i = 0; i <= 36; i += 1) {
      var rho = -0.9 + 1.8 * i / 36;
      var values = coalitionValues(params, rho);
      rows.push({
        conditional: shapley(values.conditional),
        interventional: shapley(values.interventional),
        rho: rho
      });
    }
    return rows;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var values = coalitionValues(params);
    var interventional = shapley(values.interventional);
    var conditional = shapley(values.conditional);
    return {
      background: sampleBackground(params, 180),
      conditional: conditional,
      directX2: params.beta2 * params.x2,
      interventional: interventional,
      params: params,
      proxyCredit: conditional.phi2 - interventional.phi2,
      sweep: sweep(params),
      values: values
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

  function drawBackgroundPanel(ctx, result, box) {
    panelTitle(ctx, box, "Background distribution", "conditional explanations stay on the ellipse");
    var plot = { x: box.x + 44, y: box.y + 52, w: box.w - 64, h: box.h - 86 };
    drawAxis(ctx, plot);
    function xScale(x) { return plot.x + (x + 3) / 6 * plot.w; }
    function yScale(y) { return plot.y + plot.h - (y + 3) / 6 * plot.h; }
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    [-2, -1, 0, 1, 2].forEach(function (tick) {
      var x = xScale(tick);
      var y = yScale(tick);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    result.background.forEach(function (row) {
      var x = xScale(row.x1);
      var y = yScale(row.x2);
      if (x < plot.x || x > plot.x + plot.w || y < plot.y || y > plot.y + plot.h) return;
      ctx.fillStyle = "rgba(15, 118, 110, 0.18)";
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = COLORS.conditional;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i <= 80; i += 1) {
      var x1 = -3 + 6 * i / 80;
      var x = xScale(x1);
      var y = yScale(result.params.rho * x1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    var px = xScale(result.params.x1);
    var py = yScale(result.params.x2);
    ctx.fillStyle = COLORS.point;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    label(ctx, "x1", plot.x + plot.w, plot.y + plot.h + 16, "right");
    label(ctx, "x2", plot.x - 10, plot.y, "right");
    label(ctx, "rho = " + result.params.rho.toFixed(2), plot.x, box.y + box.h - 13, "left", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "violet line is E[x2 | x1]", plot.x + plot.w, box.y + box.h - 13, "right", COLORS.conditional);
  }

  function drawAttributionPanel(ctx, result, box) {
    panelTitle(ctx, box, "Two explanations", "both add to f(x) minus baseline, but use different games");
    var rows = [
      { label: "interventional x1", value: result.interventional.phi1, color: COLORS.x1 },
      { label: "interventional x2", value: result.interventional.phi2, color: COLORS.x2 },
      { label: "conditional x1", value: result.conditional.phi1, color: COLORS.x1 },
      { label: "conditional x2", value: result.conditional.phi2, color: COLORS.x2 }
    ];
    var maxAbs = Math.max(0.25, Math.max.apply(null, rows.map(function (row) { return Math.abs(row.value); })));
    var plot = { x: box.x + 104, y: box.y + 54, w: box.w - 146, h: box.h - 86 };
    var zero = plot.x + plot.w / 2;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(zero, plot.y);
    ctx.lineTo(zero, plot.y + plot.h);
    ctx.stroke();
    var rowH = plot.h / rows.length;
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowH + rowH * 0.24;
      var w = Math.abs(row.value) / maxAbs * (plot.w / 2);
      var x = row.value >= 0 ? zero : zero - w;
      ctx.fillStyle = row.color;
      ctx.globalAlpha = i < 2 ? 0.72 : 0.98;
      ctx.fillRect(x, y, w, rowH * 0.46);
      ctx.globalAlpha = 1;
      label(ctx, row.label, plot.x - 8, y + rowH * 0.23, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, formatNumber(row.value, 2), row.value >= 0 ? x + w + 5 : x - 5, y + rowH * 0.23, row.value >= 0 ? "left" : "right", COLORS.text);
    });
    label(ctx, "transparent = interventional, solid = conditional", plot.x, box.y + box.h - 13, "left");
    label(ctx, "prediction " + formatNumber(result.interventional.prediction, 2), plot.x + plot.w, box.y + box.h - 13, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Coalition ledger", "what the model is worth when only some features are known");
    var rows = [
      ["empty", result.values.interventional.empty, result.values.conditional.empty],
      ["x1 known", result.values.interventional.x1, result.values.conditional.x1],
      ["x2 known", result.values.interventional.x2, result.values.conditional.x2],
      ["both", result.values.interventional.both, result.values.conditional.both],
      ["phi x1", result.interventional.phi1, result.conditional.phi1],
      ["phi x2", result.interventional.phi2, result.conditional.phi2],
      ["efficiency gap", result.interventional.gap, result.conditional.gap]
    ];
    var start = box.y + 55;
    var rowH = Math.min(26, Math.max(19, (box.h - 76) / rows.length));
    label(ctx, "intervene", box.x + box.w * 0.62, box.y + 43, "right", COLORS.interventional, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "condition", box.x + box.w - 4, box.y + 43, "right", COLORS.conditional, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    rows.forEach(function (row, i) {
      var y = start + i * rowH;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.24)" : "transparent";
      ctx.fillRect(box.x, y - 2, box.w, rowH);
      label(ctx, row[0], box.x + 4, y + rowH / 2, "left");
      label(ctx, formatNumber(row[1], 3), box.x + box.w * 0.62, y + rowH / 2, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, formatNumber(row[2], 3), box.x + box.w - 4, y + rowH / 2, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
  }

  function drawSweepPanel(ctx, result, box) {
    panelTitle(ctx, box, "Correlation sweep", "x2 can receive proxy credit without a direct x2 term");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 66, h: box.h - 88 };
    drawAxis(ctx, plot);
    var values = [];
    result.sweep.forEach(function (row) {
      values.push(row.interventional.phi2, row.conditional.phi2);
    });
    var maxAbs = Math.max(0.25, Math.max.apply(null, values.map(Math.abs))) * 1.15;
    function xScale(rho) { return plot.x + (rho + 0.9) / 1.8 * plot.w; }
    function yScale(value) { return plot.y + plot.h / 2 - value / maxAbs * plot.h / 2; }
    var zeroY = yScale(0);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, zeroY);
    ctx.lineTo(plot.x + plot.w, zeroY);
    ctx.stroke();
    [
      { key: "interventional", color: COLORS.interventional, width: 2 },
      { key: "conditional", color: COLORS.conditional, width: 2.4 }
    ].forEach(function (line) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.beginPath();
      result.sweep.forEach(function (row, i) {
        var x = xScale(row.rho);
        var y = yScale(row[line.key].phi2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    var currentX = xScale(result.params.rho);
    ctx.strokeStyle = COLORS.point;
    ctx.beginPath();
    ctx.moveTo(currentX, plot.y);
    ctx.lineTo(currentX, plot.y + plot.h);
    ctx.stroke();
    label(ctx, "-0.9", plot.x, plot.y + plot.h + 15, "left");
    label(ctx, "0.9", plot.x + plot.w, plot.y + plot.h + 15, "right");
    label(ctx, "x2 attribution: blue intervene, violet condition", plot.x, box.y + box.h - 13, "left");
    label(ctx, "current rho", plot.x + plot.w, box.y + box.h - 13, "right", COLORS.point);
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
      drawBackgroundPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 248 });
      drawAttributionPanel(ctx, result, { x: margin, y: 308, w: panelW, h: 230 });
      drawLedgerPanel(ctx, result, { x: margin, y: 570, w: panelW, h: 230 });
      drawSweepPanel(ctx, result, { x: margin, y: 832, w: panelW, h: 210 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawBackgroundPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 302 });
      drawAttributionPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 302 });
      drawLedgerPanel(ctx, result, { x: margin, y: 382, w: panelW2, h: 258 });
      drawSweepPanel(ctx, result, { x: margin + panelW2 + gap, y: 382, w: panelW2, h: 258 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      beta1: result.params.beta1.toFixed(2),
      beta2: result.params.beta2.toFixed(2),
      gamma: result.params.gamma.toFixed(2),
      rho: result.params.rho.toFixed(2),
      x1: result.params.x1.toFixed(2),
      x2: result.params.x2.toFixed(2)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("prediction", formatNumber(result.interventional.prediction, 3)),
        metric("baseline", formatNumber(result.interventional.base, 3)),
        metric("interventional x2", formatNumber(result.interventional.phi2, 3)),
        metric("conditional x2", formatNumber(result.conditional.phi2, 3)),
        metric("proxy credit", formatNumber(result.proxyCredit, 3)),
        metric("linear x2 term", formatNumber(result.directX2, 3)),
        metric("intervention gap", formatNumber(result.interventional.gap, 3)),
        metric("condition gap", formatNumber(result.conditional.gap, 3))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-shap-lab]")).forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    coalitionValues: coalitionValues,
    shapley: shapley,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ShapBackgroundLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
