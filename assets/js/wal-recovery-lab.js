(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    log: "#2563eb",
    page: "#0f766e",
    redo: "#7c3aed",
    undo: "#b45309",
    bad: "#be123c",
    good: "#0f766e",
    white: "#ffffff"
  };

  var DEFAULTS = {
    durableLsn: 10,
    pageFlushLsn: 8,
    checkpointLsn: 5,
    unsafeFlush: 0
  };

  var PAGES = ["A", "B", "C", "D"];
  var INITIAL = { A: 0, B: 0, C: 0, D: 0 };
  var LOG = [
    { lsn: 1, type: "begin", tx: "T1" },
    { lsn: 2, type: "update", tx: "T1", page: "A", before: 0, after: 10 },
    { lsn: 3, type: "begin", tx: "T2" },
    { lsn: 4, type: "update", tx: "T2", page: "B", before: 0, after: 20 },
    { lsn: 5, type: "update", tx: "T1", page: "C", before: 0, after: 30 },
    { lsn: 6, type: "commit", tx: "T1" },
    { lsn: 7, type: "end", tx: "T1" },
    { lsn: 8, type: "update", tx: "T2", page: "B", before: 20, after: 22 },
    { lsn: 9, type: "begin", tx: "T3" },
    { lsn: 10, type: "update", tx: "T3", page: "D", before: 0, after: 40 },
    { lsn: 11, type: "commit", tx: "T3" },
    { lsn: 12, type: "end", tx: "T3" }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    var durableLsn = clamp(Math.round(Number(raw.durableLsn == null ? DEFAULTS.durableLsn : raw.durableLsn)), 0, 12);
    var pageFlushLsn = clamp(Math.round(Number(raw.pageFlushLsn == null ? DEFAULTS.pageFlushLsn : raw.pageFlushLsn)), 0, 12);
    var checkpointLsn = clamp(Math.round(Number(raw.checkpointLsn == null ? DEFAULTS.checkpointLsn : raw.checkpointLsn)), 0, 12);
    var unsafeFlush = Number(raw.unsafeFlush || 0) ? 1 : 0;
    if (!unsafeFlush) pageFlushLsn = Math.min(pageFlushLsn, durableLsn);
    checkpointLsn = Math.min(checkpointLsn, durableLsn, pageFlushLsn);
    return {
      durableLsn: durableLsn,
      pageFlushLsn: pageFlushLsn,
      checkpointLsn: checkpointLsn,
      unsafeFlush: unsafeFlush
    };
  }

  function clonePages(pages) {
    var out = {};
    PAGES.forEach(function (page) {
      out[page] = { value: pages[page].value, pageLsn: pages[page].pageLsn };
    });
    return out;
  }

  function initialPages() {
    var pages = {};
    PAGES.forEach(function (page) {
      pages[page] = { value: INITIAL[page], pageLsn: 0 };
    });
    return pages;
  }

  function durableRecords(params) {
    return LOG.filter(function (record) { return record.lsn <= params.durableLsn; });
  }

  function recordsUpTo(lsn) {
    return LOG.filter(function (record) { return record.lsn <= lsn; });
  }

  function classifyTransactions(records) {
    var tx = {};
    records.forEach(function (record) {
      if (!record.tx) return;
      tx[record.tx] = tx[record.tx] || { began: false, committed: false, ended: false, updates: [] };
      if (record.type === "begin") tx[record.tx].began = true;
      if (record.type === "commit") tx[record.tx].committed = true;
      if (record.type === "end") tx[record.tx].ended = true;
      if (record.type === "update") tx[record.tx].updates.push(record);
    });
    return tx;
  }

  function diskAtCrash(params) {
    var pages = initialPages();
    var flushLimit = params.pageFlushLsn;
    recordsUpTo(flushLimit).forEach(function (record) {
      if (record.type !== "update") return;
      var page = pages[record.page];
      page.value = record.after;
      page.pageLsn = record.lsn;
    });
    return pages;
  }

  function expectedCommittedState(params) {
    var records = durableRecords(params);
    var tx = classifyTransactions(records);
    var state = {};
    PAGES.forEach(function (page) { state[page] = INITIAL[page]; });
    records.forEach(function (record) {
      if (record.type === "update" && tx[record.tx] && tx[record.tx].committed) {
        state[record.page] = record.after;
      }
    });
    return state;
  }

  function recover(params) {
    var records = durableRecords(params);
    var tx = classifyTransactions(records);
    var pages = diskAtCrash(params);
    var redo = [];
    var undo = [];
    var walViolation = PAGES.some(function (page) {
      return pages[page].pageLsn > params.durableLsn;
    });

    records.forEach(function (record) {
      if (record.type !== "update") return;
      if (record.lsn <= params.checkpointLsn) return;
      var page = pages[record.page];
      if (page.pageLsn < record.lsn) {
        page.value = record.after;
        page.pageLsn = record.lsn;
        redo.push({ lsn: record.lsn, page: record.page, tx: record.tx, action: "redo" });
      } else {
        redo.push({ lsn: record.lsn, page: record.page, tx: record.tx, action: "skip" });
      }
    });

    var losers = Object.keys(tx).filter(function (name) {
      return tx[name].updates.length > 0 && !tx[name].committed;
    }).sort();

    losers.forEach(function (name) {
      tx[name].updates.slice().reverse().forEach(function (record) {
        var page = pages[record.page];
        page.value = record.before;
        page.pageLsn = record.lsn + 100;
        undo.push({ lsn: record.lsn, page: record.page, tx: record.tx, value: record.before });
      });
    });

    var expected = expectedCommittedState(params);
    var matches = PAGES.every(function (page) {
      return pages[page].value === expected[page];
    });

    return {
      params: params,
      records: records,
      tx: tx,
      losers: losers,
      disk: diskAtCrash(params),
      pages: pages,
      redo: redo,
      undo: undo,
      expected: expected,
      walViolation: walViolation,
      matches: matches && !walViolation,
      dirtyStart: firstRedoLsn(params, records)
    };
  }

  function firstRedoLsn(params, records) {
    var first = null;
    records.forEach(function (record) {
      if (record.type === "update" && record.lsn > params.checkpointLsn) {
        first = first == null ? record.lsn : Math.min(first, record.lsn);
      }
    });
    return first == null ? "none" : first;
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var result = recover(params);
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var checks = [];
    function check(name, passed) {
      checks.push({ name: name, passed: !!passed });
    }

    check("safe default obeys WAL", !result.walViolation);
    check("recovered state equals durable committed state", result.matches);
    check("T2 is a loser in default horizon", result.losers.indexOf("T2") >= 0);
    check("winner T1 survives recovery", result.pages.A.value === 10 && result.pages.C.value === 30);
    check("loser T2 is undone", result.pages.B.value === 0);

    var idempotent = recover(result.params);
    check("recovery is deterministic", JSON.stringify(idempotent.pages) === JSON.stringify(result.pages));

    var unsafe = recover(normalize({ durableLsn: 6, pageFlushLsn: 10, checkpointLsn: 5, unsafeFlush: 1 }));
    check("unsafe page flush ahead of log is detected", unsafe.walViolation && !unsafe.matches);

    var committedT3 = recover(normalize({ durableLsn: 12, pageFlushLsn: 12, checkpointLsn: 7, unsafeFlush: 0 }));
    check("durable T3 commit survives", committedT3.pages.D.value === 40 && committedT3.matches);

    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function auditGrid() {
    return [
      {},
      { durableLsn: 6, pageFlushLsn: 6, checkpointLsn: 2, unsafeFlush: 0 },
      { durableLsn: 10, pageFlushLsn: 3, checkpointLsn: 2, unsafeFlush: 0 },
      { durableLsn: 12, pageFlushLsn: 12, checkpointLsn: 7, unsafeFlush: 0 }
    ].map(function (row) { return evaluate(row).audit; });
  }

  function formatPages(pages) {
    return PAGES.map(function (page) { return page + "=" + pages[page].value; }).join(", ");
  }

  function metric(label, value, className) {
    return '<div class="wal-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 900));
    var cssHeight = cssWidth < 700 ? 820 : 640;
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
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, COLORS.muted, 11, 560);
  }

  function recordLabel(record) {
    if (record.type === "update") return record.tx + " " + record.page + ":" + record.before + "->" + record.after;
    return record.tx + " " + record.type.toUpperCase();
  }

  function drawLogPanel(ctx, box, result) {
    panel(ctx, box, "log horizon", "durable records are recoverable; page flushes must not outrun them");
    var left = box.x + 18;
    var right = box.x + box.w - 18;
    var top = box.y + 62;
    var rowH = Math.min(24, (box.h - 90) / LOG.length);
    LOG.forEach(function (record, i) {
      var y = top + i * rowH;
      var durable = record.lsn <= result.params.durableLsn;
      var flushed = record.lsn <= result.params.pageFlushLsn;
      var x = left;
      ctx.fillStyle = durable ? COLORS.log : COLORS.faint;
      ctx.strokeStyle = durable ? COLORS.log : COLORS.rule;
      ctx.beginPath();
      ctx.roundRect(x, y - 13, 34, 18, 5);
      ctx.fill();
      ctx.stroke();
      text(ctx, String(record.lsn), x + 17, y, durable ? COLORS.white : COLORS.muted, 10, 760, "center");
      text(ctx, recordLabel(record), x + 44, y, durable ? COLORS.text : COLORS.muted, 11, 650);
      if (flushed && record.type === "update") {
        ctx.fillStyle = record.lsn > result.params.durableLsn ? COLORS.bad : COLORS.page;
        ctx.beginPath();
        ctx.arc(right - 6, y - 5, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    var legendY = box.y + box.h - 15;
    text(ctx, "blue = log durable; green dot = page may be on disk; red dot = WAL violation", left, legendY, result.walViolation ? COLORS.bad : COLORS.muted, 10, 650);
  }

  function drawPagesPanel(ctx, box, result) {
    panel(ctx, box, "page images at crash", "pageLSN tells recovery whether redo is needed");
    var left = box.x + 18;
    var top = box.y + 70;
    var colW = (box.w - 36) / PAGES.length;
    PAGES.forEach(function (page, i) {
      var x = left + i * colW;
      var disk = result.disk[page];
      var final = result.pages[page];
      var expected = result.expected[page];
      ctx.fillStyle = disk.pageLsn > result.params.durableLsn ? "#fff1f2" : COLORS.faint;
      ctx.strokeStyle = disk.pageLsn > result.params.durableLsn ? COLORS.bad : COLORS.rule;
      ctx.beginPath();
      ctx.roundRect(x + 4, top, Math.max(48, colW - 10), 88, 7);
      ctx.fill();
      ctx.stroke();
      text(ctx, "page " + page, x + colW / 2, top + 24, COLORS.text, 12, 760, "center");
      text(ctx, "crash " + disk.value, x + colW / 2, top + 47, COLORS.muted, 11, 650, "center");
      text(ctx, "LSN " + disk.pageLsn, x + colW / 2, top + 67, disk.pageLsn > result.params.durableLsn ? COLORS.bad : COLORS.muted, 10, 650, "center");
      text(ctx, "final " + final.value, x + colW / 2, top + 118, final.value === expected ? COLORS.good : COLORS.bad, 12, 760, "center");
    });
    text(ctx, "expected durable state: " + PAGES.map(function (p) { return p + "=" + result.expected[p]; }).join(", "), left, box.y + box.h - 18, COLORS.muted, 11, 650);
  }

  function drawRecoveryPanel(ctx, box, result) {
    panel(ctx, box, "restart work", "redo repeats history; undo removes loser transactions");
    var left = box.x + 18;
    var top = box.y + 66;
    var y = top;
    text(ctx, "redo from LSN " + result.dirtyStart, left, y, COLORS.redo, 12, 760);
    y += 20;
    result.redo.slice(0, 7).forEach(function (row) {
      text(ctx, row.action + " LSN " + row.lsn + " on " + row.page + " (" + row.tx + ")", left + 10, y, row.action === "redo" ? COLORS.redo : COLORS.muted, 11, 650);
      y += 18;
    });
    if (result.redo.length > 7) {
      text(ctx, "+" + (result.redo.length - 7) + " more redo decisions", left + 10, y, COLORS.muted, 11, 650);
      y += 18;
    }
    y += 8;
    text(ctx, "losers: " + (result.losers.length ? result.losers.join(", ") : "none"), left, y, COLORS.undo, 12, 760);
    y += 20;
    result.undo.slice(0, 7).forEach(function (row) {
      text(ctx, "undo LSN " + row.lsn + " on " + row.page + " -> " + row.value, left + 10, y, COLORS.undo, 11, 650);
      y += 18;
    });
    if (!result.undo.length) text(ctx, "no loser updates to roll back", left + 10, y, COLORS.muted, 11, 650);
  }

  function drawStatePanel(ctx, box, result) {
    panel(ctx, box, "contract check", "a durable commit is a log fact before it is a page fact");
    var left = box.x + 18;
    var top = box.y + 68;
    var rows = [
      ["durable log", "LSN " + result.params.durableLsn, COLORS.log],
      ["page flush", "LSN " + result.params.pageFlushLsn, result.walViolation ? COLORS.bad : COLORS.page],
      ["checkpoint", "LSN " + result.params.checkpointLsn, COLORS.muted],
      ["final pages", formatPages(result.pages), result.matches ? COLORS.good : COLORS.bad],
      ["audit", result.audit.passed ? "passed" : "check", result.audit.passed ? COLORS.good : COLORS.bad]
    ];
    rows.forEach(function (row, i) {
      var y = top + i * 38;
      text(ctx, row[0], left, y, COLORS.muted, 11, 700);
      text(ctx, row[1], left + 110, y, row[2], 13, 760);
    });
    if (result.walViolation) {
      text(ctx, "A page contains a change whose log record did not survive.", left, box.y + box.h - 34, COLORS.bad, 11, 760);
      text(ctx, "Recovery cannot safely explain that byte pattern.", left, box.y + box.h - 17, COLORS.bad, 11, 650);
    } else {
      text(ctx, "Every page image is explainable from durable log records.", left, box.y + box.h - 22, COLORS.good, 11, 760);
    }
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    if (width < 700) {
      var gap = 14;
      var h = Math.floor((height - 3 * gap) / 4);
      drawLogPanel(ctx, { x: 0, y: 0, w: width, h: h }, result);
      drawPagesPanel(ctx, { x: 0, y: h + gap, w: width, h: h }, result);
      drawRecoveryPanel(ctx, { x: 0, y: 2 * (h + gap), w: width, h: h }, result);
      drawStatePanel(ctx, { x: 0, y: 3 * (h + gap), w: width, h: height - 3 * (h + gap) }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.52);
      var rightW = width - leftW - gap2;
      var upperH = Math.round(height * 0.52);
      drawLogPanel(ctx, { x: 0, y: 0, w: leftW, h: height }, result);
      drawPagesPanel(ctx, { x: leftW + gap2, y: 0, w: rightW, h: upperH }, result);
      drawRecoveryPanel(ctx, { x: leftW + gap2, y: upperH + gap2, w: Math.round((rightW - gap2) * 0.58), h: height - upperH - gap2 }, result);
      drawStatePanel(ctx, { x: leftW + gap2 + Math.round((rightW - gap2) * 0.58) + gap2, y: upperH + gap2, w: rightW - Math.round((rightW - gap2) * 0.58) - gap2, h: height - upperH - gap2 }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      if (input.type === "checkbox") raw[input.getAttribute("data-param")] = input.checked ? 1 : 0;
      else raw[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      durableLsn: String(result.params.durableLsn),
      pageFlushLsn: String(result.params.pageFlushLsn),
      checkpointLsn: String(result.params.checkpointLsn)
    };
    Object.keys(values).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && input.value !== String(result.params[key])) input.value = String(result.params[key]);
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var unsafe = root.querySelector('[data-param="unsafeFlush"]');
    if (unsafe) unsafe.checked = !!result.params.unsafeFlush;

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("WAL rule", result.walViolation ? "violated" : "satisfied", result.walViolation ? "wal-lab__metric--bad" : "wal-lab__metric--good"),
        metric("Redo decisions", String(result.redo.length)),
        metric("Undo records", String(result.undo.length)),
        metric("Losers", result.losers.length ? result.losers.join(", ") : "none"),
        metric("Final state", result.matches ? "matches log" : "not recoverable", result.matches ? "wal-lab__metric--good" : "wal-lab__metric--bad"),
        metric("Audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "wal-lab__metric--good" : "wal-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = result.walViolation
        ? "Unsafe mode let a page reach disk before its log record. The crash image now contains a fact recovery cannot derive from the durable log."
        : "Safe mode caps page flushes at the durable log horizon, so every pageLSN on disk has a corresponding log record.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__walRecoveryResult = result;
  }

  function init(root) {
    if (!root || root.__walRecoveryReady) return;
    root.__walRecoveryReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-wal-lab]")).forEach(init);
  }

  var api = {
    LOG: LOG,
    auditGrid: auditGrid,
    diskAtCrash: diskAtCrash,
    evaluate: evaluate,
    recover: recover
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.WalRecoveryLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
