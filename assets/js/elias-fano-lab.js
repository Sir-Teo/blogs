(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    ef: "#0f766e",
    low: "#2563eb",
    high: "#b45309",
    bitset: "#7c3aed",
    varbyte: "#be123c",
    fixed: "#334155",
    good: "#15803d",
    softGreen: "#ecfdf5",
    softBlue: "#eff6ff",
    softAmber: "#fffbeb"
  };

  var DEFAULTS = {
    universe: 100000,
    count: 900,
    locality: 45,
    scenario: "clustered",
    queryRank: 42,
    target: 42000,
    seed: 17
  };

  var SCENARIOS = {
    uniform: "uniform gaps",
    clustered: "clustered postings",
    dense: "dense predicate",
    runs: "runs and jumps"
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    value = Number(value);
    if (!Number.isFinite(value)) return min;
    return clamp(Math.round(value), min, max);
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var universe = clampInt(finite(raw.universe, DEFAULTS.universe), 512, 1000000);
    var count = clampInt(finite(raw.count, DEFAULTS.count), 16, Math.min(8000, universe));
    return {
      universe: universe,
      count: count,
      locality: clampInt(finite(raw.locality, DEFAULTS.locality), 0, 100),
      scenario: SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario,
      queryRank: clampInt(finite(raw.queryRank, DEFAULTS.queryRank), 0, Math.max(0, count - 1)),
      target: clampInt(finite(raw.target, DEFAULTS.target), 0, universe - 1),
      seed: clampInt(finite(raw.seed, DEFAULTS.seed), 1, 9999)
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

  function uniqueSorted(values, universe, count) {
    var seen = new Uint8Array(universe);
    values.forEach(function (value) {
      var v = clamp(Math.round(value), 0, universe - 1);
      seen[v] = 1;
    });
    var out = [];
    for (var i = 0; i < universe && out.length < count; i += 1) {
      if (seen[i]) out.push(i);
    }
    var cursor = 0;
    while (out.length < count && cursor < universe) {
      if (!seen[cursor]) {
        seen[cursor] = 1;
        out.push(cursor);
      }
      cursor += 1;
    }
    out.sort(function (a, b) { return a - b; });
    return out.slice(0, count);
  }

  function generateUniform(params, rng) {
    var avg = params.universe / (params.count + 1);
    var jitter = avg * params.locality / 160;
    var values = [];
    for (var i = 0; i < params.count; i += 1) {
      var base = (i + 1) * avg;
      values.push(base + (rng() - 0.5) * jitter);
    }
    return uniqueSorted(values, params.universe, params.count);
  }

  function generateClustered(params, rng) {
    var clusters = Math.max(2, Math.round(3 + params.locality / 14));
    var width = Math.max(3, params.universe * (0.18 - params.locality * 0.0014));
    var values = [];
    var centers = [];
    for (var c = 0; c < clusters; c += 1) {
      centers.push((c + 0.5 + (rng() - 0.5) * 0.35) * params.universe / clusters);
    }
    for (var i = 0; i < params.count; i += 1) {
      var center = centers[Math.floor(rng() * clusters)];
      var offset = (rng() + rng() + rng() - 1.5) * width;
      values.push(center + offset);
    }
    return uniqueSorted(values, params.universe, params.count);
  }

  function generateDense(params, rng) {
    var span = Math.max(params.count + 8, Math.round(params.universe * (0.18 + (100 - params.locality) / 180)));
    var start = Math.floor(rng() * Math.max(1, params.universe - span));
    var values = [];
    for (var i = 0; i < params.count; i += 1) {
      values.push(start + Math.floor(i * span / params.count) + Math.floor(rng() * 2));
    }
    return uniqueSorted(values, params.universe, params.count);
  }

  function generateRuns(params, rng) {
    var values = [];
    var position = Math.floor(rng() * 17);
    while (values.length < params.count && position < params.universe) {
      var run = Math.max(2, Math.round(3 + rng() * (4 + params.locality / 6)));
      for (var r = 0; r < run && values.length < params.count && position < params.universe; r += 1) {
        values.push(position);
        position += 1;
      }
      var jumpScale = params.universe / Math.max(6, params.count * (0.6 + params.locality / 80));
      position += Math.max(1, Math.floor(jumpScale * (0.4 + rng() * 2.8)));
    }
    return uniqueSorted(values, params.universe, params.count);
  }

  function generate(params) {
    var p = cleanParams(params);
    var rng = makeRng(p.seed);
    var values;
    if (p.scenario === "uniform") values = generateUniform(p, rng);
    else if (p.scenario === "dense") values = generateDense(p, rng);
    else if (p.scenario === "runs") values = generateRuns(p, rng);
    else values = generateClustered(p, rng);
    return { params: p, values: values };
  }

  function bitsForFixed(universe) {
    return Math.max(1, Math.ceil(Math.log(Math.max(2, universe)) / Math.log(2)));
  }

  function varintBytes(value) {
    var bytes = 1;
    var v = Math.max(0, Math.floor(value));
    while (v >= 128) {
      bytes += 1;
      v = Math.floor(v / 128);
    }
    return bytes;
  }

  function varbyteGapBits(values) {
    var prev = -1;
    var bytes = 0;
    values.forEach(function (value) {
      var gap = value - prev;
      bytes += varintBytes(gap);
      prev = value;
    });
    return bytes * 8;
  }

  function encodeEliasFano(values, universe) {
    if (!values.length) {
      return {
        count: 0,
        high: [],
        highLength: 0,
        l: 0,
        lowBase: 1,
        lows: [],
        select: [],
        totalBits: 0,
        universe: universe,
        values: []
      };
    }
    var n = values.length;
    var ratio = Math.max(1, universe / n);
    var l = Math.max(0, Math.floor(Math.log(ratio) / Math.log(2)));
    var lowBase = Math.pow(2, l);
    var maxHigh = Math.floor((universe - 1) / lowBase);
    var highLength = n + maxHigh + 1;
    var high = new Uint8Array(highLength);
    var lows = new Array(n);
    var select = new Array(n);
    var previous = -1;
    values.forEach(function (value, i) {
      if (value < previous) throw new Error("Elias-Fano input must be monotone");
      if (value < 0 || value >= universe) throw new Error("value outside universe");
      var hi = Math.floor(value / lowBase);
      var lo = value % lowBase;
      var pos = hi + i;
      high[pos] = 1;
      select[i] = pos;
      lows[i] = lo;
      previous = value;
    });
    return {
      count: n,
      high: Array.prototype.slice.call(high),
      highLength: highLength,
      l: l,
      lowBase: lowBase,
      lows: lows,
      select: select,
      totalBits: n * l + highLength,
      universe: universe,
      values: values.slice()
    };
  }

  function access(encoded, index) {
    index = clampInt(index, 0, Math.max(0, encoded.count - 1));
    if (!encoded.count) return null;
    var high = encoded.select[index] - index;
    return high * encoded.lowBase + encoded.lows[index];
  }

  function lowerBound(encoded, target) {
    if (!encoded.count) return -1;
    var lo = 0;
    var hi = encoded.count;
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (access(encoded, mid) < target) lo = mid + 1;
      else hi = mid;
    }
    return lo < encoded.count ? lo : -1;
  }

  function storageLedger(values, universe, encoded) {
    var fixedBits = bitsForFixed(universe) * values.length;
    var bitsetBits = universe;
    var varbyteBits = varbyteGapBits(values);
    return {
      bitsetBits: bitsetBits,
      efBits: encoded.totalBits,
      fixedBits: fixedBits,
      lowerBits: encoded.count * encoded.l,
      upperBits: encoded.highLength,
      varbyteBits: varbyteBits
    };
  }

  function evaluate(raw) {
    var data = generate(raw);
    var encoded = encodeEliasFano(data.values, data.params.universe);
    var ledger = storageLedger(data.values, data.params.universe, encoded);
    var queryIndex = clamp(data.params.queryRank, 0, Math.max(0, encoded.count - 1));
    var queryValue = access(encoded, queryIndex);
    var nextIndex = lowerBound(encoded, data.params.target);
    var nextValue = nextIndex >= 0 ? access(encoded, nextIndex) : null;
    var density = data.values.length / data.params.universe;
    var averageGap = data.values.length
      ? (data.values[data.values.length - 1] - data.values[0] + 1) / data.values.length
      : 0;
    var audit = auditResult(data.values, encoded, data.params, queryIndex, queryValue, nextIndex, nextValue);
    return {
      audit: audit,
      averageGap: averageGap,
      density: density,
      encoded: encoded,
      ledger: ledger,
      params: data.params,
      query: {
        index: queryIndex,
        nextIndex: nextIndex,
        nextValue: nextValue,
        target: data.params.target,
        value: queryValue
      },
      values: data.values
    };
  }

  function auditResult(values, encoded, params, queryIndex, queryValue, nextIndex, nextValue) {
    var decoded = values.map(function (_, i) { return access(encoded, i); });
    var decodeOk = decoded.every(function (value, i) { return value === values[i]; });
    var monotone = values.every(function (value, i) { return i === 0 || value > values[i - 1]; });
    var highBitsOk = encoded.select.every(function (pos, i) {
      return encoded.high[pos] === 1 && pos === Math.floor(values[i] / encoded.lowBase) + i;
    });
    var ones = encoded.high.reduce(function (sum, bit) { return sum + bit; }, 0);
    var queryOk = queryValue === values[queryIndex];
    var expectedNext = -1;
    for (var i = 0; i < values.length; i += 1) {
      if (values[i] >= params.target) {
        expectedNext = i;
        break;
      }
    }
    var nextOk = nextIndex === expectedNext &&
      (nextIndex < 0 ? nextValue === null : nextValue === values[nextIndex]);
    return {
      decodeOk: decodeOk,
      highBitsOk: highBitsOk,
      monotone: monotone,
      nextOk: nextOk,
      passed: decodeOk && highBitsOk && monotone && nextOk && ones === values.length && queryOk,
      queryOk: queryOk,
      onesOk: ones === values.length
    };
  }

  function runAudit() {
    var scenarios = [
      {},
      { scenario: "uniform", universe: 4096, count: 64, locality: 0, target: 1234, queryRank: 7, seed: 1 },
      { scenario: "clustered", universe: 100000, count: 1500, locality: 90, target: 75000, queryRank: 300, seed: 19 },
      { scenario: "dense", universe: 2048, count: 1200, locality: 55, target: 1200, queryRank: 1000, seed: 23 },
      { scenario: "runs", universe: 250000, count: 2200, locality: 80, target: 100000, queryRank: 128, seed: 71 }
    ];
    var details = scenarios.map(function (params) {
      var result = evaluate(params);
      var allTargetsOk = [0, 1, Math.floor(result.params.universe / 5), Math.floor(result.params.universe / 2), result.params.universe - 1, result.params.universe].every(function (target) {
        var idx = lowerBound(result.encoded, target);
        var expected = -1;
        for (var i = 0; i < result.values.length; i += 1) {
          if (result.values[i] >= target) {
            expected = i;
            break;
          }
        }
        return idx === expected;
      });
      return {
        audit: result.audit,
        bitsPerValue: result.encoded.count ? result.ledger.efBits / result.encoded.count : 0,
        l: result.encoded.l,
        scenario: result.params.scenario,
        targetOk: allTargetsOk
      };
    });
    return {
      details: details,
      passed: details.every(function (row) { return row.audit.passed && row.targetOk; })
    };
  }

  function formatInt(value) {
    if (value == null) return "none";
    return Math.round(value).toLocaleString("en-US");
  }

  function fmt(value, digits) {
    return Number(value).toFixed(digits == null ? 2 : digits);
  }

  function setupCanvas(canvas, cssHeight) {
    var width = Math.max(320, Math.round(canvas.getBoundingClientRect().width || canvas.width || 900));
    var dpr = global.devicePixelRatio || 1;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, cssHeight);
    return { ctx: ctx, height: cssHeight, width: width };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function text(ctx, value, x, y, size, color, weight, align, baseline) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(String(value), x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    text(ctx, title, box.x + 16, box.y + 26, 13, COLORS.text, 760);
    if (subtitle) text(ctx, subtitle, box.x + 16, box.y + 45, 10, COLORS.muted, 620);
  }

  function drawDistribution(ctx, result, box) {
    panel(ctx, box, "posting list", "sorted document IDs over the universe");
    var plot = { x: box.x + 20, y: box.y + 76, w: box.w - 40, h: box.h - 120 };
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (var g = 0; g <= 4; g += 1) {
      var x = plot.x + g * plot.w / 4;
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
    }
    ctx.stroke();
    var buckets = new Array(64).fill(0);
    result.values.forEach(function (value) {
      var b = clamp(Math.floor(value / result.params.universe * buckets.length), 0, buckets.length - 1);
      buckets[b] += 1;
    });
    var max = buckets.reduce(function (m, v) { return Math.max(m, v); }, 1);
    buckets.forEach(function (count, i) {
      var x = plot.x + i * plot.w / buckets.length;
      var h = count / max * plot.h;
      ctx.fillStyle = COLORS.ef;
      ctx.fillRect(x, plot.y + plot.h - h, Math.max(1, plot.w / buckets.length - 1), h);
    });
    var targetX = plot.x + result.query.target / result.params.universe * plot.w;
    ctx.strokeStyle = COLORS.varbyte;
    ctx.beginPath();
    ctx.moveTo(targetX, plot.y - 12);
    ctx.lineTo(targetX, plot.y + plot.h + 8);
    ctx.stroke();
    text(ctx, "target " + formatInt(result.query.target), targetX, plot.y - 17, 10, COLORS.varbyte, 700, "center");
    text(ctx, "0", plot.x, plot.y + plot.h + 20, 10, COLORS.muted, 650, "center");
    text(ctx, formatInt(result.params.universe - 1), plot.x + plot.w, plot.y + plot.h + 20, 10, COLORS.muted, 650, "center");
    text(ctx, "density " + fmt(100 * result.density, 2) + "%", box.x + 16, box.y + box.h - 20, 11, COLORS.text, 700);
  }

  function drawSplit(ctx, result, box) {
    panel(ctx, box, "bit split", "low bits are literal; high bits become select positions");
    var y = box.y + 74;
    var bitY = box.y + box.h - 66;
    var rowTop = y + 22;
    var maxRows = Math.max(4, Math.min(10, Math.floor((bitY - rowTop - 12) / 16)));
    var rowCount = Math.min(maxRows, result.values.length);
    var rows = [];
    for (var r = 0; r < rowCount; r += 1) {
      var i = rowCount === 1 ? 0 : Math.round(r * (result.values.length - 1) / (rowCount - 1));
      var value = result.values[i];
      rows.push({
        high: Math.floor(value / result.encoded.lowBase),
        index: i,
        low: result.encoded.lows[i],
        pos: result.encoded.select[i],
        value: value
      });
    }
    var col = {
      high: box.x + 118,
      index: box.x + 20,
      low: box.x + 174,
      pos: box.x + box.w - 22,
      value: box.x + 54
    };
    text(ctx, "i", col.index, y, 10, COLORS.muted, 700);
    text(ctx, "x[i]", col.value, y, 10, COLORS.muted, 700);
    text(ctx, "high", col.high, y, 10, COLORS.high, 700);
    text(ctx, "low", col.low, y, 10, COLORS.low, 700);
    text(ctx, "select1(i)", col.pos, y, 10, COLORS.ef, 700, "right");
    rows.forEach(function (row, rowIndex) {
      var yy = rowTop + rowIndex * 16;
      text(ctx, row.index, col.index, yy, 10, COLORS.text, 650);
      text(ctx, formatInt(row.value), col.value, yy, 10, COLORS.text, 650);
      text(ctx, row.high, col.high, yy, 10, COLORS.high, 650);
      text(ctx, row.low, col.low, yy, 10, COLORS.low, 650);
      text(ctx, row.pos, col.pos, yy, 10, COLORS.ef, 650, "right");
    });
    var shown = Math.min(48, result.encoded.high.length);
    for (var i = 0; i < shown; i += 1) {
      var x = box.x + 18 + i * (box.w - 36) / shown;
      ctx.fillStyle = result.encoded.high[i] ? COLORS.ef : COLORS.rule;
      ctx.fillRect(x, bitY, Math.max(3, (box.w - 48) / shown), 14);
    }
    text(ctx, "upper bitmap prefix (" + shown + " of " + formatInt(result.encoded.high.length) + " bits)", box.x + 16, box.y + box.h - 24, 10, COLORS.muted, 650);
  }

  function drawLedger(ctx, result, box) {
    panel(ctx, box, "space ledger", "bits for the same monotone list");
    var rows = [
      { label: "Elias-Fano", value: result.ledger.efBits, color: COLORS.ef },
      { label: "varbyte gaps", value: result.ledger.varbyteBits, color: COLORS.varbyte },
      { label: "fixed IDs", value: result.ledger.fixedBits, color: COLORS.fixed },
      { label: "bitset", value: result.ledger.bitsetBits, color: COLORS.bitset }
    ];
    var plot = { x: box.x + 94, y: box.y + 76, w: box.w - 126, h: box.h - 122 };
    var max = rows.reduce(function (m, row) { return Math.max(m, row.value); }, 1);
    rows.forEach(function (row, i) {
      var y = plot.y + i * plot.h / rows.length;
      var h = Math.max(16, plot.h / rows.length - 12);
      var w = row.value / max * plot.w;
      text(ctx, row.label, plot.x - 10, y + h / 2, 10, COLORS.muted, 700, "right", "middle");
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, w, h);
      text(ctx, formatInt(row.value) + " bits", plot.x + w + 6, y + h / 2, 10, COLORS.text, 650, "left", "middle");
    });
    text(ctx, "EF = " + formatInt(result.ledger.lowerBits) + " low + " + formatInt(result.ledger.upperBits) + " upper bits", box.x + 16, box.y + box.h - 24, 11, COLORS.text, 700);
  }

  function drawQuery(ctx, result, box) {
    panel(ctx, box, "access and skip", "decode by select1(i) - i, then attach low bits");
    var q = result.query;
    var y = box.y + 82;
    var high = Math.floor(q.value / result.encoded.lowBase);
    var low = q.value % result.encoded.lowBase;
    text(ctx, "access(" + q.index + ")", box.x + 18, y, 14, COLORS.text, 780);
    text(ctx, "select1(" + q.index + ") = " + result.encoded.select[q.index], box.x + 18, y + 28, 11, COLORS.ef, 700);
    text(ctx, "high = " + result.encoded.select[q.index] + " - " + q.index + " = " + high, box.x + 18, y + 50, 11, COLORS.high, 700);
    text(ctx, "low = " + low + " (" + result.encoded.l + " bits)", box.x + 18, y + 72, 11, COLORS.low, 700);
    text(ctx, "value = " + formatInt(q.value), box.x + 18, y + 101, 16, COLORS.text, 780);

    var box2Y = box.y + box.h - 92;
    ctx.fillStyle = q.nextIndex >= 0 ? COLORS.softGreen : COLORS.softAmber;
    roundedRect(ctx, box.x + 16, box2Y, box.w - 32, 58, 6);
    ctx.fill();
    text(ctx, "nextGEQ(" + formatInt(q.target) + ")", box.x + 28, box2Y + 22, 11, COLORS.muted, 700);
    text(ctx, q.nextIndex >= 0
      ? "index " + q.nextIndex + ", value " + formatInt(q.nextValue)
      : "no posting at or after target",
      box.x + 28, box2Y + 44, 13, COLORS.text, 760);
  }

  function draw(result, canvas) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var compact = width < 760;
    var prepared = setupCanvas(canvas, compact ? 1120 : 760);
    var ctx = prepared.ctx;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = prepared.width - 2 * pad;
    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawDistribution(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawSplit(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawLedger(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawQuery(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }
    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawDistribution(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawSplit(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawLedger(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawQuery(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function metric(label, value, klass) {
    return "<div class=\"elias-fano-lab__metric " + (klass || "") + "\"><span>" +
      label + "</span><strong>" + value + "</strong></div>";
  }

  function setOutput(root, key, value) {
    var out = root.querySelector("[data-output=\"" + key + "\"]");
    if (out) out.textContent = value;
  }

  function syncControls(root, result) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (key === "count") input.max = Math.min(8000, result.params.universe);
      if (key === "queryRank") input.max = Math.max(0, result.params.count - 1);
      if (key === "target") input.max = result.params.universe - 1;
      if (result.params[key] != null) input.value = result.params[key];
    });
    setOutput(root, "scenario", SCENARIOS[result.params.scenario]);
    setOutput(root, "universe", formatInt(result.params.universe));
    setOutput(root, "count", formatInt(result.params.count));
    setOutput(root, "locality", result.params.locality + "%");
    setOutput(root, "queryRank", "#" + result.params.queryRank);
    setOutput(root, "target", formatInt(result.params.target));
    setOutput(root, "seed", String(result.params.seed));
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncControls(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("low bits l", String(result.encoded.l)),
        metric("EF bits/value", fmt(result.ledger.efBits / result.params.count, 2)),
        metric("varbyte bits/value", fmt(result.ledger.varbyteBits / result.params.count, 2)),
        metric("bitset ratio", fmt(result.ledger.bitsetBits / result.ledger.efBits, 1) + "x"),
        metric("nextGEQ", result.query.nextValue == null ? "none" : formatInt(result.query.nextValue)),
        metric("audit", result.audit.passed ? "passed" : "failed", result.audit.passed ? "elias-fano-lab__metric--good" : "elias-fano-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "This toy implementation stores select positions explicitly for clarity. Production structures compress the select/rank support and use broadword operations.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__eliasFanoResult = result;
  }

  function init(root) {
    if (!root || root.__eliasFanoReady) return;
    root.__eliasFanoReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { render(root); }, 70);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__eliasFanoResult) {
          var canvas = root.querySelector("canvas[data-canvas]");
          if (canvas) draw(root.__eliasFanoResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__eliasFanoResult) {
          var canvas = root.querySelector("canvas[data-canvas]");
          if (canvas) draw(root.__eliasFanoResult, canvas);
        }
      });
    }
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-elias-fano-lab]")).forEach(init);
  }

  function auditEliasFanoLab() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  var api = {
    access: access,
    auditEliasFanoLab: auditEliasFanoLab,
    cleanParams: cleanParams,
    encodeEliasFano: encodeEliasFano,
    evaluate: evaluate,
    lowerBound: lowerBound,
    runAudit: runAudit
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.EliasFanoLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
