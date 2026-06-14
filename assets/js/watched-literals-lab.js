(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    naive: "#b45309",
    watched: "#2563eb",
    move: "#7c3aed",
    imply: "#0f766e",
    conflict: "#be123c",
    gray: "#64748b"
  };

  var DEFAULTS = {
    variables: 72,
    clauses: 520,
    width: 6,
    decisions: 28,
    chain: 22,
    mistakes: 0,
    seed: 31
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
    var variables = clamp(Math.round(raw.variables == null ? DEFAULTS.variables : raw.variables), 18, 140);
    return {
      chain: clamp(Math.round(raw.chain == null ? DEFAULTS.chain : raw.chain), 0, Math.max(0, variables - 2)),
      clauses: clamp(Math.round(raw.clauses == null ? DEFAULTS.clauses : raw.clauses), 80, 1400),
      decisions: clamp(Math.round(raw.decisions == null ? DEFAULTS.decisions : raw.decisions), 4, Math.max(4, variables - 1)),
      mistakes: clamp(Number(raw.mistakes == null ? DEFAULTS.mistakes : raw.mistakes), 0, 30),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 999),
      variables: variables,
      width: clamp(Math.round(raw.width == null ? DEFAULTS.width : raw.width), 3, 10)
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
    return '<div class="watch-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function litIndex(lit, n) {
    var v = Math.abs(lit) - 1;
    return lit > 0 ? v : n + v;
  }

  function litName(lit) {
    return (lit < 0 ? "~" : "") + "x" + Math.abs(lit);
  }

  function litValue(lit, assignment) {
    var value = assignment[Math.abs(lit)];
    if (value === 0) return 0;
    return lit > 0 ? value : -value;
  }

  function assignLiteral(lit, assignment) {
    var variable = Math.abs(lit);
    var value = lit > 0 ? 1 : -1;
    if (assignment[variable] === -value) return false;
    assignment[variable] = value;
    return true;
  }

  function plantedLit(variable, planted) {
    return planted[variable] ? variable : -variable;
  }

  function shuffle(values, rand) {
    var out = values.slice();
    for (var i = out.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function uniqueVariables(count, n, rand) {
    var used = {};
    var vars = [];
    while (vars.length < count) {
      var variable = 1 + Math.floor(rand() * n);
      if (!used[variable]) {
        used[variable] = true;
        vars.push(variable);
      }
    }
    return vars;
  }

  function makeFormula(rawParams) {
    var params = cleanParams(rawParams);
    var rand = rng(params.seed * 1000003 + params.variables * 9176 + params.clauses * 131 + params.width * 41);
    var planted = new Array(params.variables + 1);
    var clauses = [];
    var chainVars = shuffle(Array.from({ length: params.variables }, function (_, i) { return i + 1; }), rand);
    var i;
    var j;

    for (i = 1; i <= params.variables; i += 1) planted[i] = rand() < 0.5;

    for (i = 0; i < params.chain; i += 1) {
      var a = chainVars[i];
      var b = chainVars[i + 1];
      clauses.push([-plantedLit(a, planted), plantedLit(b, planted)]);
    }

    for (i = 0; i < params.clauses; i += 1) {
      var vars = uniqueVariables(params.width, params.variables, rand);
      var clause = [];
      var satisfied = false;
      for (j = 0; j < vars.length; j += 1) {
        var sign = rand() < 0.5 ? 1 : -1;
        var lit = sign * vars[j];
        if ((lit > 0) === planted[vars[j]]) satisfied = true;
        clause.push(lit);
      }
      if (!satisfied) {
        var flip = Math.floor(rand() * clause.length);
        clause[flip] = plantedLit(Math.abs(clause[flip]), planted);
      }
      clauses.push(clause);
    }

    var decisions = [plantedLit(chainVars[0], planted)];
    var decisionVars = shuffle(Array.from({ length: params.variables }, function (_, k) { return k + 1; }), rand);
    var usedDecision = {};
    usedDecision[chainVars[0]] = true;
    for (i = 0; i < decisionVars.length && decisions.length < params.decisions; i += 1) {
      var v = decisionVars[i];
      if (usedDecision[v]) continue;
      var litDecision = plantedLit(v, planted);
      if (rand() < params.mistakes / 100) litDecision = -litDecision;
      decisions.push(litDecision);
      usedDecision[v] = true;
    }

    return {
      chainVars: chainVars.slice(0, params.chain + 1),
      clauses: clauses,
      decisions: decisions,
      planted: planted,
      params: params
    };
  }

  function clauseStatus(clause, assignment) {
    var unassigned = [];
    var falses = 0;
    var inspections = 0;
    for (var i = 0; i < clause.length; i += 1) {
      inspections += 1;
      var value = litValue(clause[i], assignment);
      if (value === 1) return { inspections: inspections, kind: "satisfied" };
      if (value === 0) unassigned.push(clause[i]);
      else falses += 1;
    }
    if (unassigned.length === 0) return { inspections: inspections, kind: "conflict" };
    if (unassigned.length === 1) return { inspections: inspections, kind: "unit", unit: unassigned[0] };
    return { inspections: inspections, kind: "open", falses: falses, unassigned: unassigned.length };
  }

  function buildOccurrences(formula) {
    var n = formula.params.variables;
    var occurrences = Array.from({ length: 2 * n }, function () { return []; });
    for (var ci = 0; ci < formula.clauses.length; ci += 1) {
      var clause = formula.clauses[ci];
      for (var j = 0; j < clause.length; j += 1) occurrences[litIndex(clause[j], n)].push(ci);
    }
    return occurrences;
  }

  function runOccurrence(formula) {
    var n = formula.params.variables;
    var assignment = new Array(n + 1).fill(0);
    var occurrences = buildOccurrences(formula);
    var queue = [];
    var implied = 0;
    var decisionsMade = 0;
    var conflict = null;
    var visits = 0;
    var inspections = 0;
    var timeline = [];

    function enqueue(lit, reason, kind) {
      var variable = Math.abs(lit);
      if (assignment[variable] === 0) {
        assignment[variable] = lit > 0 ? 1 : -1;
        queue.push({ kind: kind || "implication", lit: lit, reason: reason });
        return true;
      }
      if (assignment[variable] !== (lit > 0 ? 1 : -1)) {
        conflict = { clause: reason, lit: lit };
        return false;
      }
      return true;
    }

    for (var d = 0; d < formula.decisions.length && !conflict; d += 1) {
      var decision = formula.decisions[d];
      if (assignment[Math.abs(decision)] !== 0) continue;
      decisionsMade += 1;
      enqueue(decision, -1, "decision");

      while (queue.length && !conflict) {
        var item = queue.shift();
        var falsified = -item.lit;
        var list = occurrences[litIndex(falsified, n)];
        var stepVisits = 0;
        var stepInspections = 0;
        var stepImplications = 0;

        for (var oi = 0; oi < list.length && !conflict; oi += 1) {
          var ci = list[oi];
          visits += 1;
          stepVisits += 1;
          var status = clauseStatus(formula.clauses[ci], assignment);
          inspections += status.inspections;
          stepInspections += status.inspections;
          if (status.kind === "unit") {
            if (assignment[Math.abs(status.unit)] === 0) {
              implied += 1;
              stepImplications += 1;
              enqueue(status.unit, ci, "implication");
            }
          } else if (status.kind === "conflict") {
            conflict = { clause: ci, lit: item.lit };
          }
        }

        timeline.push({
          engine: "occurrence",
          implications: stepImplications,
          inspections: stepInspections,
          lit: item.lit,
          visits: stepVisits
        });
      }
    }

    return {
      assigned: assignment.filter(function (value) { return value !== 0; }).length,
      assignment: assignment,
      conflict: conflict,
      decisions: decisionsMade,
      implied: implied,
      inspections: inspections,
      timeline: timeline,
      visits: visits
    };
  }

  function initWatchState(formula) {
    var n = formula.params.variables;
    var watches = Array.from({ length: 2 * n }, function () { return []; });
    var watched = [];
    for (var ci = 0; ci < formula.clauses.length; ci += 1) {
      var clause = formula.clauses[ci];
      var pair = clause.length === 1 ? [0, 0] : [0, 1];
      watched[ci] = pair;
      watches[litIndex(clause[pair[0]], n)].push(ci);
      if (pair[1] !== pair[0]) watches[litIndex(clause[pair[1]], n)].push(ci);
    }
    return { watched: watched, watches: watches };
  }

  function removeWatch(list, clauseIndex) {
    var pos = list.indexOf(clauseIndex);
    if (pos >= 0) list.splice(pos, 1);
  }

  function runWatched(formula) {
    var n = formula.params.variables;
    var assignment = new Array(n + 1).fill(0);
    var state = initWatchState(formula);
    var watches = state.watches;
    var watched = state.watched;
    var queue = [];
    var implied = 0;
    var decisionsMade = 0;
    var conflict = null;
    var visits = 0;
    var inspections = 0;
    var moves = 0;
    var timeline = [];

    function enqueue(lit, reason, kind) {
      var variable = Math.abs(lit);
      if (assignment[variable] === 0) {
        assignment[variable] = lit > 0 ? 1 : -1;
        queue.push({ kind: kind || "implication", lit: lit, reason: reason });
        return true;
      }
      if (assignment[variable] !== (lit > 0 ? 1 : -1)) {
        conflict = { clause: reason, lit: lit };
        return false;
      }
      return true;
    }

    for (var d = 0; d < formula.decisions.length && !conflict; d += 1) {
      var decision = formula.decisions[d];
      if (assignment[Math.abs(decision)] !== 0) continue;
      decisionsMade += 1;
      enqueue(decision, -1, "decision");

      while (queue.length && !conflict) {
        var item = queue.shift();
        var falsified = -item.lit;
        var watchIndex = litIndex(falsified, n);
        var list = watches[watchIndex].slice();
        var stepVisits = 0;
        var stepInspections = 0;
        var stepImplications = 0;
        var stepMoves = 0;

        for (var li = 0; li < list.length && !conflict; li += 1) {
          var ci = list[li];
          var clause = formula.clauses[ci];
          var pair = watched[ci];
          var watchSlot = clause[pair[0]] === falsified ? 0 : clause[pair[1]] === falsified ? 1 : -1;
          if (watchSlot < 0) continue;

          var otherSlot = 1 - watchSlot;
          var otherLit = clause[pair[otherSlot]];
          visits += 1;
          stepVisits += 1;

          var moved = false;
          for (var k = 0; k < clause.length; k += 1) {
            inspections += 1;
            stepInspections += 1;
            if (k === pair[otherSlot]) continue;
            if (litValue(clause[k], assignment) !== -1) {
              removeWatch(watches[watchIndex], ci);
              pair[watchSlot] = k;
              watches[litIndex(clause[k], n)].push(ci);
              moves += 1;
              stepMoves += 1;
              moved = true;
              break;
            }
          }

          if (moved) continue;
          var otherValue = litValue(otherLit, assignment);
          if (otherValue === -1) {
            conflict = { clause: ci, lit: item.lit };
          } else if (otherValue === 0) {
            implied += 1;
            stepImplications += 1;
            enqueue(otherLit, ci, "implication");
          }
        }

        timeline.push({
          engine: "watched",
          implications: stepImplications,
          inspections: stepInspections,
          lit: item.lit,
          moves: stepMoves,
          visits: stepVisits
        });
      }
    }

    return {
      assigned: assignment.filter(function (value) { return value !== 0; }).length,
      assignment: assignment,
      conflict: conflict,
      decisions: decisionsMade,
      implied: implied,
      inspections: inspections,
      moves: moves,
      timeline: timeline,
      visits: visits,
      watched: watched
    };
  }

  function classifyClauses(formula, assignment, watched) {
    var rows = [];
    var counts = { conflict: 0, open: 0, satisfied: 0, unit: 0 };
    for (var ci = 0; ci < formula.clauses.length; ci += 1) {
      var status = clauseStatus(formula.clauses[ci], assignment);
      counts[status.kind] = (counts[status.kind] || 0) + 1;
      rows.push({
        clause: formula.clauses[ci],
        index: ci,
        status: status.kind,
        watched: watched ? watched[ci] : null
      });
    }
    return { counts: counts, rows: rows };
  }

  function sameAssignments(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  function evaluate(rawParams) {
    var formula = makeFormula(rawParams);
    var occurrence = runOccurrence(formula);
    var watched = runWatched(formula);
    var sameConflictState = !!occurrence.conflict === !!watched.conflict;
    var equivalent = sameConflictState && (watched.conflict || sameAssignments(occurrence.assignment, watched.assignment));
    var clauseSummary = classifyClauses(formula, watched.assignment, watched.watched);
    return {
      clauseSummary: clauseSummary,
      equivalent: equivalent,
      formula: formula,
      occurrence: occurrence,
      params: formula.params,
      watched: watched
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
      chain: String(params.chain),
      clauses: formatNumber(params.clauses, 0),
      decisions: String(params.decisions),
      mistakes: Math.round(params.mistakes) + "%",
      seed: String(params.seed),
      variables: String(params.variables),
      width: String(params.width)
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

  function drawWorkLedger(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "propagation work", "same implications, different clause traffic");
    var rows = [
      { color: COLORS.naive, label: "occurrence-list BCP", value: result.occurrence.visits, reads: result.occurrence.inspections },
      { color: COLORS.watched, label: "watched literals", value: result.watched.visits, reads: result.watched.inspections }
    ];
    var maxValue = Math.max(1, rows[0].value, rows[1].value);
    var left = x + 126;
    var right = x + w - 22;
    var top = y + 78;
    for (var i = 0; i < rows.length; i += 1) {
      var yy = top + i * 58;
      drawText(ctx, rows[i].label, x + 16, yy + 12, 11, COLORS.text, 700);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy, right - left, 18);
      ctx.fillStyle = rows[i].color;
      ctx.fillRect(left, yy, (right - left) * rows[i].value / maxValue, 18);
      drawText(ctx, formatNumber(rows[i].value, 0) + " clause visits", right, yy - 6, 10, rows[i].color, 750, "right");
      drawText(ctx, formatNumber(rows[i].reads, 0) + " literal reads", right, yy + 40, 10, COLORS.muted, 600, "right");
    }
    drawText(ctx, "equivalent final trail: " + (result.equivalent ? "yes" : "no"), x + 16, y + h - 18, 11, result.equivalent ? COLORS.imply : COLORS.conflict, 750);
  }

  function drawTraffic(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "traffic by assignment", "watched clauses wake only when a watched literal is falsified");
    var occ = result.occurrence.timeline;
    var wat = result.watched.timeline;
    var len = Math.min(Math.max(occ.length, wat.length), 80);
    var left = x + 34;
    var right = x + w - 18;
    var top = y + 62;
    var bottom = y + h - 34;
    var maxValue = 1;
    var i;
    for (i = 0; i < len; i += 1) {
      if (occ[i]) maxValue = Math.max(maxValue, occ[i].visits);
      if (wat[i]) maxValue = Math.max(maxValue, wat[i].visits);
    }
    var bw = (right - left) / Math.max(1, len);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    for (i = 0; i < len; i += 1) {
      var xx = left + i * bw;
      var occH = occ[i] ? (bottom - top) * occ[i].visits / maxValue : 0;
      var watH = wat[i] ? (bottom - top) * wat[i].visits / maxValue : 0;
      ctx.fillStyle = COLORS.naive;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(xx + bw * 0.12, bottom - occH, Math.max(1, bw * 0.32), occH);
      ctx.fillStyle = COLORS.watched;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(xx + bw * 0.48, bottom - watH, Math.max(1, bw * 0.32), watH);
      ctx.globalAlpha = 1;
    }
    drawText(ctx, "occurrence", left, y + h - 12, 10, COLORS.naive, 750);
    drawText(ctx, "watched", left + 80, y + h - 12, 10, COLORS.watched, 750);
  }

  function drawClauses(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "clause database snapshot", "sampled clauses after propagation");
    var rows = result.clauseSummary.rows;
    var cols = 26;
    var cell = Math.min((w - 34) / cols, 12);
    var left = x + 17;
    var top = y + 60;
    var maxRows = Math.floor((h - 86) / cell);
    var sampleCount = Math.min(rows.length, cols * maxRows);
    var stride = Math.max(1, Math.floor(rows.length / sampleCount));
    var colors = {
      conflict: COLORS.conflict,
      open: "#e2e8f0",
      satisfied: "#d1fae5",
      unit: "#fef3c7"
    };
    for (var i = 0; i < sampleCount; i += 1) {
      var row = rows[Math.min(rows.length - 1, i * stride)];
      var col = i % cols;
      var rr = Math.floor(i / cols);
      ctx.fillStyle = colors[row.status] || COLORS.faint;
      ctx.fillRect(left + col * cell, top + rr * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
      if (row.watched) {
        ctx.fillStyle = COLORS.watched;
        ctx.fillRect(left + col * cell + cell * 0.35, top + rr * cell + cell * 0.35, Math.max(1, cell * 0.3), Math.max(1, cell * 0.3));
      }
    }
    var counts = result.clauseSummary.counts;
    drawText(ctx, "sat " + counts.satisfied + "  open " + counts.open + "  unit " + counts.unit + "  conflict " + counts.conflict, left, y + h - 14, 10, COLORS.muted, 650);
  }

  function drawClauseDetail(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "one watched clause", "the watched pair is the clause's alarm");
    var rows = result.clauseSummary.rows;
    var chosen = rows.find(function (row) { return row.clause.length >= result.params.width && row.status === "open"; }) || rows[0];
    var clause = chosen.clause;
    var watched = chosen.watched || [0, 1];
    var left = x + 18;
    var top = y + 76;
    var boxW = Math.min(70, Math.max(40, (w - 36) / clause.length - 5));
    var boxH = 36;
    for (var i = 0; i < clause.length; i += 1) {
      var value = litValue(clause[i], result.watched.assignment);
      var xx = left + i * (boxW + 5);
      var isWatch = watched[0] === i || watched[1] === i;
      ctx.fillStyle = value === 1 ? "#d1fae5" : value === -1 ? "#fee2e2" : "#eff6ff";
      ctx.strokeStyle = isWatch ? COLORS.watched : COLORS.rule;
      ctx.lineWidth = isWatch ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(xx, top, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();
      drawText(ctx, litName(clause[i]), xx + boxW / 2, top + 22, 11, COLORS.text, 750, "center");
      if (isWatch) drawText(ctx, "watch", xx + boxW / 2, top + boxH + 15, 9, COLORS.watched, 700, "center");
    }
    ctx.lineWidth = 1;
    drawText(ctx, "status: " + chosen.status + "   clause #" + chosen.index, left, y + h - 18, 11, COLORS.text, 700);
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
      drawWorkLedger(ctx, result, pad, pad, width - pad * 2, panelH);
      drawTraffic(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawClauses(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawClauseDetail(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }
    var halfW = (width - pad * 2 - gap) / 2;
    var halfH = (height - pad * 2 - gap) / 2;
    drawWorkLedger(ctx, result, pad, pad, halfW, halfH);
    drawTraffic(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawClauses(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawClauseDetail(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function updateMetrics(metrics, result) {
    var visitRatio = result.watched.visits ? result.occurrence.visits / result.watched.visits : Infinity;
    var readRatio = result.watched.inspections ? result.occurrence.inspections / result.watched.inspections : Infinity;
    metrics.innerHTML = [
      metric("clause visits saved", formatNumber(result.occurrence.visits - result.watched.visits, 0)),
      metric("visit reduction", formatNumber(visitRatio, 1) + "x"),
      metric("literal-read reduction", formatNumber(readRatio, 1) + "x"),
      metric("watch moves", formatNumber(result.watched.moves, 0)),
      metric("implied assignments", String(result.watched.implied)),
      metric("final assigned vars", result.watched.assigned + " / " + result.params.variables),
      metric("conflict", result.watched.conflict ? "yes" : "no"),
      metric("engines agree", result.equivalent ? "yes" : "no")
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
    var labs = document.querySelectorAll("[data-watched-literals-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    clauseStatus: clauseStatus,
    evaluate: evaluate,
    litValue: litValue,
    makeFormula: makeFormula,
    runOccurrence: runOccurrence,
    runWatched: runWatched,
    sameAssignments: sameAssignments
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.WatchedLiteralsLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
