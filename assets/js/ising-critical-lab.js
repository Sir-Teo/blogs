(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    up: "#f8fafc",
    down: "#172026",
    metro: "#dc2626",
    wolff: "#2563eb",
    exact: "#0f766e",
    cluster: "#7c3aed",
    amber: "#b45309",
    dark: "#0f172a"
  };

  var TC = 2 / Math.log(1 + Math.SQRT2);

  var DEFAULTS = {
    temp: 227,
    size: 48,
    sweeps: 180,
    seed: 17,
    start: "random"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var start = String(raw.start || DEFAULTS.start);
    if (start !== "random" && start !== "plus" && start !== "stripe") start = DEFAULTS.start;
    return {
      temp: clamp(Math.round(readNumber(raw, "temp")), 120, 380),
      size: clamp(Math.round(readNumber(raw, "size") / 4) * 4, 24, 72),
      sweeps: clamp(Math.round(readNumber(raw, "sweeps") / 10) * 10, 60, 360),
      seed: clamp(Math.round(readNumber(raw, "seed")), 1, 9999),
      start: start
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function makeRng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function initSpins(size, start, rng) {
    var n = size * size;
    var spins = new Int8Array(n);
    for (var i = 0; i < n; i += 1) {
      if (start === "plus") spins[i] = 1;
      else if (start === "stripe") spins[i] = Math.floor((i % size) / Math.max(2, size / 6)) % 2 === 0 ? 1 : -1;
      else spins[i] = rng() < 0.5 ? -1 : 1;
    }
    return spins;
  }

  function magnetization(spins) {
    var total = 0;
    for (var i = 0; i < spins.length; i += 1) total += spins[i];
    return total / spins.length;
  }

  function energy(spins, size) {
    var total = 0;
    for (var y = 0; y < size; y += 1) {
      var row = y * size;
      var down = ((y + 1) % size) * size;
      for (var x = 0; x < size; x += 1) {
        var i = row + x;
        total -= spins[i] * spins[row + ((x + 1) % size)];
        total -= spins[i] * spins[down + x];
      }
    }
    return total / spins.length;
  }

  function neighborSum(spins, size, index) {
    var x = index % size;
    var y = Math.floor(index / size);
    var left = y * size + ((x + size - 1) % size);
    var right = y * size + ((x + 1) % size);
    var up = ((y + size - 1) % size) * size + x;
    var down = ((y + 1) % size) * size + x;
    return spins[left] + spins[right] + spins[up] + spins[down];
  }

  function metropolisSweep(spins, size, temp, rng) {
    var accepted = 0;
    var n = spins.length;
    for (var k = 0; k < n; k += 1) {
      var i = Math.floor(rng() * n);
      var dE = 2 * spins[i] * neighborSum(spins, size, i);
      if (dE <= 0 || rng() < Math.exp(-dE / temp)) {
        spins[i] = -spins[i];
        accepted += 1;
      }
    }
    return accepted / n;
  }

  function tryAdd(spins, index, spin, pAdd, rng, marked, stack, cluster) {
    if (marked[index] || spins[index] !== spin || rng() >= pAdd) return;
    marked[index] = 1;
    stack.push(index);
    cluster.push(index);
  }

  function wolffCluster(spins, size, temp, rng) {
    var n = spins.length;
    var seed = Math.floor(rng() * n);
    var spin = spins[seed];
    var pAdd = 1 - Math.exp(-2 / temp);
    var marked = new Uint8Array(n);
    var stack = [seed];
    var cluster = [seed];
    marked[seed] = 1;
    while (stack.length) {
      var index = stack.pop();
      var x = index % size;
      var y = Math.floor(index / size);
      tryAdd(spins, y * size + ((x + size - 1) % size), spin, pAdd, rng, marked, stack, cluster);
      tryAdd(spins, y * size + ((x + 1) % size), spin, pAdd, rng, marked, stack, cluster);
      tryAdd(spins, ((y + size - 1) % size) * size + x, spin, pAdd, rng, marked, stack, cluster);
      tryAdd(spins, ((y + 1) % size) * size + x, spin, pAdd, rng, marked, stack, cluster);
    }
    for (var i = 0; i < cluster.length; i += 1) spins[cluster[i]] = -spins[cluster[i]];
    return cluster.length;
  }

  function exactMagnetization(temp) {
    if (temp >= TC) return 0;
    var s = Math.sinh(2 / temp);
    return Math.pow(Math.max(0, 1 - Math.pow(s, -4)), 1 / 8);
  }

  function autocorrelation(values, maxLag) {
    var n = values.length;
    var mean = values.reduce(function (s, v) { return s + v; }, 0) / n;
    var variance = 0;
    for (var i = 0; i < n; i += 1) variance += Math.pow(values[i] - mean, 2);
    if (variance < 1e-12) return Array.from({ length: maxLag + 1 }, function (_, lag) {
      return { lag: lag, value: lag === 0 ? 1 : 0 };
    });
    var rows = [];
    for (var lag = 0; lag <= maxLag; lag += 1) {
      var cov = 0;
      for (var j = 0; j < n - lag; j += 1) cov += (values[j] - mean) * (values[j + lag] - mean);
      rows.push({ lag: lag, value: cov / variance * n / Math.max(1, n - lag) });
    }
    return rows;
  }

  function halfLife(acf) {
    for (var i = 1; i < acf.length; i += 1) {
      if (acf[i].value <= 0.5) return acf[i].lag;
    }
    return acf.length - 1;
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var temp = params.temp / 100;
    var n = params.size * params.size;
    var rngInit = makeRng(params.seed);
    var metroRng = makeRng(params.seed + 1009);
    var wolffRng = makeRng(params.seed + 2027);
    var initial = initSpins(params.size, params.start, rngInit);
    var metro = new Int8Array(initial);
    var wolff = new Int8Array(initial);
    var samples = 150;
    var metroSweeps = 0;
    var wolffTouched = 0;
    var metroAccept = [];
    var clusterSizes = [];
    var trace = [];
    for (var s = 0; s < samples; s += 1) {
      var target = (s + 1) * params.sweeps / samples;
      while (metroSweeps < target) {
        metroAccept.push(metropolisSweep(metro, params.size, temp, metroRng));
        metroSweeps += 1;
      }
      while (wolffTouched < target * n) {
        var cluster = wolffCluster(wolff, params.size, temp, wolffRng);
        clusterSizes.push(cluster / n);
        wolffTouched += cluster;
      }
      trace.push({
        t: target,
        metroM: magnetization(metro),
        wolffM: magnetization(wolff),
        metroE: energy(metro, params.size),
        wolffE: energy(wolff, params.size)
      });
    }
    var metroAbs = trace.map(function (row) { return Math.abs(row.metroM); });
    var wolffAbs = trace.map(function (row) { return Math.abs(row.wolffM); });
    var metroAcf = autocorrelation(metroAbs, 38);
    var wolffAcf = autocorrelation(wolffAbs, 38);
    var metroSignFlips = 0;
    var wolffSignFlips = 0;
    for (var i = 1; i < trace.length; i += 1) {
      if (trace[i - 1].metroM * trace[i].metroM < 0) metroSignFlips += 1;
      if (trace[i - 1].wolffM * trace[i].wolffM < 0) wolffSignFlips += 1;
    }
    var meanCluster = clusterSizes.length ? clusterSizes.reduce(function (a, b) { return a + b; }, 0) / clusterSizes.length : 0;
    var meanAccept = metroAccept.length ? metroAccept.reduce(function (a, b) { return a + b; }, 0) / metroAccept.length : 0;
    var exact = exactMagnetization(temp);
    var checks = {
      finite: Number.isFinite(meanCluster) && Number.isFinite(meanAccept) && trace.every(function (row) { return Number.isFinite(row.metroM) && Number.isFinite(row.wolffM); }),
      magnetizationBounded: trace.every(function (row) { return Math.abs(row.metroM) <= 1.0001 && Math.abs(row.wolffM) <= 1.0001; }),
      clusterBounded: meanCluster >= 0 && meanCluster <= 1,
      criticalKnown: Math.abs(TC - 2.269185314213022) < 1e-12,
      traceLength: trace.length === samples
    };
    return {
      params: params,
      temp: temp,
      tc: TC,
      exact: exact,
      initial: initial,
      metro: metro,
      wolff: wolff,
      trace: trace,
      metroAcf: metroAcf,
      wolffAcf: wolffAcf,
      summary: {
        meanCluster: meanCluster,
        meanAccept: meanAccept,
        metroHalfLife: halfLife(metroAcf),
        wolffHalfLife: halfLife(wolffAcf),
        metroFinalAbs: Math.abs(trace[trace.length - 1].metroM),
        wolffFinalAbs: Math.abs(trace[trace.length - 1].wolffM),
        metroSignFlips: metroSignFlips,
        wolffSignFlips: wolffSignFlips
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

  function formatPercent(value, digits) {
    return formatNumber(value * 100, digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="ising-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function syncOutputs(root, result) {
    var p = result.params;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      temp: formatNumber(result.temp, 2),
      size: p.size,
      sweeps: p.sweeps,
      seed: p.seed,
      start: p.start
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
      metric("T / Tc", formatNumber(result.temp / result.tc, 2)),
      metric("Exact |m|", formatNumber(result.exact, 2)),
      metric("Metro |m|", formatNumber(result.summary.metroFinalAbs, 2)),
      metric("Wolff |m|", formatNumber(result.summary.wolffFinalAbs, 2)),
      metric("Mean cluster", formatPercent(result.summary.meanCluster, 1)),
      metric("Audit", audit)
    ].join("");
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 680 ? 1160 : 780;
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

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var trimmed = text;
    while (trimmed.length > 4 && ctx.measureText(trimmed + "...").width > maxWidth) trimmed = trimmed.slice(0, -1);
    return trimmed.trim() + "...";
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

  function drawLattice(ctx, spins, size, x, y, w, h) {
    var cell = Math.floor(Math.min(w, h) / size);
    var side = cell * size;
    var ox = x + Math.floor((w - side) / 2);
    var oy = y + Math.floor((h - side) / 2);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(ox, oy, side, side);
    for (var row = 0; row < size; row += 1) {
      for (var col = 0; col < size; col += 1) {
        ctx.fillStyle = spins[row * size + col] > 0 ? COLORS.up : COLORS.down;
        ctx.fillRect(ox + col * cell, oy + row * cell, cell, cell);
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(ox, oy, side, side);
  }

  function drawFields(ctx, rect, result) {
    panel(ctx, rect, "Spin fields", "same start, equal touched-spin budget");
    var top = rect.y + 58;
    var h = rect.h - 88;
    var gap = 14;
    var w = (rect.w - 42 - gap) / 2;
    drawLattice(ctx, result.metro, result.params.size, rect.x + 14, top, w, h);
    drawLattice(ctx, result.wolff, result.params.size, rect.x + 28 + w, top, w, h);
    ctx.fillStyle = COLORS.metro;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText("Metropolis", rect.x + 16, rect.y + rect.h - 18);
    ctx.fillStyle = COLORS.wolff;
    ctx.fillText("Wolff cluster", rect.x + 30 + w, rect.y + rect.h - 18);
  }

  function drawTrace(ctx, rect, result) {
    panel(ctx, rect, "Magnetization trace", "raw m over the simulated sweep budget");
    var plot = { x: rect.x + 44, y: rect.y + 60, w: rect.w - 62, h: rect.h - 92 };
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [-1, -0.5, 0, 0.5, 1].forEach(function (v) {
      var y = plot.y + plot.h * (1 - (v + 1) / 2);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    function sx(i) { return plot.x + i / (result.trace.length - 1) * plot.w; }
    function sy(v) { return plot.y + plot.h * (1 - (v + 1) / 2); }
    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      result.trace.forEach(function (row, i) {
        if (i === 0) ctx.moveTo(sx(i), sy(row[key]));
        else ctx.lineTo(sx(i), sy(row[key]));
      });
      ctx.stroke();
    }
    if (result.exact > 0) {
      ctx.strokeStyle = COLORS.exact;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(plot.x, sy(result.exact));
      ctx.lineTo(plot.x + plot.w, sy(result.exact));
      ctx.moveTo(plot.x, sy(-result.exact));
      ctx.lineTo(plot.x + plot.w, sy(-result.exact));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    line("metroM", COLORS.metro);
    line("wolffM", COLORS.wolff);
    ctx.fillStyle = COLORS.metro;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("Metropolis", plot.x, rect.y + 48);
    ctx.fillStyle = COLORS.wolff;
    ctx.fillText("Wolff", plot.x + 84, rect.y + 48);
    ctx.fillStyle = COLORS.exact;
    ctx.fillText("exact |m|", plot.x + 130, rect.y + 48);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("-1", plot.x - 22, plot.y + plot.h + 4);
    ctx.fillText("1", plot.x - 16, plot.y + 4);
  }

  function drawAcf(ctx, rect, result) {
    panel(ctx, rect, "Forgetting curve", "autocorrelation of |m| from the trace");
    var plot = { x: rect.x + 42, y: rect.y + 60, w: rect.w - 60, h: rect.h - 96 };
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach(function (v) {
      var y = plot.y + plot.h * (1 - v);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    function sx(lag) { return plot.x + lag / 38 * plot.w; }
    function sy(v) { return plot.y + plot.h * (1 - clamp(v, -0.05, 1)); }
    function line(rows, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach(function (row, i) {
        if (i === 0) ctx.moveTo(sx(row.lag), sy(row.value));
        else ctx.lineTo(sx(row.lag), sy(row.value));
      });
      ctx.stroke();
    }
    line(result.metroAcf, COLORS.metro);
    line(result.wolffAcf, COLORS.wolff);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText("half-life: Metro " + result.summary.metroHalfLife + ", Wolff " + result.summary.wolffHalfLife, plot.x, rect.y + rect.h - 18);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("lag", plot.x + plot.w - 18, plot.y + plot.h + 22);
  }

  function drawTheory(ctx, rect, result) {
    panel(ctx, rect, "Thermodynamic limit", "Onsager-Yang spontaneous magnetization");
    var plot = { x: rect.x + 42, y: rect.y + 62, w: rect.w - 62, h: rect.h - 96 };
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach(function (v) {
      var y = plot.y + plot.h * (1 - v);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    function sx(temp) { return plot.x + (temp - 1.2) / (3.8 - 1.2) * plot.w; }
    function sy(m) { return plot.y + plot.h * (1 - m); }
    ctx.strokeStyle = COLORS.exact;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (var i = 0; i <= 160; i += 1) {
      var temp = 1.2 + (3.8 - 1.2) * i / 160;
      var m = exactMagnetization(temp);
      if (i === 0) ctx.moveTo(sx(temp), sy(m));
      else ctx.lineTo(sx(temp), sy(m));
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.dark;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(sx(TC), plot.y);
    ctx.lineTo(sx(TC), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.amber;
    ctx.beginPath();
    ctx.arc(sx(result.temp), sy(result.exact), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("T", plot.x + plot.w - 10, plot.y + plot.h + 22);
    ctx.fillText("Tc=" + formatNumber(TC, 3), sx(TC) + 5, plot.y + 16);
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
      drawFields(ctx, { x: pad, y: pad, w: width - pad * 2, h: 310 }, result);
      drawTrace(ctx, { x: pad, y: 340, w: width - pad * 2, h: 260 }, result);
      drawAcf(ctx, { x: pad, y: 616, w: width - pad * 2, h: 250 }, result);
      drawTheory(ctx, { x: pad, y: 882, w: width - pad * 2, h: height - 896 }, result);
    } else {
      var colW = (width - pad * 3) / 2;
      drawFields(ctx, { x: pad, y: pad, w: colW, h: 370 }, result);
      drawTrace(ctx, { x: pad * 2 + colW, y: pad, w: colW, h: 370 }, result);
      drawAcf(ctx, { x: pad, y: 402, w: colW, h: height - 416 }, result);
      drawTheory(ctx, { x: pad * 2 + colW, y: 402, w: colW, h: height - 416 }, result);
    }
  }

  function render(root) {
    var result = simulate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__isingResult = result;
  }

  function init(root) {
    if (!root || root.__isingReady) return;
    root.__isingReady = true;
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
    global.document.querySelectorAll("[data-ising-lab]").forEach(init);
  }

  var api = {
    tc: TC,
    cleanParams: cleanParams,
    exactMagnetization: exactMagnetization,
    simulate: simulate,
    metropolisSweep: metropolisSweep,
    wolffCluster: wolffCluster,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.IsingCriticalLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
