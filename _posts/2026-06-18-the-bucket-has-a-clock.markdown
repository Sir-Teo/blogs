---
layout: post
title: "The Bucket Has a Clock"
description: "A token bucket is not a vague request quota. It is a small arrival-curve contract: spend saved credit on bursts, refill at a steady rate, and prove every admitted interval fits B + rT."
date: 2026-06-18 03:50:00 -0400
categories: software-engineering
tags: [rate-limiting, token-bucket, traffic-shaping, api-design, distributed-systems, networking, software-engineering]
excerpt: "Fixed windows have seams. Queues hide overload in latency. A token bucket makes the burst allowance explicit: a client may spend at most B saved requests plus r new requests per second."
---

A rate limit usually gets written as a sentence:

```text
100 requests per minute
```

That sentence is missing the interesting part.

Can the client send all 100 requests in the first second? Can it send 100 at
`12:00:59.9` and another 100 at `12:01:00.1`? Should excess work be rejected,
marked down, or queued until it becomes conforming?

The implementation answer is not "rate." It is a contract about arrivals.

## The Contract Is B Plus rT

A token bucket has two numbers:

```text
r = refill rate
B = bucket capacity
```

At time `t`, refill the bucket by `r * elapsed`, cap it at `B`, and spend one
token for one unit of accepted work:

```text
tokens = min(B, tokens + r * (now - last))
if tokens >= cost:
    tokens -= cost
    accept
else:
    reject or delay
```

This little state machine gives a stronger statement than "about r per second."
For every admitted interval of length $$T$$, the admitted work is bounded by:

$$
A(T) \le B + rT.
$$

That is the point of the bucket. A client can spend idle-time credit, but the
credit has a ceiling. Once the bucket is empty, time is the only way to earn
more.

Networking standards use this language with bytes rather than API requests.
RFC 2697's single-rate three-color marker meters a packet stream with a
committed information rate and burst sizes; its formal meter uses token buckets
that start full, refill up to their configured sizes, and spend tokens according
to packet size.[^rfc2697] RFC 2698's two-rate marker adds a peak-rate bucket and
a committed-rate bucket, again with burst sizes attached to rates.[^rfc2698]

Those RFCs are not "how to build a SaaS API limiter" manuals. They are useful
because they name the invariant cleanly:

```text
rate without burst size is not a traffic contract
burst size without rate is not a traffic contract
```

## Fixed Windows Have Seams

A fixed window counter is tempting:

```text
window = floor(now / 60 seconds)
if count[window] < 100: accept
```

It is easy to explain, cheap to store, and sometimes perfectly adequate. But it
does not enforce the same envelope. Its seam is real. If the client sends 100
requests at the very end of one minute and 100 at the start of the next, the
counter sees two legal minutes. The service sees 200 requests in a tiny interval.

There are repairs: sliding logs, rolling counters, GCRA, token buckets, or
multiple nested windows. The important move is not memorizing a favorite
algorithm. It is deciding which statement must be true:

```text
per-calendar-window quota
or
any-interval burst envelope
```

Those are different product and reliability choices.

## Policing And Shaping Are Different Verbs

Once a request is nonconforming, the system still has to choose a verb.

```text
policer: reject, mark, or deprioritize the excess
shaper: delay the excess until it conforms
```

RFC 6585 standardized HTTP `429 Too Many Requests` for the first verb. It says
the status indicates that a user sent too many requests in a given amount of
time, and it allows a `Retry-After` header telling the client how long to
wait.[^rfc6585] The same section is careful about scope: it does not define how
the server identifies the user or counts requests.

That omission is not a gap in the status code. It is the whole design problem.

The current HTTPAPI working-group RateLimit draft, as of June 18, 2026, is also
explicitly about advertising policy and current quota state, not mandating the
throttling algorithm itself.[^ratelimit-draft] A header can tell a client what
the server claims. It cannot make a bad counting rule good.

## Lab: Watch The Seam Spend Twice

The default lab below creates a deliberately ugly trace: requests crowd just
before and just after a fixed-window reset. The configured policy is:

```text
rate   = 5 requests / second
burst  = 8 requests
window = 6 seconds
```

The fixed window allows `30` requests per six-second window. Because the burst
straddles a reset, it admits all `40` arrivals. The token bucket admits only
`15`: the initial eight tokens, a little refill between clusters, and the later
work after time has rebuilt credit. The shaper accepts `26` with the default
queue, but its worst delay is `3.6s`; that is not free capacity, only waiting.

<style>
  .token-bucket-lab {
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
  .token-bucket-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
    margin-bottom: 1rem;
  }
  .token-bucket-lab label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .token-bucket-lab input,
  .token-bucket-lab select {
    accent-color: #0f766e;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.35rem 0.45rem;
  }
  .token-bucket-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .token-bucket-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
    margin: 0 0 1rem;
  }
  .token-bucket-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9f0;
    border-radius: 7px;
    padding: 0.55rem 0.65rem;
  }
  .token-bucket-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 760;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .token-bucket-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .token-bucket-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    max-width: 100%;
  }
  .token-bucket-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }
  @media (max-width: 640px) {
    .token-bucket-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="token-bucket-lab" data-token-bucket-lab>
  <div class="token-bucket-lab__controls">
    <label>
      Scenario: <output data-value="scenario">window-edge burst</output>
      <select data-param="scenario" aria-label="Traffic scenario">
        <option value="edge" selected>Window-edge burst</option>
        <option value="burst">Ordinary burst</option>
        <option value="steady">Steady client</option>
        <option value="herd">Reset herd</option>
      </select>
    </label>
    <label>
      Refill rate: <output data-value="rate">5/s</output>
      <input type="range" min="1" max="12" step="1" value="5" data-param="rate">
    </label>
    <label>
      Burst capacity: <output data-value="burst">8</output>
      <input type="range" min="1" max="30" step="1" value="8" data-param="burst">
    </label>
    <label>
      Fixed window: <output data-value="window">6s</output>
      <input type="range" min="2" max="15" step="1" value="6" data-param="window">
    </label>
    <label>
      Shaper queue: <output data-value="queue">18</output>
      <input type="range" min="0" max="60" step="1" value="18" data-param="queue">
    </label>
  </div>
  <div class="token-bucket-lab__metrics">
    <div class="token-bucket-lab__metric"><span>arrivals</span><strong data-metric="arrivals">0</strong></div>
    <div class="token-bucket-lab__metric"><span>token accepts</span><strong data-metric="token">0</strong></div>
    <div class="token-bucket-lab__metric"><span>fixed accepts</span><strong data-metric="fixed">0</strong></div>
    <div class="token-bucket-lab__metric"><span>shaper accepts</span><strong data-metric="shaper">0</strong></div>
    <div class="token-bucket-lab__metric"><span>fixed peak</span><strong data-metric="peak">0/s</strong></div>
    <div class="token-bucket-lab__metric"><span>max delay</span><strong data-metric="delay">0s</strong></div>
    <div class="token-bucket-lab__metric"><span>oracle</span><strong data-metric="audit">passes</strong></div>
  </div>
  <canvas data-canvas width="980" height="760" aria-label="Token bucket rate-limit lab comparing fixed windows, token-bucket policing, and queue shaping"></canvas>
  <p class="token-bucket-lab__note" data-token-note>
    Requests arrive just before and just after a fixed-window boundary.
  </p>
</div>

<script defer src="{{ '/assets/js/token-bucket-lab.js?v=20260618c' | relative_url }}"></script>

## The Timestamp Form Is The Same Contract

Many production limiters do not store a floating-point token count. They store
one timestamp. The Generic Cell Rate Algorithm style can be written as:

```text
interval = 1 / r
tolerance = (B - 1) * interval

if now >= theoretical_arrival_time - tolerance:
    accept
    theoretical_arrival_time = max(now, theoretical_arrival_time) + interval
else:
    reject
```

For unit-cost requests, this is equivalent to a token bucket that starts full.
The lab audits that equivalence for every request in every built-in scenario.
The default browser run is only one view; the exported verifier checks 324
scenario/parameter combinations and 2,592 named invariant checks:

```bash
node - <<'NODE'
const lab = require("./assets/js/token-bucket-lab.js");
const EXPECTED_SCENARIO_SHAPE = [
  "edge:cases=81:passed=81:checks=648/648:tokenExcess=0.000:fixedExcess=43.700:maxDelay=10.240",
  "burst:cases=81:passed=81:checks=648/648:tokenExcess=0.000:fixedExcess=4.600:maxDelay=12.000",
  "steady:cases=81:passed=81:checks=648/648:tokenExcess=0.000:fixedExcess=0.000:maxDelay=0.037",
  "herd:cases=81:passed=81:checks=648/648:tokenExcess=0.000:fixedExcess=7.560:maxDelay=11.999"
];
const EXPECTED_GRID_SHAPE = [
  "edge:cases=81:rates=2/5/9:bursts=3/8/16:windows=3/6/10:queues=0/8/24:arrivals=16..59:tokenAccepted=7..29:fixedAccepted=16..59:shaperAccepted=3..38",
  "burst:cases=81:rates=2/5/9:bursts=3/8/16:windows=3/6/10:queues=0/8/24:arrivals=38..62:tokenAccepted=28..62:fixedAccepted=28..62:shaperAccepted=24..62",
  "steady:cases=81:rates=2/5/9:bursts=3/8/16:windows=3/6/10:queues=0/8/24:arrivals=70..70:tokenAccepted=70..70:fixedAccepted=70..70:shaperAccepted=60..70",
  "herd:cases=81:rates=2/5/9:bursts=3/8/16:windows=3/6/10:queues=0/8/24:arrivals=46..78:tokenAccepted=25..68:fixedAccepted=28..78:shaperAccepted=19..78"
];
const EXPECTED_CHECK_SEQUENCE = [
  { name: "token row count matches arrivals", passed: true },
  { name: "GCRA row count matches arrivals", passed: true },
  { name: "token bucket and GCRA agree request-by-request", passed: true },
  { name: "token count stays within bucket capacity", passed: true },
  { name: "accepted token stream respects burst envelope", passed: true },
  { name: "shaper output stays ordered", passed: true },
  { name: "fixed window stays within its own quota", passed: true },
  { name: "tight edge case exposes fixed-window burst excess", passed: true }
];
const EXPECTED_CHECK_NAMES = EXPECTED_CHECK_SEQUENCE.map((check) => check.name).sort();
const EXPECTED_SCENARIOS = EXPECTED_SCENARIO_SHAPE.length;
const EXPECTED_CASES = EXPECTED_SCENARIOS * 3 * 3 * 3 * 3;
const EXPECTED_CHECKS = EXPECTED_CASES * EXPECTED_CHECK_SEQUENCE.length;

function sameList(actual, expected) {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function fixed3(value) {
  return Number(value).toFixed(3);
}

function uniqueNumbers(values) {
  return Array.from(new Set(values)).sort((a, b) => a - b).join("/");
}

function numericRange(values) {
  return `${Math.min(...values)}..${Math.max(...values)}`;
}

function scenarioShape(row) {
  return `${row.scenario}:cases=${row.cases}:passed=${row.passed}:` +
    `checks=${row.passedChecks}/${row.totalChecks}:` +
    `tokenExcess=${fixed3(row.maxTokenExcess)}:` +
    `fixedExcess=${fixed3(row.maxFixedExcess)}:maxDelay=${fixed3(row.maxDelay)}`;
}

function gridShape(audit, scenario) {
  const rows = audit.cases.filter((row) => row.scenario === scenario);
  return `${scenario}:cases=${rows.length}:` +
    `rates=${uniqueNumbers(rows.map((row) => row.rate))}:` +
    `bursts=${uniqueNumbers(rows.map((row) => row.burst))}:` +
    `windows=${uniqueNumbers(rows.map((row) => row.window))}:` +
    `queues=${uniqueNumbers(rows.map((row) => row.queue))}:` +
    `arrivals=${numericRange(rows.map((row) => row.arrivals))}:` +
    `tokenAccepted=${numericRange(rows.map((row) => row.tokenAccepted))}:` +
    `fixedAccepted=${numericRange(rows.map((row) => row.fixedAccepted))}:` +
    `shaperAccepted=${numericRange(rows.map((row) => row.shaperAccepted))}`;
}

const audit = lab.auditTokenBucketLab();
console.table(audit.byScenario.map((row) => ({
  scenario: row.scenario,
  cases: `${row.passed}/${row.cases}`,
  checks: `${row.passedChecks}/${row.totalChecks}`,
  maxTokenExcess: row.maxTokenExcess.toFixed(3),
  maxFixedExcess: row.maxFixedExcess.toFixed(3),
  maxDelay: row.maxDelay.toFixed(3)
})));
const shape = {
  checkNames: Array.from(new Set(audit.cases.flatMap(
    (row) => row.checks.map((check) => check.name)
  ))).sort(),
  grid: audit.byScenario.map((row) => gridShape(audit, row.scenario)),
  scenarios: audit.byScenario.map(scenarioShape)
};
const checkRowDrifts = audit.cases.map((row) => ({
  key: `${row.scenario}/${row.rate}/${row.burst}/${row.window}/${row.queue}`,
  checks: row.checks.map((check) => ({
    name: check.name,
    passed: check.passed
  }))
})).filter((row) => !sameJson(row.checks, EXPECTED_CHECK_SEQUENCE));
const shapeErrors = [];
if (!sameList(shape.scenarios, EXPECTED_SCENARIO_SHAPE)) {
  shapeErrors.push({
    name: "scenarios",
    actual: shape.scenarios,
    expected: EXPECTED_SCENARIO_SHAPE
  });
}
if (!sameList(shape.grid, EXPECTED_GRID_SHAPE)) {
  shapeErrors.push({ name: "grid", actual: shape.grid, expected: EXPECTED_GRID_SHAPE });
}
if (!sameList(shape.checkNames, EXPECTED_CHECK_NAMES)) {
  shapeErrors.push({
    name: "checkNames",
    actual: shape.checkNames,
    expected: EXPECTED_CHECK_NAMES
  });
}
if (checkRowDrifts.length) {
  shapeErrors.push({
    name: "checkRows",
    actual: checkRowDrifts.slice(0, 10),
    expected: EXPECTED_CHECK_SEQUENCE
  });
}

const failedScenarioGroups = audit.byScenario.filter(
  (row) => row.passed !== row.cases || row.passedChecks !== row.totalChecks
);
const failedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const summary =
  `${audit.passed}/${audit.total} parameter cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (shapeErrors.length ||
    !audit.ok ||
    audit.byScenario.length !== EXPECTED_SCENARIOS ||
    audit.cases.length !== EXPECTED_CASES ||
    audit.checked !== EXPECTED_CASES ||
    audit.total !== EXPECTED_CASES ||
    audit.totalChecks !== EXPECTED_CHECKS ||
    failedScenarioGroups.length ||
    failedCases.length ||
    audit.passed !== audit.total ||
    audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    summary,
    shapeErrors,
    failures: audit.failures,
    failedScenarioGroups,
    failedCases: failedCases.slice(0, 10),
    totals: {
      checked: audit.checked,
      cases: audit.cases.length,
      passed: audit.passed,
      passedChecks: audit.passedChecks,
      scenarioRows: audit.byScenario.length,
      total: audit.total,
      totalChecks: audit.totalChecks
    }
  }, null, 2));
}
console.log(summary);
NODE
```

The eight checks per row are deliberately mechanical:

```text
token row count matches arrivals
GCRA row count matches arrivals
token bucket and timestamp limiter agree request-by-request
token count stays inside [0, B]
accepted token stream never exceeds B + rT over any interval
fixed windows never exceed their own per-window quota
shaper output stays ordered
tight edge cases expose the fixed-window seam
```

The token-bucket rule is simple enough that bugs are usually not in the formula.
They are in the definitions around it:

```text
What is one unit of cost?
Which key owns the bucket?
Is the clock monotonic?
Where is state replicated?
Does a rejected request consume anything?
Does a queued request keep holding memory, a worker, or a socket?
```

## Queues Are Limiters Only If Delay Is Allowed

A shaper can make a stream conform by holding requests until their scheduled
send times. That is useful for clients, batch jobs, packet egress, and polite
crawlers. It is dangerous as a server-side default when the caller is already
waiting on an interactive request.

An unbounded shaper says:

```text
yes, but later
```

Under overload, "later" becomes the incident. Memory rises, socket counts rise,
timeouts rise, retries arrive, and the next layer sees a burst that the shaper
was supposed to prevent. A bounded queue is a hybrid: delay the small burst,
reject the rest.

This is why the HTTP verb matters. `429` is not a moral judgment about the
client. It is often the most honest way to say:

```text
the burst budget is empty and accepting this would move pain into hidden state
```

## The Unit Is A Product Decision

Packet markers use bytes because bytes consume network capacity. API limiters
often start with "requests" because that is easy to count. Real systems often
need weighted cost:

```text
small cached read       cost 1
uncached search         cost 8
bulk export             cost 200
model inference         prompt_tokens + completion_tokens
```

The token bucket does not care. It spends `cost` tokens. The hard part is making
the cost meaningful and hard to game.

Per-user buckets defend fairness between users. Per-IP buckets defend a
different boundary and can punish NATs. Per-endpoint buckets protect hot
resources. Global buckets protect the service when all partitions look locally
reasonable but the fleet is out of headroom. Multi-dimensional policies are not
a smell; they are often the only honest model.

## What To Write Down

A useful rate-limit spec should include more than a number:

```text
principal:       user, token, org, IP, route, tenant, or global pool
unit:            request, byte, row, token, CPU estimate, or weighted action
rate r:          refill per second
burst B:         maximum saved credit
verb:            reject, mark down, delay, shed, or degrade
retry signal:    Retry-After or equivalent client-visible schedule
state model:     local, sticky, shared, approximate, or eventually merged
clock rule:      monotonic time and behavior after clock jumps
```

The last two are where distributed systems enter. A perfect local token bucket
on every server is not a perfect global token bucket. If a tenant can spray
requests across 20 replicas, each with its own full bucket, the burst budget is
20 times larger than the document says. Sticky routing, centralized state,
lease-based allocation, hierarchical buckets, and approximate sketches are all
ways to choose a different error profile.

None of those choices removes the small invariant. They decide where it is
measured and how much approximation the product can tolerate.

## The Shape Of The Limit

Fixed windows answer:

```text
how many arrived in this named bucket of time?
```

Token buckets answer:

```text
has this stream spent more burst credit than time could refill?
```

Shapers answer:

```text
can I make this stream legal by making it wait?
```

Those are not interchangeable. The bucket is useful because it has a clock. It
turns "too many requests" from a mood into an auditable arrival curve.

[^rfc2697]: Juha Heinanen and Roch Guerin, [RFC 2697, "A Single Rate Three Color Marker"](https://datatracker.ietf.org/doc/html/rfc2697), September 1999. The metering section specifies token buckets with a committed information rate and burst sizes, initially full and decremented by packet size.

[^rfc2698]: Juha Heinanen and Roch Guerin, [RFC 2698, "A Two Rate Three Color Marker"](https://www.rfc-editor.org/rfc/rfc2698), September 1999. The two-rate marker uses peak and committed information rates with associated burst sizes.

[^rfc6585]: Mark Nottingham and Roy Fielding, [RFC 6585, "Additional HTTP Status Codes"](https://datatracker.ietf.org/doc/html/rfc6585), April 2012. Section 4 defines `429 Too Many Requests`, permits `Retry-After`, and leaves user identification and counting policy to the server.

[^ratelimit-draft]: Roberto Polli, Maximilian Sieder, and Alex Martinez, [draft-ietf-httpapi-ratelimit-headers-11, "RateLimit header fields for HTTP"](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers), active Internet-Draft as of June 18, 2026. The draft defines `RateLimit-Policy` and `RateLimit` fields and explicitly leaves throttling algorithms out of scope.
