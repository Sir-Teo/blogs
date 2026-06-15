(function (root) {
  "use strict";

  var COLORS = {
    taken: "#0f766e",
    notTaken: "#2563eb",
    miss: "#be123c",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    grid: "#edf2f7",
    loop: "#0f766e",
    random: "#64748b",
    copy: "#2563eb",
    parity: "#b45309",
    decoy: "#7c3aed",
    always: "#64748b",
    bimodal: "#2563eb",
    gshare: "#0f766e",
    perceptron: "#b45309"
  };

  var DEFAULTS = {
    entriesExp: 6,
    history: 8,
    blocks: 700,
    noise: 5,
    decoys: 24,
    loopPeriod: 9,
    seed: 23
  };
  var AUDIT_CACHE = null;

  var FAMILY_ORDER = ["loop", "copy", "parity", "random", "decoy"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function close(actual, expected, tolerance) {
    return isFinite(actual) && isFinite(expected) && Math.abs(actual - expected) <= tolerance;
  }

  function sum(values) {
    return values.reduce(function (acc, value) { return acc + value; }, 0);
  }

  function familyCounts(trace) {
    var counts = {};
    FAMILY_ORDER.forEach(function (family) { counts[family] = 0; });
    trace.forEach(function (event) {
      counts[event.family] = (counts[event.family] || 0) + 1;
    });
    return counts;
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      entriesExp: snap(raw.entriesExp, DEFAULTS.entriesExp, 4, 10, 1),
      history: snap(raw.history, DEFAULTS.history, 0, 14, 1),
      blocks: snap(raw.blocks, DEFAULTS.blocks, 200, 1600, 50),
      noise: snap(raw.noise, DEFAULTS.noise, 0, 30, 1),
      decoys: snap(raw.decoys, DEFAULTS.decoys, 0, 96, 4),
      loopPeriod: snap(raw.loopPeriod, DEFAULTS.loopPeriod, 3, 24, 1),
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

  function hashInt(value) {
    var x = value >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function flipWithNoise(value, rand, probability) {
    return rand() < probability ? !value : value;
  }

  function addEvent(trace, pc, family, outcome) {
    trace.push({
      pc: pc >>> 0,
      family: family,
      outcome: !!outcome
    });
  }

  function generateTrace(raw) {
    var params = cleanParams(raw);
    var rand = makeRng(params.seed * 1009 + params.blocks * 17);
    var trace = [];
    var noise = params.noise / 100;
    var decoyCount = params.decoys;
    var decoys = [];
    var i;

    for (i = 0; i < decoyCount; i += 1) {
      decoys.push({
        pc: 0x5000 + i * 0x40 + (i % 7),
        bias: 0.12 + 0.76 * rand(),
        phase: 3 + Math.floor(17 * rand()),
        invert: rand() < 0.5
      });
    }

    for (var block = 0; block < params.blocks; block += 1) {
      var coinA = rand() < 0.5;
      var coinB = rand() < 0.5;
      var loopTaken = (block % params.loopPeriod) !== params.loopPeriod - 1;
      var copy = flipWithNoise(coinA, rand, noise);
      var parity = flipWithNoise(coinA !== coinB, rand, noise);

      addEvent(trace, 0x1010, "loop", loopTaken);
      addEvent(trace, 0x2020, "random", coinA);
      addEvent(trace, 0x2028, "copy", copy);
      addEvent(trace, 0x2030, "random", coinB);
      addEvent(trace, 0x2038, "parity", parity);

      if (decoyCount > 0) {
        var fanout = decoyCount > 48 ? 3 : (decoyCount > 16 ? 2 : 1);
        for (var j = 0; j < fanout; j += 1) {
          var index = (block * 7 + j * 19 + Math.floor(rand() * decoyCount)) % decoyCount;
          var decoy = decoys[index];
          var periodic = ((block + decoy.phase + j) % (5 + (index % 9))) !== 0;
          var biased = rand() < decoy.bias;
          var outcome = decoy.invert ? (periodic && !biased) : (periodic || biased);
          addEvent(trace, decoy.pc, "decoy", flipWithNoise(outcome, rand, noise * 0.5));
        }
      }
    }

    return trace;
  }

  function makeEmptyFamilyStats() {
    var out = {};
    FAMILY_ORDER.forEach(function (family) {
      out[family] = { total: 0, misses: 0 };
    });
    return out;
  }

  function counterPredict(counter) {
    return counter >= 2;
  }

  function updateCounter(counter, outcome) {
    return clamp(counter + (outcome ? 1 : -1), 0, 3);
  }

  function makeAlwaysTaken() {
    return {
      key: "always",
      name: "always taken",
      color: COLORS.always,
      predict: function () {
        return { taken: true };
      },
      update: function () {}
    };
  }

  function makeBimodal(entries) {
    var table = [];
    for (var i = 0; i < entries; i += 1) table.push(2);
    return {
      key: "bimodal",
      name: "2-bit bimodal",
      color: COLORS.bimodal,
      table: table,
      predict: function (event) {
        var index = hashInt(event.pc) & (entries - 1);
        return { taken: counterPredict(table[index]), index: index };
      },
      update: function (event, outcome, guess) {
        table[guess.index] = updateCounter(table[guess.index], outcome);
      }
    };
  }

  function makeGshare(entries, historyBits) {
    var table = [];
    for (var i = 0; i < entries; i += 1) table.push(2);
    var history = 0;
    var historyMask = historyBits <= 0 ? 0 : ((1 << historyBits) - 1);
    return {
      key: "gshare",
      name: "gshare",
      color: COLORS.gshare,
      table: table,
      predict: function (event) {
        var mixed = hashInt(event.pc) ^ history;
        var index = mixed & (entries - 1);
        return { taken: counterPredict(table[index]), index: index, history: history };
      },
      update: function (event, outcome, guess) {
        table[guess.index] = updateCounter(table[guess.index], outcome);
        history = historyBits <= 0 ? 0 : (((history << 1) | (outcome ? 1 : 0)) & historyMask);
      }
    };
  }

  function makePerceptron(entries, historyBits) {
    var weights = [];
    var history = [];
    var theta = Math.floor(1.93 * historyBits + 14);
    var maxWeight = 31;
    for (var i = 0; i < entries; i += 1) {
      var row = [];
      for (var j = 0; j <= historyBits; j += 1) row.push(0);
      weights.push(row);
    }
    for (var h = 0; h < historyBits; h += 1) history.push(-1);
    return {
      key: "perceptron",
      name: "perceptron",
      color: COLORS.perceptron,
      weights: weights,
      predict: function (event) {
        var index = hashInt(event.pc) & (entries - 1);
        var row = weights[index];
        var score = row[0];
        for (var i = 0; i < historyBits; i += 1) score += row[i + 1] * history[i];
        return { taken: score >= 0, index: index, score: score, history: history.slice() };
      },
      update: function (event, outcome, guess) {
        var y = outcome ? 1 : -1;
        var row = weights[guess.index];
        if (guess.taken !== outcome || Math.abs(guess.score) <= theta) {
          row[0] = clamp(row[0] + y, -maxWeight, maxWeight);
          for (var i = 0; i < historyBits; i += 1) {
            row[i + 1] = clamp(row[i + 1] + y * guess.history[i], -maxWeight, maxWeight);
          }
        }
        if (historyBits > 0) {
          history.pop();
          history.unshift(y);
        }
      }
    };
  }

  function runPredictor(predictor, trace, keepTimeline) {
    var stats = {
      key: predictor.key,
      name: predictor.name,
      color: predictor.color,
      total: trace.length,
      misses: 0,
      byFamily: makeEmptyFamilyStats(),
      timeline: []
    };

    for (var i = 0; i < trace.length; i += 1) {
      var event = trace[i];
      var guess = predictor.predict(event);
      var miss = guess.taken !== event.outcome;
      if (miss) stats.misses += 1;
      var familyStats = stats.byFamily[event.family];
      familyStats.total += 1;
      if (miss) familyStats.misses += 1;
      if (keepTimeline && stats.timeline.length < 180) {
        stats.timeline.push({
          family: event.family,
          outcome: event.outcome,
          miss: miss
        });
      }
      predictor.update(event, event.outcome, guess);
    }

    stats.missRate = stats.misses / Math.max(1, stats.total);
    stats.missesPerK = stats.missRate * 1000;
    FAMILY_ORDER.forEach(function (family) {
      var row = stats.byFamily[family];
      row.missRate = row.misses / Math.max(1, row.total);
    });
    return stats;
  }

  function contextKey(pc, history) {
    return String(pc >>> 0) + ":" + String(history >>> 0);
  }

  function branchWorkingSet(trace, historyBits, entries) {
    var mask = historyBits <= 0 ? 0 : ((1 << historyBits) - 1);
    var history = 0;
    var contexts = {};
    var tableBuckets = {};
    var rows = [];
    var i;

    for (i = 0; i < trace.length; i += 1) {
      var event = trace[i];
      var key = contextKey(event.pc, history);
      if (!contexts[key]) {
        contexts[key] = {
          pc: event.pc,
          history: history,
          total: 0,
          taken: 0,
          index: (hashInt(event.pc) ^ history) & (entries - 1)
        };
        rows.push(contexts[key]);
      }
      contexts[key].total += 1;
      if (event.outcome) contexts[key].taken += 1;
      history = historyBits <= 0 ? 0 : (((history << 1) | (event.outcome ? 1 : 0)) & mask);
    }

    rows.sort(function (a, b) { return b.total - a.total; });
    var covered = 0;
    var workingSet95 = 0;
    for (i = 0; i < rows.length; i += 1) {
      if (covered < trace.length * 0.95) workingSet95 += 1;
      covered += rows[i].total;
      var bucketKey = String(rows[i].index);
      if (!tableBuckets[bucketKey]) tableBuckets[bucketKey] = [];
      tableBuckets[bucketKey].push(rows[i]);
    }

    var majorityCorrect = 0;
    rows.forEach(function (row) {
      majorityCorrect += Math.max(row.taken, row.total - row.taken);
    });

    var bucketKeys = Object.keys(tableBuckets);
    var maxBucket = 0;
    bucketKeys.forEach(function (key) {
      maxBucket = Math.max(maxBucket, tableBuckets[key].length);
    });

    return {
      contexts: rows.length,
      workingSet95: workingSet95,
      contextAccuracy: majorityCorrect / Math.max(1, trace.length),
      contextMissRate: 1 - majorityCorrect / Math.max(1, trace.length),
      aliasLoad: rows.length / entries,
      occupiedEntries: bucketKeys.length,
      collidingContexts: rows.length - bucketKeys.length,
      maxBucket: maxBucket,
      buckets: tableBuckets,
      rows: rows
    };
  }

  function tableOccupancy(trace, historyBits, entries) {
    var mask = historyBits <= 0 ? 0 : ((1 << historyBits) - 1);
    var history = 0;
    var counts = [];
    var i;
    for (i = 0; i < entries; i += 1) counts.push(0);
    for (i = 0; i < trace.length; i += 1) {
      var event = trace[i];
      var index = (hashInt(event.pc) ^ history) & (entries - 1);
      counts[index] += 1;
      history = historyBits <= 0 ? 0 : (((history << 1) | (event.outcome ? 1 : 0)) & mask);
    }
    return counts;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var entries = 1 << params.entriesExp;
    var trace = generateTrace(params);
    var predictors = [
      makeAlwaysTaken(),
      makeBimodal(entries),
      makeGshare(entries, params.history),
      makePerceptron(entries, params.history)
    ];
    var stats = predictors.map(function (predictor) {
      return runPredictor(predictor, trace, predictor.key === "gshare");
    });
    var best = stats.slice().sort(function (a, b) { return a.missesPerK - b.missesPerK; })[0];
    var workingSet = branchWorkingSet(trace, params.history, entries);
    var occupancy = tableOccupancy(trace, params.history, entries);

    return {
      params: params,
      entries: entries,
      trace: trace,
      stats: stats,
      best: best,
      workingSet: workingSet,
      occupancy: occupancy
    };
  }

  function runAudit() {
    var checks = [];
    var baseParams = cleanParams(DEFAULTS);

    function check(label, passed, detail) {
      checks.push({ label: label, passed: !!passed, detail: detail || "" });
    }

    var snapped = cleanParams({ entriesExp: 99, history: -4, blocks: 211, noise: 42, decoys: 5, loopPeriod: 99, seed: "nope" });
    check("parameter snapping", snapped.entriesExp === 10 && snapped.history === 0 && snapped.blocks === 200 && snapped.noise === 30 && snapped.decoys === 4 && snapped.loopPeriod === 24 && snapped.seed === DEFAULTS.seed);

    check("counter prediction threshold", counterPredict(0) === false && counterPredict(1) === false && counterPredict(2) === true && counterPredict(3) === true);
    check("counter saturates upward", updateCounter(3, true) === 3 && updateCounter(2, true) === 3);
    check("counter saturates downward", updateCounter(0, false) === 0 && updateCounter(1, false) === 0);
    check("hash is deterministic unsigned", hashInt(0x12345678) === hashInt(0x12345678) && hashInt(-1) >= 0);

    var smallParams = cleanParams({ entriesExp: 4, history: 2, blocks: 200, noise: 0, decoys: 0, loopPeriod: 5, seed: 7 });
    var trace = generateTrace(smallParams);
    var counts = familyCounts(trace);
    check("no-decoy trace length", trace.length === smallParams.blocks * 5);
    check("trace family counts", counts.loop === smallParams.blocks && counts.copy === smallParams.blocks && counts.parity === smallParams.blocks && counts.random === smallParams.blocks * 2 && counts.decoy === 0);
    check("loop exits once per period", trace.filter(function (event) { return event.family === "loop" && !event.outcome; }).length === smallParams.blocks / smallParams.loopPeriod);
    check("copy branch mirrors previous random without noise", trace.every(function (event, index) {
      return event.family !== "copy" || event.outcome === trace[index - 1].outcome;
    }));
    check("parity branch follows xor without noise", trace.every(function (event, index) {
      return event.family !== "parity" || event.outcome === (trace[index - 3].outcome !== trace[index - 1].outcome);
    }));

    var decoyTrace = generateTrace(baseParams);
    var decoyCounts = familyCounts(decoyTrace);
    check("default decoys add traffic", decoyCounts.decoy === baseParams.blocks * 2);
    check("trace generation is deterministic", JSON.stringify(generateTrace(smallParams).slice(0, 20)) === JSON.stringify(trace.slice(0, 20)));

    var bimodal = runPredictor(makeBimodal(16), trace, true);
    check("predictor accounts for every event", bimodal.total === trace.length && sum(FAMILY_ORDER.map(function (family) { return bimodal.byFamily[family].total; })) === trace.length);
    check("timeline cap", bimodal.timeline.length === 180);
    check("loop is easy for two-bit counter", bimodal.byFamily.loop.missRate < 0.45);

    var gshareNoHistory = runPredictor(makeGshare(64, 0), trace, false);
    var gshareHistory = runPredictor(makeGshare(64, 2), trace, false);
    check("gshare zero history matches bimodal table shape", close(gshareNoHistory.missesPerK, runPredictor(makeBimodal(64), trace, false).missesPerK, 1e-12));
    check("history helps copy branch", gshareHistory.byFamily.copy.missRate < gshareNoHistory.byFamily.copy.missRate);

    var perceptron = runPredictor(makePerceptron(64, 4), trace, false);
    check("perceptron learns linear copy", perceptron.byFamily.copy.missRate < 0.15);
    check("perceptron struggles with parity", perceptron.byFamily.parity.missRate > perceptron.byFamily.copy.missRate + 0.20);

    var workingSet = branchWorkingSet(trace, smallParams.history, 16);
    check("working set covers contexts", workingSet.contexts >= workingSet.workingSet95 && workingSet.workingSet95 > 0);
    check("working set occupancy is bounded", workingSet.occupiedEntries <= 16 && workingSet.collidingContexts === workingSet.contexts - workingSet.occupiedEntries);
    check("context miss rate is probability", workingSet.contextMissRate >= 0 && workingSet.contextMissRate <= 1);

    var occupancy = tableOccupancy(trace, smallParams.history, 16);
    check("occupancy preserves traffic", occupancy.length === 16 && sum(occupancy) === trace.length);

    var defaultResult = evaluate(baseParams);
    var lowPressure = evaluate(Object.assign({}, baseParams, { entriesExp: 10, decoys: 0, noise: 0 }));
    var noHistoryResult = evaluate(Object.assign({}, baseParams, { history: 0, decoys: 0, noise: 0, entriesExp: 10 }));
    var defaultGshare = defaultResult.stats.filter(function (row) { return row.key === "gshare"; })[0];
    var defaultBimodal = defaultResult.stats.filter(function (row) { return row.key === "bimodal"; })[0];
    var lowGshare = lowPressure.stats.filter(function (row) { return row.key === "gshare"; })[0];
    var lowPerceptron = lowPressure.stats.filter(function (row) { return row.key === "perceptron"; })[0];
    var noHistoryGshare = noHistoryResult.stats.filter(function (row) { return row.key === "gshare"; })[0];
    check("default best predictor is reported", defaultResult.stats.some(function (row) { return row.key === defaultResult.best.key && row.missesPerK === defaultResult.best.missesPerK; }));
    check("default working set aliases table", defaultResult.workingSet.aliasLoad > 1);
    check("default history can hurt under aliasing", defaultGshare.missesPerK > defaultBimodal.missesPerK);
    check("larger clean table lets gshare win", lowPressure.best.key === "gshare" && lowGshare.missesPerK < lowPerceptron.missesPerK);
    check("removing history hurts parity", noHistoryGshare.byFamily.parity.missRate > lowGshare.byFamily.parity.missRate + 0.20);

    var passed = checks.filter(function (item) { return item.passed; }).length;
    return {
      checked: checks.length,
      checks: checks,
      ok: passed === checks.length,
      passed: passed
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatDelta(value) {
    var rounded = Math.round(value);
    return (rounded > 0 ? "+" : "") + String(rounded);
  }

  function metric(label, value) {
    return '<div class="branch-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function familyColor(family) {
    return COLORS[family] || COLORS.muted;
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

  function drawBars(ctx, box, result) {
    panel(ctx, box, "Predictor race", "misses per 1,000 dynamic branches");
    var plot = { x: box.x + 44, y: box.y + 52, w: box.w - 66, h: box.h - 82 };
    var maxValue = Math.max.apply(null, result.stats.map(function (row) { return row.missesPerK; }));
    maxValue = Math.max(100, Math.ceil(maxValue / 100) * 100);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    [0, 0.5, 1].forEach(function (tick) {
      var y = plot.y + plot.h - tick * plot.h;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, String(Math.round(maxValue * tick)), plot.x - 8, y + 4, "right");
    });
    var gap = 12;
    var barW = (plot.w - gap * (result.stats.length - 1)) / result.stats.length;
    result.stats.forEach(function (row, i) {
      var x = plot.x + i * (barW + gap);
      var h = row.missesPerK / maxValue * plot.h;
      ctx.fillStyle = row.color;
      ctx.fillRect(x, plot.y + plot.h - h, barW, h);
      label(ctx, formatNumber(row.missesPerK, 0), x + barW / 2, plot.y + plot.h - h - 6, "center", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, row.key, x + barW / 2, plot.y + plot.h + 17, "center");
    });
  }

  function drawFamilyHeatmap(ctx, box, result) {
    panel(ctx, box, "Where misses come from", "row = predictor, column = branch family");
    var left = box.x + 82;
    var top = box.y + 56;
    var cellW = Math.max(42, (box.w - 102) / FAMILY_ORDER.length);
    var cellH = Math.max(24, (box.h - 82) / result.stats.length);
    FAMILY_ORDER.forEach(function (family, c) {
      label(ctx, family, left + c * cellW + cellW / 2, top - 10, "center", COLORS.muted, "700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
    result.stats.forEach(function (row, r) {
      label(ctx, row.key, left - 10, top + r * cellH + cellH * 0.62, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      FAMILY_ORDER.forEach(function (family, c) {
        var cell = row.byFamily[family];
        var miss = cell.missRate || 0;
        var alpha = 0.08 + 0.72 * Math.sqrt(miss);
        ctx.fillStyle = "rgba(190,18,60," + alpha.toFixed(3) + ")";
        ctx.fillRect(left + c * cellW, top + r * cellH, cellW - 4, cellH - 4);
        label(ctx, formatPct(miss, 0), left + c * cellW + (cellW - 4) / 2, top + r * cellH + cellH * 0.62, "center", miss > 0.48 ? "#ffffff" : COLORS.text, "700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      });
    });
  }

  function drawWorkingSet(ctx, box, result) {
    panel(ctx, box, "Branch working set", "contexts are PC plus recent global history");
    var rows = [
      ["table entries", String(result.entries)],
      ["unique contexts", String(result.workingSet.contexts)],
      ["95% working set", String(result.workingSet.workingSet95)],
      ["context floor", formatNumber(result.workingSet.contextMissRate * 1000, 0) + " misses/k"],
      ["alias load", formatNumber(result.workingSet.aliasLoad, 2) + "x"],
      ["max bucket", String(result.workingSet.maxBucket)]
    ];
    var y = box.y + 58;
    rows.forEach(function (row) {
      label(ctx, row[0], box.x + 14, y, "left", COLORS.muted);
      label(ctx, row[1], box.x + box.w - 14, y, "right", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      y += 24;
    });

    var counts = result.occupancy;
    var gridTop = box.y + box.h - 94;
    var gridLeft = box.x + 14;
    var gridW = box.w - 28;
    var columns = Math.min(32, counts.length);
    var rowsCount = Math.ceil(counts.length / columns);
    var cell = Math.min(12, Math.floor(gridW / columns));
    var max = Math.max.apply(null, counts);
    label(ctx, "gshare table traffic", gridLeft, gridTop - 10, "left", COLORS.muted, "700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    for (var i = 0; i < counts.length; i += 1) {
      var c = i % columns;
      var r = Math.floor(i / columns);
      var intensity = max <= 0 ? 0 : counts[i] / max;
      ctx.fillStyle = "rgba(15,118,110," + (0.08 + 0.82 * Math.sqrt(intensity)).toFixed(3) + ")";
      ctx.fillRect(gridLeft + c * cell, gridTop + r * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
    }
  }

  function drawTimeline(ctx, box, result) {
    panel(ctx, box, "One gshare trace slice", "color = branch family, red mark = gshare miss");
    var timeline = result.stats.filter(function (row) { return row.key === "gshare"; })[0].timeline;
    var left = box.x + 14;
    var top = box.y + 54;
    var width = box.w - 28;
    var cell = Math.max(5, Math.floor(width / 60));
    var columns = Math.max(30, Math.floor(width / cell));
    for (var i = 0; i < timeline.length; i += 1) {
      var x = left + (i % columns) * cell;
      var y = top + Math.floor(i / columns) * cell;
      if (y > box.y + box.h - 18) break;
      ctx.fillStyle = familyColor(timeline[i].family);
      ctx.globalAlpha = timeline[i].outcome ? 0.9 : 0.32;
      ctx.fillRect(x, y, cell - 1, cell - 1);
      ctx.globalAlpha = 1;
      if (timeline[i].miss) {
        ctx.fillStyle = COLORS.miss;
        ctx.fillRect(x + Math.max(1, cell - 3), y, 2, cell - 1);
      }
    }
    var legendX = left;
    FAMILY_ORDER.forEach(function (family) {
      ctx.fillStyle = familyColor(family);
      ctx.fillRect(legendX, box.y + box.h - 20, 9, 9);
      label(ctx, family, legendX + 13, box.y + box.h - 12);
      legendX += 70;
    });
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var parent = canvas.parentElement || canvas;
    var width = Math.max(320, parent.clientWidth - 2);
    var compact = width < 680;
    var height = compact ? 1050 : 540;
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
      drawBars(ctx, { x: m, y: 12, w: panelW, h: 220 }, result);
      drawFamilyHeatmap(ctx, { x: m, y: 248, w: panelW, h: 240 }, result);
      drawWorkingSet(ctx, { x: m, y: 504, w: panelW, h: 270 }, result);
      drawTimeline(ctx, { x: m, y: 790, w: panelW, h: 240 }, result);
    } else {
      var gap = 16;
      var leftW = Math.round((width - gap - 24) * 0.56);
      var rightW = width - 24 - gap - leftW;
      drawBars(ctx, { x: 12, y: 12, w: leftW, h: 270 }, result);
      drawWorkingSet(ctx, { x: 12 + leftW + gap, y: 12, w: rightW, h: 270 }, result);
      drawFamilyHeatmap(ctx, { x: 12, y: 300, w: leftW, h: 220 }, result);
      drawTimeline(ctx, { x: 12 + leftW + gap, y: 300, w: rightW, h: 220 }, result);
    }
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-value]").forEach(function (node) {
      var key = node.getAttribute("data-value");
      if (key === "entries") node.textContent = String(1 << params.entriesExp);
      else if (key === "history") node.textContent = String(params.history);
      else if (key === "blocks") node.textContent = String(params.blocks);
      else if (key === "noise") node.textContent = params.noise + "%";
      else if (key === "decoys") node.textContent = String(params.decoys);
      else if (key === "loopPeriod") node.textContent = String(params.loopPeriod);
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
    updateOutputs(container, params);
    var result = evaluate(params);
    var audit = cachedAudit();
    var metrics = container.querySelector("[data-metrics]");
    var bimodal = result.stats.filter(function (row) { return row.key === "bimodal"; })[0];
    var gshare = result.stats.filter(function (row) { return row.key === "gshare"; })[0];
    var perceptron = result.stats.filter(function (row) { return row.key === "perceptron"; })[0];
    if (metrics) {
      metrics.innerHTML = [
        metric("best predictor", result.best.key),
        metric("best miss/k", formatNumber(result.best.missesPerK, 0)),
        metric("context floor", formatNumber(result.workingSet.contextMissRate * 1000, 0)),
        metric("95% contexts", String(result.workingSet.workingSet95)),
        metric("gshare - bimodal", formatDelta(gshare.missesPerK - bimodal.missesPerK)),
        metric("perc - gshare", formatDelta(perceptron.missesPerK - gshare.missesPerK)),
        metric("Audit", audit.passed + "/" + audit.checked)
      ].join("");
    }
    var canvas = container.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
    container.__branchPredictorResult = result;
  }

  function mount(container) {
    if (container.__branchPredictorMounted) return;
    container.__branchPredictorMounted = true;
    container.querySelectorAll("[data-param]").forEach(function (node) {
      node.addEventListener("input", function () { render(container); });
      node.addEventListener("change", function () { render(container); });
    });
    render(container);
    root.addEventListener("resize", function () { render(container); });
  }

  function mountAll() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-branch-predictor-lab]").forEach(mount);
  }

  var api = {
    branchWorkingSet: branchWorkingSet,
    cleanParams: cleanParams,
    evaluate: evaluate,
    generateTrace: generateTrace,
    hashInt: hashInt,
    makeBimodal: makeBimodal,
    makeGshare: makeGshare,
    makePerceptron: makePerceptron,
    runAudit: runAudit,
    runPredictor: runPredictor,
    tableOccupancy: tableOccupancy
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.BranchPredictorLab = api;

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", mountAll);
    } else {
      mountAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
