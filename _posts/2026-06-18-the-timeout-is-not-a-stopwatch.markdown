---
layout: post
title: "The Timeout Is Not a Stopwatch"
description: "TCP's retransmission timeout is a guarded suspicion about silence: estimate the path, price the variance, and refuse ACK samples whose origin is ambiguous."
date: 2026-06-18 00:52:00 -0400
categories: computer-science
tags: [tcp, retransmission-timeout, rtt-estimation, karn-algorithm, networking, control-systems]
excerpt: "A TCP sender does not know whether a late ACK came from the original packet or the retransmission. Karn's algorithm turns that ambiguity into a rule: back off, but do not learn from contaminated evidence."
---

A timeout looks like a clock.

It is more like a suspicion.

When TCP sends data and hears nothing, silence has two possible meanings:

```text
the packet or ACK was lost
the path is merely slower than the sender expected
```

The sender has to act before it can know which world it is in. Retransmit too
late and real loss stalls the connection. Retransmit too early and the network
does duplicate work precisely when delay may already be high.

That is why TCP's retransmission timeout is not just "twice the last ping." It
is a small estimator with a courtroom rule about evidence.

## The Timer Has Two Jobs

RFC 6298 codifies TCP's retransmission timer algorithm. The sender maintains a
smoothed RTT, `SRTT`, and a round-trip variation estimate, `RTTVAR`; the timeout
is then shaped as:

$$
\mathrm{RTO} = \mathrm{SRTT} + \max(G, 4\cdot\mathrm{RTTVAR}),
$$

where $$G$$ is the clock granularity.[^rfc6298-basic]

That formula says the timer is not only a mean. It is:

```text
center estimate + uncertainty cushion
```

The update is deliberately slow:

$$
\mathrm{RTTVAR} \leftarrow {3\over4}\mathrm{RTTVAR}
  + {1\over4}\lvert \mathrm{SRTT} - R' \rvert
$$

$$
\mathrm{SRTT} \leftarrow {7\over8}\mathrm{SRTT}
  + {1\over8}R'.
$$

Jacobson and Karels were explicit about why the variation term matters. They
criticized the older mean-only style of retransmit timer because RTT variation
rises quickly under load; a fixed multiplier around the mean can fire while
packets are only delayed, which wastes bandwidth on duplicates.[^jacobson]
Their appendix gives the cheap mean-deviation estimator that became the
ancestor of the `SRTT + 4*RTTVAR` shape.[^jacobson-appendix]

So the first job of the timeout is statistical:

```text
do not confuse a noisy path with a lost packet
```

The second job is evidential:

```text
do not update the estimate with a sample whose packet identity is unknown
```

## The ACK After A Retransmission Is Ambiguous

Suppose the sender transmits a segment at time `0` with `RTO = 1000 ms`.

The actual path RTT jumps to `1430 ms`, so the sender times out at `1000 ms` and
retransmits. An ACK arrives at `1430 ms`.

What was the RTT sample?

```text
1430 ms if the ACK belongs to the original segment
430 ms  if the ACK belongs to the retransmission
```

Both explanations can fit the local trace. Without a timestamp that identifies
which transmission the ACK is answering, the sample is contaminated. Karn and
Partridge's rule is to ignore RTT measurements for packets that were
retransmitted, while keeping the backed-off timer for later packets so the
sender can eventually collect an uncontaminated sample.[^karn]

RFC 6298 makes that rule normative: TCP must use Karn's algorithm for RTT
samples, and must not sample segments that were retransmitted unless the TCP
timestamp option removes the ambiguity.[^rfc6298-karn]

This is the subtle part. Ignoring the sample alone is not enough. If the sender
kept the old short timeout after a sudden path-delay increase, every next packet
could time out before its ACK arrived, so every next sample would also be
ambiguous. The backoff is what creates enough waiting room for a clean sample to
exist.

That gives the operational shape:

```text
timeout -> retransmit -> double RTO -> ignore ambiguous ACK -> learn from the next clean ACK
```

RFC 6298's timer-management section says the sender retransmits the earliest
unacknowledged segment when the timer expires and doubles the RTO before
restarting the timer.[^rfc6298-backoff]

## Lab: Three Clocks Hear The Same ACKs

The lab below is a deterministic stop-and-wait model. It is not a full TCP
implementation: there is no congestion window, byte sequence arithmetic,
receiver window, SACK scoreboard, delayed ACK policy, fast retransmit, pacing,
or timestamp option. It isolates one loop:

```text
choose RTO
wait for ACK or timeout
decide whether the ACK is a valid RTT sample
update the next RTO
```

The three clocks are:

1. **RFC 6298 + Karn:** mean plus variation, exponential backoff, and no RTT
   sample from retransmitted packets.
2. **Sample latest send:** same mean/variation formula, but it accepts the
   time since the latest retransmission as if the ACK were unambiguous.
3. **Mean-only clock:** a smoothed RTT with `RTO = 2*SRTT`, accepting ambiguous
   ACKs. This is not RFC 793 exactly; it is a compact proxy for the mistake of
   leaving path variation out of the timer.

With the default `route step` scenario, the first eighteen packets see RTTs
near `185 ms`. Then the route changes and RTT jumps to about `1.43 s` before
settling near `270 ms`. The minimum RTO is left at `1000 ms`, matching RFC
6298's conservative lower bound for computed RTO in this simplified lab.

The measured default run is:

| Clock | Spurious retransmits | Real-loss retransmits | Ambiguous samples accepted | Ambiguous samples ignored | Final RTO |
| --- | ---: | ---: | ---: | ---: | ---: |
| RFC 6298 + Karn | 1 | 0 | 0 | 1 | 1000 ms |
| Sample latest send | 21 | 0 | 21 | 0 | 1000 ms |
| Mean-only clock | 5 | 0 | 5 | 0 | 1000 ms |

The elapsed stop-and-wait completion time is the same in this toy because the
receiver eventually ACKs the original packet in the spurious-timeout cases. The
wasted transmissions are not the same. The latest-send clock repeatedly observes
roughly `430 ms` after retransmitting at `1000 ms`, treats that as a true RTT
sample, and keeps the timer too short for a `1.43 s` path. It is learning from
the wrong event.

<style>
  .rto-lab {
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
  .rto-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    margin-bottom: 1rem;
  }
  .rto-lab__controls label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .rto-lab__controls input,
  .rto-lab__controls select {
    accent-color: #0f766e;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.35rem 0.45rem;
  }
  .rto-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .rto-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(125px, 1fr));
    margin: 0 0 1rem;
  }
  .rto-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
  }
  .rto-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .rto-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .rto-lab__metric--good strong {
    color: #0f766e;
  }
  .rto-lab__metric--bad strong {
    color: #be123c;
  }
  .rto-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .rto-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    margin-top: 0.75rem;
  }
  .rto-lab__legend span {
    align-items: center;
    display: inline-flex;
    font-size: 0.8rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .rto-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }
  .rto-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    margin: 0.75rem 0 0;
  }
  @media (max-width: 720px) {
    .rto-lab {
      padding: 0.75rem;
    }
    .rto-lab__controls,
    .rto-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="rto-lab" data-rto-estimator-lab>
  <div class="rto-lab__controls">
    <label>
      Scenario
      <select data-param="scenario" aria-label="RTT scenario">
        <option value="route" selected>Route step</option>
        <option value="bursty">Bursty queue</option>
        <option value="radio">Lossy radio</option>
      </select>
    </label>
    <label>
      Focus clock
      <select data-param="focus" aria-label="Focused timer algorithm">
        <option value="rfc" selected>RFC 6298 + Karn</option>
        <option value="recent">Sample latest send</option>
        <option value="mean">Mean-only clock</option>
      </select>
    </label>
    <label>
      Minimum RTO <output data-value="minRto">1000 ms</output>
      <input type="range" data-param="minRto" min="200" max="1600" step="50" value="1000" aria-label="Minimum retransmission timeout">
    </label>
    <label>
      RTT jitter <output data-value="jitter">65%</output>
      <input type="range" data-param="jitter" min="0" max="140" step="5" value="65" aria-label="RTT jitter">
    </label>
    <label>
      Extra loss <output data-value="extraLoss">0%</output>
      <input type="range" data-param="extraLoss" min="0" max="18" step="1" value="0" aria-label="Extra deterministic loss">
    </label>
  </div>
  <div class="rto-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="720" aria-label="TCP retransmission timeout estimator lab comparing RFC 6298 Karn sampling, ambiguous latest-send sampling, and mean-only RTO under changing RTTs"></canvas>
  <div class="rto-lab__legend">
    <span><i style="background:#2563eb"></i>True RTT</span>
    <span><i style="background:#0f766e"></i>RFC/Karn RTO</span>
    <span><i style="background:#be123c"></i>Latest-send RTO</span>
    <span><i style="background:#b45309"></i>Mean-only RTO</span>
    <span><i style="background:#6d28d9"></i>Real loss</span>
  </div>
  <p class="rto-lab__note">
    Deterministic stop-and-wait model. It intentionally excludes congestion
    control, SACK, timestamps, and receiver-window behavior so the RTT-sampling
    rule is visible.
  </p>
</div>

<script defer src="{{ '/assets/js/rto-estimator-lab.js?v=20260618c' | relative_url }}"></script>

## What The Bad Clock Learns

The route-step scenario is a compact version of the failure Karn and Partridge
were trying to avoid.

There are three local stories for a late ACK:

| Local story | Sample used | Why it can fail |
| --- | ---: | --- |
| "ACK answered the original packet." | time since first send | Wrong if the original was lost and the ACK answered a retransmission. |
| "ACK answered the retransmission." | time since latest send | Wrong if the original was merely delayed. |
| "ACK is ambiguous." | no RTT sample | Throws away data, but keeps the estimator uncontaminated. |

Karn's rule chooses the third row. It sounds wasteful until the route changes.
Then it is exactly the rule that prevents a short old RTO from teaching itself
to remain short.

The latest-send clock is attractive because it seems to use more data. In the
default run it uses twenty-one more samples than the RFC/Karn clock. Those
samples are not free evidence. They are biased by the retransmission decision
itself:

```text
measured_sample = ACK_time - retransmission_time
```

When the timeout fired too early, the "sample" is partly a measurement of the
sender's mistake.

## Audit Table

I ran the simulator's exported audit grid before publishing the numbers. The
checks verify finite outputs, event accounting, retransmission accounting, and
the central evidence rule: RFC/Karn ignores exactly the ambiguous samples its
timer created, while the comparison clocks accept them.

| Scenario | Min RTO | Jitter | Extra loss | RFC spurious | Latest-send spurious | Mean-only spurious | RFC ignored samples |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| route step | 1000 ms | 65% | 0% | 1 | 21 | 5 | 1 |
| route step | 500 ms | 70% | 0% | 2 | 21 | 5 | 2 |
| bursty queue | 600 ms | 85% | 0% | 3 | 15 | 10 | 3 |
| lossy radio | 1000 ms | 90% | 0% | 0 | 0 | 0 | 5 |
| lossy radio | 700 ms | 110% | 6% | 1 | 2 | 0 | 9 |

The compact reproduction check is:

```js
const lab = require("./assets/js/rto-estimator-lab.js");
const EXPECTED_TOTALS = {
  rows: 5,
  scenarios: 3,
  passed: 5,
  total: 5,
  passedChecks: 92,
  totalChecks: 92
};
const EXPECTED_BY_SCENARIO = [
  "bursty:1:1:3:15:10:18/18",
  "radio:2:2:1:2:0:36/36",
  "route:2:2:3:42:10:38/38"
];
const EXPECTED_CASE_ROWS = [
  "route:1000:65:0:1:21:5:1:21:5:19/19:true",
  "route:500:70:0:2:21:5:2:21:5:19/19:true",
  "bursty:600:85:0:3:15:10:3:15:10:18/18:true",
  "radio:1000:90:0:0:0:0:5:5:5:18/18:true",
  "radio:700:110:6:1:2:0:9:10:8:18/18:true"
];
const EXPECTED_BASE_CHECKS = [
  { name: "rfc row count", ok: true },
  { name: "rfc finite elapsed", ok: true },
  { name: "rfc finite RTO", ok: true },
  { name: "rfc event accounting", ok: true },
  { name: "rfc retransmission accounting", ok: true },
  { name: "recent row count", ok: true },
  { name: "recent finite elapsed", ok: true },
  { name: "recent finite RTO", ok: true },
  { name: "recent event accounting", ok: true },
  { name: "recent retransmission accounting", ok: true },
  { name: "mean row count", ok: true },
  { name: "mean finite elapsed", ok: true },
  { name: "mean finite RTO", ok: true },
  { name: "mean event accounting", ok: true },
  { name: "mean retransmission accounting", ok: true },
  { name: "RFC ignores ambiguous samples", ok: true },
  { name: "recent sampler accepts ambiguous samples", ok: true },
  { name: "mean-only accepts ambiguous samples", ok: true }
];
const EXPECTED_ROUTE_CHECK = { name: "route step punishes recent sampler", ok: true };

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function rowDrifts(actualRows, expectedRows) {
  const drifts = [];
  const rows = Math.max(actualRows.length, expectedRows.length);
  for (let index = 0; index < rows; index += 1) {
    const actual = index < actualRows.length ? actualRows[index] : null;
    const expected = index < expectedRows.length ? expectedRows[index] : null;
    if (!sameJson(actual, expected)) {
      drifts.push({ index, actual, expected });
    }
  }
  return drifts;
}

const audit = lab.auditGrid();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const totals = {
  rows: audit.cases.length,
  scenarios: audit.byScenario.length,
  passed: audit.passed,
  total: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks
};
const byScenarioRows = audit.byScenario.map((row) => [
  row.scenario,
  row.cases,
  row.passed,
  row.rfcSpurious,
  row.recentSpurious,
  row.meanSpurious,
  `${row.passedChecks}/${row.totalChecks}`
].join(":"));
const caseRows = audit.cases.map((row) => [
  row.params.scenario,
  row.params.minRto,
  row.params.jitter,
  row.params.extraLoss,
  row.rfcSpurious,
  row.recentSpurious,
  row.meanSpurious,
  row.rfcIgnored,
  row.recentAmbiguousAccepted,
  row.meanAmbiguousAccepted,
  `${row.passedChecks}/${row.totalChecks}`,
  row.passed
].join(":"));
const checkRows = audit.cases.map((row) => ({
  case: `${row.params.scenario}/${row.params.minRto}/${row.params.jitter}/${row.params.extraLoss}`,
  checks: row.checks.map((check) => ({
    name: check.name,
    ok: check.ok
  }))
}));
const expectedCheckRows = EXPECTED_CASE_ROWS.map((row) => {
  const parts = row.split(":");
  return {
    case: `${parts[0]}/${parts[1]}/${parts[2]}/${parts[3]}`,
    checks: parts[0] === "route"
      ? EXPECTED_BASE_CHECKS.concat([EXPECTED_ROUTE_CHECK])
      : EXPECTED_BASE_CHECKS
  };
});
const byScenarioDrifts = rowDrifts(byScenarioRows, EXPECTED_BY_SCENARIO);
const caseRowDrifts = rowDrifts(caseRows, EXPECTED_CASE_ROWS);
const checkRowDrifts = rowDrifts(checkRows, expectedCheckRows);
const driftShape = {
  totals,
  byScenarioDrifts,
  caseRowDrifts,
  checkRowDrifts
};
const shapeErrors = [
  sameJson(totals, EXPECTED_TOTALS) ? null : "totals",
  byScenarioDrifts.length === 0 ? null : "byScenarioRows",
  caseRowDrifts.length === 0 ? null : "caseRows",
  checkRowDrifts.length === 0 ? null : "checkRows"
].filter(Boolean);
console.table(audit.byScenario);
if (shapeErrors.length) {
  throw new Error(
    `RTO audit shape drifted in ${shapeErrors.join(", ")}:\n` +
    JSON.stringify(driftShape, null, 2)
  );
}
const summary =
  `${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  failed.length ||
  !audit.ok ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(JSON.stringify({
    failed,
    passed: audit.passed,
    total: audit.total,
    passedChecks: audit.passedChecks,
    totalChecks: audit.totalChecks
  }, null, 2));
}

console.table(audit.cases.map((row) => ({
  scenario: row.params.scenario,
  minRto: row.params.minRto,
  jitter: row.params.jitter,
  extraLoss: row.params.extraLoss,
  rfcSpurious: row.rfcSpurious,
  recentSpurious: row.recentSpurious,
  meanSpurious: row.meanSpurious,
  rfcIgnored: row.rfcIgnored,
  recentAccepted: row.recentAmbiguousAccepted,
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
console.log(summary);
```

The radio rows are a good sanity check. A real lost original segment creates a
necessary retransmission, not a spurious one. Karn still ignores the ACK sample,
because the sender cannot tell from the ordinary cumulative ACK alone which
copy produced the acknowledgment. If TCP timestamps are available, RFC 6298
notes that the ambiguity can be removed.[^rfc6298-karn]

The current grid covers five scenario/parameter rows and 92 named checks. Those
checks include finite-output guards, per-clock event and retransmission
accounting, the Karn evidence rule for ignored ambiguous samples, the comparison
clock rule for accepted ambiguous samples, and the route-step regression that
the latest-send sampler is at least as vulnerable to spurious retransmission as
the RFC/Karn clock.

## The One-Second Floor Is A Policy, Too

The lab exposes the minimum-RTO knob because it is a useful way to see the
control problem. RFC 6298 is conservative: after computing the RTO, values below
one second should be rounded up to one second.[^rfc6298-basic] The document also
states the higher-level rule that TCP may be more conservative but must not be
more aggressive than the specified algorithm allows.[^rfc6298-intro]

That floor matters. Lower it in the lab and every clock becomes more willing to
call delay "loss." Sometimes that is a good product trade-off inside a known
datacenter with timestamps, pacing, loss recovery, and careful measurement.
Sometimes it is a duplicate-packet machine. The number is not merely a constant;
it is an assumption about the path population and the cost of being wrong.

This is one reason modern transport work often separates several mechanisms
that classic TCP had to express through one timeout: packet-number spaces,
selective acknowledgments, timestamped RTT samples, explicit loss-detection
thresholds, pacing, and probe timers. But the old RTO loop remains useful as a
lesson in estimator hygiene.

## Boundaries Of The Model

The lab is intentionally narrower than TCP.

It uses one outstanding packet at a time. Real TCP typically has many segments
in flight, cumulative ACKs, selective acknowledgments, reordering, delayed ACKs,
receiver-window limits, congestion-control state, and fast retransmit before an
RTO fires. Real implementations also have timestamp options, high-resolution
timers, restart behavior after idle periods, SYN-specific rules, and many
guardrails around pathological backoff.

The lab also does not claim an optimal timer. It makes one evidence claim:

```text
an ACK produced after retransmission is not automatically a valid RTT sample
```

If an estimator cannot say which event generated its measurement, a smoother
formula will not rescue it. The measurement itself is not what it says on the
label.

## The Useful Checklist

For a retransmission or retry timer in any distributed system, I would ask:

- What quantity is being estimated: service time, network RTT, queue wait, or
  end-to-end user latency?
- Does the timeout decision change the next measurement?
- Which samples are contaminated by retries, hedges, duplicates, cancellation,
  queue drops, or failover?
- Is variation priced explicitly, or hidden inside a fixed multiplier?
- When the timer fires, does the system back off enough to collect clean
  evidence?
- Is the minimum timeout a measured path assumption or a forgotten constant?

The small TCP lesson generalizes cleanly:

```text
retry logic is part of the measurement system
```

A timer that learns from its own panic will eventually become a panic detector,
not a path estimator.

## Sources

[^rfc6298-intro]: Vern Paxson, Mark Allman, Jerry Chu, and Matt Sargent, ["RFC 6298: Computing TCP's Retransmission Timer"](https://datatracker.ietf.org/doc/html/rfc6298), IETF, 2011. Section 1 codifies the algorithm and states that TCP must not be more aggressive than the specified algorithms allow.

[^rfc6298-basic]: Paxson et al., ["RFC 6298"](https://datatracker.ietf.org/doc/html/rfc6298), Section 2. The section defines `SRTT`, `RTTVAR`, the initial one-second RTO, the `SRTT + max(G, K*RTTVAR)` formula with `K=4`, `alpha=1/8`, `beta=1/4`, and the one-second lower bound for computed RTO.

[^rfc6298-karn]: Paxson et al., ["RFC 6298"](https://datatracker.ietf.org/doc/html/rfc6298), Section 3. It requires Karn's algorithm for RTT samples and excludes samples from retransmitted segments unless timestamps remove the ambiguity.

[^rfc6298-backoff]: Paxson et al., ["RFC 6298"](https://datatracker.ietf.org/doc/html/rfc6298), Section 5. The timer-management algorithm retransmits the earliest unacknowledged segment on expiration and backs off by doubling RTO.

[^jacobson]: Van Jacobson and Michael J. Karels, ["Congestion Avoidance and Control"](https://ee.lbl.gov/papers/congavoid.pdf), SIGCOMM 1988. Section 2 discusses retransmit-timer failures, RTT variation under load, and duplicate retransmissions caused by timers that do not account for variation.

[^jacobson-appendix]: Jacobson and Karels, ["Congestion Avoidance and Control"](https://ee.lbl.gov/papers/congavoid.pdf), Appendix A. The appendix derives a cheap estimator for RTT mean and mean deviation and computes the timeout as mean plus a multiple of deviation.

[^karn]: Phil Karn and Craig Partridge, ["Improving Round-Trip Time Estimates in Reliable Transport Protocols"](https://dl.acm.org/doi/10.1145/55483.55484), SIGCOMM 1987. A readable PDF copy is available from [UNC course materials](https://www.cs.unc.edu/~jasleen/Courses/COMP631/papers/karn-algo.pdf). The paper introduces the retransmission-ambiguity rule and the use of backoff to obtain clean RTT samples after sudden delay changes.
