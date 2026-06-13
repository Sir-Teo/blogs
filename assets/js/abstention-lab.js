(function () {
  var COLORS = {
    utility: "#0f766e",
    negative: "#b45309",
    target: "#2563eb",
    always: "#64748b",
    fixed: "#b45309",
    selective: "#2563eb",
    cost: "#0f766e",
    voi: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5"
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

  function sigmoid(x) {
    if (x > 35) return 1;
    if (x < -35) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function logit(p) {
    var q = clamp(p, 0.001, 0.999);
    return Math.log(q / (1 - q));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "0.0%";
    return (value * 100).toFixed(1) + "%";
  }

  function formatUtility(value) {
    return (value >= 0 ? "+" : "") + value.toFixed(3);
  }

  function makeCase(rand, params) {
    var scoreQuality = params.scoreQuality / 100;
    var computeValue = params.computeValue / 100;
    var mix = rand();
    var z;

    if (mix < 0.18) {
      z = -2.15 + 0.9 * normal(rand);
    } else if (mix < 0.72) {
      z = 0.45 + 1.15 * normal(rand);
    } else {
      z = 2.05 + 0.75 * normal(rand);
    }

    var pBase = clamp(sigmoid(z), 0.025, 0.99);
    var trap = rand() < 0.08 + 0.24 * (1 - pBase);
    var middleMass = 4 * pBase * (1 - pBase);
    var lift = computeValue * (trap ? 0.04 : 0.56) * middleMass * (1 - pBase);
    var pAfter = clamp(pBase + lift, 0.025, 0.995);
    var risk = 1 - pBase;
    var riskAfter = 1 - pAfter;
    var slope = 0.45 + 0.55 * scoreQuality;
    var noise = normal(rand) * (1 - scoreQuality) * 1.35;
    var hardTailBias = risk > 0.35 ? 0.22 * (1 - scoreQuality) : -0.55 * (1 - scoreQuality);
    var riskHat = sigmoid(slope * logit(risk) + noise + hardTailBias);
    var scoreQualityAfter = clamp(scoreQuality + 0.16 + 0.24 * computeValue, 0, 0.98);
    var afterNoise = normal(rand) * (1 - scoreQualityAfter) * 0.95;
    var afterBias = 0.35 * hardTailBias;
    var riskHatAfter = sigmoid((0.52 + 0.48 * scoreQualityAfter) * logit(riskAfter) + afterNoise + afterBias);

    return {
      pBase: pBase,
      pAfter: pAfter,
      riskHat: clamp(riskHat, 0.002, 0.998),
      riskHatAfter: clamp(riskHatAfter, 0.002, 0.998),
      baseCorrect: rand() < pBase,
      afterCorrect: rand() < pAfter
    };
  }

  function makeDataset(count, params, seed) {
    var rand = rng(seed);
    var rows = [];
    for (var i = 0; i < count; i += 1) {
      rows.push(makeCase(rand, params));
    }
    return rows;
  }

  function actionUtility(correct, errorCost) {
    return correct ? 1 : -errorCost;
  }

  function estimatedActUtility(riskHat, params) {
    return (1 - riskHat) - riskHat * params.errorCost;
  }

  function summarize(name, key, rows, decide, params) {
    var utility = 0;
    var answered = 0;
    var wrong = 0;
    var abstained = 0;
    var computed = 0;

    rows.forEach(function (row) {
      var decision = decide(row);
      var correct = row.baseCorrect;
      var value;

      if (decision.compute) {
        computed += 1;
        correct = row.afterCorrect;
      }

      if (decision.answer) {
        answered += 1;
        if (!correct) wrong += 1;
        value = actionUtility(correct, params.errorCost);
      } else {
        abstained += 1;
        value = -params.abstainCost;
      }

      if (decision.compute) value -= params.computeCost;
      utility += value;
    });

    return {
      name: name,
      key: key,
      utility: utility / rows.length,
      coverage: answered / rows.length,
      risk: answered ? wrong / answered : 0,
      abstain: abstained / rows.length,
      compute: computed / rows.length
    };
  }

  function calibrateSelectiveThreshold(rows, targetRisk) {
    var sorted = rows.slice().sort(function (a, b) { return a.riskHat - b.riskHat; });
    var wrong = 0;
    var bestIndex = -1;

    for (var i = 0; i < sorted.length; i += 1) {
      if (!sorted[i].baseCorrect) wrong += 1;
      if (i >= 24 && wrong / (i + 1) <= targetRisk) {
        bestIndex = i;
      }
    }

    return bestIndex >= 0 ? sorted[bestIndex].riskHat : -1;
  }

  function estimateComputeRisk(row, params) {
    var pHat = 1 - row.riskHat;
    var middleMass = 4 * pHat * (1 - pHat);
    var estimatedLift = (params.computeValue / 100) * 0.50 * middleMass * (1 - pHat);
    return 1 - clamp(pHat + estimatedLift, 0.002, 0.998);
  }

  function evaluate(rawParams) {
    var params = {
      targetRisk: rawParams.targetRisk / 100,
      errorCost: rawParams.errorCost / 10,
      abstainCost: rawParams.abstainCost / 100,
      computeCost: rawParams.computeCost / 100,
      scoreQuality: rawParams.scoreQuality,
      computeValue: rawParams.computeValue
    };
    var seed = 20260613
      + rawParams.targetRisk * 3
      + rawParams.errorCost * 5
      + rawParams.abstainCost * 7
      + rawParams.computeCost * 11
      + rawParams.scoreQuality * 13
      + rawParams.computeValue * 17;
    var calibration = makeDataset(1600, rawParams, seed);
    var test = makeDataset(1600, rawParams, seed + 991);
    var selectiveThreshold = calibrateSelectiveThreshold(calibration, params.targetRisk);
    var abstainUtility = -params.abstainCost;
    var fixedThreshold = 0.20;

    var policies = [
      summarize("Always", "always", test, function () {
        return { answer: true, compute: false };
      }, params),
      summarize("Fixed cutoff", "fixed", test, function (row) {
        return { answer: row.riskHat <= fixedThreshold, compute: false };
      }, params),
      summarize("Selective risk", "selective", test, function (row) {
        return { answer: row.riskHat <= selectiveThreshold, compute: false };
      }, params),
      summarize("Cost-aware", "cost", test, function (row) {
        return { answer: estimatedActUtility(row.riskHat, params) >= abstainUtility, compute: false };
      }, params),
      summarize("VOI policy", "voi", test, function (row) {
        var actUtility = estimatedActUtility(row.riskHat, params);
        var afterRisk = estimateComputeRisk(row, rawParams);
        var afterActUtility = estimatedActUtility(afterRisk, params);
        var computeUtility = -params.computeCost + Math.max(afterActUtility, abstainUtility);

        if (computeUtility > Math.max(actUtility, abstainUtility) + 0.015) {
          return {
            answer: estimatedActUtility(row.riskHatAfter, params) >= abstainUtility,
            compute: true
          };
        }

        return { answer: actUtility >= abstainUtility, compute: false };
      }, params)
    ];

    return {
      params: params,
      policies: policies,
      targetRisk: params.targetRisk,
      selectiveThreshold: selectiveThreshold
    };
  }

  function metric(label, value) {
    return '<div class="abstention-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawChart(canvas, result) {
    var rows = result.policies;
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var height = 420;
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

    var left = width < 540 ? 46 : 60;
    var right = width < 540 ? 22 : 36;
    var top = 30;
    var utilityHeight = 205;
    var scatterTop = 282;
    var scatterHeight = 100;
    var plotWidth = width - left - right;
    var maxUtility = Math.max.apply(null, rows.map(function (row) { return Math.abs(row.utility); }));
    maxUtility = Math.max(0.15, maxUtility * 1.25);
    var zeroY = top + utilityHeight / 2;
    var groupWidth = plotWidth / rows.length;
    var barWidth = Math.max(22, Math.min(42, groupWidth * 0.44));

    function utilityY(value) {
      return zeroY - (value / maxUtility) * (utilityHeight / 2 - 12);
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + utilityHeight);
    ctx.lineTo(width - right, top + utilityHeight);
    ctx.stroke();

    ctx.strokeStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.moveTo(left, zeroY);
    ctx.lineTo(width - right, zeroY);
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [-maxUtility, 0, maxUtility].forEach(function (tick) {
      var y = utilityY(tick);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(tick.toFixed(2), left - 8, y);
    });

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.text;
    ctx.font = "13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("Mean utility per case", left, 16);

    rows.forEach(function (row, index) {
      var x = left + index * groupWidth + groupWidth / 2;
      var y = utilityY(row.utility);
      var barTop = Math.min(y, zeroY);
      var barHeight = Math.max(2, Math.abs(zeroY - y));
      ctx.fillStyle = row.utility >= 0 ? COLORS.utility : COLORS.negative;
      ctx.fillRect(x - barWidth / 2, barTop, barWidth, barHeight);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(formatUtility(row.utility), x, barTop - 5);
      ctx.save();
      ctx.translate(x, top + utilityHeight + 16);
      if (width < 560) {
        ctx.rotate(-Math.PI / 5);
        ctx.textAlign = "right";
      }
      ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(row.name, 0, 0);
      ctx.restore();
    });

    var maxRisk = Math.max.apply(null, rows.map(function (row) { return row.risk; }));
    maxRisk = Math.max(0.12, result.targetRisk * 1.65, maxRisk * 1.25);

    function scatterX(coverage) {
      return left + coverage * plotWidth;
    }

    function scatterY(risk) {
      return scatterTop + scatterHeight - (risk / maxRisk) * scatterHeight;
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, scatterTop);
    ctx.lineTo(left, scatterTop + scatterHeight);
    ctx.lineTo(width - right, scatterTop + scatterHeight);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.text;
    ctx.font = "13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("Risk-coverage map", left, scatterTop - 15);

    var targetY = scatterY(result.targetRisk);
    ctx.strokeStyle = COLORS.target;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(left, targetY);
    ctx.lineTo(width - right, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.target;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("target", width - right, targetY - 4);

    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    [0, 0.5, 1].forEach(function (tick) {
      var x = scatterX(tick);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(x, scatterTop);
      ctx.lineTo(x, scatterTop + scatterHeight);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(String(Math.round(tick * 100)) + "%", x, scatterTop + scatterHeight + 7);
    });

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [0, maxRisk / 2, maxRisk].forEach(function (tick) {
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(String(Math.round(tick * 100)) + "%", left - 8, scatterY(tick));
    });

    var policyInitials = {
      always: "A",
      fixed: "F",
      selective: "S",
      cost: "C",
      voi: "V"
    };
    var pointOffsets = [-7, 8, -13, 14, 0];

    rows.forEach(function (row, index) {
      var x = scatterX(row.coverage);
      var y = clamp(scatterY(row.risk) + pointOffsets[index], scatterTop + 8, scatterTop + scatterHeight - 8);
      ctx.fillStyle = COLORS[row.key] || COLORS.text;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(policyInitials[row.key] || "", x, y + 0.5);
    });
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });

    var result = evaluate(params);
    var values = {
      targetRisk: params.targetRisk + "%",
      errorCost: (params.errorCost / 10).toFixed(1),
      abstainCost: (params.abstainCost / 100).toFixed(2),
      computeCost: (params.computeCost / 100).toFixed(2),
      scoreQuality: params.scoreQuality + "%",
      computeValue: params.computeValue + "%"
    };

    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var byKey = {};
    result.policies.forEach(function (row) {
      byKey[row.key] = row;
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("VOI utility", formatUtility(byKey.voi.utility)),
        metric("Cost-aware utility", formatUtility(byKey.cost.utility)),
        metric("VOI answered risk", formatPercent(byKey.voi.risk)),
        metric("VOI compute rate", formatPercent(byKey.voi.compute)),
        metric("Selective coverage", formatPercent(byKey.selective.coverage)),
        metric("Fixed cutoff utility", formatUtility(byKey.fixed.utility))
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
    document.querySelectorAll("[data-abstention-lab]").forEach(init);
  });
}());
