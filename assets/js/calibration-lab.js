(function (global) {
  "use strict";

  var COLORS = {
    raw: "#be123c",
    temp: "#0f766e",
    ideal: "#172026",
    groupA: "#2563eb",
    groupB: "#d97706",
    threshold: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    band: "#dbeafe"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sigmoid(x) {
    if (x >= 0) {
      var z = Math.exp(-x);
      return 1 / (1 + z);
    }
    var z2 = Math.exp(x);
    return z2 / (1 + z2);
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
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
    return '<div class="calibration-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
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
    var cases = clamp(Math.round(params.cases), 800, 10000);
    var calibration = clamp(Math.round(params.calibration), 160, cases - 200);
    return {
      bias: clamp(params.bias, -1.5, 1.5),
      bins: clamp(Math.round(params.bins), 4, 40),
      calibration: calibration,
      cases: cases,
      confidence: clamp(params.confidence, 0.35, 3.2),
      groupSkew: clamp(params.groupSkew, -1.5, 1.5),
      scoreNoise: clamp(params.scoreNoise, 0, 1.4),
      signal: clamp(params.signal, 0.25, 2.8),
      threshold: clamp(params.threshold, 0.05, 0.95)
    };
  }

  function makeRows(params) {
    var rows = [];
    for (var i = 0; i < params.cases; i += 1) {
      var group = uniform(i + 41, 0x51f15eed) < 0.42 ? "B" : "A";
      var x = normal(i + 107, 0xbadc0de);
      var trueLogit = params.signal * x + (group === "B" ? 0.45 : -0.15);
      var trueP = sigmoid(trueLogit);
      var y = uniform(i + 809, 0x9e3779b9) < trueP ? 1 : 0;
      var groupTerm = params.groupSkew * (group === "B" ? 1 : -0.72);
      var rawLogit = params.confidence * trueLogit + params.bias + groupTerm +
        params.scoreNoise * normal(i + 1201, 0x1234abcd);
      rows.push({
        group: group,
        rawLogit: rawLogit,
        rawP: sigmoid(rawLogit),
        split: i < params.calibration ? "calibration" : "evaluation",
        trueP: trueP,
        y: y
      });
    }
    return rows;
  }

  function logLoss(rows, field) {
    var sum = 0;
    rows.forEach(function (row) {
      var p = clamp(row[field], 1e-6, 1 - 1e-6);
      sum += row.y ? -Math.log(p) : -Math.log(1 - p);
    });
    return sum / Math.max(1, rows.length);
  }

  function fitTemperature(rows) {
    var bestT = 1;
    var bestLoss = Infinity;
    for (var i = 0; i <= 146; i += 1) {
      var t = 0.30 + i * 0.025;
      var sum = 0;
      rows.forEach(function (row) {
        var p = clamp(sigmoid(row.rawLogit / t), 1e-6, 1 - 1e-6);
        sum += row.y ? -Math.log(p) : -Math.log(1 - p);
      });
      var loss = sum / Math.max(1, rows.length);
      if (loss < bestLoss) {
        bestLoss = loss;
        bestT = t;
      }
    }
    return { loss: bestLoss, temperature: bestT };
  }

  function binRows(rows, field, bins) {
    var out = [];
    for (var i = 0; i < bins; i += 1) {
      out.push({ count: 0, eventRate: 0, index: i, meanP: 0, sumP: 0, sumY: 0 });
    }
    rows.forEach(function (row) {
      var p = clamp(row[field], 0, 1);
      var index = clamp(Math.floor(p * bins), 0, bins - 1);
      var bin = out[index];
      bin.count += 1;
      bin.sumP += p;
      bin.sumY += row.y;
    });
    out.forEach(function (bin) {
      if (bin.count) {
        bin.meanP = bin.sumP / bin.count;
        bin.eventRate = bin.sumY / bin.count;
      } else {
        bin.meanP = (bin.index + 0.5) / bins;
        bin.eventRate = null;
      }
    });
    return out;
  }

  function brier(rows, field) {
    var sum = 0;
    rows.forEach(function (row) {
      var d = row[field] - row.y;
      sum += d * d;
    });
    return sum / Math.max(1, rows.length);
  }

  function score(rows, field, bins) {
    var bs = brier(rows, field);
    var ll = logLoss(rows, field);
    var baseRate = rows.reduce(function (sum, row) { return sum + row.y; }, 0) / Math.max(1, rows.length);
    var binStats = binRows(rows, field, bins);
    var ece = 0;
    var mce = 0;
    var reliability = 0;
    var resolution = 0;
    binStats.forEach(function (bin) {
      if (!bin.count) return;
      var weight = bin.count / rows.length;
      var gap = Math.abs(bin.meanP - bin.eventRate);
      ece += weight * gap;
      mce = Math.max(mce, gap);
      reliability += weight * Math.pow(bin.meanP - bin.eventRate, 2);
      resolution += weight * Math.pow(bin.eventRate - baseRate, 2);
    });
    var uncertainty = baseRate * (1 - baseRate);
    return {
      baseRate: baseRate,
      bins: binStats,
      brier: bs,
      decompositionResidual: bs - (reliability - resolution + uncertainty),
      ece: ece,
      logLoss: ll,
      mce: mce,
      reliability: reliability,
      resolution: resolution,
      uncertainty: uncertainty
    };
  }

  function thresholdStats(rows, field, threshold) {
    var tp = 0;
    var fp = 0;
    var tn = 0;
    var fn = 0;
    rows.forEach(function (row) {
      var pred = row[field] >= threshold ? 1 : 0;
      if (pred && row.y) tp += 1;
      else if (pred && !row.y) fp += 1;
      else if (!pred && row.y) fn += 1;
      else tn += 1;
    });
    return {
      cost: (fp + 3 * fn) / Math.max(1, rows.length),
      fn: fn,
      fp: fp,
      precision: tp / Math.max(1, tp + fp),
      recall: tp / Math.max(1, tp + fn),
      selected: (tp + fp) / Math.max(1, rows.length),
      tn: tn,
      tp: tp
    };
  }

  function binSweep(rows) {
    var out = [];
    for (var bins = 4; bins <= 40; bins += 2) {
      out.push({
        bins: bins,
        rawEce: score(rows, "rawP", bins).ece,
        tempEce: score(rows, "tempP", bins).ece
      });
    }
    return out;
  }

  function groupScores(rows, bins) {
    return ["A", "B"].map(function (group) {
      var subset = rows.filter(function (row) { return row.group === group; });
      return {
        count: subset.length,
        group: group,
        raw: score(subset, "rawP", bins),
        temp: score(subset, "tempP", bins)
      };
    });
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var rows = makeRows(clean);
    var calibrationRows = rows.filter(function (row) { return row.split === "calibration"; });
    var evaluationRows = rows.filter(function (row) { return row.split === "evaluation"; });
    var fit = fitTemperature(calibrationRows);
    rows.forEach(function (row) {
      row.tempP = sigmoid(row.rawLogit / fit.temperature);
    });
    calibrationRows = rows.filter(function (row) { return row.split === "calibration"; });
    evaluationRows = rows.filter(function (row) { return row.split === "evaluation"; });
    var raw = score(evaluationRows, "rawP", clean.bins);
    var temp = score(evaluationRows, "tempP", clean.bins);
    var rawThreshold = thresholdStats(evaluationRows, "rawP", clean.threshold);
    var tempThreshold = thresholdStats(evaluationRows, "tempP", clean.threshold);
    var groups = groupScores(evaluationRows, clean.bins);
    return {
      calibrationRows: calibrationRows,
      evaluationRows: evaluationRows,
      fit: fit,
      groups: groups,
      params: clean,
      raw: raw,
      rawThreshold: rawThreshold,
      rows: rows,
      sweep: binSweep(evaluationRows),
      temp: temp,
      tempThreshold: tempThreshold
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

  function drawReliabilityPanel(ctx, result, box) {
    panelTitle(ctx, box, "Reliability diagram", "event frequency should match stated probability");
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    function xScale(p) { return plot.x + clamp(p, 0, 1) * plot.w; }
    function yScale(p) { return plot.y + plot.h - clamp(p, 0, 1) * plot.h; }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.ideal;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(0));
    ctx.lineTo(xScale(1), yScale(1));
    ctx.stroke();
    ctx.setLineDash([]);

    function drawBins(bins, color) {
      var points = bins.filter(function (bin) { return bin.count; });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach(function (bin, i) {
        var x = xScale(bin.meanP);
        var y = yScale(bin.eventRate);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      var maxCount = Math.max.apply(null, points.map(function (bin) { return bin.count; }).concat([1]));
      points.forEach(function (bin) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.arc(xScale(bin.meanP), yScale(bin.eventRate), 2.5 + 5 * Math.sqrt(bin.count / maxCount), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
    drawBins(result.raw.bins, COLORS.raw);
    drawBins(result.temp.bins, COLORS.temp);

    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("T=" + formatNumber(result.fit.temperature), plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("fitted on " + result.params.calibration.toLocaleString() + " calibration rows", plot.x + 78, plot.y + 22);
    ctx.textAlign = "center";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(formatPercent(tick * 100), xScale(tick), plot.y + plot.h + 14);
    });
    ctx.textAlign = "right";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(formatPercent(tick * 100), plot.x - 7, yScale(tick) + 4);
    });
    ctx.textAlign = "left";
  }

  function drawSweepPanel(ctx, result, box) {
    panelTitle(ctx, box, "ECE is a binned estimate", "change the bin count and the scalar moves");
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var maxEce = Math.max.apply(null, result.sweep.map(function (row) {
      return Math.max(row.rawEce, row.tempEce);
    }).concat([0.02]));
    maxEce *= 1.18;
    function xScale(bins) { return plot.x + (bins - 4) / (40 - 4) * plot.w; }
    function yScale(ece) { return plot.y + plot.h - ece / maxEce * plot.h; }
    drawAxis(ctx, plot);
    function line(field, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      result.sweep.forEach(function (row, i) {
        var x = xScale(row.bins);
        var y = yScale(row[field]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    line("rawEce", COLORS.raw);
    line("tempEce", COLORS.temp);
    ctx.strokeStyle = COLORS.threshold;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(xScale(result.params.bins), plot.y);
    ctx.lineTo(xScale(result.params.bins), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(formatPercent(result.raw.ece * 100), plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("raw ECE at selected bins", plot.x + 92, plot.y + 22);
    ctx.textAlign = "center";
    [4, result.params.bins, 40].forEach(function (tick) {
      ctx.fillText(String(tick), xScale(tick), plot.y + plot.h + 14);
    });
    ctx.textAlign = "right";
    ctx.fillText(formatPercent(maxEce * 100), plot.x - 7, plot.y + 4);
    ctx.fillText("0", plot.x - 7, plot.y + plot.h);
    ctx.textAlign = "left";
  }

  function drawBrierPanel(ctx, result, box) {
    panelTitle(ctx, box, "Brier decomposition", "reliability is not the whole score");
    var plot = { x: box.x, y: box.y + 50, w: box.w, h: box.h - 66 };
    var rows = [
      { label: "raw Brier", raw: result.raw.brier, temp: result.temp.brier, scale: 0.32 },
      { label: "reliability", raw: result.raw.reliability, temp: result.temp.reliability, scale: 0.08 },
      { label: "resolution", raw: result.raw.resolution, temp: result.temp.resolution, scale: 0.08 },
      { label: "bin residual", raw: Math.abs(result.raw.decompositionResidual), temp: Math.abs(result.temp.decompositionResidual), scale: 0.08 },
      { label: "log loss", raw: result.raw.logLoss, temp: result.temp.logLoss, scale: 0.95 }
    ];
    var rowGap = Math.min(35, Math.max(23, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      var barStart = plot.x + 112;
      var barW = plot.w - 172;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(barStart, y, barW, 18);
      ctx.fillStyle = COLORS.raw;
      ctx.fillRect(barStart, y, Math.max(1, barW * clamp(row.raw / row.scale, 0, 1)), 8);
      ctx.fillStyle = COLORS.temp;
      ctx.fillRect(barStart, y + 10, Math.max(1, barW * clamp(row.temp / row.scale, 0, 1)), 8);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.label, plot.x, y + 13);
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(formatNumber(row.temp), plot.x + plot.w, y + 13);
    });
    ctx.textAlign = "left";
  }

  function drawGroupPanel(ctx, result, box) {
    panelTitle(ctx, box, "Subgroup calibration", "global reliability can hide local mistakes");
    var plot = { x: box.x, y: box.y + 50, w: box.w, h: box.h - 66 };
    var rows = [];
    result.groups.forEach(function (group) {
      rows.push({ label: "group " + group.group + " raw", value: group.raw.ece, color: group.group === "A" ? COLORS.groupA : COLORS.groupB });
      rows.push({ label: "group " + group.group + " temp", value: group.temp.ece, color: COLORS.temp });
    });
    rows.push({ label: "raw selected", value: result.rawThreshold.selected, color: COLORS.raw, percent: true });
    rows.push({ label: "temp selected", value: result.tempThreshold.selected, color: COLORS.threshold, percent: true });
    var max = Math.max.apply(null, rows.map(function (row) { return row.value; }).concat([0.05]));
    var rowGap = Math.min(32, Math.max(20, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      var barW = plot.w - 172;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 118, y, barW, 16);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 118, y, Math.max(1, barW * clamp(row.value / max, 0, 1)), 16);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.label, plot.x, y + 12);
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(formatPercent(row.value * 100), plot.x + plot.w, y + 12);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 970 : 700;
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
      drawReliabilityPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 286 });
      drawSweepPanel(ctx, result, { x: margin, y: 342, w: panelW, h: 206 });
      drawBrierPanel(ctx, result, { x: margin, y: 576, w: panelW, h: 206 });
      drawGroupPanel(ctx, result, { x: margin, y: 810, w: panelW, h: 136 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawReliabilityPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 320 });
      drawSweepPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 320 });
      drawBrierPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 244 });
      drawGroupPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 244 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var values = {
      bias: formatNumber(result.params.bias),
      bins: String(result.params.bins),
      calibration: Math.round(result.params.calibration).toLocaleString(),
      cases: Math.round(result.params.cases).toLocaleString(),
      confidence: formatNumber(result.params.confidence),
      groupSkew: formatNumber(result.params.groupSkew),
      scoreNoise: formatNumber(result.params.scoreNoise),
      signal: formatNumber(result.params.signal),
      threshold: formatPercent(result.params.threshold * 100)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var groupGap = Math.max.apply(null, result.groups.map(function (g) { return g.raw.ece; })) -
        Math.min.apply(null, result.groups.map(function (g) { return g.raw.ece; }));
      metrics.innerHTML = [
        metric("Raw ECE", formatPercent(result.raw.ece * 100)),
        metric("Temp ECE", formatPercent(result.temp.ece * 100)),
        metric("Raw Brier", formatNumber(result.raw.brier)),
        metric("Temp Brier", formatNumber(result.temp.brier)),
        metric("Fit T", formatNumber(result.fit.temperature)),
        metric("Group ECE gap", formatPercent(groupGap * 100))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-calibration-lab]")).forEach(init);
  }

  var api = {
    binRows: binRows,
    fitTemperature: fitTemperature,
    score: score,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.CalibrationLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
