(function (global) {
  "use strict";

  var COLORS = {
    alarm: "#be123c",
    calm: "#2563eb",
    diff: "#fef3c7",
    grid: "#e6edf3",
    muted: "#5d6872",
    panel: "#f8fafc",
    posterior: "#0f766e",
    rule: "#d7dee5",
    risk: "#d97706",
    text: "#172026",
    viterbi: "#7c3aed",
    white: "#ffffff"
  };

  var DEFAULTS = {
    length: 10,
    pattern: "burst",
    persistence: 85,
    prior: 50,
    seed: 37,
    sensor: 66
  };

  var PATTERNS = {
    alternating: "010101010101010101010101",
    block: "000111000111000111000111",
    burst: "0101101001",
    quiet: "000100010001000100010001"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var pattern = String(raw.pattern || DEFAULTS.pattern);
    if (!PATTERNS[pattern] && pattern !== "generated") pattern = DEFAULTS.pattern;
    return {
      length: Math.round(clamp(finite(Number(raw.length), DEFAULTS.length), 4, 24)),
      pattern: pattern,
      persistence: Math.round(clamp(finite(Number(raw.persistence), DEFAULTS.persistence), 55, 97)),
      prior: Math.round(clamp(finite(Number(raw.prior), DEFAULTS.prior), 5, 95)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      sensor: Math.round(clamp(finite(Number(raw.sensor), DEFAULTS.sensor), 52, 92))
    };
  }

  function rng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function repeatPattern(base, length) {
    var out = [];
    for (var i = 0; i < length; i += 1) {
      out.push(base.charAt(i % base.length) === "1" ? 1 : 0);
    }
    return out;
  }

  function model(params) {
    var p = params.persistence / 100;
    var q = params.sensor / 100;
    var priorRisk = params.prior / 100;
    return {
      emission: [
        [q, 1 - q],
        [1 - q, q]
      ],
      initial: [1 - priorRisk, priorRisk],
      transition: [
        [p, 1 - p],
        [1 - p, p]
      ]
    };
  }

  function generatedObservations(params, hmm) {
    var rand = rng(params.seed * 7919 + params.length * 101 + params.sensor * 53 + params.persistence * 17);
    var state = rand() < hmm.initial[1] ? 1 : 0;
    var obs = [];
    for (var t = 0; t < params.length; t += 1) {
      obs.push(rand() < hmm.emission[state][1] ? 1 : 0);
      if (t < params.length - 1) {
        state = rand() < hmm.transition[state][1] ? 1 : 0;
      }
    }
    return obs;
  }

  function observations(params, hmm) {
    if (params.pattern === "generated") return generatedObservations(params, hmm);
    return repeatPattern(PATTERNS[params.pattern], params.length);
  }

  function logsumexp(values) {
    var max = -Infinity;
    for (var i = 0; i < values.length; i += 1) max = Math.max(max, values[i]);
    if (max === -Infinity) return max;
    var sum = 0;
    for (var j = 0; j < values.length; j += 1) sum += Math.exp(values[j] - max);
    return max + Math.log(sum);
  }

  function safeLog(value) {
    return Math.log(Math.max(1e-300, value));
  }

  function pathJointLog(obs, hmm, path) {
    var score = safeLog(hmm.initial[path[0]]) + safeLog(hmm.emission[path[0]][obs[0]]);
    for (var t = 1; t < obs.length; t += 1) {
      score += safeLog(hmm.transition[path[t - 1]][path[t]]) + safeLog(hmm.emission[path[t]][obs[t]]);
    }
    return score;
  }

  function countSwitches(path) {
    var switches = 0;
    for (var t = 1; t < path.length; t += 1) if (path[t] !== path[t - 1]) switches += 1;
    return switches;
  }

  function decode(obs, hmm) {
    var states = 2;
    var T = obs.length;
    var logPi = hmm.initial.map(safeLog);
    var logA = hmm.transition.map(function (row) { return row.map(safeLog); });
    var logB = hmm.emission.map(function (row) { return row.map(safeLog); });
    var alpha = [];
    var beta = [];
    var delta = [];
    var psi = [];
    for (var t = 0; t < T; t += 1) {
      alpha.push(new Array(states).fill(-Infinity));
      beta.push(new Array(states).fill(-Infinity));
      delta.push(new Array(states).fill(-Infinity));
      psi.push(new Array(states).fill(-1));
    }

    for (var i = 0; i < states; i += 1) {
      alpha[0][i] = logPi[i] + logB[i][obs[0]];
      delta[0][i] = alpha[0][i];
      beta[T - 1][i] = 0;
    }

    for (var tt = 1; tt < T; tt += 1) {
      for (var j = 0; j < states; j += 1) {
        var sums = [];
        var best = -Infinity;
        var bestState = 0;
        for (var prev = 0; prev < states; prev += 1) {
          sums.push(alpha[tt - 1][prev] + logA[prev][j]);
          var candidate = delta[tt - 1][prev] + logA[prev][j] + logB[j][obs[tt]];
          if (candidate > best) {
            best = candidate;
            bestState = prev;
          }
        }
        alpha[tt][j] = logsumexp(sums) + logB[j][obs[tt]];
        delta[tt][j] = best;
        psi[tt][j] = bestState;
      }
    }

    for (var bt = T - 2; bt >= 0; bt -= 1) {
      for (var si = 0; si < states; si += 1) {
        var nexts = [];
        for (var sj = 0; sj < states; sj += 1) {
          nexts.push(logA[si][sj] + logB[sj][obs[bt + 1]] + beta[bt + 1][sj]);
        }
        beta[bt][si] = logsumexp(nexts);
      }
    }

    var logLik = logsumexp(alpha[T - 1]);
    var posterior = [];
    var posteriorPath = [];
    for (var pt = 0; pt < T; pt += 1) {
      var row = [];
      for (var ps = 0; ps < states; ps += 1) {
        row.push(Math.exp(alpha[pt][ps] + beta[pt][ps] - logLik));
      }
      posterior.push(row);
      posteriorPath.push(row[1] > row[0] ? 1 : 0);
    }

    var end = delta[T - 1][1] > delta[T - 1][0] ? 1 : 0;
    var viterbiPath = new Array(T);
    viterbiPath[T - 1] = end;
    for (var vt = T - 1; vt > 0; vt -= 1) {
      end = psi[vt][end];
      viterbiPath[vt - 1] = end;
    }

    return {
      alpha: alpha,
      beta: beta,
      delta: delta,
      logLik: logLik,
      posterior: posterior,
      posteriorPath: posteriorPath,
      psi: psi,
      viterbiPath: viterbiPath
    };
  }

  function expectedCorrect(path, posterior) {
    return path.reduce(function (sum, state, index) {
      return sum + posterior[index][state];
    }, 0);
  }

  function summarize(obs, hmm, decoded) {
    var vLog = pathJointLog(obs, hmm, decoded.viterbiPath);
    var pLog = pathJointLog(obs, hmm, decoded.posteriorPath);
    var disagreements = 0;
    for (var i = 0; i < obs.length; i += 1) {
      if (decoded.viterbiPath[i] !== decoded.posteriorPath[i]) disagreements += 1;
    }
    return {
      disagreements: disagreements,
      logLik: decoded.logLik,
      posteriorExpected: expectedCorrect(decoded.posteriorPath, decoded.posterior),
      posteriorJointLog: pLog,
      posteriorMass: Math.exp(pLog - decoded.logLik),
      posteriorPath: decoded.posteriorPath,
      posteriorSwitches: countSwitches(decoded.posteriorPath),
      viterbiExpected: expectedCorrect(decoded.viterbiPath, decoded.posterior),
      viterbiJointLog: vLog,
      viterbiMass: Math.exp(vLog - decoded.logLik),
      viterbiPath: decoded.viterbiPath,
      viterbiSwitches: countSwitches(decoded.viterbiPath)
    };
  }

  function sweepPersistence(params) {
    var rows = [];
    for (var p = 55; p <= 95; p += 5) {
      var local = Object.assign({}, params, { persistence: p });
      var hmm = model(local);
      var obs = observations(local, hmm);
      var decoded = decode(obs, hmm);
      var s = summarize(obs, hmm, decoded);
      rows.push({
        disagreements: s.disagreements,
        posteriorAdvantage: s.posteriorExpected - s.viterbiExpected,
        persistence: p,
        viterbiMass: s.viterbiMass
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var hmm = model(params);
    var obs = observations(params, hmm);
    var decoded = decode(obs, hmm);
    var summary = summarize(obs, hmm, decoded);
    return {
      decoded: decoded,
      hmm: hmm,
      observations: obs,
      params: params,
      summary: summary,
      sweep: sweepPersistence(params)
    };
  }

  function pathString(path) {
    return path.map(function (state) { return state ? "R" : "Q"; }).join("");
  }

  function obsString(obs) {
    return obs.map(function (value) { return value ? "A" : "C"; }).join("");
  }

  function audit() {
    var result = evaluate(DEFAULTS);
    var loose = evaluate(Object.assign({}, DEFAULTS, { persistence: 55 }));
    return {
      defaultDisagreements: result.summary.disagreements,
      expectedCorrectAdvantage: Number((result.summary.posteriorExpected - result.summary.viterbiExpected).toFixed(3)),
      forwardDominatesPaths: result.summary.viterbiJointLog <= result.summary.logLik + 1e-9 && result.summary.posteriorJointLog <= result.summary.logLik + 1e-9,
      looseDisagreements: loose.summary.disagreements,
      observationString: obsString(result.observations),
      posteriorMass: Number((100 * result.summary.posteriorMass).toFixed(3)),
      posteriorPath: pathString(result.summary.posteriorPath),
      posteriorPathHasLowerJoint: result.summary.posteriorJointLog < result.summary.viterbiJointLog,
      viterbiMass: Number((100 * result.summary.viterbiMass).toFixed(3)),
      viterbiPath: pathString(result.summary.viterbiPath)
    };
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function percent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value, klass) {
    return '<div class="hmm-lab__metric ' + (klass || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "persistence" || key === "prior" || key === "sensor") value += "%";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    var s = result.summary;
    box.innerHTML = [
      metric("observations", obsString(result.observations)),
      metric("Viterbi path", pathString(s.viterbiPath), "good"),
      metric("posterior labels", pathString(s.posteriorPath), s.disagreements ? "warn" : "good"),
      metric("disagreements", s.disagreements + " / " + result.observations.length, s.disagreements ? "warn" : "good"),
      metric("Viterbi path mass", percent(s.viterbiMass, 2), "good"),
      metric("posterior path mass", percent(s.posteriorMass, 2)),
      metric("expected labels", fmt(s.posteriorExpected, 2) + " vs " + fmt(s.viterbiExpected, 2)),
      metric("log p(obs)", fmt(s.logLik, 2))
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = global.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.width || 900));
    var height = width < 560 ? Math.round(width * 1.48) : Math.round(width * 0.76);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function clear(ctx, width, height) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
  }

  function label(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || 650) + " " + (opts.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    label(ctx, title, box.x + 14, box.y + 24, { size: 14, weight: 800 });
    if (subtitle) label(ctx, subtitle, box.x + 14, box.y + 42, { color: COLORS.muted, size: 11, weight: 600 });
  }

  function drawObservationPosterior(ctx, result, box) {
    panel(ctx, box, "observations and marginals", "posterior labels can win locally");
    var obs = result.observations;
    var n = obs.length;
    var plot = { x: box.x + 44, y: box.y + 62, w: box.w - 68, h: box.h - 96 };
    var cell = plot.w / n;
    var obsY = plot.y + 4;
    var postY = plot.y + 52;
    var barH = Math.max(28, plot.h - 76);
    for (var t = 0; t < n; t += 1) {
      if (result.summary.viterbiPath[t] !== result.summary.posteriorPath[t]) {
        ctx.fillStyle = COLORS.diff;
        ctx.fillRect(plot.x + t * cell, plot.y, cell, plot.h);
      }
      ctx.fillStyle = obs[t] ? COLORS.alarm : COLORS.calm;
      ctx.fillRect(plot.x + t * cell + 2, obsY, Math.max(3, cell - 4), 22);
      label(ctx, obs[t] ? "A" : "C", plot.x + t * cell + cell / 2, obsY + 15, { align: "center", color: COLORS.white, size: 10, weight: 800 });
      var riskP = result.decoded.posterior[t][1];
      ctx.fillStyle = "rgba(15, 118, 110, 0.16)";
      ctx.fillRect(plot.x + t * cell + 2, postY, Math.max(3, cell - 4), barH);
      ctx.fillStyle = COLORS.posterior;
      ctx.fillRect(plot.x + t * cell + 2, postY + barH * (1 - riskP), Math.max(3, cell - 4), barH * riskP);
      if (cell > 25) label(ctx, String(t + 1), plot.x + t * cell + cell / 2, plot.y + plot.h + 15, { align: "center", color: COLORS.muted, size: 9, weight: 650 });
    }
    label(ctx, "C=calm, A=alarm", plot.x, box.y + box.h - 17, { color: COLORS.muted, size: 10, weight: 700 });
    label(ctx, "risk posterior", plot.x + plot.w, box.y + box.h - 17, { align: "right", color: COLORS.posterior, size: 10, weight: 800 });
  }

  function drawTrellis(ctx, result, box) {
    panel(ctx, box, "trellis decoding", "max-product path versus smoothed labels");
    var n = result.observations.length;
    var plot = { x: box.x + 46, y: box.y + 66, w: box.w - 76, h: box.h - 96 };
    var yQuiet = plot.y + plot.h * 0.72;
    var yRisk = plot.y + plot.h * 0.25;
    var xs = [];
    for (var t = 0; t < n; t += 1) xs.push(plot.x + (n === 1 ? 0.5 : t / (n - 1)) * plot.w);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i < n - 1; i += 1) {
      [[yQuiet, yQuiet], [yQuiet, yRisk], [yRisk, yQuiet], [yRisk, yRisk]].forEach(function (ys) {
        ctx.beginPath();
        ctx.moveTo(xs[i], ys[0]);
        ctx.lineTo(xs[i + 1], ys[1]);
        ctx.stroke();
      });
    }

    ctx.strokeStyle = COLORS.viterbi;
    ctx.lineWidth = 3;
    ctx.beginPath();
    result.summary.viterbiPath.forEach(function (state, t) {
      var y = state ? yRisk : yQuiet;
      if (t === 0) ctx.moveTo(xs[t], y);
      else ctx.lineTo(xs[t], y);
    });
    ctx.stroke();

    result.summary.posteriorPath.forEach(function (state, t) {
      ctx.fillStyle = COLORS.posterior;
      ctx.beginPath();
      ctx.arc(xs[t], state ? yRisk - 13 : yQuiet + 13, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    for (var tt = 0; tt < n; tt += 1) {
      var riskP = result.decoded.posterior[tt][1];
      [
        { label: "Q", p: 1 - riskP, y: yQuiet },
        { label: "R", p: riskP, y: yRisk }
      ].forEach(function (node) {
        var radius = 5 + 9 * node.p;
        ctx.fillStyle = node.label === "R" ? "rgba(217, 119, 6, " + (0.24 + 0.56 * node.p) + ")" : "rgba(37, 99, 235, " + (0.22 + 0.52 * node.p) + ")";
        ctx.beginPath();
        ctx.arc(xs[tt], node.y, radius, 0, Math.PI * 2);
        ctx.fill();
        label(ctx, node.label, xs[tt], node.y + 4, { align: "center", color: COLORS.white, size: 9, weight: 850 });
      });
    }
    label(ctx, "risk", plot.x, yRisk - 18, { color: COLORS.risk, size: 10, weight: 800 });
    label(ctx, "quiet", plot.x, yQuiet + 28, { color: COLORS.calm, size: 10, weight: 800 });
    label(ctx, "Viterbi line", plot.x, box.y + box.h - 17, { color: COLORS.viterbi, size: 10, weight: 800 });
    label(ctx, "posterior dots", plot.x + 82, box.y + box.h - 17, { color: COLORS.posterior, size: 10, weight: 800 });
  }

  function drawObjectiveLedger(ctx, result, box) {
    panel(ctx, box, "two objectives", "best story is not best pointwise labels");
    var rows = [
      { color: COLORS.viterbi, label: "path posterior mass", p: result.summary.viterbiMass, q: result.summary.posteriorMass },
      { color: COLORS.posterior, label: "expected correct labels", p: result.summary.viterbiExpected / result.observations.length, q: result.summary.posteriorExpected / result.observations.length },
      { color: COLORS.risk, label: "state switches", p: result.summary.viterbiSwitches / Math.max(1, result.observations.length - 1), q: result.summary.posteriorSwitches / Math.max(1, result.observations.length - 1) }
    ];
    var plot = { x: box.x + 130, y: box.y + 68, w: box.w - 160, h: box.h - 102 };
    rows.forEach(function (row, index) {
      var y = plot.y + index * (plot.h / rows.length) + 5;
      label(ctx, row.label, box.x + 16, y + 17, { color: row.color, size: 10, weight: 800 });
      ctx.fillStyle = "rgba(124, 58, 237, 0.42)";
      ctx.fillRect(plot.x, y, plot.w * clamp(row.p, 0, 1), 12);
      ctx.fillStyle = "rgba(15, 118, 110, 0.58)";
      ctx.fillRect(plot.x, y + 16, plot.w * clamp(row.q, 0, 1), 12);
    });
    label(ctx, "purple = Viterbi", plot.x, box.y + box.h - 17, { color: COLORS.viterbi, size: 10, weight: 800 });
    label(ctx, "green = posterior labels", plot.x + 112, box.y + box.h - 17, { color: COLORS.posterior, size: 10, weight: 800 });
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "persistence sweep", "transition cost changes the disagreement");
    var rows = result.sweep;
    var plot = { x: box.x + 44, y: box.y + 64, w: box.w - 72, h: box.h - 98 };
    var maxDiff = Math.max(1, result.observations.length);
    var maxAdv = Math.max.apply(null, rows.map(function (row) { return Math.abs(row.posteriorAdvantage); }).concat([0.25]));
    function sx(p) { return plot.x + (p - 55) / 40 * plot.w; }
    function syDiff(value) { return plot.y + plot.h - value / maxDiff * plot.h; }
    function syAdv(value) { return plot.y + plot.h / 2 - value / maxAdv * (plot.h * 0.42); }

    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + g / 4 * plot.h;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.viterbi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = sx(row.persistence);
      var y = syDiff(row.disagreements);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = COLORS.posterior;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = sx(row.persistence);
      var y = syAdv(row.posteriorAdvantage);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    var markX = sx(result.params.persistence);
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(markX, plot.y);
    ctx.lineTo(markX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);

    label(ctx, "disagreements", plot.x, box.y + box.h - 17, { color: COLORS.viterbi, size: 10, weight: 800 });
    label(ctx, "posterior gain", plot.x + 108, box.y + box.h - 17, { color: COLORS.posterior, size: 10, weight: 800 });
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    clear(ctx, width, height);
    var margin = 18;
    var gap = 18;

    if (width < 560) {
      var h = (height - 2 * margin - 3 * gap) / 4;
      drawObservationPosterior(ctx, result, { x: margin, y: margin, w: width - 2 * margin, h: h });
      drawTrellis(ctx, result, { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h });
      drawObjectiveLedger(ctx, result, { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h });
      drawSweep(ctx, result, { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - 2 * margin - gap) / 2;
      var rowH = (height - 2 * margin - gap) / 2;
      drawObservationPosterior(ctx, result, { x: margin, y: margin, w: colW, h: rowH });
      drawTrellis(ctx, result, { x: margin + colW + gap, y: margin, w: colW, h: rowH });
      drawObjectiveLedger(ctx, result, { x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      drawSweep(ctx, result, { x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__hmmTrellisLabResult = result;
  }

  function init(root) {
    if (!root || root.__hmmTrellisReady) return;
    root.__hmmTrellisReady = true;
    var scheduled = null;
    function requestRender() {
      if (scheduled) global.cancelAnimationFrame(scheduled);
      scheduled = global.requestAnimationFrame(function () {
        scheduled = null;
        render(root);
      });
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    global.addEventListener("resize", requestRender);
    requestRender();
  }

  function initAll() {
    global.document.querySelectorAll("[data-hmm-trellis-lab]").forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.HMMTrellisLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
