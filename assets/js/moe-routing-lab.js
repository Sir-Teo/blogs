(function () {
  var COLORS = {
    served: "#0f766e",
    quality: "#b45309",
    balance: "#2563eb",
    bad: "#be123c",
    spare: "#94a3b8",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5"
  };

  var TYPES = ["Code", "Math", "Facts", "Dialog", "Tables", "Logic"];

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

  function normalize(values) {
    var total = values.reduce(function (sum, value) {
      return sum + Math.max(0, value);
    }, 0);
    if (!total) return values.map(function () { return 1 / values.length; });
    return values.map(function (value) { return Math.max(0, value) / total; });
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits || 0) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="moe-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function topIndices(values, k) {
    var order = values.map(function (value, index) {
      return { value: value, index: index };
    });
    order.sort(function (a, b) {
      return b.value - a.value;
    });
    return order.slice(0, k).map(function (item) { return item.index; });
  }

  function typeDistribution(skew) {
    var sharpness = skew / 100;
    return normalize(TYPES.map(function (_, index) {
      return Math.exp(-sharpness * index * 0.74);
    }));
  }

  function sampleCategorical(rand, probabilities) {
    var draw = rand();
    var cumulative = 0;
    for (var i = 0; i < probabilities.length; i += 1) {
      cumulative += probabilities[i];
      if (draw <= cumulative) return i;
    }
    return probabilities.length - 1;
  }

  function makeTokens(params) {
    var rand = rng(20260613 + params.tokens * 3 + params.experts * 17 + params.skew * 19);
    var probabilities = typeDistribution(params.skew);
    var tokens = [];
    for (var i = 0; i < params.tokens; i += 1) {
      var type = sampleCategorical(rand, probabilities);
      tokens.push({
        id: i,
        type: type,
        localDifficulty: clamp(0.5 + 0.28 * normal(rand), 0.04, 0.96)
      });
    }
    return {
      probabilities: probabilities,
      tokens: tokens
    };
  }

  function makeExperts(params) {
    var strength = params.specialization / 100;
    var experts = [];

    for (var expert = 0; expert < params.experts; expert += 1) {
      var primary = expert % TYPES.length;
      var secondary = (expert * 2 + 1) % TYPES.length;
      var quality = TYPES.map(function (_, type) {
        var jitter = 0.035 * Math.sin((expert + 1) * (type + 3));
        var value = 0.42 + jitter;
        if (type === primary) value += 0.16 + 0.42 * strength;
        else if (type === secondary) value += 0.08 + 0.20 * strength;
        else value -= 0.08 * strength;
        return clamp(value, 0.05, 0.98);
      });

      experts.push({
        id: expert,
        primary: primary,
        secondary: secondary,
        quality: quality
      });
    }

    return experts;
  }

  function makeScoreMatrix(tokens, experts, params) {
    var rand = rng(
      19790505
      + params.tokens * 11
      + params.experts * 29
      + params.skew * 31
      + params.noise * 37
      + params.specialization * 41
    );
    var noise = params.noise / 100;
    var skew = params.skew / 100;
    var scores = [];

    tokens.forEach(function (token) {
      var row = [];
      experts.forEach(function (expert) {
        var affinity = expert.quality[token.type];
        var popularExpertBias = (expert.id === 0 ? 0.34 : expert.id === 1 ? 0.16 : 0) * skew;
        var commonTypeBias = token.type === expert.primary ? 0.13 * skew : 0;
        var difficultyPenalty = 0.18 * token.localDifficulty * noise;
        row.push(
          3.0 * (affinity - 0.5)
          + popularExpertBias
          + commonTypeBias
          - difficultyPenalty
          + normal(rand) * (0.12 + 1.05 * noise)
        );
      });
      scores.push(row);
    });

    return scores;
  }

  function expertCapacity(params) {
    var budget = params.tokens * params.topK * (params.capacity / 100);
    return Math.max(1, Math.ceil(budget / params.experts));
  }

  function bestQualityByType(experts) {
    return TYPES.map(function (_, type) {
      return experts.reduce(function (best, expert) {
        return Math.max(best, expert.quality[type]);
      }, 0);
    });
  }

  function summarize(params, tokens, experts, assignments, loads, overflowAttempts, capacity) {
    var bestByType = bestQualityByType(experts);
    var typeExpert = TYPES.map(function () {
      return experts.map(function () { return 0; });
    });
    var histogram = [0, 0, 0, 0];
    var served = 0;
    var qualitySum = 0;
    var regretSum = 0;
    var totalAssignments = 0;

    tokens.forEach(function (token, index) {
      var assigned = assignments[index];
      histogram[Math.min(3, assigned.length)] += 1;
      totalAssignments += assigned.length;

      if (!assigned.length) return;
      served += 1;

      var bestAssigned = 0;
      var assignedQuality = assigned.reduce(function (sum, expertIndex) {
        var quality = experts[expertIndex].quality[token.type];
        typeExpert[token.type][expertIndex] += 1;
        bestAssigned = Math.max(bestAssigned, quality);
        return sum + quality;
      }, 0) / assigned.length;

      var tokenQuality = clamp(assignedQuality + 0.045 * Math.log(assigned.length), 0, 1);
      qualitySum += tokenQuality;
      regretSum += Math.max(0, bestByType[token.type] - bestAssigned);
    });

    var meanLoad = loads.reduce(function (sum, load) { return sum + load; }, 0) / loads.length;
    var variance = loads.reduce(function (sum, load) {
      return sum + Math.pow(load - meanLoad, 2);
    }, 0) / loads.length;
    var loadCv = meanLoad > 0 ? Math.sqrt(variance) / meanLoad : 0;
    var maxLoad = loads.reduce(function (best, load) { return Math.max(best, load); }, 0);
    var saturated = loads.filter(function (load) { return load >= capacity; }).length / loads.length;

    return {
      assignments: assignments,
      capacity: capacity,
      dropped: tokens.length - served,
      experts: experts,
      histogram: histogram,
      loads: loads,
      loadCv: loadCv,
      maxLoad: maxLoad,
      meanRoutes: totalAssignments / tokens.length,
      overflowAttempts: overflowAttempts,
      quality: qualitySum / tokens.length,
      regret: served ? regretSum / served : 0,
      saturation: saturated,
      served: served,
      servedRate: served / tokens.length,
      tokens: tokens,
      totalAssignments: totalAssignments,
      typeExpert: typeExpert,
      utilization: totalAssignments / (capacity * experts.length)
    };
  }

  function runTokenChoice(params) {
    var tokenData = makeTokens(params);
    var experts = makeExperts(params);
    var scores = makeScoreMatrix(tokenData.tokens, experts, params);
    var capacity = expertCapacity(params);
    var loads = experts.map(function () { return 0; });
    var assignments = tokenData.tokens.map(function () { return []; });
    var overflowAttempts = 0;
    var balancePressure = params.balance / 100;

    tokenData.tokens.forEach(function (_, tokenIndex) {
      var adjusted = scores[tokenIndex].map(function (score, expertIndex) {
        return score - balancePressure * 2.7 * (loads[expertIndex] / capacity);
      });
      var picks = topIndices(adjusted, params.topK);

      picks.forEach(function (expertIndex) {
        if (loads[expertIndex] < capacity) {
          loads[expertIndex] += 1;
          assignments[tokenIndex].push(expertIndex);
        } else {
          overflowAttempts += 1;
        }
      });
    });

    return summarize(params, tokenData.tokens, experts, assignments, loads, overflowAttempts, capacity);
  }

  function runExpertChoice(params) {
    var tokenData = makeTokens(params);
    var experts = makeExperts(params);
    var scores = makeScoreMatrix(tokenData.tokens, experts, params);
    var capacity = expertCapacity(params);
    var loads = experts.map(function () { return 0; });
    var assignments = tokenData.tokens.map(function () { return []; });

    experts.forEach(function (_, expertIndex) {
      var ranked = tokenData.tokens.map(function (token, tokenIndex) {
        return {
          tokenIndex: tokenIndex,
          value: scores[tokenIndex][expertIndex] - 0.18 * token.localDifficulty
        };
      });
      ranked.sort(function (a, b) { return b.value - a.value; });
      ranked.slice(0, capacity).forEach(function (item) {
        loads[expertIndex] += 1;
        assignments[item.tokenIndex].push(expertIndex);
      });
    });

    return summarize(params, tokenData.tokens, experts, assignments, loads, 0, capacity);
  }

  function runSimulation(params) {
    if (params.policy === "expert") return runExpertChoice(params);
    return runTokenChoice(params);
  }

  function sweepCapacity(params) {
    var points = [];
    for (var capacity = 60; capacity <= 200; capacity += 10) {
      var candidate = {};
      Object.keys(params).forEach(function (key) { candidate[key] = params[key]; });
      candidate.capacity = capacity;
      var result = runSimulation(candidate);
      points.push({
        capacity: capacity,
        quality: result.quality,
        servedRate: result.servedRate,
        utilization: result.utilization
      });
    }
    return points;
  }

  function drawLabel(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  function fillRounded(ctx, x, y, width, height, radius, color) {
    roundedRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function mixChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function mixColor(from, to, t) {
    var a = hexToRgb(from);
    var b = hexToRgb(to);
    return "rgb(" + mixChannel(a.r, b.r, t) + "," + mixChannel(a.g, b.g, t) + "," + mixChannel(a.b, b.b, t) + ")";
  }

  function drawLoads(ctx, result, left, top, width, height) {
    var experts = result.experts.length;
    var barGap = Math.max(4, width / experts * 0.12);
    var barWidth = (width - barGap * (experts - 1)) / experts;
    var maxScale = Math.max(result.capacity, result.maxLoad) * 1.12;

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawLabel(ctx, "Expert queues", left, top - 16, "left", "bottom", COLORS.text);
    drawLabel(ctx, "capacity " + result.capacity + " routes/expert", left + width, top - 16, "right", "bottom", COLORS.muted);

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    var capY = top + height - (result.capacity / maxScale) * height;
    ctx.moveTo(left, capY);
    ctx.lineTo(left + width, capY);
    ctx.stroke();
    drawLabel(ctx, "cap", left + width + 4, capY, "left", "middle", COLORS.muted);

    result.loads.forEach(function (load, index) {
      var x = left + index * (barWidth + barGap);
      var barHeight = maxScale > 0 ? (load / maxScale) * height : 0;
      var y = top + height - barHeight;
      var pressure = load / result.capacity;
      var color = pressure > 0.98 ? COLORS.bad : mixColor("#dbeafe", COLORS.balance, clamp(pressure, 0, 1));

      fillRounded(ctx, x, y, barWidth, barHeight, 4, color);
      drawLabel(ctx, String(index + 1), x + barWidth / 2, top + height + 16, "center", "top", COLORS.muted);
      if (barWidth > 28) {
        drawLabel(ctx, String(load), x + barWidth / 2, y - 5, "center", "bottom", COLORS.text);
      }
    });

    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, width, height);
  }

  function drawHeatmap(ctx, result, left, top, width, height) {
    var rows = TYPES.length;
    var cols = result.experts.length;
    var labelWidth = 48;
    var heatLeft = left + labelWidth;
    var cellW = (width - labelWidth) / cols;
    var cellH = height / rows;
    var maxCell = 1;

    result.typeExpert.forEach(function (row) {
      row.forEach(function (value) { maxCell = Math.max(maxCell, value); });
    });

    drawLabel(ctx, "Who served which token type", left, top - 14, "left", "bottom", COLORS.text);

    for (var row = 0; row < rows; row += 1) {
      drawLabel(ctx, TYPES[row], heatLeft - 8, top + row * cellH + cellH / 2, "right", "middle", COLORS.muted);
      for (var col = 0; col < cols; col += 1) {
        var value = result.typeExpert[row][col];
        var intensity = Math.sqrt(value / maxCell);
        ctx.fillStyle = mixColor("#f8fafc", COLORS.served, intensity);
        ctx.fillRect(heatLeft + col * cellW, top + row * cellH, Math.ceil(cellW), Math.ceil(cellH));
        if (intensity > 0.5 && cellW > 26) {
          drawLabel(ctx, String(value), heatLeft + col * cellW + cellW / 2, top + row * cellH + cellH / 2, "center", "middle", "#ffffff");
        }
      }
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(heatLeft, top, width - labelWidth, height);
  }

  function drawCapacityCurve(ctx, result, sweep, params, left, top, width, height) {
    var xMin = 60;
    var xMax = 200;
    var yMin = 0;
    var yMax = 1;

    function xScale(capacity) {
      return left + (capacity - xMin) / (xMax - xMin) * width;
    }

    function yScale(value) {
      return top + height - (value - yMin) / (yMax - yMin) * height;
    }

    drawLabel(ctx, "Capacity sweep", left, top - 14, "left", "bottom", COLORS.text);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, width, height);

    [0, 0.5, 1].forEach(function (tick) {
      var y = yScale(tick);
      ctx.strokeStyle = COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      drawLabel(ctx, formatPercent(tick), left - 8, y, "right", "middle", COLORS.muted);
    });

    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      sweep.forEach(function (point, index) {
        var x = xScale(point.capacity);
        var y = yScale(point[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    line("servedRate", COLORS.served);
    line("quality", COLORS.quality);

    var currentX = xScale(params.capacity);
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(currentX, top);
    ctx.lineTo(currentX, top + height);
    ctx.stroke();
    ctx.setLineDash([]);

    drawLabel(ctx, "served", left + width - 76, top + 18, "left", "middle", COLORS.served);
    drawLabel(ctx, "batch score", left + width - 76, top + 36, "left", "middle", COLORS.quality);
    drawLabel(ctx, "current", currentX + 4, top + height - 8, "left", "bottom", COLORS.text);
  }

  function drawHistogram(ctx, result, left, top, width, height) {
    var labels = ["0", "1", "2", "3+"];
    var maxValue = Math.max.apply(null, result.histogram.concat([1]));
    var barGap = 10;
    var barWidth = (width - barGap * (labels.length - 1)) / labels.length;

    drawLabel(ctx, "Routes per token", left, top - 14, "left", "bottom", COLORS.text);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, width, height);

    result.histogram.forEach(function (count, index) {
      var x = left + index * (barWidth + barGap);
      var barHeight = count / maxValue * (height - 28);
      var y = top + height - 22 - barHeight;
      var color = index === 0 ? COLORS.bad : index === 1 ? COLORS.served : COLORS.balance;
      fillRounded(ctx, x, y, barWidth, barHeight, 4, color);
      drawLabel(ctx, labels[index], x + barWidth / 2, top + height - 6, "center", "bottom", COLORS.muted);
      drawLabel(ctx, String(count), x + barWidth / 2, y - 5, "center", "bottom", COLORS.text);
    });
  }

  function drawChart(canvas, result, sweep, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 780 : 650;
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

    var left = compact ? 54 : 58;
    var right = compact ? 18 : 26;
    var plotW = width - left - right;

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawLoads(ctx, result, left, 44, plotW - 16, 162);
    drawHeatmap(ctx, result, left, 276, plotW, 180);

    if (compact) {
      drawCapacityCurve(ctx, result, sweep, params, left, 512, plotW, 150);
      drawHistogram(ctx, result, left, 710, plotW, 58);
    } else {
      drawCapacityCurve(ctx, result, sweep, params, left, 512, plotW * 0.62, 112);
      drawHistogram(ctx, result, left + plotW * 0.68, 512, plotW * 0.32, 112);
    }
  }

  function parseParams(root) {
    var params = {
      balance: 30,
      capacity: 115,
      experts: 8,
      noise: 28,
      policy: "token",
      skew: 55,
      specialization: 72,
      tokens: 384,
      topK: 2
    };

    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      var value = input.value;
      params[key] = input.tagName === "SELECT" ? value : Number(value);
    });

    params.topK = Number(params.topK);
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "capacity") output.textContent = formatNumber(params.capacity / 100, 2) + "x";
      else if (key === "balance" || key === "noise" || key === "skew" || key === "specialization") {
        output.textContent = params[key] + "%";
      } else {
        output.textContent = String(params[key]);
      }
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = runSimulation(params);
    var sweep = sweepCapacity(params);
    var metrics = root.querySelector("[data-metrics]");
    var canvas = root.querySelector("[data-canvas]");

    updateOutputs(root, params);
    metrics.innerHTML = [
      metric("served tokens", formatPercent(result.servedRate, 1)),
      metric("batch score", formatNumber(result.quality, 3)),
      metric("unserved", formatPercent(result.dropped / result.tokens.length, 1)),
      metric("load CV", formatNumber(result.loadCv, 2)),
      metric("routes/token", formatNumber(result.meanRoutes, 2)),
      metric("hot expert", result.maxLoad + "/" + result.capacity)
    ].join("");
    drawChart(canvas, result, sweep, params);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-moe-lab]"));
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
      expertCapacity: expertCapacity,
      runSimulation: runSimulation,
      sweepCapacity: sweepCapacity,
      TYPES: TYPES
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
