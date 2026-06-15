(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    quadratic: "#2563eb",
    deep: "#be123c",
    sharp: "#0f766e",
    edge: "#172026",
    warn: "#d97706",
    flat: "#7c3aed"
  };

  var DEFAULTS = {
    eta: 101,
    curvature: 200,
    target: 100,
    init: 8,
    steps: 140
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
    return {
      curvature: snap(raw.curvature, DEFAULTS.curvature, 50, 350, 5) / 100,
      eta: snap(raw.eta, DEFAULTS.eta, 20, 150, 1) / 100,
      init: snap(raw.init, DEFAULTS.init, 2, 24, 1) / 100,
      steps: snap(raw.steps, DEFAULTS.steps, 40, 260, 5),
      target: snap(raw.target, DEFAULTS.target, 40, 180, 5) / 100
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="edge-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function topHessianScalar(a, b, target) {
    var aa = b * b;
    var cc = a * a;
    var off = 2 * a * b - target;
    var trace = aa + cc;
    var disc = Math.sqrt((aa - cc) * (aa - cc) + 4 * off * off);
    return (trace + disc) / 2;
  }

  function simulateQuadratic(params) {
    var rows = [];
    var multiplier = 1 - params.eta * params.curvature;
    var z = 1;
    var clipped = false;
    for (var t = 0; t <= params.steps; t += 1) {
      var loss = 0.5 * params.curvature * z * z;
      rows.push({
        loss: loss,
        sign: z >= 0 ? 1 : -1,
        t: t,
        z: z
      });
      z *= multiplier;
      if (Math.abs(z) > 1e8) {
        clipped = true;
        z = z > 0 ? 1e8 : -1e8;
      }
    }
    var stability = Math.abs(multiplier) < 1 ? "stable" : "unstable";
    var phase = stability === "unstable" ? "diverges" : (multiplier < 0 ? "zigzags" : "monotone");
    return {
      clipped: clipped,
      multiplier: multiplier,
      phase: phase,
      rows: rows,
      stability: stability
    };
  }

  function simulateDeepLinear(params) {
    var a = params.init;
    var b = params.init * 1.375;
    var rows = [];
    var nonmonotone = 0;
    var previousLoss = Infinity;
    var divergedAt = null;
    for (var t = 0; t <= params.steps; t += 1) {
      var product = a * b;
      var error = product - params.target;
      var loss = 0.5 * error * error;
      var sharpness = topHessianScalar(a, b, params.target);
      if (t > 0 && loss > previousLoss * 1.000001) nonmonotone += 1;
      previousLoss = loss;
      rows.push({
        a: a,
        b: b,
        loss: loss,
        product: product,
        sharpness: sharpness,
        t: t
      });
      var gradA = error * b;
      var gradB = error * a;
      a -= params.eta * gradA;
      b -= params.eta * gradB;
      if (!isFinite(a) || !isFinite(b) || Math.max(Math.abs(a), Math.abs(b)) > 1e8) {
        divergedAt = t + 1;
        break;
      }
    }
    return {
      divergedAt: divergedAt,
      nonmonotone: nonmonotone,
      rows: rows
    };
  }

  function summarize(params, quadratic, deep) {
    var edge = 2 / params.eta;
    var last = deep.rows[deep.rows.length - 1];
    var tail = deep.rows.slice(Math.max(0, deep.rows.length - 24));
    var avgSharp = tail.reduce(function (sum, row) { return sum + row.sharpness; }, 0) / Math.max(1, tail.length);
    var avgLoss = tail.reduce(function (sum, row) { return sum + row.loss; }, 0) / Math.max(1, tail.length);
    var minLoss = deep.rows.reduce(function (min, row) { return Math.min(min, row.loss); }, Infinity);
    var maxLoss = deep.rows.reduce(function (max, row) { return Math.max(max, row.loss); }, 0);
    return {
      avgLoss: avgLoss,
      avgSharpness: avgSharp,
      deepFinal: last,
      edge: edge,
      edgeRatio: avgSharp / edge,
      maxLoss: maxLoss,
      minLoss: minLoss,
      stabilityProduct: params.eta * params.curvature
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var quadratic = simulateQuadratic(params);
    var deep = simulateDeepLinear(params);
    return {
      deep: deep,
      params: params,
      quadratic: quadratic,
      summary: summarize(params, quadratic, deep)
    };
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || 720));
    var height = Math.max(650, Math.round(rect.height || canvas.clientHeight || 840));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, height: height, width: width };
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

  function text(ctx, value, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || 500) + " " + (opts.size || 12) + "px " + (opts.family || "system-ui, sans-serif");
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 12, box.y + 22, { size: 12, weight: 780 });
    if (subtitle) text(ctx, subtitle, box.x + 12, box.y + 39, { color: COLORS.muted, size: 10 });
  }

  function logExtent(rows, field) {
    var min = Infinity;
    var max = -Infinity;
    rows.forEach(function (row) {
      var value = Math.max(1e-12, row[field]);
      min = Math.min(min, Math.log10(value));
      max = Math.max(max, Math.log10(value));
    });
    if (!isFinite(min) || !isFinite(max)) return { min: -6, max: 1 };
    var pad = Math.max(0.25, (max - min) * 0.1);
    return { min: min - pad, max: max + pad };
  }

  function linePlot(ctx, box, rows, field, color, title, subtitle, labels) {
    panel(ctx, box, title, subtitle);
    var left = box.x + 42;
    var top = box.y + 50;
    var w = box.w - 62;
    var h = box.h - 78;
    var ext = logExtent(rows, field);
    var maxT = Math.max(1, rows[rows.length - 1].t);
    function mapX(t) { return left + t / maxT * w; }
    function mapY(value) {
      var lv = Math.log10(Math.max(1e-12, value));
      return top + (ext.max - lv) / (ext.max - ext.min) * h;
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var yy = top + i * h / 4;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(left + w, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = mapX(row.t);
      var y = mapY(row[field]);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var last = rows[rows.length - 1];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mapX(last.t), mapY(last[field]), 4, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, "log loss", left, top - 7, { color: COLORS.muted, size: 10 });
    text(ctx, "step", left + w, top + h + 17, { align: "right", color: COLORS.muted, size: 10 });
    if (labels) {
      labels.forEach(function (label, i) {
        text(ctx, label, left + 8, top + 15 + i * 14, { color: i === 0 ? color : COLORS.muted, size: 10, weight: i === 0 ? 760 : 500 });
      });
    }
  }

  function drawSharpness(ctx, box, result) {
    panel(ctx, box, "sharpness meets the edge", "top Hessian eigenvalue versus 2 / eta");
    var rows = result.deep.rows;
    var left = box.x + 42;
    var top = box.y + 50;
    var w = box.w - 62;
    var h = box.h - 78;
    var values = rows.map(function (row) { return row.sharpness; });
    values.push(result.summary.edge);
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = Math.max(0.15, (max - min) * 0.12);
    min = Math.max(0, min - pad);
    max += pad;
    var maxT = Math.max(1, rows[rows.length - 1].t);
    function mapX(t) { return left + t / maxT * w; }
    function mapY(v) { return top + (max - v) / (max - min) * h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var yy = top + i * h / 4;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(left + w, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    ctx.strokeStyle = COLORS.edge;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(left, mapY(result.summary.edge));
    ctx.lineTo(left + w, mapY(result.summary.edge));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.sharp;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = mapX(row.t);
      var y = mapY(row.sharpness);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    text(ctx, "2 / eta = " + formatNumber(result.summary.edge, 2), left + 7, mapY(result.summary.edge) - 6, { color: COLORS.edge, size: 10, weight: 720 });
    text(ctx, "sharpness", left, top - 7, { color: COLORS.muted, size: 10 });
    text(ctx, "step", left + w, top + h + 17, { align: "right", color: COLORS.muted, size: 10 });
  }

  function drawTrajectory(ctx, box, result) {
    panel(ctx, box, "two weights, one product", "trajectory for L(a,b)=0.5(ab-y)^2");
    var rows = result.deep.rows;
    var target = result.params.target;
    var maxAbs = Math.sqrt(Math.max(0.3, target)) * 1.95;
    rows.forEach(function (row) {
      maxAbs = Math.max(maxAbs, Math.abs(row.a) * 1.12, Math.abs(row.b) * 1.12);
    });
    maxAbs = Math.min(8, maxAbs);
    var left = box.x + 44;
    var top = box.y + 50;
    var w = box.w - 66;
    var h = box.h - 78;
    function mapX(v) { return left + (v + maxAbs) / (2 * maxAbs) * w; }
    function mapY(v) { return top + (maxAbs - v) / (2 * maxAbs) * h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var gx = -1; gx <= 1.001; gx += 0.5) {
      ctx.beginPath();
      ctx.moveTo(mapX(gx * maxAbs), top);
      ctx.lineTo(mapX(gx * maxAbs), top + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(left, mapY(gx * maxAbs));
      ctx.lineTo(left + w, mapY(gx * maxAbs));
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    ctx.strokeStyle = COLORS.flat;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    var started = false;
    for (var a = 0.12; a <= maxAbs; a += maxAbs / 160) {
      var b = target / a;
      if (b > maxAbs) continue;
      if (!started) {
        ctx.moveTo(mapX(a), mapY(b));
        started = true;
      } else {
        ctx.lineTo(mapX(a), mapY(b));
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = COLORS.deep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = mapX(row.a);
      var y = mapY(row.b);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var stride = Math.max(1, Math.floor(rows.length / 18));
    rows.forEach(function (row, index) {
      if (index % stride !== 0 && index !== rows.length - 1) return;
      var alpha = 0.25 + 0.65 * index / Math.max(1, rows.length - 1);
      ctx.fillStyle = "rgba(190,18,60," + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(mapX(row.a), mapY(row.b), index === rows.length - 1 ? 4 : 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
    text(ctx, "ab = target", mapX(Math.sqrt(target)) + 6, mapY(Math.sqrt(target)) - 6, { color: COLORS.flat, size: 10, weight: 720 });
    text(ctx, "a", left + w, top + h + 17, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "b", left - 8, top + 2, { align: "right", color: COLORS.muted, size: 10 });
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    var pad = width < 650 ? 10 : 14;
    if (width < 650) {
      var panelH = (height - 5 * pad) / 4;
      linePlot(ctx, { x: pad, y: pad, w: width - 2 * pad, h: panelH }, result.quadratic.rows, "loss", COLORS.quadratic, "frozen quadratic mode", "z <- (1 - eta lambda) z", [
        "eta lambda = " + formatNumber(result.summary.stabilityProduct, 2),
        result.quadratic.phase
      ]);
      linePlot(ctx, { x: pad, y: 2 * pad + panelH, w: width - 2 * pad, h: panelH }, result.deep.rows, "loss", COLORS.deep, "nonlinear toy loss", "same step, moving curvature", [
        "final L = " + formatNumber(result.summary.deepFinal.loss, 4),
        result.deep.nonmonotone + " upward steps"
      ]);
      drawSharpness(ctx, { x: pad, y: 3 * pad + 2 * panelH, w: width - 2 * pad, h: panelH }, result);
      drawTrajectory(ctx, { x: pad, y: 4 * pad + 3 * panelH, w: width - 2 * pad, h: panelH }, result);
    } else {
      var colW = (width - 3 * pad) / 2;
      var rowH = (height - 3 * pad) / 2;
      linePlot(ctx, { x: pad, y: pad, w: colW, h: rowH }, result.quadratic.rows, "loss", COLORS.quadratic, "frozen quadratic mode", "z <- (1 - eta lambda) z", [
        "eta lambda = " + formatNumber(result.summary.stabilityProduct, 2),
        result.quadratic.phase
      ]);
      linePlot(ctx, { x: 2 * pad + colW, y: pad, w: colW, h: rowH }, result.deep.rows, "loss", COLORS.deep, "nonlinear toy loss", "same step, moving curvature", [
        "tail avg L = " + formatNumber(result.summary.avgLoss, 4),
        result.deep.nonmonotone + " upward steps"
      ]);
      drawSharpness(ctx, { x: pad, y: 2 * pad + rowH, w: colW, h: rowH }, result);
      drawTrajectory(ctx, { x: 2 * pad + colW, y: 2 * pad + rowH, w: colW, h: rowH }, result);
    }
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (node) {
      raw[node.getAttribute("data-param")] = node.value;
    });
    return raw;
  }

  function syncOutputs(container, params) {
    var labels = {
      curvature: params.curvature.toFixed(2),
      eta: params.eta.toFixed(2),
      init: params.init.toFixed(2),
      steps: String(params.steps),
      target: params.target.toFixed(2)
    };
    Object.keys(labels).forEach(function (key) {
      var out = container.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(container) {
    var result = evaluate(readParams(container));
    syncOutputs(container, result.params);
    var metrics = container.querySelector("[data-edge-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("edge 2 / eta", formatNumber(result.summary.edge, 2)),
        metric("eta x lambda", formatNumber(result.summary.stabilityProduct, 2)),
        metric("quadratic mode", result.quadratic.phase),
        metric("tail sharp / edge", formatNumber(result.summary.edgeRatio, 2) + "x"),
        metric("deep final loss", formatNumber(result.summary.deepFinal.loss, 4)),
        metric("upward loss steps", String(result.deep.nonmonotone))
      ].join("");
    }
    var canvas = container.querySelector("canvas");
    if (canvas) draw(result, canvas);
    container.__edgeResult = result;
  }

  function init(container) {
    if (!container) return;
    container.querySelectorAll("[data-param]").forEach(function (node) {
      node.addEventListener("input", function () { render(container); });
      node.addEventListener("change", function () { render(container); });
    });
    render(container);
  }

  function initAll() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-edge-stability-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    simulateDeepLinear: simulateDeepLinear,
    simulateQuadratic: simulateQuadratic,
    topHessianScalar: topHessianScalar
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.EdgeStabilityLab = api;

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
