(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    grid: "#edf2f7",
    exact: "#0f766e",
    estimate: "#2563eb",
    error: "#be123c",
    marker: "#7c3aed",
    desired: "#b45309",
    fill: "#dbeafe",
    white: "#ffffff"
  };

  var SCENARIOS = {
    latency: {
      label: "bursty latency",
      description: "stationary log-normal body with rare spikes"
    },
    drift: {
      label: "slow drift",
      description: "mean creeps upward while the prefix quantile follows"
    },
    shift: {
      label: "regime shift",
      description: "one distribution, then another; not a sliding window"
    }
  };

  var DEFAULTS = {
    percentile: 95,
    samples: 4200,
    scenario: "latency",
    seed: 17
  };

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32((index + 1) | 0, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 1, seed));
    var u2 = uniform(index * 2 + 2, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    return {
      percentile: clamp(Math.round(finite(raw.percentile, DEFAULTS.percentile)), 50, 99),
      samples: clamp(Math.round(finite(raw.samples, DEFAULTS.samples)), 400, 6000),
      scenario: scenario,
      seed: clamp(Math.round(finite(raw.seed, DEFAULTS.seed)), 1, 99)
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 10) return value.toFixed(places);
    return value.toFixed(Math.max(2, places));
  }

  function p2Quantile(values, p) {
    if (!values.length) return NaN;
    var index = Math.round((values.length - 1) * p);
    return values[clamp(index, 0, values.length - 1)];
  }

  function insertSorted(values, value) {
    var lo = 0;
    var hi = values.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (values[mid] <= value) lo = mid + 1;
      else hi = mid;
    }
    values.splice(lo, 0, value);
  }

  function rankLessEqual(sorted, value) {
    var lo = 0;
    var hi = sorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (sorted[mid] <= value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function streamValue(params, index) {
    var n = params.samples;
    var z = normal(index + 31, params.seed);
    if (params.scenario === "drift") {
      var drift = 0.018 * index;
      var wave = 5.5 * Math.sin(index / 130);
      return Math.max(0.5, 24 + drift + wave + 3.3 * z);
    }
    if (params.scenario === "shift") {
      var shifted = index > Math.floor(0.58 * n);
      var mean = shifted ? 78 : 31;
      var spread = shifted ? 8.5 : 4.5;
      return Math.max(0.5, mean + spread * z);
    }
    var body = 28 * Math.exp(0.45 * z - 0.5 * 0.45 * 0.45);
    var burst = uniform(index * 7 + 19, params.seed ^ 0xbadc0de) < 0.018 ? 170 * uniform(index * 11 + 5, params.seed) : 0;
    return 18 + body + burst;
  }

  function makeValues(params) {
    var values = [];
    for (var i = 0; i < params.samples; i += 1) values.push(streamValue(params, i));
    return values;
  }

  function P2Estimator(p) {
    this.p = p;
    this.count = 0;
    this.initial = [];
    this.q = null;
    this.n = null;
    this.ns = null;
    this.dn = [0, p / 2, p, (1 + p) / 2, 1];
    this.parabolicMoves = 0;
    this.linearMoves = 0;
  }

  P2Estimator.prototype.add = function (value) {
    if (this.count < 5) {
      this.initial.push(value);
      this.count += 1;
      if (this.count === 5) {
        this.initial.sort(function (a, b) { return a - b; });
        this.q = this.initial.slice();
        this.n = [1, 2, 3, 4, 5];
        this.ns = [1, 1 + 2 * this.p, 1 + 4 * this.p, 3 + 2 * this.p, 5];
      }
      return this.estimate();
    }

    this.count += 1;
    var k;
    if (value < this.q[0]) {
      this.q[0] = value;
      k = 0;
    } else if (value < this.q[1]) {
      k = 0;
    } else if (value < this.q[2]) {
      k = 1;
    } else if (value < this.q[3]) {
      k = 2;
    } else if (value <= this.q[4]) {
      k = 3;
    } else {
      this.q[4] = value;
      k = 3;
    }

    for (var i = k + 1; i < 5; i += 1) this.n[i] += 1;
    for (var j = 0; j < 5; j += 1) this.ns[j] += this.dn[j];

    for (var m = 1; m <= 3; m += 1) {
      var delta = this.ns[m] - this.n[m];
      var step = delta >= 1 ? 1 : delta <= -1 ? -1 : 0;
      if (!step) continue;
      if (step > 0 && this.n[m + 1] - this.n[m] <= 1) continue;
      if (step < 0 && this.n[m] - this.n[m - 1] <= 1) continue;

      var prediction = this.parabolic(m, step);
      if (this.q[m - 1] < prediction && prediction < this.q[m + 1]) {
        this.q[m] = prediction;
        this.parabolicMoves += 1;
      } else {
        this.q[m] = this.linear(m, step);
        this.linearMoves += 1;
      }
      this.n[m] += step;
    }

    return this.q[2];
  };

  P2Estimator.prototype.parabolic = function (i, d) {
    var q = this.q;
    var n = this.n;
    var leftGap = n[i] - n[i - 1];
    var rightGap = n[i + 1] - n[i];
    var span = n[i + 1] - n[i - 1];
    return q[i] + d / span * (
      (leftGap + d) * (q[i + 1] - q[i]) / rightGap +
      (rightGap - d) * (q[i] - q[i - 1]) / leftGap
    );
  };

  P2Estimator.prototype.linear = function (i, d) {
    return this.q[i] + d * (this.q[i + d] - this.q[i]) / (this.n[i + d] - this.n[i]);
  };

  P2Estimator.prototype.estimate = function () {
    if (this.count === 0) return NaN;
    if (this.count < 5) {
      var sorted = this.initial.slice().sort(function (a, b) { return a - b; });
      return p2Quantile(sorted, this.p);
    }
    return this.q[2];
  };

  P2Estimator.prototype.snapshot = function () {
    return {
      count: this.count,
      dn: this.dn.slice(),
      linearMoves: this.linearMoves,
      n: this.n ? this.n.slice() : [],
      ns: this.ns ? this.ns.slice() : [],
      parabolicMoves: this.parabolicMoves,
      q: this.q ? this.q.slice() : []
    };
  };

  function checkpointSet(samples) {
    var set = {};
    var points = Math.min(140, Math.max(50, Math.floor(samples / 24)));
    for (var i = 0; i < points; i += 1) {
      var t = i / (points - 1);
      var index = Math.max(1, Math.round(1 + t * (samples - 1)));
      set[index] = true;
    }
    set[5] = true;
    set[samples] = true;
    return set;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var p = params.percentile / 100;
    var values = makeValues(params);
    var estimator = new P2Estimator(p);
    var sortedPrefix = [];
    var checkpoints = checkpointSet(params.samples);
    var history = [];

    values.forEach(function (value, index) {
      var n = index + 1;
      insertSorted(sortedPrefix, value);
      var estimate = estimator.add(value);
      if (checkpoints[n]) {
        var exact = p2Quantile(sortedPrefix, p);
        history.push({
          error: estimate - exact,
          estimate: estimate,
          exact: exact,
          n: n
        });
      }
    });

    var exactFinal = p2Quantile(sortedPrefix, p);
    var estimateFinal = estimator.estimate();
    var rank = rankLessEqual(sortedPrefix, estimateFinal);
    var rankFraction = rank / sortedPrefix.length;
    var absErrors = history.filter(function (row) { return row.n >= 5; }).map(function (row) {
      return Math.abs(row.error);
    });
    var meanAbsError = absErrors.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, absErrors.length);
    var snapshot = estimator.snapshot();
    var audit = auditResult(params, p, sortedPrefix, exactFinal, estimateFinal, rankFraction, snapshot, history);

    return {
      audit: audit,
      exact: exactFinal,
      estimate: estimateFinal,
      history: history,
      meanAbsError: meanAbsError,
      p: p,
      params: params,
      rank: rank,
      rankError: Math.abs(rankFraction - p),
      rankFraction: rankFraction,
      snapshot: snapshot,
      sorted: sortedPrefix,
      values: values
    };
  }

  function auditResult(params, p, sorted, exact, estimate, rankFraction, snapshot, history) {
    var markersOrdered = snapshot.q.length === 5 && snapshot.q.every(function (value, index) {
      return index === 0 || value >= snapshot.q[index - 1];
    });
    var positionsOrdered = snapshot.n.length === 5 && snapshot.n.every(function (value, index) {
      return Number.isInteger(value) && (index === 0 || value > snapshot.n[index - 1]);
    });
    var desiredOrdered = snapshot.ns.length === 5 && snapshot.ns.every(function (value, index) {
      return Number.isFinite(value) && (index === 0 || value >= snapshot.ns[index - 1]);
    });
    var inRange = estimate >= sorted[0] && estimate <= sorted[sorted.length - 1];
    var rankReasonable = Math.abs(rankFraction - p) <= 0.12;
    var finiteHistory = history.length > 10 && history.every(function (row) {
      return Number.isFinite(row.exact) && Number.isFinite(row.estimate) && Number.isFinite(row.error);
    });
    return {
      desiredOrdered: desiredOrdered,
      finiteHistory: finiteHistory,
      inRange: inRange,
      markersOrdered: markersOrdered,
      positionsOrdered: positionsOrdered,
      rankReasonable: rankReasonable,
      sampleCount: sorted.length === params.samples
    };
  }

  function auditP2QuantileLab() {
    Object.keys(SCENARIOS).forEach(function (scenario) {
      [50, 90, 95].forEach(function (percentile) {
        var result = evaluate({ scenario: scenario, percentile: percentile, samples: 2600, seed: 23 });
        assert(result.audit.sampleCount, scenario + " sample count failed");
        assert(result.audit.markersOrdered, scenario + " marker heights not ordered");
        assert(result.audit.positionsOrdered, scenario + " marker positions not ordered");
        assert(result.audit.desiredOrdered, scenario + " desired positions not ordered");
        assert(result.audit.inRange, scenario + " estimate left observed range");
        assert(result.audit.finiteHistory, scenario + " history is not finite");
        assert(result.audit.rankReasonable, scenario + " rank error too large");
      });
    });
    var defaultResult = evaluate(DEFAULTS);
    assert(defaultResult.snapshot.q.length === 5, "default run has five markers");
    assert(defaultResult.snapshot.parabolicMoves > defaultResult.snapshot.linearMoves, "default run should usually use more parabolic than linear moves");
    return {
      defaultAbsError: Number(Math.abs(defaultResult.estimate - defaultResult.exact).toFixed(4)),
      defaultRankError: Number(defaultResult.rankError.toFixed(4)),
      ok: true,
      scenarios: Object.keys(SCENARIOS).length
    };
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function setupCanvas(canvas) {
    var ratio = global.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.width || 980));
    var height = Math.max(620, Math.round(rect.height || canvas.height || 720));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.faint;
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

  function scale(value, lo, hi, a, b) {
    if (hi === lo) return (a + b) / 2;
    return a + (value - lo) / (hi - lo) * (b - a);
  }

  function bounds(values, pad) {
    var lo = Infinity;
    var hi = -Infinity;
    values.forEach(function (value) {
      if (Number.isFinite(value)) {
        lo = Math.min(lo, value);
        hi = Math.max(hi, value);
      }
    });
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
    var extra = (hi - lo || Math.max(1, Math.abs(hi))) * (pad == null ? 0.08 : pad);
    return { lo: lo - extra, hi: hi + extra };
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

  function drawEstimateTrace(ctx, box, result) {
    panel(ctx, box, "Prefix quantile", "exact order statistic versus five-marker estimate");
    var pad = { l: 44, r: 18, t: 58, b: 34 };
    var x = box.x + pad.l;
    var y = box.y + pad.t;
    var w = box.w - pad.l - pad.r;
    var h = box.h - pad.t - pad.b;
    var valueBounds = bounds(result.history.reduce(function (out, row) {
      out.push(row.exact, row.estimate);
      return out;
    }, []), 0.08);
    drawAxes(ctx, x, y, w, h);
    drawSeries(ctx, result.history, function (row) { return row.n; }, function (row) { return row.exact; }, result.params.samples, valueBounds, x, y, w, h, COLORS.exact);
    drawSeries(ctx, result.history, function (row) { return row.n; }, function (row) { return row.estimate; }, result.params.samples, valueBounds, x, y, w, h, COLORS.estimate);
    label(ctx, "exact", x + 8, y + 15, COLORS.exact);
    label(ctx, "P2", x + 72, y + 15, COLORS.estimate);
    axisLabel(ctx, formatNumber(valueBounds.hi, 1), x - 8, y + 4, "right");
    axisLabel(ctx, formatNumber(valueBounds.lo, 1), x - 8, y + h, "right");
    axisLabel(ctx, "n=" + result.params.samples, x + w, y + h + 22, "right");
  }

  function drawSeries(ctx, rows, xAccessor, yAccessor, maxN, valueBounds, x, y, w, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var px = scale(xAccessor(row), 1, maxN, x, x + w);
      var py = scale(yAccessor(row), valueBounds.lo, valueBounds.hi, y + h, y);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  function drawDistribution(ctx, box, result) {
    panel(ctx, box, "Final distribution", "where the two final answers land");
    var pad = { l: 44, r: 18, t: 58, b: 34 };
    var x = box.x + pad.l;
    var y = box.y + pad.t;
    var w = box.w - pad.l - pad.r;
    var h = box.h - pad.t - pad.b;
    var sorted = result.sorted;
    var lo = sorted[0];
    var hi = sorted[sorted.length - 1];
    var bins = 34;
    var counts = [];
    for (var i = 0; i < bins; i += 1) counts.push(0);
    sorted.forEach(function (value) {
      var b = clamp(Math.floor(scale(value, lo, hi, 0, bins)), 0, bins - 1);
      counts[b] += 1;
    });
    var maxCount = Math.max.apply(null, counts);
    drawAxes(ctx, x, y, w, h);
    counts.forEach(function (count, index) {
      var bw = w / bins;
      var bh = scale(count, 0, maxCount, 0, h);
      ctx.fillStyle = COLORS.fill;
      ctx.fillRect(x + index * bw + 1, y + h - bh, Math.max(1, bw - 2), bh);
    });
    drawVertical(ctx, x, y, w, h, lo, hi, result.exact, COLORS.exact, "exact");
    drawVertical(ctx, x, y, w, h, lo, hi, result.estimate, COLORS.estimate, "P2");
    axisLabel(ctx, formatNumber(lo, 1), x, y + h + 22, "left");
    axisLabel(ctx, formatNumber(hi, 1), x + w, y + h + 22, "right");
  }

  function drawVertical(ctx, x, y, w, h, lo, hi, value, color, text) {
    var px = scale(value, lo, hi, x, x + w);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + h);
    ctx.stroke();
    label(ctx, text, clamp(px + 4, x + 4, x + w - 34), y + 14, color);
  }

  function drawMarkers(ctx, box, result) {
    panel(ctx, box, "Marker ledger", "actual positions n_i and desired positions n_i*");
    var q = result.snapshot.q;
    var n = result.snapshot.n;
    var ns = result.snapshot.ns;
    var valueBounds = bounds(q, 0.16);
    var x0 = box.x + 44;
    var x1 = box.x + box.w - 22;
    var y0 = box.y + 62;
    var y1 = box.y + box.h - 30;
    drawAxes(ctx, x0, y0, x1 - x0, y1 - y0);
    q.forEach(function (value, i) {
      var x = scale(n[i], 1, result.params.samples, x0, x1);
      var xd = scale(ns[i], 1, result.params.samples, x0, x1);
      var y = scale(value, valueBounds.lo, valueBounds.hi, y1, y0);
      ctx.strokeStyle = COLORS.desired;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xd, y - 13);
      ctx.lineTo(xd, y + 13);
      ctx.stroke();
      ctx.fillStyle = i === 2 ? COLORS.estimate : COLORS.marker;
      ctx.beginPath();
      ctx.arc(x, y, i === 2 ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.text;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("q" + (i + 1), x + 7, y + 4);
    });
    label(ctx, "dot = actual, tick = desired", x0 + 4, y0 + 16, COLORS.muted);
    axisLabel(ctx, "min", x0, y1 + 20, "left");
    axisLabel(ctx, "n", x1, y1 + 20, "right");
  }

  function drawError(ctx, box, result) {
    panel(ctx, box, "Approximation error", "estimate minus exact prefix quantile");
    var pad = { l: 44, r: 18, t: 58, b: 34 };
    var x = box.x + pad.l;
    var y = box.y + pad.t;
    var w = box.w - pad.l - pad.r;
    var h = box.h - pad.t - pad.b;
    var b = bounds(result.history.map(function (row) { return row.error; }), 0.14);
    b.lo = Math.min(b.lo, 0);
    b.hi = Math.max(b.hi, 0);
    drawAxes(ctx, x, y, w, h);
    var zero = scale(0, b.lo, b.hi, y + h, y);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(x, zero);
    ctx.lineTo(x + w, zero);
    ctx.stroke();
    drawSeries(ctx, result.history, function (row) { return row.n; }, function (row) { return row.error; }, result.params.samples, b, x, y, w, h, COLORS.error);
    label(ctx, "mean |error| " + formatNumber(result.meanAbsError, 2), x + 8, y + 15, COLORS.error);
    axisLabel(ctx, formatNumber(b.hi, 1), x - 8, y + 4, "right");
    axisLabel(ctx, formatNumber(b.lo, 1), x - 8, y + h, "right");
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
    var gap = 14;
    var margin = 14;
    if (width < 700) {
      var panelH = (height - margin * 2 - gap * 3) / 4;
      return [
        { x: margin, y: margin, w: width - margin * 2, h: panelH },
        { x: margin, y: margin + (panelH + gap), w: width - margin * 2, h: panelH },
        { x: margin, y: margin + 2 * (panelH + gap), w: width - margin * 2, h: panelH },
        { x: margin, y: margin + 3 * (panelH + gap), w: width - margin * 2, h: panelH }
      ];
    }
    var halfW = (width - margin * 2 - gap) / 2;
    var halfH = (height - margin * 2 - gap) / 2;
    return [
      { x: margin, y: margin, w: halfW, h: halfH },
      { x: margin + halfW + gap, y: margin, w: halfW, h: halfH },
      { x: margin, y: margin + halfH + gap, w: halfW, h: halfH },
      { x: margin + halfW + gap, y: margin + halfH + gap, w: halfW, h: halfH }
    ];
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    ctx.clearRect(0, 0, setup.width, setup.height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, setup.width, setup.height);
    var boxes = layout(setup.width, setup.height);
    drawEstimateTrace(ctx, boxes[0], result);
    drawDistribution(ctx, boxes[1], result);
    drawMarkers(ctx, boxes[2], result);
    drawError(ctx, boxes[3], result);
  }

  function metric(labelText, value, tone) {
    return '<div class="p2-lab__metric p2-lab__metric--' + (tone || "plain") + '"><span>' + labelText + "</span><strong>" + value + "</strong></div>";
  }

  function updateMetrics(root, result) {
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    holder.innerHTML = [
      metric("exact p" + result.params.percentile, formatNumber(result.exact, 2)),
      metric("P2 estimate", formatNumber(result.estimate, 2)),
      metric("abs error", formatNumber(Math.abs(result.estimate - result.exact), 2)),
      metric("rank of estimate", (100 * result.rankFraction).toFixed(2) + "%"),
      metric("marker moves", result.snapshot.parabolicMoves + " / " + result.snapshot.linearMoves),
      metric("audit", result.audit.rankReasonable ? "pass" : "watch", result.audit.rankReasonable ? "good" : "warn")
    ].join("");
  }

  function readParams(root, previous) {
    var raw = Object.assign({}, previous || DEFAULTS);
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function updateOutputs(root, params) {
    var display = {
      percentile: "p" + params.percentile,
      samples: formatNumber(params.samples, 0),
      scenario: SCENARIOS[params.scenario].label,
      seed: String(params.seed)
    };
    Object.keys(display).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = display[key];
      });
    });
  }

  function render(root, state) {
    var params = readParams(root, state && state.params);
    var result = evaluate(params);
    var canvas = root.querySelector("[data-canvas]");
    updateOutputs(root, params);
    updateMetrics(root, result);
    if (canvas) draw(result, canvas);
    root.__p2QuantileState = { params: params, result: result };
  }

  function init(root) {
    if (!root || root.__p2QuantileReady) return;
    root.__p2QuantileReady = true;
    var rerender = function () { render(root, root.__p2QuantileState); };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", rerender);
      input.addEventListener("change", rerender);
    });
    render(root, null);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      P2Estimator: P2Estimator,
      auditP2QuantileLab: auditP2QuantileLab,
      evaluate: evaluate,
      p2Quantile: p2Quantile
    };
  }

  if (global.document) {
    global.document.querySelectorAll("[data-p2-quantile-lab]").forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
