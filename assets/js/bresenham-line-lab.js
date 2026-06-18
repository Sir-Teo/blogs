(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    good: "#0f766e",
    bad: "#be123c",
    line: "#172026",
    pixel: "#2563eb",
    future: "#bfdbfe",
    current: "#be123c",
    ideal: "#d97706",
    error: "#7c3aed",
    white: "#ffffff"
  };

  var SCENARIOS = {
    shallow: {
      label: "shallow down",
      x0: 1,
      y0: 13,
      x1: 25,
      y1: 5
    },
    steep: {
      label: "steep up",
      x0: 4,
      y0: 15,
      x1: 12,
      y1: 1
    },
    backward: {
      label: "backward climb",
      x0: 25,
      y0: 3,
      x1: 3,
      y1: 15
    },
    diagonal: {
      label: "diagonal",
      x0: 2,
      y0: 3,
      x1: 22,
      y1: 15
    },
    vertical: {
      label: "vertical",
      x0: 14,
      y0: 1,
      x1: 14,
      y1: 16
    }
  };

  var DEFAULTS = {
    scenario: "shallow",
    step: 12
  };

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var line = SCENARIOS[scenario];
    var limit = Math.max(Math.abs(line.x1 - line.x0), Math.abs(line.y1 - line.y0));
    var step = clamp(Math.round(finite(raw.step, DEFAULTS.step)), 0, limit);
    return { scenario: scenario, step: step };
  }

  function bresenham(line) {
    var x = line.x0;
    var y = line.y0;
    var dx = Math.abs(line.x1 - line.x0);
    var dy = Math.abs(line.y1 - line.y0);
    var sx = line.x0 < line.x1 ? 1 : line.x0 > line.x1 ? -1 : 0;
    var sy = line.y0 < line.y1 ? 1 : line.y0 > line.y1 ? -1 : 0;
    var err = dx - dy;
    var points = [];
    var trace = [];
    var guard = 0;

    while (guard < 4096) {
      var e2 = 2 * err;
      var moveX = e2 > -dy;
      var moveY = e2 < dx;
      points.push({ x: x, y: y });
      trace.push({ e2: e2, err: err, moveX: moveX, moveY: moveY, x: x, y: y });
      if (x === line.x1 && y === line.y1) break;
      if (moveX) {
        err -= dy;
        x += sx;
      }
      if (moveY) {
        err += dx;
        y += sy;
      }
      guard += 1;
    }

    return {
      dx: dx,
      dy: dy,
      points: points,
      sx: sx,
      sy: sy,
      trace: trace
    };
  }

  function signedAxisError(line, point) {
    var dx = line.x1 - line.x0;
    var dy = line.y1 - line.y0;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx === 0) return 0;
      var yExact = line.y0 + (point.x - line.x0) * dy / dx;
      return point.y - yExact;
    }
    if (dy === 0) return 0;
    var xExact = line.x0 + (point.y - line.y0) * dx / dy;
    return point.x - xExact;
  }

  function maxAxisError(line, points) {
    return points.reduce(function (max, point) {
      return Math.max(max, Math.abs(signedAxisError(line, point)));
    }, 0);
  }

  function adjacent(points) {
    for (var i = 1; i < points.length; i += 1) {
      var dx = Math.abs(points[i].x - points[i - 1].x);
      var dy = Math.abs(points[i].y - points[i - 1].y);
      if (dx > 1 || dy > 1 || dx + dy === 0) return false;
    }
    return true;
  }

  function integerTrace(trace) {
    return trace.every(function (row) {
      return Number.isInteger(row.err) && Number.isInteger(row.e2);
    });
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var line = SCENARIOS[params.scenario];
    var run = bresenham(line);
    var expectedCount = Math.max(run.dx, run.dy) + 1;
    var selected = run.points[Math.min(params.step, run.points.length - 1)];
    var errors = run.points.map(function (point, index) {
      return { index: index, value: signedAxisError(line, point) };
    });
    var audit = {
      adjacent: adjacent(run.points),
      axisErrorBound: maxAxisError(line, run.points) <= 0.5000001,
      count: run.points.length === expectedCount,
      endpoint: run.points[run.points.length - 1].x === line.x1 && run.points[run.points.length - 1].y === line.y1,
      integerState: integerTrace(run.trace),
      start: run.points[0].x === line.x0 && run.points[0].y === line.y0
    };
    audit.passed = audit.adjacent && audit.axisErrorBound && audit.count && audit.endpoint && audit.integerState && audit.start;
    return {
      audit: audit,
      errors: errors,
      line: line,
      maxAxisError: maxAxisError(line, run.points),
      params: params,
      run: run,
      selected: selected
    };
  }

  function auditBresenhamLineLab() {
    Object.keys(SCENARIOS).forEach(function (scenario) {
      var result = evaluate({ scenario: scenario, step: 999 });
      assert(result.audit.passed, scenario + " audit failed");
      assert(result.run.points.length === Math.max(result.run.dx, result.run.dy) + 1, scenario + " count mismatch");
    });
    var shallow = evaluate({ scenario: "shallow" });
    assert(shallow.run.points[1].x === 2, "shallow line should advance x on step 1");
    var vertical = evaluate({ scenario: "vertical" });
    assert(vertical.run.points.every(function (point) { return point.x === vertical.line.x0; }), "vertical x should stay fixed");
    var backward = evaluate({ scenario: "backward" });
    assert(backward.run.sx === -1 && backward.run.sy === 1, "backward scenario should exercise negative x direction");
    return {
      ok: true,
      scenarios: Object.keys(SCENARIOS).length,
      shallowPoints: shallow.run.points.length,
      verticalPoints: vertical.run.points.length
    };
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function setupCanvas(canvas) {
    var ratio = global.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.width || 980));
    var height = Math.max(560, Math.round(rect.height || canvas.height || 680));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
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
    text(ctx, title, box.x + 14, box.y + 20, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 40, COLORS.muted, 10.5, 560);
  }

  function gridMapper(box) {
    var cols = 28;
    var rows = 18;
    var cell = Math.min((box.w - 36) / cols, (box.h - 70) / rows);
    var left = box.x + (box.w - cell * cols) / 2;
    var top = box.y + 58;
    return {
      cell: cell,
      cols: cols,
      rows: rows,
      x: function (gx) { return left + gx * cell + cell / 2; },
      y: function (gy) { return top + gy * cell + cell / 2; },
      left: left,
      top: top
    };
  }

  function drawGrid(ctx, box, result) {
    panel(ctx, box, "integer plotter path", "blue pixels are emitted by the error recurrence");
    var map = gridMapper(box);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var x = 0; x <= map.cols; x += 1) {
      ctx.beginPath();
      ctx.moveTo(map.left + x * map.cell, map.top);
      ctx.lineTo(map.left + x * map.cell, map.top + map.rows * map.cell);
      ctx.stroke();
    }
    for (var y = 0; y <= map.rows; y += 1) {
      ctx.beginPath();
      ctx.moveTo(map.left, map.top + y * map.cell);
      ctx.lineTo(map.left + map.cols * map.cell, map.top + y * map.cell);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.ideal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(map.x(result.line.x0), map.y(result.line.y0));
    ctx.lineTo(map.x(result.line.x1), map.y(result.line.y1));
    ctx.stroke();

    result.run.points.forEach(function (point, index) {
      var emitted = index <= result.params.step;
      var current = index === result.params.step;
      ctx.fillStyle = current ? COLORS.current : emitted ? COLORS.pixel : COLORS.future;
      ctx.globalAlpha = emitted ? 1 : 0.38;
      ctx.beginPath();
      ctx.roundRect(map.x(point.x) - map.cell * 0.38, map.y(point.y) - map.cell * 0.38, map.cell * 0.76, map.cell * 0.76, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    text(ctx, "start", map.x(result.line.x0), map.y(result.line.y0) - map.cell * 0.72, COLORS.good, 10, 760, "center");
    text(ctx, "end", map.x(result.line.x1), map.y(result.line.y1) + map.cell * 0.72, COLORS.bad, 10, 760, "center");
  }

  function drawError(ctx, box, result) {
    panel(ctx, box, "axis error stays bounded", "minor-axis error remains within half a cell");
    var plot = { x: box.x + 38, y: box.y + 64, w: box.w - 56, h: box.h - 100 };
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [-0.5, 0, 0.5].forEach(function (level) {
      var yy = plot.y + plot.h * (0.5 - level);
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
      text(ctx, String(level), plot.x - 8, yy, COLORS.muted, 9, 600, "right");
    });
    ctx.strokeStyle = COLORS.error;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.errors.forEach(function (row, i) {
      var x = plot.x + plot.w * (row.index / Math.max(1, result.errors.length - 1));
      var y = plot.y + plot.h * (0.5 - row.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var selectedError = result.errors[Math.min(result.params.step, result.errors.length - 1)];
    var sx = plot.x + plot.w * (selectedError.index / Math.max(1, result.errors.length - 1));
    var sy = plot.y + plot.h * (0.5 - selectedError.value);
    ctx.fillStyle = COLORS.current;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, "max |error| = " + result.maxAxisError.toFixed(3), box.x + 18, box.y + box.h - 24, COLORS.text, 11, 760);
  }

  function moveLabel(row) {
    if (row.moveX && row.moveY) return "diagonal";
    if (row.moveX) return "x";
    if (row.moveY) return "y";
    return "stop";
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "error ledger", "the next move is chosen by the sign of 2e");
    var visibleRows = clamp(Math.floor((box.h - 92) / 30), 3, 7);
    var start = clamp(result.params.step - Math.floor(visibleRows / 2), 0, Math.max(0, result.run.trace.length - visibleRows));
    var rows = result.run.trace.slice(start, start + visibleRows);
    var y = box.y + 66;
    rows.forEach(function (row, offset) {
      var index = start + offset;
      var current = index === result.params.step;
      ctx.fillStyle = current ? "rgba(190, 18, 60, 0.10)" : offset % 2 ? COLORS.white : "#eef6f5";
      ctx.strokeStyle = current ? "rgba(190, 18, 60, 0.30)" : COLORS.rule;
      ctx.beginPath();
      ctx.roundRect(box.x + 14, y - 14, box.w - 28, 28, 6);
      ctx.fill();
      ctx.stroke();
      text(ctx, String(index), box.x + 26, y, current ? COLORS.current : COLORS.muted, 10, 760);
      text(ctx, "(" + row.x + "," + row.y + ")", box.x + 58, y, COLORS.text, 10.5, 760);
      text(ctx, "e=" + row.err + " 2e=" + row.e2, box.x + 126, y, COLORS.muted, 10, 600);
      text(ctx, moveLabel(row), box.x + box.w - 26, y, current ? COLORS.current : COLORS.pixel, 10, 760, "right");
      y += 30;
    });
    text(ctx, "points " + result.run.points.length + " = max(dx,dy)+1", box.x + 18, box.y + box.h - 22, COLORS.text, 11, 760);
  }

  function drawAudit(ctx, box, result) {
    panel(ctx, box, "audit", "small enough to exhaust, strict enough to catch folklore");
    var rows = [
      ["starts at requested endpoint", result.audit.start],
      ["ends at requested endpoint", result.audit.endpoint],
      ["one adjacent move per pulse", result.audit.adjacent],
      ["point count is max delta + 1", result.audit.count],
      ["integer decision state", result.audit.integerState],
      ["half-cell error bound", result.audit.axisErrorBound]
    ];
    var y = box.y + 66;
    var step = clamp(Math.floor((box.h - 78) / rows.length), 22, 30);
    rows.forEach(function (row) {
      var ok = row[1];
      ctx.fillStyle = ok ? "rgba(15, 118, 110, 0.11)" : "rgba(190, 18, 60, 0.10)";
      ctx.strokeStyle = ok ? "rgba(15, 118, 110, 0.28)" : "rgba(190, 18, 60, 0.28)";
      ctx.beginPath();
      ctx.roundRect(box.x + 14, y - 13, box.w - 28, 26, 6);
      ctx.fill();
      ctx.stroke();
      text(ctx, row[0], box.x + 26, y, COLORS.text, 10.5, 650);
      text(ctx, ok ? "pass" : "fail", box.x + box.w - 26, y, ok ? COLORS.good : COLORS.bad, 10.5, 760, "right");
      y += step;
    });
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    if (width < 660) {
      var pad = 14;
      var gap = 14;
      var h = (height - pad * 2 - gap * 3) / 4;
      drawGrid(ctx, { x: pad, y: pad, w: width - pad * 2, h: h }, result);
      drawError(ctx, { x: pad, y: pad + h + gap, w: width - pad * 2, h: h }, result);
      drawLedger(ctx, { x: pad, y: pad + 2 * (h + gap), w: width - pad * 2, h: h }, result);
      drawAudit(ctx, { x: pad, y: pad + 3 * (h + gap), w: width - pad * 2, h: h }, result);
      return;
    }

    var outer = 16;
    var gap2 = 14;
    var leftW = Math.round(width * 0.58);
    var rightW = width - outer * 2 - gap2 - leftW;
    var thirdH = (height - outer * 2 - gap2 * 2) / 3;
    drawGrid(ctx, { x: outer, y: outer, w: leftW, h: height - outer * 2 }, result);
    drawError(ctx, { x: outer + leftW + gap2, y: outer, w: rightW, h: thirdH }, result);
    drawLedger(ctx, { x: outer + leftW + gap2, y: outer + thirdH + gap2, w: rightW, h: thirdH }, result);
    drawAudit(ctx, { x: outer + leftW + gap2, y: outer + 2 * (thirdH + gap2), w: rightW, h: thirdH }, result);
  }

  function metric(label, value, tone) {
    return '<div class="bres-line-lab__metric bres-line-lab__metric--' + (tone || "plain") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, result) {
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    holder.innerHTML = [
      metric("points", String(result.run.points.length)),
      metric("dx / dy", result.run.dx + " / " + result.run.dy),
      metric("current pixel", "(" + result.selected.x + "," + result.selected.y + ")"),
      metric("max error", result.maxAxisError.toFixed(3)),
      metric("integer state", result.audit.integerState ? "yes" : "no", result.audit.integerState ? "good" : "bad"),
      metric("audit", result.audit.passed ? "pass" : "fail", result.audit.passed ? "good" : "bad")
    ].join("");
  }

  function syncControls(root, result) {
    var step = root.querySelector('[data-param="step"]');
    if (step) {
      step.max = String(result.run.points.length - 1);
      if (Number(step.value) > result.run.points.length - 1) step.value = String(result.run.points.length - 1);
    }
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "step") output.textContent = String(result.params.step);
      if (key === "scenario") output.textContent = result.line.label;
    });
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function init(root) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var pending = false;
    function render() {
      pending = false;
      var result = evaluate(readParams(root));
      root.__bresenhamLineResult = result;
      syncControls(root, result);
      renderMetrics(root, result);
      draw(result, canvas);
    }
    function schedule() {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(render);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render();
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-bresenham-line-lab]").forEach(init);
  }

  var api = {
    auditBresenhamLineLab: auditBresenhamLineLab,
    bresenham: bresenham,
    evaluate: evaluate,
    signedAxisError: signedAxisError
  };

  global.BresenhamLineLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
