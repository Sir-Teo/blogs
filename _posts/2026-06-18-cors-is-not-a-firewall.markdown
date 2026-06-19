---
layout: post
title: "CORS Is Not a Firewall"
description: "Cross-Origin Resource Sharing is a browser response-sharing protocol. Preflight requests ask whether a script may send a shaped request; the final CORS check asks whether the script may read the response."
date: 2026-06-18 04:14:00 -0400
categories: software-engineering
tags: [cors, fetch, web-security, http, browser-security, preflight, same-origin-policy, software-engineering]
excerpt: "A CORS failure does not prove the server rejected the request. It often means the browser refused to expose the response to the script that asked."
---

The most common CORS debugging mistake is treating the browser console as if it
were a server access log.

```text
blocked by CORS policy
```

That sentence does not mean:

```text
the server was protected from the request
```

It usually means:

```text
the browser refused to share the response with this script
```

Those are different security stories. A firewall decides whether packets reach a
server. CORS decides whether a browser script from one origin may use a response
from another origin.

## Origin Is The Unit Of Browser Authority

RFC 6454 defines an origin as the browser's unit of authority. Roughly, normal
web origins are triples:

```text
scheme, host, port
```

`https://app.example` and `https://api.example` are different origins. So are
`https://app.example` and `http://app.example`. The serialized `Origin` request
header tells the server which browser security context caused a request.[^rfc6454-origin]

The same-origin policy is the default wall around script access. CORS is the
negotiated door in that wall. The Fetch Standard describes the CORS protocol as
a set of headers indicating whether a response can be shared cross-origin.[^fetch-cors]

That word matters: **shared**. A response can exist, carry a 200 status, include
a JSON body, and still not be shared with the calling script.

## Preflight Is A Dry Run, Not The Whole Gate

Some cross-origin requests are simple enough to send directly. Others need a
preflight:

```http
OPTIONS /orders
Origin: https://app.example
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type,x-client-trace
```

The Fetch Standard says a CORS-preflight request uses `OPTIONS` and includes
`Access-Control-Request-Method`; it can also include
`Access-Control-Request-Headers` for the future request.[^fetch-requests] The
server answers with the methods and headers it is willing to let browser scripts
use for this cross-origin shape.

```http
Access-Control-Allow-Origin: https://app.example
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE
Access-Control-Allow-Headers: content-type, authorization, x-client-trace
Access-Control-Max-Age: 12
```

If that dry run succeeds, the browser can send the actual request. But the
actual response still has its own CORS check. The preflight cache did not grant
the script a permanent read capability. It only avoided repeating the same
method/header negotiation for a while.

## Credentials Make Wildcards Stop Being Friendly

This is the rule that causes the loudest production incidents:

```text
credentials: "include"
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true
```

That is not a valid way to share a credentialed response. In the Fetch CORS
check, `*` succeeds only when the request's credentials mode is not `include`;
credentialed sharing needs the literal serialized origin plus
`Access-Control-Allow-Credentials: true`.[^fetch-credentials]

The preflight request itself excludes credentials, but the preflight response
still needs to indicate whether the later request can include them.[^fetch-responses]
This is why a server cannot reason from "the OPTIONS request had no cookie" to
"credentials do not matter for this endpoint."

There is another easy trap: wildcard method/header allowances are not universal
under credentials, and `Authorization` is special in the preflight cache match.
The Fetch preflight algorithm checks method and header names, and its cache
matching says a wildcard header entry does not match CORS non-wildcard request
header names.[^fetch-preflight-cache]

That is a deliberate footgun guard. If a browser script is sending
`Authorization`, write that name down.

## Lab: The Request Was Sent, But The Response Was Hidden

The lab below simulates one browser page at `https://app.example` calling
`https://api.example/orders`. It is not a network stack. It isolates the pieces
that are easy to confuse:

```text
request shape       method, credentials mode, script-set headers
preflight decision  whether OPTIONS is needed, sent, or cached
server policy       CORS response headers
browser exposure    whether the script receives the response
```

The default case is a credentialed JSON request with an extra tracing header.
That request needs a preflight because `application/json` and `X-Client-Trace`
are not safelisted request headers. The server policy echoes the app origin,
allows credentials, lists both headers, and sets `Access-Control-Max-Age: 12`.

With six repeated calls spaced three seconds apart, the executable model gives:

| Metric | Value |
| --- | ---: |
| Attempts | 6 |
| OPTIONS preflights | 2 |
| Preflight-cache hits | 4 |
| Browser-exposed responses | 6 |
| Blocked before actual request | 0 |
| HTTP 200 responses hidden by CORS | 0 |

Switch the server policy to **wildcard no cookies** while leaving the request
credentialed. The browser blocks all six attempts before the actual request is
sent, because the preflight response fails the credentialed CORS check. Switch
to **wrong origin** on a simple public GET. The request can reach the server,
but the browser hides the 200 response because `Access-Control-Allow-Origin`
does not match the caller.

<style>
  .cors-lab {
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
  .cors-lab *,
  .cors-lab *::before,
  .cors-lab *::after {
    box-sizing: border-box;
  }
  .cors-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
    margin-bottom: 1rem;
  }
  .cors-lab label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }
  .cors-lab input,
  .cors-lab select {
    accent-color: #2563eb;
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
  .cors-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .cors-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
    margin: 0 0 1rem;
  }
  .cors-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9f0;
    border-radius: 7px;
    padding: 0.55rem 0.65rem;
  }
  .cors-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 760;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .cors-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .cors-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    max-width: 100%;
  }
  .cors-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }
  @media (max-width: 640px) {
    .cors-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="cors-lab" data-cors-preflight-lab>
  <div class="cors-lab__controls">
    <label>
      Request: <output data-value="request">credentialed JSON</output>
      <select data-param="request" aria-label="CORS request shape">
        <option value="publicGet">Public GET</option>
        <option value="jsonPost">JSON POST</option>
        <option value="credentialedJson" selected>Credentialed JSON</option>
        <option value="authPatch">Authorization PATCH</option>
      </select>
    </label>
    <label>
      Server policy: <output data-value="policy">reflect + credentials</output>
      <select data-param="policy" aria-label="CORS server policy">
        <option value="reflectCredentials" selected>Reflect + credentials</option>
        <option value="wildcardNoCookies">Wildcard no cookies</option>
        <option value="missingAuthHeader">Missing auth header</option>
        <option value="wrongOrigin">Wrong origin</option>
        <option value="rolloutChange">Policy changes mid-run</option>
      </select>
    </label>
    <label>
      Access-Control-Max-Age: <output data-value="maxAge">12s</output>
      <input type="range" min="0" max="60" step="1" value="12" data-param="maxAge">
    </label>
    <label>
      Call spacing: <output data-value="gap">3s</output>
      <input type="range" min="1" max="12" step="0.5" value="3" data-param="gap">
    </label>
  </div>
  <div class="cors-lab__metrics">
    <div class="cors-lab__metric"><span>attempts</span><strong data-metric="attempts">0</strong></div>
    <div class="cors-lab__metric"><span>OPTIONS</span><strong data-metric="preflights">0</strong></div>
    <div class="cors-lab__metric"><span>cache hits</span><strong data-metric="cacheHits">0</strong></div>
    <div class="cors-lab__metric"><span>exposed</span><strong data-metric="exposed">0</strong></div>
    <div class="cors-lab__metric"><span>blocked</span><strong data-metric="blocked">0</strong></div>
    <div class="cors-lab__metric"><span>audit</span><strong data-metric="audit">passes</strong></div>
  </div>
  <canvas data-canvas width="980" height="700" aria-label="CORS preflight simulator showing browser preflight requests, cache hits, and response exposure decisions"></canvas>
  <p class="cors-lab__note" data-cors-note>
    Credentialed JSON needs preflight. The server reflects the app origin and allows credentials.
  </p>
</div>

<script defer src="{{ '/assets/js/cors-preflight-lab.js?v=20260618c' | relative_url }}"></script>

The browser check has two moments.

First, preflight can block the actual request:

```text
OPTIONS succeeds?       no  -> actual request is not sent
method/header allowed?  no  -> actual request is not sent
```

Second, the actual response can be hidden:

```text
actual HTTP response arrives
CORS check fails
script gets a network-style failure, not the body
```

That second case is where "CORS is not a firewall" becomes operational. The
server already did the work. If the endpoint mutates state, CORS did not undo
the mutation.

## Reproducing The Numbers

The artifact is a plain JavaScript module:

```bash
node - <<'NODE'
const lab = require("./assets/js/cors-preflight-lab.js");
const EXPECTED_REQUESTS = [
  "publicGet",
  "jsonPost",
  "credentialedJson",
  "authPatch"
];
const EXPECTED_POLICIES = [
  "reflectCredentials",
  "wildcardNoCookies",
  "missingAuthHeader",
  "wrongOrigin",
  "rolloutChange"
];
const EXPECTED_MAX_AGES = [0, 5, 12, 40];
const EXPECTED_CHECK_SHAPE = [
  { name: "six-attempts-expected", passed: true },
  { name: "simple-requests-skip-preflight", passed: true },
  { name: "outcomes-partition-attempts", passed: true },
  { name: "cache-hits-only-for-preflighted-requests", passed: true },
  { name: "blocked-rows-hide-responses", passed: true },
  { name: "wildcard-hides-credentialed-responses", passed: true },
  { name: "authorization-requires-explicit-header", passed: true }
];
const EXPECTED_DEFAULT_SUMMARY = {
  attempts: 6,
  preflights: 2,
  cacheHits: 4,
  exposed: 6,
  blockedBefore: 0,
  blockedAfter: 0
};
const EXPECTED_BY_REQUEST = [
  "publicGet:20 cases/140 checks:0/0/96/0/24",
  "jsonPost:20 cases/140 checks:72/48/96/24/0",
  "credentialedJson:20 cases/140 checks:98/22/42/78/0",
  "authPatch:20 cases/140 checks:98/22/42/78/0"
];
const EXPECTED_BY_POLICY = [
  "reflectCredentials:16 cases/112 checks:96/0/0",
  "wildcardNoCookies:16 cases/112 checks:48/48/0",
  "missingAuthHeader:16 cases/112 checks:48/48/0",
  "wrongOrigin:16 cases/112 checks:0/72/24",
  "rolloutChange:16 cases/112 checks:84/12/0"
];
const EXPECTED_BY_MAX_AGE = [
  "0:20 cases/140 checks:90/0/68/46/6",
  "5:20 cases/140 checks:68/22/68/46/6",
  "12:20 cases/140 checks:60/30/68/46/6",
  "40:20 cases/140 checks:50/40/72/42/6"
];
const EXPECTED_CASE_KEYS = EXPECTED_REQUESTS.flatMap((request) =>
  EXPECTED_POLICIES.flatMap((policy) =>
    EXPECTED_MAX_AGES.map((maxAge) => `${request}/${policy}/${maxAge}`)
  )
);
const EXPECTED_CASES = EXPECTED_CASE_KEYS.length;
const EXPECTED_CHECKS = EXPECTED_CASES * EXPECTED_CHECK_SHAPE.length;
const EXPECTED_TOTALS = {
  rows: EXPECTED_CASES,
  requests: EXPECTED_REQUESTS.length,
  policies: EXPECTED_POLICIES.length,
  maxAges: EXPECTED_MAX_AGES.length,
  passed: EXPECTED_CASES,
  total: EXPECTED_CASES,
  checked: EXPECTED_CASES,
  passedChecks: EXPECTED_CHECKS,
  totalChecks: EXPECTED_CHECKS
};

function sameList(left, right) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameRecord(left, right) {
  return sameList(Object.keys(right), Object.keys(left)) &&
    Object.keys(right).every((key) => left[key] === right[key]);
}

function byMaxAge(cases) {
  const groups = new Map();
  for (const row of cases) {
    if (!groups.has(row.maxAge)) {
      groups.set(row.maxAge, {
        blockedAfter: 0,
        blockedBefore: 0,
        cacheHits: 0,
        cases: 0,
        exposed: 0,
        maxAge: row.maxAge,
        passed: 0,
        passedChecks: 0,
        preflights: 0,
        totalChecks: 0
      });
    }
    const group = groups.get(row.maxAge);
    group.blockedAfter += row.blockedAfter;
    group.blockedBefore += row.blockedBefore;
    group.cacheHits += row.cacheHits;
    group.cases += 1;
    group.exposed += row.exposed;
    if (row.passed) group.passed += 1;
    group.passedChecks += row.passedChecks;
    group.preflights += row.preflights;
    group.totalChecks += row.totalChecks;
  }
  return Array.from(groups.values()).sort((left, right) => left.maxAge - right.maxAge);
}

function auditShape(audit) {
  const maxAgeGroups = byMaxAge(audit.cases);
  return {
    totals: {
      rows: audit.cases.length,
      requests: audit.byRequest.length,
      policies: audit.byPolicy.length,
      maxAges: maxAgeGroups.length,
      passed: audit.passed,
      total: audit.total,
      checked: audit.checked,
      passedChecks: audit.passedChecks,
      totalChecks: audit.totalChecks
    },
    cases: audit.cases.map((row) => `${row.request}/${row.policy}/${row.maxAge}`),
    checksByCase: audit.cases.map((row) =>
      row.checks.map((check) => ({
        name: check.name,
        passed: check.passed
      }))
    ),
    byRequest: audit.byRequest.map(
      (row) => `${row.request}:${row.cases} cases/${row.totalChecks} checks:` +
        `${row.preflights}/${row.cacheHits}/${row.exposed}/` +
        `${row.blockedBefore}/${row.blockedAfter}`
    ),
    byPolicy: audit.byPolicy.map(
      (row) => `${row.policy}:${row.cases} cases/${row.totalChecks} checks:` +
        `${row.exposed}/${row.blockedBefore}/${row.blockedAfter}`
    ),
    byMaxAge: maxAgeGroups.map(
      (row) => `${row.maxAge}:${row.cases} cases/${row.totalChecks} checks:` +
        `${row.preflights}/${row.cacheHits}/${row.exposed}/` +
        `${row.blockedBefore}/${row.blockedAfter}`
    )
  };
}

const result = lab.simulate({});
const audit = lab.auditCorsPreflightLab();
const shape = auditShape(audit);
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const shapeErrors = [
  sameRecord(result.summary, EXPECTED_DEFAULT_SUMMARY) ? null : "defaultSummary",
  sameJson(shape.totals, EXPECTED_TOTALS) ? null : "totals",
  sameList(shape.cases, EXPECTED_CASE_KEYS) ? null : "cases",
  shape.checksByCase.every((checks) => sameJson(checks, EXPECTED_CHECK_SHAPE))
    ? null
    : "checksByCase",
  sameList(shape.byRequest, EXPECTED_BY_REQUEST) ? null : "byRequest",
  sameList(shape.byPolicy, EXPECTED_BY_POLICY) ? null : "byPolicy",
  sameList(shape.byMaxAge, EXPECTED_BY_MAX_AGE) ? null : "byMaxAge"
].filter(Boolean);

console.log(result.summary);
console.table(audit.byRequest.map((row) => ({
  request: row.request,
  cases: row.cases,
  passed: row.passed,
  preflights: row.preflights,
  cacheHits: row.cacheHits,
  exposed: row.exposed,
  blockedBefore: row.blockedBefore,
  blockedAfter: row.blockedAfter,
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
console.table(audit.byPolicy);
console.table(byMaxAge(audit.cases));
const summary =
  `${audit.passed}/${audit.total} policy/cache cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  shapeErrors.length ||
  failed.length ||
  !audit.ok ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(JSON.stringify({
    summary,
    shapeErrors,
    defaultSummary: result.summary,
    shape,
    failed,
    failures: audit.failures,
    passed: audit.passed,
    total: audit.total,
    passedChecks: audit.passedChecks,
    totalChecks: audit.totalChecks
  }, null, 2));
}
console.log(summary);
NODE
```

Default output:

```json
{
  "attempts": 6,
  "preflights": 2,
  "cacheHits": 4,
  "exposed": 6,
  "blockedBefore": 0,
  "blockedAfter": 0
}
```

The audit currently checks 80 request/policy/max-age combinations and 560 named
invariants. Among them:

- simple public GETs do not generate preflights;
- outcomes partition attempts into exposed, blocked-before-send, and hidden-200;
- wildcard origins do not expose credentialed responses;
- `Authorization` is not satisfied by wildcard `Access-Control-Allow-Headers`;
- every generated run has the expected six browser attempts.

The model intentionally implements a small subset of Fetch. It does not model
redirects, service workers, private-network access, browser-specific maximum
`Access-Control-Max-Age` caps, third-party cookie policy, SameSite, CSP,
CORP/COEP, or opaque `no-cors` responses. Those omissions are not loopholes in
real browsers. They are boundaries of this teaching artifact.

## The Debugging Card

When a cross-origin request fails, I want the incident ticket to separate these
rows:

| Question | Evidence |
| --- | --- |
| What is the caller origin? | Serialized `Origin` header, not a mental model of domains |
| Was preflight needed? | Method, content type, script-set request headers |
| Did OPTIONS succeed? | Status, `ACAO`, `ACAM`, `ACAH`, `ACAC`, `ACMA` |
| Was the actual request sent? | Server access log for the non-OPTIONS method |
| Was the response exposed? | Actual response `ACAO` and, for credentials, `ACAC: true` |
| Was state changed anyway? | Application logs, database writes, queue publishes |

That last row is the one CORS error messages tend to hide. A browser read
failure is not proof of a server write failure.

## Evidence, Interpretation, Speculation

**Evidence.** The Fetch Standard defines the CORS request/response headers,
preflight behavior, credential rules, preflight cache, and CORS check. RFC 6454
defines web origins and the `Origin` header field.

**Interpretation.** The clean operational model is to treat CORS as a browser
response-sharing protocol. Preflight decides whether a shaped request may be
sent by script; the final CORS check decides whether the response may be exposed
to that script.

**Speculation.** Many CORS incidents persist because teams debug them at the
wrong boundary. Backend engineers look for missing routes or auth failures;
frontend engineers paste permissive headers until the console quiets down. A
better shared language is "Which browser check failed, and did the server still
perform the side effect?"

## Final Shape

CORS is not a server firewall.

It is a browser promise about which cross-origin responses a script may use.
That promise is valuable. It is also narrower than it looks in the console.

If your endpoint must be protected from unwanted state changes, use
authentication, authorization, CSRF defenses where applicable, idempotency keys,
and application-side policy. CORS can decide whether the caller gets to read the
answer. It cannot make the server unhear the question.

[^rfc6454-origin]: Adam Barth, [RFC 6454, "The Web Origin Concept"](https://datatracker.ietf.org/doc/html/rfc6454), December 2011. The document defines origin as a user-agent authority boundary, gives serialization rules for scheme/host/port origins, and defines the HTTP `Origin` header.

[^fetch-cors]: WHATWG, [Fetch Standard](https://fetch.spec.whatwg.org/), Section 3.3.1, "CORS protocol." As consulted on June 18, 2026, it describes CORS as headers indicating whether a response can be shared cross-origin.

[^fetch-requests]: WHATWG Fetch Standard, Section 3.3.2, "HTTP requests." It defines a CORS request as one with an `Origin` header and a CORS-preflight request as an `OPTIONS` request carrying `Access-Control-Request-Method` and, when needed, `Access-Control-Request-Headers`.

[^fetch-responses]: WHATWG Fetch Standard, Section 3.3.3, "HTTP responses." It defines `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and `Access-Control-Max-Age`; it also states the default max-age value of 5 seconds.

[^fetch-credentials]: WHATWG Fetch Standard, Sections 3.3.5 and 4.10. The credential table and CORS check specify that `Access-Control-Allow-Origin: *` does not share a response when the request credentials mode is `include`; a matching origin and `Access-Control-Allow-Credentials: true` are required.

[^fetch-preflight-cache]: WHATWG Fetch Standard, Sections 4.8 and 4.9. The preflight algorithm validates requested methods and headers, applies a user-agent max-age cap, populates the CORS-preflight cache, and defines cache entries keyed by origin, URL, credentials, method, and header name.
