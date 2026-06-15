(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    edge: "#94a3b8",
    closure: "#2563eb",
    delta: "#0f766e",
    naive: "#b45309",
    semi: "#7c3aed",
    good: "#0f766e",
    bad: "#be123c"
  };

  var SHAPES = [
    "chain + skips",
    "layered DAG",
    "hub cycles",
    "random graph"
  ];

  var DEFAULTS = {
    nodes: 34,
    shape: 0,
    extra: 14,
    seed: 11
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      nodes: clamp(Math.round(Number(raw.nodes == null ? DEFAULTS.nodes : raw.nodes)), 12, 64),
      shape: clamp(Math.round(Number(raw.shape == null ? DEFAULTS.shape : raw.shape)), 0, SHAPES.length - 1),
      extra: clamp(Math.round(Number(raw.extra == null ? DEFAULTS.extra : raw.extra)), 0, 36),
      seed: clamp(Math.round(Number(raw.seed == null ? DEFAULTS.seed : raw.seed)), 1, 9999)
    };
  }

  function hash32(x) {
    var h = (x ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function key(a, b) {
    return a + "," + b;
  }

  function pairFromKey(k) {
    var parts = k.split(",");
    return [Number(parts[0]), Number(parts[1])];
  }

  function addEdge(set, a, b, n) {
    if (a !== b && a >= 0 && a < n && b >= 0 && b < n) set.add(key(a, b));
  }

  function makeGraph(params) {
    var n = params.nodes;
    var edges = new Set();
    var random = rng(params.seed + params.shape * 999);
    if (params.shape === 0) {
      for (var i = 0; i < n - 1; i += 1) addEdge(edges, i, i + 1, n);
      for (var j = 0; j + 3 < n; j += 3) addEdge(edges, j, j + 3, n);
    } else if (params.shape === 1) {
      var levels = 5;
      for (var a = 0; a < n; a += 1) {
        for (var b = a + 1; b < n; b += 1) {
          var la = Math.floor(a * levels / n);
          var lb = Math.floor(b * levels / n);
          if (lb === la + 1 && hash32(a * 131 + b * 17 + params.seed) % 5 < 2) addEdge(edges, a, b, n);
        }
      }
    } else if (params.shape === 2) {
      var h1 = Math.floor(n / 3);
      var h2 = Math.floor(2 * n / 3);
      for (var c = 0; c < n; c += 1) {
        if (c !== h1 && c % 2 === 0) addEdge(edges, c, h1, n);
        if (c !== h2 && c % 2 === 1) addEdge(edges, h2, c, n);
      }
      addEdge(edges, h1, h2, n);
      addEdge(edges, h2, h1, n);
    } else {
      for (var r = 0; r < n; r += 1) addEdge(edges, r, (r + 1 + (hash32(r + params.seed) % Math.max(2, Math.floor(n / 4)))) % n, n);
    }
    var attempts = Math.max(1, Math.round(params.extra * n / 5));
    for (var e = 0; e < attempts; e += 1) {
      var u = Math.floor(random() * n);
      var v = Math.floor(random() * n);
      if (params.shape === 0 || params.shape === 1) {
        if (u > v) {
          var tmp = u;
          u = v;
          v = tmp;
        }
      }
      addEdge(edges, u, v, n);
    }
    return Array.from(edges).map(pairFromKey).sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
  }

  function adjacency(edges, n) {
    var out = [];
    var incoming = [];
    for (var i = 0; i < n; i += 1) {
      out.push([]);
      incoming.push([]);
    }
    edges.forEach(function (edge) {
      out[edge[0]].push(edge[1]);
      incoming[edge[1]].push(edge[0]);
    });
    return { out: out, incoming: incoming };
  }

  function closureByBfs(edges, n) {
    var adj = adjacency(edges, n).out;
    var result = new Set();
    for (var src = 0; src < n; src += 1) {
      var seen = [];
      var queue = [];
      for (var i = 0; i < n; i += 1) seen.push(false);
      adj[src].forEach(function (dst) {
        if (!seen[dst]) {
          seen[dst] = true;
          queue.push(dst);
        }
      });
      while (queue.length) {
        var u = queue.shift();
        result.add(key(src, u));
        adj[u].forEach(function (v) {
          if (!seen[v]) {
            seen[v] = true;
            queue.push(v);
          }
        });
      }
    }
    return result;
  }

  function evaluateNaive(edges, n) {
    var adj = adjacency(edges, n).out;
    var path = new Set(edges.map(function (edge) { return key(edge[0], edge[1]); }));
    var rounds = [{ round: 0, facts: path.size, delta: path.size, probes: 0, candidates: 0 }];
    var totalProbes = 0;
    var totalCandidates = 0;
    var maxRounds = n + 2;
    for (var round = 1; round <= maxRounds; round += 1) {
      var before = path.size;
      var candidates = 0;
      var probes = 0;
      Array.from(path).forEach(function (p) {
        var pair = pairFromKey(p);
        adj[pair[1]].forEach(function (z) {
          probes += 1;
          candidates += 1;
          path.add(key(pair[0], z));
        });
      });
      totalProbes += probes;
      totalCandidates += candidates;
      rounds.push({ round: round, facts: path.size, delta: path.size - before, probes: probes, candidates: candidates });
      if (path.size === before) break;
    }
    return {
      path: path,
      rounds: rounds,
      totalProbes: totalProbes,
      totalCandidates: totalCandidates,
      iterations: rounds.length - 1
    };
  }

  function evaluateSemiNaive(edges, n) {
    var adj = adjacency(edges, n).out;
    var path = new Set(edges.map(function (edge) { return key(edge[0], edge[1]); }));
    var delta = new Set(path);
    var rounds = [{ round: 0, facts: path.size, delta: delta.size, probes: 0, candidates: 0 }];
    var totalProbes = 0;
    var totalCandidates = 0;
    var maxRounds = n + 2;
    for (var round = 1; round <= maxRounds && delta.size; round += 1) {
      var next = new Set();
      var candidates = 0;
      var probes = 0;
      Array.from(delta).forEach(function (p) {
        var pair = pairFromKey(p);
        adj[pair[1]].forEach(function (z) {
          probes += 1;
          candidates += 1;
          var k = key(pair[0], z);
          if (!path.has(k)) next.add(k);
        });
      });
      next.forEach(function (k) { path.add(k); });
      totalProbes += probes;
      totalCandidates += candidates;
      rounds.push({ round: round, facts: path.size, delta: next.size, probes: probes, candidates: candidates });
      delta = next;
    }
    return {
      path: path,
      rounds: rounds,
      totalProbes: totalProbes,
      totalCandidates: totalCandidates,
      iterations: rounds.length - 1
    };
  }

  function setEquals(a, b) {
    if (a.size !== b.size) return false;
    var ok = true;
    a.forEach(function (x) {
      if (!b.has(x)) ok = false;
    });
    return ok;
  }

  function differenceCount(a, b) {
    var count = 0;
    a.forEach(function (x) {
      if (!b.has(x)) count += 1;
    });
    return count;
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var edges = makeGraph(params);
    var bfs = closureByBfs(edges, params.nodes);
    var naive = evaluateNaive(edges, params.nodes);
    var semi = evaluateSemiNaive(edges, params.nodes);
    var result = {
      params: params,
      shapeLabel: SHAPES[params.shape],
      edges: edges,
      bfs: bfs,
      naive: naive,
      semi: semi,
      savings: naive.totalProbes ? 1 - semi.totalProbes / naive.totalProbes : 0,
      duplicateWork: Math.max(0, naive.totalProbes - semi.totalProbes),
      density: bfs.size / (params.nodes * Math.max(1, params.nodes - 1))
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var sameNaive = setEquals(result.naive.path, result.bfs);
    var sameSemi = setEquals(result.semi.path, result.bfs);
    var noExtraNaive = differenceCount(result.naive.path, result.bfs) === 0;
    var noExtraSemi = differenceCount(result.semi.path, result.bfs) === 0;
    var deltaEnds = result.semi.rounds[result.semi.rounds.length - 1].delta === 0;
    var monotone = result.semi.rounds.every(function (row, i, arr) {
      return i === 0 || row.facts >= arr[i - 1].facts;
    });
    var workOk = result.semi.totalProbes <= result.naive.totalProbes;
    return {
      passed: sameNaive && sameSemi && noExtraNaive && noExtraSemi && deltaEnds && monotone && workOk,
      sameNaive: sameNaive,
      sameSemi: sameSemi,
      noExtraNaive: noExtraNaive,
      noExtraSemi: noExtraSemi,
      deltaEnds: deltaEnds,
      monotone: monotone,
      workOk: workOk
    };
  }

  function auditGrid() {
    var total = 0;
    var passed = 0;
    var failures = [];
    [16, 24, 36, 48].forEach(function (nodes) {
      [0, 1, 2, 3].forEach(function (shape) {
        [0, 12, 28].forEach(function (extra) {
          total += 1;
          var result = evaluate({ nodes: nodes, shape: shape, extra: extra, seed: 17 + nodes + shape * 13 + extra });
          if (result.audit.passed) passed += 1;
          else failures.push({ nodes: nodes, shape: shape, extra: extra, audit: result.audit });
        });
      });
    });
    var defaults = evaluate(DEFAULTS);
    return {
      total: total,
      passed: passed,
      failures: failures.slice(0, 5),
      defaultPassed: defaults.audit.passed,
      defaultFacts: defaults.bfs.size,
      defaultSavings: defaults.savings
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return Number(value).toLocaleString("en-US", {
      maximumFractionDigits: digits == null ? 2 : digits,
      minimumFractionDigits: digits == null ? 0 : digits
    });
  }

  function formatPercent(value, digits) {
    return formatNumber(100 * value, digits == null ? 1 : digits) + "%";
  }

  function metric(labelText, value) {
    return '<div class="datalog-lab__metric"><span>' + labelText + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 900);
    var height = width < 620 ? 980 : 760;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function label(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.muted;
    ctx.font = (opts.weight || "650") + " " + (opts.size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "middle";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, box.x + 14, box.y + 17, { color: COLORS.text, size: 13, weight: "780" });
    label(ctx, subtitle, box.x + 14, box.y + 36, { color: COLORS.muted, size: 11, weight: "600" });
  }

  function drawMatrix(ctx, box, result) {
    panel(ctx, box, "reachability closure", "blue cells are derived path(x,y) facts");
    var n = result.params.nodes;
    var plot = { x: box.x + 34, y: box.y + 58, w: box.w - 54, h: box.h - 92 };
    var cell = Math.min(plot.w / n, plot.h / n);
    var size = cell * n;
    var ox = plot.x + (plot.w - size) / 2;
    var oy = plot.y + (plot.h - size) / 2;
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(ox, oy, size, size);
    result.bfs.forEach(function (k) {
      var p = pairFromKey(k);
      ctx.fillStyle = "rgba(37, 99, 235, 0.55)";
      ctx.fillRect(ox + p[1] * cell, oy + p[0] * cell, Math.max(1, cell - 0.5), Math.max(1, cell - 0.5));
    });
    result.edges.forEach(function (edge) {
      ctx.fillStyle = COLORS.delta;
      ctx.fillRect(ox + edge[1] * cell, oy + edge[0] * cell, Math.max(1, cell - 0.5), Math.max(1, cell - 0.5));
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(ox, oy, size, size);
    label(ctx, "source", ox - 6, oy + size / 2, { align: "right", color: COLORS.muted, size: 10 });
    label(ctx, result.bfs.size + " reachable pairs", ox, box.y + box.h - 22, { color: COLORS.closure, size: 12, weight: "780" });
    label(ctx, "destination", ox + size, box.y + box.h - 22, { align: "right", color: COLORS.muted, size: 10 });
  }

  function plotFrame(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    for (var g = 1; g < 4; g += 1) {
      var y = plot.y + plot.h * g / 4;
      ctx.strokeStyle = "rgba(100,116,139,0.15)";
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawWork(ctx, box, result) {
    panel(ctx, box, "join work by round", "naive repeats old joins; semi-naive joins the frontier");
    var plot = { x: box.x + 46, y: box.y + 64, w: box.w - 70, h: box.h - 96 };
    plotFrame(ctx, plot);
    var rounds = Math.max(result.naive.rounds.length, result.semi.rounds.length) - 1;
    var maxV = Math.max.apply(null, result.naive.rounds.concat(result.semi.rounds).map(function (row) { return row.probes; }).concat([1]));
    function bar(rows, i, offset, color) {
      var row = rows[i] || { probes: 0 };
      var x = plot.x + (i - 0.5) / Math.max(1, rounds) * plot.w + offset;
      var w = Math.max(2, plot.w / Math.max(3, rounds) * 0.22);
      var h = row.probes / maxV * plot.h;
      ctx.fillStyle = color;
      ctx.fillRect(x - w / 2, plot.y + plot.h - h, w, h);
    }
    for (var i = 1; i <= rounds; i += 1) {
      bar(result.naive.rounds, i, -4, COLORS.naive);
      bar(result.semi.rounds, i, 4, COLORS.semi);
      if (i % Math.max(1, Math.ceil(rounds / 5)) === 0) label(ctx, String(i), plot.x + (i - 0.5) / Math.max(1, rounds) * plot.w, plot.y + plot.h + 13, { align: "center", color: COLORS.muted, size: 9 });
    }
    label(ctx, "Naive", plot.x + 6, plot.y + 14, { color: COLORS.naive, size: 10, weight: "780" });
    label(ctx, "Semi-naive", plot.x + 68, plot.y + 14, { color: COLORS.semi, size: 10, weight: "780" });
    if (box.w > 420) label(ctx, "round", plot.x + plot.w, box.y + box.h - 20, { align: "right", color: COLORS.muted, size: 10 });
  }

  function drawFrontier(ctx, box, result) {
    panel(ctx, box, "delta frontier", "new path facts added at each fixed-point round");
    var plot = { x: box.x + 42, y: box.y + 64, w: box.w - 62, h: box.h - 96 };
    plotFrame(ctx, plot);
    var rows = result.semi.rounds;
    var maxV = Math.max.apply(null, rows.map(function (row) { return row.delta; }).concat([1]));
    rows.forEach(function (row, i) {
      var x = plot.x + i / Math.max(1, rows.length - 1) * plot.w;
      var y = plot.y + plot.h - row.delta / maxV * plot.h;
      ctx.fillStyle = i === 0 ? COLORS.edge : COLORS.delta;
      ctx.beginPath();
      ctx.arc(x, y, i === 0 ? 3 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (i > 0) {
        var prev = rows[i - 1];
        var px = plot.x + (i - 1) / Math.max(1, rows.length - 1) * plot.w;
        var py = plot.y + plot.h - prev.delta / maxV * plot.h;
        ctx.strokeStyle = COLORS.delta;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    });
    label(ctx, "initial edges", plot.x + 6, plot.y + 14, { color: COLORS.edge, size: 10, weight: "760" });
    label(ctx, "new facts", plot.x + 88, plot.y + 14, { color: COLORS.delta, size: 10, weight: "760" });
    label(ctx, "0 means fixed point", plot.x + plot.w, box.y + box.h - 20, { align: "right", color: COLORS.muted, size: 10 });
  }

  function drawRules(ctx, box, result) {
    panel(ctx, box, "one recursive rule", "replace one old path input with delta");
    var x = box.x + 18;
    var y = box.y + 58;
    var rowStep = 37;
    var rowHeight = 30;
    var textSize = box.w < 380 ? 10 : 11;
    var lines = [
      ["edge(x,y).", COLORS.edge],
      ["path(x,y) :- edge(x,y).", COLORS.closure],
      ["path(x,z) :- path(x,y), edge(y,z).", COLORS.naive],
      ["delta_next(x,z) :- delta(x,y), edge(y,z).", COLORS.semi]
    ];
    lines.forEach(function (row, i) {
      ctx.fillStyle = i === 3 ? "rgba(124,58,237,0.10)" : "rgba(248,250,252,0.95)";
      ctx.strokeStyle = i === 3 ? "rgba(124,58,237,0.36)" : COLORS.rule;
      ctx.beginPath();
      ctx.roundRect(x, y + i * rowStep, box.w - 36, rowHeight, 6);
      ctx.fill();
      ctx.stroke();
      label(ctx, row[0], x + 10, y + i * rowStep + rowHeight / 2, { color: row[1], size: textSize, weight: "760" });
    });
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (width < 620) {
      var gap = 14;
      var h1 = 310;
      var h2 = 210;
      var h3 = 200;
      drawMatrix(ctx, { x: 0, y: 0, w: width, h: h1 }, result);
      drawWork(ctx, { x: 0, y: h1 + gap, w: width, h: h2 }, result);
      drawFrontier(ctx, { x: 0, y: h1 + h2 + 2 * gap, w: width, h: h3 }, result);
      drawRules(ctx, { x: 0, y: h1 + h2 + h3 + 3 * gap, w: width, h: height - h1 - h2 - h3 - 3 * gap }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.48);
      var rightW = width - leftW - gap2;
      var rowH = (height - gap2) / 2;
      drawMatrix(ctx, { x: 0, y: 0, w: leftW, h: height }, result);
      drawWork(ctx, { x: leftW + gap2, y: 0, w: rightW, h: rowH }, result);
      drawFrontier(ctx, { x: leftW + gap2, y: rowH + gap2, w: Math.round(rightW * 0.52) - gap2 / 2, h: rowH }, result);
      drawRules(ctx, { x: leftW + gap2 + Math.round(rightW * 0.52) + gap2 / 2, y: rowH + gap2, w: rightW - Math.round(rightW * 0.52) - gap2 / 2, h: rowH }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      nodes: String(result.params.nodes),
      shape: result.shapeLabel,
      extra: result.params.extra + "%",
      seed: String(result.params.seed)
    };
    Object.keys(values).forEach(function (name) {
      var output = root.querySelector('[data-value="' + name + '"]');
      if (output) output.textContent = values[name];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Reachable pairs", formatNumber(result.bfs.size, 0)),
        metric("Naive joins", formatNumber(result.naive.totalProbes, 0)),
        metric("Semi-naive joins", formatNumber(result.semi.totalProbes, 0)),
        metric("Work saved", formatPercent(result.savings, 1)),
        metric("Rounds", result.semi.iterations + " frontier"),
        metric("Audit", result.audit.passed ? "passed" : "check")
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__datalogDeltaResult = result;
  }

  function init(root) {
    if (!root || root.__datalogDeltaReady) return;
    root.__datalogDeltaReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-datalog-delta-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    closureByBfs: closureByBfs,
    evaluate: evaluate,
    evaluateNaive: evaluateNaive,
    evaluateSemiNaive: evaluateSemiNaive,
    makeGraph: makeGraph
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.DatalogDeltaLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
