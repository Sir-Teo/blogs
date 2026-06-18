(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    edge: "#cbd5df",
    tree: "#2563eb",
    back: "#b45309",
    cross: "#94a3b8",
    stack: "#0f766e",
    root: "#be123c",
    component: ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#be123c", "#0891b2", "#65a30d", "#475569"],
    paleStack: "rgba(15, 118, 110, 0.13)",
    paleTree: "rgba(37, 99, 235, 0.12)",
    paleBack: "rgba(180, 83, 9, 0.14)",
    paleRoot: "rgba(190, 18, 60, 0.12)",
    paleComponent: "rgba(124, 58, 237, 0.12)"
  };

  var EXAMPLES = {
    bowtie: {
      label: "bow-tie loops",
      nodes: ["a", "b", "c", "d", "e", "f", "g"],
      edges: [
        [0, 1], [1, 2], [2, 0],
        [2, 3], [3, 4], [4, 3],
        [4, 5], [5, 6], [6, 5],
        [1, 5]
      ]
    },
    compiler: {
      label: "module imports",
      nodes: ["lexer", "parser", "ast", "types", "check", "ir", "emit", "util"],
      edges: [
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 2],
        [4, 5], [5, 6], [6, 5], [6, 7], [7, 3]
      ]
    },
    dag: {
      label: "plain DAG",
      nodes: ["ingest", "parse", "plan", "run", "flush", "metrics"],
      edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 5]]
    },
    nested: {
      label: "nested escape",
      nodes: ["p", "q", "r", "s", "t", "u", "v"],
      edges: [
        [0, 1], [1, 2], [2, 1],
        [2, 3], [3, 4], [4, 3],
        [4, 5], [5, 6], [6, 4],
        [6, 0]
      ]
    }
  };

  var DEFAULTS = {
    example: "bowtie",
    step: 0
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
      step: Math.round(clamp(finite(Number(raw.step), DEFAULTS.step), 0, 10000))
    };
  }

  function makeGraph(key) {
    var spec = EXAMPLES[key] || EXAMPLES.bowtie;
    return graphFromSpec(spec.nodes, spec.edges, spec.label, key);
  }

  function graphFromSpec(nodes, edgePairs, label, key) {
    var adj = nodes.map(function () { return []; });
    var edges = edgePairs.map(function (edge) {
      return { from: edge[0], to: edge[1] };
    });
    edges.forEach(function (edge) {
      if (edge.from >= 0 && edge.from < nodes.length && edge.to >= 0 && edge.to < nodes.length) {
        adj[edge.from].push(edge.to);
      }
    });
    adj.forEach(function (row) {
      row.sort(function (a, b) { return a - b; });
    });
    return {
      key: key || "custom",
      label: label || "custom graph",
      nodes: nodes.slice(),
      edges: edges,
      adj: adj
    };
  }

  function cloneState(index, low, onStack, stack, components) {
    return {
      index: index.slice(),
      low: low.slice(),
      onStack: onStack.slice(),
      stack: stack.slice(),
      components: components.map(function (component) { return component.slice(); })
    };
  }

  function runTarjan(graph) {
    var n = graph.nodes.length;
    var index = new Array(n).fill(-1);
    var low = new Array(n).fill(-1);
    var onStack = new Array(n).fill(false);
    var stack = [];
    var components = [];
    var events = [];
    var time = 0;
    var edgeKinds = {};

    function push(type, detail) {
      events.push(Object.assign({
        type: type,
        step: events.length,
        state: cloneState(index, low, onStack, stack, components)
      }, detail || {}));
    }

    function strongconnect(v) {
      index[v] = time;
      low[v] = time;
      time += 1;
      stack.push(v);
      onStack[v] = true;
      push("discover", { v: v, message: "discover " + graph.nodes[v] });

      graph.adj[v].forEach(function (w) {
        if (index[w] < 0) {
          edgeKinds[v + ":" + w] = "tree";
          push("tree", { v: v, w: w, message: graph.nodes[v] + " -> " + graph.nodes[w] + " enters DFS" });
          strongconnect(w);
          var before = low[v];
          low[v] = Math.min(low[v], low[w]);
          push("low", {
            v: v,
            w: w,
            before: before,
            after: low[v],
            message: "return to " + graph.nodes[v] + ", low = min(" + before + ", " + low[w] + ")"
          });
        } else if (onStack[w]) {
          edgeKinds[v + ":" + w] = "back";
          var old = low[v];
          low[v] = Math.min(low[v], index[w]);
          push("back", {
            v: v,
            w: w,
            before: old,
            after: low[v],
            message: graph.nodes[v] + " sees stack edge to " + graph.nodes[w]
          });
        } else {
          edgeKinds[v + ":" + w] = "cross";
          push("cross", {
            v: v,
            w: w,
            message: graph.nodes[v] + " points to a closed component"
          });
        }
      });

      if (low[v] === index[v]) {
        push("root", { v: v, message: graph.nodes[v] + " is an SCC root" });
        var component = [];
        var w;
        do {
          w = stack.pop();
          onStack[w] = false;
          component.push(w);
          push("pop", { v: v, w: w, component: component.slice(), message: "pop " + graph.nodes[w] });
        } while (w !== v);
        components.push(component.slice());
        push("component", { v: v, component: component.slice(), message: "emit {" + component.map(function (x) { return graph.nodes[x]; }).join(", ") + "}" });
      }
    }

    for (var v = 0; v < n; v += 1) {
      if (index[v] < 0) strongconnect(v);
    }

    push("done", { message: "all components emitted" });
    return {
      index: index,
      low: low,
      components: components,
      events: events,
      edgeKinds: edgeKinds
    };
  }

  function reachableFrom(graph, start) {
    var seen = new Array(graph.nodes.length).fill(false);
    var stack = [start];
    seen[start] = true;
    while (stack.length) {
      var v = stack.pop();
      graph.adj[v].forEach(function (w) {
        if (!seen[w]) {
          seen[w] = true;
          stack.push(w);
        }
      });
    }
    return seen;
  }

  function oracleScc(graph) {
    var n = graph.nodes.length;
    var reach = [];
    for (var v = 0; v < n; v += 1) reach[v] = reachableFrom(graph, v);
    var assigned = new Array(n).fill(false);
    var components = [];
    for (v = 0; v < n; v += 1) {
      if (assigned[v]) continue;
      var component = [];
      for (var w = 0; w < n; w += 1) {
        if (reach[v][w] && reach[w][v]) {
          component.push(w);
          assigned[w] = true;
        }
      }
      components.push(component);
    }
    return {
      reach: reach,
      components: components
    };
  }

  function canonicalComponents(components) {
    return components.map(function (component) {
      return component.slice().sort(function (a, b) { return a - b; }).join(",");
    }).sort().join("|");
  }

  function componentId(components, n) {
    var ids = new Array(n).fill(-1);
    components.forEach(function (component, id) {
      component.forEach(function (v) {
        ids[v] = id;
      });
    });
    return ids;
  }

  function condensationEdges(graph, components) {
    var ids = componentId(components, graph.nodes.length);
    var seen = {};
    var edges = [];
    graph.edges.forEach(function (edge) {
      var a = ids[edge.from];
      var b = ids[edge.to];
      if (a === b) return;
      var key = a + ":" + b;
      if (!seen[key]) {
        seen[key] = true;
        edges.push({ from: a, to: b });
      }
    });
    return edges;
  }

  function condensationAcyclic(graph, components) {
    var c = components.length;
    var edges = condensationEdges(graph, components);
    var adj = new Array(c).fill(0).map(function () { return []; });
    edges.forEach(function (edge) {
      adj[edge.from].push(edge.to);
    });
    var color = new Array(c).fill(0);
    var ok = true;
    function dfs(v) {
      color[v] = 1;
      adj[v].forEach(function (w) {
        if (color[w] === 1) ok = false;
        else if (color[w] === 0) dfs(w);
      });
      color[v] = 2;
    }
    for (var v = 0; v < c; v += 1) if (color[v] === 0) dfs(v);
    return ok;
  }

  function verifyResult(graph, result, oracle) {
    var issues = [];
    var n = graph.nodes.length;
    var seen = new Array(n).fill(false);
    var vertexPartitionOk = true;

    result.components.forEach(function (component, i) {
      if (component.length === 0) {
        vertexPartitionOk = false;
        issues.push("component " + i + " is empty");
      }
      component.forEach(function (v) {
        if (seen[v]) {
          vertexPartitionOk = false;
          issues.push("vertex " + v + " appears twice");
        }
        seen[v] = true;
      });
    });
    seen.forEach(function (hit, v) {
      if (!hit) {
        vertexPartitionOk = false;
        issues.push("vertex " + v + " is missing");
      }
    });

    var partitionMatchesOracle = canonicalComponents(result.components) === canonicalComponents(oracle.components);
    if (!partitionMatchesOracle) {
      issues.push("Tarjan partition does not match reachability oracle");
    }

    var componentsStronglyConnected = true;
    result.components.forEach(function (component) {
      for (var i = 0; i < component.length; i += 1) {
        for (var j = 0; j < component.length; j += 1) {
          if (!oracle.reach[component[i]][component[j]]) {
            componentsStronglyConnected = false;
            issues.push("component is not strongly connected");
          }
        }
      }
    });

    var condensationDag = condensationAcyclic(graph, result.components);
    if (!condensationDag) issues.push("condensation graph has a cycle");
    var lowlinksInRange = true;
    result.index.forEach(function (idx, v) {
      if (idx < 0) {
        lowlinksInRange = false;
        issues.push("vertex " + v + " was never indexed");
      }
      if (result.low[v] < 0 || result.low[v] > idx) {
        lowlinksInRange = false;
        issues.push("vertex " + v + " lowlink out of range");
      }
    });
    var checks = [
      { name: "vertices-appear-once", ok: vertexPartitionOk },
      { name: "partition-matches-oracle", ok: partitionMatchesOracle },
      { name: "components-strongly-connected", ok: componentsStronglyConnected },
      { name: "condensation-is-dag", ok: condensationDag },
      { name: "lowlinks-in-index-range", ok: lowlinksInRange }
    ];

    return {
      ok: issues.length === 0,
      checks: checks,
      issues: issues
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var graph = makeGraph(params.example);
    var result = runTarjan(graph);
    var oracle = oracleScc(graph);
    var audit = verifyResult(graph, result, oracle);
    var step = clamp(params.step, 0, Math.max(0, result.events.length - 1));
    return {
      params: params,
      graph: graph,
      result: result,
      oracle: oracle,
      audit: audit,
      step: step
    };
  }

  function auditTarjanScc() {
    var issues = [];
    var cases = [];
    Object.keys(EXAMPLES).forEach(function (key) {
      var state = evaluate({ example: key });
      var failedChecks = failedAuditChecks(state.audit.checks);
      if (!state.audit.ok) {
        state.audit.issues.forEach(function (issue) {
          issues.push(key + ": " + issue);
        });
      }
      cases.push({
        example: key,
        label: state.graph.label,
        nodes: state.graph.nodes.length,
        edges: state.graph.edges.length,
        components: state.result.components.length,
        events: state.result.events.length,
        maxStackDepth: state.result.events.reduce(function (max, event) {
          return Math.max(max, event.state.stack.length);
        }, 0),
        condensationEdges: condensationEdges(state.graph, state.result.components).length,
        passed: failedChecks.length === 0,
        passedChecks: state.audit.checks.length - failedChecks.length,
        totalChecks: state.audit.checks.length,
        checks: state.audit.checks,
        failedChecks: failedChecks,
        issues: state.audit.issues
      });
    });

    var exhaustiveCases = 0;
    var exhaustiveIssues = [];
    var exhaustiveBySize = [];
    var exhaustivePassedChecks = 0;
    var exhaustiveTotalChecks = 0;
    for (var n = 1; n <= 4; n += 1) {
      var edgeSlots = n * n;
      var total = Math.pow(2, edgeSlots);
      var nodes = [];
      for (var i = 0; i < n; i += 1) nodes.push("v" + i);
      var sizeIssues = 0;
      var sizePassedChecks = 0;
      var sizeTotalChecks = 0;
      for (var mask = 0; mask < total; mask += 1) {
        var edges = [];
        for (var bit = 0; bit < edgeSlots; bit += 1) {
          if (mask & (1 << bit)) edges.push([Math.floor(bit / n), bit % n]);
        }
        var graph = graphFromSpec(nodes, edges, "exhaustive " + n);
        var result = runTarjan(graph);
        var oracle = oracleScc(graph);
        var audit = verifyResult(graph, result, oracle);
        exhaustiveCases += 1;
        var graphPassedChecks = audit.checks.filter(function (check) { return check.ok; }).length;
        exhaustivePassedChecks += graphPassedChecks;
        exhaustiveTotalChecks += audit.checks.length;
        sizePassedChecks += graphPassedChecks;
        sizeTotalChecks += audit.checks.length;
        if (!audit.ok) {
          var issue = n + "-node mask " + mask + ": " + audit.issues.join("; ");
          issues.push(issue);
          exhaustiveIssues.push(issue);
          sizeIssues += 1;
        }
      }
      exhaustiveBySize.push({
        nodes: n,
        cases: total,
        failed: sizeIssues,
        passed: sizeIssues === 0,
        passedChecks: sizePassedChecks,
        totalChecks: sizeTotalChecks
      });
    }

    var exhaustive = {
      bySize: exhaustiveBySize,
      checked: exhaustiveCases,
      failedChecks: exhaustiveIssues,
      passed: exhaustiveIssues.length === 0,
      passedChecks: exhaustivePassedChecks,
      totalChecks: exhaustiveTotalChecks
    };
    var byComponentCountMap = {};
    cases.forEach(function (row) {
      var key = String(row.components);
      if (!byComponentCountMap[key]) {
        byComponentCountMap[key] = {
          components: row.components,
          cases: 0,
          graphs: [],
          maxCondensationEdges: 0,
          maxStackDepth: 0,
          passed: 0,
          passedChecks: 0,
          totalChecks: 0
        };
      }
      byComponentCountMap[key].cases += 1;
      byComponentCountMap[key].graphs.push(row.example);
      byComponentCountMap[key].maxCondensationEdges = Math.max(byComponentCountMap[key].maxCondensationEdges, row.condensationEdges);
      byComponentCountMap[key].maxStackDepth = Math.max(byComponentCountMap[key].maxStackDepth, row.maxStackDepth);
      if (row.passed) byComponentCountMap[key].passed += 1;
      byComponentCountMap[key].passedChecks += row.passedChecks;
      byComponentCountMap[key].totalChecks += row.totalChecks;
    });
    var byComponentCount = Object.keys(byComponentCountMap).sort(function (a, b) {
      return Number(a) - Number(b);
    }).map(function (key) {
      var group = byComponentCountMap[key];
      group.graphs = group.graphs.join(", ");
      return group;
    });
    var passed = cases.filter(function (row) { return row.passed; }).length + (exhaustive.passed ? 1 : 0);
    var total = cases.length + 1;
    var passedChecks = cases.reduce(function (sum, row) { return sum + row.passedChecks; }, 0) + exhaustive.passedChecks;
    var totalChecks = cases.reduce(function (sum, row) { return sum + row.totalChecks; }, 0) + exhaustive.totalChecks;

    return {
      ok: issues.length === 0,
      byComponentCount: byComponentCount,
      cases: cases,
      details: cases,
      exhaustive: exhaustive,
      issues: issues,
      passed: passed,
      passedChecks: passedChecks,
      reports: cases,
      total: total,
      totalChecks: totalChecks,
      exhaustiveCases: exhaustiveCases
    };
  }

  function failedAuditChecks(checks) {
    return checks.filter(function (check) { return !check.ok; }).map(function (check) { return check.name; });
  }

  function compact(value, limit) {
    value = String(value);
    if (value.length <= limit) return value;
    return value.slice(0, Math.max(0, limit - 1)) + "...";
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

  function text(ctx, value, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.font = (weight || 600) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(String(value), x, y);
    ctx.textAlign = "left";
  }

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    text(ctx, title, box.x + 14, box.y + 25, 14, COLORS.text, 800);
  }

  function layoutNodes(graph, box) {
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2 + 8;
    var radius = Math.min(box.w, box.h) * 0.34;
    return graph.nodes.map(function (_, i) {
      var angle = -Math.PI / 2 + Math.PI * 2 * i / graph.nodes.length;
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      };
    });
  }

  function drawArrow(ctx, from, to, color, width, dash) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len;
    var uy = dy / len;
    var start = { x: from.x + ux * 22, y: from.y + uy * 22 };
    var end = { x: to.x - ux * 24, y: to.y - uy * 24 };
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 1.5;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    var a = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - Math.cos(a - 0.45) * 9, end.y - Math.sin(a - 0.45) * 9);
    ctx.lineTo(end.x - Math.cos(a + 0.45) * 9, end.y - Math.sin(a + 0.45) * 9);
    ctx.closePath();
    ctx.fill();
  }

  function eventEdge(event) {
    if (!event || typeof event.v !== "number" || typeof event.w !== "number") return null;
    return event.v + ":" + event.w;
  }

  function eventMessage(state, event) {
    if (!event) return "no event";
    return event.message || event.type;
  }

  function drawGraph(ctx, state, box) {
    var graph = state.graph;
    var event = state.result.events[state.step];
    var snapshot = event ? event.state : state.result.events[state.result.events.length - 1].state;
    var pos = layoutNodes(graph, box);
    var activeEdge = eventEdge(event);
    var ids = componentId(snapshot.components, graph.nodes.length);
    panel(ctx, box, "directed graph and lowlink stack");

    graph.edges.forEach(function (edge) {
      var key = edge.from + ":" + edge.to;
      var kind = state.result.edgeKinds[key] || "edge";
      var color = key === activeEdge ? (kind === "back" ? COLORS.back : kind === "tree" ? COLORS.tree : COLORS.cross) : COLORS.edge;
      var width = key === activeEdge ? 3.2 : 1.5;
      if (edge.from === edge.to) {
        var p = pos[edge.from];
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(p.x + 18, p.y - 18, 13, 0.2, Math.PI * 1.85);
        ctx.stroke();
        return;
      }
      drawArrow(ctx, pos[edge.from], pos[edge.to], color, width, kind === "cross" ? [5, 4] : []);
    });

    graph.nodes.forEach(function (label, i) {
      var inStack = snapshot.onStack[i];
      var discovered = snapshot.index[i] >= 0;
      var comp = ids[i];
      ctx.fillStyle = inStack ? COLORS.paleStack : comp >= 0 ? "rgba(124, 58, 237, 0.08)" : discovered ? COLORS.panel : COLORS.white;
      ctx.strokeStyle = inStack ? COLORS.stack : comp >= 0 ? COLORS.component[comp % COLORS.component.length] : COLORS.rule;
      ctx.lineWidth = inStack || comp >= 0 ? 2.4 : 1.3;
      ctx.beginPath();
      ctx.arc(pos[i].x, pos[i].y, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      text(ctx, compact(label, 8), pos[i].x, pos[i].y - 2, 11, COLORS.text, 800, "center");
      var idx = snapshot.index[i] >= 0 ? snapshot.index[i] : "-";
      var low = snapshot.low[i] >= 0 ? snapshot.low[i] : "-";
      text(ctx, idx + "/" + low, pos[i].x, pos[i].y + 14, 10, COLORS.muted, 700, "center");
    });

    text(ctx, "label = index/lowlink", box.x + 14, box.y + box.h - 18, 11, COLORS.muted, 650);
  }

  function drawStack(ctx, state, box) {
    var event = state.result.events[state.step];
    var snapshot = event ? event.state : state.result.events[state.result.events.length - 1].state;
    panel(ctx, box, "stack and event ledger");
    text(ctx, eventMessage(state, event), box.x + 16, box.y + 56, 17, event && event.type === "root" ? COLORS.root : COLORS.text, 800);
    text(ctx, "event " + state.step + " / " + (state.result.events.length - 1), box.x + 16, box.y + 84, 12, COLORS.muted, 700);

    var y = box.y + 122;
    if (snapshot.stack.length === 0) {
      text(ctx, "stack is empty", box.x + 16, y, 12, COLORS.muted, 650);
    }
    snapshot.stack.forEach(function (v, i) {
      ctx.fillStyle = COLORS.paleStack;
      ctx.strokeStyle = COLORS.stack;
      ctx.lineWidth = 1;
      ctx.fillRect(box.x + 16, y - 18, box.w - 32, 24);
      ctx.strokeRect(box.x + 16, y - 18, box.w - 32, 24);
      text(ctx, i, box.x + 28, y, 11, COLORS.muted, 700);
      text(ctx, state.graph.nodes[v], box.x + 58, y, 12, COLORS.text, 750);
      text(ctx, "idx " + snapshot.index[v] + ", low " + snapshot.low[v], box.x + box.w - 122, y, 11, COLORS.muted, 650);
      y += 30;
    });

    y = Math.max(y + 10, box.y + box.h - 86);
    text(ctx, "components emitted", box.x + 16, y, 12, COLORS.muted, 800);
    y += 24;
    snapshot.components.slice(-4).forEach(function (component, i) {
      var color = COLORS.component[(snapshot.components.length - 1 - i) % COLORS.component.length];
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(box.x + 16, y - 17, box.w - 32, 22);
      ctx.globalAlpha = 1;
      text(ctx, component.map(function (v) { return state.graph.nodes[v]; }).join(", "), box.x + 26, y, 11, COLORS.text, 650);
      y += 26;
    });
  }

  function drawLowlinkTable(ctx, state, box) {
    var event = state.result.events[state.step];
    var snapshot = event ? event.state : state.result.events[state.result.events.length - 1].state;
    panel(ctx, box, "discovery table");
    var x = box.x + 18;
    var y = box.y + 54;
    text(ctx, "node", x, y, 11, COLORS.muted, 800);
    text(ctx, "index", x + 120, y, 11, COLORS.muted, 800);
    text(ctx, "low", x + 190, y, 11, COLORS.muted, 800);
    text(ctx, "state", x + 252, y, 11, COLORS.muted, 800);
    y += 23;
    state.graph.nodes.forEach(function (name, v) {
      var status = snapshot.onStack[v] ? "open" : snapshot.index[v] >= 0 ? "closed" : "unseen";
      var isFocus = event && (event.v === v || event.w === v);
      if (isFocus) {
        ctx.fillStyle = COLORS.paleBack;
        ctx.fillRect(box.x + 12, y - 16, box.w - 24, 21);
      }
      text(ctx, name, x, y, 11, COLORS.text, 700);
      text(ctx, snapshot.index[v] >= 0 ? snapshot.index[v] : "-", x + 128, y, 11, COLORS.text, 700);
      text(ctx, snapshot.low[v] >= 0 ? snapshot.low[v] : "-", x + 198, y, 11, COLORS.text, 700);
      text(ctx, status, x + 252, y, 11, status === "open" ? COLORS.stack : COLORS.muted, 700);
      y += 23;
    });
  }

  function drawCondensation(ctx, state, box) {
    panel(ctx, box, "component DAG");
    var comps = state.result.components;
    var edges = condensationEdges(state.graph, comps);
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2 + 12;
    var radius = Math.min(box.w, box.h) * 0.30;
    var pos = comps.map(function (_, i) {
      var angle = -Math.PI / 2 + Math.PI * 2 * i / Math.max(1, comps.length);
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      };
    });
    edges.forEach(function (edge) {
      if (edge.from === edge.to) return;
      drawArrow(ctx, pos[edge.from], pos[edge.to], COLORS.cross, 1.7, [4, 4]);
    });
    comps.forEach(function (component, i) {
      ctx.fillStyle = "rgba(124, 58, 237, 0.10)";
      ctx.strokeStyle = COLORS.component[i % COLORS.component.length];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos[i].x, pos[i].y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      text(ctx, "C" + i, pos[i].x, pos[i].y + 3, 12, COLORS.text, 850, "center");
      text(ctx, component.map(function (v) { return state.graph.nodes[v]; }).join(","), pos[i].x, pos[i].y + 39, 10, COLORS.muted, 650, "center");
    });
    text(ctx, edges.length + " inter-component edges; DAG audit " + (condensationAcyclic(state.graph, comps) ? "passes" : "fails"), box.x + 14, box.y + box.h - 16, 11, COLORS.muted, 650);
  }

  function draw(canvas, state) {
    var width = 1080;
    var height = 720;
    var ctx = setCanvasSize(canvas, width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);
    drawGraph(ctx, state, { x: 24, y: 24, w: 560, h: 430 });
    drawStack(ctx, state, { x: 608, y: 24, w: 448, h: 430 });
    drawLowlinkTable(ctx, state, { x: 24, y: 478, w: 500, h: 218 });
    drawCondensation(ctx, state, { x: 548, y: 478, w: 508, h: 218 });
  }

  function updateOutputs(root, state) {
    root.querySelectorAll("output[data-value]").forEach(function (output) {
      var name = output.getAttribute("data-value");
      if (name === "example") output.textContent = state.graph.label;
      if (name === "step") output.textContent = state.step + " / " + Math.max(0, state.result.events.length - 1);
    });
    setText(root, "nodes", state.graph.nodes.length);
    setText(root, "edges", state.graph.edges.length);
    setText(root, "components", state.result.components.length);
    setText(root, "events", state.result.events.length);
    setText(root, "stack", (state.result.events[state.step] || state.result.events[0]).state.stack.length);
    setText(root, "dag", condensationEdges(state.graph, state.result.components).length);
    setText(root, "audit", state.audit.ok ? "passes" : "fails");
  }

  function mount(root) {
    var controls = root.querySelectorAll("[data-param]");
    var canvas = root.querySelector("canvas");
    var uiState = normalize({});

    controls.forEach(function (control) {
      var name = control.getAttribute("data-param");
      control.value = uiState[name];
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
      uiState.step = state.step;
      controls.forEach(function (control) {
        var name = control.getAttribute("data-param");
        if (name === "step") {
          control.max = Math.max(0, state.result.events.length - 1);
          control.value = state.step;
        } else {
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
    global.document.querySelectorAll("[data-tarjan-scc-lab]").forEach(function (root) {
      mount(root);
    });
  }

  var api = {
    EXAMPLES: EXAMPLES,
    makeGraph: makeGraph,
    graphFromSpec: graphFromSpec,
    runTarjan: runTarjan,
    oracleScc: oracleScc,
    condensationEdges: condensationEdges,
    condensationAcyclic: condensationAcyclic,
    verifyResult: verifyResult,
    evaluate: evaluate,
    auditTarjanScc: auditTarjanScc
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.TarjanSccLab = api;
    if (global.document) {
      if (global.document.readyState === "loading") {
        global.document.addEventListener("DOMContentLoaded", mountAll);
      } else {
        mountAll();
      }
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
