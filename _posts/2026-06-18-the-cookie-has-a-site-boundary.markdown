---
layout: post
title: "The Cookie Has a Site Boundary"
description: "SameSite is not a domain flag or a CORS setting. It is a browser retrieval rule for deciding whether an ambient cookie rides along with a request."
date: 2026-06-18 04:52:00 -0400
categories: software-engineering
tags: [cookies, samesite, csrf, web-security, browser-security, http, software-engineering]
excerpt: "A SameSite cookie asks a precise question before it rides along: is this request same-site, or is it one of the narrow cross-site exceptions?"
---

Cookies are ambient authority with a memory.

Once a browser stores a session cookie for `https://bank.example`, later
requests to that host can carry the cookie without the application explicitly
putting credentials into the request body. That is the feature. It is also the
trap behind cross-site request forgery:

```html
<form action="https://bank.example/transfer" method="post">
  <input name="amount" value="1000">
</form>
```

If a page on `https://attacker.example` can cause the browser to submit that
form, the browser may attach cookies for `bank.example`. The attacker does not
need to read the response to have caused work.

`SameSite` changes one part of that story. It tells the browser when the cookie
is eligible to be returned on a request. It does not tell the server whether the
request is semantically legitimate.

## Site Is Not Origin

The HTML Standard defines a site from an origin by taking the scheme and the
host's registrable domain. Two sites are the same site only when both scheme and
host component match after that reduction; ports are ignored.[^html-sites]

That means:

```text
https://app.bank.example      site: https://bank.example
https://bank.example          site: https://bank.example
http://bank.example           site: http://bank.example
https://attacker.example      site: https://attacker.example
```

The first two are same-site but not same-origin. The first and third have the
same registrable domain but are cross-site under the schemeful definition. That
one word, site, is doing more work than it looks like.

The current HTTPWG cookie draft uses that same-site test to classify requests.
A request is same-site when its current URL's origin is same-site with the
request client's "site for cookies"; otherwise it is cross-site. For ordinary
top-level documents, the "site for cookies" comes from the top-level origin,
the security context the user sees in the address bar.[^6265-samesite-request]

So the browser is not asking:

```text
is the request URL the same origin as the page?
```

It is asking a looser, cookie-specific question:

```text
is the request URL the same schemeful site as the page's site for cookies?
```

That is why subdomain architecture matters. `app.bank.example` and
`bank.example` are different origins, but SameSite treats them as the same site.

## The Three Useful Modes

In the cookie draft, the `SameSite` attribute parses into an enforcement value:
`Strict`, `Lax`, `None`, or `Default` when the attribute is absent.[^6265-attribute]

`Strict` is the clean rule:

```text
cross-site request -> do not send the cookie
```

`Lax` adds the browser-compatibility exception most people trip over. A Lax
cookie can be sent on a cross-site request only when that request is a
top-level navigation using a safe HTTP method, such as `GET`.[^6265-lax]

`None` opts into cross-site cookie sending, but the storage model rejects
`SameSite=None` cookies unless they also have the `Secure` attribute.[^6265-none]

The missing-attribute case is not exactly the same as writing `Lax`. User agents
may apply "Lax-allowing-unsafe" to recently created cookies whose SameSite flag
is `Default`, allowing them on top-level cross-site requests regardless of
method for a short compatibility window. The draft says deployment experience
has shown two minutes or less to be a reasonable limit.[^6265-lax-unsafe]

That exception exists because real login flows have historically used
cross-site top-level `POST` callbacks with freshly created transactional
cookies. It is also a reminder that "default Lax" is a deployment transition,
not a mathematical theorem.

## Lab: Does The Cookie Ride Along?

The lab below implements a small cookie retrieval model:

```text
site = scheme + registrable domain
same-site != same-origin
Strict withholds on cross-site requests
Lax allows cross-site top-level safe-method navigations
Default fresh can use Lax-allowing-unsafe
SameSite=None requires Secure to be stored
CSRF tokens are a server decision, not a cookie attribute
```

The default run is a classic cross-site form `POST` from
`https://attacker.example` to `https://bank.example/transfer`, using a
`SameSite=Lax` cookie and a server that requires a CSRF token for unsafe
actions. The executable model gives:

| Default metric | Value |
| --- | ---: |
| Cookie stored | yes |
| Request same-site | no |
| Cookie sent | no |
| Server blocked by token check | no |
| State changed | no |
| Audit | passes |

Switch **Cookie** to **SameSite=None; Secure** and **Server** to **cookie only**.
The cookie is sent and the state change succeeds. Switch **Server** back to
**CSRF token**. The browser still sends the cookie, but the server blocks the
unsafe action because the request lacks the token.

Switch **Request** to **same-site POST**. The page origin is
`https://app.bank.example` and the target is `https://bank.example`; this is
cross-origin but same-site, so a Lax cookie rides along. SameSite is not a
substitute for origin-level authorization.

<style>
  .samesite-lab {
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
  .samesite-lab *,
  .samesite-lab *::before,
  .samesite-lab *::after {
    box-sizing: border-box;
  }
  .samesite-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
    margin-bottom: 1rem;
  }
  .samesite-lab label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }
  .samesite-lab select {
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
  .samesite-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .samesite-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
    margin: 0 0 1rem;
  }
  .samesite-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9f0;
    border-radius: 7px;
    padding: 0.55rem 0.65rem;
  }
  .samesite-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 760;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .samesite-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .samesite-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    max-width: 100%;
  }
  .samesite-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }
  @media (max-width: 640px) {
    .samesite-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="samesite-lab" data-samesite-cookie-lab>
  <div class="samesite-lab__controls">
    <label>
      Cookie: <output data-value="cookie">SameSite=Lax</output>
      <select data-param="cookie" aria-label="SameSite cookie mode">
        <option value="strict">SameSite=Strict</option>
        <option value="lax" selected>SameSite=Lax</option>
        <option value="defaultFresh">Default, fresh</option>
        <option value="defaultOld">Default, old</option>
        <option value="noneSecure">SameSite=None; Secure</option>
        <option value="noneInsecure">SameSite=None only</option>
      </select>
    </label>
    <label>
      Request: <output data-value="request">cross-site form POST</output>
      <select data-param="request" aria-label="Cookie request shape">
        <option value="sameSitePost">Same-site POST</option>
        <option value="crossLink">Cross-site link</option>
        <option value="crossPost" selected>Cross-site form POST</option>
        <option value="crossImage">Cross-site image</option>
        <option value="schemePost">Scheme-crossing POST</option>
        <option value="idpPost">Login callback POST</option>
      </select>
    </label>
    <label>
      Server: <output data-value="server">CSRF token</output>
      <select data-param="server" aria-label="Server CSRF defense">
        <option value="cookieOnly">Cookie only</option>
        <option value="csrfToken" selected>CSRF token</option>
      </select>
    </label>
  </div>
  <div class="samesite-lab__metrics">
    <div class="samesite-lab__metric"><span>stored</span><strong data-metric="stored">yes</strong></div>
    <div class="samesite-lab__metric"><span>same-site</span><strong data-metric="sameSite">no</strong></div>
    <div class="samesite-lab__metric"><span>cookie sent</span><strong data-metric="sent">no</strong></div>
    <div class="samesite-lab__metric"><span>blocked</span><strong data-metric="blocked">no</strong></div>
    <div class="samesite-lab__metric"><span>changed</span><strong data-metric="changed">no</strong></div>
    <div class="samesite-lab__metric"><span>audit</span><strong data-metric="audit">passes</strong></div>
  </div>
  <canvas data-canvas width="980" height="610" aria-label="SameSite cookie retrieval simulator showing site comparison, cookie send decision, and server CSRF decision"></canvas>
  <p class="samesite-lab__note" data-samesite-note>
    A Lax cookie is withheld from a cross-site unsafe top-level request.
  </p>
</div>

<script defer src="{{ '/assets/js/samesite-cookie-lab.js?v=20260618a' | relative_url }}"></script>

## Reproducing The Artifact

The simulator exports a Node-testable API:

```js
const lab = require("./assets/js/samesite-cookie-lab.js");

console.log(lab.siteFor("https://app.bank.example/dashboard"));
console.log(lab.evaluate({}).summary);
console.log(lab.auditSameSiteCookieLab());
```

Default output:

```json
{
  "stored": 1,
  "sameSite": 0,
  "sameOrigin": 0,
  "cookieSent": 0,
  "token": 0,
  "blocked": 0,
  "stateChanged": 0,
  "csrfRisk": 0
}
```

The audit currently runs 160 checks. Among the invariants:

- `https://app.bank.example` and `https://bank.example` are same-site but not
  same-origin;
- `http://bank.example` and `https://bank.example` are cross-site;
- `SameSite=Strict` is withheld on cross-site links;
- `SameSite=Lax` is sent on cross-site top-level safe navigations but not
  cross-site `POST` or subresource requests;
- fresh default cookies can be sent on unsafe top-level requests in the
  Lax-allowing-unsafe compatibility window;
- `SameSite=None` without `Secure` is rejected before retrieval;
- a server-side CSRF token blocks the unsafe action even when the cookie is
  sent.

## What I Would Put In A Review

SameSite is a useful default, but I would not approve a sensitive state-changing
endpoint with "we set SameSite=Lax" as the only CSRF argument.

The review checklist is shorter and sharper:

| Question | Evidence |
| --- | --- |
| Is the action safe? | `GET`, `HEAD`, `OPTIONS`, and `TRACE` must not mutate application state. |
| Which cookies authorize writes? | Prefer a write-capable cookie that is stricter than a read/session-display cookie. |
| Can an attacker create a same-site request? | Check sibling subdomains, redirects, and XSS on any same-site origin. |
| Are cross-site embeds required? | Use `SameSite=None; Secure` only for cookies that genuinely need cross-site contexts. |
| Is there a server proof? | Unsafe actions should require a CSRF token, same-origin nonce, or equivalent server-validated proof. |

The cookie can refuse to ride along with many cross-site requests. It cannot
decide whether a request that did arrive is the one the user meant to send.

[^html-sites]: WHATWG HTML, [Sites](https://html.spec.whatwg.org/multipage/browsers.html#sites).
[^6265-samesite-request]: HTTPWG, [Cookies: HTTP State Management Mechanism, Section 5.2](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html#section-5.2), published as the latest Internet-Draft on June 18, 2026.
[^6265-attribute]: HTTPWG, [Cookies draft, Section 5.6.7](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html#section-5.6.7).
[^6265-lax]: HTTPWG, [Cookies draft, Section 5.6.7.1](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html#section-5.6.7.1).
[^6265-none]: HTTPWG, [Cookies draft, storage model for `SameSite=None`](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html#section-5.7).
[^6265-lax-unsafe]: HTTPWG, [Cookies draft, Section 5.6.7.2](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html#section-5.6.7.2).
