(function (global) {
  "use strict";

  var COLORS = {
    agreement: "#0891b2",
    ds: "#0f766e",
    grid: "#e6edf3",
    hard: "#d97706",
    majority: "#be123c",
    muted: "#5d6872",
    negative: "#64748b",
    panel: "#f8fafc",
    positive: "#2563eb",
    rule: "#d7dee5",
    text: "#172026",
    white: "#ffffff",
    worker: "#7c3aed"
  };

  var SCENARIOS = {
    mixed: "mixed reliability",
    adversarial: "adversarial minority",
    biased: "positive-label bias",
    hard: "many hard items"
  };

  var METHODS = [
    { key: "majority", label: "majority", color: COLORS.majority },
    { key: "agreement", label: "agreement weight", color: COLORS.agreement },
    { key: "ds", label: "Dawid-Skene", color: COLORS.ds }
  ];

  var DEFAULTS = {
    adversarial: 18,
    classPrior: 42,
    difficulty: 46,
    items: 160,
    labelsPerItem: 5,
    scenario: "mixed",
    seed: 31,
    workers: 22
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    return {
      adversarial: Math.round(clamp(finite(Number(raw.adversarial), DEFAULTS.adversarial), 0, 45)),
      classPrior: Math.round(clamp(finite(Number(raw.classPrior), DEFAULTS.classPrior), 10, 90)),
      difficulty: Math.round(clamp(finite(Number(raw.difficulty), DEFAULTS.difficulty), 0, 100)),
      items: Math.round(clamp(finite(Number(raw.items), DEFAULTS.items), 60, 360)),
      labelsPerItem: Math.round(clamp(finite(Number(raw.labelsPerItem), DEFAULTS.labelsPerItem), 1, 11)),
      scenario: scenario,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      workers: Math.round(clamp(finite(Number(raw.workers), DEFAULTS.workers), 6, 60))
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
    var u1 = Math.max(1e-12, uniform(index * 2 + 11, seed));
    var u2 = uniform(index * 2 + 12, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function logistic(x) {
    if (x > 30) return 1;
    if (x < -30) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function logit(p) {
    p = clamp(p, 1e-6, 1 - 1e-6);
    return Math.log(p / (1 - p));
  }

  function chooseWorker(item, slot, workers, seed, used) {
    var out = null;
    var tries = 0;
    while (out == null || used[out]) {
      out = hash32(item * 131 + slot * 17 + tries, seed) % workers;
      tries += 1;
      if (tries > workers + 2) break;
    }
    used[out] = true;
    return out;
  }

  function workerSpec(index, params) {
    var h = uniform(index, params.seed * 3001);
    var noisy = uniform(index + 71, params.seed) < 0.16;
    var adversarialShare = params.scenario === "adversarial" ? Math.max(params.adversarial + 12, 30) : params.adversarial;
    var adversarial = h < adversarialShare / 100;
    var biased = params.scenario === "biased" ? uniform(index + 5, params.seed) < 0.36 : uniform(index + 5, params.seed) < 0.12;
    var expert = !adversarial && !noisy && uniform(index + 19, params.seed) > 0.78;
    var base = expert ? 0.92 : noisy ? 0.54 : 0.72 + 0.12 * uniform(index + 41, params.seed);
    if (adversarial) base = 0.18 + 0.14 * uniform(index + 29, params.seed);
    var sens = base;
    var spec = base;
    if (biased) {
      sens = clamp(base + 0.12, 0.05, 0.98);
      spec = clamp(base - (params.scenario === "biased" ? 0.34 : 0.16), 0.05, 0.98);
    }
    return {
      id: index,
      kind: adversarial ? "adversarial" : expert ? "expert" : noisy ? "noisy" : biased ? "biased" : "regular",
      sensitivity: sens,
      specificity: spec,
      trueBalancedAccuracy: 0.5 * (sens + spec)
    };
  }

  function makeData(raw) {
    var params = cleanParams(raw);
    var seed = params.seed * 4099;
    var workers = [];
    for (var w = 0; w < params.workers; w += 1) workers.push(workerSpec(w, params));

    var items = [];
    var labels = [];
    var prior = params.classPrior / 100;
    var scenarioHard = params.scenario === "hard" ? 0.34 : 0;
    var difficultyScale = params.difficulty / 100;

    for (var i = 0; i < params.items; i += 1) {
      var x = normal(i, seed);
      var wave = 0.55 * Math.sin(i * 0.31 + params.seed * 0.07);
      var truthProb = logistic(logit(prior) + 0.72 * x + wave);
      var truth = uniform(i + 9000, seed) < truthProb ? 1 : 0;
      var hardness = clamp(0.15 + 0.7 * uniform(i + 2000, seed) + scenarioHard + 0.35 * Math.abs(normal(i + 17, seed)), 0, 1.6);
      items.push({ difficulty: hardness, id: i, truth: truth, truthProb: truthProb });

      var localSlots = Math.min(params.labelsPerItem, params.workers);
      var usedWorkers = {};
      for (var s = 0; s < localSlots; s += 1) {
        var workerId = chooseWorker(i, s, params.workers, seed + i * 13, usedWorkers);
        usedWorkers[workerId] = true;
        var worker = workers[workerId];
        var pBase = truth ? worker.sensitivity : worker.specificity;
        var pCorrect = logistic(logit(pBase) - difficultyScale * hardness * 1.45);
        var observed = uniform(i * 1000 + s * 37 + workerId, seed ^ 0xa51a) < pCorrect ? truth : 1 - truth;
        labels.push({
          item: i,
          label: observed,
          slot: s,
          truth: truth,
          worker: workerId
        });
      }
    }
    return { items: items, labels: labels, params: params, workers: workers };
  }

  function labelsByItem(data) {
    var byItem = [];
    for (var i = 0; i < data.items.length; i += 1) byItem.push([]);
    data.labels.forEach(function (label) {
      byItem[label.item].push(label);
    });
    return byItem;
  }

  function majorityPosteriors(data) {
    var byItem = labelsByItem(data);
    return byItem.map(function (rows) {
      var positive = rows.reduce(function (acc, row) { return acc + row.label; }, 0);
      return (positive + 0.5) / (rows.length + 1);
    });
  }

  function majorityPredictions(data) {
    var posts = majorityPosteriors(data);
    return posts.map(function (p) { return p >= 0.5 ? 1 : 0; });
  }

  function agreementWorkerWeights(data, initialPreds) {
    var totals = data.workers.map(function () { return { agree: 1, total: 2 }; });
    data.labels.forEach(function (row) {
      totals[row.worker].total += 1;
      if (row.label === initialPreds[row.item]) totals[row.worker].agree += 1;
    });
    return totals.map(function (row) {
      var acc = row.agree / row.total;
      return clamp(logit(acc), -2.2, 2.2);
    });
  }

  function agreementVote(data) {
    var majority = majorityPredictions(data);
    var weights = agreementWorkerWeights(data, majority);
    var byItem = labelsByItem(data);
    var post = byItem.map(function (rows) {
      var score = 0;
      rows.forEach(function (row) {
        score += weights[row.worker] * (row.label ? 1 : -1);
      });
      return logistic(score);
    });
    return {
      posteriors: post,
      predictions: post.map(function (p) { return p >= 0.5 ? 1 : 0; }),
      weights: weights
    };
  }

  function dawidSkene(data) {
    var byItem = labelsByItem(data);
    var post = majorityPosteriors(data).map(function (p) {
      return clamp(0.08 + 0.84 * p, 0.05, 0.95);
    });
    var prior = 0.5;
    var confusion = [];
    for (var w = 0; w < data.workers.length; w += 1) {
      confusion.push([[0.82, 0.18], [0.18, 0.82]]);
    }

    for (var iter = 0; iter < 28; iter += 1) {
      prior = post.reduce(function (acc, value) { return acc + value; }, 0) / post.length;
      var counts = data.workers.map(function () {
        return [[1.2, 1.2], [1.2, 1.2]];
      });
      data.labels.forEach(function (row) {
        var p1 = post[row.item];
        counts[row.worker][1][row.label] += p1;
        counts[row.worker][0][row.label] += 1 - p1;
      });
      for (var wi = 0; wi < counts.length; wi += 1) {
        for (var c = 0; c < 2; c += 1) {
          var total = counts[wi][c][0] + counts[wi][c][1];
          confusion[wi][c][0] = counts[wi][c][0] / total;
          confusion[wi][c][1] = counts[wi][c][1] / total;
        }
      }
      post = byItem.map(function (rows) {
        var log0 = Math.log(Math.max(1e-9, 1 - prior));
        var log1 = Math.log(Math.max(1e-9, prior));
        rows.forEach(function (row) {
          log0 += Math.log(Math.max(1e-9, confusion[row.worker][0][row.label]));
          log1 += Math.log(Math.max(1e-9, confusion[row.worker][1][row.label]));
        });
        var m = Math.max(log0, log1);
        var p0 = Math.exp(log0 - m);
        var p1 = Math.exp(log1 - m);
        return p1 / (p0 + p1);
      });
    }
    return {
      confusion: confusion,
      posteriors: post,
      predictions: post.map(function (p) { return p >= 0.5 ? 1 : 0; }),
      prior: prior
    };
  }

  function scorePredictions(data, predictions, posteriors) {
    var correct = 0;
    var uncertainWrong = 0;
    var brier = 0;
    for (var i = 0; i < data.items.length; i += 1) {
      var truth = data.items[i].truth;
      if (predictions[i] === truth) correct += 1;
      var p = posteriors ? posteriors[i] : predictions[i];
      brier += Math.pow(p - truth, 2);
      if (Math.abs((posteriors ? posteriors[i] : predictions[i]) - 0.5) < 0.15 && predictions[i] !== truth) uncertainWrong += 1;
    }
    return {
      accuracy: correct / data.items.length,
      brier: brier / data.items.length,
      correct: correct,
      uncertainWrong: uncertainWrong
    };
  }

  function entropy(p) {
    p = clamp(p, 1e-9, 1 - 1e-9);
    return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
  }

  function evaluate(raw) {
    var data = makeData(raw);
    var majorityPost = majorityPosteriors(data);
    var majorityPred = majorityPost.map(function (p) { return p >= 0.5 ? 1 : 0; });
    var agreement = agreementVote(data);
    var ds = dawidSkene(data);
    var methodRows = [
      { key: "majority", label: "majority", color: COLORS.majority, posteriors: majorityPost, predictions: majorityPred },
      { key: "agreement", label: "agreement weight", color: COLORS.agreement, posteriors: agreement.posteriors, predictions: agreement.predictions },
      { key: "ds", label: "Dawid-Skene", color: COLORS.ds, posteriors: ds.posteriors, predictions: ds.predictions }
    ].map(function (row) {
      var score = scorePredictions(data, row.predictions, row.posteriors);
      row.accuracy = score.accuracy;
      row.brier = score.brier;
      row.correct = score.correct;
      return row;
    });

    var workerRows = data.workers.map(function (worker, index) {
      var trueAcc = worker.trueBalancedAccuracy;
      var estimatedAcc = 0.5 * (ds.confusion[index][0][0] + ds.confusion[index][1][1]);
      return {
        estimatedAcc: estimatedAcc,
        id: index,
        kind: worker.kind,
        labels: data.labels.filter(function (row) { return row.worker === index; }).length,
        sensitivity: worker.sensitivity,
        specificity: worker.specificity,
        trueAcc: trueAcc
      };
    });
    workerRows.sort(function (a, b) { return b.estimatedAcc - a.estimatedAcc; });

    var itemRows = data.items.map(function (item, index) {
      var votes = labelsByItem(data)[index];
      var positives = votes.reduce(function (acc, row) { return acc + row.label; }, 0);
      return {
        agreementP: agreement.posteriors[index],
        difficulty: item.difficulty,
        dsP: ds.posteriors[index],
        id: index,
        majorityP: majorityPost[index],
        positives: positives,
        truth: item.truth,
        votes: votes.length
      };
    });
    itemRows.sort(function (a, b) {
      return entropy(b.dsP) - entropy(a.dsP);
    });

    return {
      agreement: agreement,
      data: data,
      ds: ds,
      items: itemRows,
      methods: methodRows,
      params: data.params,
      summary: {
        adversarialWorkers: data.workers.filter(function (w) { return w.kind === "adversarial"; }).length,
        hardItems: data.items.filter(function (item) { return item.difficulty > 1.0; }).length,
        labels: data.labels.length,
        positiveRate: data.items.reduce(function (acc, item) { return acc + item.truth; }, 0) / data.items.length,
        workers: workerRows
      }
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="crowd-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
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

  function drawAccuracy(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "truth inference score", "simulator knows the hidden labels");
    var x0 = box.x + 26;
    var y0 = box.y + 64;
    var barW = box.w - 52;
    var rowH = 58;
    result.methods.forEach(function (row, index) {
      var y = y0 + index * rowH;
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(x0, y, barW, 14);
      ctx.fillStyle = row.color;
      ctx.fillRect(x0, y, Math.max(2, row.accuracy * barW), 14);
      drawText(ctx, row.label, x0, y - 10, { color: row.color, size: 12, weight: "800" });
      drawText(ctx, formatPercent(row.accuracy, 1) + " acc", x0 + barW, y + 12, { align: "right", size: 11, weight: "750" });
      drawText(ctx, "Brier " + formatNumber(row.brier, 3), x0, y + 33, { color: COLORS.muted, size: 10, weight: "650" });
    });
    drawText(ctx, result.summary.labels + " observed labels for " + result.params.items + " items", x0, box.y + box.h - 16, { color: COLORS.muted, size: 11, weight: "650" });
  }

  function drawWorkerPanel(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "worker reliability", "true balanced accuracy versus EM estimate");
    var workers = result.summary.workers;
    var plot = { x: box.x + 44, y: box.y + 54, w: box.w - 68, h: box.h - 82 };
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var p = plot.x + plot.w * g / 4;
      var q = plot.y + plot.h * g / 4;
      ctx.beginPath();
      ctx.moveTo(p, plot.y);
      ctx.lineTo(p, plot.y + plot.h);
      ctx.moveTo(plot.x, q);
      ctx.lineTo(plot.x + plot.w, q);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y);
    ctx.stroke();
    ctx.setLineDash([]);
    workers.forEach(function (w) {
      var x = plot.x + clamp(w.trueAcc, 0, 1) * plot.w;
      var y = plot.y + plot.h - clamp(w.estimatedAcc, 0, 1) * plot.h;
      ctx.fillStyle = w.kind === "adversarial" ? COLORS.majority : w.kind === "expert" ? COLORS.ds : w.kind === "biased" ? COLORS.hard : COLORS.worker;
      ctx.globalAlpha = w.kind === "noisy" ? 0.5 : 0.85;
      ctx.beginPath();
      ctx.arc(x, y, 4 + Math.min(4, w.labels / 18), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawText(ctx, "true", plot.x + plot.w, plot.y + plot.h + 20, { align: "right", color: COLORS.muted, size: 10, weight: "700" });
    drawText(ctx, "estimated", plot.x - 8, plot.y + 2, { align: "right", color: COLORS.muted, size: 10, weight: "700" });
    drawText(ctx, "adversarial " + result.summary.adversarialWorkers + "/" + result.params.workers, plot.x, box.y + box.h - 14, { color: COLORS.majority, size: 10, weight: "750" });
    ctx.restore();
  }

  function drawItems(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "uncertain items", "sorted by Dawid-Skene posterior entropy");
    var rows = result.items.slice(0, 34);
    var x0 = box.x + 22;
    var y0 = box.y + 54;
    var cellW = (box.w - 44) / rows.length;
    ctx.save();
    rows.forEach(function (row, index) {
      var x = x0 + index * cellW;
      var h = box.h - 92;
      ctx.fillStyle = row.truth ? COLORS.positive : COLORS.negative;
      ctx.globalAlpha = 0.2 + 0.68 * Math.abs(row.dsP - 0.5) * 2;
      ctx.fillRect(x, y0, Math.max(2, cellW - 1), h);
      ctx.globalAlpha = 1;
      var yDs = y0 + h - row.dsP * h;
      var yMaj = y0 + h - row.majorityP * h;
      ctx.fillStyle = COLORS.ds;
      ctx.fillRect(x, yDs - 2, Math.max(2, cellW - 1), 4);
      ctx.fillStyle = COLORS.majority;
      ctx.fillRect(x, yMaj - 1, Math.max(2, cellW - 1), 2);
    });
    drawText(ctx, "blue/gray background is hidden truth; green tick is EM posterior", x0, box.y + box.h - 16, { color: COLORS.muted, size: 10, weight: "650" });
    ctx.restore();
  }

  function drawDisagreements(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "where methods disagree", "posterior moves away from raw vote fraction");
    var rows = result.items.slice().sort(function (a, b) {
      return Math.abs(b.dsP - b.majorityP) - Math.abs(a.dsP - a.majorityP);
    }).slice(0, 14);
    var x0 = box.x + 24;
    var y0 = box.y + 58;
    var w = box.w - 48;
    var rowH = (box.h - 88) / rows.length;
    ctx.save();
    rows.forEach(function (row, i) {
      var y = y0 + i * rowH;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x0, y + rowH / 2);
      ctx.lineTo(x0 + w, y + rowH / 2);
      ctx.stroke();
      var majX = x0 + row.majorityP * w;
      var dsX = x0 + row.dsP * w;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(majX, y + rowH / 2);
      ctx.lineTo(dsX, y + rowH / 2);
      ctx.stroke();
      ctx.fillStyle = COLORS.majority;
      ctx.beginPath();
      ctx.arc(majX, y + rowH / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ds;
      ctx.beginPath();
      ctx.arc(dsX, y + rowH / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    drawText(ctx, "0", x0, box.y + box.h - 14, { color: COLORS.muted, size: 10 });
    drawText(ctx, "1", x0 + w, box.y + box.h - 14, { align: "right", color: COLORS.muted, size: 10 });
    drawText(ctx, "majority", box.x + box.w - 108, box.y + 24, { color: COLORS.majority, size: 10, weight: "800" });
    drawText(ctx, "EM", box.x + box.w - 34, box.y + 24, { color: COLORS.ds, size: 10, weight: "800" });
    ctx.restore();
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    drawText(ctx, "The label is a latent variable", 18, 30, { size: 18, weight: "850" });
    drawText(ctx, SCENARIOS[result.params.scenario] + ", true positive rate " + formatPercent(result.summary.positiveRate, 1), 18, 52, { color: COLORS.muted, size: 12, weight: "650" });
    drawAccuracy(ctx, result, { x: 18, y: 70, w: 280, h: 254 });
    drawWorkerPanel(ctx, result, { x: 316, y: 70, w: 586, h: 254 });
    drawItems(ctx, result, { x: 18, y: 344, w: 884, h: 190 });
    drawDisagreements(ctx, result, { x: 18, y: 554, w: 884, h: height - 572 });
  }

  function updateOutputs(root, params) {
    [
      ["items", params.items],
      ["workers", params.workers],
      ["labelsPerItem", params.labelsPerItem],
      ["adversarial", params.adversarial + "%"],
      ["classPrior", params.classPrior + "%"],
      ["difficulty", params.difficulty + "%"],
      ["seed", params.seed]
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
      var majority = result.methods.filter(function (row) { return row.key === "majority"; })[0];
      var ds = result.methods.filter(function (row) { return row.key === "ds"; })[0];
      var agreement = result.methods.filter(function (row) { return row.key === "agreement"; })[0];
      metrics.innerHTML = [
        metric("majority acc", formatPercent(majority.accuracy, 1)),
        metric("Dawid-Skene acc", formatPercent(ds.accuracy, 1)),
        metric("agreement acc", formatPercent(agreement.accuracy, 1)),
        metric("workers", result.params.workers + " / " + result.summary.adversarialWorkers + " adversarial"),
        metric("labels", result.summary.labels.toLocaleString()),
        metric("hard items", String(result.summary.hardItems))
      ].join("");
    }
    draw(root.querySelector("canvas[data-canvas]"), result);
  }

  function init(root) {
    if (!root || root.__crowdLabelReady) return;
    root.__crowdLabelReady = true;
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

    var defaultRun = evaluate(DEFAULTS);
    var majority = defaultRun.methods.filter(function (row) { return row.key === "majority"; })[0];
    var ds = defaultRun.methods.filter(function (row) { return row.key === "ds"; })[0];
    var agreement = defaultRun.methods.filter(function (row) { return row.key === "agreement"; })[0];
    assert(defaultRun.data.labels.length === defaultRun.params.items * defaultRun.params.labelsPerItem, "label count should equal item budget");
    assert(ds.accuracy >= majority.accuracy - 0.04, "Dawid-Skene should not collapse on default mixed data");
    assert(agreement.accuracy >= 0.55, "agreement vote should be better than chance on default data");
    assert(defaultRun.summary.workers.length === defaultRun.params.workers, "worker rows should match worker count");

    var adversarialRun = evaluate({ scenario: "adversarial", adversarial: 38, classPrior: 42, difficulty: 35, items: 180, labelsPerItem: 7, workers: 28, seed: 44 });
    var advMajority = adversarialRun.methods.filter(function (row) { return row.key === "majority"; })[0];
    var advDs = adversarialRun.methods.filter(function (row) { return row.key === "ds"; })[0];
    assert(advDs.accuracy > advMajority.accuracy, "EM should beat raw majority with an adversarial minority");
    assert(adversarialRun.summary.adversarialWorkers > 0, "adversarial scenario should contain adversarial workers");

    var easyRun = evaluate({ scenario: "mixed", adversarial: 0, classPrior: 50, difficulty: 0, items: 100, labelsPerItem: 5, workers: 16, seed: 7 });
    var easyMaj = easyRun.methods.filter(function (row) { return row.key === "majority"; })[0];
    assert(easyMaj.accuracy > 0.85, "easy majority vote should be high accuracy");

    [defaultRun, adversarialRun, easyRun].forEach(function (run) {
      run.methods.forEach(function (row) {
        assert(Number.isFinite(row.accuracy) && row.accuracy >= 0 && row.accuracy <= 1, "method accuracy should be a probability");
      });
      run.summary.workers.forEach(function (worker) {
        assert(Number.isFinite(worker.estimatedAcc), "worker estimate should be finite");
      });
    });

    return {
      adversarial: adversarialRun.methods.map(function (row) { return [row.key, Number(row.accuracy.toFixed(3))]; }),
      default: defaultRun.methods.map(function (row) { return [row.key, Number(row.accuracy.toFixed(3))]; }),
      easyMajority: Number(easyMaj.accuracy.toFixed(3))
    };
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    makeData: makeData
  };

  global.CrowdLabelLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-crowd-label-lab]").forEach(init);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
