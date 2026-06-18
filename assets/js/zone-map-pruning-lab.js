(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    scanned: "#2563eb",
    skipped: "#94a3b8",
    match: "#0f766e",
    falsePositive: "#b45309",
    bad: "#be123c",
    good: "#0f766e"
  };

  var DEFAULTS = {
    rows: 4096,
    groupSize: 128,
    order: "x",
    predicate: "box",
    width: 12,
    outliers: 2,
    seed: 37
  };

  var ORDERS = {
    random: "random ingest",
    x: "time sort",
    y: "tenant sort",
    z: "z-order sort"
  };

  var PREDICATES = {
    x: "time band",
    y: "tenant band",
    box: "time + tenant box"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function snap(value, fallback, min, max, step) {
    var raw = finite(Number(value), fallback);
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      groupSize: snap(raw.groupSize, DEFAULTS.groupSize, 32, 512, 32),
      order: ORDERS[raw.order] ? raw.order : DEFAULTS.order,
      outliers: snap(raw.outliers, DEFAULTS.outliers, 0, 12, 1),
      predicate: PREDICATES[raw.predicate] ? raw.predicate : DEFAULTS.predicate,
      rows: snap(raw.rows, DEFAULTS.rows, 1024, 8192, 512),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1),
      width: snap(raw.width, DEFAULTS.width, 3, 35, 1)
    };
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6d2b79f5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rand) {
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function shuffle(rows, rand) {
    for (var i = rows.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = rows[i];
      rows[i] = rows[j];
      rows[j] = tmp;
    }
  }

  function splitBy1(n) {
    n &= 0xffff;
    n = (n | (n << 8)) & 0x00ff00ff;
    n = (n | (n << 4)) & 0x0f0f0f0f;
    n = (n | (n << 2)) & 0x33333333;
    n = (n | (n << 1)) & 0x55555555;
    return n >>> 0;
  }

  function morton(x, y) {
    var xi = clamp(Math.floor(x * 65535), 0, 65535);
    var yi = clamp(Math.floor(y * 65535), 0, 65535);
    return (splitBy1(xi) | (splitBy1(yi) << 1)) >>> 0;
  }

  function makeRows(params) {
    var rand = rng(0x51633 ^ params.seed * 1009 + params.rows * 17);
    var rows = [];
    for (var i = 0; i < params.rows; i += 1) {
      var x = rand();
      var tenantBand = Math.floor(rand() * 16);
      var y = (tenantBand + 0.18 + 0.64 * rand()) / 16;
      if (rand() < 0.35) {
        y = clamp(0.18 + 0.62 * x + gaussian(rand) * 0.08, 0, 1);
      }
      var outlier = rand() < params.outliers / 100;
      if (outlier) {
        x = rand();
        y = rand();
      }
      rows.push({
        id: i,
        outlier: outlier,
        x: clamp(x, 0, 1),
        y: clamp(y, 0, 1)
      });
    }
    return rows;
  }

  function sortRows(rows, params) {
    var sorted = rows.slice();
    if (params.order === "random") {
      shuffle(sorted, rng(0xBAD5EED ^ params.seed * 7919));
      return sorted;
    }
    if (params.order === "x") {
      sorted.sort(function (a, b) { return a.x - b.x || a.y - b.y || a.id - b.id; });
      return sorted;
    }
    if (params.order === "y") {
      sorted.sort(function (a, b) { return a.y - b.y || a.x - b.x || a.id - b.id; });
      return sorted;
    }
    sorted.sort(function (a, b) { return morton(a.x, a.y) - morton(b.x, b.y) || a.id - b.id; });
    return sorted;
  }

  function predicateBox(params) {
    var width = params.width / 100;
    var cx = 0.57;
    var cy = 0.43;
    var box = {
      x0: params.predicate === "y" ? 0 : clamp(cx - width / 2, 0, 1),
      x1: params.predicate === "y" ? 1 : clamp(cx + width / 2, 0, 1),
      y0: params.predicate === "x" ? 0 : clamp(cy - width / 2, 0, 1),
      y1: params.predicate === "x" ? 1 : clamp(cy + width / 2, 0, 1)
    };
    return box;
  }

  function rowMatches(row, pred) {
    return row.x >= pred.x0 && row.x <= pred.x1 && row.y >= pred.y0 && row.y <= pred.y1;
  }

  function groupIntersects(group, pred) {
    return !(group.maxX < pred.x0 || group.minX > pred.x1 || group.maxY < pred.y0 || group.minY > pred.y1);
  }

  function buildGroups(sorted, params, pred) {
    var groups = [];
    for (var start = 0; start < sorted.length; start += params.groupSize) {
      var rows = sorted.slice(start, start + params.groupSize);
      var minX = 1;
      var maxX = 0;
      var minY = 1;
      var maxY = 0;
      var matches = 0;
      for (var i = 0; i < rows.length; i += 1) {
        var row = rows[i];
        minX = Math.min(minX, row.x);
        maxX = Math.max(maxX, row.x);
        minY = Math.min(minY, row.y);
        maxY = Math.max(maxY, row.y);
        if (rowMatches(row, pred)) matches += 1;
      }
      var group = {
        index: groups.length,
        maxX: maxX,
        maxY: maxY,
        matches: matches,
        minX: minX,
        minY: minY,
        rows: rows,
        scanned: false,
        start: start
      };
      group.scanned = groupIntersects(group, pred);
      group.falsePositive = group.scanned && group.matches === 0;
      groups.push(group);
    }
    return groups;
  }

  function analyze(groups, rows) {
    var scanned = groups.filter(function (group) { return group.scanned; });
    var skipped = groups.length - scanned.length;
    var rowsRead = scanned.reduce(function (sum, group) { return sum + group.rows.length; }, 0);
    var matches = groups.reduce(function (sum, group) { return sum + group.matches; }, 0);
    var falsePositive = scanned.filter(function (group) { return group.falsePositive; }).length;
    return {
      falsePositiveGroups: falsePositive,
      groups: groups.length,
      matchRows: matches,
      precision: rowsRead ? matches / rowsRead : 0,
      rows: rows.length,
      rowsRead: rowsRead,
      scannedGroups: scanned.length,
      skipRate: 1 - rowsRead / rows.length,
      skippedGroups: skipped
    };
  }

  function auditResult(result) {
    var bounded = result.rows.every(function (row) {
      return row.x >= 0 && row.x <= 1 && row.y >= 0 && row.y <= 1;
    });
    var boxesBoundRows = result.groups.every(function (group) {
      return group.rows.every(function (row) {
        return row.x >= group.minX - 1e-12 && row.x <= group.maxX + 1e-12 &&
          row.y >= group.minY - 1e-12 && row.y <= group.maxY + 1e-12;
      });
    });
    var noFalseNegatives = result.groups.every(function (group) {
      return group.scanned || group.matches === 0;
    });
    var accounting = result.analysis.scannedGroups + result.analysis.skippedGroups === result.analysis.groups &&
      result.analysis.rowsRead <= result.analysis.rows &&
      result.analysis.matchRows <= result.analysis.rowsRead;
    return {
      accounting: accounting,
      bounded: bounded,
      boxesBoundRows: boxesBoundRows,
      noFalseNegatives: noFalseNegatives,
      passed: bounded && boxesBoundRows && noFalseNegatives && accounting
    };
  }

  function auditChecks(audit) {
    return [
      { name: "rows-in-unit-square", ok: audit.bounded },
      { name: "zone-boxes-bound-rows", ok: audit.boxesBoundRows },
      { name: "no-skipped-matching-group", ok: audit.noFalseNegatives },
      { name: "scan-accounting", ok: audit.accounting }
    ];
  }

  function failedAuditChecks(checks) {
    return checks.filter(function (check) { return !check.ok; }).map(function (check) { return check.name; });
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var rows = makeRows(params);
    var sorted = sortRows(rows, params);
    var pred = predicateBox(params);
    var groups = buildGroups(sorted, params, pred);
    var result = {
      analysis: analyze(groups, sorted),
      audit: null,
      groups: groups,
      params: params,
      predicate: pred,
      rows: sorted
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditZoneMapLab() {
    var cases = [
      {
        label: "time band sorted by time",
        params: {
          groupSize: 64,
          order: "x",
          outliers: 0,
          predicate: "x",
          rows: 2048,
          seed: 3,
          width: 8
        }
      },
      {
        label: "box predicate random ingest",
        params: {
          groupSize: 128,
          order: "random",
          outliers: 2,
          predicate: "box",
          rows: 4096,
          seed: 37,
          width: 12
        }
      },
      {
        label: "box predicate z-order",
        params: {
          groupSize: 128,
          order: "z",
          outliers: 2,
          predicate: "box",
          rows: 4096,
          seed: 37,
          width: 12
        }
      },
      {
        label: "tenant band with outliers",
        params: {
          groupSize: 256,
          order: "y",
          outliers: 8,
          predicate: "y",
          rows: 8192,
          seed: 91,
          width: 5
        }
      }
    ];
    var passed = 0;
    var rows = [];
    cases.forEach(function (entry, index) {
      var result = evaluate(entry.params);
      var checks = auditChecks(result.audit);
      var passedChecks = checks.filter(function (check) { return check.ok; }).length;
      if (result.audit.passed) passed += 1;
      rows.push({
        caseId: index + 1,
        checks: checks,
        failedChecks: failedAuditChecks(checks),
        falsePositiveGroups: result.analysis.falsePositiveGroups,
        groupSize: result.params.groupSize,
        groups: result.analysis.groups,
        label: entry.label,
        matchRows: result.analysis.matchRows,
        order: result.params.order,
        outliers: result.params.outliers,
        passed: result.audit.passed,
        passedChecks: passedChecks,
        predicate: result.params.predicate,
        rows: result.params.rows,
        rowsRead: result.analysis.rowsRead,
        scannedGroups: result.analysis.scannedGroups,
        seed: result.params.seed,
        skipRate: result.analysis.skipRate,
        totalChecks: checks.length,
        width: result.params.width
      });
    });
    var coarse = evaluate({ rows: 4096, groupSize: 256, order: "x", predicate: "x", width: 8, outliers: 0, seed: 14 });
    var fine = evaluate({ rows: 4096, groupSize: 64, order: "x", predicate: "x", width: 8, outliers: 0, seed: 14 });
    var monotone = fine.analysis.rowsRead <= coarse.analysis.rowsRead;
    var comparisons = [{
      caseId: rows.length + 1,
      checks: [{ name: "finer-aligned-groups-read-no-more", ok: monotone }],
      coarseGroupSize: coarse.params.groupSize,
      coarseRowsRead: coarse.analysis.rowsRead,
      failedChecks: monotone ? [] : ["finer-aligned-groups-read-no-more"],
      fineGroupSize: fine.params.groupSize,
      fineRowsRead: fine.analysis.rowsRead,
      label: "smaller row groups read no more rows for aligned range",
      passed: monotone,
      passedChecks: monotone ? 1 : 0,
      totalChecks: 1
    }];
    var allRows = rows.concat(comparisons);
    var passedChecks = allRows.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = allRows.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    var errors = [];
    allRows.forEach(function (row) {
      row.failedChecks.forEach(function (name) {
        errors.push("case " + row.caseId + " " + row.label + ": " + name);
      });
    });
    return {
      cases: rows,
      comparisons: comparisons,
      details: allRows,
      errors: errors,
      monotone: monotone,
      ok: passed === cases.length && monotone && passedChecks === totalChecks,
      passed: passed + (monotone ? 1 : 0),
      passedChecks: passedChecks,
      total: cases.length + 1,
      totalChecks: totalChecks
    };
  }

  function formatPct(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (value * 100).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 0 : digits);
  }

  function metric(label, value, tone) {
    var klass = "zone-lab__metric" + (tone ? " zone-lab__metric--" + tone : "");
    return '<div class="' + klass + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 900);
    var height = width < 650 ? 920 : 650;
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(value, x, y);
  }

  function truncate(ctx, value, maxWidth) {
    if (ctx.measureText(value).width <= maxWidth) return value;
    var out = value;
    while (out.length > 3 && ctx.measureText(out + "...").width > maxWidth) out = out.slice(0, -1);
    return out + "...";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 12, COLORS.text, 13, 760);
    if (subtitle) text(ctx, truncate(ctx, subtitle, box.w - 28), box.x + 14, box.y + 31, COLORS.muted, 11, 520);
  }

  function scale(domain, range) {
    var span = domain.max - domain.min || 1;
    return function (value) {
      return range.min + (value - domain.min) * (range.max - range.min) / span;
    };
  }

  function drawBoxes(ctx, box, result) {
    panel(ctx, box, "row-group boxes", "zone maps store a bounding interval per filtered column");
    var plot = { x: box.x + 40, y: box.y + 62, w: box.w - 62, h: box.h - 92 };
    var sx = scale({ min: 0, max: 1 }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: 1 }, { min: plot.y + plot.h, max: plot.y });

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var gx = plot.x + plot.w * i / 4;
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y);
      ctx.lineTo(gx, plot.y + plot.h);
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }

    var shown = result.groups.filter(function (group, index) {
      return result.groups.length <= 80 || index % Math.ceil(result.groups.length / 80) === 0 || group.scanned;
    });
    shown.forEach(function (group) {
      var x0 = sx(group.minX);
      var x1 = sx(group.maxX);
      var y0 = sy(group.maxY);
      var y1 = sy(group.minY);
      ctx.strokeStyle = group.scanned ? (group.falsePositive ? "rgba(180,83,9,0.45)" : "rgba(37,99,235,0.52)") : "rgba(148,163,184,0.28)";
      ctx.lineWidth = group.scanned ? 1.2 : 0.8;
      ctx.strokeRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    });

    result.rows.forEach(function (row, index) {
      if (index % Math.max(1, Math.floor(result.rows.length / 900)) !== 0 && !rowMatches(row, result.predicate)) return;
      ctx.fillStyle = rowMatches(row, result.predicate) ? COLORS.match : "rgba(23,32,38,0.20)";
      ctx.beginPath();
      ctx.arc(sx(row.x), sy(row.y), rowMatches(row, result.predicate) ? 2.4 : 1.2, 0, Math.PI * 2);
      ctx.fill();
    });

    var px0 = sx(result.predicate.x0);
    var px1 = sx(result.predicate.x1);
    var py0 = sy(result.predicate.y1);
    var py1 = sy(result.predicate.y0);
    ctx.fillStyle = "rgba(15,118,110,0.08)";
    ctx.strokeStyle = COLORS.match;
    ctx.lineWidth = 2;
    ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
    ctx.strokeRect(px0, py0, px1 - px0, py1 - py0);
    text(ctx, "time", plot.x + plot.w / 2, box.y + box.h - 24, COLORS.muted, 11, 520, "center");
    text(ctx, "tenant", plot.x - 8, plot.y - 2, COLORS.muted, 11, 520, "right");
  }

  function drawGroupStrip(ctx, box, result) {
    panel(ctx, box, "scan ledger", "each bar is one row group in physical order");
    var plot = { x: box.x + 22, y: box.y + 66, w: box.w - 44, h: box.h - 104 };
    var groupW = plot.w / result.groups.length;
    result.groups.forEach(function (group, index) {
      var x = plot.x + index * groupW;
      var range = (group.maxX - group.minX) + (group.maxY - group.minY);
      var h = Math.max(2, plot.h * Math.min(1, range / 1.35));
      ctx.fillStyle = group.scanned ? (group.falsePositive ? COLORS.falsePositive : COLORS.scanned) : COLORS.skipped;
      ctx.fillRect(x, plot.y + plot.h - h, Math.max(1, groupW - 0.5), h);
      if (group.matches) {
        ctx.fillStyle = COLORS.match;
        ctx.fillRect(x, plot.y + plot.h - Math.min(plot.h, h + 5), Math.max(1, groupW - 0.5), 4);
      }
    });
    text(ctx, "physical row-group order after " + ORDERS[result.params.order], plot.x, box.y + box.h - 30, COLORS.muted, 11, 520);
  }

  function drawAccounting(ctx, box, result) {
    panel(ctx, box, "read accounting", "skipping proves absence; scanning is still lossy");
    var rows = [
      { color: COLORS.skipped, label: "rows skipped", value: result.analysis.rows - result.analysis.rowsRead },
      { color: COLORS.scanned, label: "rows read", value: result.analysis.rowsRead },
      { color: COLORS.match, label: "matching rows", value: result.analysis.matchRows }
    ];
    var plot = { x: box.x + 112, y: box.y + 74, w: box.w - 152, h: box.h - 118 };
    rows.forEach(function (row, i) {
      var y = plot.y + i * 48;
      text(ctx, row.label, box.x + 18, y - 2, COLORS.text, 11, 720);
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(plot.x, y, plot.w, 14);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, plot.w * row.value / result.analysis.rows, 14);
      text(ctx, formatNumber(row.value, 0), plot.x + plot.w + 8, y - 2, row.color, 10, 760);
    });
    text(ctx, "false-positive groups: " + result.analysis.falsePositiveGroups, box.x + 18, box.y + box.h - 31, result.analysis.falsePositiveGroups ? COLORS.falsePositive : COLORS.good, 11, 650);
  }

  function drawAudit(ctx, box, result) {
    panel(ctx, box, "simulation audit", "zone maps may be lossy but must not skip matches");
    var rows = [
      ["all points inside domain", result.audit.bounded],
      ["boxes bound their row groups", result.audit.boxesBoundRows],
      ["skipped groups contain no matches", result.audit.noFalseNegatives],
      ["scan/skip accounting balances", result.audit.accounting]
    ];
    var y = box.y + 66;
    rows.forEach(function (row) {
      ctx.fillStyle = row[1] ? "rgba(15,118,110,0.11)" : "rgba(190,18,60,0.10)";
      ctx.strokeStyle = row[1] ? "rgba(15,118,110,0.28)" : "rgba(190,18,60,0.28)";
      ctx.beginPath();
      ctx.roundRect(box.x + 16, y - 5, box.w - 32, 25, 6);
      ctx.fill();
      ctx.stroke();
      text(ctx, truncate(ctx, row[0], box.w - 92), box.x + 28, y, COLORS.text, 11, 650);
      text(ctx, row[1] ? "pass" : "fail", box.x + box.w - 28, y, row[1] ? COLORS.good : COLORS.bad, 11, 760, "right");
      y += 34;
    });
    text(ctx, result.analysis.scannedGroups + "/" + result.analysis.groups + " groups scanned", box.x + 18, box.y + box.h - 31, COLORS.muted, 11, 650);
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    if (width < 650) {
      var pad = 14;
      var gap = 14;
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawBoxes(ctx, { x: pad, y: pad, w: width - pad * 2, h: panelH }, result);
      drawGroupStrip(ctx, { x: pad, y: pad + panelH + gap, w: width - pad * 2, h: panelH }, result);
      drawAccounting(ctx, { x: pad, y: pad + 2 * (panelH + gap), w: width - pad * 2, h: panelH }, result);
      drawAudit(ctx, { x: pad, y: pad + 3 * (panelH + gap), w: width - pad * 2, h: panelH }, result);
      return;
    }

    var outer = 16;
    var gap2 = 14;
    var halfW = (width - outer * 2 - gap2) / 2;
    var halfH = (height - outer * 2 - gap2) / 2;
    drawBoxes(ctx, { x: outer, y: outer, w: halfW, h: halfH }, result);
    drawGroupStrip(ctx, { x: outer + halfW + gap2, y: outer, w: halfW, h: halfH }, result);
    drawAccounting(ctx, { x: outer, y: outer + halfH + gap2, w: halfW, h: halfH }, result);
    drawAudit(ctx, { x: outer + halfW + gap2, y: outer + halfH + gap2, w: halfW, h: halfH }, result);
  }

  function setOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "order") output.textContent = ORDERS[params.order];
      else if (key === "predicate") output.textContent = PREDICATES[params.predicate];
      else if (key === "width" || key === "outliers") output.textContent = params[key] + "%";
      else output.textContent = String(params[key]);
    });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return normalize(raw);
  }

  function renderMetrics(root, result) {
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    holder.innerHTML = [
      metric("Groups scanned", result.analysis.scannedGroups + "/" + result.analysis.groups, result.analysis.skipRate > 0.5 ? "good" : ""),
      metric("Rows skipped", formatPct(result.analysis.skipRate), result.analysis.skipRate > 0.5 ? "good" : "warn"),
      metric("Rows read", formatNumber(result.analysis.rowsRead, 0)),
      metric("Matching rows", formatNumber(result.analysis.matchRows, 0)),
      metric("False-positive groups", String(result.analysis.falsePositiveGroups), result.analysis.falsePositiveGroups ? "warn" : "good"),
      metric("Audit", result.audit.passed ? "pass" : "fail", result.audit.passed ? "good" : "bad")
    ].join("");
  }

  function init(root) {
    if (!root || root.__zoneMapReady) return;
    root.__zoneMapReady = true;
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var pending = false;

    function render() {
      pending = false;
      var params = readParams(root);
      setOutputs(root, params);
      var result = evaluate(params);
      root.__zoneMapResult = result;
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-zone-map-lab]")).forEach(init);
  }

  var api = {
    auditZoneMapLab: auditZoneMapLab,
    evaluate: evaluate,
    normalize: normalize,
    predicateBox: predicateBox
  };

  global.ZoneMapPruningLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
