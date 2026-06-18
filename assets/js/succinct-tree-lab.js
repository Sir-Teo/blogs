(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    bitOne: "#2563eb",
    bitZero: "#94a3b8",
    focus: "#0f766e",
    parent: "#7c3aed",
    sibling: "#b45309",
    child: "#2563eb",
    warn: "#be123c",
    paleFocus: "rgba(15, 118, 110, 0.13)"
  };

  var DEFAULTS = {
    shape: "catalog",
    focus: 1,
    rankPos: 15
  };

  var SHAPES = {
    catalog: "catalog tree",
    chain: "deep tree",
    bushy: "bushy tree",
    trie: "tiny trie"
  };

  var SUPER_SIZE = 16;
  var BLOCK_SIZE = 4;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function ceilLog2(value) {
    return Math.max(1, Math.ceil(Math.log(Math.max(2, value)) / Math.log(2)));
  }

  function normalize(raw) {
    raw = raw || {};
    var shape = SHAPES[raw.shape] ? raw.shape : DEFAULTS.shape;
    var tree = makeTree(shape);
    var maxBits = tree.nodes.length * 2 - 1;
    return {
      shape: shape,
      focus: Math.round(clamp(finite(Number(raw.focus), DEFAULTS.focus), 0, tree.nodes.length - 1)),
      rankPos: Math.round(clamp(finite(Number(raw.rankPos), DEFAULTS.rankPos), 0, maxBits))
    };
  }

  function makeTree(shape) {
    var allShapes = {
      catalog: [
        ["root", [1, 5, 8]],
        ["src", [2, 3, 4]],
        ["lexer", []],
        ["parser", []],
        ["types", []],
        ["tests", [6, 7]],
        ["unit", []],
        ["golden", []],
        ["docs", [9, 10]],
        ["api", []],
        ["notes", []]
      ],
      chain: [
        ["root", [1, 8]],
        ["ingest", [2, 3]],
        ["parse", []],
        ["plan", [4]],
        ["execute", [5]],
        ["flush", [6, 7]],
        ["index", []],
        ["commit", []],
        ["metrics", [9, 10]],
        ["latency", []],
        ["errors", []]
      ],
      bushy: [
        ["root", [1, 2, 3, 4, 5]],
        ["a", [6, 7]],
        ["b", []],
        ["c", [8, 9, 10]],
        ["d", []],
        ["e", [11]],
        ["a1", []],
        ["a2", []],
        ["c1", []],
        ["c2", []],
        ["c3", []],
        ["e1", []]
      ],
      trie: [
        ["*", [1, 5, 8]],
        ["c", [2]],
        ["ca", [3, 4]],
        ["cat", []],
        ["car", []],
        ["d", [6]],
        ["do", [7]],
        ["dog", []],
        ["t", [9, 10]],
        ["to", []],
        ["tea", []]
      ]
    };
    var specs = allShapes[shape] || allShapes.catalog;
    return {
      nodes: specs.map(function (row, id) {
        return { id: id, label: row[0], children: row[1].slice() };
      })
    };
  }

  function encodeTree(tree) {
    var bits = [];
    var chars = [];
    var preorder = [];
    var openByNode = [];
    var closeByNode = [];
    var parentByNode = [];
    var depthByNode = [];
    var openToNode = {};

    function visit(id, parent, depth) {
      openByNode[id] = bits.length;
      openToNode[bits.length] = id;
      bits.push(1);
      chars.push("(");
      preorder.push(id);
      parentByNode[id] = parent;
      depthByNode[id] = depth;
      tree.nodes[id].children.forEach(function (child) {
        visit(child, id, depth + 1);
      });
      closeByNode[id] = bits.length;
      bits.push(0);
      chars.push(")");
    }

    visit(0, -1, 0);

    var excessBefore = [];
    var excessAfter = [];
    var minExcess = Infinity;
    var excess = 0;
    bits.forEach(function (bit, index) {
      excessBefore[index] = excess;
      excess += bit ? 1 : -1;
      excessAfter[index] = excess;
      minExcess = Math.min(minExcess, excess);
    });

    return {
      bits: bits,
      chars: chars,
      preorder: preorder,
      openByNode: openByNode,
      closeByNode: closeByNode,
      parentByNode: parentByNode,
      depthByNode: depthByNode,
      openToNode: openToNode,
      excessBefore: excessBefore,
      excessAfter: excessAfter,
      finalExcess: excess,
      minExcess: minExcess
    };
  }

  function rank1(bits, pos) {
    if (pos < 0) return 0;
    var end = Math.min(pos, bits.length - 1);
    var count = 0;
    for (var i = 0; i <= end; i += 1) count += bits[i] ? 1 : 0;
    return count;
  }

  function select1(bits, kth) {
    var seen = 0;
    for (var i = 0; i < bits.length; i += 1) {
      if (bits[i]) {
        if (seen === kth) return i;
        seen += 1;
      }
    }
    return -1;
  }

  function rankDirectory(bits) {
    var superRanks = [];
    var blockRanks = [];
    var count = 0;
    for (var i = 0; i < bits.length; i += BLOCK_SIZE) {
      if (i % SUPER_SIZE === 0) superRanks[Math.floor(i / SUPER_SIZE)] = count;
      var superStart = Math.floor(i / SUPER_SIZE) * SUPER_SIZE;
      blockRanks[Math.floor(i / BLOCK_SIZE)] = count - rank1(bits, superStart - 1);
      for (var j = i; j < Math.min(bits.length, i + BLOCK_SIZE); j += 1) count += bits[j] ? 1 : 0;
    }
    return {
      superSize: SUPER_SIZE,
      blockSize: BLOCK_SIZE,
      superRanks: superRanks,
      blockRanks: blockRanks
    };
  }

  function rank1WithDirectory(bits, directory, pos) {
    if (pos < 0) return 0;
    pos = Math.min(pos, bits.length - 1);
    var superIndex = Math.floor(pos / directory.superSize);
    var blockIndex = Math.floor(pos / directory.blockSize);
    var blockStart = blockIndex * directory.blockSize;
    var count = directory.superRanks[superIndex] + directory.blockRanks[blockIndex];
    for (var i = blockStart; i <= pos; i += 1) count += bits[i] ? 1 : 0;
    return count;
  }

  function explainRank(bits, directory, pos) {
    pos = clamp(pos, 0, bits.length - 1);
    var superIndex = Math.floor(pos / directory.superSize);
    var blockIndex = Math.floor(pos / directory.blockSize);
    var blockStart = blockIndex * directory.blockSize;
    var tail = 0;
    for (var i = blockStart; i <= pos; i += 1) tail += bits[i] ? 1 : 0;
    return {
      pos: pos,
      bit: bits[pos],
      superIndex: superIndex,
      blockIndex: blockIndex,
      blockStart: blockStart,
      superRank: directory.superRanks[superIndex],
      blockRank: directory.blockRanks[blockIndex],
      tail: tail,
      rank: directory.superRanks[superIndex] + directory.blockRanks[blockIndex] + tail
    };
  }

  function findClose(encoded, openPos) {
    var target = encoded.excessBefore[openPos];
    for (var i = openPos + 1; i < encoded.bits.length; i += 1) {
      if (encoded.excessAfter[i] === target) return i;
    }
    return -1;
  }

  function parentByScan(encoded, node) {
    var depth = encoded.depthByNode[node];
    if (depth === 0) return -1;
    var open = encoded.openByNode[node];
    for (var i = open - 1; i >= 0; i -= 1) {
      if (encoded.bits[i] && encoded.excessBefore[i] === depth - 1) return encoded.openToNode[i];
    }
    return -1;
  }

  function firstChildByScan(encoded, node) {
    var next = encoded.openByNode[node] + 1;
    return encoded.bits[next] ? encoded.openToNode[next] : -1;
  }

  function nextSiblingByScan(encoded, node) {
    var parent = parentByScan(encoded, node);
    if (parent < 0) return -1;
    var next = encoded.closeByNode[node] + 1;
    if (next >= encoded.closeByNode[parent]) return -1;
    return encoded.bits[next] ? encoded.openToNode[next] : -1;
  }

  function countLeaves(tree) {
    return tree.nodes.filter(function (node) { return node.children.length === 0; }).length;
  }

  function subtreeNodeCount(encoded, node) {
    return (encoded.closeByNode[node] - encoded.openByNode[node] + 1) / 2;
  }

  function log2Factorial(n) {
    var total = 0;
    for (var i = 2; i <= n; i += 1) total += Math.log(i) / Math.log(2);
    return total;
  }

  function log2Catalan(n) {
    return log2Factorial(2 * n) - 2 * log2Factorial(n) - Math.log(n + 1) / Math.log(2);
  }

  function labelOf(tree, id) {
    return id < 0 ? "none" : id + " " + tree.nodes[id].label;
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var tree = makeTree(params.shape);
    var encoded = encodeTree(tree);
    var directory = rankDirectory(encoded.bits);
    params.focus = clamp(params.focus, 0, tree.nodes.length - 1);
    params.rankPos = clamp(params.rankPos, 0, encoded.bits.length - 1);

    var focus = params.focus;
    var open = encoded.openByNode[focus];
    var close = findClose(encoded, open);
    var nav = {
      open: open,
      close: close,
      depth: encoded.depthByNode[focus],
      preorder: rank1(encoded.bits, open) - 1,
      parent: parentByScan(encoded, focus),
      firstChild: firstChildByScan(encoded, focus),
      nextSibling: nextSiblingByScan(encoded, focus),
      subtreeNodes: subtreeNodeCount(encoded, focus)
    };
    var rankExplain = explainRank(encoded.bits, directory, params.rankPos);
    var n = tree.nodes.length;
    var rankBits = ceilLog2(encoded.bits.length + 1);
    var directoryBits = directory.superRanks.length * rankBits + directory.blockRanks.length * ceilLog2(SUPER_SIZE + 1);
    var pointerBits = n * 3 * ceilLog2(n + 1);
    var result = {
      params: params,
      tree: tree,
      encoded: encoded,
      directory: directory,
      nav: nav,
      rankExplain: rankExplain,
      stats: {
        nodes: n,
        leaves: countLeaves(tree),
        topologyBits: encoded.bits.length,
        catalanLowerBound: log2Catalan(Math.max(0, n - 1)),
        directoryBits: directoryBits,
        pointerBits: pointerBits
      }
    };
    result.audit = audit(result);
    return result;
  }

  function audit(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var tree = result.tree;
    var encoded = result.encoded;
    var directory = result.directory;
    check("balanced parentheses finish at zero", encoded.finalExcess === 0 && encoded.minExcess >= 0);
    check("two bits per node", encoded.bits.length === tree.nodes.length * 2);
    check("rank directory matches direct rank", encoded.bits.every(function (_bit, pos) {
      return rank1WithDirectory(encoded.bits, directory, pos) === rank1(encoded.bits, pos);
    }));
    check("select(rank(open)) returns each open", encoded.preorder.every(function (node, order) {
      var pos = select1(encoded.bits, order);
      return pos === encoded.openByNode[node] && rank1(encoded.bits, pos) - 1 === order;
    }));
    check("matching closes recover DFS intervals", tree.nodes.every(function (node) {
      return findClose(encoded, encoded.openByNode[node.id]) === encoded.closeByNode[node.id] &&
        subtreeNodeCount(encoded, node.id) >= 1;
    }));
    check("scanned parents match source tree", tree.nodes.every(function (node) {
      return parentByScan(encoded, node.id) === encoded.parentByNode[node.id];
    }));
    check("first child navigation matches source tree", tree.nodes.every(function (node) {
      var expected = node.children.length ? node.children[0] : -1;
      return firstChildByScan(encoded, node.id) === expected;
    }));
    check("next sibling navigation matches source tree", tree.nodes.every(function (node) {
      var parent = encoded.parentByNode[node.id];
      if (parent < 0) return nextSiblingByScan(encoded, node.id) === -1;
      var siblings = tree.nodes[parent].children;
      var idx = siblings.indexOf(node.id);
      var expected = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : -1;
      return nextSiblingByScan(encoded, node.id) === expected;
    }));
    check("focus interval contains full subtree", result.nav.close === encoded.closeByNode[result.params.focus] &&
      result.nav.subtreeNodes === countSubtree(tree, result.params.focus));
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function countSubtree(tree, node) {
    var total = 1;
    tree.nodes[node].children.forEach(function (child) {
      total += countSubtree(tree, child);
    });
    return total;
  }

  function auditGrid() {
    var rows = [];
    Object.keys(SHAPES).forEach(function (shape) {
      var tree = makeTree(shape);
      for (var focus = 0; focus < tree.nodes.length; focus += 1) {
        [0, 3, tree.nodes.length, tree.nodes.length * 2 - 1].forEach(function (rankPos) {
          rows.push(evaluate({ shape: shape, focus: focus, rankPos: rankPos }));
        });
      }
    });
    return rows;
  }

  function fmt(value, digits) {
    return Number.isFinite(value) ? value.toFixed(digits == null ? 2 : digits) : "n/a";
  }

  function metric(label, value, className) {
    return '<div class="succinct-tree-lab__metric ' + (className || "") + '"><span>' +
      label + "</span><strong>" + value + "</strong></div>";
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(value, x, y);
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 18, { size: 12, weight: 800 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, { size: 10, color: COLORS.muted });
  }

  function layoutTree(tree) {
    var positions = [];
    var leaf = 0;
    var maxDepth = 0;
    function dfs(id, depth) {
      maxDepth = Math.max(maxDepth, depth);
      var children = tree.nodes[id].children;
      var x;
      if (!children.length) {
        x = leaf;
        leaf += 1;
      } else {
        children.forEach(function (child) { dfs(child, depth + 1); });
        x = 0.5 * (positions[children[0]].rawX + positions[children[children.length - 1]].rawX);
      }
      positions[id] = { rawX: x, depth: depth };
    }
    dfs(0, 0);
    positions.forEach(function (pos) {
      pos.x = leaf <= 1 ? 0.5 : (pos.rawX + 0.5) / leaf;
      pos.y = maxDepth === 0 ? 0.5 : pos.depth / maxDepth;
    });
    return { positions: positions, maxDepth: maxDepth, leaves: leaf };
  }

  function drawTree(ctx, result, box) {
    panel(ctx, box, "ordered tree", "the pointer shape before encoding");
    var plot = { x: box.x + 28, y: box.y + 62, w: box.w - 56, h: box.h - 94 };
    var tree = result.tree;
    var layout = layoutTree(tree);
    var focus = result.params.focus;
    var marked = {};
    marked[focus] = COLORS.focus;
    if (result.nav.parent >= 0) marked[result.nav.parent] = COLORS.parent;
    if (result.nav.firstChild >= 0) marked[result.nav.firstChild] = COLORS.child;
    if (result.nav.nextSibling >= 0) marked[result.nav.nextSibling] = COLORS.sibling;

    tree.nodes.forEach(function (node) {
      var a = layout.positions[node.id];
      node.children.forEach(function (child) {
        var b = layout.positions[child];
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(plot.x + a.x * plot.w, plot.y + a.y * plot.h);
        ctx.lineTo(plot.x + b.x * plot.w, plot.y + b.y * plot.h);
        ctx.stroke();
      });
    });

    tree.nodes.forEach(function (node) {
      var pos = layout.positions[node.id];
      var x = plot.x + pos.x * plot.w;
      var y = plot.y + pos.y * plot.h;
      ctx.fillStyle = marked[node.id] || COLORS.white;
      ctx.strokeStyle = marked[node.id] || COLORS.rule;
      ctx.lineWidth = node.id === focus ? 3 : 1.4;
      roundedRect(ctx, x - 26, y - 13, 52, 26, 7);
      ctx.fill();
      ctx.stroke();
      text(ctx, node.label, x, y - 1, {
        align: "center",
        color: marked[node.id] ? COLORS.white : COLORS.text,
        size: 10,
        weight: 800
      });
    });
    text(ctx, "green focus, violet parent, blue first child, amber next sibling", plot.x, box.y + box.h - 18, { color: COLORS.muted, size: 10 });
  }

  function drawTape(ctx, result, box) {
    panel(ctx, box, "balanced-parentheses tape", "1 = open, 0 = close; excess is the current stack height");
    var encoded = result.encoded;
    var plot = { x: box.x + 18, y: box.y + 66, w: box.w - 36, h: 150 };
    var cells = encoded.bits.length;
    var cols = Math.min(cells, 24);
    var cellW = Math.min(18, plot.w / cols - 1);
    var cellH = 26;
    var open = result.nav.open;
    var close = result.nav.close;
    for (var i = 0; i < cells; i += 1) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var x = plot.x + col * (cellW + 2);
      var y = plot.y + row * 44;
      var inSubtree = i >= open && i <= close;
      ctx.fillStyle = inSubtree ? COLORS.paleFocus : COLORS.white;
      ctx.strokeStyle = i === open || i === close || i === result.params.rankPos ? COLORS.focus : COLORS.rule;
      ctx.lineWidth = i === open || i === close || i === result.params.rankPos ? 2 : 1;
      roundedRect(ctx, x, y, cellW, cellH, 4);
      ctx.fill();
      ctx.stroke();
      text(ctx, encoded.chars[i], x + cellW / 2, y + 9, {
        align: "center",
        color: encoded.bits[i] ? COLORS.bitOne : COLORS.bitZero,
        size: 12,
        weight: 900
      });
      text(ctx, String(i), x + cellW / 2, y + 29, { align: "center", color: COLORS.muted, size: 8, weight: 650 });
    }

    var curve = { x: box.x + 32, y: box.y + 236, w: box.w - 64, h: box.h - 276 };
    var maxExcess = Math.max.apply(null, encoded.excessAfter.concat([1]));
    ctx.strokeStyle = "#e2e8f0";
    ctx.strokeRect(curve.x, curve.y, curve.w, curve.h);
    ctx.strokeStyle = COLORS.focus;
    ctx.lineWidth = 2;
    ctx.beginPath();
    encoded.excessAfter.forEach(function (value, index) {
      var x = curve.x + (index / Math.max(1, encoded.excessAfter.length - 1)) * curve.w;
      var y = curve.y + curve.h - value / maxExcess * curve.h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    text(ctx, "excess", curve.x, curve.y - 10, { color: COLORS.muted, size: 10 });
    text(ctx, "matching close is first return to prior excess", curve.x, box.y + box.h - 16, { color: COLORS.muted, size: 10 });
  }

  function drawDirectory(ctx, result, box) {
    panel(ctx, box, "rank directory", "visible two-level index for rank1(position)");
    var bits = result.encoded.bits;
    var dir = result.directory;
    var ex = result.rankExplain;
    var x = box.x + 22;
    var y = box.y + 68;
    var cellW = Math.min(16, (box.w - 44) / bits.length - 1);
    bits.forEach(function (bit, i) {
      var bx = x + i * (cellW + 1);
      ctx.fillStyle = i === ex.pos ? COLORS.focus : bit ? COLORS.bitOne : COLORS.bitZero;
      ctx.fillRect(bx, y, cellW, 24);
      if (i % SUPER_SIZE === 0) {
        ctx.strokeStyle = COLORS.warn;
        ctx.beginPath();
        ctx.moveTo(bx, y - 8);
        ctx.lineTo(bx, y + 32);
        ctx.stroke();
      } else if (i % BLOCK_SIZE === 0) {
        ctx.strokeStyle = "#cbd5e1";
        ctx.beginPath();
        ctx.moveTo(bx, y - 4);
        ctx.lineTo(bx, y + 28);
        ctx.stroke();
      }
    });
    text(ctx, "red ticks = superblocks, gray ticks = blocks", x, y + 50, { color: COLORS.muted, size: 10 });
    var rows = [
      ["position", String(ex.pos) + " (" + (ex.bit ? "open" : "close") + ")"],
      ["super rank", String(ex.superRank)],
      ["block rank", String(ex.blockRank)],
      ["tail count", String(ex.tail)],
      ["rank1", String(ex.rank)]
    ];
    rows.forEach(function (row, i) {
      var ry = y + 86 + i * 30;
      text(ctx, row[0], x, ry, { color: COLORS.muted, size: 10, weight: 720 });
      text(ctx, row[1], box.x + box.w - 28, ry, { align: "right", color: COLORS.text, size: 12, weight: 850 });
    });
    text(ctx, "rank1 = super + block + local scan", x, box.y + box.h - 18, { color: COLORS.focus, size: 10, weight: 800 });
  }

  function drawLedger(ctx, result, box) {
    panel(ctx, box, "navigation ledger", "operations recovered from the parenthesis string");
    var tree = result.tree;
    var rows = [
      ["focus", labelOf(tree, result.params.focus)],
      ["preorder", String(result.nav.preorder)],
      ["depth", String(result.nav.depth)],
      ["open / close", result.nav.open + " / " + result.nav.close],
      ["parent", labelOf(tree, result.nav.parent)],
      ["first child", labelOf(tree, result.nav.firstChild)],
      ["next sibling", labelOf(tree, result.nav.nextSibling)],
      ["subtree nodes", String(result.nav.subtreeNodes)],
      ["topology bits", String(result.stats.topologyBits)],
      ["Catalan floor", fmt(result.stats.catalanLowerBound, 1) + " bits"],
      ["visible directory", String(result.stats.directoryBits) + " bits"],
      ["audit", result.audit.passed ? "passed" : "check"]
    ];
    var x = box.x + 22;
    var y = box.y + 64;
    rows.forEach(function (row, i) {
      var ry = y + i * 24;
      text(ctx, row[0], x, ry, { color: COLORS.muted, size: 10, weight: 720 });
      text(ctx, row[1], box.x + box.w - 24, ry, {
        align: "right",
        color: i === rows.length - 1 ? (result.audit.passed ? COLORS.focus : COLORS.warn) : COLORS.text,
        size: 10,
        weight: 820
      });
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
    var half = Math.floor(w / 2);
    var topH = Math.floor(h * 0.50);
    drawTree(ctx, result, { x: gap, y: gap, w: half - 1.5 * gap, h: topH - 1.5 * gap });
    drawTape(ctx, result, { x: half + gap / 2, y: gap, w: w - half - 1.5 * gap, h: topH - 1.5 * gap });
    drawDirectory(ctx, result, { x: gap, y: topH + gap / 2, w: half - 1.5 * gap, h: h - topH - 1.5 * gap });
    drawLedger(ctx, result, { x: half + gap / 2, y: topH + gap / 2, w: w - half - 1.5 * gap, h: h - topH - 1.5 * gap });
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
      if (key === "shape") output.textContent = SHAPES[result.params.shape];
      else output.textContent = result.params[key];
    });
    var focus = root.querySelector('[data-param="focus"]');
    var rankPos = root.querySelector('[data-param="rankPos"]');
    if (focus) {
      focus.max = String(result.tree.nodes.length - 1);
      focus.value = String(result.params.focus);
    }
    if (rankPos) {
      rankPos.max = String(result.encoded.bits.length - 1);
      rankPos.value = String(result.params.rankPos);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("nodes", String(result.stats.nodes)),
        metric("topology", result.stats.topologyBits + " bits", "succinct-tree-lab__metric--good"),
        metric("rank1(pos)", String(result.rankExplain.rank)),
        metric("subtree", result.nav.subtreeNodes + " nodes"),
        metric("parent", labelOf(result.tree, result.nav.parent)),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "succinct-tree-lab__metric--good" : "succinct-tree-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = SHAPES[result.params.shape] + ": " + result.stats.nodes +
        " nodes encode to " + result.stats.topologyBits + " topology bits; the focused node's subtree occupies tape positions " +
        result.nav.open + ".." + result.nav.close + ".";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__succinctTreeResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__succinctTreeReady) return;
    root.__succinctTreeReady = true;
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
        Array.prototype.slice.call(global.document.querySelectorAll("[data-succinct-tree-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-succinct-tree-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    normalize: normalize,
    encodeTree: encodeTree,
    findClose: findClose,
    rank1: rank1,
    rank1WithDirectory: rank1WithDirectory,
    select1: select1
  };

  global.SuccinctTreeLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
