(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    control: "#64748b",
    treated: "#0f766e",
    counter: "#7c3aed",
    did: "#be123c",
    adjusted: "#2563eb",
    warn: "#d97706",
    bg: "#ffffff",
    band: "#ccfbf1",
    soft: "#f8fafc"
  };

  var TIMES = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  var STAGGER_TIMES = [-2, -1, 0, 1, 2, 3, 4, 5];
  var GROUPS = [
    { name: "Early", adopt: 0, intercept: 1.0, slope: 0.00, mult: 1.0 },
    { name: "Late", adopt: 2, intercept: 0.4, slope: 0.04, mult: 1.0 },
    { name: "Never", adopt: Infinity, intercept: -0.2, slope: -0.02, mult: 0.0 }
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
    var number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function clampInt(value, min, max) {
    return Math.round(clamp(value, min, max));
  }

  function scaledParam(value, fallback, threshold) {
    if (value == null) return fallback;
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.abs(number) > threshold ? number / 100 : number;
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function avgRows(rows, predicate, field) {
    return mean(rows.filter(predicate).map(function (row) { return row[field]; }));
  }

  function fitLine(points) {
    var mx = mean(points.map(function (p) { return p.x; }));
    var my = mean(points.map(function (p) { return p.y; }));
    var num = 0;
    var den = 0;
    points.forEach(function (p) {
      num += (p.x - mx) * (p.y - my);
      den += (p.x - mx) * (p.x - mx);
    });
    var slope = den > 0 ? num / den : 0;
    return { intercept: my - slope * mx, slope: slope };
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return makeParams(raw);
  }

  function makeParams(raw) {
    return {
      anticipation: clamp(scaledParam(raw.anticipation, 0.40, 10), 0, 4),
      dynamic: clamp(scaledParam(raw.dynamic, 0.45, 5), -1.4, 1.8),
      effect: clamp(scaledParam(raw.effect, 3.20, 20), -4, 8),
      lateEffect: clamp(scaledParam(raw.lateEffect, 0.70, 5), 0.35, 2.1),
      noise: clamp(scaledParam(raw.noise, 0.20, 2), 0, 1.1),
      trendGap: clamp(scaledParam(raw.trendGap, 0.25, 5), -1.8, 1.8)
    };
  }

  function deterministicNoise(seed, scale) {
    if (scale <= 0) return 0;
    return normal(rng(seed)) * scale;
  }

  function treatmentEffect(params, eventTime, multiplier) {
    if (eventTime < 0) return eventTime === -1 ? params.anticipation : 0;
    return multiplier * params.effect + params.dynamic * eventTime;
  }

  function simplePanel(params) {
    var rows = TIMES.map(function (t) {
      var common = 10 + 0.58 * (t + 4) + 0.26 * Math.sin((t + 5) * 0.9);
      var controlY0 = common;
      var treatedY0 = common + 1.05 + params.trendGap * (t + 4);
      var tau = treatmentEffect(params, t, 1);
      var controlNoise = deterministicNoise(0xC0A100 + (t + 11) * 17, params.noise);
      var treatedNoise = deterministicNoise(0xD1D100 + (t + 11) * 23, params.noise);
      return {
        control: controlY0 + controlNoise,
        counterfactual: treatedY0 + treatedNoise,
        t: t,
        tau: tau,
        treated: treatedY0 + tau + treatedNoise
      };
    });

    var pre = function (row) { return row.t < 0; };
    var post = function (row) { return row.t >= 0; };
    var earlyPre = function (row) { return row.t === -4 || row.t === -3; };
    var latePre = function (row) { return row.t === -2 || row.t === -1; };
    var did = (avgRows(rows, post, "treated") - avgRows(rows, pre, "treated"))
      - (avgRows(rows, post, "control") - avgRows(rows, pre, "control"));
    var trueAtt = avgRows(rows, post, "tau");
    var placebo = (avgRows(rows, latePre, "treated") - avgRows(rows, earlyPre, "treated"))
      - (avgRows(rows, latePre, "control") - avgRows(rows, earlyPre, "control"));
    var gapLine = fitLine(rows.filter(pre).map(function (row) {
      return { x: row.t, y: row.treated - row.control };
    }));
    var adjusted = mean(rows.filter(post).map(function (row) {
      var predictedGap = gapLine.intercept + gapLine.slope * row.t;
      return (row.treated - row.control) - predictedGap;
    }));
    var baselineGap = rows.filter(function (row) { return row.t === -1; })[0].treated
      - rows.filter(function (row) { return row.t === -1; })[0].control;
    var event = rows.map(function (row) {
      return {
        estimate: row.treated - row.control - baselineGap,
        t: row.t,
        trueEffect: row.t < 0 ? row.tau : row.tau - params.anticipation
      };
    });
    return {
      adjusted: adjusted,
      did: did,
      event: event,
      placebo: placebo,
      rows: rows,
      trueAtt: trueAtt
    };
  }

  function staggeredPanel(params) {
    var cells = [];
    STAGGER_TIMES.forEach(function (t) {
      GROUPS.forEach(function (baseGroup, g) {
        var group = {
          adopt: baseGroup.adopt,
          intercept: baseGroup.intercept,
          mult: g === 1 ? params.lateEffect : baseGroup.mult,
          name: baseGroup.name,
          slope: baseGroup.slope
        };
        var y0 = 11.2 + group.intercept + (0.52 + group.slope) * (t + 2) + 0.22 * Math.cos((t + 2) * (g + 1));
        var eventTime = Number.isFinite(group.adopt) ? t - group.adopt : -99;
        var treated = Number.isFinite(group.adopt) && t >= group.adopt;
        var tau = treated ? treatmentEffect(params, eventTime, group.mult) : 0;
        var y = y0 + tau + deterministicNoise(0xBAD000 + (t + 8) * 31 + g * 101, params.noise * 0.7);
        cells.push({
          adopt: group.adopt,
          group: g,
          groupName: group.name,
          treated: treated ? 1 : 0,
          t: t,
          tau: tau,
          y: y
        });
      });
    });

    var groupMeansY = GROUPS.map(function (_, g) {
      return avgRows(cells, function (row) { return row.group === g; }, "y");
    });
    var timeMeansY = STAGGER_TIMES.map(function (t) {
      return avgRows(cells, function (row) { return row.t === t; }, "y");
    });
    var groupMeansD = GROUPS.map(function (_, g) {
      return avgRows(cells, function (row) { return row.group === g; }, "treated");
    });
    var timeMeansD = STAGGER_TIMES.map(function (t) {
      return avgRows(cells, function (row) { return row.t === t; }, "treated");
    });
    var yGrand = mean(cells.map(function (row) { return row.y; }));
    var dGrand = mean(cells.map(function (row) { return row.treated; }));
    var numerator = 0;
    var denominator = 0;
    cells.forEach(function (row) {
      var tIndex = STAGGER_TIMES.indexOf(row.t);
      var yResidual = row.y - groupMeansY[row.group] - timeMeansY[tIndex] + yGrand;
      var dResidual = row.treated - groupMeansD[row.group] - timeMeansD[tIndex] + dGrand;
      row.dResidual = dResidual;
      numerator += dResidual * yResidual;
      denominator += dResidual * dResidual;
    });
    var twfe = denominator > 0 ? numerator / denominator : 0;
    var trueAtt = avgRows(cells, function (row) { return row.treated; }, "tau");
    var treatedCells = cells.filter(function (row) { return row.treated; });
    var zeroWeightShare = treatedCells.filter(function (row) {
      return Math.abs(row.dResidual) < 1e-9;
    }).length / Math.max(1, treatedCells.length);

    function cohortDid(groupIndex) {
      var group = GROUPS[groupIndex];
      var preT = group.adopt - 1;
      var postRows = cells.filter(function (row) { return row.group === groupIndex && row.t >= group.adopt; });
      var neverPost = cells.filter(function (row) { return row.group === 2 && row.t >= group.adopt; });
      var treatedPre = cells.filter(function (row) { return row.group === groupIndex && row.t === preT; })[0];
      var neverPre = cells.filter(function (row) { return row.group === 2 && row.t === preT; })[0];
      return (mean(postRows.map(function (row) { return row.y; })) - treatedPre.y)
        - (mean(neverPost.map(function (row) { return row.y; })) - neverPre.y);
    }

    var clean = mean([cohortDid(0), cohortDid(1)]);
    return {
      cells: cells,
      clean: clean,
      trueAtt: trueAtt,
      twfe: twfe,
      zeroWeightShare: zeroWeightShare
    };
  }

  function simulate(params) {
    var p = makeParams(params || {});
    var simple = simplePanel(p);
    var staggered = staggeredPanel(p);
    return {
      metrics: {
        adjustedBias: simple.adjusted - simple.trueAtt,
        didBias: simple.did - simple.trueAtt,
        placebo: simple.placebo,
        staggeredBias: staggered.twfe - staggered.trueAtt,
        zeroWeightShare: staggered.zeroWeightShare
      },
      params: p,
      simple: simple,
      staggered: staggered
    };
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatSigned(value, digits) {
    return (value >= 0 ? "+" : "") + formatNumber(value, digits == null ? 2 : digits);
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="did-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function updateOutputs(root, params) {
    var values = {
      anticipation: formatNumber(params.anticipation, 2),
      dynamic: formatSigned(params.dynamic, 2) + "/period",
      effect: formatSigned(params.effect, 2),
      lateEffect: formatPct(params.lateEffect, 0),
      noise: formatPct(params.noise, 0),
      trendGap: formatSigned(params.trendGap, 2) + "/period"
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function label(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.font = "600 15px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, title, box.x, box.y - 12, "left", "bottom", COLORS.text);
    if (subtitle) {
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      label(ctx, subtitle, box.x + box.w, box.y - 12, "right", "bottom", COLORS.muted);
    }
  }

  function gridLine(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawPath(ctx, points, xScale, yScale, color, width, dashed) {
    ctx.save();
    if (dashed) ctx.setLineDash([5, 5]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xScale(point);
      var y = yScale(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function yRange(values) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = Math.max(0.8, (max - min) * 0.12);
    return { min: min - pad, max: max + pad };
  }

  function drawTrendPanel(ctx, box, result) {
    panel(ctx, box, "two-group DiD", "observed trends and missing counterfactual");
    var rows = result.simple.rows;
    var values = [];
    rows.forEach(function (row) {
      values.push(row.control, row.treated, row.counterfactual);
    });
    var range = yRange(values);
    var left = box.x + 48;
    var top = box.y + 22;
    var width = box.w - 68;
    var height = box.h - 54;
    var x = function (row) { return left + (row.t - TIMES[0]) / (TIMES[TIMES.length - 1] - TIMES[0]) * width; };
    var y = function (value) { return top + height - (value - range.min) / (range.max - range.min) * height; };
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      gridLine(ctx, left, top + height - f * height, left + width, top + height - f * height);
    });
    var zeroX = x({ t: 0 });
    ctx.fillStyle = "rgba(15, 118, 110, 0.08)";
    ctx.fillRect(zeroX, top, left + width - zeroX, height);
    drawPath(ctx, rows, x, function (row) { return y(row.control); }, COLORS.control, 2, false);
    drawPath(ctx, rows, x, function (row) { return y(row.counterfactual); }, COLORS.counter, 2, true);
    drawPath(ctx, rows, x, function (row) { return y(row.treated); }, COLORS.treated, 2.6, false);
    rows.forEach(function (row) {
      ctx.fillStyle = row.t >= 0 ? COLORS.treated : COLORS.control;
      ctx.beginPath();
      ctx.arc(x(row), y(row.treated), 3, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "policy starts", zeroX + 6, top + 8, "left", "top", COLORS.treated);
    label(ctx, "control", left + width - 60, y(rows[rows.length - 1].control), "left", "middle", COLORS.control);
    label(ctx, "treated", left + width - 60, y(rows[rows.length - 1].treated), "left", "middle", COLORS.treated);
    label(ctx, "unseen no-treatment path", left + width - 142, y(rows[rows.length - 1].counterfactual) - 16, "left", "middle", COLORS.counter);
    TIMES.forEach(function (t) {
      if (t % 2 === 0) label(ctx, String(t), left + (t - TIMES[0]) / 8 * width, top + height + 16, "center", "top", COLORS.muted);
    });
  }

  function drawBarsPanel(ctx, box, result) {
    panel(ctx, box, "estimators", "truth, raw DiD, trend fit, placebo");
    var rows = [
      { color: COLORS.treated, label: "true ATT", value: result.simple.trueAtt },
      { color: COLORS.did, label: "raw DiD", value: result.simple.did },
      { color: COLORS.adjusted, label: "pretrend fit", value: result.simple.adjusted },
      { color: COLORS.warn, label: "pre placebo", value: result.simple.placebo }
    ];
    var maxAbs = Math.max(1, Math.max.apply(null, rows.map(function (row) { return Math.abs(row.value); }))) * 1.18;
    var left = box.x + 108;
    var top = box.y + 28;
    var width = box.w - 136;
    var zero = left + width / 2;
    var scale = width / (2 * maxAbs);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    gridLine(ctx, zero, top - 12, zero, top + rows.length * 38);
    rows.forEach(function (row, i) {
      var y = top + i * 38;
      label(ctx, row.label, box.x + 16, y + 8, "left", "middle", COLORS.muted);
      var barW = row.value * scale;
      ctx.fillStyle = row.color;
      ctx.fillRect(barW >= 0 ? zero : zero + barW, y, Math.abs(barW), 18);
      label(ctx, formatSigned(row.value, 2), zero + barW + (barW >= 0 ? 7 : -7), y + 9, barW >= 0 ? "left" : "right", "middle", COLORS.text);
    });
  }

  function drawEventPanel(ctx, box, result) {
    panel(ctx, box, "event-study shape", "relative gap, normalized at t=-1");
    var points = result.simple.event;
    var maxAbs = Math.max(1, Math.max.apply(null, points.map(function (p) {
      return Math.max(Math.abs(p.estimate), Math.abs(p.trueEffect));
    }))) * 1.2;
    var left = box.x + 40;
    var top = box.y + 24;
    var width = box.w - 58;
    var height = box.h - 56;
    var x = function (p) { return left + (p.t - TIMES[0]) / (TIMES[TIMES.length - 1] - TIMES[0]) * width; };
    var y = function (v) { return top + height / 2 - v / maxAbs * height / 2; };
    gridLine(ctx, left, y(0), left + width, y(0));
    points.forEach(function (p) {
      var barTop = y(Math.max(0, p.estimate));
      ctx.fillStyle = p.t < 0 ? COLORS.warn : COLORS.treated;
      ctx.fillRect(x(p) - 7, barTop, 14, Math.abs(y(p.estimate) - y(0)));
    });
    drawPath(ctx, points, x, function (p) { return y(p.trueEffect); }, COLORS.counter, 2, true);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "pre", left + 18, top + 10, "left", "top", COLORS.warn);
    label(ctx, "post", left + width - 38, top + 10, "left", "top", COLORS.treated);
    label(ctx, "true path", left + width - 70, top + height - 12, "left", "top", COLORS.counter);
  }

  function drawStaggeredPanel(ctx, box, result) {
    panel(ctx, box, "staggered adoption", "TWFE can compare treated units to treated units");
    var cells = result.staggered.cells;
    var left = box.x + 70;
    var top = box.y + 28;
    var cellW = 28;
    var cellH = 22;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    GROUPS.forEach(function (group, g) {
      label(ctx, group.name, box.x + 14, top + g * (cellH + 8) + cellH / 2, "left", "middle", COLORS.muted);
      STAGGER_TIMES.forEach(function (t, ti) {
        var cell = cells.filter(function (row) { return row.group === g && row.t === t; })[0];
        ctx.fillStyle = cell.treated ? COLORS.treated : COLORS.faint;
        ctx.fillRect(left + ti * cellW, top + g * (cellH + 8), cellW - 2, cellH);
      });
    });
    STAGGER_TIMES.forEach(function (t, ti) {
      label(ctx, String(t), left + ti * cellW + cellW / 2 - 1, top - 8, "center", "bottom", COLORS.muted);
    });
    var bars = [
      { color: COLORS.treated, label: "true ATT", value: result.staggered.trueAtt },
      { color: COLORS.adjusted, label: "cohort vs never", value: result.staggered.clean },
      { color: COLORS.did, label: "TWFE", value: result.staggered.twfe }
    ];
    var barTop = top + 112;
    var maxAbs = Math.max(1, Math.max.apply(null, bars.map(function (row) { return Math.abs(row.value); }))) * 1.18;
    var zero = left + 110;
    var scale = 160 / (2 * maxAbs);
    gridLine(ctx, zero, barTop - 10, zero, barTop + 96);
    bars.forEach(function (row, i) {
      var y = barTop + i * 30;
      label(ctx, row.label, box.x + 14, y + 8, "left", "middle", COLORS.muted);
      var barW = row.value * scale;
      ctx.fillStyle = row.color;
      ctx.fillRect(barW >= 0 ? zero : zero + barW, y, Math.abs(barW), 16);
      label(ctx, formatSigned(row.value, 2), zero + barW + (barW >= 0 ? 6 : -6), y + 8, barW >= 0 ? "left" : "right", "middle", COLORS.text);
    });
    label(ctx, "zero TWFE-weight treated cells: " + formatPct(result.staggered.zeroWeightShare, 0), box.x + 14, box.y + box.h - 18, "left", "middle", COLORS.warn);
  }

  function drawChart(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1;
    ctx.font = "700 20px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "Difference-in-differences is a counterfactual trend claim", 54, 28, "left", "top", COLORS.text);
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "Change the untreated slope, anticipation, or timing heterogeneity and the estimand moves.", 54, 54, "left", "top", COLORS.muted);
    drawTrendPanel(ctx, { x: 54, y: 88, w: 520, h: 238 }, result);
    drawBarsPanel(ctx, { x: 626, y: 88, w: 220, h: 238 }, result);
    drawEventPanel(ctx, { x: 54, y: 394, w: 346, h: 204 }, result);
    drawStaggeredPanel(ctx, { x: 454, y: 394, w: 392, h: 204 }, result);
  }

  function render(root) {
    var params = parseParams(root);
    updateOutputs(root, params);
    var result = simulate(params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("true ATT", formatSigned(result.simple.trueAtt, 2)),
        metric("raw DiD", formatSigned(result.simple.did, 2)),
        metric("DiD bias", formatSigned(result.metrics.didBias, 2)),
        metric("pre placebo", formatSigned(result.metrics.placebo, 2)),
        metric("TWFE", formatSigned(result.staggered.twfe, 2)),
        metric("TWFE bias", formatSigned(result.metrics.staggeredBias, 2))
      ].join("");
    }
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-did-lab]"));
    labs.forEach(function (root) {
      if (root.__didLabReady) return;
      root.__didLabReady = true;
      var schedule = null;
      var scheduledWithTimeout = false;
      function requestRender() {
        if (schedule) {
          if (scheduledWithTimeout) window.clearTimeout(schedule);
          else if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(schedule);
        }
        scheduledWithTimeout = typeof window.requestAnimationFrame !== "function";
        var scheduleRender = scheduledWithTimeout
          ? function (callback) { return window.setTimeout(callback, 16); }
          : window.requestAnimationFrame;
        schedule = scheduleRender(function () {
          schedule = null;
          render(root);
        });
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      window.addEventListener("resize", requestRender);
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      simplePanel: simplePanel,
      simulate: simulate,
      staggeredPanel: staggeredPanel
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      window.setTimeout(init, 0);
    } else {
      init();
    }
  }
}());
