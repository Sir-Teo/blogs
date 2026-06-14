(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    chosen: "#be123c",
    optimal: "#0f766e",
    frontier: "#2563eb",
    data: "#7c3aed",
    model: "#b45309",
    cap: "#64748b",
    warn: "#d97706",
    white: "#ffffff"
  };

  var N0 = 70e9;
  var D0 = 1.4e12;
  var C0 = 6 * N0 * D0;
  var MODEL_EXP = 0.34;
  var DATA_EXP = 0.28;
  var IRREDUCIBLE = 1.69;
  var MODEL_WEIGHT = DATA_EXP;
  var DATA_WEIGHT = MODEL_EXP;

  var DEFAULTS = {
    computeLog10: 237.7,
    modelTilt: 0,
    uniqueTokensT: 10,
    freeEpochs: 4
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      computeLog10: clamp(numeric(raw, "computeLog10"), 200, 255),
      modelTilt: Math.round(clamp(numeric(raw, "modelTilt"), -150, 150)),
      uniqueTokensT: clamp(numeric(raw, "uniqueTokensT"), 2, 200),
      freeEpochs: Math.round(clamp(numeric(raw, "freeEpochs"), 1, 8))
    };
  }

  function computeBudget(params) {
    return Math.pow(10, params.computeLog10 / 10);
  }

  function uniqueTokens(params) {
    return params.uniqueTokensT * 1e11;
  }

  function effectiveTokens(rawTokens, params) {
    var unique = uniqueTokens(params);
    var epochs = rawTokens / Math.max(1, unique);
    var free = params.freeEpochs;
    if (epochs <= free) {
      return {
        effective: rawTokens,
        epochs: epochs,
        wastedShare: 0,
        repeated: Math.max(0, rawTokens - unique)
      };
    }
    var extraEpochs = epochs - free;
    var soft = 3;
    var effective = unique * (free + soft * Math.log1p(extraEpochs / soft));
    return {
      effective: effective,
      epochs: epochs,
      wastedShare: clamp(1 - effective / Math.max(1, rawTokens), 0, 1),
      repeated: rawTokens - unique
    };
  }

  function noCapOptimum(compute) {
    var r = compute / C0;
    var n = N0 * Math.pow(r, DATA_EXP / (MODEL_EXP + DATA_EXP));
    var d = compute / (6 * n);
    return { n: n, d: d };
  }

  function lossAt(n, d, params) {
    var tokenInfo = effectiveTokens(d, params);
    var modelTerm = MODEL_WEIGHT * Math.pow(n / N0, -MODEL_EXP);
    var dataTerm = DATA_WEIGHT * Math.pow(tokenInfo.effective / D0, -DATA_EXP);
    return {
      loss: IRREDUCIBLE + modelTerm + dataTerm,
      modelTerm: modelTerm,
      dataTerm: dataTerm,
      effectiveTokens: tokenInfo.effective,
      epochs: tokenInfo.epochs,
      wastedShare: tokenInfo.wastedShare,
      repeatedTokens: tokenInfo.repeated
    };
  }

  function capAwareOptimum(compute, params) {
    var base = noCapOptimum(compute);
    var lo = Math.max(1e6, base.n / 200);
    var hi = Math.min(5e12, base.n * 200);
    var baseLoss = lossAt(base.n, base.d, params);
    var best = Object.assign({ n: base.n, d: base.d }, baseLoss);
    for (var i = 0; i <= 280; i += 1) {
      var t = i / 280;
      var n = Math.pow(10, Math.log10(lo) * (1 - t) + Math.log10(hi) * t);
      var d = compute / (6 * n);
      if (d < 1e8) continue;
      var l = lossAt(n, d, params);
      if (l.loss < best.loss) {
        best = Object.assign({ n: n, d: d }, l);
      }
    }
    return best;
  }

  function allocationCurve(compute, params) {
    var base = noCapOptimum(compute);
    var rows = [];
    for (var tilt = -150; tilt <= 150; tilt += 5) {
      var n = base.n * Math.pow(10, tilt / 100);
      var d = compute / (6 * n);
      rows.push(Object.assign({ tilt: tilt, n: n, d: d }, lossAt(n, d, params)));
    }
    return rows;
  }

  function frontierRows(params) {
    var rows = [];
    var current = computeBudget(params);
    for (var e = 200; e <= 255; e += 2.5) {
      var compute = Math.pow(10, e / 10);
      var noCap = noCapOptimum(compute);
      var capAware = capAwareOptimum(compute, params);
      rows.push({
        compute: compute,
        isCurrent: Math.abs(Math.log10(compute / current)) < 0.13,
        noCapN: noCap.n,
        noCapD: noCap.d,
        capN: capAware.n,
        capD: capAware.d
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var compute = computeBudget(params);
    var noCap = noCapOptimum(compute);
    var chosenN = noCap.n * Math.pow(10, params.modelTilt / 100);
    var chosenD = compute / (6 * chosenN);
    var chosen = Object.assign({ n: chosenN, d: chosenD }, lossAt(chosenN, chosenD, params));
    var noCapLoss = Object.assign({ n: noCap.n, d: noCap.d }, lossAt(noCap.n, noCap.d, params));
    var capAware = capAwareOptimum(compute, params);
    var curve = allocationCurve(compute, params);
    var minCurveLoss = curve.reduce(function (m, row) { return Math.min(m, row.loss); }, Infinity);
    return {
      params: params,
      compute: compute,
      uniqueTokens: uniqueTokens(params),
      noCap: noCapLoss,
      capAware: capAware,
      chosen: chosen,
      curve: curve,
      frontier: frontierRows(params),
      summary: {
        chosenPenalty: chosen.loss - capAware.loss,
        chosenPctPenalty: (chosen.loss / capAware.loss - 1) * 100,
        noCapPenalty: noCapLoss.loss - capAware.loss,
        tokensPerParam: chosenD / chosenN,
        minCurveLoss: minCurveLoss,
        capShift: Math.log10(capAware.n / noCap.n)
      }
    };
  }

  function formatBig(value, suffix) {
    if (!Number.isFinite(value)) return "n/a";
    if (value >= 1e24) return (value / 1e24).toFixed(value >= 1e25 ? 0 : 1) + "Y" + (suffix || "");
    if (value >= 1e21) return (value / 1e21).toFixed(value >= 1e22 ? 0 : 1) + "Z" + (suffix || "");
    if (value >= 1e18) return (value / 1e18).toFixed(value >= 1e19 ? 0 : 1) + "E" + (suffix || "");
    if (value >= 1e15) return (value / 1e15).toFixed(value >= 1e16 ? 0 : 1) + "P" + (suffix || "");
    if (value >= 1e12) return (value / 1e12).toFixed(value >= 1e13 ? 0 : 1) + "T" + (suffix || "");
    if (value >= 1e9) return (value / 1e9).toFixed(value >= 1e10 ? 0 : 1) + "B" + (suffix || "");
    if (value >= 1e6) return (value / 1e6).toFixed(value >= 1e7 ? 0 : 1) + "M" + (suffix || "");
    return Math.round(value).toLocaleString() + (suffix || "");
  }

  function formatLoss(value) {
    return value.toFixed(3);
  }

  function formatPct(value, digits) {
    return value.toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatTilt(value) {
    var factor = Math.pow(10, value / 100);
    return (value >= 0 ? "+" : "") + value + " (" + factor.toFixed(factor >= 10 ? 0 : 2) + "x N)";
  }

  function metric(label, value) {
    return '<div class="compute-optimal-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      raw[key] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(root, params) {
    var compute = computeBudget(params);
    var display = {
      computeLog10: formatBig(compute, "F"),
      modelTilt: formatTilt(params.modelTilt),
      uniqueTokensT: formatBig(uniqueTokens(params), " tok"),
      freeEpochs: String(params.freeEpochs)
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")] || "";
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
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

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = targetHeight + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(targetHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, targetHeight);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, targetHeight);
    return { ctx: ctx, width: width, height: targetHeight };
  }

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.panel;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, box.x + 12, box.y + 21);
  }

  function log10(value) {
    return Math.log(value) / Math.LN10;
  }

  function drawPoint(ctx, x, y, color, label, align) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.white;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "700 11px system-ui, -apple-system, Segoe UI, sans-serif";
    var tx = align === "right" ? x - ctx.measureText(label).width - 7 : x + 7;
    ctx.fillText(label, tx, y - 7);
  }

  function drawPlane(ctx, result, box) {
    panel(ctx, box, "1. Fixed compute is a diagonal frontier");
    var plot = { x: box.x + 50, y: box.y + 42, w: box.w - 70, h: box.h - 76 };
    var points = result.curve.concat([result.capAware, result.noCap, result.chosen]);
    var xs = points.map(function (p) { return log10(p.n); });
    var ys = points.map(function (p) { return log10(p.d); });
    var xmin = Math.min.apply(null, xs) - 0.15;
    var xmax = Math.max.apply(null, xs) + 0.15;
    var ymin = Math.min.apply(null, ys) - 0.15;
    var ymax = Math.max.apply(null, ys) + 0.15;
    var x = function (n) { return plot.x + (log10(n) - xmin) / (xmax - xmin) * plot.w; };
    var y = function (d) { return plot.y + (ymax - log10(d)) / (ymax - ymin) * plot.h; };

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var gx = plot.x + plot.w * i / 4;
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath(); ctx.moveTo(gx, plot.y); ctx.lineTo(gx, plot.y + plot.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plot.x, gy); ctx.lineTo(plot.x + plot.w, gy); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);

    ctx.strokeStyle = COLORS.frontier;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.curve.forEach(function (row, index) {
      var px = x(row.n);
      var py = y(row.d);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    drawPoint(ctx, x(result.noCap.n), y(result.noCap.d), COLORS.data, "no cap", "right");
    drawPoint(ctx, x(result.capAware.n), y(result.capAware.d), COLORS.optimal, "best");
    drawPoint(ctx, x(result.chosen.n), y(result.chosen.d), COLORS.chosen, "chosen");

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("parameters", plot.x + plot.w - 64, plot.y + plot.h + 28);
    ctx.save();
    ctx.translate(plot.x - 34, plot.y + 72);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("training tokens", 0, 0);
    ctx.restore();
  }

  function drawCurve(ctx, result, box) {
    panel(ctx, box, "2. Allocation along the frontier has a valley");
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 58, h: box.h - 76 };
    var minLoss = Math.min.apply(null, result.curve.map(function (row) { return row.loss; }));
    var maxLoss = Math.max.apply(null, result.curve.map(function (row) { return row.loss; }));
    var x = function (tilt) { return plot.x + (tilt + 150) / 300 * plot.w; };
    var y = function (loss) { return plot.y + (maxLoss - loss) / Math.max(1e-9, maxLoss - minLoss) * plot.h; };

    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var gx = plot.x + plot.w * i / 4;
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath(); ctx.moveTo(gx, plot.y); ctx.lineTo(gx, plot.y + plot.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plot.x, gy); ctx.lineTo(plot.x + plot.w, gy); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);

    ctx.strokeStyle = COLORS.frontier;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.curve.forEach(function (row, index) {
      var px = x(row.tilt);
      var py = y(row.loss);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    drawPoint(ctx, x(result.params.modelTilt), y(result.chosen.loss), COLORS.chosen, "chosen");
    var capTilt = 100 * log10(result.capAware.n / result.noCap.n);
    drawPoint(ctx, x(capTilt), y(result.capAware.loss), COLORS.optimal, "best", "right");

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("smaller model / more tokens", plot.x, plot.y + plot.h + 28);
    ctx.fillText("larger model / fewer tokens", plot.x + plot.w - 142, plot.y + plot.h + 28);
  }

  function drawTerms(ctx, result, box) {
    panel(ctx, box, "3. Loss is a ledger, not one number");
    var items = [
      { label: "model term", value: result.chosen.modelTerm, color: COLORS.model },
      { label: "data term", value: result.chosen.dataTerm, color: COLORS.data },
      { label: "irreducible", value: IRREDUCIBLE, color: COLORS.cap }
    ];
    var max = Math.max.apply(null, items.map(function (row) { return row.value; }));
    var left = box.x + 20;
    var top = box.y + 52;
    var barW = box.w - 40;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    items.forEach(function (row, i) {
      var y = top + i * 42;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(row.label, left, y - 7);
      ctx.fillStyle = COLORS.white;
      ctx.fillRect(left, y, barW, 17);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, y, barW, 17);
      ctx.fillStyle = row.color;
      ctx.fillRect(left, y, barW * row.value / max, 17);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(row.value.toFixed(3), left + barW - 44, y + 13);
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    });
    ctx.fillStyle = result.chosen.wastedShare > 0.05 ? COLORS.warn : COLORS.optimal;
    ctx.font = "700 12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("effective tokens: " + formatBig(result.chosen.effectiveTokens, ""), left, box.y + box.h - 44);
    ctx.fillText("epochs: " + result.chosen.epochs.toFixed(result.chosen.epochs >= 10 ? 0 : 1), left, box.y + box.h - 24);
  }

  function drawFrontier(ctx, result, box) {
    panel(ctx, box, "4. A data cap bends the optimum");
    var plot = { x: box.x + 46, y: box.y + 42, w: box.w - 64, h: box.h - 76 };
    var xs = result.frontier.map(function (row) { return log10(row.compute); });
    var ys = result.frontier.reduce(function (out, row) {
      out.push(log10(row.noCapN), log10(row.capN));
      return out;
    }, []);
    var xmin = Math.min.apply(null, xs);
    var xmax = Math.max.apply(null, xs);
    var ymin = Math.min.apply(null, ys) - 0.1;
    var ymax = Math.max.apply(null, ys) + 0.1;
    var x = function (compute) { return plot.x + (log10(compute) - xmin) / (xmax - xmin) * plot.w; };
    var y = function (n) { return plot.y + (ymax - log10(n)) / (ymax - ymin) * plot.h; };
    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var gx = plot.x + plot.w * i / 4;
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath(); ctx.moveTo(gx, plot.y); ctx.lineTo(gx, plot.y + plot.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plot.x, gy); ctx.lineTo(plot.x + plot.w, gy); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      result.frontier.forEach(function (row, index) {
        var px = x(row.compute);
        var py = y(row[key]);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    line("noCapN", COLORS.data);
    line("capN", COLORS.optimal);
    drawPoint(ctx, x(result.compute), y(result.capAware.n), COLORS.optimal, "cap-aware");
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("compute", plot.x + plot.w - 48, plot.y + plot.h + 28);
    ctx.fillText("purple: no data cap; green: cap-aware", plot.x, plot.y + plot.h + 28);
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 620;
    var setup = setupCanvas(canvas, compact ? 1050 : 720);
    var pad = compact ? 18 : 28;
    var gap = compact ? 20 : 24;
    var innerW = setup.width - pad * 2;
    var ctx = setup.ctx;
    if (compact) {
      var h = 232;
      drawPlane(ctx, result, { x: pad, y: 22, w: innerW, h: h });
      drawCurve(ctx, result, { x: pad, y: 22 + h + gap, w: innerW, h: h });
      drawTerms(ctx, result, { x: pad, y: 22 + 2 * (h + gap), w: innerW, h: h });
      drawFrontier(ctx, result, { x: pad, y: 22 + 3 * (h + gap), w: innerW, h: h });
      return;
    }
    var colW = (innerW - gap) / 2;
    var rowH = 306;
    drawPlane(ctx, result, { x: pad, y: 26, w: colW, h: rowH });
    drawCurve(ctx, result, { x: pad + colW + gap, y: 26, w: colW, h: rowH });
    drawTerms(ctx, result, { x: pad, y: 26 + rowH + gap, w: colW, h: rowH });
    drawFrontier(ctx, result, { x: pad + colW + gap, y: 26 + rowH + gap, w: colW, h: rowH });
  }

  function renderMetrics(root, result) {
    var rows = [
      metric("chosen model", formatBig(result.chosen.n, " params")),
      metric("training tokens", formatBig(result.chosen.d, " tok")),
      metric("tokens / param", result.summary.tokensPerParam.toFixed(result.summary.tokensPerParam >= 100 ? 0 : 1)),
      metric("loss", formatLoss(result.chosen.loss)),
      metric("penalty vs best", formatPct(result.summary.chosenPctPenalty, 2)),
      metric("wasted repeat", formatPct(result.chosen.wastedShare * 100, 1))
    ];
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = rows.join("");
  }

  function render(root) {
    var params = parseParams(root);
    updateOutputs(root, params);
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (String(input.value) !== String(params[key])) input.value = params[key];
    });
    var result = evaluate(params);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
    root.__computeOptimalLast = result;
  }

  function initOne(root) {
    if (root.__computeOptimalReady) return;
    root.__computeOptimalReady = true;
    var pending = null;
    var schedule = function () {
      if (pending) global.cancelAnimationFrame(pending);
      pending = global.requestAnimationFrame(function () {
        pending = null;
        render(root);
      });
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render(root);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-compute-optimal-lab]")).forEach(initOne);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  global.ComputeOptimalLab = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    noCapOptimum: noCapOptimum,
    effectiveTokens: effectiveTokens
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.ComputeOptimalLab;
  }
})(typeof window !== "undefined" ? window : globalThis);
