(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    oracle: "#172026",
    response: "#b45309",
    rlearner: "#0f766e",
    tlearner: "#2563eb",
    random: "#94a3b8",
    harm: "#be123c",
    help: "#7c3aed",
    warn: "#b45309",
    treated: "#0f766e",
    control: "#64748b"
  };

  var DEFAULTS = {
    budget: 35,
    confounding: 0,
    cost: 12,
    effect: 100,
    n: 2200,
    noise: 45,
    overlap: 10
  };

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      budget: clamp(numeric(raw, "budget"), 5, 95) / 100,
      confounding: clamp(numeric(raw, "confounding"), -100, 100) / 100,
      cost: clamp(numeric(raw, "cost"), 0, 40) / 100,
      effect: clamp(numeric(raw, "effect"), 40, 180) / 100,
      n: Math.round(clamp(numeric(raw, "n"), 600, 5000)),
      noise: clamp(numeric(raw, "noise"), 10, 100) / 100,
      overlap: clamp(numeric(raw, "overlap"), 2, 30) / 100
    };
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function mean(values) {
    return values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : 0;
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatSigned(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    var sign = value > 0 ? "+" : "";
    return sign + value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="uplift-policy-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function dot(a, b) {
    var total = 0;
    for (var i = 0; i < a.length; i += 1) total += a[i] * b[i];
    return total;
  }

  function baseSignal(x1, x2) {
    var persuadable = Math.exp(-6.5 * (Math.pow(x1 - 0.45, 2) + Math.pow(x2 + 0.25, 2)));
    var alreadyGood = Math.exp(-6.0 * (Math.pow(x1 + 0.45, 2) + Math.pow(x2 - 0.35, 2)));
    return 0.08 + 0.08 * x1 - 0.06 * x2 + 0.10 * Math.sin(Math.PI * x1 * x2) + 1.25 * alreadyGood - 0.25 * persuadable;
  }

  function rawTau(x1, x2, effect) {
    var good = Math.exp(-6.5 * (Math.pow(x1 - 0.45, 2) + Math.pow(x2 + 0.25, 2)));
    var bad = Math.exp(-7.0 * (Math.pow(x1 + 0.45, 2) + Math.pow(x2 - 0.35, 2)));
    var ridge = 0.14 * Math.sin(Math.PI * (x1 - x2)) + 0.10 * x1 - 0.08 * x2;
    return effect * (0.55 * good - 0.52 * bad + ridge);
  }

  function features(row) {
    var x1 = row.x1;
    var x2 = row.x2;
    var good = Math.exp(-6.5 * (Math.pow(x1 - 0.45, 2) + Math.pow(x2 + 0.25, 2)));
    var bad = Math.exp(-7.0 * (Math.pow(x1 + 0.45, 2) + Math.pow(x2 - 0.35, 2)));
    return [1, x1, x2, x1 * x2, x1 * x1, x2 * x2, good, bad, Math.sin(Math.PI * (x1 - x2))];
  }

  function generateRows(params, count, seedOffset) {
    var rand = rng(20260614 + seedOffset * 104729 + Math.round(params.effect * 1000) * 17 + params.n);
    var rows = [];
    for (var i = 0; i < count; i += 1) {
      var x1 = 2 * rand() - 1;
      var x2 = 2 * rand() - 1;
      var baseline = baseSignal(x1, x2);
      var tau = rawTau(x1, x2, params.effect);
      var assignmentScore = 2.8 * params.confounding * (baseline + 0.65 * tau + 0.25 * x1 - 0.15 * x2);
      var propensity = params.overlap + (1 - 2 * params.overlap) * sigmoid(assignmentScore);
      var w = rand() < propensity ? 1 : 0;
      var y = baseline + w * tau + params.noise * normal(rand);
      rows.push({
        baseline: baseline,
        netTau: tau - params.cost,
        propensity: propensity,
        tau: tau,
        w: w,
        x1: x1,
        x2: x2,
        y: y
      });
    }
    return rows;
  }

  function solveLinear(a, b) {
    var n = b.length;
    var matrix = [];
    for (var i = 0; i < n; i += 1) matrix.push(a[i].slice().concat([b[i]]));

    for (var col = 0; col < n; col += 1) {
      var pivot = col;
      for (var row = col + 1; row < n; row += 1) {
        if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
      }
      if (Math.abs(matrix[pivot][col]) < 1e-10) continue;
      if (pivot !== col) {
        var tmp = matrix[col];
        matrix[col] = matrix[pivot];
        matrix[pivot] = tmp;
      }
      var div = matrix[col][col];
      for (var j = col; j <= n; j += 1) matrix[col][j] /= div;
      for (var r = 0; r < n; r += 1) {
        if (r === col) continue;
        var factor = matrix[r][col];
        for (var c = col; c <= n; c += 1) matrix[r][c] -= factor * matrix[col][c];
      }
    }

    return matrix.map(function (row) { return Number.isFinite(row[n]) ? row[n] : 0; });
  }

  function ridgeFit(rows, targetFn, weightFn, lambda) {
    var p = features(rows[0] || { x1: 0, x2: 0 }).length;
    var a = [];
    var b = new Array(p).fill(0);
    for (var i = 0; i < p; i += 1) a.push(new Array(p).fill(0));
    rows.forEach(function (row) {
      var phi = features(row);
      var weight = weightFn ? weightFn(row) : 1;
      var target = targetFn(row);
      if (!Number.isFinite(target) || !Number.isFinite(weight) || weight <= 0) return;
      for (var r = 0; r < p; r += 1) {
        b[r] += weight * phi[r] * target;
        for (var c = 0; c < p; c += 1) a[r][c] += weight * phi[r] * phi[c];
      }
    });
    for (var d = 0; d < p; d += 1) a[d][d] += lambda * (d === 0 ? 0.15 : 1);
    return solveLinear(a, b);
  }

  function predict(coef, row) {
    return dot(coef, features(row));
  }

  function fitTLearner(rows) {
    var treated = rows.filter(function (row) { return row.w === 1; });
    var control = rows.filter(function (row) { return row.w === 0; });
    var lambda = Math.max(0.1, rows.length * 0.002);
    var treatedCoef = ridgeFit(treated.length ? treated : rows, function (row) { return row.y; }, null, lambda);
    var controlCoef = ridgeFit(control.length ? control : rows, function (row) { return row.y; }, null, lambda);
    return function (row) {
      return predict(treatedCoef, row) - predict(controlCoef, row);
    };
  }

  function fitRLearner(rows, params) {
    var nuisance = rows.filter(function (_, index) { return index % 2 === 0; });
    var effectRows = rows.filter(function (_, index) { return index % 2 === 1; });
    var lambda = Math.max(0.1, rows.length * 0.002);
    var mCoef = ridgeFit(nuisance, function (row) { return row.y; }, null, lambda);
    var eCoef = ridgeFit(nuisance, function (row) { return row.w; }, null, lambda);
    var lower = Math.max(0.03, params.overlap * 0.6);
    function eHat(row) {
      return clamp(predict(eCoef, row), lower, 1 - lower);
    }
    var tauCoef = ridgeFit(effectRows, function (row) {
      var residualW = row.w - eHat(row);
      return (row.y - predict(mCoef, row)) / residualW;
    }, function (row) {
      var residualW = row.w - eHat(row);
      return residualW * residualW;
    }, lambda);
    return function (row) {
      return predict(tauCoef, row);
    };
  }

  function fitResponseModel(rows) {
    var treated = rows.filter(function (row) { return row.w === 1; });
    var lambda = Math.max(0.1, rows.length * 0.002);
    var coef = ridgeFit(treated.length ? treated : rows, function (row) { return row.y; }, null, lambda);
    return function (row) {
      return predict(coef, row);
    };
  }

  function pearson(a, b) {
    var ma = mean(a);
    var mb = mean(b);
    var num = 0;
    var da = 0;
    var db = 0;
    for (var i = 0; i < a.length; i += 1) {
      var xa = a[i] - ma;
      var xb = b[i] - mb;
      num += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
  }

  function sortedByScore(rows, scoreKey) {
    return rows.slice().sort(function (a, b) { return b[scoreKey] - a[scoreKey]; });
  }

  function valueAtBudget(rows, scoreKey, budget) {
    var sorted = sortedByScore(rows, scoreKey);
    var k = Math.max(1, Math.round(budget * sorted.length));
    var selected = sorted.slice(0, k);
    var value = selected.reduce(function (sum, row) { return sum + row.netTau; }, 0) / rows.length;
    var harm = selected.filter(function (row) { return row.netTau < 0; }).length / selected.length;
    return { harm: harm, selected: selected, value: value };
  }

  function gainCurve(rows, scoreKey) {
    var sorted = sortedByScore(rows, scoreKey);
    var points = [{ fraction: 0, value: 0 }];
    var total = 0;
    for (var i = 0; i < sorted.length; i += 1) {
      total += sorted[i].netTau;
      if ((i + 1) % Math.max(1, Math.floor(sorted.length / 40)) === 0 || i === sorted.length - 1) {
        points.push({ fraction: (i + 1) / sorted.length, value: total / rows.length });
      }
    }
    return points;
  }

  function deciles(rows, scoreKey) {
    var sorted = sortedByScore(rows, scoreKey);
    var out = [];
    for (var d = 0; d < 10; d += 1) {
      var start = Math.floor(d * sorted.length / 10);
      var end = Math.floor((d + 1) * sorted.length / 10);
      var group = sorted.slice(start, end);
      out.push({
        control: group.filter(function (row) { return row.w === 0; }).length,
        estimated: mean(group.map(function (row) { return row[scoreKey]; })),
        treated: group.filter(function (row) { return row.w === 1; }).length,
        trueNet: mean(group.map(function (row) { return row.netTau; }))
      });
    }
    return out;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var train = generateRows(params, params.n, 1);
    var test = generateRows(params, Math.max(1800, Math.round(params.n * 0.9)), 2);
    var tLearner = fitTLearner(train);
    var rLearner = fitRLearner(train, params);
    var responseModel = fitResponseModel(train);
    test.forEach(function (row) {
      row.tScore = tLearner(row) - params.cost;
      row.rScore = rLearner(row) - params.cost;
      row.responseScore = responseModel(row);
      row.oracleScore = row.netTau;
      row.randomScore = 0;
    });
    train.forEach(function (row) {
      row.rScore = rLearner(row) - params.cost;
    });

    var oracle = valueAtBudget(test, "oracleScore", params.budget);
    var rPolicy = valueAtBudget(test, "rScore", params.budget);
    var responsePolicy = valueAtBudget(test, "responseScore", params.budget);
    var tPolicy = valueAtBudget(test, "tScore", params.budget);
    var randomValue = params.budget * mean(test.map(function (row) { return row.netTau; }));
    var ate = mean(test.map(function (row) { return row.netTau; }));
    var selectedIds = new Set(rPolicy.selected.map(function (row) { return row; }));
    var overlap = deciles(train, "rScore");

    return {
      calibration: deciles(test, "rScore"),
      curves: {
        oracle: gainCurve(test, "oracleScore"),
        random: [
          { fraction: 0, value: 0 },
          { fraction: 1, value: ate }
        ],
        response: gainCurve(test, "responseScore"),
        rlearner: gainCurve(test, "rScore"),
        tlearner: gainCurve(test, "tScore")
      },
      params: params,
      points: test.slice(0, 1000).map(function (row) {
        return {
          selected: selectedIds.has(row),
          netTau: row.netTau,
          rScore: row.rScore,
          x1: row.x1,
          x2: row.x2
        };
      }),
      summary: {
        ate: ate,
        oracleValue: oracle.value,
        randomValue: randomValue,
        regret: oracle.value - rPolicy.value,
        responseValue: responsePolicy.value,
        rHarm: rPolicy.harm,
        rRank: pearson(test.map(function (row) { return row.rScore; }), test.map(function (row) { return row.netTau; })),
        rValue: rPolicy.value,
        tValue: tPolicy.value,
        treatAllValue: ate
      },
      trainOverlap: overlap
    };
  }

  function label(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    label(ctx, title, box.x, box.y - 13, "left", "bottom", COLORS.text);
    if (subtitle && ctx.measureText(title).width + ctx.measureText(subtitle).width + 18 < box.w) {
      label(ctx, subtitle, box.x + box.w, box.y - 13, "right", "bottom", COLORS.muted);
    }
  }

  function colorFor(value, maxAbs) {
    var t = clamp(value / Math.max(1e-6, maxAbs), -1, 1);
    if (t >= 0) {
      var r1 = Math.round(255 - 115 * t);
      var g1 = Math.round(255 - 132 * t);
      var b1 = Math.round(255 - 112 * t);
      return "rgb(" + r1 + "," + g1 + "," + b1 + ")";
    }
    var u = -t;
    var r2 = Math.round(255 - 65 * u);
    var g2 = Math.round(255 - 237 * u);
    var b2 = Math.round(255 - 195 * u);
    return "rgb(" + r2 + "," + g2 + "," + b2 + ")";
  }

  function drawLandscape(ctx, result, box) {
    panel(ctx, box, "Treatment-effect landscape", "purple helps, red harms");
    var plot = { x: box.x + 32, y: box.y + 24, w: box.w - 50, h: box.h - 50 };
    var maxAbs = Math.max.apply(null, result.points.map(function (p) { return Math.abs(p.netTau); }).concat([0.2]));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    result.points.forEach(function (point) {
      var x = plot.x + (point.x1 + 1) / 2 * plot.w;
      var y = plot.y + (1 - (point.x2 + 1) / 2) * plot.h;
      ctx.fillStyle = colorFor(point.netTau, maxAbs);
      ctx.beginPath();
      ctx.arc(x, y, point.selected ? 3.5 : 2.2, 0, 2 * Math.PI);
      ctx.fill();
      if (point.selected) {
        ctx.strokeStyle = COLORS.rlearner;
        ctx.stroke();
      }
    });
    label(ctx, "selected by R-learner outlined", plot.x, plot.y + plot.h + 18, "left", "middle", COLORS.muted);
  }

  function drawLine(ctx, points, sx, sy, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = sx(point);
      var y = sy(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawGain(ctx, result, box) {
    panel(ctx, box, "Policy gain curve", "incremental value per user");
    var allPoints = result.curves.oracle.concat(result.curves.rlearner).concat(result.curves.response).concat(result.curves.random);
    var minY = Math.min.apply(null, allPoints.map(function (p) { return p.value; }).concat([0]));
    var maxY = Math.max.apply(null, allPoints.map(function (p) { return p.value; }).concat([0.05]));
    var pad = Math.max(0.02, (maxY - minY) * 0.12);
    minY -= pad;
    maxY += pad;
    var plot = { x: box.x + 42, y: box.y + 24, w: box.w - 62, h: box.h - 58 };
    function sx(point) {
      return plot.x + point.fraction * plot.w;
    }
    function sy(point) {
      return plot.y + plot.h - (point.value - minY) / (maxY - minY) * plot.h;
    }
    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1].forEach(function (tick) {
      var x = plot.x + tick * plot.w;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      label(ctx, formatPercent(tick), x, plot.y + plot.h + 17, "center", "middle", COLORS.muted);
    });
    var zeroY = sy({ value: 0 });
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, zeroY);
    ctx.lineTo(plot.x + plot.w, zeroY);
    ctx.stroke();
    drawLine(ctx, result.curves.oracle, sx, sy, COLORS.oracle, 2);
    drawLine(ctx, result.curves.rlearner, sx, sy, COLORS.rlearner, 2.4);
    drawLine(ctx, result.curves.response, sx, sy, COLORS.response, 2);
    drawLine(ctx, result.curves.random, sx, sy, COLORS.random, 1.7);
    var bx = plot.x + result.params.budget * plot.w;
    ctx.strokeStyle = COLORS.warn;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(bx, plot.y);
    ctx.lineTo(bx, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "oracle", plot.x + plot.w - 4, plot.y + 16, "right", "middle", COLORS.oracle);
    label(ctx, "R", plot.x + plot.w - 4, plot.y + 34, "right", "middle", COLORS.rlearner);
    label(ctx, "response", plot.x + plot.w - 4, plot.y + 52, "right", "middle", COLORS.response);
  }

  function drawCalibration(ctx, result, box) {
    panel(ctx, box, "Uplift calibration by decile", "rank first, then audit levels");
    var rows = result.calibration;
    var plot = { x: box.x + 38, y: box.y + 24, w: box.w - 58, h: box.h - 58 };
    var values = [];
    rows.forEach(function (row) {
      values.push(row.estimated);
      values.push(row.trueNet);
    });
    var minY = Math.min.apply(null, values.concat([0])) - 0.05;
    var maxY = Math.max.apply(null, values.concat([0])) + 0.05;
    function sy(value) {
      return plot.y + plot.h - (value - minY) / (maxY - minY) * plot.h;
    }
    var zeroY = sy(0);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, zeroY);
    ctx.lineTo(plot.x + plot.w, zeroY);
    ctx.stroke();
    var gap = plot.w / rows.length;
    rows.forEach(function (row, index) {
      var x = plot.x + index * gap + gap * 0.2;
      var w = gap * 0.24;
      ctx.fillStyle = row.trueNet >= 0 ? COLORS.help : COLORS.harm;
      ctx.fillRect(x, Math.min(sy(row.trueNet), zeroY), w, Math.abs(sy(row.trueNet) - zeroY));
      ctx.fillStyle = COLORS.rlearner;
      ctx.fillRect(x + w + 2, Math.min(sy(row.estimated), zeroY), w, Math.abs(sy(row.estimated) - zeroY));
      if (index === 0 || index === 9) label(ctx, String(index + 1), x + w, plot.y + plot.h + 17, "center", "middle", COLORS.muted);
    });
    label(ctx, "top decile", plot.x, plot.y + plot.h + 17, "left", "middle", COLORS.muted);
    label(ctx, "true", plot.x + plot.w - 42, plot.y + 16, "right", "middle", COLORS.help);
    label(ctx, "estimated", plot.x + plot.w - 4, plot.y + 16, "right", "middle", COLORS.rlearner);
  }

  function drawOverlap(ctx, result, box) {
    panel(ctx, box, "Overlap audit", "training counts in R-score deciles");
    var rows = result.trainOverlap;
    var plot = { x: box.x + 38, y: box.y + 24, w: box.w - 58, h: box.h - 58 };
    var maxCount = Math.max.apply(null, rows.map(function (row) { return row.treated + row.control; }).concat([1]));
    var gap = plot.w / rows.length;
    rows.forEach(function (row, index) {
      var totalH = (row.treated + row.control) / maxCount * plot.h;
      var treatedH = row.treated / Math.max(1, row.treated + row.control) * totalH;
      var x = plot.x + index * gap + gap * 0.18;
      var y = plot.y + plot.h - totalH;
      var w = gap * 0.58;
      ctx.fillStyle = COLORS.control;
      ctx.fillRect(x, y, w, totalH);
      ctx.fillStyle = COLORS.treated;
      ctx.fillRect(x, y + totalH - treatedH, w, treatedH);
      if (row.treated < 8 || row.control < 8) {
        ctx.strokeStyle = COLORS.warn;
        ctx.strokeRect(x - 1, y - 1, w + 2, totalH + 2);
      }
      if (index === 0 || index === 9) label(ctx, String(index + 1), x + w / 2, plot.y + plot.h + 17, "center", "middle", COLORS.muted);
    });
    label(ctx, "top score", plot.x, plot.y + plot.h + 17, "left", "middle", COLORS.muted);
    label(ctx, "treated", plot.x + plot.w - 4, plot.y + 16, "right", "middle", COLORS.treated);
    label(ctx, "control", plot.x + plot.w - 4, plot.y + 34, "right", "middle", COLORS.control);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 980 : 660;
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    if (compact) {
      var left = 42;
      var plotW = width - left - 18;
      drawLandscape(ctx, result, { x: left, y: 42, w: plotW, h: 175 });
      drawGain(ctx, result, { x: left, y: 288, w: plotW, h: 178 });
      drawCalibration(ctx, result, { x: left, y: 540, w: plotW, h: 160 });
      drawOverlap(ctx, result, { x: left, y: 775, w: plotW, h: 160 });
    } else {
      var margin = 54;
      var gap = 42;
      var w = (width - margin - 24 - gap) / 2;
      drawLandscape(ctx, result, { x: margin, y: 42, w: w, h: 215 });
      drawGain(ctx, result, { x: margin + w + gap, y: 42, w: w, h: 215 });
      drawCalibration(ctx, result, { x: margin, y: 342, w: w, h: 185 });
      drawOverlap(ctx, result, { x: margin + w + gap, y: 342, w: w, h: 185 });
    }
  }

  function parseParams(root) {
    var params = Object.assign({}, DEFAULTS);
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "budget" || key === "confounding" || key === "cost" || key === "effect" || key === "noise" || key === "overlap") {
        output.textContent = (key === "confounding" && params[key] > 0 ? "+" : "") + params[key] + "%";
      } else output.textContent = String(params[key]);
    });
  }

  function render(root) {
    var raw = parseParams(root);
    var result = evaluate(raw);
    updateOutputs(root, raw);
    root.querySelector("[data-metrics]").innerHTML = [
      metric("ATE net lift", formatSigned(result.summary.ate, 3)),
      metric("R-policy lift", formatSigned(result.summary.rValue, 3)),
      metric("response-policy lift", formatSigned(result.summary.responseValue, 3)),
      metric("oracle lift", formatSigned(result.summary.oracleValue, 3)),
      metric("harm among treated", formatPercent(result.summary.rHarm, 0)),
      metric("rank correlation", formatNumber(result.summary.rRank, 2))
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-uplift-policy-lab]")).forEach(function (root) {
      if (root.__upliftPolicyReady) return;
      root.__upliftPolicyReady = true;
      var schedule = null;
      var scheduledWithTimeout = false;
      function requestRender() {
        if (schedule) {
          if (scheduledWithTimeout) window.clearTimeout(schedule);
          else if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(schedule);
        }
        scheduledWithTimeout = typeof window.requestAnimationFrame !== "function";
        var scheduleRender = scheduledWithTimeout
          ? function (callback) { return window.setTimeout(callback, 16); }
          : window.requestAnimationFrame;
        schedule = scheduleRender(function () {
          schedule = null;
          render(root);
        });
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      window.addEventListener("resize", requestRender);
      requestRender();
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      cleanParams: cleanParams,
      evaluate: evaluate,
      fitResponseModel: fitResponseModel,
      fitRLearner: fitRLearner,
      fitTLearner: fitTLearner,
      generateRows: generateRows
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      window.setTimeout(init, 0);
    } else {
      init();
    }
  }
}());
