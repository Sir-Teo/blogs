(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    red: "#be123c",
    blue: "#2563eb",
    overlap: "#7c3aed",
    byz: "#b45309",
    honest: "#0f766e",
    safe: "#0f766e",
    live: "#2563eb",
    bad: "#be123c",
    neutral: "#94a3b8"
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readNumber(raw, key, fallback) {
    var value = raw && raw[key] != null ? Number(raw[key]) : fallback;
    return isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    var n = clamp(Math.round(readNumber(raw, "n", 10)), 4, 31);
    var f = clamp(Math.round(readNumber(raw, "f", 3)), 0, Math.floor((n - 1) / 2));
    var q = clamp(Math.round(readNumber(raw, "q", 7)), 1, n);
    return { n: n, f: f, q: q };
  }

  function range(n) {
    var out = [];
    for (var i = 0; i < n; i += 1) out.push(i);
    return out;
  }

  function buildCertificates(params) {
    var n = params.n;
    var q = params.q;
    var forced = Math.max(0, 2 * q - n);
    var all = range(n);
    var overlap = all.slice(0, forced);
    var aOnly = all.slice(forced, forced + q - forced);
    var bOnly = all.slice(forced + q - forced, forced + 2 * (q - forced));
    var a = overlap.concat(aOnly);
    var b = overlap.concat(bOnly);
    var byz = all.slice(0, params.f);

    return {
      a: a,
      b: b,
      aOnly: aOnly,
      bOnly: bOnly,
      byz: byz,
      forcedOverlap: forced,
      honestOverlap: Math.max(0, forced - params.f)
    };
  }

  function quorumStatus(n, q, f) {
    var forcedOverlap = Math.max(0, 2 * q - n);
    var honestOverlap = Math.max(0, forcedOverlap - f);
    var safety = forcedOverlap > f;
    var liveness = q <= n - f;
    return {
      n: n,
      q: q,
      f: f,
      forcedOverlap: forcedOverlap,
      honestOverlap: honestOverlap,
      safety: safety,
      liveness: liveness,
      both: safety && liveness,
      liveSlack: n - f - q,
      maxFaults: Math.min(forcedOverlap - 1, n - q)
    };
  }

  function evaluate(input) {
    var params = normalize(input);
    var status = quorumStatus(params.n, params.q, params.f);
    var rows = [];
    for (var q = 1; q <= params.n; q += 1) rows.push(quorumStatus(params.n, q, params.f));

    var canonicalF = Math.floor((params.n - 1) / 3);
    var canonicalQ = Math.min(params.n, 2 * canonicalF + 1);
    var bestQ = rows.filter(function (row) { return row.both; }).reduce(function (best, row) {
      if (!best) return row;
      var rowWaste = Math.abs(row.q - (2 * params.f + 1));
      var bestWaste = Math.abs(best.q - (2 * params.f + 1));
      return rowWaste < bestWaste ? row : best;
    }, null);

    var certs = buildCertificates(params);
    var result = {
      params: params,
      status: status,
      rows: rows,
      canonical: quorumStatus(params.n, canonicalQ, canonicalF),
      recommended: bestQ,
      certs: certs
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var s = result.status;
    var c = result.certs;
    var expectedForced = Math.max(0, 2 * s.q - s.n);
    var forcedOk = s.forcedOverlap === expectedForced && c.forcedOverlap === expectedForced;
    var safetyOk = s.safety === (s.forcedOverlap > s.f);
    var liveOk = s.liveness === (s.q <= s.n - s.f);
    var certSizes = c.a.length === s.q && c.b.length === s.q;
    var intersection = c.a.filter(function (id) { return c.b.indexOf(id) >= 0; });
    var intersectionOk = intersection.length === expectedForced;
    var uniqueA = new Set(c.a).size === c.a.length;
    var uniqueB = new Set(c.b).size === c.b.length;
    var byzSet = {};
    c.byz.forEach(function (id) { byzSet[id] = true; });
    var byzInIntersection = intersection.filter(function (id) { return byzSet[id]; }).length;
    var honestIntersection = intersection.length - byzInIntersection;
    var honestOk = honestIntersection === s.honestOverlap;
    var unsafeWitnessOk = s.safety || intersection.every(function (id) { return byzSet[id]; });
    var nested = result.rows.every(function (row) {
      return row.safety === (Math.max(0, 2 * row.q - row.n) > row.f)
        && row.liveness === (row.q <= row.n - row.f);
    });
    return {
      passed: forcedOk && safetyOk && liveOk && certSizes && intersectionOk && uniqueA && uniqueB && honestOk && unsafeWitnessOk && nested,
      forcedOk: forcedOk,
      safetyOk: safetyOk,
      liveOk: liveOk,
      certSizes: certSizes,
      intersectionOk: intersectionOk,
      uniqueA: uniqueA,
      uniqueB: uniqueB,
      honestOk: honestOk,
      unsafeWitnessOk: unsafeWitnessOk,
      nested: nested
    };
  }

  function auditGrid() {
    var total = 0;
    var passed = 0;
    var minimalClusterPassed = 0;
    for (var n = 4; n <= 31; n += 1) {
      for (var f = 0; f <= Math.floor((n - 1) / 2); f += 1) {
        for (var q = 1; q <= n; q += 1) {
          total += 1;
          var result = evaluate({ n: n, f: f, q: q });
          if (result.audit.passed) passed += 1;
        }
      }
    }
    for (var f0 = 1; f0 <= 10; f0 += 1) {
      var canonical = evaluate({ n: 3 * f0 + 1, f: f0, q: 2 * f0 + 1 }).status;
      if (canonical.safety && canonical.liveness) minimalClusterPassed += 1;
    }
    return { total: total, passed: passed, minimalClusterPassed: minimalClusterPassed, minimalClusterTotal: 10 };
  }

  function runAudit() {
    var checked = 0;
    var passed = 0;
    var failures = [];

    function record(name, ok, details) {
      checked += 1;
      if (ok) {
        passed += 1;
      } else if (failures.length < 8) {
        failures.push({ name: name, details: details || "" });
      }
    }

    var defaultCase = evaluate({ n: 10, f: 3, q: 7 });
    record("default status", defaultCase.status.safety && defaultCase.status.liveness && defaultCase.status.honestOverlap === 1 && defaultCase.status.liveSlack === 0);
    record("default certificate audit", defaultCase.audit.passed);

    var unsafeCase = evaluate({ n: 10, f: 3, q: 6 });
    record("lower quorum is unsafe", !unsafeCase.status.safety && unsafeCase.status.liveness && unsafeCase.status.honestOverlap === 0);
    record("unsafe witness spends only Byzantine overlap", unsafeCase.audit.unsafeWitnessOk);

    var stallCase = evaluate({ n: 10, f: 3, q: 8 });
    record("higher quorum may stall", stallCase.status.safety && !stallCase.status.liveness && stallCase.status.liveSlack === -1);

    for (var f0 = 1; f0 <= 10; f0 += 1) {
      var n0 = 3 * f0 + 1;
      var q0 = 2 * f0 + 1;
      var canonical = evaluate({ n: n0, f: f0, q: q0 });
      record("canonical safe/live f=" + f0, canonical.status.both);
      record("canonical forced overlap f=" + f0, canonical.status.forcedOverlap === f0 + 1);
      record("canonical honest overlap f=" + f0, canonical.status.honestOverlap === 1);
      record("canonical zero slack f=" + f0, canonical.status.liveSlack === 0);
      record("canonical max faults f=" + f0, canonical.status.maxFaults === f0);
    }

    for (var n = 4; n <= 31; n += 1) {
      for (var f = 0; f <= Math.floor((n - 1) / 2); f += 1) {
        var rows = [];
        for (var q = 1; q <= n; q += 1) {
          var result = evaluate({ n: n, f: f, q: q });
          record("grid local audit n=" + n + " f=" + f + " q=" + q, result.audit.passed);
          rows.push(result.status);
        }
        var anyBoth = rows.some(function (row) { return row.both; });
        record("window exists iff n > 3f n=" + n + " f=" + f, anyBoth === (n > 3 * f));
      }
    }

    return {
      checked: checked,
      failures: failures,
      ok: failures.length === 0,
      passed: passed
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function formatSigned(value) {
    return value >= 0 ? "+" + value : String(value);
  }

  function metric(label, value) {
    return '<div class="bft-quorum-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 860);
    var height = width < 560 ? 790 : 560;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x + 14, box.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(subtitle, box.x + 14, box.y + 31);
  }

  function label(ctx, text, x, y, color, align, size, weight) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = (weight || "500") + " " + (size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawNode(ctx, x, y, id, role, membership, radius) {
    var fill = "#ffffff";
    if (membership === "a") fill = "rgba(190, 18, 60, 0.16)";
    if (membership === "b") fill = "rgba(37, 99, 235, 0.16)";
    if (membership === "both") fill = "rgba(124, 58, 237, 0.18)";
    ctx.fillStyle = fill;
    ctx.strokeStyle = role === "byz" ? COLORS.byz : COLORS.honest;
    ctx.lineWidth = role === "byz" ? 2.4 : 1.4;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    label(ctx, String(id + 1), x, y + 0.5, role === "byz" ? COLORS.byz : COLORS.text, "center", radius > 10 ? 10 : 8, "700");
  }

  function drawCertificates(ctx, box, result) {
    var s = result.status;
    var c = result.certs;
    var possible = !s.safety;
    panel(ctx, box, "two quorum certificates", possible ? "faulty overlap can sign both forks" : "forced honest overlap blocks the fork");
    var plot = { x: box.x + 24, y: box.y + 72, w: box.w - 48, h: box.h - 106 };
    var ids = range(s.n);
    var cols = Math.min(s.n, plot.w < 420 ? 8 : 11);
    var rows = Math.ceil(s.n / cols);
    var cellW = plot.w / cols;
    var cellH = Math.min(42, plot.h / Math.max(1, rows));
    var radius = clamp(Math.min(cellW, cellH) * 0.31, 7, 13);
    var byzSet = {};
    var aSet = {};
    var bSet = {};
    c.byz.forEach(function (id) { byzSet[id] = true; });
    c.a.forEach(function (id) { aSet[id] = true; });
    c.b.forEach(function (id) { bSet[id] = true; });

    ids.forEach(function (id) {
      var col = id % cols;
      var row = Math.floor(id / cols);
      var x = plot.x + cellW * col + cellW / 2;
      var y = plot.y + cellH * row + cellH / 2;
      var membership = aSet[id] && bSet[id] ? "both" : (aSet[id] ? "a" : (bSet[id] ? "b" : "none"));
      drawNode(ctx, x, y, id, byzSet[id] ? "byz" : "honest", membership, radius);
    });

    var yBase = box.y + box.h - 29;
    if (box.w < 430) {
      label(ctx, "red = cert A", box.x + 18, yBase - 12, COLORS.red, "left", 11, "700");
      label(ctx, "blue = cert B", box.x + 128, yBase - 12, COLORS.blue, "left", 11, "700");
      label(ctx, "orange ring = Byzantine", box.x + 18, yBase + 6, COLORS.byz, "left", 11, "700");
    } else {
      label(ctx, "red = certificate A", box.x + 18, yBase, COLORS.red, "left", 11, "700");
      label(ctx, "blue = certificate B", box.x + 136, yBase, COLORS.blue, "left", 11, "700");
      label(ctx, "orange ring = Byzantine", box.x + 268, yBase, COLORS.byz, "left", 11, "700");
    }
  }

  function drawWindow(ctx, box, result) {
    var p = result.params;
    panel(ctx, box, "the quorum window", "safety wants q high; liveness wants q low");
    var plot = { x: box.x + 44, y: box.y + 74, w: box.w - 70, h: box.h - 108 };
    var n = p.n;
    var y = plot.y + plot.h / 2;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();

    function xFor(q) {
      return plot.x + (q - 1) / Math.max(1, n - 1) * plot.w;
    }

    result.rows.forEach(function (row) {
      var x = xFor(row.q);
      ctx.fillStyle = row.both ? COLORS.safe : (row.safety ? COLORS.byz : (row.liveness ? COLORS.live : COLORS.bad));
      ctx.beginPath();
      ctx.arc(x, y, row.q === p.q ? 7 : 4, 0, Math.PI * 2);
      ctx.fill();
    });

    var safeStart = Math.floor((n + p.f) / 2) + 1;
    var liveEnd = n - p.f;
    ctx.strokeStyle = "rgba(15, 118, 110, 0.24)";
    ctx.lineWidth = 18;
    if (safeStart <= liveEnd) {
      ctx.beginPath();
      ctx.moveTo(xFor(safeStart), y);
      ctx.lineTo(xFor(liveEnd), y);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1;
    [1, safeStart, liveEnd, n].forEach(function (q) {
      if (q < 1 || q > n) return;
      var x = xFor(q);
      ctx.beginPath();
      ctx.moveTo(x, y - 20);
      ctx.lineTo(x, y + 20);
      ctx.stroke();
      label(ctx, String(q), x, y + 35, COLORS.muted, "center", 11, "600");
    });

    var compactWindow = Math.abs(xFor(liveEnd) - xFor(safeStart)) < 130 || plot.w < 260;
    if (compactWindow) {
      label(ctx, "unsafe < " + safeStart, plot.x, plot.y + 12, COLORS.bad, "left", 11, "700");
      label(ctx, "stall > " + liveEnd, plot.x + plot.w, plot.y + 12, COLORS.byz, "right", 11, "700");
    } else {
      label(ctx, "unsafe below " + safeStart, plot.x, plot.y + 14, COLORS.bad, "left", 11, "700");
      label(ctx, "unavailable above " + liveEnd, plot.x + plot.w, plot.y + 14, COLORS.byz, "right", 11, "700");
    }
    label(ctx, "selected q=" + p.q, xFor(p.q), compactWindow ? y - 20 : y - 30, COLORS.text, "center", 12, "700");
  }

  function drawLedger(ctx, box, result) {
    var s = result.status;
    panel(ctx, box, "fault budget ledger", "the two inequalities must both clear");
    var rows = [
      {
        name: "forced overlap",
        value: s.forcedOverlap,
        detail: "2q - n",
        color: s.safety ? COLORS.safe : COLORS.bad,
        need: ">" + s.f
      },
      {
        name: "honest overlap",
        value: s.honestOverlap,
        detail: "overlap - f",
        color: s.honestOverlap > 0 ? COLORS.safe : COLORS.bad,
        need: ">=1"
      },
      {
        name: "live slack",
        value: s.liveSlack,
        detail: "n - f - q",
        color: s.liveness ? COLORS.live : COLORS.bad,
        need: ">=0"
      }
    ];
    var maxAbs = Math.max(1, Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); })));
    var x0 = box.x + 118;
    var y0 = box.y + 78;
    var barW = box.w - 178;
    rows.forEach(function (row, i) {
      var y = y0 + i * 52;
      label(ctx, row.name, box.x + 16, y, COLORS.text, "left", 12, "700");
      label(ctx, row.detail + " " + row.need, box.x + 16, y + 17, COLORS.muted, "left", 10, "500");
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(x0, y - 9, barW, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(x0, y - 9, barW * Math.min(1, Math.abs(row.value) / maxAbs), 18);
      label(ctx, formatSigned(row.value), x0 + barW + 12, y, row.color, "left", 12, "800");
    });

    var verdict = s.both ? "safe and live" : (s.safety ? "safe but may stall" : (s.liveness ? "live but unsafe" : "neither safe nor live"));
    label(ctx, verdict, box.x + 16, box.y + box.h - 28, s.both ? COLORS.safe : COLORS.bad, "left", 14, "800");
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (width < 560) {
      var gap = 14;
      var h1 = 282;
      var h2 = 220;
      drawCertificates(ctx, { x: 0, y: 0, w: width, h: h1 }, result);
      drawWindow(ctx, { x: 0, y: h1 + gap, w: width, h: h2 }, result);
      drawLedger(ctx, { x: 0, y: h1 + h2 + 2 * gap, w: width, h: height - h1 - h2 - 2 * gap }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.58);
      drawCertificates(ctx, { x: 0, y: 0, w: leftW, h: height }, result);
      drawWindow(ctx, { x: leftW + gap2, y: 0, w: width - leftW - gap2, h: Math.round((height - gap2) * 0.48) }, result);
      drawLedger(ctx, { x: leftW + gap2, y: Math.round((height - gap2) * 0.48) + gap2, w: width - leftW - gap2, h: height - Math.round((height - gap2) * 0.48) - gap2 }, result);
    }
  }

  function render(root) {
    var params = {};
    Array.prototype.slice.call(root.querySelectorAll("input[data-param]")).forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(params);
    var audit = cachedAudit();
    var values = {
      n: String(result.params.n),
      f: String(result.params.f),
      q: String(result.params.q)
    };
    Object.keys(values).forEach(function (key) {
      var input = root.querySelector('input[data-param="' + key + '"]');
      if (input && input.value !== values[key]) input.value = values[key];
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Forced overlap", result.status.forcedOverlap),
        metric("Honest overlap", result.status.honestOverlap),
        metric("Live slack", formatSigned(result.status.liveSlack)),
        metric("Conflict", result.status.safety ? "blocked" : "possible"),
        metric("Liveness", result.status.liveness ? "possible" : "stalls"),
        metric("Audit", audit.passed + "/" + audit.checked)
      ].join("");
    }

    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("input[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-bft-quorum-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    auditResult: auditResult,
    buildCertificates: buildCertificates,
    evaluate: evaluate,
    quorumStatus: quorumStatus,
    runAudit: runAudit
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.BFTQuorumLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
