(function (global) {
  "use strict";

  var COLORS = {
    base: "#64748b",
    entropy: "#7c3aed",
    flat: "#2563eb",
    grid: "#e6edf3",
    muted: "#5d6872",
    panel: "#f8fafc",
    rule: "#d7dee5",
    shortcut: "#0f766e",
    tail: "#d97706",
    text: "#172026",
    uniform: "#be123c",
    white: "#ffffff"
  };

  var DEFAULTS = {
    choices: 12,
    compatibility: 35,
    search: 12,
    seed: 29,
    shortcuts: 5,
    skew: 58,
    stageCost: 120,
    trials: 900
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var choices = Math.round(clamp(finite(Number(raw.choices), DEFAULTS.choices), 3, 32));
    return {
      choices: choices,
      compatibility: Math.round(clamp(finite(Number(raw.compatibility), DEFAULTS.compatibility), 0, 95)),
      search: Math.round(clamp(finite(Number(raw.search), DEFAULTS.search), 0, 18)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      shortcuts: Math.round(clamp(finite(Number(raw.shortcuts), DEFAULTS.shortcuts), 0, Math.max(0, choices - 1))),
      skew: Math.round(clamp(finite(Number(raw.skew), DEFAULTS.skew), 0, 92)),
      stageCost: Math.round(clamp(finite(Number(raw.stageCost), DEFAULTS.stageCost), 0, 360)),
      trials: Math.round(clamp(finite(Number(raw.trials), DEFAULTS.trials), 200, 2400) / 100) * 100
    };
  }

  function rng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u <= 0) u = rand();
    while (v <= 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function entropy(probs) {
    return probs.reduce(function (sum, p) {
      return p > 0 ? sum + p * Math.log2(1 / p) : sum;
    }, 0);
  }

  function distribution(params) {
    if (params.skew === 0) {
      return new Array(params.choices).fill(1 / params.choices);
    }
    var beta = params.skew / 100 * 0.42;
    var weights = [];
    for (var i = 0; i < params.choices; i += 1) {
      weights.push(Math.exp(-beta * i));
    }
    var total = weights.reduce(function (sum, value) { return sum + value; }, 0);
    return weights.map(function (value) { return value / total; });
  }

  function sampleIndex(rand, probs) {
    var draw = rand();
    var c = 0;
    for (var i = 0; i < probs.length; i += 1) {
      c += probs[i];
      if (draw <= c) return i;
    }
    return probs.length - 1;
  }

  function hickSlope(params) {
    var compatibility = params.compatibility / 100;
    return 205 * (1 - 0.78 * compatibility) + 18;
  }

  function baseTime(params) {
    return 245 - 58 * params.compatibility / 100;
  }

  function visualCost(params, visibleCount) {
    return params.search * visibleCount;
  }

  function shortcutStats(probs, k) {
    k = clamp(k, 0, probs.length - 1);
    var top = probs.slice(0, k);
    var tail = probs.slice(k);
    var tailMass = tail.reduce(function (sum, p) { return sum + p; }, 0);
    var firstStage = top.slice();
    if (tailMass > 0) firstStage.push(tailMass);
    var tailNormalized = tailMass > 0 ? tail.map(function (p) { return p / tailMass; }) : [];
    return {
      firstEntropy: entropy(firstStage),
      firstVisible: k + (tailMass > 1e-12 ? 1 : 0),
      k: k,
      tailEntropy: entropy(tailNormalized),
      tailMass: tailMass,
      tailVisible: tail.length
    };
  }

  function expectedTimes(params, probs) {
    var h = entropy(probs);
    var uniformH = Math.log2(params.choices);
    var slope = hickSlope(params);
    var base = baseTime(params);
    var sc = shortcutStats(probs, params.shortcuts);
    var flatVisual = visualCost(params, params.choices);
    var flatEntropy = base + slope * h + flatVisual;
    var flatUniform = base + slope * uniformH + flatVisual;
    var shortcut = base
      + slope * sc.firstEntropy
      + visualCost(params, sc.firstVisible)
      + sc.tailMass * (params.stageCost + slope * sc.tailEntropy + visualCost(params, sc.tailVisible));
    return {
      base: base,
      flatEntropy: flatEntropy,
      flatUniform: flatUniform,
      flatVisual: flatVisual,
      h: h,
      shortcut: shortcut,
      shortcutStats: sc,
      slope: slope,
      uniformH: uniformH
    };
  }

  function simulateTrials(params, probs, times) {
    var rand = rng(20260617 + params.seed * 101 + params.choices * 17 + params.skew * 31 + params.shortcuts * 43);
    var flat = [];
    var shortcut = [];
    var topHits = 0;
    var tailHits = 0;
    for (var i = 0; i < params.trials; i += 1) {
      var item = sampleIndex(rand, probs);
      var noise = 38 * normal(rand);
      flat.push(Math.max(120, times.flatEntropy + noise));
      if (item < params.shortcuts) {
        topHits += 1;
        shortcut.push(Math.max(120, times.base + times.slope * times.shortcutStats.firstEntropy + visualCost(params, times.shortcutStats.firstVisible) + 36 * normal(rand)));
      } else {
        tailHits += 1;
        shortcut.push(Math.max(120, times.base
          + times.slope * times.shortcutStats.firstEntropy
          + visualCost(params, times.shortcutStats.firstVisible)
          + params.stageCost
          + times.slope * times.shortcutStats.tailEntropy
          + visualCost(params, times.shortcutStats.tailVisible)
          + 42 * normal(rand)));
      }
    }
    return {
      flat: flat,
      shortcut: shortcut,
      tailHits: tailHits,
      topHits: topHits
    };
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
  }

  function quantile(values, p) {
    var s = values.slice().sort(function (a, b) { return a - b; });
    var pos = (s.length - 1) * p;
    var lo = Math.floor(pos);
    var hi = Math.ceil(pos);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  function histogram(values, min, max, bins) {
    var counts = new Array(bins).fill(0);
    values.forEach(function (value) {
      var index = Math.floor((value - min) / Math.max(1e-9, max - min) * bins);
      counts[clamp(index, 0, bins - 1)] += 1;
    });
    return counts;
  }

  function sweepSkew(params) {
    var rows = [];
    for (var skew = 0; skew <= 90; skew += 10) {
      var local = Object.assign({}, params, { skew: skew });
      var probs = distribution(local);
      var times = expectedTimes(local, probs);
      rows.push({
        entropy: times.h,
        flatEntropy: times.flatEntropy,
        shortcut: times.shortcut,
        skew: skew,
        uniform: times.flatUniform
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var probs = distribution(params);
    var times = expectedTimes(params, probs);
    var trials = simulateTrials(params, probs, times);
    var allTimes = trials.flat.concat(trials.shortcut);
    var minT = Math.max(100, Math.floor(Math.min.apply(null, allTimes) / 50) * 50);
    var maxT = Math.ceil(Math.max.apply(null, allTimes) / 50) * 50;
    return {
      hist: {
        flat: histogram(trials.flat, minT, maxT, 18),
        max: maxT,
        min: minT,
        shortcut: histogram(trials.shortcut, minT, maxT, 18)
      },
      params: params,
      probs: probs,
      sweep: sweepSkew(params),
      times: times,
      trials: {
        flatMean: mean(trials.flat),
        flatP90: quantile(trials.flat, 0.9),
        shortcutMean: mean(trials.shortcut),
        shortcutP90: quantile(trials.shortcut, 0.9),
        tailHits: trials.tailHits,
        topHits: trials.topHits
      }
    };
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function near(a, b, tolerance) {
    return Math.abs(a - b) <= tolerance;
  }

  function audit() {
    var checked = 0;
    var maxChainError = 0;
    var maxProbabilityError = 0;
    function check(condition, message) {
      checked += 1;
      assert(condition, message);
    }
    function checkResult(result, label) {
      var params = result.params;
      var probs = result.probs;
      var probabilitySum = probs.reduce(function (sum, p) { return sum + p; }, 0);
      var stats = result.times.shortcutStats;
      var chain = stats.firstEntropy + stats.tailMass * stats.tailEntropy;
      var flatFormula = result.times.base + result.times.slope * result.times.h + visualCost(params, params.choices);
      var uniformFormula = result.times.base + result.times.slope * result.times.uniformH + visualCost(params, params.choices);
      var shortcutFormula = result.times.base
        + result.times.slope * stats.firstEntropy
        + visualCost(params, stats.firstVisible)
        + stats.tailMass * (params.stageCost + result.times.slope * stats.tailEntropy + visualCost(params, stats.tailVisible));
      maxProbabilityError = Math.max(maxProbabilityError, Math.abs(probabilitySum - 1));
      maxChainError = Math.max(maxChainError, Math.abs(chain - result.times.h));
      check(probs.length === params.choices, label + " distribution should have one probability per choice");
      check(probs.every(function (p) { return p >= 0 && p <= 1 && Number.isFinite(p); }), label + " probabilities should be valid");
      check(near(probabilitySum, 1, 1e-12), label + " probabilities should sum to one");
      check(result.times.h >= 0 && result.times.h <= result.times.uniformH + 1e-12, label + " entropy should stay between zero and uniform entropy");
      check(near(chain, result.times.h, 1e-12), label + " staged menu should obey entropy chain rule");
      check(near(result.times.flatEntropy, flatFormula, 1e-12), label + " flat learned-time formula should reconcile");
      check(near(result.times.flatUniform, uniformFormula, 1e-12), label + " flat uniform-time formula should reconcile");
      check(near(result.times.shortcut, shortcutFormula, 1e-12), label + " shortcut-time formula should reconcile");
      check(result.hist.flat.reduce(function (sum, count) { return sum + count; }, 0) === params.trials, label + " flat histogram should count every trial");
      check(result.hist.shortcut.reduce(function (sum, count) { return sum + count; }, 0) === params.trials, label + " shortcut histogram should count every trial");
      check(result.trials.topHits + result.trials.tailHits === params.trials, label + " simulated route hits should partition trials");
      check(result.trials.flatP90 >= result.trials.flatMean, label + " flat p90 should be above mean");
      check(result.trials.shortcutP90 >= result.trials.shortcutMean, label + " shortcut p90 should be above mean");
      result.sweep.forEach(function (row, index) {
        check(Number.isFinite(row.entropy) && Number.isFinite(row.flatEntropy) && Number.isFinite(row.shortcut), label + " sweep rows should be finite");
        if (index > 0) {
          check(row.skew > result.sweep[index - 1].skew, label + " sweep skew should increase");
          check(row.entropy <= result.sweep[index - 1].entropy + 1e-12, label + " entropy should not increase as skew grows");
          check(row.flatEntropy <= result.sweep[index - 1].flatEntropy + 1e-12, label + " flat time should not increase as skew grows");
        }
      });
    }

    [3, 12, 24, 32].forEach(function (choices) {
      [0, 35, 85].forEach(function (compatibility) {
        [0, 30, 58, 90].forEach(function (skew) {
          [0, 3, Math.max(0, Math.min(choices - 1, 5)), choices - 1].forEach(function (shortcuts) {
            var result = evaluate({
              choices: choices,
              compatibility: compatibility,
              search: 12,
              seed: 17 + choices + shortcuts,
              shortcuts: shortcuts,
              skew: skew,
              stageCost: 120,
              trials: 400
            });
            checkResult(result, "choices " + choices + " skew " + skew + " shortcuts " + shortcuts);
          });
        });
      });
    });

    [0, 30, 60, 95].forEach(function (compatibility, index, values) {
      var result = evaluate(Object.assign({}, DEFAULTS, { compatibility: compatibility }));
      if (index > 0) {
        var previous = evaluate(Object.assign({}, DEFAULTS, { compatibility: values[index - 1] }));
        check(result.times.slope <= previous.times.slope + 1e-12, "compatibility should not increase Hick-Hyman slope");
        check(result.times.flatEntropy <= previous.times.flatEntropy + 1e-12, "compatibility should not increase flat menu time");
      }
    });

    var result = evaluate(DEFAULTS);
    var uniform = evaluate(Object.assign({}, DEFAULTS, { skew: 0 }));
    var noSearch = evaluate(Object.assign({}, DEFAULTS, { search: 0 }));
    check(Math.round(result.times.flatEntropy) === 897, "default flat learned-time should match article");
    check(Math.round(result.times.flatUniform) === 968, "default uniform-time should match article");
    check(Math.round(result.times.shortcut) === 877, "default shortcut time should match article");
    check(Math.round(noSearch.times.shortcut - noSearch.times.flatEntropy) === 31, "no-search shortcut penalty should match article");
    check(cleanParams({ choices: 99, shortcuts: 99, trials: 255, search: -4, skew: 999, compatibility: -9, stageCost: 999, seed: -4 }).choices === 32, "sanitizer should clamp choices");
    check(cleanParams({ choices: 99, shortcuts: 99, trials: 255, search: -4, skew: 999, compatibility: -9, stageCost: 999, seed: -4 }).shortcuts === 31, "sanitizer should clamp shortcuts under choices");
    check(cleanParams({ choices: 99, shortcuts: 99, trials: 255, search: -4, skew: 999, compatibility: -9, stageCost: 999, seed: -4 }).trials === 300, "sanitizer should snap trials");
    return {
      checked: checked,
      entropyBits: Number(result.times.h.toFixed(3)),
      flatEntropyMs: Math.round(result.times.flatEntropy),
      flatUniformMs: Math.round(result.times.flatUniform),
      maxChainError: maxChainError,
      maxProbabilityError: maxProbabilityError,
      ok: true,
      shortcutFasterWithSearch: result.times.shortcut < result.times.flatEntropy,
      shortcutMs: Math.round(result.times.shortcut),
      skewReducesEntropy: result.times.h < result.times.uniformH,
      topMass: Number((1 - result.times.shortcutStats.tailMass).toFixed(3)),
      uniformEntropyBits: Number(uniform.times.h.toFixed(3)),
      withoutSearchShortcutPenalty: Math.round(noSearch.times.shortcut - noSearch.times.flatEntropy)
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function ms(value) {
    return Math.round(value) + " ms";
  }

  function percent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value, klass) {
    return '<div class="hick-lab__metric ' + (klass || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
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
        if (key === "compatibility" || key === "skew") value += "%";
        if (key === "search" || key === "stageCost") value += " ms";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    box.innerHTML = [
      metric("entropy", fmt(result.times.h, 2) + " bits", "good"),
      metric("uniform bits", fmt(result.times.uniformH, 2)),
      metric("flat menu", ms(result.times.flatEntropy)),
      metric("shortcut menu", ms(result.times.shortcut), result.times.shortcut < result.times.flatEntropy ? "good" : "warn"),
      metric("top mass", percent(1 - result.times.shortcutStats.tailMass, 1)),
      metric("slope", Math.round(result.times.slope) + " ms/bit")
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = global.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.width));
    var height = width < 560 ? Math.round(width * 1.54) : Math.round(width * 0.78);
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

  function drawProbabilities(ctx, result, box) {
    panel(ctx, box, "choice probabilities", "same option count can carry different entropy");
    var plot = { x: box.x + 40, y: box.y + 64, w: box.w - 62, h: box.h - 98 };
    var maxP = Math.max.apply(null, result.probs);
    var gap = Math.max(2, plot.w / result.probs.length * 0.16);
    var barW = (plot.w - gap * (result.probs.length - 1)) / result.probs.length;
    result.probs.forEach(function (p, index) {
      var h = plot.h * p / maxP;
      var x = plot.x + index * (barW + gap);
      var y = plot.y + plot.h - h;
      ctx.fillStyle = index < result.params.shortcuts ? COLORS.shortcut : COLORS.tail;
      ctx.fillRect(x, y, barW, h);
      if (index < 12 || result.probs.length <= 16) {
        label(ctx, String(index + 1), x + barW / 2, plot.y + plot.h + 15, { align: "center", color: COLORS.muted, size: 9, weight: 650 });
      }
    });
    label(ctx, "H = " + fmt(result.times.h, 2) + " bits", plot.x, box.y + box.h - 18, { color: COLORS.entropy, size: 11, weight: 800 });
    label(ctx, "top shortcuts", plot.x + 114, box.y + box.h - 18, { color: COLORS.shortcut, size: 11, weight: 800 });
  }

  function drawTimeBars(ctx, result, box) {
    panel(ctx, box, "time ledger", "decision bits and visible search are separate costs");
    var rows = [
      { color: COLORS.uniform, label: "uniform assumption", value: result.times.flatUniform },
      { color: COLORS.flat, label: "flat, learned odds", value: result.times.flatEntropy },
      { color: COLORS.shortcut, label: "shortcuts + more", value: result.times.shortcut }
    ];
    var plot = { x: box.x + 118, y: box.y + 66, w: box.w - 148, h: box.h - 96 };
    var maxV = Math.max.apply(null, rows.map(function (row) { return row.value; })) * 1.08;
    rows.forEach(function (row, index) {
      var y = plot.y + index * (plot.h / rows.length) + 8;
      label(ctx, row.label, box.x + 16, y + 17, { color: row.color, size: 11, weight: 800 });
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, plot.w * row.value / maxV, 18);
      label(ctx, ms(row.value), plot.x + plot.w * row.value / maxV + 6, y + 14, { color: COLORS.text, size: 10, weight: 700 });
    });
    label(ctx, "search tax " + result.params.search + " ms/item", plot.x, box.y + box.h - 18, { color: COLORS.muted, size: 10, weight: 650 });
  }

  function drawHistograms(ctx, result, box) {
    panel(ctx, box, "simulated trial times", "jitter around the model, not new human data");
    var plot = { x: box.x + 44, y: box.y + 64, w: box.w - 68, h: box.h - 98 };
    var bins = result.hist.flat.length;
    var maxCount = Math.max.apply(null, result.hist.flat.concat(result.hist.shortcut).concat([1]));
    var barW = plot.w / bins;
    for (var i = 0; i < bins; i += 1) {
      var flatH = plot.h * result.hist.flat[i] / maxCount;
      var shortcutH = plot.h * result.hist.shortcut[i] / maxCount;
      ctx.fillStyle = "rgba(37, 99, 235, 0.42)";
      ctx.fillRect(plot.x + i * barW, plot.y + plot.h - flatH, barW * 0.48, flatH);
      ctx.fillStyle = "rgba(15, 118, 110, 0.54)";
      ctx.fillRect(plot.x + i * barW + barW * 0.48, plot.y + plot.h - shortcutH, barW * 0.48, shortcutH);
    }
    label(ctx, String(result.hist.min), plot.x, plot.y + plot.h + 15, { color: COLORS.muted, size: 10, weight: 650 });
    label(ctx, String(result.hist.max) + " ms", plot.x + plot.w, plot.y + plot.h + 15, { align: "right", color: COLORS.muted, size: 10, weight: 650 });
    label(ctx, "flat mean " + ms(result.trials.flatMean), plot.x, box.y + box.h - 18, { color: COLORS.flat, size: 10, weight: 800 });
    label(ctx, "shortcut mean " + ms(result.trials.shortcutMean), plot.x + 120, box.y + box.h - 18, { color: COLORS.shortcut, size: 10, weight: 800 });
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "skew sweep", "number of choices fixed; entropy changes");
    var rows = result.sweep;
    var plot = { x: box.x + 46, y: box.y + 62, w: box.w - 76, h: box.h - 96 };
    var maxMs = Math.max.apply(null, rows.map(function (row) { return Math.max(row.flatEntropy, row.shortcut, row.uniform); }));
    var maxH = Math.log2(result.params.choices);
    function sx(skew) { return plot.x + skew / 90 * plot.w; }
    function syMs(msValue) { return plot.y + plot.h - msValue / maxMs * plot.h; }
    function syH(bits) { return plot.y + plot.h - bits / maxH * plot.h; }

    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h * g / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }

    [
      { key: "flatEntropy", color: COLORS.flat },
      { key: "shortcut", color: COLORS.shortcut }
    ].forEach(function (series) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach(function (row, index) {
        var x = sx(row.skew);
        var y = syMs(row[series.key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    ctx.strokeStyle = COLORS.entropy;
    ctx.lineWidth = 1.7;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = sx(row.skew);
      var y = syH(row.entropy);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    label(ctx, "flat", plot.x + 8, box.y + box.h - 18, { color: COLORS.flat, size: 11, weight: 800 });
    label(ctx, "shortcut", plot.x + 50, box.y + box.h - 18, { color: COLORS.shortcut, size: 11, weight: 800 });
    label(ctx, "entropy", plot.x + 126, box.y + box.h - 18, { color: COLORS.entropy, size: 11, weight: 800 });
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
      drawProbabilities(ctx, result, { x: margin, y: margin, w: width - 2 * margin, h: h });
      drawTimeBars(ctx, result, { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h });
      drawHistograms(ctx, result, { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h });
      drawSweep(ctx, result, { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - 2 * margin - gap) / 2;
      var rowH = (height - 2 * margin - gap) / 2;
      drawProbabilities(ctx, result, { x: margin, y: margin, w: colW, h: rowH });
      drawTimeBars(ctx, result, { x: margin + colW + gap, y: margin, w: colW, h: rowH });
      drawHistograms(ctx, result, { x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      drawSweep(ctx, result, { x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__hickHymanLabResult = result;
  }

  function init(root) {
    if (!root || root.__hickHymanReady) return;
    root.__hickHymanReady = true;
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
    global.document.querySelectorAll("[data-hick-hyman-lab]").forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.HickHymanLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
