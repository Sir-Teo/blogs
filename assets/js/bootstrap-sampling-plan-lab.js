(function (global) {
  "use strict";

  var COLORS = {
    classic: "#be123c",
    hc1: "#7c3aed",
    residual: "#d97706",
    pairs: "#2563eb",
    wild: "#0f766e",
    trueLine: "#111827",
    fitLine: "#64748b",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    band: "#ecfeff"
  };

  var METHODS = [
    { key: "classic", label: "classic", color: COLORS.classic },
    { key: "hc1", label: "HC1", color: COLORS.hc1 },
    { key: "residual", label: "residual", color: COLORS.residual },
    { key: "pairs", label: "pairs", color: COLORS.pairs },
    { key: "wild", label: "wild", color: COLORS.wild }
  ];

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
    if (value === 0) return "0.0%";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="bootstrap-plan-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
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
    return {
      bootstraps: clamp(Math.round(params.bootstraps), 40, 220),
      experiments: clamp(Math.round(params.experiments), 60, 300),
      hetero: clamp(params.hetero, 0, 220) / 100,
      leverage: clamp(params.leverage, 0, 80) / 100,
      n: clamp(Math.round(params.n), 30, 220),
      noise: clamp(params.noise, 40, 180) / 100,
      slope: 1
    };
  }

  function generateData(params, experiment) {
    var rows = [];
    var n = params.n;
    for (var i = 0; i < n; i += 1) {
      var r = uniform(experiment * 2003 + i * 17 + 5, 0x51f15eed);
      var x;
      if (r < params.leverage) {
        x = 1.55 + 1.65 * uniform(experiment * 4001 + i * 29 + 11, 0x99b00f);
        if (uniform(experiment * 5003 + i * 31 + 19, 0xabcd1234) < 0.38) x = -x;
        x += 0.12 * normal(experiment * 6007 + i * 37 + 23, 0xfeedbabe);
      } else {
        x = -1.05 + 2.1 * uniform(experiment * 7001 + i * 41 + 31, 0xdecafbad);
      }
      var scale = params.noise * (0.55 + 0.45 * (1 + params.hetero * Math.pow(Math.abs(x) + 0.25, 1.18)));
      var error = scale * normal(experiment * 9001 + i * 43 + 43, 0xbadc0de);
      rows.push({ x: x, y: 0.45 + params.slope * x + error, sigma: scale });
    }
    return rows;
  }

  function ols(rows) {
    var n = rows.length;
    var sumX = 0;
    var sumY = 0;
    for (var i = 0; i < n; i += 1) {
      sumX += rows[i].x;
      sumY += rows[i].y;
    }
    var meanX = sumX / n;
    var meanY = sumY / n;
    var sxx = 0;
    var sxy = 0;
    for (var j = 0; j < n; j += 1) {
      var dx = rows[j].x - meanX;
      sxx += dx * dx;
      sxy += dx * (rows[j].y - meanY);
    }
    var slope = sxy / Math.max(1e-12, sxx);
    var intercept = meanY - slope * meanX;
    var rss = 0;
    var robustNumerator = 0;
    var residuals = [];
    var fitted = [];
    for (var k = 0; k < n; k += 1) {
      var yhat = intercept + slope * rows[k].x;
      var resid = rows[k].y - yhat;
      fitted.push(yhat);
      residuals.push(resid);
      rss += resid * resid;
      robustNumerator += Math.pow(rows[k].x - meanX, 2) * resid * resid;
    }
    var classicVar = rss / Math.max(1, n - 2) / Math.max(1e-12, sxx);
    var hc1Var = (n / Math.max(1, n - 2)) * robustNumerator / Math.pow(Math.max(1e-12, sxx), 2);
    return {
      classicSe: Math.sqrt(Math.max(0, classicVar)),
      fitted: fitted,
      hc1Se: Math.sqrt(Math.max(0, hc1Var)),
      intercept: intercept,
      meanX: meanX,
      residuals: residuals,
      rss: rss,
      slope: slope,
      sxx: sxx
    };
  }

  function centeredResiduals(residuals) {
    var mean = residuals.reduce(function (sum, value) { return sum + value; }, 0) / residuals.length;
    return residuals.map(function (value) { return value - mean; });
  }

  function quantile(sortedValues, p) {
    if (!sortedValues.length) return 0;
    var index = clamp(p, 0, 1) * (sortedValues.length - 1);
    var lo = Math.floor(index);
    var hi = Math.ceil(index);
    var w = index - lo;
    return sortedValues[lo] * (1 - w) + sortedValues[hi] * w;
  }

  function ciFromSamples(samples, center) {
    var sorted = samples.slice().sort(function (a, b) { return a - b; });
    var qLow = quantile(sorted, 0.025);
    var qHigh = quantile(sorted, 0.975);
    return {
      lower: 2 * center - qHigh,
      upper: 2 * center - qLow,
      qLow: qLow,
      qHigh: qHigh,
      samples: sorted
    };
  }

  function normalCi(center, se) {
    return { lower: center - 1.96 * se, upper: center + 1.96 * se };
  }

  function fitResidualBootstrap(rows, fit, residualPool, params, experiment, draw) {
    var resampled = rows.map(function (row, i) {
      var pick = Math.floor(uniform(experiment * 1000003 + draw * 1297 + i * 7, 0x8badf00d) * residualPool.length);
      return { x: row.x, y: fit.fitted[i] + residualPool[pick] };
    });
    return ols(resampled).slope;
  }

  function fitPairsBootstrap(rows, params, experiment, draw) {
    var resampled = [];
    for (var i = 0; i < rows.length; i += 1) {
      var pick = Math.floor(uniform(experiment * 1000033 + draw * 1597 + i * 13, 0x01234567) * rows.length);
      resampled.push({ x: rows[pick].x, y: rows[pick].y });
    }
    return ols(resampled).slope;
  }

  function fitWildBootstrap(rows, fit, params, experiment, draw) {
    var resampled = rows.map(function (row, i) {
      var sign = uniform(experiment * 1000211 + draw * 1723 + i * 19, 0xf00dbabe) < 0.5 ? -1 : 1;
      return { x: row.x, y: fit.fitted[i] + fit.residuals[i] * sign };
    });
    return ols(resampled).slope;
  }

  function runExperiment(params, experiment, recordExample) {
    var rows = generateData(params, experiment);
    var fit = ols(rows);
    var residualPool = centeredResiduals(fit.residuals);
    var residualSamples = [];
    var pairsSamples = [];
    var wildSamples = [];
    for (var b = 0; b < params.bootstraps; b += 1) {
      residualSamples.push(fitResidualBootstrap(rows, fit, residualPool, params, experiment, b));
      pairsSamples.push(fitPairsBootstrap(rows, params, experiment, b));
      wildSamples.push(fitWildBootstrap(rows, fit, params, experiment, b));
    }
    var intervals = {
      classic: normalCi(fit.slope, fit.classicSe),
      hc1: normalCi(fit.slope, fit.hc1Se),
      pairs: ciFromSamples(pairsSamples, fit.slope),
      residual: ciFromSamples(residualSamples, fit.slope),
      wild: ciFromSamples(wildSamples, fit.slope)
    };
    if (!recordExample) return { fit: fit, intervals: intervals };
    return {
      bootSamples: {
        pairs: intervals.pairs.samples,
        residual: intervals.residual.samples,
        wild: intervals.wild.samples
      },
      fit: fit,
      intervals: intervals,
      rows: rows
    };
  }

  function aggregate(params) {
    var stats = {};
    METHODS.forEach(function (method) {
      stats[method.key] = { coverage: 0, meanWidth: 0, missesHigh: 0, missesLow: 0 };
    });
    var example = runExperiment(params, 0, true);
    for (var e = 0; e < params.experiments; e += 1) {
      var result = runExperiment(params, e, false);
      METHODS.forEach(function (method) {
        var interval = result.intervals[method.key];
        var covered = interval.lower <= params.slope && params.slope <= interval.upper;
        if (covered) stats[method.key].coverage += 1;
        if (params.slope < interval.lower) stats[method.key].missesLow += 1;
        if (params.slope > interval.upper) stats[method.key].missesHigh += 1;
        stats[method.key].meanWidth += interval.upper - interval.lower;
      });
    }
    METHODS.forEach(function (method) {
      var row = stats[method.key];
      row.coverage /= params.experiments;
      row.meanWidth /= params.experiments;
      row.missRate = 1 - row.coverage;
    });
    return { example: example, params: params, stats: stats };
  }

  function simulate(params) {
    return aggregate(cleanParams(params));
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

  function drawCoveragePanel(ctx, result, box) {
    panelTitle(ctx, box, "Coverage", "share of experiments where the 95% interval catches the true slope");
    var plot = { x: box.x + 40, y: box.y + 52, w: box.w - 56, h: box.h - 86 };
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.rule;
    [0.8, 0.95].forEach(function (level) {
      var y = plot.y + plot.h - level * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.fillStyle = level === 0.95 ? COLORS.text : COLORS.muted;
      ctx.font = level === 0.95 ? "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif" : "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(formatPercent(level * 100), plot.x - 6, y - 6);
    });
    var gap = plot.w / METHODS.length;
    METHODS.forEach(function (method, i) {
      var stat = result.stats[method.key];
      var x = plot.x + i * gap + gap * 0.22;
      var w = gap * 0.52;
      var y = plot.y + plot.h - stat.coverage * plot.h;
      ctx.fillStyle = method.color;
      ctx.fillRect(x, y, w, plot.y + plot.h - y);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatPercent(stat.coverage * 100), x + w / 2, y - 8);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(method.label, x + w / 2, plot.y + plot.h + 14);
    });
    ctx.textAlign = "left";
  }

  function drawWidthPanel(ctx, result, box) {
    panelTitle(ctx, box, "Interval width", "narrow intervals are only useful when they still cover");
    var plot = { x: box.x + 38, y: box.y + 52, w: box.w - 54, h: box.h - 86 };
    var maxWidth = Math.max.apply(null, METHODS.map(function (m) { return result.stats[m.key].meanWidth; }).concat([0.5])) * 1.18;
    drawAxis(ctx, plot);
    var gap = plot.w / METHODS.length;
    METHODS.forEach(function (method, i) {
      var stat = result.stats[method.key];
      var x = plot.x + i * gap + gap * 0.22;
      var w = gap * 0.52;
      var h = stat.meanWidth / maxWidth * plot.h;
      ctx.fillStyle = method.color;
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatNumber(stat.meanWidth), x + w / 2, plot.y + plot.h - h - 8);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(method.label, x + w / 2, plot.y + plot.h + 14);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "right";
    ctx.fillText(formatNumber(maxWidth), plot.x - 7, plot.y + 4);
    ctx.textAlign = "left";
  }

  function drawSamplePanel(ctx, result, box) {
    panelTitle(ctx, box, "One sampled world", "heteroskedasticity means residual size is tied to x");
    var rows = result.example.rows;
    var fit = result.example.fit;
    var plot = { x: box.x + 42, y: box.y + 52, w: box.w - 60, h: box.h - 80 };
    var xMin = Math.min.apply(null, rows.map(function (r) { return r.x; })) - 0.25;
    var xMax = Math.max.apply(null, rows.map(function (r) { return r.x; })) + 0.25;
    var yValues = rows.map(function (r) { return r.y; }).concat(rows.map(function (r) { return 0.45 + result.params.slope * r.x; }));
    var yMin = Math.min.apply(null, yValues) - 0.8;
    var yMax = Math.max.apply(null, yValues) + 0.8;
    function xScale(x) { return plot.x + (x - xMin) / Math.max(1e-9, xMax - xMin) * plot.w; }
    function yScale(y) { return plot.y + plot.h - (y - yMin) / Math.max(1e-9, yMax - yMin) * plot.h; }
    drawAxis(ctx, plot);
    rows.forEach(function (row) {
      var radius = clamp(2.4 + row.sigma * 1.3, 2.5, 7.5);
      ctx.fillStyle = "rgba(37, 99, 235, 0.38)";
      ctx.beginPath();
      ctx.arc(xScale(row.x), yScale(row.y), radius, 0, Math.PI * 2);
      ctx.fill();
    });
    function line(intercept, slope, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(xScale(xMin), yScale(intercept + slope * xMin));
      ctx.lineTo(xScale(xMax), yScale(intercept + slope * xMax));
      ctx.stroke();
    }
    line(0.45, result.params.slope, COLORS.trueLine, 2.3);
    line(fit.intercept, fit.slope, COLORS.fitLine, 2.1);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("slope " + formatNumber(fit.slope), plot.x, plot.y + 10);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("black true line, gray fitted line", plot.x, plot.y + 35);
  }

  function drawBootstrapPanel(ctx, result, box) {
    panelTitle(ctx, box, "Bootstrap slope draws", "same dataset, different resampling contracts");
    var plot = { x: box.x + 42, y: box.y + 52, w: box.w - 62, h: box.h - 86 };
    var samples = result.example.bootSamples;
    var all = samples.residual.concat(samples.pairs).concat(samples.wild).concat([result.params.slope, result.example.fit.slope]);
    var min = Math.min.apply(null, all) - 0.08;
    var max = Math.max.apply(null, all) + 0.08;
    var bins = 18;
    var series = [
      { key: "residual", color: COLORS.residual, y: plot.y + 6 },
      { key: "pairs", color: COLORS.pairs, y: plot.y + plot.h / 3 + 6 },
      { key: "wild", color: COLORS.wild, y: plot.y + plot.h * 2 / 3 + 6 }
    ];
    drawAxis(ctx, plot);
    function xScale(value) { return plot.x + (value - min) / Math.max(1e-9, max - min) * plot.w; }
    series.forEach(function (row) {
      var counts = [];
      for (var i = 0; i < bins; i += 1) counts.push(0);
      samples[row.key].forEach(function (value) {
        var index = clamp(Math.floor((value - min) / Math.max(1e-9, max - min) * bins), 0, bins - 1);
        counts[index] += 1;
      });
      var maxCount = Math.max.apply(null, counts.concat([1]));
      var baseY = row.y + plot.h / 4;
      for (var b = 0; b < bins; b += 1) {
        var x = plot.x + b / bins * plot.w;
        var w = plot.w / bins - 2;
        var h = counts[b] / maxCount * (plot.h / 4 - 10);
        ctx.fillStyle = row.color;
        ctx.globalAlpha = 0.78;
        ctx.fillRect(x + 1, baseY - h, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.key, plot.x, baseY + 12);
    });
    ctx.strokeStyle = COLORS.trueLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xScale(result.params.slope), plot.y);
    ctx.lineTo(xScale(result.params.slope), plot.y + plot.h);
    ctx.stroke();
    ctx.strokeStyle = COLORS.fitLine;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(xScale(result.example.fit.slope), plot.y);
    ctx.lineTo(xScale(result.example.fit.slope), plot.y + plot.h);
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("true " + formatNumber(result.params.slope), plot.x, plot.y + 10);
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
      drawCoveragePanel(ctx, result, { x: margin, y: 28, w: panelW, h: 238 });
      drawWidthPanel(ctx, result, { x: margin, y: 296, w: panelW, h: 220 });
      drawSamplePanel(ctx, result, { x: margin, y: 546, w: panelW, h: 230 });
      drawBootstrapPanel(ctx, result, { x: margin, y: 806, w: panelW, h: 204 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawCoveragePanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 306 });
      drawWidthPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 306 });
      drawSamplePanel(ctx, result, { x: margin, y: 384, w: panelW2, h: 260 });
      drawBootstrapPanel(ctx, result, { x: margin + panelW2 + gap, y: 384, w: panelW2, h: 260 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      bootstraps: formatNumber(result.params.bootstraps),
      experiments: formatNumber(result.params.experiments),
      hetero: formatPercent(result.params.hetero * 100),
      leverage: formatPercent(result.params.leverage * 100),
      n: String(result.params.n),
      noise: formatNumber(result.params.noise)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Classic coverage", formatPercent(result.stats.classic.coverage * 100)),
        metric("HC1 coverage", formatPercent(result.stats.hc1.coverage * 100)),
        metric("Residual coverage", formatPercent(result.stats.residual.coverage * 100)),
        metric("Pairs coverage", formatPercent(result.stats.pairs.coverage * 100)),
        metric("Wild coverage", formatPercent(result.stats.wild.coverage * 100)),
        metric("Residual width", formatNumber(result.stats.residual.meanWidth))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-bootstrap-plan-lab]")).forEach(init);
  }

  var api = {
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.BootstrapSamplingPlanLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
