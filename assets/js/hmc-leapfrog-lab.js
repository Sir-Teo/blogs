(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    leapfrog: "#2563eb",
    euler: "#be123c",
    accept: "#0f766e",
    reject: "#b45309",
    sweep: "#7c3aed",
    contour: "#94a3b8"
  };

  var DEFAULTS = {
    epsilon: 18,
    mass: 100,
    proposals: 72,
    seed: 41,
    steps: 24,
    target: "gaussian"
  };

  var TARGETS = {
    banana: "banana posterior",
    funnel: "funnel neck",
    gaussian: "correlated Gaussian"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32(index + 1, seed) + 0.5) / 4294967297;
  }

  function gaussian(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 19, seed));
    var u2 = uniform(index * 2 + 20, seed);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var target = String(raw.target || DEFAULTS.target);
    if (!TARGETS[target]) target = DEFAULTS.target;
    return {
      epsilon: clamp(number(raw, "epsilon"), 4, 80) / 100,
      mass: clamp(number(raw, "mass"), 35, 220) / 100,
      proposals: clamp(Math.round(number(raw, "proposals")), 24, 144),
      seed: clamp(Math.round(number(raw, "seed")), 1, 9999),
      steps: clamp(Math.round(number(raw, "steps")), 4, 72),
      target: target
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (digits != null) return value.toFixed(digits);
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="hmc-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
  }

  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1]];
  }

  function scale(a, s) {
    return [a[0] * s, a[1] * s];
  }

  function norm(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  }

  function potential(target, q) {
    var x = q[0];
    var y = q[1];
    if (target === "banana") {
      var sx = 1.35;
      var sy = 0.55;
      var bend = 0.23;
      var r = y - bend * (x * x - sx * sx);
      return 0.5 * (x / sx) * (x / sx) + 0.5 * (r / sy) * (r / sy);
    }
    if (target === "funnel") {
      var s = 2.4;
      var ev = Math.exp(clamp(y, -8, 8));
      return 0.5 * (y / s) * (y / s) + 0.5 * x * x / ev + 0.5 * y;
    }
    var rho = 0.94;
    var inv = 1 / (1 - rho * rho);
    return 0.5 * inv * (x * x - 2 * rho * x * y + y * y);
  }

  function gradPotential(target, q) {
    var x = q[0];
    var y = q[1];
    if (target === "banana") {
      var sx = 1.35;
      var sy = 0.55;
      var bend = 0.23;
      var r = y - bend * (x * x - sx * sx);
      return [
        x / (sx * sx) - 2 * bend * x * r / (sy * sy),
        r / (sy * sy)
      ];
    }
    if (target === "funnel") {
      var s = 2.4;
      var ev = Math.exp(clamp(y, -8, 8));
      return [
        x / ev,
        y / (s * s) - 0.5 * x * x / ev + 0.5
      ];
    }
    var rho = 0.94;
    var inv = 1 / (1 - rho * rho);
    return [inv * (x - rho * y), inv * (y - rho * x)];
  }

  function kinetic(p, mass) {
    return 0.5 * (p[0] * p[0] + p[1] * p[1]) / mass;
  }

  function hamiltonian(target, q, p, mass) {
    return potential(target, q) + kinetic(p, mass);
  }

  function sampleQ(target, seed) {
    var z1 = gaussian(1, seed);
    var z2 = gaussian(2, seed);
    if (target === "banana") {
      var sx = 1.35;
      var sy = 0.55;
      var bend = 0.23;
      var x = sx * z1;
      return [x, sy * z2 + bend * (x * x - sx * sx)];
    }
    if (target === "funnel") {
      var y = 2.4 * z1;
      var xScale = Math.exp(clamp(y, -6, 6) / 2);
      return [xScale * z2, y];
    }
    var rho = 0.94;
    return [z1, rho * z1 + Math.sqrt(1 - rho * rho) * z2];
  }

  function sampleP(seed, mass) {
    var s = Math.sqrt(mass);
    return [s * gaussian(11, seed), s * gaussian(12, seed)];
  }

  function leapfrog(target, q0, p0, epsilon, steps, mass, keepPath) {
    var q = q0.slice();
    var p = p0.slice();
    var path = keepPath ? [{ q: q.slice(), p: p.slice(), h: hamiltonian(target, q, p, mass) }] : null;
    var g = gradPotential(target, q);
    p = sub(p, scale(g, 0.5 * epsilon));
    for (var i = 0; i < steps; i += 1) {
      q = add(q, scale(p, epsilon / mass));
      if (i !== steps - 1) {
        g = gradPotential(target, q);
        p = sub(p, scale(g, epsilon));
      }
      if (keepPath) path.push({ q: q.slice(), p: p.slice(), h: hamiltonian(target, q, p, mass) });
    }
    g = gradPotential(target, q);
    p = sub(p, scale(g, 0.5 * epsilon));
    if (keepPath) path[path.length - 1] = { q: q.slice(), p: p.slice(), h: hamiltonian(target, q, p, mass) };
    return { q: q, p: p, path: path };
  }

  function forwardEuler(target, q0, p0, epsilon, steps, mass) {
    var q = q0.slice();
    var p = p0.slice();
    var path = [{ q: q.slice(), p: p.slice(), h: hamiltonian(target, q, p, mass) }];
    for (var i = 0; i < steps; i += 1) {
      var oldQ = q.slice();
      var oldP = p.slice();
      q = add(oldQ, scale(oldP, epsilon / mass));
      p = sub(oldP, scale(gradPotential(target, oldQ), epsilon));
      path.push({ q: q.slice(), p: p.slice(), h: hamiltonian(target, q, p, mass) });
    }
    return { q: q, p: p, path: path };
  }

  function proposal(params, index, epsilonOverride) {
    var eps = epsilonOverride == null ? params.epsilon : epsilonOverride;
    var q0 = sampleQ(params.target, params.seed + 1009 * index + 31);
    var p0 = sampleP(params.seed + 1297 * index + 79, params.mass);
    var h0 = hamiltonian(params.target, q0, p0, params.mass);
    var lf = leapfrog(params.target, q0, p0, eps, params.steps, params.mass, false);
    var h1 = hamiltonian(params.target, lf.q, lf.p, params.mass);
    var dH = h1 - h0;
    var acceptProb = Number.isFinite(dH) ? Math.min(1, Math.exp(-dH)) : 0;
    var distance = norm(sub(lf.q, q0));
    var divergent = !Number.isFinite(dH) || !Number.isFinite(distance) || Math.abs(dH) > 10 || norm(lf.q) > 1e4;
    return {
      acceptProb: acceptProb,
      dH: dH,
      divergent: divergent,
      distance: Number.isFinite(distance) ? distance : 0,
      q0: q0,
      q1: lf.q
    };
  }

  function summarizeProposals(params, epsilonOverride) {
    var rows = [];
    var accept = 0;
    var jump = 0;
    var maxAbsDH = 0;
    var divergences = 0;
    for (var i = 0; i < params.proposals; i += 1) {
      var row = proposal(params, i, epsilonOverride);
      rows.push(row);
      accept += row.acceptProb;
      if (Number.isFinite(row.acceptProb) && Number.isFinite(row.distance)) jump += row.acceptProb * row.distance;
      if (Number.isFinite(row.dH)) maxAbsDH = Math.max(maxAbsDH, Math.abs(row.dH));
      if (row.divergent) divergences += 1;
    }
    return {
      acceptRate: accept / params.proposals,
      divergences: divergences,
      expectedJump: jump / params.proposals,
      maxAbsDH: maxAbsDH,
      rows: rows
    };
  }

  function energyPath(params) {
    var q0 = sampleQ(params.target, params.seed + 17);
    var p0 = sampleP(params.seed + 23, params.mass);
    var h0 = hamiltonian(params.target, q0, p0, params.mass);
    var lf = leapfrog(params.target, q0, p0, params.epsilon, params.steps, params.mass, true);
    var eu = forwardEuler(params.target, q0, p0, params.epsilon, params.steps, params.mass);
    var reverse = leapfrog(params.target, lf.q, scale(lf.p, -1), params.epsilon, params.steps, params.mass, false);
    var revErr = norm(sub(reverse.q, q0)) + norm(add(reverse.p, p0));
    return {
      euler: eu.path.map(function (row, i) { return { step: i, dH: row.h - h0, q: row.q }; }),
      h0: h0,
      leapfrog: lf.path.map(function (row, i) { return { step: i, dH: row.h - h0, q: row.q }; }),
      q0: q0,
      p0: p0,
      reverseError: revErr
    };
  }

  function sweep(params) {
    var values = [];
    var eps = [0.04, 0.06, 0.08, 0.11, 0.14, 0.18, 0.24, 0.32, 0.44, 0.58, 0.72, 0.84];
    for (var i = 0; i < eps.length; i += 1) {
      var p = {
        epsilon: params.epsilon,
        mass: params.mass,
        proposals: Math.min(params.proposals, 56),
        seed: params.seed + 50000,
        steps: params.steps,
        target: params.target
      };
      var summary = summarizeProposals(p, eps[i]);
      values.push({
        acceptRate: summary.acceptRate,
        divergences: summary.divergences,
        epsilon: eps[i],
        jump: summary.expectedJump
      });
    }
    return values;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var path = energyPath(params);
    var summary = summarizeProposals(params);
    var sweepRows = sweep(params);
    return {
      checks: {
        acceptanceFinite: Number.isFinite(summary.acceptRate),
        energyFinite: path.leapfrog.every(function (row) { return Number.isFinite(row.dH); }),
        reversible: Number.isFinite(path.reverseError),
        summaryFinite: Number.isFinite(summary.expectedJump),
        targetFinite: Number.isFinite(potential(params.target, path.q0))
      },
      params: params,
      path: path,
      summary: summary,
      sweep: sweepRows
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(root, params) {
    var values = {
      epsilon: formatNumber(params.epsilon, 2),
      mass: formatNumber(params.mass, 2),
      proposals: String(params.proposals),
      seed: String(params.seed),
      steps: String(params.steps),
      target: TARGETS[params.target]
    };
    Object.keys(values).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (node) {
        node.textContent = values[key];
      });
    });
  }

  function updateControls(root, params) {
    var values = {
      epsilon: Math.round(params.epsilon * 100),
      mass: Math.round(params.mass * 100),
      proposals: params.proposals,
      seed: params.seed,
      steps: params.steps,
      target: params.target
    };
    Object.keys(values).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && String(input.value) !== String(values[key])) input.value = values[key];
    });
  }

  function updateMetrics(root, result) {
    var checksPassed = Object.keys(result.checks).every(function (key) { return result.checks[key]; });
    var html = [
      metric("Acceptance", formatPercent(result.summary.acceptRate, 0)),
      metric("Expected jump", formatNumber(result.summary.expectedJump, 2)),
      metric("Max |dH|", result.summary.maxAbsDH > 50 ? ">50" : formatNumber(result.summary.maxAbsDH, 2)),
      metric("Divergences", String(result.summary.divergences)),
      metric("Reverse error", formatNumber(result.path.reverseError, 3)),
      metric("Checks", checksPassed ? "passed" : "inspect")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function setupCanvas(canvas, cssHeight) {
    var width = Math.max(320, Math.round(canvas.getBoundingClientRect().width || canvas.clientWidth || 900));
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, cssHeight);
    return { ctx: ctx, height: cssHeight, width: width };
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

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(text), x, y);
    ctx.textAlign = "left";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 24, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 43, 11, COLORS.muted, 560);
  }

  function ranges(target) {
    if (target === "banana") return { x0: -4, x1: 4, y0: -2.6, y1: 5.2 };
    if (target === "funnel") return { x0: -7, x1: 7, y0: -6, y1: 6 };
    return { x0: -3.2, x1: 3.2, y0: -3.2, y1: 3.2 };
  }

  function project(q, plot, range) {
    return [
      plot.x + (q[0] - range.x0) / (range.x1 - range.x0) * plot.w,
      plot.y + plot.h - (q[1] - range.y0) / (range.y1 - range.y0) * plot.h
    ];
  }

  function drawTargetPanel(ctx, result, box) {
    panel(ctx, box, "proposal trajectory", "density is darker where potential energy is lower");
    var range = ranges(result.params.target);
    var plot = { x: box.x + 34, y: box.y + 56, w: box.w - 58, h: box.h - 92 };
    var cells = 56;
    var values = [];
    var minU = Infinity;
    for (var iy = 0; iy < cells; iy += 1) {
      for (var ix = 0; ix < cells; ix += 1) {
        var q = [
          range.x0 + (ix + 0.5) / cells * (range.x1 - range.x0),
          range.y0 + (iy + 0.5) / cells * (range.y1 - range.y0)
        ];
        var u = potential(result.params.target, q);
        values.push(u);
        minU = Math.min(minU, u);
      }
    }
    var cellW = plot.w / cells;
    var cellH = plot.h / cells;
    values.forEach(function (u, index) {
      var ix = index % cells;
      var iy = Math.floor(index / cells);
      var density = Math.exp(-clamp(u - minU, 0, 9));
      ctx.fillStyle = "rgba(37,99,235," + (0.05 + 0.38 * density).toFixed(3) + ")";
      ctx.fillRect(plot.x + ix * cellW, plot.y + (cells - 1 - iy) * cellH, Math.ceil(cellW), Math.ceil(cellH));
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    var path = result.path.leapfrog.map(function (row) { return row.q; });
    ctx.strokeStyle = COLORS.leapfrog;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    path.forEach(function (q, index) {
      var p = project(q, plot, range);
      if (index === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.stroke();
    var start = project(path[0], plot, range);
    var end = project(path[path.length - 1], plot, range);
    ctx.fillStyle = COLORS.accept;
    ctx.beginPath();
    ctx.arc(start[0], start[1], 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.reject;
    ctx.beginPath();
    ctx.arc(end[0], end[1], 4, 0, Math.PI * 2);
    ctx.fill();
    drawText(ctx, "start", start[0] + 6, start[1] - 6, 10, COLORS.accept, 760);
    drawText(ctx, "proposal", end[0] + 6, end[1] - 6, 10, COLORS.reject, 760);
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    ctx.strokeStyle = COLORS.grid;
    for (var i = 1; i < 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawEnergySeries(ctx, rows, plot, maxAbs, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = plot.x + row.step / Math.max(1, rows.length - 1) * plot.w;
      var y = plot.y + plot.h / 2 - row.dH / maxAbs * plot.h / 2;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawEnergyPanel(ctx, result, box) {
    panel(ctx, box, "energy error during integration", "leapfrog oscillates; forward Euler tends to drift");
    var plot = { x: box.x + 42, y: box.y + 62, w: box.w - 66, h: box.h - 102 };
    var all = result.path.leapfrog.concat(result.path.euler).map(function (row) { return Math.abs(row.dH); });
    var maxAbs = Math.max(0.01, Math.min(50, Math.max.apply(null, all) * 1.15));
    drawAxis(ctx, plot);
    var zeroY = plot.y + plot.h / 2;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, zeroY);
    ctx.lineTo(plot.x + plot.w, zeroY);
    ctx.stroke();
    drawEnergySeries(ctx, result.path.euler, plot, maxAbs, COLORS.euler, 1.8);
    drawEnergySeries(ctx, result.path.leapfrog, plot, maxAbs, COLORS.leapfrog, 2.4);
    drawText(ctx, "leapfrog", plot.x + 8, plot.y + 16, 10, COLORS.leapfrog, 760);
    drawText(ctx, "Euler", plot.x + 75, plot.y + 16, 10, COLORS.euler, 760);
    drawText(ctx, "+" + formatNumber(maxAbs, 2), plot.x - 6, plot.y + 4, 10, COLORS.muted, 650, "right");
    drawText(ctx, "-" + formatNumber(maxAbs, 2), plot.x - 6, plot.y + plot.h + 4, 10, COLORS.muted, 650, "right");
  }

  function drawProposalPanel(ctx, result, box) {
    panel(ctx, box, "Metropolis audit", "energy error determines expected acceptance");
    var rows = result.summary.rows;
    var plot = { x: box.x + 46, y: box.y + 66, w: box.w - 74, h: box.h - 112 };
    var maxAbs = Math.max(1, Math.min(15, rows.reduce(function (m, row) {
      return Math.max(m, Number.isFinite(row.dH) ? Math.abs(row.dH) : 15);
    }, 0) * 1.15));
    ctx.strokeStyle = COLORS.grid;
    for (var g = -2; g <= 2; g += 1) {
      var x = plot.x + (g / 2 * maxAbs + maxAbs) / (2 * maxAbs) * plot.w;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    var zeroX = plot.x + plot.w / 2;
    ctx.strokeStyle = COLORS.accept;
    ctx.beginPath();
    ctx.moveTo(zeroX, plot.y - 4);
    ctx.lineTo(zeroX, plot.y + plot.h + 4);
    ctx.stroke();
    rows.forEach(function (row, index) {
      var clipped = clamp(Number.isFinite(row.dH) ? row.dH : maxAbs, -maxAbs, maxAbs);
      var x = plot.x + (clipped + maxAbs) / (2 * maxAbs) * plot.w;
      var y = plot.y + plot.h * (index + 0.5) / rows.length;
      ctx.fillStyle = row.divergent ? COLORS.euler : (row.dH <= 0 ? COLORS.accept : COLORS.reject);
      ctx.globalAlpha = 0.58;
      ctx.beginPath();
      ctx.arc(x, y, 2.1 + 2.2 * row.acceptProb, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawText(ctx, "negative dH accepts", plot.x, box.y + box.h - 36, 10, COLORS.accept, 760);
    drawText(ctx, "positive dH is discounted", plot.x + 130, box.y + box.h - 36, 10, COLORS.reject, 760);
    drawText(ctx, "-" + formatNumber(maxAbs, 1), plot.x, box.y + box.h - 18, 10, COLORS.muted, 650);
    drawText(ctx, "+" + formatNumber(maxAbs, 1), plot.x + plot.w, box.y + box.h - 18, 10, COLORS.muted, 650, "right");
  }

  function drawSweepPanel(ctx, result, box) {
    panel(ctx, box, "step-size sweep", "large steps can travel farther until energy error breaks acceptance");
    var rows = result.sweep;
    var plot = { x: box.x + 42, y: box.y + 62, w: box.w - 66, h: box.h - 108 };
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.sweep;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = plot.x + index / Math.max(1, rows.length - 1) * plot.w;
      var y = plot.y + plot.h - row.acceptRate * plot.h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    rows.forEach(function (row, index) {
      var x = plot.x + index / Math.max(1, rows.length - 1) * plot.w;
      var y = plot.y + plot.h - row.acceptRate * plot.h;
      ctx.fillStyle = Math.abs(row.epsilon - result.params.epsilon) < 0.015 ? COLORS.leapfrog : COLORS.sweep;
      ctx.beginPath();
      ctx.arc(x, y, Math.abs(row.epsilon - result.params.epsilon) < 0.015 ? 4 : 2.7, 0, Math.PI * 2);
      ctx.fill();
      if (row.divergences > 0) {
        ctx.strokeStyle = COLORS.euler;
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 4);
        ctx.lineTo(x + 4, y + 4);
        ctx.moveTo(x + 4, y - 4);
        ctx.lineTo(x - 4, y + 4);
        ctx.stroke();
      }
      if (index % 2 === 0) drawText(ctx, formatNumber(row.epsilon, 2), x, plot.y + plot.h + 18, 9, COLORS.muted, 600, "center");
    });
    drawText(ctx, "acceptance", plot.x + 8, plot.y + 16, 10, COLORS.sweep, 760);
    drawText(ctx, "red x = divergence", plot.x + 88, plot.y + 16, 10, COLORS.euler, 760);
  }

  function draw(result, canvas) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var compact = width < 650;
    var prepared = setupCanvas(canvas, compact ? 1100 : 760);
    var ctx = prepared.ctx;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = prepared.width - 2 * pad;
    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawTargetPanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawEnergyPanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawProposalPanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawSweepPanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }
    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawTargetPanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawEnergyPanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawProposalPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawSweepPanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function renderOne(root) {
    var result = evaluate(readParams(root));
    updateControls(root, result.params);
    updateOutputs(root, result.params);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__hmcResult = result;
  }

  function initOne(root) {
    if (root.__hmcReady) return;
    root.__hmcReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { renderOne(root); }, 70);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__hmcResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__hmcResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__hmcResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__hmcResult, canvas);
        }
      });
    }
    renderOne(root);
  }

  function init() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-hmc-leapfrog-lab]")).forEach(initOne);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    gradPotential: gradPotential,
    leapfrog: leapfrog,
    potential: potential
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.HmcLeapfrogLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
