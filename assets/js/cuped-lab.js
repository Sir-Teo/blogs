(function (global) {
  "use strict";

  var COLORS = {
    unadjusted: "#64748b",
    cuped: "#0f766e",
    bad: "#be123c",
    trueLift: "#7c3aed",
    xdiff: "#d97706",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    band: "#dbeafe"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(3);
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="cuped-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
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
    var u1 = Math.max(1e-12, uniform(index * 2, seed));
    var u2 = uniform(index * 2 + 1, seed);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function variance(values) {
    if (values.length < 2) return 0;
    var m = mean(values);
    return values.reduce(function (sum, value) {
      var d = value - m;
      return sum + d * d;
    }, 0) / (values.length - 1);
  }

  function covariance(a, b) {
    if (a.length < 2) return 0;
    var ma = mean(a);
    var mb = mean(b);
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += (a[i] - ma) * (b[i] - mb);
    return sum / (a.length - 1);
  }

  function correlation(a, b) {
    var va = variance(a);
    var vb = variance(b);
    if (va <= 0 || vb <= 0) return 0;
    return covariance(a, b) / Math.sqrt(va * vb);
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var position = (sorted.length - 1) * q;
    var lower = Math.floor(position);
    var upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function splitByArm(rows, field, arm) {
    var out = [];
    rows.forEach(function (row) {
      if (row.treatment === arm) out.push(row[field]);
    });
    return out;
  }

  function difference(rows, field) {
    var t = splitByArm(rows, field, 1);
    var c = splitByArm(rows, field, 0);
    return mean(t) - mean(c);
  }

  function seDifference(rows, field) {
    var t = splitByArm(rows, field, 1);
    var c = splitByArm(rows, field, 0);
    return Math.sqrt(variance(t) / Math.max(1, t.length) + variance(c) / Math.max(1, c.length));
  }

  function runTrial(params, trialIndex) {
    var nArm = Math.max(50, Math.round(params.usersPerArm));
    var total = nArm * 2;
    var rho = clamp(params.correlation / 100, 0, 0.98);
    var coverage = clamp(params.coverage / 100, 0, 1);
    var lift = params.trueLift;
    var leakage = params.leakage / 100;
    var rows = [];
    var yValues = [];
    var preValues = [];
    var badValues = [];
    var seed = 0x20260613 ^ Math.imul(trialIndex + 1, 0x45d9f3b);

    for (var i = 0; i < total; i += 1) {
      var treatment = i < nArm ? 0 : 1;
      var xRaw = normal(i + 17, seed ^ 0x51f15eed);
      var eps = normal(i + 409, seed ^ 0x9e3779b9);
      var y0 = rho * xRaw + Math.sqrt(Math.max(0, 1 - rho * rho)) * eps;
      var y = y0 + treatment * lift;
      var hasPre = uniform(i + 811, seed ^ 0xbadc0de) < coverage;
      var x = hasPre ? xRaw : 0;
      var xBad = x + treatment * lift * leakage;
      rows.push({ treatment: treatment, y: y, x: x, xBad: xBad, hasPre: hasPre });
      yValues.push(y);
      preValues.push(x);
      badValues.push(xBad);
    }

    var theta = covariance(yValues, preValues) / Math.max(1e-12, variance(preValues));
    var thetaBad = covariance(yValues, badValues) / Math.max(1e-12, variance(badValues));
    var xMean = mean(preValues);
    var xBadMean = mean(badValues);
    rows.forEach(function (row) {
      row.yCuped = row.y - theta * (row.x - xMean);
      row.yBad = row.y - thetaBad * (row.xBad - xBadMean);
    });

    var unadj = difference(rows, "y");
    var cuped = difference(rows, "yCuped");
    var bad = difference(rows, "yBad");
    var seUnadj = seDifference(rows, "y");
    var seCuped = seDifference(rows, "yCuped");
    var seBad = seDifference(rows, "yBad");
    var xDiff = difference(rows, "x");
    var xBadDiff = difference(rows, "xBad");
    return {
      bad: bad,
      badSig: Math.abs(bad / Math.max(1e-12, seBad)) > 1.96,
      corr: correlation(yValues, preValues),
      cuped: cuped,
      cupedSig: Math.abs(cuped / Math.max(1e-12, seCuped)) > 1.96,
      rows: trialIndex === 0 ? rows : null,
      seBad: seBad,
      seCuped: seCuped,
      seUnadj: seUnadj,
      theta: theta,
      thetaBad: thetaBad,
      unadj: unadj,
      unadjSig: Math.abs(unadj / Math.max(1e-12, seUnadj)) > 1.96,
      xBadDiff: xBadDiff,
      xDiff: xDiff
    };
  }

  function summary(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    return {
      mean: mean(values),
      p05: quantile(sorted, 0.05),
      p50: quantile(sorted, 0.50),
      p95: quantile(sorted, 0.95),
      variance: variance(values)
    };
  }

  function simulate(params) {
    var trials = Math.max(40, Math.round(params.trials));
    var results = [];
    for (var t = 0; t < trials; t += 1) results.push(runTrial(params, t));
    var unadj = results.map(function (r) { return r.unadj; });
    var cuped = results.map(function (r) { return r.cuped; });
    var bad = results.map(function (r) { return r.bad; });
    var xDiff = results.map(function (r) { return r.xDiff; });
    var xBadDiff = results.map(function (r) { return r.xBadDiff; });
    var unadjSummary = summary(unadj);
    var cupedSummary = summary(cuped);
    var badSummary = summary(bad);
    var varianceRatio = cupedSummary.variance / Math.max(1e-12, unadjSummary.variance);
    var badVarianceRatio = badSummary.variance / Math.max(1e-12, unadjSummary.variance);
    var avgCorr = mean(results.map(function (r) { return r.corr; }));
    var detectionUnadj = results.filter(function (r) { return r.unadjSig; }).length / trials;
    var detectionCuped = results.filter(function (r) { return r.cupedSig; }).length / trials;
    var detectionBad = results.filter(function (r) { return r.badSig; }).length / trials;
    return {
      avgCorr: avgCorr,
      bad: badSummary,
      badDetection: detectionBad,
      badVarianceRatio: badVarianceRatio,
      cuped: cupedSummary,
      cupedDetection: detectionCuped,
      firstTrial: results[0],
      params: params,
      results: results,
      trials: trials,
      unadj: unadjSummary,
      unadjDetection: detectionUnadj,
      varianceRatio: varianceRatio,
      xBadDiff: summary(xBadDiff),
      xDiff: summary(xDiff)
    };
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawDistributionPanel(ctx, result, box) {
    panelTitle(ctx, box, "Estimator distribution", "repeated randomized experiments");
    var plot = { x: box.x + 38, y: box.y + 46, w: box.w - 52, h: box.h - 76 };
    var values = [];
    result.results.forEach(function (r) {
      values.push(r.unadj, r.cuped, r.bad);
    });
    var min = Math.min.apply(null, values.concat([result.params.trueLift]));
    var max = Math.max.apply(null, values.concat([result.params.trueLift]));
    var pad = (max - min || 1) * 0.12;
    min -= pad;
    max += pad;
    var bins = 26;
    function histogram(selector) {
      var counts = new Array(bins).fill(0);
      result.results.forEach(function (r) {
        var value = selector(r);
        var index = Math.floor((value - min) / (max - min) * bins);
        index = clamp(index, 0, bins - 1);
        counts[index] += 1;
      });
      return counts;
    }
    var histograms = [
      { counts: histogram(function (r) { return r.unadj; }), color: COLORS.unadjusted, offset: -0.25 },
      { counts: histogram(function (r) { return r.cuped; }), color: COLORS.cuped, offset: 0 },
      { counts: histogram(function (r) { return r.bad; }), color: COLORS.bad, offset: 0.25 }
    ];
    var maxCount = Math.max.apply(null, histograms.reduce(function (acc, h) { return acc.concat(h.counts); }, [1]));
    function xScale(value) { return plot.x + (value - min) / (max - min) * plot.w; }
    function yScale(count) { return plot.y + plot.h - count / maxCount * plot.h; }
    drawAxis(ctx, plot);
    histograms.forEach(function (h) {
      ctx.fillStyle = h.color;
      ctx.globalAlpha = 0.58;
      h.counts.forEach(function (count, i) {
        var binW = plot.w / bins;
        var x = plot.x + i * binW + (h.offset + 0.25) * binW / 3;
        var y = yScale(count);
        ctx.fillRect(x, y, Math.max(1, binW / 3), plot.y + plot.h - y);
      });
      ctx.globalAlpha = 1;
    });
    ctx.strokeStyle = COLORS.trueLift;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(xScale(result.params.trueLift), plot.y);
    ctx.lineTo(xScale(result.params.trueLift), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    [min, result.params.trueLift, max].forEach(function (tick) {
      ctx.fillText(formatNumber(tick), xScale(tick), plot.y + plot.h + 13);
    });
    ctx.textAlign = "left";
  }

  function drawVariancePanel(ctx, result, box) {
    panelTitle(ctx, box, "Variance reduction", "control variates buy precision through correlation");
    var plot = { x: box.x + 42, y: box.y + 46, w: box.w - 58, h: box.h - 76 };
    drawAxis(ctx, plot);
    function xScale(rho) { return plot.x + rho * plot.w; }
    function yScale(ratio) { return plot.y + clamp(ratio, 0, 1.2) / 1.2 * plot.h; }
    ctx.strokeStyle = COLORS.band;
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (var i = 0; i <= 100; i += 1) {
      var rho = i / 100;
      var ratio = 1 - rho * rho;
      var x = xScale(rho);
      var y = yScale(ratio);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.cuped;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var j = 0; j <= 100; j += 1) {
      var r = j / 100;
      var y2 = yScale(1 - r * r);
      if (j === 0) ctx.moveTo(xScale(r), y2);
      else ctx.lineTo(xScale(r), y2);
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.cuped;
    ctx.beginPath();
    ctx.arc(xScale(Math.abs(result.avgCorr)), yScale(result.varianceRatio), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.bad;
    ctx.beginPath();
    ctx.arc(xScale(Math.abs(result.avgCorr)), yScale(Math.min(1.2, result.badVarianceRatio)), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(formatPercent((1 - result.varianceRatio) * 100), plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("observed variance reduction", plot.x + 100, plot.y + 22);
    ctx.textAlign = "center";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(formatPercent(tick * 100), xScale(tick), plot.y + plot.h + 13);
    });
    ctx.textAlign = "right";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(formatPercent(tick * 100), plot.x - 7, yScale(tick) + 4);
    });
    ctx.textAlign = "left";
  }

  function drawLeakagePanel(ctx, result, box) {
    panelTitle(ctx, box, "Covariate delta", "pre covariates should balance; contaminated ones do not");
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 68 };
    var rows = [
      { label: "pre-period delta", value: result.xDiff.mean, interval: result.xDiff, color: COLORS.cuped },
      { label: "post-covariate delta", value: result.xBadDiff.mean, interval: result.xBadDiff, color: COLORS.bad },
      { label: "CUPED mean", value: result.cuped.mean, interval: result.cuped, color: COLORS.cuped },
      { label: "bad-adjusted mean", value: result.bad.mean, interval: result.bad, color: COLORS.bad }
    ];
    var values = [];
    rows.forEach(function (row) {
      values.push(row.interval.p05, row.interval.p95, row.value, result.params.trueLift, 0);
    });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = (max - min || 1) * 0.12;
    min -= pad;
    max += pad;
    function xScale(value) { return plot.x + (value - min) / (max - min) * plot.w; }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(xScale(0), plot.y - 4);
    ctx.lineTo(xScale(0), plot.y + plot.h);
    ctx.moveTo(xScale(result.params.trueLift), plot.y - 4);
    ctx.lineTo(xScale(result.params.trueLift), plot.y + plot.h);
    ctx.stroke();
    rows.forEach(function (row, i) {
      var y = plot.y + i * 36;
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xScale(row.interval.p05), y + 10);
      ctx.lineTo(xScale(row.interval.p95), y + 10);
      ctx.stroke();
      ctx.fillStyle = row.color;
      ctx.beginPath();
      ctx.arc(xScale(row.value), y + 10, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.label, plot.x, y - 7);
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(formatNumber(row.value), plot.x + plot.w, y - 7);
    });
    ctx.textAlign = "left";
  }

  function drawTrialPanel(ctx, result, box) {
    panelTitle(ctx, box, "One-trial ledger", "same randomization, different analyzed outcomes");
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 68 };
    var trial = result.firstTrial;
    var rows = [
      { label: "unadjusted", estimate: trial.unadj, se: trial.seUnadj, color: COLORS.unadjusted },
      { label: "CUPED", estimate: trial.cuped, se: trial.seCuped, color: COLORS.cuped },
      { label: "bad adjustment", estimate: trial.bad, se: trial.seBad, color: COLORS.bad }
    ];
    var values = [result.params.trueLift, 0];
    rows.forEach(function (row) {
      values.push(row.estimate - 1.96 * row.se, row.estimate + 1.96 * row.se);
    });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = (max - min || 1) * 0.12;
    min -= pad;
    max += pad;
    function xScale(value) { return plot.x + 118 + (value - min) / (max - min) * (plot.w - 150); }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(xScale(result.params.trueLift), plot.y - 8);
    ctx.lineTo(xScale(result.params.trueLift), plot.y + plot.h);
    ctx.stroke();
    rows.forEach(function (row, i) {
      var y = plot.y + i * 45;
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xScale(row.estimate - 1.96 * row.se), y + 14);
      ctx.lineTo(xScale(row.estimate + 1.96 * row.se), y + 14);
      ctx.stroke();
      ctx.fillStyle = row.color;
      ctx.beginPath();
      ctx.arc(xScale(row.estimate), y + 14, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.label, plot.x, y + 18);
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(formatNumber(row.estimate), plot.x + plot.w, y + 18);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 930 : 680;
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
    var margin = compact ? 24 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawDistributionPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 250 });
      drawVariancePanel(ctx, result, { x: margin, y: 306, w: panelW, h: 212 });
      drawLeakagePanel(ctx, result, { x: margin, y: 546, w: panelW, h: 182 });
      drawTrialPanel(ctx, result, { x: margin, y: 756, w: panelW, h: 148 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawDistributionPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 300 });
      drawVariancePanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 300 });
      drawLeakagePanel(ctx, result, { x: margin, y: 382, w: panelW2, h: 220 });
      drawTrialPanel(ctx, result, { x: margin + panelW2 + gap, y: 382, w: panelW2, h: 220 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var values = {
      correlation: formatPercent(params.correlation),
      coverage: formatPercent(params.coverage),
      leakage: formatPercent(params.leakage),
      trials: Math.round(params.trials).toLocaleString(),
      trueLift: formatNumber(params.trueLift),
      usersPerArm: Math.round(params.usersPerArm).toLocaleString()
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Variance cut", formatPercent((1 - result.varianceRatio) * 100)),
        metric("Effective corr", formatPercent(Math.abs(result.avgCorr) * 100)),
        metric("Unadj detect", formatPercent(result.unadjDetection * 100)),
        metric("CUPED detect", formatPercent(result.cupedDetection * 100)),
        metric("CUPED mean", formatNumber(result.cuped.mean)),
        metric("Bad-adjusted mean", formatNumber(result.bad.mean))
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-cuped-lab]")).forEach(init);
  }

  var api = {
    runTrial: runTrial,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.CupedLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
