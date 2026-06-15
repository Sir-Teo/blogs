(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    naive: "#be123c",
    corrected: "#0f766e",
    landmark: "#2563eb",
    truth: "#172026",
    immortal: "#b45309",
    untreated: "#64748b",
    treated: "#7c3aed"
  };

  var DEFAULTS = {
    adoptionShare: 65,
    cohort: 4000,
    eventHazard: 4,
    followup: 36,
    landmark: 12,
    medianStart: 12,
    riskSpread: 0,
    selection: 0,
    treatmentHr: 100
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

  function numeric(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var followup = Math.round(clamp(numeric(raw, "followup"), 12, 72));
    var landmark = Math.round(clamp(numeric(raw, "landmark"), 3, followup - 3));
    return {
      adoptionShare: clamp(numeric(raw, "adoptionShare"), 15, 90) / 100,
      cohort: Math.round(clamp(numeric(raw, "cohort"), 600, 5000)),
      eventHazard: clamp(numeric(raw, "eventHazard"), 1, 12) / 100,
      followup: followup,
      landmark: landmark,
      medianStart: clamp(numeric(raw, "medianStart"), 2, Math.max(3, followup - 2)),
      riskSpread: clamp(numeric(raw, "riskSpread"), 0, 100) / 100,
      selection: clamp(numeric(raw, "selection"), -100, 100) / 100,
      treatmentHr: clamp(numeric(raw, "treatmentHr"), 45, 180) / 100
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatMonths(value) {
    return formatNumber(value, value < 10 ? 1 : 0) + " mo";
  }

  function metric(label, value) {
    return '<div class="immortal-time-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function safeRate(events, time) {
    return time > 1e-9 ? events / time : NaN;
  }

  function safeRatio(num, den) {
    return Number.isFinite(num) && Number.isFinite(den) && den > 0 ? num / den : NaN;
  }

  function simulate(params, seedOffset) {
    var rand = rng(20260614 + seedOffset * 1009 + Math.round(params.medianStart * 113) + params.cohort * 7);
    var rows = [];
    var adoptionRate = Math.log(2) / params.medianStart;

    for (var i = 0; i < params.cohort; i += 1) {
      var z = clamp(normal(rand), -3.2, 3.2);
      var baselineHazard = params.eventHazard * Math.exp(0.75 * params.riskSpread * z);
      var scheduledStart = Infinity;
      if (rand() < params.adoptionShare) {
        var wait = -Math.log(Math.max(1e-12, rand())) / adoptionRate;
        wait *= Math.exp(0.8 * params.selection * z);
        scheduledStart = wait <= params.followup ? wait : Infinity;
      }

      var eventBudget = -Math.log(Math.max(1e-12, rand()));
      var eventTime;
      if (Number.isFinite(scheduledStart)) {
        var beforeStartHazard = baselineHazard * scheduledStart;
        if (eventBudget <= beforeStartHazard) eventTime = eventBudget / baselineHazard;
        else eventTime = scheduledStart + (eventBudget - beforeStartHazard) / (baselineHazard * params.treatmentHr);
      } else {
        eventTime = eventBudget / baselineHazard;
      }

      var observedTime = Math.min(eventTime, params.followup);
      var event = eventTime <= params.followup;
      var treated = Number.isFinite(scheduledStart) && scheduledStart < observedTime;
      var untreatedTime = treated ? scheduledStart : observedTime;
      var treatedTime = treated ? observedTime - scheduledStart : 0;
      var treatedEvent = event && treated && eventTime >= scheduledStart;

      rows.push({
        event: event,
        eventTime: eventTime,
        id: i,
        observedTime: observedTime,
        risk: z,
        scheduledStart: scheduledStart,
        treated: treated,
        treatedEvent: treatedEvent,
        treatedTime: treatedTime,
        untreatedEvent: event && !treatedEvent,
        untreatedTime: untreatedTime
      });
    }
    return rows;
  }

  function rateSummary(rows) {
    var naive = {
      neverEvents: 0,
      neverTime: 0,
      treatedEvents: 0,
      treatedTime: 0
    };
    var td = {
      treatedEvents: 0,
      treatedTime: 0,
      untreatedEvents: 0,
      untreatedTime: 0
    };
    var ledger = {
      immortalTime: 0,
      realTreatedTime: 0,
      untreatedTime: 0
    };

    rows.forEach(function (row) {
      if (row.treated) {
        naive.treatedTime += row.observedTime;
        if (row.event) naive.treatedEvents += 1;
        ledger.immortalTime += row.scheduledStart;
        ledger.realTreatedTime += row.treatedTime;
      } else {
        naive.neverTime += row.observedTime;
        if (row.event) naive.neverEvents += 1;
      }

      td.untreatedTime += row.untreatedTime;
      td.treatedTime += row.treatedTime;
      if (row.untreatedEvent) td.untreatedEvents += 1;
      if (row.treatedEvent) td.treatedEvents += 1;
      ledger.untreatedTime += row.untreatedTime;
    });

    var naiveTreatedRate = safeRate(naive.treatedEvents, naive.treatedTime);
    var naiveNeverRate = safeRate(naive.neverEvents, naive.neverTime);
    var tdTreatedRate = safeRate(td.treatedEvents, td.treatedTime);
    var tdUntreatedRate = safeRate(td.untreatedEvents, td.untreatedTime);
    var totalNaiveTreated = ledger.immortalTime + ledger.realTreatedTime;

    return {
      ledger: ledger,
      naive: {
        events: naive,
        rateRatio: safeRatio(naiveTreatedRate, naiveNeverRate),
        treatedRate: naiveTreatedRate,
        untreatedRate: naiveNeverRate
      },
      td: {
        events: td,
        rateRatio: safeRatio(tdTreatedRate, tdUntreatedRate),
        treatedRate: tdTreatedRate,
        untreatedRate: tdUntreatedRate
      },
      misclassifiedShare: totalNaiveTreated > 0 ? ledger.immortalTime / totalNaiveTreated : 0
    };
  }

  function landmarkSummary(rows, landmark) {
    var treated = { events: 0, time: 0 };
    var untreated = { events: 0, time: 0 };
    var included = 0;

    rows.forEach(function (row) {
      if (row.observedTime <= landmark) return;
      included += 1;
      var group = row.treated && row.scheduledStart <= landmark ? treated : untreated;
      group.time += row.observedTime - landmark;
      if (row.event) group.events += 1;
    });

    return {
      included: included,
      rateRatio: safeRatio(safeRate(treated.events, treated.time), safeRate(untreated.events, untreated.time)),
      treated: treated,
      untreated: untreated
    };
  }

  function kmCurve(rows, groupKey, followup) {
    var group = rows.filter(function (row) {
      return groupKey === "treated" ? row.treated : !row.treated;
    });
    var times = group.map(function (row) {
      return {
        event: row.event,
        time: row.observedTime
      };
    }).sort(function (a, b) { return a.time - b.time; });
    var points = [{ t: 0, s: 1 }];
    var survival = 1;
    var atRisk = times.length;
    var index = 0;
    while (index < times.length) {
      var time = times[index].time;
      var events = 0;
      var censored = 0;
      while (index < times.length && Math.abs(times[index].time - time) < 1e-9) {
        if (times[index].event) events += 1;
        else censored += 1;
        index += 1;
      }
      if (atRisk > 0 && events > 0) {
        survival *= 1 - events / atRisk;
        points.push({ t: time, s: survival });
      }
      atRisk -= events + censored;
    }
    points.push({ t: followup, s: survival });
    return { count: group.length, points: points };
  }

  function sweep(params) {
    var medians = [3, 6, 9, 12, 18, 24, 30].filter(function (value) {
      return value < params.followup;
    });
    return medians.map(function (median, index) {
      var p = Object.assign({}, params, { medianStart: median });
      var rows = simulate(p, index + 31);
      var rates = rateSummary(rows);
      return {
        median: median,
        naive: rates.naive.rateRatio,
        td: rates.td.rateRatio
      };
    });
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var rows = simulate(params, 0);
    var rates = rateSummary(rows);
    var landmark = landmarkSummary(rows, params.landmark);
    var treatedRows = rows.filter(function (row) { return row.treated; });
    var startTimes = treatedRows.map(function (row) { return row.scheduledStart; }).sort(function (a, b) { return a - b; });
    var medianObservedStart = startTimes.length ? startTimes[Math.floor(startTimes.length / 2)] : NaN;
    var events = rows.filter(function (row) { return row.event; }).length;

    return {
      km: {
        never: kmCurve(rows, "never", params.followup),
        treated: kmCurve(rows, "treated", params.followup)
      },
      landmark: landmark,
      params: params,
      rates: rates,
      rows: rows,
      summary: {
        eventRate: events / rows.length,
        medianObservedStart: medianObservedStart,
        observedTreated: treatedRows.length / rows.length,
        trueHr: params.treatmentHr
      },
      sweep: sweep(params)
    };
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
    label(ctx, title, box.x, box.y - 13, "left", "bottom", COLORS.text);
    if (subtitle && ctx.measureText(title).width + ctx.measureText(subtitle).width + 18 < box.w) {
      label(ctx, subtitle, box.x + box.w, box.y - 13, "right", "bottom", COLORS.muted);
    }
  }

  function drawLine(ctx, points, sx, sy, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = sx(point);
      var y = sy(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawKm(ctx, result, box) {
    panel(ctx, box, "Naive survival split", "grouped by future treatment");
    var plot = { x: box.x + 38, y: box.y + 22, w: box.w - 58, h: box.h - 54 };
    function sx(point) {
      return plot.x + point.t / result.params.followup * plot.w;
    }
    function sy(point) {
      return plot.y + (1 - point.s) * plot.h;
    }
    ctx.strokeStyle = COLORS.faint;
    [0.7, 0.85, 1].forEach(function (tick) {
      var y = plot.y + (1 - tick) * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, formatPercent(tick), plot.x - 8, y, "right", "middle", COLORS.muted);
    });
    drawLine(ctx, result.km.treated.points, sx, sy, COLORS.naive, 2.4);
    drawLine(ctx, result.km.never.points, sx, sy, COLORS.untreated, 2);
    label(ctx, "future treated", plot.x + plot.w - 4, plot.y + 16, "right", "middle", COLORS.naive);
    label(ctx, "never treated", plot.x + plot.w - 4, plot.y + 35, "right", "middle", COLORS.untreated);
    label(ctx, "0", plot.x, plot.y + plot.h + 17, "center", "middle", COLORS.muted);
    label(ctx, result.params.followup + " mo", plot.x + plot.w, plot.y + plot.h + 17, "right", "middle", COLORS.muted);
  }

  function drawBars(ctx, result, box) {
    panel(ctx, box, "Estimated rate ratio", "lower looks protective");
    var rows = [
      { label: "naive", value: result.rates.naive.rateRatio, color: COLORS.naive },
      { label: "time-dep", value: result.rates.td.rateRatio, color: COLORS.corrected },
      { label: "landmark", value: result.landmark.rateRatio, color: COLORS.landmark },
      { label: "truth", value: result.params.treatmentHr, color: COLORS.truth }
    ];
    var plot = { x: box.x + 42, y: box.y + 24, w: box.w - 68, h: box.h - 58 };
    var minLog = Math.log(0.35);
    var maxLog = Math.log(1.85);
    function sx(value) {
      var logValue = Math.log(clamp(value, 0.35, 1.85));
      return plot.x + (logValue - minLog) / (maxLog - minLog) * plot.w;
    }
    ctx.strokeStyle = COLORS.faint;
    [0.5, 1, 1.5].forEach(function (tick) {
      var x = sx(tick);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      label(ctx, formatNumber(tick, 1), x, plot.y + plot.h + 17, "center", "middle", COLORS.muted);
    });
    rows.forEach(function (row, index) {
      var y = plot.y + 16 + index * (plot.h / rows.length);
      var x0 = sx(1);
      var x1 = sx(row.value);
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = row.color;
      ctx.beginPath();
      ctx.arc(x1, y, 5, 0, 2 * Math.PI);
      ctx.fill();
      label(ctx, row.label, plot.x - 8, y, "right", "middle", COLORS.muted);
      label(ctx, formatNumber(row.value, 2), plot.x + plot.w + 8, y, "left", "middle", row.color);
    });
  }

  function drawLedger(ctx, result, box) {
    panel(ctx, box, "Person-time ledger", "where the treated denominator came from");
    var ledger = result.rates.ledger;
    var maxValue = Math.max(ledger.immortalTime + ledger.realTreatedTime, ledger.realTreatedTime, ledger.untreatedTime, 1);
    var plot = { x: box.x + 42, y: box.y + 26, w: box.w - 70, h: box.h - 64 };
    function bar(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }
    var bars = [
      {
        label: "naive treated",
        parts: [
          { value: ledger.immortalTime, color: COLORS.immortal },
          { value: ledger.realTreatedTime, color: COLORS.treated }
        ]
      },
      {
        label: "time-dep treated",
        parts: [{ value: ledger.realTreatedTime, color: COLORS.treated }]
      },
      {
        label: "untreated",
        parts: [{ value: ledger.untreatedTime, color: COLORS.untreated }]
      }
    ];
    bars.forEach(function (row, index) {
      var y = plot.y + index * (plot.h / bars.length) + 8;
      var x = plot.x;
      row.parts.forEach(function (part) {
        var width = part.value / maxValue * plot.w;
        bar(x, y, width, 20, part.color);
        x += width;
      });
      label(ctx, row.label, plot.x - 8, y + 10, "right", "middle", COLORS.muted);
    });
    label(ctx, "immortal pre-treatment time", plot.x, plot.y + plot.h + 16, "left", "middle", COLORS.immortal);
    label(ctx, "actual treated time", plot.x + plot.w, plot.y + plot.h + 16, "right", "middle", COLORS.treated);
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "Delay sweep", "longer wait, bigger trap");
    var rows = result.sweep;
    var plot = { x: box.x + 42, y: box.y + 24, w: box.w - 64, h: box.h - 58 };
    var minMedian = rows[0].median;
    var maxMedian = rows[rows.length - 1].median;
    var maxY = Math.max(1.6, Math.max.apply(null, rows.map(function (row) {
      return Math.max(row.naive || 0, row.td || 0);
    })));
    var minY = 0.35;
    function sx(row) {
      return plot.x + (row.median - minMedian) / Math.max(1, maxMedian - minMedian) * plot.w;
    }
    function sy(value) {
      return plot.y + plot.h - (clamp(value, minY, maxY) - minY) / (maxY - minY) * plot.h;
    }
    ctx.strokeStyle = COLORS.faint;
    [0.5, 1, 1.5].forEach(function (tick) {
      var y = sy(tick);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, formatNumber(tick, 1), plot.x - 8, y, "right", "middle", COLORS.muted);
    });
    drawLine(ctx, rows, sx, function (row) { return sy(row.naive); }, COLORS.naive, 2.4);
    drawLine(ctx, rows, sx, function (row) { return sy(row.td); }, COLORS.corrected, 2.2);
    rows.forEach(function (row) {
      ctx.fillStyle = COLORS.naive;
      ctx.beginPath();
      ctx.arc(sx(row), sy(row.naive), 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = COLORS.corrected;
      ctx.beginPath();
      ctx.arc(sx(row), sy(row.td), 3, 0, 2 * Math.PI);
      ctx.fill();
    });
    label(ctx, "median treatment start", plot.x + plot.w / 2, plot.y + plot.h + 18, "center", "middle", COLORS.muted);
    label(ctx, "naive", plot.x + plot.w - 4, plot.y + 16, "right", "middle", COLORS.naive);
    label(ctx, "time-dep", plot.x + plot.w - 4, plot.y + 34, "right", "middle", COLORS.corrected);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 980 : 660;
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    if (compact) {
      var left = 42;
      var plotW = width - left - 18;
      drawKm(ctx, result, { x: left, y: 42, w: plotW, h: 175 });
      drawBars(ctx, result, { x: left, y: 288, w: plotW, h: 175 });
      drawLedger(ctx, result, { x: left, y: 535, w: plotW, h: 160 });
      drawSweep(ctx, result, { x: left, y: 770, w: plotW, h: 160 });
    } else {
      var margin = 54;
      var gap = 42;
      var w = (width - margin - 24 - gap) / 2;
      drawKm(ctx, result, { x: margin, y: 42, w: w, h: 215 });
      drawBars(ctx, result, { x: margin + w + gap, y: 42, w: w, h: 215 });
      drawLedger(ctx, result, { x: margin, y: 342, w: w, h: 185 });
      drawSweep(ctx, result, { x: margin + w + gap, y: 342, w: w, h: 185 });
    }
  }

  function parseParams(root) {
    var params = Object.assign({}, DEFAULTS);
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      params[key] = Number(input.value);
    });
    return params;
  }

  function updateOutputs(root, params) {
    var display = {
      adoptionShare: formatPercent(params.adoptionShare, 0),
      cohort: String(params.cohort),
      eventHazard: formatPercent(params.eventHazard, 0),
      followup: params.followup + " mo",
      landmark: params.landmark + " mo",
      medianStart: params.medianStart + " mo",
      riskSpread: formatPercent(params.riskSpread, 0),
      selection: (params.selection > 0 ? "+" : "") + formatPercent(params.selection, 0),
      treatmentHr: formatPercent(params.treatmentHr, 0)
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      output.textContent = display[key] || "";
    });
  }

  function updateControls(root, params) {
    var values = {
      adoptionShare: Math.round(params.adoptionShare * 100),
      cohort: params.cohort,
      eventHazard: Math.round(params.eventHazard * 100),
      followup: params.followup,
      landmark: params.landmark,
      medianStart: params.medianStart,
      riskSpread: Math.round(params.riskSpread * 100),
      selection: Math.round(params.selection * 100),
      treatmentHr: Math.round(params.treatmentHr * 100)
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (Object.prototype.hasOwnProperty.call(values, key) && String(input.value) !== String(values[key])) input.value = values[key];
    });
  }

  function render(root) {
    var raw = parseParams(root);
    var result = evaluate(raw);
    updateControls(root, result.params);
    updateOutputs(root, result.params);
    root.querySelector("[data-metrics]").innerHTML = [
      metric("naive rate ratio", formatNumber(result.rates.naive.rateRatio, 2)),
      metric("time-dependent RR", formatNumber(result.rates.td.rateRatio, 2)),
      metric("landmark RR", formatNumber(result.landmark.rateRatio, 2)),
      metric("true hazard ratio", formatNumber(result.params.treatmentHr, 2)),
      metric("immortal share", formatPercent(result.rates.misclassifiedShare, 0)),
      metric("treated by follow-up", formatPercent(result.summary.observedTreated, 0))
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-immortal-time-lab]")).forEach(function (root) {
      if (root.__immortalTimeReady) return;
      root.__immortalTimeReady = true;
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
      window.addEventListener("resize", requestRender);
      requestRender();
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      cleanParams: cleanParams,
      evaluate: evaluate,
      rateSummary: rateSummary,
      simulate: simulate
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
