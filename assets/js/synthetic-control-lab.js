(function (global) {
  "use strict";

  var COLORS = {
    donor: "#94a3b8",
    effect: "#be123c",
    grid: "#e6edf3",
    muted: "#5d6872",
    panel: "#f8fafc",
    placebo: "#64748b",
    rule: "#d7dee5",
    synthetic: "#2563eb",
    text: "#172026",
    treated: "#0f766e",
    truePath: "#f59e0b",
    weight: "#7c3aed",
    white: "#ffffff"
  };

  var DEFAULTS = {
    donors: 10,
    effect: 30,
    fitGap: 18,
    leakage: 0,
    noise: 8,
    pre: 40,
    scenario: "policy",
    seed: 53
  };

  var SCENARIOS = {
    macro: "macro shock",
    policy: "single policy",
    product: "product launch"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      donors: Math.round(clamp(finite(Number(raw.donors), DEFAULTS.donors), 5, 12)),
      effect: Math.round(clamp(finite(Number(raw.effect), DEFAULTS.effect), -28, 40)),
      fitGap: Math.round(clamp(finite(Number(raw.fitGap), DEFAULTS.fitGap), 0, 70)),
      leakage: Math.round(clamp(finite(Number(raw.leakage), DEFAULTS.leakage), 0, 65)),
      noise: Math.round(clamp(finite(Number(raw.noise), DEFAULTS.noise), 0, 30)),
      pre: Math.round(clamp(finite(Number(raw.pre), DEFAULTS.pre), 24, 58)),
      scenario: SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997))
    };
  }

  function makeRng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rng) {
    var u1 = Math.max(1e-12, rng());
    var u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i += 1) s += a[i] * b[i];
    return s;
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
  }

  function rms(values) {
    return Math.sqrt(mean(values.map(function (value) { return value * value; })));
  }

  function projectSimplex(values) {
    var n = values.length;
    var sorted = values.slice().sort(function (a, b) { return b - a; });
    var cssv = 0;
    var rho = 0;
    for (var i = 0; i < n; i += 1) {
      cssv += sorted[i];
      var theta = (cssv - 1) / (i + 1);
      if (sorted[i] - theta > 0) rho = i + 1;
    }
    cssv = 0;
    for (i = 0; i < rho; i += 1) cssv += sorted[i];
    theta = (cssv - 1) / Math.max(1, rho);
    return values.map(function (value) { return Math.max(0, value - theta); });
  }

  function scenarioFactors(t, total, scenario) {
    var x = t / Math.max(1, total - 1);
    var trend = 0.9 * x;
    var cycle = Math.sin(2 * Math.PI * (1.3 * x + 0.08));
    var slow = Math.cos(2 * Math.PI * (0.55 * x + 0.17));
    var pulse = Math.exp(-80 * (x - 0.58) * (x - 0.58));
    if (scenario === "macro") {
      trend = 1.25 * x - 0.25 * x * x;
      cycle = 0.7 * Math.sin(2 * Math.PI * (0.9 * x + 0.13));
      slow = Math.cos(2 * Math.PI * (0.35 * x + 0.22));
      pulse = Math.exp(-65 * (x - 0.42) * (x - 0.42));
    } else if (scenario === "product") {
      trend = 0.45 * x + 0.5 * Math.log1p(4 * x) / Math.log(5);
      cycle = Math.sin(2 * Math.PI * (2.2 * x + 0.04));
      slow = 0.5 * Math.cos(2 * Math.PI * (0.75 * x + 0.32));
      pulse = Math.exp(-110 * (x - 0.7) * (x - 0.7));
    }
    return [1, trend, cycle, slow, pulse];
  }

  function treatmentShape(t, pre, total, scenario) {
    if (t < pre) return 0;
    var u = (t - pre) / Math.max(1, total - pre - 1);
    if (scenario === "macro") return 0.25 + 0.9 * (1 - Math.exp(-3.2 * u));
    if (scenario === "product") return 0.15 + 0.7 * Math.sin(Math.PI * clamp(u, 0, 1)) + 0.45 * u;
    return 0.2 + 0.9 * (1 - Math.exp(-4.5 * u));
  }

  function makeSparseWeights(donors, rng) {
    var raw = [];
    for (var j = 0; j < donors; j += 1) raw.push(0.03 * rng());
    var picks = [];
    while (picks.length < Math.min(3, donors)) {
      var pick = Math.floor(rng() * donors);
      if (picks.indexOf(pick) === -1) picks.push(pick);
    }
    picks.forEach(function (idx) {
      raw[idx] += 0.45 + 0.7 * rng();
    });
    var total = raw.reduce(function (sum, value) { return sum + value; }, 0);
    return raw.map(function (value) { return value / total; });
  }

  function generatePanel(params) {
    var post = 34;
    var total = params.pre + post;
    var rng = makeRng(params.seed * 7919 + params.donors * 107);
    var donorLoadings = [];
    var donors = [];
    var donorUntreated = [];
    var j;
    for (j = 0; j < params.donors; j += 1) {
      donorLoadings[j] = [
        34 + 3.5 * normal(rng),
        9 + 4.5 * normal(rng),
        3.4 * normal(rng),
        2.8 * normal(rng),
        4.2 * normal(rng)
      ];
      donors[j] = [];
      donorUntreated[j] = [];
    }

    var baseWeights = makeSparseWeights(params.donors, rng);
    var uniqueLoading = [
      0,
      0.03 * params.fitGap,
      0.045 * params.fitGap,
      -0.035 * params.fitGap,
      0.055 * params.fitGap
    ];
    var treatedY0 = [];
    var treatedObserved = [];
    var effect = [];
    var spillDonors = [];
    for (j = 0; j < params.donors; j += 1) {
      if (j % 4 === 1 || (params.scenario === "macro" && j % 5 === 2)) spillDonors.push(j);
    }

    for (var t = 0; t < total; t += 1) {
      var factors = scenarioFactors(t, total, params.scenario);
      for (j = 0; j < params.donors; j += 1) {
        var idWave = 0.7 * Math.sin(2 * Math.PI * ((j + 2) * 0.17 + t / (18 + j)));
        var clean = dot(donorLoadings[j], factors) + idWave;
        donorUntreated[j][t] = clean;
        donors[j][t] = clean + (params.noise / 12) * normal(rng);
      }

      var y0 = 0;
      for (j = 0; j < params.donors; j += 1) y0 += baseWeights[j] * donorUntreated[j][t];
      y0 += dot(uniqueLoading, factors) + 0.35 * Math.sin(2 * Math.PI * (t / 19 + 0.11));
      var tau = (params.effect / 10) * treatmentShape(t, params.pre, total, params.scenario);
      treatedY0[t] = y0;
      effect[t] = tau;
      treatedObserved[t] = y0 + tau + (params.noise / 16) * normal(rng);
    }

    for (j = 0; j < spillDonors.length; j += 1) {
      var donorIndex = spillDonors[j];
      var spillScale = (params.leakage / 100) * (0.45 + 0.25 * (j % 3));
      for (t = params.pre; t < total; t += 1) {
        donors[donorIndex][t] += spillScale * effect[t] + (params.leakage / 260) * (t - params.pre);
      }
    }

    return {
      baseWeights: baseWeights,
      donorUntreated: donorUntreated,
      donors: donors,
      effect: effect,
      spillDonors: spillDonors,
      total: total,
      treatedObserved: treatedObserved,
      treatedY0: treatedY0
    };
  }

  function fitSynthetic(target, donorMatrix, pre, excluded) {
    var donors = donorMatrix.length;
    var active = [];
    for (var j = 0; j < donors; j += 1) {
      if (j !== excluded) active.push(j);
    }
    var m = active.length;
    var weights = [];
    for (j = 0; j < m; j += 1) weights[j] = 1 / m;
    var lipschitz = 1e-6;
    for (j = 0; j < m; j += 1) {
      var norm = 0;
      for (var t = 0; t < pre; t += 1) norm += donorMatrix[active[j]][t] * donorMatrix[active[j]][t];
      lipschitz += 2 * norm / pre;
    }
    var step = 1 / lipschitz;
    for (var iter = 0; iter < 900; iter += 1) {
      var grad = new Array(m);
      for (j = 0; j < m; j += 1) grad[j] = 0;
      for (t = 0; t < pre; t += 1) {
        var pred = 0;
        for (j = 0; j < m; j += 1) pred += weights[j] * donorMatrix[active[j]][t];
        var err = pred - target[t];
        for (j = 0; j < m; j += 1) grad[j] += 2 * err * donorMatrix[active[j]][t] / pre;
      }
      for (j = 0; j < m; j += 1) weights[j] -= step * grad[j];
      weights = projectSimplex(weights);
    }
    var full = new Array(donors);
    for (j = 0; j < donors; j += 1) full[j] = 0;
    for (j = 0; j < m; j += 1) full[active[j]] = weights[j];
    return full;
  }

  function weightedPath(donors, weights) {
    var total = donors[0].length;
    var path = new Array(total);
    for (var t = 0; t < total; t += 1) {
      var value = 0;
      for (var j = 0; j < donors.length; j += 1) value += weights[j] * donors[j][t];
      path[t] = value;
    }
    return path;
  }

  function residuals(a, b, start, end) {
    var out = [];
    for (var t = start; t < end; t += 1) out.push(a[t] - b[t]);
    return out;
  }

  function placeboResults(panel, pre) {
    var rows = [];
    for (var j = 0; j < panel.donors.length; j += 1) {
      var target = panel.donors[j];
      var weights = fitSynthetic(target, panel.donors, pre, j);
      var synthetic = weightedPath(panel.donors, weights);
      var preResiduals = residuals(target, synthetic, 0, pre);
      var postResiduals = residuals(target, synthetic, pre, panel.total);
      rows.push({
        index: j,
        postMean: mean(postResiduals),
        postRmspe: rms(postResiduals),
        preRmspe: rms(preResiduals),
        ratio: rms(postResiduals) / Math.max(1e-6, rms(preResiduals))
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var panel = generatePanel(params);
    var weights = fitSynthetic(panel.treatedObserved, panel.donors, params.pre, -1);
    var synthetic = weightedPath(panel.donors, weights);
    var preResiduals = residuals(panel.treatedObserved, synthetic, 0, params.pre);
    var postResiduals = residuals(panel.treatedObserved, synthetic, params.pre, panel.total);
    var postTruth = residuals(panel.treatedObserved, panel.treatedY0, params.pre, panel.total);
    var counterfactualError = residuals(panel.treatedY0, synthetic, params.pre, panel.total);
    var placebos = placeboResults(panel, params.pre);
    var estimate = mean(postResiduals);
    var trueEffect = mean(postTruth);
    var placeboTail = 1 + placebos.filter(function (row) {
      return Math.abs(row.postMean) >= Math.abs(estimate);
    }).length;
    return {
      counterfactualRmse: rms(counterfactualError),
      estimate: estimate,
      gap: postResiduals,
      params: params,
      panel: panel,
      placeboP: placeboTail / (placebos.length + 1),
      placebos: placebos,
      postRmspe: rms(postResiduals),
      preRmspe: rms(preResiduals),
      synthetic: synthetic,
      trueEffect: trueEffect,
      weights: weights
    };
  }

  function audit() {
    var base = evaluate(DEFAULTS);
    var leaked = evaluate(Object.assign({}, DEFAULTS, { leakage: 45 }));
    var hardFit = evaluate(Object.assign({}, DEFAULTS, { fitGap: 65 }));
    var weightSum = base.weights.reduce(function (sum, value) { return sum + value; }, 0);
    return {
      baseEstimate: Number(base.estimate.toFixed(2)),
      basePreRmspe: Number(base.preRmspe.toFixed(2)),
      baseTrueEffect: Number(base.trueEffect.toFixed(2)),
      hardFitPreRmspe: Number(hardFit.preRmspe.toFixed(2)),
      leakedEstimate: Number(leaked.estimate.toFixed(2)),
      placeboP: Number(base.placeboP.toFixed(2)),
      weightSum: Number(weightSum.toFixed(6))
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function fmt(value, digits) {
    return Number(value).toFixed(digits);
  }

  function setOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "effect" || key === "fitGap" || key === "leakage" || key === "noise") value += "%";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var metrics = root.querySelector("[data-metrics]");
    if (!metrics) return;
    var rows = [
      ["estimated ATT", fmt(result.estimate, 2)],
      ["true ATT", fmt(result.trueEffect, 2)],
      ["pre RMSPE", fmt(result.preRmspe, 2)],
      ["post cf RMSE", fmt(result.counterfactualRmse, 2)],
      ["placebo tail", fmt(result.placeboP, 2)],
      ["active donors", String(result.weights.filter(function (w) { return w > 0.03; }).length)]
    ];
    metrics.innerHTML = rows.map(function (row) {
      return '<div class="sc-lab__metric"><span>' + row[0] + '</span><strong>' + row[1] + "</strong></div>";
    }).join("");
  }

  function clear(ctx) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, x + 14, y + 23);
  }

  function range(values) {
    var min = Infinity;
    var max = -Infinity;
    values.forEach(function (value) {
      if (value < min) min = value;
      if (value > max) max = value;
    });
    if (Math.abs(max - min) < 1e-9) {
      min -= 1;
      max += 1;
    }
    return { max: max, min: min };
  }

  function grid(ctx, x, y, w, h, rows) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 1; i < rows; i += 1) {
      var yy = y + h * i / rows;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }
  }

  function path(ctx, values, x, y, w, h, r, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    for (var i = 0; i < values.length; i += 1) {
      var xx = x + w * i / (values.length - 1);
      var yy = y + h - h * (values[i] - r.min) / (r.max - r.min);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPaths(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "treated unit and synthetic control");
    var px = x + 40;
    var py = y + 38;
    var pw = w - 58;
    var ph = h - 62;
    var all = result.panel.treatedObserved.concat(result.synthetic, result.panel.treatedY0);
    var r = range(all);
    r.min -= 1;
    r.max += 1;
    grid(ctx, px, py, pw, ph, 4);
    var cut = px + pw * result.params.pre / (result.panel.total - 1);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cut, py);
    ctx.lineTo(cut, py + ph);
    ctx.stroke();
    result.panel.donors.forEach(function (donor) {
      path(ctx, donor, px, py, pw, ph, r, COLORS.donor, 0.7);
    });
    path(ctx, result.panel.treatedY0, px, py, pw, ph, r, COLORS.truePath, 2, [6, 5]);
    path(ctx, result.synthetic, px, py, pw, ph, r, COLORS.synthetic, 2.5);
    path(ctx, result.panel.treatedObserved, px, py, pw, ph, r, COLORS.treated, 2.5);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("vertical line = intervention; dashed gold = hidden no-treatment path", px, y + h - 13);
  }

  function drawGap(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "gap: treated minus synthetic");
    var px = x + 38;
    var py = y + 38;
    var pw = w - 54;
    var ph = h - 62;
    var gap = result.panel.treatedObserved.map(function (value, i) { return value - result.synthetic[i]; });
    var truth = result.panel.effect.slice();
    var r = range(gap.concat(truth, [0]));
    r.min -= 0.5;
    r.max += 0.5;
    grid(ctx, px, py, pw, ph, 4);
    var zero = py + ph - ph * (0 - r.min) / (r.max - r.min);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(px, zero);
    ctx.lineTo(px + pw, zero);
    ctx.stroke();
    var cut = px + pw * result.params.pre / (result.panel.total - 1);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(cut, py);
    ctx.lineTo(cut, py + ph);
    ctx.stroke();
    path(ctx, truth, px, py, pw, ph, r, COLORS.truePath, 2, [6, 5]);
    path(ctx, gap, px, py, pw, ph, r, COLORS.effect, 2.5);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("red is the estimator's gap; gold is the known simulation effect", px, y + h - 13);
  }

  function drawWeights(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "donor portfolio weights");
    var px = x + 30;
    var py = y + 42;
    var pw = w - 50;
    var ph = h - 72;
    var maxW = Math.max.apply(null, result.weights.concat(result.panel.baseWeights));
    for (var j = 0; j < result.weights.length; j += 1) {
      var barW = pw / result.weights.length * 0.7;
      var cx = px + pw * (j + 0.5) / result.weights.length;
      var estimatedH = ph * result.weights[j] / Math.max(1e-9, maxW);
      var trueH = ph * result.panel.baseWeights[j] / Math.max(1e-9, maxW);
      ctx.fillStyle = "rgba(245, 158, 11, 0.35)";
      ctx.fillRect(cx - barW / 2, py + ph - trueH, barW, trueH);
      ctx.fillStyle = COLORS.weight;
      ctx.fillRect(cx - barW / 2 + 3, py + ph - estimatedH, Math.max(2, barW - 6), estimatedH);
      ctx.fillStyle = result.panel.spillDonors.indexOf(j) >= 0 && result.params.leakage > 0 ? COLORS.effect : COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("D" + (j + 1), cx - 8, py + ph + 17);
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("purple = fitted weights; gold shadow = simulation recipe", px, y + h - 13);
  }

  function drawPlacebos(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "placebo donor gaps");
    var px = x + 42;
    var py = y + 40;
    var pw = w - 62;
    var ph = h - 66;
    var values = result.placebos.map(function (row) { return row.postMean; }).concat([result.estimate, 0]);
    var r = range(values);
    r.min -= 0.5;
    r.max += 0.5;
    grid(ctx, px, py, pw, ph, 4);
    var zero = py + ph - ph * (0 - r.min) / (r.max - r.min);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(px, zero);
    ctx.lineTo(px + pw, zero);
    ctx.stroke();
    result.placebos.forEach(function (row, i) {
      var xx = px + pw * (i + 0.5) / result.placebos.length;
      var yy = py + ph - ph * (row.postMean - r.min) / (r.max - r.min);
      ctx.fillStyle = COLORS.placebo;
      ctx.beginPath();
      ctx.arc(xx, yy, 4, 0, 2 * Math.PI);
      ctx.fill();
    });
    var tx = px + pw - 10;
    var ty = py + ph - ph * (result.estimate - r.min) / (r.max - r.min);
    ctx.fillStyle = COLORS.effect;
    ctx.beginPath();
    ctx.arc(tx, ty, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("gray = donor-as-treated placebos; red = treated unit", px, y + h - 13);
  }

  function drawLedger(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "diagnostic ledger");
    var rows = [
      ["pre fit error", fmt(result.preRmspe, 2)],
      ["post RMSPE", fmt(result.postRmspe, 2)],
      ["counterfactual error", fmt(result.counterfactualRmse, 2)],
      ["estimated - true", fmt(result.estimate - result.trueEffect, 2)],
      ["placebo tail area", fmt(result.placeboP, 2)]
    ];
    ctx.font = "13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    rows.forEach(function (row, i) {
      var yy = y + 50 + i * 30;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(row[0], x + 20, yy);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row[1], x + w - 86, yy);
      ctx.font = "13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    });
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    clear(ctx);
    drawPaths(ctx, result, 18, 18, 884, 226);
    drawGap(ctx, result, 18, 262, 430, 218);
    drawWeights(ctx, result, 472, 262, 430, 218);
    drawPlacebos(ctx, result, 18, 498, 430, 226);
    drawLedger(ctx, result, 472, 498, 430, 226);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__syntheticControlLabResult = result;
  }

  function init(root) {
    if (!root || root.__syntheticControlLabInitialized) return;
    root.__syntheticControlLabInitialized = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function initAll() {
    document.querySelectorAll("[data-synthetic-control-lab]").forEach(init);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SyntheticControlLab = api;
})(typeof window !== "undefined" ? window : globalThis);
