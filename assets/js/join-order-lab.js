(function (global) {
  "use strict";

  var COLORS = {
    actual: "#2563eb",
    bad: "#be123c",
    estimate: "#b45309",
    fact: "#0f766e",
    grid: "#edf2f7",
    good: "#0f766e",
    hidden: "#7c3aed",
    muted: "#5d6872",
    panel: "#f8fafc",
    rule: "#d7dee5",
    text: "#172026",
    white: "#ffffff"
  };

  var DEFAULTS = {
    correlation: 78,
    extendedStats: 0,
    factRows: 8,
    indexTemptation: 78,
    planner: "dp"
  };

  var PLANNERS = ["dp", "greedy"];

  var DIMS = [
    { key: "R", label: "region = west", marginal: 0.12, rows: 1200000, group: "launch", weight: 1.0, lookup: 5.8 },
    { key: "M", label: "mobile app", marginal: 0.34, rows: 4200000, group: "launch", weight: 0.70, lookup: 5.2 },
    { key: "P", label: "promo click", marginal: 0.08, rows: 1800000, group: "launch", weight: 1.05, lookup: 4.9 },
    { key: "G", label: "gpu category", marginal: 0.055, rows: 900000, group: "launch", weight: 1.12, lookup: 4.5 },
    { key: "N", label: "new account", marginal: 0.24, rows: 2300000, group: "independent", weight: 0.0, lookup: 5.5 },
    { key: "S", label: "support flag", marginal: 0.30, rows: 650000, group: "independent", weight: 0.0, lookup: 6.2 }
  ];

  var ALL_MASK = (1 << DIMS.length) - 1;
  var LAMBDA = 0.16;
  var PERMS = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      correlation: Math.round(clamp(finite(Number(raw.correlation), DEFAULTS.correlation), 0, 95)),
      extendedStats: Math.round(clamp(finite(Number(raw.extendedStats), DEFAULTS.extendedStats), 0, 100)),
      factRows: Math.round(clamp(finite(Number(raw.factRows), DEFAULTS.factRows), 1, 30)),
      indexTemptation: Math.round(clamp(finite(Number(raw.indexTemptation), DEFAULTS.indexTemptation), 0, 100)),
      planner: PLANNERS.indexOf(String(raw.planner)) >= 0 ? String(raw.planner) : DEFAULTS.planner
    };
  }

  function bit(index) {
    return 1 << index;
  }

  function factRows(params) {
    return params.factRows * 1000000;
  }

  function dimFilteredRows(dim) {
    return dim.rows * dim.marginal;
  }

  function launchConditionals(params) {
    var strength = params.correlation / 100;
    return DIMS.map(function (dim) {
      if (dim.group !== "launch") return null;
      var cap = Math.min(0.94, dim.marginal / LAMBDA * 0.96);
      var high = dim.marginal + strength * dim.weight * (cap - dim.marginal);
      high = clamp(high, dim.marginal, cap);
      var low = (dim.marginal - LAMBDA * high) / (1 - LAMBDA);
      return {
        high: clamp(low < 0 ? dim.marginal / LAMBDA * 0.96 : high, 1e-6, 0.98),
        low: clamp(low, 1e-8, 0.98)
      };
    });
  }

  function productQ(mask) {
    var q = 1;
    for (var i = 0; i < DIMS.length; i += 1) {
      if (mask & bit(i)) q *= DIMS[i].marginal;
    }
    return q;
  }

  function trueQ(mask, params) {
    if (mask === 0) return 1;
    var cond = launchConditionals(params);
    var hasLaunch = false;
    var high = 1;
    var low = 1;
    var independent = 1;
    for (var i = 0; i < DIMS.length; i += 1) {
      if (!(mask & bit(i))) continue;
      if (DIMS[i].group === "launch") {
        hasLaunch = true;
        high *= cond[i].high;
        low *= cond[i].low;
      } else {
        independent *= DIMS[i].marginal;
      }
    }
    return independent * (hasLaunch ? (LAMBDA * high + (1 - LAMBDA) * low) : 1);
  }

  function estimatedQ(mask, params) {
    var prod = Math.max(1e-15, productQ(mask));
    var truth = Math.max(1e-15, trueQ(mask, params));
    var trust = params.extendedStats / 100;
    return Math.exp((1 - trust) * Math.log(prod) + trust * Math.log(truth));
  }

  function rowsFor(mask, params, kind) {
    var q = kind === "true" ? trueQ(mask, params) : estimatedQ(mask, params);
    return Math.max(1, factRows(params) * q);
  }

  function qError(estimate, actual) {
    estimate = Math.max(1e-12, estimate);
    actual = Math.max(1e-12, actual);
    return Math.max(estimate / actual, actual / estimate);
  }

  function log10(value) {
    return Math.log(value) / Math.LN10;
  }

  function lookupCost(dim, params) {
    var discount = 1 - 0.72 * params.indexTemptation / 100;
    return Math.max(1.05, dim.lookup * discount);
  }

  function stepCost(method, currentRows, outputRows, dim, params) {
    if (method === "index") {
      var cacheRows = 14000 - 10500 * params.indexTemptation / 100;
      var amplification = 1 + Math.pow(currentRows / Math.max(800, cacheRows), 0.82);
      return currentRows * lookupCost(dim, params) * amplification + outputRows * 0.4;
    }
    return currentRows * 0.22 + dimFilteredRows(dim) * 0.9 + outputRows * 0.82;
  }

  function chooseStep(mask, next, params, kind) {
    var dim = DIMS[next];
    var current = rowsFor(mask, params, kind);
    var output = rowsFor(mask | bit(next), params, kind);
    var hash = stepCost("hash", current, output, dim, params);
    var index = stepCost("index", current, output, dim, params);
    return {
      cost: Math.min(hash, index),
      currentRows: current,
      dim: next,
      hashCost: hash,
      indexCost: index,
      mask: mask | bit(next),
      method: index < hash ? "index" : "hash",
      outputRows: output
    };
  }

  function planCost(order, params, kind) {
    var mask = 0;
    var cost = 0;
    var steps = [];
    order.forEach(function (next) {
      var step = chooseStep(mask, next, params, kind);
      cost += step.cost;
      steps.push(step);
      mask = step.mask;
    });
    return { cost: cost, order: order.slice(), steps: steps };
  }

  function actualCostWithMethods(order, methods, params) {
    var mask = 0;
    var cost = 0;
    var steps = [];
    order.forEach(function (next, index) {
      var dim = DIMS[next];
      var current = rowsFor(mask, params, "true");
      var output = rowsFor(mask | bit(next), params, "true");
      var method = methods[index];
      var step = {
        cost: stepCost(method, current, output, dim, params),
        currentRows: current,
        dim: next,
        mask: mask | bit(next),
        method: method,
        outputRows: output
      };
      cost += step.cost;
      steps.push(step);
      mask = step.mask;
    });
    return { cost: cost, order: order.slice(), steps: steps };
  }

  function methods(plan) {
    return plan.steps.map(function (step) { return step.method; });
  }

  function allPermutations() {
    if (PERMS) return PERMS;
    var rows = [];
    function rec(prefix, used) {
      if (prefix.length === DIMS.length) {
        rows.push(prefix.slice());
        return;
      }
      for (var i = 0; i < DIMS.length; i += 1) {
        if (used & bit(i)) continue;
        prefix.push(i);
        rec(prefix, used | bit(i));
        prefix.pop();
      }
    }
    rec([], 0);
    PERMS = rows;
    return rows;
  }

  function bestExhaustive(params, kind) {
    var best = null;
    allPermutations().forEach(function (order) {
      var plan = planCost(order, params, kind);
      if (!best || plan.cost < best.cost) best = plan;
    });
    return best;
  }

  function bestGreedy(params, kind) {
    var order = [];
    var mask = 0;
    while (order.length < DIMS.length) {
      var best = null;
      for (var i = 0; i < DIMS.length; i += 1) {
        if (mask & bit(i)) continue;
        var step = chooseStep(mask, i, params, kind);
        if (!best || step.cost < best.step.cost) best = { dim: i, step: step };
      }
      order.push(best.dim);
      mask |= bit(best.dim);
    }
    return planCost(order, params, kind);
  }

  function choosePlan(params, kind, planner) {
    if (planner === "greedy") return bestGreedy(params, kind);
    return bestExhaustive(params, kind);
  }

  function enrichSteps(estimatedPlan, actualPlan, params) {
    return estimatedPlan.steps.map(function (est, index) {
      var actual = actualPlan.steps[index];
      return {
        dim: est.dim,
        estCurrent: est.currentRows,
        estOutput: est.outputRows,
        actualCurrent: actual.currentRows,
        actualOutput: actual.outputRows,
        cost: actual.cost,
        mask: est.mask,
        method: est.method,
        qerr: qError(est.outputRows, actual.outputRows),
        signedError: log10(est.outputRows / Math.max(1, actual.outputRows))
      };
    });
  }

  function planLabel(order) {
    return order.map(function (i) { return DIMS[i].key; }).join(" -> ");
  }

  function sweep(params) {
    var rows = [];
    for (var c = 0; c <= 95; c += 5) {
      var p = Object.assign({}, params, { correlation: c });
      var chosenEst = choosePlan(p, "estimate", p.planner);
      var chosenActual = actualCostWithMethods(chosenEst.order, methods(chosenEst), p);
      var oracle = choosePlan(p, "true", "dp");
      rows.push({
        correlation: c,
        slowdown: chosenActual.cost / Math.max(1, oracle.cost)
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var chosenEst = choosePlan(params, "estimate", params.planner);
    var chosenActual = actualCostWithMethods(chosenEst.order, methods(chosenEst), params);
    var oracle = choosePlan(params, "true", "dp");
    var chosenSteps = enrichSteps(chosenEst, chosenActual, params);
    var finalEst = rowsFor(ALL_MASK, params, "estimate");
    var finalTrue = rowsFor(ALL_MASK, params, "true");
    var maxQ = chosenSteps.reduce(function (best, step) { return Math.max(best, step.qerr); }, 1);
    var firstTrap = chosenSteps.find(function (step) {
      return step.method === "index" && step.actualCurrent / Math.max(1, step.estCurrent) > 10;
    });
    return {
      chosenActual: chosenActual,
      chosenEst: chosenEst,
      chosenSteps: chosenSteps,
      conditionals: launchConditionals(params),
      finalEst: finalEst,
      finalQError: qError(finalEst, finalTrue),
      finalTrue: finalTrue,
      maxPrefixQError: maxQ,
      oracle: oracle,
      params: params,
      stats: {
        chosenCost: chosenActual.cost,
        chosenPlan: planLabel(chosenEst.order),
        finalQError: qError(finalEst, finalTrue),
        firstTrap: firstTrap ? DIMS[firstTrap.dim].key : "none",
        maxPrefixQError: maxQ,
        oracleCost: oracle.cost,
        oraclePlan: planLabel(oracle.order),
        slowdown: chosenActual.cost / Math.max(1, oracle.cost)
      },
      sweep: sweep(params)
    };
  }

  function audit() {
    var failures = [];
    function record(name, condition) {
      if (!condition) failures.push(name);
    }
    var clean = cleanParams({ correlation: -10, extendedStats: 999, factRows: "no", indexTemptation: 500, planner: "bogus" });
    record("sanitizes parameters", clean.correlation === 0 && clean.extendedStats === 100 && clean.factRows === DEFAULTS.factRows && clean.indexTemptation === 100 && clean.planner === DEFAULTS.planner);

    function run(raw) {
      var result = evaluate(raw);
      record("finite slowdown " + JSON.stringify(raw), Number.isFinite(result.stats.slowdown));
      record("oracle no worse " + JSON.stringify(raw), result.oracle.cost <= result.chosenActual.cost + 1e-6);
      record("rows monotone " + JSON.stringify(raw), result.chosenSteps.every(function (step) { return step.actualOutput <= step.actualCurrent + 1e-6 && step.estOutput <= step.estCurrent + 1e-6; }));
      record("valid methods " + JSON.stringify(raw), result.chosenSteps.every(function (step) { return step.method === "hash" || step.method === "index"; }));
      return result;
    }

    var base = run(DEFAULTS);
    var perfect = run(Object.assign({}, DEFAULTS, { extendedStats: 100, planner: "dp" }));
    record("perfect stats find oracle", perfect.stats.slowdown < 1.000001);
    record("default misestimates final rows", base.stats.finalQError > 5);
    var noCorr = run(Object.assign({}, DEFAULTS, { correlation: 0 }));
    record("correlation creates q-error", base.stats.maxPrefixQError > noCorr.stats.maxPrefixQError);
    var safer = run(Object.assign({}, DEFAULTS, { extendedStats: 80 }));
    record("extended stats reduce final q-error", safer.stats.finalQError < base.stats.finalQError);

    [0, 35, 70, 95].forEach(function (correlation) {
      [0, 50, 100].forEach(function (extendedStats) {
        [0, 60, 100].forEach(function (indexTemptation) {
          ["dp", "greedy"].forEach(function (planner) {
            run({ correlation: correlation, extendedStats: extendedStats, factRows: 12, indexTemptation: indexTemptation, planner: planner });
          });
        });
      });
    });
    return { failures: failures, ok: failures.length === 0 };
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      raw[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    return raw;
  }

  function formatRows(value) {
    if (!Number.isFinite(value)) return "n/a";
    if (value >= 1000000000) return (value / 1000000000).toFixed(2) + "B";
    if (value >= 1000000) return (value / 1000000).toFixed(value >= 10000000 ? 1 : 2) + "M";
    if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 1 : 2) + "k";
    return value.toFixed(0);
  }

  function formatFactor(value) {
    if (!Number.isFinite(value)) return "n/a";
    if (value >= 1000) return value.toFixed(0) + "x";
    if (value >= 100) return value.toFixed(1) + "x";
    if (value >= 10) return value.toFixed(2) + "x";
    return value.toFixed(2) + "x";
  }

  function formatCost(value) {
    return formatRows(value).replace("B", "B units").replace("M", "M units").replace("k", "k units");
  }

  function metric(label, value) {
    return '<div class="join-order-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function updateOutputs(root, params) {
    var display = {
      correlation: params.correlation + "%",
      extendedStats: params.extendedStats + "%",
      factRows: params.factRows + "M",
      indexTemptation: params.indexTemptation + "%"
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")] || "";
    });
  }

  function renderMetrics(root, result) {
    var html = [
      metric("chosen slowdown", formatFactor(result.stats.slowdown)),
      metric("final q-error", formatFactor(result.stats.finalQError)),
      metric("max prefix q-error", formatFactor(result.stats.maxPrefixQError)),
      metric("chosen plan", result.stats.chosenPlan),
      metric("oracle plan", result.stats.oraclePlan),
      metric("index trap", result.stats.firstTrap),
      metric("actual cost", formatCost(result.stats.chosenCost))
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = targetHeight + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(targetHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, targetHeight);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, targetHeight);
    return { ctx: ctx, height: targetHeight, width: width };
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

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(title, box.x + 13, box.y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.fillText(subtitle, box.x + 13, box.y + 39);
    }
  }

  function label(ctx, text, x, y, color, align, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "12px system-ui, -apple-system, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function drawGrid(ctx, plot, zeroY) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h - i * plot.h / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    if (zeroY != null) {
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, zeroY);
      ctx.lineTo(plot.x + plot.w, zeroY);
      ctx.stroke();
    }
  }

  function drawHiddenModel(ctx, result, box) {
    panel(ctx, box, "The data has a hidden segment", "single-column stats see marginals");
    var left = box.x + 18;
    var top = box.y + 56;
    var rowH = Math.max(22, (box.h - 78) / DIMS.length);
    DIMS.forEach(function (dim, i) {
      var y = top + i * rowH;
      var cond = result.conditionals[i];
      var launch = dim.group === "launch";
      ctx.fillStyle = launch ? COLORS.hidden : COLORS.muted;
      ctx.globalAlpha = launch ? 0.15 : 0.08;
      roundRect(ctx, left, y - 14, box.w - 36, rowH - 4, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
      label(ctx, dim.key, left + 8, y + 1, launch ? COLORS.hidden : COLORS.muted, "left", "700 12px system-ui, sans-serif");
      label(ctx, dim.label, left + 30, y + 1, COLORS.text);
      label(ctx, "marg " + (dim.marginal * 100).toFixed(1) + "%", box.x + box.w - 112, y + 1, COLORS.estimate);
      if (launch) label(ctx, "hidden " + (cond.high * 100).toFixed(1) + "%", box.x + box.w - 52, y + 1, COLORS.hidden);
      else label(ctx, "indep", box.x + box.w - 52, y + 1, COLORS.muted);
    });
  }

  function drawPlan(ctx, result, box) {
    panel(ctx, box, "Chosen plan ladder", "bars are actual rows; ticks are estimated rows");
    var plot = { x: box.x + 104, y: box.y + 54, w: box.w - 126, h: box.h - 82 };
    var maxRows = factRows(result.params);
    var minRows = Math.max(1, result.finalTrue / 4);
    function scale(rows) {
      var lo = log10(minRows);
      var hi = log10(maxRows);
      return plot.x + clamp((log10(Math.max(1, rows)) - lo) / Math.max(1e-9, hi - lo), 0, 1) * plot.w;
    }
    var rowH = plot.h / result.chosenSteps.length;
    result.chosenSteps.forEach(function (step, i) {
      var y = plot.y + i * rowH + rowH * 0.18;
      var h = Math.max(12, rowH * 0.42);
      label(ctx, (i + 1) + ". " + DIMS[step.dim].key, box.x + 18, y + h - 2, COLORS.text, "left", "700 12px system-ui, sans-serif");
      label(ctx, step.method, box.x + 54, y + h - 2, step.method === "index" ? COLORS.estimate : COLORS.fact);
      var actualW = Math.max(2, scale(step.actualOutput) - plot.x);
      ctx.fillStyle = COLORS.actual;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(plot.x, y, actualW, h);
      ctx.globalAlpha = 1;
      var ex = scale(step.estOutput);
      ctx.strokeStyle = COLORS.estimate;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex, y - 3);
      ctx.lineTo(ex, y + h + 3);
      ctx.stroke();
      label(ctx, formatRows(step.actualOutput), plot.x + actualW + 4, y + h - 2, COLORS.actual);
    });
    label(ctx, "fact " + formatRows(maxRows), plot.x, box.y + box.h - 18, COLORS.muted);
    label(ctx, "final " + formatRows(result.finalTrue), plot.x + plot.w - 78, box.y + box.h - 18, COLORS.muted);
  }

  function drawError(ctx, result, box) {
    panel(ctx, box, "Error propagation", "log10(estimated / actual) by prefix");
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 66, h: box.h - 84 };
    var maxAbs = Math.max(0.5, result.chosenSteps.reduce(function (best, step) {
      return Math.max(best, Math.abs(step.signedError));
    }, 0));
    function yScale(value) {
      return plot.y + plot.h / 2 - value / maxAbs * (plot.h * 0.43);
    }
    drawGrid(ctx, plot, yScale(0));
    var barW = plot.w / result.chosenSteps.length * 0.62;
    result.chosenSteps.forEach(function (step, i) {
      var cx = plot.x + (i + 0.5) * plot.w / result.chosenSteps.length;
      var y0 = yScale(0);
      var y1 = yScale(step.signedError);
      ctx.fillStyle = step.signedError < 0 ? COLORS.bad : COLORS.estimate;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(cx - barW / 2, Math.min(y0, y1), barW, Math.max(2, Math.abs(y1 - y0)));
      ctx.globalAlpha = 1;
      label(ctx, DIMS[step.dim].key, cx, plot.y + plot.h + 18, COLORS.text, "center", "700 11px system-ui, sans-serif");
    });
    label(ctx, "over", plot.x, plot.y - 8, COLORS.estimate);
    label(ctx, "under", plot.x, plot.y + plot.h + 34, COLORS.bad);
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "Regret curve", "same workload, varied hidden correlation");
    var plot = { x: box.x + 44, y: box.y + 54, w: box.w - 68, h: box.h - 84 };
    var maxSlow = Math.max(1.2, result.sweep.reduce(function (best, row) { return Math.max(best, row.slowdown); }, 1));
    function sx(c) { return plot.x + c / 95 * plot.w; }
    function sy(slow) {
      return plot.y + plot.h - log10(slow) / Math.max(0.01, log10(maxSlow)) * plot.h;
    }
    drawGrid(ctx, plot);
    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    result.sweep.forEach(function (row, i) {
      var x = sx(row.correlation);
      var y = sy(row.slowdown);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var currentX = sx(result.params.correlation);
    var currentY = sy(result.stats.slowdown);
    ctx.fillStyle = COLORS.bad;
    ctx.beginPath();
    ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, "1x", plot.x, plot.y + plot.h + 17, COLORS.muted);
    label(ctx, formatFactor(maxSlow), plot.x, plot.y - 8, COLORS.muted);
    label(ctx, "hidden correlation", plot.x + plot.w - 108, plot.y + plot.h + 25, COLORS.muted);
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 700;
    var setup = setupCanvas(canvas, compact ? 1040 : 720);
    var ctx = setup.ctx;
    if (compact) {
      drawHiddenModel(ctx, result, { x: 8, y: 8, w: setup.width - 16, h: 248 });
      drawPlan(ctx, result, { x: 8, y: 268, w: setup.width - 16, h: 248 });
      drawError(ctx, result, { x: 8, y: 528, w: setup.width - 16, h: 248 });
      drawSweep(ctx, result, { x: 8, y: 788, w: setup.width - 16, h: 244 });
    } else {
      var col = Math.round((setup.width - 28) / 2);
      drawHiddenModel(ctx, result, { x: 8, y: 8, w: col, h: 350 });
      drawPlan(ctx, result, { x: col + 20, y: 8, w: setup.width - col - 28, h: 350 });
      drawError(ctx, result, { x: 8, y: 374, w: col, h: 338 });
      drawSweep(ctx, result, { x: col + 20, y: 374, w: setup.width - col - 28, h: 338 });
    }
  }

  function render(root) {
    var result = evaluate(parseParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-join-order-lab]")).forEach(function (root) {
      if (root.__joinOrderLabReady) return;
      root.__joinOrderLabReady = true;
      var scheduled = null;
      function requestRender() {
        if (scheduled && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(scheduled);
        scheduled = typeof global.requestAnimationFrame === "function"
          ? global.requestAnimationFrame(function () {
            scheduled = null;
            render(root);
          })
          : global.setTimeout(function () {
            scheduled = null;
            render(root);
          }, 16);
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      global.addEventListener("resize", requestRender);
    });
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    trueQ: trueQ,
    estimatedQ: estimatedQ
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.JoinOrderLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
