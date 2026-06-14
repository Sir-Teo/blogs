(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    grid: "#edf2f7",
    target: "#0f766e",
    rejected: "#cbd5df",
    chainA: "#2563eb",
    chainB: "#b45309",
    chainC: "#7c3aed",
    chainD: "#0f766e",
    chainE: "#be123c",
    chainF: "#64748b",
    bad: "#be123c",
    ok: "#0f766e",
    warning: "#d97706"
  };

  var CHAIN_COLORS = [
    COLORS.chainA,
    COLORS.chainB,
    COLORS.chainC,
    COLORS.chainD,
    COLORS.chainE,
    COLORS.chainF
  ];

  var DEFAULTS = {
    burn: 30,
    chains: 4,
    correlation: 40,
    gap: 38,
    proposal: 35,
    seed: 29,
    steps: 2200
  };

  var SIGMA_X = 0.72;
  var SIGMA_Y = 0.52;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      burn: snap(raw.burn, DEFAULTS.burn, 0, 70, 5) / 100,
      chains: snap(raw.chains, DEFAULTS.chains, 2, 6, 1),
      correlation: snap(raw.correlation, DEFAULTS.correlation, 0, 90, 1) / 100,
      gap: snap(raw.gap, DEFAULTS.gap, 0, 60, 1) / 10,
      proposal: snap(raw.proposal, DEFAULTS.proposal, 5, 320, 5) / 100,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1),
      steps: snap(raw.steps, DEFAULTS.steps, 600, 6000, 100)
    };
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function logAdd(a, b) {
    var m = Math.max(a, b);
    return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
  }

  function logComponent(x, y, meanX, corr) {
    var dx = (x - meanX) / SIGMA_X;
    var dy = y / SIGMA_Y;
    var denom = 2 * (1 - corr * corr);
    return -(dx * dx - 2 * corr * dx * dy + dy * dy) / denom;
  }

  function logTarget(point, params) {
    var gap = params.gap;
    var corr = params.correlation;
    var left = logComponent(point.x, point.y, -gap, corr);
    var right = logComponent(point.x, point.y, gap, -corr);
    return logAdd(left, right) - Math.LN2;
  }

  function startingPoint(index, params, rand) {
    var gap = params.gap;
    var spread = Math.max(1.2, gap + 1.35);
    var presets = [
      { x: -spread, y: -1.35 },
      { x: spread, y: 1.35 },
      { x: -spread, y: 1.35 },
      { x: spread, y: -1.35 },
      { x: 0, y: 2.1 },
      { x: 0, y: -2.1 }
    ];
    var base = presets[index % presets.length];
    return {
      x: base.x + 0.12 * normal(rand),
      y: base.y + 0.12 * normal(rand)
    };
  }

  function simulateChain(params, index) {
    var rand = makeRng(params.seed * 1009 + index * 9176 + params.steps * 13);
    var current = startingPoint(index, params, rand);
    var currentLog = logTarget(current, params);
    var points = [];
    var kept = [];
    var accepted = 0;
    var acceptedAfterBurn = 0;
    var burnIndex = Math.floor(params.steps * params.burn);
    var modeSwitches = 0;
    var lastMode = current.x >= 0 ? 1 : 0;

    points.push({
      accepted: true,
      logp: currentLog,
      mode: lastMode,
      step: 0,
      x: current.x,
      y: current.y
    });

    for (var step = 1; step <= params.steps; step += 1) {
      var proposal = {
        x: current.x + params.proposal * normal(rand),
        y: current.y + params.proposal * normal(rand)
      };
      var proposalLog = logTarget(proposal, params);
      var accept = Math.log(Math.max(1e-12, rand())) < proposalLog - currentLog;
      if (accept) {
        current = proposal;
        currentLog = proposalLog;
        accepted += 1;
        if (step > burnIndex) acceptedAfterBurn += 1;
      }
      var mode = current.x >= 0 ? 1 : 0;
      if (step > burnIndex && mode !== lastMode) modeSwitches += 1;
      lastMode = mode;
      var point = {
        accepted: accept,
        logp: currentLog,
        mode: mode,
        step: step,
        x: current.x,
        y: current.y
      };
      points.push(point);
      if (step > burnIndex) kept.push(point);
    }

    return {
      acceptance: accepted / params.steps,
      acceptanceAfterBurn: kept.length ? acceptedAfterBurn / kept.length : 0,
      color: CHAIN_COLORS[index % CHAIN_COLORS.length],
      index: index,
      kept: kept,
      modeSwitches: modeSwitches,
      points: points,
      start: points[0]
    };
  }

  function mean(values) {
    if (!values.length) return 0;
    var total = 0;
    values.forEach(function (value) { total += value; });
    return total / values.length;
  }

  function variance(values, avg) {
    if (values.length < 2) return 0;
    var total = 0;
    values.forEach(function (value) {
      var d = value - avg;
      total += d * d;
    });
    return total / (values.length - 1);
  }

  function autocorr(values, maxLag) {
    var n = values.length;
    if (n < 3) return [1];
    var avg = mean(values);
    var denom = 0;
    for (var i = 0; i < n; i += 1) {
      var d = values[i] - avg;
      denom += d * d;
    }
    if (denom <= 0) return [1];
    var out = [];
    for (var lag = 0; lag <= maxLag; lag += 1) {
      var num = 0;
      for (i = 0; i < n - lag; i += 1) {
        num += (values[i] - avg) * (values[i + lag] - avg);
      }
      out.push(num / denom);
    }
    return out;
  }

  function essFor(values) {
    var n = values.length;
    if (n < 8) return n;
    var acf = autocorr(values, Math.min(240, Math.floor(n / 2)));
    var tau = 1;
    for (var lag = 1; lag + 1 < acf.length; lag += 2) {
      var pair = acf[lag] + acf[lag + 1];
      if (pair <= 0) break;
      tau += 2 * pair;
    }
    return Math.max(1, n / Math.max(1, tau));
  }

  function rhat(chains) {
    var n = Math.min.apply(null, chains.map(function (chain) { return chain.kept.length; }));
    if (!isFinite(n) || n < 4) return NaN;
    var means = [];
    var variances = [];
    chains.forEach(function (chain) {
      var xs = chain.kept.slice(0, n).map(function (point) { return point.x; });
      var avg = mean(xs);
      means.push(avg);
      variances.push(variance(xs, avg));
    });
    var m = chains.length;
    var grand = mean(means);
    var w = mean(variances);
    var b = n * variance(means, grand);
    if (w <= 0) return NaN;
    var varHat = ((n - 1) / n) * w + b / n;
    return Math.sqrt(Math.max(0, varHat / w));
  }

  function summarize(chains, params) {
    var all = [];
    var allX = [];
    var right = 0;
    var switches = 0;
    chains.forEach(function (chain) {
      switches += chain.modeSwitches;
      chain.kept.forEach(function (point) {
        all.push(point);
        allX.push(point.x);
        if (point.mode) right += 1;
      });
    });
    var ess = 0;
    chains.forEach(function (chain) {
      ess += essFor(chain.kept.map(function (point) { return point.x; }));
    });
    var acceptance = mean(chains.map(function (chain) { return chain.acceptanceAfterBurn; }));
    var modeBalance = all.length ? right / all.length : 0;
    var meanX = mean(allX);
    return {
      acceptance: acceptance,
      ess: ess,
      essRatio: all.length ? ess / all.length : 0,
      kept: all.length,
      meanError: Math.abs(meanX),
      meanX: meanX,
      modeBalance: modeBalance,
      modeError: Math.abs(modeBalance - 0.5),
      rhat: rhat(chains),
      switches: switches
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var chains = [];
    for (var i = 0; i < params.chains; i += 1) {
      chains.push(simulateChain(params, i));
    }
    var summary = summarize(chains, params);
    var acf = autocorr(chains[0].kept.map(function (point) { return point.x; }), 48);
    return {
      acf: acf,
      chains: chains,
      params: params,
      summary: summary
    };
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="mcmc-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || 720));
    var height = Math.max(650, Math.round(rect.height || canvas.clientHeight || 860));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || 500) + " " + (opts.size || 12) + "px " + (opts.family || "system-ui, sans-serif");
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(value, x, y);
  }

  function roundedRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 12, box.y + 22, { size: 12, weight: 780 });
    if (subtitle) text(ctx, subtitle, box.x + 12, box.y + 39, { color: COLORS.muted, size: 10 });
  }

  function makeMaps(box, params) {
    var extent = Math.max(4.2, params.gap + 2.2);
    var x0 = box.x + 32;
    var y0 = box.y + 50;
    var w = box.w - 50;
    var h = box.h - 68;
    return {
      h: h,
      w: w,
      x: function (value) { return x0 + (value + extent) / (2 * extent) * w; },
      y: function (value) { return y0 + (extent - value) / (2 * extent) * h; },
      x0: x0,
      y0: y0,
      extent: extent
    };
  }

  function drawTarget(ctx, box, result) {
    panel(ctx, box, "target and retained paths", "two symmetric modes; target mean is zero");
    var params = result.params;
    var map = makeMaps(box, params);
    var grid = 64;
    var values = [];
    var maxLog = -Infinity;
    for (var iy = 0; iy < grid; iy += 1) {
      for (var ix = 0; ix < grid; ix += 1) {
        var x = -map.extent + (ix + 0.5) * 2 * map.extent / grid;
        var y = -map.extent + (iy + 0.5) * 2 * map.extent / grid;
        var lp = logTarget({ x: x, y: y }, params);
        values.push(lp);
        maxLog = Math.max(maxLog, lp);
      }
    }
    var cellW = map.w / grid;
    var cellH = map.h / grid;
    var k = 0;
    for (iy = 0; iy < grid; iy += 1) {
      for (ix = 0; ix < grid; ix += 1) {
        var density = Math.exp(values[k] - maxLog);
        k += 1;
        ctx.fillStyle = "rgba(15, 118, 110, " + (0.05 + 0.32 * Math.pow(density, 0.55)).toFixed(3) + ")";
        ctx.fillRect(map.x0 + ix * cellW, map.y0 + iy * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(map.x0, map.y0, map.w, map.h);
    ctx.strokeStyle = "rgba(23,32,38,0.25)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(map.x(0), map.y0);
    ctx.lineTo(map.x(0), map.y0 + map.h);
    ctx.stroke();
    ctx.setLineDash([]);

    result.chains.forEach(function (chain) {
      var kept = chain.kept;
      var stride = Math.max(1, Math.floor(kept.length / 500));
      ctx.strokeStyle = chain.color;
      ctx.globalAlpha = 0.62;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (var i = 0; i < kept.length; i += stride) {
        var px = map.x(kept[i].x);
        var py = map.y(kept[i].y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (kept.length) {
        var last = kept[kept.length - 1];
        ctx.fillStyle = chain.color;
        ctx.beginPath();
        ctx.arc(map.x(last.x), map.y(last.y), 3.2, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    text(ctx, "left mode", map.x(-params.gap), map.y0 + map.h + 17, { align: "center", color: COLORS.muted, size: 10 });
    text(ctx, "right mode", map.x(params.gap), map.y0 + map.h + 17, { align: "center", color: COLORS.muted, size: 10 });
  }

  function drawTrace(ctx, box, result) {
    panel(ctx, box, "trace of x", "multiple starts expose chain memory");
    var left = box.x + 42;
    var top = box.y + 52;
    var w = box.w - 58;
    var h = box.h - 76;
    var extent = Math.max(4.2, result.params.gap + 2.2);
    function mapX(step) { return left + step / result.params.steps * w; }
    function mapY(value) { return top + (extent - value) / (2 * extent) * h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var yy = top + i * h / 4;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(left + w, yy);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(190, 18, 60, 0.055)";
    ctx.fillRect(left, top, Math.floor(result.params.burn * w), h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    ctx.strokeStyle = "rgba(23,32,38,0.25)";
    ctx.beginPath();
    ctx.moveTo(left, mapY(0));
    ctx.lineTo(left + w, mapY(0));
    ctx.stroke();

    result.chains.forEach(function (chain) {
      var stride = Math.max(1, Math.floor(chain.points.length / 700));
      ctx.strokeStyle = chain.color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (var j = 0; j < chain.points.length; j += stride) {
        var point = chain.points[j];
        var px = mapX(point.step);
        var py = mapY(point.x);
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    text(ctx, "+" + result.params.gap.toFixed(1), left - 8, mapY(result.params.gap) + 3, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "-" + result.params.gap.toFixed(1), left - 8, mapY(-result.params.gap) + 3, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "burn-in", left + 6, top + 14, { color: COLORS.bad, size: 10 });
  }

  function drawAcf(ctx, box, result) {
    panel(ctx, box, "autocorrelation", "chain 1, x coordinate after burn-in");
    var left = box.x + 40;
    var top = box.y + 52;
    var w = box.w - 58;
    var h = box.h - 76;
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, w, h);
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(left, top + h);
    ctx.lineTo(left + w, top + h);
    ctx.stroke();
    var acf = result.acf;
    var barW = w / Math.max(1, acf.length - 1);
    for (var i = 1; i < acf.length; i += 1) {
      var value = clamp(acf[i], -0.2, 1);
      var bh = value >= 0 ? value * h : -value * h * 0.5;
      var x = left + (i - 1) * barW;
      ctx.fillStyle = value >= 0 ? COLORS.chainA : COLORS.bad;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x, top + h - Math.max(0, bh), Math.max(1, barW - 1), Math.max(1, Math.abs(bh)));
      ctx.globalAlpha = 1;
    }
    text(ctx, "1.0", left - 6, top + 4, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "lag 48", left + w, top + h + 16, { align: "right", color: COLORS.muted, size: 10 });
  }

  function drawDiagnostics(ctx, box, result) {
    panel(ctx, box, "diagnostic ledger", "acceptance is one column, not the verdict");
    var s = result.summary;
    var rows = [
      ["acceptance", s.acceptance, 0, 1, formatPercent(s.acceptance, 0), s.acceptance > 0.95 || s.acceptance < 0.08 ? COLORS.warning : COLORS.ok],
      ["mode balance", s.modeBalance, 0, 1, formatPercent(s.modeBalance, 0) + " right", s.modeError > 0.25 ? COLORS.bad : COLORS.ok],
      ["ESS / kept", s.essRatio, 0, 1, formatPercent(s.essRatio, 1), s.essRatio < 0.08 ? COLORS.bad : COLORS.ok],
      ["R-hat", Math.min(2.2, s.rhat), 1, 2.2, formatNumber(s.rhat, 2), s.rhat > 1.1 ? COLORS.bad : COLORS.ok],
      ["mode switches", Math.min(16, s.switches), 0, 16, String(s.switches), s.switches < result.params.chains ? COLORS.warning : COLORS.ok]
    ];
    var left = box.x + 114;
    var top = box.y + 52;
    var w = box.w - 138;
    var rowH = Math.min(28, (box.h - 74) / rows.length);
    rows.forEach(function (row, i) {
      var yy = top + i * (rowH + 8);
      text(ctx, row[0], box.x + 14, yy + rowH * 0.68, { color: COLORS.muted, size: 11 });
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(left, yy, w, rowH);
      var frac = (row[1] - row[2]) / Math.max(1e-9, row[3] - row[2]);
      frac = clamp(frac, 0, 1);
      ctx.fillStyle = row[5];
      ctx.fillRect(left, yy, w * frac, rowH);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left, yy, w, rowH);
      text(ctx, row[4], left + w + 8, yy + rowH * 0.68, { color: COLORS.text, size: 11, weight: 700 });
    });
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    var pad = width < 650 ? 10 : 14;

    if (width < 650) {
      drawTarget(ctx, { x: pad, y: pad, w: width - 2 * pad, h: height * 0.34 }, result);
      drawTrace(ctx, { x: pad, y: height * 0.37, w: width - 2 * pad, h: height * 0.23 }, result);
      drawAcf(ctx, { x: pad, y: height * 0.63, w: width - 2 * pad, h: height * 0.17 }, result);
      drawDiagnostics(ctx, { x: pad, y: height * 0.82, w: width - 2 * pad, h: height * 0.16 }, result);
    } else {
      var leftW = Math.round((width - 3 * pad) * 0.52);
      var rightW = width - 3 * pad - leftW;
      drawTarget(ctx, { x: pad, y: pad, w: leftW, h: height - 2 * pad }, result);
      drawTrace(ctx, { x: 2 * pad + leftW, y: pad, w: rightW, h: height * 0.34 }, result);
      drawAcf(ctx, { x: 2 * pad + leftW, y: height * 0.38, w: rightW, h: height * 0.27 }, result);
      drawDiagnostics(ctx, { x: 2 * pad + leftW, y: height * 0.69, w: rightW, h: height * 0.29 }, result);
    }
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (node) {
      raw[node.getAttribute("data-param")] = node.value;
    });
    return raw;
  }

  function syncOutputs(container, params) {
    var labels = {
      burn: formatPercent(params.burn, 0),
      chains: String(params.chains),
      correlation: formatPercent(params.correlation, 0),
      gap: params.gap.toFixed(1),
      proposal: params.proposal.toFixed(2),
      seed: String(params.seed),
      steps: String(params.steps)
    };
    Object.keys(labels).forEach(function (key) {
      var out = container.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(container) {
    var result = evaluate(readParams(container));
    var params = result.params;
    syncOutputs(container, params);
    var metrics = container.querySelector("[data-mcmc-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("acceptance", formatPercent(result.summary.acceptance, 0)),
        metric("R-hat", formatNumber(result.summary.rhat, 2)),
        metric("ESS / kept", formatPercent(result.summary.essRatio, 1)),
        metric("mode balance", formatPercent(result.summary.modeBalance, 0) + " right"),
        metric("mode switches", String(result.summary.switches)),
        metric("mean error", formatNumber(result.summary.meanError, 2))
      ].join("");
    }
    var canvas = container.querySelector("canvas");
    if (canvas) draw(result, canvas);
    container.__mcmcMemoryResult = result;
  }

  function init(container) {
    if (!container) return;
    container.querySelectorAll("[data-param]").forEach(function (node) {
      node.addEventListener("input", function () { render(container); });
      node.addEventListener("change", function () { render(container); });
    });
    render(container);
  }

  function initAll() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-mcmc-memory-lab]").forEach(init);
  }

  root.McmcMemoryLab = {
    autocorr: autocorr,
    cleanParams: cleanParams,
    essFor: essFor,
    evaluate: evaluate,
    logTarget: logTarget,
    rhat: rhat,
    simulateChain: simulateChain
  };

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
