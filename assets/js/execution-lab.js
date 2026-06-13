(function () {
  var COLORS = {
    optimal: "#0f766e",
    vwap: "#b45309",
    frontier: "#7c3aed",
    current: "#2563eb",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

  function formatVol(raw) {
    return (raw / 100).toFixed(1) + "%";
  }

  function formatHours(minutes) {
    return (minutes / 60).toFixed(1) + " h";
  }

  function urgencyLambda(raw) {
    return Math.pow(10, -4 + raw / 25);
  }

  function solveTridiagonal(lower, diag, upper, rhs) {
    var n = diag.length;
    var c = upper.slice();
    var d = diag.slice();
    var b = rhs.slice();
    var x = Array(n).fill(0);

    for (var i = 1; i < n; i += 1) {
      var w = lower[i - 1] / d[i - 1];
      d[i] -= w * c[i - 1];
      b[i] -= w * b[i - 1];
    }

    x[n - 1] = b[n - 1] / d[n - 1];
    for (var j = n - 2; j >= 0; j -= 1) {
      x[j] = (b[j] - c[j] * x[j + 1]) / d[j];
    }
    return x;
  }

  function enforceLiquidation(inventory) {
    var n = inventory.length - 1;
    var out = inventory.slice();
    out[0] = 1;
    out[n] = 0;

    for (var i = 1; i < n; i += 1) {
      out[i] = clamp(out[i], 0, out[i - 1]);
    }
    for (var j = n - 1; j >= 1; j -= 1) {
      out[j] = Math.max(out[j], out[j + 1]);
    }
    return out;
  }

  function optimalInventory(params, urgencyRaw) {
    var n = params.slices;
    var m = n - 1;
    if (m <= 0) return [1, 0];

    var orderRel = params.order / 10;
    var horizonDays = params.horizon / 390;
    var dt = horizonDays / n;
    var impactCoeff = Math.max(0.05, params.impact * orderRel * n);
    var riskCoeff = urgencyLambda(urgencyRaw) * Math.pow(params.volatility, 2) * dt;
    var driftStep = params.drift * dt;
    var lower = Array(m - 1).fill(-impactCoeff);
    var upper = Array(m - 1).fill(-impactCoeff);
    var diag = Array(m).fill(2 * impactCoeff + riskCoeff);
    var rhs = Array(m).fill(driftStep / 2);

    rhs[0] += impactCoeff;
    var middle = solveTridiagonal(lower, diag, upper, rhs);
    return enforceLiquidation([1].concat(middle, [0]));
  }

  function vwapInventory(n) {
    var out = [];
    for (var i = 0; i <= n; i += 1) out.push(1 - i / n);
    return out;
  }

  function tradesFromInventory(inventory) {
    var trades = [];
    for (var i = 1; i < inventory.length; i += 1) {
      trades.push(Math.max(0, inventory[i - 1] - inventory[i]));
    }
    var total = trades.reduce(function (sum, value) { return sum + value; }, 0);
    if (total > 0) {
      trades = trades.map(function (value) { return value / total; });
    }
    return trades;
  }

  function scheduleMetrics(inventory, params) {
    var n = params.slices;
    var trades = tradesFromInventory(inventory);
    var orderRel = params.order / 10;
    var horizonDays = params.horizon / 390;
    var tempConcentration = n * trades.reduce(function (sum, value) {
      return sum + value * value;
    }, 0);
    var tempCost = params.impact * orderRel * tempConcentration;
    var spreadCost = params.spread;
    var avgInventory = 0;
    var riskInventory = 0;

    for (var i = 0; i < n; i += 1) {
      avgInventory += inventory[i];
      riskInventory += inventory[i] * inventory[i];
    }
    avgInventory /= n;
    riskInventory /= n;

    var driftBenefit = params.drift * horizonDays * avgInventory;
    var expectedCost = spreadCost + tempCost - driftBenefit;
    var riskStd = params.volatility * Math.sqrt(horizonDays * riskInventory);
    var lvar95 = expectedCost + 1.645 * riskStd;
    var firstParticipation = 100 * (params.order / 100) * n * trades[0];
    var halfLife = n;
    for (var j = 0; j < inventory.length; j += 1) {
      if (inventory[j] <= 0.5) {
        halfLife = j;
        break;
      }
    }

    return {
      avgInventory: avgInventory,
      expectedCost: expectedCost,
      firstParticipation: firstParticipation,
      halfLife: halfLife / n,
      lvar95: lvar95,
      riskStd: riskStd,
      tempCost: tempCost,
      trades: trades
    };
  }

  function evaluate(params) {
    var optimal = optimalInventory(params, params.urgency);
    var vwap = vwapInventory(params.slices);
    var optimalMetrics = scheduleMetrics(optimal, params);
    var vwapMetrics = scheduleMetrics(vwap, params);
    var frontier = [];

    for (var urgency = 0; urgency <= 100; urgency += 4) {
      var inventory = optimalInventory(params, urgency);
      var metrics = scheduleMetrics(inventory, params);
      frontier.push({
        urgency: urgency,
        cost: metrics.expectedCost,
        risk: metrics.riskStd,
        lvar95: metrics.lvar95
      });
    }

    return {
      frontier: frontier,
      optimal: optimal,
      optimalMetrics: optimalMetrics,
      vwap: vwap,
      vwapMetrics: vwapMetrics
    };
  }

  function metric(label, value) {
    return '<div class="execution-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawPath(ctx, inventory, xScale, yScale, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    inventory.forEach(function (value, i) {
      var x = xScale(i);
      var y = yScale(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawChart(canvas, result, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var height = 460;
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

    var compact = width < 620;
    var left = compact ? 48 : 58;
    var right = compact ? 22 : 34;
    var top = 36;
    var pathHeight = compact ? 150 : 168;
    var gap = compact ? 58 : 62;
    var frontierTop = top + pathHeight + gap;
    var frontierHeight = compact ? 150 : 168;
    var plotWidth = width - left - right;
    var n = params.slices;

    function pathX(i) {
      return left + i / n * plotWidth;
    }

    function pathY(value) {
      return top + (1 - value) * pathHeight;
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + pathHeight);
    ctx.lineTo(width - right, top + pathHeight);
    ctx.stroke();

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Inventory remaining through the execution horizon", left, top - 10);

    [0, 0.5, 1].forEach(function (tick) {
      var y = pathY(tick);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(tick * 100)) + "%", left - 8, y);
    });

    drawPath(ctx, result.vwap, pathX, pathY, COLORS.vwap, 2);
    drawPath(ctx, result.optimal, pathX, pathY, COLORS.optimal, 3);

    [0, Math.round(n / 2), n].forEach(function (tick) {
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(tick === n ? "finish" : String(tick), pathX(tick), top + pathHeight + 8);
    });

    var risks = result.frontier.map(function (point) { return point.risk; });
    var costs = result.frontier.map(function (point) { return point.cost; });
    risks.push(result.vwapMetrics.riskStd);
    costs.push(result.vwapMetrics.expectedCost);
    var minRisk = Math.min.apply(null, risks);
    var maxRisk = Math.max.apply(null, risks);
    var minCost = Math.min.apply(null, costs);
    var maxCost = Math.max.apply(null, costs);
    if (maxRisk === minRisk) maxRisk += 1;
    if (maxCost === minCost) maxCost += 1;
    var riskPad = (maxRisk - minRisk) * 0.12;
    var costPad = (maxCost - minCost) * 0.18;
    minRisk = Math.max(0, minRisk - riskPad);
    maxRisk += riskPad;
    minCost -= costPad;
    maxCost += costPad;

    function frontierX(risk) {
      return left + (risk - minRisk) / (maxRisk - minRisk) * plotWidth;
    }

    function frontierY(cost) {
      return frontierTop + frontierHeight - (cost - minCost) / (maxCost - minCost) * frontierHeight;
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, frontierTop);
    ctx.lineTo(left, frontierTop + frontierHeight);
    ctx.lineTo(width - right, frontierTop + frontierHeight);
    ctx.stroke();

    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Cost-risk frontier", left, frontierTop - 10);

    [0, 0.5, 1].forEach(function (tick) {
      var cost = minCost + (maxCost - minCost) * tick;
      var y = frontierY(cost);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(formatBps(cost).replace(" bps", ""), left - 8, y);
    });

    ctx.strokeStyle = COLORS.frontier;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.frontier.forEach(function (point, index) {
      var x = frontierX(point.risk);
      var y = frontierY(point.cost);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    result.frontier.forEach(function (point) {
      ctx.fillStyle = COLORS.frontier;
      ctx.beginPath();
      ctx.arc(frontierX(point.risk), frontierY(point.cost), 2.2, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = COLORS.vwap;
    ctx.beginPath();
    ctx.arc(frontierX(result.vwapMetrics.riskStd), frontierY(result.vwapMetrics.expectedCost), 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.current;
    ctx.beginPath();
    ctx.arc(frontierX(result.optimalMetrics.riskStd), frontierY(result.optimalMetrics.expectedCost), 5.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    [minRisk, (minRisk + maxRisk) / 2, maxRisk].forEach(function (risk) {
      ctx.fillText(formatBps(risk).replace(" bps", ""), frontierX(risk), frontierTop + frontierHeight + 8);
    });
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });

    var values = {
      order: params.order + "% ADV",
      volatility: formatVol(params.volatility),
      impact: params.impact + " bps",
      spread: params.spread + " bps",
      horizon: formatHours(params.horizon),
      urgency: formatPercent(params.urgency),
      drift: params.drift + " bps/day",
      slices: String(params.slices)
    };

    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var result = evaluate(params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Expected cost", formatBps(result.optimalMetrics.expectedCost)),
        metric("Risk std", formatBps(result.optimalMetrics.riskStd)),
        metric("L-VaR 95", formatBps(result.optimalMetrics.lvar95)),
        metric("First slice participation", formatPercent(result.optimalMetrics.firstParticipation)),
        metric("Inventory half-life", formatPercent(100 * result.optimalMetrics.halfLife)),
        metric("VWAP L-VaR 95", formatBps(result.vwapMetrics.lvar95))
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
    window.addEventListener("resize", redraw);
    redraw();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-execution-lab]").forEach(init);
  });
}());
