(function (global) {
  "use strict";

  var COLORS = {
    backtest: "#0f766e",
    live: "#b45309",
    fdr: "#2563eb",
    selection: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5"
  };

  var DEFAULTS = {
    strategies: 400,
    years: 6,
    edgeRate: 4,
    edgeSharpe: 70,
    correlation: 35,
    liveDrag: 20
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numberParam(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      strategies: Math.round(clamp(numberParam(raw, "strategies"), 20, 2000)),
      years: Math.round(clamp(numberParam(raw, "years"), 2, 20)),
      edgeRate: Math.round(clamp(numberParam(raw, "edgeRate"), 0, 25)),
      edgeSharpe: Math.round(clamp(numberParam(raw, "edgeSharpe"), 20, 140)),
      correlation: Math.round(clamp(numberParam(raw, "correlation"), 0, 80)),
      liveDrag: Math.round(clamp(numberParam(raw, "liveDrag"), 0, 80))
    };
  }

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

  function normalCdf(x) {
    var sign = x < 0 ? -1 : 1;
    var z = Math.abs(x) / Math.sqrt(2);
    var t = 1 / (1 + 0.3275911 * z);
    var a1 = 0.254829592;
    var a2 = -0.284496736;
    var a3 = 1.421413741;
    var a4 = -1.453152027;
    var a5 = 1.061405429;
    var erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1 + sign * erf);
  }

  function oneSidedP(z) {
    return clamp(1 - normalCdf(z), 0, 1);
  }

  function formatSharpe(value) {
    if (!isFinite(value)) return "n/a";
    return (value >= 0 ? "+" : "") + value.toFixed(2);
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "0.0%";
    return (value * 100).toFixed(1) + "%";
  }

  function makeCandidate(rand, params, shocks, index) {
    params = cleanParams(params);
    var edgeRate = params.edgeRate / 100;
    var edgeSharpe = params.edgeSharpe / 100;
    var liveDrag = params.liveDrag / 100;
    var rho = params.correlation / 100;
    var years = Math.max(1, params.years);
    var halfYears = Math.max(1, years / 2);
    var seFull = 1 / Math.sqrt(years);
    var seHalf = 1 / Math.sqrt(halfYears);
    var clusterCount = Math.max(1, Math.round(Math.sqrt(params.strategies)));
    var cluster = index % clusterCount;
    var hasEdge = rand() < edgeRate;
    var trueSharpe = hasEdge ? edgeSharpe * (0.65 + 0.7 * rand()) : 0;
    var fullNoise = Math.sqrt(rho) * shocks.full[cluster] + Math.sqrt(1 - rho) * normal(rand);
    var trainNoise = Math.sqrt(rho) * shocks.train[cluster] + Math.sqrt(1 - rho) * normal(rand);
    var validationNoise = Math.sqrt(rho) * shocks.validation[cluster] + Math.sqrt(1 - rho) * normal(rand);
    var backtest = trueSharpe + seFull * fullNoise;
    var train = trueSharpe + seHalf * trainNoise;
    var validation = trueSharpe + seHalf * validationNoise;
    var live = trueSharpe - liveDrag;

    return {
      trueSharpe: trueSharpe,
      live: live,
      backtest: backtest,
      train: train,
      validation: validation,
      z: backtest / seFull,
      p: oneSidedP(backtest / seFull),
      validationP: oneSidedP(validation / seHalf)
    };
  }

  function makeShocks(rand, count) {
    var shocks = [];
    for (var i = 0; i < count; i += 1) {
      shocks.push(normal(rand));
    }
    return shocks;
  }

  function bestBy(rows, key) {
    var best = rows[0];
    for (var i = 1; i < rows.length; i += 1) {
      if (rows[i][key] > best[key]) best = rows[i];
    }
    return best;
  }

  function bhDiscoveries(rows, q) {
    var sorted = rows.slice().sort(function (a, b) { return a.p - b.p; });
    var cutoffIndex = -1;
    for (var i = 0; i < sorted.length; i += 1) {
      if (sorted[i].p <= ((i + 1) / sorted.length) * q) cutoffIndex = i;
    }
    if (cutoffIndex < 0) return [];
    return sorted.slice(0, cutoffIndex + 1);
  }

  function holdoutPick(rows) {
    var researchWinner = bestBy(rows, "train");
    return researchWinner.validationP < 0.05 ? researchWinner : null;
  }

  function makeEmptyPolicy(name, key) {
    return {
      name: name,
      key: key,
      selected: 0,
      falseSelected: 0,
      backtestSum: 0,
      liveSum: 0,
      bestSeenSum: 0
    };
  }

  function record(policy, pick, bestSeen) {
    policy.bestSeenSum += bestSeen.backtest;
    if (!pick) return;
    policy.selected += 1;
    policy.backtestSum += pick.backtest;
    policy.liveSum += pick.live;
    if (pick.live <= 0) policy.falseSelected += 1;
  }

  function finishPolicy(policy, campaigns) {
    return {
      name: policy.name,
      key: policy.key,
      selectedRate: policy.selected / campaigns,
      falseRate: policy.selected ? policy.falseSelected / policy.selected : 0,
      backtest: policy.selected ? policy.backtestSum / policy.selected : 0,
      live: policy.selected ? policy.liveSum / policy.selected : 0,
      bestSeen: policy.bestSeenSum / campaigns
    };
  }

  function evaluate(params) {
    params = cleanParams(params);
    var campaigns = 260;
    var q = 0.10;
    var seed = 20260613
      + params.strategies * 3
      + params.years * 5
      + params.edgeRate * 7
      + params.edgeSharpe * 11
      + params.correlation * 13
      + params.liveDrag * 17;
    var rand = rng(seed);
    var policies = [
      makeEmptyPolicy("Best backtest", "best"),
      makeEmptyPolicy("Nominal p<.05", "nominal"),
      makeEmptyPolicy("Bonferroni", "bonferroni"),
      makeEmptyPolicy("BH FDR", "bh"),
      makeEmptyPolicy("Holdout", "holdout")
    ];

    for (var campaign = 0; campaign < campaigns; campaign += 1) {
      var clusterCount = Math.max(1, Math.round(Math.sqrt(params.strategies)));
      var shocks = {
        full: makeShocks(rand, clusterCount),
        train: makeShocks(rand, clusterCount),
        validation: makeShocks(rand, clusterCount)
      };
      var rows = [];
      for (var i = 0; i < params.strategies; i += 1) {
        rows.push(makeCandidate(rand, params, shocks, i));
      }

      var best = bestBy(rows, "backtest");
      var nominal = best.p < 0.05 ? best : null;
      var bonferroni = best.p < 0.05 / params.strategies ? best : null;
      var bh = bhDiscoveries(rows, q);
      var bhPick = bh.length ? bestBy(bh, "backtest") : null;
      var holdout = holdoutPick(rows);

      record(policies[0], best, best);
      record(policies[1], nominal, best);
      record(policies[2], bonferroni, best);
      record(policies[3], bhPick, best);
      record(policies[4], holdout, best);
    }

    var summary = policies.map(function (policy) {
      return finishPolicy(policy, campaigns);
    });
    var best = summary[0];
    var bonferroni = summary[2];
    var holdout = summary[4];

    return {
      params: params,
      campaigns: campaigns,
      policies: summary,
      headline: {
        bestBacktest: best.backtest,
        bestLive: best.live,
        bestFalse: best.falseRate,
        bonferroniSelection: bonferroni.selectedRate,
        holdoutLive: holdout.live,
        holdoutSelection: holdout.selectedRate
      }
    };
  }

  function close(actual, expected, tolerance) {
    return Math.abs(actual - expected) <= tolerance;
  }

  function finiteNumber(value) {
    return Number.isFinite(value);
  }

  function policyRowsValid(result) {
    return result.policies.every(function (row) {
      return row.selectedRate >= 0 &&
        row.selectedRate <= 1 &&
        row.falseRate >= 0 &&
        row.falseRate <= 1 &&
        ["backtest", "live", "bestSeen"].every(function (key) { return finiteNumber(row[key]); });
    });
  }

  function byKey(result, key) {
    for (var i = 0; i < result.policies.length; i += 1) {
      if (result.policies[i].key === key) return result.policies[i];
    }
    return null;
  }

  function runAudit() {
    var checks = [];
    function check(name, passed, detail) {
      checks.push({ name: name, passed: Boolean(passed), detail: detail || "" });
    }

    var clamped = cleanParams({ strategies: 9999, years: -4, edgeRate: 99, edgeSharpe: -7, correlation: 99, liveDrag: 99 });
    check("parameter clamps", clamped.strategies === 2000 && clamped.years === 2 && clamped.edgeRate === 25 && clamped.edgeSharpe === 20 && clamped.correlation === 80 && clamped.liveDrag === 80);

    var fallback = cleanParams({ strategies: "x", years: "x", edgeRate: "x", edgeSharpe: "x", correlation: "x", liveDrag: "x" });
    check("default fallbacks", Object.keys(DEFAULTS).every(function (key) { return fallback[key] === DEFAULTS[key]; }));

    check("normal CDF symmetry", close(normalCdf(0), 0.5, 1e-8) && close(normalCdf(1.2), 1 - normalCdf(-1.2), 1e-8));
    check("one-sided p monotonicity", oneSidedP(2) < oneSidedP(1) && oneSidedP(-1) > oneSidedP(0));

    var bhRows = [{ p: 0.001 }, { p: 0.02 }, { p: 0.03 }, { p: 0.20 }];
    check("BH step-up cutoff", bhDiscoveries(bhRows, 0.05).length === 3 && bhDiscoveries(bhRows, 0.01).length === 1);

    var defaultA = evaluate(DEFAULTS);
    var defaultB = evaluate(DEFAULTS);
    check("deterministic replay", JSON.stringify(defaultA) === JSON.stringify(defaultB));
    check("campaign count", defaultA.campaigns === 260);
    check("policy set complete", ["best", "nominal", "bonferroni", "bh", "holdout"].every(function (key) { return byKey(defaultA, key); }));
    check("policy rows are finite ledgers", policyRowsValid(defaultA));

    var best = byKey(defaultA, "best");
    var nominal = byKey(defaultA, "nominal");
    var bonferroni = byKey(defaultA, "bonferroni");
    var bh = byKey(defaultA, "bh");
    var holdout = byKey(defaultA, "holdout");
    check("headline matches policies", close(defaultA.headline.bestBacktest, best.backtest, 1e-12) && close(defaultA.headline.bestLive, best.live, 1e-12) && close(defaultA.headline.holdoutLive, holdout.live, 1e-12));
    check("best backtest is optimistic", best.backtest > best.live + 0.9 && best.falseRate > 0.1);
    check("corrections select less often", bonferroni.selectedRate <= nominal.selectedRate && bh.selectedRate <= nominal.selectedRate && holdout.selectedRate <= 1);
    check("holdout improves live relative to best", holdout.live > best.live);

    var smallNull = evaluate({ strategies: 20, years: 6, edgeRate: 0, edgeSharpe: 70, correlation: 35, liveDrag: 20 });
    var largeNull = evaluate({ strategies: 2000, years: 6, edgeRate: 0, edgeSharpe: 70, correlation: 35, liveDrag: 20 });
    check("search family inflates winners", byKey(largeNull, "best").backtest > byKey(smallNull, "best").backtest + 0.55);
    check("null search has negative live after drag", byKey(largeNull, "best").live < 0 && byKey(smallNull, "best").live < 0);

    var shortSample = evaluate({ strategies: 400, years: 2, edgeRate: 0, edgeSharpe: 70, correlation: 35, liveDrag: 20 });
    var longSample = evaluate({ strategies: 400, years: 20, edgeRate: 0, edgeSharpe: 70, correlation: 35, liveDrag: 20 });
    check("longer samples shrink selected noise", byKey(shortSample, "best").backtest > byKey(longSample, "best").backtest);

    var noEdge = evaluate({ strategies: 400, years: 6, edgeRate: 0, edgeSharpe: 70, correlation: 35, liveDrag: 20 });
    var manyEdges = evaluate({ strategies: 400, years: 6, edgeRate: 25, edgeSharpe: 140, correlation: 35, liveDrag: 0 });
    check("real edge improves expected live", byKey(manyEdges, "best").live > byKey(noEdge, "best").live + 0.45);
    check("real edge lowers false discoveries", byKey(manyEdges, "best").falseRate < byKey(noEdge, "best").falseRate);

    var noDrag = evaluate({ strategies: 400, years: 6, edgeRate: 4, edgeSharpe: 70, correlation: 35, liveDrag: 0 });
    var highDrag = evaluate({ strategies: 400, years: 6, edgeRate: 4, edgeSharpe: 70, correlation: 35, liveDrag: 80 });
    check("live drag lowers live Sharpe", byKey(highDrag, "best").live < byKey(noDrag, "best").live - 0.5 && byKey(highDrag, "best").falseRate > byKey(noDrag, "best").falseRate);

    var independent = evaluate({ strategies: 400, years: 6, edgeRate: 0, edgeSharpe: 70, correlation: 0, liveDrag: 20 });
    var correlated = evaluate({ strategies: 400, years: 6, edgeRate: 0, edgeSharpe: 70, correlation: 80, liveDrag: 20 });
    check("correlation reduces effective search", byKey(independent, "best").backtest > byKey(correlated, "best").backtest);

    var failures = checks.filter(function (item) { return !item.passed; });
    return {
      ok: failures.length === 0,
      passed: checks.length - failures.length,
      checked: checks.length,
      failures: failures,
      checks: checks
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function metric(label, value) {
    return '<div class="backtest-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawChart(canvas, result) {
    var rows = result.policies;
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var height = 430;
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

    var left = width < 540 ? 46 : 60;
    var right = width < 540 ? 24 : 36;
    var top = 32;
    var sharpeHeight = 210;
    var lowerTop = 296;
    var lowerHeight = 92;
    var plotWidth = width - left - right;
    var groupWidth = plotWidth / rows.length;
    var barWidth = Math.max(10, Math.min(22, groupWidth / 4.6));
    var maxAbsSharpe = Math.max.apply(null, rows.map(function (row) {
      return Math.max(Math.abs(row.backtest), Math.abs(row.live));
    }));
    maxAbsSharpe = Math.max(0.45, maxAbsSharpe * 1.25);
    var zeroY = top + sharpeHeight * 0.62;

    function sharpeY(value) {
      return zeroY - (value / maxAbsSharpe) * (sharpeHeight * 0.46);
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + sharpeHeight);
    ctx.lineTo(width - right, top + sharpeHeight);
    ctx.stroke();

    ctx.strokeStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.moveTo(left, zeroY);
    ctx.lineTo(width - right, zeroY);
    ctx.stroke();

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Average selected Sharpe", left, top - 9);

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [-maxAbsSharpe, 0, maxAbsSharpe].forEach(function (tick) {
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(tick.toFixed(1), left - 8, sharpeY(tick));
    });

    rows.forEach(function (row, index) {
      var center = left + index * groupWidth + groupWidth / 2;
      [
        { value: row.backtest, color: COLORS.backtest, offset: -barWidth * 0.62 },
        { value: row.live, color: COLORS.live, offset: barWidth * 0.62 }
      ].forEach(function (bar) {
        var y = sharpeY(bar.value);
        var barTop = Math.min(y, zeroY);
        var barHeight = Math.max(2, Math.abs(zeroY - y));
        ctx.fillStyle = bar.color;
        ctx.fillRect(center + bar.offset - barWidth / 2, barTop, barWidth, barHeight);
      });

      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.save();
      ctx.translate(center, top + sharpeHeight + 20);
      if (width < 600) {
        ctx.rotate(-Math.PI / 5);
        ctx.textAlign = "right";
      }
      ctx.fillText(row.name, 0, 0);
      ctx.restore();
    });

    function lowerX(rate) {
      return left + rate * plotWidth;
    }

    function lowerY(index) {
      return lowerTop + 16 + index * (lowerHeight / rows.length);
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, lowerTop);
    ctx.lineTo(left, lowerTop + lowerHeight);
    ctx.lineTo(width - right, lowerTop + lowerHeight);
    ctx.stroke();

    [0, 0.5, 1].forEach(function (tick) {
      var x = lowerX(tick);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(x, lowerTop);
      ctx.lineTo(x, lowerTop + lowerHeight);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(Math.round(tick * 100)) + "%", x, lowerTop + lowerHeight + 8);
    });

    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("Selection rate and false discoveries", left, lowerTop - 10);

    rows.forEach(function (row, index) {
      var y = lowerY(index);
      var selectionX = lowerX(row.selectedRate);
      var falseX = lowerX(row.falseRate);
      var shortLabels = {
        best: "Best",
        nominal: "Nom",
        bonferroni: "Bonf",
        bh: "BH",
        holdout: "Hold"
      };
      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();

      ctx.fillStyle = COLORS.selection;
      ctx.beginPath();
      ctx.arc(selectionX, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.fdr;
      ctx.beginPath();
      ctx.arc(falseX, y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(shortLabels[row.key] || row.name, left - 8, y);
    });
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    params = cleanParams(params);

    var result = evaluate(params);
    var values = {
      strategies: String(params.strategies),
      years: String(params.years),
      edgeRate: params.edgeRate + "%",
      edgeSharpe: (params.edgeSharpe / 100).toFixed(2),
      correlation: params.correlation + "%",
      liveDrag: (params.liveDrag / 100).toFixed(2)
    };

    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    var audit = cachedAudit();
    if (metrics) {
      metrics.innerHTML = [
        metric("Best backtest SR", formatSharpe(result.headline.bestBacktest)),
        metric("Best expected live SR", formatSharpe(result.headline.bestLive)),
        metric("Best false discoveries", formatPercent(result.headline.bestFalse)),
        metric("Bonferroni selection", formatPercent(result.headline.bonferroniSelection)),
        metric("Holdout live SR", formatSharpe(result.headline.holdoutLive)),
        metric("Holdout selection", formatPercent(result.headline.holdoutSelection)),
        metric("Audit", audit.passed + "/" + audit.checked)
      ].join("");
    }

    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    if (root.__backtestLabReady) return;
    root.__backtestLabReady = true;
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    window.addEventListener("resize", redraw);
    redraw();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-backtest-lab]").forEach(init);
      });
    } else {
      document.querySelectorAll("[data-backtest-lab]").forEach(init);
    }
  }

  global.BacktestLab = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    normalCdf: normalCdf,
    oneSidedP: oneSidedP,
    runAudit: runAudit
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.BacktestLab;
  }
}(typeof window !== "undefined" ? window : globalThis));
