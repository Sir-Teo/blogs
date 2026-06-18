(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    fresh: "#0f766e",
    validator: "#2563eb",
    swr: "#7c3aed",
    origin: "#b45309",
    stale: "#be123c",
    miss: "#475569"
  };

  var BODY_BYTES = 40000;
  var HEADER_BYTES = 700;

  var DEFAULTS = {
    scenario: "release",
    maxAge: 6,
    swr: 8,
    latency: 420,
    cadence: 1.1
  };

  var SCENARIOS = {
    release: {
      label: "release flip",
      note: "the origin changes twice while clients keep asking for the same URL"
    },
    newsroom: {
      label: "newsroom spike",
      note: "traffic clusters around edits, where one blocking revalidation can fan out"
    },
    outage: {
      label: "origin stumble",
      note: "a short origin failure shows the difference between freshness and availability"
    },
    quiet: {
      label: "quiet docs",
      note: "sparse traffic means stale-while-revalidate may not get a trigger in time"
    }
  };

  var POLICIES = [
    { id: "always", label: "always fetch", color: COLORS.miss },
    { id: "ttl", label: "expiry only", color: COLORS.origin },
    { id: "validator", label: "ETag validate", color: COLORS.validator },
    { id: "swr", label: "stale-while-revalidate", color: COLORS.swr }
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
    return {
      scenario: scenario,
      maxAge: Math.round(clamp(finite(Number(raw.maxAge), DEFAULTS.maxAge), 1, 20)),
      swr: Math.round(clamp(finite(Number(raw.swr), DEFAULTS.swr), 0, 30)),
      latency: Math.round(clamp(finite(Number(raw.latency), DEFAULTS.latency), 80, 1200)),
      cadence: clamp(finite(Number(raw.cadence), DEFAULTS.cadence), 0.45, 3)
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return String(Number(value.toFixed(digits == null ? 1 : digits)));
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
    return ((hash32(index + 1, 0x51A7) / 4294967296) - 0.5) * scale;
  }

  function scenarioConfig(name) {
    if (name === "newsroom") {
      return {
        horizon: 28,
        changes: [0, 7.2, 11.7, 20.2],
        failures: []
      };
    }
    if (name === "outage") {
      return {
        horizon: 30,
        changes: [0, 8.5, 22.0],
        failures: [{ start: 12.8, end: 17.4 }]
      };
    }
    if (name === "quiet") {
      return {
        horizon: 42,
        changes: [0, 16.0, 33.0],
        failures: []
      };
    }
    return {
      horizon: 28,
      changes: [0, 9.0, 19.0],
      failures: []
    };
  }

  function versionAt(config, t) {
    var version = 0;
    for (var i = 0; i < config.changes.length; i += 1) {
      if (t + 1e-9 >= config.changes[i]) version = i;
    }
    return {
      version: version,
      etag: '"v' + version + '"',
      modified: config.changes[version]
    };
  }

  function isOriginDown(config, t) {
    return config.failures.some(function (row) {
      return t >= row.start && t < row.end;
    });
  }

  function addCluster(events, at, count, spread, label) {
    var start = count <= 1 ? at : at - spread / 2;
    for (var i = 0; i < count; i += 1) {
      events.push({
        t: Math.max(0, count <= 1 ? at : start + spread * i / Math.max(1, count - 1)),
        label: label
      });
    }
  }

  function makeRequests(params, config) {
    var events = [];
    var i;
    if (params.scenario === "newsroom") {
      for (i = 0; i < 18; i += 1) events.push({ t: 0.7 + i * 1.35 + jitter(i, 0.18), label: "background" });
      addCluster(events, 7.4, 9, 0.7, "edit spike");
      addCluster(events, 11.9, 8, 0.7, "edit spike");
      addCluster(events, 20.6, 7, 0.7, "edit spike");
    } else if (params.scenario === "outage") {
      for (i = 0; i < 28; i += 1) events.push({ t: 0.6 + i * params.cadence + jitter(i, 0.16), label: "client" });
      addCluster(events, 14.5, 6, 1.0, "during outage");
    } else if (params.scenario === "quiet") {
      for (i = 0; i < 16; i += 1) events.push({ t: 0.8 + i * 2.6 + jitter(i, 0.28), label: "reader" });
    } else {
      for (i = 0; i < 26; i += 1) events.push({ t: 0.5 + i * params.cadence + jitter(i, 0.14), label: "reader" });
      addCluster(events, 9.2, 5, 0.55, "after deploy");
      addCluster(events, 19.4, 5, 0.55, "after deploy");
    }
    events = events.filter(function (event) { return event.t <= config.horizon; });
    events.sort(function (a, b) { return a.t === b.t ? a.label.localeCompare(b.label) : a.t - b.t; });
    events.forEach(function (event, index) { event.id = index; });
    return events;
  }

  function originFetch(config, sendTime, validator) {
    var state = versionAt(config, sendTime);
    if (isOriginDown(config, sendTime)) {
      return {
        status: 503,
        bytes: HEADER_BYTES,
        version: null,
        etag: validator || null,
        modified: null
      };
    }
    if (validator && validator === state.etag) {
      return {
        status: 304,
        bytes: HEADER_BYTES,
        version: state.version,
        etag: state.etag,
        modified: state.modified
      };
    }
    return {
      status: 200,
      bytes: BODY_BYTES + HEADER_BYTES,
      version: state.version,
      etag: state.etag,
      modified: state.modified
    };
  }

  function cloneEntry(entry) {
    return entry ? {
      version: entry.version,
      etag: entry.etag,
      modified: entry.modified,
      storedAt: entry.storedAt
    } : null;
  }

  function storeFrom(response, at) {
    return {
      version: response.version,
      etag: response.etag,
      modified: response.modified,
      storedAt: at
    };
  }

  function summarize(rows, originCalls, bytes) {
    var okRows = rows.filter(function (row) { return !row.error; });
    var waits = okRows.map(function (row) { return row.wait; });
    var maxWait = waits.length ? Math.max.apply(null, waits) : 0;
    var blocking = waits.reduce(function (sum, value) { return sum + value; }, 0);
    return {
      responses: rows.length,
      originCalls: originCalls.length,
      bytes: bytes,
      full: originCalls.filter(function (call) { return call.status === 200; }).length,
      notModified: originCalls.filter(function (call) { return call.status === 304; }).length,
      errors: rows.filter(function (row) { return row.error; }).length,
      staleServed: rows.filter(function (row) { return row.stale; }).length,
      blocking: blocking,
      maxWait: maxWait,
      avgWait: rows.length ? blocking / rows.length : 0
    };
  }

  function simulateAlways(requests, params, config) {
    var latency = params.latency / 1000;
    var rows = [];
    var originCalls = [];
    var bytes = 0;
    requests.forEach(function (request) {
      var response = originFetch(config, request.t + latency, null);
      originCalls.push({ t: request.t, done: request.t + latency, status: response.status, validator: null });
      bytes += response.bytes;
      rows.push({
        id: request.id,
        t: request.t,
        action: response.status === 200 ? "fetch 200" : "origin error",
        status: response.status,
        wait: latency,
        version: response.version,
        stale: false,
        error: response.status >= 500
      });
    });
    return {
      id: "always",
      rows: rows,
      originCalls: originCalls,
      summary: summarize(rows, originCalls, bytes)
    };
  }

  function simulateTtl(requests, params, config) {
    var latency = params.latency / 1000;
    var entry = null;
    var rows = [];
    var originCalls = [];
    var bytes = 0;
    requests.forEach(function (request) {
      if (entry && request.t - entry.storedAt <= params.maxAge + 1e-9) {
        var actual = versionAt(config, request.t);
        rows.push({
          id: request.id,
          t: request.t,
          action: "fresh hit",
          status: 200,
          wait: 0,
          version: entry.version,
          stale: entry.version !== actual.version,
          error: false
        });
        return;
      }
      var response = originFetch(config, request.t + latency, null);
      originCalls.push({ t: request.t, done: request.t + latency, status: response.status, validator: null });
      bytes += response.bytes;
      if (response.status === 200) entry = storeFrom(response, request.t + latency);
      rows.push({
        id: request.id,
        t: request.t,
        action: response.status === 200 ? "expired fetch" : "origin error",
        status: response.status,
        wait: latency,
        version: response.version,
        stale: false,
        error: response.status >= 500
      });
    });
    return {
      id: "ttl",
      rows: rows,
      originCalls: originCalls,
      summary: summarize(rows, originCalls, bytes)
    };
  }

  function simulateValidator(requests, params, config) {
    var latency = params.latency / 1000;
    var entry = null;
    var rows = [];
    var originCalls = [];
    var bytes = 0;
    requests.forEach(function (request) {
      if (entry && request.t - entry.storedAt <= params.maxAge + 1e-9) {
        var actual = versionAt(config, request.t);
        rows.push({
          id: request.id,
          t: request.t,
          action: "fresh hit",
          status: 200,
          wait: 0,
          version: entry.version,
          stale: entry.version !== actual.version,
          error: false
        });
        return;
      }
      var validator = entry ? entry.etag : null;
      var response = originFetch(config, request.t + latency, validator);
      originCalls.push({ t: request.t, done: request.t + latency, status: response.status, validator: validator });
      bytes += response.bytes;
      if (response.status === 304 && entry) {
        entry.storedAt = request.t + latency;
      } else if (response.status === 200) {
        entry = storeFrom(response, request.t + latency);
      }
      rows.push({
        id: request.id,
        t: request.t,
        action: response.status === 304 ? "validate 304" : response.status === 200 ? "validate 200" : "origin error",
        status: response.status === 304 ? 200 : response.status,
        originStatus: response.status,
        wait: latency,
        version: entry ? entry.version : null,
        stale: false,
        error: response.status >= 500
      });
    });
    return {
      id: "validator",
      rows: rows,
      originCalls: originCalls,
      summary: summarize(rows, originCalls, bytes)
    };
  }

  function finishRevalidation(config, pending, entry) {
    if (!pending) return { entry: entry, call: null };
    var response = originFetch(config, pending.done, pending.validator);
    if (response.status === 304 && entry) {
      entry = cloneEntry(entry);
      entry.storedAt = pending.done;
    } else if (response.status === 200) {
      entry = storeFrom(response, pending.done);
    }
    return {
      entry: entry,
      call: {
        t: pending.t,
        done: pending.done,
        status: response.status,
        validator: pending.validator,
        background: true,
        bytes: response.bytes
      }
    };
  }

  function simulateSwr(requests, params, config) {
    var latency = params.latency / 1000;
    var entry = null;
    var pending = null;
    var rows = [];
    var originCalls = [];
    var bytes = 0;

    function flush(now) {
      if (pending && pending.done <= now + 1e-9) {
        var finished = finishRevalidation(config, pending, entry);
        entry = finished.entry;
        if (finished.call) {
          originCalls.push(finished.call);
          bytes += finished.call.bytes;
        }
        pending = null;
      }
    }

    requests.forEach(function (request) {
      flush(request.t);
      if (!entry) {
        var first = originFetch(config, request.t + latency, null);
        originCalls.push({ t: request.t, done: request.t + latency, status: first.status, validator: null });
        bytes += first.bytes;
        if (first.status === 200) entry = storeFrom(first, request.t + latency);
        rows.push({
          id: request.id,
          t: request.t,
          action: first.status === 200 ? "cold fetch" : "origin error",
          status: first.status,
          wait: latency,
          version: first.version,
          stale: false,
          error: first.status >= 500
        });
        return;
      }

      var age = request.t - entry.storedAt;
      if (age <= params.maxAge + 1e-9) {
        var actual = versionAt(config, request.t);
        rows.push({
          id: request.id,
          t: request.t,
          action: "fresh hit",
          status: 200,
          wait: 0,
          version: entry.version,
          stale: entry.version !== actual.version,
          error: false
        });
        return;
      }

      if (age <= params.maxAge + params.swr + 1e-9) {
        if (!pending) {
          pending = {
            t: request.t,
            done: request.t + latency,
            validator: entry.etag
          };
        }
        rows.push({
          id: request.id,
          t: request.t,
          action: "serve stale + revalidate",
          status: 200,
          wait: 0,
          version: entry.version,
          stale: true,
          error: false,
          withinSwr: true
        });
        return;
      }

      var response = originFetch(config, request.t + latency, entry.etag);
      originCalls.push({ t: request.t, done: request.t + latency, status: response.status, validator: entry.etag });
      bytes += response.bytes;
      if (response.status === 304) {
        entry.storedAt = request.t + latency;
      } else if (response.status === 200) {
        entry = storeFrom(response, request.t + latency);
      }
      rows.push({
        id: request.id,
        t: request.t,
        action: response.status === 304 ? "blocking 304" : response.status === 200 ? "blocking 200" : "origin error",
        status: response.status === 304 ? 200 : response.status,
        originStatus: response.status,
        wait: latency,
        version: entry ? entry.version : null,
        stale: false,
        error: response.status >= 500
      });
    });
    flush(Infinity);
    return {
      id: "swr",
      rows: rows,
      originCalls: originCalls,
      summary: summarize(rows, originCalls, bytes)
    };
  }

  function runPolicy(id, requests, params, config) {
    if (id === "always") return simulateAlways(requests, params, config);
    if (id === "ttl") return simulateTtl(requests, params, config);
    if (id === "validator") return simulateValidator(requests, params, config);
    return simulateSwr(requests, params, config);
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var config = scenarioConfig(params.scenario);
    var requests = makeRequests(params, config);
    var policies = {};
    POLICIES.forEach(function (policy) {
      policies[policy.id] = runPolicy(policy.id, requests, params, config);
    });
    var audit = verifyResult({ params: params, config: config, requests: requests, policies: policies });
    return {
      params: params,
      config: config,
      requests: requests,
      policies: policies,
      audit: audit
    };
  }

  function verifyResult(state) {
    var checks = [];
    var params = state.params;
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var responseCountsMatch = Object.keys(state.policies).every(function (id) {
      var policy = state.policies[id];
      return policy.rows.length === state.requests.length;
    });
    var responseRowsValid = Object.keys(state.policies).every(function (id) {
      return state.policies[id].rows.every(function (row) {
        return row.wait >= -1e-9 && (row.status !== 200 || row.version != null);
      });
    });
    var notModifiedValidatorsMatch = Object.keys(state.policies).every(function (id) {
      return state.policies[id].originCalls.every(function (call) {
        if (call.status !== 304) return true;
        if (!call.validator) return false;
        return call.validator === versionAt(state.config, call.done).etag;
      });
    });
    var validator = state.policies.validator;
    var ttl = state.policies.ttl;
    var swrStaleInsideWindow = state.policies.swr.rows.every(function (row) {
      return row.action !== "serve stale + revalidate" || row.withinSwr;
    });
    var swrWaitBound = params.swr === 0 || state.policies.swr.summary.maxWait <= state.policies.validator.summary.maxWait + 1e-9;
    check("each policy returns one response per request", responseCountsMatch);
    check("response rows have valid waits and versions", responseRowsValid);
    check("304 responses carry matching current validators", notModifiedValidatorsMatch);
    check("validator byte count never exceeds expiry-only cache", validator.summary.bytes <= ttl.summary.bytes + 1e-9);
    check("SWR stale responses stay inside the SWR window", swrStaleInsideWindow);
    check("SWR never increases max blocking wait", swrWaitBound);
    var issues = checks.filter(function (row) { return !row.ok; }).map(function (row) { return row.name; });
    return {
      checks: checks,
      ok: issues.length === 0,
      issues: issues
    };
  }

  function auditHttpCacheLab() {
    var cases = [];
    Object.keys(SCENARIOS).forEach(function (scenario) {
      [2, 6, 12].forEach(function (maxAge) {
        [0, 6, 14].forEach(function (swr) {
          [120, 420, 900].forEach(function (latency) {
            var result = evaluate({ scenario: scenario, maxAge: maxAge, swr: swr, latency: latency, cadence: DEFAULTS.cadence });
            var failedChecks = result.audit.checks.filter(function (row) { return !row.ok; }).map(function (row) { return row.name; });
            cases.push({
              blockingSaved: result.policies.validator.summary.blocking - result.policies.swr.summary.blocking,
              failedChecks: failedChecks,
              latency: latency,
              maxAge: maxAge,
              passed: result.audit.ok,
              passedChecks: result.audit.checks.length - failedChecks.length,
              scenario: scenario,
              swr: swr,
              swrErrors: result.policies.swr.summary.errors,
              swrStale: result.policies.swr.summary.staleServed,
              totalChecks: result.audit.checks.length,
              ttlBytes: result.policies.ttl.summary.bytes,
              validator304: result.policies.validator.summary.notModified,
              validatorBytes: result.policies.validator.summary.bytes,
              validatorOriginCalls: result.policies.validator.summary.originCalls
            });
          });
        });
      });
    });
    var failures = cases.filter(function (row) { return !row.passed; }).map(function (row) {
      return {
        issues: row.failedChecks,
        latency: row.latency,
        maxAge: row.maxAge,
        scenario: row.scenario,
        swr: row.swr
      };
    });
    var byScenario = Object.keys(SCENARIOS).map(function (scenario) {
      var rows = cases.filter(function (row) { return row.scenario === scenario; });
      return {
        cases: rows.length,
        maxBlockingSaved: rows.reduce(function (max, row) { return Math.max(max, row.blockingSaved); }, 0),
        maxSwrErrors: rows.reduce(function (max, row) { return Math.max(max, row.swrErrors); }, 0),
        passed: rows.filter(function (row) { return row.passed; }).length,
        passedChecks: rows.reduce(function (sum, row) { return sum + row.passedChecks; }, 0),
        scenario: scenario,
        swrStale: rows.reduce(function (sum, row) { return sum + row.swrStale; }, 0),
        totalChecks: rows.reduce(function (sum, row) { return sum + row.totalChecks; }, 0),
        validator304: rows.reduce(function (sum, row) { return sum + row.validator304; }, 0),
        validatorOriginCalls: rows.reduce(function (sum, row) { return sum + row.validatorOriginCalls; }, 0)
      };
    });
    var passed = cases.filter(function (row) { return row.passed; }).length;
    var passedChecks = cases.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = cases.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    return {
      byScenario: byScenario,
      cases: cases,
      ok: failures.length === 0 && passedChecks === totalChecks,
      checked: cases.length,
      failures: failures,
      passed: passed,
      passedChecks: passedChecks,
      total: cases.length,
      totalChecks: totalChecks
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
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 38, { size: 11, color: COLORS.muted });
  }

  function xAt(t, box, horizon) {
    return box.x + 18 + (box.w - 36) * clamp(t / horizon, 0, 1);
  }

  function drawTimeline(ctx, box, state) {
    panel(ctx, box, "request ledger", "fresh hits are cheap; stale decisions are visible");
    var horizon = state.config.horizon;
    var rows = [
      { id: "always", label: "always", y: box.y + 76, color: COLORS.miss },
      { id: "ttl", label: "expiry", y: box.y + 116, color: COLORS.origin },
      { id: "validator", label: "ETag", y: box.y + 156, color: COLORS.validator },
      { id: "swr", label: "SWR", y: box.y + 196, color: COLORS.swr }
    ];
    state.config.changes.forEach(function (t, i) {
      var x = xAt(t, box, horizon);
      ctx.strokeStyle = i === 0 ? COLORS.rule : "#d7c7a7";
      ctx.setLineDash(i === 0 ? [] : [5, 5]);
      ctx.beginPath();
      ctx.moveTo(x, box.y + 54);
      ctx.lineTo(x, box.y + box.h - 18);
      ctx.stroke();
      ctx.setLineDash([]);
      drawText(ctx, "v" + i, x + 3, box.y + 58, { size: 10, color: COLORS.origin });
    });
    state.config.failures.forEach(function (fail) {
      var x1 = xAt(fail.start, box, horizon);
      var x2 = xAt(fail.end, box, horizon);
      ctx.fillStyle = "rgba(190,18,60,0.09)";
      ctx.fillRect(x1, box.y + 54, x2 - x1, box.h - 76);
      drawText(ctx, "origin down", (x1 + x2) / 2, box.y + 58, { size: 10, color: COLORS.stale, align: "center" });
    });
    rows.forEach(function (row) {
      drawText(ctx, row.label, box.x + 14, row.y, { size: 11, color: COLORS.muted, weight: 760 });
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(box.x + 82, row.y);
      ctx.lineTo(box.x + box.w - 18, row.y);
      ctx.stroke();
      state.policies[row.id].rows.forEach(function (event) {
        var x = xAt(event.t, box, horizon);
        ctx.fillStyle = event.error ? COLORS.stale : event.stale ? COLORS.stale : event.wait > 0 ? row.color : COLORS.fresh;
        if (event.action.indexOf("304") >= 0) {
          ctx.strokeStyle = row.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, row.y, 4.5, 0, Math.PI * 2);
          ctx.stroke();
        } else if (event.action.indexOf("stale") >= 0) {
          ctx.fillRect(x - 4, row.y - 4, 8, 8);
        } else {
          ctx.beginPath();
          ctx.arc(x, row.y, event.wait > 0 ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });
  }

  function drawBytes(ctx, box, state) {
    panel(ctx, box, "origin work", "validators spend header bytes when the body is unchanged");
    var maxBytes = Math.max.apply(null, POLICIES.map(function (p) { return state.policies[p.id].summary.bytes; }).concat([1]));
    var plot = { x: box.x + 18, y: box.y + 64, w: box.w - 36, h: box.h - 92 };
    POLICIES.forEach(function (policy, i) {
      var summary = state.policies[policy.id].summary;
      var y = plot.y + i * 42;
      drawText(ctx, policy.label, plot.x, y + 10, { size: 11, color: COLORS.muted });
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.roundRect(plot.x + 112, y, plot.w - 112, 18, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = policy.color;
      ctx.beginPath();
      ctx.roundRect(plot.x + 112, y, (plot.w - 112) * summary.bytes / maxBytes, 18, 9);
      ctx.fill();
      drawText(ctx, Math.round(summary.bytes / 1000) + " KB", plot.x + plot.w - 4, y + 9, { size: 10, align: "right", color: COLORS.text });
      drawText(ctx, summary.full + "x 200, " + summary.notModified + "x 304", plot.x + 112, y + 32, { size: 10, color: COLORS.muted });
    });
  }

  function drawWait(ctx, box, state) {
    panel(ctx, box, "client wait", "background validation trades freshness lag for lower tail latency");
    var maxWait = Math.max.apply(null, POLICIES.map(function (p) { return state.policies[p.id].summary.blocking; }).concat([1]));
    var plot = { x: box.x + 22, y: box.y + 66, w: box.w - 44, h: box.h - 94 };
    var barW = plot.w / POLICIES.length;
    POLICIES.forEach(function (policy, i) {
      var summary = state.policies[policy.id].summary;
      var h = plot.h * summary.blocking / maxWait;
      var x = plot.x + i * barW + 12;
      ctx.fillStyle = policy.color;
      ctx.fillRect(x, plot.y + plot.h - h, Math.max(10, barW - 24), h);
      drawText(ctx, fmt(summary.blocking, 1) + "s", x + (barW - 24) / 2, plot.y + plot.h - h - 10, { size: 10, align: "center" });
      drawText(ctx, policy.label, x + (barW - 24) / 2, plot.y + plot.h + 14, { size: 10, color: COLORS.muted, align: "center" });
    });
    drawText(ctx, "stale served: SWR " + state.policies.swr.summary.staleServed + ", validator " + state.policies.validator.summary.staleServed, plot.x, box.y + box.h - 16, { size: 11, color: COLORS.muted });
  }

  function drawState(ctx, box, state) {
    panel(ctx, box, "freshness windows", "age <= max-age is fresh; SWR extends only the serve-stale window");
    var x = box.x + 24;
    var y = box.y + 78;
    var w = box.w - 48;
    var total = Math.max(1, state.params.maxAge + state.params.swr + 4);
    var freshW = w * state.params.maxAge / total;
    var swrW = w * state.params.swr / total;
    ctx.fillStyle = COLORS.fresh;
    ctx.fillRect(x, y, freshW, 24);
    ctx.fillStyle = COLORS.swr;
    ctx.fillRect(x + freshW, y, swrW, 24);
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(x + freshW + swrW, y, w - freshW - swrW, 24);
    drawText(ctx, "fresh " + state.params.maxAge + "s", x + 8, y + 12, { size: 11, color: COLORS.white });
    if (state.params.swr > 0) drawText(ctx, "serve stale " + state.params.swr + "s", x + freshW + 8, y + 12, { size: 11, color: COLORS.white });
    drawText(ctx, "must block or fail", x + freshW + swrW + 8, y + 12, { size: 11, color: COLORS.muted });

    var y2 = y + 62;
    [
      ["cache key", "GET /article"],
      ["validator", "ETag " + versionAt(state.config, state.config.changes[state.config.changes.length - 1]).etag],
      ["origin latency", state.params.latency + " ms"],
      ["audit", state.audit.ok ? "passes" : "fails"]
    ].forEach(function (row, i) {
      drawText(ctx, row[0], x, y2 + i * 24, { size: 11, color: COLORS.muted });
      drawText(ctx, row[1], x + 116, y2 + i * 24, { size: 11, color: i === 3 && !state.audit.ok ? COLORS.stale : COLORS.text, weight: 760 });
    });
  }

  function draw(canvas, state) {
    var compact = canvas.clientWidth && canvas.clientWidth < 620;
    var width = compact ? 760 : 980;
    var height = compact ? 900 : 760;
    var ctx = setCanvasSize(canvas, width, height);
    ctx.clearRect(0, 0, width, height);
    if (compact) {
      drawTimeline(ctx, { x: 16, y: 16, w: width - 32, h: 254 }, state);
      drawBytes(ctx, { x: 16, y: 292, w: width - 32, h: 212 }, state);
      drawWait(ctx, { x: 16, y: 526, w: width - 32, h: 170 }, state);
      drawState(ctx, { x: 16, y: 718, w: width - 32, h: 166 }, state);
    } else {
      drawTimeline(ctx, { x: 18, y: 18, w: 944, h: 250 }, state);
      drawBytes(ctx, { x: 18, y: 292, w: 456, h: 224 }, state);
      drawWait(ctx, { x: 506, y: 292, w: 456, h: 224 }, state);
      drawState(ctx, { x: 18, y: 540, w: 944, h: 196 }, state);
    }
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("output[data-value]").forEach(function (output) {
      var name = output.getAttribute("data-value");
      if (name === "scenario") output.textContent = SCENARIOS[params.scenario].label;
      else if (name === "maxAge") output.textContent = params.maxAge + "s";
      else if (name === "swr") output.textContent = params.swr + "s";
      else if (name === "latency") output.textContent = params.latency + "ms";
      else if (name === "cadence") output.textContent = fmt(params.cadence, 2) + "s";
    });
  }

  function render(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (control) {
      raw[control.getAttribute("data-param")] = control.value;
    });
    var state = evaluate(raw);
    root.__httpCacheState = state;
    updateOutputs(root, state.params);
    setText(root, "requests", state.requests.length);
    setText(root, "validator304", state.policies.validator.summary.notModified);
    setText(root, "swrStale", state.policies.swr.summary.staleServed);
    setText(root, "bytesSaved", Math.round((state.policies.always.summary.bytes - state.policies.validator.summary.bytes) / 1000) + " KB");
    setText(root, "blockSaved", fmt(state.policies.validator.summary.blocking - state.policies.swr.summary.blocking, 1) + "s");
    setText(root, "errors", state.policies.swr.summary.errors);
    setText(root, "audit", state.audit.ok ? "passes" : "fails");
    var note = root.querySelector("[data-cache-note]");
    if (note) note.textContent = SCENARIOS[state.params.scenario].note;
    var canvas = root.querySelector("canvas");
    if (canvas) draw(canvas, state);
  }

  function init(root) {
    if (!root || root.__httpCacheReady) return;
    root.__httpCacheReady = true;
    root.querySelectorAll("[data-param]").forEach(function (control) {
      control.addEventListener("input", function () { render(root); });
      control.addEventListener("change", function () { render(root); });
    });
    render(root);
    global.addEventListener("resize", function () { render(root); });
  }

  function mount() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-http-cache-lab]").forEach(init);
  }

  var api = {
    normalize: normalize,
    scenarioConfig: scenarioConfig,
    versionAt: versionAt,
    makeRequests: makeRequests,
    originFetch: originFetch,
    simulateAlways: simulateAlways,
    simulateTtl: simulateTtl,
    simulateValidator: simulateValidator,
    simulateSwr: simulateSwr,
    evaluate: evaluate,
    verifyResult: verifyResult,
    auditHttpCacheLab: auditHttpCacheLab
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.HttpCacheValidatorLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
