(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    textbook: "#be123c",
    twoPass: "#2563eb",
    shifted: "#0f766e",
    welford: "#7c3aed",
    pairwise: "#d97706",
    reference: "#111827"
  };

  var METHODS = [
    { key: "textbook", label: "textbook", color: COLORS.textbook },
    { key: "twoPass", label: "two pass", color: COLORS.twoPass },
    { key: "shifted", label: "shifted", color: COLORS.shifted },
    { key: "welford", label: "Welford", color: COLORS.welford },
    { key: "pairwise", label: "pairwise", color: COLORS.pairwise }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32(index + 1, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 11, seed));
    var u2 = uniform(index * 2 + 12, seed ^ 0xa53a9a5b);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return value < 0 ? "-inf" : "inf";
    var places = digits == null ? 2 : digits;
    var abs = Math.abs(value);
    if (abs > 0 && (abs >= 1e5 || abs < 1e-3)) return value.toExponential(2);
    if (abs >= 1000) return value.toFixed(0);
    return value.toFixed(places);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="variance-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
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

  function cleanParams(raw) {
    var mode = raw.mode === "fp32" ? "fp32" : "fp64";
    return {
      mode: mode,
      n: clamp(Math.round(raw.n || 3072), 128, 12000),
      offsetExp: clamp(Math.round(raw.offsetExp == null ? 9 : raw.offsetExp), 0, mode === "fp32" ? 9 : 15),
      order: raw.order === "sorted" || raw.order === "alternating" ? raw.order : "mixed",
      spread: Math.pow(10, clamp(raw.spreadLog == null ? 0 : raw.spreadLog, -2, 3)),
      spreadLog: clamp(raw.spreadLog == null ? 0 : raw.spreadLog, -2, 3),
      trend: clamp(raw.trend == null ? 25 : raw.trend, 0, 100) / 100
    };
  }

  function arithmetic(mode) {
    if (mode === "fp32") {
      return {
        add: function (a, b) { return Math.fround(Math.fround(a) + Math.fround(b)); },
        cast: function (a) { return Math.fround(a); },
        div: function (a, b) { return Math.fround(Math.fround(a) / Math.fround(b)); },
        mul: function (a, b) { return Math.fround(Math.fround(a) * Math.fround(b)); },
        sub: function (a, b) { return Math.fround(Math.fround(a) - Math.fround(b)); }
      };
    }
    return {
      add: function (a, b) { return a + b; },
      cast: function (a) { return a; },
      div: function (a, b) { return a / b; },
      mul: function (a, b) { return a * b; },
      sub: function (a, b) { return a - b; }
    };
  }

  function kahanSum(values) {
    var sum = 0;
    var c = 0;
    values.forEach(function (value) {
      var y = value - c;
      var t = sum + y;
      c = (t - sum) - y;
      sum = t;
    });
    return sum;
  }

  function intendedDeltas(params) {
    var raw = [];
    for (var i = 0; i < params.n; i += 1) {
      var wave = Math.sin(i * 0.017 + 0.8) + 0.45 * Math.sin(i * 0.071);
      var draw = 0.55 * normal(i, 0x20260613);
      var drift = params.trend * (i / Math.max(1, params.n - 1) - 0.5) * 2.4;
      raw.push(wave + draw + drift);
    }
    var mean = kahanSum(raw) / raw.length;
    return raw.map(function (value) {
      return (value - mean) * params.spread;
    });
  }

  function varianceReference(values) {
    if (values.length < 2) return NaN;
    var origin = values[0];
    var shifted = values.map(function (value) { return value - origin; });
    var meanShift = kahanSum(shifted) / shifted.length;
    var squares = shifted.map(function (value) {
      var diff = value - meanShift;
      return diff * diff;
    });
    return kahanSum(squares) / (values.length - 1);
  }

  function makeData(params) {
    var ar = arithmetic(params.mode);
    var offset = Math.pow(10, params.offsetExp);
    var deltas = intendedDeltas(params);
    var intendedVar = varianceReference(deltas);
    var values = deltas.map(function (delta) {
      return ar.cast(offset + delta);
    });
    if (params.order === "sorted") {
      values.sort(function (a, b) { return a - b; });
    } else if (params.order === "alternating") {
      values.sort(function (a, b) { return a - b; });
      var alt = [];
      var lo = 0;
      var hi = values.length - 1;
      while (lo <= hi) {
        alt.push(values[lo]);
        if (lo !== hi) alt.push(values[hi]);
        lo += 1;
        hi -= 1;
      }
      values = alt;
    }
    return {
      ar: ar,
      intendedVar: intendedVar,
      offset: offset,
      values: values
    };
  }

  function textbook(values, ar) {
    var sum = ar.cast(0);
    var sumSq = ar.cast(0);
    values.forEach(function (x) {
      sum = ar.add(sum, x);
      sumSq = ar.add(sumSq, ar.mul(x, x));
    });
    var n = ar.cast(values.length);
    var correction = ar.div(ar.mul(sum, sum), n);
    var m2 = ar.sub(sumSq, correction);
    return {
      correction: correction,
      mean: ar.div(sum, n),
      m2: m2,
      sum: sum,
      sumSq: sumSq,
      variance: ar.div(m2, ar.cast(values.length - 1))
    };
  }

  function twoPass(values, ar) {
    var n = ar.cast(values.length);
    var sum = ar.cast(0);
    values.forEach(function (x) { sum = ar.add(sum, x); });
    var mean = ar.div(sum, n);
    var m2 = ar.cast(0);
    values.forEach(function (x) {
      var diff = ar.sub(x, mean);
      m2 = ar.add(m2, ar.mul(diff, diff));
    });
    return {
      mean: mean,
      m2: m2,
      variance: ar.div(m2, ar.cast(values.length - 1))
    };
  }

  function shiftedOnePass(values, ar) {
    var origin = values[0];
    var n = ar.cast(values.length);
    var sum = ar.cast(0);
    var sumSq = ar.cast(0);
    values.forEach(function (x) {
      var y = ar.sub(x, origin);
      sum = ar.add(sum, y);
      sumSq = ar.add(sumSq, ar.mul(y, y));
    });
    var m2 = ar.sub(sumSq, ar.div(ar.mul(sum, sum), n));
    return {
      mean: ar.add(origin, ar.div(sum, n)),
      m2: m2,
      variance: ar.div(m2, ar.cast(values.length - 1))
    };
  }

  function welford(values, ar) {
    var n = 0;
    var mean = ar.cast(0);
    var m2 = ar.cast(0);
    values.forEach(function (x) {
      n += 1;
      var delta = ar.sub(x, mean);
      mean = ar.add(mean, ar.div(delta, ar.cast(n)));
      var delta2 = ar.sub(x, mean);
      m2 = ar.add(m2, ar.mul(delta, delta2));
    });
    return {
      mean: mean,
      m2: m2,
      variance: ar.div(m2, ar.cast(values.length - 1))
    };
  }

  function stateFromRange(values, ar, start, end) {
    var n = 0;
    var mean = ar.cast(0);
    var m2 = ar.cast(0);
    for (var i = start; i < end; i += 1) {
      n += 1;
      var x = values[i];
      var delta = ar.sub(x, mean);
      mean = ar.add(mean, ar.div(delta, ar.cast(n)));
      m2 = ar.add(m2, ar.mul(delta, ar.sub(x, mean)));
    }
    return { mean: mean, m2: m2, n: n };
  }

  function mergeStates(a, b, ar) {
    if (!a.n) return b;
    if (!b.n) return a;
    var n = a.n + b.n;
    var delta = ar.sub(b.mean, a.mean);
    var mean = ar.add(a.mean, ar.mul(delta, ar.div(ar.cast(b.n), ar.cast(n))));
    var bridge = ar.mul(ar.mul(delta, delta), ar.div(ar.cast(a.n * b.n), ar.cast(n)));
    return {
      mean: mean,
      m2: ar.add(ar.add(a.m2, b.m2), bridge),
      n: n
    };
  }

  function pairwise(values, ar) {
    var block = 64;
    var states = [];
    for (var i = 0; i < values.length; i += block) {
      states.push(stateFromRange(values, ar, i, Math.min(values.length, i + block)));
    }
    while (states.length > 1) {
      var next = [];
      for (var j = 0; j < states.length; j += 2) {
        next.push(j + 1 < states.length ? mergeStates(states[j], states[j + 1], ar) : states[j]);
      }
      states = next;
    }
    var state = states[0] || { mean: NaN, m2: NaN, n: 0 };
    return {
      mean: state.mean,
      m2: state.m2,
      variance: ar.div(state.m2, ar.cast(values.length - 1))
    };
  }

  function relativeError(value, reference) {
    if (!isFinite(value)) return Infinity;
    if (reference === 0) return Math.abs(value);
    return Math.abs(value - reference) / Math.abs(reference);
  }

  function nextUp64(x) {
    if (!isFinite(x)) return x;
    if (x === 0) return Number.MIN_VALUE;
    var buffer = new ArrayBuffer(8);
    var view = new DataView(buffer);
    view.setFloat64(0, x);
    var hi = view.getUint32(0);
    var lo = view.getUint32(4);
    if (x > 0) {
      if (lo === 0xffffffff) {
        hi += 1;
        lo = 0;
      } else {
        lo += 1;
      }
    } else if (lo === 0) {
      hi -= 1;
      lo = 0xffffffff;
    } else {
      lo -= 1;
    }
    view.setUint32(0, hi);
    view.setUint32(4, lo);
    return view.getFloat64(0);
  }

  function nextUp32(x) {
    var value = Math.fround(x);
    if (!isFinite(value)) return value;
    if (value === 0) return Math.pow(2, -149);
    var buffer = new ArrayBuffer(4);
    var view = new DataView(buffer);
    view.setFloat32(0, value);
    var bits = view.getUint32(0);
    bits = value > 0 ? bits + 1 : bits - 1;
    view.setUint32(0, bits);
    return view.getFloat32(0);
  }

  function spacing(x, mode) {
    var v = mode === "fp32" ? Math.fround(x) : x;
    var next = mode === "fp32" ? nextUp32(v) : nextUp64(v);
    return Math.abs(next - v);
  }

  function evaluate(params) {
    var data = makeData(params);
    var values = data.values;
    var reference = varianceReference(values);
    var results = {
      pairwise: pairwise(values, data.ar),
      shifted: shiftedOnePass(values, data.ar),
      textbook: textbook(values, data.ar),
      twoPass: twoPass(values, data.ar),
      welford: welford(values, data.ar)
    };
    Object.keys(results).forEach(function (key) {
      results[key].error = relativeError(results[key].variance, reference);
      results[key].negative = results[key].variance < 0;
    });
    var inputLoss = relativeError(reference, data.intendedVar);
    var textbookM2 = results.textbook.m2;
    var cancellation = Math.max(Math.abs(results.textbook.sumSq), Math.abs(results.textbook.correction)) / Math.max(1e-300, Math.abs(reference * (values.length - 1)));
    return {
      cancellation: cancellation,
      inputLoss: inputLoss,
      intendedVar: data.intendedVar,
      offset: data.offset,
      reference: reference,
      resolution: spacing(data.offset, params.mode),
      results: results
    };
  }

  function offsetSweep(params) {
    var rows = [];
    var maxExp = params.mode === "fp32" ? 9 : 15;
    for (var e = 0; e <= maxExp; e += 1) {
      var p = {
        mode: params.mode,
        n: Math.min(params.n, 4000),
        offsetExp: e,
        order: params.order,
        spread: params.spread,
        spreadLog: params.spreadLog,
        trend: params.trend
      };
      var ev = evaluate(p);
      rows.push({
        inputLoss: ev.inputLoss,
        offsetExp: e,
        textbook: ev.results.textbook.error,
        welford: ev.results.welford.error,
        pairwise: ev.results.pairwise.error
      });
    }
    return rows;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var evalResult = evaluate(params);
    return {
      evaluation: evalResult,
      params: params,
      sweep: offsetSweep(params)
    };
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function logError(error) {
    if (!isFinite(error)) return 16;
    return clamp(Math.log10(Math.max(1e-16, error)), -16, 8);
  }

  function drawErrorPanel(ctx, result, box) {
    panelTitle(ctx, box, "Relative error by algorithm", "same stored data, different arithmetic path");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 66, h: box.h - 88 };
    drawAxis(ctx, plot);
    var yMin = -16;
    var yMax = 8;
    [-12, -8, -4, 0, 4].forEach(function (tick) {
      var y = plot.y + plot.h - (tick - yMin) / (yMax - yMin) * plot.h;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, "1e" + tick, plot.x - 7, y, "right");
    });
    var gap = plot.w / METHODS.length;
    METHODS.forEach(function (method, i) {
      var stats = result.evaluation.results[method.key];
      var x = plot.x + i * gap + gap * 0.23;
      var w = gap * 0.52;
      var log = logError(stats.error);
      var y = plot.y + plot.h - (log - yMin) / (yMax - yMin) * plot.h;
      var base = plot.y + plot.h - (yMin - yMin) / (yMax - yMin) * plot.h;
      ctx.fillStyle = method.color;
      ctx.fillRect(x, y, w, Math.max(2, base - y));
      if (stats.negative) {
        ctx.fillStyle = COLORS.text;
        ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("neg", x + w / 2, y - 9);
      }
      label(ctx, method.label, x + w / 2, plot.y + plot.h + 18, "center");
    });
    label(ctx, "log relative error", plot.x, plot.y + plot.h + 38, "left");
  }

  function drawCancellationPanel(ctx, result, box) {
    panelTitle(ctx, box, "The dangerous subtraction", "textbook variance subtracts two huge neighbors");
    var plot = { x: box.x + 42, y: box.y + 56, w: box.w - 56, h: box.h - 92 };
    var textbook = result.evaluation.results.textbook;
    var rows = [
      { label: "sum x^2", value: Math.abs(textbook.sumSq), color: COLORS.textbook },
      { label: "(sum x)^2/n", value: Math.abs(textbook.correction), color: COLORS.twoPass },
      { label: "true M2", value: Math.abs(result.evaluation.reference * (result.params.n - 1)), color: COLORS.reference }
    ];
    var logs = rows.map(function (row) {
      return Math.log10(Math.max(1e-300, row.value));
    });
    var min = Math.min.apply(null, logs) - 0.5;
    var max = Math.max.apply(null, logs) + 0.5;
    rows.forEach(function (row, i) {
      var y = plot.y + i * 52;
      var log = Math.log10(Math.max(1e-300, row.value));
      var width = (log - min) / Math.max(1e-9, max - min) * plot.w;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x, y, plot.w, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, width, 18);
      label(ctx, row.label, plot.x, y - 12, "left", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, "1e" + log.toFixed(1), plot.x + plot.w, y - 12, "right", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
    label(ctx, "cancellation ratio " + formatNumber(result.evaluation.cancellation, 2), plot.x, plot.y + 178, "left", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "larger means more leading digits must cancel", plot.x, plot.y + 200, "left");
  }

  function drawSweepPanel(ctx, result, box) {
    panelTitle(ctx, box, "Offset sweep", "same spread, bigger baseline");
    var plot = { x: box.x + 42, y: box.y + 56, w: box.w - 58, h: box.h - 90 };
    drawAxis(ctx, plot);
    var yMin = -16;
    var yMax = 8;
    function xScale(e) {
      var maxExp = result.params.mode === "fp32" ? 9 : 15;
      return plot.x + e / Math.max(1, maxExp) * plot.w;
    }
    function yScale(error) {
      var log = logError(error);
      return plot.y + plot.h - (log - yMin) / (yMax - yMin) * plot.h;
    }
    function drawLine(key, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      result.sweep.forEach(function (row, i) {
        var x = xScale(row.offsetExp);
        var y = yScale(row[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    [-12, -8, -4, 0, 4].forEach(function (tick) {
      var y = plot.y + plot.h - (tick - yMin) / (yMax - yMin) * plot.h;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    drawLine("textbook", COLORS.textbook, 2.4);
    drawLine("welford", COLORS.welford, 2.0);
    drawLine("pairwise", COLORS.pairwise, 1.8);
    drawLine("inputLoss", COLORS.reference, 1.4);
    var selectedX = xScale(result.params.offsetExp);
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(selectedX, plot.y);
    ctx.lineTo(selectedX, plot.y + plot.h);
    ctx.stroke();
    label(ctx, "red textbook, purple Welford, amber pairwise, black input loss", plot.x, plot.y + plot.h + 26, "left");
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Numerical ledger", "what the algorithm is fighting");
    var e = result.evaluation;
    var rows = [
      ["mode", result.params.mode],
      ["n", formatNumber(result.params.n, 0)],
      ["baseline", "1e" + result.params.offsetExp],
      ["spread", formatNumber(result.params.spread, 3)],
      ["spacing", formatNumber(e.resolution, 3)],
      ["spread / spacing", formatNumber(result.params.spread / Math.max(e.resolution, 1e-300), 2)],
      ["stored variance", formatNumber(e.reference, 4)],
      ["intended variance", formatNumber(e.intendedVar, 4)],
      ["input loss", formatPercent(e.inputLoss * 100, 2)],
      ["textbook var", formatNumber(e.results.textbook.variance, 4)]
    ];
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 64 };
    var rowGap = Math.min(23, Math.max(17, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.25)" : "transparent";
      ctx.fillRect(plot.x, y - 2, plot.w, rowGap);
      label(ctx, row[0], plot.x + 4, y + 12, "left");
      label(ctx, row[1], plot.x + plot.w - 4, y + 12, "right", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 1040 : 700;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    var margin = compact ? 22 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawErrorPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 250 });
      drawCancellationPanel(ctx, result, { x: margin, y: 306, w: panelW, h: 226 });
      drawSweepPanel(ctx, result, { x: margin, y: 562, w: panelW, h: 224 });
      drawLedgerPanel(ctx, result, { x: margin, y: 816, w: panelW, h: 194 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawErrorPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 318 });
      drawCancellationPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 318 });
      drawSweepPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 246 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 246 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      n: formatNumber(result.params.n, 0),
      offsetExp: "1e" + result.params.offsetExp,
      spreadLog: formatNumber(result.params.spread, 3),
      trend: formatPercent(result.params.trend * 100, 0)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("reference variance", formatNumber(result.evaluation.reference, 4)),
        metric("textbook error", formatPercent(result.evaluation.results.textbook.error * 100, 2)),
        metric("Welford error", formatPercent(result.evaluation.results.welford.error * 100, 4)),
        metric("pairwise error", formatPercent(result.evaluation.results.pairwise.error * 100, 4)),
        metric("input loss", formatPercent(result.evaluation.inputLoss * 100, 3)),
        metric("spacing", formatNumber(result.evaluation.resolution, 3))
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param], select[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-variance-lab]")).forEach(init);
  }

  var api = {
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.VarianceStabilityLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
