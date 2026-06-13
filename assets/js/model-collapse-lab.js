(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    trueDist: "#64748b",
    model: "#0f766e",
    tail: "#be123c",
    synthetic: "#7c3aed",
    fresh: "#2563eb",
    warn: "#b45309"
  };

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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(values) {
    var total = values.reduce(function (sum, value) { return sum + Math.max(0, value); }, 0);
    if (total <= 0) return values.map(function () { return 1 / values.length; });
    return values.map(function (value) { return Math.max(0, value) / total; });
  }

  function entropy(p) {
    return p.reduce(function (sum, value) {
      return value > 0 ? sum - value * Math.log(value) : sum;
    }, 0);
  }

  function kl(trueP, modelP) {
    var total = 0;
    for (var i = 0; i < trueP.length; i += 1) {
      if (trueP[i] > 0) total += trueP[i] * Math.log(trueP[i] / Math.max(modelP[i], 1e-12));
    }
    return total;
  }

  function effectiveModes(p) {
    return Math.exp(entropy(p));
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="collapse-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function trueDistribution(params) {
    var modes = 18;
    var rareMass = params.rareMass / 100;
    var commonMass = 1 - rareMass;
    var common = [];
    var rare = [];
    var i;

    for (i = 0; i < 6; i += 1) common.push(Math.pow(i + 1, -0.78));
    for (i = 0; i < 12; i += 1) rare.push(Math.pow(i + 1, -0.28));
    common = normalize(common).map(function (value) { return value * commonMass; });
    rare = normalize(rare).map(function (value) { return value * rareMass; });
    return common.concat(rare).slice(0, modes);
  }

  function transformForGenerator(p, temperature, filterStrength) {
    var temp = Math.max(0.25, temperature);
    var sharpness = 1 / temp + filterStrength;
    return normalize(p.map(function (value) {
      return Math.pow(Math.max(value, 1e-12), sharpness);
    }));
  }

  function sampleMultinomial(rand, probs, n) {
    var counts = new Array(probs.length).fill(0);
    var cdf = [];
    var running = 0;
    probs.forEach(function (p) {
      running += p;
      cdf.push(running);
    });
    for (var draw = 0; draw < n; draw += 1) {
      var u = rand();
      var lo = 0;
      var hi = cdf.length - 1;
      while (lo < hi) {
        var mid = Math.floor((lo + hi) / 2);
        if (u <= cdf[mid]) hi = mid;
        else lo = mid + 1;
      }
      counts[lo] += 1;
    }
    return counts;
  }

  function trainNext(rand, params, trueP, modelP) {
    var total = params.sampleBudget;
    var syntheticShare = params.syntheticShare / 100;
    var archiveShare = params.archiveShare / 100;
    var freshShare = Math.max(0, 1 - syntheticShare - archiveShare);
    var nSynthetic = Math.round(total * syntheticShare);
    var nArchive = Math.round(total * archiveShare);
    var nFresh = Math.max(0, total - nSynthetic - nArchive);
    var filterStrength = params.filterStrength / 100;
    var temperature = params.temperature / 100;
    var generator = transformForGenerator(modelP, temperature, filterStrength);
    var synthetic = sampleMultinomial(rand, generator, nSynthetic);
    var archive = sampleMultinomial(rand, trueP, nArchive);
    var fresh = sampleMultinomial(rand, trueP, nFresh);
    var smoothing = params.smoothing / 100;
    var counts = [];

    for (var i = 0; i < trueP.length; i += 1) {
      counts.push(synthetic[i] + archive[i] + fresh[i] + smoothing * total * trueP[i]);
    }
    return normalize(counts);
  }

  function summarize(trueP, modelP) {
    var rareStart = 6;
    var trueTail = trueP.slice(rareStart).reduce(function (sum, value) { return sum + value; }, 0);
    var modelTail = modelP.slice(rareStart).reduce(function (sum, value) { return sum + value; }, 0);
    var rareVisible = 0;
    for (var i = rareStart; i < modelP.length; i += 1) {
      if (modelP[i] >= Math.max(0.001, trueP[i] * 0.2)) rareVisible += 1;
    }
    return {
      effective: effectiveModes(modelP),
      entropyRatio: entropy(modelP) / entropy(trueP),
      kl: kl(trueP, modelP),
      rareVisible: rareVisible,
      tailRatio: trueTail > 0 ? modelTail / trueTail : 1
    };
  }

  function simulate(params) {
    var rand = rng(
      20260613
      + params.syntheticShare * 11
      + params.archiveShare * 13
      + params.sampleBudget * 17
      + params.temperature * 19
      + params.filterStrength * 23
      + params.rareMass * 29
      + params.generations * 31
      + params.smoothing * 37
    );
    var trueP = trueDistribution(params);
    var modelP = trueP.slice();
    var history = [];
    history.push(Object.assign({ generation: 0, model: modelP.slice() }, summarize(trueP, modelP)));
    for (var gen = 1; gen <= params.generations; gen += 1) {
      modelP = trainNext(rand, params, trueP, modelP);
      history.push(Object.assign({ generation: gen, model: modelP.slice() }, summarize(trueP, modelP)));
    }
    return {
      final: history[history.length - 1],
      history: history,
      trueP: trueP
    };
  }

  function drawLabel(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    drawLabel(ctx, title, box.x, box.y - 14, "left", "bottom", COLORS.text);
    if (subtitle) drawLabel(ctx, subtitle, box.x + box.w, box.y - 14, "right", "bottom", COLORS.muted);
  }

  function drawDistribution(ctx, result, box) {
    panel(ctx, box, "Distribution after recursion", "true vs final model");
    var trueP = result.trueP;
    var modelP = result.final.model;
    var maxP = Math.max.apply(null, trueP.concat(modelP));
    var gap = 3;
    var barW = (box.w - gap * (trueP.length - 1)) / trueP.length;
    trueP.forEach(function (value, index) {
      var x = box.x + index * (barW + gap);
      var trueH = value / maxP * box.h;
      var modelH = modelP[index] / maxP * box.h;
      ctx.fillStyle = index < 6 ? COLORS.trueDist : "#cbd5e1";
      ctx.fillRect(x, box.y + box.h - trueH, barW, trueH);
      ctx.fillStyle = index < 6 ? COLORS.model : COLORS.tail;
      ctx.fillRect(x + barW * 0.18, box.y + box.h - modelH, barW * 0.64, modelH);
    });
    drawLabel(ctx, "common", box.x + 2, box.y + box.h + 18, "left", "top", COLORS.muted);
    drawLabel(ctx, "rare tail", box.x + box.w - 2, box.y + box.h + 18, "right", "top", COLORS.muted);
  }

  function drawLine(ctx, box, series, opts) {
    function xScale(index) {
      return box.x + index / Math.max(1, series[0].values.length - 1) * box.w;
    }
    function yScale(value) {
      return box.y + box.h - (value - opts.min) / Math.max(1e-9, opts.max - opts.min) * box.h;
    }

    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1].forEach(function (tick) {
      var y = box.y + tick * box.h;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
    });

    series.forEach(function (item) {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.width || 2;
      ctx.beginPath();
      item.values.forEach(function (value, index) {
        var x = xScale(index);
        var y = yScale(value);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    });
  }

  function drawTail(ctx, result, box) {
    panel(ctx, box, "Tail memory", "ratio to true rare mass");
    drawLine(ctx, box, [
      { values: result.history.map(function (h) { return h.tailRatio; }), color: COLORS.tail },
      { values: result.history.map(function () { return 1; }), color: COLORS.trueDist, width: 1 }
    ], { min: 0, max: Math.max(1.05, result.history.reduce(function (m, h) { return Math.max(m, h.tailRatio); }, 0)) });
    drawLabel(ctx, "1.0", box.x + box.w - 4, box.y + 14, "right", "middle", COLORS.muted);
  }

  function drawEntropy(ctx, result, box) {
    panel(ctx, box, "Diversity ledger", "entropy ratio + rare modes");
    var rare = result.history.map(function (h) { return h.rareVisible / 12; });
    var ent = result.history.map(function (h) { return h.entropyRatio; });
    drawLine(ctx, box, [
      { values: ent, color: COLORS.model },
      { values: rare, color: COLORS.warn },
      { values: result.history.map(function () { return 1; }), color: COLORS.trueDist, width: 1 }
    ], { min: 0, max: 1.08 });
    drawLabel(ctx, "entropy", box.x + box.w - 70, box.y + 20, "left", "middle", COLORS.model);
    drawLabel(ctx, "rare modes", box.x + box.w - 70, box.y + 38, "left", "middle", COLORS.warn);
  }

  function drawKl(ctx, result, box) {
    var maxKl = result.history.reduce(function (m, h) { return Math.max(m, h.kl); }, 0.05);
    panel(ctx, box, "Distance from source", "KL(true || model)");
    drawLine(ctx, box, [
      { values: result.history.map(function (h) { return h.kl; }), color: COLORS.synthetic }
    ], { min: 0, max: maxKl * 1.05 });
  }

  function drawBars(ctx, result, box) {
    var rows = [
      { label: "tail retained", value: clamp(result.final.tailRatio, 0, 1), color: COLORS.tail, text: formatPercent(result.final.tailRatio, 0) },
      { label: "entropy ratio", value: clamp(result.final.entropyRatio, 0, 1), color: COLORS.model, text: formatPercent(result.final.entropyRatio, 0) },
      { label: "rare modes", value: result.final.rareVisible / 12, color: COLORS.warn, text: result.final.rareVisible + "/12" },
      { label: "effective modes", value: clamp(result.final.effective / 18, 0, 1), color: COLORS.synthetic, text: formatNumber(result.final.effective, 1) }
    ];
    var h = (box.h - 28) / rows.length;
    panel(ctx, box, "Final generation", "audit");
    rows.forEach(function (row, index) {
      var y = box.y + 12 + index * h;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x, y, box.w, h - 8);
      ctx.fillStyle = row.color;
      ctx.fillRect(box.x, y, box.w * row.value, h - 8);
      drawLabel(ctx, row.label, box.x + 7, y + (h - 8) / 2, "left", "middle", row.value > 0.35 ? "#ffffff" : COLORS.text);
      drawLabel(ctx, row.text, box.x + box.w - 7, y + (h - 8) / 2, "right", "middle", row.value > 0.68 ? "#ffffff" : COLORS.text);
    });
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 850 : 610;
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
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    var left = compact ? 48 : 54;
    var right = compact ? 18 : 24;
    var plotW = width - left - right;

    if (compact) {
      drawDistribution(ctx, result, { x: left, y: 44, w: plotW, h: 190 });
      drawTail(ctx, result, { x: left, y: 306, w: plotW, h: 130 });
      drawEntropy(ctx, result, { x: left, y: 502, w: plotW, h: 130 });
      drawKl(ctx, result, { x: left, y: 698, w: plotW, h: 120 });
    } else {
      drawDistribution(ctx, result, { x: left, y: 44, w: plotW * 0.58, h: 250 });
      drawTail(ctx, result, { x: left + plotW * 0.66, y: 44, w: plotW * 0.34, h: 145 });
      drawEntropy(ctx, result, { x: left + plotW * 0.66, y: 262, w: plotW * 0.34, h: 145 });
      drawKl(ctx, result, { x: left, y: 386, w: plotW * 0.44, h: 130 });
      drawBars(ctx, result, { x: left + plotW * 0.51, y: 386, w: plotW * 0.49, h: 130 });
    }
  }

  function parseParams(root) {
    var params = {
      archiveShare: 10,
      filterStrength: 35,
      generations: 12,
      rareMass: 18,
      sampleBudget: 1600,
      smoothing: 1,
      syntheticShare: 75,
      temperature: 85
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    params.archiveShare = Math.min(params.archiveShare, 100 - params.syntheticShare);
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "syntheticShare" || key === "archiveShare" || key === "filterStrength" || key === "rareMass" || key === "smoothing") {
        output.textContent = params[key] + "%";
      } else if (key === "temperature") {
        output.textContent = formatNumber(params[key] / 100, 2);
      } else {
        output.textContent = String(params[key]);
      }
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = simulate(params);
    var metrics = root.querySelector("[data-metrics]");
    var canvas = root.querySelector("[data-canvas]");

    updateOutputs(root, params);
    metrics.innerHTML = [
      metric("tail retained", formatPercent(result.final.tailRatio, 1)),
      metric("rare modes", result.final.rareVisible + "/12"),
      metric("entropy ratio", formatPercent(result.final.entropyRatio, 1)),
      metric("KL true||model", formatNumber(result.final.kl, 2)),
      metric("effective modes", formatNumber(result.final.effective, 1)),
      metric("fresh real share", formatPercent(Math.max(0, 1 - params.syntheticShare / 100 - params.archiveShare / 100), 0))
    ].join("");
    drawChart(canvas, result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-collapse-lab]"));
    labs.forEach(function (root) {
      var schedule = null;
      function requestRender() {
        if (schedule) window.cancelAnimationFrame(schedule);
        schedule = window.requestAnimationFrame(function () {
          schedule = null;
          render(root);
        });
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      window.addEventListener("resize", requestRender);
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      simulate: simulate,
      trueDistribution: trueDistribution,
      transformForGenerator: transformForGenerator
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
