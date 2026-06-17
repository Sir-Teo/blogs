(function (global) {
  "use strict";

  var Q = 65537;
  var G = 3;
  var SECRET_X = 42193;

  var COLORS = {
    axis: "#d7dee5",
    bad: "#be123c",
    blue: "#2563eb",
    gold: "#d97706",
    good: "#0f766e",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    panel: "#f8fafc",
    purple: "#7c3aed",
    softBad: "rgba(190, 18, 60, 0.14)",
    softBlue: "rgba(37, 99, 235, 0.12)",
    softGood: "rgba(15, 118, 110, 0.13)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    bits: 8,
    mode: "reuse",
    signatures: 5,
    step: 137
  };

  var MODES = {
    fresh: "fresh nonces",
    reuse: "reused nonce",
    small: "tiny nonce space",
    linear: "linear clock"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function mod(value) {
    var out = value % Q;
    return out < 0 ? out + Q : out;
  }

  function mulMod(a, b) {
    return (a * b) % Q;
  }

  function powMod(base, exp) {
    var result = 1;
    var b = mod(base);
    var e = exp;
    while (e > 0) {
      if (e & 1) result = mulMod(result, b);
      b = mulMod(b, b);
      e = Math.floor(e / 2);
    }
    return result;
  }

  function invMod(value) {
    var t = 0;
    var newT = 1;
    var r = Q;
    var newR = mod(value);
    while (newR !== 0) {
      var quotient = Math.floor(r / newR);
      var oldT = t;
      t = newT;
      newT = oldT - quotient * newT;
      var oldR = r;
      r = newR;
      newR = oldR - quotient * newR;
    }
    if (r !== 1) throw new Error("not invertible");
    return mod(t);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var mode = MODES[raw.mode] ? raw.mode : DEFAULTS.mode;
    return {
      bits: snap(raw.bits, DEFAULTS.bits, 4, 12, 1),
      mode: mode,
      signatures: snap(raw.signatures, DEFAULTS.signatures, 2, 8, 1),
      step: snap(raw.step, DEFAULTS.step, 1, 997, 1)
    };
  }

  function hashMessage(index, params) {
    var modeSalt = params.mode === "reuse" ? 101 : params.mode === "small" ? 307 : params.mode === "linear" ? 509 : 701;
    var value = 1777 + modeSalt + index * 7919 + (index + 3) * (index + 17) * 37;
    return mod(value);
  }

  function rFromK(k) {
    return powMod(G, k);
  }

  function nonceFor(index, params) {
    if (params.mode === "reuse") return 31117;
    if (params.mode === "small") {
      var limit = Math.pow(2, params.bits);
      return 1 + ((29 + index * 137 + index * index * 19) % Math.max(2, limit - 1));
    }
    if (params.mode === "linear") return mod(12017 + index * params.step) || 1;
    var value = mod(9000 + index * 12011 + index * index * 503 + params.step * 17);
    if (value < Math.pow(2, params.bits) + 1000) value += 20000;
    return mod(value) || 1;
  }

  function sign(index, params) {
    var h = hashMessage(index, params);
    var k = nonceFor(index, params);
    var r = rFromK(k);
    var s = mulMod(invMod(k), mod(h + mulMod(r, SECRET_X)));
    return {
      h: h,
      i: index,
      k: k,
      r: r,
      s: s
    };
  }

  function makeSignatures(params) {
    var rows = [];
    for (var i = 0; i < params.signatures; i += 1) rows.push(sign(i, params));
    return rows;
  }

  function verifySignature(sig, x) {
    return mulMod(sig.s, sig.k) === mod(sig.h + mulMod(sig.r, x));
  }

  function recoverFromReuse(signatures) {
    for (var i = 0; i < signatures.length; i += 1) {
      for (var j = i + 1; j < signatures.length; j += 1) {
        var a = signatures[i];
        var b = signatures[j];
        if (a.r !== b.r || a.s === b.s) continue;
        var k = mulMod(mod(a.h - b.h), invMod(mod(a.s - b.s)));
        var x = mulMod(mod(mulMod(a.s, k) - a.h), invMod(a.r));
        return {
          evidence: [a.i, b.i],
          kind: "reuse",
          recoveredK: k,
          recoveredX: x,
          success: x === SECRET_X
        };
      }
    }
    return { kind: "reuse", success: false };
  }

  function recoverSmallSpace(signatures, bits) {
    var limit = Math.pow(2, bits);
    var rows = [];
    var recovered = null;
    for (var i = 0; i < signatures.length; i += 1) {
      var sig = signatures[i];
      var matches = [];
      for (var k = 1; k < limit; k += 1) {
        if (rFromK(k) === sig.r) {
          var x = mulMod(mod(mulMod(sig.s, k) - sig.h), invMod(sig.r));
          matches.push({ k: k, x: x });
        }
      }
      if (matches.length && recovered == null) recovered = matches[0];
      rows.push({
        i: sig.i,
        matches: matches.length,
        recoveredK: matches.length ? matches[0].k : null,
        recoveredX: matches.length ? matches[0].x : null,
        tested: limit - 1
      });
    }
    return {
      hits: rows.reduce(function (sum, row) { return sum + row.matches; }, 0),
      kind: "small",
      limit: limit,
      recoveredK: recovered && recovered.k,
      recoveredX: recovered && recovered.x,
      rows: rows,
      success: Boolean(recovered && recovered.x === SECRET_X)
    };
  }

  function solve2x2(a1, b1, c1, a2, b2, c2) {
    var det = mod(mulMod(a1, b2) - mulMod(a2, b1));
    if (det === 0) return null;
    var invDet = invMod(det);
    return {
      x: mulMod(mod(mulMod(c1, b2) - mulMod(c2, b1)), invDet),
      y: mulMod(mod(mulMod(a1, c2) - mulMod(a2, c1)), invDet)
    };
  }

  function recoverLinear(signatures, params) {
    for (var i = 0; i < signatures.length; i += 1) {
      for (var j = i + 1; j < signatures.length; j += 1) {
        var a = signatures[i];
        var b = signatures[j];
        var betaA = mod(a.i * params.step);
        var betaB = mod(b.i * params.step);
        var cA = mod(mulMod(a.s, betaA) - a.h);
        var cB = mod(mulMod(b.s, betaB) - b.h);
        var solution = solve2x2(a.r, mod(-a.s), cA, b.r, mod(-b.s), cB);
        if (!solution) continue;
        var k0 = solution.y;
        var valid = signatures.every(function (sig) {
          var predictedK = mod(k0 + sig.i * params.step) || 1;
          var predictedX = solution.x;
          return predictedK === sig.k && verifySignature(sig, predictedX);
        });
        if (valid) {
          return {
            evidence: [a.i, b.i],
            kind: "linear",
            recoveredK0: k0,
            recoveredX: solution.x,
            success: solution.x === SECRET_X
          };
        }
      }
    }
    return { kind: "linear", success: false };
  }

  function attack(signatures, params) {
    if (params.mode === "reuse") return recoverFromReuse(signatures);
    if (params.mode === "small") return recoverSmallSpace(signatures, params.bits);
    if (params.mode === "linear") return recoverLinear(signatures, params);
    var small = recoverSmallSpace(signatures, params.bits);
    return {
      hits: small.hits,
      kind: "fresh",
      limit: small.limit,
      recoveredX: small.recoveredX,
      rows: small.rows,
      success: false
    };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var signatures = makeSignatures(params);
    var result = attack(signatures, params);
    return {
      attack: result,
      params: params,
      q: Q,
      secretX: SECRET_X,
      signatures: signatures,
      verified: signatures.every(function (sig) { return verifySignature(sig, SECRET_X); })
    };
  }

  function fmt(value) {
    return value == null ? "none" : String(value);
  }

  function metric(label, value, tone) {
    return '<div class="nonce-lab__metric' + (tone ? " " + tone : "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.muted;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 17, { color: COLORS.ink, size: 13, weight: 820 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 36, { color: COLORS.muted, size: 10, weight: 650 });
  }

  function plotFrame(ctx, plot) {
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawNoncePanel(ctx, state, box) {
    panel(ctx, box, "secret nonce trace", "the public r value fingerprints the hidden k");
    var plot = { x: box.x + 48, y: box.y + 58, w: box.w - 76, h: box.h - 96 };
    plotFrame(ctx, plot);
    var maxK = Math.max.apply(null, state.signatures.map(function (sig) { return sig.k; }));
    var minK = Math.min.apply(null, state.signatures.map(function (sig) { return sig.k; }));
    var span = Math.max(1, maxK - minK);
    if (state.params.mode === "small") {
      minK = 0;
      maxK = Math.pow(2, state.params.bits);
    }
    function sx(i) { return plot.x + i / Math.max(1, state.signatures.length - 1) * plot.w; }
    function sy(k) { return plot.y + plot.h - (k - minK) / Math.max(1, maxK - minK) * plot.h; }
    ctx.fillStyle = state.params.mode === "small" ? COLORS.softGood : state.params.mode === "reuse" ? COLORS.softBad : COLORS.softBlue;
    if (state.params.mode === "small") {
      ctx.fillRect(plot.x, sy(Math.pow(2, state.params.bits)), plot.w, plot.y + plot.h - sy(Math.pow(2, state.params.bits)));
    } else if (state.params.mode === "reuse") {
      ctx.fillRect(plot.x, sy(state.signatures[0].k) - 9, plot.w, 18);
    }
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    state.signatures.forEach(function (sig, i) {
      var x = sx(i);
      var y = sy(sig.k);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    state.signatures.forEach(function (sig, i) {
      ctx.fillStyle = state.params.mode === "reuse" ? COLORS.bad : state.params.mode === "linear" ? COLORS.purple : COLORS.blue;
      ctx.beginPath();
      ctx.arc(sx(i), sy(sig.k), 4, 0, 2 * Math.PI);
      ctx.fill();
    });
    text(ctx, "k", plot.x - 10, plot.y, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "signature index", plot.x + plot.w, plot.y + plot.h + 18, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, "mode: " + MODES[state.params.mode], plot.x + 8, plot.y + 14, { color: COLORS.ink, size: 11, weight: 760 });
  }

  function drawSignaturePanel(ctx, state, box) {
    panel(ctx, box, "public signature rows", "r and s are visible; k and x are supposed to stay hidden");
    var x = box.x + 16;
    var y = box.y + 62;
    var rowH = Math.min(25, (box.h - 92) / state.signatures.length);
    text(ctx, "i", x, y - 20, { color: COLORS.muted, size: 10 });
    text(ctx, "h", x + 36, y - 20, { color: COLORS.muted, size: 10 });
    text(ctx, "r", x + 104, y - 20, { color: COLORS.muted, size: 10 });
    text(ctx, "s", x + 176, y - 20, { color: COLORS.muted, size: 10 });
    text(ctx, "hidden k", x + 248, y - 20, { color: COLORS.muted, size: 10 });
    state.signatures.forEach(function (sig, index) {
      var yy = y + index * rowH;
      ctx.fillStyle = index % 2 ? "rgba(255,255,255,0.72)" : "rgba(237,242,247,0.7)";
      ctx.fillRect(x - 6, yy - 11, box.w - 28, rowH - 2);
      text(ctx, String(sig.i), x, yy, { color: COLORS.ink, size: 10, weight: 760 });
      text(ctx, String(sig.h), x + 36, yy, { color: COLORS.ink, size: 10 });
      text(ctx, String(sig.r), x + 104, yy, { color: sig.r === state.signatures[0].r && index > 0 ? COLORS.bad : COLORS.ink, size: 10, weight: sig.r === state.signatures[0].r && index > 0 ? 800 : 650 });
      text(ctx, String(sig.s), x + 176, yy, { color: COLORS.ink, size: 10 });
      text(ctx, String(sig.k), x + 248, yy, { color: COLORS.gold, size: 10, weight: 780 });
    });
    text(ctx, "toy equation: s * k = h + r * x (mod " + Q + ")", x, box.y + box.h - 18, { color: COLORS.muted, size: 10 });
  }

  function drawAttackPanel(ctx, state, box) {
    var attackInfo = state.attack;
    panel(ctx, box, "attack ledger", attackInfo.success ? "the private key has become an output" : "the selected attack does not recover the key");
    var x = box.x + 18;
    var y = box.y + 66;
    var lines;
    if (attackInfo.kind === "reuse") {
      lines = [
        "same r means the same hidden k was reused",
        "k = (h1 - h2) / (s1 - s2) mod q",
        "x = (s1*k - h1) / r mod q",
        "recovered k = " + fmt(attackInfo.recoveredK),
        "recovered x = " + fmt(attackInfo.recoveredX)
      ];
    } else if (attackInfo.kind === "small") {
      lines = [
        "nonce dictionary size = " + (attackInfo.limit - 1),
        "try k, recompute r = g^k mod q",
        "when r matches, solve x from one signature",
        "r matches found = " + attackInfo.hits,
        "recovered x = " + fmt(attackInfo.recoveredX)
      ];
    } else if (attackInfo.kind === "linear") {
      lines = [
        "known relation: k_i = k0 + i*step",
        "each signature is linear in x and k0",
        "two signatures solve a 2x2 system mod q",
        "recovered k0 = " + fmt(attackInfo.recoveredK0),
        "recovered x = " + fmt(attackInfo.recoveredX)
      ];
    } else {
      lines = [
        "fresh nonces do not repeat r",
        "small-space dictionary was still tried",
        "nonce guesses per signature = " + (attackInfo.limit - 1),
        "r matches found = " + attackInfo.hits,
        "recovered x = none"
      ];
    }
    lines.forEach(function (line, i) {
      text(ctx, line, x, y + i * 24, { color: i >= lines.length - 2 ? (attackInfo.success ? COLORS.good : COLORS.muted) : COLORS.ink, size: 11, weight: i >= lines.length - 2 ? 800 : 650 });
    });
    var verdict = attackInfo.success ? "COMPROMISED" : "not recovered by this model";
    ctx.fillStyle = attackInfo.success ? COLORS.softBad : COLORS.softGood;
    ctx.strokeStyle = attackInfo.success ? COLORS.bad : COLORS.good;
    ctx.beginPath();
    ctx.roundRect(x, box.y + box.h - 48, box.w - 36, 30, 7);
    ctx.fill();
    ctx.stroke();
    text(ctx, verdict, box.x + box.w / 2, box.y + box.h - 33, { align: "center", color: attackInfo.success ? COLORS.bad : COLORS.good, size: 12, weight: 850 });
  }

  function drawSearchPanel(ctx, state, box) {
    panel(ctx, box, "search and validation", "one algebraic hit must verify every public row");
    var plot = { x: box.x + 48, y: box.y + 62, w: box.w - 78, h: box.h - 104 };
    plotFrame(ctx, plot);
    var rows = state.attack.rows || state.signatures.map(function (sig, i) {
      return { i: i, matches: state.attack.success && i < 2 ? 1 : 0, tested: 1 };
    });
    var maxTested = Math.max.apply(null, rows.map(function (row) { return row.tested || 1; }));
    rows.forEach(function (row, idx) {
      var barW = plot.w / rows.length * 0.62;
      var x = plot.x + idx / rows.length * plot.w + plot.w / rows.length * 0.2;
      var testedH = (row.tested || 1) / maxTested * plot.h;
      ctx.fillStyle = COLORS.softBlue;
      ctx.fillRect(x, plot.y + plot.h - testedH, barW, testedH);
      ctx.fillStyle = row.matches ? COLORS.good : COLORS.axis;
      ctx.fillRect(x, plot.y + plot.h - Math.max(3, row.matches * 14), barW, Math.max(3, row.matches * 14));
      text(ctx, String(row.i), x + barW / 2, plot.y + plot.h + 16, { align: "center", color: COLORS.muted, size: 10 });
    });
    text(ctx, "tested guesses", plot.x + 8, plot.y + 16, { color: COLORS.blue, size: 10 });
    text(ctx, "r matches", plot.x + 8, plot.y + 34, { color: COLORS.good, size: 10 });
    var validText = state.verified ? "all generated signatures verify" : "signature equation failed";
    text(ctx, validText, plot.x, box.y + box.h - 18, { color: state.verified ? COLORS.good : COLORS.bad, size: 11, weight: 800 });
  }

  function draw(root, state) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas || !canvas.getContext) return;
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 700;
    var height = compact ? 980 : 760;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    var margin = 14;
    var gap = 18;
    var boxes;
    if (compact) {
      var h = (height - 2 * margin - 3 * gap) / 4;
      boxes = [
        { x: margin, y: margin, w: width - 2 * margin, h: h },
        { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h },
        { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h },
        { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h }
      ];
    } else {
      var boxW = (width - 2 * margin - gap) / 2;
      var boxH = (height - 2 * margin - gap) / 2;
      boxes = [
        { x: margin, y: margin, w: boxW, h: boxH },
        { x: margin + boxW + gap, y: margin, w: boxW, h: boxH },
        { x: margin, y: margin + boxH + gap, w: boxW, h: boxH },
        { x: margin + boxW + gap, y: margin + boxH + gap, w: boxW, h: boxH }
      ];
    }
    drawNoncePanel(ctx, state, boxes[0]);
    drawSignaturePanel(ctx, state, boxes[1]);
    drawAttackPanel(ctx, state, boxes[2]);
    drawSearchPanel(ctx, state, boxes[3]);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function updateControls(root, params) {
    var values = {
      bits: String(params.bits),
      mode: MODES[params.mode],
      signatures: String(params.signatures),
      step: String(params.step)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      input.value = params[key];
    });
  }

  function render(root) {
    var state = evaluate(paramsFromRoot(root));
    updateControls(root, state.params);
    var metrics = root.querySelector("[data-metrics]");
    var attackInfo = state.attack;
    if (metrics) {
      metrics.innerHTML = [
        metric("mode", MODES[state.params.mode]),
        metric("signatures", String(state.params.signatures)),
        metric("prime order q", String(Q)),
        metric("attack verdict", attackInfo.success ? "key recovered" : "not recovered", attackInfo.success ? "bad" : "good"),
        metric("recovered x", fmt(attackInfo.recoveredX), attackInfo.success ? "bad" : ""),
        metric("signature audit", state.verified ? "passed" : "failed", state.verified ? "good" : "bad")
      ].join("");
    }
    draw(root, state);
    root.__signatureNonceState = state;
  }

  function init(root) {
    if (!root || root.__signatureNonceReady) return;
    root.__signatureNonceReady = true;
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
    render(root);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function audit() {
    var reuse = evaluate({ mode: "reuse", signatures: 3 });
    var small = evaluate({ mode: "small", bits: 8, signatures: 4 });
    var linear = evaluate({ mode: "linear", signatures: 4, step: 137 });
    var fresh = evaluate({ mode: "fresh", bits: 8, signatures: 5 });
    [reuse, small, linear, fresh].forEach(function (state) {
      assert(state.verified, state.params.mode + " signatures should verify");
      state.signatures.forEach(function (sig) {
        assert(sig.r === rFromK(sig.k), state.params.mode + " r should be derived from k");
      });
    });
    assert(reuse.attack.success && reuse.attack.recoveredX === SECRET_X, "reuse should recover the private key");
    assert(small.attack.success && small.attack.recoveredX === SECRET_X, "small nonce space should recover the private key");
    assert(linear.attack.success && linear.attack.recoveredX === SECRET_X, "linear nonce relation should recover the private key");
    assert(!fresh.attack.success && fresh.attack.hits === 0, "fresh nonces should not match the tiny dictionary");
    assert(invMod(7) * 7 % Q === 1, "modular inverse should work");
    return {
      freshHits: fresh.attack.hits,
      linearK0: linear.attack.recoveredK0,
      ok: true,
      q: Q,
      recoveredX: reuse.attack.recoveredX,
      smallHits: small.attack.hits
    };
  }

  var api = {
    MODES: MODES,
    Q: Q,
    SECRET_X: SECRET_X,
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    invMod: invMod,
    rFromK: rFromK,
    recoverFromReuse: recoverFromReuse,
    recoverLinear: recoverLinear,
    recoverSmallSpace: recoverSmallSpace
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SignatureNonceLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-signature-nonce-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
