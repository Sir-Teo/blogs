---
layout: post
title: "The Request Carries Its Context"
description: "Fetch Metadata headers let a server classify the browser shape of a request before application code spends work or trusts ambient cookies."
date: 2026-06-18 05:03:00 -0400
categories: software-engineering
tags: [fetch-metadata, sec-fetch-site, csrf, web-security, browser-security, http, software-engineering]
excerpt: "Fetch Metadata gives the server a few browser-supplied facts about how a request was made. That is enough to reject many hostile request shapes early."
---

The server usually learns too little, too late.

By the time a state-changing endpoint sees a request, the browser may already
have attached cookies, followed redirects, selected a request mode, and decided
where the response will be used. Application code sees `POST /transfer` and a
session cookie. It may not see the thing that made the request look strange:

```text
this was a cross-site top-level form navigation
this was a cross-site image embed
this was a same-site request from a sibling subdomain
this was an address-bar navigation
```

Fetch Metadata is a small attempt to carry that missing context across the
network boundary. The W3C draft defines request headers that give servers enough
information to make early decisions based on how a request was made and where it
will be used.[^fetch-metadata-intro]

That makes it a useful defensive layer for CSRF-shaped and cross-site data-leak
attacks. It also makes it easy to overclaim. These headers are not identity, not
intent, and not a replacement for tokens on unsafe actions. They are a request
classifier.

## Four Headers, One Classifier

Fetch Metadata exposes four browser facts:

| Header | Server-visible question |
| --- | --- |
| `Sec-Fetch-Site` | What is the relationship between the initiator origin and the target origin? |
| `Sec-Fetch-Mode` | Was this a `navigate`, `cors`, `no-cors`, `same-origin`, or `websocket` request? |
| `Sec-Fetch-Dest` | Is the target going to be used as a document, image, script, worker, empty `fetch()` destination, and so on? |
| `Sec-Fetch-User` | Was this navigation triggered by user activation? |

The examples in the spec are the whole design in miniature. An image request can
arrive with:

```http
Sec-Fetch-Dest: image
Sec-Fetch-Mode: no-cors
Sec-Fetch-Site: cross-site
```

A user-clicked same-origin top-level document navigation can arrive with:

```http
Sec-Fetch-Dest: document
Sec-Fetch-Mode: navigate
Sec-Fetch-Site: same-origin
Sec-Fetch-User: ?1
```

Those are not different HTTP methods. They are different browser situations.
`Sec-Fetch-Dest` maps the empty Fetch destination to the explicit token
`empty`; top-level navigations use `document`; image loads use `image`.[^fetch-metadata-dest]
`Sec-Fetch-Mode` distinguishes `cors`, `navigate`, `no-cors`, `same-origin`,
and `websocket`.[^fetch-metadata-mode]

The sharpest header is `Sec-Fetch-Site`. Its values are `same-origin`,
`same-site`, `cross-site`, and `none`. The setting algorithm starts at
`same-origin`, switches to `none` for directly user-initiated navigation such as
address-bar or bookmark navigation, and otherwise walks the request's URL list;
a cross-site URL in the redirect chain can taint the final request as
`cross-site`.[^fetch-metadata-site][^fetch-metadata-redirects]

`Sec-Fetch-User` is narrower than people often remember. It is sent only for
navigation requests, and only when the value is true, serialized as a Structured
Field boolean such as `?1`.[^fetch-metadata-user]

The `Sec-` prefix matters operationally. The draft says these headers are
unmodifiable from JavaScript, which prevents a malicious page from simply
forging a nicer-looking request shape.[^fetch-metadata-sec]

## The Gate Belongs Before The App

The natural place to use Fetch Metadata is not deep in a controller. It is a
cheap precondition at the reverse proxy, CDN, edge worker, framework middleware,
or first application hop:

```js
function metadataGate(req) {
  const site = req.get("Sec-Fetch-Site");
  const mode = req.get("Sec-Fetch-Mode");
  const dest = req.get("Sec-Fetch-Dest");
  const user = req.get("Sec-Fetch-User");

  if (!site || !mode || !dest) return "block-or-route-to-legacy-exception";
  if (site === "same-origin") return "allow";
  if (site === "same-site") return "allow-but-still-check-unsafe-action-token";
  if (site === "none" && mode === "navigate" && dest === "document" && user === "?1") return "allow";
  if (site === "cross-site" && mode === "no-cors" && ["image", "style", "font", "script"].includes(dest)) return "allow-public-subresource";
  if (site === "cross-site" && mode === "navigate" && dest === "document" && user === "?1") return "allow-top-level-read";
  return "block";
}
```

This shape catches requests that should not have a plausible reason to exist:

```text
cross-site + no-cors + image    -> maybe a public image
cross-site + navigate + document + user -> maybe a top-level link
cross-site + navigate + document + POST -> suspicious state-changing form
cross-site + cors + empty       -> suspicious private API fetch
```

The gate is strongest when it is boring. Decide which endpoints are public
subresources, which endpoints are top-level documents, which endpoints are
browser-facing APIs, and which endpoints are non-browser integrations with their
own signatures. Then reject the shapes that do not fit.

## Why This Does Not Replace CSRF Tokens

`same-site` is the dangerous comfort word.

Same-site is not same-origin. A request from `https://promo.bank.example` to
`https://bank.example` can be same-site while still coming from a different
origin. If a sibling subdomain is delegated, compromised, or simply less
carefully reviewed, a metadata-only rule can let an unsafe request through.

That is why Fetch Metadata belongs next to a server-side proof for mutating
actions:

```text
metadata gate  -> does this browser request shape make sense here?
CSRF token     -> did this unsafe action come from a page we intentionally served?
signature      -> did this non-browser integration authenticate itself?
authorization  -> may this principal perform the action?
```

Missing headers are also a deployment decision, not a proof of attack. Old
browsers, bots, command-line clients, monitoring systems, and signed webhooks may
not look like browser traffic. The safe pattern is to separate browser-facing
endpoints from non-browser endpoints, give the latter explicit authentication,
and avoid silently treating "no metadata" as "probably fine."

If the response varies by these headers, caching has to know. The spec calls out
`Vary` for endpoints whose responses depend on Fetch Metadata values, for
example `Vary: Accept-Encoding, Sec-Fetch-Site`.[^fetch-metadata-vary]

## Lab: Does The Request Shape Belong Here?

The lab below is a small request-classifier model. It does not send real HTTP
requests and it does not claim to reproduce every browser edge case. It isolates
the decision table:

```text
Sec-Fetch-Site relationship
request mode and destination
user-activated top-level navigation
public subresource exceptions
legacy or non-browser callers
metadata-only defense versus metadata plus token
```

The default scenario is a cross-site form `POST` to `/transfer`, using a
metadata gate plus a CSRF token layer. The executable model gives:

| Default metric | Value |
| --- | ---: |
| Metadata present | yes |
| Would block by metadata | yes |
| Blocked | yes |
| Application reached | no |
| State changed | no |
| Audit | passes |

Switch **Defense** to **report only**. The same request reaches the application
and changes state in the toy model, because logging a failed metadata verdict is
not a defense. Switch **Request** to **same-site POST, no token** under
**metadata gate**. The write proceeds. Then switch back to **metadata + token**:
the request reaches application code but fails the unsafe-action proof.

The uncomfortable lesson is the useful one. Fetch Metadata blocks many bad
cross-site shapes before the app spends work, but same-site writes still need an
application-level proof.

<style>
  .fetch-metadata-lab {
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
  .fetch-metadata-lab *,
  .fetch-metadata-lab *::before,
  .fetch-metadata-lab *::after {
    box-sizing: border-box;
  }
  .fetch-metadata-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    margin-bottom: 1rem;
  }
  .fetch-metadata-lab label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }
  .fetch-metadata-lab select {
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
  .fetch-metadata-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .fetch-metadata-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(106px, 1fr));
    margin: 0 0 1rem;
  }
  .fetch-metadata-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9f0;
    border-radius: 7px;
    padding: 0.55rem 0.65rem;
  }
  .fetch-metadata-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 760;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .fetch-metadata-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .fetch-metadata-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    max-width: 100%;
  }
  .fetch-metadata-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }
  @media (max-width: 640px) {
    .fetch-metadata-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="fetch-metadata-lab" data-fetch-metadata-lab>
  <div class="fetch-metadata-lab__controls">
    <label>
      Request: <output data-value="request">cross-site form POST</output>
      <select data-param="request" aria-label="Fetch Metadata request shape">
        <option value="sameOriginPost">Same-origin POST</option>
        <option value="sameSitePostNoToken">Same-site POST, no token</option>
        <option value="crossSiteFormPost" selected>Cross-site form POST</option>
        <option value="crossSiteApiRead">Cross-site API read</option>
        <option value="publicImage">Public image embed</option>
        <option value="directNavigation">Address-bar navigation</option>
        <option value="crossSiteLink">Cross-site link</option>
        <option value="legacyPost">No metadata POST</option>
        <option value="signedWebhook">Signed webhook</option>
      </select>
    </label>
    <label>
      Defense: <output data-value="defense">metadata + token</output>
      <select data-param="defense" aria-label="Server request-shape defense">
        <option value="reportOnly">Report only</option>
        <option value="metadataOnly">Metadata gate</option>
        <option value="metadataAndToken" selected>Metadata + token</option>
      </select>
    </label>
  </div>
  <div class="fetch-metadata-lab__metrics">
    <div class="fetch-metadata-lab__metric"><span>present</span><strong data-metric="present">yes</strong></div>
    <div class="fetch-metadata-lab__metric"><span>would block</span><strong data-metric="wouldBlock">yes</strong></div>
    <div class="fetch-metadata-lab__metric"><span>blocked</span><strong data-metric="blocked">yes</strong></div>
    <div class="fetch-metadata-lab__metric"><span>reached</span><strong data-metric="reached">no</strong></div>
    <div class="fetch-metadata-lab__metric"><span>changed</span><strong data-metric="changed">no</strong></div>
    <div class="fetch-metadata-lab__metric"><span>audit</span><strong data-metric="audit">passes</strong></div>
  </div>
  <canvas data-canvas width="980" height="640" aria-label="Fetch Metadata request gate lab showing browser evidence, metadata decision, application decision, and state-change risk"></canvas>
  <p class="fetch-metadata-lab__note" data-fetch-metadata-note>
    Cross-site form POST does not match an allowed request shape for a state-changing endpoint.
  </p>
</div>

<script defer src="{{ '/assets/js/fetch-metadata-lab.js?v=20260618a' | relative_url }}"></script>

## Reproducing The Classifier

The simulator exports a Node-testable API:

```js
const lab = require("./assets/js/fetch-metadata-lab.js");

console.log(lab.headersFor(lab.requests.crossSiteFormPost));
console.log(lab.evaluate({}).summary);
console.log(lab.auditFetchMetadataLab());
```

Default headers:

```json
[
  ["Sec-Fetch-Site", "cross-site"],
  ["Sec-Fetch-Mode", "navigate"],
  ["Sec-Fetch-Dest", "document"],
  ["Sec-Fetch-User", "?1"]
]
```

Default summary:

```json
{
  "metadataPresent": 1,
  "metadataPass": 0,
  "wouldBlock": 1,
  "blocked": 1,
  "appReached": 0,
  "tokenChecked": 0,
  "stateChanged": 0,
  "risk": 0
}
```

The audit currently runs 67 checks. Among the invariants:

- user-activated navigations emit `Sec-Fetch-User: ?1`;
- subresource requests do not emit `Sec-Fetch-User`;
- cross-site form posts and cross-site private API reads are blocked by the
  metadata gate;
- public cross-site image embeds and direct user navigations are allowed;
- metadata alone allows a same-site write without a token;
- metadata plus token blocks that same-site write;
- signed webhooks can use an application signature instead of browser metadata;
- no scenario can both be blocked and mutate state.

## What I Would Put In A Review

The review question is not "do we use Fetch Metadata?" It is:

```text
does every browser-facing endpoint have a small set of request shapes that make sense?
```

My checklist would be:

| Question | Evidence |
| --- | --- |
| Which paths are public subresources? | Cross-site `no-cors` embeds are allowed only for explicit static assets or public resources. |
| Which paths are top-level documents? | Cross-site user-activated document `GET` navigations are allowed where deep links are intended. |
| Which paths are private APIs? | Cross-site `cors` or `no-cors` empty-destination requests do not reach private API handlers by default. |
| Which paths mutate state? | Unsafe actions still require a CSRF token, same-origin nonce, or equivalent server proof. |
| Which clients are not browsers? | Webhooks, CLI clients, health checks, and monitoring paths use signatures or separate auth instead of metadata guesses. |
| Which responses depend on metadata? | Cacheable variants include the relevant `Vary` header. |

Fetch Metadata is best when it is unglamorous plumbing. It gives the server an
early, browser-supplied sentence about the request:

```text
who caused me, how am I being fetched, and what will I become?
```

That sentence is not enough to trust the request. It is often enough to know the
request does not belong.

[^fetch-metadata-intro]: W3C Web Application Security Working Group, [Fetch Metadata Request Headers, Abstract and Introduction](https://www.w3.org/TR/fetch-metadata/#intro), Working Draft, April 1, 2025.
[^fetch-metadata-dest]: W3C, [Fetch Metadata Request Headers, `Sec-Fetch-Dest`](https://www.w3.org/TR/fetch-metadata/#sec-fetch-dest-header).
[^fetch-metadata-mode]: W3C, [Fetch Metadata Request Headers, `Sec-Fetch-Mode`](https://www.w3.org/TR/fetch-metadata/#sec-fetch-mode-header).
[^fetch-metadata-site]: W3C, [Fetch Metadata Request Headers, `Sec-Fetch-Site`](https://www.w3.org/TR/fetch-metadata/#sec-fetch-site-header).
[^fetch-metadata-user]: W3C, [Fetch Metadata Request Headers, `Sec-Fetch-User`](https://www.w3.org/TR/fetch-metadata/#sec-fetch-user-header).
[^fetch-metadata-redirects]: W3C, [Fetch Metadata Request Headers, Redirects](https://www.w3.org/TR/fetch-metadata/#redirects).
[^fetch-metadata-sec]: W3C, [Fetch Metadata Request Headers, The `Sec-` Prefix](https://www.w3.org/TR/fetch-metadata/#sec-prefix).
[^fetch-metadata-vary]: W3C, [Fetch Metadata Request Headers, Vary](https://www.w3.org/TR/fetch-metadata/#vary).
