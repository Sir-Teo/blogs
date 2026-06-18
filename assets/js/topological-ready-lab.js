(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    good: "#0f766e",
    warn: "#b45309",
    bad: "#be123c",
    blue: "#2563eb",
    teal: "#0f766e",
    amber: "#b45309",
    rose: "#be123c",
    violet: "#7c3aed",
    slate: "#64748b",
    white: "#ffffff"
  };

  var DEFAULTS = {
    scenario: "build",
    rule: "critical",
    workers: 3
  };

  var SCENARIOS = {
    build: {
      label: "package build",
      nodes: [
        node("spec", "spec", 2, 0.12, 0.18),
        node("proto", "proto", 3, 0.13, 0.52),
        node("api", "api", 4, 0.35, 0.16),
        node("db", "db", 4, 0.35, 0.42),
        node("ui", "ui", 5, 0.35, 0.70),
        node("docs", "docs", 2, 0.35, 0.90),
        node("tests", "tests", 3, 0.61, 0.28),
        node("bundle", "bundle", 2, 0.76, 0.55),
        node("deploy", "deploy", 1, 0.89, 0.55),
        node("watch", "watch", 1, 0.90, 0.82)
      ],
      edges: [
        ["spec", "api"],
        ["spec", "db"],
        ["spec", "ui"],
        ["proto", "ui"],
        ["api", "tests"],
        ["db", "tests"],
        ["ui", "bundle"],
        ["docs", "bundle"],
        ["tests", "bundle"],
        ["bundle", "deploy"],
        ["deploy", "watch"]
      ]
    },
    trap: {
      label: "tie-breaking trap",
      nodes: [
        node("core", "core", 5, 0.12, 0.24),
        node("lint", "lint", 1, 0.12, 0.48),
        node("docs", "docs", 1, 0.12, 0.68),
        node("notes", "notes", 1, 0.12, 0.88),
        node("ffi", "ffi", 5, 0.38, 0.24),
        node("tests", "tests", 4, 0.64, 0.24),
        node("site", "site", 2, 0.46, 0.72),
        node("release", "release", 2, 0.86, 0.46)
      ],
      edges: [
        ["core", "ffi"],
        ["ffi", "tests"],
        ["tests", "release"],
        ["lint", "release"],
        ["docs", "site"],
        ["notes", "site"],
        ["site", "release"]
      ]
    },
    cycle: {
      label: "cycle introduced",
      nodes: [
        node("parse", "parse", 2, 0.12, 0.35),
        node("types", "types", 3, 0.34, 0.24),
        node("lower", "lower", 2, 0.58, 0.24),
        node("link", "link", 2, 0.76, 0.45),
        node("test", "test", 2, 0.88, 0.72),
        node("docs", "docs", 1, 0.34, 0.78)
      ],
      edges: [
        ["parse", "types"],
        ["types", "lower"],
        ["lower", "link"],
        ["link", "types"],
        ["link", "test"],
        ["parse", "docs"]
      ]
    }
  };

  var RULES = {
    alpha: "alphabetical",
    critical: "critical tail",
    fifo: "input order",
    shortest: "shortest task"
  };

  function node(id, label, duration, x, y) {
    return { duration: duration, id: id, label: label, x: x, y: y };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var rule = RULES[raw.rule] ? raw.rule : DEFAULTS.rule;
    var workers = Number(raw.workers);
    if (!isFinite(workers)) workers = DEFAULTS.workers;
    workers = clamp(Math.round(workers), 1, 4);
    return { rule: rule, scenario: scenario, workers: workers };
  }

  function cloneGraph(id) {
    var base = SCENARIOS[id] || SCENARIOS[DEFAULTS.scenario];
    return {
      edges: base.edges.map(function (edge) { return edge.slice(); }),
      label: base.label,
      nodes: base.nodes.map(function (n) {
        return { duration: n.duration, id: n.id, label: n.label, x: n.x, y: n.y };
      })
    };
  }

  function indexGraph(graph) {
    var byId = {};
    var index = {};
    var incoming = {};
    var outgoing = {};
    graph.nodes.forEach(function (n, i) {
      byId[n.id] = n;
      index[n.id] = i;
      incoming[n.id] = [];
      outgoing[n.id] = [];
    });
    graph.edges.forEach(function (edge) {
      outgoing[edge[0]].push(edge[1]);
      incoming[edge[1]].push(edge[0]);
    });
    return { byId: byId, incoming: incoming, index: index, outgoing: outgoing };
  }

  function computeTail(graph, topo, idx) {
    var tail = {};
    graph.nodes.forEach(function (n) { tail[n.id] = n.duration; });
    for (var i = topo.length - 1; i >= 0; i -= 1) {
      var id = topo[i];
      var best = 0;
      idx.outgoing[id].forEach(function (child) {
        best = Math.max(best, tail[child] || 0);
      });
      tail[id] = idx.byId[id].duration + best;
    }
    return tail;
  }

  function sorter(rule, idx, tail) {
    return function (a, b) {
      if (rule === "critical") {
        var ta = tail[a] || idx.byId[a].duration;
        var tb = tail[b] || idx.byId[b].duration;
        if (tb !== ta) return tb - ta;
      }
      if (rule === "shortest") {
        var da = idx.byId[a].duration;
        var db = idx.byId[b].duration;
        if (da !== db) return da - db;
      }
      if (rule === "alpha") {
        if (a !== b) return a < b ? -1 : 1;
      }
      return idx.index[a] - idx.index[b];
    };
  }

  function zeroIndegreeIds(graph, idx, ids) {
    return ids.filter(function (id) {
      return idx.incoming[id].filter(function (from) { return ids.indexOf(from) >= 0; }).length === 0;
    });
  }

  function topologicalPass(graph, rule, tailHint) {
    var idx = indexGraph(graph);
    var indegree = {};
    graph.nodes.forEach(function (n) { indegree[n.id] = idx.incoming[n.id].length; });

    var tail = tailHint || {};
    var ready = graph.nodes.filter(function (n) { return indegree[n.id] === 0; }).map(function (n) { return n.id; });
    var order = [];
    var steps = [];
    var zeroAtSelection = true;
    var compare = sorter(rule, idx, tail);

    ready.sort(compare);
    while (ready.length) {
      ready.sort(compare);
      var before = ready.slice();
      var selected = ready.shift();
      if (indegree[selected] !== 0) zeroAtSelection = false;
      order.push(selected);
      var released = [];
      idx.outgoing[selected].forEach(function (child) {
        indegree[child] -= 1;
        if (indegree[child] === 0) {
          ready.push(child);
          released.push(child);
        }
      });
      steps.push({ ready: before, released: released, selected: selected });
    }

    var remaining = graph.nodes.map(function (n) { return n.id; }).filter(function (id) {
      return order.indexOf(id) < 0;
    });
    var remainingZero = zeroIndegreeIds(graph, idx, remaining);
    return {
      acyclic: remaining.length === 0,
      indegree: indegree,
      order: order,
      remaining: remaining,
      remainingZero: remainingZero,
      steps: steps,
      zeroAtSelection: zeroAtSelection
    };
  }

  function topoOrderIgnoringRule(graph) {
    return topologicalPass(graph, "fifo", {}).order;
  }

  function criticalPath(graph, idx, topo) {
    var earliestStart = {};
    var earliestFinish = {};
    var parent = {};
    graph.nodes.forEach(function (n) {
      earliestStart[n.id] = 0;
      earliestFinish[n.id] = n.duration;
      parent[n.id] = null;
    });
    topo.forEach(function (id) {
      var finish = earliestStart[id] + idx.byId[id].duration;
      earliestFinish[id] = finish;
      idx.outgoing[id].forEach(function (child) {
        if (finish > earliestStart[child]) {
          earliestStart[child] = finish;
          parent[child] = id;
        }
      });
    });
    var end = topo[0] || null;
    topo.forEach(function (id) {
      if (end == null || earliestFinish[id] > earliestFinish[end]) end = id;
    });
    var path = [];
    var cursor = end;
    while (cursor) {
      path.push(cursor);
      cursor = parent[cursor];
    }
    path.reverse();
    return {
      earliestFinish: earliestFinish,
      earliestStart: earliestStart,
      length: end == null ? 0 : earliestFinish[end],
      path: path
    };
  }

  function schedule(graph, rule, workers, tail) {
    var idx = indexGraph(graph);
    var remainingPreds = {};
    graph.nodes.forEach(function (n) { remainingPreds[n.id] = idx.incoming[n.id].length; });
    var ready = graph.nodes.filter(function (n) { return remainingPreds[n.id] === 0; }).map(function (n) { return n.id; });
    var compare = sorter(rule, idx, tail);
    var slots = [];
    for (var w = 0; w < workers; w += 1) slots.push({ end: 0, task: null });
    var segments = [];
    var completed = {};
    var completionTime = {};
    var startTime = {};
    var time = 0;
    var trace = [];

    function idleWorkers() {
      return slots.filter(function (slot) { return slot.task == null; });
    }

    while (Object.keys(completed).length < graph.nodes.length) {
      ready.sort(compare);
      idleWorkers().forEach(function (slot) {
        if (!ready.length) return;
        var task = ready.shift();
        slot.task = task;
        slot.start = time;
        slot.end = time + idx.byId[task].duration;
        startTime[task] = time;
        segments.push({
          duration: idx.byId[task].duration,
          end: slot.end,
          id: task,
          start: time,
          worker: slots.indexOf(slot)
        });
        trace.push({ event: "start", ready: ready.slice(), task: task, time: time, worker: slots.indexOf(slot) });
      });

      var busy = slots.filter(function (slot) { return slot.task != null; });
      if (!busy.length) {
        return { completionTime: completionTime, deadlock: true, makespan: time, segments: segments, startTime: startTime, trace: trace };
      }

      var nextTime = Math.min.apply(null, busy.map(function (slot) { return slot.end; }));
      time = nextTime;
      slots.forEach(function (slot, worker) {
        if (slot.task != null && slot.end === time) {
          var done = slot.task;
          completed[done] = true;
          completionTime[done] = time;
          slot.task = null;
          idx.outgoing[done].forEach(function (child) {
            remainingPreds[child] -= 1;
            if (remainingPreds[child] === 0) ready.push(child);
          });
          trace.push({ event: "finish", task: done, time: time, worker: worker });
        }
      });
    }

    return {
      completionTime: completionTime,
      deadlock: false,
      makespan: time,
      segments: segments,
      startTime: startTime,
      trace: trace
    };
  }

  function verifyEdges(graph, order) {
    var position = {};
    order.forEach(function (id, index) { position[id] = index; });
    return graph.edges.every(function (edge) {
      return position[edge[0]] < position[edge[1]];
    });
  }

  function verifySchedule(graph, sched, idx) {
    if (sched.deadlock) return false;
    return graph.edges.every(function (edge) {
      return sched.startTime[edge[1]] >= sched.completionTime[edge[0]];
    });
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var graph = cloneGraph(params.scenario);
    var idx = indexGraph(graph);
    var firstTopo = topologicalPass(graph, "fifo", {});

    var topo = firstTopo;
    var tail = {};
    var cp = { length: 0, path: [] };
    var sched = null;
    var totalWork = graph.nodes.reduce(function (sum, n) { return sum + n.duration; }, 0);

    if (firstTopo.acyclic) {
      var plainOrder = topoOrderIgnoringRule(graph);
      tail = computeTail(graph, plainOrder, idx);
      topo = topologicalPass(graph, params.rule, tail);
      cp = criticalPath(graph, idx, plainOrder);
      sched = schedule(graph, params.rule, params.workers, tail);
    }

    var lowerBound = Math.max(cp.length, totalWork / params.workers);
    var audit = {
      cycleDetected: !topo.acyclic,
      edgeOrder: topo.acyclic ? verifyEdges(graph, topo.order) : true,
      noZeroLeftInCycle: topo.acyclic ? true : topo.remaining.length > 0 && topo.remainingZero.length === 0,
      passed: false,
      scheduleRespectsDeps: sched ? verifySchedule(graph, sched, idx) : true,
      selectedZero: topo.zeroAtSelection,
      workBound: sched ? sched.makespan + 1e-9 >= totalWork / params.workers : true,
      criticalBound: sched ? sched.makespan + 1e-9 >= cp.length : true
    };
    audit.passed = audit.selectedZero && audit.edgeOrder && audit.noZeroLeftInCycle && audit.scheduleRespectsDeps && audit.workBound && audit.criticalBound;

    return {
      audit: audit,
      criticalPath: cp,
      graph: graph,
      index: idx,
      lowerBound: lowerBound,
      params: params,
      schedule: sched,
      tail: tail,
      topo: topo,
      totalWork: totalWork
    };
  }

  function auditTopologicalReadyLab() {
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    function check(name, passed) {
      return {
        name: name,
        passed: Boolean(passed)
      };
    }
    function failedChecks(checks) {
      return checks.filter(function (row) { return !row.passed; }).map(function (row) { return row.name; });
    }
    function finishRow(row, checks) {
      row.checks = checks;
      row.failedChecks = failedChecks(checks);
      row.passedChecks = checks.filter(function (item) { return item.passed; }).length;
      row.totalChecks = checks.length;
      row.passed = row.passedChecks === row.totalChecks;
      return row;
    }
    function acyclicChecks(result, extra) {
      return [
        check("selected node had zero indegree", result.audit.selectedZero),
        check("edges point forward in emitted order", result.audit.edgeOrder),
        check("schedule respects dependencies", result.audit.scheduleRespectsDeps),
        check("makespan respects work lower bound", result.audit.workBound),
        check("makespan respects critical-path lower bound", result.audit.criticalBound)
      ].concat(extra || []);
    }
    function acyclicRow(label, result, extraChecks) {
      return finishRow({
        criticalPath: result.criticalPath.length,
        emitted: result.topo.order.length,
        label: label,
        makespan: result.schedule.makespan,
        rule: result.params.rule,
        scenario: result.params.scenario,
        totalWork: result.totalWork,
        workPerWorker: result.totalWork / result.params.workers,
        workers: result.params.workers
      }, acyclicChecks(result, extraChecks));
    }
    var base = evaluate({ scenario: "build", rule: "critical", workers: 3 });
    assert(base.audit.passed, "default audit should pass");
    assert(base.topo.acyclic, "build graph should be acyclic");
    assert(base.schedule.makespan >= base.criticalPath.length, "makespan should respect critical path lower bound");
    assert(base.schedule.makespan >= base.totalWork / base.params.workers, "makespan should respect work lower bound");
    assert(base.criticalPath.path.length >= 2, "critical path should name tasks");

    var cycle = evaluate({ scenario: "cycle" });
    assert(!cycle.topo.acyclic, "cycle scenario should be rejected");
    assert(cycle.audit.cycleDetected, "cycle audit should notice the cycle");
    assert(cycle.audit.noZeroLeftInCycle, "remaining cycle should have no zero-indegree vertex");

    var shortest = evaluate({ scenario: "trap", rule: "shortest", workers: 2 });
    var critical = evaluate({ scenario: "trap", rule: "critical", workers: 2 });
    assert(shortest.schedule.makespan > critical.schedule.makespan, "shortest-first should delay the critical chain in the trap");
    assert(critical.audit.passed && shortest.audit.passed, "both tie rules should produce valid schedules");

    var one = evaluate({ scenario: "build", workers: 1 });
    assert(one.schedule.makespan === one.totalWork, "one worker should take total work time");
    var rows = [
      acyclicRow("package build", base, [
        check("critical path names tasks", base.criticalPath.path.length >= 2)
      ]),
      acyclicRow("trap critical tail", critical, [
        check("critical rule beats shortest in trap", critical.schedule.makespan < shortest.schedule.makespan)
      ]),
      acyclicRow("trap shortest task", shortest),
      finishRow({
        emitted: cycle.topo.order.length,
        label: "cycle introduced",
        remaining: cycle.topo.remaining.slice(),
        scenario: cycle.params.scenario
      }, [
        check("partial pass selected only zero-indegree nodes", cycle.audit.selectedZero),
        check("cycle was detected", cycle.audit.cycleDetected),
        check("cycle remainder has no zero-indegree node", cycle.audit.noZeroLeftInCycle)
      ]),
      acyclicRow("single worker build", one, [
        check("one worker takes total work time", one.schedule.makespan === one.totalWork)
      ])
    ];
    var passed = rows.filter(function (row) { return row.passed; }).length;
    var passedChecks = rows.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = rows.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    var failures = rows.filter(function (row) { return !row.passed; }).map(function (row) {
      return {
        failedChecks: row.failedChecks,
        label: row.label,
        scenario: row.scenario
      };
    });
    return {
      cases: rows,
      failures: failures,
      ok: passed === rows.length && passedChecks === totalChecks,
      passed: passed,
      passedChecks: passedChecks,
      defaultMakespan: base.schedule.makespan,
      trapCritical: critical.schedule.makespan,
      trapShortest: shortest.schedule.makespan,
      cycleRemaining: cycle.topo.remaining.slice(),
      totalChecks: totalChecks,
      total: rows.length
    };
  }

  function setupCanvas(canvas) {
    var ratio = global.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.width || 900));
    var height = Math.max(520, Math.round(rect.height || canvas.height || 620));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 20, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 40, COLORS.muted, 10.5, 560);
  }

  function arrow(ctx, x1, y1, x2, y2, color, width) {
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var r = 22;
    var sx = x1 + Math.cos(angle) * r;
    var sy = y1 + Math.sin(angle) * r;
    var ex = x2 - Math.cos(angle) * r;
    var ey = y2 - Math.sin(angle) * r;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 1.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(angle - 0.45) * 8, ey - Math.sin(angle - 0.45) * 8);
    ctx.lineTo(ex - Math.cos(angle + 0.45) * 8, ey - Math.sin(angle + 0.45) * 8);
    ctx.closePath();
    ctx.fill();
  }

  function drawGraph(ctx, box, result) {
    var graph = result.graph;
    var idx = result.index;
    panel(ctx, box, "dependency graph", result.topo.acyclic ? "arrows point from prerequisite to dependent task" : "ready set exhausted before all nodes left");
    var inner = { x: box.x + 16, y: box.y + 56, w: box.w - 32, h: box.h - 72 };
    var critical = {};
    result.criticalPath.path.forEach(function (id) { critical[id] = true; });
    var remaining = {};
    result.topo.remaining.forEach(function (id) { remaining[id] = true; });
    graph.edges.forEach(function (edge) {
      var a = idx.byId[edge[0]];
      var b = idx.byId[edge[1]];
      var bothCritical = critical[a.id] && critical[b.id];
      var bothRemaining = remaining[a.id] && remaining[b.id];
      arrow(
        ctx,
        inner.x + a.x * inner.w,
        inner.y + a.y * inner.h,
        inner.x + b.x * inner.w,
        inner.y + b.y * inner.h,
        bothRemaining ? COLORS.rose : bothCritical ? COLORS.amber : "#a8b3bd",
        bothCritical || bothRemaining ? 2.2 : 1.2
      );
    });
    graph.nodes.forEach(function (n) {
      var x = inner.x + n.x * inner.w;
      var y = inner.y + n.y * inner.h;
      var fill = critical[n.id] ? "#fff7ed" : COLORS.white;
      var stroke = critical[n.id] ? COLORS.amber : COLORS.rule;
      if (remaining[n.id]) {
        fill = "#fff1f2";
        stroke = COLORS.rose;
      }
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = critical[n.id] || remaining[n.id] ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(x - 32, y - 20, 64, 40, 8);
      ctx.fill();
      ctx.stroke();
      text(ctx, n.label, x, y - 5, COLORS.text, 11, 750, "center");
      text(ctx, n.duration + "u", x, y + 10, COLORS.muted, 10, 650, "center");
    });
  }

  function drawGantt(ctx, box, result) {
    var sched = result.schedule;
    panel(ctx, box, "worker schedule", sched ? "nonpreemptive list scheduling from the ready set" : "no schedule because the graph is cyclic");
    if (!sched) {
      text(ctx, "remaining: " + result.topo.remaining.join(", "), box.x + 18, box.y + 82, COLORS.rose, 12, 700);
      text(ctx, "Kahn's queue is empty, but unfinished edges remain.", box.x + 18, box.y + 108, COLORS.muted, 11, 560);
      return;
    }
    var plot = { x: box.x + 54, y: box.y + 70, w: box.w - 74, h: box.h - 104 };
    var rowH = Math.max(24, Math.min(40, plot.h / result.params.workers - 8));
    var maxT = Math.max(sched.makespan, result.lowerBound);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var t = 0; t <= maxT; t += 2) {
      var gx = plot.x + (t / maxT) * plot.w;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y - 14);
      ctx.lineTo(gx, plot.y + result.params.workers * (rowH + 8));
      ctx.stroke();
      text(ctx, String(t), gx, plot.y - 26, COLORS.muted, 9, 560, "center");
    }
    var palette = [COLORS.blue, COLORS.teal, COLORS.amber, COLORS.violet, "#0e7490", "#db2777", "#16a34a"];
    result.graph.nodes.forEach(function (n, i) { n.color = palette[i % palette.length]; });
    var colorById = {};
    result.graph.nodes.forEach(function (n) { colorById[n.id] = n.color; });
    for (var w = 0; w < result.params.workers; w += 1) {
      var y = plot.y + w * (rowH + 8);
      text(ctx, "w" + (w + 1), box.x + 16, y + rowH / 2, COLORS.muted, 10, 700);
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.roundRect(plot.x, y, plot.w, rowH, 6);
      ctx.fill();
      ctx.stroke();
    }
    sched.segments.forEach(function (seg) {
      var y = plot.y + seg.worker * (rowH + 8);
      var x = plot.x + (seg.start / maxT) * plot.w;
      var w = Math.max(2, ((seg.end - seg.start) / maxT) * plot.w);
      ctx.fillStyle = colorById[seg.id] || COLORS.blue;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 2, Math.max(2, w - 2), rowH - 4, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (w > 32) text(ctx, seg.id, x + w / 2, y + rowH / 2, COLORS.white, 10, 760, "center");
    });
    var lbx = plot.x + (result.lowerBound / maxT) * plot.w;
    ctx.strokeStyle = COLORS.rose;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(lbx, plot.y - 12);
    ctx.lineTo(lbx, plot.y + result.params.workers * (rowH + 8) - 8);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "lower bound " + fmt(result.lowerBound), lbx + 4, box.y + box.h - 18, COLORS.rose, 10, 700);
    text(ctx, "makespan " + fmt(sched.makespan), box.x + box.w - 16, box.y + box.h - 18, COLORS.text, 11, 760, "right");
  }

  function drawTrace(ctx, box, result) {
    panel(ctx, box, "ready queue trace", "each selected task had zero remaining prerequisites");
    var y = box.y + 66;
    var rows = result.topo.steps.slice(0, Math.min(7, result.topo.steps.length));
    rows.forEach(function (step, i) {
      ctx.fillStyle = i % 2 ? COLORS.white : "#eef6f5";
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.roundRect(box.x + 14, y - 14, box.w - 28, 28, 6);
      ctx.fill();
      ctx.stroke();
      text(ctx, String(i + 1), box.x + 26, y, COLORS.muted, 10, 700);
      text(ctx, step.selected, box.x + 48, y, COLORS.text, 11, 760);
      var ready = step.ready.join(", ");
      if (ready.length > 23) ready = ready.slice(0, 22) + "...";
      text(ctx, "ready: " + ready, box.x + 104, y, COLORS.muted, 10, 560);
      y += 34;
    });
    if (result.topo.steps.length > rows.length) {
      text(ctx, "+" + (result.topo.steps.length - rows.length) + " more selections", box.x + 18, y + 2, COLORS.muted, 10, 650);
    }
    if (!result.topo.acyclic) {
      text(ctx, "queue empty; unfinished: " + result.topo.remaining.join(", "), box.x + 18, box.y + box.h - 28, COLORS.rose, 10.5, 720);
    } else {
      text(ctx, "order: " + result.topo.order.join(" -> "), box.x + 18, box.y + box.h - 28, COLORS.good, 10.5, 720);
    }
  }

  function drawAudit(ctx, box, result) {
    panel(ctx, box, "audit", "proof obligations checked in the same code that draws");
    var rows = [
      ["selected indegree zero", result.audit.selectedZero],
      ["edges respect order", result.audit.edgeOrder],
      ["schedule respects deps", result.audit.scheduleRespectsDeps],
      ["cycle residual valid", result.audit.noZeroLeftInCycle],
      ["lower bounds respected", result.audit.workBound && result.audit.criticalBound]
    ];
    var y = box.y + 66;
    rows.forEach(function (row) {
      var ok = row[1];
      ctx.fillStyle = ok ? "rgba(15, 118, 110, 0.11)" : "rgba(190, 18, 60, 0.10)";
      ctx.strokeStyle = ok ? "rgba(15, 118, 110, 0.28)" : "rgba(190, 18, 60, 0.28)";
      ctx.beginPath();
      ctx.roundRect(box.x + 14, y - 13, box.w - 28, 26, 6);
      ctx.fill();
      ctx.stroke();
      text(ctx, row[0], box.x + 26, y, COLORS.text, 10.5, 650);
      text(ctx, ok ? "pass" : "fail", box.x + box.w - 26, y, ok ? COLORS.good : COLORS.bad, 10.5, 760, "right");
      y += 32;
    });
    var cp = result.criticalPath.path.length ? result.criticalPath.path.join(" -> ") : "none";
    if (cp.length > 32) cp = cp.slice(0, 31) + "...";
    text(ctx, "critical path: " + cp, box.x + 18, box.y + box.h - 28, COLORS.amber, 10.5, 720);
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    if (width < 660) {
      var pad = 14;
      var gap = 14;
      var h = (height - pad * 2 - gap * 3) / 4;
      drawGraph(ctx, { x: pad, y: pad, w: width - pad * 2, h: h }, result);
      drawGantt(ctx, { x: pad, y: pad + h + gap, w: width - pad * 2, h: h }, result);
      drawTrace(ctx, { x: pad, y: pad + 2 * (h + gap), w: width - pad * 2, h: h }, result);
      drawAudit(ctx, { x: pad, y: pad + 3 * (h + gap), w: width - pad * 2, h: h }, result);
      return;
    }

    var outer = 16;
    var gap2 = 14;
    var leftW = Math.round(width * 0.58);
    var rightW = width - outer * 2 - gap2 - leftW;
    var topH = Math.round((height - outer * 2 - gap2) * 0.58);
    var bottomH = height - outer * 2 - gap2 - topH;
    drawGraph(ctx, { x: outer, y: outer, w: leftW, h: topH }, result);
    drawGantt(ctx, { x: outer, y: outer + topH + gap2, w: leftW, h: bottomH }, result);
    drawTrace(ctx, { x: outer + leftW + gap2, y: outer, w: rightW, h: topH }, result);
    drawAudit(ctx, { x: outer + leftW + gap2, y: outer + topH + gap2, w: rightW, h: bottomH }, result);
  }

  function fmt(value) {
    if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
    return value.toFixed(1);
  }

  function metric(label, value, tone) {
    return '<div class="topo-lab__metric topo-lab__metric--' + (tone || "plain") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function updateOutputs(root, result) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (out) {
      var key = out.getAttribute("data-value");
      if (key === "scenario") out.textContent = result.graph.label;
      if (key === "rule") out.textContent = RULES[result.params.rule];
      if (key === "workers") out.textContent = String(result.params.workers);
    });
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    if (!result.topo.acyclic) {
      holder.innerHTML = [
        metric("topological order", "rejected", "bad"),
        metric("emitted", result.topo.order.length + " / " + result.graph.nodes.length),
        metric("remaining", result.topo.remaining.length),
        metric("audit", result.audit.passed ? "pass" : "fail", result.audit.passed ? "good" : "bad")
      ].join("");
      return;
    }
    var idle = result.schedule.makespan * result.params.workers - result.totalWork;
    holder.innerHTML = [
      metric("makespan", fmt(result.schedule.makespan)),
      metric("critical path", fmt(result.criticalPath.length), "warn"),
      metric("work / workers", fmt(result.totalWork / result.params.workers)),
      metric("idle capacity", fmt(idle)),
      metric("topological order", "valid", "good"),
      metric("audit", result.audit.passed ? "pass" : "fail", result.audit.passed ? "good" : "bad")
    ].join("");
  }

  function readControls(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return normalize(raw);
  }

  function init(root) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var pending = false;

    function render() {
      pending = false;
      var params = readControls(root);
      var result = evaluate(params);
      root.__topologicalReadyResult = result;
      updateOutputs(root, result);
      draw(result, canvas);
    }

    function scheduleRender() {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(render);
    }

    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", scheduleRender);
      input.addEventListener("change", scheduleRender);
    });
    global.addEventListener("resize", scheduleRender);
    render();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-topological-ready-lab]")).forEach(init);
  }

  var api = {
    auditTopologicalReadyLab: auditTopologicalReadyLab,
    evaluate: evaluate,
    normalize: normalize,
    schedule: schedule,
    topologicalPass: topologicalPass
  };

  global.TopologicalReadyLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
