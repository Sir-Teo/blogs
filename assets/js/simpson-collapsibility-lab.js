(function (global) {
  "use strict";

  var COLORS = {
    treatment: "#2563eb",
    control: "#be123c",
    balanced: "#0f766e",
    conditional: "#7c3aed",
    marginal: "#d97706",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    band: "#eef2ff"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function odds(p) {
    return p / Math.max(1e-9, 1 - p);
  }

  function probFromOdds(o) {
    return o / (1 + o);
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) < 1e-12) return "0.0%";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function formatPoints(value) {
    if (!isFinite(value)) return "n/a";
    return (value >= 0 ? "+" : "") + (value * 100).toFixed(1) + " pp";
  }

  function metric(label, value) {
    return '<div class="simpson-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function cleanParams(params) {
    var base = clamp(params.baseRate, 10, 90) / 100;
    var requestedGap = clamp(params.stratumGap, 0, 86) / 100;
    var maxGap = Math.max(0, 2 * Math.min(base - 0.03, 0.97 - base));
    return {
      baseRate: base,
      mixSkew: clamp(params.mixSkew, -90, 90) / 100,
      n: clamp(Math.round(params.n), 400, 8000),
      oddsRatio: clamp(params.oddsRatio, 105, 500) / 100,
      stratumGap: Math.min(requestedGap, maxGap)
    };
  }

  function stateAt(params, mixSkew, stratumGap) {
    var gap = typeof stratumGap === "number" ? stratumGap : params.stratumGap;
    var p0Easy = clamp(params.baseRate + gap / 2, 0.01, 0.99);
    var p0Hard = clamp(params.baseRate - gap / 2, 0.01, 0.99);
    var p1Easy = probFromOdds(params.oddsRatio * odds(p0Easy));
    var p1Hard = probFromOdds(params.oddsRatio * odds(p0Hard));
    var treatedHard = clamp(0.5 + mixSkew / 2, 0.02, 0.98);
    var controlHard = clamp(0.5 - mixSkew / 2, 0.02, 0.98);
    var treatedEasy = 1 - treatedHard;
    var controlEasy = 1 - controlHard;
    var treatedRate = treatedEasy * p1Easy + treatedHard * p1Hard;
    var controlRate = controlEasy * p0Easy + controlHard * p0Hard;
    var balancedTreatment = 0.5 * p1Easy + 0.5 * p1Hard;
    var balancedControl = 0.5 * p0Easy + 0.5 * p0Hard;
    var marginalOR = odds(treatedRate) / odds(controlRate);
    var balancedOR = odds(balancedTreatment) / odds(balancedControl);
    return {
      balancedControl: balancedControl,
      balancedOR: balancedOR,
      balancedRD: balancedTreatment - balancedControl,
      balancedTreatment: balancedTreatment,
      controlEasy: controlEasy,
      controlHard: controlHard,
      controlRate: controlRate,
      hardRD: p1Hard - p0Hard,
      marginalOR: marginalOR,
      marginalRD: treatedRate - controlRate,
      marginalRR: treatedRate / Math.max(1e-9, controlRate),
      p0Easy: p0Easy,
      p0Hard: p0Hard,
      p1Easy: p1Easy,
      p1Hard: p1Hard,
      reversal: treatedRate < controlRate && p1Easy > p0Easy && p1Hard > p0Hard,
      treatedEasy: treatedEasy,
      treatedHard: treatedHard,
      treatedRate: treatedRate
    };
  }

  function makeCells(params, state) {
    var perArm = params.n / 2;
    var cells = [
      { arm: "control", stratum: "easy", n: perArm * state.controlEasy, p: state.p0Easy },
      { arm: "control", stratum: "hard", n: perArm * state.controlHard, p: state.p0Hard },
      { arm: "treatment", stratum: "easy", n: perArm * state.treatedEasy, p: state.p1Easy },
      { arm: "treatment", stratum: "hard", n: perArm * state.treatedHard, p: state.p1Hard }
    ];
    cells.forEach(function (cell) {
      cell.success = cell.n * cell.p;
      cell.failure = cell.n - cell.success;
    });
    return cells;
  }

  function mixCurve(params) {
    var rows = [];
    for (var i = -90; i <= 90; i += 3) {
      var mix = i / 100;
      var state = stateAt(params, mix);
      rows.push({ mix: mix, marginalOR: state.marginalOR, marginalRD: state.marginalRD });
    }
    return rows;
  }

  function gapCurve(params) {
    var rows = [];
    var maxGap = Math.max(params.stratumGap, 0.02);
    for (var i = 0; i <= 40; i += 1) {
      var gap = maxGap * i / 40;
      var state = stateAt(params, 0, gap);
      rows.push({ balancedOR: state.balancedOR, gap: gap });
    }
    return rows;
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var state = stateAt(clean, clean.mixSkew);
    return {
      cells: makeCells(clean, state),
      gapCurve: gapCurve(clean),
      mixCurve: mixCurve(clean),
      params: clean,
      state: state
    };
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

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawRatePanel(ctx, result, box) {
    panelTitle(ctx, box, "Rates by stratum", "both strata improve, but the mixture may not");
    var state = result.state;
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 58, h: box.h - 90 };
    var rows = [
      { control: state.p0Easy, label: "easy", treatment: state.p1Easy },
      { control: state.p0Hard, label: "hard", treatment: state.p1Hard },
      { control: state.controlRate, label: "all", treatment: state.treatedRate }
    ];
    drawAxis(ctx, plot);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    [0, 0.5, 1].forEach(function (p) {
      var y = plot.y + plot.h - p * plot.h;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.fillText(formatPercent(p * 100), plot.x - 6, y - 6);
    });
    var gap = plot.w / rows.length;
    rows.forEach(function (row, i) {
      var baseX = plot.x + i * gap + gap * 0.22;
      var w = gap * 0.22;
      [
        { color: COLORS.control, value: row.control, x: baseX },
        { color: COLORS.treatment, value: row.treatment, x: baseX + w + 5 }
      ].forEach(function (bar) {
        var h = bar.value * plot.h;
        ctx.fillStyle = bar.color;
        ctx.fillRect(bar.x, plot.y + plot.h - h, w, h);
      });
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatPoints(row.treatment - row.control), baseX + w + 2, plot.y + plot.h - Math.max(row.control, row.treatment) * plot.h - 10);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, baseX + w + 2, plot.y + plot.h + 15);
    });
    ctx.textAlign = "left";
  }

  function drawMixPanel(ctx, result, box) {
    panelTitle(ctx, box, "Changing only the mixture", "the same stratum effects can reverse after aggregation");
    var rows = result.mixCurve;
    var plot = { x: box.x + 44, y: box.y + 54, w: box.w - 62, h: box.h - 84 };
    var values = rows.map(function (row) { return row.marginalRD; }).concat([0, result.state.marginalRD]);
    var maxAbs = Math.max.apply(null, values.map(function (v) { return Math.abs(v); }).concat([0.02])) * 1.18;
    function xScale(mix) { return plot.x + (mix + 0.9) / 1.8 * plot.w; }
    function yScale(value) { return plot.y + plot.h / 2 - value / maxAbs * (plot.h / 2); }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(0));
    ctx.lineTo(plot.x + plot.w, yScale(0));
    ctx.stroke();
    ctx.strokeStyle = COLORS.marginal;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = xScale(row.mix);
      var y = yScale(row.marginalRD);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var currentX = xScale(result.params.mixSkew);
    var currentY = yScale(result.state.marginalRD);
    ctx.fillStyle = result.state.reversal ? COLORS.control : COLORS.treatment;
    ctx.beginPath();
    ctx.arc(currentX, currentY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("marginal " + formatPoints(result.state.marginalRD), plot.x, plot.y + 14);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    [-0.9, 0, 0.9].forEach(function (mix) {
      ctx.fillText(formatPoints(mix).replace(" pp", ""), xScale(mix), plot.y + plot.h + 15);
    });
    ctx.textAlign = "left";
  }

  function drawOddsPanel(ctx, result, box) {
    panelTitle(ctx, box, "Balanced mix, odds-ratio drift", "no mixture imbalance is needed for OR non-collapsibility");
    var rows = result.gapCurve;
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 60, h: box.h - 84 };
    var values = rows.map(function (row) { return row.balancedOR; }).concat([result.params.oddsRatio, 1]);
    var minY = Math.min.apply(null, values.concat([0.9])) * 0.96;
    var maxY = Math.max.apply(null, values.concat([1.2])) * 1.06;
    function xScale(gap) {
      var maxGap = Math.max(result.params.stratumGap, 0.02);
      return plot.x + gap / maxGap * plot.w;
    }
    function yScale(value) { return plot.y + plot.h - (value - minY) / Math.max(1e-9, maxY - minY) * plot.h; }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.conditional;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(result.params.oddsRatio));
    ctx.lineTo(plot.x + plot.w, yScale(result.params.oddsRatio));
    ctx.stroke();
    ctx.strokeStyle = COLORS.balanced;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = xScale(row.gap);
      var y = yScale(row.balancedOR);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var x = xScale(result.params.stratumGap);
    var y = yScale(result.state.balancedOR);
    ctx.fillStyle = COLORS.balanced;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("balanced OR " + formatNumber(result.state.balancedOR), plot.x, plot.y + 14);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("purple conditional OR " + formatNumber(result.params.oddsRatio), plot.x, plot.y + 38);
    ctx.textAlign = "center";
    ctx.fillText("0 pp", plot.x, plot.y + plot.h + 15);
    ctx.fillText(formatPoints(result.params.stratumGap).replace("+", ""), plot.x + plot.w, plot.y + plot.h + 15);
    ctx.textAlign = "left";
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Aggregation ledger", "which table are you asking to answer?");
    var state = result.state;
    var rows = [
      ["people", formatNumber(result.params.n)],
      ["treated hard share", formatPercent(state.treatedHard * 100)],
      ["control hard share", formatPercent(state.controlHard * 100)],
      ["easy control rate", formatPercent(state.p0Easy * 100)],
      ["hard control rate", formatPercent(state.p0Hard * 100)],
      ["conditional OR", formatNumber(result.params.oddsRatio)],
      ["balanced OR", formatNumber(state.balancedOR)],
      ["marginal OR", formatNumber(state.marginalOR)],
      ["marginal RD", formatPoints(state.marginalRD)],
      ["reversal", state.reversal ? "yes" : "no"]
    ];
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 64 };
    var rowGap = Math.min(23, Math.max(17, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.25)" : "transparent";
      ctx.fillRect(plot.x, y - 2, plot.w, rowGap);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row[0], plot.x + 4, y + 13);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(row[1], plot.x + plot.w - 4, y + 13);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 1040 : 700;
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
      drawRatePanel(ctx, result, { x: margin, y: 28, w: panelW, h: 258 });
      drawMixPanel(ctx, result, { x: margin, y: 316, w: panelW, h: 222 });
      drawOddsPanel(ctx, result, { x: margin, y: 568, w: panelW, h: 214 });
      drawLedgerPanel(ctx, result, { x: margin, y: 812, w: panelW, h: 196 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawRatePanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 318 });
      drawMixPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 318 });
      drawOddsPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 246 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 246 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      baseRate: formatPercent(result.params.baseRate * 100),
      mixSkew: formatPoints(result.params.mixSkew).replace("+", ""),
      n: formatNumber(result.params.n),
      oddsRatio: formatNumber(result.params.oddsRatio),
      stratumGap: formatPoints(result.params.stratumGap).replace("+", "")
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Easy stratum RD", formatPoints(result.state.p1Easy - result.state.p0Easy)),
        metric("Hard stratum RD", formatPoints(result.state.p1Hard - result.state.p0Hard)),
        metric("Marginal RD", formatPoints(result.state.marginalRD)),
        metric("Conditional OR", formatNumber(result.params.oddsRatio)),
        metric("Marginal OR", formatNumber(result.state.marginalOR)),
        metric("Reversal", result.state.reversal ? "yes" : "no")
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-simpson-lab]")).forEach(init);
  }

  var api = {
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.SimpsonCollapsibilityLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
