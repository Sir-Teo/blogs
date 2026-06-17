(function (global) {
  "use strict";

  var COLORS = {
    accent: "#7c3aed",
    bad: "#be123c",
    correct: "#0f766e",
    grid: "#e6edf3",
    item: "#2563eb",
    muted: "#5d6872",
    noise: "#d97706",
    panel: "#f8fafc",
    role: "#0f766e",
    rule: "#d7dee5",
    text: "#172026",
    white: "#ffffff"
  };

  var DEFAULTS = {
    dimension: 2048,
    pairs: 10,
    seed: 41,
    signNoise: 6,
    vocab: 128
  };

  var ROLE_NAMES = [
    "agent", "verb", "object", "place", "time", "tool", "source", "target",
    "color", "mood", "cause", "effect", "owner", "part", "before", "after",
    "left", "right", "topic", "quote", "goal", "path", "scale", "unit",
    "key", "value", "rule", "case", "slot-28", "slot-29", "slot-30", "slot-31",
    "slot-32", "slot-33", "slot-34", "slot-35", "slot-36", "slot-37", "slot-38", "slot-39",
    "slot-40", "slot-41", "slot-42", "slot-43", "slot-44", "slot-45", "slot-46", "slot-47",
    "slot-48", "slot-49", "slot-50", "slot-51", "slot-52", "slot-53", "slot-54", "slot-55",
    "slot-56", "slot-57", "slot-58", "slot-59", "slot-60", "slot-61", "slot-62", "slot-63"
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var dimension = Math.round(clamp(finite(Number(raw.dimension), DEFAULTS.dimension), 256, 8192) / 256) * 256;
    var vocab = Math.round(clamp(finite(Number(raw.vocab), DEFAULTS.vocab), 32, 512) / 8) * 8;
    var pairs = Math.round(clamp(finite(Number(raw.pairs), DEFAULTS.pairs), 1, Math.min(64, vocab)));
    return {
      dimension: dimension,
      pairs: pairs,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      signNoise: Math.round(clamp(finite(Number(raw.signNoise), DEFAULTS.signNoise), 0, 45)),
      vocab: vocab
    };
  }

  function hash32(a, b, c) {
    var x = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(c + 0xc2b2ae35, 0x27d4eb2f)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
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

  function hypervector(kind, index, dimension, seed) {
    var out = new Int8Array(dimension);
    var salt = kind === "role" ? 0x51f15eED : 0xA17C0DE;
    for (var i = 0; i < dimension; i += 1) {
      out[i] = (hash32(i, index + 1, seed ^ salt) & 1) ? 1 : -1;
    }
    return out;
  }

  function cosine(a, b) {
    var dot = 0;
    var na = 0;
    var nb = 0;
    for (var i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / Math.max(1e-12, Math.sqrt(na * nb));
  }

  function buildVectors(params) {
    var roles = [];
    var items = [];
    for (var r = 0; r < 64; r += 1) roles.push(hypervector("role", r, params.dimension, params.seed));
    for (var i = 0; i < params.vocab; i += 1) items.push(hypervector("item", i, params.dimension, params.seed));
    return { items: items, roles: roles };
  }

  function makeAssignments(params, count) {
    var n = count == null ? params.pairs : count;
    var used = {};
    var out = [];
    for (var k = 0; k < n; k += 1) {
      var item = (Math.imul(k + 3, 37) + Math.imul(params.seed, 17) + (k * k * 11)) % params.vocab;
      while (used[item]) item = (item + 13) % params.vocab;
      used[item] = true;
      out.push({ item: item, role: k % 64 });
    }
    return out;
  }

  function bundle(assignments, vectors, params, signNoise) {
    var memory = new Int16Array(params.dimension);
    for (var a = 0; a < assignments.length; a += 1) {
      var role = vectors.roles[assignments[a].role];
      var item = vectors.items[assignments[a].item];
      for (var d = 0; d < params.dimension; d += 1) memory[d] += role[d] * item[d];
    }
    var noise = signNoise == null ? params.signNoise : signNoise;
    if (noise > 0) {
      var rng = makeRng(params.seed * 65537 + assignments.length * 4099 + Math.round(noise * 17));
      var p = noise / 100;
      for (d = 0; d < params.dimension; d += 1) {
        if (rng() < p) memory[d] = -memory[d];
      }
    }
    return memory;
  }

  function retrieve(memory, roleVector, itemVectors) {
    var dim = memory.length;
    var query = new Int16Array(dim);
    var normMemory = 0;
    for (var d = 0; d < dim; d += 1) {
      query[d] = memory[d] * roleVector[d];
      normMemory += query[d] * query[d];
    }
    var denom = Math.sqrt(Math.max(1e-12, normMemory * dim));
    var best = { cosine: -Infinity, index: -1 };
    var second = { cosine: -Infinity, index: -1 };
    for (var i = 0; i < itemVectors.length; i += 1) {
      var item = itemVectors[i];
      var dot = 0;
      for (d = 0; d < dim; d += 1) dot += query[d] * item[d];
      var c = dot / denom;
      if (c > best.cosine) {
        second = best;
        best = { cosine: c, index: i };
      } else if (c > second.cosine) {
        second = { cosine: c, index: i };
      }
    }
    return {
      best: best,
      margin: best.cosine - second.cosine,
      second: second
    };
  }

  function runRecord(params, vectors, pairCount, signNoise) {
    var assignments = makeAssignments(params, pairCount);
    var memory = bundle(assignments, vectors, params, signNoise);
    var rows = [];
    var correct = 0;
    var sumMargin = 0;
    var minMargin = Infinity;
    var sumTop = 0;
    for (var i = 0; i < assignments.length; i += 1) {
      var found = retrieve(memory, vectors.roles[assignments[i].role], vectors.items);
      var ok = found.best.index === assignments[i].item;
      if (ok) correct += 1;
      sumMargin += found.margin;
      sumTop += found.best.cosine;
      minMargin = Math.min(minMargin, found.margin);
      rows.push({
        correct: ok,
        margin: found.margin,
        predicted: found.best.index,
        role: assignments[i].role,
        roleName: ROLE_NAMES[assignments[i].role],
        runnerUp: found.second.index,
        target: assignments[i].item,
        topCosine: found.best.cosine
      });
    }
    return {
      accuracy: correct / Math.max(1, assignments.length),
      assignments: assignments,
      meanMargin: sumMargin / Math.max(1, assignments.length),
      meanTopCosine: sumTop / Math.max(1, assignments.length),
      memory: memory,
      minMargin: minMargin === Infinity ? 0 : minMargin,
      rows: rows
    };
  }

  function randomCosines(params, vectors) {
    var values = [];
    var count = Math.min(720, params.vocab * 5);
    for (var i = 0; i < count; i += 1) {
      var a = (i * 37 + params.seed * 11) % params.vocab;
      var b = (i * 91 + params.seed * 19 + 7) % params.vocab;
      if (a === b) b = (b + 1) % params.vocab;
      values.push(cosine(vectors.items[a], vectors.items[b]));
    }
    var mean = values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
    var variance = values.reduce(function (sum, value) {
      return sum + (value - mean) * (value - mean);
    }, 0) / Math.max(1, values.length - 1);
    values.sort(function (a, b) { return a - b; });
    return {
      mean: mean,
      p05: values[Math.floor(0.05 * (values.length - 1))],
      p50: values[Math.floor(0.50 * (values.length - 1))],
      p95: values[Math.floor(0.95 * (values.length - 1))],
      sd: Math.sqrt(Math.max(0, variance)),
      values: values
    };
  }

  function capacitySweep(params, vectors) {
    var maxPairs = Math.min(64, params.vocab);
    var points = [];
    var seen = {};
    var candidates = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64];
    candidates.forEach(function (k) {
      if (k <= maxPairs && !seen[k]) {
        var r = runRecord(params, vectors, k, params.signNoise);
        points.push({ accuracy: r.accuracy, margin: r.meanMargin, pairs: k });
        seen[k] = true;
      }
    });
    if (!seen[params.pairs]) {
      var current = runRecord(params, vectors, params.pairs, params.signNoise);
      points.push({ accuracy: current.accuracy, margin: current.meanMargin, pairs: params.pairs });
    }
    points.sort(function (a, b) { return a.pairs - b.pairs; });
    return points;
  }

  function noiseSweep(params, vectors) {
    var points = [];
    [0, 2, 4, 6, 8, 12, 16, 22, 30, 40].forEach(function (noise) {
      var r = runRecord(params, vectors, params.pairs, noise);
      points.push({ accuracy: r.accuracy, margin: r.meanMargin, noise: noise });
    });
    return points;
  }

  function memoryStats(memory) {
    var sumSq = 0;
    var zeros = 0;
    var maxAbs = 0;
    for (var i = 0; i < memory.length; i += 1) {
      var x = memory[i];
      sumSq += x * x;
      if (x === 0) zeros += 1;
      maxAbs = Math.max(maxAbs, Math.abs(x));
    }
    return {
      norm: Math.sqrt(sumSq),
      maxAbs: maxAbs,
      zeroRate: zeros / Math.max(1, memory.length)
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var vectors = buildVectors(params);
    var record = runRecord(params, vectors, params.pairs, params.signNoise);
    var cosines = randomCosines(params, vectors);
    return {
      capacity: capacitySweep(params, vectors),
      cosines: cosines,
      impostorFloor: Math.sqrt(2 * Math.log(Math.max(2, params.vocab)) / params.dimension),
      memoryStats: memoryStats(record.memory),
      noise: noiseSweep(params, vectors),
      params: params,
      record: record,
      theoreticalSd: 1 / Math.sqrt(params.dimension)
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function percent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function audit() {
    var result = evaluate(DEFAULTS);
    var clean = evaluate({
      dimension: DEFAULTS.dimension,
      pairs: DEFAULTS.pairs,
      seed: DEFAULTS.seed,
      signNoise: 0,
      vocab: DEFAULTS.vocab
    });
    var stress = evaluate({
      dimension: 512,
      pairs: 48,
      seed: DEFAULTS.seed,
      signNoise: 18,
      vocab: 256
    });
    return {
      cleanAccuracy: clean.record.accuracy,
      defaultAccuracy: result.record.accuracy,
      defaultMeanMargin: Number(result.record.meanMargin.toFixed(4)),
      defaultMinMargin: Number(result.record.minMargin.toFixed(4)),
      impostorFloor: Number(result.impostorFloor.toFixed(4)),
      randomCosineSd: Number(result.cosines.sd.toFixed(4)),
      stressAccuracy: stress.record.accuracy,
      theoreticalSd: Number(result.theoreticalSd.toFixed(4))
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "signNoise") value += "%";
        out.textContent = value;
      });
    });
    var pairInput = root.querySelector('[data-param="pairs"]');
    if (pairInput) {
      pairInput.max = String(Math.min(64, params.vocab));
      pairInput.value = String(params.pairs);
    }
  }

  function metric(label, value, klass) {
    return '<div class="hvec-lab__metric ' + (klass || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    box.innerHTML = [
      metric("cleanup accuracy", percent(result.record.accuracy, 0), result.record.accuracy >= 0.95 ? "good" : "warn"),
      metric("min margin", fmt(result.record.minMargin, 3), result.record.minMargin > 0.04 ? "good" : "warn"),
      metric("mean top cosine", fmt(result.record.meanTopCosine, 3)),
      metric("random cosine sd", fmt(result.cosines.sd, 3)),
      metric("impostor floor", fmt(result.impostorFloor, 3)),
      metric("memory zero rate", percent(result.memoryStats.zeroRate, 1))
    ].join("");
  }

  function clear(ctx) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, x + 14, y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, x + 14, y + 41);
    }
  }

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function drawCosines(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "random symbols are almost orthogonal", "cosines between item hypervectors");
    var plot = { x: x + 42, y: y + 60, w: w - 72, h: h - 92 };
    var bins = new Array(28).fill(0);
    var min = -0.18;
    var max = 0.18;
    result.cosines.values.forEach(function (v) {
      var b = Math.floor((v - min) / (max - min) * bins.length);
      if (b >= 0 && b < bins.length) bins[b] += 1;
    });
    var top = Math.max.apply(null, bins.concat([1]));
    for (var i = 0; i < bins.length; i += 1) {
      var bh = plot.h * bins[i] / top;
      ctx.fillStyle = COLORS.item;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(plot.x + i * plot.w / bins.length, plot.y + plot.h - bh, Math.max(1, plot.w / bins.length - 2), bh);
      ctx.globalAlpha = 1;
    }
    line(ctx, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, COLORS.rule, 1);
    var zeroX = plot.x + (0 - min) / (max - min) * plot.w;
    line(ctx, zeroX, plot.y, zeroX, plot.y + plot.h, COLORS.text, 1);
    var s = result.theoreticalSd;
    [-2 * s, 2 * s].forEach(function (v) {
      var xx = plot.x + (v - min) / (max - min) * plot.w;
      line(ctx, xx, plot.y, xx, plot.y + plot.h, COLORS.accent, 1.5);
    });
    var floorX = plot.x + (result.impostorFloor - min) / (max - min) * plot.w;
    line(ctx, floorX, plot.y, floorX, plot.y + plot.h, COLORS.noise, 1.5);
    label(ctx, "0", zeroX + 4, plot.y + 13, COLORS.text, 11, 750);
    label(ctx, "+/- 2/sqrt(D)", plot.x + 8, y + h - 18, COLORS.accent, 11, 700);
    label(ctx, "nearest-impostor scale", x + w - 154, y + h - 18, COLORS.noise, 11, 700);
  }

  function drawRecord(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "unbind, then clean up", "role * memory should point back at the item");
    var rows = result.record.rows.slice(0, 12);
    var startY = y + 62;
    var rowH = Math.min(20, (h - 86) / Math.max(1, rows.length));
    rows.forEach(function (row, i) {
      var yy = startY + i * rowH;
      var color = row.correct ? COLORS.correct : COLORS.bad;
      label(ctx, row.roleName, x + 18, yy, COLORS.role, 11, 750);
      label(ctx, "item-" + String(row.target).padStart(3, "0"), x + 92, yy, COLORS.item, 11, 700);
      label(ctx, row.correct ? "ok" : "got item-" + row.predicted, x + 184, yy, color, 11, 800);
      var barX = x + 282;
      var barW = Math.max(1, Math.min(w - 306, row.margin * 760));
      ctx.fillStyle = color;
      ctx.fillRect(barX, yy - 10, barW, 8);
    });
    if (result.record.rows.length > rows.length) {
      label(ctx, "+" + (result.record.rows.length - rows.length) + " more bindings", x + 18, y + h - 18, COLORS.muted, 11, 650);
    }
  }

  function drawSweep(ctx, points, x, y, w, h, title, subtitle, key, currentValue) {
    panel(ctx, x, y, w, h, title, subtitle);
    var plot = { x: x + 42, y: y + 58, w: w - 72, h: h - 88 };
    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h * g / 4;
      line(ctx, plot.x, yy, plot.x + plot.w, yy, COLORS.grid, 1);
      label(ctx, String(100 - g * 25) + "%", x + 10, yy + 4, COLORS.muted, 10, 600);
    }
    var minX = points[0][key];
    var maxX = points[points.length - 1][key];
    function sx(v) {
      return plot.x + (v - minX) / Math.max(1e-9, maxX - minX) * plot.w;
    }
    function sy(v) {
      return plot.y + plot.h - v * plot.h;
    }
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(function (p, i) {
      var xx = sx(p[key]);
      var yy = sy(p.accuracy);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    points.forEach(function (p) {
      ctx.fillStyle = Math.abs(p[key] - currentValue) < 1e-9 ? COLORS.noise : COLORS.accent;
      ctx.beginPath();
      ctx.arc(sx(p[key]), sy(p.accuracy), Math.abs(p[key] - currentValue) < 1e-9 ? 4 : 2.5, 0, 2 * Math.PI);
      ctx.fill();
    });
    line(ctx, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, COLORS.rule, 1);
    label(ctx, String(minX), plot.x, y + h - 16, COLORS.muted, 10, 600);
    label(ctx, String(maxX), plot.x + plot.w, y + h - 16, COLORS.muted, 10, 600, "right");
  }

  function drawMemoryBarcode(ctx, result, x, y, w, h) {
    var memory = result.record.memory;
    var px = x + 18;
    var py = y + h - 40;
    var cells = 96;
    var cellW = (w - 36) / cells;
    for (var i = 0; i < cells; i += 1) {
      var idx = Math.floor(i * memory.length / cells);
      var value = memory[idx];
      ctx.fillStyle = value > 0 ? COLORS.item : value < 0 ? COLORS.role : COLORS.rule;
      ctx.globalAlpha = Math.min(1, 0.18 + Math.abs(value) / Math.max(1, result.memoryStats.maxAbs));
      ctx.fillRect(px + i * cellW, py, Math.max(1, cellW - 1), 14);
      ctx.globalAlpha = 1;
    }
    label(ctx, "96 sampled coordinates of the bundled memory", px, py + 30, COLORS.muted, 10, 650);
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    clear(ctx);
    drawCosines(ctx, result, 18, 18, 430, 214);
    drawRecord(ctx, result, 472, 18, 430, 214);
    drawSweep(ctx, result.capacity, 18, 254, 430, 224, "capacity sweep", "more bindings mean more crosstalk", "pairs", result.params.pairs);
    drawSweep(ctx, result.noise, 472, 254, 430, 224, "coordinate sign noise", "corrupt the bundled memory before querying", "noise", result.params.signNoise);
    panel(ctx, 18, 500, 884, 176, "what the record is storing", "the vector never contains fields, only a superposition");
    drawMemoryBarcode(ctx, result, 18, 500, 884, 176);
    label(ctx, "M = sum role_i * item_i", 42, 548, COLORS.text, 15, 800);
    label(ctx, "query_i = role_i * M = item_i + crosstalk", 42, 578, COLORS.text, 15, 800);
    label(ctx, "cleanup chooses the nearest known item vector", 42, 608, COLORS.muted, 13, 700);
    label(ctx, "D=" + result.params.dimension + ", vocab=" + result.params.vocab + ", bindings=" + result.params.pairs + ", noise=" + result.params.signNoise + "%", 42, 638, COLORS.muted, 12, 650);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__hypervectorBindingLabResult = result;
  }

  function init(root) {
    if (!root || root.__hypervectorBindingLabInitialized) return;
    root.__hypervectorBindingLabInitialized = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function initAll() {
    global.document.querySelectorAll("[data-hypervector-binding-lab]").forEach(init);
  }

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.HypervectorBindingLab = api;
})(typeof window !== "undefined" ? window : globalThis);
