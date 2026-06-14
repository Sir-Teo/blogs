(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    memory: "#0f766e",
    compute: "#7c3aed",
    selected: "#dc2626",
    point: "#2563eb",
    amber: "#b45309",
    dark: "#0f172a"
  };

  var DEFAULTS = {
    peak: 600,
    bandwidth: 3350,
    bytes: 4,
    tile: 128,
    reuse: 65,
    kernel: "triad"
  };

  var KERNELS = [
    { id: "triad", name: "STREAM triad", short: "triad" },
    { id: "dot", name: "dot product", short: "dot" },
    { id: "spmv", name: "sparse matvec", short: "SpMV" },
    { id: "stencil", name: "7-point stencil", short: "stencil" },
    { id: "gemm", name: "tiled GEMM", short: "GEMM" },
    { id: "attention", name: "attention block", short: "attention" }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var kernel = String(raw.kernel || DEFAULTS.kernel);
    if (!KERNELS.some(function (row) { return row.id === kernel; })) kernel = DEFAULTS.kernel;
    var bytes = Math.round(number(raw, "bytes"));
    if (bytes !== 2 && bytes !== 4 && bytes !== 8) bytes = DEFAULTS.bytes;
    return {
      peak: clamp(Math.round(number(raw, "peak")), 10, 20000),
      bandwidth: clamp(Math.round(number(raw, "bandwidth")), 50, 6000),
      bytes: bytes,
      tile: clamp(Math.round(number(raw, "tile") / 8) * 8, 16, 256),
      reuse: clamp(Math.round(number(raw, "reuse")), 0, 100),
      kernel: kernel
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function kernelSpec(id, p) {
    var b = p.bytes;
    var reuse = p.reuse / 100;
    var tile = p.tile;
    if (id === "triad") {
      return {
        id: id,
        flops: 2,
        bytes: 3 * b,
        note: "read x, read y, write y"
      };
    }
    if (id === "dot") {
      return {
        id: id,
        flops: 2,
        bytes: 2 * b,
        note: "two streaming reads"
      };
    }
    if (id === "spmv") {
      var nnzPerRow = 14;
      var bytesPerNnz = b + 4 + b * (1 - 0.72 * reuse) + 2 * b / nnzPerRow;
      return {
        id: id,
        flops: 2,
        bytes: bytesPerNnz,
        note: "CSR value, index, x reuse, y amortized"
      };
    }
    if (id === "stencil") {
      var effectiveLoads = 7 - 5.4 * reuse;
      return {
        id: id,
        flops: 13,
        bytes: (effectiveLoads + 1) * b,
        note: "neighbor reuse moves the point right"
      };
    }
    if (id === "gemm") {
      return {
        id: id,
        flops: 2 * tile * tile * tile,
        bytes: 4 * tile * tile * b,
        note: "A tile, B tile, C read and write"
      };
    }
    var headDim = 64;
    var scoreTraffic = tile * tile * b * (1 - 0.88 * reuse);
    return {
      id: id,
      flops: 2 * tile * tile * headDim,
      bytes: (2 * tile * headDim * b) + scoreTraffic,
      note: "Q/K reads plus materialized score traffic"
    };
  }

  function kernelRows(p) {
    return KERNELS.map(function (meta) {
      var spec = kernelSpec(meta.id, p);
      var intensity = spec.flops / Math.max(1e-12, spec.bytes);
      return {
        id: meta.id,
        name: meta.name,
        short: meta.short,
        flops: spec.flops,
        bytes: spec.bytes,
        intensity: intensity,
        note: spec.note
      };
    });
  }

  function roofTf(intensity, p) {
    var peakTf = p.peak / 10;
    var memoryTf = p.bandwidth * intensity / 1000;
    return Math.min(peakTf, memoryTf);
  }

  function classify(intensity, p) {
    var ridge = ridgePoint(p);
    if (intensity < ridge * 0.9) return "memory-bound";
    if (intensity > ridge * 1.1) return "compute-bound";
    return "near ridge";
  }

  function ridgePoint(p) {
    return (p.peak / 10) * 1000 / p.bandwidth;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var rows = kernelRows(params).map(function (row) {
      row.boundTf = roofTf(row.intensity, params);
      row.bound = classify(row.intensity, params);
      return row;
    });
    var selected = rows.find(function (row) { return row.id === params.kernel; }) || rows[0];
    var peakTf = params.peak / 10;
    var ridge = ridgePoint(params);
    var flops = 1e12;
    var bytesMoved = flops / selected.intensity;
    var computeSeconds = flops / (peakTf * 1e12);
    var memorySeconds = bytesMoved / (params.bandwidth * 1e9);
    var seconds = Math.max(computeSeconds, memorySeconds);
    var halfBytesTf = roofTf(selected.intensity * 2, params);
    var doublePeakTf = Math.min(peakTf * 2, params.bandwidth * selected.intensity / 1000);
    var checks = {
      finite: Number.isFinite(ridge) && Number.isFinite(selected.intensity) && Number.isFinite(seconds),
      positive: ridge > 0 && selected.intensity > 0 && selected.boundTf > 0,
      selectedKnown: rows.some(function (row) { return row.id === params.kernel; }),
      roofHonored: selected.boundTf <= peakTf + 1e-9,
      rowsComplete: rows.length === KERNELS.length
    };
    return {
      params: params,
      rows: rows,
      selected: selected,
      peakTf: peakTf,
      ridge: ridge,
      workload: {
        flops: flops,
        bytes: bytesMoved,
        computeSeconds: computeSeconds,
        memorySeconds: memorySeconds,
        seconds: seconds
      },
      whatIf: {
        nowTf: selected.boundTf,
        halfBytesTf: halfBytesTf,
        doublePeakTf: doublePeakTf,
        bothTf: Math.min(peakTf * 2, params.bandwidth * selected.intensity * 2 / 1000)
      },
      checks: checks
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(digits == null ? 1 : digits);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatTf(value) {
    if (value >= 1) return formatNumber(value, value >= 10 ? 1 : 2) + " TF/s";
    return formatNumber(value * 1000, 0) + " GF/s";
  }

  function metric(label, value) {
    return '<div class="roofline-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function syncOutputs(root, result) {
    var p = result.params;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      peak: formatNumber(p.peak / 10, 1) + " TF/s",
      bandwidth: formatNumber(p.bandwidth / 1000, 2) + " TB/s",
      bytes: p.bytes + " B",
      tile: p.tile,
      reuse: p.reuse + "%",
      kernel: result.selected.short
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (values[key] != null) output.textContent = values[key];
    });
  }

  function renderMetrics(root, result) {
    var target = root.querySelector("[data-metrics]");
    if (!target) return;
    var audit = Object.keys(result.checks).every(function (key) { return result.checks[key]; }) ? "passed" : "check";
    target.innerHTML = [
      metric("Ridge point", formatNumber(result.ridge, 2) + " flop/B"),
      metric("Selected intensity", formatNumber(result.selected.intensity, 2) + " flop/B"),
      metric("Roof limit", formatTf(result.selected.boundTf)),
      metric("Bottleneck", result.selected.bound),
      metric("Half-byte gain", formatNumber(result.whatIf.halfBytesTf / result.whatIf.nowTf, 2) + "x"),
      metric("Audit", audit)
    ].join("");
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 680 ? 1120 : 760;
    var ratio = Math.min(2, global.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssWidth * ratio) || canvas.height !== Math.round(cssHeight * ratio)) {
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      canvas.style.height = cssHeight + "px";
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, rect.x + 14, rect.y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(fitText(ctx, subtitle, rect.w - 28), rect.x + 14, rect.y + 42);
    }
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var trimmed = text;
    while (trimmed.length > 4 && ctx.measureText(trimmed + "...").width > maxWidth) trimmed = trimmed.slice(0, -1);
    return trimmed.trim() + "...";
  }

  function log10(x) {
    return Math.log(x) / Math.LN10;
  }

  function drawRoof(ctx, rect, result) {
    panel(ctx, rect, "Roofline map", "attainable performance <= min(peak, bandwidth x intensity)");
    var plot = { x: rect.x + 54, y: rect.y + 58, w: rect.w - 76, h: rect.h - 96 };
    var xMin = 0.04;
    var xMax = 512;
    var yMin = 0.03;
    var yMax = Math.max(result.peakTf * 1.8, 2);
    function sx(x) { return plot.x + (log10(x) - log10(xMin)) / (log10(xMax) - log10(xMin)) * plot.w; }
    function sy(y) { return plot.y + plot.h - (log10(y) - log10(yMin)) / (log10(yMax) - log10(yMin)) * plot.h; }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [0.1, 1, 10, 100].forEach(function (x) {
      if (x < xMin || x > xMax) return;
      ctx.beginPath();
      ctx.moveTo(sx(x), plot.y);
      ctx.lineTo(sx(x), plot.y + plot.h);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(String(x), sx(x) - 5, plot.y + plot.h + 18);
    });
    [0.1, 1, 10, 100, 1000].forEach(function (y) {
      if (y < yMin || y > yMax) return;
      ctx.beginPath();
      ctx.moveTo(plot.x, sy(y));
      ctx.lineTo(plot.x + plot.w, sy(y));
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(y + "", plot.x - 35, sy(y) + 4);
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.memory;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    var started = false;
    for (var i = 0; i <= 160; i += 1) {
      var lx = log10(xMin) + (log10(xMax) - log10(xMin)) * i / 160;
      var xVal = Math.pow(10, lx);
      var yVal = Math.min(result.peakTf, result.params.bandwidth * xVal / 1000);
      if (!started) {
        ctx.moveTo(sx(xVal), sy(yVal));
        started = true;
      } else ctx.lineTo(sx(xVal), sy(yVal));
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.compute;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(plot.x, sy(result.peakTf));
    ctx.lineTo(plot.x + plot.w, sy(result.peakTf));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.dark;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(sx(result.ridge), plot.y);
    ctx.lineTo(sx(result.ridge), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    result.rows.forEach(function (row) {
      var selected = row.id === result.selected.id;
      ctx.fillStyle = selected ? COLORS.selected : COLORS.point;
      ctx.globalAlpha = selected ? 1 : 0.7;
      ctx.beginPath();
      ctx.arc(sx(row.intensity), sy(row.boundTf), selected ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = selected ? "700 12px system-ui, sans-serif" : "11px system-ui, sans-serif";
      ctx.fillText(row.short, sx(row.intensity) + 7, sy(row.boundTf) - 5);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("operational intensity (flop/byte)", plot.x + 10, rect.y + rect.h - 15);
    ctx.fillText("TF/s", plot.x - 40, plot.y - 8);
    ctx.fillText("ridge", sx(result.ridge) + 5, plot.y + 16);
  }

  function drawTimes(ctx, rect, result) {
    panel(ctx, rect, "One trillion FLOPs", "runtime is the slower of compute time and memory time");
    var plot = { x: rect.x + 22, y: rect.y + 76, w: rect.w - 44, h: rect.h - 112 };
    var maxTime = Math.max(result.workload.computeSeconds, result.workload.memorySeconds) * 1.2;
    var bars = [
      { label: "compute clock", value: result.workload.computeSeconds, color: COLORS.compute },
      { label: "memory clock", value: result.workload.memorySeconds, color: COLORS.memory },
      { label: "roof runtime", value: result.workload.seconds, color: COLORS.selected }
    ];
    bars.forEach(function (bar, i) {
      var y = plot.y + i * 55;
      var w = plot.w * bar.value / maxTime;
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(plot.x, y, plot.w, 24);
      ctx.fillStyle = bar.color;
      ctx.fillRect(plot.x, y, w, 24);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.fillText(bar.label, plot.x, y - 7);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(formatNumber(bar.value * 1000, 2) + " ms", plot.x + Math.min(plot.w - 70, w + 8), y + 17);
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.fillText(result.selected.name, plot.x, rect.y + rect.h - 24);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(fitText(ctx, result.selected.note, plot.w), plot.x, rect.y + rect.h - 8);
  }

  function drawLedger(ctx, rect, result) {
    panel(ctx, rect, "Denominator ledger", "bytes moved are what divide the FLOPs");
    var row = result.selected;
    var plot = { x: rect.x + 24, y: rect.y + 70, w: rect.w - 48, h: rect.h - 108 };
    var max = Math.max(row.flops, row.bytes);
    var entries = [
      { label: "FLOPs per unit", value: row.flops, color: COLORS.compute },
      { label: "Bytes per unit", value: row.bytes, color: COLORS.memory }
    ];
    entries.forEach(function (entry, i) {
      var y = plot.y + i * 58;
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(plot.x, y, plot.w, 28);
      ctx.fillStyle = entry.color;
      ctx.fillRect(plot.x, y, plot.w * entry.value / max, 28);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.fillText(entry.label, plot.x, y - 8);
      ctx.fillStyle = COLORS.dark;
      ctx.font = "700 13px system-ui, sans-serif";
      ctx.fillText(formatNumber(entry.value, 1), plot.x + 8, y + 19);
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.fillText("intensity = " + formatNumber(row.intensity, 2) + " flop/B", plot.x, rect.y + rect.h - 35);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("A point moves right when useful work reuses already-moved bytes.", plot.x, rect.y + rect.h - 14);
  }

  function drawWhatIf(ctx, rect, result) {
    panel(ctx, rect, "Optimization directions", "fewer bytes moves right; more peak moves the flat roof");
    var plot = { x: rect.x + 28, y: rect.y + 66, w: rect.w - 56, h: rect.h - 102 };
    var bars = [
      { label: "now", value: result.whatIf.nowTf, color: COLORS.selected },
      { label: "halve bytes", value: result.whatIf.halfBytesTf, color: COLORS.memory },
      { label: "double peak", value: result.whatIf.doublePeakTf, color: COLORS.compute },
      { label: "both", value: result.whatIf.bothTf, color: COLORS.amber }
    ];
    var max = Math.max.apply(null, bars.map(function (bar) { return bar.value; })) * 1.12;
    var gap = 10;
    var bw = (plot.w - gap * (bars.length - 1)) / bars.length;
    bars.forEach(function (bar, i) {
      var h = plot.h * bar.value / max;
      var x = plot.x + i * (bw + gap);
      var y = plot.y + plot.h - h;
      ctx.fillStyle = bar.color;
      ctx.fillRect(x, y, bw, h);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.fillText(formatTf(bar.value), x, y - 7);
      ctx.save();
      ctx.translate(x + bw / 2, plot.y + plot.h + 12);
      ctx.rotate(-0.35);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(bar.label, -ctx.measureText(bar.label).width / 2, 0);
      ctx.restore();
    });
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    var width = frame.width;
    var height = frame.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);
    var pad = 14;
    if (width < 680) {
      drawRoof(ctx, { x: pad, y: pad, w: width - pad * 2, h: 390 }, result);
      drawTimes(ctx, { x: pad, y: 420, w: width - pad * 2, h: 220 }, result);
      drawLedger(ctx, { x: pad, y: 656, w: width - pad * 2, h: 210 }, result);
      drawWhatIf(ctx, { x: pad, y: 882, w: width - pad * 2, h: height - 896 }, result);
    } else {
      var leftW = Math.floor((width - pad * 3) * 0.58);
      var rightW = width - pad * 3 - leftW;
      drawRoof(ctx, { x: pad, y: pad, w: leftW, h: height - pad * 2 }, result);
      drawTimes(ctx, { x: pad * 2 + leftW, y: pad, w: rightW, h: 230 }, result);
      drawLedger(ctx, { x: pad * 2 + leftW, y: 258, w: rightW, h: 220 }, result);
      drawWhatIf(ctx, { x: pad * 2 + leftW, y: 506, w: rightW, h: height - 520 }, result);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__rooflineResult = result;
  }

  function init(root) {
    if (!root || root.__rooflineReady) return;
    root.__rooflineReady = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    var resizeTimer = null;
    global.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(root); }, 120);
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-roofline-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    kernelSpec: kernelSpec,
    kernelRows: kernelRows,
    roofTf: roofTf,
    ridgePoint: ridgePoint,
    evaluate: evaluate,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.RooflineLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
