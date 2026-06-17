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
    rose: "#e11d48",
    softBad: "rgba(190, 18, 60, 0.12)",
    softBlue: "rgba(37, 99, 235, 0.11)",
    softGold: "rgba(217, 119, 6, 0.14)",
    softGood: "rgba(15, 118, 110, 0.12)",
    softPurple: "rgba(124, 58, 237, 0.12)",
    white: "#ffffff"
  };

  var COLOR_PALETTE = [
    "#2563eb",
    "#0f766e",
    "#d97706",
    "#7c3aed",
    "#be123c",
    "#0891b2",
    "#65a30d",
    "#c2410c",
    "#4338ca",
    "#db2777"
  ];

  var DEFAULTS = {
    pair: "c6-triangles",
    round: 0
  };

  var MAX_ROUNDS = 6;

  var PAIRS = {
    "c6-triangles": {
      label: "C6 vs two triangles",
      left: {
        edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
        label: "cycle C6",
        layout: "cycle",
        nodes: ["0", "1", "2", "3", "4", "5"]
      },
      right: {
        edges: [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]],
        label: "C3 + C3",
        layout: "two-triangles",
        nodes: ["0", "1", "2", "3", "4", "5"]
      },
      note: "All nodes stay 2-neighbor symmetric; the right graph has triangles."
    },
    "prism-k33": {
      label: "prism vs K3,3",
      left: {
        edges: [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]],
        label: "triangular prism",
        layout: "prism",
        nodes: ["0", "1", "2", "3", "4", "5"]
      },
      right: {
        edges: [[0, 3], [0, 4], [0, 5], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5]],
        label: "K3,3",
        layout: "bipartite",
        nodes: ["0", "1", "2", "3", "4", "5"]
      },
      note: "Connected and 3-regular; 1-WL stays blind to the prism triangles."
    },
    "path-cycle": {
      label: "path vs cycle",
      left: {
        edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
        label: "path P6",
        layout: "path",
        nodes: ["0", "1", "2", "3", "4", "5"]
      },
      right: {
        edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
        label: "cycle C6",
        layout: "cycle",
        nodes: ["0", "1", "2", "3", "4", "5"]
      },
      note: "The path endpoints expose a degree-count mismatch at round one."
    },
    "c6-relabel": {
      label: "C6 vs relabeled C6",
      left: {
        edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
        label: "cycle C6",
        layout: "cycle",
        nodes: ["0", "1", "2", "3", "4", "5"]
      },
      right: {
        edges: [[4, 1], [1, 5], [5, 0], [0, 3], [3, 2], [2, 4]],
        label: "same cycle, relabeled",
        layout: "cycle",
        nodes: ["0", "1", "2", "3", "4", "5"]
      },
      note: "Relabeling node names preserves the graph-level color histogram."
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      pair: PAIRS[raw.pair] ? raw.pair : DEFAULTS.pair,
      round: snap(raw.round, DEFAULTS.round, 0, MAX_ROUNDS, 1)
    };
  }

  function edgeKey(a, b) {
    return a < b ? a + "--" + b : b + "--" + a;
  }

  function graphNodeCount(graph) {
    return graph.nodes.length;
  }

  function adjacency(graph) {
    var n = graphNodeCount(graph);
    var out = [];
    for (var i = 0; i < n; i += 1) out.push([]);
    graph.edges.forEach(function (edge) {
      var a = edge[0];
      var b = edge[1];
      out[a].push(b);
      out[b].push(a);
    });
    out.forEach(function (neighbors) { neighbors.sort(function (a, b) { return a - b; }); });
    return out;
  }

  function adjacencySet(graph) {
    var set = {};
    graph.edges.forEach(function (edge) {
      set[edgeKey(edge[0], edge[1])] = true;
    });
    return set;
  }

  function degreeSequence(graph) {
    return adjacency(graph).map(function (neighbors) { return neighbors.length; }).sort(function (a, b) { return a - b; });
  }

  function isRegular(graph) {
    var degrees = degreeSequence(graph);
    return degrees.every(function (degree) { return degree === degrees[0]; });
  }

  function triangleCount(graph) {
    var n = graphNodeCount(graph);
    var set = adjacencySet(graph);
    var count = 0;
    for (var a = 0; a < n; a += 1) {
      for (var b = a + 1; b < n; b += 1) {
        for (var c = b + 1; c < n; c += 1) {
          if (set[edgeKey(a, b)] && set[edgeKey(a, c)] && set[edgeKey(b, c)]) count += 1;
        }
      }
    }
    return count;
  }

  function componentCount(graph) {
    var adj = adjacency(graph);
    var seen = {};
    var count = 0;
    for (var i = 0; i < adj.length; i += 1) {
      if (seen[i]) continue;
      count += 1;
      var stack = [i];
      seen[i] = true;
      while (stack.length) {
        var node = stack.pop();
        adj[node].forEach(function (next) {
          if (!seen[next]) {
            seen[next] = true;
            stack.push(next);
          }
        });
      }
    }
    return count;
  }

  function isBipartite(graph) {
    var adj = adjacency(graph);
    var color = {};
    for (var i = 0; i < adj.length; i += 1) {
      if (color[i] != null) continue;
      color[i] = 0;
      var queue = [i];
      while (queue.length) {
        var node = queue.shift();
        for (var j = 0; j < adj[node].length; j += 1) {
          var next = adj[node][j];
          if (color[next] == null) {
            color[next] = 1 - color[node];
            queue.push(next);
          } else if (color[next] === color[node]) {
            return false;
          }
        }
      }
    }
    return true;
  }

  function validateGraph(graph) {
    var n = graphNodeCount(graph);
    var seen = {};
    graph.edges.forEach(function (edge) {
      if (edge.length !== 2) throw new Error(graph.label + " has a malformed edge");
      if (edge[0] === edge[1]) throw new Error(graph.label + " has a self loop");
      if (edge[0] < 0 || edge[0] >= n || edge[1] < 0 || edge[1] >= n) throw new Error(graph.label + " edge out of range");
      var key = edgeKey(edge[0], edge[1]);
      if (seen[key]) throw new Error(graph.label + " has a duplicate edge " + key);
      seen[key] = true;
    });
  }

  function histogram(colors) {
    var out = {};
    colors.forEach(function (color) {
      out[color] = (out[color] || 0) + 1;
    });
    return out;
  }

  function histogramKeys(a, b) {
    var keys = {};
    Object.keys(a || {}).forEach(function (key) { keys[key] = true; });
    Object.keys(b || {}).forEach(function (key) { keys[key] = true; });
    return Object.keys(keys).map(Number).sort(function (x, y) { return x - y; });
  }

  function histEqual(a, b) {
    var keys = histogramKeys(a, b);
    return keys.every(function (key) {
      return (a[key] || 0) === (b[key] || 0);
    });
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function sortedMultiset(values) {
    return values.slice().sort(function (a, b) { return a - b; }).join(",");
  }

  function refinePair(leftGraph, rightGraph, maxRounds) {
    var leftAdj = adjacency(leftGraph);
    var rightAdj = adjacency(rightGraph);
    var leftColors = leftGraph.nodes.map(function () { return 0; });
    var rightColors = rightGraph.nodes.map(function () { return 0; });
    var rounds = [{
      changed: true,
      equal: true,
      left: leftColors.slice(),
      leftHist: histogram(leftColors),
      right: rightColors.slice(),
      rightHist: histogram(rightColors),
      signatures: { left: leftColors.map(function () { return "seed"; }), right: rightColors.map(function () { return "seed"; }) },
      t: 0
    }];

    var firstDifferenceRound = null;
    var stableRound = null;

    for (var t = 1; t <= maxRounds; t += 1) {
      var leftSignatures = leftAdj.map(function (neighbors, index) {
        return leftColors[index] + "|" + sortedMultiset(neighbors.map(function (node) { return leftColors[node]; }));
      });
      var rightSignatures = rightAdj.map(function (neighbors, index) {
        return rightColors[index] + "|" + sortedMultiset(neighbors.map(function (node) { return rightColors[node]; }));
      });
      var signatureSet = {};
      leftSignatures.concat(rightSignatures).forEach(function (sig) {
        signatureSet[sig] = true;
      });
      var signatureMap = {};
      Object.keys(signatureSet).sort().forEach(function (sig, index) {
        signatureMap[sig] = index;
      });
      var nextLeft = leftSignatures.map(function (sig) { return signatureMap[sig]; });
      var nextRight = rightSignatures.map(function (sig) { return signatureMap[sig]; });
      var leftHist = histogram(nextLeft);
      var rightHist = histogram(nextRight);
      var equal = histEqual(leftHist, rightHist);
      var changed = !arraysEqual(leftColors, nextLeft) || !arraysEqual(rightColors, nextRight);
      rounds.push({
        changed: changed,
        equal: equal,
        left: nextLeft.slice(),
        leftHist: leftHist,
        right: nextRight.slice(),
        rightHist: rightHist,
        signatures: { left: leftSignatures, right: rightSignatures },
        t: t
      });
      if (!equal && firstDifferenceRound == null) firstDifferenceRound = t;
      if (!changed && stableRound == null) stableRound = t;
      leftColors = nextLeft;
      rightColors = nextRight;
    }

    return {
      firstDifferenceRound: firstDifferenceRound,
      rounds: rounds,
      stableRound: stableRound == null ? maxRounds : stableRound
    };
  }

  function graphFacts(graph) {
    return {
      bipartite: isBipartite(graph),
      components: componentCount(graph),
      degreeSequence: degreeSequence(graph),
      edges: graph.edges.length,
      nodes: graphNodeCount(graph),
      regular: isRegular(graph),
      triangles: triangleCount(graph)
    };
  }

  function factText(facts) {
    var degree = facts.regular ? facts.degreeSequence[0] + "-regular" : "degree " + facts.degreeSequence.join(",");
    return facts.nodes + " nodes, " + facts.edges + " edges, " + degree;
  }

  function verdictText(refinement) {
    if (refinement.firstDifferenceRound != null) return "distinguished at round " + refinement.firstDifferenceRound;
    return "not distinguished by 1-WL";
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var pair = PAIRS[params.pair];
    validateGraph(pair.left);
    validateGraph(pair.right);
    var refinement = refinePair(pair.left, pair.right, MAX_ROUNDS);
    var selectedRound = clamp(params.round, 0, refinement.rounds.length - 1);
    var selected = refinement.rounds[selectedRound];
    var facts = {
      left: graphFacts(pair.left),
      right: graphFacts(pair.right)
    };
    return {
      facts: facts,
      pair: pair,
      params: {
        pair: params.pair,
        round: selectedRound
      },
      refinement: refinement,
      selected: selected,
      verdict: verdictText(refinement)
    };
  }

  function fmtBool(value) {
    return value ? "yes" : "no";
  }

  function fmtHist(hist) {
    return histogramKeys(hist, {}).map(function (key) {
      return "c" + key + ":" + hist[key];
    }).join("  ");
  }

  function metric(label, value, tone) {
    return '<div class="wl-lab__metric ' + (tone || "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function colorFor(id) {
    return COLOR_PALETTE[id % COLOR_PALETTE.length];
  }

  function setupCanvas(canvas) {
    if (!canvas || !canvas.getContext) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 940));
    var compact = width < 680;
    var height = compact ? 1180 : 820;
    var ratio = Math.max(1, global.devicePixelRatio || 1);
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { compact: compact, ctx: ctx, height: height, width: width };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fillText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/\s+/);
    var line = "";
    var lines = [];
    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    var limit = maxLines || lines.length;
    for (var i = 0; i < Math.min(limit, lines.length); i += 1) {
      var out = lines[i];
      if (i === limit - 1 && lines.length > limit) out = out.replace(/[.,;:]?$/, "") + "...";
      fillText(ctx, out, x, y + i * lineHeight, COLORS.muted, 12, 500);
    }
    return Math.min(limit, lines.length) * lineHeight;
  }

  function panel(ctx, box, title, subtitle) {
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.stroke();
    fillText(ctx, title, box.x + 14, box.y + 12, COLORS.ink, 14, 750);
    if (subtitle) wrapText(ctx, subtitle, box.x + 14, box.y + 32, box.w - 28, 15, 2);
  }

  function layoutGraph(graph, box) {
    var positions = {};
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2;
    var radius = Math.min(box.w, box.h) * 0.32;
    if (graph.layout === "path") {
      graph.nodes.forEach(function (_, index) {
        positions[index] = {
          x: box.x + 24 + index * ((box.w - 48) / (graph.nodes.length - 1)),
          y: cy
        };
      });
    } else if (graph.layout === "two-triangles") {
      var centers = [
        { x: box.x + box.w * 0.31, y: cy },
        { x: box.x + box.w * 0.69, y: cy }
      ];
      [0, 1].forEach(function (component) {
        for (var i = 0; i < 3; i += 1) {
          var angle = -Math.PI / 2 + i * 2 * Math.PI / 3;
          positions[component * 3 + i] = {
            x: centers[component].x + Math.cos(angle) * radius * 0.55,
            y: centers[component].y + Math.sin(angle) * radius * 0.55
          };
        }
      });
    } else if (graph.layout === "prism") {
      var xs = [box.x + box.w * 0.25, box.x + box.w * 0.50, box.x + box.w * 0.75];
      positions[0] = { x: xs[0], y: box.y + box.h * 0.34 };
      positions[1] = { x: xs[1], y: box.y + box.h * 0.18 };
      positions[2] = { x: xs[2], y: box.y + box.h * 0.34 };
      positions[3] = { x: xs[0], y: box.y + box.h * 0.72 };
      positions[4] = { x: xs[1], y: box.y + box.h * 0.88 };
      positions[5] = { x: xs[2], y: box.y + box.h * 0.72 };
    } else if (graph.layout === "bipartite") {
      [0, 1, 2].forEach(function (node, index) {
        positions[node] = { x: box.x + box.w * 0.30, y: box.y + box.h * (0.24 + index * 0.26) };
      });
      [3, 4, 5].forEach(function (node, index) {
        positions[node] = { x: box.x + box.w * 0.70, y: box.y + box.h * (0.24 + index * 0.26) };
      });
    } else {
      graph.nodes.forEach(function (_, index) {
        var angle = -Math.PI / 2 + index * 2 * Math.PI / graph.nodes.length;
        positions[index] = {
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius
        };
      });
    }
    return positions;
  }

  function drawEdge(ctx, a, b) {
    ctx.strokeStyle = "#aeb8c2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function drawGraph(ctx, graph, colors, box, caption, facts) {
    fillText(ctx, graph.label, box.x, box.y - 18, COLORS.ink, 13, 750);
    var positions = layoutGraph(graph, box);
    graph.edges.forEach(function (edge) {
      drawEdge(ctx, positions[edge[0]], positions[edge[1]]);
    });
    graph.nodes.forEach(function (label, index) {
      var p = positions[index];
      ctx.beginPath();
      ctx.fillStyle = colorFor(colors[index]);
      ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.white;
      ctx.lineWidth = 2;
      ctx.stroke();
      fillText(ctx, label, p.x, p.y - 7, COLORS.white, 12, 800, "center");
    });
    wrapText(ctx, caption || factText(facts), box.x, box.y + box.h + 8, box.w, 14, 2);
  }

  function splitGraphBoxes(box, compact) {
    if (compact) {
      return [
        { x: box.x + 18, y: box.y + 92, w: box.w - 36, h: 112 },
        { x: box.x + 18, y: box.y + 260, w: box.w - 36, h: 112 }
      ];
    }
    return [
      { x: box.x + 20, y: box.y + 78, w: (box.w - 58) / 2, h: box.h - 150 },
      { x: box.x + 38 + (box.w - 58) / 2, y: box.y + 78, w: (box.w - 58) / 2, h: box.h - 150 }
    ];
  }

  function drawGraphPanel(ctx, state, box, compact) {
    var same = state.selected.equal;
    var title = "Color refinement, round " + state.params.round;
    var subtitle = same ? "The graph-level color histograms still match." : "The pooled color histograms differ here.";
    panel(ctx, box, title, subtitle);
    var graphBoxes = splitGraphBoxes(box, compact);
    drawGraph(ctx, state.pair.left, state.selected.left, graphBoxes[0], factText(state.facts.left), state.facts.left);
    drawGraph(ctx, state.pair.right, state.selected.right, graphBoxes[1], factText(state.facts.right), state.facts.right);
    var y = box.y + box.h - 34;
    roundRect(ctx, box.x + 14, y, box.w - 28, 22, 6);
    ctx.fillStyle = same ? COLORS.softBlue : COLORS.softBad;
    ctx.fill();
    fillText(ctx, same ? "1-WL readout: same multiset of colors" : "1-WL readout: different color counts", box.x + 24, y + 4, same ? COLORS.blue : COLORS.bad, 12, 800);
  }

  function drawStackedBar(ctx, hist, x, y, w, h) {
    var total = Object.keys(hist).reduce(function (sum, key) { return sum + hist[key]; }, 0) || 1;
    var offset = x;
    histogramKeys(hist, {}).forEach(function (key) {
      var segment = w * hist[key] / total;
      ctx.fillStyle = colorFor(key);
      ctx.fillRect(offset, y, segment, h);
      offset += segment;
    });
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  function drawTapePanel(ctx, state, box, compact) {
    panel(ctx, box, "The 1-WL tape", "Top bar is left graph; bottom bar is right graph.");
    var rounds = state.refinement.rounds;
    var innerX = box.x + 18;
    var innerY = box.y + (compact ? 84 : 78);
    var innerW = box.w - 36;
    var colGap = 8;
    var colW = Math.max(28, (innerW - colGap * (rounds.length - 1)) / rounds.length);
    rounds.forEach(function (round, index) {
      var x = innerX + index * (colW + colGap);
      var selected = index === state.params.round;
      roundRect(ctx, x - 3, innerY - 22, colW + 6, compact ? 94 : 108, 6);
      ctx.fillStyle = selected ? COLORS.softGold : round.equal ? COLORS.panel : COLORS.softBad;
      ctx.fill();
      ctx.strokeStyle = selected ? COLORS.gold : COLORS.axis;
      ctx.stroke();
      fillText(ctx, String(index), x + colW / 2, innerY - 17, selected ? COLORS.gold : COLORS.muted, 11, 800, "center");
      drawStackedBar(ctx, round.leftHist, x, innerY + 2, colW, 20);
      drawStackedBar(ctx, round.rightHist, x, innerY + 34, colW, 20);
      fillText(ctx, round.equal ? "=" : "x", x + colW / 2, innerY + 61, round.equal ? COLORS.good : COLORS.bad, 12, 850, "center");
    });
    var footer = state.refinement.firstDifferenceRound == null
      ? (compact ? "No separating round before stabilization." : "No separating round before stabilization: a sum/readout over colors stays identical.")
      : (compact ? "First separating round: " + state.refinement.firstDifferenceRound + "." : "First separating round: " + state.refinement.firstDifferenceRound + ". The color histogram becomes a graph invariant with different counts.");
    wrapText(ctx, footer, box.x + 18, box.y + box.h - 42, box.w - 36, 15, 2);
  }

  function drawHistPanel(ctx, state, box) {
    panel(ctx, box, "What message passing sees", "Selected-round color counts after pooling node states.");
    var hist = histogramKeys(state.selected.leftHist, state.selected.rightHist);
    var maxCount = Math.max.apply(null, hist.map(function (key) {
      return Math.max(state.selected.leftHist[key] || 0, state.selected.rightHist[key] || 0);
    }).concat([1]));
    var chartX = box.x + 28;
    var chartY = box.y + 86;
    var chartW = box.w - 56;
    var chartH = Math.max(120, box.h - 172);
    var groupW = chartW / Math.max(1, hist.length);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g += 1) {
      var y = chartY + chartH - g * chartH / 3;
      ctx.beginPath();
      ctx.moveTo(chartX, y);
      ctx.lineTo(chartX + chartW, y);
      ctx.stroke();
      fillText(ctx, String(Math.round(maxCount * g / 3)), chartX - 8, y - 7, COLORS.muted, 10, 600, "right");
    }
    hist.forEach(function (key, index) {
      var x = chartX + index * groupW + groupW * 0.18;
      var barW = Math.max(8, groupW * 0.25);
      var lh = chartH * ((state.selected.leftHist[key] || 0) / maxCount);
      var rh = chartH * ((state.selected.rightHist[key] || 0) / maxCount);
      ctx.fillStyle = colorFor(key);
      ctx.fillRect(x, chartY + chartH - lh, barW, lh);
      ctx.fillStyle = "rgba(23, 32, 38, 0.72)";
      ctx.fillRect(x + barW + 4, chartY + chartH - rh, barW, rh);
      fillText(ctx, "c" + key, x + barW, chartY + chartH + 9, COLORS.muted, 11, 700, "center");
    });
    fillText(ctx, "left", chartX + chartW - 70, box.y + box.h - 46, COLORS.ink, 11, 750);
    ctx.fillStyle = colorFor(hist[0] || 0);
    ctx.fillRect(chartX + chartW - 94, box.y + box.h - 45, 16, 9);
    fillText(ctx, "right", chartX + chartW - 70, box.y + box.h - 28, COLORS.ink, 11, 750);
    ctx.fillStyle = "rgba(23, 32, 38, 0.72)";
    ctx.fillRect(chartX + chartW - 94, box.y + box.h - 27, 16, 9);
  }

  function drawFactRow(ctx, label, left, right, x, y, w, maxValue, format) {
    var leftValue = Number(left);
    var rightValue = Number(right);
    var barW = w * Math.max(leftValue, rightValue, 0) / Math.max(1, maxValue);
    fillText(ctx, label, x, y, COLORS.ink, 12, 750);
    ctx.fillStyle = COLORS.softBlue;
    ctx.fillRect(x + 92, y + 1, Math.max(4, w * leftValue / Math.max(1, maxValue)), 10);
    ctx.fillStyle = COLORS.softBad;
    ctx.fillRect(x + 92, y + 15, Math.max(4, w * rightValue / Math.max(1, maxValue)), 10);
    ctx.strokeStyle = COLORS.axis;
    ctx.strokeRect(x + 92, y + 1, Math.max(4, barW), 24);
    fillText(ctx, (format || String)(left), x + 102 + w, y - 1, COLORS.blue, 11, 750);
    fillText(ctx, (format || String)(right), x + 102 + w, y + 13, COLORS.bad, 11, 750);
  }

  function drawMissPanel(ctx, state, box) {
    var blind = state.refinement.firstDifferenceRound == null;
    panel(ctx, box, blind ? "What it misses" : "What distinguished it", state.pair.note);
    var facts = state.facts;
    var maxValue = Math.max(facts.left.triangles, facts.right.triangles, facts.left.components, facts.right.components, facts.left.edges, facts.right.edges, 1);
    var x = box.x + 18;
    var y = box.y + 82;
    var w = Math.max(100, box.w - 170);
    drawFactRow(ctx, "triangles", facts.left.triangles, facts.right.triangles, x, y, w, maxValue, String);
    drawFactRow(ctx, "components", facts.left.components, facts.right.components, x, y + 46, w, maxValue, String);
    drawFactRow(ctx, "edges", facts.left.edges, facts.right.edges, x, y + 92, w, maxValue, String);
    roundRect(ctx, x, y + 144, box.w - 36, 54, 8);
    ctx.fillStyle = blind && facts.left.triangles !== facts.right.triangles ? COLORS.softBad : COLORS.softGood;
    ctx.fill();
    var text = blind
      ? "Same color histogram after stabilization; different facts remain outside this message-passing contract."
      : "Here the missed-fact ledger is less mysterious: 1-WL already sees the degree-count mismatch.";
    wrapText(ctx, text, x + 12, y + 156, box.w - 60, 15, 2);
    fillText(ctx, "bipartite: " + fmtBool(facts.left.bipartite) + " vs " + fmtBool(facts.right.bipartite), x, box.y + box.h - 38, COLORS.muted, 12, 650);
  }

  function boxesFor(setup) {
    var pad = 16;
    if (setup.compact) {
      var w = setup.width - pad * 2;
      return [
        { x: pad, y: pad, w: w, h: 476 },
        { x: pad, y: 510, w: w, h: 206 },
        { x: pad, y: 732, w: w, h: 214 },
        { x: pad, y: 962, w: w, h: 202 }
      ];
    }
    var gap = 14;
    var w2 = (setup.width - pad * 2 - gap) / 2;
    return [
      { x: pad, y: pad, w: w2, h: 418 },
      { x: pad + w2 + gap, y: pad, w: w2, h: 206 },
      { x: pad + w2 + gap, y: 236, w: w2, h: 198 },
      { x: pad, y: 448, w: setup.width - pad * 2, h: 354 }
    ];
  }

  function draw(root, state) {
    var canvas = root.querySelector("canvas[data-canvas]");
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, setup.width, setup.height);
    var boxes = boxesFor(setup);
    drawGraphPanel(ctx, state, boxes[0], setup.compact);
    drawTapePanel(ctx, state, boxes[1], setup.compact);
    drawHistPanel(ctx, state, boxes[2]);
    drawMissPanel(ctx, state, boxes[3]);
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
    setOptions(root.querySelector('[data-param="pair"]'), Object.keys(PAIRS).map(function (key) {
      return { label: PAIRS[key].label, value: key };
    }), state.params.pair);
    var roundInput = root.querySelector('[data-param="round"]');
    if (roundInput) roundInput.value = state.params.round;
    var values = {
      pair: state.pair.label,
      round: String(state.params.round)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function render(root) {
    var state = evaluate(paramsFromRoot(root));
    updateControls(root, state);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var hiddenGap = Math.abs(state.facts.left.triangles - state.facts.right.triangles);
      var blind = state.refinement.firstDifferenceRound == null;
      metrics.innerHTML = [
        metric("pair", state.pair.label),
        metric("1-WL verdict", state.verdict, blind ? "warn" : "good"),
        metric("left colors", fmtHist(state.selected.leftHist)),
        metric("right colors", fmtHist(state.selected.rightHist)),
        metric("triangle gap", String(hiddenGap), hiddenGap && blind ? "bad" : ""),
        metric("stable round", String(state.refinement.stableRound))
      ].join("");
    }
    draw(root, state);
    root.__wlMessagePassingState = state;
  }

  function init(root) {
    if (!root || root.__wlMessagePassingReady) return;
    root.__wlMessagePassingReady = true;
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
    render(root);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function histTotal(hist) {
    return Object.keys(hist).reduce(function (sum, key) {
      return sum + hist[key];
    }, 0);
  }

  function histShape(hist) {
    return Object.keys(hist).map(function (key) {
      return hist[key];
    }).sort(function (a, b) { return a - b; }).join(",");
  }

  function factSignature(facts) {
    return [
      facts.bipartite ? "bipartite" : "non-bipartite",
      "components:" + facts.components,
      "degrees:" + facts.degreeSequence.join(","),
      "edges:" + facts.edges,
      "nodes:" + facts.nodes,
      "triangles:" + facts.triangles
    ].join("|");
  }

  function permuteGraph(graph, order) {
    var inverse = {};
    order.forEach(function (oldIndex, newIndex) {
      inverse[oldIndex] = newIndex;
    });
    return {
      edges: graph.edges.map(function (edge) {
        return [inverse[edge[0]], inverse[edge[1]]];
      }),
      label: graph.label + " permuted",
      layout: graph.layout,
      nodes: order.map(function (oldIndex) { return graph.nodes[oldIndex]; })
    };
  }

  function expectThrows(fn, message) {
    var threw = false;
    try {
      fn();
    } catch (error) {
      threw = true;
    }
    assert(threw, message);
  }

  function assertRoundLedger(state, expectedFirstDifference) {
    var firstDifference = null;
    var stableRound = null;
    state.refinement.rounds.forEach(function (round, index) {
      assert(round.t === index, "round index should match tape index");
      assert(round.left.length === state.facts.left.nodes, "left color vector length should equal node count");
      assert(round.right.length === state.facts.right.nodes, "right color vector length should equal node count");
      assert(histTotal(round.leftHist) === state.facts.left.nodes, "left histogram should count every node");
      assert(histTotal(round.rightHist) === state.facts.right.nodes, "right histogram should count every node");
      assert(round.equal === histEqual(round.leftHist, round.rightHist), "round equality should match shared color histograms");
      if (!round.equal && firstDifference == null) firstDifference = index;
      if (!round.changed && stableRound == null) stableRound = index;
    });
    if (expectedFirstDifference === null) {
      assert(state.refinement.firstDifferenceRound === null, "pair should stay indistinguishable by 1-WL");
    } else {
      assert(state.refinement.firstDifferenceRound === expectedFirstDifference, "first distinguishing round should match expectation");
    }
    assert(state.refinement.firstDifferenceRound === firstDifference, "first-difference ledger should match tape");
    assert(state.refinement.stableRound === (stableRound == null ? MAX_ROUNDS : stableRound), "stable-round ledger should match tape");
  }

  function assertSameFacts(a, b, message) {
    assert(factSignature(graphFacts(a)) === factSignature(graphFacts(b)), message);
  }

  function assertPermutationInvariantPair(pairKey, orderLeft, orderRight) {
    var pair = PAIRS[pairKey];
    var canonical = refinePair(pair.left, pair.right, MAX_ROUNDS);
    var left = permuteGraph(pair.left, orderLeft);
    var right = permuteGraph(pair.right, orderRight);
    var permuted = refinePair(left, right, MAX_ROUNDS);
    assertSameFacts(pair.left, left, pairKey + " left permutation should preserve graph facts");
    assertSameFacts(pair.right, right, pairKey + " right permutation should preserve graph facts");
    assert(permuted.firstDifferenceRound === canonical.firstDifferenceRound, pairKey + " first difference should survive relabeling");
    assert(permuted.stableRound === canonical.stableRound, pairKey + " stable round should survive relabeling");
    canonical.rounds.forEach(function (round, index) {
      assert(permuted.rounds[index].equal === round.equal, pairKey + " equality tape should survive relabeling");
      assert(histShape(permuted.rounds[index].leftHist) === histShape(round.leftHist), pairKey + " left color-class sizes should survive relabeling");
      assert(histShape(permuted.rounds[index].rightHist) === histShape(round.rightHist), pairKey + " right color-class sizes should survive relabeling");
    });
  }

  function audit() {
    var checked = 0;
    var permutationOrderA = [2, 5, 1, 4, 0, 3];
    var permutationOrderB = [5, 2, 4, 1, 3, 0];
    Object.keys(PAIRS).forEach(function (key) {
      validateGraph(PAIRS[key].left);
      validateGraph(PAIRS[key].right);
      checked += 2;
    });
    var c6 = evaluate({ pair: "c6-triangles", round: MAX_ROUNDS });
    var prism = evaluate({ pair: "prism-k33", round: MAX_ROUNDS });
    var path = evaluate({ pair: "path-cycle", round: MAX_ROUNDS });
    var relabel = evaluate({ pair: "c6-relabel", round: MAX_ROUNDS });
    [c6, prism, path, relabel].forEach(function (state) {
      assertRoundLedger(state, state.params.pair === "path-cycle" ? 1 : null);
      checked += state.refinement.rounds.length * 6 + 3;
    });
    assert(c6.refinement.firstDifferenceRound === null, "C6 and two triangles should not be distinguished by 1-WL");
    assert(c6.facts.left.triangles === 0 && c6.facts.right.triangles === 2, "C6 pair should have a triangle-count gap");
    assert(c6.facts.left.components === 1 && c6.facts.right.components === 2, "C6 pair should have a component-count gap");
    assert(c6.facts.left.edges === 6 && c6.facts.right.edges === 6, "C6 pair should have equal edge counts");
    assert(c6.facts.left.bipartite === true && c6.facts.right.bipartite === false, "C6 pair should differ in bipartiteness");
    assert(c6.refinement.stableRound === 1, "C6 pair should stabilize after one regular-neighborhood update");
    assert(prism.refinement.firstDifferenceRound === null, "triangular prism and K3,3 should not be distinguished by 1-WL");
    assert(prism.facts.left.triangles === 2 && prism.facts.right.triangles === 0, "prism pair should have a triangle-count gap");
    assert(prism.facts.left.bipartite === false && prism.facts.right.bipartite === true, "prism pair should differ in bipartiteness");
    assert(prism.facts.left.components === 1 && prism.facts.right.components === 1, "prism pair should be connected on both sides");
    assert(prism.facts.left.edges === 9 && prism.facts.right.edges === 9, "prism pair should have equal edge counts");
    assert(histShape(prism.selected.leftHist) === "6" && histShape(prism.selected.rightHist) === "6", "prism pair should keep one six-node color class");
    assert(path.refinement.firstDifferenceRound === 1, "P6 and C6 should be distinguished at round one");
    assert(histShape(path.refinement.rounds[1].leftHist) === "2,4", "P6 first round should split endpoints from internal nodes");
    assert(histShape(path.refinement.rounds[1].rightHist) === "6", "C6 first round should remain one color class");
    assert(path.facts.left.edges === 5 && path.facts.right.edges === 6, "path/cycle control should differ by one edge");
    assert(relabel.refinement.firstDifferenceRound === null, "relabeled C6 should not be distinguished");
    assert(histEqual(relabel.selected.leftHist, relabel.selected.rightHist), "relabeled C6 histograms should match");
    assert(factSignature(relabel.facts.left) === factSignature(relabel.facts.right), "relabeled C6 should preserve graph facts");
    checked += 19;
    Object.keys(PAIRS).forEach(function (key) {
      assertPermutationInvariantPair(key, permutationOrderA, permutationOrderB);
      checked += (MAX_ROUNDS + 1) * 3 + 4;
    });
    expectThrows(function () {
      validateGraph({ edges: [[0, 0]], label: "bad self loop", nodes: ["0"] });
    }, "graph validation should reject self loops");
    expectThrows(function () {
      validateGraph({ edges: [[0, 1], [1, 0]], label: "bad duplicate", nodes: ["0", "1"] });
    }, "graph validation should reject duplicate undirected edges");
    expectThrows(function () {
      validateGraph({ edges: [[0, 2]], label: "bad range", nodes: ["0", "1"] });
    }, "graph validation should reject out-of-range endpoints");
    checked += 3;
    return {
      c6TriangleGap: c6.facts.right.triangles - c6.facts.left.triangles,
      checked: checked,
      ok: true,
      pathFirstDifference: path.refinement.firstDifferenceRound,
      prismTriangleGap: prism.facts.left.triangles - prism.facts.right.triangles,
      relabelChecks: Object.keys(PAIRS).length,
      relabelStableRound: relabel.refinement.stableRound
    };
  }

  var api = {
    MAX_ROUNDS: MAX_ROUNDS,
    PAIRS: PAIRS,
    audit: audit,
    cleanParams: cleanParams,
    componentCount: componentCount,
    degreeSequence: degreeSequence,
    evaluate: evaluate,
    histEqual: histEqual,
    isBipartite: isBipartite,
    refinePair: refinePair,
    triangleCount: triangleCount
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.WLMessagePassingLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-wl-message-passing-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
