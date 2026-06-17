(function (global) {
  "use strict";

  var COLORS = {
    axis: "#d7dee5",
    black: "#172026",
    blue: "#2563eb",
    cyan: "#0891b2",
    grid: "#edf2f7",
    green: "#0f766e",
    muted: "#5d6872",
    orange: "#d97706",
    panel: "#f8fafc",
    purple: "#7c3aed",
    red: "#be123c",
    softBlue: "rgba(37, 99, 235, 0.12)",
    softOrange: "rgba(217, 119, 6, 0.14)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    bins: 64,
    offset: 0.37,
    padding: 4,
    separation: 3.4,
    weakDb: -38,
    window: "hann"
  };

  var BASE_BIN = 11;
  var PHASE = 0.37;
  var WINDOWS = {
    rectangular: {
      label: "rectangular",
      fn: function () { return 1; }
    },
    hann: {
      label: "Hann",
      fn: function (n, N) { return 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N); }
    },
    hamming: {
      label: "Hamming",
      fn: function (n, N) { return 0.54 - 0.46 * Math.cos(2 * Math.PI * n / N); }
    },
    blackmanHarris: {
      label: "Blackman-Harris",
      fn: function (n, N) {
        var a = 2 * Math.PI * n / N;
        return 0.35875 - 0.48829 * Math.cos(a) + 0.14128 * Math.cos(2 * a) - 0.01168 * Math.cos(3 * a);
      }
    },
    flatTop: {
      label: "flat top",
      fn: function (n, N) {
        var a = 2 * Math.PI * n / N;
        return 0.21557895 - 0.41663158 * Math.cos(a) + 0.277263158 * Math.cos(2 * a) - 0.083578947 * Math.cos(3 * a) + 0.006947368 * Math.cos(4 * a);
      }
    }
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
    var windowKey = WINDOWS[raw.window] ? raw.window : DEFAULTS.window;
    return {
      bins: snap(raw.bins, DEFAULTS.bins, 32, 256, 32),
      offset: snap(raw.offset, DEFAULTS.offset, 0, 0.5, 0.01),
      padding: snap(raw.padding, DEFAULTS.padding, 1, 8, 1),
      separation: snap(raw.separation, DEFAULTS.separation, 1.1, 7.8, 0.1),
      weakDb: snap(raw.weakDb, DEFAULTS.weakDb, -60, -12, 1),
      window: windowKey
    };
  }

  function makeWindow(params) {
    var N = params.bins;
    var fn = WINDOWS[params.window].fn;
    var w = [];
    var sum = 0;
    var sumSq = 0;
    for (var n = 0; n < N; n += 1) {
      var value = fn(n, N);
      w.push(value);
      sum += value;
      sumSq += value * value;
    }
    return {
      coherentGain: sum / N,
      enbw: N * sumSq / (sum * sum),
      samples: w,
      sum: sum,
      sumSq: sumSq
    };
  }

  function tone(n, freqBins, amp, phase, N) {
    return amp * Math.cos(2 * Math.PI * freqBins * n / N + phase);
  }

  function makeSignal(params, mode) {
    var N = params.bins;
    var strongFreq = BASE_BIN + params.offset;
    var weakFreq = strongFreq + params.separation;
    var weakAmp = Math.pow(10, params.weakDb / 20);
    var signal = [];
    for (var n = 0; n < N; n += 1) {
      var value = 0;
      if (mode !== "weakOnly") value += tone(n, strongFreq, 1, PHASE, N);
      if (mode !== "strongOnly") value += tone(n, weakFreq, weakAmp, -0.72, N);
      signal.push(value);
    }
    return signal;
  }

  function dftAmplitudes(signal, win, M) {
    var N = signal.length;
    var out = [];
    var scale = 2 / win.sum;
    for (var k = 0; k <= Math.floor(M / 2); k += 1) {
      var re = 0;
      var im = 0;
      for (var n = 0; n < N; n += 1) {
        var a = -2 * Math.PI * k * n / M;
        var v = signal[n] * win.samples[n];
        re += v * Math.cos(a);
        im += v * Math.sin(a);
      }
      out.push({
        amp: Math.sqrt(re * re + im * im) * scale,
        bin: k * N / M,
        im: im,
        k: k,
        re: re
      });
    }
    return out;
  }

  function db(value) {
    return 20 * Math.log10(Math.max(1e-10, value));
  }

  function formatDb(value, digits) {
    return value.toFixed(digits == null ? 1 : digits) + " dB";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function nearestIndex(rows, targetBin) {
    var best = 0;
    var bestGap = Infinity;
    rows.forEach(function (row, i) {
      var gap = Math.abs(row.bin - targetBin);
      if (gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    });
    return best;
  }

  function localPeak(rows, targetBin, radius) {
    var best = nearestIndex(rows, targetBin);
    rows.forEach(function (row, i) {
      if (Math.abs(row.bin - targetBin) > radius) return;
      if (row.amp > rows[best].amp) best = i;
    });
    return rows[best];
  }

  function responseAtOffset(win, delta) {
    var N = win.samples.length;
    var re = 0;
    var im = 0;
    for (var n = 0; n < N; n += 1) {
      var a = -2 * Math.PI * delta * n / N;
      re += win.samples[n] * Math.cos(a);
      im += win.samples[n] * Math.sin(a);
    }
    return Math.sqrt(re * re + im * im) / win.sum;
  }

  function responseCurve(win) {
    var rows = [];
    for (var i = -320; i <= 320; i += 1) {
      var delta = i / 40;
      rows.push({ delta: delta, response: responseAtOffset(win, delta) });
    }
    return rows;
  }

  function halfBinLoss(win) {
    return db(responseAtOffset(win, 0.5));
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var win = makeWindow(params);
    var M = params.bins * params.padding;
    var strongFreq = BASE_BIN + params.offset;
    var weakFreq = strongFreq + params.separation;
    var signal = makeSignal(params, "both");
    var strongOnly = makeSignal(params, "strongOnly");
    var spectrum = dftAmplitudes(signal, win, M);
    var coarseSpectrum = dftAmplitudes(signal, win, params.bins);
    var leakage = dftAmplitudes(strongOnly, win, M);
    var nearestStrong = coarseSpectrum[nearestIndex(coarseSpectrum, strongFreq)];
    var paddedStrong = localPeak(spectrum, strongFreq, 1.1);
    var weakIndex = nearestIndex(spectrum, weakFreq);
    var weakPeak = localPeak(spectrum, weakFreq, 0.8);
    var leakageAtWeak = leakage[weakIndex].amp;
    var weakAmp = Math.pow(10, params.weakDb / 20);
    var seam = signal[0] - signal[signal.length - 1];
    var taperedSeam = signal[0] * win.samples[0] - signal[signal.length - 1] * win.samples[signal.length - 1];
    return {
      coarseSpectrum: coarseSpectrum,
      leakage: leakage,
      metrics: {
        coherentGain: win.coherentGain,
        enbw: win.enbw,
        leakageAtWeakDb: db(leakageAtWeak),
        masked: db(leakageAtWeak) > params.weakDb,
        nearestAmp: nearestStrong.amp,
        nearestLossDb: db(nearestStrong.amp),
        paddedAmp: paddedStrong.amp,
        paddedFreqError: Math.abs(paddedStrong.bin - strongFreq),
        scallopingHalfDb: halfBinLoss(win),
        seam: seam,
        taperedSeam: taperedSeam,
        weakAmpDb: params.weakDb,
        weakMarginDb: params.weakDb - db(leakageAtWeak),
        weakPeakDb: db(weakPeak.amp)
      },
      params: params,
      response: responseCurve(win),
      signal: signal,
      spectrum: spectrum,
      strongFreq: strongFreq,
      weakAmp: weakAmp,
      weakFreq: weakFreq,
      window: win
    };
  }

  function metric(label, value, toneName) {
    return '<div class="dft-lab__metric' + (toneName ? " " + toneName : "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setText(ctx, text, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.muted;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    setText(ctx, title, box.x + 14, box.y + 17, { color: COLORS.black, size: 13, weight: 800 });
    if (subtitle) setText(ctx, subtitle, box.x + 14, box.y + 36, { color: COLORS.muted, size: 10, weight: 650 });
  }

  function plotFrame(ctx, plot) {
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawTimePanel(ctx, result, box) {
    panel(ctx, box, "finite record", "the DFT sees one repeated lap");
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 66, h: box.h - 92 };
    plotFrame(ctx, plot);
    var maxAbs = 1.1;
    result.signal.forEach(function (v) { maxAbs = Math.max(maxAbs, Math.abs(v)); });
    function sx(i) { return plot.x + i / (result.signal.length - 1) * plot.w; }
    function sy(v) { return plot.y + plot.h / 2 - v / maxAbs * plot.h * 0.43; }
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, sy(0));
    ctx.lineTo(plot.x + plot.w, sy(0));
    ctx.stroke();
    ctx.fillStyle = COLORS.softOrange;
    ctx.fillRect(plot.x, plot.y, 10, plot.h);
    ctx.fillRect(plot.x + plot.w - 10, plot.y, 10, plot.h);
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.signal.forEach(function (v, i) {
      if (i === 0) ctx.moveTo(sx(i), sy(v));
      else ctx.lineTo(sx(i), sy(v));
    });
    ctx.stroke();
    ctx.strokeStyle = COLORS.orange;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.signal.forEach(function (v, i) {
      var y = sy(v * result.window.samples[i]);
      if (i === 0) ctx.moveTo(sx(i), y);
      else ctx.lineTo(sx(i), y);
    });
    ctx.stroke();
    setText(ctx, "raw record", plot.x + 8, plot.y + 14, { color: COLORS.blue });
    setText(ctx, "after window", plot.x + 92, plot.y + 14, { color: COLORS.orange });
    setText(ctx, "seam " + formatNumber(result.metrics.seam, 2), plot.x, plot.y + plot.h + 18, { color: COLORS.muted });
    setText(ctx, "windowed seam " + formatNumber(result.metrics.taperedSeam, 2), plot.x + plot.w, plot.y + plot.h + 18, { align: "right", color: COLORS.muted });
  }

  function drawSpectrumPanel(ctx, result, box) {
    panel(ctx, box, "spectrum samples", "zero padding samples the same lobe more densely");
    var plot = { x: box.x + 46, y: box.y + 58, w: box.w - 72, h: box.h - 96 };
    plotFrame(ctx, plot);
    var xMin = BASE_BIN - 4;
    var xMax = result.weakFreq + 6;
    var floor = -90;
    var top = 4;
    function sx(bin) { return plot.x + (bin - xMin) / (xMax - xMin) * plot.w; }
    function sy(dbValue) { return plot.y + (top - clamp(dbValue, floor, top)) / (top - floor) * plot.h; }
    for (var d = -20; d >= -80; d -= 20) {
      var y = sy(d);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      setText(ctx, String(d), plot.x - 8, y, { align: "right", color: COLORS.muted, size: 10 });
    }
    ctx.fillStyle = COLORS.softBlue;
    ctx.fillRect(sx(result.strongFreq - 0.5), plot.y, Math.max(2, sx(result.strongFreq + 0.5) - sx(result.strongFreq - 0.5)), plot.h);
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.spectrum.forEach(function (row, i) {
      if (row.bin < xMin || row.bin > xMax) return;
      var x = sx(row.bin);
      var y = sy(db(row.amp));
      if (i === 0 || result.spectrum[i - 1].bin < xMin) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    result.coarseSpectrum.forEach(function (row) {
      if (row.bin < xMin || row.bin > xMax) return;
      var x = sx(row.bin);
      var y = sy(db(row.amp));
      ctx.strokeStyle = COLORS.blue;
      ctx.beginPath();
      ctx.moveTo(x, plot.y + plot.h);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.blue;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
      ctx.fill();
    });
    [
      { freq: result.strongFreq, label: "strong tone", color: COLORS.red },
      { freq: result.weakFreq, label: "weak tone", color: COLORS.orange }
    ].forEach(function (mark) {
      var x = sx(mark.freq);
      ctx.strokeStyle = mark.color;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      setText(ctx, mark.label, x + 5, plot.y + 14, { color: mark.color, size: 10 });
    });
    setText(ctx, "dB", plot.x - 8, plot.y - 9, { align: "right", size: 10 });
    setText(ctx, "frequency bin", plot.x + plot.w, plot.y + plot.h + 18, { align: "right", size: 10 });
  }

  function drawResponsePanel(ctx, result, box) {
    panel(ctx, box, "bin response", "each bin weights nearby frequencies by the window transform");
    var plot = { x: box.x + 46, y: box.y + 58, w: box.w - 72, h: box.h - 96 };
    plotFrame(ctx, plot);
    var floor = -90;
    function sx(delta) { return plot.x + (delta + 8) / 16 * plot.w; }
    function sy(v) { return plot.y + (0 - clamp(db(v), floor, 0)) / (0 - floor) * plot.h; }
    for (var d = -20; d >= -80; d -= 20) {
      var y = plot.y + (0 - d) / (0 - floor) * plot.h;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      setText(ctx, String(d), plot.x - 8, y, { align: "right", color: COLORS.muted, size: 10 });
    }
    ctx.strokeStyle = COLORS.purple;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.response.forEach(function (row, i) {
      var x = sx(row.delta);
      var y = sy(row.response);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.strokeStyle = COLORS.orange;
    ctx.setLineDash([5, 4]);
    [-0.5, 0.5].forEach(function (xv) {
      ctx.beginPath();
      ctx.moveTo(sx(xv), plot.y);
      ctx.lineTo(sx(xv), plot.y + plot.h);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    setText(ctx, "half-bin loss " + formatDb(result.metrics.scallopingHalfDb), plot.x + 8, plot.y + 14, { color: COLORS.purple });
    setText(ctx, "offset from bin center", plot.x + plot.w, plot.y + plot.h + 18, { align: "right", size: 10 });
  }

  function drawTradeoffPanel(ctx, result, box) {
    panel(ctx, box, "window receipt", "amplitude, leakage, and noise bandwidth are separate bills");
    var rows = [
      { label: "coherent gain", value: result.metrics.coherentGain, max: 1, color: COLORS.blue, text: formatNumber(result.metrics.coherentGain, 3) },
      { label: "ENBW bins", value: result.metrics.enbw, max: 4, color: COLORS.green, text: formatNumber(result.metrics.enbw, 2) },
      { label: "nearest-bin loss", value: Math.abs(result.metrics.nearestLossDb), max: 18, color: COLORS.orange, text: formatDb(result.metrics.nearestLossDb) },
      { label: "weak margin", value: clamp(result.metrics.weakMarginDb + 45, 0, 90), max: 90, color: result.metrics.weakMarginDb >= 0 ? COLORS.green : COLORS.red, text: formatDb(result.metrics.weakMarginDb) }
    ];
    var x = box.x + 18;
    var y = box.y + 62;
    var w = box.w - 36;
    rows.forEach(function (row, i) {
      var yy = y + i * 42;
      setText(ctx, row.label, x, yy, { color: COLORS.black, size: 11, weight: 760 });
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.axis;
      ctx.fillRect(x + 126, yy - 10, w - 196, 16);
      ctx.strokeRect(x + 126, yy - 10, w - 196, 16);
      ctx.fillStyle = row.color;
      ctx.fillRect(x + 126, yy - 10, Math.max(2, Math.min(w - 196, (row.value / row.max) * (w - 196))), 16);
      setText(ctx, row.text, x + w, yy - 1, { align: "right", color: row.color, size: 11, weight: 800 });
    });
    var verdict = result.metrics.masked ? "weak tone is below strong-tone leakage" : "weak tone clears the leakage floor";
    setText(ctx, verdict, x, box.y + box.h - 34, { color: result.metrics.masked ? COLORS.red : COLORS.green, size: 12, weight: 800 });
    setText(ctx, "padding frequency error " + formatNumber(result.metrics.paddedFreqError, 3) + " bins", x, box.y + box.h - 16, { color: COLORS.muted, size: 10 });
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas || !canvas.getContext) return;
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 700;
    var height = compact ? 980 : 760;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    var margin = 14;
    var gap = 18;
    var boxes;
    if (compact) {
      var h = (height - 2 * margin - 3 * gap) / 4;
      boxes = [
        { x: margin, y: margin, w: width - 2 * margin, h: h },
        { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h },
        { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h },
        { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h }
      ];
    } else {
      var boxW = (width - 2 * margin - gap) / 2;
      var boxH = (height - 2 * margin - gap) / 2;
      boxes = [
        { x: margin, y: margin, w: boxW, h: boxH },
        { x: margin + boxW + gap, y: margin, w: boxW, h: boxH },
        { x: margin, y: margin + boxH + gap, w: boxW, h: boxH },
        { x: margin + boxW + gap, y: margin + boxH + gap, w: boxW, h: boxH }
      ];
    }
    drawTimePanel(ctx, result, boxes[0]);
    drawSpectrumPanel(ctx, result, boxes[1]);
    drawResponsePanel(ctx, result, boxes[2]);
    drawTradeoffPanel(ctx, result, boxes[3]);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function render(root) {
    var result = evaluate(paramsFromRoot(root));
    var params = result.params;
    var values = {
      bins: String(params.bins),
      offset: formatNumber(params.offset, 2),
      padding: String(params.padding) + "x",
      separation: formatNumber(params.separation, 1),
      weakDb: params.weakDb + " dB",
      window: WINDOWS[params.window].label
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (key === "window") input.value = params.window;
      else input.value = params[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("window", WINDOWS[params.window].label),
        metric("ENBW", formatNumber(result.metrics.enbw, 2) + " bins"),
        metric("coherent gain", formatNumber(result.metrics.coherentGain, 3)),
        metric("nearest-bin loss", formatDb(result.metrics.nearestLossDb), "warn"),
        metric("leakage at weak tone", formatDb(result.metrics.leakageAtWeakDb), result.metrics.masked ? "bad" : ""),
        metric("weak margin", formatDb(result.metrics.weakMarginDb), result.metrics.weakMarginDb >= 0 ? "good" : "bad")
      ].join("");
    }
    draw(root, result);
    root.__dftWindowResult = result;
  }

  function init(root) {
    if (!root || root.__dftWindowReady) return;
    root.__dftWindowReady = true;
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
    render(root);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function audit() {
    var rect = evaluate({ window: "rectangular", offset: 0.5, padding: 1, separation: 4, weakDb: -38 });
    var hann = evaluate({ window: "hann", offset: 0.5, padding: 1, separation: 4, weakDb: -38 });
    var flat = evaluate({ window: "flatTop", offset: 0.5, padding: 1, separation: 4, weakDb: -38 });
    var noPad = evaluate({ window: "hann", offset: 0.37, padding: 1 });
    var padded = evaluate({ window: "hann", offset: 0.37, padding: 8 });
    var bh = evaluate({ window: "blackmanHarris", offset: 0.37, padding: 8, separation: 4, weakDb: -42 });
    assert(Math.abs(rect.window.coherentGain - 1) < 1e-12, "rectangular coherent gain should be one");
    assert(Math.abs(rect.window.enbw - 1) < 1e-12, "rectangular ENBW should be one bin");
    assert(Math.abs(hann.window.coherentGain - 0.5) < 1e-12, "periodic Hann coherent gain should be one half");
    assert(Math.abs(hann.window.enbw - 1.5) < 1e-12, "periodic Hann ENBW should be 1.5 bins");
    assert(rect.metrics.scallopingHalfDb < -3.8 && rect.metrics.scallopingHalfDb > -4.1, "rectangular half-bin scalloping should be near -3.9 dB");
    assert(hann.metrics.scallopingHalfDb < -1.3 && hann.metrics.scallopingHalfDb > -1.6, "Hann half-bin scalloping should be near -1.4 dB");
    assert(flat.metrics.scallopingHalfDb > -0.1, "flat-top half-bin scalloping should be very small");
    assert(padded.metrics.paddedFreqError < noPad.metrics.paddedFreqError, "zero padding should sample closer to the true tone");
    assert(bh.metrics.leakageAtWeakDb < rect.metrics.leakageAtWeakDb - 20, "Blackman-Harris should suppress distant leakage relative to rectangular");
    return {
      blackmanHarrisLeakageDb: Number(bh.metrics.leakageAtWeakDb.toFixed(1)),
      flatTopHalfBinDb: Number(flat.metrics.scallopingHalfDb.toFixed(2)),
      hannEnbw: Number(hann.window.enbw.toFixed(2)),
      ok: true,
      paddedFrequencyError: Number(padded.metrics.paddedFreqError.toFixed(3)),
      rectangularHalfBinDb: Number(rect.metrics.scallopingHalfDb.toFixed(2))
    };
  }

  var api = {
    WINDOWS: WINDOWS,
    audit: audit,
    cleanParams: cleanParams,
    dftAmplitudes: dftAmplitudes,
    evaluate: evaluate,
    makeWindow: makeWindow,
    responseAtOffset: responseAtOffset
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.DFTWindowLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-dft-window-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
