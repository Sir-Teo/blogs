(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    ref: "#64748b",
    dpo: "#0f766e",
    oracle: "#7c3aed",
    reward: "#2563eb",
    warn: "#d97706",
    bad: "#be123c",
    bg: "#ffffff",
    band: "#ccfbf1"
  };

  var ACTIONS = [
    { short: "terse", reward: -0.70 },
    { short: "generic", reward: -0.32 },
    { short: "polite", reward: 0.02 },
    { short: "complete", reward: 0.42 },
    { short: "grounded", reward: 0.76 },
    { short: "nuanced", reward: 0.98 },
    { short: "useful", reward: 1.14 },
    { short: "bold", reward: 0.74 },
    { short: "risky", reward: -0.18 }
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

  function clamp(value, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function clampInt(value, min, max) {
    return Math.round(clamp(value, min, max));
  }

  function sigmoid(x) {
    if (x >= 0) {
      var z = Math.exp(-x);
      return 1 / (1 + z);
    }
    var e = Math.exp(x);
    return e / (1 + e);
  }

  function softmax(logits) {
    var max = Math.max.apply(null, logits);
    var exps = logits.map(function (value) { return Math.exp(value - max); });
    var sum = exps.reduce(function (acc, value) { return acc + value; }, 0);
    return exps.map(function (value) { return value / sum; });
  }

  function normalize(probs) {
    var sum = probs.reduce(function (acc, value) { return acc + value; }, 0);
    return probs.map(function (value) { return value / sum; });
  }

  function sampleCategorical(rand, probs) {
    var u = rand();
    var acc = 0;
    for (var i = 0; i < probs.length; i += 1) {
      acc += probs[i];
      if (u <= acc) return i;
    }
    return probs.length - 1;
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function centered(values) {
    var m = mean(values);
    return values.map(function (value) { return value - m; });
  }

  function dot(left, right) {
    var sum = 0;
    for (var i = 0; i < left.length; i += 1) sum += left[i] * right[i];
    return sum;
  }

  function kl(policy, reference) {
    var out = 0;
    for (var i = 0; i < policy.length; i += 1) {
      if (policy[i] > 0) out += policy[i] * Math.log(policy[i] / reference[i]);
    }
    return out;
  }

  function argmax(values) {
    var best = 0;
    for (var i = 1; i < values.length; i += 1) {
      if (values[i] > values[best]) best = i;
    }
    return best;
  }

  function referencePolicy(cautionPct) {
    var caution = cautionPct / 100;
    var center = 6.1 - 3.35 * caution;
    var sigma = 2.15 - 0.75 * caution;
    var logits = ACTIONS.map(function (_, i) {
      var z = (i - center) / sigma;
      return -0.5 * z * z - 0.10 * Math.max(0, i - 6);
    });
    return softmax(logits);
  }

  function behaviorPolicy(reference, explorationPct) {
    var exploration = explorationPct / 100;
    var uniform = 1 / reference.length;
    return reference.map(function (p) {
      return exploration * uniform + (1 - exploration) * p;
    });
  }

  function makePairs(params, reference) {
    var pairCount = params.pairs;
    var exploration = behaviorPolicy(reference, params.exploration);
    var labelNoise = params.labelNoise / 100;
    var rand = rng(0xD0A2026 ^ Math.imul(pairCount, 17) ^ Math.imul(params.exploration, 31) ^ Math.imul(params.labelNoise, 43) ^ Math.imul(params.referenceCaution, 59));
    var pairs = [];
    var counts = ACTIONS.map(function () { return ACTIONS.map(function () { return 0; }); });
    var wins = ACTIONS.map(function () { return ACTIONS.map(function () { return 0; }); });

    for (var n = 0; n < pairCount; n += 1) {
      var a = sampleCategorical(rand, exploration);
      var b = sampleCategorical(rand, exploration);
      while (b === a) b = sampleCategorical(rand, exploration);
      var pref = sigmoid(ACTIONS[a].reward - ACTIONS[b].reward);
      pref = labelNoise * (1 - pref) + (1 - labelNoise) * pref;
      var winner = rand() < pref ? a : b;
      var loser = winner === a ? b : a;
      pairs.push({ winner: winner, loser: loser });
      counts[a][b] += 1;
      counts[b][a] += 1;
      wins[winner][loser] += 1;
    }

    return {
      counts: counts,
      pairs: pairs,
      wins: wins
    };
  }

  function policyFromD(reference, d) {
    var logits = reference.map(function (p, i) { return Math.log(p) + d[i]; });
    return softmax(logits);
  }

  function trainDpo(params, reference, pairs) {
    var beta = params.beta;
    var steps = params.steps;
    var d = ACTIONS.map(function () { return 0; });
    var rewards = ACTIONS.map(function (action) { return action.reward; });
    var refReward = dot(reference, rewards);
    var oracle = oraclePolicy(reference, beta);
    var oracleReward = dot(oracle, rewards);
    var trace = [];
    var every = Math.max(1, Math.floor(steps / 44));
    var lr = 2.6 / Math.sqrt(Math.max(0.25, beta));
    var regularizer = 0.012;

    function record(step) {
      var policy = policyFromD(reference, d);
      trace.push({
        kl: kl(policy, reference),
        reward: dot(policy, rewards),
        step: step
      });
    }

    record(0);
    for (var step = 1; step <= steps; step += 1) {
      var grad = ACTIONS.map(function () { return 0; });
      pairs.forEach(function (pair) {
        var margin = beta * (d[pair.winner] - d[pair.loser]);
        var pred = sigmoid(margin);
        var g = beta * (pred - 1);
        grad[pair.winner] += g;
        grad[pair.loser] -= g;
      });
      for (var i = 0; i < d.length; i += 1) {
        d[i] -= lr * grad[i] / Math.max(1, pairs.length);
        d[i] *= (1 - lr * regularizer);
      }
      var offset = mean(d);
      for (var j = 0; j < d.length; j += 1) d[j] -= offset;
      if (step % every === 0 || step === steps) record(step);
    }

    var policy = policyFromD(reference, d);
    return {
      d: d,
      policy: policy,
      refReward: refReward,
      oracle: oracle,
      oracleReward: oracleReward,
      trace: trace
    };
  }

  function oraclePolicy(reference, beta) {
    var logits = reference.map(function (p, i) {
      return Math.log(p) + ACTIONS[i].reward / beta;
    });
    return softmax(logits);
  }

  function pairAccuracy(d) {
    var correct = 0;
    var total = 0;
    for (var i = 0; i < ACTIONS.length; i += 1) {
      for (var j = i + 1; j < ACTIONS.length; j += 1) {
        var trueSign = ACTIONS[i].reward > ACTIONS[j].reward ? 1 : -1;
        var predictedSign = d[i] > d[j] ? 1 : -1;
        if (trueSign === predictedSign) correct += 1;
        total += 1;
      }
    }
    return correct / total;
  }

  function coveredActions(counts) {
    return counts.map(function (row) {
      return row.reduce(function (sum, value) { return sum + value; }, 0);
    });
  }

  function correlation(left, right, weights) {
    var total = weights.reduce(function (sum, value) { return sum + value; }, 0);
    if (total <= 0) return 0;
    var ml = left.reduce(function (sum, value, i) { return sum + value * weights[i]; }, 0) / total;
    var mr = right.reduce(function (sum, value, i) { return sum + value * weights[i]; }, 0) / total;
    var num = 0;
    var dl = 0;
    var dr = 0;
    for (var i = 0; i < left.length; i += 1) {
      var a = left[i] - ml;
      var b = right[i] - mr;
      num += weights[i] * a * b;
      dl += weights[i] * a * a;
      dr += weights[i] * b * b;
    }
    if (dl <= 0 || dr <= 0) return 0;
    return num / Math.sqrt(dl * dr);
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return {
      beta: clamp(raw.beta / 100, 0.25, 2.50),
      exploration: clampInt(raw.exploration, 0, 100),
      labelNoise: clampInt(raw.labelNoise, 0, 35),
      pairs: clampInt(raw.pairs, 40, 1200),
      referenceCaution: clampInt(raw.referenceCaution, 0, 100),
      steps: clampInt(raw.steps, 40, 520)
    };
  }

  function simulate(params) {
    var p = {
      beta: clamp(params.beta == null ? 0.80 : params.beta, 0.25, 2.50),
      exploration: clampInt(params.exploration == null ? 35 : params.exploration, 0, 100),
      labelNoise: clampInt(params.labelNoise == null ? 8 : params.labelNoise, 0, 35),
      pairs: clampInt(params.pairs == null ? 320 : params.pairs, 40, 1200),
      referenceCaution: clampInt(params.referenceCaution == null ? 68 : params.referenceCaution, 0, 100),
      steps: clampInt(params.steps == null ? 240 : params.steps, 40, 520)
    };
    var reference = referencePolicy(p.referenceCaution);
    var dataset = makePairs(p, reference);
    var fit = trainDpo(p, reference, dataset.pairs);
    var rewards = ACTIONS.map(function (action) { return action.reward; });
    var coverage = coveredActions(dataset.counts);
    var best = argmax(rewards);
    var impliedReward = fit.d.map(function (value) { return value * p.beta; });
    return {
      actions: ACTIONS,
      best: best,
      coverage: coverage,
      dataset: dataset,
      dpoReward: dot(fit.policy, rewards),
      impliedReward: impliedReward,
      metrics: {
        bestCoverage: coverage[best],
        bestMass: fit.policy[best],
        corr: correlation(centered(rewards), centered(impliedReward), coverage.map(function (v) { return v + 0.01; })),
        kl: kl(fit.policy, reference),
        pairAccuracy: pairAccuracy(fit.d),
        rewardGain: dot(fit.policy, rewards) - dot(reference, rewards)
      },
      params: p,
      reference: reference,
      rewards: rewards,
      train: fit
    };
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="pref-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function updateOutputs(root, params) {
    var values = {
      beta: formatNumber(params.beta, 2),
      exploration: params.exploration + "%",
      labelNoise: params.labelNoise + "%",
      pairs: String(params.pairs),
      referenceCaution: params.referenceCaution + "%",
      steps: String(params.steps)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function label(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.font = "600 15px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, title, box.x, box.y - 12, "left", "bottom", COLORS.text);
    if (subtitle) {
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      label(ctx, subtitle, box.x + box.w, box.y - 12, "right", "bottom", COLORS.muted);
    }
  }

  function gridLine(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawPath(ctx, points, xScale, yScale, color, width, dashed) {
    ctx.save();
    if (dashed) ctx.setLineDash([5, 5]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, i) {
      var x = xScale(point);
      var y = yScale(point);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawPolicyPanel(ctx, box, result) {
    panel(ctx, box, "policy mass", "reference, learned, oracle");
    var pad = { left: 44, right: 16, top: 20, bottom: 50 };
    var left = box.x + pad.left;
    var top = box.y + pad.top;
    var width = box.w - pad.left - pad.right;
    var height = box.h - pad.top - pad.bottom;
    var maxProb = Math.max(0.32, Math.max.apply(null, result.train.oracle.concat(result.train.policy, result.reference)) * 1.15);
    var group = width / result.actions.length;
    var barW = Math.max(4, group / 5);
    var yProb = function (p) { return top + height - p / maxProb * height; };
    var rewardMin = Math.min.apply(null, result.rewards);
    var rewardMax = Math.max.apply(null, result.rewards);
    var yReward = function (r) { return top + height - (r - rewardMin) / (rewardMax - rewardMin) * height; };

    [0.25, 0.5, 0.75, 1].forEach(function (fraction) {
      var yy = top + height - fraction * height;
      gridLine(ctx, left, yy, left + width, yy);
    });

    result.actions.forEach(function (action, i) {
      var cx = left + i * group + group / 2;
      [
        { color: COLORS.ref, value: result.reference[i], dx: -barW - 2 },
        { color: COLORS.dpo, value: result.train.policy[i], dx: 0 },
        { color: COLORS.oracle, value: result.train.oracle[i], dx: barW + 2 }
      ].forEach(function (bar) {
        var y = yProb(bar.value);
        ctx.fillStyle = bar.color;
        ctx.fillRect(cx + bar.dx - barW / 2, y, barW, top + height - y);
      });
      ctx.font = "10px system-ui, -apple-system, Segoe UI, sans-serif";
      label(ctx, action.short, cx, top + height + 14, "center", "top", COLORS.muted);
    });

    var rewardPoints = result.actions.map(function (action, i) {
      return { i: i, reward: action.reward };
    });
    drawPath(ctx, rewardPoints, function (point) {
      return left + point.i * group + group / 2;
    }, function (point) {
      return yReward(point.reward);
    }, COLORS.reward, 2, false);
    rewardPoints.forEach(function (point) {
      ctx.fillStyle = point.i === result.best ? COLORS.bad : COLORS.reward;
      ctx.beginPath();
      ctx.arc(left + point.i * group + group / 2, yReward(point.reward), point.i === result.best ? 4 : 2.7, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "0", left - 8, top + height, "right", "middle", COLORS.muted);
    label(ctx, formatPct(maxProb, 0), left - 8, top, "right", "top", COLORS.muted);
    label(ctx, "true reward line", left + width - 92, top + 8, "left", "top", COLORS.reward);
  }

  function drawCoveragePanel(ctx, box, result) {
    panel(ctx, box, "comparison coverage", "data distribution");
    var n = result.actions.length;
    var size = Math.min(22, Math.floor((box.w - 92) / n), Math.floor((box.h - 72) / n));
    var left = box.x + 68;
    var top = box.y + 34;
    var maxCount = 1;
    result.dataset.counts.forEach(function (row) {
      row.forEach(function (count) { if (count > maxCount) maxCount = count; });
    });
    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j < n; j += 1) {
        var count = result.dataset.counts[i][j];
        var intensity = count / maxCount;
        var green = Math.round(245 - 125 * intensity);
        var blue = Math.round(245 - 125 * intensity);
        ctx.fillStyle = i === j ? COLORS.faint : "rgb(15," + green + "," + blue + ")";
        ctx.fillRect(left + j * size, top + i * size, size - 1, size - 1);
      }
    }
    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = 2;
    ctx.strokeRect(left - 2, top + result.best * size - 2, n * size + 3, size + 3);
    ctx.strokeRect(left + result.best * size - 2, top - 2, size + 3, n * size + 3);
    ctx.lineWidth = 1;
    ctx.font = "10px system-ui, -apple-system, Segoe UI, sans-serif";
    result.actions.forEach(function (action, i) {
      label(ctx, action.short.slice(0, 4), left - 8, top + i * size + size / 2, "right", "middle", COLORS.muted);
      label(ctx, String(i + 1), left + i * size + size / 2, top - 8, "center", "bottom", COLORS.muted);
    });
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "best action comparisons: " + result.metrics.bestCoverage, box.x + 16, box.y + box.h - 20, "left", "middle", COLORS.bad);
  }

  function drawTracePanel(ctx, box, result) {
    panel(ctx, box, "training path", "expected reward and KL");
    var pad = { left: 48, right: 18, top: 20, bottom: 34 };
    var left = box.x + pad.left;
    var top = box.y + pad.top;
    var width = box.w - pad.left - pad.right;
    var height = box.h - pad.top - pad.bottom;
    var rewards = result.rewards;
    var minReward = Math.min.apply(null, rewards) * 0.2 + result.train.refReward * 0.8;
    var maxReward = Math.max(result.train.oracleReward, result.dpoReward, result.train.refReward) + 0.08;
    var maxKl = Math.max(0.02, Math.max.apply(null, result.train.trace.map(function (point) { return point.kl; })));
    var x = function (point) { return left + point.step / result.params.steps * width; };
    var yReward = function (point) { return top + height - (point.reward - minReward) / (maxReward - minReward) * height; };
    var yKl = function (point) { return top + height - point.kl / maxKl * height; };

    [0.25, 0.5, 0.75, 1].forEach(function (fraction) {
      var yy = top + height - fraction * height;
      gridLine(ctx, left, yy, left + width, yy);
    });
    var refY = top + height - (result.train.refReward - minReward) / (maxReward - minReward) * height;
    var oracleY = top + height - (result.train.oracleReward - minReward) / (maxReward - minReward) * height;
    gridLine(ctx, left, refY, left + width, refY);
    ctx.strokeStyle = COLORS.oracle;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(left, oracleY);
    ctx.lineTo(left + width, oracleY);
    ctx.stroke();
    ctx.setLineDash([]);
    drawPath(ctx, result.train.trace, x, yReward, COLORS.dpo, 2.5, false);
    drawPath(ctx, result.train.trace, x, yKl, COLORS.warn, 2, true);

    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "step", left + width / 2, top + height + 24, "center", "top", COLORS.muted);
    label(ctx, "reward", left + width - 76, top + 8, "left", "top", COLORS.dpo);
    label(ctx, "KL", left + width - 76, top + 26, "left", "top", COLORS.warn);
  }

  function drawScatterPanel(ctx, box, result) {
    panel(ctx, box, "learned reward lens", "beta log(policy/ref)");
    var pad = { left: 46, right: 20, top: 22, bottom: 36 };
    var left = box.x + pad.left;
    var top = box.y + pad.top;
    var width = box.w - pad.left - pad.right;
    var height = box.h - pad.top - pad.bottom;
    var trueCentered = centered(result.rewards);
    var impliedCentered = centered(result.impliedReward);
    var maxAbs = Math.max(0.2,
      Math.max.apply(null, trueCentered.map(Math.abs)),
      Math.max.apply(null, impliedCentered.map(Math.abs))
    ) * 1.2;
    var x = function (value) { return left + (value + maxAbs) / (2 * maxAbs) * width; };
    var y = function (value) { return top + height - (value + maxAbs) / (2 * maxAbs) * height; };
    gridLine(ctx, x(0), top, x(0), top + height);
    gridLine(ctx, left, y(0), left + width, y(0));
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(x(-maxAbs), y(-maxAbs));
    ctx.lineTo(x(maxAbs), y(maxAbs));
    ctx.stroke();
    result.actions.forEach(function (action, i) {
      var radius = 3 + Math.min(8, Math.sqrt(result.coverage[i]) / 2);
      ctx.fillStyle = i === result.best ? COLORS.bad : COLORS.reward;
      ctx.beginPath();
      ctx.arc(x(trueCentered[i]), y(impliedCentered[i]), radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.font = "10px system-ui, -apple-system, Segoe UI, sans-serif";
      label(ctx, String(i + 1), x(trueCentered[i]) + radius + 2, y(impliedCentered[i]), "left", "middle", COLORS.muted);
    });
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "true reward", left + width / 2, top + height + 24, "center", "top", COLORS.muted);
    label(ctx, "corr " + formatNumber(result.metrics.corr, 2), left + width, top + 8, "right", "top", COLORS.text);
  }

  function drawChart(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.font = "700 20px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "Preference optimization as a data lens", 54, 28, "left", "top", COLORS.text);
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "The policy moves only where comparisons give it leverage.", 54, 54, "left", "top", COLORS.muted);
    drawPolicyPanel(ctx, { x: 54, y: 82, w: 792, h: 220 }, result);
    drawCoveragePanel(ctx, { x: 54, y: 368, w: 246, h: 218 }, result);
    drawTracePanel(ctx, { x: 342, y: 368, w: 238, h: 218 }, result);
    drawScatterPanel(ctx, { x: 622, y: 368, w: 224, h: 218 }, result);
  }

  function render(root) {
    var params = parseParams(root);
    updateOutputs(root, params);
    var result = simulate(params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("reward gain", formatNumber(result.metrics.rewardGain, 2)),
        metric("best mass", formatPct(result.metrics.bestMass, 1)),
        metric("KL to ref", formatNumber(result.metrics.kl, 2)),
        metric("pair accuracy", formatPct(result.metrics.pairAccuracy, 0)),
        metric("best coverage", String(result.metrics.bestCoverage)),
        metric("reward corr", formatNumber(result.metrics.corr, 2))
      ].join("");
    }
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-pref-lab]"));
    labs.forEach(function (root) {
      if (root.__prefLabReady) return;
      root.__prefLabReady = true;
      var schedule = null;
      var scheduledWithTimeout = false;
      function requestRender() {
        if (schedule) {
          if (scheduledWithTimeout) window.clearTimeout(schedule);
          else if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(schedule);
        }
        scheduledWithTimeout = typeof window.requestAnimationFrame !== "function";
        var scheduleRender = scheduledWithTimeout
          ? function (callback) { return window.setTimeout(callback, 16); }
          : window.requestAnimationFrame;
        schedule = scheduleRender(function () {
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
      referencePolicy: referencePolicy,
      simulate: simulate,
      trainDpo: trainDpo
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      window.setTimeout(init, 0);
    } else {
      init();
    }
  }
}());
