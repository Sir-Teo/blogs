(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    page: "#ffffff",
    leaf: "#e0f2fe",
    internal: "#ede9fe",
    path: "#b45309",
    split: "#be123c",
    dirty: "#2563eb",
    fill: "#0f766e",
    newPage: "#7c3aed",
    white: "#ffffff"
  };

  var PATTERNS = {
    append: "append-only",
    reverse: "reverse append",
    shuffle: "seeded shuffle",
    alternating: "outside-in"
  };

  var DEFAULTS = {
    count: 42,
    maxKeys: 5,
    pattern: "append",
    seed: 17,
    step: 42
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var maxKeys = Math.round(finite(Number(raw.maxKeys), DEFAULTS.maxKeys));
    if (maxKeys % 2 === 0) maxKeys += 1;
    maxKeys = clamp(maxKeys, 3, 9);
    var count = clamp(Math.round(finite(Number(raw.count), DEFAULTS.count)), 8, 96);
    var seed = clamp(Math.round(finite(Number(raw.seed), DEFAULTS.seed)), 1, 99);
    return {
      count: count,
      maxKeys: maxKeys,
      minKeys: Math.floor(maxKeys / 2),
      pattern: PATTERNS[raw.pattern] ? raw.pattern : DEFAULTS.pattern,
      seed: seed,
      step: clamp(Math.round(finite(Number(raw.step), count)), 0, count)
    };
  }

  function lcg(seed) {
    var state = seed >>> 0;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function range(n) {
    var out = [];
    for (var i = 1; i <= n; i += 1) out.push(i);
    return out;
  }

  function makeSequence(count, pattern, seed) {
    var values = range(count);
    if (pattern === "reverse") return values.reverse();
    if (pattern === "alternating") {
      var out = [];
      var lo = 1;
      var hi = count;
      while (lo <= hi) {
        out.push(lo);
        if (lo !== hi) out.push(hi);
        lo += 1;
        hi -= 1;
      }
      return out;
    }
    if (pattern === "shuffle") {
      var random = lcg(seed);
      for (var i = values.length - 1; i > 0; i -= 1) {
        var j = Math.floor(random() * (i + 1));
        var tmp = values[i];
        values[i] = values[j];
        values[j] = tmp;
      }
      return values;
    }
    return values;
  }

  function lowerBound(values, key) {
    var lo = 0;
    var hi = values.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (values[mid] < key) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function childIndex(keys, key) {
    var i = 0;
    while (i < keys.length && key >= keys[i]) i += 1;
    return i;
  }

  function BPlusTree(maxKeys) {
    this.maxKeys = maxKeys;
    this.nextId = 1;
    this.root = this.makeNode(true);
    this.totalSplits = 0;
    this.leafSplits = 0;
    this.internalSplits = 0;
    this.rootSplits = 0;
    this.totalPageWrites = 0;
  }

  BPlusTree.prototype.makeNode = function (leaf) {
    return {
      children: [],
      id: this.nextId++,
      keys: [],
      leaf: leaf,
      next: null,
      parent: null
    };
  };

  BPlusTree.prototype.searchPath = function (key) {
    var node = this.root;
    var path = [node];
    while (!node.leaf) {
      node = node.children[childIndex(node.keys, key)];
      path.push(node);
    }
    return path;
  };

  BPlusTree.prototype.insert = function (key) {
    var event = {
      dirty: {},
      inserted: key,
      newPages: {},
      promoted: [],
      rootSplit: false,
      splitPages: {},
      splits: 0,
      writePages: 0
    };
    var path = this.searchPath(key);
    var leaf = path[path.length - 1];
    var position = lowerBound(leaf.keys, key);
    if (leaf.keys[position] === key) {
      event.duplicate = true;
      event.path = path.map(function (node) { return node.id; });
      return event;
    }
    leaf.keys.splice(position, 0, key);
    event.dirty[leaf.id] = true;
    if (leaf.keys.length > this.maxKeys) this.splitLeaf(leaf, event);
    event.path = this.searchPath(key).map(function (node) { return node.id; });
    event.writePages = Object.keys(event.dirty).length;
    this.totalPageWrites += event.writePages;
    return event;
  };

  BPlusTree.prototype.splitLeaf = function (leaf, event) {
    var right = this.makeNode(true);
    var mid = Math.ceil(leaf.keys.length / 2);
    right.keys = leaf.keys.splice(mid);
    right.next = leaf.next;
    leaf.next = right;
    right.parent = leaf.parent;
    event.newPages[right.id] = true;
    event.splitPages[leaf.id] = true;
    event.splitPages[right.id] = true;
    event.dirty[leaf.id] = true;
    event.dirty[right.id] = true;
    event.promoted.push(right.keys[0]);
    event.splits += 1;
    this.totalSplits += 1;
    this.leafSplits += 1;
    this.insertIntoParent(leaf, right.keys[0], right, event);
  };

  BPlusTree.prototype.splitInternal = function (node, event) {
    var right = this.makeNode(false);
    var mid = Math.floor(node.keys.length / 2);
    var separator = node.keys[mid];
    right.keys = node.keys.slice(mid + 1);
    right.children = node.children.slice(mid + 1);
    right.children.forEach(function (child) { child.parent = right; });
    node.keys = node.keys.slice(0, mid);
    node.children = node.children.slice(0, mid + 1);
    right.parent = node.parent;
    event.newPages[right.id] = true;
    event.splitPages[node.id] = true;
    event.splitPages[right.id] = true;
    event.dirty[node.id] = true;
    event.dirty[right.id] = true;
    event.promoted.push(separator);
    event.splits += 1;
    this.totalSplits += 1;
    this.internalSplits += 1;
    this.insertIntoParent(node, separator, right, event);
  };

  BPlusTree.prototype.insertIntoParent = function (left, separator, right, event) {
    var parent = left.parent;
    if (!parent) {
      var root = this.makeNode(false);
      root.keys = [separator];
      root.children = [left, right];
      left.parent = root;
      right.parent = root;
      this.root = root;
      event.newPages[root.id] = true;
      event.dirty[root.id] = true;
      event.rootSplit = true;
      this.rootSplits += 1;
      return;
    }
    var index = parent.children.indexOf(left);
    parent.keys.splice(index, 0, separator);
    parent.children.splice(index + 1, 0, right);
    right.parent = parent;
    event.dirty[parent.id] = true;
    if (parent.keys.length > this.maxKeys) this.splitInternal(parent, event);
  };

  function traverse(root, visit, depth) {
    depth = depth || 0;
    visit(root, depth);
    root.children.forEach(function (child) { traverse(child, visit, depth + 1); });
  }

  function collectLeaves(root) {
    var leaves = [];
    var node = root;
    while (!node.leaf) node = node.children[0];
    while (node) {
      leaves.push(node);
      node = node.next;
    }
    return leaves;
  }

  function minKey(node) {
    var current = node;
    while (!current.leaf) current = current.children[0];
    return current.keys[0];
  }

  function serializeTree(tree, event, step, insertedCount) {
    var levels = [];
    var pages = [];
    traverse(tree.root, function (node, depth) {
      if (!levels[depth]) levels[depth] = [];
      var copy = {
        childIds: node.children.map(function (child) { return child.id; }),
        depth: depth,
        id: node.id,
        keys: node.keys.slice(),
        leaf: node.leaf,
        next: node.next ? node.next.id : null,
        parent: node.parent ? node.parent.id : null
      };
      levels[depth].push(copy);
      pages.push(copy);
    });
    var leaves = collectLeaves(tree.root).map(function (node) {
      return { id: node.id, keys: node.keys.slice() };
    });
    var totalKeys = leaves.reduce(function (sum, leaf) { return sum + leaf.keys.length; }, 0);
    var leafFills = leaves.map(function (leaf) { return leaf.keys.length / tree.maxKeys; });
    var fill = leafFills.length ? leafFills.reduce(function (a, b) { return a + b; }, 0) / leafFills.length : 0;
    return {
      event: event || {
        dirty: {},
        inserted: null,
        newPages: {},
        promoted: [],
        rootSplit: false,
        splitPages: {},
        splits: 0,
        writePages: 0
      },
      height: levels.length,
      insertedCount: insertedCount,
      leafFill: fill,
      leafFills: leafFills,
      leafPages: leaves.length,
      leaves: leaves,
      levels: levels,
      pages: pages,
      root: tree.root.id,
      step: step,
      totalKeys: totalKeys,
      totals: {
        internalSplits: tree.internalSplits,
        leafSplits: tree.leafSplits,
        pages: pages.length,
        rootSplits: tree.rootSplits,
        splits: tree.totalSplits,
        writePages: tree.totalPageWrites
      }
    };
  }

  function buildExperiment(raw) {
    var params = cleanParams(raw);
    var sequence = makeSequence(params.count, params.pattern, params.seed);
    var tree = new BPlusTree(params.maxKeys);
    var states = [serializeTree(tree, null, 0, 0)];
    for (var i = 0; i < sequence.length; i += 1) {
      var event = tree.insert(sequence[i]);
      states.push(serializeTree(tree, event, i + 1, i + 1));
    }
    params.step = clamp(params.step, 0, states.length - 1);
    var finalState = states[states.length - 1];
    var summary = {
      avgLeafFill: finalState.leafFill,
      avgPageWrites: finalState.totals.writePages / Math.max(1, params.count),
      height: finalState.height,
      leafPages: finalState.leafPages,
      pages: finalState.totals.pages,
      rootSplits: finalState.totals.rootSplits,
      splits: finalState.totals.splits,
      writePages: finalState.totals.writePages
    };
    return {
      params: params,
      sequence: sequence,
      states: states,
      summary: summary,
      tree: tree
    };
  }

  function isSorted(values) {
    for (var i = 1; i < values.length; i += 1) {
      if (values[i - 1] >= values[i]) return false;
    }
    return true;
  }

  function pageById(state) {
    var out = {};
    state.pages.forEach(function (page) { out[page.id] = page; });
    return out;
  }

  function routeInSnapshot(state, key) {
    var byId = pageById(state);
    var page = byId[state.root];
    while (page && !page.leaf) {
      page = byId[page.childIds[childIndex(page.keys, key)]];
    }
    return page;
  }

  function auditExperiment(result) {
    var finalState = result.states[result.states.length - 1];
    var byId = pageById(finalState);
    var minKeys = result.params.minKeys;
    var maxKeys = result.params.maxKeys;
    var sortedPages = finalState.pages.every(function (page) { return isSorted(page.keys); });
    var occupancy = finalState.pages.every(function (page) {
      if (page.id === finalState.root) return page.keys.length <= maxKeys;
      return page.keys.length >= minKeys && page.keys.length <= maxKeys;
    });
    var internalShape = finalState.pages.every(function (page) {
      return page.leaf ? page.childIds.length === 0 : page.childIds.length === page.keys.length + 1;
    });
    var separatorShape = finalState.pages.every(function (page) {
      if (page.leaf) return true;
      for (var i = 0; i < page.keys.length; i += 1) {
        var child = byId[page.childIds[i + 1]];
        if (page.keys[i] !== minKeyFromSnapshot(child, byId)) return false;
      }
      return true;
    });
    var leafDepths = finalState.pages.filter(function (page) { return page.leaf; }).map(function (page) { return page.depth; });
    var balanced = leafDepths.every(function (depth) { return depth === leafDepths[0]; });
    var leafKeys = [];
    finalState.leaves.forEach(function (leaf) { leafKeys = leafKeys.concat(leaf.keys); });
    var expected = result.sequence.slice().sort(function (a, b) { return a - b; });
    var leavesSorted = JSON.stringify(leafKeys) === JSON.stringify(expected);
    var routesOk = result.sequence.every(function (key) {
      var leaf = routeInSnapshot(finalState, key);
      return leaf && leaf.keys.indexOf(key) >= 0;
    });
    var stateCounts = result.states.every(function (state) { return state.insertedCount === state.totalKeys; });
    var splitAccounting = finalState.totals.splits === finalState.totals.leafSplits + finalState.totals.internalSplits;
    var finiteMetrics = Number.isFinite(result.summary.avgLeafFill) && Number.isFinite(result.summary.avgPageWrites);
    return {
      balanced: balanced,
      finiteMetrics: finiteMetrics,
      internalShape: internalShape,
      leavesSorted: leavesSorted,
      occupancy: occupancy,
      passed: balanced && finiteMetrics && internalShape && leavesSorted && occupancy && routesOk && separatorShape && sortedPages && splitAccounting && stateCounts,
      routesOk: routesOk,
      separatorShape: separatorShape,
      sortedPages: sortedPages,
      splitAccounting: splitAccounting,
      stateCounts: stateCounts
    };
  }

  function minKeyFromSnapshot(page, byId) {
    var current = page;
    while (current && !current.leaf) current = byId[current.childIds[0]];
    return current && current.keys[0];
  }

  function evaluate(raw) {
    var result = buildExperiment(raw);
    result.audit = auditExperiment(result);
    return result;
  }

  function auditBtreeSplitLab() {
    var total = 0;
    var passed = 0;
    ["append", "reverse", "shuffle", "alternating"].forEach(function (pattern) {
      [3, 5, 7, 9].forEach(function (maxKeys) {
        [12, 31, 64].forEach(function (count) {
          [3, 17].forEach(function (seed) {
            total += 1;
            var result = evaluate({ count: count, maxKeys: maxKeys, pattern: pattern, seed: seed, step: count });
            if (result.audit.passed) passed += 1;
          });
        });
      });
    });
    return { passed: passed, total: total };
  }

  function formatPercent(value) {
    return (value * 100).toFixed(1) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="btree-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 900);
    var height = width < 620 ? 820 : 720;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || 600) + " " + (opts.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "top";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 12, { size: 13, weight: 800 });
    text(ctx, subtitle, box.x + 14, box.y + 31, { color: COLORS.muted, size: 11, weight: 550 });
  }

  function drawPage(ctx, page, x, y, w, h, flags) {
    flags = flags || {};
    ctx.fillStyle = page.leaf ? COLORS.leaf : COLORS.internal;
    ctx.strokeStyle = flags.split ? COLORS.split : (flags.dirty ? COLORS.dirty : COLORS.rule);
    ctx.lineWidth = flags.split || flags.dirty ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 7);
    ctx.fill();
    ctx.stroke();
    if (flags.path) {
      ctx.strokeStyle = COLORS.path;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 5);
      ctx.stroke();
    }
    if (flags.newPage) {
      ctx.fillStyle = COLORS.newPage;
      ctx.beginPath();
      ctx.arc(x + w - 9, y + 9, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, (page.leaf ? "L" : "I") + page.id, x + 8, y + 7, { color: COLORS.muted, size: 10, weight: 800 });
    var keyText = page.keys.join("  ");
    text(ctx, keyText || "empty", x + w / 2, y + h / 2 - 7, { align: "center", size: keyText.length > 18 ? 10 : 12, weight: 800 });
  }

  function drawTree(ctx, box, result, state) {
    panel(ctx, box, "page tree", "B+ tree pages; orange is the last search path, blue pages were rewritten");
    var pagePositions = {};
    var top = box.y + 62;
    var levelGap = Math.min(88, (box.h - 104) / Math.max(1, state.levels.length));
    state.levels.forEach(function (level, depth) {
      var count = level.length;
      var pageW = clamp((box.w - 36 - (count - 1) * 10) / Math.max(1, count), 48, 88);
      var pageH = 46;
      var totalW = count * pageW + (count - 1) * 10;
      var startX = box.x + (box.w - totalW) / 2;
      var y = top + depth * levelGap;
      level.forEach(function (page, i) {
        var x = startX + i * (pageW + 10);
        pagePositions[page.id] = { x: x, y: y, w: pageW, h: pageH, cx: x + pageW / 2, cy: y + pageH / 2 };
      });
    });
    state.pages.forEach(function (page) {
      page.childIds.forEach(function (childId) {
        var from = pagePositions[page.id];
        var to = pagePositions[childId];
        if (!from || !to) return;
        ctx.strokeStyle = COLORS.rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(from.cx, from.y + from.h);
        ctx.lineTo(to.cx, to.y);
        ctx.stroke();
      });
    });
    var event = state.event;
    var path = {};
    (event.path || []).forEach(function (id) { path[id] = true; });
    state.pages.forEach(function (page) {
      var pos = pagePositions[page.id];
      drawPage(ctx, page, pos.x, pos.y, pos.w, pos.h, {
        dirty: event.dirty[page.id],
        newPage: event.newPages[page.id],
        path: path[page.id],
        split: event.splitPages[page.id]
      });
    });
    var note = state.step === 0 ? "empty root page" : "insert " + event.inserted + ": " + (event.splits ? event.splits + " split(s)" : "no split") + ", " + event.writePages + " page write(s)";
    text(ctx, note, box.x + 14, box.y + box.h - 24, { color: event.splits ? COLORS.split : COLORS.muted, size: 11, weight: 750 });
  }

  function drawLeafFill(ctx, box, result, state) {
    panel(ctx, box, "leaf fill", "sorted leaf chain and page occupancy");
    var left = box.x + 18;
    var top = box.y + 64;
    var w = box.w - 36;
    var h = 24;
    var gap = 4;
    var barW = (w - gap * Math.max(0, state.leaves.length - 1)) / Math.max(1, state.leaves.length);
    state.leaves.forEach(function (leaf, i) {
      var x = left + i * (barW + gap);
      var ratio = leaf.keys.length / result.params.maxKeys;
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(x, top, barW, h);
      ctx.fillStyle = COLORS.fill;
      ctx.fillRect(x, top + h * (1 - ratio), barW, h * ratio);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(x, top, barW, h);
      if (barW > 26) text(ctx, String(leaf.id), x + barW / 2, top + h + 6, { align: "center", color: COLORS.muted, size: 9, weight: 700 });
    });
    var ranges = state.leaves.slice(0, 4).map(function (leaf) {
      return leaf.keys[0] + "-" + leaf.keys[leaf.keys.length - 1];
    }).join("   ");
    if (state.leaves.length > 4) ranges += "   ...";
    text(ctx, "avg fill " + formatPercent(state.leafFill), left, top + 58, { size: 12, weight: 800, color: COLORS.fill });
    text(ctx, ranges || "no keys yet", left, top + 82, { size: 10, weight: 600, color: COLORS.muted });
  }

  function drawTimeline(ctx, box, result, state) {
    panel(ctx, box, "split ledger", "writes and splits per inserted key");
    var plot = { x: box.x + 34, y: box.y + 64, w: box.w - 54, h: box.h - 98 };
    var maxWrites = result.states.reduce(function (max, s) { return Math.max(max, s.event.writePages || 0); }, 1);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    result.states.slice(1).forEach(function (s, i) {
      var barW = Math.max(1, plot.w / result.params.count - 1);
      var x = plot.x + i / result.params.count * plot.w;
      var barH = (s.event.writePages / maxWrites) * plot.h;
      ctx.fillStyle = s.event.splits ? COLORS.split : COLORS.dirty;
      ctx.fillRect(x, plot.y + plot.h - barH, barW, barH);
      if (s.event.rootSplit) {
        ctx.fillStyle = COLORS.newPage;
        ctx.fillRect(x, plot.y, Math.max(2, barW), 8);
      }
      if (s.step === state.step) {
        ctx.strokeStyle = COLORS.path;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + barW / 2, plot.y - 6);
        ctx.lineTo(x + barW / 2, plot.y + plot.h + 6);
        ctx.stroke();
      }
    });
    text(ctx, "page writes", plot.x, box.y + box.h - 24, { color: COLORS.dirty, size: 10, weight: 800 });
    text(ctx, "red bars split", plot.x + plot.w, box.y + box.h - 24, { align: "right", color: COLORS.split, size: 10, weight: 800 });
  }

  function draw(result, state, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    if (width < 620) {
      drawTree(ctx, { x: 14, y: 14, w: width - 28, h: 410 }, result, state);
      drawLeafFill(ctx, { x: 14, y: 438, w: width - 28, h: 162 }, result, state);
      drawTimeline(ctx, { x: 14, y: 614, w: width - 28, h: height - 630 }, result, state);
    } else {
      drawTree(ctx, { x: 18, y: 18, w: width - 36, h: 430 }, result, state);
      drawLeafFill(ctx, { x: 18, y: 466, w: Math.round((width - 52) * 0.48), h: height - 484 }, result, state);
      drawTimeline(ctx, { x: Math.round((width - 52) * 0.48) + 34, y: 466, w: width - Math.round((width - 52) * 0.48) - 52, h: height - 484 }, result, state);
    }
  }

  function readControls(root) {
    var values = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      values[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(values);
  }

  function updateOutputs(root, result, state) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (out) {
      var key = out.getAttribute("data-value");
      if (key === "pattern") out.textContent = PATTERNS[result.params.pattern];
      if (key === "maxKeys") out.textContent = result.params.maxKeys;
      if (key === "count") out.textContent = result.params.count;
      if (key === "seed") out.textContent = result.params.seed;
      if (key === "step") out.textContent = state.step + " / " + result.params.count;
    });
    var stepInput = root.querySelector('[data-param="step"]');
    if (stepInput) {
      stepInput.max = String(result.params.count);
      if (Number(stepInput.value) > result.params.count) stepInput.value = String(result.params.count);
    }
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("height", String(state.height)),
        metric("pages", String(state.totals.pages)),
        metric("splits", String(state.totals.splits)),
        metric("avg leaf fill", formatPercent(state.leafFill)),
        metric("avg writes/insert", formatNumber(state.totals.writePages / Math.max(1, state.insertedCount), 2)),
        metric("audit", result.audit.passed ? "passes" : "fails")
      ].join("");
    }
  }

  function initOne(root) {
    if (!root || root.__btreeSplitReady) return;
    root.__btreeSplitReady = true;
    var canvas = root.querySelector("canvas");
    if (!canvas) return;
    var cachedKey = "";
    var cachedResult = null;
    var pending = false;

    function render() {
      pending = false;
      var params = readControls(root);
      var key = params.pattern + ":" + params.maxKeys + ":" + params.count + ":" + params.seed;
      if (key !== cachedKey) {
        cachedResult = evaluate(params);
        cachedKey = key;
      }
      var step = clamp(params.step, 0, cachedResult.states.length - 1);
      var state = cachedResult.states[step];
      root.__btreeSplitResult = cachedResult;
      updateOutputs(root, cachedResult, state);
      draw(cachedResult, state, canvas);
    }

    function schedule() {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(render);
    }

    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-btree-split-lab]")).forEach(initOne);
  }

  var api = {
    auditBtreeSplitLab: auditBtreeSplitLab,
    evaluate: evaluate,
    makeSequence: makeSequence
  };

  global.BtreeSplitLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
