(function (global) {
  "use strict";

  var COLORS = {
    bad: "#be123c",
    check: "#0f766e",
    data: "#2563eb",
    detected: "#0f766e",
    error: "#f97316",
    grid: "#e6edf3",
    muted: "#5d6872",
    panel: "#f8fafc",
    poly: "#7c3aed",
    rule: "#d7dee5",
    text: "#172026",
    undetected: "#be123c",
    white: "#ffffff"
  };

  var PRESETS = {
    bad8: { divisor: 0x101, label: "bad CRC-8 x^8+1", width: 8 },
    crc8: { divisor: 0x107, label: "CRC-8/ATM 0x07", width: 8 },
    crc16ccitt: { divisor: 0x11021, label: "CRC-16/CCITT 0x1021", width: 16 },
    crc16ibm: { divisor: 0x18005, label: "CRC-16/IBM 0x8005", width: 16 },
    parity: { divisor: 0x3, label: "parity x+1", width: 1 }
  };

  var DEFAULTS = {
    burst: 7,
    errorMode: "burst",
    flips: 4,
    length: 96,
    poly: "crc8",
    seed: 29,
    start: 38
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var poly = PRESETS[raw.poly] ? raw.poly : DEFAULTS.poly;
    var length = Math.round(clamp(finite(Number(raw.length), DEFAULTS.length), 32, 192) / 8) * 8;
    var width = PRESETS[poly].width;
    var codeLen = length + width;
    var mode = ["single", "double", "burst", "random"].indexOf(raw.errorMode) === -1 ? DEFAULTS.errorMode : raw.errorMode;
    var burst = Math.round(clamp(finite(Number(raw.burst), DEFAULTS.burst), 1, Math.min(24, codeLen)));
    var start = Math.round(clamp(finite(Number(raw.start), DEFAULTS.start), 0, Math.max(0, codeLen - burst)));
    return {
      burst: burst,
      errorMode: mode,
      flips: Math.round(clamp(finite(Number(raw.flips), DEFAULTS.flips), 1, Math.min(16, codeLen))),
      length: length,
      poly: poly,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      start: start
    };
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

  function generateBits(length, seed) {
    var rng = makeRng(seed * 2654435761);
    var bits = [];
    var shift = 0;
    for (var i = 0; i < length; i += 1) {
      shift = ((shift << 1) ^ (rng() > 0.5 ? 1 : 0) ^ (i % 7 === 0 ? 1 : 0)) & 7;
      bits.push(((shift >> 1) ^ (rng() > 0.56 ? 1 : 0)) & 1);
    }
    return bits;
  }

  function intToBits(value, width) {
    var bits = [];
    for (var i = width - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
    return bits;
  }

  function bitsToHex(bits) {
    var value = 0;
    bits.forEach(function (bit) { value = (value << 1) | bit; });
    var digits = Math.max(1, Math.ceil(bits.length / 4));
    return value.toString(16).toUpperCase().padStart(digits, "0");
  }

  function crcRemainder(bits, preset) {
    var rem = 0;
    var top = 1 << preset.width;
    for (var i = 0; i < bits.length; i += 1) {
      rem = (rem << 1) | bits[i];
      if (rem & top) rem ^= preset.divisor;
    }
    return rem & (top - 1);
  }

  function divisionTrace(bits, preset, limit) {
    var rem = 0;
    var top = 1 << preset.width;
    var mask = top - 1;
    var rows = [];
    for (var i = 0; i < Math.min(bits.length, limit); i += 1) {
      rem = (rem << 1) | bits[i];
      var before = rem;
      var xored = Boolean(rem & top);
      if (xored) rem ^= preset.divisor;
      rows.push({
        bit: bits[i],
        before: before & ((top << 1) - 1),
        index: i,
        rem: rem & mask,
        xored: xored
      });
    }
    return rows;
  }

  function encode(dataBits, preset) {
    var padded = dataBits.concat(new Array(preset.width).fill(0));
    var remainder = crcRemainder(padded, preset);
    return {
      checkBits: intToBits(remainder, preset.width),
      codeword: dataBits.concat(intToBits(remainder, preset.width)),
      remainder: remainder
    };
  }

  function selectedErrorMask(params, codeLen) {
    var mask = new Array(codeLen).fill(0);
    if (params.errorMode === "single") {
      mask[params.start] = 1;
    } else if (params.errorMode === "double") {
      mask[params.start] = 1;
      mask[Math.min(codeLen - 1, params.start + Math.max(1, params.burst))] ^= 1;
    } else if (params.errorMode === "burst") {
      for (var i = 0; i < params.burst; i += 1) mask[params.start + i] = 1;
    } else {
      var rng = makeRng(params.seed * 7919 + params.start + params.flips);
      var used = {};
      var count = 0;
      while (count < params.flips) {
        var pos = Math.floor(rng() * codeLen);
        if (!used[pos]) {
          used[pos] = true;
          mask[pos] = 1;
          count += 1;
        }
      }
    }
    return mask;
  }

  function xorBits(bits, mask) {
    return bits.map(function (bit, i) { return bit ^ (mask[i] || 0); });
  }

  function maskWeight(mask) {
    return mask.reduce(function (sum, bit) { return sum + bit; }, 0);
  }

  function syndromeForMask(mask, preset) {
    return crcRemainder(mask, preset);
  }

  function countSingleAndDouble(codeLen, preset) {
    var single = 0;
    var double = 0;
    var mask = new Array(codeLen).fill(0);
    for (var i = 0; i < codeLen; i += 1) {
      mask[i] = 1;
      if (syndromeForMask(mask, preset) === 0) single += 1;
      mask[i] = 0;
    }
    for (i = 0; i < codeLen; i += 1) {
      mask[i] = 1;
      for (var j = i + 1; j < codeLen; j += 1) {
        mask[j] = 1;
        if (syndromeForMask(mask, preset) === 0) double += 1;
        mask[j] = 0;
      }
      mask[i] = 0;
    }
    return { double: double, single: single, doubleTotal: codeLen * (codeLen - 1) / 2, singleTotal: codeLen };
  }

  function burstPatterns(length) {
    if (length === 1) return [[1]];
    var middle = Math.max(0, length - 2);
    var count = 1 << middle;
    var out = [];
    for (var m = 0; m < count; m += 1) {
      var bits = [1];
      for (var i = middle - 1; i >= 0; i -= 1) bits.push((m >> i) & 1);
      bits.push(1);
      out.push(bits);
    }
    return out;
  }

  function countBursts(codeLen, preset, maxLen) {
    var undetectedByLength = [];
    var total = 0;
    var undetected = 0;
    for (var len = 1; len <= maxLen; len += 1) {
      var patterns = burstPatterns(len);
      var localTotal = 0;
      var localUndetected = 0;
      for (var start = 0; start <= codeLen - len; start += 1) {
        for (var p = 0; p < patterns.length; p += 1) {
          var mask = new Array(codeLen).fill(0);
          for (var k = 0; k < len; k += 1) mask[start + k] = patterns[p][k];
          localTotal += 1;
          if (syndromeForMask(mask, preset) === 0) localUndetected += 1;
        }
      }
      total += localTotal;
      undetected += localUndetected;
      undetectedByLength.push({ length: len, total: localTotal, undetected: localUndetected });
    }
    return { byLength: undetectedByLength, total: total, undetected: undetected };
  }

  function randomMasks(codeLen, preset, seed, trials, flips) {
    var rng = makeRng(seed * 104729 + codeLen + preset.divisor);
    var undetected = 0;
    for (var t = 0; t < trials; t += 1) {
      var mask = new Array(codeLen).fill(0);
      var count = 0;
      while (count < flips) {
        var pos = Math.floor(rng() * codeLen);
        if (!mask[pos]) {
          mask[pos] = 1;
          count += 1;
        }
      }
      if (syndromeForMask(mask, preset) === 0) undetected += 1;
    }
    return { total: trials, undetected: undetected };
  }

  function comparePresets(dataBits, params) {
    var rows = [];
    Object.keys(PRESETS).forEach(function (key) {
      var preset = PRESETS[key];
      if (preset.width > 16) return;
      var codeLen = dataBits.length + preset.width;
      var singleDouble = countSingleAndDouble(codeLen, preset);
      var bursts = countBursts(codeLen, preset, Math.min(8, preset.width));
      rows.push({
        double: singleDouble.double,
        key: key,
        label: preset.label,
        shortBurst: bursts.undetected,
        single: singleDouble.single,
        width: preset.width
      });
    });
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var preset = PRESETS[params.poly];
    var dataBits = generateBits(params.length, params.seed);
    var encoded = encode(dataBits, preset);
    var codeLen = encoded.codeword.length;
    var cleanSyndrome = crcRemainder(encoded.codeword, preset);
    params.start = Math.min(params.start, Math.max(0, codeLen - params.burst));
    var errorMask = selectedErrorMask(params, codeLen);
    var received = xorBits(encoded.codeword, errorMask);
    var selectedSyndrome = crcRemainder(received, preset);
    var selectedDetected = selectedSyndrome !== 0;
    var singleDouble = countSingleAndDouble(codeLen, preset);
    var maxBurst = Math.min(12, codeLen);
    var bursts = countBursts(codeLen, preset, maxBurst);
    var random = randomMasks(codeLen, preset, params.seed, 900, Math.min(params.flips, codeLen));
    return {
      bursts: bursts,
      cleanSyndrome: cleanSyndrome,
      codeLen: codeLen,
      compare: comparePresets(dataBits, params),
      dataBits: dataBits,
      encoded: encoded,
      errorMask: errorMask,
      params: params,
      preset: preset,
      random: random,
      received: received,
      selectedDetected: selectedDetected,
      selectedSyndrome: selectedSyndrome,
      singleDouble: singleDouble,
      trace: divisionTrace(dataBits.concat(new Array(preset.width).fill(0)), preset, 72)
    };
  }

  function audit() {
    var result = evaluate(DEFAULTS);
    var guaranteed = result.bursts.byLength
      .filter(function (row) { return row.length <= result.preset.width; })
      .every(function (row) { return row.undetected === 0; });
    return {
      checkHex: bitsToHex(result.encoded.checkBits),
      cleanSyndrome: result.cleanSyndrome,
      codeLen: result.codeLen,
      crcWidth: result.preset.width,
      doubleUndetected: result.singleDouble.double,
      selectedDetected: result.selectedDetected,
      shortBurstsUndetected: result.bursts.undetected,
      singleUndetected: result.singleDouble.single,
      syndromeHex: result.selectedSyndrome.toString(16).toUpperCase(),
      testedBurstGuarantee: guaranteed
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function fmtInt(value) {
    return String(Math.round(value));
  }

  function fmtRate(num, den) {
    if (den === 0) return "0%";
    return (100 * num / den).toFixed(num === 0 ? 0 : 2) + "%";
  }

  function setOutputs(root, params) {
    var preset = PRESETS[params.poly];
    var codeLen = params.length + preset.width;
    var burstInput = root.querySelector('[data-param="burst"]');
    if (burstInput) {
      burstInput.max = String(Math.min(24, codeLen));
      burstInput.value = String(params.burst);
    }
    var startInput = root.querySelector('[data-param="start"]');
    if (startInput) {
      startInput.max = String(Math.max(0, codeLen - params.burst));
      startInput.value = String(params.start);
    }
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "length") value += " bits";
        if (key === "burst") value += " bits";
        if (key === "start") value = "bit " + value;
        if (key === "poly") value = PRESETS[value].label;
        if (key === "flips") value += " flips";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var metrics = root.querySelector("[data-metrics]");
    if (!metrics) return;
    var rows = [
      ["check bits", "0x" + bitsToHex(result.encoded.checkBits)],
      ["syndrome", "0x" + result.selectedSyndrome.toString(16).toUpperCase()],
      ["selected error", result.selectedDetected ? "detected" : "missed"],
      ["single-bit misses", fmtInt(result.singleDouble.single)],
      ["double-bit misses", fmtInt(result.singleDouble.double)],
      ["burst misses", fmtInt(result.bursts.undetected)]
    ];
    metrics.innerHTML = rows.map(function (row) {
      return '<div class="crc-lab__metric"><span>' + row[0] + '</span><strong>' + row[1] + "</strong></div>";
    }).join("");
  }

  function clear(ctx) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, x + 14, y + 23);
  }

  function grid(ctx, x, y, w, h, rows) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 1; i < rows; i += 1) {
      var yy = y + h * i / rows;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }
  }

  function drawBits(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "codeword and selected error");
    var bits = result.encoded.codeword;
    var px = x + 28;
    var py = y + 48;
    var pw = w - 56;
    var rows = 4;
    var perRow = Math.ceil(bits.length / rows);
    var cell = Math.min(8, pw / perRow);
    var rowGap = 30;
    for (var i = 0; i < bits.length; i += 1) {
      var row = Math.floor(i / perRow);
      var col = i % perRow;
      var xx = px + col * cell;
      var yy = py + row * rowGap;
      var isCheck = i >= result.params.length;
      ctx.fillStyle = isCheck ? COLORS.check : COLORS.data;
      if (!bits[i]) ctx.globalAlpha = 0.25;
      ctx.fillRect(xx, yy, Math.max(1.5, cell - 1), 12);
      ctx.globalAlpha = 1;
      if (result.errorMask[i]) {
        ctx.fillStyle = COLORS.error;
        ctx.fillRect(xx, yy + 15, Math.max(1.5, cell - 1), 7);
      }
    }
    ctx.fillStyle = result.selectedDetected ? COLORS.detected : COLORS.undetected;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(result.selectedDetected ? "selected corruption is detected" : "selected corruption is undetected", px, y + h - 26);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("blue=data, green=CRC, orange=flipped bits; codeword length " + result.codeLen + " bits", px, y + h - 10);
  }

  function drawTrace(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "division ledger");
    var px = x + 22;
    var py = y + 44;
    var rowH = 17;
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("first " + result.trace.length + " dividend bits; xor divisor when the top bit is set", px, py - 9);
    result.trace.slice(0, 10).forEach(function (row, i) {
      var yy = py + i * rowH;
      ctx.fillStyle = row.xored ? COLORS.poly : COLORS.rule;
      ctx.fillRect(px, yy - 10, 8, 8);
      ctx.fillStyle = COLORS.text;
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(
        String(row.index).padStart(2, "0") +
          " bit " + row.bit +
          " rem 0x" + row.rem.toString(16).toUpperCase().padStart(Math.ceil(result.preset.width / 4), "0"),
        px + 16,
        yy
      );
    });
    var taps = [];
    for (var bit = result.preset.width; bit >= 0; bit -= 1) {
      if ((result.preset.divisor >> bit) & 1) taps.push(bit === 0 ? "1" : bit === 1 ? "x" : "x^" + bit);
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("g(x) = " + taps.join(" + "), px, y + h - 16);
  }

  function drawDetection(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "exhaustive checks on this length");
    var px = x + 40;
    var py = y + 44;
    var pw = w - 62;
    var ph = h - 76;
    var rows = [
      { label: "single-bit", total: result.singleDouble.singleTotal, bad: result.singleDouble.single },
      { label: "double-bit", total: result.singleDouble.doubleTotal, bad: result.singleDouble.double },
      { label: "bursts <=12", total: result.bursts.total, bad: result.bursts.undetected },
      { label: "random sample", total: result.random.total, bad: result.random.undetected }
    ];
    var max = Math.max.apply(null, rows.map(function (row) { return row.total; }));
    rows.forEach(function (row, i) {
      var yy = py + i * 38;
      var bw = pw * row.total / max;
      var badW = bw * row.bad / Math.max(1, row.total);
      ctx.fillStyle = COLORS.detected;
      ctx.fillRect(px, yy, bw, 17);
      ctx.fillStyle = COLORS.undetected;
      ctx.fillRect(px, yy, badW, 17);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.bad + " missed", px + bw + 8, yy + 13);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label + " (" + fmtRate(row.bad, row.total) + ")", px, yy + 32);
    });
  }

  function drawCompare(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "polynomial choice matters");
    var px = x + 22;
    var py = y + 46;
    var rowH = 30;
    result.compare.forEach(function (row, i) {
      var yy = py + i * rowH;
      var score = row.single + row.double + row.shortBurst;
      ctx.fillStyle = score === 0 ? COLORS.detected : COLORS.bad;
      ctx.fillRect(px, yy - 12, Math.min(150, 10 + score / 8), 14);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, px + 164, yy);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("single " + row.single + ", double " + row.double + ", bursts " + row.shortBurst, px + 164, yy + 14);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("same payload length, different generator polynomials", px, y + h - 14);
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    clear(ctx);
    drawBits(ctx, result, 18, 18, 884, 196);
    drawTrace(ctx, result, 18, 236, 430, 220);
    drawDetection(ctx, result, 472, 236, 430, 220);
    drawCompare(ctx, result, 18, 478, 884, 196);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__crcPolynomialLabResult = result;
  }

  function init(root) {
    if (!root || root.__crcPolynomialLabInitialized) return;
    root.__crcPolynomialLabInitialized = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function initAll() {
    document.querySelectorAll("[data-crc-polynomial-lab]").forEach(init);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CrcPolynomialLab = api;
})(typeof window !== "undefined" ? window : globalThis);
