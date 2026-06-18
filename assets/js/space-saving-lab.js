(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    exact: "#334155",
    counter: "#0f766e",
    upper: "#2563eb",
    lower: "#15803d",
    warning: "#b45309",
    miss: "#be123c",
    query: "#7c3aed",
    softGreen: "#ecfdf5",
    softBlue: "#eff6ff",
    softAmber: "#fffbeb"
  };

  var DEFAULTS = {
    events: 50000,
    vocabulary: 2000,
    skew: 105,
    counters: 64,
    threshold: 12,
    topK: 10,
    queryRank: 8,
    drift: 25,
    seed: 41
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return min;
    return clamp(Math.round(n), min, max);
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var vocabulary = clampInt(finite(raw.vocabulary, DEFAULTS.vocabulary), 100, 8000);
    return {
      events: clampInt(finite(raw.events, DEFAULTS.events), 5000, 120000),
      vocabulary: vocabulary,
      skew: clampInt(finite(raw.skew, DEFAULTS.skew), 0, 160),
      counters: clampInt(finite(raw.counters, DEFAULTS.counters), 8, Math.min(160, vocabulary)),
      threshold: clampInt(finite(raw.threshold, DEFAULTS.threshold), 2, 60),
      topK: clampInt(finite(raw.topK, DEFAULTS.topK), 3, 25),
      queryRank: clampInt(finite(raw.queryRank, DEFAULTS.queryRank), 1, 40),
      drift: clampInt(finite(raw.drift, DEFAULTS.drift), 0, 100),
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

  function makeWeights(vocabulary, skew) {
    var exponent = skew / 100;
    var cdf = new Float64Array(vocabulary);
    var total = 0;
    for (var i = 0; i < vocabulary; i += 1) {
      total += exponent === 0 ? 1 : 1 / Math.pow(i + 1, exponent);
      cdf[i] = total;
    }
    for (var j = 0; j < vocabulary; j += 1) cdf[j] /= total;
    return cdf;
  }

  function sampleCdf(cdf, u) {
    var lo = 0;
    var hi = cdf.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (cdf[mid] >= u) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  function findMinSlot(slots) {
    var best = 0;
    for (var i = 1; i < slots.length; i += 1) {
      var a = slots[i];
      var b = slots[best];
      if (
        a.count < b.count ||
        (a.count === b.count && a.touched < b.touched) ||
        (a.count === b.count && a.touched === b.touched && a.slot < b.slot)
      ) {
        best = i;
      }
    }
    return best;
  }

  function updateSpaceSaving(state, item, time) {
    var slotIndex = state.index.get(item);
    if (slotIndex != null) {
      var existing = state.slots[slotIndex];
      existing.count += 1;
      existing.touched = time;
      return;
    }

    if (state.slots.length < state.capacity) {
      var created = {
        count: 1,
        error: 0,
        firstSeen: time,
        item: item,
        replacements: 0,
        slot: state.slots.length,
        touched: time
      };
      state.index.set(item, created.slot);
      state.slots.push(created);
      return;
    }

    var minIndex = findMinSlot(state.slots);
    var victim = state.slots[minIndex];
    state.index.delete(victim.item);
    state.evictions += 1;
    state.replacementMass += victim.count;

    state.slots[minIndex] = {
      count: victim.count + 1,
      error: victim.count,
      firstSeen: time,
      item: item,
      replacements: victim.replacements + 1,
      slot: victim.slot,
      touched: time
    };
    state.index.set(item, minIndex);
  }

  function rankItems(counts) {
    var rows = [];
    for (var item = 0; item < counts.length; item += 1) {
      if (counts[item] > 0) rows.push({ item: item, count: counts[item] });
    }
    rows.sort(function (a, b) {
      return b.count - a.count || a.item - b.item;
    });
    return rows;
  }

  function generate(raw) {
    var params = cleanParams(raw);
    var rng = makeRng(params.seed);
    var cdf = makeWeights(params.vocabulary, params.skew);
    var exact = new Uint32Array(params.vocabulary);
    var state = {
      capacity: params.counters,
      evictions: 0,
      index: new Map(),
      replacementMass: 0,
      slots: []
    };
    var shift = Math.round(params.vocabulary * params.drift / 100);

    for (var i = 0; i < params.events; i += 1) {
      var item = sampleCdf(cdf, rng());
      if (shift > 0 && i >= params.events / 2) item = (item + shift) % params.vocabulary;
      exact[item] += 1;
      updateSpaceSaving(state, item, i + 1);
    }

    return {
      exact: exact,
      params: params,
      state: state
    };
  }

  function monitoredRows(data) {
    var rows = data.state.slots.map(function (slot) {
      var exact = data.exact[slot.item] || 0;
      return {
        count: slot.count,
        error: slot.error,
        exact: exact,
        item: slot.item,
        lower: slot.count - slot.error,
        replacements: slot.replacements,
        slot: slot.slot,
        touched: slot.touched,
        upper: slot.count
      };
    });
    rows.sort(function (a, b) {
      return b.count - a.count || a.error - b.error || a.item - b.item;
    });
    return rows;
  }

  function summarizeThreshold(exactRows, monitored, thresholdCount, minCount) {
    var monitoredSet = new Set(monitored.map(function (row) { return row.item; }));
    var trueHeavyRows = exactRows.filter(function (row) { return row.count >= thresholdCount; });
    var reported = monitored.filter(function (row) { return row.count >= thresholdCount; });
    var guaranteed = monitored.filter(function (row) { return row.lower >= thresholdCount; });
    var misses = trueHeavyRows.filter(function (row) { return !monitoredSet.has(row.item); });
    var falsePositive = reported.filter(function (row) { return row.exact < thresholdCount; });
    var uncertain = reported.filter(function (row) { return row.lower < thresholdCount; });
    return {
      falsePositive: falsePositive.length,
      guaranteed: guaranteed.length,
      misses: misses.length,
      noMissCondition: thresholdCount > minCount,
      reported: reported.length,
      thresholdCount: thresholdCount,
      trueHeavy: trueHeavyRows.length,
      uncertain: uncertain.length
    };
  }

  function membershipFromRows(rows) {
    var set = new Set();
    rows.forEach(function (row) { set.add(row.item); });
    return set;
  }

  function topKStats(exactRows, monitored, k) {
    var exactTop = exactRows.slice(0, k);
    var monitoredTop = monitored.slice(0, k);
    var exactSet = membershipFromRows(exactTop);
    var overlap = 0;
    monitoredTop.forEach(function (row) {
      if (exactSet.has(row.item)) overlap += 1;
    });
    return {
      exactTop: exactTop,
      monitoredTop: monitoredTop,
      overlap: overlap,
      precision: monitoredTop.length ? overlap / monitoredTop.length : 0,
      recall: exactTop.length ? overlap / exactTop.length : 0
    };
  }

  function auditResult(data, exactRows, monitored, minCount, threshold, topK) {
    var exactTotal = 0;
    for (var i = 0; i < data.exact.length; i += 1) exactTotal += data.exact[i];
    var counterTotal = data.state.slots.reduce(function (sum, row) { return sum + row.count; }, 0);
    var monitoredOk = monitored.every(function (row) {
      return row.lower <= row.exact && row.exact <= row.upper && row.error <= minCount;
    });
    var monitoredItems = membershipFromRows(monitored);
    var unmonitoredOk = true;
    for (var item = 0; item < data.exact.length; item += 1) {
      if (!monitoredItems.has(item) && data.exact[item] > minCount) {
        unmonitoredOk = false;
        break;
      }
    }
    var noMissOk = !threshold.noMissCondition || threshold.misses === 0;
    var guaranteedOk = monitored.every(function (row) {
      return row.lower < threshold.thresholdCount || row.exact >= threshold.thresholdCount;
    });
    var minBoundOk = minCount <= Math.ceil(data.params.events / data.params.counters);
    var topKBounded = topK.precision >= 0 && topK.precision <= 1 && topK.recall >= 0 && topK.recall <= 1;
    return {
      counterTotalOk: counterTotal === data.params.events && exactTotal === data.params.events,
      guaranteedOk: guaranteedOk,
      minBoundOk: minBoundOk,
      monitoredOk: monitoredOk,
      noMissOk: noMissOk,
      passed: counterTotal === data.params.events &&
        exactTotal === data.params.events &&
        monitoredOk &&
        unmonitoredOk &&
        noMissOk &&
        guaranteedOk &&
        minBoundOk &&
        topKBounded,
      topKBounded: topKBounded,
      unmonitoredOk: unmonitoredOk
    };
  }

  function auditChecks(audit) {
    return [
      { name: "counter-total", passed: audit.counterTotalOk },
      { name: "monitored-intervals", passed: audit.monitoredOk },
      { name: "unmonitored-min-bound", passed: audit.unmonitoredOk },
      { name: "threshold-no-miss", passed: audit.noMissOk },
      { name: "guaranteed-threshold", passed: audit.guaranteedOk },
      { name: "minimum-n-over-k", passed: audit.minBoundOk },
      { name: "top-k-range", passed: audit.topKBounded }
    ];
  }

  function failedAuditChecks(checks) {
    return checks.filter(function (check) { return !check.passed; }).map(function (check) { return check.name; });
  }

  function passedAuditChecks(checks) {
    return checks.filter(function (check) { return check.passed; }).length;
  }

  function evaluate(raw) {
    var data = generate(raw);
    var exactRows = rankItems(data.exact);
    var monitored = monitoredRows(data);
    var minCount = data.state.slots.length < data.params.counters
      ? 0
      : data.state.slots.reduce(function (m, row) { return Math.min(m, row.count); }, Infinity);
    if (!Number.isFinite(minCount)) minCount = 0;
    var thresholdCount = Math.ceil(data.params.events * data.params.threshold / 1000);
    var threshold = summarizeThreshold(exactRows, monitored, thresholdCount, minCount);
    var topK = topKStats(exactRows, monitored, data.params.topK);
    var queryIndex = clamp(data.params.queryRank - 1, 0, Math.max(0, exactRows.length - 1));
    var queryExact = exactRows[queryIndex] || { item: 0, count: 0 };
    var querySlot = monitored.filter(function (row) { return row.item === queryExact.item; })[0];
    var query = querySlot
      ? {
        count: querySlot.count,
        error: querySlot.error,
        exact: queryExact.count,
        item: queryExact.item,
        lower: querySlot.lower,
        monitored: true,
        rank: queryIndex + 1,
        upper: querySlot.upper
      }
      : {
        count: null,
        error: minCount,
        exact: queryExact.count,
        item: queryExact.item,
        lower: 0,
        monitored: false,
        rank: queryIndex + 1,
        upper: minCount
      };
    var audit = auditResult(data, exactRows, monitored, minCount, threshold, topK);

    return {
      audit: audit,
      exactRows: exactRows,
      minCount: minCount,
      monitored: monitored,
      params: data.params,
      query: query,
      state: data.state,
      threshold: threshold,
      thresholdCount: thresholdCount,
      topK: topK
    };
  }

  function runAudit() {
    var scenarios = [
      {},
      { events: 5000, vocabulary: 100, skew: 0, counters: 8, threshold: 20, drift: 0, seed: 1 },
      { events: 120000, vocabulary: 8000, skew: 160, counters: 160, threshold: 2, drift: 60, seed: 99 },
      { events: 25000, vocabulary: 500, skew: 85, counters: 24, threshold: 12, drift: 100, seed: 7 },
      { events: 70000, vocabulary: 2500, skew: 125, counters: 48, threshold: 8, drift: 35, seed: 211 }
    ];
    var cases = scenarios.map(function (params, index) {
      var result = evaluate(params);
      var checks = auditChecks(result.audit);
      var failedChecks = failedAuditChecks(checks);
      return {
        checks: checks,
        counters: result.params.counters,
        events: result.params.events,
        failedChecks: failedChecks,
        minCount: result.minCount,
        noMissCondition: result.threshold.noMissCondition,
        passed: checks.every(function (check) { return check.passed; }),
        passedChecks: passedAuditChecks(checks),
        reported: result.threshold.reported,
        scenario: index === 0 ? "default" : "stress-" + index,
        thresholdCount: result.thresholdCount,
        totalChecks: checks.length,
        trueHeavy: result.threshold.trueHeavy,
        vocabulary: result.params.vocabulary
      };
    });
    var deterministicA = evaluate(DEFAULTS);
    var deterministicB = evaluate(DEFAULTS);
    var deterministic = deterministicA.minCount === deterministicB.minCount &&
      deterministicA.query.item === deterministicB.query.item &&
      deterministicA.query.lower === deterministicB.query.lower &&
      deterministicA.query.upper === deterministicB.query.upper &&
      deterministicA.threshold.reported === deterministicB.threshold.reported;
    var deterministicChecks = [{ name: "fixed-seed-replay", passed: deterministic }];
    cases.push({
      checks: deterministicChecks,
      counters: deterministicA.params.counters,
      events: deterministicA.params.events,
      failedChecks: failedAuditChecks(deterministicChecks),
      minCount: deterministicA.minCount,
      noMissCondition: deterministicA.threshold.noMissCondition,
      passed: deterministic,
      passedChecks: passedAuditChecks(deterministicChecks),
      reported: deterministicA.threshold.reported,
      scenario: "fixed-seed-replay",
      thresholdCount: deterministicA.thresholdCount,
      totalChecks: deterministicChecks.length,
      trueHeavy: deterministicA.threshold.trueHeavy,
      vocabulary: deterministicA.params.vocabulary
    });
    var passed = cases.filter(function (row) { return row.passed; }).length;
    var passedChecks = cases.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = cases.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    var failures = cases.filter(function (row) { return !row.passed; }).map(function (row) {
      return {
        failedChecks: row.failedChecks,
        scenario: row.scenario
      };
    });
    return {
      cases: cases,
      details: cases,
      deterministic: deterministic,
      failures: failures,
      ok: passed === cases.length && passedChecks === totalChecks,
      passed: passed,
      passedChecks: passedChecks,
      totalChecks: totalChecks,
      total: cases.length
    };
  }

  function formatInt(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function fmt(value, digits) {
    return Number(value).toFixed(digits == null ? 2 : digits);
  }

  function pct(value) {
    return fmt(100 * value, 1) + "%";
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

  function drawTopPanel(ctx, result, box) {
    panel(ctx, box, "exact leaders", "bars show true counts; rings mark monitored keys");
    var rows = result.exactRows.slice(0, Math.min(12, result.exactRows.length));
    var plot = { x: box.x + 74, y: box.y + 66, w: box.w - 102, h: box.h - 95 };
    var max = rows.length ? rows[0].count : 1;
    var barArea = Math.max(40, plot.w - 56);
    var monitoredSet = membershipFromRows(result.monitored);
    rows.forEach(function (row, i) {
      var y = plot.y + i * plot.h / rows.length;
      var h = Math.max(8, plot.h / rows.length - 5);
      var barW = row.count / max * barArea;
      text(ctx, "#" + row.item, plot.x - 10, y + h / 2, 10, COLORS.muted, 650, "right", "middle");
      ctx.fillStyle = COLORS.exact;
      ctx.fillRect(plot.x, y, barW, h);
      if (monitoredSet.has(row.item)) {
        ctx.strokeStyle = COLORS.counter;
        ctx.lineWidth = 2;
        ctx.strokeRect(plot.x - 2, y - 2, barW + 4, h + 4);
      }
      var label = formatInt(row.count);
      text(ctx, label, plot.x + barW + 6, y + h / 2, 10, COLORS.text, 650, "left", "middle");
    });
    ctx.lineWidth = 1;
  }

  function drawCounterPanel(ctx, result, box) {
    panel(ctx, box, "counter receipts", "stored estimate interval = [count - error, count]");
    var rows = result.monitored.slice(0, Math.min(10, result.monitored.length));
    var plot = { x: box.x + 74, y: box.y + 70, w: box.w - 102, h: box.h - 104 };
    var max = rows.reduce(function (m, row) { return Math.max(m, row.count); }, 1);
    var barArea = Math.max(44, plot.w - 88);
    rows.forEach(function (row, i) {
      var y = plot.y + i * plot.h / rows.length;
      var h = Math.max(9, plot.h / rows.length - 6);
      var lowerW = row.lower / max * barArea;
      var upperW = row.upper / max * barArea;
      text(ctx, "#" + row.item, plot.x - 10, y + h / 2, 10, COLORS.muted, 650, "right", "middle");
      ctx.fillStyle = COLORS.softBlue;
      ctx.fillRect(plot.x, y, upperW, h);
      ctx.fillStyle = COLORS.counter;
      ctx.fillRect(plot.x, y, Math.max(1, lowerW), h);
      ctx.strokeStyle = COLORS.upper;
      ctx.strokeRect(plot.x, y, upperW, h);
      var label = formatInt(row.lower) + "-" + formatInt(row.upper);
      text(ctx, label, plot.x + upperW + 6, y + h / 2, 10, COLORS.text, 650, "left", "middle");
    });
    ctx.fillStyle = COLORS.softAmber;
    roundedRect(ctx, box.x + 16, box.y + box.h - 34, box.w - 32, 22, 6);
    ctx.fill();
    text(ctx, "current minimum counter: " + formatInt(result.minCount), box.x + 28, box.y + box.h - 19, 10, COLORS.warning, 720, "left", "middle");
  }

  function drawThresholdPanel(ctx, result, box) {
    panel(ctx, box, "threshold audit", "count threshold separates candidates from proof");
    var rows = [
      { label: "true heavy", value: result.threshold.trueHeavy, color: COLORS.exact },
      { label: "reported", value: result.threshold.reported, color: COLORS.upper },
      { label: "guaranteed", value: result.threshold.guaranteed, color: COLORS.lower },
      { label: "uncertain", value: result.threshold.uncertain, color: COLORS.warning },
      { label: "misses", value: result.threshold.misses, color: COLORS.miss }
    ];
    var plot = { x: box.x + 80, y: box.y + 70, w: box.w - 108, h: box.h - 116 };
    var max = rows.reduce(function (m, row) { return Math.max(m, row.value); }, 1);
    rows.forEach(function (row, i) {
      var y = plot.y + i * plot.h / rows.length;
      var h = Math.max(12, plot.h / rows.length - 8);
      text(ctx, row.label, plot.x - 10, y + h / 2, 10, COLORS.muted, 650, "right", "middle");
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, row.value / max * plot.w, h);
      text(ctx, formatInt(row.value), plot.x + row.value / max * plot.w + 6, y + h / 2, 10, COLORS.text, 700, "left", "middle");
    });
    ctx.fillStyle = result.threshold.noMissCondition ? COLORS.softGreen : COLORS.softAmber;
    roundedRect(ctx, box.x + 16, box.y + box.h - 38, box.w - 32, 25, 6);
    ctx.fill();
    var note = "threshold " + formatInt(result.thresholdCount) + "; min " + formatInt(result.minCount);
    if (result.threshold.noMissCondition) note += "; no-miss condition active";
    else note += "; raise threshold or counters for no-miss proof";
    text(ctx, note, box.x + 28, box.y + box.h - 21, 10, COLORS.text, 650, "left", "middle");
  }

  function drawQueryPanel(ctx, result, box) {
    panel(ctx, box, "ranked query", "ask about the exact rank selected by the slider");
    var q = result.query;
    var plot = { x: box.x + 58, y: box.y + 106, w: box.w - 100, h: 38 };
    var scaleMax = Math.max(result.exactRows[0] ? result.exactRows[0].count : 1, q.upper, result.thresholdCount);
    var lowerX = plot.x + q.lower / scaleMax * plot.w;
    var upperX = plot.x + q.upper / scaleMax * plot.w;
    var exactX = plot.x + q.exact / scaleMax * plot.w;
    var thresholdX = plot.x + result.thresholdCount / scaleMax * plot.w;

    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (var i = 0; i <= 4; i += 1) {
      var x = plot.x + i * plot.w / 4;
      ctx.moveTo(x, plot.y - 28);
      ctx.lineTo(x, plot.y + 52);
    }
    ctx.stroke();

    ctx.fillStyle = q.monitored ? COLORS.softBlue : COLORS.softAmber;
    roundedRect(ctx, plot.x, plot.y, plot.w, plot.h, 8);
    ctx.fill();
    ctx.fillStyle = q.monitored ? COLORS.query : COLORS.warning;
    ctx.fillRect(lowerX, plot.y + 9, Math.max(2, upperX - lowerX), plot.h - 18);
    ctx.fillStyle = COLORS.miss;
    ctx.fillRect(exactX - 2, plot.y - 8, 4, plot.h + 16);
    ctx.fillStyle = COLORS.lower;
    ctx.fillRect(thresholdX - 1, plot.y - 18, 2, plot.h + 36);

    text(ctx, "#" + q.item + " at exact rank " + q.rank, box.x + 18, box.y + 73, 16, COLORS.text, 780);
    text(ctx, q.monitored ? "monitored item" : "not monitored; only the global min bound applies", box.x + 18, box.y + 94, 11, COLORS.muted, 650);
    text(ctx, "0", plot.x, plot.y + plot.h + 22, 10, COLORS.muted, 650, "center");
    text(ctx, formatInt(scaleMax), plot.x + plot.w, plot.y + plot.h + 22, 10, COLORS.muted, 650, "center");
    text(ctx, "exact " + formatInt(q.exact), exactX, plot.y - 15, 10, COLORS.miss, 760, "center");
    text(ctx, "threshold", thresholdX, plot.y + plot.h + 40, 10, COLORS.lower, 760, "center");
    text(ctx, "interval [" + formatInt(q.lower) + ", " + formatInt(q.upper) + "]", box.x + 18, box.y + box.h - 44, 12, COLORS.text, 720);
    text(ctx, "top-" + result.params.topK + " overlap: " + result.topK.overlap + " of " + result.topK.exactTop.length + " exact leaders", box.x + 18, box.y + box.h - 24, 11, COLORS.muted, 650);
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
      drawTopPanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawCounterPanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawThresholdPanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawQueryPanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }
    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawTopPanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawCounterPanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawThresholdPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawQueryPanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function metric(label, value, klass) {
    return "<div class=\"space-saving-lab__metric " + (klass || "") + "\"><span>" +
      label + "</span><strong>" + value + "</strong></div>";
  }

  function setOutput(root, key, value) {
    var out = root.querySelector("[data-output=\"" + key + "\"]");
    if (out) out.textContent = value;
  }

  function syncControls(root, result) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (key === "counters") input.max = Math.min(160, result.params.vocabulary);
      if (key === "queryRank") input.max = Math.min(40, Math.max(1, result.exactRows.length));
      if (result.params[key] != null) input.value = result.params[key];
    });
    setOutput(root, "events", formatInt(result.params.events));
    setOutput(root, "vocabulary", formatInt(result.params.vocabulary));
    setOutput(root, "skew", fmt(result.params.skew / 100, 2));
    setOutput(root, "counters", formatInt(result.params.counters));
    setOutput(root, "threshold", fmt(result.params.threshold / 10, 1) + "%");
    setOutput(root, "topK", String(result.params.topK));
    setOutput(root, "queryRank", "#" + result.params.queryRank);
    setOutput(root, "drift", result.params.drift + "%");
    setOutput(root, "seed", String(result.params.seed));
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncControls(root, result);

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("true heavy", formatInt(result.threshold.trueHeavy)),
        metric("reported", formatInt(result.threshold.reported)),
        metric("guaranteed", formatInt(result.threshold.guaranteed)),
        metric("min counter", formatInt(result.minCount)),
        metric("top-k overlap", result.topK.overlap + "/" + result.topK.exactTop.length),
        metric("audit", result.audit.passed ? "passed" : "failed", result.audit.passed ? "space-saving-lab__metric--good" : "space-saving-lab__metric--bad")
      ].join("");
    }

    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "A reported item crosses the upper-count threshold. A guaranteed item crosses it with count minus stored error. With threshold above the current minimum counter, every true heavy hitter is monitored.";
    }

    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__spaceSavingResult = result;
  }

  function init(root) {
    if (!root || root.__spaceSavingReady) return;
    root.__spaceSavingReady = true;
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
        if (root.__spaceSavingResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__spaceSavingResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__spaceSavingResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__spaceSavingResult, canvas);
        }
      });
    }
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-space-saving-lab]")).forEach(init);
  }

  function auditSpaceSavingLab() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  var api = {
    auditSpaceSavingLab: auditSpaceSavingLab,
    cleanParams: cleanParams,
    evaluate: evaluate,
    generate: generate,
    runAudit: runAudit,
    updateSpaceSaving: updateSpaceSaving
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SpaceSavingLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
