(function (root) {
  "use strict";

  var COLORS = {
    raw: "#be123c",
    interp: "#2563eb",
    train: "#0f766e",
    accent: "#d97706",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    soft: "#f8fafc"
  };

  var DEFAULTS = {
    dim: 64,
    base: 10000,
    train: 2048,
    target: 8192,
    focus: 8,
    seed: 7
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var dim = snap(raw.dim, DEFAULTS.dim, 16, 128, 16);
    var train = snap(raw.train, DEFAULTS.train, 512, 8192, 512);
    var target = snap(raw.target, DEFAULTS.target, 1024, 32768, 512);
    target = Math.max(target, train);
    return {
      dim: dim,
      base: snap(raw.base, DEFAULTS.base, 1000, 100000, 1000),
      train: train,
      target: target,
      focus: snap(raw.focus, DEFAULTS.focus, 0, dim / 2 - 1, 1),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1)
    };
  }

  function lcg(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function frequencies(params) {
    var pairs = params.dim / 2;
    var out = [];
    for (var i = 0; i < pairs; i += 1) {
      out.push(Math.pow(params.base, -2 * i / params.dim));
    }
    return out;
  }

  function rotatePair(x, y, angle) {
    var c = Math.cos(angle);
    var s = Math.sin(angle);
    return [x * c - y * s, x * s + y * c];
  }

  function rotateVector(vec, position, params) {
    var freqs = frequencies(params);
    var out = vec.slice();
    for (var i = 0; i < freqs.length; i += 1) {
      var pair = rotatePair(vec[2 * i], vec[2 * i + 1], position * freqs[i]);
      out[2 * i] = pair[0];
      out[2 * i + 1] = pair[1];
    }
    return out;
  }

  function dot(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += a[i] * b[i];
    return sum;
  }

  function randomVector(dim, seed) {
    var rand = lcg(seed * 1000003 + dim * 97);
    var out = [];
    for (var i = 0; i < dim; i += 1) out.push(normal(rand));
    return out;
  }

  function ropeKernel(delta, params, scale) {
    var freqs = frequencies(params);
    var s = 0;
    var useScale = scale == null ? 1 : scale;
    for (var i = 0; i < freqs.length; i += 1) {
      s += Math.cos(delta * useScale * freqs[i]);
    }
    return s / freqs.length;
  }

  function makeCurve(params, scale, points) {
    var out = [];
    for (var i = 0; i <= points; i += 1) {
      var delta = params.target * i / points;
      out.push({ delta: delta, value: ropeKernel(delta, params, scale) });
    }
    return out;
  }

  function findTailMax(params, scale) {
    var best = { delta: params.train, value: -Infinity };
    var steps = 1200;
    for (var i = 0; i <= steps; i += 1) {
      var delta = params.train + (params.target - params.train) * i / Math.max(1, steps);
      var value = ropeKernel(delta, params, scale);
      if (value > best.value) best = { delta: delta, value: value };
    }
    return best;
  }

  function findFirstHigh(params, scale, threshold) {
    var maxDelta = params.target;
    for (var d = params.train + 1; d <= maxDelta; d += 1) {
      if (ropeKernel(d, params, scale) >= threshold) return d;
    }
    return null;
  }

  function identityError(params) {
    var q = randomVector(params.dim, params.seed);
    var k = randomVector(params.dim, params.seed + 19);
    var m = Math.floor(params.train * 0.37);
    var n = Math.floor(params.train * 0.83);
    var left = dot(rotateVector(q, m, params), rotateVector(k, n, params));
    var relativeK = rotateVector(k, n - m, params);
    var right = dot(q, relativeK);
    return Math.abs(left - right);
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var scale = params.train / params.target;
    var rawCurve = makeCurve(params, 1, 640);
    var interpCurve = makeCurve(params, scale, 640);
    var zoomLimit = Math.min(512, params.target);
    var zoomParams = Object.assign({}, params, { target: zoomLimit, train: Math.min(params.train, zoomLimit) });
    var rawTail = findTailMax(params, 1);
    var interpTail = findTailMax(params, scale);
    var freqs = frequencies(params);
    var focus = clamp(params.focus, 0, freqs.length - 1);
    return {
      params: params,
      scale: scale,
      freqs: freqs,
      focus: focus,
      rawCurve: rawCurve,
      interpCurve: interpCurve,
      rawZoom: makeCurve(zoomParams, 1, 320),
      interpZoom: makeCurve(zoomParams, scale, 320),
      rawTail: rawTail,
      interpTail: interpTail,
      rawFirstHigh: findFirstHigh(params, 1, 0.9),
      interpFirstHigh: findFirstHigh(params, scale, 0.9),
      localDropRaw: 1 - ropeKernel(1, params, 1),
      localDropInterp: 1 - ropeKernel(1, params, scale),
      focusRawAngle: params.target * freqs[focus],
      focusInterpAngle: params.target * scale * freqs[focus],
      identityError: identityError(params)
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 10) return value.toFixed(2);
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatPosition(value) {
    if (value == null) return "none";
    return Math.round(value).toLocaleString();
  }

  function metric(label, value) {
    return '<div class="rope-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
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

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width));
    var height = width < 620 ? 1220 : 760;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 750);
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 43, COLORS.muted, 11, 600);
  }

  function plotBox(box, top, right, bottom, left) {
    return {
      x: box.x + left,
      y: box.y + top,
      w: box.w - left - right,
      h: box.h - top - bottom
    };
  }

  function drawAxes(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.grid;
    for (var i = 1; i < 4; i += 1) {
      var x = plot.x + plot.w * i / 4;
      var y = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawCurve(ctx, curve, plot, maxX, color) {
    function xScale(x) { return plot.x + x / maxX * plot.w; }
    function yScale(y) { return plot.y + (1 - (y + 1) / 2) * plot.h; }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    curve.forEach(function (point, index) {
      var x = xScale(point.delta);
      var y = yScale(point.value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawKernel(ctx, box, result) {
    panel(ctx, box, "Relative phase kernel", "same content, different separation");
    var plot = plotBox(box, 66, 20, 44, 48);
    drawAxes(ctx, plot);
    drawCurve(ctx, result.rawCurve, plot, result.params.target, COLORS.raw);
    drawCurve(ctx, result.interpCurve, plot, result.params.target, COLORS.interp);
    var trainX = plot.x + result.params.train / result.params.target * plot.w;
    ctx.strokeStyle = COLORS.train;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(trainX, plot.y);
    ctx.lineTo(trainX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "train length", trainX + 5, plot.y + 14, COLORS.train, 10, 750);
    drawText(ctx, "raw", plot.x + 8, plot.y + 18, COLORS.raw, 11, 750);
    drawText(ctx, "interpolated", plot.x + 8, plot.y + 36, COLORS.interp, 11, 750);
    drawText(ctx, "0", plot.x, box.y + box.h - 18, COLORS.muted, 10, 650);
    drawText(ctx, formatPosition(result.params.target), plot.x + plot.w, box.y + box.h - 18, COLORS.muted, 10, 650, "right");
  }

  function drawZoom(ctx, box, result) {
    panel(ctx, box, "Local resolution", "interpolation compresses short distances too");
    var plot = plotBox(box, 66, 20, 44, 48);
    var maxX = result.rawZoom[result.rawZoom.length - 1].delta;
    drawAxes(ctx, plot);
    drawCurve(ctx, result.rawZoom, plot, maxX, COLORS.raw);
    drawCurve(ctx, result.interpZoom, plot, maxX, COLORS.interp);
    drawText(ctx, "raw drop at 1 token: " + formatNumber(result.localDropRaw, 4), plot.x + 8, plot.y + 18, COLORS.raw, 11, 750);
    drawText(ctx, "interp drop at 1 token: " + formatNumber(result.localDropInterp, 4), plot.x + 8, plot.y + 36, COLORS.interp, 11, 750);
    drawText(ctx, "0", plot.x, box.y + box.h - 18, COLORS.muted, 10, 650);
    drawText(ctx, formatPosition(maxX), plot.x + plot.w, box.y + box.h - 18, COLORS.muted, 10, 650, "right");
  }

  function drawClocks(ctx, box, result) {
    panel(ctx, box, "Frequency clocks", "each coordinate pair is a phase wheel");
    var freqs = result.freqs;
    var shown = Math.min(8, freqs.length);
    var start = Math.min(Math.max(0, result.focus - Math.floor(shown / 2)), freqs.length - shown);
    var areaX = box.x + 18;
    var areaY = box.y + 66;
    var radius = Math.min(30, (box.w - 40) / shown / 2.3);
    for (var i = 0; i < shown; i += 1) {
      var idx = start + i;
      var cx = areaX + (i + 0.5) * ((box.w - 36) / shown);
      var cy = areaY + 44;
      ctx.strokeStyle = idx === result.focus ? COLORS.accent : COLORS.rule;
      ctx.lineWidth = idx === result.focus ? 2 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      var rawA = result.params.target * freqs[idx];
      var interpA = result.params.target * result.scale * freqs[idx];
      ctx.strokeStyle = COLORS.raw;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(rawA) * radius, cy + Math.sin(rawA) * radius);
      ctx.stroke();
      ctx.strokeStyle = COLORS.interp;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(interpA) * (radius - 5), cy + Math.sin(interpA) * (radius - 5));
      ctx.stroke();
      drawText(ctx, String(idx), cx, cy + radius + 17, COLORS.muted, 10, 700, "center");
    }
    var y = box.y + box.h - 84;
    drawText(ctx, "focus pair " + result.focus, box.x + 18, y, COLORS.text, 12, 800);
    drawText(ctx, "theta = " + formatNumber(freqs[result.focus], 6), box.x + 18, y + 22, COLORS.muted, 11, 650);
    drawText(ctx, "raw target angle = " + formatNumber(result.focusRawAngle, 2) + " rad", box.x + 18, y + 44, COLORS.raw, 11, 750);
    drawText(ctx, "interp target angle = " + formatNumber(result.focusInterpAngle, 2) + " rad", box.x + 18, y + 66, COLORS.interp, 11, 750);
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "Phase ledger", "RoPE is relative, not unbounded magic");
    var rows = [
      ["dimension", String(result.params.dim), COLORS.text],
      ["base", formatNumber(result.params.base, 0), COLORS.text],
      ["train length", formatPosition(result.params.train), COLORS.train],
      ["target length", formatPosition(result.params.target), COLORS.text],
      ["interpolation scale", formatNumber(result.scale, 3), COLORS.interp],
      ["raw tail max", formatNumber(result.rawTail.value, 3) + " @ " + formatPosition(result.rawTail.delta), COLORS.raw],
      ["interp tail max", formatNumber(result.interpTail.value, 3) + " @ " + formatPosition(result.interpTail.delta), COLORS.interp],
      ["relative identity error", result.identityError.toExponential(1), COLORS.accent]
    ];
    var x = box.x + 18;
    var y = box.y + 72;
    rows.forEach(function (row, index) {
      var yy = y + index * 27;
      drawText(ctx, row[0], x, yy, COLORS.muted, 11, 650);
      drawText(ctx, row[1], box.x + box.w - 18, yy, row[2], 12, 800, "right");
    });
    var calloutY = box.y + box.h - 48;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    roundedRect(ctx, x, calloutY, box.w - 36, 30, 7);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, "dot(R_m q, R_n k) = dot(q, R_(n-m) k)", box.x + box.w / 2, calloutY + 20, COLORS.text, 11, 760, "center");
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    if (width < 620) {
      var gap = 16;
      var h = 290;
      drawKernel(ctx, { x: 12, y: 12, w: width - 24, h: h }, result);
      drawZoom(ctx, { x: 12, y: 12 + h + gap, w: width - 24, h: h }, result);
      drawClocks(ctx, { x: 12, y: 12 + 2 * (h + gap), w: width - 24, h: h }, result);
      drawLedger(ctx, { x: 12, y: 12 + 3 * (h + gap), w: width - 24, h: h }, result);
      return;
    }
    var margin = 18;
    var gapX = 18;
    var gapY = 18;
    var boxW = (width - 2 * margin - gapX) / 2;
    var boxH = (setup.height - 2 * margin - gapY) / 2;
    drawKernel(ctx, { x: margin, y: margin, w: boxW, h: boxH }, result);
    drawZoom(ctx, { x: margin + boxW + gapX, y: margin, w: boxW, h: boxH }, result);
    drawClocks(ctx, { x: margin, y: margin + boxH + gapY, w: boxW, h: boxH }, result);
    drawLedger(ctx, { x: margin + boxW + gapX, y: margin + boxH + gapY, w: boxW, h: boxH }, result);
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(container, result) {
    var params = result.params;
    var values = {
      dim: String(params.dim),
      base: formatNumber(params.base, 0),
      train: formatPosition(params.train),
      target: formatPosition(params.target),
      focus: String(result.focus),
      seed: String(params.seed)
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function render(container) {
    var result = evaluate(readParams(container));
    updateOutputs(container, result);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("interp scale", formatNumber(result.scale, 3)),
        metric("raw tail max", formatNumber(result.rawTail.value, 3)),
        metric("interp tail max", formatNumber(result.interpTail.value, 3)),
        metric("raw local drop", formatNumber(result.localDropRaw, 4)),
        metric("interp local drop", formatNumber(result.localDropInterp, 4)),
        metric("identity error", result.identityError.toExponential(1))
      ].join("");
    }
    var canvas = container.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function mount(container) {
    var redraw = function () { render(container); };
    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    render(container);
    if (root.ResizeObserver) {
      var observer = new root.ResizeObserver(function () { render(container); });
      observer.observe(container);
    }
  }

  function init() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-rope-phase-lab]").forEach(mount);
  }

  root.RopePhaseLab = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    frequencies: frequencies,
    identityError: identityError,
    ropeKernel: ropeKernel,
    rotateVector: rotateVector
  };

  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : this);
