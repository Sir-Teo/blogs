(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    modulo: "#be123c",
    ring: "#2563eb",
    rendezvous: "#0f766e",
    newNode: "#7c3aed",
    gray: "#64748b",
    warn: "#b45309"
  };

  var DEFAULTS = {
    nodes: 12,
    keys: 9000,
    replicas: 64,
    hotness: 38,
    seed: 27
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      hotness: clamp(Number(raw.hotness == null ? DEFAULTS.hotness : raw.hotness), 0, 90),
      keys: clamp(Math.round(raw.keys == null ? DEFAULTS.keys : raw.keys), 1000, 30000),
      nodes: clamp(Math.round(raw.nodes == null ? DEFAULTS.nodes : raw.nodes), 3, 40),
      replicas: clamp(Math.round(raw.replicas == null ? DEFAULTS.replicas : raw.replicas), 1, 256),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 999)
    };
  }

  function hash32(a, b) {
    var x = (Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0xc2b2ae35, 0x27d4eb2f)) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function uniform(a, b) {
    return (hash32(a, b) + 0.5) / 4294967297;
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 1 : digits;
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="hash-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function makeKeys(params) {
    var keys = [];
    var hotness = params.hotness / 100;
    var alpha = 0.35 + 1.3 * hotness;
    var total = 0;
    for (var i = 0; i < params.keys; i += 1) {
      var keyHash = hash32(i + 1, params.seed * 1009);
      var weight = Math.pow(i + 1, -alpha);
      weight *= 0.75 + 0.5 * uniform(i * 17 + 3, params.seed);
      keys.push({ hash: keyHash, id: i, weight: weight });
      total += weight;
    }
    keys.forEach(function (key) { key.weight /= total; });
    return keys;
  }

  function moduloAssign(key, nodes) {
    return key.hash % nodes;
  }

  function buildRing(nodes, replicas, seed) {
    var ring = [];
    for (var node = 0; node < nodes; node += 1) {
      for (var replica = 0; replica < replicas; replica += 1) {
        ring.push({
          point: hash32(node * 1000003 + replica, seed * 9176 + 11),
          node: node
        });
      }
    }
    ring.sort(function (a, b) {
      if (a.point !== b.point) return a.point - b.point;
      return a.node - b.node;
    });
    return ring;
  }

  function ringAssign(key, ring) {
    var lo = 0;
    var hi = ring.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (ring[mid].point < key.hash) lo = mid + 1;
      else hi = mid;
    }
    return ring[lo % ring.length].node;
  }

  function rendezvousAssign(key, nodes, seed) {
    var bestNode = 0;
    var bestScore = -1;
    for (var node = 0; node < nodes; node += 1) {
      var score = hash32(key.id * 1000003 + seed, node * 9176 + 0x51f15e);
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }
    return bestNode;
  }

  function assignAll(keys, params, nodes) {
    var ring = buildRing(nodes, params.replicas, params.seed);
    var assignments = {
      modulo: [],
      rendezvous: [],
      ring: []
    };
    keys.forEach(function (key) {
      assignments.modulo.push(moduloAssign(key, nodes));
      assignments.ring.push(ringAssign(key, ring));
      assignments.rendezvous.push(rendezvousAssign(key, nodes, params.seed));
    });
    return { assignments: assignments, ring: ring };
  }

  function loadStats(keys, assignments, nodes) {
    var counts = new Array(nodes).fill(0);
    var weights = new Array(nodes).fill(0);
    var i;
    for (i = 0; i < keys.length; i += 1) {
      counts[assignments[i]] += 1;
      weights[assignments[i]] += keys[i].weight;
    }
    var mean = keys.length / nodes;
    var meanWeight = 1 / nodes;
    var maxCount = Math.max.apply(null, counts);
    var minCount = Math.min.apply(null, counts);
    var maxWeight = Math.max.apply(null, weights);
    var minWeight = Math.min.apply(null, weights);
    var countVariance = 0;
    var weightVariance = 0;
    for (i = 0; i < nodes; i += 1) {
      countVariance += Math.pow(counts[i] - mean, 2);
      weightVariance += Math.pow(weights[i] - meanWeight, 2);
    }
    return {
      counts: counts,
      countCv: Math.sqrt(countVariance / nodes) / Math.max(1e-12, mean),
      maxCount: maxCount,
      maxWeight: maxWeight,
      minCount: minCount,
      minWeight: minWeight,
      weights: weights,
      weightCv: Math.sqrt(weightVariance / nodes) / Math.max(1e-12, meanWeight)
    };
  }

  function movement(keys, before, after, newNode) {
    var moved = 0;
    var movedWeight = 0;
    var toNew = 0;
    var toNewWeight = 0;
    for (var i = 0; i < keys.length; i += 1) {
      if (before[i] !== after[i]) {
        moved += 1;
        movedWeight += keys[i].weight;
        if (after[i] === newNode) {
          toNew += 1;
          toNewWeight += keys[i].weight;
        }
      }
    }
    return {
      moved: moved,
      movedShare: moved / keys.length,
      movedWeight: movedWeight,
      toNew: toNew,
      toNewShare: toNew / keys.length,
      toNewWeight: toNewWeight
    };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var keys = makeKeys(params);
    var before = assignAll(keys, params, params.nodes);
    var after = assignAll(keys, params, params.nodes + 1);
    var methods = ["modulo", "ring", "rendezvous"];
    var rows = {};
    methods.forEach(function (method) {
      rows[method] = {
        afterLoad: loadStats(keys, after.assignments[method], params.nodes + 1),
        beforeLoad: loadStats(keys, before.assignments[method], params.nodes),
        movement: movement(keys, before.assignments[method], after.assignments[method], params.nodes)
      };
    });
    return {
      after: after,
      before: before,
      keys: keys,
      params: params,
      rows: rows
    };
  }

  function readState(container, previous) {
    var raw = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var display = {
      hotness: Math.round(params.hotness) + "%",
      keys: formatNumber(params.keys, 0),
      nodes: String(params.nodes),
      replicas: String(params.replicas),
      seed: String(params.seed)
    };
    Object.keys(display).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = display[key];
      });
    });
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 680 ? 780 : 560;
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
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
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
    drawText(ctx, title, x + 14, y + 24, 13, COLORS.text, 750);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 42, 11, COLORS.muted, 550);
  }

  function methodColor(method) {
    return method === "modulo" ? COLORS.modulo : method === "ring" ? COLORS.ring : COLORS.rendezvous;
  }

  function methodLabel(method) {
    return method === "modulo" ? "modulo" : method === "ring" ? "hash ring" : "rendezvous";
  }

  function drawMovement(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "movement after adding one node", "stable hashing moves only keys claimed by the new node");
    var methods = ["modulo", "ring", "rendezvous"];
    var left = x + 112;
    var right = x + w - 24;
    var top = y + 72;
    var rowH = Math.max(38, (h - 104) / methods.length);
    var maxShare = Math.max.apply(null, methods.map(function (m) { return result.rows[m].movement.movedShare; }).concat([0.01]));
    methods.forEach(function (method, i) {
      var row = result.rows[method].movement;
      var yy = top + i * rowH;
      drawText(ctx, methodLabel(method), x + 16, yy + 14, 11, COLORS.text, 750);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy, right - left, 13);
      ctx.fillStyle = methodColor(method);
      ctx.fillRect(left, yy, (right - left) * row.movedShare / maxShare, 13);
      drawText(ctx, formatPercent(row.movedShare, 1), right, yy + 13, 10, methodColor(method), 750, "right");
      drawText(ctx, "to new node " + formatPercent(row.toNewShare, 1), right, yy + 31, 10, COLORS.muted, 600, "right");
    });
  }

  function drawLoads(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "load after resize", "count balance over " + (result.params.nodes + 1) + " nodes");
    var methods = ["modulo", "ring", "rendezvous"];
    var left = x + 88;
    var right = x + w - 24;
    var top = y + 68;
    var rowH = Math.max(38, (h - 100) / methods.length);
    var maxCv = Math.max.apply(null, methods.map(function (m) { return result.rows[m].afterLoad.countCv; }).concat([0.01]));
    methods.forEach(function (method, i) {
      var load = result.rows[method].afterLoad;
      var yy = top + i * rowH;
      drawText(ctx, methodLabel(method), x + 16, yy + 14, 11, COLORS.text, 750);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy, right - left, 13);
      ctx.fillStyle = methodColor(method);
      ctx.fillRect(left, yy, (right - left) * load.countCv / maxCv, 13);
      drawText(ctx, "CV " + formatNumber(load.countCv, 3), right, yy + 13, 10, methodColor(method), 750, "right");
      drawText(ctx, "max/mean " + formatNumber(load.maxCount / (result.params.keys / (result.params.nodes + 1)), 2) + "x", right, yy + 31, 10, COLORS.muted, 600, "right");
    });
  }

  function drawRing(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "hash ring sketch", "virtual nodes carve the key space into arcs");
    var cx = x + w / 2;
    var cy = y + h / 2 + 18;
    var radius = Math.min(w, h) * 0.29;
    var ring = result.before.ring;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();
    for (var i = 0; i < ring.length; i += Math.max(1, Math.floor(ring.length / 180))) {
      var a = 2 * Math.PI * ring[i].point / 4294967296 - Math.PI / 2;
      var len = ring[i].node === 0 ? 9 : 5;
      ctx.strokeStyle = ring[i].node === 0 ? COLORS.newNode : COLORS.ring;
      ctx.globalAlpha = ring[i].node === 0 ? 0.8 : 0.34;
      ctx.beginPath();
      ctx.moveTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      ctx.lineTo(cx + (radius + len) * Math.cos(a), cy + (radius + len) * Math.sin(a));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawText(ctx, result.params.nodes + " nodes x " + result.params.replicas + " virtual points", cx, y + h - 20, 11, COLORS.muted, 650, "center");
  }

  function drawMovementCurve(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "expected movement curve", "adding one node as the fleet grows");
    var left = x + 42;
    var right = x + w - 18;
    var top = y + 62;
    var bottom = y + h - 38;
    var points = [];
    for (var n = 3; n <= 40; n += 1) points.push({ n: n, minimal: 1 / (n + 1), modulo: 1 - 1 / (n + 1) });
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right, top);
    ctx.stroke();

    function px(point) {
      return left + (right - left) * (point.n - 3) / 37;
    }

    function py(value) {
      return bottom - (bottom - top) * value;
    }

    function line(color, key) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach(function (point, index) {
        var xx = px(point);
        var yy = py(point[key]);
        if (index === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    }
    line(COLORS.modulo, "modulo");
    line(COLORS.rendezvous, "minimal");
    var currentX = left + (right - left) * (result.params.nodes - 3) / 37;
    ctx.strokeStyle = COLORS.gray;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(currentX, top);
    ctx.lineTo(currentX, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "modulo churn", left + 6, top + 12, 10, COLORS.modulo, 750);
    drawText(ctx, "minimal movement", right, bottom - 18, 10, COLORS.rendezvous, 750, "right");
    drawText(ctx, "nodes", (left + right) / 2, y + h - 10, 10, COLORS.muted, 650, "center");
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 14;
    var gap = 14;

    if (width < 680) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawMovement(ctx, result, pad, pad, width - pad * 2, panelH);
      drawLoads(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawRing(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawMovementCurve(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }

    var halfW = (width - pad * 2 - gap) / 2;
    var halfH = (height - pad * 2 - gap) / 2;
    drawMovement(ctx, result, pad, pad, halfW, halfH);
    drawLoads(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawRing(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawMovementCurve(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function updateMetrics(metrics, result) {
    var modulo = result.rows.modulo.movement;
    var ring = result.rows.ring.movement;
    var rendezvous = result.rows.rendezvous.movement;
    var expected = 1 / (result.params.nodes + 1);
    metrics.innerHTML = [
      metric("modulo moved", formatPercent(modulo.movedShare, 1)),
      metric("ring moved", formatPercent(ring.movedShare, 1)),
      metric("rendezvous moved", formatPercent(rendezvous.movedShare, 1)),
      metric("minimal target", formatPercent(expected, 1)),
      metric("ring load CV", formatNumber(result.rows.ring.afterLoad.countCv, 3)),
      metric("HRW load CV", formatNumber(result.rows.rendezvous.afterLoad.countCv, 3)),
      metric("ring hot-load max", formatPercent(result.rows.ring.afterLoad.maxWeight, 1)),
      metric("HRW hot-load max", formatPercent(result.rows.rendezvous.afterLoad.maxWeight, 1))
    ].join("");
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
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
    var labs = document.querySelectorAll("[data-consistent-hashing-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    assignAll: assignAll,
    buildRing: buildRing,
    cleanParams: cleanParams,
    evaluate: evaluate,
    loadStats: loadStats,
    makeKeys: makeKeys,
    moduloAssign: moduloAssign,
    movement: movement,
    rendezvousAssign: rendezvousAssign,
    ringAssign: ringAssign
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ConsistentHashingLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
