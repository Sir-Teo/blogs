(function (global) {
  "use strict";

  var COLORS = {
    approx: "#be123c",
    exact: "#0f766e",
    farthest: "#2563eb",
    grid: "#e6edf3",
    landmark: "#111827",
    leverage: "#7c3aed",
    muted: "#5d6872",
    panel: "#f8fafc",
    pointLow: "#b45309",
    pointHigh: "#0f766e",
    rule: "#d7dee5",
    text: "#172026",
    uniform: "#0891b2",
    white: "#ffffff"
  };

  var DEFAULTS = {
    landmarks: 14,
    lengthscale: 28,
    n: 72,
    noise: 8,
    ridgeExp: -2,
    scenario: "islands",
    seed: 37,
    strategy: "leverage"
  };

  var SCENARIOS = {
    islands: "clustered islands",
    crescent: "curved manifold",
    tail: "dense core plus tail"
  };

  var STRATEGIES = {
    farthest: "farthest-point",
    leverage: "ridge leverage",
    uniform: "uniform"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var strategy = STRATEGIES[raw.strategy] ? raw.strategy : DEFAULTS.strategy;
    var n = Math.round(clamp(finite(Number(raw.n), DEFAULTS.n), 32, 112));
    return {
      landmarks: Math.round(clamp(finite(Number(raw.landmarks), DEFAULTS.landmarks), 4, Math.min(48, n))),
      lengthscale: Math.round(clamp(finite(Number(raw.lengthscale), DEFAULTS.lengthscale), 8, 70)),
      n: n,
      noise: Math.round(clamp(finite(Number(raw.noise), DEFAULTS.noise), 0, 35)),
      ridgeExp: clamp(finite(Number(raw.ridgeExp), DEFAULTS.ridgeExp), -5, 0),
      scenario: scenario,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      strategy: strategy
    };
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32(index + 1, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(2 * index + 11, seed));
    var u2 = uniform(2 * index + 12, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function trueFunction(x, y) {
    var bump = Math.exp(-9 * ((x - 0.25) * (x - 0.25) + (y + 0.2) * (y + 0.2)));
    return 0.72 * Math.sin(2.7 * x + 0.7 * y) + 0.42 * Math.cos(3.1 * y) + 0.55 * bump;
  }

  function makePoints(params) {
    var out = [];
    var seed = params.seed * 7919;
    for (var i = 0; i < params.n; i += 1) {
      var u = uniform(4 * i + 0, seed);
      var v = uniform(4 * i + 1, seed);
      var x;
      var y;
      if (params.scenario === "crescent") {
        var theta = 0.25 * Math.PI + 1.35 * Math.PI * u;
        var radius = 0.58 + 0.16 * normal(4 * i + 2, seed);
        x = radius * Math.cos(theta) + 0.08 * normal(4 * i + 3, seed);
        y = radius * Math.sin(theta) - 0.12 + 0.08 * normal(4 * i + 4, seed);
      } else if (params.scenario === "tail") {
        if (u < 0.72) {
          x = 0.22 * normal(4 * i + 2, seed) - 0.25;
          y = 0.22 * normal(4 * i + 3, seed) + 0.08;
        } else {
          var t = (u - 0.72) / 0.28;
          x = -0.1 + 1.05 * t + 0.08 * normal(4 * i + 4, seed);
          y = -0.45 + 0.72 * t + 0.08 * normal(4 * i + 5, seed);
        }
      } else {
        var cluster = Math.floor(3 * u);
        var centers = [[-0.58, -0.22], [0.18, 0.38], [0.62, -0.48]];
        var c = centers[Math.min(2, cluster)];
        x = c[0] + 0.2 * normal(4 * i + 2, seed);
        y = c[1] + 0.2 * normal(4 * i + 3, seed);
      }
      x = clamp(x, -0.98, 0.98);
      y = clamp(y, -0.98, 0.98);
      var clean = trueFunction(x, y);
      var observed = clean + params.noise / 100 * normal(4 * i + 6, seed);
      out.push({ clean: clean, index: i, observed: observed, x: x, y: y });
    }
    return out;
  }

  function testGrid() {
    var rows = [];
    var side = 33;
    for (var iy = 0; iy < side; iy += 1) {
      for (var ix = 0; ix < side; ix += 1) {
        var x = -1 + 2 * (ix + 0.5) / side;
        var y = -1 + 2 * (iy + 0.5) / side;
        rows.push({ clean: trueFunction(x, y), x: x, y: y });
      }
    }
    return rows;
  }

  function sqDist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function kernelValue(a, b, ell) {
    return Math.exp(-sqDist(a, b) / (2 * ell * ell));
  }

  function kernelMatrix(points, ell) {
    var n = points.length;
    var K = [];
    for (var i = 0; i < n; i += 1) {
      var row = [];
      for (var j = 0; j < n; j += 1) row.push(0);
      K.push(row);
    }
    for (i = 0; i < n; i += 1) {
      K[i][i] = 1;
      for (j = 0; j < i; j += 1) {
        var value = kernelValue(points[i], points[j], ell);
        K[i][j] = value;
        K[j][i] = value;
      }
    }
    return K;
  }

  function zeros(rows, cols) {
    var out = [];
    for (var i = 0; i < rows; i += 1) {
      var row = [];
      for (var j = 0; j < cols; j += 1) row.push(0);
      out.push(row);
    }
    return out;
  }

  function addRidge(A, lambda) {
    return A.map(function (row, i) {
      var copy = row.slice();
      copy[i] += lambda;
      return copy;
    });
  }

  function cholesky(A) {
    var n = A.length;
    var L = zeros(n, n);
    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j <= i; j += 1) {
        var sum = A[i][j];
        for (var k = 0; k < j; k += 1) sum -= L[i][k] * L[j][k];
        if (i === j) {
          if (!(sum > 1e-14) || !Number.isFinite(sum)) return null;
          L[i][j] = Math.sqrt(sum);
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }
    return L;
  }

  function solveWithCholeskyFactor(L, b) {
    var n = L.length;
    var z = [];
    var i;
    var j;
    for (i = 0; i < n; i += 1) {
      var sum = b[i];
      for (j = 0; j < i; j += 1) sum -= L[i][j] * z[j];
      z[i] = sum / L[i][i];
    }
    var x = [];
    for (i = n - 1; i >= 0; i -= 1) {
      sum = z[i];
      for (j = i + 1; j < n; j += 1) sum -= L[j][i] * x[j];
      x[i] = sum / L[i][i];
    }
    return x;
  }

  function solveSym(A, b) {
    var L = cholesky(A);
    if (!L) return null;
    return solveWithCholeskyFactor(L, b);
  }

  function solveSymMatrix(A, B) {
    var L = cholesky(A);
    if (!L) return null;
    var out = [];
    for (var c = 0; c < B[0].length; c += 1) {
      var rhs = [];
      for (var r = 0; r < B.length; r += 1) rhs.push(B[r][c]);
      out.push(solveWithCholeskyFactor(L, rhs));
    }
    var rows = B.length;
    var cols = B[0].length;
    var transposed = zeros(rows, cols);
    for (r = 0; r < rows; r += 1) {
      for (c = 0; c < cols; c += 1) transposed[r][c] = out[c][r];
    }
    return transposed;
  }

  function transpose(A) {
    var out = zeros(A[0].length, A.length);
    for (var i = 0; i < A.length; i += 1) {
      for (var j = 0; j < A[0].length; j += 1) out[j][i] = A[i][j];
    }
    return out;
  }

  function matMul(A, B) {
    var out = zeros(A.length, B[0].length);
    for (var i = 0; i < A.length; i += 1) {
      for (var k = 0; k < B.length; k += 1) {
        var aik = A[i][k];
        if (aik === 0) continue;
        for (var j = 0; j < B[0].length; j += 1) out[i][j] += aik * B[k][j];
      }
    }
    return out;
  }

  function matVec(A, x) {
    return A.map(function (row) {
      var sum = 0;
      for (var i = 0; i < x.length; i += 1) sum += row[i] * x[i];
      return sum;
    });
  }

  function frobenius(A) {
    var sum = 0;
    for (var i = 0; i < A.length; i += 1) {
      for (var j = 0; j < A[i].length; j += 1) sum += A[i][j] * A[i][j];
    }
    return Math.sqrt(sum);
  }

  function subFrobenius(A, B) {
    var sum = 0;
    for (var i = 0; i < A.length; i += 1) {
      for (var j = 0; j < A[i].length; j += 1) {
        var d = A[i][j] - B[i][j];
        sum += d * d;
      }
    }
    return Math.sqrt(sum);
  }

  function rmse(pred, truth) {
    var sum = 0;
    for (var i = 0; i < pred.length; i += 1) {
      var d = pred[i] - truth[i];
      sum += d * d;
    }
    return Math.sqrt(sum / Math.max(1, pred.length));
  }

  function leverageScores(K, lambda) {
    var A = addRidge(K, lambda);
    var Z = solveSymMatrix(A, K);
    if (!Z) return K.map(function () { return 1; });
    return Z.map(function (row, i) { return clamp(row[i], 0, 1); });
  }

  function selectLandmarks(points, scores, m, strategy, seed) {
    var n = points.length;
    var order = [];
    if (strategy === "leverage") {
      for (var i = 0; i < n; i += 1) order.push(i);
      order.sort(function (a, b) {
        if (scores[b] !== scores[a]) return scores[b] - scores[a];
        return a - b;
      });
      return order.slice(0, m);
    }
    if (strategy === "farthest") {
      var meanX = 0;
      var meanY = 0;
      for (i = 0; i < n; i += 1) {
        meanX += points[i].x;
        meanY += points[i].y;
      }
      meanX /= n;
      meanY /= n;
      var first = 0;
      var best = -Infinity;
      for (i = 0; i < n; i += 1) {
        var dx = points[i].x - meanX;
        var dy = points[i].y - meanY;
        var dist = dx * dx + dy * dy;
        if (dist > best) {
          best = dist;
          first = i;
        }
      }
      order = [first];
      var chosen = {};
      chosen[first] = true;
      while (order.length < m) {
        var next = -1;
        best = -Infinity;
        for (i = 0; i < n; i += 1) {
          if (chosen[i]) continue;
          var minDist = Infinity;
          for (var j = 0; j < order.length; j += 1) {
            minDist = Math.min(minDist, sqDist(points[i], points[order[j]]));
          }
          if (minDist > best) {
            best = minDist;
            next = i;
          }
        }
        chosen[next] = true;
        order.push(next);
      }
      return order;
    }
    for (i = 0; i < n; i += 1) order.push(i);
    order.sort(function (a, b) {
      return uniform(a, seed * 10007) - uniform(b, seed * 10007);
    });
    return order.slice(0, m);
  }

  function nystrom(K, indices) {
    var n = K.length;
    var m = indices.length;
    var C = zeros(n, m);
    var W = zeros(m, m);
    for (var i = 0; i < n; i += 1) {
      for (var a = 0; a < m; a += 1) C[i][a] = K[i][indices[a]];
    }
    for (a = 0; a < m; a += 1) {
      for (var b = 0; b < m; b += 1) W[a][b] = K[indices[a]][indices[b]];
    }
    var WinvCt = solveSymMatrix(addRidge(W, 1e-10), transpose(C));
    if (!WinvCt) return { failed: true, Ktilde: zeros(n, n), landmarks: indices };
    return {
      C: C,
      failed: false,
      Ktilde: matMul(C, WinvCt),
      landmarks: indices,
      W: W,
      WinvCt: WinvCt
    };
  }

  function kernelRowsToPoints(test, train, ell) {
    var out = [];
    for (var i = 0; i < test.length; i += 1) {
      var row = [];
      for (var j = 0; j < train.length; j += 1) row.push(kernelValue(test[i], train[j], ell));
      out.push(row);
    }
    return out;
  }

  function approximateTestKernel(test, train, ell, model) {
    var m = model.landmarks.length;
    var Z = zeros(test.length, m);
    for (var i = 0; i < test.length; i += 1) {
      for (var a = 0; a < m; a += 1) Z[i][a] = kernelValue(test[i], train[model.landmarks[a]], ell);
    }
    return matMul(Z, model.WinvCt);
  }

  function evaluateStrategy(base, strategy, m) {
    var indices = selectLandmarks(base.points, base.scores, m, strategy, base.params.seed);
    var model = nystrom(base.K, indices);
    var y = base.points.map(function (p) { return p.observed; });
    var exactAlpha = base.exactAlpha;
    var approxAlpha = solveSym(addRidge(model.Ktilde, base.lambda), y);
    if (!approxAlpha) approxAlpha = y.map(function () { return 0; });
    var exactPred = matVec(base.Ktest, exactAlpha);
    var approxKtest = approximateTestKernel(base.test, base.points, base.ell, model);
    var approxPred = matVec(approxKtest, approxAlpha);
    var truth = base.test.map(function (p) { return p.clean; });
    var scoreTotal = base.scores.reduce(function (sum, value) { return sum + value; }, 0);
    var scoreMass = indices.reduce(function (sum, index) { return sum + base.scores[index]; }, 0) / Math.max(1e-12, scoreTotal);
    return {
      approxPred: approxPred,
      approxRmse: rmse(approxPred, truth),
      exactPred: exactPred,
      exactRmse: rmse(exactPred, truth),
      indices: indices,
      kernelError: subFrobenius(base.K, model.Ktilde) / Math.max(1e-12, frobenius(base.K)),
      Ktilde: model.Ktilde,
      model: model,
      predictionGap: rmse(approxPred, exactPred),
      scoreMass: scoreMass,
      strategy: strategy
    };
  }

  function buildBase(params) {
    var points = makePoints(params);
    var ell = params.lengthscale / 100;
    var lambda = Math.pow(10, params.ridgeExp);
    var K = kernelMatrix(points, ell);
    var scores = leverageScores(K, lambda);
    var y = points.map(function (p) { return p.observed; });
    var exactAlpha = solveSym(addRidge(K, lambda), y);
    var test = testGrid();
    var Ktest = kernelRowsToPoints(test, points, ell);
    return {
      effectiveDimension: scores.reduce(function (sum, value) { return sum + value; }, 0),
      ell: ell,
      exactAlpha: exactAlpha,
      K: K,
      Ktest: Ktest,
      lambda: lambda,
      params: params,
      points: points,
      scores: scores,
      test: test
    };
  }

  function sweep(base) {
    var sizes = [4, 8, 12, 16, 24, 32, 48].filter(function (m) { return m <= base.points.length && m <= 48; });
    var strategies = ["uniform", "farthest", "leverage"];
    var rows = [];
    strategies.forEach(function (strategy) {
      sizes.forEach(function (m) {
        rows.push({
          m: m,
          result: evaluateStrategy(base, strategy, m),
          strategy: strategy
        });
      });
    });
    return { rows: rows, sizes: sizes, strategies: strategies };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var base = buildBase(params);
    var current = evaluateStrategy(base, params.strategy, params.landmarks);
    return {
      base: base,
      current: current,
      params: params,
      sweep: sweep(base)
    };
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 3 : digits);
  }

  function metric(label, value) {
    return '<div class="nys-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function paramsFromRoot(root) {
    var raw = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    root.querySelectorAll("select[data-param]").forEach(function (select) {
      raw[select.getAttribute("data-param")] = select.value;
    });
    return raw;
  }

  function drawText(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.save();
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || "600") + " " + (opts.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.save();
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 23, { size: 13, weight: "800" });
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 40, { color: COLORS.muted, size: 10.5, weight: "650" });
    ctx.restore();
  }

  function scale(domain, range) {
    return function (value) {
      return range[0] + (value - domain[0]) / Math.max(1e-12, domain[1] - domain[0]) * (range[1] - range[0]);
    };
  }

  function colorRamp(value) {
    var t = clamp((value + 1.3) / 2.6, 0, 1);
    var r = Math.round(180 + (15 - 180) * t);
    var g = Math.round(83 + (118 - 83) * t);
    var b = Math.round(9 + (110 - 9) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawPoints(ctx, result, box) {
    panel(ctx, box, "landmarks in input space", SCENARIOS[result.params.scenario] + ", " + STRATEGIES[result.params.strategy]);
    var plot = { x: box.x + 44, y: box.y + 54, w: box.w - 68, h: box.h - 86 };
    var xS = scale([-1, 1], [plot.x, plot.x + plot.w]);
    var yS = scale([-1, 1], [plot.y + plot.h, plot.y]);
    var chosen = {};
    result.current.indices.forEach(function (index) { chosen[index] = true; });
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    result.base.points.forEach(function (p) {
      ctx.fillStyle = colorRamp(p.clean);
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(xS(p.x), yS(p.y), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (chosen[p.index]) {
        ctx.strokeStyle = COLORS.landmark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(xS(p.x), yS(p.y), 7.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    drawText(ctx, "ringed points are kept columns", plot.x, box.y + box.h - 18, { color: COLORS.landmark, size: 10, weight: "800" });
    drawText(ctx, "color = latent function", plot.x + plot.w, box.y + box.h - 18, { align: "right", color: COLORS.muted, size: 10, weight: "650" });
    ctx.restore();
  }

  function drawResidualMatrix(ctx, result, box) {
    panel(ctx, box, "kernel matrix debt", "|K - C W^-1 C^T|");
    var K = result.base.K;
    var T = result.current.Ktilde;
    var n = K.length;
    var plot = { x: box.x + 34, y: box.y + 54, w: box.w - 58, h: box.h - 84 };
    var maxErr = 0;
    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j < n; j += 1) maxErr = Math.max(maxErr, Math.abs(K[i][j] - T[i][j]));
    }
    var cell = Math.min(plot.w, plot.h) / n;
    var x0 = plot.x + (plot.w - cell * n) / 2;
    var y0 = plot.y + (plot.h - cell * n) / 2;
    ctx.save();
    for (i = 0; i < n; i += 1) {
      for (j = 0; j < n; j += 1) {
        var e = Math.abs(K[i][j] - T[i][j]) / Math.max(1e-12, maxErr);
        var shade = Math.round(255 - 210 * Math.sqrt(e));
        ctx.fillStyle = "rgb(255," + shade + "," + shade + ")";
        ctx.fillRect(x0 + j * cell, y0 + i * cell, Math.max(1, cell + 0.2), Math.max(1, cell + 0.2));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x0, y0, cell * n, cell * n);
    drawText(ctx, "max cell error " + formatNumber(maxErr, 3), plot.x, box.y + box.h - 17, { color: COLORS.muted, size: 10, weight: "650" });
    ctx.restore();
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "landmark budget sweep", "relative Frobenius kernel error");
    var rows = result.sweep.rows;
    var maxM = Math.max.apply(null, result.sweep.sizes);
    var maxErr = Math.max.apply(null, rows.map(function (row) { return row.result.kernelError; }));
    var plot = { x: box.x + 46, y: box.y + 58, w: box.w - 72, h: box.h - 90 };
    var xS = scale([4, maxM], [plot.x, plot.x + plot.w]);
    var yS = scale([0, Math.max(0.05, maxErr * 1.08)], [plot.y + plot.h, plot.y]);
    var colors = { farthest: COLORS.farthest, leverage: COLORS.leverage, uniform: COLORS.uniform };
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    [0, 0.1, 0.2, 0.4, 0.6, 0.8].forEach(function (tick) {
      if (tick > maxErr * 1.08) return;
      var y = yS(tick);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      drawText(ctx, formatPct(tick, 0), plot.x - 7, y + 3, { align: "right", color: COLORS.muted, size: 9, weight: "650" });
    });
    result.sweep.strategies.forEach(function (strategy) {
      var pts = rows.filter(function (row) { return row.strategy === strategy; });
      ctx.strokeStyle = colors[strategy];
      ctx.lineWidth = strategy === result.params.strategy ? 2.4 : 1.6;
      ctx.beginPath();
      pts.forEach(function (row, index) {
        var x = xS(row.m);
        var y = yS(row.result.kernelError);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      pts.forEach(function (row) {
        ctx.fillStyle = colors[strategy];
        ctx.beginPath();
        ctx.arc(xS(row.m), yS(row.result.kernelError), 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    drawText(ctx, "uniform", plot.x, box.y + box.h - 17, { color: COLORS.uniform, size: 10, weight: "800" });
    drawText(ctx, "farthest", plot.x + 68, box.y + box.h - 17, { color: COLORS.farthest, size: 10, weight: "800" });
    drawText(ctx, "leverage", plot.x + 138, box.y + box.h - 17, { color: COLORS.leverage, size: 10, weight: "800" });
    drawText(ctx, "columns kept", plot.x + plot.w, box.y + box.h - 17, { align: "right", color: COLORS.muted, size: 10, weight: "650" });
    ctx.restore();
  }

  function drawLedger(ctx, result, box) {
    panel(ctx, box, "downstream ledger", "kernel approximation meets KRR");
    var rows = [
      { label: "kernel error", value: result.current.kernelError, max: 0.8, color: COLORS.approx, text: formatPct(result.current.kernelError, 1) },
      { label: "exact KRR RMSE", value: result.current.exactRmse, max: 0.55, color: COLORS.exact, text: formatNumber(result.current.exactRmse, 3) },
      { label: "Nystrom RMSE", value: result.current.approxRmse, max: 0.55, color: COLORS.approx, text: formatNumber(result.current.approxRmse, 3) },
      { label: "prediction gap", value: result.current.predictionGap, max: 0.55, color: COLORS.farthest, text: formatNumber(result.current.predictionGap, 3) },
      { label: "leverage mass", value: result.current.scoreMass, max: 1, color: COLORS.leverage, text: formatPct(result.current.scoreMass, 0) }
    ];
    var x0 = box.x + 22;
    var barX = box.x + 156;
    var barW = box.w - 178;
    var y0 = box.y + 64;
    var rowH = (box.h - 86) / rows.length;
    ctx.save();
    rows.forEach(function (row, i) {
      var y = y0 + i * rowH;
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(barX, y, barW, 14);
      ctx.fillStyle = row.color;
      ctx.fillRect(barX, y, clamp(row.value / row.max, 0, 1) * barW, 14);
      drawText(ctx, row.label, x0, y + 12, { size: 10.5, weight: "750" });
      drawText(ctx, row.text, barX + barW, y + 31, { align: "right", color: COLORS.muted, size: 10, weight: "650" });
    });
    drawText(ctx, "effective dimension " + formatNumber(result.base.effectiveDimension, 1), x0, box.y + box.h - 15, { color: COLORS.leverage, size: 10, weight: "800" });
    ctx.restore();
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    drawText(ctx, "Nystrom keeps columns, not magic", 18, 30, { size: 18, weight: "850" });
    drawText(ctx, result.params.n + " points, " + result.params.landmarks + " landmarks, ell " + formatNumber(result.base.ell, 2) + ", lambda 1e" + result.params.ridgeExp, 18, 52, { color: COLORS.muted, size: 12, weight: "650" });
    drawPoints(ctx, result, { x: 18, y: 72, w: 430, h: 310 });
    drawResidualMatrix(ctx, result, { x: 470, y: 72, w: 432, h: 310 });
    drawSweep(ctx, result, { x: 18, y: 406, w: 430, h: height - 426 });
    drawLedger(ctx, result, { x: 470, y: 406, w: 432, h: height - 426 });
  }

  function updateOutputs(root, params) {
    [
      ["n", String(params.n)],
      ["landmarks", String(params.landmarks)],
      ["lengthscale", params.lengthscale + "%"],
      ["noise", params.noise + "%"],
      ["ridgeExp", "1e" + params.ridgeExp],
      ["seed", String(params.seed)]
    ].forEach(function (pair) {
      var node = root.querySelector('[data-value="' + pair[0] + '"]');
      if (node) node.textContent = pair[1];
    });
  }

  function render(root) {
    var result = evaluate(paramsFromRoot(root));
    updateOutputs(root, result.params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("kernel error", formatPct(result.current.kernelError, 1)),
        metric("exact RMSE", formatNumber(result.current.exactRmse, 3)),
        metric("Nystrom RMSE", formatNumber(result.current.approxRmse, 3)),
        metric("prediction gap", formatNumber(result.current.predictionGap, 3)),
        metric("leverage mass", formatPct(result.current.scoreMass, 0)),
        metric("effective dim", formatNumber(result.base.effectiveDimension, 1))
      ].join("");
    }
    draw(root.querySelector("canvas[data-canvas]"), result);
  }

  function init(root) {
    if (!root || root.__nystromReady) return;
    root.__nystromReady = true;
    root.querySelectorAll("input[data-param], select[data-param]").forEach(function (control) {
      control.addEventListener("input", function () { render(root); });
      control.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function audit() {
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    var base = evaluate(DEFAULTS);
    assert(base.current.kernelError >= 0 && base.current.kernelError < 1, "finite kernel error");
    assert(Number.isFinite(base.current.approxRmse), "finite approximate RMSE");
    assert(base.base.effectiveDimension > 1, "positive effective dimension");

    var full = evaluate({ n: 48, landmarks: 48, lengthscale: 28, noise: 8, ridgeExp: -2, scenario: "islands", seed: 37, strategy: "leverage" });
    assert(full.current.kernelError < 1e-7, "all columns reconstruct the kernel");
    assert(full.current.predictionGap < 1e-6, "all columns match exact prediction");

    var small = evaluate({ n: 72, landmarks: 8, lengthscale: 28, noise: 8, ridgeExp: -2, scenario: "tail", seed: 41, strategy: "farthest" });
    var large = evaluate({ n: 72, landmarks: 24, lengthscale: 28, noise: 8, ridgeExp: -2, scenario: "tail", seed: 41, strategy: "farthest" });
    assert(large.current.kernelError <= small.current.kernelError + 1e-9, "adding farthest landmarks should not worsen projection error in audit case");

    var uniformRun = evaluate({ n: 72, landmarks: 14, lengthscale: 28, noise: 8, ridgeExp: -2, scenario: "islands", seed: 37, strategy: "uniform" });
    var leverageRun = evaluate({ n: 72, landmarks: 14, lengthscale: 28, noise: 8, ridgeExp: -2, scenario: "islands", seed: 37, strategy: "leverage" });
    assert(leverageRun.current.scoreMass >= uniformRun.current.scoreMass, "top leverage landmarks capture at least as much leverage mass as uniform");

    return {
      defaultKernelError: Number(base.current.kernelError.toPrecision(4)),
      defaultNystromRmse: Number(base.current.approxRmse.toPrecision(4)),
      effectiveDimension: Number(base.base.effectiveDimension.toPrecision(4)),
      fullKernelError: Number(full.current.kernelError.toPrecision(4))
    };
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  global.NystromLandmarkLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-nystrom-landmark-lab]").forEach(init);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
