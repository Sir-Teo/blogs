(function (global) {
  "use strict";

  var SCHEMES = ["random", "block", "purged", "walk"];
  var LABELS = {
    random: "Shuffled K-fold",
    block: "Blocked K-fold",
    purged: "Purged + embargo",
    walk: "Walk-forward"
  };

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d8e0e8",
    grid: "#edf2f7",
    panel: "#f8fafc",
    train: "#0f766e",
    test: "#be123c",
    dropped: "#d97706",
    random: "#7c3aed",
    block: "#2563eb",
    purged: "#0f766e",
    walk: "#475569",
    live: "#111827",
    background: "#ffffff"
  };

  var ALLOWED = {
    horizon: [5, 10, 20, 30],
    serial: [0.55, 0.75, 0.86, 0.93],
    noise: [0.45, 0.75, 1.05],
    folds: [4, 5, 6, 8],
    embargo: [0, 5, 10, 20],
    bandwidth: [0.45, 0.65, 0.9]
  };

  function nearest(value, allowed, fallback) {
    var raw = Number(value);
    if (!isFinite(raw)) return fallback;
    var best = allowed[0];
    var bestDistance = Infinity;
    allowed.forEach(function (candidate) {
      var distance = Math.abs(candidate - raw);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    });
    return best == null ? fallback : best;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var highlight = String(raw.highlight || "random");
    if (SCHEMES.indexOf(highlight) < 0) highlight = "random";
    return {
      horizon: nearest(raw.horizon == null ? 20 : raw.horizon, ALLOWED.horizon, 20),
      serial: nearest(raw.serial == null ? 0.86 : raw.serial, ALLOWED.serial, 0.86),
      noise: nearest(raw.noise == null ? 0.75 : raw.noise, ALLOWED.noise, 0.75),
      folds: nearest(raw.folds == null ? 5 : raw.folds, ALLOWED.folds, 5),
      embargo: nearest(raw.embargo == null ? 10 : raw.embargo, ALLOWED.embargo, 10),
      bandwidth: nearest(raw.bandwidth == null ? 0.65 : raw.bandwidth, ALLOWED.bandwidth, 0.65),
      highlight: highlight
    };
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function normal(rand) {
    var u1 = Math.max(1e-12, rand());
    var u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function sumRange(values, start, end) {
    var total = 0;
    var lo = Math.max(0, start);
    var hi = Math.min(values.length - 1, end);
    for (var i = lo; i <= hi; i += 1) total += values[i];
    return total;
  }

  function hash32(value) {
    var x = (Math.imul(value + 1, 2654435761) ^ 0x9e3779b9) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15;
    return x >>> 0;
  }

  function generateData(params) {
    var count = 620;
    var total = count + params.horizon + 2;
    var rand = makeRng(
      20260613
      + params.horizon * 31
      + Math.round(params.serial * 100) * 7
      + Math.round(params.noise * 100)
    );
    var signal = new Array(total).fill(0);
    var returns = new Array(total).fill(0);
    for (var t = 1; t < total; t += 1) {
      var regime = Math.sin(t / 55) + 0.7 * Math.sin(t / 137);
      signal[t] = params.serial * signal[t - 1]
        + Math.sqrt(Math.max(0, 1 - params.serial * params.serial)) * normal(rand)
        + 0.02 * regime;
      returns[t] = 0.0020 * signal[t - 1] + 0.0007 * regime + 0.0080 * normal(rand);
    }

    var rows = [];
    for (var day = 25; day < count; day += 1) {
      var forwardReturn = sumRange(returns, day + 1, day + params.horizon);
      rows.push({
        id: rows.length,
        time: day,
        start: day + 1,
        end: day + params.horizon,
        ret: forwardReturn,
        y: forwardReturn >= 0 ? 1 : -1,
        x: [
          signal[day] + params.noise * normal(rand),
          sumRange(returns, day - 5, day) * 35,
          sumRange(returns, day - 20, day) * 18,
          Math.sin(day / 40),
          Math.cos(day / 90)
        ]
      });
    }
    standardize(rows);
    return rows;
  }

  function standardize(rows) {
    var dims = rows[0].x.length;
    var mean = new Array(dims).fill(0);
    var sd = new Array(dims).fill(0);
    rows.forEach(function (row) {
      row.x.forEach(function (value, index) { mean[index] += value; });
    });
    mean = mean.map(function (value) { return value / rows.length; });
    rows.forEach(function (row) {
      row.x.forEach(function (value, index) {
        sd[index] += Math.pow(value - mean[index], 2);
      });
    });
    sd = sd.map(function (value) { return Math.sqrt(value / rows.length) || 1; });
    rows.forEach(function (row) {
      row.z = row.x.map(function (value, index) {
        return (value - mean[index]) / sd[index];
      });
    });
  }

  function shuffledFolds(count, folds) {
    var indices = [];
    for (var i = 0; i < count; i += 1) indices.push(i);
    indices.sort(function (a, b) { return hash32(a) - hash32(b); });
    var result = [];
    for (var fold = 0; fold < folds; fold += 1) {
      result.push(indices.filter(function (_, index) {
        return index % folds === fold;
      }).sort(function (a, b) { return a - b; }));
    }
    return result;
  }

  function blockFolds(count, folds) {
    var result = [];
    for (var fold = 0; fold < folds; fold += 1) {
      var start = Math.floor(fold * count / folds);
      var end = Math.floor((fold + 1) * count / folds);
      var indices = [];
      for (var i = start; i < end; i += 1) indices.push(i);
      result.push(indices);
    }
    return result;
  }

  function overlaps(a, b) {
    return a.start <= b.end && b.start <= a.end;
  }

  function makeSplits(rows, params, scheme) {
    var count = rows.length;
    var folds = scheme === "random"
      ? shuffledFolds(count, params.folds)
      : blockFolds(count, params.folds);
    var splits = [];

    folds.forEach(function (test, foldIndex) {
      var testSet = new Set(test);
      var train = [];
      if (scheme === "walk") {
        var firstTest = Math.min.apply(null, test);
        var cutoff = rows[firstTest].time - params.horizon - params.embargo;
        for (var before = 0; before < count; before += 1) {
          if (rows[before].time <= cutoff) train.push(before);
        }
      } else {
        var testEndTime = Math.max.apply(null, test.map(function (index) {
          return rows[index].time;
        }));
        for (var candidate = 0; candidate < count; candidate += 1) {
          if (testSet.has(candidate)) continue;
          var keep = true;
          if (scheme === "purged") {
            for (var i = 0; i < test.length; i += 1) {
              if (overlaps(rows[candidate], rows[test[i]])) {
                keep = false;
                break;
              }
            }
            if (
              keep
              && rows[candidate].time > testEndTime
              && rows[candidate].time <= testEndTime + params.embargo
            ) {
              keep = false;
            }
          }
          if (keep) train.push(candidate);
        }
      }
      if (train.length > 20 && test.length) {
        splits.push({ fold: foldIndex, train: train, test: test });
      }
    });
    return splits;
  }

  function predictOne(row, trainRows, bandwidth) {
    var score = 0;
    var totalWeight = 0;
    trainRows.forEach(function (candidate) {
      var dist2 = 0;
      for (var i = 0; i < row.z.length; i += 1) {
        dist2 += Math.pow(row.z[i] - candidate.z[i], 2);
      }
      var weight = Math.exp(-dist2 / (2 * bandwidth * bandwidth));
      score += weight * candidate.y;
      totalWeight += weight;
    });
    if (!totalWeight) return 1;
    return score >= 0 ? 1 : -1;
  }

  function evaluateSplits(rows, splits, params) {
    var correct = 0;
    var count = 0;
    var payoff = 0;
    var payoffs = [];
    splits.forEach(function (split) {
      var trainRows = split.train.map(function (index) { return rows[index]; });
      split.test.forEach(function (index) {
        var prediction = predictOne(rows[index], trainRows, params.bandwidth);
        var signedReturn = prediction * rows[index].ret;
        if (prediction === rows[index].y) correct += 1;
        payoff += signedReturn;
        payoffs.push(signedReturn);
        count += 1;
      });
    });
    var mean = count ? payoff / count : 0;
    var variance = payoffs.reduce(function (total, value) {
      return total + Math.pow(value - mean, 2);
    }, 0) / Math.max(1, payoffs.length - 1);
    return {
      accuracy: count ? correct / count : 0,
      meanReturn: mean,
      sharpeLike: variance > 0 ? mean / Math.sqrt(variance) * Math.sqrt(252 / params.horizon) : 0,
      testCount: count
    };
  }

  function leakageStats(rows, splits) {
    var pairs = 0;
    var leakyPairs = 0;
    var leakyTests = 0;
    var testCount = 0;
    var trainTotal = 0;
    splits.forEach(function (split) {
      trainTotal += split.train.length;
      split.test.forEach(function (testIndex) {
        var any = false;
        split.train.forEach(function (trainIndex) {
          pairs += 1;
          if (overlaps(rows[testIndex], rows[trainIndex])) {
            leakyPairs += 1;
            any = true;
          }
        });
        if (any) leakyTests += 1;
        testCount += 1;
      });
    });
    return {
      pairLeakRate: leakyPairs / Math.max(1, pairs),
      testLeakRate: leakyTests / Math.max(1, testCount),
      averageTrainRows: trainTotal / Math.max(1, splits.length)
    };
  }

  function liveHoldout(rows, params) {
    var holdoutStart = Math.floor(rows.length * 0.82);
    var train = [];
    var test = [];
    var cutoff = rows[holdoutStart].time - params.horizon - params.embargo;
    for (var i = 0; i < rows.length; i += 1) {
      if (i >= holdoutStart) test.push(i);
      else if (rows[i].time <= cutoff) train.push(i);
    }
    return evaluateSplits(rows, [{ fold: 0, train: train, test: test }], params);
  }

  function stateForSplit(rows, split) {
    var states = new Array(rows.length).fill(0);
    split.train.forEach(function (index) { states[index] = 1; });
    split.test.forEach(function (index) { states[index] = 2; });
    return states;
  }

  function representativeSplit(splits) {
    if (!splits.length) return null;
    return splits[Math.floor(splits.length / 2)];
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var rows = generateData(params);
    var live = liveHoldout(rows, params);
    var schemes = {};

    SCHEMES.forEach(function (scheme) {
      var splits = makeSplits(rows, params, scheme);
      var evaluation = evaluateSplits(rows, splits, params);
      var leakage = leakageStats(rows, splits);
      var split = representativeSplit(splits);
      schemes[scheme] = Object.assign({
        scheme: scheme,
        label: LABELS[scheme],
        splits: splits.length,
        timeline: split ? stateForSplit(rows, split) : [],
        fold: split ? split.fold : 0,
        trainShare: leakage.averageTrainRows / rows.length
      }, evaluation, leakage, {
        liveAccuracy: live.accuracy,
        liveMeanReturn: live.meanReturn,
        optimism: evaluation.accuracy - live.accuracy
      });
    });

    var best = SCHEMES
      .map(function (scheme) { return schemes[scheme]; })
      .sort(function (a, b) { return b.accuracy - a.accuracy; })[0];

    return {
      params: params,
      rows: rows.length,
      live: live,
      schemes: schemes,
      best: best,
      highlight: schemes[params.highlight]
    };
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return Number(value).toFixed(digits == null ? 2 : digits);
  }

  function formatBps(value) {
    var scaled = value * 10000;
    return (scaled >= 0 ? "+" : "") + scaled.toFixed(1) + " bps";
  }

  function metric(label, value, tone) {
    var klass = "purged-cv-lab__metric";
    if (tone) klass += " purged-cv-lab__metric--" + tone;
    return "<div class=\"" + klass + "\"><span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, data) {
    var h = data.highlight;
    var html = [
      metric("Most optimistic split", data.best.label + " " + formatPercent(data.best.accuracy), "warn"),
      metric("Highlighted CV accuracy", formatPercent(h.accuracy), h.optimism > 0.08 ? "warn" : "good"),
      metric("Live holdout accuracy", formatPercent(data.live.accuracy), "good"),
      metric("CV - live gap", (h.optimism >= 0 ? "+" : "") + formatPercent(h.optimism), h.optimism > 0.08 ? "bad" : "good"),
      metric("Leaky test labels", formatPercent(h.testLeakRate), h.testLeakRate > 0 ? "bad" : "good"),
      metric("Leaky train/test pairs", formatPercent(h.pairLeakRate, 2), h.pairLeakRate > 0 ? "warn" : "good"),
      metric("Mean signed return", formatBps(h.meanReturn), h.meanReturn > 0 ? "good" : "warn"),
      metric("Avg train rows", formatNumber(h.averageTrainRows, 0))
    ].join("");
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) metrics.innerHTML = html;
  }

  function paramsFromRoot(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function updateControls(root, params) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (params[key] != null) input.value = String(params[key]);
    });
  }

  function setFont(ctx, size, weight) {
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    setFont(ctx, size || 12, weight || 500);
    ctx.fillText(value, x, y);
  }

  function roundRect(ctx, x, y, w, h, r) {
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

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.panel;
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, title, box.x + 16, box.y + 20, COLORS.text, 13, 750);
  }

  function drawTimeline(ctx, data, box) {
    panel(ctx, box, "One representative fold per splitter");
    var left = box.x + 150;
    var top = box.y + 48;
    var width = box.w - 174;
    var rowHeight = 34;
    var sampleCount = data.rows;
    var stateColor = {
      0: "#e8eef5",
      1: COLORS.train,
      2: COLORS.test
    };

    SCHEMES.forEach(function (scheme, rowIndex) {
      var row = data.schemes[scheme];
      var y = top + rowIndex * rowHeight;
      text(ctx, row.label, box.x + 16, y + 8, COLORS.text, 12, 700);
      text(ctx, "fold " + (row.fold + 1), box.x + 16, y + 24, COLORS.muted, 10, 550);
      ctx.fillStyle = "#e8eef5";
      roundRect(ctx, left, y, width, 12, 6);
      ctx.fill();
      row.timeline.forEach(function (state, index) {
        if (!state) return;
        var x = left + index / sampleCount * width;
        var w = Math.max(1, width / sampleCount + 0.7);
        ctx.fillStyle = stateColor[state];
        ctx.fillRect(x, y, w, 12);
      });
    });

    var legendY = box.y + box.h - 24;
    [
      ["train", COLORS.train],
      ["test", COLORS.test],
      ["excluded or unused", "#e8eef5"]
    ].forEach(function (item, i) {
      var x = left + i * 132;
      ctx.fillStyle = item[1];
      roundRect(ctx, x, legendY - 5, 18, 10, 5);
      ctx.fill();
      text(ctx, item[0], x + 25, legendY, COLORS.muted, 11, 550);
    });
  }

  function drawAccuracy(ctx, data, box) {
    panel(ctx, box, "Accuracy estimate vs final holdout");
    var rows = SCHEMES.map(function (scheme) { return data.schemes[scheme]; });
    var left = box.x + 36;
    var top = box.y + 54;
    var chartW = box.w - 72;
    var chartH = box.h - 94;
    var liveY = top + chartH * (1 - data.live.accuracy);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0.4; g <= 0.8; g += 0.1) {
      var gy = top + chartH * (1 - g);
      ctx.beginPath();
      ctx.moveTo(left, gy);
      ctx.lineTo(left + chartW, gy);
      ctx.stroke();
      text(ctx, formatPercent(g, 0), left - 8, gy, COLORS.muted, 10, 550, "right");
    }

    ctx.strokeStyle = COLORS.live;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(left, liveY);
    ctx.lineTo(left + chartW, liveY);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "live " + formatPercent(data.live.accuracy), left + chartW, liveY - 12, COLORS.live, 11, 700, "right");

    var gap = chartW / rows.length;
    rows.forEach(function (row, index) {
      var barW = Math.min(48, gap * 0.54);
      var x = left + gap * index + gap / 2 - barW / 2;
      var y = top + chartH * (1 - row.accuracy);
      var shortLabel = {
        random: "Shuffled",
        block: "Blocked",
        purged: "Purged",
        walk: "Walk-fwd"
      }[row.scheme];
      ctx.fillStyle = COLORS[row.scheme];
      roundRect(ctx, x, y, barW, top + chartH - y, 5);
      ctx.fill();
      text(ctx, formatPercent(row.accuracy), x + barW / 2, y - 12, COLORS.text, 10, 700, "center");
      text(ctx, shortLabel, x + barW / 2, top + chartH + 18, COLORS.muted, 10, 550, "center");
    });
  }

  function drawLeakage(ctx, data, box) {
    panel(ctx, box, "Leakage and data discarded");
    var rows = SCHEMES.map(function (scheme) { return data.schemes[scheme]; });
    var left = box.x + 150;
    var top = box.y + 52;
    var maxW = box.w - 184;
    var rowH = 41;

    rows.forEach(function (row, index) {
      var y = top + index * rowH;
      text(ctx, row.label, box.x + 16, y + 8, COLORS.text, 12, 700);
      var leakW = maxW * row.testLeakRate;
      var trainW = maxW * row.trainShare;

      ctx.fillStyle = "#e8eef5";
      roundRect(ctx, left, y - 2, maxW, 9, 5);
      ctx.fill();
      ctx.fillStyle = COLORS.test;
      roundRect(ctx, left, y - 2, leakW, 9, 5);
      ctx.fill();
      text(ctx, "leaky tests " + formatPercent(row.testLeakRate), left + maxW, y + 2, COLORS.muted, 10, 600, "right");

      ctx.fillStyle = "#e8eef5";
      roundRect(ctx, left, y + 18, maxW, 9, 5);
      ctx.fill();
      ctx.fillStyle = COLORS.train;
      roundRect(ctx, left, y + 18, trainW, 9, 5);
      ctx.fill();
      text(ctx, "train kept " + formatPercent(row.trainShare), left + maxW, y + 22, COLORS.muted, 10, 600, "right");
    });
  }

  function drawPayoff(ctx, data, box) {
    panel(ctx, box, "Mean signed event return");
    var rows = SCHEMES.map(function (scheme) { return data.schemes[scheme]; });
    var left = box.x + 36;
    var mid = box.y + box.h / 2 + 16;
    var chartW = box.w - 72;
    var maxAbs = rows.reduce(function (maxValue, row) {
      return Math.max(maxValue, Math.abs(row.meanReturn), Math.abs(data.live.meanReturn));
    }, 0.0001);

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, mid);
    ctx.lineTo(left + chartW, mid);
    ctx.stroke();
    text(ctx, "0", left - 8, mid, COLORS.muted, 10, 550, "right");

    var gap = chartW / rows.length;
    rows.forEach(function (row, index) {
      var barW = Math.min(48, gap * 0.54);
      var x = left + gap * index + gap / 2 - barW / 2;
      var h = Math.abs(row.meanReturn) / maxAbs * (box.h * 0.28);
      var y = row.meanReturn >= 0 ? mid - h : mid;
      ctx.fillStyle = row.meanReturn >= 0 ? COLORS[row.scheme] : COLORS.test;
      roundRect(ctx, x, y, barW, h, 5);
      ctx.fill();
      text(ctx, formatBps(row.meanReturn), x + barW / 2, row.meanReturn >= 0 ? y - 12 : y + h + 12, COLORS.text, 10, 700, "center");
    });
    text(ctx, "final holdout " + formatBps(data.live.meanReturn), box.x + box.w - 18, box.y + 38, COLORS.live, 11, 750, "right");
  }

  function drawLab(canvas, data) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawTimeline(ctx, data, { x: 18, y: 18, w: 864, h: 214 });
    drawAccuracy(ctx, data, { x: 18, y: 252, w: 420, h: 260 });
    drawLeakage(ctx, data, { x: 458, y: 252, w: 424, h: 260 });
    drawPayoff(ctx, data, { x: 18, y: 532, w: 864, h: 150 });
  }

  function init(root) {
    if (root.__purgedCvInitialized) return;
    root.__purgedCvInitialized = true;
    var canvas = root.querySelector("[data-canvas]");
    var scheduled = false;

    function render() {
      scheduled = false;
      var data = simulate(paramsFromRoot(root));
      updateControls(root, data.params);
      renderMetrics(root, data);
      drawLab(canvas, data);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      if (global.requestAnimationFrame) global.requestAnimationFrame(render);
      else setTimeout(render, 0);
    }

    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("change", schedule);
      input.addEventListener("input", schedule);
    });
    schedule();
  }

  var api = {
    cleanParams: cleanParams,
    simulate: simulate,
    generateData: generateData,
    makeSplits: makeSplits,
    overlaps: overlaps
  };

  global.PurgedCvLab = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (global.document) {
    var boot = function () {
      global.document.querySelectorAll("[data-purged-cv-lab]").forEach(init);
    };
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
