---
layout: post
title: "The Cache Entry Needs a Witness"
description: "HTTP caching is not only a TTL. Freshness says when a stored response may be reused without asking; validators say how to ask the origin whether the body still matches."
date: 2026-06-18 03:55:00 -0400
categories: software-engineering
tags: [http-caching, etag, cache-control, stale-while-revalidate, conditional-requests, web-performance, software-engineering]
excerpt: "A cache hit is safe only because a freshness rule or a validator made it safe. Max-age avoids the question for a while; ETag and 304 answer it without sending the body again."
---

A cache hit looks like nothing happened.

That is the trick and the danger. The browser asked for `/article`, the cache
returned bytes it already had, and the origin server never entered the room.

The missing question is:

```text
why was that legal?
```

HTTP caching has two different answers.

```text
freshness:   this stored response is young enough to reuse without asking
validation: this stored response has a witness; ask whether the witness still matches
```

Confusing those two is how "cache it for five minutes" turns into stale UI,
unnecessary origin traffic, or a thundering herd at expiration.

## Fresh Is Not The Same As Current

RFC 9111 defines HTTP caching. Its overview is worth reading literally: a cache
can reuse a **fresh** response without validation, while a response that is not
fresh might still be reusable after validation, or in some stale-serving cases
when the origin is unavailable.[^rfc9111-overview]

That means `Cache-Control: max-age=60` is not a claim that the origin will stay
unchanged for 60 seconds. It is permission to reuse the stored representation
for 60 seconds.

```text
origin changes at t=10
cache fetched at t=0 with max-age=60
request at t=30
```

The cache may still return the `t=0` body. It is fresh by the protocol rule even
though it is not current relative to the origin. This is not a bug. It is the
latency and bandwidth bargain you chose.

If that bargain is unacceptable, shorten freshness, use `no-cache` so reuse
requires validation, or change the URL when the content changes. Do not expect a
freshness lifetime to behave like a subscription to origin state.

## Validators Make The Question Cheap

An entity tag is a witness attached to a representation:

```http
ETag: "v42"
```

Later, a cache can ask:

```http
If-None-Match: "v42"
```

If the current representation still matches, the origin can answer:

```http
304 Not Modified
```

No response body needs to cross the wire. The cache keeps its stored body and
freshens the metadata.

RFC 9110 calls out why entity tags are often better validators than modification
dates: a date can be inconvenient to maintain, has one-second resolution in HTTP
date values, and might not be consistently maintained across systems.[^rfc9110-etag]
This is the quiet engineering reason ETags matter. They are not decorative
hashes in a response header. They are a compact way to say:

```text
the body you have is still the body I would send
```

`Last-Modified` can be useful. It is often enough for static files. But if a
build pipeline can update multiple times inside one second, or if several origin
nodes disagree about file timestamps, time is a blurry witness.

## Lab: Five Origin Trips, Two Bodies Saved

The lab below simulates one URL, one origin, and four client-visible policies:

```text
always fetch       send a full GET every time
expiry only        reuse while fresh; fetch full body when expired
ETag validate      reuse while fresh; send If-None-Match when expired
SWR                serve stale during a stale-while-revalidate window
```

The default origin changes at `9s` and `19s`. Requests keep arriving. The cache
uses:

```text
Cache-Control: max-age=6, stale-while-revalidate=8
origin latency: 420 ms
body size: 40 KB
```

In that default run:

| Policy | Origin trips | Full bodies | 304s | Bytes from origin | Client blocking |
| --- | ---: | ---: | ---: | ---: | ---: |
| always fetch | 35 | 35 | 0 | 1,424.5 KB | 14.7 s |
| expiry only | 5 | 5 | 0 | 203.5 KB | 2.1 s |
| ETag validate | 5 | 3 | 2 | 123.5 KB | 2.1 s |
| stale-while-revalidate | 5 | 3 | 2 | 123.5 KB | 0.42 s |

The validator does not reduce the number of origin trips in this trace. It
reduces the amount of origin data sent during the trips that discover nothing
changed. The stale-while-revalidate policy does something different: it reduces
client blocking by serving a stale response immediately while validation happens
in the background.

<style>
  .http-cache-lab {
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
  .http-cache-lab *,
  .http-cache-lab *::before,
  .http-cache-lab *::after {
    box-sizing: border-box;
  }
  .http-cache-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
    margin-bottom: 1rem;
  }
  .http-cache-lab label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }
  .http-cache-lab input,
  .http-cache-lab select {
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
  .http-cache-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .http-cache-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
    margin: 0 0 1rem;
  }
  .http-cache-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9f0;
    border-radius: 7px;
    padding: 0.55rem 0.65rem;
  }
  .http-cache-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 760;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .http-cache-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .http-cache-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    max-width: 100%;
  }
  .http-cache-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }
  @media (max-width: 640px) {
    .http-cache-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="http-cache-lab" data-http-cache-lab>
  <div class="http-cache-lab__controls">
    <label>
      Scenario: <output data-value="scenario">release flip</output>
      <select data-param="scenario" aria-label="HTTP cache scenario">
        <option value="release" selected>Release flip</option>
        <option value="newsroom">Newsroom spike</option>
        <option value="outage">Origin stumble</option>
        <option value="quiet">Quiet docs</option>
      </select>
    </label>
    <label>
      max-age: <output data-value="maxAge">6s</output>
      <input type="range" min="1" max="20" step="1" value="6" data-param="maxAge">
    </label>
    <label>
      stale-while-revalidate: <output data-value="swr">8s</output>
      <input type="range" min="0" max="30" step="1" value="8" data-param="swr">
    </label>
    <label>
      Origin latency: <output data-value="latency">420ms</output>
      <input type="range" min="80" max="1200" step="20" value="420" data-param="latency">
    </label>
    <label>
      Request cadence: <output data-value="cadence">1.1s</output>
      <input type="range" min="0.45" max="3" step="0.05" value="1.1" data-param="cadence">
    </label>
  </div>
  <div class="http-cache-lab__metrics">
    <div class="http-cache-lab__metric"><span>requests</span><strong data-metric="requests">0</strong></div>
    <div class="http-cache-lab__metric"><span>validator 304s</span><strong data-metric="validator304">0</strong></div>
    <div class="http-cache-lab__metric"><span>SWR stale views</span><strong data-metric="swrStale">0</strong></div>
    <div class="http-cache-lab__metric"><span>validator saves</span><strong data-metric="bytesSaved">0 KB</strong></div>
    <div class="http-cache-lab__metric"><span>SWR saves wait</span><strong data-metric="blockSaved">0s</strong></div>
    <div class="http-cache-lab__metric"><span>SWR errors</span><strong data-metric="errors">0</strong></div>
    <div class="http-cache-lab__metric"><span>oracle</span><strong data-metric="audit">passes</strong></div>
  </div>
  <canvas data-canvas width="980" height="760" aria-label="HTTP cache validation lab comparing always fetch, expiry-only caching, ETag validation, and stale-while-revalidate"></canvas>
  <p class="http-cache-lab__note" data-cache-note>
    The origin changes twice while clients keep asking for the same URL.
  </p>
</div>

<script defer src="{{ '/assets/js/http-cache-validator-lab.js?v=20260618b' | relative_url }}"></script>

## The 304 Is Not A Cache Hit

A `304 Not Modified` is an origin response. It still costs a round trip and
server work. It is cheaper than a `200 OK` with a body, but it is not the same
as a fresh cache hit.

This distinction matters in incident analysis. Suppose origin traffic drops
after adding validators. Did the cache serve more hits, or did the same number
of requests reach the origin with smaller responses? Those are different wins.

The lab's default makes that separation visible:

```js
const lab = require("./assets/js/http-cache-validator-lab.js");
const result = lab.evaluate({
  scenario: "release",
  maxAge: 6,
  swr: 8,
  latency: 420,
  cadence: 1.1
});

console.log(result.policies.validator.summary);
```

The validator policy performs five origin requests, just like the expiry-only
policy. Two of them are `304`, so it sends `123.5 KB` from origin instead of
`203.5 KB`. That is a body-byte win, not an origin-trip win.

The exported audit checks 108 scenario/parameter combinations:

```text
each policy returns one response per request
304 responses occur only when the validator matches the current ETag
validator byte count never exceeds expiry-only byte count
SWR stale responses are served only inside the configured SWR window
SWR never increases max blocking wait relative to ordinary validation
```

Run it directly:

```bash
node - <<'NODE'
const lab = require("./assets/js/http-cache-validator-lab.js");
const audit = lab.auditHttpCacheLab();
console.table(audit.byScenario.map((row) => ({
  scenario: row.scenario,
  cases: row.cases,
  passed: row.passed,
  validator304: row.validator304,
  swrStale: row.swrStale,
  maxBlockingSaved: row.maxBlockingSaved.toFixed(2),
  maxSwrErrors: row.maxSwrErrors
})));
if (!audit.ok || audit.passed !== audit.total) {
  throw new Error(JSON.stringify(audit.failures, null, 2));
}
console.log(`${audit.passed}/${audit.total} parameter cases passed`);
NODE
```

The full source is in
[`assets/js/http-cache-validator-lab.js`]({{ '/assets/js/http-cache-validator-lab.js' | relative_url }}).

## Stale-While-Revalidate Moves The Wait

RFC 5861 defines `stale-while-revalidate`: after a response becomes stale, a
cache may continue serving it for the indicated number of seconds while it
attempts asynchronous validation.[^rfc5861-swr]

That is not a magic freshness upgrade. It is a latency trade:

```text
ordinary validation:
    stale request waits for origin

stale-while-revalidate:
    stale request gets old bytes now
    cache asks origin in the background
    later requests may see the refreshed body
```

The first user after expiration no longer pays the validation round trip. But
that user may see an older representation. The server chooses how much staleness
it can tolerate.

RFC 9111 is strict about this boundary. A cache must not generate a stale
response when directives such as `no-cache` or `must-revalidate` prohibit it,
and must not generate stale responses unless disconnected or explicitly
permitted by client, origin, extension directives, or an out-of-band
contract.[^rfc9111-stale]

So stale-while-revalidate is not "serve stale whenever convenient." It is a
specific permission with a clock attached.

## The Validator Has To Be Stable Across The Fleet

ETags fail quietly when the fleet cannot agree on them.

Bad patterns include:

```text
ETag includes local inode or mtime from one machine
ETag includes a build path or per-host compression artifact
ETag changes on every render even when the body is equivalent
ETag stays fixed while the body changes
```

The first two destroy 304 rates. The last one is worse: it can certify the wrong
body. For static assets, content hashes in filenames often dodge the problem:

```text
/app.6f8b2a.js
Cache-Control: max-age=31536000, immutable
```

The URL itself becomes the version. For mutable URLs such as `/article`,
`/profile`, or `/api/config`, the validator is the witness. It should be derived
from the representation semantics the client actually receives, including
content negotiation when `Vary` is involved.

## What To Measure

For a real service, I would want cache metrics that keep these concepts
separate:

```text
fresh hits
stale hits served by explicit policy
blocking validations
background validations
304 responses
200 replacements after validation
validator mismatch rate across origin nodes
bytes saved at origin
client wait saved
stale view budget consumed
```

One aggregate "hit ratio" hides too much. A fresh hit, a stale hit, and a 304
all mean "we did not send a full body," but they have different correctness and
latency stories.

The cache entry needs a witness because time alone is a blunt instrument.
Freshness decides when not to ask. Validation decides how to ask cheaply when
the permission expires.

[^rfc9111-overview]: Roy Fielding, Mark Nottingham, and Julian Reschke, [RFC 9111, "HTTP Caching"](https://www.rfc-editor.org/rfc/rfc9111.html), June 2022. The introduction defines fresh reuse, validation, and limited stale reuse.

[^rfc9110-etag]: Roy Fielding, Mark Nottingham, and Julian Reschke, [RFC 9110, "HTTP Semantics"](https://www.rfc-editor.org/rfc/rfc9110.html), Section 8.8.3, June 2022. The ETag section notes that entity tags can be more reliable than modification dates when timestamp resolution or consistency is inadequate.

[^rfc5861-swr]: Mark Nottingham, [RFC 5861, "HTTP Cache-Control Extensions for Stale Content"](https://datatracker.ietf.org/doc/html/rfc5861), May 2010. Section 3 defines `stale-while-revalidate` and gives the `max-age=600, stale-while-revalidate=30` example.

[^rfc9111-stale]: RFC 9111, Section 4.2.4, ["Serving Stale Responses"](https://www.rfc-editor.org/rfc/rfc9111.html#name-serving-stale-responses), states when stale responses are prohibited or explicitly permitted.
