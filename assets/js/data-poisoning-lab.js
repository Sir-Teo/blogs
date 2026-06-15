(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#eef2f5",
    faint: "#f8fafc",
    negative: "#2563eb",
    positive: "#d97706",
    poison: "#be123c",
    target: "#7c3aed",
    robust: "#0f766e",
    removed: "#64748b"
  };

  var DEFENSES = [
    { key: "none", name: "ordinary ERM", short: "ERM", trim: 0, clip: 0, color: "#be123c" },
    { key: "audit", name: "influence audit", short: "audit", trim: 0.09, clip: 0, color: "#2563eb" },
    { key: "clip", name: "gradient clipping", short: "clip", trim: 0, clip: 1.30, color: "#d97706" },
    { key: "auditclip", name: "audit + clip", short: "both", trim: 0.08, clip: 1.20, color: "#0f766e" }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rng(seed) {
    var state = mix32(seed || 1);
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(random) {
    var u1 = Math.max(1e-12, random());
    var u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function sigmoid(x) {
    if (x >= 0) {
      var z = Math.exp(-x);
      return 1 / (1 + z);
    }
    var z2 = Math.exp(x);
    return z2 / (1 + z2);
  }

  function dot(w, point) {
    return w[0] + w[1] * point.x + w[2] * point.y;
  }

  function features(point) {
    return [1, point.x, point.y];
  }

  function pct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="data-poisoning-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function defenseByKey(key) {
    for (var i = 0; i < DEFENSES.length; i += 1) {
      if (DEFENSES[i].key === key) return DEFENSES[i];
    }
    return DEFENSES[0];
  }

  function cleanParams(raw) {
    return {
      seed: clamp(Math.round(raw.seed || 31), 1, 99),
      poison: clamp(Math.round(raw.poison || 10), 0, 22),
      stealth: clamp(raw.stealth == null ? 0.52 : raw.stealth, 0, 1),
      spread: clamp(raw.spread == null ? 0.47 : raw.spread, 0.25, 0.80),
      regularization: clamp(raw.regularization == null ? 0.045 : raw.regularization, 0.005, 0.20),
      defense: defenseByKey(raw.defense || "none").key
    };
  }

  function sampleClass(random, y, index, spread) {
    var cx = y ? 0.92 : -0.92;
    var cy = y ? 0.34 : -0.28;
    var a = normal(random);
    var b = normal(random);
    return {
      id: "c" + y + "-" + index,
      poison: false,
      removed: false,
      x: cx + spread * (0.78 * a + 0.18 * b),
      y: cy + spread * (0.30 * a + 0.64 * b),
      label: y
    };
  }

  function makeCleanData(params) {
    var random = rng(params.seed * 1009 + 17);
    var points = [];
    for (var i = 0; i < 54; i += 1) points.push(sampleClass(random, 0, i, params.spread));
    for (var j = 0; j < 54; j += 1) points.push(sampleClass(random, 1, j, params.spread));
    return points;
  }

  function targetPoint(params) {
    var random = rng(params.seed * 3571 + 99);
    return {
      id: "target",
      target: true,
      x: -0.18 + 0.08 * normal(random),
      y: 0.53 + 0.07 * normal(random),
      label: 0
    };
  }

  function makePoisons(params, target) {
    var random = rng(params.seed * 7919 + 313);
    var poisons = [];
    var stealth = params.stealth;
    var positiveAnchor = { x: 0.92, y: 0.34 };
    var ridge = { x: 0.35, y: 0.70 };
    for (var i = 0; i < params.poison; i += 1) {
      var phase = (i + 0.5) / Math.max(1, params.poison);
      var arc = 2 * Math.PI * phase;
      var centerBlend = 0.36 + 0.54 * stealth;
      var x = centerBlend * positiveAnchor.x + (1 - centerBlend) * target.x;
      var y = centerBlend * positiveAnchor.y + (1 - centerBlend) * target.y;
      x = 0.72 * x + 0.28 * ridge.x;
      y = 0.72 * y + 0.28 * ridge.y;
      var jitter = 0.045 + 0.18 * stealth;
      poisons.push({
        id: "p-" + i,
        poison: true,
        removed: false,
        x: x + jitter * Math.cos(arc) + 0.030 * normal(random),
        y: y + 0.72 * jitter * Math.sin(arc) + 0.030 * normal(random),
        label: 1
      });
    }
    return poisons;
  }

  function applyDefense(points, defense, params, target) {
    var out = points.map(function (point) {
      return Object.assign({}, point, { removed: false });
    });
    if (!defense.trim) return out;
    var roughW = train(out, params || { regularization: 0.045 }, DEFENSES[0]);
    var rows = influence(out, roughW, target, params || { regularization: 0.045 })
      .filter(function (point) { return point.influence > 0; });
    var removeCount = Math.floor(out.length * defense.trim);
    var remove = {};
    for (var i = 0; i < Math.min(removeCount, rows.length); i += 1) remove[rows[i].id] = true;
    out.forEach(function (point) {
      if (remove[point.id]) point.removed = true;
    });
    return out;
  }

  function train(points, params, defense) {
    var kept = points.filter(function (point) { return !point.removed; });
    var w = [0, 0, 0];
    var lambda = params.regularization;
    for (var iter = 0; iter < 420; iter += 1) {
      var g = [0, 0, 0];
      kept.forEach(function (point) {
        var p = sigmoid(dot(w, point));
        var e = p - point.label;
        var fx = features(point);
        var gi = [e * fx[0], e * fx[1], e * fx[2]];
        if (defense.clip) {
          var norm = Math.sqrt(gi[0] * gi[0] + gi[1] * gi[1] + gi[2] * gi[2]);
          var scale = norm > defense.clip ? defense.clip / norm : 1;
          gi[0] *= scale;
          gi[1] *= scale;
          gi[2] *= scale;
        }
        g[0] += gi[0];
        g[1] += gi[1];
        g[2] += gi[2];
      });
      var n = Math.max(1, kept.length);
      g[0] /= n;
      g[1] = g[1] / n + lambda * w[1];
      g[2] = g[2] / n + lambda * w[2];
      var eta = 0.64 / (1 + iter / 150);
      w[0] -= eta * g[0];
      w[1] -= eta * g[1];
      w[2] -= eta * g[2];
    }
    return w;
  }

  function loss(points, w, params) {
    var sum = 0;
    var kept = points.filter(function (point) { return !point.removed; });
    kept.forEach(function (point) {
      var p = clamp(sigmoid(dot(w, point)), 1e-6, 1 - 1e-6);
      sum += point.label ? -Math.log(p) : -Math.log(1 - p);
    });
    return sum / Math.max(1, kept.length) + 0.5 * params.regularization * (w[1] * w[1] + w[2] * w[2]);
  }

  function makeTestData(params) {
    var random = rng(params.seed * 6151 + 909);
    var test = [];
    for (var i = 0; i < 220; i += 1) test.push(sampleClass(random, 0, "t" + i, params.spread));
    for (var j = 0; j < 220; j += 1) test.push(sampleClass(random, 1, "t" + j, params.spread));
    return test;
  }

  function accuracy(points, w) {
    var correct = 0;
    points.forEach(function (point) {
      var pred = sigmoid(dot(w, point)) >= 0.5 ? 1 : 0;
      if (pred === point.label) correct += 1;
    });
    return correct / Math.max(1, points.length);
  }

  function inverse3(m) {
    var a = m[0][0], b = m[0][1], c = m[0][2];
    var d = m[1][0], e = m[1][1], f = m[1][2];
    var g = m[2][0], h = m[2][1], i = m[2][2];
    var A = e * i - f * h;
    var B = -(d * i - f * g);
    var C = d * h - e * g;
    var D = -(b * i - c * h);
    var E = a * i - c * g;
    var F = -(a * h - b * g);
    var G = b * f - c * e;
    var H = -(a * f - c * d);
    var I = a * e - b * d;
    var det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-10) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    return [
      [A / det, D / det, G / det],
      [B / det, E / det, H / det],
      [C / det, F / det, I / det]
    ];
  }

  function matVec(m, v) {
    return [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
    ];
  }

  function vecDot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function influence(points, w, target, params) {
    var kept = points.filter(function (point) { return !point.removed; });
    var h = [
      [1e-4, 0, 0],
      [0, params.regularization + 1e-4, 0],
      [0, 0, params.regularization + 1e-4]
    ];
    kept.forEach(function (point) {
      var p = sigmoid(dot(w, point));
      var s = p * (1 - p);
      var x = features(point);
      for (var r = 0; r < 3; r += 1) {
        for (var c = 0; c < 3; c += 1) {
          h[r][c] += s * x[r] * x[c] / Math.max(1, kept.length);
        }
      }
    });
    var inv = inverse3(h);
    var targetGrad = features(target);
    return kept.map(function (point) {
      var p = sigmoid(dot(w, point));
      var x = features(point);
      var grad = [(p - point.label) * x[0], (p - point.label) * x[1], (p - point.label) * x[2]];
      var step = matVec(inv, grad);
      return Object.assign({}, point, {
        influence: -vecDot(targetGrad, step),
        probability: p
      });
    }).sort(function (a, b) { return b.influence - a.influence; });
  }

  function summarize(points, w, cleanW, target, params, defense, test) {
    var poisons = points.filter(function (point) { return point.poison; });
    var removedPoisons = poisons.filter(function (point) { return point.removed; }).length;
    return {
      accuracy: accuracy(test, w),
      cleanAccuracy: accuracy(test, cleanW),
      cleanLoss: loss(points.filter(function (point) { return !point.poison; }), cleanW, params),
      cleanTargetProb: sigmoid(dot(cleanW, target)),
      defense: defense,
      loss: loss(points, w, params),
      poisonCount: poisons.length,
      removedPoisons: removedPoisons,
      targetFlip: sigmoid(dot(w, target)) >= 0.5,
      targetProb: sigmoid(dot(w, target))
    };
  }

  function simulateDefense(params, defenseKey) {
    var clean = cleanParams(params);
    var defense = defenseByKey(defenseKey || clean.defense);
    var cleanPoints = makeCleanData(clean);
    var target = targetPoint(clean);
    var poisons = makePoisons(clean, target);
    var contaminated = cleanPoints.concat(poisons);
    var defended = applyDefense(contaminated, defense, clean, target);
    var cleanDefended = applyDefense(cleanPoints, DEFENSES[0], clean, target);
    var cleanW = train(cleanDefended, clean, DEFENSES[0]);
    var w = train(defended, clean, defense);
    var test = makeTestData(clean);
    var rows = influence(defended, w, target, clean);
    return {
      cleanPoints: cleanPoints,
      contaminated: defended,
      defense: defense,
      influence: rows,
      metrics: summarize(defended, w, cleanW, target, clean, defense, test),
      params: clean,
      poisons: poisons,
      target: target,
      test: test,
      w: w,
      cleanW: cleanW
    };
  }

  function sweep(params) {
    var clean = cleanParams(params);
    var budgets = [];
    for (var k = 0; k <= 22; k += 2) budgets.push(k);
    return DEFENSES.map(function (defense) {
      return {
        defense: defense,
        points: budgets.map(function (budget) {
          var run = simulateDefense(Object.assign({}, clean, { poison: budget, defense: defense.key }), defense.key);
          return {
            budget: budget,
            accuracy: run.metrics.accuracy,
            targetProb: run.metrics.targetProb,
            removedPoisons: run.metrics.removedPoisons
          };
        })
      };
    });
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var main = simulateDefense(clean, clean.defense);
    main.sweep = sweep(clean);
    main.audit = runAudit();
    return main;
  }

  function runAudit() {
    var ok = 0;
    var cases = 0;
    [7, 31, 73].forEach(function (seed) {
      [0, 8, 18].forEach(function (poison) {
        [0.25, 0.60, 0.90].forEach(function (stealth) {
          ["none", "auditclip"].forEach(function (defense) {
            cases += 1;
            var run = simulateDefense({
              seed: seed,
              poison: poison,
              stealth: stealth,
              spread: 0.47,
              regularization: 0.045,
              defense: defense
            }, defense);
            var finite = isFinite(run.metrics.targetProb) &&
              isFinite(run.metrics.accuracy) &&
              isFinite(run.w[0]) &&
              run.influence.length > 40;
            var bounded = run.metrics.targetProb >= 0 &&
              run.metrics.targetProb <= 1 &&
              run.metrics.accuracy >= 0 &&
              run.metrics.accuracy <= 1;
            if (finite && bounded) ok += 1;
          });
        });
      });
    });
    var clean = simulateDefense({ seed: 31, poison: 0, stealth: 0.52, spread: 0.47, regularization: 0.045, defense: "none" }, "none");
    var poisoned = simulateDefense({ seed: 31, poison: 16, stealth: 0.25, spread: 0.47, regularization: 0.045, defense: "none" }, "none");
    return {
      cases: cases + 1,
      ok: ok + (poisoned.metrics.targetProb > clean.metrics.cleanTargetProb ? 1 : 0),
      cleanTarget: clean.metrics.cleanTargetProb,
      poisonedTarget: poisoned.metrics.targetProb
    };
  }

  function line(ctx, x1, y1, x2, y2, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.faint;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, x + 12, y + 20, COLORS.text, 13, 750);
  }

  function worldMap(box) {
    var xmin = -2.35, xmax = 2.35, ymin = -1.85, ymax = 1.95;
    return function (point) {
      return {
        x: box.x + (point.x - xmin) / (xmax - xmin) * box.w,
        y: box.y + box.h - (point.y - ymin) / (ymax - ymin) * box.h
      };
    };
  }

  function drawBoundary(ctx, box, w, color, dash, label) {
    var xmin = -2.35, xmax = 2.35;
    if (Math.abs(w[2]) < 1e-6) return;
    var p1 = { x: xmin, y: -(w[0] + w[1] * xmin) / w[2] };
    var p2 = { x: xmax, y: -(w[0] + w[1] * xmax) / w[2] };
    var map = worldMap(box);
    var a = map(p1), b = map(p2);
    line(ctx, a.x, a.y, b.x, b.y, color, 2, dash);
    text(ctx, label, b.x - 74, b.y - 7, color, 11, 700);
  }

  function drawScatter(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "decision boundary after poisoning");
    var plot = { x: box.x + 16, y: box.y + 32, w: box.w - 32, h: box.h - 46 };
    var map = worldMap(plot);
    for (var gx = -2; gx <= 2; gx += 1) {
      var a = map({ x: gx, y: -1.85 });
      var b = map({ x: gx, y: 1.95 });
      line(ctx, a.x, a.y, b.x, b.y, COLORS.grid, 1);
    }
    for (var gy = -1; gy <= 1; gy += 1) {
      var c = map({ x: -2.35, y: gy });
      var d = map({ x: 2.35, y: gy });
      line(ctx, c.x, c.y, d.x, d.y, COLORS.grid, 1);
    }
    drawBoundary(ctx, plot, run.cleanW, COLORS.muted, [5, 4], "clean");
    drawBoundary(ctx, plot, run.w, run.defense.color, null, run.defense.short);
    run.contaminated.forEach(function (point) {
      var p = map(point);
      ctx.save();
      if (point.poison) {
        ctx.fillStyle = point.removed ? "#ffffff" : COLORS.poison;
        ctx.strokeStyle = COLORS.poison;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 6);
        ctx.lineTo(p.x + 6, p.y + 5);
        ctx.lineTo(p.x - 6, p.y + 5);
        ctx.closePath();
        if (!point.removed) ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = point.label ? COLORS.positive : COLORS.negative;
        ctx.globalAlpha = point.removed ? 0.20 : 0.72;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    });
    var target = map(run.target);
    ctx.fillStyle = COLORS.target;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, "target", target.x + 9, target.y - 8, COLORS.target, 11, 750);
  }

  function drawAttackCurve(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "target probability vs poison count");
    var plot = { x: box.x + 44, y: box.y + 34, w: box.w - 62, h: box.h - 58 };
    line(ctx, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, COLORS.rule, 1);
    line(ctx, plot.x, plot.y, plot.x, plot.y + plot.h, COLORS.rule, 1);
    [0.25, 0.5, 0.75].forEach(function (v) {
      var y = plot.y + plot.h * (1 - v);
      line(ctx, plot.x, y, plot.x + plot.w, y, COLORS.grid, 1);
      text(ctx, pct(v, 0), plot.x - 34, y + 4, COLORS.muted, 10, 500);
    });
    run.sweep.forEach(function (series) {
      ctx.beginPath();
      series.points.forEach(function (point, i) {
        var x = plot.x + point.budget / 22 * plot.w;
        var y = plot.y + (1 - point.targetProb) * plot.h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = series.defense.color;
      ctx.lineWidth = series.defense.key === run.defense.key ? 3 : 1.6;
      ctx.stroke();
      var last = series.points[series.points.length - 1];
      text(ctx, series.defense.short, plot.x + plot.w + 5, plot.y + (1 - last.targetProb) * plot.h + 3, series.defense.color, 10, 750);
    });
    text(ctx, "0", plot.x - 2, plot.y + plot.h + 17, COLORS.muted, 10, 500, "center");
    text(ctx, "22", plot.x + plot.w, plot.y + plot.h + 17, COLORS.muted, 10, 500, "center");
  }

  function drawInfluence(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "largest positive influence on target logit");
    var rows = run.influence.slice(0, 10);
    var max = Math.max(1e-6, rows.reduce(function (m, row) { return Math.max(m, Math.abs(row.influence)); }, 0));
    var x0 = box.x + 132;
    var y0 = box.y + 38;
    var barW = box.w - 154;
    rows.forEach(function (row, i) {
      var y = y0 + i * 18;
      var width = clamp(row.influence / max, 0, 1) * barW;
      ctx.fillStyle = row.poison ? COLORS.poison : row.label ? COLORS.positive : COLORS.negative;
      ctx.fillRect(x0, y - 10, width, 10);
      text(ctx, row.poison ? "poison" : row.label ? "clean +" : "clean -", box.x + 14, y - 1, ctx.fillStyle, 10, 750);
      text(ctx, row.influence.toFixed(2), x0 + width + 5, y - 1, COLORS.muted, 10, 500);
    });
  }

  function drawDefenseFrontier(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "defense frontier at selected budget");
    var plot = { x: box.x + 52, y: box.y + 36, w: box.w - 72, h: box.h - 62 };
    line(ctx, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, COLORS.rule, 1);
    line(ctx, plot.x, plot.y, plot.x, plot.y + plot.h, COLORS.rule, 1);
    text(ctx, "accuracy", plot.x + plot.w - 46, plot.y + plot.h + 20, COLORS.muted, 10, 600);
    text(ctx, "target", plot.x - 42, plot.y + 8, COLORS.muted, 10, 600);
    run.sweep.forEach(function (series) {
      var match = series.points.reduce(function (best, point) {
        return Math.abs(point.budget - run.params.poison) < Math.abs(best.budget - run.params.poison) ? point : best;
      }, series.points[0]);
      var x = plot.x + clamp((match.accuracy - 0.55) / 0.40, 0, 1) * plot.w;
      var y = plot.y + (1 - match.targetProb) * plot.h;
      ctx.fillStyle = series.defense.color;
      ctx.beginPath();
      ctx.arc(x, y, series.defense.key === run.defense.key ? 7 : 5, 0, 2 * Math.PI);
      ctx.fill();
      text(ctx, series.defense.short, x + 9, y + 4, series.defense.color, 10, 750);
    });
  }

  function draw(run, canvas) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawScatter(ctx, run, { x: 18, y: 18, w: 424, h: 318 });
    drawAttackCurve(ctx, run, { x: 462, y: 18, w: 420, h: 318 });
    drawInfluence(ctx, run, { x: 18, y: 356, w: 424, h: 322 });
    drawDefenseFrontier(ctx, run, { x: 462, y: 356, w: 420, h: 322 });
  }

  function readParams(lab) {
    function number(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      if (!input) return fallback;
      var value = Number(input.value);
      return isFinite(value) ? value : fallback;
    }
    var select = lab.querySelector('[data-param="defense"]');
    return cleanParams({
      seed: number("seed", 31),
      poison: number("poison", 10),
      stealth: number("stealth", 52) / 100,
      spread: number("spread", 47) / 100,
      regularization: number("regularization", 45) / 1000,
      defense: select ? select.value : "none"
    });
  }

  function updateOutputs(lab, params) {
    var labels = {
      seed: String(params.seed),
      poison: String(params.poison),
      stealth: pct(params.stealth, 0),
      spread: pct(params.spread, 0),
      regularization: params.regularization.toFixed(3)
    };
    Object.keys(labels).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(lab) {
    var params = readParams(lab);
    updateOutputs(lab, params);
    var run = simulate(params);
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("target before", pct(run.metrics.cleanTargetProb, 0)),
        metric("target after", pct(run.metrics.targetProb, 0)),
        metric("test accuracy", pct(run.metrics.accuracy, 1)),
        metric("poisons kept", String(run.metrics.poisonCount - run.metrics.removedPoisons) + "/" + run.metrics.poisonCount),
        metric("audit grid", run.audit.ok + "/" + run.audit.cases)
      ].join("");
    }
    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(run, canvas);
  }

  function init(lab) {
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () { render(lab); });
      input.addEventListener("change", function () { render(lab); });
    });
    render(lab);
  }

  function initAll() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-data-poisoning-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }

  var api = {
    DEFENSES: DEFENSES,
    cleanParams: cleanParams,
    runAudit: runAudit,
    simulate: simulate,
    simulateDefense: simulateDefense
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.DataPoisoningLab = api;
})(typeof window !== "undefined" ? window : globalThis);
