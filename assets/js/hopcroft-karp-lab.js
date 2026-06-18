(function (global) {
  "use strict";

  var INF = 1e9;

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    edge: "#cbd5df",
    matched: "#0f766e",
    path: "#b45309",
    bfs: "#2563eb",
    cover: "#7c3aed",
    free: "#be123c",
    paleMatched: "rgba(15, 118, 110, 0.14)",
    palePath: "rgba(180, 83, 9, 0.15)",
    paleBfs: "rgba(37, 99, 235, 0.12)",
    paleCover: "rgba(124, 58, 237, 0.13)"
  };

  var EXAMPLES = {
    traps: {
      label: "two chain traps",
      left: ["u0", "u1", "u2", "u3", "u4", "u5"],
      right: ["v0", "v1", "v2", "v3", "v4", "v5"],
      edges: [
        [0, 0], [0, 1], [1, 0], [2, 1], [2, 2],
        [3, 3], [3, 4], [4, 3], [5, 4], [5, 5]
      ]
    },
    applicants: {
      label: "applicant shortlist",
      left: ["Ada", "Ben", "Cy", "Di", "Eli", "Fay", "Gus"],
      right: ["API", "DB", "UI", "Ops", "ML", "Docs", "QA"],
      edges: [
        [0, 0], [0, 1], [0, 4], [1, 0], [1, 2], [2, 1],
        [2, 2], [2, 5], [3, 2], [3, 3], [4, 3], [4, 4],
        [4, 6], [5, 5], [5, 6], [6, 0], [6, 6]
      ]
    },
    bottleneck: {
      label: "shared bottleneck",
      left: ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"],
      right: ["R0", "R1", "R2", "R3", "R4", "R5"],
      edges: [
        [0, 0], [0, 1], [1, 0], [1, 1], [2, 1], [2, 2],
        [3, 2], [3, 3], [4, 3], [4, 4], [5, 4], [5, 5],
        [6, 0], [6, 5], [7, 2], [7, 4]
      ]
    },
    grid: {
      label: "staggered grid",
      left: ["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"],
      right: ["b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7"],
      edges: [
        [0, 0], [0, 2], [1, 0], [1, 1], [2, 1], [2, 3],
        [3, 2], [3, 4], [4, 3], [4, 5], [5, 4], [5, 6],
        [6, 5], [6, 7], [7, 6], [7, 7], [1, 3], [3, 5], [5, 7]
      ]
    }
  };

  var DEFAULTS = {
    example: "traps",
    phase: 0
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
      phase: Math.round(clamp(finite(Number(raw.phase), DEFAULTS.phase), 0, 1000))
    };
  }

  function clonePairs(pairU, pairV) {
    return {
      pairU: pairU.slice(),
      pairV: pairV.slice()
    };
  }

  function makeGraph(key) {
    var spec = EXAMPLES[key] || EXAMPLES.traps;
    var left = spec.left.slice();
    var right = spec.right.slice();
    var adj = left.map(function () { return []; });
    var edges = spec.edges.map(function (edge) {
      return { u: edge[0], v: edge[1] };
    });
    edges.forEach(function (edge) {
      adj[edge.u].push(edge.v);
    });
    adj.forEach(function (row) {
      row.sort(function (a, b) { return a - b; });
    });
    return {
      key: key,
      label: spec.label,
      left: left,
      right: right,
      edges: edges,
      adj: adj
    };
  }

  function matchingEdges(pairU) {
    var edges = [];
    pairU.forEach(function (v, u) {
      if (v >= 0) edges.push({ u: u, v: v });
    });
    return edges;
  }

  function edgeKey(u, v) {
    return u + ":" + v;
  }

  function pathEdgeSet(paths) {
    var set = {};
    paths.forEach(function (path) {
      for (var i = 0; i + 1 < path.length; i += 1) {
        var a = path[i];
        var b = path[i + 1];
        var u = a.side === "U" ? a.index : b.index;
        var v = a.side === "V" ? a.index : b.index;
        set[edgeKey(u, v)] = true;
      }
    });
    return set;
  }

  function isMatchedEdge(pairU, u, v) {
    return pairU[u] === v;
  }

  function bfsLayers(graph, pairU, pairV) {
    var dist = graph.left.map(function () { return INF; });
    var queue = [];
    var found = false;
    var visitedV = graph.right.map(function () { return false; });
    var freeV = graph.right.map(function () { return false; });
    var layerEdges = [];

    for (var u = 0; u < graph.left.length; u += 1) {
      if (pairU[u] < 0) {
        dist[u] = 0;
        queue.push(u);
      }
    }

    for (var head = 0; head < queue.length; head += 1) {
      u = queue[head];
      graph.adj[u].forEach(function (v) {
        if (pairU[u] === v) return;
        visitedV[v] = true;
        layerEdges.push({ u: u, v: v, fromDist: dist[u], matched: false });
        var mate = pairV[v];
        if (mate < 0) {
          found = true;
          freeV[v] = true;
        } else if (dist[mate] === INF) {
          dist[mate] = dist[u] + 1;
          layerEdges.push({ u: mate, v: v, fromDist: dist[u] + 0.5, matched: true });
          queue.push(mate);
        }
      });
    }

    return {
      found: found,
      dist: dist,
      visitedV: visitedV,
      freeV: freeV,
      layerEdges: layerEdges
    };
  }

  function dfsLayered(graph, pairU, pairV, dist, u, seenU) {
    if (seenU[u]) return null;
    seenU[u] = true;

    for (var i = 0; i < graph.adj[u].length; i += 1) {
      var v = graph.adj[u][i];
      if (pairU[u] === v) continue;
      var mate = pairV[v];
      if (mate < 0) {
        pairU[u] = v;
        pairV[v] = u;
        return [{ side: "U", index: u }, { side: "V", index: v }];
      }
      if (dist[mate] === dist[u] + 1) {
        var suffix = dfsLayered(graph, pairU, pairV, dist, mate, seenU);
        if (suffix) {
          pairU[u] = v;
          pairV[v] = u;
          return [{ side: "U", index: u }, { side: "V", index: v }].concat(suffix);
        }
      }
    }

    dist[u] = INF;
    return null;
  }

  function hopcroftKarp(graph) {
    var pairU = graph.left.map(function () { return -1; });
    var pairV = graph.right.map(function () { return -1; });
    var phases = [];
    var matching = 0;

    while (true) {
      var before = clonePairs(pairU, pairV);
      var bfs = bfsLayers(graph, pairU, pairV);
      if (!bfs.found) {
        phases.push({
          index: phases.length,
          terminal: true,
          before: before,
          after: clonePairs(pairU, pairV),
          bfs: bfs,
          paths: [],
          matchingBefore: matching,
          matchingAfter: matching
        });
        break;
      }

      var paths = [];
      for (var u = 0; u < graph.left.length; u += 1) {
        if (pairU[u] >= 0) continue;
        var path = dfsLayered(graph, pairU, pairV, bfs.dist, u, {});
        if (path) {
          paths.push(path);
          matching += 1;
        }
      }

      phases.push({
        index: phases.length,
        terminal: false,
        before: before,
        after: clonePairs(pairU, pairV),
        bfs: bfs,
        paths: paths,
        matchingBefore: matching - paths.length,
        matchingAfter: matching
      });

      if (paths.length === 0) break;
    }

    return {
      pairU: pairU,
      pairV: pairV,
      matching: matching,
      edges: matchingEdges(pairU),
      phases: phases
    };
  }

  function findAnyAugmentingPath(graph, pairU, pairV, u, seenU, seenV) {
    if (seenU[u]) return null;
    seenU[u] = true;
    for (var i = 0; i < graph.adj[u].length; i += 1) {
      var v = graph.adj[u][i];
      if (seenV[v] || pairU[u] === v) continue;
      seenV[v] = true;
      var mate = pairV[v];
      if (mate < 0) return [{ side: "U", index: u }, { side: "V", index: v }];
      var suffix = findAnyAugmentingPath(graph, pairU, pairV, mate, seenU, seenV);
      if (suffix) return [{ side: "U", index: u }, { side: "V", index: v }].concat(suffix);
    }
    return null;
  }

  function augmentPath(pairU, pairV, path) {
    for (var i = 0; i + 1 < path.length; i += 2) {
      var u = path[i].index;
      var v = path[i + 1].index;
      pairU[u] = v;
      pairV[v] = u;
    }
  }

  function singlePathAugmenting(graph) {
    var pairU = graph.left.map(function () { return -1; });
    var pairV = graph.right.map(function () { return -1; });
    var paths = [];
    var scans = 0;

    while (true) {
      var found = null;
      for (var u = 0; u < graph.left.length; u += 1) {
        if (pairU[u] >= 0) continue;
        scans += 1;
        found = findAnyAugmentingPath(graph, pairU, pairV, u, {}, {});
        if (found) break;
      }
      if (!found) break;
      augmentPath(pairU, pairV, found);
      paths.push(found);
    }

    return {
      matching: matchingEdges(pairU).length,
      pairU: pairU,
      pairV: pairV,
      paths: paths,
      scans: scans
    };
  }

  function bruteForceMaximum(graph) {
    var best = { size: 0, pairU: graph.left.map(function () { return -1; }) };
    var usedV = graph.right.map(function () { return false; });
    var pairU = graph.left.map(function () { return -1; });

    function visit(u, count) {
      if (u === graph.left.length) {
        if (count > best.size) best = { size: count, pairU: pairU.slice() };
        return;
      }
      visit(u + 1, count);
      graph.adj[u].forEach(function (v) {
        if (usedV[v]) return;
        usedV[v] = true;
        pairU[u] = v;
        visit(u + 1, count + 1);
        pairU[u] = -1;
        usedV[v] = false;
      });
    }

    visit(0, 0);
    return best;
  }

  function alternatingReachability(graph, pairU, pairV) {
    var reachU = graph.left.map(function () { return false; });
    var reachV = graph.right.map(function () { return false; });
    var queue = [];

    pairU.forEach(function (v, u) {
      if (v < 0) {
        reachU[u] = true;
        queue.push({ side: "U", index: u });
      }
    });

    for (var head = 0; head < queue.length; head += 1) {
      var node = queue[head];
      if (node.side === "U") {
        graph.adj[node.index].forEach(function (v) {
          if (pairU[node.index] === v || reachV[v]) return;
          reachV[v] = true;
          queue.push({ side: "V", index: v });
        });
      } else {
        var mate = pairV[node.index];
        if (mate >= 0 && !reachU[mate]) {
          reachU[mate] = true;
          queue.push({ side: "U", index: mate });
        }
      }
    }

    return {
      reachU: reachU,
      reachV: reachV,
      coverU: reachU.map(function (reachable) { return !reachable; }),
      coverV: reachV.slice()
    };
  }

  function coverSize(cover) {
    return cover.coverU.filter(Boolean).length + cover.coverV.filter(Boolean).length;
  }

  function isMatchingValid(graph, pairU, pairV) {
    var seenV = {};
    for (var u = 0; u < pairU.length; u += 1) {
      var v = pairU[u];
      if (v < 0) continue;
      if (seenV[v]) return false;
      seenV[v] = true;
      if (pairV[v] !== u) return false;
      if (graph.adj[u].indexOf(v) < 0) return false;
    }
    return true;
  }

  function coverHitsEveryEdge(graph, cover) {
    return graph.edges.every(function (edge) {
      return cover.coverU[edge.u] || cover.coverV[edge.v];
    });
  }

  function pathIsAugmenting(graph, path, beforePairU, beforePairV) {
    if (!path || path.length < 2 || path.length % 2 !== 0) return false;
    if (path[0].side !== "U" || path[path.length - 1].side !== "V") return false;
    if (beforePairU[path[0].index] >= 0) return false;
    if (beforePairV[path[path.length - 1].index] >= 0) return false;

    var seen = {};
    for (var i = 0; i < path.length; i += 1) {
      var key = path[i].side + path[i].index;
      if (seen[key]) return false;
      seen[key] = true;
      if (i + 1 >= path.length) continue;
      var a = path[i];
      var b = path[i + 1];
      if (a.side === b.side) return false;
      var u = a.side === "U" ? a.index : b.index;
      var v = a.side === "V" ? a.index : b.index;
      if (graph.adj[u].indexOf(v) < 0) return false;
      var shouldBeMatched = i % 2 === 1;
      if (shouldBeMatched && beforePairU[u] !== v) return false;
      if (!shouldBeMatched && beforePairU[u] === v) return false;
    }
    return true;
  }

  function phasePathsAreVertexDisjoint(paths) {
    var seen = {};
    for (var p = 0; p < paths.length; p += 1) {
      for (var i = 0; i < paths[p].length; i += 1) {
        var key = paths[p][i].side + paths[p][i].index;
        if (seen[key]) return false;
        seen[key] = true;
      }
    }
    return true;
  }

  function verifyResult(graph, hk, baseline, brute, cover) {
    var issues = [];
    if (!isMatchingValid(graph, hk.pairU, hk.pairV)) issues.push("Hopcroft-Karp matching is invalid");
    if (!isMatchingValid(graph, baseline.pairU, baseline.pairV)) issues.push("single-path matching is invalid");
    if (hk.matching !== brute.size) issues.push("Hopcroft-Karp size " + hk.matching + " != brute force " + brute.size);
    if (baseline.matching !== brute.size) issues.push("single-path size " + baseline.matching + " != brute force " + brute.size);
    if (!coverHitsEveryEdge(graph, cover)) issues.push("alternating cover misses an edge");
    if (coverSize(cover) !== hk.matching) issues.push("cover size " + coverSize(cover) + " != matching size " + hk.matching);

    hk.phases.forEach(function (phase) {
      if (!phase.terminal && !phase.bfs.found) issues.push("phase " + phase.index + " augmented without BFS path");
      if (!phase.terminal && phase.paths.length === 0) issues.push("phase " + phase.index + " found no paths");
      if (!phase.terminal && !phasePathsAreVertexDisjoint(phase.paths)) issues.push("phase " + phase.index + " paths share a vertex");
      phase.paths.forEach(function (path, index) {
        if (!pathIsAugmenting(graph, path, phase.before.pairU, phase.before.pairV)) {
          issues.push("phase " + phase.index + " path " + index + " is not augmenting");
        }
      });
      if (phase.matchingAfter - phase.matchingBefore !== phase.paths.length) {
        issues.push("phase " + phase.index + " matching delta does not equal path count");
      }
    });

    return {
      ok: issues.length === 0,
      issues: issues
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var graph = makeGraph(params.example);
    var hk = hopcroftKarp(graph);
    var baseline = singlePathAugmenting(graph);
    var brute = bruteForceMaximum(graph);
    var cover = alternatingReachability(graph, hk.pairU, hk.pairV);
    var audit = verifyResult(graph, hk, baseline, brute, cover);
    var phase = clamp(params.phase, 0, Math.max(0, hk.phases.length - 1));
    return {
      params: params,
      graph: graph,
      hk: hk,
      baseline: baseline,
      brute: brute,
      cover: cover,
      audit: audit,
      phase: phase
    };
  }

  function auditHopcroftKarp() {
    var issues = [];
    var reports = [];
    Object.keys(EXAMPLES).forEach(function (key) {
      var state = evaluate({ example: key });
      if (!state.audit.ok) {
        state.audit.issues.forEach(function (issue) {
          issues.push(key + ": " + issue);
        });
      }
      reports.push({
        example: key,
        label: state.graph.label,
        left: state.graph.left.length,
        right: state.graph.right.length,
        edges: state.graph.edges.length,
        matching: state.hk.matching,
        phases: state.hk.phases.filter(function (phase) { return !phase.terminal; }).length,
        hkAugmentingPaths: state.hk.phases.reduce(function (sum, phase) { return sum + phase.paths.length; }, 0),
        singlePathAugmentations: state.baseline.paths.length,
        coverSize: coverSize(state.cover)
      });
    });

    var exhaustiveCases = 0;
    for (var nU = 1; nU <= 4; nU += 1) {
      for (var nV = 1; nV <= 4; nV += 1) {
        var edgeCount = nU * nV;
        var total = Math.pow(2, edgeCount);
        for (var mask = 0; mask < total; mask += 1) {
          var left = [];
          var right = [];
          var edges = [];
          for (var u = 0; u < nU; u += 1) left.push("u" + u);
          for (var v = 0; v < nV; v += 1) right.push("v" + v);
          for (var bit = 0; bit < edgeCount; bit += 1) {
            if (mask & (1 << bit)) edges.push([Math.floor(bit / nV), bit % nV]);
          }
          var key = "tmp";
          EXAMPLES[key] = { label: "tmp", left: left, right: right, edges: edges };
          var state = evaluate({ example: key });
          delete EXAMPLES[key];
          exhaustiveCases += 1;
          if (!state.audit.ok) {
            issues.push("exhaustive " + nU + "x" + nV + " mask " + mask + ": " + state.audit.issues.join("; "));
          }
        }
      }
    }

    return {
      ok: issues.length === 0,
      issues: issues,
      reports: reports,
      exhaustiveCases: exhaustiveCases
    };
  }

  function compact(value, limit) {
    value = String(value);
    if (value.length <= limit) return value;
    return value.slice(0, Math.max(0, limit - 1)) + "...";
  }

  function fmt(value) {
    return Number(value).toLocaleString("en-US");
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

  function nodePositions(graph, box) {
    var posU = [];
    var posV = [];
    var top = box.y + 56;
    var height = box.h - 92;
    var xU = box.x + 86;
    var xV = box.x + box.w - 86;
    graph.left.forEach(function (_, i) {
      posU[i] = {
        x: xU,
        y: top + height * (i + 0.5) / graph.left.length
      };
    });
    graph.right.forEach(function (_, i) {
      posV[i] = {
        x: xV,
        y: top + height * (i + 0.5) / graph.right.length
      };
    });
    return {
      U: posU,
      V: posV
    };
  }

  function drawEdge(ctx, from, to, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1.4;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawGraph(ctx, state, box) {
    var graph = state.graph;
    var phase = state.hk.phases[state.phase] || state.hk.phases[0];
    var pairs = phase ? phase.after.pairU : state.hk.pairU;
    var bfs = phase ? phase.bfs : null;
    var pathSet = pathEdgeSet(phase ? phase.paths : []);
    var pos = nodePositions(graph, box);
    panel(ctx, box, "bipartite graph and phase " + state.phase);

    graph.edges.forEach(function (edge) {
      var key = edgeKey(edge.u, edge.v);
      var matched = isMatchedEdge(pairs, edge.u, edge.v);
      var inPath = pathSet[key];
      drawEdge(ctx, pos.U[edge.u], pos.V[edge.v], inPath ? COLORS.path : matched ? COLORS.matched : COLORS.edge, inPath ? 4 : matched ? 3 : 1.4);
    });

    if (bfs) {
      bfs.layerEdges.forEach(function (edge) {
        drawEdge(ctx, pos.U[edge.u], pos.V[edge.v], edge.matched ? COLORS.bfs : COLORS.paleBfs, edge.matched ? 2.2 : 1.2, edge.matched ? [4, 4] : [2, 5]);
      });
    }

    function drawNode(side, index, label, p) {
      var isU = side === "U";
      var paired = isU ? pairs[index] >= 0 : (phase ? phase.after.pairV[index] : state.hk.pairV[index]) >= 0;
      var reached = bfs ? (isU ? bfs.dist[index] < INF : bfs.visitedV[index]) : false;
      var inCover = isU ? state.cover.coverU[index] : state.cover.coverV[index];
      ctx.fillStyle = inCover ? COLORS.paleCover : reached ? COLORS.paleBfs : paired ? COLORS.paleMatched : COLORS.white;
      ctx.strokeStyle = paired ? COLORS.matched : COLORS.free;
      ctx.lineWidth = paired ? 2.2 : 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      text(ctx, compact(label, 8), p.x, p.y + 4, 11, COLORS.text, 750, "center");
      if (isU && bfs && bfs.dist[index] < INF) {
        text(ctx, "d" + bfs.dist[index], p.x - 30, p.y + 4, 10, COLORS.bfs, 800, "center");
      }
    }

    graph.left.forEach(function (label, i) {
      drawNode("U", i, label, pos.U[i]);
    });
    graph.right.forEach(function (label, i) {
      drawNode("V", i, label, pos.V[i]);
    });

    text(ctx, "left", box.x + 56, box.y + 46, 11, COLORS.muted, 750);
    text(ctx, "right", box.x + box.w - 118, box.y + 46, 11, COLORS.muted, 750);
    text(ctx, "green = matched, orange = augmenting paths, purple fill = min cover", box.x + 14, box.y + box.h - 16, 11, COLORS.muted, 650);
  }

  function pathLabel(graph, path) {
    return path.map(function (node) {
      return node.side === "U" ? graph.left[node.index] : graph.right[node.index];
    }).join(" -> ");
  }

  function drawPhaseLedger(ctx, state, box) {
    var phase = state.hk.phases[state.phase] || state.hk.phases[0];
    panel(ctx, box, "phase ledger");
    if (!phase) return;
    var y = box.y + 56;
    text(ctx, phase.terminal ? "No augmenting path remains." : "Shortest augmenting paths found: " + phase.paths.length, box.x + 16, y, 15, phase.terminal ? COLORS.matched : COLORS.text, 800);
    y += 30;
    text(ctx, "matching " + phase.matchingBefore + " -> " + phase.matchingAfter, box.x + 16, y, 13, COLORS.muted, 700);
    y += 32;
    if (phase.paths.length === 0) {
      text(ctx, "The final alternating forest yields the cover certificate.", box.x + 16, y, 12, COLORS.muted, 650);
    }
    phase.paths.forEach(function (path, i) {
      ctx.fillStyle = COLORS.palePath;
      ctx.fillRect(box.x + 14, y - 17, box.w - 28, 25);
      text(ctx, "P" + (i + 1), box.x + 24, y, 12, COLORS.path, 850);
      text(ctx, compact(pathLabel(state.graph, path), 46), box.x + 58, y, 12, COLORS.text, 650);
      y += 31;
    });
    y = Math.max(y + 8, box.y + box.h - 70);
    text(ctx, "single-path baseline", box.x + 16, y, 12, COLORS.muted, 750);
    text(ctx, state.baseline.paths.length + " augmentations, " + state.baseline.scans + " free-left scans", box.x + 16, y + 22, 12, COLORS.text, 700);
    text(ctx, "Hopcroft-Karp batches " + state.hk.phases.filter(function (p) { return !p.terminal; }).length + " phases", box.x + 16, y + 44, 12, COLORS.text, 700);
  }

  function drawCover(ctx, state, box) {
    panel(ctx, box, "matching certificate");
    var coverU = [];
    var coverV = [];
    state.cover.coverU.forEach(function (on, i) { if (on) coverU.push(state.graph.left[i]); });
    state.cover.coverV.forEach(function (on, i) { if (on) coverV.push(state.graph.right[i]); });
    text(ctx, "maximum matching size", box.x + 16, box.y + 58, 12, COLORS.muted, 750);
    text(ctx, state.hk.matching, box.x + 192, box.y + 58, 18, COLORS.matched, 850);
    text(ctx, "minimum cover size", box.x + 16, box.y + 92, 12, COLORS.muted, 750);
    text(ctx, coverSize(state.cover), box.x + 192, box.y + 92, 18, COLORS.cover, 850);
    text(ctx, "cover U: " + (coverU.length ? coverU.join(", ") : "-"), box.x + 16, box.y + 132, 12, COLORS.text, 650);
    text(ctx, "cover V: " + (coverV.length ? coverV.join(", ") : "-"), box.x + 16, box.y + 158, 12, COLORS.text, 650);
    text(ctx, state.audit.ok ? "oracle checks pass" : "audit failed", box.x + 16, box.y + box.h - 20, 12, state.audit.ok ? COLORS.matched : COLORS.free, 800);
  }

  function drawPhaseBars(ctx, state, box) {
    panel(ctx, box, "augmenting paths per phase");
    var phases = state.hk.phases.filter(function (phase) { return !phase.terminal; });
    var max = Math.max(1, phases.reduce(function (m, phase) { return Math.max(m, phase.paths.length); }, 0), state.baseline.paths.length);
    var x = box.x + 40;
    var y = box.y + 54;
    var w = box.w - 72;
    var h = box.h - 92;
    var barW = Math.max(18, w / Math.max(1, phases.length + 1) - 12);
    phases.forEach(function (phase, i) {
      var bh = h * phase.paths.length / max;
      var bx = x + i * (barW + 12);
      ctx.fillStyle = i === state.phase ? COLORS.path : COLORS.matched;
      ctx.fillRect(bx, y + h - bh, barW, Math.max(2, bh));
      text(ctx, phase.paths.length, bx + barW / 2, y + h - bh - 6, 11, COLORS.text, 750, "center");
      text(ctx, i, bx + barW / 2, y + h + 18, 10, COLORS.muted, 650, "center");
    });
    var bx = x + phases.length * (barW + 12) + 16;
    var bh = h * state.baseline.paths.length / max;
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(bx, y + h - bh, barW, Math.max(2, bh));
    text(ctx, state.baseline.paths.length, bx + barW / 2, y + h - bh - 6, 11, COLORS.text, 750, "center");
    text(ctx, "DFS", bx + barW / 2, y + h + 18, 10, COLORS.muted, 650, "center");
  }

  function draw(canvas, state) {
    var width = 1080;
    var height = 720;
    var ctx = setCanvasSize(canvas, width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);
    drawGraph(ctx, state, { x: 24, y: 24, w: 626, h: 464 });
    drawPhaseLedger(ctx, state, { x: 674, y: 24, w: 382, h: 464 });
    drawPhaseBars(ctx, state, { x: 24, y: 512, w: 432, h: 184 });
    drawCover(ctx, state, { x: 480, y: 512, w: 576, h: 184 });
  }

  function updateOutputs(root, state) {
    root.querySelectorAll("output[data-value]").forEach(function (output) {
      var name = output.getAttribute("data-value");
      if (name === "example") output.textContent = state.graph.label;
      if (name === "phase") output.textContent = state.phase + " / " + Math.max(0, state.hk.phases.length - 1);
    });
    setText(root, "left", state.graph.left.length);
    setText(root, "right", state.graph.right.length);
    setText(root, "edges", state.graph.edges.length);
    setText(root, "matching", state.hk.matching);
    setText(root, "phases", state.hk.phases.filter(function (phase) { return !phase.terminal; }).length);
    setText(root, "dfs", state.baseline.paths.length);
    setText(root, "cover", coverSize(state.cover));
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
      uiState.phase = state.phase;
      controls.forEach(function (control) {
        var name = control.getAttribute("data-param");
        if (name === "phase") {
          control.max = Math.max(0, state.hk.phases.length - 1);
          control.value = state.phase;
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
    global.document.querySelectorAll("[data-hopcroft-karp-lab]").forEach(function (root) {
      mount(root);
    });
  }

  var api = {
    EXAMPLES: EXAMPLES,
    makeGraph: makeGraph,
    hopcroftKarp: hopcroftKarp,
    singlePathAugmenting: singlePathAugmenting,
    bruteForceMaximum: bruteForceMaximum,
    alternatingReachability: alternatingReachability,
    evaluate: evaluate,
    auditHopcroftKarp: auditHopcroftKarp,
    isMatchingValid: isMatchingValid,
    coverHitsEveryEdge: coverHitsEveryEdge
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.HopcroftKarpLab = api;
    if (global.document) {
      if (global.document.readyState === "loading") {
        global.document.addEventListener("DOMContentLoaded", mountAll);
      } else {
        mountAll();
      }
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
