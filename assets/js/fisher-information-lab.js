(function (global) {
  "use strict";

  var DEFAULTS = {
    model: "normal",
    sampleSize: 80,
    experiments: 1600,
    mu: 0.4,
    sigma: 1.3,
    probability: 0.35,
    seed: 17
  };

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    blue: "#2563eb",
    good: "#0f766e",
    bad: "#be123c",
    amber: "#b45309",
    purple: "#6d28d9",
    white: "#ffffff"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    var model = raw.model === "bernoulli" ? "bernoulli" : "normal";
    return {
      model: model,
      sampleSize: clamp(Math.round(Number(raw.sampleSize == null ? DEFAULTS.sampleSize : raw.sampleSize)), 5, 500),
      experiments: clamp(Math.round(Number(raw.experiments == null ? DEFAULTS.experiments : raw.experiments)), 200, 5000),
      mu: clamp(Number(raw.mu == null ? DEFAULTS.mu : raw.mu), -2, 2),
      sigma: clamp(Number(raw.sigma == null ? DEFAULTS.sigma : raw.sigma), 0.25, 3),
      probability: clamp(Number(raw.probability == null ? DEFAULTS.probability : raw.probability), 0.03, 0.97),
      seed: clamp(Math.round(Number(raw.seed == null ? DEFAULTS.seed : raw.seed)), 1, 9999)
    };
  }

  function rng(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function normalPair(random) {
    var u1 = Math.max(1e-12, random());
    var u2 = random();
    var r = Math.sqrt(-2 * Math.log(u1));
    var a = 2 * Math.PI * u2;
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  function mean(values) {
    var s = 0;
    for (var i = 0; i < values.length; i += 1) s += values[i];
    return s / Math.max(1, values.length);
  }

  function variance(values) {
    var m = mean(values);
    var s = 0;
    for (var i = 0; i < values.length; i += 1) {
      var d = values[i] - m;
      s += d * d;
    }
    return s / Math.max(1, values.length - 1);
  }

  function normalPdf(x, m, v) {
    return Math.exp(-0.5 * (x - m) * (x - m) / v) / Math.sqrt(2 * Math.PI * v);
  }

  function modelInfo(params) {
    if (params.model === "normal") {
      return {
        theta: params.mu,
        label: "normal mean",
        symbol: "mu",
        domainMin: params.mu - 4 * params.sigma / Math.sqrt(params.sampleSize),
        domainMax: params.mu + 4 * params.sigma / Math.sqrt(params.sampleSize),
        fisher: params.sampleSize / (params.sigma * params.sigma),
        crlb: params.sigma * params.sigma / params.sampleSize
      };
    }
    return {
      theta: params.probability,
      label: "Bernoulli probability",
      symbol: "p",
      domainMin: Math.max(0.001, params.probability - 4 * Math.sqrt(params.probability * (1 - params.probability) / params.sampleSize)),
      domainMax: Math.min(0.999, params.probability + 4 * Math.sqrt(params.probability * (1 - params.probability) / params.sampleSize)),
      fisher: params.sampleSize / (params.probability * (1 - params.probability)),
      crlb: params.probability * (1 - params.probability) / params.sampleSize
    };
  }

  function simulate(params) {
    var random = rng(params.seed);
    var estimates = new Float64Array(params.experiments);
    var scores = new Float64Array(params.experiments);
    var firstCount = 0;
    var firstSum = 0;
    for (var e = 0; e < params.experiments; e += 1) {
      var sum = 0;
      var i;
      if (params.model === "normal") {
        for (i = 0; i < params.sampleSize; i += 2) {
          var pair = normalPair(random);
          sum += params.mu + params.sigma * pair[0];
          if (i + 1 < params.sampleSize) sum += params.mu + params.sigma * pair[1];
        }
        estimates[e] = sum / params.sampleSize;
        scores[e] = params.sampleSize * (estimates[e] - params.mu) / (params.sigma * params.sigma);
        if (e === 0) firstSum = sum;
      } else {
        for (i = 0; i < params.sampleSize; i += 1) {
          if (random() < params.probability) sum += 1;
        }
        estimates[e] = sum / params.sampleSize;
        scores[e] = (sum - params.sampleSize * params.probability) / (params.probability * (1 - params.probability));
        if (e === 0) firstCount = sum;
      }
    }
    return { estimates: estimates, scores: scores, firstCount: firstCount, firstSum: firstSum };
  }

  function relativeExpectedLogLikelihood(params, theta) {
    if (params.model === "normal") {
      return -0.5 * params.sampleSize * Math.pow(theta - params.mu, 2) / (params.sigma * params.sigma);
    }
    theta = clamp(theta, 1e-6, 1 - 1e-6);
    var p = params.probability;
    return params.sampleSize * (p * Math.log(theta / p) + (1 - p) * Math.log((1 - theta) / (1 - p)));
  }

  function histogram(values, min, max, bins) {
    var counts = new Array(bins);
    for (var i = 0; i < bins; i += 1) counts[i] = 0;
    var width = (max - min) || 1;
    for (var j = 0; j < values.length; j += 1) {
      var b = Math.floor((values[j] - min) / width * bins);
      if (b >= 0 && b < bins) counts[b] += 1;
    }
    return counts;
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var info = modelInfo(params);
    var sim = simulate(params);
    var estimateMean = mean(sim.estimates);
    var estimateVariance = variance(sim.estimates);
    var scoreMean = mean(sim.scores);
    var scoreVariance = variance(sim.scores);
    var result = {
      params: params,
      info: info,
      estimates: sim.estimates,
      scores: sim.scores,
      firstCount: sim.firstCount,
      firstSum: sim.firstSum,
      estimateMean: estimateMean,
      estimateBias: estimateMean - info.theta,
      estimateVariance: estimateVariance,
      scoreMean: scoreMean,
      scoreVariance: scoreVariance,
      varianceRatio: estimateVariance / info.crlb,
      scoreRatio: scoreVariance / info.fisher
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var checks = [];
    function check(name, passed) {
      checks.push({ name: name, passed: !!passed });
    }
    check("Fisher information is positive", result.info.fisher > 0 && Number.isFinite(result.info.fisher));
    check("CRLB is reciprocal information", Math.abs(result.info.crlb - 1 / result.info.fisher) < 1e-12);
    check("Monte Carlo variance is near CRLB", Math.abs(result.varianceRatio - 1) < 0.22);
    check("score variance is near information", Math.abs(result.scoreRatio - 1) < 0.22);
    check("score mean is small", Math.abs(result.scoreMean) < 0.12 * Math.sqrt(result.info.fisher));
    check("bias is small relative to standard error", Math.abs(result.estimateBias) < 0.18 * Math.sqrt(result.info.crlb));
    check("likelihood peaks at true parameter", relativeExpectedLogLikelihood(result.params, result.info.theta) >= -1e-12);
    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function auditGrid() {
    var cases = [
      {},
      { model: "normal", sampleSize: 25, experiments: 1800, mu: -0.8, sigma: 2.2, seed: 8 },
      { model: "normal", sampleSize: 220, experiments: 1200, mu: 1.1, sigma: 0.7, seed: 99 },
      { model: "bernoulli", sampleSize: 60, experiments: 2200, probability: 0.35, seed: 23 },
      { model: "bernoulli", sampleSize: 180, experiments: 1800, probability: 0.72, seed: 77 }
    ].map(function (row, index) {
      var result = evaluate(row);
      return {
        caseId: index + 1,
        params: result.params,
        model: result.params.model,
        sampleSize: result.params.sampleSize,
        experiments: result.params.experiments,
        seed: result.params.seed,
        fisher: result.info.fisher,
        crlb: result.info.crlb,
        estimateVariance: result.estimateVariance,
        varianceRatio: result.varianceRatio,
        scoreRatio: result.scoreRatio,
        bias: result.estimateBias,
        passed: result.audit.passed,
        failedChecks: result.audit.checks.filter(function (check) { return !check.passed; }).map(function (check) { return check.name; })
      };
    });
    return {
      cases: cases,
      passed: cases.filter(function (row) { return row.passed; }).length,
      total: cases.length
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(digits == null ? 2 : digits);
    return value.toFixed(digits == null ? 4 : digits);
  }

  function metric(label, value, className) {
    return '<div class="fisher-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 900));
    var cssHeight = cssWidth < 700 ? 820 : 610;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    else ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, COLORS.muted, 11, 560);
  }

  function drawAxes(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawLikelihood(ctx, box, result) {
    panel(ctx, box, "likelihood curvature", "expected log-likelihood near the true parameter");
    var plot = { x: box.x + 42, y: box.y + 66, w: box.w - 64, h: box.h - 104 };
    drawAxes(ctx, plot);
    var minX = result.info.domainMin;
    var maxX = result.info.domainMax;
    var minY = -8;
    var maxY = 0.2;
    function sx(v) { return plot.x + (v - minX) / (maxX - minX) * plot.w; }
    function sy(v) { return plot.y + plot.h - (v - minY) / (maxY - minY) * plot.h; }
    function drawLine(color, fn, dash) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      for (var i = 0; i <= 160; i += 1) {
        var theta = minX + (maxX - minX) * i / 160;
        var y = clamp(fn(theta), minY, maxY);
        var x = sx(theta);
        var yy = sy(y);
        if (i === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawLine(COLORS.blue, function (theta) { return relativeExpectedLogLikelihood(result.params, theta); });
    drawLine(COLORS.good, function (theta) {
      var d = theta - result.info.theta;
      return -0.5 * result.info.fisher * d * d;
    }, [5, 5]);
    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx(result.info.theta), plot.y);
    ctx.lineTo(sx(result.info.theta), plot.y + plot.h);
    ctx.stroke();
    text(ctx, result.info.symbol + " = " + fmt(result.info.theta, 3), sx(result.info.theta) + 5, plot.y + 14, COLORS.bad, 10, 700);
    text(ctx, "blue: expected log L", plot.x, box.y + box.h - 22, COLORS.blue, 11, 700);
    text(ctx, "green: -I(theta)(dtheta)^2/2", plot.x + 140, box.y + box.h - 22, COLORS.good, 11, 700);
  }

  function drawHistogram(ctx, box, result) {
    panel(ctx, box, "estimator sampling distribution", "Monte Carlo MLEs over repeated experiments");
    var plot = { x: box.x + 42, y: box.y + 66, w: box.w - 64, h: box.h - 104 };
    drawAxes(ctx, plot);
    var se = Math.sqrt(result.info.crlb);
    var minX = result.info.theta - 4 * se;
    var maxX = result.info.theta + 4 * se;
    if (result.params.model === "bernoulli") {
      minX = Math.max(-0.02, minX);
      maxX = Math.min(1.02, maxX);
    }
    var bins = 34;
    var counts = histogram(result.estimates, minX, maxX, bins);
    var maxCount = Math.max.apply(null, counts.concat([1]));
    for (var i = 0; i < bins; i += 1) {
      var x = plot.x + i * plot.w / bins;
      var w = plot.w / bins - 1;
      var h = counts[i] / maxCount * plot.h;
      ctx.fillStyle = "rgba(37, 99, 235, 0.26)";
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
    }
    ctx.strokeStyle = COLORS.good;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (var j = 0; j <= 140; j += 1) {
      var theta = minX + (maxX - minX) * j / 140;
      var density = normalPdf(theta, result.info.theta, result.info.crlb);
      var y = plot.y + plot.h - density / normalPdf(result.info.theta, result.info.theta, result.info.crlb) * plot.h * 0.92;
      var xx = plot.x + (theta - minX) / (maxX - minX) * plot.w;
      if (j === 0) ctx.moveTo(xx, y);
      else ctx.lineTo(xx, y);
    }
    ctx.stroke();
    var tx = plot.x + (result.info.theta - minX) / (maxX - minX) * plot.w;
    ctx.strokeStyle = COLORS.bad;
    ctx.beginPath();
    ctx.moveTo(tx, plot.y);
    ctx.lineTo(tx, plot.y + plot.h);
    ctx.stroke();
    text(ctx, "green: N(theta, 1/I)", plot.x, box.y + box.h - 22, COLORS.good, 11, 700);
    text(ctx, "empirical var / bound = " + fmt(result.varianceRatio, 3), plot.x + 150, box.y + box.h - 22, COLORS.text, 11, 700);
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "information ledger", "score variance and estimator variance should meet the bound here");
    var rows = [
      ["Fisher information I", fmt(result.info.fisher, 3), COLORS.purple],
      ["CRLB 1/I", fmt(result.info.crlb, 6), COLORS.good],
      ["empirical var", fmt(result.estimateVariance, 6), COLORS.blue],
      ["var / bound", fmt(result.varianceRatio, 3), Math.abs(result.varianceRatio - 1) < 0.15 ? COLORS.good : COLORS.amber],
      ["score var / I", fmt(result.scoreRatio, 3), Math.abs(result.scoreRatio - 1) < 0.15 ? COLORS.good : COLORS.amber],
      ["bias", fmt(result.estimateBias, 5), Math.abs(result.estimateBias) < 0.1 * Math.sqrt(result.info.crlb) ? COLORS.good : COLORS.amber]
    ];
    var y = box.y + 70;
    rows.forEach(function (row) {
      text(ctx, row[0], box.x + 18, y, COLORS.muted, 11, 650);
      text(ctx, row[1], box.x + box.w - 18, y, row[2], 12, 780, "right");
      y += 29;
    });
  }

  function drawScore(ctx, box, result) {
    panel(ctx, box, "score identity", "the score has mean zero and variance I(theta)");
    var plot = { x: box.x + 42, y: box.y + 70, w: box.w - 64, h: box.h - 106 };
    drawAxes(ctx, plot);
    var maxAbs = Math.max(4 * Math.sqrt(result.info.fisher), 1);
    var bins = 32;
    var counts = histogram(result.scores, -maxAbs, maxAbs, bins);
    var maxCount = Math.max.apply(null, counts.concat([1]));
    for (var i = 0; i < bins; i += 1) {
      var x = plot.x + i * plot.w / bins;
      var h = counts[i] / maxCount * plot.h;
      ctx.fillStyle = "rgba(109, 40, 217, 0.24)";
      ctx.fillRect(x, plot.y + plot.h - h, plot.w / bins - 1, h);
    }
    var zero = plot.x + plot.w / 2;
    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(zero, plot.y);
    ctx.lineTo(zero, plot.y + plot.h);
    ctx.stroke();
    text(ctx, "mean score = " + fmt(result.scoreMean, 4), plot.x, box.y + box.h - 24, COLORS.text, 11, 700);
    text(ctx, "Var(score) / I = " + fmt(result.scoreRatio, 3), plot.x + 150, box.y + box.h - 24, COLORS.purple, 11, 700);
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    if (width < 700) {
      var gap = 14;
      var h = Math.floor((height - 3 * gap) / 4);
      drawLikelihood(ctx, { x: 0, y: 0, w: width, h: h }, result);
      drawHistogram(ctx, { x: 0, y: h + gap, w: width, h: h }, result);
      drawLedger(ctx, { x: 0, y: 2 * (h + gap), w: width, h: h }, result);
      drawScore(ctx, { x: 0, y: 3 * (h + gap), w: width, h: height - 3 * (h + gap) }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.56);
      var rightW = width - leftW - gap2;
      var upperH = Math.round(height * 0.52);
      drawLikelihood(ctx, { x: 0, y: 0, w: leftW, h: upperH }, result);
      drawHistogram(ctx, { x: 0, y: upperH + gap2, w: leftW, h: height - upperH - gap2 }, result);
      drawLedger(ctx, { x: leftW + gap2, y: 0, w: rightW, h: upperH }, result);
      drawScore(ctx, { x: leftW + gap2, y: upperH + gap2, w: rightW, h: height - upperH - gap2 }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      sampleSize: String(result.params.sampleSize),
      experiments: String(result.params.experiments),
      mu: result.params.mu.toFixed(2),
      sigma: result.params.sigma.toFixed(2),
      probability: result.params.probability.toFixed(2),
      seed: String(result.params.seed)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Model", result.info.label),
        metric("Fisher I", fmt(result.info.fisher, 3)),
        metric("CRLB", fmt(result.info.crlb, 6), "fisher-lab__metric--good"),
        metric("Empirical Var", fmt(result.estimateVariance, 6), Math.abs(result.varianceRatio - 1) < 0.18 ? "fisher-lab__metric--good" : "fisher-lab__metric--warn"),
        metric("Audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "fisher-lab__metric--good" : "fisher-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "The lab uses models where the MLE is unbiased and reaches the Cramer-Rao bound; this is a benchmark, not a promise for every estimator.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__fisherResult = result;
  }

  function init(root) {
    if (!root || root.__fisherReady) return;
    root.__fisherReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-fisher-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    evaluate: evaluate,
    modelInfo: modelInfo,
    relativeExpectedLogLikelihood: relativeExpectedLogLikelihood
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.FisherInformationLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
