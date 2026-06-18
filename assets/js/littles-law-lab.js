(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    area: "#0f766e",
    closed: "#2563eb",
    left: "#7c3aed",
    right: "#b45309",
    span: "#be123c",
    marker: "#111827",
    white: "#ffffff"
  };

  var DEFAULTS = {
    arrivalCv: 100,
    load: 82,
    meanServiceMs: 52,
    mode: "slice",
    seed: 170,
    serviceCv: 100,
    windowSec: 18
  };

  var MODES = ["slice", "drain"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function nearest(value, allowed, fallback) {
    value = String(value == null ? fallback : value);
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function numeric(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      arrivalCv: Math.round(clamp(numeric(raw, "arrivalCv"), 0, 180)),
      load: Math.round(clamp(numeric(raw, "load"), 35, 98)),
      meanServiceMs: Math.round(clamp(numeric(raw, "meanServiceMs"), 18, 120)),
      mode: nearest(raw.mode, MODES, DEFAULTS.mode),
      seed: Math.round(clamp(numeric(raw, "seed"), 1, 999)),
      serviceCv: Math.round(clamp(numeric(raw, "serviceCv"), 0, 180)),
      windowSec: Math.round(clamp(numeric(raw, "windowSec"), 8, 40))
    };
  }

  function makeRng(seed) {
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
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function positiveWithMeanCv(mean, cv, rand) {
    if (cv <= 0.01) return mean;
    var varianceScale = cv * cv;
    var sigma2 = Math.log(1 + varianceScale);
    var sigma = Math.sqrt(sigma2);
    var mu = Math.log(Math.max(1e-9, mean)) - sigma2 / 2;
    return Math.exp(mu + sigma * normal(rand));
  }

  function seedFor(params) {
    return (20260618
      + params.seed * 1009
      + params.load * 17
      + params.meanServiceMs * 19
      + params.arrivalCv * 23
      + params.serviceCv * 29
      + params.windowSec * 31
      + (params.mode === "drain" ? 7919 : 0)) >>> 0;
  }

  function generateJobs(params) {
    var rand = makeRng(seedFor(params));
    var meanService = params.meanServiceMs / 1000;
    var utilization = params.load / 100;
    var arrivalRate = utilization / meanService;
    var meanInterarrival = 1 / arrivalRate;
    var warmup = params.mode === "slice" ? clamp(params.windowSec * 0.38, 4, 14) : 0;
    var arrivalStop = params.mode === "slice" ? warmup + params.windowSec : params.windowSec;
    var jobs = [];
    var t = 0;
    var serviceCv = params.serviceCv / 100;
    var arrivalCv = params.arrivalCv / 100;

    while (t < arrivalStop) {
      t += positiveWithMeanCv(meanInterarrival, arrivalCv, rand);
      if (t > arrivalStop) break;
      jobs.push({
        arrival: t,
        departure: null,
        id: jobs.length,
        service: clamp(positiveWithMeanCv(meanService, serviceCv, rand), 0.0005, meanService * 18),
        start: null
      });
    }

    var serverFree = 0;
    jobs.forEach(function (job) {
      job.start = Math.max(job.arrival, serverFree);
      job.departure = job.start + job.service;
      serverFree = job.departure;
    });

    return {
      arrivalRate: arrivalRate,
      arrivalStop: arrivalStop,
      jobs: jobs,
      meanService: meanService,
      utilization: utilization,
      warmup: warmup
    };
  }

  function summarizeLedger(jobs, obsStart, obsEnd) {
    var ledger = {
      closed: 0,
      closedCount: 0,
      left: 0,
      right: 0,
      span: 0,
      total: 0
    };
    var arrivalsInWindow = 0;
    var departuresInWindow = 0;
    var openAtStart = 0;
    var openAtEnd = 0;
    var closedSojourns = [];

    jobs.forEach(function (job) {
      if (job.arrival >= obsStart && job.arrival < obsEnd) arrivalsInWindow += 1;
      if (job.departure > obsStart && job.departure <= obsEnd) departuresInWindow += 1;
      if (job.arrival < obsStart && job.departure > obsStart) openAtStart += 1;
      if (job.arrival < obsEnd && job.departure > obsEnd) openAtEnd += 1;

      var a = Math.max(job.arrival, obsStart);
      var d = Math.min(job.departure, obsEnd);
      if (d <= a) return;

      var overlap = d - a;
      ledger.total += overlap;

      if (job.arrival >= obsStart && job.departure <= obsEnd) {
        ledger.closed += job.departure - job.arrival;
        ledger.closedCount += 1;
        closedSojourns.push(job.departure - job.arrival);
      } else if (job.arrival < obsStart && job.departure > obsEnd) {
        ledger.span += overlap;
      } else if (job.arrival < obsStart) {
        ledger.left += overlap;
      } else {
        ledger.right += overlap;
      }
    });

    return {
      arrivalsInWindow: arrivalsInWindow,
      closedSojourns: closedSojourns,
      departuresInWindow: departuresInWindow,
      ledger: ledger,
      openAtEnd: openAtEnd,
      openAtStart: openAtStart
    };
  }

  function buildAreaTrace(jobs, obsStart, obsEnd) {
    var initial = 0;
    var events = [];

    jobs.forEach(function (job) {
      if (job.arrival < obsStart && job.departure > obsStart) initial += 1;
      if (job.arrival >= obsStart && job.arrival < obsEnd) {
        events.push({ delta: 1, t: job.arrival });
      }
      if (job.departure > obsStart && job.departure <= obsEnd) {
        events.push({ delta: -1, t: job.departure });
      }
    });

    events.sort(function (a, b) {
      if (a.t !== b.t) return a.t - b.t;
      return a.delta - b.delta;
    });

    var groups = [];
    events.forEach(function (event) {
      var last = groups[groups.length - 1];
      if (last && Math.abs(last.t - event.t) < 1e-12) {
        last.delta += event.delta;
      } else {
        groups.push({ delta: event.delta, nAfter: null, t: event.t });
      }
    });

    var n = initial;
    var lastTime = obsStart;
    var area = 0;
    var maxN = n;
    var minN = n;

    groups.forEach(function (group) {
      area += n * Math.max(0, group.t - lastTime);
      n += group.delta;
      group.nAfter = n;
      maxN = Math.max(maxN, n);
      minN = Math.min(minN, n);
      lastTime = group.t;
    });

    area += n * Math.max(0, obsEnd - lastTime);

    return {
      area: area,
      finalN: n,
      groups: groups,
      initialN: initial,
      maxN: maxN,
      minN: minN
    };
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = clamp(Math.ceil(sorted.length * p) - 1, 0, sorted.length - 1);
    return sorted[index];
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var generated = generateJobs(params);
    var jobs = generated.jobs;
    var lastDeparture = jobs.length ? jobs[jobs.length - 1].departure : generated.arrivalStop;
    var obsStart = params.mode === "slice" ? generated.warmup : 0;
    var obsEnd = params.mode === "slice" ? generated.warmup + params.windowSec : Math.max(generated.arrivalStop, lastDeparture);
    var window = Math.max(1e-9, obsEnd - obsStart);
    var trace = buildAreaTrace(jobs, obsStart, obsEnd);
    var summary = summarizeLedger(jobs, obsStart, obsEnd);
    var ledger = summary.ledger;
    var areaResidual = trace.area - ledger.total;
    var closedProduct = ledger.closed / window;
    var timeAverageL = trace.area / window;
    var edgeDebt = (trace.area - ledger.closed) / window;
    var closedRate = ledger.closedCount / window;
    var closedMeanW = ledger.closedCount ? ledger.closed / ledger.closedCount : 0;

    return {
      arrivalRate: generated.arrivalRate,
      area: trace.area,
      areaResidual: areaResidual,
      closedMeanW: closedMeanW,
      closedProduct: closedProduct,
      closedRate: closedRate,
      edgeDebt: edgeDebt,
      finalN: trace.finalN,
      groups: trace.groups,
      initialN: trace.initialN,
      jobs: jobs,
      ledger: ledger,
      maxN: trace.maxN,
      metrics: {
        arrivalsInWindow: summary.arrivalsInWindow,
        closedCount: ledger.closedCount,
        departuresInWindow: summary.departuresInWindow,
        openAtEnd: summary.openAtEnd,
        openAtStart: summary.openAtStart,
        p95ClosedW: percentile(summary.closedSojourns, 0.95)
      },
      minN: trace.minN,
      obsEnd: obsEnd,
      obsStart: obsStart,
      params: params,
      timeAverageL: timeAverageL,
      window: window
    };
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatMs(seconds) {
    var ms = seconds * 1000;
    if (!Number.isFinite(ms)) return "n/a";
    if (ms >= 1000) return (ms / 1000).toFixed(2) + " s";
    if (ms >= 100) return ms.toFixed(0) + " ms";
    if (ms >= 10) return ms.toFixed(1) + " ms";
    return ms.toFixed(2) + " ms";
  }

  function formatSec(seconds) {
    if (!Number.isFinite(seconds)) return "n/a";
    if (seconds >= 10) return seconds.toFixed(0) + " s";
    return seconds.toFixed(1) + " s";
  }

  function formatRate(value) {
    if (!Number.isFinite(value)) return "n/a";
    return formatNumber(value) + " / s";
  }

  function metric(label, value) {
    return '<div class="little-law-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function updateMetrics(root, result) {
    var metrics = root.querySelector("[data-metrics]");
    if (!metrics) return;

    metrics.innerHTML = [
      metric("time-avg L", formatNumber(result.timeAverageL) + " jobs"),
      metric("closed lambda W", formatNumber(result.closedProduct) + " jobs"),
      metric("edge debt", formatNumber(result.edgeDebt) + " jobs"),
      metric("closed throughput", formatRate(result.closedRate)),
      metric("mean W, closed", formatMs(result.closedMeanW)),
      metric("area residual", formatNumber(Math.abs(result.areaResidual)))
    ].join("");
  }

  function updateOutputs(root, result) {
    var params = result.params;
    var values = {
      arrivalCv: params.arrivalCv + "%",
      load: params.load + "%",
      meanServiceMs: params.meanServiceMs + " ms",
      seed: String(params.seed),
      serviceCv: params.serviceCv + "%",
      windowSec: params.windowSec + " s"
    };

    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function drawLabel(ctx, text, x, y, color, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawCanvas(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 860;
    var width = Math.max(320, parentWidth);
    var height = width < 560 ? 610 : 590;
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.lineWidth = 1;

    var left = width < 560 ? 42 : 58;
    var right = width < 560 ? 18 : 30;
    var top = 34;
    var plotH = width < 560 ? 265 : 285;
    var plotW = width - left - right;
    var plot = { h: plotH, w: plotW, x: left, y: top };
    var yMax = Math.max(1, Math.ceil(result.maxN * 1.12));

    function xFor(t) {
      return plot.x + ((t - result.obsStart) / result.window) * plot.w;
    }

    function yFor(n) {
      return plot.y + plot.h - (n / yMax) * plot.h;
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    for (var gy = 0; gy <= 4; gy += 1) {
      var y = plot.y + (plot.h * gy) / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    for (var gx = 0; gx <= 4; gx += 1) {
      var x = plot.x + (plot.w * gx) / 4;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }

    var n = result.initialN;
    ctx.beginPath();
    ctx.moveTo(xFor(result.obsStart), yFor(0));
    ctx.lineTo(xFor(result.obsStart), yFor(n));
    result.groups.forEach(function (group) {
      ctx.lineTo(xFor(group.t), yFor(n));
      n = group.nAfter;
      ctx.lineTo(xFor(group.t), yFor(n));
    });
    ctx.lineTo(xFor(result.obsEnd), yFor(n));
    ctx.lineTo(xFor(result.obsEnd), yFor(0));
    ctx.closePath();
    ctx.fillStyle = "rgba(15, 118, 110, 0.16)";
    ctx.fill();

    n = result.initialN;
    ctx.beginPath();
    ctx.moveTo(xFor(result.obsStart), yFor(n));
    result.groups.forEach(function (group) {
      ctx.lineTo(xFor(group.t), yFor(n));
      n = group.nAfter;
      ctx.lineTo(xFor(group.t), yFor(n));
    });
    ctx.lineTo(xFor(result.obsEnd), yFor(n));
    ctx.strokeStyle = COLORS.area;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);

    drawLabel(ctx, "jobs in system, N(t)", plot.x, plot.y - 13, COLORS.text, "left");
    drawLabel(ctx, "area / time = " + formatNumber(result.timeAverageL) + " jobs", plot.x + plot.w, plot.y - 13, COLORS.area, "right");
    drawLabel(ctx, "0", plot.x - 10, yFor(0) + 4, COLORS.muted, "right");
    drawLabel(ctx, String(yMax), plot.x - 10, yFor(yMax) + 4, COLORS.muted, "right");

    for (var tick = 0; tick <= 4; tick += 1) {
      var tx = plot.x + (plot.w * tick) / 4;
      var seconds = (result.window * tick) / 4;
      drawLabel(ctx, formatSec(seconds), tx, plot.y + plot.h + 18, COLORS.muted, "center");
    }

    var infoY = plot.y + plot.h + 42;
    var modeText = result.params.mode === "drain" ? "empty-to-empty drain" : "cropped production slice";
    drawLabel(ctx, modeText, plot.x, infoY, COLORS.text, "left");
    drawLabel(ctx, "start open " + result.metrics.openAtStart + " | end open " + result.metrics.openAtEnd, plot.x + plot.w, infoY, COLORS.muted, "right");

    var barTop = infoY + 32;
    var barW = plot.w;
    var barH = 27;
    var maxL = Math.max(result.timeAverageL, result.closedProduct, 0.001);
    var scale = barW / maxL;
    var components = [
      { color: COLORS.closed, label: "closed", value: result.ledger.closed / result.window },
      { color: COLORS.left, label: "left edge", value: result.ledger.left / result.window },
      { color: COLORS.right, label: "right edge", value: result.ledger.right / result.window },
      { color: COLORS.span, label: "spans window", value: result.ledger.span / result.window }
    ];

    drawLabel(ctx, "residence ledger, in average jobs", plot.x, barTop - 10, COLORS.text, "left");
    var cursor = plot.x;
    components.forEach(function (part) {
      var w = Math.max(0, part.value * scale);
      if (w <= 0.3) return;
      ctx.fillStyle = part.color;
      ctx.fillRect(cursor, barTop, w, barH);
      if (w > 58) {
        drawLabel(ctx, part.label, cursor + w / 2, barTop + 18, COLORS.white, "center");
      }
      cursor += w;
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, barTop, barW, barH);

    var productTop = barTop + 66;
    var productW = Math.max(0, result.closedProduct * scale);
    drawLabel(ctx, "completed-only lambda W", plot.x, productTop - 10, COLORS.text, "left");
    drawRoundedRect(ctx, plot.x, productTop, productW, barH, 4);
    ctx.fillStyle = "rgba(37, 99, 235, 0.18)";
    ctx.fill();
    ctx.strokeStyle = COLORS.closed;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    drawLabel(ctx, formatNumber(result.closedProduct) + " jobs", plot.x + Math.min(productW + 8, barW - 4), productTop + 18, COLORS.closed, "left");

    var totalX = plot.x + result.timeAverageL * scale;
    ctx.strokeStyle = COLORS.marker;
    ctx.beginPath();
    ctx.moveTo(totalX, barTop - 4);
    ctx.lineTo(totalX, productTop + barH + 6);
    ctx.stroke();
    drawLabel(ctx, "actual L", totalX, productTop + barH + 22, COLORS.marker, "center");

    var legendY = productTop + 64;
    var lx = plot.x;
    components.forEach(function (part) {
      ctx.fillStyle = part.color;
      ctx.fillRect(lx, legendY - 9, 10, 10);
      drawLabel(ctx, part.label, lx + 15, legendY, COLORS.muted, "left");
      lx += width < 560 ? 92 : 122;
      if (lx > plot.x + plot.w - 95) {
        lx = plot.x;
        legendY += 20;
      }
    });
  }

  function render(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    var result = evaluate(raw);
    updateOutputs(root, result);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function init(root) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function auditLittlesLawLab() {
    var failures = [];
    var rows = [];
    var maxResidual = 0;
    ["drain", "slice"].forEach(function (mode) {
      [45, 72, 93].forEach(function (load) {
        [0, 80, 160].forEach(function (arrivalCv) {
          [0, 90, 150].forEach(function (serviceCv) {
            [3, 41].forEach(function (seed) {
              var result = evaluate({
                arrivalCv: arrivalCv,
                load: load,
                meanServiceMs: 48,
                mode: mode,
                seed: seed,
                serviceCv: serviceCv,
                windowSec: 16
              });
              var failedChecks = [];
              var residual = Math.abs(result.areaResidual);
              maxResidual = Math.max(maxResidual, residual);
              var tolerance = 1e-8 * Math.max(1, result.area);
              if (residual > tolerance) {
                failedChecks.push("area ledger residual " + residual);
              }
              if (result.minN < -1e-9 || result.finalN < -1e-9) {
                failedChecks.push("negative queue length: min " + result.minN + ", final " + result.finalN);
              }
              var componentResidual = Math.abs(result.timeAverageL - result.closedProduct - result.edgeDebt);
              if (componentResidual > 1e-10) {
                failedChecks.push("component identity residual " + componentResidual);
              }
              if (mode === "drain" && Math.abs(result.area - result.ledger.closed) > tolerance) {
                failedChecks.push("drain should close all rectangles, residual " + (result.area - result.ledger.closed));
              }
              var row = {
                mode: mode,
                load: load,
                arrivalCv: arrivalCv,
                serviceCv: serviceCv,
                seed: seed,
                area: result.area,
                areaResidual: residual,
                closedProduct: result.closedProduct,
                edgeDebt: result.edgeDebt,
                finalN: result.finalN,
                openAtEnd: result.metrics.openAtEnd,
                openAtStart: result.metrics.openAtStart,
                passed: failedChecks.length === 0,
                failedChecks: failedChecks,
                timeAverageL: result.timeAverageL,
                window: result.window
              };
              rows.push(row);
              failedChecks.forEach(function (failure) {
                failures.push({
                  arrivalCv: arrivalCv,
                  kind: failure,
                  load: load,
                  mode: mode,
                  seed: seed,
                  serviceCv: serviceCv
                });
              });
            });
          });
        });
      });
    });

    function summarize(groupBy) {
      var groups = {};
      rows.forEach(function (row) {
        var key = String(row[groupBy]);
        if (!groups[key]) {
          groups[key] = {
            cases: 0,
            edgeDebt: 0,
            maxResidual: 0,
            openAtEnd: 0,
            openAtStart: 0,
            passed: 0
          };
          groups[key][groupBy] = row[groupBy];
        }
        groups[key].cases += 1;
        groups[key].edgeDebt += row.edgeDebt;
        groups[key].maxResidual = Math.max(groups[key].maxResidual, row.areaResidual);
        groups[key].openAtEnd += row.openAtEnd;
        groups[key].openAtStart += row.openAtStart;
        if (row.passed) groups[key].passed += 1;
      });
      return Object.keys(groups).sort(function (a, b) {
        if (groupBy === "load") return Number(a) - Number(b);
        return a.localeCompare(b);
      }).map(function (key) {
        var group = groups[key];
        group.meanEdgeDebt = group.edgeDebt / group.cases;
        delete group.edgeDebt;
        return group;
      });
    }

    var byMode = summarize("mode");
    var byLoad = summarize("load");
    var worstResiduals = rows.slice().sort(function (a, b) {
      return b.areaResidual - a.areaResidual;
    }).slice(0, 6).map(function (row) {
      return {
        mode: row.mode,
        load: row.load,
        arrivalCv: row.arrivalCv,
        serviceCv: row.serviceCv,
        seed: row.seed,
        residual: row.areaResidual,
        edgeDebt: row.edgeDebt,
        passed: row.passed
      };
    });
    var passed = rows.filter(function (row) { return row.passed; }).length;

    return {
      byLoad: byLoad,
      byMode: byMode,
      caseCount: rows.length,
      cases: rows,
      failures: failures,
      maxResidual: maxResidual,
      ok: failures.length === 0,
      pass: failures.length === 0,
      passed: passed,
      total: rows.length,
      worstResiduals: worstResiduals
    };
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-littles-law-lab]").forEach(init);
    });
    window.addEventListener("resize", function () {
      document.querySelectorAll("[data-littles-law-lab]").forEach(render);
    });
  }

  global.LittlesLawLab = {
    audit: auditLittlesLawLab,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.LittlesLawLab;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
