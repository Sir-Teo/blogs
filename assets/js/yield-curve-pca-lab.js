(function (global) {
  "use strict";

  var COLORS = {
    approx: "#7c3aed",
    base: "#0f766e",
    curve: "#f59e0b",
    grid: "#e6edf3",
    muted: "#5d6872",
    panel: "#f8fafc",
    pc1: "#2563eb",
    pc2: "#be123c",
    pc3: "#0f766e",
    pnl: "#be123c",
    rule: "#d7dee5",
    shocked: "#2563eb",
    text: "#172026",
    white: "#ffffff"
  };

  var MATURITIES = [0.5, 1, 2, 3, 5, 7, 10, 20, 30];

  var DEFAULTS = {
    curvature: 8,
    days: 650,
    level: 25,
    noise: 1,
    regime: "normal",
    seed: 47,
    slope: -10
  };

  var REGIMES = {
    inflation: "inflation scare",
    normal: "ordinary cycle",
    policy: "policy whiplash"
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
      curvature: Math.round(clamp(finite(Number(raw.curvature), DEFAULTS.curvature), -40, 40)),
      days: Math.round(clamp(finite(Number(raw.days), DEFAULTS.days), 220, 1200) / 10) * 10,
      level: Math.round(clamp(finite(Number(raw.level), DEFAULTS.level), -60, 80)),
      noise: Math.round(clamp(finite(Number(raw.noise), DEFAULTS.noise), 0, 18)),
      regime: REGIMES[raw.regime] ? raw.regime : DEFAULTS.regime,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      slope: Math.round(clamp(finite(Number(raw.slope), DEFAULTS.slope), -70, 70))
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

  function norm(v) {
    return Math.sqrt(Math.max(0, dot(v, v)));
  }

  function normalize(v) {
    var n = Math.max(1e-12, norm(v));
    return v.map(function (x) { return x / n; });
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
  }

  function nsBasis(maturity, tau) {
    var x = Math.max(1e-6, maturity / tau);
    var slope = (1 - Math.exp(-x)) / x;
    var curve = slope - Math.exp(-x);
    return { curve: curve, level: 1, slope: slope };
  }

  function factorBasis() {
    var tau = 3.2;
    var level = MATURITIES.map(function () { return 1; });
    var slope = MATURITIES.map(function (m) { return nsBasis(m, tau).slope - 0.36; });
    var curve = MATURITIES.map(function (m) { return nsBasis(m, tau).curve; });
    return {
      curvature: normalize(curve),
      level: normalize(level),
      rawCurvature: curve,
      rawLevel: level,
      rawSlope: slope,
      slope: normalize(slope)
    };
  }

  function baseYield(maturity, regime) {
    var b0 = 3.45;
    var b1 = -1.25;
    var b2 = 1.55;
    var tau = 4.4;
    if (regime === "inflation") {
      b0 = 4.55;
      b1 = -0.35;
      b2 = 0.55;
      tau = 5.8;
    } else if (regime === "policy") {
      b0 = 3.2;
      b1 = 1.35;
      b2 = -0.95;
      tau = 2.7;
    }
    var b = nsBasis(maturity, tau);
    return b0 + b1 * b.slope + b2 * b.curve;
  }

  function regimeVols(regime) {
    if (regime === "inflation") return { curve: 4.2, level: 7.2, slope: 3.4 };
    if (regime === "policy") return { curve: 5.8, level: 4.8, slope: 8.0 };
    return { curve: 4.8, level: 5.8, slope: 4.6 };
  }

  function generateChanges(params) {
    var rng = makeRng(params.seed * 7919 + params.days);
    var b = factorBasis();
    var vols = regimeVols(params.regime);
    var rows = [];
    var lastLevel = 0;
    var lastSlope = 0;
    for (var d = 0; d < params.days; d += 1) {
      var z1 = normal(rng);
      var z2 = 0.38 * z1 + Math.sqrt(1 - 0.38 * 0.38) * normal(rng);
      var z3 = -0.22 * z2 + Math.sqrt(1 - 0.22 * 0.22) * normal(rng);
      lastLevel = 0.18 * lastLevel + vols.level * z1;
      lastSlope = 0.12 * lastSlope + vols.slope * z2;
      var curveShock = vols.curve * z3;
      var row = [];
      for (var i = 0; i < MATURITIES.length; i += 1) {
        row.push(
          lastLevel * b.level[i] +
          lastSlope * b.slope[i] +
          curveShock * b.curvature[i] +
          params.noise * normal(rng)
        );
      }
      rows.push(row);
    }
    return rows;
  }

  function covariance(rows) {
    var n = rows.length;
    var dim = rows[0].length;
    var means = [];
    for (var j = 0; j < dim; j += 1) means[j] = mean(rows.map(function (row) { return row[j]; }));
    var cov = [];
    for (var i = 0; i < dim; i += 1) {
      cov[i] = [];
      for (j = 0; j < dim; j += 1) cov[i][j] = 0;
    }
    rows.forEach(function (row) {
      for (var a = 0; a < dim; a += 1) {
        var da = row[a] - means[a];
        for (var b = 0; b <= a; b += 1) {
          cov[a][b] += da * (row[b] - means[b]) / Math.max(1, n - 1);
        }
      }
    });
    for (i = 0; i < dim; i += 1) {
      for (j = i + 1; j < dim; j += 1) cov[i][j] = cov[j][i];
    }
    return cov;
  }

  function jacobiEigen(input) {
    var n = input.length;
    var a = input.map(function (row) { return row.slice(); });
    var v = [];
    for (var i = 0; i < n; i += 1) {
      v[i] = [];
      for (var j = 0; j < n; j += 1) v[i][j] = i === j ? 1 : 0;
    }
    for (var sweep = 0; sweep < 160; sweep += 1) {
      var p = 0;
      var q = 1;
      var max = 0;
      for (i = 0; i < n; i += 1) {
        for (j = i + 1; j < n; j += 1) {
          var value = Math.abs(a[i][j]);
          if (value > max) {
            max = value;
            p = i;
            q = j;
          }
        }
      }
      if (max < 1e-9) break;
      var app = a[p][p];
      var aqq = a[q][q];
      var apq = a[p][q];
      var tau = (aqq - app) / (2 * apq);
      var t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      var c = 1 / Math.sqrt(1 + t * t);
      var s = t * c;
      for (var k = 0; k < n; k += 1) {
        if (k !== p && k !== q) {
          var akp = a[k][p];
          var akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[p][k] = a[k][p];
          a[k][q] = s * akp + c * akq;
          a[q][k] = a[k][q];
        }
      }
      a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
      a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
      a[p][q] = 0;
      a[q][p] = 0;
      for (k = 0; k < n; k += 1) {
        var vkp = v[k][p];
        var vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
    var pairs = [];
    for (i = 0; i < n; i += 1) {
      var vector = [];
      for (j = 0; j < n; j += 1) vector.push(v[j][i]);
      pairs.push({ value: Math.max(0, a[i][i]), vector: vector });
    }
    pairs.sort(function (x, y) { return y.value - x.value; });
    return pairs;
  }

  function orientPcs(pairs) {
    var oriented = pairs.map(function (pair) {
      return { value: pair.value, vector: pair.vector.slice() };
    });
    if (oriented[0].vector.reduce(function (s, x) { return s + x; }, 0) < 0) {
      oriented[0].vector = oriented[0].vector.map(function (x) { return -x; });
    }
    if (oriented[1].vector[0] < oriented[1].vector[oriented[1].vector.length - 1]) {
      oriented[1].vector = oriented[1].vector.map(function (x) { return -x; });
    }
    var mid = oriented[2].vector[4];
    var ends = 0.5 * (oriented[2].vector[0] + oriented[2].vector[oriented[2].vector.length - 1]);
    if (mid < ends) oriented[2].vector = oriented[2].vector.map(function (x) { return -x; });
    return oriented;
  }

  function shockBp(params) {
    var b = factorBasis();
    var out = [];
    for (var i = 0; i < MATURITIES.length; i += 1) {
      out.push(params.level * b.level[i] + params.slope * b.slope[i] + params.curvature * b.curvature[i]);
    }
    return out;
  }

  function priceZero(maturity, yieldPct) {
    return Math.exp(-(yieldPct / 100) * maturity);
  }

  function priceImpact(baseYields, shockedYields) {
    return MATURITIES.map(function (m, i) {
      var dy = (shockedYields[i] - baseYields[i]) / 100;
      var exact = (priceZero(m, shockedYields[i]) / priceZero(m, baseYields[i]) - 1) * 100;
      var duration = -m * dy * 100;
      var convexity = (-m * dy + 0.5 * m * m * dy * dy) * 100;
      return { convexity: convexity, duration: duration, exact: exact, maturity: m };
    });
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var rows = generateChanges(params);
    var cov = covariance(rows);
    var eigen = orientPcs(jacobiEigen(cov));
    var total = eigen.reduce(function (sum, pair) { return sum + pair.value; }, 0);
    var explained = eigen.map(function (pair) { return pair.value / Math.max(1e-12, total); });
    var baseYields = MATURITIES.map(function (m) { return baseYield(m, params.regime); });
    var shocks = shockBp(params);
    var shockedYields = baseYields.map(function (y, i) { return y + shocks[i] / 100; });
    var impacts = priceImpact(baseYields, shockedYields);
    return {
      baseYields: baseYields,
      changes: rows,
      covariance: cov,
      eigen: eigen,
      explained: explained,
      impacts: impacts,
      params: params,
      shocks: shocks,
      shockedYields: shockedYields,
      top3: explained[0] + explained[1] + explained[2]
    };
  }

  function audit() {
    var checked = 0;

    function assert(condition, message) {
      checked += 1;
      if (!condition) throw new Error(message);
    }

    function close(actual, expected, tolerance) {
      return Math.abs(actual - expected) <= tolerance;
    }

    function closeRelative(actual, expected, tolerance) {
      return Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * tolerance;
    }

    function assertBetween(value, low, high, message) {
      assert(value >= low && value <= high, message + ": " + value);
    }

    function vectorDot(a, b) {
      var sum = 0;
      for (var i = 0; i < a.length; i += 1) sum += a[i] * b[i];
      return sum;
    }

    function assertPriceMath(name, result) {
      result.impacts.forEach(function (impact, index) {
        var dy = (result.shockedYields[index] - result.baseYields[index]) / 100;
        var expectedExact = (Math.exp(-impact.maturity * dy) - 1) * 100;
        var expectedDuration = -impact.maturity * dy * 100;
        var expectedConvexity = (-impact.maturity * dy + 0.5 * impact.maturity * impact.maturity * dy * dy) * 100;
        assert(close(impact.exact, expectedExact, 1e-12), name + " exact zero-coupon return");
        assert(close(impact.duration, expectedDuration, 1e-12), name + " duration approximation");
        assert(close(impact.convexity, expectedConvexity, 1e-12), name + " convexity approximation");
      });
    }

    function assertShape(name, result) {
      var n = MATURITIES.length;
      assert(result.changes.length === result.params.days, name + " sample day count");
      result.changes.forEach(function (row) {
        assert(row.length === n, name + " simulated maturity count");
      });
      assert(result.baseYields.length === n, name + " base curve count");
      assert(result.shockedYields.length === n, name + " shocked curve count");
      assert(result.shocks.length === n, name + " shock count");
      assert(result.impacts.length === n, name + " impact count");
      assert(result.covariance.length === n, name + " covariance row count");
      assert(result.eigen.length === n, name + " eigenpair count");
      assert(result.explained.length === n, name + " explained variance count");
      for (var i = 0; i < n; i += 1) {
        assert(result.covariance[i].length === n, name + " covariance column count");
        for (var j = 0; j < n; j += 1) {
          assert(close(result.covariance[i][j], result.covariance[j][i], 1e-10), name + " covariance symmetry");
        }
      }
    }

    function assertPcaInvariants(name, result) {
      var totalExplained = result.explained.reduce(function (sum, value) { return sum + value; }, 0);
      var trace = 0;
      var eigenTotal = 0;
      var maxReconstructionError = 0;
      for (var i = 0; i < MATURITIES.length; i += 1) {
        trace += result.covariance[i][i];
        eigenTotal += result.eigen[i].value;
        assert(result.eigen[i].value >= 0, name + " nonnegative eigenvalue");
        if (i > 0) assert(result.eigen[i - 1].value >= result.eigen[i].value, name + " sorted eigenvalues");
        assert(close(vectorDot(result.eigen[i].vector, result.eigen[i].vector), 1, 1e-8), name + " unit eigenvector");
        for (var j = i + 1; j < MATURITIES.length; j += 1) {
          assert(Math.abs(vectorDot(result.eigen[i].vector, result.eigen[j].vector)) < 1e-8, name + " orthogonal eigenvectors");
        }
      }
      for (i = 0; i < MATURITIES.length; i += 1) {
        for (j = 0; j < MATURITIES.length; j += 1) {
          var reconstructed = 0;
          for (var k = 0; k < MATURITIES.length; k += 1) {
            reconstructed += result.eigen[k].value * result.eigen[k].vector[i] * result.eigen[k].vector[j];
          }
          maxReconstructionError = Math.max(maxReconstructionError, Math.abs(reconstructed - result.covariance[i][j]));
        }
      }
      assert(close(totalExplained, 1, 1e-10), name + " explained variance sums to one");
      assert(close(result.top3, result.explained[0] + result.explained[1] + result.explained[2], 1e-12), name + " top-three identity");
      assert(closeRelative(eigenTotal, trace, 1e-10), name + " covariance trace equals eigenvalue sum");
      assert(maxReconstructionError < 1e-6, name + " covariance reconstructs from eigenpairs");
    }

    function assertCase(name, result) {
      assertShape(name, result);
      assertPcaInvariants(name, result);
      assertPriceMath(name, result);
    }

    var result = evaluate(DEFAULTS);
    var noisy = evaluate(Object.assign({}, DEFAULTS, { noise: 18 }));
    var policy = evaluate(Object.assign({}, DEFAULTS, { regime: "policy" }));
    var inflation = evaluate(Object.assign({}, DEFAULTS, { regime: "inflation" }));
    var zeroShock = evaluate(Object.assign({}, DEFAULTS, { curvature: 0, level: 0, slope: 0 }));
    var stress = evaluate(Object.assign({}, DEFAULTS, { curvature: 0, level: 80, slope: 0 }));

    [
      ["default", result],
      ["high noise", noisy],
      ["policy regime", policy],
      ["inflation regime", inflation],
      ["zero shock", zeroShock],
      ["large level shock", stress]
    ].forEach(function (pair) {
      assertCase(pair[0], pair[1]);
    });

    var pc1 = result.eigen[0].vector;
    var pc2 = result.eigen[1].vector;
    var pc3 = result.eigen[2].vector;
    assert(Math.min.apply(null, pc1) > 0.12, "PC1 should be a same-sign level-like move");
    assert(pc2[0] > 0.35 && pc2[pc2.length - 1] < -0.25, "PC2 should separate short and long maturities");
    assert(pc3[4] > 0.2 && 0.5 * (pc3[0] + pc3[pc3.length - 1]) < -0.45, "PC3 should bend the belly against the wings");

    var shock10 = result.impacts[6];
    assertBetween(100 * result.explained[0], 73.8, 74.0, "default PC1 explained variance regression");
    assertBetween(100 * result.top3, 93.2, 93.4, "default top-three explained variance regression");
    assertBetween(shock10.exact, -1.22, -1.20, "default 10y exact return regression");
    assertBetween(shock10.duration, -1.23, -1.21, "default 10y duration return regression");
    assertBetween(result.shocks[8], 12.2, 12.4, "default 30y shock regression");
    assert(noisy.top3 < 0.5, "maturity-specific noise should break the clean three-factor map");
    assert(noisy.explained[0] < result.explained[0] / 3, "high noise should flatten the variance ledger");
    assert(policy.top3 > 0.94 && inflation.top3 > 0.93, "named regimes should still be mostly low-rank in this simulator");
    zeroShock.impacts.forEach(function (impact, index) {
      assert(zeroShock.shocks[index] === 0, "zero shock curve movement");
      assert(impact.exact === 0 && impact.duration === 0 && impact.convexity === 0, "zero shock price movement");
    });
    var stress30 = stress.impacts[8];
    assert(Math.abs(stress30.exact - stress30.convexity) < Math.abs(stress30.exact - stress30.duration) / 10, "convexity should improve a large 30y shock approximation");
    assert(evaluate(DEFAULTS).top3 === result.top3, "default run should be deterministic");

    var cleaned = cleanParams({ curvature: 99, days: 227, level: -99, noise: 99, regime: "broken", seed: 9999, slope: 99 });
    assert(cleaned.curvature === 40, "curvature clamps high");
    assert(cleaned.days === 230, "days clamps and rounds to tens");
    assert(cleaned.level === -60, "level clamps low");
    assert(cleaned.noise === 18, "noise clamps high");
    assert(cleaned.regime === DEFAULTS.regime, "invalid regime falls back to default");
    assert(cleaned.seed === 997, "seed clamps high");
    assert(cleaned.slope === 70, "slope clamps high");

    return {
      checked: checked,
      highNoiseTop3Explained: Number((100 * noisy.top3).toFixed(1)),
      ok: true,
      pc1Explained: Number((100 * result.explained[0]).toFixed(1)),
      stressThirtyYearConvexityError: Number(Math.abs(stress30.exact - stress30.convexity).toFixed(4)),
      stressThirtyYearDurationError: Number(Math.abs(stress30.exact - stress30.duration).toFixed(4)),
      top3Explained: Number((100 * result.top3).toFixed(1)),
      tenYearExactReturn: Number(shock10.exact.toFixed(2)),
      tenYearDurationReturn: Number(shock10.duration.toFixed(2)),
      thirtyYearShockBp: Number(result.shocks[8].toFixed(1))
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
        if (key === "level" || key === "slope" || key === "curvature") value += " bp";
        if (key === "noise") value += " bp";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var metrics = root.querySelector("[data-metrics]");
    if (!metrics) return;
    var ten = result.impacts[6];
    var rows = [
      ["PC1 variance", fmt(100 * result.explained[0], 1) + "%"],
      ["top 3 variance", fmt(100 * result.top3, 1) + "%"],
      ["10y shock", fmt(result.shocks[6], 1) + " bp"],
      ["10y exact return", fmt(ten.exact, 2) + "%"],
      ["duration approx", fmt(ten.duration, 2) + "%"],
      ["30y shock", fmt(result.shocks[8], 1) + " bp"]
    ];
    metrics.innerHTML = rows.map(function (row) {
      return '<div class="yc-lab__metric"><span>' + row[0] + '</span><strong>' + row[1] + "</strong></div>";
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

  function drawLine(ctx, values, x, y, w, h, r, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    values.forEach(function (value, i) {
      var xx = x + w * (Math.log(MATURITIES[i]) - Math.log(MATURITIES[0])) / (Math.log(MATURITIES[MATURITIES.length - 1]) - Math.log(MATURITIES[0]));
      var yy = y + h - h * (value - r.min) / (r.max - r.min);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawCurve(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "zero curve and shock");
    var px = x + 44;
    var py = y + 40;
    var pw = w - 62;
    var ph = h - 64;
    var r = range(result.baseYields.concat(result.shockedYields));
    r.min -= 0.2;
    r.max += 0.2;
    grid(ctx, px, py, pw, ph, 4);
    drawLine(ctx, result.baseYields, px, py, pw, ph, r, COLORS.base, 2.5);
    drawLine(ctx, result.shockedYields, px, py, pw, ph, r, COLORS.shocked, 2.5);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("green = base curve; blue = after factor shock", px, y + h - 14);
  }

  function drawPcs(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "principal component loadings");
    var px = x + 42;
    var py = y + 40;
    var pw = w - 60;
    var ph = h - 64;
    var vals = result.eigen[0].vector.concat(result.eigen[1].vector, result.eigen[2].vector);
    var r = range(vals.concat([0]));
    r.min -= 0.05;
    r.max += 0.05;
    grid(ctx, px, py, pw, ph, 4);
    drawLine(ctx, result.eigen[0].vector, px, py, pw, ph, r, COLORS.pc1, 2.2);
    drawLine(ctx, result.eigen[1].vector, px, py, pw, ph, r, COLORS.pc2, 2.2);
    drawLine(ctx, result.eigen[2].vector, px, py, pw, ph, r, COLORS.pc3, 2.2);
    var zero = py + ph - ph * (0 - r.min) / (r.max - r.min);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(px, zero);
    ctx.lineTo(px + pw, zero);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("blue PC1, red PC2, green PC3", px, y + h - 14);
  }

  function drawVariance(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "variance ledger");
    var px = x + 34;
    var py = y + 54;
    var pw = w - 54;
    var ph = h - 84;
    var max = Math.max.apply(null, result.explained.slice(0, 6));
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("top three = " + fmt(100 * result.top3, 1) + "%", x + w - 126, y + 23);
    result.explained.slice(0, 6).forEach(function (value, i) {
      var barW = pw / 6 * 0.66;
      var cx = px + pw * (i + 0.5) / 6;
      var bh = ph * value / max;
      ctx.fillStyle = i < 3 ? [COLORS.pc1, COLORS.pc2, COLORS.pc3][i] : "#94a3b8";
      ctx.fillRect(cx - barW / 2, py + ph - bh, barW, bh);
      ctx.fillStyle = COLORS.text;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("PC" + (i + 1), cx - 12, py + ph + 17);
      ctx.fillText(fmt(100 * value, 0) + "%", cx - 13, py + ph - bh - 7);
    });
  }

  function drawPnL(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "zero-coupon shock return");
    var px = x + 42;
    var py = y + 40;
    var pw = w - 60;
    var ph = h - 64;
    var exact = result.impacts.map(function (row) { return row.exact; });
    var approx = result.impacts.map(function (row) { return row.convexity; });
    var r = range(exact.concat(approx, [0]));
    r.min -= 0.4;
    r.max += 0.4;
    grid(ctx, px, py, pw, ph, 4);
    var zero = py + ph - ph * (0 - r.min) / (r.max - r.min);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(px, zero);
    ctx.lineTo(px + pw, zero);
    ctx.stroke();
    drawLine(ctx, exact, px, py, pw, ph, r, COLORS.pnl, 2.5);
    drawLine(ctx, approx, px, py, pw, ph, r, COLORS.approx, 2, [6, 5]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("red = exact return; purple dashed = duration + convexity", px, y + h - 14);
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    clear(ctx);
    drawCurve(ctx, result, 18, 18, 430, 226);
    drawPcs(ctx, result, 472, 18, 430, 226);
    drawVariance(ctx, result, 18, 262, 430, 218);
    drawPnL(ctx, result, 472, 262, 430, 218);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("maturity axis is log-scaled: 6m, 1y, 2y, 3y, 5y, 7y, 10y, 20y, 30y", 36, 515);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__yieldCurvePcaLabResult = result;
  }

  function init(root) {
    if (!root || root.__yieldCurvePcaLabInitialized) return;
    root.__yieldCurvePcaLabInitialized = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function initAll() {
    document.querySelectorAll("[data-yield-curve-pca-lab]").forEach(init);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    DEFAULTS: DEFAULTS,
    MATURITIES: MATURITIES,
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.YieldCurvePcaLab = api;
})(typeof window !== "undefined" ? window : globalThis);
