(function (global) {
  "use strict";

  var COLORS = {
    background: "#ffffff",
    code: "#7c3aed",
    def: "#d97706",
    edge: "#8a96a3",
    frontier: "#2563eb",
    grid: "#e6edf3",
    ink: "#172026",
    muted: "#5d6872",
    panel: "#f8fafc",
    phi: "#be123c",
    rule: "#d7dee5",
    selected: "#0f766e",
    soft: "#d8f1e8"
  };

  var SCENARIOS = {
    diamond: {
      defs: ["then", "else"],
      description: "branch and join",
      entry: "entry",
      focus: "then",
      label: "diamond",
      nodes: [
        { id: "entry", label: "entry", code: "start", x: 0.50, y: 0.10 },
        { id: "test", label: "test", code: "if p", x: 0.50, y: 0.27 },
        { id: "then", label: "then", code: "x = 1", x: 0.30, y: 0.48 },
        { id: "else", label: "else", code: "x = 2", x: 0.70, y: 0.48 },
        { id: "join", label: "join", code: "use x", x: 0.50, y: 0.70 },
        { id: "exit", label: "exit", code: "return", x: 0.50, y: 0.88 }
      ],
      edges: [
        ["entry", "test"],
        ["test", "then"],
        ["test", "else"],
        ["then", "join"],
        ["else", "join"],
        ["join", "exit"]
      ]
    },
    loop: {
      defs: ["init", "latch"],
      description: "loop-carried value",
      entry: "entry",
      focus: "head",
      label: "loop",
      nodes: [
        { id: "entry", label: "entry", code: "start", x: 0.50, y: 0.08 },
        { id: "init", label: "init", code: "i = 0", x: 0.50, y: 0.23 },
        { id: "head", label: "head", code: "while i<n", x: 0.50, y: 0.40 },
        { id: "body", label: "body", code: "sum += a[i]", x: 0.28, y: 0.60 },
        { id: "latch", label: "latch", code: "i = i+1", x: 0.50, y: 0.76 },
        { id: "exit", label: "exit", code: "return sum", x: 0.75, y: 0.60 }
      ],
      edges: [
        ["entry", "init"],
        ["init", "head"],
        ["head", "body"],
        ["head", "exit"],
        ["body", "latch"],
        ["latch", "head"]
      ]
    },
    irreducible: {
      defs: ["left", "right"],
      description: "two-entry cycle",
      entry: "entry",
      focus: "merge",
      label: "irreducible",
      nodes: [
        { id: "entry", label: "entry", code: "start", x: 0.50, y: 0.08 },
        { id: "split", label: "split", code: "goto B or C", x: 0.50, y: 0.25 },
        { id: "left", label: "B", code: "x = f()", x: 0.28, y: 0.48 },
        { id: "right", label: "C", code: "x = g()", x: 0.72, y: 0.48 },
        { id: "merge", label: "merge", code: "use x", x: 0.50, y: 0.72 },
        { id: "exit", label: "exit", code: "return", x: 0.50, y: 0.90 }
      ],
      edges: [
        ["entry", "split"],
        ["split", "left"],
        ["split", "right"],
        ["left", "right"],
        ["right", "left"],
        ["left", "merge"],
        ["right", "merge"],
        ["merge", "exit"]
      ]
    },
    switch: {
      defs: ["case1", "case2", "case3"],
      description: "many-way join",
      entry: "entry",
      focus: "join",
      label: "switch",
      nodes: [
        { id: "entry", label: "entry", code: "start", x: 0.50, y: 0.08 },
        { id: "dispatch", label: "switch", code: "switch tag", x: 0.50, y: 0.25 },
        { id: "case1", label: "case A", code: "x = 1", x: 0.18, y: 0.48 },
        { id: "case2", label: "case B", code: "x = 2", x: 0.50, y: 0.48 },
        { id: "case3", label: "case C", code: "x = 3", x: 0.82, y: 0.48 },
        { id: "join", label: "join", code: "use x", x: 0.50, y: 0.72 },
        { id: "exit", label: "exit", code: "return", x: 0.50, y: 0.90 }
      ],
      edges: [
        ["entry", "dispatch"],
        ["dispatch", "case1"],
        ["dispatch", "case2"],
        ["dispatch", "case3"],
        ["case1", "join"],
        ["case2", "join"],
        ["case3", "join"],
        ["join", "exit"]
      ]
    }
  };

  var DEFAULTS = {
    focus: "join",
    scenario: "diamond"
  };

  function cloneSet(set) {
    return new Set(Array.from(set));
  }

  function sortedIds(set, order) {
    var rank = {};
    order.forEach(function (id, index) { rank[id] = index; });
    return Array.from(set).sort(function (a, b) { return rank[a] - rank[b]; });
  }

  function setEquals(a, b) {
    if (a.size !== b.size) return false;
    var ok = true;
    a.forEach(function (value) {
      if (!b.has(value)) ok = false;
    });
    return ok;
  }

  function intersectSets(sets) {
    if (!sets.length) return new Set();
    var out = cloneSet(sets[0]);
    out.forEach(function (value) {
      for (var i = 1; i < sets.length; i += 1) {
        if (!sets[i].has(value)) {
          out.delete(value);
          break;
        }
      }
    });
    return out;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var graph = SCENARIOS[scenario];
    var focus = graph.nodes.some(function (node) { return node.id === raw.focus; }) ? raw.focus : graph.focus;
    return { focus: focus, scenario: scenario };
  }

  function predecessors(graph) {
    var preds = {};
    graph.nodes.forEach(function (node) { preds[node.id] = []; });
    graph.edges.forEach(function (edge) {
      preds[edge[1]].push(edge[0]);
    });
    return preds;
  }

  function successors(graph) {
    var succs = {};
    graph.nodes.forEach(function (node) { succs[node.id] = []; });
    graph.edges.forEach(function (edge) {
      succs[edge[0]].push(edge[1]);
    });
    return succs;
  }

  function reversePostorder(graph) {
    var succs = successors(graph);
    var seen = {};
    var post = [];
    function visit(id) {
      if (seen[id]) return;
      seen[id] = true;
      succs[id].forEach(visit);
      post.push(id);
    }
    visit(graph.entry);
    return post.reverse();
  }

  function snapshotSets(doms, order) {
    var out = {};
    order.forEach(function (id) {
      out[id] = sortedIds(doms[id], order);
    });
    return out;
  }

  function totalMembership(snapshot) {
    return Object.keys(snapshot).reduce(function (sum, id) {
      return sum + snapshot[id].length;
    }, 0);
  }

  function computeDominators(graph) {
    var order = reversePostorder(graph);
    var preds = predecessors(graph);
    var all = new Set(order);
    var doms = {};
    order.forEach(function (id) {
      doms[id] = id === graph.entry ? new Set([id]) : cloneSet(all);
    });
    var snapshots = [{ label: "init", sets: snapshotSets(doms, order), total: order.length + (order.length - 1) * order.length }];
    var changed = true;
    var pass = 0;
    while (changed && pass < 32) {
      changed = false;
      pass += 1;
      order.forEach(function (id) {
        if (id === graph.entry) return;
        var predSets = preds[id].filter(function (pred) { return doms[pred]; }).map(function (pred) { return doms[pred]; });
        var next = predSets.length ? intersectSets(predSets) : new Set();
        next.add(id);
        if (!setEquals(next, doms[id])) {
          doms[id] = next;
          changed = true;
        }
      });
      var snap = snapshotSets(doms, order);
      snapshots.push({ label: "pass " + pass, sets: snap, total: totalMembership(snap) });
    }
    return { doms: doms, order: order, passes: pass, preds: preds, snapshots: snapshots, succs: successors(graph) };
  }

  function dominates(result, dominator, node) {
    return !!(result.doms[node] && result.doms[node].has(dominator));
  }

  function strictlyDominates(result, dominator, node) {
    return dominator !== node && dominates(result, dominator, node);
  }

  function immediateDominators(graph, result) {
    var idom = {};
    result.order.forEach(function (id) {
      if (id === graph.entry) {
        idom[id] = null;
        return;
      }
      var strict = sortedIds(result.doms[id], result.order).filter(function (candidate) { return candidate !== id; });
      var best = null;
      strict.forEach(function (candidate) {
        if (!best || result.doms[candidate].size > result.doms[best].size) best = candidate;
      });
      idom[id] = best;
    });
    return idom;
  }

  function dominanceFrontiers(graph, result) {
    var frontier = {};
    result.order.forEach(function (id) { frontier[id] = new Set(); });
    result.order.forEach(function (x) {
      result.order.forEach(function (y) {
        var hasDominatedPred = result.preds[y].some(function (pred) {
          return dominates(result, x, pred);
        });
        if (hasDominatedPred && !strictlyDominates(result, x, y)) frontier[x].add(y);
      });
    });
    return frontier;
  }

  function placePhiNodes(graph, frontier) {
    var defs = new Set(graph.defs);
    var work = graph.defs.slice();
    var phi = new Set();
    var guard = 0;
    while (work.length && guard < 64) {
      guard += 1;
      var def = work.shift();
      frontier[def].forEach(function (join) {
        if (!phi.has(join)) {
          phi.add(join);
          if (!defs.has(join)) work.push(join);
        }
      });
    }
    return phi;
  }

  function analyze(raw) {
    var params = cleanParams(raw);
    var graph = SCENARIOS[params.scenario];
    var domResult = computeDominators(graph);
    var idom = immediateDominators(graph, domResult);
    var frontier = dominanceFrontiers(graph, domResult);
    var phi = placePhiNodes(graph, frontier);
    var focusDom = domResult.doms[params.focus] || new Set();
    return {
      frontier: frontier,
      graph: graph,
      idom: idom,
      params: params,
      phi: phi,
      result: domResult,
      summary: {
        blocks: domResult.order.length,
        edges: graph.edges.length,
        focusDominators: focusDom.size,
        frontierSize: frontier[params.focus] ? frontier[params.focus].size : 0,
        passes: domResult.passes,
        phiCount: phi.size,
        totalFrontier: Object.keys(frontier).reduce(function (sum, id) { return sum + frontier[id].size; }, 0)
      }
    };
  }

  function formatSet(set, order) {
    var rows = set instanceof Set ? sortedIds(set, order) : set;
    return rows.length ? rows.join(", ") : "none";
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 650) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
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
    drawText(ctx, title, box.x + 16, box.y + 24, COLORS.ink, 13, 800);
    drawText(ctx, subtitle, box.x + 16, box.y + 43, COLORS.muted, 10, 650);
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = global.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.width || 960));
    var height = width < 620 ? Math.round(width * 1.84) : Math.round(width * 0.80);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function nodeMap(graph) {
    var out = {};
    graph.nodes.forEach(function (node) { out[node.id] = node; });
    return out;
  }

  function drawArrow(ctx, from, to, box) {
    var x1 = box.x + from.x * box.w;
    var y1 = box.y + from.y * box.h;
    var x2 = box.x + to.x * box.w;
    var y2 = box.y + to.y * box.h;
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var r = 33;
    var sx = x1 + Math.cos(angle) * r;
    var sy = y1 + Math.sin(angle) * r;
    var ex = x2 - Math.cos(angle) * r;
    var ey = y2 - Math.sin(angle) * r;
    ctx.strokeStyle = COLORS.edge;
    ctx.fillStyle = COLORS.edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 8 * Math.cos(angle - 0.55), ey - 8 * Math.sin(angle - 0.55));
    ctx.lineTo(ex - 8 * Math.cos(angle + 0.55), ey - 8 * Math.sin(angle + 0.55));
    ctx.closePath();
    ctx.fill();
  }

  function drawNode(ctx, node, state, box) {
    var x = box.x + node.x * box.w;
    var y = box.y + node.y * box.h;
    var w = Math.min(96, Math.max(72, box.w * 0.20));
    var h = 44;
    var isFocus = node.id === state.params.focus;
    var isDom = state.result.doms[state.params.focus] && state.result.doms[state.params.focus].has(node.id);
    var inFrontier = state.frontier[state.params.focus] && state.frontier[state.params.focus].has(node.id);
    var isPhi = state.phi.has(node.id);
    var isDef = state.graph.defs.indexOf(node.id) !== -1;
    ctx.fillStyle = isDom ? COLORS.soft : "#ffffff";
    ctx.strokeStyle = isFocus ? COLORS.selected : inFrontier ? COLORS.frontier : isPhi ? COLORS.phi : COLORS.rule;
    ctx.lineWidth = isFocus || inFrontier || isPhi ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, node.label, x, y - 4, isFocus ? COLORS.selected : COLORS.ink, 12, 850, "center");
    drawText(ctx, node.code, x, y + 14, isDef ? COLORS.def : COLORS.muted, 10, 700, "center");
    if (isPhi) {
      ctx.fillStyle = COLORS.phi;
      ctx.beginPath();
      ctx.arc(x + w / 2 - 8, y - h / 2 + 8, 6, 0, Math.PI * 2);
      ctx.fill();
      drawText(ctx, "p", x + w / 2 - 8, y - h / 2 + 11, "#ffffff", 8, 850, "center");
    }
  }

  function drawCfg(ctx, state, box) {
    panel(ctx, box, "control-flow graph", state.graph.description + "; selected block = " + state.params.focus);
    var inner = { x: box.x + 12, y: box.y + 50, w: box.w - 24, h: box.h - 70 };
    var nodes = nodeMap(state.graph);
    state.graph.edges.forEach(function (edge) {
      drawArrow(ctx, nodes[edge[0]], nodes[edge[1]], inner);
    });
    state.graph.nodes.forEach(function (node) {
      drawNode(ctx, node, state, inner);
    });
    drawText(ctx, "green fill = dominates selected; blue outline = selected block's frontier", box.x + 16, box.y + box.h - 14, COLORS.muted, 10, 650);
  }

  function drawDominators(ctx, state, box) {
    panel(ctx, box, "fixed point: dominators", "Dom(n) = {n} union intersection of Dom(preds)");
    var y = box.y + 72;
    var rowH = Math.max(23, Math.min(31, (box.h - 92) / state.result.order.length));
    state.result.order.forEach(function (id, index) {
      var yy = y + index * rowH;
      var isFocus = id === state.params.focus;
      var doms = state.result.doms[id];
      ctx.fillStyle = isFocus ? COLORS.soft : "#ffffff";
      ctx.fillRect(box.x + 16, yy - 14, box.w - 32, rowH - 4);
      drawText(ctx, id, box.x + 24, yy, isFocus ? COLORS.selected : COLORS.ink, 11, 800);
      drawText(ctx, "{" + formatSet(doms, state.result.order) + "}", box.x + 92, yy, COLORS.muted, 10, 700);
    });
  }

  function drawIterations(ctx, state, box) {
    panel(ctx, box, "iteration shrinks ignorance", "start with every block dominating everything, then intersect predecessors");
    var snaps = state.result.snapshots;
    var max = Math.max.apply(null, snaps.map(function (snap) { return snap.total; }));
    var min = state.result.order.length;
    var plot = { x: box.x + 42, y: box.y + 70, w: box.w - 72, h: box.h - 110 };
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    snaps.forEach(function (snap, index) {
      var x = plot.x + (index + 0.5) * plot.w / snaps.length;
      var h = (snap.total - min) / Math.max(1, max - min) * plot.h;
      ctx.fillStyle = index === snaps.length - 1 ? COLORS.selected : COLORS.frontier;
      ctx.fillRect(x - 9, plot.y + plot.h - h, 18, Math.max(2, h));
      drawText(ctx, String(snap.total), x, plot.y + plot.h - h - 6, COLORS.ink, 10, 750, "center");
      drawText(ctx, snap.label.replace("pass ", ""), x, plot.y + plot.h + 17, COLORS.muted, 9, 700, "center");
    });
    drawText(ctx, "set memberships", plot.x, box.y + box.h - 20, COLORS.muted, 10, 650);
    drawText(ctx, state.summary.passes + " passes", plot.x + plot.w, box.y + box.h - 20, COLORS.selected, 11, 850, "right");
  }

  function drawTreeAndFrontier(ctx, state, box) {
    panel(ctx, box, "tree, frontier, phi", "the frontier is where dominance stops being total");
    var left = box.x + 18;
    var y = box.y + 74;
    drawText(ctx, "immediate dominators", left, y, COLORS.ink, 11, 850);
    y += 22;
    state.result.order.forEach(function (id) {
      if (id === state.graph.entry) return;
      drawText(ctx, state.idom[id] + " -> " + id, left, y, COLORS.muted, 10, 700);
      y += 17;
    });
    var right = box.x + box.w * 0.52;
    var focusFrontier = state.frontier[state.params.focus] || new Set();
    drawText(ctx, "DF(" + state.params.focus + ")", right, box.y + 74, COLORS.frontier, 11, 850);
    drawText(ctx, formatSet(focusFrontier, state.result.order), right, box.y + 96, COLORS.ink, 11, 750);
    drawText(ctx, "defs for x", right, box.y + 129, COLORS.def, 11, 850);
    drawText(ctx, state.graph.defs.join(", "), right, box.y + 151, COLORS.ink, 11, 750);
    drawText(ctx, "phi blocks", right, box.y + 184, COLORS.phi, 11, 850);
    drawText(ctx, formatSet(state.phi, state.result.order), right, box.y + 206, COLORS.ink, 11, 750);
    drawText(ctx, state.summary.totalFrontier + " total frontier entries", right, box.y + box.h - 20, COLORS.muted, 10, 700);
  }

  function draw(root, state) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    var margin = 18;
    var gap = 18;
    if (width < 620) {
      var h = (height - 2 * margin - 3 * gap) / 4;
      drawCfg(ctx, state, { x: margin, y: margin, w: width - 2 * margin, h: h });
      drawDominators(ctx, state, { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h });
      drawIterations(ctx, state, { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h });
      drawTreeAndFrontier(ctx, state, { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - 2 * margin - gap) / 2;
      var rowH = (height - 2 * margin - gap) / 2;
      drawCfg(ctx, state, { x: margin, y: margin, w: colW, h: rowH });
      drawDominators(ctx, state, { x: margin + colW + gap, y: margin, w: colW, h: rowH });
      drawIterations(ctx, state, { x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      drawTreeAndFrontier(ctx, state, { x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
  }

  function metric(label, value, accent) {
    return '<div class="dominator-lab__metric' + (accent ? " " + accent : "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function renderMetrics(root, state) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    box.innerHTML = [
      metric("fixed-point passes", String(state.summary.passes), "good"),
      metric("blocks / edges", state.summary.blocks + " / " + state.summary.edges),
      metric("selected dominators", String(state.summary.focusDominators), "good"),
      metric("DF(selected)", String(state.summary.frontierSize)),
      metric("phi blocks", String(state.summary.phiCount), state.summary.phiCount ? "warn" : ""),
      metric("frontier entries", String(state.summary.totalFrontier))
    ].join("");
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function syncControls(root, state) {
    var scenario = root.querySelector('[data-param="scenario"]');
    if (scenario) scenario.value = state.params.scenario;
    var focus = root.querySelector('[data-param="focus"]');
    if (focus) {
      var html = state.graph.nodes.map(function (node) {
        return '<option value="' + node.id + '">' + node.id + '</option>';
      }).join("");
      if (focus.innerHTML !== html) focus.innerHTML = html;
      focus.value = state.params.focus;
    }
    root.querySelectorAll('[data-value="scenario"]').forEach(function (node) {
      node.textContent = state.graph.label;
    });
    root.querySelectorAll('[data-value="focus"]').forEach(function (node) {
      node.textContent = state.params.focus;
    });
  }

  function render(root) {
    var state = analyze(readParams(root));
    syncControls(root, state);
    renderMetrics(root, state);
    draw(root, state);
    root.__dominatorFrontierState = state;
  }

  function init(root) {
    if (!root || root.__dominatorFrontierReady) return;
    root.__dominatorFrontierReady = true;
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
    requestRender();
  }

  function initAll() {
    global.document.querySelectorAll("[data-dominator-frontier-lab]").forEach(init);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function auditScenario(key) {
    var state = analyze({ scenario: key });
    var order = state.result.order;
    order.forEach(function (id) {
      assert(state.result.doms[id].has(id), key + ": node does not dominate itself: " + id);
      assert(state.result.doms[id].has(state.graph.entry), key + ": entry missing from dom(" + id + ")");
      if (id !== state.graph.entry) {
        var parent = state.idom[id];
        assert(parent && state.result.doms[id].has(parent), key + ": bad idom for " + id);
        sortedIds(state.result.doms[id], order).forEach(function (dominator) {
          if (dominator !== id && dominator !== parent) {
            assert(state.result.doms[parent].has(dominator), key + ": idom is not closest for " + id);
          }
        });
      }
    });
    order.forEach(function (x) {
      state.frontier[x].forEach(function (y) {
        var hasDominatedPred = state.result.preds[y].some(function (pred) { return dominates(state.result, x, pred); });
        assert(hasDominatedPred, key + ": frontier without dominated predecessor");
        assert(!strictlyDominates(state.result, x, y), key + ": frontier node is strictly dominated");
      });
    });
    for (var i = 1; i < state.result.snapshots.length; i += 1) {
      assert(state.result.snapshots[i].total <= state.result.snapshots[i - 1].total, key + ": dominator memberships grew");
    }
    return state;
  }

  function audit() {
    var diamond = auditScenario("diamond");
    assert(diamond.phi.has("join"), "diamond should place phi at join");
    assert(diamond.frontier.then.has("join"), "then frontier should contain join");
    assert(diamond.frontier.else.has("join"), "else frontier should contain join");
    var loop = auditScenario("loop");
    assert(loop.phi.has("head"), "loop should place phi at loop head");
    assert(loop.frontier.latch.has("head"), "latch frontier should contain head");
    var irreducible = auditScenario("irreducible");
    assert(irreducible.phi.has("left") && irreducible.phi.has("right") && irreducible.phi.has("merge"), "irreducible phi placement should expose cycle heads and merge");
    var sw = auditScenario("switch");
    assert(sw.phi.has("join"), "switch should place phi at join");
    return {
      diamondPasses: diamond.summary.passes,
      loopPhi: sortedIds(loop.phi, loop.result.order),
      ok: true,
      scenarios: Object.keys(SCENARIOS).length
    };
  }

  var api = {
    SCENARIOS: SCENARIOS,
    analyze: analyze,
    audit: audit,
    cleanParams: cleanParams,
    computeDominators: computeDominators,
    dominanceFrontiers: dominanceFrontiers,
    placePhiNodes: placePhiNodes
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.DominatorFrontierLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
