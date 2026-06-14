(function (root) {
  "use strict";

  var COLORS = {
    class0: "#2563eb",
    class1: "#0f766e",
    deletePoint: "#be123c",
    full: "#64748b",
    retrain: "#0f766e",
    influence: "#b45309",
    repair: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc"
  };

  var DEFAULTS = {
    samples: 140,
    overlap: 42,
    leverage: 65,
    regularization: 16,
    repairSteps: 2,
    seed: 17
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
      samples: snap(raw.samples, DEFAULTS.samples, 80, 260, 10),
      overlap: snap(raw.overlap, DEFAULTS.overlap, 20, 80, 1),
      leverage: snap(raw.leverage, DEFAULTS.leverage, 0, 100, 1),
      regularization: snap(raw.regularization, DEFAULTS.regularization, 4, 60, 1),
      repairSteps: snap(raw.repairSteps, DEFAULTS.repairSteps, 0, 8, 1),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1)
    };
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function sigmoid(z) {
    if (z >= 0) {
      var e = Math.exp(-z);
      return 1 / (1 + e);
    }
    var ez = Math.exp(z);
    return ez / (1 + ez);
  }

  function features(point) {
    return [1, point.x, point.y];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function scale(a, s) {
    return [a[0] * s, a[1] * s, a[2] * s];
  }

  function norm(a) {
    return Math.sqrt(dot(a, a));
  }

  function regularization(params) {
    return params.regularization / 1000;
  }

  function generateData(raw) {
    var params = cleanParams(raw);
    var rand = makeRng(params.seed * 1009 + params.samples * 37);
    var spread = params.overlap / 100;
    var n0 = Math.floor(params.samples / 2);
    var n1 = params.samples - n0;
    var points = [];
    var i;

    for (i = 0; i < n0; i += 1) {
      points.push({
        deleted: false,
        x: -0.42 + spread * normal(rand),
        y: -0.26 + spread * normal(rand),
        yLabel: 0
      });
    }
    for (i = 0; i < n1; i += 1) {
      points.push({
        deleted: false,
        x: 0.42 + spread * normal(rand),
        y: 0.26 + spread * normal(rand),
        yLabel: 1
      });
    }

    var t = params.leverage / 100;
    var deleted = {
      deleted: true,
      x: 0.45 * (1 - t) + (-1.05) * t,
      y: 0.22 * (1 - t) + (-0.86) * t,
      yLabel: 1
    };
    points.push(deleted);
    return points;
  }

  function pointLoss(theta, point) {
    var x = features(point);
    var p = clamp(sigmoid(dot(theta, x)), 1e-9, 1 - 1e-9);
    return -(point.yLabel * Math.log(p) + (1 - point.yLabel) * Math.log(1 - p));
  }

  function pointGrad(theta, point) {
    var x = features(point);
    var p = sigmoid(dot(theta, x));
    return scale(x, p - point.yLabel);
  }

  function objective(theta, points, lambda) {
    var sum = 0;
    for (var i = 0; i < points.length; i += 1) sum += pointLoss(theta, points[i]);
    return sum / Math.max(1, points.length) + 0.5 * lambda * (theta[1] * theta[1] + theta[2] * theta[2]);
  }

  function gradient(theta, points, lambda) {
    var g = [0, 0, 0];
    for (var i = 0; i < points.length; i += 1) g = add(g, pointGrad(theta, points[i]));
    g = scale(g, 1 / Math.max(1, points.length));
    g[1] += lambda * theta[1];
    g[2] += lambda * theta[2];
    return g;
  }

  function hessian(theta, points, lambda) {
    var H = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    for (var i = 0; i < points.length; i += 1) {
      var x = features(points[i]);
      var p = sigmoid(dot(theta, x));
      var w = p * (1 - p);
      for (var r = 0; r < 3; r += 1) {
        for (var c = 0; c < 3; c += 1) H[r][c] += w * x[r] * x[c];
      }
    }
    var invN = 1 / Math.max(1, points.length);
    for (var rr = 0; rr < 3; rr += 1) {
      for (var cc = 0; cc < 3; cc += 1) H[rr][cc] *= invN;
    }
    H[1][1] += lambda;
    H[2][2] += lambda;
    H[0][0] += 1e-8;
    H[1][1] += 1e-8;
    H[2][2] += 1e-8;
    return H;
  }

  function solve3(A, b) {
    var M = [
      [A[0][0], A[0][1], A[0][2], b[0]],
      [A[1][0], A[1][1], A[1][2], b[1]],
      [A[2][0], A[2][1], A[2][2], b[2]]
    ];
    for (var col = 0; col < 3; col += 1) {
      var pivot = col;
      for (var row = col + 1; row < 3; row += 1) {
        if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
      }
      if (pivot !== col) {
        var tmp = M[col];
        M[col] = M[pivot];
        M[pivot] = tmp;
      }
      var denom = Math.abs(M[col][col]) < 1e-12 ? (M[col][col] < 0 ? -1e-12 : 1e-12) : M[col][col];
      for (var c = col; c < 4; c += 1) M[col][c] /= denom;
      for (var r = 0; r < 3; r += 1) {
        if (r === col) continue;
        var factor = M[r][col];
        for (var k = col; k < 4; k += 1) M[r][k] -= factor * M[col][k];
      }
    }
    return [M[0][3], M[1][3], M[2][3]];
  }

  function fitLogistic(points, lambda, start, maxSteps) {
    var theta = start ? start.slice() : [0, 0, 0];
    var steps = maxSteps == null ? 42 : maxSteps;
    var lastObjective = objective(theta, points, lambda);
    for (var step = 0; step < steps; step += 1) {
      var g = gradient(theta, points, lambda);
      if (norm(g) < 1e-8) break;
      var H = hessian(theta, points, lambda);
      var delta = solve3(H, g);
      var stepSize = 1;
      var next = sub(theta, scale(delta, stepSize));
      var nextObjective = objective(next, points, lambda);
      while (nextObjective > lastObjective && stepSize > 1 / 64) {
        stepSize *= 0.5;
        next = sub(theta, scale(delta, stepSize));
        nextObjective = objective(next, points, lambda);
      }
      theta = next;
      if (Math.abs(lastObjective - nextObjective) < 1e-10) break;
      lastObjective = nextObjective;
    }
    return theta;
  }

  function influenceDelete(thetaFull, allPoints, deletePoint, lambda) {
    var H = hessian(thetaFull, allPoints, lambda);
    var gDelete = pointGrad(thetaFull, deletePoint);
    return add(thetaFull, scale(solve3(H, gDelete), 1 / Math.max(1, allPoints.length)));
  }

  function prediction(theta, x, y) {
    return sigmoid(theta[0] + theta[1] * x + theta[2] * y);
  }

  function boundaryY(theta, x) {
    if (Math.abs(theta[2]) < 1e-9) return null;
    return -(theta[0] + theta[1] * x) / theta[2];
  }

  function retainedStats(theta, retained) {
    var loss = objective(theta, retained, 0);
    var correct = 0;
    for (var i = 0; i < retained.length; i += 1) {
      var p = prediction(theta, retained[i].x, retained[i].y);
      if ((p >= 0.5 ? 1 : 0) === retained[i].yLabel) correct += 1;
    }
    return { accuracy: correct / Math.max(1, retained.length), loss: loss };
  }

  function maxPredictionDiff(a, b) {
    var max = 0;
    for (var xi = 0; xi <= 32; xi += 1) {
      for (var yi = 0; yi <= 32; yi += 1) {
        var x = -1.35 + 2.7 * xi / 32;
        var y = -1.15 + 2.3 * yi / 32;
        max = Math.max(max, Math.abs(prediction(a, x, y) - prediction(b, x, y)));
      }
    }
    return max;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var lambda = regularization(params);
    var allPoints = generateData(params);
    var retained = allPoints.filter(function (point) { return !point.deleted; });
    var deletePoint = allPoints[allPoints.length - 1];
    var thetaFull = fitLogistic(allPoints, lambda);
    var thetaRetrain = fitLogistic(retained, lambda);
    var thetaInfluence = influenceDelete(thetaFull, allPoints, deletePoint, lambda);
    var thetaRepair = fitLogistic(retained, lambda, thetaFull, params.repairSteps);
    var statsFull = retainedStats(thetaFull, retained);
    var statsRetrain = retainedStats(thetaRetrain, retained);
    var statsInfluence = retainedStats(thetaInfluence, retained);
    var statsRepair = retainedStats(thetaRepair, retained);
    var fullToRetrain = norm(sub(thetaRetrain, thetaFull));
    var influenceGap = norm(sub(thetaInfluence, thetaRetrain));
    var repairGap = norm(sub(thetaRepair, thetaRetrain));
    return {
      allPoints: allPoints,
      deletePoint: deletePoint,
      fullToRetrain: fullToRetrain,
      influenceGap: influenceGap,
      lambda: lambda,
      maxDiffFullRetrain: maxPredictionDiff(thetaFull, thetaRetrain),
      maxDiffInfluenceRetrain: maxPredictionDiff(thetaInfluence, thetaRetrain),
      maxDiffRepairRetrain: maxPredictionDiff(thetaRepair, thetaRetrain),
      params: params,
      retained: retained,
      repairGap: repairGap,
      stats: {
        full: statsFull,
        retrain: statsRetrain,
        influence: statsInfluence,
        repair: statsRepair
      },
      theta: {
        full: thetaFull,
        retrain: thetaRetrain,
        influence: thetaInfluence,
        repair: thetaRepair
      }
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatPct(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="unlearn-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, box.x + 12, box.y + 20);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x + 12, box.y + 37);
    }
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function modelColor(key) {
    return COLORS[key] || COLORS.text;
  }

  function drawBoundary(ctx, plot, theta, color, dash) {
    var xs = [-1.35, 1.35];
    var pts = [];
    for (var i = 0; i < xs.length; i += 1) {
      var y = boundaryY(theta, xs[i]);
      if (y == null) return;
      pts.push({ x: plot.x + (xs[i] + 1.35) / 2.7 * plot.w, y: plot.y + plot.h - (y + 1.15) / 2.3 * plot.h });
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }

  function drawDecisionMap(ctx, box, result) {
    panel(ctx, box, "Decision boundary counterfactual", "delete the red point, then compare repairs");
    var plot = { x: box.x + 36, y: box.y + 54, w: box.w - 58, h: box.h - 86 };
    var grid = 44;
    for (var xi = 0; xi < grid; xi += 1) {
      for (var yi = 0; yi < grid; yi += 1) {
        var x = -1.35 + 2.7 * (xi + 0.5) / grid;
        var y = -1.15 + 2.3 * (yi + 0.5) / grid;
        var p = prediction(result.theta.retrain, x, y);
        var blue = [37, 99, 235];
        var green = [15, 118, 110];
        var mix = p;
        var r = Math.round(255 * 0.78 + (blue[0] * (1 - mix) + green[0] * mix) * 0.22);
        var g = Math.round(255 * 0.78 + (blue[1] * (1 - mix) + green[1] * mix) * 0.22);
        var b = Math.round(255 * 0.78 + (blue[2] * (1 - mix) + green[2] * mix) * 0.22);
        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        ctx.fillRect(plot.x + xi / grid * plot.w, plot.y + yi / grid * plot.h, Math.ceil(plot.w / grid), Math.ceil(plot.h / grid));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    result.retained.forEach(function (point) {
      ctx.fillStyle = point.yLabel ? COLORS.class1 : COLORS.class0;
      ctx.globalAlpha = 0.76;
      ctx.beginPath();
      ctx.arc(plot.x + (point.x + 1.35) / 2.7 * plot.w, plot.y + plot.h - (point.y + 1.15) / 2.3 * plot.h, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    var d = result.deletePoint;
    ctx.fillStyle = COLORS.deletePoint;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(plot.x + (d.x + 1.35) / 2.7 * plot.w, plot.y + plot.h - (d.y + 1.15) / 2.3 * plot.h, 7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;
    drawBoundary(ctx, plot, result.theta.full, COLORS.full, [5, 4]);
    drawBoundary(ctx, plot, result.theta.retrain, COLORS.retrain, null);
    drawBoundary(ctx, plot, result.theta.influence, COLORS.influence, [2, 3]);
    drawBoundary(ctx, plot, result.theta.repair, COLORS.repair, [8, 3]);
  }

  function drawParameterMap(ctx, box, result) {
    panel(ctx, box, "Parameter movement", "bias is hidden; axes are the two feature weights");
    var plot = { x: box.x + 44, y: box.y + 58, w: box.w - 70, h: box.h - 88 };
    var points = [
      { key: "full", theta: result.theta.full },
      { key: "retrain", theta: result.theta.retrain },
      { key: "influence", theta: result.theta.influence },
      { key: "repair", theta: result.theta.repair }
    ];
    var xs = points.map(function (p) { return p.theta[1]; });
    var ys = points.map(function (p) { return p.theta[2]; });
    var minX = Math.min.apply(null, xs) - 0.35;
    var maxX = Math.max.apply(null, xs) + 0.35;
    var minY = Math.min.apply(null, ys) - 0.35;
    var maxY = Math.max.apply(null, ys) + 0.35;
    function px(v) { return plot.x + (v - minX) / Math.max(1e-9, maxX - minX) * plot.w; }
    function py(v) { return plot.y + plot.h - (v - minY) / Math.max(1e-9, maxY - minY) * plot.h; }
    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(plot.x, plot.y + i / 4 * plot.h);
      ctx.lineTo(plot.x + plot.w, plot.y + i / 4 * plot.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(plot.x + i / 4 * plot.w, plot.y);
      ctx.lineTo(plot.x + i / 4 * plot.w, plot.y + plot.h);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    var full = result.theta.full;
    ["retrain", "influence", "repair"].forEach(function (key) {
      var theta = result.theta[key];
      ctx.strokeStyle = modelColor(key);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px(full[1]), py(full[2]));
      ctx.lineTo(px(theta[1]), py(theta[2]));
      ctx.stroke();
      ctx.lineWidth = 1;
    });
    points.forEach(function (p) {
      ctx.fillStyle = modelColor(p.key);
      ctx.beginPath();
      ctx.arc(px(p.theta[1]), py(p.theta[2]), p.key === "full" ? 4 : 5, 0, 2 * Math.PI);
      ctx.fill();
      label(ctx, p.key, px(p.theta[1]) + 7, py(p.theta[2]) - 5, "left", modelColor(p.key), "700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
  }

  function drawBars(ctx, box, result) {
    panel(ctx, box, "Measured against exact retraining", "lower gaps mean closer to the counterfactual");
    var rows = [
      { label: "influence param gap", value: result.influenceGap, color: COLORS.influence },
      { label: "repair param gap", value: result.repairGap, color: COLORS.repair },
      { label: "influence max pred gap", value: result.maxDiffInfluenceRetrain, color: COLORS.influence },
      { label: "repair max pred gap", value: result.maxDiffRepairRetrain, color: COLORS.repair },
      { label: "full-vs-retrain max pred", value: result.maxDiffFullRetrain, color: COLORS.full }
    ];
    var max = Math.max.apply(null, rows.map(function (row) { return row.value; }).concat([0.01]));
    var top = box.y + 58;
    var rowH = (box.h - 78) / rows.length;
    rows.forEach(function (row, index) {
      var y = top + index * rowH;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(box.x + 14, y, box.w - 28, rowH - 8);
      ctx.fillStyle = row.color;
      ctx.globalAlpha = 0.82;
      ctx.fillRect(box.x + 14, y, (box.w - 28) * row.value / max, rowH - 8);
      ctx.globalAlpha = 1;
      label(ctx, row.label, box.x + 20, y + (rowH - 8) / 2 + 4, "left", row.value / max > 0.45 ? "#ffffff" : COLORS.text, "700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, formatNumber(row.value, 3), box.x + box.w - 20, y + (rowH - 8) / 2 + 4, "right", row.value / max > 0.78 ? "#ffffff" : COLORS.text, "700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "What changed?", "the retained data defines the target model");
    var deletedProbFull = prediction(result.theta.full, result.deletePoint.x, result.deletePoint.y);
    var deletedProbRetrain = prediction(result.theta.retrain, result.deletePoint.x, result.deletePoint.y);
    var rows = [
      ["deleted point prob, full", formatPct(deletedProbFull, 1), COLORS.full],
      ["deleted point prob, retrain", formatPct(deletedProbRetrain, 1), COLORS.retrain],
      ["retained acc, retrain", formatPct(result.stats.retrain.accuracy, 1), COLORS.retrain],
      ["retained loss, full", formatNumber(result.stats.full.loss, 3), COLORS.full],
      ["retained loss, retrain", formatNumber(result.stats.retrain.loss, 3), COLORS.retrain],
      ["lambda", formatNumber(result.lambda, 3), COLORS.muted]
    ];
    var y = box.y + 62;
    rows.forEach(function (row) {
      ctx.fillStyle = row[2];
      ctx.beginPath();
      ctx.arc(box.x + 20, y - 4, 4, 0, 2 * Math.PI);
      ctx.fill();
      label(ctx, row[0], box.x + 31, y, "left", COLORS.muted);
      label(ctx, row[1], box.x + box.w - 14, y, "right", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      y += 25;
    });
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var parent = canvas.parentElement || canvas;
    var width = Math.max(320, parent.clientWidth - 2);
    var compact = width < 700;
    var height = compact ? 1080 : 720;
    var ratio = root.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (compact) {
      var m = 12;
      var panelW = width - 2 * m;
      drawDecisionMap(ctx, { x: m, y: 12, w: panelW, h: 360 }, result);
      drawParameterMap(ctx, { x: m, y: 390, w: panelW, h: 230 }, result);
      drawBars(ctx, { x: m, y: 638, w: panelW, h: 230 }, result);
      drawLedger(ctx, { x: m, y: 886, w: panelW, h: 178 }, result);
    } else {
      var gap = 16;
      var leftW = Math.round((width - gap - 24) * 0.58);
      var rightW = width - 24 - gap - leftW;
      drawDecisionMap(ctx, { x: 12, y: 12, w: leftW, h: 430 }, result);
      drawParameterMap(ctx, { x: 12 + leftW + gap, y: 12, w: rightW, h: 250 }, result);
      drawBars(ctx, { x: 12 + leftW + gap, y: 282, w: rightW, h: 250 }, result);
      drawLedger(ctx, { x: 12, y: 462, w: leftW, h: 230 }, result);
    }
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-value]").forEach(function (node) {
      var key = node.getAttribute("data-value");
      if (key === "samples") node.textContent = String(params.samples);
      else if (key === "overlap") node.textContent = params.overlap + "%";
      else if (key === "leverage") node.textContent = params.leverage + "%";
      else if (key === "regularization") node.textContent = formatNumber(regularization(params), 3);
      else if (key === "repairSteps") node.textContent = String(params.repairSteps);
      else if (key === "seed") node.textContent = String(params.seed);
    });
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (node) {
      raw[node.getAttribute("data-param")] = node.value;
    });
    return cleanParams(raw);
  }

  function render(container) {
    var params = readParams(container);
    var result = evaluate(params);
    updateOutputs(container, params);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("exact shift", formatNumber(result.fullToRetrain, 3)),
        metric("influence gap", formatNumber(result.influenceGap, 3)),
        metric("repair gap", formatNumber(result.repairGap, 3)),
        metric("full max diff", formatPct(result.maxDiffFullRetrain, 1)),
        metric("infl max diff", formatPct(result.maxDiffInfluenceRetrain, 1)),
        metric("repair max diff", formatPct(result.maxDiffRepairRetrain, 1))
      ].join("");
    }
    var canvas = container.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
    container.__unlearningCounterfactualResult = result;
  }

  function mount(container) {
    if (container.__unlearningCounterfactualMounted) return;
    container.__unlearningCounterfactualMounted = true;
    container.querySelectorAll("[data-param]").forEach(function (node) {
      node.addEventListener("input", function () { render(container); });
      node.addEventListener("change", function () { render(container); });
    });
    render(container);
    root.addEventListener("resize", function () { render(container); });
  }

  function mountAll() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-unlearning-counterfactual-lab]").forEach(mount);
  }

  root.UnlearningCounterfactualLab = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    fitLogistic: fitLogistic,
    generateData: generateData,
    gradient: gradient,
    hessian: hessian,
    influenceDelete: influenceDelete,
    objective: objective,
    pointGrad: pointGrad,
    prediction: prediction,
    solve3: solve3
  };

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", mountAll);
    } else {
      mountAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
