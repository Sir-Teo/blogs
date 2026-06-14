(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    random: "#be123c",
    jitter: "#b45309",
    best: "#7c3aed",
    poisson: "#0f766e",
    blue: "#2563eb",
    teal: "#0f766e",
    amber: "#b45309",
    red: "#be123c",
    purple: "#7c3aed"
  };

  var DEFAULTS = {
    pattern: "poisson",
    samples: 180,
    radius: 54,
    candidates: 30,
    seed: 37
  };

  var PATTERNS = {
    random: { label: "uniform random", color: COLORS.random },
    jitter: { label: "jittered grid", color: COLORS.jitter },
    best: { label: "best candidate", color: COLORS.best },
    poisson: { label: "Bridson Poisson disk", color: COLORS.poisson }
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
    var pattern = String(raw.pattern || DEFAULTS.pattern);
    if (!PATTERNS[pattern]) pattern = DEFAULTS.pattern;
    return {
      pattern: pattern,
      samples: clamp(Math.round(number(raw, "samples")), 48, 420),
      radius: clamp(Math.round(number(raw, "radius")), 18, 74),
      candidates: clamp(Math.round(number(raw, "candidates")), 4, 48),
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
      if (key === "radius") node.textContent = params.radius + " / 1000";
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

  function metric(label, value) {
    return '<div class="blue-noise-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function point(x, y) {
    return { x: x, y: y };
  }

  function dist2(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var pos = clamp(q, 0, 1) * (sorted.length - 1);
    var lo = Math.floor(pos);
    var hi = Math.ceil(pos);
    var t = pos - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  function mean(values) {
    if (!values.length) return 0;
    var total = 0;
    values.forEach(function (value) { total += value; });
    return total / values.length;
  }

  function generateRandom(params) {
    var rng = makeRng(params.seed);
    var points = [];
    for (var i = 0; i < params.samples; i += 1) points.push(point(rng(), rng()));
    return {
      points: points,
      stats: { attempts: params.samples, candidateChecks: 0, rejected: 0, activePeak: 0, saturated: false }
    };
  }

  function shuffle(values, rng) {
    for (var i = values.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = values[i];
      values[i] = values[j];
      values[j] = tmp;
    }
    return values;
  }

  function generateJitter(params) {
    var rng = makeRng(params.seed);
    var side = Math.ceil(Math.sqrt(params.samples));
    var cells = [];
    var x;
    var y;
    for (y = 0; y < side; y += 1) {
      for (x = 0; x < side; x += 1) cells.push([x, y]);
    }
    shuffle(cells, rng);
    var points = [];
    for (var i = 0; i < params.samples; i += 1) {
      var cell = cells[i % cells.length];
      points.push(point((cell[0] + rng()) / side, (cell[1] + rng()) / side));
    }
    return {
      points: points,
      stats: { attempts: params.samples, candidateChecks: 0, rejected: 0, activePeak: 0, saturated: false, strata: side * side }
    };
  }

  function nearestDistance2(candidate, points, stats) {
    var best = Infinity;
    for (var i = 0; i < points.length; i += 1) {
      stats.candidateChecks += 1;
      var d2 = dist2(candidate, points[i]);
      if (d2 < best) best = d2;
    }
    return best;
  }

  function generateBestCandidate(params) {
    var rng = makeRng(params.seed);
    var points = [point(rng(), rng())];
    var stats = { attempts: 1, candidateChecks: 0, rejected: 0, activePeak: 0, saturated: false };
    while (points.length < params.samples) {
      var bestPoint = null;
      var bestD2 = -1;
      for (var k = 0; k < params.candidates; k += 1) {
        var candidate = point(rng(), rng());
        stats.attempts += 1;
        var d2 = nearestDistance2(candidate, points, stats);
        if (d2 > bestD2) {
          bestD2 = d2;
          bestPoint = candidate;
        }
      }
      points.push(bestPoint);
    }
    return { points: points, stats: stats };
  }

  function generatePoisson(params) {
    var rng = makeRng(params.seed);
    var radius = params.radius / 1000;
    var radius2 = radius * radius;
    var cell = radius / Math.SQRT2;
    var cols = Math.ceil(1 / cell);
    var rows = Math.ceil(1 / cell);
    var grid = new Array(cols * rows);
    var points = [];
    var active = [];
    var stats = { attempts: 0, candidateChecks: 0, rejected: 0, activePeak: 1, saturated: false };

    function gridIndex(x, y) {
      return y * cols + x;
    }

    function cellFor(value) {
      return clamp(Math.floor(value / cell), 0, cols - 1);
    }

    function insert(sample) {
      var index = points.length;
      points.push(sample);
      active.push(index);
      grid[gridIndex(cellFor(sample.x), cellFor(sample.y))] = index;
      if (active.length > stats.activePeak) stats.activePeak = active.length;
    }

    function isFarEnough(candidate) {
      var gx = cellFor(candidate.x);
      var gy = cellFor(candidate.y);
      for (var yy = Math.max(0, gy - 2); yy <= Math.min(rows - 1, gy + 2); yy += 1) {
        for (var xx = Math.max(0, gx - 2); xx <= Math.min(cols - 1, gx + 2); xx += 1) {
          var index = grid[gridIndex(xx, yy)];
          if (index == null) continue;
          stats.candidateChecks += 1;
          if (dist2(candidate, points[index]) < radius2) return false;
        }
      }
      return true;
    }

    insert(point(rng(), rng()));
    while (active.length) {
      var activeSlot = Math.floor(rng() * active.length);
      var base = points[active[activeSlot]];
      var accepted = false;
      for (var k = 0; k < params.candidates; k += 1) {
        stats.attempts += 1;
        var angle = rng() * Math.PI * 2;
        var annulusRadius = Math.sqrt(radius2 + rng() * (4 * radius2 - radius2));
        var candidate = point(base.x + Math.cos(angle) * annulusRadius, base.y + Math.sin(angle) * annulusRadius);
        if (candidate.x < 0 || candidate.x > 1 || candidate.y < 0 || candidate.y > 1) {
          stats.rejected += 1;
          continue;
        }
        if (isFarEnough(candidate)) {
          insert(candidate);
          accepted = true;
          break;
        }
        stats.rejected += 1;
      }
      if (!accepted) active.splice(activeSlot, 1);
    }

    stats.poolSize = points.length;
    stats.saturated = points.length < params.samples;
    stats.trimmed = points.length > params.samples;
    if (points.length > params.samples) {
      var indices = [];
      for (var i = 0; i < points.length; i += 1) indices.push(i);
      shuffle(indices, rng);
      var subset = [];
      for (var j = 0; j < params.samples; j += 1) subset.push(points[indices[j]]);
      points = subset;
    }
    return { points: points, stats: stats };
  }

  function nearestSummary(points) {
    if (points.length < 2) {
      return { values: [], min: 0, mean: 0, p10: 0, p50: 0, p90: 0 };
    }
    var nearest = new Array(points.length);
    for (var i = 0; i < points.length; i += 1) nearest[i] = Infinity;
    for (var a = 0; a < points.length; a += 1) {
      for (var b = a + 1; b < points.length; b += 1) {
        var d = Math.sqrt(dist2(points[a], points[b]));
        if (d < nearest[a]) nearest[a] = d;
        if (d < nearest[b]) nearest[b] = d;
      }
    }
    return {
      values: nearest,
      min: Math.min.apply(null, nearest),
      mean: mean(nearest),
      p10: quantile(nearest, 0.1),
      p50: quantile(nearest, 0.5),
      p90: quantile(nearest, 0.9)
    };
  }

  function radialSpectrum(points, maxFreq) {
    maxFreq = maxFreq || 18;
    var bins = [];
    var all = [];
    for (var i = 0; i <= maxFreq; i += 1) bins.push({ radius: i, raw: 0, count: 0, power: 0 });
    if (!points.length) return { bins: bins.slice(1), lowPower: 0, peakPower: 0, peakRadius: 0, meanRaw: 0 };

    for (var fy = -maxFreq; fy <= maxFreq; fy += 1) {
      for (var fx = -maxFreq; fx <= maxFreq; fx += 1) {
        if (fx === 0 && fy === 0) continue;
        var radius = Math.sqrt(fx * fx + fy * fy);
        var bin = Math.round(radius);
        if (bin < 1 || bin > maxFreq) continue;
        var re = 0;
        var im = 0;
        for (var p = 0; p < points.length; p += 1) {
          var angle = -2 * Math.PI * (fx * points[p].x + fy * points[p].y);
          re += Math.cos(angle);
          im += Math.sin(angle);
        }
        var power = (re * re + im * im) / points.length;
        bins[bin].raw += power;
        bins[bin].count += 1;
        all.push(power);
      }
    }

    var meanRaw = mean(all) || 1;
    var lowNumer = 0;
    var lowDenom = 0;
    var peakPower = 0;
    var peakRadius = 0;
    for (var b = 1; b <= maxFreq; b += 1) {
      if (bins[b].count) bins[b].power = (bins[b].raw / bins[b].count) / meanRaw;
      if (b <= 4) {
        lowNumer += bins[b].power * bins[b].count;
        lowDenom += bins[b].count;
      }
      if (b >= 5 && b <= maxFreq - 1 && bins[b].power > peakPower) {
        peakPower = bins[b].power;
        peakRadius = b;
      }
    }

    return {
      bins: bins.slice(1),
      lowPower: lowDenom ? lowNumer / lowDenom : 0,
      peakPower: peakPower,
      peakRadius: peakRadius,
      meanRaw: meanRaw
    };
  }

  function coverageSummary(points) {
    var side = 48;
    var cells = [];
    var distances = [];
    for (var y = 0; y < side; y += 1) {
      for (var x = 0; x < side; x += 1) {
        var sample = point((x + 0.5) / side, (y + 0.5) / side);
        var best = Infinity;
        for (var i = 0; i < points.length; i += 1) {
          var d2 = dist2(sample, points[i]);
          if (d2 < best) best = d2;
        }
        var distance = points.length ? Math.sqrt(best) : 0;
        cells.push(distance);
        distances.push(distance);
      }
    }
    return {
      side: side,
      cells: cells,
      mean: mean(distances),
      p95: quantile(distances, 0.95),
      max: Math.max.apply(null, distances)
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var generated;
    if (params.pattern === "random") generated = generateRandom(params);
    else if (params.pattern === "jitter") generated = generateJitter(params);
    else if (params.pattern === "best") generated = generateBestCandidate(params);
    else generated = generatePoisson(params);

    var nearest = nearestSummary(generated.points);
    var spectrum = radialSpectrum(generated.points, 18);
    var coverage = coverageSummary(generated.points);
    var radius = params.radius / 1000;
    var finitePoints = generated.points.every(function (p) {
      return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    });
    var spectrumFinite = spectrum.bins.every(function (bin) { return Number.isFinite(bin.power); });
    var minDistanceHolds = params.pattern !== "poisson" || nearest.min + 1e-10 >= radius || generated.points.length < 2;

    return {
      params: params,
      label: PATTERNS[params.pattern].label,
      color: PATTERNS[params.pattern].color,
      points: generated.points,
      stats: generated.stats,
      nearest: nearest,
      spectrum: spectrum,
      coverage: coverage,
      checks: {
        finitePoints: finitePoints,
        countPositive: generated.points.length > 0,
        minDistanceHolds: minDistanceHolds,
        spectrumFinite: spectrumFinite
      }
    };
  }

  function updateMetrics(root, result) {
    var node = root.querySelector("[data-metrics]");
    if (!node) return;
    var status = result.checks.finitePoints && result.checks.countPositive && result.checks.minDistanceHolds && result.checks.spectrumFinite ? "pass" : "check";
    var count = String(result.points.length);
    if (result.stats.trimmed && result.stats.poolSize) count += " from " + result.stats.poolSize;
    if (result.stats.saturated) count += " packed";
    node.innerHTML = [
      metric("Points emitted", count),
      metric("Minimum gap", formatNumber(result.nearest.min * 1000, 1) + " / 1000"),
      metric("Mean nearest", formatNumber(result.nearest.mean * 1000, 1) + " / 1000"),
      metric("Low-frequency power", formatNumber(result.spectrum.lowPower, 2) + "x"),
      metric("Void p95", formatNumber(result.coverage.p95 * 1000, 1) + " / 1000"),
      metric("Audit", status)
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

  function plotSquare(box, top) {
    var pad = 18;
    var availableW = box.w - 2 * pad;
    var availableH = box.h - top - pad;
    var side = Math.min(availableW, availableH);
    return {
      x: box.x + (box.w - side) / 2,
      y: box.y + top + (availableH - side) / 2,
      size: side
    };
  }

  function drawPointPanel(ctx, result, box) {
    panel(ctx, box, "point pattern", result.label + " in the unit square");
    var plot = plotSquare(box, 58);
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.fillRect(plot.x, plot.y, plot.size, plot.size);
    ctx.strokeRect(plot.x, plot.y, plot.size, plot.size);

    var gridStep = plot.size / 4;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.8;
    for (var g = 1; g < 4; g += 1) {
      ctx.beginPath();
      ctx.moveTo(plot.x + g * gridStep, plot.y);
      ctx.lineTo(plot.x + g * gridStep, plot.y + plot.size);
      ctx.moveTo(plot.x, plot.y + g * gridStep);
      ctx.lineTo(plot.x + plot.size, plot.y + g * gridStep);
      ctx.stroke();
    }

    if (result.params.pattern === "poisson") {
      ctx.strokeStyle = result.color;
      ctx.globalAlpha = 0.13;
      var exclusion = result.params.radius / 1000 * plot.size / 2;
      result.points.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(plot.x + p.x * plot.size, plot.y + p.y * plot.size, exclusion, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = result.color;
    result.points.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(plot.x + p.x * plot.size, plot.y + p.y * plot.size, Math.max(1.7, Math.min(3.4, 520 / result.points.length)), 0, Math.PI * 2);
      ctx.fill();
    });
    drawText(ctx, "n = " + result.points.length + "   min gap = " + formatNumber(result.nearest.min * 1000, 1), plot.x, plot.y + plot.size + 18, 10, COLORS.muted, 650);
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

  function drawGapPanel(ctx, result, box) {
    panel(ctx, box, "nearest-neighbor gaps", "clumps live in the left tail");
    var plot = { x: box.x + 44, y: box.y + 65, w: box.w - 66, h: box.h - 108 };
    drawAxis(ctx, plot);
    var maxX = Math.max(0.09, result.params.radius / 1000 * 2.25, result.nearest.p90 * 1.35);
    var bins = 22;
    var counts = new Array(bins);
    for (var i = 0; i < bins; i += 1) counts[i] = 0;
    result.nearest.values.forEach(function (d) {
      var index = clamp(Math.floor(d / maxX * bins), 0, bins - 1);
      counts[index] += 1;
    });
    var maxCount = Math.max.apply(null, counts) || 1;
    var barW = plot.w / bins;
    for (var b = 0; b < bins; b += 1) {
      var h = counts[b] / maxCount * plot.h;
      ctx.fillStyle = result.color;
      ctx.globalAlpha = 0.68;
      ctx.fillRect(plot.x + b * barW + 1, plot.y + plot.h - h, Math.max(1, barW - 2), h);
    }
    ctx.globalAlpha = 1;

    var radiusX = plot.x + clamp((result.params.radius / 1000) / maxX, 0, 1) * plot.w;
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(radiusX, plot.y);
    ctx.lineTo(radiusX, plot.y + plot.h);
    ctx.stroke();
    drawText(ctx, "r", radiusX + 4, plot.y + 13, 10, COLORS.red, 760);
    drawText(ctx, "0", plot.x, plot.y + plot.h + 18, 10, COLORS.muted, 650);
    drawText(ctx, formatNumber(maxX * 1000, 0), plot.x + plot.w, plot.y + plot.h + 18, 10, COLORS.muted, 650, "right");
    drawText(ctx, "gap per 1000 units", plot.x + plot.w / 2, plot.y + plot.h + 36, 10, COLORS.muted, 650, "center");
  }

  function drawSpectrumPanel(ctx, result, box) {
    panel(ctx, box, "radial spectrum", "blue noise suppresses low frequencies");
    var plot = { x: box.x + 44, y: box.y + 65, w: box.w - 66, h: box.h - 108 };
    drawAxis(ctx, plot);
    var maxPower = Math.max.apply(null, result.spectrum.bins.map(function (bin) { return bin.power; }));
    var yMax = Math.max(2.2, maxPower * 1.15);

    ctx.fillStyle = "#e0f2fe";
    ctx.globalAlpha = 0.65;
    ctx.fillRect(plot.x, plot.y, plot.w * 4 / result.spectrum.bins.length, plot.h);
    ctx.globalAlpha = 1;

    var baseY = plot.y + plot.h - clamp(1 / yMax, 0, 1) * plot.h;
    ctx.strokeStyle = COLORS.muted;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, baseY);
    ctx.lineTo(plot.x + plot.w, baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = result.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    result.spectrum.bins.forEach(function (bin, index) {
      var x = plot.x + index / Math.max(1, result.spectrum.bins.length - 1) * plot.w;
      var y = plot.y + plot.h - clamp(bin.power / yMax, 0, 1) * plot.h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    result.spectrum.bins.forEach(function (bin, index) {
      var x = plot.x + index / Math.max(1, result.spectrum.bins.length - 1) * plot.w;
      var y = plot.y + plot.h - clamp(bin.power / yMax, 0, 1) * plot.h;
      ctx.fillStyle = result.color;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    drawText(ctx, "low = " + formatNumber(result.spectrum.lowPower, 2) + "x", plot.x + 8, plot.y + 15, 10, COLORS.blue, 760);
    drawText(ctx, "white baseline", plot.x + plot.w - 8, baseY - 6, 10, COLORS.muted, 650, "right");
    drawText(ctx, "frequency radius", plot.x + plot.w / 2, plot.y + plot.h + 35, 10, COLORS.muted, 650, "center");
  }

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function mix(a, b, t) {
    var ca = hexToRgb(a);
    var cb = hexToRgb(b);
    return "rgb(" +
      Math.round(ca.r + (cb.r - ca.r) * t) + "," +
      Math.round(ca.g + (cb.g - ca.g) * t) + "," +
      Math.round(ca.b + (cb.b - ca.b) * t) + ")";
  }

  function heatColor(t) {
    t = clamp(t, 0, 1);
    if (t < 0.5) return mix("#e0f2fe", "#fde68a", t / 0.5);
    return mix("#fde68a", "#be123c", (t - 0.5) / 0.5);
  }

  function drawVoidPanel(ctx, result, box) {
    panel(ctx, box, "void map", "warm islands are places no sample owns well");
    var plot = plotSquare(box, 58);
    var side = result.coverage.side;
    var cell = plot.size / side;
    var scale = Math.max(result.coverage.p95, 1e-6);
    for (var y = 0; y < side; y += 1) {
      for (var x = 0; x < side; x += 1) {
        var distance = result.coverage.cells[y * side + x];
        ctx.fillStyle = heatColor(distance / scale);
        ctx.fillRect(plot.x + x * cell, plot.y + y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.size, plot.size);
    ctx.fillStyle = COLORS.text;
    ctx.globalAlpha = 0.62;
    result.points.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(plot.x + p.x * plot.size, plot.y + p.y * plot.size, 1.3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawText(ctx, "p95 void radius = " + formatNumber(result.coverage.p95 * 1000, 1), plot.x, plot.y + plot.size + 18, 10, COLORS.muted, 650);
  }

  function draw(result, canvas) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var compact = width < 650;
    var prepared = setupCanvas(canvas, compact ? 1120 : 760);
    var ctx = prepared.ctx;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = prepared.width - 2 * pad;

    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawPointPanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawGapPanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawSpectrumPanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawVoidPanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }

    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawPointPanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawGapPanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawSpectrumPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawVoidPanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function renderOne(root) {
    var result = evaluate(readParams(root));
    updateControls(root, result.params);
    updateOutputs(root, result.params);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__blueNoiseResult = result;
  }

  function initOne(root) {
    if (root.__blueNoiseReady) return;
    root.__blueNoiseReady = true;
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
        if (root.__blueNoiseResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__blueNoiseResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__blueNoiseResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__blueNoiseResult, canvas);
        }
      });
    }
    renderOne(root);
  }

  function init() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-blue-noise-lab]")).forEach(initOne);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    generateBestCandidate: generateBestCandidate,
    generateJitter: generateJitter,
    generatePoisson: generatePoisson,
    generateRandom: generateRandom,
    radialSpectrum: radialSpectrum
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.BlueNoiseLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
