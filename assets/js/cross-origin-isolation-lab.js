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
    deployment: "requireCorp",
    resources: "thirdPartyPage"
  };

  var COMPATIBLE_COEP = { "require-corp": true, credentialless: true };
  var VALID_CORP = { "same-origin": true, "same-site": true, "cross-origin": true };

  var DEPLOYMENTS = {
    openWeb: {
      label: "open web defaults",
      coop: "unsafe-none",
      coep: "unsafe-none",
      reportCoop: "unsafe-none",
      reportCoep: "unsafe-none",
      permission: true,
      secure: true,
      rawCoep: "none",
      note: "no isolation headers; compatibility first"
    },
    coopOnly: {
      label: "COOP only",
      coop: "same-origin",
      coep: "unsafe-none",
      reportCoop: "unsafe-none",
      reportCoep: "unsafe-none",
      permission: true,
      secure: true,
      rawCoep: "none",
      note: "opener boundary without an embedder contract"
    },
    coepOnly: {
      label: "COEP only",
      coop: "unsafe-none",
      coep: "require-corp",
      reportCoop: "unsafe-none",
      reportCoep: "unsafe-none",
      permission: true,
      secure: true,
      rawCoep: "require-corp",
      note: "subresource opt-in without opener isolation"
    },
    requireCorp: {
      label: "COOP + require-corp",
      coop: "same-origin",
      coep: "require-corp",
      reportCoop: "unsafe-none",
      reportCoep: "unsafe-none",
      permission: true,
      secure: true,
      rawCoep: "require-corp",
      note: "strict isolation; every cross-origin load must opt in"
    },
    credentialless: {
      label: "COOP + credentialless",
      coop: "same-origin",
      coep: "credentialless",
      reportCoop: "unsafe-none",
      reportCoep: "unsafe-none",
      permission: true,
      secure: true,
      rawCoep: "credentialless",
      note: "isolation with credential-stripped no-CORS subresources"
    },
    reportOnly: {
      label: "report-only rollout",
      coop: "unsafe-none",
      coep: "unsafe-none",
      reportCoop: "same-origin",
      reportCoep: "require-corp",
      permission: true,
      secure: true,
      rawCoep: "report-only require-corp",
      note: "observe COOP/COEP breakage without enforcing it"
    },
    permissionBlocked: {
      label: "permission blocks API",
      coop: "same-origin",
      coep: "require-corp",
      reportCoop: "unsafe-none",
      reportCoep: "unsafe-none",
      permission: false,
      secure: true,
      rawCoep: "require-corp",
      note: "headers isolate the group, but the API feature is denied"
    },
    duplicateCoep: {
      label: "duplicate COEP typo",
      coop: "same-origin",
      coep: "unsafe-none",
      reportCoop: "unsafe-none",
      reportCoep: "unsafe-none",
      permission: true,
      secure: true,
      rawCoep: "require-corp, require-corp",
      parseWarning: true,
      note: "a combined list parses invalid and falls back to unsafe-none"
    }
  };

  var RESOURCE_SETS = {
    cleanWasm: {
      label: "threaded wasm app",
      popup: null,
      resources: [
        {
          label: "app shell",
          url: "/app.js",
          destination: "script",
          relationship: "same-origin",
          mode: "same-origin",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: null,
          note: "same-origin parser script"
        },
        {
          label: "worker",
          url: "/worker.js",
          destination: "worker",
          relationship: "same-origin",
          mode: "same-origin",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: "require-corp",
          requiresEmbedderPolicy: true,
          note: "dedicated worker carries compatible COEP"
        },
        {
          label: "wasm module",
          url: "https://cdn.math.example/simd.wasm",
          destination: "fetch",
          relationship: "cross-origin",
          mode: "cors",
          credentials: false,
          cors: true,
          corp: null,
          childCoep: null,
          note: "CORS response explicitly opts in"
        },
        {
          label: "font",
          url: "https://fonts.example/mono.woff2",
          destination: "font",
          relationship: "cross-origin",
          mode: "cors",
          credentials: false,
          cors: true,
          corp: null,
          childCoep: null,
          note: "font load uses CORS"
        }
      ]
    },
    thirdPartyPage: {
      label: "marketing page",
      popup: { label: "identity popup", relationship: "cross-origin", needsOpener: true },
      resources: [
        {
          label: "app shell",
          url: "/app.js",
          destination: "script",
          relationship: "same-origin",
          mode: "same-origin",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: null,
          note: "same-origin script"
        },
        {
          label: "hero image",
          url: "https://cdn.example/hero.jpg",
          destination: "image",
          relationship: "cross-origin",
          mode: "no-cors",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: null,
          note: "opaque image with no CORP"
        },
        {
          label: "analytics tag",
          url: "https://analytics.example/tag.js",
          destination: "script",
          relationship: "cross-origin",
          mode: "no-cors",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: null,
          note: "classic script load with cookies"
        },
        {
          label: "ad iframe",
          url: "https://ads.example/frame.html",
          destination: "iframe",
          relationship: "cross-origin",
          mode: "navigate",
          credentials: true,
          cors: false,
          corp: "cross-origin",
          childCoep: "unsafe-none",
          requiresEmbedderPolicy: true,
          note: "child document does not inherit COEP"
        }
      ]
    },
    credentiallessCdn: {
      label: "credentialless CDN",
      popup: null,
      resources: [
        {
          label: "app shell",
          url: "/app.js",
          destination: "script",
          relationship: "same-origin",
          mode: "same-origin",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: null,
          note: "same-origin script"
        },
        {
          label: "public image",
          url: "https://images.example/photo.webp",
          destination: "image",
          relationship: "cross-origin",
          mode: "no-cors",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: null,
          note: "can load under credentialless without cookies"
        },
        {
          label: "public script",
          url: "https://cdn.example/widget.js",
          destination: "script",
          relationship: "cross-origin",
          mode: "no-cors",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: null,
          note: "credentialless strips ambient cookies"
        },
        {
          label: "private fetch",
          url: "https://api.vendor.example/me",
          destination: "fetch",
          relationship: "cross-origin",
          mode: "cors",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: null,
          note: "credentialed CORS still needs explicit permission"
        }
      ]
    },
    sameSiteAssets: {
      label: "same-site asset host",
      popup: null,
      resources: [
        {
          label: "app shell",
          url: "/app.js",
          destination: "script",
          relationship: "same-origin",
          mode: "same-origin",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: null,
          note: "same-origin script"
        },
        {
          label: "asset image",
          url: "https://static.app.example/chart.png",
          destination: "image",
          relationship: "same-site",
          mode: "no-cors",
          credentials: true,
          cors: false,
          corp: "same-site",
          childCoep: null,
          note: "same-site CORP permits sibling host"
        },
        {
          label: "legacy http image",
          url: "https://static.app.example/legacy.png",
          destination: "image",
          relationship: "same-site",
          mode: "no-cors",
          credentials: true,
          cors: false,
          corp: "same-site",
          secureMismatch: true,
          childCoep: null,
          note: "secure response does not match non-secure initiator"
        }
      ]
    },
    defensiveCorp: {
      label: "resource owner refuses",
      popup: null,
      resources: [
        {
          label: "app shell",
          url: "/app.js",
          destination: "script",
          relationship: "same-origin",
          mode: "same-origin",
          credentials: true,
          cors: false,
          corp: null,
          childCoep: null,
          note: "same-origin script"
        },
        {
          label: "bank logo",
          url: "https://bank.example/logo.png",
          destination: "image",
          relationship: "cross-origin",
          mode: "no-cors",
          credentials: true,
          cors: false,
          corp: "same-origin",
          childCoep: null,
          note: "resource says same-origin consumers only"
        },
        {
          label: "open badge",
          url: "https://badges.example/open.svg",
          destination: "image",
          relationship: "cross-origin",
          mode: "no-cors",
          credentials: false,
          cors: false,
          corp: "cross-origin",
          childCoep: null,
          note: "resource owner permits cross-origin embedding"
        }
      ]
    }
  };

  function clampKey(table, value, fallback) {
    return table[value] ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      deployment: clampKey(DEPLOYMENTS, raw.deployment, DEFAULTS.deployment),
      resources: clampKey(RESOURCE_SETS, raw.resources, DEFAULTS.resources)
    };
  }

  function coepCompatible(value) {
    return !!COMPATIBLE_COEP[value];
  }

  function sameOrigin(resource) {
    return resource.relationship === "same-origin";
  }

  function sameSite(resource) {
    return resource.relationship === "same-origin" || resource.relationship === "same-site";
  }

  function corsAllows(resource) {
    return resource.mode === "cors" && resource.cors === true;
  }

  function credentialsSent(resource, coep) {
    if (coep === "credentialless" && resource.relationship !== "same-origin" && resource.mode === "no-cors" && resource.destination !== "iframe") {
      return false;
    }
    return !!resource.credentials;
  }

  function corpAllows(policy, resource) {
    if (policy === "cross-origin") return { allowed: true, reason: "CORP cross-origin permits any origin" };
    if (policy === "same-origin") {
      if (sameOrigin(resource)) return { allowed: true, reason: "CORP same-origin matches" };
      return { allowed: false, reason: "CORP same-origin rejects this origin" };
    }
    if (policy === "same-site") {
      if (sameSite(resource) && !resource.secureMismatch) return { allowed: true, reason: "CORP same-site matches" };
      return { allowed: false, reason: resource.secureMismatch ? "CORP same-site fails the secure-transport check" : "CORP same-site rejects this site" };
    }
    return { allowed: true, reason: "no CORP policy applies" };
  }

  function resourceCheck(resource, coep) {
    var reasons = [];
    var stripped = resource.credentials && !credentialsSent(resource, coep);

    if (sameOrigin(resource)) {
      reasons.push("same-origin resource");
      return { allowed: true, credentialsSent: credentialsSent(resource, coep), stripped: stripped, reasons: reasons };
    }
    if (corsAllows(resource)) {
      reasons.push("CORS response explicitly opts in");
      return { allowed: true, credentialsSent: credentialsSent(resource, coep), stripped: stripped, reasons: reasons };
    }

    var policy = VALID_CORP[resource.corp] ? resource.corp : null;
    if (policy === null) {
      if (coep === "require-corp") policy = "same-origin";
      if (coep === "credentialless") {
        if (resource.destination === "iframe" || credentialsSent(resource, coep)) policy = "same-origin";
      }
    }

    var corp = corpAllows(policy, resource);
    reasons.push(corp.reason);

    if (!corp.allowed) {
      return { allowed: false, credentialsSent: credentialsSent(resource, coep), stripped: stripped, reasons: reasons };
    }

    if (coepCompatible(coep) && resource.requiresEmbedderPolicy && !coepCompatible(resource.childCoep)) {
      reasons.push("child context lacks compatible COEP");
      return { allowed: false, credentialsSent: credentialsSent(resource, coep), stripped: stripped, reasons: reasons };
    }

    if (stripped) reasons.push("credentials stripped by COEP credentialless");
    return { allowed: true, credentialsSent: credentialsSent(resource, coep), stripped: stripped, reasons: reasons };
  }

  function popupCheck(popup, coop, reportCoop) {
    if (!popup) {
      return { present: false, connected: false, severed: false, wouldReport: false, reason: "no popup in this workload" };
    }
    var severed = popup.relationship !== "same-origin" && (coop === "same-origin" || coop === "noopener-allow-popups");
    var wouldReport = popup.relationship !== "same-origin" && reportCoop === "same-origin";
    return {
      present: true,
      connected: !severed,
      severed: severed,
      wouldReport: wouldReport && !severed,
      reason: severed ? "COOP severs the cross-origin opener relationship" : "opener relationship remains connected"
    };
  }

  function isolationState(deployment) {
    var compatible = coepCompatible(deployment.coep);
    var groupIsolated = deployment.secure && deployment.coop === "same-origin" && compatible;
    var api = groupIsolated && deployment.permission;
    return {
      compatibleCoep: compatible,
      groupIsolated: groupIsolated,
      crossOriginIsolated: api,
      sharedMemory: api,
      reason: api ? "crossOriginIsolated is true" :
        !deployment.secure ? "non-secure context" :
        deployment.coop !== "same-origin" ? "COOP is not same-origin" :
        !compatible ? "COEP is not require-corp or credentialless" :
        "cross-origin-isolated feature is denied"
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var deployment = DEPLOYMENTS[params.deployment];
    var set = RESOURCE_SETS[params.resources];
    var isolation = isolationState(deployment);
    var popup = popupCheck(set.popup, deployment.coop, deployment.reportCoop);
    var resources = set.resources.map(function (resource) {
      var enforced = resourceCheck(resource, deployment.coep);
      var reported = resourceCheck(resource, deployment.reportCoep);
      return {
        resource: resource,
        allowed: enforced.allowed,
        blocked: !enforced.allowed,
        reported: deployment.reportCoep !== "unsafe-none" && !reported.allowed,
        credentialsSent: enforced.credentialsSent,
        stripped: enforced.stripped,
        reason: enforced.reasons.join("; "),
        reportReason: reported.reasons.join("; ")
      };
    });
    var blocked = resources.filter(function (row) { return row.blocked; }).length;
    var reportedCount = resources.filter(function (row) { return row.reported; }).length + (popup.wouldReport ? 1 : 0);
    var stripped = resources.filter(function (row) { return row.stripped; }).length;
    return {
      params: params,
      deployment: deployment,
      resourceSet: set,
      isolation: isolation,
      popup: popup,
      resources: resources,
      summary: {
        total: resources.length,
        loaded: resources.length - blocked,
        blocked: blocked,
        reported: reportedCount,
        stripped: stripped,
        openerSevered: popup.severed ? 1 : 0,
        groupIsolated: isolation.groupIsolated ? 1 : 0,
        crossOriginIsolated: isolation.crossOriginIsolated ? 1 : 0,
        sharedMemory: isolation.sharedMemory ? 1 : 0
      }
    };
  }

  function auditCrossOriginIsolationLab() {
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

    addCritical("COOP plus require-corp isolates clean app", evaluate({ deployment: "requireCorp", resources: "cleanWasm" }).summary.crossOriginIsolated === 1);
    addCritical("COOP plus credentialless isolates clean app", evaluate({ deployment: "credentialless", resources: "cleanWasm" }).summary.crossOriginIsolated === 1);
    addCritical("COOP alone does not isolate", evaluate({ deployment: "coopOnly", resources: "cleanWasm" }).summary.crossOriginIsolated === 0);
    addCritical("COEP alone does not isolate", evaluate({ deployment: "coepOnly", resources: "cleanWasm" }).summary.crossOriginIsolated === 0);
    addCritical("permission policy can deny gated APIs", evaluate({ deployment: "permissionBlocked", resources: "cleanWasm" }).summary.sharedMemory === 0);
    addCritical("invalid combined COEP fails open", evaluate({ deployment: "duplicateCoep", resources: "cleanWasm" }).summary.crossOriginIsolated === 0);
    addCritical("report-only does not block resources", evaluate({ deployment: "reportOnly", resources: "thirdPartyPage" }).summary.blocked === 0);
    addCritical("report-only records violations", evaluate({ deployment: "reportOnly", resources: "thirdPartyPage" }).summary.reported > 0);
    addCritical("require-corp blocks unopted third-party resources", evaluate({ deployment: "requireCorp", resources: "thirdPartyPage" }).summary.blocked >= 2);
    addCritical("COOP same-origin severs cross-origin popup opener", evaluate({ deployment: "requireCorp", resources: "thirdPartyPage" }).summary.openerSevered === 1);
    addCritical("open defaults keep popup opener", evaluate({ deployment: "openWeb", resources: "thirdPartyPage" }).summary.openerSevered === 0);
    addCritical("credentialless strips no-CORS credentials", evaluate({ deployment: "credentialless", resources: "credentiallessCdn" }).summary.stripped === 2);
    addCritical("credentialless still blocks credentialed CORS without permission", evaluate({ deployment: "credentialless", resources: "credentiallessCdn" }).summary.blocked === 1);
    addCritical("require-corp blocks missing CORP no-CORS resources", evaluate({ deployment: "requireCorp", resources: "credentiallessCdn" }).summary.blocked >= 2);
    addCritical("same-site CORP secure mismatch blocks one resource", evaluate({ deployment: "requireCorp", resources: "sameSiteAssets" }).summary.blocked === 1);
    addCritical("CORP same-origin protects resource even without COEP", evaluate({ deployment: "openWeb", resources: "defensiveCorp" }).summary.blocked === 1);
    addCritical("open CORP workload loads non-protected resources", evaluate({ deployment: "openWeb", resources: "defensiveCorp" }).summary.loaded === 2);

    Object.keys(DEPLOYMENTS).forEach(function (deploymentKey) {
      Object.keys(RESOURCE_SETS).forEach(function (setKey) {
        var result = evaluate({ deployment: deploymentKey, resources: setKey });
        var failedChecks = [];
        var label = deploymentKey + "/" + setKey + " accounts for all resources";
        if (!record(result.summary.loaded + result.summary.blocked === result.summary.total, label)) failedChecks.push(label);
        label = deploymentKey + "/" + setKey + " shared memory requires crossOriginIsolated";
        if (!record(result.summary.sharedMemory <= result.summary.crossOriginIsolated, label)) failedChecks.push(label);
        label = deploymentKey + "/" + setKey + " API isolation implies group isolation";
        if (!record(result.summary.crossOriginIsolated <= result.summary.groupIsolated, label)) failedChecks.push(label);
        cases.push({
          blocked: result.summary.blocked,
          crossOriginIsolated: result.summary.crossOriginIsolated,
          deployment: deploymentKey,
          failedChecks: failedChecks,
          groupIsolated: result.summary.groupIsolated,
          loaded: result.summary.loaded,
          openerSevered: result.summary.openerSevered,
          passed: failedChecks.length === 0,
          reported: result.summary.reported,
          resources: setKey,
          sharedMemory: result.summary.sharedMemory,
          stripped: result.summary.stripped,
          totalResources: result.summary.total
        });
      });
    });

    function summarize(groupBy) {
      var groups = {};
      cases.forEach(function (row) {
        var key = row[groupBy];
        if (!groups[key]) {
          groups[key] = {
            blocked: 0,
            cases: 0,
            crossOriginIsolated: 0,
            groupIsolated: 0,
            loaded: 0,
            openerSevered: 0,
            passed: 0,
            reported: 0,
            sharedMemory: 0,
            stripped: 0,
            totalResources: 0
          };
          groups[key][groupBy] = key;
        }
        groups[key].blocked += row.blocked;
        groups[key].cases += 1;
        groups[key].crossOriginIsolated += row.crossOriginIsolated;
        groups[key].groupIsolated += row.groupIsolated;
        groups[key].loaded += row.loaded;
        groups[key].openerSevered += row.openerSevered;
        groups[key].reported += row.reported;
        groups[key].sharedMemory += row.sharedMemory;
        groups[key].stripped += row.stripped;
        groups[key].totalResources += row.totalResources;
        if (row.passed) groups[key].passed += 1;
      });
      return Object.keys(groups).sort().map(function (key) {
        return groups[key];
      });
    }

    var passed = checked - errors.length;

    return {
      byDeployment: summarize("deployment"),
      byResourceSet: summarize("resources"),
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

  function drawBadge(ctx, x, y, label, color) {
    ctx.font = "760 13px system-ui, -apple-system, Segoe UI, sans-serif";
    var w = Math.max(86, textWidth(ctx, label) + 20);
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

  function drawPanel(ctx, x, y, w, h, title, lines, color) {
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

  function draw(canvas, result) {
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = COLORS.ink;
    ctx.font = "760 25px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("Cross-origin isolation budget", 28, 42);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(truncate(ctx, result.deployment.note + " / " + result.resourceSet.label, width - 56), 28, 68);

    var bx = 28;
    bx += drawBadge(ctx, bx, 94, "COOP " + result.deployment.coop, result.deployment.coop === "same-origin" ? COLORS.allowed : COLORS.muted) + 10;
    bx += drawBadge(ctx, bx, 94, "COEP " + result.deployment.coep, result.isolation.compatibleCoep ? COLORS.allowed : COLORS.muted) + 10;
    bx += drawBadge(ctx, bx, 94, result.isolation.crossOriginIsolated ? "isolated" : "not isolated", result.isolation.crossOriginIsolated ? COLORS.allowed : COLORS.blocked) + 10;
    drawBadge(ctx, bx, 94, result.summary.stripped ? "strips cookies" : "keeps creds", result.summary.stripped ? COLORS.warning : COLORS.muted);

    drawPanel(ctx, 34, 146, 282, 142, "Document headers", [
      "Cross-Origin-Opener-Policy: " + result.deployment.coop,
      "Cross-Origin-Embedder-Policy: " + result.deployment.rawCoep,
      result.deployment.permission ? "Permissions-Policy: allows feature" : "Permissions-Policy: denies feature"
    ], result.deployment.parseWarning ? COLORS.warning : COLORS.browser);
    drawPanel(ctx, 350, 146, 282, 142, "Isolation result", [
      result.isolation.groupIsolated ? "browsing group: isolated" : "browsing group: not isolated",
      result.isolation.crossOriginIsolated ? "self.crossOriginIsolated: true" : "self.crossOriginIsolated: false",
      result.isolation.reason
    ], result.isolation.crossOriginIsolated ? COLORS.allowed : COLORS.blocked);
    drawPanel(ctx, 666, 146, 282, 142, "Popup channel", [
      result.popup.present ? result.resourceSet.popup.label : "no popup opened",
      result.popup.reason,
      result.popup.wouldReport ? "report-only would flag opener" : "no opener report"
    ], result.popup.severed ? COLORS.warning : COLORS.server);

    var tableX = 36;
    var tableY = 324;
    var rowH = 48;
    var colName = 174;
    var colDest = 96;
    var colRel = 108;
    var colPolicy = 112;
    var colStatus = 96;
    var colReason = width - 72 - colName - colDest - colRel - colPolicy - colStatus;

    ctx.font = "760 13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("resource", tableX + 10, tableY - 12);
    ctx.fillText("dest", tableX + colName + 10, tableY - 12);
    ctx.fillText("relation", tableX + colName + colDest + 10, tableY - 12);
    ctx.fillText("grant", tableX + colName + colDest + colRel + 10, tableY - 12);
    ctx.fillText("status", tableX + colName + colDest + colRel + colPolicy + 10, tableY - 12);
    ctx.fillText("reason", tableX + colName + colDest + colRel + colPolicy + colStatus + 10, tableY - 12);

    result.resources.forEach(function (row, i) {
      var y = tableY + i * rowH;
      ctx.fillStyle = i % 2 ? COLORS.white : COLORS.panel;
      ctx.fillRect(tableX, y, width - 72, rowH);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(tableX, y, width - 72, rowH);
      ctx.fillStyle = COLORS.ink;
      ctx.font = "760 14px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(truncate(ctx, row.resource.label, colName - 18), tableX + 10, y + 21);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(truncate(ctx, row.resource.url, colName - 18), tableX + 10, y + 39);
      ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(row.resource.destination, tableX + colName + 10, y + 29);
      ctx.fillText(row.resource.relationship, tableX + colName + colDest + 10, y + 29);
      ctx.fillText(row.resource.cors ? "CORS" : (row.resource.corp || "none"), tableX + colName + colDest + colRel + 10, y + 29);
      ctx.fillStyle = row.allowed ? COLORS.allowed : COLORS.blocked;
      if (row.reported && row.allowed) ctx.fillStyle = COLORS.warning;
      ctx.font = "760 13px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(row.allowed ? (row.reported ? "report" : "loaded") : "blocked", tableX + colName + colDest + colRel + colPolicy + 10, y + 29);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(truncate(ctx, row.reason, colReason - 18), tableX + colName + colDest + colRel + colPolicy + colStatus + 10, y + 29);
    });

    var footerY = height - 78;
    var metrics = [
      ["loaded", result.summary.loaded],
      ["blocked", result.summary.blocked],
      ["reports", result.summary.reported],
      ["stripped", result.summary.stripped],
      ["SAB", result.summary.sharedMemory ? "yes" : "no"]
    ];
    var mx = 42;
    metrics.forEach(function (metric) {
      ctx.fillStyle = COLORS.panel;
      ctx.strokeStyle = COLORS.rule;
      roundRect(ctx, mx, footerY, 154, 48, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "760 11px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(metric[0].toUpperCase(), mx + 12, footerY + 18);
      ctx.fillStyle = metric[0] === "blocked" && metric[1] ? COLORS.blocked : metric[0] === "SAB" && metric[1] === "yes" ? COLORS.allowed : COLORS.ink;
      ctx.font = "760 18px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(String(metric[1]), mx + 12, footerY + 40);
      mx += 174;
    });
  }

  function setText(root, selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function initLab(root) {
    var canvas = root.querySelector("[data-canvas]");
    var controls = Array.prototype.slice.call(root.querySelectorAll("[data-param]"));
    var audit = auditCrossOriginIsolationLab();

    function readParams() {
      var params = {};
      controls.forEach(function (control) {
        params[control.getAttribute("data-param")] = control.value;
      });
      return params;
    }

    function render() {
      var result = evaluate(readParams());
      setText(root, "[data-value='deployment']", result.deployment.label);
      setText(root, "[data-value='resources']", result.resourceSet.label);
      setText(root, "[data-metric='isolated']", result.summary.crossOriginIsolated ? "yes" : "no");
      setText(root, "[data-metric='loaded']", String(result.summary.loaded));
      setText(root, "[data-metric='blocked']", String(result.summary.blocked));
      setText(root, "[data-metric='reported']", String(result.summary.reported));
      setText(root, "[data-metric='stripped']", String(result.summary.stripped));
      setText(root, "[data-metric='audit']", audit.ok ? "passes" : "fails");
      setText(root, "[data-cross-origin-isolation-note]", result.isolation.reason + ". " + (result.summary.blocked ? "Some dependencies are blocked." : "No enforced dependency block in this run."));
      draw(canvas, result);
    }

    controls.forEach(function (control) {
      control.addEventListener("input", render);
      control.addEventListener("change", render);
    });
    render();
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-cross-origin-isolation-lab]")).forEach(initLab);
  }

  var API = {
    evaluate: evaluate,
    auditCrossOriginIsolationLab: auditCrossOriginIsolationLab,
    resourceCheck: resourceCheck,
    isolationState: isolationState,
    deployments: DEPLOYMENTS,
    resourceSets: RESOURCE_SETS
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.CrossOriginIsolationLab = API;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
