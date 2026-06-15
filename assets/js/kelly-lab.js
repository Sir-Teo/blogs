(function (global) {
  var COLORS = {
    rawFull: "#b45309",
    rawHalf: "#7c3aed",
    calibrated: "#0f766e",
    guarded: "#2563eb",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5"
  };
  var AUDIT_CACHE = null;

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

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sigmoid(x) {
    if (x > 35) return 1;
    if (x < -35) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function makeEvent(rand, params) {
    var trueLogit = normal(rand) * (params.edge / 100);
    var trueP = sigmoid(trueLogit);
    var scoreLogit = trueLogit + normal(rand) * 0.24;
    var rawLogit = scoreLogit * (params.overconfidence / 100);
    var rawP = sigmoid(rawLogit);
    return {
      trueP: trueP,
      rawLogit: rawLogit,
      rawP: rawP,
      outcome: rand() < trueP ? 1 : 0
    };
  }

  function logLoss(data, slope) {
    var eps = 1e-6;
    return data.reduce(function (sum, event) {
      var p = clamp(sigmoid(slope * event.rawLogit), eps, 1 - eps);
      return sum - event.outcome * Math.log(p) - (1 - event.outcome) * Math.log(1 - p);
    }, 0) / Math.max(1, data.length);
  }

  function fitCalibrationSlope(data) {
    var bestSlope = 1;
    var bestLoss = Infinity;
    for (var i = 15; i <= 140; i += 1) {
      var slope = i / 100;
      var loss = logLoss(data, slope);
      if (loss < bestLoss) {
        bestLoss = loss;
        bestSlope = slope;
      }
    }
    return bestSlope;
  }

  function ece(data, probabilityFn) {
    var bins = Array.from({ length: 10 }, function () {
      return { n: 0, p: 0, y: 0 };
    });
    data.forEach(function (event) {
      var p = clamp(probabilityFn(event), 0, 1);
      var index = Math.min(9, Math.floor(p * 10));
      bins[index].n += 1;
      bins[index].p += p;
      bins[index].y += event.outcome;
    });
    return bins.reduce(function (sum, bin) {
      if (!bin.n) return sum;
      return sum + (bin.n / data.length) * Math.abs(bin.p / bin.n - bin.y / bin.n);
    }, 0);
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = (sorted.length - 1) * q;
    var lo = Math.floor(index);
    var hi = Math.ceil(index);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - index) + sorted[hi] * (index - lo);
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function sideProbability(event, slope, source) {
    var modelP = source === "raw" ? event.rawP : sigmoid(slope * event.rawLogit);
    return modelP >= 0.5
      ? { p: modelP, side: 1 }
      : { p: 1 - modelP, side: 0 };
  }

  function guardedProbability(p, calibrationSize) {
    var nEff = Math.max(30, calibrationSize / 4);
    var reserve = 0.7 * Math.sqrt((p * (1 - p)) / nEff) + 0.004;
    return Math.max(0.5, p - reserve);
  }

  function kellyFraction(p, cap) {
    return clamp(2 * p - 1, 0, cap);
  }

  function evaluatePath(events, strategy, slope, params) {
    var wealth = 1;
    var peak = 1;
    var maxDrawdown = 0;
    var trades = 0;
    events.forEach(function (event) {
      var selected = strategy.source === "raw"
        ? sideProbability(event, slope, "raw")
        : sideProbability(event, slope, "calibrated");
      var p = strategy.guarded ? guardedProbability(selected.p, params.calibration) : selected.p;
      var fraction = kellyFraction(p, params.cap / 100) * strategy.multiplier;
      if (fraction > 0.001) trades += 1;
      var won = selected.side ? event.outcome === 1 : event.outcome === 0;
      wealth *= won ? 1 + fraction : 1 - fraction;
      peak = Math.max(peak, wealth);
      maxDrawdown = Math.max(maxDrawdown, 1 - wealth / peak);
    });
    return {
      wealth: wealth,
      logGrowth: Math.log(Math.max(wealth, 1e-12)) / events.length,
      maxDrawdown: maxDrawdown,
      tradeRate: trades / events.length
    };
  }

  function summarize(results) {
    return {
      q05: quantile(results.map(function (row) { return row.wealth; }), 0.05),
      q25: quantile(results.map(function (row) { return row.wealth; }), 0.25),
      median: quantile(results.map(function (row) { return row.wealth; }), 0.5),
      q75: quantile(results.map(function (row) { return row.wealth; }), 0.75),
      q95: quantile(results.map(function (row) { return row.wealth; }), 0.95),
      medianDrawdown: quantile(results.map(function (row) { return row.maxDrawdown; }), 0.5),
      logGrowthPer100: mean(results.map(function (row) { return row.logGrowth; })) * 100,
      tradeRate: mean(results.map(function (row) { return row.tradeRate; }))
    };
  }

  function evaluate(params) {
    var seed = 20260612
      + params.overconfidence * 11
      + params.calibration * 17
      + params.edge * 23
      + params.cap * 31;
    var rand = rng(seed);
    var calibrationData = [];
    var diagnosticData = [];
    for (var i = 0; i < params.calibration; i += 1) {
      calibrationData.push(makeEvent(rand, params));
    }
    for (var j = 0; j < 1200; j += 1) {
      diagnosticData.push(makeEvent(rand, params));
    }

    var slope = fitCalibrationSlope(calibrationData);
    var rawEce = ece(diagnosticData, function (event) { return event.rawP; });
    var calibratedEce = ece(diagnosticData, function (event) {
      return sigmoid(slope * event.rawLogit);
    });
    var strategies = [
      { key: "rawFull", label: "Raw full", source: "raw", multiplier: 1, guarded: false, color: COLORS.rawFull },
      { key: "rawHalf", label: "Raw half", source: "raw", multiplier: 0.5, guarded: false, color: COLORS.rawHalf },
      { key: "calibrated", label: "Calibrated", source: "calibrated", multiplier: 1, guarded: false, color: COLORS.calibrated },
      { key: "guarded", label: "Guarded", source: "calibrated", multiplier: 1, guarded: true, color: COLORS.guarded }
    ];
    var results = {};
    strategies.forEach(function (strategy) {
      results[strategy.key] = [];
    });

    for (var path = 0; path < 360; path += 1) {
      var events = [];
      for (var bet = 0; bet < 260; bet += 1) {
        events.push(makeEvent(rand, params));
      }
      strategies.forEach(function (strategy) {
        results[strategy.key].push(evaluatePath(events, strategy, slope, params));
      });
    }

    return {
      slope: slope,
      rawEce: rawEce,
      calibratedEce: calibratedEce,
      summaries: strategies.map(function (strategy) {
        return Object.assign({ key: strategy.key, label: strategy.label, color: strategy.color }, summarize(results[strategy.key]));
      })
    };
  }

  function close(left, right, tolerance) {
    return Math.abs(left - right) <= tolerance;
  }

  function probability(value) {
    return Number.isFinite(value) && value >= 0 && value <= 1;
  }

  function logit(p) {
    return Math.log(p / (1 - p));
  }

  function runAudit() {
    var checked = 0;
    var passed = 0;
    var failures = [];

    function record(name, ok, details) {
      checked += 1;
      if (ok) {
        passed += 1;
      } else if (failures.length < 8) {
        failures.push({ name: name, details: details || "" });
      }
    }

    record("sigmoid midpoint", sigmoid(0) === 0.5);
    record("sigmoid upper clamp", sigmoid(40) === 1);
    record("sigmoid lower clamp", sigmoid(-40) === 0);
    record("clamp bounds", clamp(5, 0, 3) === 3 && clamp(-1, 0, 3) === 0 && clamp(2, 0, 3) === 2);

    record("even-money Kelly formula", close(kellyFraction(0.6, 1), 0.2, 1e-12));
    record("Kelly does not short negative edge", kellyFraction(0.49, 1) === 0);
    record("Kelly cap binds", kellyFraction(0.8, 0.25) === 0.25);

    var guardedSmall = guardedProbability(0.62, 120);
    var guardedLarge = guardedProbability(0.62, 2400);
    record("guarded probability stays conservative", guardedSmall >= 0.5 && guardedSmall < 0.62);
    record("larger calibration sample relaxes guard", guardedLarge > guardedSmall && guardedLarge < 0.62);

    var rawLong = sideProbability({ rawP: 0.7, rawLogit: logit(0.7) }, 1, "raw");
    var rawShort = sideProbability({ rawP: 0.3, rawLogit: logit(0.3) }, 1, "raw");
    var calibratedLong = sideProbability({ rawP: 0.7, rawLogit: logit(0.7) }, 0.5, "calibrated");
    record("sideProbability chooses long side", rawLong.side === 1 && close(rawLong.p, 0.7, 1e-12));
    record("sideProbability chooses short side", rawShort.side === 0 && close(rawShort.p, 0.7, 1e-12));
    record("calibration slope shrinks confidence", calibratedLong.side === 1 && calibratedLong.p < rawLong.p && calibratedLong.p > 0.5);

    var toyEvents = [
      { rawP: 0.6, rawLogit: logit(0.6), outcome: 1 },
      { rawP: 0.6, rawLogit: logit(0.6), outcome: 0 }
    ];
    var fullPath = evaluatePath(toyEvents, { source: "raw", multiplier: 1, guarded: false }, 1, { cap: 100, calibration: 800 });
    var halfPath = evaluatePath(toyEvents, { source: "raw", multiplier: 0.5, guarded: false }, 1, { cap: 100, calibration: 800 });
    record("path wealth multiplication", close(fullPath.wealth, 0.96, 1e-12));
    record("path log growth", close(fullPath.logGrowth, Math.log(0.96) / 2, 1e-12));
    record("path drawdown from peak", close(fullPath.maxDrawdown, 0.2, 1e-12));
    record("path trade rate", fullPath.tradeRate === 1);
    record("half Kelly changes exposure", close(halfPath.wealth, 0.99, 1e-12));

    var cappedPath = evaluatePath([{ rawP: 0.8, rawLogit: logit(0.8), outcome: 1 }], { source: "raw", multiplier: 1, guarded: false }, 1, { cap: 25, calibration: 800 });
    record("position cap applies to path", close(cappedPath.wealth, 1.25, 1e-12));

    var calibrationToy = [
      { rawP: 0.8, rawLogit: logit(0.8), outcome: 1 },
      { rawP: 0.8, rawLogit: logit(0.8), outcome: 1 },
      { rawP: 0.2, rawLogit: logit(0.2), outcome: 0 },
      { rawP: 0.2, rawLogit: logit(0.2), outcome: 0 }
    ];
    record("log loss favors informative slope", logLoss(calibrationToy, 1) < logLoss(calibrationToy, 0.15));
    record("ECE is bounded", probability(ece(calibrationToy, function (event) { return event.rawP; })));
    record("quantile interpolation", quantile([1, 3], 0.5) === 2);

    var summary = summarize([
      { wealth: 1, maxDrawdown: 0.1, logGrowth: 0.01, tradeRate: 0.5 },
      { wealth: 3, maxDrawdown: 0.3, logGrowth: 0.03, tradeRate: 0.7 },
      { wealth: 5, maxDrawdown: 0.5, logGrowth: 0.05, tradeRate: 0.9 }
    ]);
    record("summary quantiles ordered", summary.q05 <= summary.q25 && summary.q25 <= summary.median && summary.median <= summary.q75 && summary.q75 <= summary.q95);
    record("summary mean log growth", close(summary.logGrowthPer100, 3, 1e-12));
    record("summary trade rate", close(summary.tradeRate, 0.7, 1e-12));

    function auditEvaluation(name, params) {
      var result = evaluate(params);
      var keys = result.summaries.map(function (row) { return row.key; }).join(",");
      record(name + " strategy keys", keys === "rawFull,rawHalf,calibrated,guarded");
      record(name + " ECE bounded", probability(result.rawEce) && probability(result.calibratedEce));
      record(name + " slope bounded", Number.isFinite(result.slope) && result.slope >= 0.15 && result.slope <= 1.4);
      result.summaries.forEach(function (row) {
        record(name + " " + row.key + " wealth quantiles ordered", row.q05 <= row.q25 && row.q25 <= row.median && row.median <= row.q75 && row.q75 <= row.q95);
        record(name + " " + row.key + " drawdown bounded", probability(row.medianDrawdown));
        record(name + " " + row.key + " trade rate bounded", probability(row.tradeRate));
        record(name + " " + row.key + " finite growth", Number.isFinite(row.logGrowthPer100));
      });
      return result;
    }

    var defaults = { overconfidence: 180, calibration: 800, edge: 32, cap: 25 };
    var first = auditEvaluation("default", defaults);
    var second = evaluate(defaults);
    record("evaluate deterministic slope", first.slope === second.slope);
    record("evaluate deterministic summary", first.summaries[0].q05 === second.summaries[0].q05);
    record("default calibration improves ECE", first.calibratedEce < first.rawEce);
    record("default slope shrinks overconfidence", first.slope < 1);
    var rawFull = first.summaries.find(function (row) { return row.key === "rawFull"; });
    var guarded = first.summaries.find(function (row) { return row.key === "guarded"; });
    record("guarded improves lower tail in default", guarded.q05 > rawFull.q05);
    record("guarded drawdown no worse than raw full", guarded.medianDrawdown <= rawFull.medianDrawdown);

    var lowConfidence = auditEvaluation("lower overconfidence", { overconfidence: 120, calibration: 1200, edge: 32, cap: 25 });
    record("lower overconfidence still calibrates", lowConfidence.calibratedEce <= lowConfidence.rawEce + 0.01);

    return {
      checked: checked,
      failures: failures,
      ok: failures.length === 0,
      passed: passed
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function formatPercent(value) {
    return (value * 100).toFixed(1) + "%";
  }

  function formatPoints(value) {
    return (value * 100).toFixed(1) + " pp";
  }

  function formatWealth(value) {
    if (value >= 10) return "$" + value.toFixed(0);
    if (value >= 1) return "$" + value.toFixed(2);
    return "$" + value.toFixed(3);
  }

  function metric(label, value) {
    return '<div class="kelly-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawChart(canvas, summaries) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var height = 360;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    var left = width < 520 ? 48 : 64;
    var right = 18;
    var top = 30;
    var bottom = 78;
    var chartWidth = width - left - right;
    var chartHeight = height - top - bottom;
    var minObserved = Math.min.apply(null, summaries.map(function (row) { return row.q05; }));
    var maxObserved = Math.max.apply(null, summaries.map(function (row) { return row.q95; }));
    var minValue = Math.max(0.04, Math.min(1, minObserved) * 0.82);
    var maxValue = Math.max(1.15, maxObserved * 1.18);
    var minLog = Math.log(minValue);
    var maxLog = Math.log(maxValue);

    function yFor(value) {
      var safeValue = clamp(value, minValue, maxValue);
      return top + (maxLog - Math.log(safeValue)) / (maxLog - minLog) * chartHeight;
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + chartHeight);
    ctx.lineTo(width - right, top + chartHeight);
    ctx.stroke();

    var ticks = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128];
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ticks.forEach(function (tick) {
      if (tick < minValue || tick > maxValue) return;
      var y = yFor(tick);
      ctx.strokeStyle = tick === 1 ? "#94a3b8" : "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillStyle = tick === 1 ? COLORS.text : COLORS.muted;
      ctx.fillText(formatWealth(tick), left - 8, y);
    });

    var spacing = chartWidth / summaries.length;
    summaries.forEach(function (row, index) {
      var x = left + spacing * index + spacing / 2;
      var boxWidth = Math.min(56, spacing * 0.45);
      var y05 = yFor(row.q05);
      var y25 = yFor(row.q25);
      var y50 = yFor(row.median);
      var y75 = yFor(row.q75);
      var y95 = yFor(row.q95);

      ctx.strokeStyle = row.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y05);
      ctx.lineTo(x, y95);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - boxWidth * 0.35, y05);
      ctx.lineTo(x + boxWidth * 0.35, y05);
      ctx.moveTo(x - boxWidth * 0.35, y95);
      ctx.lineTo(x + boxWidth * 0.35, y95);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 2;
      ctx.fillRect(x - boxWidth / 2, y75, boxWidth, y25 - y75);
      ctx.strokeRect(x - boxWidth / 2, y75, boxWidth, y25 - y75);

      ctx.fillStyle = row.color;
      ctx.beginPath();
      ctx.arc(x, y50, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.text;
      ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(formatWealth(row.median), x, y50 - 8);

      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textBaseline = "top";
      var label = width < 520 ? row.label.replace(" ", "\n") : row.label;
      if (label.indexOf("\n") >= 0) {
        label.split("\n").forEach(function (line, lineIndex) {
          ctx.fillText(line, x, top + chartHeight + 16 + lineIndex * 14);
        });
      } else {
        ctx.fillText(label, x, top + chartHeight + 18);
      }
    });
  }

  function renderLab(lab) {
    var params = {
      overconfidence: Number(lab.querySelector('[data-param="overconfidence"]').value),
      calibration: Number(lab.querySelector('[data-param="calibration"]').value),
      edge: Number(lab.querySelector('[data-param="edge"]').value),
      cap: Number(lab.querySelector('[data-param="cap"]').value)
    };
    lab.querySelector('[data-value="overconfidence"]').textContent = params.overconfidence + "%";
    lab.querySelector('[data-value="calibration"]').textContent = params.calibration.toLocaleString();
    lab.querySelector('[data-value="edge"]').textContent = String(params.edge);
    lab.querySelector('[data-value="cap"]').textContent = params.cap + "%";

    var result = evaluate(params);
    var audit = cachedAudit();
    var rawFull = result.summaries.find(function (row) { return row.key === "rawFull"; });
    var guarded = result.summaries.find(function (row) { return row.key === "guarded"; });
    lab.querySelector("[data-metrics]").innerHTML = [
      metric("Calibration slope", result.slope.toFixed(2)),
      metric("Raw ECE", formatPoints(result.rawEce)),
      metric("Calibrated ECE", formatPoints(result.calibratedEce)),
      metric("Raw Kelly 5% wealth", formatWealth(rawFull.q05)),
      metric("Guarded median drawdown", formatPercent(guarded.medianDrawdown)),
      metric("Guarded trade rate", formatPercent(guarded.tradeRate)),
      metric("Audit", audit.passed + "/" + audit.checked)
    ].join("");
    drawChart(lab.querySelector("[data-canvas]"), result.summaries);
  }

  function init() {
    if (!global.document) return;
    var labs = Array.prototype.slice.call(global.document.querySelectorAll("[data-kelly-lab]"));
    labs.forEach(function (lab) {
      if (lab.__kellyLabReady) return;
      lab.__kellyLabReady = true;
      var render = function () {
        renderLab(lab);
      };
      Array.prototype.slice.call(lab.querySelectorAll("input")).forEach(function (input) {
        input.addEventListener("input", render);
      });
      global.addEventListener("resize", render);
      render();
    });
  }

  var api = {
    evaluate: evaluate,
    guardedProbability: guardedProbability,
    kellyFraction: kellyFraction,
    runAudit: runAudit
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.KellyLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
}(typeof window !== "undefined" ? window : globalThis));
