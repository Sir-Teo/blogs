(function (global) {
  "use strict";

  var COLORS = {
    axis: "#d7dee5",
    batch: "#0f766e",
    batchSoft: "rgba(15, 118, 110, 0.12)",
    clob: "#be123c",
    clobSoft: "rgba(190, 18, 60, 0.12)",
    gold: "#d97706",
    goldSoft: "rgba(217, 119, 6, 0.14)",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    panel: "#f8fafc",
    purple: "#7c3aed",
    purpleSoft: "rgba(124, 58, 237, 0.12)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    batchMs: 100,
    halfSpreadBps: 2.5,
    jumpBps: 7,
    makerUs: 180,
    seed: 17,
    shockCount: 9000,
    sniperUs: 180,
    snipers: 8
  };

  var AUDIT_CACHE = null;

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = finite(Number(value), fallback);
    var snapped = min + Math.round((raw - min) / step) * step;
    return clamp(snapped, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      batchMs: snap(raw.batchMs, DEFAULTS.batchMs, 0.02, 100, 0.02),
      halfSpreadBps: snap(raw.halfSpreadBps, DEFAULTS.halfSpreadBps, 0.5, 8, 0.1),
      jumpBps: snap(raw.jumpBps, DEFAULTS.jumpBps, 1, 20, 0.1),
      makerUs: snap(raw.makerUs, DEFAULTS.makerUs, 60, 1500, 5),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1),
      shockCount: snap(raw.shockCount, DEFAULTS.shockCount, 1000, 20000, 500),
      sniperUs: snap(raw.sniperUs, DEFAULTS.sniperUs, 20, 900, 5),
      snipers: snap(raw.snipers, DEFAULTS.snipers, 1, 18, 1)
    };
  }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      var x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function expSample(rand, mean) {
    return -Math.log(Math.max(1e-12, 1 - rand())) * mean;
  }

  function makeRows(params) {
    var rand = mulberry32(params.seed * 1000003 + params.snipers * 9176 + params.shockCount);
    var rows = [];
    for (var i = 0; i < params.shockCount; i += 1) {
      var absJump = Math.min(params.jumpBps * 8, expSample(rand, params.jumpBps));
      var makerUs = params.makerUs * (0.78 + 0.44 * rand());
      var minSniperUs = Infinity;
      var sniperLatencies = [];
      for (var s = 0; s < params.snipers; s += 1) {
        var latency = params.sniperUs * (0.72 + 0.56 * rand()) + expSample(rand, 24);
        sniperLatencies.push(latency);
        if (latency < minSniperUs) minSniperUs = latency;
      }
      rows.push({
        absJumpBps: absJump,
        makerUs: makerUs,
        minSniperUs: minSniperUs,
        phaseUnit: rand(),
        sniperLatencies: sniperLatencies
      });
    }
    return rows;
  }

  function clearSlot(phaseUnit, batchUs, latencyUs) {
    return Math.floor((phaseUnit * batchUs + latencyUs) / batchUs);
  }

  function clearDelayUs(phaseUnit, batchUs, latencyUs) {
    var phaseUs = phaseUnit * batchUs;
    var slot = Math.floor((phaseUs + latencyUs) / batchUs);
    return (slot + 1) * batchUs - phaseUs;
  }

  function evaluateRows(rows, params, batchMs) {
    var batchUs = batchMs * 1000;
    var out = {
      batchCollapsed: 0,
      batchMs: batchMs,
      batchRentBps: 0,
      batchSniped: 0,
      clobFailedMessages: 0,
      clobRentBps: 0,
      clobSniped: 0,
      meanMakerUs: 0,
      meanMinSniperUs: 0,
      noRace: 0,
      profitable: 0,
      rows: rows.length,
      sample: null,
      unprofitable: 0
    };

    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      out.meanMakerUs += row.makerUs;
      out.meanMinSniperUs += row.minSniperUs;
      var profit = row.absJumpBps - params.halfSpreadBps;
      var profitable = profit > 0;
      if (!profitable) {
        out.unprofitable += 1;
        continue;
      }
      out.profitable += 1;

      var clobSniped = row.minSniperUs < row.makerUs;
      var sniperSlot = clearSlot(row.phaseUnit, batchUs, row.minSniperUs);
      var makerSlot = clearSlot(row.phaseUnit, batchUs, row.makerUs);
      var batchSniped = clobSniped && sniperSlot < makerSlot;

      out.clobFailedMessages += params.snipers;
      if (clobSniped) {
        out.clobSniped += 1;
        out.clobRentBps += profit;
      } else {
        out.noRace += 1;
      }

      if (batchSniped) {
        out.batchSniped += 1;
        out.batchRentBps += profit;
      } else if (clobSniped) {
        out.batchCollapsed += 1;
      }

      if (!out.sample && clobSniped && profit > params.halfSpreadBps) {
        out.sample = {
          absJumpBps: row.absJumpBps,
          batchSniped: batchSniped,
          clobSniped: clobSniped,
          makerClearUs: clearDelayUs(row.phaseUnit, batchUs, row.makerUs),
          makerSlot: makerSlot,
          makerUs: row.makerUs,
          phaseUs: row.phaseUnit * batchUs,
          profitBps: profit,
          sniperClearUs: clearDelayUs(row.phaseUnit, batchUs, row.minSniperUs),
          sniperSlot: sniperSlot,
          sniperUs: row.minSniperUs
        };
      }
    }

    out.meanMakerUs /= Math.max(1, rows.length);
    out.meanMinSniperUs /= Math.max(1, rows.length);
    if (!out.sample) {
      var fallback = rows[0];
      out.sample = {
        absJumpBps: fallback ? fallback.absJumpBps : 0,
        batchSniped: false,
        clobSniped: false,
        makerClearUs: fallback ? clearDelayUs(fallback.phaseUnit, batchUs, fallback.makerUs) : 0,
        makerSlot: 0,
        makerUs: fallback ? fallback.makerUs : 0,
        phaseUs: fallback ? fallback.phaseUnit * batchUs : 0,
        profitBps: 0,
        sniperClearUs: fallback ? clearDelayUs(fallback.phaseUnit, batchUs, fallback.minSniperUs) : 0,
        sniperSlot: 0,
        sniperUs: fallback ? fallback.minSniperUs : 0
      };
    }

    out.batchFailedMessages = out.batchSniped * params.snipers;
    out.clobRate = out.profitable ? out.clobSniped / out.profitable : 0;
    out.batchRate = out.profitable ? out.batchSniped / out.profitable : 0;
    out.collapsedRate = out.profitable ? out.batchCollapsed / out.profitable : 0;
    out.savedRentBps = out.clobRentBps - out.batchRentBps;
    out.clobRentPerNews = out.rows ? out.clobRentBps / out.rows : 0;
    out.batchRentPerNews = out.rows ? out.batchRentBps / out.rows : 0;
    out.savedRentPerNews = out.rows ? out.savedRentBps / out.rows : 0;
    out.investorWaitMs = batchMs / 2;
    out.edge100usValue = clamp(100 / (batchMs * 1000), 0, 1);
    return out;
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var rows = makeRows(params);
    var result = evaluateRows(rows, params, params.batchMs);
    result.params = params;
    result.sweep = sweepRows(rows, params);
    return result;
  }

  function sweepRows(rows, params) {
    var batches = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 25, 50, 100];
    return batches.map(function (batchMs) {
      var row = evaluateRows(rows, params, batchMs);
      return {
        batchMs: batchMs,
        batchRate: row.batchRate,
        clobRate: row.clobRate,
        savedRentPerNews: row.savedRentPerNews,
        waitMs: row.investorWaitMs
      };
    });
  }

  function formatNumber(value, digits) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    });
  }

  function formatLoose(value, digits) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: digits
    });
  }

  function formatPercent(value, digits) {
    return formatNumber(value * 100, digits) + "%";
  }

  function metric(label, value, tone) {
    return '<div class="fba-lab__metric ' + (tone || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(lab, result) {
    var audit = cachedAudit();
    var metrics = [
      metric("CLOB stale fills", formatPercent(result.clobRate, 1), "bad"),
      metric("Batch stale fills", formatPercent(result.batchRate, 2), result.batchRate < result.clobRate ? "good" : "warn"),
      metric("Race rent saved", formatNumber(result.savedRentPerNews, 2) + " bps/news", "good"),
      metric("Races collapsed", formatPercent(result.collapsedRate, 1), "good"),
      metric("Mean wait", formatNumber(result.investorWaitMs, result.investorWaitMs < 1 ? 2 : 1) + " ms", "warn"),
      metric("100us edge value", formatPercent(result.edge100usValue, 2), "warn"),
      metric("Failed msgs cut", formatLoose(result.clobFailedMessages - result.batchFailedMessages, 0), "good"),
      metric("Audit", audit.passed + "/" + audit.checked, audit.ok ? "good" : "bad")
    ];
    lab.querySelector("[data-metrics]").innerHTML = metrics.join("");
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.save();
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, rect.x + 16, rect.y + 24);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "500 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, rect.x + 16, rect.y + 42);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function drawTimeline(ctx, rect, result) {
    panel(ctx, rect, "One public signal", "same information, different matching clock");
    var sample = result.sample;
    var pad = 36;
    var x0 = rect.x + pad;
    var y = rect.y + 104;
    var w = rect.w - pad * 2;
    var maxT = Math.max(sample.makerClearUs, sample.sniperClearUs, sample.makerUs, sample.sniperUs, 1000);
    function xFor(t) {
      return x0 + w * Math.log10(1 + Math.max(0, t)) / Math.log10(1 + maxT);
    }

    line(ctx, x0, y, x0 + w, y, COLORS.axis, 2);
    label(ctx, "shock", x0, y - 16, COLORS.ink, 11, 700, "center");

    var xs = xFor(sample.sniperUs);
    var xm = xFor(sample.makerUs);
    var xsc = xFor(sample.sniperClearUs);
    var xmc = xFor(sample.makerClearUs);

    line(ctx, xs, y - 30, xs, y + 30, COLORS.clob, 2);
    line(ctx, xm, y - 30, xm, y + 30, COLORS.batch, 2);
    label(ctx, "first snipe " + formatLoose(sample.sniperUs, 0) + "us", xs, y - 40, COLORS.clob, 11, 700, "center");
    label(ctx, "cancel " + formatLoose(sample.makerUs, 0) + "us", xm, y + 52, COLORS.batch, 11, 700, "center");

    line(ctx, xsc, y + 72, xsc, y + 112, COLORS.gold, 2);
    line(ctx, xmc, y + 72, xmc, y + 112, COLORS.purple, 2);
    if (rect.w >= 330) {
      label(ctx, "snipe clears", xsc, y + 132, COLORS.gold, 10, 700, "center");
      label(ctx, "cancel clears", xmc, y + 148, COLORS.purple, 10, 700, "center");
    }

    var verdict = sample.batchSniped ? "batch still loses this one" : "same tick: stale quote removed";
    var verdictColor = sample.batchSniped ? COLORS.clob : COLORS.batch;
    if (rect.w < 330) {
      label(ctx, sample.clobSniped ? "CLOB: fastest snipe" : "CLOB: cancel wins", rect.x + 18, rect.y + rect.h - 58, COLORS.ink, 11, 750);
      label(ctx, sample.batchSniped ? "Batch: stale quote trades" : "Batch: same tick removes quote", rect.x + 18, rect.y + rect.h - 38, verdictColor, 11, 750);
      label(ctx, "stale rent " + formatNumber(Math.max(0, sample.profitBps), 2) + " bps", rect.x + 18, rect.y + rect.h - 18, COLORS.muted, 10, 650);
    } else {
      label(ctx, sample.clobSniped ? "CLOB winner: fastest snipe" : "CLOB winner: cancel", rect.x + 18, rect.y + rect.h - 46, COLORS.ink, 12, 750);
      label(ctx, verdict, rect.x + 18, rect.y + rect.h - 26, verdictColor, 12, 750);
      label(ctx, "jump " + formatNumber(sample.absJumpBps, 2) + " bps, stale rent " + formatNumber(Math.max(0, sample.profitBps), 2) + " bps", rect.x + rect.w - 18, rect.y + rect.h - 26, COLORS.muted, 11, 650, "right");
    }
  }

  function drawSweep(ctx, rect, result) {
    panel(ctx, rect, "Batch interval sweep", "y-axis is stale fills among profitable public jumps");
    var gx = rect.x + 54;
    var gy = rect.y + 62;
    var gw = rect.w - 82;
    var gh = rect.h - 108;
    var minMs = 0.02;
    var maxMs = 100;
    var maxY = Math.max(0.02, result.clobRate * 1.08);
    function xFor(ms) {
      return gx + gw * (Math.log10(ms) - Math.log10(minMs)) / (Math.log10(maxMs) - Math.log10(minMs));
    }
    function yFor(rate) {
      return gy + gh - gh * clamp(rate / maxY, 0, 1);
    }

    for (var i = 0; i <= 4; i += 1) {
      var yy = gy + gh * i / 4;
      line(ctx, gx, yy, gx + gw, yy, COLORS.grid, 1);
      label(ctx, formatPercent(maxY * (1 - i / 4), 0), gx - 8, yy + 4, COLORS.muted, 10, 600, "right");
    }
    line(ctx, gx, gy, gx, gy + gh, COLORS.axis, 1);
    line(ctx, gx, gy + gh, gx + gw, gy + gh, COLORS.axis, 1);
    [0.02, 0.1, 1, 10, 100].forEach(function (ms) {
      var x = xFor(ms);
      line(ctx, x, gy + gh, x, gy + gh + 5, COLORS.axis, 1);
      label(ctx, ms < 1 ? formatLoose(ms * 1000, 0) + "us" : formatLoose(ms, 0) + "ms", x, gy + gh + 20, COLORS.muted, 10, 600, "center");
    });

    line(ctx, gx, yFor(result.clobRate), gx + gw, yFor(result.clobRate), COLORS.clob, 2);
    label(ctx, "continuous book", gx + gw - 2, yFor(result.clobRate) - 7, COLORS.clob, 11, 800, "right");

    ctx.beginPath();
    result.sweep.forEach(function (point, index) {
      var x = xFor(point.batchMs);
      var y = yFor(point.batchRate);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = COLORS.batch;
    ctx.lineWidth = 3;
    ctx.stroke();
    result.sweep.forEach(function (point) {
      ctx.fillStyle = COLORS.batch;
      ctx.beginPath();
      ctx.arc(xFor(point.batchMs), yFor(point.batchRate), 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    var selectedX = xFor(result.batchMs);
    line(ctx, selectedX, gy, selectedX, gy + gh, COLORS.gold, 2);
    label(ctx, "selected", selectedX + 5, gy + 12, COLORS.gold, 10, 800);
  }

  function drawRentBars(ctx, rect, result) {
    panel(ctx, rect, "Rent ledger", "basis points of stale-quote rent per public jump");
    var items = [
      { color: COLORS.clob, label: "CLOB", value: result.clobRentPerNews },
      { color: COLORS.batch, label: "batch", value: result.batchRentPerNews },
      { color: COLORS.gold, label: "saved", value: result.savedRentPerNews }
    ];
    var max = Math.max(1, items[0].value, items[1].value, items[2].value);
    var x = rect.x + 34;
    var base = rect.y + rect.h - 42;
    var bw = (rect.w - 92) / items.length;
    items.forEach(function (item, index) {
      var h = (rect.h - 112) * item.value / max;
      var bx = x + index * (bw + 16);
      ctx.fillStyle = item.color;
      ctx.fillRect(bx, base - h, bw, h);
      label(ctx, item.label, bx + bw / 2, base + 20, COLORS.muted, 11, 700, "center");
      label(ctx, formatNumber(item.value, 2), bx + bw / 2, base - h - 8, item.color, 12, 800, "center");
    });
  }

  function drawMessages(ctx, rect, result) {
    panel(ctx, rect, "Message race residue", "failed race messages in the toy matching engine");
    var max = Math.max(1, result.clobFailedMessages, result.batchFailedMessages);
    var rows = [
      { color: COLORS.clob, label: "continuous", value: result.clobFailedMessages },
      { color: COLORS.batch, label: "batch", value: result.batchFailedMessages }
    ];
    var x = rect.x + 28;
    var y = rect.y + 76;
    var w = rect.w - 56;
    rows.forEach(function (row, index) {
      var yy = y + index * 54;
      ctx.fillStyle = COLORS.axis;
      ctx.fillRect(x, yy, w, 14);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, yy, w * row.value / max, 14);
      label(ctx, row.label, x, yy - 8, COLORS.ink, 11, 750);
      label(ctx, formatLoose(row.value, 0), x + w, yy - 8, row.color, 11, 800, "right");
    });
    if (rect.w < 330) {
      label(ctx, formatLoose(result.batchCollapsed, 0) + " CLOB races collapsed", x, rect.y + rect.h - 50, COLORS.batch, 11, 800);
      label(ctx, "into the same batch tick", x, rect.y + rect.h - 32, COLORS.batch, 11, 800);
      label(ctx, "profitable jumps: " + formatLoose(result.profitable, 0) + " of " + formatLoose(result.rows, 0), x, rect.y + rect.h - 14, COLORS.muted, 10, 650);
    } else {
      label(ctx, formatLoose(result.batchCollapsed, 0) + " continuous races landed in the same batch tick", x, rect.y + rect.h - 36, COLORS.batch, 12, 800);
      label(ctx, "profitable jumps: " + formatLoose(result.profitable, 0) + " of " + formatLoose(result.rows, 0), x, rect.y + rect.h - 17, COLORS.muted, 11, 650);
    }
  }

  function draw(ctx, result) {
    var canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var gap = 18;
    var left = 20;
    var top = 20;
    if (canvas.width < 520) {
      var panelW = canvas.width - left * 2;
      var panelH = (canvas.height - top * 2 - gap * 3) / 4;
      drawTimeline(ctx, { x: left, y: top, w: panelW, h: panelH }, result);
      drawSweep(ctx, { x: left, y: top + (panelH + gap), w: panelW, h: panelH }, result);
      drawRentBars(ctx, { x: left, y: top + (panelH + gap) * 2, w: panelW, h: panelH }, result);
      drawMessages(ctx, { x: left, y: top + (panelH + gap) * 3, w: panelW, h: panelH }, result);
    } else {
      var colW = (canvas.width - left * 2 - gap) / 2;
      var rowH = (canvas.height - top * 2 - gap) / 2;
      drawTimeline(ctx, { x: left, y: top, w: colW, h: rowH }, result);
      drawSweep(ctx, { x: left + colW + gap, y: top, w: colW, h: rowH }, result);
      drawRentBars(ctx, { x: left, y: top + rowH + gap, w: colW, h: rowH }, result);
      drawMessages(ctx, { x: left + colW + gap, y: top + rowH + gap, w: colW, h: rowH }, result);
    }
  }

  function resizeCanvas(canvas) {
    var cssWidth = canvas.clientWidth || canvas.width;
    var cssHeight = cssWidth < 520 ? 1120 : Math.max(560, Math.round(cssWidth * 0.74));
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth);
    canvas.height = cssHeight;
    return canvas.getContext("2d");
  }

  function readParams(lab) {
    var raw = {};
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function syncOutputs(lab, params) {
    Object.keys(params).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (!out) return;
      if (key === "batchMs") out.textContent = params.batchMs < 1 ? formatLoose(params.batchMs * 1000, 0) + " us" : formatLoose(params.batchMs, 2) + " ms";
      else if (key === "halfSpreadBps" || key === "jumpBps") out.textContent = formatLoose(params[key], 1) + " bps";
      else if (key === "makerUs" || key === "sniperUs") out.textContent = formatLoose(params[key], 0) + " us";
      else out.textContent = formatLoose(params[key], 0);
    });
  }

  function init(lab) {
    var canvas = lab.querySelector("canvas");
    function update() {
      var params = readParams(lab);
      syncOutputs(lab, params);
      var result = simulate(params);
      renderMetrics(lab, result);
      draw(resizeCanvas(canvas), result);
    }
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });
    global.addEventListener("resize", update);
    update();
  }

  function runAudit() {
    var checks = [];
    function record(name, ok, details) {
      checks.push({ name: name, ok: Boolean(ok), details: details || "" });
    }

    var cleaned = cleanParams({
      batchMs: -3,
      halfSpreadBps: 99,
      jumpBps: "x",
      makerUs: 7,
      seed: 5000,
      shockCount: 12,
      sniperUs: 9999,
      snipers: 0
    });
    record("parameter cleanup clamps and falls back", cleaned.batchMs === 0.02 && cleaned.halfSpreadBps === 8 && cleaned.jumpBps === DEFAULTS.jumpBps && cleaned.snipers === 1);

    var defaultResult = simulate(DEFAULTS);
    record("default profitable sample is nonempty", defaultResult.profitable > 1000 && defaultResult.rows === DEFAULTS.shockCount);
    record("continuous book has more stale fills than 100ms batch", defaultResult.clobSniped > defaultResult.batchSniped);
    record("saved rent balances the ledger", Math.abs(defaultResult.savedRentBps - (defaultResult.clobRentBps - defaultResult.batchRentBps)) < 1e-9);
    record("batch failed messages are no greater than continuous failures", defaultResult.batchFailedMessages <= defaultResult.clobFailedMessages);

    var tinyBatch = simulate(Object.assign({}, DEFAULTS, { batchMs: 0.02 }));
    var largeBatch = simulate(Object.assign({}, DEFAULTS, { batchMs: 100 }));
    record("large batches collapse more races than tiny batches", largeBatch.batchCollapsed > tinyBatch.batchCollapsed);
    record("tiny batch approximates continuous stale-rate ordering", tinyBatch.batchRate > largeBatch.batchRate);

    var fewSnipers = simulate(Object.assign({}, DEFAULTS, { snipers: 1 }));
    var manySnipers = simulate(Object.assign({}, DEFAULTS, { snipers: 16 }));
    record("more snipers increase continuous stale-fill risk", manySnipers.clobRate >= fewSnipers.clobRate);

    var rows = makeRows(cleanParams(DEFAULTS));
    var sweep = sweepRows(rows, cleanParams(DEFAULTS));
    record("sweep covers log-spaced batch intervals", sweep.length === 12 && sweep[0].batchMs === 0.02 && sweep[sweep.length - 1].batchMs === 100);

    return {
      checked: checks.length,
      failures: checks.filter(function (row) { return !row.ok; }),
      ok: checks.every(function (row) { return row.ok; }),
      passed: checks.filter(function (row) { return row.ok; }).length
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  var api = {
    cleanParams: cleanParams,
    runAudit: runAudit,
    simulate: simulate,
    sweepRows: sweepRows
  };

  global.FrequentBatchAuctionLab = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-fba-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-fba-lab]")).forEach(init);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
