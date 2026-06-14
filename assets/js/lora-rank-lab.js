(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    signal: "#0f766e",
    noise: "#c2410c",
    selected: "#2563eb",
    clean: "#6d28d9",
    train: "#b45309",
    full: "#be123c",
    positive: "#0f766e",
    negative: "#7c3aed"
  };

  var MAX_COMPONENTS = 42;
  var HEATMAP_SIZE = 34;
  var HIDDEN_DIM = 96;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32((index + 1) | 0, seed) + 0.5) / 4294967297;
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="lora-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      adapterRank: clamp(Math.round(raw.adapterRank == null ? 8 : raw.adapterRank), 1, MAX_COMPONENTS),
      examples: clamp(Math.round(raw.examples == null ? 512 : raw.examples), 64, 8192),
      noise: clamp(raw.noise == null ? 35 : Number(raw.noise), 0, 100) / 100,
      spectrumRatio: clamp(raw.spectrumRatio == null ? 78 : Number(raw.spectrumRatio), 55, 98) / 100,
      taskRank: clamp(Math.round(raw.taskRank == null ? 12 : raw.taskRank), 1, 32)
    };
  }

  function signalSigma(index, params) {
    return Math.pow(params.spectrumRatio, index);
  }

  function noiseSigma(index, params) {
    var sampleScale = Math.sqrt(512 / params.examples);
    var top = params.noise * 0.55 * sampleScale;
    var jitter = 0.78 + 0.38 * uniform(index * 17 + 5, 0xa11ce);
    return top * Math.pow(0.86, index) * jitter;
  }

  function signFor(index, kind) {
    return hash32(index * 1009 + (kind === "noise" ? 17 : 3), 0x51f15e) & 1 ? 1 : -1;
  }

  function basis(index, pos, size) {
    if (index === 0) return 1 / Math.sqrt(size);
    return Math.sqrt(2 / size) * Math.cos(Math.PI * (pos + 0.5) * index / size);
  }

  function componentBasisIndex(component, side, size) {
    var raw;
    if (component.kind === "signal") {
      raw = side === "u" ? component.index + 1 : (component.index * 7 + 3);
    } else {
      raw = side === "u" ? (component.index * 5 + 11) : (component.index * 13 + 17);
    }
    return raw % size;
  }

  function makeComponents(params) {
    var components = [];
    for (var i = 0; i < params.taskRank; i += 1) {
      components.push({
        energy: Math.pow(signalSigma(i, params), 2),
        index: i,
        kind: "signal",
        label: "s" + String(i + 1),
        sigma: signalSigma(i, params),
        sign: 1
      });
    }
    for (var j = 0; j < MAX_COMPONENTS; j += 1) {
      var sigma = noiseSigma(j, params);
      if (sigma > 1e-6) {
        components.push({
          energy: sigma * sigma,
          index: j,
          kind: "noise",
          label: "n" + String(j + 1),
          sigma: sigma,
          sign: signFor(j, "noise")
        });
      }
    }
    return components.sort(function (a, b) {
      if (b.sigma !== a.sigma) return b.sigma - a.sigma;
      if (a.kind !== b.kind) return a.kind === "signal" ? -1 : 1;
      return a.index - b.index;
    });
  }

  function selectComponents(components, rank) {
    var selected = {};
    components.slice(0, rank).forEach(function (component) {
      selected[component.kind + ":" + component.index] = true;
    });
    return selected;
  }

  function summarize(params, rank) {
    var components = makeComponents(params);
    var selected = selectComponents(components, Math.min(rank, components.length));
    var cleanEnergy = 0;
    var observedEnergy = 0;
    var selectedSignal = 0;
    var missedSignal = 0;
    var selectedNoise = 0;
    var missedObserved = 0;
    components.forEach(function (component) {
      var key = component.kind + ":" + component.index;
      observedEnergy += component.energy;
      if (component.kind === "signal") cleanEnergy += component.energy;
      if (selected[key]) {
        if (component.kind === "signal") selectedSignal += component.energy;
        else selectedNoise += component.energy;
      } else {
        missedObserved += component.energy;
        if (component.kind === "signal") missedSignal += component.energy;
      }
    });
    cleanEnergy = Math.max(cleanEnergy, 1e-12);
    observedEnergy = Math.max(observedEnergy, 1e-12);
    return {
      cleanError: (missedSignal + selectedNoise) / cleanEnergy,
      components: components,
      missedSignal: missedSignal,
      observedEnergy: observedEnergy,
      selected: selected,
      selectedNoise: selectedNoise,
      selectedSignal: selectedSignal,
      signalCaptured: selectedSignal / cleanEnergy,
      trainError: missedObserved / observedEnergy
    };
  }

  function buildMatrix(params, selected, mode) {
    var size = HEATMAP_SIZE;
    var matrix = [];
    for (var r = 0; r < size; r += 1) {
      var row = [];
      for (var c = 0; c < size; c += 1) row.push(0);
      matrix.push(row);
    }
    var components = makeComponents(params);
    components.forEach(function (component) {
      var key = component.kind + ":" + component.index;
      var include = false;
      var coeff = component.sigma * component.sign;
      if (mode === "clean") include = component.kind === "signal";
      else if (mode === "learned") include = !!selected[key];
      else if (mode === "error") {
        if (component.kind === "signal" && !selected[key]) {
          include = true;
          coeff = -component.sigma;
        } else if (component.kind === "noise" && selected[key]) {
          include = true;
        }
      }
      if (!include) return;
      var uIndex = componentBasisIndex(component, "u", size);
      var vIndex = componentBasisIndex(component, "v", size);
      for (var i = 0; i < size; i += 1) {
        var u = basis(uIndex, i, size);
        for (var j = 0; j < size; j += 1) {
          matrix[i][j] += coeff * u * basis(vIndex, j, size);
        }
      }
    });
    return matrix;
  }

  function bestRank(params) {
    var best = { rank: 1, cleanError: Infinity };
    for (var r = 1; r <= MAX_COMPONENTS; r += 1) {
      var row = summarize(params, r);
      if (row.cleanError < best.cleanError) best = { rank: r, cleanError: row.cleanError };
    }
    return best;
  }

  function sweep(params) {
    var rows = [];
    for (var r = 1; r <= MAX_COMPONENTS; r += 1) {
      var summary = summarize(params, r);
      rows.push({
        cleanError: summary.cleanError,
        paramShare: loraParams(r) / fullParams(),
        rank: r,
        selectedNoise: summary.selectedNoise,
        signalCaptured: summary.signalCaptured,
        trainError: summary.trainError
      });
    }
    return rows;
  }

  function loraParams(rank) {
    return rank * (HIDDEN_DIM + HIDDEN_DIM);
  }

  function fullParams() {
    return HIDDEN_DIM * HIDDEN_DIM;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var current = summarize(params, params.adapterRank);
    var oracle = summarize(params, Math.min(params.taskRank, MAX_COMPONENTS));
    var best = bestRank(params);
    var selectedRows = current.components.filter(function (component) {
      return current.selected[component.kind + ":" + component.index];
    });
    return {
      best: best,
      cleanMatrix: buildMatrix(params, current.selected, "clean"),
      current: current,
      errorMatrix: buildMatrix(params, current.selected, "error"),
      fullCleanError: summarize(params, MAX_COMPONENTS).cleanError,
      fullParams: fullParams(),
      learnedMatrix: buildMatrix(params, current.selected, "learned"),
      loraParams: loraParams(params.adapterRank),
      oracleCleanError: oracle.cleanError,
      params: params,
      selectedNoiseCount: selectedRows.filter(function (row) { return row.kind === "noise"; }).length,
      selectedSignalCount: selectedRows.filter(function (row) { return row.kind === "signal"; }).length,
      spectrum: current.components.slice(0, 34),
      sweep: sweep(params)
    };
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
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

  function drawSpectrumPanel(ctx, result, box) {
    panelTitle(ctx, box, "Observed update spectrum", "blue outline means the adapter keeps that direction");
    var rows = result.spectrum;
    var plot = { x: box.x + 38, y: box.y + 54, w: box.w - 54, h: box.h - 88 };
    drawAxis(ctx, plot);
    var maxSigma = rows[0] ? rows[0].sigma : 1;
    var gap = plot.w / rows.length;
    rows.forEach(function (component, i) {
      var key = component.kind + ":" + component.index;
      var h = component.sigma / maxSigma * plot.h;
      var x = plot.x + i * gap + gap * 0.18;
      var w = Math.max(2, gap * 0.62);
      ctx.fillStyle = component.kind === "signal" ? COLORS.signal : COLORS.noise;
      ctx.globalAlpha = result.current.selected[key] ? 0.95 : 0.35;
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
      if (result.current.selected[key]) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(x, plot.y + plot.h - h, w, h);
      }
    });
    ctx.globalAlpha = 1;
    label(ctx, "signal", plot.x, box.y + box.h - 13, "left", COLORS.signal, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "noise", plot.x + 50, box.y + box.h - 13, "left", COLORS.noise, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "rank " + result.params.adapterRank, plot.x + plot.w, box.y + box.h - 13, "right", COLORS.selected, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawSweepPanel(ctx, result, box) {
    panelTitle(ctx, box, "Rank sweep", "training loss keeps falling; clean error can turn around");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 66, h: box.h - 88 };
    drawAxis(ctx, plot);
    var maxY = Math.max.apply(null, result.sweep.map(function (row) {
      return Math.max(row.cleanError, row.trainError);
    }));
    maxY = Math.max(0.05, Math.min(2.0, maxY * 1.15));
    function xScale(rank) {
      return plot.x + (rank - 1) / (MAX_COMPONENTS - 1) * plot.w;
    }
    function yScale(value) {
      return plot.y + plot.h - value / maxY * plot.h;
    }
    [0.25, 0.5, 0.75, 1].forEach(function (fraction) {
      var y = plot.y + plot.h * fraction;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    [
      { key: "cleanError", color: COLORS.clean, width: 2.4 },
      { key: "trainError", color: COLORS.train, width: 2.0 }
    ].forEach(function (line) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.beginPath();
      result.sweep.forEach(function (row, i) {
        var x = xScale(row.rank);
        var y = yScale(row[line.key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    var currentX = xScale(result.params.adapterRank);
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(currentX, plot.y);
    ctx.lineTo(currentX, plot.y + plot.h);
    ctx.stroke();
    var bestX = xScale(result.best.rank);
    ctx.strokeStyle = COLORS.signal;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(bestX, plot.y);
    ctx.lineTo(bestX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "violet clean error, amber train error", plot.x, box.y + box.h - 13, "left");
    label(ctx, "best rank " + result.best.rank, plot.x + plot.w, box.y + box.h - 13, "right", COLORS.signal, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawHeatmap(ctx, matrix, x, y, size, title) {
    var n = matrix.length;
    var maxAbs = 1e-9;
    matrix.forEach(function (row) {
      row.forEach(function (value) {
        maxAbs = Math.max(maxAbs, Math.abs(value));
      });
    });
    var cell = size / n;
    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j < n; j += 1) {
        var value = matrix[i][j] / maxAbs;
        var t = Math.min(1, Math.abs(value));
        if (value >= 0) {
          ctx.fillStyle = "rgb(" + Math.round(248 - 116 * t) + "," + Math.round(250 - 86 * t) + "," + Math.round(252 - 46 * t) + ")";
        } else {
          ctx.fillStyle = "rgb(" + Math.round(250 - 110 * t) + "," + Math.round(245 - 78 * t) + "," + Math.round(255 - 34 * t) + ")";
        }
        ctx.fillRect(x + j * cell, y + i * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x, y, size, size);
    label(ctx, title, x + size / 2, y + size + 15, "center", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawMatrixPanel(ctx, result, box) {
    panelTitle(ctx, box, "Matrix view", "clean update, learned adapter, and signed error");
    var gap = 14;
    var size = Math.min((box.w - gap * 2) / 3, box.h - 82);
    var y = box.y + 56;
    var x = box.x + Math.max(0, (box.w - size * 3 - gap * 2) / 2);
    drawHeatmap(ctx, result.cleanMatrix, x, y, size, "clean");
    drawHeatmap(ctx, result.learnedMatrix, x + size + gap, y, size, "adapter");
    drawHeatmap(ctx, result.errorMatrix, x + (size + gap) * 2, y, size, "error");
    label(ctx, "teal positive, violet negative", box.x, box.y + box.h - 13, "left");
    label(ctx, "orthogonal toy basis", box.x + box.w, box.y + box.h - 13, "right");
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Parameter ledger", "one square weight matrix with hidden dimension " + HIDDEN_DIM);
    var rows = [
      ["full trainable params", formatNumber(result.fullParams, 0)],
      ["LoRA trainable params", formatNumber(result.loraParams, 0)],
      ["LoRA / full", formatPercent(100 * result.loraParams / result.fullParams, 1)],
      ["selected signal dirs", result.selectedSignalCount + " / " + result.params.taskRank],
      ["selected noise dirs", String(result.selectedNoiseCount)],
      ["signal captured", formatPercent(100 * result.current.signalCaptured, 1)],
      ["clean error", formatPercent(100 * result.current.cleanError, 1)],
      ["train error", formatPercent(100 * result.current.trainError, 1)],
      ["full-rank clean error", formatPercent(100 * result.fullCleanError, 1)]
    ];
    var start = box.y + 52;
    var rowH = Math.min(24, Math.max(18, (box.h - 68) / rows.length));
    rows.forEach(function (row, i) {
      var y = start + i * rowH;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.24)" : "transparent";
      ctx.fillRect(box.x, y - 2, box.w, rowH);
      label(ctx, row[0], box.x + 4, y + rowH / 2, "left");
      label(ctx, row[1], box.x + box.w - 4, y + rowH / 2, "right", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 600;
    var height = compact ? 1080 : 700;
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
    var margin = compact ? 22 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawSpectrumPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 238 });
      drawSweepPanel(ctx, result, { x: margin, y: 296, w: panelW, h: 230 });
      drawMatrixPanel(ctx, result, { x: margin, y: 556, w: panelW, h: 220 });
      drawLedgerPanel(ctx, result, { x: margin, y: 808, w: panelW, h: 232 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawSpectrumPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 302 });
      drawSweepPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 302 });
      drawMatrixPanel(ctx, result, { x: margin, y: 382, w: panelW2, h: 258 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 382, w: panelW2, h: 258 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      adapterRank: String(result.params.adapterRank),
      examples: formatNumber(result.params.examples, 0),
      noise: formatPercent(result.params.noise * 100, 0),
      spectrumRatio: result.params.spectrumRatio.toFixed(2),
      taskRank: String(result.params.taskRank)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("LoRA params", formatNumber(result.loraParams, 0)),
        metric("param share", formatPercent(100 * result.loraParams / result.fullParams, 1)),
        metric("signal captured", formatPercent(100 * result.current.signalCaptured, 1)),
        metric("clean error", formatPercent(100 * result.current.cleanError, 1)),
        metric("train error", formatPercent(100 * result.current.trainError, 1)),
        metric("noise dirs kept", String(result.selectedNoiseCount)),
        metric("best rank", String(result.best.rank)),
        metric("full-rank error", formatPercent(100 * result.fullCleanError, 1))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-lora-lab]")).forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    makeComponents: makeComponents,
    simulate: simulate,
    summarize: summarize
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.LoRARankLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
