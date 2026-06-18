(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f7",
    live: "#0f766e",
    pinned: "#b45309",
    reclaimable: "#be123c",
    current: "#2563eb",
    horizon: "#7c3aed",
    safe: "#d9f2e8",
    unsafe: "#fff2d8",
    page: "#f8fafc"
  };

  var DEFAULTS = {
    keys: 48,
    updates: 360,
    hotShare: 74,
    readerHold: 320,
    vacuumEvery: 24,
    pageSlots: 96,
    seed: 41
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

  function normalizeParams(input) {
    input = input || {};
    return {
      keys: clamp(Math.round(Number(input.keys == null ? DEFAULTS.keys : input.keys)), 16, 120),
      updates: clamp(Math.round(Number(input.updates == null ? DEFAULTS.updates : input.updates)), 80, 1200),
      hotShare: clamp(Number(input.hotShare == null ? DEFAULTS.hotShare : input.hotShare), 0, 95) / 100,
      readerHold: clamp(Math.round(Number(input.readerHold == null ? DEFAULTS.readerHold : input.readerHold)), 0, 520),
      vacuumEvery: clamp(Math.round(Number(input.vacuumEvery == null ? DEFAULTS.vacuumEvery : input.vacuumEvery)), 4, 90),
      pageSlots: clamp(Math.round(Number(input.pageSlots == null ? DEFAULTS.pageSlots : input.pageSlots)), 32, 192),
      seed: clamp(Math.round(Number(input.seed == null ? DEFAULTS.seed : input.seed)), 1, 9999)
    };
  }

  function cloneParams(params, overrides) {
    var out = {};
    Object.keys(params).forEach(function (key) { out[key] = params[key]; });
    Object.keys(overrides || {}).forEach(function (key) { out[key] = overrides[key]; });
    return out;
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    return value.toFixed(digits == null ? 0 : digits);
  }

  function formatX(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits) + "x";
  }

  function pickKey(params, step, rand) {
    var hotKeys = Math.max(1, Math.round(params.keys * 0.13));
    if (rand() < params.hotShare) return Math.floor(rand() * hotKeys);
    return Math.floor(rand() * params.keys);
  }

  function isVisible(version, snapshotXid) {
    return version.born < snapshotXid && (version.dead == null || version.dead >= snapshotXid);
  }

  function visibleVersion(chain, snapshotXid) {
    for (var i = chain.length - 1; i >= 0; i -= 1) {
      if (isVisible(chain[i], snapshotXid)) return chain[i];
    }
    return null;
  }

  function visibleIds(chains, snapshotXid) {
    return chains.map(function (chain) {
      var version = visibleVersion(chain, snapshotXid);
      return version ? version.id : null;
    });
  }

  function readSteps(chains, snapshotXid) {
    var total = 0;
    var max = 0;
    var missing = 0;
    chains.forEach(function (chain) {
      var steps = 0;
      var found = false;
      for (var i = chain.length - 1; i >= 0; i -= 1) {
        steps += 1;
        if (isVisible(chain[i], snapshotXid)) {
          found = true;
          break;
        }
      }
      if (!found) missing += 1;
      total += steps;
      max = Math.max(max, steps);
    });
    return {
      avg: total / Math.max(1, chains.length),
      max: max,
      missing: missing
    };
  }

  function stateOf(version, horizon) {
    if (version.dead == null) return "live";
    if (version.dead < horizon) return "reclaimable";
    return "pinned";
  }

  function countStates(chains, horizon) {
    var counts = {
      live: 0,
      pinned: 0,
      reclaimable: 0,
      versions: 0
    };
    chains.forEach(function (chain) {
      chain.forEach(function (version) {
        counts.versions += 1;
        counts[stateOf(version, horizon)] += 1;
      });
    });
    return counts;
  }

  function vacuum(chains, horizon, snapshots, audit) {
    var before = snapshots.map(function (snapshot) {
      return visibleIds(chains, snapshot);
    });
    var removed = 0;

    for (var key = 0; key < chains.length; key += 1) {
      var kept = [];
      chains[key].forEach(function (version) {
        if (version.dead != null && version.dead < horizon) {
          removed += 1;
        } else {
          kept.push(version);
        }
      });
      chains[key] = kept;
    }

    snapshots.forEach(function (snapshot, index) {
      var after = visibleIds(chains, snapshot);
      for (var keyIndex = 0; keyIndex < after.length; keyIndex += 1) {
        if (after[keyIndex] !== before[index][keyIndex]) {
          audit.invalidRemovals += 1;
          audit.visibilitySafe = false;
        }
      }
    });

    return removed;
  }

  function snapshotMetrics(chains, params, step, xid, horizon, readerSnapshot, readerActive, totalReclaimed, vacuumed) {
    var states = countStates(chains, horizon);
    var activeSnapshot = readerActive ? readerSnapshot : xid + 1;
    var historical = readSteps(chains, activeSnapshot);
    var current = readSteps(chains, xid + 1);
    return {
      step: step,
      xid: xid,
      horizon: horizon,
      readerActive: readerActive,
      live: states.live,
      pinned: states.pinned,
      reclaimable: states.reclaimable,
      versions: states.versions,
      pages: Math.ceil(states.versions / params.pageSlots),
      bloat: states.versions / Math.max(1, params.keys),
      avgReadSteps: historical.avg,
      maxReadSteps: historical.max,
      currentReadSteps: current.avg,
      totalReclaimed: totalReclaimed,
      vacuumed: !!vacuumed
    };
  }

  function simulate(input) {
    var params = normalizeParams(input);
    var rand = rng(20260618 + params.seed * 1009 + params.keys * 17 + params.updates * 19);
    var chains = [];
    var nextVersionId = 1;
    var xid = 1;
    var audit = {
      invalidRemovals: 0,
      vacuumRuns: 0,
      visibilitySafe: true
    };

    for (var key = 0; key < params.keys; key += 1) {
      chains.push([{ id: nextVersionId++, key: key, born: 1, dead: null }]);
    }

    var readerStart = 2 + Math.floor(params.updates * 0.2);
    var readerEnd = readerStart + params.readerHold;
    var readerSnapshot = readerStart;
    var totalReclaimed = 0;
    var trace = [];
    var sampleEvery = Math.max(1, Math.floor(params.updates / 90));
    var vacuumEvents = [];

    for (var step = 1; step <= params.updates; step += 1) {
      xid += 1;
      var selectedKey = pickKey(params, step, rand);
      var chain = chains[selectedKey];
      var latest = chain[chain.length - 1];
      if (latest.dead == null) latest.dead = xid;
      chain.push({ id: nextVersionId++, key: selectedKey, born: xid, dead: null });

      var readerActive = params.readerHold > 0 && xid >= readerStart && xid < readerEnd;
      var horizon = readerActive ? Math.min(readerSnapshot, xid + 1) : xid + 1;
      var vacuumed = step % params.vacuumEvery === 0;
      if (vacuumed) {
        var snapshots = [xid + 1];
        if (readerActive) snapshots.push(readerSnapshot);
        var removed = vacuum(chains, horizon, snapshots, audit);
        audit.vacuumRuns += 1;
        totalReclaimed += removed;
        vacuumEvents.push({ step: step, xid: xid, horizon: horizon, removed: removed, readerActive: readerActive });
      }

      if (step === 1 || vacuumed || step % sampleEvery === 0 || step === params.updates) {
        trace.push(snapshotMetrics(chains, params, step, xid, horizon, readerSnapshot, readerActive, totalReclaimed, vacuumed));
      }
    }

    var finalReaderActive = params.readerHold > 0 && xid >= readerStart && xid < readerEnd;
    var finalHorizon = finalReaderActive ? Math.min(readerSnapshot, xid + 1) : xid + 1;
    var summary = snapshotMetrics(chains, params, params.updates, xid, finalHorizon, readerSnapshot, finalReaderActive, totalReclaimed, false);
    var rankedChains = chains.slice().sort(function (a, b) {
      return b.length - a.length || a[0].key - b[0].key;
    });

    return {
      audit: audit,
      chains: chains,
      hotKeys: Math.max(1, Math.round(params.keys * 0.13)),
      params: params,
      reader: {
        activeAtEnd: finalReaderActive,
        end: readerEnd,
        hold: params.readerHold,
        snapshot: readerSnapshot,
        start: readerStart
      },
      summary: summary,
      topChains: rankedChains.slice(0, 10),
      trace: trace,
      vacuumEvents: vacuumEvents
    };
  }

  function auditResult(result) {
    var finite = result.trace.every(function (row) {
      return isFinite(row.xid)
        && isFinite(row.horizon)
        && isFinite(row.versions)
        && isFinite(row.bloat)
        && isFinite(row.avgReadSteps);
    });
    var liveRowsPreserved = result.summary.live === result.params.keys;
    var horizonSane = result.trace.every(function (row) {
      return row.horizon <= row.xid + 1 && row.horizon >= 1;
    });
    return {
      passed: finite && liveRowsPreserved && horizonSane && result.audit.visibilitySafe,
      finite: finite,
      horizonSane: horizonSane,
      liveRowsPreserved: liveRowsPreserved,
      visibilitySafe: result.audit.visibilitySafe,
      invalidRemovals: result.audit.invalidRemovals
    };
  }

  function evaluate(input) {
    var result = simulate(input);
    result.audit = Object.assign(result.audit, auditResult(result));
    return result;
  }

  function auditMvccVacuumLab() {
    var cases = [
      { keys: 32, updates: 180, hotShare: 25, readerHold: 0, vacuumEvery: 12, pageSlots: 64, seed: 7 },
      { keys: 32, updates: 180, hotShare: 80, readerHold: 170, vacuumEvery: 12, pageSlots: 64, seed: 7 },
      { keys: 56, updates: 420, hotShare: 75, readerHold: 360, vacuumEvery: 28, pageSlots: 96, seed: 19 },
      { keys: 80, updates: 520, hotShare: 10, readerHold: 0, vacuumEvery: 40, pageSlots: 128, seed: 29 }
    ];
    var total = 0;
    var passed = 0;

    cases.forEach(function (params) {
      total += 1;
      var result = evaluate(params);
      if (result.audit.passed) passed += 1;
    });

    var base = evaluate({ keys: 48, updates: 360, hotShare: 74, readerHold: 0, vacuumEvery: 24, pageSlots: 96, seed: 41 });
    var held = evaluate({ keys: 48, updates: 360, hotShare: 74, readerHold: 320, vacuumEvery: 24, pageSlots: 96, seed: 41 });
    total += 1;
    if (held.summary.pinned > base.summary.pinned + 100 && held.summary.bloat > base.summary.bloat + 2) passed += 1;

    return { total: total, passed: passed };
  }

  function metric(label, value, tone) {
    var klass = "mvcc-lab__metric" + (tone ? " mvcc-lab__metric--" + tone : "");
    return '<div class="' + klass + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function scale(domain, range) {
    var d = domain.max - domain.min || 1;
    var r = range.max - range.min;
    return function (value) {
      return range.min + ((value - domain.min) / d) * r;
    };
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 900);
    var height = width < 600 ? 860 : 660;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
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
    text(ctx, title, box.x + 14, box.y + 12, COLORS.text, 13, 760);
    text(ctx, subtitle, box.x + 14, box.y + 31, COLORS.muted, 11, 500);
  }

  function drawGrid(ctx, plot, xSteps, ySteps) {
    ctx.strokeStyle = COLORS.faint;
    ctx.lineWidth = 1;
    for (var i = 0; i <= xSteps; i += 1) {
      var x = plot.x + plot.w * i / xSteps;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    for (var j = 0; j <= ySteps; j += 1) {
      var y = plot.y + plot.h * j / ySteps;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawChainsPanel(ctx, box, result) {
    panel(ctx, box, "version chains", "newer tuple versions sit to the right");
    var chains = result.topChains.slice(0, box.w < 430 ? 7 : 9);
    var plot = { x: box.x + 48, y: box.y + 62, w: box.w - 72, h: box.h - 86 };
    var rowH = Math.max(17, Math.min(28, plot.h / Math.max(1, chains.length)));
    var maxLen = 1;
    chains.forEach(function (chain) { maxLen = Math.max(maxLen, chain.length); });

    chains.forEach(function (chain, row) {
      var y = plot.y + row * rowH + 2;
      var key = chain[0] ? chain[0].key : row;
      text(ctx, "k" + key, box.x + 14, y + 2, COLORS.muted, 10, 700);
      var shown = chain.slice(Math.max(0, chain.length - 28));
      var gap = 2;
      var cellW = Math.max(4, Math.min(24, (plot.w - gap * (shown.length - 1)) / Math.max(1, shown.length)));
      var startX = plot.x + plot.w - shown.length * cellW - Math.max(0, shown.length - 1) * gap;
      shown.forEach(function (version, i) {
        var state = stateOf(version, result.summary.horizon);
        ctx.fillStyle = COLORS[state];
        ctx.globalAlpha = state === "live" ? 0.95 : 0.78;
        ctx.fillRect(startX + i * (cellW + gap), y, cellW, rowH - 6);
        ctx.globalAlpha = 1;
      });
      if (chain.length > shown.length) {
        text(ctx, "+" + (chain.length - shown.length), plot.x - 2, y + 2, COLORS.muted, 10, 600, "right");
      }
    });

    text(ctx, "live", box.x + box.w - 162, box.y + box.h - 22, COLORS.live, 10, 760);
    text(ctx, "pinned", box.x + box.w - 114, box.y + box.h - 22, COLORS.pinned, 10, 760);
    text(ctx, "reclaimable", box.x + box.w - 58, box.y + box.h - 22, COLORS.reclaimable, 10, 760);
  }

  function drawHorizonPanel(ctx, box, result) {
    panel(ctx, box, "cleanup horizon", "vacuum can pass only the oldest active snapshot");
    var left = box.x + 22;
    var right = box.x + box.w - 22;
    var trackY = box.y + 104;
    var sx = scale({ min: 1, max: result.summary.xid + 1 }, { min: left, max: right });
    var horizonX = sx(result.summary.horizon);
    var currentX = sx(result.summary.xid + 1);
    var readerStartX = sx(result.reader.start);
    var readerEndX = sx(Math.min(result.reader.end, result.summary.xid + 1));

    ctx.fillStyle = COLORS.safe;
    ctx.fillRect(left, trackY - 18, Math.max(0, horizonX - left), 36);
    ctx.fillStyle = COLORS.unsafe;
    ctx.fillRect(horizonX, trackY - 18, Math.max(0, currentX - horizonX), 36);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, trackY - 18, right - left, 36);

    if (result.params.readerHold > 0) {
      ctx.fillStyle = "rgba(124, 58, 237, 0.18)";
      ctx.fillRect(readerStartX, trackY + 30, Math.max(2, readerEndX - readerStartX), 18);
      text(ctx, "long reader", readerStartX, trackY + 52, COLORS.horizon, 10, 700);
    }

    ctx.strokeStyle = COLORS.horizon;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(horizonX, trackY - 30);
    ctx.lineTo(horizonX, trackY + 24);
    ctx.stroke();
    text(ctx, "xmin " + result.summary.horizon, horizonX, trackY - 48, COLORS.horizon, 11, 760, "center");

    ctx.strokeStyle = COLORS.current;
    ctx.beginPath();
    ctx.moveTo(currentX, trackY - 30);
    ctx.lineTo(currentX, trackY + 24);
    ctx.stroke();
    text(ctx, "now " + (result.summary.xid + 1), currentX, trackY - 64, COLORS.current, 11, 760, "center");

    text(ctx, "dead versions left of xmin are removable", left, box.y + box.h - 42, COLORS.live, 10, 650);
    text(ctx, "dead versions at or right of xmin may still be seen", left, box.y + box.h - 26, COLORS.pinned, 10, 650);
  }

  function drawLine(ctx, points, x, y, color, width) {
    if (!points.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, index) {
      if (index === 0) ctx.moveTo(x(point.step), y(point.value));
      else ctx.lineTo(x(point.step), y(point.value));
    });
    ctx.stroke();
  }

  function drawBloatPanel(ctx, box, result) {
    panel(ctx, box, "retention over time", "pinned dead versions increase bloat and historical read work");
    var plot = { x: box.x + 48, y: box.y + 64, w: box.w - 76, h: box.h - 104 };
    var maxY = 1;
    result.trace.forEach(function (row) {
      maxY = Math.max(maxY, row.bloat, row.pinned / Math.max(1, result.params.keys), row.avgReadSteps);
    });
    maxY *= 1.12;
    var sx = scale({ min: 1, max: result.params.updates }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: maxY }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 6, 4);

    var bloatPoints = result.trace.map(function (row) { return { step: row.step, value: row.bloat }; });
    var pinnedPoints = result.trace.map(function (row) { return { step: row.step, value: row.pinned / Math.max(1, result.params.keys) }; });
    var readPoints = result.trace.map(function (row) { return { step: row.step, value: row.avgReadSteps }; });
    drawLine(ctx, bloatPoints, sx, sy, COLORS.reclaimable, 2.5);
    drawLine(ctx, pinnedPoints, sx, sy, COLORS.pinned, 2.5);
    drawLine(ctx, readPoints, sx, sy, COLORS.current, 2.5);

    result.vacuumEvents.forEach(function (event) {
      var x = sx(event.step);
      ctx.strokeStyle = "rgba(93, 104, 114, 0.24)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    });

    if (result.params.readerHold > 0) {
      var startStep = Math.max(1, result.reader.start - 1);
      var endStep = Math.min(result.params.updates, result.reader.end - 1);
      ctx.fillStyle = "rgba(124, 58, 237, 0.08)";
      ctx.fillRect(sx(startStep), plot.y, Math.max(0, sx(endStep) - sx(startStep)), plot.h);
    }

    text(ctx, "bloat x", plot.x, plot.y - 20, COLORS.reclaimable, 11, 760);
    text(ctx, "pinned / rows", plot.x + 72, plot.y - 20, COLORS.pinned, 11, 760);
    text(ctx, "avg old-read steps", plot.x + 170, plot.y - 20, COLORS.current, 11, 760);
    text(ctx, "updates", plot.x + plot.w / 2, box.y + box.h - 28, COLORS.muted, 11, 500, "center");
    text(ctx, "0", plot.x - 10, plot.y + plot.h - 8, COLORS.muted, 10, 500, "right");
    text(ctx, maxY.toFixed(1), plot.x - 10, plot.y - 2, COLORS.muted, 10, 500, "right");
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (width < 600) {
      var pad = 14;
      drawChainsPanel(ctx, { x: pad, y: 16, w: width - 2 * pad, h: 274 }, result);
      drawHorizonPanel(ctx, { x: pad, y: 306, w: width - 2 * pad, h: 206 }, result);
      drawBloatPanel(ctx, { x: pad, y: 528, w: width - 2 * pad, h: height - 544 }, result);
    } else {
      var gap = 14;
      var leftW = Math.round((width - 36 - gap) * 0.6);
      var rightW = width - 36 - gap - leftW;
      drawChainsPanel(ctx, { x: 18, y: 18, w: leftW, h: 298 }, result);
      drawHorizonPanel(ctx, { x: 18 + leftW + gap, y: 18, w: rightW, h: 298 }, result);
      drawBloatPanel(ctx, { x: 18, y: 334, w: width - 36, h: height - 352 }, result);
    }
  }

  function renderMetrics(root, result) {
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    var summary = result.summary;
    holder.innerHTML = [
      metric("Oldest xmin", String(summary.horizon), result.reader.activeAtEnd ? "warn" : "good"),
      metric("Pinned dead", formatNumber(summary.pinned), summary.pinned > result.params.keys ? "warn" : "good"),
      metric("Bloat", formatX(summary.bloat, 2), summary.bloat > 2 ? "warn" : "good"),
      metric("Avg old read", formatNumber(summary.avgReadSteps, 2) + " steps"),
      metric("Vacuum reclaimed", formatNumber(summary.totalReclaimed)),
      metric("Visibility audit", result.audit.passed ? "pass" : "fail", result.audit.passed ? "good" : "bad")
    ].join("");
  }

  function readControls(root) {
    var values = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      values[input.getAttribute("data-param")] = input.value;
    });
    return normalizeParams(values);
  }

  function updateOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (out) {
      var key = out.getAttribute("data-value");
      if (key === "keys") out.textContent = params.keys.toLocaleString();
      if (key === "updates") out.textContent = params.updates.toLocaleString();
      if (key === "hotShare") out.textContent = (params.hotShare * 100).toFixed(0) + "%";
      if (key === "readerHold") out.textContent = params.readerHold === 0 ? "off" : params.readerHold.toLocaleString();
      if (key === "vacuumEvery") out.textContent = params.vacuumEvery.toLocaleString();
      if (key === "pageSlots") out.textContent = params.pageSlots.toLocaleString();
      if (key === "seed") out.textContent = String(params.seed);
    });
  }

  function init(root) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var pending = false;

    function render() {
      pending = false;
      var params = readControls(root);
      updateOutputs(root, params);
      var result = evaluate(params);
      root.__mvccVacuumResult = result;
      renderMetrics(root, result);
      draw(result, canvas);
    }

    function schedule() {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(render);
    }

    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-mvcc-vacuum-lab]")).forEach(init);
  }

  var api = {
    auditMvccVacuumLab: auditMvccVacuumLab,
    evaluate: evaluate,
    isVisible: isVisible,
    simulate: simulate
  };

  global.MvccVacuumLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
