(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    alias: "#2563eb",
    primary: "#0f766e",
    spill: "#d97706",
    error: "#be123c",
    theory: "#172026"
  };

  var PALETTE = [
    "#2563eb", "#0f766e", "#d97706", "#be123c", "#7c3aed", "#0891b2",
    "#65a30d", "#c2410c", "#4f46e5", "#15803d", "#b45309", "#db2777",
    "#0284c7", "#9333ea", "#16a34a", "#e11d48", "#0d9488", "#a16207",
    "#1d4ed8", "#a21caf", "#0369a1", "#b91c1c", "#047857", "#854d0e"
  ];

  var LABELS = [
    "atlas", "bloom", "comet", "delta", "ember", "fjord", "glyph", "harbor",
    "ion", "jade", "kepler", "lumen", "morrow", "nova", "onyx", "pico",
    "quartz", "riven", "sol", "tango", "umbra", "vesta", "willow", "xenon",
    "yarrow", "zenith", "amber", "brisk", "cobalt", "dune", "equinox", "flux"
  ];

  var DEFAULTS = {
    items: 18,
    profile: "token",
    skew: 135,
    draws: 14000,
    seed: 37
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanProfile(value) {
    return value === "loot" || value === "flat" ? value : "token";
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      items: snap(raw.items, DEFAULTS.items, 4, 32, 1),
      profile: cleanProfile(raw.profile || DEFAULTS.profile),
      skew: snap(raw.skew, DEFAULTS.skew, 0, 240, 5),
      draws: snap(raw.draws, DEFAULTS.draws, 1000, 40000, 500),
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

  function profileWeight(i, n, profile, skew) {
    var x = i + 1;
    var a = skew / 100;
    var wave = 1 + 0.11 * Math.sin(1.7 * x) + 0.06 * Math.cos(0.43 * x);

    if (profile === "flat") {
      return 1 + 0.12 * Math.sin(2.1 * x) + 0.04 * a * ((i % 4) === 0 ? 1 : 0);
    }

    if (profile === "loot") {
      var jackpot = i === 0 ? 1.8 + 2.2 * a : 0;
      var chase = i === n - 1 ? 0.22 + 0.55 * a : 0;
      return jackpot + chase + wave / Math.pow(x, 0.42 + 0.58 * a);
    }

    return Math.exp(-a * i / 4.2) * wave + 0.018;
  }

  function distribution(params) {
    params = cleanParams(params);
    var weights = [];
    var total = 0;
    var i;
    for (i = 0; i < params.items; i += 1) {
      var w = Math.max(1e-12, profileWeight(i, params.items, params.profile, params.skew));
      weights.push(w);
      total += w;
    }

    var probs = weights.map(function (w) { return w / total; });
    var entropy = 0;
    var topProb = 0;
    for (i = 0; i < probs.length; i += 1) {
      entropy -= probs[i] * Math.log(probs[i]);
      topProb = Math.max(topProb, probs[i]);
    }

    return {
      labels: LABELS.slice(0, params.items),
      weights: weights,
      probs: probs,
      entropy: entropy,
      effective: Math.exp(entropy),
      topProb: topProb
    };
  }

  function buildAlias(probs) {
    var n = probs.length;
    var scaled = probs.map(function (p) { return p * n; });
    var small = [];
    var large = [];
    var prob = new Array(n);
    var alias = new Array(n);
    var steps = [];
    var i;

    for (i = 0; i < n; i += 1) {
      alias[i] = i;
      if (scaled[i] < 1) small.push(i);
      else large.push(i);
    }

    while (small.length && large.length) {
      var s = small.pop();
      var g = large.pop();
      var take = scaled[s];
      var spill = 1 - take;

      prob[s] = take;
      alias[s] = g;
      steps.push({
        column: s,
        primary: s,
        alias: g,
        primaryMass: take / n,
        aliasMass: spill / n,
        donorBefore: scaled[g] / n
      });

      scaled[g] = scaled[g] - spill;
      if (scaled[g] < 1 - 1e-12) small.push(g);
      else large.push(g);
    }

    while (large.length) {
      i = large.pop();
      prob[i] = 1;
      alias[i] = i;
    }

    while (small.length) {
      i = small.pop();
      prob[i] = 1;
      alias[i] = i;
    }

    return { prob: prob, alias: alias, steps: steps };
  }

  function reconstruct(table) {
    var n = table.prob.length;
    var mass = new Array(n);
    var i;
    for (i = 0; i < n; i += 1) mass[i] = 0;
    for (i = 0; i < n; i += 1) {
      mass[i] += table.prob[i] / n;
      mass[table.alias[i]] += (1 - table.prob[i]) / n;
    }
    return mass;
  }

  function drawAlias(table, rand) {
    var n = table.prob.length;
    var column = Math.min(n - 1, Math.floor(safeUniform(rand) * n));
    var coin = safeUniform(rand);
    if (coin < table.prob[column]) {
      return { index: column, column: column, usedAlias: false };
    }
    return { index: table.alias[column], column: column, usedAlias: true };
  }

  function drawLinear(probs, rand) {
    var u = safeUniform(rand);
    var acc = 0;
    var comparisons = 0;
    for (var i = 0; i < probs.length; i += 1) {
      comparisons += 1;
      acc += probs[i];
      if (u <= acc || i === probs.length - 1) {
        return { index: i, comparisons: comparisons };
      }
    }
    return { index: probs.length - 1, comparisons: comparisons };
  }

  function drawBinary(cdf, rand) {
    var u = safeUniform(rand);
    var lo = 0;
    var hi = cdf.length - 1;
    var comparisons = 0;
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      comparisons += 1;
      if (u <= cdf[mid]) hi = mid;
      else lo = mid + 1;
    }
    comparisons += 1;
    return { index: lo, comparisons: comparisons };
  }

  function cdfFromProbs(probs) {
    var acc = 0;
    return probs.map(function (p, i) {
      acc += p;
      return i === probs.length - 1 ? 1 : acc;
    });
  }

  function zeros(n) {
    var out = new Array(n);
    for (var i = 0; i < n; i += 1) out[i] = 0;
    return out;
  }

  function frequencies(counts, denom) {
    return counts.map(function (count) { return count / Math.max(1, denom); });
  }

  function totalVariation(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
    return 0.5 * sum;
  }

  function maxAbs(a, b) {
    var best = 0;
    for (var i = 0; i < a.length; i += 1) best = Math.max(best, Math.abs(a[i] - b[i]));
    return best;
  }

  function expectedLinearComparisons(probs) {
    var total = 0;
    for (var i = 0; i < probs.length; i += 1) total += (i + 1) * probs[i];
    return total;
  }

  function simulate(params) {
    params = cleanParams(params);
    var dist = distribution(params);
    var table = buildAlias(dist.probs);
    var cdf = cdfFromProbs(dist.probs);
    var aliasCounts = zeros(params.items);
    var linearCounts = zeros(params.items);
    var binaryCounts = zeros(params.items);
    var aliasColumns = zeros(params.items);
    var aliasUses = 0;
    var linearComparisons = 0;
    var binaryComparisons = 0;
    var randAlias = makeRng(params.seed * 1009 + 17);
    var randLinear = makeRng(params.seed * 1613 + 29);
    var randBinary = makeRng(params.seed * 2017 + 43);
    var i;

    for (i = 0; i < params.draws; i += 1) {
      var a = drawAlias(table, randAlias);
      aliasCounts[a.index] += 1;
      aliasColumns[a.column] += 1;
      if (a.usedAlias) aliasUses += 1;

      var l = drawLinear(dist.probs, randLinear);
      linearCounts[l.index] += 1;
      linearComparisons += l.comparisons;

      var b = drawBinary(cdf, randBinary);
      binaryCounts[b.index] += 1;
      binaryComparisons += b.comparisons;
    }

    var aliasFreq = frequencies(aliasCounts, params.draws);
    var linearFreq = frequencies(linearCounts, params.draws);
    var binaryFreq = frequencies(binaryCounts, params.draws);
    var reconstruction = reconstruct(table);
    var aliasedColumns = table.prob.filter(function (p, j) {
      return p < 1 - 1e-12 && table.alias[j] !== j;
    }).length;
    var buildWork = params.items + table.steps.length;
    var expectedLinear = expectedLinearComparisons(dist.probs);
    var scanSaved = expectedLinear - 1;
    var breakEven = scanSaved > 1e-12 ? Math.ceil(buildWork / scanSaved) : Infinity;

    return {
      params: params,
      dist: dist,
      table: table,
      cdf: cdf,
      reconstruction: reconstruction,
      aliasCounts: aliasCounts,
      linearCounts: linearCounts,
      binaryCounts: binaryCounts,
      aliasColumns: aliasColumns,
      aliasFreq: aliasFreq,
      linearFreq: linearFreq,
      binaryFreq: binaryFreq,
      aliasUses: aliasUses,
      aliasUseRate: aliasUses / params.draws,
      aliasedColumns: aliasedColumns,
      buildWork: buildWork,
      breakEven: breakEven,
      expectedLinearComparisons: expectedLinear,
      linearComparisonsPerDraw: linearComparisons / params.draws,
      binaryComparisonsPerDraw: binaryComparisons / params.draws,
      aliasComparisonsPerDraw: 1,
      aliasTv: totalVariation(aliasFreq, dist.probs),
      linearTv: totalVariation(linearFreq, dist.probs),
      binaryTv: totalVariation(binaryFreq, dist.probs),
      aliasMaxError: maxAbs(aliasFreq, dist.probs),
      reconstructionMaxError: maxAbs(reconstruction, dist.probs),
      columnTv: totalVariation(frequencies(aliasColumns, params.draws), zeros(params.items).map(function () { return 1 / params.items; }))
    };
  }

  function evaluate(raw) {
    return simulate(cleanParams(raw));
  }

  function close(a, b, eps) {
    return Math.abs(a - b) <= (eps == null ? 1e-10 : eps);
  }

  function isProbabilityList(values) {
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) {
      if (!isFinite(values[i]) || values[i] < -1e-12 || values[i] > 1 + 1e-12) return false;
      sum += values[i];
    }
    return close(sum, 1, 1e-9);
  }

  function runAudit() {
    var failures = [];
    var checked = 0;

    function check(name, ok, detail) {
      checked += 1;
      if (!ok) failures.push({ name: name, detail: detail || null });
    }

    var cleaned = cleanParams({ items: 100, skew: 999, draws: -3, seed: "x", profile: "bad" });
    check("parameters snap into supported ranges", cleaned.items === 32 && cleaned.skew === 240 &&
      cleaned.draws === 1000 && cleaned.seed === DEFAULTS.seed && cleaned.profile === "token", cleaned);

    var dist = distribution(DEFAULTS);
    check("default distribution is a probability vector", isProbabilityList(dist.probs), dist.probs);
    check("default distribution has a real head and tail", dist.topProb > 0.2 && dist.probs[dist.probs.length - 1] > 0);

    var table = buildAlias(dist.probs);
    check("alias table has valid columns", table.prob.every(function (p, i) {
      return p >= -1e-12 && p <= 1 + 1e-12 && table.alias[i] >= 0 && table.alias[i] < table.prob.length;
    }));

    var recon = reconstruct(table);
    check("alias reconstruction matches probabilities", maxAbs(recon, dist.probs) < 1e-12, { recon: recon, probs: dist.probs });
    check("build has at most n minus one paired transfers", table.steps.length <= dist.probs.length - 1, table.steps.length);

    var flat = distribution({ items: 12, profile: "flat", skew: 0, draws: 2000, seed: 5 });
    var flatTable = buildAlias(flat.probs);
    check("nearly flat profile keeps probabilities normalized", isProbabilityList(flat.probs));
    check("flat profile reconstructs exactly", maxAbs(reconstruct(flatTable), flat.probs) < 1e-12);

    var one = buildAlias([1]);
    check("single-item alias table is deterministic", one.prob.length === 1 && one.prob[0] === 1 && one.alias[0] === 0);

    var tiny = buildAlias([0.25, 0.75]);
    check("two-item table preserves a simple split", maxAbs(reconstruct(tiny), [0.25, 0.75]) < 1e-12, tiny);

    var defaultResult = evaluate(DEFAULTS);
    check("default reconstruction error is tiny", defaultResult.reconstructionMaxError < 1e-12, defaultResult.reconstructionMaxError);
    check("default Monte Carlo alias error is plausible", defaultResult.aliasTv < 0.025 && defaultResult.aliasMaxError < 0.012, {
      tv: defaultResult.aliasTv,
      max: defaultResult.aliasMaxError
    });
    check("alias columns are selected almost uniformly", defaultResult.columnTv < 0.025, defaultResult.columnTv);
    check("linear sampler and alias sampler target the same law", defaultResult.linearTv < 0.025 &&
      Math.abs(defaultResult.linearTv - defaultResult.aliasTv) < 0.02, {
        linear: defaultResult.linearTv,
        alias: defaultResult.aliasTv
      });
    check("binary search sampler targets the same law", defaultResult.binaryTv < 0.025, defaultResult.binaryTv);
    check("linear comparison count matches expectation", close(defaultResult.linearComparisonsPerDraw,
      defaultResult.expectedLinearComparisons, 0.08), {
        observed: defaultResult.linearComparisonsPerDraw,
        expected: defaultResult.expectedLinearComparisons
      });
    check("alias draw uses one threshold comparison", defaultResult.aliasComparisonsPerDraw === 1);
    check("alias amortizes setup under default draw count", defaultResult.breakEven < DEFAULTS.draws, defaultResult.breakEven);

    var gridCases = 0;
    var gridOk = 0;
    ["token", "loot", "flat"].forEach(function (profile) {
      [4, 11, 24, 32].forEach(function (items) {
        [0, 95, 180, 240].forEach(function (skew) {
          [3, 71].forEach(function (seed) {
            gridCases += 1;
            var result = evaluate({ profile: profile, items: items, skew: skew, draws: 2500, seed: seed });
            var valid = isProbabilityList(result.dist.probs) &&
              result.reconstructionMaxError < 1e-12 &&
              result.table.prob.length === items &&
              result.aliasCounts.reduce(function (a, b) { return a + b; }, 0) === result.params.draws &&
              result.linearCounts.reduce(function (a, b) { return a + b; }, 0) === result.params.draws &&
              isFinite(result.aliasTv) &&
              result.breakEven > 0;
            if (valid) gridOk += 1;
          });
        });
      });
    });
    check("96-case alias grid is numerically valid", gridCases === 96 && gridOk === 96, { gridCases: gridCases, gridOk: gridOk });

    return {
      ok: checked - failures.length,
      cases: checked,
      passed: checked - failures.length,
      checked: checked,
      gridCases: gridCases,
      failures: failures,
      defaultFacts: {
        topProb: defaultResult.dist.topProb,
        effective: defaultResult.dist.effective,
        aliasedColumns: defaultResult.aliasedColumns,
        aliasUseRate: defaultResult.aliasUseRate,
        aliasTv: defaultResult.aliasTv,
        aliasMaxError: defaultResult.aliasMaxError,
        reconstructionMaxError: defaultResult.reconstructionMaxError,
        expectedLinearComparisons: defaultResult.expectedLinearComparisons,
        linearComparisonsPerDraw: defaultResult.linearComparisonsPerDraw,
        binaryComparisonsPerDraw: defaultResult.binaryComparisonsPerDraw,
        breakEven: defaultResult.breakEven
      }
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "never";
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: digits == null ? 2 : digits,
      minimumFractionDigits: digits == null ? 2 : digits
    });
  }

  function formatPercent(value, digits) {
    return (value * 100).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="alias-table-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.floor(rect.width || 900));
    var height = width < 560 ? 1040 : 860;
    var dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawPanel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 20, COLORS.text, 13, 800);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 40, COLORS.muted, 11, 600);
  }

  function drawAliasTable(ctx, box, result) {
    var n = result.params.items;
    var table = result.table;
    var x = box.x + 18;
    var y = box.y + 66;
    var w = box.w - 36;
    var h = box.h - 96;
    var gap = n <= 18 ? 3 : 1.5;
    var colW = Math.max(4, (w - gap * (n - 1)) / n);
    var i;

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Alias table", "each column has one local item and at most one borrowed item");

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();

    for (i = 0; i < n; i += 1) {
      var cx = x + i * (colW + gap);
      var p = clamp(table.prob[i], 0, 1);
      var primaryH = p * h;
      var aliasH = h - primaryH;
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fillRect(cx, y + h - primaryH, colW, primaryH);
      if (aliasH > 0.5) {
        ctx.fillStyle = PALETTE[table.alias[i] % PALETTE.length];
        ctx.globalAlpha = 0.55;
        ctx.fillRect(cx, y, colW, aliasH);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = "rgba(23, 32, 38, 0.18)";
      ctx.strokeRect(cx, y, colW, h);

      if (n <= 20 || i % 2 === 0) {
        drawText(ctx, String(i + 1), cx + colW / 2, y + h + 16, COLORS.muted, 9, 700, "center");
      }
    }

    drawText(ctx, "column", x, y + h + 35, COLORS.muted, 10, 700);
    drawText(ctx, "solid = local mass; translucent = alias mass", x + w, y + h + 35, COLORS.muted, 10, 700, "right");
  }

  function drawDistribution(ctx, box, result) {
    var n = result.params.items;
    var rows = [];
    var i;
    for (i = 0; i < n; i += 1) {
      rows.push({
        index: i,
        label: result.dist.labels[i],
        p: result.dist.probs[i],
        empirical: result.aliasFreq[i],
        error: result.aliasFreq[i] - result.dist.probs[i]
      });
    }

    var shown = rows.slice(0, Math.min(n, box.w < 520 ? 12 : 16));
    var x = box.x + 18;
    var y = box.y + 62;
    var w = box.w - 36;
    var rowH = Math.min(22, (box.h - 82) / shown.length);
    var labelW = box.w < 520 ? 54 : 78;
    var barW = w - labelW - 80;
    var maxP = Math.max.apply(null, rows.map(function (r) { return Math.max(r.p, r.empirical); }));

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Draw audit", "target probability versus deterministic alias draws");

    shown.forEach(function (row, j) {
      var yy = y + j * rowH;
      drawText(ctx, String(row.index + 1), x, yy + rowH / 2, COLORS.muted, 10, 700);
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(x + labelW, yy + rowH * 0.24, barW, rowH * 0.52);
      ctx.fillStyle = PALETTE[row.index % PALETTE.length];
      ctx.fillRect(x + labelW, yy + rowH * 0.24, barW * row.p / maxP, rowH * 0.52);
      ctx.fillStyle = "rgba(37, 99, 235, 0.52)";
      ctx.fillRect(x + labelW, yy + rowH * 0.58, barW * row.empirical / maxP, rowH * 0.18);
      drawText(ctx, formatPercent(row.p, 1), x + labelW + barW + 8, yy + rowH / 2, COLORS.text, 10, 650);
      drawText(ctx, (row.error >= 0 ? "+" : "") + formatPercent(row.error, 2), x + w, yy + rowH / 2, row.error >= 0 ? COLORS.alias : COLORS.error, 10, 650, "right");
    });
  }

  function drawWork(ctx, box, result) {
    var values = [
      { label: "alias", value: result.aliasComparisonsPerDraw, color: COLORS.alias },
      { label: "binary CDF", value: result.binaryComparisonsPerDraw, color: COLORS.primary },
      { label: "linear CDF", value: result.linearComparisonsPerDraw, color: COLORS.spill }
    ];
    var maxV = Math.max.apply(null, values.map(function (v) { return v.value; }));
    var x = box.x + 20;
    var y = box.y + 78;
    var w = box.w - 40;
    var barH = 34;
    var gap = 18;

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Amortized work", "comparisons per draw after the table exists");

    values.forEach(function (row, i) {
      var yy = y + i * (barH + gap);
      drawText(ctx, row.label, x, yy - 11, COLORS.muted, 11, 750);
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(x, yy, w, barH);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, yy, w * row.value / maxV, barH);
      drawText(ctx, formatNumber(row.value, 2) + "x", x + w - 8, yy + barH / 2, "#ffffff", 13, 850, "right");
    });

    var noteY = y + values.length * (barH + gap) + 12;
    drawText(ctx, "build work: " + result.buildWork + " table steps", x, noteY, COLORS.text, 12, 750);
    drawText(ctx, "break-even versus linear scan: " + formatNumber(result.breakEven, 0) + " draws", x, noteY + 20, COLORS.muted, 11, 650);
    drawText(ctx, "alias branch used: " + formatPercent(result.aliasUseRate, 1), x, noteY + 40, COLORS.muted, 11, 650);
  }

  function drawCdf(ctx, box, result) {
    var cdf = result.cdf;
    var n = cdf.length;
    var x = box.x + 22;
    var y = box.y + 66;
    var w = box.w - 44;
    var h = box.h - 96;
    var i;

    drawPanel(ctx, box.x, box.y, box.w, box.h, "CDF staircase", "inversion keeps order, alias breaks it on purpose");

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (i = 0; i <= 4; i += 1) {
      var yy = y + h - i * h / 4;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.theory;
    ctx.lineWidth = 2;
    ctx.beginPath();
    var prev = 0;
    for (i = 0; i < n; i += 1) {
      var x0 = x + i * w / n;
      var x1 = x + (i + 1) * w / n;
      var y0 = y + h - prev * h;
      var y1 = y + h - cdf[i] * h;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y1);
      ctx.lineTo(x1, y1);
      prev = cdf[i];
    }
    ctx.stroke();

    drawText(ctx, "0", x - 4, y + h + 16, COLORS.muted, 10, 700, "right");
    drawText(ctx, "1", x - 4, y + 2, COLORS.muted, 10, 700, "right");
    drawText(ctx, "linear scan expected comparisons: " + formatNumber(result.expectedLinearComparisons, 2), x, y + h + 32, COLORS.muted, 11, 650);
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    var gap = 14;
    if (w < 680) {
      var panelH = (h - gap * 5) / 4;
      drawAliasTable(ctx, { x: 0, y: 0, w: w, h: panelH }, result);
      drawDistribution(ctx, { x: 0, y: panelH + gap, w: w, h: panelH }, result);
      drawWork(ctx, { x: 0, y: (panelH + gap) * 2, w: w, h: panelH }, result);
      drawCdf(ctx, { x: 0, y: (panelH + gap) * 3, w: w, h: panelH }, result);
      return;
    }

    var topH = 385;
    var bottomH = h - topH - gap;
    drawAliasTable(ctx, { x: 0, y: 0, w: w * 0.58 - gap / 2, h: topH }, result);
    drawDistribution(ctx, { x: w * 0.58 + gap / 2, y: 0, w: w * 0.42 - gap / 2, h: topH }, result);
    drawWork(ctx, { x: 0, y: topH + gap, w: w * 0.48 - gap / 2, h: bottomH }, result);
    drawCdf(ctx, { x: w * 0.48 + gap / 2, y: topH + gap, w: w * 0.52 - gap / 2, h: bottomH }, result);
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-output]").forEach(function (output) {
      var key = output.getAttribute("data-output");
      var value = params[key];
      if (key === "skew") value = (params.skew / 100).toFixed(2);
      output.textContent = value;
    });
  }

  function render(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    var result = evaluate(raw);
    updateOutputs(container, result.params);

    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      var audit = cachedAudit();
      metrics.innerHTML = [
        metric("top probability", formatPercent(result.dist.topProb, 1)),
        metric("effective items", formatNumber(result.dist.effective, 1)),
        metric("alias columns", String(result.aliasedColumns) + "/" + result.params.items),
        metric("TV error", formatPercent(result.aliasTv, 2)),
        metric("scan saved", formatNumber(result.expectedLinearComparisons - 1, 2) + "x"),
        metric("Audit", audit.passed + "/" + audit.checked)
      ].join("");
    }

    draw(result, container.querySelector("canvas[data-canvas]"));
  }

  function mount(container) {
    var schedule = null;
    function requestRender() {
      if (schedule != null) root.cancelAnimationFrame(schedule);
      schedule = root.requestAnimationFrame(function () {
        schedule = null;
        render(container);
      });
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });

    root.addEventListener("resize", requestRender);
    requestRender();
  }

  var api = {
    DEFAULTS: DEFAULTS,
    cleanParams: cleanParams,
    distribution: distribution,
    buildAlias: buildAlias,
    reconstruct: reconstruct,
    evaluate: evaluate,
    runAudit: runAudit
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AliasTableLab = api;

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", function () {
        root.document.querySelectorAll("[data-alias-table-lab]").forEach(mount);
      });
    } else {
      root.document.querySelectorAll("[data-alias-table-lab]").forEach(mount);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
