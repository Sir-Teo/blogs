(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    left: "#2563eb",
    right: "#be123c",
    fit: "#0f766e",
    naive: "#b45309",
    trueEffect: "#172026",
    warning: "#d97706",
    bad: "#be123c",
    ok: "#0f766e"
  };

  var DEFAULTS = {
    bandwidth: 32,
    curvature: 45,
    effect: 100,
    manipulation: 0,
    noise: 32,
    samples: 1200,
    seed: 47
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      bandwidth: snap(raw.bandwidth, DEFAULTS.bandwidth, 8, 80, 1) / 100,
      curvature: snap(raw.curvature, DEFAULTS.curvature, 0, 100, 1) / 100,
      effect: snap(raw.effect, DEFAULTS.effect, 0, 180, 5) / 100,
      manipulation: snap(raw.manipulation, DEFAULTS.manipulation, 0, 90, 1) / 100,
      noise: snap(raw.noise, DEFAULTS.noise, 5, 90, 1) / 100,
      samples: snap(raw.samples, DEFAULTS.samples, 400, 2600, 100),
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

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function baseline(x, ability, params) {
    var c = params.curvature;
    return 0.22 + 0.55 * x + (0.45 + 1.45 * c) * x * x - 0.34 * x * x * x + 0.34 * ability;
  }

  function generateData(raw) {
    var params = cleanParams(raw);
    var rand = makeRng(params.seed * 7919 + params.samples * 17);
    var data = [];
    var shifted = 0;
    for (var i = 0; i < params.samples; i += 1) {
      var latentX = 2 * rand() - 1;
      var ability = normal(rand);
      var observedX = latentX;
      var nearLeft = latentX >= -0.24 && latentX < 0;
      var incentive = 1 / (1 + Math.exp(-1.35 * (ability - 0.15)));
      if (nearLeft && rand() < params.manipulation * incentive) {
        observedX = Math.min(0.24, -0.30 * latentX + 0.025 * rand());
        shifted += 1;
      }
      var treated = observedX >= 0 ? 1 : 0;
      var y0 = baseline(latentX, ability, params);
      var outcome = y0 + params.effect * treated + params.noise * normal(rand);
      var covariate = ability + 0.16 * latentX + 0.18 * normal(rand);
      data.push({
        ability: ability,
        covariate: covariate,
        latentX: latentX,
        shifted: observedX !== latentX,
        treated: treated,
        x: observedX,
        y: outcome,
        y0: y0
      });
    }
    return { data: data, params: params, shifted: shifted };
  }

  function mean(values) {
    if (!values.length) return NaN;
    var total = 0;
    values.forEach(function (value) { total += value; });
    return total / values.length;
  }

  function variance(values, avg) {
    if (values.length < 2) return NaN;
    var total = 0;
    values.forEach(function (value) {
      var d = value - avg;
      total += d * d;
    });
    return total / (values.length - 1);
  }

  function localLinear(data, field, h) {
    function fitSide(side) {
      var s0 = 0;
      var s1 = 0;
      var s2 = 0;
      var t0 = 0;
      var t1 = 0;
      var rows = 0;
      var residuals = [];
      data.forEach(function (row) {
        if (side < 0 && !(row.x < 0 && row.x >= -h)) return;
        if (side > 0 && !(row.x >= 0 && row.x <= h)) return;
        var u = Math.abs(row.x / h);
        var w = Math.max(0, 1 - u);
        var x = row.x;
        var y = row[field];
        s0 += w;
        s1 += w * x;
        s2 += w * x * x;
        t0 += w * y;
        t1 += w * x * y;
        rows += 1;
      });
      var det = s0 * s2 - s1 * s1;
      if (rows < 3 || Math.abs(det) < 1e-12) {
        return { intercept: NaN, slope: NaN, rows: rows, se: NaN };
      }
      var intercept = (t0 * s2 - t1 * s1) / det;
      var slope = (s0 * t1 - s1 * t0) / det;
      data.forEach(function (row) {
        if (side < 0 && !(row.x < 0 && row.x >= -h)) return;
        if (side > 0 && !(row.x >= 0 && row.x <= h)) return;
        var u = Math.abs(row.x / h);
        var w = Math.max(0, 1 - u);
        residuals.push({ e: row[field] - intercept - slope * row.x, w: w });
      });
      var rss = 0;
      var weightTotal = 0;
      residuals.forEach(function (row) {
        rss += row.w * row.e * row.e;
        weightTotal += row.w;
      });
      var sigma2 = rows > 2 ? rss / Math.max(1, weightTotal - 2) : NaN;
      var se = isFinite(sigma2) ? Math.sqrt(Math.max(0, sigma2 * s2 / det)) : NaN;
      return { intercept: intercept, slope: slope, rows: rows, se: se };
    }
    var left = fitSide(-1);
    var right = fitSide(1);
    var estimate = right.intercept - left.intercept;
    var se = Math.sqrt(left.se * left.se + right.se * right.se);
    return { estimate: estimate, left: left, right: right, se: se };
  }

  function localMean(data, field, h) {
    var left = [];
    var right = [];
    data.forEach(function (row) {
      if (row.x < 0 && row.x >= -h) left.push(row[field]);
      if (row.x >= 0 && row.x <= h) right.push(row[field]);
    });
    return {
      estimate: mean(right) - mean(left),
      leftN: left.length,
      rightN: right.length
    };
  }

  function naiveDifference(data) {
    var left = [];
    var right = [];
    data.forEach(function (row) {
      if (row.treated) right.push(row.y);
      else left.push(row.y);
    });
    return mean(right) - mean(left);
  }

  function densityJump(data, h) {
    var window = Math.max(0.06, h * 0.5);
    var left = 0;
    var right = 0;
    data.forEach(function (row) {
      if (row.x < 0 && row.x >= -window) left += 1;
      if (row.x >= 0 && row.x <= window) right += 1;
    });
    return {
      left: left,
      logRatio: Math.log((right + 0.5) / (left + 0.5)),
      right: right,
      window: window
    };
  }

  function bandwidthGrid(data, params) {
    var out = [];
    for (var raw = 8; raw <= 80; raw += 3) {
      var h = raw / 100;
      var fit = localLinear(data, "y", h);
      out.push({
        estimate: fit.estimate,
        h: h,
        rows: fit.left.rows + fit.right.rows,
        se: fit.se
      });
    }
    return out;
  }

  function evaluate(raw) {
    var generated = generateData(raw);
    var data = generated.data;
    var params = generated.params;
    var fit = localLinear(data, "y", params.bandwidth);
    var covariateFit = localLinear(data, "covariate", params.bandwidth);
    var means = localMean(data, "y", params.bandwidth);
    var density = densityJump(data, params.bandwidth);
    return {
      covariateFit: covariateFit,
      data: data,
      density: density,
      fit: fit,
      grid: bandwidthGrid(data, params),
      localMean: means,
      naive: naiveDifference(data),
      params: params,
      shifted: generated.shifted,
      trueEffect: params.effect
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="rd-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || 720));
    var height = Math.max(650, Math.round(rect.height || canvas.clientHeight || 840));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || 500) + " " + (opts.size || 12) + "px " + (opts.family || "system-ui, sans-serif");
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(value, x, y);
  }

  function roundedRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 12, box.y + 22, { size: 12, weight: 780 });
    if (subtitle) text(ctx, subtitle, box.x + 12, box.y + 39, { color: COLORS.muted, size: 10 });
  }

  function extentY(data) {
    var min = Infinity;
    var max = -Infinity;
    data.forEach(function (row) {
      min = Math.min(min, row.y);
      max = Math.max(max, row.y);
    });
    var pad = Math.max(0.4, (max - min) * 0.12);
    return { min: min - pad, max: max + pad };
  }

  function drawScatter(ctx, box, result) {
    panel(ctx, box, "local comparison at the cutoff", "triangular-kernel local linear fit");
    var data = result.data;
    var yExt = extentY(data);
    var left = box.x + 38;
    var top = box.y + 50;
    var w = box.w - 56;
    var h = box.h - 74;
    function mapX(x) { return left + (x + 1) / 2 * w; }
    function mapY(y) { return top + (yExt.max - y) / (yExt.max - yExt.min) * h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var gx = -1; gx <= 1.001; gx += 0.5) {
      ctx.beginPath();
      ctx.moveTo(mapX(gx), top);
      ctx.lineTo(mapX(gx), top + h);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(mapX(0), top);
    ctx.lineTo(mapX(0), top + h);
    ctx.stroke();
    ctx.setLineDash([]);

    var hband = result.params.bandwidth;
    ctx.fillStyle = "rgba(15,118,110,0.08)";
    ctx.fillRect(mapX(-hband), top, mapX(hband) - mapX(-hband), h);

    var stride = Math.max(1, Math.floor(data.length / 700));
    for (var i = 0; i < data.length; i += stride) {
      var row = data[i];
      ctx.fillStyle = row.treated ? "rgba(190,18,60,0.45)" : "rgba(37,99,235,0.43)";
      if (row.shifted) ctx.fillStyle = "rgba(217,119,6,0.74)";
      ctx.beginPath();
      ctx.arc(mapX(row.x), mapY(row.y), row.shifted ? 2.8 : 2.1, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.strokeStyle = COLORS.fit;
    ctx.lineWidth = 2.2;
    function drawFit(side) {
      var fit = side < 0 ? result.fit.left : result.fit.right;
      if (!isFinite(fit.intercept)) return;
      var a = side < 0 ? -hband : 0;
      var b = side < 0 ? 0 : hband;
      ctx.beginPath();
      ctx.moveTo(mapX(a), mapY(fit.intercept + fit.slope * a));
      ctx.lineTo(mapX(b), mapY(fit.intercept + fit.slope * b));
      ctx.stroke();
    }
    drawFit(-1);
    drawFit(1);
    text(ctx, "cutoff", mapX(0) + 5, top + 14, { color: COLORS.text, size: 10 });
    text(ctx, "bandwidth h=" + result.params.bandwidth.toFixed(2), mapX(-hband) + 4, top + h - 8, { color: COLORS.fit, size: 10 });
  }

  function drawBandwidth(ctx, box, result) {
    panel(ctx, box, "bandwidth sensitivity", "RD estimate as the neighborhood changes");
    var left = box.x + 42;
    var top = box.y + 50;
    var w = box.w - 60;
    var h = box.h - 74;
    var values = result.grid.map(function (row) { return row.estimate; }).filter(isFinite);
    values.push(result.trueEffect, result.fit.estimate, result.naive);
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = Math.max(0.25, (max - min) * 0.2);
    min -= pad;
    max += pad;
    function mapX(v) { return left + (v - 0.08) / (0.80 - 0.08) * w; }
    function mapY(v) { return top + (max - v) / (max - min) * h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var gy = 0; gy <= 4; gy += 1) {
      var yy = top + gy * h / 4;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(left + w, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    ctx.strokeStyle = COLORS.trueEffect;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(left, mapY(result.trueEffect));
    ctx.lineTo(left + w, mapY(result.trueEffect));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.fit;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.grid.forEach(function (row, i) {
      var px = mapX(row.h);
      var py = mapY(row.estimate);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.fillStyle = COLORS.warning;
    ctx.beginPath();
    ctx.arc(mapX(result.params.bandwidth), mapY(result.fit.estimate), 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = COLORS.naive;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(left, mapY(result.naive));
    ctx.lineTo(left + w, mapY(result.naive));
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "true", left + 5, mapY(result.trueEffect) - 5, { color: COLORS.trueEffect, size: 10 });
    text(ctx, "naive", left + 5, mapY(result.naive) - 5, { color: COLORS.naive, size: 10 });
    text(ctx, "h", left + w, top + h + 16, { align: "right", color: COLORS.muted, size: 10 });
  }

  function drawDensity(ctx, box, result) {
    panel(ctx, box, "running-variable density", "a McCrary-style diagnostic intuition");
    var bins = 26;
    var counts = [];
    for (var i = 0; i < bins; i += 1) counts.push(0);
    result.data.forEach(function (row) {
      if (row.x < -0.65 || row.x > 0.65) return;
      var index = Math.floor((row.x + 0.65) / 1.3 * bins);
      if (index >= 0 && index < bins) counts[index] += 1;
    });
    var maxCount = Math.max.apply(null, counts);
    var left = box.x + 34;
    var top = box.y + 50;
    var w = box.w - 50;
    var h = box.h - 74;
    function mapX(x) { return left + (x + 0.65) / 1.3 * w; }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    for (i = 0; i < bins; i += 1) {
      var x0 = -0.65 + i * 1.3 / bins;
      var x1 = -0.65 + (i + 1) * 1.3 / bins;
      var bh = h * counts[i] / Math.max(1, maxCount);
      ctx.fillStyle = x1 <= 0 ? "rgba(37,99,235,0.62)" : "rgba(190,18,60,0.62)";
      if (x0 < 0 && x1 > 0) ctx.fillStyle = "rgba(23,32,38,0.35)";
      ctx.fillRect(mapX(x0) + 1, top + h - bh, Math.max(1, mapX(x1) - mapX(x0) - 2), bh);
    }
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(mapX(0), top);
    ctx.lineTo(mapX(0), top + h);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "log density jump: " + formatNumber(result.density.logRatio, 2), left + 5, top + 14, {
      color: Math.abs(result.density.logRatio) > 0.28 ? COLORS.warning : COLORS.muted,
      size: 10,
      weight: 700
    });
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "diagnostic ledger", "the estimate is local and conditional");
    var rows = [
      ["local linear", result.fit.estimate, result.trueEffect, 2.2, formatNumber(result.fit.estimate, 2)],
      ["local mean", result.localMean.estimate, result.trueEffect, 2.2, formatNumber(result.localMean.estimate, 2)],
      ["naive all-data gap", result.naive, result.trueEffect, 2.2, formatNumber(result.naive, 2)],
      ["covariate jump", result.covariateFit.estimate, 0, 1.2, formatNumber(result.covariateFit.estimate, 2)],
      ["density log jump", result.density.logRatio, 0, 1.2, formatNumber(result.density.logRatio, 2)]
    ];
    var left = box.x + 128;
    var top = box.y + 50;
    var w = box.w - 156;
    var rowH = Math.min(27, (box.h - 72) / rows.length);
    rows.forEach(function (row, i) {
      var yy = top + i * (rowH + 8);
      var diff = row[1] - row[2];
      var frac = clamp((diff / row[3] + 1) / 2, 0, 1);
      text(ctx, row[0], box.x + 14, yy + rowH * 0.67, { color: COLORS.muted, size: 11 });
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(left, yy, w, rowH);
      ctx.fillStyle = Math.abs(diff) > (i < 3 ? 0.35 : 0.22) ? COLORS.warning : COLORS.ok;
      ctx.fillRect(left, yy, w * frac, rowH);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, yy, w, rowH);
      ctx.strokeStyle = COLORS.text;
      ctx.beginPath();
      ctx.moveTo(left + w / 2, yy);
      ctx.lineTo(left + w / 2, yy + rowH);
      ctx.stroke();
      text(ctx, row[4], left + w + 8, yy + rowH * 0.67, { color: COLORS.text, size: 11, weight: 700 });
    });
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    var pad = width < 650 ? 10 : 14;
    if (width < 650) {
      drawScatter(ctx, { x: pad, y: pad, w: width - 2 * pad, h: height * 0.34 }, result);
      drawBandwidth(ctx, { x: pad, y: height * 0.37, w: width - 2 * pad, h: height * 0.22 }, result);
      drawDensity(ctx, { x: pad, y: height * 0.62, w: width - 2 * pad, h: height * 0.17 }, result);
      drawLedger(ctx, { x: pad, y: height * 0.81, w: width - 2 * pad, h: height * 0.17 }, result);
    } else {
      var leftW = Math.round((width - 3 * pad) * 0.54);
      var rightW = width - 3 * pad - leftW;
      drawScatter(ctx, { x: pad, y: pad, w: leftW, h: height - 2 * pad }, result);
      drawBandwidth(ctx, { x: 2 * pad + leftW, y: pad, w: rightW, h: height * 0.32 }, result);
      drawDensity(ctx, { x: 2 * pad + leftW, y: height * 0.37, w: rightW, h: height * 0.25 }, result);
      drawLedger(ctx, { x: 2 * pad + leftW, y: height * 0.66, w: rightW, h: height * 0.32 }, result);
    }
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (node) {
      raw[node.getAttribute("data-param")] = node.value;
    });
    return raw;
  }

  function syncOutputs(container, params) {
    var labels = {
      bandwidth: params.bandwidth.toFixed(2),
      curvature: formatPercent(params.curvature, 0),
      effect: params.effect.toFixed(2),
      manipulation: formatPercent(params.manipulation, 0),
      noise: params.noise.toFixed(2),
      samples: String(params.samples),
      seed: String(params.seed)
    };
    Object.keys(labels).forEach(function (key) {
      var out = container.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(container) {
    var result = evaluate(readParams(container));
    syncOutputs(container, result.params);
    var metrics = container.querySelector("[data-rd-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("RD estimate", formatNumber(result.fit.estimate, 2)),
        metric("true cutoff effect", formatNumber(result.trueEffect, 2)),
        metric("naive gap", formatNumber(result.naive, 2)),
        metric("local N", String(result.fit.left.rows + result.fit.right.rows)),
        metric("density log jump", formatNumber(result.density.logRatio, 2)),
        metric("covariate jump", formatNumber(result.covariateFit.estimate, 2))
      ].join("");
    }
    var canvas = container.querySelector("canvas");
    if (canvas) draw(result, canvas);
    container.__rdResult = result;
  }

  function init(container) {
    if (!container) return;
    container.querySelectorAll("[data-param]").forEach(function (node) {
      node.addEventListener("input", function () { render(container); });
      node.addEventListener("change", function () { render(container); });
    });
    render(container);
  }

  function initAll() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-regression-discontinuity-lab]").forEach(init);
  }

  root.RegressionDiscontinuityLab = {
    cleanParams: cleanParams,
    densityJump: densityJump,
    evaluate: evaluate,
    generateData: generateData,
    localLinear: localLinear,
    localMean: localMean
  };

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
