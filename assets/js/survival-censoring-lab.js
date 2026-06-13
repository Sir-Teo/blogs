(function (global) {
  "use strict";

  var COLORS = {
    trueCurve: "#7c3aed",
    km: "#0f766e",
    naive: "#be123c",
    event: "#be123c",
    censor: "#d97706",
    admin: "#64748b",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    band: "#dbeafe"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatMonths(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 10) return value.toFixed(1) + " mo";
    return value.toFixed(2) + " mo";
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="survival-censoring-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32(index + 1, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2, seed));
    var u2 = uniform(index * 2 + 1, seed);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function cleanParams(params) {
    return {
      cohort: clamp(Math.round(params.cohort), 80, 1200),
      followup: clamp(params.followup, 6, 48),
      eventHazard: clamp(params.eventHazard, 0.5, 18) / 100,
      censorPressure: clamp(params.censorPressure, 0, 80) / 100,
      riskSpread: clamp(params.riskSpread, 0, 160) / 100,
      informative: clamp(params.informative, -120, 120) / 100
    };
  }

  function generateSubjects(params) {
    var rows = [];
    var baseCensor = params.censorPressure <= 0 ? 0 : -Math.log(1 - params.censorPressure) / params.followup;
    for (var i = 0; i < params.cohort; i += 1) {
      var risk = normal(i + 101, 0x51f15eed);
      var eventRate = params.eventHazard * Math.exp(params.riskSpread * risk);
      var censorRate = baseCensor * Math.exp(params.informative * risk);
      var eventTime = -Math.log(Math.max(1e-12, uniform(i + 701, 0xbadc0de))) / Math.max(1e-9, eventRate);
      var censorTime = censorRate <= 0 ? Infinity : -Math.log(Math.max(1e-12, uniform(i + 1301, 0xc0ffee))) / censorRate;
      var observedTime = Math.min(eventTime, censorTime, params.followup);
      var status = "admin";
      if (eventTime <= censorTime && eventTime <= params.followup) status = "event";
      else if (censorTime < eventTime && censorTime < params.followup) status = "censor";
      rows.push({
        censorTime: censorTime,
        eventTime: eventTime,
        observedTime: observedTime,
        risk: risk,
        status: status
      });
    }
    return rows;
  }

  function survivalAt(rows, t) {
    var alive = rows.filter(function (row) { return row.eventTime > t; }).length;
    return alive / Math.max(1, rows.length);
  }

  function naiveAt(rows, t) {
    var events = rows.filter(function (row) {
      return row.status === "event" && row.observedTime <= t;
    }).length;
    return 1 - events / Math.max(1, rows.length);
  }

  function kaplanMeier(rows, horizon) {
    var eventTimes = rows
      .filter(function (row) { return row.status === "event"; })
      .map(function (row) { return row.observedTime; })
      .sort(function (a, b) { return a - b; });
    var unique = [];
    eventTimes.forEach(function (time) {
      if (!unique.length || Math.abs(time - unique[unique.length - 1]) > 1e-9) unique.push(time);
    });
    var survival = 1;
    var points = [{ t: 0, s: 1 }];
    unique.forEach(function (time) {
      if (time > horizon) return;
      var atRisk = rows.filter(function (row) { return row.observedTime >= time - 1e-9; }).length;
      var events = rows.filter(function (row) {
        return row.status === "event" && Math.abs(row.observedTime - time) < 1e-9;
      }).length;
      if (atRisk > 0) survival *= 1 - events / atRisk;
      points.push({ atRisk: atRisk, events: events, s: survival, t: time });
    });
    points.push({ t: horizon, s: survival });
    return points;
  }

  function valueFromStep(points, t) {
    var value = points[0].s;
    for (var i = 1; i < points.length; i += 1) {
      if (points[i].t <= t + 1e-9) value = points[i].s;
      else break;
    }
    return value;
  }

  function rmstFromCurve(points, horizon) {
    var area = 0;
    for (var i = 0; i < points.length - 1; i += 1) {
      var left = clamp(points[i].t, 0, horizon);
      var right = clamp(points[i + 1].t, 0, horizon);
      if (right > left) area += points[i].s * (right - left);
    }
    return area;
  }

  function rmstTrue(rows, horizon) {
    var total = rows.reduce(function (sum, row) {
      return sum + Math.min(row.eventTime, horizon);
    }, 0);
    return total / Math.max(1, rows.length);
  }

  function buildCurves(rows, params) {
    var steps = 120;
    var kmPoints = kaplanMeier(rows, params.followup);
    var truePoints = [];
    var naivePoints = [];
    for (var i = 0; i <= steps; i += 1) {
      var t = params.followup * i / steps;
      truePoints.push({ s: survivalAt(rows, t), t: t });
      naivePoints.push({ s: naiveAt(rows, t), t: t });
    }
    return {
      km: kmPoints,
      naive: naivePoints,
      trueCurve: truePoints
    };
  }

  function bucketize(rows, params) {
    var buckets = [];
    var count = 12;
    var width = params.followup / count;
    for (var i = 0; i < count; i += 1) {
      var start = i * width;
      var end = (i + 1) * width;
      var atRisk = rows.filter(function (row) { return row.observedTime >= start; }).length;
      var events = rows.filter(function (row) {
        return row.status === "event" && row.observedTime >= start && row.observedTime < end;
      }).length;
      var censored = rows.filter(function (row) {
        return row.status === "censor" && row.observedTime >= start && row.observedTime < end;
      }).length;
      buckets.push({ atRisk: atRisk, censored: censored, end: end, events: events, start: start });
    }
    return buckets;
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function medianSurvival(points) {
    for (var i = 0; i < points.length; i += 1) {
      if (points[i].s <= 0.5) return points[i].t;
    }
    return Infinity;
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var rows = generateSubjects(clean);
    var curves = buildCurves(rows, clean);
    var endTrue = survivalAt(rows, clean.followup);
    var endKm = valueFromStep(curves.km, clean.followup);
    var endNaive = naiveAt(rows, clean.followup);
    var events = rows.filter(function (row) { return row.status === "event"; });
    var censored = rows.filter(function (row) { return row.status === "censor"; });
    var admin = rows.filter(function (row) { return row.status === "admin"; });
    var censoredRisk = mean(censored.map(function (row) { return row.risk; }));
    var eventRisk = mean(events.map(function (row) { return row.risk; }));
    return {
      admin: admin,
      buckets: bucketize(rows, clean),
      censored: censored,
      curves: curves,
      endKm: endKm,
      endNaive: endNaive,
      endTrue: endTrue,
      events: events,
      kmMedian: medianSurvival(curves.km),
      params: clean,
      riskGap: censoredRisk - eventRisk,
      rmstKm: rmstFromCurve(curves.km, clean.followup),
      rmstNaive: rmstFromCurve(curves.naive, clean.followup),
      rmstTrue: rmstTrue(rows, clean.followup),
      rows: rows
    };
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
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

  function drawSurvivalPanel(ctx, result, box) {
    panelTitle(ctx, box, "Survival curves", "truth, Kaplan-Meier, and a naive event dashboard");
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    function xScale(t) { return plot.x + t / result.params.followup * plot.w; }
    function yScale(s) { return plot.y + plot.h - clamp(s, 0, 1) * plot.h; }
    drawAxis(ctx, plot);
    ctx.fillStyle = COLORS.band;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(plot.x, yScale(0.5), plot.w, 1);
    ctx.globalAlpha = 1;

    [
      { color: COLORS.trueCurve, points: result.curves.trueCurve },
      { color: COLORS.km, points: result.curves.km },
      { color: COLORS.naive, points: result.curves.naive }
    ].forEach(function (series) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      series.points.forEach(function (point, i) {
        var x = xScale(point.t);
        var y = yScale(point.s);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    result.censored.slice(0, 80).forEach(function (row) {
      ctx.strokeStyle = COLORS.censor;
      ctx.globalAlpha = 0.35;
      var x = xScale(row.observedTime);
      ctx.beginPath();
      ctx.moveTo(x, plot.y + plot.h - 8);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("KM " + formatPercent(result.endKm * 100), plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("true " + formatPercent(result.endTrue * 100) + ", naive " + formatPercent(result.endNaive * 100), plot.x, plot.y + 38);
    ctx.textAlign = "center";
    [0, result.params.followup / 2, result.params.followup].forEach(function (t) {
      ctx.fillText(formatNumber(t) + "m", xScale(t), plot.y + plot.h + 14);
    });
    ctx.textAlign = "right";
    ctx.fillText("100%", plot.x - 7, plot.y + 4);
    ctx.fillText("0", plot.x - 7, plot.y + plot.h);
    ctx.textAlign = "left";
  }

  function drawFlowPanel(ctx, result, box) {
    panelTitle(ctx, box, "Risk set accounting", "events and censoring remove people for different reasons");
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var maxAtRisk = Math.max.apply(null, result.buckets.map(function (bucket) { return bucket.atRisk; }).concat([1]));
    function xScale(t) { return plot.x + t / result.params.followup * plot.w; }
    function yScale(n) { return plot.y + plot.h - n / maxAtRisk * plot.h; }
    drawAxis(ctx, plot);
    result.buckets.forEach(function (bucket) {
      var x0 = xScale(bucket.start);
      var x1 = xScale(bucket.end);
      var barW = Math.max(2, x1 - x0 - 2);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(x0 + 1, yScale(bucket.atRisk), barW, plot.y + plot.h - yScale(bucket.atRisk));
      ctx.fillStyle = COLORS.event;
      ctx.fillRect(x0 + 1, yScale(bucket.events), barW / 2, plot.y + plot.h - yScale(bucket.events));
      ctx.fillStyle = COLORS.censor;
      ctx.fillRect(x0 + 1 + barW / 2, yScale(bucket.censored), barW / 2, plot.y + plot.h - yScale(bucket.censored));
    });
    ctx.strokeStyle = COLORS.km;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.buckets.forEach(function (bucket, i) {
      var x = xScale((bucket.start + bucket.end) / 2);
      var y = yScale(bucket.atRisk);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(result.events.length + " events", plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(result.censored.length + " censored before administrative end", plot.x, plot.y + 38);
    ctx.textAlign = "right";
    ctx.fillText(String(maxAtRisk), plot.x - 7, plot.y + 4);
    ctx.fillText("0", plot.x - 7, plot.y + plot.h);
    ctx.textAlign = "left";
  }

  function drawCensorPanel(ctx, result, box) {
    panelTitle(ctx, box, "Who disappeared?", "censoring is harmless only under a missing-data assumption");
    var plot = { x: box.x + 42, y: box.y + 50, w: box.w - 58, h: box.h - 80 };
    var risks = result.rows.map(function (row) { return row.risk; });
    var minRisk = Math.min.apply(null, risks);
    var maxRisk = Math.max.apply(null, risks);
    function xScale(t) { return plot.x + t / result.params.followup * plot.w; }
    function yScale(risk) { return plot.y + plot.h - (risk - minRisk) / Math.max(1e-9, maxRisk - minRisk) * plot.h; }
    drawAxis(ctx, plot);
    result.rows.forEach(function (row, i) {
      if (i % Math.max(1, Math.floor(result.rows.length / 520)) !== 0) return;
      ctx.fillStyle = row.status === "event" ? COLORS.event : row.status === "censor" ? COLORS.censor : COLORS.admin;
      ctx.globalAlpha = row.status === "admin" ? 0.35 : 0.65;
      ctx.beginPath();
      ctx.arc(xScale(row.observedTime), yScale(row.risk), 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("risk gap " + formatNumber(result.riskGap), plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("mean risk among censored minus event cases", plot.x, plot.y + 38);
    ctx.textAlign = "center";
    [0, result.params.followup / 2, result.params.followup].forEach(function (t) {
      ctx.fillText(formatNumber(t) + "m", xScale(t), plot.y + plot.h + 14);
    });
    ctx.textAlign = "right";
    ctx.fillText("high", plot.x - 7, plot.y + 4);
    ctx.fillText("low", plot.x - 7, plot.y + plot.h);
    ctx.textAlign = "left";
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Measurement ledger", "survival estimates are claims about missing futures");
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 64 };
    var kmBias = result.endKm - result.endTrue;
    var rows = [
      ["cohort", String(result.params.cohort)],
      ["events", formatPercent(result.events.length / result.params.cohort * 100)],
      ["censored", formatPercent(result.censored.length / result.params.cohort * 100)],
      ["true S(tau)", formatPercent(result.endTrue * 100)],
      ["KM S(tau)", formatPercent(result.endKm * 100)],
      ["KM bias", (kmBias >= 0 ? "+" : "") + formatPercent(kmBias * 100)],
      ["true RMST", formatMonths(result.rmstTrue)],
      ["KM RMST", formatMonths(result.rmstKm)]
    ];
    var rowGap = Math.min(25, Math.max(18, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.25)" : "transparent";
      ctx.fillRect(plot.x, y - 2, plot.w, rowGap);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row[0], plot.x + 4, y + 13);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(row[1], plot.x + plot.w - 4, y + 13);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 980 : 700;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    var margin = compact ? 24 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawSurvivalPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 286 });
      drawFlowPanel(ctx, result, { x: margin, y: 342, w: panelW, h: 202 });
      drawCensorPanel(ctx, result, { x: margin, y: 572, w: panelW, h: 202 });
      drawLedgerPanel(ctx, result, { x: margin, y: 804, w: panelW, h: 148 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawSurvivalPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 320 });
      drawFlowPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 320 });
      drawCensorPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 244 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 244 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      censorPressure: formatPercent(result.params.censorPressure * 100),
      cohort: String(result.params.cohort),
      eventHazard: formatPercent(result.params.eventHazard * 100),
      followup: formatMonths(result.params.followup),
      informative: formatNumber(result.params.informative),
      riskSpread: formatPercent(result.params.riskSpread * 100)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var kmBias = result.endKm - result.endTrue;
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("True S(tau)", formatPercent(result.endTrue * 100)),
        metric("KM S(tau)", formatPercent(result.endKm * 100)),
        metric("KM bias", (kmBias >= 0 ? "+" : "") + formatPercent(kmBias * 100)),
        metric("Naive S(tau)", formatPercent(result.endNaive * 100)),
        metric("Censored", formatPercent(result.censored.length / result.params.cohort * 100)),
        metric("RMST gap", formatMonths(result.rmstKm - result.rmstTrue))
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-survival-censoring-lab]")).forEach(init);
  }

  var api = {
    kaplanMeier: kaplanMeier,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.SurvivalCensoringLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
