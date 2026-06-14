(function (root) {
  "use strict";

  var COLORS = {
    class0: "#2563eb",
    class1: "#0f766e",
    mixed: "#f8fafc",
    point: "#be123c",
    radius: "#d97706",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc"
  };

  var DEFAULTS = {
    sigma: 45,
    wiggle: 65,
    frequency: 6,
    samples: 768,
    px: 25,
    py: 18,
    seed: 31
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
      sigma: snap(raw.sigma, DEFAULTS.sigma, 5, 120, 5),
      wiggle: snap(raw.wiggle, DEFAULTS.wiggle, 0, 120, 5),
      frequency: snap(raw.frequency, DEFAULTS.frequency, 1, 12, 1),
      samples: snap(raw.samples, DEFAULTS.samples, 128, 2048, 128),
      px: snap(raw.px, DEFAULTS.px, -120, 120, 1),
      py: snap(raw.py, DEFAULTS.py, -120, 120, 1),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1)
    };
  }

  function scaleSigma(params) {
    return params.sigma / 100;
  }

  function pointFromParams(params) {
    return {
      x: params.px / 50,
      y: params.py / 50
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

  function normalPair(rand) {
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    var r = Math.sqrt(-2 * Math.log(u));
    var a = 2 * Math.PI * v;
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  function gaussianOffsets(count, seed) {
    var rand = makeRng(seed);
    var out = [];
    for (var i = 0; i < count; i += 1) {
      var pair = normalPair(rand);
      out.push({ x: pair[0], y: pair[1] });
    }
    return out;
  }

  function boundary(x, y, params) {
    var amp = params.wiggle / 100;
    var f = params.frequency;
    return 0.34 * x
      + 0.28 * amp * Math.sin(1.55 * f * x + 0.45)
      + 0.16 * amp * Math.sin(1.15 * f * (x + 0.55 * y) - 0.7);
  }

  function baseScore(x, y, params) {
    return y - boundary(x, y, params);
  }

  function baseClass(x, y, params) {
    return baseScore(x, y, params) >= 0 ? 1 : 0;
  }

  function smoothProbabilityAt(point, params, sigma, offsets) {
    var useSigma = sigma == null ? scaleSigma(params) : sigma;
    var useOffsets = offsets || gaussianOffsets(params.samples, params.seed * 1009 + params.samples);
    var yes = 0;
    for (var i = 0; i < useOffsets.length; i += 1) {
      if (baseClass(point.x + useSigma * useOffsets[i].x, point.y + useSigma * useOffsets[i].y, params) === 1) yes += 1;
    }
    return yes / Math.max(1, useOffsets.length);
  }

  function inverseNormal(p) {
    var a = [
      -39.69683028665376,
      220.9460984245205,
      -275.9285104469687,
      138.357751867269,
      -30.66479806614716,
      2.506628277459239
    ];
    var b = [
      -54.47609879822406,
      161.5858368580409,
      -155.6989798598866,
      66.80131188771972,
      -13.28068155288572
    ];
    var c = [
      -0.007784894002430293,
      -0.3223964580411365,
      -2.400758277161838,
      -2.549732539343734,
      4.374664141464968,
      2.938163982698783
    ];
    var d = [
      0.007784695709041462,
      0.3224671290700398,
      2.445134137142996,
      3.754408661907416
    ];
    var plow = 0.02425;
    var phigh = 1 - plow;
    var q;
    var r;
    var x;

    p = clamp(p, 1e-12, 1 - 1e-12);
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
        / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= phigh) {
      q = p - 0.5;
      r = q * q;
      x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
        / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
        / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }

    return x;
  }

  function wilsonLower(probability, count, z) {
    if (!count || count <= 0) return probability;
    var p = clamp(probability, 0, 1);
    var z2 = z * z;
    var denom = 1 + z2 / count;
    var center = p + z2 / (2 * count);
    var margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * count)) / count);
    return clamp((center - margin) / denom, 0, 1);
  }

  function certifiedRadius(probClass1, sigma, sampleCount) {
    var topProb = Math.max(probClass1, 1 - probClass1);
    var lower = sampleCount ? wilsonLower(topProb, sampleCount, 2.58) : topProb;
    if (lower <= 0.5) return 0;
    return Math.max(0, sigma * inverseNormal(clamp(lower, 0.5000001, 0.9999999)));
  }

  function nearestFlipDistance(point, params, sigma, offsets, originClass) {
    var useOffsets = offsets || gaussianOffsets(Math.min(384, params.samples), params.seed * 1777 + 43);
    var startClass = originClass == null
      ? (smoothProbabilityAt(point, params, sigma, useOffsets) >= 0.5 ? 1 : 0)
      : originClass;
    var maxR = 2.2;
    var rays = 80;
    var steps = 54;
    var best = Infinity;

    for (var a = 0; a < rays; a += 1) {
      var angle = 2 * Math.PI * a / rays;
      var lo = 0;
      var hi = null;
      for (var s = 1; s <= steps; s += 1) {
        var r = maxR * s / steps;
        if (r >= best) break;
        var candidate = { x: point.x + r * Math.cos(angle), y: point.y + r * Math.sin(angle) };
        var cls = smoothProbabilityAt(candidate, params, sigma, useOffsets) >= 0.5 ? 1 : 0;
        if (cls !== startClass) {
          hi = r;
          break;
        }
        lo = r;
      }
      if (hi == null) continue;
      for (var b = 0; b < 8; b += 1) {
        var mid = 0.5 * (lo + hi);
        var midPoint = { x: point.x + mid * Math.cos(angle), y: point.y + mid * Math.sin(angle) };
        var midClass = smoothProbabilityAt(midPoint, params, sigma, useOffsets) >= 0.5 ? 1 : 0;
        if (midClass === startClass) lo = mid;
        else hi = mid;
      }
      best = Math.min(best, hi);
    }

    return best;
  }

  function sweep(point, params) {
    var out = [];
    var sigmas = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.55, 0.70, 0.90, 1.10, 1.25];
    for (var i = 0; i < sigmas.length; i += 1) {
      var sigma = sigmas[i];
      var offsets = gaussianOffsets(Math.min(512, params.samples), params.seed * 2039 + Math.round(1000 * sigma));
      var p1 = smoothProbabilityAt(point, params, sigma, offsets);
      out.push({
        className: p1 >= 0.5 ? 1 : 0,
        p1: p1,
        radius: certifiedRadius(p1, sigma, offsets.length),
        sigma: sigma,
        topProb: Math.max(p1, 1 - p1)
      });
    }
    return out;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var point = pointFromParams(params);
    var sigma = scaleSigma(params);
    var offsets = gaussianOffsets(params.samples, params.seed * 1009 + params.samples);
    var drawOffsets = gaussianOffsets(Math.min(160, params.samples), params.seed * 3083 + 19);
    var attackOffsets = gaussianOffsets(Math.min(384, params.samples), params.seed * 1777 + 43);
    var p1 = smoothProbabilityAt(point, params, sigma, offsets);
    var topProb = Math.max(p1, 1 - p1);
    var smoothClass = p1 >= 0.5 ? 1 : 0;
    var radius = certifiedRadius(p1, sigma, offsets.length);
    var flipDistance = nearestFlipDistance(point, params, sigma, attackOffsets, smoothClass);
    return {
      attackOffsets: attackOffsets,
      baseAtPoint: baseClass(point.x, point.y, params),
      drawOffsets: drawOffsets,
      flipDistance: flipDistance,
      offsets: offsets,
      p1: p1,
      params: params,
      point: point,
      radius: radius,
      sigma: sigma,
      smoothClass: smoothClass,
      sweep: sweep(point, params),
      topProb: topProb
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "none";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function classLabel(cls) {
    return cls === 1 ? "green" : "blue";
  }

  function metric(label, value) {
    return '<div class="smooth-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
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

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = root.devicePixelRatio || 1;
    var width = Math.max(320, rect.width || canvas.clientWidth || 760);
    var height = width < 620 ? 1160 : 820;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return { ctx: ctx, width: width, height: height };
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, box.x + 14, box.y + 25);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 43);
    }
  }

  function mapColor(p) {
    var mix = Math.abs(p - 0.5) * 2;
    var base = p >= 0.5 ? [15, 118, 110] : [37, 99, 235];
    var white = [248, 250, 252];
    var r = Math.round(white[0] * (1 - mix) + base[0] * mix);
    var g = Math.round(white[1] * (1 - mix) + base[1] * mix);
    var b = Math.round(white[2] * (1 - mix) + base[2] * mix);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function domainToCanvas(plot, x, y) {
    return {
      x: plot.x + (x + 2.2) / 4.4 * plot.w,
      y: plot.y + plot.h - (y + 2.2) / 4.4 * plot.h
    };
  }

  function drawPoint(ctx, plot, result, withCircle) {
    var p = domainToCanvas(plot, result.point.x, result.point.y);
    if (withCircle && isFinite(result.radius) && result.radius > 0) {
      var r = result.radius / 4.4 * plot.w;
      ctx.strokeStyle = COLORS.radius;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (withCircle && isFinite(result.flipDistance)) {
      ctx.strokeStyle = "rgba(190,18,60,0.46)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, result.flipDistance / 4.4 * plot.w, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = COLORS.point;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawMap(ctx, box, result, smooth) {
    panel(
      ctx,
      box,
      smooth ? "Smoothed classifier" : "Base classifier",
      smooth ? "majority vote under Gaussian noise" : "fragile high-frequency boundary"
    );
    var plot = { x: box.x + 20, y: box.y + 58, w: box.w - 40, h: box.h - 86 };
    var cells = smooth ? 46 : 72;
    var cellW = plot.w / cells;
    var cellH = plot.h / cells;
    for (var iy = 0; iy < cells; iy += 1) {
      for (var ix = 0; ix < cells; ix += 1) {
        var x = -2.2 + 4.4 * (ix + 0.5) / cells;
        var y = -2.2 + 4.4 * (iy + 0.5) / cells;
        var p1 = smooth
          ? smoothProbabilityAt({ x: x, y: y }, result.params, result.sigma, result.drawOffsets)
          : baseClass(x, y, result.params);
        ctx.fillStyle = smooth ? mapColor(p1) : (p1 >= 0.5 ? COLORS.class1 : COLORS.class0);
        ctx.globalAlpha = smooth ? 1 : 0.78;
        ctx.fillRect(plot.x + ix * cellW, plot.y + plot.h - (iy + 1) * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    drawPoint(ctx, plot, result, smooth);
  }

  function drawSweep(ctx, box, result) {
    panel(ctx, box, "Noise sweep", "confidence and certified radius at the red point");
    var plot = { x: box.x + 46, y: box.y + 70, w: box.w - 74, h: box.h - 120 };
    var rows = result.sweep;
    var maxR = Math.max.apply(null, rows.map(function (row) { return row.radius; }).concat([0.1]));
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.muted;
    ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    for (var g = 0; g <= 4; g += 1) {
      var y = plot.y + plot.h - g * plot.h / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.fillText(formatNumber(maxR * g / 4, 2), plot.x - 5, y - 3);
    }

    function point(row, key, yMax) {
      var t = (row.sigma - rows[0].sigma) / (rows[rows.length - 1].sigma - rows[0].sigma);
      return {
        x: plot.x + t * plot.w,
        y: plot.y + plot.h - row[key] / yMax * plot.h
      };
    }

    ctx.strokeStyle = COLORS.radius;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var p = point(row, "radius", maxR);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    rows.forEach(function (row) {
      var p = point(row, "radius", maxR);
      ctx.fillStyle = COLORS.radius;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = COLORS.class1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var p = point(row, "topProb", 1);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    rows.forEach(function (row, index) {
      if (index % 2 === 0 || index === rows.length - 1) {
        var x = plot.x + (row.sigma - rows[0].sigma) / (rows[rows.length - 1].sigma - rows[0].sigma) * plot.w;
        ctx.fillText(row.sigma.toFixed(2), x - 10, plot.y + plot.h + 18);
      }
    });
    ctx.fillStyle = COLORS.radius;
    ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("radius", plot.x, box.y + box.h - 30);
    ctx.fillStyle = COLORS.class1;
    ctx.fillText("top probability", plot.x + 70, box.y + box.h - 30);
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "Certificate ledger", "the theorem needs class probability, not gradients");
    var x = box.x + 18;
    var y = box.y + 70;
    var rows = [
      ["base class at point", classLabel(result.baseAtPoint)],
      ["smoothed class", classLabel(result.smoothClass)],
      ["P(smoothed class)", formatPct(result.topProb, 1)],
      ["sigma", formatNumber(result.sigma, 2)],
      ["certificate radius", formatNumber(result.radius, 3)],
      ["nearest found flip", formatNumber(result.flipDistance, 3)]
    ];
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    rows.forEach(function (row, index) {
      var yy = y + index * 31;
      ctx.fillStyle = index % 2 ? "rgba(255,255,255,0.68)" : "rgba(237,242,247,0.78)";
      roundedRect(ctx, x, yy - 19, box.w - 36, 25, 5);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row[0], x + 10, yy - 2);
      ctx.fillStyle = COLORS.text;
      ctx.font = "800 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row[1], x + box.w - 128, yy - 2);
    });
    ctx.fillStyle = result.radius <= result.flipDistance + 0.02 ? COLORS.class1 : COLORS.point;
    ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(
      result.radius <= result.flipDistance + 0.02 ? "found boundary stays outside the certificate" : "certificate exceeds search boundary",
      x,
      box.y + box.h - 28
    );
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    var margin = 12;
    var gap = 12;
    var boxes = [];
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (width < 620) {
      var h = (height - margin * 2 - gap * 3) / 4;
      for (var i = 0; i < 4; i += 1) boxes.push({ x: margin, y: margin + i * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - margin * 2 - gap) / 2;
      var rowH = (height - margin * 2 - gap) / 2;
      boxes.push({ x: margin, y: margin, w: colW, h: rowH });
      boxes.push({ x: margin + colW + gap, y: margin, w: colW, h: rowH });
      boxes.push({ x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      boxes.push({ x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
    drawMap(ctx, boxes[0], result, false);
    drawMap(ctx, boxes[1], result, true);
    drawSweep(ctx, boxes[2], result);
    drawLedger(ctx, boxes[3], result);
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-value]").forEach(function (node) {
      var key = node.getAttribute("data-value");
      if (key === "sigma") node.textContent = (params.sigma / 100).toFixed(2);
      else if (key === "wiggle") node.textContent = (params.wiggle / 100).toFixed(2);
      else if (key === "samples") node.textContent = params.samples.toLocaleString();
      else if (key === "px" || key === "py") node.textContent = (params[key] / 50).toFixed(2);
      else node.textContent = String(params[key]);
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
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("smoothed class", classLabel(result.smoothClass)),
        metric("top prob", formatPct(result.topProb, 1)),
        metric("radius", formatNumber(result.radius, 3)),
        metric("nearest flip", formatNumber(result.flipDistance, 3)),
        metric("sigma", formatNumber(result.sigma, 2)),
        metric("samples", result.params.samples.toLocaleString())
      ].join("");
    }
    var canvas = container.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
    container.__randomizedSmoothingResult = result;
  }

  function mount(container) {
    if (container.__randomizedSmoothingMounted) return;
    container.__randomizedSmoothingMounted = true;
    container.querySelectorAll("[data-param]").forEach(function (node) {
      node.addEventListener("input", function () { render(container); });
      node.addEventListener("change", function () { render(container); });
    });
    render(container);
    root.addEventListener("resize", function () { render(container); });
  }

  function mountAll() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-randomized-smoothing-lab]").forEach(mount);
  }

  root.RandomizedSmoothingLab = {
    baseClass: baseClass,
    baseScore: baseScore,
    certifiedRadius: certifiedRadius,
    cleanParams: cleanParams,
    evaluate: evaluate,
    gaussianOffsets: gaussianOffsets,
    inverseNormal: inverseNormal,
    nearestFlipDistance: nearestFlipDistance,
    smoothProbabilityAt: smoothProbabilityAt,
    wilsonLower: wilsonLower
  };

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", mountAll);
    } else {
      mountAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
