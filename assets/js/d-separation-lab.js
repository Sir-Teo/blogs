(function (global) {
  "use strict";

  var COLORS = {
    active: "#0f766e",
    background: "#ffffff",
    blocked: "#be123c",
    collider: "#7c3aed",
    edge: "#8a96a3",
    grid: "#e6edf3",
    ink: "#172026",
    muted: "#5d6872",
    observed: "#d97706",
    panel: "#f8fafc",
    query: "#2563eb",
    rule: "#d7dee5",
    softActive: "#d8f1e8",
    softBlocked: "#f9dddd",
    softObserved: "#fdebc8"
  };

  var SCENARIOS = {
    chain: {
      description: "causal chain",
      left: "X",
      observed: [],
      right: "Y",
      nodes: [
        { id: "X", label: "X", note: "cause", x: 0.18, y: 0.50 },
        { id: "M", label: "M", note: "mediator", x: 0.50, y: 0.50 },
        { id: "Y", label: "Y", note: "effect", x: 0.82, y: 0.50 }
      ],
      edges: [["X", "M"], ["M", "Y"]]
    },
    fork: {
      description: "common cause",
      left: "X",
      observed: [],
      right: "Y",
      nodes: [
        { id: "C", label: "C", note: "cause", x: 0.50, y: 0.23 },
        { id: "X", label: "X", note: "child", x: 0.25, y: 0.70 },
        { id: "Y", label: "Y", note: "child", x: 0.75, y: 0.70 }
      ],
      edges: [["C", "X"], ["C", "Y"]]
    },
    collider: {
      description: "collider",
      left: "X",
      observed: [],
      right: "Y",
      nodes: [
        { id: "X", label: "X", note: "cause", x: 0.18, y: 0.38 },
        { id: "Y", label: "Y", note: "cause", x: 0.82, y: 0.38 },
        { id: "C", label: "C", note: "collider", x: 0.50, y: 0.60 },
        { id: "D", label: "D", note: "descendant", x: 0.50, y: 0.84 }
      ],
      edges: [["X", "C"], ["Y", "C"], ["C", "D"]]
    },
    explaining: {
      description: "explaining away",
      left: "Rain",
      observed: ["Alarm"],
      right: "Sprinkler",
      nodes: [
        { id: "Rain", label: "Rain", note: "cause", x: 0.20, y: 0.28 },
        { id: "Sprinkler", label: "Sprinkler", note: "cause", x: 0.80, y: 0.28 },
        { id: "Wet", label: "Wet", note: "collider", x: 0.50, y: 0.52 },
        { id: "Alarm", label: "Alarm", note: "descendant", x: 0.50, y: 0.78 }
      ],
      edges: [["Rain", "Wet"], ["Sprinkler", "Wet"], ["Wet", "Alarm"]]
    },
    mixed: {
      description: "front and back paths",
      left: "Treatment",
      observed: ["Severity"],
      right: "Outcome",
      nodes: [
        { id: "Severity", label: "Severity", note: "confounder", x: 0.50, y: 0.20 },
        { id: "Treatment", label: "Treatment", note: "choice", x: 0.22, y: 0.52 },
        { id: "Outcome", label: "Outcome", note: "result", x: 0.78, y: 0.52 },
        { id: "Recovery", label: "Recovery", note: "proxy", x: 0.50, y: 0.82 }
      ],
      edges: [["Severity", "Treatment"], ["Severity", "Outcome"], ["Treatment", "Outcome"], ["Outcome", "Recovery"]]
    },
    selection: {
      description: "selection bias",
      left: "Skill",
      observed: ["Admit"],
      right: "Coaching",
      nodes: [
        { id: "Skill", label: "Skill", note: "cause", x: 0.18, y: 0.30 },
        { id: "Coaching", label: "Coaching", note: "cause", x: 0.82, y: 0.30 },
        { id: "Score", label: "Score", note: "collider", x: 0.50, y: 0.55 },
        { id: "Admit", label: "Admit", note: "selected", x: 0.50, y: 0.80 }
      ],
      edges: [["Skill", "Score"], ["Coaching", "Score"], ["Score", "Admit"]]
    }
  };

  var DEFAULTS = {
    left: "Rain",
    observed: ["Alarm"],
    right: "Sprinkler",
    scenario: "explaining"
  };

  function cloneArray(values) {
    return values ? values.slice() : [];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var graph = SCENARIOS[scenario];
    var ids = graph.nodes.map(function (node) { return node.id; });
    var left = ids.indexOf(raw.left) !== -1 ? raw.left : graph.left;
    var right = ids.indexOf(raw.right) !== -1 && raw.right !== left ? raw.right : graph.right;
    if (right === left) right = ids.filter(function (id) { return id !== left; })[0] || left;
    var rawObserved = Array.isArray(raw.observed) ? raw.observed : typeof raw.observed === "string" && raw.observed ? raw.observed.split(",") : graph.observed;
    var observed = [];
    rawObserved.forEach(function (id) {
      if (ids.indexOf(id) !== -1 && id !== left && id !== right && observed.indexOf(id) === -1) observed.push(id);
    });
    return { left: left, observed: observed, right: right, scenario: scenario };
  }

  function nodeMap(graph) {
    var out = {};
    graph.nodes.forEach(function (node) { out[node.id] = node; });
    return out;
  }

  function parentMap(graph) {
    var parents = {};
    graph.nodes.forEach(function (node) { parents[node.id] = []; });
    graph.edges.forEach(function (edge) { parents[edge[1]].push(edge[0]); });
    return parents;
  }

  function childMap(graph) {
    var children = {};
    graph.nodes.forEach(function (node) { children[node.id] = []; });
    graph.edges.forEach(function (edge) { children[edge[0]].push(edge[1]); });
    return children;
  }

  function undirectedNeighbors(graph) {
    var neighbors = {};
    graph.nodes.forEach(function (node) { neighbors[node.id] = []; });
    graph.edges.forEach(function (edge) {
      neighbors[edge[0]].push(edge[1]);
      neighbors[edge[1]].push(edge[0]);
    });
    return neighbors;
  }

  function hasDirectedEdge(graph, from, to) {
    return graph.edges.some(function (edge) { return edge[0] === from && edge[1] === to; });
  }

  function descendantsOf(graph, start) {
    var children = childMap(graph);
    var seen = {};
    var stack = cloneArray(children[start]);
    while (stack.length) {
      var id = stack.pop();
      if (seen[id]) continue;
      seen[id] = true;
      children[id].forEach(function (child) { stack.push(child); });
    }
    return Object.keys(seen);
  }

  function descendantsByNode(graph) {
    var out = {};
    graph.nodes.forEach(function (node) { out[node.id] = descendantsOf(graph, node.id); });
    return out;
  }

  function allSimplePaths(graph, start, target) {
    var neighbors = undirectedNeighbors(graph);
    var paths = [];
    function visit(id, path, used) {
      if (paths.length > 64) return;
      if (id === target) {
        paths.push(path.slice());
        return;
      }
      neighbors[id].forEach(function (next) {
        if (used[next]) return;
        used[next] = true;
        path.push(next);
        visit(next, path, used);
        path.pop();
        delete used[next];
      });
    }
    var used = {};
    used[start] = true;
    visit(start, [start], used);
    return paths;
  }

  function isColliderOnPath(graph, prev, node, next) {
    return hasDirectedEdge(graph, prev, node) && hasDirectedEdge(graph, next, node);
  }

  function analyzePath(graph, path, observedSet, descendants) {
    var steps = [];
    var active = true;
    for (var i = 1; i < path.length - 1; i += 1) {
      var prev = path[i - 1];
      var node = path[i];
      var next = path[i + 1];
      var collider = isColliderOnPath(graph, prev, node, next);
      var observed = observedSet.has(node);
      var observedDescendant = descendants[node].some(function (id) { return observedSet.has(id); });
      var open = collider ? observed || observedDescendant : !observed;
      if (!open) active = false;
      steps.push({
        collider: collider,
        node: node,
        observed: observed,
        observedDescendant: observedDescendant,
        open: open,
        reason: collider
          ? open ? observed ? "collider observed" : "descendant observed" : "collider unobserved"
          : open ? "non-collider unobserved" : "observed non-collider"
      });
    }
    return { active: active, path: path, steps: steps };
  }

  function analyze(raw) {
    var params = cleanParams(raw);
    var graph = SCENARIOS[params.scenario];
    var observedSet = new Set(params.observed);
    var descendants = descendantsByNode(graph);
    var pathRows = allSimplePaths(graph, params.left, params.right).map(function (path) {
      return analyzePath(graph, path, observedSet, descendants);
    });
    var active = pathRows.filter(function (row) { return row.active; });
    var openedColliders = {};
    pathRows.forEach(function (row) {
      row.steps.forEach(function (step) {
        if (step.collider && step.open) openedColliders[step.node] = true;
      });
    });
    return {
      descendants: descendants,
      graph: graph,
      openedColliders: Object.keys(openedColliders),
      params: params,
      paths: pathRows,
      summary: {
        activePaths: active.length,
        blockedPaths: pathRows.length - active.length,
        dSeparated: active.length === 0,
        observed: params.observed.length,
        pathCount: pathRows.length
      }
    };
  }

  function formatPath(path) {
    return path.join(" - ");
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
    var height = width < 620 ? Math.round(width * 1.82) : Math.round(width * 0.80);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function drawArrow(ctx, from, to, inner, color, width) {
    var x1 = inner.x + from.x * inner.w;
    var y1 = inner.y + from.y * inner.h;
    var x2 = inner.x + to.x * inner.w;
    var y2 = inner.y + to.y * inner.h;
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var r = 30;
    var sx = x1 + Math.cos(angle) * r;
    var sy = y1 + Math.sin(angle) * r;
    var ex = x2 - Math.cos(angle) * r;
    var ey = y2 - Math.sin(angle) * r;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 1.7;
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

  function edgeOnAnyActivePath(edge, state) {
    return state.paths.some(function (row) {
      if (!row.active) return false;
      for (var i = 0; i < row.path.length - 1; i += 1) {
        var a = row.path[i];
        var b = row.path[i + 1];
        if ((edge[0] === a && edge[1] === b) || (edge[0] === b && edge[1] === a)) return true;
      }
      return false;
    });
  }

  function drawNode(ctx, node, state, inner) {
    var x = inner.x + node.x * inner.w;
    var y = inner.y + node.y * inner.h;
    var observed = state.params.observed.indexOf(node.id) !== -1;
    var query = node.id === state.params.left || node.id === state.params.right;
    var opened = state.openedColliders.indexOf(node.id) !== -1;
    ctx.fillStyle = observed ? COLORS.softObserved : query ? "#e2ebff" : opened ? "#eee5ff" : "#ffffff";
    ctx.strokeStyle = query ? COLORS.query : observed ? COLORS.observed : opened ? COLORS.collider : COLORS.rule;
    ctx.lineWidth = query || observed || opened ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.roundRect(x - 44, y - 25, 88, 50, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, node.label, x, y - 3, query ? COLORS.query : observed ? COLORS.observed : COLORS.ink, 12, 850, "center");
    drawText(ctx, node.note, x, y + 15, COLORS.muted, 9, 700, "center");
  }

  function drawGraph(ctx, state, box) {
    panel(ctx, box, "DAG", state.graph.description + "; query " + state.params.left + " vs " + state.params.right);
    var inner = { x: box.x + 14, y: box.y + 54, w: box.w - 28, h: box.h - 76 };
    var nodes = nodeMap(state.graph);
    state.graph.edges.forEach(function (edge) {
      var active = edgeOnAnyActivePath(edge, state);
      drawArrow(ctx, nodes[edge[0]], nodes[edge[1]], inner, active ? COLORS.active : COLORS.edge, active ? 3 : 1.6);
    });
    state.graph.nodes.forEach(function (node) {
      drawNode(ctx, node, state, inner);
    });
    drawText(ctx, state.summary.dSeparated ? "all paths blocked" : "at least one active path", box.x + 16, box.y + box.h - 14, state.summary.dSeparated ? COLORS.blocked : COLORS.active, 11, 850);
  }

  function drawPaths(ctx, state, box) {
    panel(ctx, box, "paths", "a path is active only if every middle node lets information pass");
    var y = box.y + 78;
    if (!state.paths.length) {
      drawText(ctx, "no path", box.x + 18, y, COLORS.muted, 11, 700);
      return;
    }
    state.paths.forEach(function (row, index) {
      var yy = y + index * 54;
      var color = row.active ? COLORS.active : COLORS.blocked;
      ctx.fillStyle = row.active ? COLORS.softActive : COLORS.softBlocked;
      ctx.fillRect(box.x + 16, yy - 17, box.w - 32, 42);
      drawText(ctx, row.active ? "open" : "blocked", box.x + 24, yy, color, 11, 850);
      drawText(ctx, formatPath(row.path), box.x + 86, yy, COLORS.ink, 11, 750);
      var reason = row.steps.filter(function (step) { return !step.open; })[0] || row.steps[row.steps.length - 1];
      drawText(ctx, reason ? reason.node + ": " + reason.reason : "direct edge", box.x + 86, yy + 18, COLORS.muted, 10, 650);
    });
  }

  function drawRules(ctx, state, box) {
    panel(ctx, box, "local rules", "chains and forks close when observed; colliders open when observed below");
    var rows = [
      { color: COLORS.blocked, label: "observed non-collider blocks", text: "A -> B -> C or A <- B -> C with B in Z" },
      { color: COLORS.collider, label: "unobserved collider blocks", text: "A -> B <- C with no B-or-descendant in Z" },
      { color: COLORS.active, label: "observed collider opens", text: "A -> B <- C opens if B or a descendant is in Z" }
    ];
    var y = box.y + 80;
    rows.forEach(function (row) {
      ctx.fillStyle = row.color;
      ctx.beginPath();
      ctx.arc(box.x + 28, y - 5, 6, 0, Math.PI * 2);
      ctx.fill();
      drawText(ctx, row.label, box.x + 44, y, row.color, 11, 850);
      drawText(ctx, row.text, box.x + 44, y + 18, COLORS.muted, 10, 650);
      y += 58;
    });
    drawText(ctx, "Observed: " + (state.params.observed.length ? state.params.observed.join(", ") : "none"), box.x + 18, box.y + box.h - 20, COLORS.observed, 11, 850);
  }

  function drawDescendants(ctx, state, box) {
    panel(ctx, box, "collider descendants", "conditioning on an effect can connect its causes");
    var y = box.y + 78;
    state.graph.nodes.forEach(function (node) {
      var desc = state.descendants[node.id];
      var observedDesc = desc.filter(function (id) { return state.params.observed.indexOf(id) !== -1; });
      drawText(ctx, node.id, box.x + 20, y, COLORS.ink, 10, 850);
      drawText(ctx, desc.length ? desc.join(", ") : "none", box.x + 88, y, observedDesc.length ? COLORS.collider : COLORS.muted, 10, 700);
      y += 22;
    });
    drawText(ctx, state.openedColliders.length ? "opened: " + state.openedColliders.join(", ") : "no opened colliders", box.x + 18, box.y + box.h - 20, state.openedColliders.length ? COLORS.collider : COLORS.muted, 11, 850);
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
      drawGraph(ctx, state, { x: margin, y: margin, w: width - 2 * margin, h: h });
      drawPaths(ctx, state, { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h });
      drawRules(ctx, state, { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h });
      drawDescendants(ctx, state, { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - 2 * margin - gap) / 2;
      var rowH = (height - 2 * margin - gap) / 2;
      drawGraph(ctx, state, { x: margin, y: margin, w: colW, h: rowH });
      drawPaths(ctx, state, { x: margin + colW + gap, y: margin, w: colW, h: rowH });
      drawRules(ctx, state, { x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      drawDescendants(ctx, state, { x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
  }

  function metric(label, value, accent) {
    return '<div class="dsep-lab__metric' + (accent ? " " + accent : "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function renderMetrics(root, state) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    box.innerHTML = [
      metric("graph verdict", state.summary.dSeparated ? "d-separated" : "connected", state.summary.dSeparated ? "blocked" : "active"),
      metric("active paths", String(state.summary.activePaths), state.summary.activePaths ? "active" : ""),
      metric("blocked paths", String(state.summary.blockedPaths)),
      metric("observed nodes", state.params.observed.length ? state.params.observed.join(", ") : "none"),
      metric("opened colliders", state.openedColliders.length ? state.openedColliders.join(", ") : "none", state.openedColliders.length ? "warn" : ""),
      metric("simple paths", String(state.summary.pathCount))
    ].join("");
  }

  function readParams(root) {
    var scenarioNode = root.querySelector('[data-param="scenario"]');
    var leftNode = root.querySelector('[data-param="left"]');
    var rightNode = root.querySelector('[data-param="right"]');
    var scenario = scenarioNode && scenarioNode.value;
    var previous = root.__dSeparationState && root.__dSeparationState.params;
    var scenarioChanged = previous && scenario && scenario !== previous.scenario;
    var observedInputs = root.querySelectorAll("[data-observed]");
    var observed = observedInputs.length && !scenarioChanged ? [] : undefined;
    root.querySelectorAll("[data-observed]:checked").forEach(function (node) {
      if (observed) observed.push(node.value);
    });
    return {
      left: leftNode && leftNode.value,
      observed: observed,
      right: rightNode && rightNode.value,
      scenario: scenario
    };
  }

  function optionHtml(value, selected) {
    return '<option value="' + value + '"' + (selected ? " selected" : "") + ">" + value + "</option>";
  }

  function syncControls(root, state) {
    var scenario = root.querySelector('[data-param="scenario"]');
    if (scenario) scenario.value = state.params.scenario;
    var ids = state.graph.nodes.map(function (node) { return node.id; });
    ["left", "right"].forEach(function (key) {
      var select = root.querySelector('[data-param="' + key + '"]');
      if (!select) return;
      var html = ids.map(function (id) { return optionHtml(id, state.params[key] === id); }).join("");
      if (select.innerHTML !== html) select.innerHTML = html;
      select.value = state.params[key];
    });
    var box = root.querySelector("[data-observed-box]");
    if (box) {
      var html2 = state.graph.nodes.map(function (node) {
        var disabled = node.id === state.params.left || node.id === state.params.right;
        var checked = state.params.observed.indexOf(node.id) !== -1;
        return '<label class="dsep-lab__check"><input type="checkbox" value="' + node.id + '" data-observed' + (checked ? " checked" : "") + (disabled ? " disabled" : "") + "> <span>" + node.id + "</span></label>";
      }).join("");
      if (box.innerHTML !== html2) {
        box.innerHTML = html2;
        box.querySelectorAll("[data-observed]").forEach(function (input) {
          input.addEventListener("change", function () { render(root); });
        });
      }
    }
    root.querySelectorAll('[data-value="scenario"]').forEach(function (node) { node.textContent = state.graph.description; });
    root.querySelectorAll('[data-value="query"]').forEach(function (node) { node.textContent = state.params.left + " vs " + state.params.right; });
  }

  function render(root) {
    var state = analyze(readParams(root));
    syncControls(root, state);
    renderMetrics(root, state);
    draw(root, state);
    root.__dSeparationState = state;
  }

  function init(root) {
    if (!root || root.__dSeparationReady) return;
    root.__dSeparationReady = true;
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
    global.document.querySelectorAll("[data-d-separation-lab]").forEach(init);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function audit() {
    var chainOpen = analyze({ scenario: "chain", left: "X", right: "Y", observed: [] });
    var chainBlocked = analyze({ scenario: "chain", left: "X", right: "Y", observed: ["M"] });
    assert(chainOpen.summary.activePaths === 1, "chain should be active when unobserved");
    assert(chainBlocked.summary.dSeparated, "conditioning on chain middle should block");
    var forkOpen = analyze({ scenario: "fork", left: "X", right: "Y", observed: [] });
    var forkBlocked = analyze({ scenario: "fork", left: "X", right: "Y", observed: ["C"] });
    assert(forkOpen.summary.activePaths === 1, "fork should be active when common cause unobserved");
    assert(forkBlocked.summary.dSeparated, "conditioning on common cause should block fork");
    var colliderBlocked = analyze({ scenario: "collider", left: "X", right: "Y", observed: [] });
    var colliderOpen = analyze({ scenario: "collider", left: "X", right: "Y", observed: ["C"] });
    var colliderDescOpen = analyze({ scenario: "collider", left: "X", right: "Y", observed: ["D"] });
    assert(colliderBlocked.summary.dSeparated, "unobserved collider should block");
    assert(colliderOpen.summary.activePaths === 1, "observed collider should open");
    assert(colliderDescOpen.summary.activePaths === 1, "observed descendant should open collider");
    var mixed = analyze({ scenario: "mixed", left: "Treatment", right: "Outcome", observed: ["Severity"] });
    assert(mixed.summary.activePaths === 1 && !mixed.summary.dSeparated, "direct treatment path should remain active after confounder adjustment");
    var selection = analyze({ scenario: "selection", left: "Skill", right: "Coaching", observed: ["Admit"] });
    assert(selection.summary.activePaths === 1, "selection on descendant should open collider");
    Object.keys(SCENARIOS).forEach(function (key) {
      var state = analyze({ scenario: key });
      state.paths.forEach(function (row) {
        assert(row.path[0] === state.params.left && row.path[row.path.length - 1] === state.params.right, key + " path endpoints wrong");
      });
    });
    return {
      colliderOpenedByDescendant: colliderDescOpen.openedColliders,
      defaultActivePaths: analyze(DEFAULTS).summary.activePaths,
      ok: true,
      scenarios: Object.keys(SCENARIOS).length
    };
  }

  var api = {
    SCENARIOS: SCENARIOS,
    allSimplePaths: allSimplePaths,
    analyze: analyze,
    audit: audit,
    cleanParams: cleanParams,
    descendantsOf: descendantsOf,
    isColliderOnPath: isColliderOnPath
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.DSeparationLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
