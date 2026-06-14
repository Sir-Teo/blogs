(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    alt: "#0f766e",
    nullPath: "#64748b",
    eprocess: "#2563eb",
    fixedP: "#dc2626",
    threshold: "#be123c",
    growth: "#7c3aed",
    optimal: "#d97706"
  };

  var PATHS = 360;
  var DRAW_PATHS = 42;

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

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 1000000) return value.toExponential(2);
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
    return '<div class="eprocess-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[index];
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      alpha: clamp(raw.alpha == null ? 5 : Number(raw.alpha), 1, 20) / 100,
      bet: clamp(raw.bet == null ? 30 : Number(raw.bet), 0, 180) / 100,
      horizon: clamp(raw.horizon == null ? 500 : Number(raw.horizon), 80, 1600) | 0,
      seed: clamp(raw.seed == null ? 23 : Number(raw.seed), 1, 99) | 0,
      trueRate: clamp(raw.trueRate == null ? 56 : Number(raw.trueRate), 50, 70) / 100
    };
  }

  function oneSidedNormalP(successes, n) {
    if (n <= 0) return 1;
    var z = (successes - 0.5 * n) / Math.sqrt(0.25 * n);
    return 1 - normalCdf(z);
  }

  function expectedLogGrowth(p, bet) {
    var win = 1 + 0.5 * bet;
    var loss = 1 - 0.5 * bet;
    if (win <= 0 || loss <= 0) return -Infinity;
    return p * Math.log(win) + (1 - p) * Math.log(loss);
  }

  function simulatePaths(params, probability, salt) {
    var boundary = 1 / params.alpha;
    var sampleStep = Math.max(1, Math.ceil(params.horizon / 150));
    var sampleTimes = [];
    for (var t = sampleStep; t <= params.horizon; t += sampleStep) sampleTimes.push(t);
    if (sampleTimes[sampleTimes.length - 1] !== params.horizon) sampleTimes.push(params.horizon);

    var summaries = [];
    var drawn = [];
    var eCrossCounts = sampleTimes.map(function () { return 0; });
    var pCrossCounts = sampleTimes.map(function () { return 0; });

    for (var path = 0; path < PATHS; path += 1) {
      var e = 1;
      var maxE = 1;
      var successes = 0;
      var firstE = 0;
      var firstP = 0;
      var finalP = 1;
      var drawSeries = [];
      var sampleIndex = 0;
      for (var t = 1; t <= params.horizon; t += 1) {
        var draw = uniform(path * 100000 + t * 17 + salt * 997, 0xE11E ^ params.seed) < probability ? 1 : 0;
        successes += draw;
        e *= 1 + params.bet * (draw - 0.5);
        e = Math.min(e, 1e300);
        maxE = Math.max(maxE, e);
        if (!firstE && e >= boundary) firstE = t;

        if (t >= 20) {
          finalP = oneSidedNormalP(successes, t);
          if (!firstP && finalP <= params.alpha) firstP = t;
        }

        while (sampleIndex < sampleTimes.length && sampleTimes[sampleIndex] === t) {
          if (firstE) eCrossCounts[sampleIndex] += 1;
          if (firstP) pCrossCounts[sampleIndex] += 1;
          if (path < DRAW_PATHS) drawSeries.push({ e: e, t: t });
          sampleIndex += 1;
        }
      }
      summaries.push({
        firstE: firstE,
        firstP: firstP,
        finalE: e,
        finalP: finalP,
        maxE: maxE,
        successes: successes
      });
      if (path < DRAW_PATHS) drawn.push(drawSeries);
    }

    var eCrossed = summaries.filter(function (row) { return row.firstE; });
    var pCrossed = summaries.filter(function (row) { return row.firstP; });
    return {
      avgLogFinalE: mean(summaries.map(function (row) { return Math.log(Math.max(1e-300, row.finalE)); })),
      eCrossRate: eCrossed.length / PATHS,
      eCrossTimes: eCrossed.map(function (row) { return row.firstE; }),
      finalPRejectRate: summaries.filter(function (row) { return row.finalP <= params.alpha; }).length / PATHS,
      maxE95: percentile(summaries.map(function (row) { return row.maxE; }), 0.95),
      medianCrossTime: eCrossed.length ? percentile(eCrossed.map(function (row) { return row.firstE; }), 0.5) : 0,
      medianFinalE: percentile(summaries.map(function (row) { return row.finalE; }), 0.5),
      pPeekRate: pCrossed.length / PATHS,
      paths: drawn,
      probability: probability,
      sampleTimes: sampleTimes,
      timeSeries: sampleTimes.map(function (time, i) {
        return {
          eCrossRate: eCrossCounts[i] / PATHS,
          pCrossRate: pCrossCounts[i] / PATHS,
          t: time
        };
      })
    };
  }

  function growthCurve(params) {
    var rows = [];
    for (var i = 0; i <= 76; i += 1) {
      var bet = 1.9 * i / 76;
      rows.push({
        bet: bet,
        growth: expectedLogGrowth(params.trueRate, bet),
        nullFactor: 1
      });
    }
    return rows;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var nullRun = simulatePaths(params, 0.5, 11);
    var altRun = simulatePaths(params, params.trueRate, 29);
    var optimalBet = clamp(4 * params.trueRate - 2, 0, 1.9);
    return {
      alt: altRun,
      boundary: 1 / params.alpha,
      growth: growthCurve(params),
      nullRun: nullRun,
      optimalBet: optimalBet,
      optimalGrowth: expectedLogGrowth(params.trueRate, optimalBet),
      params: params
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

  function drawCapitalPanel(ctx, result, box) {
    panelTitle(ctx, box, "Capital paths", "an e-process is a bankroll with a crossing boundary");
    var plot = { x: box.x + 46, y: box.y + 54, w: box.w - 68, h: box.h - 88 };
    drawAxis(ctx, plot);
    var maxLog = Math.max(1.4, Math.log10(result.boundary), Math.log10(result.alt.maxE95));
    function xScale(t) { return plot.x + t / result.params.horizon * plot.w; }
    function yScale(e) { return plot.y + plot.h - Math.log10(Math.max(0.01, e)) / maxLog * plot.h; }
    [
      { run: result.nullRun, color: COLORS.nullPath, alpha: 0.22 },
      { run: result.alt, color: COLORS.alt, alpha: 0.34 }
    ].forEach(function (group) {
      ctx.strokeStyle = group.color;
      ctx.globalAlpha = group.alpha;
      group.run.paths.forEach(function (series) {
        ctx.beginPath();
        series.forEach(function (point, i) {
          var x = xScale(point.t);
          var y = yScale(point.e);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    });
    var boundaryY = yScale(result.boundary);
    ctx.strokeStyle = COLORS.threshold;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, boundaryY);
    ctx.lineTo(plot.x + plot.w, boundaryY);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "1", plot.x - 8, yScale(1), "right");
    label(ctx, "1/alpha = " + formatNumber(result.boundary, 0), plot.x + plot.w, boundaryY - 9, "right", COLORS.threshold);
    label(ctx, "time", plot.x + plot.w, plot.y + plot.h + 15, "right");
    label(ctx, "gray null, green alternative", plot.x, box.y + box.h - 13, "left");
  }

  function drawAuditPanel(ctx, result, box) {
    panelTitle(ctx, box, "Optional stopping audit", "fixed-horizon p-values are not an always-on alarm");
    var plot = { x: box.x + 46, y: box.y + 54, w: box.w - 68, h: box.h - 88 };
    drawAxis(ctx, plot);
    var maxY = Math.max(0.12, result.nullRun.pPeekRate, result.alt.eCrossRate) * 1.12;
    function xScale(t) { return plot.x + t / result.params.horizon * plot.w; }
    function yScale(v) { return plot.y + plot.h - v / maxY * plot.h; }
    [
      { rows: result.nullRun.timeSeries, key: "eCrossRate", color: COLORS.eprocess, width: 2.2 },
      { rows: result.nullRun.timeSeries, key: "pCrossRate", color: COLORS.fixedP, width: 2.2 },
      { rows: result.alt.timeSeries, key: "eCrossRate", color: COLORS.alt, width: 2.2 }
    ].forEach(function (line) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.beginPath();
      line.rows.forEach(function (row, i) {
        var x = xScale(row.t);
        var y = yScale(row[line.key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    var alphaY = yScale(result.params.alpha);
    ctx.strokeStyle = COLORS.rule;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, alphaY);
    ctx.lineTo(plot.x + plot.w, alphaY);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "alpha", plot.x + plot.w, alphaY - 8, "right");
    label(ctx, "crossing rate", plot.x - 7, plot.y, "right");
    label(ctx, "blue null e, red null peek-p, green alt e", plot.x, box.y + box.h - 13, "left");
  }

  function drawGrowthPanel(ctx, result, box) {
    panelTitle(ctx, box, "Bet-size curve", "validity is under the null; growth depends on the alternative");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 70, h: box.h - 88 };
    drawAxis(ctx, plot);
    var minY = Math.min(-0.04, Math.min.apply(null, result.growth.map(function (row) { return row.growth; })));
    var maxY = Math.max(0.03, Math.max.apply(null, result.growth.map(function (row) { return row.growth; })));
    function xScale(bet) { return plot.x + bet / 1.9 * plot.w; }
    function yScale(v) { return plot.y + plot.h - (v - minY) / (maxY - minY) * plot.h; }
    var zeroY = yScale(0);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, zeroY);
    ctx.lineTo(plot.x + plot.w, zeroY);
    ctx.stroke();
    ctx.strokeStyle = COLORS.growth;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    result.growth.forEach(function (row, i) {
      var x = xScale(row.bet);
      var y = yScale(row.growth);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    [
      { bet: result.params.bet, color: COLORS.threshold, label: "current" },
      { bet: result.optimalBet, color: COLORS.optimal, label: "log-optimal" }
    ].forEach(function (line) {
      var x = xScale(line.bet);
      ctx.strokeStyle = line.color;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      label(ctx, line.label, x + 4, plot.y + 12, "left", line.color);
    });
    label(ctx, "bet 0", plot.x, plot.y + plot.h + 15, "left");
    label(ctx, "bet 1.9", plot.x + plot.w, plot.y + plot.h + 15, "right");
    label(ctx, "expected log multiplier per observation", plot.x, box.y + box.h - 13, "left");
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Ledger", "what stays valid, what grows, and what is just a toy diagnostic");
    var rows = [
      ["alpha", result.params.alpha, null, "pct"],
      ["e boundary", result.boundary, null, "num0"],
      ["null e-cross", result.nullRun.eCrossRate, null, "pct"],
      ["null peek-p cross", result.nullRun.pPeekRate, null, "pct"],
      ["alt e-cross", result.alt.eCrossRate, null, "pct"],
      ["alt final-p reject", result.alt.finalPRejectRate, null, "pct"],
      ["median final e", result.alt.medianFinalE, null, "num2"],
      ["median e-cross time", result.alt.medianCrossTime || 0, null, "num0"]
    ];
    var start = box.y + 55;
    var rowH = Math.min(26, Math.max(19, (box.h - 76) / rows.length));
    rows.forEach(function (row, i) {
      var y = start + i * rowH;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.24)" : "transparent";
      ctx.fillRect(box.x, y - 2, box.w, rowH);
      label(ctx, row[0], box.x + 4, y + rowH / 2, "left");
      var value = row[1];
      var text = row[3] === "pct" ? formatPct(value, 1) : row[3] === "num0" ? formatNumber(value, 0) : formatNumber(value, 2);
      var color = row[0].indexOf("peek") >= 0 ? COLORS.fixedP : row[0].indexOf("e") >= 0 ? COLORS.eprocess : COLORS.text;
      label(ctx, text, box.x + box.w - 4, y + rowH / 2, "right", color, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
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
      drawCapitalPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 244 });
      drawAuditPanel(ctx, result, { x: margin, y: 306, w: panelW, h: 230 });
      drawGrowthPanel(ctx, result, { x: margin, y: 570, w: panelW, h: 230 });
      drawLedgerPanel(ctx, result, { x: margin, y: 834, w: panelW, h: 206 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawCapitalPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 302 });
      drawAuditPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 302 });
      drawGrowthPanel(ctx, result, { x: margin, y: 382, w: panelW2, h: 258 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 382, w: panelW2, h: 258 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      alpha: formatPct(result.params.alpha, 0),
      bet: result.params.bet.toFixed(2),
      horizon: String(result.params.horizon),
      seed: String(result.params.seed),
      trueRate: formatPct(result.params.trueRate, 0)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("e boundary", formatNumber(result.boundary, 0)),
        metric("null e-cross", formatPct(result.nullRun.eCrossRate, 1)),
        metric("null peek-p", formatPct(result.nullRun.pPeekRate, 1)),
        metric("alt e-cross", formatPct(result.alt.eCrossRate, 1)),
        metric("alt final-p", formatPct(result.alt.finalPRejectRate, 1)),
        metric("median final e", formatNumber(result.alt.medianFinalE, 2)),
        metric("current growth", formatNumber(expectedLogGrowth(result.params.trueRate, result.params.bet), 4)),
        metric("log-optimal bet", result.optimalBet.toFixed(2))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-eprocess-lab]")).forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    expectedLogGrowth: expectedLogGrowth,
    oneSidedNormalP: oneSidedNormalP,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.EProcessBettingLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
