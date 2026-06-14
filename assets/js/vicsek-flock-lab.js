(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    order: "#0f766e",
    disorder: "#be123c",
    sweep: "#2563eb",
    band: "#b45309",
    trail: "#93c5fd",
    particle: "#172026",
    faint: "#eef6ff"
  };

  var DEFAULTS = {
    particles: 180,
    noise: 28,
    radius: 80,
    speed: 12,
    steps: 150,
    seed: 31
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function makeRng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      particles: clamp(Math.round(number(raw, "particles")), 48, 320),
      noise: clamp(Math.round(number(raw, "noise")), 0, 100),
      radius: clamp(Math.round(number(raw, "radius")), 35, 150),
      speed: clamp(Math.round(number(raw, "speed")), 4, 28),
      steps: clamp(Math.round(number(raw, "steps")), 30, 240),
      seed: clamp(Math.round(number(raw, "seed")), 1, 9999)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateControls(root, params) {
    Object.keys(params).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && String(input.value) !== String(params[key])) input.value = params[key];
    });
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-output]").forEach(function (node) {
      var key = node.getAttribute("data-output");
      if (key === "noise") node.textContent = params.noise + "%";
      else if (key === "radius") node.textContent = params.radius + " / 1000";
      else if (key === "speed") node.textContent = params.speed + " / 1000";
      else node.textContent = String(params[key]);
    });
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (digits != null) return value.toFixed(digits);
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
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
    return '<div class="vicsek-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function wrap(value) {
    value = value % 1;
    return value < 0 ? value + 1 : value;
  }

  function torusDelta(a, b) {
    var d = a - b;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return d;
  }

  function makeParticles(n, seed) {
    var rng = makeRng(seed);
    var particles = [];
    for (var i = 0; i < n; i += 1) {
      particles.push({
        x: rng(),
        y: rng(),
        a: rng() * Math.PI * 2
      });
    }
    return particles;
  }

  function cloneParticles(particles) {
    return particles.map(function (p) {
      return { x: p.x, y: p.y, a: p.a };
    });
  }

  function orderParameter(particles) {
    var sx = 0;
    var sy = 0;
    particles.forEach(function (p) {
      sx += Math.cos(p.a);
      sy += Math.sin(p.a);
    });
    return Math.sqrt(sx * sx + sy * sy) / Math.max(1, particles.length);
  }

  function neighborCounts(particles, radius) {
    var r2 = radius * radius;
    var counts = new Array(particles.length);
    var i;
    for (i = 0; i < counts.length; i += 1) counts[i] = 1;
    for (i = 0; i < particles.length; i += 1) {
      for (var j = i + 1; j < particles.length; j += 1) {
        var dx = torusDelta(particles[i].x, particles[j].x);
        var dy = torusDelta(particles[i].y, particles[j].y);
        if (dx * dx + dy * dy <= r2) {
          counts[i] += 1;
          counts[j] += 1;
        }
      }
    }
    return counts;
  }

  function stepParticles(particles, radius, speed, eta, rng) {
    var n = particles.length;
    var r2 = radius * radius;
    var sumX = new Array(n);
    var sumY = new Array(n);
    var counts = new Array(n);
    var i;
    for (i = 0; i < n; i += 1) {
      sumX[i] = Math.cos(particles[i].a);
      sumY[i] = Math.sin(particles[i].a);
      counts[i] = 1;
    }

    for (i = 0; i < n; i += 1) {
      for (var j = i + 1; j < n; j += 1) {
        var dx = torusDelta(particles[i].x, particles[j].x);
        var dy = torusDelta(particles[i].y, particles[j].y);
        if (dx * dx + dy * dy <= r2) {
          var c1 = Math.cos(particles[j].a);
          var s1 = Math.sin(particles[j].a);
          var c2 = Math.cos(particles[i].a);
          var s2 = Math.sin(particles[i].a);
          sumX[i] += c1;
          sumY[i] += s1;
          sumX[j] += c2;
          sumY[j] += s2;
          counts[i] += 1;
          counts[j] += 1;
        }
      }
    }

    for (i = 0; i < n; i += 1) {
      var a = Math.atan2(sumY[i], sumX[i]) + (rng() - 0.5) * eta;
      particles[i].a = a;
    }
    for (i = 0; i < n; i += 1) {
      particles[i].x = wrap(particles[i].x + speed * Math.cos(particles[i].a));
      particles[i].y = wrap(particles[i].y + speed * Math.sin(particles[i].a));
    }
    return counts;
  }

  function densityStats(particles) {
    var side = 12;
    var cells = new Array(side * side);
    var i;
    for (i = 0; i < cells.length; i += 1) cells[i] = 0;
    particles.forEach(function (p) {
      var x = clamp(Math.floor(p.x * side), 0, side - 1);
      var y = clamp(Math.floor(p.y * side), 0, side - 1);
      cells[y * side + x] += 1;
    });
    var mean = particles.length / cells.length;
    var variance = 0;
    var max = 0;
    cells.forEach(function (v) {
      var d = v - mean;
      variance += d * d;
      if (v > max) max = v;
    });
    variance /= cells.length;
    return {
      side: side,
      cells: cells,
      mean: mean,
      max: max,
      fano: mean > 0 ? variance / mean : 0,
      maxShare: particles.length ? max / particles.length : 0
    };
  }

  function clusterStats(particles, radius) {
    var n = particles.length;
    var r2 = radius * radius;
    var seen = new Array(n);
    var adj = [];
    var i;
    for (i = 0; i < n; i += 1) {
      seen[i] = false;
      adj.push([]);
    }
    for (i = 0; i < n; i += 1) {
      for (var j = i + 1; j < n; j += 1) {
        var dx = torusDelta(particles[i].x, particles[j].x);
        var dy = torusDelta(particles[i].y, particles[j].y);
        if (dx * dx + dy * dy <= r2) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }
    var components = 0;
    var largest = 0;
    for (i = 0; i < n; i += 1) {
      if (seen[i]) continue;
      components += 1;
      var queue = [i];
      seen[i] = true;
      var size = 0;
      while (queue.length) {
        var node = queue.pop();
        size += 1;
        adj[node].forEach(function (next) {
          if (!seen[next]) {
            seen[next] = true;
            queue.push(next);
          }
        });
      }
      if (size > largest) largest = size;
    }
    return {
      components: components,
      largest: largest,
      largestShare: n ? largest / n : 0
    };
  }

  function simulate(params, overrides) {
    overrides = overrides || {};
    var n = overrides.particles || params.particles;
    var eta = (overrides.noise == null ? params.noise : overrides.noise) / 100 * Math.PI * 2;
    var radius = (overrides.radius == null ? params.radius : overrides.radius) / 1000;
    var speed = (overrides.speed == null ? params.speed : overrides.speed) / 1000;
    var steps = overrides.steps || params.steps;
    var seed = overrides.seed || params.seed;
    var rng = makeRng(seed + 1009);
    var particles = makeParticles(n, seed);
    var history = [{ step: 0, order: orderParameter(particles) }];
    var snapshots = [];
    var trailEvery = Math.max(1, Math.floor(steps / 8));
    var counts = neighborCounts(particles, radius);

    for (var step = 1; step <= steps; step += 1) {
      counts = stepParticles(particles, radius, speed, eta, rng);
      var order = orderParameter(particles);
      history.push({ step: step, order: order });
      if (step % trailEvery === 0 || step === steps) snapshots.push(cloneParticles(particles));
    }

    var meanNeighbors = counts.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, counts.length);
    var density = densityStats(particles);
    var clusters = clusterStats(particles, radius);
    return {
      particles: particles,
      history: history,
      snapshots: snapshots.slice(-8),
      order: history[history.length - 1].order,
      meanOrder: history.slice(Math.max(0, history.length - 25)).reduce(function (a, row) { return a + row.order; }, 0) / Math.min(25, history.length),
      meanNeighbors: meanNeighbors,
      density: density,
      clusters: clusters,
      eta: eta,
      radius: radius,
      speed: speed
    };
  }

  function sweepNoise(params) {
    var rows = [];
    var n = Math.min(params.particles, 96);
    var steps = Math.min(params.steps, 100);
    var reps = 3;
    for (var noise = 0; noise <= 100; noise += 10) {
      var order = 0;
      var fano = 0;
      var largestShare = 0;
      for (var rep = 0; rep < reps; rep += 1) {
        var run = simulate(params, {
          particles: n,
          steps: steps,
          noise: noise,
          seed: params.seed + 5000 + noise * 17 + rep * 1009
        });
        order += run.meanOrder;
        fano += run.density.fano;
        largestShare += run.clusters.largestShare;
      }
      rows.push({
        noise: noise,
        order: order / reps,
        fano: fano / reps,
        largestShare: largestShare / reps
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var run = simulate(params);
    var sweep = sweepNoise(params);
    var phase = run.meanOrder > 0.72 ? "ordered" : (run.meanOrder < 0.28 ? "disordered" : "crossover");
    var finite = Number.isFinite(run.order) && Number.isFinite(run.density.fano) && Number.isFinite(run.clusters.largestShare);
    var bounded = run.order >= -1e-9 && run.order <= 1 + 1e-9 && run.clusters.largestShare >= 0 && run.clusters.largestShare <= 1;
    return {
      params: params,
      run: run,
      sweep: sweep,
      phase: phase,
      checks: {
        finite: finite,
        bounded: bounded,
        particleCount: run.particles.length === params.particles,
        sweepCount: sweep.length === 11
      }
    };
  }

  function updateMetrics(root, result) {
    var node = root.querySelector("[data-metrics]");
    if (!node) return;
    var audit = result.checks.finite && result.checks.bounded && result.checks.particleCount && result.checks.sweepCount ? "pass" : "check";
    node.innerHTML = [
      metric("Order parameter", formatNumber(result.run.meanOrder, 3)),
      metric("Phase readout", result.phase),
      metric("Mean neighbors", formatNumber(result.run.meanNeighbors, 1)),
      metric("Largest cluster", formatPercent(result.run.clusters.largestShare, 0)),
      metric("Density Fano", formatNumber(result.run.density.fano, 2)),
      metric("Audit", audit)
    ].join("");
  }

  function setupCanvas(canvas, height) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var dpr = clamp(global.devicePixelRatio || 1, 1, 2);
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function roundedRect(ctx, x, y, w, h, r) {
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

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 16, box.y + 27, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, box.x + 16, box.y + 45, 10, COLORS.muted, 600);
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

  function drawFlockPanel(ctx, result, box) {
    panel(ctx, box, "particles on a torus", "local alignment plus angular noise");
    var pad = 18;
    var top = 58;
    var size = Math.min(box.w - 2 * pad, box.h - top - pad);
    var x0 = box.x + (box.w - size) / 2;
    var y0 = box.y + top + (box.h - top - pad - size) / 2;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x0, y0, size, size);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.8;
    for (var g = 1; g < 4; g += 1) {
      ctx.beginPath();
      ctx.moveTo(x0 + g * size / 4, y0);
      ctx.lineTo(x0 + g * size / 4, y0 + size);
      ctx.moveTo(x0, y0 + g * size / 4);
      ctx.lineTo(x0 + size, y0 + g * size / 4);
      ctx.stroke();
    }

    result.run.snapshots.forEach(function (snapshot, index) {
      ctx.globalAlpha = 0.08 + 0.06 * index;
      ctx.fillStyle = COLORS.trail;
      snapshot.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(x0 + p.x * size, y0 + p.y * size, 1.4, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.globalAlpha = 1;

    result.run.particles.forEach(function (p) {
      var x = x0 + p.x * size;
      var y = y0 + p.y * size;
      var len = clamp(5 + result.params.speed * 0.6, 6, 18);
      ctx.strokeStyle = result.run.meanOrder > 0.55 ? COLORS.order : COLORS.particle;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(p.a) * len * 0.35, y - Math.sin(p.a) * len * 0.35);
      ctx.lineTo(x + Math.cos(p.a) * len, y + Math.sin(p.a) * len);
      ctx.stroke();
      ctx.fillStyle = COLORS.particle;
      ctx.beginPath();
      ctx.arc(x, y, 1.7, 0, Math.PI * 2);
      ctx.fill();
    });
    drawText(ctx, "phi = " + formatNumber(result.run.meanOrder, 3), x0, y0 + size + 18, 10, COLORS.order, 760);
  }

  function drawHistoryPanel(ctx, result, box) {
    panel(ctx, box, "order over time", "average heading length is the order parameter");
    var plot = { x: box.x + 44, y: box.y + 66, w: box.w - 70, h: box.h - 108 };
    drawAxis(ctx, plot);
    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h - g / 4 * plot.h;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.order;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    result.run.history.forEach(function (row, index) {
      var x = plot.x + row.step / result.params.steps * plot.w;
      var y = plot.y + plot.h - row.order * plot.h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var final = result.run.history[result.run.history.length - 1];
    ctx.fillStyle = COLORS.order;
    ctx.beginPath();
    ctx.arc(plot.x + plot.w, plot.y + plot.h - final.order * plot.h, 4, 0, Math.PI * 2);
    ctx.fill();
    drawText(ctx, "0", plot.x - 8, plot.y + plot.h + 4, 10, COLORS.muted, 650, "right");
    drawText(ctx, "1", plot.x - 8, plot.y + 4, 10, COLORS.muted, 650, "right");
    drawText(ctx, "steps", plot.x + plot.w, plot.y + plot.h + 18, 10, COLORS.muted, 650, "right");
  }

  function drawSweepPanel(ctx, result, box) {
    panel(ctx, box, "noise sweep", "three seeded runs at each noise level");
    var plot = { x: box.x + 44, y: box.y + 66, w: box.w - 70, h: box.h - 108 };
    drawAxis(ctx, plot);
    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + plot.h - g / 4 * plot.h;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }
    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = key === "order" ? 2.4 : 1.8;
      ctx.beginPath();
      result.sweep.forEach(function (row, index) {
        var x = plot.x + row.noise / 100 * plot.w;
        var value = key === "fano" ? clamp(row.fano / 3.5, 0, 1) : row[key];
        var y = plot.y + plot.h - value * plot.h;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    line("order", COLORS.sweep);
    line("largestShare", COLORS.order);
    line("fano", COLORS.band);
    var currentX = plot.x + result.params.noise / 100 * plot.w;
    ctx.strokeStyle = COLORS.muted;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(currentX, plot.y);
    ctx.lineTo(currentX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "order", plot.x + 8, plot.y + 15, 10, COLORS.sweep, 760);
    drawText(ctx, "largest cluster", plot.x + 54, plot.y + 15, 10, COLORS.order, 760);
    drawText(ctx, "density Fano", plot.x + 140, plot.y + 15, 10, COLORS.band, 760);
    drawText(ctx, "0% noise", plot.x, plot.y + plot.h + 18, 10, COLORS.muted, 650);
    drawText(ctx, "100%", plot.x + plot.w, plot.y + plot.h + 18, 10, COLORS.muted, 650, "right");
  }

  function heatColor(t) {
    t = clamp(t, 0, 1);
    if (t < 0.5) {
      var a = t / 0.5;
      return "rgb(" + Math.round(238 + (253 - 238) * a) + "," + Math.round(246 + (230 - 246) * a) + "," + Math.round(255 + (138 - 255) * a) + ")";
    }
    var b = (t - 0.5) / 0.5;
    return "rgb(" + Math.round(253 + (190 - 253) * b) + "," + Math.round(230 + (18 - 230) * b) + "," + Math.round(138 + (60 - 138) * b) + ")";
  }

  function drawDensityPanel(ctx, result, box) {
    panel(ctx, box, "density map", "alignment can travel with clustering and bands");
    var side = result.run.density.side;
    var pad = 18;
    var top = 58;
    var size = Math.min(box.w - 2 * pad, box.h - top - pad - 26);
    var x0 = box.x + (box.w - size) / 2;
    var y0 = box.y + top + (box.h - top - pad - 26 - size) / 2;
    var max = Math.max(1, result.run.density.max);
    for (var y = 0; y < side; y += 1) {
      for (var x = 0; x < side; x += 1) {
        var count = result.run.density.cells[y * side + x];
        ctx.fillStyle = heatColor(count / max);
        ctx.fillRect(x0 + x * size / side, y0 + y * size / side, Math.ceil(size / side), Math.ceil(size / side));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x0, y0, size, size);
    result.run.particles.forEach(function (p) {
      ctx.fillStyle = COLORS.text;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(x0 + p.x * size, y0 + p.y * size, 1.1, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawText(ctx, "Fano = " + formatNumber(result.run.density.fano, 2), x0, y0 + size + 18, 10, COLORS.band, 760);
    drawText(ctx, "largest cluster = " + formatPercent(result.run.clusters.largestShare, 0), x0 + size, y0 + size + 18, 10, COLORS.order, 760, "right");
  }

  function draw(result, canvas) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var compact = width < 560;
    var prepared = setupCanvas(canvas, compact ? 1120 : 760);
    var ctx = prepared.ctx;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = prepared.width - 2 * pad;

    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawFlockPanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawHistoryPanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawSweepPanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawDensityPanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }

    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawFlockPanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawHistoryPanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawSweepPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawDensityPanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function renderOne(root) {
    var result = evaluate(readParams(root));
    updateControls(root, result.params);
    updateOutputs(root, result.params);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__vicsekResult = result;
  }

  function initOne(root) {
    if (root.__vicsekReady) return;
    root.__vicsekReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { renderOne(root); }, 90);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__vicsekResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__vicsekResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__vicsekResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__vicsekResult, canvas);
        }
      });
    }
    renderOne(root);
  }

  function init() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-vicsek-flock-lab]")).forEach(initOne);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    orderParameter: orderParameter,
    simulate: simulate,
    sweepNoise: sweepNoise
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.VicsekFlockLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
