(function (global) {
  "use strict";

  var COLORS = {
    bg: "#ffffff",
    binary: "#d97706",
    cat: "#7c3aed",
    grid: "#e6edf3",
    many: "#be123c",
    muted: "#5d6872",
    panel: "#f8fafc",
    rule: "#d7dee5",
    signal: "#0f766e",
    text: "#172026",
    train: "#2563eb"
  };

  var DEFAULTS = {
    categories: 36,
    effect: 22,
    minLeaf: 8,
    noiseCuts: 120,
    n: 160,
    repetitions: 260,
    seed: 47
  };

  var FEATURES = [
    { color: COLORS.signal, key: "signal", label: "signal", short: "signal" },
    { color: COLORS.many, key: "many", label: "many-cut noise", short: "many" },
    { color: COLORS.cat, key: "cat", label: "category noise", short: "cat" },
    { color: COLORS.binary, key: "binary", label: "binary noise", short: "binary" }
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
      categories: Math.round(clamp(finite(Number(raw.categories), DEFAULTS.categories), 2, 90)),
      effect: Math.round(clamp(finite(Number(raw.effect), DEFAULTS.effect), 0, 44)),
      minLeaf: Math.round(clamp(finite(Number(raw.minLeaf), DEFAULTS.minLeaf), 2, 30)),
      noiseCuts: Math.round(clamp(finite(Number(raw.noiseCuts), DEFAULTS.noiseCuts), 2, 260)),
      n: Math.round(clamp(finite(Number(raw.n), DEFAULTS.n), 60, 420)),
      repetitions: Math.round(clamp(finite(Number(raw.repetitions), DEFAULTS.repetitions), 80, 700)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 999))
    };
  }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generateData(params, seed, n) {
    var rng = mulberry32(seed);
    var effect = params.effect / 200;
    var rows = [];
    for (var i = 0; i < n; i += 1) {
      var signal = rng() < 0.5 ? 0 : 1;
      var p = clamp(0.5 + (signal ? effect : -effect), 0.02, 0.98);
      rows.push({
        binary: rng() < 0.5 ? 0 : 1,
        cat: Math.floor(rng() * params.categories),
        many: rng(),
        signal: signal,
        y: rng() < p ? 1 : 0
      });
    }
    return rows;
  }

  function gini(pos, n) {
    if (n <= 0) return 0;
    var p = pos / n;
    return 2 * p * (1 - p);
  }

  function parentStats(rows) {
    var pos = 0;
    rows.forEach(function (row) { pos += row.y; });
    return { impurity: gini(pos, rows.length), n: rows.length, pos: pos };
  }

  function candidateThresholds(key, params) {
    var out = [];
    if (key === "signal" || key === "binary") return [0.5];
    if (key === "cat") {
      for (var k = 0; k < params.categories - 1; k += 1) out.push(k + 0.5);
      return out;
    }
    for (var i = 1; i <= params.noiseCuts; i += 1) out.push(i / (params.noiseCuts + 1));
    return out;
  }

  function evaluateSplit(rows, key, threshold, minLeaf, parent) {
    var leftN = 0;
    var leftPos = 0;
    var rightN = 0;
    var rightPos = 0;
    rows.forEach(function (row) {
      if (row[key] <= threshold) {
        leftN += 1;
        leftPos += row.y;
      } else {
        rightN += 1;
        rightPos += row.y;
      }
    });
    if (leftN < minLeaf || rightN < minLeaf) return null;
    var weighted = leftN / parent.n * gini(leftPos, leftN) + rightN / parent.n * gini(rightPos, rightN);
    return {
      gain: Math.max(0, parent.impurity - weighted),
      leftN: leftN,
      leftP: leftPos / leftN,
      rightN: rightN,
      rightP: rightPos / rightN,
      threshold: threshold
    };
  }

  function bestSplit(rows, key, params) {
    var parent = parentStats(rows);
    var candidates = candidateThresholds(key, params);
    var best = null;
    candidates.forEach(function (threshold) {
      var split = evaluateSplit(rows, key, threshold, params.minLeaf, parent);
      if (split && (!best || split.gain > best.gain)) best = split;
    });
    if (!best) {
      best = { gain: 0, leftN: 0, leftP: 0.5, rightN: 0, rightP: 0.5, threshold: 0 };
    }
    return Object.assign({ candidates: candidates.length, key: key }, best);
  }

  function gainOnRows(rows, split) {
    var parent = parentStats(rows);
    var same = evaluateSplit(rows, split.key, split.threshold, 1, parent);
    return same ? same.gain : 0;
  }

  function accuracy(rows, split) {
    var correct = 0;
    rows.forEach(function (row) {
      var p = row[split.key] <= split.threshold ? split.leftP : split.rightP;
      var yhat = p >= 0.5 ? 1 : 0;
      if (yhat === row.y) correct += 1;
    });
    return correct / rows.length;
  }

  function oneTrial(params, seed) {
    var train = generateData(params, seed, params.n);
    var holdout = generateData(params, seed + 1000003, 2400);
    var splits = FEATURES.map(function (feature) {
      return bestSplit(train, feature.key, params);
    });
    splits.sort(function (a, b) {
      if (b.gain !== a.gain) return b.gain - a.gain;
      return b.candidates - a.candidates;
    });
    var selected = splits[0];
    return {
      holdoutAccuracy: accuracy(holdout, selected),
      holdoutGain: gainOnRows(holdout, selected),
      selected: selected,
      splits: splits,
      trainAccuracy: accuracy(train, selected)
    };
  }

  function repeatedTrials(params) {
    var counts = {};
    var trainGain = {};
    var holdoutGain = {};
    var points = [];
    FEATURES.forEach(function (feature) {
      counts[feature.key] = 0;
      trainGain[feature.key] = 0;
      holdoutGain[feature.key] = 0;
    });
    for (var i = 0; i < params.repetitions; i += 1) {
      var trial = oneTrial(params, params.seed * 10007 + i * 37 + 11);
      var key = trial.selected.key;
      counts[key] += 1;
      trainGain[key] += trial.selected.gain;
      holdoutGain[key] += trial.holdoutGain;
      if (points.length < 120) {
        points.push({
          holdoutGain: trial.holdoutGain,
          key: key,
          trainGain: trial.selected.gain
        });
      }
    }
    var rates = FEATURES.map(function (feature) {
      var c = counts[feature.key] || 0;
      return {
        color: feature.color,
        count: c,
        holdoutGain: c ? holdoutGain[feature.key] / c : 0,
        key: feature.key,
        label: feature.label,
        rate: c / params.repetitions,
        trainGain: c ? trainGain[feature.key] / c : 0
      };
    });
    return { points: points, rates: rates };
  }

  function nullLottery(params) {
    var cuts = [1, 2, 4, 8, 16, 32, 64, 128, 256].filter(function (c) {
      return c <= Math.max(params.noiseCuts, 2);
    });
    if (cuts.indexOf(params.noiseCuts) < 0) cuts.push(params.noiseCuts);
    cuts.sort(function (a, b) { return a - b; });
    var reps = Math.min(180, Math.max(80, params.repetitions));
    return cuts.map(function (cutCount) {
      var local = Object.assign({}, params, { effect: 0, noiseCuts: cutCount });
      var total = 0;
      var p95Values = [];
      for (var i = 0; i < reps; i += 1) {
        var split = bestSplit(generateData(local, params.seed * 40009 + cutCount * 193 + i * 19, params.n), "many", local);
        total += split.gain;
        p95Values.push(split.gain);
      }
      p95Values.sort(function (a, b) { return a - b; });
      return {
        cuts: cutCount,
        meanGain: total / reps,
        p95Gain: p95Values[Math.floor(0.95 * (p95Values.length - 1))]
      };
    });
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var single = oneTrial(params, params.seed * 9001 + 7);
    var repeated = repeatedTrials(params);
    var lottery = nullLottery(params);
    var signalRate = repeated.rates.filter(function (row) { return row.key === "signal"; })[0].rate;
    var manyRate = repeated.rates.filter(function (row) { return row.key === "many"; })[0].rate;
    var noisyRate = repeated.rates.reduce(function (sum, row) {
      return sum + (row.key === "signal" ? 0 : row.rate);
    }, 0);
    return {
      lottery: lottery,
      params: params,
      points: repeated.points,
      rates: repeated.rates,
      single: single,
      summary: {
        holdoutAccuracy: single.holdoutAccuracy,
        holdoutGain: single.holdoutGain,
        manyRate: manyRate,
        noisyRate: noisyRate,
        selected: single.selected.key,
        signalRate: signalRate,
        trainAccuracy: single.trainAccuracy,
        trainGain: single.selected.gain
      }
    };
  }

  function audit() {
    var def = evaluate(DEFAULTS);
    var weak = evaluate(Object.assign({}, DEFAULTS, { effect: 10, noiseCuts: 180, repetitions: 240 }));
    var strong = evaluate(Object.assign({}, DEFAULTS, { effect: 40, noiseCuts: 180, repetitions: 240 }));
    var lowCuts = evaluate(Object.assign({}, DEFAULTS, { noiseCuts: 8, repetitions: 180 }));
    var highCuts = evaluate(Object.assign({}, DEFAULTS, { noiseCuts: 220, repetitions: 180 }));
    return {
      defaultFinite: [def.summary.trainGain, def.summary.holdoutGain, def.summary.signalRate, def.summary.noisyRate].every(Number.isFinite),
      highCutsIncreaseNoiseWins: highCuts.summary.manyRate > lowCuts.summary.manyRate,
      lotteryIncreases: def.lottery[def.lottery.length - 1].meanGain > def.lottery[0].meanGain,
      noiseCanWinWeakSignal: weak.summary.noisyRate > 0.35,
      signalWinsStrongSignal: strong.summary.signalRate > 0.75,
      singleHasCandidates: def.single.splits.every(function (row) { return row.candidates >= 1; })
    };
  }

  function pct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 4 : digits);
  }

  function metric(label, value, klass) {
    return '<div class="tree-bias-lab__metric ' + (klass || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
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
        if (key === "effect") value += "%";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    box.innerHTML = [
      metric("selected stump", result.summary.selected, result.summary.selected === "signal" ? "good" : "warn"),
      metric("train gain", fmt(result.summary.trainGain, 4)),
      metric("holdout gain", fmt(result.summary.holdoutGain, 4), result.summary.holdoutGain > 0.01 ? "good" : "warn"),
      metric("test accuracy", pct(result.summary.holdoutAccuracy, 1)),
      metric("signal wins", pct(result.summary.signalRate, 0), "good"),
      metric("noise wins", pct(result.summary.noisyRate, 0), result.summary.noisyRate > 0.25 ? "warn" : "")
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = global.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.width || 900));
    var height = width < 560 ? Math.round(width * 1.55) : Math.round(width * 0.78);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function clear(ctx, width, height) {
    ctx.fillStyle = COLORS.bg;
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
    label(ctx, title, box.x + 14, box.y + 24, { size: 14, weight: 850 });
    if (subtitle) label(ctx, subtitle, box.x + 14, box.y + 42, { color: COLORS.muted, size: 11, weight: 600 });
  }

  function featureMeta(key) {
    return FEATURES.filter(function (feature) { return feature.key === key; })[0];
  }

  function drawSingle(ctx, result, box) {
    panel(ctx, box, "one greedy split", "best training gain after all candidate cuts");
    var rows = result.single.splits.slice().sort(function (a, b) {
      return FEATURES.map(function (f) { return f.key; }).indexOf(a.key) - FEATURES.map(function (f) { return f.key; }).indexOf(b.key);
    });
    var maxGain = Math.max.apply(null, rows.map(function (row) { return row.gain; }).concat([0.001]));
    var plot = { x: box.x + 96, y: box.y + 64, w: box.w - 128, h: box.h - 104 };
    rows.forEach(function (row, index) {
      var meta = featureMeta(row.key);
      var y = plot.y + index * (plot.h / rows.length) + 4;
      var barW = row.gain / maxGain * plot.w;
      label(ctx, meta.short, box.x + 18, y + 13, { color: meta.color, size: 11, weight: 850 });
      ctx.fillStyle = meta.color;
      ctx.fillRect(plot.x, y, Math.max(1, barW), 12);
      label(ctx, fmt(row.gain, 4), plot.x + barW + 6, y + 11, { size: 10, weight: 700 });
      label(ctx, row.candidates + " cuts", box.x + box.w - 18, y + 11, { align: "right", color: COLORS.muted, size: 10, weight: 700 });
    });
    label(ctx, "selected: " + result.single.selected.key, box.x + 18, box.y + box.h - 20, {
      color: featureMeta(result.single.selected.key).color,
      size: 11,
      weight: 850
    });
  }

  function drawRates(ctx, result, box) {
    panel(ctx, box, "winner rates", result.params.repetitions + " repeated samples");
    var plot = { x: box.x + 102, y: box.y + 64, w: box.w - 132, h: box.h - 104 };
    result.rates.forEach(function (row, index) {
      var y = plot.y + index * (plot.h / result.rates.length) + 4;
      label(ctx, row.label, box.x + 18, y + 13, { color: row.color, size: 10, weight: 800 });
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, row.rate * plot.w, 12);
      label(ctx, pct(row.rate, 0), plot.x + row.rate * plot.w + 6, y + 11, { size: 10, weight: 700 });
    });
    label(ctx, "noise wins = " + pct(result.summary.noisyRate, 0), box.x + 18, box.y + box.h - 20, {
      color: result.summary.noisyRate > 0.25 ? COLORS.many : COLORS.muted,
      size: 11,
      weight: 850
    });
  }

  function drawLottery(ctx, result, box) {
    panel(ctx, box, "pure-noise lottery", "more cut points inflate the best apparent gain");
    var rows = result.lottery;
    var plot = { x: box.x + 44, y: box.y + 64, w: box.w - 74, h: box.h - 104 };
    var maxGain = Math.max.apply(null, rows.map(function (row) { return row.p95Gain; }).concat([0.001]));
    function sx(cuts) {
      var min = Math.log(rows[0].cuts);
      var max = Math.log(rows[rows.length - 1].cuts);
      return plot.x + (Math.log(cuts) - min) / Math.max(1e-9, max - min) * plot.w;
    }
    function sy(value) {
      return plot.y + plot.h - value / maxGain * plot.h;
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    [
      ["meanGain", COLORS.train],
      ["p95Gain", COLORS.many]
    ].forEach(function (spec) {
      ctx.strokeStyle = spec[1];
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach(function (row, index) {
        var x = sx(row.cuts);
        var y = sy(row[spec[0]]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    rows.forEach(function (row) {
      ctx.fillStyle = COLORS.many;
      ctx.beginPath();
      ctx.arc(sx(row.cuts), sy(row.p95Gain), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    label(ctx, "mean", plot.x + 4, plot.y + 16, { color: COLORS.train, size: 10, weight: 850 });
    label(ctx, "p95", plot.x + 4, plot.y + 32, { color: COLORS.many, size: 10, weight: 850 });
    label(ctx, "candidate cuts", plot.x + plot.w, box.y + box.h - 18, { align: "right", color: COLORS.muted, size: 10, weight: 750 });
  }

  function drawGeneralization(ctx, result, box) {
    panel(ctx, box, "selected split audit", "training gain versus holdout gain");
    var plot = { x: box.x + 44, y: box.y + 62, w: box.w - 76, h: box.h - 96 };
    var maxX = Math.max.apply(null, result.points.map(function (p) { return p.trainGain; }).concat([0.001]));
    var maxY = Math.max.apply(null, result.points.map(function (p) { return Math.max(0, p.holdoutGain); }).concat([0.001]));
    function sx(value) { return plot.x + value / maxX * plot.w; }
    function sy(value) { return plot.y + plot.h - Math.max(0, value) / maxY * plot.h; }
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.stroke();
    result.points.forEach(function (point) {
      var meta = featureMeta(point.key);
      ctx.fillStyle = meta.color + "99";
      ctx.beginPath();
      ctx.arc(sx(point.trainGain), sy(point.holdoutGain), point.key === "signal" ? 3 : 2.3, 0, Math.PI * 2);
      ctx.fill();
    });
    var selected = result.single.selected;
    ctx.fillStyle = featureMeta(selected.key).color;
    ctx.beginPath();
    ctx.arc(sx(selected.gain), sy(result.summary.holdoutGain), 5, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, "train gain", plot.x + plot.w, box.y + box.h - 18, { align: "right", color: COLORS.muted, size: 10, weight: 750 });
    label(ctx, "holdout gain", plot.x + 2, plot.y - 8, { color: COLORS.muted, size: 10, weight: 750 });
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
      drawSingle(ctx, result, { x: margin, y: margin, w: width - 2 * margin, h: h });
      drawRates(ctx, result, { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h });
      drawLottery(ctx, result, { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h });
      drawGeneralization(ctx, result, { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - 2 * margin - gap) / 2;
      var rowH = (height - 2 * margin - gap) / 2;
      drawSingle(ctx, result, { x: margin, y: margin, w: colW, h: rowH });
      drawRates(ctx, result, { x: margin + colW + gap, y: margin, w: colW, h: rowH });
      drawLottery(ctx, result, { x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      drawGeneralization(ctx, result, { x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__treeSplitBiasLabResult = result;
  }

  function init(root) {
    if (!root || root.__treeSplitBiasReady) return;
    root.__treeSplitBiasReady = true;
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
    global.document.querySelectorAll("[data-tree-split-bias-lab]").forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TreeSplitBiasLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
