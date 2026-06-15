(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    raw: "#be123c",
    bonf: "#7c3aed",
    bh: "#2563eb",
    by: "#b45309",
    storey: "#0f766e",
    nulls: "#94a3b8",
    signals: "#0f766e"
  };

  var METHOD_META = [
    { key: "raw", label: "Raw p<q", short: "Raw", color: COLORS.raw },
    { key: "bonf", label: "Bonferroni", short: "Bonf", color: COLORS.bonf },
    { key: "bh", label: "BH", short: "BH", color: COLORS.bh },
    { key: "by", label: "BY", short: "BY", color: COLORS.by },
    { key: "storey", label: "Storey-BH", short: "Storey", color: COLORS.storey }
  ];

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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    var z = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * z);
    var a1 = 0.254829592;
    var a2 = -0.284496736;
    var a3 = 1.421413741;
    var a4 = -1.453152027;
    var a5 = 1.061405429;
    var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return sign * y;
  }

  function normalCdf(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }

  function oneSidedP(z) {
    return clamp(1 - normalCdf(z), 1e-12, 1);
  }

  function harmonic(n) {
    var total = 0;
    for (var i = 1; i <= n; i += 1) total += 1 / i;
    return total;
  }

  function normalizeParams(input) {
    return {
      tests: clamp(Math.round(Number(input.tests) || 1200), 100, 3000),
      signalRate: clamp(Number(input.signalRate) || 8, 0, 35),
      effect: clamp(Number(input.effect) || 24, 5, 45),
      dependence: clamp(Number(input.dependence) || 30, 0, 85),
      target: clamp(Number(input.target) || 10, 1, 25)
    };
  }

  function seedFor(params, offset) {
    return (20260614
      + params.tests * 3
      + Math.round(params.signalRate * 17)
      + Math.round(params.effect * 31)
      + Math.round(params.dependence * 43)
      + Math.round(params.target * 59)
      + (offset || 0)) >>> 0;
  }

  function makeWorld(params, rand) {
    var m = params.tests;
    var pi1 = params.signalRate / 100;
    var mu = params.effect / 10;
    var rho = params.dependence / 100;
    var clusterCount = Math.max(1, Math.round(Math.sqrt(m)));
    var clusterShocks = [];
    var rows = [];
    var signalCount = 0;
    var shared = Math.sqrt(rho);
    var local = Math.sqrt(Math.max(0, 1 - rho));

    for (var c = 0; c < clusterCount; c += 1) {
      clusterShocks.push(normal(rand));
    }

    for (var i = 0; i < m; i += 1) {
      var alt = rand() < pi1;
      var z = (alt ? mu : 0) + shared * clusterShocks[i % clusterCount] + local * normal(rand);
      if (alt) signalCount += 1;
      rows.push({
        alt: alt,
        index: i,
        p: oneSidedP(z),
        z: z
      });
    }

    return { rows: rows, signalCount: signalCount, clusterCount: clusterCount };
  }

  function pi0Estimate(rows, lambda) {
    var above = 0;
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].p > lambda) above += 1;
    }
    return clamp(above / Math.max(1, rows.length * (1 - lambda)), 0.05, 1);
  }

  function rejectThreshold(sorted, threshold) {
    var rejected = [];
    for (var i = 0; i < sorted.length; i += 1) {
      if (sorted[i].p <= threshold) rejected.push(sorted[i]);
      else break;
    }
    return { rejected: rejected, cutoff: rejected.length ? rejected[rejected.length - 1].p : 0 };
  }

  function rejectStepUp(sorted, q, factor) {
    var m = sorted.length;
    var cutoff = -1;
    for (var i = 0; i < m; i += 1) {
      if (sorted[i].p <= ((i + 1) / m) * q / factor) cutoff = i;
    }
    if (cutoff < 0) return { rejected: [], cutoff: 0 };
    return { rejected: sorted.slice(0, cutoff + 1), cutoff: sorted[cutoff].p };
  }

  function summarizePick(pick, signalCount) {
    var r = pick.rejected.length;
    var truePositives = 0;
    for (var i = 0; i < pick.rejected.length; i += 1) {
      if (pick.rejected[i].alt) truePositives += 1;
    }
    var falsePositives = r - truePositives;
    return {
      rejected: r,
      truePositives: truePositives,
      falsePositives: falsePositives,
      fdp: r ? falsePositives / r : 0,
      power: signalCount ? truePositives / signalCount : 0,
      cutoff: pick.cutoff
    };
  }

  function applyProcedures(world, q) {
    var sorted = world.rows.slice().sort(function (a, b) { return a.p - b.p; });
    var h = harmonic(sorted.length);
    var pi0 = pi0Estimate(world.rows, 0.5);
    var picks = {
      raw: rejectThreshold(sorted, q),
      bonf: rejectThreshold(sorted, q / sorted.length),
      bh: rejectStepUp(sorted, q, 1),
      by: rejectStepUp(sorted, q, h),
      storey: rejectStepUp(sorted, q, pi0)
    };
    var summaries = {};
    METHOD_META.forEach(function (method) {
      summaries[method.key] = summarizePick(picks[method.key], world.signalCount);
    });
    return {
      harmonic: h,
      pi0: pi0,
      q: q,
      sorted: sorted,
      picks: picks,
      summaries: summaries
    };
  }

  function addSummary(acc, key, summary) {
    acc[key].fdp += summary.fdp;
    acc[key].power += summary.power;
    acc[key].rejected += summary.rejected;
    acc[key].silent += summary.rejected === 0 ? 1 : 0;
    acc[key].falsePositives += summary.falsePositives;
    acc[key].truePositives += summary.truePositives;
  }

  function simulate(params, campaigns) {
    var normalized = normalizeParams(params);
    var q = normalized.target / 100;
    var rand = rng(seedFor(normalized, 99 + campaigns));
    var acc = {};
    var pi0Total = 0;
    var signalTotal = 0;
    METHOD_META.forEach(function (method) {
      acc[method.key] = {
        key: method.key,
        label: method.label,
        short: method.short,
        color: method.color,
        fdp: 0,
        power: 0,
        rejected: 0,
        silent: 0,
        falsePositives: 0,
        truePositives: 0
      };
    });

    for (var run = 0; run < campaigns; run += 1) {
      var world = makeWorld(normalized, rand);
      var procedures = applyProcedures(world, q);
      pi0Total += procedures.pi0;
      signalTotal += world.signalCount;
      METHOD_META.forEach(function (method) {
        addSummary(acc, method.key, procedures.summaries[method.key]);
      });
    }

    return METHOD_META.map(function (method) {
      var row = acc[method.key];
      return {
        key: row.key,
        label: row.label,
        short: row.short,
        color: row.color,
        fdr: row.fdp / campaigns,
        power: row.power / campaigns,
        avgRejected: row.rejected / campaigns,
        silentRate: row.silent / campaigns,
        falsePositives: row.falsePositives / campaigns,
        truePositives: row.truePositives / campaigns
      };
    }).concat([{
      key: "__meta",
      avgPi0: pi0Total / campaigns,
      avgSignals: signalTotal / campaigns
    }]);
  }

  function pHistogram(world, bins) {
    var nulls = [];
    var signals = [];
    for (var b = 0; b < bins; b += 1) {
      nulls.push(0);
      signals.push(0);
    }
    world.rows.forEach(function (row) {
      var idx = clamp(Math.floor(row.p * bins), 0, bins - 1);
      if (row.alt) signals[idx] += 1;
      else nulls[idx] += 1;
    });
    return { nulls: nulls, signals: signals };
  }

  function auditResult(result) {
    var s = result.sample.summaries;
    var finite = result.summary.every(function (row) {
      if (row.key === "__meta") return isFinite(row.avgPi0) && isFinite(row.avgSignals);
      return isFinite(row.fdr) && isFinite(row.power) && isFinite(row.avgRejected);
    });
    var nested = s.by.rejected <= s.bh.rejected
      && s.bonf.rejected <= s.bh.rejected
      && s.bh.rejected <= s.storey.rejected
      && s.bh.rejected <= s.raw.rejected;
    var sorted = result.sample.sorted.every(function (row, i, arr) {
      return i === 0 || arr[i - 1].p <= row.p + 1e-15;
    });
    return { passed: finite && nested && sorted, finite: finite, nested: nested, sorted: sorted };
  }

  function evaluate(input) {
    var params = normalizeParams(input);
    var q = params.target / 100;
    var sampleRand = rng(seedFor(params, 7));
    var world = makeWorld(params, sampleRand);
    var procedures = applyProcedures(world, q);
    var summary = simulate(params, 180);
    var meta = summary.filter(function (row) { return row.key === "__meta"; })[0];
    var visibleSummary = summary.filter(function (row) { return row.key !== "__meta"; });
    var result = {
      params: params,
      q: q,
      sample: {
        world: world,
        sorted: procedures.sorted,
        summaries: procedures.summaries,
        picks: procedures.picks,
        harmonic: procedures.harmonic,
        pi0: procedures.pi0,
        hist: pHistogram(world, 28)
      },
      summary: visibleSummary,
      meta: meta
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditGrid() {
    var tests = [300, 900, 1800];
    var signals = [0, 5, 15];
    var dependence = [0, 35, 70];
    var targets = [5, 10];
    var total = 0;
    var passed = 0;
    var maxNullBh = 0;
    tests.forEach(function (m) {
      signals.forEach(function (signalRate) {
        dependence.forEach(function (rho) {
          targets.forEach(function (target) {
            total += 1;
            var result = evaluate({
              tests: m,
              signalRate: signalRate,
              effect: 24,
              dependence: rho,
              target: target
            });
            var bh = result.summary.filter(function (row) { return row.key === "bh"; })[0];
            if (signalRate === 0) maxNullBh = Math.max(maxNullBh, bh.fdr);
            if (result.audit.passed && bh.fdr <= Math.max(0.35, target / 100 * 2.3)) passed += 1;
          });
        });
      });
    });
    return { total: total, passed: passed, maxNullBh: maxNullBh };
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value) {
    return '<div class="fdr-frontier-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function scale(domain, range) {
    var d = domain.max - domain.min || 1;
    var r = range.max - range.min;
    return function (value) {
      return range.min + ((value - domain.min) / d) * r;
    };
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 820);
    var height = width < 560 ? 800 : 560;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x + 14, box.y + 12);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(subtitle, box.x + 14, box.y + 31);
  }

  function drawGrid(ctx, plot, xSteps, ySteps) {
    ctx.strokeStyle = COLORS.faint;
    ctx.lineWidth = 1;
    for (var i = 0; i <= xSteps; i += 1) {
      var x = plot.x + plot.w * i / xSteps;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    for (var j = 0; j <= ySteps; j += 1) {
      var y = plot.y + plot.h * j / ySteps;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawSortedPanel(ctx, box, result) {
    panel(ctx, box, "step-up geometry", "ordered p-values meet moving budgets");
    var plot = { x: box.x + 48, y: box.y + 62, w: box.w - 68, h: box.h - 94 };
    var sorted = result.sample.sorted;
    var m = sorted.length;
    var q = result.q;
    var bhCut = result.sample.summaries.bh.rejected;
    var byCut = result.sample.summaries.by.rejected;
    var storeyCut = result.sample.summaries.storey.rejected;
    var yMax = clamp(Math.max(q * 2.2, result.sample.summaries.storey.cutoff * 1.8, 0.025), 0.025, 0.5);
    var sx = scale({ min: 1, max: m }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: yMax }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);

    function drawBudget(factor, color, label) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (var step = 1; step <= 96; step += 1) {
        var rank = 1 + (m - 1) * step / 96;
        var value = Math.min(yMax, (rank / m) * q / factor);
        var x = sx(rank);
        var y = sy(value);
        if (step === 1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(label, plot.x + plot.w - 62, sy(Math.min(yMax, q / factor)) - 14);
    }

    drawBudget(1, COLORS.bh, "BH");
    drawBudget(result.sample.harmonic, COLORS.by, "BY");

    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    var stride = Math.max(1, Math.floor(m / 420));
    for (var i = 0; i < m; i += stride) {
      var py = sy(Math.min(sorted[i].p, yMax));
      var px = sx(i + 1);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    [
      { cut: byCut, color: COLORS.by, label: "BY" },
      { cut: bhCut, color: COLORS.bh, label: "BH" },
      { cut: storeyCut, color: COLORS.storey, label: "adaptive" }
    ].forEach(function (mark, idx) {
      if (!mark.cut) return;
      var x = sx(mark.cut);
      var y = sy(Math.min(sorted[mark.cut - 1].p, yMax));
      ctx.strokeStyle = mark.color;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = mark.color;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(mark.label, x + 6, plot.y + 10 + idx * 14);
    });

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("rank", plot.x + plot.w / 2, box.y + box.h - 22);
    ctx.save();
    ctx.translate(box.x + 15, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("p-value", 0, 0);
    ctx.restore();
  }

  function drawHistogramPanel(ctx, box, result) {
    panel(ctx, box, "p-value mixture", "uniform null shelf plus signal pile-up");
    var plot = { x: box.x + 38, y: box.y + 62, w: box.w - 58, h: box.h - 94 };
    var nulls = result.sample.hist.nulls;
    var signals = result.sample.hist.signals;
    var bins = nulls.length;
    var maxCount = 1;
    for (var i = 0; i < bins; i += 1) maxCount = Math.max(maxCount, nulls[i] + signals[i]);
    var sx = scale({ min: 0, max: bins }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: maxCount * 1.15 }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);
    for (var b = 0; b < bins; b += 1) {
      var x = sx(b);
      var w = Math.max(1, sx(b + 1) - x - 2);
      var nullY = sy(nulls[b]);
      var sigY = sy(nulls[b] + signals[b]);
      ctx.fillStyle = COLORS.nulls;
      ctx.fillRect(x + 1, nullY, w, plot.y + plot.h - nullY);
      ctx.fillStyle = COLORS.signals;
      ctx.fillRect(x + 1, sigY, w, nullY - sigY);
    }

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("p", plot.x + plot.w / 2, box.y + box.h - 22);
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.signals;
    ctx.fillText("signals", plot.x + 6, plot.y + 8);
    ctx.fillStyle = COLORS.nulls;
    ctx.fillText("nulls", plot.x + 6, plot.y + 23);
  }

  function drawFrontierPanel(ctx, box, result) {
    panel(ctx, box, "operating frontier", "each point is 180 repeated discovery tables");
    var plot = { x: box.x + 54, y: box.y + 62, w: box.w - 80, h: box.h - 104 };
    var maxFdr = result.summary.reduce(function (mx, row) { return Math.max(mx, row.fdr); }, result.q);
    var maxRejected = result.summary.reduce(function (mx, row) { return Math.max(mx, row.avgRejected); }, 1);
    var xMax = clamp(Math.max(result.q * 1.6, maxFdr * 1.2, 0.08), 0.08, 0.8);
    var sx = scale({ min: 0, max: xMax }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: 1 }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);

    ctx.strokeStyle = COLORS.bh;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(result.q), plot.y);
    ctx.lineTo(sx(result.q), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.bh;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("target q", sx(result.q) + 5, plot.y + 10);

    var labelOffsets = {
      raw: { align: "center", dx: 0, dy: -28 },
      bonf: { align: "left", dx: 10, dy: 16 },
      bh: { align: "right", dx: -10, dy: 17 },
      by: { align: "left", dx: 10, dy: -17 },
      storey: { align: "left", dx: 12, dy: -22 }
    };

    result.summary.forEach(function (row) {
      var x = sx(Math.min(row.fdr, xMax));
      var y = sy(row.power);
      var radius = 5 + 12 * Math.sqrt(row.avgRejected / maxRejected);
      var offset = labelOffsets[row.key] || { align: "left", dx: 10, dy: -10 };
      ctx.fillStyle = row.color;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (box.w < 480 && row.key !== "raw" && row.key !== "storey") return;
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = offset.align;
      ctx.textBaseline = "middle";
      var label = row.short || row.label;
      var lx = x + offset.dx;
      if (offset.align === "center") {
        lx = clamp(lx, plot.x + 28, plot.x + plot.w - 28);
      } else if (offset.align === "right") {
        lx = clamp(lx, plot.x + 34, plot.x + plot.w - 2);
      } else {
        lx = clamp(lx, plot.x + 2, plot.x + plot.w - 42);
      }
      ctx.fillText(label, lx, clamp(y + offset.dy, plot.y + 10, plot.y + plot.h - 10));
    });

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("empirical FDR", plot.x + plot.w / 2, box.y + box.h - 24);
    ctx.save();
    ctx.translate(box.x + 17, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("power", 0, 0);
    ctx.restore();
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (width < 560) {
      var gap = 14;
      var panelH = (height - 4 * gap) / 3;
      drawSortedPanel(ctx, { x: 0, y: 0, w: width, h: panelH }, result);
      drawHistogramPanel(ctx, { x: 0, y: panelH + gap, w: width, h: panelH }, result);
      drawFrontierPanel(ctx, { x: 0, y: 2 * (panelH + gap), w: width, h: panelH + gap }, result);
    } else {
      var topH = Math.round(height * 0.47);
      var gap2 = 16;
      drawSortedPanel(ctx, { x: 0, y: 0, w: (width - gap2) * 0.58, h: topH }, result);
      drawHistogramPanel(ctx, { x: (width - gap2) * 0.58 + gap2, y: 0, w: width - ((width - gap2) * 0.58 + gap2), h: topH }, result);
      drawFrontierPanel(ctx, { x: 0, y: topH + gap2, w: width, h: height - topH - gap2 }, result);
    }
  }

  function render(root) {
    var params = {};
    Array.prototype.slice.call(root.querySelectorAll("input[data-param]")).forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(params);
    var values = {
      tests: result.params.tests.toLocaleString(),
      signalRate: result.params.signalRate + "%",
      effect: (result.params.effect / 10).toFixed(1),
      dependence: result.params.dependence + "%",
      target: result.params.target + "%"
    };
    Object.keys(values).forEach(function (key) {
      var out = root.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = values[key];
    });

    var bh = result.summary.filter(function (row) { return row.key === "bh"; })[0];
    var by = result.summary.filter(function (row) { return row.key === "by"; })[0];
    var storey = result.summary.filter(function (row) { return row.key === "storey"; })[0];
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("BH FDR", formatPercent(bh.fdr)),
        metric("BH power", formatPercent(bh.power)),
        metric("BH discoveries", formatNumber(bh.avgRejected, 1)),
        metric("Storey FDR", formatPercent(storey.fdr)),
        metric("BY discoveries", formatNumber(by.avgRejected, 1)),
        metric("Audit", result.audit.passed ? "passed" : "check")
      ].join("");
    }

    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("input[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-fdr-frontier-lab]")).forEach(init);
  }

  var api = {
    applyProcedures: applyProcedures,
    auditGrid: auditGrid,
    evaluate: evaluate,
    makeWorld: makeWorld,
    normalCdf: normalCdf,
    rng: rng,
    simulate: simulate
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.FDRFrontierLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
