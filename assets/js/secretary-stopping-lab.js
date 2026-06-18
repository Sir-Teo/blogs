(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    exact: "#0f766e",
    chosen: "#2563eb",
    optimum: "#be123c",
    sim: "#7c3aed",
    record: "#d97706",
    wait: "#94a3b8",
    white: "#ffffff"
  };

  var DEFAULTS = {
    n: 80,
    cutoff: 30,
    trials: 5000,
    seed: 23
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
    var n = clamp(Math.round(finite(raw.n, DEFAULTS.n)), 5, 200);
    return {
      cutoff: clamp(Math.round(finite(raw.cutoff, Math.max(1, Math.round(n / Math.E)))), 1, n),
      n: n,
      seed: clamp(Math.round(finite(raw.seed, DEFAULTS.seed)), 1, 99),
      trials: clamp(Math.round(finite(raw.trials, DEFAULTS.trials)), 500, 12000)
    };
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function random01(index, seed) {
    return (hash32((index + 1) | 0, seed) + 0.5) / 4294967297;
  }

  function permutation(n, seed) {
    var out = [];
    for (var i = 0; i < n; i += 1) out.push(i + 1);
    for (var j = n - 1; j > 0; j -= 1) {
      var k = Math.floor(random01(seed * 1009 + j * 9176, seed ^ 0x9e3779b9) * (j + 1));
      var tmp = out[j];
      out[j] = out[k];
      out[k] = tmp;
    }
    return out;
  }

  function exactSuccess(n, cutoff) {
    cutoff = clamp(Math.round(cutoff), 1, n);
    if (cutoff <= 1) return 1 / n;
    var sum = 0;
    for (var i = cutoff; i <= n; i += 1) sum += 1 / (i - 1);
    return (cutoff - 1) * sum / n;
  }

  function cutoffCurve(n) {
    var rows = [];
    var best = { cutoff: 1, probability: exactSuccess(n, 1) };
    for (var r = 1; r <= n; r += 1) {
      var probability = exactSuccess(n, r);
      rows.push({ cutoff: r, probability: probability });
      if (probability > best.probability + 1e-15) best = { cutoff: r, probability: probability };
    }
    return { best: best, rows: rows };
  }

  function dynamicProgram(n) {
    var value = new Array(n + 2).fill(0);
    var acceptRecord = new Array(n + 2).fill(false);
    var stopPayoff = new Array(n + 2).fill(0);
    var continuePayoff = new Array(n + 2).fill(0);
    for (var i = n; i >= 1; i -= 1) {
      var stop = i / n;
      var cont = value[i + 1];
      stopPayoff[i] = stop;
      continuePayoff[i] = cont;
      acceptRecord[i] = stop >= cont - 1e-15;
      value[i] = (1 / i) * Math.max(stop, cont) + (1 - 1 / i) * cont;
    }
    var firstAccept = n;
    for (var j = 1; j <= n; j += 1) {
      if (acceptRecord[j]) {
        firstAccept = j;
        break;
      }
    }
    return {
      acceptRecord: acceptRecord,
      continuePayoff: continuePayoff,
      firstAccept: firstAccept,
      stopPayoff: stopPayoff,
      value: value
    };
  }

  function runRule(order, cutoff) {
    var bestSeen = -Infinity;
    var chosen = order.length - 1;
    var records = [];
    for (var i = 0; i < order.length; i += 1) {
      var isRecord = order[i] > bestSeen;
      if (isRecord) records.push(i + 1);
      if (i + 1 >= cutoff && isRecord) {
        chosen = i;
        break;
      }
      if (order[i] > bestSeen) bestSeen = order[i];
    }
    return {
      chosenPosition: chosen + 1,
      chosenValue: order[chosen],
      records: records,
      success: order[chosen] === order.length
    };
  }

  function simulate(n, cutoff, trials, seed) {
    var wins = 0;
    var chosenSum = 0;
    var recordStops = 0;
    for (var t = 0; t < trials; t += 1) {
      var order = permutation(n, seed * 65537 + t * 17);
      var run = runRule(order, cutoff);
      if (run.success) wins += 1;
      chosenSum += run.chosenPosition;
      if (run.records.indexOf(run.chosenPosition) >= 0) recordStops += 1;
    }
    return {
      averageStop: chosenSum / trials,
      recordStopRate: recordStops / trials,
      success: wins / trials,
      trials: trials,
      wins: wins
    };
  }

  function pathExample(n, cutoff, seed) {
    var order = permutation(n, seed * 4243 + 7);
    var run = runRule(order, cutoff);
    var best = -Infinity;
    var rows = order.map(function (value, index) {
      var record = value > best;
      if (record) best = value;
      return {
        index: index + 1,
        record: record,
        selected: index + 1 === run.chosenPosition,
        value: value
      };
    });
    return Object.assign({ order: order, rows: rows }, run);
  }

  function bruteForceSuccess(n, cutoff) {
    var items = [];
    for (var i = 0; i < n; i += 1) items.push(i + 1);
    var wins = 0;
    var total = 0;
    function visit(prefix, remaining) {
      if (!remaining.length) {
        total += 1;
        if (runRule(prefix, cutoff).success) wins += 1;
        return;
      }
      for (var i = 0; i < remaining.length; i += 1) {
        var next = remaining[i];
        var rest = remaining.slice(0, i).concat(remaining.slice(i + 1));
        visit(prefix.concat([next]), rest);
      }
    }
    visit([], items);
    return wins / total;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var curve = cutoffCurve(params.n);
    var dp = dynamicProgram(params.n);
    var selectedExact = exactSuccess(params.n, params.cutoff);
    var selectedSim = simulate(params.n, params.cutoff, params.trials, params.seed);
    var optimalSim = simulate(params.n, curve.best.cutoff, params.trials, params.seed + 11);
    var path = pathExample(params.n, params.cutoff, params.seed);
    var audit = auditResult(params, curve, dp, selectedExact, selectedSim);
    return {
      audit: audit,
      curve: curve,
      dp: dp,
      optimalSim: optimalSim,
      params: params,
      path: path,
      selectedExact: selectedExact,
      selectedSim: selectedSim
    };
  }

  function auditResult(params, curve, dp, selectedExact, selectedSim) {
    return {
      cutoffInRange: params.cutoff >= 1 && params.cutoff <= params.n,
      curveBounded: curve.rows.every(function (row) { return row.probability >= 0 && row.probability <= 1; }),
      dpAgrees: dp.firstAccept === curve.best.cutoff,
      formulaFinite: Number.isFinite(selectedExact),
      simulationClose: Math.abs(selectedSim.success - selectedExact) <= 0.035
    };
  }

  function auditSecretaryStoppingLab() {
    [5, 6, 7].forEach(function (n) {
      for (var cutoff = 1; cutoff <= n; cutoff += 1) {
        var exact = exactSuccess(n, cutoff);
        var brute = bruteForceSuccess(n, cutoff);
        assert(Math.abs(exact - brute) < 1e-12, "exact formula mismatch n=" + n + " cutoff=" + cutoff);
      }
    });
    [12, 25, 80, 150].forEach(function (n) {
      var curve = cutoffCurve(n);
      var dp = dynamicProgram(n);
      assert(dp.firstAccept === curve.best.cutoff, "DP threshold mismatch n=" + n);
      assert(Math.abs(dp.value[1] - curve.best.probability) < 1e-12, "DP value mismatch n=" + n);
    });
    var base = evaluate(DEFAULTS);
    assert(base.audit.cutoffInRange, "cutoff range");
    assert(base.audit.curveBounded, "curve bounded");
    assert(base.audit.formulaFinite, "formula finite");
    assert(base.audit.simulationClose, "simulation close");
    return {
      exactAtCutoff: Number(base.selectedExact.toFixed(4)),
      ok: true,
      optimalCutoff: base.curve.best.cutoff,
      optimalProbability: Number(base.curve.best.probability.toFixed(4))
    };
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value, tone) {
    return '<div class="secretary-lab__metric secretary-lab__metric--' + (tone || "plain") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var ratio = global.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.width || 980));
    var height = Math.max(640, Math.round(rect.height || canvas.height || 720));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
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

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.fillText(title, box.x + 14, box.y + 22);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 40);
    }
  }

  function scale(value, lo, hi, a, b) {
    if (hi === lo) return (a + b) / 2;
    return a + (value - lo) / (hi - lo) * (b - a);
  }

  function drawAxes(ctx, x, y, w, h) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var yy = y + i * h / 4;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  }

  function drawCutoffCurve(ctx, box, result) {
    panel(ctx, box, "Cutoff curve", "exact success probability for reject-then-record rules");
    var x = box.x + 46;
    var y = box.y + 58;
    var w = box.w - 66;
    var h = box.h - 92;
    drawAxes(ctx, x, y, w, h);
    ctx.strokeStyle = COLORS.exact;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.curve.rows.forEach(function (row, index) {
      var px = scale(row.cutoff, 1, result.params.n, x, x + w);
      var py = scale(row.probability, 0, Math.max(0.45, result.curve.best.probability * 1.12), y + h, y);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    vertical(ctx, x, y, w, h, result.params.n, result.params.cutoff, COLORS.chosen, "chosen");
    vertical(ctx, x, y, w, h, result.params.n, result.curve.best.cutoff, COLORS.optimum, "optimal");
    label(ctx, "1/e", x + w - 30, scale(1 / Math.E, 0, Math.max(0.45, result.curve.best.probability * 1.12), y + h, y) - 4, COLORS.muted);
    ctx.strokeStyle = COLORS.rule;
    ctx.setLineDash([4, 4]);
    var ey = scale(1 / Math.E, 0, Math.max(0.45, result.curve.best.probability * 1.12), y + h, y);
    ctx.beginPath();
    ctx.moveTo(x, ey);
    ctx.lineTo(x + w, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    axisLabel(ctx, "1", x, y + h + 22, "left");
    axisLabel(ctx, "n=" + result.params.n, x + w, y + h + 22, "right");
    axisLabel(ctx, formatPercent(result.curve.best.probability, 1), x - 8, y + 4, "right");
  }

  function vertical(ctx, x, y, w, h, n, cutoff, color, text) {
    var px = scale(cutoff, 1, n, x, x + w);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + h);
    ctx.stroke();
    label(ctx, text, Math.min(px + 4, x + w - 48), y + 16, color);
  }

  function drawBackward(ctx, box, result) {
    panel(ctx, box, "Backward induction", "a record is accepted when i/n clears continuation value");
    var x = box.x + 46;
    var y = box.y + 58;
    var w = box.w - 66;
    var h = box.h - 92;
    drawAxes(ctx, x, y, w, h);
    drawLine(ctx, result.params.n, function (i) { return result.dp.stopPayoff[i]; }, x, y, w, h, COLORS.record);
    drawLine(ctx, result.params.n, function (i) { return result.dp.continuePayoff[i]; }, x, y, w, h, COLORS.chosen);
    var first = result.dp.firstAccept;
    ctx.fillStyle = "rgba(15, 118, 110, 0.08)";
    ctx.fillRect(scale(first, 1, result.params.n, x, x + w), y, x + w - scale(first, 1, result.params.n, x, x + w), h);
    vertical(ctx, x, y, w, h, result.params.n, first, COLORS.optimum, "first accept-record");
    label(ctx, "stop value i/n", x + 8, y + 16, COLORS.record);
    label(ctx, "continue value", x + 112, y + 16, COLORS.chosen);
  }

  function drawLine(ctx, n, accessor, x, y, w, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 1; i <= n; i += 1) {
      var px = scale(i, 1, n, x, x + w);
      var py = scale(accessor(i), 0, 1, y + h, y);
      if (i === 1) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  function drawPath(ctx, box, result) {
    panel(ctx, box, "One shuffled order", "gray waits, orange records, blue selected candidate");
    var x = box.x + 42;
    var y = box.y + 58;
    var w = box.w - 62;
    var h = box.h - 92;
    drawAxes(ctx, x, y, w, h);
    var stride = Math.max(1, Math.ceil(result.params.n / 120));
    result.path.rows.forEach(function (row) {
      if ((row.index - 1) % stride !== 0 && !row.selected && !row.record) return;
      var px = scale(row.index, 1, result.params.n, x, x + w);
      var py = scale(row.value, 1, result.params.n, y + h, y);
      ctx.fillStyle = row.selected ? COLORS.chosen : row.record ? COLORS.record : COLORS.wait;
      ctx.beginPath();
      ctx.arc(px, py, row.selected ? 6 : row.record ? 4 : 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
    vertical(ctx, x, y, w, h, result.params.n, result.params.cutoff, COLORS.chosen, "eligible");
    axisLabel(ctx, "rank 1", x - 8, y + h, "right");
    axisLabel(ctx, "best", x - 8, y + 4, "right");
    label(ctx, "selected #" + result.path.chosenPosition + " rank " + (result.params.n + 1 - result.path.chosenValue), x + 8, y + 16, result.path.success ? COLORS.exact : COLORS.chosen);
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "Ledger", "same stopping rule, three ways of checking it");
    var x = box.x + 18;
    var y = box.y + 62;
    var rows = [
      ["chosen cutoff", String(result.params.cutoff)],
      ["chosen exact success", formatPercent(result.selectedExact, 2)],
      ["chosen simulated success", formatPercent(result.selectedSim.success, 2)],
      ["optimal cutoff", String(result.curve.best.cutoff)],
      ["optimal exact success", formatPercent(result.curve.best.probability, 2)],
      ["DP first accept-record", String(result.dp.firstAccept)],
      ["average stop", formatNumber(result.selectedSim.averageStop, 1)],
      ["record-stop rate", formatPercent(result.selectedSim.recordStopRate, 1)]
    ];
    ctx.font = "12px system-ui, sans-serif";
    rows.forEach(function (row, index) {
      var yy = y + index * 24;
      ctx.fillStyle = index % 2 ? COLORS.white : "#eef4fa";
      roundRect(ctx, x, yy - 14, box.w - 36, 21, 5);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(row[0], x + 10, yy);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.fillText(row[1], x + box.w - 112, yy);
      ctx.font = "12px system-ui, sans-serif";
    });
  }

  function label(ctx, text, x, y, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText(text, x, y);
  }

  function axisLabel(ctx, text, x, y, align) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function layout(width, height) {
    var margin = 14;
    var gap = 14;
    if (width < 700) {
      var rowH = (height - margin * 2 - gap * 3) / 4;
      return [
        { x: margin, y: margin, w: width - margin * 2, h: rowH },
        { x: margin, y: margin + rowH + gap, w: width - margin * 2, h: rowH },
        { x: margin, y: margin + 2 * (rowH + gap), w: width - margin * 2, h: rowH },
        { x: margin, y: margin + 3 * (rowH + gap), w: width - margin * 2, h: rowH }
      ];
    }
    var colW = (width - margin * 2 - gap) / 2;
    var row = (height - margin * 2 - gap) / 2;
    return [
      { x: margin, y: margin, w: colW, h: row },
      { x: margin + colW + gap, y: margin, w: colW, h: row },
      { x: margin, y: margin + row + gap, w: colW, h: row },
      { x: margin + colW + gap, y: margin + row + gap, w: colW, h: row }
    ];
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    ctx.clearRect(0, 0, setup.width, setup.height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, setup.width, setup.height);
    var boxes = layout(setup.width, setup.height);
    drawCutoffCurve(ctx, boxes[0], result);
    drawBackward(ctx, boxes[1], result);
    drawPath(ctx, boxes[2], result);
    drawLedger(ctx, boxes[3], result);
  }

  function readParams(root, previous) {
    var raw = Object.assign({}, previous || DEFAULTS);
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function updateControls(root, params) {
    var cutoff = root.querySelector('[data-param="cutoff"]');
    if (cutoff) {
      cutoff.max = String(params.n);
      if (Number(cutoff.value) > params.n) cutoff.value = String(params.n);
    }
    var display = {
      cutoff: String(params.cutoff),
      n: String(params.n),
      seed: String(params.seed),
      trials: formatNumber(params.trials, 0)
    };
    Object.keys(display).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (node) {
        node.textContent = display[key];
      });
    });
  }

  function updateMetrics(root, result) {
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    holder.innerHTML = [
      metric("chosen exact", formatPercent(result.selectedExact, 2)),
      metric("chosen sim", formatPercent(result.selectedSim.success, 2)),
      metric("optimal cutoff", String(result.curve.best.cutoff), "good"),
      metric("optimal exact", formatPercent(result.curve.best.probability, 2), "good"),
      metric("DP agrees", result.audit.dpAgrees ? "yes" : "no", result.audit.dpAgrees ? "good" : "bad"),
      metric("selected", result.path.success ? "best" : "rank " + (result.params.n + 1 - result.path.chosenValue), result.path.success ? "good" : "plain")
    ].join("");
  }

  function render(root, state) {
    var params = readParams(root, state && state.params);
    var result = evaluate(params);
    updateControls(root, params);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__secretaryStoppingState = { params: params, result: result };
  }

  function init(root) {
    if (!root || root.__secretaryStoppingReady) return;
    root.__secretaryStoppingReady = true;
    var rerender = function () { render(root, root.__secretaryStoppingState); };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", rerender);
      input.addEventListener("change", rerender);
    });
    render(root, null);
  }

  var api = {
    auditSecretaryStoppingLab: auditSecretaryStoppingLab,
    dynamicProgram: dynamicProgram,
    evaluate: evaluate,
    exactSuccess: exactSuccess
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global.document) global.document.querySelectorAll("[data-secretary-stopping-lab]").forEach(init);
})(typeof window !== "undefined" ? window : globalThis);
