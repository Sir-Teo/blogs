---
layout: post
title: "The Isolation Boundary Needs Consent"
description: "Cross-origin isolation is not one magic header. COOP isolates the opener relationship, COEP sets an embedder contract, and CORP or CORS lets resources consent to being loaded."
date: 2026-06-18 05:12:00 -0400
categories: software-engineering
tags: [cross-origin-isolation, coop, coep, corp, browser-security, web-security, http, software-engineering]
excerpt: "A page becomes cross-origin isolated only when the opener boundary and the embedder boundary both line up. The hard part is not the header pair; it is the dependency audit."
---

Cross-origin isolation is easy to write down and hard to ship:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

That looks like one switch. It is not. It is two contracts plus a dependency
audit.

`Cross-Origin-Opener-Policy` asks whether this top-level document should share
an opener-connected browsing context group with cross-origin windows.
`Cross-Origin-Embedder-Policy` asks whether this document is allowed to load
cross-origin resources that did not explicitly opt in. CORP is one way a
resource owner gives that opt-in.

The useful mental model is:

```text
COOP: who can share my opener/window group?
COEP: may I embed resources that did not consent?
CORP/CORS: did this particular resource consent?
crossOriginIsolated: did the browser grant the resulting capability?
```

That last line is why this is worth the trouble. The HTML Standard defines
`self.crossOriginIsolated` as the global's cross-origin isolated capability,
and says the value depends on the COOP and COEP response headers and the
`cross-origin-isolated` feature.[^html-cross-origin-isolated]

## The Header Pair Is Asymmetric

COOP is about top-level browsing contexts. In the HTML Standard, an opener
policy value can force a newly navigated document into a new top-level browsing
context group. `same-origin` also makes cross-origin auxiliary contexts appear
closed to the opener unless they are same-origin and have a matching policy.[^html-coop]

The special value authors actually get for isolation is not directly settable:

```text
same-origin-plus-COEP
```

It results from combining:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

or:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

The spec says `same-origin-plus-COEP` comes from `COOP: same-origin` together
with a COEP value compatible with cross-origin isolation.[^html-coop-plus-coep]
That COEP-compatible set is `require-corp` or `credentialless`.[^html-coep]

This is the first deployment trap:

```text
COOP only  -> opener relationship changes, but no isolated capability
COEP only  -> subresource contract applies, but no isolated capability
COOP+COEP  -> isolated group and API capability, assuming the feature is allowed
```

The second trap is parsing. COEP is a Structured Field token. The HTML processing
model defaults to `unsafe-none` when a header cannot be parsed as a token,
including accidental combined lists such as `require-corp, require-corp`.[^html-coep-headers]

With security headers, duplicate emission is not harmless housekeeping.

## COEP Makes Dependencies Prove Themselves

COEP has three values:

| COEP value | Effect |
| --- | --- |
| `unsafe-none` | Cross-origin resources can be fetched without explicit permission through CORS or CORP. |
| `require-corp` | Cross-origin resources need explicit permission through CORS or CORP. |
| `credentialless` | Cross-origin no-CORS resources are fetched without credentials; other credentialed requests still need explicit permission. |

That table is mostly HTML's definition in operational clothing.[^html-coep]

`require-corp` is strict. If your page has a third-party image, classic script,
iframe, worker, or opaque no-CORS fetch that does not opt in, the browser can
block it. For iframes and dedicated workers there is another inheritance rule:
when the parent has a COEP value compatible with cross-origin isolation, the
child context's policy also has to be compatible, or the navigation/worker
initialization fails.[^html-coep-inheritance]

`credentialless` is a different bargain. For cross-origin no-CORS subresources,
the browser omits credentials; in exchange, an explicit CORP header is not
required. That can rescue static public assets from a CDN you do not control.
It does not rescue credentialed CORS API calls, and it does not make iframe
children inherit COEP.

## CORP Is The Resource Owner's Sentence

CORP lives on the response being embedded:

```http
Cross-Origin-Resource-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
Cross-Origin-Resource-Policy: cross-origin
```

Fetch's cross-origin resource policy check reads that header and applies the
resource owner's declared boundary. If the policy is `same-origin`, the response
is allowed only to a same-origin requester. If it is `same-site`, the requester
has to be same-site, with a secure-transport caveat for HTTPS responses. If it
is `cross-origin`, the resource is loadable across origins.[^fetch-corp]

The important inversion:

```text
COEP is the embedder saying "I will not load unconsented resources."
CORP is the resource saying "Here is who may embed me."
```

That means CORP can protect a resource even when the embedding page did not set
COEP. A bank logo served with `Cross-Origin-Resource-Policy: same-origin` is not
silently available as an opaque cross-origin image to arbitrary pages in the
model below.

## Lab: Which Dependency Breaks Isolation?

The lab below models a top-level page, a small dependency list, an optional
cross-origin popup, and the COOP/COEP/CORP checks that decide whether the page
gets the isolated capability and which dependencies load.

The default run is deliberately painful: **COOP + require-corp** on a
marketing-style page with a hero image, analytics script, ad iframe, and
identity popup. The executable model gives:

| Default metric | Value |
| --- | ---: |
| `crossOriginIsolated` | yes |
| Loaded resources | 1 |
| Blocked resources | 3 |
| Reports | 0 |
| Credential-stripped requests | 0 |
| Audit | passes |

The page gets the isolated capability, but most of the page does not load. That
is not a contradiction. Isolation is not a compatibility promise; it is an
enforced boundary.

Try **report-only rollout** with the same dependency set. Nothing is blocked,
but the lab records reports. Try **COOP + credentialless** with
**credentialless CDN**. Public no-CORS image/script requests load with credentials
stripped, while a credentialed private API still fails because it did not opt in
with CORS or CORP.

<style>
  .coi-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    max-width: 100%;
    overflow: hidden;
    padding: 1rem;
  }
  .coi-lab *,
  .coi-lab *::before,
  .coi-lab *::after {
    box-sizing: border-box;
  }
  .coi-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    margin-bottom: 1rem;
  }
  .coi-lab label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }
  .coi-lab select {
    accent-color: #0f766e;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    margin: 0;
    max-width: 100%;
    min-width: 0;
    padding: 0.35rem 0.45rem;
    width: 100%;
  }
  .coi-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .coi-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(102px, 1fr));
    margin: 0 0 1rem;
  }
  .coi-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9f0;
    border-radius: 7px;
    padding: 0.55rem 0.65rem;
  }
  .coi-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 760;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .coi-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .coi-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    max-width: 100%;
  }
  .coi-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }
  @media (max-width: 640px) {
    .coi-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="coi-lab" data-cross-origin-isolation-lab>
  <div class="coi-lab__controls">
    <label>
      Deployment: <output data-value="deployment">COOP + require-corp</output>
      <select data-param="deployment" aria-label="Cross-origin isolation deployment">
        <option value="openWeb">Open web defaults</option>
        <option value="coopOnly">COOP only</option>
        <option value="coepOnly">COEP only</option>
        <option value="requireCorp" selected>COOP + require-corp</option>
        <option value="credentialless">COOP + credentialless</option>
        <option value="reportOnly">Report-only rollout</option>
        <option value="permissionBlocked">Permission blocks API</option>
        <option value="duplicateCoep">Duplicate COEP typo</option>
      </select>
    </label>
    <label>
      Dependencies: <output data-value="resources">marketing page</output>
      <select data-param="resources" aria-label="Dependency set">
        <option value="cleanWasm">Threaded wasm app</option>
        <option value="thirdPartyPage" selected>Marketing page</option>
        <option value="credentiallessCdn">Credentialless CDN</option>
        <option value="sameSiteAssets">Same-site asset host</option>
        <option value="defensiveCorp">Resource owner refuses</option>
      </select>
    </label>
  </div>
  <div class="coi-lab__metrics">
    <div class="coi-lab__metric"><span>isolated</span><strong data-metric="isolated">yes</strong></div>
    <div class="coi-lab__metric"><span>loaded</span><strong data-metric="loaded">1</strong></div>
    <div class="coi-lab__metric"><span>blocked</span><strong data-metric="blocked">3</strong></div>
    <div class="coi-lab__metric"><span>reports</span><strong data-metric="reported">0</strong></div>
    <div class="coi-lab__metric"><span>stripped</span><strong data-metric="stripped">0</strong></div>
    <div class="coi-lab__metric"><span>audit</span><strong data-metric="audit">passes</strong></div>
  </div>
  <canvas data-canvas width="980" height="680" aria-label="Cross-origin isolation lab showing COOP, COEP, CORP, resource blocking, report-only rollout, and SharedArrayBuffer availability"></canvas>
  <p class="coi-lab__note" data-cross-origin-isolation-note>
    crossOriginIsolated is true. Some dependencies are blocked.
  </p>
</div>

<script defer src="{{ '/assets/js/cross-origin-isolation-lab.js?v=20260618c' | relative_url }}"></script>

## Reproducing The Model

The simulator exports a Node-testable API:

```bash
node - <<'NODE'
const lab = require("./assets/js/cross-origin-isolation-lab.js");
const EXPECTED_CRITICAL_CHECKS = 17;
const EXPECTED_CASES = 40;
const EXPECTED_CHECKS = 137;
const EXPECTED_SUMMARY_KEYS = [
  "total",
  "loaded",
  "blocked",
  "reported",
  "stripped",
  "openerSevered",
  "groupIsolated",
  "crossOriginIsolated",
  "sharedMemory"
];
const EXPECTED_DEFAULT_SUMMARY_SHAPE = [
  "total:4",
  "loaded:1",
  "blocked:3",
  "reported:0",
  "stripped:0",
  "openerSevered:1",
  "groupIsolated:1",
  "crossOriginIsolated:1",
  "sharedMemory:1"
];
const EXPECTED_CREDENTIALLESS_SUMMARY_SHAPE = [
  "total:4",
  "loaded:3",
  "blocked:1",
  "reported:0",
  "stripped:2",
  "openerSevered:0",
  "groupIsolated:1",
  "crossOriginIsolated:1",
  "sharedMemory:1"
];
const EXPECTED_TOTALS = {
  criticalChecks: EXPECTED_CRITICAL_CHECKS,
  rows: EXPECTED_CASES,
  checked: EXPECTED_CHECKS,
  passedChecks: EXPECTED_CHECKS,
  totalChecks: EXPECTED_CHECKS
};
const EXPECTED_BY_DEPLOYMENT_SHAPE = [
  "coepOnly:5/15:10/8/0/0:0/0/0/0",
  "coopOnly:5/15:16/2/0/0:1/0/0/0",
  "credentialless:5/15:14/4/0/7:1/5/5/5",
  "duplicateCoep:5/15:16/2/0/0:1/0/0/0",
  "openWeb:5/15:16/2/0/0:0/0/0/0",
  "permissionBlocked:5/15:10/8/0/0:1/5/0/0",
  "reportOnly:5/15:16/2/9/0:0/0/0/0",
  "requireCorp:5/15:10/8/0/0:1/5/5/5"
];
const EXPECTED_BY_RESOURCE_SHAPE = [
  "cleanWasm:8/24:32/0/0/0:0/3/2/2",
  "credentiallessCdn:8/24:22/10/3/2:0/3/2/2",
  "defensiveCorp:8/24:16/8/1/1:0/3/2/2",
  "sameSiteAssets:8/24:16/8/1/2:0/3/2/2",
  "thirdPartyPage:8/24:22/10/4/2:5/3/2/2"
];
const EXPECTED_CRITICAL_SHAPE = [
  "COEP alone does not isolate:1/1",
  "COOP alone does not isolate:1/1",
  "COOP plus credentialless isolates clean app:1/1",
  "COOP plus require-corp isolates clean app:1/1",
  "COOP same-origin severs cross-origin popup opener:1/1",
  "CORP same-origin protects resource even without COEP:1/1",
  "credentialless still blocks credentialed CORS without permission:1/1",
  "credentialless strips no-CORS credentials:1/1",
  "invalid combined COEP fails open:1/1",
  "open CORP workload loads non-protected resources:1/1",
  "open defaults keep popup opener:1/1",
  "permission policy can deny gated APIs:1/1",
  "report-only does not block resources:1/1",
  "report-only records violations:1/1",
  "require-corp blocks missing CORP no-CORS resources:1/1",
  "require-corp blocks unopted third-party resources:1/1",
  "same-site CORP secure mismatch blocks one resource:1/1"
];

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function summaryShape(summary) {
  return EXPECTED_SUMMARY_KEYS.map((key) => `${key}:${summary[key]}`);
}

function groupShape(row, key) {
  return [
    row[key],
    `${row.cases}/${row.totalChecks}`,
    `${row.loaded}/${row.blocked}/${row.reported}/${row.stripped}`,
    `${row.openerSevered}/${row.groupIsolated}/` +
      `${row.crossOriginIsolated}/${row.sharedMemory}`
  ].join(":");
}

const defaultSummary = lab.evaluate({}).summary;
const credentiallessSummary = lab.evaluate({
  deployment: "credentialless",
  resources: "credentiallessCdn"
}).summary;
console.log(defaultSummary);
console.log(credentiallessSummary);
const audit = lab.auditCrossOriginIsolationLab();
console.table(audit.byDeployment);
console.table(audit.byResourceSet);
console.table(audit.criticalChecks);
const auditShape = {
  defaultSummary: summaryShape(defaultSummary),
  credentiallessSummary: summaryShape(credentiallessSummary),
  totals: {
    criticalChecks: audit.criticalTotal,
    rows: audit.cases.length,
    checked: audit.checked,
    passedChecks: audit.passedChecks,
    totalChecks: audit.totalChecks
  },
  byDeployment: audit.byDeployment.map((row) => groupShape(row, "deployment")),
  byResourceSet: audit.byResourceSet.map((row) => groupShape(row, "resources")),
  criticalChecks: audit.criticalChecks.map(
    (row) => `${row.check}:${row.passedChecks}/${row.totalChecks}`
  ).sort()
};
const shapeErrors = [
  sameJson(auditShape.defaultSummary, EXPECTED_DEFAULT_SUMMARY_SHAPE)
    ? null
    : "defaultSummary",
  sameJson(auditShape.credentiallessSummary, EXPECTED_CREDENTIALLESS_SUMMARY_SHAPE)
    ? null
    : "credentiallessSummary",
  sameJson(auditShape.totals, EXPECTED_TOTALS) ? null : "totals",
  sameJson(auditShape.byDeployment, EXPECTED_BY_DEPLOYMENT_SHAPE)
    ? null
    : "byDeployment",
  sameJson(auditShape.byResourceSet, EXPECTED_BY_RESOURCE_SHAPE)
    ? null
    : "byResourceSet",
  sameJson(auditShape.criticalChecks, EXPECTED_CRITICAL_SHAPE)
    ? null
    : "criticalChecks"
].filter(Boolean);
if (shapeErrors.length) {
  throw new Error(
    `audit grid drifted in ${shapeErrors.join(", ")}:\n` +
    JSON.stringify(auditShape, null, 2)
  );
}
const failedCriticalChecks = audit.criticalChecks.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const failedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (!audit.ok || failedCriticalChecks.length || failedCases.length || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    errors: audit.errors,
    failedCriticalChecks,
    failedCases,
    shapeErrors,
    auditShape
  }, null, 2));
}
console.log(`${audit.passedChecks}/${audit.totalChecks} checks passed`);
NODE
```

Default summary:

```json
{
  "total": 4,
  "loaded": 1,
  "blocked": 3,
  "reported": 0,
  "stripped": 0,
  "openerSevered": 1,
  "groupIsolated": 1,
  "crossOriginIsolated": 1,
  "sharedMemory": 1
}
```

Credentialless CDN summary:

```json
{
  "total": 4,
  "loaded": 3,
  "blocked": 1,
  "reported": 0,
  "stripped": 2,
  "openerSevered": 0,
  "groupIsolated": 1,
  "crossOriginIsolated": 1,
  "sharedMemory": 1
}
```

The audit currently runs 17 named critical checks plus 120 generated invariant
checks over a 40-row deployment/resource grid (137 checks total).
Among the invariants:

- COOP alone and COEP alone do not set `crossOriginIsolated`;
- `COOP: same-origin` plus `COEP: require-corp` or `credentialless` can set it;
- permission policy can still deny the API capability;
- invalid combined COEP header values fail open to `unsafe-none`;
- report-only rollout records would-block events without enforcing them;
- `require-corp` blocks unopted cross-origin subresources;
- `credentialless` strips credentials from cross-origin no-CORS subresources;
- credentialed private CORS requests still need explicit permission;
- `CORP: same-origin` can protect a resource even without COEP on the embedder.

## What I Would Put In A Review

The review is not "set COOP and COEP." It is a dependency inventory:

| Question | Evidence |
| --- | --- |
| Which page needs isolated APIs? | A concrete use of `SharedArrayBuffer`, high-precision timing, memory measurement, or another gated API. |
| Is the top-level document isolated? | `COOP: same-origin`, compatible COEP, secure context, and `self.crossOriginIsolated === true`. |
| Which popups need `postMessage` back to the opener? | OAuth, payments, support chat, and admin consoles are checked before enforcing COOP. |
| Which dependencies are opaque no-CORS loads? | Images, classic scripts, iframes, workers, and CDN assets are listed with their response headers. |
| Which resource owner opts in? | Cross-origin dependencies use CORS or an appropriate CORP value. |
| Is `credentialless` acceptable? | The dependency is public and should not receive cookies or other ambient credentials. |
| Are report-only headers deployed first? | COOP/COEP reports are collected before enforcement on a large or third-party-heavy page. |
| Are duplicate headers impossible? | CDN, app server, and framework middleware cannot combine COEP into an invalid list. |

Cross-origin isolation is not a badge you add to a document. It is a claim that
every resource sharing the address-space neighborhood either belongs there,
explicitly consented to be there, or arrives without credentials.

[^html-cross-origin-isolated]: WHATWG HTML, [`crossOriginIsolated`](https://html.spec.whatwg.org/multipage/webappapis.html#dom-crossoriginisolated). The getter returns the relevant settings object's cross-origin isolated capability, and the API description ties it to COOP, COEP, and the `cross-origin-isolated` feature.
[^html-coop]: WHATWG HTML, [Cross-origin opener policies](https://html.spec.whatwg.org/multipage/browsers.html#cross-origin-opener-policies).
[^html-coop-plus-coep]: WHATWG HTML, [`same-origin-plus-COEP`](https://html.spec.whatwg.org/multipage/browsers.html#cross-origin-opener-policies), the value resulting from `COOP: same-origin` plus a COEP value compatible with cross-origin isolation.
[^html-coep]: WHATWG HTML, [Cross-origin embedder policies](https://html.spec.whatwg.org/multipage/browsers.html#cross-origin-embedder-policies).
[^html-coep-headers]: WHATWG HTML, [COEP header parsing](https://html.spec.whatwg.org/multipage/browsers.html#cross-origin-embedder-policy-headers), including the default to `unsafe-none` for unparseable token lists.
[^html-coep-inheritance]: WHATWG HTML, [Embedder policy checks](https://html.spec.whatwg.org/multipage/browsers.html#embedder-policy-checks), including nested navigation and dedicated worker checks.
[^fetch-corp]: WHATWG Fetch, [Cross-origin resource policy check](https://fetch.spec.whatwg.org/#cross-origin-resource-policy-check).
