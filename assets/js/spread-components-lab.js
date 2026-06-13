(function (global) {
  "use strict";

  var COLORS = {
    order: "#0f766e",
    adverse: "#be123c",
    inventory: "#b45309",
    spread: "#2563eb",
    pnl: "#7c3aed",
    roll: "#64748b",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#edf2f7"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function formatBps(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0) + " bps";
    if (Math.abs(value) >= 10) return value.toFixed(1) + " bps";
    return value.toFixed(2) + " bps";
  }

  function formatPercent(value) {
    return value.toFixed(0) + "%";
  }

  function metric(label, value) {
    return '<div class="spread-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rng) {
    var u = Math.max(1e-9, rng());
    var v = Math.max(1e-9, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function posteriorComponents(params) {
    var alpha = clamp(params.informed / 100, 0, 0.95);
    var accuracy = clamp(params.accuracy / 100, 0.5, 1);
    var beta = clamp(0.5 + params.imbalance / 100, 0.05, 0.95);
    var jump = Math.max(0, params.valueJump);
    var buyGivenHigh = alpha * accuracy + (1 - alpha) * beta;
    var buyGivenLow = alpha * (1 - accuracy) + (1 - alpha) * beta;
    var sellGivenHigh = 1 - buyGivenHigh;
    var sellGivenLow = 1 - buyGivenLow;
    var pHighBuy = buyGivenHigh / Math.max(1e-9, buyGivenHigh + buyGivenLow);
    var pHighSell = sellGivenHigh / Math.max(1e-9, sellGivenHigh + sellGivenLow);
    var expectedBuy = (2 * pHighBuy - 1) * jump;
    var expectedSell = (2 * pHighSell - 1) * jump;
    var adverseHalf = Math.max(0, (expectedBuy - expectedSell) / 2);

    return {
      alpha: alpha,
      accuracy: accuracy,
      beta: beta,
      buyGivenHigh: buyGivenHigh,
      buyGivenLow: buyGivenLow,
      pHighBuy: pHighBuy,
      pHighSell: pHighSell,
      expectedBuy: expectedBuy,
      expectedSell: expectedSell,
      adverseHalf: adverseHalf
    };
  }

  function expectedInventoryHalf(params) {
    var beta = clamp(0.5 + params.imbalance / 100, 0.05, 0.95);
    var diffusion = 0.45 * Math.sqrt(params.trades) / 20;
    var drift = Math.abs(beta - 0.5) * params.trades / 28;
    return params.inventoryRisk * clamp(diffusion + drift, 0, 2.2);
  }

  function quoteForInventory(mid, q, params, components) {
    var riskLimit = 28;
    var inventoryHalf = params.inventoryRisk * Math.abs(q) / riskLimit;
    var skew = -params.inventoryRisk * q / riskLimit;
    var ask = mid + components.expectedBuy + params.orderCost + inventoryHalf + skew;
    var bid = mid + components.expectedSell - params.orderCost - inventoryHalf + skew;
    if (bid > ask) {
      var center = (ask + bid) / 2;
      ask = center + 0.01;
      bid = center - 0.01;
    }
    return {
      ask: ask,
      bid: bid,
      halfSpread: (ask - bid) / 2,
      inventoryHalf: inventoryHalf,
      skew: skew
    };
  }

  function covarianceLag(values) {
    if (values.length < 3) return 0;
    var x = [];
    for (var i = 1; i < values.length; i += 1) {
      x.push(values[i] - values[i - 1]);
    }
    var n = x.length - 1;
    if (n <= 1) return 0;
    var meanA = 0;
    var meanB = 0;
    for (var j = 1; j < x.length; j += 1) {
      meanA += x[j];
      meanB += x[j - 1];
    }
    meanA /= n;
    meanB /= n;
    var cov = 0;
    for (var k = 1; k < x.length; k += 1) {
      cov += (x[k] - meanA) * (x[k - 1] - meanB);
    }
    return cov / (n - 1);
  }

  function quantileAbs(values, q) {
    if (!values.length) return 0;
    var sorted = values.map(Math.abs).sort(function (a, b) { return a - b; });
    var index = clamp(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1);
    return sorted[index];
  }

  function simulate(params) {
    var components = posteriorComponents(params);
    var rng = makeRng(911 + params.informed * 17 + params.accuracy * 19 + params.trades * 23 + params.imbalance * 29);
    var mid = 0;
    var q = 0;
    var cash = 0;
    var trades = [];
    var transactionPrices = [];
    var inventoryPath = [];
    var pnlPath = [];
    var midsBefore = [];
    var midsAfter = [];
    var dirs = [];
    var effectiveHalf = [];
    var valueJump = params.valueJump;

    for (var i = 0; i < params.trades; i += 1) {
      var quote = quoteForInventory(mid, q, params, components);
      var state = rng() < 0.5 ? 1 : -1;
      var informed = rng() < components.alpha;
      var buy;
      var valueMove;

      if (informed) {
        var signal = rng() < components.accuracy ? state : -state;
        buy = signal > 0;
        valueMove = state * valueJump;
      } else {
        buy = rng() < components.beta;
        valueMove = normal(rng) * valueJump * 0.12;
      }

      var dir = buy ? 1 : -1;
      var price = buy ? quote.ask : quote.bid;
      if (buy) {
        q -= 1;
        cash += price;
      } else {
        q += 1;
        cash -= price;
      }

      midsBefore.push(mid);
      transactionPrices.push(price);
      dirs.push(dir);
      effectiveHalf.push(dir * (price - mid));
      mid += valueMove;
      midsAfter.push(mid);
      inventoryPath.push(q);
      pnlPath.push(cash + q * mid);
      trades.push({
        dir: dir,
        informed: informed,
        price: price,
        midBefore: midsBefore[midsBefore.length - 1],
        midAfter: mid,
        q: q,
        pnl: pnlPath[pnlPath.length - 1]
      });
    }

    var rollCov = covarianceLag(transactionPrices);
    var rollSpread = rollCov < 0 ? 2 * Math.sqrt(-rollCov) : 0;
    var lookahead = Math.max(1, Math.round(params.trades / 35));
    var realizedFull = [];
    var impactFull = [];
    for (var r = 0; r + lookahead < trades.length; r += 1) {
      realizedFull.push(2 * dirs[r] * (transactionPrices[r] - midsAfter[r + lookahead]));
      impactFull.push(2 * dirs[r] * (midsAfter[r + lookahead] - midsBefore[r]));
    }
    var avgEffective = 2 * average(effectiveHalf);
    var avgRealized = average(realizedFull);
    var avgImpact = average(impactFull);
    var finalPnl = pnlPath.length ? pnlPath[pnlPath.length - 1] : 0;
    var maxAbsInventory = quantileAbs(inventoryPath, 0.9);

    return {
      avgEffective: avgEffective,
      avgImpact: avgImpact,
      avgRealized: avgRealized,
      components: components,
      finalPnl: finalPnl,
      inventoryHalf: expectedInventoryHalf(params),
      inventoryPath: inventoryPath,
      maxAbsInventory: maxAbsInventory,
      pnlPath: pnlPath,
      quotedFull: 2 * (params.orderCost + components.adverseHalf + expectedInventoryHalf(params)),
      rollCov: rollCov,
      rollSpread: rollSpread,
      trades: trades
    };
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function sweepInformed(params) {
    var points = [];
    for (var informed = 0; informed <= 70; informed += 2) {
      var next = Object.assign({}, params, { informed: informed });
      var components = posteriorComponents(next);
      points.push({
        informed: informed,
        spread: 2 * (next.orderCost + components.adverseHalf + expectedInventoryHalf(next)),
        posteriorGap: components.pHighBuy - components.pHighSell
      });
    }
    return points;
  }

  function scale(values, low, high, pad) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (!isFinite(min) || !isFinite(max)) {
      min = 0;
      max = 1;
    }
    if (max === min) {
      max += 1;
      min -= 1;
    }
    var extra = (max - min) * (pad || 0);
    min -= extra;
    max += extra;
    return function (value) {
      return lerp(low, high, (value - min) / (max - min));
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

  function drawAxis(ctx, box) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();
  }

  function drawComponents(ctx, result, params, box) {
    panelTitle(ctx, box, "Half-spread components", "what the dealer is charging for");
    var plot = { x: box.x, y: box.y + 42, w: box.w, h: box.h - 48 };
    var parts = [
      { label: "order", value: params.orderCost, color: COLORS.order },
      { label: "adverse", value: result.components.adverseHalf, color: COLORS.adverse },
      { label: "inventory", value: result.inventoryHalf, color: COLORS.inventory }
    ];
    var total = parts.reduce(function (sum, part) { return sum + part.value; }, 0);
    var max = Math.max(1, total * 1.18);
    var barX = plot.x;
    var barY = plot.y + 38;
    var barH = 28;
    var cursor = barX;

    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(barX, barY, plot.w, barH);
    parts.forEach(function (part) {
      var width = plot.w * part.value / max;
      ctx.fillStyle = part.color;
      ctx.fillRect(cursor, barY, width, barH);
      cursor += width;
    });

    ctx.fillStyle = COLORS.text;
    ctx.font = "700 23px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(formatBps(2 * total), plot.x, plot.y);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("quoted full spread", plot.x + 126, plot.y + 8);

    parts.forEach(function (part, index) {
      var y = barY + barH + 22 + index * 20;
      ctx.fillStyle = part.color;
      ctx.fillRect(plot.x, y - 8, 9, 9);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(part.label, plot.x + 16, y - 10);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(formatBps(part.value), plot.x + plot.w, y - 10);
      ctx.textAlign = "left";
    });
  }

  function drawPosterior(ctx, result, box) {
    panelTitle(ctx, box, "Bayes at the touch", "how much a buy order says");
    var plot = { x: box.x, y: box.y + 46, w: box.w, h: box.h - 58 };
    var rows = [
      { label: "P(high | buy)", value: result.components.pHighBuy, color: COLORS.adverse },
      { label: "P(high | sell)", value: result.components.pHighSell, color: COLORS.spread }
    ];

    rows.forEach(function (row, index) {
      var y = plot.y + index * 50;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x, y, plot.w, 22);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, plot.w * row.value, 22);
      ctx.fillStyle = COLORS.text;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, plot.x, y - 8);
      ctx.textAlign = "right";
      ctx.fillText(formatPercent(row.value * 100), plot.x + plot.w, y - 8);
      ctx.textAlign = "left";
    });

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x + plot.w / 2, plot.y - 16);
    ctx.lineTo(plot.x + plot.w / 2, plot.y + 86);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("uninformative", plot.x + plot.w / 2, plot.y + 96);
    ctx.textAlign = "left";
  }

  function drawPaths(ctx, result, box) {
    panelTitle(ctx, box, "Inventory and marked P&L", "one deterministic Monte Carlo tape");
    var plot = { x: box.x + 38, y: box.y + 38, w: box.w - 44, h: box.h - 54 };
    drawAxis(ctx, plot);

    var n = Math.max(1, result.inventoryPath.length - 1);
    var invValues = result.inventoryPath.concat([-1, 1]);
    var pnlValues = result.pnlPath.concat([0]);
    var invY = scale(invValues, plot.y + plot.h, plot.y, 0.12);
    var pnlY = scale(pnlValues, plot.y + plot.h, plot.y, 0.12);
    var x = function (i) { return plot.x + plot.w * i / n; };

    ctx.strokeStyle = COLORS.faint;
    ctx.lineWidth = 1;
    [-20, 0, 20].forEach(function (tick) {
      var y = invY(tick);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });

    ctx.strokeStyle = COLORS.inventory;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.inventoryPath.forEach(function (value, i) {
      if (i === 0) ctx.moveTo(x(i), invY(value));
      else ctx.lineTo(x(i), invY(value));
    });
    ctx.stroke();

    ctx.strokeStyle = COLORS.pnl;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.pnlPath.forEach(function (value, i) {
      if (i === 0) ctx.moveTo(x(i), pnlY(value));
      else ctx.lineTo(x(i), pnlY(value));
    });
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("inventory", plot.x - 8, plot.y + 8);
    ctx.textAlign = "left";
    ctx.fillText("P&L", plot.x + plot.w - 24, plot.y + 8);
  }

  function drawSweep(ctx, result, params, box) {
    panelTitle(ctx, box, "Spread versus informed flow", "holding the other controls fixed");
    var points = sweepInformed(params);
    var plot = { x: box.x + 42, y: box.y + 38, w: box.w - 54, h: box.h - 58 };
    drawAxis(ctx, plot);

    var spreads = points.map(function (point) { return point.spread; });
    spreads.push(result.quotedFull);
    if (result.rollSpread > 0) spreads.push(result.rollSpread);
    var yScale = scale(spreads.concat([0]), plot.y + plot.h, plot.y, 0.14);
    var xScale = function (informed) { return plot.x + plot.w * informed / 70; };

    [0, 0.5, 1].forEach(function (tick) {
      var y = lerp(plot.y + plot.h, plot.y, tick);
      ctx.strokeStyle = COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });

    ctx.strokeStyle = COLORS.spread;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xScale(point.informed);
      var y = yScale(point.spread);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    var currentX = xScale(params.informed);
    var currentY = yScale(result.quotedFull);
    ctx.fillStyle = COLORS.adverse;
    ctx.beginPath();
    ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
    ctx.fill();

    if (result.rollSpread > 0) {
      var rollY = yScale(result.rollSpread);
      ctx.strokeStyle = COLORS.roll;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(plot.x, rollY);
      ctx.lineTo(plot.x + plot.w, rollY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.roll;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("Roll " + formatBps(result.rollSpread), plot.x + plot.w, rollY - 6);
      ctx.textAlign = "left";
    }

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    [0, 35, 70].forEach(function (tick) {
      ctx.fillText(tick + "%", xScale(tick), plot.y + plot.h + 10);
    });
    ctx.textAlign = "right";
    [0, 0.5, 1].forEach(function (tick) {
      var sample = lerp(Math.min.apply(null, spreads), Math.max.apply(null, spreads), tick);
      ctx.fillText(formatBps(sample).replace(" bps", ""), plot.x - 8, yScale(sample) + 4);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 840 : 660;
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

    var margin = compact ? 26 : 34;
    var gap = compact ? 36 : 42;
    if (compact) {
      var panelW = width - margin * 2;
      var top = 28;
      drawComponents(ctx, result, params, { x: margin, y: top, w: panelW, h: 150 });
      drawPosterior(ctx, result, { x: margin, y: top + 174, w: panelW, h: 150 });
      drawPaths(ctx, result, { x: margin, y: top + 348, w: panelW, h: 214 });
      drawSweep(ctx, result, params, { x: margin, y: top + 600, w: panelW, h: 208 });
    } else {
      var topW = (width - margin * 2 - gap) / 2;
      drawComponents(ctx, result, params, { x: margin, y: 30, w: topW, h: 170 });
      drawPosterior(ctx, result, { x: margin + topW + gap, y: 30, w: topW, h: 170 });
      drawPaths(ctx, result, { x: margin, y: 238, w: width - margin * 2, h: 190 });
      drawSweep(ctx, result, params, { x: margin, y: 468, w: width - margin * 2, h: 160 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var values = {
      informed: formatPercent(params.informed),
      accuracy: formatPercent(params.accuracy),
      valueJump: formatBps(params.valueJump),
      orderCost: formatBps(params.orderCost),
      inventoryRisk: formatBps(params.inventoryRisk),
      imbalance: (params.imbalance > 0 ? "+" : "") + params.imbalance + "%",
      trades: String(params.trades)
    };

    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Quoted spread", formatBps(result.quotedFull)),
        metric("Adverse half", formatBps(result.components.adverseHalf)),
        metric("P(high | buy)", formatPercent(result.components.pHighBuy * 100)),
        metric("Realized spread", formatBps(result.avgRealized)),
        metric("Roll estimate", result.rollSpread > 0 ? formatBps(result.rollSpread) : "no bounce"),
        metric("P&L per trade", formatBps(result.finalPnl / params.trades))
      ].join("");
    }

    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result, params);
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-spread-lab]")).forEach(init);
  }

  var api = {
    posteriorComponents: posteriorComponents,
    quoteForInventory: quoteForInventory,
    simulate: simulate,
    sweepInformed: sweepInformed
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.SpreadComponentsLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
