(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    bucket: "#edf2f7",
    bucketStroke: "#cfd8e3",
    primary: "#0f766e",
    secondary: "#2563eb",
    amber: "#b45309",
    purple: "#7c3aed",
    red: "#be123c",
    empty: "#ffffff"
  };

  var DEFAULTS = {
    items: 450,
    targetLoad: 88,
    bucketSize: 4,
    bits: 10,
    maxKicks: 180,
    seed: 7
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      items: clamp(Math.round(Number(raw.items == null ? DEFAULTS.items : raw.items)), 40, 1400),
      targetLoad: clamp(Math.round(Number(raw.targetLoad == null ? DEFAULTS.targetLoad : raw.targetLoad)), 55, 96),
      bucketSize: clamp(Math.round(Number(raw.bucketSize == null ? DEFAULTS.bucketSize : raw.bucketSize)), 2, 8),
      bits: clamp(Math.round(Number(raw.bits == null ? DEFAULTS.bits : raw.bits)), 6, 16),
      maxKicks: clamp(Math.round(Number(raw.maxKicks == null ? DEFAULTS.maxKicks : raw.maxKicks)), 20, 500),
      seed: clamp(Math.round(Number(raw.seed == null ? DEFAULTS.seed : raw.seed)), 1, 9999)
    };
  }

  function hash32(value, seed) {
    var h = (value ^ seed ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function nextPowerOfTwo(value) {
    var x = 1;
    while (x < value) x *= 2;
    return x;
  }

  function bucketCount(params) {
    var desiredEntries = Math.ceil(params.items / (params.targetLoad / 100));
    return nextPowerOfTwo(Math.max(16, Math.ceil(desiredEntries / params.bucketSize)));
  }

  function capacity(params) {
    return bucketCount(params) * params.bucketSize;
  }

  function fingerprint(key, params) {
    var mask = (1 << params.bits) - 1;
    var fp = hash32(key + 0x1000003, params.seed ^ 0x6d2b79f5) & mask;
    return fp || 1;
  }

  function primaryIndex(key, params, buckets) {
    return hash32(key + 0x51ed270b, params.seed ^ 0x13579bdf) & (buckets - 1);
  }

  function fpStride(fp, params, buckets) {
    var stride = hash32(fp + 0x9e3779b9, params.seed ^ 0x2468ace0) & (buckets - 1);
    return stride || 1;
  }

  function altIndex(index, fp, params, buckets) {
    return (index ^ fpStride(fp, params, buckets)) & (buckets - 1);
  }

  function candidateBuckets(key, params, buckets) {
    var fp = fingerprint(key, params);
    var i1 = primaryIndex(key, params, buckets);
    return {
      fp: fp,
      i1: i1,
      i2: altIndex(i1, fp, params, buckets)
    };
  }

  function makeTable(params) {
    var buckets = bucketCount(params);
    var table = [];
    for (var i = 0; i < buckets; i += 1) {
      var bucket = [];
      for (var j = 0; j < params.bucketSize; j += 1) bucket.push(0);
      table.push(bucket);
    }
    return table;
  }

  function cloneTable(table) {
    return table.map(function (bucket) { return bucket.slice(); });
  }

  function findInBucket(bucket, fp) {
    for (var i = 0; i < bucket.length; i += 1) {
      if (bucket[i] === fp) return i;
    }
    return -1;
  }

  function emptySlot(bucket) {
    for (var i = 0; i < bucket.length; i += 1) {
      if (bucket[i] === 0) return i;
    }
    return -1;
  }

  function bucketLoad(bucket) {
    var n = 0;
    for (var i = 0; i < bucket.length; i += 1) if (bucket[i] !== 0) n += 1;
    return n;
  }

  function placeInBucket(table, index, fp) {
    var slot = emptySlot(table[index]);
    if (slot < 0) return false;
    table[index][slot] = fp;
    return true;
  }

  function queryWithInfo(table, key, params) {
    var buckets = table.length;
    var c = candidateBuckets(key, params, buckets);
    var b1 = table[c.i1];
    var b2 = table[c.i2];
    var hit1 = findInBucket(b1, c.fp) >= 0;
    var hit2 = c.i2 !== c.i1 && findInBucket(b2, c.fp) >= 0;
    return {
      result: hit1 || hit2,
      fp: c.fp,
      i1: c.i1,
      i2: c.i2,
      compared: bucketLoad(b1) + (c.i2 === c.i1 ? 0 : bucketLoad(b2))
    };
  }

  function query(table, key, params) {
    return queryWithInfo(table, key, params).result;
  }

  function insert(table, key, params, wantTrace) {
    var buckets = table.length;
    var c = candidateBuckets(key, params, buckets);
    var load1 = bucketLoad(table[c.i1]);
    var load2 = bucketLoad(table[c.i2]);
    var trace = [];

    if (placeInBucket(table, load1 <= load2 ? c.i1 : c.i2, c.fp)) {
      if (wantTrace) trace.push({ step: 0, bucket: load1 <= load2 ? c.i1 : c.i2, fp: c.fp, action: "placed" });
      return { ok: true, kicks: 0, trace: trace, fp: c.fp, i1: c.i1, i2: c.i2 };
    }
    if (placeInBucket(table, load1 <= load2 ? c.i2 : c.i1, c.fp)) {
      if (wantTrace) trace.push({ step: 0, bucket: load1 <= load2 ? c.i2 : c.i1, fp: c.fp, action: "placed" });
      return { ok: true, kicks: 0, trace: trace, fp: c.fp, i1: c.i1, i2: c.i2 };
    }

    var index = (hash32(key + 0x7f4a7c15, params.seed) & 1) ? c.i1 : c.i2;
    var fp = c.fp;
    for (var kick = 0; kick < params.maxKicks; kick += 1) {
      var slot = hash32(key + kick * 0x45d9f3b, params.seed ^ fp ^ index) % params.bucketSize;
      var victim = table[index][slot];
      table[index][slot] = fp;
      if (wantTrace && trace.length < 24) {
        trace.push({ step: kick + 1, bucket: index, slot: slot, fp: fp, victim: victim, action: "kick" });
      }
      fp = victim;
      index = altIndex(index, fp, params, buckets);
      if (placeInBucket(table, index, fp)) {
        if (wantTrace && trace.length < 24) trace.push({ step: kick + 1, bucket: index, fp: fp, action: "placed" });
        return { ok: true, kicks: kick + 1, trace: trace, fp: c.fp, i1: c.i1, i2: c.i2 };
      }
    }

    if (wantTrace && trace.length < 24) trace.push({ step: params.maxKicks, bucket: index, fp: fp, action: "gave up" });
    return { ok: false, kicks: params.maxKicks, trace: trace, fp: c.fp, i1: c.i1, i2: c.i2 };
  }

  function remove(table, key, params) {
    var buckets = table.length;
    var c = candidateBuckets(key, params, buckets);
    var b1 = table[c.i1];
    var s1 = findInBucket(b1, c.fp);
    if (s1 >= 0) {
      b1[s1] = 0;
      return true;
    }
    var b2 = table[c.i2];
    var s2 = findInBucket(b2, c.fp);
    if (s2 >= 0) {
      b2[s2] = 0;
      return true;
    }
    return false;
  }

  function loadStats(table) {
    var entries = 0;
    var fullBuckets = 0;
    var hist = [];
    for (var i = 0; i <= table[0].length; i += 1) hist.push(0);
    table.forEach(function (bucket) {
      var load = bucketLoad(bucket);
      entries += load;
      hist[load] += 1;
      if (load === bucket.length) fullBuckets += 1;
    });
    return {
      entries: entries,
      load: entries / (table.length * table[0].length),
      fullBuckets: fullBuckets,
      hist: hist
    };
  }

  function buildFilter(params, options) {
    options = options || {};
    var table = makeTable(params);
    var inserted = 0;
    var totalKicks = 0;
    var maxKicks = 0;
    var longest = null;
    var failure = null;

    for (var key = 0; key < params.items; key += 1) {
      var result = insert(table, key, params, true);
      if (!longest || result.kicks >= longest.kicks) longest = result;
      if (!result.ok) {
        failure = { key: key, result: result };
        break;
      }
      inserted += 1;
      totalKicks += result.kicks;
      maxKicks = Math.max(maxKicks, result.kicks);
    }

    var falseNegatives = 0;
    for (var i = 0; i < inserted; i += 1) {
      if (!query(table, i, params)) falseNegatives += 1;
    }

    return {
      params: params,
      table: table,
      inserted: inserted,
      success: inserted === params.items,
      failure: failure,
      totalKicks: totalKicks,
      avgKicks: inserted ? totalKicks / inserted : 0,
      maxKicks: maxKicks,
      longest: longest,
      falseNegatives: falseNegatives,
      stats: loadStats(table),
      probes: options.probes || 20000
    };
  }

  function falsePositiveAudit(build, probes) {
    var params = build.params;
    var falsePositives = 0;
    var compared = 0;
    var firstFalsePositive = null;
    for (var i = 0; i < probes; i += 1) {
      var key = 10000019 + i * 17 + params.items * 131;
      var info = queryWithInfo(build.table, key, params);
      compared += info.compared;
      if (info.result) {
        falsePositives += 1;
        if (!firstFalsePositive) firstFalsePositive = { key: key, fp: info.fp, i1: info.i1, i2: info.i2 };
      }
    }
    var avgCompared = probes ? compared / probes : 0;
    var perEntryMiss = 1 - 1 / Math.pow(2, params.bits);
    return {
      probes: probes,
      falsePositives: falsePositives,
      rate: probes ? falsePositives / probes : 0,
      avgCompared: avgCompared,
      modelRate: 1 - Math.pow(perEntryMiss, avgCompared),
      upperBound: 1 - Math.pow(perEntryMiss, 2 * params.bucketSize),
      firstFalsePositive: firstFalsePositive
    };
  }

  function deletionAudit(build) {
    if (!build.success || build.inserted < 8) return { attempted: false, ok: false };
    var params = build.params;
    var table = cloneTable(build.table);
    var keys = [
      0,
      Math.floor(build.inserted / 3),
      Math.floor((2 * build.inserted) / 3),
      build.inserted - 1
    ];
    var removed = 0;
    keys.forEach(function (key) {
      if (remove(table, key, params)) removed += 1;
    });
    var survivorsOk = true;
    for (var key = 0; key < build.inserted; key += 1) {
      if (keys.indexOf(key) >= 0) continue;
      if (!query(table, key, params)) {
        survivorsOk = false;
        break;
      }
    }
    return {
      attempted: true,
      ok: removed === keys.length && survivorsOk,
      removed: removed,
      keys: keys
    };
  }

  function sweepBits(params) {
    var out = [];
    for (var bits = 6; bits <= 16; bits += 1) {
      var p = normalize({
        items: Math.min(params.items, 520),
        targetLoad: params.targetLoad,
        bucketSize: params.bucketSize,
        bits: bits,
        maxKicks: params.maxKicks,
        seed: params.seed + bits * 97
      });
      var build = buildFilter(p, { probes: 8192 });
      var fp = falsePositiveAudit(build, 8192);
      out.push({
        bits: bits,
        success: build.success,
        load: build.stats.load,
        rate: fp.rate,
        bound: fp.upperBound,
        bitsPerItem: build.success ? (bucketCount(p) * p.bucketSize * p.bits) / p.items : null
      });
    }
    return out;
  }

  function auditResult(result) {
    var params = result.params;
    var checks = [];

    function check(name, passed) {
      checks.push({ name: name, passed: !!passed });
    }

    check("build succeeds", result.build.success);
    check("no inserted key is lost", result.build.falseNegatives === 0);
    check("deleting known keys preserves other known keys", result.deleteAudit.ok);

    var buckets = bucketCount(params);
    for (var key = 0; key < Math.min(128, params.items); key += 1) {
      var c = candidateBuckets(key, params, buckets);
      check("alternate bucket is an involution for key " + key, altIndex(c.i2, c.fp, params, buckets) === c.i1);
    }

    if (result.build.success) {
      check("observed false positives stay within a loose sampling guard", result.fp.rate <= Math.max(0.02, result.fp.upperBound * 3.5));
    }

    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var build = buildFilter(params);
    var fp = falsePositiveAudit(build, build.probes);
    var deleteAudit = deletionAudit(build);
    var result = {
      params: params,
      build: build,
      fp: fp,
      deleteAudit: deleteAudit,
      bitsPerItem: (bucketCount(params) * params.bucketSize * params.bits) / Math.max(1, params.items),
      bloomBitsPerItemAtObserved: fp.rate > 0 ? 1.44 * Math.log2(1 / fp.rate) : Infinity,
      sweep: sweepBits(params)
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditGrid() {
    var cases = [
      {},
      { items: 160, targetLoad: 84, bucketSize: 2, bits: 9, seed: 11 },
      { items: 640, targetLoad: 90, bucketSize: 4, bits: 11, seed: 23 },
      { items: 360, targetLoad: 82, bucketSize: 8, bits: 10, seed: 31 }
    ];
    return cases.map(function (row) { return evaluate(row).audit; });
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 2 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatFp(fp, bits) {
    var width = Math.ceil(bits / 4);
    return "0x" + fp.toString(16).toUpperCase().padStart(width, "0");
  }

  function metric(label, value) {
    return '<div class="cuckoo-filter-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 900));
    var cssHeight = cssWidth < 680 ? 760 : 620;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 750);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, COLORS.muted, 11, 560);
  }

  function drawBucketGrid(ctx, box, result) {
    panel(ctx, box, "bucket occupancy", "each column is a bucket; filled cells store fingerprints");
    var table = result.build.table;
    var params = result.params;
    var rows = params.bucketSize;
    var cols = table.length;
    var left = box.x + 14;
    var top = box.y + 60;
    var w = box.w - 28;
    var h = box.h - 82;
    var cellW = Math.max(2, w / cols);
    var cellH = Math.max(8, Math.min(18, h / rows));
    var yStart = top + Math.max(0, (h - rows * cellH) / 2);
    for (var c = 0; c < cols; c += 1) {
      for (var r = 0; r < rows; r += 1) {
        var fp = table[c][r];
        var x = left + c * cellW;
        var y = yStart + r * cellH;
        ctx.fillStyle = fp ? (r % 2 ? COLORS.secondary : COLORS.primary) : COLORS.bucket;
        ctx.globalAlpha = fp ? 0.82 : 1;
        ctx.fillRect(x, y, Math.max(1, cellW - 0.5), Math.max(5, cellH - 1));
        ctx.globalAlpha = 1;
      }
    }

    var sample = candidateBuckets(Math.floor(result.params.items * 0.37), result.params, table.length);
    [sample.i1, sample.i2].forEach(function (bucket, index) {
      var x = left + bucket * cellW + cellW / 2;
      ctx.strokeStyle = index ? COLORS.purple : COLORS.amber;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, yStart - 8);
      ctx.lineTo(x, yStart + rows * cellH + 8);
      ctx.stroke();
    });
    text(ctx, "sample lookup fp " + formatFp(sample.fp, params.bits), left, box.y + box.h - 14, COLORS.muted, 11, 600);
  }

  function drawKickTrace(ctx, box, result) {
    panel(ctx, box, "relocation trace", "longest insertion path in this build");
    var trace = result.build.longest ? result.build.longest.trace : [];
    var left = box.x + 14;
    var top = box.y + 62;
    var w = box.w - 28;
    var rowH = 19;
    if (!trace.length) {
      text(ctx, "no kicks needed", left, top, COLORS.muted, 12, 600);
      return;
    }
    trace.slice(0, 12).forEach(function (step, i) {
      var y = top + i * rowH;
      var color = step.action === "placed" ? COLORS.primary : (step.action === "gave up" ? COLORS.red : COLORS.amber);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(left + 5, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      var label = step.action === "kick"
        ? "kick bucket " + step.bucket + ", slot " + step.slot + ", move " + formatFp(step.victim, result.params.bits)
        : step.action + " in bucket " + step.bucket;
      text(ctx, label, left + 16, y, COLORS.text, 11, 600);
    });
    if (trace.length > 12) text(ctx, "+" + (trace.length - 12) + " more relocations", left + 16, top + 12 * rowH, COLORS.muted, 11, 600);
    text(ctx, "max kicks: " + result.build.maxKicks + "; average: " + formatNumber(result.build.avgKicks, 3), left, box.y + box.h - 14, COLORS.muted, 11, 600);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left + Math.min(w, 160), box.y + 56);
    ctx.lineTo(left + Math.min(w, 160), box.y + box.h - 28);
    ctx.stroke();
  }

  function drawFalsePositiveSweep(ctx, box, result) {
    panel(ctx, box, "fingerprint bits", "observed absent-query rate against the two-bucket bound");
    var data = result.sweep;
    var left = box.x + 46;
    var right = box.x + box.w - 16;
    var top = box.y + 58;
    var bottom = box.y + box.h - 34;
    var maxRate = 0.08;
    data.forEach(function (d) {
      maxRate = Math.max(maxRate, d.rate || 0, d.bound || 0);
    });
    function x(bits) {
      return left + ((bits - 6) / 10) * (right - left);
    }
    function y(rate) {
      var v = Math.log10(Math.max(rate, 0.00004));
      var lo = Math.log10(0.00004);
      var hi = Math.log10(maxRate);
      return bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.stroke();
    [6, 8, 10, 12, 14, 16].forEach(function (bits) {
      text(ctx, String(bits), x(bits), bottom + 18, COLORS.muted, 10, 600, "center");
    });
    [0.04, 0.01, 0.0025, 0.0006].forEach(function (rate) {
      if (rate <= maxRate) text(ctx, formatPercent(rate, rate < 0.01 ? 2 : 1), left - 8, y(rate) + 3, COLORS.muted, 10, 600, "right");
    });
    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach(function (d, i) {
        var px = x(d.bits);
        var py = y(d[key]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    line("bound", COLORS.amber);
    line("rate", COLORS.primary);
    data.forEach(function (d) {
      ctx.fillStyle = d.success ? COLORS.primary : COLORS.red;
      ctx.beginPath();
      ctx.arc(x(d.bits), y(d.rate), 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    text(ctx, "observed", right - 94, top + 16, COLORS.primary, 11, 700);
    text(ctx, "bound", right - 94, top + 32, COLORS.amber, 11, 700);
  }

  function drawLoadHistogram(ctx, box, result) {
    panel(ctx, box, "bucket load", "how close the table is to the cliff");
    var hist = result.build.stats.hist;
    var max = hist.reduce(function (a, b) { return Math.max(a, b); }, 1);
    var left = box.x + 34;
    var bottom = box.y + box.h - 34;
    var top = box.y + 58;
    var barGap = 8;
    var barW = (box.w - 68 - barGap * (hist.length - 1)) / hist.length;
    hist.forEach(function (count, load) {
      var h = (count / max) * (bottom - top);
      var x = left + load * (barW + barGap);
      ctx.fillStyle = load === hist.length - 1 ? COLORS.red : COLORS.secondary;
      ctx.globalAlpha = load === hist.length - 1 ? 0.75 : 0.68;
      ctx.fillRect(x, bottom - h, Math.max(6, barW), h);
      ctx.globalAlpha = 1;
      text(ctx, String(load), x + Math.max(6, barW) / 2, bottom + 17, COLORS.muted, 10, 600, "center");
    });
    text(ctx, "entries per bucket", left, bottom + 32, COLORS.muted, 10, 600);
    text(ctx, result.build.stats.fullBuckets + " full buckets", box.x + box.w - 16, top + 8, COLORS.red, 11, 700, "right");
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (width < 680) {
      var gap = 14;
      drawBucketGrid(ctx, { x: 0, y: 0, w: width, h: 220 }, result);
      drawKickTrace(ctx, { x: 0, y: 220 + gap, w: width, h: 190 }, result);
      drawFalsePositiveSweep(ctx, { x: 0, y: 410 + 2 * gap, w: width, h: 190 }, result);
      drawLoadHistogram(ctx, { x: 0, y: 600 + 3 * gap, w: width, h: height - 600 - 3 * gap }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.56);
      var rightW = width - leftW - gap2;
      drawBucketGrid(ctx, { x: 0, y: 0, w: leftW, h: height }, result);
      drawKickTrace(ctx, { x: leftW + gap2, y: 0, w: rightW, h: 188 }, result);
      drawFalsePositiveSweep(ctx, { x: leftW + gap2, y: 188 + gap2, w: rightW, h: 214 }, result);
      drawLoadHistogram(ctx, { x: leftW + gap2, y: 402 + 2 * gap2, w: rightW, h: height - 402 - 2 * gap2 }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      items: String(result.params.items),
      targetLoad: result.params.targetLoad + "%",
      bucketSize: String(result.params.bucketSize),
      bits: String(result.params.bits),
      maxKicks: String(result.params.maxKicks),
      seed: String(result.params.seed)
    };
    Object.keys(values).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && input.value !== String(result.params[key])) input.value = String(result.params[key]);
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Build", result.build.success ? result.build.inserted + " inserted" : "failed at " + result.build.inserted),
        metric("Load", formatPercent(result.build.stats.load, 1)),
        metric("Observed FPR", formatPercent(result.fp.rate, 2)),
        metric("2-bucket bound", formatPercent(result.fp.upperBound, 2)),
        metric("Bits/key", formatNumber(result.bitsPerItem, 2)),
        metric("Deletes", result.deleteAudit.ok ? "known keys ok" : "not audited"),
        metric("Audit", result.audit.passed ? "passed" : "check")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      var fp = result.fp.firstFalsePositive;
      note.textContent = fp
        ? "First absent hit in the deterministic probe set: key " + fp.key + " shares fingerprint " + formatFp(fp.fp, result.params.bits) + " with one of buckets " + fp.i1 + " or " + fp.i2 + "."
        : "No false positive appeared in this deterministic probe set; the model still budgets for them.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__cuckooFilterResult = result;
  }

  function init(root) {
    if (!root || root.__cuckooFilterReady) return;
    root.__cuckooFilterReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-cuckoo-filter-lab]")).forEach(init);
  }

  var api = {
    altIndex: altIndex,
    auditGrid: auditGrid,
    bucketCount: bucketCount,
    candidateBuckets: candidateBuckets,
    evaluate: evaluate,
    fingerprint: fingerprint,
    insert: insert,
    query: query,
    remove: remove
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CuckooFilterLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
