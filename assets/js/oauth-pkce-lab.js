(function (global) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    auth: "#2563eb",
    proof: "#0f766e",
    attacker: "#be123c",
    token: "#7c3aed",
    warning: "#b45309"
  };

  var DEFAULTS = {
    proof: "S256",
    attacker: "codeOnly",
    server: "downgradeGuard"
  };

  var PROOFS = {
    none: {
      label: "no PKCE",
      note: "the code is bearer-like; whoever redeems it first can win"
    },
    plain: {
      label: "plain PKCE",
      note: "the verifier is sent as the challenge, so a request observer can learn it"
    },
    S256: {
      label: "S256 PKCE",
      note: "the front channel carries a hash, while the verifier waits for the token request"
    }
  };

  var ATTACKERS = {
    codeOnly: {
      label: "intercepts code",
      note: "attacker sees the redirect code but not the original authorization request"
    },
    requestAndCode: {
      label: "sees request + code",
      note: "attacker sees the authorization request and later intercepts the code"
    },
    injectedUnbound: {
      label: "injects unbound code",
      note: "attacker starts a no-PKCE flow and feeds that code to the victim client"
    }
  };

  var SERVERS = {
    optional: {
      label: "PKCE optional",
      requirePkce: false,
      downgradeGuard: false,
      note: "supports PKCE when present but accepts old unbound codes"
    },
    downgradeGuard: {
      label: "downgrade guard",
      requirePkce: false,
      downgradeGuard: true,
      note: "rejects token requests that send a verifier for a code with no challenge"
    },
    requirePkce: {
      label: "PKCE required",
      requirePkce: true,
      downgradeGuard: true,
      note: "authorization requests without a challenge never receive a code"
    }
  };

  var CLIENT_ID = "native-photo-app";
  var REDIRECT_URI = "com.example.app:/oauth2redirect";

  function clampKey(table, value, fallback) {
    return table[value] ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      proof: clampKey(PROOFS, raw.proof, DEFAULTS.proof),
      attacker: clampKey(ATTACKERS, raw.attacker, DEFAULTS.attacker),
      server: clampKey(SERVERS, raw.server, DEFAULTS.server)
    };
  }

  function rotateRight(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function sha256Ascii(message) {
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bytes = [];
    for (var i = 0; i < message.length; i += 1) bytes.push(message.charCodeAt(i) & 0xff);
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i -= 1) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);

    for (var off = 0; off < bytes.length; off += 64) {
      var w = new Array(64);
      for (i = 0; i < 16; i += 1) {
        var j = off + i * 4;
        w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
      }
      for (i = 16; i < 64; i += 1) {
        var s0 = (rotateRight(w[i - 15], 7) ^ rotateRight(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
        var s1 = (rotateRight(w[i - 2], 17) ^ rotateRight(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i += 1) {
        var S1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
        var ch = ((e & f) ^ ((~e) & g)) >>> 0;
        var temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var temp2 = (S0 + maj) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }
    var out = [];
    H.forEach(function (word) {
      out.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255);
    });
    return out;
  }

  function base64url(bytes) {
    var table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var out = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      var n = (b0 << 16) | (b1 << 8) | b2;
      out += table[(n >>> 18) & 63];
      out += table[(n >>> 12) & 63];
      if (i + 1 < bytes.length) out += table[(n >>> 6) & 63];
      if (i + 2 < bytes.length) out += table[n & 63];
    }
    return out;
  }

  function verifierFromSeed(seed) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    var x = seed >>> 0;
    var out = "";
    for (var i = 0; i < 43; i += 1) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      out += chars[(x >>> 0) % chars.length];
    }
    return out;
  }

  function challengeFor(verifier, method) {
    if (method === "plain") return verifier;
    if (method === "S256") return base64url(sha256Ascii(verifier));
    return null;
  }

  function short(value) {
    if (value == null) return "none";
    return String(value).slice(0, 10) + "...";
  }

  function makeServer(params) {
    var policy = SERVERS[params.server];
    var codes = Object.create(null);
    var counter = 0;

    function authorize(flow) {
      if (policy.requirePkce && !flow.challenge) {
        return { ok: false, error: "invalid_request: code_challenge required" };
      }
      counter += 1;
      var code = (flow.owner === "attacker" ? "atk-" : "vic-") + counter + "-" + (flow.challenge ? flow.challenge.slice(0, 8) : "unbound");
      codes[code] = {
        code: code,
        owner: flow.owner,
        clientId: flow.clientId,
        redirectUri: flow.redirectUri,
        challenge: flow.challenge || null,
        method: flow.method || null,
        used: false
      };
      return { ok: true, code: code, record: codes[code] };
    }

    function token(request) {
      var rec = codes[request.code];
      if (!rec) return { ok: false, error: "invalid_grant: unknown code" };
      if (rec.used) return { ok: false, error: "invalid_grant: code already used" };
      if (request.clientId !== rec.clientId || request.redirectUri !== rec.redirectUri) {
        return { ok: false, error: "invalid_grant: redirect/client mismatch" };
      }
      if (!rec.challenge) {
        if (policy.downgradeGuard && request.verifier) {
          return { ok: false, error: "invalid_grant: verifier sent for unbound code" };
        }
        rec.used = true;
        return { ok: true, token: "token-for-" + rec.owner, owner: rec.owner };
      }
      if (!request.verifier) return { ok: false, error: "invalid_request: code_verifier required" };
      if (challengeFor(request.verifier, rec.method) !== rec.challenge) {
        return { ok: false, error: "invalid_grant: verifier mismatch" };
      }
      rec.used = true;
      return { ok: true, token: "token-for-" + rec.owner, owner: rec.owner };
    }

    return { authorize: authorize, token: token, policy: policy };
  }

  function authFlowFor(owner, proof, verifier) {
    var method = proof === "none" ? null : proof;
    var challenge = method ? challengeFor(verifier, method) : null;
    return {
      owner: owner,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      method: method,
      challenge: challenge
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var server = makeServer(params);
    var victimVerifier = verifierFromSeed(0x76360001);
    var attackerVerifier = verifierFromSeed(0xBADCAFE);
    var victimFlow = authFlowFor("victim", params.proof, victimVerifier);
    var steps = [];
    var auth = server.authorize(victimFlow);
    steps.push({
      label: "victim authorization request",
      actor: "victim",
      ok: auth.ok,
      detail: auth.ok ? "code " + short(auth.code) + " bound=" + (victimFlow.challenge ? victimFlow.method : "none") : auth.error
    });

    var attackerExchange = null;
    var clientExchange = null;
    var injected = false;
    var codeForClient = auth.ok ? auth.code : null;
    var attackerCode = null;

    if (params.attacker === "injectedUnbound") {
      var attackerAuth = server.authorize(authFlowFor("attacker", "none", attackerVerifier));
      steps.push({
        label: "attacker obtains unbound code",
        actor: "attacker",
        ok: attackerAuth.ok,
        detail: attackerAuth.ok ? "code " + short(attackerAuth.code) : attackerAuth.error
      });
      if (attackerAuth.ok) {
        codeForClient = attackerAuth.code;
        attackerCode = attackerAuth.code;
        injected = true;
        steps.push({ label: "attacker injects redirect", actor: "attacker", ok: true, detail: "victim client receives attacker code" });
      }
    } else if (auth.ok) {
      var seenVerifier = null;
      if (params.proof === "plain" && params.attacker === "requestAndCode") seenVerifier = victimFlow.challenge;
      if (params.proof === "none") seenVerifier = null;
      if (params.proof === "S256" && params.attacker === "requestAndCode") seenVerifier = verifierFromSeed(0x515256);
      if (params.proof !== "none" && params.attacker === "codeOnly") seenVerifier = null;
      attackerExchange = server.token({
        code: auth.code,
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        verifier: seenVerifier
      });
      steps.push({
        label: "attacker token request",
        actor: "attacker",
        ok: attackerExchange.ok,
        detail: attackerExchange.ok ? "token for " + attackerExchange.owner : attackerExchange.error
      });
    }

    if (codeForClient) {
      var verifierForClient = params.proof === "none" ? null : victimVerifier;
      clientExchange = server.token({
        code: codeForClient,
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        verifier: verifierForClient
      });
      steps.push({
        label: "client token request",
        actor: "victim",
        ok: clientExchange.ok,
        detail: clientExchange.ok ? "token for " + clientExchange.owner : clientExchange.error
      });
    }

    var summary = {
      authCodeIssued: auth.ok ? 1 : 0,
      codeBound: auth.ok && !!victimFlow.challenge ? 1 : 0,
      attackerToken: attackerExchange && attackerExchange.ok ? 1 : 0,
      clientToken: clientExchange && clientExchange.ok && clientExchange.owner === "victim" ? 1 : 0,
      injectedToken: clientExchange && clientExchange.ok && clientExchange.owner === "attacker" ? 1 : 0,
      blocked: steps.filter(function (step) { return !step.ok; }).length,
      injected: injected ? 1 : 0
    };

    var result = {
      params: params,
      proof: PROOFS[params.proof],
      attacker: ATTACKERS[params.attacker],
      server: SERVERS[params.server],
      verifier: victimVerifier,
      challenge: victimFlow.challenge,
      challengeMethod: victimFlow.method,
      attackerCode: attackerCode,
      steps: steps,
      summary: summary
    };
    result.audit = verify(result);
    return result;
  }

  function verify(result) {
    var issues = [];
    var s256VectorMatches = challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "S256") === "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    var s256BlocksInterceptedCode = true;
    var s256AllowsLegitimateClient = true;
    var plainObserverCanRedeem = true;
    var noPkceFirstRedeemer = true;
    var pkceRequiredRejectsNoPkce = true;
    var optionalShowsInjectedUnboundRisk = true;
    var guardedServerBlocksInjectedUnbound = true;

    if (!s256VectorMatches) {
      issues.push("S256 RFC7636 Appendix B test vector failed");
    }
    if (result.params.proof === "S256" && result.params.attacker !== "injectedUnbound" && result.params.server !== "requirePkce") {
      s256BlocksInterceptedCode = !result.summary.attackerToken;
      s256AllowsLegitimateClient = !!result.summary.clientToken;
      if (!s256BlocksInterceptedCode) issues.push("S256 code interception should not give attacker a token");
      if (!s256AllowsLegitimateClient) issues.push("S256 should allow the legitimate client to redeem");
    }
    if (result.params.proof === "plain" && result.params.attacker === "requestAndCode" && result.params.server !== "requirePkce") {
      plainObserverCanRedeem = !!result.summary.attackerToken;
      if (!plainObserverCanRedeem) issues.push("plain request observer should learn enough to redeem first");
    }
    if (result.params.proof === "none" && result.params.attacker !== "injectedUnbound" && result.params.server !== "requirePkce") {
      noPkceFirstRedeemer = !!result.summary.attackerToken;
      if (!noPkceFirstRedeemer) issues.push("unbound intercepted code should be redeemable by first caller");
    }
    if (result.params.server === "requirePkce" && result.params.proof === "none" && result.params.attacker !== "injectedUnbound") {
      pkceRequiredRejectsNoPkce = !result.summary.authCodeIssued;
      if (!pkceRequiredRejectsNoPkce) issues.push("PKCE-required server should reject no-PKCE authorization request");
    }
    if (result.params.attacker === "injectedUnbound" && result.params.server === "optional" && result.params.proof !== "none") {
      optionalShowsInjectedUnboundRisk = !!result.summary.injectedToken;
      if (!optionalShowsInjectedUnboundRisk) issues.push("optional server should demonstrate injected unbound-code risk");
    }
    if (result.params.attacker === "injectedUnbound" && result.params.server !== "optional" && result.params.proof !== "none") {
      guardedServerBlocksInjectedUnbound = !result.summary.injectedToken;
      if (!guardedServerBlocksInjectedUnbound) issues.push("downgrade guard or PKCE requirement should block injected unbound code");
    }
    var checks = [
      { name: "s256-rfc7636-vector", passed: s256VectorMatches },
      { name: "s256-blocks-intercepted-code", passed: s256BlocksInterceptedCode },
      { name: "s256-allows-legitimate-client", passed: s256AllowsLegitimateClient },
      { name: "plain-observer-can-redeem", passed: plainObserverCanRedeem },
      { name: "no-pkce-first-redeemer", passed: noPkceFirstRedeemer },
      { name: "pkce-required-rejects-no-pkce", passed: pkceRequiredRejectsNoPkce },
      { name: "optional-shows-injected-unbound-risk", passed: optionalShowsInjectedUnboundRisk },
      { name: "guarded-server-blocks-injected-unbound", passed: guardedServerBlocksInjectedUnbound }
    ];
    return { ok: issues.length === 0, checks: checks, issues: issues };
  }

  function auditOauthPkceLab() {
    var cases = [];
    Object.keys(PROOFS).forEach(function (proof) {
      Object.keys(ATTACKERS).forEach(function (attacker) {
        Object.keys(SERVERS).forEach(function (server) {
          var result = evaluate({ proof: proof, attacker: attacker, server: server });
          var failedChecks = result.audit.checks.filter(function (check) { return !check.passed; }).map(function (check) { return check.name; });
          cases.push({
            attacker: attacker,
            attackerToken: result.summary.attackerToken,
            authCodeIssued: result.summary.authCodeIssued,
            blocked: result.summary.blocked,
            checks: result.audit.checks,
            clientToken: result.summary.clientToken,
            codeBound: result.summary.codeBound,
            failedChecks: failedChecks,
            injectedToken: result.summary.injectedToken,
            issues: result.audit.issues,
            passed: result.audit.ok,
            passedChecks: result.audit.checks.length - failedChecks.length,
            proof: proof,
            server: server,
            totalChecks: result.audit.checks.length
          });
        });
      });
    });
    var failures = cases.filter(function (row) { return !row.passed; }).map(function (row) {
      return {
        attacker: row.attacker,
        failedChecks: row.failedChecks,
        issues: row.issues,
        proof: row.proof,
        server: row.server
      };
    });
    var byProof = Object.keys(PROOFS).map(function (proof) {
      var rows = cases.filter(function (row) { return row.proof === proof; });
      return {
        attackerTokens: rows.reduce(function (sum, row) { return sum + row.attackerToken; }, 0),
        cases: rows.length,
        clientTokens: rows.reduce(function (sum, row) { return sum + row.clientToken; }, 0),
        injectedTokens: rows.reduce(function (sum, row) { return sum + row.injectedToken; }, 0),
        passed: rows.filter(function (row) { return row.passed; }).length,
        passedChecks: rows.reduce(function (sum, row) { return sum + row.passedChecks; }, 0),
        proof: proof,
        totalChecks: rows.reduce(function (sum, row) { return sum + row.totalChecks; }, 0)
      };
    });
    var passed = cases.filter(function (row) { return row.passed; }).length;
    var passedChecks = cases.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = cases.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    return {
      byProof: byProof,
      cases: cases,
      checked: cases.length,
      details: cases,
      failures: failures,
      ok: failures.length === 0 && passedChecks === totalChecks,
      passed: passed,
      passedChecks: passedChecks,
      total: cases.length,
      totalChecks: totalChecks
    };
  }

  function setText(root, name, value) {
    var node = root.querySelector('[data-metric="' + name + '"]');
    if (node) node.textContent = value;
  }

  function setCanvas(canvas, width, height) {
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ctx;
  }

  function drawText(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.ink;
    ctx.font = (options.weight || 650) + " " + (options.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(value, x, y);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    drawText(ctx, title, box.x + 14, box.y + 18, { size: 13, weight: 850 });
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 39, { size: 11, color: COLORS.muted, weight: 650 });
  }

  function drawFlow(ctx, box, state) {
    panel(ctx, box, "front channel and token endpoint", "PKCE keeps the proof out of the redirect");
    var xs = [box.x + 78, box.x + 270, box.x + 470, box.x + 668, box.x + box.w - 78];
    var labels = ["client", "browser", "auth server", "attacker", "token endpoint"];
    labels.forEach(function (label, i) {
      ctx.fillStyle = i === 3 ? "#fff1f2" : COLORS.white;
      ctx.strokeStyle = i === 3 ? "#fecdd3" : COLORS.rule;
      roundRect(ctx, xs[i] - 54, box.y + 72, 108, 40, 7);
      drawText(ctx, label, xs[i], box.y + 92, { size: 11, align: "center", color: i === 3 ? COLORS.attacker : COLORS.ink, weight: 760 });
    });
    function arrow(from, to, y, color, label) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from, y);
      ctx.lineTo(to, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(to, y);
      ctx.lineTo(to - 7, y - 4);
      ctx.lineTo(to - 7, y + 4);
      ctx.closePath();
      ctx.fill();
      drawText(ctx, label, (from + to) / 2, y - 14, { size: 10, color: color, align: "center" });
    }
    arrow(xs[0] + 54, xs[2] - 54, box.y + 146, COLORS.auth, "challenge " + (state.challengeMethod || "none"));
    arrow(xs[2] - 54, xs[0] + 54, box.y + 186, COLORS.auth, "redirect code");
    arrow(xs[0] + 54, xs[4] - 54, box.y + 226, COLORS.proof, "code + verifier");
    if (state.params.attacker === "injectedUnbound") arrow(xs[3] - 54, xs[0] + 54, box.y + 266, COLORS.attacker, "injected code");
    else arrow(xs[3] - 54, xs[4] - 54, box.y + 266, COLORS.attacker, "stolen code");
  }

  function drawProof(ctx, box, state) {
    panel(ctx, box, "proof ledger", "the server compares a stored challenge to a later verifier");
    var rows = [
      ["method", state.challengeMethod || "none", state.challengeMethod ? COLORS.proof : COLORS.warning],
      ["verifier", state.challengeMethod ? short(state.verifier) : "not sent", COLORS.ink],
      ["challenge", state.challenge ? short(state.challenge) : "not bound", state.challenge ? COLORS.proof : COLORS.warning],
      ["server", state.server.label, COLORS.ink],
      ["audit", state.audit.ok ? "passes" : "fails", state.audit.ok ? COLORS.proof : COLORS.attacker]
    ];
    rows.forEach(function (row, i) {
      var y = box.y + 70 + i * 27;
      drawText(ctx, row[0], box.x + 18, y, { size: 11, color: COLORS.muted });
      drawText(ctx, row[1], box.x + 112, y, { size: 11, color: row[2], weight: 760 });
    });
  }

  function drawSteps(ctx, box, state) {
    panel(ctx, box, "exchange trace", "a failed verifier check does not become a token");
    state.steps.forEach(function (step, i) {
      var y = box.y + 70 + i * 36;
      var color = step.actor === "attacker" ? COLORS.attacker : step.ok ? COLORS.proof : COLORS.warning;
      ctx.fillStyle = step.ok ? "#ecfdf5" : "#fff7ed";
      ctx.strokeStyle = step.ok ? "#bbf7d0" : "#fed7aa";
      if (step.actor === "attacker") {
        ctx.fillStyle = step.ok ? "#fff1f2" : "#f8fafc";
        ctx.strokeStyle = step.ok ? "#fecdd3" : COLORS.rule;
      }
      roundRect(ctx, box.x + 18, y - 13, 26, 26, 13);
      drawText(ctx, String(i + 1), box.x + 31, y, { size: 10, color: color, align: "center", weight: 850 });
      drawText(ctx, step.label, box.x + 56, y - 7, { size: 11, color: COLORS.ink, weight: 760 });
      drawText(ctx, step.detail, box.x + 56, y + 9, { size: 10, color: COLORS.muted, weight: 600 });
    });
  }

  function drawOutcome(ctx, box, state) {
    panel(ctx, box, "who got a token?", "authorization code theft is about redemption, not possession");
    var rows = [
      ["attacker", state.summary.attackerToken, COLORS.attacker],
      ["victim client", state.summary.clientToken, COLORS.proof],
      ["injected attacker token", state.summary.injectedToken, COLORS.warning],
      ["blocked steps", state.summary.blocked, COLORS.auth]
    ];
    var max = Math.max.apply(null, rows.map(function (row) { return row[1]; }).concat([1]));
    rows.forEach(function (row, i) {
      var y = box.y + 72 + i * 37;
      drawText(ctx, row[0], box.x + 18, y + 9, { size: 11, color: COLORS.muted });
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.rule;
      roundRect(ctx, box.x + 152, y, box.w - 178, 18, 9);
      ctx.fillStyle = row[2];
      ctx.strokeStyle = "transparent";
      roundRect(ctx, box.x + 152, y, Math.max(row[1] ? 10 : 0, (box.w - 178) * row[1] / max), 18, 9);
      drawText(ctx, String(row[1]), box.x + box.w - 18, y + 9, { size: 11, color: COLORS.ink, align: "right" });
    });
  }

  function draw(canvas, state) {
    var compact = canvas.clientWidth && canvas.clientWidth < 620;
    var width = compact ? 760 : 980;
    var height = compact ? 920 : 720;
    var ctx = setCanvas(canvas, width, height);
    ctx.clearRect(0, 0, width, height);
    if (compact) {
      drawFlow(ctx, { x: 16, y: 16, w: width - 32, h: 320 }, state);
      drawProof(ctx, { x: 16, y: 358, w: width - 32, h: 190 }, state);
      drawSteps(ctx, { x: 16, y: 570, w: width - 32, h: 190 }, state);
      drawOutcome(ctx, { x: 16, y: 782, w: width - 32, h: 122 }, state);
    } else {
      drawFlow(ctx, { x: 18, y: 18, w: 944, h: 310 }, state);
      drawProof(ctx, { x: 18, y: 352, w: 300, h: 190 }, state);
      drawSteps(ctx, { x: 340, y: 352, w: 622, h: 190 }, state);
      drawOutcome(ctx, { x: 18, y: 566, w: 944, h: 132 }, state);
    }
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("output[data-value]").forEach(function (output) {
      var name = output.getAttribute("data-value");
      if (name === "proof") output.textContent = PROOFS[params.proof].label;
      else if (name === "attacker") output.textContent = ATTACKERS[params.attacker].label;
      else if (name === "server") output.textContent = SERVERS[params.server].label;
    });
  }

  function render(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (control) {
      raw[control.getAttribute("data-param")] = control.value;
    });
    var state = evaluate(raw);
    root.__oauthPkceState = state;
    updateOutputs(root, state.params);
    setText(root, "bound", state.summary.codeBound ? "yes" : "no");
    setText(root, "attacker", state.summary.attackerToken ? "yes" : "no");
    setText(root, "client", state.summary.clientToken ? "yes" : "no");
    setText(root, "injected", state.summary.injectedToken ? "yes" : "no");
    setText(root, "blocked", state.summary.blocked);
    setText(root, "audit", state.audit.ok ? "passes" : "fails");
    var note = root.querySelector("[data-pkce-note]");
    if (note) note.textContent = PROOFS[state.params.proof].note + ". Attacker model: " + ATTACKERS[state.params.attacker].note + ". Server policy: " + SERVERS[state.params.server].note + ".";
    var canvas = root.querySelector("canvas");
    if (canvas) draw(canvas, state);
  }

  function init(root) {
    if (!root || root.__oauthPkceReady) return;
    root.__oauthPkceReady = true;
    root.querySelectorAll("[data-param]").forEach(function (control) {
      control.addEventListener("input", function () { render(root); });
      control.addEventListener("change", function () { render(root); });
    });
    render(root);
    global.addEventListener("resize", function () { render(root); });
  }

  function mount() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-oauth-pkce-lab]")).forEach(init);
  }

  var api = {
    sha256Ascii: sha256Ascii,
    base64url: base64url,
    verifierFromSeed: verifierFromSeed,
    challengeFor: challengeFor,
    normalize: normalize,
    evaluate: evaluate,
    verify: verify,
    auditOauthPkceLab: auditOauthPkceLab
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OauthPkceLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
