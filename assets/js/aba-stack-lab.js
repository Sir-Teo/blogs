(function (root) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    grid: "#eef2f5",
    good: "#0f766e",
    bad: "#be123c",
    warn: "#b45309",
    tag: "#2563eb",
    hp: "#7c3aed",
    both: "#0f766e",
    pointer: "#be123c",
    t1: "#2563eb",
    t2: "#d97706",
    retired: "#fca5a5"
  };

  var ADDR = {
    A: "0xA0",
    B: "0xB0",
    C: "0xC0",
    D: "0xD0"
  };

  var SCENARIOS = {
    recycle: {
      label: "allocator reuses A",
      short: "address reuse",
      detail: "T2 retires A, then the allocator gives the same address to a new node D.",
      returnedName: "D"
    },
    same: {
      label: "same A returns",
      short: "logical ABA",
      detail: "T2 removes A, removes B, then puts the original A node back on top.",
      returnedName: "A"
    },
    fresh: {
      label: "fresh D returns",
      short: "no address ABA",
      detail: "T2 removes A and B, then pushes a fresh node whose address is not A.",
      returnedName: "D"
    }
  };

  var LANES = [
    {
      id: "pointer",
      label: "Pointer-only CAS",
      short: "pointer",
      tagged: false,
      hazard: false,
      color: COLORS.pointer
    },
    {
      id: "tagged",
      label: "Tagged head",
      short: "tag",
      tagged: true,
      hazard: false,
      color: COLORS.tag
    },
    {
      id: "hazard",
      label: "Hazard pointer",
      short: "HP",
      tagged: false,
      hazard: true,
      color: COLORS.hp
    },
    {
      id: "both",
      label: "Tag + hazard",
      short: "both",
      tagged: true,
      hazard: true,
      color: COLORS.both
    }
  ];

  var DEFAULTS = {
    scenario: "recycle"
  };

  var AUDIT_CACHE = null;

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = String(raw.scenario || DEFAULTS.scenario);
    if (!Object.prototype.hasOwnProperty.call(SCENARIOS, scenario)) scenario = DEFAULTS.scenario;
    return { scenario: scenario };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function node(addr, name, next, generation) {
    return {
      addr: addr,
      name: name,
      next: next || null,
      generation: generation || 1,
      retired: false
    };
  }

  function initialModel() {
    var nodes = {};
    nodes[ADDR.A] = node(ADDR.A, "A", ADDR.B, 1);
    nodes[ADDR.B] = node(ADDR.B, "B", ADDR.C, 1);
    nodes[ADDR.C] = node(ADDR.C, "C", null, 1);
    return {
      nodes: nodes,
      head: { addr: ADDR.A, tag: 0 },
      hazards: {},
      events: [],
      retiredLog: []
    };
  }

  function addrName(model, addr) {
    if (!addr) return "null";
    var n = model.nodes[addr];
    if (!n) return addr;
    return n.name + "@" + addr;
  }

  function tagLabel(head) {
    return (head.addr || "null") + ", v" + head.tag;
  }

  function event(model, actor, label, detail, kind) {
    model.events.push({
      actor: actor,
      label: label,
      detail: detail || "",
      kind: kind || actor
    });
  }

  function moveHead(model, addr) {
    model.head = {
      addr: addr || null,
      tag: model.head.tag + 1
    };
  }

  function popTop(model, label) {
    var addr = model.head.addr;
    if (!addr) {
      event(model, "T2", label + " sees empty", "no pop", "t2");
      return null;
    }
    var top = model.nodes[addr];
    moveHead(model, top.next);
    top.retired = true;
    model.retiredLog.push(addr);
    event(model, "T2", label, "head becomes " + addrName(model, model.head.addr) + " (v" + model.head.tag + ")", "t2");
    return addr;
  }

  function publishHazard(model, addr) {
    model.hazards.T1 = addr;
    event(model, "T1", "publish HP(A)", "T1 announces " + addr + " before using A->next", "hp");
  }

  function stackSnapshot(model) {
    var seen = {};
    var nodes = [];
    var problems = [];
    var addr = model.head.addr;
    var guard = 0;

    while (addr && guard < 12) {
      guard += 1;
      if (seen[addr]) {
        problems.push("cycle at " + addr);
        break;
      }
      seen[addr] = true;
      if (!model.nodes[addr]) {
        problems.push("head reaches missing " + addr);
        nodes.push({ addr: addr, name: "?", next: null, retired: true, missing: true });
        break;
      }
      nodes.push(clone(model.nodes[addr]));
      if (model.nodes[addr].retired) problems.push("reachable retired " + model.nodes[addr].name);
      addr = model.nodes[addr].next;
    }

    if (guard >= 12) problems.push("walk did not terminate");

    Object.keys(model.nodes).forEach(function (key) {
      var n = model.nodes[key];
      if (!n.retired && !seen[key]) problems.push("live " + n.name + " is unreachable");
    });

    return {
      head: clone(model.head),
      nodes: nodes,
      problems: problems,
      ok: problems.length === 0
    };
  }

  function pushFreshD(model) {
    model.nodes[ADDR.D] = node(ADDR.D, "D", model.head.addr, 1);
    moveHead(model, ADDR.D);
    event(model, "T2", "push fresh D", "head is D@0xD0 (v" + model.head.tag + ")", "t2");
    return {
      reusedAddress: false,
      reuseBlocked: false,
      returnedAddr: ADDR.D
    };
  }

  function pushRecycledD(model, lane) {
    if (lane.hazard && model.hazards.T1 === ADDR.A) {
      model.nodes[ADDR.D] = node(ADDR.D, "D", model.head.addr, 1);
      moveHead(model, ADDR.D);
      event(model, "T2", "reuse blocked", "A is hazardous, so D gets fresh 0xD0", "hp");
      return {
        reusedAddress: false,
        reuseBlocked: true,
        returnedAddr: ADDR.D
      };
    }
    model.nodes[ADDR.A] = node(ADDR.A, "D", model.head.addr, 2);
    moveHead(model, ADDR.A);
    event(model, "T2", "reuse A as D", "new D occupies 0xA0; head address is A again (v" + model.head.tag + ")", "t2");
    return {
      reusedAddress: true,
      reuseBlocked: false,
      returnedAddr: ADDR.A
    };
  }

  function pushSameA(model, lane) {
    var top = model.nodes[ADDR.A] || node(ADDR.A, "A", null, 1);
    top.name = "A";
    top.next = model.head.addr;
    top.retired = false;
    model.nodes[ADDR.A] = top;
    moveHead(model, ADDR.A);
    event(
      model,
      "T2",
      "push same A",
      lane.hazard ? "memory is protected, but the address still came back" : "head address is A again (v" + model.head.tag + ")",
      lane.hazard ? "warn" : "t2"
    );
    return {
      reusedAddress: true,
      reuseBlocked: false,
      returnedAddr: ADDR.A,
      logicalAba: true
    };
  }

  function applyReturnScenario(model, params, lane) {
    if (params.scenario === "fresh") return pushFreshD(model);
    if (params.scenario === "same") return pushSameA(model, lane);
    return pushRecycledD(model, lane);
  }

  function validateProtectedRead(model, lane, expected) {
    if (!lane.hazard) return true;
    var stillHead = model.head.addr === expected.addr;
    event(
      model,
      "T1",
      "validate HP",
      stillHead ? "A was still head, so A->next is read" : "head changed; retry would begin",
      stillHead ? "hp" : "warn"
    );
    return stillHead;
  }

  function compareForLane(lane, current, expected) {
    if (!lane.tagged) {
      return {
        matches: current.addr === expected.addr,
        expected: expected.addr,
        current: current.addr || "null"
      };
    }
    return {
      matches: current.addr === expected.addr && current.tag === expected.tag,
      expected: tagLabel(expected),
      current: tagLabel(current)
    };
  }

  function verdictFor(lane, params, casSucceeded, finalSnapshot, t2Action) {
    if (casSucceeded && !finalSnapshot.ok) {
      return {
        key: "corrupt",
        label: "corrupt",
        color: COLORS.bad,
        detail: "CAS succeeded on stale evidence and the final stack is not a valid live list."
      };
    }
    if (!casSucceeded) {
      return {
        key: "rejected",
        label: "rejected",
        color: lane.tagged ? COLORS.tag : COLORS.good,
        detail: lane.tagged ? "The version changed even though the address matched." : "The head address no longer matched T1's old pointer."
      };
    }
    if (finalSnapshot.ok) {
      return {
        key: "ok",
        label: "safe",
        color: COLORS.good,
        detail: "CAS succeeded and the reachable stack still contains exactly the live nodes."
      };
    }
    if (t2Action && t2Action.reuseBlocked) {
      return {
        key: "blocked",
        label: "blocked",
        color: COLORS.good,
        detail: "The hazard pointer delayed reuse of the protected address."
      };
    }
    return {
      key: "unknown",
      label: "check",
      color: COLORS.warn,
      detail: "The model reached an unexpected state."
    };
  }

  function simulateLane(rawParams, lane) {
    var params = cleanParams(rawParams);
    var model = initialModel();
    var expected = {
      addr: ADDR.A,
      tag: 0,
      next: ADDR.B
    };

    event(model, "T1", "read head", "old = A@0xA0, version v0", "t1");
    if (lane.hazard) publishHazard(model, ADDR.A);
    validateProtectedRead(model, lane, expected);
    event(model, "T1", "read A->next", "next = B@0xB0, then T1 pauses", "t1");

    popTop(model, "pop A");
    popTop(model, "pop B");
    var t2Action = applyReturnScenario(model, params, lane);
    var beforeCas = stackSnapshot(model);

    var comparison = compareForLane(lane, model.head, expected);
    var casSucceeded = comparison.matches;
    if (casSucceeded) {
      event(model, "T1", "CAS succeeds", "head := stale next B@0xB0", lane.tagged ? "tag" : "bad");
      moveHead(model, expected.next);
    } else {
      event(model, "T1", "CAS fails", "expected " + comparison.expected + ", saw " + comparison.current, lane.tagged ? "tag" : "good");
    }

    var finalSnapshot = stackSnapshot(model);
    var verdict = verdictFor(lane, params, casSucceeded, finalSnapshot, t2Action);

    if (params.scenario === "same" && lane.hazard && !lane.tagged) {
      verdict.detail = "The node is memory-safe, but a same-node return can still fool a pointer-only comparison.";
    }

    return {
      lane: clone(lane),
      params: params,
      expected: expected,
      beforeCas: beforeCas,
      final: finalSnapshot,
      comparison: comparison,
      casSucceeded: casSucceeded,
      t2Action: t2Action,
      verdict: verdict,
      events: model.events
    };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var lanes = LANES.map(function (lane) {
      return simulateLane(params, lane);
    });
    return {
      params: params,
      scenario: SCENARIOS[params.scenario],
      lanes: lanes
    };
  }

  function round(value, places) {
    var scale = Math.pow(10, places == null ? 3 : places);
    var out = Math.round(value * scale) / scale;
    return Object.is(out, -0) ? 0 : out;
  }

  function roundedFacts(result) {
    var pointer = laneById(result, "pointer");
    var tagged = laneById(result, "tagged");
    var hazard = laneById(result, "hazard");
    var both = laneById(result, "both");
    return {
      scenario: result.params.scenario,
      pointerCas: pointer.casSucceeded ? "success" : "fail",
      pointerVerdict: pointer.verdict.label,
      taggedCas: tagged.casSucceeded ? "success" : "fail",
      taggedVerdict: tagged.verdict.label,
      hazardCas: hazard.casSucceeded ? "success" : "fail",
      hazardVerdict: hazard.verdict.label,
      bothVerdict: both.verdict.label,
      taggedHeadBeforeCas: tagged.beforeCas.head.tag,
      pointerProblems: pointer.final.problems.length
    };
  }

  function laneById(result, id) {
    for (var i = 0; i < result.lanes.length; i += 1) {
      if (result.lanes[i].lane.id === id) return result.lanes[i];
    }
    return null;
  }

  function runAudit() {
    if (AUDIT_CACHE) return AUDIT_CACHE;
    var failures = [];
    function record(name, ok) {
      if (!ok) failures.push(name);
    }

    var recycle = evaluate({ scenario: "recycle" });
    var recyclePointer = laneById(recycle, "pointer");
    var recycleTagged = laneById(recycle, "tagged");
    var recycleHazard = laneById(recycle, "hazard");
    var recycleBoth = laneById(recycle, "both");
    record("pointer-only recycled address corrupts", recyclePointer.casSucceeded && !recyclePointer.final.ok);
    record("pointer-only final head is stale B", recyclePointer.final.head.addr === ADDR.B);
    record("tagged recycled address rejects stale CAS", !recycleTagged.casSucceeded && recycleTagged.final.ok);
    record("tagged head version advanced", recycleTagged.beforeCas.head.tag === 3);
    record("hazard pointer blocks recycled address", recycleHazard.t2Action.reuseBlocked && !recycleHazard.casSucceeded);
    record("tag plus hazard safe", !recycleBoth.casSucceeded && recycleBoth.final.ok);

    var same = evaluate({ scenario: "same" });
    var samePointer = laneById(same, "pointer");
    var sameHazard = laneById(same, "hazard");
    var sameTagged = laneById(same, "tagged");
    record("same-node pointer-only ABA corrupts", samePointer.casSucceeded && !samePointer.final.ok);
    record("same-node hazard alone does not distinguish history", sameHazard.casSucceeded && !sameHazard.final.ok);
    record("same-node tag rejects stale CAS", !sameTagged.casSucceeded && sameTagged.final.ok);

    var fresh = evaluate({ scenario: "fresh" });
    record("fresh top makes pointer CAS fail", !laneById(fresh, "pointer").casSucceeded);
    record("fresh scenario stays valid", fresh.lanes.every(function (lane) { return lane.final.ok; }));

    var bad = evaluate({ scenario: "bogus" });
    record("bad scenario sanitizes to recycle", bad.params.scenario === "recycle");

    var facts = roundedFacts(recycle);
    record("facts are finite or strings", Object.keys(facts).every(function (key) {
      return typeof facts[key] === "string" || Number.isFinite(facts[key]);
    }));
    record("lane count stable", recycle.lanes.length === 4);
    record("events include both actors", recyclePointer.events.some(function (e) { return e.actor === "T1"; }) && recyclePointer.events.some(function (e) { return e.actor === "T2"; }));

    AUDIT_CACHE = {
      passed: 15 - failures.length,
      checked: 15,
      failures: failures,
      defaultFacts: facts
    };
    return AUDIT_CACHE;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[ch];
    });
  }

  function option(value, label, selected) {
    return '<option value="' + escapeHtml(value) + '"' + (selected ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }

  function metric(label, value) {
    return '<div class="aba-lab__metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function mount(el) {
    var state = cleanParams({
      scenario: el.getAttribute("data-scenario") || DEFAULTS.scenario
    });

    el.innerHTML = [
      '<div class="aba-lab__controls">',
      '<label><span>What comes back on top</span><select data-role="scenario">',
      option("recycle", "allocator reuses A", state.scenario === "recycle"),
      option("same", "same A node returns", state.scenario === "same"),
      option("fresh", "fresh D node returns", state.scenario === "fresh"),
      '</select></label>',
      '</div>',
      '<p class="aba-lab__summary" data-role="summary"></p>',
      '<div class="aba-lab__metrics" data-role="metrics"></div>',
      '<canvas class="aba-lab__canvas" data-role="canvas" aria-label="ABA stack simulator comparing pointer-only CAS, tagged heads, hazard pointers, and their combination"></canvas>',
      '<div class="aba-lab__legend" data-role="legend"></div>'
    ].join("");

    function read() {
      state = cleanParams({
        scenario: el.querySelector('[data-role="scenario"]').value
      });
    }

    function update() {
      read();
      var result = evaluate(state);
      renderSummary(el.querySelector('[data-role="summary"]'), result);
      renderMetrics(el.querySelector('[data-role="metrics"]'), result);
      renderCanvas(el.querySelector('[data-role="canvas"]'), result);
      renderLegend(el.querySelector('[data-role="legend"]'), result);
    }

    Array.prototype.slice.call(el.querySelectorAll("select")).forEach(function (input) {
      input.addEventListener("change", update);
      input.addEventListener("input", update);
    });
    if (root.addEventListener) root.addEventListener("resize", update);
    update();
  }

  function renderSummary(target, result) {
    if (!target) return;
    target.textContent = result.scenario.detail;
  }

  function renderMetrics(target, result) {
    if (!target) return;
    var facts = roundedFacts(result);
    var audit = runAudit();
    target.innerHTML = [
      metric("scenario", SCENARIOS[facts.scenario].short),
      metric("pointer CAS", facts.pointerCas + " / " + facts.pointerVerdict),
      metric("tagged CAS", facts.taggedCas + " / " + facts.taggedVerdict),
      metric("hazard CAS", facts.hazardCas + " / " + facts.hazardVerdict),
      metric("version before CAS", "v" + facts.taggedHeadBeforeCas),
      metric("audit", audit.passed + "/" + audit.checked)
    ].join("");
  }

  function renderLegend(target, result) {
    if (!target) return;
    var pointer = laneById(result, "pointer");
    var tags = laneById(result, "tagged");
    var hazard = laneById(result, "hazard");
    target.innerHTML = [
      '<span><i class="is-pointer"></i> pointer compare: ' + escapeHtml(pointer.verdict.label) + '</span>',
      '<span><i class="is-tag"></i> tag compare: ' + escapeHtml(tags.verdict.label) + '</span>',
      '<span><i class="is-hp"></i> hazard pointer: ' + escapeHtml(hazard.t2Action.reuseBlocked ? "reuse delayed" : "no reuse delay") + '</span>',
      '<span><i class="is-good"></i> valid live stack</span>',
      '<span><i class="is-bad"></i> stale CAS corruption</span>'
    ].join("");
  }

  function resizeCanvas(canvas, cssHeight) {
    var dpr = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.floor(canvas.getBoundingClientRect().width || canvas.parentNode.clientWidth || 760));
    var height = cssHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
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

  function clear(ctx, width, height) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    drawRoundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText(title, x + 12, y + 20);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, sans-serif";
      wrapText(ctx, subtitle, x + 12, y + 38, w - 24, 14, 2);
    }
  }

  function drawTimeline(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "The paused pop", "T1 reads A and A->next, then T2 makes the head address leave and maybe come back.");
    var pointerLane = laneById(result, "pointer");
    var events = pointerLane.events;
    var left = x + 68;
    var right = x + w - 18;
    var top = y + 64;
    var rowGap = 46;
    var step = (right - left) / Math.max(1, events.length - 1);
    var rows = { T1: top, T2: top + rowGap };

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ["T1", "T2"].forEach(function (actor) {
      ctx.fillStyle = actor === "T1" ? COLORS.t1 : COLORS.t2;
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.fillText(actor, x + 18, rows[actor] + 4);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(left, rows[actor]);
      ctx.lineTo(right, rows[actor]);
      ctx.stroke();
    });

    events.forEach(function (ev, i) {
      var px = left + step * i;
      var py = rows[ev.actor];
      var color = ev.kind === "bad" ? COLORS.bad : ev.kind === "hp" ? COLORS.hp : ev.kind === "tag" ? COLORS.tag : ev.kind === "warn" ? COLORS.warn : ev.actor === "T1" ? COLORS.t1 : COLORS.t2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + (ev.actor === "T1" ? -12 : 12));
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.font = "700 10px system-ui, sans-serif";
      var labelY = py + (ev.actor === "T1" ? -18 : 25);
      ctx.save();
      ctx.translate(px, labelY);
      ctx.rotate(-0.18);
      ctx.fillText(ev.label, -Math.min(44, ctx.measureText(ev.label).width / 2), 0);
      ctx.restore();
    });
  }

  function drawLaneGrid(ctx, result, x, y, w, h) {
    var compact = w < 620;
    var gap = 12;
    var cols = compact ? 1 : 2;
    var rows = compact ? 4 : 2;
    var cardW = (w - gap * (cols - 1)) / cols;
    var cardH = (h - gap * (rows - 1)) / rows;
    result.lanes.forEach(function (laneResult, index) {
      var col = index % cols;
      var row = Math.floor(index / cols);
      drawLaneCard(ctx, laneResult, x + col * (cardW + gap), y + row * (cardH + gap), cardW, cardH, compact);
    });
  }

  function drawLaneCard(ctx, result, x, y, w, h, compact) {
    panel(ctx, x, y, w, h, result.lane.label, result.verdict.detail);
    ctx.fillStyle = result.verdict.color;
    drawRoundRect(ctx, x + w - 92, y + 12, 76, 24, 6);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 11px system-ui, sans-serif";
    ctx.fillText(result.verdict.label, x + w - 80, y + 28);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    var compare = "CAS " + (result.casSucceeded ? "ok" : "fail") + ": " + result.comparison.current;
    ctx.fillText(compare, x + 12, y + 67);
    ctx.fillText("expected " + result.comparison.expected, x + 12, y + 83);

    var stackTop = compact ? y + 102 : y + 104;
    drawStack(ctx, result.beforeCas, x + 12, stackTop, w - 24, "before T1 resumes");
    drawStack(ctx, result.final, x + 12, stackTop + (compact ? 72 : 78), w - 24, "after T1 CAS");

    if (result.final.problems.length) {
      ctx.fillStyle = COLORS.bad;
      ctx.font = "700 10px system-ui, sans-serif";
      wrapText(ctx, result.final.problems.slice(0, 2).join("; "), x + 12, y + h - 29, w - 24, 13, 2);
    } else {
      ctx.fillStyle = COLORS.good;
      ctx.font = "700 10px system-ui, sans-serif";
      ctx.fillText("live nodes reachable exactly once", x + 12, y + h - 17);
    }
  }

  function drawStack(ctx, snapshot, x, y, w, label) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "700 10px system-ui, sans-serif";
    ctx.fillText(label + "  head v" + snapshot.head.tag, x, y);
    var nodes = snapshot.nodes.slice(0, 4);
    if (!nodes.length) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("empty", x, y + 28);
      return;
    }
    var gap = 8;
    var boxW = Math.max(44, Math.min(74, (w - gap * (nodes.length - 1)) / Math.max(1, nodes.length)));
    var boxH = 34;
    nodes.forEach(function (n, i) {
      var bx = x + i * (boxW + gap);
      var by = y + 13;
      ctx.fillStyle = n.retired || n.missing ? "#fff1f2" : "#ffffff";
      drawRoundRect(ctx, bx, by, boxW, boxH, 6);
      ctx.fill();
      ctx.strokeStyle = n.retired || n.missing ? COLORS.bad : COLORS.rule;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = n.retired || n.missing ? COLORS.bad : COLORS.ink;
      ctx.font = "800 11px system-ui, sans-serif";
      ctx.fillText(n.name, bx + 8, by + 15);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(n.addr, bx + 8, by + 29);
      if (i < nodes.length - 1) {
        ctx.strokeStyle = COLORS.muted;
        ctx.beginPath();
        ctx.moveTo(bx + boxW + 2, by + boxH / 2);
        ctx.lineTo(bx + boxW + gap - 2, by + boxH / 2);
        ctx.stroke();
      }
    });
  }

  function drawTakeaway(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "What the comparison forgot", "CAS compared the visible word, not the history that made the word visible again.");
    var facts = roundedFacts(result);
    var lines = [
      "Pointer-only CAS in this scenario: " + facts.pointerCas + " / " + facts.pointerVerdict + ".",
      "The tagged head has version v" + facts.taggedHeadBeforeCas + " before T1 resumes, so the old (0xA0, v0) snapshot is stale.",
      "A hazard pointer is a memory-reclamation promise: do not recycle the protected address while T1 may still use it.",
      result.params.scenario === "same" ? "If the exact same node is allowed to leave and return, a tag still matters." : "If the address returns only through allocator reuse, the hazard pointer can keep it from returning."
    ];
    ctx.fillStyle = COLORS.ink;
    ctx.font = "12px system-ui, sans-serif";
    for (var i = 0; i < lines.length; i += 1) {
      wrapText(ctx, lines[i], x + 14, y + 54 + i * 36, w - 28, 16, 2);
    }
  }

  function renderCanvas(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var width = Math.max(320, Math.floor(canvas.getBoundingClientRect().width || 760));
    var compact = width < 620;
    var cssHeight = compact ? 1080 : 760;
    var surface = resizeCanvas(canvas, cssHeight);
    var ctx = surface.ctx;
    var w = surface.width;
    var h = surface.height;
    clear(ctx, w, h);
    var pad = 14;
    drawTimeline(ctx, result, pad, 14, w - pad * 2, compact ? 190 : 170);
    drawLaneGrid(ctx, result, pad, compact ? 220 : 204, w - pad * 2, compact ? 700 : 390);
    drawTakeaway(ctx, result, pad, compact ? 940 : 612, w - pad * 2, compact ? 124 : 130);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/\s+/);
    var line = "";
    var lines = 0;
    for (var i = 0; i < words.length; i += 1) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        lines += 1;
        line = words[i];
        if (lines >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y);
  }

  function init() {
    var nodes = root.document ? root.document.querySelectorAll("[data-aba-stack-lab]") : [];
    for (var i = 0; i < nodes.length; i += 1) mount(nodes[i]);
  }

  var api = {
    evaluate: evaluate,
    simulateLane: simulateLane,
    runAudit: runAudit,
    roundedFacts: roundedFacts,
    lanes: LANES,
    scenarios: SCENARIOS
  };

  root.AbaStackLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
