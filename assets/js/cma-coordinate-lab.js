(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    cma: "#0f766e",
    cmaSoft: "rgba(15, 118, 110, 0.20)",
    iso: "#b45309",
    isoSoft: "rgba(180, 83, 9, 0.18)",
    valley: "#2563eb",
    target: "#be123c",
    good: "#0f766e",
    bad: "#be123c",
    neutral: "#64748b"
  };

  var DEFAULTS = {
    angle: 42,
    condition: 120,
    generations: 32,
    lambda: 24,
    seed: 7
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    var condition = clamp(Math.round(Number(raw.condition == null ? DEFAULTS.condition : raw.condition)), 10, 400);
    var lambda = clamp(Math.round(Number(raw.lambda == null ? DEFAULTS.lambda : raw.lambda)), 8, 64);
    if (lambda % 2 === 1) lambda += 1;
    return {
      angle: clamp(Math.round(Number(raw.angle == null ? DEFAULTS.angle : raw.angle)), 0, 80),
      condition: condition,
      generations: clamp(Math.round(Number(raw.generations == null ? DEFAULTS.generations : raw.generations)), 8, 48),
      lambda: lambda,
      seed: clamp(Math.round(Number(raw.seed == null ? DEFAULTS.seed : raw.seed)), 1, 999)
    };
  }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function objective(x, params) {
    var theta = params.angle * Math.PI / 180;
    var c = Math.cos(theta);
    var s = Math.sin(theta);
    var z0 = c * x[0] + s * x[1];
    var z1 = -s * x[0] + c * x[1];
    return z0 * z0 + params.condition * z1 * z1;
  }

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
  }

  function scale(v, s) {
    return [v[0] * s, v[1] * s];
  }

  function outer(v) {
    return [
      [v[0] * v[0], v[0] * v[1]],
      [v[1] * v[0], v[1] * v[1]]
    ];
  }

  function matVec(M, v) {
    return [
      M[0][0] * v[0] + M[0][1] * v[1],
      M[1][0] * v[0] + M[1][1] * v[1]
    ];
  }

  function eigen2(C) {
    var a = C[0][0];
    var b = (C[0][1] + C[1][0]) / 2;
    var d = C[1][1];
    var trace = (a + d) / 2;
    var diff = (a - d) / 2;
    var radius = Math.sqrt(diff * diff + b * b);
    var l1 = Math.max(1e-14, trace + radius);
    var l2 = Math.max(1e-14, trace - radius);
    var v1;
    if (Math.abs(b) > 1e-12 || Math.abs(l1 - a) > 1e-12) v1 = [b, l1 - a];
    else v1 = [1, 0];
    var norm = Math.max(1e-14, Math.hypot(v1[0], v1[1]));
    v1 = [v1[0] / norm, v1[1] / norm];
    return {
      values: [l1, l2],
      vectors: [v1, [-v1[1], v1[0]]]
    };
  }

  function invSqrt(C) {
    var eig = eigen2(C);
    var out = [[0, 0], [0, 0]];
    for (var k = 0; k < 2; k += 1) {
      var v = eig.vectors[k];
      var factor = 1 / Math.sqrt(eig.values[k]);
      out[0][0] += factor * v[0] * v[0];
      out[0][1] += factor * v[0] * v[1];
      out[1][0] += factor * v[1] * v[0];
      out[1][1] += factor * v[1] * v[1];
    }
    return out;
  }

  function sampleCov(C, z) {
    var eig = eigen2(C);
    var v0 = eig.vectors[0];
    var v1 = eig.vectors[1];
    return [
      Math.sqrt(eig.values[0]) * z[0] * v0[0] + Math.sqrt(eig.values[1]) * z[1] * v1[0],
      Math.sqrt(eig.values[0]) * z[0] * v0[1] + Math.sqrt(eig.values[1]) * z[1] * v1[1]
    ];
  }

  function strategyWeights(lambda) {
    var mu = Math.floor(lambda / 2);
    var weights = [];
    var sum = 0;
    for (var i = 0; i < mu; i += 1) {
      var w = Math.log(mu + 0.5) - Math.log(i + 1);
      weights.push(w);
      sum += w;
    }
    weights = weights.map(function (w) { return w / sum; });
    var sq = weights.reduce(function (acc, w) { return acc + w * w; }, 0);
    return { mu: mu, weights: weights, mueff: 1 / sq };
  }

  function cmaParameters(lambda) {
    var n = 2;
    var w = strategyWeights(lambda);
    var mueff = w.mueff;
    var cs = (mueff + 2) / (n + mueff + 5);
    return {
      mu: w.mu,
      weights: w.weights,
      mueff: mueff,
      cs: cs,
      ds: 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs,
      cc: (4 + mueff / n) / (n + 4 + 2 * mueff / n),
      c1: 2 / (Math.pow(n + 1.3, 2) + mueff),
      cmu: Math.min(1 - 2 / (Math.pow(n + 1.3, 2) + mueff), 2 * (mueff - 2 + 1 / mueff) / (Math.pow(n + 2, 2) + mueff)),
      chiN: Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n))
    };
  }

  function runCmaEs(params) {
    var rand = mulberry32(params.seed);
    var pars = cmaParameters(params.lambda);
    var mean = [-3.2, 2.4];
    var sigma = 1.25;
    var C = [[1, 0], [0, 1]];
    var ps = [0, 0];
    var pc = [0, 0];
    var best = objective(mean, params);
    var bestX = mean.slice();
    var history = [];

    for (var gen = 0; gen < params.generations; gen += 1) {
      var population = [];
      for (var i = 0; i < params.lambda; i += 1) {
        var z = [normal(rand), normal(rand)];
        var y = sampleCov(C, z);
        var x = add(mean, scale(y, sigma));
        var value = objective(x, params);
        population.push({ x: x, y: y, value: value });
        if (value < best) {
          best = value;
          bestX = x.slice();
        }
      }

      population.sort(function (a, b) { return a.value - b.value; });
      var oldMean = mean.slice();
      mean = [0, 0];
      for (var j = 0; j < pars.mu; j += 1) {
        mean[0] += pars.weights[j] * population[j].x[0];
        mean[1] += pars.weights[j] * population[j].x[1];
      }

      var yMean = scale([mean[0] - oldMean[0], mean[1] - oldMean[1]], 1 / sigma);
      var whiteStep = matVec(invSqrt(C), yMean);
      var psFactor = Math.sqrt(pars.cs * (2 - pars.cs) * pars.mueff);
      ps = add(scale(ps, 1 - pars.cs), scale(whiteStep, psFactor));
      var normPs = Math.hypot(ps[0], ps[1]);
      var hsig = normPs / Math.sqrt(1 - Math.pow(1 - pars.cs, 2 * (gen + 1))) / pars.chiN < 1.4 + 2 / 3 ? 1 : 0;
      var pcFactor = hsig * Math.sqrt(pars.cc * (2 - pars.cc) * pars.mueff);
      pc = add(scale(pc, 1 - pars.cc), scale(yMean, pcFactor));

      var rankMu = [[0, 0], [0, 0]];
      for (var m = 0; m < pars.mu; m += 1) {
        var dy = scale([population[m].x[0] - oldMean[0], population[m].x[1] - oldMean[1]], 1 / sigma);
        var o = outer(dy);
        rankMu[0][0] += pars.weights[m] * o[0][0];
        rankMu[0][1] += pars.weights[m] * o[0][1];
        rankMu[1][0] += pars.weights[m] * o[1][0];
        rankMu[1][1] += pars.weights[m] * o[1][1];
      }

      var pcOuter = outer(pc);
      var oldFactor = 1 - pars.c1 - pars.cmu + (1 - hsig) * pars.c1 * pars.cc * (2 - pars.cc);
      var nextC = [[0, 0], [0, 0]];
      for (var r = 0; r < 2; r += 1) {
        for (var c = 0; c < 2; c += 1) {
          nextC[r][c] = oldFactor * C[r][c] + pars.c1 * pcOuter[r][c] + pars.cmu * rankMu[r][c];
        }
      }
      C = [[nextC[0][0], (nextC[0][1] + nextC[1][0]) / 2], [(nextC[0][1] + nextC[1][0]) / 2, nextC[1][1]]];
      if (eigen2(C).values[1] < 1e-12) {
        C[0][0] += 1e-10;
        C[1][1] += 1e-10;
      }
      sigma *= Math.exp((pars.cs / pars.ds) * (normPs / pars.chiN - 1));

      var eig = eigen2(C);
      history.push({
        generation: gen + 1,
        mean: mean.slice(),
        sigma: sigma,
        C: [[C[0][0], C[0][1]], [C[1][0], C[1][1]]],
        best: best,
        covarianceCondition: eig.values[0] / eig.values[1],
        samples: population.map(function (row) { return row.x; })
      });
    }

    return {
      name: "CMA-ES",
      best: best,
      bestX: bestX,
      mean: mean,
      C: C,
      sigma: sigma,
      evaluations: params.lambda * params.generations,
      history: history
    };
  }

  function runSphericalEs(params) {
    var rand = mulberry32(params.seed);
    var pars = cmaParameters(params.lambda);
    var mean = [-3.2, 2.4];
    var sigma = 1.25;
    var ps = [0, 0];
    var best = objective(mean, params);
    var bestX = mean.slice();
    var history = [];

    for (var gen = 0; gen < params.generations; gen += 1) {
      var population = [];
      for (var i = 0; i < params.lambda; i += 1) {
        var z = [normal(rand), normal(rand)];
        var x = add(mean, scale(z, sigma));
        var value = objective(x, params);
        population.push({ x: x, z: z, value: value });
        if (value < best) {
          best = value;
          bestX = x.slice();
        }
      }

      population.sort(function (a, b) { return a.value - b.value; });
      var oldMean = mean.slice();
      mean = [0, 0];
      for (var j = 0; j < pars.mu; j += 1) {
        mean[0] += pars.weights[j] * population[j].x[0];
        mean[1] += pars.weights[j] * population[j].x[1];
      }

      var step = scale([mean[0] - oldMean[0], mean[1] - oldMean[1]], 1 / sigma);
      var psFactor = Math.sqrt(pars.cs * (2 - pars.cs) * pars.mueff);
      ps = add(scale(ps, 1 - pars.cs), scale(step, psFactor));
      sigma *= Math.exp((pars.cs / pars.ds) * (Math.hypot(ps[0], ps[1]) / pars.chiN - 1));

      history.push({
        generation: gen + 1,
        mean: mean.slice(),
        sigma: sigma,
        best: best,
        samples: population.map(function (row) { return row.x; })
      });
    }

    return {
      name: "spherical ES",
      best: best,
      bestX: bestX,
      mean: mean,
      sigma: sigma,
      evaluations: params.lambda * params.generations,
      history: history
    };
  }

  function axisError(C, angle) {
    var eig = eigen2(C);
    var v = eig.vectors[0];
    var theta = angle * Math.PI / 180;
    var flat = [Math.cos(theta), Math.sin(theta)];
    var dot = Math.abs(v[0] * flat[0] + v[1] * flat[1]);
    return Math.acos(clamp(dot, 0, 1)) * 180 / Math.PI;
  }

  function finiteMatrix(C) {
    return isFinite(C[0][0]) && isFinite(C[0][1]) && isFinite(C[1][0]) && isFinite(C[1][1]) && eigen2(C).values[1] > 0;
  }

  function auditResult(result) {
    var cma = result.cma;
    var iso = result.spherical;
    var cmaBestMonotone = cma.history.every(function (row, i, rows) {
      return i === 0 || row.best <= rows[i - 1].best + 1e-12;
    });
    var isoBestMonotone = iso.history.every(function (row, i, rows) {
      return i === 0 || row.best <= rows[i - 1].best + 1e-12;
    });
    var finite = cma.history.every(function (row) { return isFinite(row.best) && finiteMatrix(row.C); })
      && iso.history.every(function (row) { return isFinite(row.best) && isFinite(row.sigma); });
    var startValue = objective([-3.2, 2.4], result.params);
    var cmaImproves = cma.best < startValue * 1e-8;
    var cmaBeatsSpherical = cma.best < iso.best;
    var axisOk = result.axisError < 12;
    return {
      passed: finite && cmaBestMonotone && isoBestMonotone && cmaImproves && cmaBeatsSpherical && axisOk,
      finite: finite,
      cmaBestMonotone: cmaBestMonotone,
      sphericalBestMonotone: isoBestMonotone,
      cmaImproves: cmaImproves,
      cmaBeatsSpherical: cmaBeatsSpherical,
      axisOk: axisOk
    };
  }

  function evaluate(rawParams) {
    var params = normalize(rawParams);
    var cma = runCmaEs(params);
    var spherical = runSphericalEs(params);
    var eig = eigen2(cma.C);
    var result = {
      params: params,
      cma: cma,
      spherical: spherical,
      axisError: axisError(cma.C, params.angle),
      covarianceCondition: eig.values[0] / eig.values[1],
      advantage: spherical.best / Math.max(1e-16, cma.best),
      startValue: objective([-3.2, 2.4], params)
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditGrid() {
    var angles = [0, 25, 50];
    var conditions = [30, 120, 300];
    var seeds = [5, 17];
    var total = 0;
    var passed = 0;
    var defaultResult = evaluate(DEFAULTS);
    for (var a = 0; a < angles.length; a += 1) {
      for (var c = 0; c < conditions.length; c += 1) {
        for (var s = 0; s < seeds.length; s += 1) {
          total += 1;
          var params = {
            angle: angles[a],
            condition: conditions[c],
            seed: seeds[s],
            generations: 32,
            lambda: 24
          };
          var result = evaluate(params);
          var finite = result.cma.history.every(function (row) { return isFinite(row.best) && finiteMatrix(row.C); });
          var improves = result.cma.best < result.startValue * 1e-6;
          var bestMonotone = result.audit.cmaBestMonotone && result.audit.sphericalBestMonotone;
          if (finite && improves && bestMonotone) passed += 1;
        }
      }
    }
    return {
      total: total,
      passed: passed,
      defaultPassed: defaultResult.audit.passed,
      defaultBest: defaultResult.cma.best,
      defaultSphericalBest: defaultResult.spherical.best,
      defaultAxisError: defaultResult.axisError
    };
  }

  function formatNumber(value, digits) {
    return Number(value).toLocaleString("en-US", {
      maximumFractionDigits: digits == null ? 2 : digits,
      minimumFractionDigits: digits == null ? 0 : digits
    });
  }

  function formatSci(value) {
    if (!(value > 0)) return "0";
    if (value < 0.001 || value >= 10000) return value.toExponential(1);
    return formatNumber(value, value < 1 ? 4 : 2);
  }

  function metric(label, value) {
    return '<div class="cma-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 860);
    var height = width < 560 ? 900 : 760;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function label(ctx, text, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.muted;
    ctx.font = (options.weight || "600") + " " + (options.size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
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
    label(ctx, title, box.x + 14, box.y + 17, { color: COLORS.text, size: 13, weight: "750" });
    label(ctx, subtitle, box.x + 14, box.y + 36, { color: COLORS.muted, size: 11, weight: "550" });
  }

  function worldToScreen(point, plot) {
    var min = -4.1;
    var max = 4.1;
    return {
      x: plot.x + (point[0] - min) / (max - min) * plot.w,
      y: plot.y + plot.h - (point[1] - min) / (max - min) * plot.h
    };
  }

  function screenScale(plot) {
    return plot.w / 8.2;
  }

  function heatColor(t) {
    t = clamp(t, 0, 1);
    var r = Math.round(241 + 14 * t);
    var g = Math.round(248 - 34 * t);
    var b = Math.round(250 - 83 * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawLandscape(ctx, box, result) {
    panel(ctx, box, "sampled search distribution", "green adapts covariance; ochre stays spherical");
    var plot = { x: box.x + 18, y: box.y + 56, w: box.w - 36, h: box.h - 84 };
    var cells = 42;
    var maxLog = Math.log10(1 + objective([4.1, -4.1], result.params));
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    for (var i = 0; i < cells; i += 1) {
      for (var j = 0; j < cells; j += 1) {
        var x = -4.1 + 8.2 * (i + 0.5) / cells;
        var y = -4.1 + 8.2 * (j + 0.5) / cells;
        var t = Math.log10(1 + objective([x, y], result.params)) / maxLog;
        ctx.fillStyle = heatColor(t);
        ctx.fillRect(plot.x + i * plot.w / cells, plot.y + (cells - j - 1) * plot.h / cells, plot.w / cells + 0.5, plot.h / cells + 0.5);
      }
    }

    ctx.strokeStyle = "rgba(100, 116, 139, 0.20)";
    ctx.lineWidth = 1;
    for (var tick = -4; tick <= 4; tick += 2) {
      var sx = worldToScreen([tick, 0], plot).x;
      var sy = worldToScreen([0, tick], plot).y;
      ctx.beginPath();
      ctx.moveTo(sx, plot.y);
      ctx.lineTo(sx, plot.y + plot.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(plot.x, sy);
      ctx.lineTo(plot.x + plot.w, sy);
      ctx.stroke();
    }

    var theta = result.params.angle * Math.PI / 180;
    var flat = [Math.cos(theta), Math.sin(theta)];
    var steep = [-Math.sin(theta), Math.cos(theta)];
    function axisLine(vec, color, dash) {
      var a = worldToScreen(scale(vec, -4.4), plot);
      var b = worldToScreen(scale(vec, 4.4), plot);
      ctx.strokeStyle = color;
      ctx.setLineDash(dash || []);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    axisLine(flat, "rgba(37, 99, 235, 0.55)", [6, 5]);
    axisLine(steep, "rgba(190, 18, 60, 0.35)", [3, 6]);

    drawPath(ctx, result.spherical.history.map(function (row) { return row.mean; }), plot, COLORS.iso, 1.8);
    drawPath(ctx, result.cma.history.map(function (row) { return row.mean; }), plot, COLORS.cma, 2.4);
    drawSamples(ctx, result.spherical.history[result.spherical.history.length - 1].samples, plot, COLORS.isoSoft, COLORS.iso);
    drawSamples(ctx, result.cma.history[result.cma.history.length - 1].samples, plot, COLORS.cmaSoft, COLORS.cma);
    drawEllipse(ctx, result.cma.mean, result.cma.C, result.cma.sigma, plot, COLORS.cma);

    var best = worldToScreen(result.cma.bestX, plot);
    ctx.fillStyle = COLORS.target;
    ctx.beginPath();
    ctx.arc(best.x, best.y, 4, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, "best", best.x + 7, best.y - 8, { color: COLORS.target, size: 10, weight: "750" });

    label(ctx, "flat valley axis", plot.x + 9, plot.y + 13, { color: COLORS.valley, size: 10, weight: "750" });
    label(ctx, "origin is optimum", plot.x + plot.w - 9, plot.y + plot.h - 12, { color: COLORS.muted, size: 10, align: "right" });
    ctx.restore();
  }

  function drawPath(ctx, points, plot, color, width) {
    if (!points.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(function (point, i) {
      var p = worldToScreen(point, plot);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  function drawSamples(ctx, samples, plot, fill, stroke) {
    samples.forEach(function (point) {
      var p = worldToScreen(point, plot);
      if (p.x < plot.x || p.x > plot.x + plot.w || p.y < plot.y || p.y > plot.y + plot.h) return;
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawEllipse(ctx, mean, C, sigma, plot, color) {
    var eig = eigen2(C);
    var scalePx = screenScale(plot);
    for (var ring = 1; ring <= 2; ring += 1) {
      ctx.strokeStyle = ring === 1 ? color : "rgba(15, 118, 110, 0.42)";
      ctx.lineWidth = ring === 1 ? 2 : 1.2;
      ctx.beginPath();
      for (var i = 0; i <= 80; i += 1) {
        var a = 2 * Math.PI * i / 80;
        var local = [
          Math.cos(a) * Math.sqrt(eig.values[0]) * sigma * ring,
          Math.sin(a) * Math.sqrt(eig.values[1]) * sigma * ring
        ];
        var v0 = eig.vectors[0];
        var v1 = eig.vectors[1];
        var p = [
          mean[0] + local[0] * v0[0] + local[1] * v1[0],
          mean[1] + local[0] * v0[1] + local[1] * v1[1]
        ];
        var screen = worldToScreen(p, plot);
        if (i === 0) ctx.moveTo(screen.x, screen.y);
        else ctx.lineTo(screen.x, screen.y);
      }
      ctx.stroke();
    }
    var m = worldToScreen(mean, plot);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 4.2, 0, Math.PI * 2);
    ctx.fill();
    void scalePx;
  }

  function drawConvergence(ctx, box, result) {
    panel(ctx, box, "best value found", "ranked samples drive two different search geometries");
    var plot = { x: box.x + 44, y: box.y + 62, w: box.w - 66, h: box.h - 98 };
    var series = [
      { rows: result.cma.history, color: COLORS.cma, label: "CMA-ES" },
      { rows: result.spherical.history, color: COLORS.iso, label: "spherical" }
    ];
    var values = [];
    series.forEach(function (s) {
      s.rows.forEach(function (row) { values.push(Math.log10(Math.max(1e-12, row.best))); });
    });
    var minY = Math.floor(Math.min.apply(null, values));
    var maxY = Math.ceil(Math.max.apply(null, values));
    if (maxY <= minY) maxY = minY + 1;
    function xScale(g) { return plot.x + (g - 1) / Math.max(1, result.params.generations - 1) * plot.w; }
    function yScale(v) { return plot.y + plot.h - (Math.log10(Math.max(1e-12, v)) - minY) / (maxY - minY) * plot.h; }
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    for (var y = minY; y <= maxY; y += 1) {
      var sy = plot.y + plot.h - (y - minY) / (maxY - minY) * plot.h;
      ctx.strokeStyle = "rgba(100, 116, 139, 0.16)";
      ctx.beginPath();
      ctx.moveTo(plot.x, sy);
      ctx.lineTo(plot.x + plot.w, sy);
      ctx.stroke();
      label(ctx, "1e" + y, plot.x - 8, sy, { align: "right", size: 9, color: COLORS.muted });
    }
    series.forEach(function (s) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.label === "CMA-ES" ? 2.4 : 1.8;
      ctx.beginPath();
      s.rows.forEach(function (row, i) {
        var x = xScale(row.generation);
        var y = yScale(row.best);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    label(ctx, "generation", plot.x + plot.w, box.y + box.h - 19, { align: "right", size: 10, color: COLORS.muted });
    label(ctx, "log best", box.x + 14, plot.y - 10, { size: 10, color: COLORS.muted });
    label(ctx, "CMA-ES", plot.x + 8, plot.y + 15, { color: COLORS.cma, size: 11, weight: "800" });
    label(ctx, "spherical", plot.x + 8, plot.y + 32, { color: COLORS.iso, size: 11, weight: "800" });
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "adaptation ledger", "what the covariance has learned");
    var rows = [
      ["axis error", formatNumber(result.axisError, 1) + " deg", Math.max(0, 1 - result.axisError / 30), COLORS.cma],
      ["cov condition", formatNumber(result.covarianceCondition, 1) + "x", Math.min(1, result.covarianceCondition / result.params.condition), COLORS.valley],
      ["CMA best", formatSci(result.cma.best), Math.min(1, Math.max(0.04, -Math.log10(Math.max(1e-12, result.cma.best)) / 12)), COLORS.cma],
      ["spherical best", formatSci(result.spherical.best), Math.min(1, Math.max(0.04, -Math.log10(Math.max(1e-12, result.spherical.best)) / 12)), COLORS.iso]
    ];
    var x = box.x + 16;
    var y = box.y + 72;
    var barX = box.x + Math.min(150, box.w * 0.48);
    var barW = Math.max(70, box.x + box.w - barX - 60);
    rows.forEach(function (row, i) {
      var yy = y + i * 43;
      label(ctx, row[0], x, yy, { color: COLORS.text, size: 12, weight: "750" });
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(barX, yy - 9, barW, 18);
      ctx.fillStyle = row[3];
      ctx.fillRect(barX, yy - 9, barW * row[2], 18);
      label(ctx, row[1], barX + barW + 10, yy, { color: row[3], size: 11, weight: "800" });
    });
    var sentence = result.audit.passed ? "audit passed" : "audit needs attention";
    label(ctx, sentence, x, box.y + box.h - 25, { color: result.audit.passed ? COLORS.good : COLORS.bad, size: 14, weight: "850" });
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (width < 560) {
      var gap = 14;
      drawLandscape(ctx, { x: 0, y: 0, w: width, h: 430 }, result);
      drawConvergence(ctx, { x: 0, y: 430 + gap, w: width, h: 220 }, result);
      drawLedger(ctx, { x: 0, y: 430 + 220 + 2 * gap, w: width, h: height - 430 - 220 - 2 * gap }, result);
    } else {
      var gap2 = 16;
      var topH = Math.round(height * 0.62);
      drawLandscape(ctx, { x: 0, y: 0, w: width, h: topH }, result);
      drawConvergence(ctx, { x: 0, y: topH + gap2, w: Math.round((width - gap2) * 0.58), h: height - topH - gap2 }, result);
      drawLedger(ctx, { x: Math.round((width - gap2) * 0.58) + gap2, y: topH + gap2, w: width - Math.round((width - gap2) * 0.58) - gap2, h: height - topH - gap2 }, result);
    }
  }

  function render(root) {
    var params = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(params);
    var values = {
      angle: result.params.angle + " deg",
      condition: result.params.condition + "x",
      generations: String(result.params.generations),
      lambda: String(result.params.lambda),
      seed: String(result.params.seed)
    };
    Object.keys(values).forEach(function (key) {
      var rawValue = String(result.params[key]);
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && input.value !== rawValue) input.value = rawValue;
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("CMA best", formatSci(result.cma.best)),
        metric("Spherical best", formatSci(result.spherical.best)),
        metric("Advantage", formatNumber(Math.min(result.advantage, 999999), result.advantage > 100 ? 0 : 1) + "x"),
        metric("Axis error", formatNumber(result.axisError, 1) + " deg"),
        metric("Cov condition", formatNumber(result.covarianceCondition, 1) + "x"),
        metric("Audit", result.audit.passed ? "passed" : "check")
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__cmaCoordinateResult = result;
  }

  function init(root) {
    if (!root || root.__cmaCoordinateReady) return;
    root.__cmaCoordinateReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-cma-coordinate-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    axisError: axisError,
    eigen2: eigen2,
    evaluate: evaluate,
    objective: objective,
    runCmaEs: runCmaEs,
    runSphericalEs: runSphericalEs
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CMACoordinateLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
