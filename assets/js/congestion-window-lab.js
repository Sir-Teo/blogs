(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    queue: "#b45309",
    target: "#7c3aed",
    good: "#0f766e",
    bad: "#be123c",
    flow: ["#2563eb", "#0f766e", "#dc2626", "#7c3aed", "#b45309", "#0891b2", "#4f46e5", "#65a30d"],
    white: "#ffffff"
  };

  var DEFAULTS = {
    flows: 4,
    capacity: 90,
    buffer: 360,
    baseRtt: 60,
    targetDelay: 25,
    beta: 50,
    mode: "tail",
    steps: 180,
    stagger: 35
  };

  var MODES = ["tail", "aqm", "none"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function nearest(value, allowed, fallback) {
    value = String(value == null ? fallback : value);
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function cleanParams(raw) {
    return {
      flows: Math.round(clamp(numeric(raw, "flows"), 1, 8)),
      capacity: Math.round(clamp(numeric(raw, "capacity"), 30, 180)),
      buffer: Math.round(clamp(numeric(raw, "buffer"), 30, 900)),
      baseRtt: Math.round(clamp(numeric(raw, "baseRtt"), 20, 180)),
      targetDelay: Math.round(clamp(numeric(raw, "targetDelay"), 5, 120)),
      beta: Math.round(clamp(numeric(raw, "beta"), 30, 80)),
      mode: nearest(raw && raw.mode, MODES, DEFAULTS.mode),
      steps: Math.round(clamp(numeric(raw, "steps"), 80, 320)),
      stagger: Math.round(clamp(numeric(raw, "stagger"), 0, 100))
    };
  }

  function seededNoise(index, salt) {
    var x = Math.imul(index + 1, 0x9e3779b1) ^ salt;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return ((x >>> 0) + 0.5) / 4294967297;
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
    var lo = Math.floor(index);
    var hi = Math.ceil(index);
    var t = index - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  function jainFairness(values) {
    var sum = values.reduce(function (a, b) { return a + b; }, 0);
    var sq = values.reduce(function (a, b) { return a + b * b; }, 0);
    return sum <= 0 || sq <= 0 ? 1 : sum * sum / (values.length * sq);
  }

  function initialWindows(params) {
    var out = [];
    var center = Math.max(2, params.capacity / params.flows * 0.42);
    for (var i = 0; i < params.flows; i += 1) {
      var offset = (seededNoise(i, 0x51a7) - 0.5) * params.stagger / 100;
      out.push(Math.max(2, center * (1 + offset)));
    }
    return out;
  }

  function chooseAqmMarks(cwnd, queueDelay, params, tick) {
    if (params.mode !== "aqm" || queueDelay <= params.targetDelay) return [];
    var excess = (queueDelay - params.targetDelay) / Math.max(1, params.targetDelay);
    var count = clamp(Math.ceil(excess), 1, Math.max(1, Math.ceil(params.flows / 2)));
    var order = cwnd.map(function (value, index) {
      return {
        index: index,
        score: value + 0.001 * seededNoise(tick * 17 + index, 0xA11D)
      };
    }).sort(function (a, b) {
      if (Math.abs(b.score - a.score) < 1e-12) return a.index - b.index;
      return b.score - a.score;
    });
    return order.slice(0, count).map(function (row) { return row.index; });
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var cwnd = initialWindows(params);
    var queue = 0;
    var beta = params.beta / 100;
    var rows = [];
    var totals = new Array(params.flows).fill(0);
    var deliveredTotals = new Array(params.flows).fill(0);
    var markCounts = new Array(params.flows).fill(0);
    var syncEvents = 0;
    var congestionEvents = 0;

    for (var t = 0; t < params.steps; t += 1) {
      var sent = cwnd.reduce(function (a, b) { return a + b; }, 0);
      var offered = queue + sent;
      var served = Math.min(params.capacity, offered);
      var nextQueue = Math.max(0, offered - served);
      var drop = Math.max(0, nextQueue - params.buffer);
      if (drop > 0) nextQueue = params.buffer;
      var queueDelay = queue / Math.max(1, params.capacity) * params.baseRtt;

      var marked = [];
      if (params.mode === "tail" && drop > 0) {
        for (var f = 0; f < params.flows; f += 1) marked.push(f);
      } else if (params.mode === "aqm") {
        marked = chooseAqmMarks(cwnd, queueDelay, params, t);
      }

      if (marked.length) {
        congestionEvents += 1;
        if (marked.length > params.flows / 2) syncEvents += 1;
      }

      var deliveredShare = sent > 0 ? served / sent : 0;
      for (var i = 0; i < params.flows; i += 1) {
        var sentI = cwnd[i];
        totals[i] += sentI;
        deliveredTotals[i] += sentI * Math.min(1, deliveredShare);
      }

      rows.push({
        tick: t,
        cwnd: cwnd.slice(),
        sent: sent,
        served: served,
        queue: queue,
        queueDelay: queueDelay,
        drop: drop,
        marked: marked.slice(),
        utilization: served / params.capacity
      });

      var markSet = Object.create(null);
      marked.forEach(function (index) { markSet[index] = true; });
      for (var j = 0; j < params.flows; j += 1) {
        if (markSet[j]) {
          cwnd[j] = Math.max(2, cwnd[j] * beta);
          markCounts[j] += 1;
        } else {
          cwnd[j] += 1;
        }
      }
      queue = nextQueue;
    }

    var tail = rows.slice(Math.max(0, Math.floor(rows.length / 2)));
    var queueValues = tail.map(function (row) { return row.queueDelay; });
    var util = tail.reduce(function (sum, row) { return sum + row.utilization; }, 0) / Math.max(1, tail.length);
    var avgQueue = queueValues.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, queueValues.length);
    var deliveredTotal = deliveredTotals.reduce(function (sum, value) { return sum + value; }, 0);
    var sentTotal = totals.reduce(function (sum, value) { return sum + value; }, 0);
    return {
      params: params,
      rows: rows,
      totals: totals,
      deliveredTotals: deliveredTotals,
      markCounts: markCounts,
      summary: {
        utilization: util,
        avgQueueDelay: avgQueue,
        p95QueueDelay: percentile(queueValues, 0.95),
        maxQueueDelay: Math.max.apply(null, queueValues.concat([0])),
        fairness: jainFairness(deliveredTotals),
        deliveredTotal: deliveredTotal,
        sentTotal: sentTotal,
        lossShare: sentTotal > 0 ? Math.max(0, sentTotal - deliveredTotal) / sentTotal : 0,
        congestionEvents: congestionEvents,
        syncShare: congestionEvents ? syncEvents / congestionEvents : 0
      }
    };
  }

  function compareModes(params) {
    return MODES.map(function (mode) {
      var sim = simulate(Object.assign({}, params, { mode: mode }));
      return {
        mode: mode,
        utilization: sim.summary.utilization,
        p95QueueDelay: sim.summary.p95QueueDelay,
        fairness: sim.summary.fairness,
        lossShare: sim.summary.lossShare
      };
    });
  }

  function evaluate(raw) {
    var result = simulate(raw);
    result.comparison = compareModes(result.params);
    return result;
  }

  function formatInt(value) {
    return Math.round(value).toLocaleString();
  }

  function formatMs(value) {
    return value.toFixed(value >= 100 ? 0 : 1) + " ms";
  }

  function formatPct(value) {
    return (100 * value).toFixed(value >= 0.1 ? 0 : 1) + "%";
  }

  function metric(label, value) {
    return '<div class="congestion-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var height = targetHeight;
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
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

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function drawGrid(ctx, plot) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h - i * plot.h / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawCwnd(ctx, result, box) {
    panel(ctx, box, "Congestion windows", "additive climb, multiplicative cuts");
    var plot = { x: box.x + 40, y: box.y + 54, w: box.w - 58, h: box.h - 84 };
    var max = result.rows.reduce(function (m, row) {
      return Math.max(m, Math.max.apply(null, row.cwnd));
    }, 1);
    drawGrid(ctx, plot);
    result.rows[0].cwnd.forEach(function (_, flow) {
      ctx.strokeStyle = COLORS.flow[flow % COLORS.flow.length];
      ctx.lineWidth = flow === 0 ? 2.4 : 1.8;
      ctx.beginPath();
      result.rows.forEach(function (row, i) {
        var x = plot.x + i / Math.max(1, result.rows.length - 1) * plot.w;
        var y = plot.y + plot.h - row.cwnd[flow] / max * plot.h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    label(ctx, "flow cwnd", plot.x + 4, plot.y + 14, "left", COLORS.text, "700 11px system-ui, sans-serif");
    label(ctx, "RTT", plot.x + plot.w - 8, plot.y + plot.h + 23, "right");
  }

  function drawQueue(ctx, result, box) {
    panel(ctx, box, "Standing queue", "bandwidth can be full while delay grows");
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 60, h: box.h - 84 };
    var max = Math.max(result.params.targetDelay * 2, result.summary.maxQueueDelay, 1);
    drawGrid(ctx, plot);
    ctx.strokeStyle = COLORS.queue;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    result.rows.forEach(function (row, i) {
      var x = plot.x + i / Math.max(1, result.rows.length - 1) * plot.w;
      var y = plot.y + plot.h - row.queueDelay / max * plot.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    var targetY = plot.y + plot.h - result.params.targetDelay / max * plot.h;
    ctx.strokeStyle = COLORS.target;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, targetY);
    ctx.lineTo(plot.x + plot.w, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "queue delay", plot.x + 4, plot.y + 14, "left", COLORS.queue, "700 11px system-ui, sans-serif");
    label(ctx, "target", plot.x + plot.w - 38, targetY - 6, "left", COLORS.target);
    label(ctx, formatMs(max), plot.x - 4, plot.y + 4, "right");
  }

  function drawComparison(ctx, result, box) {
    panel(ctx, box, "Policy comparison", "same offered load, different signal timing");
    var rows = result.comparison;
    var left = box.x + 78;
    var top = box.y + 62;
    var width = box.w - 116;
    rows.forEach(function (row, i) {
      var y = top + i * 54;
      var color = row.mode === "tail" ? COLORS.bad : (row.mode === "aqm" ? COLORS.good : COLORS.muted);
      label(ctx, row.mode === "tail" ? "tail drop" : (row.mode === "aqm" ? "delay mark" : "no signal"), box.x + 14, y + 16, "left", COLORS.text, "700 11px system-ui, sans-serif");
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(left, y, Math.max(2, row.utilization * width), 16);
      ctx.globalAlpha = 1;
      label(ctx, "util " + formatPct(row.utilization), left + 4, y + 12, "left", COLORS.white, "700 10px system-ui, sans-serif");
      ctx.fillStyle = COLORS.queue;
      var qWidth = clamp(row.p95QueueDelay / Math.max(1, result.params.baseRtt * 4), 0, 1) * width;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(left, y + 22, Math.max(2, qWidth), 12);
      ctx.globalAlpha = 1;
      label(ctx, "p95 " + formatMs(row.p95QueueDelay), left + Math.max(2, qWidth) + 5, y + 32);
    });
  }

  function drawShares(ctx, result, box) {
    panel(ctx, box, "Flow shares", "fairness is measured after delivery");
    var values = result.deliveredTotals;
    var total = values.reduce(function (a, b) { return a + b; }, 0) || 1;
    var left = box.x + 18;
    var top = box.y + 60;
    var width = box.w - 36;
    var x = left;
    values.forEach(function (value, i) {
      var w = value / total * width;
      ctx.fillStyle = COLORS.flow[i % COLORS.flow.length];
      ctx.globalAlpha = 0.78;
      ctx.fillRect(x, top, w, 32);
      ctx.globalAlpha = 1;
      if (w > 28) label(ctx, String(i + 1), x + w / 2, top + 21, "center", COLORS.white, "700 12px system-ui, sans-serif");
      x += w;
    });
    label(ctx, "Jain fairness " + result.summary.fairness.toFixed(3), left, top + 58, "left", COLORS.text, "700 12px system-ui, sans-serif");
    label(ctx, "synchronized events " + formatPct(result.summary.syncShare), left, top + 80, "left", result.summary.syncShare > 0.4 ? COLORS.bad : COLORS.muted);
    result.markCounts.forEach(function (count, i) {
      var bx = left + i * Math.min(34, width / Math.max(1, result.params.flows));
      ctx.fillStyle = COLORS.flow[i % COLORS.flow.length];
      ctx.globalAlpha = 0.7;
      ctx.fillRect(bx, box.y + box.h - 34, 18, Math.max(2, Math.min(28, count / Math.max(1, result.summary.congestionEvents) * 34)));
      ctx.globalAlpha = 1;
    });
    label(ctx, "marks by flow", left, box.y + box.h - 42);
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 700;
    var setup = setupCanvas(canvas, compact ? 980 : 700);
    var ctx = setup.ctx;
    if (compact) {
      drawCwnd(ctx, result, { x: 8, y: 8, w: setup.width - 16, h: 236 });
      drawQueue(ctx, result, { x: 8, y: 256, w: setup.width - 16, h: 228 });
      drawComparison(ctx, result, { x: 8, y: 496, w: setup.width - 16, h: 228 });
      drawShares(ctx, result, { x: 8, y: 736, w: setup.width - 16, h: 236 });
    } else {
      var col = Math.round((setup.width - 28) / 2);
      drawCwnd(ctx, result, { x: 8, y: 8, w: col, h: 330 });
      drawQueue(ctx, result, { x: col + 20, y: 8, w: setup.width - col - 28, h: 330 });
      drawComparison(ctx, result, { x: 8, y: 354, w: col, h: 338 });
      drawShares(ctx, result, { x: col + 20, y: 354, w: setup.width - col - 28, h: 338 });
    }
  }

  function renderMetrics(root, result) {
    var html = [
      metric("utilization", formatPct(result.summary.utilization)),
      metric("p95 queue delay", formatMs(result.summary.p95QueueDelay)),
      metric("avg queue delay", formatMs(result.summary.avgQueueDelay)),
      metric("fairness", result.summary.fairness.toFixed(3)),
      metric("loss/mark events", formatInt(result.summary.congestionEvents)),
      metric("sync share", formatPct(result.summary.syncShare))
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function updateOutputs(root, params) {
    var display = {
      flows: String(params.flows),
      capacity: formatInt(params.capacity),
      buffer: formatInt(params.buffer),
      baseRtt: formatMs(params.baseRtt),
      targetDelay: formatMs(params.targetDelay),
      beta: formatPct(params.beta / 100),
      steps: String(params.steps),
      stagger: params.stagger + "%"
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")] || "";
    });
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      raw[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    return raw;
  }

  function render(root) {
    var result = evaluate(parseParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function initOne(root) {
    if (root.__congestionLabReady) return;
    root.__congestionLabReady = true;
    var schedule = null;
    function requestRender() {
      if (schedule && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(schedule);
      schedule = typeof global.requestAnimationFrame === "function"
        ? global.requestAnimationFrame(function () {
          schedule = null;
          render(root);
        })
        : global.setTimeout(function () {
          schedule = null;
          render(root);
        }, 16);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    requestRender();
    global.addEventListener("resize", requestRender);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-congestion-lab]")).forEach(initOne);
  }

  function near(a, b, eps) {
    return Math.abs(a - b) <= eps;
  }

  function auditCongestionWindowLab() {
    var failures = [];
    var cases = 0;

    function record(condition, message) {
      if (!condition) failures.push(message);
    }

    ["tail", "aqm", "none"].forEach(function (mode) {
      [1, 4, 8].forEach(function (flows) {
        [30, 90, 180].forEach(function (capacity) {
          [30, 360, 900].forEach(function (buffer) {
            [20, 60, 180].forEach(function (baseRtt) {
              [5, 25, 120].forEach(function (targetDelay) {
                [30, 50, 80].forEach(function (beta) {
                  [0, 35, 100].forEach(function (stagger) {
                    var result = evaluate({
                      baseRtt: baseRtt,
                      beta: beta,
                      buffer: buffer,
                      capacity: capacity,
                      flows: flows,
                      mode: mode,
                      stagger: stagger,
                      targetDelay: targetDelay
                    });
                    var params = result.params;
                    cases += 1;

                    record(result.rows.length === params.steps, mode + " row count matches steps");
                    record(result.totals.length === params.flows, mode + " totals length matches flows");
                    record(result.deliveredTotals.length === params.flows, mode + " delivered length matches flows");
                    record(result.markCounts.length === params.flows, mode + " mark length matches flows");
                    result.rows.forEach(function (row) {
                      record(row.queue >= 0 && row.queue <= params.buffer + 1e-9, mode + " queue bounded by buffer");
                      record(row.queueDelay >= 0 && Number.isFinite(row.queueDelay), mode + " queue delay finite");
                      record(row.utilization >= 0 && row.utilization <= 1 + 1e-12, mode + " utilization bounded");
                      record(row.cwnd.length === params.flows, mode + " cwnd length matches flows");
                      row.cwnd.forEach(function (window) {
                        record(window >= 2 && Number.isFinite(window), mode + " cwnd stays finite and positive");
                      });
                      row.marked.forEach(function (index) {
                        record(index >= 0 && index < params.flows, mode + " marked flow index is valid");
                      });
                    });
                    Object.keys(result.summary).forEach(function (key) {
                      record(Number.isFinite(result.summary[key]), mode + " summary " + key + " is finite");
                    });
                    record(result.summary.fairness > 0 && result.summary.fairness <= 1 + 1e-12, mode + " fairness bounded");
                    record(result.summary.lossShare >= 0 && result.summary.lossShare <= 1 + 1e-12, mode + " loss share bounded");
                    record(result.summary.syncShare >= 0 && result.summary.syncShare <= 1 + 1e-12, mode + " sync share bounded");
                  });
                });
              });
            });
          });
        });
      });
    });

    var tail = evaluate({ mode: "tail" });
    var aqm = evaluate({ mode: "aqm" });
    var none = evaluate({ mode: "none" });
    record(near(tail.summary.utilization, 1, 1e-12), "default tail drop saturates bottleneck");
    record(tail.summary.p95QueueDelay > aqm.summary.p95QueueDelay, "default delay marking lowers p95 queue delay");
    record(tail.summary.syncShare === 1, "default tail drop synchronizes congestion events");
    record(aqm.summary.syncShare === 0, "default delay marking avoids synchronized events");
    record(none.summary.lossShare > tail.summary.lossShare, "no-signal mode wastes more offered work than tail drop");
    record(none.summary.congestionEvents === 0, "no-signal mode has no feedback events");
    record(cleanParams({ flows: 99, capacity: -1, buffer: "x", mode: "bad", baseRtt: 999, targetDelay: -4, beta: 12, stagger: 123 }).mode === DEFAULTS.mode, "invalid mode falls back");

    return {
      cases: cases,
      defaultSummary: {
        aqmP95QueueDelay: aqm.summary.p95QueueDelay,
        aqmUtilization: aqm.summary.utilization,
        noneLossShare: none.summary.lossShare,
        tailAverageQueueDelay: tail.summary.avgQueueDelay,
        tailP95QueueDelay: tail.summary.p95QueueDelay,
        tailSyncShare: tail.summary.syncShare,
        tailUtilization: tail.summary.utilization
      },
      failures: failures,
      passed: failures.length === 0
    };
  }

  var api = {
    auditCongestionWindowLab: auditCongestionWindowLab,
    cleanParams: cleanParams,
    evaluate: evaluate,
    jainFairness: jainFairness,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CongestionWindowLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
