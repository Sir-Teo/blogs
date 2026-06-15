(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    exact: "#172026",
    jacobi: "#b45309",
    multi: "#0f766e",
    smooth: "#2563eb",
    coarse: "#7c3aed",
    warn: "#be123c"
  };

  var SHAPES = [
    { label: "mixed modes" },
    { label: "smooth load" },
    { label: "rough load" },
    { label: "boundary layer" }
  ];

  var DEFAULTS = {
    level: 7,
    omega: 67,
    smooth: 2,
    cycles: 6,
    shape: 0
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      level: clamp(Math.round(Number(raw.level == null ? DEFAULTS.level : raw.level)), 5, 8),
      omega: clamp(Math.round(Number(raw.omega == null ? DEFAULTS.omega : raw.omega)), 45, 85) / 100,
      smooth: clamp(Math.round(Number(raw.smooth == null ? DEFAULTS.smooth : raw.smooth)), 1, 4),
      cycles: clamp(Math.round(Number(raw.cycles == null ? DEFAULTS.cycles : raw.cycles)), 1, 10),
      shape: clamp(Math.round(Number(raw.shape == null ? DEFAULTS.shape : raw.shape)), 0, SHAPES.length - 1)
    };
  }

  function sizeFromLevel(level) {
    return Math.pow(2, level) - 1;
  }

  function zeros(n) {
    var out = [];
    for (var i = 0; i < n; i += 1) out.push(0);
    return out;
  }

  function clone(a) {
    return a.slice();
  }

  function norm2(a) {
    var s = 0;
    for (var i = 0; i < a.length; i += 1) s += a[i] * a[i];
    return Math.sqrt(s);
  }

  function maxAbs(a) {
    var m = 0;
    for (var i = 0; i < a.length; i += 1) m = Math.max(m, Math.abs(a[i]));
    return m;
  }

  function applyA(u, h) {
    var n = u.length;
    var inv = 1 / (h * h);
    var out = zeros(n);
    for (var i = 0; i < n; i += 1) {
      var left = i > 0 ? u[i - 1] : 0;
      var right = i + 1 < n ? u[i + 1] : 0;
      out[i] = (2 * u[i] - left - right) * inv;
    }
    return out;
  }

  function residual(u, f, h) {
    var au = applyA(u, h);
    var r = zeros(u.length);
    for (var i = 0; i < u.length; i += 1) r[i] = f[i] - au[i];
    return r;
  }

  function weightedJacobiInPlace(u, f, h, omega, sweeps) {
    var n = u.length;
    var invDiag = 0.5 * h * h;
    for (var s = 0; s < sweeps; s += 1) {
      var au = applyA(u, h);
      var next = zeros(n);
      for (var i = 0; i < n; i += 1) next[i] = u[i] + omega * (f[i] - au[i]) * invDiag;
      for (var j = 0; j < n; j += 1) u[j] = next[j];
    }
    return u;
  }

  function directSolve(f, h) {
    var n = f.length;
    var diag = 2 / (h * h);
    var off = -1 / (h * h);
    var c = zeros(n);
    var d = zeros(n);
    c[0] = off / diag;
    d[0] = f[0] / diag;
    for (var i = 1; i < n; i += 1) {
      var denom = diag - off * c[i - 1];
      c[i] = i + 1 < n ? off / denom : 0;
      d[i] = (f[i] - off * d[i - 1]) / denom;
    }
    var x = zeros(n);
    x[n - 1] = d[n - 1];
    for (var j = n - 2; j >= 0; j -= 1) x[j] = d[j] - c[j] * x[j + 1];
    return x;
  }

  function restrictFullWeighting(fine) {
    var n = fine.length;
    var m = (n - 1) / 2;
    var coarse = zeros(m);
    for (var j = 0; j < m; j += 1) {
      var center = 2 * j + 1;
      var left = center - 1 >= 0 ? fine[center - 1] : 0;
      var right = center + 1 < n ? fine[center + 1] : 0;
      coarse[j] = 0.25 * left + 0.5 * fine[center] + 0.25 * right;
    }
    return coarse;
  }

  function prolongLinear(coarse) {
    var m = coarse.length;
    var n = 2 * m + 1;
    var fine = zeros(n);
    for (var j = 0; j < m; j += 1) fine[2 * j + 1] = coarse[j];
    fine[0] = 0.5 * coarse[0];
    for (var i = 2; i < n - 1; i += 2) {
      var c = i / 2;
      fine[i] = 0.5 * (coarse[c - 1] + coarse[c]);
    }
    fine[n - 1] = 0.5 * coarse[m - 1];
    return fine;
  }

  function makeProblem(params) {
    var n = sizeFromLevel(params.level);
    var h = 1 / (n + 1);
    var u = zeros(n);
    for (var i = 0; i < n; i += 1) {
      var x = (i + 1) * h;
      if (params.shape === 1) {
        u[i] = Math.sin(Math.PI * x) + 0.28 * Math.sin(2 * Math.PI * x);
      } else if (params.shape === 2) {
        u[i] = 0.75 * Math.sin(Math.PI * x) + 0.22 * Math.sin(9 * Math.PI * x) + 0.10 * Math.sin(31 * Math.PI * x);
      } else if (params.shape === 3) {
        var bump = Math.exp(-58 * Math.pow(x - 0.28, 2));
        u[i] = 4.2 * x * (1 - x) * bump + 0.18 * Math.sin(5 * Math.PI * x);
      } else {
        u[i] = Math.sin(Math.PI * x) + 0.30 * Math.sin(4 * Math.PI * x) + 0.10 * Math.sin(17 * Math.PI * x);
      }
    }
    var scale = maxAbs(u) || 1;
    for (var j = 0; j < n; j += 1) u[j] /= scale;
    return {
      n: n,
      h: h,
      exact: u,
      f: applyA(u, h),
      shapeLabel: SHAPES[params.shape].label
    };
  }

  function error(u, exact) {
    var e = zeros(u.length);
    for (var i = 0; i < u.length; i += 1) e[i] = u[i] - exact[i];
    return e;
  }

  function sineCoefficients(e, maxModes) {
    var n = e.length;
    var limit = Math.min(maxModes || 32, n);
    var coeffs = [];
    var scale = Math.sqrt(2 / (n + 1));
    for (var k = 1; k <= limit; k += 1) {
      var c = 0;
      for (var i = 0; i < n; i += 1) c += e[i] * Math.sin(Math.PI * k * (i + 1) / (n + 1));
      coeffs.push(Math.abs(c * scale));
    }
    return coeffs;
  }

  function highModeSmoothingFactor(n, omega, sweeps) {
    var h = 1 / (n + 1);
    var u = zeros(n);
    var f = zeros(n);
    for (var i = 0; i < n; i += 1) u[i] = Math.sin(Math.PI * n * (i + 1) / (n + 1));
    var before = norm2(u) || 1;
    weightedJacobiInPlace(u, f, h, omega, sweeps);
    return Math.pow(norm2(u) / before, 2);
  }

  function bandEnergy(e, startK, endK) {
    var n = e.length;
    var s = 0;
    var scale = Math.sqrt(2 / (n + 1));
    for (var k = startK; k <= endK; k += 1) {
      var c = 0;
      for (var i = 0; i < n; i += 1) c += e[i] * Math.sin(Math.PI * k * (i + 1) / (n + 1));
      c *= scale;
      s += c * c;
    }
    return s;
  }

  function restrictCascade(vec) {
    var levels = [{ n: vec.length, norm: norm2(vec), values: vec }];
    var cur = vec;
    while (cur.length > 3) {
      cur = restrictFullWeighting(cur);
      levels.push({ n: cur.length, norm: norm2(cur), values: cur });
    }
    return levels;
  }

  function vCycle(u, f, h, params, stats, depth) {
    var n = u.length;
    depth = depth || 0;
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    stats.work += n * (2 * params.smooth);
    if (n <= 3) {
      stats.directSolves += 1;
      stats.work += n;
      return directSolve(f, h);
    }
    weightedJacobiInPlace(u, f, h, params.omega, params.smooth);
    var r = residual(u, f, h);
    if (depth === 0) stats.restrictedResiduals = restrictCascade(r);
    var rc = restrictFullWeighting(r);
    var ec = vCycle(zeros(rc.length), rc, 2 * h, params, stats, depth + 1);
    var ef = prolongLinear(ec);
    for (var i = 0; i < n; i += 1) u[i] += ef[i];
    weightedJacobiInPlace(u, f, h, params.omega, params.smooth);
    return u;
  }

  function runJacobi(problem, params, sweeps) {
    var u = zeros(problem.n);
    var initial = norm2(residual(u, problem.f, problem.h));
    var history = [{ work: 0, residual: 1 }];
    for (var s = 0; s < sweeps; s += 1) {
      weightedJacobiInPlace(u, problem.f, problem.h, params.omega, 1);
      history.push({ work: s + 1, residual: norm2(residual(u, problem.f, problem.h)) / initial });
    }
    return { u: u, history: history };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var problem = makeProblem(params);
    var u = zeros(problem.n);
    var initialResidual = norm2(residual(u, problem.f, problem.h));
    var initialError = error(u, problem.exact);

    var smoothOnly = zeros(problem.n);
    weightedJacobiInPlace(smoothOnly, problem.f, problem.h, params.omega, params.smooth);
    var smoothError = error(smoothOnly, problem.exact);

    var stats = { work: 0, maxDepth: 0, directSolves: 0, restrictedResiduals: [] };
    var mgHistory = [{ work: 0, residual: 1 }];
    var firstCycle = null;
    for (var c = 0; c < params.cycles; c += 1) {
      vCycle(u, problem.f, problem.h, params, stats, 0);
      if (c === 0) firstCycle = clone(u);
      mgHistory.push({
        work: stats.work / problem.n,
        residual: norm2(residual(u, problem.f, problem.h)) / initialResidual
      });
    }
    var jacobiSweeps = Math.max(1, Math.round(stats.work / problem.n));
    var jacobi = runJacobi(problem, params, jacobiSweeps);
    var finalError = error(u, problem.exact);
    var jacobiError = error(jacobi.u, problem.exact);
    var firstCycleError = error(firstCycle || u, problem.exact);

    var lowEnd = Math.min(6, problem.n);
    var smoothLow = bandEnergy(smoothError, 1, lowEnd) || 1e-30;
    var firstLow = bandEnergy(firstCycleError, 1, lowEnd);

    var direct = directSolve(problem.f, problem.h);
    var directError = error(direct, problem.exact);

    var result = {
      params: params,
      problem: problem,
      initialResidual: initialResidual,
      mg: {
        u: u,
        history: mgHistory,
        residual: mgHistory[mgHistory.length - 1].residual,
        errorNorm: norm2(finalError) / Math.max(1e-30, norm2(initialError)),
        firstCycle: firstCycle,
        stats: stats
      },
      jacobi: {
        u: jacobi.u,
        history: jacobi.history,
        sweeps: jacobiSweeps,
        residual: jacobi.history[jacobi.history.length - 1].residual,
        errorNorm: norm2(jacobiError) / Math.max(1e-30, norm2(initialError))
      },
      spectra: {
        initial: sineCoefficients(initialError, 32),
        smooth: sineCoefficients(smoothError, 32),
        multigrid: sineCoefficients(firstCycleError, 32)
      },
      diagnostics: {
        highFrequencyAfterSmoothing: highModeSmoothingFactor(problem.n, params.omega, params.smooth),
        lowFrequencyAfterCoarseCorrection: firstLow / smoothLow,
        directError: norm2(directError),
        workUnits: stats.work / problem.n,
        levels: restrictCascade(problem.f).map(function (row) { return row.n; })
      }
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var finite = isFinite(result.mg.residual) && isFinite(result.jacobi.residual) && isFinite(result.diagnostics.directError);
    var directOk = result.diagnostics.directError < 1e-9;
    var residualOk = result.mg.residual < 0.08 && result.mg.residual < result.jacobi.residual;
    var smootherOk = result.diagnostics.highFrequencyAfterSmoothing < 0.55;
    var coarseOk = result.diagnostics.lowFrequencyAfterCoarseCorrection < 0.75;
    var levelsOk = result.diagnostics.levels.every(function (n, i, arr) {
      return i === 0 || arr[i - 1] === 2 * n + 1;
    });
    return {
      passed: finite && directOk && residualOk && smootherOk && coarseOk && levelsOk,
      finite: finite,
      directOk: directOk,
      residualOk: residualOk,
      smootherOk: smootherOk,
      coarseOk: coarseOk,
      levelsOk: levelsOk
    };
  }

  function auditGrid() {
    var total = 0;
    var passed = 0;
    var failures = [];
    [5, 6, 7].forEach(function (level) {
      [0, 1, 2, 3].forEach(function (shape) {
        [60, 67, 75].forEach(function (omega) {
          total += 1;
          var result = evaluate({ level: level, shape: shape, omega: omega, smooth: 2, cycles: 5 });
          if (result.audit.passed) passed += 1;
          else failures.push({ level: level, shape: shape, omega: omega, audit: result.audit, mg: result.mg.residual, jacobi: result.jacobi.residual });
        });
      });
    });
    var defaults = evaluate(DEFAULTS);
    return {
      total: total,
      passed: passed,
      failures: failures.slice(0, 5),
      defaultPassed: defaults.audit.passed,
      defaultResidual: defaults.mg.residual,
      defaultJacobiResidual: defaults.jacobi.residual
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) > 0 && Math.abs(value) < 0.001) return value.toExponential(2);
    return Number(value).toLocaleString("en-US", {
      maximumFractionDigits: digits == null ? 3 : digits,
      minimumFractionDigits: digits == null ? 0 : digits
    });
  }

  function formatPercent(value, digits) {
    return formatNumber(100 * value, digits == null ? 1 : digits) + "%";
  }

  function metric(labelText, value) {
    return '<div class="multigrid-lab__metric"><span>' + labelText + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 900);
    var height = width < 620 ? 1040 : 780;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function label(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.muted;
    ctx.font = (opts.weight || "650") + " " + (opts.size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "middle";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, box.x + 14, box.y + 17, { color: COLORS.text, size: 13, weight: "780" });
    label(ctx, subtitle, box.x + 14, box.y + 36, { color: COLORS.muted, size: 11, weight: "600" });
  }

  function plotFrame(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    for (var g = 1; g < 4; g += 1) {
      var y = plot.y + plot.h * g / 4;
      ctx.strokeStyle = "rgba(100,116,139,0.15)";
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawSeries(ctx, points, plot, yMin, yMax, color, lineWidth) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth || 2;
    ctx.beginPath();
    points.forEach(function (p, i) {
      var x = plot.x + p.x * plot.w;
      var y = plot.y + plot.h - (p.y - yMin) / (yMax - yMin || 1) * plot.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawSolution(ctx, box, result) {
    panel(ctx, box, "solution error", "V-cycles remove smooth error that Jacobi barely moves");
    var plot = { x: box.x + 36, y: box.y + 62, w: box.w - 56, h: box.h - 96 };
    plotFrame(ctx, plot);
    var n = result.problem.n;
    function toPoints(values) {
      return values.map(function (v, i) { return { x: (i + 1) / (n + 1), y: v }; });
    }
    var e0 = error(zeros(n), result.problem.exact);
    var ej = error(result.jacobi.u, result.problem.exact);
    var em = error(result.mg.u, result.problem.exact);
    var all = e0.concat(ej).concat(em);
    var lim = Math.max(0.05, maxAbs(all));
    drawSeries(ctx, toPoints(e0), plot, -lim, lim, "rgba(23,32,38,0.26)", 1.2);
    drawSeries(ctx, toPoints(ej), plot, -lim, lim, COLORS.jacobi, 1.8);
    drawSeries(ctx, toPoints(em), plot, -lim, lim, COLORS.multi, 2.2);
    label(ctx, "initial", plot.x + 6, plot.y + 14, { color: COLORS.muted, size: 10 });
    label(ctx, "Jacobi", plot.x + 66, plot.y + 14, { color: COLORS.jacobi, size: 10, weight: "780" });
    label(ctx, "multigrid", plot.x + 126, plot.y + 14, { color: COLORS.multi, size: 10, weight: "780" });
    label(ctx, "0", plot.x - 8, plot.y + plot.h / 2, { align: "right", color: COLORS.muted, size: 9 });
  }

  function drawResidual(ctx, box, result) {
    panel(ctx, box, "residual per work", "one work unit is one fine-grid Jacobi sweep");
    var plot = { x: box.x + 48, y: box.y + 64, w: box.w - 70, h: box.h - 98 };
    plotFrame(ctx, plot);
    var maxWork = Math.max(result.jacobi.history[result.jacobi.history.length - 1].work, result.mg.history[result.mg.history.length - 1].work);
    function mapRows(rows) {
      return rows.map(function (row) {
        return { x: row.work / maxWork, y: Math.log10(Math.max(row.residual, 1e-8)) };
      });
    }
    drawSeries(ctx, mapRows(result.jacobi.history), plot, -8, 0, COLORS.jacobi, 1.8);
    drawSeries(ctx, mapRows(result.mg.history), plot, -8, 0, COLORS.multi, 2.4);
    result.mg.history.forEach(function (row) {
      var x = plot.x + row.work / maxWork * plot.w;
      var y = plot.y + plot.h - (Math.log10(Math.max(row.residual, 1e-8)) + 8) / 8 * plot.h;
      ctx.fillStyle = COLORS.multi;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    [-8, -6, -4, -2, 0].forEach(function (p) {
      var y = plot.y + plot.h - (p + 8) / 8 * plot.h;
      label(ctx, "1e" + p, plot.x - 8, y, { align: "right", color: COLORS.muted, size: 9 });
    });
    label(ctx, "Jacobi", plot.x + 8, plot.y + 14, { color: COLORS.jacobi, size: 10, weight: "780" });
    label(ctx, "V-cycle", plot.x + 68, plot.y + 14, { color: COLORS.multi, size: 10, weight: "780" });
    label(ctx, formatNumber(maxWork, 0) + " work units", plot.x + plot.w, box.y + box.h - 20, { align: "right", color: COLORS.muted, size: 10 });
  }

  function drawSpectrum(ctx, box, result) {
    panel(ctx, box, "error spectrum", "smooth high modes; coarse grid cuts low modes");
    var plot = { x: box.x + 38, y: box.y + 62, w: box.w - 56, h: box.h - 96 };
    plotFrame(ctx, plot);
    var m = result.spectra.initial.length;
    var maxV = Math.max.apply(null, result.spectra.initial.concat(result.spectra.smooth).concat(result.spectra.multigrid)) || 1;
    var group = plot.w / m;
    for (var k = 0; k < m; k += 1) {
      var x = plot.x + k * group + group * 0.16;
      var w = Math.max(1, group * 0.18);
      var vals = [result.spectra.initial[k], result.spectra.smooth[k], result.spectra.multigrid[k]];
      [COLORS.muted, COLORS.smooth, COLORS.multi].forEach(function (color, j) {
        var h = vals[j] / maxV * plot.h;
        ctx.fillStyle = j === 0 ? "rgba(93,104,114,0.24)" : color;
        ctx.fillRect(x + j * w, plot.y + plot.h - h, w, h);
      });
      if ((k + 1) % 8 === 0) label(ctx, String(k + 1), plot.x + (k + 0.5) * group, plot.y + plot.h + 13, { align: "center", color: COLORS.muted, size: 9 });
    }
    label(ctx, "mode", plot.x + plot.w, plot.y - 14, { align: "right", color: COLORS.muted, size: 10 });
    label(ctx, "initial", plot.x + 6, plot.y + 14, { color: COLORS.muted, size: 10 });
    label(ctx, "smooth", plot.x + 62, plot.y + 14, { color: COLORS.smooth, size: 10, weight: "780" });
    label(ctx, "V-cycle", plot.x + 120, plot.y + 14, { color: COLORS.multi, size: 10, weight: "780" });
  }

  function drawHierarchy(ctx, box, result) {
    panel(ctx, box, "grid hierarchy", "residuals restricted through the hierarchy");
    var levels = result.mg.stats.restrictedResiduals.length ? result.mg.stats.restrictedResiduals : restrictCascade(result.problem.f);
    var plot = { x: box.x + 26, y: box.y + 62, w: box.w - 52, h: box.h - 96 };
    var maxNorm = Math.max.apply(null, levels.map(function (row) { return row.norm; })) || 1;
    levels.forEach(function (row, i) {
      var y = plot.y + i / Math.max(1, levels.length - 1) * plot.h;
      var scale = row.n / levels[0].n;
      var w = Math.max(34, plot.w * scale);
      var x = plot.x + (plot.w - w) / 2;
      ctx.fillStyle = i === 0 ? "rgba(15,118,110,0.12)" : "rgba(124,58,237,0.13)";
      ctx.strokeStyle = i === 0 ? COLORS.multi : COLORS.coarse;
      ctx.lineWidth = 1;
      ctx.fillRect(x, y - 10, w, 20);
      ctx.strokeRect(x, y - 10, w, 20);
      if (w > 92) {
        label(ctx, row.n + " pts", x + 6, y, { color: COLORS.text, size: 10, weight: "720" });
        label(ctx, "res " + formatNumber(row.norm / maxNorm, 2), x + w - 6, y, { align: "right", color: COLORS.muted, size: 10 });
      } else {
        label(ctx, row.n + " pts", x + w / 2, y, { align: "center", color: COLORS.text, size: 9, weight: "720" });
      }
      if (i + 1 < levels.length) {
        ctx.strokeStyle = "rgba(93,104,114,0.36)";
        ctx.beginPath();
        ctx.moveTo(plot.x + plot.w / 2, y + 12);
        ctx.lineTo(plot.x + plot.w / 2, plot.y + (i + 1) / Math.max(1, levels.length - 1) * plot.h - 12);
        ctx.stroke();
      }
    });
    label(ctx, "coarsest direct solve", plot.x + plot.w, box.y + box.h - 20, { align: "right", color: COLORS.coarse, size: 10, weight: "780" });
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (width < 620) {
      var gap = 14;
      var h1 = 250;
      var h2 = 230;
      var h3 = 250;
      drawSolution(ctx, { x: 0, y: 0, w: width, h: h1 }, result);
      drawResidual(ctx, { x: 0, y: h1 + gap, w: width, h: h2 }, result);
      drawSpectrum(ctx, { x: 0, y: h1 + h2 + 2 * gap, w: width, h: h3 }, result);
      drawHierarchy(ctx, { x: 0, y: h1 + h2 + h3 + 3 * gap, w: width, h: height - h1 - h2 - h3 - 3 * gap }, result);
    } else {
      var gap2 = 16;
      var colW = (width - gap2) / 2;
      var rowH = (height - gap2) / 2;
      drawSolution(ctx, { x: 0, y: 0, w: colW, h: rowH }, result);
      drawResidual(ctx, { x: colW + gap2, y: 0, w: colW, h: rowH }, result);
      drawSpectrum(ctx, { x: 0, y: rowH + gap2, w: colW, h: rowH }, result);
      drawHierarchy(ctx, { x: colW + gap2, y: rowH + gap2, w: colW, h: rowH }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      level: result.problem.n + " pts",
      omega: formatNumber(result.params.omega, 2),
      smooth: String(result.params.smooth),
      cycles: String(result.params.cycles),
      shape: result.problem.shapeLabel
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("V-cycle residual", formatNumber(result.mg.residual, 3)),
        metric("Jacobi residual", formatNumber(result.jacobi.residual, 3)),
        metric("Work units", formatNumber(result.diagnostics.workUnits, 1)),
        metric("High modes after smooth", formatPercent(result.diagnostics.highFrequencyAfterSmoothing, 1)),
        metric("Low modes after V", formatPercent(result.diagnostics.lowFrequencyAfterCoarseCorrection, 1)),
        metric("Audit", result.audit.passed ? "passed" : "check")
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__multigridResult = result;
  }

  function init(root) {
    if (!root || root.__multigridReady) return;
    root.__multigridReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-multigrid-lab]")).forEach(init);
  }

  var api = {
    applyA: applyA,
    auditGrid: auditGrid,
    directSolve: directSolve,
    evaluate: evaluate,
    prolongLinear: prolongLinear,
    restrictFullWeighting: restrictFullWeighting,
    residual: residual,
    vCycle: vCycle
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MultigridErrorLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
