(function (global) {
  "use strict";

  var COLORS = {
    a: "#2563eb",
    b: "#0f766e",
    bad: "#be123c",
    cut: "#d97706",
    edge: "#cbd5e1",
    faint: "#f8fafc",
    grid: "#e6edf3",
    line: "#94a3b8",
    muted: "#5d6872",
    panel: "#ffffff",
    spectralA: "#7c3aed",
    spectralB: "#14b8a6",
    text: "#172026",
    whisker: "#be123c"
  };

  var DEFAULTS = {
    bridge: 12,
    degreeSkew: 35,
    noise: 10,
    nodes: 56,
    seed: 41,
    sigma: 58,
    whiskerWeight: 8,
    whiskers: 4
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      bridge: Math.round(clamp(finite(Number(raw.bridge), DEFAULTS.bridge), 0, 55)),
      degreeSkew: Math.round(clamp(finite(Number(raw.degreeSkew), DEFAULTS.degreeSkew), 0, 75)),
      noise: Math.round(clamp(finite(Number(raw.noise), DEFAULTS.noise), 0, 55)),
      nodes: Math.round(clamp(finite(Number(raw.nodes), DEFAULTS.nodes), 28, 84) / 4) * 4,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      sigma: Math.round(clamp(finite(Number(raw.sigma), DEFAULTS.sigma), 28, 95)),
      whiskerWeight: Math.round(clamp(finite(Number(raw.whiskerWeight), DEFAULTS.whiskerWeight), 1, 40)),
      whiskers: Math.round(clamp(finite(Number(raw.whiskers), DEFAULTS.whiskers), 0, 10))
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

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u <= 0) u = rand();
    while (v <= 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 3 : digits);
  }

  function pct(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function buildGraph(params) {
    var rand = rng(20260617 + params.seed * 8191 + params.nodes * 131 + params.bridge * 17);
    var whiskers = Math.min(params.whiskers, Math.max(0, params.nodes - 24));
    var core = params.nodes - whiskers;
    var nA = Math.floor(core / 2);
    var nB = core - nA;
    var nodes = [];
    var i;

    for (i = 0; i < nA; i += 1) {
      nodes.push({
        anchor: 0,
        group: 0,
        id: nodes.length,
        kind: "core",
        x: -1.2 + 0.32 * normal(rand),
        y: 0.12 * Math.sin(i * 0.7) + 0.44 * normal(rand)
      });
    }

    for (i = 0; i < nB; i += 1) {
      nodes.push({
        anchor: 1,
        group: 1,
        id: nodes.length,
        kind: "core",
        x: 1.18 + 0.32 * normal(rand),
        y: 0.10 * Math.cos(i * 0.9) + 0.44 * normal(rand)
      });
    }

    var leftAnchors = nodes.filter(function (node) { return node.group === 0 && node.kind === "core"; });
    for (i = 0; i < whiskers; i += 1) {
      var anchor = leftAnchors[(i * 7 + params.seed) % leftAnchors.length];
      nodes.push({
        anchor: anchor.id,
        group: 0,
        id: nodes.length,
        kind: "whisker",
        x: -2.25 - 0.12 * i + 0.08 * normal(rand),
        y: -1.08 + 0.46 * i / Math.max(1, whiskers - 1) + 0.05 * normal(rand)
      });
    }

    var n = nodes.length;
    var w = [];
    for (i = 0; i < n; i += 1) {
      w.push(new Array(n).fill(0));
    }

    var sigma = params.sigma / 100;
    var bridge = params.bridge / 100;
    var skew = params.degreeSkew / 100;
    var noise = params.noise / 100;

    for (i = 0; i < core; i += 1) {
      for (var j = i + 1; j < core; j += 1) {
        var dx = nodes[i].x - nodes[j].x;
        var dy = nodes[i].y - nodes[j].y;
        var distance2 = dx * dx + dy * dy;
        var same = nodes[i].group === nodes[j].group;
        var scale = same ? sigma : sigma * 1.65;
        var base = Math.exp(-distance2 / (2 * scale * scale));
        var value;
        if (same) {
          var dense = nodes[i].group === 1 ? 1 + skew : 1 - 0.25 * skew;
          value = dense * base * (0.72 + 0.18 * rand());
        } else {
          var midline = Math.abs(nodes[i].y - nodes[j].y) < 0.42 ? 1.35 : 0.75;
          value = bridge * midline * base * (0.45 + 0.28 * rand());
          value += noise * 0.018 * rand();
        }
        if (value > 0.002) {
          w[i][j] = value;
          w[j][i] = value;
        }
      }
    }

    var whiskerWeight = params.whiskerWeight / 100;
    for (i = core; i < n; i += 1) {
      var a = nodes[i].anchor;
      var primary = whiskerWeight * (0.88 + 0.28 * rand());
      w[i][a] = primary;
      w[a][i] = primary;
      var second = (a + 5) % nA;
      if (second !== a) {
        var secondary = whiskerWeight * 0.20 * (0.55 + rand());
        w[i][second] = secondary;
        w[second][i] = secondary;
      }
    }

    var degrees = w.map(function (row) {
      return row.reduce(function (sum, value) { return sum + value; }, 0);
    });

    return {
      core: core,
      degrees: degrees,
      nodes: nodes,
      weights: w
    };
  }

  function cutValue(weights, set) {
    var cut = 0;
    for (var i = 0; i < weights.length; i += 1) {
      for (var j = i + 1; j < weights.length; j += 1) {
        if (set[i] !== set[j]) cut += weights[i][j];
      }
    }
    return cut;
  }

  function volume(degrees, set, value) {
    var v = 0;
    for (var i = 0; i < degrees.length; i += 1) {
      if (set[i] === value) v += degrees[i];
    }
    return v;
  }

  function scoreCut(graph, set) {
    var cut = cutValue(graph.weights, set);
    var v0 = volume(graph.degrees, set, false);
    var v1 = volume(graph.degrees, set, true);
    var n = set.length;
    var s1 = set.filter(Boolean).length;
    var s0 = n - s1;
    var ncut = v0 > 0 && v1 > 0 ? cut / v0 + cut / v1 : Infinity;
    var ratioCut = s0 > 0 && s1 > 0 ? cut / s0 + cut / s1 : Infinity;
    var conductance = Math.min(v0, v1) > 0 ? cut / Math.min(v0, v1) : Infinity;
    return {
      conductance: conductance,
      cut: cut,
      ncut: ncut,
      ratioCut: ratioCut,
      size0: s0,
      size1: s1,
      vol0: v0,
      vol1: v1
    };
  }

  function truthSet(graph) {
    return graph.nodes.map(function (node) {
      return node.group === 1;
    });
  }

  function singletonSet(n, index) {
    var set = new Array(n).fill(false);
    set[index] = true;
    return set;
  }

  function normalizedLaplacian(graph) {
    var n = graph.nodes.length;
    var m = [];
    for (var i = 0; i < n; i += 1) {
      var row = [];
      for (var j = 0; j < n; j += 1) {
        if (i === j) row.push(1);
        else {
          var denom = Math.sqrt(Math.max(1e-12, graph.degrees[i] * graph.degrees[j]));
          row.push(-graph.weights[i][j] / denom);
        }
      }
      m.push(row);
    }
    return m;
  }

  function jacobiEigen(input) {
    var n = input.length;
    var a = input.map(function (row) { return row.slice(); });
    var v = [];
    var i;
    for (i = 0; i < n; i += 1) {
      v.push(new Array(n).fill(0));
      v[i][i] = 1;
    }

    var maxSweeps = Math.max(40, n * n * 5);
    for (var sweep = 0; sweep < maxSweeps; sweep += 1) {
      var p = 0;
      var q = 1;
      var best = 0;
      for (i = 0; i < n; i += 1) {
        for (var j = i + 1; j < n; j += 1) {
          var magnitude = Math.abs(a[i][j]);
          if (magnitude > best) {
            best = magnitude;
            p = i;
            q = j;
          }
        }
      }
      if (best < 1e-10) break;

      var app = a[p][p];
      var aqq = a[q][q];
      var apq = a[p][q];
      var tau = (aqq - app) / (2 * apq);
      var t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      var c = 1 / Math.sqrt(1 + t * t);
      var s = t * c;

      for (i = 0; i < n; i += 1) {
        if (i !== p && i !== q) {
          var aip = a[i][p];
          var aiq = a[i][q];
          a[i][p] = c * aip - s * aiq;
          a[p][i] = a[i][p];
          a[i][q] = s * aip + c * aiq;
          a[q][i] = a[i][q];
        }
      }

      a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
      a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
      a[p][q] = 0;
      a[q][p] = 0;

      for (i = 0; i < n; i += 1) {
        var vip = v[i][p];
        var viq = v[i][q];
        v[i][p] = c * vip - s * viq;
        v[i][q] = s * vip + c * viq;
      }
    }

    var pairs = [];
    for (i = 0; i < n; i += 1) {
      pairs.push({
        value: Math.max(0, a[i][i]),
        vector: v.map(function (row) { return row[i]; })
      });
    }
    pairs.sort(function (x, y) { return x.value - y.value; });
    return pairs;
  }

  function sweepFiedler(graph, fiedler) {
    var n = graph.nodes.length;
    var order = fiedler.map(function (value, index) {
      return {
        index: index,
        value: value / Math.sqrt(Math.max(1e-12, graph.degrees[index]))
      };
    }).sort(function (a, b) { return a.value - b.value; });

    var set = new Array(n).fill(false);
    var rows = [];
    var best = null;

    for (var pos = 0; pos < n - 1; pos += 1) {
      set[order[pos].index] = true;
      var score = scoreCut(graph, set);
      var threshold = 0.5 * (order[pos].value + order[pos + 1].value);
      var row = {
        conductance: score.conductance,
        cut: score.cut,
        index: pos,
        ncut: score.ncut,
        ratioCut: score.ratioCut,
        set: set.slice(),
        size: pos + 1,
        threshold: threshold,
        value: order[pos].value
      };
      rows.push(row);
      if (!best || row.ncut < best.ncut) best = row;
    }

    return {
      best: best,
      order: order,
      rows: rows
    };
  }

  function agreement(set, truth) {
    var same = 0;
    var flipped = 0;
    for (var i = 0; i < set.length; i += 1) {
      if (set[i] === truth[i]) same += 1;
      if (set[i] !== truth[i]) flipped += 1;
    }
    return Math.max(same, flipped) / set.length;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var graph = buildGraph(params);
    var truth = truthSet(graph);
    var truthScore = scoreCut(graph, truth);
    var minDegree = graph.degrees.reduce(function (best, degree, index) {
      return degree < best.degree ? { degree: degree, index: index } : best;
    }, { degree: Infinity, index: 0 });
    var singleton = singletonSet(graph.nodes.length, minDegree.index);
    var singletonScore = scoreCut(graph, singleton);
    var eig = jacobiEigen(normalizedLaplacian(graph));
    var fiedler = eig[1] ? eig[1].vector : eig[0].vector;
    var sweep = sweepFiedler(graph, fiedler);
    var spectralScore = scoreCut(graph, sweep.best.set);
    var agree = agreement(sweep.best.set, truth);

    return {
      agreement: agree,
      eigenvalues: eig.slice(0, 10).map(function (row) { return row.value; }),
      fiedler: fiedler.map(function (value, index) {
        return value / Math.sqrt(Math.max(1e-12, graph.degrees[index]));
      }),
      graph: graph,
      params: params,
      singleton: {
        index: minDegree.index,
        score: singletonScore,
        set: singleton
      },
      spectral: {
        score: spectralScore,
        set: sweep.best.set,
        threshold: sweep.best.threshold
      },
      sweep: sweep,
      truth: {
        score: truthScore,
        set: truth
      }
    };
  }

  function audit() {
    var result = evaluate(DEFAULTS);
    var lambdas = result.eigenvalues;
    return {
      agreement: Number(result.agreement.toFixed(3)),
      lambda2: Number((lambdas[1] || 0).toFixed(4)),
      lambda3: Number((lambdas[2] || 0).toFixed(4)),
      singletonCutLower: result.singleton.score.cut < result.truth.score.cut,
      singletonNcut: Number(result.singleton.score.ncut.toFixed(3)),
      spectralNcut: Number(result.spectral.score.ncut.toFixed(3)),
      spectralSize: Math.min(result.spectral.score.size0, result.spectral.score.size1),
      truthNcut: Number(result.truth.score.ncut.toFixed(3))
    };
  }

  function metric(label, value, klass) {
    return '<div class="spectral-cut-lab__metric ' + (klass || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "bridge" || key === "degreeSkew" || key === "noise" || key === "whiskerWeight") value += "%";
        if (key === "sigma") value = fmt(value / 100, 2);
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    box.innerHTML = [
      metric("spectral agreement", pct(result.agreement, 1), result.agreement > 0.9 ? "good" : "warn"),
      metric("spectral Ncut", fmt(result.spectral.score.ncut, 3), "good"),
      metric("truth Ncut", fmt(result.truth.score.ncut, 3)),
      metric("singleton cut", fmt(result.singleton.score.cut, 3), "warn"),
      metric("singleton Ncut", fmt(result.singleton.score.ncut, 3)),
      metric("lambda2", fmt(result.eigenvalues[1] || 0, 4))
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = global.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.width));
    var height = Math.round(width * 0.78);
    if (width < 560) height = Math.round(width * 1.54);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function clear(ctx, w, h) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }

  function label(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || 650) + " " + (opts.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = "#d7dee5";
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    label(ctx, title, box.x + 14, box.y + 24, { size: 14, weight: 800 });
    if (subtitle) label(ctx, subtitle, box.x + 14, box.y + 42, { color: COLORS.muted, size: 11, weight: 600 });
  }

  function drawGraph(ctx, result, box) {
    panel(ctx, box, "weighted graph", "fill is spectral partition; ring is planted community");
    var nodes = result.graph.nodes;
    var weights = result.graph.weights;
    var xs = nodes.map(function (node) { return node.x; });
    var ys = nodes.map(function (node) { return node.y; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    var plot = { x: box.x + 24, y: box.y + 52, w: box.w - 48, h: box.h - 72 };
    function sx(x) { return plot.x + (x - minX) / Math.max(1e-9, maxX - minX) * plot.w; }
    function sy(y) { return plot.y + plot.h - (y - minY) / Math.max(1e-9, maxY - minY) * plot.h; }

    for (var i = 0; i < nodes.length; i += 1) {
      for (var j = i + 1; j < nodes.length; j += 1) {
        var weight = weights[i][j];
        if (weight < 0.025) continue;
        ctx.strokeStyle = result.spectral.set[i] === result.spectral.set[j] ? "rgba(148,163,184,0.34)" : "rgba(217,119,6,0.60)";
        ctx.lineWidth = Math.max(0.5, Math.min(2.7, weight * 2.1));
        ctx.beginPath();
        ctx.moveTo(sx(nodes[i].x), sy(nodes[i].y));
        ctx.lineTo(sx(nodes[j].x), sy(nodes[j].y));
        ctx.stroke();
      }
    }

    nodes.forEach(function (node, index) {
      var x = sx(node.x);
      var y = sy(node.y);
      ctx.beginPath();
      ctx.fillStyle = result.spectral.set[index] ? COLORS.spectralB : COLORS.spectralA;
      ctx.arc(x, y, node.kind === "whisker" ? 4.8 : 5.7, 0, 2 * Math.PI);
      ctx.fill();
      ctx.lineWidth = node.kind === "whisker" ? 2.4 : 1.6;
      ctx.strokeStyle = node.kind === "whisker" ? COLORS.whisker : node.group === 0 ? COLORS.a : COLORS.b;
      ctx.stroke();
    });

    label(ctx, "orange edges cross the spectral cut", box.x + 14, box.y + box.h - 14, { color: COLORS.muted, size: 11 });
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "Fiedler sweep", "sort the relaxed eigenvector, then test thresholds");
    var rows = result.sweep.rows;
    var order = result.sweep.order;
    var plot = { x: box.x + 46, y: box.y + 62, w: box.w - 72, h: box.h - 100 };
    var maxNcut = Math.max.apply(null, rows.map(function (row) { return Math.min(2, row.ncut); }));
    var minY = Math.min.apply(null, order.map(function (row) { return row.value; }));
    var maxY = Math.max.apply(null, order.map(function (row) { return row.value; }));
    function sx(pos) { return plot.x + pos / Math.max(1, order.length - 1) * plot.w; }
    function syN(value) { return plot.y + plot.h - Math.min(2, value) / Math.max(0.05, maxNcut) * plot.h; }
    function syV(value) { return plot.y + plot.h - (value - minY) / Math.max(1e-9, maxY - minY) * plot.h; }

    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h * g / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    order.forEach(function (row, index) {
      var x = sx(index);
      var y = syV(row.value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = COLORS.cut;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = sx(index);
      var y = syN(row.ncut);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    var bestX = sx(result.sweep.best.index);
    ctx.strokeStyle = COLORS.bad;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(bestX, plot.y);
    ctx.lineTo(bestX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);

    label(ctx, "eigenvector", plot.x + 4, box.y + box.h - 28, { color: COLORS.line, size: 11, weight: 800 });
    label(ctx, "Ncut", plot.x + 92, box.y + box.h - 28, { color: COLORS.cut, size: 11, weight: 800 });
    label(ctx, "best threshold", bestX + 5, plot.y + 14, { color: COLORS.bad, size: 10, weight: 800 });
  }

  function drawCutLedger(ctx, result, box) {
    panel(ctx, box, "cut ledger", "small edge cut is not the same as good partition");
    var rows = [
      { label: "singleton", score: result.singleton.score, color: COLORS.bad },
      { label: "truth", score: result.truth.score, color: COLORS.a },
      { label: "spectral", score: result.spectral.score, color: COLORS.spectralB }
    ];
    var plot = { x: box.x + 92, y: box.y + 64, w: box.w - 126, h: box.h - 92 };
    var maxCut = Math.max.apply(null, rows.map(function (row) { return row.score.cut; }));
    var maxNcut = Math.max.apply(null, rows.map(function (row) { return row.score.ncut; }));
    rows.forEach(function (row, index) {
      var y = plot.y + index * (plot.h / 3) + 12;
      label(ctx, row.label, box.x + 14, y + 15, { color: row.color, size: 12, weight: 800 });
      ctx.fillStyle = "rgba(148,163,184,0.42)";
      ctx.fillRect(plot.x, y, plot.w * row.score.cut / Math.max(1e-9, maxCut), 13);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y + 21, plot.w * row.score.ncut / Math.max(1e-9, maxNcut), 13);
      label(ctx, "cut " + fmt(row.score.cut, 2), plot.x + plot.w + 6, y + 11, { color: COLORS.muted, size: 10, weight: 650 });
      label(ctx, "Ncut " + fmt(row.score.ncut, 2), plot.x + plot.w + 6, y + 32, { color: COLORS.muted, size: 10, weight: 650 });
    });
    label(ctx, "gray: raw edge cut", plot.x, box.y + box.h - 20, { color: COLORS.muted, size: 10 });
    label(ctx, "color: normalized cut", plot.x + 126, box.y + box.h - 20, { color: COLORS.muted, size: 10 });
  }

  function drawSpectrum(ctx, result, box) {
    panel(ctx, box, "Laplacian spectrum", "lambda2 is the relaxed cut energy");
    var vals = result.eigenvalues.slice(0, 8);
    var plot = { x: box.x + 44, y: box.y + 64, w: box.w - 70, h: box.h - 98 };
    var maxV = Math.max.apply(null, vals.concat([0.2]));
    vals.forEach(function (value, index) {
      var barW = plot.w / vals.length * 0.68;
      var gap = plot.w / vals.length * 0.32;
      var x = plot.x + index * (barW + gap);
      var h = plot.h * value / maxV;
      ctx.fillStyle = index === 1 ? COLORS.cut : COLORS.line;
      ctx.fillRect(x, plot.y + plot.h - h, barW, h);
      label(ctx, String(index + 1), x + barW / 2, plot.y + plot.h + 16, { align: "center", color: COLORS.muted, size: 10, weight: 650 });
    });
    label(ctx, "lambda2 = " + fmt(vals[1] || 0, 4), plot.x, box.y + box.h - 18, { color: COLORS.cut, size: 11, weight: 800 });
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;
    clear(ctx, w, h);

    var margin = 18;
    var gap = 18;
    if (w < 560) {
      var panelH = (h - margin * 2 - gap * 3) / 4;
      drawGraph(ctx, result, { x: margin, y: margin, w: w - 2 * margin, h: panelH });
      drawSweep(ctx, result, { x: margin, y: margin + (panelH + gap), w: w - 2 * margin, h: panelH });
      drawCutLedger(ctx, result, { x: margin, y: margin + 2 * (panelH + gap), w: w - 2 * margin, h: panelH });
      drawSpectrum(ctx, result, { x: margin, y: margin + 3 * (panelH + gap), w: w - 2 * margin, h: panelH });
    } else {
      var colW = (w - 2 * margin - gap) / 2;
      var rowH = (h - 2 * margin - gap) / 2;
      drawGraph(ctx, result, { x: margin, y: margin, w: colW, h: rowH });
      drawSweep(ctx, result, { x: margin + colW + gap, y: margin, w: colW, h: rowH });
      drawCutLedger(ctx, result, { x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      drawSpectrum(ctx, result, { x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__spectralCutLabResult = result;
  }

  function init(root) {
    if (!root || root.__spectralCutLabReady) return;
    root.__spectralCutLabReady = true;
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
    requestRender();
  }

  function initAll() {
    global.document.querySelectorAll("[data-spectral-cut-lab]").forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SpectralCutLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
