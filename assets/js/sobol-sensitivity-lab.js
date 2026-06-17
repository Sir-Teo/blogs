(function (global) {
  "use strict";

  var COLORS = {
    accent: "#7c3aed",
    blue: "#2563eb",
    cyan: "#0891b2",
    grid: "#e6edf3",
    main: "#0f766e",
    muted: "#5d6872",
    oat: "#be123c",
    orange: "#d97706",
    panel: "#f8fafc",
    rule: "#d7dee5",
    slate: "#64748b",
    text: "#172026",
    total: "#0f766e",
    white: "#ffffff"
  };

  var DEFAULTS = {
    ab: 240,
    abc: 100,
    ac: 10,
    bc: 70,
    mainA: 120,
    mainB: 40,
    mainC: 20,
    samplePower: 12,
    seed: 53
  };

  var COMPONENTS = [
    { key: "a", label: "A", vars: [0], scale: 3 },
    { key: "b", label: "B", vars: [1], scale: 3 },
    { key: "c", label: "C", vars: [2], scale: 3 },
    { key: "ab", label: "A x B", vars: [0, 1], scale: 9 },
    { key: "bc", label: "B x C", vars: [1, 2], scale: 9 },
    { key: "ac", label: "A x C", vars: [0, 2], scale: 9 },
    { key: "abc", label: "A x B x C", vars: [0, 1, 2], scale: 27 }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      ab: Math.round(clamp(finite(Number(raw.ab), DEFAULTS.ab), 0, 320)),
      abc: Math.round(clamp(finite(Number(raw.abc), DEFAULTS.abc), 0, 260)),
      ac: Math.round(clamp(finite(Number(raw.ac), DEFAULTS.ac), 0, 260)),
      bc: Math.round(clamp(finite(Number(raw.bc), DEFAULTS.bc), 0, 260)),
      mainA: Math.round(clamp(finite(Number(raw.mainA), DEFAULTS.mainA), 0, 220)),
      mainB: Math.round(clamp(finite(Number(raw.mainB), DEFAULTS.mainB), 0, 220)),
      mainC: Math.round(clamp(finite(Number(raw.mainC), DEFAULTS.mainC), 0, 220)),
      samplePower: Math.round(clamp(finite(Number(raw.samplePower), DEFAULTS.samplePower), 7, 13)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997))
    };
  }

  function coefficients(params) {
    return {
      a: params.mainA / 100,
      ab: params.ab / 100,
      abc: params.abc / 100,
      ac: params.ac / 100,
      b: params.mainB / 100,
      bc: params.bc / 100,
      c: params.mainC / 100
    };
  }

  function rng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function samplePoint(rand) {
    return [2 * rand() - 1, 2 * rand() - 1, 2 * rand() - 1];
  }

  function modelValue(x, coeff) {
    return coeff.a * x[0]
      + coeff.b * x[1]
      + coeff.c * x[2]
      + coeff.ab * x[0] * x[1]
      + coeff.bc * x[1] * x[2]
      + coeff.ac * x[0] * x[2]
      + coeff.abc * x[0] * x[1] * x[2];
  }

  function variance(values) {
    var mean = values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
    return values.reduce(function (sum, value) {
      var d = value - mean;
      return sum + d * d;
    }, 0) / Math.max(1, values.length - 1);
  }

  function analyticIndices(coeff) {
    var components = COMPONENTS.map(function (component) {
      var value = coeff[component.key] * coeff[component.key] / component.scale;
      return Object.assign({}, component, { variance: value });
    });
    var totalVariance = components.reduce(function (sum, component) { return sum + component.variance; }, 0);
    var first = [0, 1, 2].map(function (index) {
      return totalVariance > 0 ? components[index].variance / totalVariance : 0;
    });
    var total = [0, 1, 2].map(function (index) {
      var included = components.filter(function (component) {
        return component.vars.indexOf(index) !== -1;
      }).reduce(function (sum, component) { return sum + component.variance; }, 0);
      return totalVariance > 0 ? included / totalVariance : 0;
    });
    var mainVariance = components.slice(0, 3).reduce(function (sum, component) { return sum + component.variance; }, 0);
    var oat = components.slice(0, 3).map(function (component) {
      return mainVariance > 0 ? component.variance / mainVariance : 0;
    });
    return {
      components: components.map(function (component) {
        return Object.assign({}, component, {
          share: totalVariance > 0 ? component.variance / totalVariance : 0
        });
      }),
      first: first,
      interactionShare: totalVariance > 0 ? 1 - first.reduce(function (sum, value) { return sum + value; }, 0) : 0,
      oat: oat,
      total: total,
      totalVariance: totalVariance
    };
  }

  function estimateIndices(coeff, samples, seed) {
    var rand = rng(seed * 1009 + samples * 17);
    var A = [];
    var B = [];
    var yA = [];
    var yB = [];
    for (var i = 0; i < samples; i += 1) {
      A.push(samplePoint(rand));
      B.push(samplePoint(rand));
      yA.push(modelValue(A[i], coeff));
      yB.push(modelValue(B[i], coeff));
    }
    var v = variance(yA.concat(yB));
    var first = [];
    var total = [];
    for (var k = 0; k < 3; k += 1) {
      var firstNumerator = 0;
      var totalNumerator = 0;
      for (var j = 0; j < samples; j += 1) {
        var mixed = A[j].slice();
        mixed[k] = B[j][k];
        var yMixed = modelValue(mixed, coeff);
        firstNumerator += yB[j] * (yMixed - yA[j]);
        var diff = yA[j] - yMixed;
        totalNumerator += diff * diff;
      }
      first.push(v > 0 ? firstNumerator / samples / v : 0);
      total.push(v > 0 ? totalNumerator / (2 * samples) / v : 0);
    }
    return {
      first: first,
      samples: samples,
      total: total,
      variance: v
    };
  }

  function rmse(estimate, truth) {
    var sum = 0;
    var count = 0;
    ["first", "total"].forEach(function (kind) {
      for (var i = 0; i < 3; i += 1) {
        var d = estimate[kind][i] - truth[kind][i];
        sum += d * d;
        count += 1;
      }
    });
    return Math.sqrt(sum / Math.max(1, count));
  }

  function sweepSamples(coeff, truth, seed) {
    var rows = [];
    for (var p = 7; p <= 13; p += 1) {
      var samples = Math.pow(2, p);
      var estimate = estimateIndices(coeff, samples, seed);
      rows.push({
        error: rmse(estimate, truth),
        firstA: estimate.first[0],
        power: p,
        samples: samples,
        totalB: estimate.total[1]
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var coeff = coefficients(params);
    var samples = Math.pow(2, params.samplePower);
    var truth = analyticIndices(coeff);
    var estimate = estimateIndices(coeff, samples, params.seed);
    return {
      coeff: coeff,
      estimate: estimate,
      params: params,
      samples: samples,
      sweep: sweepSamples(coeff, truth, params.seed),
      truth: truth
    };
  }

  function audit() {
    var result = evaluate(DEFAULTS);
    var noInteraction = evaluate(Object.assign({}, DEFAULTS, { ab: 0, abc: 0, ac: 0, bc: 0 }));
    return {
      defaultInteractionShare: Number(result.truth.interactionShare.toFixed(3)),
      defaultSamples: result.samples,
      firstA: Number(result.truth.first[0].toFixed(3)),
      firstSum: Number(result.truth.first.reduce(function (sum, value) { return sum + value; }, 0).toFixed(3)),
      mcRmse: Number(rmse(result.estimate, result.truth).toFixed(3)),
      noInteractionFirstTotalMatch: noInteraction.truth.first.every(function (value, index) {
        return Math.abs(value - noInteraction.truth.total[index]) < 1e-12;
      }),
      oatMissesBInteraction: result.truth.oat[1] < result.truth.total[1] * 0.25,
      totalB: Number(result.truth.total[1].toFixed(3)),
      totalSum: Number(result.truth.total.reduce(function (sum, value) { return sum + value; }, 0).toFixed(3)),
      variancePositive: result.truth.totalVariance > 0
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function percent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value, klass) {
    return '<div class="sobol-lab__metric ' + (klass || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(root, result) {
    var params = result.params;
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "samplePower") value = result.samples;
        else if (key !== "seed") value = (value / 100).toFixed(2);
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    var firstSum = result.truth.first.reduce(function (sum, value) { return sum + value; }, 0);
    var totalSum = result.truth.total.reduce(function (sum, value) { return sum + value; }, 0);
    var totalLabels = ["A", "B", "C"];
    var dominant = result.truth.total.reduce(function (best, value, index) {
      return value > best.value ? { index: index, value: value } : best;
    }, { index: 0, value: -Infinity });
    box.innerHTML = [
      metric("variance", fmt(result.truth.totalVariance, 3)),
      metric("interaction share", percent(result.truth.interactionShare, 1), result.truth.interactionShare > 0.35 ? "warn" : "good"),
      metric("sum first-order", percent(firstSum, 1)),
      metric("sum total-effect", percent(totalSum, 1), totalSum > 1.1 ? "warn" : "good"),
      metric("largest total", totalLabels[dominant.index] + " " + percent(dominant.value, 1), "good"),
      metric("pick-freeze N", String(result.samples)),
      metric("MC RMSE", percent(rmse(result.estimate, result.truth), 1)),
      metric("OAT B vs total B", percent(result.truth.oat[1], 1) + " / " + percent(result.truth.total[1], 1), "warn")
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = global.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.width || 900));
    var height = width < 560 ? Math.round(width * 1.5) : Math.round(width * 0.76);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function clear(ctx, width, height) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
  }

  function label(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || 650) + " " + (opts.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    label(ctx, title, box.x + 14, box.y + 24, { size: 14, weight: 800 });
    if (subtitle) label(ctx, subtitle, box.x + 14, box.y + 42, { color: COLORS.muted, size: 11, weight: 600 });
  }

  function drawVarianceLedger(ctx, result, box) {
    panel(ctx, box, "variance ledger", "orthogonal components add to the denominator");
    var plot = { x: box.x + 26, y: box.y + 64, w: box.w - 52, h: box.h - 98 };
    var colors = [COLORS.main, COLORS.blue, COLORS.cyan, COLORS.orange, COLORS.oat, COLORS.accent, COLORS.slate];
    var y = plot.y + 12;
    var barH = 24;
    var x = plot.x;
    result.truth.components.forEach(function (component, index) {
      var w = plot.w * component.share;
      ctx.fillStyle = colors[index];
      ctx.fillRect(x, y, Math.max(1, w), barH);
      if (w > 42) label(ctx, component.label, x + w / 2, y + 16, { align: "center", color: COLORS.white, size: 10, weight: 800 });
      x += w;
    });
    var rows = result.truth.components.slice().sort(function (a, b) { return b.share - a.share; }).slice(0, 4);
    rows.forEach(function (component, index) {
      label(ctx, component.label, plot.x, y + 54 + index * 20, { color: COLORS.text, size: 11, weight: 800 });
      label(ctx, percent(component.share, 1), plot.x + 86, y + 54 + index * 20, { color: COLORS.muted, size: 11, weight: 700 });
    });
    label(ctx, "total Var(Y) = " + fmt(result.truth.totalVariance, 3), plot.x, box.y + box.h - 16, { color: COLORS.muted, size: 10, weight: 700 });
  }

  function drawFirstTotal(ctx, result, box) {
    panel(ctx, box, "first-order vs total-effect", "interactions make total bars exceed first bars");
    var plot = { x: box.x + 52, y: box.y + 62, w: box.w - 80, h: box.h - 98 };
    var labels = ["A", "B", "C"];
    var groupW = plot.w / 3;
    var maxV = Math.max.apply(null, result.truth.total.concat(result.estimate.total).concat([1]));
    for (var i = 0; i < 3; i += 1) {
      var base = plot.x + i * groupW + groupW * 0.18;
      var w = groupW * 0.22;
      var firstH = plot.h * clamp(result.truth.first[i] / maxV, 0, 1);
      var totalH = plot.h * clamp(result.truth.total[i] / maxV, 0, 1);
      var estFirstY = plot.y + plot.h - plot.h * clamp(result.estimate.first[i] / maxV, 0, 1);
      var estTotalY = plot.y + plot.h - plot.h * clamp(result.estimate.total[i] / maxV, 0, 1);
      ctx.fillStyle = COLORS.blue;
      ctx.fillRect(base, plot.y + plot.h - firstH, w, firstH);
      ctx.fillStyle = COLORS.total;
      ctx.fillRect(base + w + 6, plot.y + plot.h - totalH, w, totalH);
      ctx.strokeStyle = COLORS.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(base - 2, estFirstY);
      ctx.lineTo(base + w + 2, estFirstY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(base + w + 4, estTotalY);
      ctx.lineTo(base + 2 * w + 10, estTotalY);
      ctx.stroke();
      label(ctx, labels[i], base + w + 3, plot.y + plot.h + 15, { align: "center", color: COLORS.text, size: 11, weight: 850 });
    }
    label(ctx, "first", plot.x, box.y + box.h - 16, { color: COLORS.blue, size: 10, weight: 800 });
    label(ctx, "total", plot.x + 42, box.y + box.h - 16, { color: COLORS.total, size: 10, weight: 800 });
    label(ctx, "black ticks = MC", plot.x + 90, box.y + box.h - 16, { color: COLORS.text, size: 10, weight: 650 });
  }

  function drawOat(ctx, result, box) {
    panel(ctx, box, "one-at-a-time blind spot", "center sweeps miss terms that need two inputs");
    var plot = { x: box.x + 96, y: box.y + 66, w: box.w - 126, h: box.h - 100 };
    var labels = ["A", "B", "C"];
    for (var i = 0; i < 3; i += 1) {
      var y = plot.y + i * (plot.h / 3) + 7;
      label(ctx, labels[i], box.x + 18, y + 17, { color: COLORS.text, size: 12, weight: 850 });
      ctx.fillStyle = "rgba(190, 18, 60, 0.42)";
      ctx.fillRect(plot.x, y, plot.w * clamp(result.truth.oat[i], 0, 1), 12);
      ctx.fillStyle = "rgba(15, 118, 110, 0.58)";
      ctx.fillRect(plot.x, y + 17, plot.w * clamp(result.truth.total[i], 0, 1), 12);
      label(ctx, percent(result.truth.oat[i], 0), plot.x + plot.w * clamp(result.truth.oat[i], 0, 1) + 5, y + 10, { color: COLORS.oat, size: 9, weight: 800 });
      label(ctx, percent(result.truth.total[i], 0), plot.x + plot.w * clamp(result.truth.total[i], 0, 1) + 5, y + 27, { color: COLORS.total, size: 9, weight: 800 });
    }
    label(ctx, "red = OAT at center", plot.x, box.y + box.h - 16, { color: COLORS.oat, size: 10, weight: 800 });
    label(ctx, "green = total Sobol", plot.x + 120, box.y + box.h - 16, { color: COLORS.total, size: 10, weight: 800 });
  }

  function drawMcSweep(ctx, result, box) {
    panel(ctx, box, "pick-freeze convergence", "finite samples move the bars");
    var rows = result.sweep;
    var plot = { x: box.x + 48, y: box.y + 64, w: box.w - 76, h: box.h - 98 };
    var maxError = Math.max.apply(null, rows.map(function (row) { return row.error; }).concat([0.02]));
    function sx(power) { return plot.x + (power - 7) / 6 * plot.w; }
    function sy(error) { return plot.y + plot.h - error / maxError * plot.h; }
    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h * g / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = sx(row.power);
      var y = sy(row.error);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    rows.forEach(function (row) {
      ctx.fillStyle = row.power === result.params.samplePower ? COLORS.oat : COLORS.accent;
      ctx.beginPath();
      ctx.arc(sx(row.power), sy(row.error), row.power === result.params.samplePower ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
    label(ctx, "128", plot.x, plot.y + plot.h + 15, { color: COLORS.muted, size: 9, weight: 650 });
    label(ctx, "8192 samples", plot.x + plot.w, plot.y + plot.h + 15, { align: "right", color: COLORS.muted, size: 9, weight: 650 });
    label(ctx, "RMSE now " + percent(rmse(result.estimate, result.truth), 1), plot.x, box.y + box.h - 16, { color: COLORS.accent, size: 10, weight: 800 });
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    clear(ctx, width, height);
    var margin = 18;
    var gap = 18;

    if (width < 560) {
      var h = (height - 2 * margin - 3 * gap) / 4;
      drawVarianceLedger(ctx, result, { x: margin, y: margin, w: width - 2 * margin, h: h });
      drawFirstTotal(ctx, result, { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h });
      drawOat(ctx, result, { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h });
      drawMcSweep(ctx, result, { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - 2 * margin - gap) / 2;
      var rowH = (height - 2 * margin - gap) / 2;
      drawVarianceLedger(ctx, result, { x: margin, y: margin, w: colW, h: rowH });
      drawFirstTotal(ctx, result, { x: margin + colW + gap, y: margin, w: colW, h: rowH });
      drawOat(ctx, result, { x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      drawMcSweep(ctx, result, { x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    updateOutputs(root, result);
    renderMetrics(root, result);
    draw(root, result);
    root.__sobolSensitivityLabResult = result;
  }

  function init(root) {
    if (!root || root.__sobolSensitivityReady) return;
    root.__sobolSensitivityReady = true;
    var scheduled = null;
    function requestRender() {
      if (scheduled) global.cancelAnimationFrame(scheduled);
      scheduled = global.requestAnimationFrame(function () {
        scheduled = null;
        render(root);
      });
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    global.addEventListener("resize", requestRender);
    requestRender();
  }

  function initAll() {
    global.document.querySelectorAll("[data-sobol-sensitivity-lab]").forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SobolSensitivityLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
