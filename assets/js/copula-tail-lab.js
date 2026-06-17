(function (root) {
  "use strict";

  var COLORS = {
    gaussian: "#2563eb",
    student: "#be123c",
    clayton: "#0f766e",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    tail: "rgba(190, 18, 60, 0.70)",
    faintTail: "rgba(190, 18, 60, 0.10)",
    point: "rgba(37, 99, 235, 0.42)"
  };

  var LABELS = {
    gaussian: "Gaussian",
    student: "t copula",
    clayton: "survival Clayton"
  };

  var DEFAULTS = {
    tau: 45,
    df: 3,
    samples: 4200,
    tail: 98,
    marginal: "skew",
    focus: "student",
    seed: 31
  };
  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var focus = raw.focus || DEFAULTS.focus;
    var marginal = raw.marginal || DEFAULTS.marginal;
    if (!LABELS[focus]) focus = DEFAULTS.focus;
    if (["normal", "skew", "credit"].indexOf(marginal) < 0) marginal = DEFAULTS.marginal;
    return {
      tau: snap(raw.tau, DEFAULTS.tau, 0, 80, 5) / 100,
      df: snap(raw.df, DEFAULTS.df, 2, 16, 1),
      samples: snap(raw.samples, DEFAULTS.samples, 800, 5200, 200),
      tail: snap(raw.tail, DEFAULTS.tail, 90, 99, 1) / 100,
      marginal: marginal,
      focus: focus,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1)
    };
  }

  function lcg(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function exponential(rand) {
    return -Math.log(Math.max(1e-12, 1 - rand()));
  }

  function gamma(rand, shape) {
    if (shape <= 0) return NaN;
    if (shape < 1) {
      return gamma(rand, shape + 1) * Math.pow(Math.max(1e-12, rand()), 1 / shape);
    }
    var d = shape - 1 / 3;
    var c = 1 / Math.sqrt(9 * d);
    for (var attempts = 0; attempts < 1000; attempts += 1) {
      var x = normal(rand);
      var v = 1 + c * x;
      if (v <= 0) continue;
      v = v * v * v;
      var u = rand();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(Math.max(1e-12, u)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
    return d;
  }

  function logGamma(z) {
    var coefficients = [
      676.5203681218851,
      -1259.1392167224028,
      771.3234287776531,
      -176.6150291621406,
      12.507343278686905,
      -0.13857109526572012,
      9.984369578019572e-6,
      1.5056327351493116e-7
    ];
    if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    z -= 1;
    var x = 0.9999999999998099;
    for (var i = 0; i < coefficients.length; i += 1) x += coefficients[i] / (z + i + 1);
    var t = z + coefficients.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function studentTPdf(x, df) {
    var logCoef = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
    return Math.exp(logCoef - ((df + 1) / 2) * Math.log(1 + x * x / df));
  }

  function studentTCdf(x, df) {
    if (!isFinite(x)) return x < 0 ? 0 : 1;
    if (x === 0) return 0.5;
    var sign = x < 0 ? -1 : 1;
    var upper = Math.abs(x);
    var slices = 240;
    var h = upper / slices;
    var sum = studentTPdf(0, df) + studentTPdf(upper, df);
    for (var i = 1; i < slices; i += 1) {
      sum += studentTPdf(i * h, df) * (i % 2 === 0 ? 2 : 4);
    }
    var area = sum * h / 3;
    return clamp(0.5 + sign * area, 0, 1);
  }

  // Peter J. Acklam's rational approximation, coefficients in the public domain.
  function invNorm(p) {
    p = clamp(p, 1e-12, 1 - 1e-12);
    var a = [
      -3.969683028665376e+01, 2.209460984245205e+02,
      -2.759285104469687e+02, 1.383577518672690e+02,
      -3.066479806614716e+01, 2.506628277459239e+00
    ];
    var b = [
      -5.447609879822406e+01, 1.615858368580409e+02,
      -1.556989798598866e+02, 6.680131188771972e+01,
      -1.328068155288572e+01
    ];
    var c = [
      -7.784894002430293e-03, -3.223964580411365e-01,
      -2.400758277161838e+00, -2.549732539343734e+00,
      4.374664141464968e+00, 2.938163982698783e+00
    ];
    var d = [
      7.784695709041462e-03, 3.224671290700398e-01,
      2.445134137142996e+00, 3.754408661907416e+00
    ];
    var plow = 0.02425;
    var phigh = 1 - plow;
    var q;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > phigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    var r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function marginalQuantile(u, type) {
    var z = invNorm(u);
    if (type === "normal") return z;
    if (type === "credit") {
      var tail = -Math.log(Math.max(1e-12, 1 - u));
      return 0.18 * z + 0.42 * Math.pow(Math.max(0, tail - 1.8), 1.35);
    }
    return 0.58 * z + 0.72 * Math.pow(Math.max(0, z - 0.85), 2) +
      0.16 * Math.pow(Math.max(0, z - 1.8), 3);
  }

  function rankUniforms(values) {
    var order = values.map(function (_, i) { return i; });
    order.sort(function (a, b) {
      if (values[a] === values[b]) return a - b;
      return values[a] < values[b] ? -1 : 1;
    });
    var out = new Array(values.length);
    for (var rank = 0; rank < order.length; rank += 1) out[order[rank]] = (rank + 0.5) / values.length;
    return out;
  }

  function rhoFromTau(tau) {
    return Math.sin(Math.PI * tau / 2);
  }

  function thetaFromTau(tau) {
    if (tau <= 0) return 0;
    return 2 * tau / Math.max(1e-9, 1 - tau);
  }

  function sampleElliptical(kind, params) {
    var n = params.samples;
    var tau = params.tau;
    var rho = rhoFromTau(tau);
    var scale = Math.sqrt(Math.max(0, 1 - rho * rho));
    var rand = lcg(params.seed * 1000003 + (kind === "student" ? 9176 : 173));
    var x = [];
    var y = [];
    for (var i = 0; i < n; i += 1) {
      var z1 = normal(rand);
      var z2 = rho * z1 + scale * normal(rand);
      if (kind === "student") {
        var chi = Math.max(1e-12, 2 * gamma(rand, params.df / 2));
        var mixer = Math.sqrt(params.df / chi);
        z1 *= mixer;
        z2 *= mixer;
      }
      x.push(z1);
      y.push(z2);
    }
    return { u: rankUniforms(x), v: rankUniforms(y) };
  }

  function sampleSurvivalClayton(params) {
    var n = params.samples;
    var theta = thetaFromTau(params.tau);
    var rand = lcg(params.seed * 1000003 + 424242);
    var x = [];
    var y = [];
    for (var i = 0; i < n; i += 1) {
      if (theta <= 1e-9) {
        x.push(rand());
        y.push(rand());
        continue;
      }
      var w = Math.max(1e-12, gamma(rand, 1 / theta));
      var e1 = exponential(rand);
      var e2 = exponential(rand);
      var lowerU = Math.pow(1 + e1 / w, -1 / theta);
      var lowerV = Math.pow(1 + e2 / w, -1 / theta);
      x.push(1 - lowerU);
      y.push(1 - lowerV);
    }
    return { u: rankUniforms(x), v: rankUniforms(y) };
  }

  function pearson(xs, ys) {
    var n = xs.length;
    var sx = 0;
    var sy = 0;
    for (var i = 0; i < n; i += 1) {
      sx += xs[i];
      sy += ys[i];
    }
    var mx = sx / n;
    var my = sy / n;
    var num = 0;
    var vx = 0;
    var vy = 0;
    for (var j = 0; j < n; j += 1) {
      var dx = xs[j] - mx;
      var dy = ys[j] - my;
      num += dx * dy;
      vx += dx * dx;
      vy += dy * dy;
    }
    return num / Math.sqrt(Math.max(1e-18, vx * vy));
  }

  function quantileSorted(sorted, q) {
    var pos = clamp(q, 0, 1) * (sorted.length - 1);
    var lo = Math.floor(pos);
    var hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function expectedShortfall(sorted, q) {
    var start = clamp(Math.ceil(q * sorted.length) - 1, 0, sorted.length - 1);
    var sum = 0;
    var count = 0;
    for (var i = start; i < sorted.length; i += 1) {
      sum += sorted[i];
      count += 1;
    }
    return sum / Math.max(1, count);
  }

  function tailConditional(points, q) {
    var oneHigh = 0;
    var bothHigh = 0;
    for (var i = 0; i < points.length; i += 1) {
      if (points[i].u > q) {
        oneHigh += 1;
        if (points[i].v > q) bothHigh += 1;
      }
    }
    return oneHigh ? bothHigh / oneHigh : 0;
  }

  function theoreticalLambda(kind, params) {
    if (kind === "gaussian") return 0;
    if (kind === "clayton") {
      if (params.tau <= 0) return 0;
      return Math.pow(2, -1 / thetaFromTau(params.tau));
    }
    var rho = rhoFromTau(params.tau);
    var arg = -Math.sqrt((params.df + 1) * (1 - rho) / Math.max(1e-9, 1 + rho));
    return 2 * studentTCdf(arg, params.df + 1);
  }

  function buildSeries(kind, params) {
    var copula = kind === "clayton" ? sampleSurvivalClayton(params) : sampleElliptical(kind, params);
    var points = [];
    var xLoss = [];
    var yLoss = [];
    var portfolio = [];
    for (var i = 0; i < params.samples; i += 1) {
      var x = marginalQuantile(copula.u[i], params.marginal);
      var y = marginalQuantile(copula.v[i], params.marginal);
      var p = 0.5 * (x + y);
      xLoss.push(x);
      yLoss.push(y);
      portfolio.push(p);
      points.push({ u: copula.u[i], v: copula.v[i], x: x, y: y, p: p });
    }
    var sorted = portfolio.slice().sort(function (a, b) { return a - b; });
    var curve = [];
    for (var q = 0.80; q <= 0.9901; q += 0.01) curve.push({ q: q, conditional: tailConditional(points, q) });
    return {
      kind: kind,
      label: LABELS[kind],
      color: COLORS[kind === "student" ? "student" : kind],
      points: points,
      curve: curve,
      spearman: pearson(copula.u, copula.v),
      lossCorrelation: pearson(xLoss, yLoss),
      tailConditional: tailConditional(points, params.tail),
      jointTail: points.filter(function (d) { return d.u > params.tail && d.v > params.tail; }).length / points.length,
      varTail: quantileSorted(sorted, params.tail),
      esTail: expectedShortfall(sorted, params.tail),
      medianPortfolio: quantileSorted(sorted, 0.5),
      lambda: theoreticalLambda(kind, params)
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var series = {
      gaussian: buildSeries("gaussian", params),
      student: buildSeries("student", params),
      clayton: buildSeries("clayton", params)
    };
    var order = ["gaussian", "student", "clayton"];
    var worst = order.reduce(function (best, key) {
      return series[key].esTail > series[best].esTail ? key : best;
    }, order[0]);
    return { params: params, series: series, order: order, worst: worst };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function close(a, b, tolerance) {
    return Math.abs(a - b) <= tolerance;
  }

  function isProbability(value) {
    return Number.isFinite(value) && value >= 0 && value <= 1;
  }

  function sortedLosses(series, key) {
    return series.points.map(function (point) { return point[key]; }).sort(function (a, b) { return a - b; });
  }

  function sameSorted(a, b, tolerance) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      if (!close(a[i], b[i], tolerance)) return false;
    }
    return true;
  }

  function highCount(points, q) {
    return points.reduce(function (count, point) {
      return count + (point.u > q ? 1 : 0);
    }, 0);
  }

  function seriesIsFinite(series) {
    return isProbability(series.spearman * 0.5 + 0.5) &&
      isProbability(series.lossCorrelation * 0.5 + 0.5) &&
      isProbability(series.tailConditional) &&
      isProbability(series.jointTail) &&
      isProbability(series.lambda) &&
      Number.isFinite(series.varTail) &&
      Number.isFinite(series.esTail) &&
      series.esTail >= series.varTail - 1e-12 &&
      series.points.length > 0 &&
      series.curve.length === 20 &&
      series.curve.every(function (row) {
        return row.q >= 0.80 && row.q <= 0.991 && isProbability(row.conditional);
      });
  }

  function runAudit() {
    var passed = 0;
    var checked = 0;
    var failures = [];
    var defaults = cleanParams(DEFAULTS);
    var result = evaluate(DEFAULTS);
    var gaussian = result.series.gaussian;
    var student = result.series.student;
    var clayton = result.series.clayton;
    var gridCases = 0;

    function check(name, condition, details) {
      checked += 1;
      if (condition) {
        passed += 1;
      } else {
        failures.push({ name: name, details: details || null });
      }
    }

    function checkClose(name, actual, expected, tolerance) {
      check(name, close(actual, expected, tolerance), {
        actual: actual,
        expected: expected,
        tolerance: tolerance
      });
    }

    function checkProbability(name, value) {
      check(name, isProbability(value), { value: value });
    }

    function sameMargins(a, b) {
      return sameSorted(sortedLosses(a, "x"), sortedLosses(b, "x"), 1e-12) &&
        sameSorted(sortedLosses(a, "y"), sortedLosses(b, "y"), 1e-12);
    }

    function tailCount(points, q) {
      return points.reduce(function (count, point) {
        return count + (point.u > q && point.v > q ? 1 : 0);
      }, 0);
    }

    function checkSeries(name, series, params) {
      check(name + " reports finite summary statistics", seriesIsFinite(series));
      check(name + " point count matches sanitized samples", series.points.length === params.samples);
      check(name + " curve has 20 threshold rows", series.curve.length === 20);
      checkClose(name + " first curve threshold is 80%", series.curve[0].q, 0.80, 1e-12);
      checkClose(name + " last curve threshold is 99%", series.curve[series.curve.length - 1].q, 0.99, 1e-12);
      checkClose(name + " selected tail conditional recomputes", series.tailConditional, tailConditional(series.points, params.tail), 1e-15);
      checkClose(name + " joint tail recomputes from points", series.jointTail, tailCount(series.points, params.tail) / params.samples, 1e-15);
      var oneHigh = highCount(series.points, params.tail);
      check(name + " one-name tail count follows rank grid", oneHigh === Math.round((1 - params.tail) * params.samples), {
        actual: oneHigh,
        expected: Math.round((1 - params.tail) * params.samples)
      });
      checkClose(name + " joint tail equals conditional times tail mass", series.jointTail, series.tailConditional * oneHigh / params.samples, 1e-15);
      checkClose(name + " lambda recomputes from formula", series.lambda, theoreticalLambda(series.kind, params), 1e-15);
      checkProbability(name + " Spearman correlation is bounded after rescale", series.spearman * 0.5 + 0.5);
      checkProbability(name + " loss correlation is bounded after rescale", series.lossCorrelation * 0.5 + 0.5);
      checkProbability(name + " finite-threshold co-tail is a probability", series.tailConditional);
      checkProbability(name + " asymptotic lambda is a probability", series.lambda);
      check(name + " ES is at least VaR", series.esTail >= series.varTail - 1e-12);
      check(name + " median sits below tail VaR", series.medianPortfolio <= series.varTail + 1e-12);
      series.curve.forEach(function (row, i) {
        checkClose(name + " curve row " + i + " conditional recomputes", row.conditional, tailConditional(series.points, row.q), 1e-15);
        checkProbability(name + " curve row " + i + " conditional is probability", row.conditional);
      });
    }

    var dirty = cleanParams({ tau: 83, df: 19.8, samples: 777, tail: 88, seed: -5, focus: "bad", marginal: "bad" });
    check("sanitation clamps tau to slider max", dirty.tau === 0.80);
    check("sanitation clamps degrees of freedom to slider max", dirty.df === 16);
    check("sanitation snaps samples to slider floor", dirty.samples === 800);
    check("sanitation clamps tail threshold to slider floor", dirty.tail === 0.90);
    check("sanitation clamps seed to slider floor", dirty.seed === 1);
    check("sanitation falls back to default focus", dirty.focus === DEFAULTS.focus);
    check("sanitation falls back to default marginal", dirty.marginal === DEFAULTS.marginal);
    check("rank uniforms are the midpoint grid", (function () {
      var ranks = rankUniforms([30, 10, 20, 40]).slice().sort(function (a, b) { return a - b; });
      return sameSorted(ranks, [0.125, 0.375, 0.625, 0.875], 1e-15);
    })());
    checkClose("normal quantile is centered", invNorm(0.5), 0, 1e-12);
    [0.001, 0.01, 0.025, 0.1, 0.25, 0.75, 0.9, 0.975, 0.99, 0.999].forEach(function (p, i, rows) {
      check("normal quantile is finite at p=" + p, Number.isFinite(invNorm(p)));
      if (p < 0.5) checkClose("normal quantile is symmetric at p=" + p, invNorm(p), -invNorm(1 - p), 1e-8);
      if (i > 0) check("normal quantile is monotone at p=" + p, invNorm(p) > invNorm(rows[i - 1]));
    });
    [2, 3, 5, 16].forEach(function (df) {
      checkClose("student t cdf is centered for df " + df, studentTCdf(0, df), 0.5, 1e-12);
      [0.4, 1.4, 2.2].forEach(function (x) {
        checkClose("student t cdf is symmetric for df " + df + " x " + x, studentTCdf(x, df), 1 - studentTCdf(-x, df), 2e-4);
      });
    });
    [0, 0.25, 0.5, 0.8].forEach(function (tau) {
      var rho = rhoFromTau(tau);
      checkProbability("tau-to-rho stays inside correlation range for tau " + tau, rho * 0.5 + 0.5);
      checkClose("elliptical Kendall tau round trip " + tau, 2 * Math.asin(rho) / Math.PI, tau, 1e-12);
      var theta = thetaFromTau(tau);
      if (tau === 0) checkClose("Clayton theta is zero at zero tau", theta, 0, 1e-12);
      else checkClose("Clayton Kendall tau round trip " + tau, theta / (theta + 2), tau, 1e-12);
    });
    check("Kendall tau maps to Clayton theta", (function () {
      var theta = thetaFromTau(0.45);
      return close(theta / (theta + 2), 0.45, 1e-12);
    })());
    check("theoretical tail coefficients are probabilities", result.order.every(function (key) {
      return isProbability(result.series[key].lambda);
    }));
    check("Gaussian has zero asymptotic tail dependence", theoreticalLambda("gaussian", defaults) === 0);
    check("t tail dependence falls as degrees of freedom rise", theoreticalLambda("student", Object.assign({}, defaults, { df: 3 })) >
      theoreticalLambda("student", Object.assign({}, defaults, { df: 16 })));
    check("survival Clayton tail dependence rises with tau", theoreticalLambda("clayton", Object.assign({}, defaults, { tau: 0.20 })) <
      theoreticalLambda("clayton", Object.assign({}, defaults, { tau: 0.70 })));
    [0, 0.25, 0.45, 0.65, 0.80].forEach(function (tau) {
      var previousT = null;
      [2, 3, 6, 16].forEach(function (df) {
        var value = theoreticalLambda("student", Object.assign({}, defaults, { tau: tau, df: df }));
        checkProbability("t lambda probability tau " + tau + " df " + df, value);
        if (previousT != null) check("t lambda weakly falls with df tau " + tau + " df " + df, value <= previousT + 1e-12);
        previousT = value;
      });
      checkProbability("Clayton lambda probability tau " + tau, theoreticalLambda("clayton", Object.assign({}, defaults, { tau: tau })));
    });
    check("default result order and worst ES match the post", result.order.join("|") === "gaussian|student|clayton" && result.worst === "clayton");
    checkClose("default Gaussian co-tail fact matches the post", gaussian.tailConditional, 0.2857142857142857, 1e-15);
    checkClose("default t co-tail fact matches the post", student.tailConditional, 0.36904761904761907, 1e-15);
    checkClose("default Clayton co-tail fact matches the post", clayton.tailConditional, 0.6071428571428571, 1e-15);
    checkClose("default Gaussian ES fact matches the post", gaussian.esTail, 2.8918724923654233, 1e-12);
    checkClose("default t ES fact matches the post", student.esTail, 2.942234308464295, 1e-12);
    checkClose("default Clayton ES fact matches the post", clayton.esTail, 3.1870519729096882, 1e-12);
    check("copulas share the same marginal loss grid", sameMargins(gaussian, student) && sameMargins(gaussian, clayton));
    result.order.forEach(function (key) {
      checkSeries("default " + key, result.series[key], result.params);
    });
    check("focus changes presentation but not the dependence runs", (function () {
      var other = evaluate(Object.assign({}, DEFAULTS, { focus: "gaussian" }));
      return close(other.series.clayton.tailConditional, clayton.tailConditional, 1e-15) &&
        close(other.series.student.esTail, student.esTail, 1e-12);
    })());
    check("zero tau keeps t common-shock tail dependence visible", (function () {
      var zeroTau = evaluate(Object.assign({}, DEFAULTS, { tau: 0, samples: 5200, tail: 95 }));
      return Math.abs(zeroTau.series.gaussian.tailConditional - 0.05) < 0.03 &&
        Math.abs(zeroTau.series.clayton.tailConditional - 0.05) < 0.03 &&
        zeroTau.series.student.tailConditional > 0.10 &&
        zeroTau.series.student.lambda > 0;
    })());
    check("same copula with different marginals keeps rank co-tail", (function () {
      var normalResult = evaluate(Object.assign({}, DEFAULTS, { marginal: "normal" }));
      return result.order.every(function (key) {
        return close(result.series[key].tailConditional, normalResult.series[key].tailConditional, 1e-15);
      });
    })());
    check("different marginals actually move the loss scale", (function () {
      var normalResult = evaluate(Object.assign({}, DEFAULTS, { marginal: "normal" }));
      return !sameMargins(result.series.gaussian, normalResult.series.gaussian);
    })());

    [3, 31, 211].forEach(function (seed) {
      [0, 0.35, 0.65].forEach(function (tau) {
        [2, 6, 16].forEach(function (df) {
          ["normal", "skew", "credit"].forEach(function (marginal) {
            [90, 95, 99].forEach(function (tail) {
              var tested = evaluate({ seed: seed, tau: tau * 100, df: df, marginal: marginal, samples: 800, tail: tail });
              gridCases += 1;
              check("grid " + gridCases + " sanitized samples", tested.params.samples === 800);
              check("grid " + gridCases + " sanitized tau", close(tested.params.tau, tau, 1e-12));
              check("grid " + gridCases + " all copulas share marginal grids", sameMargins(tested.series.gaussian, tested.series.student) &&
                sameMargins(tested.series.gaussian, tested.series.clayton));
              tested.order.forEach(function (key) {
                checkSeries("grid " + gridCases + " " + key, tested.series[key], tested.params);
              });
            });
          });
        });
      });
    });
    check("243-case copula grid completed", gridCases === 243, { cases: gridCases });

    return {
      ok: passed,
      cases: checked,
      passed: passed,
      checked: checked,
      gridCases: gridCases,
      failures: failures,
      defaultFacts: {
        gaussianCoTail: gaussian.tailConditional,
        studentCoTail: student.tailConditional,
        claytonCoTail: clayton.tailConditional,
        gaussianES: gaussian.esTail,
        studentES: student.esTail,
        claytonES: clayton.esTail,
        tLambda: student.lambda,
        claytonLambda: clayton.lambda
      }
    };
  }

  function formatPercent(x, digits) {
    return (100 * x).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(x) {
    if (!isFinite(x)) return "n/a";
    if (Math.abs(x) >= 10) return x.toFixed(1);
    if (Math.abs(x) >= 1) return x.toFixed(2);
    return x.toFixed(3);
  }

  function metric(label, value) {
    return '<div class="copula-tail-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width));
    var height = width < 620 ? 1180 : 760;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 750);
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 43, COLORS.muted, 11, 600);
  }

  function plotBox(box, topPad, rightPad, bottomPad, leftPad) {
    return {
      x: box.x + leftPad,
      y: box.y + topPad,
      w: box.w - leftPad - rightPad,
      h: box.h - topPad - bottomPad
    };
  }

  function drawAxes(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.stroke();
    ctx.strokeStyle = COLORS.grid;
    for (var i = 1; i < 4; i += 1) {
      var x = plot.x + plot.w * i / 4;
      var y = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawScatter(ctx, box, result) {
    var focus = result.series[result.params.focus];
    panel(ctx, box, "Copula sample", LABELS[result.params.focus] + ", identical marginal ranks");
    var plot = plotBox(box, 62, 22, 40, 46);
    drawAxes(ctx, plot);
    var q = result.params.tail;
    ctx.fillStyle = COLORS.faintTail;
    ctx.fillRect(plot.x + q * plot.w, plot.y, (1 - q) * plot.w, (1 - q) * plot.h);
    ctx.strokeStyle = COLORS.tail;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x + q * plot.w, plot.y);
    ctx.lineTo(plot.x + q * plot.w, plot.y + plot.h);
    ctx.moveTo(plot.x, plot.y + (1 - q) * plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + (1 - q) * plot.h);
    ctx.stroke();
    ctx.setLineDash([]);

    var maxPoints = plot.w < 380 ? 620 : 900;
    var step = Math.max(1, Math.ceil(focus.points.length / maxPoints));
    for (var i = 0; i < focus.points.length; i += step) {
      var p = focus.points[i];
      ctx.fillStyle = p.u > q && p.v > q ? COLORS.tail : focus.color.replace(")", ", 0.45)").replace("rgb", "rgba");
      ctx.beginPath();
      ctx.arc(plot.x + p.u * plot.w, plot.y + (1 - p.v) * plot.h, p.u > q && p.v > q ? 2.2 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    drawText(ctx, "U1 loss rank", plot.x + plot.w / 2, box.y + box.h - 12, COLORS.muted, 11, 650, "center");
    drawText(ctx, "U2", plot.x - 28, plot.y + 12, COLORS.muted, 11, 650);
    drawText(ctx, "top " + formatPercent(1 - q, 0) + " corner", plot.x + q * plot.w - 94, plot.y + 16, COLORS.tail, 11, 750);
  }

  function drawTailCurve(ctx, box, result) {
    panel(ctx, box, "Co-exceedance", "P(second name is high | first name is high)");
    var plot = plotBox(box, 62, 24, 42, 50);
    drawAxes(ctx, plot);
    var maxY = 0.08;
    result.order.forEach(function (key) {
      result.series[key].curve.forEach(function (p) { maxY = Math.max(maxY, p.conditional); });
    });
    maxY *= 1.12;
    function xScale(q) { return plot.x + (q - 0.80) / 0.19 * plot.w; }
    function yScale(v) { return plot.y + plot.h - clamp(v / maxY, 0, 1) * plot.h; }

    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    for (var q = 0.80; q <= 0.9901; q += 0.01) {
      var x = xScale(q);
      var y = yScale(1 - q);
      if (q === 0.80) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    result.order.forEach(function (key) {
      var s = result.series[key];
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      s.curve.forEach(function (p, i) {
        var x = xScale(p.q);
        var y = yScale(p.conditional);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    drawText(ctx, "80%", plot.x, box.y + box.h - 16, COLORS.muted, 10, 650);
    drawText(ctx, "99%", plot.x + plot.w, box.y + box.h - 16, COLORS.muted, 10, 650, "right");
    drawText(ctx, "tail threshold q", plot.x + plot.w / 2, box.y + box.h - 16, COLORS.muted, 10, 650, "center");
    drawText(ctx, "independent reference", plot.x + 8, yScale(0.13), "#64748b", 10, 650);

    result.order.forEach(function (key, i) {
      var s = result.series[key];
      var lx = plot.x + 8 + i * Math.min(132, plot.w / 3);
      var ly = plot.y + 15;
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly - 9, 10, 3);
      drawText(ctx, s.label, lx + 15, ly - 5, COLORS.muted, 10, 700);
    });
  }

  function drawBars(ctx, box, result) {
    panel(ctx, box, "Portfolio tail loss", "equal-weighted two-name portfolio");
    var plot = plotBox(box, 62, 22, 46, 54);
    var maxValue = 0;
    result.order.forEach(function (key) {
      maxValue = Math.max(maxValue, result.series[key].esTail, result.series[key].varTail);
    });
    maxValue = Math.max(maxValue * 1.15, 0.1);
    drawAxes(ctx, plot);
    var groupW = plot.w / result.order.length;
    result.order.forEach(function (key, i) {
      var s = result.series[key];
      var center = plot.x + groupW * (i + 0.5);
      var barW = Math.max(14, Math.min(24, groupW * 0.18));
      var varH = clamp(s.varTail / maxValue, 0, 1) * plot.h;
      var esH = clamp(s.esTail / maxValue, 0, 1) * plot.h;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(center - barW - 2, plot.y + plot.h - varH, barW, varH);
      ctx.globalAlpha = 1;
      ctx.fillRect(center + 2, plot.y + plot.h - esH, barW, esH);
      drawText(ctx, s.label, center, box.y + box.h - 18, COLORS.muted, 10, 700, "center");
    });
    drawText(ctx, "VaR", plot.x + plot.w - 54, plot.y + 18, COLORS.muted, 10, 700);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = COLORS.gaussian;
    ctx.fillRect(plot.x + plot.w - 78, plot.y + 10, 14, 10);
    ctx.globalAlpha = 1;
    drawText(ctx, "ES", plot.x + plot.w - 54, plot.y + 34, COLORS.muted, 10, 700);
    ctx.fillStyle = COLORS.gaussian;
    ctx.fillRect(plot.x + plot.w - 78, plot.y + 26, 14, 10);
    drawText(ctx, "tail = " + formatPercent(result.params.tail, 0), plot.x + 2, plot.y - 8, COLORS.muted, 10, 700);
  }

  function drawTable(ctx, box, result) {
    panel(ctx, box, "Same broad association, different corner", "model tau is fixed by construction");
    var x = box.x + 16;
    var y = box.y + 68;
    var cols = [
      { label: "copula", w: 112 },
      { label: "Spearman", w: 82 },
      { label: "loss rho", w: 72 },
      { label: "lambda_U", w: 72 },
      { label: "ES", w: 62 }
    ];
    var cx = x;
    cols.forEach(function (col) {
      drawText(ctx, col.label, cx, y, COLORS.muted, 10, 750);
      cx += col.w;
    });
    y += 20;
    result.order.forEach(function (key) {
      var s = result.series[key];
      cx = x;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(cx + 5, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      drawText(ctx, s.label, cx + 14, y, COLORS.text, 11, 750);
      cx += cols[0].w;
      drawText(ctx, s.spearman.toFixed(2), cx, y, COLORS.text, 11, 650);
      cx += cols[1].w;
      drawText(ctx, s.lossCorrelation.toFixed(2), cx, y, COLORS.text, 11, 650);
      cx += cols[2].w;
      drawText(ctx, formatPercent(s.lambda, 0), cx, y, COLORS.text, 11, 650);
      cx += cols[3].w;
      drawText(ctx, formatNumber(s.esTail), cx, y, COLORS.text, 11, 650);
      y += 28;
    });
    var copy = [
      "The margins are the same rank grid in every row.",
      "Only the dependence map changes."
    ];
    copy.forEach(function (line, i) {
      drawText(ctx, line, box.x + 16, box.y + box.h - 48 + i * 18, COLORS.muted, 11, 600);
    });
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var mobile = width < 620;
    if (mobile) {
      var gap = 16;
      var boxH = 278;
      drawScatter(ctx, { x: 12, y: 12, w: width - 24, h: boxH }, result);
      drawTailCurve(ctx, { x: 12, y: 12 + boxH + gap, w: width - 24, h: boxH }, result);
      drawBars(ctx, { x: 12, y: 12 + 2 * (boxH + gap), w: width - 24, h: boxH }, result);
      drawTable(ctx, { x: 12, y: 12 + 3 * (boxH + gap), w: width - 24, h: boxH }, result);
      return;
    }
    var margin = 18;
    var gapX = 18;
    var gapY = 18;
    var boxW = (width - 2 * margin - gapX) / 2;
    var boxH2 = (setup.height - 2 * margin - gapY) / 2;
    drawScatter(ctx, { x: margin, y: margin, w: boxW, h: boxH2 }, result);
    drawTailCurve(ctx, { x: margin + boxW + gapX, y: margin, w: boxW, h: boxH2 }, result);
    drawBars(ctx, { x: margin, y: margin + boxH2 + gapY, w: boxW, h: boxH2 }, result);
    drawTable(ctx, { x: margin + boxW + gapX, y: margin + boxH2 + gapY, w: boxW, h: boxH2 }, result);
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(container, params) {
    var values = {
      tau: formatPercent(params.tau, 0),
      df: params.df.toFixed(0),
      samples: params.samples.toLocaleString(),
      tail: formatPercent(params.tail, 0),
      seed: params.seed.toFixed(0)
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function render(container) {
    var result = evaluate(readParams(container));
    updateOutputs(container, result.params);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      var audit = cachedAudit();
      metrics.innerHTML = [
        metric("model Kendall tau", formatPercent(result.params.tau, 0)),
        metric("Gaussian co-tail", formatPercent(result.series.gaussian.tailConditional, 1)),
        metric("t co-tail", formatPercent(result.series.student.tailConditional, 1)),
        metric("Clayton co-tail", formatPercent(result.series.clayton.tailConditional, 1)),
        metric("largest ES", LABELS[result.worst]),
        metric("Audit", audit.passed + "/" + audit.checked)
      ].join("");
    }
    var canvas = container.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function mount(container) {
    var redraw = function () { render(container); };
    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    render(container);
    if (root.ResizeObserver) {
      var observer = new root.ResizeObserver(function () { render(container); });
      observer.observe(container);
    }
  }

  function init() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-copula-tail-lab]").forEach(mount);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    invNorm: invNorm,
    marginalQuantile: marginalQuantile,
    rankUniforms: rankUniforms,
    runAudit: runAudit,
    theoreticalLambda: theoreticalLambda
  };
  root.CopulaTailLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : this);
