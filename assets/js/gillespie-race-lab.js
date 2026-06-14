(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    truth: "#0f766e",
    estimate: "#2563eb",
    sample: "#94a3b8",
    race: "#b45309",
    birth: "#15803d",
    death: "#be123c",
    purple: "#7c3aed"
  };

  var DEFAULTS = {
    birth: 72,
    death: 18,
    horizon: 12,
    paths: 140,
    seed: 29,
    volume: 80
  };

  var GRID_STEPS = 120;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rng(seed) {
    var state = seed >>> 0;
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
      birth: clamp(number(raw, "birth"), 20, 150) / 100,
      death: clamp(number(raw, "death"), 6, 32) / 100,
      horizon: clamp(Math.round(number(raw, "horizon")), 4, 20),
      paths: clamp(Math.round(number(raw, "paths")), 40, 220),
      seed: clamp(Math.round(number(raw, "seed")), 1, 9999),
      volume: clamp(Math.round(number(raw, "volume")), 20, 180)
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
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="gillespie-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function meanCountAt(params, t, volume) {
    var v = volume == null ? params.volume : volume;
    return params.birth * v / params.death * (1 - Math.exp(-params.death * t));
  }

  function simulatePath(params, seed) {
    var rand = rng(seed);
    var horizon = params.horizon;
    var grid = new Array(GRID_STEPS + 1);
    var eventTimes = [];
    var eventStates = [];
    var t = 0;
    var n = 0;
    var events = 0;
    var birthEvents = 0;
    var deathEvents = 0;
    var nextGrid = 0;

    function fillGrid(untilT) {
      while (nextGrid <= GRID_STEPS && nextGrid / GRID_STEPS * horizon <= untilT + 1e-12) {
        grid[nextGrid] = n;
        nextGrid += 1;
      }
    }

    fillGrid(0);
    while (t < horizon) {
      var birthProp = params.birth * params.volume;
      var deathProp = params.death * n;
      var total = birthProp + deathProp;
      if (total <= 0) {
        fillGrid(horizon);
        break;
      }
      var u1 = Math.max(1e-12, rand());
      var tau = -Math.log(u1) / total;
      var nextT = t + tau;
      fillGrid(Math.min(nextT, horizon));
      if (nextT > horizon) break;
      var u2 = rand() * total;
      t = nextT;
      if (u2 < birthProp) {
        n += 1;
        birthEvents += 1;
      } else if (n > 0) {
        n -= 1;
        deathEvents += 1;
      }
      events += 1;
      if (eventTimes.length < 900) {
        eventTimes.push(t);
        eventStates.push(n);
      }
    }
    fillGrid(horizon);

    return {
      birthEvents: birthEvents,
      deathEvents: deathEvents,
      events: events,
      eventStates: eventStates,
      eventTimes: eventTimes,
      final: grid[GRID_STEPS],
      grid: grid
    };
  }

  function variance(values, mean) {
    if (values.length < 2) return 0;
    var sum = 0;
    values.forEach(function (value) {
      var d = value - mean;
      sum += d * d;
    });
    return sum / (values.length - 1);
  }

  function ensemble(params, paths, volume, salt) {
    var local = Object.assign({}, params, { volume: volume == null ? params.volume : volume });
    var finals = [];
    var grids = [];
    var samplePaths = [];
    var totalEvents = 0;
    for (var i = 0; i < paths; i += 1) {
      var path = simulatePath(local, hash32(params.seed * 1009 + i * 9176 + (salt || 0), 0x51f15eed));
      finals.push(path.final);
      grids.push(path.grid);
      totalEvents += path.events;
      if (samplePaths.length < 12) samplePaths.push(path.grid);
    }
    var meanFinal = finals.reduce(function (sum, value) { return sum + value; }, 0) / finals.length;
    var varFinal = variance(finals, meanFinal);
    var meanGrid = [];
    for (var g = 0; g <= GRID_STEPS; g += 1) {
      var s = 0;
      for (i = 0; i < grids.length; i += 1) s += grids[i][g];
      meanGrid.push(s / grids.length);
    }
    return {
      avgEvents: totalEvents / paths,
      finals: finals,
      fano: varFinal / Math.max(1e-9, meanFinal),
      meanFinal: meanFinal,
      meanGrid: meanGrid,
      samplePaths: samplePaths,
      varFinal: varFinal,
      volume: local.volume
    };
  }

  function raceSnapshot(params, selected) {
    var idx = Math.round(GRID_STEPS * 0.55);
    var n = selected.grid[idx];
    var t = params.horizon * idx / GRID_STEPS;
    var birthProp = params.birth * params.volume;
    var deathProp = params.death * n;
    var total = birthProp + deathProp;
    var rand = rng(hash32(params.seed * 313 + n * 17, 0xdecafbad));
    var tau = total > 0 ? -Math.log(Math.max(1e-12, rand())) / total : Infinity;
    return {
      birthProp: birthProp,
      deathProp: deathProp,
      nextBirthProb: total > 0 ? birthProp / total : 0,
      n: n,
      t: t,
      tau: tau,
      total: total
    };
  }

  function poissonPmf(k, lambda) {
    if (k < 0) return 0;
    if (lambda <= 0) return k === 0 ? 1 : 0;
    if (lambda > 80) {
      var sd = Math.sqrt(lambda);
      var z = (k + 0.5 - lambda) / sd;
      return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
    }
    var logFact = 0;
    for (var i = 2; i <= k; i += 1) logFact += Math.log(i);
    return Math.exp(-lambda + k * Math.log(lambda) - logFact);
  }

  function histogram(values, binCount) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (min === max) {
      min = Math.max(0, min - 1);
      max += 1;
    }
    var width = Math.max(1, Math.ceil((max - min + 1) / binCount));
    var lo = Math.max(0, Math.floor(min / width) * width);
    var hi = Math.ceil((max + 1) / width) * width;
    var bins = [];
    for (var start = lo; start < hi; start += width) {
      bins.push({ count: 0, end: start + width, start: start });
    }
    values.forEach(function (value) {
      var idx = clamp(Math.floor((value - lo) / width), 0, bins.length - 1);
      bins[idx].count += 1;
    });
    return bins;
  }

  function volumeLadder(params) {
    var raw = [
      Math.round(params.volume / 4),
      Math.round(params.volume / 2),
      params.volume,
      Math.round(params.volume * 2)
    ];
    var seen = {};
    return raw.map(function (value) {
      return clamp(value, 12, 360);
    }).filter(function (value) {
      if (seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var main = ensemble(params, params.paths, params.volume, 0x1001);
    var selected = simulatePath(params, hash32(params.seed * 1009 + 0xabc, 0x45d9f3b));
    var theoryMean = meanCountAt(params, params.horizon, params.volume);
    var ladderPaths = Math.min(70, params.paths);
    var ladder = volumeLadder(params).map(function (volume, idx) {
      var ens = ensemble(params, ladderPaths, volume, 0x2002 + idx * 101);
      var lambda = meanCountAt(params, params.horizon, volume);
      return {
        empiricalCv: Math.sqrt(ens.varFinal) / Math.max(1e-9, ens.meanFinal),
        empiricalMeanConc: ens.meanFinal / volume,
        mean: ens.meanFinal,
        theoryCv: 1 / Math.sqrt(Math.max(1e-9, lambda)),
        theoryMeanConc: lambda / volume,
        volume: volume
      };
    });
    var race = raceSnapshot(params, selected);
    var fanoError = Math.abs(main.fano - 1);
    var fanoTolerance = Math.max(0.32, 4 * Math.sqrt(2 / Math.max(1, params.paths - 1)));
    var meanError = Math.abs(main.meanFinal - theoryMean) / Math.max(1, Math.sqrt(theoryMean / params.paths) * params.paths);
    return {
      checks: {
        fanoNearOne: fanoError < fanoTolerance,
        meanFinite: Number.isFinite(main.meanFinal) && main.meanFinal >= 0,
        raceProbability: race.nextBirthProb >= 0 && race.nextBirthProb <= 1,
        theoryMeanPositive: theoryMean > 0,
        volumeNoiseOrders: ladder.length >= 3 && ladder[0].theoryCv > ladder[ladder.length - 1].theoryCv
      },
      histogram: histogram(main.finals, 26),
      ladder: ladder,
      main: main,
      params: params,
      race: race,
      selected: selected,
      theoryMean: theoryMean,
      theoryMeanGrid: Array.from({ length: GRID_STEPS + 1 }, function (_, i) {
        return meanCountAt(params, params.horizon * i / GRID_STEPS, params.volume);
      })
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
      birth: formatNumber(params.birth, 2),
      death: formatNumber(params.death, 2),
      horizon: String(params.horizon),
      paths: String(params.paths),
      seed: String(params.seed),
      volume: String(params.volume)
    };
    Object.keys(values).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (node) {
        node.textContent = values[key];
      });
    });
  }

  function updateControls(root, params) {
    var values = {
      birth: Math.round(params.birth * 100),
      death: Math.round(params.death * 100),
      horizon: params.horizon,
      paths: params.paths,
      seed: params.seed,
      volume: params.volume
    };
    Object.keys(values).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && String(input.value) !== String(values[key])) input.value = values[key];
    });
  }

  function updateMetrics(root, result) {
    var checksPassed = Object.keys(result.checks).every(function (key) { return result.checks[key]; });
    var html = [
      metric("Mean final", formatNumber(result.main.meanFinal)),
      metric("Poisson mean", formatNumber(result.theoryMean)),
      metric("Fano factor", formatNumber(result.main.fano, 2)),
      metric("Avg events", formatNumber(result.main.avgEvents)),
      metric("Next birth", formatPercent(result.race.nextBirthProb, 0)),
      metric("Checks", checksPassed ? "passed" : "inspect")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function setupCanvas(canvas, cssHeight) {
    var width = Math.max(320, Math.round(canvas.getBoundingClientRect().width || canvas.clientWidth || 900));
    var height = cssHeight;
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
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
      var yy = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }
  }

  function drawLine(ctx, values, xScale, yScale, color, width, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    values.forEach(function (value, i) {
      var x = xScale(i);
      var y = yScale(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawPaths(ctx, result, box) {
    panel(ctx, box, "exact jump paths", "thin paths are SSA samples; blue is the ensemble mean");
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 64, h: box.h - 94 };
    var max = Math.max.apply(null, result.theoryMeanGrid.concat(result.main.meanGrid));
    result.main.samplePaths.forEach(function (path) {
      max = Math.max(max, Math.max.apply(null, path));
    });
    max = Math.max(1, max * 1.08);
    function xScale(i) { return plot.x + i / GRID_STEPS * plot.w; }
    function yScale(v) { return plot.y + plot.h - v / max * plot.h; }
    drawAxis(ctx, plot);
    result.main.samplePaths.forEach(function (path) {
      drawLine(ctx, path, xScale, yScale, COLORS.sample, 1.1, 0.42);
    });
    drawLine(ctx, result.theoryMeanGrid, xScale, yScale, COLORS.truth, 2.2, 1);
    drawLine(ctx, result.main.meanGrid, xScale, yScale, COLORS.estimate, 2.4, 1);
    drawText(ctx, "ODE mean", plot.x + 6, plot.y + 16, 10, COLORS.truth, 760);
    drawText(ctx, "SSA mean", plot.x + 76, plot.y + 16, 10, COLORS.estimate, 760);
    drawText(ctx, "t", plot.x + plot.w, box.y + box.h - 18, 10, COLORS.muted, 650, "right");
    drawText(ctx, formatNumber(max), plot.x - 6, plot.y + 4, 10, COLORS.muted, 650, "right");
  }

  function drawRace(ctx, result, box) {
    panel(ctx, box, "the next reaction is a race", "propensities are exponential clocks");
    var r = result.race;
    var left = box.x + 24;
    var top = box.y + 64;
    var w = box.w - 48;
    var barH = 24;
    var max = Math.max(1, r.birthProp, r.deathProp);
    [
      { label: "birth clock", value: r.birthProp, color: COLORS.birth },
      { label: "death clock", value: r.deathProp, color: COLORS.death }
    ].forEach(function (row, i) {
      var y = top + i * 48;
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(left + 94, y, w - 114, barH);
      ctx.fillStyle = row.color;
      ctx.fillRect(left + 94, y, (w - 114) * row.value / max, barH);
      drawText(ctx, row.label, left, y + 17, 11, COLORS.muted, 650);
      drawText(ctx, formatNumber(row.value), left + w, y + 17, 11, COLORS.text, 700, "right");
    });

    var y0 = top + 120;
    drawText(ctx, "state n = " + r.n + " at t = " + formatNumber(r.t, 2), left, y0, 12, COLORS.text, 760);
    drawText(ctx, "total rate a0 = " + formatNumber(r.total), left, y0 + 24, 12, COLORS.muted, 600);
    drawText(ctx, "sampled wait = " + formatNumber(r.tau, 3), left, y0 + 48, 12, COLORS.race, 760);
    drawText(ctx, "Pr(next is birth) = " + formatPercent(r.nextBirthProb, 1), left, y0 + 72, 12, COLORS.birth, 760);
  }

  function drawHistogram(ctx, result, box) {
    panel(ctx, box, "final count distribution", "histogram should sit near the Poisson law");
    var bins = result.histogram;
    var plot = { x: box.x + 42, y: box.y + 60, w: box.w - 64, h: box.h - 96 };
    var maxCount = Math.max.apply(null, bins.map(function (bin) { return bin.count; }).concat([1]));
    var lambda = result.theoryMean;
    var binW = plot.w / bins.length;
    drawAxis(ctx, plot);
    bins.forEach(function (bin, i) {
      var h = plot.h * bin.count / maxCount;
      ctx.fillStyle = "rgba(37,99,235,0.58)";
      ctx.fillRect(plot.x + i * binW + 1, plot.y + plot.h - h, Math.max(1, binW - 2), h);
    });
    ctx.strokeStyle = COLORS.death;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    bins.forEach(function (bin, i) {
      var mass = 0;
      for (var k = bin.start; k < bin.end; k += 1) mass += poissonPmf(k, lambda);
      var expected = mass * result.params.paths;
      var x = plot.x + (i + 0.5) * binW;
      var y = plot.y + plot.h - expected / maxCount * plot.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    drawText(ctx, "Poisson theory", plot.x + 8, plot.y + 16, 10, COLORS.death, 760);
    drawText(ctx, "count", plot.x + plot.w, box.y + box.h - 18, 10, COLORS.muted, 650, "right");
  }

  function drawVolume(ctx, result, box) {
    panel(ctx, box, "volume shrinks relative noise", "same concentration law, different molecule counts");
    var rows = result.ladder;
    var plot = { x: box.x + 42, y: box.y + 62, w: box.w - 64, h: box.h - 102 };
    var maxCv = Math.max.apply(null, rows.map(function (row) {
      return Math.max(row.empiricalCv, row.theoryCv);
    }).concat([0.1]));
    drawAxis(ctx, plot);
    var slot = plot.w / rows.length;
    rows.forEach(function (row, i) {
      var x = plot.x + i * slot + slot * 0.2;
      var bw = slot * 0.22;
      var h1 = plot.h * row.empiricalCv / maxCv;
      var h2 = plot.h * row.theoryCv / maxCv;
      ctx.fillStyle = COLORS.estimate;
      ctx.fillRect(x, plot.y + plot.h - h1, bw, h1);
      ctx.fillStyle = COLORS.truth;
      ctx.fillRect(x + bw + 3, plot.y + plot.h - h2, bw, h2);
      drawText(ctx, "V=" + row.volume, x + bw, plot.y + plot.h + 18, 10, COLORS.muted, 650, "center");
    });
    drawText(ctx, "empirical", plot.x + 8, plot.y + 16, 10, COLORS.estimate, 760);
    drawText(ctx, "1/sqrt(mean)", plot.x + 76, plot.y + 16, 10, COLORS.truth, 760);
    drawText(ctx, "CV", plot.x - 8, plot.y + 4, 10, COLORS.muted, 650, "right");
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
      drawPaths(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawRace(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawHistogram(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawVolume(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }

    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawPaths(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawRace(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawHistogram(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawVolume(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function renderOne(root) {
    var result = evaluate(readParams(root));
    updateControls(root, result.params);
    updateOutputs(root, result.params);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__gillespieResult = result;
  }

  function initOne(root) {
    if (root.__gillespieReady) return;
    root.__gillespieReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { renderOne(root); }, 60);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__gillespieResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__gillespieResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__gillespieResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__gillespieResult, canvas);
        }
      });
    }
    renderOne(root);
  }

  function init() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-gillespie-lab]")).forEach(initOne);
  }

  var api = {
    cleanParams: cleanParams,
    ensemble: ensemble,
    evaluate: evaluate,
    meanCountAt: meanCountAt,
    poissonPmf: poissonPmf,
    simulatePath: simulatePath
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.GillespieRaceLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
