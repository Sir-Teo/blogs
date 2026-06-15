(function (root) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    ev: "#2563eb",
    cpt: "#be123c",
    gain: "#0f766e",
    loss: "#b45309",
    neutral: "#94a3b8",
    weightGain: "#7c3aed",
    weightLoss: "#0891b2"
  };

  var DEFAULTS = {
    scenario: "lottery",
    probability: 1,
    gain: 200,
    loss: 2,
    alpha: 88,
    lambda: 225,
    gamma: 61,
    delta: 69
  };

  var SCENARIOS = ["lottery", "insurance", "mixed"];
  var AUDIT_CACHE = null;

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = SCENARIOS.indexOf(raw.scenario) >= 0 ? raw.scenario : DEFAULTS.scenario;
    return {
      scenario: scenario,
      probability: clamp(Math.round(finite(raw.probability == null ? DEFAULTS.probability : raw.probability, DEFAULTS.probability)), 1, 95),
      gain: clamp(Math.round(finite(raw.gain == null ? DEFAULTS.gain : raw.gain, DEFAULTS.gain)), 10, 1000),
      loss: clamp(Math.round(finite(raw.loss == null ? DEFAULTS.loss : raw.loss, DEFAULTS.loss)), 1, 1000),
      alpha: clamp(Math.round(finite(raw.alpha == null ? DEFAULTS.alpha : raw.alpha, DEFAULTS.alpha)), 50, 100) / 100,
      lambda: clamp(Math.round(finite(raw.lambda == null ? DEFAULTS.lambda : raw.lambda, DEFAULTS.lambda)), 100, 400) / 100,
      gamma: clamp(Math.round(finite(raw.gamma == null ? DEFAULTS.gamma : raw.gamma, DEFAULTS.gamma)), 35, 100) / 100,
      delta: clamp(Math.round(finite(raw.delta == null ? DEFAULTS.delta : raw.delta, DEFAULTS.delta)), 35, 100) / 100
    };
  }

  function tkWeight(p, curvature) {
    p = clamp(p, 0, 1);
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    if (Math.abs(curvature - 1) < 1e-12) return p;
    var pg = Math.pow(p, curvature);
    var qg = Math.pow(1 - p, curvature);
    return pg / Math.pow(pg + qg, 1 / curvature);
  }

  function valueOf(x, params) {
    if (x >= 0) return Math.pow(x, params.alpha);
    return -params.lambda * Math.pow(-x, params.alpha);
  }

  function inverseValue(v, params) {
    if (v >= 0) return Math.pow(v, 1 / params.alpha);
    return -Math.pow((-v) / params.lambda, 1 / params.alpha);
  }

  function scenarioSpec(params) {
    var p = params.probability / 100;
    if (params.scenario === "insurance") {
      return {
        title: "Insurance Quote",
        subtitle: "A small chance of a large loss can command a premium above actuarial value.",
        unit: "$",
        pLabel: "Loss chance",
        gainLabel: "Loss size",
        lossLabel: "Quoted premium",
        outcomes: [
          { x: -params.gain, p: p, label: "loss" },
          { x: 0, p: 1 - p, label: "no loss" }
        ],
        comparison: { x: -params.loss, label: "quoted premium" },
        mode: "pay"
      };
    }
    if (params.scenario === "mixed") {
      return {
        title: "Mixed Gamble",
        subtitle: "A positive expected value can still be rejected when losses loom larger.",
        unit: "$",
        pLabel: "Gain chance",
        gainLabel: "Gain",
        lossLabel: "Loss",
        outcomes: [
          { x: params.gain, p: p, label: "gain" },
          { x: -params.loss, p: 1 - p, label: "loss" }
        ],
        comparison: { x: 0, label: "walk away" },
        mode: "accept"
      };
    }
    return {
      title: "Lottery Ticket",
      subtitle: "The expected value can be near zero while the weighted tail makes the ticket feel positive.",
      unit: "$",
      pLabel: "Jackpot chance",
      gainLabel: "Jackpot",
      lossLabel: "Ticket price",
      outcomes: [
        { x: params.gain - params.loss, p: p, label: "jackpot net" },
        { x: -params.loss, p: 1 - p, label: "miss" }
      ],
      comparison: { x: 0, label: "do not buy" },
      mode: "accept"
    };
  }

  function normalize(outcomes) {
    var total = outcomes.reduce(function (sum, row) { return sum + row.p; }, 0);
    return outcomes.map(function (row) {
      return { x: row.x, p: total <= 0 ? 0 : row.p / total, label: row.label };
    });
  }

  function expectedValue(outcomes) {
    return outcomes.reduce(function (sum, row) { return sum + row.x * row.p; }, 0);
  }

  function decisionWeights(outcomes, params) {
    var rows = normalize(outcomes);
    var gains = rows.filter(function (row) { return row.x > 0 && row.p > 0; }).sort(function (a, b) { return b.x - a.x; });
    var losses = rows.filter(function (row) { return row.x < 0 && row.p > 0; }).sort(function (a, b) { return a.x - b.x; });
    var weighted = [];
    var cum = 0;
    for (var i = 0; i < gains.length; i += 1) {
      var next = cum + gains[i].p;
      weighted.push({
        x: gains[i].x,
        p: gains[i].p,
        label: gains[i].label,
        side: "gain",
        pi: tkWeight(next, params.gamma) - tkWeight(cum, params.gamma),
        v: valueOf(gains[i].x, params)
      });
      cum = next;
    }
    cum = 0;
    for (var j = 0; j < losses.length; j += 1) {
      var nextLoss = cum + losses[j].p;
      weighted.push({
        x: losses[j].x,
        p: losses[j].p,
        label: losses[j].label,
        side: "loss",
        pi: tkWeight(nextLoss, params.delta) - tkWeight(cum, params.delta),
        v: valueOf(losses[j].x, params)
      });
      cum = nextLoss;
    }
    return weighted;
  }

  function cptValue(outcomes, params) {
    return decisionWeights(outcomes, params).reduce(function (sum, row) {
      return sum + row.pi * row.v;
    }, 0);
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var spec = scenarioSpec(params);
    var outcomes = normalize(spec.outcomes);
    var ev = expectedValue(outcomes);
    var weights = decisionWeights(outcomes, params);
    var cpt = cptValue(outcomes, params);
    var ce = inverseValue(cpt, params);
    var comparisonValue = valueOf(spec.comparison.x, params);
    var cptBetter = spec.mode === "pay" ? comparisonValue >= cpt : cpt >= comparisonValue;
    var evBetter = spec.mode === "pay" ? spec.comparison.x >= ev : ev >= spec.comparison.x;
    var p = params.probability / 100;
    var gainWeight = tkWeight(p, params.gamma);
    var lossWeight = tkWeight(p, params.delta);
    var tailMultiplierGain = p <= 0 ? 0 : gainWeight / p;
    var tailMultiplierLoss = p <= 0 ? 0 : lossWeight / p;
    var maxPremium = spec.mode === "pay" ? Math.max(0, -ce) : null;
    return {
      params: params,
      spec: spec,
      outcomes: outcomes,
      weights: weights,
      expectedValue: ev,
      cptValue: cpt,
      certaintyEquivalent: ce,
      comparisonValue: comparisonValue,
      cptBetter: cptBetter,
      evBetter: evBetter,
      maxPremium: maxPremium,
      tailWeights: {
        p: p,
        gainWeight: gainWeight,
        lossWeight: lossWeight,
        tailMultiplierGain: tailMultiplierGain,
        tailMultiplierLoss: tailMultiplierLoss
      }
    };
  }

  function round(value, places) {
    var scale = Math.pow(10, places == null ? 2 : places);
    var out = Math.round(value * scale) / scale;
    return Object.is(out, -0) ? 0 : out;
  }

  function roundedFacts(result) {
    return {
      scenario: result.params.scenario,
      expectedValue: round(result.expectedValue, 2),
      certaintyEquivalent: round(result.certaintyEquivalent, 2),
      cptValue: round(result.cptValue, 3),
      decision: result.cptBetter ? "accept" : "reject",
      evDecision: result.evBetter ? "accept" : "reject",
      maxPremium: result.maxPremium == null ? null : round(result.maxPremium, 2),
      gainTailWeight: round(result.tailWeights.gainWeight, 4),
      lossTailWeight: round(result.tailWeights.lossWeight, 4),
      gainTailMultiplier: round(result.tailWeights.tailMultiplierGain, 2),
      lossTailMultiplier: round(result.tailWeights.tailMultiplierLoss, 2)
    };
  }

  function nearly(a, b, eps) {
    return Math.abs(a - b) <= (eps || 1e-9);
  }

  function runAudit() {
    if (AUDIT_CACHE) return AUDIT_CACHE;
    var failures = [];
    function record(name, ok) {
      if (!ok) failures.push(name);
    }

    var neutralMixed = evaluate({
      scenario: "mixed",
      probability: 37,
      gain: 140,
      loss: 50,
      alpha: 100,
      lambda: 100,
      gamma: 100,
      delta: 100
    });
    record("neutral model equals expected value", nearly(neutralMixed.certaintyEquivalent, neutralMixed.expectedValue, 1e-9));
    record("neutral cpt value equals expected value", nearly(neutralMixed.cptValue, neutralMixed.expectedValue, 1e-9));

    var lottery = evaluate({});
    record("default lottery is near fair by expected value", Math.abs(lottery.expectedValue) < 1e-9);
    record("default lottery has positive prospect CE", lottery.certaintyEquivalent > 0);
    record("default lottery overweights small gain tail", lottery.tailWeights.gainWeight > lottery.tailWeights.p);
    record("default lottery cpt accepts while ev is indifferent or accept", lottery.cptBetter && lottery.evBetter);

    var insurance = evaluate({ scenario: "insurance", probability: 1, gain: 200, loss: 2 });
    record("insurance expected loss is actuarial two dollars", nearly(insurance.expectedValue, -2, 1e-9));
    record("insurance max premium exceeds expected loss", insurance.maxPremium > -insurance.expectedValue);
    record("insurance two dollar quote accepted by cpt", insurance.cptBetter);

    var mixed = evaluate({ scenario: "mixed", probability: 50, gain: 100, loss: 60 });
    record("mixed gamble has positive expected value", mixed.expectedValue > 0);
    record("mixed gamble rejected under default loss aversion", !mixed.cptBetter);

    var noLossAversion = evaluate({ scenario: "mixed", probability: 50, gain: 100, loss: 60, lambda: 100 });
    record("lower loss aversion can accept mixed gamble", noLossAversion.cptBetter);

    var bad = evaluate({ scenario: "bogus", probability: -10, gain: "x", loss: Infinity, alpha: -1 });
    record("bad inputs sanitize", bad.params.scenario === "lottery" && bad.params.probability === 1 && bad.params.gain === DEFAULTS.gain);

    var probs = normalize([{ x: 1, p: 0.2 }, { x: 2, p: 0.3 }, { x: -1, p: 0.5 }]);
    record("normalization sums to one", nearly(probs.reduce(function (s, row) { return s + row.p; }, 0), 1, 1e-12));
    record("weights are nonnegative", lottery.weights.every(function (row) { return row.pi >= -1e-12; }));
    record("certainty equivalent is inverse value", nearly(valueOf(lottery.certaintyEquivalent, lottery.params), lottery.cptValue, 1e-8));

    AUDIT_CACHE = {
      passed: 15 - failures.length,
      checked: 15,
      failures: failures,
      defaultFacts: roundedFacts(lottery)
    };
    return AUDIT_CACHE;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[ch];
    });
  }

  function money(value) {
    var sign = value < 0 ? "-" : "";
    return sign + "$" + Math.abs(value).toFixed(Math.abs(value) >= 100 ? 0 : 2);
  }

  function metric(label, value) {
    return '<div class="prospect-lab__metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function option(value, label, selected) {
    return '<option value="' + escapeHtml(value) + '"' + (selected ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }

  function range(label, role, min, max, step, value, suffix) {
    return [
      '<label>',
      '<span>' + escapeHtml(label) + ' <output data-out="' + escapeHtml(role) + '">' + escapeHtml(value + suffix) + '</output></span>',
      '<input type="range" data-role="' + escapeHtml(role) + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + escapeHtml(value) + '">',
      '</label>'
    ].join("");
  }

  function mount(el) {
    var state = cleanParams({
      scenario: el.getAttribute("data-scenario") || DEFAULTS.scenario,
      probability: el.getAttribute("data-probability") || DEFAULTS.probability,
      gain: el.getAttribute("data-gain") || DEFAULTS.gain,
      loss: el.getAttribute("data-loss") || DEFAULTS.loss
    });

    el.innerHTML = [
      '<div class="prospect-lab__controls">',
      '<label><span>Case file</span><select data-role="scenario">',
      option("lottery", "Lottery ticket", state.scenario === "lottery"),
      option("insurance", "Insurance quote", state.scenario === "insurance"),
      option("mixed", "Mixed gamble", state.scenario === "mixed"),
      '</select></label>',
      range("Probability", "probability", 1, 95, 1, state.probability, "%"),
      range("Gain / loss size", "gain", 10, 1000, 10, state.gain, ""),
      range("Cost / loss", "loss", 1, 1000, 1, state.loss, ""),
      range("Curvature alpha", "alpha", 50, 100, 1, Math.round(state.alpha * 100), "%"),
      range("Loss aversion", "lambda", 100, 400, 5, Math.round(state.lambda * 100), "%"),
      range("Gain weighting", "gamma", 35, 100, 1, Math.round(state.gamma * 100), "%"),
      range("Loss weighting", "delta", 35, 100, 1, Math.round(state.delta * 100), "%"),
      '</div>',
      '<div class="prospect-lab__summary" data-role="summary"></div>',
      '<canvas class="prospect-lab__canvas" data-role="canvas" aria-label="Cumulative prospect theory visualization"></canvas>',
      '<div class="prospect-lab__legend" data-role="legend"></div>'
    ].join("");

    var inputs = Array.from(el.querySelectorAll("[data-role]"));

    function read() {
      state = cleanParams({
        scenario: el.querySelector('[data-role="scenario"]').value,
        probability: el.querySelector('[data-role="probability"]').value,
        gain: el.querySelector('[data-role="gain"]').value,
        loss: el.querySelector('[data-role="loss"]').value,
        alpha: el.querySelector('[data-role="alpha"]').value,
        lambda: el.querySelector('[data-role="lambda"]').value,
        gamma: el.querySelector('[data-role="gamma"]').value,
        delta: el.querySelector('[data-role="delta"]').value
      });
    }

    function updateOutputs() {
      var result = evaluate(state);
      var labelMap = {
        probability: result.spec.pLabel,
        gain: result.spec.gainLabel,
        loss: result.spec.lossLabel
      };
      Array.from(el.querySelectorAll(".prospect-lab__controls label")).forEach(function (labelEl) {
        var input = labelEl.querySelector("[data-role]");
        if (!input || !labelMap[input.getAttribute("data-role")]) return;
        labelEl.querySelector("span").firstChild.nodeValue = labelMap[input.getAttribute("data-role")] + " ";
      });
      setOutput(el, "probability", state.probability + "%");
      setOutput(el, "gain", String(state.gain));
      setOutput(el, "loss", String(state.loss));
      setOutput(el, "alpha", Math.round(state.alpha * 100) + "%");
      setOutput(el, "lambda", Math.round(state.lambda * 100) + "%");
      setOutput(el, "gamma", Math.round(state.gamma * 100) + "%");
      setOutput(el, "delta", Math.round(state.delta * 100) + "%");
    }

    function update() {
      read();
      updateOutputs();
      var result = evaluate(state);
      renderSummary(el.querySelector('[data-role="summary"]'), result);
      renderLegend(el.querySelector('[data-role="legend"]'), result);
      renderCanvas(el.querySelector('[data-role="canvas"]'), result);
    }

    inputs.forEach(function (input) {
      input.addEventListener(input.tagName === "SELECT" ? "change" : "input", update);
    });
    window.addEventListener("resize", update);
    update();
  }

  function setOutput(rootEl, role, text) {
    var out = rootEl.querySelector('[data-out="' + role + '"]');
    if (out) out.textContent = text;
  }

  function renderSummary(target, result) {
    var facts = roundedFacts(result);
    var decision = result.spec.mode === "pay"
      ? (result.cptBetter ? "pay quote" : "skip quote")
      : (result.cptBetter ? "take gamble" : "walk away");
    var maxPremiumText = result.maxPremium == null ? money(result.certaintyEquivalent) : money(result.maxPremium);
    var maxLabel = result.maxPremium == null ? "CPT CE" : "Max premium";
    target.innerHTML = [
      '<div class="prospect-lab__case"><strong>' + escapeHtml(result.spec.title) + '</strong><span>' + escapeHtml(result.spec.subtitle) + '</span></div>',
      '<div class="prospect-lab__metrics">',
      metric("EV", money(facts.expectedValue)),
      metric(maxLabel, maxPremiumText),
      metric("CPT CE", money(facts.certaintyEquivalent)),
      metric("Tail w+ / p", facts.gainTailMultiplier + "x"),
      metric("Tail w- / p", facts.lossTailMultiplier + "x"),
      metric("Choice", decision),
      '</div>'
    ].join("");
  }

  function renderLegend(target, result) {
    var audit = runAudit();
    target.innerHTML = [
      '<span><i class="is-ev"></i> expected value</span>',
      '<span><i class="is-cpt"></i> prospect certainty equivalent</span>',
      '<span><i class="is-gain"></i> gain value / weight</span>',
      '<span><i class="is-loss"></i> loss value / weight</span>',
      '<span>Audit ' + audit.passed + '/' + audit.checked + '</span>',
      '<span>' + escapeHtml(result.cptBetter === result.evBetter ? "EV and CPT agree" : "EV and CPT disagree") + '</span>'
    ].join("");
  }

  function resizeCanvas(canvas, cssHeight) {
    var dpr = window.devicePixelRatio || 1;
    var width = Math.max(320, Math.floor(canvas.getBoundingClientRect().width || canvas.parentNode.clientWidth || 640));
    var height = cssHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    drawRoundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText(title, x + 12, y + 19);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(subtitle, x + 12, y + 36);
    }
  }

  function drawAxes(ctx, x, y, w, h) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  }

  function drawValueFunction(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Value around the reference point", "steeper below zero when loss aversion is high");
    var px = x + 36;
    var py = y + 48;
    var pw = w - 54;
    var ph = h - 70;
    var maxDollar = Math.max(result.params.gain, result.params.loss, 100);
    var maxValue = Math.max(valueOf(maxDollar, result.params), -valueOf(-maxDollar, result.params));
    function sx(d) { return px + (d + maxDollar) / (2 * maxDollar) * pw; }
    function sy(v) { return py + ph - (v + maxValue) / (2 * maxValue) * ph; }
    drawAxes(ctx, px, py, pw, ph);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(sx(0), py);
    ctx.lineTo(sx(0), py + ph);
    ctx.moveTo(px, sy(0));
    ctx.lineTo(px + pw, sy(0));
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.cpt;
    ctx.beginPath();
    for (var i = 0; i <= 160; i += 1) {
      var d = -maxDollar + 2 * maxDollar * i / 160;
      var vx = valueOf(d, result.params);
      if (i === 0) ctx.moveTo(sx(d), sy(vx));
      else ctx.lineTo(sx(d), sy(vx));
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("-" + maxDollar, px - 4, py + ph + 15);
    ctx.fillText("0", sx(0) - 3, py + ph + 15);
    ctx.fillText("+" + maxDollar, px + pw - 32, py + ph + 15);
  }

  function drawWeighting(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Probability weighting", "small tails can receive more decision weight");
    var px = x + 36;
    var py = y + 48;
    var pw = w - 54;
    var ph = h - 70;
    function sx(p) { return px + p * pw; }
    function sy(v) { return py + ph - v * ph; }
    drawAxes(ctx, px, py, pw, ph);
    ctx.strokeStyle = COLORS.neutral;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(0), sy(0));
    ctx.lineTo(sx(1), sy(1));
    ctx.stroke();
    ctx.setLineDash([]);
    function curve(color, curvature) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i = 0; i <= 100; i += 1) {
        var p = i / 100;
        var wp = tkWeight(p, curvature);
        if (i === 0) ctx.moveTo(sx(p), sy(wp));
        else ctx.lineTo(sx(p), sy(wp));
      }
      ctx.stroke();
    }
    curve(COLORS.weightGain, result.params.gamma);
    curve(COLORS.weightLoss, result.params.delta);
    var p0 = result.tailWeights.p;
    ctx.fillStyle = COLORS.weightGain;
    ctx.beginPath();
    ctx.arc(sx(p0), sy(result.tailWeights.gainWeight), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.weightLoss;
    ctx.beginPath();
    ctx.arc(sx(p0), sy(result.tailWeights.lossWeight), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("p=" + Math.round(p0 * 100) + "%", sx(p0) + 6, sy(result.tailWeights.gainWeight) - 6);
  }

  function drawOutcomeBars(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Outcomes and decision weights", "bar width is probability; color intensity is CPT decision weight");
    var px = x + 18;
    var py = y + 48;
    var pw = w - 36;
    var rowH = 34;
    var map = {};
    result.weights.forEach(function (row) { map[row.x + "|" + row.label] = row; });
    for (var i = 0; i < result.outcomes.length; i += 1) {
      var row = result.outcomes[i];
      var key = row.x + "|" + row.label;
      var weighted = map[key];
      var bw = Math.max(3, row.p * pw);
      var by = py + i * (rowH + 10);
      ctx.fillStyle = row.x >= 0 ? COLORS.gain : COLORS.loss;
      ctx.globalAlpha = weighted ? clamp(0.18 + weighted.pi, 0.22, 1) : 0.18;
      drawRoundRect(ctx, px, by, bw, rowH, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.ink;
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.fillText(row.label + " " + money(row.x), px + 8, by + 14);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, sans-serif";
      var text = "p=" + Math.round(row.p * 1000) / 10 + "%";
      if (weighted) text += ", pi=" + weighted.pi.toFixed(3);
      ctx.fillText(text, px + 8, by + 29);
    }
  }

  function drawComparison(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Two ledgers for the same gamble", "expected dollars versus prospect-theory certainty equivalent");
    var px = x + 34;
    var py = y + 58;
    var pw = w - 68;
    var zero = px + pw / 2;
    var maxAbs = Math.max(Math.abs(result.expectedValue), Math.abs(result.certaintyEquivalent), Math.abs(result.spec.comparison.x), 1);
    function sx(v) { return zero + v / maxAbs * (pw / 2); }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(zero, py - 10);
    ctx.lineTo(zero, py + 86);
    ctx.stroke();
    drawLedgerBar(ctx, "EV", result.expectedValue, COLORS.ev, px, sx, py, zero);
    drawLedgerBar(ctx, "CPT CE", result.certaintyEquivalent, COLORS.cpt, px, sx, py + 44, zero);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("comparison: " + result.spec.comparison.label + " " + money(result.spec.comparison.x), px, py + 112);
  }

  function drawLedgerBar(ctx, label, value, color, px, sx, y, zero) {
    var x1 = sx(value);
    var left = Math.min(zero, x1);
    var width = Math.max(2, Math.abs(x1 - zero));
    ctx.fillStyle = color;
    drawRoundRect(ctx, left, y, width, 24, 6);
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText(label, px, y - 6);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(money(value), x1 + (value >= 0 ? 6 : -54), y + 16);
  }

  function renderCanvas(canvas, result) {
    var box = resizeCanvas(canvas, 720);
    var ctx = box.ctx;
    var w = box.width;
    ctx.clearRect(0, 0, box.width, box.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, box.width, box.height);

    var pad = 14;
    var gap = 12;
    var twoCol = w >= 620;
    if (twoCol) {
      var col = (w - pad * 2 - gap) / 2;
      drawValueFunction(ctx, result, pad, 16, col, 210);
      drawWeighting(ctx, result, pad + col + gap, 16, col, 210);
      drawOutcomeBars(ctx, result, pad, 238, col, 210);
      drawComparison(ctx, result, pad + col + gap, 238, col, 210);
      drawStory(ctx, result, pad, 466, w - pad * 2, 220);
    } else {
      drawValueFunction(ctx, result, pad, 16, w - pad * 2, 160);
      drawWeighting(ctx, result, pad, 188, w - pad * 2, 160);
      drawOutcomeBars(ctx, result, pad, 360, w - pad * 2, 150);
      drawComparison(ctx, result, pad, 522, w - pad * 2, 160);
    }
  }

  function drawStory(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Reading this case", "the model is descriptive, not a welfare theorem");
    var facts = roundedFacts(result);
    var lines = [
      "Expected value: " + money(facts.expectedValue) + ". Prospect certainty equivalent: " + money(facts.certaintyEquivalent) + ".",
      "A " + result.params.probability + "% gain tail receives decision weight " + facts.gainTailWeight + ", or " + facts.gainTailMultiplier + "x its probability.",
      "A same-sized loss tail receives decision weight " + facts.lossTailWeight + ", or " + facts.lossTailMultiplier + "x its probability.",
      "Loss aversion is " + result.params.lambda.toFixed(2) + " and curvature alpha is " + result.params.alpha.toFixed(2) + "."
    ];
    ctx.fillStyle = COLORS.ink;
    ctx.font = "12px system-ui, sans-serif";
    for (var i = 0; i < lines.length; i += 1) {
      wrapText(ctx, lines[i], x + 14, y + 54 + i * 38, w - 28, 16, 2);
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = text.split(/\s+/);
    var line = "";
    var lines = 0;
    for (var i = 0; i < words.length; i += 1) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        lines += 1;
        line = words[i];
        if (lines >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y);
  }

  function init() {
    var nodes = document.querySelectorAll("[data-prospect-lab]");
    for (var i = 0; i < nodes.length; i += 1) mount(nodes[i]);
  }

  var api = {
    evaluate: evaluate,
    runAudit: runAudit,
    roundedFacts: roundedFacts,
    valueOf: valueOf,
    inverseValue: inverseValue,
    tkWeight: tkWeight,
    decisionWeights: decisionWeights
  };

  root.ProspectTheoryLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
