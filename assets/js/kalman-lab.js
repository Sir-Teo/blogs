(function (global) {
  "use strict";

  var COLORS = {
    truth: "#0f766e",
    estimate: "#2563eb",
    measurement: "#94a3b8",
    band: "#dbeafe",
    innovation: "#be123c",
    gain: "#7c3aed",
    missing: "#d97706",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc"
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
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="kalman-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
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

  function isMissing(t, dropout) {
    if (dropout <= 0) return false;
    var period = Math.max(5, Math.round(105 / dropout));
    return t > 8 && (t + 3) % period === 0;
  }

  function simulate(params) {
    var n = 170;
    var truthStd = Math.max(0.01, params.truthVol);
    var sensorStd = Math.max(0.01, params.sensorNoise);
    var modelQ = Math.max(0.01, params.modelProcess);
    var modelR = Math.max(0.01, params.modelSensor);
    var shockT = 92;
    var bias = params.bias;
    var dropout = params.dropout;
    var rows = [];
    var x = 0;
    var estimate = 0;
    var p = 16;
    var sumSquaredFilter = 0;
    var sumSquaredMeasurement = 0;
    var measurementCount = 0;
    var gainSum = 0;
    var gainCount = 0;
    var nll = 0;
    var zScores = [];
    var covered = 0;

    for (var t = 0; t < n; t += 1) {
      var drift = 0.025 * Math.sin(t / 18) + 0.014 * Math.cos(t / 33);
      x += drift + truthStd * normal(t, 0x51f15eed);
      if (t === shockT) x += params.shock;
      if (t === shockT + 1) x += params.shock * 0.35;
      var missing = isMissing(t, dropout);
      var y = missing ? null : x + bias + sensorStd * normal(t, 0xbadc0de);

      var pred = estimate;
      var pPred = p + modelQ * modelQ;
      var innovation = null;
      var innovationVar = pPred + modelR * modelR;
      var gain = 0;
      if (!missing) {
        innovation = y - pred;
        gain = pPred / innovationVar;
        estimate = pred + gain * innovation;
        p = (1 - gain) * pPred;
        nll += 0.5 * (Math.log(2 * Math.PI * innovationVar) + innovation * innovation / innovationVar);
        zScores.push(innovation / Math.sqrt(innovationVar));
        sumSquaredMeasurement += Math.pow(y - x, 2);
        measurementCount += 1;
        gainSum += gain;
        gainCount += 1;
      } else {
        estimate = pred;
        p = pPred;
      }
      var err = estimate - x;
      sumSquaredFilter += err * err;
      if (Math.abs(err) <= 1.96 * Math.sqrt(p)) covered += 1;
      rows.push({
        estimate: estimate,
        gain: gain,
        innovation: innovation,
        innovationVar: innovationVar,
        missing: missing,
        measurement: y,
        p: p,
        pPred: pPred,
        pred: pred,
        t: t,
        truth: x
      });
    }

    var zMean = 0;
    var zSd = 0;
    if (zScores.length) {
      zMean = zScores.reduce(function (sum, value) { return sum + value; }, 0) / zScores.length;
      var variance = zScores.reduce(function (sum, value) {
        var d = value - zMean;
        return sum + d * d;
      }, 0) / Math.max(1, zScores.length - 1);
      zSd = Math.sqrt(variance);
    }
    var filterRmse = Math.sqrt(sumSquaredFilter / n);
    var measurementRmse = Math.sqrt(sumSquaredMeasurement / Math.max(1, measurementCount));
    var avgGain = gainCount ? gainSum / gainCount : 0;
    return {
      avgGain: avgGain,
      coverage: covered / n,
      filterRmse: filterRmse,
      measurementRmse: measurementRmse,
      nll: nll / Math.max(1, measurementCount),
      params: params,
      rows: rows,
      shockT: shockT,
      zMean: zMean,
      zSd: zSd
    };
  }

  function extent(rows, accessors) {
    var min = Infinity;
    var max = -Infinity;
    rows.forEach(function (row) {
      accessors.forEach(function (fn) {
        var value = fn(row);
        if (value === null || value === undefined || !isFinite(value)) return;
        if (value < min) min = value;
        if (value > max) max = value;
      });
    });
    if (!isFinite(min) || !isFinite(max)) return { min: -1, max: 1 };
    if (max === min) {
      min -= 1;
      max += 1;
    }
    var pad = (max - min) * 0.08;
    return { min: min - pad, max: max + pad };
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

  function drawLine(ctx, points, xScale, yScale, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    var started = false;
    points.forEach(function (point) {
      if (point.y === null || point.y === undefined || !isFinite(point.y)) {
        started = false;
        return;
      }
      var x = xScale(point.t);
      var y = yScale(point.y);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  function drawStatePanel(ctx, result, box) {
    panelTitle(ctx, box, "State vs. measurements", "the filter is a belief, not the sensor");
    var rows = result.rows;
    var plot = { x: box.x + 38, y: box.y + 44, w: box.w - 50, h: box.h - 72 };
    var domain = extent(rows, [
      function (r) { return r.truth; },
      function (r) { return r.estimate + 1.96 * Math.sqrt(r.p); },
      function (r) { return r.estimate - 1.96 * Math.sqrt(r.p); },
      function (r) { return r.measurement; }
    ]);
    function xScale(t) { return plot.x + t / (rows.length - 1) * plot.w; }
    function yScale(v) { return plot.y + plot.h - (v - domain.min) / (domain.max - domain.min) * plot.h; }
    drawAxis(ctx, plot);

    ctx.fillStyle = COLORS.band;
    ctx.beginPath();
    rows.forEach(function (r, i) {
      var y = yScale(r.estimate + 1.96 * Math.sqrt(r.p));
      var x = xScale(r.t);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (var j = rows.length - 1; j >= 0; j -= 1) {
      var row = rows[j];
      ctx.lineTo(xScale(row.t), yScale(row.estimate - 1.96 * Math.sqrt(row.p)));
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = COLORS.missing;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(xScale(result.shockT), plot.y);
    ctx.lineTo(xScale(result.shockT), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);

    rows.forEach(function (r) {
      if (r.measurement === null) return;
      ctx.fillStyle = COLORS.measurement;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(xScale(r.t), yScale(r.measurement), 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    drawLine(ctx, rows.map(function (r) { return { t: r.t, y: r.truth }; }), xScale, yScale, COLORS.truth, 2.2);
    drawLine(ctx, rows.map(function (r) { return { t: r.t, y: r.estimate }; }), xScale, yScale, COLORS.estimate, 2.4);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(formatNumber(domain.max), plot.x - 6, plot.y + 4);
    ctx.fillText(formatNumber(domain.min), plot.x - 6, plot.y + plot.h);
    ctx.textAlign = "left";
  }

  function drawGainPanel(ctx, result, box) {
    panelTitle(ctx, box, "Kalman gain", "how much the next measurement can move belief");
    var rows = result.rows;
    var plot = { x: box.x + 38, y: box.y + 44, w: box.w - 52, h: box.h - 72 };
    function xScale(t) { return plot.x + t / (rows.length - 1) * plot.w; }
    function yScale(v) { return plot.y + plot.h - clamp(v, 0, 1) * plot.h; }
    drawAxis(ctx, plot);
    drawLine(ctx, rows.map(function (r) { return { t: r.t, y: r.gain }; }), xScale, yScale, COLORS.gain, 2.2);
    rows.forEach(function (r) {
      if (!r.missing) return;
      ctx.fillStyle = COLORS.missing;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(xScale(r.t) - 1, plot.y, 2, plot.h);
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(formatPercent(result.avgGain * 100), plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("average gain", plot.x + 82, plot.y + 22);
    ctx.textAlign = "right";
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(String(tick), plot.x - 6, yScale(tick) + 4);
    });
    ctx.textAlign = "left";
  }

  function drawInnovationPanel(ctx, result, box) {
    panelTitle(ctx, box, "Innovations", "surprises should look centered and correctly scaled");
    var rows = result.rows;
    var values = rows.map(function (r) {
      if (r.innovation === null) return null;
      return r.innovation / Math.sqrt(r.innovationVar);
    });
    var plot = { x: box.x + 38, y: box.y + 44, w: box.w - 52, h: box.h - 72 };
    var domain = { min: -4, max: 4 };
    function xScale(t) { return plot.x + t / (rows.length - 1) * plot.w; }
    function yScale(v) { return plot.y + plot.h - (v - domain.min) / (domain.max - domain.min) * plot.h; }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.rule;
    ctx.setLineDash([4, 5]);
    [-2, 0, 2].forEach(function (tick) {
      ctx.beginPath();
      ctx.moveTo(plot.x, yScale(tick));
      ctx.lineTo(plot.x + plot.w, yScale(tick));
      ctx.stroke();
    });
    ctx.setLineDash([]);
    drawLine(ctx, values.map(function (v, i) { return { t: i, y: v }; }), xScale, yScale, COLORS.innovation, 1.8);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 19px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("mean " + formatNumber(result.zMean), plot.x, plot.y + 10);
    ctx.fillText("sd " + formatNumber(result.zSd), plot.x, plot.y + 36);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    [-2, 0, 2].forEach(function (tick) {
      ctx.fillText(String(tick), plot.x - 6, yScale(tick) + 4);
    });
    ctx.textAlign = "left";
  }

  function drawScorePanel(ctx, result, box) {
    panelTitle(ctx, box, "Loss ledger", "smoothing is only useful if it earns its delay");
    var plot = { x: box.x, y: box.y + 50, w: box.w, h: box.h - 64 };
    var rows = [
      { label: "measurement RMSE", value: result.measurementRmse, color: COLORS.measurement },
      { label: "filter RMSE", value: result.filterRmse, color: COLORS.estimate },
      { label: "avg neg log likelihood", value: result.nll, color: COLORS.innovation },
      { label: "95% band coverage", value: result.coverage, color: COLORS.truth, percent: true }
    ];
    var max = Math.max.apply(null, rows.slice(0, 3).map(function (row) { return row.value; }).concat([1]));
    var rowGap = Math.min(38, Math.max(22, (plot.h - 18) / Math.max(1, rows.length - 1)));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      var scaleValue = row.percent ? row.value : row.value / max;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 136, y, plot.w - 178, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 136, y, Math.max(1, (plot.w - 178) * clamp(scaleValue, 0, 1)), 18);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.label, plot.x, y + 13);
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(row.percent ? formatPercent(row.value * 100) : formatNumber(row.value), plot.x + plot.w, y + 13);
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
      drawStatePanel(ctx, result, { x: margin, y: 28, w: panelW, h: 292 });
      drawGainPanel(ctx, result, { x: margin, y: 348, w: panelW, h: 176 });
      drawInnovationPanel(ctx, result, { x: margin, y: 552, w: panelW, h: 176 });
      drawScorePanel(ctx, result, { x: margin, y: 756, w: panelW, h: 148 });
    } else {
      var gap = 42;
      var topW = width - margin * 2;
      var panelW2 = (topW - gap) / 2;
      drawStatePanel(ctx, result, { x: margin, y: 30, w: topW, h: 310 });
      drawGainPanel(ctx, result, { x: margin, y: 386, w: panelW2, h: 226 });
      drawInnovationPanel(ctx, result, { x: margin + panelW2 + gap, y: 386, w: panelW2, h: 226 });
      drawScorePanel(ctx, result, { x: margin, y: 614, w: topW, h: 54 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var values = {
      bias: formatNumber(params.bias),
      dropout: formatPercent(params.dropout),
      modelProcess: formatNumber(params.modelProcess),
      modelSensor: formatNumber(params.modelSensor),
      sensorNoise: formatNumber(params.sensorNoise),
      shock: formatNumber(params.shock),
      truthVol: formatNumber(params.truthVol)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Filter RMSE", formatNumber(result.filterRmse)),
        metric("Measurement RMSE", formatNumber(result.measurementRmse)),
        metric("Avg gain", formatPercent(result.avgGain * 100)),
        metric("Innovation sd", formatNumber(result.zSd)),
        metric("Band coverage", formatPercent(result.coverage * 100)),
        metric("NLL / obs", formatNumber(result.nll))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-kalman-lab]")).forEach(init);
  }

  var api = {
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.KalmanLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
