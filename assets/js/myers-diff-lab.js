(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    equal: "#0f766e",
    delete: "#be123c",
    insert: "#2563eb",
    frontier: "#b45309",
    snake: "#7c3aed",
    paleEqual: "rgba(15, 118, 110, 0.13)",
    paleDelete: "rgba(190, 18, 60, 0.12)",
    paleInsert: "rgba(37, 99, 235, 0.12)",
    paleFrontier: "rgba(180, 83, 9, 0.13)",
    paleSnake: "rgba(124, 58, 237, 0.13)"
  };

  var NEG = -1000000000;

  var EXAMPLES = {
    refactor: {
      label: "small refactor",
      old: [
        "load config",
        "parse flags",
        "open file",
        "read rows",
        "validate rows",
        "write report",
        "close file"
      ],
      neu: [
        "load config",
        "parse flags",
        "open file",
        "read rows",
        "normalize rows",
        "validate rows",
        "write report",
        "close file"
      ]
    },
    moved: {
      label: "moved block",
      old: [
        "import cache",
        "import auth",
        "load user",
        "check auth",
        "warm cache",
        "render page",
        "emit metrics"
      ],
      neu: [
        "import auth",
        "import cache",
        "load user",
        "warm cache",
        "check auth",
        "render page",
        "emit metrics"
      ]
    },
    repeated: {
      label: "repeated tokens",
      old: ["A", "B", "A", "B", "A", "C", "A", "B"],
      neu: ["B", "A", "B", "A", "B", "A", "C"]
    },
    sentence: {
      label: "sentence edit",
      old: ["the", "fast", "red", "fox", "jumps", "over", "the", "log"],
      neu: ["the", "red", "fox", "quietly", "jumps", "over", "a", "log"]
    },
    config: {
      label: "config file",
      old: [
        "timeout = 250",
        "retries = 2",
        "cache = off",
        "region = us-east",
        "log = warn",
        "feature_x = false"
      ],
      neu: [
        "timeout = 400",
        "retries = 2",
        "cache = on",
        "region = us-east",
        "feature_x = true",
        "log = info"
      ]
    }
  };

  var DEFAULTS = {
    example: "refactor",
    tie: "delete",
    layer: 0
  };

  var TIES = {
    delete: "prefer deletes",
    insert: "prefer inserts"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      example: EXAMPLES[raw.example] ? raw.example : DEFAULTS.example,
      tie: TIES[raw.tie] ? raw.tie : DEFAULTS.tie,
      layer: Math.round(clamp(finite(Number(raw.layer), DEFAULTS.layer), 0, 1000))
    };
  }

  function exampleData(key) {
    var ex = EXAMPLES[key] || EXAMPLES.refactor;
    return {
      label: ex.label,
      old: ex.old.slice(),
      neu: ex.neu.slice()
    };
  }

  function sameToken(a, b) {
    return a === b;
  }

  function chooseMove(k, d, prev, offset, tie) {
    if (d === 0) {
      return {
        move: "start",
        prevK: null,
        xStart: 0,
        yStart: 0,
        prevX: 0,
        prevY: 0
      };
    }

    var canInsert = k !== d;
    var canDelete = k !== -d;
    var insertX = canInsert ? prev[offset + k + 1] : NEG;
    var deleteX = canDelete ? prev[offset + k - 1] + 1 : NEG;
    var move;

    if (!canDelete) move = "insert";
    else if (!canInsert) move = "delete";
    else if (deleteX > insertX) move = "delete";
    else if (insertX > deleteX) move = "insert";
    else move = tie === "insert" ? "insert" : "delete";

    if (move === "insert") {
      var ix = insertX;
      return {
        move: "insert",
        prevK: k + 1,
        xStart: ix,
        yStart: ix - k,
        prevX: ix,
        prevY: ix - (k + 1)
      };
    }

    var dx = deleteX;
    return {
      move: "delete",
      prevK: k - 1,
      xStart: dx,
      yStart: dx - k,
      prevX: dx - 1,
      prevY: dx - 1 - (k - 1)
    };
  }

  function myersDiff(oldSeq, newSeq, options) {
    options = options || {};
    var tie = TIES[options.tie] ? options.tie : DEFAULTS.tie;
    var n = oldSeq.length;
    var m = newSeq.length;
    var max = n + m;
    var offset = max + 2;
    var size = 2 * max + 5;
    var v = new Array(size);
    var traces = [];
    var layers = [];
    var endD = max;
    var found = false;

    for (var i = 0; i < size; i += 1) v[i] = NEG;
    v[offset + 1] = 0;

    for (var d = 0; d <= max && !found; d += 1) {
      var next = new Array(size);
      var cells = [];
      for (i = 0; i < size; i += 1) next[i] = NEG;

      for (var k = -d; k <= d; k += 2) {
        var decision = chooseMove(k, d, v, offset, tie);
        var x = decision.xStart;
        var y = decision.yStart;
        var snakeStartX = x;
        var snakeStartY = y;

        while (x < n && y < m && sameToken(oldSeq[x], newSeq[y])) {
          x += 1;
          y += 1;
        }

        next[offset + k] = x;
        cells.push({
          d: d,
          k: k,
          move: decision.move,
          prevK: decision.prevK,
          prevX: decision.prevX,
          prevY: decision.prevY,
          xStart: snakeStartX,
          yStart: snakeStartY,
          x: x,
          y: y,
          snake: x - snakeStartX
        });

        if (x >= n && y >= m) {
          endD = d;
          found = true;
          break;
        }
      }

      traces[d] = next.slice();
      layers.push({
        d: d,
        cells: cells,
        maxX: cells.reduce(function (best, cell) { return Math.max(best, cell.x); }, 0)
      });
      v = next;
    }

    var ops = backtrack(oldSeq, newSeq, traces, offset, endD, tie);
    var path = pathFromOps(ops);
    var lcsLength = ops.filter(function (op) { return op.type === "equal"; }).length;

    return {
      old: oldSeq.slice(),
      neu: newSeq.slice(),
      tie: tie,
      distance: endD,
      lcsLength: lcsLength,
      ops: ops,
      path: path,
      traces: traces,
      layers: layers,
      offset: offset
    };
  }

  function backtrack(oldSeq, newSeq, traces, offset, endD, tie) {
    var x = oldSeq.length;
    var y = newSeq.length;
    var ops = [];

    for (var d = endD; d > 0; d -= 1) {
      var k = x - y;
      var prev = traces[d - 1];
      var decision = chooseMove(k, d, prev, offset, tie);
      var xStart = decision.xStart;
      var yStart = decision.yStart;

      while (x > xStart && y > yStart) {
        ops.unshift({
          type: "equal",
          oldIndex: x - 1,
          newIndex: y - 1,
          value: oldSeq[x - 1]
        });
        x -= 1;
        y -= 1;
      }

      if (decision.move === "insert") {
        ops.unshift({
          type: "insert",
          oldIndex: x,
          newIndex: y - 1,
          value: newSeq[y - 1]
        });
        y -= 1;
      } else {
        ops.unshift({
          type: "delete",
          oldIndex: x - 1,
          newIndex: y,
          value: oldSeq[x - 1]
        });
        x -= 1;
      }
    }

    while (x > 0 && y > 0) {
      ops.unshift({
        type: "equal",
        oldIndex: x - 1,
        newIndex: y - 1,
        value: oldSeq[x - 1]
      });
      x -= 1;
      y -= 1;
    }

    while (x > 0) {
      ops.unshift({
        type: "delete",
        oldIndex: x - 1,
        newIndex: 0,
        value: oldSeq[x - 1]
      });
      x -= 1;
    }

    while (y > 0) {
      ops.unshift({
        type: "insert",
        oldIndex: 0,
        newIndex: y - 1,
        value: newSeq[y - 1]
      });
      y -= 1;
    }

    return ops;
  }

  function pathFromOps(ops) {
    var x = 0;
    var y = 0;
    var points = [{ x: 0, y: 0, op: "start" }];
    ops.forEach(function (op) {
      if (op.type === "delete") x += 1;
      else if (op.type === "insert") y += 1;
      else {
        x += 1;
        y += 1;
      }
      points.push({ x: x, y: y, op: op.type, value: op.value });
    });
    return points;
  }

  function applyOps(oldSeq, ops) {
    var out = [];
    var cursor = 0;
    ops.forEach(function (op) {
      if (op.type === "equal") {
        out.push(oldSeq[cursor]);
        cursor += 1;
      } else if (op.type === "delete") {
        cursor += 1;
      } else if (op.type === "insert") {
        out.push(op.value);
      }
    });
    return out;
  }

  function lcsDp(oldSeq, newSeq) {
    var n = oldSeq.length;
    var m = newSeq.length;
    var dp = [];
    for (var i = 0; i <= n; i += 1) {
      dp[i] = [];
      for (var j = 0; j <= m; j += 1) dp[i][j] = 0;
    }
    for (i = n - 1; i >= 0; i -= 1) {
      for (j = m - 1; j >= 0; j -= 1) {
        dp[i][j] = sameToken(oldSeq[i], newSeq[j]) ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    return {
      lcsLength: dp[0][0],
      distance: n + m - 2 * dp[0][0],
      table: dp
    };
  }

  function sameArray(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function verifyResult(result) {
    var issues = [];
    var dp = lcsDp(result.old, result.neu);
    var replay = applyOps(result.old, result.ops);
    var edits = result.ops.filter(function (op) { return op.type !== "equal"; }).length;
    var equals = result.ops.filter(function (op) { return op.type === "equal"; }).length;

    if (result.distance !== dp.distance) issues.push("frontier distance " + result.distance + " != DP distance " + dp.distance);
    if (result.lcsLength !== dp.lcsLength) issues.push("frontier LCS " + result.lcsLength + " != DP LCS " + dp.lcsLength);
    if (!sameArray(replay, result.neu)) issues.push("operation replay does not produce new sequence");
    if (edits !== result.distance) issues.push("edit operation count " + edits + " != distance " + result.distance);
    if (equals !== result.lcsLength) issues.push("equal operation count " + equals + " != LCS " + result.lcsLength);
    if (!result.path.length || result.path[0].x !== 0 || result.path[0].y !== 0) issues.push("path does not start at origin");
    var last = result.path[result.path.length - 1];
    if (last.x !== result.old.length || last.y !== result.neu.length) issues.push("path does not end at target");

    for (var i = 1; i < result.path.length; i += 1) {
      var prev = result.path[i - 1];
      var cur = result.path[i];
      var dx = cur.x - prev.x;
      var dy = cur.y - prev.y;
      if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1) || (dx === 1 && dy === 1))) {
        issues.push("path step " + i + " is not monotone");
        break;
      }
    }

    result.ops.forEach(function (op, index) {
      if (op.type === "equal" && result.old[op.oldIndex] !== result.neu[op.newIndex]) {
        issues.push("equal op " + index + " joins different tokens");
      }
    });

    return {
      ok: issues.length === 0,
      issues: issues,
      dp: dp,
      replay: replay
    };
  }

  function binarySequences(length) {
    var rows = [];
    var total = Math.pow(2, length);
    for (var mask = 0; mask < total; mask += 1) {
      var row = [];
      for (var bit = 0; bit < length; bit += 1) {
        row.push(mask & (1 << bit) ? "B" : "A");
      }
      rows.push(row);
    }
    return rows;
  }

  function auditMyersDiff() {
    var issues = [];
    var reports = [];
    Object.keys(EXAMPLES).forEach(function (key) {
      ["delete", "insert"].forEach(function (tie) {
        var data = exampleData(key);
        var result = myersDiff(data.old, data.neu, { tie: tie });
        var audit = verifyResult(result);
        if (!audit.ok) {
          audit.issues.forEach(function (issue) {
            issues.push(key + "/" + tie + ": " + issue);
          });
        }
        reports.push({
          example: key,
          label: data.label,
          tie: tie,
          oldLength: data.old.length,
          newLength: data.neu.length,
          distance: result.distance,
          lcsLength: result.lcsLength,
          layers: result.layers.length,
          operations: result.ops.length
        });
      });
    });

    var small = [];
    for (var len = 0; len <= 5; len += 1) {
      small = small.concat(binarySequences(len));
    }

    var checked = 0;
    small.forEach(function (a) {
      small.forEach(function (b) {
        var result = myersDiff(a, b, { tie: "delete" });
        var audit = verifyResult(result);
        checked += 1;
        if (!audit.ok) {
          issues.push("binary case " + a.join("") + " -> " + b.join("") + ": " + audit.issues.join("; "));
        }
      });
    });

    return {
      ok: issues.length === 0,
      issues: issues,
      reports: reports,
      exhaustiveBinaryCases: checked
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var data = exampleData(params.example);
    var result = myersDiff(data.old, data.neu, { tie: params.tie });
    var audit = verifyResult(result);
    var layer = clamp(params.layer, 0, Math.max(0, result.layers.length - 1));
    return {
      params: params,
      data: data,
      result: result,
      audit: audit,
      layer: layer
    };
  }

  function compact(text, limit) {
    text = String(text);
    if (text.length <= limit) return text;
    return text.slice(0, Math.max(0, limit - 1)) + "...";
  }

  function formatNumber(value) {
    return Number(value).toLocaleString("en-US");
  }

  function setText(root, name, value) {
    var node = root.querySelector('[data-metric="' + name + '"]');
    if (node) node.textContent = value;
  }

  function setCanvasSize(canvas, width, height) {
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ctx;
  }

  function text(ctx, value, x, y, size, color, weight) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(String(value), x, y);
  }

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    text(ctx, title, box.x + 14, box.y + 25, 14, COLORS.text, 800);
  }

  function graphPoint(plot, x, y) {
    return {
      x: plot.x + x * plot.cell,
      y: plot.y + y * plot.cell
    };
  }

  function drawArrowSegment(ctx, plot, a, b, color, width) {
    var p = graphPoint(plot, a.x, a.y);
    var q = graphPoint(plot, b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }

  function drawGraph(ctx, state, box) {
    var result = state.result;
    var oldSeq = result.old;
    var newSeq = result.neu;
    var n = oldSeq.length;
    var m = newSeq.length;
    var layer = result.layers[state.layer] || result.layers[0];
    panel(ctx, box, "edit graph and furthest-reaching frontier");

    var cell = Math.min((box.w - 86) / Math.max(1, n), (box.h - 96) / Math.max(1, m), 44);
    var plot = {
      x: box.x + 54,
      y: box.y + 58,
      cell: cell,
      w: cell * n,
      h: cell * m
    };

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    for (var i = 0; i <= n; i += 1) {
      var gx = plot.x + i * cell;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y);
      ctx.lineTo(gx, plot.y + plot.h);
      ctx.stroke();
    }
    for (var j = 0; j <= m; j += 1) {
      var gy = plot.y + j * cell;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }

    for (i = 0; i < n; i += 1) {
      text(ctx, compact(oldSeq[i], 8), plot.x + i * cell + 4, plot.y - 12, 10, COLORS.muted, 650);
    }
    for (j = 0; j < m; j += 1) {
      text(ctx, compact(newSeq[j], 8), box.x + 10, plot.y + j * cell + cell * 0.58, 10, COLORS.muted, 650);
    }

    for (i = 0; i < n; i += 1) {
      for (j = 0; j < m; j += 1) {
        if (!sameToken(oldSeq[i], newSeq[j])) continue;
        var p = graphPoint(plot, i, j);
        var q = graphPoint(plot, i + 1, j + 1);
        ctx.strokeStyle = COLORS.paleEqual;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }

    if (layer) {
      layer.cells.forEach(function (cellInfo) {
        var start = { x: cellInfo.xStart, y: cellInfo.yStart };
        var end = { x: cellInfo.x, y: cellInfo.y };
        var prev = { x: cellInfo.prevX, y: cellInfo.prevY };
        if (cellInfo.move === "delete") drawArrowSegment(ctx, plot, prev, start, COLORS.delete, 2);
        if (cellInfo.move === "insert") drawArrowSegment(ctx, plot, prev, start, COLORS.insert, 2);
        if (cellInfo.snake > 0) drawArrowSegment(ctx, plot, start, end, COLORS.snake, 4);
        var gp = graphPoint(plot, end.x, end.y);
        ctx.fillStyle = COLORS.frontier;
        ctx.beginPath();
        ctx.arc(gp.x, gp.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        text(ctx, "k=" + cellInfo.k, gp.x + 5, gp.y - 5, 9, COLORS.frontier, 700);
      });
    }

    for (i = 1; i < result.path.length; i += 1) {
      var from = result.path[i - 1];
      var to = result.path[i];
      var color = to.op === "equal" ? COLORS.equal : to.op === "delete" ? COLORS.delete : COLORS.insert;
      drawArrowSegment(ctx, plot, from, to, color, to.op === "equal" ? 4 : 3);
    }

    text(ctx, "D = " + state.layer + " frontier", box.x + 14, box.y + box.h - 24, 12, COLORS.frontier, 800);
    text(ctx, "green path = selected shortest script", box.x + 150, box.y + box.h - 24, 12, COLORS.muted, 650);
  }

  function drawScript(ctx, state, box) {
    var ops = state.result.ops;
    panel(ctx, box, "shortest edit script");
    var y = box.y + 52;
    var rowH = 27;
    for (var i = 0; i < Math.min(ops.length, 18); i += 1) {
      var op = ops[i];
      var color = op.type === "equal" ? COLORS.equal : op.type === "delete" ? COLORS.delete : COLORS.insert;
      var bg = op.type === "equal" ? COLORS.paleEqual : op.type === "delete" ? COLORS.paleDelete : COLORS.paleInsert;
      ctx.fillStyle = bg;
      ctx.fillRect(box.x + 12, y - 17, box.w - 24, 22);
      text(ctx, op.type === "equal" ? "=" : op.type === "delete" ? "-" : "+", box.x + 22, y, 14, color, 900);
      text(ctx, compact(op.value, 30), box.x + 48, y, 12, COLORS.text, 650);
      y += rowH;
    }
    if (ops.length > 18) text(ctx, "+" + (ops.length - 18) + " more operations", box.x + 18, box.y + box.h - 18, 11, COLORS.muted, 650);
  }

  function drawFrontierChart(ctx, state, box) {
    var layers = state.result.layers;
    panel(ctx, box, "frontier growth by edit distance");
    var x = box.x + 38;
    var y = box.y + 48;
    var w = box.w - 70;
    var h = box.h - 82;
    var maxX = Math.max(1, state.result.old.length);
    var barGap = 4;
    var barW = Math.max(8, (w - barGap * Math.max(0, layers.length - 1)) / Math.max(1, layers.length));

    layers.forEach(function (layer, index) {
      var bh = h * layer.maxX / maxX;
      var bx = x + index * (barW + barGap);
      var by = y + h - bh;
      ctx.fillStyle = index === state.layer ? COLORS.frontier : "#cbd5df";
      ctx.fillRect(bx, by, barW, Math.max(2, bh));
      text(ctx, layer.d, bx + Math.max(1, barW * 0.25), y + h + 18, 10, COLORS.muted, 650);
    });

    text(ctx, "bar height is furthest old-index reached by any diagonal", box.x + 14, box.y + box.h - 16, 11, COLORS.muted, 650);
  }

  function drawSequences(ctx, state, box) {
    panel(ctx, box, "old and new sequences");
    var oldSeq = state.result.old;
    var newSeq = state.result.neu;
    var y = box.y + 52;
    text(ctx, "old", box.x + 16, y, 12, COLORS.delete, 850);
    text(ctx, "new", box.x + box.w / 2 + 6, y, 12, COLORS.insert, 850);
    y += 22;
    for (var i = 0; i < Math.max(oldSeq.length, newSeq.length); i += 1) {
      if (oldSeq[i] !== undefined) text(ctx, i + ": " + compact(oldSeq[i], 24), box.x + 16, y, 11, COLORS.text, 600);
      if (newSeq[i] !== undefined) text(ctx, i + ": " + compact(newSeq[i], 24), box.x + box.w / 2 + 6, y, 11, COLORS.text, 600);
      y += 21;
      if (y > box.y + box.h - 10) break;
    }
  }

  function draw(canvas, state) {
    var width = 1080;
    var height = 700;
    var ctx = setCanvasSize(canvas, width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);
    drawGraph(ctx, state, { x: 24, y: 24, w: 620, h: 438 });
    drawScript(ctx, state, { x: 668, y: 24, w: 388, h: 438 });
    drawFrontierChart(ctx, state, { x: 24, y: 486, w: 430, h: 190 });
    drawSequences(ctx, state, { x: 478, y: 486, w: 578, h: 190 });
  }

  function updateOutputs(root, state) {
    root.querySelectorAll("output[data-value]").forEach(function (output) {
      var name = output.getAttribute("data-value");
      if (name === "example") output.textContent = state.data.label;
      if (name === "tie") output.textContent = TIES[state.params.tie];
      if (name === "layer") output.textContent = state.layer + " / " + Math.max(0, state.result.layers.length - 1);
    });

    setText(root, "old", state.result.old.length);
    setText(root, "new", state.result.neu.length);
    setText(root, "distance", state.result.distance);
    setText(root, "lcs", state.result.lcsLength);
    setText(root, "ops", state.result.ops.length);
    setText(root, "frontier", state.result.layers.reduce(function (sum, layer) { return sum + layer.cells.length; }, 0));
    setText(root, "oracle", state.audit.ok ? "passes" : "fails");
  }

  function mount(root) {
    var controls = root.querySelectorAll("[data-param]");
    var canvas = root.querySelector("canvas");
    var uiState = normalize({});

    controls.forEach(function (control) {
      var name = control.getAttribute("data-param");
      if (Object.prototype.hasOwnProperty.call(uiState, name)) control.value = uiState[name];
      control.addEventListener("input", function () {
        uiState[name] = control.value;
        render();
      });
      control.addEventListener("change", function () {
        uiState[name] = control.value;
        render();
      });
    });

    function render() {
      var state = evaluate(uiState);
      uiState.layer = state.layer;
      controls.forEach(function (control) {
        var name = control.getAttribute("data-param");
        if (name === "layer") {
          control.max = Math.max(0, state.result.layers.length - 1);
          control.value = state.layer;
        } else if (Object.prototype.hasOwnProperty.call(state.params, name)) {
          control.value = state.params[name];
        }
      });
      updateOutputs(root, state);
      if (canvas) draw(canvas, state);
    }

    render();
  }

  function mountAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-myers-diff-lab]").forEach(function (root) {
      mount(root);
    });
  }

  var api = {
    EXAMPLES: EXAMPLES,
    myersDiff: myersDiff,
    lcsDp: lcsDp,
    verifyResult: verifyResult,
    auditMyersDiff: auditMyersDiff,
    evaluate: evaluate,
    applyOps: applyOps
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.MyersDiffLab = api;
    if (global.document) {
      if (global.document.readyState === "loading") {
        global.document.addEventListener("DOMContentLoaded", mountAll);
      } else {
        mountAll();
      }
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
