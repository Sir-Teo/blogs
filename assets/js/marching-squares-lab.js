(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    contour: "#0f766e",
    contour2: "#2563eb",
    bad: "#be123c",
    amber: "#b45309",
    purple: "#7c3aed",
    high: "#f97316",
    low: "#38bdf8"
  };

  var DEFAULTS = {
    field: "saddle",
    iso: 1,
    resolution: 17,
    ambiguity: "decider",
    noise: 0,
    seed: 19
  };

  var FIELDS = {
    saddle: "bilinear saddle",
    hills: "two hills",
    ring: "soft ring",
    waves: "ripple field"
  };

  var AMBIGUITY = {
    decider: "asymptotic decider",
    slash: "always /",
    backslash: "always \\",
    center: "cell-center sign"
  };

  var CORNERS = [
    { x: 0, y: 0, edgeA: "left", edgeB: "bottom" },
    { x: 1, y: 0, edgeA: "bottom", edgeB: "right" },
    { x: 1, y: 1, edgeA: "right", edgeB: "top" },
    { x: 0, y: 1, edgeA: "top", edgeB: "left" }
  ];

  var SIMPLE_CASES = {
    0: [],
    1: [["left", "bottom"]],
    2: [["bottom", "right"]],
    3: [["left", "right"]],
    4: [["right", "top"]],
    6: [["bottom", "top"]],
    7: [["left", "top"]],
    8: [["top", "left"]],
    9: [["bottom", "top"]],
    11: [["right", "top"]],
    12: [["left", "right"]],
    13: [["bottom", "right"]],
    14: [["left", "bottom"]],
    15: []
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    var field = FIELDS[raw.field] ? raw.field : DEFAULTS.field;
    var ambiguity = AMBIGUITY[raw.ambiguity] ? raw.ambiguity : DEFAULTS.ambiguity;
    return {
      field: field,
      iso: Math.round(clamp(finite(Number(raw.iso), DEFAULTS.iso), -80, 80)) / 100,
      resolution: Math.round(clamp(finite(Number(raw.resolution), DEFAULTS.resolution), 8, 42)),
      ambiguity: ambiguity,
      noise: Math.round(clamp(finite(Number(raw.noise), DEFAULTS.noise), 0, 50)) / 100,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 999))
    };
  }

  function hash32(value, seed) {
    var x = (seed ^ 0x9e3779b9) >>> 0;
    for (var i = 0; i < value.length; i += 1) {
      x ^= value.charCodeAt(i);
      x = Math.imul(x, 0x85ebca6b) >>> 0;
      x ^= x >>> 13;
    }
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }

  function noiseAt(i, j, seed) {
    return ((hash32(i + ":" + j, seed) + 0.5) / 4294967297) * 2 - 1;
  }

  function fieldValue(x, y, params) {
    var cx = x - 0.5;
    var cy = y - 0.5;
    var value;
    if (params.field === "saddle") {
      value = 32 * cx * cy;
    } else if (params.field === "hills") {
      var left = Math.exp(-((x - 0.33) * (x - 0.33) + (y - 0.55) * (y - 0.55)) / 0.026);
      var right = Math.exp(-((x - 0.68) * (x - 0.68) + (y - 0.42) * (y - 0.42)) / 0.018);
      value = 1.5 * left + 1.1 * right - 0.62 - 0.22 * y;
    } else if (params.field === "ring") {
      var r = Math.sqrt(cx * cx + cy * cy);
      value = 0.23 - Math.abs(r - 0.28) + 0.08 * Math.sin(12 * Math.atan2(cy, cx));
    } else {
      value = 0.45 * Math.sin(12 * x + 2.5 * Math.cos(5 * y)) + 0.35 * Math.cos(10 * y - 1.7 * Math.sin(4 * x));
    }
    if (params.noise > 0) value += params.noise * 0.28 * noiseAt(Math.round(x * 997), Math.round(y * 997), params.seed);
    return value;
  }

  function sampleGrid(params) {
    var n = params.resolution;
    var values = [];
    for (var j = 0; j <= n; j += 1) {
      var row = [];
      for (var i = 0; i <= n; i += 1) {
        row.push(fieldValue(i / n, j / n, params));
      }
      values.push(row);
    }
    return values;
  }

  function interp(a, b, iso) {
    var denom = b - a;
    if (Math.abs(denom) < 1e-12) return 0.5;
    return clamp((iso - a) / denom, 0, 1);
  }

  function edgePoint(edge, values, cellX, cellY, size, iso) {
    var bl = values.bl;
    var br = values.br;
    var tr = values.tr;
    var tl = values.tl;
    var t;
    if (edge === "bottom") {
      t = interp(bl, br, iso);
      return { x: cellX + t * size, y: cellY, value: bl + t * (br - bl), edge: edge };
    }
    if (edge === "right") {
      t = interp(br, tr, iso);
      return { x: cellX + size, y: cellY + t * size, value: br + t * (tr - br), edge: edge };
    }
    if (edge === "top") {
      t = interp(tl, tr, iso);
      return { x: cellX + t * size, y: cellY + size, value: tl + t * (tr - tl), edge: edge };
    }
    t = interp(bl, tl, iso);
    return { x: cellX, y: cellY + t * size, value: bl + t * (tl - bl), edge: edge };
  }

  function bilinearAt(values, x, y) {
    return values.bl * (1 - x) * (1 - y) +
      values.br * x * (1 - y) +
      values.tr * x * y +
      values.tl * (1 - x) * y;
  }

  function saddleInfo(values, iso) {
    var a = values.bl;
    var b = values.br - values.bl;
    var c = values.tl - values.bl;
    var d = values.tr - values.br - values.tl + values.bl;
    var x = Math.abs(d) > 1e-12 ? -c / d : 0.5;
    var y = Math.abs(d) > 1e-12 ? -b / d : 0.5;
    var inside = x > 0 && x < 1 && y > 0 && y < 1;
    var saddleValue = inside ? bilinearAt(values, x, y) : bilinearAt(values, 0.5, 0.5);
    return {
      x: inside ? x : 0.5,
      y: inside ? y : 0.5,
      value: saddleValue,
      inCell: inside,
      above: saddleValue >= iso
    };
  }

  function caseIndex(values, iso) {
    return (values.bl >= iso ? 1 : 0) |
      (values.br >= iso ? 2 : 0) |
      (values.tr >= iso ? 4 : 0) |
      (values.tl >= iso ? 8 : 0);
  }

  function centerAbove(values, iso) {
    return bilinearAt(values, 0.5, 0.5) >= iso;
  }

  function ambiguousSegments(index, values, iso, rule) {
    var highCenter;
    if (rule === "slash") highCenter = false;
    else if (rule === "backslash") highCenter = true;
    else if (rule === "center") highCenter = centerAbove(values, iso);
    else highCenter = saddleInfo(values, iso).above;

    if (index === 5) {
      return highCenter ? [["bottom", "right"], ["top", "left"]] : [["left", "bottom"], ["right", "top"]];
    }
    return highCenter ? [["bottom", "left"], ["right", "top"]] : [["bottom", "right"], ["top", "left"]];
  }

  function cellSegments(values, index, cellX, cellY, size, iso, rule) {
    var pairs = index === 5 || index === 10
      ? ambiguousSegments(index, values, iso, rule)
      : SIMPLE_CASES[index];
    return pairs.map(function (pair) {
      var a = edgePoint(pair[0], values, cellX, cellY, size, iso);
      var b = edgePoint(pair[1], values, cellX, cellY, size, iso);
      return { a: a, b: b, pair: pair, residual: Math.max(Math.abs(a.value - iso), Math.abs(b.value - iso)) };
    });
  }

  function traceContours(params) {
    var grid = sampleGrid(params);
    var n = params.resolution;
    var size = 1 / n;
    var cells = [];
    var segments = [];
    var caseCounts = {};
    var ambiguous = 0;
    var maxResidual = 0;
    var deciderVotes = { high: 0, low: 0, saddleInside: 0 };

    for (var j = 0; j < n; j += 1) {
      for (var i = 0; i < n; i += 1) {
        var values = {
          bl: grid[j][i],
          br: grid[j][i + 1],
          tr: grid[j + 1][i + 1],
          tl: grid[j + 1][i]
        };
        var index = caseIndex(values, params.iso);
        caseCounts[index] = (caseCounts[index] || 0) + 1;
        var info = saddleInfo(values, params.iso);
        var isAmbiguous = index === 5 || index === 10;
        if (isAmbiguous) {
          ambiguous += 1;
          if (info.above) deciderVotes.high += 1;
          else deciderVotes.low += 1;
          if (info.inCell) deciderVotes.saddleInside += 1;
        }
        var segs = cellSegments(values, index, i * size, j * size, size, params.iso, params.ambiguity);
        segs.forEach(function (seg) {
          maxResidual = Math.max(maxResidual, seg.residual);
          segments.push({
            a: seg.a,
            b: seg.b,
            pair: seg.pair,
            cell: { i: i, j: j, index: index, ambiguous: isAmbiguous, values: values, saddle: info }
          });
        });
        cells.push({ i: i, j: j, index: index, ambiguous: isAmbiguous, values: values, saddle: info, segments: segs.length });
      }
    }

    return {
      params: params,
      grid: grid,
      cells: cells,
      segments: segments,
      caseCounts: caseCounts,
      ambiguous: ambiguous,
      deciderVotes: deciderVotes,
      maxResidual: maxResidual
    };
  }

  function summarize(trace) {
    var activeCells = trace.cells.filter(function (cell) { return cell.index !== 0 && cell.index !== 15; }).length;
    var hist = [];
    for (var k = 0; k < 16; k += 1) hist.push(trace.caseCounts[k] || 0);
    return {
      cells: trace.params.resolution * trace.params.resolution,
      activeCells: activeCells,
      segments: trace.segments.length,
      ambiguous: trace.ambiguous,
      highDecisions: trace.deciderVotes.high,
      lowDecisions: trace.deciderVotes.low,
      saddleInside: trace.deciderVotes.saddleInside,
      maxResidual: trace.maxResidual,
      caseHistogram: hist
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var trace = traceContours(params);
    var result = {
      params: params,
      trace: trace,
      summary: summarize(trace),
      focus: chooseFocusCell(trace)
    };
    result.audit = audit(result);
    return result;
  }

  function audit(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var n = result.params.resolution;
    check("grid dimensions", result.trace.grid.length === n + 1 && result.trace.grid[0].length === n + 1);
    check("cell count", result.trace.cells.length === n * n);
    check("histogram count", result.summary.caseHistogram.reduce(function (sum, value) { return sum + value; }, 0) === n * n);
    check("residual finite", Number.isFinite(result.summary.maxResidual) && result.summary.maxResidual < 1e-9);
    check("ambiguous count agrees", result.summary.ambiguous === (result.summary.caseHistogram[5] + result.summary.caseHistogram[10]));
    check("segments finite", result.trace.segments.every(function (seg) {
      return Number.isFinite(seg.a.x) && Number.isFinite(seg.a.y) && Number.isFinite(seg.b.x) && Number.isFinite(seg.b.y);
    }));
    check("segment endpoints stay in unit square", result.trace.segments.every(function (seg) {
      return seg.a.x >= -1e-12 && seg.a.x <= 1 + 1e-12 && seg.a.y >= -1e-12 && seg.a.y <= 1 + 1e-12 &&
        seg.b.x >= -1e-12 && seg.b.x <= 1 + 1e-12 && seg.b.y >= -1e-12 && seg.b.y <= 1 + 1e-12;
    }));
    if (result.params.field === "saddle") {
      check("saddle field has ambiguous cells", result.summary.ambiguous > 0);
    }
    if (result.params.ambiguity === "decider" && result.summary.ambiguous > 0) {
      check("decider records all ambiguous votes", result.summary.highDecisions + result.summary.lowDecisions === result.summary.ambiguous);
    }
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function auditGrid() {
    var criticalByName = {};
    var cases = [
      { field: "saddle", iso: 1, resolution: 17, ambiguity: "decider", noise: 0, seed: 19 },
      { field: "saddle", iso: 1, resolution: 17, ambiguity: "slash", noise: 0, seed: 19 },
      { field: "saddle", iso: 1, resolution: 17, ambiguity: "backslash", noise: 0, seed: 19 },
      { field: "hills", iso: 0, resolution: 24, ambiguity: "decider", noise: 8, seed: 33 },
      { field: "ring", iso: 0, resolution: 26, ambiguity: "decider", noise: 0, seed: 41 },
      { field: "waves", iso: 10, resolution: 22, ambiguity: "center", noise: 12, seed: 57 }
    ];
    var rows = cases.map(function (params, index) {
      var result = evaluate(params);
      var caseId = index + 1;
      result.audit.checks.forEach(function (check) {
        if (!criticalByName[check.name]) {
          criticalByName[check.name] = {
            check: check.name,
            failedCases: [],
            passed: 0,
            total: 0
          };
        }
        criticalByName[check.name].total += 1;
        if (check.ok) criticalByName[check.name].passed += 1;
        else criticalByName[check.name].failedCases.push(caseId);
      });
      return {
        caseId: caseId,
        field: result.params.field,
        iso: result.params.iso,
        resolution: result.params.resolution,
        ambiguity: result.params.ambiguity,
        noise: result.params.noise,
        seed: result.params.seed,
        cells: result.summary.cells,
        activeCells: result.summary.activeCells,
        segments: result.summary.segments,
        ambiguous: result.summary.ambiguous,
        highDecisions: result.summary.highDecisions,
        lowDecisions: result.summary.lowDecisions,
        maxResidual: result.summary.maxResidual,
        passed: result.audit.passed,
        passedChecks: result.audit.checks.filter(function (row) { return row.ok; }).length,
        totalChecks: result.audit.checks.length,
        failedChecks: result.audit.checks.filter(function (row) { return !row.ok; }).map(function (row) { return row.name; })
      };
    });
    function summarize(groupBy) {
      var groups = {};
      rows.forEach(function (row) {
        var key = row[groupBy];
        if (!groups[key]) {
          groups[key] = {
            activeCells: 0,
            ambiguous: 0,
            cases: 0,
            cells: 0,
            maxResidual: 0,
            passed: 0,
            passedChecks: 0,
            segments: 0,
            totalChecks: 0
          };
          groups[key][groupBy] = key;
        }
        groups[key].activeCells += row.activeCells;
        groups[key].ambiguous += row.ambiguous;
        groups[key].cases += 1;
        groups[key].cells += row.cells;
        groups[key].maxResidual = Math.max(groups[key].maxResidual, row.maxResidual);
        groups[key].segments += row.segments;
        groups[key].passedChecks += row.passedChecks;
        groups[key].totalChecks += row.totalChecks;
        if (row.passed) groups[key].passed += 1;
      });
      return Object.keys(groups).sort().map(function (key) {
        return groups[key];
      });
    }
    var criticalChecks = Object.keys(criticalByName).sort().map(function (key) {
      var row = criticalByName[key];
      row.ok = row.passed === row.total;
      return row;
    });
    var passed = rows.filter(function (row) { return row.passed; }).length;
    var passedChecks = rows.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = rows.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    var errors = rows.reduce(function (out, row) {
      row.failedChecks.forEach(function (check) {
        out.push("case " + row.caseId + ": " + check);
      });
      return out;
    }, []);
    return {
      byField: summarize("field"),
      byRule: summarize("ambiguity"),
      cases: rows,
      checked: totalChecks,
      criticalChecks: criticalChecks,
      errors: errors,
      ok: errors.length === 0,
      passed: passed,
      passedChecks: passedChecks,
      total: rows.length,
      totalChecks: totalChecks
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) < 1e-10) return "0";
    return value.toFixed(digits == null ? 0 : digits);
  }

  function metric(label, value, className) {
    return '<div class="ms-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
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
    text(ctx, title, box.x + 14, box.y + 18, COLORS.text, 12, 800);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, COLORS.muted, 10, 600);
  }

  function valueColor(value, iso) {
    var t = clamp((value - iso + 0.9) / 1.8, 0, 1);
    var r = Math.round(56 + t * 188);
    var g = Math.round(189 - Math.abs(t - 0.5) * 130);
    var b = Math.round(248 - t * 210);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function mapPoint(plot, point) {
    return {
      x: plot.x + point.x * plot.w,
      y: plot.y + plot.h - point.y * plot.h
    };
  }

  function drawField(ctx, result, box) {
    panel(ctx, box, "scalar field and contour", "corner signs choose the cell case; edges are linearly interpolated");
    var trace = result.trace;
    var n = result.params.resolution;
    var plot = { x: box.x + 22, y: box.y + 58, w: box.w - 44, h: box.h - 86 };
    var cellW = plot.w / n;
    var cellH = plot.h / n;
    trace.cells.forEach(function (cell) {
      var avg = (cell.values.bl + cell.values.br + cell.values.tr + cell.values.tl) / 4;
      ctx.fillStyle = valueColor(avg, result.params.iso);
      ctx.fillRect(plot.x + cell.i * cellW, plot.y + plot.h - (cell.j + 1) * cellH, Math.ceil(cellW) + 0.5, Math.ceil(cellH) + 0.5);
      if (cell.ambiguous) {
        ctx.strokeStyle = COLORS.amber;
        ctx.lineWidth = 1;
        ctx.strokeRect(plot.x + cell.i * cellW + 0.5, plot.y + plot.h - (cell.j + 1) * cellH + 0.5, cellW - 1, cellH - 1);
      }
    });
    ctx.strokeStyle = "rgba(23,32,38,0.18)";
    ctx.lineWidth = 1;
    for (var i = 0; i <= n; i += 1) {
      var x = plot.x + i * cellW;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      var y = plot.y + i * cellH;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.lineWidth = 2.4;
    trace.segments.forEach(function (seg) {
      var a = mapPoint(plot, seg.a);
      var b = mapPoint(plot, seg.b);
      ctx.strokeStyle = seg.cell.ambiguous ? COLORS.purple : COLORS.contour;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
  }

  function drawHistogram(ctx, result, box) {
    panel(ctx, box, "case table", "16 sign patterns; cases 5 and 10 carry the diagonal choice");
    var hist = result.summary.caseHistogram;
    var max = Math.max.apply(null, hist.concat([1]));
    var plot = { x: box.x + 34, y: box.y + 62, w: box.w - 58, h: box.h - 104 };
    var step = plot.w / 16;
    hist.forEach(function (value, i) {
      var h = value / max * plot.h;
      ctx.fillStyle = (i === 5 || i === 10) ? COLORS.amber : (value ? COLORS.contour2 : COLORS.grid);
      ctx.fillRect(plot.x + i * step + 2, plot.y + plot.h - h, Math.max(2, step - 4), Math.max(1, h));
      text(ctx, String(i), plot.x + i * step + step / 2, plot.y + plot.h + 17, COLORS.muted, 9, 650, "center");
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    text(ctx, "ambiguous cells: " + result.summary.ambiguous, plot.x, box.y + box.h - 24, COLORS.amber, 11, 800);
    text(ctx, "max case count: " + max, plot.x + plot.w, box.y + box.h - 24, COLORS.muted, 10, 650, "right");
  }

  function chooseFocusCell(trace) {
    var ambiguous = trace.cells.filter(function (cell) { return cell.ambiguous; });
    if (ambiguous.length) return ambiguous[Math.floor(ambiguous.length / 2)];
    var active = trace.cells.filter(function (cell) { return cell.index !== 0 && cell.index !== 15; });
    return active.length ? active[Math.floor(active.length / 2)] : trace.cells[0];
  }

  function drawCellZoom(ctx, result, box) {
    panel(ctx, box, "one cell under the microscope", "edge crossings are samples of a bilinear patch");
    var cell = chooseFocusCell(result.trace);
    if (!cell) return;
    var pad = 48;
    var side = Math.min(box.w - 2 * pad, box.h - 92);
    var ox = box.x + 34;
    var oy = box.y + 66;
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(ox, oy, side, side);
    var vals = [cell.values.bl, cell.values.br, cell.values.tr, cell.values.tl];
    var labels = ["bl", "br", "tr", "tl"];
    var positions = [
      { x: ox, y: oy + side },
      { x: ox + side, y: oy + side },
      { x: ox + side, y: oy },
      { x: ox, y: oy }
    ];
    positions.forEach(function (p, i) {
      ctx.fillStyle = vals[i] >= result.params.iso ? COLORS.high : COLORS.low;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, labels[i] + " " + fmt(vals[i], 2), p.x + (i === 1 || i === 2 ? -8 : 8), p.y + (i >= 2 ? -14 : 14), COLORS.text, 10, 750, i === 1 || i === 2 ? "right" : "left");
    });
    var size = 1 / result.params.resolution;
    var segs = cellSegments(cell.values, cell.index, 0, 0, size, result.params.iso, result.params.ambiguity);
    ctx.strokeStyle = cell.ambiguous ? COLORS.purple : COLORS.contour;
    ctx.lineWidth = 3;
    segs.forEach(function (seg) {
      var ax = ox + (seg.a.x / size) * side;
      var ay = oy + side - (seg.a.y / size) * side;
      var bx = ox + (seg.b.x / size) * side;
      var by = oy + side - (seg.b.y / size) * side;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    });
    if (cell.ambiguous) {
      var sx = ox + cell.saddle.x * side;
      var sy = oy + side - cell.saddle.y * side;
      ctx.fillStyle = COLORS.amber;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, "decider value " + fmt(cell.saddle.value, 3), ox + side + 24, oy + 30, COLORS.amber, 11, 800);
      text(ctx, cell.saddle.above ? "center branch is high" : "center branch is low", ox + side + 24, oy + 53, COLORS.muted, 10, 650);
    }
    text(ctx, "case " + cell.index + (cell.ambiguous ? " (ambiguous)" : ""), ox + side + 24, oy + side - 36, cell.ambiguous ? COLORS.amber : COLORS.text, 12, 800);
    text(ctx, "cell [" + cell.i + ", " + cell.j + "]", ox + side + 24, oy + side - 14, COLORS.muted, 10, 650);
  }

  function drawLedger(ctx, result, box) {
    panel(ctx, box, "ledger", "the contour is a local contract, not an oracle for topology");
    var lines = [
      "grid: " + result.params.resolution + " x " + result.params.resolution + " cells",
      "segments: " + result.summary.segments,
      "active cells: " + result.summary.activeCells,
      "ambiguous: " + result.summary.ambiguous,
      "decider high/low: " + result.summary.highDecisions + "/" + result.summary.lowDecisions,
      "endpoint residual: " + fmt(result.summary.maxResidual, 2)
    ];
    lines.forEach(function (line, i) {
      text(ctx, line, box.x + 20, box.y + 66 + i * 25, i === 3 ? COLORS.amber : COLORS.text, 12, i >= 3 ? 800 : 650);
    });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    var gap = 14;
    var leftW = Math.floor(width * 0.57);
    drawField(ctx, result, { x: gap, y: gap, w: leftW - 2 * gap, h: height - 2 * gap });
    drawHistogram(ctx, result, { x: leftW, y: gap, w: width - leftW - gap, h: 240 });
    drawCellZoom(ctx, result, { x: leftW, y: 268, w: width - leftW - gap, h: 292 });
    drawLedger(ctx, result, { x: leftW, y: 574, w: width - leftW - gap, h: height - 588 });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      var value = params[key];
      if (key === "field") value = FIELDS[params.field];
      if (key === "ambiguity") value = AMBIGUITY[params.ambiguity];
      if (key === "iso" || key === "noise") value = fmt(value, 2);
      output.textContent = value;
    });
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result.params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("segments", result.summary.segments),
        metric("active cells", result.summary.activeCells),
        metric("ambiguous", result.summary.ambiguous, result.summary.ambiguous ? "ms-lab__metric--warn" : ""),
        metric("decider high/low", result.summary.highDecisions + "/" + result.summary.lowDecisions),
        metric("max residual", fmt(result.summary.maxResidual, 2), "ms-lab__metric--good"),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "ms-lab__metric--good" : "ms-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = FIELDS[result.params.field] + " at iso " + fmt(result.params.iso, 2) +
        " using " + AMBIGUITY[result.params.ambiguity] + ". Cases 5 and 10 are the cells where one bit table needs an extra diagonal rule.";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__marchingSquaresResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__marchingSquaresReady) return;
    root.__marchingSquaresReady = true;
    var timer = null;
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(root); }, 40);
      });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-marching-squares-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-marching-squares-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    normalize: normalize,
    traceContours: traceContours,
    saddleInfo: saddleInfo,
    cellSegments: cellSegments,
    caseIndex: caseIndex
  };

  global.MarchingSquaresLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
