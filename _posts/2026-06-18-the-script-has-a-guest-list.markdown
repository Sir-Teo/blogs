---
layout: post
title: "The Script Has a Guest List"
description: "Content Security Policy for scripts is not one rule. Host allowlists, nonces, hashes, and strict-dynamic answer different questions about which JavaScript gets to run."
date: 2026-06-18 04:38:00 -0400
categories: software-engineering
tags: [content-security-policy, csp, xss, web-security, browser-security, javascript, software-engineering]
excerpt: "A CSP script policy is a guest list for execution. Hosts, nonces, hashes, and strict-dynamic put different names on that list."
---

A page rarely loses control because JavaScript exists. It loses control because
some particular JavaScript gets to execute.

That sounds obvious until a `script-src` header turns into a long domain list:

```http
Content-Security-Policy: script-src 'self' https://cdn.example https://analytics.example
```

Now the policy reads like network perimeter equipment. It is not. For scripts,
Content Security Policy is closer to an execution guest list. The question is
not "is this host generally reputable?" The question is:

```text
does this script execution event match a source expression in this policy?
```

That distinction matters because CSP has several kinds of source expression,
and they are not interchangeable. A host source says where code may come from.
A nonce says this particular response intentionally marked this particular
script element. A hash says this exact inline program text is expected.
`strict-dynamic` says a nonce- or hash-blessed script may load dependencies at
runtime without predeclaring their hosts.

Those are different security models hiding in one directive.

## The Policy Is Not One List

The CSP3 spec says `script-src` restricts the locations from which scripts may
be executed, including URLs in `script` elements and inline script blocks.[^csp-script-src]
Inline script is blocked unless the policy allows it implicitly, uses
`unsafe-inline`, or matches a nonce or hash source.[^csp-inline]

The grammar makes the split visible:

```text
host-source     https://cdn.example
scheme-source   https:
keyword-source  'self' 'unsafe-inline' 'strict-dynamic'
nonce-source    'nonce-...'
hash-source     'sha256-...'
```

Nonces are strict string matches against the element's nonce metadata.[^csp-nonce]
Hashes are base64-encoded digest witnesses for exact code or integrity metadata,
with Subresource Integrity doing the response-body verification for external
loads.[^csp-hash]

Those two witnesses shift the policy from:

```text
anything from this place may run
```

to:

```text
this marked script, or this exact script text, may run
```

That shift is why modern CSP guidance is skeptical of large script host
allowlists. A 2016 study by Weichselbaum, Spagnuolo, Lekies, and Janc reported
that most deployed CSP policies they studied did not provide useful XSS
protection, and that script allowlists were frequently bypassable through
trusted-but-dangerous endpoints. The paper also proposed the `strict-dynamic`
keyword as a way to build policies around nonces rather than domain
whitelists.[^csp-study]

## Strict Dynamic Changes The Verb

`strict-dynamic` is easy to remember incorrectly as:

```text
also allow dynamically inserted scripts
```

That is only half the rule. In CSP3, when `strict-dynamic` appears in a
`script-src` or `default-src` directive, host sources, scheme sources, `self`,
and `unsafe-inline` are ignored for script loading; nonce and hash sources are
still honored. Script requests triggered by non-parser-inserted `script`
elements are allowed.[^csp-strict-dynamic]

So this policy:

```http
Content-Security-Policy:
  script-src 'nonce-r4nd0m-demo-nonce' 'strict-dynamic' https:
```

does not mean "nonce plus any HTTPS script." In a CSP3 browser, the `https:`
token is a compatibility crutch for older browsers. The modern rule is:

```text
the nonce root may execute;
runtime-created descendants may execute;
parser-inserted host matches do not rescue unmarked scripts.
```

This is powerful and sharp. If the nonce root creates a dependency from a
constant URL, the policy can avoid brittle domain enumeration. If the nonce root
creates a dependency from attacker-controlled data, the policy will happily
propagate trust to the wrong place.

## Lab: Who Gets To Execute?

The lab below is a small CSP source-list model. It is not a browser engine and
does not set a real `Content-Security-Policy` header on this page. Instead it
isolates the execution checks that are easy to blur:

```text
parser-inserted external script
inline script block
inline event handler
runtime-created script element
nonce match
hash match
host/scheme match
strict-dynamic propagation
```

The default policy is nonce plus `strict-dynamic`; the default scenario is a
trusted app script that creates a runtime dependency. The executable model
produces:

| Default metric | Value |
| --- | ---: |
| Script events considered | 3 |
| Executed | 2 |
| Blocked | 1 |
| Attacker script executed | 0 |
| Runtime-created scripts loaded | 1 |
| Loader hazards surfaced | 0 |

Change **Scenario** to **CDN endpoint turns hostile**. Under **host allowlist**,
the compromised parser-inserted CDN script runs. Under **nonce + strict-dynamic**,
it does not, because host and scheme sources are ignored for parser-inserted
script loading after the nonce/hash checks.

Change **Scenario** to **tainted loader URL**. Now `strict-dynamic` allows an
attacker script, because trusted app code created a runtime script element from
attacker-controlled input. That is not a CSP bypass in the model. It is the
model doing exactly what the policy asked.

<style>
  .csp-lab {
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
  .csp-lab *,
  .csp-lab *::before,
  .csp-lab *::after {
    box-sizing: border-box;
  }
  .csp-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    margin-bottom: 1rem;
  }
  .csp-lab label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }
  .csp-lab select {
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
  .csp-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .csp-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
    margin: 0 0 1rem;
  }
  .csp-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9f0;
    border-radius: 7px;
    padding: 0.55rem 0.65rem;
  }
  .csp-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 760;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .csp-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .csp-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    max-width: 100%;
  }
  .csp-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }
  @media (max-width: 640px) {
    .csp-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="csp-lab" data-csp-script-lab>
  <div class="csp-lab__controls">
    <label>
      Policy: <output data-value="policy">nonce + strict-dynamic</output>
      <select data-param="policy" aria-label="CSP script policy">
        <option value="hostAllowlist">Host allowlist</option>
        <option value="nonceOnly">Nonce only</option>
        <option value="nonceStrictDynamic" selected>Nonce + strict-dynamic</option>
        <option value="hashAndSelf">Hash + self</option>
        <option value="unsafeInline">Unsafe inline + HTTPS</option>
      </select>
    </label>
    <label>
      Scenario: <output data-value="scenario">runtime dependency</output>
      <select data-param="scenario" aria-label="CSP script scenario">
        <option value="inlineInjection">Inline XSS</option>
        <option value="cdnCompromise">CDN endpoint turns hostile</option>
        <option value="dynamicDependency" selected>Runtime dependency</option>
        <option value="untrustedLoader">Tainted loader URL</option>
      </select>
    </label>
  </div>
  <div class="csp-lab__metrics">
    <div class="csp-lab__metric"><span>executed</span><strong data-metric="executed">0</strong></div>
    <div class="csp-lab__metric"><span>blocked</span><strong data-metric="blocked">0</strong></div>
    <div class="csp-lab__metric"><span>attacker ran</span><strong data-metric="attacker">no</strong></div>
    <div class="csp-lab__metric"><span>runtime loads</span><strong data-metric="dynamic">0</strong></div>
    <div class="csp-lab__metric"><span>hazard</span><strong data-metric="hazard">no</strong></div>
    <div class="csp-lab__metric"><span>audit</span><strong data-metric="audit">passes</strong></div>
  </div>
  <canvas data-canvas width="980" height="640" aria-label="Content Security Policy script-source simulator showing allowed and blocked script execution events"></canvas>
  <p class="csp-lab__note" data-csp-note>
    The nonce root may execute, and strict-dynamic lets its runtime-created dependency execute.
  </p>
</div>

<script defer src="{{ '/assets/js/csp-script-lab.js?v=20260618c' | relative_url }}"></script>

## Reproducing The Model

The artifact is a plain JavaScript module:

```bash
node - <<'NODE'
const lab = require("./assets/js/csp-script-lab.js");

console.log(lab.hashSourceFor("abc"));
console.log(lab.evaluate({}).summary);
const audit = lab.auditCspScriptLab();
console.table(audit.byPolicy);
console.table(audit.byScenario);
console.table(audit.criticalChecks);
if (audit.checked !== 32) {
  throw new Error("unexpected check count: " + audit.checked);
}
if (audit.criticalTotal !== 12 || audit.cases.length !== 20 || audit.totalChecks !== 32) {
  throw new Error(
    `unexpected audit grid: ${audit.criticalTotal} critical checks, ` +
    `${audit.cases.length} generated cases, ${audit.totalChecks} total checks`
  );
}
const summary = `${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (!audit.ok || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify(audit.errors, null, 2));
}
console.log(summary);
NODE
```

The hash line prints the CSP-style SHA-256 source expression for `abc`:

```text
'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='
```

The default summary is:

```json
{
  "scripts": 3,
  "executed": 2,
  "blocked": 1,
  "attackerExecuted": 0,
  "dynamicLoaded": 1,
  "parserInsertedBlockedByStrict": 0,
  "eventHandlersBlocked": 0,
  "loaderHazards": 0
}
```

The audit currently runs 12 critical checks plus 20 generated policy/scenario
partition checks, for 32 total checks. It verifies the SHA-256/base64 test
vector, the host-allowlist CDN failure mode, the parser-inserted block under
`strict-dynamic`, the nonce-only runtime-dependency block, the exact inline hash
case, the `unsafe-inline` injection case, and the tainted-loader caveat.

## A Small Decision Table

Here are the combinations I reach for when reading a production CSP incident:

| Policy and scenario | Result in the model | Interpretation |
| --- | --- | --- |
| Host allowlist / CDN hostile | attacker executes | The location was on the list, so a bad endpoint inherits trust. |
| Nonce + strict-dynamic / CDN hostile | attacker blocked | A parser-inserted CDN script with no nonce is not rescued by `https:`. |
| Nonce only / runtime dependency | dependency blocked | The root script was marked, but trust did not propagate. |
| Nonce + strict-dynamic / runtime dependency | dependency executes | The root script creates a non-parser-inserted child. |
| Unsafe inline / inline XSS | attacker executes twice | The inline block and event handler both run. |
| Nonce + strict-dynamic / tainted loader | attacker executes | The trusted loader chose an attacker-controlled URL. |

The last row is the one that keeps the model honest. `strict-dynamic` is not a
magic XSS eraser. It changes the audit from "are all hostnames safe?" to "which
nonce/hash roots can create script elements, and where do their URLs come from?"

## Boundaries

This lab intentionally leaves out large pieces of CSP: `default-src` fallback
details, `script-src-elem`, `script-src-attr`, `unsafe-hashes`, modules,
`unsafe-eval`, WebAssembly compilation, Trusted Types, report-only policies,
multiple simultaneous policies, redirects, browser-specific console messages,
and real network fetching.

Those omissions are not loopholes. They are the edges of this artifact. The
point here is smaller: if a team talks about CSP as one allowlist, it will miss
the security difference between a place, a per-response mark, an exact digest,
and a trust chain.

[^csp-script-src]: W3C, [Content Security Policy Level 3, `script-src`](https://www.w3.org/TR/CSP3/#directive-script-src).
[^csp-inline]: W3C, [CSP3 `script-src` inline behavior](https://www.w3.org/TR/CSP3/#directive-script-src), which describes inline script blocks passing through CSP inline checks.
[^csp-nonce]: W3C, [CSP3, "Does nonce match source list?"](https://www.w3.org/TR/CSP3/#match-nonce-to-source-list).
[^csp-hash]: W3C, [CSP3, "Does integrity metadata match source list?"](https://www.w3.org/TR/CSP3/#match-integrity-metadata-to-source-list).
[^csp-study]: Lukas Weichselbaum, Michele Spagnuolo, Sebastian Lekies, and Artur Janc, [CSP Is Dead, Long Live CSP!](https://research.google/pubs/csp-is-dead-long-live-csp-on-the-insecurity-of-whitelists-and-the-future-of-content-security-policy/).
[^csp-strict-dynamic]: W3C, [CSP3, usage of `strict-dynamic`](https://www.w3.org/TR/CSP3/#strict-dynamic-usage).
