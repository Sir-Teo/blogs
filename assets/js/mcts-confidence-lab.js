(function (root) {
  "use strict";

  var COLORS = {
    bg: "#ffffff",
    panel: "#f8fafc",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    max: "#0f766e",
    min: "#be123c",
    edge: "#2563eb",
    prior: "#7c3aed",
    warn: "#b45309",
    best: "#16a34a",
    bad: "#dc2626"
  };

  var DEFAULTS = {
    scenario: "trap",
    selector: "uct",
    simulations: 260,
    exploration: 110,
    prior: 120,
    noise: 18,
    seed: 7
  };

  var SCENARIOS = {
    trap: {
      name: "Refutation trap",
      rootPriors: [0.58, 0.29, 0.13],
      nodes: [
        { id: "root", label: "move", player: "max", children: ["attack", "solid", "endgame"] },
        { id: "attack", label: "Flashy attack", player: "min", children: ["refute", "blunder"] },
        { id: "solid", label: "Solid squeeze", terminal: true, mean: 0.62, sigma: 0.07 },
        { id: "endgame", label: "Quiet endgame", terminal: true, mean: 0.55, sigma: 0.10 },
        { id: "refute", label: "Only refutation", terminal: true, mean: 0.08, sigma: 0.05 },
        { id: "blunder", label: "Opponent misses", terminal: true, mean: 0.91, sigma: 0.06 }
      ]
    },
    variance: {
      name: "Variance race",
      rootPriors: [0.34, 0.33, 0.33],
      nodes: [
        { id: "root", label: "move", player: "max", children: ["sharp", "patient", "coin"] },
        { id: "sharp", label: "Sharp tactic", terminal: true, mean: 0.57, sigma: 0.30 },
        { id: "patient", label: "Patient plan", terminal: true, mean: 0.61, sigma: 0.08 },
        { id: "coin", label: "Messy race", terminal: true, mean: 0.53, sigma: 0.24 }
      ]
    },
    prior: {
      name: "Policy prior bait",
      rootPriors: [0.70, 0.20, 0.10],
      nodes: [
        { id: "root", label: "move", player: "max", children: ["popular", "ugly", "drawish"] },
        { id: "popular", label: "Popular move", terminal: true, mean: 0.49, sigma: 0.10 },
        { id: "ugly", label: "Ugly resource", terminal: true, mean: 0.66, sigma: 0.12 },
        { id: "drawish", label: "Safe draw", terminal: true, mean: 0.54, sigma: 0.06 }
      ]
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
      scenario: SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario,
      selector: raw.selector === "puct" ? "puct" : "uct",
      simulations: snap(raw.simulations, DEFAULTS.simulations, 24, 900, 4),
      exploration: snap(raw.exploration, DEFAULTS.exploration, 0, 250, 5),
      prior: snap(raw.prior, DEFAULTS.prior, 0, 320, 5),
      noise: snap(raw.noise, DEFAULTS.noise, 0, 60, 1),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 99, 1)
    };
  }

  function lcg(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function normal(rand) {
    var u = Math.max(1e-9, rand());
    var v = Math.max(1e-9, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function cloneScenario(key) {
    var scenario = SCENARIOS[key] || SCENARIOS.trap;
    var nodes = {};
    scenario.nodes.forEach(function (node) {
      nodes[node.id] = {
        children: node.children ? node.children.slice() : [],
        id: node.id,
        label: node.label,
        mean: node.mean,
        n: 0,
        player: node.player || "max",
        sigma: node.sigma == null ? 0.1 : node.sigma,
        terminal: !!node.terminal,
        valueSum: 0
      };
    });
    var priors = {};
    var root = nodes.root;
    root.children.forEach(function (id, index) {
      priors[id] = scenario.rootPriors[index] || 1 / root.children.length;
    });
    Object.keys(nodes).forEach(function (id) {
      var node = nodes[id];
      if (!node.children.length) return;
      var p = 1 / node.children.length;
      node.children.forEach(function (child) {
        if (priors[child] == null) priors[child] = p;
      });
    });
    return { key: key, name: scenario.name, nodes: nodes, priors: priors };
  }

  function trueValue(id, nodes) {
    var node = nodes[id];
    if (node.terminal) return node.mean;
    var childValues = node.children.map(function (child) { return trueValue(child, nodes); });
    if (node.player === "min") return Math.min.apply(null, childValues);
    return Math.max.apply(null, childValues);
  }

  function qValue(node) {
    return node.n ? node.valueSum / node.n : 0.5;
  }

  function selectionScore(parent, child, tree, params) {
    if (child.n === 0) return Infinity;
    var q = qValue(child);
    var meanTerm = parent.player === "min" ? 1 - q : q;
    if (params.selector === "puct") {
      return meanTerm + (params.prior / 100) * (tree.priors[child.id] || 0) * Math.sqrt(Math.max(1, parent.n)) / (1 + child.n);
    }
    return meanTerm + (params.exploration / 100) * Math.sqrt(Math.log(Math.max(2, parent.n)) / child.n);
  }

  function selectChild(parent, tree, params) {
    var best = null;
    var bestScore = -Infinity;
    parent.children.forEach(function (id) {
      var child = tree.nodes[id];
      var score = selectionScore(parent, child, tree, params);
      if (score > bestScore || (score === bestScore && (!best || id < best.id))) {
        bestScore = score;
        best = child;
      }
    });
    return best;
  }

  function rolloutReward(node, rand, params) {
    var sigma = node.sigma + params.noise / 100;
    return clamp(node.mean + sigma * normal(rand), 0, 1);
  }

  function runSimulation(tree, params, rand) {
    var path = [tree.nodes.root];
    var node = tree.nodes.root;
    while (!node.terminal) {
      node = selectChild(node, tree, params);
      path.push(node);
    }
    var reward = rolloutReward(node, rand, params);
    path.forEach(function (visited) {
      visited.n += 1;
      visited.valueSum += reward;
    });
    return reward;
  }

  function rootRows(tree) {
    var root = tree.nodes.root;
    return root.children.map(function (id) {
      var child = tree.nodes[id];
      return {
        id: id,
        label: child.label,
        n: child.n,
        prior: tree.priors[id] || 0,
        q: qValue(child),
        trueValue: trueValue(id, tree.nodes)
      };
    });
  }

  function chooseByVisits(rows) {
    var best = rows[0];
    rows.forEach(function (row) {
      if (row.n > best.n || (row.n === best.n && row.q > best.q)) best = row;
    });
    return best;
  }

  function chooseByTruth(rows) {
    var best = rows[0];
    rows.forEach(function (row) {
      if (row.trueValue > best.trueValue) best = row;
    });
    return best;
  }

  function entropy(rows) {
    var total = rows.reduce(function (sum, row) { return sum + row.n; }, 0);
    if (!total) return 0;
    var h = 0;
    rows.forEach(function (row) {
      if (!row.n) return;
      var p = row.n / total;
      h -= p * Math.log(p);
    });
    return h / Math.log(rows.length);
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var tree = cloneScenario(params.scenario);
    var rand = lcg(params.seed * 1009 + params.simulations * 17 + params.exploration);
    var history = [];
    var stride = Math.max(1, Math.floor(params.simulations / 80));
    for (var i = 1; i <= params.simulations; i += 1) {
      runSimulation(tree, params, rand);
      if (i === 1 || i === params.simulations || i % stride === 0) {
        var rows = rootRows(tree);
        var picked = chooseByVisits(rows);
        var best = chooseByTruth(rows);
        history.push({
          regret: best.trueValue - picked.trueValue,
          simulations: i
        });
      }
    }
    var rowsFinal = rootRows(tree);
    var recommended = chooseByVisits(rowsFinal);
    var bestTrue = chooseByTruth(rowsFinal);
    return {
      bestTrue: bestTrue,
      entropy: entropy(rowsFinal),
      history: history,
      params: params,
      recommended: recommended,
      regret: bestTrue.trueValue - recommended.trueValue,
      rows: rowsFinal,
      tree: tree
    };
  }

  function metric(label, value) {
    return '<div class="mcts-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function updateMetrics(el, result) {
    el.innerHTML = [
      metric("Recommended", result.recommended.label),
      metric("Best true move", result.bestTrue.label),
      metric("Simple regret", formatNumber(result.regret, 2)),
      metric("Visit entropy", formatNumber(result.entropy, 2))
    ].join("");
  }

  function updateOutputs(container, params) {
    var labels = {
      exploration: formatNumber(params.exploration / 100, 2),
      prior: formatNumber(params.prior / 100, 2),
      noise: formatNumber(params.noise / 100, 2),
      simulations: String(params.simulations),
      seed: String(params.seed)
    };
    Object.keys(labels).forEach(function (key) {
      var out = container.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function readState(container, previous) {
    var state = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (el) {
      var key = el.getAttribute("data-param");
      state[key] = el.value;
    });
    return cleanParams(state);
  }

  function setCanvasSize(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, rect.width || canvas.clientWidth || 840);
    var cssHeight = Math.max(560, Math.min(760, cssWidth * 0.78));
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.height = cssHeight + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawText(ctx, text, x, y, color, size, weight, maxWidth) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(String(text), x, y, maxWidth);
  }

  function drawPanel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.bg;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, COLORS.text, 13, 750);
  }

  function nodeColor(node) {
    if (node.terminal) return COLORS.edge;
    return node.player === "min" ? COLORS.min : COLORS.max;
  }

  function allEdges(tree) {
    var edges = [];
    Object.keys(tree.nodes).forEach(function (id) {
      var node = tree.nodes[id];
      node.children.forEach(function (child) {
        edges.push([id, child]);
      });
    });
    return edges;
  }

  function layoutTree(result, x, y, w, h) {
    var tree = result.tree;
    var root = tree.nodes.root;
    var coords = {};
    coords.root = { x: x + w * 0.5, y: y + 50 };
    var rootChildren = root.children;
    rootChildren.forEach(function (id, index) {
      coords[id] = {
        x: x + w * (index + 1) / (rootChildren.length + 1),
        y: y + h * 0.43
      };
    });
    rootChildren.forEach(function (id) {
      var node = tree.nodes[id];
      if (!node.children.length) return;
      node.children.forEach(function (childId, index) {
        var spread = Math.min(110, w * 0.18);
        coords[childId] = {
          x: coords[id].x + (index - (node.children.length - 1) / 2) * spread,
          y: y + h * 0.76
        };
      });
    });
    rootChildren.forEach(function (id) {
      var node = tree.nodes[id];
      if (node.children.length) return;
      coords[id].y = y + h * 0.72;
    });
    return coords;
  }

  function drawTree(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Search tree");
    var plot = { x: x + 12, y: y + 32, w: w - 24, h: h - 44 };
    var coords = layoutTree(result, plot.x, plot.y, plot.w, plot.h);
    var tree = result.tree;
    var maxVisits = Math.max(1, result.params.simulations);

    allEdges(tree).forEach(function (edge) {
      var from = coords[edge[0]];
      var to = coords[edge[1]];
      var child = tree.nodes[edge[1]];
      ctx.strokeStyle = "rgba(37, 99, 235, 0.55)";
      ctx.lineWidth = 1.5 + 8 * Math.sqrt(child.n / maxVisits);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y + 18);
      ctx.lineTo(to.x, to.y - 18);
      ctx.stroke();
    });

    Object.keys(coords).forEach(function (id) {
      var node = tree.nodes[id];
      var p = coords[id];
      var r = id === "root" ? 23 : 28;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = nodeColor(node);
      ctx.lineWidth = id === result.recommended.id ? 3 : 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawText(ctx, node.terminal ? "leaf" : node.player, p.x - 13, p.y + 4, nodeColor(node), 11, 800, 40);
      var label = id === "root" ? "Root" : node.label;
      drawText(ctx, label, p.x - 58, p.y + r + 17, COLORS.text, 11, 700, 116);
      var line = "N=" + node.n + " Q=" + formatNumber(qValue(node), 2);
      drawText(ctx, line, p.x - 48, p.y + r + 32, COLORS.muted, 10, 600, 100);
      if (id !== "root") {
        drawText(ctx, "true=" + formatNumber(trueValue(id, tree.nodes), 2), p.x - 38, p.y + r + 46, COLORS.muted, 10, 600, 90);
      }
    });
  }

  function drawBars(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Root allocation");
    var rows = result.rows;
    var plotX = x + 110;
    var plotY = y + 48;
    var plotW = w - 142;
    var rowH = Math.min(62, (h - 82) / rows.length);
    var maxN = Math.max(1, result.params.simulations);
    rows.forEach(function (row, index) {
      var yy = plotY + rowH * index;
      drawText(ctx, row.label, x + 14, yy + 19, COLORS.text, 11, 750, 88);
      drawText(ctx, "prior " + formatNumber(row.prior, 2), x + 14, yy + 35, COLORS.muted, 10, 600, 88);

      ctx.fillStyle = COLORS.grid;
      drawRoundRect(ctx, plotX, yy + 3, plotW, 14, 5);
      ctx.fill();
      ctx.fillStyle = row.id === result.recommended.id ? COLORS.max : COLORS.edge;
      drawRoundRect(ctx, plotX, yy + 3, plotW * row.n / maxN, 14, 5);
      ctx.fill();

      var qX = plotX + plotW * row.q;
      var tX = plotX + plotW * row.trueValue;
      ctx.strokeStyle = COLORS.warn;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tX, yy + 23);
      ctx.lineTo(tX, yy + 45);
      ctx.stroke();
      ctx.strokeStyle = COLORS.prior;
      ctx.beginPath();
      ctx.moveTo(qX, yy + 25);
      ctx.lineTo(qX, yy + 43);
      ctx.stroke();
      drawText(ctx, "N " + row.n, plotX + plotW + 8, yy + 15, COLORS.muted, 10, 650, 42);
      drawText(ctx, "Q " + formatNumber(row.q, 2), plotX + plotW + 8, yy + 31, COLORS.prior, 10, 650, 48);
      drawText(ctx, "T " + formatNumber(row.trueValue, 2), plotX + plotW + 8, yy + 47, COLORS.warn, 10, 650, 48);
    });
  }

  function drawRegret(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Regret during search");
    var hist = result.history;
    var plotX = x + 42;
    var plotY = y + 42;
    var plotW = w - 68;
    var plotH = h - 72;
    var maxRegret = Math.max(0.01, hist.reduce(function (m, row) { return Math.max(m, row.regret); }, 0));

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g += 1) {
      var gy = plotY + plotH * g / 3;
      ctx.beginPath();
      ctx.moveTo(plotX, gy);
      ctx.lineTo(plotX + plotW, gy);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach(function (row, index) {
      var px = plotX + plotW * (row.simulations - 1) / Math.max(1, result.params.simulations - 1);
      var py = plotY + plotH - plotH * row.regret / maxRegret;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    drawText(ctx, "0", plotX - 12, plotY + plotH + 4, COLORS.muted, 10, 500);
    drawText(ctx, String(result.params.simulations), plotX + plotW - 26, plotY + plotH + 18, COLORS.muted, 10, 500);
    drawText(ctx, formatNumber(maxRegret, 2), plotX, plotY - 8, COLORS.muted, 10, 500);
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var fitted = setCanvasSize(canvas);
    var ctx = fitted.ctx;
    var width = fitted.width;
    var height = fitted.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);

    var pad = 16;
    var gap = 14;
    if (width < 680) {
      var third = (height - pad * 2 - gap * 2) / 3;
      drawTree(ctx, result, pad, pad, width - pad * 2, third);
      drawBars(ctx, result, pad, pad + third + gap, width - pad * 2, third);
      drawRegret(ctx, result, pad, pad + 2 * (third + gap), width - pad * 2, third);
      return;
    }
    var leftW = width * 0.56;
    var rightW = width - leftW - pad * 2 - gap;
    drawTree(ctx, result, pad, pad, leftW, height - pad * 2);
    drawBars(ctx, result, pad + leftW + gap, pad, rightW, (height - pad * 2 - gap) * 0.58);
    drawRegret(ctx, result, pad + leftW + gap, pad + (height - pad * 2 - gap) * 0.58 + gap, rightW, (height - pad * 2 - gap) * 0.42);
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;

    function render() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    container.querySelectorAll("[data-param]").forEach(function (el) {
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });

    if (window.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      window.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    render();
  }

  function init() {
    var labs = document.querySelectorAll("[data-mcts-confidence-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    scenarios: SCENARIOS
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MCTSConfidenceLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
