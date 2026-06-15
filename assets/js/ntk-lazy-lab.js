(function (root) {
  "use strict";

  var COLORS = {
    trueNet: "#0f766e",
    linear: "#7c3aed",
    target: "#172026",
    train: "#d97706",
    rule: "#d7dee5",
    panel: "#f8fafc",
    text: "#172026",
    muted: "#5d6872",
    bad: "#be123c",
    blue: "#2563eb"
  };

  var DEFAULTS = {
    width: 48,
    steps: 520,
    learningRate: 55,
    initScale: 85,
    bump: 50,
    noise: 5,
    seed: 19
  };

  var TRAIN_N = 30;
  var TEST_N = 120;
  var AUDIT_CACHE = null;

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var width = clamp(Math.round(finite(raw.width == null ? DEFAULTS.width : raw.width, DEFAULTS.width)), 8, 128);
    var steps = clamp(Math.round(finite(raw.steps == null ? DEFAULTS.steps : raw.steps, DEFAULTS.steps)), 60, 900);
    var learningRate = clamp(finite(raw.learningRate == null ? DEFAULTS.learningRate : raw.learningRate, DEFAULTS.learningRate), 5, 95);
    var initScale = clamp(finite(raw.initScale == null ? DEFAULTS.initScale : raw.initScale, DEFAULTS.initScale), 25, 180);
    var bump = clamp(finite(raw.bump == null ? DEFAULTS.bump : raw.bump, DEFAULTS.bump), 0, 100);
    var noise = clamp(finite(raw.noise == null ? DEFAULTS.noise : raw.noise, DEFAULTS.noise), 0, 30);
    var seed = clamp(Math.round(finite(raw.seed == null ? DEFAULTS.seed : raw.seed, DEFAULTS.seed)), 1, 999);
    return {
      width: width,
      steps: steps,
      learningRate: learningRate,
      initScale: initScale,
      bump: bump,
      noise: noise,
      seed: seed,
      lr: learningRate / 100
    };
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      var t = a;
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

  function targetFunction(x, bump) {
    var wave = 0.76 * Math.sin(Math.PI * (x + 0.08)) + 0.23 * Math.sin(3 * Math.PI * (x - 0.05));
    var local = Math.exp(-Math.pow((x - 0.26) / 0.105, 2)) - 0.72 * Math.exp(-Math.pow((x + 0.55) / 0.17, 2));
    return wave + bump * 0.55 * local;
  }

  function makeDataset(params) {
    var rand = mulberry32(0x9e3779b9 ^ (params.seed * 2654435761));
    var train = [];
    var bump = params.bump / 100;
    var noise = params.noise / 100;
    for (var i = 0; i < TRAIN_N; i += 1) {
      var base = -1 + 2 * i / (TRAIN_N - 1);
      var jitter = (rand() - 0.5) * 0.036;
      var x = clamp(base + jitter, -1, 1);
      var clean = targetFunction(x, bump);
      train.push({
        x: x,
        y: clean + noise * normal(rand),
        clean: clean
      });
    }
    train.sort(function (a, b) { return a.x - b.x; });

    var test = [];
    for (var j = 0; j < TEST_N; j += 1) {
      var tx = -1.08 + 2.16 * j / (TEST_N - 1);
      test.push({ x: tx, y: targetFunction(tx, bump) });
    }
    return { train: train, test: test };
  }

  function initNetwork(params) {
    var rand = mulberry32(0x51ed270b ^ (params.seed * 1597334677) ^ (params.width * 977));
    var scale = params.initScale / 100;
    var net = { a: [], w: [], b: [] };
    for (var j = 0; j < params.width; j += 1) {
      net.a.push(0.72 * normal(rand));
      net.w.push(scale * (0.35 + 1.15 * rand()) * (rand() < 0.5 ? -1 : 1));
      net.b.push(scale * 1.25 * normal(rand));
    }
    return net;
  }

  function cloneNet(net) {
    return {
      a: net.a.slice(),
      w: net.w.slice(),
      b: net.b.slice()
    };
  }

  function predictOne(net, x) {
    var inv = 1 / Math.sqrt(net.a.length);
    var out = 0;
    for (var j = 0; j < net.a.length; j += 1) {
      out += net.a[j] * Math.tanh(net.w[j] * x + net.b[j]);
    }
    return inv * out;
  }

  function predict(net, rows) {
    return rows.map(function (row) { return predictOne(net, row.x); });
  }

  function mse(pred, rows) {
    var sum = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var err = pred[i] - rows[i].y;
      sum += err * err;
    }
    return sum / Math.max(1, rows.length);
  }

  function tangentRows(net, rows) {
    var m = net.a.length;
    var inv = 1 / Math.sqrt(m);
    return rows.map(function (row) {
      var x = row.x;
      var features = new Array(3 * m);
      for (var j = 0; j < m; j += 1) {
        var z = net.w[j] * x + net.b[j];
        var h = Math.tanh(z);
        var dh = 1 - h * h;
        features[j] = inv * h;
        features[m + j] = inv * net.a[j] * dh * x;
        features[2 * m + j] = inv * net.a[j] * dh;
      }
      return features;
    });
  }

  function linearPredictions(base, features, delta) {
    var out = new Array(features.length);
    for (var i = 0; i < features.length; i += 1) {
      var row = features[i];
      var value = base[i];
      for (var k = 0; k < delta.length; k += 1) value += row[k] * delta[k];
      out[i] = value;
    }
    return out;
  }

  function trueGradients(net, rows) {
    var m = net.a.length;
    var inv = 1 / Math.sqrt(m);
    var grad = {
      a: new Array(m).fill(0),
      w: new Array(m).fill(0),
      b: new Array(m).fill(0)
    };
    var loss = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var x = rows[i].x;
      var h = new Array(m);
      var dh = new Array(m);
      var pred = 0;
      for (var j = 0; j < m; j += 1) {
        var z = net.w[j] * x + net.b[j];
        h[j] = Math.tanh(z);
        dh[j] = 1 - h[j] * h[j];
        pred += net.a[j] * h[j];
      }
      pred *= inv;
      var r = pred - rows[i].y;
      loss += r * r;
      for (j = 0; j < m; j += 1) {
        grad.a[j] += r * inv * h[j];
        grad.w[j] += r * inv * net.a[j] * dh[j] * x;
        grad.b[j] += r * inv * net.a[j] * dh[j];
      }
    }
    var n = Math.max(1, rows.length);
    for (j = 0; j < m; j += 1) {
      grad.a[j] /= n;
      grad.w[j] /= n;
      grad.b[j] /= n;
    }
    return { grad: grad, loss: loss / n };
  }

  function applyGradients(net, grad, lr) {
    for (var j = 0; j < net.a.length; j += 1) {
      net.a[j] -= lr * grad.a[j];
      net.w[j] -= lr * grad.w[j];
      net.b[j] -= lr * grad.b[j];
    }
  }

  function updateLinear(delta, features, pred, rows, lr) {
    var n = Math.max(1, rows.length);
    var grad = new Array(delta.length).fill(0);
    for (var i = 0; i < rows.length; i += 1) {
      var r = pred[i] - rows[i].y;
      var row = features[i];
      for (var k = 0; k < delta.length; k += 1) grad[k] += r * row[k];
    }
    for (k = 0; k < delta.length; k += 1) delta[k] -= lr * grad[k] / n;
  }

  function vectorNorm(values) {
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) sum += values[i] * values[i];
    return Math.sqrt(sum);
  }

  function networkDistance(a, b) {
    var sum = 0;
    var base = 0;
    for (var j = 0; j < a.a.length; j += 1) {
      sum += Math.pow(a.a[j] - b.a[j], 2) + Math.pow(a.w[j] - b.w[j], 2) + Math.pow(a.b[j] - b.b[j], 2);
      base += a.a[j] * a.a[j] + a.w[j] * a.w[j] + a.b[j] * a.b[j];
    }
    return Math.sqrt(sum) / Math.max(1e-12, Math.sqrt(base));
  }

  function kernelMatrix(features) {
    var n = features.length;
    var out = new Array(n);
    for (var i = 0; i < n; i += 1) {
      out[i] = new Array(n);
      for (var j = 0; j < n; j += 1) {
        var sum = 0;
        for (var k = 0; k < features[i].length; k += 1) sum += features[i][k] * features[j][k];
        out[i][j] = sum;
      }
    }
    return out;
  }

  function kernelDrift(initFeatures, finalFeatures) {
    var k0 = kernelMatrix(initFeatures);
    var k1 = kernelMatrix(finalFeatures);
    var diff = 0;
    var base = 0;
    for (var i = 0; i < k0.length; i += 1) {
      for (var j = 0; j < k0.length; j += 1) {
        diff += Math.pow(k1[i][j] - k0[i][j], 2);
        base += k0[i][j] * k0[i][j];
      }
    }
    return {
      value: Math.sqrt(diff) / Math.max(1e-12, Math.sqrt(base)),
      initial: k0,
      final: k1
    };
  }

  function checkpoints(steps) {
    var marks = {};
    for (var i = 0; i <= 10; i += 1) marks[Math.round(i * steps / 10)] = true;
    marks[steps] = true;
    return marks;
  }

  function runTraining(params) {
    var data = makeDataset(params);
    var initial = initNetwork(params);
    var net = cloneNet(initial);
    var trainFeatures = tangentRows(initial, data.train);
    var testFeatures = tangentRows(initial, data.test);
    var trainBase = predict(initial, data.train);
    var testBase = predict(initial, data.test);
    var delta = new Array(3 * params.width).fill(0);
    var marks = checkpoints(params.steps);
    var trace = [];

    function record(step) {
      var trueTrain = predict(net, data.train);
      var trueTest = predict(net, data.test);
      var linTrain = linearPredictions(trainBase, trainFeatures, delta);
      var linTest = linearPredictions(testBase, testFeatures, delta);
      trace.push({
        step: step,
        trueTrain: mse(trueTrain, data.train),
        trueTest: mse(trueTest, data.test),
        linearTrain: mse(linTrain, data.train),
        linearTest: mse(linTest, data.test)
      });
    }

    record(0);
    for (var step = 1; step <= params.steps; step += 1) {
      var trueGrad = trueGradients(net, data.train);
      applyGradients(net, trueGrad.grad, params.lr);
      var linTrainPred = linearPredictions(trainBase, trainFeatures, delta);
      updateLinear(delta, trainFeatures, linTrainPred, data.train, params.lr);
      if (marks[step]) record(step);
    }

    var finalTrueTrain = predict(net, data.train);
    var finalTrueTest = predict(net, data.test);
    var finalLinTrain = linearPredictions(trainBase, trainFeatures, delta);
    var finalLinTest = linearPredictions(testBase, testFeatures, delta);
    var drift = kernelDrift(trainFeatures, tangentRows(net, data.train));
    return {
      params: params,
      data: data,
      initial: initial,
      net: net,
      trace: trace,
      predictions: {
        trueTrain: finalTrueTrain,
        trueTest: finalTrueTest,
        linearTrain: finalLinTrain,
        linearTest: finalLinTest,
        targetTest: data.test.map(function (row) { return row.y; })
      },
      metrics: {
        trueTrain: mse(finalTrueTrain, data.train),
        trueTest: mse(finalTrueTest, data.test),
        linearTrain: mse(finalLinTrain, data.train),
        linearTest: mse(finalLinTest, data.test),
        initialTrain: mse(trainBase, data.train),
        movement: networkDistance(initial, net),
        linearDelta: vectorNorm(delta) / Math.max(1e-12, networkDistance({ a: new Array(params.width).fill(0), w: new Array(params.width).fill(0), b: new Array(params.width).fill(0) }, initial)),
        kernelDrift: drift.value
      },
      kernel: drift
    };
  }

  function evaluate(raw) {
    return runTraining(cleanParams(raw));
  }

  function roundedFacts(result) {
    return {
      width: result.params.width,
      steps: result.params.steps,
      trueTrain: Number(result.metrics.trueTrain.toFixed(4)),
      linearTrain: Number(result.metrics.linearTrain.toFixed(4)),
      trueTest: Number(result.metrics.trueTest.toFixed(4)),
      linearTest: Number(result.metrics.linearTest.toFixed(4)),
      movementPct: Number((100 * result.metrics.movement).toFixed(2)),
      kernelDriftPct: Number((100 * result.metrics.kernelDrift).toFixed(2))
    };
  }

  function check(name, condition, failures) {
    if (!condition) failures.push(name);
  }

  function gradientCheck() {
    var params = cleanParams({ width: 9, steps: 60, learningRate: 20, initScale: 75, bump: 45, noise: 0, seed: 7 });
    var data = makeDataset(params).train.slice(0, 8);
    var net = initNetwork(params);
    var analytic = trueGradients(net, data).grad;
    var eps = 1e-5;
    var tests = [
      ["a", 2],
      ["w", 4],
      ["b", 6]
    ];
    var worst = 0;
    tests.forEach(function (item) {
      var key = item[0];
      var index = item[1];
      var plus = cloneNet(net);
      var minus = cloneNet(net);
      plus[key][index] += eps;
      minus[key][index] -= eps;
      var lPlus = mse(predict(plus, data), data) / 2;
      var lMinus = mse(predict(minus, data), data) / 2;
      var numeric = (lPlus - lMinus) / (2 * eps);
      worst = Math.max(worst, Math.abs(numeric - analytic[key][index]));
    });
    return worst;
  }

  function runAudit() {
    var failures = [];
    var checked = 0;
    function record(name, condition) {
      checked += 1;
      check(name, condition, failures);
    }

    var clean = cleanParams({ width: -3, steps: 9999, learningRate: "nope", initScale: 1000, bump: -5, noise: 999, seed: 0 });
    record("sanitizes parameter bounds", clean.width === 8 && clean.steps === 900 && clean.learningRate === DEFAULTS.learningRate && clean.initScale === 180 && clean.bump === 0 && clean.noise === 30 && clean.seed === 1);

    var tiny = cleanParams({ width: 10, steps: 80, learningRate: 30, initScale: 80, bump: 40, noise: 0, seed: 5 });
    var tinyData = makeDataset(tiny);
    var tinyNet = initNetwork(tiny);
    var feats = tangentRows(tinyNet, tinyData.train);
    record("tangent feature shape", feats.length === TRAIN_N && feats[0].length === 30);
    record("gradient check", gradientCheck() < 1e-6);

    var initialPred = predict(tinyNet, tinyData.train);
    var trained = runTraining(tiny);
    record("true network improves train loss", trained.metrics.trueTrain < mse(initialPred, tinyData.train));
    record("linearization improves train loss", trained.metrics.linearTrain < mse(initialPred, tinyData.train));
    record("kernel drift nonnegative finite", Number.isFinite(trained.metrics.kernelDrift) && trained.metrics.kernelDrift >= 0);
    record("movement nonnegative finite", Number.isFinite(trained.metrics.movement) && trained.metrics.movement >= 0);

    var k = kernelMatrix(feats.slice(0, 6));
    var symmetric = true;
    for (var i = 0; i < k.length; i += 1) {
      for (var j = 0; j < k.length; j += 1) {
        if (Math.abs(k[i][j] - k[j][i]) > 1e-10) symmetric = false;
      }
    }
    record("kernel matrix symmetric", symmetric);

    var wide = runTraining(cleanParams({ width: 96, steps: 360, learningRate: 45, initScale: 90, bump: 50, noise: 4, seed: 11 }));
    var narrow = runTraining(cleanParams({ width: 12, steps: 360, learningRate: 45, initScale: 90, bump: 50, noise: 4, seed: 11 }));
    record("wide run finite", [wide.metrics.trueTest, wide.metrics.linearTest, wide.metrics.kernelDrift].every(Number.isFinite));
    record("narrow run finite", [narrow.metrics.trueTest, narrow.metrics.linearTest, narrow.metrics.kernelDrift].every(Number.isFinite));
    record("narrow moves at least as much as wide in default comparison", narrow.metrics.movement >= wide.metrics.movement * 0.75);

    var gridCases = 0;
    [12, 32, 72].forEach(function (width) {
      [180, 420].forEach(function (steps) {
        [25, 60].forEach(function (lr) {
          [0, 50, 100].forEach(function (bump) {
            [3, 17].forEach(function (seed) {
              var out = runTraining(cleanParams({ width: width, steps: steps, learningRate: lr, initScale: 85, bump: bump, noise: 6, seed: seed }));
              gridCases += 1;
              if (![out.metrics.trueTrain, out.metrics.trueTest, out.metrics.linearTrain, out.metrics.linearTest, out.metrics.kernelDrift, out.metrics.movement].every(Number.isFinite)) {
                failures.push("grid finite " + JSON.stringify({ width: width, steps: steps, lr: lr, bump: bump, seed: seed }));
              }
              if (out.trace.length < 3) failures.push("trace length " + JSON.stringify({ width: width, steps: steps }));
            });
          });
        });
      });
    });
    record("grid executed", gridCases === 72);

    var defaults = runTraining(cleanParams(DEFAULTS));
    record("default facts finite", Object.keys(roundedFacts(defaults)).every(function (key) { return Number.isFinite(roundedFacts(defaults)[key]); }));

    return {
      passed: checked - failures.length,
      checked: checked,
      gridCases: gridCases,
      failures: failures,
      defaultFacts: roundedFacts(defaults)
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function fmt(value, digits) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: digits == null ? 3 : digits,
      minimumFractionDigits: digits == null ? 3 : digits
    });
  }

  function fmtPct(value, digits) {
    return fmt(100 * value, digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="ntk-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.floor(rect.width || 900));
    var height = width < 620 ? 1160 : 760;
    var dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || 600) + " " + (options.size || 12) + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 22, { size: 13, weight: 820 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 43, { size: 10.5, color: COLORS.muted, weight: 650 });
  }

  function extent(values) {
    var lo = Infinity;
    var hi = -Infinity;
    values.forEach(function (value) {
      if (value < lo) lo = value;
      if (value > hi) hi = value;
    });
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: -1, hi: 1 };
    if (Math.abs(hi - lo) < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    var pad = 0.08 * (hi - lo);
    return { lo: lo - pad, hi: hi + pad };
  }

  function path(ctx, points, sx, sy, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, i) {
      var x = sx(point.x);
      var y = sy(point.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawFit(ctx, box, result) {
    panel(ctx, box, "Function space", "trained network versus its fixed tangent model");
    var plot = { x: box.x + 42, y: box.y + 62, w: box.w - 62, h: box.h - 92 };
    var allY = result.predictions.targetTest.concat(result.predictions.trueTest, result.predictions.linearTest, result.data.train.map(function (row) { return row.y; }));
    var yr = extent(allY);
    var sx = function (x) { return plot.x + (x + 1.08) / 2.16 * plot.w; };
    var sy = function (y) { return plot.y + plot.h - (y - yr.lo) / (yr.hi - yr.lo) * plot.h; };
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    [0.25, 0.5, 0.75].forEach(function (t) {
      var yy = plot.y + t * plot.h;
      ctx.strokeStyle = "rgba(215,222,229,0.72)";
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    });
    var target = result.data.test.map(function (row, i) { return { x: row.x, y: result.predictions.targetTest[i] }; });
    var trueNet = result.data.test.map(function (row, i) { return { x: row.x, y: result.predictions.trueTest[i] }; });
    var linear = result.data.test.map(function (row, i) { return { x: row.x, y: result.predictions.linearTest[i] }; });
    path(ctx, target, sx, sy, COLORS.target, 1.8);
    path(ctx, linear, sx, sy, COLORS.linear, 2.2);
    path(ctx, trueNet, sx, sy, COLORS.trueNet, 2.5);
    result.data.train.forEach(function (row) {
      ctx.fillStyle = COLORS.train;
      ctx.beginPath();
      ctx.arc(sx(row.x), sy(row.y), 3.2, 0, 2 * Math.PI);
      ctx.fill();
    });
    text(ctx, "x", plot.x + plot.w, plot.y + plot.h + 24, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "target", plot.x + 8, plot.y + 16, { color: COLORS.target, size: 10, weight: 760 });
    text(ctx, "network", plot.x + 64, plot.y + 16, { color: COLORS.trueNet, size: 10, weight: 760 });
    text(ctx, "linearized", plot.x + 136, plot.y + 16, { color: COLORS.linear, size: 10, weight: 760 });
  }

  function drawTrace(ctx, box, result) {
    panel(ctx, box, "Loss during training", "squared error at checkpointed steps");
    var plot = { x: box.x + 44, y: box.y + 66, w: box.w - 64, h: box.h - 98 };
    var vals = [];
    result.trace.forEach(function (row) {
      vals.push(row.trueTrain, row.linearTrain, row.trueTest, row.linearTest);
    });
    var yr = extent(vals.map(function (v) { return Math.log10(Math.max(1e-5, v)); }));
    var sx = function (step) { return plot.x + step / result.params.steps * plot.w; };
    var sy = function (value) {
      var lv = Math.log10(Math.max(1e-5, value));
      return plot.y + plot.h - (lv - yr.lo) / (yr.hi - yr.lo) * plot.h;
    };
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    function series(key) {
      return result.trace.map(function (row) { return { x: row.step, y: row[key] }; });
    }
    path(ctx, series("trueTrain"), sx, sy, COLORS.trueNet, 2.4);
    path(ctx, series("linearTrain"), sx, sy, COLORS.linear, 2.2);
    path(ctx, series("trueTest"), sx, sy, COLORS.trueNet, 1.1);
    path(ctx, series("linearTest"), sx, sy, COLORS.linear, 1.1);
    text(ctx, "train bold, test thin", plot.x + 8, plot.y + 16, { color: COLORS.muted, size: 10, weight: 700 });
    text(ctx, "step", plot.x + plot.w, plot.y + plot.h + 24, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "log10 MSE", plot.x - 28, plot.y + 10, { color: COLORS.muted, size: 10 });
  }

  function drawDrift(ctx, box, result) {
    panel(ctx, box, "What moved?", "parameter motion and tangent-kernel drift");
    var rows = [
      { label: "network train MSE", value: result.metrics.trueTrain, color: COLORS.trueNet },
      { label: "linearized train MSE", value: result.metrics.linearTrain, color: COLORS.linear },
      { label: "parameter movement", value: result.metrics.movement, color: COLORS.blue, pct: true },
      { label: "NTK drift", value: result.metrics.kernelDrift, color: COLORS.bad, pct: true }
    ];
    var max = Math.max.apply(null, rows.map(function (row) { return row.pct ? row.value : Math.sqrt(row.value); }).concat([0.01]));
    var x = box.x + 22;
    var y = box.y + 72;
    var w = box.w - 44;
    rows.forEach(function (row, i) {
      var yy = y + i * 44;
      var scaled = row.pct ? row.value : Math.sqrt(row.value);
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(x, yy, w, 24);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, yy, w * scaled / max, 24);
      text(ctx, row.label, x, yy - 12, { color: COLORS.muted, size: 10.5, weight: 720 });
      text(ctx, row.pct ? fmtPct(row.value, 2) : fmt(row.value, 4), x + w - 8, yy + 12, { color: "#ffffff", align: "right", size: 11, weight: 820 });
    });
  }

  function drawKernel(ctx, box, result) {
    panel(ctx, box, "Initial NTK on the training rows", "fixed tangent features define the linearized model");
    var matrix = result.kernel.initial;
    var n = matrix.length;
    var plot = { x: box.x + 24, y: box.y + 62, w: Math.min(box.w - 48, box.h - 92), h: Math.min(box.w - 48, box.h - 92) };
    var vals = [];
    for (var i = 0; i < n; i += 1) for (var j = 0; j < n; j += 1) vals.push(matrix[i][j]);
    var ex = extent(vals);
    var cell = plot.w / n;
    for (i = 0; i < n; i += 1) {
      for (j = 0; j < n; j += 1) {
        var t = (matrix[i][j] - ex.lo) / (ex.hi - ex.lo);
        var r = Math.round(248 - 120 * t);
        var g = Math.round(250 - 162 * t);
        var b = Math.round(252 - 76 * t);
        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        ctx.fillRect(plot.x + j * cell, plot.y + i * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    text(ctx, "row similarity under gradients", plot.x, plot.y + plot.h + 22, { color: COLORS.muted, size: 10, weight: 700 });
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    var gap = 14;
    if (w < 620) {
      var panelH = (h - 5 * gap) / 4;
      drawFit(ctx, { x: 0, y: 0, w: w, h: panelH }, result);
      drawTrace(ctx, { x: 0, y: panelH + gap, w: w, h: panelH }, result);
      drawDrift(ctx, { x: 0, y: 2 * (panelH + gap), w: w, h: panelH }, result);
      drawKernel(ctx, { x: 0, y: 3 * (panelH + gap), w: w, h: panelH }, result);
      return;
    }
    var leftW = w * 0.58 - gap / 2;
    var rightW = w - leftW - gap;
    var topH = h * 0.55 - gap / 2;
    var bottomH = h - topH - gap;
    drawFit(ctx, { x: 0, y: 0, w: leftW, h: topH }, result);
    drawTrace(ctx, { x: leftW + gap, y: 0, w: rightW, h: topH }, result);
    drawDrift(ctx, { x: 0, y: topH + gap, w: leftW, h: bottomH }, result);
    drawKernel(ctx, { x: leftW + gap, y: topH + gap, w: rightW, h: bottomH }, result);
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-output]").forEach(function (output) {
      var key = output.getAttribute("data-output");
      var value = params[key];
      if (key === "learningRate") value = fmt(params.learningRate / 100, 2);
      else if (key === "initScale") value = fmt(params.initScale / 100, 2);
      else if (key === "bump" || key === "noise") value = Math.round(value) + "%";
      output.textContent = value;
    });
  }

  function render(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    var result = evaluate(raw);
    updateOutputs(container, result.params);
    var audit = cachedAudit();
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("network test MSE", fmt(result.metrics.trueTest, 3)),
        metric("linearized test MSE", fmt(result.metrics.linearTest, 3)),
        metric("parameter movement", fmtPct(result.metrics.movement, 2)),
        metric("NTK drift", fmtPct(result.metrics.kernelDrift, 2)),
        metric("train gap", fmt(result.metrics.trueTrain - result.metrics.linearTrain, 3)),
        metric("Audit", audit.passed + "/" + audit.checked)
      ].join("");
    }
    draw(result, container.querySelector("canvas[data-canvas]"));
  }

  function mount(container) {
    var schedule = null;
    function requestRender() {
      if (schedule != null) root.cancelAnimationFrame(schedule);
      schedule = root.requestAnimationFrame(function () {
        schedule = null;
        render(container);
      });
    }
    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    root.addEventListener("resize", requestRender);
    requestRender();
  }

  var api = {
    DEFAULTS: DEFAULTS,
    cleanParams: cleanParams,
    makeDataset: makeDataset,
    initNetwork: initNetwork,
    tangentRows: tangentRows,
    kernelMatrix: kernelMatrix,
    evaluate: evaluate,
    roundedFacts: roundedFacts,
    runAudit: runAudit
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NtkLazyLab = api;

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", function () {
        root.document.querySelectorAll("[data-ntk-lab]").forEach(mount);
      });
    } else {
      root.document.querySelectorAll("[data-ntk-lab]").forEach(mount);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
