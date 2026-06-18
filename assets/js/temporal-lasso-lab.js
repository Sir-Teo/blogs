(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    safety: "#be123c",
    safe: "#0f766e",
    live: "#2563eb",
    fairness: "#7c3aed",
    outage: "#b45309",
    node: "#ffffff",
    edge: "#94a3b8",
    cycle: "#f59e0b",
    white: "#ffffff"
  };

  var DEFAULTS = {
    conflict: "on",
    fairness: "none",
    outage: "off",
    skip: "on"
  };

  var OPTIONS = {
    conflict: ["off", "on"],
    fairness: ["none", "weak"],
    outage: ["off", "on"],
    skip: ["off", "on"]
  };

  var SAFETY_POS = {
    idle: { x: 0.50, y: 0.18 },
    north: { x: 0.26, y: 0.56 },
    east: { x: 0.74, y: 0.56 },
    both: { x: 0.50, y: 0.84 }
  };

  var LIVE_POS = {
    idle: { x: 0.20, y: 0.52 },
    pending: { x: 0.55, y: 0.34 },
    outage: { x: 0.78, y: 0.70 }
  };

  function cleanParams(raw) {
    raw = raw || {};
    var out = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      var value = String(raw[key] == null ? DEFAULTS[key] : raw[key]);
      out[key] = OPTIONS[key].indexOf(value) >= 0 ? value : DEFAULTS[key];
    });
    return out;
  }

  function safetyGraph(params) {
    var edges = [
      { from: "idle", to: "north", label: "NS green" },
      { from: "idle", to: "east", label: "EW green" },
      { from: "north", to: "idle", label: "NS red" },
      { from: "east", to: "idle", label: "EW red" }
    ];
    if (params.conflict === "on") {
      edges.push({ from: "north", to: "both", label: "bad switch", bad: true });
      edges.push({ from: "east", to: "both", label: "bad switch", bad: true });
      edges.push({ from: "both", to: "idle", label: "reset" });
    }
    return {
      bad: function (state) { return state === "both"; },
      edges: edges,
      initial: "idle",
      states: ["idle", "north", "east"].concat(params.conflict === "on" ? ["both"] : [])
    };
  }

  function liveGraph(params) {
    var edges = [
      { event: "idle", from: "idle", to: "idle", label: "wait" },
      { event: "request", from: "idle", to: "pending", label: "request" },
      { event: "grant", from: "pending", to: "idle", label: "grant" }
    ];
    if (params.skip === "on") {
      edges.push({ event: "skip", from: "pending", to: "pending", label: "skip" });
    }
    if (params.outage === "on") {
      edges.push({ event: "outage", from: "pending", to: "outage", label: "outage" });
      edges.push({ event: "wait", from: "outage", to: "outage", label: "wait" });
    }
    return {
      edges: edges,
      grantEnabled: function (state) { return state === "pending"; },
      initial: "idle",
      states: ["idle", "pending"].concat(params.outage === "on" ? ["outage"] : [])
    };
  }

  function outgoing(edges, state) {
    return edges.filter(function (edge) { return edge.from === state; });
  }

  function bfsBadPrefix(graph) {
    var queue = [{ state: graph.initial, path: [] }];
    var seen = {};
    seen[graph.initial] = true;

    while (queue.length) {
      var item = queue.shift();
      if (graph.bad(item.state)) {
        return {
          found: true,
          path: item.path,
          states: pathStates(graph.initial, item.path),
          terminal: item.state
        };
      }
      outgoing(graph.edges, item.state).forEach(function (edge) {
        if (seen[edge.to]) return;
        seen[edge.to] = true;
        queue.push({ state: edge.to, path: item.path.concat([edge]) });
      });
    }

    return {
      found: false,
      path: [],
      states: [graph.initial],
      terminal: graph.initial
    };
  }

  function productKey(node) {
    return node.state + "|" + (node.owed ? "1" : "0");
  }

  function parseProductKey(key) {
    var parts = key.split("|");
    return { state: parts[0], owed: parts[1] === "1" };
  }

  function stepOwed(owed, event) {
    if (event === "grant") return false;
    if (event === "request") return true;
    return owed;
  }

  function productGraph(graph) {
    var initial = { state: graph.initial, owed: false };
    var initialKey = productKey(initial);
    var queue = [initial];
    var nodes = {};
    var edges = [];
    var predecessor = {};
    nodes[initialKey] = initial;

    while (queue.length) {
      var node = queue.shift();
      var fromKey = productKey(node);
      outgoing(graph.edges, node.state).forEach(function (edge) {
        var next = { state: edge.to, owed: stepOwed(node.owed, edge.event) };
        var toKey = productKey(next);
        var productEdge = {
          event: edge.event,
          from: fromKey,
          label: edge.label,
          raw: edge,
          to: toKey
        };
        edges.push(productEdge);
        if (!nodes[toKey]) {
          nodes[toKey] = next;
          predecessor[toKey] = { edge: productEdge, prev: fromKey };
          queue.push(next);
        }
      });
    }

    return {
      edges: edges,
      initial: initialKey,
      nodes: nodes,
      predecessor: predecessor
    };
  }

  function tarjan(nodes, edges) {
    var index = 0;
    var stack = [];
    var onStack = {};
    var meta = {};
    var components = [];
    var out = {};

    Object.keys(nodes).forEach(function (key) { out[key] = []; });
    edges.forEach(function (edge) {
      if (out[edge.from]) out[edge.from].push(edge);
    });

    function strongConnect(key) {
      meta[key] = { index: index, low: index };
      index += 1;
      stack.push(key);
      onStack[key] = true;

      out[key].forEach(function (edge) {
        var to = edge.to;
        if (!meta[to]) {
          strongConnect(to);
          meta[key].low = Math.min(meta[key].low, meta[to].low);
        } else if (onStack[to]) {
          meta[key].low = Math.min(meta[key].low, meta[to].index);
        }
      });

      if (meta[key].low === meta[key].index) {
        var component = [];
        var item;
        do {
          item = stack.pop();
          onStack[item] = false;
          component.push(item);
        } while (item !== key);
        components.push(component);
      }
    }

    Object.keys(nodes).forEach(function (key) {
      if (!meta[key]) strongConnect(key);
    });

    return components;
  }

  function pathStates(initial, path) {
    var states = [initial];
    path.forEach(function (edge) { states.push(edge.to); });
    return states;
  }

  function prefixTo(product, key) {
    var edges = [];
    var cursor = key;
    while (cursor !== product.initial) {
      var prev = product.predecessor[cursor];
      if (!prev) break;
      edges.push(prev.edge);
      cursor = prev.prev;
    }
    edges.reverse();
    return edges;
  }

  function findPathInside(start, goal, allowed, edges) {
    if (start === goal) return [];
    var queue = [{ key: start, path: [] }];
    var seen = {};
    seen[start] = true;

    while (queue.length) {
      var item = queue.shift();
      for (var i = 0; i < edges.length; i += 1) {
        var edge = edges[i];
        if (edge.from !== item.key || !allowed[edge.to]) continue;
        if (seen[edge.to]) continue;
        var path = item.path.concat([edge]);
        if (edge.to === goal) return path;
        seen[edge.to] = true;
        queue.push({ key: edge.to, path: path });
      }
    }
    return [];
  }

  function livenessLasso(graph, params) {
    var product = productGraph(graph);
    var nodes = {};
    var edges = [];

    Object.keys(product.nodes).forEach(function (key) {
      if (product.nodes[key].owed) nodes[key] = product.nodes[key];
    });

    product.edges.forEach(function (edge) {
      if (edge.event !== "grant" && nodes[edge.from] && nodes[edge.to]) edges.push(edge);
    });

    var components = tarjan(nodes, edges);
    var candidate = null;

    components.forEach(function (component) {
      if (candidate) return;
      var allowed = {};
      component.forEach(function (key) { allowed[key] = true; });
      var internal = edges.filter(function (edge) { return allowed[edge.from] && allowed[edge.to]; });
      var cyclic = component.length > 1 || internal.some(function (edge) { return edge.from === edge.to; });
      if (!cyclic) return;
      if (params.fairness === "weak") {
        var hasGrantDisabledState = component.some(function (key) {
          return !graph.grantEnabled(product.nodes[key].state);
        });
        if (!hasGrantDisabledState) return;
      }
      candidate = { allowed: allowed, component: component, internal: internal };
    });

    if (!candidate) {
      return {
        cycle: [],
        found: false,
        product: product,
        prefix: []
      };
    }

    var firstEdge = candidate.internal[0];
    var tail = findPathInside(firstEdge.to, firstEdge.from, candidate.allowed, candidate.internal);
    var cycle = [firstEdge].concat(tail);
    var prefix = prefixTo(product, firstEdge.from);

    return {
      component: candidate.component,
      cycle: cycle,
      found: true,
      product: product,
      prefix: prefix,
      start: firstEdge.from
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var sGraph = safetyGraph(params);
    var lGraph = liveGraph(params);
    var safety = bfsBadPrefix(sGraph);
    var liveness = livenessLasso(lGraph, params);
    var productNodeCount = Object.keys(liveness.product.nodes).length;

    return {
      liveGraph: lGraph,
      liveness: liveness,
      params: params,
      productNodeCount: productNodeCount,
      safety: safety,
      safetyGraph: sGraph
    };
  }

  function metric(label, value) {
    return '<div class="temporal-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, result) {
    var el = root.querySelector("[data-metrics]");
    if (!el) return;
    var safetyText = result.safety.found ? "bad prefix, " + result.safety.path.length + " steps" : "no bad prefix";
    var liveText = result.liveness.found ? "lasso found" : "no lasso";
    var fairnessText = result.params.fairness === "weak" ? "weak grant fairness" : "none";
    var cycleText = result.liveness.found ? result.liveness.cycle.map(function (edge) { return edge.label; }).join(" -> ") : "n/a";
    el.innerHTML = [
      metric("Safety", safetyText),
      metric("Liveness", liveText),
      metric("Fairness", fairnessText),
      metric("Product states", String(result.productNodeCount)),
      metric("Cycle", cycleText)
    ].join("");
  }

  function labelForState(state) {
    return {
      both: "both green",
      east: "EW green",
      idle: "idle",
      north: "NS green",
      outage: "outage",
      pending: "pending"
    }[state] || state;
  }

  function edgeKey(edge) {
    return edge.from + "->" + edge.to + ":" + edge.label;
  }

  function productState(edgeKeyValue) {
    return parseProductKey(edgeKeyValue).state;
  }

  function drawRounded(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y);
  }

  function arrow(ctx, x1, y1, x2, y2, color, width) {
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var r = 22;
    var sx = x1 + Math.cos(angle) * r;
    var sy = y1 + Math.sin(angle) * r;
    var ex = x2 - Math.cos(angle) * r;
    var ey = y2 - Math.sin(angle) * r;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(angle - 0.55) * 8, ey - Math.sin(angle - 0.55) * 8);
    ctx.lineTo(ex - Math.cos(angle + 0.55) * 8, ey - Math.sin(angle + 0.55) * 8);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;
  }

  function loop(ctx, x, y, color, label, side) {
    var dx = side === "left" ? -24 : 24;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(x + dx, y - 14, 16, 0.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + dx + 16, y - 14);
    ctx.lineTo(x + dx + 8, y - 18);
    ctx.lineTo(x + dx + 10, y - 9);
    ctx.closePath();
    ctx.fill();
    text(ctx, label, x + dx, y - 40, color, 10, 700, "center");
    ctx.lineWidth = 1;
  }

  function node(ctx, x, y, label, color, active) {
    ctx.fillStyle = active ? "rgba(245, 158, 11, 0.18)" : COLORS.node;
    ctx.strokeStyle = color || COLORS.rule;
    ctx.lineWidth = active ? 2.5 : 1.4;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(ctx, label, x, y, color || COLORS.text, 11, 750, "center");
    ctx.lineWidth = 1;
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    drawRounded(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 20, COLORS.text, 13, 800);
    text(ctx, subtitle, box.x + 14, box.y + 39, COLORS.muted, 11, 500);
  }

  function drawGraph(ctx, box, states, edges, positions, highlightEdges, activeStates) {
    var coords = {};
    states.forEach(function (state) {
      coords[state] = {
        x: box.x + positions[state].x * box.w,
        y: box.y + positions[state].y * box.h
      };
    });

    edges.forEach(function (edge) {
      if (edge.from === edge.to) return;
      var from = coords[edge.from];
      var to = coords[edge.to];
      var key = edgeKey(edge);
      var active = highlightEdges[key];
      arrow(ctx, from.x, from.y, to.x, to.y, active ? COLORS.cycle : (edge.bad ? COLORS.safety : COLORS.edge), active ? 3 : 1.4);
      var lx = (from.x + to.x) / 2;
      var ly = (from.y + to.y) / 2 - 7;
      text(ctx, edge.label, lx, ly, active ? COLORS.cycle : COLORS.muted, 10, active ? 800 : 500, "center");
    });

    edges.forEach(function (edge) {
      if (edge.from !== edge.to) return;
      var c = coords[edge.from];
      var key = edgeKey(edge);
      loop(ctx, c.x, c.y, highlightEdges[key] ? COLORS.cycle : COLORS.edge, edge.label, edge.from === "idle" ? "left" : "right");
    });

    states.forEach(function (state) {
      var c = coords[state];
      var active = !!activeStates[state];
      var color = state === "both" ? COLORS.safety : (state === "outage" ? COLORS.outage : (state === "pending" ? COLORS.live : COLORS.safe));
      node(ctx, c.x, c.y, labelForState(state), color, active);
    });
  }

  function drawWitness(ctx, box, title, subtitle, states, color) {
    panel(ctx, box, title, subtitle);
    var maxItems = Math.min(states.length, 7);
    if (!states.length) {
      text(ctx, "none", box.x + 18, box.y + 78, COLORS.muted, 12, 700);
      return;
    }
    var y = box.y + 84;
    var gap = Math.min(96, (box.w - 52) / Math.max(1, maxItems - 1));
    var startX = box.x + 28;
    for (var i = 0; i < maxItems; i += 1) {
      var x = startX + i * gap;
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      text(ctx, String(i), x, y, color, 10, 800, "center");
      text(ctx, labelForState(states[i]), x, y + 26, COLORS.text, 10, 700, "center");
      if (i < maxItems - 1) arrow(ctx, x + 14, y, startX + (i + 1) * gap - 14, y, color, 1.5);
    }
    if (states.length > maxItems) text(ctx, "...", box.x + box.w - 24, y, COLORS.muted, 16, 800, "center");
  }

  function lassoStates(result) {
    if (!result.liveness.found) return [];
    var prefix = result.liveness.prefix.map(function (edge) { return productState(edge.from); });
    if (result.liveness.prefix.length) {
      prefix.push(productState(result.liveness.prefix[result.liveness.prefix.length - 1].to));
    } else {
      prefix.push(productState(result.liveness.start));
    }
    var cycle = result.liveness.cycle.map(function (edge) { return productState(edge.to); });
    return prefix.concat(cycle);
  }

  function drawCanvas(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 860;
    var width = Math.max(320, parentWidth);
    var height = width < 560 ? 790 : 680;
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    var margin = width < 560 ? 14 : 22;
    var gap = width < 560 ? 14 : 18;
    var top = 24;
    var graphH = width < 560 ? 260 : 320;
    var columnW = width < 560 ? width - margin * 2 : (width - margin * 2 - gap) / 2;
    var safetyBox = { x: margin, y: top, w: columnW, h: graphH };
    var liveBox = width < 560
      ? { x: margin, y: top + graphH + gap, w: columnW, h: graphH }
      : { x: margin + columnW + gap, y: top, w: columnW, h: graphH };

    panel(ctx, safetyBox, "Safety: find a finite bad prefix", "G(not both-green)");
    panel(ctx, liveBox, "Liveness: find an accepting loop", "G(request -> F grant)");

    var safetyHighlights = {};
    result.safety.path.forEach(function (edge) { safetyHighlights[edgeKey(edge)] = true; });
    var safetyActive = {};
    result.safety.states.forEach(function (state) { safetyActive[state] = true; });
    drawGraph(ctx, safetyBox, result.safetyGraph.states, result.safetyGraph.edges, SAFETY_POS, safetyHighlights, safetyActive);

    var cycleHighlights = {};
    var liveActive = {};
    result.liveness.cycle.forEach(function (edge) {
      cycleHighlights[edgeKey(edge.raw)] = true;
      liveActive[productState(edge.from)] = true;
      liveActive[productState(edge.to)] = true;
    });
    result.liveness.prefix.forEach(function (edge) {
      liveActive[productState(edge.from)] = true;
      liveActive[productState(edge.to)] = true;
    });
    drawGraph(ctx, liveBox, result.liveGraph.states, result.liveGraph.edges, LIVE_POS, cycleHighlights, liveActive);

    var belowTop = width < 560 ? liveBox.y + liveBox.h + gap : top + graphH + gap;
    var witnessH = width < 560 ? 146 : 162;
    var safetyWitness = {
      x: margin,
      y: belowTop,
      w: width < 560 ? width - margin * 2 : columnW,
      h: witnessH
    };
    var liveWitness = width < 560
      ? { x: margin, y: belowTop + witnessH + gap, w: width - margin * 2, h: witnessH }
      : { x: margin + columnW + gap, y: belowTop, w: columnW, h: witnessH };

    drawWitness(
      ctx,
      safetyWitness,
      result.safety.found ? "Bad prefix" : "No finite safety witness",
      result.safety.found ? "the trace can stop at the violation" : "reachable states avoid both-green",
      result.safety.found ? result.safety.states : [],
      COLORS.safety
    );

    var lasso = lassoStates(result);
    drawWitness(
      ctx,
      liveWitness,
      result.liveness.found ? "Lasso witness" : "No lasso under these assumptions",
      result.liveness.found ? "prefix, then repeat the highlighted cycle" : "every fair reachable cycle can grant",
      lasso,
      COLORS.live
    );
  }

  function render(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    var result = evaluate(raw);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function init(root) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function auditTemporalLassoLab() {
    var failures = [];
    var cases = [];

    function cycleStates(result) {
      if (!result.liveness.found) return "";
      var states = result.liveness.cycle.map(function (edge) {
        return productState(edge.from);
      });
      if (result.liveness.cycle.length) {
        states.push(productState(result.liveness.cycle[result.liveness.cycle.length - 1].to));
      }
      return states.join(" -> ");
    }

    function hasWeakFairDisabledGrant(result) {
      if (result.liveness.found && result.params.fairness === "weak") {
        return result.liveness.component.some(function (key) {
          return !result.liveGraph.grantEnabled(result.liveness.product.nodes[key].state);
        });
      }
      return false;
    }

    function addCase(name, claim, raw, assertions) {
      var result = evaluate(raw);
      var checks = [];

      function check(condition, message) {
        checks.push({ name: message, ok: !!condition });
      }

      assertions(result, check);
      check(result.productNodeCount > 0 && result.productNodeCount <= 6, "product graph should stay tiny");
      check(
        result.safety.states.length === result.safety.path.length + 1,
        "safety prefix should have one more state than edge"
      );
      check(
        result.safety.states[result.safety.states.length - 1] === result.safety.terminal,
        "safety terminal should be final prefix state"
      );
      if (result.safety.found) {
        check(result.safetyGraph.bad(result.safety.terminal), "safety witness should end in a bad state");
      } else {
        check(!result.safetyGraph.bad(result.safety.terminal), "safe result should not stop in a bad state");
      }
      if (result.liveness.found) {
        check(result.liveness.cycle.every(function (edge) { return edge.event !== "grant"; }), "lasso cycle should avoid grants");
        check(result.liveness.cycle.length > 0, "lasso cycle should be nonempty");
        check(
          result.liveness.cycle.every(function (edge, index) {
            var next = result.liveness.cycle[(index + 1) % result.liveness.cycle.length];
            return edge.to === next.from;
          }),
          "lasso cycle should close"
        );
        check(
          result.liveness.cycle.every(function (edge) {
            return result.liveness.product.nodes[edge.from].owed && result.liveness.product.nodes[edge.to].owed;
          }),
          "lasso cycle should stay in owed states"
        );
        check(
          !result.liveness.prefix.length || result.liveness.prefix[result.liveness.prefix.length - 1].to === result.liveness.start,
          "lasso prefix should reach the cycle start"
        );
      } else {
        check(result.liveness.cycle.length === 0, "no-lasso result should have empty cycle");
        check(result.liveness.prefix.length === 0, "no-lasso result should have empty prefix");
      }
      if (result.liveness.found && result.params.fairness === "weak") {
        check(hasWeakFairDisabledGrant(result), "weak-fair lasso should include a state where grant is not enabled");
      }
      var failedChecks = checks.filter(function (item) { return !item.ok; }).map(function (item) { return item.name; });

      var row = {
        claim: claim,
        checks: checks,
        cycleEvents: result.liveness.found ? result.liveness.cycle.map(function (edge) { return edge.event; }).join(" -> ") : "",
        cycleLength: result.liveness.cycle.length,
        cycleStates: cycleStates(result),
        failedChecks: failedChecks,
        lassoFound: result.liveness.found,
        name: name,
        params: result.params,
        passed: failedChecks.length === 0,
        passedChecks: checks.length - failedChecks.length,
        productNodes: result.productNodeCount,
        safetyFound: result.safety.found,
        safetySteps: result.safety.path.length,
        safetyTerminal: result.safety.terminal,
        totalChecks: checks.length,
        weakFairDisabledGrant: hasWeakFairDisabledGrant(result)
      };
      cases.push(row);
      failedChecks.forEach(function (failure) {
        failures.push(name + ": " + failure);
      });
    }

    addCase("safe baseline", "no witness", { conflict: "off", skip: "off", outage: "off", fairness: "none" }, function (result, check) {
      check(!result.safety.found, "conflict disabled should have no safety bad prefix");
      check(!result.liveness.found, "no skip or outage should have no liveness lasso");
    });

    addCase("bad switch", "safety prefix", { conflict: "on", skip: "off", outage: "off", fairness: "none" }, function (result, check) {
      check(result.safety.found, "conflict enabled should produce a safety prefix");
      check(result.safety.terminal === "both", "safety prefix should end at both-green");
    });

    addCase("unfair skip", "liveness lasso", { conflict: "off", skip: "on", outage: "off", fairness: "none" }, function (result, check) {
      check(result.liveness.found, "unfair skip loop should violate request-response liveness");
    });

    addCase("weak fairness", "fairness filter", { conflict: "off", skip: "on", outage: "off", fairness: "weak" }, function (result, check) {
      check(!result.liveness.found, "weak grant fairness should rule out the pure skip lasso");
    });

    addCase("outage under fairness", "capability loss", { conflict: "off", skip: "on", outage: "on", fairness: "weak" }, function (result, check) {
      check(result.liveness.found, "outage loop should remain a liveness violation under grant fairness");
      check(result.liveness.cycle.some(function (edge) {
        return productState(edge.from) === "outage" || productState(edge.to) === "outage";
      }), "outage lasso should visit outage");
    });

    var byClaimMap = {};
    cases.forEach(function (row) {
      if (!byClaimMap[row.claim]) {
        byClaimMap[row.claim] = {
          claim: row.claim,
          cases: 0,
          lassoWitnesses: 0,
          maxProductNodes: 0,
          names: [],
          passed: 0,
          passedChecks: 0,
          safetyWitnesses: 0,
          totalChecks: 0
        };
      }
      byClaimMap[row.claim].cases += 1;
      byClaimMap[row.claim].names.push(row.name);
      byClaimMap[row.claim].maxProductNodes = Math.max(byClaimMap[row.claim].maxProductNodes, row.productNodes);
      if (row.lassoFound) byClaimMap[row.claim].lassoWitnesses += 1;
      if (row.safetyFound) byClaimMap[row.claim].safetyWitnesses += 1;
      if (row.passed) byClaimMap[row.claim].passed += 1;
      byClaimMap[row.claim].passedChecks += row.passedChecks;
      byClaimMap[row.claim].totalChecks += row.totalChecks;
    });

    var byClaim = Object.keys(byClaimMap).sort().map(function (claim) {
      var group = byClaimMap[claim];
      group.names = group.names.join(", ");
      return group;
    });
    var passed = cases.filter(function (row) { return row.passed; }).length;
    var total = cases.length;
    var passedChecks = cases.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = cases.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);

    return {
      byClaim: byClaim,
      cases: cases,
      failures: failures,
      ok: failures.length === 0 && passedChecks === totalChecks,
      pass: failures.length === 0 && passedChecks === totalChecks,
      passed: passed,
      passedChecks: passedChecks,
      totalChecks: totalChecks,
      total: total
    };
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-temporal-lasso-lab]").forEach(init);
    });
    window.addEventListener("resize", function () {
      document.querySelectorAll("[data-temporal-lasso-lab]").forEach(render);
    });
  }

  var api = {
    audit: auditTemporalLassoLab,
    evaluate: evaluate
  };

  global.TemporalLassoLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
