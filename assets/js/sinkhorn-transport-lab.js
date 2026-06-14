(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    source: "#0f766e",
    target: "#7c3aed",
    link: "#2563eb",
    heat: "#b45309",
    bad: "#be123c",
    gray: "#64748b"
  };

  var DEFAULTS = {
    epsilon: 24,
    iterations: 90,
    points: 14,
    seed: 31,
    skew: 35,
    shift: 42
  };

  var VIEW = {
    xMax: 3.25,
    xMin: -3.25,
    yMax: 2.75,
    yMin: -2.75
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

  function cleanParams(raw) {
    raw = raw || {};
    return {
      epsilon: clamp(Number(raw.epsilon == null ? DEFAULTS.epsilon : raw.epsilon), 12, 120) / 100,
      iterations: clamp(Math.round(raw.iterations == null ? DEFAULTS.iterations : raw.iterations), 4, 220),
      points: clamp(Math.round(raw.points == null ? DEFAULTS.points : raw.points), 6, 28),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 999),
      skew: clamp(Number(raw.skew == null ? DEFAULTS.skew : raw.skew), 0, 90) / 100,
      shift: clamp(Number(raw.shift == null ? DEFAULTS.shift : raw.shift), 0, 100) / 100
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="sinkhorn-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function normalize(weights) {
    var total = weights.reduce(function (sum, value) { return sum + value; }, 0);
    return weights.map(function (value) { return value / Math.max(1e-12, total); });
  }

  function makePoints(params) {
    var rand = rng(20260614 + params.seed * 131 + params.points * 17);
    var sources = [];
    var targets = [];
    var i;
    var n = params.points;
    var shift = params.shift;

    for (i = 0; i < n; i += 1) {
      var angle = 2 * Math.PI * i / n + 0.22 * normal(rand);
      var radius = 1.35 + 0.25 * Math.sin(3 * angle + 0.7) + 0.12 * normal(rand);
      sources.push({
        x: -0.65 + radius * Math.cos(angle) + 0.12 * normal(rand),
        y: 0.10 + 0.72 * radius * Math.sin(angle) + 0.12 * normal(rand)
      });
    }

    for (i = 0; i < n; i += 1) {
      var t = i / Math.max(1, n - 1);
      var side = i % 2 === 0 ? -1 : 1;
      var wave = Math.sin(2 * Math.PI * t + 0.4);
      var x = 0.60 + side * (0.85 + 0.35 * shift) + 0.62 * Math.cos(2 * Math.PI * t + 0.8 * shift);
      var y = -0.12 + 1.05 * wave + 0.32 * Math.sin(5 * Math.PI * t + shift);
      targets.push({
        x: x + 0.12 * normal(rand),
        y: y + 0.12 * normal(rand)
      });
    }

    return { sources: sources, targets: targets };
  }

  function makeWeights(points, params, kind) {
    var weights = [];
    var hotspot = kind === "source" ? { x: -1.35, y: 0.75 } : { x: 1.45, y: -0.85 };
    var spread = kind === "source" ? 1.05 : 1.2;
    for (var i = 0; i < points.length; i += 1) {
      var dx = points[i].x - hotspot.x;
      var dy = points[i].y - hotspot.y;
      var bump = Math.exp(-(dx * dx + dy * dy) / (2 * spread * spread));
      weights.push(0.25 + (1 - params.skew) + 3.7 * params.skew * bump);
    }
    return normalize(weights);
  }

  function costMatrix(sources, targets) {
    var costs = [];
    var maxCost = 0;
    for (var i = 0; i < sources.length; i += 1) {
      var row = [];
      for (var j = 0; j < targets.length; j += 1) {
        var dx = sources[i].x - targets[j].x;
        var dy = sources[i].y - targets[j].y;
        var cost = dx * dx + dy * dy;
        row.push(cost);
        maxCost = Math.max(maxCost, cost);
      }
      costs.push(row);
    }
    return { costs: costs, maxCost: maxCost };
  }

  function makeKernel(costs, epsilon) {
    var kernel = [];
    for (var i = 0; i < costs.length; i += 1) {
      var row = [];
      for (var j = 0; j < costs[i].length; j += 1) {
        row.push(Math.exp(-costs[i][j] / Math.max(1e-6, epsilon)) + 1e-300);
      }
      kernel.push(row);
    }
    return kernel;
  }

  function matrixVector(matrix, vector) {
    var out = new Array(matrix.length).fill(0);
    for (var i = 0; i < matrix.length; i += 1) {
      var sum = 0;
      for (var j = 0; j < vector.length; j += 1) sum += matrix[i][j] * vector[j];
      out[i] = sum;
    }
    return out;
  }

  function transposeMatrixVector(matrix, vector) {
    var out = new Array(matrix[0].length).fill(0);
    for (var i = 0; i < matrix.length; i += 1) {
      for (var j = 0; j < matrix[i].length; j += 1) out[j] += matrix[i][j] * vector[i];
    }
    return out;
  }

  function marginalError(plan, a, b) {
    var rows = new Array(a.length).fill(0);
    var cols = new Array(b.length).fill(0);
    var i;
    var j;
    for (i = 0; i < plan.length; i += 1) {
      for (j = 0; j < plan[i].length; j += 1) {
        rows[i] += plan[i][j];
        cols[j] += plan[i][j];
      }
    }
    var rowL1 = 0;
    var colL1 = 0;
    var rowMax = 0;
    var colMax = 0;
    for (i = 0; i < a.length; i += 1) {
      rowL1 += Math.abs(rows[i] - a[i]);
      rowMax = Math.max(rowMax, Math.abs(rows[i] - a[i]));
    }
    for (j = 0; j < b.length; j += 1) {
      colL1 += Math.abs(cols[j] - b[j]);
      colMax = Math.max(colMax, Math.abs(cols[j] - b[j]));
    }
    return {
      colL1: colL1,
      colMax: colMax,
      cols: cols,
      rowL1: rowL1,
      rowMax: rowMax,
      rows: rows,
      totalL1: rowL1 + colL1
    };
  }

  function planFromScales(kernel, u, v) {
    var plan = [];
    for (var i = 0; i < kernel.length; i += 1) {
      var row = [];
      for (var j = 0; j < kernel[i].length; j += 1) row.push(u[i] * kernel[i][j] * v[j]);
      plan.push(row);
    }
    return plan;
  }

  function sinkhorn(a, b, costs, epsilon, iterations) {
    var kernel = makeKernel(costs, epsilon);
    var n = a.length;
    var u = new Array(n).fill(1);
    var v = new Array(n).fill(1);
    var trace = [];
    var checkpoints = {};
    var mark;
    for (mark = 0; mark <= 8; mark += 1) checkpoints[Math.round(mark * iterations / 8)] = true;

    function updateTrace(iteration) {
      var plan = planFromScales(kernel, u, v);
      var err = marginalError(plan, a, b);
      trace.push({ error: err.totalL1, iteration: iteration });
    }

    updateTrace(0);
    for (var iter = 1; iter <= iterations; iter += 1) {
      var kv = matrixVector(kernel, v);
      for (var i = 0; i < n; i += 1) u[i] = a[i] / Math.max(1e-300, kv[i]);
      var ktu = transposeMatrixVector(kernel, u);
      for (var j = 0; j < n; j += 1) v[j] = b[j] / Math.max(1e-300, ktu[j]);
      if (checkpoints[iter]) updateTrace(iter);
    }
    return {
      kernel: kernel,
      plan: planFromScales(kernel, u, v),
      trace: trace,
      u: u,
      v: v
    };
  }

  function independentCost(a, b, costs) {
    var total = 0;
    for (var i = 0; i < a.length; i += 1) {
      for (var j = 0; j < b.length; j += 1) total += a[i] * b[j] * costs[i][j];
    }
    return total;
  }

  function planStats(plan, costs, a) {
    var cost = 0;
    var entropy = 0;
    var maxEntry = 0;
    var rowConcentration = 0;
    var activeLinks = 0;
    var n = plan.length;
    for (var i = 0; i < n; i += 1) {
      var rowMax = 0;
      for (var j = 0; j < n; j += 1) {
        var p = plan[i][j];
        cost += p * costs[i][j];
        if (p > 0) entropy -= p * Math.log(p);
        maxEntry = Math.max(maxEntry, p);
        rowMax = Math.max(rowMax, p);
        if (p > 0.002) activeLinks += 1;
      }
      rowConcentration += rowMax / Math.max(1e-12, a[i]);
    }
    return {
      activeLinks: activeLinks,
      cost: cost,
      entropy: entropy,
      effectiveLinks: Math.exp(entropy),
      maxEntry: maxEntry,
      rowFocus: rowConcentration / n
    };
  }

  function computeCurve(a, b, costs, iterations) {
    var epsilons = [0.12, 0.14, 0.18, 0.24, 0.34, 0.52, 0.78, 1.0, 1.2];
    return epsilons.map(function (epsilon) {
      var result = sinkhorn(a, b, costs, epsilon, iterations);
      var stats = planStats(result.plan, costs, a);
      var err = marginalError(result.plan, a, b);
      return {
        cost: stats.cost,
        effectiveLinks: stats.effectiveLinks,
        epsilon: epsilon,
        error: err.totalL1,
        rowFocus: stats.rowFocus
      };
    });
  }

  function strongestLinks(plan, limit) {
    var links = [];
    for (var i = 0; i < plan.length; i += 1) {
      for (var j = 0; j < plan[i].length; j += 1) {
        links.push({ i: i, j: j, mass: plan[i][j] });
      }
    }
    links.sort(function (a, b) { return b.mass - a.mass; });
    return links.slice(0, limit || 120);
  }

  function evaluate(rawParams, options) {
    var params = cleanParams(rawParams);
    var points = makePoints(params);
    var a = makeWeights(points.sources, params, "source");
    var b = makeWeights(points.targets, params, "target");
    var costInfo = costMatrix(points.sources, points.targets);
    var result = sinkhorn(a, b, costInfo.costs, params.epsilon, params.iterations);
    var stats = planStats(result.plan, costInfo.costs, a);
    var err = marginalError(result.plan, a, b);
    return {
      a: a,
      b: b,
      costs: costInfo.costs,
      curve: options && options.curve === false ? [] : computeCurve(a, b, costInfo.costs, params.iterations),
      error: err,
      independentCost: independentCost(a, b, costInfo.costs),
      links: strongestLinks(result.plan),
      params: params,
      plan: result.plan,
      points: points,
      stats: stats,
      trace: result.trace,
      view: VIEW
    };
  }

  function readState(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var values = {
      epsilon: formatNumber(params.epsilon, 2),
      iterations: String(params.iterations),
      points: String(params.points),
      seed: String(params.seed),
      shift: Math.round(params.shift * 100) + "%",
      skew: Math.round(params.skew * 100) + "%"
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function updateMetrics(metrics, result) {
    metrics.innerHTML = [
      metric("transport cost", formatNumber(result.stats.cost, 3)),
      metric("vs independent", formatPercent(1 - result.stats.cost / Math.max(1e-12, result.independentCost), 1) + " lower"),
      metric("effective links", formatNumber(result.stats.effectiveLinks, 1)),
      metric("row focus", formatPercent(result.stats.rowFocus, 1)),
      metric("marginal L1", formatNumber(result.error.totalL1, 2)),
      metric("active links", String(result.stats.activeLinks))
    ].join("");
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 680 ? 980 : 660;
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

  function project(view, point, left, top, width, height) {
    return [
      left + (point.x - view.xMin) / (view.xMax - view.xMin) * width,
      top + (view.yMax - point.y) / (view.yMax - view.yMin) * height
    ];
  }

  function drawPlan(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "transport plan", "line opacity is shipped probability mass");
    var left = x + 24;
    var top = y + 58;
    var width = w - 48;
    var height = h - 84;
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(left, top, width, height);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, width, height);

    var maxMass = Math.max.apply(null, result.links.map(function (link) { return link.mass; }).concat([0.001]));
    result.links.slice().reverse().forEach(function (link) {
      var source = project(result.view, result.points.sources[link.i], left, top, width, height);
      var target = project(result.view, result.points.targets[link.j], left, top, width, height);
      var alpha = 0.04 + 0.52 * Math.sqrt(link.mass / maxMass);
      ctx.strokeStyle = "rgba(37,99,235," + alpha.toFixed(3) + ")";
      ctx.lineWidth = 0.7 + 3.8 * Math.sqrt(link.mass / maxMass);
      ctx.beginPath();
      ctx.moveTo(source[0], source[1]);
      ctx.lineTo(target[0], target[1]);
      ctx.stroke();
    });

    result.points.sources.forEach(function (point, i) {
      var p = project(result.view, point, left, top, width, height);
      ctx.fillStyle = COLORS.source;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4 + 20 * result.a[i], 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    result.points.targets.forEach(function (point, j) {
      var p = project(result.view, point, left, top, width, height);
      ctx.fillStyle = COLORS.target;
      ctx.beginPath();
      ctx.rect(p[0] - 4 - 18 * result.b[j], p[1] - 4 - 18 * result.b[j], 8 + 36 * result.b[j], 8 + 36 * result.b[j]);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  function heatColor(t) {
    return "rgba(180,83,9," + (0.08 + 0.82 * Math.sqrt(clamp(t, 0, 1))).toFixed(3) + ")";
  }

  function drawMatrix(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "coupling matrix", "each cell is mass sent from one source to one target");
    var n = result.params.points;
    var left = x + 46;
    var top = y + 58;
    var size = Math.min(w - 70, h - 92);
    var cell = size / n;
    var maxMass = 0;
    var i;
    var j;
    for (i = 0; i < n; i += 1) for (j = 0; j < n; j += 1) maxMass = Math.max(maxMass, result.plan[i][j]);
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(left, top, size, size);
    for (i = 0; i < n; i += 1) {
      for (j = 0; j < n; j += 1) {
        ctx.fillStyle = heatColor(result.plan[i][j] / Math.max(1e-12, maxMass));
        ctx.fillRect(left + j * cell, top + i * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, size, size);
    drawText(ctx, "targets", left + size / 2, top + size + 24, 10, COLORS.muted, 650, "center");
    ctx.save();
    ctx.translate(left - 22, top + size / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "sources", 0, 0, 10, COLORS.muted, 650, "center");
    ctx.restore();
  }

  function drawTrace(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "normalization trace", "alternate row and column scaling drives marginal error down");
    var left = x + 42;
    var right = x + w - 18;
    var top = y + 62;
    var bottom = y + h - 40;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    var maxError = Math.max.apply(null, result.trace.map(function (p) { return p.error; }).concat([1e-6]));
    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.trace.forEach(function (point, index) {
      var xx = left + (right - left) * point.iteration / Math.max(1, result.params.iterations);
      var yy = bottom - (bottom - top) * Math.log1p(point.error) / Math.log1p(maxError);
      if (index === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    drawText(ctx, "L1 error", left + 6, top + 14, 10, COLORS.bad, 750);
    drawText(ctx, "iterations", (left + right) / 2, y + h - 13, 10, COLORS.muted, 650, "center");
  }

  function drawCurve(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "epsilon tradeoff", "small epsilon is sharper; large epsilon is blurrier");
    var left = x + 44;
    var right = x + w - 18;
    var top = y + 62;
    var bottom = y + h - 40;
    var minCost = Math.min.apply(null, result.curve.map(function (p) { return p.cost; }));
    var maxCost = Math.max.apply(null, result.curve.map(function (p) { return p.cost; }));
    var maxLinks = Math.max.apply(null, result.curve.map(function (p) { return p.effectiveLinks; }));
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    function px(epsilon) {
      return left + (right - left) * (Math.log(epsilon) - Math.log(0.12)) / (Math.log(1.2) - Math.log(0.12));
    }

    function py01(value) {
      return bottom - (bottom - top) * clamp(value, 0, 1);
    }

    ctx.strokeStyle = COLORS.link;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.curve.forEach(function (point, index) {
      var scaled = 1 - (point.cost - minCost) / Math.max(1e-12, maxCost - minCost);
      var xx = px(point.epsilon);
      var yy = py01(scaled);
      if (index === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    ctx.strokeStyle = COLORS.heat;
    ctx.beginPath();
    result.curve.forEach(function (point, index) {
      var xx = px(point.epsilon);
      var yy = py01(point.effectiveLinks / Math.max(1e-12, maxLinks));
      if (index === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    var currentX = px(result.params.epsilon);
    ctx.strokeStyle = COLORS.gray;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(currentX, top);
    ctx.lineTo(currentX, bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    drawText(ctx, "low cost", left + 6, top + 14, 10, COLORS.link, 750);
    drawText(ctx, "many links", left + 6, top + 30, 10, COLORS.heat, 750);
    drawText(ctx, "epsilon", (left + right) / 2, y + h - 13, 10, COLORS.muted, 650, "center");
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
      var panelH = (height - 2 * pad - 3 * gap) / 4;
      drawPlan(ctx, result, pad, pad, width - 2 * pad, panelH);
      drawMatrix(ctx, result, pad, pad + panelH + gap, width - 2 * pad, panelH);
      drawTrace(ctx, result, pad, pad + 2 * (panelH + gap), width - 2 * pad, panelH);
      drawCurve(ctx, result, pad, pad + 3 * (panelH + gap), width - 2 * pad, panelH);
      return;
    }

    var halfW = (width - 2 * pad - gap) / 2;
    var halfH = (height - 2 * pad - gap) / 2;
    drawPlan(ctx, result, pad, pad, halfW, halfH);
    drawMatrix(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawTrace(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawCurve(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
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
        epsilon: params.epsilon * 100,
        iterations: params.iterations,
        points: params.points,
        seed: params.seed,
        shift: params.shift * 100,
        skew: params.skew * 100
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
    var labs = document.querySelectorAll("[data-sinkhorn-transport-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    costMatrix: costMatrix,
    evaluate: evaluate,
    makeKernel: makeKernel,
    makePoints: makePoints,
    marginalError: marginalError,
    planStats: planStats,
    sinkhorn: sinkhorn
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SinkhornTransportLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
