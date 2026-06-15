(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    exact: "#0f766e",
    fd: "#2563eb",
    random: "#dc2626",
    sample: "#f59e0b",
    dark: "#0f172a",
    purple: "#7c3aed"
  };

  var DEFAULTS = {
    rows: 800,
    dim: 28,
    sketch: 12,
    rank: 3,
    noise: 18,
    drift: 35,
    seed: 23
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var dim = clamp(Math.round(readNumber(raw, "dim")), 16, 40);
    var sketch = clamp(Math.round(readNumber(raw, "sketch")), 4, Math.min(28, dim - 1));
    var rank = clamp(Math.round(readNumber(raw, "rank")), 2, Math.min(6, sketch - 1));
    return {
      rows: clamp(Math.round(readNumber(raw, "rows") / 50) * 50, 250, 1400),
      dim: dim,
      sketch: sketch,
      rank: rank,
      noise: clamp(Math.round(readNumber(raw, "noise")), 4, 45),
      drift: clamp(Math.round(readNumber(raw, "drift")), 0, 80),
      seed: clamp(Math.round(readNumber(raw, "seed")), 1, 9999)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
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

  function normalSample(rng) {
    var u1 = Math.max(1e-12, rng());
    var u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function zeros(n) {
    return Array.from({ length: n }, function () { return 0; });
  }

  function zeroMatrix(n, m) {
    return Array.from({ length: n }, function () { return zeros(m); });
  }

  function cloneMatrix(a) {
    return a.map(function (row) { return row.slice(); });
  }

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i += 1) s += a[i] * b[i];
    return s;
  }

  function norm(a) {
    return Math.sqrt(Math.max(0, dot(a, a)));
  }

  function addOuter(cov, row) {
    var d = row.length;
    for (var i = 0; i < d; i += 1) {
      var ri = row[i];
      for (var j = 0; j <= i; j += 1) {
        cov[i][j] += ri * row[j];
        if (i !== j) cov[j][i] = cov[i][j];
      }
    }
  }

  function covariance(rows, dim) {
    var cov = zeroMatrix(dim, dim);
    rows.forEach(function (row) { addOuter(cov, row); });
    return cov;
  }

  function subtract(a, b) {
    var n = a.length;
    var out = zeroMatrix(n, n);
    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j < n; j += 1) out[i][j] = a[i][j] - b[i][j];
    }
    return out;
  }

  function matrixVector(a, v) {
    var out = zeros(a.length);
    for (var i = 0; i < a.length; i += 1) {
      var s = 0;
      for (var j = 0; j < v.length; j += 1) s += a[i][j] * v[j];
      out[i] = s;
    }
    return out;
  }

  function trace(a) {
    var s = 0;
    for (var i = 0; i < a.length; i += 1) s += a[i][i];
    return s;
  }

  function jacobiEigen(input) {
    var n = input.length;
    var a = cloneMatrix(input);
    var v = zeroMatrix(n, n);
    for (var i = 0; i < n; i += 1) v[i][i] = 1;
    var maxSweeps = Math.max(80, n * n * 4);
    for (var sweep = 0; sweep < maxSweeps; sweep += 1) {
      var p = 0;
      var q = 1;
      var max = 0;
      for (var r = 0; r < n; r += 1) {
        for (var c = r + 1; c < n; c += 1) {
          var val = Math.abs(a[r][c]);
          if (val > max) {
            max = val;
            p = r;
            q = c;
          }
        }
      }
      if (max < 1e-9) break;
      var app = a[p][p];
      var aqq = a[q][q];
      var apq = a[p][q];
      var tau = (aqq - app) / (2 * apq);
      var t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      var cs = 1 / Math.sqrt(1 + t * t);
      var sn = t * cs;
      for (var k = 0; k < n; k += 1) {
        if (k !== p && k !== q) {
          var akp = a[k][p];
          var akq = a[k][q];
          a[k][p] = cs * akp - sn * akq;
          a[p][k] = a[k][p];
          a[k][q] = sn * akp + cs * akq;
          a[q][k] = a[k][q];
        }
      }
      a[p][p] = cs * cs * app - 2 * sn * cs * apq + sn * sn * aqq;
      a[q][q] = sn * sn * app + 2 * sn * cs * apq + cs * cs * aqq;
      a[p][q] = 0;
      a[q][p] = 0;
      for (var row = 0; row < n; row += 1) {
        var vip = v[row][p];
        var viq = v[row][q];
        v[row][p] = cs * vip - sn * viq;
        v[row][q] = sn * vip + cs * viq;
      }
    }
    var pairs = [];
    for (var idx = 0; idx < n; idx += 1) {
      var vector = zeros(n);
      for (var rr = 0; rr < n; rr += 1) vector[rr] = v[rr][idx];
      pairs.push({ value: a[idx][idx], vector: vector });
    }
    pairs.sort(function (x, y) { return y.value - x.value; });
    return pairs;
  }

  function spectralNorm(a) {
    var eig = jacobiEigen(a);
    var max = 0;
    eig.forEach(function (row) {
      max = Math.max(max, Math.abs(row.value));
    });
    return max;
  }

  function gramSchmidt(vectors, dim) {
    var basis = [];
    vectors.forEach(function (candidate) {
      var v = candidate.slice();
      basis.forEach(function (b) {
        var projection = dot(v, b);
        for (var i = 0; i < dim; i += 1) v[i] -= projection * b[i];
      });
      var n = norm(v);
      if (n > 1e-8) basis.push(v.map(function (x) { return x / n; }));
    });
    return basis;
  }

  function randomBasis(dim, count, rng) {
    var raw = [];
    for (var k = 0; k < count; k += 1) {
      var row = zeros(dim);
      for (var i = 0; i < dim; i += 1) row[i] = normalSample(rng);
      raw.push(row);
    }
    return gramSchmidt(raw, dim);
  }

  function generateRows(params) {
    var rng = makeRng(params.seed);
    var basis = randomBasis(params.dim, Math.max(params.rank + 3, 8), rng);
    var rows = [];
    var drift = params.drift / 100;
    var noise = params.noise / 100;
    var strengths = [];
    for (var k = 0; k < params.rank; k += 1) strengths.push(3.6 / Math.pow(k + 1, 0.72));
    for (var r = 0; r < params.rows; r += 1) {
      var t = r / Math.max(1, params.rows - 1);
      var row = zeros(params.dim);
      for (var j = 0; j < params.rank; j += 1) {
        var seasonal = j === 0 ? (1 + drift * (t - 0.5)) : (1 + 0.22 * Math.sin(2 * Math.PI * t * (j + 1)));
        var coeff = strengths[j] * seasonal * normalSample(rng);
        for (var c = 0; c < params.dim; c += 1) row[c] += coeff * basis[j][c];
      }
      if (drift > 0) {
        var late = Math.max(0, (t - 0.55) / 0.45);
        var coeffDrift = 2.5 * drift * late * normalSample(rng);
        for (var dc = 0; dc < params.dim; dc += 1) row[dc] += coeffDrift * basis[params.rank][dc];
      }
      for (var n = 0; n < params.dim; n += 1) row[n] += noise * normalSample(rng);
      rows.push(row);
    }
    return rows;
  }

  function compressFD(rows, ell, dim) {
    var cov = covariance(rows, dim);
    var eig = jacobiEigen(cov).filter(function (row) { return row.value > 1e-10; });
    if (!eig.length) return [];
    var delta = eig[Math.min(ell - 1, eig.length - 1)].value;
    var out = [];
    for (var i = 0; i < Math.min(ell, eig.length); i += 1) {
      var shrunk = Math.max(0, eig[i].value - delta);
      if (shrunk > 1e-10) out.push(eig[i].vector.map(function (x) { return Math.sqrt(shrunk) * x; }));
    }
    return out;
  }

  function runFD(rows, ell, dim, checkpoints) {
    var sketchRows = [];
    var prefixCov = zeroMatrix(dim, dim);
    var traceRows = [];
    var cpIndex = 0;
    var shrinkCount = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      sketchRows.push(row.slice());
      addOuter(prefixCov, row);
      if (sketchRows.length >= 2 * ell) {
        sketchRows = compressFD(sketchRows, ell, dim);
        shrinkCount += 1;
      }
      while (cpIndex < checkpoints.length && i + 1 >= checkpoints[cpIndex]) {
        var sketchCov = covariance(sketchRows, dim);
        traceRows.push({
          rows: i + 1,
          error: spectralNorm(subtract(prefixCov, sketchCov)),
          energy: trace(sketchCov),
          shrinks: shrinkCount
        });
        cpIndex += 1;
      }
    }
    while (sketchRows.length > ell) {
      sketchRows = compressFD(sketchRows, ell, dim);
      shrinkCount += 1;
    }
    return {
      rows: sketchRows,
      cov: covariance(sketchRows, dim),
      trace: traceRows,
      shrinks: shrinkCount
    };
  }

  function runCountSketch(rows, ell, dim, seed) {
    var rng = makeRng(seed + 8191);
    var sketch = zeroMatrix(ell, dim);
    rows.forEach(function (row) {
      var bucket = Math.floor(rng() * ell);
      var sign = rng() < 0.5 ? -1 : 1;
      for (var j = 0; j < dim; j += 1) sketch[bucket][j] += sign * row[j];
    });
    return {
      rows: sketch,
      cov: covariance(sketch, dim)
    };
  }

  function runUniformSample(rows, ell, dim, seed) {
    var rng = makeRng(seed + 4093);
    var sample = [];
    rows.forEach(function (row, i) {
      if (sample.length < ell) sample.push(row.slice());
      else {
        var j = Math.floor(rng() * (i + 1));
        if (j < ell) sample[j] = row.slice();
      }
    });
    var scale = Math.sqrt(rows.length / Math.max(1, ell));
    var scaled = sample.map(function (row) { return row.map(function (x) { return scale * x; }); });
    return {
      rows: scaled,
      cov: covariance(scaled, dim)
    };
  }

  function topEnergy(cov, vectors, k) {
    var total = 0;
    for (var i = 0; i < k; i += 1) {
      var v = vectors[i].vector;
      total += dot(v, matrixVector(cov, v));
    }
    return total;
  }

  function subspaceAlignment(exactEig, sketchEig, k) {
    var total = 0;
    for (var i = 0; i < k; i += 1) {
      for (var j = 0; j < k; j += 1) {
        var d = dot(exactEig[i].vector, sketchEig[j].vector);
        total += d * d;
      }
    }
    return total / k;
  }

  function evaluateSketch(exactCov, exactEig, sketchCov, k) {
    var eig = jacobiEigen(sketchCov);
    var opt = 0;
    for (var i = 0; i < k; i += 1) opt += Math.max(0, exactEig[i].value);
    var captured = topEnergy(exactCov, eig, k);
    return {
      eig: eig,
      spectralError: spectralNorm(subtract(exactCov, sketchCov)),
      captured: captured,
      capturedRatio: opt > 0 ? captured / opt : 0,
      alignment: subspaceAlignment(exactEig, eig, k)
    };
  }

  function sketchRowsSweep(rows, dim, k, seed) {
    var out = [];
    var exactCov = covariance(rows, dim);
    var exactEig = jacobiEigen(exactCov);
    var minEll = Math.max(k + 1, 4);
    var maxEll = Math.min(28, dim - 1);
    for (var ell = minEll; ell <= maxEll; ell += 2) {
      var checkpoints = [rows.length];
      var fd = runFD(rows, ell, dim, checkpoints);
      var random = runCountSketch(rows, ell, dim, seed + ell * 17);
      out.push({
        ell: ell,
        fd: evaluateSketch(exactCov, exactEig, fd.cov, k).spectralError,
        random: evaluateSketch(exactCov, exactEig, random.cov, k).spectralError
      });
    }
    return out;
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var rows = generateRows(params);
    var exactCov = covariance(rows, params.dim);
    var exactEig = jacobiEigen(exactCov);
    var checkpoints = [];
    for (var c = 1; c <= 28; c += 1) checkpoints.push(Math.max(1, Math.round(params.rows * c / 28)));
    var fd = runFD(rows, params.sketch, params.dim, checkpoints);
    var random = runCountSketch(rows, params.sketch, params.dim, params.seed);
    var sample = runUniformSample(rows, params.sketch, params.dim, params.seed);
    var fdEval = evaluateSketch(exactCov, exactEig, fd.cov, params.rank);
    var randomEval = evaluateSketch(exactCov, exactEig, random.cov, params.rank);
    var sampleEval = evaluateSketch(exactCov, exactEig, sample.cov, params.rank);
    var tail = 0;
    for (var i = params.rank; i < exactEig.length; i += 1) tail += Math.max(0, exactEig[i].value);
    var bound = tail / Math.max(1, params.sketch - params.rank);
    var curves = sketchRowsSweep(rows, params.dim, params.rank, params.seed);
    var checks = {
      finite: [fdEval.spectralError, randomEval.spectralError, sampleEval.spectralError, bound].every(Number.isFinite),
      fdBound: fdEval.spectralError <= bound + Math.max(1e-7, bound * 0.18),
      energyBounded: [fdEval, randomEval, sampleEval].every(function (row) { return row.capturedRatio >= -1e-8 && row.capturedRatio <= 1.0001; }),
      alignmentBounded: [fdEval, randomEval, sampleEval].every(function (row) { return row.alignment >= -1e-8 && row.alignment <= 1.0001; }),
      sketchSize: fd.rows.length <= params.sketch,
      spectrumSorted: exactEig.every(function (row, i) { return i === 0 || exactEig[i - 1].value >= row.value - 1e-8; })
    };
    return {
      params: params,
      rows: rows,
      exactCov: exactCov,
      exactEig: exactEig,
      fd: fd,
      random: random,
      sample: sample,
      evaluations: {
        fd: fdEval,
        random: randomEval,
        sample: sampleEval
      },
      curves: curves,
      summary: {
        fdError: fdEval.spectralError,
        randomError: randomEval.spectralError,
        sampleError: sampleEval.spectralError,
        fdCaptured: fdEval.capturedRatio,
        randomCaptured: randomEval.capturedRatio,
        sampleCaptured: sampleEval.capturedRatio,
        fdAlignment: fdEval.alignment,
        randomAlignment: randomEval.alignment,
        sampleAlignment: sampleEval.alignment,
        fdBound: bound,
        tailEnergy: tail,
        totalEnergy: trace(exactCov),
        shrinks: fd.shrinks
      },
      checks: checks
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(digits == null ? 1 : digits);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    return formatNumber(100 * value, digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="fd-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function syncOutputs(root, result) {
    var p = result.params;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      rows: p.rows,
      dim: p.dim,
      sketch: p.sketch,
      rank: p.rank,
      noise: formatNumber(p.noise / 100, 2),
      drift: formatPercent(p.drift / 100, 0),
      seed: p.seed
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (values[key] != null) output.textContent = values[key];
    });
  }

  function renderMetrics(root, result) {
    var target = root.querySelector("[data-metrics]");
    if (!target) return;
    var audit = Object.keys(result.checks).every(function (key) { return result.checks[key]; }) ? "passed" : "check";
    target.innerHTML = [
      metric("FD error", formatNumber(result.summary.fdError, 2)),
      metric("Random error", formatNumber(result.summary.randomError, 2)),
      metric("FD bound", formatNumber(result.summary.fdBound, 2)),
      metric("FD top-k", formatPercent(result.summary.fdCaptured, 0)),
      metric("Shrinks", String(result.summary.shrinks)),
      metric("Audit", audit)
    ].join("");
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 560 ? 1160 : 780;
    var ratio = Math.min(2, global.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssWidth * ratio) || canvas.height !== Math.round(cssHeight * ratio)) {
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      canvas.style.height = cssHeight + "px";
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var trimmed = text;
    while (trimmed.length > 4 && ctx.measureText(trimmed + "...").width > maxWidth) trimmed = trimmed.slice(0, -1);
    return trimmed.trim() + "...";
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, rect.x + 14, rect.y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(fitText(ctx, subtitle, rect.w - 28), rect.x + 14, rect.y + 42);
    }
  }

  function axes(ctx, plot) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
  }

  function drawLine(ctx, rows, sx, sy, key, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = sx(row);
      var y = sy(row[key]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawSpectrum(ctx, rect, result) {
    panel(ctx, rect, "Covariance spectrum", "exact stream versus the two sketches");
    var plot = { x: rect.x + 42, y: rect.y + 62, w: rect.w - 62, h: rect.h - 98 };
    var n = Math.min(16, result.params.dim);
    var exact = result.exactEig.slice(0, n).map(function (row, i) { return { i: i + 1, value: Math.max(0, row.value) }; });
    var fd = result.evaluations.fd.eig.slice(0, n).map(function (row, i) { return { i: i + 1, value: Math.max(0, row.value) }; });
    var random = result.evaluations.random.eig.slice(0, n).map(function (row, i) { return { i: i + 1, value: Math.max(0, row.value) }; });
    var maxY = Math.max.apply(null, exact.map(function (row) { return row.value; })) * 1.08;
    function sx(row) { return plot.x + (row.i - 1) / (n - 1) * plot.w; }
    function sy(value) { return plot.y + plot.h * (1 - value / maxY); }
    axes(ctx, plot);
    drawLine(ctx, exact, sx, sy, "value", COLORS.exact, 2.4);
    drawLine(ctx, fd, sx, sy, "value", COLORS.fd, 2);
    drawLine(ctx, random, sx, sy, "value", COLORS.random, 1.8);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("component", plot.x + plot.w - 68, plot.y + plot.h + 22);
  }

  function drawErrorBars(ctx, rect, result) {
    panel(ctx, rect, "Sketch error", "spectral norm of A'A - B'B");
    var plot = { x: rect.x + 48, y: rect.y + 64, w: rect.w - 70, h: rect.h - 102 };
    var rows = [
      { name: "FD", value: result.summary.fdError, color: COLORS.fd },
      { name: "Count", value: result.summary.randomError, color: COLORS.random },
      { name: "sample", value: result.summary.sampleError, color: COLORS.sample },
      { name: "bound", value: result.summary.fdBound, color: COLORS.exact }
    ];
    var maxY = Math.max.apply(null, rows.map(function (row) { return row.value; })) * 1.12;
    axes(ctx, plot);
    rows.forEach(function (row, i) {
      var bw = plot.w / 7;
      var x = plot.x + plot.w * (0.08 + 0.23 * i);
      var y = plot.y + plot.h * (1 - row.value / maxY);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, y, bw, plot.y + plot.h - y);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.fillText(row.name, x, plot.y + plot.h + 22);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(formatNumber(row.value, 1), x, y - 7);
    });
  }

  function drawCurves(ctx, rect, result) {
    panel(ctx, rect, "Space-error curve", "more rows buy a smaller covariance error");
    var plot = { x: rect.x + 46, y: rect.y + 62, w: rect.w - 66, h: rect.h - 98 };
    var rows = result.curves;
    var maxY = Math.max.apply(null, rows.map(function (row) { return Math.max(row.fd, row.random); })) * 1.08;
    function sx(row) { return plot.x + (row.ell - rows[0].ell) / (rows[rows.length - 1].ell - rows[0].ell) * plot.w; }
    function sy(value) { return plot.y + plot.h * (1 - value / maxY); }
    axes(ctx, plot);
    drawLine(ctx, rows, sx, sy, "random", COLORS.random, 1.8);
    drawLine(ctx, rows, sx, sy, "fd", COLORS.fd, 2.4);
    var selected = { ell: result.params.sketch };
    var selectedX = sx(selected);
    ctx.strokeStyle = COLORS.dark;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(selectedX, plot.y);
    ctx.lineTo(selectedX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("sketch rows", plot.x + plot.w - 72, plot.y + plot.h + 22);
  }

  function drawEnergy(ctx, rect, result) {
    panel(ctx, rect, "Top-k row space", "energy captured by the sketch's first k directions");
    var plot = { x: rect.x + 48, y: rect.y + 64, w: rect.w - 70, h: rect.h - 102 };
    var rows = [
      { name: "FD", value: result.summary.fdCaptured, align: result.summary.fdAlignment, color: COLORS.fd },
      { name: "Count", value: result.summary.randomCaptured, align: result.summary.randomAlignment, color: COLORS.random },
      { name: "sample", value: result.summary.sampleCaptured, align: result.summary.sampleAlignment, color: COLORS.sample }
    ];
    axes(ctx, plot);
    rows.forEach(function (row, i) {
      var bw = plot.w / 7;
      var x = plot.x + plot.w * (0.12 + 0.29 * i);
      var y = plot.y + plot.h * (1 - row.value);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, y, bw, plot.y + plot.h - y);
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 2;
      var ya = plot.y + plot.h * (1 - row.align);
      ctx.beginPath();
      ctx.moveTo(x - 3, ya);
      ctx.lineTo(x + bw + 3, ya);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.fillText(row.name, x, plot.y + plot.h + 22);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(formatPercent(row.value, 0), x, y - 7);
    });
  }

  function drawLegend(ctx, x, y) {
    var items = [
      ["exact", COLORS.exact],
      ["Frequent Directions", COLORS.fd],
      ["CountSketch", COLORS.random],
      ["sample", COLORS.sample]
    ];
    ctx.font = "12px system-ui, sans-serif";
    items.forEach(function (item, i) {
      var ox = x + i * 118;
      ctx.fillStyle = item[1];
      ctx.beginPath();
      ctx.arc(ox, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(item[0], ox + 8, y);
    });
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    var width = frame.width;
    var height = frame.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);
    var pad = 14;
    if (width < 560) {
      drawSpectrum(ctx, { x: pad, y: pad, w: width - pad * 2, h: 286 }, result);
      drawErrorBars(ctx, { x: pad, y: 316, w: width - pad * 2, h: 250 }, result);
      drawCurves(ctx, { x: pad, y: 582, w: width - pad * 2, h: 250 }, result);
      drawEnergy(ctx, { x: pad, y: 848, w: width - pad * 2, h: height - 862 }, result);
      drawLegend(ctx, pad + 18, height - 18);
    } else {
      var colW = (width - pad * 3) / 2;
      drawSpectrum(ctx, { x: pad, y: pad, w: colW, h: 370 }, result);
      drawErrorBars(ctx, { x: pad * 2 + colW, y: pad, w: colW, h: 370 }, result);
      drawCurves(ctx, { x: pad, y: 402, w: colW, h: height - 416 }, result);
      drawEnergy(ctx, { x: pad * 2 + colW, y: 402, w: colW, h: height - 416 }, result);
      drawLegend(ctx, pad + 18, height - 18);
    }
  }

  function render(root) {
    var result = simulate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__fdResult = result;
  }

  function init(root) {
    if (!root || root.__fdReady) return;
    root.__fdReady = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    var resizeTimer = null;
    global.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(root); }, 120);
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-fd-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    simulate: simulate,
    jacobiEigen: jacobiEigen,
    spectralNorm: spectralNorm,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.FrequentDirectionsLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
