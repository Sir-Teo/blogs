(function (global) {
  "use strict";

  var EPS = Number.EPSILON;

  var COLORS = {
    cheb: "#0f766e",
    grid: "#e6edf3",
    householder: "#0f766e",
    mgs: "#0891b2",
    muted: "#5d6872",
    normal: "#be123c",
    panel: "#f8fafc",
    points: "#64748b",
    rule: "#d7dee5",
    text: "#172026",
    trueLine: "#111827",
    white: "#ffffff"
  };

  var BASIS = {
    raw: "raw powers on [0, 1]",
    centered: "centered powers on [-1, 1]",
    chebyshev: "Chebyshev basis"
  };

  var METHODS = [
    { key: "normal", label: "normal equations", color: COLORS.normal },
    { key: "mgs", label: "modified Gram-Schmidt", color: COLORS.mgs },
    { key: "householder", label: "Householder QR", color: COLORS.householder }
  ];

  var DEFAULTS = {
    basis: "raw",
    cluster: 42,
    degree: 11,
    noiseExp: -12,
    rows: 80,
    seed: 19
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var basis = BASIS[raw.basis] ? raw.basis : DEFAULTS.basis;
    return {
      basis: basis,
      cluster: Math.round(clamp(finite(Number(raw.cluster), DEFAULTS.cluster), 0, 100)),
      degree: Math.round(clamp(finite(Number(raw.degree), DEFAULTS.degree), 2, 17)),
      noiseExp: clamp(finite(Number(raw.noiseExp), DEFAULTS.noiseExp), -16, -4),
      rows: Math.round(clamp(finite(Number(raw.rows), DEFAULTS.rows), 24, 220)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997))
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
    var u1 = Math.max(1e-12, uniform(index * 2 + 5, seed));
    var u2 = uniform(index * 2 + 6, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
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

  function dot(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += a[i] * b[i];
    return sum;
  }

  function norm2(values) {
    var scale = 0;
    var ssq = 1;
    for (var i = 0; i < values.length; i += 1) {
      var x = Math.abs(values[i]);
      if (x !== 0) {
        if (scale < x) {
          var r = scale / x;
          ssq = 1 + ssq * r * r;
          scale = x;
        } else {
          var q = x / scale;
          ssq += q * q;
        }
      }
    }
    return scale === 0 ? 0 : scale * Math.sqrt(ssq);
  }

  function sub(a, b) {
    return a.map(function (x, i) { return x - b[i]; });
  }

  function basisRow(x, degree, basis) {
    var row = [1];
    var t = 2 * x - 1;
    if (basis === "raw") {
      for (var j = 1; j <= degree; j += 1) row.push(row[j - 1] * x);
    } else if (basis === "centered") {
      for (var k = 1; k <= degree; k += 1) row.push(row[k - 1] * t);
    } else {
      if (degree >= 1) row.push(t);
      for (var m = 2; m <= degree; m += 1) {
        row.push(2 * t * row[m - 1] - row[m - 2]);
      }
    }
    return row;
  }

  function trueCoefficients(degree, basis) {
    var coeffs = [];
    for (var j = 0; j <= degree; j += 1) {
      var sign = j % 2 === 0 ? 1 : -1;
      var decay = basis === "raw" ? Math.pow(0.62, j) : Math.pow(0.78, j);
      coeffs.push(sign * decay / (1 + 0.15 * j));
    }
    coeffs[0] = 0.6;
    if (degree >= 1) coeffs[1] = basis === "raw" ? -0.9 : 0.75;
    return coeffs;
  }

  function makeXs(params) {
    var xs = [];
    var power = 1 + 7.5 * params.cluster / 100;
    var seed = params.seed * 9173;
    for (var i = 0; i < params.rows; i += 1) {
      var u = (i + 0.5) / params.rows;
      var jitter = (uniform(i, seed) - 0.5) / params.rows * 0.35;
      u = clamp(u + jitter, 0, 1);
      var x = params.cluster === 0 ? u : 1 - Math.pow(1 - u, power);
      xs.push(clamp(x, 0, 1));
    }
    xs.sort(function (a, b) { return a - b; });
    return xs;
  }

  function makeData(raw) {
    var params = cleanParams(raw);
    var xs = makeXs(params);
    var coeffs = trueCoefficients(params.degree, params.basis);
    var A = [];
    var y = [];
    var cleanY = [];
    var noise = Math.pow(10, params.noiseExp);
    for (var i = 0; i < xs.length; i += 1) {
      var row = basisRow(xs[i], params.degree, params.basis);
      var clean = dot(row, coeffs);
      A.push(row);
      cleanY.push(clean);
      y.push(clean + noise * normal(i, params.seed * 101));
    }
    return {
      A: A,
      coeffs: coeffs,
      cleanY: cleanY,
      params: params,
      x: xs,
      y: y
    };
  }

  function gramAndRhs(A, y) {
    var m = A.length;
    var n = A[0].length;
    var G = zeros(n, n);
    var b = [];
    for (var j = 0; j < n; j += 1) b.push(0);
    for (var i = 0; i < m; i += 1) {
      for (var c = 0; c < n; c += 1) {
        b[c] += A[i][c] * y[i];
        for (var d = 0; d <= c; d += 1) {
          G[c][d] += A[i][c] * A[i][d];
        }
      }
    }
    for (var r = 0; r < n; r += 1) {
      for (var s = r + 1; s < n; s += 1) G[r][s] = G[s][r];
    }
    return { G: G, b: b };
  }

  function choleskySolve(G, b) {
    var n = G.length;
    var L = zeros(n, n);
    var maxDiag = 0;
    for (var d = 0; d < n; d += 1) maxDiag = Math.max(maxDiag, Math.abs(G[d][d]));
    var tol = Math.max(1e-30, maxDiag * 1e-15);
    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j <= i; j += 1) {
        var sum = G[i][j];
        for (var k = 0; k < j; k += 1) sum -= L[i][k] * L[j][k];
        if (i === j) {
          if (!(sum > tol) || !Number.isFinite(sum)) return null;
          L[i][j] = Math.sqrt(sum);
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }
    var z = [];
    for (i = 0; i < n; i += 1) {
      sum = b[i];
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

  function solveUpper(R, b) {
    var n = b.length;
    var x = [];
    for (var i = n - 1; i >= 0; i -= 1) {
      var sum = b[i];
      for (var j = i + 1; j < n; j += 1) sum -= R[i][j] * x[j];
      if (Math.abs(R[i][i]) < 1e-14) return null;
      x[i] = sum / R[i][i];
    }
    return x;
  }

  function normalEquationSolve(A, y) {
    var gr = gramAndRhs(A, y);
    var coeffs = choleskySolve(gr.G, gr.b);
    return {
      coeffs: coeffs,
      failed: !coeffs,
      gram: gr.G
    };
  }

  function modifiedGramSchmidtSolve(A, y) {
    var m = A.length;
    var n = A[0].length;
    var Q = [];
    var R = zeros(n, n);
    for (var j = 0; j < n; j += 1) {
      var v = [];
      for (var i = 0; i < m; i += 1) v.push(A[i][j]);
      for (var k = 0; k < j; k += 1) {
        var r = dot(Q[k], v);
        R[k][j] = r;
        for (i = 0; i < m; i += 1) v[i] -= r * Q[k][i];
      }
      var nv = norm2(v);
      if (nv < 1e-14) return { coeffs: null, failed: true, orthogonality: Infinity };
      R[j][j] = nv;
      Q[j] = v.map(function (value) { return value / nv; });
    }
    var qty = [];
    for (j = 0; j < n; j += 1) qty.push(dot(Q[j], y));
    var coeffs = solveUpper(R, qty);
    return {
      coeffs: coeffs,
      failed: !coeffs,
      orthogonality: qOrthogonality(Q)
    };
  }

  function householderSolve(A, y) {
    var m = A.length;
    var n = A[0].length;
    var R = A.map(function (row) { return row.slice(); });
    var z = y.slice();
    var reflectors = [];
    for (var k = 0; k < n; k += 1) {
      var x = [];
      for (var i = k; i < m; i += 1) x.push(R[i][k]);
      var nx = norm2(x);
      if (nx < 1e-14) return { coeffs: null, failed: true, orthogonality: Infinity };
      var alpha = R[k][k] >= 0 ? -nx : nx;
      var v = x.slice();
      v[0] -= alpha;
      var nv = norm2(v);
      if (nv < 1e-30) continue;
      for (i = 0; i < v.length; i += 1) v[i] /= nv;

      for (var j = k; j < n; j += 1) {
        var proj = 0;
        for (i = 0; i < v.length; i += 1) proj += v[i] * R[k + i][j];
        proj *= 2;
        for (i = 0; i < v.length; i += 1) R[k + i][j] -= proj * v[i];
      }
      proj = 0;
      for (i = 0; i < v.length; i += 1) proj += v[i] * z[k + i];
      proj *= 2;
      for (i = 0; i < v.length; i += 1) z[k + i] -= proj * v[i];
      reflectors.push({ k: k, v: v });
    }
    var Rtop = zeros(n, n);
    for (i = 0; i < n; i += 1) {
      for (j = i; j < n; j += 1) Rtop[i][j] = R[i][j];
    }
    var coeffs = solveUpper(Rtop, z.slice(0, n));
    return {
      coeffs: coeffs,
      failed: !coeffs,
      orthogonality: householderOrthogonality(m, n, reflectors)
    };
  }

  function qOrthogonality(Q) {
    var n = Q.length;
    var max = 0;
    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j < n; j += 1) {
        var value = dot(Q[i], Q[j]) - (i === j ? 1 : 0);
        max = Math.max(max, Math.abs(value));
      }
    }
    return max;
  }

  function householderOrthogonality(m, n, reflectors) {
    var Q = [];
    for (var c = 0; c < n; c += 1) {
      var e = [];
      for (var i = 0; i < m; i += 1) e.push(i === c ? 1 : 0);
      for (var r = reflectors.length - 1; r >= 0; r -= 1) {
        var h = reflectors[r];
        var proj = 0;
        for (i = 0; i < h.v.length; i += 1) proj += h.v[i] * e[h.k + i];
        proj *= 2;
        for (i = 0; i < h.v.length; i += 1) e[h.k + i] -= proj * h.v[i];
      }
      Q.push(e);
    }
    return qOrthogonality(Q);
  }

  function matVec(A, x) {
    return A.map(function (row) { return dot(row, x); });
  }

  function residualNorm(A, x, y) {
    if (!x) return Infinity;
    return norm2(sub(matVec(A, x), y)) / Math.max(1e-30, norm2(y));
  }

  function coefficientError(x, truth) {
    if (!x) return Infinity;
    return norm2(sub(x, truth)) / Math.max(1e-30, norm2(truth));
  }

  function predictionError(x, truth, params) {
    if (!x) return Infinity;
    var errs = [];
    var vals = [];
    for (var i = 0; i <= 160; i += 1) {
      var z = i / 160;
      var row = basisRow(z, params.degree, params.basis);
      errs.push(dot(row, x) - dot(row, truth));
      vals.push(dot(row, truth));
    }
    return norm2(errs) / Math.max(1e-30, norm2(vals));
  }

  function jacobiEigenSymmetric(A) {
    var n = A.length;
    var M = A.map(function (row) { return row.slice(); });
    for (var sweep = 0; sweep < 80 * n * n; sweep += 1) {
      var p = 0;
      var q = 1;
      var max = 0;
      for (var i = 0; i < n; i += 1) {
        for (var j = i + 1; j < n; j += 1) {
          var a = Math.abs(M[i][j]);
          if (a > max) {
            max = a;
            p = i;
            q = j;
          }
        }
      }
      if (max < 1e-13) break;
      var tau = (M[q][q] - M[p][p]) / (2 * M[p][q]);
      var t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      var c = 1 / Math.sqrt(1 + t * t);
      var s = t * c;
      var app = M[p][p];
      var aqq = M[q][q];
      var apq = M[p][q];
      M[p][p] = app - t * apq;
      M[q][q] = aqq + t * apq;
      M[p][q] = 0;
      M[q][p] = 0;
      for (var k = 0; k < n; k += 1) {
        if (k !== p && k !== q) {
          var mkp = M[k][p];
          var mkq = M[k][q];
          M[k][p] = c * mkp - s * mkq;
          M[p][k] = M[k][p];
          M[k][q] = s * mkp + c * mkq;
          M[q][k] = M[k][q];
        }
      }
    }
    return M.map(function (row, i) { return row[i]; }).sort(function (a, b) { return b - a; });
  }

  function conditionInfo(A) {
    var G = gramAndRhs(A, A.map(function () { return 0; })).G;
    var eig = jacobiEigenSymmetric(G);
    var maxEig = Math.max.apply(null, eig.map(function (v) { return Math.max(0, v); }));
    var floor = Math.max(1e-300, maxEig * 1e-18);
    var positive = eig.map(function (v) { return Math.max(v, 0); }).filter(function (v) { return v > floor; });
    var minEig = positive.length ? Math.min.apply(null, positive) : floor;
    var condA = Math.sqrt(maxEig / minEig);
    return {
      condA: condA,
      condAtA: condA * condA,
      eigenvalues: eig,
      singularValues: eig.map(function (v) { return Math.sqrt(Math.max(0, v)); })
    };
  }

  function solveAll(data) {
    var normal = normalEquationSolve(data.A, data.y);
    var mgs = modifiedGramSchmidtSolve(data.A, data.y);
    var house = householderSolve(data.A, data.y);
    var solvers = { normal: normal, mgs: mgs, householder: house };
    return METHODS.map(function (method) {
      var row = solvers[method.key];
      var coeffs = row.coeffs;
      return {
        coeffs: coeffs,
        color: method.color,
        coefficientError: coefficientError(coeffs, data.coeffs),
        failed: row.failed,
        key: method.key,
        label: method.label,
        orthogonality: row.orthogonality == null ? null : row.orthogonality,
        predictionError: predictionError(coeffs, data.coeffs, data.params),
        residual: residualNorm(data.A, coeffs, data.y)
      };
    });
  }

  function evaluate(raw) {
    var data = makeData(raw);
    var info = conditionInfo(data.A);
    var rows = solveAll(data);
    return {
      condition: info,
      data: data,
      methods: rows,
      params: data.params,
      warningDigits: -Math.log10(Math.max(EPS, info.condAtA * EPS))
    };
  }

  function formatSci(value, digits) {
    if (!Number.isFinite(value)) return "failed";
    if (value === 0) return "0";
    var places = digits == null ? 2 : digits;
    var abs = Math.abs(value);
    if (abs >= 1e4 || abs < 1e-2) return value.toExponential(places);
    return value.toFixed(places);
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "failed";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="lsq-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
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
    ctx.font = (opts.weight || "500") + " " + (opts.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.save();
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 23, { size: 13, weight: "800" });
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 40, { size: 10.5, color: COLORS.muted, weight: "600" });
    ctx.restore();
  }

  function scale(domain, range) {
    var d0 = domain[0];
    var d1 = domain[1];
    var r0 = range[0];
    var r1 = range[1];
    return function (value) {
      return r0 + (value - d0) / (d1 - d0) * (r1 - r0);
    };
  }

  function extent(values, pad) {
    var lo = Math.min.apply(null, values);
    var hi = Math.max.apply(null, values);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    var p = (hi - lo) * (pad == null ? 0.06 : pad);
    return [lo - p, hi + p];
  }

  function drawFit(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "same least-squares problem", BASIS[result.params.basis]);
    var xs = [];
    var ys = [];
    for (var i = 0; i <= 180; i += 1) {
      var x = i / 180;
      xs.push(x);
      ys.push(dot(basisRow(x, result.params.degree, result.params.basis), result.data.coeffs));
      result.methods.forEach(function (row) {
        if (row.coeffs) ys.push(dot(basisRow(x, result.params.degree, result.params.basis), row.coeffs));
      });
    }
    result.data.y.forEach(function (value) { ys.push(value); });
    var xS = scale([0, 1], [box.x + 42, box.x + box.w - 20]);
    var yS = scale(extent(ys, 0.08), [box.y + box.h - 34, box.y + 54]);

    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var gy = box.y + 54 + (box.h - 88) * g / 4;
      ctx.beginPath();
      ctx.moveTo(box.x + 42, gy);
      ctx.lineTo(box.x + box.w - 20, gy);
      ctx.stroke();
    }

    result.data.x.forEach(function (x, index) {
      ctx.fillStyle = COLORS.points;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(xS(x), yS(result.data.y[index]), 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    function line(coeffs, color, width, dash) {
      if (!coeffs) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      for (var j = 0; j <= 180; j += 1) {
        var x = j / 180;
        var y = dot(basisRow(x, result.params.degree, result.params.basis), coeffs);
        if (j === 0) ctx.moveTo(xS(x), yS(y));
        else ctx.lineTo(xS(x), yS(y));
      }
      ctx.stroke();
      ctx.restore();
    }

    line(result.data.coeffs, COLORS.trueLine, 2.2, [6, 4]);
    result.methods.forEach(function (row) { line(row.coeffs, row.color, row.key === "normal" ? 1.6 : 2.1); });
    drawText(ctx, "true", box.x + 52, box.y + box.h - 12, { color: COLORS.trueLine, size: 10, weight: "800" });
    result.methods.forEach(function (row, i) {
      drawText(ctx, row.label.replace(" equations", ""), box.x + 94 + i * 118, box.y + box.h - 12, { color: row.color, size: 10, weight: "800" });
    });
    ctx.restore();
  }

  function drawErrors(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "coefficient error", "relative to the generating coefficients");
    var finiteRows = result.methods.filter(function (row) { return Number.isFinite(row.coefficientError); });
    var maxErr = Math.max(1e-16, Math.max.apply(null, finiteRows.map(function (row) { return row.coefficientError; })));
    var minLog = -16;
    var maxLog = Math.max(-15, Math.ceil(Math.log10(maxErr)));
    var x0 = box.x + 26;
    var y0 = box.y + 70;
    var barW = box.w - 52;
    var rowH = 58;
    result.methods.forEach(function (row, index) {
      var y = y0 + index * rowH;
      var value = Number.isFinite(row.coefficientError) ? row.coefficientError : Math.pow(10, maxLog);
      var logv = clamp(Math.log10(Math.max(1e-16, value)), minLog, maxLog);
      var w = (logv - minLog) / (maxLog - minLog) * barW;
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(x0, y, barW, 14);
      ctx.fillStyle = row.color;
      ctx.fillRect(x0, y, Math.max(2, w), 14);
      drawText(ctx, row.label, x0, y - 10, { color: row.color, size: 12, weight: "800" });
      drawText(ctx, formatSci(row.coefficientError, 2), x0 + barW, y + 12, { align: "right", size: 11, weight: "750" });
      drawText(ctx, "residual " + formatSci(row.residual, 2), x0, y + 33, { color: COLORS.muted, size: 10, weight: "650" });
    });
    drawText(ctx, "log scale from 1e-16 to 1e" + maxLog, x0, box.y + box.h - 14, { color: COLORS.muted, size: 10, weight: "650" });
  }

  function drawSpectrum(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "singular values", "forming A^T A squares the spread");
    var sig = result.condition.singularValues.slice().sort(function (a, b) { return b - a; });
    var maxS = Math.max.apply(null, sig);
    var minLog = Math.floor(Math.log10(Math.max(1e-18, sig[sig.length - 1] / maxS)));
    var plot = { x: box.x + 36, y: box.y + 58, w: box.w - 62, h: box.h - 92 };
    ctx.save();
    for (var i = 0; i < sig.length; i += 1) {
      var x = plot.x + plot.w * i / Math.max(1, sig.length - 1);
      var logS = Math.log10(Math.max(1e-18, sig[i] / maxS));
      var logG = 2 * logS;
      var yS = plot.y + plot.h * (logS - 0) / (minLog - 0);
      var yG = plot.y + plot.h * (Math.max(2 * minLog, logG) - 0) / (2 * minLog - 0);
      ctx.fillStyle = COLORS.householder;
      ctx.fillRect(x - 3, yS, 5, plot.y + plot.h - yS);
      ctx.fillStyle = COLORS.normal;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x + 3, yG, 5, plot.y + plot.h - yG);
      ctx.globalAlpha = 1;
    }
    drawText(ctx, "sigma(A)", plot.x, box.y + box.h - 18, { color: COLORS.householder, size: 10, weight: "800" });
    drawText(ctx, "sigma(A)^2", plot.x + 78, box.y + box.h - 18, { color: COLORS.normal, size: 10, weight: "800" });
    drawText(ctx, "cond(A) " + formatSci(result.condition.condA, 2), plot.x + plot.w, box.y + 24, { align: "right", color: COLORS.text, size: 11, weight: "750" });
    drawText(ctx, "cond(A^T A) " + formatSci(result.condition.condAtA, 2), plot.x + plot.w, box.y + 42, { align: "right", color: COLORS.normal, size: 11, weight: "750" });
    ctx.restore();
  }

  function drawCoefficients(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "coefficient drift", "true coefficients versus computed solution");
    var n = result.data.coeffs.length;
    var values = result.data.coeffs.slice();
    result.methods.forEach(function (row) {
      if (row.coeffs) values = values.concat(row.coeffs);
    });
    var yS = scale(extent(values, 0.12), [box.y + box.h - 34, box.y + 58]);
    var x0 = box.x + 34;
    var w = box.w - 58;
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(x0, yS(0));
    ctx.lineTo(x0 + w, yS(0));
    ctx.stroke();
    for (var i = 0; i < n; i += 1) {
      var x = x0 + w * i / Math.max(1, n - 1);
      ctx.strokeStyle = COLORS.trueLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 7, yS(0));
      ctx.lineTo(x - 7, yS(result.data.coeffs[i]));
      ctx.stroke();
      result.methods.forEach(function (row, j) {
        if (!row.coeffs) return;
        ctx.strokeStyle = row.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 1 + 4 * j, yS(0));
        ctx.lineTo(x - 1 + 4 * j, yS(row.coeffs[i]));
        ctx.stroke();
      });
    }
    drawText(ctx, "degree " + result.params.degree, x0, box.y + box.h - 14, { color: COLORS.muted, size: 10, weight: "650" });
    drawText(ctx, "orthogonality MGS " + formatSci((result.methods[1] || {}).orthogonality, 1), x0 + w, box.y + box.h - 14, { align: "right", color: COLORS.mgs, size: 10, weight: "750" });
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
    drawText(ctx, "Least squares is a factorization choice", 18, 30, { size: 18, weight: "850" });
    drawText(ctx, result.params.rows + " rows, degree " + result.params.degree + ", noise " + formatSci(Math.pow(10, result.params.noiseExp), 0), 18, 52, { color: COLORS.muted, size: 12, weight: "650" });
    drawFit(ctx, result, { x: 18, y: 70, w: 560, h: 304 });
    drawErrors(ctx, result, { x: 596, y: 70, w: 306, h: 304 });
    drawSpectrum(ctx, result, { x: 18, y: 394, w: 430, h: height - 412 });
    drawCoefficients(ctx, result, { x: 470, y: 394, w: 432, h: height - 412 });
  }

  function updateOutputs(root, params) {
    [
      ["rows", params.rows],
      ["degree", params.degree],
      ["cluster", params.cluster + "%"],
      ["noiseExp", "1e" + params.noiseExp.toFixed(0)],
      ["seed", params.seed]
    ].forEach(function (pair) {
      var node = root.querySelector('[data-value="' + pair[0] + '"]');
      if (node) node.textContent = String(pair[1]);
    });
  }

  function render(root) {
    var result = evaluate(paramsFromRoot(root));
    updateOutputs(root, result.params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var normal = result.methods.filter(function (row) { return row.key === "normal"; })[0];
      var mgs = result.methods.filter(function (row) { return row.key === "mgs"; })[0];
      var house = result.methods.filter(function (row) { return row.key === "householder"; })[0];
      metrics.innerHTML = [
        metric("cond(A)", formatSci(result.condition.condA, 2)),
        metric("cond(A^T A)", formatSci(result.condition.condAtA, 2)),
        metric("normal coeff err", formatSci(normal.coefficientError, 2)),
        metric("MGS coeff err", formatSci(mgs.coefficientError, 2)),
        metric("Householder err", formatSci(house.coefficientError, 2)),
        metric("normal digit budget", formatNumber(result.warningDigits, 1))
      ].join("");
    }
    draw(root.querySelector("canvas[data-canvas]"), result);
  }

  function init(root) {
    if (!root || root.__leastSquaresQrReady) return;
    root.__leastSquaresQrReady = true;
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
    var easy = evaluate({ basis: "chebyshev", cluster: 0, degree: 5, noiseExp: -16, rows: 80, seed: 3 });
    easy.methods.forEach(function (row) {
      assert(row.coefficientError < 1e-9, "well-conditioned case should recover coefficients for " + row.key);
      assert(Number.isFinite(row.residual), "finite residual for " + row.key);
    });
    assert(easy.condition.condA < 5, "Chebyshev case should be well conditioned");

    var hard = evaluate({ basis: "raw", cluster: 58, degree: 13, noiseExp: -16, rows: 96, seed: 19 });
    var normal = hard.methods.filter(function (row) { return row.key === "normal"; })[0];
    var house = hard.methods.filter(function (row) { return row.key === "householder"; })[0];
    assert(hard.condition.condAtA > hard.condition.condA * hard.condition.condA * 0.99, "normal equations should square the condition number");
    assert(normal.coefficientError > house.coefficientError * 100 || normal.failed, "normal equations should lose much more than Householder on hard Vandermonde");

    var raw = evaluate({ basis: "raw", cluster: 42, degree: 11, noiseExp: -14, rows: 80, seed: 19 });
    var cheb = evaluate({ basis: "chebyshev", cluster: 42, degree: 11, noiseExp: -14, rows: 80, seed: 19 });
    assert(cheb.condition.condA < raw.condition.condA, "Chebyshev basis should improve conditioning over raw powers");
    [easy, hard, raw, cheb].forEach(function (result) {
      result.methods.forEach(function (row) {
        assert(row.failed || row.coeffs.length === result.params.degree + 1, "coefficient length for " + row.key);
      });
      assert(result.condition.singularValues.length === result.params.degree + 1, "singular value count");
    });

    return {
      chebyshevCond: Number(cheb.condition.condA.toPrecision(4)),
      hard: hard.methods.map(function (row) {
        return [row.key, Number(row.coefficientError.toPrecision(4)), Number(row.residual.toPrecision(4))];
      }),
      rawCond: Number(raw.condition.condA.toPrecision(4))
    };
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    makeData: makeData
  };

  global.LeastSquaresQrLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-least-squares-qr-lab]").forEach(init);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
