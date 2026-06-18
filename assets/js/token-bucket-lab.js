(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    token: "#0f766e",
    fixed: "#2563eb",
    shaper: "#7c3aed",
    reject: "#be123c",
    warn: "#b45309",
    arrival: "#475569"
  };

  var DEFAULTS = {
    scenario: "edge",
    rate: 5,
    burst: 8,
    window: 6,
    queue: 18
  };

  var SCENARIOS = {
    edge: {
      label: "window-edge burst",
      note: "requests arrive just before and just after a fixed-window boundary"
    },
    burst: {
      label: "ordinary burst",
      note: "mostly smooth traffic with two short human-scale surges"
    },
    steady: {
      label: "steady client",
      note: "well-paced traffic with small deterministic jitter"
    },
    herd: {
      label: "reset herd",
      note: "many clients synchronize on the same retry/reset moments"
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    return {
      scenario: scenario,
      rate: Math.round(clamp(finite(Number(raw.rate), DEFAULTS.rate), 1, 12)),
      burst: Math.round(clamp(finite(Number(raw.burst), DEFAULTS.burst), 1, 30)),
      window: Math.round(clamp(finite(Number(raw.window), DEFAULTS.window), 2, 15)),
      queue: Math.round(clamp(finite(Number(raw.queue), DEFAULTS.queue), 0, 60))
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    var rounded = Number(value.toFixed(digits == null ? 1 : digits));
    return String(rounded);
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function jitter(index, scale) {
    return ((hash32(index + 1, 0xC0FFEE) / 4294967296) - 0.5) * scale;
  }

  function addCluster(events, at, count, spread, label) {
    var start = count <= 1 ? at : at - spread / 2;
    for (var i = 0; i < count; i += 1) {
      var t = count <= 1 ? at : start + spread * i / Math.max(1, count - 1);
      events.push({
        id: events.length,
        t: Math.max(0, t),
        cost: 1,
        label: label
      });
    }
  }

  function makeArrivals(params) {
    var events = [];
    var horizon = 24;
    var quota = params.rate * params.window;
    var i;
    if (params.scenario === "edge") {
      addCluster(events, params.window - 0.07, Math.min(24, Math.max(6, Math.round(quota * 0.56))), 0.12, "before reset");
      addCluster(events, params.window + 0.07, Math.min(24, Math.max(6, Math.round(quota * 0.56))), 0.12, "after reset");
      addCluster(events, params.window * 2.1, Math.max(4, Math.round(params.rate * 1.2)), 0.5, "later work");
      horizon = Math.max(18, params.window * 3);
    } else if (params.scenario === "burst") {
      for (i = 0; i < 22; i += 1) {
        events.push({ id: events.length, t: 0.55 + i * 0.92 + jitter(i, 0.16), cost: 1, label: "background" });
      }
      addCluster(events, 5.2, Math.max(8, params.burst + 5), 0.9, "checkout burst");
      addCluster(events, 15.4, Math.max(8, params.burst + 3), 0.7, "second burst");
      horizon = 24;
    } else if (params.scenario === "steady") {
      var interval = 1 / Math.max(1, params.rate * 0.78);
      for (i = 0; i < 70; i += 1) {
        events.push({ id: events.length, t: 0.35 + i * interval + jitter(i, 0.08), cost: 1, label: "paced" });
      }
      horizon = Math.max(18, events[events.length - 1].t + 1);
    } else {
      addCluster(events, 0.2, Math.max(8, params.burst), 0.35, "cold start");
      addCluster(events, params.window, Math.max(10, params.burst + 6), 0.22, "retry wave");
      addCluster(events, params.window * 2, Math.max(10, params.burst + 6), 0.22, "retry wave");
      for (i = 0; i < 18; i += 1) {
        events.push({ id: events.length, t: 1.2 + i * 1.1 + jitter(i, 0.14), cost: 1, label: "background" });
      }
      horizon = Math.max(20, params.window * 3 + 1);
    }
    events.sort(function (a, b) {
      return a.t === b.t ? a.id - b.id : a.t - b.t;
    });
    events.forEach(function (event, index) {
      event.id = index;
    });
    return {
      events: events,
      horizon: Math.max(horizon, events.length ? events[events.length - 1].t + 1 : 1),
      quota: quota
    };
  }

  function simulateTokenBucket(events, params) {
    var tokens = params.burst;
    var last = 0;
    var rows = [];
    var accepted = [];
    var rejected = 0;
    var firstRejectWait = null;
    var minTokens = tokens;

    events.forEach(function (event) {
      tokens = Math.min(params.burst, tokens + Math.max(0, event.t - last) * params.rate);
      last = event.t;
      var before = tokens;
      var ok = tokens + 1e-9 >= event.cost;
      var retryAfter = 0;
      if (ok) {
        tokens -= event.cost;
        accepted.push(event.t);
      } else {
        rejected += 1;
        retryAfter = (event.cost - tokens) / params.rate;
        if (firstRejectWait == null) firstRejectWait = retryAfter;
      }
      minTokens = Math.min(minTokens, tokens);
      rows.push({
        id: event.id,
        t: event.t,
        ok: ok,
        tokensBefore: before,
        tokensAfter: tokens,
        retryAfter: retryAfter
      });
    });

    return {
      rows: rows,
      acceptedTimes: accepted,
      accepted: accepted.length,
      rejected: rejected,
      firstRejectWait: firstRejectWait || 0,
      minTokens: minTokens
    };
  }

  function simulateGcra(events, params) {
    var interval = 1 / params.rate;
    var tau = Math.max(0, params.burst - 1) * interval;
    var tat = 0;
    var rows = [];
    var accepted = 0;

    events.forEach(function (event) {
      var allowedAt = tat - tau;
      var ok = event.t + 1e-9 >= allowedAt;
      if (ok) {
        accepted += 1;
        tat = Math.max(event.t, tat) + event.cost * interval;
      }
      rows.push({
        id: event.id,
        t: event.t,
        ok: ok,
        allowedAt: allowedAt,
        tat: tat
      });
    });

    return { rows: rows, accepted: accepted };
  }

  function simulateFixedWindow(events, params) {
    var quota = params.rate * params.window;
    var current = null;
    var count = 0;
    var rows = [];
    var windows = {};
    var accepted = [];
    var rejected = 0;

    events.forEach(function (event) {
      var windowId = Math.floor(event.t / params.window);
      if (windowId !== current) {
        current = windowId;
        count = 0;
      }
      var before = count;
      var ok = count + event.cost <= quota;
      if (ok) {
        count += event.cost;
        accepted.push(event.t);
      } else {
        rejected += 1;
      }
      if (!windows[windowId]) {
        windows[windowId] = { id: windowId, start: windowId * params.window, total: 0, accepted: 0, rejected: 0 };
      }
      windows[windowId].total += 1;
      if (ok) windows[windowId].accepted += 1;
      else windows[windowId].rejected += 1;
      rows.push({
        id: event.id,
        t: event.t,
        ok: ok,
        window: windowId,
        before: before,
        after: count
      });
    });

    return {
      rows: rows,
      acceptedTimes: accepted,
      accepted: accepted.length,
      rejected: rejected,
      windows: Object.keys(windows).map(function (id) { return windows[id]; })
    };
  }

  function simulateShaper(events, params) {
    var interval = 1 / params.rate;
    var queue = [];
    var serverFree = 0;
    var rows = [];
    var accepted = 0;
    var rejected = 0;
    var outputTimes = [];
    var maxDelay = 0;
    var maxQueue = 0;

    events.forEach(function (event) {
      queue = queue.filter(function (time) { return time > event.t + 1e-9; });
      var backlog = queue.length;
      var ok = backlog <= params.queue;
      if (!ok) {
        rejected += 1;
        rows.push({
          id: event.id,
          t: event.t,
          ok: false,
          backlog: backlog,
          start: null,
          delay: null
        });
        return;
      }
      var start = Math.max(event.t, serverFree);
      serverFree = start + event.cost * interval;
      queue.push(serverFree);
      accepted += 1;
      outputTimes.push(start);
      maxDelay = Math.max(maxDelay, start - event.t);
      maxQueue = Math.max(maxQueue, backlog + 1);
      rows.push({
        id: event.id,
        t: event.t,
        ok: true,
        backlog: backlog,
        start: start,
        delay: start - event.t
      });
    });

    return {
      rows: rows,
      outputTimes: outputTimes,
      accepted: accepted,
      rejected: rejected,
      maxDelay: maxDelay,
      maxQueue: maxQueue
    };
  }

  function worstInterval(times, rate, burst) {
    var best = {
      count: 0,
      span: 0,
      limit: burst,
      excess: 0,
      start: 0,
      end: 0
    };
    for (var i = 0; i < times.length; i += 1) {
      for (var j = i; j < times.length; j += 1) {
        var span = Math.max(0, times[j] - times[i]);
        var count = j - i + 1;
        var limit = burst + rate * span;
        var excess = count - limit;
        if (excess > best.excess + 1e-9 || count > best.count && excess > best.excess - 1e-9) {
          best = {
            count: count,
            span: span,
            limit: limit,
            excess: excess,
            start: times[i],
            end: times[j]
          };
        }
      }
    }
    return best;
  }

  function eventsPerSecond(times, horizon) {
    var buckets = [];
    var count = Math.max(1, Math.ceil(horizon));
    for (var i = 0; i < count; i += 1) buckets.push(0);
    times.forEach(function (time) {
      var id = Math.min(count - 1, Math.max(0, Math.floor(time)));
      buckets[id] += 1;
    });
    return buckets;
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var trace = makeArrivals(params);
    var token = simulateTokenBucket(trace.events, params);
    var gcra = simulateGcra(trace.events, params);
    var fixed = simulateFixedWindow(trace.events, params);
    var shaper = simulateShaper(trace.events, params);
    var tokenWorst = worstInterval(token.acceptedTimes, params.rate, params.burst);
    var fixedWorst = worstInterval(fixed.acceptedTimes, params.rate, params.burst);
    var arrivalPeak = Math.max.apply(null, eventsPerSecond(trace.events.map(function (event) { return event.t; }), trace.horizon));
    var tokenPeak = Math.max.apply(null, eventsPerSecond(token.acceptedTimes, trace.horizon));
    var fixedPeak = Math.max.apply(null, eventsPerSecond(fixed.acceptedTimes, trace.horizon));
    var audit = verifyResult({
      params: params,
      trace: trace,
      token: token,
      gcra: gcra,
      fixed: fixed,
      shaper: shaper,
      tokenWorst: tokenWorst,
      fixedWorst: fixedWorst
    });
    return {
      params: params,
      trace: trace,
      token: token,
      gcra: gcra,
      fixed: fixed,
      shaper: shaper,
      tokenWorst: tokenWorst,
      fixedWorst: fixedWorst,
      peaks: {
        arrival: arrivalPeak,
        token: tokenPeak,
        fixed: fixedPeak
      },
      audit: audit
    };
  }

  function auditCheck(name, passed, detail) {
    return {
      detail: detail || "",
      name: name,
      passed: Boolean(passed)
    };
  }

  function verifyResult(state) {
    var checks = [];
    var params = state.params;
    var tokenRows = state.token.rows;
    var gcraRows = state.gcra.rows;
    var eventCount = state.trace.events.length;
    var tokenRowsMatch = tokenRows.length === eventCount;
    var gcraRowsMatch = gcraRows.length === eventCount;
    var gcraAgreement = true;
    var gcraDetail = "";
    var tokenBounds = true;
    var tokenBoundsDetail = "";
    var shaperOrdered = true;
    var shaperDetail = "";
    var fixedWithinQuota = true;
    var fixedDetail = "";

    checks.push(auditCheck(
      "token row count matches arrivals",
      tokenRowsMatch,
      tokenRows.length + " rows for " + eventCount + " arrivals"
    ));
    checks.push(auditCheck(
      "GCRA row count matches arrivals",
      gcraRowsMatch,
      gcraRows.length + " rows for " + eventCount + " arrivals"
    ));
    for (var i = 0; i < tokenRows.length; i += 1) {
      if (gcraRows[i] && tokenRows[i].ok !== gcraRows[i].ok && gcraAgreement) {
        gcraAgreement = false;
        gcraDetail = "request " + i + " token=" + tokenRows[i].ok + " gcra=" + gcraRows[i].ok;
      }
      if (tokenRows[i].tokensAfter < -1e-7 || tokenRows[i].tokensAfter > params.burst + 1e-7) {
        tokenBounds = false;
        if (!tokenBoundsDetail) tokenBoundsDetail = "request " + i + " tokensAfter=" + tokenRows[i].tokensAfter;
      }
    }
    checks.push(auditCheck(
      "token bucket and GCRA agree request-by-request",
      gcraAgreement,
      gcraDetail
    ));
    checks.push(auditCheck(
      "token count stays within bucket capacity",
      tokenBounds,
      tokenBoundsDetail
    ));
    checks.push(auditCheck(
      "accepted token stream respects burst envelope",
      state.tokenWorst.excess <= 1e-7,
      "excess=" + state.tokenWorst.excess
    ));
    for (i = 1; i < state.shaper.outputTimes.length; i += 1) {
      if (state.shaper.outputTimes[i] + 1e-9 < state.shaper.outputTimes[i - 1]) {
        shaperOrdered = false;
        if (!shaperDetail) shaperDetail = "output " + i + " is before output " + (i - 1);
      }
    }
    state.fixed.windows.forEach(function (window) {
      if (window.accepted > params.rate * params.window) {
        fixedWithinQuota = false;
        if (!fixedDetail) fixedDetail = "window " + window.id + " accepted " + window.accepted;
      }
    });
    checks.push(auditCheck(
      "shaper output stays ordered",
      shaperOrdered,
      shaperDetail
    ));
    checks.push(auditCheck(
      "fixed window stays within its own quota",
      fixedWithinQuota,
      fixedDetail
    ));
    var tightEdgeApplies = params.scenario === "edge" && params.burst < params.rate * params.window * 0.8;
    checks.push(auditCheck(
      "tight edge case exposes fixed-window burst excess",
      !tightEdgeApplies || state.fixedWorst.excess > 0,
      tightEdgeApplies ? "excess=" + state.fixedWorst.excess : "not applicable"
    ));
    var issues = checks.filter(function (check) { return !check.passed; }).map(function (check) { return check.name; });
    return {
      checks: checks,
      ok: issues.length === 0,
      issues: issues,
      passedChecks: checks.filter(function (check) { return check.passed; }).length,
      totalChecks: checks.length
    };
  }

  function auditTokenBucketLab() {
    var scenarios = Object.keys(SCENARIOS);
    var cases = [];
    scenarios.forEach(function (scenario) {
      [2, 5, 9].forEach(function (rate) {
        [3, 8, 16].forEach(function (burst) {
          [3, 6, 10].forEach(function (window) {
            [0, 8, 24].forEach(function (queue) {
              var result = evaluate({ scenario: scenario, rate: rate, burst: burst, window: window, queue: queue });
              cases.push({
                arrivals: result.trace.events.length,
                burst: burst,
                checks: result.audit.checks,
                failedChecks: result.audit.issues,
                fixedAccepted: result.fixed.accepted,
                fixedExcess: result.fixedWorst.excess,
                maxDelay: result.shaper.maxDelay,
                passed: result.audit.ok,
                passedChecks: result.audit.passedChecks,
                queue: queue,
                rate: rate,
                scenario: scenario,
                shaperAccepted: result.shaper.accepted,
                tokenAccepted: result.token.accepted,
                tokenExcess: result.tokenWorst.excess,
                totalChecks: result.audit.totalChecks,
                window: window
              });
            });
          });
        });
      });
    });
    var failures = cases.filter(function (row) { return !row.passed; }).map(function (row) {
      return {
        burst: row.burst,
        issues: row.failedChecks,
        queue: row.queue,
        rate: row.rate,
        scenario: row.scenario,
        window: row.window
      };
    });
    var byScenario = scenarios.map(function (scenario) {
      var rows = cases.filter(function (row) { return row.scenario === scenario; });
      return {
        cases: rows.length,
        failedChecks: rows.reduce(function (acc, row) {
          row.failedChecks.forEach(function (name) {
            if (acc.indexOf(name) < 0) acc.push(name);
          });
          return acc;
        }, []),
        maxDelay: rows.reduce(function (max, row) { return Math.max(max, row.maxDelay); }, 0),
        maxFixedExcess: rows.reduce(function (max, row) { return Math.max(max, row.fixedExcess); }, 0),
        maxTokenExcess: rows.reduce(function (max, row) { return Math.max(max, row.tokenExcess); }, 0),
        passed: rows.filter(function (row) { return row.passed; }).length,
        passedChecks: rows.reduce(function (sum, row) { return sum + row.passedChecks; }, 0),
        totalChecks: rows.reduce(function (sum, row) { return sum + row.totalChecks; }, 0),
        scenario: scenario
      };
    });
    var passed = cases.filter(function (row) { return row.passed; }).length;
    var passedChecks = cases.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = cases.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    return {
      byScenario: byScenario,
      cases: cases,
      ok: failures.length === 0,
      checked: cases.length,
      failures: failures,
      passed: passed,
      passedChecks: passedChecks,
      totalChecks: totalChecks,
      total: cases.length
    };
  }

  function setText(root, name, value) {
    var node = root.querySelector('[data-metric="' + name + '"]');
    if (node) node.textContent = value;
  }

  function setCanvasSize(canvas, width, height) {
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ctx;
  }

  function drawText(ctx, text, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || 650) + " " + (options.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
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
    drawText(ctx, title, box.x + 14, box.y + 18, { size: 13, weight: 800 });
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 38, { size: 11, weight: 650, color: COLORS.muted });
  }

  function xScale(time, box, horizon) {
    return box.x + 18 + (box.w - 36) * clamp(time / horizon, 0, 1);
  }

  function drawTimeline(ctx, box, state) {
    panel(ctx, box, "same arrivals, different contracts", "dots are requests; red means rejected, purple is delayed output");
    var horizon = state.trace.horizon;
    var rows = [
      { label: "arrival", y: box.y + 78, color: COLORS.arrival },
      { label: "token", y: box.y + 118, color: COLORS.token },
      { label: "fixed", y: box.y + 158, color: COLORS.fixed },
      { label: "shaper out", y: box.y + 198, color: COLORS.shaper }
    ];
    rows.forEach(function (row) {
      drawText(ctx, row.label, box.x + 14, row.y, { size: 11, color: COLORS.muted, weight: 760 });
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(box.x + 86, row.y);
      ctx.lineTo(box.x + box.w - 18, row.y);
      ctx.stroke();
    });
    for (var t = 0; t <= horizon + 1e-9; t += state.params.window) {
      var x = xScale(t, box, horizon);
      ctx.strokeStyle = t === 0 ? COLORS.rule : "#dbe7f3";
      ctx.setLineDash(t === 0 ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, box.y + 58);
      ctx.lineTo(x, box.y + box.h - 18);
      ctx.stroke();
      ctx.setLineDash([]);
      drawText(ctx, fmt(t, 0) + "s", x, box.y + box.h - 9, { size: 10, color: COLORS.muted, weight: 650, align: "center" });
    }

    state.trace.events.forEach(function (event, i) {
      var x = xScale(event.t, box, horizon);
      ctx.fillStyle = COLORS.arrival;
      ctx.beginPath();
      ctx.arc(x, rows[0].y, 3.2, 0, Math.PI * 2);
      ctx.fill();

      var tokenRow = state.token.rows[i];
      ctx.fillStyle = tokenRow.ok ? COLORS.token : COLORS.reject;
      ctx.beginPath();
      ctx.arc(x, rows[1].y, tokenRow.ok ? 3.4 : 4.4, 0, Math.PI * 2);
      ctx.fill();

      var fixedRow = state.fixed.rows[i];
      ctx.fillStyle = fixedRow.ok ? COLORS.fixed : COLORS.reject;
      ctx.beginPath();
      ctx.arc(x, rows[2].y, fixedRow.ok ? 3.4 : 4.4, 0, Math.PI * 2);
      ctx.fill();

      var shaped = state.shaper.rows[i];
      if (shaped.ok) {
        var sx = xScale(shaped.start, box, horizon);
        if (shaped.delay > 1e-6) {
          ctx.strokeStyle = "rgba(124,58,237,0.35)";
          ctx.beginPath();
          ctx.moveTo(x, rows[3].y - 9);
          ctx.lineTo(sx, rows[3].y - 9);
          ctx.stroke();
        }
        ctx.fillStyle = COLORS.shaper;
        ctx.beginPath();
        ctx.arc(sx, rows[3].y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = COLORS.reject;
        ctx.fillRect(x - 3, rows[3].y - 3, 6, 6);
      }
    });
  }

  function drawBucket(ctx, box, state) {
    panel(ctx, box, "token bucket level", "refill is continuous; spending happens only on accepted arrivals");
    var horizon = state.trace.horizon;
    var plot = { x: box.x + 44, y: box.y + 66, w: box.w - 72, h: box.h - 96 };
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    drawText(ctx, String(state.params.burst), plot.x - 10, plot.y, { size: 10, color: COLORS.muted, align: "right" });
    drawText(ctx, "0", plot.x - 10, plot.y + plot.h, { size: 10, color: COLORS.muted, align: "right" });

    var points = [{ t: 0, tokens: state.params.burst }];
    state.token.rows.forEach(function (row) {
      points.push({ t: row.t, tokens: row.tokensBefore });
      points.push({ t: row.t + 0.0001, tokens: row.tokensAfter });
    });
    points.push({ t: horizon, tokens: Math.min(state.params.burst, state.token.rows.length ? state.token.rows[state.token.rows.length - 1].tokensAfter + (horizon - state.token.rows[state.token.rows.length - 1].t) * state.params.rate : state.params.burst) });

    ctx.strokeStyle = COLORS.token;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(function (p, index) {
      var x = plot.x + plot.w * clamp(p.t / horizon, 0, 1);
      var y = plot.y + plot.h * (1 - clamp(p.tokens / state.params.burst, 0, 1));
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    state.token.rows.forEach(function (row) {
      if (!row.ok) {
        var x = plot.x + plot.w * clamp(row.t / horizon, 0, 1);
        ctx.strokeStyle = COLORS.reject;
        ctx.beginPath();
        ctx.moveTo(x, plot.y);
        ctx.lineTo(x, plot.y + plot.h);
        ctx.stroke();
      }
    });
    drawText(ctx, state.token.rejected + " rejected; first Retry-After " + fmt(state.token.firstRejectWait, 2) + "s", plot.x, box.y + box.h - 18, { size: 11, color: state.token.rejected ? COLORS.reject : COLORS.muted, weight: 760 });
  }

  function drawEnvelope(ctx, box, state) {
    panel(ctx, box, "burst envelope audit", "accepted requests in any interval should fit B + rT");
    var rows = [
      { label: "token bucket", value: state.tokenWorst, color: COLORS.token },
      { label: "fixed window", value: state.fixedWorst, color: COLORS.fixed }
    ];
    rows.forEach(function (row, i) {
      var y = box.y + 74 + i * 74;
      var ratio = row.value.limit <= 0 ? 0 : row.value.count / Math.max(1, row.value.limit);
      drawText(ctx, row.label, box.x + 18, y - 18, { size: 12, weight: 800, color: row.color });
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.roundRect(box.x + 18, y, box.w - 36, 18, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = row.value.excess > 1e-7 ? COLORS.reject : row.color;
      ctx.beginPath();
      ctx.roundRect(box.x + 18, y, Math.min(box.w - 36, (box.w - 36) * Math.min(1.15, ratio)), 18, 9);
      ctx.fill();
      drawText(ctx, row.value.count + " over " + fmt(row.value.span, 2) + "s; limit " + fmt(row.value.limit, 1), box.x + 24, y + 37, { size: 11, color: COLORS.muted });
      if (row.value.excess > 1e-7) {
        drawText(ctx, "+" + fmt(row.value.excess, 1) + " above envelope", box.x + box.w - 20, y + 37, { size: 11, color: COLORS.reject, align: "right", weight: 800 });
      } else {
        drawText(ctx, "inside envelope", box.x + box.w - 20, y + 37, { size: 11, color: COLORS.token, align: "right", weight: 800 });
      }
    });
  }

  function drawWindows(ctx, box, state) {
    panel(ctx, box, "fixed-window ledger", "each bar resets, which creates a seam clients can crowd around");
    var max = Math.max.apply(null, state.fixed.windows.map(function (w) { return Math.max(w.total, state.params.rate * state.params.window); }).concat([1]));
    var plot = { x: box.x + 22, y: box.y + 64, w: box.w - 44, h: box.h - 94 };
    var barW = plot.w / Math.max(1, state.fixed.windows.length);
    state.fixed.windows.forEach(function (w, i) {
      var x = plot.x + i * barW + 6;
      var fullH = plot.h * w.total / max;
      var accH = plot.h * w.accepted / max;
      ctx.fillStyle = "rgba(37,99,235,0.18)";
      ctx.fillRect(x, plot.y + plot.h - fullH, Math.max(4, barW - 12), fullH);
      ctx.fillStyle = COLORS.fixed;
      ctx.fillRect(x, plot.y + plot.h - accH, Math.max(4, barW - 12), accH);
      if (w.rejected) {
        ctx.fillStyle = COLORS.reject;
        ctx.fillRect(x, plot.y + plot.h - fullH, Math.max(4, barW - 12), Math.max(3, fullH - accH));
      }
      drawText(ctx, fmt(w.start, 0) + "s", x + (barW - 12) / 2, plot.y + plot.h + 14, { size: 10, color: COLORS.muted, align: "center" });
      drawText(ctx, String(w.accepted), x + (barW - 12) / 2, plot.y + plot.h - accH - 8, { size: 10, color: COLORS.text, align: "center" });
    });
    drawText(ctx, "quota/window = " + state.trace.quota + " requests", plot.x, box.y + box.h - 16, { size: 11, color: COLORS.muted });
  }

  function draw(canvas, state) {
    var compact = canvas.clientWidth && canvas.clientWidth < 620;
    var width = compact ? 760 : 980;
    var height = compact ? 880 : 760;
    var ctx = setCanvasSize(canvas, width, height);
    ctx.clearRect(0, 0, width, height);
    if (compact) {
      drawTimeline(ctx, { x: 16, y: 16, w: width - 32, h: 250 }, state);
      drawBucket(ctx, { x: 16, y: 286, w: width - 32, h: 190 }, state);
      drawEnvelope(ctx, { x: 16, y: 496, w: width - 32, h: 190 }, state);
      drawWindows(ctx, { x: 16, y: 706, w: width - 32, h: 158 }, state);
    } else {
      drawTimeline(ctx, { x: 18, y: 18, w: 944, h: 250 }, state);
      drawBucket(ctx, { x: 18, y: 292, w: 456, h: 210 }, state);
      drawEnvelope(ctx, { x: 506, y: 292, w: 456, h: 210 }, state);
      drawWindows(ctx, { x: 18, y: 526, w: 944, h: 210 }, state);
    }
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("output[data-value]").forEach(function (output) {
      var name = output.getAttribute("data-value");
      if (name === "scenario") output.textContent = SCENARIOS[params.scenario].label;
      else if (name === "rate") output.textContent = params.rate + "/s";
      else if (name === "burst") output.textContent = params.burst;
      else if (name === "window") output.textContent = params.window + "s";
      else if (name === "queue") output.textContent = params.queue;
    });
  }

  function render(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (control) {
      raw[control.getAttribute("data-param")] = control.value;
    });
    var state = evaluate(raw);
    root.__tokenBucketState = state;
    updateOutputs(root, state.params);
    setText(root, "arrivals", state.trace.events.length);
    setText(root, "token", state.token.accepted + "/" + state.trace.events.length);
    setText(root, "fixed", state.fixed.accepted + "/" + state.trace.events.length);
    setText(root, "shaper", state.shaper.accepted + "/" + state.trace.events.length);
    setText(root, "peak", state.peaks.fixed + "/s");
    setText(root, "delay", fmt(state.shaper.maxDelay, 2) + "s");
    setText(root, "audit", state.audit.ok ? "passes" : "fails");
    var note = root.querySelector("[data-token-note]");
    if (note) note.textContent = SCENARIOS[state.params.scenario].note;
    var canvas = root.querySelector("canvas");
    if (canvas) draw(canvas, state);
  }

  function init(root) {
    if (!root || root.__tokenBucketReady) return;
    root.__tokenBucketReady = true;
    root.querySelectorAll("[data-param]").forEach(function (control) {
      control.addEventListener("input", function () { render(root); });
      control.addEventListener("change", function () { render(root); });
    });
    render(root);
    global.addEventListener("resize", function () { render(root); });
  }

  function mount() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-token-bucket-lab]").forEach(init);
  }

  var api = {
    normalize: normalize,
    makeArrivals: makeArrivals,
    simulateTokenBucket: simulateTokenBucket,
    simulateGcra: simulateGcra,
    simulateFixedWindow: simulateFixedWindow,
    simulateShaper: simulateShaper,
    worstInterval: worstInterval,
    evaluate: evaluate,
    verifyResult: verifyResult,
    auditTokenBucketLab: auditTokenBucketLab
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TokenBucketLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
