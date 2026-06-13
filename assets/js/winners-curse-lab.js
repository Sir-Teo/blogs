(function (global) {
  "use strict";

  var COLORS = {
    naive: "#be123c",
    shrink: "#2563eb",
    adjusted: "#0f766e",
    signal: "#d97706",
    value: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    band: "#dbeafe"
  };

  var MAX_NORMAL_MEAN = {
    2: 0.56,
    3: 0.85,
    4: 1.03,
    5: 1.16,
    6: 1.27,
    7: 1.35,
    8: 1.42,
    9: 1.49,
    10: 1.54,
    11: 1.59,
    12: 1.63
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatMoney(value) {
    if (!isFinite(value)) return "n/a";
    var sign = value < 0 ? "-" : "";
    var abs = Math.abs(value);
    if (abs >= 100) return sign + "$" + abs.toFixed(0);
    if (abs >= 10) return sign + "$" + abs.toFixed(1);
    return sign + "$" + abs.toFixed(2);
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="winners-curse-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32(index + 1, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2, seed));
    var u2 = uniform(index * 2 + 1, seed);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function cleanParams(params) {
    return {
      adjustment: clamp(params.adjustment, 0, 160) / 100,
      bidders: clamp(Math.round(params.bidders), 2, 12),
      reserve: clamp(params.reserve, 0, 130),
      signalNoise: clamp(params.signalNoise, 1, 60),
      trials: clamp(Math.round(params.trials), 400, 6000),
      valueVol: clamp(params.valueVol, 2, 50)
    };
  }

  function makeAuction(params, trial, bidders) {
    var mean = 100;
    var value = mean + params.valueVol * normal(trial + 17, 0x51f15eed);
    var signals = [];
    for (var i = 0; i < bidders; i += 1) {
      signals.push(value + params.signalNoise * normal(trial * 37 + i + 701, 0xbadc0de));
    }
    return { signals: signals, value: value };
  }

  function bidFromSignal(signal, params, rule, bidders) {
    var mean = 100;
    var tau2 = params.valueVol * params.valueVol;
    var sigma2 = params.signalNoise * params.signalNoise;
    var rho = tau2 / Math.max(1e-9, tau2 + sigma2);
    var posterior = mean + rho * (signal - mean);
    var curse = rho * params.signalNoise * (MAX_NORMAL_MEAN[bidders] || 1.5);
    if (rule === "naive") return signal;
    if (rule === "shrink") return posterior;
    return posterior - params.adjustment * curse;
  }

  function evaluateRule(params, bidders, rule) {
    var rows = [];
    var wins = 0;
    var totalProfit = 0;
    var totalPrice = 0;
    var totalSignalGap = 0;
    var totalPaymentGap = 0;
    var losses = 0;
    var noSale = 0;
    for (var t = 0; t < params.trials; t += 1) {
      var auction = makeAuction(params, t, bidders);
      var bids = auction.signals.map(function (signal) {
        return bidFromSignal(signal, params, rule, bidders);
      });
      var order = bids.map(function (bid, i) {
        return { bid: bid, i: i, signal: auction.signals[i] };
      }).sort(function (a, b) {
        return b.bid - a.bid;
      });
      var winner = order[0];
      var second = order[1];
      var price = Math.max(params.reserve, second ? second.bid : params.reserve);
      if (winner.bid < params.reserve) {
        noSale += 1;
        continue;
      }
      var profit = auction.value - price;
      wins += 1;
      totalProfit += profit;
      totalPrice += price;
      totalSignalGap += winner.signal - auction.value;
      totalPaymentGap += price - auction.value;
      if (profit < 0) losses += 1;
      rows.push({
        price: price,
        profit: profit,
        signalGap: winner.signal - auction.value,
        value: auction.value,
        winnerSignal: winner.signal
      });
    }
    return {
      lossRate: wins ? losses / wins : 0,
      meanPaymentGap: wins ? totalPaymentGap / wins : 0,
      meanPrice: wins ? totalPrice / wins : 0,
      meanProfit: wins ? totalProfit / wins : 0,
      meanSignalGap: wins ? totalSignalGap / wins : 0,
      noSaleRate: noSale / Math.max(1, params.trials),
      rows: rows,
      rule: rule,
      wins: wins
    };
  }

  function summarizeByBidders(params) {
    var out = [];
    var originalTrials = params.trials;
    var mini = Object.assign({}, params, { trials: Math.min(2200, originalTrials) });
    for (var n = 2; n <= 12; n += 1) {
      var naive = evaluateRule(mini, n, "naive");
      var adjusted = evaluateRule(mini, n, "adjusted");
      out.push({
        adjustedProfit: adjusted.meanProfit,
        bidders: n,
        naiveProfit: naive.meanProfit,
        signalGap: naive.meanSignalGap
      });
    }
    return out;
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function bucketize(rows) {
    var buckets = [];
    var min = -10;
    var max = 70;
    var count = 12;
    var width = (max - min) / count;
    for (var i = 0; i < count; i += 1) {
      var start = min + i * width;
      buckets.push({ count: 0, meanProfit: 0, profits: [], start: start, end: start + width });
    }
    rows.forEach(function (row) {
      var index = clamp(Math.floor((row.signalGap - min) / width), 0, count - 1);
      buckets[index].count += 1;
      buckets[index].profits.push(row.profit);
    });
    buckets.forEach(function (bucket) {
      bucket.meanProfit = mean(bucket.profits);
    });
    return buckets;
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var naive = evaluateRule(clean, clean.bidders, "naive");
    var shrink = evaluateRule(clean, clean.bidders, "shrink");
    var adjusted = evaluateRule(clean, clean.bidders, "adjusted");
    return {
      adjusted: adjusted,
      buckets: bucketize(naive.rows),
      byBidders: summarizeByBidders(clean),
      naive: naive,
      params: clean,
      shrink: shrink
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

  function drawProfitPanel(ctx, result, box) {
    panelTitle(ctx, box, "Winner profit", "second-price auction, common value object");
    var plot = { x: box.x + 38, y: box.y + 56, w: box.w - 54, h: box.h - 88 };
    var rows = [
      { color: COLORS.naive, label: "signal", value: result.naive.meanProfit, loss: result.naive.lossRate },
      { color: COLORS.shrink, label: "posterior", value: result.shrink.meanProfit, loss: result.shrink.lossRate },
      { color: COLORS.adjusted, label: "winner-aware", value: result.adjusted.meanProfit, loss: result.adjusted.lossRate }
    ];
    var maxAbs = Math.max.apply(null, rows.map(function (row) { return Math.abs(row.value); }).concat([1])) * 1.25;
    function yScale(v) { return plot.y + plot.h / 2 - v / maxAbs * (plot.h / 2); }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(0));
    ctx.lineTo(plot.x + plot.w, yScale(0));
    ctx.stroke();
    var gap = plot.w / rows.length;
    rows.forEach(function (row, i) {
      var x = plot.x + i * gap + gap * 0.25;
      var w = gap * 0.48;
      var y = yScale(Math.max(row.value, 0));
      var h = Math.abs(yScale(row.value) - yScale(0));
      ctx.fillStyle = row.color;
      ctx.fillRect(x, row.value >= 0 ? y : yScale(0), w, Math.max(1, h));
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatMoney(row.value), x + w / 2, row.value >= 0 ? y - 8 : yScale(0) + h + 15);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, x + w / 2, plot.y + plot.h + 15);
      ctx.fillText("loss " + formatPercent(row.loss * 100), x + w / 2, plot.y + plot.h + 30);
    });
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("signal " + formatMoney(result.naive.meanProfit), plot.x, plot.y + 12);
  }

  function drawConditioningPanel(ctx, result, box) {
    panelTitle(ctx, box, "Winning is selection", "when the winning signal is high, profit is usually low");
    var plot = { x: box.x + 42, y: box.y + 50, w: box.w - 58, h: box.h - 82 };
    var buckets = result.buckets;
    var maxCount = Math.max.apply(null, buckets.map(function (b) { return b.count; }).concat([1]));
    var maxAbsProfit = Math.max.apply(null, buckets.map(function (b) { return Math.abs(b.meanProfit); }).concat([1])) * 1.15;
    function xScale(i) { return plot.x + i / buckets.length * plot.w; }
    function yCount(count) { return plot.y + plot.h - count / maxCount * plot.h; }
    function yProfit(value) { return plot.y + plot.h / 2 - value / maxAbsProfit * (plot.h / 2); }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, yProfit(0));
    ctx.lineTo(plot.x + plot.w, yProfit(0));
    ctx.stroke();
    buckets.forEach(function (bucket, i) {
      var x = xScale(i);
      var w = plot.w / buckets.length - 2;
      ctx.fillStyle = COLORS.band;
      ctx.fillRect(x + 1, yCount(bucket.count), w, plot.y + plot.h - yCount(bucket.count));
    });
    ctx.strokeStyle = COLORS.naive;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    buckets.forEach(function (bucket, i) {
      var x = xScale(i + 0.5);
      var y = yProfit(bucket.meanProfit);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("gap " + formatMoney(result.naive.meanSignalGap), plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("winner signal minus true value", plot.x, plot.y + 38);
    ctx.textAlign = "center";
    [0, Math.floor(buckets.length / 2), buckets.length - 1].forEach(function (i) {
      var b = buckets[i];
      ctx.fillText(formatMoney((b.start + b.end) / 2), xScale(i + 0.5), plot.y + plot.h + 14);
    });
    ctx.textAlign = "right";
    ctx.fillText("profit", plot.x - 7, plot.y + 8);
    ctx.textAlign = "left";
  }

  function drawBidderPanel(ctx, result, box) {
    panelTitle(ctx, box, "More bidders, sharper curse", "the highest signal gets more selected for noise");
    var plot = { x: box.x + 42, y: box.y + 50, w: box.w - 58, h: box.h - 80 };
    var rows = result.byBidders;
    var values = rows.reduce(function (acc, row) {
      return acc.concat([row.naiveProfit, row.adjustedProfit]);
    }, []);
    var maxAbs = Math.max.apply(null, values.map(function (v) { return Math.abs(v); }).concat([1])) * 1.18;
    function xScale(n) { return plot.x + (n - 2) / 10 * plot.w; }
    function yScale(v) { return plot.y + plot.h / 2 - v / maxAbs * (plot.h / 2); }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(0));
    ctx.lineTo(plot.x + plot.w, yScale(0));
    ctx.stroke();
    [
      { color: COLORS.naive, key: "naiveProfit" },
      { color: COLORS.adjusted, key: "adjustedProfit" }
    ].forEach(function (series) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      rows.forEach(function (row, i) {
        var x = xScale(row.bidders);
        var y = yScale(row[series.key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(String(result.params.bidders) + " bidders", plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("red signal bid, green winner-aware bid", plot.x, plot.y + 38);
    ctx.textAlign = "center";
    [2, 7, 12].forEach(function (n) {
      ctx.fillText(String(n), xScale(n), plot.y + plot.h + 14);
    });
    ctx.textAlign = "right";
    ctx.fillText(formatMoney(maxAbs), plot.x - 7, plot.y + 4);
    ctx.fillText("-" + formatMoney(maxAbs).replace("-", ""), plot.x - 7, plot.y + plot.h - 8);
    ctx.textAlign = "left";
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Auction ledger", "a price is a conditional statistic");
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 64 };
    var rows = [
      ["auctions", formatNumber(result.params.trials)],
      ["bidders", String(result.params.bidders)],
      ["signal noise", formatMoney(result.params.signalNoise)],
      ["value volatility", formatMoney(result.params.valueVol)],
      ["reserve", formatMoney(result.params.reserve)],
      ["naive price-value", formatMoney(result.naive.meanPaymentGap)],
      ["naive loss rate", formatPercent(result.naive.lossRate * 100)],
      ["adjusted loss rate", formatPercent(result.adjusted.lossRate * 100)],
      ["no-sale adjusted", formatPercent(result.adjusted.noSaleRate * 100)]
    ];
    var rowGap = Math.min(25, Math.max(18, plot.h / rows.length));
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
    var height = compact ? 980 : 700;
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
      drawProfitPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 286 });
      drawConditioningPanel(ctx, result, { x: margin, y: 342, w: panelW, h: 202 });
      drawBidderPanel(ctx, result, { x: margin, y: 572, w: panelW, h: 202 });
      drawLedgerPanel(ctx, result, { x: margin, y: 804, w: panelW, h: 148 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawProfitPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 320 });
      drawConditioningPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 320 });
      drawBidderPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 244 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 244 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      adjustment: formatPercent(result.params.adjustment * 100),
      bidders: String(result.params.bidders),
      reserve: formatMoney(result.params.reserve),
      signalNoise: formatMoney(result.params.signalNoise),
      trials: formatNumber(result.params.trials),
      valueVol: formatMoney(result.params.valueVol)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Signal profit", formatMoney(result.naive.meanProfit)),
        metric("Adjusted profit", formatMoney(result.adjusted.meanProfit)),
        metric("Winner overestimate", formatMoney(result.naive.meanSignalGap)),
        metric("Naive loss rate", formatPercent(result.naive.lossRate * 100)),
        metric("Adjusted loss rate", formatPercent(result.adjusted.lossRate * 100)),
        metric("Mean price", formatMoney(result.naive.meanPrice))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-winners-curse-lab]")).forEach(init);
  }

  var api = {
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.WinnersCurseLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
