(function (global) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    preflight: "#2563eb",
    actual: "#0f766e",
    cached: "#7c3aed",
    blocked: "#be123c",
    server: "#b45309"
  };

  var DEFAULTS = {
    request: "credentialedJson",
    policy: "reflectCredentials",
    maxAge: 12,
    gap: 3
  };

  var REQUESTS = {
    publicGet: {
      label: "public GET",
      method: "GET",
      credentials: "omit",
      headers: [],
      body: false,
      note: "simple cross-origin read; no preflight, but the response still needs ACAO"
    },
    jsonPost: {
      label: "JSON POST",
      method: "POST",
      credentials: "omit",
      headers: [["Content-Type", "application/json"]],
      body: true,
      note: "POST is safelisted, but application/json is not a safelisted content type"
    },
    credentialedJson: {
      label: "credentialed JSON",
      method: "POST",
      credentials: "include",
      headers: [["Content-Type", "application/json"], ["X-Client-Trace", "demo-42"]],
      body: true,
      note: "cookies require an exact origin echo and Access-Control-Allow-Credentials: true"
    },
    authPatch: {
      label: "Authorization PATCH",
      method: "PATCH",
      credentials: "omit",
      headers: [["Authorization", "Bearer demo"], ["Content-Type", "application/json"]],
      body: true,
      note: "Authorization must be named explicitly; wildcard headers do not match it"
    }
  };

  var POLICIES = {
    reflectCredentials: {
      label: "reflect + credentials",
      note: "echoes the app origin, allows credentials, and lists the requested methods and headers"
    },
    wildcardNoCookies: {
      label: "wildcard no cookies",
      note: "shares public responses but cannot share credentialed responses"
    },
    missingAuthHeader: {
      label: "missing auth header",
      note: "allows JSON but forgets Authorization and X-Client-Trace"
    },
    wrongOrigin: {
      label: "wrong origin",
      note: "returns a real HTTP response that the browser will not expose to this page"
    },
    rolloutChange: {
      label: "policy changes mid-run",
      note: "shows that the preflight cache is method/header permission, not application authorization"
    }
  };

  var APP_ORIGIN = "https://app.example";
  var API_URL = "https://api.example/orders";
  var UA_MAX_AGE_CAP = 30;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      request: REQUESTS[raw.request] ? raw.request : DEFAULTS.request,
      policy: POLICIES[raw.policy] ? raw.policy : DEFAULTS.policy,
      maxAge: Math.round(clamp(numeric(raw.maxAge, DEFAULTS.maxAge), 0, 60)),
      gap: clamp(numeric(raw.gap, DEFAULTS.gap), 1, 12)
    };
  }

  function lower(value) {
    return String(value).toLowerCase();
  }

  function unique(values) {
    var seen = Object.create(null);
    var out = [];
    values.forEach(function (value) {
      var key = lower(value);
      if (!seen[key]) {
        seen[key] = true;
        out.push(key);
      }
    });
    return out.sort();
  }

  function formatList(values) {
    return values.length ? values.join(", ") : "none";
  }

  function isCorsSafelistedMethod(method) {
    return ["GET", "HEAD", "POST"].indexOf(String(method).toUpperCase()) >= 0;
  }

  function isCorsSafelistedHeader(name, value) {
    var n = lower(name);
    value = String(value || "");
    if (value.length > 128) return false;
    if (n === "accept" || n === "accept-language" || n === "content-language") return true;
    if (n === "content-type") {
      var mime = lower(value.split(";")[0].trim());
      return mime === "application/x-www-form-urlencoded" ||
        mime === "multipart/form-data" ||
        mime === "text/plain";
    }
    return false;
  }

  function unsafeHeaders(request) {
    return unique(request.headers.filter(function (header) {
      return !isCorsSafelistedHeader(header[0], header[1]);
    }).map(function (header) { return header[0]; }));
  }

  function needsPreflight(request) {
    return !isCorsSafelistedMethod(request.method) || unsafeHeaders(request).length > 0;
  }

  function requestFromParams(params) {
    var base = REQUESTS[params.request];
    return {
      origin: APP_ORIGIN,
      url: API_URL,
      method: base.method,
      credentials: base.credentials,
      headers: base.headers.map(function (row) { return [row[0], row[1]]; }),
      label: base.label,
      note: base.note
    };
  }

  function responseHeaders(policyName, request, params, t, phase) {
    var maxAge = params.maxAge;
    if (policyName === "wildcardNoCookies") {
      return {
        acao: "*",
        acac: false,
        methods: ["*"],
        headers: ["*"],
        maxAge: maxAge
      };
    }
    if (policyName === "missingAuthHeader") {
      return {
        acao: request.origin,
        acac: true,
        methods: ["GET", "POST", "PATCH", "DELETE"],
        headers: ["content-type"],
        maxAge: maxAge
      };
    }
    if (policyName === "wrongOrigin") {
      return {
        acao: "https://admin.example",
        acac: true,
        methods: ["GET", "POST", "PATCH", "DELETE"],
        headers: ["content-type", "authorization", "x-client-trace"],
        maxAge: maxAge
      };
    }
    if (policyName === "rolloutChange") {
      return {
        acao: request.origin,
        acac: true,
        methods: ["GET", "POST", "PATCH", "DELETE"],
        headers: t < 12 || phase === "actual" ? ["content-type", "authorization", "x-client-trace"] : ["content-type"],
        maxAge: maxAge
      };
    }
    return {
      acao: request.origin,
      acac: true,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      headers: ["content-type", "authorization", "x-client-trace"],
      maxAge: maxAge
    };
  }

  function corsCheck(request, response) {
    if (!response.acao) return { ok: false, reason: "missing Access-Control-Allow-Origin" };
    if (request.credentials !== "include" && response.acao === "*") return { ok: true, reason: "wildcard shared" };
    if (response.acao !== request.origin) return { ok: false, reason: "ACAO does not match Origin" };
    if (request.credentials !== "include") return { ok: true, reason: "origin matched" };
    if (response.acac === true) return { ok: true, reason: "origin and credentials matched" };
    return { ok: false, reason: "credentials need ACAC: true" };
  }

  function includesToken(list, token) {
    token = lower(token);
    return list.some(function (item) { return lower(item) === token; });
  }

  function methodAllowed(request, response) {
    if (isCorsSafelistedMethod(request.method)) return true;
    if (includesToken(response.methods, request.method)) return true;
    return request.credentials !== "include" && response.methods.indexOf("*") >= 0;
  }

  function headerAllowed(request, response, name) {
    if (lower(name) === "authorization") return includesToken(response.headers, "authorization");
    if (includesToken(response.headers, name)) return true;
    return request.credentials !== "include" && response.headers.indexOf("*") >= 0;
  }

  function cacheKey(request) {
    return request.origin + " " + request.url + " " + (request.credentials === "include" ? "include" : "omit");
  }

  function cleanCache(cache, now) {
    return cache.filter(function (entry) { return entry.expires > now; });
  }

  function cacheEntryMatches(entry, request) {
    if (entry.origin !== request.origin || entry.url !== request.url) return false;
    if (entry.credentials) return true;
    return request.credentials !== "include";
  }

  function methodCacheHit(cache, request) {
    if (isCorsSafelistedMethod(request.method)) return true;
    return cache.some(function (entry) {
      return cacheEntryMatches(entry, request) &&
        entry.kind === "method" &&
        (entry.value === "*" || lower(entry.value) === lower(request.method));
    });
  }

  function headerCacheHit(cache, request, name) {
    return cache.some(function (entry) {
      return cacheEntryMatches(entry, request) &&
        entry.kind === "header" &&
        (lower(entry.value) === lower(name) || (entry.value === "*" && lower(name) !== "authorization"));
    });
  }

  function hasPreflightCache(cache, request, headers) {
    return methodCacheHit(cache, request) && headers.every(function (name) {
      return headerCacheHit(cache, request, name);
    });
  }

  function addPreflightCache(cache, request, response, maxAge, now) {
    var age = Math.min(maxAge == null ? 5 : maxAge, UA_MAX_AGE_CAP);
    if (age <= 0) return;
    var expires = now + age;
    response.methods.forEach(function (method) {
      cache.push({
        kind: "method",
        value: method,
        origin: request.origin,
        url: request.url,
        credentials: request.credentials === "include",
        key: cacheKey(request),
        expires: expires
      });
    });
    response.headers.forEach(function (header) {
      cache.push({
        kind: "header",
        value: lower(header),
        origin: request.origin,
        url: request.url,
        credentials: request.credentials === "include",
        key: cacheKey(request),
        expires: expires
      });
    });
  }

  function simulate(raw) {
    var params = normalize(raw);
    var request = requestFromParams(params);
    var unsafe = unsafeHeaders(request);
    var preflightNeeded = needsPreflight(request);
    var cache = [];
    var attempts = [];
    var count = 6;

    for (var i = 0; i < count; i += 1) {
      var t = Number((i * params.gap).toFixed(3));
      cache = cleanCache(cache, t);
      var row = {
        index: i + 1,
        t: t,
        preflightNeeded: preflightNeeded,
        preflight: "not needed",
        actual: "not sent",
        exposed: false,
        reason: "",
        cacheEntries: cache.length
      };

      if (preflightNeeded) {
        if (hasPreflightCache(cache, request, unsafe)) {
          row.preflight = "cache hit";
        } else {
          row.preflight = "OPTIONS";
          var preflightResponse = responseHeaders(params.policy, request, params, t, "preflight");
          var cors = corsCheck(request, preflightResponse);
          var methodOk = methodAllowed(request, preflightResponse);
          var headersOk = unsafe.every(function (name) { return headerAllowed(request, preflightResponse, name); });
          if (!cors.ok || !methodOk || !headersOk) {
            row.actual = "blocked before send";
            row.reason = !cors.ok ? cors.reason : (!methodOk ? "method not allowed" : "header not allowed");
            attempts.push(row);
            continue;
          }
          addPreflightCache(cache, request, preflightResponse, preflightResponse.maxAge == null ? 5 : preflightResponse.maxAge, t);
        }
      }

      row.actual = "HTTP 200";
      var actualResponse = responseHeaders(params.policy, request, params, t, "actual");
      var actualCors = corsCheck(request, actualResponse);
      if (actualCors.ok) {
        row.exposed = true;
        row.reason = actualCors.reason;
      } else {
        row.actual = "200 hidden";
        row.reason = actualCors.reason;
      }
      row.cacheEntries = cache.length;
      attempts.push(row);
    }

    var summary = {
      attempts: attempts.length,
      preflights: attempts.filter(function (row) { return row.preflight === "OPTIONS"; }).length,
      cacheHits: attempts.filter(function (row) { return row.preflight === "cache hit"; }).length,
      exposed: attempts.filter(function (row) { return row.exposed; }).length,
      blockedBefore: attempts.filter(function (row) { return row.actual === "blocked before send"; }).length,
      blockedAfter: attempts.filter(function (row) { return row.actual === "200 hidden"; }).length
    };

    return {
      params: params,
      request: request,
      policy: POLICIES[params.policy],
      unsafeHeaders: unsafe,
      preflightNeeded: preflightNeeded,
      attempts: attempts,
      summary: summary,
      audit: verify({
        params: params,
        request: request,
        unsafeHeaders: unsafe,
        preflightNeeded: preflightNeeded,
        attempts: attempts,
        summary: summary
      })
    };
  }

  function verify(result) {
    var issues = [];
    if (result.attempts.length !== 6) issues.push("six attempts expected");
    if (!result.preflightNeeded && result.summary.preflights !== 0) issues.push("simple requests should not preflight");
    if (result.summary.exposed + result.summary.blockedBefore + result.summary.blockedAfter !== result.summary.attempts) {
      issues.push("outcomes should partition attempts");
    }
    result.attempts.forEach(function (row) {
      if (row.preflight === "cache hit" && !result.preflightNeeded) issues.push("cache hit without preflight need");
      if (row.actual === "blocked before send" && row.exposed) issues.push("blocked row exposed response");
    });
    if (result.request.credentials === "include" && result.params.policy === "wildcardNoCookies" && result.summary.exposed !== 0) {
      issues.push("wildcard must not expose credentialed responses");
    }
    if (result.params.request === "authPatch" && result.params.policy === "wildcardNoCookies" && result.summary.blockedBefore !== result.summary.attempts) {
      issues.push("Authorization should not be satisfied by wildcard headers");
    }
    return { ok: issues.length === 0, issues: issues };
  }

  function auditCorsPreflightLab() {
    var failures = [];
    var checked = 0;
    Object.keys(REQUESTS).forEach(function (request) {
      Object.keys(POLICIES).forEach(function (policy) {
        [0, 5, 12, 40].forEach(function (maxAge) {
          var result = simulate({ request: request, policy: policy, maxAge: maxAge, gap: 3 });
          checked += 1;
          if (!result.audit.ok) failures.push({ request: request, policy: policy, maxAge: maxAge, issues: result.audit.issues });
        });
      });
    });
    return { ok: failures.length === 0, checked: checked, failures: failures };
  }

  function setText(root, name, value) {
    var node = root.querySelector('[data-metric="' + name + '"]');
    if (node) node.textContent = value;
  }

  function fmt(value, digits) {
    return Number(value).toFixed(digits == null ? 0 : digits).replace(/\.0+$/, "");
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

  function text(ctx, value, x, y, options) {
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
    text(ctx, title, box.x + 14, box.y + 18, { size: 13, weight: 850 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 39, { size: 11, color: COLORS.muted, weight: 650 });
  }

  function drawTimeline(ctx, box, state) {
    panel(ctx, box, "browser ledger", "OPTIONS is the dry run; the actual response still gets checked");
    var plot = { x: box.x + 34, y: box.y + 70, w: box.w - 68, h: box.h - 102 };
    var lastT = state.attempts[state.attempts.length - 1].t || 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    state.attempts.forEach(function (row) {
      var x = plot.x + (lastT ? row.t / lastT : 0) * plot.w;
      var y = plot.y + plot.h - 24;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.fillStyle = row.preflight === "OPTIONS" ? COLORS.preflight : row.preflight === "cache hit" ? COLORS.cached : COLORS.rule;
      ctx.strokeStyle = "transparent";
      ctx.beginPath();
      ctx.arc(x, y - 34, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = row.exposed ? COLORS.actual : row.actual === "200 hidden" ? COLORS.server : row.actual === "blocked before send" ? COLORS.blocked : COLORS.rule;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(row.index), x, y + 23, { size: 10, color: COLORS.muted, align: "center" });
    });
    text(ctx, "preflight", plot.x, plot.y + plot.h - 58, { size: 11, color: COLORS.muted });
    text(ctx, "actual", plot.x, plot.y + plot.h - 24, { size: 11, color: COLORS.muted });
    text(ctx, "blue OPTIONS, violet cache hit, green exposed, orange hidden, red blocked", plot.x, box.y + box.h - 18, { size: 10, color: COLORS.muted });
  }

  function drawRequest(ctx, box, state) {
    panel(ctx, box, "request shape", "preflight depends on method and script-set headers");
    var rows = [
      ["origin", state.request.origin],
      ["target", new URL(state.request.url).origin],
      ["method", state.request.method],
      ["credentials", state.request.credentials],
      ["unsafe headers", formatList(state.unsafeHeaders)],
      ["preflight?", state.preflightNeeded ? "yes" : "no"]
    ];
    rows.forEach(function (row, i) {
      var y = box.y + 68 + i * 24;
      text(ctx, row[0], box.x + 18, y, { size: 11, color: COLORS.muted });
      text(ctx, row[1], box.x + 126, y, { size: 11, color: row[0] === "preflight?" && state.preflightNeeded ? COLORS.preflight : COLORS.ink, weight: 760 });
    });
  }

  function drawCache(ctx, box, state) {
    panel(ctx, box, "preflight cache", "keyed by origin, URL, credentials mode, method, and headers");
    var max = Math.max(1, state.summary.attempts);
    var rows = [
      ["OPTIONS", state.summary.preflights, COLORS.preflight],
      ["cache hits", state.summary.cacheHits, COLORS.cached],
      ["no preflight", state.summary.attempts - state.summary.preflights - state.summary.cacheHits, COLORS.rule]
    ];
    rows.forEach(function (row, i) {
      var y = box.y + 70 + i * 42;
      text(ctx, row[0], box.x + 18, y + 9, { size: 11, color: COLORS.muted });
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.rule;
      roundRect(ctx, box.x + 108, y, box.w - 134, 18, 9);
      ctx.fillStyle = row[2];
      ctx.strokeStyle = "transparent";
      roundRect(ctx, box.x + 108, y, Math.max(3, (box.w - 134) * row[1] / max), 18, 9);
      text(ctx, String(row[1]), box.x + box.w - 18, y + 9, { size: 11, color: COLORS.ink, align: "right" });
    });
    text(ctx, "server Max-Age " + state.params.maxAge + "s; demo UA cap " + UA_MAX_AGE_CAP + "s", box.x + 18, box.y + box.h - 22, { size: 10, color: COLORS.muted });
  }

  function drawOutcome(ctx, box, state) {
    panel(ctx, box, "browser-visible outcome", "CORS gates response exposure, not whether the server can receive packets");
    var rows = [
      ["exposed", state.summary.exposed, COLORS.actual],
      ["blocked before send", state.summary.blockedBefore, COLORS.blocked],
      ["200 hidden", state.summary.blockedAfter, COLORS.server]
    ];
    rows.forEach(function (row, i) {
      var y = box.y + 72 + i * 44;
      text(ctx, row[0], box.x + 18, y + 9, { size: 11, color: COLORS.muted });
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.rule;
      roundRect(ctx, box.x + 142, y, box.w - 168, 18, 9);
      ctx.fillStyle = row[2];
      ctx.strokeStyle = "transparent";
      roundRect(ctx, box.x + 142, y, Math.max(3, (box.w - 168) * row[1] / Math.max(1, state.summary.attempts)), 18, 9);
      text(ctx, String(row[1]), box.x + box.w - 18, y + 9, { size: 11, color: COLORS.ink, align: "right" });
    });
    var last = state.attempts[state.attempts.length - 1];
    text(ctx, "last decision: " + last.reason, box.x + 18, box.y + box.h - 22, { size: 10, color: COLORS.muted });
  }

  function draw(canvas, state) {
    var compact = canvas.clientWidth && canvas.clientWidth < 620;
    var width = compact ? 760 : 980;
    var height = compact ? 860 : 700;
    var ctx = setCanvas(canvas, width, height);
    ctx.clearRect(0, 0, width, height);
    if (compact) {
      drawTimeline(ctx, { x: 16, y: 16, w: width - 32, h: 230 }, state);
      drawRequest(ctx, { x: 16, y: 268, w: width - 32, h: 190 }, state);
      drawCache(ctx, { x: 16, y: 480, w: width - 32, h: 174 }, state);
      drawOutcome(ctx, { x: 16, y: 676, w: width - 32, h: 166 }, state);
    } else {
      drawTimeline(ctx, { x: 18, y: 18, w: 944, h: 236 }, state);
      drawRequest(ctx, { x: 18, y: 278, w: 456, h: 190 }, state);
      drawCache(ctx, { x: 506, y: 278, w: 456, h: 190 }, state);
      drawOutcome(ctx, { x: 18, y: 492, w: 944, h: 180 }, state);
    }
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("output[data-value]").forEach(function (output) {
      var name = output.getAttribute("data-value");
      if (name === "request") output.textContent = REQUESTS[params.request].label;
      else if (name === "policy") output.textContent = POLICIES[params.policy].label;
      else if (name === "maxAge") output.textContent = params.maxAge + "s";
      else if (name === "gap") output.textContent = fmt(params.gap, 1) + "s";
    });
  }

  function render(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (control) {
      raw[control.getAttribute("data-param")] = control.value;
    });
    var state = simulate(raw);
    root.__corsPreflightState = state;
    updateOutputs(root, state.params);
    setText(root, "attempts", state.summary.attempts);
    setText(root, "preflights", state.summary.preflights);
    setText(root, "cacheHits", state.summary.cacheHits);
    setText(root, "exposed", state.summary.exposed);
    setText(root, "blocked", state.summary.blockedBefore + state.summary.blockedAfter);
    setText(root, "audit", state.audit.ok ? "passes" : "fails");
    var note = root.querySelector("[data-cors-note]");
    if (note) note.textContent = REQUESTS[state.params.request].note + " Server policy: " + POLICIES[state.params.policy].note + ".";
    var canvas = root.querySelector("canvas");
    if (canvas) draw(canvas, state);
  }

  function init(root) {
    if (!root || root.__corsReady) return;
    root.__corsReady = true;
    root.querySelectorAll("[data-param]").forEach(function (control) {
      control.addEventListener("input", function () { render(root); });
      control.addEventListener("change", function () { render(root); });
    });
    render(root);
    global.addEventListener("resize", function () { render(root); });
  }

  function mount() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-cors-preflight-lab]")).forEach(init);
  }

  var api = {
    normalize: normalize,
    unsafeHeaders: unsafeHeaders,
    needsPreflight: needsPreflight,
    corsCheck: corsCheck,
    simulate: simulate,
    verify: verify,
    auditCorsPreflightLab: auditCorsPreflightLab
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CorsPreflightLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
