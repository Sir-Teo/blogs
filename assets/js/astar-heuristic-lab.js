(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    wall: "#111827",
    open: "#f8fafc",
    swamp: "#fef3c7",
    explored: "#bfdbfe",
    frontier: "#d8b4fe",
    path: "#0f766e",
    start: "#2563eb",
    goal: "#be123c",
    dijkstra: "#64748b",
    astar: "#7c3aed",
    bad: "#be123c",
    good: "#0f766e",
    terrain: "#d97706"
  };

  var WIDTH = 34;
  var HEIGHT = 24;
  var DEFAULTS = {
    heuristic: "manhattan",
    map: "swamp",
    seed: 17,
    swamp: 7,
    tie: "lowH",
    weight: 120
  };

  var MAPS = ["swamp", "rooms", "funnel", "open"];
  var HEURISTICS = ["manhattan", "euclidean", "zero", "beacon"];
  var TIES = ["lowH", "highG"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cleanParams(raw) {
    raw = raw || {};
    var map = String(raw.map || DEFAULTS.map);
    var heuristic = String(raw.heuristic || DEFAULTS.heuristic);
    var tie = String(raw.tie || DEFAULTS.tie);
    if (MAPS.indexOf(map) < 0) map = DEFAULTS.map;
    if (HEURISTICS.indexOf(heuristic) < 0) heuristic = DEFAULTS.heuristic;
    if (TIES.indexOf(tie) < 0) tie = DEFAULTS.tie;
    return {
      heuristic: heuristic,
      map: map,
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : Number(raw.seed)), 1, 999),
      swamp: clamp(Number(raw.swamp == null ? DEFAULTS.swamp : raw.swamp), 1, 12),
      tie: tie,
      weight: clamp(Number(raw.weight == null ? DEFAULTS.weight : raw.weight), 0, 260) / 100
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

  function keyOf(x, y) {
    return y * WIDTH + x;
  }

  function xyOf(key) {
    return { x: key % WIDTH, y: Math.floor(key / WIDTH) };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="astar-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function makeCell(cost, wall) {
    return { cost: cost || 1, wall: Boolean(wall) };
  }

  function emptyGrid() {
    var cells = [];
    for (var y = 0; y < HEIGHT; y += 1) {
      for (var x = 0; x < WIDTH; x += 1) cells.push(makeCell(1, false));
    }
    return cells;
  }

  function setWall(cells, x, y, value) {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    cells[keyOf(x, y)].wall = value !== false;
  }

  function setCost(cells, x, y, cost) {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    cells[keyOf(x, y)].cost = cost;
  }

  function makeMap(params) {
    var cells = emptyGrid();
    var start = { x: 2, y: 12 };
    var goal = { x: 31, y: 12 };
    var x;
    var y;
    if (params.map === "open") {
      start = { x: 2, y: 3 };
      goal = { x: 31, y: 20 };
    } else if (params.map === "swamp") {
      for (y = 7; y <= 16; y += 1) {
        for (x = 9; x <= 25; x += 1) setCost(cells, x, y, params.swamp);
      }
      for (x = 9; x <= 25; x += 1) {
        if (x % 5 !== 0) setCost(cells, x, 11, Math.max(2, params.swamp - 2));
      }
    } else if (params.map === "rooms") {
      var rand = rng(1000 + params.seed * 17);
      start = { x: 2, y: 2 };
      goal = { x: 31, y: 21 };
      [8, 16, 24].forEach(function (wx, index) {
        var door = 3 + Math.floor(rand() * 17);
        for (y = 1; y < HEIGHT - 1; y += 1) {
          if (Math.abs(y - door) > 1 && Math.abs(y - (door + 8 + index) % 21) > 0) setWall(cells, wx, y, true);
        }
      });
      [7, 15].forEach(function (wy, index) {
        var door = 4 + Math.floor(rand() * 24);
        for (x = 1; x < WIDTH - 1; x += 1) {
          if (Math.abs(x - door) > 1 && Math.abs(x - (door + 11 + index) % 32) > 0) setWall(cells, x, wy, true);
        }
      });
    } else if (params.map === "funnel") {
      start = { x: 2, y: 20 };
      goal = { x: 31, y: 3 };
      for (x = 6; x < 29; x += 1) {
        if (x !== 12 && x !== 27) setWall(cells, x, 6, true);
        if (x !== 7 && x !== 22) setWall(cells, x, 17, true);
      }
      for (y = 6; y <= 17; y += 1) {
        if (y !== 15) setWall(cells, 6, y, true);
        if (y !== 8) setWall(cells, 28, y, true);
      }
      for (x = 10; x <= 24; x += 1) {
        for (y = 9; y <= 14; y += 1) {
          if ((x + y) % 4 !== 0) setCost(cells, x, y, Math.max(2, params.swamp - 1));
        }
      }
    }
    [start, goal].forEach(function (p) {
      cells[keyOf(p.x, p.y)].wall = false;
      cells[keyOf(p.x, p.y)].cost = 1;
    });
    return { cells: cells, goal: goal, start: start };
  }

  function neighbors(map, key) {
    var p = xyOf(key);
    var out = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var x = p.x + d[0];
      var y = p.y + d[1];
      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
      var next = keyOf(x, y);
      if (!map.cells[next].wall) out.push(next);
    });
    return out;
  }

  function stepCost(map, toKey) {
    return map.cells[toKey].cost;
  }

  function Heap() {
    this.rows = [];
  }

  Heap.prototype.less = function (a, b) {
    if (a.f !== b.f) return a.f < b.f;
    if (a.tie !== b.tie) return a.tie < b.tie;
    return a.order < b.order;
  };

  Heap.prototype.push = function (item) {
    this.rows.push(item);
    var i = this.rows.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (!this.less(this.rows[i], this.rows[p])) break;
      var tmp = this.rows[i];
      this.rows[i] = this.rows[p];
      this.rows[p] = tmp;
      i = p;
    }
  };

  Heap.prototype.pop = function () {
    if (!this.rows.length) return null;
    var out = this.rows[0];
    var last = this.rows.pop();
    if (this.rows.length) {
      this.rows[0] = last;
      var i = 0;
      while (true) {
        var left = 2 * i + 1;
        var right = left + 1;
        var best = i;
        if (left < this.rows.length && this.less(this.rows[left], this.rows[best])) best = left;
        if (right < this.rows.length && this.less(this.rows[right], this.rows[best])) best = right;
        if (best === i) break;
        var tmp = this.rows[i];
        this.rows[i] = this.rows[best];
        this.rows[best] = tmp;
        i = best;
      }
    }
    return out;
  };

  function baseHeuristic(map, key, mode) {
    if (mode === "zero") return 0;
    var p = xyOf(key);
    var g = map.goal;
    var dx = Math.abs(p.x - g.x);
    var dy = Math.abs(p.y - g.y);
    if (mode === "euclidean") return Math.sqrt(dx * dx + dy * dy);
    if (mode === "beacon") {
      var beacon = map.mapName === "swamp" ? { x: 17, y: 12 } : { x: 27, y: 5 };
      var bd = Math.abs(p.x - beacon.x) + Math.abs(p.y - beacon.y);
      return dx + dy + Math.max(0, 9 - bd) * 1.5;
    }
    return dx + dy;
  }

  function heuristic(map, key, params) {
    return params.weight * baseHeuristic(map, key, params.heuristic);
  }

  function search(map, params, options) {
    options = options || {};
    var start = keyOf(map.start.x, map.start.y);
    var goal = keyOf(map.goal.x, map.goal.y);
    var heap = new Heap();
    var gScore = new Array(WIDTH * HEIGHT).fill(Infinity);
    var parent = new Array(WIDTH * HEIGHT).fill(-1);
    var closed = new Array(WIDTH * HEIGHT).fill(false);
    var expandedOrder = [];
    var frontierKeys = new Set();
    var reopens = 0;
    var order = 0;
    gScore[start] = 0;
    var h0 = options.zero ? 0 : heuristic(map, start, params);
    heap.push({ f: h0, key: start, order: order += 1, tie: 0 });
    frontierKeys.add(start);

    while (heap.rows.length) {
      var item = heap.pop();
      var key = item.key;
      if (closed[key]) continue;
      frontierKeys.delete(key);
      closed[key] = true;
      expandedOrder.push(key);
      if (key === goal) break;
      neighbors(map, key).forEach(function (next) {
        var tentative = gScore[key] + stepCost(map, next);
        if (tentative + 1e-9 >= gScore[next]) return;
        if (closed[next]) {
          closed[next] = false;
          reopens += 1;
        }
        parent[next] = key;
        gScore[next] = tentative;
        var h = options.zero ? 0 : heuristic(map, next, params);
        var tie = params.tie === "highG" ? -tentative : h;
        heap.push({ f: tentative + h, key: next, order: order += 1, tie: tie });
        frontierKeys.add(next);
      });
    }

    var path = [];
    if (isFinite(gScore[goal])) {
      var cur = goal;
      while (cur !== -1) {
        path.push(cur);
        if (cur === start) break;
        cur = parent[cur];
      }
      path.reverse();
    }
    return {
      cost: gScore[goal],
      expanded: expandedOrder.length,
      expandedOrder: expandedOrder,
      frontier: Array.from(frontierKeys),
      gScore: gScore,
      path: path,
      reopens: reopens
    };
  }

  function reverseDistances(map) {
    var goal = keyOf(map.goal.x, map.goal.y);
    var heap = new Heap();
    var dist = new Array(WIDTH * HEIGHT).fill(Infinity);
    var order = 0;
    dist[goal] = 0;
    heap.push({ f: 0, key: goal, order: order += 1, tie: 0 });
    while (heap.rows.length) {
      var item = heap.pop();
      var key = item.key;
      if (item.f > dist[key] + 1e-9) continue;
      neighbors(map, key).forEach(function (prev) {
        var cost = map.cells[key].cost;
        var nextDist = dist[key] + cost;
        if (nextDist + 1e-9 < dist[prev]) {
          dist[prev] = nextDist;
          heap.push({ f: nextDist, key: prev, order: order += 1, tie: 0 });
        }
      });
    }
    return dist;
  }

  function auditHeuristic(map, params, dist) {
    var maxOver = 0;
    var consistency = 0;
    var overCells = 0;
    for (var key = 0; key < WIDTH * HEIGHT; key += 1) {
      if (map.cells[key].wall || !isFinite(dist[key])) continue;
      var h = heuristic(map, key, params);
      var over = h - dist[key];
      if (over > 1e-9) {
        maxOver = Math.max(maxOver, over);
        overCells += 1;
      }
      neighbors(map, key).forEach(function (next) {
        var gap = h - (stepCost(map, next) + heuristic(map, next, params));
        if (gap > consistency) consistency = gap;
      });
    }
    return { consistentOver: consistency, maxOver: maxOver, overCells: overCells };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var map = makeMap(params);
    map.mapName = params.map;
    var optimal = search(map, Object.assign({}, params, { heuristic: "zero", weight: 0 }), { zero: true });
    var astar = search(map, params);
    var dist = reverseDistances(map);
    var audit = auditHeuristic(map, params, dist);
    var gap = astar.cost - optimal.cost;
    return {
      astar: astar,
      audit: audit,
      map: map,
      optimal: optimal,
      params: params,
      stats: {
        expandedSaved: 1 - astar.expanded / Math.max(1, optimal.expanded),
        gap: isFinite(gap) ? gap : Infinity,
        optimalCost: optimal.cost,
        pathCost: astar.cost,
        pathGapRatio: isFinite(gap) ? gap / Math.max(1, optimal.cost) : Infinity
      },
      trueDistance: dist
    };
  }

  function readState(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      if (input.tagName === "SELECT") raw[input.getAttribute("data-param")] = input.value;
      else raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var values = {
      seed: String(params.seed),
      swamp: formatNumber(params.swamp, 1),
      weight: formatNumber(params.weight, 2)
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function updateMetrics(metrics, result) {
    metrics.innerHTML = [
      metric("path cost", formatNumber(result.stats.pathCost, 1)),
      metric("optimal cost", formatNumber(result.stats.optimalCost, 1)),
      metric("expansions", String(result.astar.expanded)),
      metric("vs Dijkstra", formatPercent(result.stats.expandedSaved, 1)),
      metric("h overreach", formatNumber(result.audit.maxOver, 2)),
      metric("path gap", formatNumber(result.stats.gap, 1))
    ].join("");
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 700 ? 1080 : 700;
    var ratio = root.devicePixelRatio || 1;
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 43, 11, COLORS.muted, 550);
  }

  function drawGrid(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "search map", "blue explored cells, green chosen path");
    var left = x + 18;
    var top = y + 58;
    var size = Math.min(w - 36, h - 82);
    var cell = Math.min(size / WIDTH, size / HEIGHT);
    var gridW = cell * WIDTH;
    var gridH = cell * HEIGHT;
    var expanded = new Set(result.astar.expandedOrder);
    var frontier = new Set(result.astar.frontier);
    var path = new Set(result.astar.path);
    for (var yy = 0; yy < HEIGHT; yy += 1) {
      for (var xx = 0; xx < WIDTH; xx += 1) {
        var key = keyOf(xx, yy);
        var c = result.map.cells[key];
        var color = COLORS.open;
        if (c.wall) color = COLORS.wall;
        else if (c.cost > 1) color = COLORS.swamp;
        if (!c.wall && expanded.has(key)) color = COLORS.explored;
        if (!c.wall && frontier.has(key)) color = COLORS.frontier;
        if (!c.wall && path.has(key)) color = COLORS.path;
        if (xx === result.map.start.x && yy === result.map.start.y) color = COLORS.start;
        if (xx === result.map.goal.x && yy === result.map.goal.y) color = COLORS.goal;
        ctx.fillStyle = color;
        ctx.fillRect(left + xx * cell, top + yy * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, gridW, gridH);
    drawText(ctx, "cost " + formatNumber(result.astar.cost, 1) + " / optimal " + formatNumber(result.optimal.cost, 1), left, y + h - 12, 10, COLORS.muted, 650);
  }

  function drawAudit(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "heuristic audit", "red means h(n) is larger than the true remaining cost");
    var left = x + 18;
    var top = y + 58;
    var size = Math.min(w - 36, h - 82);
    var cell = Math.min(size / WIDTH, size / HEIGHT);
    var maxOver = Math.max(1e-9, result.audit.maxOver);
    for (var yy = 0; yy < HEIGHT; yy += 1) {
      for (var xx = 0; xx < WIDTH; xx += 1) {
        var key = keyOf(xx, yy);
        var c = result.map.cells[key];
        var color = c.wall ? COLORS.wall : COLORS.faint;
        if (!c.wall && isFinite(result.trueDistance[key])) {
          var over = Math.max(0, heuristic(result.map, key, result.params) - result.trueDistance[key]);
          if (over > 0) color = "rgba(190,18,60," + (0.18 + 0.72 * Math.sqrt(over / maxOver)).toFixed(3) + ")";
          else color = "rgba(15,118,110,0.13)";
        }
        if (xx === result.map.goal.x && yy === result.map.goal.y) color = COLORS.goal;
        ctx.fillStyle = color;
        ctx.fillRect(left + xx * cell, top + yy * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, cell * WIDTH, cell * HEIGHT);
    drawText(ctx, "overstated cells " + result.audit.overCells + ", max " + formatNumber(result.audit.maxOver, 2), left, y + h - 12, 10, COLORS.muted, 650);
  }

  function drawBars(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "cost and work ledger", "optimality is about cost; speed is about expansions");
    var rows = [
      { color: COLORS.dijkstra, label: "Dijkstra expansions", value: result.optimal.expanded, max: Math.max(result.optimal.expanded, result.astar.expanded, 1) },
      { color: COLORS.astar, label: "A* expansions", value: result.astar.expanded, max: Math.max(result.optimal.expanded, result.astar.expanded, 1) },
      { color: COLORS.good, label: "optimal path cost", value: result.optimal.cost, max: Math.max(result.optimal.cost, result.astar.cost, 1) },
      { color: result.stats.gap > 1e-9 ? COLORS.bad : COLORS.path, label: "returned path cost", value: result.astar.cost, max: Math.max(result.optimal.cost, result.astar.cost, 1) }
    ];
    var left = x + 132;
    var right = x + w - 24;
    var top = y + 68;
    rows.forEach(function (row, i) {
      var yy = top + i * 42;
      drawText(ctx, row.label, x + 18, yy + 16, 11, COLORS.text, 650);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy + 4, right - left, 14);
      ctx.fillStyle = row.color;
      ctx.fillRect(left, yy + 4, (right - left) * row.value / row.max, 14);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, yy + 4, right - left, 14);
      drawText(ctx, formatNumber(row.value, row.value > 100 ? 0 : 1), right, yy + 16, 10, COLORS.muted, 650, "right");
    });
    drawText(ctx, "reopens " + result.astar.reopens + ", consistency overreach " + formatNumber(result.audit.consistentOver, 2), x + 18, y + h - 24, 10, COLORS.muted, 650);
  }

  function drawExpansion(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "expansion order", "early cells are darker; late cells fade toward white");
    var left = x + 18;
    var top = y + 58;
    var size = Math.min(w - 36, h - 82);
    var cell = Math.min(size / WIDTH, size / HEIGHT);
    var order = new Map();
    result.astar.expandedOrder.forEach(function (key, i) { order.set(key, i + 1); });
    var maxOrder = Math.max(1, result.astar.expandedOrder.length);
    for (var yy = 0; yy < HEIGHT; yy += 1) {
      for (var xx = 0; xx < WIDTH; xx += 1) {
        var key = keyOf(xx, yy);
        var c = result.map.cells[key];
        var color = c.wall ? COLORS.wall : COLORS.faint;
        if (!c.wall && c.cost > 1) color = COLORS.swamp;
        if (order.has(key)) {
          var t = order.get(key) / maxOrder;
          color = "rgba(37,99,235," + (0.18 + 0.74 * (1 - t)).toFixed(3) + ")";
        }
        if (result.astar.path.indexOf(key) >= 0) color = COLORS.path;
        ctx.fillStyle = color;
        ctx.fillRect(left + xx * cell, top + yy * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, cell * WIDTH, cell * HEIGHT);
    drawText(ctx, result.params.heuristic + ", weight " + formatNumber(result.params.weight, 2), left, y + h - 12, 10, COLORS.muted, 650);
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 18;
    var gap = 16;
    if (width < 700) {
      var panelH = (height - 2 * pad - 3 * gap) / 4;
      drawGrid(ctx, result, pad, pad, width - 2 * pad, panelH);
      drawAudit(ctx, result, pad, pad + panelH + gap, width - 2 * pad, panelH);
      drawBars(ctx, result, pad, pad + 2 * (panelH + gap), width - 2 * pad, panelH);
      drawExpansion(ctx, result, pad, pad + 3 * (panelH + gap), width - 2 * pad, panelH);
      return;
    }
    var halfW = (width - 2 * pad - gap) / 2;
    var halfH = (height - 2 * pad - gap) / 2;
    drawGrid(ctx, result, pad, pad, halfW, halfH);
    drawAudit(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawBars(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawExpansion(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function initOne(container) {
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      var params = readState(container);
      updateOutputs(container, params);
      latest = evaluate({
        heuristic: params.heuristic,
        map: params.map,
        seed: params.seed,
        swamp: params.swamp,
        tie: params.tie,
        weight: params.weight * 100
      });
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-astar-heuristic-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    auditHeuristic: auditHeuristic,
    cleanParams: cleanParams,
    evaluate: evaluate,
    makeMap: makeMap,
    reverseDistances: reverseDistances,
    search: search
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AstarHeuristicLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
