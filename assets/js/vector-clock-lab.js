(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    process: "#2563eb",
    message: "#7c3aed",
    receive: "#0f766e",
    internal: "#64748b",
    concurrent: "#cbd5e1",
    falseOrder: "#b45309",
    bad: "#be123c"
  };

  var DEFAULTS = {
    processes: 5,
    events: 96,
    sendRate: 34,
    receiveBias: 68,
    seed: 41
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6d2b79f5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      events: clamp(Math.round(raw.events == null ? DEFAULTS.events : raw.events), 24, 180),
      processes: clamp(Math.round(raw.processes == null ? DEFAULTS.processes : raw.processes), 3, 8),
      receiveBias: clamp(Number(raw.receiveBias == null ? DEFAULTS.receiveBias : raw.receiveBias), 0, 100),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 999),
      sendRate: clamp(Number(raw.sendRate == null ? DEFAULTS.sendRate : raw.sendRate), 0, 80)
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 1 : digits;
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="clock-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function vectorLeq(a, b) {
    for (var i = 0; i < a.length; i += 1) if (a[i] > b[i]) return false;
    return true;
  }

  function vectorLt(a, b) {
    if (!vectorLeq(a, b)) return false;
    for (var i = 0; i < a.length; i += 1) if (a[i] < b[i]) return true;
    return false;
  }

  function makeTrace(rawParams) {
    var params = cleanParams(rawParams);
    var rand = rng(params.seed * 1000003 + params.events * 9176 + params.processes * 271);
    var scalar = new Array(params.processes).fill(0);
    var vector = Array.from({ length: params.processes }, function () {
      return new Array(params.processes).fill(0);
    });
    var localIndex = new Array(params.processes).fill(0);
    var lastEvent = new Array(params.processes).fill(-1);
    var pending = [];
    var events = [];
    var edges = [];
    var messages = [];

    function chooseProcess() {
      return Math.floor(rand() * params.processes);
    }

    function chooseOther(p) {
      var q = Math.floor(rand() * (params.processes - 1));
      if (q >= p) q += 1;
      return q;
    }

    for (var step = 0; step < params.events; step += 1) {
      var p = chooseProcess();
      var deliverable = pending.filter(function (msg) { return msg.to === p; });
      var receive = deliverable.length > 0 && rand() < params.receiveBias / 100;
      var msg = null;
      var kind = "internal";
      var from = -1;
      var to = -1;

      if (receive) {
        msg = deliverable[Math.floor(rand() * deliverable.length)];
        pending.splice(pending.indexOf(msg), 1);
        scalar[p] = Math.max(scalar[p], msg.scalar) + 1;
        for (var vi = 0; vi < params.processes; vi += 1) {
          vector[p][vi] = Math.max(vector[p][vi], msg.vector[vi]);
        }
        vector[p][p] += 1;
        kind = "receive";
        from = msg.fromEvent;
      } else {
        scalar[p] += 1;
        vector[p][p] += 1;
        if (rand() < params.sendRate / 100) {
          kind = "send";
          to = chooseOther(p);
        }
      }

      var id = events.length;
      var event = {
        clock: scalar[p],
        id: id,
        kind: kind,
        local: localIndex[p],
        process: p,
        receiveFrom: from,
        sendTo: to,
        vector: vector[p].slice()
      };
      events.push(event);

      if (lastEvent[p] !== -1) edges.push([lastEvent[p], id, "local"]);
      if (from !== -1) {
        edges.push([from, id, "message"]);
        messages.push({ from: from, to: id });
      }
      if (kind === "send") {
        pending.push({
          from: p,
          fromEvent: id,
          scalar: scalar[p],
          to: to,
          vector: vector[p].slice()
        });
      }
      lastEvent[p] = id;
      localIndex[p] += 1;
    }

    return {
      edges: edges,
      events: events,
      messages: messages,
      params: params,
      perProcess: localIndex
    };
  }

  function transitiveClosure(trace) {
    var n = trace.events.length;
    var reach = Array.from({ length: n }, function () {
      return new Array(n).fill(false);
    });
    for (var i = 0; i < trace.edges.length; i += 1) reach[trace.edges[i][0]][trace.edges[i][1]] = true;
    for (var k = 0; k < n; k += 1) {
      for (var a = 0; a < n; a += 1) {
        if (!reach[a][k]) continue;
        for (var b = 0; b < n; b += 1) {
          if (reach[k][b]) reach[a][b] = true;
        }
      }
    }
    return reach;
  }

  function analyze(trace) {
    var reach = transitiveClosure(trace);
    var events = trace.events;
    var causalPairs = 0;
    var concurrentPairs = 0;
    var lamportViolations = 0;
    var scalarFalsePrecedence = 0;
    var vectorMisses = 0;
    var equalScalarConcurrent = 0;

    for (var i = 0; i < events.length; i += 1) {
      for (var j = i + 1; j < events.length; j += 1) {
        var iBeforeJ = reach[i][j];
        var jBeforeI = reach[j][i];
        var vectorSaysI = vectorLt(events[i].vector, events[j].vector);
        var vectorSaysJ = vectorLt(events[j].vector, events[i].vector);

        if (iBeforeJ || jBeforeI) {
          causalPairs += 1;
          var before = iBeforeJ ? events[i] : events[j];
          var after = iBeforeJ ? events[j] : events[i];
          if (before.clock >= after.clock) lamportViolations += 1;
          if (vectorSaysI !== iBeforeJ || vectorSaysJ !== jBeforeI) vectorMisses += 1;
        } else {
          concurrentPairs += 1;
          if (events[i].clock !== events[j].clock) scalarFalsePrecedence += 1;
          else equalScalarConcurrent += 1;
          if (vectorSaysI || vectorSaysJ) vectorMisses += 1;
        }
      }
    }

    var selected = events[events.length - 1];
    var frontier = selected.vector.map(function (count, process) {
      return {
        count: count,
        process: process,
        total: trace.perProcess[process]
      };
    });

    return {
      causalPairs: causalPairs,
      concurrentPairs: concurrentPairs,
      equalScalarConcurrent: equalScalarConcurrent,
      frontier: frontier,
      lamportViolations: lamportViolations,
      reach: reach,
      scalarFalsePrecedence: scalarFalsePrecedence,
      selected: selected,
      vectorMisses: vectorMisses
    };
  }

  function evaluate(rawParams) {
    var trace = makeTrace(rawParams);
    var analysis = analyze(trace);
    return {
      analysis: analysis,
      params: trace.params,
      trace: trace
    };
  }

  function readState(container, previous) {
    var raw = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var display = {
      events: String(params.events),
      processes: String(params.processes),
      receiveBias: Math.round(params.receiveBias) + "%",
      seed: String(params.seed),
      sendRate: Math.round(params.sendRate) + "%"
    };
    Object.keys(display).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = display[key];
      });
    });
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 680 ? 780 : 560;
    var ratio = root.devicePixelRatio || 1;
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, 13, COLORS.text, 750);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 42, 11, COLORS.muted, 550);
  }

  function eventPoint(event, box, trace) {
    var laneGap = box.h / Math.max(1, trace.params.processes - 1);
    return {
      x: box.x + 36 + (box.w - 58) * event.id / Math.max(1, trace.events.length - 1),
      y: box.y + 58 + laneGap * event.process
    };
  }

  function drawTrace(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "space-time trace", "local order plus delivered messages");
    var trace = result.trace;
    var box = { x: x + 10, y: y + 48, w: w - 20, h: h - 78 };
    for (var p = 0; p < trace.params.processes; p += 1) {
      var yy = box.y + 10 + (box.h - 20) * p / Math.max(1, trace.params.processes - 1);
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(box.x + 26, yy);
      ctx.lineTo(box.x + box.w - 14, yy);
      ctx.stroke();
      drawText(ctx, "P" + p, box.x + 8, yy + 4, 10, COLORS.muted, 700);
    }

    trace.messages.slice(0, 60).forEach(function (msg) {
      var from = eventPoint(trace.events[msg.from], box, trace);
      var to = eventPoint(trace.events[msg.to], box, trace);
      ctx.strokeStyle = COLORS.message;
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    trace.events.forEach(function (event) {
      var pt = eventPoint(event, box, trace);
      ctx.fillStyle = event.kind === "send" ? COLORS.message : event.kind === "receive" ? COLORS.receive : COLORS.internal;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, event.id === result.analysis.selected.id ? 5.5 : 3.2, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  function drawPairGrid(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "pair classifier", "green causal, gray concurrent, orange scalar false order");
    var events = result.trace.events;
    var reach = result.analysis.reach;
    var sample = Math.min(34, events.length);
    var stride = Math.max(1, Math.floor(events.length / sample));
    var grid = Math.min(w - 44, h - 74);
    var cell = grid / sample;
    var left = x + 32;
    var top = y + 58;

    for (var r = 0; r < sample; r += 1) {
      var i = Math.min(events.length - 1, r * stride);
      for (var c = 0; c < sample; c += 1) {
        var j = Math.min(events.length - 1, c * stride);
        if (i === j) ctx.fillStyle = COLORS.text;
        else if (reach[i][j] || reach[j][i]) ctx.fillStyle = "#d1fae5";
        else if (events[i].clock !== events[j].clock) ctx.fillStyle = "#fef3c7";
        else ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(left + c * cell, top + r * cell, Math.max(1, cell - 0.5), Math.max(1, cell - 0.5));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, grid, grid);
    drawText(ctx, "sampled event pairs", left + grid / 2, y + h - 14, 10, COLORS.muted, 650, "center");
  }

  function drawLedger(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "order ledger", "Lamport respects causality; vector clocks recover it");
    var rows = [
      { color: COLORS.receive, label: "happened-before pairs", value: result.analysis.causalPairs },
      { color: COLORS.concurrent, label: "concurrent pairs", value: result.analysis.concurrentPairs },
      { color: COLORS.falseOrder, label: "scalar false precedences", value: result.analysis.scalarFalsePrecedence },
      { color: COLORS.bad, label: "vector mismatches", value: result.analysis.vectorMisses }
    ];
    var maxValue = Math.max.apply(null, rows.map(function (row) { return row.value; }).concat([1]));
    var left = x + 132;
    var right = x + w - 24;
    var top = y + 68;
    var rowH = Math.max(32, (h - 98) / rows.length);
    rows.forEach(function (row, i) {
      var yy = top + i * rowH;
      drawText(ctx, row.label, x + 16, yy + 13, 11, COLORS.text, 700);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy, right - left, 12);
      ctx.fillStyle = row.color;
      ctx.fillRect(left, yy, (right - left) * row.value / maxValue, 12);
      drawText(ctx, formatNumber(row.value, 0), right, yy + 12, 10, row.color === COLORS.concurrent ? COLORS.gray : row.color, 750, "right");
    });
  }

  function drawFrontier(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "selected event's causal frontier", "vector entry = events from each process in its past");
    var frontier = result.analysis.frontier;
    var left = x + 48;
    var right = x + w - 20;
    var top = y + 66;
    var bottom = y + h - 34;
    var bw = (right - left) / frontier.length;
    frontier.forEach(function (row, i) {
      var totalH = bottom - top;
      var seenH = totalH * row.count / Math.max(1, row.total);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left + i * bw + bw * 0.18, top, bw * 0.58, totalH);
      ctx.fillStyle = i === result.analysis.selected.process ? COLORS.receive : COLORS.process;
      ctx.fillRect(left + i * bw + bw * 0.18, bottom - seenH, bw * 0.58, seenH);
      drawText(ctx, "P" + row.process, left + (i + 0.47) * bw, bottom + 17, 10, COLORS.muted, 650, "center");
      drawText(ctx, row.count + "/" + row.total, left + (i + 0.47) * bw, bottom - seenH - 6, 10, COLORS.text, 700, "center");
    });
    drawText(ctx, "event #" + result.analysis.selected.id + " on P" + result.analysis.selected.process + " has vector [" + result.analysis.selected.vector.join(",") + "]", left, y + h - 10, 10, COLORS.muted, 600);
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 14;
    var gap = 14;

    if (width < 680) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawTrace(ctx, result, pad, pad, width - pad * 2, panelH);
      drawPairGrid(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawLedger(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawFrontier(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }

    var halfW = (width - pad * 2 - gap) / 2;
    var halfH = (height - pad * 2 - gap) / 2;
    drawTrace(ctx, result, pad, pad, halfW, halfH);
    drawPairGrid(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawLedger(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawFrontier(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function updateMetrics(metrics, result) {
    var totalPairs = result.analysis.causalPairs + result.analysis.concurrentPairs;
    metrics.innerHTML = [
      metric("events", String(result.trace.events.length)),
      metric("delivered messages", String(result.trace.messages.length)),
      metric("happened-before pairs", formatNumber(result.analysis.causalPairs, 0)),
      metric("concurrent pairs", formatNumber(result.analysis.concurrentPairs, 0)),
      metric("scalar false order", formatNumber(result.analysis.scalarFalsePrecedence, 0)),
      metric("vector mismatches", String(result.analysis.vectorMisses)),
      metric("Lamport violations", String(result.analysis.lamportViolations)),
      metric("concurrency share", Math.round(100 * result.analysis.concurrentPairs / Math.max(1, totalPairs)) + "%")
    ].join("");
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-vector-clock-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    analyze: analyze,
    cleanParams: cleanParams,
    evaluate: evaluate,
    makeTrace: makeTrace,
    transitiveClosure: transitiveClosure,
    vectorLeq: vectorLeq,
    vectorLt: vectorLt
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VectorClockLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
