(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    good: "#0f766e",
    bad: "#be123c",
    write: "#2563eb",
    read: "#d97706",
    cas: "#7c3aed",
    point: "#0f766e",
    blocked: "#fda4af",
    grid: "#eef2f5"
  };

  var SCENARIOS = {
    overlap: {
      title: "Overlap Can Save a Read",
      summary: "A read returning 0 can linearize before an overlapping write; a later read returns 1.",
      initial: 0,
      expected: true,
      operations: [
        { id: "W1", process: "P0", kind: "write", arg: 1, ret: "ok", start: 1, end: 7 },
        { id: "R0", process: "P1", kind: "read", ret: 0, start: 2, end: 4 },
        { id: "R1", process: "P2", kind: "read", ret: 1, start: 5, end: 8 }
      ]
    },
    stale: {
      title: "A Completed Write Cannot Be Ignored",
      summary: "The write returns before the read begins, so the read cannot legally return the old value.",
      initial: 0,
      expected: false,
      operations: [
        { id: "W1", process: "P0", kind: "write", arg: 1, ret: "ok", start: 1, end: 3 },
        { id: "R0", process: "P1", kind: "read", ret: 0, start: 4, end: 6 }
      ]
    },
    future: {
      title: "A Read Cannot See the Future",
      summary: "The read finishes before the write starts; no linearization point can explain value 1.",
      initial: 0,
      expected: false,
      operations: [
        { id: "R1", process: "P0", kind: "read", ret: 1, start: 1, end: 2.8 },
        { id: "W1", process: "P1", kind: "write", arg: 1, ret: "ok", start: 4, end: 6 }
      ]
    },
    writeRace: {
      title: "A Read Can Slip Between Two Writes",
      summary: "The second write overlaps the read, so the read may linearize after W1 and before W2.",
      initial: 0,
      expected: true,
      operations: [
        { id: "W1", process: "P0", kind: "write", arg: 1, ret: "ok", start: 1, end: 2.5 },
        { id: "W2", process: "P1", kind: "write", arg: 2, ret: "ok", start: 3.2, end: 7 },
        { id: "R1", process: "P2", kind: "read", ret: 1, start: 4, end: 6 }
      ]
    },
    casDuel: {
      title: "Overlap Does Not Save Two Successful CAS Calls",
      summary: "Both compare-and-set calls claim they changed 0. Sequentially, at most one can win.",
      initial: 0,
      expected: false,
      operations: [
        { id: "C1", process: "P0", kind: "cas", expected: 0, update: 1, ret: true, start: 1, end: 6 },
        { id: "C2", process: "P1", kind: "cas", expected: 0, update: 2, ret: true, start: 2, end: 7 }
      ]
    },
    casRace: {
      title: "One CAS Wins, One CAS Loses",
      summary: "The failed CAS can linearize after the successful CAS, then the read sees the winner.",
      initial: 0,
      expected: true,
      operations: [
        { id: "C1", process: "P0", kind: "cas", expected: 0, update: 1, ret: true, start: 1, end: 5 },
        { id: "C2", process: "P1", kind: "cas", expected: 0, update: 2, ret: false, start: 2, end: 6 },
        { id: "R1", process: "P2", kind: "read", ret: 1, start: 6.2, end: 8 }
      ]
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function scenarioNames() {
    return Object.keys(SCENARIOS);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = String(raw.scenario || "overlap");
    if (!SCENARIOS[scenario]) scenario = "overlap";
    return { scenario: scenario };
  }

  function opLabel(op) {
    if (op.kind === "write") return op.id + ": write(" + op.arg + ")";
    if (op.kind === "read") return op.id + ": read -> " + op.ret;
    return op.id + ": cas(" + op.expected + "," + op.update + ") -> " + (op.ret ? "true" : "false");
  }

  function shortOp(op) {
    if (op.kind === "write") return "write " + op.arg;
    if (op.kind === "read") return "read -> " + op.ret;
    return "cas " + op.expected + "->" + op.update + " / " + (op.ret ? "ok" : "fail");
  }

  function colorFor(op) {
    if (op.kind === "write") return COLORS.write;
    if (op.kind === "read") return COLORS.read;
    return COLORS.cas;
  }

  function precedenceEdges(ops) {
    var edges = [];
    for (var i = 0; i < ops.length; i += 1) {
      for (var j = 0; j < ops.length; j += 1) {
        if (i !== j && ops[i].end <= ops[j].start) {
          edges.push({ from: ops[i].id, to: ops[j].id });
        }
      }
    }
    return edges;
  }

  function predecessors(ops) {
    var pred = {};
    ops.forEach(function (op) { pred[op.id] = []; });
    precedenceEdges(ops).forEach(function (edge) {
      pred[edge.to].push(edge.from);
    });
    return pred;
  }

  function applyOp(value, op) {
    if (op.kind === "write") {
      return { ok: true, value: op.arg, note: "state := " + op.arg };
    }
    if (op.kind === "read") {
      return {
        ok: value === op.ret,
        value: value,
        note: value === op.ret ? "read matches " + value : "state is " + value + ", not " + op.ret
      };
    }
    if (op.kind === "cas") {
      var success = value === op.expected;
      if (success !== op.ret) {
        return {
          ok: false,
          value: value,
          note: success ? "CAS should succeed, but returned false" : "CAS should fail, but returned true"
        };
      }
      return {
        ok: true,
        value: success ? op.update : value,
        note: success ? "CAS writes " + op.update : "CAS observes mismatch"
      };
    }
    throw new Error("unknown operation kind " + op.kind);
  }

  function checkHistory(inputScenario) {
    var scenario = clone(inputScenario);
    var ops = scenario.operations;
    var byId = {};
    ops.forEach(function (op) { byId[op.id] = op; });
    var pred = predecessors(ops);
    var witness = null;
    var witnessStates = null;
    var legalOrders = 0;
    var explored = 0;
    var semanticFailures = [];
    var blockedSnapshots = [];

    function ready(remaining, done) {
      return remaining.filter(function (op) {
        return pred[op.id].every(function (id) { return done.indexOf(id) >= 0; });
      });
    }

    function search(remaining, value, path, states) {
      explored += 1;
      if (remaining.length === 0) {
        legalOrders += 1;
        if (!witness) {
          witness = path.slice();
          witnessStates = states.slice();
        }
        return;
      }

      var doneIds = path.map(function (op) { return op.id; });
      var candidates = ready(remaining, doneIds);
      if (candidates.length === 0) {
        blockedSnapshots.push(remaining.map(function (op) { return op.id; }).join(", "));
        return;
      }

      candidates.forEach(function (op) {
        var applied = applyOp(value, op);
        if (!applied.ok) {
          semanticFailures.push({
            id: op.id,
            atState: value,
            note: applied.note,
            prefix: doneIds.join(" -> ") || "(start)"
          });
          return;
        }
        search(
          remaining.filter(function (item) { return item.id !== op.id; }),
          applied.value,
          path.concat([op]),
          states.concat([{ id: op.id, before: value, after: applied.value, note: applied.note }])
        );
      });
    }

    search(ops.slice(), scenario.initial, [], []);
    return {
      blockedSnapshots: blockedSnapshots,
      edges: precedenceEdges(ops),
      explored: explored,
      legalOrders: legalOrders,
      linearizable: legalOrders > 0,
      operations: ops,
      scenario: scenario,
      semanticFailures: semanticFailures.slice(0, 10),
      witness: witness || [],
      witnessStates: witnessStates || []
    };
  }

  function analyze(rawParams) {
    var params = cleanParams(rawParams);
    return checkHistory(SCENARIOS[params.scenario]);
  }

  function runAudit() {
    var names = scenarioNames();
    var checks = [];
    var summaries = {};
    names.forEach(function (name) {
      var result = analyze({ scenario: name });
      summaries[name] = {
        expected: SCENARIOS[name].expected,
        legalOrders: result.legalOrders,
        linearizable: result.linearizable
      };
      checks.push(result.linearizable === SCENARIOS[name].expected);
    });
    checks.push(analyze({ scenario: "overlap" }).witness.map(function (op) { return op.id; }).join(",") === "R0,W1,R1");
    checks.push(analyze({ scenario: "casDuel" }).semanticFailures.length > 0);
    return {
      cases: checks.length,
      ok: checks.filter(Boolean).length,
      summaries: summaries
    };
  }

  function metric(label, value) {
    return '<div class="linear-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function label(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.faint;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, x + 12, y + 21, COLORS.text, 13, 750);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function linearizationPoints(result) {
    var current = -Infinity;
    var points = {};
    result.witness.forEach(function (op) {
      var t = Math.max(op.start, current + 0.08);
      if (t > op.end) t = (op.start + op.end) / 2;
      points[op.id] = t;
      current = t;
    });
    return points;
  }

  function drawTimeline(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "history intervals");
    var ops = result.operations;
    var minT = Math.min.apply(null, ops.map(function (op) { return op.start; })) - 0.4;
    var maxT = Math.max.apply(null, ops.map(function (op) { return op.end; })) + 0.4;
    var lanes = [];
    ops.forEach(function (op) {
      if (lanes.indexOf(op.process) < 0) lanes.push(op.process);
    });
    var plot = { x: box.x + 54, y: box.y + 42, w: box.w - 76, h: box.h - 72 };
    function x(t) { return plot.x + (t - minT) / (maxT - minT) * plot.w; }
    var laneGap = plot.h / Math.max(1, lanes.length);
    var points = result.linearizable ? linearizationPoints(result) : {};

    for (var tick = Math.ceil(minT); tick <= Math.floor(maxT); tick += 1) {
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x(tick), plot.y - 8);
      ctx.lineTo(x(tick), plot.y + plot.h + 4);
      ctx.stroke();
      label(ctx, String(tick), x(tick), plot.y + plot.h + 20, COLORS.muted, 10, 600, "center");
    }

    lanes.forEach(function (lane, i) {
      var y = plot.y + i * laneGap + laneGap * 0.5;
      label(ctx, lane, box.x + 14, y + 4, COLORS.muted, 11, 700);
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });

    ops.forEach(function (op) {
      var laneIndex = lanes.indexOf(op.process);
      var y = plot.y + laneIndex * laneGap + laneGap * 0.5 - 13;
      var left = x(op.start);
      var width = Math.max(18, x(op.end) - x(op.start));
      ctx.fillStyle = colorFor(op);
      ctx.globalAlpha = 0.14;
      roundRect(ctx, left, y, width, 26, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colorFor(op);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      label(ctx, opLabel(op), left + 7, y + 17, COLORS.text, 10, 650);

      if (points[op.id] != null) {
        var px = x(points[op.id]);
        ctx.fillStyle = COLORS.point;
        ctx.beginPath();
        ctx.arc(px, y + 13, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    label(
      ctx,
      result.linearizable ? "green dots are one legal choice of linearization points" : "no placement of points satisfies time order and object semantics",
      plot.x,
      box.y + box.h - 12,
      result.linearizable ? COLORS.good : COLORS.bad,
      11,
      700
    );
  }

  function drawSearch(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, result.linearizable ? "one sequential explanation" : "why the search exhausts");
    var x = box.x + 18;
    var y = box.y + 48;
    if (result.linearizable) {
      label(ctx, "initial value = " + result.scenario.initial, x, y, COLORS.muted, 11, 700);
      result.witnessStates.forEach(function (state, i) {
        var op = result.witness[i];
        var px = x + i * Math.max(74, Math.min(118, (box.w - 42) / Math.max(1, result.witness.length)));
        ctx.fillStyle = colorFor(op);
        ctx.globalAlpha = 0.14;
        roundRect(ctx, px, y + 24, 92, 44, 7);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colorFor(op);
        ctx.stroke();
        label(ctx, op.id, px + 8, y + 43, COLORS.text, 12, 750);
        label(ctx, state.before + " -> " + state.after, px + 8, y + 60, COLORS.muted, 10, 650);
        if (i < result.witness.length - 1) {
          label(ctx, ">", px + 101, y + 52, COLORS.muted, 14, 750);
        }
      });
      label(ctx, "legal sequential orders found: " + result.legalOrders, x, box.y + box.h - 18, COLORS.good, 11, 750);
      return;
    }

    label(ctx, "No remaining branch can both respect real-time order and match return values.", x, y, COLORS.bad, 11, 750);
    var failures = result.semanticFailures.slice(0, 4);
    failures.forEach(function (failure, i) {
      var fy = y + 30 + i * 36;
      ctx.fillStyle = COLORS.blocked;
      ctx.globalAlpha = 0.18;
      roundRect(ctx, x, fy - 15, box.w - 36, 27, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      label(ctx, failure.id + " after " + failure.prefix, x + 8, fy, COLORS.text, 10, 750);
      label(ctx, failure.note, x + 190, fy, COLORS.bad, 10, 700);
    });
    label(ctx, "search nodes explored: " + result.explored, x, box.y + box.h - 18, COLORS.muted, 11, 700);
  }

  function draw(result, canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(280, Math.floor(rect.width || canvas.clientWidth || 860));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var narrow = cssWidth < 520;
    var pad = narrow ? 12 : 18;
    var gap = narrow ? 14 : 18;
    var timelineH = narrow ? 300 : 286;
    var searchH = narrow ? 236 : 218;
    var cssHeight = pad * 2 + timelineH + gap + searchH;
    var targetWidth = Math.round(cssWidth * ratio);
    var targetHeight = Math.round(cssHeight * ratio);
    canvas.style.height = cssHeight + "px";
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    drawTimeline(ctx, result, { x: pad, y: pad, w: cssWidth - 2 * pad, h: timelineH });
    drawSearch(ctx, result, { x: pad, y: pad + timelineH + gap, w: cssWidth - 2 * pad, h: searchH });
  }

  function readParams(lab) {
    var input = lab.querySelector('[data-param="scenario"]');
    return cleanParams({ scenario: input ? input.value : "overlap" });
  }

  function renderExplanation(lab, result) {
    var target = lab.querySelector("[data-explanation]");
    if (!target) return;
    if (result.linearizable) {
      target.innerHTML = result.witness.map(function (op) {
        return "<li>" + opLabel(op) + "</li>";
      }).join("");
    } else {
      target.innerHTML = result.semanticFailures.slice(0, 4).map(function (failure) {
        return "<li>" + failure.id + ": " + failure.note + "</li>";
      }).join("");
    }
  }

  function render(lab) {
    var params = readParams(lab);
    var result = analyze(params);
    var audit = runAudit();
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("history", result.scenario.title),
        metric("verdict", result.linearizable ? "linearizable" : "not linearizable"),
        metric("legal orders", String(result.legalOrders)),
        metric("search nodes", String(result.explored)),
        metric("real-time edges", String(result.edges.length)),
        metric("audit", audit.ok + "/" + audit.cases)
      ].join("");
    }
    var summary = lab.querySelector("[data-summary]");
    if (summary) summary.textContent = result.scenario.summary;
    renderExplanation(lab, result);
    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function init(lab) {
    var frame = null;
    function redrawSoon() {
      if (frame != null) return;
      if (!global.requestAnimationFrame) {
        render(lab);
        return;
      }
      frame = global.requestAnimationFrame(function () {
        frame = null;
        render(lab);
      });
    }
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () { render(lab); });
      input.addEventListener("change", function () { render(lab); });
    });
    if (global.addEventListener) global.addEventListener("resize", redrawSoon);
    render(lab);
  }

  function initAll() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-linearizability-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    analyze: analyze,
    checkHistory: checkHistory,
    cleanParams: cleanParams,
    runAudit: runAudit,
    scenarios: SCENARIOS
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LinearizabilityLab = api;
})(typeof window !== "undefined" ? window : globalThis);
