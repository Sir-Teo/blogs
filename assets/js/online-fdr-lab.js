(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#edf2f7",
    raw: "#be123c",
    spend: "#7c3aed",
    lond: "#0f766e",
    bh: "#2563eb",
    signal: "#059669",
    nulls: "#94a3b8",
    falseHit: "#e11d48",
    trueHit: "#10b981"
  };

  var METHODS = [
    { key: "raw", label: "Raw p<q", short: "Raw", color: COLORS.raw },
    { key: "spend", label: "Alpha-spending", short: "Spend", color: COLORS.spend },
    { key: "lond", label: "LOND", short: "LOND", color: COLORS.lond },
    { key: "bh", label: "Batch BH oracle", short: "BH", color: COLORS.bh }
  ];

  var ORDER_LABELS = {
    random: "random order",
    early: "early signals",
    late: "late signals",
    bursty: "bursty signals"
  };

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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeParams(input) {
    var order = input && ORDER_LABELS[input.order] ? input.order : "early";
    return {
      tests: clamp(Math.round(Number(input && input.tests) || 260), 80, 800),
      signalRate: clamp(Number(input && input.signalRate) || 12, 0, 35),
      strength: clamp(Number(input && input.strength) || 55, 15, 90),
      target: clamp(Number(input && input.target) || 10, 1, 20),
      order: order
    };
  }

  function seedFor(params, offset) {
    var orderCode = { random: 17, early: 31, late: 43, bursty: 59 }[params.order] || 17;
    return (20260618
      + params.tests * 3
      + Math.round(params.signalRate * 23)
      + Math.round(params.strength * 29)
      + Math.round(params.target * 37)
      + orderCode * 101
      + (offset || 0)) >>> 0;
  }

  function signalMask(params, rand) {
    var n = params.tests;
    var count = clamp(Math.round(n * params.signalRate / 100), 0, n);
    var scores = [];
    var i;

    for (i = 0; i < n; i += 1) {
      var score = rand();
      if (params.order === "early") {
        score += i / n * 1.8;
      } else if (params.order === "late") {
        score += (1 - i / n) * 1.8;
      } else if (params.order === "bursty") {
        var x = i / Math.max(1, n - 1);
        var d1 = Math.abs(x - 0.18);
        var d2 = Math.abs(x - 0.52);
        var d3 = Math.abs(x - 0.82);
        score += Math.min(d1, d2, d3) * 3.6;
      }
      scores.push({ index: i, score: score });
    }

    scores.sort(function (a, b) { return a.score - b.score; });
    var mask = new Array(n).fill(false);
    for (i = 0; i < count; i += 1) mask[scores[i].index] = true;
    return mask;
  }

  function gammaAt(index) {
    var t = index + 1;
    return 6 / (Math.PI * Math.PI * t * t);
  }

  function gammaSum(n) {
    var total = 0;
    for (var i = 0; i < n; i += 1) total += gammaAt(i);
    return total;
  }

  function generateStream(input, seedOffset) {
    var params = normalizeParams(input);
    var rand = rng(seedFor(params, seedOffset || 0));
    var mask = signalMask(params, rand);
    var strength = params.strength / 10;
    var rows = [];
    var signalCount = 0;

    for (var i = 0; i < params.tests; i += 1) {
      var alt = mask[i];
      var u = clamp(rand(), 1e-12, 1);
      var p = alt ? Math.pow(u, strength) : u;
      if (alt) signalCount += 1;
      rows.push({ index: i, alt: alt, p: clamp(p, 1e-12, 1) });
    }

    return { rows: rows, signalCount: signalCount, params: params };
  }

  function summarizeRows(rows, signalCount, decisions, thresholds) {
    var rejected = 0;
    var truePositives = 0;
    var falsePositives = 0;
    var prefixFdp = [];

    for (var i = 0; i < rows.length; i += 1) {
      if (decisions[i]) {
        rejected += 1;
        if (rows[i].alt) truePositives += 1;
        else falsePositives += 1;
      }
      prefixFdp.push(rejected ? falsePositives / rejected : 0);
    }

    return {
      decisions: decisions,
      thresholds: thresholds,
      rejected: rejected,
      truePositives: truePositives,
      falsePositives: falsePositives,
      fdp: rejected ? falsePositives / rejected : 0,
      power: signalCount ? truePositives / signalCount : 0,
      prefixFdp: prefixFdp
    };
  }

  function batchBh(rows, q) {
    var sorted = rows.slice().sort(function (a, b) { return a.p - b.p; });
    var m = sorted.length;
    var cutoff = -1;
    var decisions = new Array(m).fill(false);
    for (var i = 0; i < m; i += 1) {
      if (sorted[i].p <= q * (i + 1) / m) cutoff = i;
    }
    if (cutoff >= 0) {
      for (i = 0; i <= cutoff; i += 1) decisions[sorted[i].index] = true;
    }
    return {
      decisions: decisions,
      cutoff: cutoff >= 0 ? sorted[cutoff].p : 0,
      sorted: sorted
    };
  }

  function runProcedures(stream, q) {
    var rows = stream.rows;
    var n = rows.length;
    var rawDecisions = new Array(n).fill(false);
    var spendDecisions = new Array(n).fill(false);
    var londDecisions = new Array(n).fill(false);
    var rawThresholds = new Array(n);
    var spendThresholds = new Array(n);
    var londThresholds = new Array(n);
    var londDiscoveries = 0;

    for (var i = 0; i < n; i += 1) {
      var beta = q * gammaAt(i);
      var row = rows[i];
      rawThresholds[i] = q;
      spendThresholds[i] = beta;
      londThresholds[i] = clamp(beta * (londDiscoveries + 1), 0, 1);

      rawDecisions[i] = row.p <= rawThresholds[i];
      spendDecisions[i] = row.p <= spendThresholds[i];
      londDecisions[i] = row.p <= londThresholds[i];
      if (londDecisions[i]) londDiscoveries += 1;
    }

    var bh = batchBh(rows, q);
    var bhThresholds = new Array(n).fill(bh.cutoff || 0);

    return {
      raw: summarizeRows(rows, stream.signalCount, rawDecisions, rawThresholds),
      spend: summarizeRows(rows, stream.signalCount, spendDecisions, spendThresholds),
      lond: summarizeRows(rows, stream.signalCount, londDecisions, londThresholds),
      bh: summarizeRows(rows, stream.signalCount, bh.decisions, bhThresholds),
      sorted: bh.sorted,
      bhCutoff: bh.cutoff
    };
  }

  function emptyAcc(n) {
    var acc = {};
    METHODS.forEach(function (method) {
      acc[method.key] = {
        key: method.key,
        label: method.label,
        short: method.short,
        color: method.color,
        fdr: 0,
        power: 0,
        rejected: 0,
        falsePositives: 0,
        truePositives: 0,
        silent: 0,
        prefixFdr: new Array(n).fill(0)
      };
    });
    return acc;
  }

  function simulate(input, runs) {
    var params = normalizeParams(input);
    var q = params.target / 100;
    var campaigns = runs || (params.tests > 500 ? 120 : 160);
    var acc = emptyAcc(params.tests);
    var signalTotal = 0;

    for (var run = 0; run < campaigns; run += 1) {
      var stream = generateStream(params, run * 977 + 11);
      var procedures = runProcedures(stream, q);
      signalTotal += stream.signalCount;

      METHODS.forEach(function (method) {
        var summary = procedures[method.key];
        var row = acc[method.key];
        row.fdr += summary.fdp;
        row.power += summary.power;
        row.rejected += summary.rejected;
        row.falsePositives += summary.falsePositives;
        row.truePositives += summary.truePositives;
        row.silent += summary.rejected === 0 ? 1 : 0;
        for (var i = 0; i < params.tests; i += 1) {
          row.prefixFdr[i] += summary.prefixFdp[i];
        }
      });
    }

    return METHODS.map(function (method) {
      var row = acc[method.key];
      return {
        key: row.key,
        label: row.label,
        short: row.short,
        color: row.color,
        fdr: row.fdr / campaigns,
        power: row.power / campaigns,
        avgRejected: row.rejected / campaigns,
        avgFalsePositives: row.falsePositives / campaigns,
        avgTruePositives: row.truePositives / campaigns,
        silentRate: row.silent / campaigns,
        prefixFdr: row.prefixFdr.map(function (value) { return value / campaigns; })
      };
    }).concat([{
      key: "__meta",
      runs: campaigns,
      avgSignals: signalTotal / campaigns,
      gammaMass: gammaSum(params.tests)
    }]);
  }

  function auditResult(result) {
    var sample = result.sample.methods;
    var finite = result.summary.every(function (row) {
      if (row.key === "__meta") return isFinite(row.avgSignals) && isFinite(row.gammaMass);
      return isFinite(row.fdr)
        && isFinite(row.power)
        && isFinite(row.avgRejected)
        && row.prefixFdr.every(isFinite);
    });
    var levelsValid = ["raw", "spend", "lond", "bh"].every(function (key) {
      return sample[key].thresholds.every(function (value) {
        return isFinite(value) && value >= 0 && value <= 1;
      });
    });
    var spendInsideLond = sample.spend.decisions.every(function (decision, i) {
      return !decision || sample.lond.decisions[i];
    });
    var gammaOk = result.meta.gammaMass <= 1 + 1e-12;
    return {
      passed: finite && levelsValid && spendInsideLond && gammaOk,
      finite: finite,
      levelsValid: levelsValid,
      spendInsideLond: spendInsideLond,
      gammaOk: gammaOk
    };
  }

  function evaluate(input) {
    var params = normalizeParams(input);
    var q = params.target / 100;
    var stream = generateStream(params, 7);
    var methods = runProcedures(stream, q);
    var summaryWithMeta = simulate(params);
    var meta = summaryWithMeta.filter(function (row) { return row.key === "__meta"; })[0];
    var summary = summaryWithMeta.filter(function (row) { return row.key !== "__meta"; });
    var result = {
      params: params,
      q: q,
      sample: {
        stream: stream,
        methods: methods
      },
      summary: summary,
      meta: meta
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditOnlineFdrLab() {
    var total = 0;
    var passed = 0;
    var maxNullLond = 0;
    [160, 260].forEach(function (tests) {
      [0, 8, 18].forEach(function (signalRate) {
        ["early", "late"].forEach(function (order) {
          [5, 10].forEach(function (target) {
            total += 1;
            var result = evaluate({
              tests: tests,
              signalRate: signalRate,
              strength: 55,
              target: target,
              order: order
            });
            var lond = result.summary.filter(function (row) { return row.key === "lond"; })[0];
            if (signalRate === 0) maxNullLond = Math.max(maxNullLond, lond.fdr);
            if (result.audit.passed && (signalRate > 0 || lond.fdr <= Math.max(0.18, target / 100 * 2.6))) {
              passed += 1;
            }
          });
        });
      });
    });
    return { total: total, passed: passed, maxNullLond: maxNullLond };
  }

  function pct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function fmt(value, digits) {
    return value.toFixed(digits == null ? 1 : digits);
  }

  function methodBy(summary, key) {
    return summary.filter(function (row) { return row.key === key; })[0];
  }

  function metric(label, value) {
    return '<div class="online-fdr-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function scale(domain, range) {
    var d = domain.max - domain.min || 1;
    var r = range.max - range.min;
    return function (value) {
      return range.min + ((value - domain.min) / d) * r;
    };
  }

  function score(p) {
    return -Math.log(Math.max(1e-12, p)) / Math.LN10;
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 860);
    var height = width < 560 ? 820 : 620;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 12, COLORS.text, 13, 750);
    text(ctx, subtitle, box.x + 14, box.y + 31, COLORS.muted, 11, 500);
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

  function drawCurve(ctx, points, sx, sy, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (value, i) {
      var x = sx(i + 1);
      var y = sy(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawStreamPanel(ctx, box, result) {
    panel(ctx, box, "one stream", "thresholds are fixed before each p-value arrives");
    var plot = { x: box.x + 46, y: box.y + 62, w: box.w - 68, h: box.h - 96 };
    var rows = result.sample.stream.rows;
    var methods = result.sample.methods;
    var n = rows.length;
    var maxY = 1.4;

    rows.forEach(function (row, i) {
      maxY = Math.max(maxY, score(row.p), score(methods.lond.thresholds[i]));
    });
    maxY = clamp(maxY * 1.08, 2.2, 8);

    var sx = scale({ min: 1, max: n }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: maxY }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);

    drawCurve(ctx, methods.raw.thresholds.map(score), sx, sy, COLORS.raw, 1.5);
    drawCurve(ctx, methods.spend.thresholds.map(score), sx, sy, COLORS.spend, 1.7);
    drawCurve(ctx, methods.lond.thresholds.map(score), sx, sy, COLORS.lond, 2.2);

    var stride = Math.max(1, Math.floor(n / 340));
    for (var i = 0; i < n; i += stride) {
      var row = rows[i];
      var rejected = methods.lond.decisions[i];
      var x = sx(i + 1);
      var y = sy(score(row.p));
      ctx.fillStyle = row.alt ? COLORS.signal : COLORS.nulls;
      ctx.globalAlpha = row.alt ? 0.92 : 0.58;
      ctx.beginPath();
      ctx.arc(x, y, rejected ? 3.2 : 2.1, 0, Math.PI * 2);
      ctx.fill();
      if (rejected) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = row.alt ? COLORS.trueHit : COLORS.falseHit;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    text(ctx, "raw", plot.x + plot.w - 42, sy(score(result.q)) - 14, COLORS.raw, 11, 750);
    text(ctx, "LOND", plot.x + 8, sy(score(methods.lond.thresholds[0])) - 18, COLORS.lond, 11, 750);
    text(ctx, "test index", plot.x + plot.w / 2, box.y + box.h - 24, COLORS.muted, 11, 500, "center");
    ctx.save();
    ctx.translate(box.x + 16, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    text(ctx, "-log10(p)", 0, 0, COLORS.muted, 11, 500, "center");
    ctx.restore();
  }

  function drawPrefixPanel(ctx, box, result) {
    panel(ctx, box, "prefix FDR in simulation", "mean FDP after each prefix over repeated streams");
    var plot = { x: box.x + 46, y: box.y + 62, w: box.w - 68, h: box.h - 96 };
    var n = result.params.tests;
    var maxY = result.q * 1.7;

    result.summary.forEach(function (row) {
      row.prefixFdr.forEach(function (value) { maxY = Math.max(maxY, value); });
    });
    maxY = clamp(maxY * 1.08, 0.12, 1);

    var sx = scale({ min: 1, max: n }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: maxY }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);

    ctx.strokeStyle = "#6b7280";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, sy(result.q));
    ctx.lineTo(plot.x + plot.w, sy(result.q));
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "target q", plot.x + plot.w - 58, sy(result.q) - 16, "#6b7280", 11, 650);

    result.summary.forEach(function (row) {
      drawCurve(ctx, row.prefixFdr, sx, sy, row.color, row.key === "raw" ? 1.8 : 2.2);
    });

    text(ctx, "test index", plot.x + plot.w / 2, box.y + box.h - 24, COLORS.muted, 11, 500, "center");
    ctx.save();
    ctx.translate(box.x + 16, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    text(ctx, "mean FDP", 0, 0, COLORS.muted, 11, 500, "center");
    ctx.restore();
  }

  function drawBarsPanel(ctx, box, result) {
    panel(ctx, box, "operating ledger", "average discoveries split into true and false hits");
    var plot = { x: box.x + 54, y: box.y + 62, w: box.w - 82, h: box.h - 108 };
    var maxValue = 1;
    result.summary.forEach(function (row) {
      maxValue = Math.max(maxValue, row.avgRejected);
    });
    maxValue *= 1.2;
    var sy = scale({ min: 0, max: maxValue }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);

    var gap = plot.w / result.summary.length;
    var barW = Math.min(72, gap * 0.52);
    result.summary.forEach(function (row, i) {
      var x = plot.x + gap * i + gap / 2 - barW / 2;
      var falseH = sy(0) - sy(row.avgFalsePositives);
      var trueH = sy(0) - sy(row.avgTruePositives);
      var base = plot.y + plot.h;

      ctx.fillStyle = COLORS.trueHit;
      ctx.fillRect(x, base - trueH, barW, trueH);
      ctx.fillStyle = COLORS.falseHit;
      ctx.fillRect(x, base - trueH - falseH, barW, falseH);
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, base - trueH - falseH, barW, trueH + falseH);

      text(ctx, row.short, x + barW / 2, base + 12, COLORS.text, 11, 750, "center");
      text(ctx, pct(row.fdr, 1), x + barW / 2, base + 29, COLORS.muted, 10, 600, "center");
      text(ctx, fmt(row.avgRejected, 1), x + barW / 2, Math.max(plot.y, base - trueH - falseH - 18), row.color, 11, 750, "center");
    });

    text(ctx, "green=true, red=false; number below is FDR", box.x + box.w - 16, box.y + 47, COLORS.muted, 10, 500, "right");
    text(ctx, "avg discoveries", plot.x + plot.w / 2, box.y + box.h - 28, COLORS.muted, 11, 500, "center");
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (width < 560) {
      var pad = 14;
      drawStreamPanel(ctx, { x: pad, y: 16, w: width - 2 * pad, h: 234 }, result);
      drawPrefixPanel(ctx, { x: pad, y: 266, w: width - 2 * pad, h: 234 }, result);
      drawBarsPanel(ctx, { x: pad, y: 516, w: width - 2 * pad, h: height - 532 }, result);
    } else {
      var gap = 14;
      var sideW = (width - 36 - gap) / 2;
      drawStreamPanel(ctx, { x: 18, y: 18, w: sideW, h: 280 }, result);
      drawPrefixPanel(ctx, { x: 18 + sideW + gap, y: 18, w: sideW, h: 280 }, result);
      drawBarsPanel(ctx, { x: 18, y: 316, w: width - 36, h: height - 334 }, result);
    }
  }

  function renderMetrics(root, result) {
    var raw = methodBy(result.summary, "raw");
    var spend = methodBy(result.summary, "spend");
    var lond = methodBy(result.summary, "lond");
    var bh = methodBy(result.summary, "bh");
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    holder.innerHTML = [
      metric("Raw FDR", pct(raw.fdr, 1)),
      metric("Spend discoveries", fmt(spend.avgRejected, 1)),
      metric("LOND FDR", pct(lond.fdr, 1)),
      metric("LOND discoveries", fmt(lond.avgRejected, 1)),
      metric("BH oracle discoveries", fmt(bh.avgRejected, 1)),
      metric("Runs x tests", result.meta.runs + " x " + result.params.tests)
    ].join("");
  }

  function readControls(root) {
    var values = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      values[input.getAttribute("data-param")] = input.value;
    });
    return normalizeParams(values);
  }

  function updateOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (out) {
      var key = out.getAttribute("data-value");
      if (key === "tests") out.textContent = params.tests.toLocaleString();
      if (key === "signalRate") out.textContent = params.signalRate.toFixed(0) + "%";
      if (key === "strength") out.textContent = (params.strength / 10).toFixed(1);
      if (key === "target") out.textContent = params.target.toFixed(0) + "%";
      if (key === "order") out.textContent = ORDER_LABELS[params.order];
    });
  }

  function init(root) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var pending = false;

    function render() {
      pending = false;
      var params = readControls(root);
      updateOutputs(root, params);
      var result = evaluate(params);
      root.__onlineFdrResult = result;
      renderMetrics(root, result);
      draw(result, canvas);
    }

    function schedule() {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(render);
    }

    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-online-fdr-lab]")).forEach(init);
  }

  var api = {
    evaluate: evaluate,
    simulate: simulate,
    generateStream: generateStream,
    runProcedures: runProcedures,
    auditOnlineFdrLab: auditOnlineFdrLab,
    gammaAt: gammaAt,
    gammaSum: gammaSum
  };

  global.OnlineFdrLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
