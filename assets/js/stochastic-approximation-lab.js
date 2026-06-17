(function (global) {
  "use strict";

  var COLORS = {
    avg: "#7c3aed",
    bad: "#be123c",
    curve: "#2563eb",
    grid: "#e6edf3",
    muted: "#5d6872",
    panel: "#f8fafc",
    raw: "#0f766e",
    rule: "#d7dee5",
    step: "#d97706",
    target: "#172026",
    text: "#172026",
    white: "#ffffff"
  };

  var DEFAULTS = {
    avgStart: 35,
    batch: 1,
    delay: 25,
    exponent: 67,
    gain: 80,
    replicas: 80,
    seed: 53,
    slope: 140,
    start: -140,
    steps: 1600,
    target: 65
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
      avgStart: Math.round(clamp(finite(Number(raw.avgStart), DEFAULTS.avgStart), 0, 90)),
      batch: Math.round(clamp(finite(Number(raw.batch), DEFAULTS.batch), 1, 32)),
      delay: Math.round(clamp(finite(Number(raw.delay), DEFAULTS.delay), 1, 240)),
      exponent: Math.round(clamp(finite(Number(raw.exponent), DEFAULTS.exponent), 35, 125)),
      gain: Math.round(clamp(finite(Number(raw.gain), DEFAULTS.gain), 5, 220)),
      replicas: Math.round(clamp(finite(Number(raw.replicas), DEFAULTS.replicas), 24, 180) / 4) * 4,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      slope: Math.round(clamp(finite(Number(raw.slope), DEFAULTS.slope), 40, 320)),
      start: Math.round(clamp(finite(Number(raw.start), DEFAULTS.start), -260, 260)),
      steps: Math.round(clamp(finite(Number(raw.steps), DEFAULTS.steps), 240, 5000) / 40) * 40,
      target: Math.round(clamp(finite(Number(raw.target), DEFAULTS.target), 15, 85))
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

  function logistic(z) {
    if (z > 40) return 1;
    if (z < -40) return 0;
    return 1 / (1 + Math.exp(-z));
  }

  function logit(p) {
    p = clamp(p, 1e-6, 1 - 1e-6);
    return Math.log(p / (1 - p));
  }

  function trueRoot(params) {
    return 0.35;
  }

  function responseProb(theta, params) {
    var target = params.target / 100;
    return logistic((params.slope / 100) * (theta - trueRoot(params)) + logit(target));
  }

  function stepSize(params, n) {
    var gamma = params.exponent / 100;
    return (params.gain / 100) / Math.pow(params.delay + n, gamma);
  }

  function updateTheta(theta, observation, params, n) {
    var target = params.target / 100;
    var next = theta - stepSize(params, n) * (observation - target);
    return clamp(next, -4, 4);
  }

  function observe(theta, params, rng) {
    var p = responseProb(theta, params);
    var sum = 0;
    for (var i = 0; i < params.batch; i += 1) {
      sum += rng() < p ? 1 : 0;
    }
    return sum / params.batch;
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
  }

  function rmse(values, target) {
    return Math.sqrt(values.reduce(function (sum, value) {
      return sum + (value - target) * (value - target);
    }, 0) / Math.max(1, values.length));
  }

  function quantiles(values) {
    var s = values.slice().sort(function (a, b) { return a - b; });
    function q(p) {
      var pos = (s.length - 1) * p;
      var lo = Math.floor(pos);
      var hi = Math.ceil(pos);
      if (lo === hi) return s[lo];
      return s[lo] + (s[hi] - s[lo]) * (pos - lo);
    }
    return {
      p05: q(0.05),
      p25: q(0.25),
      p50: q(0.50),
      p75: q(0.75),
      p95: q(0.95)
    };
  }

  function simulateOne(params, replica, keepTrace) {
    var rng = makeRng(params.seed * 104729 + replica * 8191 + params.steps);
    var theta = params.start / 100;
    var burn = Math.floor(params.steps * params.avgStart / 100);
    var avg = 0;
    var avgCount = 0;
    var trace = [];
    var hits = 0;
    var checkpoints = {};
    if (keepTrace) {
      for (var i = 0; i <= 160; i += 1) checkpoints[Math.round(i * params.steps / 160)] = true;
    }
    for (var n = 1; n <= params.steps; n += 1) {
      var y = observe(theta, params, rng);
      theta = updateTheta(theta, y, params, n);
      if (theta <= -3.999 || theta >= 3.999) hits += 1;
      if (n >= burn) {
        avgCount += 1;
        avg += (theta - avg) / avgCount;
      }
      if (keepTrace && checkpoints[n]) {
        trace.push({
          avg: avgCount ? avg : null,
          n: n,
          step: stepSize(params, n),
          theta: theta
        });
      }
    }
    return {
      avg: avgCount ? avg : theta,
      edgeHits: hits,
      raw: theta,
      trace: trace
    };
  }

  function conditions(params) {
    var gamma = params.exponent / 100;
    if (gamma <= 0.5) return "noise survives";
    if (gamma > 1) return "steps stop too soon";
    return "Robbins-Monro window";
  }

  function run(params) {
    var root = trueRoot(params);
    var raw = [];
    var averaged = [];
    var edges = 0;
    var firstTrace = [];
    for (var r = 0; r < params.replicas; r += 1) {
      var one = simulateOne(params, r, r === 0);
      raw.push(one.raw);
      averaged.push(one.avg);
      edges += one.edgeHits;
      if (r === 0) firstTrace = one.trace;
    }
    var rawErrors = raw.map(function (x) { return x - root; });
    var avgErrors = averaged.map(function (x) { return x - root; });
    return {
      avg: averaged,
      avgError: quantiles(avgErrors),
      avgRmse: rmse(averaged, root),
      avgBias: mean(avgErrors),
      conditions: conditions(params),
      edgeRate: edges / Math.max(1, params.steps * params.replicas),
      finalStep: stepSize(params, params.steps),
      params: params,
      raw: raw,
      rawBias: mean(rawErrors),
      rawError: quantiles(rawErrors),
      rawRmse: rmse(raw, root),
      root: root,
      trace: firstTrace
    };
  }

  function sweepExponents(params) {
    var out = [];
    [42, 50, 58, 67, 75, 85, 100, 115].forEach(function (exponent) {
      var local = Object.assign({}, params, {
        exponent: exponent,
        replicas: Math.min(56, params.replicas),
        steps: Math.min(2400, params.steps)
      });
      var result = run(local);
      out.push({
        avgRmse: result.avgRmse,
        condition: result.conditions,
        exponent: exponent / 100,
        rawRmse: result.rawRmse
      });
    });
    return out;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var result = run(params);
    result.sweep = sweepExponents(params);
    return result;
  }

  function audit() {
    var result = evaluate(DEFAULTS);
    var stable = result.conditions === "Robbins-Monro window";
    return {
      avgBeatsRaw: result.avgRmse < result.rawRmse,
      avgRmse: Number(result.avgRmse.toFixed(4)),
      condition: result.conditions,
      edgeRate: Number(result.edgeRate.toFixed(4)),
      finalStep: Number(result.finalStep.toFixed(5)),
      rawRmse: Number(result.rawRmse.toFixed(4)),
      root: Number(result.root.toFixed(4)),
      stableWindow: stable,
      targetProbAtRoot: Number(responseProb(result.root, result.params).toFixed(4))
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 3 : digits);
  }

  function percent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "target" || key === "avgStart") value += "%";
        if (key === "gain" || key === "slope") value = fmt(value / 100, 2);
        if (key === "exponent") value = fmt(value / 100, 2);
        out.textContent = value;
      });
    });
  }

  function metric(label, value, klass) {
    return '<div class="sa-lab__metric ' + (klass || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    box.innerHTML = [
      metric("true root", fmt(result.root, 3)),
      metric("raw RMSE", fmt(result.rawRmse, 3), result.rawRmse < 0.16 ? "good" : "warn"),
      metric("averaged RMSE", fmt(result.avgRmse, 3), result.avgRmse < result.rawRmse ? "good" : "warn"),
      metric("final step", fmt(result.finalStep, 4)),
      metric("step regime", result.conditions, result.conditions === "Robbins-Monro window" ? "good" : "warn"),
      metric("edge hits", percent(result.edgeRate, 2))
    ].join("");
  }

  function clear(ctx) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, x + 14, y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, x + 14, y + 41);
    }
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawResponse(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "hidden response curve", "the algorithm only observes noisy binary responses");
    var plot = { x: x + 48, y: y + 58, w: w - 80, h: h - 92 };
    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h * g / 4;
      line(ctx, plot.x, yy, plot.x + plot.w, yy, COLORS.grid, 1);
      label(ctx, String(100 - g * 25) + "%", x + 14, yy + 4, COLORS.muted, 10, 600);
    }
    function sx(theta) {
      return plot.x + (theta + 2.5) / 5 * plot.w;
    }
    function sy(prob) {
      return plot.y + plot.h - prob * plot.h;
    }
    ctx.strokeStyle = COLORS.curve;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i <= 180; i += 1) {
      var theta = -2.5 + 5 * i / 180;
      var xx = sx(theta);
      var yy = sy(responseProb(theta, result.params));
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    var targetY = sy(result.params.target / 100);
    line(ctx, plot.x, targetY, plot.x + plot.w, targetY, COLORS.target, 1.5);
    var rootX = sx(result.root);
    line(ctx, rootX, plot.y, rootX, plot.y + plot.h, COLORS.raw, 1.5);
    label(ctx, "target response", plot.x + 8, targetY - 7, COLORS.target, 11, 750);
    label(ctx, "root " + fmt(result.root, 2), rootX + 5, plot.y + 14, COLORS.raw, 11, 750);
  }

  function drawTrace(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "one noisy trajectory", "raw iterate versus tail average");
    var plot = { x: x + 45, y: y + 58, w: w - 70, h: h - 92 };
    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h * g / 4;
      line(ctx, plot.x, yy, plot.x + plot.w, yy, COLORS.grid, 1);
    }
    function sx(n) {
      return plot.x + n / result.params.steps * plot.w;
    }
    function sy(theta) {
      return plot.y + plot.h - (theta + 2.2) / 4.4 * plot.h;
    }
    line(ctx, plot.x, sy(result.root), plot.x + plot.w, sy(result.root), COLORS.target, 1.5);
    [["theta", COLORS.raw], ["avg", COLORS.avg]].forEach(function (series) {
      ctx.strokeStyle = series[1];
      ctx.lineWidth = 2;
      ctx.beginPath();
      var started = false;
      result.trace.forEach(function (p) {
        var value = series[0] === "theta" ? p.theta : p.avg;
        if (value == null) return;
        var xx = sx(p.n);
        var yy = sy(value);
        if (!started) {
          ctx.moveTo(xx, yy);
          started = true;
        } else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    });
    label(ctx, "raw iterate", plot.x + 8, y + h - 18, COLORS.raw, 11, 750);
    label(ctx, "Polyak average", plot.x + 96, y + h - 18, COLORS.avg, 11, 750);
  }

  function drawErrorIntervals(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "replica error intervals", "final estimate minus true root");
    var plot = { x: x + 68, y: y + 68, w: w - 110, h: h - 108 };
    function sx(error) {
      return plot.x + (error + 0.7) / 1.4 * plot.w;
    }
    function drawBox(q, yy, color, labelText) {
      line(ctx, sx(q.p05), yy, sx(q.p95), yy, color, 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(sx(q.p25), yy - 13, Math.max(1, sx(q.p75) - sx(q.p25)), 26);
      ctx.globalAlpha = 1;
      line(ctx, sx(q.p50), yy - 16, sx(q.p50), yy + 16, color, 2);
      label(ctx, labelText, x + 18, yy + 4, color, 12, 800);
    }
    for (var g = -0.6; g <= 0.6001; g += 0.3) {
      var xx = sx(g);
      line(ctx, xx, plot.y, xx, plot.y + plot.h, COLORS.grid, 1);
      label(ctx, fmt(g, 1), xx, y + h - 22, COLORS.muted, 10, 600, "center");
    }
    line(ctx, sx(0), plot.y, sx(0), plot.y + plot.h, COLORS.target, 1.5);
    drawBox(result.rawError, plot.y + 48, COLORS.raw, "raw");
    drawBox(result.avgError, plot.y + 112, COLORS.avg, "avg");
    label(ctx, "RMSE raw " + fmt(result.rawRmse, 3) + " / avg " + fmt(result.avgRmse, 3), plot.x, y + h - 42, COLORS.muted, 11, 650);
  }

  function drawStepSchedule(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "step size contract", "sum steps must keep moving; square-sum should quiet noise");
    var plot = { x: x + 48, y: y + 62, w: w - 78, h: h - 96 };
    var maxStep = stepSize(result.params, 1);
    ctx.strokeStyle = COLORS.step;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i <= 180; i += 1) {
      var n = 1 + Math.round((result.params.steps - 1) * i / 180);
      var xx = plot.x + i / 180 * plot.w;
      var yy = plot.y + plot.h - stepSize(result.params, n) / maxStep * plot.h;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    label(ctx, "gamma = " + fmt(result.params.exponent / 100, 2), plot.x, plot.y + 15, COLORS.step, 12, 800);
    label(ctx, result.conditions, plot.x, plot.y + 36, result.conditions === "Robbins-Monro window" ? COLORS.raw : COLORS.bad, 12, 800);
    var gamma = result.params.exponent / 100;
    label(ctx, "sum a_n " + (gamma <= 1 ? "diverges" : "converges"), plot.x, y + h - 34, COLORS.muted, 11, 650);
    label(ctx, "sum a_n^2 " + (gamma > 0.5 ? "converges" : "diverges"), plot.x, y + h - 16, COLORS.muted, 11, 650);
  }

  function drawSweep(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "exponent sweep", "same gain, different forgetting rates");
    var plot = { x: x + 48, y: y + 56, w: w - 76, h: h - 86 };
    var maxY = Math.max.apply(null, result.sweep.map(function (p) { return Math.max(p.rawRmse, p.avgRmse); }).concat([0.05]));
    function sx(exponent) {
      return plot.x + (exponent - 0.42) / (1.15 - 0.42) * plot.w;
    }
    function sy(value) {
      return plot.y + plot.h - value / maxY * plot.h;
    }
    [0.5, 1.0].forEach(function (v) {
      line(ctx, sx(v), plot.y, sx(v), plot.y + plot.h, COLORS.rule, 1.5);
    });
    [["rawRmse", COLORS.raw], ["avgRmse", COLORS.avg]].forEach(function (series) {
      ctx.strokeStyle = series[1];
      ctx.lineWidth = 2;
      ctx.beginPath();
      result.sweep.forEach(function (p, i) {
        var xx = sx(p.exponent);
        var yy = sy(p[series[0]]);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    });
    result.sweep.forEach(function (p) {
      ctx.fillStyle = p.condition === "Robbins-Monro window" ? COLORS.avg : COLORS.bad;
      ctx.beginPath();
      ctx.arc(sx(p.exponent), sy(p.avgRmse), 3, 0, 2 * Math.PI);
      ctx.fill();
    });
    label(ctx, "raw", plot.x + 8, y + h - 17, COLORS.raw, 11, 750);
    label(ctx, "avg", plot.x + 52, y + h - 17, COLORS.avg, 11, 750);
    label(ctx, "0.5", sx(0.5), plot.y + plot.h + 15, COLORS.muted, 10, 650, "center");
    label(ctx, "1.0", sx(1.0), plot.y + plot.h + 15, COLORS.muted, 10, 650, "center");
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    clear(ctx);
    drawResponse(ctx, result, 18, 18, 430, 202);
    drawTrace(ctx, result, 472, 18, 430, 202);
    drawErrorIntervals(ctx, result, 18, 242, 430, 214);
    drawStepSchedule(ctx, result, 472, 242, 430, 214);
    drawSweep(ctx, result, 18, 478, 884, 198);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__stochasticApproximationLabResult = result;
  }

  function init(root) {
    if (!root || root.__stochasticApproximationLabInitialized) return;
    root.__stochasticApproximationLabInitialized = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function initAll() {
    global.document.querySelectorAll("[data-stochastic-approximation-lab]").forEach(init);
  }

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.StochasticApproximationLab = api;
})(typeof window !== "undefined" ? window : globalThis);
