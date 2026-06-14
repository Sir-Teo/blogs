(function (root) {
  "use strict";

  var COLORS = {
    bg: "#ffffff",
    panel: "#f8fafc",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    log: "#0f766e",
    brier: "#2563eb",
    market: "#7c3aed",
    trueLine: "#b45309",
    report: "#be123c",
    yes: "#16a34a",
    no: "#dc2626"
  };

  var DEFAULTS = {
    trueProb: 63,
    report: 78,
    liquidity: 24,
    traders: 32,
    signal: 72,
    aggression: 75,
    seed: 19
  };

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
      trueProb: snap(raw.trueProb, DEFAULTS.trueProb, 5, 95, 1),
      report: snap(raw.report, DEFAULTS.report, 2, 98, 1),
      liquidity: snap(raw.liquidity, DEFAULTS.liquidity, 4, 80, 1),
      traders: snap(raw.traders, DEFAULTS.traders, 2, 90, 1),
      signal: snap(raw.signal, DEFAULTS.signal, 51, 95, 1),
      aggression: snap(raw.aggression, DEFAULTS.aggression, 5, 100, 1),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 99, 1)
    };
  }

  function lcg(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function normal(rand) {
    var u = Math.max(1e-9, rand());
    var v = Math.max(1e-9, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function logit(p) {
    p = clamp(p, 1e-6, 1 - 1e-6);
    return Math.log(p / (1 - p));
  }

  function logistic(x) {
    if (x >= 0) {
      var e = Math.exp(-x);
      return 1 / (1 + e);
    }
    var ex = Math.exp(x);
    return ex / (1 + ex);
  }

  function lmsrCost(qYes, qNo, b) {
    var a = qYes / b;
    var c = qNo / b;
    var m = Math.max(a, c);
    return b * (m + Math.log(Math.exp(a - m) + Math.exp(c - m)));
  }

  function lmsrPrice(qYes, qNo, b) {
    return logistic((qYes - qNo) / b);
  }

  function expectedLogScore(p, q) {
    q = clamp(q, 1e-6, 1 - 1e-6);
    return p * Math.log(q) + (1 - p) * Math.log(1 - q);
  }

  function expectedBrierScore(p, q) {
    return -(p * Math.pow(1 - q, 2) + (1 - p) * q * q);
  }

  function bayesSignalBelief(prior, accuracy, signalYes) {
    var yesMarginal = prior * accuracy + (1 - prior) * (1 - accuracy);
    if (signalYes) return prior * accuracy / yesMarginal;
    var noMarginal = prior * (1 - accuracy) + (1 - prior) * accuracy;
    return prior * (1 - accuracy) / noMarginal;
  }

  function tradeToTarget(state, target, belief) {
    var b = state.b;
    var oldCost = lmsrCost(state.qYes, state.qNo, b);
    var oldPrice = lmsrPrice(state.qYes, state.qNo, b);
    var trade = {
      belief: belief,
      cost: 0,
      deltaNo: 0,
      deltaYes: 0,
      expectedProfit: 0,
      oldPrice: oldPrice,
      target: target
    };

    if (target > oldPrice + 1e-5) {
      var nextYes = state.qNo + b * logit(target);
      trade.deltaYes = Math.max(0, nextYes - state.qYes);
      state.qYes += trade.deltaYes;
      trade.cost = lmsrCost(state.qYes, state.qNo, b) - oldCost;
      trade.expectedProfit = belief * (trade.deltaYes - trade.cost) + (1 - belief) * (-trade.cost);
    } else if (target < oldPrice - 1e-5) {
      var nextNo = state.qYes - b * logit(target);
      trade.deltaNo = Math.max(0, nextNo - state.qNo);
      state.qNo += trade.deltaNo;
      trade.cost = lmsrCost(state.qYes, state.qNo, b) - oldCost;
      trade.expectedProfit = (1 - belief) * (trade.deltaNo - trade.cost) + belief * (-trade.cost);
    }

    trade.newPrice = lmsrPrice(state.qYes, state.qNo, b);
    state.collected += trade.cost;
    return trade;
  }

  function simulateMarket(params) {
    var theta = params.trueProb / 100;
    var report = params.report / 100;
    var accuracy = params.signal / 100;
    var aggression = params.aggression / 100;
    var rand = lcg(params.seed * 10007 + params.traders * 97 + params.trueProb * 13);
    var state = {
      b: params.liquidity,
      collected: 0,
      qNo: 0,
      qYes: 0
    };
    var path = [{
      belief: 0.5,
      cost: 0,
      expectedProfit: 0,
      price: lmsrPrice(0, 0, state.b),
      trader: 0
    }];
    var profitSum = 0;
    var costSum = 0;

    for (var i = 1; i <= params.traders; i += 1) {
      var signalMarginal = theta * accuracy + (1 - theta) * (1 - accuracy);
      var signalYes = rand() < signalMarginal;
      var belief = bayesSignalBelief(theta, accuracy, signalYes);
      var noisyLogit = logit(belief) + normal(rand) * 0.22 * (1 - accuracy + 0.12);
      belief = clamp(logistic(noisyLogit), 0.01, 0.99);
      var currentPrice = lmsrPrice(state.qYes, state.qNo, state.b);
      var target = clamp(currentPrice + aggression * (belief - currentPrice), 0.01, 0.99);
      var trade = tradeToTarget(state, target, belief);
      profitSum += trade.expectedProfit;
      costSum += trade.cost;
      path.push({
        belief: belief,
        cost: trade.cost,
        deltaNo: trade.deltaNo,
        deltaYes: trade.deltaYes,
        expectedProfit: trade.expectedProfit,
        price: trade.newPrice,
        signal: signalYes ? "yes" : "no",
        target: target,
        trader: i
      });
    }

    var currentCost = lmsrCost(state.qYes, state.qNo, state.b);
    var initialCost = lmsrCost(0, 0, state.b);
    var makerLossYes = state.qYes - (currentCost - initialCost);
    var makerLossNo = state.qNo - (currentCost - initialCost);
    var finalPrice = lmsrPrice(state.qYes, state.qNo, state.b);
    var moveToReport = quoteMove(state, report);

    return {
      costSum: costSum,
      finalPrice: finalPrice,
      makerLossNo: makerLossNo,
      makerLossYes: makerLossYes,
      moveToReport: moveToReport,
      path: path,
      profitSum: profitSum,
      qNo: state.qNo,
      qYes: state.qYes,
      worstLoss: Math.max(makerLossYes, makerLossNo)
    };
  }

  function quoteMove(state, target) {
    var clone = {
      b: state.b,
      collected: state.collected,
      qNo: state.qNo,
      qYes: state.qYes
    };
    var oldPrice = lmsrPrice(clone.qYes, clone.qNo, clone.b);
    var trade = tradeToTarget(clone, target, target);
    return {
      cost: trade.cost,
      deltaNo: trade.deltaNo,
      deltaYes: trade.deltaYes,
      from: oldPrice,
      to: lmsrPrice(clone.qYes, clone.qNo, clone.b)
    };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var p = params.trueProb / 100;
    var q = params.report / 100;
    var market = simulateMarket(params);
    var logTruth = expectedLogScore(p, p);
    var logReport = expectedLogScore(p, q);
    var brierTruth = expectedBrierScore(p, p);
    var brierReport = expectedBrierScore(p, q);
    return {
      brierRegret: brierTruth - brierReport,
      brierReport: brierReport,
      brierTruth: brierTruth,
      logRegret: logTruth - logReport,
      logReport: logReport,
      logTruth: logTruth,
      market: market,
      params: params
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="lmsr-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function updateMetrics(el, result) {
    var move = result.market.moveToReport;
    var direction = move.deltaYes > 0 ? "yes" : move.deltaNo > 0 ? "no" : "none";
    el.innerHTML = [
      metric("Final market price", formatNumber(result.market.finalPrice, 2)),
      metric("Log-score regret", formatNumber(result.logRegret, 3)),
      metric("Worst maker loss", formatNumber(result.market.worstLoss, 2)),
      metric("Move report cost", direction + " " + formatNumber(move.cost, 2))
    ].join("");
  }

  function updateOutputs(container, params) {
    var labels = {
      aggression: params.aggression + "%",
      liquidity: String(params.liquidity),
      report: params.report + "%",
      seed: String(params.seed),
      signal: params.signal + "%",
      traders: String(params.traders),
      trueProb: params.trueProb + "%"
    };
    Object.keys(labels).forEach(function (key) {
      var out = container.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function readState(container, previous) {
    var state = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (el) {
      state[el.getAttribute("data-param")] = el.value;
    });
    return cleanParams(state);
  }

  function setCanvasSize(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, rect.width || canvas.clientWidth || 860);
    var cssHeight = Math.max(600, Math.min(780, cssWidth * 0.82));
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.height = cssHeight + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawText(ctx, text, x, y, color, size, weight, maxWidth) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(String(text), x, y, maxWidth);
  }

  function drawPanel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.bg;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, COLORS.text, 13, 750);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 42, COLORS.muted, 10, 600, w - 28);
  }

  function drawAxes(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawScores(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Truthful reports maximize expected score", "two proper scores, same optimum");
    var plot = { x: x + 42, y: y + 58, w: w - 70, h: h - 88 };
    drawAxes(ctx, plot);
    var p = result.params.trueProb / 100;
    var q = result.params.report / 100;
    var samples = [];
    var minY = Infinity;
    var maxY = -Infinity;
    for (var i = 1; i < 100; i += 1) {
      var r = i / 100;
      var logScore = expectedLogScore(p, r);
      var brierScore = expectedBrierScore(p, r);
      samples.push({ q: r, log: logScore, brier: brierScore });
      minY = Math.min(minY, logScore, brierScore);
      maxY = Math.max(maxY, logScore, brierScore);
    }
    var padY = (maxY - minY) * 0.08 || 1;
    minY -= padY;
    maxY += padY;
    function px(v) { return plot.x + plot.w * v; }
    function py(v) { return plot.y + plot.h - plot.h * (v - minY) / (maxY - minY); }
    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      samples.forEach(function (row, index) {
        var xx = px(row.q);
        var yy = py(row[key]);
        if (index === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    }
    line("log", COLORS.log);
    line("brier", COLORS.brier);

    [
      { value: p, color: COLORS.trueLine, label: "truth" },
      { value: q, color: COLORS.report, label: "report" }
    ].forEach(function (mark) {
      var xx = px(mark.value);
      ctx.strokeStyle = mark.color;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xx, plot.y);
      ctx.lineTo(xx, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      drawText(ctx, mark.label, xx - 14, plot.y + plot.h + 18, mark.color, 10, 700, 46);
    });
    drawText(ctx, "log", plot.x + plot.w - 78, plot.y + 18, COLORS.log, 11, 750);
    drawText(ctx, "Brier", plot.x + plot.w - 43, plot.y + 18, COLORS.brier, 11, 750);
    drawText(ctx, "0", plot.x - 4, plot.y + plot.h + 18, COLORS.muted, 10, 500);
    drawText(ctx, "1", plot.x + plot.w - 4, plot.y + plot.h + 18, COLORS.muted, 10, 500);
  }

  function drawMarket(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Sequential traders move the price", "private signals meet an always-on market maker");
    var plot = { x: x + 42, y: y + 58, w: w - 70, h: h - 88 };
    drawAxes(ctx, plot);
    var path = result.market.path;
    var theta = result.params.trueProb / 100;
    function px(i) { return plot.x + plot.w * i / Math.max(1, path.length - 1); }
    function py(v) { return plot.y + plot.h - plot.h * v; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gy = plot.y + plot.h * g / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.trueLine;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, py(theta));
    ctx.lineTo(plot.x + plot.w, py(theta));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = COLORS.market;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    path.forEach(function (row, index) {
      var xx = px(index);
      var yy = py(row.price);
      if (index === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    path.slice(1).forEach(function (row, index) {
      var xx = px(index + 1);
      var yy = py(row.price);
      ctx.fillStyle = row.signal === "yes" ? COLORS.yes : COLORS.no;
      ctx.beginPath();
      ctx.arc(xx, yy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    drawText(ctx, "true probability", plot.x + 8, py(theta) - 6, COLORS.trueLine, 10, 700);
    drawText(ctx, "trader", plot.x + plot.w - 30, plot.y + plot.h + 18, COLORS.muted, 10, 500);
    drawText(ctx, "1", plot.x - 20, plot.y + 4, COLORS.muted, 10, 500);
    drawText(ctx, "0", plot.x - 20, plot.y + plot.h + 4, COLORS.muted, 10, 500);
  }

  function drawImpact(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Liquidity is curvature", "larger b means more shares for the same price move");
    var plot = { x: x + 42, y: y + 58, w: w - 70, h: h - 88 };
    drawAxes(ctx, plot);
    var b = result.params.liquidity;
    var maxShares = b * 4;
    var curves = [
      { b: Math.max(1, b / 2), color: COLORS.report, label: "b/2" },
      { b: b, color: COLORS.market, label: "b" },
      { b: b * 2, color: COLORS.log, label: "2b" }
    ];
    function px(v) { return plot.x + plot.w * v / maxShares; }
    function py(v) { return plot.y + plot.h - plot.h * v; }
    curves.forEach(function (curve) {
      ctx.strokeStyle = curve.color;
      ctx.lineWidth = curve.b === b ? 2.5 : 1.7;
      ctx.beginPath();
      for (var s = 0; s <= maxShares; s += maxShares / 80) {
        var price = logistic(s / curve.b);
        var xx = px(s);
        var yy = py(price);
        if (s === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    });
    curves.forEach(function (curve, i) {
      drawText(ctx, curve.label, plot.x + plot.w - 52, plot.y + 18 + i * 16, curve.color, 11, 750);
    });
    var bound = b * Math.log(2);
    var loss = result.market.worstLoss;
    var barX = plot.x + 10;
    var barY = plot.y + plot.h - 30;
    var barW = Math.min(150, plot.w * 0.46);
    ctx.fillStyle = COLORS.grid;
    drawRoundRect(ctx, barX, barY, barW, 12, 4);
    ctx.fill();
    ctx.fillStyle = COLORS.trueLine;
    drawRoundRect(ctx, barX, barY, barW * clamp(loss / bound, 0, 1), 12, 4);
    ctx.fill();
    drawText(ctx, "loss " + formatNumber(loss, 2) + " / bound " + formatNumber(bound, 2), barX, barY - 7, COLORS.muted, 10, 650, 220);
    drawText(ctx, "yes shares bought", plot.x + plot.w - 94, plot.y + plot.h + 18, COLORS.muted, 10, 500);
  }

  function drawMoveQuote(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Cost to move the market", "a report is an inventory-changing trade");
    var move = result.market.moveToReport;
    var rowY = y + 64;
    var values = [
      ["from", formatNumber(move.from, 2)],
      ["to", formatNumber(move.to, 2)],
      ["yes shares", formatNumber(move.deltaYes, 2)],
      ["no shares", formatNumber(move.deltaNo, 2)],
      ["cost", formatNumber(move.cost, 2)]
    ];
    values.forEach(function (row, i) {
      var yy = rowY + i * 30;
      drawText(ctx, row[0], x + 18, yy, COLORS.muted, 11, 650, 80);
      drawText(ctx, row[1], x + w - 92, yy, COLORS.text, 13, 750, 80);
    });
    var regretY = y + h - 56;
    drawText(ctx, "expected-score penalty for report", x + 18, regretY, COLORS.muted, 11, 650, w - 36);
    drawText(ctx, "log " + formatNumber(result.logRegret, 3) + "   Brier " + formatNumber(result.brierRegret, 3), x + 18, regretY + 22, COLORS.report, 13, 750, w - 36);
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var fitted = setCanvasSize(canvas);
    var ctx = fitted.ctx;
    var width = fitted.width;
    var height = fitted.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);
    var pad = 16;
    var gap = 14;
    if (width < 700) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawScores(ctx, result, pad, pad, width - pad * 2, panelH);
      drawMarket(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawImpact(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawMoveQuote(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }
    var leftW = width * 0.58;
    var rightW = width - leftW - pad * 2 - gap;
    var halfH = (height - pad * 2 - gap) / 2;
    drawScores(ctx, result, pad, pad, leftW, halfH);
    drawMarket(ctx, result, pad, pad + halfH + gap, leftW, halfH);
    drawImpact(ctx, result, pad + leftW + gap, pad, rightW, halfH);
    drawMoveQuote(ctx, result, pad + leftW + gap, pad + halfH + gap, rightW, halfH);
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;

    function render() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    container.querySelectorAll("[data-param]").forEach(function (el) {
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });

    if (window.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      window.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    render();
  }

  function init() {
    var labs = document.querySelectorAll("[data-lmsr-scoring-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    expectedBrierScore: expectedBrierScore,
    expectedLogScore: expectedLogScore,
    lmsrCost: lmsrCost,
    lmsrPrice: lmsrPrice
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LMSRScoringLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
