(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    reverse: "#0f766e",
    finite: "#be123c",
    forward: "#2563eb",
    checkpoint: "#7c3aed",
    amber: "#b45309",
    tape: "#64748b"
  };

  var DEFAULTS = {
    steps: 40,
    nonlinearity: 45,
    epsPower: -6,
    checkpointStride: 8,
    seed: 19
  };

  var EPS_GRID = [-13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2];

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
    return (hash32((index + 1) | 0, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 1, seed));
    var u2 = uniform(index * 2 + 2, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    if (Math.abs(value) > 0 && Math.abs(value) < 0.001) return value.toExponential(1);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="adjoint-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function cleanParams(raw) {
    raw = raw || {};
    var steps = clamp(Math.round(raw.steps == null ? DEFAULTS.steps : raw.steps), 8, 96);
    return {
      checkpointStride: clamp(Math.round(raw.checkpointStride == null ? DEFAULTS.checkpointStride : raw.checkpointStride), 1, steps),
      epsPower: clamp(Math.round(raw.epsPower == null ? DEFAULTS.epsPower : raw.epsPower), -13, -2),
      nonlinearity: clamp(raw.nonlinearity == null ? DEFAULTS.nonlinearity : Number(raw.nonlinearity), 0, 100) / 100,
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 99),
      steps: steps
    };
  }

  function readState(container, previous) {
    var raw = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var display = {
      checkpointStride: String(params.checkpointStride),
      epsPower: "1e" + params.epsPower,
      nonlinearity: Math.round(params.nonlinearity * 100) + "%",
      seed: String(params.seed),
      steps: String(params.steps)
    };
    Object.keys(display).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = display[key];
      });
    });
  }

  function makeTheta(params) {
    var theta = [];
    for (var t = 0; t < params.steps; t += 1) {
      var a = 0.74 + 0.18 * Math.sin((t + 1) * 0.37 + params.seed * 0.11) + 0.035 * normal(t * 17 + 3, params.seed);
      var b = 0.28 * Math.sin((t + 1) * 0.23 + params.seed * 0.07) + 0.04 * normal(t * 19 + 7, params.seed ^ 0xa5a5);
      theta.push(a, b);
    }
    return theta;
  }

  function target(params) {
    return 0.22 * Math.sin(params.seed * 0.29) - 0.08 * Math.cos(params.steps * 0.13);
  }

  function stepValue(x, a, b, params, t) {
    var z = a * x + b;
    var tanh = Math.tanh(z);
    var residual = 0.36 * params.nonlinearity * x / (1 + x * x);
    var ripple = 0.025 * Math.sin((t + 1) * 0.11 * x);
    return tanh + residual + ripple;
  }

  function localPartials(x, a, b, params, t) {
    var z = a * x + b;
    var tanh = Math.tanh(z);
    var sech2 = Math.max(0, 1 - tanh * tanh);
    var denom = 1 + x * x;
    var residualDx = 0.36 * params.nonlinearity * (1 - x * x) / (denom * denom);
    var rippleDx = 0.025 * (t + 1) * 0.11 * Math.cos((t + 1) * 0.11 * x);
    return {
      da: sech2 * x,
      db: sech2,
      dx: sech2 * a + residualDx + rippleDx,
      value: tanh + 0.36 * params.nonlinearity * x / denom + 0.025 * Math.sin((t + 1) * 0.11 * x)
    };
  }

  function lossFromFinal(x, params) {
    var diff = x - target(params);
    return 0.5 * diff * diff;
  }

  function lossDerivative(x, params) {
    return x - target(params);
  }

  function primal(theta, params) {
    var x = 0.31 + 0.08 * Math.sin(params.seed);
    for (var t = 0; t < params.steps; t += 1) {
      x = stepValue(x, theta[2 * t], theta[2 * t + 1], params, t);
    }
    return lossFromFinal(x, params);
  }

  function reverseGradient(theta, params) {
    var states = [0.31 + 0.08 * Math.sin(params.seed)];
    var locals = [];
    for (var t = 0; t < params.steps; t += 1) {
      var part = localPartials(states[t], theta[2 * t], theta[2 * t + 1], params, t);
      locals.push(part);
      states.push(part.value);
    }
    var grad = new Array(theta.length).fill(0);
    var bar = lossDerivative(states[states.length - 1], params);
    for (var r = params.steps - 1; r >= 0; r -= 1) {
      grad[2 * r] = bar * locals[r].da;
      grad[2 * r + 1] = bar * locals[r].db;
      bar *= locals[r].dx;
    }
    return {
      final: states[states.length - 1],
      grad: grad,
      loss: lossFromFinal(states[states.length - 1], params),
      locals: locals,
      states: states
    };
  }

  function forwardModeGradient(theta, params) {
    var p = theta.length;
    var x = 0.31 + 0.08 * Math.sin(params.seed);
    var dx = new Array(p).fill(0);
    for (var t = 0; t < params.steps; t += 1) {
      var part = localPartials(x, theta[2 * t], theta[2 * t + 1], params, t);
      var next = new Array(p);
      for (var i = 0; i < p; i += 1) next[i] = part.dx * dx[i];
      next[2 * t] += part.da;
      next[2 * t + 1] += part.db;
      dx = next;
      x = part.value;
    }
    var lossBar = lossDerivative(x, params);
    return dx.map(function (v) { return lossBar * v; });
  }

  function finiteDifferenceGradient(theta, params, eps) {
    var grad = new Array(theta.length);
    var plusTheta = theta.slice();
    var minusTheta = theta.slice();
    for (var i = 0; i < theta.length; i += 1) {
      plusTheta[i] = theta[i] + eps;
      minusTheta[i] = theta[i] - eps;
      grad[i] = (primal(plusTheta, params) - primal(minusTheta, params)) / (2 * eps);
      plusTheta[i] = theta[i];
      minusTheta[i] = theta[i];
    }
    return grad;
  }

  function rmsDiff(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) {
      var d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum / Math.max(1, a.length));
  }

  function maxAbs(values) {
    var m = 0;
    values.forEach(function (v) { m = Math.max(m, Math.abs(v)); });
    return m;
  }

  function checkpointPolicy(steps, stride) {
    if (stride <= 1) {
      return {
        extraFactor: 1,
        memory: steps + 1,
        name: "full tape",
        stride: 1
      };
    }
    var checkpoints = Math.ceil(steps / stride) + 1;
    return {
      extraFactor: 2,
      memory: checkpoints + stride + 1,
      name: "periodic",
      stride: stride
    };
  }

  function checkpointRows(steps) {
    var rows = [
      { extraFactor: 1, memory: steps + 1, name: "full tape", stride: 1 },
      { extraFactor: (steps + 1) / 2, memory: 1, name: "recompute all", stride: steps }
    ];
    for (var stride = 2; stride <= steps; stride += Math.max(1, Math.floor(steps / 40))) {
      rows.push(checkpointPolicy(steps, stride));
    }
    return rows;
  }

  function workModel(params) {
    var p = params.steps * 2;
    return {
      centralDifference: 2 * p + 1,
      forwardAll: p + 1,
      fullTapeMemory: params.steps + 1,
      parameterCount: p,
      primal: 1,
      reverse: 2,
      noTapeReverse: (params.steps + 1) / 2
    };
  }

  function epsilonSweep(theta, params, reverseGrad) {
    return EPS_GRID.map(function (power) {
      var eps = Math.pow(10, power);
      var fd = finiteDifferenceGradient(theta, params, eps);
      return {
        eps: eps,
        error: rmsDiff(fd, reverseGrad),
        power: power
      };
    });
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var theta = makeTheta(params);
    var reverse = reverseGradient(theta, params);
    var forwardGrad = forwardModeGradient(theta, params);
    var eps = Math.pow(10, params.epsPower);
    var finiteGrad = finiteDifferenceGradient(theta, params, eps);
    var sweep = epsilonSweep(theta, params, reverse.grad);
    var policy = checkpointPolicy(params.steps, params.checkpointStride);
    return {
      checkpointRows: checkpointRows(params.steps),
      finiteGrad: finiteGrad,
      finiteRms: rmsDiff(finiteGrad, reverse.grad),
      forwardRms: rmsDiff(forwardGrad, reverse.grad),
      params: params,
      policy: policy,
      reverse: reverse,
      sweep: sweep,
      theta: theta,
      work: workModel(params)
    };
  }

  function updateMetrics(node, result) {
    var w = result.work;
    var policy = result.policy;
    var memorySaved = 1 - policy.memory / Math.max(1, w.fullTapeMemory);
    node.innerHTML = [
      metric("Parameters", String(w.parameterCount)),
      metric("Finite diff work", formatNumber(w.centralDifference / w.reverse, 1) + "x reverse"),
      metric("FD RMS error", formatNumber(result.finiteRms, 2)),
      metric("Forward AD error", formatNumber(result.forwardRms, 2)),
      metric("Checkpoint memory", policy.memory + " values"),
      metric("Memory saved", formatNumber(100 * memorySaved, 0) + "%")
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.floor(rect.width || 900));
    var height = width < 700 ? 980 : 690;
    var ratio = root.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function label(ctx, text, x, y, color, align, size) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, x + 12, y + 22, COLORS.text, "left", 13);
  }

  function drawGradientPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Reverse gradient vs finite differences");
    var pad = { l: 42, r: 14, t: 44, b: 34 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var count = Math.min(56, result.reverse.grad.length);
    var all = result.reverse.grad.slice(0, count).concat(result.finiteGrad.slice(0, count));
    var scale = maxAbs(all) || 1;
    var zero = top + ph / 2;
    line(ctx, left, zero, left + pw, zero, COLORS.rule, 1);
    line(ctx, left, top, left, top + ph, COLORS.rule, 1);
    for (var i = 0; i < count; i += 1) {
      var xx = left + (i + 0.5) * pw / count;
      var ry = zero - (result.reverse.grad[i] / scale) * (ph * 0.43);
      var fy = zero - (result.finiteGrad[i] / scale) * (ph * 0.43);
      ctx.strokeStyle = COLORS.reverse;
      ctx.lineWidth = Math.max(1, pw / count * 0.35);
      ctx.beginPath();
      ctx.moveTo(xx, zero);
      ctx.lineTo(xx, ry);
      ctx.stroke();
      ctx.fillStyle = COLORS.finite;
      ctx.beginPath();
      ctx.arc(xx, fy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COLORS.reverse;
    ctx.fillRect(left + 4, top + 6, 10, 3);
    label(ctx, "reverse", left + 20, top + 11, COLORS.muted, "left", 11);
    ctx.fillStyle = COLORS.finite;
    ctx.beginPath();
    ctx.arc(left + 88, top + 8, 3, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, "finite diff", left + 98, top + 11, COLORS.muted, "left", 11);
    label(ctx, "first " + count + " parameters", left + pw / 2, y + h - 10, COLORS.muted, "center", 11);
  }

  function drawEpsilonPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Finite differences have a step-size cliff");
    var pad = { l: 48, r: 16, t: 44, b: 34 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var errors = result.sweep.map(function (row) { return Math.max(1e-16, row.error); });
    var minLog = Math.log10(Math.min.apply(null, errors)) - 0.2;
    var maxLog = Math.log10(Math.max.apply(null, errors)) + 0.2;
    function px(i) { return left + (i / Math.max(1, result.sweep.length - 1)) * pw; }
    function py(err) {
      var t = (Math.log10(Math.max(1e-16, err)) - minLog) / Math.max(1e-9, maxLog - minLog);
      return top + (1 - t) * ph;
    }
    line(ctx, left, top + ph, left + pw, top + ph, COLORS.rule, 1);
    line(ctx, left, top, left, top + ph, COLORS.rule, 1);
    ctx.strokeStyle = COLORS.finite;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.sweep.forEach(function (row, i) {
      var xx = px(i);
      var yy = py(row.error);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    result.sweep.forEach(function (row, i) {
      var selected = row.power === result.params.epsPower;
      ctx.fillStyle = selected ? COLORS.forward : COLORS.finite;
      ctx.beginPath();
      ctx.arc(px(i), py(row.error), selected ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (i % 2 === 0) label(ctx, String(row.power), px(i), y + h - 12, COLORS.muted, "center", 11);
    });
    label(ctx, "log10 epsilon", left + pw / 2, y + h - 10, COLORS.muted, "center", 11);
    label(ctx, "RMS error", x + 10, top + 10, COLORS.muted, "left", 11);
  }

  function drawWorkPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Full-gradient work relative to one primal run");
    var pad = { l: 44, r: 18, t: 48, b: 42 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var rows = [
      { color: COLORS.tape, label: "primal", value: result.work.primal },
      { color: COLORS.reverse, label: "reverse", value: result.work.reverse },
      { color: COLORS.forward, label: "forward", value: result.work.forwardAll },
      { color: COLORS.finite, label: "finite", value: result.work.centralDifference }
    ];
    var maxLog = Math.log10(Math.max.apply(null, rows.map(function (r) { return r.value; })));
    function barHeight(value) {
      return (Math.log10(value) / Math.max(1e-9, maxLog)) * ph;
    }
    line(ctx, left, top + ph, left + pw, top + ph, COLORS.rule, 1);
    rows.forEach(function (row, i) {
      var bw = Math.min(52, pw / (rows.length * 1.8));
      var xx = left + (i + 0.5) * pw / rows.length - bw / 2;
      var bh = barHeight(row.value);
      var yy = top + ph - bh;
      ctx.fillStyle = row.color;
      ctx.fillRect(xx, yy, bw, bh);
      label(ctx, formatNumber(row.value, 0) + "x", xx + bw / 2, yy - 6, COLORS.text, "center", 11);
      label(ctx, row.label, xx + bw / 2, y + h - 14, COLORS.muted, "center", 11);
    });
    label(ctx, "log scale", x + 10, top + 10, COLORS.muted, "left", 11);
  }

  function drawCheckpointPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "The tape is memory; checkpoints buy it back");
    var pad = { l: 50, r: 18, t: 44, b: 38 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var rows = result.checkpointRows;
    var maxMem = Math.max.apply(null, rows.map(function (r) { return r.memory; }));
    var maxWork = Math.max.apply(null, rows.map(function (r) { return r.extraFactor; }));
    function px(mem) {
      return left + (Math.log10(mem + 1) / Math.log10(maxMem + 1)) * pw;
    }
    function py(work) {
      return top + ph - (Math.log10(work) / Math.log10(maxWork)) * ph;
    }
    line(ctx, left, top + ph, left + pw, top + ph, COLORS.rule, 1);
    line(ctx, left, top, left, top + ph, COLORS.rule, 1);
    rows.forEach(function (row) {
      var isSelected = row.stride === result.policy.stride && row.name !== "recompute all";
      ctx.fillStyle = row.name === "recompute all" ? COLORS.amber : (row.name === "full tape" ? COLORS.tape : COLORS.checkpoint);
      ctx.globalAlpha = isSelected ? 1 : 0.58;
      ctx.beginPath();
      ctx.arc(px(row.memory), py(row.extraFactor), isSelected ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    label(ctx, "less memory", left + 6, y + h - 12, COLORS.muted, "left", 11);
    label(ctx, "more memory", left + pw - 6, y + h - 12, COLORS.muted, "right", 11);
    label(ctx, "more recompute", x + 10, top + 12, COLORS.muted, "left", 11);
    label(ctx, result.policy.name + ": " + result.policy.memory + " values, " + formatNumber(result.policy.extraFactor, 1) + "x forward work", left + 8, top + 20, COLORS.text, "left", 11);
  }

  function draw(result, canvas) {
    if (!canvas) return;
    var prepared = setupCanvas(canvas);
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 16;
    var gap = 14;
    if (width < 700) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawGradientPanel(ctx, result, pad, pad, width - pad * 2, panelH);
      drawEpsilonPanel(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawWorkPanel(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawCheckpointPanel(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }
    var halfW = (width - pad * 2 - gap) / 2;
    var halfH = (height - pad * 2 - gap) / 2;
    drawGradientPanel(ctx, result, pad, pad, halfW, halfH);
    drawEpsilonPanel(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawWorkPanel(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawCheckpointPanel(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-adjoint-tape-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    finiteDifferenceGradient: finiteDifferenceGradient,
    forwardModeGradient: forwardModeGradient,
    makeTheta: makeTheta,
    reverseGradient: reverseGradient
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AdjointTapeLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
