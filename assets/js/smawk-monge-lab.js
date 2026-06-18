(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    brute: "#2563eb",
    smawk: "#0f766e",
    touch: "#b45309",
    bad: "#be123c",
    purple: "#7c3aed"
  };

  var DEFAULTS = {
    scenario: "wide",
    rows: 28,
    cols: 84,
    tilt: 18,
    seed: 37
  };

  var SCENARIOS = {
    wide: "wide convex drift",
    staircase: "staircase optima",
    tall: "tall implicit table",
    jitter: "sorted noisy centers",
    tilted: "tilted column costs"
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
    var rows = Math.round(clamp(finite(Number(raw.rows), DEFAULTS.rows), 4, 96));
    var cols = Math.round(clamp(finite(Number(raw.cols), DEFAULTS.cols), 6, 140));
    if (scenario === "tall") {
      rows = Math.max(rows, 36);
      cols = Math.min(cols, 52);
    }
    if (scenario === "wide") {
      cols = Math.max(cols, rows + 12);
    }
    return {
      scenario: scenario,
      rows: rows,
      cols: cols,
      tilt: Math.round(clamp(finite(Number(raw.tilt), DEFAULTS.tilt), -60, 60)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 9999))
    };
  }

  function lcg(seed) {
    var state = seed >>> 0;
    return function () {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function linspace(count, maxValue, curve) {
    var out = [];
    for (var i = 0; i < count; i += 1) {
      var t = count === 1 ? 0 : i / (count - 1);
      out.push(maxValue * Math.pow(t, curve || 1));
    }
    return out;
  }

  function makeCenters(params) {
    var n = params.rows;
    var m = params.cols;
    var maxCol = m - 1;
    if (params.scenario === "staircase") {
      var levels = Math.max(3, Math.round(Math.sqrt(m)));
      return linspace(n, maxCol, 1).map(function (center) {
        return Math.round(center / Math.max(1, maxCol) * (levels - 1)) / Math.max(1, levels - 1) * maxCol;
      });
    }
    if (params.scenario === "jitter") {
      var rand = lcg(params.seed * 2654435761);
      var values = [];
      for (var i = 0; i < n; i += 1) {
        var base = maxCol * (i + 0.25 + 0.5 * rand()) / n;
        values.push(clamp(base + (rand() - 0.5) * maxCol * 0.16, 0, maxCol));
      }
      values.sort(function (a, b) { return a - b; });
      return values;
    }
    if (params.scenario === "tilted") return linspace(n, maxCol, 0.72);
    if (params.scenario === "tall") return linspace(n, maxCol, 1.35);
    return linspace(n, maxCol, 1.08);
  }

  function makeMatrix(params) {
    var centers = makeCenters(params);
    var n = params.rows;
    var m = params.cols;
    var tilt = params.tilt / 100;
    var colWave = [];
    for (var j = 0; j < m; j += 1) {
      var x = m === 1 ? 0 : j / (m - 1);
      colWave[j] = tilt * (j - (m - 1) / 2) + 0.14 * Math.sin(2 * Math.PI * x);
    }
    return {
      rows: n,
      cols: m,
      centers: centers,
      value: function (row, col) {
        var d = col - centers[row];
        return d * d + colWave[col] + 0.03 * row;
      }
    };
  }

  function makeMeteredLookup(matrix) {
    var cache = Object.create(null);
    var touched = Object.create(null);
    var touchedList = [];
    var raw = 0;
    var unique = 0;
    function key(row, col) {
      return row + "," + col;
    }
    return {
      get: function (row, col) {
        raw += 1;
        var k = key(row, col);
        if (cache[k] == null) {
          cache[k] = matrix.value(row, col);
          unique += 1;
          if (!touched[k]) {
            touched[k] = true;
            touchedList.push({ row: row, col: col });
          }
        }
        return cache[k];
      },
      stats: function () {
        return {
          rawAccesses: raw,
          uniqueAccesses: unique,
          touched: touchedList.slice(),
          touchedMap: touched
        };
      }
    };
  }

  function argMinRow(row, cols, get, counter) {
    var best = cols[0];
    var bestValue = get(row, best);
    for (var i = 1; i < cols.length; i += 1) {
      var col = cols[i];
      var value = get(row, col);
      counter.comparisons += 1;
      if (value < bestValue) {
        best = col;
        bestValue = value;
      }
    }
    return { col: best, value: bestValue };
  }

  function bruteMinima(matrix) {
    var meter = makeMeteredLookup(matrix);
    var cols = [];
    for (var c = 0; c < matrix.cols; c += 1) cols.push(c);
    var minima = [];
    var counter = { comparisons: 0 };
    for (var r = 0; r < matrix.rows; r += 1) minima.push(argMinRow(r, cols, meter.get, counter));
    var stats = meter.stats();
    stats.comparisons = counter.comparisons;
    return { minima: minima, stats: stats };
  }

  function smawkMinima(matrix) {
    var rows = [];
    var cols = [];
    for (var r = 0; r < matrix.rows; r += 1) rows.push(r);
    for (var c = 0; c < matrix.cols; c += 1) cols.push(c);
    var meter = makeMeteredLookup(matrix);
    var minima = new Map();
    var levels = [];
    var windows = [];
    var comparisons = 0;

    function less(row, a, b) {
      comparisons += 1;
      return meter.get(row, a) < meter.get(row, b);
    }

    function solve(activeRows, activeCols, depth) {
      if (!activeRows.length) return;
      var reduced = [];
      var popped = 0;
      activeCols.forEach(function (col) {
        while (reduced.length) {
          var probeRow = activeRows[reduced.length - 1];
          if (less(probeRow, col, reduced[reduced.length - 1])) {
            reduced.pop();
            popped += 1;
          } else {
            break;
          }
        }
        if (reduced.length < activeRows.length) reduced.push(col);
      });
      levels.push({
        depth: depth,
        rows: activeRows.length,
        before: activeCols.length,
        after: reduced.length,
        popped: popped
      });

      var oddRows = [];
      for (var i = 1; i < activeRows.length; i += 2) oddRows.push(activeRows[i]);
      solve(oddRows, reduced, depth + 1);

      var pos = Object.create(null);
      reduced.forEach(function (col, i) { pos[col] = i; });
      for (var ri = 0; ri < activeRows.length; ri += 2) {
        var row = activeRows[ri];
        var start = 0;
        var end = reduced.length - 1;
        if (ri > 0) start = pos[minima.get(activeRows[ri - 1])];
        if (ri + 1 < activeRows.length) end = pos[minima.get(activeRows[ri + 1])];
        var bestCol = reduced[start];
        var bestValue = meter.get(row, bestCol);
        for (var ci = start + 1; ci <= end; ci += 1) {
          var candidate = reduced[ci];
          var value = meter.get(row, candidate);
          comparisons += 1;
          if (value < bestValue) {
            bestCol = candidate;
            bestValue = value;
          }
        }
        minima.set(row, bestCol);
        windows.push({ row: row, start: reduced[start], end: reduced[end], best: bestCol, depth: depth });
      }
    }

    solve(rows, cols, 0);
    var out = [];
    for (var row = 0; row < matrix.rows; row += 1) {
      var col = minima.get(row);
      out.push({ col: col, value: matrix.value(row, col) });
    }
    var stats = meter.stats();
    stats.comparisons = comparisons;
    return { minima: out, levels: levels, windows: windows, stats: stats };
  }

  function checkAdjacentMonge(matrix) {
    var worst = -Infinity;
    var violations = 0;
    for (var i = 0; i + 1 < matrix.rows; i += 1) {
      for (var j = 0; j + 1 < matrix.cols; j += 1) {
        var lhs = matrix.value(i, j) + matrix.value(i + 1, j + 1);
        var rhs = matrix.value(i, j + 1) + matrix.value(i + 1, j);
        var gap = lhs - rhs;
        if (gap > 1e-9) violations += 1;
        if (gap > worst) worst = gap;
      }
    }
    return { violations: violations, worstGap: Number.isFinite(worst) ? worst : 0 };
  }

  function isNondecreasing(values) {
    for (var i = 1; i < values.length; i += 1) {
      if (values[i] < values[i - 1]) return false;
    }
    return true;
  }

  function audit(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var bruteCols = result.brute.minima.map(function (x) { return x.col; });
    var smawkCols = result.smawk.minima.map(function (x) { return x.col; });
    var same = bruteCols.every(function (col, i) { return col === smawkCols[i]; });
    var monge = checkAdjacentMonge(result.matrix);
    check("SMAWK minima match brute force", same);
    check("brute row minima are nondecreasing", isNondecreasing(bruteCols));
    check("adjacent Monge inequalities hold", monge.violations === 0);
    check("SMAWK touches fewer cells than brute force", result.smawk.stats.uniqueAccesses < result.brute.stats.uniqueAccesses);
    check("all matrix values finite", result.brute.minima.every(function (row) { return Number.isFinite(row.value); }));
    check("one minimum per row", result.smawk.minima.length === result.params.rows);
    check("reduction never keeps more columns than rows at a level", result.smawk.levels.every(function (level) { return level.after <= level.rows; }));
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks,
      monge: monge
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var matrix = makeMatrix(params);
    var brute = bruteMinima(matrix);
    var smawk = smawkMinima(matrix);
    var result = { params: params, matrix: matrix, brute: brute, smawk: smawk };
    result.audit = audit(result);
    result.savings = 1 - smawk.stats.uniqueAccesses / Math.max(1, brute.stats.uniqueAccesses);
    return result;
  }

  function auditGrid() {
    var cases = [
      { scenario: "wide", rows: 28, cols: 84, tilt: 18, seed: 37 },
      { scenario: "staircase", rows: 40, cols: 92, tilt: -12, seed: 19 },
      { scenario: "tall", rows: 76, cols: 38, tilt: 25, seed: 41 },
      { scenario: "jitter", rows: 44, cols: 88, tilt: 0, seed: 93 },
      { scenario: "tilted", rows: 34, cols: 72, tilt: 48, seed: 11 }
    ].map(function (row, index) {
      var result = evaluate(row);
      return {
        caseId: index + 1,
        scenario: result.params.scenario,
        rows: result.params.rows,
        cols: result.params.cols,
        tilt: result.params.tilt,
        seed: result.params.seed,
        bruteCells: result.brute.stats.uniqueAccesses,
        smawkCells: result.smawk.stats.uniqueAccesses,
        savedPct: result.savings * 100,
        mongeViolations: result.audit.monge.violations,
        passed: result.audit.passed,
        failedChecks: result.audit.checks.filter(function (check) { return !check.ok; }).map(function (check) { return check.name; })
      };
    });
    return {
      cases: cases,
      passed: cases.filter(function (row) { return row.passed; }).length,
      total: cases.length
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function intFmt(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function metric(label, value, className) {
    return '<div class="smawk-lab__metric ' + (className || "") + '"><span>' +
      label + "</span><strong>" + value + "</strong></div>";
  }

  function label(ctx, text, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = "middle";
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
    label(ctx, title, box.x + 14, box.y + 18, { size: 12, weight: 800 });
    if (subtitle) label(ctx, subtitle, box.x + 14, box.y + 38, { color: COLORS.muted, size: 10, weight: 600 });
  }

  function colorRamp(t) {
    t = clamp(t, 0, 1);
    var r = Math.round(240 - 190 * (1 - t));
    var g = Math.round(249 - 120 * (1 - t));
    var b = Math.round(255 - 55 * (1 - t));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function matrixRange(matrix) {
    var min = Infinity;
    var max = -Infinity;
    for (var r = 0; r < matrix.rows; r += 1) {
      for (var c = 0; c < matrix.cols; c += 1) {
        var v = matrix.value(r, c);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { min: min, max: max };
  }

  function drawMatrix(ctx, result, box) {
    panel(ctx, box, "implicit Monge matrix", "green dots are row minima; amber outlines were touched by SMAWK");
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 62, h: box.h - 86 };
    var matrix = result.matrix;
    var range = matrixRange(matrix);
    var cellW = plot.w / matrix.cols;
    var cellH = plot.h / matrix.rows;
    var touched = result.smawk.stats.touchedMap;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    for (var r = 0; r < matrix.rows; r += 1) {
      for (var c = 0; c < matrix.cols; c += 1) {
        var value = matrix.value(r, c);
        var t = (value - range.min) / Math.max(1e-9, range.max - range.min);
        ctx.fillStyle = colorRamp(1 - Math.sqrt(t));
        ctx.fillRect(plot.x + c * cellW, plot.y + r * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
    result.smawk.stats.touched.forEach(function (cell) {
      if (cellW < 2.5 || cellH < 2.5) return;
      ctx.strokeStyle = COLORS.touch;
      ctx.lineWidth = 0.7;
      ctx.strokeRect(plot.x + cell.col * cellW + 0.5, plot.y + cell.row * cellH + 0.5, Math.max(1, cellW - 1), Math.max(1, cellH - 1));
      touched[cell.row + "," + cell.col] = true;
    });
    result.brute.minima.forEach(function (row, r) {
      var x = plot.x + (row.col + 0.5) * cellW;
      var y = plot.y + (r + 0.5) * cellH;
      ctx.fillStyle = COLORS.smawk;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, Math.min(4, cellW * 0.38, cellH * 0.38)), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    label(ctx, "columns", plot.x + plot.w, box.y + box.h - 18, { align: "right", color: COLORS.muted, size: 10 });
    label(ctx, "rows", box.x + 16, plot.y + 4, { color: COLORS.muted, size: 10 });
  }

  function drawPath(ctx, result, box) {
    panel(ctx, box, "the minima march right", "Monge structure makes the row argmins nondecreasing");
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 66, h: box.h - 86 };
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    var rows = result.params.rows;
    var cols = result.params.cols;
    var prev = null;
    ctx.strokeStyle = COLORS.smawk;
    ctx.lineWidth = 2;
    result.smawk.minima.forEach(function (row, r) {
      var x = plot.x + row.col / Math.max(1, cols - 1) * plot.w;
      var y = plot.y + r / Math.max(1, rows - 1) * plot.h;
      if (prev) {
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      prev = { x: x, y: y };
    });
    ctx.fillStyle = COLORS.smawk;
    result.smawk.minima.forEach(function (row, r) {
      var x = plot.x + row.col / Math.max(1, cols - 1) * plot.w;
      var y = plot.y + r / Math.max(1, rows - 1) * plot.h;
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = COLORS.purple;
    ctx.lineWidth = 1.4;
    prev = null;
    result.matrix.centers.forEach(function (center, r) {
      var x = plot.x + center / Math.max(1, cols - 1) * plot.w;
      var y = plot.y + r / Math.max(1, rows - 1) * plot.h;
      if (prev) {
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      prev = { x: x, y: y };
    });
    label(ctx, "green = computed argmin", plot.x, box.y + box.h - 18, { color: COLORS.smawk, size: 10, weight: 800 });
    label(ctx, "purple = generating center", plot.x + 170, box.y + box.h - 18, { color: COLORS.purple, size: 10, weight: 800 });
  }

  function drawWork(ctx, result, box) {
    panel(ctx, box, "work ledger", "brute force reads every cell; SMAWK asks selected comparisons");
    var plot = { x: box.x + 34, y: box.y + 64, w: box.w - 68, h: box.h - 116 };
    var bars = [
      { label: "brute cells", value: result.brute.stats.uniqueAccesses, color: COLORS.brute },
      { label: "SMAWK cells", value: result.smawk.stats.uniqueAccesses, color: COLORS.smawk },
      { label: "SMAWK comps", value: result.smawk.stats.comparisons, color: COLORS.touch }
    ];
    var max = Math.max.apply(null, bars.map(function (bar) { return bar.value; }).concat([1]));
    bars.forEach(function (bar, i) {
      var y = plot.y + i * 44;
      var w = plot.w * bar.value / max;
      ctx.fillStyle = "#edf2f7";
      ctx.fillRect(plot.x, y, plot.w, 20);
      ctx.fillStyle = bar.color;
      ctx.fillRect(plot.x, y, w, 20);
      label(ctx, bar.label, plot.x, y - 10, { color: COLORS.muted, size: 10, weight: 700 });
      label(ctx, intFmt(bar.value), plot.x + w + 8, y + 10, { color: COLORS.text, size: 11, weight: 800 });
    });
    var saved = Math.max(0, result.savings * 100);
    label(ctx, "unique cell saving", plot.x, box.y + box.h - 40, { color: COLORS.muted, size: 10, weight: 700 });
    label(ctx, fmt(saved, 1) + "%", plot.x + 130, box.y + box.h - 40, { color: COLORS.smawk, size: 16, weight: 850 });
  }

  function drawLevels(ctx, result, box) {
    panel(ctx, box, "reduce and interpolate", "each level keeps only columns that can still win");
    var plot = { x: box.x + 24, y: box.y + 62, w: box.w - 48, h: box.h - 92 };
    var levels = result.smawk.levels.slice(0, 8);
    var maxBefore = Math.max.apply(null, levels.map(function (level) { return level.before; }).concat([1]));
    levels.forEach(function (level, i) {
      var y = plot.y + i * Math.min(30, plot.h / Math.max(1, levels.length));
      var beforeW = plot.w * level.before / maxBefore;
      var afterW = plot.w * level.after / maxBefore;
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(plot.x, y, beforeW, 12);
      ctx.fillStyle = COLORS.smawk;
      ctx.fillRect(plot.x, y + 13, afterW, 12);
      label(ctx, "d" + level.depth + " rows " + level.rows + " cols " + level.before + " -> " + level.after, plot.x + 4, y + 32, { size: 9, color: COLORS.muted, weight: 700 });
    });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    var gap = 14;
    var leftW = Math.floor(w * 0.58);
    drawMatrix(ctx, result, { x: gap, y: gap, w: leftW - gap, h: h - 2 * gap });
    drawPath(ctx, result, { x: leftW + gap, y: gap, w: w - leftW - 2 * gap, h: 226 });
    drawWork(ctx, result, { x: leftW + gap, y: 254, w: w - leftW - 2 * gap, h: 206 });
    drawLevels(ctx, result, { x: leftW + gap, y: 474, w: w - leftW - 2 * gap, h: h - 488 });
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
      if (key === "scenario") output.textContent = SCENARIOS[result.params.scenario];
      else if (key === "tilt") output.textContent = fmt(result.params.tilt / 100, 2);
      else output.textContent = result.params[key];
    });
    var rowsInput = root.querySelector('[data-param="rows"]');
    var colsInput = root.querySelector('[data-param="cols"]');
    if (rowsInput) rowsInput.value = String(result.params.rows);
    if (colsInput) colsInput.value = String(result.params.cols);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("rows x cols", result.params.rows + " x " + result.params.cols),
        metric("brute cells", intFmt(result.brute.stats.uniqueAccesses)),
        metric("SMAWK cells", intFmt(result.smawk.stats.uniqueAccesses), "smawk-lab__metric--good"),
        metric("saved", fmt(result.savings * 100, 1) + "%", "smawk-lab__metric--good"),
        metric("argmins monotone", isNondecreasing(result.smawk.minima.map(function (row) { return row.col; })) ? "yes" : "no"),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "smawk-lab__metric--good" : "smawk-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      var first = result.smawk.minima[0].col + 1;
      var last = result.smawk.minima[result.smawk.minima.length - 1].col + 1;
      note.textContent = SCENARIOS[result.params.scenario] + ": leftmost row minima move from column " +
        first + " to " + last + ". SMAWK matches brute force while touching " +
        intFmt(result.smawk.stats.uniqueAccesses) + " of " + intFmt(result.brute.stats.uniqueAccesses) + " cells.";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__smawkMongeResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__smawkMongeReady) return;
    root.__smawkMongeReady = true;
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
        Array.prototype.slice.call(global.document.querySelectorAll("[data-smawk-monge-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-smawk-monge-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    normalize: normalize,
    makeMatrix: makeMatrix,
    smawkMinima: smawkMinima,
    bruteMinima: bruteMinima
  };

  global.SMAWKMongeLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
