(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#607080",
    rule: "#d7dee5",
    grid: "#eef3f7",
    panel: "#f8fafc",
    input: "#2563eb",
    keep: "#0f766e",
    drop: "#cbd5df",
    addr: "#7c3aed",
    output: "#d97706",
    hillis: "#be123c",
    blelloch: "#2563eb",
    serial: "#64748b",
    good: "#15803d",
    bad: "#b91c1c"
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      density: clamp(Number(raw.density == null ? 0.47 : raw.density), 0.05, 0.95),
      logN: clamp(Math.round(raw.logN == null ? 5 : raw.logN), 3, 6),
      seed: clamp(Math.round(raw.seed == null ? 29 : raw.seed), 1, 999)
    };
  }

  function makeItems(rawParams) {
    var params = cleanParams(rawParams);
    var n = 1 << params.logN;
    var random = rng(params.seed * 1000003 + n * 97);
    var items = [];
    var kept = 0;

    for (var i = 0; i < n; i += 1) {
      var wave = 0.5 + 0.5 * Math.sin((i + 0.3 * params.seed) * 1.37);
      var score = 0.62 * random() + 0.38 * wave;
      var keep = score < params.density;
      if (keep) kept += 1;
      items.push({
        flag: keep ? 1 : 0,
        index: i,
        value: String.fromCharCode(65 + (i % 26)) + String(Math.floor(i / 26))
      });
    }

    if (kept === 0) {
      items[Math.floor(n / 2)].flag = 1;
      kept = 1;
    }
    if (kept === n) {
      items[Math.floor(n / 3)].flag = 0;
      kept -= 1;
    }

    return {
      flags: items.map(function (item) { return item.flag; }),
      items: items,
      kept: kept,
      params: params
    };
  }

  function serialExclusive(flags) {
    var out = [];
    var acc = 0;
    for (var i = 0; i < flags.length; i += 1) {
      out.push(acc);
      acc += flags[i];
    }
    return {
      exclusive: out,
      span: Math.max(0, flags.length - 1),
      total: acc,
      work: Math.max(0, flags.length - 1)
    };
  }

  function hillisSteeleExclusive(flags) {
    var n = flags.length;
    var values = flags.slice();
    var stages = [];
    var work = 0;

    for (var offset = 1; offset < n; offset *= 2) {
      var previous = values.slice();
      var ops = [];
      for (var i = 0; i < n; i += 1) {
        if (i >= offset) {
          values[i] = previous[i] + previous[i - offset];
          ops.push({ from: i - offset, to: i });
          work += 1;
        } else {
          values[i] = previous[i];
        }
      }
      stages.push({
        label: "stride " + offset,
        ops: ops,
        values: values.slice()
      });
    }

    return {
      exclusive: values.map(function (_, i) { return i === 0 ? 0 : values[i - 1]; }),
      inclusive: values,
      span: stages.length,
      stages: stages,
      total: values[n - 1],
      work: work
    };
  }

  function blellochExclusive(flags) {
    var n = flags.length;
    var values = flags.slice();
    var stages = [];
    var adds = 0;
    var swaps = 0;

    for (var stride = 1; stride < n; stride *= 2) {
      var upOps = [];
      for (var end = 2 * stride - 1; end < n; end += 2 * stride) {
        var left = end - stride;
        values[end] += values[left];
        upOps.push({ from: left, to: end });
        adds += 1;
      }
      stages.push({
        label: "up " + stride,
        ops: upOps,
        phase: "up",
        values: values.slice()
      });
    }

    var total = values[n - 1];
    values[n - 1] = 0;
    stages.push({
      label: "root = 0",
      ops: [{ from: n - 1, to: n - 1, root: true }],
      phase: "root",
      values: values.slice()
    });

    for (var down = n / 2; down >= 1; down /= 2) {
      var downOps = [];
      for (var end2 = 2 * down - 1; end2 < n; end2 += 2 * down) {
        var left2 = end2 - down;
        var t = values[left2];
        values[left2] = values[end2];
        values[end2] += t;
        downOps.push({ from: left2, to: end2, swap: true });
        adds += 1;
        swaps += 1;
      }
      stages.push({
        label: "down " + down,
        ops: downOps,
        phase: "down",
        values: values.slice()
      });
    }

    return {
      adds: adds,
      exclusive: values,
      span: 2 * Math.round(Math.log(n) / Math.log(2)),
      stages: stages,
      swaps: swaps,
      total: total,
      work: adds
    };
  }

  function compact(items, addresses) {
    var out = [];
    items.forEach(function (item, i) {
      if (item.flag) out[addresses[i]] = item.value;
    });
    return out;
  }

  function sameArray(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function evaluate(rawParams) {
    var data = makeItems(rawParams);
    var serial = serialExclusive(data.flags);
    var hillis = hillisSteeleExclusive(data.flags);
    var blelloch = blellochExclusive(data.flags);
    var serialOut = compact(data.items, serial.exclusive);
    var hillisOut = compact(data.items, hillis.exclusive);
    var blellochOut = compact(data.items, blelloch.exclusive);
    var logN = data.params.logN;
    var n = data.flags.length;
    var expectedHillisWork = n * logN - (n - 1);
    var expectedBlellochWork = 2 * (n - 1);

    return {
      addresses: serial.exclusive,
      blelloch: blelloch,
      checks: {
        blellochFormula: blelloch.work === expectedBlellochWork,
        blellochMatchesSerial: sameArray(blelloch.exclusive, serial.exclusive),
        compactionStable: sameArray(serialOut, hillisOut) && sameArray(serialOut, blellochOut),
        hillisFormula: hillis.work === expectedHillisWork,
        hillisMatchesSerial: sameArray(hillis.exclusive, serial.exclusive),
        totalsMatch: serial.total === hillis.total && serial.total === blelloch.total
      },
      data: data,
      expectedBlellochWork: expectedBlellochWork,
      expectedHillisWork: expectedHillisWork,
      hillis: hillis,
      output: serialOut,
      serial: serial
    };
  }

  function runAudit() {
    var cases = 0;
    var ok = 0;
    var failures = [];
    for (var logN = 3; logN <= 6; logN += 1) {
      for (var density = 15; density <= 85; density += 10) {
        for (var seed = 1; seed <= 9; seed += 1) {
          cases += 1;
          var result = evaluate({ logN: logN, density: density / 100, seed: seed * 17 + logN });
          var passed = Object.keys(result.checks).every(function (key) { return result.checks[key]; });
          if (passed) ok += 1;
          else failures.push({ logN: logN, density: density, seed: seed, checks: result.checks });
        }
      }
    }
    return {
      cases: cases,
      failures: failures.slice(0, 3),
      ok: ok
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 0 : digits);
  }

  function metric(label, value) {
    return '<div class="prefix-scan-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, box.x + 12, box.y + 21, COLORS.text, 13, 780);
    if (subtitle) label(ctx, subtitle, box.x + 12, box.y + 38, COLORS.muted, 10, 650);
  }

  function cellGeometry(box, n, topPad) {
    var gap = n <= 16 ? 4 : n <= 32 ? 2 : 1;
    var available = box.w - 48;
    var cell = Math.max(3, Math.min(24, (available - gap * (n - 1)) / n));
    var total = cell * n + gap * (n - 1);
    return {
      cell: cell,
      gap: gap,
      startX: box.x + (box.w - total) / 2,
      y: box.y + topPad
    };
  }

  function drawCells(ctx, items, addresses, output, box) {
    panel(ctx, box, "flags become addresses", "exclusive scan turns local keep/drop choices into write positions");
    var n = items.length;
    var geom = cellGeometry(box, n, 68);
    var cell = geom.cell;
    var gap = geom.gap;
    var x0 = geom.startX;
    var y0 = geom.y;
    var showText = cell >= 13;
    var addrText = cell >= 17;

    label(ctx, "input", box.x + 14, y0 + 15, COLORS.muted, 10, 700);
    label(ctx, "flag", box.x + 14, y0 + 52, COLORS.muted, 10, 700);
    label(ctx, "addr", box.x + 14, y0 + 89, COLORS.muted, 10, 700);

    for (var i = 0; i < n; i += 1) {
      var x = x0 + i * (cell + gap);
      var item = items[i];
      ctx.fillStyle = item.flag ? "#e6f4ef" : "#f1f5f9";
      ctx.strokeStyle = item.flag ? "#8bd3bd" : COLORS.drop;
      ctx.lineWidth = 1;
      ctx.fillRect(x, y0, cell, 25);
      ctx.strokeRect(x, y0, cell, 25);
      if (showText) label(ctx, item.value, x + cell / 2, y0 + 17, item.flag ? COLORS.keep : COLORS.muted, 9, 760, "center");

      ctx.fillStyle = item.flag ? COLORS.keep : COLORS.drop;
      ctx.fillRect(x, y0 + 37, cell, 25);
      if (showText) label(ctx, String(item.flag), x + cell / 2, y0 + 54, "#ffffff", 9, 780, "center");

      ctx.fillStyle = item.flag ? "#efe7ff" : "#f8fafc";
      ctx.strokeStyle = item.flag ? "#c4b5fd" : COLORS.rule;
      ctx.fillRect(x, y0 + 74, cell, 25);
      ctx.strokeRect(x, y0 + 74, cell, 25);
      if (addrText) label(ctx, String(addresses[i]), x + cell / 2, y0 + 91, item.flag ? COLORS.addr : COLORS.muted, 9, 760, "center");
    }

    var outY = y0 + 128;
    label(ctx, "compacted output", box.x + 14, outY + 16, COLORS.muted, 10, 700);
    var outN = Math.max(1, output.length);
    var outGeom = {
      cell: Math.max(5, Math.min(30, (box.w - 142 - Math.max(0, outN - 1) * 3) / outN)),
      gap: 3,
      startX: box.x + 118
    };
    output.forEach(function (value, i) {
      var x = outGeom.startX + i * (outGeom.cell + outGeom.gap);
      ctx.fillStyle = "#fff7ed";
      ctx.strokeStyle = "#fed7aa";
      ctx.fillRect(x, outY, outGeom.cell, 27);
      ctx.strokeRect(x, outY, outGeom.cell, 27);
      if (outGeom.cell >= 14) label(ctx, value, x + outGeom.cell / 2, outY + 18, COLORS.output, 9, 780, "center");
    });
    if (!output.length) label(ctx, "empty", outGeom.startX, outY + 18, COLORS.muted, 10, 650);
  }

  function drawSchedule(ctx, stages, box, color, title, subtitle) {
    label(ctx, title, box.x, box.y, color, 11, 800);
    label(ctx, subtitle, box.x, box.y + 16, COLORS.muted, 9, 650);
    var usableH = box.h - 28;
    var rowH = Math.max(12, Math.min(21, usableH / Math.max(1, stages.length)));
    var n = stages[0] && stages[0].values ? stages[0].values.length : 1;
    var xFor = function (i) {
      return box.x + 76 + i / Math.max(1, n - 1) * (box.w - 92);
    };

    stages.forEach(function (stage, row) {
      var y = box.y + 34 + row * rowH;
      label(ctx, stage.label, box.x, y + 4, COLORS.muted, 9, 650);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(box.x + 72, y);
      ctx.lineTo(box.x + box.w - 10, y);
      ctx.stroke();

      stage.ops.forEach(function (op) {
        var x1 = xFor(op.from);
        var x2 = xFor(op.to);
        ctx.strokeStyle = color;
        ctx.globalAlpha = op.root ? 0.22 : op.swap ? 0.38 : 0.28;
        ctx.lineWidth = op.swap ? 2 : 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y - 3);
        ctx.lineTo(x2, y + 3);
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x2, y + 3, op.root ? 2.5 : 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    });
  }

  function drawSchedules(ctx, result, box) {
    panel(ctx, box, "two prefix machines", "one spends extra adds for shorter span; one sweeps a tree twice");
    var inner = { x: box.x + 14, y: box.y + 52, w: box.w - 28, h: box.h - 68 };
    var half = (inner.h - 14) / 2;
    drawSchedule(ctx, result.hillis.stages, { x: inner.x, y: inner.y, w: inner.w, h: half }, COLORS.hillis, "Hillis-Steele", "span " + result.hillis.span + ", adds " + result.hillis.work);
    drawSchedule(ctx, result.blelloch.stages, { x: inner.x, y: inner.y + half + 14, w: inner.w, h: half }, COLORS.blelloch, "Blelloch", "span " + result.blelloch.span + ", adds " + result.blelloch.work);
  }

  function bar(ctx, x, y, w, h, value, max, color, name, number) {
    var bw = w * value / Math.max(1e-9, max);
    ctx.fillStyle = "#edf2f7";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, bw, h);
    label(ctx, name, x, y - 5, COLORS.muted, 9, 700);
    label(ctx, number, x + w + 8, y + h - 3, COLORS.text, 10, 760);
  }

  function drawWork(ctx, result, box) {
    panel(ctx, box, "work and span", "parallel time is not the same budget as total arithmetic");
    var x = box.x + 92;
    var y = box.y + 62;
    var w = box.w - 154;
    var maxWork = Math.max(result.serial.work, result.hillis.work, result.blelloch.work);
    var maxSpan = Math.max(result.serial.span, result.hillis.span, result.blelloch.span);
    label(ctx, "adds", box.x + 18, y + 11, COLORS.text, 11, 800);
    bar(ctx, x, y, w, 16, result.serial.work, maxWork, COLORS.serial, "serial", String(result.serial.work));
    bar(ctx, x, y + 35, w, 16, result.hillis.work, maxWork, COLORS.hillis, "Hillis-Steele", String(result.hillis.work));
    bar(ctx, x, y + 70, w, 16, result.blelloch.work, maxWork, COLORS.blelloch, "Blelloch", String(result.blelloch.work));

    var y2 = y + 126;
    label(ctx, "span", box.x + 18, y2 + 11, COLORS.text, 11, 800);
    bar(ctx, x, y2, w, 16, result.serial.span, maxSpan, COLORS.serial, "serial", String(result.serial.span));
    bar(ctx, x, y2 + 35, w, 16, result.hillis.span, maxSpan, COLORS.hillis, "Hillis-Steele", String(result.hillis.span));
    bar(ctx, x, y2 + 70, w, 16, result.blelloch.span, maxSpan, COLORS.blelloch, "Blelloch", String(result.blelloch.span));
  }

  function draw(result, canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(280, Math.floor(rect.width || canvas.clientWidth || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var narrow = cssWidth < 560;
    var pad = narrow ? 12 : 18;
    var gap = narrow ? 14 : 18;
    var panelH = narrow ? 270 : 254;
    var cssHeight = narrow ? pad * 2 + panelH * 3 + gap * 2 : pad * 2 + panelH * 2 + gap;
    var targetWidth = Math.round(cssWidth * ratio);
    var targetHeight = Math.round(cssHeight * ratio);

    canvas.style.height = cssHeight + "px";
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (narrow) {
      drawCells(ctx, result.data.items, result.addresses, result.output, { x: pad, y: pad, w: cssWidth - 2 * pad, h: panelH });
      drawSchedules(ctx, result, { x: pad, y: pad + panelH + gap, w: cssWidth - 2 * pad, h: panelH });
      drawWork(ctx, result, { x: pad, y: pad + 2 * (panelH + gap), w: cssWidth - 2 * pad, h: panelH });
    } else {
      drawCells(ctx, result.data.items, result.addresses, result.output, { x: pad, y: pad, w: cssWidth - 2 * pad, h: panelH });
      drawSchedules(ctx, result, { x: pad, y: pad + panelH + gap, w: (cssWidth - 3 * pad) * 0.58, h: panelH });
      drawWork(ctx, result, { x: pad + (cssWidth - 3 * pad) * 0.58 + gap, y: pad + panelH + gap, w: cssWidth - (pad + (cssWidth - 3 * pad) * 0.58 + gap) - pad, h: panelH });
    }
  }

  function readParams(lab) {
    function number(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      var value = input ? Number(input.value) : fallback;
      return isFinite(value) ? value : fallback;
    }
    return {
      density: number("density", 47) / 100,
      logN: number("logN", 5),
      seed: number("seed", 29)
    };
  }

  function updateOutputs(lab, params) {
    var labels = {
      density: fmt(params.density * 100, 0) + "%",
      logN: String(1 << params.logN),
      seed: String(params.seed)
    };
    Object.keys(labels).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(lab) {
    var params = cleanParams(readParams(lab));
    var result = evaluate(params);
    var audit = cachedAudit();
    updateOutputs(lab, params);

    var saved = result.hillis.work - result.blelloch.work;
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("kept rows", result.output.length + "/" + result.data.items.length),
        metric("serial span", String(result.serial.span)),
        metric("Hillis adds", String(result.hillis.work)),
        metric("Blelloch adds", String(result.blelloch.work)),
        metric("adds saved", String(saved)),
        metric("audit", audit.ok + "/" + audit.cases)
      ].join("");
    }

    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function init(lab) {
    var frame = null;
    function redrawSoon() {
      if (frame != null) return;
      if (!global.requestAnimationFrame) {
        render(lab);
        return;
      }
      frame = global.requestAnimationFrame(function () {
        frame = null;
        render(lab);
      });
    }

    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () { render(lab); });
      input.addEventListener("change", function () { render(lab); });
    });
    if (global.addEventListener) global.addEventListener("resize", redrawSoon);
    render(lab);
  }

  function initAll() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-prefix-scan-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    blellochExclusive: blellochExclusive,
    compact: compact,
    evaluate: evaluate,
    hillisSteeleExclusive: hillisSteeleExclusive,
    makeItems: makeItems,
    runAudit: runAudit,
    serialExclusive: serialExclusive
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PrefixScanLab = api;
})(typeof window !== "undefined" ? window : globalThis);
