(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    sd: "#be123c",
    cg: "#2563eb",
    pcg: "#0f766e",
    bound: "#7c3aed",
    amber: "#b45309",
    low: "#bfdbfe",
    mid: "#fde68a",
    high: "#fecaca"
  };

  var DEFAULTS = {
    spectrum: "ramp",
    condition: 4,
    dimension: 96,
    iterations: 28,
    preconditioner: 70,
    seed: 23
  };

  var SPECTRA = {
    cluster: "two clusters",
    outlier: "one outlier",
    ramp: "log ramp"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var spectrum = String(raw.spectrum || DEFAULTS.spectrum);
    if (!SPECTRA[spectrum]) spectrum = DEFAULTS.spectrum;
    return {
      spectrum: spectrum,
      condition: clamp(Math.round(number(raw, "condition")), 1, 6),
      dimension: clamp(Math.round(number(raw, "dimension")), 32, 160),
      iterations: clamp(Math.round(number(raw, "iterations")), 0, 120),
      preconditioner: clamp(Math.round(number(raw, "preconditioner")), 0, 100),
      seed: clamp(Math.round(number(raw, "seed")), 1, 9999)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateControls(root, params) {
    Object.keys(params).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && String(input.value) !== String(params[key])) input.value = params[key];
    });
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-output]").forEach(function (node) {
      var key = node.getAttribute("data-output");
      if (key === "condition") node.textContent = "1e" + params.condition;
      else if (key === "preconditioner") node.textContent = params.preconditioner + "%";
      else node.textContent = String(params[key]);
    });
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (digits != null) return value.toFixed(digits);
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function metric(label, value) {
    return '<div class="cg-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function dot(a, b) {
    var total = 0;
    for (var i = 0; i < a.length; i += 1) total += a[i] * b[i];
    return total;
  }

  function ax(lambda, x) {
    var out = new Array(x.length);
    for (var i = 0; i < x.length; i += 1) out[i] = lambda[i] * x[i];
    return out;
  }

  function addScaled(a, b, scale) {
    var out = new Array(a.length);
    for (var i = 0; i < a.length; i += 1) out[i] = a[i] + scale * b[i];
    return out;
  }

  function sub(a, b) {
    var out = new Array(a.length);
    for (var i = 0; i < a.length; i += 1) out[i] = a[i] - b[i];
    return out;
  }

  function norm2(a) {
    return Math.sqrt(Math.max(0, dot(a, a)));
  }

  function energyNorm(lambda, e) {
    var total = 0;
    for (var i = 0; i < e.length; i += 1) total += lambda[i] * e[i] * e[i];
    return Math.sqrt(Math.max(0, total));
  }

  function makeSpectrum(params) {
    var rng = makeRng(params.seed + 101);
    var n = params.dimension;
    var kappa = Math.pow(10, params.condition);
    var lambda = [];
    var i;
    if (params.spectrum === "cluster") {
      for (i = 0; i < n; i += 1) {
        var high = i >= Math.floor(n * 0.72);
        var center = high ? kappa : 1;
        var spread = high ? Math.pow(kappa, 0.08) : Math.pow(kappa, 0.04);
        var offset = (rng() - 0.5) * 2;
        lambda.push(center * Math.pow(spread, offset));
      }
    } else if (params.spectrum === "outlier") {
      for (i = 0; i < n; i += 1) {
        if (i === n - 1) lambda.push(kappa);
        else lambda.push(Math.pow(10, rng() * Math.min(1.4, params.condition * 0.35)));
      }
    } else {
      for (i = 0; i < n; i += 1) {
        var t = i / Math.max(1, n - 1);
        lambda.push(Math.pow(kappa, t));
      }
    }
    lambda.sort(function (a, b) { return a - b; });
    return lambda;
  }

  function makeProblem(params, lambda) {
    var rng = makeRng(params.seed + 707);
    var xStar = new Array(lambda.length);
    for (var i = 0; i < lambda.length; i += 1) {
      var sign = rng() < 0.5 ? -1 : 1;
      var wobble = 0.45 + rng();
      xStar[i] = sign * wobble / Math.sqrt(lambda[i]);
    }
    var b = ax(lambda, xStar);
    return { xStar: xStar, b: b };
  }

  function relativeState(lambda, x, xStar, b, initialEnergy, initialResidual, e0) {
    var e = sub(xStar, x);
    var r = sub(b, ax(lambda, x));
    var filter = new Array(e.length);
    for (var i = 0; i < e.length; i += 1) filter[i] = Math.abs(e0[i]) > 1e-14 ? e[i] / e0[i] : 0;
    return {
      x: x,
      error: e,
      residual: r,
      filter: filter,
      energy: energyNorm(lambda, e) / initialEnergy,
      residualNorm: norm2(r) / initialResidual
    };
  }

  function runSteepest(lambda, problem, maxIterations) {
    var x = new Array(lambda.length).fill(0);
    var initialEnergy = energyNorm(lambda, problem.xStar);
    var initialResidual = norm2(problem.b);
    var rows = [relativeState(lambda, x, problem.xStar, problem.b, initialEnergy, initialResidual, problem.xStar)];
    for (var k = 0; k < maxIterations; k += 1) {
      var r = rows[rows.length - 1].residual;
      var ar = ax(lambda, r);
      var denom = dot(r, ar);
      var alpha = denom > 0 ? dot(r, r) / denom : 0;
      x = addScaled(x, r, alpha);
      rows.push(relativeState(lambda, x, problem.xStar, problem.b, initialEnergy, initialResidual, problem.xStar));
    }
    return rows;
  }

  function runCg(lambda, problem, maxIterations) {
    var x = new Array(lambda.length).fill(0);
    var r = problem.b.slice();
    var p = r.slice();
    var rr = dot(r, r);
    var initialEnergy = energyNorm(lambda, problem.xStar);
    var initialResidual = norm2(problem.b);
    var rows = [relativeState(lambda, x, problem.xStar, problem.b, initialEnergy, initialResidual, problem.xStar)];
    for (var k = 0; k < maxIterations; k += 1) {
      var ap = ax(lambda, p);
      var denom = dot(p, ap);
      if (denom <= 0 || rr <= 0) break;
      var alpha = rr / denom;
      x = addScaled(x, p, alpha);
      r = addScaled(r, ap, -alpha);
      var rrNew = dot(r, r);
      var beta = rr > 0 ? rrNew / rr : 0;
      for (var i = 0; i < p.length; i += 1) p[i] = r[i] + beta * p[i];
      rr = rrNew;
      rows.push(relativeState(lambda, x, problem.xStar, problem.b, initialEnergy, initialResidual, problem.xStar));
    }
    while (rows.length <= maxIterations) rows.push(rows[rows.length - 1]);
    return rows;
  }

  function runPcg(lambda, problem, maxIterations, strength) {
    var rho = strength / 100;
    var x = new Array(lambda.length).fill(0);
    var r = problem.b.slice();
    var invM = lambda.map(function (value) { return 1 / Math.pow(value, rho); });
    var z = r.map(function (value, i) { return invM[i] * value; });
    var p = z.slice();
    var rz = dot(r, z);
    var initialEnergy = energyNorm(lambda, problem.xStar);
    var initialResidual = norm2(problem.b);
    var rows = [relativeState(lambda, x, problem.xStar, problem.b, initialEnergy, initialResidual, problem.xStar)];
    for (var k = 0; k < maxIterations; k += 1) {
      var ap = ax(lambda, p);
      var denom = dot(p, ap);
      if (denom <= 0 || rz <= 0) break;
      var alpha = rz / denom;
      x = addScaled(x, p, alpha);
      r = addScaled(r, ap, -alpha);
      z = r.map(function (value, i) { return invM[i] * value; });
      var rzNew = dot(r, z);
      var beta = rz > 0 ? rzNew / rz : 0;
      for (var i = 0; i < p.length; i += 1) p[i] = z[i] + beta * p[i];
      rz = rzNew;
      rows.push(relativeState(lambda, x, problem.xStar, problem.b, initialEnergy, initialResidual, problem.xStar));
    }
    while (rows.length <= maxIterations) rows.push(rows[rows.length - 1]);
    return rows;
  }

  function bucketEnergy(lambda, state) {
    var n = lambda.length;
    var buckets = [
      { label: "low", total: 0, color: COLORS.low },
      { label: "middle", total: 0, color: COLORS.mid },
      { label: "high", total: 0, color: COLORS.high }
    ];
    var total = 0;
    for (var i = 0; i < n; i += 1) {
      var energy = lambda[i] * state.error[i] * state.error[i];
      total += energy;
      var bucket = i < n / 3 ? 0 : (i < 2 * n / 3 ? 1 : 2);
      buckets[bucket].total += energy;
    }
    buckets.forEach(function (bucket) { bucket.share = total > 0 ? bucket.total / total : 0; });
    return buckets;
  }

  function chebyshevBound(kappa, iterations) {
    var ratio = (Math.sqrt(kappa) - 1) / (Math.sqrt(kappa) + 1);
    return 2 * Math.pow(ratio, iterations);
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var lambda = makeSpectrum(params);
    var problem = makeProblem(params, lambda);
    var maxIterations = Math.max(6, params.iterations, 80);
    var sd = runSteepest(lambda, problem, maxIterations);
    var cg = runCg(lambda, problem, maxIterations);
    var pcg = runPcg(lambda, problem, maxIterations, params.preconditioner);
    var actualKappa = lambda[lambda.length - 1] / lambda[0];
    var effective = params.preconditioner / 100;
    var precondKappa = Math.pow(actualKappa, Math.max(0, 1 - effective));
    var current = {
      sd: sd[params.iterations],
      cg: cg[params.iterations],
      pcg: pcg[params.iterations]
    };
    var checks = {
      finiteCg: Number.isFinite(current.cg.energy) && Number.isFinite(current.cg.residualNorm),
      finitePcg: Number.isFinite(current.pcg.energy) && Number.isFinite(current.pcg.residualNorm),
      monotoneCgEnergy: true,
      positiveSpectrum: lambda[0] > 0
    };
    for (var i = 1; i < cg.length; i += 1) {
      if (cg[i].energy > cg[i - 1].energy + 1e-9) checks.monotoneCgEnergy = false;
    }
    return {
      params: params,
      lambda: lambda,
      problem: problem,
      methods: { sd: sd, cg: cg, pcg: pcg },
      current: current,
      buckets: {
        sd: bucketEnergy(lambda, current.sd),
        cg: bucketEnergy(lambda, current.cg),
        pcg: bucketEnergy(lambda, current.pcg)
      },
      stats: {
        kappa: actualKappa,
        precondKappa: precondKappa,
        bound: chebyshevBound(actualKappa, params.iterations),
        precondBound: chebyshevBound(precondKappa, params.iterations)
      },
      checks: checks
    };
  }

  function updateMetrics(root, result) {
    var node = root.querySelector("[data-metrics]");
    if (!node) return;
    var audit = result.checks.finiteCg && result.checks.finitePcg && result.checks.monotoneCgEnergy && result.checks.positiveSpectrum ? "pass" : "check";
    node.innerHTML = [
      metric("Spectrum", SPECTRA[result.params.spectrum]),
      metric("Condition", formatNumber(result.stats.kappa, 0)),
      metric("CG A-error", formatNumber(result.current.cg.energy, 4)),
      metric("PCG A-error", formatNumber(result.current.pcg.energy, 4)),
      metric("Precond kappa", formatNumber(result.stats.precondKappa, 1)),
      metric("Audit", audit)
    ].join("");
  }

  function setupCanvas(canvas, height) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var dpr = clamp(global.devicePixelRatio || 1, 1, 2);
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function roundedRect(ctx, x, y, w, h, r) {
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
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 16, box.y + 27, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, box.x + 16, box.y + 45, 10, COLORS.muted, 600);
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function logMap(value, min, max, x, w) {
    var a = Math.log10(min);
    var b = Math.log10(max);
    return x + (Math.log10(value) - a) / Math.max(1e-12, b - a) * w;
  }

  function drawSpectrumPanel(ctx, result, box) {
    panel(ctx, box, "spectrum ledger", "CG spends iterations on eigenvalue locations");
    var plot = { x: box.x + 42, y: box.y + 72, w: box.w - 66, h: box.h - 118 };
    drawAxis(ctx, plot);
    var min = result.lambda[0];
    var max = result.lambda[result.lambda.length - 1];
    var maxEnergy = 0;
    var energies = result.lambda.map(function (lambda, i) {
      var e = lambda * result.current.cg.error[i] * result.current.cg.error[i];
      if (e > maxEnergy) maxEnergy = e;
      return e;
    });
    result.lambda.forEach(function (lambda, i) {
      var x = logMap(lambda, min, max, plot.x, plot.w);
      var h = Math.max(2, energies[i] / Math.max(1e-30, maxEnergy) * plot.h);
      ctx.strokeStyle = i < result.lambda.length / 3 ? COLORS.cg : (i < 2 * result.lambda.length / 3 ? COLORS.amber : COLORS.sd);
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(x, plot.y + plot.h);
      ctx.lineTo(x, plot.y + plot.h - h);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    drawText(ctx, "small eigenvalues", plot.x, plot.y + plot.h + 18, 10, COLORS.cg, 700);
    drawText(ctx, "large eigenvalues", plot.x + plot.w, plot.y + plot.h + 18, 10, COLORS.sd, 700, "right");
    drawText(ctx, "remaining CG energy at iteration " + result.params.iterations, plot.x, plot.y - 10, 10, COLORS.muted, 650);
  }

  function curveY(value, plot) {
    var log = Math.log10(clamp(value, 1e-8, 2));
    return plot.y + plot.h - (log + 8) / 8.3 * plot.h;
  }

  function drawCurve(ctx, rows, plot, color, maxT) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = plot.x + index / maxT * plot.w;
      var y = curveY(row.energy, plot);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawConvergencePanel(ctx, result, box) {
    panel(ctx, box, "A-norm error", "CG minimizes the quadratic energy over a Krylov subspace");
    var plot = { x: box.x + 46, y: box.y + 68, w: box.w - 72, h: box.h - 112 };
    drawAxis(ctx, plot);
    for (var g = 0; g <= 4; g += 1) {
      var y = plot.y + g / 4 * plot.h;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    var maxT = result.methods.cg.length - 1;
    drawCurve(ctx, result.methods.sd, plot, COLORS.sd, maxT);
    drawCurve(ctx, result.methods.cg, plot, COLORS.cg, maxT);
    drawCurve(ctx, result.methods.pcg, plot, COLORS.pcg, maxT);
    ctx.strokeStyle = COLORS.bound;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (var t = 0; t <= maxT; t += 1) {
      var x = plot.x + t / maxT * plot.w;
      var yb = curveY(chebyshevBound(result.stats.kappa, t), plot);
      if (t === 0) ctx.moveTo(x, yb);
      else ctx.lineTo(x, yb);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    var currentX = plot.x + result.params.iterations / maxT * plot.w;
    ctx.strokeStyle = COLORS.muted;
    ctx.beginPath();
    ctx.moveTo(currentX, plot.y);
    ctx.lineTo(currentX, plot.y + plot.h);
    ctx.stroke();
    drawText(ctx, "SD", plot.x + 8, plot.y + 14, 10, COLORS.sd, 760);
    drawText(ctx, "CG", plot.x + 36, plot.y + 14, 10, COLORS.cg, 760);
    drawText(ctx, "PCG", plot.x + 64, plot.y + 14, 10, COLORS.pcg, 760);
    drawText(ctx, "Chebyshev bound", plot.x + 104, plot.y + 14, 10, COLORS.bound, 760);
    drawText(ctx, "1e-8", plot.x - 8, plot.y + plot.h, 10, COLORS.muted, 650, "right");
    drawText(ctx, "1", plot.x - 8, curveY(1, plot) + 4, 10, COLORS.muted, 650, "right");
  }

  function drawFilterPanel(ctx, result, box) {
    panel(ctx, box, "error filter", "after k steps, each eigenmode is scaled by a polynomial");
    var plot = { x: box.x + 42, y: box.y + 68, w: box.w - 66, h: box.h - 112 };
    drawAxis(ctx, plot);
    var min = result.lambda[0];
    var max = result.lambda[result.lambda.length - 1];
    function drawFilter(state, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      result.lambda.forEach(function (lambda, i) {
        var x = logMap(lambda, min, max, plot.x, plot.w);
        var y = curveY(Math.abs(state.filter[i]), plot);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    drawFilter(result.current.sd, COLORS.sd);
    drawFilter(result.current.cg, COLORS.cg);
    drawFilter(result.current.pcg, COLORS.pcg);
    drawText(ctx, "absolute error multiplier", plot.x, plot.y - 10, 10, COLORS.muted, 650);
    drawText(ctx, "SD", plot.x + 8, plot.y + 14, 10, COLORS.sd, 760);
    drawText(ctx, "CG", plot.x + 36, plot.y + 14, 10, COLORS.cg, 760);
    drawText(ctx, "PCG", plot.x + 64, plot.y + 14, 10, COLORS.pcg, 760);
    drawText(ctx, "lambda", plot.x + plot.w, plot.y + plot.h + 18, 10, COLORS.muted, 650, "right");
  }

  function drawBucketBars(ctx, buckets, x, y, w, label) {
    var offset = 0;
    buckets.forEach(function (bucket) {
      ctx.fillStyle = bucket.color;
      ctx.fillRect(x + offset, y, w * bucket.share, 24);
      offset += w * bucket.share;
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x, y, w, 24);
    drawText(ctx, label, x, y - 8, 10, COLORS.text, 760);
    drawText(ctx, formatNumber(buckets[0].share * 100, 0) + "% low", x, y + 42, 10, COLORS.cg, 650);
    drawText(ctx, formatNumber(buckets[1].share * 100, 0) + "% mid", x + w / 2, y + 42, 10, COLORS.amber, 650, "center");
    drawText(ctx, formatNumber(buckets[2].share * 100, 0) + "% high", x + w, y + 42, 10, COLORS.sd, 650, "right");
  }

  function drawLedgerPanel(ctx, result, box) {
    panel(ctx, box, "where the error remains", "energy shares across low, middle, and high eigenvalues");
    var x = box.x + 34;
    var y = box.y + 78;
    var w = box.w - 68;
    drawBucketBars(ctx, result.buckets.sd, x, y, w, "steepest descent");
    drawBucketBars(ctx, result.buckets.cg, x, y + 72, w, "conjugate gradient");
    drawBucketBars(ctx, result.buckets.pcg, x, y + 144, w, "preconditioned CG");
    drawText(ctx, "iteration " + result.params.iterations + "   preconditioner strength " + result.params.preconditioner + "%", x, box.y + box.h - 24, 10, COLORS.muted, 650);
  }

  function draw(result, canvas) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var compact = width < 650;
    var prepared = setupCanvas(canvas, compact ? 1120 : 760);
    var ctx = prepared.ctx;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = prepared.width - 2 * pad;

    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawSpectrumPanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawConvergencePanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawFilterPanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawLedgerPanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }

    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawSpectrumPanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawConvergencePanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawFilterPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawLedgerPanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function renderOne(root) {
    var result = evaluate(readParams(root));
    updateControls(root, result.params);
    updateOutputs(root, result.params);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__cgSpectrumResult = result;
  }

  function initOne(root) {
    if (root.__cgSpectrumReady) return;
    root.__cgSpectrumReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { renderOne(root); }, 70);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__cgSpectrumResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__cgSpectrumResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__cgSpectrumResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__cgSpectrumResult, canvas);
        }
      });
    }
    renderOne(root);
  }

  function init() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-cg-spectrum-lab]")).forEach(initOne);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    makeSpectrum: makeSpectrum,
    runCg: runCg,
    runPcg: runPcg,
    runSteepest: runSteepest
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CgSpectrumLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
