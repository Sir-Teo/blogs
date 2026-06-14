(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    trueP: "#0f766e",
    model: "#2563eb",
    ans: "#7c3aed",
    huffman: "#d97706",
    bad: "#be123c",
    slate: "#64748b",
    ink: "#111827"
  };

  var RANS_L = Math.pow(2, 23);

  var SOURCES = {
    logs: {
      label: "Service log",
      symbols: ["ok", "cache", "retry", "warn", "miss", "fail"],
      probs: [0.56, 0.18, 0.10, 0.07, 0.05, 0.04]
    },
    tokens: {
      label: "Tiny corpus",
      symbols: ["the", "of", "to", "model", "grad", "rare", "glyph"],
      probs: [0.31, 0.21, 0.16, 0.12, 0.08, 0.07, 0.05]
    },
    dyadic: {
      label: "Dyadic toy",
      symbols: ["A", "B", "C", "D", "E"],
      probs: [0.50, 0.25, 0.125, 0.0625, 0.0625]
    },
    flat: {
      label: "Flat-ish",
      symbols: ["red", "blue", "mint", "gold", "gray", "pink", "cyan", "lime"],
      probs: [0.17, 0.155, 0.145, 0.135, 0.12, 0.11, 0.09, 0.075]
    }
  };

  var DEFAULTS = {
    length: 96,
    mismatch: 15,
    precision: 10,
    seed: 41,
    source: "logs"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function log2(value) {
    return Math.log(value) / Math.LN2;
  }

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

  function cleanParams(raw) {
    raw = raw || {};
    var source = String(raw.source || DEFAULTS.source);
    if (!SOURCES[source]) source = DEFAULTS.source;
    return {
      length: clamp(Math.round(raw.length == null ? DEFAULTS.length : Number(raw.length)), 16, 256),
      mismatch: clamp(Number(raw.mismatch == null ? DEFAULTS.mismatch : raw.mismatch), 0, 80) / 100,
      precision: clamp(Math.round(raw.precision == null ? DEFAULTS.precision : Number(raw.precision)), 6, 12),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : Number(raw.seed)), 1, 999),
      source: source
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatBits(value) {
    if (!isFinite(value)) return "n/a";
    if (value >= 1000) return (value / 1000).toFixed(2) + "k";
    return value.toFixed(value >= 100 ? 0 : 1);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="entropy-coder-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function normalize(weights) {
    var total = weights.reduce(function (sum, value) { return sum + value; }, 0);
    return weights.map(function (value) { return value / Math.max(1e-12, total); });
  }

  function entropy(probs) {
    var h = 0;
    for (var i = 0; i < probs.length; i += 1) {
      if (probs[i] > 0) h -= probs[i] * log2(probs[i]);
    }
    return h;
  }

  function crossEntropy(trueProbs, modelProbs) {
    var h = 0;
    for (var i = 0; i < trueProbs.length; i += 1) {
      h -= trueProbs[i] * log2(Math.max(1e-15, modelProbs[i]));
    }
    return h;
  }

  function makeCoderProbs(trueProbs, mismatch) {
    var n = trueProbs.length;
    var tilted = [];
    for (var i = 0; i < n; i += 1) {
      var rotated = trueProbs[(i + n - 1) % n];
      var uniform = 1 / n;
      tilted.push((1 - mismatch) * trueProbs[i] + mismatch * (0.62 * uniform + 0.38 * rotated));
    }
    return normalize(tilted);
  }

  function quantize(probs, precision) {
    var total = Math.pow(2, precision);
    var rows = probs.map(function (p, i) {
      var raw = p * total;
      var base = Math.max(1, Math.floor(raw));
      return { frac: raw - Math.floor(raw), freq: base, index: i };
    });
    var sum = rows.reduce(function (acc, row) { return acc + row.freq; }, 0);
    while (sum < total) {
      rows.sort(function (a, b) { return b.frac - a.frac || a.index - b.index; });
      rows[0].freq += 1;
      rows[0].frac = 0;
      sum += 1;
    }
    while (sum > total) {
      rows.sort(function (a, b) { return b.freq - a.freq || a.frac - b.frac; });
      var reduced = false;
      for (var r = 0; r < rows.length; r += 1) {
        if (rows[r].freq > 1) {
          rows[r].freq -= 1;
          sum -= 1;
          reduced = true;
          break;
        }
      }
      if (!reduced) break;
    }
    rows.sort(function (a, b) { return a.index - b.index; });
    var freqs = rows.map(function (row) { return row.freq; });
    var cumulative = [];
    var bySlot = new Array(total);
    var acc = 0;
    for (var i = 0; i < freqs.length; i += 1) {
      cumulative.push(acc);
      for (var k = 0; k < freqs[i]; k += 1) bySlot[acc + k] = i;
      acc += freqs[i];
    }
    return {
      bySlot: bySlot,
      cumulative: cumulative,
      freqs: freqs,
      probs: freqs.map(function (freq) { return freq / total; }),
      scale: total,
      precision: precision
    };
  }

  function sampleSequence(probs, length, seed) {
    var rand = rng(20260614 + seed * 1009 + length * 17);
    var cumulative = [];
    var acc = 0;
    for (var i = 0; i < probs.length; i += 1) {
      acc += probs[i];
      cumulative.push(acc);
    }
    var seq = [];
    for (var j = 0; j < length; j += 1) {
      var u = rand();
      var s = 0;
      while (s < cumulative.length - 1 && u > cumulative[s]) s += 1;
      seq.push(s);
    }
    return seq;
  }

  function countsFor(seq, n) {
    var counts = new Array(n).fill(0);
    for (var i = 0; i < seq.length; i += 1) counts[seq[i]] += 1;
    return counts;
  }

  function ransEncode(seq, model) {
    var state = RANS_L;
    var bytes = [];
    var events = [];
    for (var i = seq.length - 1; i >= 0; i -= 1) {
      var symbol = seq[i];
      var freq = model.freqs[symbol];
      var start = model.cumulative[symbol];
      var before = state;
      var emitted = 0;
      var xMax = Math.floor(RANS_L / model.scale) * 256 * freq;
      while (state >= xMax) {
        bytes.push(state % 256);
        state = Math.floor(state / 256);
        emitted += 1;
      }
      var afterRenorm = state;
      state = Math.floor(state / freq) * model.scale + (state % freq) + start;
      events.push({
        after: state,
        afterRenorm: afterRenorm,
        before: before,
        emitted: emitted,
        index: i,
        symbol: symbol
      });
    }
    return { bytes: bytes, events: events, state: state };
  }

  function ransDecode(encoded, length, model) {
    var state = encoded.state;
    var ptr = encoded.bytes.length - 1;
    var out = [];
    for (var i = 0; i < length; i += 1) {
      var slot = state % model.scale;
      var symbol = model.bySlot[slot];
      out.push(symbol);
      state = model.freqs[symbol] * Math.floor(state / model.scale) + slot - model.cumulative[symbol];
      while (state < RANS_L && ptr >= 0) {
        state = state * 256 + encoded.bytes[ptr];
        ptr -= 1;
      }
    }
    return { remainingBytes: ptr + 1, sequence: out, state: state };
  }

  function huffmanLengths(weights) {
    var nodes = weights.map(function (weight, index) {
      return { index: index, left: null, right: null, weight: Math.max(1e-15, weight) };
    });
    if (nodes.length === 1) return [1];
    while (nodes.length > 1) {
      nodes.sort(function (a, b) { return a.weight - b.weight; });
      var left = nodes.shift();
      var right = nodes.shift();
      nodes.push({ index: null, left: left, right: right, weight: left.weight + right.weight });
    }
    var lengths = new Array(weights.length).fill(0);
    function walk(node, depth) {
      if (node.index != null) {
        lengths[node.index] = Math.max(1, depth);
        return;
      }
      walk(node.left, depth + 1);
      walk(node.right, depth + 1);
    }
    walk(nodes[0], 0);
    return lengths;
  }

  function expectedLength(probs, lengths) {
    var total = 0;
    for (var i = 0; i < probs.length; i += 1) total += probs[i] * lengths[i];
    return total;
  }

  function generateBlockDistributions(trueProbs, modelProbs, blockSize) {
    var rows = [];
    function visit(depth, trueP, modelP) {
      if (depth === blockSize) {
        rows.push({ model: modelP, trueP: trueP });
        return;
      }
      for (var i = 0; i < trueProbs.length; i += 1) {
        visit(depth + 1, trueP * trueProbs[i], modelP * modelProbs[i]);
      }
    }
    visit(0, 1, 1);
    return rows;
  }

  function huffmanBlockStats(trueProbs, modelProbs) {
    var stats = [];
    for (var block = 1; block <= 3; block += 1) {
      var rows = generateBlockDistributions(trueProbs, modelProbs, block);
      var lengths = huffmanLengths(rows.map(function (row) { return row.model; }));
      var expected = 0;
      for (var i = 0; i < rows.length; i += 1) expected += rows[i].trueP * lengths[i];
      stats.push({ block: block, bitsPerSymbol: expected / block, codewords: rows.length });
    }
    return stats;
  }

  function arithmeticTrace(seq, model, limit) {
    var rows = [];
    var cumulativeBits = 0;
    var maxRows = Math.min(limit || 12, seq.length);
    for (var i = 0; i < maxRows; i += 1) {
      var symbol = seq[i];
      var start = model.cumulative[symbol] / model.scale;
      var end = (model.cumulative[symbol] + model.freqs[symbol]) / model.scale;
      var bits = -log2(model.probs[symbol]);
      cumulativeBits += bits;
      rows.push({
        bits: bits,
        cumulativeBits: cumulativeBits,
        end: end,
        index: i,
        start: start,
        symbol: symbol
      });
    }
    return rows;
  }

  function sequenceIdealBits(seq, modelProbs) {
    var bits = 0;
    for (var i = 0; i < seq.length; i += 1) bits -= log2(Math.max(1e-15, modelProbs[seq[i]]));
    return bits;
  }

  function sameSequence(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var source = SOURCES[params.source];
    var coderProbs = makeCoderProbs(source.probs, params.mismatch);
    var model = quantize(coderProbs, params.precision);
    var seq = sampleSequence(source.probs, params.length, params.seed);
    var counts = countsFor(seq, source.symbols.length);
    var encoded = ransEncode(seq, model);
    var decoded = ransDecode(encoded, seq.length, model);
    var lengths = huffmanLengths(model.probs);
    var huffmanBits = 0;
    for (var i = 0; i < seq.length; i += 1) huffmanBits += lengths[seq[i]];
    var idealBits = sequenceIdealBits(seq, model.probs);
    var hTrue = entropy(source.probs);
    var hCross = crossEntropy(source.probs, model.probs);
    return {
      blockStats: huffmanBlockStats(source.probs, model.probs),
      coderProbs: coderProbs,
      counts: counts,
      decoded: decoded,
      encoded: encoded,
      entropy: hTrue,
      huffman: {
        actualBits: huffmanBits,
        bitsPerSymbol: huffmanBits / seq.length,
        expectedBitsPerSymbol: expectedLength(source.probs, lengths),
        lengths: lengths
      },
      idealBits: idealBits,
      interval: arithmeticTrace(seq, model, 12),
      kl: hCross - hTrue,
      model: model,
      params: params,
      rans: {
        bitsPerSymbol: (encoded.bytes.length * 8 + 32) / seq.length,
        payloadBitsPerSymbol: (encoded.bytes.length * 8) / seq.length,
        totalBits: encoded.bytes.length * 8 + 32,
        payloadBytes: encoded.bytes.length,
        roundTrip: sameSequence(seq, decoded.sequence) && decoded.remainingBytes === 0
      },
      sequence: seq,
      sequenceBitsPerSymbol: idealBits / seq.length,
      source: source,
      crossEntropy: hCross
    };
  }

  function readState(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      if (input.tagName === "SELECT") raw[input.getAttribute("data-param")] = input.value;
      else raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var values = {
      length: String(params.length),
      mismatch: Math.round(params.mismatch * 100) + "%",
      precision: "2^" + params.precision,
      seed: String(params.seed)
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function updateMetrics(metrics, result) {
    metrics.innerHTML = [
      metric("entropy", formatNumber(result.entropy, 3) + " bits/sym"),
      metric("cross entropy", formatNumber(result.crossEntropy, 3) + " bits/sym"),
      metric("KL tax", formatNumber(result.kl, 3) + " bits/sym"),
      metric("rANS total", formatBits(result.rans.totalBits) + " bits"),
      metric("payload bytes", String(result.rans.payloadBytes)),
      metric("round trip", result.rans.roundTrip ? "exact" : "failed")
    ].join("");
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 700 ? 1080 : 720;
    var ratio = root.devicePixelRatio || 1;
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 43, 11, COLORS.muted, 550);
  }

  function clipLabel(label, max) {
    if (label.length <= max) return label;
    return label.slice(0, Math.max(1, max - 1)) + ".";
  }

  function drawProbabilityPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "model probabilities", "green is the source; blue is the coder table");
    var rows = result.source.symbols.length;
    var left = x + 74;
    var right = x + w - 22;
    var top = y + 62;
    var rowH = Math.min(31, (h - 82) / rows);
    var barW = Math.max(80, right - left - 72);
    drawText(ctx, "bits", right - 22, y + 58, 10, COLORS.muted, 650, "right");
    for (var i = 0; i < rows; i += 1) {
      var yy = top + i * rowH;
      drawText(ctx, clipLabel(result.source.symbols[i], 8), x + 16, yy + 15, 11, COLORS.text, 650);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy + 2, barW, 10);
      ctx.fillRect(left, yy + 15, barW, 10);
      ctx.fillStyle = COLORS.trueP;
      ctx.fillRect(left, yy + 2, barW * result.source.probs[i], 10);
      ctx.fillStyle = COLORS.model;
      ctx.fillRect(left, yy + 15, barW * result.model.probs[i], 10);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, yy + 2, barW, 10);
      ctx.strokeRect(left, yy + 15, barW, 10);
      drawText(ctx, formatNumber(-log2(result.model.probs[i]), 2), right - 8, yy + 21, 10, COLORS.muted, 650, "right");
    }
  }

  function drawIntervalPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "arithmetic telescope", "each row rescales the current interval to [0, 1)");
    var limit = Math.min(result.interval.length, h < 270 ? 8 : 12);
    var left = x + 92;
    var right = x + w - 22;
    var top = y + 62;
    var rowH = (h - 88) / Math.max(1, limit);
    var trackW = right - left;
    for (var i = 0; i < limit; i += 1) {
      var row = result.interval[i];
      var yy = top + i * rowH;
      var label = String(row.index + 1) + ": " + clipLabel(result.source.symbols[row.symbol], 8);
      drawText(ctx, label, x + 16, yy + 14, 10, COLORS.text, 650);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy + 4, trackW, 12);
      ctx.fillStyle = COLORS.ans;
      ctx.fillRect(left + trackW * row.start, yy + 4, Math.max(1, trackW * (row.end - row.start)), 12);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, yy + 4, trackW, 12);
      drawText(ctx, "+" + formatNumber(row.bits, 2), right, yy + 15, 10, COLORS.muted, 650, "right");
    }
    if (limit) {
      drawText(ctx, "after " + limit + " symbols: " + formatNumber(result.interval[limit - 1].cumulativeBits, 2) + " ideal bits", left, y + h - 14, 10, COLORS.muted, 650);
    }
  }

  function drawBudgetPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "bit budget", "integer prefix codes, ideal code lengths, and actual rANS bytes");
    var rows = [
      { color: COLORS.slate, label: "entropy H(P)", value: result.entropy },
      { color: COLORS.model, label: "cross H(P,Q)", value: result.crossEntropy },
      { color: COLORS.ans, label: "sample ideal", value: result.sequenceBitsPerSymbol },
      { color: COLORS.ans, label: "rANS total", value: result.rans.bitsPerSymbol },
      { color: COLORS.huffman, label: "Huffman-1", value: result.huffman.bitsPerSymbol }
    ];
    result.blockStats.forEach(function (row) {
      if (row.block > 1) rows.push({ color: COLORS.huffman, label: "Huff block " + row.block, value: row.bitsPerSymbol, faint: true });
    });
    var maxValue = Math.max.apply(null, rows.map(function (row) { return row.value; })) * 1.08;
    var left = x + 104;
    var right = x + w - 28;
    var top = y + 62;
    var rowH = Math.min(27, (h - 92) / rows.length);
    for (var i = 0; i < rows.length; i += 1) {
      var yy = top + i * rowH;
      drawText(ctx, rows[i].label, x + 16, yy + 15, 10, COLORS.text, 650);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy + 5, right - left, 11);
      ctx.fillStyle = rows[i].faint ? "rgba(217,119,6,0.45)" : rows[i].color;
      ctx.fillRect(left, yy + 5, (right - left) * rows[i].value / maxValue, 11);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, yy + 5, right - left, 11);
      drawText(ctx, formatNumber(rows[i].value, 3), right, yy + 15, 10, COLORS.muted, 650, "right");
    }
    var overhead = result.rans.totalBits - result.idealBits;
    drawText(ctx, "rANS overhead on this sample: " + formatBits(overhead) + " bits", left, y + h - 16, 10, overhead < 48 ? COLORS.muted : COLORS.bad, 650);
  }

  function drawStatePanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "rANS state", "the encoder consumes symbols from the end and flushes bytes");
    var events = result.encoded.events.slice(0, Math.min(22, result.encoded.events.length));
    var left = x + 48;
    var right = x + w - 22;
    var top = y + 64;
    var bottom = y + h - 56;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    var values = events.map(function (ev) { return log2(ev.after); });
    var minV = Math.floor(Math.min.apply(null, values.concat([23])) - 1);
    var maxV = Math.ceil(Math.max.apply(null, values.concat([31])) + 1);
    ctx.strokeStyle = COLORS.ans;
    ctx.lineWidth = 2;
    ctx.beginPath();
    events.forEach(function (ev, i) {
      var xx = left + (right - left) * (events.length <= 1 ? 0 : i / (events.length - 1));
      var yy = bottom - (bottom - top) * (log2(ev.after) - minV) / Math.max(1e-9, maxV - minV);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    events.forEach(function (ev, i) {
      var xx = left + (right - left) * (events.length <= 1 ? 0 : i / (events.length - 1));
      var yy = bottom - (bottom - top) * (log2(ev.after) - minV) / Math.max(1e-9, maxV - minV);
      ctx.fillStyle = COLORS.ans;
      ctx.beginPath();
      ctx.arc(xx, yy, 3.2, 0, 2 * Math.PI);
      ctx.fill();
      if (ev.emitted) {
        ctx.fillStyle = COLORS.huffman;
        ctx.fillRect(xx - 4, bottom + 10, 8, 8 + 3 * Math.min(4, ev.emitted));
      }
    });
    drawText(ctx, maxV + " bits", x + 12, top + 4, 10, COLORS.muted, 650);
    drawText(ctx, minV + " bits", x + 12, bottom + 4, 10, COLORS.muted, 650);
    drawText(ctx, "right-to-left encode order", left, y + h - 18, 10, COLORS.muted, 650);
    drawText(ctx, result.rans.payloadBytes + " payload bytes + 32-bit state", right, y + h - 18, 10, COLORS.muted, 650, "right");
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 18;
    var gap = 16;
    if (width < 700) {
      var panelH = (height - 2 * pad - 3 * gap) / 4;
      drawProbabilityPanel(ctx, result, pad, pad, width - 2 * pad, panelH);
      drawIntervalPanel(ctx, result, pad, pad + panelH + gap, width - 2 * pad, panelH);
      drawBudgetPanel(ctx, result, pad, pad + 2 * (panelH + gap), width - 2 * pad, panelH);
      drawStatePanel(ctx, result, pad, pad + 3 * (panelH + gap), width - 2 * pad, panelH);
      return;
    }
    var halfW = (width - 2 * pad - gap) / 2;
    var halfH = (height - 2 * pad - gap) / 2;
    drawProbabilityPanel(ctx, result, pad, pad, halfW, halfH);
    drawIntervalPanel(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawBudgetPanel(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawStatePanel(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function initOne(container) {
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      var params = readState(container);
      updateOutputs(container, params);
      latest = evaluate(params);
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
    var labs = document.querySelectorAll("[data-entropy-coder-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    crossEntropy: crossEntropy,
    entropy: entropy,
    evaluate: evaluate,
    huffmanLengths: huffmanLengths,
    quantize: quantize,
    ransDecode: ransDecode,
    ransEncode: ransEncode,
    sources: SOURCES
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.EntropyCoderLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
