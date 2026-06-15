(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    exact: "#0f766e",
    ais: "#2563eb",
    naive: "#dc2626",
    path: "#7c3aed",
    sample: "#f59e0b",
    dark: "#0f172a"
  };

  var DEFAULTS = {
    separation: 30,
    bridges: 48,
    moves: 3,
    runs: 900,
    step: 55,
    schedule: "cosine",
    seed: 19
  };

  var TARGET_SCALE = 1.05;
  var Y_SCALE = 0.72;
  var BASE_SD = 2.75;
  var QUAD_N = 2048;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var schedule = String(raw.schedule || DEFAULTS.schedule);
    if (schedule !== "linear" && schedule !== "cosine" && schedule !== "late") schedule = DEFAULTS.schedule;
    return {
      separation: clamp(Math.round(readNumber(raw, "separation")), 12, 32),
      bridges: clamp(Math.round(readNumber(raw, "bridges")), 4, 96),
      moves: clamp(Math.round(readNumber(raw, "moves")), 0, 8),
      runs: clamp(Math.round(readNumber(raw, "runs") / 100) * 100, 200, 2200),
      step: clamp(Math.round(readNumber(raw, "step")), 15, 140),
      schedule: schedule,
      seed: clamp(Math.round(readNumber(raw, "seed")), 1, 9999)
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

  function normalSample(rng) {
    var u1 = Math.max(1e-12, rng());
    var u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function logBase(x, y) {
    return -0.5 * (x * x + y * y) / (BASE_SD * BASE_SD) - Math.log(2 * Math.PI * BASE_SD * BASE_SD);
  }

  function logTarget(x, y, sep) {
    var q = x * x - sep * sep;
    return -q * q / (2 * TARGET_SCALE * TARGET_SCALE) - y * y / (2 * Y_SCALE * Y_SCALE);
  }

  function energy(x, y, sep) {
    return -logTarget(x, y, sep);
  }

  function logBridge(x, y, beta, sep) {
    return (1 - beta) * logBase(x, y) + beta * logTarget(x, y, sep);
  }

  function makeBetas(count, schedule) {
    var betas = [];
    for (var i = 0; i <= count; i += 1) {
      var t = i / count;
      if (schedule === "cosine") {
        betas.push(0.5 - 0.5 * Math.cos(Math.PI * t));
      } else if (schedule === "late") {
        betas.push(1 - Math.pow(1 - t, 2.4));
      } else {
        betas.push(t);
      }
    }
    return betas;
  }

  function logSumExp(values) {
    var max = -Infinity;
    for (var i = 0; i < values.length; i += 1) if (values[i] > max) max = values[i];
    if (!Number.isFinite(max)) return max;
    var sum = 0;
    for (var j = 0; j < values.length; j += 1) sum += Math.exp(values[j] - max);
    return max + Math.log(sum);
  }

  function logMeanExp(values) {
    return logSumExp(values) - Math.log(values.length);
  }

  function essFromLogWeights(values) {
    var lse = logSumExp(values);
    var shifted = values.map(function (v) { return v - lse; });
    var sumSq = 0;
    for (var i = 0; i < shifted.length; i += 1) sumSq += Math.exp(2 * shifted[i]);
    return 1 / sumSq;
  }

  function exactLogZ(sep) {
    var limit = Math.max(8, sep + 5);
    var h = 2 * limit / QUAD_N;
    var sum = 0;
    for (var i = 0; i <= QUAD_N; i += 1) {
      var x = -limit + i * h;
      var q = x * x - sep * sep;
      var fx = Math.exp(-q * q / (2 * TARGET_SCALE * TARGET_SCALE));
      var weight = i === 0 || i === QUAD_N ? 1 : (i % 2 === 0 ? 2 : 4);
      sum += weight * fx;
    }
    var xIntegral = sum * h / 3;
    return Math.log(xIntegral) + 0.5 * Math.log(2 * Math.PI * Y_SCALE * Y_SCALE);
  }

  function metropolisMove(state, beta, sep, step, rng) {
    var x = state.x + step * normalSample(rng);
    var y = state.y + step * normalSample(rng);
    var next = logBridge(x, y, beta, sep);
    if (Math.log(Math.max(1e-12, rng())) < next - state.logp) {
      state.x = x;
      state.y = y;
      state.logp = next;
      return 1;
    }
    return 0;
  }

  function weightedModeBalance(logWeights, states) {
    var lse = logSumExp(logWeights);
    var right = 0;
    for (var i = 0; i < logWeights.length; i += 1) {
      if (states[i].x > 0) right += Math.exp(logWeights[i] - lse);
    }
    return right;
  }

  function summarize(values) {
    var mean = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    var variance = 0;
    for (var i = 0; i < values.length; i += 1) variance += Math.pow(values[i] - mean, 2);
    variance /= Math.max(1, values.length - 1);
    return { mean: mean, sd: Math.sqrt(variance) };
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var sep = params.separation / 10;
    var step = params.step / 100;
    var rng = makeRng(params.seed);
    var exact = exactLogZ(sep);
    var states = [];
    var logWeights = [];
    var naiveWeights = [];
    var logWeightSnapshots = [];
    var acceptCount = 0;
    var moveCount = 0;
    for (var i = 0; i < params.runs; i += 1) {
      var x = BASE_SD * normalSample(rng);
      var y = BASE_SD * normalSample(rng);
      var base = logBase(x, y);
      var target = logTarget(x, y, sep);
      states.push({ x: x, y: y, logp: base });
      logWeights.push(0);
      naiveWeights.push(target - base);
    }

    var betas = makeBetas(params.bridges, params.schedule);
    var path = [{ beta: 0, ess: params.runs, estimate: logMeanExp(logWeights), accept: 1 }];
    for (var j = 1; j < betas.length; j += 1) {
      var previous = betas[j - 1];
      var beta = betas[j];
      var delta = beta - previous;
      for (var r = 0; r < params.runs; r += 1) {
        var state = states[r];
        logWeights[r] += delta * (logTarget(state.x, state.y, sep) - logBase(state.x, state.y));
        state.logp = logBridge(state.x, state.y, beta, sep);
        for (var m = 0; m < params.moves; m += 1) {
          acceptCount += metropolisMove(state, beta, sep, step, rng);
          moveCount += 1;
        }
      }
      path.push({
        beta: beta,
        ess: essFromLogWeights(logWeights),
        estimate: logMeanExp(logWeights),
        accept: moveCount ? acceptCount / moveCount : 1
      });
      if (j === 1 || j === Math.floor(params.bridges / 2) || j === params.bridges) {
        logWeightSnapshots.push({ beta: beta, values: logWeights.slice() });
      }
    }

    var aisEstimate = logMeanExp(logWeights);
    var naiveEstimate = logMeanExp(naiveWeights);
    var aisStats = summarize(logWeights);
    var naiveStats = summarize(naiveWeights);
    var aisEss = essFromLogWeights(logWeights);
    var naiveEss = essFromLogWeights(naiveWeights);
    var checks = {
      finite: [exact, aisEstimate, naiveEstimate, aisEss, naiveEss].every(Number.isFinite),
      essBounded: aisEss > 0 && aisEss <= params.runs + 1e-8 && naiveEss > 0 && naiveEss <= params.runs + 1e-8,
      quadratureStable: Math.abs(exact - exactLogZ(sep)) < 1e-12,
      pathLength: path.length === params.bridges + 1,
      acceptanceBounded: moveCount === 0 || (acceptCount / moveCount >= 0 && acceptCount / moveCount <= 1)
    };
    return {
      params: params,
      sep: sep,
      step: step,
      exactLogZ: exact,
      states: states,
      logWeights: logWeights,
      naiveWeights: naiveWeights,
      path: path,
      betas: betas,
      snapshots: logWeightSnapshots,
      summary: {
        aisLogZ: aisEstimate,
        naiveLogZ: naiveEstimate,
        aisError: aisEstimate - exact,
        naiveError: naiveEstimate - exact,
        aisEss: aisEss,
        naiveEss: naiveEss,
        aisLogWeightSd: aisStats.sd,
        naiveLogWeightSd: naiveStats.sd,
        acceptRate: moveCount ? acceptCount / moveCount : 1,
        weightedRightMode: weightedModeBalance(logWeights, states)
      },
      checks: checks
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(digits == null ? 1 : digits);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    return formatNumber(100 * value, digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="ais-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function syncOutputs(root, result) {
    var p = result.params;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      separation: formatNumber(result.sep, 1),
      bridges: p.bridges,
      moves: p.moves,
      runs: p.runs,
      step: formatNumber(result.step, 2),
      schedule: p.schedule,
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
    var audit = Object.keys(result.checks).every(function (key) { return result.checks[key]; }) ? "passed" : "check";
    target.innerHTML = [
      metric("Exact log Z", formatNumber(result.exactLogZ, 3)),
      metric("AIS log Z", formatNumber(result.summary.aisLogZ, 3)),
      metric("Naive log Z", formatNumber(result.summary.naiveLogZ, 3)),
      metric("AIS ESS", formatNumber(result.summary.aisEss, 0) + "/" + result.params.runs),
      metric("Accept", formatPercent(result.summary.acceptRate, 0)),
      metric("Audit", audit)
    ].join("");
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 560 ? 1160 : 780;
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

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var trimmed = text;
    while (trimmed.length > 4 && ctx.measureText(trimmed + "...").width > maxWidth) trimmed = trimmed.slice(0, -1);
    return trimmed.trim() + "...";
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
      ctx.fillText(fitText(ctx, subtitle, rect.w - 28), rect.x + 14, rect.y + 42);
    }
  }

  function axes(ctx, plot) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
  }

  function drawLandscape(ctx, rect, result) {
    panel(ctx, rect, "Two-well target", "AIS walks from a broad base into isolated modes");
    var plot = { x: rect.x + 38, y: rect.y + 58, w: rect.w - 58, h: rect.h - 88 };
    var limit = Math.max(3.2, result.sep + 1.4);
    var nx = 52;
    var ny = 42;
    var maxU = 9;
    for (var i = 0; i < nx; i += 1) {
      for (var j = 0; j < ny; j += 1) {
        var x = -limit + 2 * limit * i / (nx - 1);
        var y = -2.6 + 5.2 * j / (ny - 1);
        var u = Math.min(maxU, energy(x, y, result.sep));
        var shade = Math.round(255 - 120 * (1 - u / maxU));
        ctx.fillStyle = "rgb(" + shade + "," + Math.round(shade + 5) + "," + Math.round(shade + 10) + ")";
        ctx.fillRect(plot.x + i * plot.w / nx, plot.y + (ny - 1 - j) * plot.h / ny, Math.ceil(plot.w / nx) + 1, Math.ceil(plot.h / ny) + 1);
      }
    }
    function sx(x) { return plot.x + (x + limit) / (2 * limit) * plot.w; }
    function sy(y) { return plot.y + plot.h * (1 - (y + 2.6) / 5.2); }
    var lse = logSumExp(result.logWeights);
    for (var r = 0; r < result.states.length; r += 1) {
      var state = result.states[r];
      if (state.x < -limit || state.x > limit || state.y < -2.6 || state.y > 2.6) continue;
      var weight = Math.exp(result.logWeights[r] - lse);
      var radius = clamp(1.2 + 90 * Math.sqrt(weight), 1.2, 8);
      ctx.fillStyle = state.x >= 0 ? "rgba(37, 99, 235, 0.52)" : "rgba(124, 58, 237, 0.52)";
      ctx.beginPath();
      ctx.arc(sx(state.x), sy(state.y), radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("x", plot.x + plot.w - 8, plot.y + plot.h + 22);
  }

  function drawBars(ctx, rect, result) {
    panel(ctx, rect, "Log normalizer", "average weights, then take the log");
    var plot = { x: rect.x + 48, y: rect.y + 66, w: rect.w - 70, h: rect.h - 104 };
    var values = [
      { name: "exact", value: result.exactLogZ, color: COLORS.exact },
      { name: "AIS", value: result.summary.aisLogZ, color: COLORS.ais },
      { name: "naive", value: result.summary.naiveLogZ, color: COLORS.naive }
    ];
    var minV = Math.min.apply(null, values.map(function (v) { return v.value; })) - 0.35;
    var maxV = Math.max.apply(null, values.map(function (v) { return v.value; })) + 0.35;
    if (maxV - minV < 1) {
      maxV += 0.4;
      minV -= 0.4;
    }
    axes(ctx, plot);
    values.forEach(function (row, i) {
      var bw = plot.w / 5;
      var x = plot.x + plot.w * (0.17 + 0.29 * i);
      var y = plot.y + plot.h * (1 - (row.value - minV) / (maxV - minV));
      var zero = plot.y + plot.h * (1 - (0 - minV) / (maxV - minV));
      zero = clamp(zero, plot.y, plot.y + plot.h);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, Math.min(y, zero), bw, Math.max(2, Math.abs(zero - y)));
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.fillText(row.name, x, plot.y + plot.h + 22);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(formatNumber(row.value, 2), x, Math.min(y, zero) - 7);
    });
  }

  function drawPath(ctx, rect, result) {
    panel(ctx, rect, "Bridge path", "effective sample size as beta increases");
    var plot = { x: rect.x + 46, y: rect.y + 62, w: rect.w - 66, h: rect.h - 98 };
    axes(ctx, plot);
    var estimates = result.path.map(function (row) { return row.estimate; }).concat([result.exactLogZ]);
    var low = Math.min.apply(null, estimates) - 0.3;
    var high = Math.max.apply(null, estimates) + 0.7;
    function sx(row) { return plot.x + row.beta * plot.w; }
    function syEss(row) { return plot.y + plot.h * (1 - row.ess / result.params.runs); }
    function syLogZ(row) {
      return plot.y + plot.h * (1 - (row.estimate - low) / (high - low));
    }
    ctx.strokeStyle = COLORS.ais;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    result.path.forEach(function (row, i) {
      if (i === 0) ctx.moveTo(sx(row), syEss(row));
      else ctx.lineTo(sx(row), syEss(row));
    });
    ctx.stroke();
    ctx.strokeStyle = COLORS.sample;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    result.path.forEach(function (row, i) {
      if (i === 0) ctx.moveTo(sx(row), syLogZ(row));
      else ctx.lineTo(sx(row), syLogZ(row));
    });
    ctx.stroke();
    ctx.fillStyle = COLORS.ais;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText("ESS", plot.x + 6, plot.y + 16);
    ctx.fillStyle = COLORS.sample;
    ctx.fillText("log mean weight", plot.x + 48, plot.y + 16);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("beta", plot.x + plot.w - 24, plot.y + plot.h + 22);
  }

  function drawWeights(ctx, rect, result) {
    panel(ctx, rect, "Weight distribution", "rare high weights can own the average");
    var plot = { x: rect.x + 44, y: rect.y + 62, w: rect.w - 64, h: rect.h - 98 };
    var all = result.logWeights.concat(result.naiveWeights);
    var min = Math.min.apply(null, all);
    var max = Math.max.apply(null, all);
    if (max - min < 1e-6) max = min + 1;
    var bins = 42;
    function counts(values) {
      var out = Array.from({ length: bins }, function () { return 0; });
      values.forEach(function (value) {
        var b = Math.floor((value - min) / (max - min) * bins);
        if (b >= 0 && b < bins) out[b] += 1;
      });
      return out;
    }
    var a = counts(result.logWeights);
    var n = counts(result.naiveWeights);
    var maxCount = Math.max.apply(null, a.concat(n));
    axes(ctx, plot);
    for (var i = 0; i < bins; i += 1) {
      var x = plot.x + i * plot.w / bins;
      var bw = Math.max(1, plot.w / bins - 1);
      var yA = plot.y + plot.h * (1 - a[i] / maxCount);
      var yN = plot.y + plot.h * (1 - n[i] / maxCount);
      ctx.fillStyle = "rgba(37, 99, 235, 0.42)";
      ctx.fillRect(x, yA, bw, plot.y + plot.h - yA);
      ctx.fillStyle = "rgba(220, 38, 38, 0.25)";
      ctx.fillRect(x, yN, bw, plot.y + plot.h - yN);
    }
    function sxValue(value) { return plot.x + (value - min) / (max - min) * plot.w; }
    ctx.strokeStyle = COLORS.exact;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(sxValue(result.exactLogZ), plot.y);
    ctx.lineTo(sxValue(result.exactLogZ), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("log w", plot.x + plot.w - 34, plot.y + plot.h + 22);
  }

  function drawLegend(ctx, x, y) {
    var items = [
      ["exact", COLORS.exact],
      ["AIS", COLORS.ais],
      ["naive IS", COLORS.naive],
      ["path", COLORS.sample]
    ];
    ctx.font = "12px system-ui, sans-serif";
    items.forEach(function (item, i) {
      var ox = x + i * 88;
      ctx.fillStyle = item[1];
      ctx.beginPath();
      ctx.arc(ox, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(item[0], ox + 8, y);
    });
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
    if (width < 560) {
      drawLandscape(ctx, { x: pad, y: pad, w: width - pad * 2, h: 286 }, result);
      drawBars(ctx, { x: pad, y: 316, w: width - pad * 2, h: 250 }, result);
      drawPath(ctx, { x: pad, y: 582, w: width - pad * 2, h: 250 }, result);
      drawWeights(ctx, { x: pad, y: 848, w: width - pad * 2, h: height - 862 }, result);
      drawLegend(ctx, pad + 18, height - 18);
    } else {
      var colW = (width - pad * 3) / 2;
      drawLandscape(ctx, { x: pad, y: pad, w: colW, h: 370 }, result);
      drawBars(ctx, { x: pad * 2 + colW, y: pad, w: colW, h: 370 }, result);
      drawPath(ctx, { x: pad, y: 402, w: colW, h: height - 416 }, result);
      drawWeights(ctx, { x: pad * 2 + colW, y: 402, w: colW, h: height - 416 }, result);
      drawLegend(ctx, pad + 18, height - 18);
    }
  }

  function render(root) {
    var result = simulate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__aisResult = result;
  }

  function init(root) {
    if (!root || root.__aisReady) return;
    root.__aisReady = true;
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
    global.document.querySelectorAll("[data-ais-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    exactLogZ: exactLogZ,
    simulate: simulate,
    makeBetas: makeBetas,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AnnealedImportanceLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
