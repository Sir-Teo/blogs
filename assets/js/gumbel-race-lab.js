(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    theory: "#172026",
    gumbel: "#2563eb",
    race: "#0f766e",
    replace: "#d97706",
    selected: "#be123c",
    soft: "#f8fafc"
  };

  var LABELS = [
    "atlas",
    "bloom",
    "comet",
    "delta",
    "ember",
    "fjord",
    "glyph",
    "harbor",
    "ion",
    "jade",
    "kepler",
    "lumen"
  ];

  var BASE_LOGITS = [2.25, 1.54, 1.18, 0.72, 0.28, -0.05, -0.42, -0.86, -1.3, -1.72, -2.05, -2.42];

  var DEFAULTS = {
    items: 8,
    temp: 85,
    k: 4,
    trials: 6000,
    seed: 19
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var items = snap(raw.items, DEFAULTS.items, 5, LABELS.length, 1);
    return {
      items: items,
      temp: snap(raw.temp, DEFAULTS.temp, 35, 220, 5),
      k: snap(raw.k, DEFAULTS.k, 1, items, 1),
      trials: snap(raw.trials, DEFAULTS.trials, 1000, 20000, 500),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1)
    };
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function safeUniform(rand) {
    return clamp(rand(), 1e-12, 1 - 1e-12);
  }

  function gumbelFromUniform(u) {
    return -Math.log(-Math.log(u));
  }

  function softmax(phi) {
    var max = -Infinity;
    var weights = [];
    var total = 0;
    var i;

    for (i = 0; i < phi.length; i += 1) max = Math.max(max, phi[i]);
    for (i = 0; i < phi.length; i += 1) {
      var weight = Math.exp(phi[i] - max);
      weights.push(weight);
      total += weight;
    }
    return weights.map(function (weight) { return weight / total; });
  }

  function distribution(params) {
    var temp = params.temp / 100;
    var phi = [];
    var i;
    for (i = 0; i < params.items; i += 1) phi.push(BASE_LOGITS[i] / temp);
    var probs = softmax(phi);
    var weights = phi.map(function (value) { return Math.exp(value); });
    var entropy = 0;
    for (i = 0; i < probs.length; i += 1) entropy -= probs[i] * Math.log(probs[i]);
    return {
      labels: LABELS.slice(0, params.items),
      phi: phi,
      probs: probs,
      weights: weights,
      entropy: entropy,
      effective: Math.exp(entropy),
      topProb: Math.max.apply(null, probs)
    };
  }

  function sortByScore(items) {
    return items.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
  }

  function sortByClock(items) {
    return items.slice().sort(function (a, b) {
      if (a.clock !== b.clock) return a.clock - b.clock;
      return a.index - b.index;
    });
  }

  function sampleOne(dist, rand) {
    var rows = [];
    for (var i = 0; i < dist.probs.length; i += 1) {
      var u = safeUniform(rand);
      var unitExp = -Math.log(u);
      var g = gumbelFromUniform(u);
      rows.push({
        clock: unitExp / dist.weights[i],
        gumbel: g,
        index: i,
        label: dist.labels[i],
        phi: dist.phi[i],
        prob: dist.probs[i],
        score: dist.phi[i] + g,
        u: u
      });
    }
    return rows;
  }

  function orderIndexes(rows, limit) {
    return rows.slice(0, limit == null ? rows.length : limit).map(function (row) { return row.index; });
  }

  function exactTopKInclusion(probs, k) {
    var n = probs.length;
    var states = new Map();
    states.set(0, 1);

    for (var step = 0; step < k; step += 1) {
      var next = new Map();
      states.forEach(function (stateProb, mask) {
        var remaining = 0;
        var i;
        for (i = 0; i < n; i += 1) {
          if ((mask & (1 << i)) === 0) remaining += probs[i];
        }
        for (i = 0; i < n; i += 1) {
          if ((mask & (1 << i)) !== 0) continue;
          var newMask = mask | (1 << i);
          var add = stateProb * probs[i] / Math.max(1e-15, remaining);
          next.set(newMask, (next.get(newMask) || 0) + add);
        }
      });
      states = next;
    }

    var inclusion = probs.map(function () { return 0; });
    states.forEach(function (stateProb, mask) {
      for (var i = 0; i < n; i += 1) {
        if ((mask & (1 << i)) !== 0) inclusion[i] += stateProb;
      }
    });

    return inclusion;
  }

  function orderedProbability(order, probs) {
    var remaining = 1;
    var probability = 1;
    for (var j = 0; j < order.length; j += 1) {
      var p = probs[order[j]];
      probability *= p / Math.max(1e-15, remaining);
      remaining -= p;
    }
    return probability;
  }

  function totalVariation(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
    return 0.5 * sum;
  }

  function meanAbs(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
    return sum / Math.max(1, a.length);
  }

  function frequencies(counts, denom) {
    return counts.map(function (count) { return count / Math.max(1, denom); });
  }

  function uniqueCount(order) {
    var seen = new Set(order);
    return seen.size;
  }

  function makeCheckpoints(trials) {
    var raw = [200, 500, 1000, 2000, 5000, 10000, trials];
    var out = [];
    raw.forEach(function (value) {
      if (value <= trials && out.indexOf(value) < 0) out.push(value);
    });
    if (out[out.length - 1] !== trials) out.push(trials);
    return out;
  }

  function simulate(dist, params, exactInclusion) {
    var rand = makeRng(20260614 + params.seed * 1009 + params.items * 31 + params.k * 37 + params.temp * 41);
    var n = dist.probs.length;
    var firstCounts = dist.probs.map(function () { return 0; });
    var raceFirstCounts = dist.probs.map(function () { return 0; });
    var inclusionCounts = dist.probs.map(function () { return 0; });
    var duplicateWaste = 0;
    var checkpoints = makeCheckpoints(params.trials);
    var checkpointIndex = 0;
    var convergence = [];

    for (var t = 1; t <= params.trials; t += 1) {
      var rows = sampleOne(dist, rand);
      var gOrder = sortByScore(rows);
      var cOrder = sortByClock(rows);
      var chosen = orderIndexes(gOrder, params.k);
      firstCounts[gOrder[0].index] += 1;
      raceFirstCounts[cOrder[0].index] += 1;
      chosen.forEach(function (index) { inclusionCounts[index] += 1; });

      var replacement = [];
      for (var draw = 0; draw < params.k; draw += 1) {
        var u = safeUniform(rand);
        var acc = 0;
        for (var i = 0; i < n; i += 1) {
          acc += dist.probs[i];
          if (u <= acc || i === n - 1) {
            replacement.push(i);
            break;
          }
        }
      }
      duplicateWaste += params.k - uniqueCount(replacement);

      if (t === checkpoints[checkpointIndex]) {
        var firstFreq = frequencies(firstCounts, t);
        var inclusionFreq = frequencies(inclusionCounts, t);
        convergence.push({
          samples: t,
          firstTV: totalVariation(firstFreq, dist.probs),
          inclusionMAE: meanAbs(inclusionFreq, exactInclusion)
        });
        checkpointIndex += 1;
      }
    }

    return {
      duplicateWaste: duplicateWaste / Math.max(1, params.trials * params.k),
      firstFreq: frequencies(firstCounts, params.trials),
      raceFirstFreq: frequencies(raceFirstCounts, params.trials),
      inclusionFreq: frequencies(inclusionCounts, params.trials),
      convergence: convergence
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var dist = distribution(params);
    var exactInclusion = exactTopKInclusion(dist.probs, params.k);
    var withReplacementInclusion = dist.probs.map(function (p) {
      return 1 - Math.pow(1 - p, params.k);
    });
    var expectedUnique = withReplacementInclusion.reduce(function (sum, value) { return sum + value; }, 0);
    var sim = simulate(dist, params, exactInclusion);
    var trial = sampleOne(dist, makeRng(9719 + params.seed * 131 + params.temp * 17 + params.k * 23));
    var gumbelOrder = sortByScore(trial);
    var clockOrder = sortByClock(trial);
    var selected = orderIndexes(gumbelOrder, params.k);
    var clockSelected = orderIndexes(clockOrder, params.k);
    var clockOrderMatches = selected.join(",") === clockSelected.join(",");

    return {
      clockOrderMatches: clockOrderMatches,
      dist: dist,
      exactInclusion: exactInclusion,
      expectedDuplicateWaste: 1 - expectedUnique / Math.max(1, params.k),
      expectedUnique: expectedUnique,
      firstTV: totalVariation(sim.firstFreq, dist.probs),
      gumbelOrder: gumbelOrder,
      inclusionMAE: meanAbs(sim.inclusionFreq, exactInclusion),
      params: params,
      raceFirstTV: totalVariation(sim.raceFirstFreq, dist.probs),
      selected: selected,
      selectedOrderProbability: orderedProbability(selected, dist.probs),
      sim: sim,
      trial: trial,
      withReplacementInclusion: withReplacementInclusion
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="gumbel-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
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

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = root.devicePixelRatio || 1;
    var width = Math.max(320, rect.width || canvas.clientWidth || 760);
    var height = width < 620 ? 1120 : 820;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return { ctx: ctx, width: width, height: height };
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, box.x + 14, box.y + 25);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 43);
    }
  }

  function axes(ctx, plot, yMax, yLabel) {
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.muted;
    ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h - i * plot.h / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.fillText(formatNumber(yMax * i / 4, 2), plot.x - 2, y - 3);
    }
    if (yLabel) ctx.fillText(yLabel, plot.x, plot.y - 8);
  }

  function drawFirstPick(ctx, box, result) {
    panel(ctx, box, "First pick law", "argmax(log weight + Gumbel) versus softmax");
    var probs = result.dist.probs;
    var freq = result.sim.firstFreq;
    var race = result.sim.raceFirstFreq;
    var plot = { x: box.x + 42, y: box.y + 70, w: box.w - 62, h: box.h - 106 };
    var yMax = Math.max.apply(null, probs.concat(freq).concat(race)) * 1.15;
    axes(ctx, plot, yMax, "probability");
    var slot = plot.w / probs.length;
    for (var i = 0; i < probs.length; i += 1) {
      var cx = plot.x + i * slot + slot * 0.5;
      var th = probs[i] / yMax * plot.h;
      var gh = freq[i] / yMax * plot.h;
      var rh = race[i] / yMax * plot.h;
      ctx.fillStyle = COLORS.theory;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(cx - slot * 0.28, plot.y + plot.h - th, slot * 0.18, th);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.gumbel;
      ctx.fillRect(cx - slot * 0.06, plot.y + plot.h - gh, slot * 0.18, gh);
      ctx.fillStyle = COLORS.race;
      ctx.fillRect(cx + slot * 0.16, plot.y + plot.h - rh, slot * 0.18, rh);
      ctx.save();
      ctx.translate(cx - 5, plot.y + plot.h + 32);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(result.dist.labels[i], 0, 0);
      ctx.restore();
    }
  }

  function drawRace(ctx, box, result) {
    panel(ctx, box, "One noisy race", "one uniform gives both a Gumbel key and an exponential clock");
    var rows = result.gumbelOrder;
    var plot = { x: box.x + 18, y: box.y + 64, w: box.w - 36, h: box.h - 86 };
    var minScore = Math.min.apply(null, rows.map(function (row) { return row.score; }));
    var maxScore = Math.max.apply(null, rows.map(function (row) { return row.score; }));
    var span = Math.max(1e-9, maxScore - minScore);
    var rowH = Math.min(24, plot.h / rows.length);
    var barX = plot.x + 72;
    var barW = plot.w - 178;

    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var y = plot.y + i * rowH;
      var selected = i < result.params.k;
      ctx.fillStyle = selected ? "rgba(190,18,60,0.08)" : "rgba(255,255,255,0.55)";
      roundedRect(ctx, plot.x, y, plot.w, rowH - 3, 5);
      ctx.fill();
      ctx.fillStyle = selected ? COLORS.selected : COLORS.text;
      ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(String(i + 1) + ". " + row.label, plot.x + 8, y + 16);
      var w = ((row.score - minScore) / span) * barW;
      ctx.fillStyle = selected ? COLORS.selected : COLORS.gumbel;
      ctx.fillRect(barX, y + 7, Math.max(2, w), 7);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("key " + formatNumber(row.score, 2), barX + barW + 10, y + 12);
      ctx.fillText("clock " + formatNumber(row.clock, 2), barX + barW + 10, y + 23);
    }

    ctx.fillStyle = result.clockOrderMatches ? COLORS.race : COLORS.selected;
    ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("clock order agrees: " + (result.clockOrderMatches ? "yes" : "no"), plot.x, box.y + box.h - 14);
  }

  function drawInclusion(ctx, box, result) {
    panel(ctx, box, "Top-k set probabilities", "sorting once samples without replacement");
    var exact = result.exactInclusion;
    var empirical = result.sim.inclusionFreq;
    var replacement = result.withReplacementInclusion;
    var plot = { x: box.x + 42, y: box.y + 70, w: box.w - 62, h: box.h - 106 };
    var yMax = Math.min(1, Math.max.apply(null, exact.concat(empirical).concat(replacement)) * 1.12);
    axes(ctx, plot, yMax, "included in top-" + result.params.k);
    var slot = plot.w / exact.length;
    for (var i = 0; i < exact.length; i += 1) {
      var cx = plot.x + i * slot + slot * 0.5;
      var eh = exact[i] / yMax * plot.h;
      var gh = empirical[i] / yMax * plot.h;
      var wh = replacement[i] / yMax * plot.h;
      ctx.fillStyle = COLORS.theory;
      ctx.globalAlpha = 0.16;
      ctx.fillRect(cx - slot * 0.26, plot.y + plot.h - eh, slot * 0.24, eh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.gumbel;
      ctx.fillRect(cx + slot * 0.02, plot.y + plot.h - gh, slot * 0.22, gh);
      ctx.strokeStyle = COLORS.replace;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - slot * 0.3, plot.y + plot.h - wh);
      ctx.lineTo(cx + slot * 0.32, plot.y + plot.h - wh);
      ctx.stroke();
      ctx.save();
      ctx.translate(cx - 5, plot.y + plot.h + 32);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(result.dist.labels[i], 0, 0);
      ctx.restore();
    }
  }

  function drawConvergence(ctx, box, result) {
    panel(ctx, box, "Monte Carlo audit", "errors should shrink as simulated draws increase");
    var rows = result.sim.convergence;
    var plot = { x: box.x + 46, y: box.y + 72, w: box.w - 70, h: box.h - 132 };
    var yMax = Math.max.apply(null, rows.map(function (row) {
      return Math.max(row.firstTV, row.inclusionMAE);
    })) * 1.2;
    yMax = Math.max(0.01, yMax);
    axes(ctx, plot, yMax, "error");

    function point(row, value) {
      var xFrac = rows.length <= 1 ? 1 : rows.indexOf(row) / (rows.length - 1);
      return {
        x: plot.x + xFrac * plot.w,
        y: plot.y + plot.h - value / yMax * plot.h
      };
    }

    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      rows.forEach(function (row, index) {
        var p = point(row, row[key]);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      rows.forEach(function (row) {
        var p = point(row, row[key]);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    line("firstTV", COLORS.gumbel);
    line("inclusionMAE", COLORS.selected);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    rows.forEach(function (row, index) {
      var x = plot.x + (rows.length <= 1 ? 1 : index / (rows.length - 1)) * plot.w;
      ctx.fillText(row.samples >= 1000 ? String(row.samples / 1000) + "k" : String(row.samples), x - 8, plot.y + plot.h + 18);
    });

    ctx.fillStyle = COLORS.gumbel;
    ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("first-pick TV", plot.x, box.y + box.h - 46);
    ctx.fillStyle = COLORS.selected;
    ctx.fillText("top-k inclusion MAE", plot.x + 112, box.y + box.h - 46);

    ctx.fillStyle = COLORS.text;
    ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("with replacement wasted slots: " + formatPct(result.expectedDuplicateWaste, 1), plot.x, box.y + box.h - 22);
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    var margin = 12;
    var gap = 12;
    var boxes = [];

    if (width < 620) {
      var h = (height - margin * 2 - gap * 3) / 4;
      for (var i = 0; i < 4; i += 1) boxes.push({ x: margin, y: margin + i * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - margin * 2 - gap) / 2;
      var rowH = (height - margin * 2 - gap) / 2;
      boxes.push({ x: margin, y: margin, w: colW, h: rowH });
      boxes.push({ x: margin + colW + gap, y: margin, w: colW, h: rowH });
      boxes.push({ x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      boxes.push({ x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    drawFirstPick(ctx, boxes[0], result);
    drawRace(ctx, boxes[1], result);
    drawInclusion(ctx, boxes[2], result);
    drawConvergence(ctx, boxes[3], result);
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-value]").forEach(function (node) {
      var key = node.getAttribute("data-value");
      if (key === "temp") node.textContent = (params.temp / 100).toFixed(2);
      else if (key === "trials") node.textContent = params.trials.toLocaleString();
      else node.textContent = String(params[key]);
    });
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (node) {
      raw[node.getAttribute("data-param")] = node.value;
    });
    return cleanParams(raw);
  }

  function render(container) {
    var params = readParams(container);
    updateOutputs(container, params);
    var result = evaluate(params);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("entropy choices", formatNumber(result.dist.effective, 2)),
        metric("top prob", formatPct(result.dist.topProb, 1)),
        metric("first TV", formatNumber(result.firstTV, 4)),
        metric("top-k MAE", formatNumber(result.inclusionMAE, 4)),
        metric("wasted repl.", formatPct(result.expectedDuplicateWaste, 1)),
        metric("order prob", formatPct(result.selectedOrderProbability, 3))
      ].join("");
    }
    var canvas = container.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
    container.__gumbelRaceResult = result;
  }

  function mount(container) {
    if (container.__gumbelRaceMounted) return;
    container.__gumbelRaceMounted = true;
    container.querySelectorAll("[data-param]").forEach(function (node) {
      node.addEventListener("input", function () { render(container); });
      node.addEventListener("change", function () { render(container); });
    });
    render(container);
    root.addEventListener("resize", function () { render(container); });
  }

  function mountAll() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-gumbel-race-lab]").forEach(mount);
  }

  root.GumbelRaceLab = {
    cleanParams: cleanParams,
    distribution: distribution,
    evaluate: evaluate,
    exactTopKInclusion: exactTopKInclusion,
    gumbelFromUniform: gumbelFromUniform,
    orderedProbability: orderedProbability,
    sampleOne: sampleOne,
    softmax: softmax
  };

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", mountAll);
    } else {
      mountAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
