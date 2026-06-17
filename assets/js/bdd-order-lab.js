(function (global) {
  "use strict";

  var COLORS = {
    axis: "#d7dee5",
    bad: "#be123c",
    blue: "#2563eb",
    gold: "#d97706",
    good: "#0f766e",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    panel: "#f8fafc",
    purple: "#7c3aed",
    softBad: "rgba(190, 18, 60, 0.12)",
    softBlue: "rgba(37, 99, 235, 0.11)",
    softGold: "rgba(217, 119, 6, 0.14)",
    softGood: "rgba(15, 118, 110, 0.12)",
    softPurple: "rgba(124, 58, 237, 0.12)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    bits: 6,
    fn: "eq",
    order: "paired"
  };

  var FUNCTIONS = {
    eq: {
      label: "bit-vector equality",
      note: "Accept exactly when every x bit matches its y partner."
    },
    pairOr: {
      label: "pairwise hit",
      note: "Accept when at least one bit-pair has x_i = y_i = 1."
    }
  };

  var ORDERS = {
    paired: "paired x0,y0,x1,y1",
    grouped: "grouped x... then y...",
    yfirst: "paired y0,x0,y1,x1",
    shuffled: "outer bits first"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      bits: snap(raw.bits, DEFAULTS.bits, 2, 10, 1),
      fn: FUNCTIONS[raw.fn] ? raw.fn : DEFAULTS.fn,
      order: ORDERS[raw.order] ? raw.order : DEFAULTS.order
    };
  }

  function variableNames(bits) {
    var names = [];
    for (var i = 0; i < bits; i += 1) names.push("x" + i);
    for (var j = 0; j < bits; j += 1) names.push("y" + j);
    return names;
  }

  function orderNames(bits, kind) {
    var order = [];
    if (kind === "grouped") return variableNames(bits);
    if (kind === "yfirst") {
      for (var a = 0; a < bits; a += 1) {
        order.push("y" + a);
        order.push("x" + a);
      }
      return order;
    }
    if (kind === "shuffled") {
      for (var left = 0, right = bits - 1; left <= right; left += 1, right -= 1) {
        order.push("x" + left);
        order.push("y" + left);
        if (right !== left) {
          order.push("x" + right);
          order.push("y" + right);
        }
      }
      return order;
    }
    for (var i = 0; i < bits; i += 1) {
      order.push("x" + i);
      order.push("y" + i);
    }
    return order;
  }

  function makeManager(order) {
    var varToLevel = {};
    order.forEach(function (name, index) { varToLevel[name] = index; });
    var nodes = [
      { id: 0, terminal: true, value: false },
      { id: 1, terminal: true, value: true }
    ];
    var unique = {};
    var applyCache = {};
    var notCache = {};

    function mk(level, low, high) {
      if (low === high) return low;
      var key = level + "|" + low + "|" + high;
      if (unique[key] != null) return unique[key];
      var id = nodes.length;
      unique[key] = id;
      nodes.push({ high: high, id: id, level: level, low: low, name: order[level] });
      return id;
    }

    function variable(name) {
      return mk(varToLevel[name], 0, 1);
    }

    function topLevel(id) {
      return nodes[id].terminal ? Infinity : nodes[id].level;
    }

    function lowAt(id, level) {
      return topLevel(id) === level ? nodes[id].low : id;
    }

    function highAt(id, level) {
      return topLevel(id) === level ? nodes[id].high : id;
    }

    function opValue(op, a, b) {
      if (op === "and") return a && b;
      if (op === "or") return a || b;
      if (op === "xor") return Boolean(a) !== Boolean(b);
      if (op === "eq") return Boolean(a) === Boolean(b);
      throw new Error("unknown op " + op);
    }

    function apply(op, a, b) {
      var key = op + "|" + a + "|" + b;
      if (applyCache[key] != null) return applyCache[key];
      var na = nodes[a];
      var nb = nodes[b];
      var out;
      if (na.terminal && nb.terminal) {
        out = opValue(op, na.value, nb.value) ? 1 : 0;
      } else {
        var level = Math.min(topLevel(a), topLevel(b));
        var low = apply(op, lowAt(a, level), lowAt(b, level));
        var high = apply(op, highAt(a, level), highAt(b, level));
        out = mk(level, low, high);
      }
      applyCache[key] = out;
      return out;
    }

    function not(id) {
      if (notCache[id] != null) return notCache[id];
      var node = nodes[id];
      var out;
      if (node.terminal) {
        out = node.value ? 0 : 1;
      } else {
        out = mk(node.level, not(node.low), not(node.high));
      }
      notCache[id] = out;
      return out;
    }

    function satCount(root) {
      var memo = {};
      function rec(id, level) {
        var key = id + "|" + level;
        if (memo[key] != null) return memo[key];
        var node = nodes[id];
        var out;
        if (node.terminal) {
          out = node.value ? (1n << BigInt(order.length - level)) : 0n;
        } else {
          var skipped = node.level - level;
          out = (1n << BigInt(skipped)) * (rec(node.low, node.level + 1) + rec(node.high, node.level + 1));
        }
        memo[key] = out;
        return out;
      }
      return rec(root, 0);
    }

    function reachable(root) {
      var seen = {};
      function visit(id) {
        if (seen[id]) return;
        seen[id] = true;
        var node = nodes[id];
        if (!node.terminal) {
          visit(node.low);
          visit(node.high);
        }
      }
      visit(root);
      return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    }

    function widths(root) {
      var out = order.map(function () { return 0; });
      reachable(root).forEach(function (id) {
        var node = nodes[id];
        if (!node.terminal) out[node.level] += 1;
      });
      return out;
    }

    return {
      apply: apply,
      mk: mk,
      nodes: nodes,
      not: not,
      order: order,
      reachable: reachable,
      satCount: satCount,
      uniqueCount: function () { return Object.keys(unique).length; },
      variable: variable,
      widths: widths
    };
  }

  function buildFunction(bits, fn, orderKind) {
    var order = orderNames(bits, orderKind);
    var manager = makeManager(order);
    var root = fn === "pairOr" ? 0 : 1;
    for (var i = 0; i < bits; i += 1) {
      var x = manager.variable("x" + i);
      var y = manager.variable("y" + i);
      if (fn === "pairOr") {
        root = manager.apply("or", root, manager.apply("and", x, y));
      } else {
        root = manager.apply("and", root, manager.apply("eq", x, y));
      }
    }
    return {
      bits: bits,
      fn: fn,
      manager: manager,
      nodeCount: manager.reachable(root).filter(function (id) { return id > 1; }).length,
      order: order,
      orderKind: orderKind,
      root: root,
      satCount: manager.satCount(root),
      widths: manager.widths(root)
    };
  }

  function exactSat(bits, fn) {
    if (fn === "eq") return 1n << BigInt(bits);
    return (1n << BigInt(2 * bits)) - powBig(3n, bits);
  }

  function powBig(base, exp) {
    var out = 1n;
    for (var i = 0; i < exp; i += 1) out *= base;
    return out;
  }

  function fullTreeNodes(varCount) {
    return (1n << BigInt(varCount + 1)) - 1n;
  }

  function fmtBig(value) {
    value = BigInt(value);
    var text = value.toString();
    if (text.length <= 9) return text;
    return text.slice(0, 4) + "..." + text.slice(-4);
  }

  function formatNumber(value) {
    if (!isFinite(value)) return String(value);
    if (Math.abs(value) >= 1000000) return value.toExponential(2);
    return String(Math.round(value * 100) / 100);
  }

  function buildCurve(bits, fn) {
    var maxBits = Math.max(2, Math.min(10, bits));
    var orders = ["paired", "grouped", "yfirst", "shuffled"];
    var rows = [];
    for (var n = 2; n <= maxBits; n += 1) {
      var row = { bits: n };
      orders.forEach(function (kind) {
        row[kind] = buildFunction(n, fn, kind).nodeCount;
      });
      rows.push(row);
    }
    return rows;
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var current = buildFunction(params.bits, params.fn, params.order);
    var paired = buildFunction(params.bits, params.fn, "paired");
    var grouped = buildFunction(params.bits, params.fn, "grouped");
    var yfirst = buildFunction(params.bits, params.fn, "yfirst");
    var shuffled = buildFunction(params.bits, params.fn, "shuffled");
    var candidates = [paired, grouped, yfirst, shuffled];
    var best = candidates.reduce(function (a, b) { return a.nodeCount <= b.nodeCount ? a : b; });
    var worst = candidates.reduce(function (a, b) { return a.nodeCount >= b.nodeCount ? a : b; });
    return {
      best: best,
      candidates: candidates,
      curve: buildCurve(params.bits, params.fn),
      current: current,
      exactSat: exactSat(params.bits, params.fn),
      fullTree: fullTreeNodes(params.bits * 2),
      params: params,
      worst: worst
    };
  }

  function metric(label, value, tone) {
    return '<div class="bdd-lab__metric ' + (tone || "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    if (!canvas || !canvas.getContext) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 940));
    var compact = width < 680;
    var height = compact ? 1120 : 760;
    var ratio = Math.max(1, global.devicePixelRatio || 1);
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { compact: compact, ctx: ctx, height: height, width: width };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fillText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/\s+/);
    var lines = [];
    var line = "";
    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    var limit = maxLines || lines.length;
    for (var i = 0; i < Math.min(limit, lines.length); i += 1) {
      var out = lines[i];
      if (i === limit - 1 && lines.length > limit) out = out.replace(/[.,;:]?$/, "") + "...";
      fillText(ctx, out, x, y + i * lineHeight, COLORS.muted, 12, 550);
    }
  }

  function panel(ctx, box, title, subtitle) {
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.stroke();
    fillText(ctx, title, box.x + 14, box.y + 12, COLORS.ink, 14, 760);
    if (subtitle) wrapText(ctx, subtitle, box.x + 14, box.y + 33, box.w - 28, 15, 2);
  }

  function drawWidths(ctx, state, box) {
    panel(ctx, box, "Width by variable level", "Reduced nodes per ordered level; a wide middle means the diagram is remembering many partial assignments.");
    var widths = state.current.widths;
    var maxWidth = Math.max.apply(null, widths.concat([1]));
    var x = box.x + 26;
    var y = box.y + 86;
    var w = box.w - 52;
    var h = box.h - 150;
    var barGap = Math.max(2, Math.min(6, w / widths.length * 0.12));
    var barW = (w - barGap * (widths.length - 1)) / widths.length;
    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 3; g += 1) {
      var gy = y + h - g * h / 3;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
      ctx.stroke();
      fillText(ctx, String(Math.round(maxWidth * g / 3)), x - 7, gy - 7, COLORS.muted, 10, 650, "right");
    }
    widths.forEach(function (value, index) {
      var bx = x + index * (barW + barGap);
      var bh = h * value / maxWidth;
      var name = state.current.order[index];
      ctx.fillStyle = name[0] === "x" ? COLORS.blue : COLORS.purple;
      ctx.fillRect(bx, y + h - bh, barW, bh);
      if (barW > 12 || index % 2 === 0) fillText(ctx, name, bx + barW / 2, y + h + 8, COLORS.muted, 10, 700, "center");
    });
    fillText(ctx, "current order: " + ORDERS[state.params.order], x, box.y + box.h - 34, COLORS.ink, 12, 760);
  }

  function drawCurve(ctx, state, box) {
    panel(ctx, box, "Order tax curve", "Node counts on a log scale.");
    var rows = state.curve;
    var series = [
      { color: COLORS.good, key: "paired", label: "paired" },
      { color: COLORS.bad, key: "grouped", label: "grouped" },
      { color: COLORS.blue, key: "yfirst", label: "y-first" },
      { color: COLORS.gold, key: "shuffled", label: "outer-first" }
    ];
    var legendX = box.x + 18;
    var legendY = box.y + 58;
    series.forEach(function (s, index) {
      var col = index % 2;
      var row = Math.floor(index / 2);
      var lx = legendX + col * 112;
      var ly = legendY + row * 16;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, ly + 6);
      ctx.lineTo(lx + 16, ly + 6);
      ctx.stroke();
      fillText(ctx, s.label, lx + 21, ly, s.color, 10, 750);
    });
    var x = box.x + 44;
    var y = box.y + 98;
    var w = box.w - 66;
    var h = box.h - 154;
    var maxNode = Math.max.apply(null, rows.reduce(function (all, row) {
      return all.concat(series.map(function (s) { return row[s.key]; }));
    }, [1]));
    function sx(bits) {
      var min = rows[0].bits;
      var max = rows[rows.length - 1].bits;
      return x + (bits - min) / Math.max(1, max - min) * w;
    }
    function sy(value) {
      return y + h - Math.log(value + 1) / Math.log(maxNode + 1) * h;
    }
    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 3; g += 1) {
      var gy = y + g * h / 3;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
      ctx.stroke();
    }
    series.forEach(function (s) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach(function (row, index) {
        var px = sx(row.bits);
        var py = sy(row[s.key]);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
    fillText(ctx, "bits", x + w, box.y + box.h - 34, COLORS.muted, 11, 650, "right");
    fillText(ctx, "log(nodes + 1)", x, box.y + box.h - 34, COLORS.muted, 11, 650);
  }

  function drawMatrix(ctx, state, box) {
    panel(ctx, box, "Accepted assignments", FUNCTIONS[state.params.fn].note);
    var n = Math.min(4, state.params.bits);
    var cells = 1 << n;
    var size = Math.min(box.w - 72, box.h - 110);
    var x = box.x + (box.w - size) / 2;
    var y = box.y + 82;
    var cell = size / cells;
    for (var xi = 0; xi < cells; xi += 1) {
      for (var yi = 0; yi < cells; yi += 1) {
        var accept = state.params.fn === "eq" ? xi === yi : (xi & yi) !== 0;
        ctx.fillStyle = accept ? COLORS.softGood : COLORS.panel;
        ctx.fillRect(x + xi * cell, y + (cells - 1 - yi) * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.strokeRect(x, y, size, size);
    fillText(ctx, "x bits", x + size, y + size + 10, COLORS.muted, 11, 650, "right");
    fillText(ctx, "y bits", x, y - 18, COLORS.muted, 11, 650);
    fillText(ctx, "shown for " + n + " of " + state.params.bits + " bit-pairs", box.x + 16, box.y + box.h - 34, COLORS.muted, 12, 650);
  }

  function drawLedger(ctx, state, box) {
    panel(ctx, box, "Reduction ledger", "ROBDDs merge identical subgraphs and delete tests whose low and high branches agree.");
    var x = box.x + 18;
    var y = box.y + 82;
    var rows = [
      ["full decision tree", fmtBig(state.fullTree), COLORS.bad],
      ["current ROBDD", String(state.current.nodeCount), COLORS.blue],
      ["best fixed order", state.best.orderKind + " / " + state.best.nodeCount, COLORS.good],
      ["worst fixed order", state.worst.orderKind + " / " + state.worst.nodeCount, COLORS.bad],
      ["satisfying assignments", fmtBig(state.current.satCount), COLORS.purple],
      ["exact check", state.current.satCount === state.exactSat ? "passed" : "failed", state.current.satCount === state.exactSat ? COLORS.good : COLORS.bad]
    ];
    rows.forEach(function (row, index) {
      var yy = y + index * 34;
      fillText(ctx, row[0], x, yy, COLORS.muted, 12, 650);
      fillText(ctx, row[1], box.x + box.w - 18, yy, row[2], 13, 800, "right");
    });
    var tax = state.current.nodeCount / Math.max(1, state.best.nodeCount);
    roundRect(ctx, x, box.y + box.h - 62, box.w - 36, 40, 8);
    ctx.fillStyle = tax <= 1.05 ? COLORS.softGood : tax < 4 ? COLORS.softGold : COLORS.softBad;
    ctx.fill();
    fillText(ctx, "order tax: " + formatNumber(tax) + "x best shown order", x + 12, box.y + box.h - 50, tax <= 1.05 ? COLORS.good : tax < 4 ? COLORS.gold : COLORS.bad, 13, 820);
  }

  function boxesFor(setup) {
    var pad = 16;
    var gap = 14;
    if (setup.compact) {
      var w = setup.width - pad * 2;
      return [
        { x: pad, y: pad, w: w, h: 286 },
        { x: pad, y: 318, w: w, h: 248 },
        { x: pad, y: 582, w: w, h: 238 },
        { x: pad, y: 836, w: w, h: 268 }
      ];
    }
    var w2 = (setup.width - pad * 2 - gap) / 2;
    return [
      { x: pad, y: pad, w: w2, h: 352 },
      { x: pad + w2 + gap, y: pad, w: w2, h: 352 },
      { x: pad, y: 382, w: w2, h: 352 },
      { x: pad + w2 + gap, y: 382, w: w2, h: 352 }
    ];
  }

  function draw(root, state) {
    var canvas = root.querySelector("canvas[data-canvas]");
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, setup.width, setup.height);
    var boxes = boxesFor(setup);
    drawWidths(ctx, state, boxes[0]);
    drawCurve(ctx, state, boxes[1]);
    drawMatrix(ctx, state, boxes[2]);
    drawLedger(ctx, state, boxes[3]);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function updateControls(root, state) {
    var values = {
      bits: String(state.params.bits),
      fn: FUNCTIONS[state.params.fn].label,
      order: ORDERS[state.params.order]
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      input.value = String(state.params[key]);
    });
  }

  function render(root) {
    var state = evaluate(paramsFromRoot(root));
    updateControls(root, state);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var tax = state.current.nodeCount / Math.max(1, state.best.nodeCount);
      metrics.innerHTML = [
        metric("function", FUNCTIONS[state.params.fn].label),
        metric("bits", String(state.params.bits)),
        metric("order", ORDERS[state.params.order]),
        metric("ROBDD nodes", String(state.current.nodeCount), tax > 4 ? "bad" : "good"),
        metric("satisfying assignments", fmtBig(state.current.satCount)),
        metric("order tax", formatNumber(tax) + "x", tax > 4 ? "bad" : tax > 1.05 ? "warn" : "good")
      ].join("");
    }
    draw(root, state);
    root.__bddOrderState = state;
  }

  function init(root) {
    if (!root || root.__bddOrderReady) return;
    root.__bddOrderReady = true;
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
    render(root);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function audit() {
    var eqPaired = buildFunction(6, "eq", "paired");
    var eqGrouped = buildFunction(6, "eq", "grouped");
    var eqYfirst = buildFunction(6, "eq", "yfirst");
    var eqState = evaluate({ bits: 6, fn: "eq", order: "grouped" });
    var pairOr = evaluate({ bits: 6, fn: "pairOr", order: "paired" });
    var pairOrGrouped = evaluate({ bits: 6, fn: "pairOr", order: "grouped" });
    assert(eqPaired.satCount === exactSat(6, "eq"), "equality sat count should be 2^n");
    assert(eqGrouped.satCount === exactSat(6, "eq"), "grouped equality sat count should match");
    assert(eqPaired.nodeCount < eqGrouped.nodeCount, "paired equality order should be smaller than grouped");
    assert(eqYfirst.nodeCount === eqPaired.nodeCount, "swapping each pair should preserve equality size");
    assert(eqGrouped.nodeCount >= eqPaired.nodeCount * 4, "grouped equality should show an exponential tax by six bits");
    assert(pairOr.current.satCount === exactSat(6, "pairOr"), "pairwise-hit sat count should match complement formula");
    assert(pairOrGrouped.current.satCount === exactSat(6, "pairOr"), "grouped pairwise-hit sat count should match");
    assert(pairOrGrouped.current.nodeCount > pairOr.current.nodeCount, "grouped pairwise-hit should be larger than paired");
    assert(eqState.fullTree > BigInt(eqGrouped.nodeCount), "reduced diagram should be smaller than full tree");
    return {
      eqGroupedNodes: eqGrouped.nodeCount,
      eqPairedNodes: eqPaired.nodeCount,
      ok: true,
      pairOrGroupedNodes: pairOrGrouped.current.nodeCount,
      pairOrPairedNodes: pairOr.current.nodeCount
    };
  }

  var api = {
    FUNCTIONS: FUNCTIONS,
    ORDERS: ORDERS,
    audit: audit,
    buildFunction: buildFunction,
    cleanParams: cleanParams,
    evaluate: evaluate,
    exactSat: exactSat,
    makeManager: makeManager,
    orderNames: orderNames
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.BDDOrderLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-bdd-order-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
