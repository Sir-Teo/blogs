(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    rc: "#d97706",
    si: "#2563eb",
    ssi: "#0f766e",
    abort: "#be123c",
    retry: "#7c3aed",
    write: "#c2410c",
    read: "#475569",
    good: "#0f766e",
    bad: "#be123c"
  };

  function clone(object) {
    return JSON.parse(JSON.stringify(object));
  }

  function clampChoice(value, choices, fallback) {
    return choices.indexOf(value) >= 0 ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      isolation: clampChoice(raw.isolation || "snapshot", ["read_committed", "snapshot", "serializable"], "snapshot"),
      retry: raw.retry === true || raw.retry === "true" || raw.retry === "1" || raw.retry === "on",
      scenario: clampChoice(raw.scenario || "doctors", ["doctors", "counter", "phantom"], "doctors")
    };
  }

  function keyRead(key, label) {
    return { type: "key", key: key, label: label || key };
  }

  function predicateRead(key, label) {
    return { type: "predicate", key: key, label: label || key };
  }

  function write(key, value, label) {
    return { key: key, value: value, label: label || key };
  }

  function getScenario(name) {
    if (name === "counter") {
      return {
        name: "counter",
        title: "Lost update",
        subtitle: "two deposits read 0 and both write 1",
        invariantLabel: "one increment per committed deposit",
        rows: [
          { key: "counter", label: "balance counter" }
        ],
        initial: { counter: 0 },
        programs: [
          { id: "T1", actor: "deposit A", color: COLORS.si },
          { id: "T2", actor: "deposit B", color: COLORS.retry }
        ],
        evaluate: function (program, view) {
          var next = view.counter + 1;
          return {
            reads: [keyRead("counter", "counter = " + view.counter)],
            writes: [write("counter", next, "counter := " + next)],
            summary: program.actor + " reads " + view.counter + " and writes " + next
          };
        },
        check: function (state, successfulIds) {
          return state.counter === successfulIds.length;
        }
      };
    }

    if (name === "phantom") {
      return {
        name: "phantom",
        title: "Predicate write skew",
        subtitle: "two inserts pass the same empty-room predicate",
        invariantLabel: "at most one reservation for the slot",
        rows: [
          { key: "reservation:alice", label: "Alice reservation" },
          { key: "reservation:bob", label: "Bob reservation" }
        ],
        initial: {
          "reservation:alice": 0,
          "reservation:bob": 0
        },
        programs: [
          { id: "T1", actor: "Alice books", insertKey: "reservation:alice", color: COLORS.si },
          { id: "T2", actor: "Bob books", insertKey: "reservation:bob", color: COLORS.retry }
        ],
        evaluate: function (program, view) {
          var occupied = (view["reservation:alice"] || 0) + (view["reservation:bob"] || 0);
          return {
            reads: [predicateRead("slot:10am", "count(slot 10am) = " + occupied)],
            writes: occupied < 1 ? [write(program.insertKey, 1, program.actor + " inserts")] : [],
            summary: occupied < 1 ? program.actor + " sees room empty and inserts" : program.actor + " sees room full and stops"
          };
        },
        check: function (state) {
          return (state["reservation:alice"] || 0) + (state["reservation:bob"] || 0) <= 1;
        }
      };
    }

    return {
      name: "doctors",
      title: "Write skew",
      subtitle: "each doctor leaves because the other appeared on call",
      invariantLabel: "at least one doctor remains on call",
      rows: [
        { key: "doctor:alice", label: "Alice on call" },
        { key: "doctor:bob", label: "Bob on call" }
      ],
      initial: {
        "doctor:alice": 1,
        "doctor:bob": 1
      },
      programs: [
        { id: "T1", actor: "Alice", self: "doctor:alice", other: "doctor:bob", color: COLORS.si },
        { id: "T2", actor: "Bob", self: "doctor:bob", other: "doctor:alice", color: COLORS.retry }
      ],
      evaluate: function (program, view) {
        var otherOn = view[program.other] === 1;
        return {
          reads: [
            keyRead("doctor:alice", "Alice = " + onOff(view["doctor:alice"])),
            keyRead("doctor:bob", "Bob = " + onOff(view["doctor:bob"]))
          ],
          writes: otherOn ? [write(program.self, 0, program.actor + " := reserve")] : [],
          summary: otherOn ? program.actor + " sees backup and goes reserve" : program.actor + " sees no backup and stays"
        };
      },
      check: function (state) {
        return (state["doctor:alice"] || 0) + (state["doctor:bob"] || 0) >= 1;
      }
    };
  }

  function onOff(value) {
    return value ? "on" : "off";
  }

  function displayValue(scenario, key, value) {
    if (scenario.name === "counter") return String(value);
    if (scenario.name === "phantom") return value ? "yes" : "no";
    return value ? "on" : "off";
  }

  function applyWrites(state, writes) {
    writes.forEach(function (item) {
      state[item.key] = item.value;
    });
  }

  function writeMatchesRead(scenario, read, item) {
    if (read.type === "key") return read.key === item.key;
    if (scenario.name === "phantom" && read.key === "slot:10am") {
      return item.key.indexOf("reservation:") === 0 && item.value === 1;
    }
    return false;
  }

  function detectConflicts(scenario, txs) {
    var rw = [];
    var ww = [];
    txs.forEach(function (left) {
      txs.forEach(function (right) {
        if (left.id === right.id) return;
        left.reads.forEach(function (read) {
          right.writes.forEach(function (item) {
            if (writeMatchesRead(scenario, read, item)) {
              rw.push({
                from: left.id,
                to: right.id,
                label: read.type === "predicate" ? "predicate rw" : "rw(" + read.key.split(":").pop() + ")"
              });
            }
          });
        });
        left.writes.forEach(function (a) {
          right.writes.forEach(function (b) {
            if (a.key === b.key && left.id < right.id) {
              ww.push({ from: left.id, to: right.id, label: "ww(" + a.key.split(":").pop() + ")" });
            }
          });
        });
      });
    });
    var hasRwCycle = rw.some(function (edge) {
      return rw.some(function (other) {
        return edge.from === other.to && edge.to === other.from;
      });
    });
    return { rw: rw, ww: ww, hasRwCycle: hasRwCycle };
  }

  function evaluateConcurrent(scenario) {
    var base = clone(scenario.initial);
    return scenario.programs.map(function (program) {
      var evaluated = scenario.evaluate(program, clone(base));
      return {
        actor: program.actor,
        color: program.color,
        id: program.id,
        reads: evaluated.reads,
        status: "pending",
        summary: evaluated.summary,
        writes: evaluated.writes
      };
    });
  }

  function evaluateSerial(scenario, order) {
    var state = clone(scenario.initial);
    order.forEach(function (id) {
      var program = scenario.programs.filter(function (candidate) { return candidate.id === id; })[0];
      if (!program) return;
      var evaluated = scenario.evaluate(program, clone(state));
      applyWrites(state, evaluated.writes);
    });
    return state;
  }

  function stateSignature(scenario, state) {
    return scenario.rows.map(function (row) {
      return row.key + "=" + String(state[row.key] || 0);
    }).join("|");
  }

  function permutations(ids) {
    if (ids.length <= 1) return [ids.slice()];
    return [
      [ids[0], ids[1]],
      [ids[1], ids[0]]
    ];
  }

  function unique(ids) {
    var seen = {};
    return ids.filter(function (id) {
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function serialMatches(scenario, finalState, successfulIds) {
    var signature = stateSignature(scenario, finalState);
    var matches = [];
    permutations(unique(successfulIds)).forEach(function (order) {
      if (stateSignature(scenario, evaluateSerial(scenario, order)) === signature) {
        matches.push(order.join(" then "));
      }
    });
    return matches;
  }

  function makeEvents(txs, retryEvents) {
    var events = [];
    txs.forEach(function (tx, index) {
      var lane = index;
      events.push({ lane: lane, time: 1 + index * 0.25, type: "start", label: tx.id + " start" });
      events.push({ lane: lane, time: 2 + index * 0.25, type: "read", label: tx.reads.map(function (read) { return read.label; }).join("; ") });
      events.push({ lane: lane, time: 3 + index * 0.25, type: "write", label: tx.writes.length ? tx.writes.map(function (item) { return item.label; }).join("; ") : "no write" });
      events.push({ lane: lane, time: 5 + index * 0.5, type: tx.status === "aborted" ? "abort" : "commit", label: tx.status === "aborted" ? tx.abortReason : "commit" });
    });
    retryEvents.forEach(function (event) {
      events.push(event);
    });
    return events;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams);
    var scenario = getScenario(params.scenario);
    var txs = evaluateConcurrent(scenario);
    var conflicts = detectConflicts(scenario, txs);
    var finalState = clone(scenario.initial);
    var aborted = [];
    var retryEvents = [];

    txs[0].status = "committed";

    if (params.isolation === "snapshot" || params.isolation === "serializable") {
      if (conflicts.ww.length) {
        txs[1].status = "aborted";
        txs[1].abortReason = "write/write conflict";
        aborted.push(txs[1]);
      }
    }

    if (params.isolation === "serializable" && txs[1].status !== "aborted" && conflicts.hasRwCycle) {
      txs[1].status = "aborted";
      txs[1].abortReason = "rw-cycle risk";
      aborted.push(txs[1]);
    }

    if (txs[1].status !== "aborted") txs[1].status = "committed";

    txs.forEach(function (tx) {
      if (tx.status === "committed") applyWrites(finalState, tx.writes);
    });

    var retryCommitted = [];
    if (params.retry) {
      aborted.forEach(function (tx, index) {
        var program = scenario.programs.filter(function (candidate) { return candidate.id === tx.id; })[0];
        var evaluated = scenario.evaluate(program, clone(finalState));
        applyWrites(finalState, evaluated.writes);
        retryCommitted.push(tx.id);
        var lane = tx.id === "T1" ? 0 : 1;
        var offset = 7 + index * 1.6;
        retryEvents.push({ lane: lane, time: offset, type: "retry", label: tx.id + " retry reads current state" });
        retryEvents.push({ lane: lane, time: offset + 0.7, type: evaluated.writes.length ? "write" : "read", label: evaluated.writes.length ? evaluated.writes.map(function (item) { return item.label; }).join("; ") : "no-op after retry" });
        retryEvents.push({ lane: lane, time: offset + 1.2, type: "commit", label: "retry commit" });
      });
    }

    var originalCommitted = txs.filter(function (tx) { return tx.status === "committed"; }).map(function (tx) { return tx.id; });
    var successfulIds = unique(originalCommitted.concat(retryCommitted));
    var matchingOrders = serialMatches(scenario, finalState, successfulIds);
    var invariantOk = scenario.check(finalState, successfulIds);
    var modeLabels = {
      read_committed: "Read committed",
      snapshot: "Snapshot isolation",
      serializable: "Serializable SSI"
    };
    var serializable = matchingOrders.length > 0;
    var diagnosis;
    if (!serializable) diagnosis = "No serial order explains the committed result";
    else if (aborted.length) diagnosis = params.retry ? "Abort plus retry restores a serial result" : "Dangerous history was rejected";
    else diagnosis = "Equivalent to " + matchingOrders[0];

    return {
      aborted: aborted.map(function (tx) { return tx.id; }),
      conflicts: conflicts,
      diagnosis: diagnosis,
      events: makeEvents(txs, retryEvents),
      finalState: finalState,
      initialState: clone(scenario.initial),
      invariantOk: invariantOk,
      matchingOrders: matchingOrders,
      modeLabel: modeLabels[params.isolation],
      params: params,
      scenario: scenario,
      serializable: serializable,
      successfulIds: successfulIds,
      txs: txs
    };
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      if (input.type === "checkbox") params[input.getAttribute("data-param")] = input.checked;
      else params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function metric(label, value, tone) {
    var klass = tone ? " isolation-lab__metric isolation-lab__metric--" + tone : "isolation-lab__metric";
    return '<div class="' + klass + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function formatBool(value) {
    return value ? "yes" : "no";
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x + 14, box.y + 12);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 31);
    }
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/\s+/);
    var line = "";
    var lines = 0;
    for (var i = 0; i < words.length; i += 1) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        line = words[i];
        if (maxLines && lines >= maxLines) return;
      } else {
        line = test;
      }
    }
    if (line && (!maxLines || lines < maxLines)) ctx.fillText(line, x, y + lines * lineHeight);
  }

  function eventColor(type) {
    if (type === "abort") return COLORS.abort;
    if (type === "retry") return COLORS.retry;
    if (type === "write") return COLORS.write;
    if (type === "commit") return COLORS.good;
    return COLORS.read;
  }

  function drawTimeline(ctx, result, box) {
    panel(ctx, box, "History", result.scenario.title + ": " + result.scenario.subtitle);
    var left = box.x + 70;
    var right = box.x + box.w - 18;
    var top = box.y + 75;
    var laneGap = 72;
    var maxTime = Math.max.apply(null, result.events.map(function (event) { return event.time; }).concat([6]));
    function xScale(time) {
      return left + (time - 1) / Math.max(1, maxTime - 1) * (right - left);
    }
    result.txs.forEach(function (tx, index) {
      var y = top + index * laneGap;
      label(ctx, tx.id, box.x + 18, y, "left", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, tx.actor, box.x + 18, y + 17, "left");
      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    });
    result.events.forEach(function (event) {
      var y = top + event.lane * laneGap;
      var x = xScale(event.time);
      ctx.fillStyle = eventColor(event.type);
      ctx.beginPath();
      ctx.arc(x, y, event.type === "abort" ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = event.type === "abort" ? COLORS.abort : COLORS.muted;
      ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      wrapText(ctx, event.label, x - 34, y + 10, 68, 11, 3);
    });
  }

  function drawStateTable(ctx, result, box) {
    panel(ctx, box, "State", result.scenario.invariantLabel);
    var y = box.y + 62;
    label(ctx, "row", box.x + 16, y, "left", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "initial", box.x + box.w - 118, y, "left", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "final", box.x + box.w - 58, y, "left", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    result.scenario.rows.forEach(function (row, index) {
      var rowY = y + 30 + index * 30;
      ctx.fillStyle = index % 2 ? "rgba(215, 222, 229, 0.22)" : "transparent";
      ctx.fillRect(box.x + 10, rowY - 14, box.w - 20, 26);
      label(ctx, row.label, box.x + 16, rowY, "left", COLORS.text);
      label(ctx, displayValue(result.scenario, row.key, result.initialState[row.key] || 0), box.x + box.w - 118, rowY, "left");
      label(ctx, displayValue(result.scenario, row.key, result.finalState[row.key] || 0), box.x + box.w - 58, rowY, "left", result.invariantOk ? COLORS.good : COLORS.bad, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
    var badge = result.invariantOk ? "invariant holds" : "invariant broken";
    ctx.fillStyle = result.invariantOk ? "rgba(15,118,110,0.10)" : "rgba(190,18,60,0.10)";
    ctx.strokeStyle = result.invariantOk ? COLORS.good : COLORS.bad;
    drawRoundRect(ctx, box.x + 14, box.y + box.h - 44, box.w - 28, 28, 6);
    ctx.fill();
    ctx.stroke();
    label(ctx, badge, box.x + box.w / 2, box.y + box.h - 30, "center", result.invariantOk ? COLORS.good : COLORS.bad, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawConflictGraph(ctx, result, box) {
    panel(ctx, box, "Conflict graph", "rw anti-dependencies are the shape SSI watches");
    var cx1 = box.x + box.w * 0.32;
    var cx2 = box.x + box.w * 0.68;
    var cy = box.y + box.h * 0.48;
    [
      { id: "T1", x: cx1, y: cy, color: COLORS.si },
      { id: "T2", x: cx2, y: cy, color: COLORS.retry }
    ].forEach(function (node) {
      ctx.fillStyle = "rgba(248,250,252,1)";
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(ctx, node.id, node.x, node.y, "center", COLORS.text, "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
    result.conflicts.rw.forEach(function (edge, index) {
      var fromX = edge.from === "T1" ? cx1 + 28 : cx2 - 28;
      var toX = edge.to === "T1" ? cx1 + 28 : cx2 - 28;
      var arcY = cy + (edge.from === "T1" ? -34 : 34);
      ctx.strokeStyle = COLORS.abort;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(fromX, cy);
      ctx.quadraticCurveTo((cx1 + cx2) / 2, arcY, toX, cy);
      ctx.stroke();
      ctx.fillStyle = COLORS.abort;
      var arrowX = edge.to === "T1" ? toX + 4 : toX - 4;
      ctx.beginPath();
      ctx.arc(arrowX, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, edge.label, (cx1 + cx2) / 2, arcY + (index ? 13 : -13), "center", COLORS.abort);
    });
    if (!result.conflicts.rw.length) {
      label(ctx, "no rw anti-dependency cycle", box.x + box.w / 2, cy + 48, "center");
    }
    if (result.conflicts.ww.length) {
      label(ctx, "write/write conflict: " + result.conflicts.ww[0].label, box.x + box.w / 2, box.y + box.h - 31, "center", COLORS.write, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    } else {
      label(ctx, result.conflicts.hasRwCycle ? "cycle detected" : "no cycle detected", box.x + box.w / 2, box.y + box.h - 31, "center", result.conflicts.hasRwCycle ? COLORS.bad : COLORS.good, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    }
  }

  function drawDiagnosis(ctx, result, box) {
    panel(ctx, box, "Diagnosis", result.modeLabel);
    var lines = [
      "Committed attempts: " + (result.successfulIds.length ? result.successfulIds.join(", ") : "none"),
      "Aborted before retry: " + (result.aborted.length ? result.aborted.join(", ") : "none"),
      "Serializable result: " + formatBool(result.serializable),
      result.diagnosis
    ];
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    lines.forEach(function (line, index) {
      wrapText(ctx, line, box.x + 16, box.y + 64 + index * 34, box.w - 32, 15, 2);
    });
  }

  function drawChart(canvas, result) {
    var ratio = global.devicePixelRatio || 1;
    var parentWidth = canvas.parentElement ? canvas.parentElement.getBoundingClientRect().width : 900;
    var cssWidth = Math.max(320, parentWidth);
    var compact = cssWidth < 620;
    var cssHeight = compact ? 980 : 620;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    var margin = compact ? 14 : 20;
    if (compact) {
      var w = cssWidth - margin * 2;
      drawTimeline(ctx, result, { x: margin, y: 16, w: w, h: 300 });
      drawStateTable(ctx, result, { x: margin, y: 336, w: w, h: 190 });
      drawConflictGraph(ctx, result, { x: margin, y: 546, w: w, h: 202 });
      drawDiagnosis(ctx, result, { x: margin, y: 768, w: w, h: 188 });
    } else {
      var gap = 18;
      var leftW = Math.max(410, cssWidth * 0.58);
      var rightW = cssWidth - margin * 2 - gap - leftW;
      drawTimeline(ctx, result, { x: margin, y: 20, w: leftW, h: 280 });
      drawStateTable(ctx, result, { x: margin + leftW + gap, y: 20, w: rightW, h: 280 });
      drawConflictGraph(ctx, result, { x: margin, y: 320, w: leftW, h: 260 });
      drawDiagnosis(ctx, result, { x: margin + leftW + gap, y: 320, w: rightW, h: 260 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("scenario", result.scenario.title),
        metric("mode", result.modeLabel),
        metric("serializable", formatBool(result.serializable), result.serializable ? "good" : "bad"),
        metric("invariant", result.invariantOk ? "holds" : "broken", result.invariantOk ? "good" : "bad"),
        metric("committed", String(result.successfulIds.length)),
        metric("aborted", String(result.aborted.length)),
        metric("rw edges", String(result.conflicts.rw.length)),
        metric("diagnosis", result.diagnosis)
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-isolation-lab]")).forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    detectConflicts: detectConflicts,
    evaluateSerial: evaluateSerial,
    getScenario: getScenario,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.IsolationHistoryLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
}(typeof window !== "undefined" ? window : globalThis));
