(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    raw: "#be123c",
    hamming: "#2563eb",
    secded: "#0f766e",
    repetition: "#7c3aed",
    success: "#0f766e",
    wrong: "#be123c",
    erasure: "#d97706",
    parity: "#64748b",
    data: "#2563eb"
  };

  var SCHEMES = [
    { key: "raw", label: "raw", rate: 1, n: 4, color: COLORS.raw },
    { key: "hamming", label: "Hamming(7,4)", rate: 4 / 7, n: 7, color: COLORS.hamming },
    { key: "secded", label: "SECDED(8,4)", rate: 0.5, n: 8, color: COLORS.secded },
    { key: "repetition", label: "repeat-3", rate: 1 / 3, n: 12, color: COLORS.repetition }
  ];

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="hamming-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function bit(value, index) {
    return (value >> index) & 1;
  }

  function bitsOf(value, length) {
    var bits = [];
    for (var i = 0; i < length; i += 1) bits.push(bit(value, i));
    return bits;
  }

  function bitsToInt(bits) {
    var value = 0;
    for (var i = 0; i < bits.length; i += 1) {
      if (bits[i]) value |= (1 << i);
    }
    return value;
  }

  function xorBits(bits, positions) {
    var x = 0;
    positions.forEach(function (pos) {
      x ^= bits[pos - 1] || 0;
    });
    return x;
  }

  function hammingWeight(value) {
    var count = 0;
    while (value) {
      value &= value - 1;
      count += 1;
    }
    return count;
  }

  function encodeHamming(data) {
    var d = bitsOf(data, 4);
    var c = new Array(7).fill(0);
    c[2] = d[0];
    c[4] = d[1];
    c[5] = d[2];
    c[6] = d[3];
    c[0] = c[2] ^ c[4] ^ c[6];
    c[1] = c[2] ^ c[5] ^ c[6];
    c[3] = c[4] ^ c[5] ^ c[6];
    return c;
  }

  function extractData(bits) {
    return bitsToInt([bits[2], bits[4], bits[5], bits[6]]);
  }

  function syndrome(bits) {
    var s1 = xorBits(bits, [1, 3, 5, 7]);
    var s2 = xorBits(bits, [2, 3, 6, 7]);
    var s4 = xorBits(bits, [4, 5, 6, 7]);
    return s1 + 2 * s2 + 4 * s4;
  }

  function applyMask(bits, mask) {
    return bits.map(function (b, i) {
      return b ^ bit(mask, i);
    });
  }

  function decodeHamming(received) {
    var s = syndrome(received);
    var corrected = received.slice();
    if (s > 0 && s <= 7) corrected[s - 1] ^= 1;
    return {
      corrected: corrected,
      data: extractData(corrected),
      status: s ? "corrected bit " + s : "clean",
      syndrome: s
    };
  }

  function parity(bits) {
    return bits.reduce(function (acc, value) { return acc ^ value; }, 0);
  }

  function encodeSecded(data) {
    var h = encodeHamming(data);
    h.push(parity(h));
    return h;
  }

  function decodeSecded(received) {
    var h = received.slice(0, 7);
    var s = syndrome(h);
    var overall = parity(received);
    var corrected = received.slice();
    var status = "clean";
    var erasure = false;
    if (s && overall) {
      corrected[s - 1] ^= 1;
      status = "corrected bit " + s;
    } else if (!s && overall) {
      corrected[7] ^= 1;
      status = "corrected parity bit";
    } else if (s && !overall) {
      erasure = true;
      status = "detected double error";
    }
    return {
      corrected: corrected,
      data: extractData(corrected),
      erasure: erasure,
      status: status,
      syndrome: s
    };
  }

  function encodeRaw(data) {
    return bitsOf(data, 4);
  }

  function decodeRaw(received) {
    return { data: bitsToInt(received), erasure: false };
  }

  function encodeRepetition(data) {
    var d = bitsOf(data, 4);
    var out = [];
    d.forEach(function (b) {
      out.push(b, b, b);
    });
    return out;
  }

  function decodeRepetition(received) {
    var out = [];
    for (var i = 0; i < 4; i += 1) {
      var sum = received[i * 3] + received[i * 3 + 1] + received[i * 3 + 2];
      out.push(sum >= 2 ? 1 : 0);
    }
    return { data: bitsToInt(out), erasure: false };
  }

  function binomialMaskProbability(mask, n, p) {
    var w = hammingWeight(mask);
    return Math.pow(p, w) * Math.pow(1 - p, n - w);
  }

  function schemeFns(key) {
    if (key === "raw") return { encode: encodeRaw, decode: decodeRaw, n: 4 };
    if (key === "secded") return { encode: encodeSecded, decode: decodeSecded, n: 8 };
    if (key === "repetition") return { encode: encodeRepetition, decode: decodeRepetition, n: 12 };
    return { encode: encodeHamming, decode: decodeHamming, n: 7 };
  }

  function evaluateScheme(key, p) {
    var fns = schemeFns(key);
    var encoded = fns.encode(0);
    var success = 0;
    var wrong = 0;
    var erasure = 0;
    var masks = 1 << fns.n;
    for (var mask = 0; mask < masks; mask += 1) {
      var received = applyMask(encoded, mask);
      var decoded = fns.decode(received);
      var prob = binomialMaskProbability(mask, fns.n, p);
      if (decoded.erasure) erasure += prob;
      else if (decoded.data === 0) success += prob;
      else wrong += prob;
    }
    return {
      erasure: erasure,
      success: success,
      wrong: wrong
    };
  }

  function h2(p) {
    if (p <= 0 || p >= 1) return 0;
    return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
  }

  function minDistanceFor(key) {
    var fns = schemeFns(key);
    var words = [];
    for (var data = 0; data < 16; data += 1) words.push(bitsToInt(fns.encode(data)));
    var min = fns.n;
    for (var i = 0; i < words.length; i += 1) {
      for (var j = i + 1; j < words.length; j += 1) {
        min = Math.min(min, hammingWeight(words[i] ^ words[j]));
      }
    }
    return min;
  }

  function minDistanceHamming() {
    return minDistanceFor("hamming");
  }

  function runAudit() {
    var checked = 0;
    var passed = 0;
    var failures = [];
    var expectedDistances = { raw: 1, hamming: 3, secded: 4, repetition: 3 };
    var probabilityPs = [0, 0.03, 0.12, 0.2];
    var tolerance = 1e-10;

    function record(name, ok, details) {
      checked += 1;
      if (ok) {
        passed += 1;
      } else if (failures.length < 8) {
        failures.push({ name: name, details: details || "" });
      }
    }

    Object.keys(expectedDistances).forEach(function (key) {
      var actual = minDistanceFor(key);
      record(key + " minimum distance", actual === expectedDistances[key], "got " + actual);
    });

    SCHEMES.forEach(function (scheme) {
      var fns = schemeFns(scheme.key);
      for (var data = 0; data < 16; data += 1) {
        var clean = fns.decode(fns.encode(data));
        record(scheme.key + " clean round trip " + data, !clean.erasure && clean.data === data);
      }
    });

    for (var hData = 0; hData < 16; hData += 1) {
      var hWord = encodeHamming(hData);
      for (var hPos = 0; hPos < 7; hPos += 1) {
        var hDecoded = decodeHamming(applyMask(hWord, 1 << hPos));
        record(
          "Hamming single-bit correction data " + hData + " bit " + (hPos + 1),
          hDecoded.data === hData && hDecoded.syndrome === hPos + 1
        );
      }
      for (var hMask = 0; hMask < 128; hMask += 1) {
        if (hammingWeight(hMask) !== 2) continue;
        var hTwo = decodeHamming(applyMask(hWord, hMask));
        record("Hamming two-bit silent miscorr data " + hData + " mask " + hMask, hTwo.data !== hData);
      }
    }

    for (var sData = 0; sData < 16; sData += 1) {
      var sWord = encodeSecded(sData);
      for (var sPos = 0; sPos < 8; sPos += 1) {
        var sDecoded = decodeSecded(applyMask(sWord, 1 << sPos));
        record(
          "SECDED single-bit correction data " + sData + " bit " + (sPos + 1),
          !sDecoded.erasure && sDecoded.data === sData
        );
      }
      for (var sMask = 0; sMask < 256; sMask += 1) {
        if (hammingWeight(sMask) !== 2) continue;
        var sTwo = decodeSecded(applyMask(sWord, sMask));
        record("SECDED two-bit detection data " + sData + " mask " + sMask, sTwo.erasure === true);
      }
    }

    probabilityPs.forEach(function (p) {
      SCHEMES.forEach(function (scheme) {
        var out = evaluateScheme(scheme.key, p);
        var sum = out.success + out.wrong + out.erasure;
        record(
          scheme.key + " probability mass p=" + p,
          Math.abs(sum - 1) <= tolerance && out.success >= -tolerance && out.wrong >= -tolerance && out.erasure >= -tolerance,
          "sum " + sum
        );
      });
    });

    var defaultP = 0.03;
    var raw = evaluateScheme("raw", defaultP);
    var hamming = evaluateScheme("hamming", defaultP);
    var secded = evaluateScheme("secded", defaultP);
    var repetition = evaluateScheme("repetition", defaultP);
    record("raw formula at p=3%", Math.abs(raw.wrong - (1 - Math.pow(1 - defaultP, 4))) <= tolerance);
    record("Hamming improves wrong-accepted rate", hamming.wrong < raw.wrong);
    record("SECDED lowers silent wrongs", secded.wrong < hamming.wrong);
    record("repeat-3 lowers silent wrongs", repetition.wrong < raw.wrong);
    record("BSC capacity is finite", isFinite(1 - h2(defaultP)) && 1 - h2(defaultP) >= 0 && 1 - h2(defaultP) <= 1);

    return {
      checked: checked,
      failures: failures,
      ok: failures.length === 0,
      passed: passed
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function cleanParams(raw) {
    return {
      data: clamp(Math.round(raw.data == null ? 11 : raw.data), 0, 15),
      mask: clamp(Math.round(raw.mask == null ? 3 : raw.mask), 0, 127),
      p: clamp(raw.p == null ? 3 : raw.p, 0, 20) / 100,
      sweepMax: clamp(raw.sweepMax == null ? 12 : raw.sweepMax, 2, 30) / 100
    };
  }

  function sweep(params) {
    var rows = [];
    for (var i = 0; i <= 30; i += 1) {
      var p = params.sweepMax * i / 30;
      var row = { capacity: 1 - h2(p), p: p };
      SCHEMES.forEach(function (scheme) {
        var out = evaluateScheme(scheme.key, p);
        row[scheme.key] = out.wrong + out.erasure;
      });
      rows.push(row);
    }
    return rows;
  }

  function oneWord(params) {
    var sent = encodeHamming(params.data);
    var received = applyMask(sent, params.mask);
    var decoded = decodeHamming(received);
    return {
      corrected: decoded.corrected,
      decodedData: decoded.data,
      received: received,
      sent: sent,
      status: decoded.status,
      syndrome: decoded.syndrome
    };
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var outcomes = {};
    SCHEMES.forEach(function (scheme) {
      outcomes[scheme.key] = evaluateScheme(scheme.key, params.p);
    });
    return {
      capacity: 1 - h2(params.p),
      minDistance: minDistanceHamming(),
      outcomes: outcomes,
      params: params,
      sweep: sweep(params),
      word: oneWord(params)
    };
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

  function bitString(bits) {
    return bits.slice().reverse().join("");
  }

  function drawBits(ctx, bits, x, y, cell, highlights) {
    for (var i = 0; i < bits.length; i += 1) {
      var pos = i + 1;
      var isParity = pos === 1 || pos === 2 || pos === 4 || pos === 8;
      ctx.fillStyle = highlights && highlights[pos] ? COLORS.wrong : (isParity ? "#eef2ff" : "#eff6ff");
      ctx.strokeStyle = isParity ? COLORS.parity : COLORS.data;
      ctx.lineWidth = 1;
      ctx.fillRect(x + i * cell, y, cell - 5, cell - 5);
      ctx.strokeRect(x + i * cell, y, cell - 5, cell - 5);
      label(ctx, String(bits[i]), x + i * cell + (cell - 5) / 2, y + (cell - 5) / 2, "center", COLORS.text, "700 13px ui-monospace, SFMono-Regular, Menlo, monospace");
      label(ctx, String(pos), x + i * cell + (cell - 5) / 2, y + cell + 4, "center", COLORS.muted);
    }
  }

  function drawWordPanel(ctx, result, box) {
    panelTitle(ctx, box, "One Hamming word", "syndrome points at a single-bit neighborhood");
    var word = result.word;
    var cell = Math.min(38, Math.max(28, (box.w - 40) / 7));
    var x = box.x + 18;
    var y = box.y + 58;
    var maskHighlights = {};
    for (var i = 0; i < 7; i += 1) if (bit(result.params.mask, i)) maskHighlights[i + 1] = true;
    label(ctx, "sent " + bitString(word.sent), x, y - 18, "left", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    drawBits(ctx, word.sent, x, y, cell, {});
    label(ctx, "received", x, y + 72, "left", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    drawBits(ctx, word.received, x, y + 92, cell, maskHighlights);
    var syndromeText = word.syndrome ? "syndrome " + word.syndrome + " -> flip bit " + word.syndrome : "syndrome 0 -> accept";
    label(ctx, syndromeText, x, y + 166, "left", word.syndrome ? COLORS.hamming : COLORS.success, "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "decoded payload " + result.word.decodedData.toString(2).padStart(4, "0") + (result.word.decodedData === result.params.data ? " (right)" : " (wrong)"), x, y + 190, "left", result.word.decodedData === result.params.data ? COLORS.success : COLORS.wrong, "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawOutcomePanel(ctx, result, box) {
    panelTitle(ctx, box, "Block outcomes at current noise", "green delivered, red wrong, amber detected erasure");
    var plot = { x: box.x + 40, y: box.y + 58, w: box.w - 58, h: box.h - 94 };
    drawAxis(ctx, plot);
    var gap = plot.h / SCHEMES.length;
    SCHEMES.forEach(function (scheme, i) {
      var out = result.outcomes[scheme.key];
      var y = plot.y + i * gap + gap * 0.18;
      var h = gap * 0.46;
      var x = plot.x;
      ctx.fillStyle = COLORS.success;
      ctx.fillRect(x, y, out.success * plot.w, h);
      x += out.success * plot.w;
      ctx.fillStyle = COLORS.wrong;
      ctx.fillRect(x, y, out.wrong * plot.w, h);
      x += out.wrong * plot.w;
      ctx.fillStyle = COLORS.erasure;
      ctx.fillRect(x, y, out.erasure * plot.w, h);
      label(ctx, scheme.label, plot.x - 8, y + h / 2, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, formatPercent(out.wrong * 100, 2) + " wrong", plot.x + plot.w, y + h / 2, "right", COLORS.text);
    });
    label(ctx, "bit flip p = " + formatPercent(result.params.p * 100, 1), plot.x, plot.y + plot.h + 28, "left");
  }

  function drawSweepPanel(ctx, result, box) {
    panelTitle(ctx, box, "Noise sweep", "failure probability versus bit flip rate");
    var plot = { x: box.x + 42, y: box.y + 56, w: box.w - 58, h: box.h - 88 };
    drawAxis(ctx, plot);
    function xScale(p) { return plot.x + p / result.params.sweepMax * plot.w; }
    function yScale(v) {
      var log = Math.log10(Math.max(1e-6, v));
      return plot.y + plot.h - (log + 6) / 6 * plot.h;
    }
    [1e-4, 1e-3, 1e-2, 1e-1].forEach(function (tick) {
      var y = yScale(tick);
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, tick.toExponential(0), plot.x - 7, y, "right");
    });
    SCHEMES.forEach(function (scheme) {
      ctx.strokeStyle = scheme.color;
      ctx.lineWidth = scheme.key === "hamming" ? 2.5 : 1.8;
      ctx.beginPath();
      result.sweep.forEach(function (row, i) {
        var x = xScale(row.p);
        var y = yScale(row[scheme.key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    label(ctx, "red raw, blue Hamming, green SECDED, violet repeat-3", plot.x, plot.y + plot.h + 25, "left");
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Code ledger", "distance buys correction, redundancy pays for distance");
    var rows = [
      ["BSC capacity", formatNumber(result.capacity, 3) + " bits/use"],
      ["raw rate", "1.000"],
      ["Hamming rate", "4/7 = 0.571"],
      ["SECDED rate", "4/8 = 0.500"],
      ["repeat-3 rate", "4/12 = 0.333"],
      ["Hamming min distance", String(result.minDistance)],
      ["guaranteed correction", "1 bit"],
      ["SECDED double errors", "detected"],
      ["Hamming wrong accepted", formatPercent(result.outcomes.hamming.wrong * 100, 3)],
      ["SECDED erasure", formatPercent(result.outcomes.secded.erasure * 100, 3)]
    ];
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 64 };
    var rowGap = Math.min(23, Math.max(17, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.25)" : "transparent";
      ctx.fillRect(plot.x, y - 2, plot.w, rowGap);
      label(ctx, row[0], plot.x + 4, y + 12, "left");
      label(ctx, row[1], plot.x + plot.w - 4, y + 12, "right", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 1040 : 700;
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
      drawWordPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 250 });
      drawOutcomePanel(ctx, result, { x: margin, y: 306, w: panelW, h: 226 });
      drawSweepPanel(ctx, result, { x: margin, y: 562, w: panelW, h: 224 });
      drawLedgerPanel(ctx, result, { x: margin, y: 816, w: panelW, h: 194 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawWordPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 318 });
      drawOutcomePanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 318 });
      drawSweepPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 246 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 246 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var audit = cachedAudit();
    var values = {
      data: result.params.data.toString(2).padStart(4, "0"),
      mask: result.params.mask.toString(2).padStart(7, "0"),
      p: formatPercent(result.params.p * 100, 1),
      sweepMax: formatPercent(result.params.sweepMax * 100, 0)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Hamming success", formatPercent(result.outcomes.hamming.success * 100, 2)),
        metric("Hamming wrong", formatPercent(result.outcomes.hamming.wrong * 100, 3)),
        metric("SECDED erasure", formatPercent(result.outcomes.secded.erasure * 100, 3)),
        metric("repeat-3 wrong", formatPercent(result.outcomes.repetition.wrong * 100, 3)),
        metric("BSC capacity", formatNumber(result.capacity, 3)),
        metric("syndrome", result.word.syndrome ? String(result.word.syndrome) : "0"),
        metric("audit", audit.passed + "/" + audit.checked)
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-hamming-lab]")).forEach(init);
  }

  var api = {
    decodeHamming: decodeHamming,
    decodeSecded: decodeSecded,
    encodeHamming: encodeHamming,
    encodeSecded: encodeSecded,
    evaluateScheme: evaluateScheme,
    minDistanceFor: minDistanceFor,
    minDistanceHamming: minDistanceHamming,
    runAudit: runAudit,
    simulate: simulate,
    syndrome: syndrome
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.HammingCodeLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
