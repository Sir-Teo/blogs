(function (global) {
  "use strict";

  var SYMBOLS = ["A", "B", "C", "D", "E", "F", "G", "H"];
  var N = 18;
  var MOD = SYMBOLS.length;
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    mask: "#e5e7eb",
    target: "#eef6ff",
    targetBorder: "#93c5fd",
    correct: "#0f766e",
    wrong: "#be123c",
    pending: "#94a3b8",
    ar: "#b45309",
    masked: "#2563eb",
    repair: "#7c3aed",
    grid: "#f1f5f9"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mod(value) {
    return ((value % MOD) + MOD) % MOD;
  }

  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function randUnit(seed, a, b, c) {
    var x = seed >>> 0;
    x ^= Math.imul((a + 1) >>> 0, 0x9e3779b1);
    x ^= Math.imul((b + 17) >>> 0, 0x85ebca6b);
    x ^= Math.imul((c + 97) >>> 0, 0xc2b2ae35);
    return mix32(x) / 4294967296;
  }

  function rng(seed) {
    var state = mix32(seed || 1);
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function symbol(value) {
    return value == null ? "?" : SYMBOLS[mod(value)];
  }

  function circularDistance(a, b) {
    var d = Math.abs(mod(a) - mod(b));
    return Math.min(d, MOD - d);
  }

  function factor(label, terms, constant) {
    return {
      label: label,
      terms: terms,
      constant: mod(constant)
    };
  }

  function term(pos, coef) {
    return { pos: pos, coef: coef };
  }

  function makePuzzle(seed) {
    var random = rng(1009 + seed * 9173);
    var x = new Array(N);
    var i;
    for (i = 0; i < 8; i += 1) {
      x[i] = Math.floor(random() * MOD);
    }

    x[8] = mod(x[0] + x[2] + x[4] + 1);
    x[9] = mod(x[1] + x[3] + x[5] + 2);
    x[10] = mod(x[6] + x[7] + x[0] + 3);
    x[11] = x[3];
    x[12] = mod(x[4] + x[5] + x[6] + 4);
    x[13] = mod(7 - x[2]);
    x[14] = x[1];
    x[15] = mod(x[8] + x[9] + x[10]);
    x[16] = x[5];
    x[17] = x[0];

    var factors = [
      factor("mirror 17=0", [term(17, 1), term(0, -1)], 0),
      factor("mirror 16=5", [term(16, 1), term(5, -1)], 0),
      factor("mirror 14=1", [term(14, 1), term(1, -1)], 0),
      factor("copy 11=3", [term(11, 1), term(3, -1)], 0),
      factor("comp 13+2", [term(13, 1), term(2, 1)], 7),
      factor("sum 8", [term(8, 1), term(0, -1), term(2, -1), term(4, -1)], 1),
      factor("sum 9", [term(9, 1), term(1, -1), term(3, -1), term(5, -1)], 2),
      factor("sum 10", [term(10, 1), term(6, -1), term(7, -1), term(0, -1)], 3),
      factor("sum 12", [term(12, 1), term(4, -1), term(5, -1), term(6, -1)], 4),
      factor("sum 15", [term(15, 1), term(8, -1), term(9, -1), term(10, -1)], 0)
    ];

    return {
      seed: seed,
      target: x,
      factors: factors
    };
  }

  function paramsFromLab(lab) {
    function read(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      if (!input) return fallback;
      var value = Number(input.value);
      return Number.isFinite(value) ? value : fallback;
    }
    return {
      seed: Math.round(read("seed", 1)),
      prior: clamp(read("prior", 58), 10, 100),
      noise: clamp(read("noise", 44), 0, 100),
      constraints: clamp(read("constraints", 72), 0, 100),
      steps: Math.round(clamp(read("steps", 6), 1, 16)),
      reveal: clamp(read("reveal", 30), 5, 80),
      repair: Math.round(clamp(read("repair", 2), 0, 6))
    };
  }

  function hintForPosition(pos) {
    var hints = [
      0.34, 0.36, 0.32, 0.35, 0.43, 0.45, 0.48, 0.47, 0.66,
      0.64, 0.62, 0.73, 0.68, 0.76, 0.72, 0.82, 0.86, 0.88
    ];
    return hints[pos] || 0.5;
  }

  function factorContains(f, pos) {
    return f.terms.some(function (t) { return t.pos === pos; });
  }

  function factorValue(f, tokens) {
    var total = 0;
    var missing = 0;
    f.terms.forEach(function (t) {
      var v = tokens[t.pos];
      if (v == null) {
        missing += 1;
      } else {
        total += t.coef * v;
      }
    });
    return {
      missing: missing,
      residual: mod(total - f.constant)
    };
  }

  function factorSatisfied(f, tokens) {
    var v = factorValue(f, tokens);
    return v.missing === 0 && v.residual === 0;
  }

  function constraintScoreFor(puzzle, visible, pos, candidate) {
    var score = 0;
    var used = 0;
    puzzle.factors.forEach(function (f) {
      if (!factorContains(f, pos)) return;
      var draft = visible.slice();
      draft[pos] = candidate;
      var value = factorValue(f, draft);
      if (value.missing === 0) {
        used += 1;
        score += value.residual === 0 ? 1.25 : -1.55;
      } else if (value.missing === 1) {
        score += 0.12;
      }
    });
    return used ? score / Math.sqrt(used) : score;
  }

  function scoreCandidates(puzzle, visible, pos, params, phase) {
    var target = puzzle.target[pos];
    var priorWeight = (params.prior / 100) * hintForPosition(pos);
    var constraintWeight = params.constraints / 100;
    var noiseAmp = 0.25 + 2.75 * params.noise / 100;
    var logits = [];
    var cand;

    for (cand = 0; cand < MOD; cand += 1) {
      var dist = circularDistance(cand, target);
      var local = (1.15 - 0.55 * dist) * (0.65 + 1.75 * priorWeight);
      var cScore = constraintScoreFor(puzzle, visible, pos, cand);
      var noise = (randUnit(puzzle.seed + 991, pos, cand, phase) * 2 - 1) * noiseAmp;
      logits.push(local + 2.65 * constraintWeight * cScore + noise);
    }

    var maxLogit = Math.max.apply(Math, logits);
    var exps = logits.map(function (l) { return Math.exp(l - maxLogit); });
    var total = exps.reduce(function (sum, v) { return sum + v; }, 0);
    var probs = exps.map(function (v) { return v / total; });
    var order = probs.map(function (p, i) {
      return { value: i, prob: p, logit: logits[i] };
    }).sort(function (a, b) {
      return b.prob - a.prob;
    });

    return {
      value: order[0].value,
      confidence: order[0].prob - order[1].prob,
      probability: order[0].prob,
      runnerUp: order[1].value,
      probs: probs
    };
  }

  function accuracy(tokens, target) {
    var right = 0;
    var known = 0;
    tokens.forEach(function (v, i) {
      if (v != null) {
        known += 1;
        if (v === target[i]) right += 1;
      }
    });
    return known ? right / target.length : 0;
  }

  function violationCount(tokens, puzzle) {
    return puzzle.factors.reduce(function (count, f) {
      return count + (factorSatisfied(f, tokens) ? 0 : 1);
    }, 0);
  }

  function cloneTokens(tokens) {
    return tokens.slice();
  }

  function decodeAR(puzzle, params) {
    var visible = new Array(N).fill(null);
    var trace = [cloneTokens(visible)];
    for (var pos = 0; pos < N; pos += 1) {
      var scored = scoreCandidates(puzzle, visible, pos, params, 100 + pos);
      visible[pos] = scored.value;
      if (pos % 3 === 2 || pos === N - 1) trace.push(cloneTokens(visible));
    }
    return summarizeDecode("Left-to-right", visible, trace, N, puzzle);
  }

  function remainingPositions(tokens) {
    var out = [];
    tokens.forEach(function (v, i) {
      if (v == null) out.push(i);
    });
    return out;
  }

  function decodeMasked(puzzle, params) {
    var visible = new Array(N).fill(null);
    var trace = [cloneTokens(visible)];
    var steps = Math.max(1, params.steps);
    for (var step = 1; step <= steps; step += 1) {
      var remaining = remainingPositions(visible);
      if (!remaining.length) break;
      var slotsLeft = steps - step + 1;
      var revealByRate = Math.max(1, Math.ceil(N * params.reveal / 100));
      var reveal = Math.max(Math.ceil(remaining.length / slotsLeft), revealByRate);
      var scored = remaining.map(function (pos) {
        var s = scoreCandidates(puzzle, visible, pos, params, 300 + step * 31 + pos);
        return {
          pos: pos,
          value: s.value,
          confidence: s.confidence,
          probability: s.probability
        };
      }).sort(function (a, b) {
        if (Math.abs(b.confidence - a.confidence) > 1e-9) return b.confidence - a.confidence;
        return b.probability - a.probability;
      });
      scored.slice(0, reveal).forEach(function (item) {
        visible[item.pos] = item.value;
      });
      trace.push(cloneTokens(visible));
    }
    remainingPositions(visible).forEach(function (pos) {
      visible[pos] = scoreCandidates(puzzle, visible, pos, params, 900 + pos).value;
    });
    if (trace[trace.length - 1].some(function (v) { return v == null; })) {
      trace.push(cloneTokens(visible));
    }
    return summarizeDecode("Masked", visible, trace, steps, puzzle);
  }

  function positionTension(puzzle, tokens, pos) {
    var total = 0;
    var count = 0;
    puzzle.factors.forEach(function (f) {
      if (!factorContains(f, pos)) return;
      var value = factorValue(f, tokens);
      if (value.missing === 0) {
        count += 1;
        if (value.residual !== 0) total += 1;
      }
    });
    return count ? total / count : 0;
  }

  function decodeRepair(puzzle, params, masked) {
    var visible = cloneTokens(masked.tokens);
    var trace = masked.trace.map(cloneTokens);
    var passes = params.repair;
    var repairParams = Object.assign({}, params, { noise: params.noise * 0.55 });
    for (var pass = 1; pass <= passes; pass += 1) {
      var proposals = [];
      for (var pos = 0; pos < N; pos += 1) {
        var draft = cloneTokens(visible);
        draft[pos] = null;
        var scored = scoreCandidates(puzzle, draft, pos, repairParams, 700 + pass * 41 + pos);
        var tension = positionTension(puzzle, visible, pos);
        proposals.push({
          pos: pos,
          value: scored.value,
          confidence: scored.confidence,
          tension: tension,
          changes: scored.value !== visible[pos]
        });
      }
      proposals.sort(function (a, b) {
        var wa = a.tension * 2 + (a.changes ? a.confidence : 0);
        var wb = b.tension * 2 + (b.changes ? b.confidence : 0);
        return wb - wa;
      });
      var edits = Math.max(1, Math.ceil(N * 0.16));
      proposals.slice(0, edits).forEach(function (p) {
        if (p.tension > 0 && p.changes) visible[p.pos] = p.value;
      });
      trace.push(cloneTokens(visible));
    }
    return summarizeDecode("Repair", visible, trace, masked.evals + passes, puzzle);
  }

  function summarizeDecode(label, tokens, trace, evals, puzzle) {
    return {
      label: label,
      tokens: tokens,
      trace: trace,
      evals: evals,
      accuracy: accuracy(tokens, puzzle.target),
      violations: violationCount(tokens, puzzle)
    };
  }

  function simulate(params) {
    var puzzle = makePuzzle(params.seed);
    var ar = decodeAR(puzzle, params);
    var masked = decodeMasked(puzzle, params);
    var repair = decodeRepair(puzzle, params, masked);
    return {
      params: params,
      puzzle: puzzle,
      ar: ar,
      masked: masked,
      repair: repair,
      audit: runAudit()
    };
  }

  function sweepSteps(params) {
    var steps = [1, 2, 3, 4, 6, 8, 10, 12, 16];
    var rows = [];
    steps.forEach(function (step) {
      var p = Object.assign({}, params, { steps: step });
      var puzzle = makePuzzle(p.seed);
      var masked = decodeMasked(puzzle, p);
      var repair = decodeRepair(puzzle, p, masked);
      rows.push({
        step: step,
        masked: masked.accuracy,
        repair: repair.accuracy,
        maskedViolations: masked.violations,
        repairViolations: repair.violations
      });
    });
    return rows;
  }

  function runAudit() {
    var cases = 0;
    var ok = 0;
    [3, 11, 19, 27, 35, 43, 51, 59].forEach(function (seed) {
      [22, 48, 76].forEach(function (noise) {
        [38, 72].forEach(function (constraints) {
          [4, 8, 12].forEach(function (steps) {
            cases += 1;
            var params = {
              seed: seed,
              prior: 58,
              noise: noise,
              constraints: constraints,
              steps: steps,
              reveal: 30,
              repair: 2
            };
            var puzzle = makePuzzle(seed);
            var ar = decodeAR(puzzle, params);
            var masked = decodeMasked(puzzle, params);
            var repair = decodeRepair(puzzle, params, masked);
            var valid = violationCount(puzzle.target, puzzle) === 0 &&
              ar.tokens.length === N &&
              masked.tokens.length === N &&
              repair.tokens.length === N &&
              masked.tokens.every(function (v) { return v != null && v >= 0 && v < MOD; }) &&
              repair.tokens.every(function (v) { return v != null && v >= 0 && v < MOD; }) &&
              ar.accuracy >= 0 && ar.accuracy <= 1 &&
              masked.accuracy >= 0 && masked.accuracy <= 1 &&
              repair.accuracy >= 0 && repair.accuracy <= 1 &&
              masked.evals <= steps + 1;
            if (valid) ok += 1;
          });
        });
      });
    });
    return { ok: ok, cases: cases };
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="masked-diffusion-lab__metric"><span>' +
      label + '</span><strong>' + value + '</strong></div>';
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px Inter, system-ui, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawPanel(ctx, x, y, w, h, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    drawText(ctx, title, x, y - 14, COLORS.text, 12, 750);
    if (subtitle) drawText(ctx, subtitle, x + w, y - 14, COLORS.muted, 11, 550, "right");
  }

  function drawToken(ctx, x, y, size, value, target, mode) {
    var fill = COLORS.mask;
    var stroke = COLORS.rule;
    var text = COLORS.muted;
    if (mode === "target") {
      fill = COLORS.target;
      stroke = COLORS.targetBorder;
      text = COLORS.text;
    } else if (value != null) {
      fill = value === target ? "#dff5ef" : "#fde2e2";
      stroke = value === target ? "#5bb8a5" : "#f1a0a6";
      text = value === target ? COLORS.correct : COLORS.wrong;
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, size, size);
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    drawText(ctx, symbol(value), x + size / 2, y + size / 2 + 1, text, 12, 750, "center");
  }

  function drawTokenRow(ctx, label, tokens, target, x, y, size, mode) {
    drawText(ctx, label, x - 12, y + size / 2, COLORS.text, 12, 750, "right");
    for (var i = 0; i < N; i += 1) {
      drawToken(ctx, x + i * (size + 4), y, size, tokens[i], target[i], mode);
    }
  }

  function drawTimeline(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Denoising clock", "unknowns disappear in confidence order");
    var size = 20;
    var rowGap = 28;
    var tx = x + 94;
    var trace = result.masked.trace.slice(0, 8);
    if (result.masked.trace.length > 8) {
      trace = result.masked.trace.slice(0, 7).concat([result.masked.trace[result.masked.trace.length - 1]]);
    }
    trace.forEach(function (row, r) {
      var label = r === 0 ? "mask" : "step " + r;
      drawTokenRow(ctx, label, row, result.puzzle.target, tx, y + 22 + r * rowGap, size);
    });
    for (var i = 0; i < N; i += 1) {
      if (i % 3 === 0) drawText(ctx, String(i), tx + i * (size + 4) + size / 2, y + h - 12, COLORS.muted, 10, 600, "center");
    }
  }

  function drawFinalRows(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Final packet", "green tokens match the hidden packet");
    var size = 24;
    var tx = x + 118;
    drawTokenRow(ctx, "target", result.puzzle.target, result.puzzle.target, tx, y + 25, size, "target");
    drawTokenRow(ctx, "left-to-right", result.ar.tokens, result.puzzle.target, tx, y + 61, size);
    drawTokenRow(ctx, "masked", result.masked.tokens, result.puzzle.target, tx, y + 97, size);
    drawTokenRow(ctx, "repair", result.repair.tokens, result.puzzle.target, tx, y + 133, size);
    drawText(ctx, "accuracy", x + 12, y + h - 25, COLORS.muted, 11, 650);
    drawText(ctx, formatPercent(result.ar.accuracy), tx, y + h - 25, COLORS.ar, 12, 750);
    drawText(ctx, formatPercent(result.masked.accuracy), tx + 122, y + h - 25, COLORS.masked, 12, 750);
    drawText(ctx, formatPercent(result.repair.accuracy), tx + 240, y + h - 25, COLORS.repair, 12, 750);
  }

  function drawSweep(ctx, rows, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Speed-quality surface", "same puzzle, different denoising depths");
    var plot = { x: x + 42, y: y + 24, w: w - 62, h: h - 52 };
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var yy = plot.y + plot.h - tick * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
      drawText(ctx, String(Math.round(tick * 100)), plot.x - 8, yy, COLORS.muted, 10, 550, "right");
    });
    function sx(step) {
      return plot.x + (step - 1) / 15 * plot.w;
    }
    function sy(acc) {
      return plot.y + plot.h - acc * plot.h;
    }
    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach(function (row, i) {
        var px = sx(row.step);
        var py = sy(row[key]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      rows.forEach(function (row) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx(row.step), sy(row[key]), 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.lineWidth = 1;
    }
    line("masked", COLORS.masked);
    line("repair", COLORS.repair);
    drawText(ctx, "1", plot.x, plot.y + plot.h + 18, COLORS.muted, 10, 550, "center");
    drawText(ctx, "16 network evals", plot.x + plot.w, plot.y + plot.h + 18, COLORS.muted, 10, 550, "right");
    drawText(ctx, "masked", plot.x + 8, plot.y + 12, COLORS.masked, 11, 750);
    drawText(ctx, "repair", plot.x + 82, plot.y + 12, COLORS.repair, 11, 750);
  }

  function drawLedger(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Constraint ledger", "filled squares satisfy the modular check");
    var rowH = 20;
    var left = x + 12;
    var top = y + 24;
    drawText(ctx, "factor", left, top - 10, COLORS.muted, 10, 650);
    drawText(ctx, "AR", x + w - 87, top - 10, COLORS.ar, 10, 750, "center");
    drawText(ctx, "M", x + w - 55, top - 10, COLORS.masked, 10, 750, "center");
    drawText(ctx, "R", x + w - 23, top - 10, COLORS.repair, 10, 750, "center");
    result.puzzle.factors.forEach(function (f, i) {
      var yy = top + i * rowH;
      drawText(ctx, f.label, left, yy, COLORS.text, 10, 600);
      [
        { tokens: result.ar.tokens, color: COLORS.ar, x: x + w - 94 },
        { tokens: result.masked.tokens, color: COLORS.masked, x: x + w - 62 },
        { tokens: result.repair.tokens, color: COLORS.repair, x: x + w - 30 }
      ].forEach(function (item) {
        var ok = factorSatisfied(f, item.tokens);
        ctx.fillStyle = ok ? item.color : "#ffffff";
        ctx.strokeStyle = ok ? item.color : COLORS.rule;
        ctx.fillRect(item.x, yy - 6, 12, 12);
        ctx.strokeRect(item.x + 0.5, yy - 5.5, 11, 11);
      });
    });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawFinalRows(ctx, result, 24, 36, 852, 190);
    drawTimeline(ctx, result, 24, 270, 852, 250);
    drawSweep(ctx, sweepSteps(result.params), 24, 562, 416, 150);
    drawLedger(ctx, result, 476, 562, 400, 150);
  }

  function syncOutputs(lab, params) {
    Object.keys(params).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (!out) return;
      if (key === "prior" || key === "noise" || key === "constraints" || key === "reveal") {
        out.textContent = Math.round(params[key]) + "%";
      } else {
        out.textContent = String(params[key]);
      }
    });
  }

  function render(lab) {
    var params = paramsFromLab(lab);
    syncOutputs(lab, params);
    var result = simulate(params);
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("left-to-right", formatPercent(result.ar.accuracy)),
        metric("masked", formatPercent(result.masked.accuracy)),
        metric("repair", formatPercent(result.repair.accuracy)),
        metric("constraint errors", result.repair.violations + "/" + result.puzzle.factors.length),
        metric("parallel depth", result.masked.evals + " vs " + result.ar.evals),
        metric("audit grid", result.audit.ok + "/" + result.audit.cases)
      ].join("");
    }
    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function init(lab) {
    var inputs = Array.prototype.slice.call(lab.querySelectorAll("[data-param]"));
    inputs.forEach(function (input) {
      input.addEventListener("input", function () { render(lab); });
    });
    render(lab);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      makePuzzle: makePuzzle,
      simulate: simulate,
      runAudit: runAudit,
      sweepSteps: sweepSteps
    };
  }

  if (global && global.document) {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-masked-diffusion-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
