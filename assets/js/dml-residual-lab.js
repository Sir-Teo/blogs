(function (global) {
  "use strict";

  var TRUE_THETA = 0.7;
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d8e0e8",
    grid: "#edf2f7",
    panel: "#f8fafc",
    naive: "#b45309",
    residualY: "#be123c",
    sameSample: "#2563eb",
    crossFit: "#0f766e",
    oracle: "#7c3aed",
    trueLine: "#172026"
  };

  var DEFAULTS = {
    n: 480,
    confounding: 1.25,
    roughness: 1.0,
    learner: "rbf",
    lambda: 0.01,
    folds: 5,
    reps: 60,
    highlight: "crossFit"
  };

  var LEARNERS = ["linear", "cubic", "rbf", "wiggly"];
  var LAMBDAS = [0, 0.0001, 0.01, 0.3, 3];
  var FOLDS = [2, 5, 10];
  var REPS = [30, 60, 100];
  var HIGHLIGHTS = ["crossFit", "sameSample", "residualY", "naive"];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function nearest(value, allowed, fallback) {
    if (typeof allowed[0] === "string") {
      value = String(value == null ? fallback : value);
      return allowed.indexOf(value) >= 0 ? value : fallback;
    }
    var raw = Number(value);
    if (!isFinite(raw)) return fallback;
    var best = allowed[0];
    var bestDistance = Infinity;
    allowed.forEach(function (candidate) {
      var distance = Math.abs(candidate - raw);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    });
    return best;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      n: snap(raw.n, DEFAULTS.n, 160, 900, 20),
      confounding: snap(raw.confounding, DEFAULTS.confounding, 0, 2, 0.25),
      roughness: snap(raw.roughness, DEFAULTS.roughness, 0.4, 1.6, 0.2),
      learner: nearest(raw.learner, LEARNERS, DEFAULTS.learner),
      lambda: nearest(raw.lambda, LAMBDAS, DEFAULTS.lambda),
      folds: nearest(raw.folds, FOLDS, DEFAULTS.folds),
      reps: nearest(raw.reps, REPS, DEFAULTS.reps),
      highlight: nearest(raw.highlight, HIGHLIGHTS, DEFAULTS.highlight)
    };
  }

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

  function m0(x, confounding) {
    return confounding * (0.9 * Math.sin(1.7 * x) + 0.35 * x + 0.22 * (x * x - 1));
  }

  function g0(x, roughness) {
    return roughness * (1.15 * Math.cos(1.2 * x) + 0.55 * Math.sin(3.1 * x) + 0.28 * (x * x - 1));
  }

  function basis(x, learner) {
    if (learner === "linear") return [1, x];
    if (learner === "cubic") return [1, x, x * x, x * x * x];

    var out = [
      1,
      x,
      x * x,
      x * x * x,
      Math.sin(x),
      Math.cos(x),
      Math.sin(2 * x),
      Math.cos(2 * x),
      Math.sin(3 * x),
      Math.cos(3 * x)
    ];
    var centers = learner === "wiggly"
      ? Array.from({ length: 41 }, function (_, i) { return -2.5 + (5 * i) / 40; })
      : [-2, -1, 0, 1, 2];
    var width = learner === "wiggly" ? 0.16 : 0.65;
    centers.forEach(function (center) {
      var z = (x - center) / width;
      out.push(Math.exp(-0.5 * z * z));
    });
    return out;
  }

  function solveLinear(system, rhs) {
    var n = rhs.length;
    var a = system.map(function (row) { return row.slice(); });
    var b = rhs.slice();

    for (var col = 0; col < n; col += 1) {
      var pivot = col;
      for (var row = col + 1; row < n; row += 1) {
        if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      }
      if (pivot !== col) {
        var tmpRow = a[col];
        a[col] = a[pivot];
        a[pivot] = tmpRow;
        var tmp = b[col];
        b[col] = b[pivot];
        b[pivot] = tmp;
      }
      if (Math.abs(a[col][col]) < 1e-8) a[col][col] = a[col][col] < 0 ? -1e-8 : 1e-8;
      for (var r = col + 1; r < n; r += 1) {
        var factor = a[r][col] / a[col][col];
        for (var c = col; c < n; c += 1) a[r][c] -= factor * a[col][c];
        b[r] -= factor * b[col];
      }
    }

    var solution = Array(n).fill(0);
    for (var i = n - 1; i >= 0; i -= 1) {
      var value = b[i];
      for (var j = i + 1; j < n; j += 1) value -= a[i][j] * solution[j];
      solution[i] = value / a[i][i];
    }
    return solution;
  }

  function fitRidge(xs, ys, learner, lambda) {
    var p = basis(xs[0], learner).length;
    var xtx = Array.from({ length: p }, function () { return Array(p).fill(0); });
    var xty = Array(p).fill(0);

    for (var i = 0; i < xs.length; i += 1) {
      var phi = basis(xs[i], learner);
      for (var j = 0; j < p; j += 1) {
        xty[j] += phi[j] * ys[i];
        for (var k = 0; k <= j; k += 1) xtx[j][k] += phi[j] * phi[k];
      }
    }
    for (var row = 0; row < p; row += 1) {
      for (var col = 0; col < row; col += 1) xtx[col][row] = xtx[row][col];
      if (row > 0) xtx[row][row] += Math.max(1e-9, lambda) * xs.length;
    }
    return solveLinear(xtx, xty);
  }

  function predictOne(coefficients, x, learner) {
    var phi = basis(x, learner);
    var total = 0;
    for (var i = 0; i < phi.length; i += 1) total += phi[i] * coefficients[i];
    return total;
  }

  function generateData(params, rep) {
    var rand = rng(0xD0B1E + rep * 1009 + params.n * 31 + Math.round(params.confounding * 100));
    var x = [];
    var d = [];
    var y = [];
    var m = [];
    var l = [];

    for (var i = 0; i < params.n; i += 1) {
      var xi = -2.4 + 4.8 * rand();
      var mi = m0(xi, params.confounding);
      var gi = g0(xi, params.roughness);
      var treatmentNoise = normal(rand);
      var outcomeNoise = normal(rand);
      var di = mi + treatmentNoise;
      var yi = TRUE_THETA * di + gi + outcomeNoise;
      x.push(xi);
      d.push(di);
      y.push(yi);
      m.push(mi);
      l.push(TRUE_THETA * mi + gi);
    }
    return { x: x, d: d, y: y, m: m, l: l };
  }

  function fitSameSample(data, params) {
    var outcome = fitRidge(data.x, data.y, params.learner, params.lambda);
    var treatment = fitRidge(data.x, data.d, params.learner, params.lambda);
    return {
      lhat: data.x.map(function (x) { return predictOne(outcome, x, params.learner); }),
      mhat: data.x.map(function (x) { return predictOne(treatment, x, params.learner); })
    };
  }

  function fitCrossFit(data, params) {
    var n = data.x.length;
    var lhat = Array(n);
    var mhat = Array(n);

    for (var fold = 0; fold < params.folds; fold += 1) {
      var trainX = [];
      var trainY = [];
      var trainD = [];
      var test = [];
      for (var i = 0; i < n; i += 1) {
        if (i % params.folds === fold) test.push(i);
        else {
          trainX.push(data.x[i]);
          trainY.push(data.y[i]);
          trainD.push(data.d[i]);
        }
      }

      var outcome = fitRidge(trainX, trainY, params.learner, params.lambda);
      var treatment = fitRidge(trainX, trainD, params.learner, params.lambda);
      test.forEach(function (index) {
        lhat[index] = predictOne(outcome, data.x[index], params.learner);
        mhat[index] = predictOne(treatment, data.x[index], params.learner);
      });
    }

    return { lhat: lhat, mhat: mhat };
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function variance(values) {
    var m = mean(values);
    return values.reduce(function (sum, value) {
      return sum + (value - m) * (value - m);
    }, 0) / Math.max(1, values.length - 1);
  }

  function simpleSlope(x, y) {
    var mx = mean(x);
    var my = mean(y);
    var num = 0;
    var den = 0;
    for (var i = 0; i < x.length; i += 1) {
      num += (x[i] - mx) * (y[i] - my);
      den += (x[i] - mx) * (x[i] - mx);
    }
    return den > 0 ? num / den : 0;
  }

  function dmlEstimate(data, nuisances) {
    var n = data.x.length;
    var residualY = Array(n);
    var residualD = Array(n);
    var numerator = 0;
    var denominator = 0;

    for (var i = 0; i < n; i += 1) {
      residualY[i] = data.y[i] - nuisances.lhat[i];
      residualD[i] = data.d[i] - nuisances.mhat[i];
      numerator += residualD[i] * residualY[i];
      denominator += residualD[i] * residualD[i];
    }

    var theta = denominator > 1e-12 ? numerator / denominator : 0;
    var scoreSecondMoment = 0;
    var a = denominator / n;
    for (var j = 0; j < n; j += 1) {
      var score = residualD[j] * (residualY[j] - theta * residualD[j]);
      scoreSecondMoment += score * score;
    }
    var se = a > 1e-12 ? Math.sqrt((scoreSecondMoment / n) / (a * a * n)) : Infinity;
    return {
      theta: theta,
      se: se,
      residualY: residualY,
      residualD: residualD
    };
  }

  function outcomeOnlyEstimate(data, nuisances) {
    var numerator = 0;
    var denominator = 0;
    for (var i = 0; i < data.x.length; i += 1) {
      var residualY = data.y[i] - nuisances.lhat[i];
      numerator += data.d[i] * residualY;
      denominator += data.d[i] * data.d[i];
    }
    return denominator > 1e-12 ? numerator / denominator : 0;
  }

  function estimateOne(data, params) {
    var cross = fitCrossFit(data, params);
    var same = fitSameSample(data, params);
    var oracle = { lhat: data.l, mhat: data.m };
    var crossFit = dmlEstimate(data, cross);
    var sameSample = dmlEstimate(data, same);
    var oracleEstimate = dmlEstimate(data, oracle);

    return {
      naive: { theta: simpleSlope(data.d, data.y), se: NaN },
      residualY: { theta: outcomeOnlyEstimate(data, cross), se: NaN },
      sameSample: sameSample,
      crossFit: crossFit,
      oracle: oracleEstimate,
      data: data
    };
  }

  function summarize(estimates) {
    var values = estimates.map(function (item) { return item.theta; });
    var m = mean(values);
    var bias = m - TRUE_THETA;
    var rmse = Math.sqrt(mean(values.map(function (value) {
      return (value - TRUE_THETA) * (value - TRUE_THETA);
    })));
    var coverageCount = 0;
    var coverageN = 0;
    estimates.forEach(function (item) {
      if (isFinite(item.se)) {
        coverageN += 1;
        if (item.theta - 1.96 * item.se <= TRUE_THETA && TRUE_THETA <= item.theta + 1.96 * item.se) coverageCount += 1;
      }
    });
    return {
      mean: m,
      bias: bias,
      rmse: rmse,
      sd: Math.sqrt(variance(values)),
      coverage: coverageN ? coverageCount / coverageN : NaN,
      values: values
    };
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var buckets = {
      naive: [],
      residualY: [],
      sameSample: [],
      crossFit: [],
      oracle: []
    };
    var sample = null;

    for (var rep = 0; rep < params.reps; rep += 1) {
      var data = generateData(params, rep);
      var result = estimateOne(data, params);
      ["naive", "residualY", "sameSample", "crossFit", "oracle"].forEach(function (key) {
        buckets[key].push(result[key]);
      });
      if (rep === 0) sample = result;
    }

    return {
      params: params,
      trueTheta: TRUE_THETA,
      sample: sample,
      summaries: {
        naive: summarize(buckets.naive),
        residualY: summarize(buckets.residualY),
        sameSample: summarize(buckets.sameSample),
        crossFit: summarize(buckets.crossFit),
        oracle: summarize(buckets.oracle)
      }
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatSigned(value, digits) {
    return (value >= 0 ? "+" : "") + formatNumber(value, digits == null ? 3 : digits);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (value * 100).toFixed(digits == null ? 0 : digits) + "%";
  }

  function methodLabel(key) {
    return {
      naive: "naive",
      residualY: "outcome-only",
      sameSample: "same-sample DML",
      crossFit: "cross-fit DML",
      oracle: "oracle"
    }[key] || key;
  }

  function lambdaLabel(value) {
    if (value === 0) return "none";
    if (value === 0.0001) return "tiny";
    if (value === 0.01) return "light";
    if (value === 0.3) return "medium";
    return "strong";
  }

  function metric(label, value, tone) {
    var klass = "dml-lab__metric";
    if (tone) klass += " dml-lab__metric--" + tone;
    return "<div class=\"" + klass + "\"><span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, data) {
    var s = data.summaries;
    var html = [
      metric("Cross-fit DML mean", formatNumber(s.crossFit.mean, 3), Math.abs(s.crossFit.bias) < 0.04 ? "good" : "warn"),
      metric("Cross-fit bias", formatSigned(s.crossFit.bias, 3), Math.abs(s.crossFit.bias) < 0.04 ? "good" : "warn"),
      metric("DML interval coverage", formatPercent(s.crossFit.coverage), s.crossFit.coverage > 0.88 ? "good" : "warn"),
      metric("Outcome-only bias", formatSigned(s.residualY.bias, 3), Math.abs(s.residualY.bias) < 0.08 ? "good" : "bad"),
      metric("Naive bias", formatSigned(s.naive.bias, 3), Math.abs(s.naive.bias) < 0.08 ? "warn" : "bad"),
      metric("Highlighted RMSE", formatNumber(s[data.params.highlight].rmse, 3), s[data.params.highlight].rmse < 0.12 ? "good" : "warn")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function paramsFromRoot(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function labelFor(key, value) {
    if (key === "confounding" || key === "roughness") return Number(value).toFixed(2) + "x";
    if (key === "lambda") return lambdaLabel(value);
    if (key === "highlight") return methodLabel(value);
    return String(value);
  }

  function updateControls(root, params) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (params[key] != null) input.value = String(params[key]);
    });
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (params[key] != null) output.textContent = labelFor(key, params[key]);
    });
  }

  function setFont(ctx, size, weight) {
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }

  function label(ctx, value, x, y, color, size, weight, align, baseline) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "middle";
    setFont(ctx, size || 12, weight || 500);
    ctx.fillText(value, x, y);
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = box.fill || "#ffffff";
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    label(ctx, title, box.x + 16, box.y + 23, COLORS.text, 13, 760);
    if (subtitle) label(ctx, subtitle, box.x + 16, box.y + 42, COLORS.muted, 10, 550);
  }

  function extent(values, pad) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = Math.max(1e-6, max - min);
    return { min: min - span * pad, max: max + span * pad };
  }

  function drawResidualScatter(ctx, data, box) {
    panel(ctx, box, "Residualized treatment vs residualized outcome", "held-out nuisance predictions");
    var sample = data.sample.crossFit;
    var xs = sample.residualD;
    var ys = sample.residualY;
    var xExt = extent(xs, 0.08);
    var yExt = extent(ys, 0.08);
    var left = box.x + 50;
    var right = box.x + box.w - 24;
    var top = box.y + 58;
    var bottom = box.y + box.h - 42;
    var w = right - left;
    var h = bottom - top;

    function px(x) { return left + w * (x - xExt.min) / (xExt.max - xExt.min); }
    function py(y) { return bottom - h * (y - yExt.min) / (yExt.max - yExt.min); }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [-2, 0, 2].forEach(function (tick) {
      if (tick > xExt.min && tick < xExt.max) {
        ctx.beginPath();
        ctx.moveTo(px(tick), top);
        ctx.lineTo(px(tick), bottom);
        ctx.stroke();
      }
      if (tick > yExt.min && tick < yExt.max) {
        ctx.beginPath();
        ctx.moveTo(left, py(tick));
        ctx.lineTo(right, py(tick));
        ctx.stroke();
      }
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    for (var i = 0; i < xs.length; i += 1) {
      var colorWeight = (data.sample.data.x[i] + 2.4) / 4.8;
      ctx.fillStyle = "rgba(" + Math.round(37 + 120 * colorWeight) + ", " + Math.round(99 + 35 * (1 - colorWeight)) + ", " + Math.round(170 - 65 * colorWeight) + ", 0.42)";
      ctx.beginPath();
      ctx.arc(px(xs[i]), py(ys[i]), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    var x1 = xExt.min;
    var x2 = xExt.max;
    ctx.strokeStyle = COLORS.trueLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(px(x1), py(TRUE_THETA * x1));
    ctx.lineTo(px(x2), py(TRUE_THETA * x2));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = COLORS.crossFit;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px(x1), py(data.sample.crossFit.theta * x1));
    ctx.lineTo(px(x2), py(data.sample.crossFit.theta * x2));
    ctx.stroke();

    label(ctx, "true slope", right - 8, py(TRUE_THETA * x2) - 12, COLORS.trueLine, 10, 700, "right");
    label(ctx, "estimated", right - 8, py(data.sample.crossFit.theta * x2) + 14, COLORS.crossFit, 10, 700, "right");
    label(ctx, "D residual", right, box.y + box.h - 17, COLORS.muted, 10, 550, "right");
    label(ctx, "Y residual", left, top - 15, COLORS.muted, 10, 550);
  }

  function drawHistogram(ctx, data, box) {
    panel(ctx, box, "Repeated simulated worlds", "sampling distribution of estimates");
    var keys = ["naive", "residualY", "sameSample", "crossFit"];
    var all = [];
    keys.forEach(function (key) { all = all.concat(data.summaries[key].values); });
    all.push(TRUE_THETA);
    var xExt = extent(all, 0.12);
    var left = box.x + 44;
    var right = box.x + box.w - 20;
    var top = box.y + 60;
    var bottom = box.y + box.h - 36;
    var w = right - left;
    var h = bottom - top;
    var bins = 26;

    function px(x) { return left + w * (x - xExt.min) / (xExt.max - xExt.min); }
    var maxCount = 1;
    var histograms = {};
    keys.forEach(function (key) {
      var counts = Array(bins).fill(0);
      data.summaries[key].values.forEach(function (value) {
        var index = Math.floor((value - xExt.min) / (xExt.max - xExt.min) * bins);
        index = clamp(index, 0, bins - 1);
        counts[index] += 1;
      });
      histograms[key] = counts;
      maxCount = Math.max(maxCount, Math.max.apply(null, counts));
    });

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [0, TRUE_THETA, 1].forEach(function (tick) {
      if (tick >= xExt.min && tick <= xExt.max) {
        ctx.beginPath();
        ctx.moveTo(px(tick), top);
        ctx.lineTo(px(tick), bottom);
        ctx.stroke();
        label(ctx, tick === TRUE_THETA ? "true" : String(tick), px(tick), bottom + 14, COLORS.muted, 10, 550, "center");
      }
    });

    var rowH = h / keys.length;
    keys.forEach(function (key, row) {
      var baseline = top + rowH * (row + 1) - 10;
      var counts = histograms[key];
      var color = COLORS[key];
      for (var b = 0; b < bins; b += 1) {
        var binW = w / bins;
        var barH = (rowH - 20) * counts[b] / maxCount;
        ctx.fillStyle = color;
        ctx.globalAlpha = key === data.params.highlight ? 0.78 : 0.38;
        ctx.fillRect(left + b * binW + 1, baseline - barH, Math.max(1, binW - 2), barH);
      }
      ctx.globalAlpha = 1;
      label(ctx, methodLabel(key), left + 4, baseline - rowH + 15, color, 10, 750);
    });

    ctx.strokeStyle = COLORS.trueLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px(TRUE_THETA), top - 4);
    ctx.lineTo(px(TRUE_THETA), bottom);
    ctx.stroke();
  }

  function drawBiasBars(ctx, data, box) {
    panel(ctx, box, "Bias and uncertainty", "mean estimate minus true effect");
    var keys = ["naive", "residualY", "sameSample", "crossFit", "oracle"];
    var left = box.x + 92;
    var right = box.x + box.w - 28;
    var top = box.y + 58;
    var bottom = box.y + box.h - 28;
    var maxAbs = keys.reduce(function (m, key) {
      return Math.max(m, Math.abs(data.summaries[key].bias) + data.summaries[key].sd);
    }, 0.08);
    maxAbs = Math.max(0.12, maxAbs);
    var zero = left + (right - left) / 2;
    var scale = (right - left) / (2 * maxAbs);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [-0.2, 0, 0.2].forEach(function (tick) {
      if (Math.abs(tick) > maxAbs) return;
      var x = zero + tick * scale;
      ctx.beginPath();
      ctx.moveTo(x, top - 6);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      label(ctx, tick === 0 ? "0" : formatSigned(tick, 1), x, bottom + 13, COLORS.muted, 9, 550, "center");
    });

    var rowH = (bottom - top) / keys.length;
    keys.forEach(function (key, i) {
      var y = top + rowH * (i + 0.5);
      var summary = data.summaries[key];
      var x = zero + summary.bias * scale;
      var sd = summary.sd * scale;
      label(ctx, methodLabel(key), box.x + 18, y, COLORS[key], 10, 730);
      ctx.strokeStyle = COLORS[key];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - sd, y);
      ctx.lineTo(x + sd, y);
      ctx.stroke();
      ctx.fillStyle = COLORS[key];
      ctx.beginPath();
      ctx.arc(x, y, key === data.params.highlight ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawCanvas(canvas, data) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 690;
    var height = compact ? 860 : 620;
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

    if (compact) {
      drawResidualScatter(ctx, data, { x: 8, y: 8, w: width - 16, h: 360 });
      drawHistogram(ctx, data, { x: 8, y: 382, w: width - 16, h: 265, fill: COLORS.panel });
      drawBiasBars(ctx, data, { x: 8, y: 662, w: width - 16, h: 190 });
    } else {
      drawResidualScatter(ctx, data, { x: 8, y: 8, w: Math.round(width * 0.58) - 14, h: height - 16 });
      drawHistogram(ctx, data, { x: Math.round(width * 0.58) + 4, y: 8, w: width - Math.round(width * 0.58) - 12, h: 342, fill: COLORS.panel });
      drawBiasBars(ctx, data, { x: Math.round(width * 0.58) + 4, y: 364, w: width - Math.round(width * 0.58) - 12, h: height - 372 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    updateControls(root, params);
    var data = simulate(params);
    renderMetrics(root, data);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, data);
  }

  function boot() {
    document.querySelectorAll("[data-dml-lab]").forEach(function (root) {
      var draw = function () {
        try {
          render(root);
        } catch (error) {
          var target = root.querySelector("[data-metrics]");
          if (target) target.innerHTML = metric("Lab error", error.message || String(error), "bad");
          throw error;
        }
      };
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", draw);
        input.addEventListener("change", draw);
      });
      draw();
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  global.DMLResidualLab = {
    cleanParams: cleanParams,
    simulate: simulate
  };
})(typeof window !== "undefined" ? window : globalThis);
