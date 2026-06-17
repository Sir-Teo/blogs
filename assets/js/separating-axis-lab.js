(function (global) {
  "use strict";

  var COLORS = {
    a: "#2563eb",
    axis: "#7c3aed",
    b: "#0f766e",
    bad: "#be123c",
    gap: "#d97706",
    grid: "#e6edf3",
    muted: "#5d6872",
    panel: "#f8fafc",
    rule: "#d7dee5",
    text: "#172026",
    white: "#ffffff"
  };

  var DEFAULTS = {
    angleA: 12,
    angleB: -20,
    offsetX: 68,
    offsetY: 10,
    scaleB: 100
  };

  var SHAPE_A = [
    [-1.1, -0.62],
    [1.1, -0.62],
    [1.1, 0.62],
    [-1.1, 0.62]
  ];

  var SHAPE_B = [
    [1.0, 0.0],
    [0.33, 0.88],
    [-0.72, 0.55],
    [-0.86, -0.45],
    [0.25, -0.82]
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      angleA: Math.round(clamp(finite(Number(raw.angleA), DEFAULTS.angleA), -55, 55)),
      angleB: Math.round(clamp(finite(Number(raw.angleB), DEFAULTS.angleB), -75, 75)),
      offsetX: Math.round(clamp(finite(Number(raw.offsetX), DEFAULTS.offsetX), -40, 170)),
      offsetY: Math.round(clamp(finite(Number(raw.offsetY), DEFAULTS.offsetY), -90, 90)),
      scaleB: Math.round(clamp(finite(Number(raw.scaleB), DEFAULTS.scaleB), 70, 135))
    };
  }

  function rotate(point, radians) {
    var c = Math.cos(radians);
    var s = Math.sin(radians);
    return [point[0] * c - point[1] * s, point[0] * s + point[1] * c];
  }

  function transform(poly, center, radians, scale) {
    return poly.map(function (point) {
      var p = rotate([point[0] * scale, point[1] * scale], radians);
      return [p[0] + center[0], p[1] + center[1]];
    });
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1];
  }

  function axesFor(poly, owner) {
    var axes = [];
    for (var i = 0; i < poly.length; i += 1) {
      var p = poly[i];
      var q = poly[(i + 1) % poly.length];
      var dx = q[0] - p[0];
      var dy = q[1] - p[1];
      var len = Math.max(1e-12, Math.hypot(dx, dy));
      var axis = [-dy / len, dx / len];
      axes.push({ axis: axis, edge: i, owner: owner });
    }
    return axes;
  }

  function canonical(axis) {
    if (axis[0] < -1e-9 || (Math.abs(axis[0]) < 1e-9 && axis[1] < 0)) {
      return [-axis[0], -axis[1]];
    }
    return axis.slice();
  }

  function dedupeAxes(axes) {
    var out = [];
    axes.forEach(function (entry) {
      var c = canonical(entry.axis);
      var duplicate = out.some(function (existing) {
        return Math.abs(dot(c, existing.axis)) > 0.997;
      });
      if (!duplicate) out.push(Object.assign({}, entry, { axis: c }));
    });
    return out;
  }

  function project(poly, axis) {
    var min = Infinity;
    var max = -Infinity;
    poly.forEach(function (point) {
      var value = dot(point, axis);
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
    return { max: max, min: min };
  }

  function intervalRelation(a, b) {
    var overlap = Math.min(a.max, b.max) - Math.max(a.min, b.min);
    return {
      gap: Math.max(0, -overlap),
      overlap: overlap
    };
  }

  function runSat(polyA, polyB) {
    var axes = dedupeAxes(axesFor(polyA, "A").concat(axesFor(polyB, "B")));
    var rows = axes.map(function (entry, index) {
      var pa = project(polyA, entry.axis);
      var pb = project(polyB, entry.axis);
      var relation = intervalRelation(pa, pb);
      return Object.assign({}, entry, {
        gap: relation.gap,
        index: index,
        overlap: relation.overlap,
        projectionA: pa,
        projectionB: pb,
        separated: relation.overlap < 0
      });
    });
    var separating = rows.filter(function (row) { return row.separated; })
      .sort(function (a, b) { return b.gap - a.gap; })[0] || null;
    var mtv = rows.slice().sort(function (a, b) { return a.overlap - b.overlap; })[0];
    return {
      axes: rows,
      colliding: !separating,
      critical: separating || mtv,
      mtv: mtv,
      separating: separating
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var angleA = params.angleA * Math.PI / 180;
    var angleB = params.angleB * Math.PI / 180;
    var polyA = transform(SHAPE_A, [-85, 0], angleA, 65);
    var polyB = transform(SHAPE_B, [params.offsetX, params.offsetY], angleB, 70 * params.scaleB / 100);
    var sat = runSat(polyA, polyB);
    var sweep = [];
    for (var x = -20; x <= 140; x += 10) {
      var localB = transform(SHAPE_B, [x, params.offsetY], angleB, 70 * params.scaleB / 100);
      var local = runSat(polyA, localB);
      sweep.push({
        colliding: local.colliding,
        margin: local.colliding ? local.mtv.overlap : -local.separating.gap,
        offsetX: x
      });
    }
    return {
      params: params,
      polyA: polyA,
      polyB: polyB,
      sat: sat,
      sweep: sweep
    };
  }

  function audit() {
    var separated = evaluate(DEFAULTS);
    var colliding = evaluate(Object.assign({}, DEFAULTS, { offsetX: 35 }));
    var far = evaluate(Object.assign({}, DEFAULTS, { offsetX: 130 }));
    return {
      axisCount: separated.sat.axes.length,
      collisionMtv: Number(colliding.sat.mtv.overlap.toFixed(2)),
      defaultColliding: separated.sat.colliding,
      defaultGap: Number((separated.sat.separating ? separated.sat.separating.gap : 0).toFixed(2)),
      farGap: Number((far.sat.separating ? far.sat.separating.gap : 0).toFixed(2)),
      hasSeparatingAxis: Boolean(separated.sat.separating),
      overlapStateColliding: colliding.sat.colliding,
      pulledInHasNoSeparatingAxis: colliding.sat.separating === null
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value, klass) {
    return '<div class="sat-lab__metric ' + (klass || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "angleA" || key === "angleB") value += " deg";
        if (key === "scaleB") value += "%";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    var critical = result.sat.critical;
    box.innerHTML = [
      metric("state", result.sat.colliding ? "overlap" : "separated", result.sat.colliding ? "warn" : "good"),
      metric("candidate axes", String(result.sat.axes.length)),
      metric("critical axis", critical.owner + "#" + (critical.edge + 1)),
      metric(result.sat.colliding ? "min overlap" : "largest gap", fmt(result.sat.colliding ? critical.overlap : critical.gap, 2)),
      metric("resolution hint", result.sat.colliding ? fmt(result.sat.mtv.overlap, 2) : "n/a", result.sat.colliding ? "warn" : ""),
      metric("offset", result.params.offsetX + ", " + result.params.offsetY)
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = global.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.width || 900));
    var height = width < 560 ? Math.round(width * 1.45) : Math.round(width * 0.76);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function clear(ctx, width, height) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
  }

  function label(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || 650) + " " + (opts.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    label(ctx, title, box.x + 14, box.y + 24, { size: 14, weight: 800 });
    if (subtitle) label(ctx, subtitle, box.x + 14, box.y + 42, { color: COLORS.muted, size: 11, weight: 600 });
  }

  function drawPolygon(ctx, points, color) {
    ctx.beginPath();
    points.forEach(function (point, index) {
      if (index === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
    });
    ctx.closePath();
    ctx.fillStyle = color + "22";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }

  function withWorld(ctx, box, fn) {
    var scale = Math.min(box.w / 360, box.h / 250);
    ctx.save();
    ctx.translate(box.x + box.w / 2, box.y + box.h / 2 + 10);
    ctx.scale(scale, scale);
    fn();
    ctx.restore();
  }

  function drawScene(ctx, result, box) {
    panel(ctx, box, "convex polygons", result.sat.colliding ? "no projection gap remains" : "one projection gap proves no collision");
    var plot = { x: box.x + 20, y: box.y + 56, w: box.w - 40, h: box.h - 78 };
    withWorld(ctx, plot, function () {
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      for (var gx = -180; gx <= 180; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, -120);
        ctx.lineTo(gx, 120);
        ctx.stroke();
      }
      for (var gy = -120; gy <= 120; gy += 40) {
        ctx.beginPath();
        ctx.moveTo(-180, gy);
        ctx.lineTo(180, gy);
        ctx.stroke();
      }
      drawPolygon(ctx, result.polyA, COLORS.a);
      drawPolygon(ctx, result.polyB, COLORS.b);
      var axis = result.sat.critical.axis;
      var color = result.sat.colliding ? COLORS.bad : COLORS.gap;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-axis[0] * 165, -axis[1] * 165);
      ctx.lineTo(axis[0] * 165, axis[1] * 165);
      ctx.stroke();
      ctx.strokeStyle = color + "99";
      ctx.setLineDash([6, 5]);
      var n = [-axis[1], axis[0]];
      var p = result.sat.critical.projectionA.max < result.sat.critical.projectionB.min
        ? (result.sat.critical.projectionA.max + result.sat.critical.projectionB.min) / 2
        : (result.sat.critical.projectionB.max + result.sat.critical.projectionA.min) / 2;
      if (!result.sat.colliding) {
        ctx.beginPath();
        ctx.moveTo(axis[0] * p + n[0] * -140, axis[1] * p + n[1] * -140);
        ctx.lineTo(axis[0] * p + n[0] * 140, axis[1] * p + n[1] * 140);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    });
    label(ctx, "A", box.x + 22, box.y + box.h - 17, { color: COLORS.a, size: 11, weight: 850 });
    label(ctx, "B", box.x + 48, box.y + box.h - 17, { color: COLORS.b, size: 11, weight: 850 });
    label(ctx, result.sat.colliding ? "minimum translation axis" : "separating axis", box.x + 80, box.y + box.h - 17, { color: result.sat.colliding ? COLORS.bad : COLORS.gap, size: 11, weight: 800 });
  }

  function drawProjection(ctx, result, box) {
    panel(ctx, box, "shadow test", "project both shapes onto the critical axis");
    var row = result.sat.critical;
    var plot = { x: box.x + 44, y: box.y + 82, w: box.w - 74, h: box.h - 120 };
    var min = Math.min(row.projectionA.min, row.projectionB.min);
    var max = Math.max(row.projectionA.max, row.projectionB.max);
    var pad = (max - min) * 0.12 + 1;
    min -= pad;
    max += pad;
    function sx(value) { return plot.x + (value - min) / (max - min) * plot.w; }
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h / 2);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h / 2);
    ctx.stroke();
    [
      { color: COLORS.a, interval: row.projectionA, label: "A", y: plot.y + 18 },
      { color: COLORS.b, interval: row.projectionB, label: "B", y: plot.y + 56 }
    ].forEach(function (item) {
      var x0 = sx(item.interval.min);
      var x1 = sx(item.interval.max);
      ctx.fillStyle = item.color;
      ctx.fillRect(x0, item.y, x1 - x0, 18);
      label(ctx, item.label, x0 + 5, item.y + 14, { color: COLORS.white, size: 10, weight: 850 });
    });
    var status = result.sat.colliding ? "overlap " + fmt(row.overlap, 2) : "gap " + fmt(row.gap, 2);
    label(ctx, status, plot.x, box.y + box.h - 18, { color: result.sat.colliding ? COLORS.bad : COLORS.gap, size: 11, weight: 850 });
  }

  function drawAxes(ctx, result, box) {
    panel(ctx, box, "axis ledger", "negative means a separating gap");
    var rows = result.sat.axes;
    var plot = { x: box.x + 74, y: box.y + 58, w: box.w - 104, h: box.h - 92 };
    var maxAbs = Math.max.apply(null, rows.map(function (row) { return Math.abs(row.overlap); }).concat([1]));
    rows.forEach(function (row, index) {
      var y = plot.y + index * (plot.h / rows.length) + 3;
      var labelText = row.owner + (row.edge + 1);
      label(ctx, labelText, box.x + 18, y + 11, { color: row.separated ? COLORS.gap : COLORS.text, size: 10, weight: 800 });
      var value = row.overlap;
      var zero = plot.x + plot.w / 2;
      var len = Math.abs(value) / maxAbs * (plot.w / 2);
      ctx.fillStyle = value < 0 ? COLORS.gap : COLORS.bad;
      ctx.fillRect(value < 0 ? zero - len : zero, y, len, 11);
    });
    ctx.strokeStyle = COLORS.text;
    ctx.beginPath();
    ctx.moveTo(plot.x + plot.w / 2, plot.y - 2);
    ctx.lineTo(plot.x + plot.w / 2, plot.y + plot.h + 2);
    ctx.stroke();
    label(ctx, "gap", plot.x, box.y + box.h - 16, { color: COLORS.gap, size: 10, weight: 800 });
    label(ctx, "overlap", plot.x + plot.w, box.y + box.h - 16, { align: "right", color: COLORS.bad, size: 10, weight: 800 });
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "offset sweep", "margin changes sign at contact");
    var rows = result.sweep;
    var plot = { x: box.x + 46, y: box.y + 62, w: box.w - 76, h: box.h - 96 };
    var maxAbs = Math.max.apply(null, rows.map(function (row) { return Math.abs(row.margin); }).concat([1]));
    function sx(offset) { return plot.x + (offset + 20) / 160 * plot.w; }
    function sy(value) { return plot.y + plot.h / 2 - value / maxAbs * (plot.h * 0.45); }
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h / 2);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h / 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = sx(row.offsetX);
      var y = sy(row.margin);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var currentX = sx(result.params.offsetX);
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(currentX, plot.y);
    ctx.lineTo(currentX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "negative gap", plot.x, box.y + box.h - 16, { color: COLORS.gap, size: 10, weight: 800 });
    label(ctx, "positive overlap", plot.x + plot.w, box.y + box.h - 16, { align: "right", color: COLORS.bad, size: 10, weight: 800 });
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    clear(ctx, width, height);
    var margin = 18;
    var gap = 18;
    if (width < 560) {
      var h = (height - 2 * margin - 3 * gap) / 4;
      drawScene(ctx, result, { x: margin, y: margin, w: width - 2 * margin, h: h });
      drawProjection(ctx, result, { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h });
      drawAxes(ctx, result, { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h });
      drawSweep(ctx, result, { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - 2 * margin - gap) / 2;
      var rowH = (height - 2 * margin - gap) / 2;
      drawScene(ctx, result, { x: margin, y: margin, w: colW, h: rowH });
      drawProjection(ctx, result, { x: margin + colW + gap, y: margin, w: colW, h: rowH });
      drawAxes(ctx, result, { x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      drawSweep(ctx, result, { x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__separatingAxisLabResult = result;
  }

  function init(root) {
    if (!root || root.__separatingAxisReady) return;
    root.__separatingAxisReady = true;
    var scheduled = null;
    function requestRender() {
      if (scheduled) global.cancelAnimationFrame(scheduled);
      scheduled = global.requestAnimationFrame(function () {
        scheduled = null;
        render(root);
      });
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    global.addEventListener("resize", requestRender);
    requestRender();
  }

  function initAll() {
    global.document.querySelectorAll("[data-separating-axis-lab]").forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SeparatingAxisLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
