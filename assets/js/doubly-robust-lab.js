(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#edf2f7",
    naive: "#be123c",
    outcome: "#7c3aed",
    ipw: "#b45309",
    aipw: "#0f766e",
    trueLine: "#2563eb",
    good: "#10b981",
    warn: "#d97706",
    bad: "#e11d48",
    treated: "#2563eb",
    control: "#94a3b8"
  };

  var ESTIMATORS = [
    { key: "naive", label: "Naive difference", short: "Naive", color: COLORS.naive },
    { key: "outcome", label: "Outcome regression", short: "OR", color: COLORS.outcome },
    { key: "ipw", label: "IPW", short: "IPW", color: COLORS.ipw },
    { key: "aipw", label: "AIPW", short: "AIPW", color: COLORS.aipw }
  ];

  var SCENARIOS = [
    { key: "both", label: "both right", outcome: "full", propensity: "full" },
    { key: "outcome", label: "outcome right", outcome: "full", propensity: "simple" },
    { key: "propensity", label: "propensity right", outcome: "simple", propensity: "full" },
    { key: "neither", label: "both wrong", outcome: "simple", propensity: "simple" }
  ];

  var SCENARIO_LABELS = {
    both: "both models right",
    outcome: "outcome right only",
    propensity: "propensity right only",
    neither: "both models wrong"
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

  function sigmoid(x) {
    if (x < -35) return 0;
    if (x > 35) return 1;
    return 1 / (1 + Math.exp(-x));
  }

  function normalizeParams(input) {
    var scenario = input && SCENARIO_LABELS[input.scenario] ? input.scenario : "outcome";
    return {
      rows: clamp(Math.round(Number(input && input.rows) || 900), 300, 2400),
      confounding: clamp(Number(input && input.confounding) || 75, 0, 120),
      overlap: clamp(Number(input && input.overlap) || 8, 2, 30),
      heterogeneity: clamp(Number(input && input.heterogeneity) || 70, 0, 140),
      noise: clamp(Number(input && input.noise) || 65, 20, 140),
      runs: clamp(Math.round(Number(input && input.runs) || 80), 24, 180),
      scenario: scenario,
      seed: clamp(Math.round(Number(input && input.seed) || 37), 1, 9999)
    };
  }

  function seedFor(params, offset) {
    return (20260618
      + params.rows * 11
      + Math.round(params.confounding * 23)
      + Math.round(params.overlap * 31)
      + Math.round(params.heterogeneity * 37)
      + Math.round(params.noise * 41)
      + params.seed * 101
      + (offset || 0)) >>> 0;
  }

  function trueParts(x1, x2, params) {
    var conf = params.confounding / 75;
    var h = params.heterogeneity / 100;
    var mu0 = 0.25
      + 0.55 * x1
      - 0.35 * x2
      + 0.28 * x1 * x1
      - 0.22 * x1 * x2
      + 0.32 * Math.sin(2 * x2);
    var tau = 0.55 + h * (0.23 * x1 - 0.18 * x2);
    var rawE = -0.10 + conf * (0.85 * x1 - 0.72 * x2 + 0.58 * x1 * x2 + 0.62 * Math.sin(2 * x1));
    var floor = params.overlap / 100;
    var e = floor + (1 - 2 * floor) * sigmoid(rawE);
    return { mu0: mu0, tau: tau, mu1: mu0 + tau, e: clamp(e, floor, 1 - floor) };
  }

  function makeData(input, offset) {
    var params = normalizeParams(input);
    var rand = rng(seedFor(params, offset || 0));
    var rows = [];
    var trueAte = 0;
    var treated = 0;
    var minE = 1;
    var maxE = 0;
    var sigma = params.noise / 100;

    for (var i = 0; i < params.rows; i += 1) {
      var x1 = normal(rand);
      var x2 = normal(rand);
      var parts = trueParts(x1, x2, params);
      var a = rand() < parts.e ? 1 : 0;
      var y = (a ? parts.mu1 : parts.mu0) + sigma * normal(rand);
      trueAte += parts.tau;
      treated += a;
      minE = Math.min(minE, parts.e);
      maxE = Math.max(maxE, parts.e);
      rows.push({
        index: i,
        x1: x1,
        x2: x2,
        a: a,
        y: y,
        mu0: parts.mu0,
        mu1: parts.mu1,
        tau: parts.tau,
        e: parts.e
      });
    }

    return {
      rows: rows,
      params: params,
      trueAte: trueAte / Math.max(1, params.rows),
      treatedRate: treated / Math.max(1, params.rows),
      minE: minE,
      maxE: maxE
    };
  }

  function outcomeFeatures(row, mode) {
    if (mode === "full") {
      return [1, row.x1, row.x2, row.x1 * row.x1, row.x1 * row.x2, Math.sin(2 * row.x2)];
    }
    return [1, row.x1];
  }

  function propensityFeatures(row, mode) {
    if (mode === "full") {
      return [1, row.x1, row.x2, row.x1 * row.x2, Math.sin(2 * row.x1)];
    }
    return [1, row.x1];
  }

  function dot(a, b) {
    var total = 0;
    for (var i = 0; i < a.length; i += 1) total += a[i] * b[i];
    return total;
  }

  function solveLinear(matrix, vector) {
    var n = vector.length;
    var a = [];
    var b = vector.slice();
    for (var i = 0; i < n; i += 1) a.push(matrix[i].slice());

    for (var col = 0; col < n; col += 1) {
      var pivot = col;
      var best = Math.abs(a[col][col]);
      for (var row = col + 1; row < n; row += 1) {
        var candidate = Math.abs(a[row][col]);
        if (candidate > best) {
          best = candidate;
          pivot = row;
        }
      }
      if (pivot !== col) {
        var tmp = a[col];
        a[col] = a[pivot];
        a[pivot] = tmp;
        var tb = b[col];
        b[col] = b[pivot];
        b[pivot] = tb;
      }
      var diag = Math.abs(a[col][col]) < 1e-10 ? (a[col][col] < 0 ? -1e-10 : 1e-10) : a[col][col];
      for (row = col + 1; row < n; row += 1) {
        var factor = a[row][col] / diag;
        if (factor === 0) continue;
        for (var j = col; j < n; j += 1) a[row][j] -= factor * a[col][j];
        b[row] -= factor * b[col];
      }
    }

    var x = new Array(n).fill(0);
    for (i = n - 1; i >= 0; i -= 1) {
      var sum = b[i];
      for (j = i + 1; j < n; j += 1) sum -= a[i][j] * x[j];
      var denom = Math.abs(a[i][i]) < 1e-10 ? (a[i][i] < 0 ? -1e-10 : 1e-10) : a[i][i];
      x[i] = sum / denom;
    }
    return x;
  }

  function fitRidge(rows, mode, treatmentValue) {
    var selected = rows.filter(function (row) { return row.a === treatmentValue; });
    var p = outcomeFeatures(rows[0], mode).length;
    var xtx = [];
    var xty = new Array(p).fill(0);
    var lambda = 1e-4;
    for (var i = 0; i < p; i += 1) {
      xtx.push(new Array(p).fill(0));
      xtx[i][i] = lambda;
    }
    if (!selected.length) {
      return { beta: new Array(p).fill(0), mode: mode };
    }
    selected.forEach(function (row) {
      var x = outcomeFeatures(row, mode);
      for (var j = 0; j < p; j += 1) {
        xty[j] += x[j] * row.y;
        for (var k = 0; k < p; k += 1) xtx[j][k] += x[j] * x[k];
      }
    });
    return { beta: solveLinear(xtx, xty), mode: mode };
  }

  function predictOutcome(model, row) {
    return dot(outcomeFeatures(row, model.mode), model.beta);
  }

  function fitLogistic(rows, mode) {
    var p = propensityFeatures(rows[0], mode).length;
    var beta = new Array(p).fill(0);
    var lambda = 1e-3;
    for (var iter = 0; iter < 9; iter += 1) {
      var h = [];
      var g = new Array(p).fill(0);
      for (var j = 0; j < p; j += 1) {
        h.push(new Array(p).fill(0));
        h[j][j] = lambda;
      }
      rows.forEach(function (row) {
        var x = propensityFeatures(row, mode);
        var pred = clamp(sigmoid(dot(x, beta)), 1e-5, 1 - 1e-5);
        var w = pred * (1 - pred);
        var residual = row.a - pred;
        for (var a = 0; a < p; a += 1) {
          g[a] += x[a] * residual - lambda * beta[a];
          for (var b = 0; b < p; b += 1) h[a][b] += x[a] * x[b] * w;
        }
      });
      var delta = solveLinear(h, g);
      var maxStep = 0;
      for (j = 0; j < p; j += 1) {
        beta[j] += clamp(delta[j], -1.5, 1.5);
        maxStep = Math.max(maxStep, Math.abs(delta[j]));
      }
      if (maxStep < 1e-5) break;
    }
    return { beta: beta, mode: mode };
  }

  function predictPropensity(model, row) {
    return clamp(sigmoid(dot(propensityFeatures(row, model.mode), model.beta)), 0.01, 0.99);
  }

  function scenarioByKey(key) {
    for (var i = 0; i < SCENARIOS.length; i += 1) {
      if (SCENARIOS[i].key === key) return SCENARIOS[i];
    }
    return SCENARIOS[0];
  }

  function fitNuisance(data, scenario) {
    return {
      mu0: fitRidge(data.rows, scenario.outcome, 0),
      mu1: fitRidge(data.rows, scenario.outcome, 1),
      prop: fitLogistic(data.rows, scenario.propensity)
    };
  }

  function estimate(data, scenarioKey) {
    var scenario = scenarioByKey(scenarioKey);
    var nuisance = fitNuisance(data, scenario);
    var treatedY = 0;
    var controlY = 0;
    var treatedN = 0;
    var controlN = 0;
    var or = 0;
    var ipw = 0;
    var aipw = 0;
    var weightSum = 0;
    var weightSq = 0;
    var minEhat = 1;
    var maxEhat = 0;
    var rows = data.rows;

    rows.forEach(function (row) {
      var mu0 = predictOutcome(nuisance.mu0, row);
      var mu1 = predictOutcome(nuisance.mu1, row);
      var ehat = predictPropensity(nuisance.prop, row);
      var w = row.a ? 1 / ehat : 1 / (1 - ehat);
      minEhat = Math.min(minEhat, ehat);
      maxEhat = Math.max(maxEhat, ehat);
      weightSum += w;
      weightSq += w * w;
      if (row.a) {
        treatedY += row.y;
        treatedN += 1;
      } else {
        controlY += row.y;
        controlN += 1;
      }
      or += mu1 - mu0;
      ipw += row.a * row.y / ehat - (1 - row.a) * row.y / (1 - ehat);
      aipw += mu1 - mu0
        + row.a * (row.y - mu1) / ehat
        - (1 - row.a) * (row.y - mu0) / (1 - ehat);
    });

    var n = rows.length;
    var naive = treatedN && controlN ? treatedY / treatedN - controlY / controlN : 0;
    var estimates = {
      naive: naive,
      outcome: or / n,
      ipw: ipw / n,
      aipw: aipw / n
    };
    var rowsOut = ESTIMATORS.map(function (method) {
      var value = estimates[method.key];
      var error = value - data.trueAte;
      return {
        key: method.key,
        label: method.label,
        short: method.short,
        color: method.color,
        value: value,
        error: error,
        absError: Math.abs(error)
      };
    });

    return {
      scenario: scenario,
      trueAte: data.trueAte,
      estimates: rowsOut,
      byKey: rowsOut.reduce(function (acc, row) {
        acc[row.key] = row;
        return acc;
      }, {}),
      treatedRate: data.treatedRate,
      weightEss: weightSum * weightSum / Math.max(1e-9, weightSq),
      minEhat: minEhat,
      maxEhat: maxEhat,
      nuisance: nuisance
    };
  }

  function addEstimate(acc, result) {
    ESTIMATORS.forEach(function (method) {
      var row = result.byKey[method.key];
      var slot = acc[method.key];
      slot.value += row.value;
      slot.error += row.error;
      slot.absError += Math.abs(row.error);
      slot.rmse += row.error * row.error;
    });
    acc.__true += result.trueAte;
    acc.__ess += result.weightEss;
    acc.__treatedRate += result.treatedRate;
    acc.__minEhat += result.minEhat;
    acc.__maxEhat += result.maxEhat;
  }

  function summarizeAcc(acc, runs) {
    var rows = ESTIMATORS.map(function (method) {
      var slot = acc[method.key];
      return {
        key: method.key,
        label: method.label,
        short: method.short,
        color: method.color,
        value: slot.value / runs,
        bias: slot.error / runs,
        absError: slot.absError / runs,
        rmse: Math.sqrt(slot.rmse / runs)
      };
    });
    return {
      estimators: rows,
      byKey: rows.reduce(function (map, row) {
        map[row.key] = row;
        return map;
      }, {}),
      trueAte: acc.__true / runs,
      weightEss: acc.__ess / runs,
      treatedRate: acc.__treatedRate / runs,
      minEhat: acc.__minEhat / runs,
      maxEhat: acc.__maxEhat / runs
    };
  }

  function simulate(input) {
    var params = normalizeParams(input);
    var acc = {};
    SCENARIOS.forEach(function (scenario) {
      acc[scenario.key] = { __true: 0, __ess: 0, __treatedRate: 0, __minEhat: 0, __maxEhat: 0 };
      ESTIMATORS.forEach(function (method) {
        acc[scenario.key][method.key] = { value: 0, error: 0, absError: 0, rmse: 0 };
      });
    });

    for (var run = 0; run < params.runs; run += 1) {
      var data = makeData(params, run * 997 + 17);
      SCENARIOS.forEach(function (scenario) {
        addEstimate(acc[scenario.key], estimate(data, scenario.key));
      });
    }

    var scenarios = {};
    SCENARIOS.forEach(function (scenario) {
      scenarios[scenario.key] = summarizeAcc(acc[scenario.key], params.runs);
      scenarios[scenario.key].scenario = scenario;
    });

    return {
      params: params,
      scenarios: scenarios,
      selected: scenarios[params.scenario],
      runs: params.runs
    };
  }

  function deciles(rows, getter) {
    var sorted = rows.slice().sort(function (a, b) { return getter(a) - getter(b); });
    var bins = [];
    for (var i = 0; i < 10; i += 1) bins.push({ lo: 0, hi: 0, treated: 0, control: 0, count: 0 });
    sorted.forEach(function (row, i) {
      var b = clamp(Math.floor(10 * i / sorted.length), 0, 9);
      var value = getter(row);
      if (bins[b].count === 0) bins[b].lo = value;
      bins[b].hi = value;
      bins[b].count += 1;
      if (row.a) bins[b].treated += 1;
      else bins[b].control += 1;
    });
    return bins;
  }

  function evaluate(input) {
    var params = normalizeParams(input);
    var data = makeData(params, 3);
    var sample = {};
    SCENARIOS.forEach(function (scenario) {
      sample[scenario.key] = estimate(data, scenario.key);
    });
    var sim = simulate(params);
    var selected = sample[params.scenario];
    var result = {
      params: params,
      sample: sample,
      representative: selected,
      simulation: sim,
      eBins: deciles(data.rows, function (row) { return row.e; })
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var finite = Object.keys(result.simulation.scenarios).every(function (key) {
      var scenario = result.simulation.scenarios[key];
      return scenario.estimators.every(function (row) {
        return isFinite(row.value) && isFinite(row.bias) && isFinite(row.rmse);
      }) && isFinite(scenario.trueAte) && isFinite(scenario.weightEss);
    });
    var both = result.simulation.scenarios.both.byKey.aipw;
    var outcome = result.simulation.scenarios.outcome.byKey.aipw;
    var propensity = result.simulation.scenarios.propensity.byKey.aipw;
    var neither = result.simulation.scenarios.neither.byKey.aipw;
    var robustShape = Math.abs(both.bias) < 0.08
      && Math.abs(outcome.bias) < 0.10
      && Math.abs(propensity.bias) < 0.12
      && Math.abs(neither.bias) > Math.abs(both.bias) + 0.015;
    var overlapValid = result.eBins.every(function (bin) {
      return bin.treated >= 0 && bin.control >= 0 && bin.count > 0;
    });
    return {
      passed: finite && robustShape && overlapValid,
      finite: finite,
      robustShape: robustShape,
      overlapValid: overlapValid
    };
  }

  function auditDoublyRobustLab() {
    var total = 0;
    var passed = 0;
    [600, 900].forEach(function (rows) {
      [45, 90].forEach(function (confounding) {
        [6, 14].forEach(function (overlap) {
          total += 1;
          var result = evaluate({
            rows: rows,
            confounding: confounding,
            overlap: overlap,
            heterogeneity: 70,
            noise: 65,
            runs: 40,
            scenario: "outcome",
            seed: 31
          });
          if (result.audit.passed) passed += 1;
        });
      });
    });
    return { total: total, passed: passed };
  }

  function pct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function fmt(value, digits) {
    return value.toFixed(digits == null ? 3 : digits);
  }

  function metric(label, value, tone) {
    var klass = "dr-lab__metric" + (tone ? " dr-lab__metric--" + tone : "");
    return '<div class="' + klass + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function method(summary, key) {
    return summary.byKey[key];
  }

  function scale(domain, range) {
    var d = domain.max - domain.min || 1;
    var r = range.max - range.min;
    return function (value) {
      return range.min + ((value - domain.min) / d) * r;
    };
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 860);
    var height = width < 560 ? 820 : 620;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 12, COLORS.text, 13, 750);
    text(ctx, subtitle, box.x + 14, box.y + 31, COLORS.muted, 11, 500);
  }

  function drawGrid(ctx, plot, xSteps, ySteps) {
    ctx.strokeStyle = COLORS.faint;
    ctx.lineWidth = 1;
    for (var i = 0; i <= xSteps; i += 1) {
      var x = plot.x + plot.w * i / xSteps;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    for (var j = 0; j <= ySteps; j += 1) {
      var y = plot.y + plot.h * j / ySteps;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawQuadrantPanel(ctx, box, result) {
    panel(ctx, box, "double-robust quadrant", "AIPW bias across nuisance-model states");
    var plot = { x: box.x + 28, y: box.y + 62, w: box.w - 56, h: box.h - 92 };
    var cellW = plot.w / 2;
    var cellH = plot.h / 2;
    var maxAbs = 0.001;
    SCENARIOS.forEach(function (scenario) {
      maxAbs = Math.max(maxAbs, Math.abs(result.simulation.scenarios[scenario.key].byKey.aipw.bias));
    });
    maxAbs = Math.max(maxAbs, 0.12);

    var positions = {
      both: [0, 0],
      outcome: [1, 0],
      propensity: [0, 1],
      neither: [1, 1]
    };

    SCENARIOS.forEach(function (scenario) {
      var pos = positions[scenario.key];
      var x = plot.x + pos[0] * cellW;
      var y = plot.y + pos[1] * cellH;
      var bias = result.simulation.scenarios[scenario.key].byKey.aipw.bias;
      var intensity = clamp(Math.abs(bias) / maxAbs, 0, 1);
      ctx.fillStyle = bias >= 0
        ? "rgba(180,83,9," + (0.14 + 0.58 * intensity).toFixed(3) + ")"
        : "rgba(37,99,235," + (0.14 + 0.58 * intensity).toFixed(3) + ")";
      ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(x, y, cellW, cellH);
      text(ctx, scenario.label, x + 12, y + 12, COLORS.text, 12, 750);
      text(ctx, "AIPW bias " + fmt(bias, 3), x + 12, y + 34, COLORS.text, 12, 650);
      text(ctx, "RMSE " + fmt(result.simulation.scenarios[scenario.key].byKey.aipw.rmse, 3), x + 12, y + 54, COLORS.muted, 11, 500);
    });

    text(ctx, "propensity correct", plot.x + cellW / 2, box.y + box.h - 20, COLORS.muted, 11, 650, "center");
    text(ctx, "propensity wrong", plot.x + cellW * 1.5, box.y + box.h - 20, COLORS.muted, 11, 650, "center");
    ctx.save();
    ctx.translate(box.x + 10, plot.y + cellH / 2);
    ctx.rotate(-Math.PI / 2);
    text(ctx, "outcome correct", 0, 0, COLORS.muted, 11, 650, "center");
    ctx.restore();
    ctx.save();
    ctx.translate(box.x + 10, plot.y + cellH * 1.5);
    ctx.rotate(-Math.PI / 2);
    text(ctx, "outcome wrong", 0, 0, COLORS.muted, 11, 650, "center");
    ctx.restore();
  }

  function drawEstimatorPanel(ctx, box, result) {
    var selected = result.simulation.selected;
    panel(ctx, box, "selected case: " + SCENARIO_LABELS[result.params.scenario], "mean estimate minus true ATE over repeated samples");
    var plot = { x: box.x + 52, y: box.y + 62, w: box.w - 80, h: box.h - 102 };
    var maxAbs = 0.05;
    selected.estimators.forEach(function (row) {
      maxAbs = Math.max(maxAbs, Math.abs(row.bias), row.rmse * 0.65);
    });
    maxAbs *= 1.25;
    var sy = scale({ min: -maxAbs, max: maxAbs }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(plot.x, sy(0));
    ctx.lineTo(plot.x + plot.w, sy(0));
    ctx.stroke();

    var gap = plot.w / ESTIMATORS.length;
    var barW = Math.min(66, gap * 0.48);
    selected.estimators.forEach(function (row, i) {
      var x = plot.x + gap * i + gap / 2 - barW / 2;
      var y0 = sy(0);
      var y1 = sy(row.bias);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, Math.min(y0, y1), barW, Math.max(2, Math.abs(y1 - y0)));
      ctx.strokeStyle = row.color;
      ctx.globalAlpha = 0.35;
      var err = row.rmse;
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, sy(-err));
      ctx.lineTo(x + barW / 2, sy(err));
      ctx.stroke();
      ctx.globalAlpha = 1;
      text(ctx, row.short, x + barW / 2, plot.y + plot.h + 12, COLORS.text, 11, 750, "center");
      text(ctx, fmt(row.bias, 3), x + barW / 2, Math.min(y0, y1) - 18, row.color, 11, 750, "center");
    });
    text(ctx, "bias", box.x + 16, plot.y + 4, COLORS.muted, 11, 500);
    text(ctx, "vertical whisker: RMSE around truth", box.x + box.w - 16, box.y + box.h - 24, COLORS.muted, 10, 500, "right");
  }

  function drawOverlapPanel(ctx, box, result) {
    panel(ctx, box, "overlap ledger", "true propensity deciles in one representative sample");
    var plot = { x: box.x + 46, y: box.y + 62, w: box.w - 70, h: box.h - 102 };
    var maxCount = 1;
    result.eBins.forEach(function (bin) { maxCount = Math.max(maxCount, bin.treated + bin.control); });
    var sy = scale({ min: 0, max: maxCount * 1.18 }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 5, 4);
    var gap = plot.w / result.eBins.length;
    var barW = Math.max(8, gap * 0.64);
    result.eBins.forEach(function (bin, i) {
      var x = plot.x + gap * i + gap / 2 - barW / 2;
      var base = plot.y + plot.h;
      var controlH = base - sy(bin.control);
      var treatedH = base - sy(bin.treated);
      ctx.fillStyle = COLORS.control;
      ctx.fillRect(x, base - controlH, barW, controlH);
      ctx.fillStyle = COLORS.treated;
      ctx.fillRect(x, base - controlH - treatedH, barW, treatedH);
      if (i % 2 === 0) text(ctx, String(i + 1), x + barW / 2, base + 10, COLORS.muted, 10, 600, "center");
    });
    text(ctx, "propensity decile", plot.x + plot.w / 2, box.y + box.h - 24, COLORS.muted, 11, 500, "center");
    text(ctx, "treated", box.x + box.w - 66, box.y + 48, COLORS.treated, 11, 750);
    text(ctx, "control", box.x + box.w - 66, box.y + 64, COLORS.control, 11, 750);
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (width < 560) {
      var pad = 14;
      drawQuadrantPanel(ctx, { x: pad, y: 16, w: width - 2 * pad, h: 236 }, result);
      drawEstimatorPanel(ctx, { x: pad, y: 268, w: width - 2 * pad, h: 252 }, result);
      drawOverlapPanel(ctx, { x: pad, y: 536, w: width - 2 * pad, h: height - 552 }, result);
    } else {
      var gap = 14;
      var sideW = (width - 36 - gap) / 2;
      drawQuadrantPanel(ctx, { x: 18, y: 18, w: sideW, h: 280 }, result);
      drawEstimatorPanel(ctx, { x: 18 + sideW + gap, y: 18, w: sideW, h: 280 }, result);
      drawOverlapPanel(ctx, { x: 18, y: 316, w: width - 36, h: height - 334 }, result);
    }
  }

  function renderMetrics(root, result) {
    var selected = result.simulation.selected;
    var aipw = method(selected, "aipw");
    var ipw = method(selected, "ipw");
    var outcome = method(selected, "outcome");
    var naive = method(selected, "naive");
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    holder.innerHTML = [
      metric("True ATE", fmt(selected.trueAte, 3), "good"),
      metric("AIPW bias", fmt(aipw.bias, 3), Math.abs(aipw.bias) < 0.06 ? "good" : "warn"),
      metric("Outcome bias", fmt(outcome.bias, 3), Math.abs(outcome.bias) < 0.06 ? "good" : "warn"),
      metric("IPW bias", fmt(ipw.bias, 3), Math.abs(ipw.bias) < 0.06 ? "good" : "warn"),
      metric("Naive bias", fmt(naive.bias, 3), Math.abs(naive.bias) < 0.06 ? "good" : "bad"),
      metric("Weight ESS", fmt(selected.weightEss, 0))
    ].join("");
  }

  function readControls(root) {
    var values = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      values[input.getAttribute("data-param")] = input.value;
    });
    return normalizeParams(values);
  }

  function updateOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (out) {
      var key = out.getAttribute("data-value");
      if (key === "rows") out.textContent = params.rows.toLocaleString();
      if (key === "confounding") out.textContent = params.confounding.toFixed(0) + "%";
      if (key === "overlap") out.textContent = params.overlap.toFixed(0) + "%";
      if (key === "heterogeneity") out.textContent = params.heterogeneity.toFixed(0) + "%";
      if (key === "noise") out.textContent = (params.noise / 100).toFixed(2);
      if (key === "runs") out.textContent = params.runs.toLocaleString();
      if (key === "seed") out.textContent = String(params.seed);
      if (key === "scenario") out.textContent = SCENARIO_LABELS[params.scenario];
    });
  }

  function init(root) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var pending = false;

    function render() {
      pending = false;
      var params = readControls(root);
      updateOutputs(root, params);
      var result = evaluate(params);
      root.__doublyRobustResult = result;
      renderMetrics(root, result);
      draw(result, canvas);
    }

    function schedule() {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(render);
    }

    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-doubly-robust-lab]")).forEach(init);
  }

  var api = {
    evaluate: evaluate,
    simulate: simulate,
    makeData: makeData,
    estimate: estimate,
    auditDoublyRobustLab: auditDoublyRobustLab
  };

  global.DoublyRobustLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
