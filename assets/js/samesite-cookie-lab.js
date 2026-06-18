(function (global) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    browser: "#2563eb",
    cookie: "#0f766e",
    blocked: "#be123c",
    server: "#7c3aed",
    warning: "#b45309"
  };

  var DEFAULTS = {
    cookie: "lax",
    request: "crossPost",
    server: "csrfToken"
  };

  var SAFE_METHODS = { GET: true, HEAD: true, OPTIONS: true, TRACE: true };
  var LAX_ALLOWING_UNSAFE_WINDOW_SECONDS = 120;

  var COOKIES = {
    strict: {
      label: "SameSite=Strict",
      sameSite: "Strict",
      secure: true,
      ageSeconds: 600,
      note: "sent only when the request is same-site"
    },
    lax: {
      label: "SameSite=Lax",
      sameSite: "Lax",
      secure: true,
      ageSeconds: 600,
      note: "sent same-site, and on cross-site top-level safe-method navigations"
    },
    defaultFresh: {
      label: "Default, fresh",
      sameSite: "Default",
      secure: true,
      ageSeconds: 60,
      note: "no SameSite attribute; within the compatibility window for unsafe top-level requests"
    },
    defaultOld: {
      label: "Default, old",
      sameSite: "Default",
      secure: true,
      ageSeconds: 600,
      note: "no SameSite attribute; behaves like Lax after the compatibility window"
    },
    noneSecure: {
      label: "SameSite=None; Secure",
      sameSite: "None",
      secure: true,
      ageSeconds: 600,
      note: "eligible for cross-site contexts, assuming the browser stores it"
    },
    noneInsecure: {
      label: "SameSite=None only",
      sameSite: "None",
      secure: false,
      ageSeconds: 600,
      note: "rejected by the storage model because SameSite=None requires Secure"
    }
  };

  var REQUESTS = {
    sameSitePost: {
      label: "same-site POST",
      topUrl: "https://app.bank.example/dashboard",
      targetUrl: "https://bank.example/transfer",
      method: "POST",
      topLevel: true,
      token: true,
      attacker: false,
      note: "different origins, same schemeful site; a CSRF token is present"
    },
    crossLink: {
      label: "cross-site link",
      topUrl: "https://news.example/article",
      targetUrl: "https://bank.example/account",
      method: "GET",
      topLevel: true,
      token: false,
      attacker: false,
      note: "a top-level safe-method navigation from another site"
    },
    crossPost: {
      label: "cross-site form POST",
      topUrl: "https://attacker.example/trap",
      targetUrl: "https://bank.example/transfer",
      method: "POST",
      topLevel: true,
      token: false,
      attacker: true,
      note: "classic CSRF shape: a top-level unsafe request without a site-issued token"
    },
    crossImage: {
      label: "cross-site image",
      topUrl: "https://attacker.example/trap",
      targetUrl: "https://bank.example/pixel",
      method: "GET",
      topLevel: false,
      token: false,
      attacker: true,
      note: "safe method, but not a top-level navigation"
    },
    schemePost: {
      label: "scheme-crossing POST",
      topUrl: "http://bank.example/start",
      targetUrl: "https://bank.example/transfer",
      method: "POST",
      topLevel: true,
      token: false,
      attacker: true,
      note: "same registrable domain, different scheme; schemeful same-site treats it as cross-site"
    },
    idpPost: {
      label: "login callback POST",
      topUrl: "https://idp.example/login",
      targetUrl: "https://bank.example/session/finish",
      method: "POST",
      topLevel: true,
      token: true,
      attacker: false,
      note: "cross-site unsafe top-level POST that may rely on a freshly created transient cookie"
    }
  };

  var SERVERS = {
    cookieOnly: {
      label: "cookie only",
      note: "the server treats the ambient cookie as enough authority for unsafe actions"
    },
    csrfToken: {
      label: "CSRF token",
      note: "unsafe actions need both the cookie and a request token"
    }
  };

  function clampKey(table, value, fallback) {
    return table[value] ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      cookie: clampKey(COOKIES, raw.cookie, DEFAULTS.cookie),
      request: clampKey(REQUESTS, raw.request, DEFAULTS.request),
      server: clampKey(SERVERS, raw.server, DEFAULTS.server)
    };
  }

  function parseUrl(value) {
    return new URL(value);
  }

  function publicSuffixLength(host) {
    if (host.endsWith(".github.io")) return 2;
    if (host.endsWith(".co.uk")) return 2;
    if (host.endsWith(".compute.amazonaws.com")) return 3;
    return 1;
  }

  function registrableDomain(host) {
    host = String(host || "").toLowerCase();
    if (host.endsWith(".")) return host;
    var parts = host.split(".").filter(Boolean);
    if (parts.length <= 1) return host;
    var suffix = publicSuffixLength(host);
    var keep = Math.min(parts.length, suffix + 1);
    return parts.slice(parts.length - keep).join(".");
  }

  function siteFor(url) {
    var parsed = parseUrl(url);
    return parsed.protocol.replace(":", "") + "://" + registrableDomain(parsed.hostname);
  }

  function originFor(url) {
    return parseUrl(url).origin;
  }

  function sameSite(a, b) {
    return siteFor(a) === siteFor(b);
  }

  function sameOrigin(a, b) {
    return originFor(a) === originFor(b);
  }

  function isSafeMethod(method) {
    return !!SAFE_METHODS[String(method).toUpperCase()];
  }

  function isStored(cookie) {
    if (cookie.sameSite === "None" && !cookie.secure) {
      return { ok: false, reason: "SameSite=None without Secure is rejected at storage" };
    }
    return { ok: true, reason: "stored" };
  }

  function cookieDecision(cookie, request) {
    var stored = isStored(cookie);
    if (!stored.ok) return { sent: false, stored: false, reason: stored.reason };

    var target = parseUrl(request.targetUrl);
    if (cookie.secure && target.protocol !== "https:") {
      return { sent: false, stored: true, reason: "Secure cookie requires a secure retrieval URI" };
    }

    var siteStatus = sameSite(request.topUrl, request.targetUrl) ? "same-site" : "cross-site";
    if (cookie.sameSite === "None") {
      return { sent: true, stored: true, reason: "SameSite=None permits cross-site retrieval" };
    }
    if (siteStatus === "same-site") {
      return { sent: true, stored: true, reason: "request is same-site" };
    }
    if (cookie.sameSite === "Strict") {
      return { sent: false, stored: true, reason: "Strict cookie withheld on cross-site request" };
    }
    if (!request.topLevel) {
      return { sent: false, stored: true, reason: "Lax exception requires a top-level navigation" };
    }
    if (isSafeMethod(request.method)) {
      return { sent: true, stored: true, reason: "Lax top-level safe-method exception" };
    }
    if (cookie.sameSite === "Default" && cookie.ageSeconds <= LAX_ALLOWING_UNSAFE_WINDOW_SECONDS) {
      return { sent: true, stored: true, reason: "fresh Default cookie uses Lax-allowing-unsafe" };
    }
    return { sent: false, stored: true, reason: "cross-site unsafe method is outside Lax" };
  }

  function serverDecision(request, sent, serverMode) {
    var unsafe = !isSafeMethod(request.method);
    if (!sent) {
      return {
        authenticated: false,
        stateChanged: false,
        blocked: false,
        reason: "no cookie, no authenticated action"
      };
    }
    if (!unsafe) {
      return {
        authenticated: true,
        stateChanged: false,
        blocked: false,
        reason: "cookie authenticates a safe read; no state change in the model"
      };
    }
    if (serverMode === "csrfToken" && !request.token) {
      return {
        authenticated: true,
        stateChanged: false,
        blocked: true,
        reason: "server required a CSRF token for the unsafe action"
      };
    }
    return {
      authenticated: true,
      stateChanged: true,
      blocked: false,
      reason: serverMode === "csrfToken" ? "cookie and token authorize the action" : "cookie alone authorizes the unsafe action"
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var cookie = COOKIES[params.cookie];
    var request = REQUESTS[params.request];
    var server = SERVERS[params.server];
    var cookieResult = cookieDecision(cookie, request);
    var serverResult = serverDecision(request, cookieResult.sent, params.server);
    var sameSiteStatus = sameSite(request.topUrl, request.targetUrl);
    var sameOriginStatus = sameOrigin(request.topUrl, request.targetUrl);
    var csrfRisk = !!(request.attacker && serverResult.stateChanged && !request.token);

    return {
      params: params,
      cookie: cookie,
      request: request,
      server: server,
      derived: {
        topSite: siteFor(request.topUrl),
        targetSite: siteFor(request.targetUrl),
        topOrigin: originFor(request.topUrl),
        targetOrigin: originFor(request.targetUrl),
        sameSite: sameSiteStatus,
        sameOrigin: sameOriginStatus,
        safeMethod: isSafeMethod(request.method),
        topLevel: request.topLevel
      },
      cookieResult: cookieResult,
      serverResult: serverResult,
      summary: {
        stored: cookieResult.stored ? 1 : 0,
        sameSite: sameSiteStatus ? 1 : 0,
        sameOrigin: sameOriginStatus ? 1 : 0,
        cookieSent: cookieResult.sent ? 1 : 0,
        token: request.token ? 1 : 0,
        blocked: serverResult.blocked ? 1 : 0,
        stateChanged: serverResult.stateChanged ? 1 : 0,
        csrfRisk: csrfRisk ? 1 : 0
      }
    };
  }

  function auditSameSiteCookieLab() {
    var errors = [];
    var checked = 0;

    function check(condition, label) {
      checked += 1;
      if (!condition) errors.push(label);
    }

    check(siteFor("https://app.bank.example/x") === "https://bank.example", "subdomain collapses to schemeful registrable site");
    check(sameSite("https://app.bank.example", "https://bank.example"), "bank subdomain and apex are same-site");
    check(!sameOrigin("https://app.bank.example", "https://bank.example"), "bank subdomain and apex are not same-origin");
    check(!sameSite("http://bank.example", "https://bank.example"), "scheme difference is cross-site");
    check(!sameSite("https://bank.example", "https://bank.example."), "trailing dot keeps hosts distinct");
    check(siteFor("https://me.github.io") !== siteFor("https://you.github.io"), "github.io labels stay separate registrable domains");

    check(evaluate({ cookie: "strict", request: "crossLink" }).summary.cookieSent === 0, "Strict withheld on cross-site link");
    check(evaluate({ cookie: "lax", request: "crossLink" }).summary.cookieSent === 1, "Lax sent on cross-site top-level safe navigation");
    check(evaluate({ cookie: "lax", request: "crossPost" }).summary.cookieSent === 0, "Lax withheld on cross-site POST");
    check(evaluate({ cookie: "lax", request: "crossImage" }).summary.cookieSent === 0, "Lax withheld on cross-site subresource");
    check(evaluate({ cookie: "lax", request: "sameSitePost" }).summary.cookieSent === 1, "Lax sent on same-site unsafe request");
    check(evaluate({ cookie: "defaultFresh", request: "crossPost" }).summary.cookieSent === 1, "fresh Default cookie sent on unsafe top-level request");
    check(evaluate({ cookie: "defaultOld", request: "crossPost" }).summary.cookieSent === 0, "old Default cookie withheld on unsafe top-level request");
    check(evaluate({ cookie: "noneInsecure", request: "crossPost" }).summary.stored === 0, "SameSite=None without Secure rejected");
    check(evaluate({ cookie: "noneSecure", request: "crossPost", server: "cookieOnly" }).summary.csrfRisk === 1, "None+Secure plus cookie-only server leaves CSRF risk");
    check(evaluate({ cookie: "noneSecure", request: "crossPost", server: "csrfToken" }).summary.blocked === 1, "CSRF token blocks cross-site unsafe action");
    check(evaluate({ cookie: "defaultFresh", request: "idpPost", server: "csrfToken" }).summary.stateChanged === 1, "fresh Default supports token-bearing login callback POST");

    Object.keys(COOKIES).forEach(function (cookieKey) {
      Object.keys(REQUESTS).forEach(function (requestKey) {
        Object.keys(SERVERS).forEach(function (serverKey) {
          var result = evaluate({ cookie: cookieKey, request: requestKey, server: serverKey });
          check(result.summary.cookieSent <= result.summary.stored, cookieKey + "/" + requestKey + "/" + serverKey + " cannot send unstored cookie");
          check(!(result.summary.stateChanged && result.summary.blocked), cookieKey + "/" + requestKey + "/" + serverKey + " cannot both mutate and block");
        });
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

  function drawArrow(ctx, x1, y1, x2, y2, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    var angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 9 * Math.cos(angle - 0.45), y2 - 9 * Math.sin(angle - 0.45));
    ctx.lineTo(x2 - 9 * Math.cos(angle + 0.45), y2 - 9 * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  function drawBox(ctx, x, y, w, h, title, lines, color) {
    roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "760 16px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(truncate(ctx, title, w - 24), x + 12, y + 28);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    lines.forEach(function (line, index) {
      ctx.fillText(truncate(ctx, line, w - 24), x + 12, y + 55 + index * 22);
    });
  }

  function drawBadge(ctx, x, y, label, positive) {
    var color = positive ? COLORS.cookie : COLORS.blocked;
    ctx.font = "760 13px system-ui, -apple-system, Segoe UI, sans-serif";
    var w = Math.max(86, textWidth(ctx, label) + 20);
    roundRect(ctx, x, y, w, 28, 7);
    ctx.fillStyle = positive ? "#e7f7f2" : "#fff1f2";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, x + 10, y + 19);
    return w;
  }

  function draw(canvas, result) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = COLORS.ink;
    ctx.font = "760 25px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("SameSite cookie retrieval", 28, 42);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(truncate(ctx, result.request.note, width - 56), 28, 68);

    drawBadge(ctx, 28, 92, result.derived.sameSite ? "same-site" : "cross-site", result.derived.sameSite);
    drawBadge(ctx, 140, 92, result.derived.sameOrigin ? "same-origin" : "cross-origin", result.derived.sameOrigin);
    drawBadge(ctx, 278, 92, result.derived.safeMethod ? "safe method" : "unsafe method", result.derived.safeMethod);
    drawBadge(ctx, 418, 92, result.request.topLevel ? "top-level" : "subresource", result.request.topLevel);

    var boxY = 152;
    drawBox(ctx, 34, boxY, 270, 164, "Initiator", [
      "top site: " + result.derived.topSite,
      "top origin: " + result.derived.topOrigin,
      "request: " + result.request.method + " " + result.request.targetUrl
    ], COLORS.browser);
    drawBox(ctx, 356, boxY, 270, 164, "Cookie jar", [
      result.cookie.label,
      result.cookie.secure ? "Secure: yes" : "Secure: no",
      "age: " + result.cookie.ageSeconds + "s",
      result.cookieResult.reason
    ], result.cookieResult.sent ? COLORS.cookie : COLORS.blocked);
    drawBox(ctx, 678, boxY, 270, 164, "Server", [
      result.server.label,
      result.request.token ? "request token: present" : "request token: absent",
      result.serverResult.reason
    ], result.serverResult.stateChanged ? COLORS.warning : (result.serverResult.blocked ? COLORS.blocked : COLORS.server));

    drawArrow(ctx, 304, boxY + 82, 356, boxY + 82, COLORS.browser);
    drawArrow(ctx, 626, boxY + 82, 678, boxY + 82, result.cookieResult.sent ? COLORS.cookie : COLORS.blocked);

    var tableX = 52;
    var tableY = 356;
    var rowH = 34;
    var rows = [
      ["stored", result.summary.stored ? "yes" : "no"],
      ["cookie sent", result.summary.cookieSent ? "yes" : "no"],
      ["token", result.summary.token ? "yes" : "no"],
      ["blocked", result.summary.blocked ? "yes" : "no"],
      ["state change", result.summary.stateChanged ? "yes" : "no"],
      ["CSRF risk", result.summary.csrfRisk ? "yes" : "no"]
    ];
    ctx.font = "760 15px system-ui, -apple-system, Segoe UI, sans-serif";
    rows.forEach(function (row, i) {
      var y = tableY + i * rowH;
      ctx.fillStyle = i % 2 ? COLORS.white : COLORS.panel;
      ctx.fillRect(tableX, y, width - 104, rowH);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(tableX, y, width - 104, rowH);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(row[0], tableX + 14, y + 23);
      ctx.fillStyle = row[1] === "yes" ? COLORS.cookie : COLORS.blocked;
      if (row[0] === "state change" && row[1] === "yes") ctx.fillStyle = COLORS.warning;
      ctx.fillText(row[1], width - 160, y + 23);
    });

    ctx.fillStyle = result.summary.csrfRisk ? COLORS.warning : COLORS.muted;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    var footer = result.summary.csrfRisk ?
      "Risk: the attacker-shaped unsafe request included an ambient cookie and the server accepted it without a token." :
      result.cookie.note;
    ctx.fillText(truncate(ctx, footer, width - 56), 28, height - 26);
  }

  function setText(root, selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function initLab(root) {
    var canvas = root.querySelector("[data-canvas]");
    var controls = Array.prototype.slice.call(root.querySelectorAll("[data-param]"));
    var audit = auditSameSiteCookieLab();

    function readParams() {
      var params = {};
      controls.forEach(function (control) {
        params[control.getAttribute("data-param")] = control.value;
      });
      return params;
    }

    function render() {
      var result = evaluate(readParams());
      setText(root, "[data-value='cookie']", result.cookie.label);
      setText(root, "[data-value='request']", result.request.label);
      setText(root, "[data-value='server']", result.server.label);
      setText(root, "[data-metric='stored']", result.summary.stored ? "yes" : "no");
      setText(root, "[data-metric='sameSite']", result.summary.sameSite ? "yes" : "no");
      setText(root, "[data-metric='sent']", result.summary.cookieSent ? "yes" : "no");
      setText(root, "[data-metric='blocked']", result.summary.blocked ? "yes" : "no");
      setText(root, "[data-metric='changed']", result.summary.stateChanged ? "yes" : "no");
      setText(root, "[data-metric='audit']", audit.ok ? "passes" : "fails");
      setText(root, "[data-samesite-note]", result.summary.csrfRisk ? "The cookie was sent on an attacker-shaped unsafe request, and the server accepted cookie-only authority." : result.cookieResult.reason);
      draw(canvas, result);
    }

    controls.forEach(function (control) {
      control.addEventListener("input", render);
      control.addEventListener("change", render);
    });
    render();
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-samesite-cookie-lab]")).forEach(initLab);
  }

  var API = {
    evaluate: evaluate,
    auditSameSiteCookieLab: auditSameSiteCookieLab,
    siteFor: siteFor,
    sameSite: sameSite,
    sameOrigin: sameOrigin,
    cookieDecision: cookieDecision,
    cookies: COOKIES,
    requests: REQUESTS,
    servers: SERVERS
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.SameSiteCookieLab = API;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
