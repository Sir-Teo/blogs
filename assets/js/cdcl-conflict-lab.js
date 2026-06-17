(function (global) {
  "use strict";

  var DEFAULTS = {
    chain: 4,
    detours: 2,
    step: 99
  };

  var COLORS = {
    assert: "#be123c",
    axis: "#94a3b8",
    bg: "#f8fafc",
    border: "#dbe3ea",
    conflict: "#dc2626",
    decision: "#7c3aed",
    detour: "#d97706",
    grid: "#e8eef5",
    implied: "#0f766e",
    muted: "#64748b",
    paper: "#ffffff",
    text: "#0f172a",
    warn: "#b45309"
  };

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function number(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      chain: Math.round(clamp(number(raw.chain, DEFAULTS.chain), 2, 7)),
      detours: Math.round(clamp(number(raw.detours, DEFAULTS.detours), 0, 4)),
      step: Math.round(clamp(number(raw.step, DEFAULTS.step), 0, 14))
    };
  }

  function varName(id, names) {
    return names[id] || ("v" + id);
  }

  function litName(lit, names) {
    return (lit < 0 ? "~" : "") + varName(Math.abs(lit), names);
  }

  function clauseName(lits, names) {
    return lits.map(function (lit) { return litName(lit, names); }).join(" ∨ ");
  }

  function addVar(state, name, role) {
    state.nextVar += 1;
    state.names[state.nextVar] = name;
    state.roles[state.nextVar] = role || "implied";
    return state.nextVar;
  }

  function addClause(state, lits, label) {
    var clause = { id: state.clauses.length + 1, label: label, lits: lits.slice() };
    state.clauses.push(clause);
    return clause;
  }

  function buildFormula(params) {
    var state = { clauses: [], decisions: [], names: {}, nextVar: 0, roles: {} };
    var a = addVar(state, "a", "decision");
    var b = addVar(state, "b", "decision");
    var x = addVar(state, "x", "support");
    var y = addVar(state, "y", "support");
    addClause(state, [-a, x], "a implies x");
    addClause(state, [-b, y], "b implies y");
    state.decisions.push({ lit: a, label: "choose a" });
    state.decisions.push({ lit: b, label: "choose b" });

    for (var i = 1; i <= params.detours; i += 1) {
      var d = addVar(state, "d" + i, "detour");
      var j = addVar(state, "j" + i, "detour");
      state.decisions.push({ lit: d, label: "irrelevant d" + i });
      addClause(state, [-d, j], "detour " + i);
    }

    var c = addVar(state, "c", "decision");
    var z = addVar(state, "z", "current");
    var w = addVar(state, "w", "current");
    state.decisions.push({ lit: c, label: "choose c" });
    addClause(state, [-c, z], "c implies z");
    addClause(state, [-c, w], "c implies w");

    var prev = 0;
    for (i = 1; i <= params.chain; i += 1) {
      var p = addVar(state, "p" + i, "current");
      if (i === 1) addClause(state, [-x, -z, p], "x and z imply p1");
      else if (i % 2 === 0) addClause(state, [-y, -prev, p], "y and p" + (i - 1) + " imply p" + i);
      else addClause(state, [-z, -prev, p], "z and p" + (i - 1) + " imply p" + i);
      prev = p;
    }
    addClause(state, [-prev, -w], "conflict");
    state.key = { a: a, b: b, c: c, x: x, y: y, z: z, w: w, last: prev };
    return state;
  }

  function litValue(lit, assigns) {
    var a = assigns[Math.abs(lit)];
    if (!a) return 0;
    return (lit > 0 ? a.value : !a.value) ? 1 : -1;
  }

  function clauseStatus(clause, assigns) {
    var unassigned = [];
    for (var i = 0; i < clause.lits.length; i += 1) {
      var value = litValue(clause.lits[i], assigns);
      if (value === 1) return { kind: "sat" };
      if (value === 0) unassigned.push(clause.lits[i]);
    }
    if (unassigned.length === 0) return { kind: "conflict", clause: clause };
    if (unassigned.length === 1) return { kind: "unit", lit: unassigned[0], clause: clause };
    return { kind: "open" };
  }

  function propagate(formula) {
    var assigns = {};
    var trail = [];
    var level = 0;
    var conflict = null;

    function assign(lit, reason, decisionLabel) {
      var id = Math.abs(lit);
      var value = lit > 0;
      var existing = assigns[id];
      if (existing) {
        if (existing.value !== value) conflict = { clause: reason, conflictingLit: lit };
        return;
      }
      assigns[id] = {
        decision: !reason,
        decisionLabel: decisionLabel || "",
        level: level,
        order: trail.length,
        reason: reason || null,
        value: value,
        variable: id
      };
      trail.push(assigns[id]);
    }

    for (var d = 0; d < formula.decisions.length && !conflict; d += 1) {
      level += 1;
      assign(formula.decisions[d].lit, null, formula.decisions[d].label);
      var changed = true;
      while (changed && !conflict) {
        changed = false;
        for (var ci = 0; ci < formula.clauses.length && !conflict; ci += 1) {
          var status = clauseStatus(formula.clauses[ci], assigns);
          if (status.kind === "unit") {
            assign(status.lit, status.clause, "");
            changed = true;
          } else if (status.kind === "conflict") {
            conflict = { clause: status.clause };
          }
        }
      }
    }

    return { assigns: assigns, conflict: conflict, decisionLevel: level, trail: trail };
  }

  function uniqueClause(lits) {
    var seen = {};
    var out = [];
    for (var i = 0; i < lits.length; i += 1) {
      var lit = lits[i];
      var key = String(lit);
      if (!seen[key]) {
        seen[key] = true;
        out.push(lit);
      }
    }
    out.sort(function (a, b) {
      var va = Math.abs(a);
      var vb = Math.abs(b);
      return va === vb ? a - b : va - vb;
    });
    return out;
  }

  function resolveClause(a, b, pivot) {
    var out = [];
    a.concat(b).forEach(function (lit) {
      if (Math.abs(lit) !== pivot) out.push(lit);
    });
    return uniqueClause(out);
  }

  function countAtLevel(lits, assigns, level) {
    var count = 0;
    lits.forEach(function (lit) {
      var a = assigns[Math.abs(lit)];
      if (a && a.level === level) count += 1;
    });
    return count;
  }

  function latestCurrentLiteral(lits, assigns, level) {
    var best = null;
    lits.forEach(function (lit) {
      var a = assigns[Math.abs(lit)];
      if (!a || a.level !== level || !a.reason) return;
      if (!best || a.order > best.order) best = { lit: lit, assignment: a };
    });
    return best;
  }

  function analyzeConflict(formula, run) {
    var level = run.decisionLevel;
    var learned = uniqueClause(run.conflict.clause.lits);
    var steps = [{
      clause: learned.slice(),
      currentCount: countAtLevel(learned, run.assigns, level),
      label: "conflict clause",
      pivot: null,
      reason: null
    }];

    var guard = 0;
    while (countAtLevel(learned, run.assigns, level) > 1 && guard < 32) {
      var latest = latestCurrentLiteral(learned, run.assigns, level);
      if (!latest) break;
      var reason = latest.assignment.reason;
      learned = resolveClause(learned, reason.lits, latest.assignment.variable);
      steps.push({
        clause: learned.slice(),
        currentCount: countAtLevel(learned, run.assigns, level),
        label: "resolve " + varName(latest.assignment.variable, formula.names),
        pivot: latest.assignment.variable,
        reason: reason
      });
      guard += 1;
    }

    var assertingLit = null;
    learned.forEach(function (lit) {
      var a = run.assigns[Math.abs(lit)];
      if (a && a.level === level) assertingLit = lit;
    });

    var backjump = 0;
    learned.forEach(function (lit) {
      if (lit === assertingLit) return;
      var a = run.assigns[Math.abs(lit)];
      if (a) backjump = Math.max(backjump, a.level);
    });

    var unitAfterBackjump = true;
    learned.forEach(function (lit) {
      if (lit === assertingLit) return;
      var a = run.assigns[Math.abs(lit)];
      if (!a || a.level > backjump || litValue(lit, run.assigns) !== -1) unitAfterBackjump = false;
    });

    return {
      assertingLit: assertingLit,
      backjump: backjump,
      finalClause: learned,
      levelsSkipped: Math.max(0, level - backjump - 1),
      steps: steps,
      unitAfterBackjump: unitAfterBackjump
    };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var formula = buildFormula(params);
    var run = propagate(formula);
    var analysis = analyzeConflict(formula, run);
    params.step = Math.round(clamp(params.step, 0, Math.max(0, analysis.steps.length - 1)));
    return { analysis: analysis, formula: formula, params: params, run: run };
  }

  function clauseIsFalse(lits, assigns) {
    return lits.every(function (lit) { return litValue(lit, assigns) === -1; });
  }

  function sameClause(a, b) {
    var aa = uniqueClause(a);
    var bb = uniqueClause(b);
    return aa.length === bb.length && aa.every(function (lit, index) {
      return lit === bb[index];
    });
  }

  function hasTautology(lits) {
    var seen = {};
    return lits.some(function (lit) {
      if (seen[String(-lit)]) return true;
      seen[String(lit)] = true;
      return false;
    });
  }

  function assignedLiteral(item) {
    return item.value ? item.variable : -item.variable;
  }

  function trailPrefixAssigns(trail, stopOrder) {
    var assigns = {};
    trail.forEach(function (item) {
      if (item.order >= stopOrder) return;
      assigns[item.variable] = item;
    });
    return assigns;
  }

  function assignsThroughLevel(trail, maxLevel) {
    var assigns = {};
    trail.forEach(function (item) {
      if (item.level <= maxLevel) assigns[item.variable] = item;
    });
    return assigns;
  }

  function literalPolarity(lits, variable) {
    var polarity = 0;
    lits.forEach(function (lit) {
      if (Math.abs(lit) === variable) polarity += lit > 0 ? 1 : -1;
    });
    return polarity;
  }

  function audit() {
    var checked = 0;
    var failures = [];
    function check(name, ok) {
      checked += 1;
      if (!ok) failures.push(name);
    }

    function checkTrail(result, label) {
      var seen = {};
      result.run.trail.forEach(function (item) {
        check(label + " assigns each variable once " + item.variable, !seen[item.variable]);
        seen[item.variable] = true;
        if (item.reason) {
          var before = trailPrefixAssigns(result.run.trail, item.order);
          var status = clauseStatus(item.reason, before);
          check(label + " reason is unit before " + varName(item.variable, result.formula.names), status.kind === "unit" && status.lit === assignedLiteral(item));
        }
      });
      result.formula.clauses.forEach(function (clause) {
        var status = clauseStatus(clause, result.run.assigns);
        if (clause === result.run.conflict.clause) {
          check(label + " conflict clause is false", status.kind === "conflict");
        } else {
          check(label + " non-conflict clause is satisfied or reason-open " + clause.label, status.kind === "sat" || status.kind === "open");
        }
      });
    }

    function checkResolution(result, label) {
      var steps = result.analysis.steps;
      check(label + " first step is conflict", sameClause(steps[0].clause, result.run.conflict.clause.lits));
      check(label + " first step has no tautology", !hasTautology(steps[0].clause));
      for (var i = 1; i < steps.length; i += 1) {
        var previous = steps[i - 1];
        var step = steps[i];
        var pivot = step.pivot;
        var assignment = result.run.assigns[pivot];
        check(label + " step " + i + " has a pivot reason", !!assignment && assignment.reason === step.reason);
        check(label + " step " + i + " pivot is current-level", !!assignment && assignment.level === result.run.decisionLevel);
        check(label + " step " + i + " resolves opposite signs", literalPolarity(previous.clause, pivot) * literalPolarity(step.reason.lits, pivot) < 0);
        check(label + " step " + i + " resolvent is exact", sameClause(step.clause, resolveClause(previous.clause, step.reason.lits, pivot)));
        check(label + " step " + i + " resolvent has no tautology", !hasTautology(step.clause));
        check(label + " step " + i + " current count is recorded", step.currentCount === countAtLevel(step.clause, result.run.assigns, result.run.decisionLevel));
      }
    }

    function checkBackjump(result, label) {
      var expected = uniqueClause([-result.formula.key.x, -result.formula.key.y, -result.formula.key.c]);
      var trimmed = assignsThroughLevel(result.run.trail, result.analysis.backjump);
      var status = clauseStatus({ lits: result.analysis.finalClause }, trimmed);
      check(label + " reaches conflict", !!result.run.conflict);
      check(label + " decision level includes supports detours and c", result.run.decisionLevel === result.params.detours + 3);
      check(label + " learned clause is exact support cut", sameClause(result.analysis.finalClause, expected));
      check(label + " learned clause is false before backjump", clauseIsFalse(result.analysis.finalClause, result.run.assigns));
      check(label + " final clause has one current literal", countAtLevel(result.analysis.finalClause, result.run.assigns, result.run.decisionLevel) === 1);
      check(label + " backjump skips detours", result.analysis.levelsSkipped === result.params.detours);
      check(label + " backjump level is second-highest support", result.analysis.backjump === 2);
      check(label + " learned clause is asserting", result.analysis.unitAfterBackjump);
      check(label + " learned clause is unit after backjump", status.kind === "unit" && status.lit === result.analysis.assertingLit);
      check(label + " asserting literal is negated final decision", litName(result.analysis.assertingLit, result.formula.names) === "~c");
      check(label + " final clause has no detour variables", result.analysis.finalClause.every(function (lit) {
        return result.formula.roles[Math.abs(lit)] !== "detour";
      }));
    }

    var cases = 0;
    for (var chain = 2; chain <= 7; chain += 1) {
      for (var detours = 0; detours <= 4; detours += 1) {
        var params = { chain: chain, detours: detours, step: 99 };
        var label = "chain " + chain + " detours " + detours;
        var result = evaluate(params);
        checkTrail(result, label);
        checkResolution(result, label);
        checkBackjump(result, label);
        check(label + " max step clamps to final proof row", result.params.step === result.analysis.steps.length - 1);
        cases += 1;
      }
    }
    var lowClamp = evaluate({ chain: -10, detours: -1, step: -2 }).params;
    var highClamp = evaluate({ chain: 99, detours: 99, step: 999 }).params;
    check("low params clamp", lowClamp.chain === 2 && lowClamp.detours === 0 && lowClamp.step === 0);
    check("high params clamp", highClamp.chain === 7 && highClamp.detours === 4);

    var defaultRun = evaluate(DEFAULTS);
    var ok = failures.length === 0;
    return {
      cases: cases,
      checked: checked,
      failures: failures,
      ok: ok,
      pass: ok,
      sample: {
        asserting: litName(defaultRun.analysis.assertingLit, defaultRun.formula.names),
        backjump: defaultRun.analysis.backjump,
        learned: clauseName(defaultRun.analysis.finalClause, defaultRun.formula.names),
        resolutionSteps: defaultRun.analysis.steps.length - 1,
        skipped: defaultRun.analysis.levelsSkipped
      }
    };
  }

  function pct(value) {
    return Math.round(100 * value) + "%";
  }

  function metric(label, value, tone) {
    return '<div class="cdcl-lab__metric ' + (tone || "") + '">' +
      "<span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function setText(root, key, value) {
    var el = root.querySelector("[data-value='" + key + "']");
    if (el) el.textContent = value;
  }

  function renderMetrics(root, result) {
    var el = root.querySelector("[data-role='metrics']");
    if (!el) return;
    el.innerHTML = [
      metric("Learned clause", clauseName(result.analysis.finalClause, result.formula.names), "cdcl-lab__metric--good"),
      metric("Backjump", String(result.analysis.backjump), ""),
      metric("Skipped", String(result.analysis.levelsSkipped), result.analysis.levelsSkipped ? "cdcl-lab__metric--good" : ""),
      metric("Proof steps", String(result.analysis.steps.length - 1), ""),
      metric("Assert", litName(result.analysis.assertingLit, result.formula.names), "cdcl-lab__metric--warn"),
      metric("After jump", result.analysis.unitAfterBackjump ? "unit" : "open", result.analysis.unitAfterBackjump ? "cdcl-lab__metric--good" : "cdcl-lab__metric--warn")
    ].join("");
  }

  function renderNote(root, result) {
    var el = root.querySelector("[data-role='note']");
    if (!el) return;
    el.textContent = "At level " + result.run.decisionLevel + ", the conflict clause is resolved until only " +
      litName(result.analysis.assertingLit, result.formula.names) + " remains from the current level. The learned clause jumps to level " +
      result.analysis.backjump + " and immediately forces the opposite of the failed decision.";
  }

  function canvasContext(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var width = Math.max(320, Math.round(rect.width));
    var height = Math.max(640, Math.round(rect.height));
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 12) + "px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.paper;
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 8);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, box.x + 14, box.y + 22, COLORS.text, 13, 800);
    if (subtitle) label(ctx, subtitle, box.x + 14, box.y + 39, COLORS.muted, 10, 650);
  }

  function assignmentColor(item, formula, result) {
    if (item.variable === Math.abs(result.analysis.assertingLit)) return COLORS.assert;
    if (item.decision) return formula.roles[item.variable] === "detour" ? COLORS.detour : COLORS.decision;
    return formula.roles[item.variable] === "detour" ? COLORS.detour : COLORS.implied;
  }

  function drawTrail(ctx, box, result) {
    panel(ctx, box, "trail", "decisions create levels; propagation fills them");
    var levels = {};
    result.run.trail.forEach(function (item) {
      if (!levels[item.level]) levels[item.level] = [];
      levels[item.level].push(item);
    });
    var levelKeys = Object.keys(levels).map(Number).sort(function (a, b) { return a - b; });
    var rowH = Math.max(28, (box.h - 62) / Math.max(1, levelKeys.length));
    levelKeys.forEach(function (level, row) {
      var y = box.y + 58 + row * rowH;
      label(ctx, "L" + level, box.x + 16, y + 10, COLORS.muted, 11, 750);
      levels[level].forEach(function (item, index) {
        var x = box.x + 52 + index * 39;
        ctx.fillStyle = assignmentColor(item, result.formula, result);
        roundRect(ctx, x, y, 30, 22, 6);
        ctx.fill();
        label(ctx, varName(item.variable, result.formula.names), x + 15, y + 11, "#ffffff", 11, 850, "center");
      });
    });
  }

  function nodePositions(result, box) {
    var levels = {};
    result.run.trail.forEach(function (item) {
      if (!levels[item.level]) levels[item.level] = [];
      levels[item.level].push(item);
    });
    var positions = {};
    var maxLevel = result.run.decisionLevel;
    Object.keys(levels).forEach(function (levelKey) {
      var level = Number(levelKey);
      var list = levels[level];
      list.forEach(function (item, index) {
        positions[item.variable] = {
          x: box.x + 34 + (box.w - 68) * (level - 1) / Math.max(1, maxLevel - 1),
          y: box.y + 62 + (box.h - 105) * (index + 1) / (list.length + 1)
        };
      });
    });
    return positions;
  }

  function drawArrow(ctx, a, b, color) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len;
    var uy = dy / len;
    var start = { x: a.x + ux * 13, y: a.y + uy * 13 };
    var end = { x: b.x - ux * 15, y: b.y - uy * 15 };
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawGraph(ctx, box, result) {
    var active = result.analysis.steps[result.params.step] || result.analysis.steps[result.analysis.steps.length - 1];
    panel(ctx, box, "implication graph", active.pivot ? "highlight: resolving " + varName(active.pivot, result.formula.names) : "conflict before analysis");
    var pos = nodePositions(result, box);
    result.run.trail.forEach(function (item) {
      if (!item.reason) return;
      item.reason.lits.forEach(function (lit) {
        var v = Math.abs(lit);
        if (v !== item.variable && pos[v]) drawArrow(ctx, pos[v], pos[item.variable], COLORS.axis);
      });
    });
    var last = Math.abs(result.formula.key.last);
    var conflictPos = { x: box.x + box.w - 30, y: box.y + box.h - 36 };
    if (pos[last]) drawArrow(ctx, pos[last], conflictPos, COLORS.conflict);
    if (pos[result.formula.key.w]) drawArrow(ctx, pos[result.formula.key.w], conflictPos, COLORS.conflict);
    ctx.fillStyle = COLORS.conflict;
    roundRect(ctx, conflictPos.x - 18, conflictPos.y - 12, 36, 24, 6);
    ctx.fill();
    label(ctx, "⊥", conflictPos.x, conflictPos.y, "#ffffff", 15, 900, "center");
    result.run.trail.forEach(function (item) {
      var p = pos[item.variable];
      var activeNode = active.pivot === item.variable;
      ctx.fillStyle = activeNode ? COLORS.assert : assignmentColor(item, result.formula, result);
      roundRect(ctx, p.x - 14, p.y - 12, 28, 24, 6);
      ctx.fill();
      label(ctx, varName(item.variable, result.formula.names), p.x, p.y, "#ffffff", 10, 850, "center");
    });
  }

  function drawResolution(ctx, box, result) {
    panel(ctx, box, "resolution ledger", "resolve latest current-level reasons until one remains");
    var step = result.params.step;
    var rows = result.analysis.steps;
    var y = box.y + 58;
    var rowH = Math.min(36, (box.h - 78) / Math.max(1, rows.length));
    rows.forEach(function (row, index) {
      var yy = y + index * rowH;
      var active = index === step;
      ctx.fillStyle = active ? "rgba(190, 18, 60, 0.09)" : "rgba(248, 250, 252, 0.75)";
      roundRect(ctx, box.x + 12, yy - 12, box.w - 24, rowH - 3, 6);
      ctx.fill();
      label(ctx, index + ".", box.x + 22, yy, active ? COLORS.assert : COLORS.muted, 10, 800);
      label(ctx, row.label, box.x + 44, yy, active ? COLORS.assert : COLORS.text, 10, 800);
      label(ctx, clauseName(row.clause, result.formula.names), box.x + 128, yy, COLORS.text, 10, 650);
      label(ctx, row.currentCount + " current", box.x + box.w - 18, yy, COLORS.muted, 10, 700, "right");
    });
  }

  function drawBackjump(ctx, box, result) {
    panel(ctx, box, "backjump", "the learned clause cuts away irrelevant levels");
    var maxLevel = result.run.decisionLevel;
    var left = box.x + 20;
    var right = box.x + box.w - 24;
    var top = box.y + 64;
    var bottomReserve = 46;
    var available = Math.max(80, box.y + box.h - bottomReserve - top);
    var gap = clamp(Math.floor(available / Math.max(1, maxLevel) * 0.18), 4, 10);
    var barH = clamp(Math.floor((available - gap * (maxLevel - 1)) / Math.max(1, maxLevel)), 12, 24);
    for (var level = 1; level <= maxLevel; level += 1) {
      var y = top + (level - 1) * (barH + gap);
      var skipped = level > result.analysis.backjump && level < maxLevel;
      var current = level === maxLevel;
      ctx.fillStyle = current ? "rgba(190, 18, 60, 0.16)" : (skipped ? "rgba(217, 119, 6, 0.16)" : "rgba(15, 118, 110, 0.12)");
      roundRect(ctx, left, y, right - left, barH, 7);
      ctx.fill();
      label(ctx, "L" + level, left + 10, y + barH / 2, current ? COLORS.assert : (skipped ? COLORS.detour : COLORS.implied), 11, 850);
      label(ctx, current ? "conflict level" : (skipped ? "skipped by clause" : "kept"), right - 8, y + barH / 2, COLORS.muted, 10, 700, "right");
    }
    var clause = clauseName(result.analysis.finalClause, result.formula.names);
    var textY = Math.min(box.y + box.h - 30, top + maxLevel * (barH + gap) + 12);
    label(ctx, "learned: " + clause, left, textY, COLORS.text, 11, 800);
    label(ctx, "asserts " + litName(result.analysis.assertingLit, result.formula.names) + " at L" + result.analysis.backjump, left, textY + 18, COLORS.assert, 11, 800);
  }

  function drawCanvas(canvas, result) {
    if (!canvas) return;
    var size = canvasContext(canvas);
    var ctx = size.ctx;
    var w = size.width;
    var h = size.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    var gap = 12;
    if (w < 720) {
      var a = Math.round(h * 0.22);
      var b = Math.round(h * 0.28);
      var c = Math.round(h * 0.23);
      drawTrail(ctx, { x: 0, y: 0, w: w, h: a }, result);
      drawGraph(ctx, { x: 0, y: a + gap, w: w, h: b }, result);
      drawResolution(ctx, { x: 0, y: a + b + 2 * gap, w: w, h: c }, result);
      drawBackjump(ctx, { x: 0, y: a + b + c + 3 * gap, w: w, h: h - a - b - c - 3 * gap }, result);
    } else {
      var top = Math.round(h * 0.43);
      var half = (w - gap) / 2;
      drawTrail(ctx, { x: 0, y: 0, w: half, h: top }, result);
      drawGraph(ctx, { x: half + gap, y: 0, w: half, h: top }, result);
      drawResolution(ctx, { x: 0, y: top + gap, w: half, h: h - top - gap }, result);
      drawBackjump(ctx, { x: half + gap, y: top + gap, w: half, h: h - top - gap }, result);
    }
  }

  function updateOutputs(root, params, maxStep) {
    setText(root, "chain", String(params.chain));
    setText(root, "detours", String(params.detours));
    setText(root, "step", String(params.step));
    var stepInput = root.querySelector("[data-param='step']");
    if (stepInput) stepInput.max = String(maxStep);
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function syncControls(root, params) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (params[key] != null && input.value !== String(params[key])) input.value = String(params[key]);
    });
  }

  function render(root) {
    var params = readParams(root);
    var provisional = evaluate(params);
    params.step = Math.min(params.step, provisional.analysis.steps.length - 1);
    var result = evaluate(params);
    syncControls(root, result.params);
    updateOutputs(root, result.params, result.analysis.steps.length - 1);
    renderMetrics(root, result);
    renderNote(root, result);
    drawCanvas(root.querySelector("[data-role='canvas']"), result);
    root.__cdclConflictResult = result;
  }

  function init(root) {
    if (!root || root.__cdclConflictReady) return;
    root.__cdclConflictReady = true;
    var schedule = function () {
      if (root.__cdclConflictFrame) global.cancelAnimationFrame(root.__cdclConflictFrame);
      root.__cdclConflictFrame = global.requestAnimationFrame(function () {
        root.__cdclConflictFrame = null;
        render(root);
      });
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    schedule();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-cdcl-conflict-lab]")).forEach(init);
  }

  var api = {
    analyzeConflict: analyzeConflict,
    audit: audit,
    buildFormula: buildFormula,
    cleanParams: cleanParams,
    evaluate: evaluate,
    litValue: litValue,
    propagate: propagate,
    resolveClause: resolveClause
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CdclConflictLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
