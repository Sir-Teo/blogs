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
    rose: "#be123c",
    violet: "#7c3aed",
    amber: "#d97706",
    white: "#ffffff"
  };

  var SCENARIOS = {
    jagged: {
      label: "jagged telemetry",
      values: [42, 35, 37, 31, 49, 33, 28, 30, 45, 29, 27, 34]
    },
    plateau: {
      label: "duplicate minima",
      values: [7, 3, 3, 5, 2, 6, 2, 4, 2, 8, 5, 3]
    },
    valley: {
      label: "wide valley",
      values: [9, 8, 7, 5, 6, 4, 6, 5, 7, 3, 8, 10]
    },
    saw: {
      label: "sawtooth",
      values: [6, 2, 9, 3, 8, 1, 7, 4, 10, 5, 11, 0]
    }
  };

  var DEFAULTS = {
    end: 9,
    scenario: "jagged",
    start: 2,
    tie: "left"
  };

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var values = SCENARIOS[scenario].values;
    var tie = raw.tie === "right" ? "right" : "left";
    var start = clamp(Math.round(finite(raw.start, DEFAULTS.start)), 0, values.length - 1);
    var end = clamp(Math.round(finite(raw.end, DEFAULTS.end)), 0, values.length - 1);
    if (start > end) {
      var tmp = start;
      start = end;
      end = tmp;
    }
    return { end: end, scenario: scenario, start: start, tie: tie };
  }

  function better(values, a, b, tie) {
    if (values[a] !== values[b]) return values[a] < values[b];
    return tie === "right" ? a > b : a < b;
  }

  function shouldPop(values, top, current, tie) {
    return tie === "right" ? values[current] <= values[top] : values[current] < values[top];
  }

  function buildCartesian(values, tie) {
    var n = values.length;
    var left = new Array(n).fill(-1);
    var right = new Array(n).fill(-1);
    var parent = new Array(n).fill(-1);
    var stack = [];
    var trace = [];
    var pops = 0;
    var maxStack = 0;

    for (var i = 0; i < n; i += 1) {
      var last = -1;
      var popped = [];
      while (stack.length && shouldPop(values, stack[stack.length - 1], i, tie)) {
        last = stack.pop();
        popped.push(last);
        pops += 1;
      }
      if (stack.length) {
        right[stack[stack.length - 1]] = i;
        parent[i] = stack[stack.length - 1];
      }
      if (last !== -1) {
        left[i] = last;
        parent[last] = i;
      }
      stack.push(i);
      maxStack = Math.max(maxStack, stack.length);
      trace.push({
        attachLeft: last,
        index: i,
        parent: parent[i],
        popped: popped,
        stack: stack.slice()
      });
    }

    var root = parent.indexOf(-1);
    var depth = new Array(n).fill(0);
    function setDepth(id, d) {
      if (id < 0) return;
      depth[id] = d;
      setDepth(left[id], d + 1);
      setDepth(right[id], d + 1);
    }
    setDepth(root, 0);

    return {
      depth: depth,
      height: depth.reduce(function (m, d) { return Math.max(m, d); }, 0) + 1,
      left: left,
      maxStack: maxStack,
      parent: parent,
      pops: pops,
      right: right,
      root: root,
      trace: trace
    };
  }

  function inorder(tree, id, out) {
    if (id < 0) return out;
    inorder(tree, tree.left[id], out);
    out.push(id);
    inorder(tree, tree.right[id], out);
    return out;
  }

  function bruteRmq(values, start, end, tie) {
    var best = start;
    for (var i = start + 1; i <= end; i += 1) {
      if (better(values, i, best, tie)) best = i;
    }
    return best;
  }

  function ancestors(tree, id) {
    var out = [];
    while (id !== -1) {
      out.push(id);
      id = tree.parent[id];
    }
    return out;
  }

  function lca(tree, a, b) {
    var seen = {};
    var x = a;
    while (x !== -1) {
      seen[x] = true;
      x = tree.parent[x];
    }
    x = b;
    while (x !== -1) {
      if (seen[x]) return x;
      x = tree.parent[x];
    }
    return -1;
  }

  function pathToAncestor(tree, from, ancestor) {
    var out = [];
    var x = from;
    while (x !== -1) {
      out.push(x);
      if (x === ancestor) break;
      x = tree.parent[x];
    }
    return out;
  }

  function heapOk(values, tree, tie) {
    for (var i = 0; i < values.length; i += 1) {
      var p = tree.parent[i];
      if (p !== -1 && better(values, i, p, tie)) return false;
    }
    return true;
  }

  function allIntervalsOk(values, tree, tie) {
    for (var i = 0; i < values.length; i += 1) {
      for (var j = i; j < values.length; j += 1) {
        if (bruteRmq(values, i, j, tie) !== lca(tree, i, j)) return false;
      }
    }
    return true;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var scenario = SCENARIOS[params.scenario];
    var values = scenario.values.slice();
    var tree = buildCartesian(values, params.tie);
    var minIndex = bruteRmq(values, params.start, params.end, params.tie);
    var lcaIndex = lca(tree, params.start, params.end);
    var inorderList = inorder(tree, tree.root, []);
    var audit = {
      allIntervals: allIntervalsOk(values, tree, params.tie),
      heap: heapOk(values, tree, params.tie),
      inorder: inorderList.every(function (id, index) { return id === index; }),
      parentCount: tree.parent.filter(function (p) { return p === -1; }).length === 1,
      queryMatches: minIndex === lcaIndex
    };
    audit.passed = audit.allIntervals && audit.heap && audit.inorder && audit.parentCount && audit.queryMatches;
    return {
      audit: audit,
      lcaIndex: lcaIndex,
      minIndex: minIndex,
      params: params,
      path: unique(pathToAncestor(tree, params.start, lcaIndex).concat(pathToAncestor(tree, params.end, lcaIndex))),
      scenario: scenario,
      tree: tree,
      values: values
    };
  }

  function unique(values) {
    var seen = {};
    var out = [];
    values.forEach(function (value) {
      if (!seen[value]) {
        seen[value] = true;
        out.push(value);
      }
    });
    return out;
  }

  function auditCartesianRmqLab() {
    var cases = [];
    Object.keys(SCENARIOS).forEach(function (scenario) {
      ["left", "right"].forEach(function (tie) {
        var result = evaluate({ scenario: scenario, tie: tie, start: 0, end: SCENARIOS[scenario].values.length - 1 });
        var checks = auditChecks(result.audit);
        var failedChecks = failedAuditChecks(checks);
        cases.push({
          caseId: cases.length + 1,
          checks: checks,
          failedChecks: failedChecks,
          height: result.tree.height,
          intervalsChecked: result.values.length * (result.values.length + 1) / 2,
          lcaIndex: result.lcaIndex,
          maxStack: result.tree.maxStack,
          minIndex: result.minIndex,
          passed: result.audit.passed,
          passedChecks: checks.length - failedChecks.length,
          pops: result.tree.pops,
          scenario: scenario,
          tie: tie,
          totalChecks: checks.length,
          value: result.values[result.minIndex]
        });
      });
    });
    var plateauLeft = evaluate({ scenario: "plateau", tie: "left", start: 4, end: 8 });
    var plateauRight = evaluate({ scenario: "plateau", tie: "right", start: 4, end: 8 });
    var single = evaluate({ scenario: "saw", start: 5, end: 5 });
    var edgeCases = [
      edgeAuditRow(cases.length + 1, "plateau left tie", "left-tie-picks-first-duplicate-minimum", plateauLeft.minIndex === 4, plateauLeft.minIndex),
      edgeAuditRow(cases.length + 2, "plateau right tie", "right-tie-picks-last-duplicate-minimum", plateauRight.minIndex === 8, plateauRight.minIndex),
      edgeAuditRow(cases.length + 3, "single point", "single-point-query-is-own-lca", single.minIndex === 5 && single.lcaIndex === 5, single.minIndex)
    ];
    var details = cases.concat(edgeCases);
    var passed = details.filter(function (row) { return row.passed; }).length;
    var passedChecks = details.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = details.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    var errors = [];
    details.forEach(function (row) {
      row.failedChecks.forEach(function (name) {
        var label = row.name || row.scenario + "/" + row.tie;
        errors.push("case " + row.caseId + " " + label + ": " + name);
      });
    });
    return {
      cases: cases,
      details: details,
      edgeCases: edgeCases,
      errors: errors,
      ok: passed === details.length && passedChecks === totalChecks,
      plateauLeft: plateauLeft.minIndex,
      plateauRight: plateauRight.minIndex,
      passed: passed,
      passedChecks: passedChecks,
      scenarios: Object.keys(SCENARIOS).length,
      total: details.length,
      totalChecks: totalChecks
    };
  }

  function auditChecks(audit) {
    return [
      { name: "inorder-equals-array-order", ok: audit.inorder },
      { name: "heap-property", ok: audit.heap },
      { name: "single-root", ok: audit.parentCount },
      { name: "displayed-rmq-equals-lca", ok: audit.queryMatches },
      { name: "all-intervals-match", ok: audit.allIntervals }
    ];
  }

  function failedAuditChecks(checks) {
    return checks.filter(function (check) { return !check.ok; }).map(function (check) { return check.name; });
  }

  function edgeAuditRow(caseId, name, checkName, ok, rmqIndex) {
    var checks = [{ name: checkName, ok: ok }];
    var failedChecks = failedAuditChecks(checks);
    return {
      caseId: caseId,
      checks: checks,
      failedChecks: failedChecks,
      name: name,
      passed: !failedChecks.length,
      passedChecks: checks.length - failedChecks.length,
      rmqIndex: rmqIndex,
      totalChecks: checks.length
    };
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function setupCanvas(canvas) {
    var ratio = global.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.width || 960));
    var height = Math.max(560, Math.round(rect.height || canvas.height || 680));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
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

  function drawArray(ctx, box, result) {
    panel(ctx, box, "array query", "the selected interval asks for the minimum index");
    var values = result.values;
    var max = Math.max.apply(null, values);
    var min = Math.min.apply(null, values);
    var plot = { x: box.x + 18, y: box.y + 62, w: box.w - 36, h: box.h - 92 };
    var barGap = 5;
    var barW = (plot.w - barGap * (values.length - 1)) / values.length;
    for (var i = 0; i < values.length; i += 1) {
      var inRange = i >= result.params.start && i <= result.params.end;
      var isMin = i === result.minIndex;
      var h = (values[i] - min + 1) / (max - min + 1) * (plot.h - 28);
      var x = plot.x + i * (barW + barGap);
      var y = plot.y + plot.h - h - 20;
      ctx.fillStyle = isMin ? COLORS.rose : inRange ? COLORS.blue : "#d9e2ec";
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, 5);
      ctx.fill();
      text(ctx, String(values[i]), x + barW / 2, y - 10, isMin ? COLORS.rose : COLORS.muted, 10, 700, "center");
      text(ctx, String(i), x + barW / 2, plot.y + plot.h - 5, COLORS.muted, 9, 650, "center");
    }
    text(ctx, "RMQ(" + result.params.start + ", " + result.params.end + ") = " + result.minIndex + " with value " + result.values[result.minIndex], box.x + 18, box.y + box.h - 20, COLORS.text, 11, 760);
  }

  function nodePositions(result, box) {
    var positions = {};
    var n = result.values.length;
    var maxDepth = Math.max(1, result.tree.height - 1);
    for (var i = 0; i < n; i += 1) {
      positions[i] = {
        x: box.x + 26 + (box.w - 52) * (i / Math.max(1, n - 1)),
        y: box.y + 66 + (box.h - 100) * (result.tree.depth[i] / maxDepth)
      };
    }
    return positions;
  }

  function drawTree(ctx, box, result) {
    panel(ctx, box, "Cartesian tree", "inorder is array order; heap order is by value");
    var pos = nodePositions(result, box);
    result.values.forEach(function (_, i) {
      [result.tree.left[i], result.tree.right[i]].forEach(function (child) {
        if (child < 0) return;
        ctx.strokeStyle = result.path.indexOf(i) >= 0 && result.path.indexOf(child) >= 0 ? COLORS.rose : COLORS.rule;
        ctx.lineWidth = result.path.indexOf(i) >= 0 && result.path.indexOf(child) >= 0 ? 2.2 : 1.3;
        ctx.beginPath();
        ctx.moveTo(pos[i].x, pos[i].y);
        ctx.lineTo(pos[child].x, pos[child].y);
        ctx.stroke();
      });
    });
    result.values.forEach(function (value, i) {
      var inQuery = i >= result.params.start && i <= result.params.end;
      var isLca = i === result.lcaIndex;
      ctx.fillStyle = isLca ? "#fff1f2" : inQuery ? "#eff6ff" : COLORS.white;
      ctx.strokeStyle = isLca ? COLORS.rose : inQuery ? COLORS.blue : COLORS.rule;
      ctx.lineWidth = isLca ? 2.2 : 1.2;
      ctx.beginPath();
      ctx.roundRect(pos[i].x - 22, pos[i].y - 18, 44, 36, 8);
      ctx.fill();
      ctx.stroke();
      text(ctx, String(i), pos[i].x, pos[i].y - 5, COLORS.text, 10, 760, "center");
      text(ctx, String(value), pos[i].x, pos[i].y + 9, COLORS.muted, 10, 650, "center");
    });
    text(ctx, "LCA(" + result.params.start + ", " + result.params.end + ") = " + result.lcaIndex, box.x + 18, box.y + box.h - 20, result.audit.queryMatches ? COLORS.good : COLORS.bad, 11, 760);
  }

  function drawStack(ctx, box, result) {
    panel(ctx, box, "linear construction", "each element is pushed once and popped at most once");
    var rows = result.tree.trace.slice(0, 8);
    var y = box.y + 66;
    rows.forEach(function (row) {
      ctx.fillStyle = row.index % 2 ? COLORS.white : "#eef6f5";
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.roundRect(box.x + 14, y - 14, box.w - 28, 28, 6);
      ctx.fill();
      ctx.stroke();
      var popText = row.popped.length ? "pop " + row.popped.join(",") : "pop none";
      var stackText = "[" + row.stack.join(",") + "]";
      text(ctx, "i=" + row.index, box.x + 26, y, COLORS.text, 10.5, 760);
      text(ctx, popText, box.x + 74, y, COLORS.muted, 10, 600);
      text(ctx, "stack " + stackText, box.x + 146, y, COLORS.blue, 10, 650);
      y += 32;
    });
    if (result.tree.trace.length > rows.length) {
      text(ctx, "+" + (result.tree.trace.length - rows.length) + " more pushes", box.x + 18, y + 2, COLORS.muted, 10, 650);
    }
    text(ctx, "pops " + result.tree.pops + " / pushes " + result.values.length + ", max stack " + result.tree.maxStack, box.x + 18, box.y + box.h - 22, COLORS.text, 11, 760);
  }

  function drawAudit(ctx, box, result) {
    panel(ctx, box, "audit", "the displayed query is backed by exhaustive interval checks");
    var rows = [
      ["inorder equals array order", result.audit.inorder],
      ["heap property holds", result.audit.heap],
      ["one root", result.audit.parentCount],
      ["displayed RMQ equals LCA", result.audit.queryMatches],
      ["all intervals match", result.audit.allIntervals]
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
    var tie = result.params.tie === "right" ? "rightmost duplicate minima" : "leftmost duplicate minima";
    text(ctx, tie, box.x + 18, box.y + box.h - 22, COLORS.muted, 10.5, 700);
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
      drawArray(ctx, { x: pad, y: pad, w: width - pad * 2, h: h }, result);
      drawTree(ctx, { x: pad, y: pad + h + gap, w: width - pad * 2, h: h }, result);
      drawStack(ctx, { x: pad, y: pad + 2 * (h + gap), w: width - pad * 2, h: h }, result);
      drawAudit(ctx, { x: pad, y: pad + 3 * (h + gap), w: width - pad * 2, h: h }, result);
      return;
    }
    var outer = 16;
    var gap2 = 14;
    var halfW = (width - outer * 2 - gap2) / 2;
    var halfH = (height - outer * 2 - gap2) / 2;
    drawArray(ctx, { x: outer, y: outer, w: halfW, h: halfH }, result);
    drawTree(ctx, { x: outer + halfW + gap2, y: outer, w: halfW, h: halfH }, result);
    drawStack(ctx, { x: outer, y: outer + halfH + gap2, w: halfW, h: halfH }, result);
    drawAudit(ctx, { x: outer + halfW + gap2, y: outer + halfH + gap2, w: halfW, h: halfH }, result);
  }

  function metric(label, value, tone) {
    return '<div class="cart-rmq-lab__metric cart-rmq-lab__metric--' + (tone || "plain") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, result) {
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    holder.innerHTML = [
      metric("RMQ index", String(result.minIndex), "good"),
      metric("LCA index", String(result.lcaIndex), result.audit.queryMatches ? "good" : "bad"),
      metric("minimum value", String(result.values[result.minIndex])),
      metric("tree height", String(result.tree.height)),
      metric("stack pops", String(result.tree.pops)),
      metric("audit", result.audit.passed ? "pass" : "fail", result.audit.passed ? "good" : "bad")
    ].join("");
  }

  function syncControls(root, result) {
    var n = result.values.length;
    root.querySelectorAll('[data-param="start"], [data-param="end"]').forEach(function (input) {
      input.max = String(n - 1);
    });
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "start") output.textContent = String(result.params.start);
      if (key === "end") output.textContent = String(result.params.end);
      if (key === "scenario") output.textContent = result.scenario.label;
    });
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function init(root) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var pending = false;
    function render() {
      pending = false;
      var result = evaluate(readParams(root));
      root.__cartesianRmqResult = result;
      syncControls(root, result);
      renderMetrics(root, result);
      draw(result, canvas);
    }
    function schedule() {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(render);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render();
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-cartesian-rmq-lab]").forEach(init);
  }

  var api = {
    auditCartesianRmqLab: auditCartesianRmqLab,
    buildCartesian: buildCartesian,
    evaluate: evaluate,
    lca: lca,
    bruteRmq: bruteRmq
  };

  global.CartesianRmqLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
