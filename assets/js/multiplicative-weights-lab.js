(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    alg: "#2563eb",
    best: "#0f766e",
    bound: "#be123c",
    eta: "#7c3aed",
    loss: "#b45309",
    weight: "#15803d"
  };

  var DEFAULTS = {
    eta: 35,
    experts: 7,
    noise: 12,
    rounds: 180,
    scenario: "decoy",
    seed: 43
  };

  var SCENARIOS = {
    stationary: "one expert is quietly best",
    shifting: "the best expert changes",
    decoy: "early winner turns bad",
    adversary: "penalize the crowd"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = String(raw.scenario || DEFAULTS.scenario);
    if (!SCENARIOS[scenario]) scenario = DEFAULTS.scenario;
    return {
      eta: clamp(number(raw, "eta"), 5, 100) / 100,
      experts: clamp(Math.round(number(raw, "experts")), 3, 12),
      noise: clamp(number(raw, "noise"), 0, 35) / 100,
      rounds: clamp(Math.round(number(raw, "rounds")), 60, 360),
      scenario: scenario,
      seed: clamp(Math.round(number(raw, "seed")), 1, 9999)
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (digits != null) return value.toFixed(digits);
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="mw-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function cyclicDistance(a, b, n) {
    var d = Math.abs(a - b);
    return Math.min(d, n - d);
  }

  function noisy(value, params, t, i) {
    var wobble = 0.045 * Math.sin(0.17 * t + 1.91 * i + params.seed * 0.013);
    var random = params.noise * (uniform(t * 131 + i * 977, params.seed * 8191) - 0.5);
    return clamp(value + wobble + random, 0, 1);
  }

  function lossVector(params, t, probs) {
    var n = params.experts;
    var losses = [];
    var phase = t / Math.max(1, params.rounds - 1);
    var i;
    if (params.scenario === "adversary") {
      var maxP = -1;
      var target = 0;
      for (i = 0; i < n; i += 1) {
        if (probs[i] > maxP) {
          maxP = probs[i];
          target = i;
        }
      }
      for (i = 0; i < n; i += 1) {
        losses.push(noisy(i === target ? 0.92 : 0.08 + 0.03 * (i % 3), params, t, i));
      }
      return losses;
    }

    if (params.scenario === "shifting") {
      var leader = Math.min(n - 1, Math.floor(phase * n));
      for (i = 0; i < n; i += 1) {
        losses.push(noisy(0.16 + 0.12 * cyclicDistance(i, leader, n), params, t, i));
      }
      return losses;
    }

    if (params.scenario === "decoy") {
      for (i = 0; i < n; i += 1) {
        var base;
        if (i === 0) base = phase < 0.34 ? 0.08 : 0.77;
        else if (i === 1) base = 0.31;
        else base = 0.38 + 0.045 * i;
        losses.push(noisy(base, params, t, i));
      }
      return losses;
    }

    for (i = 0; i < n; i += 1) {
      losses.push(noisy(0.18 + 0.055 * i, params, t, i));
    }
    return losses;
  }

  function probabilities(logWeights) {
    var max = Math.max.apply(null, logWeights);
    var raw = logWeights.map(function (w) { return Math.exp(w - max); });
    var total = raw.reduce(function (sum, value) { return sum + value; }, 0);
    return raw.map(function (value) { return value / total; });
  }

  function argmin(values) {
    var best = 0;
    for (var i = 1; i < values.length; i += 1) {
      if (values[i] < values[best]) best = i;
    }
    return best;
  }

  function argmax(values) {
    var best = 0;
    for (var i = 1; i < values.length; i += 1) {
      if (values[i] > values[best]) best = i;
    }
    return best;
  }

  function runHedge(params, etaOverride) {
    var eta = etaOverride == null ? params.eta : etaOverride;
    var logWeights = [];
    var expertLoss = [];
    var rows = [];
    var heat = [];
    var algLoss = 0;
    var n = params.experts;
    var t;
    var i;
    for (i = 0; i < n; i += 1) {
      logWeights.push(0);
      expertLoss.push(0);
    }

    for (t = 0; t < params.rounds; t += 1) {
      var probs = probabilities(logWeights);
      var losses = lossVector(params, t, probs);
      var roundLoss = 0;
      for (i = 0; i < n; i += 1) {
        roundLoss += probs[i] * losses[i];
      }
      algLoss += roundLoss;
      for (i = 0; i < n; i += 1) {
        expertLoss[i] += losses[i];
        logWeights[i] -= eta * losses[i];
      }
      var bestLoss = Math.min.apply(null, expertLoss);
      rows.push({
        algLoss: algLoss,
        bestLoss: bestLoss,
        bound: bestLoss + Math.log(n) / eta + eta * (t + 1) / 8,
        regret: algLoss - bestLoss,
        roundLoss: roundLoss,
        t: t
      });
      heat.push(losses);
    }

    var finalProbs = probabilities(logWeights);
    var bestExpert = argmin(expertLoss);
    var topExpert = argmax(finalProbs);
    var regret = algLoss - expertLoss[bestExpert];
    var boundGap = Math.log(n) / eta + eta * params.rounds / 8;
    return {
      algLoss: algLoss,
      bestExpert: bestExpert,
      bestLoss: expertLoss[bestExpert],
      boundGap: boundGap,
      eta: eta,
      expertLoss: expertLoss,
      finalProbs: finalProbs,
      heat: heat,
      regret: regret,
      rows: rows,
      topExpert: topExpert
    };
  }

  function etaSweep(params) {
    var etas = [0.05, 0.08, 0.12, 0.18, 0.25, 0.35, 0.50, 0.70, 1.00];
    return etas.map(function (eta) {
      var run = runHedge(params, eta);
      return {
        boundGap: run.boundGap,
        eta: eta,
        regret: run.regret
      };
    });
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var run = runHedge(params);
    var sweep = etaSweep(params);
    var finalBound = run.bestLoss + run.boundGap;
    return {
      checks: {
        boundHolds: run.algLoss <= finalBound + 1e-9,
        probabilitiesSum: Math.abs(run.finalProbs.reduce(function (sum, value) { return sum + value; }, 0) - 1) < 1e-9,
        regretFinite: Number.isFinite(run.regret),
        weightsNonnegative: run.finalProbs.every(function (value) { return value >= 0; })
      },
      params: params,
      run: run,
      sweep: sweep
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(root, params) {
    var values = {
      eta: formatNumber(params.eta, 2),
      experts: String(params.experts),
      noise: formatPercent(params.noise, 0),
      rounds: String(params.rounds),
      scenario: SCENARIOS[params.scenario],
      seed: String(params.seed)
    };
    Object.keys(values).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (node) {
        node.textContent = values[key];
      });
    });
  }

  function updateControls(root, params) {
    var values = {
      eta: Math.round(params.eta * 100),
      experts: params.experts,
      noise: Math.round(params.noise * 100),
      rounds: params.rounds,
      scenario: params.scenario,
      seed: params.seed
    };
    Object.keys(values).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && String(input.value) !== String(values[key])) input.value = values[key];
    });
  }

  function updateMetrics(root, result) {
    var run = result.run;
    var checksPassed = Object.keys(result.checks).every(function (key) { return result.checks[key]; });
    var html = [
      metric("Algorithm loss", formatNumber(run.algLoss)),
      metric("Best fixed", "E" + (run.bestExpert + 1) + " / " + formatNumber(run.bestLoss)),
      metric("Regret", formatNumber(run.regret, 2)),
      metric("Bound gap", formatNumber(run.boundGap, 2)),
      metric("Top weight", "E" + (run.topExpert + 1) + " / " + formatPercent(run.finalProbs[run.topExpert], 0)),
      metric("Checks", checksPassed ? "passed" : "inspect")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function setupCanvas(canvas, cssHeight) {
    var width = Math.max(320, Math.round(canvas.getBoundingClientRect().width || canvas.clientWidth || 900));
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, cssHeight);
    return { ctx: ctx, height: cssHeight, width: width };
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

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(text), x, y);
    ctx.textAlign = "left";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 24, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 43, 11, COLORS.muted, 560);
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    ctx.strokeStyle = COLORS.grid;
    for (var i = 1; i < 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawSeries(ctx, rows, plot, key, maxValue, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = plot.x + row.t / Math.max(1, rows.length - 1) * plot.w;
      var y = plot.y + plot.h - row[key] / maxValue * plot.h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawLossPanel(ctx, result, box) {
    panel(ctx, box, "cumulative loss", "blue follows the weighted mixture; green is best fixed expert");
    var rows = result.run.rows;
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 64, h: box.h - 94 };
    var max = Math.max.apply(null, rows.map(function (row) {
      return Math.max(row.algLoss, row.bestLoss, row.bound);
    }).concat([1]));
    drawAxis(ctx, plot);
    drawSeries(ctx, rows, plot, "bound", max, COLORS.bound, 1.5);
    drawSeries(ctx, rows, plot, "bestLoss", max, COLORS.best, 2.2);
    drawSeries(ctx, rows, plot, "algLoss", max, COLORS.alg, 2.4);
    drawText(ctx, "alg", plot.x + 8, plot.y + 15, 10, COLORS.alg, 760);
    drawText(ctx, "best", plot.x + 42, plot.y + 15, 10, COLORS.best, 760);
    drawText(ctx, "certificate", plot.x + 82, plot.y + 15, 10, COLORS.bound, 760);
    drawText(ctx, formatNumber(max), plot.x - 6, plot.y + 4, 10, COLORS.muted, 650, "right");
  }

  function drawWeightPanel(ctx, result, box) {
    panel(ctx, box, "final expert weights", "loss is converted into probability mass");
    var probs = result.run.finalProbs;
    var losses = result.run.expertLoss;
    var plot = { x: box.x + 34, y: box.y + 58, w: box.w - 56, h: box.h - 96 };
    var maxLoss = Math.max.apply(null, losses.concat([1]));
    var slot = plot.w / probs.length;
    for (var i = 0; i < probs.length; i += 1) {
      var x = plot.x + i * slot + slot * 0.16;
      var bw = Math.max(4, slot * 0.52);
      var h = plot.h * probs[i];
      ctx.fillStyle = i === result.run.bestExpert ? COLORS.best : COLORS.weight;
      ctx.globalAlpha = i === result.run.topExpert ? 0.95 : 0.62;
      ctx.fillRect(x, plot.y + plot.h - h, bw, h);
      ctx.globalAlpha = 1;
      var lossH = plot.h * losses[i] / maxLoss;
      ctx.strokeStyle = COLORS.loss;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, plot.y + plot.h - lossH);
      ctx.lineTo(x + bw, plot.y + plot.h - lossH);
      ctx.stroke();
      drawText(ctx, "E" + (i + 1), x + bw / 2, plot.y + plot.h + 18, 10, COLORS.muted, 650, "center");
    }
    drawText(ctx, "probability bars", plot.x, box.y + box.h - 18, 10, COLORS.weight, 760);
    drawText(ctx, "orange ticks are cumulative losses", plot.x + 100, box.y + box.h - 18, 10, COLORS.loss, 760);
  }

  function drawHeatPanel(ctx, result, box) {
    panel(ctx, box, "loss stream", "each row is an expert, darker means larger loss");
    var heat = result.run.heat;
    var experts = result.params.experts;
    var plot = { x: box.x + 40, y: box.y + 58, w: box.w - 62, h: box.h - 98 };
    var cellH = plot.h / experts;
    var step = Math.max(1, Math.ceil(heat.length / 90));
    var cols = Math.ceil(heat.length / step);
    var cellW = plot.w / cols;
    for (var c = 0; c < cols; c += 1) {
      var t = Math.min(heat.length - 1, c * step);
      for (var i = 0; i < experts; i += 1) {
        var loss = heat[t][i];
        ctx.fillStyle = "rgba(180,83,9," + (0.08 + 0.82 * loss).toFixed(3) + ")";
        ctx.fillRect(plot.x + c * cellW, plot.y + i * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    for (i = 0; i < experts; i += 1) {
      drawText(ctx, "E" + (i + 1), plot.x - 8, plot.y + i * cellH + cellH * 0.62, 10, COLORS.muted, 650, "right");
    }
    drawText(ctx, "round", plot.x + plot.w, box.y + box.h - 18, 10, COLORS.muted, 650, "right");
  }

  function drawEtaPanel(ctx, result, box) {
    panel(ctx, box, "learning-rate sweep", "too small is slow; too large can chase noise");
    var rows = result.sweep;
    var plot = { x: box.x + 42, y: box.y + 60, w: box.w - 64, h: box.h - 98 };
    var max = Math.max.apply(null, rows.map(function (row) {
      return Math.max(Math.max(0, row.regret), row.boundGap);
    }).concat([1]));
    drawAxis(ctx, plot);
    function xScale(index) { return plot.x + index / Math.max(1, rows.length - 1) * plot.w; }
    function yScale(value) { return plot.y + plot.h - value / max * plot.h; }
    ctx.strokeStyle = COLORS.bound;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = xScale(index);
      var y = yScale(row.boundGap);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.strokeStyle = COLORS.eta;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = xScale(index);
      var y = yScale(Math.max(0, row.regret));
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    rows.forEach(function (row, index) {
      var x = xScale(index);
      var y = yScale(Math.max(0, row.regret));
      ctx.fillStyle = Math.abs(row.eta - result.params.eta) < 1e-9 ? COLORS.alg : COLORS.eta;
      ctx.beginPath();
      ctx.arc(x, y, Math.abs(row.eta - result.params.eta) < 1e-9 ? 4 : 2.6, 0, Math.PI * 2);
      ctx.fill();
      if (index % 2 === 0) drawText(ctx, formatNumber(row.eta, 2), x, plot.y + plot.h + 18, 9, COLORS.muted, 600, "center");
    });
    drawText(ctx, "regret", plot.x + 8, plot.y + 16, 10, COLORS.eta, 760);
    drawText(ctx, "bound", plot.x + 58, plot.y + 16, 10, COLORS.bound, 760);
  }

  function draw(result, canvas) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var compact = width < 650;
    var prepared = setupCanvas(canvas, compact ? 1100 : 760);
    var ctx = prepared.ctx;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = prepared.width - 2 * pad;
    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawLossPanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawWeightPanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawHeatPanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawEtaPanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }
    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawLossPanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawWeightPanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawHeatPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawEtaPanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function renderOne(root) {
    var result = evaluate(readParams(root));
    updateControls(root, result.params);
    updateOutputs(root, result.params);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__mwResult = result;
  }

  function initOne(root) {
    if (root.__mwReady) return;
    root.__mwReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { renderOne(root); }, 50);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__mwResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__mwResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__mwResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__mwResult, canvas);
        }
      });
    }
    renderOne(root);
  }

  function init() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-multiplicative-weights-lab]")).forEach(initOne);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    lossVector: lossVector,
    runHedge: runHedge
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MultiplicativeWeightsLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
