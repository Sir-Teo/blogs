(function (global) {
  "use strict";

  var DEFAULTS = {
    scenario: "payment",
    seed: 41,
    nonce: 7,
    forgeByte: 33
  };

  var SCENARIOS = {
    payment: {
      label: "payment tokens",
      first: "pay=1000;to=alice;ok=yes",
      second: "pay=9000;to=admin;ok=yes"
    },
    role: {
      label: "role claims",
      first: "role=user;limit=1000;uid=4182",
      second: "role=root;limit=9000;uid=4182"
    },
    sensor: {
      label: "sensor frames",
      first: "temp=021.4;valve=open;seq=17",
      second: "temp=099.9;valve=shut;seq=17"
    }
  };

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    white: "#ffffff",
    blue: "#2563eb",
    good: "#0f766e",
    bad: "#be123c",
    amber: "#b45309",
    purple: "#6d28d9",
    teal: "#0891b2"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    return {
      scenario: scenario,
      seed: clamp(Math.round(Number(raw.seed == null ? DEFAULTS.seed : raw.seed)), 1, 9999),
      nonce: clamp(Math.round(Number(raw.nonce == null ? DEFAULTS.nonce : raw.nonce)), 0, 255),
      forgeByte: clamp(Math.round(Number(raw.forgeByte == null ? DEFAULTS.forgeByte : raw.forgeByte)), 32, 126)
    };
  }

  function rng(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function deriveSecrets(seed) {
    var random = rng(seed * 2654435761 + 91);
    var h = 1 + Math.floor(random() * 255);
    var s = Math.floor(random() * 256);
    var key = Math.floor(random() * 256);
    return { h: h, s: s, key: key };
  }

  function bytes(text) {
    var out = [];
    for (var i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i) & 255);
    return out;
  }

  function textFromBytes(values) {
    return values.map(function (value) {
      if (value >= 32 && value <= 126) return String.fromCharCode(value);
      return ".";
    }).join("");
  }

  function hexByte(value) {
    return (value & 255).toString(16).toUpperCase().padStart(2, "0");
  }

  function hex(values, limit) {
    var slice = values.slice(0, limit || values.length);
    var out = slice.map(hexByte).join(" ");
    if (slice.length < values.length) out += " ...";
    return out;
  }

  function xor(a, b) {
    var n = Math.min(a.length, b.length);
    var out = new Array(n);
    for (var i = 0; i < n; i += 1) out[i] = a[i] ^ b[i];
    return out;
  }

  function equal(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  function streamByte(secret, nonce, index) {
    var x = (secret.key + 17 * nonce + 131 * index + 29 * secret.h) & 255;
    x ^= (x << 3) & 255;
    x ^= x >>> 5;
    x = (x * 73 + 41 + ((nonce * 19) & 255)) & 255;
    return x;
  }

  function keystream(secret, nonce, length) {
    var out = [];
    for (var i = 0; i < length; i += 1) out.push(streamByte(secret, nonce, i));
    return out;
  }

  function gfMul(a, b) {
    var p = 0;
    for (var i = 0; i < 8; i += 1) {
      if (b & 1) p ^= a;
      var hi = a & 0x80;
      a = (a << 1) & 255;
      if (hi) a ^= 0x1b;
      b >>>= 1;
    }
    return p & 255;
  }

  function gfPow(a, n) {
    var out = 1;
    var base = a;
    while (n > 0) {
      if (n & 1) out = gfMul(out, base);
      base = gfMul(base, base);
      n >>>= 1;
    }
    return out;
  }

  function gfInv(a) {
    if (a === 0) throw new Error("zero has no inverse in GF(2^8)");
    return gfPow(a, 254);
  }

  function gfDiv(a, b) {
    return gfMul(a, gfInv(b));
  }

  function ghashToy(data, h) {
    var y = 0;
    for (var i = 0; i < data.length; i += 1) y = gfMul(y ^ data[i], h);
    return y;
  }

  function encryptToy(secret, nonce, plainBytes) {
    var ks = keystream(secret, nonce, plainBytes.length);
    var cipher = xor(plainBytes, ks);
    var tag = secret.s ^ ghashToy(cipher, secret.h);
    return { cipher: cipher, tag: tag, keystream: ks };
  }

  function decryptToy(secret, nonce, cipher, tag) {
    var expected = secret.s ^ ghashToy(cipher, secret.h);
    if (expected !== tag) return { ok: false, plain: [] };
    return { ok: true, plain: xor(cipher, keystream(secret, nonce, cipher.length)) };
  }

  function recoverToyHashFromOneByte(secret, nonce) {
    var sampleA = encryptToy(secret, nonce, [0]);
    var sampleB = encryptToy(secret, nonce, [1]);
    var deltaTag = sampleA.tag ^ sampleB.tag;
    var deltaCipher = sampleA.cipher[0] ^ sampleB.cipher[0];
    var h = gfDiv(deltaTag, deltaCipher);
    var s = sampleA.tag ^ ghashToy(sampleA.cipher, h);
    return {
      sampleA: sampleA,
      sampleB: sampleB,
      deltaTag: deltaTag,
      deltaCipher: deltaCipher,
      h: h,
      s: s
    };
  }

  function forgeOneByte(secret, nonce, recovered, desiredByte) {
    var stream = streamByte(secret, nonce, 0);
    var cipher = [stream ^ desiredByte];
    var tag = recovered.s ^ ghashToy(cipher, recovered.h);
    var opened = decryptToy(secret, nonce, cipher, tag);
    return { desiredByte: desiredByte, cipher: cipher, tag: tag, opened: opened };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var scenario = SCENARIOS[params.scenario];
    var secret = deriveSecrets(params.seed);
    var plainA = bytes(scenario.first);
    var plainB = bytes(scenario.second);
    var encA = encryptToy(secret, params.nonce, plainA);
    var encB = encryptToy(secret, params.nonce, plainB);
    var otherNonce = (params.nonce + 1) & 255;
    var encOtherNonce = encryptToy(secret, otherNonce, plainA);
    var cipherXor = xor(encA.cipher, encB.cipher);
    var plainXor = xor(plainA, plainB);
    var recoveredB = xor(cipherXor, plainA);
    var recovered = recoverToyHashFromOneByte(secret, params.nonce);
    var forged = forgeOneByte(secret, params.nonce, recovered, params.forgeByte);
    var tampered = encA.cipher.slice();
    tampered[0] ^= 1;
    var tamperedOpen = decryptToy(secret, params.nonce, tampered, encA.tag);
    var result = {
      params: params,
      scenario: scenario,
      secret: secret,
      plainA: plainA,
      plainB: plainB,
      encA: encA,
      encB: encB,
      encOtherNonce: encOtherNonce,
      cipherXor: cipherXor,
      plainXor: plainXor,
      recoveredB: recoveredB,
      recovered: recovered,
      forged: forged,
      tamperedOpen: tamperedOpen
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var checks = [];
    function check(name, passed) {
      checks.push({ name: name, passed: !!passed });
    }
    check("same nonce reuses the toy keystream prefix", equal(result.encA.keystream, result.encB.keystream));
    check("different nonce changes the toy keystream", !equal(result.encA.keystream, result.encOtherNonce.keystream));
    check("ciphertext xor equals plaintext xor", equal(result.cipherXor, result.plainXor));
    check("known first plaintext recovers the second", equal(result.recoveredB, result.plainB));
    check("toy GHASH recovery finds H", result.recovered.h === result.secret.h);
    check("toy mask recovery finds S", result.recovered.s === result.secret.s);
    check("forged one-byte tag verifies", result.forged.opened.ok && result.forged.opened.plain[0] === result.params.forgeByte);
    check("tampering without a new tag fails", !result.tamperedOpen.ok);
    check("secret hash key is nonzero", result.secret.h > 0);
    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function auditGrid() {
    return [
      {},
      { scenario: "role", seed: 12, nonce: 3, forgeByte: 65 },
      { scenario: "sensor", seed: 99, nonce: 201, forgeByte: 90 },
      { scenario: "payment", seed: 123, nonce: 0, forgeByte: 36 },
      { scenario: "role", seed: 777, nonce: 255, forgeByte: 126 }
    ].map(function (row) {
      var result = evaluate(row);
      return {
        params: result.params,
        length: result.plainA.length,
        xorBytes: result.cipherXor.length,
        recoveredText: textFromBytes(result.recoveredB),
        hashKey: result.secret.h,
        recoveredHashKey: result.recovered.h,
        forgedByte: result.forged.opened.plain[0],
        passed: result.audit.passed,
        checks: result.audit.checks
      };
    });
  }

  function metric(label, value, className) {
    return '<div class="gcm-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 900));
    var cssHeight = cssWidth < 720 ? 880 : 640;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function mono(ctx, value, x, y, color, size, weight) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 12) + "px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    else ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, COLORS.muted, 11, 560);
  }

  function clip(value, max) {
    if (value.length <= max) return value;
    return value.slice(0, Math.max(0, max - 3)) + "...";
  }

  function drawXor(ctx, box, result) {
    panel(ctx, box, "confidentiality failure", "same nonce means the same stream is used twice");
    var maxChars = Math.max(18, Math.floor((box.w - 48) / 7.4));
    var lines = [
      ["P1", result.scenario.first, COLORS.text],
      ["P2", result.scenario.second, COLORS.text],
      ["C1 xor C2", hex(result.cipherXor, 16), COLORS.blue],
      ["P1 xor P2", hex(result.plainXor, 16), COLORS.good]
    ];
    var y = box.y + 74;
    lines.forEach(function (row) {
      text(ctx, row[0], box.x + 18, y, COLORS.muted, 10, 720);
      mono(ctx, clip(row[1], maxChars), box.x + 88, y, row[2], 11, 720);
      y += 28;
    });
    text(ctx, "The two xor rows match byte-for-byte.", box.x + 18, box.y + box.h - 22, COLORS.bad, 11, 760);
  }

  function drawRecovery(ctx, box, result) {
    panel(ctx, box, "known-plaintext recovery", "if one plaintext is known, the peer plaintext falls out");
    var maxChars = Math.max(18, Math.floor((box.w - 48) / 7.4));
    var rows = [
      ["known P1", result.scenario.first, COLORS.text],
      ["recovered P2", textFromBytes(result.recoveredB), COLORS.good],
      ["actual P2", result.scenario.second, COLORS.muted]
    ];
    var y = box.y + 78;
    rows.forEach(function (row) {
      text(ctx, row[0], box.x + 18, y, COLORS.muted, 10, 720);
      mono(ctx, clip(row[1], maxChars), box.x + 112, y, row[2], 12, 740);
      y += 34;
    });
    text(ctx, "recovery " + (equal(result.recoveredB, result.plainB) ? "passed" : "failed"), box.x + 18, box.y + box.h - 22, COLORS.good, 11, 760);
  }

  function drawHash(ctx, box, result) {
    panel(ctx, box, "toy authentication failure", "one-byte GHASH equation under a reused nonce");
    var rows = [
      ["tag A xor tag B", "0x" + hexByte(result.recovered.deltaTag), COLORS.purple],
      ["cipher A xor cipher B", "0x" + hexByte(result.recovered.deltaCipher), COLORS.blue],
      ["recovered H", "0x" + hexByte(result.recovered.h), COLORS.good],
      ["real H", "0x" + hexByte(result.secret.h), COLORS.muted],
      ["recovered S", "0x" + hexByte(result.recovered.s), COLORS.good],
      ["real S", "0x" + hexByte(result.secret.s), COLORS.muted]
    ];
    var y = box.y + 72;
    rows.forEach(function (row) {
      text(ctx, row[0], box.x + 18, y, COLORS.muted, 11, 650);
      text(ctx, row[1], box.x + box.w - 18, y, row[2], 12, 780, "right");
      y += 25;
    });
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "forgery ledger", "after recovering the toy hash key, a new tag verifies");
    var rows = [
      ["nonce", String(result.params.nonce), COLORS.text],
      ["message bytes", String(result.plainA.length), COLORS.text],
      ["forged plaintext byte", String.fromCharCode(result.params.forgeByte), COLORS.good],
      ["forged tag", "0x" + hexByte(result.forged.tag), COLORS.good],
      ["old-tag tamper", result.tamperedOpen.ok ? "accepted" : "rejected", result.tamperedOpen.ok ? COLORS.bad : COLORS.good],
      ["audit", result.audit.passed ? "passed" : "check", result.audit.passed ? COLORS.good : COLORS.bad]
    ];
    var y = box.y + 70;
    rows.forEach(function (row) {
      text(ctx, row[0], box.x + 18, y, COLORS.muted, 11, 650);
      text(ctx, row[1], box.x + box.w - 18, y, row[2], 12, 780, "right");
      y += 29;
    });
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    if (width < 720) {
      var gap = 14;
      var h = Math.floor((height - 3 * gap) / 4);
      drawXor(ctx, { x: 0, y: 0, w: width, h: h }, result);
      drawRecovery(ctx, { x: 0, y: h + gap, w: width, h: h }, result);
      drawHash(ctx, { x: 0, y: 2 * (h + gap), w: width, h: h }, result);
      drawLedger(ctx, { x: 0, y: 3 * (h + gap), w: width, h: height - 3 * (h + gap) }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.56);
      var rightW = width - leftW - gap2;
      var upperH = Math.round(height * 0.52);
      drawXor(ctx, { x: 0, y: 0, w: leftW, h: upperH }, result);
      drawRecovery(ctx, { x: 0, y: upperH + gap2, w: leftW, h: height - upperH - gap2 }, result);
      drawHash(ctx, { x: leftW + gap2, y: 0, w: rightW, h: upperH }, result);
      drawLedger(ctx, { x: leftW + gap2, y: upperH + gap2, w: rightW, h: height - upperH - gap2 }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      seed: String(result.params.seed),
      nonce: String(result.params.nonce),
      forgeByte: String.fromCharCode(result.params.forgeByte)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Cipher XOR", equal(result.cipherXor, result.plainXor) ? "equals plain XOR" : "check", "gcm-lab__metric--bad"),
        metric("Recovered P2", equal(result.recoveredB, result.plainB) ? "exact" : "check", "gcm-lab__metric--good"),
        metric("Recovered H", "0x" + hexByte(result.recovered.h), "gcm-lab__metric--good"),
        metric("Forged Tag", result.forged.opened.ok ? "accepted" : "rejected", result.forged.opened.ok ? "gcm-lab__metric--bad" : "gcm-lab__metric--good"),
        metric("Audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "gcm-lab__metric--good" : "gcm-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "Toy model: byte-sized GHASH and a pseudo-keystream. It is designed to show why nonce reuse breaks GCM's contracts, not to implement AES-GCM.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__gcmNonceResult = result;
  }

  function init(root) {
    if (!root || root.__gcmNonceReady) return;
    root.__gcmNonceReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-gcm-nonce-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    decryptToy: decryptToy,
    encryptToy: encryptToy,
    evaluate: evaluate,
    gfDiv: gfDiv,
    gfInv: gfInv,
    gfMul: gfMul,
    ghashToy: ghashToy,
    textFromBytes: textFromBytes
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.GcmNonceLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
