(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    sc: "#2563eb",
    tso: "#d97706",
    fenced: "#0f766e",
    bad: "#be123c",
    memory: "#7c3aed",
    neutral: "#64748b"
  };

  var OUTCOMES = ["00", "01", "10", "11"];
  var MODEL_LABELS = {
    sc: "Sequential consistency",
    tso: "TSO store buffer",
    fenced: "TSO with fences"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cleanParams(raw) {
    raw = raw || {};
    var model = MODEL_LABELS[raw.model] ? raw.model : "tso";
    return {
      drainRate: clamp(Number(raw.drainRate == null ? 35 : raw.drainRate), 0, 100),
      model: model,
      seed: clamp(Math.round(raw.seed == null ? 29 : raw.seed), 1, 999),
      trials: clamp(Math.round(raw.trials == null ? 2400 : raw.trials), 200, 12000)
    };
  }

  function program(model, thread) {
    var first = thread === 0 ?
      { kind: "store", addr: "x", value: 1, label: "x=1" } :
      { kind: "store", addr: "y", value: 1, label: "y=1" };
    var load = thread === 0 ?
      { kind: "load", addr: "y", reg: "r0", label: "r0=y" } :
      { kind: "load", addr: "x", reg: "r1", label: "r1=x" };
    if (model === "fenced") return [first, { kind: "fence", label: "fence" }, load];
    return [first, load];
  }

  function initialState() {
    return {
      buffers: [[], []],
      mem: { x: 0, y: 0 },
      pc: [0, 0],
      regs: [null, null],
      trace: []
    };
  }

  function cloneState(state) {
    return {
      buffers: [state.buffers[0].slice(), state.buffers[1].slice()],
      mem: { x: state.mem.x, y: state.mem.y },
      pc: state.pc.slice(),
      regs: state.regs.slice(),
      trace: state.trace.slice()
    };
  }

  function complete(state, model) {
    var done = state.pc[0] >= program(model, 0).length &&
      state.pc[1] >= program(model, 1).length;
    return done && state.buffers[0].length === 0 && state.buffers[1].length === 0;
  }

  function enabledTransitions(state, model) {
    var out = [];
    [0, 1].forEach(function (thread) {
      var ops = program(model, thread);
      if (state.pc[thread] < ops.length) {
        var op = ops[state.pc[thread]];
        if (op.kind !== "fence" || state.buffers[thread].length === 0) {
          out.push({ kind: "program", thread: thread, op: op });
        }
      }
      if (model !== "sc" && state.buffers[thread].length > 0) {
        out.push({ kind: "drain", thread: thread });
      }
    });
    return out;
  }

  function latestOwnBufferedValue(buffer, addr) {
    for (var i = buffer.length - 1; i >= 0; i -= 1) {
      if (buffer[i].addr === addr) return buffer[i].value;
    }
    return null;
  }

  function traceEntry(kind, thread, text, extra) {
    var entry = { kind: kind, text: text, thread: thread };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        entry[key] = extra[key];
      });
    }
    return entry;
  }

  function applyTransition(state, transition, model) {
    var next = cloneState(state);
    var thread = transition.thread;

    if (transition.kind === "drain") {
      var write = next.buffers[thread].shift();
      next.mem[write.addr] = write.value;
      next.trace.push(traceEntry("drain", thread, "T" + thread + " drains " + write.addr + "=1", {
        addr: write.addr,
        value: write.value
      }));
      return next;
    }

    var op = transition.op;
    if (op.kind === "store") {
      if (model === "sc") {
        next.mem[op.addr] = op.value;
        next.trace.push(traceEntry("store", thread, "T" + thread + " stores " + op.addr + "=1 to memory", {
          addr: op.addr,
          value: op.value
        }));
      } else {
        next.buffers[thread].push({ addr: op.addr, value: op.value });
        next.trace.push(traceEntry("buffer", thread, "T" + thread + " buffers " + op.addr + "=1", {
          addr: op.addr,
          value: op.value
        }));
      }
      next.pc[thread] += 1;
      return next;
    }

    if (op.kind === "load") {
      var own = model === "sc" ? null : latestOwnBufferedValue(next.buffers[thread], op.addr);
      var value = own == null ? next.mem[op.addr] : own;
      next.regs[thread] = value;
      next.trace.push(traceEntry("load", thread, "T" + thread + " reads " + op.addr + " -> " + value, {
        addr: op.addr,
        value: value
      }));
      next.pc[thread] += 1;
      return next;
    }

    if (op.kind === "fence") {
      next.trace.push(traceEntry("fence", thread, "T" + thread + " fence passes", {}));
      next.pc[thread] += 1;
      return next;
    }

    throw new Error("unknown op " + op.kind);
  }

  function emptyHistogram() {
    return OUTCOMES.reduce(function (out, key) {
      out[key] = 0;
      return out;
    }, {});
  }

  function outcomeKey(state) {
    return String(state.regs[0]) + String(state.regs[1]);
  }

  function enumerate(model) {
    model = MODEL_LABELS[model] ? model : "tso";
    var histogram = emptyHistogram();
    var witnesses = {};
    var paths = 0;
    var states = 0;

    function dfs(state) {
      states += 1;
      if (complete(state, model)) {
        var key = outcomeKey(state);
        histogram[key] = (histogram[key] || 0) + 1;
        paths += 1;
        if (!witnesses[key]) witnesses[key] = state.trace.slice();
        return;
      }
      enabledTransitions(state, model).forEach(function (transition) {
        dfs(applyTransition(state, transition, model));
      });
    }

    dfs(initialState());
    var allowed = OUTCOMES.filter(function (key) { return histogram[key] > 0; });
    return {
      allowed: allowed,
      histogram: histogram,
      model: model,
      paths: paths,
      states: states,
      witnesses: witnesses
    };
  }

  function chooseTransition(enabled, params, random) {
    if (params.model === "sc") return enabled[Math.floor(random() * enabled.length)];
    var drains = enabled.filter(function (transition) { return transition.kind === "drain"; });
    var programs = enabled.filter(function (transition) { return transition.kind !== "drain"; });
    if (drains.length && (!programs.length || random() < params.drainRate / 100)) {
      return drains[Math.floor(random() * drains.length)];
    }
    return programs[Math.floor(random() * programs.length)];
  }

  function runTrial(params, random) {
    var state = initialState();
    var guard = 0;
    while (!complete(state, params.model)) {
      var enabled = enabledTransitions(state, params.model);
      if (!enabled.length) throw new Error("deadlocked litmus state");
      state = applyTransition(state, chooseTransition(enabled, params, random), params.model);
      guard += 1;
      if (guard > 32) throw new Error("litmus execution did not converge");
    }
    return state;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams);
    var random = rng(params.seed * 1000003 + params.trials * 97 + Math.round(params.drainRate * 13));
    var histogram = emptyHistogram();
    var firstBothZero = null;
    for (var i = 0; i < params.trials; i += 1) {
      var state = runTrial(params, random);
      var key = outcomeKey(state);
      histogram[key] += 1;
      if (key === "00" && !firstBothZero) firstBothZero = state.trace.slice();
    }
    var exact = enumerate(params.model);
    return {
      exact: exact,
      firstBothZero: firstBothZero,
      histogram: histogram,
      params: params,
      rate00: histogram["00"] / params.trials
    };
  }

  function runAudit() {
    var sc = enumerate("sc");
    var tso = enumerate("tso");
    var fenced = enumerate("fenced");
    var sim = simulate({ model: "tso", trials: 2400, drainRate: 25, seed: 29 });
    var total = OUTCOMES.reduce(function (sum, key) { return sum + sim.histogram[key]; }, 0);
    var checks = [
      sc.histogram["00"] === 0,
      tso.histogram["00"] > 0,
      fenced.histogram["00"] === 0,
      total === sim.params.trials,
      sim.rate00 > 0,
      tso.allowed.length === 4,
      sc.allowed.length === 3,
      fenced.allowed.length === 3
    ];
    return {
      cases: checks.length,
      ok: checks.filter(Boolean).length,
      scPaths: sc.paths,
      tsoBothZeroPaths: tso.histogram["00"],
      defaultBothZeroRate: sim.rate00
    };
  }

  function pct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="litmus-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function fillText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.faint;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    fillText(ctx, title, x + 12, y + 21, COLORS.text, 13, 750);
  }

  function drawHistogram(ctx, result, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "outcomes under the random scheduler");
    var plot = { x: box.x + 44, y: box.y + 45, w: box.w - 70, h: box.h - 82 };
    var max = Math.max.apply(null, OUTCOMES.map(function (key) {
      return result.histogram[key];
    }).concat([1]));
    OUTCOMES.forEach(function (key, i) {
      var slot = plot.w / OUTCOMES.length;
      var x = plot.x + i * slot + slot / 2;
      var height = plot.h * result.histogram[key] / max;
      var exactAllowed = result.exact.histogram[key] > 0;
      ctx.fillStyle = key === "00" ? COLORS.bad : COLORS.sc;
      ctx.globalAlpha = exactAllowed ? 0.86 : 0.20;
      ctx.fillRect(x - Math.min(34, slot * 0.28), plot.y + plot.h - height, Math.min(68, slot * 0.56), height);
      ctx.globalAlpha = 1;
      fillText(ctx, "r0r1=" + key, x, plot.y + plot.h + 19, COLORS.muted, 10, 650, "center");
      fillText(ctx, pct(result.histogram[key] / result.params.trials, 1), x, plot.y + plot.h - height - 7, key === "00" ? COLORS.bad : COLORS.text, 10, 700, "center");
      if (!exactAllowed) {
        ctx.strokeStyle = COLORS.rule;
        ctx.beginPath();
        ctx.moveTo(x - 20, plot.y + plot.h - 4);
        ctx.lineTo(x + 20, plot.y + plot.h - 22);
        ctx.stroke();
      }
    });
    fillText(ctx, "crossed bars are forbidden by exhaustive enumeration", plot.x, box.y + box.h - 18, COLORS.muted, 11, 600);
  }

  function traceForDisplay(result) {
    return result.firstBothZero ||
      result.exact.witnesses["00"] ||
      result.exact.witnesses[result.exact.allowed[0]] ||
      [];
  }

  function eventColor(entry) {
    if (entry.kind === "load" && entry.value === 0) return COLORS.bad;
    if (entry.kind === "drain") return COLORS.memory;
    if (entry.kind === "fence") return COLORS.fenced;
    if (entry.kind === "buffer") return COLORS.tso;
    return COLORS.sc;
  }

  function drawTrace(ctx, result, box) {
    var trace = traceForDisplay(result);
    var title = result.firstBothZero || result.exact.witnesses["00"] ?
      "one both-zero witness" :
      "no both-zero witness in this model";
    panel(ctx, box.x, box.y, box.w, box.h, title);
    var lanes = [
      { label: "T0", y: box.y + 58 },
      { label: "T1", y: box.y + 116 },
      { label: "Memory", y: box.y + 174 }
    ];
    lanes.forEach(function (lane) {
      fillText(ctx, lane.label, box.x + 14, lane.y + 4, COLORS.muted, 11, 700);
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(box.x + 66, lane.y);
      ctx.lineTo(box.x + box.w - 18, lane.y);
      ctx.stroke();
    });
    if (!trace.length) return;
    var startX = box.x + 78;
    var step = Math.max(58, (box.w - 112) / Math.max(1, trace.length - 1));
    trace.forEach(function (entry, i) {
      var lane = entry.kind === "drain" ? lanes[2] : lanes[entry.thread];
      var x = startX + i * step;
      ctx.fillStyle = eventColor(entry);
      ctx.beginPath();
      ctx.arc(x, lane.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.rule;
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(startX + (i - 1) * step, box.y + box.h - 36);
        ctx.lineTo(x, box.y + box.h - 36);
        ctx.stroke();
      }
      fillText(ctx, String(i + 1), x, box.y + box.h - 31, COLORS.muted, 10, 650, "center");
      var label = entry.text.replace(/^T([01]) /, "T$1:");
      fillText(ctx, label.slice(0, 18), x, lane.y + 23, COLORS.text, 10, 650, "center");
    });
    fillText(ctx, "In the 00 witness, both loads read before the other core's buffered store drains.", box.x + 14, box.y + box.h - 12, COLORS.muted, 11, 600);
  }

  function draw(result, canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(280, Math.floor(rect.width || canvas.clientWidth || 860));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var pad = cssWidth < 520 ? 12 : 18;
    var gap = cssWidth < 520 ? 14 : 18;
    var histH = cssWidth < 520 ? 248 : 240;
    var traceH = cssWidth < 520 ? 292 : 252;
    var cssHeight = pad * 2 + histH + gap + traceH;
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
    drawHistogram(ctx, result, { x: pad, y: pad, w: cssWidth - 2 * pad, h: histH });
    drawTrace(ctx, result, { x: pad, y: pad + histH + gap, w: cssWidth - 2 * pad, h: traceH });
  }

  function readParams(lab) {
    function value(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      return input ? input.value : fallback;
    }
    return {
      drainRate: Number(value("drainRate", 35)),
      model: value("model", "tso"),
      seed: Number(value("seed", 29)),
      trials: Number(value("trials", 2400))
    };
  }

  function updateOutputs(lab, params) {
    var labels = {
      drainRate: pct(params.drainRate / 100, 0),
      seed: String(params.seed),
      trials: String(params.trials)
    };
    Object.keys(labels).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function renderTraceList(lab, result) {
    var list = lab.querySelector("[data-trace]");
    if (!list) return;
    var trace = traceForDisplay(result);
    list.innerHTML = trace.map(function (entry) {
      return "<li>" + entry.text + "</li>";
    }).join("");
  }

  function render(lab) {
    var params = cleanParams(readParams(lab));
    updateOutputs(lab, params);
    var result = simulate(params);
    var audit = runAudit();
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("model", MODEL_LABELS[params.model]),
        metric("exact outcomes", result.exact.allowed.join(", ")),
        metric("both-zero rate", pct(result.rate00, 1)),
        metric("exact paths", String(result.exact.paths)),
        metric("trials", String(params.trials)),
        metric("audit", audit.ok + "/" + audit.cases)
      ].join("");
    }
    renderTraceList(lab, result);
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-store-buffer-litmus-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    cleanParams: cleanParams,
    enumerate: enumerate,
    runAudit: runAudit,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.StoreBufferLitmusLab = api;
})(typeof window !== "undefined" ? window : globalThis);
