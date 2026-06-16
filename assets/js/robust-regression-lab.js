(function (global) {
  "use strict";

  var COLORS = {
    grid: "#e6edf3",
    huber: "#7c3aed",
    inlier: "#2563eb",
    muted: "#5d6872",
    ols: "#be123c",
    outlier: "#d97706",
    panel: "#f8fafc",
    ransac: "#0f766e",
    rule: "#d7dee5",
    text: "#172026",
    theil: "#0891b2",
    trueLine: "#111827",
    white: "#ffffff"
  };

  var METHODS = [
    { key: "ols", label: "OLS", color: COLORS.ols },
    { key: "huber", label: "Huber", color: COLORS.huber },
    { key: "theil", label: "Theil-Sen", color: COLORS.theil },
    { key: "ransac", label: "RANSAC", color: COLORS.ransac }
  ];

  var MODES = {
    vertical: "vertical outliers",
    leverage: "leverage points",
    cluster: "competing cluster",
    heavy: "heavy-tail bursts"
  };

  var TRUE_MODEL = { intercept: 0.45, slope: 0.72 };

  var DEFAULTS = {
    contamination: 24,
    huberDelta: 1.35,
    mode: "leverage",
    n: 96,
    seed: 23,
    strength: 70,
    threshold: 0.85,
    trials: 120
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var mode = MODES[raw.mode] ? raw.mode : DEFAULTS.mode;
    return {
      contamination: Math.round(clamp(finite(Number(raw.contamination), DEFAULTS.contamination), 0, 55)),
      huberDelta: clamp(finite(Number(raw.huberDelta), DEFAULTS.huberDelta), 0.5, 3),
      mode: mode,
      n: Math.round(clamp(finite(Number(raw.n), DEFAULTS.n), 36, 180)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      strength: Math.round(clamp(finite(Number(raw.strength), DEFAULTS.strength), 0, 100)),
      threshold: clamp(finite(Number(raw.threshold), DEFAULTS.threshold), 0.25, 3),
      trials: Math.round(clamp(finite(Number(raw.trials), DEFAULTS.trials), 20, 420))
    };
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

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 7, seed));
    var u2 = uniform(index * 2 + 8, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
  }

  function median(values) {
    if (!values.length) return NaN;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return 0.5 * (sorted[mid - 1] + sorted[mid]);
  }

  function quantile(values, q) {
    if (!values.length) return NaN;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var pos = (sorted.length - 1) * q;
    var lo = Math.floor(pos);
    var hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo);
  }

  function lineY(model, x) {
    return model.intercept + model.slope * x;
  }

  function makePoint(x, y, kind, id) {
    return { id: id, kind: kind, x: x, y: y };
  }

  function makeData(raw) {
    var params = cleanParams(raw);
    var outlierCount = Math.round(params.n * params.contamination / 100);
    var inlierCount = Math.max(2, params.n - outlierCount);
    var points = [];
    var sigma = 0.26 + 0.18 * params.strength / 100;
    var seed = params.seed * 4099;
    for (var i = 0; i < inlierCount; i += 1) {
      var x = -5 + 10 * uniform(i, seed);
      var curve = 0.08 * Math.sin(1.25 * x + 0.1 * params.seed);
      var y = lineY(TRUE_MODEL, x) + curve + sigma * normal(i, seed ^ 0xa11ce);
      points.push(makePoint(x, y, "inlier", i));
    }

    for (var j = 0; j < outlierCount; j += 1) {
      var k = inlierCount + j;
      var u = uniform(k, seed ^ 0x51f15e);
      var sign = uniform(k + 19, seed) < 0.5 ? -1 : 1;
      var xOut;
      var yOut;
      if (params.mode === "vertical") {
        xOut = -5 + 10 * u;
        yOut = lineY(TRUE_MODEL, xOut) + sign * (3.4 + 0.08 * params.strength + Math.abs(normal(k, seed)) * 1.3);
      } else if (params.mode === "cluster") {
        xOut = -4.7 + 9.4 * u;
        yOut = 4.4 - 0.96 * xOut + 0.35 * normal(k, seed ^ 0xc0ffee);
      } else if (params.mode === "heavy") {
        xOut = -5 + 10 * u;
        var tail = sign * sigma * (3.5 + 0.22 * params.strength) / Math.max(0.08, uniform(k + 31, seed));
        yOut = lineY(TRUE_MODEL, xOut) + tail;
      } else {
        xOut = 5.7 + 0.065 * params.strength + 3.4 * u;
        yOut = -1.9 + (0.13 + 0.0055 * params.strength) * xOut + 0.55 * normal(k, seed ^ 0xbadc0de);
      }
      points.push(makePoint(xOut, yOut, "outlier", k));
    }
    return { params: params, points: points, trueModel: TRUE_MODEL };
  }

  function weightedLeastSquares(points, weights) {
    var sw = 0;
    var sx = 0;
    var sy = 0;
    var sxx = 0;
    var sxy = 0;
    for (var i = 0; i < points.length; i += 1) {
      var w = weights ? weights[i] : 1;
      var p = points[i];
      sw += w;
      sx += w * p.x;
      sy += w * p.y;
      sxx += w * p.x * p.x;
      sxy += w * p.x * p.y;
    }
    var det = sw * sxx - sx * sx;
    if (Math.abs(det) < 1e-12 || sw <= 0) {
      return { intercept: sy / Math.max(1e-12, sw), slope: 0 };
    }
    return {
      intercept: (sxx * sy - sx * sxy) / det,
      slope: (sw * sxy - sx * sy) / det
    };
  }

  function residuals(points, model) {
    return points.map(function (p) {
      return p.y - lineY(model, p.x);
    });
  }

  function robustScale(res) {
    var med = median(res);
    var mad = median(res.map(function (r) { return Math.abs(r - med); }));
    return Math.max(1e-6, 1.4826 * mad);
  }

  function huberFit(points, delta) {
    var model = weightedLeastSquares(points);
    var weights = points.map(function () { return 1; });
    for (var iter = 0; iter < 18; iter += 1) {
      var res = residuals(points, model);
      var scale = robustScale(res);
      var cutoff = Math.max(1e-6, delta * scale);
      weights = res.map(function (r) {
        var a = Math.abs(r);
        return a <= cutoff ? 1 : cutoff / a;
      });
      model = weightedLeastSquares(points, weights);
    }
    model.weights = weights;
    return model;
  }

  function theilSenFit(points) {
    var slopes = [];
    for (var i = 0; i < points.length; i += 1) {
      for (var j = i + 1; j < points.length; j += 1) {
        var dx = points[j].x - points[i].x;
        if (Math.abs(dx) > 1e-10) slopes.push((points[j].y - points[i].y) / dx);
      }
    }
    var slope = Number.isFinite(median(slopes)) ? median(slopes) : 0;
    var intercept = median(points.map(function (p) { return p.y - slope * p.x; }));
    return { intercept: intercept, slope: slope };
  }

  function lineThrough(a, b) {
    var dx = b.x - a.x;
    if (Math.abs(dx) < 1e-10) return null;
    var slope = (b.y - a.y) / dx;
    return { intercept: a.y - slope * a.x, slope: slope };
  }

  function ransacFit(points, params) {
    var best = null;
    var seed = params.seed * 10007 + params.trials;
    for (var t = 0; t < params.trials; t += 1) {
      var i = hash32(t * 2 + 1, seed) % points.length;
      var j = hash32(t * 2 + 2, seed ^ 0xabcddcba) % points.length;
      if (i === j) j = (j + 1) % points.length;
      var model = lineThrough(points[i], points[j]);
      if (!model) continue;
      var flags = [];
      var inliers = [];
      var score = 0;
      for (var k = 0; k < points.length; k += 1) {
        var r = Math.abs(points[k].y - lineY(model, points[k].x));
        var isInlier = r <= params.threshold;
        flags.push(isInlier);
        if (isInlier) inliers.push(points[k]);
        score += Math.min(r, params.threshold * 2);
      }
      var candidate = { flags: flags, inliers: inliers, model: model, score: score };
      if (!best || inliers.length > best.inliers.length || (inliers.length === best.inliers.length && score < best.score)) {
        best = candidate;
      }
    }
    if (!best || best.inliers.length < 2) {
      return { flags: points.map(function () { return true; }), inliers: points.slice(), intercept: weightedLeastSquares(points).intercept, slope: weightedLeastSquares(points).slope };
    }
    var refit = weightedLeastSquares(best.inliers);
    refit.flags = best.flags;
    refit.inliers = best.inliers;
    refit.sampleModel = best.model;
    return refit;
  }

  function rmse(points, model) {
    if (!points.length) return NaN;
    var sum = 0;
    points.forEach(function (p) {
      var r = p.y - lineY(model, p.x);
      sum += r * r;
    });
    return Math.sqrt(sum / points.length);
  }

  function mae(points, model) {
    if (!points.length) return NaN;
    var sum = 0;
    points.forEach(function (p) {
      sum += Math.abs(p.y - lineY(model, p.x));
    });
    return sum / points.length;
  }

  function leverageRows(points, ols, huber) {
    var meanX = points.reduce(function (acc, p) { return acc + p.x; }, 0) / points.length;
    var sxx = points.reduce(function (acc, p) {
      var dx = p.x - meanX;
      return acc + dx * dx;
    }, 0);
    var olsRes = residuals(points, ols);
    var rows = points.map(function (p, i) {
      var h = 1 / points.length + Math.pow(p.x - meanX, 2) / Math.max(1e-9, sxx);
      var pull = Math.abs(olsRes[i]) * h / Math.max(0.08, 1 - h);
      return {
        huberWeight: huber.weights ? huber.weights[i] : 1,
        id: p.id,
        kind: p.kind,
        pull: pull,
        residual: olsRes[i],
        x: p.x,
        y: p.y
      };
    });
    rows.sort(function (a, b) { return b.pull - a.pull; });
    return rows;
  }

  function evaluate(raw) {
    var data = makeData(raw);
    var params = data.params;
    var points = data.points;
    var inliers = points.filter(function (p) { return p.kind === "inlier"; });
    var models = {
      ols: weightedLeastSquares(points),
      huber: huberFit(points, params.huberDelta),
      theil: theilSenFit(points),
      ransac: ransacFit(points, params)
    };
    var rows = METHODS.map(function (method) {
      var model = models[method.key];
      return {
        color: method.color,
        inlierRmse: rmse(inliers, model),
        key: method.key,
        label: method.label,
        mae: mae(points, model),
        model: model,
        slopeError: model.slope - TRUE_MODEL.slope
      };
    });
    var contamination = points.filter(function (p) { return p.kind === "outlier"; }).length / points.length;
    var cleanProbability = Math.pow(Math.max(0, 1 - contamination), 2);
    return {
      influence: leverageRows(points, models.ols, models.huber),
      models: models,
      params: params,
      points: points,
      rows: rows,
      summary: {
        cleanSampleProbability: 1 - Math.pow(1 - cleanProbability, params.trials),
        contamination: contamination,
        inlierCount: inliers.length,
        outlierCount: points.length - inliers.length,
        ransacConsensus: models.ransac.inliers ? models.ransac.inliers.length : 0
      },
      trueModel: TRUE_MODEL
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    var abs = Math.abs(value);
    if (abs > 0 && (abs >= 1e4 || abs < 1e-3)) return value.toExponential(2);
    return value.toFixed(places);
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="robust-line-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function paramsFromRoot(root) {
    var raw = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    root.querySelectorAll("select[data-param]").forEach(function (select) {
      raw[select.getAttribute("data-param")] = select.value;
    });
    return raw;
  }

  function drawText(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.save();
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || "500") + " " + (opts.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.save();
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 23, { size: 13, weight: "800" });
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 40, { size: 10.5, color: COLORS.muted, weight: "600" });
    ctx.restore();
  }

  function extent(values, pad) {
    var lo = Math.min.apply(null, values);
    var hi = Math.max.apply(null, values);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    var p = (hi - lo) * (pad == null ? 0.08 : pad);
    return [lo - p, hi + p];
  }

  function makeScale(domain, range) {
    var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
    return function (value) {
      return r0 + (value - d0) / (d1 - d0) * (r1 - r0);
    };
  }

  function drawScatter(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "fits under contamination", MODES[result.params.mode]);
    var xs = result.points.map(function (p) { return p.x; });
    var ys = result.points.map(function (p) { return p.y; });
    METHODS.forEach(function (m) {
      xs.push(-6, 11);
      ys.push(lineY(result.models[m.key], -6), lineY(result.models[m.key], 11));
    });
    ys.push(lineY(TRUE_MODEL, -6), lineY(TRUE_MODEL, 11));
    var xDomain = extent(xs, 0.05);
    var yDomain = extent(ys, 0.08);
    var plot = { x: box.x + 42, y: box.y + 52, w: box.w - 62, h: box.h - 82 };
    var sx = makeScale(xDomain, [plot.x, plot.x + plot.w]);
    var sy = makeScale(yDomain, [plot.y + plot.h, plot.y]);

    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gx = plot.x + plot.w * g / 4;
      var gy = plot.y + plot.h * g / 4;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y);
      ctx.lineTo(gx, plot.y + plot.h);
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }

    function drawLine(model, color, width, dash) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(sx(xDomain[0]), sy(lineY(model, xDomain[0])));
      ctx.lineTo(sx(xDomain[1]), sy(lineY(model, xDomain[1])));
      ctx.stroke();
      ctx.restore();
    }

    drawLine(TRUE_MODEL, COLORS.trueLine, 2, [6, 4]);
    METHODS.forEach(function (method) {
      drawLine(result.models[method.key], method.color, method.key === "ols" ? 1.8 : 2.2);
    });

    result.points.forEach(function (p, index) {
      var isRansac = result.models.ransac.flags && result.models.ransac.flags[index];
      ctx.fillStyle = p.kind === "inlier" ? COLORS.inlier : COLORS.outlier;
      ctx.globalAlpha = p.kind === "outlier" ? 0.86 : 0.68;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), isRansac ? 4.2 : 3.2, 0, Math.PI * 2);
      ctx.fill();
      if (isRansac) {
        ctx.strokeStyle = COLORS.ransac;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;

    var legendX = plot.x + 8;
    var legendY = box.y + box.h - 22;
    drawText(ctx, "true", legendX, legendY, { color: COLORS.trueLine, size: 10, weight: "800" });
    METHODS.forEach(function (method, i) {
      drawText(ctx, method.label, legendX + 42 + i * 74, legendY, { color: method.color, size: 10, weight: "800" });
    });
    ctx.restore();
  }

  function drawErrors(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "inlier error", "evaluated only on clean points");
    var maxRmse = Math.max.apply(null, result.rows.map(function (row) { return row.inlierRmse; }));
    maxRmse = Math.max(0.1, maxRmse);
    var x0 = box.x + 24;
    var y0 = box.y + 62;
    var barW = box.w - 48;
    var rowH = (box.h - 90) / result.rows.length;
    ctx.save();
    result.rows.forEach(function (row, i) {
      var y = y0 + i * rowH;
      var w = row.inlierRmse / maxRmse * barW;
      drawText(ctx, row.label, x0, y - 9, { color: row.color, size: 11, weight: "800" });
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(x0, y, barW, 12);
      ctx.fillStyle = row.color;
      ctx.fillRect(x0, y, Math.max(2, w), 12);
      drawText(ctx, "RMSE " + formatNumber(row.inlierRmse, 2), x0 + barW, y + 10, { align: "right", color: COLORS.text, size: 10, weight: "700" });
      drawText(ctx, "slope error " + (row.slopeError >= 0 ? "+" : "") + formatNumber(row.slopeError, 2), x0, y + 28, { color: COLORS.muted, size: 10, weight: "600" });
    });
    drawText(ctx, "RANSAC consensus " + result.summary.ransacConsensus + "/" + result.points.length, x0, box.y + box.h - 14, { color: COLORS.ransac, size: 11, weight: "800" });
    ctx.restore();
  }

  function drawInfluence(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "OLS pull versus Huber weight", "high leverage times residual is the danger sign");
    var rows = result.influence.slice(0, 18);
    var maxPull = Math.max.apply(null, rows.map(function (row) { return row.pull; }));
    maxPull = Math.max(1e-6, maxPull);
    var x0 = box.x + 24;
    var y0 = box.y + 58;
    var barW = box.w - 76;
    var rowH = (box.h - 86) / rows.length;
    ctx.save();
    rows.forEach(function (row, i) {
      var y = y0 + i * rowH;
      var w = row.pull / maxPull * barW;
      ctx.fillStyle = row.kind === "outlier" ? COLORS.outlier : COLORS.inlier;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(x0, y, Math.max(2, w), Math.max(2, rowH - 3));
      ctx.globalAlpha = 1;
      drawText(ctx, "w=" + formatNumber(row.huberWeight, 2), x0 + barW + 10, y + rowH - 5, { color: COLORS.huber, size: 9, weight: "750" });
    });
    drawText(ctx, "largest OLS pulls", x0, box.y + box.h - 14, { color: COLORS.muted, size: 10, weight: "650" });
    ctx.restore();
  }

  function drawLoss(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "loss geometry", "squared loss keeps listening to far residuals");
    var plot = { x: box.x + 42, y: box.y + 56, w: box.w - 68, h: box.h - 88 };
    var maxR = 4;
    var maxLoss = maxR * maxR;
    var sx = makeScale([-maxR, maxR], [plot.x, plot.x + plot.w]);
    var sy = makeScale([0, maxLoss], [plot.y + plot.h, plot.y]);
    var cutoff = result.params.huberDelta;

    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var gy = plot.y + plot.h * g / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }
    function path(color, fn, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (var i = 0; i <= 120; i += 1) {
        var r = -maxR + 2 * maxR * i / 120;
        var y = fn(r);
        if (i === 0) ctx.moveTo(sx(r), sy(y));
        else ctx.lineTo(sx(r), sy(y));
      }
      ctx.stroke();
    }
    path(COLORS.ols, function (r) { return r * r; }, 2);
    path(COLORS.huber, function (r) {
      var a = Math.abs(r);
      return a <= cutoff ? r * r : 2 * cutoff * a - cutoff * cutoff;
    }, 2.5);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(sx(-cutoff), plot.y);
    ctx.lineTo(sx(-cutoff), plot.y + plot.h);
    ctx.moveTo(sx(cutoff), plot.y);
    ctx.lineTo(sx(cutoff), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "squared", plot.x + 8, plot.y + 18, { color: COLORS.ols, size: 11, weight: "800" });
    drawText(ctx, "Huber", plot.x + 78, plot.y + 18, { color: COLORS.huber, size: 11, weight: "800" });
    drawText(ctx, "clean 2-point RANSAC chance: " + formatPercent(result.summary.cleanSampleProbability, 0), plot.x, box.y + box.h - 16, { color: COLORS.ransac, size: 10, weight: "750" });
    ctx.restore();
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, "Robust regression is a policy for which points still get a vote", 18, 30, { size: 17, weight: "850" });
    drawText(ctx, result.points.length + " points, " + formatPercent(result.summary.contamination, 0) + " contamination, " + MODES[result.params.mode], 18, 52, { size: 12, color: COLORS.muted, weight: "600" });

    drawScatter(ctx, result, { x: 18, y: 70, w: 570, h: 382 });
    drawErrors(ctx, result, { x: 606, y: 70, w: 296, h: 382 });
    drawInfluence(ctx, result, { x: 18, y: 472, w: 430, h: 250 });
    drawLoss(ctx, result, { x: 470, y: 472, w: 432, h: 250 });
  }

  function updateOutputs(root, params) {
    [
      ["n", params.n],
      ["contamination", params.contamination + "%"],
      ["strength", params.strength + "%"],
      ["threshold", formatNumber(params.threshold, 2)],
      ["trials", params.trials],
      ["huberDelta", formatNumber(params.huberDelta, 2)]
    ].forEach(function (pair) {
      var node = root.querySelector('[data-value="' + pair[0] + '"]');
      if (node) node.textContent = String(pair[1]);
    });
  }

  function render(root) {
    var result = evaluate(paramsFromRoot(root));
    updateOutputs(root, result.params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var best = result.rows.slice().sort(function (a, b) { return a.inlierRmse - b.inlierRmse; })[0];
      metrics.innerHTML = [
        metric("clean points", result.summary.inlierCount + "/" + result.points.length),
        metric("best clean RMSE", best.label + " " + formatNumber(best.inlierRmse, 2)),
        metric("OLS slope", formatNumber(result.models.ols.slope, 2)),
        metric("Theil-Sen slope", formatNumber(result.models.theil.slope, 2)),
        metric("RANSAC consensus", result.summary.ransacConsensus + "/" + result.points.length),
        metric("clean sample chance", formatPercent(result.summary.cleanSampleProbability, 0))
      ].join("");
    }
    draw(root.querySelector("canvas[data-canvas]"), result);
  }

  function init(root) {
    if (!root || root.__robustLineReady) return;
    root.__robustLineReady = true;
    root.querySelectorAll("input[data-param], select[data-param]").forEach(function (control) {
      control.addEventListener("input", function () { render(root); });
      control.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function audit() {
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    var perfect = [];
    for (var i = 0; i < 12; i += 1) perfect.push(makePoint(i - 5, 1 + 2 * (i - 5), "inlier", i));
    var olsPerfect = weightedLeastSquares(perfect);
    assert(Math.abs(olsPerfect.slope - 2) < 1e-12, "OLS should recover a perfect slope");
    assert(Math.abs(olsPerfect.intercept - 1) < 1e-12, "OLS should recover a perfect intercept");

    var oneBad = perfect.concat([makePoint(0.5, 1000, "outlier", 99)]);
    var theil = theilSenFit(oneBad);
    var ols = weightedLeastSquares(oneBad);
    assert(Math.abs(theil.slope - 2) < 1e-9, "Theil-Sen should ignore one gross vertical outlier in this bench");
    assert(Math.abs(ols.intercept - 1) > 20, "OLS should move under one gross vertical outlier");

    var vertical = evaluate({ mode: "vertical", contamination: 30, n: 110, strength: 80, threshold: 1.1, trials: 180, seed: 13, huberDelta: 1.35 });
    var rows = {};
    vertical.rows.forEach(function (row) { rows[row.key] = row; });
    assert(rows.huber.inlierRmse < rows.ols.inlierRmse, "Huber should beat OLS on vertical outliers");
    assert(rows.theil.inlierRmse < rows.ols.inlierRmse, "Theil-Sen should beat OLS on vertical outliers");
    assert(vertical.summary.ransacConsensus >= vertical.summary.inlierCount * 0.85, "RANSAC should find most clean points on vertical outliers");
    assert(vertical.influence[0].huberWeight < 0.5, "Huber should downweight the worst OLS pull");

    var leverage = evaluate({ mode: "leverage", contamination: 24, n: 96, strength: 70, threshold: 0.85, trials: 120, seed: 23, huberDelta: 1.35 });
    leverage.rows.forEach(function (row) {
      assert(Number.isFinite(row.model.slope), "finite slope for " + row.key);
      assert(Number.isFinite(row.inlierRmse), "finite RMSE for " + row.key);
    });
    assert(leverage.points.length === 96, "cleanParams should preserve default n");

    return {
      leverage: leverage.rows.map(function (row) {
        return [row.key, Number(row.model.slope.toFixed(3)), Number(row.inlierRmse.toFixed(3))];
      }),
      verticalConsensus: vertical.summary.ransacConsensus,
      verticalInliers: vertical.summary.inlierCount
    };
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    makeData: makeData
  };

  global.RobustRegressionLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-robust-line-lab]").forEach(init);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
