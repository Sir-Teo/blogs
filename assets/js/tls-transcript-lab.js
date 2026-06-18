(function (global) {
  "use strict";

  var HASH_LEN = 32;

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    client: "#2563eb",
    server: "#7c3aed",
    good: "#0f766e",
    bad: "#be123c",
    amber: "#b45309",
    legacy: "#64748b"
  };

  var DEFAULTS = {
    scenario: "clean",
    seed: 37,
    alpn: "h2",
    secret: 11
  };

  var SCENARIOS = {
    clean: {
      label: "matching transcript",
      note: "both endpoints hash the same handshake bytes and share the same ECDHE secret"
    },
    hello: {
      label: "ServerHello rewrite",
      note: "the client hashes a different ServerHello, so handshake traffic secrets diverge"
    },
    extension: {
      label: "extension rewrite",
      note: "hello keys match, but CertificateVerify and Finished bind the later transcript"
    },
    certificate: {
      label: "certificate swap",
      note: "the traffic key is unchanged, but the authentication transcript no longer verifies"
    },
    secret: {
      label: "ECDHE mismatch",
      note: "the transcript agrees, but the shared secret does not"
    }
  };

  var ALPNS = {
    h2: "h2",
    http1: "http/1.1",
    grpc: "grpc-exp"
  };

  var TYPES = {
    ClientHello: 1,
    ServerHello: 2,
    EncryptedExtensions: 8,
    Certificate: 11,
    CertificateVerify: 15
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var alpn = ALPNS[raw.alpn] ? raw.alpn : DEFAULTS.alpn;
    return {
      scenario: scenario,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 999)),
      alpn: alpn,
      secret: Math.round(clamp(finite(Number(raw.secret), DEFAULTS.secret), 1, 64))
    };
  }

  function nodeCrypto() {
    if (typeof require !== "function") return null;
    try {
      return require("crypto");
    } catch (err) {
      return null;
    }
  }

  function utf8(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value);
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "utf8"));
    throw new Error("No UTF-8 encoder available");
  }

  function concat(arrays) {
    var length = arrays.reduce(function (sum, row) { return sum + row.length; }, 0);
    var out = new Uint8Array(length);
    var offset = 0;
    arrays.forEach(function (row) {
      out.set(row, offset);
      offset += row.length;
    });
    return out;
  }

  function u16(value) {
    return new Uint8Array([(value >>> 8) & 255, value & 255]);
  }

  function u24(value) {
    return new Uint8Array([(value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
  }

  function u8(value) {
    return new Uint8Array([value & 255]);
  }

  function hex(bytes, chars) {
    var out = "";
    for (var i = 0; i < bytes.length; i += 1) {
      out += bytes[i].toString(16).padStart(2, "0");
      if (chars && out.length >= chars) return out.slice(0, chars);
    }
    return out;
  }

  function fromHex(value) {
    var clean = value.replace(/[^0-9a-f]/gi, "");
    var out = new Uint8Array(clean.length / 2);
    for (var i = 0; i < out.length; i += 1) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  function equalBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  function hash32(value, seed) {
    var x = seed >>> 0;
    for (var i = 0; i < value.length; i += 1) {
      x ^= value.charCodeAt(i);
      x = Math.imul(x, 0x9e3779b1) >>> 0;
      x ^= x >>> 16;
    }
    x = Math.imul(x ^ (x >>> 15), 0x7feb352d) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }

  function seededHex(label, seed, bytes) {
    var out = new Uint8Array(bytes);
    var state = hash32(label, seed);
    for (var i = 0; i < bytes; i += 1) {
      state = hash32(label + ":" + i, state + seed + i * 17);
      out[i] = state & 255;
    }
    return hex(out);
  }

  function subtle() {
    return global.crypto && global.crypto.subtle ? global.crypto.subtle : null;
  }

  function sha256(data) {
    var crypto = nodeCrypto();
    if (crypto) {
      return Promise.resolve(new Uint8Array(crypto.createHash("sha256").update(Buffer.from(data)).digest()));
    }
    var api = subtle();
    if (!api) return Promise.reject(new Error("SHA-256 requires Web Crypto or Node crypto"));
    return api.digest("SHA-256", data).then(function (buf) { return new Uint8Array(buf); });
  }

  function hmac(key, data) {
    var crypto = nodeCrypto();
    if (crypto) {
      return Promise.resolve(new Uint8Array(crypto.createHmac("sha256", Buffer.from(key)).update(Buffer.from(data)).digest()));
    }
    var api = subtle();
    if (!api) return Promise.reject(new Error("HMAC requires Web Crypto or Node crypto"));
    return api.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      .then(function (cryptoKey) { return api.sign("HMAC", cryptoKey, data); })
      .then(function (buf) { return new Uint8Array(buf); });
  }

  function hkdfExtract(salt, ikm) {
    return hmac(salt, ikm);
  }

  function hkdfExpand(prk, info, length) {
    var blocks = [];
    var previous = new Uint8Array(0);
    var counter = 1;
    function next() {
      if (concat(blocks).length >= length) return concat(blocks).slice(0, length);
      return hmac(prk, concat([previous, info, u8(counter)])).then(function (block) {
        blocks.push(block);
        previous = block;
        counter += 1;
        return next();
      });
    }
    return Promise.resolve().then(next);
  }

  function hkdfLabel(label, context, length) {
    var full = utf8("tls13 " + label);
    return concat([u16(length), u8(full.length), full, u8(context.length), context]);
  }

  function hkdfExpandLabel(secret, label, context, length) {
    return hkdfExpand(secret, hkdfLabel(label, context, length), length);
  }

  function messageBody(message) {
    return utf8(message.fields.map(function (row) {
      return row[0] + "=" + row[1];
    }).join("\n"));
  }

  function encodeMessage(message) {
    var body = messageBody(message);
    return concat([u8(message.type), u24(body.length), body]);
  }

  function transcriptBytes(messages) {
    return concat(messages.map(encodeMessage));
  }

  function transcriptHash(messages) {
    return sha256(transcriptBytes(messages));
  }

  function makeMessage(name, fields) {
    return { name: name, type: TYPES[name], fields: fields };
  }

  function setField(message, key, value) {
    message.fields = message.fields.map(function (row) {
      return row[0] === key ? [row[0], value] : row;
    });
  }

  function cloneMessage(message) {
    return {
      name: message.name,
      type: message.type,
      fields: message.fields.map(function (row) { return [row[0], row[1]]; })
    };
  }

  function basePreCertificateVerify(params) {
    var alpn = ALPNS[params.alpn];
    return [
      makeMessage("ClientHello", [
        ["legacy_version", "0x0303"],
        ["random", seededHex("client-random", params.seed, 32)],
        ["server_name", "example.com"],
        ["supported_versions", "tls13"],
        ["cipher_suites", "TLS_AES_128_GCM_SHA256,TLS_CHACHA20_POLY1305_SHA256"],
        ["key_share", "x25519:" + seededHex("client-share", params.seed, 8)],
        ["alpn", "h2,http/1.1,grpc-exp"]
      ]),
      makeMessage("ServerHello", [
        ["random", seededHex("server-random", params.seed, 32)],
        ["supported_version", "tls13"],
        ["cipher_suite", "TLS_AES_128_GCM_SHA256"],
        ["key_share", "x25519:" + seededHex("server-share", params.seed, 8)]
      ]),
      makeMessage("EncryptedExtensions", [
        ["alpn", alpn],
        ["record_size_limit", "16384"],
        ["early_data", "not_accepted"]
      ]),
      makeMessage("Certificate", [
        ["subject", "CN=example.com"],
        ["san", "example.com,www.example.com"],
        ["spki", "ed25519:" + seededHex("server-spki", 1, 10)]
      ])
    ];
  }

  function scenarioViews(params) {
    var server = basePreCertificateVerify(params);
    var client = server.map(cloneMessage);
    if (params.scenario === "hello") {
      setField(client[1], "cipher_suite", "TLS_CHACHA20_POLY1305_SHA256");
    } else if (params.scenario === "extension") {
      setField(client[2], "alpn", params.alpn === "h2" ? "http/1.1" : "h2");
    } else if (params.scenario === "certificate") {
      setField(client[3], "subject", "CN=payments.example.com");
      setField(client[3], "san", "payments.example.com");
      setField(client[3], "spki", "ed25519:" + seededHex("attacker-spki", params.seed, 10));
    }
    return { serverPre: server, clientPre: client };
  }

  function certificateVerifyInput(hashValue) {
    return concat([
      utf8(" ".repeat(64)),
      utf8("TLS 1.3, server CertificateVerify"),
      u8(0),
      hashValue
    ]);
  }

  function cvSigningKey(params) {
    return utf8("demo server signing key; not part of TLS; seed=" + params.seed);
  }

  function ecdheSecret(params, side) {
    var suffix = params.scenario === "secret" && side === "client" ? ":client-mismatch" : ":shared";
    return utf8("x25519 shared secret " + params.secret + suffix);
  }

  function zeroBytes() {
    return new Uint8Array(HASH_LEN);
  }

  function deriveSecret(secret, label, messages) {
    return transcriptHash(messages).then(function (th) {
      return hkdfExpandLabel(secret, label, th, HASH_LEN);
    });
  }

  function computeSide(params, side, messagesWithCv) {
    var psk = zeroBytes();
    var zero = zeroBytes();
    var helloMessages = messagesWithCv.slice(0, 2);
    var preCvMessages = messagesWithCv.slice(0, 4);
    var authMessages = messagesWithCv.slice(0, 5);
    var out = { side: side };
    return Promise.all([
      transcriptHash(helloMessages),
      transcriptHash(preCvMessages),
      transcriptHash(authMessages),
      sha256(new Uint8Array(0))
    ]).then(function (hashes) {
      out.helloHash = hashes[0];
      out.preCvHash = hashes[1];
      out.authHash = hashes[2];
      out.emptyHash = hashes[3];
      return hkdfExtract(zero, psk);
    }).then(function (earlySecret) {
      out.earlySecret = earlySecret;
      return hkdfExpandLabel(earlySecret, "derived", out.emptyHash, HASH_LEN);
    }).then(function (derivedSecret) {
      out.derivedSecret = derivedSecret;
      return hkdfExtract(derivedSecret, ecdheSecret(params, side));
    }).then(function (handshakeSecret) {
      out.handshakeSecret = handshakeSecret;
      return Promise.all([
        deriveSecret(handshakeSecret, "s hs traffic", helloMessages),
        hkdfExpandLabel(handshakeSecret, "legacy secret-only demo", new Uint8Array(0), HASH_LEN)
      ]);
    }).then(function (values) {
      out.trafficSecret = values[0];
      out.secretOnlyDemo = values[1];
      return hkdfExpandLabel(out.trafficSecret, "finished", new Uint8Array(0), HASH_LEN);
    }).then(function (finishedKey) {
      out.finishedKey = finishedKey;
      return hmac(finishedKey, out.authHash);
    }).then(function (verifyData) {
      out.verifyData = verifyData;
      return out;
    });
  }

  function makeCertificateVerify(params, serverPre) {
    return transcriptHash(serverPre)
      .then(function (preHash) { return hmac(cvSigningKey(params), certificateVerifyInput(preHash)); })
      .then(function (proof) {
        return {
          proof: proof,
          message: makeMessage("CertificateVerify", [
            ["scheme", "ed25519"],
            ["signed_context", "TLS 1.3, server CertificateVerify"],
            ["toy_signature", hex(proof)]
          ])
        };
      });
  }

  function summarize(result) {
    var server = result.server;
    var client = result.client;
    return {
      helloHashMatch: equalBytes(server.helloHash, client.helloHash),
      preCvHashMatch: equalBytes(server.preCvHash, client.preCvHash),
      authHashMatch: equalBytes(server.authHash, client.authHash),
      handshakeSecretMatch: equalBytes(server.handshakeSecret, client.handshakeSecret),
      trafficSecretMatch: equalBytes(server.trafficSecret, client.trafficSecret),
      secretOnlyDemoMatch: equalBytes(server.secretOnlyDemo, client.secretOnlyDemo),
      certificateVerifyOk: equalBytes(result.certificateVerify.proof, result.clientExpectedCertificateVerify),
      finishedOk: equalBytes(server.verifyData, client.verifyData)
    };
  }

  function verdict(summary) {
    if (!summary.handshakeSecretMatch) return "fail: the ECDHE shared secret is not shared";
    if (!summary.trafficSecretMatch) return "fail: transcript-bound handshake traffic secrets diverge";
    if (!summary.certificateVerifyOk) return "fail: CertificateVerify signs a different transcript";
    if (!summary.finishedOk) return "fail: Finished MAC checks a different transcript";
    return "accept: transcript, authentication, and Finished agree";
  }

  function auditOne(result) {
    var s = result.summary;
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    check("server and client have five modeled messages", result.serverMessages.length === 5 && result.clientMessages.length === 5);
    check("hashes are 32 bytes", result.server.helloHash.length === HASH_LEN && result.client.authHash.length === HASH_LEN);
    check("Finished values are 32 bytes", result.server.verifyData.length === HASH_LEN && result.client.verifyData.length === HASH_LEN);
    if (result.params.scenario === "clean") {
      check("clean transcript accepts", s.helloHashMatch && s.certificateVerifyOk && s.finishedOk && s.trafficSecretMatch);
    }
    if (result.params.scenario === "hello") {
      check("hello rewrite changes hello hash", !s.helloHashMatch);
      check("hello rewrite changes traffic secret", !s.trafficSecretMatch);
      check("secret-only demo misses transcript rewrite", s.secretOnlyDemoMatch);
    }
    if (result.params.scenario === "extension") {
      check("extension rewrite keeps hello traffic key", s.trafficSecretMatch);
      check("extension rewrite breaks authentication", !s.certificateVerifyOk && !s.finishedOk);
    }
    if (result.params.scenario === "certificate") {
      check("certificate swap keeps hello traffic key", s.trafficSecretMatch);
      check("certificate swap breaks authentication", !s.certificateVerifyOk && !s.finishedOk);
    }
    if (result.params.scenario === "secret") {
      check("secret mismatch keeps transcript", s.helloHashMatch && s.preCvHashMatch);
      check("secret mismatch changes traffic key", !s.trafficSecretMatch);
    }
    return { passed: checks.every(function (row) { return row.ok; }), checks: checks };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var views = scenarioViews(params);
    return makeCertificateVerify(params, views.serverPre).then(function (cv) {
      var serverMessages = views.serverPre.concat([cv.message]);
      var clientMessages = views.clientPre.concat([cloneMessage(cv.message)]);
      return Promise.all([
        computeSide(params, "server", serverMessages),
        computeSide(params, "client", clientMessages),
        transcriptHash(views.clientPre)
      ]).then(function (parts) {
        return hmac(cvSigningKey(params), certificateVerifyInput(parts[2])).then(function (expectedCv) {
          var result = {
            params: params,
            scenario: SCENARIOS[params.scenario],
            serverMessages: serverMessages,
            clientMessages: clientMessages,
            certificateVerify: cv,
            server: parts[0],
            client: parts[1],
            clientExpectedCertificateVerify: expectedCv
          };
          result.summary = summarize(result);
          result.verdict = verdict(result.summary);
          result.audit = auditOne(result);
          return result;
        });
      });
    });
  }

  function hkdfVectorOk() {
    var ikm = fromHex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");
    var salt = fromHex("000102030405060708090a0b0c");
    var info = fromHex("f0f1f2f3f4f5f6f7f8f9");
    var expectedPrk = "077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5";
    var expectedOkm = "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865";
    return hkdfExtract(salt, ikm).then(function (prk) {
      return hkdfExpand(prk, info, 42).then(function (okm) {
        return hex(prk) === expectedPrk && hex(okm) === expectedOkm;
      });
    });
  }

  function auditGrid() {
    var cases = [
      { scenario: "clean", seed: 37, alpn: "h2", secret: 11 },
      { scenario: "hello", seed: 37, alpn: "h2", secret: 11 },
      { scenario: "extension", seed: 37, alpn: "h2", secret: 11 },
      { scenario: "certificate", seed: 37, alpn: "h2", secret: 11 },
      { scenario: "secret", seed: 37, alpn: "h2", secret: 11 },
      { scenario: "clean", seed: 251, alpn: "grpc", secret: 47 }
    ];
    return Promise.all(cases.map(function (params) {
      return evaluate(params).then(function (result) {
        var failedChecks = result.audit.checks.filter(function (row) { return !row.ok; }).map(function (row) { return row.name; });
        return {
          certificateVerifyOk: result.summary.certificateVerifyOk,
          checks: result.audit.checks,
          failedChecks: failedChecks,
          finishedOk: result.summary.finishedOk,
          helloHashMatch: result.summary.helloHashMatch,
          params: result.params,
          passed: result.audit.passed,
          passedChecks: result.audit.checks.length - failedChecks.length,
          secretOnlyDemoMatch: result.summary.secretOnlyDemoMatch,
          totalChecks: result.audit.checks.length,
          trafficSecretMatch: result.summary.trafficSecretMatch,
          verdict: result.verdict
        };
      });
    })).then(function (rows) {
      return hkdfVectorOk().then(function (ok) {
        var passed = rows.filter(function (row) { return row.passed; }).length;
        var criticalChecks = [{
          check: "RFC 5869 HKDF test vector",
          failedChecks: ok ? [] : ["RFC 5869 HKDF test vector"],
          passed: ok,
          passedChecks: ok ? 1 : 0,
          totalChecks: 1
        }];
        var passedChecks = criticalChecks.reduce(function (sum, row) {
          return sum + row.passedChecks;
        }, 0) + rows.reduce(function (sum, row) {
          return sum + row.passedChecks;
        }, 0);
        var totalChecks = criticalChecks.reduce(function (sum, row) {
          return sum + row.totalChecks;
        }, 0) + rows.reduce(function (sum, row) {
          return sum + row.totalChecks;
        }, 0);
        var errors = criticalChecks.reduce(function (acc, row) {
          return acc.concat(row.failedChecks);
        }, []).concat(rows.reduce(function (acc, row) {
          return acc.concat(row.failedChecks);
        }, []));
        var byScenario = {};
        rows.forEach(function (row) {
          var key = row.params.scenario;
          if (!byScenario[key]) {
            byScenario[key] = {
              cases: 0,
              passed: 0,
              passedChecks: 0,
              scenario: key,
              totalChecks: 0
            };
          }
          byScenario[key].cases += 1;
          byScenario[key].passed += row.passed ? 1 : 0;
          byScenario[key].passedChecks += row.passedChecks;
          byScenario[key].totalChecks += row.totalChecks;
        });
        return {
          byScenario: Object.keys(byScenario).sort().map(function (key) { return byScenario[key]; }),
          caseTotal: rows.length,
          criticalChecks: criticalChecks,
          criticalTotal: criticalChecks.length,
          errors: errors,
          hkdfVectorOk: ok,
          ok: errors.length === 0 && passedChecks === totalChecks,
          passed: passed + (ok ? 1 : 0),
          passedChecks: passedChecks,
          rows: rows,
          total: rows.length + criticalChecks.length,
          totalChecks: totalChecks
        };
      });
    });
  }

  function fmtHex(bytes) {
    return hex(bytes, 16) + "...";
  }

  function metric(label, value, className) {
    return '<div class="tls-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 18, COLORS.text, 12, 800);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 38, COLORS.muted, 10, 600);
  }

  function drawMessageLane(ctx, result, box) {
    panel(ctx, box, "transcript bytes", "handshake type + length + body feed the hash");
    var left = box.x + 20;
    var top = box.y + 65;
    var rowH = 40;
    text(ctx, "server view", left + 112, box.y + 50, COLORS.server, 11, 800, "center");
    text(ctx, "client view", left + 348, box.y + 50, COLORS.client, 11, 800, "center");
    result.serverMessages.forEach(function (message, i) {
      var y = top + i * rowH;
      var client = result.clientMessages[i];
      var same = messageBody(message).length === messageBody(client).length && hex(messageBody(message)) === hex(messageBody(client));
      text(ctx, message.name, left, y, COLORS.text, 10, 800);
      ctx.fillStyle = COLORS.server;
      ctx.globalAlpha = 0.14;
      ctx.fillRect(left + 100, y - 13, 190, 24);
      ctx.fillStyle = same ? COLORS.good : COLORS.bad;
      ctx.fillRect(left + 336, y - 13, 190, 24);
      ctx.globalAlpha = same ? 0.14 : 0.2;
      ctx.fillRect(left + 336, y - 13, 190, 24);
      ctx.globalAlpha = 1;
      text(ctx, fmtHex(encodeMessage(message)), left + 112, y, COLORS.server, 10, 750);
      text(ctx, fmtHex(encodeMessage(client)), left + 348, y, same ? COLORS.good : COLORS.bad, 10, 750);
    });
  }

  function drawKeySchedule(ctx, result, box) {
    panel(ctx, box, "key schedule", "HKDF adds secret material, Derive-Secret adds transcript context");
    var y = box.y + 78;
    var x = box.x + 28;
    function node(label, value, color, offset) {
      var nx = x + offset;
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(nx, y, 160, 58, 8);
      ctx.fill();
      ctx.stroke();
      text(ctx, label, nx + 12, y + 18, color, 10, 800);
      text(ctx, value, nx + 12, y + 40, COLORS.muted, 10, 650);
    }
    node("HKDF-Extract", "ECDHE -> handshake", COLORS.amber, 0);
    node("Transcript-Hash", fmtHex(result.server.helloHash), COLORS.server, 188);
    node("Derive-Secret", "s hs traffic", COLORS.good, 376);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 2;
    [178, 366].forEach(function (xx) {
      ctx.beginPath();
      ctx.moveTo(x + xx, y + 29);
      ctx.lineTo(x + xx + 24, y + 29);
      ctx.stroke();
    });
    var s = result.summary;
    var rows = [
      ["handshake secret", s.handshakeSecretMatch],
      ["hello transcript hash", s.helloHashMatch],
      ["TLS-style traffic secret", s.trafficSecretMatch],
      ["secret-only demo key", s.secretOnlyDemoMatch]
    ];
    rows.forEach(function (row, i) {
      var yy = box.y + 168 + i * 25;
      ctx.fillStyle = row[1] ? COLORS.good : COLORS.bad;
      ctx.fillRect(x, yy - 8, 10, 10);
      text(ctx, row[0], x + 18, yy - 3, COLORS.text, 11, 700);
      text(ctx, row[1] ? "match" : "different", box.x + box.w - 22, yy - 3, row[1] ? COLORS.good : COLORS.bad, 11, 800, "right");
    });
  }

  function drawChecks(ctx, result, box) {
    panel(ctx, box, "authentication checks", "later handshake messages are bound before application data");
    var rows = [
      ["CertificateVerify", result.summary.certificateVerifyOk, "signature over transcript through Certificate"],
      ["Finished", result.summary.finishedOk, "HMAC over transcript through CertificateVerify"],
      ["Overall", result.audit.passed, result.verdict]
    ];
    rows.forEach(function (row, i) {
      var y = box.y + 70 + i * 62;
      ctx.fillStyle = row[1] ? COLORS.good : COLORS.bad;
      ctx.beginPath();
      ctx.roundRect(box.x + 24, y - 18, 112, 34, 8);
      ctx.fill();
      text(ctx, row[1] ? "passes" : "fails", box.x + 80, y, COLORS.white, 12, 850, "center");
      text(ctx, row[0], box.x + 154, y - 8, COLORS.text, 12, 800);
      text(ctx, row[2], box.x + 154, y + 12, COLORS.muted, 10, 650);
    });
  }

  function drawHashLedger(ctx, result, box) {
    panel(ctx, box, "hash ledger", "small hex prefixes from the computed SHA-256/HMAC values");
    var rows = [
      ["server hello hash", result.server.helloHash, COLORS.server],
      ["client hello hash", result.client.helloHash, COLORS.client],
      ["server Finished", result.server.verifyData, COLORS.server],
      ["client expected", result.client.verifyData, COLORS.client]
    ];
    rows.forEach(function (row, i) {
      var y = box.y + 68 + i * 36;
      text(ctx, row[0], box.x + 22, y, row[2], 11, 800);
      text(ctx, fmtHex(row[1]), box.x + box.w - 22, y, COLORS.text, 11, 700, "right");
    });
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    var gap = 14;
    drawMessageLane(ctx, result, { x: gap, y: gap, w: width - 2 * gap, h: 276 });
    drawKeySchedule(ctx, result, { x: gap, y: 304, w: width - 2 * gap, h: 270 });
    drawChecks(ctx, result, { x: gap, y: 592, w: Math.floor((width - 3 * gap) * 0.55), h: height - 606 });
    drawHashLedger(ctx, result, { x: Math.floor((width - 3 * gap) * 0.55) + 2 * gap, y: 592, w: width - Math.floor((width - 3 * gap) * 0.55) - 3 * gap, h: height - 606 });
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return normalize(raw);
  }

  function setOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      var value = params[key];
      if (key === "scenario") value = SCENARIOS[params.scenario].label;
      if (key === "alpn") value = ALPNS[params.alpn];
      output.textContent = value;
    });
  }

  function render(root) {
    var params = readParams(root);
    var token = (root.__tlsTranscriptToken || 0) + 1;
    root.__tlsTranscriptToken = token;
    setOutputs(root, params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) metrics.innerHTML = metric("status", "computing", "");
    return evaluate(params).then(function (result) {
      if (root.__tlsTranscriptToken !== token) return result;
      if (metrics) {
        metrics.innerHTML = [
          metric("hello hash", result.summary.helloHashMatch ? "match" : "different", result.summary.helloHashMatch ? "tls-lab__metric--good" : "tls-lab__metric--bad"),
          metric("traffic secret", result.summary.trafficSecretMatch ? "match" : "different", result.summary.trafficSecretMatch ? "tls-lab__metric--good" : "tls-lab__metric--bad"),
          metric("secret-only demo", result.summary.secretOnlyDemoMatch ? "match" : "different", result.summary.secretOnlyDemoMatch ? "tls-lab__metric--warn" : "tls-lab__metric--bad"),
          metric("CertificateVerify", result.summary.certificateVerifyOk ? "passes" : "fails", result.summary.certificateVerifyOk ? "tls-lab__metric--good" : "tls-lab__metric--bad"),
          metric("Finished", result.summary.finishedOk ? "passes" : "fails", result.summary.finishedOk ? "tls-lab__metric--good" : "tls-lab__metric--bad"),
          metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "tls-lab__metric--good" : "tls-lab__metric--bad")
        ].join("");
      }
      var note = root.querySelector("[data-note]");
      if (note) note.textContent = SCENARIOS[result.params.scenario].note + " " + result.verdict + ".";
      var messages = root.querySelector("[data-messages]");
      if (messages) {
        messages.innerHTML = result.serverMessages.map(function (message, i) {
          var client = result.clientMessages[i];
          var same = hex(messageBody(message)) === hex(messageBody(client));
          return '<tr><th>' + esc(message.name) + '</th><td>' + esc(fmtHex(encodeMessage(message))) + '</td><td class="' + (same ? "ok" : "bad") + '">' + esc(fmtHex(encodeMessage(client))) + '</td></tr>';
        }).join("");
      }
      var canvas = root.querySelector("[data-canvas]");
      if (canvas) draw(result, canvas);
      root.__tlsTranscriptResult = result;
      return result;
    }).catch(function (err) {
      if (metrics) metrics.innerHTML = metric("status", err.message || "crypto unavailable", "tls-lab__metric--bad");
      throw err;
    });
  }

  function init(root) {
    if (!root || root.__tlsTranscriptReady) return;
    root.__tlsTranscriptReady = true;
    var timer = null;
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(root); }, 80);
      });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-tls-transcript-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-tls-transcript-lab]")).forEach(init);
    }
  }

  var api = {
    evaluate: evaluate,
    auditGrid: auditGrid,
    hkdfVectorOk: hkdfVectorOk,
    normalize: normalize,
    encodeMessage: encodeMessage,
    transcriptHash: transcriptHash,
    hkdfExpandLabel: hkdfExpandLabel
  };

  global.TlsTranscriptLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
