(function (global) {
  "use strict";

  var BIG = 9007199254740992n; // 2^53, the first integer spacing gap for binary64.

  var COLORS = {
    absAsc: "#0f766e",
    exact: "#111827",
    grid: "#e6edf3",
    kahan: "#7c3aed",
    left: "#be123c",
    muted: "#5d6872",
    neumaier: "#2563eb",
    pairwise: "#d97706",
    panel: "#f8fafc",
    rule: "#d7dee5",
    shard: "#0891b2",
    text: "#172026",
    white: "#ffffff"
  };

  var SCENARIOS = {
    bookend: {
      label: "bookended units",
      note: "A huge value, many ones, then the cancelling huge value."
    },
    triples: {
      label: "hostile triples",
      note: "Repeat [2^53, 1, -2^53]; compensation is helpful but not magic."
    },
    ledger: {
      label: "mixed ledger",
      note: "Balanced powers of two with small integer debits scattered through the stream."
    }
  };

  var SCHEDULES = {
    input: "input order",
    reverse: "reverse",
    absAsc: "small magnitude first",
    absDesc: "large magnitude first",
    shuffle: "deterministic shuffle"
  };

  var METHODS = [
    { key: "left", label: "left fold", color: COLORS.left },
    { key: "pairwise", label: "pairwise", color: COLORS.pairwise },
    { key: "kahan", label: "Kahan", color: COLORS.kahan },
    { key: "neumaier", label: "Neumaier", color: COLORS.neumaier },
    { key: "absAsc", label: "sort by magnitude", color: COLORS.absAsc },
    { key: "sharded", label: "parallel shards", color: COLORS.shard }
  ];

  var DEFAULTS = {
    scenario: "bookend",
    schedule: "input",
    seed: 17,
    shards: 4,
    units: 64
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var schedule = SCHEDULES[raw.schedule] ? raw.schedule : DEFAULTS.schedule;
    return {
      scenario: scenario,
      schedule: schedule,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 97)),
      shards: Math.round(clamp(finite(Number(raw.shards), DEFAULTS.shards), 1, 16)),
      units: Math.round(clamp(finite(Number(raw.units), DEFAULTS.units), 4, 512))
    };
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function compareBig(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function absBig(value) {
    return value < 0n ? -value : value;
  }

  function numberOf(value) {
    return Number(value);
  }

  function integerDoubleToBig(value) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return BigInt(value);
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return value < 0 ? "-inf" : "inf";
    var places = digits == null ? 2 : digits;
    var abs = Math.abs(value);
    if (abs > 0 && (abs >= 1e6 || abs < 1e-3)) return value.toExponential(2);
    if (abs >= 1000) return value.toFixed(0);
    return value.toFixed(places);
  }

  function formatBig(value) {
    var sign = value < 0n ? "-" : "";
    var text = (value < 0n ? -value : value).toString();
    if (text.length <= 18) return sign + text;
    return sign + text.slice(0, 6) + "..." + text.slice(-6);
  }

  function metric(label, value) {
    return '<div class="sum-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    root.querySelectorAll("select[data-param]").forEach(function (select) {
      params[select.getAttribute("data-param")] = select.value;
    });
    return params;
  }

  function makeBookend(units) {
    var values = [BIG];
    for (var i = 0; i < units; i += 1) values.push(1n);
    values.push(-BIG);
    return values;
  }

  function makeTriples(units) {
    var values = [];
    for (var i = 0; i < units; i += 1) {
      values.push(BIG, 1n, -BIG);
    }
    return values;
  }

  function makeLedger(units, seed) {
    var values = [];
    for (var i = 0; i < units; i += 1) {
      var h = hash32(i + 1, seed * 977);
      var shift = 42 + (h % 12);
      var magnitude = 1n << BigInt(shift);
      var sign = (h & 1) ? 1n : -1n;
      var small = BigInt((h >>> 9) % 17) - 8n;
      if (small === 0n) small = (h & 2) ? 1n : -1n;

      if (i % 4 === 0) {
        values.push(sign * magnitude, small, -sign * magnitude);
      } else if (i % 4 === 1) {
        values.push(sign * magnitude, -sign * magnitude, small);
      } else if (i % 4 === 2) {
        values.push(small, sign * magnitude, -sign * magnitude);
      } else {
        values.push(sign * magnitude, -small, -sign * magnitude, 2n * small);
      }
    }
    return values;
  }

  function makeValues(params) {
    if (params.scenario === "triples") return makeTriples(params.units);
    if (params.scenario === "ledger") return makeLedger(params.units, params.seed);
    return makeBookend(params.units);
  }

  function exactSum(values) {
    var out = 0n;
    values.forEach(function (value) {
      out += value;
    });
    return out;
  }

  function deterministicShuffle(values, seed) {
    var out = values.slice();
    for (var i = out.length - 1; i > 0; i -= 1) {
      var j = hash32(i + 1, seed * 131 + out.length) % (i + 1);
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function scheduleValues(values, schedule, seed) {
    var out = values.slice();
    if (schedule === "reverse") return out.reverse();
    if (schedule === "shuffle") return deterministicShuffle(out, seed);
    if (schedule === "absAsc" || schedule === "absDesc") {
      out = out.map(function (value, index) {
        return { index: index, value: value };
      });
      out.sort(function (a, b) {
        var diff = compareBig(absBig(a.value), absBig(b.value));
        if (schedule === "absDesc") diff = -diff;
        return diff || a.index - b.index;
      });
      return out.map(function (row) { return row.value; });
    }
    return out;
  }

  function naiveSum(numbers) {
    var sum = 0;
    numbers.forEach(function (value) {
      sum += value;
    });
    return sum;
  }

  function pairwiseRange(numbers, start, end) {
    if (end <= start) return 0;
    if (end - start === 1) return numbers[start];
    var mid = start + Math.floor((end - start) / 2);
    return pairwiseRange(numbers, start, mid) + pairwiseRange(numbers, mid, end);
  }

  function pairwiseSum(numbers) {
    return pairwiseRange(numbers, 0, numbers.length);
  }

  function kahanSum(numbers) {
    var sum = 0;
    var c = 0;
    numbers.forEach(function (value) {
      var y = value - c;
      var t = sum + y;
      c = (t - sum) - y;
      sum = t;
    });
    return sum;
  }

  function neumaierSum(numbers) {
    var sum = 0;
    var c = 0;
    numbers.forEach(function (value) {
      var t = sum + value;
      if (Math.abs(sum) >= Math.abs(value)) {
        c += (sum - t) + value;
      } else {
        c += (value - t) + sum;
      }
      sum = t;
    });
    return sum + c;
  }

  function shardedSum(numbers, shardCount) {
    var shards = Math.max(1, Math.min(shardCount, numbers.length));
    var partials = [];
    for (var shard = 0; shard < shards; shard += 1) {
      var start = Math.floor(shard * numbers.length / shards);
      var end = Math.floor((shard + 1) * numbers.length / shards);
      partials.push(naiveSum(numbers.slice(start, end)));
    }
    return {
      partials: partials,
      value: naiveSum(partials)
    };
  }

  function errorUnits(value, exact) {
    var rounded = integerDoubleToBig(value);
    if (rounded == null) return null;
    return rounded - exact;
  }

  function methodRows(values, ordered, params, exact) {
    var numbers = ordered.map(numberOf);
    var magnitudeOrder = scheduleValues(values, "absAsc", params.seed).map(numberOf);
    var sharded = shardedSum(numbers, params.shards);
    var rows = [
      { key: "left", label: "left fold", value: naiveSum(numbers), color: COLORS.left },
      { key: "pairwise", label: "pairwise", value: pairwiseSum(numbers), color: COLORS.pairwise },
      { key: "kahan", label: "Kahan", value: kahanSum(numbers), color: COLORS.kahan },
      { key: "neumaier", label: "Neumaier", value: neumaierSum(numbers), color: COLORS.neumaier },
      { key: "absAsc", label: "sort by magnitude", value: naiveSum(magnitudeOrder), color: COLORS.absAsc },
      { key: "sharded", label: params.shards + " shards", value: sharded.value, color: COLORS.shard, partials: sharded.partials }
    ];
    rows.forEach(function (row) {
      row.error = errorUnits(row.value, exact);
      row.errorNumber = row.error == null ? row.value - Number(exact) : Number(row.error);
      row.hit = row.error === 0n;
    });
    return rows;
  }

  function spreadRows(values, params) {
    var rows = [];
    for (var i = 0; i < 40; i += 1) {
      var ordered = scheduleValues(values, "shuffle", params.seed + i * 11 + 3);
      var numbers = ordered.map(numberOf);
      rows.push({
        index: i,
        left: naiveSum(numbers),
        sharded: shardedSum(numbers, params.shards).value
      });
    }
    return rows;
  }

  function prefixTrace(ordered) {
    var rows = [];
    var exact = 0n;
    var floating = 0;
    var stride = Math.max(1, Math.floor(ordered.length / 220));
    for (var i = 0; i < ordered.length; i += 1) {
      exact += ordered[i];
      floating += Number(ordered[i]);
      if (i % stride === 0 || i === ordered.length - 1) {
        var rounded = integerDoubleToBig(floating);
        rows.push({
          i: i + 1,
          prefixError: rounded == null ? 0 : Number(rounded - exact),
          value: floating
        });
      }
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var values = makeValues(params);
    var ordered = scheduleValues(values, params.schedule, params.seed);
    var exact = exactSum(values);
    var methods = methodRows(values, ordered, params, exact);
    var spread = spreadRows(values, params);
    var leftValues = spread.map(function (row) { return row.left; });
    var shardValues = spread.map(function (row) { return row.sharded; });
    var allSpreadValues = leftValues.concat(shardValues);
    var unique = {};
    allSpreadValues.forEach(function (value) {
      unique[String(value)] = true;
    });
    return {
      exact: exact,
      methods: methods,
      params: params,
      prefix: prefixTrace(ordered),
      scenario: SCENARIOS[params.scenario],
      spread: {
        max: Math.max.apply(null, allSpreadValues),
        min: Math.min.apply(null, allSpreadValues),
        rows: spread,
        unique: Object.keys(unique).length
      },
      values: values
    };
  }

  function drawText(ctx, text, x, y, options) {
    options = options || {};
    ctx.save();
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || "500") + " " + (options.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "alphabetic";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawPanel(ctx, x, y, w, h, title) {
    ctx.save();
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, { color: COLORS.text, size: 13, weight: "750" });
    ctx.restore();
  }

  function barScale(values) {
    var maxAbs = 1;
    values.forEach(function (value) {
      maxAbs = Math.max(maxAbs, Math.abs(value));
    });
    return maxAbs;
  }

  function drawMethodBars(ctx, data, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "answers by algorithm (error in integer units)");
    var rows = data.methods;
    var top = y + 44;
    var rowH = (h - 58) / rows.length;
    var center = x + w * 0.58;
    var scale = barScale(rows.map(function (row) { return row.errorNumber; }));
    var half = w * 0.34;

    ctx.save();
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(center, top - 8);
    ctx.lineTo(center, y + h - 14);
    ctx.stroke();

    rows.forEach(function (row, index) {
      var cy = top + index * rowH + rowH * 0.48;
      drawText(ctx, row.label, x + 14, cy + 4, { color: COLORS.text, size: 12, weight: "650" });
      var bar = scale === 0 ? 0 : row.errorNumber / scale * half;
      ctx.fillStyle = row.hit ? COLORS.exact : row.color;
      ctx.fillRect(bar >= 0 ? center : center + bar, cy - 8, Math.max(2, Math.abs(bar)), 16);
      drawText(ctx, (row.errorNumber > 0 ? "+" : "") + formatNumber(row.errorNumber, 0), center + bar + (bar >= 0 ? 8 : -8), cy + 4, {
        align: bar >= 0 ? "left" : "right",
        color: row.hit ? COLORS.exact : row.color,
        size: 11,
        weight: "750"
      });
    });
    drawText(ctx, "0", center + 4, y + h - 16, { color: COLORS.muted, size: 10 });
    drawText(ctx, "+/-" + formatNumber(scale, 0), x + w - 14, y + h - 16, { align: "right", color: COLORS.muted, size: 10 });
    ctx.restore();
  }

  function yScale(value, min, max, top, height) {
    if (max === min) return top + height / 2;
    return top + height - (value - min) / (max - min) * height;
  }

  function drawSpread(ctx, data, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "same data, 40 deterministic shuffle schedules");
    var rows = data.spread.rows;
    var exact = Number(data.exact);
    var min = Math.min(data.spread.min, exact);
    var max = Math.max(data.spread.max, exact);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    var pad = Math.max(1, (max - min) * 0.12);
    min -= pad;
    max += pad;

    var left = x + 42;
    var right = x + w - 18;
    var top = y + 44;
    var bottom = y + h - 30;
    var plotH = bottom - top;

    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gy = top + plotH * g / 4;
      ctx.beginPath();
      ctx.moveTo(left, gy);
      ctx.lineTo(right, gy);
      ctx.stroke();
    }

    var exactY = yScale(exact, min, max, top, plotH);
    ctx.strokeStyle = COLORS.exact;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(left, exactY);
    ctx.lineTo(right, exactY);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "exact " + formatBig(data.exact), left, exactY - 6, { color: COLORS.exact, size: 11, weight: "700" });

    rows.forEach(function (row, index) {
      var px = left + (right - left) * index / Math.max(1, rows.length - 1);
      var ly = yScale(row.left, min, max, top, plotH);
      var sy = yScale(row.sharded, min, max, top, plotH);
      ctx.fillStyle = COLORS.left;
      ctx.beginPath();
      ctx.arc(px, ly, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.shard;
      ctx.fillRect(px - 2.5, sy - 2.5, 5, 5);
    });
    drawText(ctx, "left fold", right - 70, y + 24, { color: COLORS.left, size: 11, weight: "750" });
    drawText(ctx, "sharded", right - 8, y + 24, { align: "right", color: COLORS.shard, size: 11, weight: "750" });
    drawText(ctx, "range " + formatNumber(data.spread.min, 0) + " to " + formatNumber(data.spread.max, 0), left, y + h - 10, { color: COLORS.muted, size: 10 });
    ctx.restore();
  }

  function drawPrefix(ctx, data, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "prefix error while the selected schedule runs");
    var rows = data.prefix;
    var errors = rows.map(function (row) { return row.prefixError; });
    var scale = barScale(errors);
    var min = -scale;
    var max = scale;
    var left = x + 40;
    var right = x + w - 18;
    var top = y + 46;
    var bottom = y + h - 28;
    var plotH = bottom - top;
    var zeroY = yScale(0, min, max, top, plotH);

    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(left, zeroY);
    ctx.lineTo(right, zeroY);
    ctx.stroke();

    ctx.strokeStyle = COLORS.left;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var px = left + (right - left) * index / Math.max(1, rows.length - 1);
      var py = yScale(row.prefixError, min, max, top, plotH);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    var last = rows[rows.length - 1] || { prefixError: 0 };
    drawText(ctx, "floating prefix - exact prefix", left, y + 24, { color: COLORS.muted, size: 11, weight: "650" });
    drawText(ctx, "final " + (last.prefixError > 0 ? "+" : "") + formatNumber(last.prefixError, 0), right, y + 24, { align: "right", color: COLORS.left, size: 11, weight: "750" });
    drawText(ctx, "-" + formatNumber(scale, 0), x + 13, bottom, { color: COLORS.muted, size: 10 });
    drawText(ctx, "+" + formatNumber(scale, 0), x + 13, top + 4, { color: COLORS.muted, size: 10 });
    ctx.restore();
  }

  function draw(canvas, data) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    drawText(ctx, data.scenario.label + " / " + SCHEDULES[data.params.schedule], 18, 28, {
      color: COLORS.text,
      size: 17,
      weight: "800"
    });
    drawText(ctx, data.scenario.note, 18, 50, { color: COLORS.muted, size: 12, weight: "500" });

    drawMethodBars(ctx, data, 18, 70, width - 36, 238);
    drawSpread(ctx, data, 18, 326, width - 36, 190);
    drawPrefix(ctx, data, 18, 536, width - 36, height - 554);
  }

  function updateOutputs(root, params) {
    var units = root.querySelector('[data-value="units"]');
    var shards = root.querySelector('[data-value="shards"]');
    var seed = root.querySelector('[data-value="seed"]');
    if (units) units.textContent = String(params.units);
    if (shards) shards.textContent = String(params.shards);
    if (seed) seed.textContent = String(params.seed);
  }

  function render(root) {
    var params = cleanParams(paramsFromRoot(root));
    var data = evaluate(params);
    updateOutputs(root, params);

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var left = data.methods.filter(function (row) { return row.key === "left"; })[0];
      var neumaier = data.methods.filter(function (row) { return row.key === "neumaier"; })[0];
      var sharded = data.methods.filter(function (row) { return row.key === "sharded"; })[0];
      metrics.innerHTML = [
        metric("exact ledger", formatBig(data.exact)),
        metric("left fold", formatNumber(left.value, 0)),
        metric("Neumaier", formatNumber(neumaier.value, 0)),
        metric("sharded", formatNumber(sharded.value, 0)),
        metric("shuffle range", formatNumber(data.spread.min, 0) + "..." + formatNumber(data.spread.max, 0)),
        metric("distinct answers", String(data.spread.unique))
      ].join("");
    }

    draw(root.querySelector("canvas[data-canvas]"), data);
  }

  function init(root) {
    if (!root) return;
    root.querySelectorAll("input[data-param], select[data-param]").forEach(function (control) {
      control.addEventListener("input", function () { render(root); });
      control.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function audit() {
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    var bookend = evaluate({ scenario: "bookend", units: 64, schedule: "input", shards: 4, seed: 17 });
    var bookendAbs = evaluate({ scenario: "bookend", units: 64, schedule: "absAsc", shards: 4, seed: 17 });
    var triples = evaluate({ scenario: "triples", units: 32, schedule: "input", shards: 4, seed: 17 });
    var ledger = evaluate({ scenario: "ledger", units: 96, schedule: "shuffle", shards: 7, seed: 29 });

    assert(bookend.exact === 64n, "bookend exact sum should equal units");
    assert(bookend.methods.filter(function (row) { return row.key === "left"; })[0].value === 0, "left fold should lose bookended ones");
    assert(bookend.methods.filter(function (row) { return row.key === "kahan"; })[0].error === 0n, "Kahan should recover bookended ones");
    assert(bookend.methods.filter(function (row) { return row.key === "neumaier"; })[0].error === 0n, "Neumaier should recover bookended ones");
    assert(bookendAbs.methods.filter(function (row) { return row.key === "left"; })[0].error === 0n, "small-first schedule should recover bookended ones");

    assert(triples.exact === 32n, "triples exact sum should equal groups");
    assert(triples.methods.filter(function (row) { return row.key === "left"; })[0].value === 0, "left fold should lose hostile triple ones");
    assert(triples.methods.filter(function (row) { return row.key === "kahan"; })[0].error !== 0n, "Kahan should not be advertised as universal");
    assert(triples.methods.filter(function (row) { return row.key === "neumaier"; })[0].error === 0n, "Neumaier should recover hostile triples");

    assert(ledger.spread.max > ledger.spread.min, "ledger shuffles should expose schedule spread");
    [bookend, bookendAbs, triples, ledger].forEach(function (data) {
      data.methods.forEach(function (row) {
        assert(Number.isFinite(row.value), "method result should be finite for " + row.key);
      });
      assert(data.prefix.length > 2, "prefix trace should contain samples");
    });

    return {
      bookend: bookend.methods.map(function (row) { return [row.key, row.value, row.errorNumber]; }),
      ledgerRange: [ledger.spread.min, ledger.spread.max],
      triples: triples.methods.map(function (row) { return [row.key, row.value, row.errorNumber]; })
    };
  }

  global.FloatingSumLab = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    makeValues: function (raw) { return makeValues(cleanParams(raw)); }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.FloatingSumLab;
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-floating-sum-lab]").forEach(init);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
