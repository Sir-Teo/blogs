(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#eef2f5",
    faint: "#f8fafc",
    truth: "#172026",
    observed: "#2563eb",
    singleton: "#d97706",
    missing: "#be123c",
    chao: "#7c3aed",
    good: "#0f766e",
    tail: "#64748b"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rng(seed) {
    var state = mix32(seed || 1);
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cleanParams(raw) {
    return {
      seed: clamp(Math.round(raw.seed || 37), 1, 99),
      species: clamp(Math.round(raw.species || 900), 80, 3000),
      sampleSize: clamp(Math.round(raw.sampleSize || 420), 40, 4000),
      skew: clamp(raw.skew == null ? 1.08 : raw.skew, 0.45, 1.85),
      tailNoise: clamp(raw.tailNoise == null ? 0.32 : raw.tailNoise, 0, 0.80),
      futureRatio: clamp(raw.futureRatio == null ? 0.55 : raw.futureRatio, 0.05, 1.00)
    };
  }

  function population(params) {
    var random = rng(params.seed * 1009 + params.species * 17);
    var weights = [];
    var total = 0;
    for (var i = 0; i < params.species; i += 1) {
      var rank = i + 1;
      var wobble = Math.exp(params.tailNoise * (random() - 0.5));
      var shoulder = 1 + 0.28 * Math.sin(rank * 0.017 + params.seed);
      var w = Math.max(1e-12, wobble * shoulder / Math.pow(rank, params.skew));
      weights.push(w);
      total += w;
    }
    var cumulative = [];
    var sum = 0;
    var probs = weights.map(function (w) {
      var p = w / total;
      sum += p;
      cumulative.push(sum);
      return p;
    });
    cumulative[cumulative.length - 1] = 1;
    return { cumulative: cumulative, probs: probs };
  }

  function drawOne(cumulative, random) {
    var u = random();
    var lo = 0;
    var hi = cumulative.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (cumulative[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function sampleCounts(pop, params, size, offset) {
    var random = rng(params.seed * 1000003 + size * 37 + offset * 7919);
    var counts = new Array(params.species);
    for (var i = 0; i < params.species; i += 1) counts[i] = 0;
    for (var j = 0; j < size; j += 1) counts[drawOne(pop.cumulative, random)] += 1;
    return counts;
  }

  function frequencyOfFrequencies(counts) {
    var out = {};
    counts.forEach(function (count) {
      if (count > 0) out[count] = (out[count] || 0) + 1;
    });
    return out;
  }

  function chao1(observed, f1, f2) {
    if (f2 > 0) return observed + f1 * f1 / (2 * f2);
    return observed + f1 * (f1 - 1) / 2;
  }

  function goodToulmin(freqs, t) {
    var sum = 0;
    Object.keys(freqs).forEach(function (key) {
      var r = Number(key);
      if (r <= 0) return;
      var sign = r % 2 ? 1 : -1;
      sum += sign * Math.pow(t, r) * freqs[key];
    });
    return sum;
  }

  function stats(params) {
    var clean = cleanParams(params);
    var pop = population(clean);
    var counts = sampleCounts(pop, clean, clean.sampleSize, 1);
    var freqs = frequencyOfFrequencies(counts);
    var observed = counts.reduce(function (sum, count) { return sum + (count > 0 ? 1 : 0); }, 0);
    var f1 = freqs[1] || 0;
    var f2 = freqs[2] || 0;
    var missingMass = 0;
    counts.forEach(function (count, i) {
      if (count === 0) missingMass += pop.probs[i];
    });
    var gtMissing = f1 / Math.max(1, clean.sampleSize);
    var chao = chao1(observed, f1, f2);
    var futureSize = Math.round(clean.sampleSize * clean.futureRatio);
    var futureCounts = counts.slice();
    var extra = sampleCounts(pop, clean, futureSize, 2);
    var actuallyNew = 0;
    for (var i = 0; i < extra.length; i += 1) {
      if (futureCounts[i] === 0 && extra[i] > 0) actuallyNew += 1;
      futureCounts[i] += extra[i];
    }
    var t = futureSize / Math.max(1, clean.sampleSize);
    var gtNew = goodToulmin(freqs, t);
    return {
      chao: chao,
      counts: counts,
      freqs: freqs,
      futureNewActual: actuallyNew,
      futureNewGT: gtNew,
      futureSize: futureSize,
      gtMissing: gtMissing,
      missingMass: missingMass,
      observed: observed,
      params: clean,
      pop: pop,
      singletons: f1,
      doubletons: f2,
      unseen: clean.species - observed
    };
  }

  function discoveryCurve(params) {
    var clean = cleanParams(params);
    var pop = population(clean);
    var random = rng(clean.seed * 99991 + 404);
    var counts = new Array(clean.species);
    for (var i = 0; i < clean.species; i += 1) counts[i] = 0;
    var observed = 0;
    var out = [];
    var max = clean.sampleSize + Math.round(clean.sampleSize * clean.futureRatio);
    var step = Math.max(5, Math.round(max / 80));
    for (var n = 1; n <= max; n += 1) {
      var species = drawOne(pop.cumulative, random);
      if (counts[species] === 0) observed += 1;
      counts[species] += 1;
      if (n <= 32 || n % step === 0 || n === max) out.push({ n: n, observed: observed });
    }
    return out;
  }

  function simulate(params) {
    var result = stats(params);
    result.curve = discoveryCurve(result.params);
    result.audit = runAudit();
    return result;
  }

  function runAudit() {
    var ok = 0;
    var cases = 0;
    [7, 37, 83].forEach(function (seed) {
      [180, 700, 1600].forEach(function (species) {
        [80, 420, 1200].forEach(function (sampleSize) {
          cases += 1;
          var run = stats({
            seed: seed,
            species: species,
            sampleSize: sampleSize,
            skew: 1.08,
            tailNoise: 0.32,
            futureRatio: 0.55
          });
          var finite = isFinite(run.chao) &&
            isFinite(run.gtMissing) &&
            isFinite(run.missingMass) &&
            isFinite(run.futureNewGT);
          var bounded = run.gtMissing >= 0 &&
            run.gtMissing <= 1 &&
            run.missingMass >= 0 &&
            run.missingMass <= 1 &&
            run.observed <= run.params.species &&
            run.chao >= run.observed;
          if (finite && bounded) ok += 1;
        });
      });
    });
    var baseline = stats({ seed: 37, species: 900, sampleSize: 420, skew: 1.08, tailNoise: 0.32, futureRatio: 0.55 });
    var error = Math.abs(baseline.gtMissing - baseline.missingMass);
    return {
      cases: cases + 1,
      ok: ok + (error < 0.08 ? 1 : 0),
      defaultMissingMass: baseline.missingMass,
      defaultGoodTuring: baseline.gtMissing
    };
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function pct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="unseen-species-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function line(ctx, x1, y1, x2, y2, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.faint;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, x + 12, y + 20, COLORS.text, 13, 750);
  }

  function drawPopulation(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "population probabilities by rank");
    var plot = { x: box.x + 44, y: box.y + 36, w: box.w - 62, h: box.h - 58 };
    var max = result.pop.probs[0];
    var n = Math.min(result.pop.probs.length, 160);
    for (var i = 0; i < n; i += 1) {
      var x = plot.x + i / n * plot.w;
      var y = plot.y + (1 - Math.log(result.pop.probs[i] / result.pop.probs[n - 1]) / Math.log(max / result.pop.probs[n - 1])) * plot.h;
      ctx.fillStyle = result.counts[i] > 0 ? COLORS.observed : COLORS.tail;
      ctx.globalAlpha = result.counts[i] > 0 ? 0.78 : 0.30;
      ctx.fillRect(x, y, Math.max(1, plot.w / n), plot.y + plot.h - y);
    }
    ctx.globalAlpha = 1;
    line(ctx, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, COLORS.rule, 1);
    text(ctx, "head", plot.x, plot.y + plot.h + 17, COLORS.muted, 10, 500);
    text(ctx, "tail", plot.x + plot.w, plot.y + plot.h + 17, COLORS.muted, 10, 500, "right");
  }

  function drawOccupancy(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "frequency of frequencies");
    var plot = { x: box.x + 44, y: box.y + 38, w: box.w - 62, h: box.h - 60 };
    var buckets = [];
    for (var r = 1; r <= 10; r += 1) buckets.push({ label: String(r), value: result.freqs[r] || 0, r: r });
    var rest = Object.keys(result.freqs).reduce(function (sum, key) {
      var r = Number(key);
      return sum + (r > 10 ? result.freqs[key] : 0);
    }, 0);
    buckets.push({ label: ">10", value: rest, r: 11 });
    var max = Math.max.apply(null, buckets.map(function (b) { return b.value; }).concat([1]));
    buckets.forEach(function (b, i) {
      var slot = plot.w / buckets.length;
      var x = plot.x + i * slot + slot * 0.5;
      var h = plot.h * b.value / max;
      ctx.fillStyle = b.r === 1 ? COLORS.singleton : b.r === 2 ? COLORS.good : COLORS.observed;
      ctx.fillRect(x - 12, plot.y + plot.h - h, 24, h);
      text(ctx, b.label, x, plot.y + plot.h + 16, COLORS.muted, 10, 600, "center");
      if (b.value > 0) text(ctx, String(b.value), x, plot.y + plot.h - h - 6, COLORS.text, 10, 600, "center");
    });
  }

  function drawMissing(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "missing mass");
    var plot = { x: box.x + 48, y: box.y + 48, w: box.w - 70, h: box.h - 76 };
    var rows = [
      { label: "true unseen probability", value: result.missingMass, color: COLORS.missing },
      { label: "Good-Turing f1/n", value: result.gtMissing, color: COLORS.good },
      { label: "observed coverage", value: 1 - result.missingMass, color: COLORS.observed }
    ];
    rows.forEach(function (row, i) {
      var y = plot.y + i * 54;
      text(ctx, row.label, plot.x, y - 7, COLORS.text, 11, 700);
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(plot.x, y, plot.w, 12);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, plot.w * clamp(row.value, 0, 1), 12);
      text(ctx, pct(row.value, 1), plot.x + plot.w, y + 11, row.color, 11, 750, "right");
    });
    text(ctx, "singletons are " + result.singletons + " of " + result.observed + " observed types", plot.x, box.y + box.h - 18, COLORS.singleton, 11, 750);
  }

  function drawDiscovery(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "discovery curve");
    var plot = { x: box.x + 48, y: box.y + 36, w: box.w - 64, h: box.h - 62 };
    var maxN = result.params.sampleSize + result.futureSize;
    var maxY = Math.max(result.params.species, result.chao, result.observed + result.futureNewActual) * 1.03;
    function x(n) { return plot.x + n / maxN * plot.w; }
    function y(v) { return plot.y + (1 - v / maxY) * plot.h; }
    line(ctx, plot.x, y(result.params.species), plot.x + plot.w, y(result.params.species), COLORS.truth, 1, [5, 4]);
    line(ctx, plot.x, y(result.chao), plot.x + plot.w, y(result.chao), COLORS.chao, 1.4, [4, 4]);
    ctx.beginPath();
    result.curve.forEach(function (p, i) {
      var px = x(p.n);
      var py = y(p.observed);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = COLORS.observed;
    ctx.lineWidth = 2;
    ctx.stroke();
    var futureX = x(result.params.sampleSize + result.futureSize);
    var observedY = y(result.observed + result.futureNewActual);
    ctx.fillStyle = COLORS.missing;
    ctx.beginPath();
    ctx.arc(futureX, observedY, 5, 0, 2 * Math.PI);
    ctx.fill();
    var gtY = y(result.observed + Math.max(0, result.futureNewGT));
    ctx.fillStyle = COLORS.good;
    ctx.beginPath();
    ctx.arc(futureX - 10, gtY, 5, 0, 2 * Math.PI);
    ctx.fill();
    text(ctx, "true K", plot.x + plot.w - 42, y(result.params.species) - 6, COLORS.truth, 10, 700);
    text(ctx, "Chao1", plot.x + plot.w - 42, y(result.chao) + 14, COLORS.chao, 10, 700);
    text(ctx, "future actual / GT", futureX - 82, Math.min(observedY, gtY) - 12, COLORS.muted, 10, 600);
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawPopulation(ctx, result, { x: 18, y: 18, w: 424, h: 318 });
    drawOccupancy(ctx, result, { x: 462, y: 18, w: 420, h: 318 });
    drawMissing(ctx, result, { x: 18, y: 356, w: 424, h: 322 });
    drawDiscovery(ctx, result, { x: 462, y: 356, w: 420, h: 322 });
  }

  function readParams(lab) {
    function number(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      if (!input) return fallback;
      var value = Number(input.value);
      return isFinite(value) ? value : fallback;
    }
    return {
      seed: number("seed", 37),
      species: number("species", 900),
      sampleSize: number("sampleSize", 420),
      skew: number("skew", 108) / 100,
      tailNoise: number("tailNoise", 32) / 100,
      futureRatio: number("futureRatio", 55) / 100
    };
  }

  function updateOutputs(lab, params) {
    var labels = {
      seed: String(params.seed),
      species: String(params.species),
      sampleSize: String(params.sampleSize),
      skew: fmt(params.skew, 2),
      tailNoise: pct(params.tailNoise, 0),
      futureRatio: pct(params.futureRatio, 0)
    };
    Object.keys(labels).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(lab) {
    var params = cleanParams(readParams(lab));
    updateOutputs(lab, params);
    var result = simulate(params);
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("observed types", String(result.observed)),
        metric("singletons", String(result.singletons)),
        metric("missing mass", pct(result.missingMass, 1)),
        metric("Good-Turing", pct(result.gtMissing, 1)),
        metric("Chao1 richness", fmt(result.chao, 0)),
        metric("audit grid", result.audit.ok + "/" + result.audit.cases)
      ].join("");
    }
    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function init(lab) {
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () { render(lab); });
      input.addEventListener("change", function () { render(lab); });
    });
    render(lab);
  }

  function initAll() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-unseen-species-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }

  var api = {
    chao1: chao1,
    cleanParams: cleanParams,
    goodToulmin: goodToulmin,
    runAudit: runAudit,
    simulate: simulate,
    stats: stats
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.UnseenSpeciesLab = api;
})(typeof window !== "undefined" ? window : globalThis);
