(function (global) {
  "use strict";

  var COLORS = {
    amber: "#d97706",
    arb: "#be123c",
    axis: "#d7dee5",
    blue: "#2563eb",
    clean: "#0f766e",
    fill: "#f8fafc",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    purple: "#7c3aed",
    softAmber: "rgba(217, 119, 6, 0.14)",
    softArb: "rgba(190, 18, 60, 0.12)",
    softBlue: "rgba(37, 99, 235, 0.11)",
    softClean: "rgba(15, 118, 110, 0.13)",
    white: "#ffffff"
  };

  var CURRENCIES = ["USD", "EUR", "JPY", "GBP", "CHF", "CAD"];

  var LOG_USD_VALUE = {
    CAD: Math.log(0.74),
    CHF: Math.log(1.12),
    EUR: Math.log(1.08),
    GBP: Math.log(1.27),
    JPY: Math.log(0.0068),
    USD: 0
  };

  var DEFAULTS = {
    costBps: 6,
    gapBps: 42,
    impactBps: 3,
    scenario: "staleCross",
    seed: 37,
    size: 10000
  };

  var SCENARIOS = {
    clean: {
      cycle: ["USD", "EUR", "JPY", "USD"],
      label: "arbitrage-free sheet",
      note: "All cross-rates come from one latent price vector; costs make every round trip lose.",
      split: [0, 0, 0]
    },
    staleCross: {
      cycle: ["USD", "EUR", "JPY", "USD"],
      label: "stale cross quote",
      note: "One triangular cross has not caught up with the direct dollar-yen leg.",
      split: [0.5, 0.3, 0.2]
    },
    dealerGap: {
      cycle: ["EUR", "CHF", "GBP", "EUR"],
      label: "dealer gap",
      note: "Three executable quotes are individually plausible but jointly inconsistent.",
      split: [0.35, 0.4, 0.25]
    },
    fundingLoop: {
      cycle: ["CAD", "JPY", "GBP", "CHF", "CAD"],
      label: "four-leg funding loop",
      note: "A longer cycle hides the gain across four smaller quote gaps.",
      split: [0.28, 0.22, 0.25, 0.25]
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value, fallback) {
    value = Number(value);
    return isFinite(value) ? value : fallback;
  }

  function snap(value, fallback, min, max, step) {
    var raw = number(value, fallback);
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      costBps: snap(raw.costBps, DEFAULTS.costBps, 0, 40, 1),
      gapBps: snap(raw.gapBps, DEFAULTS.gapBps, 0, 120, 1),
      impactBps: snap(raw.impactBps, DEFAULTS.impactBps, 0, 30, 1),
      scenario: SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 9999, 1),
      size: snap(raw.size, DEFAULTS.size, 1000, 1000000, 1000)
    };
  }

  function hash32(x) {
    x |= 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function rng(seed) {
    var state = hash32(seed || 1);
    return function () {
      state = hash32(state + 0x9e3779b9);
      return state / 4294967296;
    };
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return "n/a";
    return Number(value).toFixed(digits == null ? 2 : digits);
  }

  function fmtMoney(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return "$" + fmt(value / 1000000, 2) + "m";
    if (Math.abs(value) >= 1000) return "$" + fmt(value / 1000, 1) + "k";
    return "$" + fmt(value, 2);
  }

  function metric(label, value, tone) {
    return '<div class="fx-cycle-lab__metric ' + (tone || "") + '">' +
      "<span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function edgeKey(from, to) {
    return CURRENCIES[from] + "->" + CURRENCIES[to];
  }

  function cycleName(cycle) {
    if (!cycle || !cycle.edges || !cycle.edges.length) return "none";
    var names = cycle.edges.map(function (edge) { return CURRENCIES[edge.from]; });
    names.push(CURRENCIES[cycle.edges[0].from]);
    return names.join(" -> ");
  }

  function scenarioNodes(scenario) {
    var cycle = (scenario && scenario.cycle ? scenario.cycle : []).slice();
    if (cycle.length > 1 && cycle[0] === cycle[cycle.length - 1]) cycle.pop();
    return cycle.map(function (name) { return CURRENCIES.indexOf(name); }).filter(function (index) { return index >= 0; });
  }

  function buildMarket(rawParams) {
    var params = cleanParams(rawParams);
    var scenario = SCENARIOS[params.scenario];
    var rand = rng(params.seed * 1009 + params.costBps * 31 + params.impactBps * 67);
    var shock = {};
    var cycle = scenario.cycle || [];
    for (var c = 0; c < cycle.length; c += 1) {
      var fromName = cycle[c];
      var toName = cycle[(c + 1) % cycle.length];
      var share = scenario.split[c] || 0;
      shock[fromName + "->" + toName] = params.scenario === "clean" ? 0 : params.gapBps * share;
    }

    var edges = [];
    var byPair = {};
    for (var i = 0; i < CURRENCIES.length; i += 1) {
      for (var j = 0; j < CURRENCIES.length; j += 1) {
        if (i === j) continue;
        var from = CURRENCIES[i];
        var to = CURRENCIES[j];
        var midRate = Math.exp(LOG_USD_VALUE[from] - LOG_USD_VALUE[to]);
        var pairNoise = 0.72 + 0.56 * rand();
        var executionCostBps = params.costBps + params.impactBps * pairNoise;
        var shockBps = shock[from + "->" + to] || 0;
        var rate = midRate * Math.exp((shockBps - executionCostBps) / 10000);
        var edge = {
          costBps: executionCostBps,
          from: i,
          key: edgeKey(i, j),
          midRate: midRate,
          rate: rate,
          shockBps: shockBps,
          to: j,
          weight: -Math.log(rate)
        };
        edges.push(edge);
        byPair[i + "|" + j] = edge;
      }
    }
    return {
      byPair: byPair,
      edges: edges,
      params: params,
      scenario: scenario
    };
  }

  function multiplyCycle(edges) {
    var product = 1;
    var sumWeight = 0;
    var costBps = 0;
    var shockBps = 0;
    edges.forEach(function (edge) {
      product *= edge.rate;
      sumWeight += edge.weight;
      costBps += edge.costBps;
      shockBps += edge.shockBps;
    });
    return {
      costBps: costBps,
      edges: edges.slice(),
      marginBps: (product - 1) * 10000,
      product: product,
      shockBps: shockBps,
      sumWeight: sumWeight
    };
  }

  function namedScenarioCycle(market) {
    var nodes = scenarioNodes(market.scenario);
    var edges = [];
    nodes.forEach(function (from, index) {
      var to = nodes[(index + 1) % nodes.length];
      var edge = market.byPair[from + "|" + to];
      if (edge) edges.push(edge);
    });
    return multiplyCycle(edges);
  }

  function enumerateCycles(market) {
    var n = CURRENCIES.length;
    var cycles = [];
    function dfs(start, path, used) {
      var last = path[path.length - 1];
      if (path.length >= 2) {
        cycles.push(path.map(function (node, index) {
          var next = index === path.length - 1 ? start : path[index + 1];
          return market.byPair[node + "|" + next];
        }));
      }
      if (path.length === n) return;
      for (var next = start + 1; next < n; next += 1) {
        if (used[next]) continue;
        used[next] = true;
        path.push(next);
        dfs(start, path, used);
        path.pop();
        used[next] = false;
      }
    }
    for (var start = 0; start < n; start += 1) {
      var used = {};
      used[start] = true;
      dfs(start, [start], used);
    }
    return cycles.map(multiplyCycle).sort(function (a, b) {
      return b.marginBps - a.marginBps;
    });
  }

  function orderCycleEdges(rawEdges) {
    if (!rawEdges.length) return [];
    var byFrom = {};
    rawEdges.forEach(function (edge) {
      byFrom[edge.from] = edge;
    });
    var current = rawEdges[0].from;
    var ordered = [];
    var seen = {};
    for (var i = 0; i < rawEdges.length; i += 1) {
      var edge = byFrom[current];
      if (!edge || seen[edge.key]) break;
      ordered.push(edge);
      seen[edge.key] = true;
      current = edge.to;
    }
    return ordered.length === rawEdges.length ? ordered : rawEdges.slice();
  }

  function extractCycle(updated, pred, predEdge, n) {
    var x = updated;
    for (var i = 0; i < n; i += 1) {
      x = pred[x];
      if (x == null || x < 0) return null;
    }
    var seen = {};
    var nodes = [];
    var cur = x;
    while (seen[cur] == null) {
      seen[cur] = nodes.length;
      nodes.push(cur);
      cur = pred[cur];
      if (cur == null || cur < 0) return null;
    }
    var cycleNodes = nodes.slice(seen[cur]);
    var rawEdges = cycleNodes.map(function (node) { return predEdge[node]; }).filter(Boolean);
    return multiplyCycle(orderCycleEdges(rawEdges));
  }

  function bellmanFord(market) {
    var n = CURRENCIES.length;
    var dist = new Array(n).fill(0);
    var pred = new Array(n).fill(-1);
    var predEdge = new Array(n).fill(null);
    var passes = [];
    var lastUpdated = -1;
    var eps = 1e-12;
    for (var pass = 0; pass < n; pass += 1) {
      var updates = 0;
      var witness = null;
      lastUpdated = -1;
      market.edges.forEach(function (edge) {
        var candidate = dist[edge.from] + edge.weight;
        if (candidate < dist[edge.to] - eps) {
          dist[edge.to] = candidate;
          pred[edge.to] = edge.from;
          predEdge[edge.to] = edge;
          lastUpdated = edge.to;
          updates += 1;
          witness = edge;
        }
      });
      passes.push({
        minDistance: Math.min.apply(null, dist),
        pass: pass + 1,
        updates: updates,
        witness: witness
      });
    }
    var cycle = lastUpdated >= 0 ? extractCycle(lastUpdated, pred, predEdge, n) : null;
    if (cycle && cycle.sumWeight >= -1e-9) cycle = null;
    return {
      cycle: cycle,
      distances: dist,
      hasNegativeCycle: Boolean(cycle),
      passes: passes,
      pred: pred
    };
  }

  function evaluate(rawParams) {
    var market = buildMarket(rawParams);
    var cycles = enumerateCycles(market);
    var best = cycles[0];
    var bf = bellmanFord(market);
    var chosen = best || bf.cycle || null;
    var namedCycle = namedScenarioCycle(market);
    var status = chosen && chosen.marginBps > 1e-6 ? "arbitrage" : "clean";
    var product = chosen ? chosen.product : 1;
    var proceeds = market.params.size * product;
    var sweep = frontier(market.params);
    return {
      bellmanFord: bf,
      bestCycle: chosen,
      cycles: cycles,
      frontier: sweep,
      market: market,
      namedBreakEvenGapBps: namedCycle.costBps,
      namedCycle: namedCycle,
      params: market.params,
      proceeds: proceeds,
      profit: proceeds - market.params.size,
      scenario: market.scenario,
      status: status
    };
  }

  function frontier(params) {
    var out = [];
    var maxGap = Math.max(60, params.gapBps + 36);
    for (var gap = 0; gap <= maxGap; gap += 4) {
      var market = buildMarket({
        costBps: params.costBps,
        gapBps: gap,
        impactBps: params.impactBps,
        scenario: params.scenario,
        seed: params.seed,
        size: params.size
      });
      var best = enumerateCycles(market)[0];
      out.push({
        gapBps: gap,
        marginBps: best ? best.marginBps : 0
      });
    }
    return out;
  }

  function drawText(ctx, text, x, y, color, size, maxWidth, weight, align) {
    ctx.save();
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    if (!maxWidth) {
      ctx.fillText(text, x, y);
      ctx.restore();
      return y + size + 4;
    }
    var words = String(text).split(/\s+/);
    var line = "";
    var yy = y;
    var lineHeight = (size || 12) * 1.32;
    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        yy += lineHeight;
        line = word;
      } else {
        line = test;
      }
    });
    if (line) ctx.fillText(line, x, yy);
    ctx.restore();
    return yy + lineHeight;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.stroke();
    drawText(ctx, title, rect.x + 14, rect.y + 12, COLORS.ink, 13, rect.w - 28, 720);
    if (subtitle) drawText(ctx, subtitle, rect.x + 14, rect.y + 31, COLORS.muted, 11, rect.w - 28, 520);
    ctx.restore();
  }

  function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
    var span = Math.max(1e-9, domainMax - domainMin);
    return function (value) {
      return rangeMin + (value - domainMin) / span * (rangeMax - rangeMin);
    };
  }

  function nodeLayout(rect) {
    var cx = rect.x + rect.w * 0.5;
    var cy = rect.y + rect.h * 0.56;
    var r = Math.min(rect.w, rect.h) * 0.31;
    var out = {};
    CURRENCIES.forEach(function (name, i) {
      var angle = -Math.PI / 2 + i * Math.PI * 2 / CURRENCIES.length;
      out[i] = {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r
      };
    });
    return out;
  }

  function drawArrow(ctx, a, b, color, width, alpha) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    var ux = dx / len;
    var uy = dy / len;
    var start = { x: a.x + ux * 25, y: a.y + uy * 25 };
    var end = { x: b.x - ux * 26, y: b.y - uy * 26 };
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 1.5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    var angle = Math.atan2(end.y - start.y, end.x - start.x);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - 9 * Math.cos(angle - 0.42), end.y - 9 * Math.sin(angle - 0.42));
    ctx.lineTo(end.x - 9 * Math.cos(angle + 0.42), end.y - 9 * Math.sin(angle + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGraph(ctx, rect, state) {
    var statusColor = state.status === "arbitrage" ? COLORS.arb : COLORS.clean;
    panel(ctx, rect, "currency graph", "edge weights are -log(executable rate); red means the best cycle sums below zero");
    var positions = nodeLayout(rect);
    var cycleEdges = state.bestCycle ? state.bestCycle.edges : [];
    var cycleKeys = {};
    cycleEdges.forEach(function (edge) { cycleKeys[edge.key] = true; });
    ctx.save();
    state.market.edges.forEach(function (edge) {
      if (cycleKeys[edge.key]) return;
      if ((edge.from + edge.to) % 5 === 0) drawArrow(ctx, positions[edge.from], positions[edge.to], COLORS.axis, 0.9, 0.35);
    });
    cycleEdges.forEach(function (edge) {
      drawArrow(ctx, positions[edge.from], positions[edge.to], statusColor, 3.4, 0.95);
    });
    CURRENCIES.forEach(function (name, i) {
      var p = positions[i];
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.axis;
      ctx.lineWidth = 1.3;
      roundRect(ctx, p.x - 25, p.y - 17, 50, 34, 8);
      ctx.fill();
      ctx.stroke();
      drawText(ctx, name, p.x, p.y - 7, COLORS.ink, 12, null, 720, "center");
    });
    var y = rect.y + rect.h - 52;
    drawText(ctx, cycleName(state.bestCycle), rect.x + 14, y, statusColor, 12, rect.w - 28, 720);
    drawText(ctx, "cycle product " + fmt(state.bestCycle.product, 6) + "  |  margin " + fmt(state.bestCycle.marginBps, 2) + " bps", rect.x + 14, y + 20, COLORS.muted, 11, rect.w - 28, 520);
    ctx.restore();
  }

  function drawLedger(ctx, rect, state) {
    panel(ctx, rect, "round-trip ledger", "multiply rates, or add log weights; both ledgers tell the same story");
    var x = rect.x + 14;
    var y = rect.y + 58;
    var edges = state.bestCycle.edges;
    ctx.save();
    drawText(ctx, "leg", x, y, COLORS.muted, 10, 66, 680);
    drawText(ctx, "rate", x + 72, y, COLORS.muted, 10, 84, 680);
    drawText(ctx, "-log r", x + 162, y, COLORS.muted, 10, 74, 680);
    drawText(ctx, "shock/cost", x + 244, y, COLORS.muted, 10, rect.w - 258, 680);
    y += 21;
    var product = 1;
    var sum = 0;
    edges.forEach(function (edge, index) {
      var yy = y + index * 25;
      ctx.fillStyle = index % 2 ? COLORS.white : COLORS.fill;
      ctx.fillRect(rect.x + 10, yy - 4, rect.w - 20, 22);
      product *= edge.rate;
      sum += edge.weight;
      drawText(ctx, CURRENCIES[edge.from] + "->" + CURRENCIES[edge.to], x, yy, COLORS.ink, 10, 66, 650);
      drawText(ctx, fmt(edge.rate, edge.rate > 10 ? 3 : 5), x + 72, yy, COLORS.ink, 10, 84, 560);
      drawText(ctx, fmt(edge.weight, 4), x + 162, yy, edge.weight < 0 ? COLORS.blue : COLORS.ink, 10, 74, 560);
      drawText(ctx, "+" + fmt(edge.shockBps, 1) + " / -" + fmt(edge.costBps, 1) + " bps", x + 244, yy, edge.shockBps > edge.costBps ? COLORS.arb : COLORS.muted, 10, rect.w - 258, 560);
    });
    var bottom = rect.y + rect.h - 48;
    drawText(ctx, "product = " + fmt(product, 6), x, bottom, state.status === "arbitrage" ? COLORS.arb : COLORS.clean, 12, rect.w - 28, 740);
    drawText(ctx, "sum weights = " + fmt(sum, 6), x, bottom + 20, state.status === "arbitrage" ? COLORS.arb : COLORS.clean, 12, rect.w - 28, 740);
    ctx.restore();
  }

  function drawRelaxation(ctx, rect, state) {
    panel(ctx, rect, "Bellman-Ford relaxation", "an update on the last pass is a negative-cycle witness");
    var gx = rect.x + 38;
    var gy = rect.y + 60;
    var gw = rect.w - 60;
    var gh = rect.h - 98;
    var passes = state.bellmanFord.passes;
    var maxUpdates = Math.max.apply(null, passes.map(function (p) { return p.updates; }).concat([1]));
    var minDistance = Math.min.apply(null, passes.map(function (p) { return p.minDistance; }).concat([0]));
    var yUpdates = scaleLinear(0, maxUpdates, gy + gh, gy);
    var yDist = scaleLinear(minDistance, 0, gy + gh, gy);
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var yy = gy + gh * i / 4;
      ctx.beginPath();
      ctx.moveTo(gx, yy);
      ctx.lineTo(gx + gw, yy);
      ctx.stroke();
    }
    var barW = gw / passes.length * 0.55;
    passes.forEach(function (pass, index) {
      var cx = gx + gw * (index + 0.5) / passes.length;
      var h = gy + gh - yUpdates(pass.updates);
      var last = index === passes.length - 1;
      ctx.fillStyle = last && state.bellmanFord.hasNegativeCycle ? COLORS.arb : COLORS.blue;
      ctx.fillRect(cx - barW / 2, yUpdates(pass.updates), barW, Math.max(2, h));
      drawText(ctx, String(pass.pass), cx, gy + gh + 10, COLORS.muted, 10, null, 560, "center");
    });
    ctx.strokeStyle = COLORS.purple;
    ctx.lineWidth = 2;
    ctx.beginPath();
    passes.forEach(function (pass, index) {
      var px = gx + gw * (index + 0.5) / passes.length;
      var py = yDist(pass.minDistance);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    drawText(ctx, "updates", gx, rect.y + rect.h - 24, COLORS.blue, 10);
    drawText(ctx, "min distance", gx + 68, rect.y + rect.h - 24, COLORS.purple, 10);
    ctx.restore();
  }

  function drawFrontier(ctx, rect, state) {
    panel(ctx, rect, "gap/cost threshold", "sweep only the quote gap; above zero is executable arbitrage in this toy sheet");
    var gx = rect.x + 42;
    var gy = rect.y + 60;
    var gw = rect.w - 70;
    var gh = rect.h - 94;
    var minY = Math.min.apply(null, state.frontier.map(function (p) { return p.marginBps; }).concat([-1]));
    var maxY = Math.max.apply(null, state.frontier.map(function (p) { return p.marginBps; }).concat([1]));
    minY = Math.min(minY, -8);
    maxY = Math.max(maxY, 8);
    var x = scaleLinear(0, Math.max.apply(null, state.frontier.map(function (p) { return p.gapBps; }).concat([1])), gx, gx + gw);
    var y = scaleLinear(minY, maxY, gy + gh, gy);
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var yy = gy + gh * i / 4;
      ctx.beginPath();
      ctx.moveTo(gx, yy);
      ctx.lineTo(gx + gw, yy);
      ctx.stroke();
    }
    var zeroY = y(0);
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(gx, zeroY);
    ctx.lineTo(gx + gw, zeroY);
    ctx.stroke();
    ctx.strokeStyle = COLORS.clean;
    ctx.lineWidth = 2;
    ctx.beginPath();
    state.frontier.forEach(function (point, index) {
      var px = x(point.gapBps);
      var py = y(point.marginBps);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    state.frontier.forEach(function (point) {
      if (Math.abs(point.gapBps - state.params.gapBps) > 2.1) return;
      ctx.fillStyle = state.status === "arbitrage" ? COLORS.arb : COLORS.clean;
      ctx.beginPath();
      ctx.arc(x(point.gapBps), y(point.marginBps), 4.6, 0, Math.PI * 2);
      ctx.fill();
    });
    drawText(ctx, "quote gap bps", gx + gw - 78, gy + gh + 14, COLORS.muted, 10);
    drawText(ctx, "margin bps", gx - 12, gy - 18, COLORS.muted, 10);
    ctx.restore();
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(320, rect.width || canvas.width || 960);
    var cssH = cssW >= 760 ? Math.max(660, cssW * 0.72) : (cssW < 460 ? 980 : 900);
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * dpr)) canvas.width = Math.round(cssW * dpr);
    if (canvas.height !== Math.round(cssH * dpr)) canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return { ctx: ctx, h: cssH, w: cssW };
  }

  function draw(root, state) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas || !state.bestCycle) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var w = setup.w;
    var h = setup.h;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    var pad = 18;
    if (w >= 760) {
      var topH = h * 0.54;
      var half = (w - pad * 3) / 2;
      drawGraph(ctx, { x: pad, y: pad, w: half, h: topH - pad }, state);
      drawLedger(ctx, { x: pad * 2 + half, y: pad, w: half, h: topH - pad }, state);
      drawRelaxation(ctx, { x: pad, y: topH + 8, w: half, h: h - topH - pad - 8 }, state);
      drawFrontier(ctx, { x: pad * 2 + half, y: topH + 8, w: half, h: h - topH - pad - 8 }, state);
    } else {
      var sectionH = (h - pad * 5) / 4;
      drawGraph(ctx, { x: pad, y: pad, w: w - pad * 2, h: sectionH }, state);
      drawLedger(ctx, { x: pad, y: pad * 2 + sectionH, w: w - pad * 2, h: sectionH }, state);
      drawRelaxation(ctx, { x: pad, y: pad * 3 + sectionH * 2, w: w - pad * 2, h: sectionH }, state);
      drawFrontier(ctx, { x: pad, y: pad * 4 + sectionH * 3, w: w - pad * 2, h: sectionH }, state);
    }
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function setValue(root, name, value) {
    root.querySelectorAll('[data-value="' + name + '"]').forEach(function (node) {
      node.textContent = value;
    });
  }

  function updateControls(root, state) {
    setValue(root, "scenario", state.scenario.label);
    setValue(root, "gapBps", state.params.gapBps + " bps");
    setValue(root, "costBps", state.params.costBps + " bps");
    setValue(root, "impactBps", state.params.impactBps + " bps");
    setValue(root, "size", fmtMoney(state.params.size));
    setValue(root, "seed", String(state.params.seed));
  }

  function render(root) {
    var state = evaluate(readParams(root));
    updateControls(root, state);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics && state.bestCycle) {
      var tone = state.status === "arbitrage" ? "bad" : "good";
      metrics.innerHTML = [
        metric("sheet", state.scenario.label),
        metric("status", state.status, tone),
        metric("best cycle", cycleName(state.bestCycle)),
        metric("margin", fmt(state.bestCycle.marginBps, 2) + " bps", tone),
        metric("product", fmt(state.bestCycle.product, 6), tone),
        metric("profit", fmtMoney(state.profit), state.profit > 0 ? "bad" : "good"),
        metric("gap threshold", state.params.scenario === "clean" ? "n/a" : fmt(state.namedBreakEvenGapBps, 1) + " bps", state.params.gapBps > state.namedBreakEvenGapBps ? "bad" : "good"),
        metric("BF witness", state.bellmanFord.hasNegativeCycle ? "yes" : "no", state.bellmanFord.hasNegativeCycle ? "bad" : "good"),
        metric("passes", String(state.bellmanFord.passes.length))
      ].join("");
    }
    draw(root, state);
    root.__fxNegativeCycleState = state;
  }

  function init(root) {
    if (!root || root.__fxNegativeCycleReady) return;
    root.__fxNegativeCycleReady = true;
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

  function near(a, b, tolerance) {
    return Math.abs(a - b) <= tolerance;
  }

  function finite(value) {
    return Number.isFinite(value);
  }

  function cycleClosed(cycle) {
    if (!cycle || !cycle.edges || !cycle.edges.length) return false;
    for (var i = 0; i < cycle.edges.length; i += 1) {
      var edge = cycle.edges[i];
      var next = cycle.edges[(i + 1) % cycle.edges.length];
      if (edge.to !== next.from) return false;
    }
    return cycle.edges[cycle.edges.length - 1].to === cycle.edges[0].from;
  }

  function audit() {
    var checked = 0;
    var maxLedgerError = 0;
    var maxZeroCostMargin = 0;
    function check(condition, message) {
      checked += 1;
      assert(condition, message);
    }
    function checkMarket(market, label) {
      check(market.edges.length === CURRENCIES.length * (CURRENCIES.length - 1), label + " should build a complete directed quote graph");
      market.edges.forEach(function (edge) {
        check(edge.from !== edge.to, label + " should not include self edges");
        check(edge.rate > 0 && finite(edge.rate), label + " executable rates should be positive and finite");
        check(finite(edge.weight) && near(edge.weight, -Math.log(edge.rate), 1e-12), label + " edge weight should equal -log(rate)");
        check(market.byPair[edge.from + "|" + edge.to] === edge, label + " pair lookup should point to the edge");
      });
    }
    function checkState(state, label) {
      checkMarket(state.market, label);
      var expectedNodes = scenarioNodes(state.scenario);
      check(state.bestCycle && state.bestCycle.edges.length >= 2, label + " should expose a best cycle");
      check(cycleClosed(state.bestCycle), label + " best cycle should be closed and ordered");
      check(state.bestCycle.edges.length <= CURRENCIES.length, label + " best cycle should be simple");
      check(state.namedCycle && state.namedCycle.edges.length === expectedNodes.length, label + " named scenario cycle should use every scenario edge once");
      check(cycleClosed(state.namedCycle), label + " named scenario cycle should be closed and ordered");
      check(near(state.namedCycle.product, Math.exp((state.namedCycle.shockBps - state.namedCycle.costBps) / 10000), 1e-12), label + " named cycle product should match analytic gap-cost formula");
      check(near(state.namedCycle.sumWeight, (state.namedCycle.costBps - state.namedCycle.shockBps) / 10000, 1e-12), label + " named cycle weight should match analytic cost-gap formula");
      check(near(state.namedBreakEvenGapBps, state.namedCycle.costBps, 1e-12), label + " named break-even gap should equal executable costs");
      if (state.params.scenario === "clean") {
        check(near(state.namedCycle.shockBps, 0, 1e-12), label + " clean sheet should not inject quote-gap shock");
      } else {
        check(near(state.namedCycle.shockBps, state.params.gapBps, 1e-12), label + " named cycle shock should sum to the quote-gap knob");
      }
      var product = 1;
      var sumWeight = 0;
      state.bestCycle.edges.forEach(function (edge) {
        product *= edge.rate;
        sumWeight += edge.weight;
      });
      var ledgerError = Math.max(
        Math.abs(product - state.bestCycle.product),
        Math.abs(sumWeight - state.bestCycle.sumWeight),
        Math.abs(state.bestCycle.product - Math.exp(-state.bestCycle.sumWeight))
      );
      maxLedgerError = Math.max(maxLedgerError, ledgerError);
      check(ledgerError < 1e-9, label + " product and negative-log ledgers should agree");
      check(near(state.bestCycle.marginBps, (state.bestCycle.product - 1) * 10000, 1e-9), label + " margin should be product minus one in basis points");
      check(near(state.proceeds, state.params.size * state.bestCycle.product, 1e-8), label + " proceeds should use selected cycle product");
      check(near(state.profit, state.proceeds - state.params.size, 1e-8), label + " profit ledger should reconcile proceeds and start size");
      check(state.cycles.every(function (cycle, index) {
        return index === 0 || cycle.marginBps <= state.cycles[index - 1].marginBps + 1e-12;
      }), label + " brute-force cycles should be sorted by margin");
      var bruteHasArb = state.bestCycle.marginBps > 1e-7;
      check(state.status === (bruteHasArb ? "arbitrage" : "clean"), label + " status should follow best cycle margin");
      check(state.bellmanFord.passes.length === CURRENCIES.length, label + " Bellman-Ford should run V passes");
      var lastPass = state.bellmanFord.passes[state.bellmanFord.passes.length - 1];
      check(state.bellmanFord.hasNegativeCycle === bruteHasArb, label + " Bellman-Ford should agree with brute-force cycle enumeration");
      check((lastPass.updates > 0) === state.bellmanFord.hasNegativeCycle, label + " last pass updates should be the negative-cycle signal");
      if (state.bellmanFord.cycle) {
        check(cycleClosed(state.bellmanFord.cycle), label + " extracted Bellman-Ford cycle should be closed");
        check(state.bellmanFord.cycle.sumWeight < -1e-9, label + " extracted cycle should be negative");
        check(state.bellmanFord.cycle.product > 1, label + " extracted cycle should multiply above one");
        check(Math.abs(state.bellmanFord.cycle.product - Math.exp(-state.bellmanFord.cycle.sumWeight)) < 1e-9, label + " extracted cycle should satisfy log/product identity");
      }
      check(state.frontier.length > 0, label + " frontier should have points");
      state.frontier.forEach(function (point, index) {
        check(finite(point.marginBps), label + " frontier margins should be finite");
        if (index > 0) {
          check(point.gapBps > state.frontier[index - 1].gapBps, label + " frontier gaps should increase");
          check(point.marginBps >= state.frontier[index - 1].marginBps - 1e-9, label + " larger quote gaps should not reduce best margin");
        }
      });
    }
    var summary = {};
    Object.keys(SCENARIOS).forEach(function (scenario) {
      var cases = 0;
      var detected = 0;
      var previousMargins = null;
      [11, 37, 503].forEach(function (seed) {
        [0, 18, 42, 72].forEach(function (gapBps) {
          var margins = [];
          [0, 5, 12].forEach(function (costBps) {
            var state = evaluate({
              costBps: costBps,
              gapBps: gapBps,
              impactBps: 2,
              scenario: scenario,
              seed: seed,
              size: 10000
            });
            checkState(state, scenario);
            if (scenario === "clean") {
              check(!state.bellmanFord.hasNegativeCycle, "clean sheet should not contain arbitrage");
            }
            margins.push(state.bestCycle.marginBps);
            if (state.bestCycle.marginBps > 1e-7) detected += 1;
            cases += 1;
          });
          for (var i = 1; i < margins.length; i += 1) {
            check(margins[i] <= margins[i - 1] + 1e-9, scenario + " higher costs should not improve the best cycle");
          }
        });
        var curve = frontier(cleanParams({ scenario: scenario, seed: seed, gapBps: 42, costBps: 6, impactBps: 2, size: 10000 }));
        previousMargins = null;
        curve.forEach(function (point) {
          check(finite(point.marginBps), scenario + " frontier margin should be finite");
          if (previousMargins != null) check(point.marginBps >= previousMargins - 1e-9, scenario + " larger quote gaps should not reduce best margin");
          previousMargins = point.marginBps;
        });
      });
      summary[scenario] = { cases: cases, detected: detected };
    });
    Object.keys(SCENARIOS).forEach(function (scenario) {
      var zero = evaluate({ costBps: 0, gapBps: 0, impactBps: 0, scenario: scenario, seed: 37, size: 10000 });
      maxZeroCostMargin = Math.max(maxZeroCostMargin, Math.abs(zero.bestCycle.marginBps));
      check(Math.abs(zero.bestCycle.marginBps) < 1e-8, scenario + " zero-cost zero-gap sheet should have zero best margin");
      check(!zero.bellmanFord.hasNegativeCycle, scenario + " zero-cost zero-gap sheet should not contain strict arbitrage");
    });
    var defaults = evaluate(DEFAULTS);
    check(defaults.status === "arbitrage", "default state should remain an arbitrage example");
    check(cycleName(defaults.bestCycle) === "USD -> EUR -> JPY -> USD", "default best cycle should match the article");
    check(near(defaults.bestCycle.marginBps, 16.65369745969869, 1e-9), "default margin should match the article");
    check(near(defaults.profit, 16.65369745969838, 1e-8), "default modeled profit should match the article");
    var sanitized = cleanParams({ costBps: -3, gapBps: 999, impactBps: -8, scenario: "ghost", seed: NaN, size: 12345 });
    check(sanitized.costBps === 0, "sanitizer should clamp cost");
    check(sanitized.gapBps === 120, "sanitizer should clamp gap");
    check(sanitized.impactBps === 0, "sanitizer should clamp impact");
    check(sanitized.scenario === DEFAULTS.scenario, "sanitizer should fall back to default scenario");
    check(sanitized.size === 12000, "sanitizer should snap size");
    return {
      checked: checked,
      maxLedgerError: maxLedgerError,
      maxZeroCostMargin: maxZeroCostMargin,
      ok: true,
      summary: summary
    };
  }

  var api = {
    CURRENCIES: CURRENCIES,
    DEFAULTS: DEFAULTS,
    SCENARIOS: SCENARIOS,
    audit: audit,
    bellmanFord: bellmanFord,
    buildMarket: buildMarket,
    cleanParams: cleanParams,
    enumerateCycles: enumerateCycles,
    evaluate: evaluate,
    frontier: frontier
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.FxNegativeCycleLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-fx-negative-cycle-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
