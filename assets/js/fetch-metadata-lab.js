(function (global) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    browser: "#2563eb",
    allowed: "#0f766e",
    blocked: "#be123c",
    server: "#7c3aed",
    warning: "#b45309"
  };

  var DEFAULTS = {
    request: "crossSiteFormPost",
    defense: "metadataAndToken"
  };

  var SAFE_METHODS = { GET: true, HEAD: true, OPTIONS: true, TRACE: true };
  var PUBLIC_DESTS = { image: true, style: true, font: true, script: true };

  var REQUESTS = {
    sameOriginPost: {
      label: "same-origin POST",
      method: "POST",
      endpoint: "/api/transfer",
      mutates: true,
      token: true,
      signed: false,
      site: "same-origin",
      mode: "cors",
      dest: "empty",
      user: false,
      publicResource: false,
      allowTopLevelRead: false,
      note: "first-party app fetch with a CSRF token"
    },
    sameSitePostNoToken: {
      label: "same-site POST, no token",
      method: "POST",
      endpoint: "/api/transfer",
      mutates: true,
      token: false,
      signed: false,
      site: "same-site",
      mode: "cors",
      dest: "empty",
      user: false,
      publicResource: false,
      allowTopLevelRead: false,
      note: "sibling subdomain request; same-site is not same-origin"
    },
    crossSiteFormPost: {
      label: "cross-site form POST",
      method: "POST",
      endpoint: "/transfer",
      mutates: true,
      token: false,
      signed: false,
      site: "cross-site",
      mode: "navigate",
      dest: "document",
      user: true,
      publicResource: false,
      allowTopLevelRead: false,
      note: "classic CSRF shape against a state-changing endpoint"
    },
    crossSiteApiRead: {
      label: "cross-site API read",
      method: "GET",
      endpoint: "/api/profile",
      mutates: false,
      token: false,
      signed: false,
      site: "cross-site",
      mode: "cors",
      dest: "empty",
      user: false,
      publicResource: false,
      allowTopLevelRead: false,
      note: "browser fetch from another site trying to reach a private API"
    },
    publicImage: {
      label: "public image embed",
      method: "GET",
      endpoint: "/assets/logo.png",
      mutates: false,
      token: false,
      signed: false,
      site: "cross-site",
      mode: "no-cors",
      dest: "image",
      user: false,
      publicResource: true,
      allowTopLevelRead: false,
      note: "expected cross-site embedding of a public static asset"
    },
    directNavigation: {
      label: "address-bar navigation",
      method: "GET",
      endpoint: "/account",
      mutates: false,
      token: false,
      signed: false,
      site: "none",
      mode: "navigate",
      dest: "document",
      user: true,
      publicResource: false,
      allowTopLevelRead: true,
      note: "user-agent initiated navigation with no responsible web origin"
    },
    crossSiteLink: {
      label: "cross-site link",
      method: "GET",
      endpoint: "/account",
      mutates: false,
      token: false,
      signed: false,
      site: "cross-site",
      mode: "navigate",
      dest: "document",
      user: true,
      publicResource: false,
      allowTopLevelRead: true,
      note: "a user-activated top-level link controlled by another site"
    },
    legacyPost: {
      label: "no metadata POST",
      method: "POST",
      endpoint: "/api/transfer",
      mutates: true,
      token: false,
      signed: false,
      site: null,
      mode: null,
      dest: null,
      user: false,
      publicResource: false,
      allowTopLevelRead: false,
      note: "old browser, bot, curl, or proxy path with no Sec-Fetch headers"
    },
    signedWebhook: {
      label: "signed webhook",
      method: "POST",
      endpoint: "/webhooks/idp",
      mutates: true,
      token: false,
      signed: true,
      site: null,
      mode: null,
      dest: null,
      user: false,
      publicResource: false,
      allowTopLevelRead: false,
      note: "non-browser integration authenticated with an application signature"
    }
  };

  var DEFENSES = {
    reportOnly: {
      label: "report only",
      note: "log the metadata verdict but do not stop the request"
    },
    metadataOnly: {
      label: "metadata gate",
      note: "block suspicious browser request shapes before the app"
    },
    metadataAndToken: {
      label: "metadata + token",
      note: "combine request-shape filtering with a server-side unsafe-action proof"
    }
  };

  function clampKey(table, value, fallback) {
    return table[value] ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      request: clampKey(REQUESTS, raw.request, DEFAULTS.request),
      defense: clampKey(DEFENSES, raw.defense, DEFAULTS.defense)
    };
  }

  function isSafe(method) {
    return !!SAFE_METHODS[String(method).toUpperCase()];
  }

  function headersFor(request) {
    if (!request.site) return [];
    var rows = [
      ["Sec-Fetch-Site", request.site],
      ["Sec-Fetch-Mode", request.mode],
      ["Sec-Fetch-Dest", request.dest]
    ];
    if (request.user) rows.push(["Sec-Fetch-User", "?1"]);
    return rows;
  }

  function metadataVerdict(request) {
    if (!request.site || !request.mode || !request.dest) {
      if (request.signed) {
        return { pass: true, wouldBlock: false, reason: "no browser metadata, but application signature is valid" };
      }
      return { pass: false, wouldBlock: true, reason: "missing Fetch Metadata on browser-facing endpoint" };
    }
    if (request.site === "same-origin") {
      return { pass: true, wouldBlock: false, reason: "same-origin request passes the metadata gate" };
    }
    if (request.site === "none") {
      if (request.mode === "navigate" && request.dest === "document" && request.user) {
        return { pass: true, wouldBlock: false, reason: "direct user navigation is allowed" };
      }
      return { pass: false, wouldBlock: true, reason: "Sec-Fetch-Site none without user navigation is suspicious" };
    }
    if (request.site === "same-site") {
      return { pass: true, wouldBlock: false, reason: "same-site request passes metadata but may still need a token" };
    }
    if (request.site === "cross-site") {
      if (request.publicResource && isSafe(request.method) && request.mode === "no-cors" && PUBLIC_DESTS[request.dest]) {
        return { pass: true, wouldBlock: false, reason: "public subresource embedding is allowed" };
      }
      if (request.allowTopLevelRead && request.method === "GET" && request.mode === "navigate" && request.dest === "document" && request.user) {
        return { pass: true, wouldBlock: false, reason: "user-activated top-level document navigation is allowed" };
      }
      return { pass: false, wouldBlock: true, reason: "cross-site request shape does not match an allowed use" };
    }
    return { pass: false, wouldBlock: true, reason: "unknown Sec-Fetch-Site value" };
  }

  function serverVerdict(request, defenseKey, metadata) {
    var wouldBlock = metadata.wouldBlock;
    if (defenseKey === "reportOnly") {
      return {
        blocked: false,
        appReached: true,
        stateChanged: request.mutates,
        tokenChecked: false,
        wouldBlock: wouldBlock,
        reason: wouldBlock ? "would block here, but report-only lets the app handle it" : "metadata looks acceptable"
      };
    }
    if (!metadata.pass) {
      return {
        blocked: true,
        appReached: false,
        stateChanged: false,
        tokenChecked: false,
        wouldBlock: true,
        reason: metadata.reason
      };
    }
    if (defenseKey === "metadataAndToken" && request.mutates && !request.signed) {
      if (!request.token) {
        return {
          blocked: true,
          appReached: true,
          stateChanged: false,
          tokenChecked: true,
          wouldBlock: false,
          reason: "unsafe action reached the app but failed the CSRF token check"
        };
      }
      return {
        blocked: false,
        appReached: true,
        stateChanged: true,
        tokenChecked: true,
        wouldBlock: false,
        reason: "metadata and CSRF token both pass"
      };
    }
    return {
      blocked: false,
      appReached: true,
      stateChanged: request.mutates,
      tokenChecked: false,
      wouldBlock: false,
      reason: request.mutates ? "metadata passed; cookie-only write would proceed" : "metadata passed; read proceeds"
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var request = REQUESTS[params.request];
    var defense = DEFENSES[params.defense];
    var metadata = metadataVerdict(request);
    var server = serverVerdict(request, params.defense, metadata);
    var risk = !!(request.mutates && server.stateChanged && !request.token && !request.signed);
    return {
      params: params,
      request: request,
      defense: defense,
      headers: headersFor(request),
      metadata: metadata,
      server: server,
      summary: {
        metadataPresent: request.site ? 1 : 0,
        metadataPass: metadata.pass ? 1 : 0,
        wouldBlock: server.wouldBlock ? 1 : 0,
        blocked: server.blocked ? 1 : 0,
        appReached: server.appReached ? 1 : 0,
        tokenChecked: server.tokenChecked ? 1 : 0,
        stateChanged: server.stateChanged ? 1 : 0,
        risk: risk ? 1 : 0
      }
    };
  }

  function auditFetchMetadataLab() {
    var errors = [];
    var criticalChecks = [];
    var cases = [];
    var checked = 0;

    function record(condition, label) {
      checked += 1;
      if (!condition) errors.push(label);
      return !!condition;
    }

    function addCritical(label, condition) {
      criticalChecks.push({
        check: label,
        passed: record(condition, label)
      });
    }

    addCritical("user activation emits Sec-Fetch-User ?1", headersFor(REQUESTS.crossSiteFormPost).some(function (row) { return row[0] === "Sec-Fetch-User" && row[1] === "?1"; }));
    addCritical("subresource omits Sec-Fetch-User", !headersFor(REQUESTS.publicImage).some(function (row) { return row[0] === "Sec-Fetch-User"; }));
    addCritical("metadata gate blocks cross-site form POST", evaluate({ request: "crossSiteFormPost", defense: "metadataOnly" }).summary.blocked === 1);
    addCritical("metadata gate blocks cross-site API read", evaluate({ request: "crossSiteApiRead", defense: "metadataOnly" }).summary.blocked === 1);
    addCritical("metadata gate allows public image", evaluate({ request: "publicImage", defense: "metadataOnly" }).summary.blocked === 0);
    addCritical("metadata gate allows direct navigation", evaluate({ request: "directNavigation", defense: "metadataOnly" }).summary.blocked === 0);
    addCritical("metadata gate allows user top-level link", evaluate({ request: "crossSiteLink", defense: "metadataOnly" }).summary.blocked === 0);
    addCritical("metadata alone allows same-site write without token", evaluate({ request: "sameSitePostNoToken", defense: "metadataOnly" }).summary.stateChanged === 1);
    addCritical("token layer blocks same-site write without token", evaluate({ request: "sameSitePostNoToken", defense: "metadataAndToken" }).summary.blocked === 1);
    addCritical("same-origin token-bearing write succeeds", evaluate({ request: "sameOriginPost", defense: "metadataAndToken" }).summary.stateChanged === 1);
    addCritical("metadata gate blocks missing headers on browser endpoint", evaluate({ request: "legacyPost", defense: "metadataOnly" }).summary.blocked === 1);
    addCritical("signed webhook bypasses browser metadata requirement", evaluate({ request: "signedWebhook", defense: "metadataOnly" }).summary.stateChanged === 1);
    addCritical("report-only cross-site form reaches cookie-only write", evaluate({ request: "crossSiteFormPost", defense: "reportOnly" }).summary.risk === 1);

    Object.keys(REQUESTS).forEach(function (requestKey) {
      Object.keys(DEFENSES).forEach(function (defenseKey) {
        var result = evaluate({ request: requestKey, defense: defenseKey });
        var failedChecks = [];
        var blockOrMutate = !(result.summary.blocked && result.summary.stateChanged);
        var reachedOrBlocked = result.summary.appReached || result.summary.blocked;
        var label = requestKey + "/" + defenseKey + " cannot both block and mutate";
        if (!record(blockOrMutate, label)) failedChecks.push(label);
        label = requestKey + "/" + defenseKey + " either reaches app or blocks";
        if (!record(reachedOrBlocked, label)) failedChecks.push(label);
        cases.push({
          appReached: result.summary.appReached,
          blocked: result.summary.blocked,
          defense: defenseKey,
          failedChecks: failedChecks,
          metadataPresent: result.summary.metadataPresent,
          metadataWouldBlock: result.summary.wouldBlock,
          passed: failedChecks.length === 0,
          request: requestKey,
          risk: result.summary.risk,
          stateChanged: result.summary.stateChanged,
          tokenChecked: result.summary.tokenChecked
        });
      });
    });

    function summarize(groupBy) {
      var groups = {};
      cases.forEach(function (row) {
        var key = row[groupBy];
        if (!groups[key]) {
          groups[key] = {
            appReached: 0,
            blocked: 0,
            cases: 0,
            metadataWouldBlock: 0,
            passed: 0,
            risk: 0,
            stateChanged: 0,
            tokenChecked: 0
          };
          groups[key][groupBy] = key;
        }
        groups[key].appReached += row.appReached;
        groups[key].blocked += row.blocked;
        groups[key].cases += 1;
        groups[key].metadataWouldBlock += row.metadataWouldBlock;
        groups[key].risk += row.risk;
        groups[key].stateChanged += row.stateChanged;
        groups[key].tokenChecked += row.tokenChecked;
        if (row.passed) groups[key].passed += 1;
      });
      return Object.keys(groups).sort().map(function (key) {
        return groups[key];
      });
    }

    var passed = checked - errors.length;

    return {
      byDefense: summarize("defense"),
      byRequest: summarize("request"),
      cases: cases,
      ok: errors.length === 0,
      checked: checked,
      criticalChecks: criticalChecks,
      errors: errors,
      passed: passed,
      total: checked
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

  function drawBadge(ctx, x, y, label, color) {
    ctx.font = "760 13px system-ui, -apple-system, Segoe UI, sans-serif";
    var w = Math.max(88, textWidth(ctx, label) + 20);
    roundRect(ctx, x, y, w, 28, 7);
    ctx.fillStyle = color === COLORS.blocked ? "#fff1f2" : color === COLORS.warning ? "#fffbeb" : "#e7f7f2";
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
    ctx.fillText("Fetch Metadata request gate", 28, 42);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(truncate(ctx, result.request.note, width - 56), 28, 68);

    drawBadge(ctx, 28, 94, result.request.site || "missing", result.request.site === "cross-site" ? COLORS.warning : COLORS.allowed);
    drawBadge(ctx, 142, 94, result.request.mode || "no mode", result.request.mode ? COLORS.browser : COLORS.blocked);
    drawBadge(ctx, 258, 94, result.request.dest || "no dest", result.request.dest ? COLORS.server : COLORS.blocked);
    drawBadge(ctx, 374, 94, result.request.user ? "user ?1" : "no user", result.request.user ? COLORS.allowed : COLORS.muted);

    var boxY = 152;
    var headerLines = result.headers.length ? result.headers.map(function (row) { return row[0] + ": " + row[1]; }) : ["no Sec-Fetch-* headers", result.request.signed ? "signature: valid" : "signature: absent"];
    drawBox(ctx, 34, boxY, 276, 168, "Browser evidence", headerLines, result.request.site ? COLORS.browser : COLORS.blocked);
    drawBox(ctx, 352, boxY, 276, 168, "Metadata gate", [
      result.defense.label,
      result.metadata.pass ? "metadata: pass" : "metadata: block",
      result.metadata.reason
    ], result.metadata.pass ? COLORS.allowed : COLORS.blocked);
    drawBox(ctx, 670, boxY, 276, 168, "Application", [
      result.request.method + " " + result.request.endpoint,
      result.request.token ? "token: present" : "token: absent",
      result.server.reason
    ], result.server.stateChanged ? COLORS.warning : (result.server.blocked ? COLORS.blocked : COLORS.server));

    drawArrow(ctx, 310, boxY + 84, 352, boxY + 84, COLORS.browser);
    drawArrow(ctx, 628, boxY + 84, 670, boxY + 84, result.server.blocked ? COLORS.blocked : COLORS.allowed);

    var tableX = 52;
    var tableY = 356;
    var rowH = 34;
    var rows = [
      ["metadata present", result.summary.metadataPresent ? "yes" : "no"],
      ["would block", result.summary.wouldBlock ? "yes" : "no"],
      ["blocked", result.summary.blocked ? "yes" : "no"],
      ["app reached", result.summary.appReached ? "yes" : "no"],
      ["token checked", result.summary.tokenChecked ? "yes" : "no"],
      ["state changed", result.summary.stateChanged ? "yes" : "no"],
      ["risk", result.summary.risk ? "yes" : "no"]
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
      ctx.fillStyle = row[1] === "yes" ? COLORS.allowed : COLORS.blocked;
      if (row[0] === "state changed" && row[1] === "yes") ctx.fillStyle = COLORS.warning;
      if (row[0] === "risk" && row[1] === "yes") ctx.fillStyle = COLORS.warning;
      ctx.fillText(row[1], width - 160, y + 23);
    });

    ctx.fillStyle = result.summary.risk ? COLORS.warning : COLORS.muted;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    var footer = result.summary.risk ?
      "Risk: the request shape was allowed to mutate state without a token or signature." :
      result.defense.note;
    ctx.fillText(truncate(ctx, footer, width - 56), 28, height - 24);
  }

  function setText(root, selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function initLab(root) {
    var canvas = root.querySelector("[data-canvas]");
    var controls = Array.prototype.slice.call(root.querySelectorAll("[data-param]"));
    var audit = auditFetchMetadataLab();

    function readParams() {
      var params = {};
      controls.forEach(function (control) {
        params[control.getAttribute("data-param")] = control.value;
      });
      return params;
    }

    function render() {
      var result = evaluate(readParams());
      setText(root, "[data-value='request']", result.request.label);
      setText(root, "[data-value='defense']", result.defense.label);
      setText(root, "[data-metric='present']", result.summary.metadataPresent ? "yes" : "no");
      setText(root, "[data-metric='wouldBlock']", result.summary.wouldBlock ? "yes" : "no");
      setText(root, "[data-metric='blocked']", result.summary.blocked ? "yes" : "no");
      setText(root, "[data-metric='reached']", result.summary.appReached ? "yes" : "no");
      setText(root, "[data-metric='changed']", result.summary.stateChanged ? "yes" : "no");
      setText(root, "[data-metric='audit']", audit.ok ? "passes" : "fails");
      setText(root, "[data-fetch-metadata-note]", result.summary.risk ? "The request reached a mutating endpoint without a token or signature." : result.server.reason);
      draw(canvas, result);
    }

    controls.forEach(function (control) {
      control.addEventListener("input", render);
      control.addEventListener("change", render);
    });
    render();
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-fetch-metadata-lab]")).forEach(initLab);
  }

  var API = {
    evaluate: evaluate,
    auditFetchMetadataLab: auditFetchMetadataLab,
    metadataVerdict: metadataVerdict,
    headersFor: headersFor,
    requests: REQUESTS,
    defenses: DEFENSES
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.FetchMetadataLab = API;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
