(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    grid: "#edf2f7",
    pile: "#2563eb",
    lis: "#0f766e",
    dp: "#7c3aed",
    amber: "#b45309",
    bad: "#be123c"
  };

  var DEFAULTS = {
    scenario: "classic",
    length: 10,
    seed: 23,
    focus: 10
  };

  var SCENARIOS = {
    classic: "Aldous-Diaconis example",
    random: "random permutation",
    nearly: "nearly sorted",
    layered: "decreasing blocks",
    zigzag: "interleaved halves"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var length = scenario === "classic" ? 10 : Math.round(clamp(finite(Number(raw.length), DEFAULTS.length), 12, 96));
    return {
      scenario: scenario,
      length: length,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 9999)),
      focus: Math.round(clamp(finite(Number(raw.focus), DEFAULTS.focus), 1, length))
    };
  }

  function lcg(seed) {
    var state = seed >>> 0;
    return function () {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function range(n) {
    var out = [];
    for (var i = 1; i <= n; i += 1) out.push(i);
    return out;
  }

  function shuffle(values, seed) {
    var rand = lcg(seed);
    var out = values.slice();
    for (var i = out.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function generateSequence(params) {
    if (params.scenario === "classic") return [7, 2, 8, 1, 3, 4, 10, 6, 9, 5];
    var n = params.length;
    if (params.scenario === "random") return shuffle(range(n), params.seed);
    if (params.scenario === "nearly") {
      var nearly = range(n);
      var rand = lcg(params.seed);
      var swaps = Math.max(1, Math.round(n * 0.65));
      for (var s = 0; s < swaps; s += 1) {
        var i = Math.floor(rand() * (n - 1));
        var tmp = nearly[i];
        nearly[i] = nearly[i + 1];
        nearly[i + 1] = tmp;
      }
      return nearly;
    }
    if (params.scenario === "layered") {
      var block = Math.max(3, Math.round(Math.sqrt(n)));
      var layered = [];
      for (var start = 1; start <= n; start += block) {
        var end = Math.min(n, start + block - 1);
        for (var value = end; value >= start; value -= 1) layered.push(value);
      }
      return layered;
    }
    var low = range(Math.ceil(n / 2));
    var high = range(n - Math.ceil(n / 2)).map(function (v) { return v + Math.ceil(n / 2); });
    var zig = [];
    for (var z = 0; z < high.length || z < low.length; z += 1) {
      if (z < high.length) zig.push(high[z]);
      if (z < low.length) zig.push(low[z]);
    }
    return zig;
  }

  function lowerBound(values, x) {
    var lo = 0;
    var hi = values.length;
    var comparisons = 0;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      comparisons += 1;
      if (values[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return { index: lo, comparisons: comparisons };
  }

  function patience(sequence) {
    var piles = [];
    var tops = [];
    var tailIndex = [];
    var cards = [];
    var steps = [];
    var comparisons = 0;
    sequence.forEach(function (value, i) {
      var lb = lowerBound(tops, value);
      var pile = lb.index;
      comparisons += lb.comparisons;
      var predecessor = pile > 0 ? tailIndex[pile - 1] : -1;
      var card = {
        value: value,
        index: i,
        pile: pile,
        predecessor: predecessor
      };
      cards.push(card);
      if (!piles[pile]) piles[pile] = [];
      piles[pile].push(card);
      tops[pile] = value;
      tailIndex[pile] = cards.length - 1;
      steps.push({
        index: i,
        value: value,
        pile: pile,
        predecessor: predecessor,
        tops: tops.slice(),
        pileTops: tailIndex.slice(),
        comparisons: comparisons
      });
    });
    var lis = [];
    var cursor = tailIndex[tailIndex.length - 1];
    while (cursor != null && cursor >= 0) {
      lis.push(cards[cursor]);
      cursor = cards[cursor].predecessor;
    }
    lis.reverse();
    return {
      piles: piles,
      cards: cards,
      steps: steps,
      lis: lis,
      length: tops.length,
      comparisons: comparisons
    };
  }

  function dpLis(sequence) {
    var n = sequence.length;
    var dp = new Array(n);
    var prev = new Array(n);
    var comparisons = 0;
    var best = 0;
    var bestIndex = 0;
    for (var i = 0; i < n; i += 1) {
      dp[i] = 1;
      prev[i] = -1;
      for (var j = 0; j < i; j += 1) {
        comparisons += 1;
        if (sequence[j] < sequence[i] && dp[j] + 1 > dp[i]) {
          dp[i] = dp[j] + 1;
          prev[i] = j;
        }
      }
      if (dp[i] > best) {
        best = dp[i];
        bestIndex = i;
      }
    }
    var indices = [];
    var cursor = bestIndex;
    while (cursor >= 0) {
      indices.push(cursor);
      cursor = prev[cursor];
    }
    indices.reverse();
    return {
      length: best,
      indices: indices,
      values: indices.map(function (i) { return sequence[i]; }),
      comparisons: comparisons
    };
  }

  function monteCarlo(n, seed, trials) {
    var lengths = [];
    for (var i = 0; i < trials; i += 1) {
      lengths.push(patience(shuffle(range(n), seed + i * 977)).length);
    }
    lengths.sort(function (a, b) { return a - b; });
    var sum = lengths.reduce(function (a, b) { return a + b; }, 0);
    return {
      trials: trials,
      min: lengths[0],
      max: lengths[lengths.length - 1],
      mean: sum / lengths.length,
      median: lengths[Math.floor(lengths.length / 2)],
      twoSqrtN: 2 * Math.sqrt(n),
      lengths: lengths
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var sequence = generateSequence(params);
    var pat = patience(sequence);
    var dp = dpLis(sequence);
    var mc = monteCarlo(params.length, params.seed + 1000, 64);
    var result = {
      params: params,
      sequence: sequence,
      patience: pat,
      dp: dp,
      monteCarlo: mc,
      focusStep: pat.steps[Math.min(params.focus, sequence.length) - 1]
    };
    result.audit = audit(result);
    return result;
  }

  function isIncreasing(values) {
    for (var i = 1; i < values.length; i += 1) {
      if (!(values[i - 1] < values[i])) return false;
    }
    return true;
  }

  function audit(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var n = result.sequence.length;
    var sorted = result.sequence.slice().sort(function (a, b) { return a - b; });
    check("sequence is permutation of 1..n", sorted.every(function (value, i) { return value === i + 1; }));
    check("patience agrees with dynamic program", result.patience.length === result.dp.length);
    check("reconstructed patience subsequence has right length", result.patience.lis.length === result.patience.length);
    check("reconstructed patience subsequence is increasing", isIncreasing(result.patience.lis.map(function (card) { return card.value; })));
    check("dynamic program subsequence is increasing", isIncreasing(result.dp.values));
    check("pile tops stay increasing", result.patience.steps.every(function (step) { return isIncreasing(step.tops); }));
    check("one step per input", result.patience.steps.length === n);
    check("comparison counts finite", Number.isFinite(result.patience.comparisons) && Number.isFinite(result.dp.comparisons));
    check("quadratic comparison count exact", result.dp.comparisons === n * (n - 1) / 2);
    check("monte carlo finite", Number.isFinite(result.monteCarlo.mean) && result.monteCarlo.min <= result.monteCarlo.median && result.monteCarlo.median <= result.monteCarlo.max);
    if (result.params.scenario === "classic") {
      check("classic example has five piles", result.patience.length === 5);
      check("classic recovered LIS", result.patience.lis.map(function (card) { return card.value; }).join(",") === "1,3,4,6,9");
    }
    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function auditGrid() {
    var cases = [
      { scenario: "classic", length: 10, seed: 23, focus: 10 },
      { scenario: "random", length: 48, seed: 11, focus: 32 },
      { scenario: "nearly", length: 64, seed: 41, focus: 40 },
      { scenario: "layered", length: 72, seed: 19, focus: 45 },
      { scenario: "zigzag", length: 60, seed: 77, focus: 50 }
    ].map(function (params) {
      var result = evaluate(params);
      return {
        dpComparisons: result.dp.comparisons,
        failedChecks: result.audit.checks
          .filter(function (row) { return !row.ok; })
          .map(function (row) { return row.name; }),
        length: result.params.length,
        lis: result.patience.lis.map(function (card) { return card.value; }),
        lisLength: result.patience.length,
        passed: result.audit.passed,
        patienceComparisons: result.patience.comparisons,
        scenario: result.params.scenario,
        seed: result.params.seed
      };
    });
    return {
      cases: cases,
      passed: cases.filter(function (row) { return row.passed; }).length,
      total: cases.length
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value, className) {
    return '<div class="lis-lab__metric ' + (className || "") + '"><span>' +
      label + "</span><strong>" + value + "</strong></div>";
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = options.align || "left";
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
    text(ctx, title, box.x + 14, box.y + 18, { size: 12, weight: 800 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, { color: COLORS.muted, size: 10, weight: 600 });
  }

  function drawPiles(ctx, result, box) {
    panel(ctx, box, "patience piles", "leftmost legal pile keeps the smallest possible tail for each length");
    var piles = result.patience.piles;
    var maxHeight = Math.max.apply(null, piles.map(function (pile) { return pile.length; }).concat([1]));
    var plot = { x: box.x + 24, y: box.y + 62, w: box.w - 48, h: box.h - 94 };
    var pileW = plot.w / Math.max(1, piles.length);
    var lisValues = {};
    result.patience.lis.forEach(function (card) { lisValues[card.index] = true; });
    piles.forEach(function (pile, p) {
      pile.forEach(function (card, depth) {
        var x = plot.x + p * pileW + pileW * 0.12;
        var y = plot.y + plot.h - (depth + 1) * (plot.h / maxHeight) + 4;
        var w = pileW * 0.76;
        var h = Math.max(15, plot.h / maxHeight - 5);
        ctx.fillStyle = lisValues[card.index] ? "rgba(15,118,110,0.16)" : COLORS.white;
        ctx.strokeStyle = lisValues[card.index] ? COLORS.lis : COLORS.rule;
        ctx.lineWidth = lisValues[card.index] ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 5);
        ctx.fill();
        ctx.stroke();
        text(ctx, String(card.value), x + w / 2, y + h / 2, { align: "center", color: lisValues[card.index] ? COLORS.lis : COLORS.text, size: 10, weight: 800 });
      });
      text(ctx, String(p + 1), plot.x + p * pileW + pileW / 2, box.y + box.h - 19, { align: "center", color: COLORS.muted, size: 9, weight: 700 });
    });
  }

  function drawScatter(ctx, result, box) {
    panel(ctx, box, "sequence as points", "an increasing subsequence is an up-right chain");
    var n = result.sequence.length;
    var plot = { x: box.x + 44, y: box.y + 62, w: box.w - 72, h: box.h - 94 };
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    var lisIndex = {};
    result.patience.lis.forEach(function (card) { lisIndex[card.index] = card; });
    var prev = null;
    result.patience.lis.forEach(function (card) {
      var x = plot.x + card.index / Math.max(1, n - 1) * plot.w;
      var y = plot.y + plot.h - (card.value - 1) / Math.max(1, n - 1) * plot.h;
      if (prev) {
        ctx.strokeStyle = COLORS.lis;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      prev = { x: x, y: y };
    });
    result.sequence.forEach(function (value, i) {
      var x = plot.x + i / Math.max(1, n - 1) * plot.w;
      var y = plot.y + plot.h - (value - 1) / Math.max(1, n - 1) * plot.h;
      ctx.fillStyle = lisIndex[i] ? COLORS.lis : COLORS.pile;
      ctx.globalAlpha = lisIndex[i] ? 1 : 0.45;
      ctx.beginPath();
      ctx.arc(x, y, lisIndex[i] ? 4.2 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    text(ctx, "index", plot.x + plot.w, box.y + box.h - 18, { color: COLORS.muted, size: 10, weight: 650, align: "right" });
    text(ctx, "value", plot.x - 26, plot.y + 2, { color: COLORS.muted, size: 10, weight: 650, align: "center" });
  }

  function drawTops(ctx, result, box) {
    panel(ctx, box, "frontier over time", "pile tops after each prefix");
    var n = result.sequence.length;
    var maxLen = result.patience.length;
    var plot = { x: box.x + 38, y: box.y + 62, w: box.w - 60, h: box.h - 94 };
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    result.patience.steps.forEach(function (step) {
      step.tops.forEach(function (top, len) {
        var x = plot.x + step.index / Math.max(1, n - 1) * plot.w;
        var y = plot.y + plot.h - len / Math.max(1, maxLen - 1) * plot.h;
        var shade = clamp((top - 1) / Math.max(1, n - 1), 0, 1);
        ctx.fillStyle = "rgb(" + Math.round(37 + 143 * shade) + "," + Math.round(99 + 70 * (1 - shade)) + "," + Math.round(235 - 160 * shade) + ")";
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      });
    });
    var focus = result.focusStep;
    if (focus) {
      var fx = plot.x + focus.index / Math.max(1, n - 1) * plot.w;
      ctx.strokeStyle = COLORS.amber;
      ctx.beginPath();
      ctx.moveTo(fx, plot.y);
      ctx.lineTo(fx, plot.y + plot.h);
      ctx.stroke();
      text(ctx, "step " + (focus.index + 1), fx + 5, plot.y + 12, { color: COLORS.amber, size: 10, weight: 800 });
    }
    text(ctx, "pile length", plot.x, box.y + box.h - 18, { color: COLORS.muted, size: 10, weight: 650 });
  }

  function drawAudit(ctx, result, box) {
    panel(ctx, box, "audit ledger", "binary-search frontier vs quadratic dynamic program");
    var x = box.x + 20;
    var y = box.y + 66;
    var rows = [
      ["patience piles", result.patience.length],
      ["DP length", result.dp.length],
      ["patience comparisons", result.patience.comparisons],
      ["DP comparisons", result.dp.comparisons],
      ["random mean L_n", fmt(result.monteCarlo.mean, 2)],
      ["2 sqrt(n)", fmt(result.monteCarlo.twoSqrtN, 2)]
    ];
    rows.forEach(function (row, i) {
      text(ctx, row[0], x, y + i * 28, { color: i < 2 ? COLORS.text : COLORS.muted, size: 11, weight: 700 });
      text(ctx, String(row[1]), box.x + box.w - 20, y + i * 28, { color: i < 2 ? COLORS.lis : COLORS.text, size: 12, weight: 800, align: "right" });
    });
    var lis = result.patience.lis.map(function (card) { return card.value; }).join(" ");
    text(ctx, "one LIS", x, box.y + box.h - 48, { color: COLORS.muted, size: 10, weight: 700 });
    text(ctx, lis, x, box.y + box.h - 25, { color: COLORS.lis, size: 12, weight: 800 });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    var gap = 14;
    var leftW = Math.floor(width * 0.42);
    drawPiles(ctx, result, { x: gap, y: gap, w: leftW - gap, h: 342 });
    drawAudit(ctx, result, { x: gap, y: 370, w: leftW - gap, h: height - 384 });
    drawScatter(ctx, result, { x: leftW + gap, y: gap, w: width - leftW - 2 * gap, h: 342 });
    drawTops(ctx, result, { x: leftW + gap, y: 370, w: width - leftW - 2 * gap, h: height - 384 });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setOutputs(root, result) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "scenario") output.textContent = SCENARIOS[result.params.scenario];
      else output.textContent = result.params[key];
    });
    var lengthInput = root.querySelector('[data-param="length"]');
    var focusInput = root.querySelector('[data-param="focus"]');
    if (lengthInput) {
      lengthInput.disabled = result.params.scenario === "classic";
      lengthInput.value = String(result.params.length);
    }
    if (focusInput) {
      focusInput.max = result.params.length;
      focusInput.value = String(Math.min(Number(focusInput.value || result.params.focus), result.params.length));
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("LIS length", result.patience.length, "lis-lab__metric--good"),
        metric("piles", result.patience.piles.length),
        metric("patience comparisons", result.patience.comparisons),
        metric("DP comparisons", result.dp.comparisons),
        metric("random mean", fmt(result.monteCarlo.mean, 2)),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "lis-lab__metric--good" : "lis-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = SCENARIOS[result.params.scenario] + ": " + result.sequence.join(" ") +
        ". One LIS is " + result.patience.lis.map(function (card) { return card.value; }).join(" ") +
        "; DP agrees at length " + result.dp.length + ".";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__lisPatienceResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__lisPatienceReady) return;
    root.__lisPatienceReady = true;
    var timer = null;
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(root); }, 35);
      });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-lis-patience-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-lis-patience-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    normalize: normalize,
    patience: patience,
    dpLis: dpLis,
    generateSequence: generateSequence
  };

  global.LISPatienceLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
