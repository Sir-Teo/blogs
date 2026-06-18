(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    splay: "#0f766e",
    balanced: "#2563eb",
    rotation: "#b45309",
    recent: "#7c3aed",
    miss: "#be123c",
    softGreen: "#ecfdf5",
    softBlue: "#eff6ff",
    softAmber: "#fffbeb"
  };

  var DEFAULTS = {
    keys: 63,
    accesses: 1200,
    hotSet: 8,
    scenario: "walk",
    seed: 31
  };

  var SCENARIOS = {
    hot: "stable hot set",
    phase: "phase shift",
    scan: "sequential scan",
    walk: "local walk",
    zipf: "Zipf-like"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return min;
    return clamp(Math.round(n), min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var keys = clampInt(raw.keys == null ? DEFAULTS.keys : raw.keys, 15, 255);
    var accesses = clampInt(raw.accesses == null ? DEFAULTS.accesses : raw.accesses, 120, 5000);
    var hotSet = clampInt(raw.hotSet == null ? DEFAULTS.hotSet : raw.hotSet, 2, Math.min(64, keys));
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    return {
      keys: keys,
      accesses: accesses,
      hotSet: hotSet,
      scenario: scenario,
      seed: clampInt(raw.seed == null ? DEFAULTS.seed : raw.seed, 1, 9999)
    };
  }

  function makeRng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNode(key) {
    return {
      key: key,
      left: null,
      right: null,
      parent: null
    };
  }

  function buildBalancedRange(lo, hi, parent, byKey) {
    if (lo > hi) return null;
    var mid = Math.floor((lo + hi) / 2);
    var node = makeNode(mid);
    node.parent = parent || null;
    byKey[mid] = node;
    node.left = buildBalancedRange(lo, mid - 1, node, byKey);
    node.right = buildBalancedRange(mid + 1, hi, node, byKey);
    return node;
  }

  function cloneBalancedTree(n) {
    var byKey = {};
    var root = buildBalancedRange(1, n, null, byKey);
    return { root: root, byKey: byKey };
  }

  function SplayTree(n) {
    var built = cloneBalancedTree(n);
    this.n = n;
    this.root = built.root;
    this.byKey = built.byKey;
    this.rotations = 0;
  }

  SplayTree.prototype.rotate = function (x) {
    var p = x.parent;
    if (!p) return;
    var g = p.parent;
    if (x === p.left) {
      p.left = x.right;
      if (x.right) x.right.parent = p;
      x.right = p;
    } else {
      p.right = x.left;
      if (x.left) x.left.parent = p;
      x.left = p;
    }
    p.parent = x;
    x.parent = g;
    if (!g) this.root = x;
    else if (g.left === p) g.left = x;
    else g.right = x;
    this.rotations += 1;
  };

  SplayTree.prototype.splay = function (x) {
    while (x && x.parent) {
      var p = x.parent;
      var g = p.parent;
      if (!g) {
        this.rotate(x);
      } else if ((x === p.left) === (p === g.left)) {
        this.rotate(p);
        this.rotate(x);
      } else {
        this.rotate(x);
        this.rotate(x);
      }
    }
    return x;
  };

  SplayTree.prototype.access = function (key) {
    var node = this.root;
    var comparisons = 0;
    var path = [];
    while (node) {
      comparisons += 1;
      path.push(node.key);
      if (key === node.key) break;
      node = key < node.key ? node.left : node.right;
    }
    var before = this.rotations;
    if (node) this.splay(node);
    var rotations = this.rotations - before;
    return {
      found: !!node,
      key: key,
      comparisons: comparisons,
      rotations: rotations,
      primitiveCost: comparisons + rotations,
      path: path,
      root: this.root ? this.root.key : null
    };
  };

  function balancedAccess(root, key) {
    var node = root;
    var comparisons = 0;
    var path = [];
    while (node) {
      comparisons += 1;
      path.push(node.key);
      if (key === node.key) break;
      node = key < node.key ? node.left : node.right;
    }
    return {
      found: !!node,
      comparisons: comparisons,
      path: path
    };
  }

  function hotSample(rng, start, hotSet, n) {
    return clamp(start + Math.floor(rng() * hotSet), 1, n);
  }

  function makeZipfCdf(n) {
    var cdf = [];
    var total = 0;
    for (var i = 1; i <= n; i += 1) {
      total += 1 / Math.pow(i, 1.08);
      cdf.push(total);
    }
    for (var j = 0; j < cdf.length; j += 1) cdf[j] /= total;
    return cdf;
  }

  function sampleCdf(cdf, rng) {
    var u = rng();
    var lo = 0;
    var hi = cdf.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (cdf[mid] >= u) hi = mid;
      else lo = mid + 1;
    }
    return lo + 1;
  }

  function generateTrace(params) {
    var rng = makeRng(params.seed);
    var trace = [];
    var n = params.keys;
    var h = Math.min(params.hotSet, n);
    var middle = Math.max(1, Math.floor((n - h) / 2) + 1);
    var high = Math.max(1, n - h + 1);
    var cdf = makeZipfCdf(n);
    var walk = Math.floor(n / 2);

    for (var i = 0; i < params.accesses; i += 1) {
      var key;
      if (params.scenario === "scan") {
        key = (i % n) + 1;
      } else if (params.scenario === "hot") {
        key = rng() < 0.82 ? hotSample(rng, middle, h, n) : 1 + Math.floor(rng() * n);
      } else if (params.scenario === "phase") {
        var start = i < params.accesses / 2 ? 1 : high;
        key = rng() < 0.84 ? hotSample(rng, start, h, n) : 1 + Math.floor(rng() * n);
      } else if (params.scenario === "walk") {
        var step = rng() < 0.74 ? Math.floor(rng() * 5) - 2 : Math.floor(rng() * 17) - 8;
        walk = clamp(walk + step, 1, n);
        key = walk;
      } else {
        key = sampleCdf(cdf, rng);
        if (rng() < 0.12) key = 1 + Math.floor(rng() * n);
      }
      trace.push(key);
    }
    return trace;
  }

  function workingSetDistance(lastSeen, key, index, n) {
    var previous = lastSeen[key] || 0;
    var count = 0;
    for (var i = 1; i <= n; i += 1) {
      if (lastSeen[i] && lastSeen[i] > previous) count += 1;
    }
    return previous ? count : count;
  }

  function movingAverage(values, windowSize) {
    var out = [];
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) {
      sum += values[i];
      if (i >= windowSize) sum -= values[i - windowSize];
      out.push(sum / Math.min(i + 1, windowSize));
    }
    return out;
  }

  function mean(values) {
    if (!values.length) return 0;
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) sum += values[i];
    return sum / values.length;
  }

  function quantile(sorted, p) {
    if (!sorted.length) return 0;
    var index = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1);
    return sorted[index];
  }

  function bucketWorkingSet(rows, n) {
    var buckets = [
      { id: "0", label: "same key", lo: 0, hi: 0, splay: [], balanced: [] },
      { id: "1-2", label: "1-2", lo: 1, hi: 2, splay: [], balanced: [] },
      { id: "3-7", label: "3-7", lo: 3, hi: 7, splay: [], balanced: [] },
      { id: "8-31", label: "8-31", lo: 8, hi: 31, splay: [], balanced: [] },
      { id: "32+", label: "32+", lo: 32, hi: n, splay: [], balanced: [] }
    ];
    rows.forEach(function (row) {
      var ws = row.workingSet;
      for (var i = 0; i < buckets.length; i += 1) {
        if (ws >= buckets[i].lo && ws <= buckets[i].hi) {
          buckets[i].splay.push(row.splayPrimitive);
          buckets[i].balanced.push(row.balancedComparisons);
          break;
        }
      }
    });
    return buckets.filter(function (bucket) {
      bucket.splayAvg = mean(bucket.splay);
      bucket.balancedAvg = mean(bucket.balanced);
      bucket.count = bucket.splay.length;
      return bucket.count > 0;
    });
  }

  function collectNodes(root, maxDepth) {
    var nodes = [];
    function visit(node, depth) {
      if (!node || depth > maxDepth) return;
      nodes.push({
        key: node.key,
        depth: depth,
        left: node.left ? node.left.key : null,
        right: node.right ? node.right.key : null
      });
      visit(node.left, depth + 1);
      visit(node.right, depth + 1);
    }
    visit(root, 0);
    return nodes;
  }

  function inorderKeys(root, out) {
    if (!root) return out;
    inorderKeys(root.left, out);
    out.push(root.key);
    inorderKeys(root.right, out);
    return out;
  }

  function parentPointersOk(root) {
    var ok = true;
    function visit(node, parent) {
      if (!node) return;
      if (node.parent !== parent) ok = false;
      visit(node.left, node);
      visit(node.right, node);
    }
    visit(root, null);
    return ok;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var trace = generateTrace(params);
    var splay = new SplayTree(params.keys);
    var balanced = cloneBalancedTree(params.keys);
    var lastSeen = {};
    var rows = [];
    var splayCosts = [];
    var balancedCosts = [];
    var rotationCosts = [];
    var searchCosts = [];
    var repeatedSameKeyCost = null;

    for (var i = 0; i < trace.length; i += 1) {
      var key = trace[i];
      var ws = workingSetDistance(lastSeen, key, i + 1, params.keys);
      var b = balancedAccess(balanced.root, key);
      var s = splay.access(key);
      lastSeen[key] = i + 1;
      splayCosts.push(s.primitiveCost);
      balancedCosts.push(b.comparisons);
      rotationCosts.push(s.rotations);
      searchCosts.push(s.comparisons);
      if (i > 0 && trace[i - 1] === key && repeatedSameKeyCost == null) {
        repeatedSameKeyCost = s.primitiveCost;
      }
      rows.push({
        index: i + 1,
        key: key,
        workingSet: ws,
        splayComparisons: s.comparisons,
        splayRotations: s.rotations,
        splayPrimitive: s.primitiveCost,
        balancedComparisons: b.comparisons,
        root: s.root,
        path: s.path
      });
    }

    var sortedSplay = splayCosts.slice().sort(function (a, b) { return a - b; });
    var sortedBalanced = balancedCosts.slice().sort(function (a, b) { return a - b; });
    var windowSize = clampInt(Math.floor(params.accesses / 60), 8, 80);
    var result = {
      params: params,
      scenarioLabel: SCENARIOS[params.scenario],
      trace: trace,
      rows: rows,
      finalTree: collectNodes(splay.root, 5),
      finalRoot: splay.root ? splay.root.key : null,
      lastPath: rows.length ? rows[rows.length - 1].path : [],
      series: {
        splay: splayCosts,
        balanced: balancedCosts,
        rotations: rotationCosts,
        search: searchCosts,
        splayMA: movingAverage(splayCosts, windowSize),
        balancedMA: movingAverage(balancedCosts, windowSize)
      },
      buckets: bucketWorkingSet(rows, params.keys),
      summary: {
        windowSize: windowSize,
        splayAveragePrimitive: mean(splayCosts),
        splayAverageSearch: mean(searchCosts),
        splayAverageRotations: mean(rotationCosts),
        balancedAverageSearch: mean(balancedCosts),
        splayP95: quantile(sortedSplay, 0.95),
        balancedP95: quantile(sortedBalanced, 0.95),
        repeatedSameKeyCost: repeatedSameKeyCost,
        totalRotations: splay.rotations
      },
      audit: null
    };
    result.audit = audit(result, splay);
    return result;
  }

  function audit(result, splay) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var keys = inorderKeys(splay.root, []);
    check("inorder key count", keys.length === result.params.keys);
    check("inorder sorted", keys.every(function (key, index) { return key === index + 1; }));
    check("root parent is null", !splay.root || splay.root.parent === null);
    check("parent pointers", parentPointersOk(splay.root));
    check("all accesses found", result.rows.every(function (row) { return row.path[row.path.length - 1] === row.key; }));
    check("accessed key becomes root", result.rows.every(function (row) { return row.root === row.key; }));
    check("finite averages", Number.isFinite(result.summary.splayAveragePrimitive) && Number.isFinite(result.summary.balancedAverageSearch));
    check("nonnegative rotations", result.rows.every(function (row) { return row.splayRotations >= 0; }));
    check("balanced comparison bound", result.rows.every(function (row) { return row.balancedComparisons <= Math.ceil(Math.log2(result.params.keys + 1)); }));
    var tiny = evaluateTinyRepeated();
    check("repeat access becomes root-cheap", tiny.second.comparisons === 1 && tiny.second.rotations === 0);
    if (result.params.scenario === "scan") {
      check("scan generated in order", result.trace.slice(0, Math.min(result.params.keys, result.trace.length)).every(function (key, index) {
        return key === index + 1;
      }));
    }
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function evaluateTinyRepeated() {
    var tree = new SplayTree(7);
    tree.access(6);
    var second = tree.access(6);
    return { second: second };
  }

  function auditGrid() {
    var cases = [
      { keys: 31, accesses: 300, hotSet: 5, scenario: "hot", seed: 7 },
      { keys: 63, accesses: 1200, hotSet: 8, scenario: "phase", seed: 31 },
      { keys: 63, accesses: 256, hotSet: 6, scenario: "scan", seed: 11 },
      { keys: 127, accesses: 1600, hotSet: 12, scenario: "walk", seed: 19 },
      { keys: 127, accesses: 2000, hotSet: 10, scenario: "zipf", seed: 23 }
    ].map(function (params, index) {
      var result = evaluate(params);
      return {
        caseId: index + 1,
        keys: result.params.keys,
        accesses: result.params.accesses,
        hotSet: result.params.hotSet,
        scenario: result.params.scenario,
        seed: result.params.seed,
        splayAveragePrimitive: result.summary.splayAveragePrimitive,
        splayAverageSearch: result.summary.splayAverageSearch,
        splayAverageRotations: result.summary.splayAverageRotations,
        balancedAverageSearch: result.summary.balancedAverageSearch,
        repeatedSameKeyCost: result.summary.repeatedSameKeyCost,
        totalRotations: result.summary.totalRotations,
        passed: result.audit.passed,
        checks: result.audit.checks.map(function (row) {
          return {
            name: row.name,
            ok: row.ok
          };
        }),
        passedChecks: result.audit.checks.filter(function (row) { return row.ok; }).length,
        totalChecks: result.audit.checks.length,
        failedChecks: result.audit.checks.filter(function (row) { return !row.ok; }).map(function (row) { return row.name; })
      };
    });
    var passedCases = cases.filter(function (row) { return row.passed; }).length;
    var passedChecks = cases.reduce(function (sum, row) {
      return sum + row.passedChecks;
    }, 0);
    var totalChecks = cases.reduce(function (sum, row) {
      return sum + row.totalChecks;
    }, 0);
    var errors = [];
    cases.forEach(function (row) {
      row.failedChecks.forEach(function (check) {
        errors.push("case " + row.caseId + ": " + check);
      });
    });
    return {
      ok: passedCases === cases.length && passedChecks === totalChecks,
      cases: cases,
      errors: errors,
      passed: passedCases,
      passedChecks: passedChecks,
      totalChecks: totalChecks,
      total: cases.length
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value, className) {
    return '<div class="splay-tree-lab__metric ' + (className || "") + '"><span>' +
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

  function drawLine(ctx, values, box, color, maxValue) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach(function (value, i) {
      var x = box.x + (values.length <= 1 ? 0 : i / (values.length - 1) * box.w);
      var y = box.y + box.h - value / maxValue * box.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawCostSeries(ctx, result, box) {
    panel(ctx, box, "trace cost", "moving average of comparisons plus rotations");
    var plot = { x: box.x + 44, y: box.y + 62, w: box.w - 70, h: box.h - 104 };
    var maxValue = Math.max.apply(null, result.series.splayMA.concat(result.series.balancedMA).concat([1]));
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + i / 4 * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      text(ctx, fmt(maxValue * (1 - i / 4), 1), plot.x - 8, y, { color: COLORS.muted, size: 9, weight: 650, align: "right" });
    }
    drawLine(ctx, result.series.splayMA, plot, COLORS.splay, maxValue);
    drawLine(ctx, result.series.balancedMA, plot, COLORS.balanced, maxValue);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    text(ctx, "splay", plot.x + 12, plot.y + 14, { color: COLORS.splay, size: 10, weight: 800 });
    text(ctx, "fixed balanced", plot.x + 70, plot.y + 14, { color: COLORS.balanced, size: 10, weight: 800 });
    text(ctx, "window " + result.summary.windowSize, plot.x + plot.w, box.y + box.h - 22, { color: COLORS.muted, size: 10, weight: 700, align: "right" });
  }

  function drawWorkingSet(ctx, result, box) {
    panel(ctx, box, "working-set trace", "x is distinct keys since previous access; y is splay primitive cost");
    var plot = { x: box.x + 44, y: box.y + 62, w: box.w - 70, h: box.h - 104 };
    var maxX = Math.log2(result.params.keys + 1);
    var maxY = Math.max.apply(null, result.series.splay.concat([1]));
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var x = plot.x + i / 4 * plot.w;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      text(ctx, fmt(Math.pow(2, maxX * i / 4) - 1, 0), x, plot.y + plot.h + 16, { color: COLORS.muted, size: 9, weight: 650, align: "center" });
    }
    result.rows.forEach(function (row, i) {
      if (result.rows.length > 1800 && i % 2) return;
      var xVal = Math.log2(row.workingSet + 1);
      var x = plot.x + xVal / maxX * plot.w;
      var y = plot.y + plot.h - row.splayPrimitive / maxY * plot.h;
      ctx.fillStyle = row.workingSet <= result.params.hotSet ? "rgba(124,58,237,0.38)" : "rgba(15,118,110,0.28)";
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    text(ctx, "distinct recent keys", plot.x + plot.w / 2, box.y + box.h - 22, { color: COLORS.muted, size: 10, weight: 700, align: "center" });
  }

  function nodePoint(node, plot, n) {
    return {
      x: plot.x + (node.key - 1) / Math.max(1, n - 1) * plot.w,
      y: plot.y + node.depth / 5 * plot.h
    };
  }

  function drawFinalTree(ctx, result, box) {
    panel(ctx, box, "final splay tree", "top six levels after the trace");
    var plot = { x: box.x + 24, y: box.y + 64, w: box.w - 48, h: box.h - 104 };
    var byKey = {};
    result.finalTree.forEach(function (node) { byKey[node.key] = node; });
    ctx.strokeStyle = "rgba(93,104,114,0.42)";
    ctx.lineWidth = 1;
    result.finalTree.forEach(function (node) {
      var a = nodePoint(node, plot, result.params.keys);
      [node.left, node.right].forEach(function (childKey) {
        if (!childKey || !byKey[childKey]) return;
        var b = nodePoint(byKey[childKey], plot, result.params.keys);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
    });
    result.finalTree.forEach(function (node) {
      var p = nodePoint(node, plot, result.params.keys);
      var inPath = result.lastPath.indexOf(node.key) >= 0;
      ctx.fillStyle = node.depth === 0 ? COLORS.splay : inPath ? COLORS.rotation : COLORS.white;
      ctx.strokeStyle = inPath ? COLORS.rotation : COLORS.rule;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, node.depth === 0 ? 10 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (node.depth <= 2) {
        text(ctx, String(node.key), p.x, p.y - 14, { color: node.depth === 0 ? COLORS.splay : COLORS.text, size: 9, weight: 800, align: "center" });
      }
    });
    text(ctx, "root " + result.finalRoot, plot.x, box.y + box.h - 23, { color: COLORS.splay, size: 10, weight: 800 });
    text(ctx, "last key " + result.trace[result.trace.length - 1], plot.x + plot.w, box.y + box.h - 23, { color: COLORS.rotation, size: 10, weight: 800, align: "right" });
  }

  function drawBuckets(ctx, result, box) {
    panel(ctx, box, "cost by recency", "bucketed by distinct keys since last access");
    var plot = { x: box.x + 34, y: box.y + 64, w: box.w - 60, h: box.h - 106 };
    var max = 1;
    result.buckets.forEach(function (bucket) {
      max = Math.max(max, bucket.splayAvg, bucket.balancedAvg);
    });
    var groupW = plot.w / result.buckets.length;
    result.buckets.forEach(function (bucket, i) {
      var x = plot.x + i * groupW + groupW * 0.18;
      var w = Math.max(8, groupW * 0.23);
      var sH = bucket.splayAvg / max * plot.h;
      var bH = bucket.balancedAvg / max * plot.h;
      ctx.fillStyle = COLORS.splay;
      ctx.fillRect(x, plot.y + plot.h - sH, w, sH);
      ctx.fillStyle = COLORS.balanced;
      ctx.fillRect(x + w + 3, plot.y + plot.h - bH, w, bH);
      text(ctx, bucket.label, x + w, plot.y + plot.h + 16, { color: COLORS.muted, size: 9, weight: 700, align: "center" });
      text(ctx, String(bucket.count), x + w, plot.y + plot.h - Math.max(sH, bH) - 10, { color: COLORS.muted, size: 9, weight: 650, align: "center" });
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    text(ctx, "splay", plot.x, box.y + box.h - 22, { color: COLORS.splay, size: 10, weight: 800 });
    text(ctx, "balanced", plot.x + 52, box.y + box.h - 22, { color: COLORS.balanced, size: 10, weight: 800 });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    drawCostSeries(ctx, result, { x: 14, y: 14, w: 444, h: 292 });
    drawWorkingSet(ctx, result, { x: 14, y: 320, w: 444, h: height - 334 });
    drawFinalTree(ctx, result, { x: 472, y: 14, w: width - 486, h: 292 });
    drawBuckets(ctx, result, { x: 472, y: 320, w: width - 486, h: height - 334 });
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
      output.textContent = result.params[key];
    });
    var hotInput = root.querySelector('[data-param="hotSet"]');
    if (hotInput) {
      hotInput.max = Math.min(64, result.params.keys);
      if (Number(hotInput.value) > Number(hotInput.max)) hotInput.value = hotInput.max;
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var advantage = result.summary.balancedAverageSearch - result.summary.splayAveragePrimitive;
      metrics.innerHTML = [
        metric("trace", result.scenarioLabel),
        metric("splay avg", fmt(result.summary.splayAveragePrimitive, 2), advantage >= 0 ? "splay-tree-lab__metric--good" : ""),
        metric("balanced avg", fmt(result.summary.balancedAverageSearch, 2)),
        metric("rotations/access", fmt(result.summary.splayAverageRotations, 2)),
        metric("root", result.finalRoot),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "splay-tree-lab__metric--good" : "splay-tree-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = result.scenarioLabel + " over " + result.params.keys + " keys and " +
        result.params.accesses + " accesses. Splay averages " +
        fmt(result.summary.splayAveragePrimitive, 2) + " primitive actions; the fixed balanced tree averages " +
        fmt(result.summary.balancedAverageSearch, 2) + " comparisons.";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__splayTreeResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__splayTreeReady) return;
    root.__splayTreeReady = true;
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
        Array.prototype.slice.call(global.document.querySelectorAll("[data-splay-tree-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-splay-tree-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    cleanParams: cleanParams,
    generateTrace: generateTrace,
    SplayTree: SplayTree,
    balancedAccess: balancedAccess
  };

  global.SplayTreeLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
