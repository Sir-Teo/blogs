(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    sgd: "#c2410c",
    adam: "#2563eb",
    adamw: "#7c3aed",
    sharp: "#be123c",
    flat: "#0f766e",
    decay: "#d97706"
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
    if (Math.abs(value) >= 1000000) return value.toExponential(2);
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    if (Math.abs(value) >= 0.01) return value.toFixed(places);
    return value.toExponential(2);
  }

  function metric(label, value) {
    return '<div class="adam-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      alpha: clamp(raw.alpha == null ? 4 : Number(raw.alpha), 1, 12) / 100,
      beta2: clamp(raw.beta2 == null ? 95 : Number(raw.beta2), 80, 99) / 100,
      decay: clamp(raw.decay == null ? 2 : Number(raw.decay), 0, 12) / 100,
      noise: clamp(raw.noise == null ? 0 : Number(raw.noise), 0, 50) / 100,
      ratio: clamp(raw.ratio == null ? 80 : Number(raw.ratio), 5, 300),
      steps: clamp(raw.steps == null ? 240 : Number(raw.steps), 60, 520) | 0
    };
  }

  function loss(params, w) {
    return 0.5 * (params.ratio * w.x * w.x + w.y * w.y);
  }

  function trueGrad(params, w) {
    return {
      x: params.ratio * w.x,
      y: w.y
    };
  }

  function noisyGrad(params, w, step, stream) {
    var g = trueGrad(params, w);
    if (params.noise <= 0) return g;
    return {
      x: g.x + params.noise * params.ratio * normal(step * 13 + stream * 101, 0xA11CE),
      y: g.y + params.noise * normal(step * 17 + stream * 103, 0xB0B)
    };
  }

  function makeState() {
    return {
      m: { x: 0, y: 0 },
      v: { x: 0, y: 0 },
      w: { x: 1, y: 1 }
    };
  }

  function stepAdam(params, state, step, decoupled, stream) {
    var beta1 = 0.9;
    var beta2 = params.beta2;
    var g = noisyGrad(params, state.w, step, stream);
    if (!decoupled) {
      g.x += params.decay * state.w.x;
      g.y += params.decay * state.w.y;
    }
    state.m.x = beta1 * state.m.x + (1 - beta1) * g.x;
    state.m.y = beta1 * state.m.y + (1 - beta1) * g.y;
    state.v.x = beta2 * state.v.x + (1 - beta2) * g.x * g.x;
    state.v.y = beta2 * state.v.y + (1 - beta2) * g.y * g.y;
    var mhatX = state.m.x / (1 - Math.pow(beta1, step));
    var mhatY = state.m.y / (1 - Math.pow(beta1, step));
    var vhatX = state.v.x / (1 - Math.pow(beta2, step));
    var vhatY = state.v.y / (1 - Math.pow(beta2, step));
    var effX = params.alpha / (Math.sqrt(vhatX) + 1e-8);
    var effY = params.alpha / (Math.sqrt(vhatY) + 1e-8);
    if (decoupled) {
      state.w.x *= 1 - params.alpha * params.decay;
      state.w.y *= 1 - params.alpha * params.decay;
    }
    state.w.x -= effX * mhatX;
    state.w.y -= effY * mhatY;
    return { effX: effX, effY: effY, gradX: g.x, gradY: g.y, vhatX: vhatX, vhatY: vhatY };
  }

  function record(params, step, states, adamStep, adamWStep) {
    return {
      adam: { x: states.adam.w.x, y: states.adam.w.y, loss: loss(params, states.adam.w) },
      adamEffX: adamStep ? adamStep.effX : params.alpha / params.ratio,
      adamEffY: adamStep ? adamStep.effY : params.alpha,
      adamVx: adamStep ? adamStep.vhatX : params.ratio * params.ratio,
      adamVy: adamStep ? adamStep.vhatY : 1,
      adamw: { x: states.adamw.w.x, y: states.adamw.w.y, loss: loss(params, states.adamw.w) },
      adamwEffX: adamWStep ? adamWStep.effX : params.alpha / params.ratio,
      adamwEffY: adamWStep ? adamWStep.effY : params.alpha,
      sgd: { x: states.sgd.x, y: states.sgd.y, loss: loss(params, states.sgd) },
      step: step
    };
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var states = {
      adam: makeState(),
      adamw: makeState(),
      sgd: { x: 1, y: 1 }
    };
    var history = [record(params, 0, states, null, null)];
    var sgdAlpha = params.alpha / params.ratio;
    for (var step = 1; step <= params.steps; step += 1) {
      var gSgd = noisyGrad(params, states.sgd, step, 1);
      gSgd.x += params.decay * states.sgd.x;
      gSgd.y += params.decay * states.sgd.y;
      states.sgd.x -= sgdAlpha * gSgd.x;
      states.sgd.y -= sgdAlpha * gSgd.y;
      var adamStep = stepAdam(params, states.adam, step, false, 2);
      var adamWStep = stepAdam(params, states.adamw, step, true, 3);
      history.push(record(params, step, states, adamStep, adamWStep));
    }
    var last = history[history.length - 1];
    var unitRatio = Math.sqrt(Math.max(1e-300, last.adamVx)) / Math.sqrt(Math.max(1e-300, last.adamVy));
    return {
      coupledDecaySkew: unitRatio,
      history: history,
      last: last,
      params: params,
      sgdAlpha: sgdAlpha,
      unitRatio: unitRatio
    };
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
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

  function drawLossPanel(ctx, result, box) {
    panelTitle(ctx, box, "Loss over time", "SGD is capped by the sharp coordinate; Adam changes units");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 70, h: box.h - 88 };
    drawAxis(ctx, plot);
    var losses = [];
    result.history.forEach(function (row) {
      losses.push(row.sgd.loss, row.adam.loss, row.adamw.loss);
    });
    var minLog = Math.log10(Math.max(1e-12, Math.min.apply(null, losses.filter(function (v) { return v > 0; }))));
    var maxLog = Math.log10(Math.max.apply(null, losses));
    minLog = Math.min(minLog, -8);
    function xScale(step) { return plot.x + step / result.params.steps * plot.w; }
    function yScale(value) {
      var logv = Math.log10(Math.max(1e-12, value));
      return plot.y + plot.h - (logv - minLog) / (maxLog - minLog) * plot.h;
    }
    [
      { key: "sgd", color: COLORS.sgd },
      { key: "adam", color: COLORS.adam },
      { key: "adamw", color: COLORS.adamw }
    ].forEach(function (line) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      result.history.forEach(function (row, i) {
        var x = xScale(row.step);
        var y = yScale(row[line.key].loss);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    label(ctx, "step", plot.x + plot.w, plot.y + plot.h + 15, "right");
    label(ctx, "log loss", plot.x - 8, plot.y, "right");
    label(ctx, "orange SGD, blue Adam, violet AdamW", plot.x, box.y + box.h - 13, "left");
  }

  function drawTrajectoryPanel(ctx, result, box) {
    panelTitle(ctx, box, "Parameter path", "the flat coordinate is where SGD spends its patience");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 70, h: box.h - 88 };
    drawAxis(ctx, plot);
    function xScale(x) { return plot.x + (x + 0.15) / 1.25 * plot.w; }
    function yScale(y) { return plot.y + plot.h - (y + 0.15) / 1.25 * plot.h; }
    [
      { key: "sgd", color: COLORS.sgd },
      { key: "adam", color: COLORS.adam },
      { key: "adamw", color: COLORS.adamw }
    ].forEach(function (line) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      result.history.forEach(function (row, i) {
        var x = xScale(row[line.key].x);
        var y = yScale(row[line.key].y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.text;
    ctx.beginPath();
    ctx.arc(xScale(0), yScale(0), 4, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, "sharp x", plot.x + plot.w, plot.y + plot.h + 15, "right");
    label(ctx, "flat y", plot.x - 8, plot.y, "right");
    label(ctx, "target at origin", xScale(0) + 6, yScale(0) - 8, "left", COLORS.text);
  }

  function drawEffectiveStepPanel(ctx, result, box) {
    panelTitle(ctx, box, "Adam effective step", "alpha divided by the square root of the second moment");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 70, h: box.h - 88 };
    drawAxis(ctx, plot);
    var values = [];
    result.history.forEach(function (row) {
      values.push(row.adamEffX, row.adamEffY);
    });
    var maxY = Math.max.apply(null, values) * 1.05;
    function xScale(step) { return plot.x + step / result.params.steps * plot.w; }
    function yScale(value) { return plot.y + plot.h - value / maxY * plot.h; }
    [
      { key: "adamEffX", color: COLORS.sharp, label: "sharp x" },
      { key: "adamEffY", color: COLORS.flat, label: "flat y" }
    ].forEach(function (line) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      result.history.slice(1).forEach(function (row, i) {
        var x = xScale(row.step);
        var y = yScale(row[line.key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    label(ctx, "effective coordinate learning rate", plot.x, box.y + box.h - 13, "left");
    label(ctx, "red sharp, green flat", plot.x + plot.w, box.y + box.h - 13, "right");
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Ledger", "adaptive scaling also changes what L2 decay means");
    var rows = [
      ["SGD step", result.sgdAlpha, null],
      ["Adam base step", result.params.alpha, null],
      ["SGD final loss", result.last.sgd.loss, null],
      ["Adam final loss", result.last.adam.loss, null],
      ["AdamW final loss", result.last.adamw.loss, null],
      ["SGD flat |y|", Math.abs(result.last.sgd.y), null],
      ["unit ratio sqrt(vx/vy)", result.unitRatio, null],
      ["coupled decay y/x", result.coupledDecaySkew, null]
    ];
    var start = box.y + 55;
    var rowH = Math.min(26, Math.max(19, (box.h - 76) / rows.length));
    rows.forEach(function (row, i) {
      var y = start + i * rowH;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.24)" : "transparent";
      ctx.fillRect(box.x, y - 2, box.w, rowH);
      label(ctx, row[0], box.x + 4, y + rowH / 2, "left");
      label(ctx, formatNumber(row[1], 3), box.x + box.w - 4, y + rowH / 2, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
    label(ctx, "AdamW decays both coordinates by the same multiplicative factor.", box.x, box.y + box.h - 13, "left", COLORS.decay);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 600;
    var height = compact ? 1080 : 700;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    var margin = compact ? 22 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawLossPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 244 });
      drawTrajectoryPanel(ctx, result, { x: margin, y: 306, w: panelW, h: 230 });
      drawEffectiveStepPanel(ctx, result, { x: margin, y: 570, w: panelW, h: 230 });
      drawLedgerPanel(ctx, result, { x: margin, y: 834, w: panelW, h: 206 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawLossPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 302 });
      drawTrajectoryPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 302 });
      drawEffectiveStepPanel(ctx, result, { x: margin, y: 382, w: panelW2, h: 258 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 382, w: panelW2, h: 258 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      alpha: result.params.alpha.toFixed(2),
      beta2: result.params.beta2.toFixed(2),
      decay: result.params.decay.toFixed(2),
      noise: Math.round(result.params.noise * 100) + "%",
      ratio: String(Math.round(result.params.ratio)),
      steps: String(result.params.steps)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("SGD final loss", formatNumber(result.last.sgd.loss, 3)),
        metric("Adam final loss", formatNumber(result.last.adam.loss, 3)),
        metric("AdamW final loss", formatNumber(result.last.adamw.loss, 3)),
        metric("SGD flat |y|", formatNumber(Math.abs(result.last.sgd.y), 3)),
        metric("SGD step", formatNumber(result.sgdAlpha, 4)),
        metric("unit ratio", formatNumber(result.unitRatio, 1) + "x"),
        metric("L2 decay skew", formatNumber(result.coupledDecaySkew, 1) + "x"),
        metric("Adam eff y/x", formatNumber(result.last.adamEffY / Math.max(1e-12, result.last.adamEffX), 1) + "x")
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-adam-lab]")).forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    loss: loss,
    simulate: simulate,
    trueGrad: trueGrad
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.AdamUnitsLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
