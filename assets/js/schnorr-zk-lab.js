(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    prover: "#0f766e",
    verifier: "#2563eb",
    simulator: "#7c3aed",
    extractor: "#d97706",
    bad: "#be123c",
    slate: "#64748b"
  };

  var P = 1019n;
  var Q = 509n;
  var G = 4n;

  var DEFAULTS = {
    challenge: 5,
    challengeBits: 3,
    nonce: 123,
    repetitions: 4,
    secret: 137,
    seed: 29
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mod(value, modulus) {
    var out = value % modulus;
    return out < 0n ? out + modulus : out;
  }

  function modPow(base, exponent, modulus) {
    var result = 1n;
    var b = mod(base, modulus);
    var e = exponent;
    while (e > 0n) {
      if (e & 1n) result = (result * b) % modulus;
      b = (b * b) % modulus;
      e >>= 1n;
    }
    return result;
  }

  function egcd(a, b) {
    var oldR = a;
    var r = b;
    var oldS = 1n;
    var s = 0n;
    while (r !== 0n) {
      var q = oldR / r;
      var nextR = oldR - q * r;
      oldR = r;
      r = nextR;
      var nextS = oldS - q * s;
      oldS = s;
      s = nextS;
    }
    return { gcd: oldR, x: oldS };
  }

  function inv(value, modulus) {
    var result = egcd(mod(value, modulus), modulus);
    if (result.gcd !== 1n) throw new Error("value is not invertible");
    return mod(result.x, modulus);
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cleanParams(raw) {
    raw = raw || {};
    var bits = clamp(Math.round(raw.challengeBits == null ? DEFAULTS.challengeBits : Number(raw.challengeBits)), 1, 7);
    var challengeSpace = Math.pow(2, bits);
    return {
      challenge: clamp(Math.round(raw.challenge == null ? DEFAULTS.challenge : Number(raw.challenge)), 0, 127) % challengeSpace,
      challengeBits: bits,
      challengeSpace: challengeSpace,
      nonce: clamp(Math.round(raw.nonce == null ? DEFAULTS.nonce : Number(raw.nonce)), 0, Number(Q - 1n)),
      repetitions: clamp(Math.round(raw.repetitions == null ? DEFAULTS.repetitions : Number(raw.repetitions)), 1, 10),
      secret: clamp(Math.round(raw.secret == null ? DEFAULTS.secret : Number(raw.secret)), 1, Number(Q - 1n)),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : Number(raw.seed)), 1, 999)
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (value > 0 && value < 0.0001) return value.toExponential(2);
    return (100 * value).toFixed(digits == null ? 2 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="schnorr-zk-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function publicKey(secret) {
    return modPow(G, BigInt(secret), P);
  }

  function honestTranscript(secret, nonce, challenge) {
    var x = BigInt(secret);
    var r = BigInt(nonce);
    var c = BigInt(challenge);
    var y = publicKey(secret);
    var commitment = modPow(G, r, P);
    var response = mod(r + c * x, Q);
    return {
      accepted: verifyTranscript(y, commitment, challenge, response),
      challenge: challenge,
      commitment: commitment,
      publicKey: y,
      response: response
    };
  }

  function verifyTranscript(y, commitment, challenge, response) {
    var left = modPow(G, BigInt(response), P);
    var right = (commitment * modPow(y, BigInt(challenge), P)) % P;
    return left === right;
  }

  function simulateTranscript(y, challenge, response) {
    var yc = modPow(y, BigInt(challenge), P);
    var commitment = (modPow(G, response, P) * inv(yc, P)) % P;
    return {
      accepted: verifyTranscript(y, commitment, challenge, response),
      challenge: challenge,
      commitment: commitment,
      publicKey: y,
      response: response
    };
  }

  function extractSecret(t1, c1, z1, t2, c2, z2) {
    if (t1 !== t2 || c1 === c2) return null;
    var numerator = mod(BigInt(z1) - BigInt(z2), Q);
    var denominator = mod(BigInt(c1) - BigInt(c2), Q);
    return mod(numerator * inv(denominator, Q), Q);
  }

  function chooseForkChallenge(params) {
    var step = 1 + (params.seed % Math.max(1, params.challengeSpace - 1));
    var c2 = (params.challenge + step) % params.challengeSpace;
    if (c2 === params.challenge) c2 = (c2 + 1) % params.challengeSpace;
    return c2;
  }

  function toyHash(text, modulus) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h = (h ^ (h >>> 16)) >>> 0;
    return h % modulus;
  }

  function fiatShamirChallenge(y, commitment, message, challengeSpace) {
    return toyHash(String(y) + "|" + String(commitment) + "|" + message, challengeSpace);
  }

  function cheatingExperiment(params, y) {
    var rand = rng(20260614 + params.seed * 997 + params.challengeBits * 53 + params.repetitions * 11);
    var trials = 3000;
    var oneRoundWins = 0;
    var repeatedWins = 0;
    var transcriptAccepts = 0;
    for (var trial = 0; trial < trials; trial += 1) {
      var all = true;
      for (var rep = 0; rep < params.repetitions; rep += 1) {
        var guessed = Math.floor(rand() * params.challengeSpace);
        var z = BigInt(Math.floor(rand() * Number(Q)));
        var fake = simulateTranscript(y, guessed, z);
        var actual = Math.floor(rand() * params.challengeSpace);
        var accepted = verifyTranscript(y, fake.commitment, actual, z);
        if (rep === 0 && accepted) oneRoundWins += 1;
        if (!accepted) all = false;
        if (accepted) transcriptAccepts += 1;
      }
      if (all) repeatedWins += 1;
    }
    return {
      oneRoundEmpirical: oneRoundWins / trials,
      oneRoundTheory: 1 / params.challengeSpace,
      repeatedEmpirical: repeatedWins / trials,
      repeatedTheory: Math.pow(1 / params.challengeSpace, params.repetitions),
      transcriptAccepts: transcriptAccepts,
      trials: trials
    };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var y = publicKey(params.secret);
    var honest = honestTranscript(params.secret, params.nonce, params.challenge);
    var rand = rng(424242 + params.seed * 101 + params.secret);
    var simResponse = BigInt(Math.floor(rand() * Number(Q)));
    var simulated = simulateTranscript(y, params.challenge, simResponse);
    var forkChallenge = chooseForkChallenge(params);
    var fork = honestTranscript(params.secret, params.nonce, forkChallenge);
    var extracted = extractSecret(honest.commitment, honest.challenge, honest.response, fork.commitment, fork.challenge, fork.response);
    var message = "pay:alice->bob:17";
    var fsChallenge = fiatShamirChallenge(y, honest.commitment, message, params.challengeSpace);
    var fsTranscript = honestTranscript(params.secret, params.nonce, fsChallenge);
    var tamperedChallenge = fiatShamirChallenge(y, honest.commitment, message + ":tampered", params.challengeSpace);
    var tamperedAccepts = verifyTranscript(y, fsTranscript.commitment, tamperedChallenge, fsTranscript.response);
    return {
      cheating: cheatingExperiment(params, y),
      extracted: extracted,
      fork: fork,
      group: { g: G, p: P, q: Q },
      honest: honest,
      params: params,
      publicKey: y,
      simulated: simulated,
      fiatShamir: {
        challenge: fsChallenge,
        message: message,
        tamperedAccepts: tamperedAccepts,
        tamperedChallenge: tamperedChallenge,
        transcript: fsTranscript
      }
    };
  }

  function readState(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var values = {
      challenge: String(params.challenge),
      challengeBits: String(params.challengeBits),
      challengeSpace: String(params.challengeSpace),
      nonce: String(params.nonce),
      repetitions: String(params.repetitions),
      secret: String(params.secret),
      seed: String(params.seed)
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function updateMetrics(metrics, result) {
    metrics.innerHTML = [
      metric("honest transcript", result.honest.accepted ? "accepts" : "fails"),
      metric("simulated transcript", result.simulated.accepted ? "accepts" : "fails"),
      metric("extracted witness", String(result.extracted) + (Number(result.extracted) === result.params.secret ? " match" : " mismatch")),
      metric("challenge space", String(result.params.challengeSpace)),
      metric("one-round cheat", formatPercent(result.cheating.oneRoundEmpirical, 2)),
      metric("repeated theory", formatPercent(result.cheating.repeatedTheory, 2))
    ].join("");
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 700 ? 1060 : 700;
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
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
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
    drawText(ctx, title, x + 14, y + 24, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 43, 11, COLORS.muted, 550);
  }

  function pill(ctx, text, x, y, color) {
    var width = Math.max(54, text.length * 7.1 + 20);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 25, 12);
    ctx.fill();
    drawText(ctx, text, x + width / 2, y + 16, 10, "#ffffff", 760, "center");
    return width;
  }

  function connector(ctx, x1, y1, x2, y2, color) {
    ctx.strokeStyle = color || COLORS.rule;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawTranscriptPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "honest proof", "commit, challenge, response, then one equation");
    var top = y + 66;
    var left = x + 24;
    var gap = Math.max(18, (w - 310) / 4);
    var x1 = left;
    var x2 = left + 92 + gap;
    var x3 = left + 184 + 2 * gap;
    var x4 = left + 276 + 3 * gap;
    var y0 = top + 10;
    pill(ctx, "secret x=" + result.params.secret, x1, y0, COLORS.prover);
    connector(ctx, x1 + 78, y0 + 13, x2, y0 + 13, COLORS.rule);
    pill(ctx, "t=" + result.honest.commitment, x2, y0, COLORS.prover);
    connector(ctx, x2 + 76, y0 + 13, x3, y0 + 13, COLORS.rule);
    pill(ctx, "c=" + result.honest.challenge, x3, y0, COLORS.verifier);
    connector(ctx, x3 + 62, y0 + 13, x4, y0 + 13, COLORS.rule);
    pill(ctx, "z=" + result.honest.response, x4, y0, COLORS.prover);
    var eqY = y + h - 82;
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(x + 16, eqY - 22, w - 32, 54);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x + 16, eqY - 22, w - 32, 54);
    var leftValue = modPow(G, result.honest.response, P);
    var rightValue = (result.honest.commitment * modPow(result.publicKey, BigInt(result.honest.challenge), P)) % P;
    drawText(ctx, "public y = g^x = " + result.publicKey + " mod " + P, x + 28, eqY - 2, 11, COLORS.muted, 650);
    drawText(ctx, "check: g^z = " + leftValue + ",  t*y^c = " + rightValue, x + 28, eqY + 18, 12, result.honest.accepted ? COLORS.prover : COLORS.bad, 760);
  }

  function drawSimulatorPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "simulator", "choose c and z first, then solve for t");
    var left = x + 24;
    var top = y + 70;
    pill(ctx, "choose c=" + result.simulated.challenge, left, top, COLORS.simulator);
    connector(ctx, left + 92, top + 13, left + 130, top + 13, COLORS.rule);
    pill(ctx, "choose z=" + result.simulated.response, left + 130, top, COLORS.simulator);
    connector(ctx, left + 245, top + 13, left + 286, top + 13, COLORS.rule);
    pill(ctx, "derive t=" + result.simulated.commitment, left + 286, top, COLORS.simulator);
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(x + 16, y + h - 122, w - 32, 90);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x + 16, y + h - 122, w - 32, 90);
    drawText(ctx, "No witness was used to build this transcript.", x + 28, y + h - 94, 12, COLORS.text, 700);
    drawText(ctx, "t = g^z / y^c mod p", x + 28, y + h - 70, 12, COLORS.muted, 650);
    drawText(ctx, "verifier still says: " + (result.simulated.accepted ? "accept" : "reject"), x + 28, y + h - 46, 12, result.simulated.accepted ? COLORS.simulator : COLORS.bad, 760);
  }

  function drawExtractorPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "fork extractor", "two accepting answers to one commitment reveal x");
    var centerX = x + w / 2;
    var top = y + 70;
    pill(ctx, "same t=" + result.honest.commitment, centerX - 58, top, COLORS.extractor);
    connector(ctx, centerX - 8, top + 28, x + 95, top + 78, COLORS.extractor);
    connector(ctx, centerX + 8, top + 28, x + w - 95, top + 78, COLORS.extractor);
    pill(ctx, "c1=" + result.honest.challenge, x + 42, top + 78, COLORS.verifier);
    pill(ctx, "z1=" + result.honest.response, x + 42, top + 110, COLORS.prover);
    pill(ctx, "c2=" + result.fork.challenge, x + w - 150, top + 78, COLORS.verifier);
    pill(ctx, "z2=" + result.fork.response, x + w - 150, top + 110, COLORS.prover);
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(x + 16, y + h - 86, w - 32, 54);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x + 16, y + h - 86, w - 32, 54);
    drawText(ctx, "x = (z1 - z2) / (c1 - c2) mod q", x + 28, y + h - 62, 12, COLORS.muted, 650);
    drawText(ctx, "extracted x = " + result.extracted + " (" + (Number(result.extracted) === result.params.secret ? "match" : "mismatch") + ")", x + 28, y + h - 40, 12, Number(result.extracted) === result.params.secret ? COLORS.extractor : COLORS.bad, 760);
  }

  function drawSoundnessPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "soundness ledger", "a witnessless prover can prepare for one challenge");
    var left = x + 52;
    var right = x + w - 24;
    var top = y + 66;
    var bottom = y + h - 58;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    var maxRep = 10;
    var minLog = -Math.log10(Math.pow(1 / result.params.challengeSpace, maxRep));
    function yScale(prob) {
      var score = -Math.log10(Math.max(prob, 1e-16));
      return bottom - (bottom - top) * score / Math.max(1, minLog);
    }
    ctx.strokeStyle = COLORS.verifier;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var rep = 1; rep <= maxRep; rep += 1) {
      var p = Math.pow(1 / result.params.challengeSpace, rep);
      var xx = left + (right - left) * (rep - 1) / (maxRep - 1);
      var yy = yScale(p);
      if (rep === 1) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    for (rep = 1; rep <= maxRep; rep += 1) {
      p = Math.pow(1 / result.params.challengeSpace, rep);
      xx = left + (right - left) * (rep - 1) / (maxRep - 1);
      yy = yScale(p);
      ctx.fillStyle = rep === result.params.repetitions ? COLORS.bad : COLORS.verifier;
      ctx.beginPath();
      ctx.arc(xx, yy, rep === result.params.repetitions ? 5 : 3, 0, 2 * Math.PI);
      ctx.fill();
      if (rep % 2 === 0) drawText(ctx, String(rep), xx, bottom + 18, 10, COLORS.muted, 650, "center");
    }
    drawText(ctx, "repetitions", (left + right) / 2, y + h - 14, 10, COLORS.muted, 650, "center");
    drawText(ctx, "harder", x + 16, top + 5, 10, COLORS.muted, 650);
    var selectedTheory = Math.pow(1 / result.params.challengeSpace, result.params.repetitions);
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(x + 20, y + h - 118, w - 40, 42);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x + 20, y + h - 118, w - 40, 42);
    drawText(ctx, "one round: theory " + formatPercent(result.cheating.oneRoundTheory, 2) + ", empirical " + formatPercent(result.cheating.oneRoundEmpirical, 2), x + 32, y + h - 96, 10, COLORS.text, 650);
    drawText(ctx, result.params.repetitions + " rounds: theory " + formatPercent(selectedTheory, 2) + ", empirical " + formatPercent(result.cheating.repeatedEmpirical, 2), x + 32, y + h - 80, 10, COLORS.text, 650);
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 18;
    var gap = 16;
    if (width < 700) {
      var panelH = (height - 2 * pad - 3 * gap) / 4;
      drawTranscriptPanel(ctx, result, pad, pad, width - 2 * pad, panelH);
      drawSimulatorPanel(ctx, result, pad, pad + panelH + gap, width - 2 * pad, panelH);
      drawExtractorPanel(ctx, result, pad, pad + 2 * (panelH + gap), width - 2 * pad, panelH);
      drawSoundnessPanel(ctx, result, pad, pad + 3 * (panelH + gap), width - 2 * pad, panelH);
      return;
    }
    var halfW = (width - 2 * pad - gap) / 2;
    var halfH = (height - 2 * pad - gap) / 2;
    drawTranscriptPanel(ctx, result, pad, pad, halfW, halfH);
    drawSimulatorPanel(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawExtractorPanel(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawSoundnessPanel(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function initOne(container) {
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      var params = readState(container);
      updateOutputs(container, params);
      latest = evaluate(params);
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

  function init() {
    var labs = document.querySelectorAll("[data-schnorr-zk-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    extractSecret: extractSecret,
    fiatShamirChallenge: fiatShamirChallenge,
    group: { g: G, p: P, q: Q },
    honestTranscript: honestTranscript,
    publicKey: publicKey,
    simulateTranscript: simulateTranscript,
    verifyTranscript: verifyTranscript
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SchnorrZkLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
