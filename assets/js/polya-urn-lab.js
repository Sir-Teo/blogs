(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    red: "#dc2626",
    blue: "#2563eb",
    purple: "#7c3aed",
    green: "#15803d",
    orange: "#ea580c",
    slate: "#475569",
    softRed: "#fee2e2",
    softBlue: "#dbeafe"
  };

  var DEFAULTS = {
    red: 2,
    blue: 2,
    copy: 1,
    draws: 80,
    paths: 1400,
    seed: 29
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return min;
    return clamp(Math.round(n), min, max);
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      red: clampInt(readNumber(raw, "red"), 1, 20),
      blue: clampInt(readNumber(raw, "blue"), 1, 20),
      copy: clampInt(readNumber(raw, "copy"), 1, 8),
      draws: clampInt(readNumber(raw, "draws"), 20, 220),
      paths: clampInt(readNumber(raw, "paths"), 200, 3200),
      seed: clampInt(readNumber(raw, "seed"), 1, 9999)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
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

  function hash32(value, seed) {
    var h = (value ^ seed) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function logGamma(z) {
    var p = [
      676.5203681218851,
      -1259.1392167224028,
      771.3234287776531,
      -176.6150291621406,
      12.507343278686905,
      -0.13857109526572012,
      9.984369578019572e-6,
      1.5056327351493116e-7
    ];
    if (z < 0.5) {
      return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    }
    z -= 1;
    var x = 0.9999999999998099;
    for (var i = 0; i < p.length; i += 1) x += p[i] / (z + i + 1);
    var t = z + p.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function logChoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
  }

  function logBeta(a, b) {
    return logGamma(a) + logGamma(b) - logGamma(a + b);
  }

  function betaBinomialPmf(n, a, b) {
    var out = [];
    var normalizer = logBeta(a, b);
    for (var k = 0; k <= n; k += 1) {
      out.push(Math.exp(logChoose(n, k) + logBeta(k + a, n - k + b) - normalizer));
    }
    return out;
  }

  function binomialPmf(n, p) {
    var out = [];
    var q = 1 - p;
    if (p <= 0) {
      for (var z = 0; z <= n; z += 1) out.push(z === 0 ? 1 : 0);
      return out;
    }
    if (p >= 1) {
      for (var o = 0; o <= n; o += 1) out.push(o === n ? 1 : 0);
      return out;
    }
    out[0] = Math.pow(q, n);
    for (var k = 0; k < n; k += 1) {
      out[k + 1] = out[k] * (n - k) / (k + 1) * p / q;
    }
    return out;
  }

  function simulatePath(params, rng) {
    var redMass = params.red;
    var blueMass = params.blue;
    var redCount = 0;
    var sequence = [];
    var share = [redMass / (redMass + blueMass)];
    var predictive = [redMass / (redMass + blueMass)];
    var redCounts = [0];

    for (var t = 0; t < params.draws; t += 1) {
      var pRed = redMass / (redMass + blueMass);
      var isRed = rng() < pRed;
      sequence.push(isRed ? "R" : "B");
      if (isRed) {
        redCount += 1;
        redMass += params.copy;
      } else {
        blueMass += params.copy;
      }
      predictive.push(redMass / (redMass + blueMass));
      share.push(redCount / (t + 1));
      redCounts.push(redCount);
    }
    return {
      sequence: sequence,
      share: share,
      predictive: predictive,
      redCounts: redCounts,
      finalRed: redCount,
      finalShare: redCount / params.draws
    };
  }

  function simulateEndpoint(params, rng, mode) {
    var red = 0;
    var redMass = params.red;
    var blueMass = params.blue;
    var fixed = params.red / (params.red + params.blue);
    for (var t = 0; t < params.draws; t += 1) {
      var p = mode === "iid" ? fixed : redMass / (redMass + blueMass);
      if (rng() < p) {
        red += 1;
        if (mode !== "iid") redMass += params.copy;
      } else if (mode !== "iid") {
        blueMass += params.copy;
      }
    }
    return red;
  }

  function simulateMany(params) {
    var polyaHist = new Array(params.draws + 1).fill(0);
    var iidHist = new Array(params.draws + 1).fill(0);
    var fan = [];
    var endpointSum = 0;
    var endpointSq = 0;
    var iidSum = 0;
    var iidSq = 0;
    var fanCount = Math.min(72, params.paths);

    for (var i = 0; i < params.paths; i += 1) {
      var seed = hash32((params.seed + 17) * 1000003 + i * 7919, params.seed);
      var polya = simulateEndpoint(params, makeRng(1 + seed % 9999), "polya");
      var iid = simulateEndpoint(params, makeRng(1 + hash32(seed, 0x51ed) % 9999), "iid");
      polyaHist[polya] += 1;
      iidHist[iid] += 1;
      endpointSum += polya;
      endpointSq += polya * polya;
      iidSum += iid;
      iidSq += iid * iid;
      if (i < fanCount) {
        fan.push(simulatePath(params, makeRng(1 + hash32(seed, 0x9abc) % 9999)));
      }
    }

    for (var k = 0; k <= params.draws; k += 1) {
      polyaHist[k] /= params.paths;
      iidHist[k] /= params.paths;
    }

    var mean = endpointSum / params.paths;
    var variance = endpointSq / params.paths - mean * mean;
    var iidMean = iidSum / params.paths;
    var iidVariance = iidSq / params.paths - iidMean * iidMean;

    return {
      polyaHist: polyaHist,
      iidHist: iidHist,
      fan: fan,
      empiricalMean: mean,
      empiricalVariance: variance,
      iidEmpiricalMean: iidMean,
      iidEmpiricalVariance: iidVariance
    };
  }

  function sequenceProbability(params, sequence, mode) {
    var redMass = params.red;
    var blueMass = params.blue;
    var p0 = params.red / (params.red + params.blue);
    var stick = 0.78;
    var previous = null;
    var probability = 1;

    for (var i = 0; i < sequence.length; i += 1) {
      var color = sequence[i];
      var pRed;
      if (mode === "sticky") {
        if (previous == null) pRed = p0;
        else if (previous === "R") pRed = stick + (1 - stick) * p0;
        else pRed = (1 - stick) * p0;
      } else {
        pRed = redMass / (redMass + blueMass);
      }
      probability *= color === "R" ? pRed : 1 - pRed;
      if (mode !== "sticky") {
        if (color === "R") redMass += params.copy;
        else blueMass += params.copy;
      }
      previous = color;
    }
    return probability;
  }

  function makeOrderAudit(params) {
    var len = Math.min(14, Math.max(8, Math.floor(params.draws / 5)));
    if (len % 2 === 1) len -= 1;
    var half = len / 2;
    var clustered = [];
    var alternating = [];
    for (var i = 0; i < half; i += 1) clustered.push("R");
    for (var b = 0; b < half; b += 1) clustered.push("B");
    for (var j = 0; j < half; j += 1) {
      alternating.push("R");
      alternating.push("B");
    }
    var polyaClustered = sequenceProbability(params, clustered, "polya");
    var polyaAlternating = sequenceProbability(params, alternating, "polya");
    var stickyClustered = sequenceProbability(params, clustered, "sticky");
    var stickyAlternating = sequenceProbability(params, alternating, "sticky");
    return {
      clustered: clustered.join(""),
      alternating: alternating.join(""),
      polyaClustered: polyaClustered,
      polyaAlternating: polyaAlternating,
      stickyClustered: stickyClustered,
      stickyAlternating: stickyAlternating,
      polyaRatio: polyaClustered / polyaAlternating,
      stickyRatio: stickyClustered / stickyAlternating
    };
  }

  function theoretical(params) {
    var a = params.red / params.copy;
    var b = params.blue / params.copy;
    var n = params.draws;
    var p = a / (a + b);
    var mean = n * p;
    var binomialVariance = n * p * (1 - p);
    var betaBinomialVariance = n * a * b * (a + b + n) /
      ((a + b) * (a + b) * (a + b + 1));
    return {
      a: a,
      b: b,
      p: p,
      mean: mean,
      binomialVariance: binomialVariance,
      betaBinomialVariance: betaBinomialVariance,
      overdispersion: betaBinomialVariance / Math.max(1e-12, binomialVariance),
      betaBinomial: betaBinomialPmf(n, a, b),
      binomial: binomialPmf(n, p)
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var theory = theoretical(params);
    var focus = simulatePath(params, makeRng(params.seed));
    var samples = simulateMany(params);
    var audit = makeOrderAudit(params);
    var meanError = Math.abs(samples.empiricalMean - theory.mean) / Math.max(1, params.draws);
    var varianceError = Math.abs(samples.empiricalVariance - theory.betaBinomialVariance) /
      Math.max(1, theory.betaBinomialVariance);
    var pmfSum = theory.betaBinomial.reduce(function (sum, value) { return sum + value; }, 0);
    var checks = {
      finite: Number.isFinite(samples.empiricalVariance) && Number.isFinite(audit.polyaRatio),
      pmfNormalizes: Math.abs(pmfSum - 1) < 1e-8,
      exchangeable: Math.abs(audit.polyaRatio - 1) < 1e-10,
      simulationClose: meanError < 0.035 && varianceError < 0.32,
      histogramsNormalize: Math.abs(samples.polyaHist.reduce(function (s, v) { return s + v; }, 0) - 1) < 1e-9
    };
    return {
      params: params,
      theory: theory,
      focus: focus,
      samples: samples,
      audit: audit,
      checks: checks
    };
  }

  function pct(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function fixed(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return value.toExponential(2);
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="polya-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function syncOutputs(root, result) {
    var p = result.params;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      red: p.red,
      blue: p.blue,
      copy: p.copy,
      draws: p.draws,
      paths: p.paths,
      seed: p.seed
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (values[key] != null) output.textContent = values[key];
    });
  }

  function renderMetrics(root, result) {
    var target = root.querySelector("[data-metrics]");
    if (!target) return;
    var p = result.params;
    var finalShare = result.focus.finalShare;
    var auditText = Object.keys(result.checks).every(function (key) { return result.checks[key]; }) ? "passed" : "check";
    target.innerHTML = [
      metric("Focus path final red", pct(finalShare, 0)),
      metric("Endpoint variance", fixed(result.samples.empiricalVariance, 1)),
      metric("Binomial variance", fixed(result.theory.binomialVariance, 1)),
      metric("Overdispersion", fixed(result.theory.overdispersion, 2) + "x"),
      metric("Order ratio", fixed(result.audit.polyaRatio, 3)),
      metric("Audit", auditText)
    ].join("");
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "Equivalent beta prior: Beta(" + fixed(p.red / p.copy, 2) + ", " +
        fixed(p.blue / p.copy, 2) + "). Same-count histories have equal Polya probability.";
    }
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 680 ? 1060 : 760;
    var ratio = Math.min(2, global.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssWidth * ratio) || canvas.height !== Math.round(cssHeight * ratio)) {
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      canvas.style.height = cssHeight + "px";
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, rect.x + 14, rect.y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(subtitle, rect.x + 14, rect.y + 42);
    }
  }

  function drawLine(ctx, rows, x, y, color, width, alpha) {
    if (!rows.length) return;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width == null ? 1 : width;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      if (index === 0) ctx.moveTo(x(row, index), y(row, index));
      else ctx.lineTo(x(row, index), y(row, index));
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawAxes(ctx, plot) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h - plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawPathPanel(ctx, rect, result) {
    panel(ctx, rect, "One reinforced path", "prediction moves because the urn composition moves");
    var plot = { x: rect.x + 42, y: rect.y + 58, w: rect.w - 62, h: rect.h - 92 };
    drawAxes(ctx, plot);
    var n = result.params.draws;
    var x = function (_, i) { return plot.x + plot.w * i / n; };
    var y = function (value) { return plot.y + plot.h - clamp(value, 0, 1) * plot.h; };
    drawLine(ctx, result.focus.predictive, x, y, COLORS.purple, 2.4, 1);
    drawLine(ctx, result.focus.share, x, y, COLORS.slate, 1.8, 0.82);
    ctx.fillStyle = COLORS.purple;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("predictive p(red)", plot.x, rect.y + 48);
    ctx.fillStyle = COLORS.slate;
    ctx.fillText("observed red share", plot.x + 118, rect.y + 48);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("draw", plot.x + plot.w - 28, plot.y + plot.h + 24);
    ctx.fillText("0", plot.x - 18, plot.y + plot.h + 4);
    ctx.fillText("1", plot.x - 18, plot.y + 4);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("first 24: " + result.focus.sequence.slice(0, 24).join(""), rect.x + 14, rect.y + rect.h - 16);
  }

  function drawHistogramPanel(ctx, rect, result) {
    panel(ctx, rect, "Endpoint distribution", "reinforcement widens the count distribution");
    var plot = { x: rect.x + 44, y: rect.y + 58, w: rect.w - 64, h: rect.h - 92 };
    drawAxes(ctx, plot);
    var n = result.params.draws;
    var maxP = 0;
    var i;
    for (i = 0; i <= n; i += 1) {
      maxP = Math.max(maxP, result.samples.polyaHist[i], result.theory.betaBinomial[i], result.theory.binomial[i]);
    }
    maxP *= 1.14;
    var barW = Math.max(1, plot.w / (n + 1));
    for (i = 0; i <= n; i += 1) {
      var x0 = plot.x + plot.w * i / (n + 1);
      var hp = plot.h * result.samples.polyaHist[i] / maxP;
      var hb = plot.h * result.theory.binomial[i] / maxP;
      ctx.fillStyle = COLORS.softBlue;
      ctx.fillRect(x0, plot.y + plot.h - hb, Math.max(1, barW - 1), hb);
      ctx.fillStyle = COLORS.purple;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(x0, plot.y + plot.h - hp, Math.max(1, barW - 1), hp);
      ctx.globalAlpha = 1;
    }
    drawLine(ctx, result.theory.betaBinomial, function (_, k) {
      return plot.x + plot.w * (k + 0.5) / (n + 1);
    }, function (value) {
      return plot.y + plot.h - plot.h * value / maxP;
    }, COLORS.orange, 2.1, 1);
    ctx.fillStyle = COLORS.purple;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("simulated Polya", plot.x, rect.y + 48);
    ctx.fillStyle = COLORS.blue;
    ctx.fillText("iid binomial", plot.x + 102, rect.y + 48);
    ctx.fillStyle = COLORS.orange;
    ctx.fillText("beta-binomial", plot.x + 184, rect.y + 48);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("red count after " + n + " draws", plot.x + plot.w - 128, plot.y + plot.h + 24);
  }

  function drawFanPanel(ctx, rect, result) {
    panel(ctx, rect, "Many possible futures", "each path is a martingale that can settle elsewhere");
    var plot = { x: rect.x + 42, y: rect.y + 58, w: rect.w - 62, h: rect.h - 86 };
    drawAxes(ctx, plot);
    var n = result.params.draws;
    result.samples.fan.forEach(function (path) {
      var color = path.finalShare >= 0.5 ? COLORS.red : COLORS.blue;
      drawLine(ctx, path.predictive, function (_, i) {
        return plot.x + plot.w * i / n;
      }, function (value) {
        return plot.y + plot.h - clamp(value, 0, 1) * plot.h;
      }, color, 0.9, 0.18);
    });
    var final = result.focus.predictive[result.focus.predictive.length - 1];
    ctx.fillStyle = final >= 0.5 ? COLORS.red : COLORS.blue;
    ctx.beginPath();
    ctx.arc(plot.x + plot.w, plot.y + plot.h - final * plot.h, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("72 simulated predictive paths", plot.x, rect.y + 48);
    ctx.fillText("draw", plot.x + plot.w - 28, plot.y + plot.h + 24);
  }

  function drawAuditPanel(ctx, rect, result) {
    panel(ctx, rect, "Order audit", "same counts, same Polya probability");
    var x = rect.x + 16;
    var y = rect.y + 60;
    var rows = [
      { label: "clustered", seq: result.audit.clustered, polya: result.audit.polyaClustered, sticky: result.audit.stickyClustered },
      { label: "alternating", seq: result.audit.alternating, polya: result.audit.polyaAlternating, sticky: result.audit.stickyAlternating }
    ];
    var maxP = Math.max(rows[0].polya, rows[1].polya, rows[0].sticky, rows[1].sticky);
    rows.forEach(function (row, index) {
      var yy = y + index * 58;
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(row.label, x, yy);
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(row.seq, x + 82, yy);
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(x + 82, yy + 14, rect.w - 120, 9);
      ctx.fillStyle = COLORS.purple;
      ctx.fillRect(x + 82, yy + 14, (rect.w - 120) * row.polya / maxP, 9);
      ctx.fillStyle = COLORS.orange;
      ctx.fillRect(x + 82, yy + 28, (rect.w - 120) * row.sticky / maxP, 9);
    });
    ctx.fillStyle = COLORS.purple;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("Polya ratio: " + fixed(result.audit.polyaRatio, 3), x, rect.y + rect.h - 38);
    ctx.fillStyle = COLORS.orange;
    ctx.fillText("sticky-order ratio: " + fixed(result.audit.stickyRatio, 1), x, rect.y + rect.h - 18);
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    var width = frame.width;
    var height = frame.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);

    var pad = 14;
    if (width < 680) {
      drawPathPanel(ctx, { x: pad, y: pad, w: width - pad * 2, h: 260 }, result);
      drawHistogramPanel(ctx, { x: pad, y: 290, w: width - pad * 2, h: 260 }, result);
      drawFanPanel(ctx, { x: pad, y: 566, w: width - pad * 2, h: 236 }, result);
      drawAuditPanel(ctx, { x: pad, y: 818, w: width - pad * 2, h: height - 832 }, result);
    } else {
      var colW = (width - pad * 3) / 2;
      drawPathPanel(ctx, { x: pad, y: pad, w: colW, h: 335 }, result);
      drawHistogramPanel(ctx, { x: pad * 2 + colW, y: pad, w: colW, h: 335 }, result);
      drawFanPanel(ctx, { x: pad, y: 364, w: colW, h: height - 378 }, result);
      drawAuditPanel(ctx, { x: pad * 2 + colW, y: 364, w: colW, h: height - 378 }, result);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__polyaResult = result;
  }

  function init(root) {
    if (!root || root.__polyaReady) return;
    root.__polyaReady = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    var resizeTimer = null;
    global.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(root); }, 120);
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-polya-urn-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    betaBinomialPmf: betaBinomialPmf,
    binomialPmf: binomialPmf,
    sequenceProbability: sequenceProbability,
    makeOrderAudit: makeOrderAudit,
    evaluate: evaluate,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PolyaUrnLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
