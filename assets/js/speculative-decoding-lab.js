(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    target: "#0f766e",
    draft: "#b45309",
    exact: "#2563eb",
    wrong: "#be123c",
    violet: "#7c3aed",
    gray: "#64748b"
  };

  var VOCAB = ["the", "of", "and", "to", "in", "is", "code", "."];

  var DEFAULTS = {
    certainty: 64,
    draftCost: 9,
    gamma: 5,
    length: 96,
    match: 72,
    seed: 23
  };

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
      state += 0x6d2b79f5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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
    return {
      certainty: clamp(Number(raw.certainty == null ? DEFAULTS.certainty : raw.certainty), 0, 100),
      draftCost: clamp(Number(raw.draftCost == null ? DEFAULTS.draftCost : raw.draftCost), 0, 40),
      gamma: clamp(Math.round(raw.gamma == null ? DEFAULTS.gamma : raw.gamma), 1, 12),
      length: clamp(Math.round(raw.length == null ? DEFAULTS.length : raw.length), 24, 180),
      match: clamp(Number(raw.match == null ? DEFAULTS.match : raw.match), 0, 100),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 999)
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="spec-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function normalize(values) {
    var out = values.slice();
    var sum = 0;
    for (var i = 0; i < out.length; i += 1) {
      out[i] = Math.max(0, out[i]);
      sum += out[i];
    }
    if (sum <= 0) {
      var uniformValue = 1 / out.length;
      return out.map(function () { return uniformValue; });
    }
    return out.map(function (value) { return value / sum; });
  }

  function softmax(logits, temperature) {
    var temp = Math.max(0.05, temperature);
    var maxLogit = -Infinity;
    var i;
    for (i = 0; i < logits.length; i += 1) maxLogit = Math.max(maxLogit, logits[i] / temp);
    var exps = [];
    var sum = 0;
    for (i = 0; i < logits.length; i += 1) {
      var e = Math.exp(logits[i] / temp - maxLogit);
      exps.push(e);
      sum += e;
    }
    return exps.map(function (value) { return value / sum; });
  }

  function mix(a, b, t) {
    var out = [];
    for (var i = 0; i < a.length; i += 1) out.push(t * a[i] + (1 - t) * b[i]);
    return normalize(out);
  }

  function sampleDist(dist, rand) {
    var u = rand();
    var acc = 0;
    for (var i = 0; i < dist.length; i += 1) {
      acc += dist[i];
      if (u <= acc) return i;
    }
    return dist.length - 1;
  }

  function totalVariation(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
    return 0.5 * sum;
  }

  function makeModel(rawParams) {
    var params = cleanParams(rawParams);
    var n = VOCAB.length;
    var sharpness = params.certainty / 100;
    var temperature = 1.65 - 1.25 * sharpness;
    var match = params.match / 100;
    var seed = params.seed * 1000003 + Math.round(params.certainty) * 271;
    var target = [];
    var draft = [];
    var state;
    var token;

    for (state = 0; state < n; state += 1) {
      var targetLogits = [];
      var draftLogits = [];
      for (token = 0; token < n; token += 1) {
        var rhythm = Math.sin((state + 1) * (token + 2) * 0.71) + 0.5 * Math.cos((state + 3) * (token + 1) * 0.37);
        var repeatBias = token === state ? -0.45 : 0;
        var periodBias = VOCAB[token] === "." && (state === 6 || state === 5) ? 1.15 : 0;
        var syntaxBias = token === (state + 3) % n ? 0.65 : 0;
        targetLogits.push(0.78 * normal(1000 + state * 97 + token * 13, seed ^ 0xa511e9b3) + rhythm + repeatBias + periodBias + syntaxBias);
        draftLogits.push(0.95 * normal(3000 + state * 131 + token * 19, seed ^ 0x63d83595) + 0.35 * rhythm + 0.25 * syntaxBias);
      }
      var p = softmax(targetLogits, temperature);
      var noisy = softmax(draftLogits, 1.1 + 0.4 * (1 - sharpness));
      var smoothedTarget = mix(p, new Array(n).fill(1 / n), 0.82);
      var draftBase = mix(noisy, smoothedTarget, 0.45);
      var q = mix(p, draftBase, match);
      target.push(p);
      draft.push(q);
    }

    return {
      draft: draft,
      params: params,
      target: target,
      vocab: VOCAB.slice()
    };
  }

  function residualDistribution(targetDist, draftDist) {
    var residual = [];
    var mass = 0;
    for (var i = 0; i < targetDist.length; i += 1) {
      var value = Math.max(0, targetDist[i] - draftDist[i]);
      residual.push(value);
      mass += value;
    }
    if (mass <= 1e-12) return targetDist.slice();
    return residual.map(function (value) { return value / mass; });
  }

  function oneStepContract(targetDist, draftDist) {
    var acceptMass = [];
    var output = [];
    var wrongOutput = [];
    var alpha = 0;
    var rejection = 0;
    var i;

    for (i = 0; i < targetDist.length; i += 1) {
      var accepted = Math.min(targetDist[i], draftDist[i]);
      acceptMass.push(accepted);
      alpha += accepted;
    }
    rejection = Math.max(0, 1 - alpha);
    var residual = residualDistribution(targetDist, draftDist);

    for (i = 0; i < targetDist.length; i += 1) {
      output.push(acceptMass[i] + rejection * residual[i]);
      wrongOutput.push(acceptMass[i] + rejection * targetDist[i]);
    }

    return {
      acceptanceByToken: acceptMass,
      alpha: alpha,
      draftTv: totalVariation(targetDist, draftDist),
      exactOutput: normalize(output),
      exactTv: totalVariation(targetDist, normalize(output)),
      rejection: rejection,
      residual: residual,
      wrongOutput: normalize(wrongOutput),
      wrongTv: totalVariation(targetDist, normalize(wrongOutput))
    };
  }

  function expectedTokens(alpha, gamma) {
    if (alpha >= 0.999999) return gamma + 1;
    return (1 - Math.pow(alpha, gamma + 1)) / (1 - alpha);
  }

  function speedupFrom(alpha, gamma, draftCost) {
    return expectedTokens(alpha, gamma) / (1 + gamma * draftCost);
  }

  function averageAlpha(model) {
    var total = 0;
    for (var state = 0; state < model.target.length; state += 1) {
      total += oneStepContract(model.target[state], model.draft[state]).alpha;
    }
    return total / model.target.length;
  }

  function sampleTargetSequence(model, length, rand) {
    var tokens = [];
    var state = 0;
    while (tokens.length < length) {
      var token = sampleDist(model.target[state], rand);
      tokens.push(token);
      state = token;
    }
    return tokens;
  }

  function sampleSpeculativeSequence(model, rawParams) {
    var params = cleanParams(rawParams);
    var rand = rng(params.seed ^ 0xdecafbad);
    var state = 0;
    var tokens = [];
    var events = [];
    var targetCalls = 0;
    var draftCalls = 0;
    var loops = 0;
    var acceptedDraft = 0;
    var rejectedDraft = 0;
    var bonusTokens = 0;

    while (tokens.length < params.length) {
      var proposals = [];
      var proposalStates = [];
      var draftState = state;
      var localGamma = params.gamma;
      loops += 1;

      for (var i = 0; i < localGamma; i += 1) {
        var q = model.draft[draftState];
        var proposal = sampleDist(q, rand);
        proposals.push(proposal);
        proposalStates.push(draftState);
        draftState = proposal;
        draftCalls += 1;
      }

      targetCalls += 1;
      var rejected = false;
      for (var j = 0; j < proposals.length && tokens.length < params.length; j += 1) {
        var token = proposals[j];
        var verifyState = proposalStates[j];
        var p = model.target[verifyState];
        var qj = model.draft[verifyState];
        var acceptProb = Math.min(1, p[token] / Math.max(1e-12, qj[token]));
        if (rand() < acceptProb) {
          tokens.push(token);
          events.push({ kind: "accept", loop: loops, prob: acceptProb, state: verifyState, token: token });
          state = token;
          acceptedDraft += 1;
        } else {
          var residual = residualDistribution(p, qj);
          var corrected = sampleDist(residual, rand);
          tokens.push(corrected);
          events.push({ draft: token, kind: "reject", loop: loops, prob: acceptProb, state: verifyState, token: corrected });
          state = corrected;
          rejectedDraft += 1;
          rejected = true;
          break;
        }
      }

      if (!rejected && tokens.length < params.length) {
        var bonus = sampleDist(model.target[state], rand);
        tokens.push(bonus);
        events.push({ kind: "bonus", loop: loops, prob: 1, state: state, token: bonus });
        state = bonus;
        bonusTokens += 1;
      }
    }

    var cost = params.draftCost / 100;
    return {
      acceptedDraft: acceptedDraft,
      bonusTokens: bonusTokens,
      draftCalls: draftCalls,
      events: events,
      rejectedDraft: rejectedDraft,
      speedup: params.length / Math.max(1e-9, targetCalls + cost * draftCalls),
      targetCalls: targetCalls,
      tokens: tokens.slice(0, params.length),
      tokensPerTargetCall: params.length / Math.max(1, targetCalls)
    };
  }

  function sampleOneStepCounts(model, samples, seed) {
    var p = model.target[0];
    var q = model.draft[0];
    var contract = oneStepContract(p, q);
    var rand = rng(seed ^ 0x9e3779b9);
    var countsTarget = new Array(p.length).fill(0);
    var countsDraft = new Array(p.length).fill(0);
    var countsSpec = new Array(p.length).fill(0);
    var countsWrong = new Array(p.length).fill(0);

    for (var i = 0; i < samples; i += 1) {
      var targetToken = sampleDist(p, rand);
      var draftToken = sampleDist(q, rand);
      countsTarget[targetToken] += 1;
      countsDraft[draftToken] += 1;

      var proposed = sampleDist(q, rand);
      var accept = rand() < Math.min(1, p[proposed] / Math.max(1e-12, q[proposed]));
      if (accept) countsSpec[proposed] += 1;
      else countsSpec[sampleDist(contract.residual, rand)] += 1;

      var wrongProposed = sampleDist(q, rand);
      var wrongAccept = rand() < Math.min(1, p[wrongProposed] / Math.max(1e-12, q[wrongProposed]));
      if (wrongAccept) countsWrong[wrongProposed] += 1;
      else countsWrong[sampleDist(p, rand)] += 1;
    }

    function normalizeCounts(counts) {
      return counts.map(function (count) { return count / samples; });
    }

    var targetEmpirical = normalizeCounts(countsTarget);
    var draftEmpirical = normalizeCounts(countsDraft);
    var specEmpirical = normalizeCounts(countsSpec);
    var wrongEmpirical = normalizeCounts(countsWrong);

    return {
      draftEmpirical: draftEmpirical,
      draftEmpiricalTv: totalVariation(p, draftEmpirical),
      specEmpirical: specEmpirical,
      specEmpiricalTv: totalVariation(p, specEmpirical),
      targetEmpirical: targetEmpirical,
      targetEmpiricalTv: totalVariation(p, targetEmpirical),
      wrongEmpirical: wrongEmpirical,
      wrongEmpiricalTv: totalVariation(p, wrongEmpirical)
    };
  }

  function speedCurve(alpha, draftCost) {
    var rows = [];
    for (var gamma = 1; gamma <= 12; gamma += 1) {
      rows.push({
        gamma: gamma,
        speedup: speedupFrom(alpha, gamma, draftCost)
      });
    }
    return rows;
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var model = makeModel(params);
    var state = 0;
    var contract = oneStepContract(model.target[state], model.draft[state]);
    var alpha = averageAlpha(model);
    var draftCost = params.draftCost / 100;
    var trace = sampleSpeculativeSequence(model, params);
    return {
      contract: contract,
      curve: speedCurve(alpha, draftCost),
      model: model,
      params: params,
      samples: sampleOneStepCounts(model, 6000, params.seed * 97 + params.gamma),
      state: state,
      summaryAlpha: alpha,
      theoreticalSpeedup: speedupFrom(alpha, params.gamma, draftCost),
      trace: trace
    };
  }

  function readState(container, previous) {
    var raw = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var display = {
      certainty: Math.round(params.certainty) + "%",
      draftCost: Math.round(params.draftCost) + "%",
      gamma: String(params.gamma),
      length: String(params.length),
      match: Math.round(params.match) + "%",
      seed: String(params.seed)
    };
    Object.keys(display).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = display[key];
      });
    });
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 680 ? 780 : 560;
    var ratio = root.devicePixelRatio || 1;
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, 13, COLORS.text, 750);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 42, 11, COLORS.muted, 550);
  }

  function drawDistribution(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "distribution contract", "target versus draft and corrected output");
    var p = result.model.target[result.state];
    var q = result.model.draft[result.state];
    var exact = result.contract.exactOutput;
    var left = x + 40;
    var right = x + w - 16;
    var top = y + 64;
    var bottom = y + h - 38;
    var barW = (right - left) / p.length;
    var maxP = Math.max.apply(null, p.concat(q));

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    for (var i = 0; i < p.length; i += 1) {
      var groupX = left + i * barW;
      var targetH = (bottom - top) * p[i] / maxP;
      var draftH = (bottom - top) * q[i] / maxP;
      var exactY = bottom - (bottom - top) * exact[i] / maxP;
      ctx.fillStyle = COLORS.target;
      ctx.fillRect(groupX + barW * 0.15, bottom - targetH, Math.max(2, barW * 0.28), targetH);
      ctx.fillStyle = COLORS.draft;
      ctx.fillRect(groupX + barW * 0.48, bottom - draftH, Math.max(2, barW * 0.28), draftH);
      ctx.strokeStyle = COLORS.exact;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(groupX + barW * 0.12, exactY);
      ctx.lineTo(groupX + barW * 0.82, exactY);
      ctx.stroke();
      drawText(ctx, result.model.vocab[i], groupX + barW * 0.48, bottom + 16, 10, COLORS.muted, 600, "center");
    }

    drawText(ctx, "target", left, y + h - 13, 10, COLORS.target, 750);
    drawText(ctx, "draft", left + 56, y + h - 13, 10, COLORS.draft, 750);
    drawText(ctx, "corrected", left + 104, y + h - 13, 10, COLORS.exact, 750);
  }

  function drawMassLedger(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "rejection mass", "accept overlap; resample only the missing target mass");
    var contract = result.contract;
    var p = result.model.target[result.state];
    var q = result.model.draft[result.state];
    var left = x + 22;
    var right = x + w - 22;
    var yBar = y + 72;
    var barH = 18;
    var cursor = left;
    var scale = right - left;

    for (var i = 0; i < p.length; i += 1) {
      var segment = contract.acceptanceByToken[i] * scale;
      ctx.fillStyle = i % 2 ? "#14b8a6" : COLORS.target;
      ctx.fillRect(cursor, yBar, segment, barH);
      cursor += segment;
    }
    ctx.fillStyle = COLORS.wrong;
    ctx.fillRect(cursor, yBar, Math.max(0, right - cursor), barH);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, yBar, scale, barH);

    drawText(ctx, "accepted draft mass " + formatPercent(contract.alpha, 1), left, yBar - 12, 11, COLORS.target, 750);
    drawText(ctx, "residual " + formatPercent(contract.rejection, 1), right, yBar - 12, 11, COLORS.wrong, 750, "right");

    var top = y + 124;
    var bottom = y + h - 26;
    var rowH = (bottom - top) / p.length;
    for (i = 0; i < p.length; i += 1) {
      var yy = top + i * rowH;
      var missing = Math.max(0, p[i] - q[i]);
      var surplus = Math.max(0, q[i] - p[i]);
      drawText(ctx, result.model.vocab[i], left, yy + 10, 10, COLORS.muted, 650);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left + 50, yy, right - left - 50, 8);
      ctx.fillStyle = missing > 0 ? COLORS.exact : COLORS.draft;
      ctx.fillRect(left + 50, yy, (right - left - 50) * Math.max(missing, surplus) / 0.24, 8);
    }
    drawText(ctx, "blue = target mass draft undershot; orange = draft surplus", left, bottom + 6, 10, COLORS.muted, 550);
  }

  function drawSpeedCurve(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "speed curve", "expected tokens per verifier call after draft cost");
    var rows = result.curve;
    var left = x + 42;
    var right = x + w - 18;
    var top = y + 62;
    var bottom = y + h - 38;
    var maxSpeed = Math.max(1.1, Math.max.apply(null, rows.map(function (row) { return row.speedup; })) * 1.08);

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right, top);
    ctx.stroke();

    var breakY = bottom - (bottom - top) / maxSpeed;
    ctx.strokeStyle = "#cbd5e1";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(left, breakY);
    ctx.lineTo(right, breakY);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "1x", left - 8, breakY + 3, 10, COLORS.muted, 600, "right");

    ctx.strokeStyle = COLORS.violet;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var xx = left + (right - left) * (row.gamma - 1) / 11;
      var yy = bottom - (bottom - top) * row.speedup / maxSpeed;
      if (index === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    rows.forEach(function (row) {
      var xx = left + (right - left) * (row.gamma - 1) / 11;
      var yy = bottom - (bottom - top) * row.speedup / maxSpeed;
      ctx.fillStyle = row.gamma === result.params.gamma ? COLORS.wrong : COLORS.violet;
      ctx.beginPath();
      ctx.arc(xx, yy, row.gamma === result.params.gamma ? 5 : 3, 0, 2 * Math.PI);
      ctx.fill();
      if (row.gamma % 2 === 0 || row.gamma === 1) drawText(ctx, String(row.gamma), xx, bottom + 17, 10, COLORS.muted, 600, "center");
    });

    drawText(ctx, "gamma", (left + right) / 2, y + h - 10, 10, COLORS.muted, 650, "center");
    drawText(ctx, "empirical " + formatNumber(result.trace.speedup, 2) + "x", right, top - 10, 11, COLORS.wrong, 750, "right");
  }

  function drawTrace(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "one generated trace", "green accepted draft, red rejection, blue target bonus");
    var events = result.trace.events.slice(0, 72);
    var left = x + 18;
    var top = y + 62;
    var boxW = Math.max(34, Math.min(52, (w - 36) / 8));
    var boxH = 24;
    var gap = 6;
    var columns = Math.max(4, Math.floor((w - 36) / (boxW + gap)));

    events.forEach(function (event, index) {
      var col = index % columns;
      var row = Math.floor(index / columns);
      var xx = left + col * (boxW + gap);
      var yy = top + row * (boxH + gap);
      if (yy + boxH > y + h - 32) return;
      ctx.fillStyle = event.kind === "accept" ? "#d1fae5" : event.kind === "bonus" ? "#dbeafe" : "#fee2e2";
      ctx.strokeStyle = event.kind === "accept" ? COLORS.target : event.kind === "bonus" ? COLORS.exact : COLORS.wrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(xx, yy, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();
      drawText(ctx, result.model.vocab[event.token], xx + boxW / 2, yy + 16, 11, COLORS.text, 750, "center");
    });

    drawText(
      ctx,
      result.trace.targetCalls + " verifier calls; " + result.trace.acceptedDraft + " accepted draft tokens; " + result.trace.rejectedDraft + " rejections",
      left,
      y + h - 12,
      10,
      COLORS.muted,
      650
    );
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 14;
    var gap = 14;

    if (width < 680) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawDistribution(ctx, result, pad, pad, width - pad * 2, panelH);
      drawMassLedger(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawSpeedCurve(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawTrace(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }

    var halfW = (width - pad * 2 - gap) / 2;
    var halfH = (height - pad * 2 - gap) / 2;
    drawDistribution(ctx, result, pad, pad, halfW, halfH);
    drawMassLedger(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawSpeedCurve(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawTrace(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function updateMetrics(metrics, result) {
    metrics.innerHTML = [
      metric("acceptance mass", formatPercent(result.contract.alpha, 1)),
      metric("draft TV bias", formatNumber(result.contract.draftTv, 3)),
      metric("corrected TV", formatNumber(result.contract.exactTv, 3)),
      metric("wrong fallback TV", formatNumber(result.contract.wrongTv, 3)),
      metric("tokens / verifier", formatNumber(result.trace.tokensPerTargetCall, 2)),
      metric("estimated speedup", formatNumber(result.theoreticalSpeedup, 2) + "x"),
      metric("empirical speedup", formatNumber(result.trace.speedup, 2) + "x"),
      metric("target calls saved", String(result.params.length - result.trace.targetCalls))
    ].join("");
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function legacyFormatMs(value) {
    if (value >= 100) return value.toFixed(0) + " ms";
    return value.toFixed(1) + " ms";
  }

  function legacyExpectedAccepted(probability, lookahead) {
    var total = 0;
    var power = probability;
    for (var i = 1; i <= lookahead; i += 1) {
      total += power;
      power *= probability;
    }
    return total;
  }

  function legacyEvaluate(params, overrideLookahead, overrideAcceptance) {
    var lookahead = overrideLookahead || params.lookahead;
    var probability = typeof overrideAcceptance === "number" ? overrideAcceptance : params.acceptance / 100;
    var accepted = legacyExpectedAccepted(probability, lookahead);
    var outputTokens = 1 + accepted;
    var targetMs = params.targetMs;
    var draftMs = lookahead * targetMs * params.draftCost / 100;
    var verifyMs = targetMs * (1 + (lookahead - 1) * params.verifyTax / 100);
    var cycleMs = draftMs + verifyMs + params.overheadMs;
    var msPerToken = cycleMs / outputTokens;
    var speedup = targetMs / msPerToken;
    var wastedDrafts = Math.max(0, lookahead - accepted);
    return {
      accepted: accepted,
      cycleMs: cycleMs,
      draftMs: draftMs,
      lookahead: lookahead,
      msPerToken: msPerToken,
      outputTokens: outputTokens,
      probability: probability,
      speedup: speedup,
      targetMs: targetMs,
      verifyMs: verifyMs,
      overheadMs: params.overheadMs,
      wastedDrafts: wastedDrafts
    };
  }

  function legacyBestLookahead(params) {
    var best = legacyEvaluate(params, 1);
    for (var lookahead = 2; lookahead <= 12; lookahead += 1) {
      var candidate = legacyEvaluate(params, lookahead);
      if (candidate.speedup > best.speedup) best = candidate;
    }
    return best;
  }

  function legacyParams(container) {
    var params = {
      acceptance: 78,
      draftCost: 12,
      lookahead: 5,
      overheadMs: 1,
      targetMs: 42,
      verifyTax: 3
    };
    container.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    params.acceptance = clamp(params.acceptance, 0, 100);
    params.draftCost = clamp(params.draftCost, 0, 100);
    params.lookahead = clamp(Math.round(params.lookahead), 1, 12);
    params.overheadMs = clamp(params.overheadMs, 0, 50);
    params.targetMs = clamp(params.targetMs, 1, 200);
    params.verifyTax = clamp(params.verifyTax, 0, 100);
    return params;
  }

  function legacyUpdateOutputs(container, params) {
    var outputs = {
      acceptance: params.acceptance + "%",
      draftCost: params.draftCost + "%",
      lookahead: String(params.lookahead),
      overheadMs: params.overheadMs + " ms",
      targetMs: params.targetMs + " ms",
      verifyTax: params.verifyTax + "%"
    };
    Object.keys(outputs).forEach(function (key) {
      var output = container.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = outputs[key];
    });
  }

  function legacySpeedColor(speedup) {
    if (speedup < 1) return COLORS.wrong;
    if (speedup > 2.5) return COLORS.target;
    return COLORS.exact;
  }

  function legacyDraw(canvas, params, result, best) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 18;
    var left = pad + 38;
    var right = width - pad;
    var top = pad + 34;
    var heatHeight = Math.min(230, height * 0.42);
    var rows = 9;
    var cols = 12;
    var cellW = (right - left) / cols;
    var cellH = heatHeight / rows;
    var minP = 0.2;
    var maxP = 1.0;

    drawText(ctx, "Speedup by lookahead and acceptance", left, pad + 12, 13, COLORS.text, 750);
    for (var row = 0; row < rows; row += 1) {
      var probability = maxP - row * (maxP - minP) / (rows - 1);
      for (var col = 0; col < cols; col += 1) {
        var lookahead = col + 1;
        var candidate = legacyEvaluate(params, lookahead, probability);
        var xx = left + col * cellW;
        var yy = top + row * cellH;
        ctx.fillStyle = legacySpeedColor(candidate.speedup);
        ctx.globalAlpha = clamp(0.2 + candidate.speedup / 3.2, 0.2, 0.95);
        ctx.fillRect(xx, yy, Math.ceil(cellW), Math.ceil(cellH));
        ctx.globalAlpha = 1;
        if (cellW > 28 && row % 2 === 0 && col % 2 === 1) {
          drawText(ctx, formatNumber(candidate.speedup, 1), xx + cellW / 2, yy + cellH / 2 + 4, 10, "#ffffff", 700, "center");
        }
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, right - left, heatHeight);
    var selectedCol = params.lookahead - 1;
    var selectedRow = Math.round((maxP - params.acceptance / 100) / ((maxP - minP) / (rows - 1)));
    selectedRow = clamp(selectedRow, 0, rows - 1);
    ctx.strokeStyle = COLORS.violet;
    ctx.lineWidth = 3;
    ctx.strokeRect(left + selectedCol * cellW + 1.5, top + selectedRow * cellH + 1.5, cellW - 3, cellH - 3);
    ctx.lineWidth = 1;

    for (var tick = 1; tick <= cols; tick += width < 560 ? 2 : 1) {
      drawText(ctx, String(tick), left + (tick - 0.5) * cellW, top + heatHeight + 18, 10, COLORS.muted, 600, "center");
    }
    drawText(ctx, "acceptance", left - 8, top + 4, 10, COLORS.muted, 650, "right");
    drawText(ctx, "lookahead tokens", (left + right) / 2, top + heatHeight + 38, 10, COLORS.muted, 650, "center");

    var ledgerTop = top + heatHeight + 74;
    var ledgerW = right - left;
    drawText(ctx, "Selected cycle ledger", left, ledgerTop - 18, 13, COLORS.text, 750);
    var parts = [
      { color: COLORS.draft, label: "draft", value: result.draftMs },
      { color: COLORS.target, label: "verify", value: result.verifyMs },
      { color: COLORS.gray, label: "overhead", value: result.overheadMs }
    ];
    var total = Math.max(1e-9, result.cycleMs);
    var cursor = left;
    for (var i = 0; i < parts.length; i += 1) {
      var partW = ledgerW * parts[i].value / total;
      ctx.fillStyle = parts[i].color;
      ctx.fillRect(cursor, ledgerTop, partW, 26);
      if (partW > 46) drawText(ctx, parts[i].label, cursor + partW / 2, ledgerTop + 17, 10, "#ffffff", 750, "center");
      cursor += partW;
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, ledgerTop, ledgerW, 26);
    drawText(ctx, legacyFormatMs(result.cycleMs), right, ledgerTop - 8, 11, COLORS.text, 700, "right");

    var tokenTop = ledgerTop + 68;
    var acceptedW = ledgerW * result.accepted / Math.max(1, result.outputTokens + result.wastedDrafts);
    var correctionW = ledgerW * 1 / Math.max(1, result.outputTokens + result.wastedDrafts);
    ctx.fillStyle = COLORS.target;
    ctx.fillRect(left, tokenTop, acceptedW, 26);
    ctx.fillStyle = COLORS.violet;
    ctx.fillRect(left + acceptedW, tokenTop, correctionW, 26);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(left + acceptedW + correctionW, tokenTop, Math.max(0, ledgerW - acceptedW - correctionW), 26);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, tokenTop, ledgerW, 26);
    drawText(ctx, "best static lookahead: " + best.lookahead + " (" + formatNumber(best.speedup, 2) + "x)", left, height - 18, 11, COLORS.text, 700);
  }

  function legacyRender(container) {
    var params = legacyParams(container);
    legacyUpdateOutputs(container, params);
    var result = legacyEvaluate(params);
    var best = legacyBestLookahead(params);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Latency speedup", formatNumber(result.speedup, 2) + "x"),
        metric("Expected tokens/call", formatNumber(result.outputTokens, 2)),
        metric("Accepted draft tokens", formatNumber(result.accepted, 2)),
        metric("Wasted draft tokens", formatNumber(result.wastedDrafts, 2)),
        metric("Milliseconds/token", legacyFormatMs(result.msPerToken)),
        metric("Best static lookahead", String(best.lookahead))
      ].join("");
    }
    legacyDraw(container.querySelector("canvas[data-canvas]"), params, result, best);
  }

  function initLegacyOne(container) {
    var timer = null;
    function render() {
      clearTimeout(timer);
      timer = setTimeout(function () { legacyRender(container); }, 20);
    }
    container.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });
    root.addEventListener("resize", render);
    legacyRender(container);
  }

  function init() {
    var labs = document.querySelectorAll("[data-speculative-decoding-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
    var legacyLabs = document.querySelectorAll("[data-spec-lab]");
    for (var j = 0; j < legacyLabs.length; j += 1) initLegacyOne(legacyLabs[j]);
  }

  var api = {
    averageAlpha: averageAlpha,
    cleanParams: cleanParams,
    evaluate: evaluate,
    expectedTokens: expectedTokens,
    makeModel: makeModel,
    oneStepContract: oneStepContract,
    residualDistribution: residualDistribution,
    sampleSpeculativeSequence: sampleSpeculativeSequence,
    speedupFrom: speedupFrom,
    totalVariation: totalVariation
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SpeculativeDecodingLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
