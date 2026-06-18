(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    build: "#0f766e",
    probe: "#2563eb",
    spill: "#b45309",
    warn: "#be123c",
    batch: "#7c3aed",
    softBuild: "#ecfdf5",
    softProbe: "#eff6ff",
    softSpill: "#fffbeb"
  };

  var DEFAULTS = {
    profile: "zipf",
    buildRows: 240000,
    probeRows: 620000,
    keys: 12000,
    memoryRows: 42000,
    skew: 95,
    seed: 29
  };

  var PROFILES = {
    uniform: "uniform keys",
    zipf: "long-tail keys",
    hot: "single hot key",
    burst: "two-cluster skew"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return min;
    return clamp(Math.round(n), min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var buildRows = clampInt(raw.buildRows == null ? DEFAULTS.buildRows : raw.buildRows, 20000, 800000);
    var probeRows = clampInt(raw.probeRows == null ? DEFAULTS.probeRows : raw.probeRows, 20000, 1600000);
    var keys = clampInt(raw.keys == null ? DEFAULTS.keys : raw.keys, 256, 65536);
    var profile = PROFILES[raw.profile] ? raw.profile : DEFAULTS.profile;
    return {
      profile: profile,
      buildRows: buildRows,
      probeRows: probeRows,
      keys: keys,
      memoryRows: clampInt(raw.memoryRows == null ? DEFAULTS.memoryRows : raw.memoryRows, 4000, Math.max(4000, buildRows)),
      skew: clampInt(raw.skew == null ? DEFAULTS.skew : raw.skew, 0, 180),
      seed: clampInt(raw.seed == null ? DEFAULTS.seed : raw.seed, 1, 9999)
    };
  }

  function mix32(x) {
    x = x >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function hashKey(key, seed) {
    return mix32((key * 0x9e3779b1) ^ (seed * 0x85ebca6b));
  }

  function nextPowerOfTwo(x) {
    var n = 1;
    while (n < x) n *= 2;
    return n;
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(digits == null ? 2 : digits) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(digits == null ? 1 : digits) + "k";
    return String(Math.round(value));
  }

  function exactNumber(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function profileWeight(index, n, params) {
    var rank = index + 1;
    var skew = params.skew / 100;
    if (params.profile === "uniform") return 1;
    if (params.profile === "zipf") return 1 / Math.pow(rank, 0.35 + 0.58 * skew);
    if (params.profile === "hot") {
      if (index === 0) return 1 + 55 * skew;
      return 1 / Math.pow(rank, 0.12 + 0.22 * skew);
    }
    var centerA = Math.max(1, Math.floor(n * 0.18));
    var centerB = Math.max(1, Math.floor(n * 0.71));
    var widthA = Math.max(3, Math.floor(n * (0.04 + 0.035 * (1 - Math.min(1, skew)))));
    var widthB = Math.max(3, Math.floor(n * (0.08 + 0.025 * (1 - Math.min(1, skew)))));
    var da = Math.abs(index - centerA) / widthA;
    var db = Math.abs(index - centerB) / widthB;
    return 0.12 + (1 + 4.5 * skew) * Math.exp(-da * da) + (0.7 + 3 * skew) * Math.exp(-db * db);
  }

  function makeCounts(rows, params, salt) {
    var weights = new Float64Array(params.keys);
    var total = 0;
    var i;
    for (i = 0; i < params.keys; i += 1) {
      var wobble = 0.82 + (hashKey(i + 1, params.seed + salt) % 1000) / 2500;
      var w = profileWeight(i, params.keys, params) * wobble;
      weights[i] = w;
      total += w;
    }

    var counts = new Uint32Array(params.keys);
    var fractions = [];
    var assigned = 0;
    for (i = 0; i < params.keys; i += 1) {
      var exact = rows * weights[i] / total;
      var count = Math.floor(exact);
      counts[i] = count;
      assigned += count;
      fractions.push({ key: i, frac: exact - count, tie: hashKey(i + 1, salt + 101) });
    }
    fractions.sort(function (a, b) { return b.frac - a.frac || a.tie - b.tie; });
    for (i = 0; i < rows - assigned; i += 1) counts[fractions[i].key] += 1;
    return counts;
  }

  function summarizeKeys(buildCounts, probeCounts, params) {
    var keys = [];
    var maxBuild = 0;
    var maxKey = 1;
    var joinRows = 0;
    for (var i = 0; i < params.keys; i += 1) {
      var b = buildCounts[i];
      var p = probeCounts[i];
      joinRows += b * p;
      if (b > 0 || p > 0) keys.push({ key: i + 1, build: b, probe: p, joinRows: b * p });
      if (b > maxBuild) {
        maxBuild = b;
        maxKey = i + 1;
      }
    }
    keys.sort(function (a, b) {
      return b.build - a.build || b.probe - a.probe || a.key - b.key;
    });
    return {
      maxBuild: maxBuild,
      maxKey: maxKey,
      joinRows: joinRows,
      topKeys: keys.slice(0, 12)
    };
  }

  function partitionCounts(buildCounts, probeCounts, batches, seed) {
    var build = new Float64Array(batches);
    var probe = new Float64Array(batches);
    var keyBatch = new Uint32Array(buildCounts.length);
    for (var i = 0; i < buildCounts.length; i += 1) {
      var batch = hashKey(i + 1, seed) & (batches - 1);
      keyBatch[i] = batch;
      build[batch] += buildCounts[i];
      probe[batch] += probeCounts[i];
    }
    return { build: build, probe: probe, keyBatch: keyBatch };
  }

  function maxOf(array) {
    var max = 0;
    var index = 0;
    for (var i = 0; i < array.length; i += 1) {
      if (array[i] > max) {
        max = array[i];
        index = i;
      }
    }
    return { value: max, index: index };
  }

  function computePlan(params, buildCounts, probeCounts, keySummary) {
    var capacity = Math.max(1, params.memoryRows);
    var original = nextPowerOfTwo(Math.max(1, Math.ceil(params.buildRows / capacity)));
    var batches = original;
    var history = [];
    var partitions;
    var maxBuild;
    var growthDisabled = false;
    var maxKeyTooLarge = keySummary.maxBuild > capacity;

    for (var step = 0; step < 16; step += 1) {
      partitions = partitionCounts(buildCounts, probeCounts, batches, params.seed);
      maxBuild = maxOf(partitions.build);
      history.push({
        batches: batches,
        maxBuild: maxBuild.value,
        maxBatch: maxBuild.index,
        averageBuild: params.buildRows / batches
      });
      if (maxBuild.value <= capacity) break;
      if (maxKeyTooLarge) {
        growthDisabled = true;
        break;
      }
      batches *= 2;
    }

    var batch0Build = partitions.build[0] || 0;
    var batch0Probe = partitions.probe[0] || 0;
    var batch0Resident = batch0Build <= capacity;
    var spilledBuild = params.buildRows - (batch0Resident ? batch0Build : 0);
    var spilledProbe = params.probeRows - (batch0Resident ? batch0Probe : 0);
    var tempWriteRows = batches === 1 ? 0 : spilledBuild + spilledProbe;
    var tempReadRows = tempWriteRows;
    var graceWriteRows = batches === 1 ? 0 : params.buildRows + params.probeRows;
    var graceReadRows = graceWriteRows;
    var maxProbe = maxOf(partitions.probe);
    var skewFactor = maxBuild.value / Math.max(1, params.buildRows / batches);

    return {
      originalBatches: original,
      batches: batches,
      growthEvents: Math.max(0, Math.round(Math.log2(batches / original))),
      history: history,
      partitions: partitions,
      batch0Resident: batch0Resident,
      batch0Build: batch0Build,
      batch0Probe: batch0Probe,
      maxBatch: maxBuild.index,
      maxBuildBatchRows: maxBuild.value,
      maxProbeBatchRows: maxProbe.value,
      skewFactor: skewFactor,
      fits: maxBuild.value <= capacity,
      growthDisabled: growthDisabled,
      maxKeyTooLarge: maxKeyTooLarge,
      tempWriteRows: tempWriteRows,
      tempReadRows: tempReadRows,
      graceTempRows: graceWriteRows + graceReadRows,
      hybridTempRows: tempWriteRows + tempReadRows
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var buildCounts = makeCounts(params.buildRows, params, 17);
    var probeCounts = makeCounts(params.probeRows, params, 43);
    var keySummary = summarizeKeys(buildCounts, probeCounts, params);
    var plan = computePlan(params, buildCounts, probeCounts, keySummary);
    var result = {
      params: params,
      profileLabel: PROFILES[params.profile],
      buildCounts: buildCounts,
      probeCounts: probeCounts,
      keySummary: keySummary,
      plan: plan,
      audit: null
    };
    result.audit = audit(result);
    return result;
  }

  function sumCounts(array) {
    var sum = 0;
    for (var i = 0; i < array.length; i += 1) sum += array[i];
    return sum;
  }

  function isPowerOfTwo(x) {
    return x > 0 && (x & (x - 1)) === 0;
  }

  function audit(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var p = result.params;
    var plan = result.plan;
    check("build rows preserved", sumCounts(result.buildCounts) === p.buildRows);
    check("probe rows preserved", sumCounts(result.probeCounts) === p.probeRows);
    check("batch count power of two", isPowerOfTwo(plan.batches) && isPowerOfTwo(plan.originalBatches));
    check("partition build rows preserved", Math.round(sumCounts(plan.partitions.build)) === p.buildRows);
    check("partition probe rows preserved", Math.round(sumCounts(plan.partitions.probe)) === p.probeRows);
    check("temp accounting nonnegative", plan.tempWriteRows >= 0 && plan.tempReadRows >= 0);
    check("hybrid does not spill more than grace", plan.hybridTempRows <= plan.graceTempRows);
    check("fits or has skew explanation", plan.fits || plan.maxKeyTooLarge || plan.growthDisabled);
    check("top key count agrees", result.keySummary.maxBuild === result.keySummary.topKeys[0].build);
    var uniform = evaluateTiny({ profile: "uniform", buildRows: 64000, probeRows: 128000, keys: 8192, memoryRows: 16000, skew: 0, seed: 5 });
    check("uniform case fits after batching", uniform.plan.fits && uniform.plan.batches <= 8);
    var hot = evaluateTiny({ profile: "hot", buildRows: 100000, probeRows: 100000, keys: 4096, memoryRows: 12000, skew: 180, seed: 9 });
    check("hot key can exceed memory", hot.plan.maxKeyTooLarge && !hot.plan.fits);
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function evaluateTiny(raw) {
    var params = cleanParams(raw);
    var buildCounts = makeCounts(params.buildRows, params, 17);
    var probeCounts = makeCounts(params.probeRows, params, 43);
    var keySummary = summarizeKeys(buildCounts, probeCounts, params);
    return {
      params: params,
      buildCounts: buildCounts,
      probeCounts: probeCounts,
      keySummary: keySummary,
      plan: computePlan(params, buildCounts, probeCounts, keySummary)
    };
  }

  function auditGrid() {
    var cases = [
      { profile: "uniform", buildRows: 120000, probeRows: 260000, keys: 12000, memoryRows: 40000, skew: 0, seed: 3 },
      { profile: "zipf", buildRows: 240000, probeRows: 620000, keys: 12000, memoryRows: 42000, skew: 95, seed: 29 },
      { profile: "hot", buildRows: 220000, probeRows: 500000, keys: 9000, memoryRows: 35000, skew: 140, seed: 41 },
      { profile: "burst", buildRows: 360000, probeRows: 700000, keys: 16000, memoryRows: 56000, skew: 120, seed: 77 }
    ].map(function (params) {
      var result = evaluate(params);
      return {
        actualBatches: result.plan.batches,
        buildRows: result.params.buildRows,
        failedChecks: result.audit.checks
          .filter(function (row) { return !row.ok; })
          .map(function (row) { return row.name; }),
        fits: result.plan.fits,
        growthEvents: result.plan.growthEvents,
        hybridTempRows: result.plan.hybridTempRows,
        maxBuildBatchRows: result.plan.maxBuildBatchRows,
        memoryRows: result.params.memoryRows,
        originalBatches: result.plan.originalBatches,
        passed: result.audit.passed,
        probeRows: result.params.probeRows,
        profile: result.params.profile,
        topBuildKeyRows: result.keySummary.maxBuild
      };
    });
    return {
      cases: cases,
      passed: cases.filter(function (row) { return row.passed; }).length,
      total: cases.length
    };
  }

  function metric(label, value, className) {
    return '<div class="hash-join-lab__metric ' + (className || "") + '"><span>' +
      label + "</span><strong>" + value + "</strong></div>";
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = options.align || "left";
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
    text(ctx, title, box.x + 14, box.y + 18, { size: 12, weight: 800 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, { color: COLORS.muted, size: 10, weight: 600 });
  }

  function drawBatchHistogram(ctx, result, box) {
    panel(ctx, box, "build-side batches", "each bar must fit under the memory line");
    var plan = result.plan;
    var plot = { x: box.x + 34, y: box.y + 62, w: box.w - 62, h: box.h - 106 };
    var maxValue = Math.max(plan.maxBuildBatchRows, result.params.memoryRows);
    var count = plan.partitions.build.length;
    var barW = Math.max(2, plot.w / count - 1);
    for (var i = 0; i < count; i += 1) {
      var h = plan.partitions.build[i] / maxValue * plot.h;
      var x = plot.x + i / count * plot.w;
      ctx.fillStyle = plan.partitions.build[i] > result.params.memoryRows ? COLORS.warn : COLORS.build;
      ctx.globalAlpha = i === 0 && plan.batch0Resident ? 1 : 0.72;
      ctx.fillRect(x, plot.y + plot.h - h, barW, h);
      ctx.globalAlpha = 1;
    }
    var yMem = plot.y + plot.h - result.params.memoryRows / maxValue * plot.h;
    ctx.strokeStyle = COLORS.spill;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, yMem);
    ctx.lineTo(plot.x + plot.w, yMem);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    text(ctx, "memory " + formatNumber(result.params.memoryRows), plot.x + plot.w, yMem - 10, { color: COLORS.spill, size: 10, weight: 800, align: "right" });
    text(ctx, count + " batches", plot.x, box.y + box.h - 23, { color: COLORS.muted, size: 10, weight: 700 });
    text(ctx, "max " + formatNumber(plan.maxBuildBatchRows) + " rows", plot.x + plot.w, box.y + box.h - 23, { color: plan.fits ? COLORS.build : COLORS.warn, size: 10, weight: 800, align: "right" });
  }

  function drawGrowth(ctx, result, box) {
    panel(ctx, box, "executor growth", "estimated batches can double when the build table is larger than planned");
    var plot = { x: box.x + 44, y: box.y + 66, w: box.w - 76, h: box.h - 108 };
    var maxB = Math.max.apply(null, result.plan.history.map(function (row) { return row.maxBuild; }).concat([result.params.memoryRows]));
    var maxStep = Math.max(1, result.plan.history.length - 1);
    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var y = plot.y + g / 4 * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    var yMem = plot.y + plot.h - result.params.memoryRows / maxB * plot.h;
    ctx.strokeStyle = COLORS.spill;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, yMem);
    ctx.lineTo(plot.x + plot.w, yMem);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.batch;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.plan.history.forEach(function (row, i) {
      var x = plot.x + i / maxStep * plot.w;
      var y = plot.y + plot.h - row.maxBuild / maxB * plot.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    result.plan.history.forEach(function (row, i) {
      var x = plot.x + i / maxStep * plot.w;
      var y = plot.y + plot.h - row.maxBuild / maxB * plot.h;
      ctx.fillStyle = row.maxBuild > result.params.memoryRows ? COLORS.warn : COLORS.build;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(row.batches), x, plot.y + plot.h + 16, { color: COLORS.muted, size: 9, weight: 700, align: "center" });
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    text(ctx, "batches", plot.x + plot.w / 2, box.y + box.h - 22, { color: COLORS.muted, size: 10, weight: 700, align: "center" });
  }

  function drawIoLedger(ctx, result, box) {
    panel(ctx, box, "temporary I/O ledger", "rows written and read after the base scans");
    var plot = { x: box.x + 28, y: box.y + 68, w: box.w - 56, h: box.h - 112 };
    var rows = [
      { label: "hybrid write", value: result.plan.tempWriteRows, color: COLORS.spill },
      { label: "hybrid read", value: result.plan.tempReadRows, color: COLORS.batch },
      { label: "GRACE all temp", value: result.plan.graceTempRows, color: COLORS.probe }
    ];
    var max = Math.max.apply(null, rows.map(function (row) { return row.value; }).concat([1]));
    rows.forEach(function (row, i) {
      var y = plot.y + i * 52;
      var w = row.value / max * plot.w;
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(plot.x, y, plot.w, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, w, 18);
      text(ctx, row.label, plot.x, y - 13, { color: COLORS.text, size: 10, weight: 800 });
      text(ctx, formatNumber(row.value) + " rows", plot.x + Math.max(w, 4) + 7, y + 9, { color: row.color, size: 10, weight: 800 });
    });
    text(ctx, result.plan.batch0Resident ? "batch 0 stays memory-resident" : "batch 0 cannot stay resident", plot.x, box.y + box.h - 23, { color: result.plan.batch0Resident ? COLORS.build : COLORS.warn, size: 10, weight: 800 });
  }

  function drawTopKeys(ctx, result, box) {
    panel(ctx, box, "top build keys", "a single heavy key cannot be split by hash-batch doubling");
    var plot = { x: box.x + 34, y: box.y + 66, w: box.w - 60, h: box.h - 106 };
    var top = result.keySummary.topKeys.slice(0, 8);
    var max = Math.max.apply(null, top.map(function (row) { return row.build; }).concat([1]));
    top.forEach(function (row, i) {
      var y = plot.y + i * 27;
      var w = row.build / max * plot.w;
      ctx.fillStyle = row.build > result.params.memoryRows ? COLORS.warn : COLORS.build;
      ctx.fillRect(plot.x, y, w, 12);
      text(ctx, "k" + row.key, plot.x, y - 7, { color: COLORS.text, size: 9, weight: 800 });
      text(ctx, formatNumber(row.build), plot.x + Math.max(w, 4) + 6, y + 6, { color: row.build > result.params.memoryRows ? COLORS.warn : COLORS.muted, size: 9, weight: 700 });
    });
    text(ctx, "join output estimate " + formatNumber(result.keySummary.joinRows), plot.x, box.y + box.h - 22, { color: COLORS.muted, size: 10, weight: 700 });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    drawBatchHistogram(ctx, result, { x: 14, y: 14, w: 444, h: 292 });
    drawGrowth(ctx, result, { x: 14, y: 320, w: 444, h: height - 334 });
    drawIoLedger(ctx, result, { x: 472, y: 14, w: width - 486, h: 292 });
    drawTopKeys(ctx, result, { x: 472, y: 320, w: width - 486, h: height - 334 });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setOutputs(root, result) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "profile") output.textContent = result.profileLabel;
      else if (key === "skew") output.textContent = (result.params.skew / 100).toFixed(2);
      else output.textContent = exactNumber(result.params[key]);
    });
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("original batches", result.plan.originalBatches),
        metric("actual batches", result.plan.batches, result.plan.growthEvents ? "hash-join-lab__metric--warn" : ""),
        metric("max build batch", formatNumber(result.plan.maxBuildBatchRows), result.plan.fits ? "hash-join-lab__metric--good" : "hash-join-lab__metric--bad"),
        metric("temp rows", formatNumber(result.plan.hybridTempRows)),
        metric("top key", "k" + result.keySummary.maxKey + " / " + formatNumber(result.keySummary.maxBuild)),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "hash-join-lab__metric--good" : "hash-join-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      var status = result.plan.fits ? "all build batches fit" : "at least one build batch still exceeds memory";
      note.textContent = result.profileLabel + ": " + exactNumber(result.params.buildRows) +
        " build rows, " + exactNumber(result.params.probeRows) + " probe rows, memory for " +
        exactNumber(result.params.memoryRows) + " build rows. The planner-sized " +
        result.plan.originalBatches + " batches become " + result.plan.batches +
        "; " + status + ".";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__hashJoinSpillResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__hashJoinSpillReady) return;
    root.__hashJoinSpillReady = true;
    var timer = null;
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(root); }, 35);
      });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-hash-join-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-hash-join-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    cleanParams: cleanParams,
    makeCounts: makeCounts,
    partitionCounts: partitionCounts
  };

  global.HashJoinSpillLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
