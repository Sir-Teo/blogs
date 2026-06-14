(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    edge: "#94a3b8",
    left: "#2563eb",
    right: "#0f766e",
    bad: "#dc2626",
    excess: "#ea580c",
    stash: "#7c3aed",
    core: "#be123c",
    ok: "#15803d"
  };

  var DEFAULTS = {
    slots: 72,
    keys: 86,
    stash: 1,
    trials: 64,
    seed: 1
  };

  var LOADS = [
    0.24, 0.30, 0.35, 0.40, 0.44, 0.47, 0.50, 0.53,
    0.56, 0.60, 0.64, 0.68, 0.72
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return min;
    return clamp(Math.round(n), min, max);
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var slots = clampInt(readNumber(raw, "slots"), 24, 180);
    return {
      slots: slots,
      keys: clampInt(readNumber(raw, "keys"), 8, slots * 2),
      stash: clampInt(readNumber(raw, "stash"), 0, 8),
      trials: clampInt(readNumber(raw, "trials"), 20, 120),
      seed: clampInt(readNumber(raw, "seed"), 1, 9999)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function makeRng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash32(value, seed) {
    var h = (value ^ seed) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function makeGraph(raw) {
    var p = cleanParams(raw);
    var rng = makeRng(p.seed);
    var total = p.slots * 2;
    var edges = [];
    var adjacency = [];
    for (var v = 0; v < total; v += 1) adjacency.push([]);
    for (var i = 0; i < p.keys; i += 1) {
      var left = Math.floor(rng() * p.slots);
      var right = p.slots + Math.floor(rng() * p.slots);
      var edge = { id: i, left: left, right: right };
      edges.push(edge);
      adjacency[left].push(i);
      adjacency[right].push(i);
    }
    return {
      params: p,
      totalVertices: total,
      edges: edges,
      adjacency: adjacency
    };
  }

  function analyzeGraph(graph) {
    var seenVertex = new Uint8Array(graph.totalVertices);
    var seenEdge = new Uint8Array(graph.edges.length);
    var components = [];
    var componentByEdge = new Int32Array(graph.edges.length);
    for (var fill = 0; fill < componentByEdge.length; fill += 1) componentByEdge[fill] = -1;

    for (var start = 0; start < graph.totalVertices; start += 1) {
      if (seenVertex[start] || graph.adjacency[start].length === 0) continue;
      var queue = [start];
      var head = 0;
      var vertices = [];
      var edges = [];
      seenVertex[start] = 1;
      while (head < queue.length) {
        var vertex = queue[head];
        head += 1;
        vertices.push(vertex);
        graph.adjacency[vertex].forEach(function (edgeId) {
          var edge = graph.edges[edgeId];
          var other = edge.left === vertex ? edge.right : edge.left;
          if (!seenEdge[edgeId]) {
            seenEdge[edgeId] = 1;
            edges.push(edgeId);
          }
          if (!seenVertex[other]) {
            seenVertex[other] = 1;
            queue.push(other);
          }
        });
      }
      var component = {
        id: components.length,
        vertices: vertices,
        edges: edges,
        vertexCount: vertices.length,
        edgeCount: edges.length,
        excess: Math.max(0, edges.length - vertices.length),
        bad: edges.length > vertices.length
      };
      edges.forEach(function (edgeId) {
        componentByEdge[edgeId] = component.id;
      });
      components.push(component);
    }

    components.sort(function (a, b) {
      if (b.excess !== a.excess) return b.excess - a.excess;
      if (b.edgeCount !== a.edgeCount) return b.edgeCount - a.edgeCount;
      return a.id - b.id;
    });

    var stashNeeded = 0;
    var badComponents = 0;
    var largest = null;
    components.forEach(function (component) {
      stashNeeded += component.excess;
      if (component.bad) badComponents += 1;
      if (!largest || component.edgeCount > largest.edgeCount) largest = component;
    });

    return {
      components: components,
      componentByEdge: componentByEdge,
      activeVertices: components.reduce(function (sum, row) { return sum + row.vertexCount; }, 0),
      badComponents: badComponents,
      stashNeeded: stashNeeded,
      largest: largest,
      noStashSuccess: stashNeeded === 0
    };
  }

  function peelCore(graph) {
    var degrees = new Int16Array(graph.totalVertices);
    var activeEdge = new Uint8Array(graph.edges.length);
    var queue = [];
    var activeVertices = 0;
    var activeEdges = graph.edges.length;
    var snapshots = [];

    for (var edgeId = 0; edgeId < graph.edges.length; edgeId += 1) activeEdge[edgeId] = 1;
    for (var vertex = 0; vertex < graph.totalVertices; vertex += 1) {
      degrees[vertex] = graph.adjacency[vertex].length;
      if (degrees[vertex] > 0) {
        activeVertices += 1;
        if (degrees[vertex] <= 1) queue.push(vertex);
      }
    }

    snapshots.push({ round: 0, vertices: activeVertices, edges: activeEdges });
    var round = 0;
    while (queue.length) {
      var layer = queue;
      queue = [];
      round += 1;
      for (var i = 0; i < layer.length; i += 1) {
        var v = layer[i];
        if (degrees[v] === 0 || degrees[v] > 1) continue;
        degrees[v] = 0;
        activeVertices -= 1;
        graph.adjacency[v].forEach(function (incident) {
          if (!activeEdge[incident]) return;
          activeEdge[incident] = 0;
          activeEdges -= 1;
          var edge = graph.edges[incident];
          var other = edge.left === v ? edge.right : edge.left;
          if (degrees[other] > 0) {
            degrees[other] -= 1;
            if (degrees[other] === 0) activeVertices -= 1;
            else if (degrees[other] === 1) queue.push(other);
          }
        });
      }
      snapshots.push({ round: round, vertices: activeVertices, edges: activeEdges });
      if (round > graph.totalVertices + 1) break;
    }

    return {
      snapshots: snapshots,
      vertices: activeVertices,
      edges: activeEdges,
      excess: Math.max(0, activeEdges - activeVertices)
    };
  }

  function sweep(raw) {
    var p = cleanParams(raw);
    return LOADS.map(function (load, loadIndex) {
      var keys = clampInt(Math.round(load * 2 * p.slots), 1, p.slots * 2);
      var noStash = 0;
      var withStash = 0;
      var stashSum = 0;
      var badSum = 0;
      for (var trial = 0; trial < p.trials; trial += 1) {
        var seed = hash32((p.seed + 1) * 1000003 + trial * 9176 + loadIndex * 131, p.seed + loadIndex);
        var graph = makeGraph({
          slots: p.slots,
          keys: keys,
          stash: p.stash,
          trials: p.trials,
          seed: 1 + (seed % 9999)
        });
        var analysis = analyzeGraph(graph);
        if (analysis.stashNeeded === 0) noStash += 1;
        if (analysis.stashNeeded <= p.stash) withStash += 1;
        stashSum += analysis.stashNeeded;
        badSum += analysis.badComponents;
      }
      return {
        load: load,
        keys: keys,
        noStash: noStash / p.trials,
        withStash: withStash / p.trials,
        avgStash: stashSum / p.trials,
        avgBadComponents: badSum / p.trials
      };
    });
  }

  function evaluate(raw) {
    var graph = makeGraph(raw);
    var analysis = analyzeGraph(graph);
    var core = peelCore(graph);
    var p = graph.params;
    var componentEdges = analysis.components.reduce(function (sum, row) {
      return sum + row.edgeCount;
    }, 0);
    var checks = {
      finite: Number.isFinite(analysis.stashNeeded) && Number.isFinite(core.excess),
      edgeAccounting: componentEdges === p.keys,
      componentBound: analysis.activeVertices <= graph.totalVertices,
      stashAccounting: core.excess === analysis.stashNeeded
    };
    return {
      params: p,
      graph: graph,
      analysis: analysis,
      core: core,
      sweep: sweep(p),
      checks: checks,
      load: p.keys / (2 * p.slots),
      successWithStash: analysis.stashNeeded <= p.stash
    };
  }

  function formatPct(value) {
    return Math.round(value * 100) + "%";
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function syncOutputs(root, result) {
    var p = result.params;
    var keyInput = root.querySelector('[data-param="keys"]');
    if (keyInput) keyInput.max = String(p.slots * 2);
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      slots: p.slots,
      keys: p.keys,
      stash: p.stash,
      trials: p.trials,
      seed: p.seed,
      load: formatPct(result.load)
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (values[key] != null) output.textContent = values[key];
    });
  }

  function metric(label, value) {
    return '<div class="cuckoo-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function renderMetrics(root, result) {
    var target = root.querySelector("[data-metrics]");
    if (!target) return;
    var verdict = result.successWithStash ? "fits with stash" : "rehash";
    if (result.analysis.stashNeeded === 0) verdict = "fits directly";
    var coreText = result.core.edges + " edges / " + result.core.vertices + " vertices";
    target.innerHTML = [
      metric("Total load", formatPct(result.load)),
      metric("Placement verdict", verdict),
      metric("Stash needed", result.analysis.stashNeeded + " keys"),
      metric("Overfull components", result.analysis.badComponents),
      metric("2-core after peeling", coreText),
      metric("Audit", Object.keys(result.checks).every(function (key) { return result.checks[key]; }) ? "passed" : "check")
    ].join("");
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 680 ? 1080 : 760;
    var ratio = Math.min(2, global.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssWidth * ratio) || canvas.height !== Math.round(cssHeight * ratio)) {
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      canvas.style.height = cssHeight + "px";
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, rect.x + 14, rect.y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(subtitle, rect.x + 14, rect.y + 41);
    }
  }

  function line(ctx, x1, y1, x2, y2, color, width, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGraph(ctx, rect, result) {
    var graph = result.graph;
    var analysis = result.analysis;
    var top = rect.y + 58;
    var bottom = rect.y + rect.h - 34;
    var leftX = rect.x + 64;
    var rightX = rect.x + rect.w - 64;
    var span = Math.max(1, bottom - top);
    var radius = graph.params.slots > 110 ? 1.7 : 2.2;

    panel(ctx, rect, "Cuckoo graph", graph.params.keys + " keys, " + graph.params.slots + " slots per side");

    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("left hash", leftX - 25, rect.y + 45);
    ctx.fillText("right hash", rightX - 30, rect.y + 45);

    function yFor(index) {
      if (graph.params.slots === 1) return top + span / 2;
      return top + span * index / (graph.params.slots - 1);
    }

    graph.edges.forEach(function (edge) {
      var componentId = analysis.componentByEdge[edge.id];
      var component = analysis.components.filter(function (row) { return row.id === componentId; })[0];
      var isBad = component && component.bad;
      var isLargest = analysis.largest && componentId === analysis.largest.id;
      line(
        ctx,
        leftX,
        yFor(edge.left),
        rightX,
        yFor(edge.right - graph.params.slots),
        isBad ? COLORS.bad : isLargest ? COLORS.stash : COLORS.edge,
        isBad ? 1.6 : 0.85,
        isBad ? 0.72 : isLargest ? 0.42 : 0.25
      );
    });

    for (var i = 0; i < graph.params.slots; i += 1) {
      ctx.fillStyle = COLORS.left;
      ctx.beginPath();
      ctx.arc(leftX, yFor(i), radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.right;
      ctx.beginPath();
      ctx.arc(rightX, yFor(i), radius, 0, Math.PI * 2);
      ctx.fill();
    }

    var verdict = result.successWithStash ? COLORS.ok : COLORS.bad;
    ctx.fillStyle = verdict;
    ctx.font = "700 13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(result.successWithStash ? "placement certified" : "component obstruction", rect.x + 14, rect.y + rect.h - 13);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("red means edges exceed vertices", rect.x + Math.min(210, rect.w - 170), rect.y + rect.h - 13);
  }

  function drawLedger(ctx, rect, result) {
    panel(ctx, rect, "Component ledger", "a component with e > v cannot place every edge");
    var rows = result.analysis.components.slice(0, 5);
    var maxCount = rows.reduce(function (max, row) {
      return Math.max(max, row.edgeCount, row.vertexCount);
    }, 1);
    var x = rect.x + 16;
    var y = rect.y + 58;
    var barW = rect.w - 122;
    rows.forEach(function (row, index) {
      var rowY = y + index * 30;
      var label = "C" + row.id + "  e=" + row.edgeCount + " v=" + row.vertexCount;
      ctx.fillStyle = COLORS.text;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(label, x, rowY + 9);
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(x + 82, rowY, barW, 9);
      ctx.fillStyle = COLORS.right;
      ctx.fillRect(x + 82, rowY, barW * row.vertexCount / maxCount, 9);
      ctx.fillStyle = row.bad ? COLORS.bad : COLORS.left;
      ctx.fillRect(x + 82, rowY + 11, barW * row.edgeCount / maxCount, 9);
      if (row.excess > 0) {
        ctx.fillStyle = COLORS.excess;
        ctx.fillText("+" + row.excess, rect.x + rect.w - 28, rowY + 17);
      }
    });
    if (!rows.length) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("no edges", x, y + 12);
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("green: vertices, blue/red: edges", x, rect.y + rect.h - 16);
  }

  function drawPeel(ctx, rect, result) {
    panel(ctx, rect, "Leaf peeling", "what survives after repeatedly removing degree 0 or 1");
    var data = result.core.snapshots;
    var x0 = rect.x + 42;
    var y0 = rect.y + rect.h - 32;
    var w = rect.w - 62;
    var h = rect.h - 82;
    var maxY = Math.max(1, result.params.keys, result.analysis.activeVertices);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gy = y0 - h * g / 4;
      line(ctx, x0, gy, x0 + w, gy, COLORS.grid, 1, 1);
    }

    function point(row, key) {
      var maxRound = Math.max(1, data.length - 1);
      return {
        x: x0 + w * row.round / maxRound,
        y: y0 - h * row[key] / maxY
      };
    }

    function drawSeries(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach(function (row, index) {
        var p = point(row, key);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    drawSeries("edges", COLORS.bad);
    drawSeries("vertices", COLORS.right);
    ctx.fillStyle = COLORS.bad;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("edges", x0, rect.y + 48);
    ctx.fillStyle = COLORS.right;
    ctx.fillText("vertices", x0 + 54, rect.y + 48);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("core excess: " + result.core.excess, rect.x + 16, rect.y + rect.h - 13);
  }

  function drawSweep(ctx, rect, result) {
    panel(ctx, rect, "Load sweep", "success rate across deterministic random trials");
    var data = result.sweep;
    var x0 = rect.x + 48;
    var y0 = rect.y + rect.h - 42;
    var w = rect.w - 74;
    var h = rect.h - 92;
    var minLoad = data[0].load;
    var maxLoad = data[data.length - 1].load;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var gy = 0; gy <= 4; gy += 1) {
      line(ctx, x0, y0 - h * gy / 4, x0 + w, y0 - h * gy / 4, COLORS.grid, 1, 1);
    }
    line(ctx, x0, y0, x0 + w, y0, COLORS.rule, 1, 1);
    line(ctx, x0, y0 - h, x0, y0, COLORS.rule, 1, 1);

    function sx(load) {
      return x0 + w * (load - minLoad) / (maxLoad - minLoad);
    }
    function sy(value) {
      return y0 - h * value;
    }
    function drawSeries(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      data.forEach(function (row, index) {
        var x = sx(row.load);
        var y = sy(row[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      data.forEach(function (row) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx(row.load), sy(row[key]), 2.6, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    drawSeries("noStash", COLORS.left);
    drawSeries("withStash", COLORS.stash);
    var currentX = sx(clamp(result.load, minLoad, maxLoad));
    line(ctx, currentX, y0 - h, currentX, y0, COLORS.excess, 1.5, 0.7);

    ctx.fillStyle = COLORS.text;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("success", x0, rect.y + 48);
    ctx.fillStyle = COLORS.left;
    ctx.fillText("no stash", x0 + 72, rect.y + 48);
    ctx.fillStyle = COLORS.stash;
    ctx.fillText("with stash", x0 + 142, rect.y + 48);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("load", x0 + w - 20, y0 + 28);
    ctx.fillText("0", x0 - 18, y0 + 4);
    ctx.fillText("1", x0 - 18, y0 - h + 4);
    ctx.fillText(formatNumber(minLoad, 2), x0 - 8, y0 + 18);
    ctx.fillText(formatNumber(maxLoad, 2), x0 + w - 24, y0 + 18);
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    var width = frame.width;
    var height = frame.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);

    var pad = 14;
    if (width < 680) {
      drawGraph(ctx, { x: pad, y: pad, w: width - pad * 2, h: 390 }, result);
      drawLedger(ctx, { x: pad, y: 418, w: width - pad * 2, h: 205 }, result);
      drawPeel(ctx, { x: pad, y: 638, w: width - pad * 2, h: 190 }, result);
      drawSweep(ctx, { x: pad, y: 843, w: width - pad * 2, h: height - 857 }, result);
    } else {
      var graphW = Math.floor((width - pad * 3) * 0.58);
      var sideW = width - pad * 3 - graphW;
      drawGraph(ctx, { x: pad, y: pad, w: graphW, h: 450 }, result);
      drawLedger(ctx, { x: pad * 2 + graphW, y: pad, w: sideW, h: 220 }, result);
      drawPeel(ctx, { x: pad * 2 + graphW, y: 244, w: sideW, h: 220 }, result);
      drawSweep(ctx, { x: pad, y: 480, w: width - pad * 2, h: height - 494 }, result);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__cuckooResult = result;
  }

  function init(root) {
    if (!root || root.__cuckooInitialized) return;
    root.__cuckooInitialized = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    var resizeTimer = null;
    global.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(root); }, 120);
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-cuckoo-core-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    makeGraph: makeGraph,
    analyzeGraph: analyzeGraph,
    peelCore: peelCore,
    sweep: sweep,
    evaluate: evaluate,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CuckooCoreLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
