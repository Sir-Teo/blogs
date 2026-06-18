(function (global) {
  "use strict";

  var DEFAULTS = {
    items: 48,
    chainUnions: 20,
    randomUnions: 90,
    repeatedFinds: 120,
    seed: 111,
    focus: "rankCompression"
  };

  var METHODS = [
    { key: "plain", label: "plain linking", compression: false, rank: false, color: "#be123c" },
    { key: "compression", label: "compression only", compression: true, rank: false, color: "#b45309" },
    { key: "rank", label: "rank only", compression: false, rank: true, color: "#2563eb" },
    { key: "rankCompression", label: "rank + compression", compression: true, rank: true, color: "#0f766e" }
  ];

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    white: "#ffffff",
    good: "#0f766e",
    bad: "#be123c",
    amber: "#b45309",
    blue: "#2563eb",
    purple: "#6d28d9"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    var focus = METHODS.some(function (method) { return method.key === raw.focus; }) ? raw.focus : DEFAULTS.focus;
    return {
      items: clamp(Math.round(Number(raw.items == null ? DEFAULTS.items : raw.items)), 8, 96),
      chainUnions: clamp(Math.round(Number(raw.chainUnions == null ? DEFAULTS.chainUnions : raw.chainUnions)), 0, 120),
      randomUnions: clamp(Math.round(Number(raw.randomUnions == null ? DEFAULTS.randomUnions : raw.randomUnions)), 0, 180),
      repeatedFinds: clamp(Math.round(Number(raw.repeatedFinds == null ? DEFAULTS.repeatedFinds : raw.repeatedFinds)), 0, 240),
      seed: clamp(Math.round(Number(raw.seed == null ? DEFAULTS.seed : raw.seed)), 1, 9999),
      focus: focus
    };
  }

  function rng(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function makeDsu(n) {
    var parent = new Array(n);
    var rank = new Array(n);
    for (var i = 0; i < n; i += 1) {
      parent[i] = i;
      rank[i] = 0;
    }
    return { parent: parent, rank: rank, traversals: 0, writes: 0, finds: 0, unions: 0, redundant: 0 };
  }

  function rootPath(parent, x) {
    var path = [x];
    var guard = 0;
    while (parent[x] !== x && guard < parent.length + 2) {
      x = parent[x];
      path.push(x);
      guard += 1;
    }
    return path;
  }

  function find(dsu, x, compress) {
    var path = rootPath(dsu.parent, x);
    var root = path[path.length - 1];
    var traversals = path.length - 1;
    var writes = 0;
    if (compress) {
      for (var i = 0; i < path.length - 1; i += 1) {
        if (dsu.parent[path[i]] !== root) {
          dsu.parent[path[i]] = root;
          writes += 1;
        }
      }
    }
    dsu.traversals += traversals;
    dsu.writes += writes;
    dsu.finds += 1;
    return { root: root, path: path, traversals: traversals, writes: writes };
  }

  function union(dsu, a, b, method) {
    var ra = find(dsu, a, method.compression).root;
    var rb = find(dsu, b, method.compression).root;
    dsu.unions += 1;
    if (ra === rb) {
      dsu.redundant += 1;
      return false;
    }
    if (method.rank) {
      if (dsu.rank[ra] < dsu.rank[rb]) {
        dsu.parent[ra] = rb;
      } else if (dsu.rank[ra] > dsu.rank[rb]) {
        dsu.parent[rb] = ra;
      } else {
        dsu.parent[rb] = ra;
        dsu.rank[ra] += 1;
      }
    } else {
      dsu.parent[ra] = rb;
    }
    dsu.writes += 1;
    return true;
  }

  function oracleUnion(labels, a, b) {
    var from = labels[a];
    var to = labels[b];
    if (from === to) return;
    for (var i = 0; i < labels.length; i += 1) {
      if (labels[i] === from) labels[i] = to;
    }
  }

  function generateOps(params) {
    var rand = rng(params.seed);
    var ops = [];
    for (var i = 0; i < params.chainUnions; i += 1) {
      var a = i % Math.max(1, params.items - 1);
      ops.push({ type: "union", a: a, b: a + 1, mode: "chain" });
    }
    for (var j = 0; j < params.randomUnions; j += 1) {
      var u = Math.floor(rand() * params.items);
      var v = Math.floor(rand() * params.items);
      if (u === v) v = (v + 1) % params.items;
      ops.push({ type: "union", a: u, b: v, mode: "random" });
    }
    for (var k = 0; k < params.repeatedFinds; k += 1) {
      var x;
      if (k % 4 === 0) x = 0;
      else if (k % 4 === 1) x = Math.floor(rand() * Math.max(1, Math.min(params.items, 8)));
      else x = Math.floor(rand() * params.items);
      ops.push({ type: "find", x: x });
    }
    return ops;
  }

  function depths(parent) {
    var out = new Array(parent.length);
    for (var i = 0; i < parent.length; i += 1) out[i] = rootPath(parent, i).length - 1;
    return out;
  }

  function componentMap(parent) {
    var map = {};
    for (var i = 0; i < parent.length; i += 1) {
      var r = rootPath(parent, i).slice(-1)[0];
      map[r] = (map[r] || 0) + 1;
    }
    return map;
  }

  function countComponents(parent) {
    return Object.keys(componentMap(parent)).length;
  }

  function maxValue(values) {
    var max = 0;
    for (var i = 0; i < values.length; i += 1) if (values[i] > max) max = values[i];
    return max;
  }

  function avgValue(values) {
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) sum += values[i];
    return sum / Math.max(1, values.length);
  }

  function partitionMatches(parent, labels) {
    for (var i = 0; i < labels.length; i += 1) {
      for (var j = i + 1; j < labels.length; j += 1) {
        var sameDsu = rootPath(parent, i).slice(-1)[0] === rootPath(parent, j).slice(-1)[0];
        var sameOracle = labels[i] === labels[j];
        if (sameDsu !== sameOracle) return false;
      }
    }
    return true;
  }

  function rankInvariant(dsu) {
    var sizes = componentMap(dsu.parent);
    for (var i = 0; i < dsu.parent.length; i += 1) {
      if (dsu.parent[i] !== i && dsu.rank[dsu.parent[i]] <= dsu.rank[i]) return false;
    }
    for (var root in sizes) {
      if (Object.prototype.hasOwnProperty.call(sizes, root)) {
        if (Math.pow(2, dsu.rank[Number(root)]) > sizes[root]) return false;
      }
    }
    return true;
  }

  function simulateMethod(params, method, ops, oracleLabels) {
    var dsu = makeDsu(params.items);
    var labels = oracleLabels.slice();
    var firstZeroPath = null;
    var lastZeroPath = null;
    ops.forEach(function (op) {
      if (op.type === "union") {
        union(dsu, op.a, op.b, method);
        oracleUnion(labels, op.a, op.b);
      } else {
        var before = rootPath(dsu.parent, op.x);
        find(dsu, op.x, method.compression);
        var after = rootPath(dsu.parent, op.x);
        if (op.x === 0) {
          if (!firstZeroPath) firstZeroPath = { before: before, after: after };
          lastZeroPath = { before: before, after: after };
        }
      }
    });
    var ds = depths(dsu.parent);
    return {
      key: method.key,
      label: method.label,
      color: method.color,
      parent: dsu.parent.slice(),
      rank: dsu.rank.slice(),
      traversals: dsu.traversals,
      writes: dsu.writes,
      finds: dsu.finds,
      unions: dsu.unions,
      redundant: dsu.redundant,
      maxDepth: maxValue(ds),
      avgDepth: avgValue(ds),
      components: countComponents(dsu.parent),
      depths: ds,
      firstZeroPath: firstZeroPath,
      lastZeroPath: lastZeroPath,
      partitionOk: partitionMatches(dsu.parent, labels),
      rankOk: method.rank ? rankInvariant(dsu) : true
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var ops = generateOps(params);
    var labels = new Array(params.items);
    for (var i = 0; i < params.items; i += 1) labels[i] = i;
    var methods = METHODS.map(function (method) {
      return simulateMethod(params, method, ops, labels);
    });
    var focus = methods.filter(function (row) { return row.key === params.focus; })[0] || methods[methods.length - 1];
    var plain = methods[0];
    var fast = methods[methods.length - 1];
    var result = {
      params: params,
      ops: ops,
      methods: methods,
      focus: focus,
      plain: plain,
      fast: fast,
      chainDemo: compressionDemo(Math.min(params.items, 18))
    };
    result.audit = auditResult(result);
    return result;
  }

  function compressionDemo(n) {
    var parent = new Array(n);
    for (var i = 0; i < n - 1; i += 1) parent[i] = i + 1;
    parent[n - 1] = n - 1;
    var before = rootPath(parent, 0);
    var dsu = { parent: parent.slice(), rank: new Array(n).fill(0), traversals: 0, writes: 0, finds: 0 };
    find(dsu, 0, true);
    return { before: before, after: rootPath(dsu.parent, 0), writes: dsu.writes };
  }

  function auditResult(result) {
    var checks = [];
    function check(name, passed) {
      checks.push({ name: name, passed: !!passed });
    }
    check("all variants match the oracle partition", result.methods.every(function (row) { return row.partitionOk; }));
    check("rank variants keep rank invariants", result.methods.every(function (row) { return row.rankOk; }));
    check("fast variant is no deeper than plain", result.fast.maxDepth <= result.plain.maxDepth);
    check("fast variant uses no more parent traversals than plain", result.fast.traversals <= result.plain.traversals);
    check("path compression shortens the chain demo", result.chainDemo.after.length < result.chainDemo.before.length && result.chainDemo.after.length === 2);
    check("operation counts are preserved", result.methods.every(function (row) {
      return row.unions === result.params.chainUnions + result.params.randomUnions && row.finds >= result.params.repeatedFinds;
    }));
    check("component counts agree", result.methods.every(function (row) { return row.components === result.fast.components; }));
    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function auditGrid() {
    var cases = [
      {},
      { items: 16, chainUnions: 15, randomUnions: 0, repeatedFinds: 64, seed: 3 },
      { items: 48, chainUnions: 8, randomUnions: 70, repeatedFinds: 120, seed: 203 },
      { items: 72, chainUnions: 0, randomUnions: 150, repeatedFinds: 120, seed: 42 },
      { items: 96, chainUnions: 95, randomUnions: 60, repeatedFinds: 200, seed: 77 }
    ].map(function (row, index) {
      var result = evaluate(row);
      return {
        caseId: index + 1,
        params: result.params,
        items: result.params.items,
        chainUnions: result.params.chainUnions,
        randomUnions: result.params.randomUnions,
        repeatedFinds: result.params.repeatedFinds,
        seed: result.params.seed,
        plainTraversals: result.plain.traversals,
        fastTraversals: result.fast.traversals,
        plainMaxDepth: result.plain.maxDepth,
        fastMaxDepth: result.fast.maxDepth,
        components: result.fast.components,
        passed: result.audit.passed,
        checks: result.audit.checks.map(function (check) {
          return {
            name: check.name,
            ok: check.passed
          };
        }),
        passedChecks: result.audit.checks.filter(function (check) { return check.passed; }).length,
        totalChecks: result.audit.checks.length,
        failedChecks: result.audit.checks.filter(function (check) { return !check.passed; }).map(function (check) { return check.name; })
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
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(digits == null ? 1 : digits);
    if (Math.abs(value) >= 10) return value.toFixed(digits == null ? 2 : digits);
    return value.toFixed(digits == null ? 3 : digits);
  }

  function metric(label, value, className) {
    return '<div class="union-find-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 900));
    var cssHeight = cssWidth < 700 ? 830 : 620;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    else ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, COLORS.muted, 11, 560);
  }

  function drawComparison(ctx, box, result) {
    panel(ctx, box, "same workload, four policies", "parent traversals and final depth");
    var left = box.x + 32;
    var top = box.y + 70;
    var right = box.x + box.w - 24;
    var maxTraversal = Math.max.apply(null, result.methods.map(function (row) { return row.traversals; }).concat([1]));
    var maxDepth = Math.max.apply(null, result.methods.map(function (row) { return row.maxDepth; }).concat([1]));
    result.methods.forEach(function (row, i) {
      var y = top + i * 42;
      var w1 = (right - left - 142) * row.traversals / maxTraversal;
      var w2 = (right - left - 142) * row.maxDepth / maxDepth;
      text(ctx, row.label, left, y, COLORS.text, 11, 720);
      ctx.fillStyle = row.color;
      ctx.fillRect(left + 118, y - 11, Math.max(1, w1), 12);
      ctx.fillStyle = "rgba(93, 104, 114, 0.28)";
      ctx.fillRect(left + 118, y + 5, Math.max(1, w2), 8);
      text(ctx, fmt(row.traversals, 0) + " traversals", right, y - 1, row.color, 11, 760, "right");
      text(ctx, "depth " + row.maxDepth, right, y + 15, COLORS.muted, 10, 650, "right");
    });
  }

  function drawForest(ctx, box, result) {
    panel(ctx, box, "focused parent forest", result.focus.label + " after all operations");
    var depths = result.focus.depths;
    var n = depths.length;
    var left = box.x + 22;
    var right = box.x + box.w - 24;
    var top = box.y + 70;
    var base = box.y + box.h - 36;
    var barW = Math.max(2, (right - left) / n - 1);
    var maxDepth = Math.max(1, maxValue(depths));
    for (var i = 0; i < n; i += 1) {
      var h = (base - top) * depths[i] / maxDepth;
      ctx.fillStyle = result.focus.parent[i] === i ? COLORS.good : result.focus.color;
      ctx.fillRect(left + i * (barW + 1), base - h, barW, Math.max(2, h));
    }
    text(ctx, "each bar is a node's distance to its representative", left, box.y + box.h - 14, COLORS.muted, 11, 650);
    text(ctx, "components " + result.focus.components + ", avg depth " + fmt(result.focus.avgDepth, 2), right, box.y + box.h - 14, COLORS.text, 11, 760, "right");
  }

  function drawCompression(ctx, box, result) {
    panel(ctx, box, "path compression", "one find can rewrite a long parent chain");
    var before = result.chainDemo.before;
    var after = result.chainDemo.after;
    var left = box.x + 24;
    var top = box.y + 78;
    var gap = Math.min(26, (box.w - 56) / Math.max(1, before.length - 1));
    before.forEach(function (node, i) {
      var x = left + i * gap;
      ctx.fillStyle = i === 0 ? COLORS.bad : (i === before.length - 1 ? COLORS.good : COLORS.faint);
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.arc(x, top, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (i < before.length - 1) {
        ctx.strokeStyle = COLORS.muted;
        ctx.beginPath();
        ctx.moveTo(x + 9, top);
        ctx.lineTo(x + gap - 9, top);
        ctx.stroke();
      }
    });
    text(ctx, "before: " + before.length + " nodes on path", left, top + 34, COLORS.bad, 11, 760);
    var y2 = top + 78;
    var x0 = left;
    var xr = Math.min(box.x + box.w - 38, left + gap * Math.max(3, before.length - 1));
    [x0, xr].forEach(function (x, i) {
      ctx.fillStyle = i === 0 ? COLORS.bad : COLORS.good;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.arc(x, y2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.strokeStyle = COLORS.good;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 10, y2);
    ctx.lineTo(xr - 10, y2);
    ctx.stroke();
    text(ctx, "after: " + after.length + " nodes, " + result.chainDemo.writes + " parent writes", left, y2 + 34, COLORS.good, 11, 760);
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "correctness ledger", "the fast structure must keep the same partition");
    var rows = [
      ["operations", String(result.ops.length), COLORS.text],
      ["union calls", String(result.params.chainUnions + result.params.randomUnions), COLORS.blue],
      ["find calls", String(result.fast.finds), COLORS.purple],
      ["fast traversals", fmt(result.fast.traversals, 0), COLORS.good],
      ["plain traversals", fmt(result.plain.traversals, 0), COLORS.bad],
      ["audit", result.audit.passed ? "passed" : "check", result.audit.passed ? COLORS.good : COLORS.bad]
    ];
    var y = box.y + 70;
    rows.forEach(function (row) {
      text(ctx, row[0], box.x + 18, y, COLORS.muted, 11, 650);
      text(ctx, row[1], box.x + box.w - 18, y, row[2], 12, 780, "right");
      y += 29;
    });
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    if (width < 700) {
      var gap = 14;
      var h = Math.floor((height - 3 * gap) / 4);
      drawComparison(ctx, { x: 0, y: 0, w: width, h: h }, result);
      drawForest(ctx, { x: 0, y: h + gap, w: width, h: h }, result);
      drawCompression(ctx, { x: 0, y: 2 * (h + gap), w: width, h: h }, result);
      drawLedger(ctx, { x: 0, y: 3 * (h + gap), w: width, h: height - 3 * (h + gap) }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.55);
      var rightW = width - leftW - gap2;
      var upperH = Math.round(height * 0.52);
      drawComparison(ctx, { x: 0, y: 0, w: leftW, h: upperH }, result);
      drawForest(ctx, { x: 0, y: upperH + gap2, w: leftW, h: height - upperH - gap2 }, result);
      drawCompression(ctx, { x: leftW + gap2, y: 0, w: rightW, h: upperH }, result);
      drawLedger(ctx, { x: leftW + gap2, y: upperH + gap2, w: rightW, h: height - upperH - gap2 }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      items: String(result.params.items),
      chainUnions: String(result.params.chainUnions),
      randomUnions: String(result.params.randomUnions),
      repeatedFinds: String(result.params.repeatedFinds),
      seed: String(result.params.seed)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Plain Traversals", fmt(result.plain.traversals, 0), "union-find-lab__metric--bad"),
        metric("Fast Traversals", fmt(result.fast.traversals, 0), "union-find-lab__metric--good"),
        metric("Plain Max Depth", String(result.plain.maxDepth), "union-find-lab__metric--bad"),
        metric("Fast Max Depth", String(result.fast.maxDepth), "union-find-lab__metric--good"),
        metric("Audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "union-find-lab__metric--good" : "union-find-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "The audit compares every variant with a naive partition oracle; path compression is allowed to change pointers, not membership.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__unionFindResult = result;
  }

  function init(root) {
    if (!root || root.__unionFindReady) return;
    root.__unionFindReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-union-find-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    evaluate: evaluate,
    generateOps: generateOps
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.UnionFindLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
