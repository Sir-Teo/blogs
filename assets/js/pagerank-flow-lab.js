(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    core: "#0f766e",
    coreDark: "#134e4a",
    spam: "#b45309",
    spamDark: "#7c2d12",
    paid: "#c2410c",
    leak: "#7c3aed",
    residual: "#2563eb",
    boundary: "#6d28d9"
  };

  var NODE_DEFS = [
    { key: "atlas", label: "Atlas", group: "core", x: 0.20, y: 0.24 },
    { key: "search", label: "Search", group: "core", x: 0.47, y: 0.15 },
    { key: "docs", label: "Docs", group: "core", x: 0.35, y: 0.43 },
    { key: "blog", label: "Blog", group: "core", x: 0.16, y: 0.61 },
    { key: "forum", label: "Forum", group: "core", x: 0.56, y: 0.55 },
    { key: "shop", label: "Shop", group: "core", x: 0.70, y: 0.35 },
    { key: "spamHub", label: "Spam hub", group: "spam", x: 0.80, y: 0.70 },
    { key: "spamA", label: "Spam A", group: "spam", x: 0.66, y: 0.82 },
    { key: "spamB", label: "Spam B", group: "spam", x: 0.90, y: 0.85 },
    { key: "spamC", label: "Spam C", group: "spam", x: 0.93, y: 0.57 }
  ];

  var BASE_EDGES = [
    [0, 1], [0, 2], [0, 3],
    [1, 0], [1, 2], [1, 4],
    [2, 0], [2, 3], [2, 4],
    [3, 0], [3, 2], [3, 4],
    [4, 2], [4, 3], [4, 5],
    [6, 7], [6, 8], [6, 9],
    [7, 6], [7, 8],
    [8, 6], [8, 9],
    [9, 6], [9, 7]
  ];

  var PAID_SOURCES = [3, 4, 2, 1, 0];
  var LEAK_EDGES = [[6, 2], [6, 0], [7, 1], [8, 4]];
  var SPAM_INDICES = [6, 7, 8, 9];
  var CORE_INDICES = [0, 1, 2, 3, 4, 5];
  var TOPIC_VECTOR = [0.10, 0.22, 0.28, 0.24, 0.07, 0.03, 0.015, 0.015, 0.015, 0.015];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(values) {
    var total = values.reduce(function (acc, value) { return acc + value; }, 0);
    if (!isFinite(total) || total <= 0) return values.map(function () { return 1 / values.length; });
    return values.map(function (value) { return value / total; });
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatShare(value, digits) {
    return formatPercent(100 * value, digits == null ? 1 : digits);
  }

  function signedShare(value, digits) {
    if (!isFinite(value)) return "n/a";
    var sign = value >= 0 ? "+" : "";
    return sign + formatShare(value, digits == null ? 1 : digits);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 3 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="pagerank-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function parsePercent(raw, fallback, min, max) {
    var value = raw == null ? fallback : Number(raw);
    if (value <= 1) value *= 100;
    return clamp(value, min, max) / 100;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      alpha: parsePercent(raw.alpha, 85, 50, 95),
      iterations: clamp(Math.round(raw.iterations == null ? 28 : raw.iterations), 2, 80),
      paidLinks: clamp(Math.round(raw.paidLinks == null ? 2 : raw.paidLinks), 0, PAID_SOURCES.length),
      spamLeak: clamp(Math.round(raw.spamLeak == null ? 1 : raw.spamLeak), 0, LEAK_EDGES.length),
      topicBias: parsePercent(raw.topicBias, 30, 0, 100)
    };
  }

  function cloneParams(params) {
    return {
      alpha: params.alpha,
      iterations: params.iterations,
      paidLinks: params.paidLinks,
      spamLeak: params.spamLeak,
      topicBias: params.topicBias
    };
  }

  function addEdge(adjacency, edges, from, to, kind) {
    if (adjacency[from].indexOf(to) === -1) {
      adjacency[from].push(to);
      edges.push({ from: from, to: to, kind: kind });
    }
  }

  function buildGraph(params) {
    var adjacency = NODE_DEFS.map(function () { return []; });
    var edges = [];
    BASE_EDGES.forEach(function (edge) {
      addEdge(adjacency, edges, edge[0], edge[1], "base");
    });
    for (var i = 0; i < params.paidLinks; i += 1) {
      addEdge(adjacency, edges, PAID_SOURCES[i], 6, "paid");
    }
    for (var j = 0; j < params.spamLeak; j += 1) {
      addEdge(adjacency, edges, LEAK_EDGES[j][0], LEAK_EDGES[j][1], "leak");
    }
    return { adjacency: adjacency, edges: edges };
  }

  function teleportVector(topicBias) {
    var n = NODE_DEFS.length;
    var uniform = 1 / n;
    var topic = normalize(TOPIC_VECTOR.slice());
    return normalize(topic.map(function (value) {
      return (1 - topicBias) * uniform + topicBias * value;
    }));
  }

  function share(rank, indices) {
    return indices.reduce(function (acc, index) { return acc + rank[index]; }, 0);
  }

  function l1(a, b) {
    var total = 0;
    for (var i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
    return total;
  }

  function stepRank(rank, graph, teleport, alpha) {
    var n = rank.length;
    var next = new Array(n);
    for (var j = 0; j < n; j += 1) next[j] = (1 - alpha) * teleport[j];
    for (var i = 0; i < n; i += 1) {
      var out = graph.adjacency[i];
      if (!out.length) {
        for (var d = 0; d < n; d += 1) next[d] += alpha * rank[i] * teleport[d];
      } else {
        var mass = alpha * rank[i] / out.length;
        out.forEach(function (target) {
          next[target] += mass;
        });
      }
    }
    return normalize(next);
  }

  function runScenario(params, iterations) {
    var graph = buildGraph(params);
    var teleport = teleportVector(params.topicBias);
    var n = NODE_DEFS.length;
    var rank = teleport.map(function () { return 1 / n; });
    var history = [];
    var residual = NaN;
    var count = iterations == null ? params.iterations : iterations;
    for (var iter = 1; iter <= count; iter += 1) {
      var next = stepRank(rank, graph, teleport, params.alpha);
      residual = l1(next, rank);
      rank = next;
      history.push({
        iteration: iter,
        residual: residual,
        rank: rank.slice(),
        spamShare: share(rank, SPAM_INDICES)
      });
    }
    return {
      coreShare: share(rank, CORE_INDICES),
      danglingMass: rank[5],
      graph: graph,
      history: history,
      rank: rank,
      residual: residual,
      spamShare: share(rank, SPAM_INDICES),
      teleport: teleport
    };
  }

  function rankRows(rank, graph) {
    var indegree = NODE_DEFS.map(function () { return 0; });
    graph.edges.forEach(function (edge) {
      indegree[edge.to] += 1;
    });
    return NODE_DEFS.map(function (node, index) {
      return {
        group: node.group,
        inDegree: indegree[index],
        index: index,
        key: node.key,
        label: node.label,
        rank: rank[index],
        teleport: 0
      };
    }).sort(function (a, b) { return b.rank - a.rank; });
  }

  function paidSweep(params) {
    var rows = [];
    for (var paid = 0; paid <= PAID_SOURCES.length; paid += 1) {
      var p = cloneParams(params);
      p.paidLinks = paid;
      var run = runScenario(p, 80);
      rows.push({
        paidLinks: paid,
        coreShare: run.coreShare,
        spamShare: run.spamShare,
        top: rankRows(run.rank, run.graph)[0].label
      });
    }
    return rows;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var run = runScenario(params, params.iterations);
    var rows = rankRows(run.rank, run.graph);
    var baseParams = cloneParams(params);
    baseParams.paidLinks = 0;
    var base = runScenario(baseParams, 80);
    rows.forEach(function (row) {
      row.teleport = run.teleport[row.index];
    });
    return {
      coreShare: run.coreShare,
      danglingMass: run.danglingMass,
      graph: run.graph,
      history: run.history,
      paidLift: run.spamShare - base.spamShare,
      params: params,
      rank: run.rank,
      residual: run.residual,
      rows: rows,
      spamShare: run.spamShare,
      sweep: paidSweep(params),
      teleport: run.teleport,
      top: rows[0]
    };
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function nodeColor(group) {
    return group === "spam" ? COLORS.spam : COLORS.core;
  }

  function nodeDark(group) {
    return group === "spam" ? COLORS.spamDark : COLORS.coreDark;
  }

  function edgeColor(kind) {
    if (kind === "paid") return COLORS.paid;
    if (kind === "leak") return COLORS.leak;
    return "#94a3b8";
  }

  function positionNode(node, box) {
    return {
      x: box.x + node.x * box.w,
      y: box.y + 42 + node.y * (box.h - 58)
    };
  }

  function drawCurvedArrow(ctx, from, to, curve, color, width) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len;
    var uy = dy / len;
    var px = -uy;
    var py = ux;
    var startX = from.x + ux * from.r;
    var startY = from.y + uy * from.r;
    var endX = to.x - ux * (to.r + 4);
    var endY = to.y - uy * (to.r + 4);
    var cx = (startX + endX) / 2 + px * curve;
    var cy = (startY + endY) / 2 + py * curve;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = 0.68;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(cx, cy, endX, endY);
    ctx.stroke();
    ctx.globalAlpha = 1;
    var angle = Math.atan2(endY - cy, endX - cx);
    var size = Math.max(5, Math.min(9, width + 4));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - size * Math.cos(angle - Math.PI / 6), endY - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(endX - size * Math.cos(angle + Math.PI / 6), endY - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function drawGraphPanel(ctx, result, box) {
    panelTitle(ctx, box, "Flow graph", "node area tracks current PageRank mass");
    var maxRank = Math.max.apply(null, result.rank);
    var points = NODE_DEFS.map(function (node, index) {
      var p = positionNode(node, box);
      p.group = node.group;
      p.index = index;
      p.label = node.label;
      p.r = 8 + 18 * Math.sqrt(result.rank[index] / Math.max(1e-12, maxRank));
      if (box.w < 360) p.r = Math.min(p.r, 20);
      return p;
    });
    result.graph.edges.forEach(function (edge, index) {
      var from = points[edge.from];
      var to = points[edge.to];
      var out = result.graph.adjacency[edge.from].length || 1;
      var flow = result.rank[edge.from] / out;
      var curve = edge.kind === "base" ? ((index % 3) - 1) * 8 : (edge.kind === "paid" ? 18 : -18);
      drawCurvedArrow(ctx, from, to, curve, edgeColor(edge.kind), 0.8 + 16 * flow);
    });
    points.forEach(function (point) {
      ctx.fillStyle = point.group === "spam" ? "#fff7ed" : "#ecfdf5";
      ctx.strokeStyle = nodeColor(point.group);
      ctx.lineWidth = result.top.index === point.index ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(ctx, point.label, point.x, point.y + point.r + 12, "center", nodeDark(point.group), "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, formatShare(result.rank[point.index], 1), point.x, point.y, "center", COLORS.text, "700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
    var y = box.y + box.h - 13;
    label(ctx, "amber = paid inlinks", box.x, y, "left", COLORS.paid, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "violet = rank leakage", box.x + box.w, y, "right", COLORS.leak, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawRankPanel(ctx, result, box) {
    panelTitle(ctx, box, "Rank ledger", "stationary mass, inbound count, and teleport share");
    var rows = result.rows;
    var plot = { x: box.x + 66, y: box.y + 50, w: box.w - 126, h: box.h - 72 };
    var rowH = Math.min(24, Math.max(18, plot.h / rows.length));
    var maxRank = Math.max.apply(null, rows.map(function (row) { return row.rank; }));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowH;
      var barW = row.rank / maxRank * plot.w;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.24)" : "transparent";
      ctx.fillRect(box.x, y - 2, box.w, rowH);
      label(ctx, row.label, plot.x - 8, y + rowH * 0.5, "right", nodeDark(row.group), "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      ctx.fillStyle = nodeColor(row.group);
      ctx.fillRect(plot.x, y + rowH * 0.23, barW, rowH * 0.48);
      label(ctx, formatShare(row.rank, 1), plot.x + plot.w + 8, y + rowH * 0.5, "left", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, "in " + row.inDegree + " / v " + formatShare(row.teleport, 1), box.x + box.w - 2, y + rowH * 0.5, "right");
    });
  }

  function drawSweepPanel(ctx, result, box) {
    panelTitle(ctx, box, "Paid-link sweep", "farm share after 80 power iterations");
    var plot = { x: box.x + 44, y: box.y + 54, w: box.w - 64, h: box.h - 91 };
    drawAxis(ctx, plot);
    var maxY = Math.max(0.18, Math.max.apply(null, result.sweep.map(function (row) { return row.spamShare; })) * 1.18);
    function xScale(paid) {
      return plot.x + paid / PAID_SOURCES.length * plot.w;
    }
    function yScale(value) {
      return plot.y + plot.h - value / maxY * plot.h;
    }
    [0, 0.25, 0.5, 0.75, 1].forEach(function (fraction) {
      var y = plot.y + plot.h * fraction;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    ctx.strokeStyle = COLORS.spam;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    result.sweep.forEach(function (row, i) {
      var x = xScale(row.paidLinks);
      var y = yScale(row.spamShare);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    result.sweep.forEach(function (row) {
      var x = xScale(row.paidLinks);
      var y = yScale(row.spamShare);
      ctx.fillStyle = row.paidLinks === result.params.paidLinks ? COLORS.paid : "#ffffff";
      ctx.strokeStyle = COLORS.spam;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, row.paidLinks === result.params.paidLinks ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(ctx, String(row.paidLinks), x, plot.y + plot.h + 16, "center");
    });
    label(ctx, "0", plot.x - 7, plot.y + plot.h, "right");
    label(ctx, formatShare(maxY, 0), plot.x - 7, plot.y, "right");
    label(ctx, "paid links into farm", plot.x + plot.w / 2, box.y + box.h - 13, "center");
  }

  function drawConvergencePanel(ctx, result, box) {
    panelTitle(ctx, box, "Power iteration", "residual is the L1 change in the rank vector");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 66, h: box.h - 88 };
    drawAxis(ctx, plot);
    var minLog = -6;
    var maxLog = 0;
    function xScale(iter) {
      return plot.x + (iter - 1) / Math.max(1, result.params.iterations - 1) * plot.w;
    }
    function yScale(value) {
      var log = Math.log10(Math.max(1e-6, value));
      return plot.y + plot.h - (log - minLog) / (maxLog - minLog) * plot.h;
    }
    [1, 1e-2, 1e-4, 1e-6].forEach(function (tick) {
      var y = yScale(tick);
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, tick.toExponential(0), plot.x - 8, y, "right");
    });
    ctx.strokeStyle = COLORS.residual;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    result.history.forEach(function (row, i) {
      var x = xScale(row.iteration);
      var y = yScale(row.residual);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var last = result.history[result.history.length - 1];
    if (last) {
      var lx = xScale(last.iteration);
      var ly = yScale(last.residual);
      ctx.fillStyle = COLORS.residual;
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, "iter " + last.iteration, lx, plot.y + plot.h + 16, "center");
    }
    var sticky = result.params.alpha > 0.88 ? "sticky walk" : (result.params.alpha < 0.68 ? "short walk" : "balanced walk");
    label(ctx, "alpha = " + result.params.alpha.toFixed(2) + " (" + sticky + ")", plot.x, box.y + box.h - 13, "left", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "last " + formatNumber(result.residual, 4), plot.x + plot.w, box.y + box.h - 13, "right", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 600;
    var height = compact ? 1040 : 690;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    var margin = compact ? 22 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawGraphPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 300 });
      drawRankPanel(ctx, result, { x: margin, y: 360, w: panelW, h: 246 });
      drawSweepPanel(ctx, result, { x: margin, y: 638, w: panelW, h: 178 });
      drawConvergencePanel(ctx, result, { x: margin, y: 848, w: panelW, h: 164 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawGraphPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 324 });
      drawRankPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 324 });
      drawSweepPanel(ctx, result, { x: margin, y: 400, w: panelW2, h: 236 });
      drawConvergencePanel(ctx, result, { x: margin + panelW2 + gap, y: 400, w: panelW2, h: 236 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      alpha: result.params.alpha.toFixed(2),
      iterations: String(result.params.iterations),
      paidLinks: String(result.params.paidLinks),
      spamLeak: String(result.params.spamLeak),
      topicBias: formatShare(result.params.topicBias, 0)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("top page", result.top.label + " " + formatShare(result.top.rank, 1)),
        metric("spam share", formatShare(result.spamShare, 1)),
        metric("core share", formatShare(result.coreShare, 1)),
        metric("paid-edge lift", signedShare(result.paidLift, 1)),
        metric("dangling mass", formatShare(result.danglingMass, 1)),
        metric("L1 residual", formatNumber(result.residual, 4))
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-pagerank-lab]")).forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    simulate: simulate,
    stepRank: stepRank,
    teleportVector: teleportVector
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.PageRankFlowLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
