(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    amber: "#b45309",
    green: "#0f766e",
    blue: "#2563eb",
    purple: "#7c3aed",
    rose: "#be123c",
    grid: "#edf2f7"
  };

  var DEFAULTS = {
    height: 10,
    blockSize: 8,
    key: 513
  };

  var LAYOUTS = [
    { id: "inorder", label: "inorder", color: COLORS.green },
    { id: "bfs", label: "BFS / heap order", color: COLORS.blue },
    { id: "dfs", label: "DFS preorder", color: COLORS.purple },
    { id: "veb", label: "van Emde Boas", color: COLORS.amber }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function nodeCount(height) {
    return Math.pow(2, height) - 1;
  }

  function normalize(raw) {
    raw = raw || {};
    var height = Math.round(clamp(finite(Number(raw.height), DEFAULTS.height), 4, 13));
    var n = nodeCount(height);
    return {
      height: height,
      blockSize: Math.round(clamp(finite(Number(raw.blockSize), DEFAULTS.blockSize), 1, 64)),
      key: Math.round(clamp(finite(Number(raw.key), DEFAULTS.key), 1, n))
    };
  }

  function makeNode(lo, hi, depth, bfsIndex) {
    if (lo > hi) return null;
    var key = Math.floor((lo + hi) / 2);
    var node = { key: key, depth: depth, bfsIndex: bfsIndex, left: null, right: null };
    node.left = makeNode(lo, key - 1, depth + 1, bfsIndex * 2 + 1);
    node.right = makeNode(key + 1, hi, depth + 1, bfsIndex * 2 + 2);
    return node;
  }

  function inorder(node, out) {
    if (!node) return out;
    inorder(node.left, out);
    out.push(node);
    inorder(node.right, out);
    return out;
  }

  function preorder(node, out) {
    if (!node) return out;
    out.push(node);
    preorder(node.left, out);
    preorder(node.right, out);
    return out;
  }

  function bfs(node) {
    var out = [];
    var queue = node ? [node] : [];
    for (var i = 0; i < queue.length; i += 1) {
      var current = queue[i];
      out.push(current);
      if (current.left) queue.push(current.left);
      if (current.right) queue.push(current.right);
    }
    return out;
  }

  function rootsAtDepth(node, depth, out) {
    if (!node) return out;
    if (depth === 0) {
      out.push(node);
      return out;
    }
    rootsAtDepth(node.left, depth - 1, out);
    rootsAtDepth(node.right, depth - 1, out);
    return out;
  }

  function veb(node, height) {
    if (!node || height <= 0) return [];
    if (height === 1) return [node];
    var topHeight = Math.ceil(height / 2);
    var bottomHeight = height - topHeight;
    var out = veb(node, topHeight);
    var roots = rootsAtDepth(node, topHeight, []);
    roots.forEach(function (root) {
      out = out.concat(veb(root, bottomHeight));
    });
    return out;
  }

  function indexLayout(order) {
    var byKey = {};
    var keys = [];
    order.forEach(function (node, address) {
      byKey[node.key] = {
        address: address,
        key: node.key,
        depth: node.depth,
        bfsIndex: node.bfsIndex
      };
      keys.push(node.key);
    });
    return { order: order, byKey: byKey, keys: keys };
  }

  function buildLayouts(root, height) {
    return {
      inorder: indexLayout(inorder(root, [])),
      bfs: indexLayout(bfs(root)),
      dfs: indexLayout(preorder(root, [])),
      veb: indexLayout(veb(root, height))
    };
  }

  function searchPath(root, key) {
    var path = [];
    var node = root;
    while (node) {
      path.push(node);
      if (key === node.key) break;
      node = key < node.key ? node.left : node.right;
    }
    return path;
  }

  function uniqueBlockCount(path, layout, blockSize) {
    var seen = {};
    path.forEach(function (node) {
      var address = layout.byKey[node.key].address;
      seen[Math.floor(address / blockSize)] = true;
    });
    return Object.keys(seen).length;
  }

  function selectedPath(path, layout, blockSize) {
    return path.map(function (node) {
      var address = layout.byKey[node.key].address;
      return {
        key: node.key,
        depth: node.depth,
        address: address,
        block: Math.floor(address / blockSize)
      };
    });
  }

  function summarizeLayout(root, n, layout, blockSize) {
    var sumBlocks = 0;
    var sumComparisons = 0;
    var worstBlocks = 0;
    var worstKey = 1;
    var hist = {};
    for (var key = 1; key <= n; key += 1) {
      var path = searchPath(root, key);
      var blocks = uniqueBlockCount(path, layout, blockSize);
      sumBlocks += blocks;
      sumComparisons += path.length;
      worstBlocks = Math.max(worstBlocks, blocks);
      if (blocks === worstBlocks) worstKey = key;
      hist[blocks] = (hist[blocks] || 0) + 1;
    }
    return {
      averageBlocks: sumBlocks / n,
      worstBlocks: worstBlocks,
      worstKey: worstKey,
      averageComparisons: sumComparisons / n,
      histogram: hist
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var n = nodeCount(params.height);
    var root = makeNode(1, n, 0, 0);
    var layouts = buildLayouts(root, params.height);
    var search = searchPath(root, params.key);
    var rows = LAYOUTS.map(function (meta) {
      var layout = layouts[meta.id];
      var summary = summarizeLayout(root, n, layout, params.blockSize);
      return {
        id: meta.id,
        label: meta.label,
        color: meta.color,
        averageBlocks: summary.averageBlocks,
        worstBlocks: summary.worstBlocks,
        worstKey: summary.worstKey,
        averageComparisons: summary.averageComparisons,
        selectedBlocks: uniqueBlockCount(search, layout, params.blockSize),
        selectedPath: selectedPath(search, layout, params.blockSize),
        histogram: summary.histogram
      };
    });
    var result = {
      params: params,
      n: n,
      root: root,
      layouts: layouts,
      searchPath: search.map(function (node) { return { key: node.key, depth: node.depth }; }),
      rows: rows,
      reference: {
        logBaseB: params.blockSize > 1 ? Math.log(n) / Math.log(params.blockSize) : params.height,
        comparisons: search.length
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
    var n = result.n;
    Object.keys(result.layouts).forEach(function (id) {
      var keys = result.layouts[id].keys.slice().sort(function (a, b) { return a - b; });
      check(id + " key count", keys.length === n);
      check(id + " first and last key", keys[0] === 1 && keys[keys.length - 1] === n);
      check(id + " unique keys", keys.every(function (key, index) { return key === index + 1; }));
    });
    check("search ends at query key", result.searchPath[result.searchPath.length - 1].key === result.params.key);
    check("search length bounded by height", result.searchPath.length <= result.params.height);
    result.rows.forEach(function (row) {
      check(row.id + " finite average", Number.isFinite(row.averageBlocks) && row.averageBlocks >= 1);
      check(row.id + " finite worst", Number.isFinite(row.worstBlocks) && row.worstBlocks >= row.averageBlocks);
      check(row.id + " selected path length", row.selectedPath.length === result.searchPath.length);
      check(row.id + " block accounting", row.selectedBlocks <= row.selectedPath.length);
    });
    var veb = result.rows.filter(function (row) { return row.id === "veb"; })[0];
    var inorderRow = result.rows.filter(function (row) { return row.id === "inorder"; })[0];
    if (result.params.height === DEFAULTS.height && result.params.blockSize === DEFAULTS.blockSize) {
      check("default vEB improves average over inorder", veb.averageBlocks < inorderRow.averageBlocks);
    }
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function auditGrid() {
    var cases = [
      { height: 8, blockSize: 4, key: 129 },
      { height: 10, blockSize: 8, key: 513 },
      { height: 11, blockSize: 16, key: 1025 },
      { height: 12, blockSize: 32, key: 3021 },
      { height: 13, blockSize: 8, key: 7777 }
    ].map(function (raw, index) {
      var result = evaluate(raw);
      var byLayout = {};
      result.rows.forEach(function (row) {
        byLayout[row.id] = row;
      });
      return {
        caseId: index + 1,
        height: result.params.height,
        n: result.n,
        blockSize: result.params.blockSize,
        key: result.params.key,
        comparisons: result.reference.comparisons,
        logBaseB: result.reference.logBaseB,
        inorderAverageBlocks: byLayout.inorder.averageBlocks,
        bfsAverageBlocks: byLayout.bfs.averageBlocks,
        dfsAverageBlocks: byLayout.dfs.averageBlocks,
        vebAverageBlocks: byLayout.veb.averageBlocks,
        vebWorstBlocks: byLayout.veb.worstBlocks,
        vebSelectedBlocks: byLayout.veb.selectedBlocks,
        passed: result.audit.passed,
        failedChecks: result.audit.checks.filter(function (row) { return !row.ok; }).map(function (row) { return row.name; })
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
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value, className) {
    return '<div class="cache-layout-lab__metric ' + (className || "") + '"><span>' +
      label + "</span><strong>" + value + "</strong></div>";
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = options.align || "left";
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
    text(ctx, title, box.x + 14, box.y + 18, { size: 12, weight: 800 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, { color: COLORS.muted, size: 10, weight: 600 });
  }

  function drawBars(ctx, result, box) {
    panel(ctx, box, "cold-cache search cost", "average unique memory blocks touched over every key");
    var plot = { x: box.x + 132, y: box.y + 66, w: box.w - 168, h: box.h - 108 };
    var max = Math.max.apply(null, result.rows.map(function (row) { return row.worstBlocks; }).concat([1]));
    result.rows.forEach(function (row, i) {
      var y = plot.y + i * 52;
      var avgW = row.averageBlocks / max * plot.w;
      var worstW = row.worstBlocks / max * plot.w;
      text(ctx, row.label, box.x + 18, y + 12, { color: COLORS.text, size: 11, weight: 750 });
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(plot.x, y, plot.w, 17);
      ctx.fillStyle = "rgba(23,32,38,0.18)";
      ctx.fillRect(plot.x, y, worstW, 17);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, avgW, 17);
      text(ctx, fmt(row.averageBlocks, 2) + " avg", plot.x + avgW + 7, y + 8, { color: row.color, size: 10, weight: 800 });
      text(ctx, row.worstBlocks + " worst", plot.x + worstW + 7, y + 27, { color: COLORS.muted, size: 10, weight: 650 });
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y - 6, plot.w, plot.h + 10);
    text(ctx, "log_B N = " + fmt(result.reference.logBaseB, 2), plot.x + plot.w, box.y + box.h - 24, { color: COLORS.muted, size: 10, weight: 700, align: "right" });
  }

  function drawSelectedPath(ctx, result, box) {
    panel(ctx, box, "selected search path", "points show addresses; same block means one transfer can cover several depths");
    var n = result.n;
    var plot = { x: box.x + 28, y: box.y + 74, w: box.w - 56, h: box.h - 112 };
    result.rows.forEach(function (row, rowIndex) {
      var y = plot.y + rowIndex * 74;
      text(ctx, row.label, plot.x, y - 22, { size: 11, weight: 800, color: row.color });
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      var previous = null;
      row.selectedPath.forEach(function (step, i) {
        var x = plot.x + (n === 1 ? 0 : step.address / (n - 1) * plot.w);
        var blockStart = Math.floor(step.address / result.params.blockSize) * result.params.blockSize;
        var blockEnd = Math.min(n - 1, blockStart + result.params.blockSize - 1);
        var bx = plot.x + blockStart / (n - 1) * plot.w;
        var bw = Math.max(3, (blockEnd - blockStart + 1) / n * plot.w);
        ctx.fillStyle = "rgba(180,83,9,0.16)";
        ctx.fillRect(bx, y - 9, bw, 18);
        if (previous) {
          ctx.strokeStyle = "rgba(23,32,38,0.3)";
          ctx.beginPath();
          ctx.moveTo(previous.x, previous.y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        ctx.fillStyle = row.color;
        ctx.beginPath();
        ctx.arc(x, y, i === row.selectedPath.length - 1 ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
        if (i === 0 || i === row.selectedPath.length - 1) {
          text(ctx, String(step.key), x, y + 20, { color: COLORS.text, size: 9, weight: 700, align: "center" });
        }
        previous = { x: x, y: y };
      });
      text(ctx, row.selectedBlocks + " blocks for key " + result.params.key, plot.x + plot.w, y - 22, { color: COLORS.muted, size: 10, weight: 700, align: "right" });
    });
    text(ctx, "address 0", plot.x, box.y + box.h - 23, { color: COLORS.muted, size: 10, weight: 650 });
    text(ctx, "address " + (n - 1), plot.x + plot.w, box.y + box.h - 23, { color: COLORS.muted, size: 10, weight: 650, align: "right" });
  }

  function drawHistograms(ctx, result, box) {
    panel(ctx, box, "whole-tree distribution", "how often a search pays each block count");
    var plot = { x: box.x + 34, y: box.y + 66, w: box.w - 58, h: box.h - 98 };
    var maxBlocks = Math.max.apply(null, result.rows.map(function (row) { return row.worstBlocks; }));
    var maxCount = 1;
    result.rows.forEach(function (row) {
      Object.keys(row.histogram).forEach(function (key) {
        maxCount = Math.max(maxCount, row.histogram[key]);
      });
    });
    var groupW = plot.w / maxBlocks;
    result.rows.forEach(function (row, rowIndex) {
      for (var blocks = 1; blocks <= maxBlocks; blocks += 1) {
        var count = row.histogram[blocks] || 0;
        var h = count / maxCount * plot.h;
        var w = Math.max(2, groupW / 5);
        var x = plot.x + (blocks - 1) * groupW + rowIndex * w + 2;
        ctx.fillStyle = row.color;
        ctx.globalAlpha = 0.78;
        ctx.fillRect(x, plot.y + plot.h - h, w, h);
        ctx.globalAlpha = 1;
      }
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    for (var tick = 1; tick <= maxBlocks; tick += 1) {
      text(ctx, String(tick), plot.x + (tick - 0.5) * groupW, plot.y + plot.h + 18, { color: COLORS.muted, size: 9, weight: 650, align: "center" });
    }
    text(ctx, "blocks touched", plot.x + plot.w / 2, box.y + box.h - 22, { color: COLORS.muted, size: 10, weight: 700, align: "center" });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    drawBars(ctx, result, { x: 14, y: 14, w: 430, h: 292 });
    drawHistograms(ctx, result, { x: 14, y: 320, w: 430, h: height - 334 });
    drawSelectedPath(ctx, result, { x: 458, y: 14, w: width - 472, h: height - 28 });
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
      if (key === "nodes") output.textContent = result.n;
      else output.textContent = result.params[key];
    });
    var keyInput = root.querySelector('[data-param="key"]');
    if (keyInput) {
      keyInput.max = result.n;
      if (Number(keyInput.value) > result.n) keyInput.value = String(result.n);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result);
    var metrics = root.querySelector("[data-metrics]");
    var vebRow = result.rows.filter(function (row) { return row.id === "veb"; })[0];
    var bfsRow = result.rows.filter(function (row) { return row.id === "bfs"; })[0];
    if (metrics) {
      metrics.innerHTML = [
        metric("nodes", result.n),
        metric("path comparisons", result.reference.comparisons),
        metric("vEB avg blocks", fmt(vebRow.averageBlocks, 2), "cache-layout-lab__metric--good"),
        metric("BFS avg blocks", fmt(bfsRow.averageBlocks, 2)),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "cache-layout-lab__metric--good" : "cache-layout-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "Height " + result.params.height + " tree, " + result.n + " nodes, " +
        result.params.blockSize + " nodes per block. The selected key touches " +
        vebRow.selectedBlocks + " vEB blocks and " + bfsRow.selectedBlocks + " BFS blocks.";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__cacheLayoutResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__cacheLayoutReady) return;
    root.__cacheLayoutReady = true;
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
        Array.prototype.slice.call(global.document.querySelectorAll("[data-cache-layout-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-cache-layout-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    normalize: normalize,
    makeNode: makeNode,
    buildLayouts: buildLayouts,
    searchPath: searchPath
  };

  global.CacheLayoutLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
