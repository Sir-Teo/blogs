(function (global) {
  "use strict";

  var DIMENSIONS = [2, 3, 5, 10, 25, 50];
  var RADII = [0, 0.5, 1, 2, 3, 4, 5];
  var SIGMAS = [0.5, 1, 1.5];
  var TRIALS = [1500, 4000, 8000];
  var CURVE_RADII = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d8e0e8",
    grid: "#edf2f7",
    mean: "#172026",
    js: "#7c3aed",
    pp: "#0f766e",
    noisy: "#d97706",
    bad: "#be123c",
    panel: "#f8fafc",
    background: "#ffffff"
  };

  function nearestAllowed(value, allowed, fallback) {
    var numeric = Number(value);
    if (!isFinite(numeric)) return fallback;
    var best = allowed[0];
    var bestDistance = Infinity;
    allowed.forEach(function (candidate) {
      var distance = Math.abs(candidate - numeric);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    });
    return best == null ? fallback : best;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      dimension: nearestAllowed(raw.dimension == null ? 10 : raw.dimension, DIMENSIONS, 10),
      radius: nearestAllowed(raw.radius == null ? 1 : raw.radius, RADII, 1),
      sigma: nearestAllowed(raw.sigma == null ? 1 : raw.sigma, SIGMAS, 1),
      trials: nearestAllowed(raw.trials == null ? 4000 : raw.trials, TRIALS, 4000)
    };
  }

  function hashString(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      var t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalSource(seed) {
    var rng = mulberry32(seed >>> 0);
    var spare = null;
    return function () {
      if (spare !== null) {
        var saved = spare;
        spare = null;
        return saved;
      }
      var u = 0;
      var v = 0;
      while (u <= 1e-12) u = rng();
      while (v <= 1e-12) v = rng();
      var mag = Math.sqrt(-2 * Math.log(u));
      var angle = 2 * Math.PI * v;
      spare = mag * Math.sin(angle);
      return mag * Math.cos(angle);
    };
  }

  function trueDirection(p) {
    var raw = [];
    var norm2 = 0;
    for (var i = 0; i < p; i += 1) {
      var v = Math.sin((i + 1) * 0.77) + 0.55 * Math.cos((i + 1) * 1.41);
      v += (i % 4 === 0 ? 0.22 : -0.06);
      raw.push(v);
      norm2 += v * v;
    }
    var scale = Math.sqrt(p / Math.max(norm2, 1e-12));
    return raw.map(function (v) { return v * scale; });
  }

  function makeTheta(p, sigma, radius) {
    var direction = trueDirection(p);
    return direction.map(function (v) { return v * sigma * radius; });
  }

  function emptyHistogram() {
    return {
      min: -1.6,
      max: 1.6,
      bins: new Array(24).fill(0),
      under: 0,
      over: 0
    };
  }

  function addHistogram(hist, value) {
    if (value < hist.min) {
      hist.under += 1;
      return;
    }
    if (value > hist.max) {
      hist.over += 1;
      return;
    }
    var t = (value - hist.min) / (hist.max - hist.min);
    var index = Math.min(hist.bins.length - 1, Math.max(0, Math.floor(t * hist.bins.length)));
    hist.bins[index] += 1;
  }

  function evaluatePoint(p, sigma, radius, trials, seed, detail) {
    var theta = makeTheta(p, sigma, radius);
    var normal = normalSource(seed || hashString("point:" + p + ":" + sigma + ":" + radius + ":" + trials));
    var shrinkNumerator = Math.max(0, (p - 2) * sigma * sigma);
    var mleLossTotal = 0;
    var jsLossTotal = 0;
    var ppLossTotal = 0;
    var jsWins = 0;
    var ppWins = 0;
    var negativeCount = 0;
    var jsFactorTotal = 0;
    var ppFactorTotal = 0;
    var hist = detail ? emptyHistogram() : null;
    var sample = null;

    for (var trial = 0; trial < trials; trial += 1) {
      var x = new Array(p);
      var norm2 = 0;
      var mleLoss = 0;
      for (var i = 0; i < p; i += 1) {
        var observed = theta[i] + sigma * normal();
        x[i] = observed;
        norm2 += observed * observed;
        var mleError = observed - theta[i];
        mleLoss += mleError * mleError;
      }

      var jsFactor = shrinkNumerator === 0 ? 1 : 1 - shrinkNumerator / Math.max(norm2, 1e-12);
      var ppFactor = Math.max(0, jsFactor);
      var jsLoss = 0;
      var ppLoss = 0;
      var jsEstimate = detail && trial === 0 ? [] : null;
      var ppEstimate = detail && trial === 0 ? [] : null;

      for (var j = 0; j < p; j += 1) {
        var jsValue = jsFactor * x[j];
        var ppValue = ppFactor * x[j];
        var jsError = jsValue - theta[j];
        var ppError = ppValue - theta[j];
        jsLoss += jsError * jsError;
        ppLoss += ppError * ppError;
        if (detail && trial === 0) {
          jsEstimate.push(jsValue);
          ppEstimate.push(ppValue);
        }
      }

      mleLossTotal += mleLoss;
      jsLossTotal += jsLoss;
      ppLossTotal += ppLoss;
      jsFactorTotal += jsFactor;
      ppFactorTotal += ppFactor;
      if (jsFactor < 0) negativeCount += 1;
      if (jsLoss < mleLoss) jsWins += 1;
      if (ppLoss < mleLoss) ppWins += 1;
      if (hist) addHistogram(hist, (ppLoss - mleLoss) / Math.max(p * sigma * sigma, 1e-12));
      if (detail && trial === 0) {
        sample = {
          theta: theta.slice(),
          observed: x.slice(),
          js: jsEstimate,
          positivePart: ppEstimate,
          jsFactor: jsFactor,
          positivePartFactor: ppFactor
        };
      }
    }

    return {
      p: p,
      sigma: sigma,
      radius: radius,
      trials: trials,
      thetaNorm: sigma * radius * Math.sqrt(p),
      theoreticalMeanRisk: p * sigma * sigma,
      mleRisk: mleLossTotal / trials,
      jsRisk: jsLossTotal / trials,
      positivePartRisk: ppLossTotal / trials,
      jsWinRate: jsWins / trials,
      positivePartWinRate: ppWins / trials,
      negativeFactorRate: negativeCount / trials,
      averageJsFactor: jsFactorTotal / trials,
      averagePositivePartFactor: ppFactorTotal / trials,
      histogram: hist,
      sample: sample
    };
  }

  function riskCurve(params) {
    var curveTrials = Math.min(1600, params.trials);
    return CURVE_RADII.map(function (radius, index) {
      return evaluatePoint(
        params.dimension,
        params.sigma,
        radius,
        curveTrials,
        hashString("curve:" + params.dimension + ":" + params.sigma + ":" + radius + ":" + index),
        false
      );
    });
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    return {
      params: params,
      point: evaluatePoint(
        params.dimension,
        params.sigma,
        params.radius,
        params.trials,
        hashString("detail:" + params.dimension + ":" + params.sigma + ":" + params.radius + ":" + params.trials),
        true
      ),
      curve: riskCurve(params)
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return Number(value).toFixed(digits == null ? 3 : digits);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value, tone) {
    var klass = "stein-lab__metric";
    if (tone) klass += " stein-lab__metric--" + tone;
    return '<div class="' + klass + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function updateControlValues(root, params) {
    Object.keys(params).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input) input.value = String(params[key]);
    });
  }

  function renderMetrics(root, data) {
    var point = data.point;
    var saved = 1 - point.positivePartRisk / point.mleRisk;
    var zone = point.p <= 2 ? "mean admissible" : "shrinkage zone";
    var zoneTone = point.p <= 2 ? "warn" : "good";
    var html = [
      metric("Theorem zone", zone, zoneTone),
      metric("Usual total risk", formatNumber(point.mleRisk, 3)),
      metric("JS total risk", formatNumber(point.jsRisk, 3), point.jsRisk < point.mleRisk ? "good" : ""),
      metric("Positive-part risk", formatNumber(point.positivePartRisk, 3), point.positivePartRisk < point.mleRisk ? "good" : ""),
      metric("Risk saved", formatPercent(saved, 1), saved > 0 ? "good" : "warn"),
      metric("Average shrink", formatNumber(point.averagePositivePartFactor, 3)),
      metric("Factor clamped", formatPercent(point.negativeFactorRate, 1)),
      metric("Trial win rate", formatPercent(point.positivePartWinRate, 1))
    ].join("");
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) metrics.innerHTML = html;
  }

  function setFont(ctx, size, weight) {
    ctx.font = (weight || 400) + " " + size + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  }

  function drawLine(ctx, points, color, width, dash) {
    if (!points.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach(function (point, index) {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fillPanel(ctx, x, y, w, h) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.stroke();
  }

  function drawLegendLine(ctx, x, y, color, label, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 24, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = COLORS.muted;
    setFont(ctx, 12, 600);
    ctx.fillText(label, x + 31, y + 4);
  }

  function drawRiskChart(ctx, data, box) {
    var curve = data.curve;
    var params = data.params;
    var x = box.x;
    var y = box.y;
    var w = box.w;
    var h = box.h;
    fillPanel(ctx, x, y, w, h);

    setFont(ctx, 15, 750);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("Risk curve", x + 18, y + 28);
    setFont(ctx, 12, 500);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("loss per coordinate across signal radii", x + 18, y + 47);

    var px = x + 50;
    var py = y + 76;
    var pw = w - 78;
    var ph = h - 116;
    var maxY = params.sigma * params.sigma * 1.25;
    curve.forEach(function (row) {
      maxY = Math.max(maxY, row.jsRisk / row.p, row.positivePartRisk / row.p, row.mleRisk / row.p);
    });
    maxY *= 1.06;
    var xMin = 0;
    var xMax = 5;

    function sx(radius) {
      return px + (radius - xMin) / (xMax - xMin) * pw;
    }

    function sy(riskPerCoordinate) {
      return py + ph - riskPerCoordinate / maxY * ph;
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    setFont(ctx, 11, 500);
    ctx.fillStyle = COLORS.muted;
    for (var gy = 0; gy <= 4; gy += 1) {
      var val = maxY * gy / 4;
      var yy = sy(val);
      ctx.beginPath();
      ctx.moveTo(px, yy);
      ctx.lineTo(px + pw, yy);
      ctx.stroke();
      ctx.fillText(formatNumber(val, 2), x + 14, yy + 4);
    }
    for (var gx = 0; gx <= 5; gx += 1) {
      var xx = sx(gx);
      ctx.beginPath();
      ctx.moveTo(xx, py);
      ctx.lineTo(xx, py + ph);
      ctx.stroke();
      ctx.fillText(String(gx), xx - 3, py + ph + 20);
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + ph);
    ctx.lineTo(px + pw, py + ph);
    ctx.stroke();

    var meanY = sy(params.sigma * params.sigma);
    drawLine(ctx, [{ x: px, y: meanY }, { x: px + pw, y: meanY }], COLORS.mean, 2, [6, 5]);
    drawLine(ctx, curve.map(function (row) {
      return { x: sx(row.radius), y: sy(row.jsRisk / row.p) };
    }), COLORS.js, 2.4);
    drawLine(ctx, curve.map(function (row) {
      return { x: sx(row.radius), y: sy(row.positivePartRisk / row.p) };
    }), COLORS.pp, 2.8);

    var currentX = sx(params.radius);
    ctx.strokeStyle = "rgba(92, 104, 114, 0.42)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(currentX, py);
    ctx.lineTo(currentX, py + ph);
    ctx.stroke();
    ctx.setLineDash([]);

    var currentY = sy(data.point.positivePartRisk / data.point.p);
    ctx.fillStyle = COLORS.pp;
    ctx.beginPath();
    ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.background;
    ctx.lineWidth = 2;
    ctx.stroke();

    drawLegendLine(ctx, x + 18, y + h - 38, COLORS.mean, "usual", [6, 5]);
    drawLegendLine(ctx, x + 116, y + h - 38, COLORS.js, "JS");
    drawLegendLine(ctx, x + 190, y + h - 38, COLORS.pp, "positive-part");
  }

  function drawSamplePanel(ctx, data, box) {
    var sample = data.point.sample;
    var x = box.x;
    var y = box.y;
    var w = box.w;
    var h = box.h;
    fillPanel(ctx, x, y, w, h);

    setFont(ctx, 15, 750);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("One noisy vector", x + 18, y + 28);
    setFont(ctx, 12, 500);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("first coordinates, same draw", x + 18, y + 47);

    var n = Math.min(12, sample.theta.length);
    var values = [];
    for (var i = 0; i < n; i += 1) {
      values.push(sample.theta[i], sample.observed[i], sample.positivePart[i]);
    }
    var maxAbs = values.reduce(function (m, v) { return Math.max(m, Math.abs(v)); }, 1e-6) * 1.15;
    var px = x + 28;
    var py = y + 82;
    var pw = w - 50;
    var ph = h - 145;
    var zeroY = py + ph / 2;

    function sy(value) {
      return zeroY - value / maxAbs * (ph / 2);
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var gy = -1; gy <= 1; gy += 1) {
      var yy = sy(gy * maxAbs / 2);
      ctx.beginPath();
      ctx.moveTo(px, yy);
      ctx.lineTo(px + pw, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(px, zeroY);
    ctx.lineTo(px + pw, zeroY);
    ctx.stroke();

    var step = pw / n;
    for (var j = 0; j < n; j += 1) {
      var cx = px + j * step + step * 0.5;
      var barW = Math.max(4, step * 0.23);
      var observedY = sy(sample.observed[j]);
      var ppY = sy(sample.positivePart[j]);
      ctx.fillStyle = "rgba(217, 119, 6, 0.75)";
      ctx.fillRect(cx - barW - 1, Math.min(zeroY, observedY), barW, Math.abs(zeroY - observedY));
      ctx.fillStyle = "rgba(15, 118, 110, 0.78)";
      ctx.fillRect(cx + 1, Math.min(zeroY, ppY), barW, Math.abs(zeroY - ppY));
      ctx.fillStyle = COLORS.mean;
      ctx.beginPath();
      ctx.arc(cx, sy(sample.theta[j]), 2.7, 0, Math.PI * 2);
      ctx.fill();
      if (j % 3 === 0) {
        ctx.fillStyle = COLORS.muted;
        setFont(ctx, 10, 500);
        ctx.fillText(String(j + 1), cx - 3, py + ph + 18);
      }
    }

    setFont(ctx, 12, 650);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("shrink factor " + formatNumber(sample.positivePartFactor, 3), x + 18, y + h - 48);
    setFont(ctx, 11, 500);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("black dots true, orange observed, green shrunk", x + 18, y + h - 28);
  }

  function drawHistogram(ctx, data, box) {
    var hist = data.point.histogram;
    var x = box.x;
    var y = box.y;
    var w = box.w;
    var h = box.h;
    fillPanel(ctx, x, y, w, h);

    setFont(ctx, 15, 750);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("Trial-level loss ledger", x + 18, y + 28);
    setFont(ctx, 12, 500);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("positive-part loss minus usual loss, scaled by p sigma^2", x + 18, y + 47);

    var px = x + 42;
    var py = y + 70;
    var pw = w - 72;
    var ph = h - 112;
    var maxCount = hist.bins.reduce(function (m, v) { return Math.max(m, v); }, 1);
    var zeroT = (0 - hist.min) / (hist.max - hist.min);
    var zeroX = px + zeroT * pw;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var gy = 0; gy <= 3; gy += 1) {
      var yy = py + ph - gy / 3 * ph;
      ctx.beginPath();
      ctx.moveTo(px, yy);
      ctx.lineTo(px + pw, yy);
      ctx.stroke();
    }

    var binW = pw / hist.bins.length;
    hist.bins.forEach(function (count, index) {
      var left = px + index * binW;
      var center = hist.min + (index + 0.5) / hist.bins.length * (hist.max - hist.min);
      var bh = count / maxCount * ph;
      ctx.fillStyle = center <= 0 ? "rgba(15, 118, 110, 0.72)" : "rgba(190, 18, 60, 0.68)";
      ctx.fillRect(left + 1, py + ph - bh, Math.max(1, binW - 2), bh);
    });

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(px, py + ph);
    ctx.lineTo(px + pw, py + ph);
    ctx.stroke();
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(zeroX, py);
    ctx.lineTo(zeroX, py + ph + 6);
    ctx.stroke();

    setFont(ctx, 11, 600);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("better", px, py + ph + 24);
    ctx.fillText("worse", zeroX + 8, py + ph + 24);
    ctx.fillText("0", zeroX - 3, py + ph + 24);

    var underOver = "";
    if (hist.under || hist.over) {
      underOver = " clipped tails: " + hist.under + " left, " + hist.over + " right";
    }
    setFont(ctx, 11, 500);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("Green bars are trials where shrinkage lowered realized loss." + underOver, x + 18, y + h - 18);
  }

  function drawLab(canvas, data) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawRiskChart(ctx, data, { x: 18, y: 18, w: 560, h: 390 });
    drawSamplePanel(ctx, data, { x: 596, y: 18, w: 286, h: 390 });
    drawHistogram(ctx, data, { x: 18, y: 428, w: 864, h: 244 });
  }

  function init(root) {
    var canvas = root.querySelector("[data-canvas]");
    var scheduled = false;

    function render() {
      scheduled = false;
      var data = simulate(paramsFromRoot(root));
      updateControlValues(root, data.params);
      renderMetrics(root, data);
      drawLab(canvas, data);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      global.requestAnimationFrame ? global.requestAnimationFrame(render) : setTimeout(render, 0);
    }

    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("change", schedule);
      input.addEventListener("input", schedule);
    });
    schedule();
  }

  var api = {
    cleanParams: cleanParams,
    evaluatePoint: evaluatePoint,
    riskCurve: riskCurve,
    simulate: simulate,
    makeTheta: makeTheta
  };

  global.JamesSteinLab = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", function () {
      global.document.querySelectorAll("[data-james-stein-lab]").forEach(init);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
