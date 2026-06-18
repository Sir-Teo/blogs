(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    rtt: "#2563eb",
    rfc: "#0f766e",
    recent: "#be123c",
    mean: "#b45309",
    purple: "#6d28d9",
    bad: "#be123c",
    good: "#0f766e",
    amber: "#b45309"
  };

  var DEFAULTS = {
    scenario: "route",
    minRto: 1000,
    jitter: 65,
    extraLoss: 0,
    focus: "rfc",
    packets: 64,
    clock: 20,
    initialRto: 1000
  };

  var SCENARIOS = {
    route: {
      label: "route step",
      note: "a path change raises RTT above the old timer, then settles"
    },
    bursty: {
      label: "bursty queue",
      note: "short delay bursts test whether variance enters the timer"
    },
    radio: {
      label: "lossy radio",
      note: "real losses mix with noisy RTT samples"
    }
  };

  var ALGORITHMS = [
    { id: "rfc", label: "RFC 6298 + Karn", color: COLORS.rfc },
    { id: "recent", label: "sample latest send", color: COLORS.recent },
    { id: "mean", label: "mean-only clock", color: COLORS.mean }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var focus = ALGORITHMS.some(function (row) { return row.id === raw.focus; }) ? raw.focus : DEFAULTS.focus;
    return {
      scenario: scenario,
      minRto: Math.round(clamp(finite(Number(raw.minRto), DEFAULTS.minRto), 200, 1600)),
      jitter: Math.round(clamp(finite(Number(raw.jitter), DEFAULTS.jitter), 0, 140)),
      extraLoss: Math.round(clamp(finite(Number(raw.extraLoss), DEFAULTS.extraLoss), 0, 18)),
      focus: focus,
      packets: Math.round(clamp(finite(Number(raw.packets), DEFAULTS.packets), 32, 96)),
      clock: Math.round(clamp(finite(Number(raw.clock), DEFAULTS.clock), 1, 200)),
      initialRto: Math.round(clamp(finite(Number(raw.initialRto), DEFAULTS.initialRto), 200, 3000))
    };
  }

  function noise(index, salt) {
    var x = Math.imul(index + 1, 0x9e3779b1) ^ salt;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return ((x >>> 0) + 0.5) / 4294967297;
  }

  function wave(index, period, phase) {
    return Math.sin((index + phase) * Math.PI * 2 / period);
  }

  function scenarioRtt(index, params) {
    var j = params.jitter / 100;
    var n = noise(index, 0x51a7) - 0.5;
    if (params.scenario === "route") {
      if (index < 18) return 185 + n * 70 * j;
      if (index < 39) return 1430 + n * 210 * j + 30 * wave(index, 7, 1);
      return 270 + n * 90 * j;
    }
    if (params.scenario === "bursty") {
      var base = 235 + 28 * wave(index, 13, 2) + n * 80 * j;
      var inBurst = (index >= 10 && index <= 13) || (index >= 28 && index <= 34) || (index >= 50 && index <= 53);
      return inBurst ? base + 760 + 180 * wave(index, 5, 0) : base;
    }
    var slow = 420 + n * 300 * j + 55 * wave(index, 11, 3);
    var fade = (index >= 20 && index <= 25) || (index >= 45 && index <= 49);
    return fade ? slow + 360 : slow;
  }

  function builtinLoss(index, scenario) {
    if (scenario !== "radio") return false;
    return index === 8 || index === 21 || index === 36 || index === 51 || index === 58;
  }

  function makeTrace(params) {
    var trace = [];
    for (var i = 0; i < params.packets; i += 1) {
      var randomLoss = params.extraLoss > 0 && noise(i, 0xBADC0DE) < params.extraLoss / 100;
      var rtt = Math.max(20, scenarioRtt(i, params));
      var retryRtt = Math.max(20, scenarioRtt(i + 1, params) * (0.88 + 0.24 * noise(i, 0xC0FFEE)));
      trace.push({
        index: i,
        rtt: rtt,
        retryRtt: retryRtt,
        lost: builtinLoss(i, params.scenario) || randomLoss
      });
    }
    return trace;
  }

  function roundMs(value) {
    return Math.round(value * 10) / 10;
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var at = (sorted.length - 1) * p;
    var lo = Math.floor(at);
    var hi = Math.ceil(at);
    var t = at - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  function makeState(id, params) {
    return {
      id: id,
      srtt: null,
      rttvar: null,
      rto: Math.max(params.minRto, params.initialRto),
      elapsed: 0,
      rows: [],
      samples: [],
      ignored: 0,
      ambiguousAccepted: 0,
      spurious: 0,
      needed: 0,
      clean: 0,
      retransmissions: 0
    };
  }

  function recomputeRfcRto(state, sample, params) {
    var alpha = 1 / 8;
    var beta = 1 / 4;
    if (state.srtt == null) {
      state.srtt = sample;
      state.rttvar = sample / 2;
    } else {
      var oldSrtt = state.srtt;
      state.rttvar = (1 - beta) * state.rttvar + beta * Math.abs(oldSrtt - sample);
      state.srtt = (1 - alpha) * state.srtt + alpha * sample;
    }
    state.rto = Math.max(params.minRto, state.srtt + Math.max(params.clock, 4 * state.rttvar));
  }

  function recomputeMeanRto(state, sample, params) {
    var alpha = 1 / 8;
    if (state.srtt == null) state.srtt = sample;
    else state.srtt = (1 - alpha) * state.srtt + alpha * sample;
    state.rttvar = null;
    state.rto = Math.max(params.minRto, 2 * state.srtt);
  }

  function applySample(state, sample, params) {
    if (state.id === "mean") recomputeMeanRto(state, sample, params);
    else recomputeRfcRto(state, sample, params);
  }

  function simulateAlgorithm(id, trace, params) {
    var state = makeState(id, params);
    for (var i = 0; i < trace.length; i += 1) {
      var item = trace[i];
      var beforeRto = state.rto;
      var timedOut = item.lost || item.rtt > beforeRto;
      var kind = "clean";
      var ackDelay = item.rtt;
      var sample = item.rtt;
      var usedSample = true;
      var ambiguous = false;
      var timeoutAt = null;

      if (timedOut) {
        state.retransmissions += 1;
        timeoutAt = beforeRto;
        state.rto = Math.min(60000, Math.max(params.minRto, beforeRto * 2));
        if (item.lost) {
          kind = "needed";
          state.needed += 1;
          ackDelay = beforeRto + item.retryRtt;
        } else {
          kind = "spurious";
          state.spurious += 1;
          ackDelay = item.rtt;
        }
        ambiguous = true;

        if (id === "rfc") {
          usedSample = false;
          sample = null;
          state.ignored += 1;
        } else if (id === "recent") {
          sample = Math.max(1, ackDelay - beforeRto);
          state.ambiguousAccepted += 1;
        } else {
          sample = ackDelay;
          state.ambiguousAccepted += 1;
        }
      } else {
        state.clean += 1;
      }

      if (usedSample) {
        applySample(state, sample, params);
        state.samples.push(sample);
      }

      state.elapsed += ackDelay;
      state.rows.push({
        index: item.index,
        trueRtt: item.rtt,
        retryRtt: item.retryRtt,
        lost: item.lost,
        kind: kind,
        timeoutAt: timeoutAt,
        rtoBefore: beforeRto,
        rtoAfter: state.rto,
        srtt: state.srtt,
        rttvar: state.rttvar,
        ackDelay: ackDelay,
        sample: sample,
        usedSample: usedSample,
        ambiguous: ambiguous
      });
    }

    var rtos = state.rows.map(function (row) { return row.rtoBefore; });
    var margins = state.rows
      .filter(function (row) { return !row.lost; })
      .map(function (row) { return row.rtoBefore - row.trueRtt; });
    state.summary = {
      elapsed: state.elapsed,
      retransmissions: state.retransmissions,
      spurious: state.spurious,
      needed: state.needed,
      clean: state.clean,
      ignored: state.ignored,
      ambiguousAccepted: state.ambiguousAccepted,
      finalRto: state.rto,
      finalSrtt: state.srtt == null ? 0 : state.srtt,
      finalRttvar: state.rttvar == null ? 0 : state.rttvar,
      medianRto: percentile(rtos, 0.5),
      p95Rto: percentile(rtos, 0.95),
      minMargin: margins.length ? Math.min.apply(null, margins) : 0
    };
    return state;
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var trace = makeTrace(params);
    var algorithms = {};
    ALGORITHMS.forEach(function (algorithm) {
      algorithms[algorithm.id] = simulateAlgorithm(algorithm.id, trace, params);
    });
    var audit = auditResult(params, trace, algorithms);
    return {
      params: params,
      trace: trace,
      algorithms: algorithms,
      audit: audit
    };
  }

  function auditResult(params, trace, algorithms) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    ALGORITHMS.forEach(function (algorithm) {
      var run = algorithms[algorithm.id];
      check(algorithm.id + " row count", run.rows.length === trace.length);
      check(algorithm.id + " finite elapsed", Number.isFinite(run.summary.elapsed) && run.summary.elapsed > 0);
      check(algorithm.id + " finite RTO", Number.isFinite(run.summary.finalRto) && run.summary.finalRto >= params.minRto);
      check(algorithm.id + " event accounting", run.summary.clean + run.summary.spurious + run.summary.needed === trace.length);
      check(algorithm.id + " retransmission accounting", run.summary.spurious + run.summary.needed === run.summary.retransmissions);
    });
    check("RFC ignores ambiguous samples", algorithms.rfc.summary.ignored === algorithms.rfc.summary.retransmissions);
    check("recent sampler accepts ambiguous samples", algorithms.recent.summary.ambiguousAccepted === algorithms.recent.summary.retransmissions);
    check("mean-only accepts ambiguous samples", algorithms.mean.summary.ambiguousAccepted === algorithms.mean.summary.retransmissions);
    if (params.scenario === "route" && params.minRto <= 1000) {
      check("route step punishes recent sampler", algorithms.recent.summary.spurious >= algorithms.rfc.summary.spurious);
    }
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function auditGrid() {
    var cases = [
      { scenario: "route", minRto: 1000, jitter: 65, extraLoss: 0 },
      { scenario: "route", minRto: 500, jitter: 70, extraLoss: 0 },
      { scenario: "bursty", minRto: 600, jitter: 85, extraLoss: 0 },
      { scenario: "radio", minRto: 1000, jitter: 90, extraLoss: 0 },
      { scenario: "radio", minRto: 700, jitter: 110, extraLoss: 6 }
    ];
    var rows = cases.map(function (params) {
      var result = evaluate(params);
      return {
        failedChecks: result.audit.checks.filter(function (row) {
          return !row.ok;
        }).map(function (row) {
          return row.name;
        }),
        meanAmbiguousAccepted: result.algorithms.mean.summary.ambiguousAccepted,
        params: result.params,
        meanSpurious: result.algorithms.mean.summary.spurious,
        passed: result.audit.passed,
        recentAmbiguousAccepted: result.algorithms.recent.summary.ambiguousAccepted,
        recentSpurious: result.algorithms.recent.summary.spurious,
        rfcIgnored: result.algorithms.rfc.summary.ignored,
        rfcSpurious: result.algorithms.rfc.summary.spurious
      };
    });
    return {
      cases: rows,
      passed: rows.filter(function (row) { return row.passed; }).length,
      total: rows.length
    };
  }

  function fmt(value, digits) {
    return roundMs(value).toLocaleString(undefined, {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0
    });
  }

  function fmtMs(value) {
    return fmt(value, value < 100 ? 1 : 0) + " ms";
  }

  function algorithmMeta(id) {
    for (var i = 0; i < ALGORITHMS.length; i += 1) if (ALGORITHMS[i].id === id) return ALGORITHMS[i];
    return ALGORITHMS[0];
  }

  function metric(label, value, className) {
    return '<div class="rto-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, box.x + 14, box.y + 18, COLORS.text, 12, 800);
    if (subtitle) label(ctx, subtitle, box.x + 14, box.y + 38, COLORS.muted, 10, 600);
  }

  function plotBox(box) {
    return { x: box.x + 48, y: box.y + 54, w: box.w - 66, h: box.h - 82 };
  }

  function drawGrid(ctx, plot, maxY, ticks) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= ticks; i += 1) {
      var y = plot.y + plot.h - i * plot.h / ticks;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, fmtMs(maxY * i / ticks), plot.x - 8, y, COLORS.muted, 9, 600, "right");
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
  }

  function path(ctx, points, xScale, yScale, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xScale(point.x);
      var y = yScale(point.y);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawRtoPanel(ctx, result, box) {
    panel(ctx, box, "timer tracks a moving path", SCENARIOS[result.params.scenario].note);
    var plot = plotBox(box);
    var maxRtt = Math.max.apply(null, result.trace.map(function (row) { return row.rtt; }));
    var maxRto = Math.max.apply(null, ALGORITHMS.map(function (algorithm) {
      return Math.max.apply(null, result.algorithms[algorithm.id].rows.map(function (row) { return row.rtoBefore; }));
    }));
    var maxY = Math.max(result.params.minRto, maxRtt, maxRto) * 1.08;
    var xScale = function (x) { return plot.x + x / Math.max(1, result.trace.length - 1) * plot.w; };
    var yScale = function (y) { return plot.y + plot.h - y / maxY * plot.h; };
    drawGrid(ctx, plot, maxY, 4);
    path(ctx, result.trace.map(function (row) { return { x: row.index, y: row.rtt }; }), xScale, yScale, COLORS.rtt, 2.5);
    ALGORITHMS.forEach(function (algorithm) {
      path(ctx, result.algorithms[algorithm.id].rows.map(function (row) {
        return { x: row.index, y: row.rtoBefore };
      }), xScale, yScale, algorithm.color, algorithm.id === result.params.focus ? 2.8 : 1.5);
    });
    var legendX = plot.x + 8;
    [
      ["true RTT", COLORS.rtt],
      ["RFC/Karn RTO", COLORS.rfc],
      ["latest-send RTO", COLORS.recent],
      ["mean-only RTO", COLORS.mean]
    ].forEach(function (item, i) {
      ctx.fillStyle = item[1];
      ctx.fillRect(legendX + i * 124, box.y + box.h - 22, 12, 3);
      label(ctx, item[0], legendX + 18 + i * 124, box.y + box.h - 20, COLORS.muted, 9, 650);
    });
  }

  function drawEventPanel(ctx, result, box) {
    var focus = result.algorithms[result.params.focus];
    panel(ctx, box, "packet ledger", algorithmMeta(result.params.focus).label + ": clean ACKs, spurious timers, and real loss");
    var left = box.x + 22;
    var top = box.y + 56;
    var cellW = (box.w - 44) / focus.rows.length;
    var h = 34;
    focus.rows.forEach(function (row, i) {
      var x = left + i * cellW;
      var color = row.kind === "clean" ? COLORS.good : (row.kind === "needed" ? COLORS.purple : COLORS.bad);
      ctx.fillStyle = color;
      ctx.globalAlpha = row.kind === "clean" ? 0.42 : 0.9;
      ctx.fillRect(x, top, Math.max(1, cellW - 1), h);
      ctx.globalAlpha = 1;
      if (row.ambiguous) {
        ctx.fillStyle = row.usedSample ? COLORS.amber : COLORS.text;
        ctx.fillRect(x, top + h + 5, Math.max(1, cellW - 1), 8);
      }
    });
    label(ctx, "top row: packet outcome", left, top - 18, COLORS.muted, 10, 650);
    label(ctx, "bottom tick: ambiguous ACK accepted or ignored", left, top + h + 28, COLORS.muted, 10, 650);

    var rows = focus.rows.filter(function (row) { return row.kind !== "clean"; }).slice(0, 7);
    var y = top + 94;
    if (!rows.length) {
      label(ctx, "No retransmission timer fired in this run.", left, y, COLORS.muted, 11, 650);
    } else {
      rows.forEach(function (row, index) {
        var text = "#" + (row.index + 1) + " " + row.kind + ": RTO " + fmtMs(row.rtoBefore) +
          ", RTT " + fmtMs(row.trueRtt) +
          (row.usedSample ? ", sampled " + fmtMs(row.sample) : ", sample ignored");
        label(ctx, text, left, y + index * 20, row.kind === "spurious" ? COLORS.bad : COLORS.purple, 10, 700);
      });
    }
  }

  function drawSummaryPanel(ctx, result, box) {
    panel(ctx, box, "estimator audit", "accepting the wrong samples changes the failure mode");
    var left = box.x + 24;
    var top = box.y + 58;
    var rowH = 44;
    var maxRetrans = Math.max.apply(null, ALGORITHMS.map(function (algorithm) {
      return result.algorithms[algorithm.id].summary.retransmissions;
    }).concat([1]));
    ALGORITHMS.forEach(function (algorithm, i) {
      var summary = result.algorithms[algorithm.id].summary;
      var y = top + i * rowH;
      label(ctx, algorithm.label, left, y, algorithm.color, 11, 800);
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(left + 132, y - 8, box.w - 170, 14);
      ctx.fillStyle = algorithm.color;
      ctx.fillRect(left + 132, y - 8, (box.w - 170) * summary.retransmissions / maxRetrans, 14);
      label(ctx, summary.retransmissions + " retransmits, " + summary.spurious + " spurious, " + summary.ambiguousAccepted + " ambiguous accepted", left + 138, y + 24, COLORS.muted, 9, 650);
    });
    var rfc = result.algorithms.rfc.summary;
    var recent = result.algorithms.recent.summary;
    var y0 = box.y + box.h - 68;
    label(ctx, "RFC/Karn final RTO: " + fmtMs(rfc.finalRto) + " with " + rfc.ignored + " ambiguous samples ignored", left, y0, COLORS.rfc, 11, 800);
    label(ctx, "Latest-send sampler final RTO: " + fmtMs(recent.finalRto) + " after accepting " + recent.ambiguousAccepted + " ambiguous samples", left, y0 + 22, COLORS.recent, 11, 800);
  }

  function drawFormulaPanel(ctx, result, box) {
    panel(ctx, box, "the clock is a guarded estimate", "mean plus variation, with backoff when evidence is ambiguous");
    var x = box.x + 22;
    var y = box.y + 62;
    var lines = [
      "RTTVAR <- 3/4*RTTVAR + 1/4*|SRTT - R'|",
      "SRTT   <- 7/8*SRTT   + 1/8*R'",
      "RTO    <- SRTT + max(G, 4*RTTVAR)",
      "timeout -> retransmit, then RTO <- 2*RTO",
      "Karn: do not sample ACKs for retransmitted segments"
    ];
    lines.forEach(function (line, index) {
      label(ctx, line, x, y + index * 24, index === 4 ? COLORS.rfc : COLORS.text, 12, index === 4 ? 800 : 650);
    });
    var audit = result.audit.passed ? "audit passed" : "audit failed";
    label(ctx, audit + " across " + result.audit.checks.length + " invariants", x, box.y + box.h - 28, result.audit.passed ? COLORS.good : COLORS.bad, 11, 800);
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    var gap = 14;
    var topH = 330;
    var colW = (width - gap * 3) / 2;
    drawRtoPanel(ctx, result, { x: gap, y: gap, w: width - 2 * gap, h: topH });
    drawEventPanel(ctx, result, { x: gap, y: topH + gap * 2, w: colW, h: height - topH - gap * 3 });
    drawSummaryPanel(ctx, result, { x: gap * 2 + colW, y: topH + gap * 2, w: colW, h: 200 });
    drawFormulaPanel(ctx, result, { x: gap * 2 + colW, y: topH + gap * 2 + 214, w: colW, h: height - topH - gap * 3 - 214 });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return normalize(raw);
  }

  function setOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      var value = params[key];
      if (key === "minRto" || key === "initialRto" || key === "clock") value = value + " ms";
      if (key === "jitter" || key === "extraLoss") value = value + "%";
      if (key === "scenario") value = SCENARIOS[params.scenario].label;
      if (key === "focus") value = algorithmMeta(params.focus).label;
      output.textContent = value;
    });
  }

  function render(root) {
    var params = readParams(root);
    setOutputs(root, params);
    var result = evaluate(params);
    var metrics = root.querySelector("[data-metrics]");
    var rfc = result.algorithms.rfc.summary;
    var recent = result.algorithms.recent.summary;
    var mean = result.algorithms.mean.summary;
    if (metrics) {
      metrics.innerHTML = [
        metric("RFC spurious", String(rfc.spurious), rfc.spurious <= recent.spurious ? "rto-lab__metric--good" : ""),
        metric("Latest-send spurious", String(recent.spurious), recent.spurious > rfc.spurious ? "rto-lab__metric--bad" : ""),
        metric("Mean-only spurious", String(mean.spurious)),
        metric("Ambiguous ignored", String(rfc.ignored), "rto-lab__metric--good"),
        metric("RFC final RTO", fmtMs(rfc.finalRto)),
        metric("Audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "rto-lab__metric--good" : "rto-lab__metric--bad")
      ].join("");
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__rtoResult = result;
  }

  function init(root) {
    if (!root || root.__rtoReady) return;
    root.__rtoReady = true;
    var timer = null;
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(root); }, 40);
      });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-rto-estimator-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-rto-estimator-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    normalize: normalize,
    makeTrace: makeTrace,
    algorithms: ALGORITHMS
  };

  global.RtoEstimatorLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
