(function (global) {
  "use strict";

  var COLORS = {
    axis: "#d7dee5",
    bad: "#be123c",
    blue: "#2563eb",
    gold: "#d97706",
    good: "#0f766e",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    panel: "#f8fafc",
    purple: "#7c3aed",
    softBlue: "rgba(37, 99, 235, 0.12)",
    softGold: "rgba(217, 119, 6, 0.15)",
    softGood: "rgba(15, 118, 110, 0.13)",
    softPurple: "rgba(124, 58, 237, 0.12)",
    white: "#ffffff"
  };

  var SCENARIOS = {
    chain: {
      label: "three-node chain",
      note: "same skeleton, no unshielded collider",
      nodes: [
        { id: "A", label: "A", x: 0.14, y: 0.52 },
        { id: "B", label: "B", x: 0.50, y: 0.52 },
        { id: "C", label: "C", x: 0.86, y: 0.52 }
      ],
      edges: [["A", "B"], ["B", "C"]]
    },
    collider: {
      label: "unshielded collider",
      note: "A and C meet only at B",
      nodes: [
        { id: "A", label: "A", x: 0.14, y: 0.42 },
        { id: "B", label: "B", x: 0.50, y: 0.64 },
        { id: "C", label: "C", x: 0.86, y: 0.42 }
      ],
      edges: [["A", "B"], ["C", "B"]]
    },
    triangle: {
      label: "shielded triangle",
      note: "all triples are shielded by adjacency",
      nodes: [
        { id: "A", label: "A", x: 0.22, y: 0.70 },
        { id: "B", label: "B", x: 0.50, y: 0.22 },
        { id: "C", label: "C", x: 0.78, y: 0.70 }
      ],
      edges: [["A", "B"], ["A", "C"], ["B", "C"]]
    },
    diamond: {
      label: "diamond with sink",
      note: "one collider can force upstream arrows",
      nodes: [
        { id: "A", label: "A", x: 0.50, y: 0.14 },
        { id: "B", label: "B", x: 0.23, y: 0.48 },
        { id: "C", label: "C", x: 0.77, y: 0.48 },
        { id: "D", label: "D", x: 0.50, y: 0.84 }
      ],
      edges: [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"]]
    },
    frontdoor: {
      label: "four-node corridor",
      note: "orientation remains local without experiments",
      nodes: [
        { id: "W", label: "W", x: 0.12, y: 0.52 },
        { id: "X", label: "X", x: 0.38, y: 0.28 },
        { id: "Y", label: "Y", x: 0.64, y: 0.28 },
        { id: "Z", label: "Z", x: 0.88, y: 0.52 }
      ],
      edges: [["W", "X"], ["X", "Y"], ["Y", "Z"], ["W", "Z"]]
    }
  };

  var DEFAULTS = {
    intervention: "none",
    scenario: "chain"
  };

  function key(a, b) {
    return a < b ? a + "--" + b : b + "--" + a;
  }

  function edgeLabel(edge) {
    return edge[0] + "->" + edge[1];
  }

  function cloneEdges(edges) {
    return edges.map(function (edge) { return [edge[0], edge[1]]; });
  }

  function nodeIds(scenario) {
    return scenario.nodes.map(function (node) { return node.id; });
  }

  function skeletonEdges(edges) {
    var seen = {};
    edges.forEach(function (edge) {
      var k = key(edge[0], edge[1]);
      if (!seen[k]) seen[k] = edge[0] < edge[1] ? [edge[0], edge[1]] : [edge[1], edge[0]];
    });
    return Object.keys(seen).sort().map(function (k) { return seen[k]; });
  }

  function skeletonSignature(edges) {
    return skeletonEdges(edges).map(function (edge) { return key(edge[0], edge[1]); }).join("|");
  }

  function adjacencySet(edges) {
    var out = {};
    edges.forEach(function (edge) {
      out[key(edge[0], edge[1])] = true;
    });
    return out;
  }

  function parentMap(ids, edges) {
    var parents = {};
    ids.forEach(function (id) { parents[id] = []; });
    edges.forEach(function (edge) {
      parents[edge[1]].push(edge[0]);
    });
    ids.forEach(function (id) { parents[id].sort(); });
    return parents;
  }

  function directedEdgeSet(edges) {
    var out = {};
    edges.forEach(function (edge) {
      out[edgeLabel(edge)] = true;
    });
    return out;
  }

  function undirectedNeighbors(ids, edges) {
    var neighbors = {};
    ids.forEach(function (id) { neighbors[id] = []; });
    edges.forEach(function (edge) {
      neighbors[edge[0]].push(edge[1]);
      neighbors[edge[1]].push(edge[0]);
    });
    ids.forEach(function (id) { neighbors[id].sort(); });
    return neighbors;
  }

  function simplePaths(ids, edges, start, end) {
    var neighbors = undirectedNeighbors(ids, edges);
    var paths = [];
    var seen = {};
    seen[start] = true;
    function walk(node, path) {
      if (node === end) {
        paths.push(path.slice());
        return;
      }
      neighbors[node].forEach(function (next) {
        if (seen[next]) return;
        seen[next] = true;
        path.push(next);
        walk(next, path);
        path.pop();
        delete seen[next];
      });
    }
    walk(start, [start]);
    return paths;
  }

  function ancestorsOf(ids, edges, targets) {
    var parents = parentMap(ids, edges);
    var seen = {};
    var stack = targets.slice();
    while (stack.length) {
      var id = stack.pop();
      if (seen[id]) continue;
      seen[id] = true;
      parents[id].forEach(function (parent) { stack.push(parent); });
    }
    return seen;
  }

  function arraySet(values) {
    var out = {};
    values.forEach(function (value) { out[value] = true; });
    return out;
  }

  function pathActive(path, edgeSet, conditioned, conditionedAncestors) {
    for (var i = 1; i < path.length - 1; i += 1) {
      var left = path[i - 1];
      var mid = path[i];
      var right = path[i + 1];
      var collider = edgeSet[edgeLabel([left, mid])] && edgeSet[edgeLabel([right, mid])];
      if (collider) {
        if (!conditionedAncestors[mid]) return false;
      } else if (conditioned[mid]) {
        return false;
      }
    }
    return true;
  }

  function dConnectedPair(ids, edges, left, right, conditioning) {
    var conditioned = arraySet(conditioning);
    var conditionedAncestors = ancestorsOf(ids, edges, conditioning);
    var edgeSet = directedEdgeSet(edges);
    return simplePaths(ids, edges, left, right).some(function (path) {
      return pathActive(path, edgeSet, conditioned, conditionedAncestors);
    });
  }

  function dSeparatedSets(ids, edges, leftSet, rightSet, conditioning) {
    for (var i = 0; i < leftSet.length; i += 1) {
      for (var j = 0; j < rightSet.length; j += 1) {
        if (dConnectedPair(ids, edges, leftSet[i], rightSet[j], conditioning)) return false;
      }
    }
    return true;
  }

  function idsFromMask(ids, mask) {
    return ids.filter(function (_id, index) { return mask & (1 << index); });
  }

  function maskLabel(ids, mask) {
    return idsFromMask(ids, mask).join(",");
  }

  function dSeparationSignature(ids, edges) {
    var full = (1 << ids.length) - 1;
    var statements = [];
    for (var leftMask = 1; leftMask <= full; leftMask += 1) {
      for (var rightMask = leftMask + 1; rightMask <= full; rightMask += 1) {
        if (leftMask & rightMask) continue;
        var restMask = full & ~(leftMask | rightMask);
        var condMask = restMask;
        while (true) {
          var left = idsFromMask(ids, leftMask);
          var right = idsFromMask(ids, rightMask);
          var conditioning = idsFromMask(ids, condMask);
          if (dSeparatedSets(ids, edges, left, right, conditioning)) {
            statements.push(maskLabel(ids, leftMask) + " _||_ " + maskLabel(ids, rightMask) + " | " + (condMask ? maskLabel(ids, condMask) : "empty"));
          }
          if (condMask === 0) break;
          condMask = (condMask - 1) & restMask;
        }
      }
    }
    return statements.sort();
  }

  function familyDsepSignature(ids, edges, intervention) {
    var target = intervention || "none";
    var parts = ["obs:" + dSeparationSignature(ids, edges).join(";")];
    if (target !== "none") {
      parts.push("do(" + target + "):" + dSeparationSignature(ids, removeIncoming(edges, [target])).join(";"));
    }
    return parts.join(" || ");
  }

  function isAcyclic(ids, edges) {
    var indeg = {};
    var next = {};
    ids.forEach(function (id) {
      indeg[id] = 0;
      next[id] = [];
    });
    edges.forEach(function (edge) {
      next[edge[0]].push(edge[1]);
      indeg[edge[1]] += 1;
    });
    var queue = ids.filter(function (id) { return indeg[id] === 0; }).sort();
    var visited = 0;
    while (queue.length) {
      var id = queue.shift();
      visited += 1;
      next[id].forEach(function (child) {
        indeg[child] -= 1;
        if (indeg[child] === 0) {
          queue.push(child);
          queue.sort();
        }
      });
    }
    return visited === ids.length;
  }

  function vStructures(ids, edges) {
    var adj = adjacencySet(edges);
    var parents = parentMap(ids, edges);
    var triples = [];
    ids.forEach(function (child) {
      var ps = parents[child];
      for (var i = 0; i < ps.length; i += 1) {
        for (var j = i + 1; j < ps.length; j += 1) {
          if (!adj[key(ps[i], ps[j])]) triples.push(ps[i] + "->" + child + "<-" + ps[j]);
        }
      }
    });
    return triples.sort();
  }

  function graphSignature(ids, edges) {
    return skeletonSignature(edges) + " :: " + vStructures(ids, edges).join("|");
  }

  function removeIncoming(edges, targets) {
    var targetSet = {};
    targets.forEach(function (target) { targetSet[target] = true; });
    return edges.filter(function (edge) { return !targetSet[edge[1]]; });
  }

  function familySignature(ids, edges, intervention) {
    var parts = [graphSignature(ids, edges)];
    if (intervention && intervention !== "none") {
      parts.push("do(" + intervention + ") " + graphSignature(ids, removeIncoming(edges, [intervention])));
    }
    return parts.join(" || ");
  }

  function enumerateDags(scenario) {
    var ids = nodeIds(scenario);
    var skel = skeletonEdges(scenario.edges);
    var total = Math.pow(2, skel.length);
    var out = [];
    for (var mask = 0; mask < total; mask += 1) {
      var edges = skel.map(function (edge, index) {
        return mask & (1 << index) ? [edge[1], edge[0]] : [edge[0], edge[1]];
      });
      if (isAcyclic(ids, edges)) out.push(edges);
    }
    return out;
  }

  function equivalentClass(scenario, intervention) {
    var ids = nodeIds(scenario);
    var targetSig = familySignature(ids, scenario.edges, intervention || "none");
    return enumerateDags(scenario).filter(function (edges) {
      return familySignature(ids, edges, intervention || "none") === targetSig;
    });
  }

  function cpdag(scenario, classEdges) {
    var skel = skeletonEdges(scenario.edges);
    return skel.map(function (edge) {
      var a = edge[0];
      var b = edge[1];
      var forward = 0;
      var backward = 0;
      classEdges.forEach(function (edges) {
        if (edges.some(function (e) { return e[0] === a && e[1] === b; })) forward += 1;
        if (edges.some(function (e) { return e[0] === b && e[1] === a; })) backward += 1;
      });
      if (forward === classEdges.length) return { from: a, to: b, kind: "directed" };
      if (backward === classEdges.length) return { from: b, to: a, kind: "directed" };
      return { from: a, to: b, kind: "undirected" };
    });
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var ids = nodeIds(SCENARIOS[scenario]);
    var intervention = ids.indexOf(raw.intervention) >= 0 ? raw.intervention : "none";
    return {
      intervention: intervention,
      scenario: scenario
    };
  }

  function orientText(edges) {
    return edges.map(edgeLabel).sort().join(", ");
  }

  function classStats(scenario, intervention) {
    var ids = nodeIds(scenario);
    return ["none"].concat(ids).map(function (target) {
      var klass = equivalentClass(scenario, target);
      var graph = cpdag(scenario, klass);
      return {
        classSize: klass.length,
        compelled: graph.filter(function (edge) { return edge.kind === "directed"; }).length,
        reversible: graph.filter(function (edge) { return edge.kind === "undirected"; }).length,
        target: target
      };
    });
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var scenario = SCENARIOS[params.scenario];
    var ids = nodeIds(scenario);
    var obsClass = equivalentClass(scenario, "none");
    var currentClass = equivalentClass(scenario, params.intervention);
    var obsGraph = cpdag(scenario, obsClass);
    var currentGraph = cpdag(scenario, currentClass);
    var v = vStructures(ids, scenario.edges);
    var rows = classStats(scenario, params.intervention);
    return {
      ciStatements: dSeparationSignature(ids, scenario.edges),
      currentClass: currentClass,
      currentCpdag: currentGraph,
      fingerprint: {
        skeleton: skeletonEdges(scenario.edges).map(function (edge) { return key(edge[0], edge[1]); }),
        vStructures: v
      },
      interventionRows: rows,
      obsClass: obsClass,
      obsCpdag: obsGraph,
      params: params,
      scenario: scenario,
      scenarioKey: params.scenario
    };
  }

  function fmtTarget(value) {
    return value === "none" ? "observed only" : "do(" + value + ")";
  }

  function metric(label, value, tone) {
    return '<div class="mec-lab__metric' + (tone ? " " + tone : "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.muted;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 18, { color: COLORS.ink, size: 13, weight: 820 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, { color: COLORS.muted, size: 10, weight: 650 });
  }

  function nodePositionMap(scenario, box) {
    var map = {};
    scenario.nodes.forEach(function (node) {
      map[node.id] = {
        label: node.label,
        x: box.x + node.x * box.w,
        y: box.y + node.y * box.h
      };
    });
    return map;
  }

  function drawArrow(ctx, from, to, color, width, directed) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    var ux = dx / len;
    var uy = dy / len;
    var r = 18;
    var sx = from.x + ux * r;
    var sy = from.y + uy * r;
    var ex = to.x - ux * r;
    var ey = to.y - uy * r;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (directed) {
      var size = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - ux * size - uy * size * 0.56, ey - uy * size + ux * size * 0.56);
      ctx.lineTo(ex - ux * size + uy * size * 0.56, ey - uy * size - ux * size * 0.56);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawNodes(ctx, pos) {
    Object.keys(pos).forEach(function (id) {
      var p = pos[id];
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.axis;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      text(ctx, p.label, p.x, p.y + 1, { align: "center", color: COLORS.ink, size: 13, weight: 820 });
    });
  }

  function drawDag(ctx, scenario, box, edges, title) {
    text(ctx, title, box.x, box.y - 8, { color: COLORS.ink, size: 11, weight: 800 });
    var pos = nodePositionMap(scenario, box);
    edges.forEach(function (edge) {
      drawArrow(ctx, pos[edge[0]], pos[edge[1]], COLORS.blue, 2.1, true);
    });
    drawNodes(ctx, pos);
  }

  function drawCpdag(ctx, scenario, box, graph, title) {
    text(ctx, title, box.x, box.y - 8, { color: COLORS.ink, size: 11, weight: 800 });
    var pos = nodePositionMap(scenario, box);
    graph.forEach(function (edge) {
      var color = edge.kind === "directed" ? COLORS.good : COLORS.muted;
      drawArrow(ctx, pos[edge.from], pos[edge.to], color, edge.kind === "directed" ? 2.3 : 1.8, edge.kind === "directed");
    });
    drawNodes(ctx, pos);
  }

  function drawGraphsPanel(ctx, state, box) {
    panel(ctx, box, "one DAG, many explanations", state.scenario.note);
    var innerY = box.y + 70;
    var graphH = box.h - 102;
    var left = { x: box.x + 18, y: innerY, w: box.w * 0.43, h: graphH };
    var right = { x: box.x + box.w * 0.54, y: innerY, w: box.w * 0.40, h: graphH };
    drawDag(ctx, state.scenario, left, state.scenario.edges, "drawn DAG");
    drawCpdag(ctx, state.scenario, right, state.currentCpdag, "what this data identifies");
    text(ctx, "green arrows are compelled; gray links are reversible", box.x + 16, box.y + box.h - 18, { color: COLORS.muted, size: 10 });
  }

  function drawFingerprintPanel(ctx, state, box) {
    panel(ctx, box, "the fingerprint", "skeleton plus unshielded colliders");
    var x = box.x + 16;
    var y = box.y + 70;
    text(ctx, "Skeleton", x, y, { color: COLORS.ink, size: 12, weight: 820 });
    state.fingerprint.skeleton.forEach(function (row, i) {
      text(ctx, row, x + 8, y + 28 + i * 22, { color: COLORS.blue, size: 11, weight: 760 });
    });
    var vx = box.x + box.w * 0.52;
    text(ctx, "V-structures", vx, y, { color: COLORS.ink, size: 12, weight: 820 });
    var triples = state.fingerprint.vStructures.length ? state.fingerprint.vStructures : ["none"];
    triples.forEach(function (row, i) {
      text(ctx, row, vx + 8, y + 28 + i * 22, { color: row === "none" ? COLORS.muted : COLORS.bad, size: 11, weight: 760 });
    });
    var phrase = state.fingerprint.vStructures.length
      ? (box.w < 360 ? "colliders orient shared arrows" : "orient every collider; leave the rest to the class")
      : (box.w < 360 ? "no collider witness: directions hidden" : "no collider witness means directions are mostly hidden");
    ctx.fillStyle = state.fingerprint.vStructures.length ? COLORS.softGold : COLORS.softPurple;
    ctx.strokeStyle = state.fingerprint.vStructures.length ? COLORS.gold : COLORS.purple;
    ctx.beginPath();
    ctx.roundRect(x, box.y + box.h - 52, box.w - 32, 32, 7);
    ctx.fill();
    ctx.stroke();
    text(ctx, phrase, box.x + box.w / 2, box.y + box.h - 36, { align: "center", color: state.fingerprint.vStructures.length ? COLORS.gold : COLORS.purple, size: 11, weight: 820 });
  }

  function drawClassPanel(ctx, state, box) {
    panel(ctx, box, "equivalence class ledger", "each row is a full DAG with the same tests");
    var x = box.x + 16;
    var y = box.y + 66;
    var rows = state.currentClass.slice(0, 8);
    var rowH = Math.min(28, (box.h - 108) / Math.max(1, rows.length));
    rows.forEach(function (edges, index) {
      var yy = y + index * rowH;
      ctx.fillStyle = index % 2 ? "rgba(255,255,255,0.76)" : "rgba(237,242,247,0.72)";
      ctx.fillRect(x - 6, yy - 12, box.w - 28, rowH - 2);
      text(ctx, "#" + (index + 1), x, yy, { color: COLORS.muted, size: 10, weight: 760 });
      text(ctx, orientText(edges), x + 44, yy, { color: COLORS.ink, size: 10, weight: 700 });
    });
    if (state.currentClass.length > rows.length) {
      text(ctx, "+" + (state.currentClass.length - rows.length) + " more DAGs in the same class", x, y + rows.length * rowH + 16, { color: COLORS.muted, size: 10 });
    }
    var obs = state.obsClass.length;
    var cur = state.currentClass.length;
    var shrink = obs ? Math.round(100 * (1 - cur / obs)) : 0;
    text(ctx, "observational class: " + obs + " DAGs", x, box.y + box.h - 40, { color: COLORS.muted, size: 10, weight: 700 });
    text(ctx, "after " + fmtTarget(state.params.intervention) + ": " + cur + " DAGs (" + shrink + "% shrink)", x, box.y + box.h - 20, { color: cur < obs ? COLORS.good : COLORS.muted, size: 10, weight: 800 });
  }

  function drawInterventionPanel(ctx, state, box) {
    panel(ctx, box, "intervention scorecard", "experiments cut incoming arrows");
    var rows = state.interventionRows.slice();
    var maxSize = Math.max.apply(null, rows.map(function (row) { return row.classSize; }).concat([1]));
    var x = box.x + 52;
    var y = box.y + 70;
    var plot = { x: x, y: y, w: box.w - 78, h: Math.max(70, box.h - 164) };
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    rows.forEach(function (row, i) {
      var band = plot.w / rows.length;
      var barW = Math.max(16, band * 0.56);
      var bx = plot.x + i * band + (band - barW) / 2;
      var h = row.classSize / maxSize * plot.h;
      var selected = row.target === state.params.intervention;
      ctx.fillStyle = selected ? COLORS.good : COLORS.softBlue;
      ctx.fillRect(bx, plot.y + plot.h - h, barW, h);
      text(ctx, row.target === "none" ? "obs" : row.target, bx + barW / 2, plot.y + plot.h + 15, { align: "center", color: COLORS.muted, size: 10 });
      text(ctx, String(row.classSize), bx + barW / 2, plot.y + plot.h - h - 10, { align: "center", color: selected ? COLORS.good : COLORS.blue, size: 10, weight: 780 });
    });
    var best = rows.slice().sort(function (a, b) {
      return a.classSize - b.classSize || b.compelled - a.compelled || a.target.localeCompare(b.target);
    })[0];
    text(ctx, "class size", plot.x - 10, plot.y, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "best single target: " + fmtTarget(best.target), box.x + 18, box.y + box.h - 34, { color: COLORS.good, size: 11, weight: 820 });
    text(ctx, "compelled edges there: " + best.compelled, box.x + 18, box.y + box.h - 16, { color: COLORS.muted, size: 10, weight: 700 });
  }

  function draw(root, state) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas || !canvas.getContext) return;
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 720;
    var height = compact ? 1040 : 760;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    var margin = 14;
    var gap = 18;
    var boxes;
    if (compact) {
      var h = (height - 2 * margin - 3 * gap) / 4;
      boxes = [
        { x: margin, y: margin, w: width - 2 * margin, h: h },
        { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h },
        { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h },
        { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h }
      ];
    } else {
      var boxW = (width - 2 * margin - gap) / 2;
      var boxH = (height - 2 * margin - gap) / 2;
      boxes = [
        { x: margin, y: margin, w: boxW, h: boxH },
        { x: margin + boxW + gap, y: margin, w: boxW, h: boxH },
        { x: margin, y: margin + boxH + gap, w: boxW, h: boxH },
        { x: margin + boxW + gap, y: margin + boxH + gap, w: boxW, h: boxH }
      ];
    }
    drawGraphsPanel(ctx, state, boxes[0]);
    drawFingerprintPanel(ctx, state, boxes[1]);
    drawClassPanel(ctx, state, boxes[2]);
    drawInterventionPanel(ctx, state, boxes[3]);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function setOptions(select, options, selected) {
    if (!select) return;
    var html = options.map(function (option) {
      return '<option value="' + option.value + '"' + (option.value === selected ? " selected" : "") + ">" + option.label + "</option>";
    }).join("");
    if (select.innerHTML !== html) select.innerHTML = html;
  }

  function updateControls(root, state) {
    var scenarioOptions = Object.keys(SCENARIOS).map(function (keyName) {
      return { label: SCENARIOS[keyName].label, value: keyName };
    });
    setOptions(root.querySelector('[data-param="scenario"]'), scenarioOptions, state.params.scenario);
    var targetOptions = [{ label: "observed only", value: "none" }].concat(nodeIds(state.scenario).map(function (id) {
      return { label: "do(" + id + ")", value: id };
    }));
    setOptions(root.querySelector('[data-param="intervention"]'), targetOptions, state.params.intervention);
    var values = {
      intervention: fmtTarget(state.params.intervention),
      scenario: state.scenario.label
    };
    Object.keys(values).forEach(function (name) {
      var out = root.querySelector('[data-value="' + name + '"]');
      if (out) out.textContent = values[name];
    });
  }

  function render(root) {
    var state = evaluate(paramsFromRoot(root));
    updateControls(root, state);
    var metrics = root.querySelector("[data-metrics]");
    var compelled = state.currentCpdag.filter(function (edge) { return edge.kind === "directed"; }).length;
    var reversible = state.currentCpdag.filter(function (edge) { return edge.kind === "undirected"; }).length;
    if (metrics) {
      metrics.innerHTML = [
        metric("scenario", state.scenario.label),
        metric("observational DAGs", String(state.obsClass.length)),
        metric("after intervention", String(state.currentClass.length), state.currentClass.length < state.obsClass.length ? "good" : ""),
        metric("compelled edges", String(compelled), compelled ? "good" : ""),
        metric("reversible edges", String(reversible), reversible ? "warn" : "good"),
        metric("v-structures", String(state.fingerprint.vStructures.length)),
        metric("CI facts", String(state.ciStatements.length))
      ].join("");
    }
    draw(root, state);
    root.__markovEquivalenceState = state;
  }

  function init(root) {
    if (!root || root.__markovEquivalenceReady) return;
    root.__markovEquivalenceReady = true;
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
    render(root);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function audit() {
    var cases = 0;
    var checked = 0;
    var rejectedOrientations = 0;
    var summary = {};
    var expectedClassSizes = {
      chain: { none: 3, A: 1, B: 1, C: 2 },
      collider: { none: 1, A: 1, B: 1, C: 1 },
      diamond: { none: 3, A: 1, B: 2, C: 2, D: 3 },
      frontdoor: { none: 3, W: 1, X: 1, Y: 2, Z: 3 },
      triangle: { none: 6, A: 2, B: 1, C: 2 }
    };

    function check(condition, message) {
      checked += 1;
      assert(condition, message);
    }

    function hasDirectedEdge(edges, from, to) {
      return edges.some(function (edge) { return edge[0] === from && edge[1] === to; });
    }

    function orientationSet(classEdges) {
      var out = {};
      classEdges.forEach(function (edges) { out[orientText(edges)] = true; });
      return out;
    }

    Object.keys(SCENARIOS).forEach(function (name) {
      var scenario = SCENARIOS[name];
      var ids = nodeIds(scenario);
      var allDags = enumerateDags(scenario);
      var obsSet = orientationSet(equivalentClass(scenario, "none"));
      var targets = ["none"].concat(ids);
      var maxClassSize = 0;
      var minClassSize = Infinity;

      check(allDags.length > 0, name + " should have at least one acyclic orientation");
      targets.forEach(function (target) {
        var state = evaluate({ scenario: name, intervention: target });
        var targetSig = familySignature(ids, scenario.edges, target);
        var targetDsepSig = familyDsepSignature(ids, scenario.edges, target);
        var currentSet = orientationSet(state.currentClass);

        cases += 1;
        maxClassSize = Math.max(maxClassSize, state.currentClass.length);
        minClassSize = Math.min(minClassSize, state.currentClass.length);

        check(state.currentClass.length === expectedClassSizes[name][target], name + " " + target + " class size should match regression anchor");
        check(state.ciStatements.length === dSeparationSignature(ids, scenario.edges).length, name + " should expose its observational CI count");

        allDags.forEach(function (edges) {
          var orientation = orientText(edges);
          var byCriterion = familySignature(ids, edges, target) === targetSig;
          var byDsep = familyDsepSignature(ids, edges, target) === targetDsepSig;
          check(byCriterion === byDsep, name + " " + target + " skeleton/v-structure test should match d-separation oracle");
          check(Boolean(currentSet[orientation]) === byCriterion, name + " " + target + " class membership should match criterion");
          if (!byCriterion) rejectedOrientations += 1;
        });

        state.currentClass.forEach(function (edges) {
          check(isAcyclic(ids, edges), name + " " + target + " candidate should be acyclic");
          check(familySignature(ids, edges, target) === targetSig, name + " " + target + " candidate should match graphical signature");
          check(familyDsepSignature(ids, edges, target) === targetDsepSig, name + " " + target + " candidate should match d-separation signature");
          if (target !== "none") {
            check(Boolean(obsSet[orientText(edges)]), name + " " + target + " intervention class should refine observational class");
          }
        });

        state.currentCpdag.forEach(function (edge) {
          var everyForward = state.currentClass.every(function (edges) { return hasDirectedEdge(edges, edge.from, edge.to); });
          var someForward = state.currentClass.some(function (edges) { return hasDirectedEdge(edges, edge.from, edge.to); });
          var someBackward = state.currentClass.some(function (edges) { return hasDirectedEdge(edges, edge.to, edge.from); });
          if (edge.kind === "directed") {
            check(everyForward && !someBackward, name + " " + target + " directed CPDAG edge should be unanimous");
          } else {
            check(someForward && someBackward, name + " " + target + " undirected CPDAG edge should be reversible");
          }
        });

        check(state.currentClass.length <= state.obsClass.length, name + " " + target + " intervention should not enlarge the class");
      });

      summary[name] = {
        acyclicOrientations: allDags.length,
        maxClassSize: maxClassSize,
        minClassSize: minClassSize,
        nodes: ids.length
      };
    });

    return {
      cases: cases,
      checked: checked,
      ok: true,
      rejectedOrientations: rejectedOrientations,
      summary: summary
    };
  }

  var api = {
    SCENARIOS: SCENARIOS,
    audit: audit,
    cleanParams: cleanParams,
    cpdag: cpdag,
    dConnectedPair: dConnectedPair,
    dSeparatedSets: dSeparatedSets,
    dSeparationSignature: dSeparationSignature,
    enumerateDags: enumerateDags,
    equivalentClass: equivalentClass,
    familyDsepSignature: familyDsepSignature,
    evaluate: evaluate,
    familySignature: familySignature,
    graphSignature: graphSignature,
    isAcyclic: isAcyclic,
    vStructures: vStructures
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MarkovEquivalenceLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-markov-equivalence-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
