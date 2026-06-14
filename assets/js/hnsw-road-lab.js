(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    faint: "#edf2f7",
    rule: "#d8e0e8",
    panel: "#f8fafc",
    point: "#334155",
    base: "rgba(100, 116, 139, 0.16)",
    shortcut: "rgba(180, 83, 9, 0.42)",
    upper: "rgba(124, 58, 237, 0.36)",
    local: "#2563eb",
    smallWorld: "#b45309",
    hierarchy: "#0f766e",
    exact: "#7c3aed",
    miss: "#be123c",
    query: "#172026"
  };

  var DEFAULTS = {
    points: 420,
    degree: 8,
    shortcuts: 2,
    beam: 12,
    separation: 1.15,
    queries: 180,
    highlight: "hierarchy"
  };

  var HIGHLIGHTS = ["hierarchy", "smallWorld", "local", "exact"];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function snapNumber(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    var snapped = min + Math.round((raw - min) / step) * step;
    return clamp(snapped, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var highlight = String(raw.highlight == null ? DEFAULTS.highlight : raw.highlight);
    if (HIGHLIGHTS.indexOf(highlight) < 0) highlight = DEFAULTS.highlight;
    return {
      points: snapNumber(raw.points, DEFAULTS.points, 180, 760, 20),
      degree: snapNumber(raw.degree, DEFAULTS.degree, 4, 16, 2),
      shortcuts: snapNumber(raw.shortcuts, DEFAULTS.shortcuts, 0, 5, 1),
      beam: snapNumber(raw.beam, DEFAULTS.beam, 1, 36, 1),
      separation: snapNumber(raw.separation, DEFAULTS.separation, 0.75, 1.65, 0.05),
      queries: snapNumber(raw.queries, DEFAULTS.queries, 80, 320, 20),
      highlight: highlight
    };
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function makeCenters(separation) {
    var s = separation * 112;
    return [
      { x: -1.12 * s, y: -0.58 * s, sx: 0.46, sy: 0.25, angle: 0.26 },
      { x: 0.98 * s, y: -0.66 * s, sx: 0.35, sy: 0.44, angle: -0.56 },
      { x: -0.34 * s, y: 1.03 * s, sx: 0.54, sy: 0.30, angle: 0.82 },
      { x: 1.18 * s, y: 0.82 * s, sx: 0.40, sy: 0.35, angle: 0.12 },
      { x: -0.16 * s, y: 0.04 * s, sx: 0.33, sy: 0.33, angle: 0 }
    ];
  }

  function sampleBlob(rand, center, id) {
    var a = normal(rand) * center.sx * 72;
    var b = normal(rand) * center.sy * 72;
    var c = Math.cos(center.angle);
    var s = Math.sin(center.angle);
    return {
      id: id,
      cluster: center.cluster,
      x: center.x + a * c - b * s,
      y: center.y + a * s + b * c
    };
  }

  function makeDataset(params) {
    var centers = makeCenters(params.separation).map(function (center, index) {
      center.cluster = index;
      return center;
    });
    var pointRand = rng(0xC0FFEE + params.points * 17 + Math.round(params.separation * 1000));
    var queryRand = rng(0xA11CE + params.queries * 31 + Math.round(params.separation * 1000));
    var points = [];
    var queries = [];

    for (var i = 0; i < params.points; i += 1) {
      var pick = pointRand();
      var cluster = pick < 0.24 ? 0 : pick < 0.46 ? 1 : pick < 0.68 ? 2 : pick < 0.88 ? 3 : 4;
      points.push(sampleBlob(pointRand, centers[cluster], i));
    }

    for (var q = 0; q < params.queries; q += 1) {
      var qpick = queryRand();
      var qcluster = qpick < 0.22 ? 0 : qpick < 0.45 ? 1 : qpick < 0.68 ? 2 : qpick < 0.91 ? 3 : 4;
      var query = sampleBlob(queryRand, centers[qcluster], q);
      query.x += normal(queryRand) * 12;
      query.y += normal(queryRand) * 12;
      queries.push(query);
    }

    return { centers: centers, points: points, queries: queries };
  }

  function squaredDistance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function computeRows(points) {
    var rows = [];
    for (var i = 0; i < points.length; i += 1) {
      var row = [];
      for (var j = 0; j < points.length; j += 1) {
        if (i !== j) row.push({ index: j, distance: squaredDistance(points[i], points[j]) });
      }
      row.sort(function (a, b) { return a.distance - b.distance; });
      rows.push(row);
    }
    return rows;
  }

  function makeSetGraph(size) {
    var graph = [];
    for (var i = 0; i < size; i += 1) graph.push(new Set());
    return graph;
  }

  function addEdge(graph, a, b) {
    if (a === b || a == null || b == null) return false;
    graph[a].add(b);
    graph[b].add(a);
    return true;
  }

  function graphToArrays(graph) {
    return graph.map(function (neighbors) {
      return Array.from(neighbors);
    });
  }

  function buildLocalGraph(rows, degree) {
    var graph = makeSetGraph(rows.length);
    for (var i = 0; i < rows.length; i += 1) {
      for (var k = 0; k < Math.min(degree, rows[i].length); k += 1) {
        addEdge(graph, i, rows[i][k].index);
      }
    }
    return graphToArrays(graph);
  }

  function cloneToSetGraph(graph) {
    return graph.map(function (neighbors) {
      return new Set(neighbors);
    });
  }

  function buildSmallWorldGraph(localGraph, rows, shortcuts) {
    var graph = cloneToSetGraph(localGraph);
    var edges = [];
    if (shortcuts <= 0) return { graph: graphToArrays(graph), edges: edges };
    var rand = rng(0x5A11 + rows.length * 13 + shortcuts * 101);

    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var minRank = Math.min(row.length - 1, 4);
      for (var s = 0; s < shortcuts; s += 1) {
        var rank = minRank + Math.floor(Math.pow(rand(), 0.36) * Math.max(1, row.length - minRank));
        rank = clamp(rank, minRank, row.length - 1);
        var target = row[rank].index;
        if (!graph[i].has(target)) {
          addEdge(graph, i, target);
          edges.push([i, target]);
        }
      }
    }
    return { graph: graphToArrays(graph), edges: edges };
  }

  function assignLevels(points, degree) {
    var rand = rng(0xBADC0DE + points.length * 11 + degree * 29);
    var probability = 1 / Math.sqrt(degree + 1);
    var levels = [];
    var maxLevel = 0;
    for (var i = 0; i < points.length; i += 1) {
      var level = 0;
      while (level < 6 && rand() < probability) level += 1;
      levels.push(level);
      maxLevel = Math.max(maxLevel, level);
    }
    if (maxLevel === 0 && points.length) {
      levels[0] = 1;
      maxLevel = 1;
    }
    return { levels: levels, maxLevel: maxLevel };
  }

  function buildLayerGraph(rows, levels, level, degree) {
    var graph = makeSetGraph(rows.length);
    for (var i = 0; i < rows.length; i += 1) {
      if (levels[i] < level) continue;
      var added = 0;
      for (var r = 0; r < rows[i].length && added < degree; r += 1) {
        var target = rows[i][r].index;
        if (levels[target] >= level) {
          addEdge(graph, i, target);
          added += 1;
        }
      }
    }
    return graphToArrays(graph);
  }

  function buildHierarchy(localGraph, rows, points, degree) {
    var levelData = assignLevels(points, degree);
    var layers = [localGraph];
    for (var level = 1; level <= levelData.maxLevel; level += 1) {
      layers[level] = buildLayerGraph(rows, levelData.levels, level, Math.max(2, Math.floor(degree * 0.75)));
    }

    var entry = 0;
    for (var i = 1; i < points.length; i += 1) {
      if (levelData.levels[i] > levelData.levels[entry]) entry = i;
      else if (levelData.levels[i] === levelData.levels[entry]) {
        var a = Math.abs(points[i].x) + Math.abs(points[i].y);
        var b = Math.abs(points[entry].x) + Math.abs(points[entry].y);
        if (a < b) entry = i;
      }
    }

    return {
      entry: entry,
      layers: layers,
      levels: levelData.levels,
      maxLevel: levelData.maxLevel
    };
  }

  function insertBest(list, item, limit) {
    list.push(item);
    list.sort(function (a, b) { return a.distance - b.distance; });
    if (list.length > limit) list.length = limit;
  }

  function bestFirstSearch(graph, points, query, entry, beam) {
    var visited = new Set();
    var candidates = [];
    var best = [];
    var visitOrder = [];
    var trace = [];
    var firstDistance = squaredDistance(points[entry], query);
    var bestIndex = entry;
    var bestDistance = firstDistance;
    var computations = 1;

    visited.add(entry);
    candidates.push({ index: entry, distance: firstDistance });
    best.push({ index: entry, distance: firstDistance });
    visitOrder.push(entry);
    trace.push(entry);

    while (candidates.length) {
      candidates.sort(function (a, b) { return a.distance - b.distance; });
      var candidate = candidates.shift();
      var worst = best[best.length - 1].distance;
      if (best.length >= beam && candidate.distance > worst) break;

      var neighbors = graph[candidate.index] || [];
      for (var n = 0; n < neighbors.length; n += 1) {
        var neighbor = neighbors[n];
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        var distance = squaredDistance(points[neighbor], query);
        computations += 1;
        visitOrder.push(neighbor);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = neighbor;
          trace.push(neighbor);
        }
        if (best.length < beam || distance < best[best.length - 1].distance) {
          insertBest(best, { index: neighbor, distance: distance }, beam);
          candidates.push({ index: neighbor, distance: distance });
        }
      }
    }

    return {
      index: bestIndex,
      distance: bestDistance,
      computations: computations,
      trace: trace,
      visited: visitOrder
    };
  }

  function greedyLayer(graph, points, query, entry) {
    var current = entry;
    var currentDistance = squaredDistance(points[current], query);
    var computations = 1;
    var trace = [current];
    var visited = [current];
    var seen = new Set([current]);
    var moved = true;

    while (moved) {
      moved = false;
      var best = current;
      var bestDistance = currentDistance;
      var neighbors = graph[current] || [];
      for (var i = 0; i < neighbors.length; i += 1) {
        var neighbor = neighbors[i];
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        var distance = squaredDistance(points[neighbor], query);
        computations += 1;
        visited.push(neighbor);
        if (distance < bestDistance) {
          best = neighbor;
          bestDistance = distance;
        }
      }
      if (best !== current) {
        current = best;
        currentDistance = bestDistance;
        trace.push(current);
        moved = true;
      }
    }

    return {
      index: current,
      distance: currentDistance,
      computations: computations,
      trace: trace,
      visited: visited
    };
  }

  function searchHierarchy(index, points, query, beam) {
    var current = index.entry;
    var computations = 0;
    var trace = [current];
    var upperVisited = [];

    for (var level = index.maxLevel; level >= 1; level -= 1) {
      var layer = index.layers[level];
      if (!layer || !layer[current]) continue;
      var step = greedyLayer(layer, points, query, current);
      current = step.index;
      computations += step.computations;
      upperVisited = upperVisited.concat(step.visited);
      step.trace.forEach(function (node) {
        if (trace[trace.length - 1] !== node) trace.push(node);
      });
    }

    var base = bestFirstSearch(index.layers[0], points, query, current, beam);
    computations += base.computations;
    base.trace.forEach(function (node) {
      if (trace[trace.length - 1] !== node) trace.push(node);
    });

    return {
      index: base.index,
      distance: base.distance,
      computations: computations,
      trace: trace,
      visited: upperVisited.concat(base.visited),
      entry: index.entry
    };
  }

  function searchExact(points, query) {
    var best = 0;
    var bestDistance = squaredDistance(points[0], query);
    for (var i = 1; i < points.length; i += 1) {
      var distance = squaredDistance(points[i], query);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    return {
      index: best,
      distance: bestDistance,
      computations: points.length,
      trace: [best],
      visited: points.map(function (_, index) { return index; })
    };
  }

  function summarize(methodRecords, exactRecords) {
    var computations = methodRecords.map(function (record) { return record.computations; }).sort(function (a, b) { return a - b; });
    var hits = 0;
    var ratioSum = 0;
    var missPenalty = 0;
    for (var i = 0; i < methodRecords.length; i += 1) {
      if (methodRecords[i].index === exactRecords[i].index) hits += 1;
      var denominator = Math.max(1e-9, exactRecords[i].distance);
      var ratio = Math.sqrt(methodRecords[i].distance / denominator);
      ratioSum += ratio;
      if (methodRecords[i].index !== exactRecords[i].index) missPenalty += ratio - 1;
    }
    var n = Math.max(1, methodRecords.length);
    return {
      recall: hits / n,
      avgComputations: computations.reduce(function (sum, value) { return sum + value; }, 0) / n,
      p95Computations: computations[Math.min(computations.length - 1, Math.floor(0.95 * (computations.length - 1)))],
      distanceRatio: ratioSum / n,
      missPenalty: missPenalty / n,
      misses: n - hits
    };
  }

  function chooseSample(records, highlight) {
    if (highlight !== "exact") {
      for (var i = 0; i < records.length; i += 1) {
        if (records[i][highlight].index !== records[i].exact.index) return records[i];
      }
    }
    for (var j = 0; j < records.length; j += 1) {
      if (records[j].local.index !== records[j].exact.index && records[j].hierarchy.index === records[j].exact.index) {
        return records[j];
      }
    }
    return records[Math.min(records.length - 1, Math.floor(records.length * 0.37))];
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var dataset = makeDataset(params);
    var rows = computeRows(dataset.points);
    var localGraph = buildLocalGraph(rows, params.degree);
    var smallWorld = buildSmallWorldGraph(localGraph, rows, params.shortcuts);
    var hierarchy = buildHierarchy(localGraph, rows, dataset.points, params.degree);
    var exactRecords = [];
    var records = [];
    var localRecords = [];
    var smallRecords = [];
    var hierarchyRecords = [];
    var exactComputations = [];

    dataset.queries.forEach(function (query) {
      var exact = searchExact(dataset.points, query);
      var local = bestFirstSearch(localGraph, dataset.points, query, 0, params.beam);
      var small = bestFirstSearch(smallWorld.graph, dataset.points, query, 0, params.beam);
      var hierarchical = searchHierarchy(hierarchy, dataset.points, query, params.beam);
      exactRecords.push(exact);
      exactComputations.push(exact);
      localRecords.push(local);
      smallRecords.push(small);
      hierarchyRecords.push(hierarchical);
      records.push({
        query: query,
        exact: exact,
        local: local,
        smallWorld: small,
        hierarchy: hierarchical
      });
    });

    var metrics = {
      local: summarize(localRecords, exactRecords),
      smallWorld: summarize(smallRecords, exactRecords),
      hierarchy: summarize(hierarchyRecords, exactRecords),
      exact: summarize(exactComputations, exactRecords)
    };
    metrics.exact.recall = 1;
    metrics.exact.distanceRatio = 1;

    return {
      params: params,
      dataset: dataset,
      rows: rows,
      graphs: {
        local: localGraph,
        smallWorld: smallWorld.graph,
        shortcutEdges: smallWorld.edges,
        hierarchy: hierarchy
      },
      metrics: metrics,
      sample: chooseSample(records, params.highlight)
    };
  }

  function formatPercent(value, digits) {
    return (value * 100).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (digits != null) return value.toFixed(digits);
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function metric(label, value, tone) {
    var klass = "hnsw-road-lab__metric";
    if (tone) klass += " hnsw-road-lab__metric--" + tone;
    return "<div class=\"" + klass + "\"><span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, data) {
    var m = data.metrics;
    var exactWork = m.exact.avgComputations;
    var highlighted = m[data.params.highlight];
    var html = [
      metric("Hierarchy recall@1", formatPercent(m.hierarchy.recall), m.hierarchy.recall > 0.9 ? "good" : "warn"),
      metric("Hierarchy work", formatNumber(m.hierarchy.avgComputations) + " dists", m.hierarchy.avgComputations < exactWork * 0.35 ? "good" : "warn"),
      metric("Small-world recall@1", formatPercent(m.smallWorld.recall), m.smallWorld.recall > m.local.recall ? "good" : "warn"),
      metric("Local recall@1", formatPercent(m.local.recall), m.local.misses ? "warn" : "good"),
      metric("Exact scan work", formatNumber(exactWork) + " dists"),
      metric("Highlighted misses", String(highlighted.misses), highlighted.misses === 0 ? "good" : "bad")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function paramsFromRoot(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function labelFor(key, value) {
    if (key === "separation") return value.toFixed(2) + "x";
    if (key === "highlight") {
      return {
        local: "local",
        smallWorld: "small-world",
        hierarchy: "hierarchy",
        exact: "exact"
      }[value] || value;
    }
    return String(value);
  }

  function updateControls(root, params) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (params[key] != null) input.value = String(params[key]);
    });
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (params[key] != null) output.textContent = labelFor(key, params[key]);
    });
  }

  function setFont(ctx, size, weight) {
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }

  function text(ctx, value, x, y, color, size, weight, align, baseline) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "middle";
    setFont(ctx, size || 12, weight || 500);
    ctx.fillText(value, x, y);
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function boundsFor(data) {
    var values = data.dataset.points.concat(data.dataset.queries);
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    values.forEach(function (point) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    var padX = Math.max(24, (maxX - minX) * 0.08);
    var padY = Math.max(24, (maxY - minY) * 0.08);
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
  }

  function projector(bounds, box) {
    var sx = box.w / Math.max(1, bounds.maxX - bounds.minX);
    var sy = box.h / Math.max(1, bounds.maxY - bounds.minY);
    var scale = Math.min(sx, sy);
    var usedW = (bounds.maxX - bounds.minX) * scale;
    var usedH = (bounds.maxY - bounds.minY) * scale;
    var ox = box.x + (box.w - usedW) / 2;
    var oy = box.y + (box.h - usedH) / 2;
    return function (point) {
      return {
        x: ox + (point.x - bounds.minX) * scale,
        y: oy + usedH - (point.y - bounds.minY) * scale
      };
    };
  }

  function drawEdges(ctx, points, graph, project, color, limit) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    var drawn = 0;
    for (var i = 0; i < graph.length; i += 1) {
      if (limit && drawn >= limit) break;
      var a = project(points[i]);
      var neighbors = graph[i] || [];
      for (var j = 0; j < neighbors.length; j += 1) {
        var target = neighbors[j];
        if (target <= i) continue;
        var b = project(points[target]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        drawn += 1;
        if (limit && drawn >= limit) break;
      }
    }
  }

  function drawEdgeList(ctx, points, edges, project, color, limit) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    edges.slice(0, limit || edges.length).forEach(function (edge) {
      var a = project(points[edge[0]]);
      var b = project(points[edge[1]]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }

  function drawTrace(ctx, points, trace, project, color) {
    if (!trace || trace.length < 1) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    trace.forEach(function (index, i) {
      var p = project(points[index]);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    trace.forEach(function (index, i) {
      var p = project(points[index]);
      ctx.fillStyle = i === trace.length - 1 ? color : "#ffffff";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 ? 4.4 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawMap(ctx, data, box, compact) {
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, "Graph search path", box.x + 16, box.y + 24, COLORS.text, 13, 750);

    var inner = { x: box.x + 14, y: box.y + 42, w: box.w - 28, h: box.h - 56 };
    var project = projector(boundsFor(data), inner);
    var points = data.dataset.points;
    var graph = data.params.highlight === "smallWorld" ? data.graphs.smallWorld : data.graphs.local;
    drawEdges(ctx, points, graph, project, COLORS.base, compact ? 380 : 760);
    if (data.params.highlight === "smallWorld") {
      drawEdgeList(ctx, points, data.graphs.shortcutEdges, project, COLORS.shortcut, compact ? 90 : 180);
    }
    if (data.params.highlight === "hierarchy") {
      for (var level = 1; level <= data.graphs.hierarchy.maxLevel; level += 1) {
        drawEdges(ctx, points, data.graphs.hierarchy.layers[level], project, COLORS.upper, compact ? 80 : 150);
      }
    }

    points.forEach(function (point, index) {
      var p = project(point);
      var level = data.graphs.hierarchy.levels[index];
      ctx.fillStyle = level > 0 ? "rgba(15, 118, 110, 0.64)" : "rgba(51, 65, 85, 0.58)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, level > 0 ? 2.8 + Math.min(2, level) : 2.1, 0, Math.PI * 2);
      ctx.fill();
    });

    var sample = data.sample;
    var highlighted = sample[data.params.highlight];
    var color = COLORS[data.params.highlight] || COLORS.hierarchy;
    drawTrace(ctx, points, highlighted.trace, project, color);

    var query = project(sample.query);
    ctx.strokeStyle = COLORS.query;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(query.x - 7, query.y);
    ctx.lineTo(query.x + 7, query.y);
    ctx.moveTo(query.x, query.y - 7);
    ctx.lineTo(query.x, query.y + 7);
    ctx.stroke();

    var exact = project(points[sample.exact.index]);
    ctx.strokeStyle = COLORS.exact;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(exact.x, exact.y, 8, 0, Math.PI * 2);
    ctx.stroke();

    if (highlighted.index !== sample.exact.index) {
      var found = project(points[highlighted.index]);
      ctx.strokeStyle = COLORS.miss;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(found.x, found.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    var status = highlighted.index === sample.exact.index ? "hit" : "miss";
    text(
      ctx,
      labelFor("highlight", data.params.highlight) + " " + status + " - " + highlighted.computations + " distance calls",
      box.x + box.w - 16,
      box.y + 24,
      highlighted.index === sample.exact.index ? color : COLORS.miss,
      11,
      750,
      "right"
    );
  }

  function drawTradeoff(ctx, data, box) {
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = COLORS.panel;
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, "Recall vs distance work", box.x + 16, box.y + 24, COLORS.text, 13, 750);

    var left = box.x + 52;
    var right = box.x + box.w - 24;
    var top = box.y + 52;
    var bottom = box.y + box.h - 38;
    var w = right - left;
    var h = bottom - top;
    var maxWork = Math.max(2, data.params.points);

    ctx.strokeStyle = COLORS.faint;
    ctx.lineWidth = 1;
    [0.5, 0.75, 1].forEach(function (tick) {
      var y = bottom - h * tick;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      text(ctx, formatPercent(tick, 0), left - 8, y, COLORS.muted, 10, 550, "right");
    });

    [20, 60, 180, data.params.points].forEach(function (tick) {
      if (tick > maxWork) return;
      var x = left + w * Math.log(tick + 1) / Math.log(maxWork + 1);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      text(ctx, String(tick), x, bottom + 16, COLORS.muted, 10, 550, "center");
    });

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    [
      ["local", "local"],
      ["smallWorld", "small-world"],
      ["hierarchy", "hierarchy"],
      ["exact", "exact"]
    ].forEach(function (item) {
      var key = item[0];
      var metricData = data.metrics[key];
      var x = left + w * Math.log(metricData.avgComputations + 1) / Math.log(maxWork + 1);
      var y = bottom - h * metricData.recall;
      ctx.fillStyle = COLORS[key];
      ctx.beginPath();
      ctx.arc(x, y, data.params.highlight === key ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, item[1], x + 8, y - 9, COLORS[key], 10, 750, "left");
    });

    text(ctx, "distance computations, log scale", right, box.y + box.h - 16, COLORS.muted, 10, 550, "right");
    text(ctx, "recall@1", left, top - 16, COLORS.muted, 10, 550, "left");
  }

  function drawLayerMeter(ctx, data, box) {
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, "Promoted nodes by layer", box.x + 16, box.y + 23, COLORS.text, 13, 750);

    var counts = [];
    for (var level = 0; level <= data.graphs.hierarchy.maxLevel; level += 1) counts[level] = 0;
    data.graphs.hierarchy.levels.forEach(function (level) {
      for (var l = 0; l <= level; l += 1) counts[l] += 1;
    });
    var max = Math.max.apply(null, counts);
    var left = box.x + 92;
    var top = box.y + 48;
    var rowH = Math.min(28, (box.h - 64) / Math.max(1, counts.length));
    counts.forEach(function (count, level) {
      var y = top + level * rowH;
      var barW = (box.w - 122) * count / max;
      text(ctx, "L" + level, box.x + 20, y + rowH / 2, COLORS.muted, 10, 650);
      ctx.fillStyle = level === 0 ? "rgba(51, 65, 85, 0.24)" : "rgba(15, 118, 110, 0.38)";
      roundRect(ctx, left, y + 5, Math.max(2, barW), Math.max(4, rowH - 10), 4);
      ctx.fill();
      text(ctx, String(count), left + barW + 7, y + rowH / 2, COLORS.text, 10, 650);
    });
  }

  function drawCanvas(canvas, data) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 680;
    var height = compact ? 760 : 610;
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

    if (compact) {
      drawMap(ctx, data, { x: 8, y: 8, w: width - 16, h: 436 }, true);
      drawTradeoff(ctx, data, { x: 8, y: 458, w: width - 16, h: 184 });
      drawLayerMeter(ctx, data, { x: 8, y: 656, w: width - 16, h: 96 });
    } else {
      drawMap(ctx, data, { x: 8, y: 8, w: Math.round(width * 0.63) - 14, h: height - 16 }, false);
      drawTradeoff(ctx, data, { x: Math.round(width * 0.63) + 4, y: 8, w: width - Math.round(width * 0.63) - 12, h: 330 });
      drawLayerMeter(ctx, data, { x: Math.round(width * 0.63) + 4, y: 352, w: width - Math.round(width * 0.63) - 12, h: height - 360 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    updateControls(root, params);
    var data = simulate(params);
    renderMetrics(root, data);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, data);
  }

  function boot() {
    var roots = document.querySelectorAll("[data-hnsw-road-lab]");
    roots.forEach(function (root) {
      var draw = function () {
        try {
          render(root);
        } catch (error) {
          var target = root.querySelector("[data-metrics]");
          if (target) target.innerHTML = metric("Lab error", error.message || String(error), "bad");
          throw error;
        }
      };
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", draw);
        input.addEventListener("change", draw);
      });
      draw();
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  global.HnswRoadLab = {
    cleanParams: cleanParams,
    simulate: simulate
  };
})(typeof window !== "undefined" ? window : globalThis);
