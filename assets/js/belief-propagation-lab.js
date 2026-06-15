(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e8eef4",
    panel: "#f8fafc",
    white: "#ffffff",
    bp: "#0f766e",
    exact: "#2563eb",
    error: "#be123c",
    residual: "#8b5cf6",
    positive: "#0f766e",
    negative: "#b45309",
    evidence: "#dc2626"
  };

  var DEFAULTS = {
    graph: "cycle8",
    coupling: 92,
    field: 12,
    evidence: 72,
    damping: 35,
    iterations: 28
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var graph = String(raw.graph || DEFAULTS.graph);
    if (!/^(chain7|tree7|cycle8|grid9|frustrated8)$/.test(graph)) graph = DEFAULTS.graph;
    return {
      graph: graph,
      coupling: clamp(Math.round(readNumber(raw, "coupling")), 0, 180),
      field: clamp(Math.round(readNumber(raw, "field")), -90, 90),
      evidence: clamp(Math.round(readNumber(raw, "evidence")), -100, 100),
      damping: clamp(Math.round(readNumber(raw, "damping")), 0, 85),
      iterations: clamp(Math.round(readNumber(raw, "iterations")), 1, 80)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    var d = digits == null ? 3 : digits;
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 10) return value.toFixed(2);
    if (Math.abs(value) >= 1) return value.toFixed(d);
    if (Math.abs(value) >= 0.01) return value.toFixed(d + 1);
    return value.toExponential(2);
  }

  function metric(label, value) {
    return '<div class="bp-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function graphSpec(name) {
    if (name === "chain7") {
      return {
        name: "chain",
        positions: [
          [0.06, 0.52], [0.20, 0.36], [0.35, 0.58], [0.50, 0.38],
          [0.65, 0.60], [0.80, 0.40], [0.94, 0.52]
        ],
        edges: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1]]
      };
    }
    if (name === "tree7") {
      return {
        name: "tree",
        positions: [
          [0.50, 0.12], [0.25, 0.34], [0.75, 0.34], [0.13, 0.66],
          [0.36, 0.70], [0.64, 0.70], [0.87, 0.66]
        ],
        edges: [[0, 1, 1], [0, 2, 1], [1, 3, 1], [1, 4, 1], [2, 5, 1], [2, 6, 1]]
      };
    }
    if (name === "grid9") {
      return {
        name: "3x3 grid",
        positions: [
          [0.18, 0.18], [0.50, 0.18], [0.82, 0.18], [0.18, 0.50],
          [0.50, 0.50], [0.82, 0.50], [0.18, 0.82], [0.50, 0.82], [0.82, 0.82]
        ],
        edges: [
          [0, 1, 1], [1, 2, 1], [3, 4, 1], [4, 5, 1], [6, 7, 1], [7, 8, 1],
          [0, 3, 1], [3, 6, 1], [1, 4, 1], [4, 7, 1], [2, 5, 1], [5, 8, 1]
        ]
      };
    }
    if (name === "frustrated8") {
      return {
        name: "frustrated cycle",
        positions: cyclePositions(8),
        edges: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, -1], [4, 5, 1], [5, 6, 1], [6, 7, 1], [7, 0, 1]]
      };
    }
    return {
      name: "cycle",
      positions: cyclePositions(8),
      edges: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1], [6, 7, 1], [7, 0, 1]]
    };
  }

  function cyclePositions(n) {
    var out = [];
    for (var i = 0; i < n; i += 1) {
      var a = -Math.PI / 2 + 2 * Math.PI * i / n;
      out.push([0.5 + 0.38 * Math.cos(a), 0.5 + 0.38 * Math.sin(a)]);
    }
    return out;
  }

  function makeModel(params) {
    var spec = graphSpec(params.graph);
    var n = spec.positions.length;
    var h = [];
    var base = params.field / 100;
    for (var i = 0; i < n; i += 1) {
      h.push(base * (0.75 + 0.25 * Math.cos((i + 1) * 1.7)));
    }
    h[0] += params.evidence / 42;
    if (n > 4) h[Math.floor(n / 2)] -= params.evidence / 180;
    var jScale = params.coupling / 100;
    var edges = spec.edges.map(function (edge) {
      return { a: edge[0], b: edge[1], sign: edge[2], j: edge[2] * jScale };
    });
    var neighbors = [];
    for (i = 0; i < n; i += 1) neighbors.push([]);
    edges.forEach(function (edge, idx) {
      neighbors[edge.a].push({ node: edge.b, edge: idx, j: edge.j });
      neighbors[edge.b].push({ node: edge.a, edge: idx, j: edge.j });
    });
    return {
      edges: edges,
      h: h,
      n: n,
      neighbors: neighbors,
      params: params,
      positions: spec.positions,
      title: spec.name
    };
  }

  function spin(bit) {
    return bit ? 1 : -1;
  }

  function logWeight(model, mask) {
    var value = 0;
    for (var i = 0; i < model.n; i += 1) value += model.h[i] * spin((mask >> i) & 1);
    model.edges.forEach(function (edge) {
      value += edge.j * spin((mask >> edge.a) & 1) * spin((mask >> edge.b) & 1);
    });
    return value;
  }

  function exactInference(model) {
    var total = 1 << model.n;
    var logs = [];
    var maxLog = -Infinity;
    for (var mask = 0; mask < total; mask += 1) {
      var lw = logWeight(model, mask);
      logs.push(lw);
      if (lw > maxLog) maxLog = lw;
    }
    var weights = logs.map(function (lw) { return Math.exp(lw - maxLog); });
    var z = weights.reduce(function (sum, value) { return sum + value; }, 0);
    var logZ = maxLog + Math.log(z);
    var marginals = [];
    var means = [];
    var correlations = model.edges.map(function () { return 0; });
    for (var i = 0; i < model.n; i += 1) {
      var p = 0;
      for (mask = 0; mask < total; mask += 1) if ((mask >> i) & 1) p += weights[mask];
      p /= z;
      marginals.push(p);
      means.push(2 * p - 1);
    }
    model.edges.forEach(function (edge, idx) {
      var c = 0;
      for (mask = 0; mask < total; mask += 1) {
        c += weights[mask] * spin((mask >> edge.a) & 1) * spin((mask >> edge.b) & 1);
      }
      correlations[idx] = c / z;
    });
    return { correlations: correlations, logZ: logZ, marginals: marginals, means: means };
  }

  function key(from, to) {
    return from + ">" + to;
  }

  function initialMessages(model) {
    var messages = {};
    model.edges.forEach(function (edge) {
      messages[key(edge.a, edge.b)] = [0.5, 0.5];
      messages[key(edge.b, edge.a)] = [0.5, 0.5];
    });
    return messages;
  }

  function normalize(pair) {
    var sum = pair[0] + pair[1];
    if (!Number.isFinite(sum) || sum <= 0) return [0.5, 0.5];
    return [pair[0] / sum, pair[1] / sum];
  }

  function pairPotential(j, si, sj) {
    return Math.exp(j * si * sj);
  }

  function unaryPotential(h, si) {
    return Math.exp(h * si);
  }

  function messageUpdate(model, messages, from, to, j) {
    var out = [0, 0];
    for (var xj = 0; xj < 2; xj += 1) {
      var sj = spin(xj);
      var sum = 0;
      for (var xi = 0; xi < 2; xi += 1) {
        var si = spin(xi);
        var prod = unaryPotential(model.h[from], si) * pairPotential(j, si, sj);
        model.neighbors[from].forEach(function (nb) {
          if (nb.node === to) return;
          prod *= messages[key(nb.node, from)][xi];
        });
        sum += prod;
      }
      out[xj] = sum;
    }
    return normalize(out);
  }

  function runBp(model, iterations, damping) {
    var messages = initialMessages(model);
    var history = [];
    var damp = damping / 100;
    for (var iter = 0; iter < iterations; iter += 1) {
      var next = {};
      var residual = 0;
      model.edges.forEach(function (edge) {
        [
          { from: edge.a, to: edge.b, j: edge.j },
          { from: edge.b, to: edge.a, j: edge.j }
        ].forEach(function (dir) {
          var fresh = messageUpdate(model, messages, dir.from, dir.to, dir.j);
          var old = messages[key(dir.from, dir.to)];
          var mixed = normalize([
            damp * old[0] + (1 - damp) * fresh[0],
            damp * old[1] + (1 - damp) * fresh[1]
          ]);
          residual = Math.max(residual, Math.abs(mixed[0] - old[0]) + Math.abs(mixed[1] - old[1]));
          next[key(dir.from, dir.to)] = mixed;
        });
      });
      messages = next;
      history.push({ iter: iter + 1, residual: residual });
    }
    return { history: history, messages: messages };
  }

  function beliefs(model, messages) {
    var marginals = [];
    var means = [];
    for (var i = 0; i < model.n; i += 1) {
      var vals = [0, 0];
      for (var xi = 0; xi < 2; xi += 1) {
        var si = spin(xi);
        var prod = unaryPotential(model.h[i], si);
        model.neighbors[i].forEach(function (nb) {
          prod *= messages[key(nb.node, i)][xi];
        });
        vals[xi] = prod;
      }
      vals = normalize(vals);
      marginals.push(vals[1]);
      means.push(vals[1] - vals[0]);
    }
    return { marginals: marginals, means: means };
  }

  function pairBeliefs(model, messages) {
    return model.edges.map(function (edge) {
      var vals = [0, 0, 0, 0];
      for (var xi = 0; xi < 2; xi += 1) {
        for (var xj = 0; xj < 2; xj += 1) {
          var si = spin(xi);
          var sj = spin(xj);
          var prod = unaryPotential(model.h[edge.a], si) * unaryPotential(model.h[edge.b], sj) * pairPotential(edge.j, si, sj);
          model.neighbors[edge.a].forEach(function (nb) {
            if (nb.node !== edge.b) prod *= messages[key(nb.node, edge.a)][xi];
          });
          model.neighbors[edge.b].forEach(function (nb) {
            if (nb.node !== edge.a) prod *= messages[key(nb.node, edge.b)][xj];
          });
          vals[xi * 2 + xj] = prod;
        }
      }
      return normalizePair(vals);
    });
  }

  function normalizePair(vals) {
    var sum = vals.reduce(function (acc, value) { return acc + value; }, 0);
    if (!Number.isFinite(sum) || sum <= 0) return [0.25, 0.25, 0.25, 0.25];
    return vals.map(function (value) { return value / sum; });
  }

  function betheLogZ(model, messages, nodeBeliefs) {
    var pairs = pairBeliefs(model, messages);
    var free = 0;
    pairs.forEach(function (pair, idx) {
      var edge = model.edges[idx];
      for (var xi = 0; xi < 2; xi += 1) {
        for (var xj = 0; xj < 2; xj += 1) {
          var p = pair[xi * 2 + xj];
          if (p <= 0) continue;
          var si = spin(xi);
          var sj = spin(xj);
          free += p * (Math.log(p) - edge.j * si * sj);
        }
      }
    });
    for (var i = 0; i < model.n; i += 1) {
      var degree = model.neighbors[i].length;
      var probs = [1 - nodeBeliefs.marginals[i], nodeBeliefs.marginals[i]];
      for (var xi2 = 0; xi2 < 2; xi2 += 1) {
      var p2 = probs[xi2];
      if (p2 <= 0) continue;
      free += (1 - degree) * p2 * Math.log(p2) - p2 * model.h[i] * spin(xi2);
      }
    }
    return -free;
  }

  function maxAbsDiff(a, b) {
    var value = 0;
    for (var i = 0; i < a.length; i += 1) value = Math.max(value, Math.abs(a[i] - b[i]));
    return value;
  }

  function isTree(model) {
    return model.edges.length === model.n - 1 && connected(model);
  }

  function connected(model) {
    var seen = {};
    var stack = [0];
    seen[0] = true;
    while (stack.length) {
      var i = stack.pop();
      model.neighbors[i].forEach(function (nb) {
        if (!seen[nb.node]) {
          seen[nb.node] = true;
          stack.push(nb.node);
        }
      });
    }
    return Object.keys(seen).length === model.n;
  }

  function sweep(params) {
    var out = [];
    for (var i = 0; i < 17; i += 1) {
      var coupling = Math.round(180 * i / 16);
      var trial = cleanParams(Object.assign({}, params, { coupling: coupling }));
      var model = makeModel(trial);
      var exact = exactInference(model);
      var bp = runBp(model, trial.iterations, trial.damping);
      var b = beliefs(model, bp.messages);
      out.push({
        coupling: coupling / 100,
        error: maxAbsDiff(b.marginals, exact.marginals),
        residual: bp.history.length ? bp.history[bp.history.length - 1].residual : 0
      });
    }
    return out;
  }

  function audit(model, exact, bp, b, logZBethe) {
    var finite = true;
    var normalized = true;
    Object.keys(bp.messages).forEach(function (name) {
      var m = bp.messages[name];
      if (!Number.isFinite(m[0]) || !Number.isFinite(m[1])) finite = false;
      if (Math.abs(m[0] + m[1] - 1) > 1e-10 || m[0] < -1e-12 || m[1] < -1e-12) normalized = false;
    });
    b.marginals.forEach(function (p) {
      if (!Number.isFinite(p)) finite = false;
      if (p < -1e-12 || p > 1 + 1e-12) normalized = false;
    });
    var residual = bp.history.length ? bp.history[bp.history.length - 1].residual : 0;
    var tree = isTree(model);
    var treeExact = !tree || maxAbsDiff(b.marginals, exact.marginals) < 1e-7;
    var treeBetheExact = !tree || Math.abs(logZBethe - exact.logZ) < 1e-7;
    var checks = {
      finite: finite,
      normalized: normalized,
      exactLogZFinite: Number.isFinite(exact.logZ),
      betheLogZFinite: Number.isFinite(logZBethe),
      residualFinite: Number.isFinite(residual),
      treeExactWhenAcyclic: treeExact,
      treeBetheExactWhenAcyclic: treeBetheExact
    };
    return {
      checks: checks,
      passed: Object.keys(checks).every(function (keyName) { return checks[keyName]; })
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var model = makeModel(params);
    var exact = exactInference(model);
    var bp = runBp(model, params.iterations, params.damping);
    var b = beliefs(model, bp.messages);
    var logZBethe = betheLogZ(model, bp.messages, b);
    var error = maxAbsDiff(b.marginals, exact.marginals);
    var residual = bp.history.length ? bp.history[bp.history.length - 1].residual : 0;
    return {
      audit: audit(model, exact, bp, b, logZBethe),
      belief: b,
      betheLogZ: logZBethe,
      bp: bp,
      error: error,
      exact: exact,
      logZError: Math.abs(logZBethe - exact.logZ),
      model: model,
      params: params,
      residual: residual,
      sweep: sweep(params),
      tree: isTree(model)
    };
  }

  function setCanvasSize(canvas) {
    var cssWidth = Math.max(320, Math.floor(canvas.parentElement ? canvas.parentElement.clientWidth : canvas.clientWidth || 640));
    var height = cssWidth < 560 ? 1120 : 780;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);
    return { ctx: ctx, width: cssWidth, height: height };
  }

  function drawPanel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, box.x + 14, box.y + 22);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 40);
    }
  }

  function mixColor(p) {
    p = clamp(p, 0, 1);
    var cold = [37, 99, 235];
    var hot = [190, 18, 60];
    var mid = [248, 250, 252];
    var from = p < 0.5 ? cold : mid;
    var to = p < 0.5 ? mid : hot;
    var t = p < 0.5 ? p * 2 : (p - 0.5) * 2;
    var rgb = from.map(function (v, i) { return Math.round(v + (to[i] - v) * t); });
    return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
  }

  function drawGraph(ctx, box, result) {
    drawPanel(ctx, box, "Graph beliefs", "fill is BP, outer ring is exact");
    var plot = { x: box.x + 34, y: box.y + 56, w: box.w - 68, h: box.h - 88 };
    var model = result.model;
    var pts = model.positions.map(function (p) {
      return { x: plot.x + p[0] * plot.w, y: plot.y + p[1] * plot.h };
    });
    model.edges.forEach(function (edge) {
      var a = pts[edge.a];
      var b = pts[edge.b];
      ctx.strokeStyle = edge.sign > 0 ? "rgba(15, 118, 110, 0.45)" : "rgba(180, 83, 9, 0.65)";
      ctx.lineWidth = edge.sign > 0 ? 2 : 3;
      ctx.setLineDash(edge.sign > 0 ? [] : [6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    pts.forEach(function (p, i) {
      var bp = result.belief.marginals[i];
      var exact = result.exact.marginals[i];
      ctx.fillStyle = mixColor(bp);
      ctx.strokeStyle = mixColor(exact);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (i === 0) {
        ctx.strokeStyle = COLORS.evidence;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = bp > 0.72 || bp < 0.28 ? "#ffffff" : COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i), p.x, p.y);
    });
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(model.title + (result.tree ? " (tree)" : " (loopy)"), box.x + 14, box.y + box.h - 17);
  }

  function extent(values, pad) {
    var min = Infinity;
    var max = -Infinity;
    values.forEach(function (value) {
      if (!Number.isFinite(value)) return;
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
    if (min === max) {
      min -= 1;
      max += 1;
    }
    var extra = (max - min) * (pad == null ? 0.1 : pad);
    return { min: min - extra, max: max + extra };
  }

  function scaler(domain, range) {
    var span = domain.max - domain.min || 1;
    return function (value) {
      return range.min + (value - domain.min) / span * (range.max - range.min);
    };
  }

  function drawGrid(ctx, plot, xTicks, yTicks) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= xTicks; i += 1) {
      var x = plot.x + plot.w * i / xTicks;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    for (var j = 0; j <= yTicks; j += 1) {
      var y = plot.y + plot.h * j / yTicks;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawMarginals(ctx, box, result) {
    drawPanel(ctx, box, "Exact vs BP marginals", "probability each variable is +1");
    ctx.fillStyle = COLORS.bp;
    ctx.fillRect(box.x + 16, box.y + 54, 14, 4);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("BP", box.x + 35, box.y + 59);
    ctx.fillStyle = COLORS.exact;
    ctx.fillRect(box.x + 74, box.y + 54, 14, 4);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("exact", box.x + 93, box.y + 59);
    var plot = { x: box.x + 42, y: box.y + 74, w: box.w - 62, h: box.h - 108 };
    drawGrid(ctx, plot, result.model.n - 1, 4);
    var barW = plot.w / result.model.n * 0.32;
    for (var i = 0; i < result.model.n; i += 1) {
      var cx = plot.x + plot.w * (i + 0.5) / result.model.n;
      var bp = result.belief.marginals[i];
      var ex = result.exact.marginals[i];
      var y0 = plot.y + plot.h;
      var ybp = plot.y + plot.h * (1 - bp);
      var yex = plot.y + plot.h * (1 - ex);
      ctx.fillStyle = "rgba(15, 118, 110, 0.78)";
      ctx.fillRect(cx - barW - 1, ybp, barW, y0 - ybp);
      ctx.fillStyle = "rgba(37, 99, 235, 0.62)";
      ctx.fillRect(cx + 1, yex, barW, y0 - yex);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(i), cx, plot.y + plot.h + 16);
    }
    ctx.textAlign = "left";
  }

  function drawResidual(ctx, box, result) {
    drawPanel(ctx, box, "Message residual", "max message change per sweep");
    var plot = { x: box.x + 48, y: box.y + 58, w: box.w - 70, h: box.h - 90 };
    var rows = result.bp.history;
    var values = rows.map(function (row) { return Math.log10(Math.max(1e-12, row.residual)); });
    var dy = extent(values.concat([-8, 0]), 0.05);
    var sx = scaler({ min: 1, max: Math.max(1, result.params.iterations) }, { min: plot.x, max: plot.x + plot.w });
    var sy = scaler(dy, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);
    ctx.strokeStyle = COLORS.residual;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = sx(row.iter);
      var y = sy(Math.log10(Math.max(1e-12, row.residual)));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("log10 residual", plot.x, box.y + box.h - 17);
  }

  function drawSweep(ctx, box, result) {
    drawPanel(ctx, box, "Coupling sweep", "BP marginal error as interactions strengthen");
    var plot = { x: box.x + 48, y: box.y + 58, w: box.w - 72, h: box.h - 92 };
    var dy = extent(result.sweep.map(function (row) { return row.error; }).concat([0]), 0.18);
    var sx = scaler({ min: 0, max: 1.8 }, { min: plot.x, max: plot.x + plot.w });
    var sy = scaler(dy, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);
    ctx.strokeStyle = COLORS.error;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    result.sweep.forEach(function (row, i) {
      var x = sx(row.coupling);
      var y = sy(row.error);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    result.sweep.forEach(function (row) {
      ctx.fillStyle = Math.abs(row.coupling - result.params.coupling / 100) < 1e-9 ? COLORS.text : COLORS.error;
      ctx.beginPath();
      ctx.arc(sx(row.coupling), sy(row.error), Math.abs(row.coupling - result.params.coupling / 100) < 1e-9 ? 4.5 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("coupling", plot.x + plot.w - 52, box.y + box.h - 17);
    ctx.save();
    ctx.translate(plot.x - 32, plot.y + 78);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("max error", 0, 0);
    ctx.restore();
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, frame.width, frame.height);
    var pad = 14;
    if (frame.width < 560) {
      drawGraph(ctx, { x: pad, y: pad, w: frame.width - pad * 2, h: 300 }, result);
      drawMarginals(ctx, { x: pad, y: 330, w: frame.width - pad * 2, h: 244 }, result);
      drawResidual(ctx, { x: pad, y: 590, w: frame.width - pad * 2, h: 244 }, result);
      drawSweep(ctx, { x: pad, y: 850, w: frame.width - pad * 2, h: 254 }, result);
    } else {
      var col = (frame.width - pad * 3) / 2;
      drawGraph(ctx, { x: pad, y: pad, w: col, h: 376 }, result);
      drawMarginals(ctx, { x: pad * 2 + col, y: pad, w: col, h: 376 }, result);
      drawResidual(ctx, { x: pad, y: 410, w: col, h: 354 }, result);
      drawSweep(ctx, { x: pad * 2 + col, y: 410, w: col, h: 354 }, result);
    }
  }

  function syncOutputs(root, result) {
    var values = {
      graph: result.model.title,
      coupling: fmt(result.params.coupling / 100, 2),
      field: fmt(result.params.field / 100, 2),
      evidence: fmt(result.params.evidence / 42, 2),
      damping: result.params.damping + "%",
      iterations: result.params.iterations
    };
    Object.keys(values).forEach(function (k) {
      var output = root.querySelector('[data-value="' + k + '"]');
      if (output) output.textContent = values[k];
    });
  }

  function renderMetrics(root, result) {
    var metrics = root.querySelector("[data-metrics]");
    if (!metrics) return;
    metrics.innerHTML = [
      metric("Max marginal error", fmt(result.error, 3)),
      metric("Residual", fmt(result.residual, 3)),
      metric("Exact logZ", fmt(result.exact.logZ, 3)),
      metric("Bethe logZ error", fmt(result.logZError, 3)),
      metric("Graph", result.tree ? "tree" : "loopy"),
      metric("Audit", result.audit.passed ? "passed" : "check")
    ].join("");
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__beliefPropagationResult = result;
  }

  function init(root) {
    if (!root || root.__beliefPropagationReady) return;
    root.__beliefPropagationReady = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    var timer = null;
    global.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { render(root); }, 120);
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-belief-propagation-lab]").forEach(init);
  }

  var api = {
    beliefs: beliefs,
    cleanParams: cleanParams,
    evaluate: evaluate,
    exactInference: exactInference,
    makeModel: makeModel,
    runBp: runBp,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.BeliefPropagationLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
