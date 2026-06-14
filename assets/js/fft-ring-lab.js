(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    signal: "#2563eb",
    kernel: "#7c3aed",
    linear: "#0f766e",
    ring: "#be123c",
    wrap: "#b45309",
    fft: "#0891b2",
    direct: "#64748b"
  };

  var DEFAULTS = {
    signalLength: 64,
    kernelLength: 33,
    fftPower: 6,
    tone: 32,
    seed: 21
  };

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

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 3, seed));
    var u2 = uniform(index * 2 + 4, seed ^ 0xa53a9a5b);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    if (Math.abs(value) > 0 && Math.abs(value) < 0.001) return value.toExponential(1);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="fft-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function nextPow2(n) {
    var p = 1;
    while (p < n) p *= 2;
    return p;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var signalLength = clamp(Math.round(raw.signalLength == null ? DEFAULTS.signalLength : raw.signalLength), 32, 128);
    var kernelLength = clamp(Math.round(raw.kernelLength == null ? DEFAULTS.kernelLength : raw.kernelLength), 5, 65);
    if (kernelLength % 2 === 0) kernelLength += 1;
    kernelLength = clamp(kernelLength, 5, 65);
    var minPower = Math.ceil(Math.log2(Math.max(signalLength, kernelLength)));
    return {
      fftPower: clamp(Math.round(raw.fftPower == null ? DEFAULTS.fftPower : raw.fftPower), minPower, 9),
      kernelLength: kernelLength,
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 99),
      signalLength: signalLength,
      tone: clamp(raw.tone == null ? DEFAULTS.tone : Number(raw.tone), 0, 100) / 100
    };
  }

  function readState(container, previous) {
    var raw = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var display = {
      fftPower: String(Math.pow(2, params.fftPower)),
      kernelLength: String(params.kernelLength),
      seed: String(params.seed),
      signalLength: String(params.signalLength),
      tone: Math.round(params.tone * 100) + "%"
    };
    Object.keys(display).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = display[key];
      });
    });
  }

  function makeSignal(params) {
    var n = params.signalLength;
    var values = [];
    var f1 = 3 + 2.7 * params.tone;
    var f2 = 11.5 - 3.2 * params.tone;
    var phase = 2 * Math.PI * uniform(7, params.seed);
    for (var i = 0; i < n; i += 1) {
      var t = i / n;
      var pulseA = Math.exp(-0.5 * Math.pow((t - 0.68) / 0.045, 2));
      var pulseB = Math.exp(-0.5 * Math.pow((t - 0.17) / 0.035, 2));
      var v = 0.56 * Math.sin(2 * Math.PI * f1 * t + phase);
      v += 0.25 * Math.cos(2 * Math.PI * f2 * t);
      v += 0.78 * pulseA - 0.38 * pulseB;
      v += 0.035 * normal(i * 13 + 1, params.seed);
      values.push(v);
    }
    var max = values.reduce(function (m, v) { return Math.max(m, Math.abs(v)); }, 1e-12);
    return values.map(function (v) { return v / max; });
  }

  function makeKernel(params) {
    var m = params.kernelLength;
    var center = (m - 1) / 2;
    var sigma = Math.max(1.5, m / 6);
    var values = [];
    var sum = 0;
    for (var i = 0; i < m; i += 1) {
      var left = Math.exp(-0.5 * Math.pow((i - center) / sigma, 2));
      var echo = 0.28 * Math.exp(-0.5 * Math.pow((i - center - m * 0.22) / (sigma * 0.75), 2));
      var ripple = 1 + 0.12 * Math.cos(2 * Math.PI * i / Math.max(3, m - 1));
      var v = (left + echo) * ripple;
      values.push(v);
      sum += v;
    }
    return values.map(function (v) { return v / Math.max(1e-12, sum); });
  }

  function linearConvolve(a, b) {
    var out = new Array(a.length + b.length - 1).fill(0);
    for (var i = 0; i < a.length; i += 1) {
      for (var j = 0; j < b.length; j += 1) out[i + j] += a[i] * b[j];
    }
    return out;
  }

  function fft(re, im, inverse) {
    var n = re.length;
    for (var i = 1, j = 0; i < n; i += 1) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var tr = re[i]; re[i] = re[j]; re[j] = tr;
        var ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var angle = 2 * Math.PI / len * (inverse ? 1 : -1);
      var wrLen = Math.cos(angle);
      var wiLen = Math.sin(angle);
      for (var start = 0; start < n; start += len) {
        var wr = 1;
        var wi = 0;
        for (var k = 0; k < len / 2; k += 1) {
          var even = start + k;
          var odd = even + len / 2;
          var ur = re[even];
          var ui = im[even];
          var vr = re[odd] * wr - im[odd] * wi;
          var vi = re[odd] * wi + im[odd] * wr;
          re[even] = ur + vr;
          im[even] = ui + vi;
          re[odd] = ur - vr;
          im[odd] = ui - vi;
          var nextWr = wr * wrLen - wi * wiLen;
          wi = wr * wiLen + wi * wrLen;
          wr = nextWr;
        }
      }
    }
    if (inverse) {
      for (var q = 0; q < n; q += 1) {
        re[q] /= n;
        im[q] /= n;
      }
    }
  }

  function fftConvolve(a, b, n) {
    var ar = new Array(n).fill(0);
    var ai = new Array(n).fill(0);
    var br = new Array(n).fill(0);
    var bi = new Array(n).fill(0);
    for (var i = 0; i < a.length; i += 1) ar[i % n] += a[i];
    for (var j = 0; j < b.length; j += 1) br[j % n] += b[j];
    fft(ar, ai, false);
    fft(br, bi, false);
    var xr = new Array(n);
    var xi = new Array(n);
    for (var k = 0; k < n; k += 1) {
      xr[k] = ar[k] * br[k] - ai[k] * bi[k];
      xi[k] = ar[k] * bi[k] + ai[k] * br[k];
    }
    fft(xr, xi, true);
    return xr;
  }

  function foldedLinear(linear, n) {
    var folded = new Array(n).fill(0);
    var extra = new Array(n).fill(0);
    for (var i = 0; i < linear.length; i += 1) {
      var k = i % n;
      folded[k] += linear[i];
      if (i >= n) extra[k] += linear[i];
    }
    return { extra: extra, folded: folded };
  }

  function rms(values) {
    var sum = 0;
    values.forEach(function (v) { sum += v * v; });
    return Math.sqrt(sum / Math.max(1, values.length));
  }

  function maxAbs(values) {
    return values.reduce(function (m, v) { return Math.max(m, Math.abs(v)); }, 0);
  }

  function magnitudeSpectrum(values, n) {
    var re = new Array(n).fill(0);
    var im = new Array(n).fill(0);
    for (var i = 0; i < values.length; i += 1) re[i % n] += values[i];
    fft(re, im, false);
    var half = Math.floor(n / 2);
    var out = [];
    for (var k = 0; k <= half; k += 1) out.push(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
    var max = maxAbs(out) || 1;
    return out.map(function (v) { return v / max; });
  }

  function workModel(params, n, required) {
    var direct = params.signalLength * params.kernelLength;
    var fftOps = 3 * n * Math.log2(n) + 3 * n;
    var padded = nextPow2(required);
    var paddedOps = 3 * padded * Math.log2(padded) + 3 * padded;
    return {
      direct: direct,
      fft: fftOps,
      padded: paddedOps
    };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var n = Math.pow(2, params.fftPower);
    var signal = makeSignal(params);
    var kernel = makeKernel(params);
    var linear = linearConvolve(signal, kernel);
    var required = linear.length;
    var ring = fftConvolve(signal, kernel, n);
    var folded = foldedLinear(linear, n);
    var paddedN = nextPow2(required);
    var padded = fftConvolve(signal, kernel, paddedN).slice(0, required);
    var paddedError = padded.map(function (v, i) { return v - linear[i]; });
    var aliasError = folded.folded.map(function (v, i) {
      return v - (i < linear.length ? linear[i] : 0);
    });
    return {
      aliasRms: rms(aliasError),
      folded: folded,
      kernel: kernel,
      linear: linear,
      n: n,
      paddedError: rms(paddedError),
      paddedN: paddedN,
      params: params,
      required: required,
      ring: ring,
      signal: signal,
      spectra: {
        kernel: magnitudeSpectrum(kernel, n),
        signal: magnitudeSpectrum(signal, n)
      },
      work: workModel(params, n, required),
      wrapMax: maxAbs(folded.extra)
    };
  }

  function updateMetrics(node, result) {
    var status = result.n >= result.required ? "linear" : "wraps";
    node.innerHTML = [
      metric("Required length", String(result.required)),
      metric("FFT ring length", String(result.n) + " (" + status + ")"),
      metric("Alias RMS", formatNumber(result.aliasRms, 3)),
      metric("Max wrapped tail", formatNumber(result.wrapMax, 3)),
      metric("Padded FFT error", formatNumber(result.paddedError, 2)),
      metric("FFT/direct model", formatNumber(result.work.fft / result.work.direct, 2) + "x")
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.floor(rect.width || 900));
    var height = width < 700 ? 980 : 680;
    var ratio = root.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function label(ctx, text, x, y, color, align, size) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, heading) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    label(ctx, heading, x + 12, y + 22, COLORS.text, "left", 13);
  }

  function pathPlot(ctx, values, x, y, w, h, color, width, minV, maxV, limit) {
    var n = Math.min(values.length, limit || values.length);
    if (n <= 1) return;
    var span = Math.max(1e-9, maxV - minV);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    for (var i = 0; i < n; i += 1) {
      var xx = x + (i / (n - 1)) * w;
      var yy = y + h - ((values[i] - minV) / span) * h;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }

  function valueRange(arrays) {
    var min = Infinity;
    var max = -Infinity;
    arrays.forEach(function (arr) {
      arr.forEach(function (v) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      });
    });
    if (!isFinite(min) || !isFinite(max) || min === max) return { min: -1, max: 1 };
    var pad = 0.08 * (max - min);
    return { min: min - pad, max: max + pad };
  }

  function drawInputs(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Signal and finite filter");
    var pad = { l: 36, r: 14, t: 42, b: 30 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var range = valueRange([result.signal, result.kernel]);
    line(ctx, left, top + ph / 2, left + pw, top + ph / 2, COLORS.rule, 1);
    pathPlot(ctx, result.signal, left, top, pw, ph, COLORS.signal, 2, range.min, range.max);
    pathPlot(ctx, result.kernel, left, top, pw * (result.kernel.length - 1) / Math.max(1, result.signal.length - 1), ph, COLORS.kernel, 2, range.min, range.max);
    ctx.fillStyle = COLORS.signal;
    ctx.fillRect(left + 4, top + 6, 10, 3);
    label(ctx, "x[n]", left + 20, top + 11, COLORS.muted, "left", 11);
    ctx.fillStyle = COLORS.kernel;
    ctx.fillRect(left + 66, top + 6, 10, 3);
    label(ctx, "h[n]", left + 82, top + 11, COLORS.muted, "left", 11);
  }

  function drawConvolution(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Linear convolution vs FFT ring");
    var pad = { l: 42, r: 14, t: 42, b: 34 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var tiled = new Array(result.required);
    for (var i = 0; i < result.required; i += 1) tiled[i] = result.ring[i % result.n];
    var range = valueRange([result.linear, tiled]);
    line(ctx, left, top + ph / 2, left + pw, top + ph / 2, COLORS.rule, 1);
    if (result.n < result.required) {
      var cut = left + (result.n - 1) / Math.max(1, result.required - 1) * pw;
      ctx.fillStyle = "rgba(190,18,60,0.08)";
      ctx.fillRect(cut, top, left + pw - cut, ph);
      line(ctx, cut, top, cut, top + ph, COLORS.ring, 1);
      label(ctx, "tail wraps", cut + 4, top + 14, COLORS.ring, "left", 11);
    }
    pathPlot(ctx, result.linear, left, top, pw, ph, COLORS.linear, 2, range.min, range.max);
    pathPlot(ctx, tiled, left, top, pw, ph, COLORS.ring, 1.6, range.min, range.max);
    ctx.fillStyle = COLORS.linear;
    ctx.fillRect(left + 4, top + 6, 10, 3);
    label(ctx, "linear", left + 20, top + 11, COLORS.muted, "left", 11);
    ctx.fillStyle = COLORS.ring;
    ctx.fillRect(left + 72, top + 6, 10, 3);
    label(ctx, "ring", left + 88, top + 11, COLORS.muted, "left", 11);
  }

  function drawWrap(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Aliasing ledger");
    var pad = { l: 42, r: 14, t: 42, b: 34 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var visible = Math.min(result.n, 160);
    var range = valueRange([result.folded.extra.slice(0, visible), result.folded.folded.slice(0, visible)]);
    var zero = top + ph - ((0 - range.min) / Math.max(1e-9, range.max - range.min)) * ph;
    line(ctx, left, zero, left + pw, zero, COLORS.rule, 1);
    var bw = Math.max(1, pw / visible * 0.75);
    for (var i = 0; i < visible; i += 1) {
      var xx = left + i * pw / visible;
      var v = result.folded.extra[i];
      var yy = top + ph - ((v - range.min) / Math.max(1e-9, range.max - range.min)) * ph;
      ctx.fillStyle = COLORS.wrap;
      ctx.globalAlpha = Math.min(1, 0.25 + Math.abs(v) / Math.max(1e-9, result.wrapMax || 1) * 0.75);
      ctx.fillRect(xx, Math.min(zero, yy), bw, Math.abs(zero - yy));
    }
    ctx.globalAlpha = 1;
    label(ctx, "wrapped tail added to early bins", left + 8, top + 12, COLORS.muted, "left", 11);
    label(ctx, "first " + visible + " ring bins", left + pw / 2, y + h - 10, COLORS.muted, "center", 11);
  }

  function drawSpectrumAndWork(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Frequency product and work model");
    var pad = { l: 42, r: 16, t: 42, b: 34 };
    var left = x + pad.l;
    var top = y + pad.t;
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var spectrumH = ph * 0.58;
    pathPlot(ctx, result.spectra.signal, left, top, pw, spectrumH, COLORS.signal, 1.8, 0, 1);
    pathPlot(ctx, result.spectra.kernel, left, top, pw, spectrumH, COLORS.kernel, 1.8, 0, 1);
    line(ctx, left, top + spectrumH, left + pw, top + spectrumH, COLORS.rule, 1);
    ctx.fillStyle = COLORS.signal;
    ctx.fillRect(left + 4, top + 6, 10, 3);
    label(ctx, "|X[k]|", left + 20, top + 11, COLORS.muted, "left", 11);
    ctx.fillStyle = COLORS.kernel;
    ctx.fillRect(left + 74, top + 6, 10, 3);
    label(ctx, "|H[k]|", left + 90, top + 11, COLORS.muted, "left", 11);
    var baseY = top + ph;
    var maxOps = Math.max(result.work.direct, result.work.fft, result.work.padded);
    var rows = [
      { color: COLORS.direct, label: "direct", value: result.work.direct },
      { color: COLORS.ring, label: "ring FFT", value: result.work.fft },
      { color: COLORS.fft, label: "padded FFT", value: result.work.padded }
    ];
    rows.forEach(function (row, i) {
      var bw = Math.min(46, pw / 7);
      var xx = left + pw * (0.17 + i * 0.25) - bw / 2;
      var barH = Math.max(2, (Math.log10(row.value + 1) / Math.log10(maxOps + 1)) * (ph - spectrumH - 22));
      var yy = baseY - barH;
      ctx.fillStyle = row.color;
      ctx.fillRect(xx, yy, bw, barH);
      label(ctx, row.label, xx + bw / 2, y + h - 10, COLORS.muted, "center", 11);
      label(ctx, formatNumber(row.value, 0), xx + bw / 2, yy - 5, COLORS.text, "center", 10);
    });
  }

  function draw(result, canvas) {
    if (!canvas) return;
    var prepared = setupCanvas(canvas);
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 16;
    var gap = 14;
    if (width < 700) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawInputs(ctx, result, pad, pad, width - pad * 2, panelH);
      drawConvolution(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawWrap(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawSpectrumAndWork(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }
    var halfW = (width - pad * 2 - gap) / 2;
    var halfH = (height - pad * 2 - gap) / 2;
    drawInputs(ctx, result, pad, pad, halfW, halfH);
    drawConvolution(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawWrap(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawSpectrumAndWork(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-fft-ring-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    fft: fft,
    fftConvolve: fftConvolve,
    linearConvolve: linearConvolve,
    nextPow2: nextPow2
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FFTRingLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
