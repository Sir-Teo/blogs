(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    add: "#0f766e",
    remove: "#be123c",
    amber: "#d97706",
    blue: "#2563eb",
    purple: "#7c3aed",
    bg: "#ffffff",
    chip: "#ecfeff",
    tombstone: "#fce7f3"
  };

  var MODELS = {
    gset: {
      label: "Grow-only set",
      laws: { commutative: true, associative: true, idempotent: true, deletes: false },
      blurb: "Converges because it only grows. The price is that remove is not a real operation."
    },
    naive: {
      label: "Naive add/remove",
      laws: { commutative: false, associative: false, idempotent: false, deletes: true },
      blurb: "Applies add and remove in delivery order. Concurrent operations can change meaning when reordered."
    },
    lww: {
      label: "Last-writer-wins set",
      laws: { commutative: true, associative: true, idempotent: true, deletes: true },
      blurb: "Converges by choosing the largest timestamp. The clock becomes part of the semantics."
    },
    orset: {
      label: "Observed-remove set",
      laws: { commutative: true, associative: true, idempotent: true, deletes: true },
      blurb: "Tags each add with a unique dot. A remove erases only the dots it has observed."
    }
  };

  var SCENARIOS = {
    edit: {
      label: "Delete vs offline edit",
      initial: [
        { item: "draft", dot: "S0" }
      ],
      ops: function (skew) {
        return [
          { id: "A1", actor: "A", kind: "remove", item: "draft", seen: ["S0"], ts: 10, note: "delete old draft" },
          { id: "A2", actor: "A", kind: "add", item: "abstract", dot: "A2", ts: 12, note: "add abstract" },
          { id: "B1", actor: "B", kind: "add", item: "draft", dot: "B1", ts: 11 + skew, note: "offline edit" },
          { id: "B2", actor: "B", kind: "add", item: "figure", dot: "B2", ts: 13 + skew, note: "add figure" }
        ];
      }
    },
    growth: {
      label: "Independent additions",
      initial: [],
      ops: function (skew) {
        return [
          { id: "A1", actor: "A", kind: "add", item: "lemma", dot: "A1", ts: 10, note: "add lemma" },
          { id: "A2", actor: "A", kind: "add", item: "proof", dot: "A2", ts: 12, note: "add proof" },
          { id: "B1", actor: "B", kind: "add", item: "plot", dot: "B1", ts: 11 + skew, note: "add plot" },
          { id: "B2", actor: "B", kind: "add", item: "appendix", dot: "B2", ts: 13 + skew, note: "add appendix" }
        ];
      }
    },
    readd: {
      label: "Delete while another tab re-adds",
      initial: [
        { item: "todo", dot: "S0" },
        { item: "link", dot: "S1" }
      ],
      ops: function (skew) {
        return [
          { id: "A1", actor: "A", kind: "remove", item: "todo", seen: ["S0"], ts: 10, note: "finish todo" },
          { id: "A2", actor: "A", kind: "remove", item: "link", seen: ["S1"], ts: 14, note: "drop stale link" },
          { id: "B1", actor: "B", kind: "add", item: "todo", dot: "B1", ts: 11 + skew, note: "new todo" },
          { id: "B2", actor: "B", kind: "add", item: "quote", dot: "B2", ts: 13 + skew, note: "add quote" }
        ];
      }
    }
  };

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cloneArray(value) {
    return value ? value.slice().sort() : [];
  }

  function sortedKeys(object) {
    return Object.keys(object || {}).sort();
  }

  function ensureList(object, key) {
    if (!object[key]) object[key] = [];
    return object[key];
  }

  function addUnique(list, value) {
    if (list.indexOf(value) === -1) list.push(value);
  }

  function removeUnique(list, value) {
    var index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1);
  }

  function cloneState(state) {
    var out = JSON.parse(JSON.stringify(state));
    return out;
  }

  function formatItems(items) {
    return items.length ? items.join(", ") : "empty";
  }

  function metric(label, value) {
    return '<div class="crdt-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function makeInitial(model, scenario) {
    var state;
    if (model === "gset" || model === "naive") {
      state = { visible: {} };
      scenario.initial.forEach(function (row) { state.visible[row.item] = true; });
      return state;
    }
    if (model === "lww") {
      state = { records: {} };
      scenario.initial.forEach(function (row) {
        state.records[row.item] = { kind: "add", ts: 0, actor: "S", id: row.dot };
      });
      return state;
    }
    state = { adds: {}, removes: {} };
    scenario.initial.forEach(function (row) {
      addUnique(ensureList(state.adds, row.item), row.dot);
    });
    return state;
  }

  function compareStamp(a, b) {
    if (!b) return 1;
    if (a.ts !== b.ts) return a.ts - b.ts;
    if (a.actor !== b.actor) return a.actor > b.actor ? 1 : -1;
    if (a.id !== b.id) return a.id > b.id ? 1 : -1;
    return 0;
  }

  function applyOp(model, state, op) {
    if (model === "gset") {
      if (op.kind === "add") state.visible[op.item] = true;
      return state;
    }
    if (model === "naive") {
      state.visible[op.item] = op.kind === "add";
      return state;
    }
    if (model === "lww") {
      var candidate = { kind: op.kind, ts: op.ts, actor: op.actor, id: op.id };
      if (compareStamp(candidate, state.records[op.item]) >= 0) state.records[op.item] = candidate;
      return state;
    }
    if (op.kind === "add") {
      addUnique(ensureList(state.adds, op.item), op.dot);
    } else {
      op.seen.forEach(function (dot) {
        addUnique(ensureList(state.removes, op.item), dot);
      });
    }
    return state;
  }

  function materialize(model, state) {
    var items = [];
    if (model === "gset" || model === "naive") {
      sortedKeys(state.visible).forEach(function (item) {
        if (state.visible[item]) items.push(item);
      });
      return items;
    }
    if (model === "lww") {
      sortedKeys(state.records).forEach(function (item) {
        if (state.records[item].kind === "add") items.push(item);
      });
      return items;
    }
    sortedKeys(state.adds).forEach(function (item) {
      var adds = state.adds[item] || [];
      var removes = state.removes[item] || [];
      var live = adds.some(function (dot) { return removes.indexOf(dot) === -1; });
      if (live) items.push(item);
    });
    return items;
  }

  function stateUnits(model, state) {
    if (model === "gset" || model === "naive") return sortedKeys(state.visible).length;
    if (model === "lww") return sortedKeys(state.records).length;
    var adds = sortedKeys(state.adds).reduce(function (sum, item) {
      return sum + state.adds[item].length;
    }, 0);
    var removes = sortedKeys(state.removes).reduce(function (sum, item) {
      return sum + state.removes[item].length;
    }, 0);
    return adds + removes;
  }

  function tombstones(model, state) {
    if (model !== "orset") return 0;
    return sortedKeys(state.removes).reduce(function (sum, item) {
      return sum + state.removes[item].length;
    }, 0);
  }

  function shuffle(ops, rand) {
    var out = ops.slice();
    for (var i = out.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rand() * (i + 1));
      var temp = out[i];
      out[i] = out[j];
      out[j] = temp;
    }
    return out;
  }

  function runOrder(model, scenario, ops, order) {
    var state = makeInitial(model, scenario);
    order.forEach(function (op) { applyOp(model, state, op); });
    return state;
  }

  function localState(model, scenario, ops, actor) {
    var state = makeInitial(model, scenario);
    ops.filter(function (op) { return op.actor === actor; }).forEach(function (op) {
      applyOp(model, state, op);
    });
    return state;
  }

  function canonical(model, state) {
    return formatItems(materialize(model, state));
  }

  function simulate(params) {
    var model = params.model || "orset";
    var scenario = SCENARIOS[params.scenario] || SCENARIOS.edit;
    var ops = scenario.ops(params.clockSkew || 0);
    var modelIndex = ["gset", "naive", "lww", "orset"].indexOf(model);
    var scenarioIndex = ["edit", "growth", "readd"].indexOf(params.scenario);
    var seed = 20260613 + (modelIndex + 2) * 1009 + (scenarioIndex + 3) * 313 + (params.trials || 120) * 17 + Math.round((params.clockSkew || 0) * 29);
    var rand = rng(seed);
    var counts = {};
    var examples = {};
    var trials = Math.max(1, params.trials || 120);
    for (var t = 0; t < trials; t += 1) {
      var order = shuffle(ops, rand);
      var state = runOrder(model, scenario, ops, order);
      var key = canonical(model, state);
      counts[key] = (counts[key] || 0) + 1;
      if (!examples[key]) examples[key] = order.map(function (op) { return op.id; });
    }
    var outcomes = sortedKeys(counts).map(function (key) {
      return { key: key, count: counts[key], example: examples[key] };
    }).sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.key < b.key ? -1 : 1;
    });
    var stateA = localState(model, scenario, ops, "A");
    var stateB = localState(model, scenario, ops, "B");
    var merged = runOrder(model, scenario, ops, ops);
    return {
      model: model,
      scenario: params.scenario,
      scenarioLabel: scenario.label,
      ops: ops,
      outcomes: outcomes,
      distinct: outcomes.length,
      modal: outcomes[0],
      stateA: stateA,
      stateB: stateB,
      merged: merged,
      visible: materialize(model, merged),
      units: stateUnits(model, merged),
      tombstones: tombstones(model, merged),
      trials: trials
    };
  }

  function label(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    label(ctx, title, box.x, box.y - 12, "left", "bottom", COLORS.text);
    if (subtitle && ctx.measureText(title).width + ctx.measureText(subtitle).width + 18 < box.w) {
      label(ctx, subtitle, box.x + box.w, box.y - 12, "right", "bottom", COLORS.muted);
    }
  }

  function roundedRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawChip(ctx, text, x, y, color) {
    var w = Math.max(44, ctx.measureText(text).width + 18);
    roundedRect(ctx, x, y, w, 24, 5);
    ctx.fillStyle = color;
    ctx.fill();
    label(ctx, text, x + w / 2, y + 12, "center", "middle", COLORS.text);
    return w;
  }

  function drawOps(ctx, result, box) {
    panel(ctx, box, "Partitioned edits", result.scenarioLabel);
    var laneA = box.y + 56;
    var laneB = box.y + 118;
    ctx.strokeStyle = COLORS.rule;
    [laneA, laneB].forEach(function (y) {
      ctx.beginPath();
      ctx.moveTo(box.x + 56, y);
      ctx.lineTo(box.x + box.w - 18, y);
      ctx.stroke();
    });
    label(ctx, "A", box.x + 20, laneA, "left", "middle", COLORS.blue);
    label(ctx, "B", box.x + 20, laneB, "left", "middle", COLORS.purple);
    result.ops.forEach(function (op, index) {
      var sameActorIndex = result.ops.filter(function (other, j) { return j <= index && other.actor === op.actor; }).length - 1;
      var x = box.x + 78 + sameActorIndex * Math.max(88, (box.w - 142) / 2.5);
      var y = op.actor === "A" ? laneA : laneB;
      var color = op.kind === "add" ? COLORS.add : COLORS.remove;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, 2 * Math.PI);
      ctx.fill();
      label(ctx, op.id, x, y - 22, "center", "middle", COLORS.text);
      label(ctx, op.kind + " " + op.item, x, y + 22, "center", "middle", COLORS.muted);
    });
    label(ctx, "network partition: both sides accept local writes", box.x + 16, box.y + box.h - 18, "left", "middle", COLORS.muted);
  }

  function drawOutcomes(ctx, result, box) {
    panel(ctx, box, "Schedule sensitivity", result.trials + " shuffled deliveries");
    var max = result.outcomes.reduce(function (best, row) { return Math.max(best, row.count); }, 1);
    var rows = result.outcomes.slice(0, 5);
    var rowH = Math.min(34, (box.h - 48) / Math.max(1, rows.length));
    rows.forEach(function (row, index) {
      var y = box.y + 30 + index * rowH;
      var barW = (box.w - 156) * row.count / max;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x + 132, y, box.w - 154, rowH - 10);
      ctx.fillStyle = result.distinct === 1 ? COLORS.add : COLORS.remove;
      ctx.fillRect(box.x + 132, y, barW, rowH - 10);
      label(ctx, row.key.length > 18 ? row.key.slice(0, 17) + "..." : row.key, box.x + 12, y + (rowH - 10) / 2, "left", "middle", COLORS.text);
      label(ctx, Math.round(100 * row.count / result.trials) + "%", box.x + box.w - 16, y + (rowH - 10) / 2, "right", "middle", COLORS.text);
    });
    if (result.outcomes.length > rows.length) {
      label(ctx, "+" + (result.outcomes.length - rows.length) + " more", box.x + 12, box.y + box.h - 16, "left", "middle", COLORS.muted);
    }
  }

  function drawLaws(ctx, result, box) {
    var model = MODELS[result.model];
    panel(ctx, box, "Merge algebra", model.label);
    var laws = [
      ["commute", model.laws.commutative],
      ["associate", model.laws.associative],
      ["idempotent", model.laws.idempotent],
      ["delete", model.laws.deletes]
    ];
    laws.forEach(function (row, index) {
      var col = index % 2;
      var r = Math.floor(index / 2);
      var x = box.x + 18 + col * ((box.w - 44) / 2);
      var y = box.y + 34 + r * 48;
      roundedRect(ctx, x, y, (box.w - 58) / 2, 32, 5);
      ctx.fillStyle = row[1] ? "#ecfdf5" : "#fff7ed";
      ctx.fill();
      label(ctx, row[1] ? "yes" : "no", x + 18, y + 16, "center", "middle", row[1] ? COLORS.add : COLORS.amber);
      label(ctx, row[0], x + 42, y + 16, "left", "middle", COLORS.text);
    });
    label(ctx, model.blurb, box.x + 18, box.y + box.h - 30, "left", "middle", COLORS.muted);
  }

  function drawStates(ctx, result, box) {
    panel(ctx, box, "Replica states", "before and after anti-entropy");
    var rows = [
      ["Replica A", materialize(result.model, result.stateA), COLORS.blue],
      ["Replica B", materialize(result.model, result.stateB), COLORS.purple],
      ["Merged", result.visible, result.distinct === 1 ? COLORS.add : COLORS.remove]
    ];
    rows.forEach(function (row, index) {
      var y = box.y + 30 + index * 48;
      label(ctx, row[0], box.x + 14, y + 14, "left", "middle", COLORS.text);
      var x = box.x + 96;
      var items = row[1].length ? row[1] : ["empty"];
      items.slice(0, 4).forEach(function (item) {
        x += drawChip(ctx, item, x, y + 2, item === "empty" ? COLORS.faint : COLORS.chip) + 8;
      });
    });
    var foot = result.units + " state units";
    if (result.tombstones) foot += ", " + result.tombstones + " tombstone" + (result.tombstones === 1 ? "" : "s");
    label(ctx, foot, box.x + 14, box.y + box.h - 18, "left", "middle", COLORS.muted);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 900 : 620;
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    if (compact) {
      var left = 42;
      var plotW = width - left - 18;
      drawOps(ctx, result, { x: left, y: 42, w: plotW, h: 160 });
      drawOutcomes(ctx, result, { x: left, y: 274, w: plotW, h: 160 });
      drawLaws(ctx, result, { x: left, y: 506, w: plotW, h: 150 });
      drawStates(ctx, result, { x: left, y: 728, w: plotW, h: 136 });
    } else {
      var margin = 54;
      var gap = 42;
      var w = (width - margin - 24 - gap) / 2;
      drawOps(ctx, result, { x: margin, y: 42, w: w, h: 190 });
      drawOutcomes(ctx, result, { x: margin + w + gap, y: 42, w: w, h: 190 });
      drawLaws(ctx, result, { x: margin, y: 328, w: w, h: 170 });
      drawStates(ctx, result, { x: margin + w + gap, y: 328, w: w, h: 170 });
    }
  }

  function parseParams(root) {
    var params = {
      clockSkew: 0,
      model: "orset",
      scenario: "edit",
      trials: 160
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      params[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "trials") output.textContent = params[key];
      else if (key === "clockSkew") output.textContent = (params[key] > 0 ? "+" : "") + params[key] + "s";
      else output.textContent = params[key];
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = simulate(params);
    var model = MODELS[result.model];
    updateOutputs(root, params);
    root.querySelector("[data-metrics]").innerHTML = [
      metric("distinct finals", String(result.distinct)),
      metric("modal result", result.modal.key),
      metric("law score", [model.laws.commutative, model.laws.associative, model.laws.idempotent].filter(Boolean).length + "/3"),
      metric("state units", String(result.units)),
      metric("tombstones", String(result.tombstones)),
      metric("visible", formatItems(result.visible))
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-crdt-lab]"));
    labs.forEach(function (root) {
      if (root.__crdtLabReady) return;
      root.__crdtLabReady = true;
      var schedule = null;
      var scheduledWithTimeout = false;
      function requestRender() {
        if (schedule) {
          if (scheduledWithTimeout) window.clearTimeout(schedule);
          else if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(schedule);
        }
        scheduledWithTimeout = typeof window.requestAnimationFrame !== "function";
        var scheduleRender = scheduledWithTimeout
          ? function (callback) { return window.setTimeout(callback, 16); }
          : window.requestAnimationFrame;
        schedule = scheduleRender(function () {
          schedule = null;
          render(root);
        });
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      window.addEventListener("resize", requestRender);
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      applyOp: applyOp,
      canonical: canonical,
      materialize: materialize,
      simulate: simulate
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      window.setTimeout(init, 0);
    } else {
      init();
    }
  }
}());
