(function (root) {
  "use strict";

  var CHUNK = 65536;
  var BITMAP_BYTES = CHUNK / 8;
  var ARRAY_OVERHEAD = 8;
  var BITMAP_OVERHEAD = 8;
  var RUN_OVERHEAD = 8;

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    array: "#2563eb",
    bitmap: "#be123c",
    run: "#0f766e",
    union: "#7c3aed",
    intersect: "#d97706",
    a: "#2563eb",
    b: "#d97706"
  };

  var DEFAULTS = {
    chunks: 6,
    profile: "mixed",
    density: 42,
    shift: 17,
    seed: 23
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanProfile(value) {
    return value === "sparse" || value === "dense" || value === "runs" ? value : "mixed";
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      chunks: snap(raw.chunks, DEFAULTS.chunks, 1, 10, 1),
      profile: cleanProfile(raw.profile || DEFAULTS.profile),
      density: snap(raw.density, DEFAULTS.density, 5, 95, 1),
      shift: snap(raw.shift, DEFAULTS.shift, 0, 63, 1),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1)
    };
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sortedUnique(values) {
    values.sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < values.length; i += 1) {
      if (i === 0 || values[i] !== values[i - 1]) out.push(values[i]);
    }
    return out;
  }

  function insertRun(values, start, length, stride) {
    var end = Math.min(CHUNK, start + Math.max(0, length));
    stride = Math.max(1, stride || 1);
    for (var v = Math.max(0, start); v < end; v += stride) values.push(v);
  }

  function sparseValues(rand, count) {
    var values = [];
    var seen = Object.create(null);
    while (values.length < count) {
      var v = Math.floor(rand() * CHUNK);
      if (!seen[v]) {
        seen[v] = true;
        values.push(v);
      }
    }
    return sortedUnique(values);
  }

  function runValues(rand, count, density, salt) {
    var values = [];
    var runs = Math.max(2, Math.round(2 + density / 7 + (salt % 3)));
    var average = Math.max(3, Math.floor(count / runs));
    for (var r = 0; r < runs; r += 1) {
      var start = Math.floor(rand() * (CHUNK - 32));
      var length = Math.max(2, Math.floor(average * (0.45 + rand() * 1.4)));
      insertRun(values, start, length, 1);
    }
    return sortedUnique(values).slice(0, Math.min(CHUNK, count * 2));
  }

  function denseValues(rand, density, salt) {
    var values = [];
    var step = Math.max(2, Math.round(26 - density / 4));
    var offset = Math.floor(rand() * step);
    for (var v = offset; v < CHUNK; v += step) values.push(v);
    var windows = 2 + (salt % 3);
    var windowLen = Math.floor(750 + density * 34);
    for (var w = 0; w < windows; w += 1) {
      insertRun(values, Math.floor(rand() * (CHUNK - windowLen - 1)), windowLen, 1);
    }
    return sortedUnique(values);
  }

  function valuesForChunk(profile, chunk, params, salt) {
    var rand = makeRng(params.seed * 1000003 + chunk * 9176 + salt * 131 + params.density * 17);
    var mode = profile;
    if (profile === "mixed") {
      mode = ["sparse", "runs", "dense", "runs"][chunk % 4];
    }
    var baseCount = Math.round(24 + params.density * (mode === "sparse" ? 9 : 44));
    if (mode === "sparse") return sparseValues(rand, Math.min(3500, baseCount));
    if (mode === "runs") return runValues(rand, Math.min(22000, baseCount * 2), params.density, chunk + salt);
    return denseValues(rand, params.density, chunk + salt);
  }

  function shiftedValues(values, shift) {
    if (shift === 0) return values.slice();
    var delta = shift * 257;
    return sortedUnique(values.map(function (value) {
      return (value + delta) & 0xffff;
    }));
  }

  function makeChunkPairs(params) {
    params = cleanParams(params);
    var chunks = [];
    for (var key = 0; key < params.chunks; key += 1) {
      var a = valuesForChunk(params.profile, key, params, 11);
      var bBase = valuesForChunk(params.profile, key, params, 29);
      var b = shiftedValues(bBase, params.shift);
      chunks.push({ key: key, a: a, b: b });
    }
    return chunks;
  }

  function runsFromValues(values) {
    var runs = [];
    if (!values.length) return runs;
    var start = values[0];
    var prev = values[0];
    for (var i = 1; i < values.length; i += 1) {
      if (values[i] === prev + 1) {
        prev = values[i];
      } else {
        runs.push({ start: start, length: prev - start + 1 });
        start = values[i];
        prev = values[i];
      }
    }
    runs.push({ start: start, length: prev - start + 1 });
    return runs;
  }

  function estimate(values) {
    var cardinality = values.length;
    var runs = runsFromValues(values);
    var arrayBytes = ARRAY_OVERHEAD + 2 * cardinality;
    var bitmapBytes = BITMAP_OVERHEAD + BITMAP_BYTES;
    var runBytes = RUN_OVERHEAD + 4 * runs.length;
    var type = "array";
    var bytes = arrayBytes;
    if (bitmapBytes < bytes) {
      type = "bitmap";
      bytes = bitmapBytes;
    }
    if (runBytes < bytes) {
      type = "run";
      bytes = runBytes;
    }
    return {
      arrayBytes: arrayBytes,
      bitmapBytes: bitmapBytes,
      runBytes: runBytes,
      bytes: bytes,
      cardinality: cardinality,
      runs: runs,
      runCount: runs.length,
      type: type
    };
  }

  function setUnion(a, b) {
    var out = [];
    var i = 0;
    var j = 0;
    while (i < a.length || j < b.length) {
      if (j >= b.length || (i < a.length && a[i] < b[j])) out.push(a[i++]);
      else if (i >= a.length || b[j] < a[i]) out.push(b[j++]);
      else {
        out.push(a[i]);
        i += 1;
        j += 1;
      }
    }
    return out;
  }

  function setIntersection(a, b) {
    var out = [];
    var i = 0;
    var j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] < b[j]) i += 1;
      else if (b[j] < a[i]) j += 1;
      else {
        out.push(a[i]);
        i += 1;
        j += 1;
      }
    }
    return out;
  }

  function setDifference(a, b) {
    var out = [];
    var i = 0;
    var j = 0;
    while (i < a.length) {
      if (j >= b.length || a[i] < b[j]) out.push(a[i++]);
      else if (b[j] < a[i]) j += 1;
      else {
        i += 1;
        j += 1;
      }
    }
    return out;
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  function naive(values) {
    var out = Object.create(null);
    values.forEach(function (value) { out[value] = true; });
    return out;
  }

  function naiveUnion(a, b) {
    var seen = naive(a);
    b.forEach(function (value) { seen[value] = true; });
    return Object.keys(seen).map(Number).sort(function (x, y) { return x - y; });
  }

  function naiveIntersection(a, b) {
    var seen = naive(a);
    return b.filter(function (value) { return !!seen[value]; });
  }

  function summarizeContainers(chunks) {
    var counts = { array: 0, bitmap: 0, run: 0 };
    var bytes = 0;
    var cardinality = 0;
    chunks.forEach(function (chunk) {
      counts[chunk.type] += 1;
      bytes += chunk.bytes;
      cardinality += chunk.cardinality;
    });
    return { counts: counts, bytes: bytes, cardinality: cardinality };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var pairs = makeChunkPairs(params);
    var chunks = [];
    pairs.forEach(function (pair) {
      var union = setUnion(pair.a, pair.b);
      var intersection = setIntersection(pair.a, pair.b);
      var onlyA = setDifference(pair.a, pair.b);
      chunks.push({
        key: pair.key,
        a: Object.assign({ values: pair.a }, estimate(pair.a)),
        b: Object.assign({ values: pair.b }, estimate(pair.b)),
        union: Object.assign({ values: union }, estimate(union)),
        intersection: Object.assign({ values: intersection }, estimate(intersection)),
        onlyA: Object.assign({ values: onlyA }, estimate(onlyA))
      });
    });
    return {
      params: params,
      chunks: chunks,
      a: summarizeContainers(chunks.map(function (chunk) { return chunk.a; })),
      b: summarizeContainers(chunks.map(function (chunk) { return chunk.b; })),
      union: summarizeContainers(chunks.map(function (chunk) { return chunk.union; })),
      intersection: summarizeContainers(chunks.map(function (chunk) { return chunk.intersection; })),
      onlyA: summarizeContainers(chunks.map(function (chunk) { return chunk.onlyA; }))
    };
  }

  function validSorted(values) {
    for (var i = 0; i < values.length; i += 1) {
      if (values[i] < 0 || values[i] >= CHUNK || !Number.isInteger(values[i])) return false;
      if (i && values[i] <= values[i - 1]) return false;
    }
    return true;
  }

  function runAudit() {
    var checked = 0;
    var failures = [];

    function check(name, ok, detail) {
      checked += 1;
      if (!ok) failures.push({ name: name, detail: detail || null });
    }

    var cleaned = cleanParams({ chunks: 99, profile: "bad", density: -20, shift: 999, seed: "x" });
    check("parameters snap into supported ranges", cleaned.chunks === 10 &&
      cleaned.profile === "mixed" &&
      cleaned.density === 5 &&
      cleaned.shift === 63 &&
      cleaned.seed === DEFAULTS.seed, cleaned);

    check("run extraction coalesces adjacent values", (function () {
      var runs = runsFromValues([1, 2, 3, 8, 10, 11]);
      return runs.length === 3 && runs[0].start === 1 && runs[0].length === 3 &&
        runs[2].start === 10 && runs[2].length === 2;
    })());

    check("container estimates prefer sparse arrays", estimate([1, 10, 100]).type === "array");
    check("container estimates prefer full bitmaps over arrays", estimate(Array.from({ length: 5000 }, function (_, i) { return i * 7; })).type === "bitmap");
    check("container estimates prefer long runs", estimate(Array.from({ length: 4000 }, function (_, i) { return 1000 + i; })).type === "run");

    var simpleA = [1, 2, 5, 8];
    var simpleB = [2, 3, 8, 9];
    check("union is exact on a small hand case", arraysEqual(setUnion(simpleA, simpleB), [1, 2, 3, 5, 8, 9]));
    check("intersection is exact on a small hand case", arraysEqual(setIntersection(simpleA, simpleB), [2, 8]));
    check("difference is exact on a small hand case", arraysEqual(setDifference(simpleA, simpleB), [1, 5]));

    var result = evaluate(DEFAULTS);
    check("default has the requested chunk count", result.chunks.length === DEFAULTS.chunks);
    check("default chunk values are sorted unique 16-bit integers", result.chunks.every(function (chunk) {
      return validSorted(chunk.a.values) && validSorted(chunk.b.values) &&
        validSorted(chunk.union.values) && validSorted(chunk.intersection.values);
    }));
    check("default set operations match naive algebra", result.chunks.every(function (chunk) {
      return arraysEqual(chunk.union.values, naiveUnion(chunk.a.values, chunk.b.values)) &&
        arraysEqual(chunk.intersection.values, naiveIntersection(chunk.a.values, chunk.b.values));
    }));
    check("union/intersection cardinalities satisfy inclusion-exclusion", result.chunks.every(function (chunk) {
      return chunk.union.cardinality + chunk.intersection.cardinality === chunk.a.cardinality + chunk.b.cardinality;
    }));
    check("summary bytes and cardinalities add by chunk", result.union.bytes === result.chunks.reduce(function (sum, chunk) {
      return sum + chunk.union.bytes;
    }, 0) && result.union.cardinality === result.chunks.reduce(function (sum, chunk) {
      return sum + chunk.union.cardinality;
    }, 0));
    check("default uses at least two container kinds", (function () {
      var kinds = Object.keys(result.union.counts).filter(function (key) { return result.union.counts[key] > 0; });
      return kinds.length >= 2;
    })(), result.union.counts);
    check("intersection is smaller than union by cardinality and bytes", result.intersection.cardinality <= result.union.cardinality &&
      result.intersection.bytes <= result.union.bytes, {
        intersection: result.intersection,
        union: result.union
      });

    var gridCases = 0;
    var gridOk = 0;
    ["mixed", "sparse", "runs", "dense"].forEach(function (profile) {
      [1, 3, 7, 10].forEach(function (chunks) {
        [8, 31, 66, 92].forEach(function (density) {
          [0, 11, 41].forEach(function (shift) {
            [5, 71].forEach(function (seed) {
              gridCases += 1;
              var item = evaluate({ profile: profile, chunks: chunks, density: density, shift: shift, seed: seed });
              var ok = item.chunks.length === chunks &&
                item.chunks.every(function (chunk) {
                  return validSorted(chunk.a.values) &&
                    validSorted(chunk.b.values) &&
                    arraysEqual(chunk.union.values, naiveUnion(chunk.a.values, chunk.b.values)) &&
                    arraysEqual(chunk.intersection.values, naiveIntersection(chunk.a.values, chunk.b.values)) &&
                    chunk.union.cardinality + chunk.intersection.cardinality === chunk.a.cardinality + chunk.b.cardinality &&
                    chunk.union.bytes > 0 &&
                    chunk.a.bytes > 0 &&
                    chunk.b.bytes > 0;
                });
              if (ok) gridOk += 1;
            });
          });
        });
      });
    });
    check("384-case Roaring grid is valid", gridCases === 384 && gridOk === 384, {
      gridCases: gridCases,
      gridOk: gridOk
    });

    return {
      ok: checked - failures.length,
      cases: checked,
      passed: checked - failures.length,
      checked: checked,
      gridCases: gridCases,
      failures: failures,
      defaultFacts: {
        chunks: result.params.chunks,
        aCardinality: result.a.cardinality,
        bCardinality: result.b.cardinality,
        unionCardinality: result.union.cardinality,
        intersectionCardinality: result.intersection.cardinality,
        aBytes: result.a.bytes,
        bBytes: result.b.bytes,
        unionBytes: result.union.bytes,
        intersectionBytes: result.intersection.bytes,
        unionArrays: result.union.counts.array,
        unionBitmaps: result.union.counts.bitmap,
        unionRuns: result.union.counts.run
      }
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function formatNumber(value, digits) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: digits == null ? 0 : digits,
      minimumFractionDigits: digits == null ? 0 : digits
    });
  }

  function metric(label, value) {
    return '<div class="roaring-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.floor(rect.width || 900));
    var height = width < 620 ? 1100 : 840;
    var dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawPanel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 21, COLORS.text, 13, 800);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 42, COLORS.muted, 11, 600);
  }

  function colorFor(type) {
    return type === "bitmap" ? COLORS.bitmap : (type === "run" ? COLORS.run : COLORS.array);
  }

  function drawContainerGrid(ctx, box, result) {
    drawPanel(ctx, box.x, box.y, box.w, box.h, "Container choices by 16-bit chunk", "array, bitmap, or run depending on local shape");
    var rows = [
      { label: "A", key: "a", color: COLORS.a },
      { label: "B", key: "b", color: COLORS.b },
      { label: "A union B", key: "union", color: COLORS.union },
      { label: "A intersect B", key: "intersection", color: COLORS.intersect }
    ];
    var x = box.x + 86;
    var y = box.y + 76;
    var w = box.w - 108;
    var cellW = w / result.chunks.length;
    var rowH = Math.min(42, (box.h - 108) / rows.length);

    rows.forEach(function (row, r) {
      var yy = y + r * rowH;
      drawText(ctx, row.label, box.x + 18, yy + rowH / 2, COLORS.text, 11, 800);
      result.chunks.forEach(function (chunk, i) {
        var item = chunk[row.key];
        var xx = x + i * cellW + 2;
        ctx.fillStyle = colorFor(item.type);
        ctx.fillRect(xx, yy + 4, Math.max(8, cellW - 4), rowH - 8);
        drawText(ctx, item.type[0].toUpperCase(), xx + (cellW - 4) / 2, yy + rowH / 2, "#ffffff", 11, 900, "center");
      });
    });

    result.chunks.forEach(function (chunk, i) {
      drawText(ctx, String(chunk.key), x + i * cellW + cellW / 2, box.y + box.h - 22, COLORS.muted, 10, 700, "center");
    });
    drawText(ctx, "chunk key", x + w, box.y + box.h - 22, COLORS.muted, 10, 700, "right");
  }

  function drawBytes(ctx, box, result) {
    var bars = [
      { label: "A", value: result.a.bytes, color: COLORS.a },
      { label: "B", value: result.b.bytes, color: COLORS.b },
      { label: "union", value: result.union.bytes, color: COLORS.union },
      { label: "intersect", value: result.intersection.bytes, color: COLORS.intersect }
    ];
    var maxValue = Math.max.apply(null, bars.map(function (bar) { return bar.value; }));
    var x = box.x + 20;
    var y = box.y + 76;
    var w = box.w - 40;
    var barH = 34;
    var gap = 18;
    drawPanel(ctx, box.x, box.y, box.w, box.h, "Estimated bytes", "container-local byte model, summed across chunks");
    bars.forEach(function (bar, i) {
      var yy = y + i * (barH + gap);
      drawText(ctx, bar.label, x, yy - 10, COLORS.muted, 11, 750);
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(x, yy, w, barH);
      ctx.fillStyle = bar.color;
      ctx.fillRect(x, yy, w * bar.value / maxValue, barH);
      drawText(ctx, formatNumber(bar.value) + " B", x + w - 8, yy + barH / 2, "#ffffff", 12, 850, "right");
    });
  }

  function drawRunStrips(ctx, box, result) {
    drawPanel(ctx, box.x, box.y, box.w, box.h, "Run geometry in the union", "long contiguous streaks become cheap run containers");
    var x = box.x + 20;
    var y = box.y + 72;
    var w = box.w - 40;
    var rowH = Math.min(28, (box.h - 96) / result.chunks.length);
    result.chunks.forEach(function (chunk, i) {
      var yy = y + i * rowH;
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(x, yy + rowH / 2 - 3, w, 6);
      chunk.union.runs.slice(0, 220).forEach(function (run) {
        ctx.fillStyle = colorFor(chunk.union.type);
        var rx = x + w * run.start / CHUNK;
        var rw = Math.max(1, w * run.length / CHUNK);
        ctx.fillRect(rx, yy + 4, rw, rowH - 8);
      });
      drawText(ctx, "c" + chunk.key + " " + chunk.union.type + " " + chunk.union.cardinality, x, yy + rowH / 2, COLORS.text, 10, 750);
    });
  }

  function drawLedger(ctx, box, result) {
    drawPanel(ctx, box.x, box.y, box.w, box.h, "Operation ledger", "exact cardinalities and chosen container counts");
    var rows = [
      { label: "A", item: result.a, color: COLORS.a },
      { label: "B", item: result.b, color: COLORS.b },
      { label: "union", item: result.union, color: COLORS.union },
      { label: "intersection", item: result.intersection, color: COLORS.intersect }
    ];
    var x = box.x + 18;
    var y = box.y + 70;
    var cols = [0, box.w * 0.26, box.w * 0.45, box.w * 0.62, box.w * 0.77];
    var rowH = 32;
    ["set", "card", "bytes", "A/B/R", "bytes/card"].forEach(function (head, i) {
      drawText(ctx, head, x + cols[i], y - 16, COLORS.muted, 10, 800);
    });
    rows.forEach(function (row, i) {
      var yy = y + i * rowH;
      ctx.fillStyle = i % 2 ? "#ffffff" : "rgba(237,242,247,0.62)";
      ctx.fillRect(box.x + 10, yy - 14, box.w - 20, rowH - 2);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, yy - 6, 8, 8);
      drawText(ctx, row.label, x + 14, yy, COLORS.text, 11, 800);
      drawText(ctx, formatNumber(row.item.cardinality), x + cols[1], yy, COLORS.text, 11, 700);
      drawText(ctx, formatNumber(row.item.bytes), x + cols[2], yy, COLORS.text, 11, 700);
      drawText(ctx, row.item.counts.array + "/" + row.item.counts.bitmap + "/" + row.item.counts.run, x + cols[3], yy, COLORS.text, 11, 700);
      drawText(ctx, (row.item.bytes / Math.max(1, row.item.cardinality)).toFixed(2), x + cols[4], yy, COLORS.text, 11, 700);
    });
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    var gap = 14;
    if (w < 620) {
      var panelH = (h - 5 * gap) / 4;
      drawContainerGrid(ctx, { x: 0, y: 0, w: w, h: panelH }, result);
      drawBytes(ctx, { x: 0, y: panelH + gap, w: w, h: panelH }, result);
      drawRunStrips(ctx, { x: 0, y: 2 * (panelH + gap), w: w, h: panelH }, result);
      drawLedger(ctx, { x: 0, y: 3 * (panelH + gap), w: w, h: panelH }, result);
      return;
    }

    var topH = 370;
    var bottomH = h - topH - gap;
    drawContainerGrid(ctx, { x: 0, y: 0, w: w * 0.58 - gap / 2, h: topH }, result);
    drawBytes(ctx, { x: w * 0.58 + gap / 2, y: 0, w: w * 0.42 - gap / 2, h: topH }, result);
    drawRunStrips(ctx, { x: 0, y: topH + gap, w: w * 0.47 - gap / 2, h: bottomH }, result);
    drawLedger(ctx, { x: w * 0.47 + gap / 2, y: topH + gap, w: w * 0.53 - gap / 2, h: bottomH }, result);
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-output]").forEach(function (output) {
      var key = output.getAttribute("data-output");
      output.textContent = params[key];
    });
  }

  function render(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    var result = evaluate(raw);
    updateOutputs(container, result.params);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      var audit = cachedAudit();
      metrics.innerHTML = [
        metric("A cardinality", formatNumber(result.a.cardinality)),
        metric("union cardinality", formatNumber(result.union.cardinality)),
        metric("intersection", formatNumber(result.intersection.cardinality)),
        metric("union bytes", formatNumber(result.union.bytes)),
        metric("containers A/B/R", result.union.counts.array + "/" + result.union.counts.bitmap + "/" + result.union.counts.run),
        metric("Audit", audit.passed + "/" + audit.checked)
      ].join("");
    }
    draw(result, container.querySelector("canvas[data-canvas]"));
  }

  function mount(container) {
    var schedule = null;
    function requestRender() {
      if (schedule != null) root.cancelAnimationFrame(schedule);
      schedule = root.requestAnimationFrame(function () {
        schedule = null;
        render(container);
      });
    }
    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    root.addEventListener("resize", requestRender);
    requestRender();
  }

  var api = {
    DEFAULTS: DEFAULTS,
    cleanParams: cleanParams,
    runsFromValues: runsFromValues,
    estimate: estimate,
    setUnion: setUnion,
    setIntersection: setIntersection,
    evaluate: evaluate,
    runAudit: runAudit
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RoaringBitmapLab = api;

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", function () {
        root.document.querySelectorAll("[data-roaring-lab]").forEach(mount);
      });
    } else {
      root.document.querySelectorAll("[data-roaring-lab]").forEach(mount);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
