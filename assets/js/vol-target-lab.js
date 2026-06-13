(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    raw: "#64748b",
    target: "#0f766e",
    estimate: "#2563eb",
    stress: "#be123c",
    warn: "#b45309",
    purple: "#7c3aed"
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
  }

  function stdev(values) {
    var mu = mean(values);
    var variance = values.reduce(function (sum, value) {
      return sum + Math.pow(value - mu, 2);
    }, 0) / Math.max(1, values.length - 1);
    return Math.sqrt(Math.max(0, variance));
  }

  function quantile(values, q) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = clamp(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1);
    return sorted[index];
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="voltarget-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function maxDrawdown(equity) {
    var peak = equity[0] || 1;
    var worst = 0;
    var series = [];
    equity.forEach(function (value) {
      peak = Math.max(peak, value);
      var drawdown = value / peak - 1;
      worst = Math.min(worst, drawdown);
      series.push(drawdown);
    });
    return { worst: worst, series: series };
  }

  function performance(returns) {
    var mu = mean(returns);
    var vol = stdev(returns) * Math.sqrt(252);
    var annReturn = Math.exp(252 * mean(returns.map(function (r) {
      return Math.log(Math.max(0.02, 1 + r));
    }))) - 1;
    var equity = [1];
    returns.forEach(function (r) {
      equity.push(Math.max(0.02, equity[equity.length - 1] * (1 + r)));
    });
    var dd = maxDrawdown(equity);
    return {
      annReturn: annReturn,
      annVol: vol,
      drawdown: dd.worst,
      drawdowns: dd.series,
      equity: equity,
      sharpe: vol > 1e-9 ? mu * 252 / vol : 0,
      tail: quantile(returns, 0.05),
      worstDay: Math.min.apply(null, returns)
    };
  }

  function simulate(params) {
    var years = 12;
    var days = years * 252;
    var rand = rng(
      20260613
      + params.targetVol * 11
      + params.halfLife * 13
      + params.maxLev * 17
      + params.premium * 19
      + params.stress * 23
      + params.cost * 29
    );
    var baseVol = 0.16;
    var baseReturn = 0.065;
    var targetVol = params.targetVol / 100;
    var maxLev = params.maxLev / 100;
    var premiumSlope = params.premium / 100;
    var stressScale = params.stress / 100;
    var cost = params.cost / 10000;
    var lambda = Math.exp(Math.log(0.5) / params.halfLife);
    var estVar = Math.pow(baseVol / Math.sqrt(252), 2);
    var stress = 0;
    var rawReturns = [];
    var targetReturns = [];
    var hiddenVol = [];
    var estimatedVol = [];
    var weights = [];
    var stressPath = [];
    var turnover = 0;
    var previousWeight = 1;
    var misses = 0;
    var totalAbsGap = 0;

    for (var day = 0; day < days; day += 1) {
      var shockProb = 0.002 + 0.010 * stressScale;
      if (rand() < shockProb) stress += 0.8 + 1.8 * rand();
      stress *= 0.962 + 0.027 * stressScale;

      var annVol = clamp(baseVol * Math.exp(0.78 * stress + 0.10 * normal(rand)), 0.055, 0.92);
      var muAnn = baseReturn + premiumSlope * (annVol - baseVol);
      var jump = 0;
      if (rand() < 0.0015 + 0.007 * stress) {
        jump = -(0.012 + 0.040 * rand()) * (1 + 0.35 * stress);
      }
      var raw = muAnn / 252 + annVol / Math.sqrt(252) * normal(rand) + jump;

      var estAnnVol = Math.sqrt(estVar * 252);
      var weight = clamp(targetVol / Math.max(0.025, estAnnVol), 0, maxLev);
      var trade = Math.abs(weight - previousWeight);
      var managed = weight * raw - trade * cost;

      rawReturns.push(raw);
      targetReturns.push(managed);
      hiddenVol.push(annVol);
      estimatedVol.push(estAnnVol);
      weights.push(weight);
      stressPath.push(stress);
      turnover += trade;
      totalAbsGap += Math.abs(estAnnVol - annVol);
      if (annVol > 1.35 * targetVol && weight > 1) misses += 1;

      estVar = lambda * estVar + (1 - lambda) * raw * raw;
      previousWeight = weight;
    }

    var rawPerf = performance(rawReturns);
    var targetPerf = performance(targetReturns);
    return {
      avgLeverage: mean(weights),
      hiddenVol: hiddenVol,
      missRate: misses / days,
      raw: rawPerf,
      rawReturns: rawReturns,
      target: targetPerf,
      targetReturns: targetReturns,
      estimatedVol: estimatedVol,
      targetVol: targetVol,
      turnover: turnover / years,
      trackingGap: totalAbsGap / days,
      weights: weights,
      stressPath: stressPath,
      years: years
    };
  }

  function drawLabel(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    drawLabel(ctx, title, box.x, box.y - 14, "left", "bottom", COLORS.text);
    if (subtitle) drawLabel(ctx, subtitle, box.x + box.w, box.y - 14, "right", "bottom", COLORS.muted);
  }

  function lineChart(ctx, box, series, opts) {
    var min = opts.min;
    var max = opts.max;
    function xScale(index) {
      return box.x + index / Math.max(1, series[0].values.length - 1) * box.w;
    }
    function yScale(value) {
      return box.y + box.h - (value - min) / Math.max(1e-9, max - min) * box.h;
    }

    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1].forEach(function (tick) {
      var y = box.y + box.h * tick;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
    });

    series.forEach(function (item) {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.width || 2;
      ctx.beginPath();
      item.values.forEach(function (value, index) {
        var x = xScale(index);
        var y = yScale(value);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.lineWidth = 1;
  }

  function drawWealth(ctx, result, box) {
    var raw = result.raw.equity.map(Math.log);
    var target = result.target.equity.map(Math.log);
    var min = Math.min.apply(null, raw.concat(target));
    var max = Math.max.apply(null, raw.concat(target));
    panel(ctx, box, "Cumulative wealth", "log scale");
    lineChart(ctx, box, [
      { values: raw, color: COLORS.raw },
      { values: target, color: COLORS.target }
    ], { min: min, max: max });
    drawLabel(ctx, "raw", box.x + box.w - 48, box.y + 18, "left", "middle", COLORS.raw);
    drawLabel(ctx, "targeted", box.x + box.w - 72, box.y + 36, "left", "middle", COLORS.target);
  }

  function drawVol(ctx, result, box) {
    var max = Math.max.apply(null, result.hiddenVol.concat(result.estimatedVol).concat([result.targetVol])) * 1.05;
    panel(ctx, box, "Volatility clock", "annualized");
    lineChart(ctx, box, [
      { values: result.hiddenVol, color: COLORS.stress, width: 1.5 },
      { values: result.estimatedVol, color: COLORS.estimate, width: 1.5 },
      { values: result.hiddenVol.map(function () { return result.targetVol; }), color: COLORS.target, width: 1 }
    ], { min: 0, max: max });
    drawLabel(ctx, "hidden", box.x + box.w - 68, box.y + 18, "left", "middle", COLORS.stress);
    drawLabel(ctx, "estimate", box.x + box.w - 68, box.y + 36, "left", "middle", COLORS.estimate);
    drawLabel(ctx, "target", box.x + box.w - 68, box.y + 54, "left", "middle", COLORS.target);
  }

  function drawLeverage(ctx, result, box) {
    var max = Math.max.apply(null, result.weights.concat([1])) * 1.08;
    panel(ctx, box, "Exposure feedback", "weight path");
    lineChart(ctx, box, [
      { values: result.weights, color: COLORS.purple, width: 1.8 },
      { values: result.weights.map(function () { return 1; }), color: COLORS.raw, width: 1 }
    ], { min: 0, max: max });
    drawLabel(ctx, "1x", box.x + box.w - 26, box.y + box.h - box.h / Math.max(1e-9, max), "right", "middle", COLORS.raw);
  }

  function drawDrawdown(ctx, result, box) {
    panel(ctx, box, "Drawdown", "from running peak");
    lineChart(ctx, box, [
      { values: result.raw.drawdowns, color: COLORS.raw, width: 1.4 },
      { values: result.target.drawdowns, color: COLORS.target, width: 1.8 }
    ], { min: Math.min(result.raw.drawdown, result.target.drawdown) * 1.1, max: 0 });
  }

  function drawBars(ctx, result, box) {
    var rows = [
      {
        label: "Sharpe",
        raw: clamp((result.raw.sharpe + 0.6) / 2.4, 0, 1),
        target: clamp((result.target.sharpe + 0.6) / 2.4, 0, 1),
        text: formatNumber(result.target.sharpe, 2) + " vs " + formatNumber(result.raw.sharpe, 2)
      },
      {
        label: "Ann vol",
        raw: clamp(result.raw.annVol / 0.45, 0, 1),
        target: clamp(result.target.annVol / 0.45, 0, 1),
        text: formatPercent(result.target.annVol, 1)
      },
      {
        label: "Max DD",
        raw: clamp(Math.abs(result.raw.drawdown) / 0.75, 0, 1),
        target: clamp(Math.abs(result.target.drawdown) / 0.75, 0, 1),
        text: formatPercent(result.target.drawdown, 0)
      },
      {
        label: "5% day",
        raw: clamp(Math.abs(result.raw.tail) / 0.07, 0, 1),
        target: clamp(Math.abs(result.target.tail) / 0.07, 0, 1),
        text: formatPercent(result.target.tail, 2)
      }
    ];
    var h = (box.h - 33) / rows.length;
    panel(ctx, box, "Outcome ledger", "targeted vs raw");
    rows.forEach(function (row, index) {
      var y = box.y + 14 + index * h;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x, y, box.w, h - 8);
      ctx.fillStyle = COLORS.raw;
      ctx.fillRect(box.x, y, box.w * row.raw, (h - 8) / 2);
      ctx.fillStyle = COLORS.target;
      ctx.fillRect(box.x, y + (h - 8) / 2, box.w * row.target, (h - 8) / 2);
      drawLabel(ctx, row.label, box.x + 6, y + (h - 8) / 2, "left", "middle", "#ffffff");
      drawLabel(ctx, row.text, box.x + box.w - 6, y + (h - 8) / 2, "right", "middle", COLORS.text);
    });
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 880 : 620;
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
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    var left = compact ? 46 : 54;
    var right = compact ? 18 : 22;
    var plotW = width - left - right;

    if (compact) {
      drawWealth(ctx, result, { x: left, y: 44, w: plotW, h: 170 });
      drawVol(ctx, result, { x: left, y: 278, w: plotW, h: 160 });
      drawLeverage(ctx, result, { x: left, y: 502, w: plotW, h: 120 });
      drawDrawdown(ctx, result, { x: left, y: 684, w: plotW, h: 120 });
    } else {
      drawWealth(ctx, result, { x: left, y: 44, w: plotW * 0.61, h: 230 });
      drawVol(ctx, result, { x: left + plotW * 0.68, y: 44, w: plotW * 0.32, h: 180 });
      drawLeverage(ctx, result, { x: left, y: 352, w: plotW * 0.44, h: 150 });
      drawDrawdown(ctx, result, { x: left + plotW * 0.51, y: 352, w: plotW * 0.49, h: 150 });
      drawBars(ctx, result, { x: left + plotW * 0.68, y: 292, w: plotW * 0.32, h: 210 });
    }
  }

  function parseParams(root) {
    var params = {
      cost: 2,
      halfLife: 20,
      maxLev: 250,
      premium: 0,
      stress: 55,
      targetVol: 12
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "targetVol") output.textContent = params[key] + "%";
      else if (key === "maxLev") output.textContent = formatNumber(params[key] / 100, 1) + "x";
      else if (key === "premium") output.textContent = params[key] + "%";
      else if (key === "cost") output.textContent = params[key] + " bps";
      else if (key === "stress") output.textContent = params[key] + "%";
      else output.textContent = String(params[key]);
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = simulate(params);
    var metrics = root.querySelector("[data-metrics]");
    var canvas = root.querySelector("[data-canvas]");

    updateOutputs(root, params);
    metrics.innerHTML = [
      metric("raw Sharpe", formatNumber(result.raw.sharpe, 2)),
      metric("target Sharpe", formatNumber(result.target.sharpe, 2)),
      metric("target vol", formatPercent(result.target.annVol, 1)),
      metric("max drawdown", formatPercent(result.target.drawdown, 0)),
      metric("avg leverage", formatNumber(result.avgLeverage, 2) + "x"),
      metric("turnover / yr", formatNumber(result.turnover, 1) + "x")
    ].join("");
    drawChart(canvas, result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-voltarget-lab]"));
    labs.forEach(function (root) {
      var schedule = null;
      function requestRender() {
        if (schedule) window.cancelAnimationFrame(schedule);
        schedule = window.requestAnimationFrame(function () {
          schedule = null;
          render(root);
        });
      }

      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      window.addEventListener("resize", requestRender);
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      performance: performance,
      simulate: simulate
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
