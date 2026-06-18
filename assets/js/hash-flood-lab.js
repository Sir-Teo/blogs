(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    weak: "#be123c",
    keyed: "#0f766e",
    random: "#2563eb",
    amber: "#b45309",
    purple: "#6d28d9",
    white: "#ffffff"
  };

  var DEFAULTS = {
    scenario: "flood",
    keys: 512,
    buckets: 128,
    seed: 17,
    lookupMix: 35
  };

  var SCENARIOS = {
    flood: "same weak checksum",
    random: "ordinary keys",
    mixed: "flood plus ordinary keys"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    return {
      scenario: scenario,
      keys: Math.round(clamp(finite(Number(raw.keys), DEFAULTS.keys), 64, 2048)),
      buckets: Math.round(clamp(finite(Number(raw.buckets), DEFAULTS.buckets), 32, 512)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 9999)),
      lookupMix: Math.round(clamp(finite(Number(raw.lookupMix), DEFAULTS.lookupMix), 0, 100))
    };
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function randUnit(index, seed) {
    return (hash32(index + 1, seed) + 0.5) / 4294967297;
  }

  function weakChecksum(text, seed) {
    var h = seed & 0xffff;
    for (var i = 0; i < text.length; i += 1) h = (h + text.charCodeAt(i)) & 0xffff;
    return h >>> 0;
  }

  function keyedToyHash(text, seed) {
    var h = (0x811c9dc5 ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
    for (var i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i) & 255;
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= h >>> 13;
    }
    h ^= text.length * 0x85ebca6b;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function collidingKey(index) {
    var alphabet = 13;
    var x = index;
    var out = "";
    for (var i = 0; i < 5; i += 1) {
      var d = x % alphabet;
      x = Math.floor(x / alphabet);
      out += String.fromCharCode(97 + d);
      out += String.fromCharCode(122 - d);
    }
    return out;
  }

  function ordinaryKey(index, seed) {
    var h = hash32(index * 2654435761, seed ^ 0x51a7);
    var out = "k";
    for (var i = 0; i < 8; i += 1) {
      var c = 97 + (h % 26);
      out += String.fromCharCode(c);
      h = hash32(h + i + 1, seed ^ (i * 0x9e37));
    }
    return out + index.toString(36);
  }

  function buildKeys(params) {
    var keys = [];
    var floodCount = params.scenario === "random" ? 0 : params.keys;
    if (params.scenario === "mixed") floodCount = Math.round(params.keys * 0.45);
    for (var i = 0; i < floodCount; i += 1) keys.push({ key: collidingKey(i), kind: "flood" });
    for (var j = floodCount; j < params.keys; j += 1) keys.push({ key: ordinaryKey(j, params.seed), kind: "ordinary" });
    return keys;
  }

  function emptyBuckets(count) {
    var buckets = [];
    for (var i = 0; i < count; i += 1) buckets.push([]);
    return buckets;
  }

  function insertAll(keys, params, hashFn) {
    var buckets = emptyBuckets(params.buckets);
    var comparisons = 0;
    var trace = [];
    keys.forEach(function (row, index) {
      var bucketIndex = hashFn(row.key, params.seed) % params.buckets;
      var chain = buckets[bucketIndex];
      comparisons += chain.length;
      chain.push(row.key);
      trace.push({
        index: index + 1,
        comparisons: comparisons,
        maxBucket: maxBucketLength(buckets),
        bucket: bucketIndex
      });
    });
    return { buckets: buckets, comparisons: comparisons, trace: trace };
  }

  function maxBucketLength(buckets) {
    var max = 0;
    buckets.forEach(function (bucket) { if (bucket.length > max) max = bucket.length; });
    return max;
  }

  function nonEmptyBuckets(buckets) {
    return buckets.filter(function (bucket) { return bucket.length > 0; }).length;
  }

  function bucketLengths(buckets) {
    return buckets.map(function (bucket) { return bucket.length; });
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var at = (sorted.length - 1) * p;
    var lo = Math.floor(at);
    var hi = Math.ceil(at);
    var t = at - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function lookupCost(buckets, key, params, hashFn) {
    var bucketIndex = hashFn(key, params.seed) % params.buckets;
    var chain = buckets[bucketIndex];
    for (var i = 0; i < chain.length; i += 1) {
      if (chain[i] === key) return i + 1;
    }
    return chain.length;
  }

  function lookupStats(keys, table, params, hashFn) {
    var costs = [];
    var hitCount = Math.round(120 * (100 - params.lookupMix) / 100);
    var missCount = 120 - hitCount;
    for (var i = 0; i < hitCount; i += 1) {
      var hit = keys[Math.floor(randUnit(i, params.seed ^ 0xa11d) * keys.length) % keys.length];
      costs.push(lookupCost(table.buckets, hit.key, params, hashFn));
    }
    for (var j = 0; j < missCount; j += 1) {
      var miss = params.scenario === "flood" ? collidingKey(keys.length + j + 1) : ordinaryKey(500000 + j, params.seed);
      costs.push(lookupCost(table.buckets, miss, params, hashFn));
    }
    return {
      avg: mean(costs),
      p95: percentile(costs, 0.95),
      max: Math.max.apply(null, costs.concat([0]))
    };
  }

  function summarize(table, keys, params, hashFn) {
    var lengths = bucketLengths(table.buckets);
    var lookups = lookupStats(keys, table, params, hashFn);
    return {
      comparisons: table.comparisons,
      maxBucket: maxBucketLength(table.buckets),
      nonEmpty: nonEmptyBuckets(table.buckets),
      avgBucket: mean(lengths),
      p95Bucket: percentile(lengths, 0.95),
      lookupAvg: lookups.avg,
      lookupP95: lookups.p95,
      lookupMax: lookups.max
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var keys = buildKeys(params);
    var weak = insertAll(keys, params, weakChecksum);
    var keyed = insertAll(keys, params, keyedToyHash);
    var result = {
      params: params,
      keys: keys,
      weak: weak,
      keyed: keyed,
      weakSummary: summarize(weak, keys, params, weakChecksum),
      keyedSummary: summarize(keyed, keys, params, keyedToyHash)
    };
    result.audit = audit(result);
    return result;
  }

  function audit(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok, passed: !!ok });
    }
    var n = result.params.keys;
    check("weak rows match key count", result.weak.trace.length === n);
    check("keyed rows match key count", result.keyed.trace.length === n);
    check("comparison counts finite", Number.isFinite(result.weakSummary.comparisons) && Number.isFinite(result.keyedSummary.comparisons));
    check("bucket accounting weak", result.weak.buckets.reduce(function (sum, bucket) { return sum + bucket.length; }, 0) === n);
    check("bucket accounting keyed", result.keyed.buckets.reduce(function (sum, bucket) { return sum + bucket.length; }, 0) === n);
    if (result.params.scenario === "flood") {
      check("flood keys share one weak bucket", result.weakSummary.maxBucket === n && result.weakSummary.nonEmpty === 1);
      check("flood comparisons are triangular", result.weakSummary.comparisons === n * (n - 1) / 2);
      check("keyed mixer spreads flood set", result.keyedSummary.maxBucket < Math.max(16, n / 4));
    }
    check("lookup p95 finite", Number.isFinite(result.weakSummary.lookupP95) && Number.isFinite(result.keyedSummary.lookupP95));
    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function auditGrid() {
    var cases = [
      { scenario: "flood", keys: 512, buckets: 128, seed: 17, lookupMix: 35 },
      { scenario: "flood", keys: 1024, buckets: 256, seed: 91, lookupMix: 50 },
      { scenario: "mixed", keys: 768, buckets: 128, seed: 23, lookupMix: 20 },
      { scenario: "random", keys: 768, buckets: 128, seed: 23, lookupMix: 20 },
      { scenario: "flood", keys: 256, buckets: 64, seed: 404, lookupMix: 80 }
    ];
    var rows = cases.map(function (params, index) {
      var result = evaluate(params);
      var failedChecks = result.audit.checks.filter(function (row) { return !row.passed; }).map(function (row) { return row.name; });
      var passedChecks = result.audit.checks.filter(function (row) { return row.passed; }).length;
      return {
        caseId: index + 1,
        scenario: result.params.scenario,
        scenarioLabel: SCENARIOS[result.params.scenario],
        keys: result.params.keys,
        buckets: result.params.buckets,
        seed: result.params.seed,
        lookupMix: result.params.lookupMix,
        weakComparisons: result.weakSummary.comparisons,
        keyedComparisons: result.keyedSummary.comparisons,
        weakMaxBucket: result.weakSummary.maxBucket,
        keyedMaxBucket: result.keyedSummary.maxBucket,
        weakLookupP95: result.weakSummary.lookupP95,
        keyedLookupP95: result.keyedSummary.lookupP95,
        amplification: result.weakSummary.comparisons / Math.max(1, result.keyedSummary.comparisons),
        checks: result.audit.checks,
        passed: result.audit.passed,
        passedChecks: passedChecks,
        failedChecks: failedChecks,
        totalChecks: result.audit.checks.length
      };
    });
    var passed = rows.filter(function (row) { return row.passed; }).length;
    var passedChecks = rows.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = rows.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    var failures = rows.filter(function (row) { return !row.passed; }).map(function (row) {
      return {
        caseId: row.caseId,
        failedChecks: row.failedChecks,
        scenario: row.scenario
      };
    });
    return {
      cases: rows,
      failures: failures,
      ok: failures.length === 0 && passedChecks === totalChecks,
      passed: passed,
      passedChecks: passedChecks,
      total: rows.length,
      totalChecks: totalChecks
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(2) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    return value.toFixed(digits == null ? 0 : digits);
  }

  function metric(label, value, className) {
    return '<div class="hash-flood-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 18, COLORS.text, 12, 800);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, COLORS.muted, 10, 600);
  }

  function drawBucketPanel(ctx, result, box) {
    panel(ctx, box, "bucket occupancy", "same keys, two hash functions");
    var top = box.y + 58;
    var left = box.x + 18;
    var width = box.w - 36;
    var height = box.h - 96;
    var maxLen = Math.max(result.weakSummary.maxBucket, result.keyedSummary.maxBucket, 1);
    var rows = [
      { label: "weak checksum", buckets: result.weak.buckets, color: COLORS.weak },
      { label: "secret mixer toy", buckets: result.keyed.buckets, color: COLORS.keyed }
    ];
    rows.forEach(function (row, r) {
      var y = top + r * (height / 2 + 18);
      text(ctx, row.label, left, y - 14, row.color, 11, 800);
      var barTop = y;
      var barH = height / 2 - 18;
      var step = width / row.buckets.length;
      row.buckets.forEach(function (bucket, i) {
        var h = bucket.length / maxLen * barH;
        ctx.fillStyle = bucket.length ? row.color : COLORS.grid;
        ctx.globalAlpha = bucket.length ? 0.78 : 1;
        ctx.fillRect(left + i * step, barTop + barH - h, Math.max(1, step - 1), Math.max(1, h));
      });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, barTop, width, barH);
    });
    text(ctx, "max bucket = " + maxLen + " keys", box.x + box.w - 18, box.y + box.h - 24, COLORS.muted, 10, 650, "right");
  }

  function drawComparisonPanel(ctx, result, box) {
    panel(ctx, box, "insertion comparison debt", "chain scans accumulate as keys arrive");
    var plot = { x: box.x + 48, y: box.y + 58, w: box.w - 68, h: box.h - 90 };
    var maxY = Math.max(result.weakSummary.comparisons, result.keyedSummary.comparisons, 1);
    for (var g = 0; g <= 4; g += 1) {
      var gy = plot.y + plot.h - g * plot.h / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
      text(ctx, fmt(maxY * g / 4), plot.x - 8, gy, COLORS.muted, 9, 600, "right");
    }
    function drawTrace(trace, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      trace.forEach(function (row, i) {
        var x = plot.x + (row.index - 1) / Math.max(1, result.params.keys - 1) * plot.w;
        var y = plot.y + plot.h - row.comparisons / maxY * plot.h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    drawTrace(result.weak.trace, COLORS.weak, 2.6);
    drawTrace(result.keyed.trace, COLORS.keyed, 2.2);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    text(ctx, "weak checksum", plot.x + 8, box.y + box.h - 22, COLORS.weak, 10, 800);
    text(ctx, "secret mixer toy", plot.x + 120, box.y + box.h - 22, COLORS.keyed, 10, 800);
  }

  function drawLookupPanel(ctx, result, box) {
    panel(ctx, box, "lookup tail", "misses in a flooded bucket pay for every resident");
    var rows = [
      { label: "weak", summary: result.weakSummary, color: COLORS.weak },
      { label: "keyed", summary: result.keyedSummary, color: COLORS.keyed }
    ];
    var maxV = Math.max(result.weakSummary.lookupP95, result.keyedSummary.lookupP95, result.weakSummary.lookupMax, result.keyedSummary.lookupMax, 1);
    var left = box.x + 28;
    var top = box.y + 64;
    rows.forEach(function (row, i) {
      var y = top + i * 78;
      text(ctx, row.label, left, y, row.color, 12, 800);
      var p95W = (box.w - 160) * row.summary.lookupP95 / maxV;
      var maxW = (box.w - 160) * row.summary.lookupMax / maxV;
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(left + 70, y - 12, box.w - 160, 14);
      ctx.fillStyle = row.color;
      ctx.fillRect(left + 70, y - 12, p95W, 14);
      ctx.globalAlpha = 0.28;
      ctx.fillRect(left + 70, y + 10, maxW, 10);
      ctx.globalAlpha = 1;
      text(ctx, "p95 " + fmt(row.summary.lookupP95, 1) + ", max " + fmt(row.summary.lookupMax, 0), left + 76, y + 34, COLORS.muted, 10, 650);
    });
    text(ctx, "lookup mix: " + result.params.lookupMix + "% misses", left, box.y + box.h - 24, COLORS.muted, 10, 650);
  }

  function drawLedgerPanel(ctx, result, box) {
    panel(ctx, box, "ledger", "the attacker is buying comparisons with bytes");
    var amp = result.weakSummary.comparisons / Math.max(1, result.keyedSummary.comparisons);
    var lines = [
      "keys: " + result.params.keys + " across " + result.params.buckets + " buckets",
      "weak comparisons: " + fmt(result.weakSummary.comparisons),
      "keyed comparisons: " + fmt(result.keyedSummary.comparisons),
      "amplification: " + fmt(amp, 1) + "x",
      "audit: " + (result.audit.passed ? "passed" : "check")
    ];
    lines.forEach(function (line, i) {
      text(ctx, line, box.x + 20, box.y + 62 + i * 25, i === 3 ? COLORS.purple : (i === 4 ? COLORS.keyed : COLORS.text), 12, i >= 3 ? 800 : 650);
    });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    var gap = 14;
    var topH = 330;
    var colW = (width - gap * 3) / 2;
    drawBucketPanel(ctx, result, { x: gap, y: gap, w: width - 2 * gap, h: topH });
    drawComparisonPanel(ctx, result, { x: gap, y: topH + 2 * gap, w: colW, h: height - topH - 3 * gap });
    drawLookupPanel(ctx, result, { x: 2 * gap + colW, y: topH + 2 * gap, w: colW, h: 210 });
    drawLedgerPanel(ctx, result, { x: 2 * gap + colW, y: topH + 3 * gap + 210, w: colW, h: height - topH - 4 * gap - 210 });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return normalize(raw);
  }

  function setOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      var value = params[key];
      if (key === "scenario") value = SCENARIOS[params.scenario];
      if (key === "lookupMix") value = value + "%";
      output.textContent = value;
    });
  }

  function render(root) {
    var params = readParams(root);
    setOutputs(root, params);
    var result = evaluate(params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var amp = result.weakSummary.comparisons / Math.max(1, result.keyedSummary.comparisons);
      metrics.innerHTML = [
        metric("weak max bucket", fmt(result.weakSummary.maxBucket), result.weakSummary.maxBucket > result.keyedSummary.maxBucket ? "hash-flood-lab__metric--bad" : ""),
        metric("keyed max bucket", fmt(result.keyedSummary.maxBucket), "hash-flood-lab__metric--good"),
        metric("weak insert scans", fmt(result.weakSummary.comparisons), "hash-flood-lab__metric--bad"),
        metric("keyed insert scans", fmt(result.keyedSummary.comparisons), "hash-flood-lab__metric--good"),
        metric("amplification", fmt(amp, 1) + "x", amp > 8 ? "hash-flood-lab__metric--bad" : ""),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "hash-flood-lab__metric--good" : "hash-flood-lab__metric--bad")
      ].join("");
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__hashFloodResult = result;
  }

  function init(root) {
    if (!root || root.__hashFloodReady) return;
    root.__hashFloodReady = true;
    var timer = null;
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(root); }, 40);
      });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-hash-flood-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-hash-flood-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    collidingKey: collidingKey,
    weakChecksum: weakChecksum,
    keyedToyHash: keyedToyHash,
    normalize: normalize
  };

  global.HashFloodLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
