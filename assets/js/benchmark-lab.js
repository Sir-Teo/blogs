(function () {
  var COLORS = {
    raw: "#0f766e",
    estimate: "#b45309",
    trueAbility: "#2563eb",
    info: "#7c3aed",
    exposed: "#9333ea",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5"
  };

  var MODELS = [
    { key: "base", label: "Base", theta: -0.55 },
    { key: "broad", label: "Broad", theta: 0.00 },
    { key: "exposed", label: "Exposed", theta: 0.20 },
    { key: "frontier", label: "Frontier", theta: 0.45 }
  ];

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

  function sigmoid(x) {
    if (x > 35) return 1;
    if (x < -35) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatPercent(value) {
    return (value * 100).toFixed(1) + "%";
  }

  function formatTheta(value) {
    return (value >= 0 ? "+" : "") + value.toFixed(2);
  }

  function modelList(params) {
    var gap = params.gap / 100;
    return MODELS.map(function (model) {
      var copy = {
        key: model.key,
        label: model.label,
        theta: model.theta
      };
      if (copy.key === "frontier") copy.theta = 0.20 + gap;
      return copy;
    });
  }

  function responseProbability(theta, item, exposedBoost, noise) {
    var chance = 0.25;
    var s = sigmoid(item.a * (theta + exposedBoost - item.b));
    var p = chance + (1 - chance) * s;
    return clamp((1 - noise) * p + noise * chance, 0.001, 0.999);
  }

  function makeItems(params, rand) {
    var items = [];
    var center = params.difficulty / 100;
    var discrimination = params.discrimination / 100;
    var leakRate = params.leakage / 100;

    for (var i = 0; i < params.items; i += 1) {
      var wave = 0.18 * Math.sin(i * 0.37) + 0.10 * Math.sin(i * 0.11);
      var b = center + 1.05 * normal(rand) + wave;
      var a = clamp((0.42 + 1.05 * discrimination) * (0.72 + 0.56 * rand()), 0.22, 2.35);
      items.push({
        a: a,
        b: b,
        leaked: rand() < leakRate
      });
    }

    return items;
  }

  function estimateTheta(items, responses) {
    var bestTheta = -3;
    var bestLogLik = -Infinity;
    var theta;

    for (var step = 0; step <= 300; step += 1) {
      theta = -3 + step * 0.02;
      var logLik = 0;
      for (var i = 0; i < items.length; i += 1) {
        var p = responseProbability(theta, items[i], 0, 0);
        logLik += responses[i] ? Math.log(p) : Math.log(1 - p);
      }
      if (logLik > bestLogLik) {
        bestLogLik = logLik;
        bestTheta = theta;
      }
    }

    return bestTheta;
  }

  function itemInformation(theta, item) {
    var chance = 0.25;
    var s = sigmoid(item.a * (theta - item.b));
    var p = chance + (1 - chance) * s;
    var derivative = (1 - chance) * item.a * s * (1 - s);
    return derivative * derivative / Math.max(0.0001, p * (1 - p));
  }

  function summarize(params) {
    var seed = 20260613
      + params.items * 3
      + params.difficulty * 5
      + params.discrimination * 7
      + params.leakage * 11
      + params.gap * 13
      + params.noise * 17;
    var rand = rng(seed);
    var models = modelList(params);
    var items = makeItems(params, rand);
    var noise = params.noise / 100;
    var exposedBoost = 1.30 + 0.018 * params.leakage;
    var cleanItems = items.filter(function (item) { return !item.leaked; });

    var rows = models.map(function (model) {
      var allResponses = [];
      var cleanResponses = [];
      var correct = 0;
      var cleanCorrect = 0;

      items.forEach(function (item) {
        var boost = model.key === "exposed" && item.leaked ? exposedBoost : 0;
        var p = responseProbability(model.theta, item, boost, noise);
        var isCorrect = rand() < p;
        allResponses.push(isCorrect);
        if (isCorrect) correct += 1;
        if (!item.leaked) {
          cleanResponses.push(isCorrect);
          if (isCorrect) cleanCorrect += 1;
        }
      });

      var thetaHat = cleanItems.length ? estimateTheta(cleanItems, cleanResponses) : estimateTheta(items, allResponses);
      var info = (cleanItems.length ? cleanItems : items).reduce(function (sum, item) {
        return sum + itemInformation(thetaHat, item);
      }, 0);
      var se = info > 0 ? 1 / Math.sqrt(info) : 1.5;

      return {
        key: model.key,
        label: model.label,
        trueTheta: model.theta,
        raw: correct / items.length,
        cleanRaw: cleanItems.length ? cleanCorrect / cleanItems.length : correct / items.length,
        thetaHat: thetaHat,
        se: se
      };
    });

    var rawRank = rows.slice().sort(function (a, b) { return b.raw - a.raw; });
    var abilityRank = rows.slice().sort(function (a, b) { return b.thetaHat - a.thetaHat; });
    var trueRank = rows.slice().sort(function (a, b) { return b.trueTheta - a.trueTheta; });
    var top = abilityRank[0];
    var second = abilityRank[1];
    var separation = (top.thetaHat - second.thetaHat) / Math.sqrt(top.se * top.se + second.se * second.se);
    var frontier = rows.find(function (row) { return row.key === "frontier"; });
    var exposed = rows.find(function (row) { return row.key === "exposed"; });
    var cleanBank = cleanItems.length ? cleanItems : items;
    var frontierInfo = cleanBank.reduce(function (sum, item) {
      return sum + itemInformation(frontier.trueTheta, item);
    }, 0) / cleanBank.length;
    var leakedCount = items.filter(function (item) { return item.leaked; }).length;

    return {
      models: rows,
      items: items,
      cleanItems: cleanBank,
      rawWinner: rawRank[0],
      abilityWinner: abilityRank[0],
      trueWinner: trueRank[0],
      separation: separation,
      frontierInfo: frontierInfo,
      leakageLift: exposed.raw - exposed.cleanRaw,
      leakedShare: leakedCount / items.length
    };
  }

  function metric(label, value) {
    return '<div class="benchmark-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var height = 430;
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

    var left = width < 560 ? 48 : 60;
    var right = width < 560 ? 24 : 36;
    var gap = width < 620 ? 24 : 44;
    var top = 34;
    var panelHeight = 190;
    var panelWidth = (width - left - right - gap) / 2;
    var rawLeft = left;
    var abilityLeft = left + panelWidth + gap;
    var bottomTop = 282;
    var bottomHeight = 104;

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    function drawPanelFrame(x, y, w, h, title) {
      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(title, x, y - 9);
    }

    drawPanelFrame(rawLeft, top, panelWidth, panelHeight, "Raw leaderboard accuracy");
    drawPanelFrame(abilityLeft, top, panelWidth, panelHeight, "Clean anchor ability");

    var rawMax = Math.max(1, Math.max.apply(null, result.models.map(function (m) { return m.raw; })) * 1.05);
    var barGap = panelWidth / result.models.length;
    var barWidth = Math.max(12, Math.min(34, barGap * 0.42));

    function rawY(value) {
      return top + panelHeight - (value / rawMax) * (panelHeight - 18);
    }

    [0, 0.5, 1].forEach(function (tick) {
      var y = rawY(tick);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(rawLeft, y);
      ctx.lineTo(rawLeft + panelWidth, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(tick * 100)) + "%", rawLeft - 8, y);
    });

    result.models.forEach(function (model, index) {
      var center = rawLeft + index * barGap + barGap / 2;
      var y = rawY(model.raw);
      ctx.fillStyle = model.key === "exposed" ? COLORS.exposed : COLORS.raw;
      ctx.fillRect(center - barWidth / 2, y, barWidth, top + panelHeight - y);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(String(Math.round(model.raw * 100)) + "%", center, y - 5);
      ctx.save();
      ctx.translate(center, top + panelHeight + 16);
      if (width < 580) {
        ctx.rotate(-Math.PI / 5);
        ctx.textAlign = "right";
      }
      ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(model.label, 0, 0);
      ctx.restore();
    });

    var thetaValues = result.models.reduce(function (all, model) {
      all.push(model.thetaHat - model.se * 1.96, model.thetaHat + model.se * 1.96, model.trueTheta);
      return all;
    }, []);
    var minTheta = Math.min(-1.2, Math.min.apply(null, thetaValues) - 0.2);
    var maxTheta = Math.max(1.2, Math.max.apply(null, thetaValues) + 0.2);

    function abilityY(value) {
      return top + panelHeight - ((value - minTheta) / (maxTheta - minTheta)) * (panelHeight - 18);
    }

    [Math.ceil(minTheta), 0, Math.floor(maxTheta)].forEach(function (tick) {
      if (tick < minTheta || tick > maxTheta) return;
      var y = abilityY(tick);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(abilityLeft, y);
      ctx.lineTo(abilityLeft + panelWidth, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(formatTheta(tick), abilityLeft - 8, y);
    });

    result.models.forEach(function (model, index) {
      var center = abilityLeft + index * barGap + barGap / 2;
      var estimateY = abilityY(model.thetaHat);
      var lo = abilityY(model.thetaHat - 1.96 * model.se);
      var hi = abilityY(model.thetaHat + 1.96 * model.se);
      ctx.strokeStyle = COLORS.estimate;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(center, lo);
      ctx.lineTo(center, hi);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(center - 5, lo);
      ctx.lineTo(center + 5, lo);
      ctx.moveTo(center - 5, hi);
      ctx.lineTo(center + 5, hi);
      ctx.stroke();
      ctx.fillStyle = COLORS.estimate;
      ctx.beginPath();
      ctx.arc(center, estimateY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.trueAbility;
      ctx.beginPath();
      ctx.arc(center, abilityY(model.trueTheta), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(center, top + panelHeight + 16);
      if (width < 580) {
        ctx.rotate(-Math.PI / 5);
        ctx.textAlign = "right";
      } else {
        ctx.textAlign = "center";
      }
      ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(model.label, 0, 0);
      ctx.restore();
    });

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, bottomTop);
    ctx.lineTo(left, bottomTop + bottomHeight);
    ctx.lineTo(width - right, bottomTop + bottomHeight);
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Item information by ability", left, bottomTop - 10);

    var xMin = -2.5;
    var xMax = 2.5;
    var infoValues = [];
    for (var s = 0; s <= 100; s += 1) {
      var theta = xMin + (xMax - xMin) * s / 100;
      var info = result.cleanItems.reduce(function (sum, item) {
        return sum + itemInformation(theta, item);
      }, 0) / result.cleanItems.length;
      infoValues.push({ theta: theta, info: info });
    }
    var maxInfo = Math.max(0.01, Math.max.apply(null, infoValues.map(function (row) { return row.info; })));

    function infoX(theta) {
      return left + ((theta - xMin) / (xMax - xMin)) * (width - left - right);
    }

    function infoY(info) {
      return bottomTop + bottomHeight - (info / maxInfo) * (bottomHeight - 12);
    }

    ctx.strokeStyle = COLORS.info;
    ctx.lineWidth = 2;
    ctx.beginPath();
    infoValues.forEach(function (row, index) {
      var x = infoX(row.theta);
      var y = infoY(row.info);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    result.models.forEach(function (model) {
      var x = infoX(model.trueTheta);
      ctx.strokeStyle = model.key === "frontier" ? COLORS.trueAbility : "#94a3b8";
      ctx.lineWidth = model.key === "frontier" ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, bottomTop + 6);
      ctx.lineTo(x, bottomTop + bottomHeight);
      ctx.stroke();
    });

    [-2, 0, 2].forEach(function (tick) {
      var x = infoX(tick);
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(formatTheta(tick), x, bottomTop + bottomHeight + 8);
    });
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });

    var result = summarize(params);
    var values = {
      items: String(params.items),
      difficulty: formatTheta(params.difficulty / 100),
      discrimination: params.discrimination + "%",
      leakage: params.leakage + "%",
      gap: (params.gap / 100).toFixed(2),
      noise: params.noise + "%"
    };

    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Raw winner", result.rawWinner.label),
        metric("Clean IRT winner", result.abilityWinner.label),
        metric("True frontier", result.trueWinner.label),
        metric("Separation", result.separation.toFixed(2) + " SE"),
        metric("Leakage lift", formatPercent(result.leakageLift)),
        metric("Frontier info", result.frontierInfo.toFixed(3))
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
    window.addEventListener("resize", redraw);
    redraw();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-benchmark-lab]").forEach(init);
  });
}());
