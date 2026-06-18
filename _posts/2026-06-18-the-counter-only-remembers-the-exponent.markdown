---
layout: post
title: "The Counter Only Remembers the Exponent"
description: "Morris approximate counting trades exact increments for a tiny logarithmic register, with an unbiased estimator and a variance bill you can compute."
date: 2026-06-18 09:00:00 -0400
categories: computer-science
series: streaming-algorithms
tags: [morris-counter, approximate-counting, streaming-algorithms, randomized-algorithms, probabilistic-data-structures, sketches]
excerpt: "A Morris counter does not store the count. It stores a stochastic exponent whose decoded value is unbiased, while the base controls the exchange rate between range and relative error."
---

An exact counter is boring in the best possible way. Every event adds one. The
stored integer is the answer.

The boring version has a sharp memory cliff. An 8-bit counter stops at 255. If
you need many counters and only have bytes, the obvious repair is to give every
counter more bytes. Robert Morris's 1978 note starts from exactly that kind of
machine constraint: many event counters, byte-sized storage, and no room for
16-bit counters.[^morris]

Morris's trick is to stop storing the count. Store something closer to its
logarithm, and increment that stored value only sometimes.

For a base $$b > 1$$, keep an integer register $$X$$. On each event:

```text
with probability b^(-X): X <- X + 1
otherwise:               X stays fixed
```

Decode the register as:

$$
\hat n(X) = \frac{b^X - 1}{b - 1}.
$$

When $$X=0$$, the estimate is 0. When $$X=1$$, the estimate is 1. Later, the
steps get wider. The counter has become a staircase with random landing times.

The surprising part is not that this compresses the count. The surprising part
is that the decoded value is unbiased:

$$
\mathbb{E}\left[\hat n(X_N)\right] = N.
$$

The counter forgot the exact path, but in expectation it kept the total.

## The One-Line Martingale

Suppose the register currently has value $$X$$. Define

$$
Y = \frac{b^X - 1}{b - 1}.
$$

After the next event, $$X$$ increments with probability $$b^{-X}$$. The expected
next decoded value is:

$$
\begin{aligned}
\mathbb{E}[Y' \mid X]
&= (1 - b^{-X})\frac{b^X - 1}{b - 1}
 + b^{-X}\frac{b^{X+1} - 1}{b - 1} \\
&= \frac{b^X - 1}{b - 1} + 1 \\
&= Y + 1.
\end{aligned}
$$

That is the whole conservation law. Each real event adds one unit to the
expected decoded estimate. Starting from zero, after $$N$$ events the decoded
estimate has expectation $$N$$.

Morris used a parameter $$a$$ rather than the base directly:

$$
b = 1 + \frac{1}{a},
\qquad
\hat n(X) = a\left(\left(1 + \frac{1}{a}\right)^X - 1\right).
$$

This version has variance:

$$
\operatorname{Var}(\hat n) = \frac{N(N-1)}{2a}.
$$

So for large $$N$$, the relative standard deviation is approximately:

$$
\frac{\sqrt{\operatorname{Var}(\hat n)}}{N}
\approx \frac{1}{\sqrt{2a}}.
$$

That relative-error scale is almost independent of the count. It is paid for
with range. In a fixed-width register, larger $$a$$ means a base closer to one,
smaller jumps, lower variance, and a smaller maximum decodable count.

Morris's example used 8-bit counters with $$a=30$$. The largest decodable count
is about:

$$
30\left(\left(1 + \frac{1}{30}\right)^{255} - 1\right)
\approx 1.28 \times 10^5.
$$

His paper reports the same order of magnitude, "about 130,000", with a relative
error around a quarter at 95% confidence under the normal approximation.[^morris]

## The Lab

The lab below simulates Morris counters directly. It uses a geometric waiting
time for the next successful register increment, which is equivalent to
processing events one at a time but much faster when the register is already
large.

The controls expose the main engineering tradeoffs:

- **true events** is the real stream length;
- **precision a** is Morris's parameter;
- **register bits** fixes the largest stored exponent;
- **trials** repeats the experiment to show the sampling distribution; and
- **replicas** averages independent counters, lowering variance by the usual
  factor of the number of replicas.

<style>
  .morris-counter-lab {
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

  .morris-counter-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .morris-counter-lab label,
  .morris-counter-lab__metric span,
  .morris-counter-lab__note,
  .morris-counter-lab__legend {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .morris-counter-lab label {
    display: grid;
    font-weight: 650;
    gap: 0.35rem;
    min-width: 0;
  }

  .morris-counter-lab input {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .morris-counter-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .morris-counter-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    margin: 0.4rem 0 0.8rem;
  }

  .morris-counter-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .morris-counter-lab__metric--warn {
    background: #fffbeb;
    border-color: #fde68a;
  }

  .morris-counter-lab__metric span {
    display: block;
  }

  .morris-counter-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .morris-counter-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .morris-counter-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .morris-counter-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .morris-counter-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .morris-counter-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 680px) {
    .morris-counter-lab {
      padding: 0.8rem;
    }

    .morris-counter-lab__controls,
    .morris-counter-lab__metrics {
      grid-template-columns: 1fr;
    }

    .morris-counter-lab canvas {
      height: 1120px;
    }
  }
</style>

<div class="morris-counter-lab" data-morris-counter-lab>
  <div class="morris-counter-lab__controls">
    <label>
      True events <output data-output="events">80,000</output>
      <input type="range" min="1000" max="200000" step="1000" value="80000" data-param="events" aria-label="True event count">
    </label>
    <label>
      Precision a <output data-output="precision">30</output>
      <input type="range" min="4" max="120" step="1" value="30" data-param="precision" aria-label="Morris precision parameter a">
    </label>
    <label>
      Register bits <output data-output="bits">8</output>
      <input type="range" min="4" max="12" step="1" value="8" data-param="bits" aria-label="Register bits">
    </label>
    <label>
      Trials <output data-output="trials">900</output>
      <input type="range" min="200" max="2500" step="100" value="900" data-param="trials" aria-label="Monte Carlo trials">
    </label>
    <label>
      Replicas <output data-output="replicas">1</output>
      <input type="range" min="1" max="16" step="1" value="1" data-param="replicas" aria-label="Independent counters averaged">
    </label>
    <label>
      Seed <output data-output="seed">53</output>
      <input type="range" min="1" max="9999" step="1" value="53" data-param="seed" aria-label="Deterministic random seed">
    </label>
  </div>
  <div class="morris-counter-lab__metrics" data-metrics></div>
  <canvas data-canvas width="980" height="760" aria-label="Morris approximate counting lab showing a stochastic register staircase, error distribution, range-accuracy tradeoff, and register decoding curve"></canvas>
  <div class="morris-counter-lab__legend">
    <span><i style="background:#334155"></i> exact count</span>
    <span><i style="background:#0f766e"></i> Morris estimate</span>
    <span><i style="background:#2563eb"></i> theory</span>
    <span><i style="background:#b45309"></i> selected setting</span>
  </div>
  <p class="morris-counter-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/morris-counter-lab.js?v=20260618c' | relative_url }}"></script>

The artifact includes exact checks for small counts and seeded Monte Carlo
checks for larger counts: 10 audit cases and 24 named checks.

```bash
node - <<'NODE'
const lab = require("./assets/js/morris-counter-lab.js");
const EXPECTED_EXACT_ROWS = 6;
const EXPECTED_SCENARIO_ROWS = 4;
const EXPECTED_ROWS = 10;
const EXPECTED_CHECKS = 24;
const EXPECTED_EXACT_EVENTS = [0, 1, 2, 8, 35, 60];
const EXPECTED_SCENARIO_EVENTS = [1000, 40000, 80000, 160000];
const EXPECTED_EXACT_CHECK_NAMES = [
  "exact expectation equals count",
  "exact variance matches formula"
];
const EXPECTED_SCENARIO_CHECK_NAMES = [
  "empirical mean is inside standard-error envelope",
  "saturation is either absent or explicitly near capacity",
  "seeded replay is deterministic"
];
const EXPECTED_TOTALS = {
  exactRows: EXPECTED_EXACT_ROWS,
  scenarioRows: EXPECTED_SCENARIO_ROWS,
  passed: EXPECTED_ROWS,
  total: EXPECTED_ROWS,
  passedChecks: EXPECTED_CHECKS,
  totalChecks: EXPECTED_CHECKS
};
const EXPECTED_EXACT_SHAPE = [
  "0:meanOk=true:varianceOk=true:checks=2/2",
  "1:meanOk=true:varianceOk=true:checks=2/2",
  "2:meanOk=true:varianceOk=true:checks=2/2",
  "8:meanOk=true:varianceOk=true:checks=2/2",
  "35:meanOk=true:varianceOk=true:checks=2/2",
  "60:meanOk=true:varianceOk=true:checks=2/2"
];
const EXPECTED_SCENARIO_SHAPE = [
  "80000:theoretical=80000:observed=80174.089:saturated=0:deterministic=true:meanOk=true:noBadSaturation=true:checks=3/3",
  "1000:theoretical=1000:observed=996.258:saturated=0:deterministic=true:meanOk=true:noBadSaturation=true:checks=3/3",
  "40000:theoretical=40000:observed=40013.436:saturated=0:deterministic=true:meanOk=true:noBadSaturation=true:checks=3/3",
  "160000:theoretical=160000:observed=159830.740:saturated=0:deterministic=true:meanOk=true:noBadSaturation=true:checks=3/3"
];
const EXPECTED_CHECK_SHAPE = [
  "exact:0:exact expectation equals count:true",
  "exact:0:exact variance matches formula:true",
  "exact:1:exact expectation equals count:true",
  "exact:1:exact variance matches formula:true",
  "exact:2:exact expectation equals count:true",
  "exact:2:exact variance matches formula:true",
  "exact:8:exact expectation equals count:true",
  "exact:8:exact variance matches formula:true",
  "exact:35:exact expectation equals count:true",
  "exact:35:exact variance matches formula:true",
  "exact:60:exact expectation equals count:true",
  "exact:60:exact variance matches formula:true",
  "scenario:80000:seeded replay is deterministic:true",
  "scenario:80000:empirical mean is inside standard-error envelope:true",
  "scenario:80000:saturation is either absent or explicitly near capacity:true",
  "scenario:1000:seeded replay is deterministic:true",
  "scenario:1000:empirical mean is inside standard-error envelope:true",
  "scenario:1000:saturation is either absent or explicitly near capacity:true",
  "scenario:40000:seeded replay is deterministic:true",
  "scenario:40000:empirical mean is inside standard-error envelope:true",
  "scenario:40000:saturation is either absent or explicitly near capacity:true",
  "scenario:160000:seeded replay is deterministic:true",
  "scenario:160000:empirical mean is inside standard-error envelope:true",
  "scenario:160000:saturation is either absent or explicitly near capacity:true"
];

function sameList(actual, expected) {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function exactShape(row) {
  return `${row.events}:meanOk=${row.meanOk}:varianceOk=${row.varianceOk}:` +
    `checks=${row.passedChecks}/${row.totalChecks}`;
}

function scenarioShape(row) {
  return `${row.events}:theoretical=${row.theoreticalMean}:` +
    `observed=${row.observedMean.toFixed(3)}:saturated=${row.saturatedTrials}:` +
    `deterministic=${row.deterministic}:meanOk=${row.meanOk}:` +
    `noBadSaturation=${row.noBadSaturation}:` +
    `checks=${row.passedChecks}/${row.totalChecks}`;
}

function checkShape(row, kind) {
  return row.checks.map((check) => `${kind}:${row.events}:${check.name}:${check.passed}`);
}

const audit = lab.auditMorrisCounterLab();
console.table(audit.exact.map((row) => ({
  events: row.events,
  meanOk: row.meanOk,
  varianceOk: row.varianceOk,
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
console.table(audit.scenarios.map((row) => ({
  events: row.events,
  theoretical: row.theoreticalMean,
  observed: row.observedMean.toFixed(1),
  saturatedTrials: row.saturatedTrials,
  deterministic: row.deterministic,
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
const auditShape = {
  totals: {
    exactRows: audit.exact.length,
    scenarioRows: audit.scenarios.length,
    passed: audit.passed,
    total: audit.total,
    passedChecks: audit.passedChecks,
    totalChecks: audit.totalChecks
  },
  exactCheckNames: Array.from(new Set(audit.exact.flatMap(
    (row) => row.checks.map((check) => check.name)
  ))).sort(),
  exactEvents: audit.exact.map((row) => row.events).sort((a, b) => a - b),
  exactShape: audit.exact.map(exactShape),
  scenarioCheckNames: Array.from(new Set(audit.scenarios.flatMap(
    (row) => row.checks.map((check) => check.name)
  ))).sort(),
  scenarioEvents: audit.scenarios.map((row) => row.events).sort((a, b) => a - b),
  scenarioShape: audit.scenarios.map(scenarioShape),
  checkShape: audit.exact.flatMap((row) => checkShape(row, "exact"))
    .concat(audit.scenarios.flatMap((row) => checkShape(row, "scenario")))
};
const shapeErrors = [
  sameJson(auditShape.totals, EXPECTED_TOTALS) ? null : "totals",
  sameJson(auditShape.exactEvents, EXPECTED_EXACT_EVENTS) ? null : "exactEvents",
  sameJson(auditShape.scenarioEvents, EXPECTED_SCENARIO_EVENTS) ? null : "scenarioEvents",
  sameJson(auditShape.exactCheckNames, EXPECTED_EXACT_CHECK_NAMES) ? null : "exactCheckNames",
  sameJson(auditShape.scenarioCheckNames, EXPECTED_SCENARIO_CHECK_NAMES)
    ? null
    : "scenarioCheckNames",
  sameList(auditShape.exactShape, EXPECTED_EXACT_SHAPE) ? null : "exactShape",
  sameList(auditShape.scenarioShape, EXPECTED_SCENARIO_SHAPE) ? null : "scenarioShape",
  sameList(auditShape.checkShape, EXPECTED_CHECK_SHAPE) ? null : "checkShape"
].filter(Boolean);
if (shapeErrors.length) {
  throw new Error(
    `audit shape drifted in ${shapeErrors.join(", ")}:\n` +
    JSON.stringify(auditShape, null, 2)
  );
}

const failedExactCases = audit.exact.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const failedScenarioCases = audit.scenarios.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (!audit.ok || failedExactCases.length || failedScenarioCases.length ||
    audit.passed !== audit.total ||
    audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    failures: audit.failures,
    failedExactCases,
    failedScenarioCases,
    shapeErrors,
    auditShape
  }, null, 2));
}
console.log(
  `${audit.passed}/${audit.total} audit cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`
);
NODE
```

Those named checks verify:

- the dynamic-programmed expectation matches the true count for small $$N$$;
- the dynamic-programmed variance matches $$N(N-1)/(2a)$$;
- the jump simulation is deterministic under a fixed seed;
- empirical means land within a standard-error envelope around the true count;
  and
- register saturation is flagged rather than silently folded into the
  unbiasedness claim.

## The Register Has a Ceiling

The formula is unbiased only before the register saturates. If the register
hits its maximum value, the implementation cannot keep taking logarithmic
steps. It clips.

That is not a theoretical nuisance. It is the systems bargain.

For $$r$$ register bits, the largest stored value is $$2^r - 1$$. With Morris's
parameter $$a$$, the largest decoded count is:

$$
n_{\max} = a\left(\left(1 + \frac{1}{a}\right)^{2^r - 1} - 1\right).
$$

For fixed $$r$$:

- lowering $$a$$ increases the range but increases relative noise;
- raising $$a$$ lowers relative noise but shortens the range; and
- averaging independent counters lowers noise but spends multiple registers.

This is why the lab has both a "max decoded" metric and a "saturated trials"
metric. A run can look stable because the counter stopped moving. That is not a
successful approximation.

## A Tiny Counter Is Not a Tiny Truth

Morris's counter is sometimes described as using $$O(\log \log N)$$ bits. That
is the memory headline, and it is real: the register value tracks a logarithm of
the count, so the number of bits needed to store that register grows like the
logarithm of a logarithm.[^flajolet]

The headline hides the variance bill.

For the base-2 version, where $$a=1$$,

$$
\operatorname{Var}(\hat n) = \frac{N(N-1)}{2}.
$$

The relative standard deviation is about 70%. That is not a dashboard counter.
It is a tiny, unbiased, very noisy sketch.

The parameterized version matters because it lets a system decide how much of
that noise to buy down. In the lab default, $$a=30$$ gives a theoretical
relative standard deviation near 13%. Averaging four independent counters cuts
that in half, but uses four registers. Raising $$a$$ also lowers variance, but
the 8-bit range falls quickly.

Nelson and Yu's later work is useful perspective here: approximate counting is
not just a historical curiosity but a clean problem about the best possible
memory/error/failure-probability tradeoff.[^nelson-yu] One way to improve
accuracy is to average many Morris counters; another is to change the base.
Those choices can have different space consequences even when they look similar
from the variance formula alone.

## Where This Belongs

A Morris counter is a good fit when:

- many counters are needed;
- each counter only needs approximate statistical weight;
- relative error is acceptable;
- the maximum representable count has been budgeted; and
- the downstream consumer understands that the estimate is noisy.

It is a poor fit when:

- exact thresholds matter;
- low counts need exact treatment beyond the first event;
- saturation would be operationally invisible;
- adversarial manipulation of randomized counters is in scope; or
- the system needs to subtract, merge, or audit individual event identities.

The counter is elegant because it does one thing cleanly:

```text
spend randomness so a small exponent can stand in for a large count
```

That is not the same as remembering the count. It is remembering just enough of
the logarithm that the expectation comes out right.

[^morris]: Robert Morris, ["Counting Large Numbers of Events in Small Registers"](https://graphics.stanford.edu/courses/cs321/Private/Readings/p840-morris.pdf), *Communications of the ACM* 21(10), 1978. Morris motivates the problem with byte-sized counters, gives the randomized update rule, and analyzes the parameterized version with 8-bit counters counting roughly 130,000 events.

[^flajolet]: Philippe Flajolet, ["Approximate Counting: A Detailed Analysis"](https://algo.inria.fr/flajolet/Publications/Flajolet85c.pdf), *BIT* 25, 113-134, 1985. Flajolet gives a detailed distributional analysis and frames approximate counting as maintaining large counts in small counters; Springer lists the DOI as [10.1007/BF01934993](https://link.springer.com/article/10.1007/BF01934993).

[^nelson-yu]: Jelani Nelson and Huacheng Yu, ["Optimal Bounds for Approximate Counting"](https://people.eecs.berkeley.edu/~minilek/publications/papers/approx_count.pdf), PODS 2022. The paper reviews the Morris counter, including the unbiased estimator and variance for a parameterized base, before proving modern upper and lower bounds.
