(function (global) {
  "use strict";

  var COLORS = {
    ate: "#64748b",
    complier: "#0f766e",
    target: "#7c3aed",
    naive: "#be123c",
    wald: "#2563eb",
    itt: "#d97706",
    always: "#9333ea",
    never: "#94a3b8",
    defier: "#ea580c",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    band: "#eef2ff"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) < 1e-12) return "0.0%";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="iv-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
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

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function cleanParams(params) {
    var raw = {
      always: clamp(params.always, 0, 45) / 100,
      compliers: clamp(params.compliers, 5, 70) / 100,
      confounding: clamp(params.confounding, 0, 200) / 100,
      defiers: clamp(params.defiers, 0, 30) / 100,
      exclusion: clamp(params.exclusion, 0, 80) / 100,
      experiments: clamp(Math.round(params.experiments), 60, 240),
      heterogeneity: clamp(params.heterogeneity, 0, 180) / 100,
      n: clamp(Math.round(params.n), 200, 4000)
    };
    var principal = raw.always + raw.compliers + raw.defiers;
    if (principal > 0.92) {
      var scale = 0.92 / principal;
      raw.always *= scale;
      raw.compliers *= scale;
      raw.defiers *= scale;
    }
    raw.never = Math.max(0, 1 - raw.always - raw.compliers - raw.defiers);
    return raw;
  }

  function assignType(units, params) {
    var ranked = units.slice().sort(function (a, b) {
      return b.takeScore - a.takeScore;
    });
    var n = units.length;
    var alwaysCount = Math.round(params.always * n);
    var complierCount = Math.round(params.compliers * n);
    var defierCount = Math.round(params.defiers * n);
    if (alwaysCount + complierCount + defierCount > n) {
      defierCount = Math.max(0, n - alwaysCount - complierCount);
    }
    ranked.forEach(function (unit, index) {
      if (index < alwaysCount) unit.type = "always";
      else if (index < alwaysCount + complierCount) unit.type = "complier";
      else if (index < alwaysCount + complierCount + defierCount) unit.type = "defier";
      else unit.type = "never";
    });
  }

  function treatmentUnder(type, z) {
    if (type === "always") return 1;
    if (type === "never") return 0;
    if (type === "complier") return z;
    return 1 - z;
  }

  function effectForType(type, u, params) {
    var h = params.heterogeneity;
    var base = 1 + 0.08 * u;
    if (type === "complier") return base + 0.48 * h;
    if (type === "always") return base - 0.28 * h;
    if (type === "never") return base - 0.38 * h;
    return base + 0.72 * h;
  }

  function generateUnits(params, experiment, withNoise) {
    var units = [];
    for (var i = 0; i < params.n; i += 1) {
      var u = normal(experiment * 100003 + i * 11 + 7, 0x5151abcd);
      var rankNoise = uniform(experiment * 200003 + i * 17 + 13, 0xdecafbad);
      var takeScore = rankNoise + params.confounding * 0.42 * u;
      units.push({ index: i, takeScore: takeScore, u: u });
    }
    assignType(units, params);
    for (var j = 0; j < units.length; j += 1) {
      var unit = units[j];
      var z = uniform(experiment * 300007 + j * 19 + 23, 0x9e3779b9) < 0.5 ? 1 : 0;
      var d = treatmentUnder(unit.type, z);
      var tau = effectForType(unit.type, unit.u, params);
      var baseline = 0.35 + params.confounding * 0.82 * unit.u + 0.18 * normal(experiment * 400009 + j * 23 + 31, 0x1234abcd);
      var noise = withNoise ? 0.75 * normal(experiment * 500009 + j * 29 + 37, 0xbadc0de) : 0;
      unit.z = z;
      unit.d = d;
      unit.tau = tau;
      unit.baseline = baseline;
      unit.y = baseline + tau * d + params.exclusion * z + noise;
      unit.d0 = treatmentUnder(unit.type, 0);
      unit.d1 = treatmentUnder(unit.type, 1);
    }
    return units;
  }

  function mean(rows, predicate, accessor) {
    var sum = 0;
    var count = 0;
    rows.forEach(function (row) {
      if (predicate(row)) {
        sum += accessor(row);
        count += 1;
      }
    });
    return count ? sum / count : 0;
  }

  function varianceBinary(p) {
    return Math.max(0, p * (1 - p));
  }

  function estimate(units, params) {
    var n = units.length;
    var treatedMean = mean(units, function (u) { return u.d === 1; }, function (u) { return u.y; });
    var untreatedMean = mean(units, function (u) { return u.d === 0; }, function (u) { return u.y; });
    var z1Y = mean(units, function (u) { return u.z === 1; }, function (u) { return u.y; });
    var z0Y = mean(units, function (u) { return u.z === 0; }, function (u) { return u.y; });
    var z1D = mean(units, function (u) { return u.z === 1; }, function (u) { return u.d; });
    var z0D = mean(units, function (u) { return u.z === 0; }, function (u) { return u.d; });
    var n1 = units.filter(function (u) { return u.z === 1; }).length;
    var n0 = n - n1;
    var firstStage = z1D - z0D;
    var reducedForm = z1Y - z0Y;
    var wald = Math.abs(firstStage) > 1e-9 ? reducedForm / firstStage : NaN;
    var firstStageSe = Math.sqrt(varianceBinary(z1D) / Math.max(1, n1) + varianceBinary(z0D) / Math.max(1, n0));
    var firstStageF = firstStageSe > 0 ? Math.pow(firstStage / firstStageSe, 2) : Infinity;
    return {
      firstStage: firstStage,
      firstStageF: firstStageF,
      naive: treatedMean - untreatedMean,
      reducedForm: reducedForm,
      wald: wald,
      z1D: z1D,
      z0D: z0D
    };
  }

  function truth(units, params) {
    var counts = { always: 0, complier: 0, defier: 0, never: 0 };
    var tauSums = { always: 0, complier: 0, defier: 0, never: 0 };
    var numerator = 0;
    var denominator = 0;
    var ate = 0;
    units.forEach(function (unit) {
      counts[unit.type] += 1;
      tauSums[unit.type] += unit.tau;
      ate += unit.tau;
      numerator += unit.tau * (unit.d1 - unit.d0) + params.exclusion;
      denominator += unit.d1 - unit.d0;
    });
    var comp = counts.complier ? tauSums.complier / counts.complier : 0;
    var defier = counts.defier ? tauSums.defier / counts.defier : 0;
    return {
      ate: ate / units.length,
      complierEffect: comp,
      counts: counts,
      defierEffect: defier,
      target: Math.abs(denominator) > 1e-9 ? numerator / denominator : NaN
    };
  }

  function sampling(params) {
    var points = [];
    for (var e = 0; e < params.experiments; e += 1) {
      var units = generateUnits(params, e + 1000, true);
      var est = estimate(units, params);
      points.push({ firstStage: est.firstStage, naive: est.naive, wald: est.wald });
    }
    return points;
  }

  function summarizeSampling(points) {
    var finite = points.filter(function (p) { return isFinite(p.wald); });
    if (!finite.length) return { p10: NaN, p50: NaN, p90: NaN, sd: NaN };
    var sorted = finite.map(function (p) { return p.wald; }).sort(function (a, b) { return a - b; });
    function q(p) {
      var index = p * (sorted.length - 1);
      var lo = Math.floor(index);
      var hi = Math.ceil(index);
      var w = index - lo;
      return sorted[lo] * (1 - w) + sorted[hi] * w;
    }
    var avg = sorted.reduce(function (sum, v) { return sum + v; }, 0) / sorted.length;
    var sd = Math.sqrt(sorted.reduce(function (sum, v) { return sum + Math.pow(v - avg, 2); }, 0) / sorted.length);
    return { p10: q(0.1), p50: q(0.5), p90: q(0.9), sd: sd };
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var units = generateUnits(clean, 0, true);
    var noiselessUnits = generateUnits(clean, 0, false);
    var est = estimate(units, clean);
    var trueStats = truth(noiselessUnits, clean);
    var points = sampling(clean);
    return {
      estimate: est,
      params: clean,
      sampling: points,
      samplingSummary: summarizeSampling(points),
      truth: trueStats,
      units: units
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

  function drawEstimatorPanel(ctx, result, box) {
    panelTitle(ctx, box, "What the estimators see", "Wald targets the moved margin when assumptions hold");
    var plot = { x: box.x + 42, y: box.y + 56, w: box.w - 58, h: box.h - 92 };
    var rows = [
      { color: COLORS.ate, label: "ATE", value: result.truth.ate },
      { color: COLORS.complier, label: "LATE", value: result.truth.complierEffect },
      { color: COLORS.target, label: "target", value: result.truth.target },
      { color: COLORS.naive, label: "naive", value: result.estimate.naive },
      { color: COLORS.wald, label: "Wald", value: result.estimate.wald }
    ];
    var finiteValues = rows.map(function (row) { return row.value; }).filter(isFinite);
    var maxAbs = Math.max.apply(null, finiteValues.map(function (v) { return Math.abs(v); }).concat([1.2])) * 1.2;
    function yScale(v) { return plot.y + plot.h / 2 - v / maxAbs * (plot.h / 2); }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(0));
    ctx.lineTo(plot.x + plot.w, yScale(0));
    ctx.stroke();
    var gap = plot.w / rows.length;
    rows.forEach(function (row, i) {
      var x = plot.x + i * gap + gap * 0.2;
      var w = gap * 0.54;
      var value = isFinite(row.value) ? row.value : 0;
      var y0 = yScale(0);
      var y = yScale(value);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, value >= 0 ? y : y0, w, Math.max(1, Math.abs(y - y0)));
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatNumber(row.value), x + w / 2, value >= 0 ? y - 8 : y0 + Math.abs(y - y0) + 15);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, x + w / 2, plot.y + plot.h + 14);
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Wald " + formatNumber(result.estimate.wald), plot.x, plot.y + 12);
  }

  function drawTypePanel(ctx, result, box) {
    panelTitle(ctx, box, "Principal strata", "the instrument only identifies people whose treatment changes");
    var counts = result.truth.counts;
    var total = Math.max(1, counts.always + counts.complier + counts.defier + counts.never);
    var rows = [
      { color: COLORS.always, key: "always", label: "always", value: counts.always / total },
      { color: COLORS.complier, key: "complier", label: "complier", value: counts.complier / total },
      { color: COLORS.defier, key: "defier", label: "defier", value: counts.defier / total },
      { color: COLORS.never, key: "never", label: "never", value: counts.never / total }
    ];
    var plot = { x: box.x + 30, y: box.y + 58, w: box.w - 48, h: box.h - 98 };
    var x = plot.x;
    rows.forEach(function (row) {
      var w = row.value * plot.w;
      ctx.fillStyle = row.color;
      ctx.fillRect(x, plot.y + 20, w, 36);
      if (w > 42) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formatPercent(row.value * 100), x + w / 2, plot.y + 42);
      }
      x += w;
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("first stage " + formatNumber(result.estimate.firstStage), plot.x, plot.y + 92);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    var y = plot.y + 126;
    rows.forEach(function (row) {
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y - 9, 10, 10);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(row.label + " " + formatPercent(row.value * 100), plot.x + 16, y);
      y += 20;
    });
  }

  function drawSamplingPanel(ctx, result, box) {
    panelTitle(ctx, box, "Repeated samples", "weak first stages make ratios volatile");
    var plot = { x: box.x + 44, y: box.y + 54, w: box.w - 62, h: box.h - 82 };
    var points = result.sampling.filter(function (p) { return isFinite(p.wald); });
    var vals = points.map(function (p) { return p.wald; }).concat([result.truth.target, result.truth.complierEffect]).filter(isFinite);
    var min = Math.min.apply(null, vals.concat([-1]));
    var max = Math.max.apply(null, vals.concat([2]));
    var pad = (max - min) * 0.12 + 1e-6;
    min -= pad;
    max += pad;
    var bins = 26;
    var counts = [];
    for (var i = 0; i < bins; i += 1) counts.push(0);
    points.forEach(function (p) {
      var index = clamp(Math.floor((p.wald - min) / Math.max(1e-9, max - min) * bins), 0, bins - 1);
      counts[index] += 1;
    });
    var maxCount = Math.max.apply(null, counts.concat([1]));
    drawAxis(ctx, plot);
    counts.forEach(function (count, i) {
      var x = plot.x + i / bins * plot.w;
      var w = plot.w / bins - 1.5;
      var h = count / maxCount * plot.h;
      ctx.fillStyle = "rgba(37, 99, 235, 0.72)";
      ctx.fillRect(x + 1, plot.y + plot.h - h, w, h);
    });
    function xScale(v) { return plot.x + (v - min) / Math.max(1e-9, max - min) * plot.w; }
    [
      { color: COLORS.complier, label: "LATE", value: result.truth.complierEffect },
      { color: COLORS.target, label: "target", value: result.truth.target }
    ].forEach(function (line) {
      if (!isFinite(line.value)) return;
      var x = xScale(line.value);
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.fillStyle = line.color;
      ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(line.label, x + 4, plot.y + 10);
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("p10-p90 " + formatNumber(result.samplingSummary.p10) + "..." + formatNumber(result.samplingSummary.p90), plot.x, plot.y + 16);
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Identification ledger", "relevance, exclusion, and monotonicity are separate promises");
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 66 };
    var rows = [
      ["sample size", formatNumber(result.params.n)],
      ["experiments", formatNumber(result.params.experiments)],
      ["reduced form", formatNumber(result.estimate.reducedForm)],
      ["first stage", formatNumber(result.estimate.firstStage)],
      ["first-stage F", formatNumber(result.estimate.firstStageF)],
      ["direct Z leak", formatNumber(result.params.exclusion)],
      ["defiers", formatPercent(result.truth.counts.defier / result.params.n * 100)],
      ["Wald sd", formatNumber(result.samplingSummary.sd)]
    ];
    var rowGap = Math.min(25, Math.max(18, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.25)" : "transparent";
      ctx.fillRect(plot.x, y - 2, plot.w, rowGap);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row[0], plot.x + 4, y + 13);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(row[1], plot.x + plot.w - 4, y + 13);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 1040 : 700;
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
      drawEstimatorPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 252 });
      drawTypePanel(ctx, result, { x: margin, y: 310, w: panelW, h: 218 });
      drawSamplingPanel(ctx, result, { x: margin, y: 558, w: panelW, h: 226 });
      drawLedgerPanel(ctx, result, { x: margin, y: 814, w: panelW, h: 194 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawEstimatorPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 318 });
      drawTypePanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 318 });
      drawSamplingPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 246 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 246 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      always: formatPercent(result.params.always * 100),
      compliers: formatPercent(result.params.compliers * 100),
      confounding: formatPercent(result.params.confounding * 100),
      defiers: formatPercent(result.params.defiers * 100),
      exclusion: formatNumber(result.params.exclusion),
      experiments: formatNumber(result.params.experiments),
      heterogeneity: formatPercent(result.params.heterogeneity * 100),
      n: formatNumber(result.params.n)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Naive difference", formatNumber(result.estimate.naive)),
        metric("Wald estimate", formatNumber(result.estimate.wald)),
        metric("Complier effect", formatNumber(result.truth.complierEffect)),
        metric("ATE", formatNumber(result.truth.ate)),
        metric("First-stage F", formatNumber(result.estimate.firstStageF)),
        metric("Wald p10-p90", formatNumber(result.samplingSummary.p10) + "..." + formatNumber(result.samplingSummary.p90))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-iv-lab]")).forEach(init);
  }

  var api = {
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.InstrumentalVariableLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
