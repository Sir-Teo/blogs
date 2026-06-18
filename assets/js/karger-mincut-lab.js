(function (global) {
  "use strict";

  var COLORS = {
    amber: "#d97706",
    bad: "#be123c",
    blue: "#2563eb",
    edge: "#cbd5e1",
    faint: "#f8fafc",
    good: "#0f766e",
    grid: "#e6edf3",
    ink: "#172026",
    muted: "#5d6872",
    panel: "#ffffff",
    purple: "#7c3aed",
    rule: "#d7dee5",
    teal: "#14b8a6"
  };

  var DEFAULTS = {
    graph: "bridge",
    seed: 37,
    trace: 7,
    trials: 240
  };

  var GRAPH_LABELS = {
    bridge: "two cliques, two bridges",
    cycle: "cycle, many min cuts",
    islands: "three islands",
    ladder: "ladder"
  };

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function finiteNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var graph = GRAPH_LABELS[raw.graph] ? raw.graph : DEFAULTS.graph;
    var trials = Math.round(clamp(finiteNumber(raw.trials, DEFAULTS.trials), 20, 800) / 20) * 20;
    var traceMax = Math.min(80, trials);
    return {
      graph: graph,
      seed: Math.round(clamp(finiteNumber(raw.seed, DEFAULTS.seed), 1, 997)),
      trace: Math.round(clamp(finiteNumber(raw.trace, DEFAULTS.trace), 1, traceMax)),
      trials: trials
    };
  }

  function rng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeBuilder() {
    var nodes = [];
    var edges = [];

    function addNode(label, x, y, group) {
      nodes.push({ id: nodes.length, label: label, x: x, y: y, group: group });
    }

    function addEdge(u, v, count) {
      var copies = count == null ? 1 : count;
      for (var i = 0; i < copies; i += 1) {
        edges.push({ id: edges.length, u: u, v: v });
      }
    }

    function clique(ids) {
      for (var i = 0; i < ids.length; i += 1) {
        for (var j = i + 1; j < ids.length; j += 1) {
          addEdge(ids[i], ids[j]);
        }
      }
    }

    return {
      addEdge: addEdge,
      addNode: addNode,
      clique: clique,
      graph: function (key, label) {
        return { key: key, label: label, nodes: nodes, edges: edges };
      }
    };
  }

  function circleNodes(builder, ids, cx, cy, r, group, prefix) {
    ids.forEach(function (_, i) {
      var angle = -Math.PI / 2 + 2 * Math.PI * i / ids.length;
      builder.addNode(prefix + i, cx + r * Math.cos(angle), cy + r * Math.sin(angle), group);
    });
  }

  function buildBridgeGraph() {
    var b = makeBuilder();
    circleNodes(b, [0, 1, 2, 3, 4], -1.15, 0, 0.55, 0, "L");
    circleNodes(b, [5, 6, 7, 8, 9], 1.15, 0, 0.55, 1, "R");
    b.clique([0, 1, 2, 3, 4]);
    b.clique([5, 6, 7, 8, 9]);
    b.addEdge(4, 5, 2);
    return b.graph("bridge", GRAPH_LABELS.bridge);
  }

  function buildCycleGraph() {
    var b = makeBuilder();
    var n = 10;
    for (var i = 0; i < n; i += 1) {
      var angle = -Math.PI / 2 + 2 * Math.PI * i / n;
      b.addNode(String(i), Math.cos(angle), Math.sin(angle), i < 5 ? 0 : 1);
    }
    for (i = 0; i < n; i += 1) {
      b.addEdge(i, (i + 1) % n);
    }
    return b.graph("cycle", GRAPH_LABELS.cycle);
  }

  function buildIslandsGraph() {
    var b = makeBuilder();
    circleNodes(b, [0, 1, 2, 3, 4], -1.7, 0, 0.45, 0, "A");
    circleNodes(b, [5, 6, 7, 8, 9], 0, 0, 0.45, 1, "B");
    circleNodes(b, [10, 11, 12, 13, 14], 1.7, 0, 0.45, 2, "C");
    b.clique([0, 1, 2, 3, 4]);
    b.clique([5, 6, 7, 8, 9]);
    b.clique([10, 11, 12, 13, 14]);
    b.addEdge(4, 5, 3);
    b.addEdge(9, 10, 3);
    return b.graph("islands", GRAPH_LABELS.islands);
  }

  function buildLadderGraph() {
    var b = makeBuilder();
    var cols = 6;
    for (var c = 0; c < cols; c += 1) {
      b.addNode("T" + c, -1.5 + c * 0.6, -0.45, 0);
      b.addNode("B" + c, -1.5 + c * 0.6, 0.45, 1);
    }
    for (c = 0; c < cols - 1; c += 1) {
      b.addEdge(2 * c, 2 * (c + 1));
      b.addEdge(2 * c + 1, 2 * (c + 1) + 1);
    }
    for (c = 0; c < cols; c += 1) {
      b.addEdge(2 * c, 2 * c + 1);
    }
    b.addEdge(2, 5);
    b.addEdge(6, 9);
    return b.graph("ladder", GRAPH_LABELS.ladder);
  }

  function buildGraph(key) {
    if (key === "cycle") return buildCycleGraph();
    if (key === "islands") return buildIslandsGraph();
    if (key === "ladder") return buildLadderGraph();
    return buildBridgeGraph();
  }

  function bit(mask, i) {
    return (mask & (1 << i)) !== 0;
  }

  function canonicalMask(mask, n) {
    var all = (1 << n) - 1;
    return bit(mask, n - 1) ? (all ^ mask) : mask;
  }

  function maskFromCluster(cluster, n) {
    var mask = 0;
    for (var i = 0; i < cluster.length; i += 1) {
      mask |= 1 << cluster[i];
    }
    return canonicalMask(mask, n);
  }

  function cutValue(graph, mask) {
    var total = 0;
    graph.edges.forEach(function (edge) {
      if (bit(mask, edge.u) !== bit(mask, edge.v)) total += 1;
    });
    return total;
  }

  function exactMinCut(graph) {
    var n = graph.nodes.length;
    var limit = 1 << (n - 1);
    var lambda = Infinity;
    var masks = [];
    for (var mask = 1; mask < limit; mask += 1) {
      var value = cutValue(graph, mask);
      if (value < lambda) {
        lambda = value;
        masks = [mask];
      } else if (value === lambda) {
        masks.push(mask);
      }
    }
    return {
      count: masks.length,
      lambda: lambda,
      mask: masks[0],
      masks: masks
    };
  }

  function combineEdges(graph) {
    var map = {};
    graph.edges.forEach(function (edge) {
      var a = Math.min(edge.u, edge.v);
      var b = Math.max(edge.u, edge.v);
      var key = a + ":" + b;
      if (!map[key]) map[key] = { count: 0, u: a, v: b };
      map[key].count += 1;
    });
    return Object.keys(map).map(function (key) { return map[key]; });
  }

  function runTrial(graph, rand, fixedMask, lambda) {
    var n = graph.nodes.length;
    var clusters = [];
    var location = new Array(n);
    var steps = [];
    var hitFixedCut = false;

    for (var i = 0; i < n; i += 1) {
      clusters.push([i]);
      location[i] = i;
    }

    while (clusters.length > 2) {
      var eligible = [];
      graph.edges.forEach(function (edge) {
        if (location[edge.u] !== location[edge.v]) eligible.push(edge);
      });
      if (eligible.length === 0) break;
      var chosen = eligible[Math.floor(rand() * eligible.length)];
      var a = location[chosen.u];
      var b = location[chosen.v];
      var crossedFixed = bit(fixedMask, chosen.u) !== bit(fixedMask, chosen.v);
      if (crossedFixed) hitFixedCut = true;
      if (a > b) {
        var tmp = a;
        a = b;
        b = tmp;
      }
      var absorbed = clusters[b].slice();
      clusters[a] = clusters[a].concat(absorbed);
      clusters.splice(b, 1);
      for (i = 0; i < clusters.length; i += 1) {
        clusters[i].forEach(function (vertex) {
          location[vertex] = i;
        });
      }
      steps.push({
        cutEdge: crossedFixed,
        edge: chosen,
        remaining: clusters.length,
        sizes: clusters.map(function (cluster) { return cluster.length; })
      });
    }

    var finalMask = clusters.length === 2 ? maskFromCluster(clusters[0], n) : 0;
    var value = clusters.length === 2 ? cutValue(graph, finalMask) : Infinity;
    return {
      cutValue: value,
      finalMask: finalMask,
      hitFixedCut: hitFixedCut,
      optimal: value === lambda,
      steps: steps,
      survivedFixedCut: !hitFixedCut
    };
  }

  function runSimulation(graph, trials, seed, fixedMask, lambda) {
    var rand = rng(0xabc000 + seed * 1009 + graph.nodes.length * 17 + graph.edges.length);
    var histogram = {};
    var successes = 0;
    var survivals = 0;
    var bestValue = Infinity;
    var firstSuccess = null;
    for (var i = 0; i < trials; i += 1) {
      var trial = runTrial(graph, rand, fixedMask, lambda);
      histogram[trial.cutValue] = (histogram[trial.cutValue] || 0) + 1;
      if (trial.optimal) {
        successes += 1;
        if (firstSuccess == null) firstSuccess = i + 1;
      }
      if (trial.survivedFixedCut) survivals += 1;
      bestValue = Math.min(bestValue, trial.cutValue);
    }
    return {
      bestValue: bestValue,
      firstSuccess: firstSuccess,
      histogram: histogram,
      successes: successes,
      successRate: successes / trials,
      survivals: survivals,
      survivalRate: survivals / trials,
      trials: trials
    };
  }

  function fixedCutBound(n) {
    return 2 / (n * (n - 1));
  }

  function repetitionsFor(failureProbability, n) {
    var p = fixedCutBound(n);
    return Math.ceil(Math.log(failureProbability) / Math.log(1 - p));
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var graph = buildGraph(params.graph);
    var exact = exactMinCut(graph);
    var simulation = runSimulation(graph, params.trials, params.seed, exact.mask, exact.lambda);
    var traceRand = rng(0x515100 + params.seed * 4099 + params.trace * 9176 + graph.edges.length * 13);
    var trace = runTrial(graph, traceRand, exact.mask, exact.lambda);
    var bound = fixedCutBound(graph.nodes.length);
    return {
      bound: bound,
      exact: exact,
      graph: graph,
      params: params,
      repetitions95: repetitionsFor(0.05, graph.nodes.length),
      simulation: simulation,
      trace: trace
    };
  }

  function formatPct(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatInt(value) {
    if (!Number.isFinite(value)) return "n/a";
    return Math.round(value).toLocaleString("en-US");
  }

  function setText(root, selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function metric(label, value, tone) {
    var cls = "karger-lab__metric" + (tone ? " " + tone : "");
    return '<div class="' + cls + '"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    var missed = result.simulation.successes === 0;
    box.innerHTML = [
      metric("exact min cut", String(result.exact.lambda), "good"),
      metric("min-cut count", formatInt(result.exact.count), ""),
      metric("optimal trials", result.simulation.successes + "/" + result.params.trials, missed ? "bad" : "good"),
      metric("observed rate", formatPct(result.simulation.successRate), ""),
      metric("fixed-cut bound", formatPct(result.bound), ""),
      metric("95% reps", formatInt(result.repetitions95), "")
    ].join("");
  }

  function canvasSize(canvas) {
    var cssWidth = canvas.clientWidth || 920;
    var mobile = cssWidth < 620;
    var width = mobile ? 390 : 920;
    var height = mobile ? 980 : 680;
    var ratio = global.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, mobile: mobile, width: width };
  }

  function text(ctx, value, x, y, opts) {
    opts = opts || {};
    ctx.save();
    ctx.fillStyle = opts.color || COLORS.ink;
    ctx.font = (opts.weight || 650) + " " + (opts.size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.save();
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, { size: 13, weight: 800 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, { color: COLORS.muted, size: 10, weight: 620 });
    ctx.restore();
  }

  function graphProjector(graph, box) {
    var xs = graph.nodes.map(function (node) { return node.x; });
    var ys = graph.nodes.map(function (node) { return node.y; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    var pad = 34;
    var scale = Math.min((box.w - 2 * pad) / Math.max(0.01, maxX - minX), (box.h - 78) / Math.max(0.01, maxY - minY));
    var cx = box.x + box.w / 2;
    var cy = box.y + 52 + (box.h - 70) / 2;
    return function (node) {
      return {
        x: cx + (node.x - (minX + maxX) / 2) * scale,
        y: cy + (node.y - (minY + maxY) / 2) * scale
      };
    };
  }

  function drawNodes(ctx, graph, project, mask) {
    graph.nodes.forEach(function (node) {
      var p = project(node);
      var side = bit(mask, node.id);
      ctx.fillStyle = side ? COLORS.blue : COLORS.good;
      ctx.strokeStyle = COLORS.panel;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      text(ctx, node.label, p.x, p.y + 3, { align: "center", color: "#ffffff", size: 8, weight: 800 });
    });
  }

  function drawBaseEdges(ctx, graph, project, mask, faded) {
    combineEdges(graph).forEach(function (edge) {
      var a = project(graph.nodes[edge.u]);
      var b = project(graph.nodes[edge.v]);
      var crossing = bit(mask, edge.u) !== bit(mask, edge.v);
      ctx.strokeStyle = crossing ? COLORS.amber : (faded ? "#e4eaf0" : COLORS.edge);
      ctx.lineWidth = crossing ? Math.min(6, 1.4 + edge.count * 1.2) : Math.min(4, 0.9 + edge.count * 0.65);
      ctx.globalAlpha = faded && !crossing ? 0.75 : 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (edge.count > 1) {
        text(ctx, "x" + edge.count, (a.x + b.x) / 2, (a.y + b.y) / 2 - 5, {
          align: "center",
          color: crossing ? COLORS.amber : COLORS.muted,
          size: 9,
          weight: 800
        });
      }
    });
  }

  function drawExactGraph(ctx, result, box) {
    panel(ctx, box, "Exact oracle", "brute-force cut, shown once");
    var project = graphProjector(result.graph, box);
    drawBaseEdges(ctx, result.graph, project, result.exact.mask, false);
    drawNodes(ctx, result.graph, project, result.exact.mask);
    text(ctx, "lambda = " + result.exact.lambda + " across highlighted edges", box.x + 14, box.y + box.h - 18, {
      color: COLORS.ink,
      size: 11,
      weight: 800
    });
  }

  function drawTrace(ctx, result, box) {
    var status = result.trace.optimal ? "optimal" : "missed";
    panel(ctx, box, "One random contraction", "shown trial " + result.params.trace + " ended " + status);
    var project = graphProjector(result.graph, box);
    drawBaseEdges(ctx, result.graph, project, result.exact.mask, true);
    result.trace.steps.forEach(function (step, i) {
      var a = project(result.graph.nodes[step.edge.u]);
      var b = project(result.graph.nodes[step.edge.v]);
      ctx.strokeStyle = step.cutEdge ? COLORS.bad : COLORS.purple;
      ctx.lineWidth = step.cutEdge ? 4 : 2.8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (i < 9 || step.cutEdge) {
        text(ctx, String(i + 1), (a.x + b.x) / 2, (a.y + b.y) / 2 - 8, {
          align: "center",
          color: step.cutEdge ? COLORS.bad : COLORS.purple,
          size: 10,
          weight: 850
        });
      }
    });
    drawNodes(ctx, result.graph, project, result.exact.mask);
    var firstBad = result.trace.steps.findIndex(function (step) { return step.cutEdge; });
    var line = firstBad < 0 ? "fixed cut survived all contractions" : "fixed cut edge contracted at step " + (firstBad + 1);
    text(ctx, "returned cut = " + result.trace.cutValue + "; " + line, box.x + 14, box.y + box.h - 18, {
      color: firstBad < 0 ? COLORS.good : COLORS.bad,
      size: 11,
      weight: 800
    });
  }

  function drawHistogram(ctx, result, box) {
    panel(ctx, box, "Trial outcomes", "best-of-repetition is a minimum over samples");
    var hist = result.simulation.histogram;
    var values = Object.keys(hist).map(Number).sort(function (a, b) { return a - b; });
    var maxCount = Math.max.apply(null, values.map(function (value) { return hist[value]; }));
    var plot = { x: box.x + 42, y: box.y + 60, w: box.w - 62, h: box.h - 108 };
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var y = plot.y + plot.h - tick * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    var barGap = 8;
    var barW = Math.max(10, (plot.w - barGap * (values.length - 1)) / values.length);
    values.forEach(function (value, i) {
      var h = maxCount > 0 ? hist[value] / maxCount * plot.h : 0;
      var x = plot.x + i * (barW + barGap);
      var y = plot.y + plot.h - h;
      ctx.fillStyle = value === result.exact.lambda ? COLORS.good : COLORS.edge;
      ctx.fillRect(x, y, barW, h);
      text(ctx, String(value), x + barW / 2, plot.y + plot.h + 18, { align: "center", color: COLORS.muted, size: 10 });
      text(ctx, String(hist[value]), x + barW / 2, y - 5, { align: "center", color: COLORS.ink, size: 10, weight: 800 });
    });
    text(ctx, "cut value", plot.x + plot.w / 2, box.y + box.h - 18, { align: "center", color: COLORS.muted, size: 10 });
  }

  function drawGuarantee(ctx, result, box) {
    panel(ctx, box, "Repetition budget", "bound is for one fixed min cut");
    var plot = { x: box.x + 48, y: box.y + 60, w: box.w - 74, h: box.h - 112 };
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var y = plot.y + plot.h - tick * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    function xFor(t) {
      return plot.x + clamp(t / result.params.trials, 0, 1) * plot.w;
    }
    function yFor(miss) {
      return plot.y + clamp(miss, 0, 1) * plot.h;
    }
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (var t = 0; t <= result.params.trials; t += Math.max(1, Math.floor(result.params.trials / 80))) {
      var miss = Math.pow(1 - result.bound, t);
      var x = xFor(t);
      var y = yFor(miss);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    var missNow = Math.pow(1 - result.bound, result.params.trials);
    var successGuarantee = 1 - missNow;
    var observedW = result.simulation.successRate * plot.w;
    var guaranteedW = successGuarantee * plot.w;
    ctx.fillStyle = "#dbeafe";
    ctx.fillRect(plot.x, box.y + box.h - 42, observedW, 8);
    ctx.fillStyle = "#fed7aa";
    ctx.fillRect(plot.x, box.y + box.h - 29, guaranteedW, 8);
    text(ctx, "observed optimal " + formatPct(result.simulation.successRate), plot.x, box.y + box.h - 48, { color: COLORS.blue, size: 10, weight: 800 });
    text(ctx, "fixed-cut lower bound " + formatPct(successGuarantee), plot.x, box.y + box.h - 16, { color: COLORS.amber, size: 10, weight: 800 });
    text(ctx, "miss probability", plot.x - 6, plot.y + 4, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, String(result.params.trials) + " trials", plot.x + plot.w, plot.y + plot.h + 18, { align: "right", color: COLORS.muted, size: 10 });
  }

  function draw(result, canvas) {
    if (!canvas) return;
    var size = canvasSize(canvas);
    var ctx = size.ctx;
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(0, 0, size.width, size.height);
    var boxes;
    if (size.mobile) {
      boxes = [
        { x: 12, y: 12, w: 366, h: 226 },
        { x: 12, y: 250, w: 366, h: 246 },
        { x: 12, y: 508, w: 366, h: 210 },
        { x: 12, y: 730, w: 366, h: 238 }
      ];
    } else {
      boxes = [
        { x: 16, y: 16, w: 438, h: 306 },
        { x: 466, y: 16, w: 438, h: 306 },
        { x: 16, y: 334, w: 438, h: 330 },
        { x: 466, y: 334, w: 438, h: 330 }
      ];
    }
    drawExactGraph(ctx, result, boxes[0]);
    drawTrace(ctx, result, boxes[1]);
    drawHistogram(ctx, result, boxes[2]);
    drawGuarantee(ctx, result, boxes[3]);
  }

  function collectParams(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function updateOutputs(root, params) {
    setText(root, '[data-value="graph"]', GRAPH_LABELS[params.graph]);
    setText(root, '[data-value="trials"]', formatInt(params.trials));
    setText(root, '[data-value="seed"]', String(params.seed));
    setText(root, '[data-value="trace"]', String(params.trace));
    var trace = root.querySelector('[data-param="trace"]');
    if (trace) {
      trace.max = String(Math.min(80, params.trials));
      if (Number(trace.value) > Number(trace.max)) trace.value = trace.max;
    }
  }

  function render(root) {
    var params = cleanParams(collectParams(root));
    updateOutputs(root, params);
    var result = evaluate(params);
    renderMetrics(root, result);
    var note = root.querySelector("[data-note]");
    if (note) {
      var first = result.simulation.firstSuccess == null ? "no optimal trial was seen" : "first optimal trial appeared at repetition " + result.simulation.firstSuccess;
      note.textContent = "The brute-force oracle checks " + ((1 << (result.graph.nodes.length - 1)) - 1).toLocaleString("en-US") +
        " nonempty cuts. The random side ran " + result.params.trials + " contractions; " + first +
        ". The orange guarantee is deliberately conservative because it follows one named minimum cut, not the union of every minimum cut.";
    }
    draw(result, root.querySelector("canvas"));
  }

  function init(root) {
    if (!root || root.__kargerMincutLab) return;
    root.__kargerMincutLab = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
    global.addEventListener("resize", function () { render(root); });
  }

  function auditKargerMincutLab() {
    var failures = [];
    function assert(condition, message) {
      if (!condition) failures.push(message);
    }

    ["bridge", "cycle", "islands", "ladder"].forEach(function (key) {
      var graph = buildGraph(key);
      var exact = exactMinCut(graph);
      assert(graph.nodes.length >= 10, key + " has enough vertices");
      assert(graph.edges.length >= graph.nodes.length, key + " has enough edges");
      assert(exact.lambda >= 2, key + " min cut is nontrivial");
      assert(exact.count >= 1, key + " has at least one min cut");
      for (var i = 0; i < 32; i += 1) {
        var trial = runTrial(graph, rng(1000 + i * 37 + graph.edges.length), exact.mask, exact.lambda);
        assert(trial.cutValue >= exact.lambda, key + " trial never beats exact oracle");
        if (trial.survivedFixedCut) {
          assert(trial.cutValue === exact.lambda, key + " fixed-cut survival returns a min cut");
        }
      }
    });

    var bridge = buildGraph("bridge");
    var bridgeExact = exactMinCut(bridge);
    assert(bridgeExact.lambda === 2, "bridge lambda is 2");
    assert(bridgeExact.count === 1, "bridge graph has one canonical min cut");
    var bridgeSim = runSimulation(bridge, 400, 37, bridgeExact.mask, bridgeExact.lambda);
    assert(bridgeSim.successes > 0, "bridge simulation finds the min cut");
    assert(bridgeSim.bestValue === bridgeExact.lambda, "bridge best value matches oracle");

    var cycle = buildGraph("cycle");
    var cycleExact = exactMinCut(cycle);
    assert(cycleExact.lambda === 2, "cycle lambda is 2");
    assert(cycleExact.count === 45, "ten-cycle has 45 canonical min cuts");
    var cycleSim = runSimulation(cycle, 80, 19, cycleExact.mask, cycleExact.lambda);
    assert(cycleSim.successes === 80, "cycle always returns a min cut");

    var deterministicA = evaluate(DEFAULTS);
    var deterministicB = evaluate(DEFAULTS);
    assert(JSON.stringify(deterministicA.simulation.histogram) === JSON.stringify(deterministicB.simulation.histogram), "default run is deterministic");
    assert(deterministicA.simulation.bestValue === deterministicA.exact.lambda, "default best value is exact");
    assert(repetitionsFor(0.05, 10) === 134, "n=10 95 percent repetition count");

    var cases = 0;
    ["bridge", "cycle", "islands", "ladder"].forEach(function (graphKey) {
      [1, 17, 83, 211].forEach(function (seed) {
        [40, 120, 240].forEach(function (trials) {
          var result = evaluate({ graph: graphKey, seed: seed, trials: trials, trace: 3 });
          cases += 1;
          assert(result.bound > 0 && result.bound <= 1, graphKey + " bound is a probability");
          assert(result.simulation.successRate >= 0 && result.simulation.successRate <= 1, graphKey + " success rate is a probability");
          assert(result.simulation.bestValue >= result.exact.lambda, graphKey + " repeated best respects exact oracle");
          assert(Object.keys(result.simulation.histogram).length >= 1, graphKey + " histogram is populated");
        });
      });
    });
    assert(cases === 48, "grid covered 48 cases");

    return {
      cases: cases + 32 * 4 + 7,
      defaultSummary: {
        bestValue: deterministicA.simulation.bestValue,
        bound: deterministicA.bound,
        exactCount: deterministicA.exact.count,
        firstSuccess: deterministicA.simulation.firstSuccess,
        lambda: deterministicA.exact.lambda,
        repetitions95: deterministicA.repetitions95,
        successRate: deterministicA.simulation.successRate,
        successes: deterministicA.simulation.successes,
        trials: deterministicA.params.trials
      },
      failures: failures,
      passed: failures.length === 0
    };
  }

  var api = {
    auditKargerMincutLab: auditKargerMincutLab,
    buildGraph: buildGraph,
    cutValue: cutValue,
    evaluate: evaluate,
    exactMinCut: exactMinCut,
    runTrial: runTrial
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.KargerMincutLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", function () {
      global.document.querySelectorAll("[data-karger-mincut-lab]").forEach(init);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
