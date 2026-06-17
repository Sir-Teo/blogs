(function (global) {
  "use strict";

  var COLORS = {
    axis: "#cbd5e1",
    fixed: "#7c3aed",
    gate: "#f97316",
    grid: "#e6edf3",
    mark: "#2563eb",
    muted: "#5d6872",
    noise: "#94a3b8",
    panel: "#f8fafc",
    query: "#be123c",
    rule: "#d7dee5",
    scan: "#0f766e",
    selective: "#0f766e",
    target: "#f59e0b",
    text: "#172026",
    trueValue: "#111827",
    white: "#ffffff"
  };

  var DEFAULTS = {
    gap: 52,
    halfLife: 18,
    length: 128,
    seed: 73,
    selectivity: 96
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var length = Math.round(clamp(finite(Number(raw.length), DEFAULTS.length), 64, 192) / 8) * 8;
    return {
      gap: Math.round(clamp(finite(Number(raw.gap), DEFAULTS.gap), 8, Math.max(8, length - 24))),
      halfLife: Math.round(clamp(finite(Number(raw.halfLife), DEFAULTS.halfLife), 6, 80)),
      length: length,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      selectivity: Math.round(clamp(finite(Number(raw.selectivity), DEFAULTS.selectivity), 0, 100))
    };
  }

  function makeRng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rng) {
    var u1 = Math.max(1e-12, rng());
    var u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function uniqueSorted(values) {
    var seen = {};
    var out = [];
    values.forEach(function (value) {
      var v = Math.round(value);
      if (!seen[v]) {
        seen[v] = true;
        out.push(v);
      }
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function generateSequence(params) {
    var rng = makeRng(params.seed * 65537 + params.length * 17 + params.gap);
    var query = params.length - 6;
    var target = clamp(query - params.gap, 8, query - 6);
    var jitter = function (scale) { return Math.round((rng() - 0.5) * scale); };
    var earlyMax = Math.max(6, target - 10);
    var marks = uniqueSorted([
      clamp(6 + jitter(4), 4, earlyMax),
      clamp(Math.round(earlyMax * 0.34) + jitter(5), 5, earlyMax),
      clamp(Math.round(earlyMax * 0.62) + jitter(6), 6, earlyMax),
      target
    ]);
    if (marks[marks.length - 1] !== target) marks.push(target);
    marks = uniqueSorted(marks).filter(function (pos) { return pos < query; });
    if (marks[marks.length - 1] !== target) marks.push(target);

    var markValues = {};
    marks.forEach(function (pos, i) {
      var sign = (i % 2 === 0 ? 1 : -1) * (rng() < 0.5 ? 1 : -1);
      markValues[pos] = sign * (0.55 + 0.45 * rng());
    });
    markValues[target] = (rng() < 0.5 ? -1 : 1) * (0.78 + 0.2 * rng());

    var lastMarked = 0;
    var events = [];
    for (var i = 0; i < params.length; i += 1) {
      var type = "noise";
      var value = 0.32 * normal(rng);
      if (marks.indexOf(i) !== -1) {
        type = "mark";
        value = markValues[i];
        lastMarked = value;
      }
      if (i === query) {
        type = "query";
        value = 0;
      }
      events.push({
        index: i,
        trueMemory: lastMarked,
        type: type,
        value: value
      });
    }

    return {
      events: events,
      marks: marks,
      query: query,
      target: target,
      targetValue: markValues[target]
    };
  }

  function gateSchedules(sequence, params) {
    var s = params.selectivity / 100;
    var fixedGate = 1 - Math.exp(-Math.LN2 / params.halfLife);
    var markGate = 0.3 + 0.69 * s;
    var noiseGate = 0.02 * (1 - s) * (1 - s) + 0.0005;
    var fixed = [];
    var selective = [];
    sequence.events.forEach(function (event) {
      fixed.push(event.type === "query" ? 0 : fixedGate);
      if (event.type === "mark") selective.push(markGate);
      else if (event.type === "query") selective.push(0);
      else selective.push(noiseGate);
    });
    return {
      fixed: fixed,
      fixedGate: fixedGate,
      markGate: markGate,
      noiseGate: noiseGate,
      selective: selective
    };
  }

  function runRecurrence(events, gates) {
    var h = 0;
    var states = [];
    var transforms = [];
    events.forEach(function (event, i) {
      var g = gates[i];
      var a = 1 - g;
      var b = g * event.value;
      h = a * h + b;
      states.push(h);
      transforms.push({ a: a, b: b });
    });
    return { states: states, transforms: transforms };
  }

  function compose(left, right) {
    return {
      a: right.a * left.a,
      b: right.a * left.b + right.b
    };
  }

  function scanTransforms(transforms) {
    var prefix = { a: 1, b: 0 };
    var states = [];
    transforms.forEach(function (step) {
      prefix = compose(prefix, step);
      states.push(prefix.b);
    });
    return states;
  }

  function chunkSummaries(transforms, chunkSize) {
    var chunks = [];
    for (var i = 0; i < transforms.length; i += chunkSize) {
      var summary = { a: 1, b: 0 };
      for (var j = i; j < Math.min(transforms.length, i + chunkSize); j += 1) {
        summary = compose(summary, transforms[j]);
      }
      chunks.push({
        a: summary.a,
        b: summary.b,
        end: Math.min(transforms.length - 1, i + chunkSize - 1),
        start: i
      });
    }
    return chunks;
  }

  function influenceWeights(events, gates, query) {
    var weights = new Array(events.length).fill(0);
    var product = 1;
    for (var i = query; i >= 0; i -= 1) {
      weights[i] = gates[i] * product;
      product *= 1 - gates[i];
    }
    return weights;
  }

  function absError(value, target) {
    return Math.abs(value - target);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function near(a, b, tolerance) {
    return Math.abs(a - b) <= tolerance;
  }

  function weightedQuery(events, weights) {
    var total = 0;
    for (var i = 0; i < events.length; i += 1) {
      total += weights[i] * events[i].value;
    }
    return total;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var sequence = generateSequence(params);
    var gates = gateSchedules(sequence, params);
    var fixed = runRecurrence(sequence.events, gates.fixed);
    var selective = runRecurrence(sequence.events, gates.selective);
    var fixedScan = scanTransforms(fixed.transforms);
    var selectiveScan = scanTransforms(selective.transforms);
    var chunks = chunkSummaries(selective.transforms, 16);
    var maxScanMismatch = 0;
    for (var i = 0; i < params.length; i += 1) {
      maxScanMismatch = Math.max(
        maxScanMismatch,
        Math.abs(fixed.states[i] - fixedScan[i]),
        Math.abs(selective.states[i] - selectiveScan[i])
      );
    }
    var query = sequence.query;
    var fixedAtQuery = fixed.states[query];
    var selectiveAtQuery = selective.states[query];
    var fixedError = absError(fixedAtQuery, sequence.targetValue);
    var selectiveError = absError(selectiveAtQuery, sequence.targetValue);
    return {
      chunks: chunks,
      fixed: fixed,
      fixedAtQuery: fixedAtQuery,
      fixedError: fixedError,
      fixedWeights: influenceWeights(sequence.events, gates.fixed, query),
      gates: gates,
      maxScanMismatch: maxScanMismatch,
      params: params,
      scanSpan: Math.ceil(Math.log(params.length) / Math.log(2)),
      selective: selective,
      selectiveAtQuery: selectiveAtQuery,
      selectiveError: selectiveError,
      selectiveWeights: influenceWeights(sequence.events, gates.selective, query),
      sequence: sequence,
      serialSpan: params.length
    };
  }

  function audit() {
    var checked = 0;
    var defaultResult = evaluate(DEFAULTS);
    var left = compose(compose({ a: 0.71, b: 0.13 }, { a: 0.42, b: -0.29 }), { a: 0.83, b: 0.17 });
    var right = compose({ a: 0.71, b: 0.13 }, compose({ a: 0.42, b: -0.29 }, { a: 0.83, b: 0.17 }));
    assert(near(left.a, right.a, 1e-12) && near(left.b, right.b, 1e-12), "affine composition should be associative");
    checked += 1;

    assert(defaultResult.maxScanMismatch <= 1e-12, "default scan should reproduce serial recurrence");
    assert(defaultResult.selectiveError < defaultResult.fixedError, "default selective gate should beat fixed decay");
    assert(defaultResult.scanSpan < defaultResult.serialSpan, "balanced scan span should be shorter than serial span");
    assert(near(weightedQuery(defaultResult.sequence.events, defaultResult.fixedWeights), defaultResult.fixedAtQuery, 1e-12), "fixed query weights should reconstruct query state");
    assert(near(weightedQuery(defaultResult.sequence.events, defaultResult.selectiveWeights), defaultResult.selectiveAtQuery, 1e-12), "selective query weights should reconstruct query state");
    checked += 5;

    var sweep = [];
    var previousError = Infinity;
    var previousMarkGate = -Infinity;
    var previousNoiseGate = Infinity;
    [0, 25, 50, 75, 96, 100].forEach(function (selectivity) {
      var result = evaluate({ selectivity: selectivity });
      assert(result.selectiveError <= previousError + 1e-9, "default selective error should not increase as selectivity rises");
      assert(result.gates.markGate >= previousMarkGate - 1e-12, "mark gate should increase with selectivity");
      assert(result.gates.noiseGate <= previousNoiseGate + 1e-12, "noise gate should shrink with selectivity");
      sweep.push({
        error: Number(result.selectiveError.toFixed(3)),
        markGate: Number(result.gates.markGate.toFixed(3)),
        noiseGate: Number(result.gates.noiseGate.toExponential(2)),
        selectivity: selectivity
      });
      previousError = result.selectiveError;
      previousMarkGate = result.gates.markGate;
      previousNoiseGate = result.gates.noiseGate;
      checked += 3;
    });

    var cases = 0;
    var maxScanMismatch = 0;
    var minErrorAdvantage = Infinity;
    [1, 7, 73, 211, 997].forEach(function (seed) {
      [64, 128, 192].forEach(function (length) {
        [8, 24, 52, 96].forEach(function (gap) {
          [8, 18, 50].forEach(function (halfLife) {
            var result = evaluate({
              gap: gap,
              halfLife: halfLife,
              length: length,
              seed: seed,
              selectivity: 96
            });
            assert(result.sequence.target < result.sequence.query, "target should precede query");
            assert(result.sequence.query - result.sequence.target === result.params.gap, "query gap should match sanitized parameters");
            assert(result.maxScanMismatch <= 1e-12, "scan should reproduce serial recurrence across grid");
            assert(result.selectiveError < result.fixedError, "selective gate should beat fixed decay across grid");
            assert(result.scanSpan < result.serialSpan, "scan span should be smaller across grid");
            assert(near(weightedQuery(result.sequence.events, result.fixedWeights), result.fixedAtQuery, 1e-12), "fixed influence weights should reconstruct query");
            assert(near(weightedQuery(result.sequence.events, result.selectiveWeights), result.selectiveAtQuery, 1e-12), "selective influence weights should reconstruct query");
            maxScanMismatch = Math.max(maxScanMismatch, result.maxScanMismatch);
            minErrorAdvantage = Math.min(minErrorAdvantage, result.fixedError - result.selectiveError);
            cases += 1;
            checked += 7;
          });
        });
      });
    });

    return {
      checked: checked,
      default: {
        fixedError: Number(defaultResult.fixedError.toFixed(3)),
        fixedGate: Number(defaultResult.gates.fixedGate.toFixed(3)),
        gap: defaultResult.params.gap,
        maxScanMismatch: Number(defaultResult.maxScanMismatch.toExponential(2)),
        markGate: Number(defaultResult.gates.markGate.toFixed(3)),
        queryIndex: defaultResult.sequence.query,
        scanSpan: defaultResult.scanSpan,
        selectiveError: Number(defaultResult.selectiveError.toFixed(3)),
        serialSpan: defaultResult.serialSpan,
        targetIndex: defaultResult.sequence.target,
        targetValue: Number(defaultResult.sequence.targetValue.toFixed(3))
      },
      grid: {
        cases: cases,
        maxScanMismatch: Number(maxScanMismatch.toExponential(2)),
        minErrorAdvantage: Number(minErrorAdvantage.toFixed(3))
      },
      ok: true,
      sweep: sweep
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function fmt(value, digits) {
    return Number(value).toFixed(digits);
  }

  function setOutputs(root, params) {
    var gapInput = root.querySelector('[data-param="gap"]');
    if (gapInput) {
      gapInput.max = String(Math.max(8, params.length - 24));
      gapInput.value = String(params.gap);
    }
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "length") value += " tokens";
        if (key === "gap") value += " tokens";
        if (key === "halfLife") value += " tokens";
        if (key === "selectivity") value += "%";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var metrics = root.querySelector("[data-metrics]");
    if (!metrics) return;
    var rows = [
      ["target slot", String(result.sequence.target)],
      ["query slot", String(result.sequence.query)],
      ["fixed error", fmt(result.fixedError, 3)],
      ["selective error", fmt(result.selectiveError, 3)],
      ["serial span", String(result.serialSpan)],
      ["scan span", String(result.scanSpan)]
    ];
    metrics.innerHTML = rows.map(function (row) {
      return '<div class="ss-lab__metric"><span>' + row[0] + '</span><strong>' + row[1] + "</strong></div>";
    }).join("");
  }

  function clear(ctx) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, x + 14, y + 23);
  }

  function range(values) {
    var min = Infinity;
    var max = -Infinity;
    values.forEach(function (value) {
      if (value < min) min = value;
      if (value > max) max = value;
    });
    if (Math.abs(max - min) < 1e-9) {
      min -= 1;
      max += 1;
    }
    return { max: max, min: min };
  }

  function grid(ctx, x, y, w, h, rows) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 1; i < rows; i += 1) {
      var yy = y + h * i / rows;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }
  }

  function drawLine(ctx, values, x, y, w, h, r, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    values.forEach(function (value, i) {
      var xx = x + w * i / Math.max(1, values.length - 1);
      var yy = y + h - h * (value - r.min) / (r.max - r.min);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawTape(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "tokens choose the gate");
    var events = result.sequence.events;
    var px = x + 28;
    var py = y + 48;
    var pw = w - 56;
    var slot = pw / events.length;
    events.forEach(function (event, i) {
      var xx = px + i * slot;
      var color = COLORS.noise;
      if (event.type === "mark") color = COLORS.mark;
      if (event.type === "query") color = COLORS.query;
      if (i === result.sequence.target) color = COLORS.target;
      ctx.fillStyle = color;
      ctx.fillRect(xx, py, Math.max(1, slot - 1), 22);
      var sg = result.gates.selective[i];
      ctx.fillStyle = COLORS.gate;
      ctx.fillRect(xx, py + 32 + 34 * (1 - sg), Math.max(1, slot - 1), 34 * sg);
      var fg = result.gates.fixed[i];
      ctx.fillStyle = COLORS.fixed;
      ctx.fillRect(xx, py + 76 + 34 * (1 - fg), Math.max(1, slot - 1), 34 * fg);
    });
    [[result.sequence.target, "write"], [result.sequence.query, "read"]].forEach(function (row) {
      var xx = px + row[0] * slot;
      ctx.strokeStyle = row[1] === "write" ? COLORS.target : COLORS.query;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xx, py - 8);
      ctx.lineTo(xx, py + 118);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row[1], Math.min(xx + 4, x + w - 52), py - 13);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("top: token type; orange: selective update gate; purple: fixed update gate", px, y + h - 14);
  }

  function drawTrajectory(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "state trajectory");
    var px = x + 42;
    var py = y + 42;
    var pw = w - 62;
    var ph = h - 70;
    var truth = result.sequence.events.map(function (event) { return event.trueMemory; });
    var r = range(truth.concat(result.fixed.states, result.selective.states, [0]));
    r.min -= 0.15;
    r.max += 0.15;
    grid(ctx, px, py, pw, ph, 4);
    var zero = py + ph - ph * (0 - r.min) / (r.max - r.min);
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(px, zero);
    ctx.lineTo(px + pw, zero);
    ctx.stroke();
    drawLine(ctx, truth, px, py, pw, ph, r, COLORS.trueValue, 2.1, [6, 5]);
    drawLine(ctx, result.fixed.states, px, py, pw, ph, r, COLORS.fixed, 2);
    drawLine(ctx, result.selective.states, px, py, pw, ph, r, COLORS.selective, 2.5);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("black dashed = last marked value; green = selective; purple = fixed", px, y + h - 15);
  }

  function drawInfluence(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "who reaches the query?");
    var px = x + 42;
    var py = y + 44;
    var pw = w - 62;
    var ph = h - 74;
    var fixed = result.fixedWeights.map(function (weight, i) {
      return weight * result.sequence.events[i].value;
    });
    var selective = result.selectiveWeights.map(function (weight, i) {
      return weight * result.sequence.events[i].value;
    });
    var r = range(fixed.concat(selective, [0]));
    r.min -= 0.05;
    r.max += 0.05;
    grid(ctx, px, py, pw, ph, 4);
    var zero = py + ph - ph * (0 - r.min) / (r.max - r.min);
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(px, zero);
    ctx.lineTo(px + pw, zero);
    ctx.stroke();
    fixed.forEach(function (value, i) {
      var xx = px + pw * i / Math.max(1, fixed.length - 1);
      var yy = py + ph - ph * (value - r.min) / (r.max - r.min);
      ctx.strokeStyle = COLORS.fixed;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xx, zero);
      ctx.lineTo(xx, yy);
      ctx.stroke();
    });
    selective.forEach(function (value, i) {
      var xx = px + pw * i / Math.max(1, selective.length - 1);
      var yy = py + ph - ph * (value - r.min) / (r.max - r.min);
      ctx.strokeStyle = COLORS.selective;
      ctx.lineWidth = i === result.sequence.target ? 2.6 : 1.3;
      ctx.beginPath();
      ctx.moveTo(xx + 1.5, zero);
      ctx.lineTo(xx + 1.5, yy);
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("contribution to readout at the query: purple fixed, green selective", px, y + h - 15);
  }

  function drawScan(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "affine maps make the recurrence a scan");
    var px = x + 34;
    var py = y + 44;
    var pw = w - 58;
    var chunks = result.chunks;
    var gap = 6;
    var boxW = (pw - gap * (chunks.length - 1)) / chunks.length;
    chunks.forEach(function (chunk, i) {
      var xx = px + i * (boxW + gap);
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 1;
      ctx.fillRect(xx, py, boxW, 56);
      ctx.strokeRect(xx + 0.5, py + 0.5, boxW - 1, 55);
      ctx.fillStyle = COLORS.scan;
      ctx.fillRect(xx, py + 44, boxW * clamp(Math.abs(chunk.b), 0, 1), 6);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(chunk.start + "-" + chunk.end, xx + 6, py + 17);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("a " + fmt(chunk.a, 2), xx + 6, py + 33);
    });
    var bars = [
      { color: COLORS.fixed, label: "serial recurrence span", value: result.serialSpan },
      { color: COLORS.scan, label: "balanced scan span", value: result.scanSpan }
    ];
    var max = result.serialSpan;
    bars.forEach(function (bar, i) {
      var yy = py + 82 + i * 30;
      var bw = (pw - 180) * bar.value / max;
      ctx.fillStyle = bar.color;
      ctx.fillRect(px, yy, bw, 15);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(String(bar.value), px + bw + 8, yy + 12);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(bar.label, px + pw - 176, yy + 12);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("compose (a,b) with (c,d) as (ca, cb+d); max scan mismatch " + result.maxScanMismatch.toExponential(1), px, y + h - 14);
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    clear(ctx);
    drawTape(ctx, result, 18, 18, 884, 172);
    drawTrajectory(ctx, result, 18, 214, 430, 214);
    drawInfluence(ctx, result, 472, 214, 430, 214);
    drawScan(ctx, result, 18, 452, 884, 152);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__selectiveScanLabResult = result;
  }

  function init(root) {
    if (!root || root.__selectiveScanLabInitialized) return;
    root.__selectiveScanLabInitialized = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function initAll() {
    document.querySelectorAll("[data-selective-scan-lab]").forEach(init);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SelectiveScanLab = api;
})(typeof window !== "undefined" ? window : globalThis);
