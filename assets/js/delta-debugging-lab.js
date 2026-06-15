(function (root) {
  "use strict";

  var PASS = "PASS";
  var FAIL = "FAIL";
  var UNRESOLVED = "UNRESOLVED";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    pass: "#94a3b8",
    fail: "#0f766e",
    unresolved: "#d97706",
    big: "#2563eb",
    short: "#be123c",
    fixed: "#475569",
    required: "#7c3aed",
    noise: "#e2e8f0",
    hdd: "#0891b2"
  };

  var SCENARIO_ORDER = ["compiler", "forked", "structured"];
  var ORDER_MODES = ["natural", "short-first", "scattered"];

  function tok(id, text, role, group, fixed) {
    return {
      id: id,
      text: text,
      role: role || "noise",
      group: group || null,
      fixed: !!fixed
    };
  }

  function setFrom(items) {
    var out = Object.create(null);
    for (var i = 0; i < items.length; i += 1) out[items[i]] = true;
    return out;
  }

  function hasAll(set, ids) {
    for (var i = 0; i < ids.length; i += 1) {
      if (!set[ids[i]]) return false;
    }
    return true;
  }

  function sortedKey(items) {
    return items.slice().sort().join("|");
  }

  function difference(items, removed) {
    var blocked = setFrom(removed);
    var out = [];
    for (var i = 0; i < items.length; i += 1) {
      if (!blocked[items[i]]) out.push(items[i]);
    }
    return out;
  }

  function split(items, n) {
    var parts = [];
    for (var i = 0; i < n; i += 1) {
      var start = Math.floor(i * items.length / n);
      var end = Math.floor((i + 1) * items.length / n);
      if (start < end) parts.push(items.slice(start, end));
    }
    return parts;
  }

  function pseudoHash(id) {
    var h = 0;
    for (var i = 0; i < id.length; i += 1) h = (h * 33 + id.charCodeAt(i)) >>> 0;
    return h;
  }

  function buildCompilerScenario() {
    var required = ["c03", "c06", "c11", "c15"];
    var tokens = [
      tok("c00", "seed: 17"),
      tok("c01", "include stdint"),
      tok("c02", "warm cache"),
      tok("c03", "counted loop", "required"),
      tok("c04", "debug print"),
      tok("c05", "bounds note"),
      tok("c06", "volatile load", "required"),
      tok("c07", "dead branch"),
      tok("c08", "align 32"),
      tok("c09", "helper call"),
      tok("c10", "copy temp"),
      tok("c11", "vector hint", "required"),
      tok("c12", "checksum"),
      tok("c13", "mask high"),
      tok("c14", "late inline"),
      tok("c15", "alias store", "required"),
      tok("c16", "log marker"),
      tok("c17", "return sum"),
      tok("c18", "test harness"),
      tok("c19", "cleanup")
    ];
    return {
      id: "compiler",
      title: "Optimizer Crash",
      subtitle: "A flat reducer on a monotone failure.",
      structured: false,
      required: required,
      tokens: tokens,
      groups: [],
      status: function (ids) {
        var set = setFrom(ids);
        return hasAll(set, required) ? FAIL : PASS;
      },
      witness: "The synthetic compiler bug needs the loop, volatile load, vector hint, and aliasing store."
    };
  }

  function buildForkedScenario() {
    var big = ["f00", "f01", "f02", "f03", "f04"];
    var short = ["f12", "f13"];
    var tokens = [
      tok("f00", "enter coroutine", "big"),
      tok("f01", "pin stack", "big"),
      tok("f02", "yield across await", "big"),
      tok("f03", "borrow view", "big"),
      tok("f04", "resume worker", "big"),
      tok("f05", "trace id"),
      tok("f06", "metrics"),
      tok("f07", "feature flag"),
      tok("f08", "retry note"),
      tok("f09", "timeout"),
      tok("f10", "extra header"),
      tok("f11", "cache tag"),
      tok("f12", "emoji parse", "short"),
      tok("f13", "NFC normalize", "short"),
      tok("f14", "footer"),
      tok("f15", "snapshot")
    ];
    return {
      id: "forked",
      title: "Two Independent Bugs",
      subtitle: "A 1-minimal answer can miss the globally smallest witness.",
      structured: false,
      big: big,
      short: short,
      tokens: tokens,
      groups: [],
      status: function (ids) {
        var set = setFrom(ids);
        return hasAll(set, big) || hasAll(set, short) ? FAIL : PASS;
      },
      witness: "Either the five-token coroutine recipe or the two-token Unicode recipe is enough to fail."
    };
  }

  function buildStructuredScenario() {
    var groups = [
      { id: "s_preamble", label: "preamble" },
      { id: "s_function", label: "function" },
      { id: "s_vector", label: "vector block" },
      { id: "s_logging", label: "logging" },
      { id: "s_footer", label: "footer" }
    ];
    var required = ["s02", "s07", "s11", "s12"];
    var tokens = [
      tok("s00", "<case>", "fixed", "s_preamble", true),
      tok("s01", "target: jit", "noise", "s_preamble"),
      tok("s02", "arch: arm64", "required", "s_preamble"),
      tok("s03", "</case>", "fixed", "s_preamble", true),

      tok("s04", "fn f() {", "fixed", "s_function", true),
      tok("s05", "let acc = 0", "noise", "s_function"),
      tok("s06", "range guard", "noise", "s_function"),
      tok("s07", "counted loop", "required", "s_function"),
      tok("s08", "}", "fixed", "s_function", true),

      tok("s09", "vector {", "fixed", "s_vector", true),
      tok("s10", "lane shuffle", "noise", "s_vector"),
      tok("s11", "wide load", "required", "s_vector"),
      tok("s12", "narrow store", "required", "s_vector"),
      tok("s13", "}", "fixed", "s_vector", true),

      tok("s14", "log {", "fixed", "s_logging", true),
      tok("s15", "print lanes", "noise", "s_logging"),
      tok("s16", "dump cfg", "noise", "s_logging"),
      tok("s17", "}", "fixed", "s_logging", true),

      tok("s18", "expect {", "fixed", "s_footer", true),
      tok("s19", "crash marker", "noise", "s_footer"),
      tok("s20", "checksum", "noise", "s_footer"),
      tok("s21", "}", "fixed", "s_footer", true)
    ];
    return {
      id: "structured",
      title: "Structured Input",
      subtitle: "Flat deletion keeps breaking syntax; tree-aware deletion keeps asking valid questions.",
      structured: true,
      required: required,
      tokens: tokens,
      groups: groups,
      status: function (ids) {
        var set = setFrom(ids);
        for (var g = 0; g < groups.length; g += 1) {
          var groupId = groups[g].id;
          var any = false;
          var fixed = [];
          for (var i = 0; i < tokens.length; i += 1) {
            if (tokens[i].group === groupId) {
              if (set[tokens[i].id]) any = true;
              if (tokens[i].fixed) fixed.push(tokens[i].id);
            }
          }
          if (any && !hasAll(set, fixed)) return UNRESOLVED;
        }
        return hasAll(set, required) ? FAIL : PASS;
      },
      witness: "The crash requires the target architecture, loop, wide load, and narrowing store, but syntax tokens must stay balanced."
    };
  }

  function buildScenario(id) {
    if (id === "forked") return buildForkedScenario();
    if (id === "structured") return buildStructuredScenario();
    return buildCompilerScenario();
  }

  function tokenMap(scenario) {
    var out = Object.create(null);
    for (var i = 0; i < scenario.tokens.length; i += 1) out[scenario.tokens[i].id] = scenario.tokens[i];
    return out;
  }

  function applyOrder(scenario, mode) {
    var tokens = scenario.tokens.slice();
    if (mode === "short-first") {
      tokens.sort(function (a, b) {
        var wa = a.role === "short" ? 0 : a.role === "big" ? 1 : a.role === "required" ? 2 : a.fixed ? 3 : 4;
        var wb = b.role === "short" ? 0 : b.role === "big" ? 1 : b.role === "required" ? 2 : b.fixed ? 3 : 4;
        return wa === wb ? a.id.localeCompare(b.id) : wa - wb;
      });
    } else if (mode === "scattered") {
      tokens.sort(function (a, b) {
        return pseudoHash(a.id + a.text) - pseudoHash(b.id + b.text);
      });
    }
    return tokens.map(function (t) { return t.id; });
  }

  function makeTester(testFn, phase, trace) {
    var cache = Object.create(null);
    var tests = 0;
    var cacheHits = 0;
    return {
      run: function (items, n, kind) {
        var key = sortedKey(items);
        if (cache[key]) {
          cacheHits += 1;
          return cache[key].status;
        }
        var status = testFn(items);
        var entry = {
          phase: phase,
          kind: kind || "test",
          n: n || 1,
          size: items.length,
          status: status,
          candidate: items.slice()
        };
        cache[key] = entry;
        trace.push(entry);
        tests += 1;
        return status;
      },
      stats: function () {
        return { tests: tests, cacheHits: cacheHits };
      }
    };
  }

  function ddmin(items, testFn, phase) {
    var trace = [];
    var moves = [];
    var tester = makeTester(testFn, phase || "ddmin", trace);
    var config = items.slice();
    var initialStatus = tester.run(config, 1, "initial");
    if (initialStatus !== FAIL) {
      return {
        result: config,
        status: initialStatus,
        trace: trace,
        moves: moves,
        tests: tester.stats().tests,
        cacheHits: tester.stats().cacheHits,
        unresolved: countStatus(trace, UNRESOLVED)
      };
    }

    var n = 2;
    while (config.length >= 2) {
      var subsets = split(config, n);
      var reduced = false;
      var before = config.slice();

      for (var i = 0; i < subsets.length; i += 1) {
        if (tester.run(subsets[i], n, "subset") === FAIL) {
          config = subsets[i].slice();
          moves.push({ phase: phase || "ddmin", action: "keep subset", before: before.length, after: config.length, n: n });
          n = Math.max(n - 1, 2);
          reduced = true;
          break;
        }
      }
      if (reduced) continue;

      for (var j = 0; j < subsets.length; j += 1) {
        var complement = difference(config, subsets[j]);
        if (complement.length > 0 && tester.run(complement, n, "complement") === FAIL) {
          config = complement.slice();
          moves.push({ phase: phase || "ddmin", action: "drop subset", before: before.length, after: config.length, n: n });
          n = Math.max(n - 1, 2);
          reduced = true;
          break;
        }
      }
      if (reduced) continue;

      if (n >= config.length) break;
      n = Math.min(config.length, n * 2);
      moves.push({ phase: phase || "ddmin", action: "increase granularity", before: config.length, after: config.length, n: n });
    }

    return {
      result: config,
      status: testFn(config),
      trace: trace,
      moves: moves,
      tests: tester.stats().tests,
      cacheHits: tester.stats().cacheHits,
      unresolved: countStatus(trace, UNRESOLVED)
    };
  }

  function countStatus(trace, status) {
    var n = 0;
    for (var i = 0; i < trace.length; i += 1) {
      if (trace[i].status === status) n += 1;
    }
    return n;
  }

  function oneMinimal(items, testFn) {
    if (testFn(items) !== FAIL) return false;
    for (var i = 0; i < items.length; i += 1) {
      if (testFn(difference(items, [items[i]])) === FAIL) return false;
    }
    return true;
  }

  function globalMinimum(items, testFn, maxItems) {
    if (items.length > maxItems) {
      return { skipped: true, reason: "too many atoms for exhaustive browser search" };
    }
    var checked = 0;
    var found = null;

    function visit(k, start, prefix) {
      if (found) return;
      if (prefix.length === k) {
        checked += 1;
        if (testFn(prefix) === FAIL) found = prefix.slice();
        return;
      }
      for (var i = start; i <= items.length - (k - prefix.length); i += 1) {
        prefix.push(items[i]);
        visit(k, i + 1, prefix);
        prefix.pop();
        if (found) return;
      }
    }

    for (var size = 0; size <= items.length; size += 1) {
      visit(size, 0, []);
      if (found) {
        return { skipped: false, size: found.length, result: found, checked: checked };
      }
    }
    return { skipped: false, size: null, result: [], checked: checked };
  }

  function groupTokens(scenario, groupId) {
    var out = [];
    for (var i = 0; i < scenario.tokens.length; i += 1) {
      if (scenario.tokens[i].group === groupId) out.push(scenario.tokens[i].id);
    }
    return out;
  }

  function groupBodyTokens(scenario, groupId) {
    var out = [];
    for (var i = 0; i < scenario.tokens.length; i += 1) {
      if (scenario.tokens[i].group === groupId && !scenario.tokens[i].fixed) out.push(scenario.tokens[i].id);
    }
    return out;
  }

  function groupFixedTokens(scenario, groupId) {
    var out = [];
    for (var i = 0; i < scenario.tokens.length; i += 1) {
      if (scenario.tokens[i].group === groupId && scenario.tokens[i].fixed) out.push(scenario.tokens[i].id);
    }
    return out;
  }

  function unique(items) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < items.length; i += 1) {
      if (!seen[items[i]]) {
        seen[items[i]] = true;
        out.push(items[i]);
      }
    }
    return out;
  }

  function minimizeHierarchical(scenario, orderMode) {
    if (!scenario.structured) return null;
    var groupOrder = scenario.groups.map(function (g) { return g.id; });
    if (orderMode === "scattered") {
      groupOrder = groupOrder.slice().sort(function (a, b) { return pseudoHash(a) - pseudoHash(b); });
    }

    var trace = [];
    var moves = [];

    function materializeGroups(groupIds) {
      var ids = [];
      for (var i = 0; i < groupIds.length; i += 1) {
        ids = ids.concat(groupTokens(scenario, groupIds[i]));
      }
      return ids;
    }

    var groupRun = ddmin(groupOrder, function (groupIds) {
      return scenario.status(materializeGroups(groupIds));
    }, "hdd: groups");

    trace = trace.concat(groupRun.trace);
    moves = moves.concat(groupRun.moves);
    var activeGroups = groupRun.result.slice();
    var selected = materializeGroups(activeGroups);

    for (var g = 0; g < activeGroups.length; g += 1) {
      var groupId = activeGroups[g];
      var body = groupBodyTokens(scenario, groupId);
      if (body.length < 2) continue;
      var fixed = groupFixedTokens(scenario, groupId);
      var currentGroup = setFrom(groupTokens(scenario, groupId));
      var others = selected.filter(function (id) { return !currentGroup[id]; });
      var localRun = ddmin(body, function (candidateBody) {
        return scenario.status(unique(others.concat(fixed).concat(candidateBody)));
      }, "hdd: " + groupId.replace(/^s_/, ""));
      trace = trace.concat(localRun.trace);
      moves = moves.concat(localRun.moves);
      selected = unique(others.concat(fixed).concat(localRun.result));
    }

    return {
      result: selected,
      status: scenario.status(selected),
      trace: trace,
      moves: moves,
      tests: trace.length,
      cacheHits: groupRun.cacheHits,
      unresolved: countStatus(trace, UNRESOLVED),
      oneMinimal: oneMinimal(selected, scenario.status)
    };
  }

  function evaluate(raw) {
    raw = raw || {};
    var scenario = buildScenario(SCENARIO_ORDER.indexOf(raw.scenario) >= 0 ? raw.scenario : "compiler");
    var orderMode = ORDER_MODES.indexOf(raw.order) >= 0 ? raw.order : "natural";
    var orderedIds = applyOrder(scenario, orderMode);
    var flat = ddmin(orderedIds, scenario.status, "flat ddmin");
    flat.oneMinimal = oneMinimal(flat.result, scenario.status);
    var hdd = minimizeHierarchical(scenario, orderMode);
    var global = globalMinimum(orderedIds, scenario.status, 18);
    return {
      scenario: scenario,
      orderMode: orderMode,
      orderedIds: orderedIds,
      flat: flat,
      hdd: hdd,
      global: global
    };
  }

  function roundedFacts(result) {
    return {
      scenario: result.scenario.id,
      order: result.orderMode,
      atoms: result.orderedIds.length,
      flatSize: result.flat.result.length,
      flatTests: result.flat.tests,
      flatUnresolved: result.flat.unresolved,
      flatOneMinimal: result.flat.oneMinimal,
      hddSize: result.hdd ? result.hdd.result.length : null,
      hddTests: result.hdd ? result.hdd.tests : null,
      hddUnresolved: result.hdd ? result.hdd.unresolved : null,
      globalSize: result.global.skipped ? null : result.global.size
    };
  }

  function runAudit() {
    var failures = [];
    function record(name, ok) {
      if (!ok) failures.push(name);
    }

    var compiler = evaluate({ scenario: "compiler", order: "natural" });
    record("compiler original fails", compiler.scenario.status(compiler.orderedIds) === FAIL);
    record("compiler flat result fails", compiler.flat.status === FAIL);
    record("compiler flat is one-minimal", compiler.flat.oneMinimal);
    record("compiler keeps four triggers", compiler.flat.result.length === 4);
    record("compiler no unresolved tests", compiler.flat.unresolved === 0);

    var forked = evaluate({ scenario: "forked", order: "natural" });
    record("forked original fails", forked.scenario.status(forked.orderedIds) === FAIL);
    record("forked result is one-minimal", forked.flat.oneMinimal);
    record("forked exhaustive search runs", !forked.global.skipped && forked.global.size === 2);
    record("forked natural order can miss global minimum", forked.flat.result.length > forked.global.size);
    var forkedShort = evaluate({ scenario: "forked", order: "short-first" });
    record("forked order can expose short witness", forkedShort.flat.result.length === 2);

    var structured = evaluate({ scenario: "structured", order: "natural" });
    record("structured original fails", structured.scenario.status(structured.orderedIds) === FAIL);
    record("structured flat sees invalid candidates", structured.flat.unresolved > 0);
    record("structured hdd avoids invalid candidates", structured.hdd.unresolved === 0);
    record("structured hdd result fails", structured.hdd.status === FAIL);
    record("structured hdd beats flat unresolved count", structured.hdd.unresolved < structured.flat.unresolved);

    var bad = evaluate({ scenario: "not-real", order: "also-not-real" });
    record("invalid options sanitize", bad.scenario.id === "compiler" && bad.orderMode === "natural");

    return {
      passed: 15 - failures.length,
      checked: 15,
      failures: failures,
      defaultFacts: roundedFacts(evaluate({ scenario: "forked", order: "natural" }))
    };
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

  function statusClass(status) {
    if (status === FAIL) return "is-fail";
    if (status === UNRESOLVED) return "is-unresolved";
    return "is-pass";
  }

  function describeGlobal(global) {
    if (global.skipped) return "skipped";
    if (global.size == null) return "none";
    return String(global.size);
  }

  function metric(label, value) {
    return '<div class="delta-lab__metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function option(value, label, selected) {
    return '<option value="' + escapeHtml(value) + '"' + (selected ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }

  function mount(el) {
    var state = {
      scenario: el.getAttribute("data-scenario") || "forked",
      order: el.getAttribute("data-order") || "natural"
    };

    el.innerHTML = [
      '<div class="delta-lab__controls">',
      '<label>Case file<select data-role="scenario">',
      option("compiler", "Optimizer crash", state.scenario === "compiler"),
      option("forked", "Two independent bugs", state.scenario === "forked"),
      option("structured", "Structured input", state.scenario === "structured"),
      '</select></label>',
      '<label>Atom order<select data-role="order">',
      option("natural", "Natural", state.order === "natural"),
      option("short-first", "Short witness first", state.order === "short-first"),
      option("scattered", "Scattered", state.order === "scattered"),
      '</select></label>',
      '</div>',
      '<div class="delta-lab__summary" data-role="summary"></div>',
      '<canvas class="delta-lab__canvas" data-role="canvas" aria-label="Delta debugging trace visualization"></canvas>',
      '<div class="delta-lab__legend" data-role="legend"></div>',
      '<ol class="delta-lab__moves" data-role="moves"></ol>'
    ].join("");

    var scenarioControl = el.querySelector('[data-role="scenario"]');
    var orderControl = el.querySelector('[data-role="order"]');

    function update() {
      state.scenario = scenarioControl.value;
      state.order = orderControl.value;
      var result = evaluate(state);
      renderSummary(el.querySelector('[data-role="summary"]'), result);
      renderLegend(el.querySelector('[data-role="legend"]'), result);
      renderMoves(el.querySelector('[data-role="moves"]'), result);
      renderCanvas(el.querySelector('[data-role="canvas"]'), result);
    }

    scenarioControl.addEventListener("change", update);
    orderControl.addEventListener("change", update);
    window.addEventListener("resize", update);
    update();
  }

  function renderSummary(target, result) {
    var facts = roundedFacts(result);
    var hddSize = result.hdd ? facts.hddSize : "n/a";
    var hddTests = result.hdd ? facts.hddTests : "n/a";
    target.innerHTML = [
      '<div class="delta-lab__case">',
      '<strong>' + escapeHtml(result.scenario.title) + '</strong>',
      '<span>' + escapeHtml(result.scenario.subtitle) + '</span>',
      '</div>',
      '<div class="delta-lab__metrics">',
      metric("Flat atoms", facts.flatSize),
      metric("Flat tests", facts.flatTests),
      metric("Unresolved", facts.flatUnresolved),
      metric("Tree atoms", hddSize),
      metric("Tree tests", hddTests),
      metric("Global best", describeGlobal(result.global)),
      '</div>',
      '<p class="delta-lab__note">' + escapeHtml(result.scenario.witness) + '</p>'
    ].join("");
  }

  function renderLegend(target, result) {
    var audit = runAudit();
    target.innerHTML = [
      '<span><i class="is-fail"></i> fail</span>',
      '<span><i class="is-pass"></i> pass</span>',
      '<span><i class="is-unresolved"></i> unresolved</span>',
      '<span><i class="is-kept"></i> kept in reducer output</span>',
      '<span>Audit ' + audit.passed + '/' + audit.checked + '</span>',
      '<span>' + escapeHtml(result.flat.oneMinimal ? "flat output is 1-minimal" : "flat output is not 1-minimal") + '</span>'
    ].join("");
  }

  function renderMoves(target, result) {
    var moves = result.flat.moves.slice(0, 7);
    if (result.hdd) moves = moves.concat(result.hdd.moves.slice(0, 5));
    if (!moves.length) {
      target.innerHTML = '<li>No reduction accepted.</li>';
      return;
    }
    target.innerHTML = moves.map(function (m) {
      return '<li><span>' + escapeHtml(m.phase) + '</span> ' +
        escapeHtml(m.action) + ' at n=' + escapeHtml(m.n) +
        ': ' + escapeHtml(m.before) + ' -> ' + escapeHtml(m.after) + '</li>';
    }).join("");
  }

  function resizeCanvas(canvas, cssHeight) {
    var dpr = window.devicePixelRatio || 1;
    var width = Math.max(320, Math.floor(canvas.getBoundingClientRect().width || canvas.parentNode.clientWidth || 640));
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

  function roleColor(token) {
    if (token.role === "big") return COLORS.big;
    if (token.role === "short") return COLORS.short;
    if (token.role === "required") return COLORS.required;
    if (token.fixed) return COLORS.fixed;
    return COLORS.noise;
  }

  function drawTape(ctx, result, ids, kept, x, y, w, label) {
    var map = tokenMap(result.scenario);
    var cols = Math.max(8, Math.min(ids.length, Math.floor(w / 29)));
    var gap = 4;
    var cell = Math.max(18, Math.min(27, (w - gap * (cols - 1)) / cols));
    var rows = Math.ceil(ids.length / cols);

    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText(label, x, y);

    for (var i = 0; i < ids.length; i += 1) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var px = x + col * (cell + gap);
      var py = y + 12 + row * (cell + gap);
      var token = map[ids[i]];
      var isKept = kept && kept[ids[i]];
      ctx.globalAlpha = kept ? (isKept ? 1 : 0.18) : 0.92;
      ctx.fillStyle = roleColor(token);
      drawRoundRect(ctx, px, py, cell, cell, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isKept ? COLORS.ink : "#ffffff";
      ctx.lineWidth = isKept ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = token.role === "noise" && !token.fixed ? COLORS.ink : "#ffffff";
      ctx.font = "700 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), px + cell / 2, py + cell / 2 + 0.5);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    return y + 18 + rows * (cell + gap);
  }

  function drawTrace(ctx, trace, initialSize, x, y, w, h, label) {
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText(label, x, y);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(x, y + h + 11);
    ctx.lineTo(x + w, y + h + 11);
    ctx.stroke();

    var bars = trace.slice(-Math.min(trace.length, 90));
    var gap = bars.length > 45 ? 1 : 2;
    var bw = Math.max(2, (w - gap * Math.max(0, bars.length - 1)) / Math.max(1, bars.length));
    for (var i = 0; i < bars.length; i += 1) {
      var entry = bars[i];
      var bh = Math.max(4, h * entry.size / Math.max(1, initialSize));
      var px = x + i * (bw + gap);
      var py = y + 10 + h - bh;
      ctx.fillStyle = entry.status === FAIL ? COLORS.fail : entry.status === UNRESOLVED ? COLORS.unresolved : COLORS.pass;
      drawRoundRect(ctx, px, py, bw, bh, Math.min(3, bw / 2));
      ctx.fill();
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(String(trace.length) + " tests, bar height = candidate size", x, y + h + 26);
    return y + h + 36;
  }

  function drawTokenLabels(ctx, result, x, y, w) {
    var map = tokenMap(result.scenario);
    var kept = setFrom(result.flat.result);
    var labels = result.orderedIds.filter(function (id) { return kept[id]; }).map(function (id) {
      return map[id].text;
    });
    var text = labels.join("  |  ");
    ctx.fillStyle = COLORS.panel;
    drawRoundRect(ctx, x, y, w, 48, 7);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("flat output", x + 10, y + 18);
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    wrapText(ctx, text || "(empty)", x + 10, y + 36, w - 20, 15, 2);
    return y + 60;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = text.split(/\s+/);
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

  function renderCanvas(canvas, result) {
    var box = resizeCanvas(canvas, result.hdd ? 760 : 650);
    var ctx = box.ctx;
    var w = box.width;
    ctx.clearRect(0, 0, box.width, box.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, box.width, box.height);

    var pad = 16;
    var y = 24;
    var fullSet = setFrom(result.orderedIds);
    var flatSet = setFrom(result.flat.result);
    y = drawTape(ctx, result, result.orderedIds, fullSet, pad, y, w - pad * 2, "original atoms");
    y += 10;
    y = drawTape(ctx, result, result.orderedIds, flatSet, pad, y, w - pad * 2, "flat ddmin output");
    y += 14;
    y = drawTrace(ctx, result.flat.trace, result.orderedIds.length, pad, y, w - pad * 2, 130, "flat ddmin trace");
    y += 12;
    y = drawTokenLabels(ctx, result, pad, y, w - pad * 2);

    if (result.hdd) {
      var hddSet = setFrom(result.hdd.result);
      y += 4;
      y = drawTape(ctx, result, result.orderedIds, hddSet, pad, y, w - pad * 2, "tree-aware output");
      y += 14;
      y = drawTrace(ctx, result.hdd.trace, result.orderedIds.length, pad, y, w - pad * 2, 110, "tree-aware trace");
    }

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("Role colors: blue/purple/rose are failure ingredients; dark cells are syntax shells; pale cells are removable noise.", pad, box.height - 18);
  }

  function init() {
    var nodes = document.querySelectorAll("[data-delta-lab]");
    for (var i = 0; i < nodes.length; i += 1) mount(nodes[i]);
  }

  var api = {
    evaluate: evaluate,
    runAudit: runAudit,
    roundedFacts: roundedFacts,
    ddmin: ddmin,
    constants: {
      PASS: PASS,
      FAIL: FAIL,
      UNRESOLVED: UNRESOLVED
    }
  };

  root.DeltaDebuggingLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
