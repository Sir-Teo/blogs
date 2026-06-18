(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    edge: "#94a3b8",
    flow: "#0f766e",
    path: "#b45309",
    residual: "#2563eb",
    cut: "#be123c",
    source: "#7c3aed",
    sink: "#0f766e",
    white: "#ffffff"
  };

  var EXAMPLES = {
    rail: {
      label: "rail bottleneck",
      nodes: [
        { id: "s", x: 0.08, y: 0.50 },
        { id: "A", x: 0.28, y: 0.22 },
        { id: "B", x: 0.28, y: 0.74 },
        { id: "C", x: 0.56, y: 0.18 },
        { id: "D", x: 0.56, y: 0.68 },
        { id: "t", x: 0.88, y: 0.48 }
      ],
      edges: [
        ["s", "A", 10], ["s", "B", 8], ["A", "C", 5], ["A", "D", 4],
        ["A", "B", 3], ["B", "D", 10], ["C", "t", 8], ["D", "C", 6],
        ["D", "t", 10]
      ]
    },
    backedge: {
      label: "undo lane",
      nodes: [
        { id: "s", x: 0.08, y: 0.50 },
        { id: "L", x: 0.30, y: 0.24 },
        { id: "R", x: 0.30, y: 0.74 },
        { id: "M", x: 0.58, y: 0.50 },
        { id: "t", x: 0.88, y: 0.50 }
      ],
      edges: [
        ["s", "L", 7], ["s", "R", 7], ["L", "R", 5], ["L", "M", 3],
        ["R", "M", 8], ["M", "t", 9], ["L", "t", 2], ["R", "t", 2]
      ]
    },
    layers: {
      label: "layered supply",
      nodes: [
        { id: "s", x: 0.07, y: 0.50 },
        { id: "A", x: 0.25, y: 0.18 },
        { id: "B", x: 0.25, y: 0.50 },
        { id: "C", x: 0.25, y: 0.82 },
        { id: "D", x: 0.55, y: 0.24 },
        { id: "E", x: 0.55, y: 0.62 },
        { id: "t", x: 0.88, y: 0.48 }
      ],
      edges: [
        ["s", "A", 6], ["s", "B", 9], ["s", "C", 5], ["A", "D", 5],
        ["A", "E", 3], ["B", "D", 4], ["B", "E", 6], ["C", "E", 5],
        ["D", "t", 8], ["E", "t", 9], ["E", "D", 2]
      ]
    }
  };

  var DEFAULTS = {
    example: "rail",
    step: 0,
    rule: "bfs"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    var rule = raw.rule === "widest" || raw.rule === "dfs" ? raw.rule : DEFAULTS.rule;
    return {
      example: EXAMPLES[raw.example] ? raw.example : DEFAULTS.example,
      rule: rule,
      step: Math.round(clamp(finite(Number(raw.step), DEFAULTS.step), 0, 1000))
    };
  }

  function makeGraph(key) {
    var spec = EXAMPLES[key] || EXAMPLES.rail;
    var index = {};
    var nodes = spec.nodes.map(function (node, i) {
      index[node.id] = i;
      return { id: node.id, x: node.x, y: node.y };
    });
    var edges = spec.edges.map(function (edge, i) {
      return { from: index[edge[0]], to: index[edge[1]], capacity: edge[2], flow: 0, index: i };
    });
    return {
      edges: edges,
      index: index,
      key: key,
      label: spec.label,
      nodes: nodes,
      source: index.s,
      sink: index.t
    };
  }

  function cloneEdges(edges) {
    return edges.map(function (edge) {
      return { from: edge.from, to: edge.to, capacity: edge.capacity, flow: edge.flow, index: edge.index };
    });
  }

  function residualArcs(graph, edges) {
    var arcs = [];
    edges.forEach(function (edge, i) {
      var forward = edge.capacity - edge.flow;
      if (forward > 0) arcs.push({ edgeIndex: i, from: edge.from, to: edge.to, residual: forward, dir: 1 });
      if (edge.flow > 0) arcs.push({ edgeIndex: i, from: edge.to, to: edge.from, residual: edge.flow, dir: -1 });
    });
    return arcs;
  }

  function adjacencyFromArcs(graph, arcs) {
    var adj = graph.nodes.map(function () { return []; });
    arcs.forEach(function (arc) { adj[arc.from].push(arc); });
    adj.forEach(function (row) {
      row.sort(function (a, b) {
        return a.to - b.to || b.residual - a.residual || a.edgeIndex - b.edgeIndex;
      });
    });
    return adj;
  }

  function pathFromParent(parent, source, sink) {
    if (!parent[sink]) return null;
    var path = [];
    var v = sink;
    while (v !== source) {
      var arc = parent[v];
      path.push(arc);
      v = arc.from;
    }
    path.reverse();
    return path;
  }

  function findPath(graph, edges, rule) {
    var arcs = residualArcs(graph, edges);
    var adj = adjacencyFromArcs(graph, arcs);
    var parent = graph.nodes.map(function () { return null; });
    var visited = graph.nodes.map(function () { return false; });
    var order = [];
    var u;

    if (rule === "dfs") {
      var stack = [graph.source];
      visited[graph.source] = true;
      while (stack.length) {
        u = stack.pop();
        order.push(u);
        if (u === graph.sink) break;
        adj[u].slice().reverse().forEach(function (arc) {
          if (!visited[arc.to]) {
            visited[arc.to] = true;
            parent[arc.to] = arc;
            stack.push(arc.to);
          }
        });
      }
    } else if (rule === "widest") {
      var width = graph.nodes.map(function () { return -1; });
      width[graph.source] = Infinity;
      for (;;) {
        var best = -1;
        var bestWidth = -1;
        for (var i = 0; i < graph.nodes.length; i += 1) {
          if (!visited[i] && width[i] > bestWidth) {
            best = i;
            bestWidth = width[i];
          }
        }
        if (best < 0 || bestWidth <= 0) break;
        visited[best] = true;
        order.push(best);
        if (best === graph.sink) break;
        adj[best].forEach(function (arc) {
          var candidate = Math.min(bestWidth, arc.residual);
          if (candidate > width[arc.to]) {
            width[arc.to] = candidate;
            parent[arc.to] = arc;
          }
        });
      }
    } else {
      var queue = [graph.source];
      visited[graph.source] = true;
      for (var head = 0; head < queue.length; head += 1) {
        u = queue[head];
        order.push(u);
        if (u === graph.sink) break;
        adj[u].forEach(function (arc) {
          if (!visited[arc.to]) {
            visited[arc.to] = true;
            parent[arc.to] = arc;
            queue.push(arc.to);
          }
        });
      }
    }

    var path = pathFromParent(parent, graph.source, graph.sink);
    var bottleneck = path ? path.reduce(function (min, arc) { return Math.min(min, arc.residual); }, Infinity) : 0;
    return {
      arcs: arcs,
      bottleneck: bottleneck,
      order: order,
      path: path,
      reachable: visited
    };
  }

  function applyPath(edges, path, amount) {
    path.forEach(function (arc) {
      edges[arc.edgeIndex].flow += arc.dir * amount;
    });
  }

  function flowValue(graph, edges) {
    return edges.reduce(function (sum, edge) {
      if (edge.from === graph.source) return sum + edge.flow;
      if (edge.to === graph.source) return sum - edge.flow;
      return sum;
    }, 0);
  }

  function cutCapacity(graph, edges, reachable) {
    return edges.reduce(function (sum, edge) {
      return reachable[edge.from] && !reachable[edge.to] ? sum + edge.capacity : sum;
    }, 0);
  }

  function crossingEdges(graph, edges, reachable) {
    return edges.filter(function (edge) { return reachable[edge.from] && !reachable[edge.to]; });
  }

  function runMaxFlow(input) {
    var params = normalize(input);
    var graph = makeGraph(params.example);
    var edges = cloneEdges(graph.edges);
    var states = [];
    var iteration = 0;

    for (;;) {
      var search = findPath(graph, edges, params.rule);
      states.push({
        augment: search.bottleneck,
        cut: cutCapacity(graph, edges, search.reachable),
        cutEdges: crossingEdges(graph, edges, search.reachable),
        edges: cloneEdges(edges),
        flow: flowValue(graph, edges),
        order: search.order.slice(),
        path: search.path ? search.path.slice() : null,
        reachable: search.reachable.slice(),
        residualArcs: search.arcs.slice(),
        terminal: !search.path
      });
      if (!search.path) break;
      applyPath(edges, search.path, search.bottleneck);
      iteration += 1;
      if (iteration > 100) throw new Error("max-flow simulation did not terminate");
    }

    var finalState = states[states.length - 1];
    return {
      graph: graph,
      params: params,
      states: states,
      summary: {
        augmentations: states.length - 1,
        cut: finalState.cut,
        flow: finalState.flow,
        maxStep: states.length - 1,
        rule: params.rule
      }
    };
  }

  function checkFlow(graph, edges) {
    var balance = graph.nodes.map(function () { return 0; });
    var capacityOk = true;
    edges.forEach(function (edge) {
      if (edge.flow < -1e-9 || edge.flow - edge.capacity > 1e-9) capacityOk = false;
      balance[edge.from] -= edge.flow;
      balance[edge.to] += edge.flow;
    });
    var conservationOk = balance.every(function (value, i) {
      return i === graph.source || i === graph.sink || Math.abs(value) < 1e-9;
    });
    return { capacityOk: capacityOk, conservationOk: conservationOk, balance: balance };
  }

  function bruteForceMinCut(graph, edges) {
    var n = graph.nodes.length;
    var best = Infinity;
    var bestMask = 0;
    for (var mask = 0; mask < (1 << n); mask += 1) {
      if (((mask >> graph.source) & 1) !== 1) continue;
      if (((mask >> graph.sink) & 1) !== 0) continue;
      var reachable = graph.nodes.map(function (_, i) { return ((mask >> i) & 1) === 1; });
      var cap = cutCapacity(graph, edges, reachable);
      if (cap < best) {
        best = cap;
        bestMask = mask;
      }
    }
    return { capacity: best, mask: bestMask };
  }

  function auditResult(result) {
    var phaseChecks = result.states.every(function (state) {
      var flowCheck = checkFlow(result.graph, state.edges);
      if (!flowCheck.capacityOk || !flowCheck.conservationOk) return false;
      if (state.path) {
        var bottleneck = state.path.reduce(function (min, arc) { return Math.min(min, arc.residual); }, Infinity);
        if (bottleneck !== state.augment) return false;
        return state.path.every(function (arc) { return arc.residual > 0; });
      }
      return true;
    });
    var finalState = result.states[result.states.length - 1];
    var minCut = bruteForceMinCut(result.graph, result.graph.edges);
    var terminalNoPath = finalState.terminal && finalState.reachable[result.graph.sink] === false;
    var equality = finalState.flow === finalState.cut && finalState.cut === minCut.capacity;
    return {
      passed: phaseChecks && terminalNoPath && equality,
      equality: equality,
      minCut: minCut.capacity,
      phaseChecks: phaseChecks,
      terminalNoPath: terminalNoPath
    };
  }

  function evaluate(input) {
    var result = runMaxFlow(input);
    result.audit = auditResult(result);
    return result;
  }

  function auditResidualFlowLab() {
    var total = 0;
    var passed = 0;
    var rows = [];
    Object.keys(EXAMPLES).forEach(function (example) {
      ["bfs", "dfs", "widest"].forEach(function (rule) {
        total += 1;
        var result = evaluate({ example: example, rule: rule });
        var finalState = result.states[result.states.length - 1];
        if (result.audit.passed) passed += 1;
        rows.push({
          augmentations: result.summary.augmentations,
          cut: result.summary.cut,
          example: example,
          failedChecks: Object.keys(result.audit).filter(function (key) {
            return key !== "passed" && result.audit[key] === false;
          }),
          flow: result.summary.flow,
          graph: result.graph.label,
          minCut: result.audit.minCut,
          passed: result.audit.passed,
          phaseChecks: result.audit.phaseChecks,
          reachableCount: finalState.reachable.filter(Boolean).length,
          rule: rule,
          terminalNoPath: result.audit.terminalNoPath
        });
      });
    });
    return { cases: rows, passed: passed, total: total };
  }

  function fmt(value) {
    return String(value);
  }

  function metric(root, name, value) {
    var node = root.querySelector('[data-metric="' + name + '"]');
    if (node) node.textContent = value;
  }

  function scale(width, height) {
    return function (node) {
      return {
        x: 38 + node.x * (width - 76),
        y: 34 + node.y * (height - 84)
      };
    };
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 900);
    var height = width < 620 ? 760 : 620;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
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
    text(ctx, title, box.x + 14, box.y + 12, COLORS.text, 13, 760);
    text(ctx, subtitle, box.x + 14, box.y + 31, COLORS.muted, 11, 500);
  }

  function arcKey(arc) {
    return arc.edgeIndex + ":" + arc.dir;
  }

  function drawArrow(ctx, from, to, color, width, label, bend) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    var nx = -dy / len;
    var ny = dx / len;
    var start = { x: from.x + dx / len * 21 + nx * bend, y: from.y + dy / len * 21 + ny * bend };
    var end = { x: to.x - dx / len * 24 + nx * bend, y: to.y - dy / len * 24 + ny * bend };
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    var angle = Math.atan2(end.y - start.y, end.x - start.x);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - 9 * Math.cos(angle - 0.45), end.y - 9 * Math.sin(angle - 0.45));
    ctx.lineTo(end.x - 9 * Math.cos(angle + 0.45), end.y - 9 * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
    if (label) {
      var lx = (start.x + end.x) / 2 + nx * 10;
      var ly = (start.y + end.y) / 2 + ny * 10;
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 1;
      var labelW = Math.max(34, label.length * 7 + 10);
      ctx.beginPath();
      ctx.roundRect(lx - labelW / 2, ly - 10, labelW, 20, 5);
      ctx.fill();
      ctx.stroke();
      text(ctx, label, lx, ly - 7, COLORS.text, 10, 700, "center");
    }
  }

  function drawNetwork(ctx, box, result, state) {
    panel(ctx, box, "flow network", state.terminal ? "no residual path reaches the sink" : "orange path is the next augmentation");
    var mapPoint = scale(box.w - 26, box.h - 58);
    var positions = result.graph.nodes.map(function (node) {
      var p = mapPoint(node);
      return { x: box.x + 13 + p.x, y: box.y + 46 + p.y };
    });
    var pathEdges = {};
    if (state.path) state.path.forEach(function (arc) { pathEdges[arc.edgeIndex] = true; });
    var cutSet = {};
    state.cutEdges.forEach(function (edge) { cutSet[edge.index] = true; });

    state.edges.forEach(function (edge) {
      var from = positions[edge.from];
      var to = positions[edge.to];
      var color = pathEdges[edge.index] ? COLORS.path : (cutSet[edge.index] && state.terminal ? COLORS.cut : COLORS.edge);
      var width = pathEdges[edge.index] ? 4 : (edge.flow > 0 ? 2.4 : 1.4);
      drawArrow(ctx, from, to, color, width, edge.flow + "/" + edge.capacity, 0);
    });

    if (state.terminal) {
      ctx.fillStyle = "rgba(190, 18, 60, 0.08)";
      result.graph.nodes.forEach(function (node, i) {
        if (state.reachable[i]) {
          var p = positions[i];
          ctx.beginPath();
          ctx.arc(p.x, p.y, 29, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    }

    result.graph.nodes.forEach(function (node, i) {
      var p = positions[i];
      ctx.fillStyle = i === result.graph.source ? COLORS.source : (i === result.graph.sink ? COLORS.sink : COLORS.white);
      ctx.strokeStyle = state.reachable[i] && state.terminal ? COLORS.cut : COLORS.rule;
      ctx.lineWidth = state.reachable[i] && state.terminal ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      text(ctx, node.id, p.x, p.y - 7, i === result.graph.source || i === result.graph.sink ? COLORS.white : COLORS.text, 12, 800, "center");
    });
  }

  function drawResidual(ctx, box, result, state) {
    panel(ctx, box, "residual ledger", "forward capacity plus backward undo capacity");
    var pathArcSet = {};
    if (state.path) state.path.forEach(function (arc) { pathArcSet[arcKey(arc)] = true; });
    var y = box.y + 60;
    var rowH = 22;
    var arcs = state.residualArcs.slice().sort(function (a, b) {
      return a.from - b.from || a.to - b.to || a.dir - b.dir;
    });
    arcs.slice(0, 17).forEach(function (arc, i) {
      var edge = state.edges[arc.edgeIndex];
      var from = result.graph.nodes[arc.from].id;
      var to = result.graph.nodes[arc.to].id;
      var chosen = pathArcSet[arcKey(arc)];
      var undoFrom = result.graph.nodes[edge.from].id;
      var undoTo = result.graph.nodes[edge.to].id;
      ctx.fillStyle = chosen ? "rgba(180,83,9,0.13)" : COLORS.panel;
      ctx.fillRect(box.x + 14, y + i * rowH - 2, box.w - 28, rowH - 3);
      text(ctx, from + " -> " + to, box.x + 22, y + i * rowH, chosen ? COLORS.path : COLORS.text, 11, 740);
      text(ctx, "res " + arc.residual, box.x + box.w - 70, y + i * rowH, chosen ? COLORS.path : COLORS.muted, 11, 700);
      if (arc.dir < 0) text(ctx, "undo " + undoFrom + "->" + undoTo, box.x + 94, y + i * rowH, COLORS.residual, 10, 600);
    });
    if (arcs.length > 17) text(ctx, "+" + (arcs.length - 17) + " more residual arcs", box.x + 22, box.y + box.h - 24, COLORS.muted, 10, 600);
  }

  function drawTimeline(ctx, box, result, selectedStep) {
    panel(ctx, box, "augmentation log", "each path raises flow by its bottleneck");
    var plot = { x: box.x + 46, y: box.y + 64, w: box.w - 76, h: box.h - 98 };
    var maxFlow = Math.max(1, result.summary.flow);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    for (var i = 0; i < result.states.length; i += 1) {
      var state = result.states[i];
      var x = plot.x + (i / Math.max(1, result.states.length - 1)) * plot.w;
      var y = plot.y + plot.h - (state.flow / maxFlow) * plot.h;
      ctx.fillStyle = i === selectedStep ? COLORS.path : (state.terminal ? COLORS.cut : COLORS.flow);
      ctx.beginPath();
      ctx.arc(x, y, i === selectedStep ? 6 : 4, 0, 2 * Math.PI);
      ctx.fill();
      if (i > 0) {
        var prev = result.states[i - 1];
        var px = plot.x + ((i - 1) / Math.max(1, result.states.length - 1)) * plot.w;
        var py = plot.y + plot.h - (prev.flow / maxFlow) * plot.h;
        ctx.strokeStyle = COLORS.flow;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
    text(ctx, "flow", box.x + 14, plot.y, COLORS.muted, 11, 600);
    text(ctx, "max " + result.summary.flow + " = cut " + result.summary.cut, plot.x + plot.w, box.y + box.h - 24, COLORS.cut, 11, 760, "right");
  }

  function draw(result, step, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    var state = result.states[step];
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    if (width < 620) {
      drawNetwork(ctx, { x: 14, y: 14, w: width - 28, h: 330 }, result, state);
      drawResidual(ctx, { x: 14, y: 360, w: width - 28, h: 238 }, result, state);
      drawTimeline(ctx, { x: 14, y: 614, w: width - 28, h: height - 630 }, result, step);
    } else {
      var leftW = Math.round(width * 0.63);
      drawNetwork(ctx, { x: 18, y: 18, w: leftW - 26, h: height - 36 }, result, state);
      drawResidual(ctx, { x: leftW, y: 18, w: width - leftW - 18, h: Math.round((height - 50) * 0.62) }, result, state);
      drawTimeline(ctx, { x: leftW, y: Math.round((height - 50) * 0.62) + 34, w: width - leftW - 18, h: height - Math.round((height - 50) * 0.62) - 52 }, result, step);
    }
  }

  function readControls(root) {
    var values = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      values[input.getAttribute("data-param")] = input.value;
    });
    return normalize(values);
  }

  function updateOutputs(root, result, step) {
    var params = result.params;
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (out) {
      var key = out.getAttribute("data-value");
      if (key === "example") out.textContent = result.graph.label;
      if (key === "rule") out.textContent = params.rule;
      if (key === "step") out.textContent = step + " / " + result.summary.maxStep;
    });
    var stepInput = root.querySelector('[data-param="step"]');
    if (stepInput) {
      stepInput.max = String(result.summary.maxStep);
      if (Number(stepInput.value) > result.summary.maxStep) stepInput.value = String(result.summary.maxStep);
    }
    metric(root, "flow", fmt(result.states[step].flow));
    metric(root, "augment", result.states[step].terminal ? "none" : "+" + result.states[step].augment);
    metric(root, "final", fmt(result.summary.flow));
    metric(root, "cut", fmt(result.summary.cut));
    metric(root, "steps", fmt(result.summary.augmentations));
    metric(root, "audit", result.audit.passed ? "passes" : "fails");
  }

  function init(root) {
    var canvas = root.querySelector("canvas");
    if (!canvas) return;
    var pending = false;
    var cachedKey = "";
    var cachedResult = null;

    function render() {
      pending = false;
      var params = readControls(root);
      var key = params.example + ":" + params.rule;
      if (key !== cachedKey) {
        cachedResult = evaluate(params);
        cachedKey = key;
      }
      var step = clamp(params.step, 0, cachedResult.summary.maxStep);
      root.__residualFlowResult = cachedResult;
      updateOutputs(root, cachedResult, step);
      draw(cachedResult, step, canvas);
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-residual-flow-lab]")).forEach(init);
  }

  var api = {
    auditResidualFlowLab: auditResidualFlowLab,
    evaluate: evaluate,
    findPath: findPath,
    makeGraph: makeGraph,
    runMaxFlow: runMaxFlow
  };

  global.ResidualFlowLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
