(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    potential: "#334155",
    noise: "#2563eb",
    sample: "#94a3b8",
    escaped: "#0f766e",
    theory: "#b45309",
    hazard: "#be123c",
    saddle: "#7c3aed"
  };

  var DEFAULTS = {
    barrier: 42,
    horizon: 150,
    noise: 18,
    paths: 220,
    seed: 43
  };

  var DT = 0.012;
  var TRACE_STEPS = 150;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
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

  function normalGenerator(rand) {
    var spare = null;
    return function () {
      if (spare != null) {
        var z = spare;
        spare = null;
        return z;
      }
      var u = Math.max(1e-12, rand());
      var v = Math.max(1e-12, rand());
      var r = Math.sqrt(-2 * Math.log(u));
      var theta = 2 * Math.PI * v;
      spare = r * Math.sin(theta);
      return r * Math.cos(theta);
    };
  }

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      barrier: clamp(number(raw, "barrier"), 18, 110) / 100,
      horizon: clamp(Math.round(number(raw, "horizon")), 40, 260),
      noise: clamp(number(raw, "noise"), 7, 32) / 100,
      paths: clamp(Math.round(number(raw, "paths")), 60, 420),
      seed: clamp(Math.round(number(raw, "seed")), 1, 9999)
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (digits != null) return value.toFixed(digits);
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(0) + "%";
  }

  function metric(label, value) {
    return '<div class="kramers-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function potential(params, x) {
    var y = x * x - 1;
    return params.barrier * y * y;
  }

  function gradPotential(params, x) {
    return 4 * params.barrier * x * (x * x - 1);
  }

  function kramersMean(params) {
    var a = params.barrier;
    var prefactor = 2 * Math.PI / Math.sqrt(8 * a * 4 * a);
    return prefactor * Math.exp(a / params.noise);
  }

  function mfptIntegral(params) {
    var left = -2.45;
    var start = -1;
    var saddle = 0;
    var steps = 900;
    var dx = (saddle - left) / steps;
    var inner = new Array(steps + 1);
    var sum = 0;
    for (var i = 0; i <= steps; i += 1) {
      var x = left + i * dx;
      var w = Math.exp(-potential(params, x) / params.noise);
      if (i > 0) {
        var prevX = left + (i - 1) * dx;
        var prevW = Math.exp(-potential(params, prevX) / params.noise);
        sum += 0.5 * dx * (prevW + w);
      }
      inner[i] = sum;
    }
    var startIndex = clamp(Math.round((start - left) / dx), 0, steps);
    var outer = 0;
    for (i = startIndex + 1; i <= steps; i += 1) {
      var y0 = left + (i - 1) * dx;
      var y1 = left + i * dx;
      var f0 = Math.exp(potential(params, y0) / params.noise) * inner[i - 1];
      var f1 = Math.exp(potential(params, y1) / params.noise) * inner[i];
      outer += 0.5 * dx * (f0 + f1);
    }
    return outer / params.noise;
  }

  function simulatePath(params, seed, keepTrace) {
    var rand = rng(seed);
    var normal = normalGenerator(rand);
    var sigma = Math.sqrt(2 * params.noise * DT);
    var steps = Math.ceil(params.horizon / DT);
    var trace = keepTrace ? new Array(TRACE_STEPS + 1) : null;
    var nextTrace = 0;
    var x = -1;
    var t = 0;

    function fillTrace(untilT, value) {
      if (!trace) return;
      while (nextTrace <= TRACE_STEPS && nextTrace / TRACE_STEPS * params.horizon <= untilT + 1e-12) {
        trace[nextTrace] = value;
        nextTrace += 1;
      }
    }

    fillTrace(0, x);
    for (var i = 0; i < steps; i += 1) {
      var drift = -gradPotential(params, x);
      x += drift * DT + sigma * normal();
      x = clamp(x, -2.25, 1.35);
      t = (i + 1) * DT;
      fillTrace(t, x);
      if (x >= 0) {
        fillTrace(params.horizon, x);
        return {
          censored: false,
          time: t,
          trace: trace
        };
      }
    }
    fillTrace(params.horizon, x);
    return {
      censored: true,
      time: params.horizon,
      trace: trace
    };
  }

  function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    var idx = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
    var lo = Math.floor(idx);
    var hi = Math.ceil(idx);
    var frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  }

  function histogram(times, horizon, bins) {
    var out = new Array(bins);
    for (var b = 0; b < bins; b += 1) out[b] = 0;
    times.forEach(function (time) {
      var idx = clamp(Math.floor(time / horizon * bins), 0, bins - 1);
      out[idx] += 1;
    });
    return out;
  }

  function survivalCurve(records, horizon) {
    var out = [];
    for (var i = 0; i <= 60; i += 1) {
      var t = horizon * i / 60;
      var alive = 0;
      records.forEach(function (record) {
        if (record.censored || record.time > t) alive += 1;
      });
      out.push(alive / records.length);
    }
    return out;
  }

  function simulateEnsemble(params, paths, salt, keepTraces) {
    var records = [];
    var escaped = [];
    var traces = [];
    for (var i = 0; i < paths; i += 1) {
      var keep = keepTraces && traces.length < 12;
      var seed = hash32(params.seed * 1009 + i * 9176 + (salt || 0), 0x9e3779b9);
      var record = simulatePath(params, seed, keep);
      records.push(record);
      if (!record.censored) escaped.push(record.time);
      if (record.trace) traces.push(record.trace);
    }
    escaped.sort(function (a, b) { return a - b; });
    var mean = escaped.length ? escaped.reduce(function (sum, value) { return sum + value; }, 0) / escaped.length : NaN;
    var med = quantile(escaped, 0.5);
    return {
      censored: records.length - escaped.length,
      escaped: escaped,
      escapeRate: escaped.length / records.length,
      histogram: histogram(escaped, params.horizon, 22),
      mean: mean,
      median: med,
      q80: quantile(escaped, 0.8),
      records: records,
      survival: survivalCurve(records, params.horizon),
      traces: traces
    };
  }

  function arrheniusScan(params) {
    var factors = [1.42, 1.2, 1.0, 0.86, 0.74];
    var points = [];
    var scanPaths = clamp(Math.round(params.paths * 0.44), 50, 130);
    factors.forEach(function (factor, i) {
      var p = Object.assign({}, params, {
        noise: clamp(params.noise * factor, 0.075, 0.34)
      });
      p.horizon = clamp(Math.round(Math.max(params.horizon, Math.min(260, kramersMean(p) * 4.2))), 40, 260);
      var ensemble = simulateEnsemble(p, scanPaths, 7000 + i * 811, false);
      var useful = ensemble.escapeRate >= 0.45 && Number.isFinite(ensemble.mean);
      points.push({
        censored: !useful,
        escapeRate: ensemble.escapeRate,
        invNoise: 1 / p.noise,
        logMean: useful ? Math.log(ensemble.mean) : Math.log(Math.max(1, p.horizon)),
        mfptMean: mfptIntegral(p),
        noise: p.noise,
        simMean: ensemble.mean,
        kramersMean: kramersMean(p),
        theoryLog: Math.log(kramersMean(p))
      });
    });
    return points.sort(function (a, b) { return a.invNoise - b.invNoise; });
  }

  function linearFit(points) {
    var usable = points.filter(function (p) { return !p.censored && Number.isFinite(p.logMean); });
    if (usable.length < 2) return { intercept: NaN, slope: NaN, usable: usable.length };
    var mx = usable.reduce(function (s, p) { return s + p.invNoise; }, 0) / usable.length;
    var my = usable.reduce(function (s, p) { return s + p.logMean; }, 0) / usable.length;
    var num = 0;
    var den = 0;
    usable.forEach(function (p) {
      num += (p.invNoise - mx) * (p.logMean - my);
      den += (p.invNoise - mx) * (p.invNoise - mx);
    });
    return {
      intercept: my - num / Math.max(1e-9, den) * mx,
      slope: num / Math.max(1e-9, den),
      usable: usable.length
    };
  }

  function compute(raw) {
    var params = cleanParams(raw);
    var ensemble = simulateEnsemble(params, params.paths, 0, true);
    var kramers = kramersMean(params);
    var mfpt = mfptIntegral(params);
    var scan = arrheniusScan(params);
    var fit = linearFit(scan);
    var ratio = ensemble.mean / mfpt;
    var finite = Number.isFinite(ensemble.mean) && Number.isFinite(mfpt) && Number.isFinite(kramers) && Number.isFinite(ratio);
    var auditPassed = finite && ensemble.escapeRate >= 0.58 && fit.usable >= 3 && ratio > 0.45 && ratio < 2.2;
    return {
      audit: {
        finite: finite,
        fitUsable: fit.usable,
        passed: auditPassed,
        ratio: ratio
      },
      ensemble: ensemble,
      fit: fit,
      kramers: kramers,
      mfpt: mfpt,
      params: params,
      scan: scan,
      theory: kramers
    };
  }

  function renderMetrics(target, result) {
    if (!target) return;
    target.innerHTML = [
      metric("Barrier", formatNumber(result.params.barrier, 2)),
      metric("Noise", formatNumber(result.params.noise, 2)),
      metric("MFPT integral", formatNumber(result.mfpt)),
      metric("Sim mean", formatNumber(result.ensemble.mean)),
      metric("Escaped", formatPercent(result.ensemble.escapeRate)),
      metric("Audit", result.audit.passed ? "passed" : "censored")
    ].join("");
  }

  function setCanvasSize(canvas) {
    var parent = canvas.parentElement || canvas;
    var cssWidth = Math.max(300, Math.floor(parent.clientWidth - 2));
    var height = cssWidth < 560 ? 1050 : 720;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);
    return { ctx: ctx, width: cssWidth, height: height };
  }

  function drawPanel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, box.x + 14, box.y + 22);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 40);
    }
  }

  function extent(values, pad) {
    var min = Infinity;
    var max = -Infinity;
    values.forEach(function (value) {
      if (!Number.isFinite(value)) return;
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
    if (min === max) max = min + 1;
    var extra = (max - min) * (pad == null ? 0.1 : pad);
    return { min: min - extra, max: max + extra };
  }

  function scale(domain, range) {
    var span = domain.max - domain.min || 1;
    return function (value) {
      return range.min + (value - domain.min) / span * (range.max - range.min);
    };
  }

  function drawGrid(ctx, plot, xTicks, yTicks) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= xTicks; i += 1) {
      var x = plot.x + plot.w * i / xTicks;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    for (var j = 0; j <= yTicks; j += 1) {
      var y = plot.y + plot.h * j / yTicks;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawLine(ctx, data, sx, sy, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    data.forEach(function (point, i) {
      var x = sx(point[0]);
      var y = sy(point[1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPotential(ctx, box, result) {
    drawPanel(ctx, box, "energy landscape", "left well, saddle, and thermal scale");
    var plot = { x: box.x + 44, y: box.y + 62, w: box.w - 66, h: box.h - 96 };
    var xs = [];
    var vals = [];
    for (var i = 0; i <= 140; i += 1) {
      var x = -1.65 + i / 140 * 3.05;
      xs.push(x);
      vals.push(potential(result.params, x));
    }
    var sy = scale({ min: 0, max: Math.max.apply(null, vals) * 1.05 }, { min: plot.y + plot.h, max: plot.y });
    var sx = scale({ min: -1.65, max: 1.4 }, { min: plot.x, max: plot.x + plot.w });
    drawGrid(ctx, plot, 4, 4);
    var curve = xs.map(function (x, idx) { return [x, vals[idx]]; });
    drawLine(ctx, curve, sx, sy, COLORS.potential, 2.4);
    ctx.strokeStyle = COLORS.noise;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(-1.55), sy(result.params.noise));
    ctx.lineTo(sx(1.3), sy(result.params.noise));
    ctx.stroke();
    ctx.setLineDash([]);

    [
      { x: -1, y: 0, color: COLORS.escaped, label: "well" },
      { x: 0, y: result.params.barrier, color: COLORS.saddle, label: "saddle" }
    ].forEach(function (p) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(p.label, sx(p.x) + 8, sy(p.y) - 6);
    });

    ctx.fillStyle = COLORS.noise;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("epsilon", sx(1.08), sy(result.params.noise) - 6);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("U(x)", plot.x - 34, plot.y + 12);
  }

  function drawTraces(ctx, box, result) {
    drawPanel(ctx, box, "sample paths", "escape is a first passage event");
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 62, h: box.h - 88 };
    var sx = scale({ min: 0, max: result.params.horizon }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: -1.45, max: 0.45 }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);
    ctx.strokeStyle = COLORS.saddle;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(plot.x, sy(0));
    ctx.lineTo(plot.x + plot.w, sy(0));
    ctx.stroke();
    ctx.setLineDash([]);
    result.ensemble.traces.forEach(function (trace, i) {
      var escaped = trace[trace.length - 1] >= 0;
      var color = escaped ? COLORS.escaped : COLORS.sample;
      ctx.globalAlpha = escaped ? 0.76 : 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      trace.forEach(function (x, g) {
        var t = result.params.horizon * g / TRACE_STEPS;
        var px = sx(t);
        var py = sy(x);
        if (g === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (i === 0) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText("barrier", plot.x + 6, sy(0) - 6);
      }
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("time", plot.x + plot.w - 24, box.y + box.h - 18);
    ctx.fillText("x", plot.x - 22, plot.y + 12);
  }

  function drawHistogram(ctx, box, result) {
    drawPanel(ctx, box, "first-passage clock", "many quiet waits, then a crossing");
    var plot = { x: box.x + 46, y: box.y + 58, w: box.w - 66, h: box.h - 92 };
    var maxCount = Math.max.apply(null, result.ensemble.histogram.concat([1]));
    var sx = scale({ min: 0, max: result.params.horizon }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: maxCount * 1.15 }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);
    var binW = plot.w / result.ensemble.histogram.length;
    result.ensemble.histogram.forEach(function (count, i) {
      var x = plot.x + i * binW;
      var y = sy(count);
      ctx.fillStyle = "rgba(15, 118, 110, 0.72)";
      ctx.fillRect(x + 1, y, Math.max(1, binW - 2), plot.y + plot.h - y);
    });
    var density = [];
    for (var k = 0; k <= 100; k += 1) {
      var t = result.params.horizon * k / 100;
      var expected = result.ensemble.escaped.length * (result.params.horizon / result.ensemble.histogram.length) *
        Math.exp(-t / result.mfpt) / Math.max(1e-9, result.mfpt);
      density.push([t, expected]);
    }
    drawLine(ctx, density, sx, sy, COLORS.theory, 2.2);
    var mx = sx(Math.min(result.params.horizon, result.mfpt));
    ctx.strokeStyle = COLORS.theory;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(mx, plot.y);
    ctx.lineTo(mx, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("time to x=0", plot.x, box.y + box.h - 17);
  }

  function drawArrhenius(ctx, box, result) {
    drawPanel(ctx, box, "Arrhenius check", "log time is nearly linear in 1/noise");
    var plot = { x: box.x + 50, y: box.y + 58, w: box.w - 72, h: box.h - 92 };
    var xs = result.scan.map(function (p) { return p.invNoise; });
    var ys = [];
    result.scan.forEach(function (p) {
      ys.push(p.logMean, p.theoryLog);
    });
    var sx = scale(extent(xs, 0.08), { min: plot.x, max: plot.x + plot.w });
    var sy = scale(extent(ys, 0.15), { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);
    drawLine(ctx, result.scan.map(function (p) { return [p.invNoise, p.theoryLog]; }), sx, sy, COLORS.theory, 2);
    result.scan.forEach(function (p) {
      ctx.fillStyle = p.censored ? COLORS.sample : COLORS.noise;
      ctx.strokeStyle = p.censored ? COLORS.sample : COLORS.noise;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(p.invNoise), sy(p.logMean), p.censored ? 4 : 5, 0, 2 * Math.PI);
      if (p.censored) ctx.stroke();
      else ctx.fill();
    });
    if (Number.isFinite(result.fit.slope)) {
      var domain = extent(xs, 0);
      drawLine(ctx, [
        [domain.min, result.fit.intercept + result.fit.slope * domain.min],
        [domain.max, result.fit.intercept + result.fit.slope * domain.max]
      ], sx, sy, COLORS.hazard, 1.7, [5, 4]);
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("1 / epsilon", plot.x + plot.w - 58, box.y + box.h - 17);
    ctx.fillText("log mean", plot.x - 42, plot.y + 12);
  }

  function drawSurvival(ctx, box, result) {
    drawPanel(ctx, box, "survival curve", "the clock becomes almost memoryless");
    var plot = { x: box.x + 46, y: box.y + 58, w: box.w - 66, h: box.h - 92 };
    var sx = scale({ min: 0, max: result.params.horizon }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: 1 }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);
    var sim = result.ensemble.survival.map(function (s, i) {
      return [result.params.horizon * i / 60, s];
    });
    var theory = [];
    for (var i = 0; i <= 80; i += 1) {
      var t = result.params.horizon * i / 80;
      theory.push([t, Math.exp(-t / result.mfpt)]);
    }
    drawLine(ctx, theory, sx, sy, COLORS.theory, 2);
    drawLine(ctx, sim, sx, sy, COLORS.escaped, 2.2);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("fraction not yet escaped", plot.x, box.y + box.h - 17);
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, frame.width, frame.height);
    var pad = 14;
    if (frame.width < 560) {
      drawPotential(ctx, { x: pad, y: pad, w: frame.width - pad * 2, h: 242 }, result);
      drawTraces(ctx, { x: pad, y: 272, w: frame.width - pad * 2, h: 242 }, result);
      drawHistogram(ctx, { x: pad, y: 530, w: frame.width - pad * 2, h: 242 }, result);
      drawSurvival(ctx, { x: pad, y: 788, w: frame.width - pad * 2, h: 242 }, result);
    } else {
      var col = (frame.width - pad * 3) / 2;
      drawPotential(ctx, { x: pad, y: pad, w: col, h: 324 }, result);
      drawTraces(ctx, { x: pad * 2 + col, y: pad, w: col, h: 324 }, result);
      drawHistogram(ctx, { x: pad, y: 360, w: col, h: 330 }, result);
      drawArrhenius(ctx, { x: pad * 2 + col, y: 360, w: col, h: 330 }, result);
    }
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function writeOutputs(root, result) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      var value = result.params[key];
      if (key === "barrier" || key === "noise") output.textContent = formatNumber(value, 2);
      else output.textContent = String(value);
    });
  }

  function mount(root) {
    var canvas = root.querySelector("[data-canvas]");
    var metrics = root.querySelector("[data-metrics]");
    var lastResult = null;
    function update() {
      lastResult = compute(readParams(root));
      writeOutputs(root, lastResult);
      renderMetrics(metrics, lastResult);
      draw(canvas, lastResult);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });
    global.addEventListener("resize", function () {
      if (lastResult) draw(canvas, lastResult);
    });
    update();
  }

  function init() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-kramers-lab]").forEach(mount);
  }

  var api = {
    cleanParams: cleanParams,
    compute: compute,
    kramersMean: kramersMean,
    mfptIntegral: mfptIntegral,
    simulateEnsemble: simulateEnsemble
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.KramersEscapeLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
