(function (global) {
  "use strict";

  var METHOD_ORDER = ["hilbert", "morton", "row"];

  var METHODS = {
    hilbert: { color: "#0f766e", key: "hilbert", label: "Hilbert" },
    morton: { color: "#2563eb", key: "morton", label: "Z-order" },
    row: { color: "#d97706", key: "row", label: "row-major" }
  };

  var COLORS = {
    background: "#ffffff",
    grid: "#e6edf3",
    ink: "#172026",
    muted: "#5d6872",
    panel: "#f8fafc",
    query: "#0f766e",
    rule: "#d7dee5",
    waste: "#f3b391",
    warning: "#be123c"
  };

  var DEFAULTS = {
    budget: 8,
    focus: "hilbert",
    order: 5,
    queryH: 20,
    queryW: 4,
    queryX: 4,
    queryY: 4,
    samples: 320,
    seed: 73
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var order = Math.round(clamp(finite(Number(raw.order), DEFAULTS.order), 3, 7));
    var n = 1 << order;
    var queryW = Math.round(clamp(finite(Number(raw.queryW), DEFAULTS.queryW), 1, n));
    var queryH = Math.round(clamp(finite(Number(raw.queryH), DEFAULTS.queryH), 1, n));
    var queryX = Math.round(clamp(finite(Number(raw.queryX), DEFAULTS.queryX), 0, n - queryW));
    var queryY = Math.round(clamp(finite(Number(raw.queryY), DEFAULTS.queryY), 0, n - queryH));
    var focus = METHODS[raw.focus] ? raw.focus : DEFAULTS.focus;
    return {
      budget: Math.round(clamp(finite(Number(raw.budget), DEFAULTS.budget), 1, Math.min(80, n * n))),
      focus: focus,
      n: n,
      order: order,
      queryH: queryH,
      queryW: queryW,
      queryX: queryX,
      queryY: queryY,
      samples: Math.round(clamp(finite(Number(raw.samples), DEFAULTS.samples), 40, 1600)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 999))
    };
  }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function formatNumber(value, digits) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    });
  }

  function rowIndex(n, x, y) {
    return y * n + x;
  }

  function mortonIndex(order, x, y) {
    var out = 0;
    for (var bit = 0; bit < order; bit += 1) {
      out |= ((x >> bit) & 1) << (2 * bit);
      out |= ((y >> bit) & 1) << (2 * bit + 1);
    }
    return out;
  }

  function rotateHilbert(size, x, y, rx, ry) {
    if (ry === 0) {
      if (rx === 1) {
        x = size - 1 - x;
        y = size - 1 - y;
      }
      var t = x;
      x = y;
      y = t;
    }
    return { x: x, y: y };
  }

  function hilbertIndex(n, x, y) {
    var d = 0;
    for (var s = n / 2; s > 0; s = Math.floor(s / 2)) {
      var rx = (x & s) ? 1 : 0;
      var ry = (y & s) ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      var rotated = rotateHilbert(s, x, y, rx, ry);
      x = rotated.x;
      y = rotated.y;
    }
    return d;
  }

  function indexOf(method, params, x, y) {
    if (method === "row") return rowIndex(params.n, x, y);
    if (method === "morton") return mortonIndex(params.order, x, y);
    return hilbertIndex(params.n, x, y);
  }

  function queryRect(params, x, y) {
    return {
      h: params.queryH,
      w: params.queryW,
      x: typeof x === "number" ? x : params.queryX,
      y: typeof y === "number" ? y : params.queryY
    };
  }

  function ranksForRect(params, method, rect) {
    var ranks = [];
    for (var yy = rect.y; yy < rect.y + rect.h; yy += 1) {
      for (var xx = rect.x; xx < rect.x + rect.w; xx += 1) {
        ranks.push(indexOf(method, params, xx, yy));
      }
    }
    ranks.sort(function (a, b) { return a - b; });
    return ranks;
  }

  function exactIntervalsFromRanks(ranks) {
    var intervals = [];
    if (!ranks.length) return intervals;
    var start = ranks[0];
    var end = ranks[0];
    for (var i = 1; i < ranks.length; i += 1) {
      if (ranks[i] === end + 1) {
        end = ranks[i];
      } else {
        intervals.push({ end: end, start: start });
        start = ranks[i];
        end = ranks[i];
      }
    }
    intervals.push({ end: end, start: start });
    return intervals;
  }

  function mergeIntervals(intervals, budget) {
    if (intervals.length <= budget) {
      return {
        intervals: intervals.map(function (row) { return { end: row.end, start: row.start }; }),
        mergedGaps: [],
        waste: 0
      };
    }
    var gaps = [];
    for (var i = 0; i < intervals.length - 1; i += 1) {
      gaps.push({
        cost: intervals[i + 1].start - intervals[i].end - 1,
        index: i
      });
    }
    gaps.sort(function (a, b) {
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.index - b.index;
    });
    var selected = {};
    var needed = intervals.length - budget;
    var waste = 0;
    for (var j = 0; j < needed; j += 1) {
      selected[gaps[j].index] = true;
      waste += gaps[j].cost;
    }
    var merged = [];
    var current = { end: intervals[0].end, start: intervals[0].start };
    for (var k = 0; k < intervals.length - 1; k += 1) {
      if (selected[k]) {
        current.end = intervals[k + 1].end;
      } else {
        merged.push(current);
        current = { end: intervals[k + 1].end, start: intervals[k + 1].start };
      }
    }
    merged.push(current);
    return {
      intervals: merged,
      mergedGaps: Object.keys(selected).map(Number),
      waste: waste
    };
  }

  function analyzeRect(params, method, rect) {
    var exactCells = rect.w * rect.h;
    var exact = exactIntervalsFromRanks(ranksForRect(params, method, rect));
    var merged = mergeIntervals(exact, params.budget);
    var scanned = exactCells + merged.waste;
    return {
      amplification: scanned / exactCells,
      budgetedIntervals: merged.intervals,
      exactCells: exactCells,
      fragments: exact.length,
      mergedFragments: merged.intervals.length,
      method: method,
      rect: rect,
      scannedCells: scanned,
      wasteCells: merged.waste
    };
  }

  function allPositions(params) {
    var out = [];
    for (var y = 0; y <= params.n - params.queryH; y += 1) {
      for (var x = 0; x <= params.n - params.queryW; x += 1) {
        out.push({ x: x, y: y });
      }
    }
    return out;
  }

  function sampledPositions(params) {
    var positions = allPositions(params);
    if (positions.length <= 4096) return { exact: true, positions: positions };
    var rng = mulberry32(params.seed * 4099 + params.order * 131 + params.queryW * 17 + params.queryH);
    var out = [];
    var seen = {};
    var cap = Math.min(params.samples, positions.length);
    var attempts = 0;
    while (out.length < cap && attempts < cap * 12) {
      attempts += 1;
      var x = Math.floor(rng() * (params.n - params.queryW + 1));
      var y = Math.floor(rng() * (params.n - params.queryH + 1));
      var key = x + "," + y;
      if (!seen[key]) {
        seen[key] = true;
        out.push({ x: x, y: y });
      }
    }
    while (out.length < cap) {
      var pick = positions[Math.floor(rng() * positions.length)];
      out.push(pick);
    }
    return { exact: false, positions: out };
  }

  function averageForMethod(params, method, positionRows) {
    var fragments = 0;
    var amplification = 0;
    var waste = 0;
    positionRows.forEach(function (pos) {
      var row = analyzeRect(params, method, queryRect(params, pos.x, pos.y));
      fragments += row.fragments;
      amplification += row.amplification;
      waste += row.wasteCells;
    });
    var denom = Math.max(1, positionRows.length);
    return {
      amplification: amplification / denom,
      fragments: fragments / denom,
      method: method,
      positions: positionRows.length,
      wasteCells: waste / denom
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var rect = queryRect(params);
    var positions = sampledPositions(params);
    var methods = {};
    var averages = {};
    METHOD_ORDER.forEach(function (method) {
      methods[method] = analyzeRect(params, method, rect);
      averages[method] = averageForMethod(params, method, positions.positions);
    });
    var perimeterEstimate = (params.queryW + params.queryH) / 2;
    return {
      averages: averages,
      averageExact: positions.exact,
      focus: methods[params.focus],
      methods: methods,
      params: params,
      perimeterEstimate: perimeterEstimate,
      positions: positions.positions.length,
      rect: rect
    };
  }

  function orderedCells(params, method) {
    var cells = [];
    for (var y = 0; y < params.n; y += 1) {
      for (var x = 0; x < params.n; x += 1) {
        cells.push({ rank: indexOf(method, params, x, y), x: x, y: y });
      }
    }
    cells.sort(function (a, b) { return a.rank - b.rank; });
    return cells;
  }

  function rankInIntervals(intervals, rank) {
    for (var i = 0; i < intervals.length; i += 1) {
      if (rank >= intervals[i].start && rank <= intervals[i].end) return true;
      if (rank < intervals[i].start) return false;
    }
    return false;
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 650) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 16, box.y + 24, COLORS.ink, 13, 800);
    drawText(ctx, subtitle, box.x + 16, box.y + 43, COLORS.muted, 10, 650);
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = global.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.width || 960));
    var height = width < 620 ? Math.round(width * 1.78) : Math.round(width * 0.78);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function drawMap(ctx, result, box) {
    var method = result.params.focus;
    var info = METHODS[method];
    panel(ctx, box, "the grid, flattened by " + info.label, "green cells are the query; peach cells are read only after range merging");
    var n = result.params.n;
    var top = box.y + 58;
    var availableW = box.w - 34;
    var availableH = box.h - 92;
    var cell = Math.min(availableW / n, availableH / n);
    var gridW = cell * n;
    var gridH = cell * n;
    var x0 = box.x + (box.w - gridW) / 2;
    var y0 = top + Math.max(0, (availableH - gridH) / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x0, y0, gridW, gridH);
    if (n <= 32) {
      var path = orderedCells(result.params, method);
      ctx.save();
      ctx.strokeStyle = info.color;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = Math.max(1, cell * 0.16);
      ctx.beginPath();
      path.forEach(function (cellInfo, index) {
        var cx = x0 + (cellInfo.x + 0.5) * cell;
        var cy = y0 + (cellInfo.y + 0.5) * cell;
        if (index === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
      ctx.restore();
    }
    for (var y = 0; y < n; y += 1) {
      for (var x = 0; x < n; x += 1) {
        var exact = x >= result.rect.x && x < result.rect.x + result.rect.w && y >= result.rect.y && y < result.rect.y + result.rect.h;
        var rank = indexOf(method, result.params, x, y);
        var scanned = rankInIntervals(result.focus.budgetedIntervals, rank);
        if (scanned || exact) {
          ctx.save();
          ctx.globalAlpha = exact ? 0.82 : 0.55;
          ctx.fillStyle = exact ? info.color : COLORS.waste;
          ctx.fillRect(x0 + x * cell, y0 + y * cell, Math.ceil(cell), Math.ceil(cell));
          ctx.restore();
        }
      }
    }
    if (cell >= 5) {
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      for (var gx = 0; gx <= n; gx += 1) {
        ctx.beginPath();
        ctx.moveTo(x0 + gx * cell, y0);
        ctx.lineTo(x0 + gx * cell, y0 + gridH);
        ctx.stroke();
      }
      for (var gy = 0; gy <= n; gy += 1) {
        ctx.beginPath();
        ctx.moveTo(x0, y0 + gy * cell);
        ctx.lineTo(x0 + gridW, y0 + gy * cell);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = COLORS.warning;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      x0 + result.rect.x * cell + 1,
      y0 + result.rect.y * cell + 1,
      result.rect.w * cell - 2,
      result.rect.h * cell - 2
    );
    drawText(
      ctx,
      result.focus.exactCells + " exact cells; " + result.focus.scannedCells + " cells after budget",
      box.x + 16,
      box.y + box.h - 18,
      COLORS.muted,
      10,
      700
    );
  }

  function drawKeySpace(ctx, result, box) {
    var method = result.params.focus;
    var info = METHODS[method];
    panel(ctx, box, "the rectangle becomes intervals", result.focus.fragments + " exact ranges, " + result.focus.mergedFragments + " ranges after budget");
    var total = result.params.n * result.params.n - 1;
    var axis = { h: 28, w: box.w - 40, x: box.x + 20, y: box.y + 92 };
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.fillRect(axis.x, axis.y, axis.w, axis.h);
    ctx.strokeRect(axis.x + 0.5, axis.y + 0.5, axis.w - 1, axis.h - 1);
    function sx(rank) {
      return axis.x + rank / Math.max(1, total) * axis.w;
    }
    result.focus.budgetedIntervals.forEach(function (interval) {
      var x0 = sx(interval.start);
      var x1 = sx(interval.end + 1);
      ctx.fillStyle = COLORS.waste;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x0, axis.y + 2, Math.max(1, x1 - x0), axis.h - 4);
      ctx.globalAlpha = 1;
    });
    exactIntervalsFromRanks(ranksForRect(result.params, method, result.rect)).forEach(function (interval) {
      var x0 = sx(interval.start);
      var x1 = sx(interval.end + 1);
      ctx.fillStyle = info.color;
      ctx.fillRect(x0, axis.y + 7, Math.max(1, x1 - x0), axis.h - 14);
    });
    drawText(ctx, "rank 0", axis.x, axis.y - 12, COLORS.muted, 10, 700);
    drawText(ctx, "rank " + total.toLocaleString(), axis.x + axis.w, axis.y - 12, COLORS.muted, 10, 700, "right");
    var rows = [
      "exact ranges: " + result.focus.fragments,
      "budgeted ranges: " + result.focus.mergedFragments + " / " + result.params.budget,
      "extra cells read: " + result.focus.wasteCells,
      "amplification: " + formatNumber(result.focus.amplification, 2) + "x"
    ];
    rows.forEach(function (text, index) {
      drawText(ctx, text, box.x + 20, axis.y + axis.h + 30 + index * 19, index === 3 ? info.color : COLORS.ink, 11, index === 3 ? 800 : 700);
    });
  }

  function drawBar(ctx, x, y, w, h, value, maxValue, color, label, valueLabel) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(1, w * value / Math.max(1e-9, maxValue)), h);
    drawText(ctx, label, x, y - 6, COLORS.muted, 10, 750);
    drawText(ctx, valueLabel, x + w + 8, y + h - 4, COLORS.ink, 10, 750);
  }

  function drawComparison(ctx, result, box) {
    panel(ctx, box, "three orders, one query", "exact range count and budgeted scan amplification");
    var maxFragments = 1;
    var maxAmp = 1;
    METHOD_ORDER.forEach(function (method) {
      maxFragments = Math.max(maxFragments, result.methods[method].fragments);
      maxAmp = Math.max(maxAmp, result.methods[method].amplification);
    });
    var left = box.x + 20;
    var right = box.x + box.w / 2 + 8;
    var y0 = box.y + 83;
    METHOD_ORDER.forEach(function (method, index) {
      var row = result.methods[method];
      var y = y0 + index * 52;
      drawBar(ctx, left, y, box.w / 2 - 44, 14, row.fragments, maxFragments, METHODS[method].color, METHODS[method].label, String(row.fragments));
      drawBar(ctx, right, y, box.w / 2 - 62, 14, row.amplification, maxAmp, METHODS[method].color, "budgeted read", formatNumber(row.amplification, 2) + "x");
    });
    drawText(ctx, "A B-tree can seek the exact ranges. The budget knob asks what happens when you merge small gaps.", box.x + 20, box.y + box.h - 20, COLORS.muted, 10, 650);
  }

  function drawAverages(ctx, result, box) {
    var mode = result.averageExact ? "all " : "sampled ";
    panel(ctx, box, "move the same window around", mode + result.positions + " positions; Hilbert perimeter rule shown as a tick");
    var maxFragments = result.perimeterEstimate;
    var maxAmp = 1;
    METHOD_ORDER.forEach(function (method) {
      maxFragments = Math.max(maxFragments, result.averages[method].fragments);
      maxAmp = Math.max(maxAmp, result.averages[method].amplification);
    });
    var x = box.x + 24;
    var y0 = box.y + 84;
    var w = box.w - 126;
    METHOD_ORDER.forEach(function (method, index) {
      var avg = result.averages[method];
      var y = y0 + index * 48;
      drawBar(ctx, x, y, w, 14, avg.fragments, maxFragments, METHODS[method].color, METHODS[method].label + " avg ranges", formatNumber(avg.fragments, 1));
    });
    var tickX = x + w * result.perimeterEstimate / Math.max(1e-9, maxFragments);
    ctx.strokeStyle = COLORS.warning;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tickX, y0 - 8);
    ctx.lineTo(tickX, y0 + 3 * 48 - 16);
    ctx.stroke();
    drawText(ctx, "perimeter / 4 = " + formatNumber(result.perimeterEstimate, 1), tickX + 6, y0 + 3 * 48 - 22, COLORS.warning, 10, 800);
    var ampY = box.y + box.h - 45;
    METHOD_ORDER.forEach(function (method, index) {
      var avg = result.averages[method];
      var x0 = box.x + 24 + index * ((box.w - 48) / 3);
      drawText(ctx, METHODS[method].label + " " + formatNumber(avg.amplification, 2) + "x", x0, ampY, METHODS[method].color, 11, 800);
    });
    drawText(ctx, "average budgeted amplification", box.x + 24, box.y + box.h - 21, COLORS.muted, 10, 650);
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    var margin = 18;
    var gap = 18;
    if (width < 620) {
      var h = (height - 2 * margin - 3 * gap) / 4;
      drawMap(ctx, result, { h: h, w: width - 2 * margin, x: margin, y: margin });
      drawKeySpace(ctx, result, { h: h, w: width - 2 * margin, x: margin, y: margin + h + gap });
      drawComparison(ctx, result, { h: h, w: width - 2 * margin, x: margin, y: margin + 2 * (h + gap) });
      drawAverages(ctx, result, { h: h, w: width - 2 * margin, x: margin, y: margin + 3 * (h + gap) });
    } else {
      var colW = (width - 2 * margin - gap) / 2;
      var rowH = (height - 2 * margin - gap) / 2;
      drawMap(ctx, result, { h: rowH, w: colW, x: margin, y: margin });
      drawKeySpace(ctx, result, { h: rowH, w: colW, x: margin + colW + gap, y: margin });
      drawComparison(ctx, result, { h: rowH, w: colW, x: margin, y: margin + rowH + gap });
      drawAverages(ctx, result, { h: rowH, w: colW, x: margin + colW + gap, y: margin + rowH + gap });
    }
  }

  function metric(label, value, accent) {
    return '<div class="space-index-lab__metric' + (accent ? " " + accent : "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    box.innerHTML = [
      metric("Hilbert exact ranges", String(result.methods.hilbert.fragments), "good"),
      metric("Z-order exact ranges", String(result.methods.morton.fragments)),
      metric("row-major exact ranges", String(result.methods.row.fragments)),
      metric("focus amplification", formatNumber(result.focus.amplification, 2) + "x", result.focus.amplification === 1 ? "good" : ""),
      metric("Hilbert avg ranges", formatNumber(result.averages.hilbert.fragments, 1), "good"),
      metric("perimeter / 4 rule", formatNumber(result.perimeterEstimate, 1))
    ].join("");
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setOutput(root, key, value) {
    root.querySelectorAll('[data-value="' + key + '"]').forEach(function (node) {
      node.textContent = value;
    });
  }

  function syncControls(root, params) {
    var limits = {
      budget: { max: Math.min(80, params.n * params.n), min: 1, value: params.budget },
      order: { max: 7, min: 3, value: params.order },
      queryH: { max: params.n, min: 1, value: params.queryH },
      queryW: { max: params.n, min: 1, value: params.queryW },
      queryX: { max: params.n - params.queryW, min: 0, value: params.queryX },
      queryY: { max: params.n - params.queryH, min: 0, value: params.queryY },
      samples: { max: 1600, min: 40, value: params.samples },
      seed: { max: 999, min: 1, value: params.seed }
    };
    Object.keys(limits).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (!input) return;
      input.min = limits[key].min;
      input.max = limits[key].max;
      input.value = limits[key].value;
    });
    var focus = root.querySelector('[data-param="focus"]');
    if (focus) focus.value = params.focus;
    setOutput(root, "budget", String(params.budget));
    setOutput(root, "focus", METHODS[params.focus].label);
    setOutput(root, "grid", params.n + " x " + params.n);
    setOutput(root, "order", String(params.order));
    setOutput(root, "queryH", String(params.queryH));
    setOutput(root, "queryW", String(params.queryW));
    setOutput(root, "queryX", String(params.queryX));
    setOutput(root, "queryY", String(params.queryY));
    setOutput(root, "samples", String(params.samples));
    setOutput(root, "seed", String(params.seed));
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncControls(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__spaceFillingIndexResult = result;
  }

  function init(root) {
    if (!root || root.__spaceFillingIndexReady) return;
    root.__spaceFillingIndexReady = true;
    var scheduled = null;
    function requestRender() {
      if (scheduled) global.cancelAnimationFrame(scheduled);
      scheduled = global.requestAnimationFrame(function () {
        scheduled = null;
        render(root);
      });
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    global.addEventListener("resize", requestRender);
    requestRender();
  }

  function initAll() {
    global.document.querySelectorAll("[data-space-filling-index-lab]").forEach(init);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function audit() {
    for (var order = 3; order <= 7; order += 1) {
      var params = cleanParams({ order: order, queryH: 1, queryW: 1 });
      METHOD_ORDER.forEach(function (method) {
        var seen = new Array(params.n * params.n).fill(false);
        for (var y = 0; y < params.n; y += 1) {
          for (var x = 0; x < params.n; x += 1) {
            var rank = indexOf(method, params, x, y);
            assert(rank >= 0 && rank < params.n * params.n, method + " rank out of bounds");
            assert(!seen[rank], method + " duplicate rank at order " + order);
            seen[rank] = true;
          }
        }
      });
    }
    var rng = mulberry32(91);
    for (var trial = 0; trial < 180; trial += 1) {
      var raw = {
        budget: 1 + Math.floor(rng() * 24),
        order: 3 + Math.floor(rng() * 5),
        queryH: 1 + Math.floor(rng() * 28),
        queryW: 1 + Math.floor(rng() * 28),
        seed: 1 + Math.floor(rng() * 999)
      };
      var params = cleanParams(raw);
      params.queryX = Math.floor(rng() * (params.n - params.queryW + 1));
      params.queryY = Math.floor(rng() * (params.n - params.queryH + 1));
      METHOD_ORDER.forEach(function (method) {
        var row = analyzeRect(params, method, queryRect(params));
        assert(row.fragments >= 1, "missing fragments");
        assert(row.mergedFragments <= params.budget, "range budget exceeded");
        assert(row.scannedCells >= row.exactCells, "scan undercounts exact cells");
        assert(Number.isFinite(row.amplification), "bad amplification");
      });
    }
    var defaults = evaluate(DEFAULTS);
    assert(defaults.methods.hilbert.fragments < defaults.methods.row.fragments, "default Hilbert should fragment vertical window less than row-major");
    assert(defaults.averages.hilbert.fragments < defaults.averages.morton.fragments, "default Hilbert average should beat Z-order on fragments");
    return {
      averageHilbertFragments: defaults.averages.hilbert.fragments,
      defaultHilbertFragments: defaults.methods.hilbert.fragments,
      ok: true
    };
  }

  var api = {
    DEFAULTS: DEFAULTS,
    METHODS: METHODS,
    analyzeRect: analyzeRect,
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    hilbertIndex: hilbertIndex,
    indexOf: indexOf,
    mergeIntervals: mergeIntervals,
    mortonIndex: mortonIndex
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SpaceFillingIndexLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
