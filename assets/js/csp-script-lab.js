(function (global) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    allowed: "#0f766e",
    blocked: "#be123c",
    app: "#2563eb",
    attacker: "#be123c",
    dynamic: "#7c3aed",
    warning: "#b45309"
  };

  var NONCE = "r4nd0m-demo-nonce";
  var SELF_ORIGIN = "https://app.example";
  var CONFIG_SCRIPT = "window.appConfig={release:'2026.06',flags:['charts']};";

  var DEFAULTS = {
    policy: "nonceStrictDynamic",
    scenario: "dynamicDependency"
  };

  var POLICY_DEFS = {
    hostAllowlist: {
      label: "host allowlist",
      csp: "script-src 'self' https://cdn.example",
      tokens: ["'self'", "https://cdn.example"],
      note: "trusts locations; parser-inserted CDN scripts can execute"
    },
    nonceOnly: {
      label: "nonce only",
      csp: "script-src 'nonce-" + NONCE + "'",
      tokens: ["'nonce-" + NONCE + "'"],
      note: "trusts scripts carrying the one-response nonce, but not their descendants"
    },
    nonceStrictDynamic: {
      label: "nonce + strict-dynamic",
      csp: "script-src 'nonce-" + NONCE + "' 'strict-dynamic' https:",
      tokens: ["'nonce-" + NONCE + "'", "'strict-dynamic'", "https:"],
      note: "trusts the nonce root and then non-parser-inserted descendants"
    },
    hashAndSelf: {
      label: "hash + self",
      csp: "script-src 'self' {hash}",
      tokens: function () {
        return ["'self'", hashSourceFor(CONFIG_SCRIPT)];
      },
      note: "allows same-origin app code and one exact inline configuration block"
    },
    unsafeInline: {
      label: "unsafe inline + https",
      csp: "script-src 'unsafe-inline' https:",
      tokens: ["'unsafe-inline'", "https:"],
      note: "keeps old inline behavior and allows any HTTPS script URL"
    }
  };

  var SCENARIO_DEFS = {
    inlineInjection: {
      label: "inline XSS",
      note: "an injected inline block and event handler arrive next to legitimate app code",
      scripts: function () {
        return [
          appScript([]),
          configScript(),
          inlineScript("xss-inline", "injected inline", "stealSession()", "attacker", true),
          eventHandler("onclick handler", "stealFromClick()")
        ];
      }
    },
    cdnCompromise: {
      label: "CDN endpoint turns hostile",
      note: "the page includes a parser-inserted CDN script that is now attacker-controlled",
      scripts: function () {
        return [
          appScript([]),
          configScript(),
          externalScript("cdn-widget", "cdn widget", "https://cdn.example/widget.js", "attacker", true, true)
        ];
      }
    },
    dynamicDependency: {
      label: "runtime dependency",
      note: "trusted app code creates a script element for a dependency at runtime",
      scripts: function () {
        return [
          appScript([
            externalScript("runtime-widget", "runtime widget", "https://cdn.example/widget.js", "dependency", false, false)
          ]),
          configScript()
        ];
      }
    },
    untrustedLoader: {
      label: "tainted loader URL",
      note: "trusted app code creates a runtime script URL from attacker-controlled data",
      scripts: function () {
        var child = externalScript("tainted-child", "query-selected script", "https://evil.example/loot.js", "attacker", true, false);
        child.tainted = true;
        return [
          appScript([child]),
          configScript()
        ];
      }
    }
  };

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
    var i;
    for (i = 0; i < message.length; i += 1) bytes.push(message.charCodeAt(i) & 0xff);
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

  function base64(bytes) {
    var table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var out = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      var n = (b0 << 16) | (b1 << 8) | b2;
      out += table[(n >>> 18) & 63];
      out += table[(n >>> 12) & 63];
      out += i + 1 < bytes.length ? table[(n >>> 6) & 63] : "=";
      out += i + 2 < bytes.length ? table[n & 63] : "=";
    }
    return out;
  }

  function hashSourceFor(source) {
    return "'sha256-" + base64(sha256Ascii(source)) + "'";
  }

  function cloneScript(script) {
    var out = {};
    Object.keys(script).forEach(function (key) {
      if (key === "children") return;
      out[key] = script[key];
    });
    out.children = (script.children || []).map(cloneScript);
    return out;
  }

  function externalScript(id, label, url, actor, malicious, parserInserted) {
    return {
      id: id,
      label: label,
      kind: "external",
      url: url,
      actor: actor,
      malicious: !!malicious,
      parserInserted: !!parserInserted,
      nonce: null,
      children: []
    };
  }

  function appScript(children) {
    var script = externalScript("app", "nonce app.js", SELF_ORIGIN + "/static/app.js", "app", false, true);
    script.nonce = NONCE;
    script.children = children || [];
    return script;
  }

  function configScript() {
    return {
      id: "config",
      label: "inline config",
      kind: "inline",
      content: CONFIG_SCRIPT,
      actor: "app",
      malicious: false,
      parserInserted: true,
      nonce: null,
      children: []
    };
  }

  function inlineScript(id, label, content, actor, malicious) {
    return {
      id: id,
      label: label,
      kind: "inline",
      content: content,
      actor: actor,
      malicious: !!malicious,
      parserInserted: true,
      nonce: null,
      children: []
    };
  }

  function eventHandler(label, source) {
    return {
      id: "event-handler",
      label: label,
      kind: "event",
      content: source,
      actor: "attacker",
      malicious: true,
      parserInserted: true,
      nonce: null,
      children: []
    };
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      policy: POLICY_DEFS[raw.policy] ? raw.policy : DEFAULTS.policy,
      scenario: SCENARIO_DEFS[raw.scenario] ? raw.scenario : DEFAULTS.scenario
    };
  }

  function policyFromKey(key) {
    var def = POLICY_DEFS[key];
    var tokens = typeof def.tokens === "function" ? def.tokens() : def.tokens.slice();
    return {
      key: key,
      label: def.label,
      csp: def.csp.replace("{hash}", hashSourceFor(CONFIG_SCRIPT)),
      tokens: tokens,
      note: def.note
    };
  }

  function hasToken(policy, token) {
    return policy.tokens.indexOf(token) >= 0;
  }

  function nonceMatches(script, policy) {
    return !!script.nonce && hasToken(policy, "'nonce-" + script.nonce + "'");
  }

  function hashMatches(script, policy) {
    if (!script.content) return false;
    return hasToken(policy, hashSourceFor(script.content));
  }

  function originOf(url) {
    try {
      return new URL(url, SELF_ORIGIN).origin;
    } catch (err) {
      return "";
    }
  }

  function schemeOf(url) {
    try {
      return new URL(url, SELF_ORIGIN).protocol;
    } catch (err) {
      return "";
    }
  }

  function hostSourceMatches(script, policy) {
    var origin = originOf(script.url);
    var scheme = schemeOf(script.url);
    for (var i = 0; i < policy.tokens.length; i += 1) {
      var token = policy.tokens[i];
      if (token === "'self'" && origin === SELF_ORIGIN) return true;
      if (token === "https:" && scheme === "https:") return true;
      if (/^https?:\/\//.test(token) && origin === originOf(token)) return true;
      if (token === "*") return true;
    }
    return false;
  }

  function allowScript(script, policy) {
    if (nonceMatches(script, policy)) {
      return { allowed: true, reason: "nonce matched" };
    }
    if (script.kind === "inline" && hashMatches(script, policy)) {
      return { allowed: true, reason: "inline hash matched" };
    }
    if (script.kind === "event") {
      if (hasToken(policy, "'unsafe-inline'")) return { allowed: true, reason: "unsafe-inline allowed event handler" };
      return { allowed: false, reason: "event handlers need unsafe-inline or unsafe-hashes" };
    }
    if (script.kind === "inline") {
      if (hasToken(policy, "'unsafe-inline'") && !hasToken(policy, "'strict-dynamic'")) {
        return { allowed: true, reason: "unsafe-inline allowed inline script" };
      }
      return { allowed: false, reason: "inline block had no matching nonce or hash" };
    }
    if (script.kind === "external") {
      if (hasToken(policy, "'strict-dynamic'")) {
        if (script.parserInserted) {
          return { allowed: false, reason: "strict-dynamic ignored host and scheme sources for parser-inserted script" };
        }
        return { allowed: true, reason: "strict-dynamic allowed non-parser-inserted script" };
      }
      if (hostSourceMatches(script, policy)) return { allowed: true, reason: "host or scheme matched" };
      return { allowed: false, reason: "URL had no matching source expression" };
    }
    return { allowed: false, reason: "unknown script kind" };
  }

  function summarize(timeline) {
    var summary = {
      scripts: timeline.length,
      executed: 0,
      blocked: 0,
      attackerExecuted: 0,
      dynamicLoaded: 0,
      parserInsertedBlockedByStrict: 0,
      eventHandlersBlocked: 0,
      loaderHazards: 0
    };
    timeline.forEach(function (event) {
      if (event.allowed) summary.executed += 1;
      else summary.blocked += 1;
      if (event.allowed && event.script.malicious) summary.attackerExecuted += 1;
      if (event.allowed && event.script.createdBy) summary.dynamicLoaded += 1;
      if (!event.allowed && event.reason.indexOf("strict-dynamic ignored") >= 0) summary.parserInsertedBlockedByStrict += 1;
      if (!event.allowed && event.script.kind === "event") summary.eventHandlersBlocked += 1;
      if (event.allowed && event.script.tainted && event.script.malicious) summary.loaderHazards += 1;
    });
    return summary;
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var policy = policyFromKey(params.policy);
    var scenario = SCENARIO_DEFS[params.scenario];
    var queue = scenario.scripts().map(cloneScript);
    var timeline = [];

    while (queue.length) {
      var script = queue.shift();
      var decision = allowScript(script, policy);
      var event = {
        step: timeline.length + 1,
        script: script,
        allowed: decision.allowed,
        reason: decision.reason
      };
      timeline.push(event);
      if (decision.allowed) {
        script.children.forEach(function (child) {
          var next = cloneScript(child);
          next.parserInserted = false;
          next.createdBy = script.id;
          queue.push(next);
        });
      }
    }

    return {
      params: params,
      policy: policy,
      scenario: {
        key: params.scenario,
        label: scenario.label,
        note: scenario.note
      },
      timeline: timeline,
      summary: summarize(timeline)
    };
  }

  function auditCspScriptLab() {
    var errors = [];
    var checked = 0;

    function check(condition, label) {
      checked += 1;
      if (!condition) errors.push(label);
    }

    check(hashSourceFor("abc") === "'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='", "SHA-256 base64 test vector");

    var strictCdn = evaluate({ policy: "nonceStrictDynamic", scenario: "cdnCompromise" });
    check(strictCdn.summary.attackerExecuted === 0, "strict-dynamic blocks parser-inserted CDN attacker");
    check(strictCdn.summary.parserInsertedBlockedByStrict === 1, "strict-dynamic records parser-inserted block");

    var hostCdn = evaluate({ policy: "hostAllowlist", scenario: "cdnCompromise" });
    check(hostCdn.summary.attackerExecuted === 1, "host allowlist admits compromised CDN script");

    var strictDynamic = evaluate({ policy: "nonceStrictDynamic", scenario: "dynamicDependency" });
    check(strictDynamic.summary.dynamicLoaded === 1, "strict-dynamic allows trusted runtime dependency");
    check(strictDynamic.summary.attackerExecuted === 0, "strict-dynamic dependency scenario stays non-attacker");

    var nonceOnly = evaluate({ policy: "nonceOnly", scenario: "dynamicDependency" });
    check(nonceOnly.summary.dynamicLoaded === 0, "nonce-only blocks un-nonced runtime dependency");

    var unsafe = evaluate({ policy: "unsafeInline", scenario: "inlineInjection" });
    check(unsafe.summary.attackerExecuted === 2, "unsafe-inline admits inline block and event handler");

    var hashPolicy = evaluate({ policy: "hashAndSelf", scenario: "inlineInjection" });
    check(hashPolicy.timeline.some(function (event) {
      return event.script.id === "config" && event.allowed && event.reason === "inline hash matched";
    }), "hash policy admits exact inline config");
    check(hashPolicy.summary.attackerExecuted === 0, "hash policy blocks injected inline attacker");

    var tainted = evaluate({ policy: "nonceStrictDynamic", scenario: "untrustedLoader" });
    check(tainted.summary.attackerExecuted === 1, "strict-dynamic propagates to tainted runtime URL");
    check(tainted.summary.loaderHazards === 1, "tainted runtime URL is surfaced as a hazard");

    Object.keys(POLICY_DEFS).forEach(function (policy) {
      Object.keys(SCENARIO_DEFS).forEach(function (scenario) {
        var result = evaluate({ policy: policy, scenario: scenario });
        check(result.summary.executed + result.summary.blocked === result.summary.scripts, policy + "/" + scenario + " partitions outcomes");
      });
    });

    return {
      ok: errors.length === 0,
      checked: checked,
      errors: errors
    };
  }

  function textWidth(ctx, text) {
    return ctx.measureText(text).width;
  }

  function truncate(ctx, text, maxWidth) {
    text = String(text);
    if (textWidth(ctx, text) <= maxWidth) return text;
    var out = text;
    while (out.length > 4 && textWidth(ctx, out + "...") > maxWidth) out = out.slice(0, -1);
    return out + "...";
  }

  function roundRect(ctx, x, y, w, h, r) {
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

  function drawArrow(ctx, fromX, fromY, toX, toY, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    var angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - 9 * Math.cos(angle - 0.45), toY - 9 * Math.sin(angle - 0.45));
    ctx.lineTo(toX - 9 * Math.cos(angle + 0.45), toY - 9 * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  function drawBadge(ctx, x, y, label, fill, stroke) {
    ctx.font = "700 13px system-ui, -apple-system, Segoe UI, sans-serif";
    var w = Math.max(64, textWidth(ctx, label) + 18);
    roundRect(ctx, x, y, w, 24, 6);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = stroke;
    ctx.fillText(label, x + 9, y + 16);
    return w;
  }

  function drawCard(ctx, event, x, y, w, h) {
    var script = event.script;
    var border = event.allowed ? COLORS.allowed : COLORS.blocked;
    var actorColor = script.malicious ? COLORS.attacker : (script.createdBy ? COLORS.dynamic : COLORS.app);
    roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    roundRect(ctx, x + 12, y + 12, 58, 24, 6);
    ctx.fillStyle = event.allowed ? "#e7f7f2" : "#fff1f2";
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = border;
    ctx.font = "700 12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(event.allowed ? "RUN" : "BLOCK", x + 22, y + 28);

    ctx.fillStyle = actorColor;
    ctx.font = "760 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(truncate(ctx, script.label, w - 96), x + 82, y + 28);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    var descriptor = script.kind;
    if (script.kind === "external") descriptor += script.parserInserted ? " / parser-inserted" : " / runtime-created";
    if (script.nonce) descriptor += " / nonce";
    ctx.fillText(truncate(ctx, descriptor, w - 26), x + 13, y + 56);

    var detail = script.kind === "external" ? script.url : script.content;
    ctx.fillText(truncate(ctx, detail, w - 26), x + 13, y + 77);

    ctx.fillStyle = event.allowed ? COLORS.allowed : COLORS.blocked;
    ctx.font = "700 12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(truncate(ctx, event.reason, w - 26), x + 13, y + h - 14);
  }

  function draw(canvas, result) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = COLORS.ink;
    ctx.font = "760 24px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("CSP script source-list model", 28, 40);

    ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(truncate(ctx, result.policy.csp, width - 56), 28, 68);

    var y = 94;
    drawBadge(ctx, 28, y, result.policy.label, "#eff6ff", COLORS.app);
    drawBadge(ctx, 190, y, result.scenario.label, "#f5f3ff", COLORS.dynamic);
    var audit = auditCspScriptLab();
    drawBadge(ctx, 420, y, audit.ok ? "audit passes" : "audit fails", audit.ok ? "#e7f7f2" : "#fff1f2", audit.ok ? COLORS.allowed : COLORS.blocked);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(truncate(ctx, result.scenario.note, width - 56), 28, 146);

    var cardW = 420;
    var cardH = 112;
    var leftX = 46;
    var rightX = 516;
    var topY = 178;
    var gapY = 130;
    var positions = {};
    result.timeline.forEach(function (event, index) {
      var col = index % 2;
      var row = Math.floor(index / 2);
      var x = col === 0 ? leftX : rightX;
      var yy = topY + row * gapY;
      positions[event.script.id] = { x: x, y: yy, cx: x + cardW / 2, cy: yy + cardH / 2 };
    });

    result.timeline.forEach(function (event) {
      if (!event.script.createdBy) return;
      var from = positions[event.script.createdBy];
      var to = positions[event.script.id];
      if (from && to) drawArrow(ctx, from.cx, from.cy + 52, to.cx, to.cy - 52, COLORS.dynamic);
    });

    result.timeline.forEach(function (event, index) {
      var pos = positions[event.script.id];
      drawCard(ctx, event, pos.x, pos.y, cardW, cardH);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(String(index + 1).padStart(2, "0"), pos.x - 28, pos.y + 24);
    });

    var footerY = height - 68;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(28, footerY - 18);
    ctx.lineTo(width - 28, footerY - 18);
    ctx.stroke();
    ctx.fillStyle = result.summary.loaderHazards ? COLORS.warning : COLORS.muted;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    var footer = result.summary.loaderHazards ?
      "Hazard surfaced: strict-dynamic trusted the runtime loader, including its tainted URL." :
      result.policy.note;
    ctx.fillText(truncate(ctx, footer, width - 56), 28, footerY + 8);
  }

  function setText(root, selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function initLab(root) {
    var canvas = root.querySelector("[data-canvas]");
    var controls = Array.prototype.slice.call(root.querySelectorAll("[data-param]"));
    var audit = auditCspScriptLab();

    function readParams() {
      var params = {};
      controls.forEach(function (control) {
        params[control.getAttribute("data-param")] = control.value;
      });
      return params;
    }

    function render() {
      var result = evaluate(readParams());
      setText(root, "[data-value='policy']", result.policy.label);
      setText(root, "[data-value='scenario']", result.scenario.label);
      setText(root, "[data-metric='executed']", result.summary.executed);
      setText(root, "[data-metric='blocked']", result.summary.blocked);
      setText(root, "[data-metric='attacker']", result.summary.attackerExecuted ? "yes" : "no");
      setText(root, "[data-metric='dynamic']", result.summary.dynamicLoaded);
      setText(root, "[data-metric='hazard']", result.summary.loaderHazards ? "yes" : "no");
      setText(root, "[data-metric='audit']", audit.ok ? "passes" : "fails");
      setText(root, "[data-csp-note]", result.summary.loaderHazards ? "A nonce-trusted script loaded attacker-controlled code at runtime. strict-dynamic did what it was asked to do." : result.policy.note);
      draw(canvas, result);
    }

    controls.forEach(function (control) {
      control.addEventListener("input", render);
      control.addEventListener("change", render);
    });
    render();
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-csp-script-lab]")).forEach(initLab);
  }

  var API = {
    evaluate: evaluate,
    auditCspScriptLab: auditCspScriptLab,
    hashSourceFor: hashSourceFor,
    sha256Ascii: sha256Ascii,
    policies: POLICY_DEFS,
    scenarios: SCENARIO_DEFS
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.CspScriptLab = API;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
