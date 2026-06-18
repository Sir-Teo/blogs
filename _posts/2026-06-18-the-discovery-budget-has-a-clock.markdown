---
layout: post
title: "The Discovery Budget Has a Clock"
description: "Online false discovery control is not batch FDR with a refresh button. A stream of tests needs thresholds that are chosen before the next p-value arrives."
date: 2026-06-18 05:29:00 -0400
categories: statistics
series: trustworthy-experiments
tags: [online-fdr, false-discovery-rate, multiple-testing, alpha-investing, experiments, statistics, machine-learning]
excerpt: "Batch FDR sorts a closed list. Online FDR spends and earns error budget in time, where late hypotheses cannot borrow thresholds from tomorrow's p-values."
---

A discovery stream has a clock.

That sounds obvious until the p-values arrive. A batch procedure closes the
family, sorts the list, and draws a line. The previous note on
[false discovery rate control]({% post_url 2026-06-14-discoveries-need-a-denominator %})
was about that closed-list geometry: define the family, sort the p-values, and
publish a discovery list whose expected false fraction is controlled.

But many real search systems do not close. A feature store keeps offering
candidate covariates. A monitoring system keeps emitting anomaly tests. A
research backlog keeps producing variants. A quant researcher keeps trying
signals. An evaluation harness keeps adding prompts and slices. The next
hypothesis arrives after the previous decision, and tomorrow's p-value is not
available for today's threshold.

This changes the object. Online FDR is not:

```text
run BH every morning on everything seen so far
```

That can be a useful dashboard, but it is not the same promise. The online
promise is procedural: before seeing p-value $$p_i$$, choose a level
$$\alpha_i$$ from the past, then reject only if

$$
T_i = 1\{p_i \le \alpha_i\}.
$$

The line has to be chosen while the clock is still at $$i-1$$.

## The Time-Stamped Denominator

Let

$$
D(i) = \sum_{j=1}^{i} T_j
$$

be the number of discoveries made by time $$i$$. For a prefix of the stream,
the realized false discovery proportion is still

$$
\operatorname{FDP}(i) =
\begin{cases}
V(i)/D(i), & D(i) > 0, \\
0, & D(i) = 0,
\end{cases}
$$

where $$V(i)$$ counts rejected true nulls. The online target is to control
$$\operatorname{FDR}(i)=\mathbb{E}[\operatorname{FDP}(i)]$$ over time, not
only after a preselected final batch.

The all-null case shows why raw thresholding is not a stream rule. If every
hypothesis is null and the p-values are independent uniform random variables,
then testing $$n$$ times at level $$q$$ gives

$$
\operatorname{FDR}(n)
=
\Pr\{D(n)>0\}
=
1-(1-q)^n.
$$

At $$q=0.10$$ and $$n=260$$, that number is essentially one. In an all-null
stream, any discovery is false, so the false discovery rate becomes the chance
of ever printing a false headline.

The online problem is to keep using the stream without pretending the stream is
a closed batch.

## Spending Is Safe and Hungry

The blunt answer is alpha-spending. Choose nonnegative numbers
$$\gamma_1,\gamma_2,\ldots$$ with

$$
\sum_{i=1}^{\infty} \gamma_i \le 1,
$$

and test at

$$
\alpha_i = q\gamma_i.
$$

For the lab below I use the concrete schedule

$$
\gamma_i = \frac{6}{\pi^2 i^2},
$$

whose infinite sum is one. This makes the total nominal mass no more than
$$q$$. It is conservative and simple. It also has a personality flaw: it
spends by calendar position, not by what the stream is learning. If good
signals arrive late, much of the easy budget has already passed by.

That is the first useful mental model. A static spending rule is a calendar,
not a discovery process.

## LOND Earns Room From Discoveries

Javanmard and Montanari proposed two online procedures, LOND and LORD, for
online control of FDR and marginal FDR.[^jm2015] LOND stands for "levels based
on number of discoveries." It keeps the same summable sequence idea but lets
past discoveries increase future levels.

Choose nonnegative $$\beta_i$$ such that

$$
\sum_{i=1}^{\infty}\beta_i=q.
$$

Then LOND tests hypothesis $$i$$ at

$$
\alpha_i = \beta_i \{D(i-1)+1\}.
$$

The factor $$D(i-1)+1$$ is the clocked denominator. Before any discovery,
LOND behaves like alpha-spending. After discoveries arrive, later tests get
larger levels. A stream that begins with plausible signals earns the right to
look harder later. A stream that begins with noise stays frugal.

This is not a magic p-value amplifier. The guarantee is attached to conditions
on the stream, especially validity of null p-values and assumptions about
independence or dependence. Later work by Javanmard and Montanari studied
generalized alpha-investing rules and online FDR under independence of true-null
p-values from the rest of the sequence, with additional conditions for
dependence.[^jm2016] The original LOND paper also gives a more conservative
adjustment for arbitrary dependence. The lab here uses independent synthetic
p-values, so it is demonstrating the mechanism, not stress-testing every
dependence case.

There is a historical trap in the terminology. Foster and Stine's
alpha-investing is also sequential and also earns testing wealth after
discoveries, but their original guarantee is for marginal FDR, the ratio of
expected false discoveries to expected discoveries, rather than FDR, the
expected ratio.[^foster-stine] Those are not interchangeable promises.

SAFFRON is a later and more powerful adaptive online-FDR algorithm. It also
uses an alpha-wealth view, learns from candidate p-values, and can dominate
earlier LORD-style rules in many settings.[^saffron] I am not implementing
SAFFRON below because this note is about the smallest moving part: the first
time you let the discovery count modify tomorrow's threshold, the budget has
become a clock.

## A Stream You Can Audit

The lab creates a sequence of synthetic one-sided p-values:

- null hypotheses produce independent uniform p-values;
- alternatives produce p-values of the form $$U^s$$, where larger $$s$$ makes
  small p-values more common;
- the signal order can be random, early, late, or bursty;
- the batch BH line is included only as an offline oracle that gets to sort the
  full stream after seeing it.

The four displayed procedures are:

1. raw thresholding at $$p_i < q$$;
2. alpha-spending with $$\beta_i=6q/(\pi^2 i^2)$$;
3. LOND with $$\alpha_i=\beta_i\{D(i-1)+1\}$$;
4. Benjamini-Hochberg on the completed stream as a non-online benchmark.[^bh]

The important comparison is not "which line is always best." The important
comparison is what each line was allowed to know when it made its decision.

<style>
  .online-fdr-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .online-fdr-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .online-fdr-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .online-fdr-lab__controls input,
  .online-fdr-lab__controls select {
    accent-color: #0f766e;
    width: 100%;
  }

  .online-fdr-lab__controls select {
    background: #ffffff;
    border: 1px solid #ccd6df;
    border-radius: 6px;
    box-sizing: border-box;
    color: #172026;
    min-height: 2.15rem;
    padding: 0.25rem 0.45rem;
  }

  .online-fdr-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .online-fdr-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .online-fdr-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.1rem;
    padding: 0.62rem 0.68rem;
  }

  .online-fdr-lab__metric span,
  .online-fdr-lab__legend,
  .online-fdr-lab__note {
    color: #5d6872;
    font-size: 0.78rem;
  }

  .online-fdr-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.04rem;
    line-height: 1.2;
    margin-top: 0.22rem;
  }

  .online-fdr-lab canvas {
    display: block;
    height: 620px;
    max-width: 100%;
    width: 100%;
  }

  .online-fdr-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .online-fdr-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .online-fdr-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .online-fdr-lab__note {
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }

  @media (max-width: 560px) {
    .online-fdr-lab {
      padding: 0.85rem;
    }

    .online-fdr-lab canvas {
      height: 820px;
    }
  }
</style>

<div class="online-fdr-lab" data-online-fdr-lab>
  <div class="online-fdr-lab__controls">
    <label>
      Tests: <output data-value="tests">260</output>
      <input type="range" min="80" max="800" step="20" value="260" data-param="tests">
    </label>
    <label>
      Signal rate: <output data-value="signalRate">12%</output>
      <input type="range" min="0" max="35" step="1" value="12" data-param="signalRate">
    </label>
    <label>
      Signal strength: <output data-value="strength">5.5</output>
      <input type="range" min="15" max="90" step="5" value="55" data-param="strength">
    </label>
    <label>
      Target q: <output data-value="target">10%</output>
      <input type="range" min="1" max="20" step="1" value="10" data-param="target">
    </label>
    <label>
      Order: <output data-value="order">early signals</output>
      <select data-param="order">
        <option value="early" selected>Early signals</option>
        <option value="random">Random order</option>
        <option value="late">Late signals</option>
        <option value="bursty">Bursty signals</option>
      </select>
    </label>
  </div>
  <div class="online-fdr-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="620" aria-label="Online false discovery rate simulator comparing raw thresholding, alpha spending, LOND, and batch Benjamini-Hochberg"></canvas>
  <div class="online-fdr-lab__legend">
    <span><i style="background:#be123c"></i> Raw p&lt;q</span>
    <span><i style="background:#7c3aed"></i> Alpha-spending</span>
    <span><i style="background:#0f766e"></i> LOND</span>
    <span><i style="background:#2563eb"></i> Batch BH oracle</span>
    <span><i style="background:#059669"></i> true signal p-values</span>
  </div>
  <p class="online-fdr-lab__note">
    Deterministic simulation. Each operating summary averages 160 streams at
    the default horizon; larger horizons use 120 streams to keep the page
    responsive. The oracle BH line is not an online rule.
  </p>
</div>

<script defer src="{{ '/assets/js/online-fdr-lab.js?v=20260618c' | relative_url }}"></script>

At the default setting, the stream has 260 tests, about 31 true signals, early
signal ordering, signal strength 5.5, and target $$q=10\%$$. Across 160
deterministic Monte Carlo streams:

- raw thresholding averages 43.4 discoveries with empirical FDR 52.7%;
- alpha-spending averages 6.4 discoveries with empirical FDR 0.3%;
- LOND averages 8.4 discoveries with empirical FDR 0.6%;
- the batch BH oracle averages 13.3 discoveries with empirical FDR 9.4%.

Those numbers are not a theorem. They are the audit trail for this synthetic
world. The theorem-level statement is narrower and stronger: under its
assumptions, LOND chooses each threshold online and controls online FDR. The
simulation shows the operating shape that theorem permits. Raw thresholding is
liberal because it forgets the denominator. Spending is cautious because it
does not earn from discoveries. LOND is still cautious, but it can convert early
discoveries into later testing room. Batch BH is powerful because it has a
privilege the online rules do not: it sees the full future before drawing a
line.

Change the order to "late signals" and the picture changes. LOND cannot spend
early discoveries that have not happened yet. The offline BH oracle is much
less bothered by the order because sorting erases time. That is exactly the
distinction online control is meant to preserve.

Before publishing, I ran the JavaScript lab through its Node API. The default
case passed finite-output checks, threshold-validity checks, the
alpha-spending-is-contained-in-LOND decision invariant, and the summable
$$6/(\pi^2 i^2)$$ schedule check. A 24-case sweep over horizon, signal rate,
signal order, and target $$q$$ passed 104/104 applicable checks: those four
structural invariants in every case, plus an all-null finite-grid FDR guard on
the eight no-signal rows. In the all-null cases, the largest empirical LOND FDR
in that sweep was 3.05%.

You can reproduce that sweep directly:

```js
const lab = require("./assets/js/online-fdr-lab.js");
const EXPECTED_BASE_CHECK_NAMES = [
  "finite outputs",
  "valid thresholds",
  "alpha-spending contained in LOND",
  "gamma mass is summable"
];
const EXPECTED_NULL_CHECK_NAME = "all-null LOND FDR guard";
const EXPECTED_MAX_NULL_LOND_PCT = "3.05";
const EXPECTED_CASE_SHAPE = [
  "160:0:early:5:fdr=37.98/0.26/0.56/4.24:disc=18.49/4.13/5.01/6.76:power=26.2/33.8:nullGuard=true:checks=5/5",
  "160:0:early:10:fdr=51.46/0.31/0.43/7.93:disc=26.24/4.49/5.51/7.96:power=28.8/37.9:nullGuard=true:checks=5/5",
  "160:0:late:5:fdr=37.44/1.51/1.37/3.48:disc=18.17/1.61/1.73/6.52:power=8.9/32.9:nullGuard=true:checks=5/5",
  "160:0:late:10:fdr=51.90/3.19/2.84/7.93:disc=26.95/2.15/2.37/8.07:power=12.0/38.6:nullGuard=true:checks=5/5",
  "160:8:early:5:fdr=48.48/0.80/0.70/5.73:disc=14.71/3.06/3.48/4.36:power=26.5/31.4:nullGuard=not-applicable:checks=4/4",
  "160:8:early:10:fdr=63.32/0.75/0.70/9.11:disc=23.34/3.45/4.04/5.42:power=30.8/36.7:nullGuard=not-applicable:checks=4/4",
  "160:8:late:5:fdr=48.22/3.59/3.39/5.35:disc=14.94/1.33/1.43/4.32:power=10.5/31.1:nullGuard=not-applicable:checks=4/4",
  "160:8:late:10:fdr=62.10/7.63/6.84/10.02:disc=23.14/1.46/1.58/5.43:power=11.1/36.3:nullGuard=not-applicable:checks=4/4",
  "160:18:early:5:fdr=26.78/0.25/0.37/4.17:disc=23.18/5.95/7.62/10.97:power=26.1/36.0:nullGuard=not-applicable:checks=4/4",
  "160:18:early:10:fdr=40.83/0.23/0.25/7.97:disc=32.01/6.35/8.09/13.07:power=27.8/41.1:nullGuard=not-applicable:checks=4/4",
  "160:18:late:5:fdr=28.96/2.35/2.11/3.93:disc=23.98/2.69/3.09/11.18:power=10.4/36.9:nullGuard=not-applicable:checks=4/4",
  "160:18:late:10:fdr=41.30/3.56/3.38/8.94:disc=32.62/3.07/3.56/13.44:power=11.8/41.8:nullGuard=not-applicable:checks=4/4",
  "260:0:early:5:fdr=38.53/1.28/0.83/4.87:disc=29.19/5.76/7.17/10.90:power=23.0/33.3:nullGuard=true:checks=5/5",
  "260:0:early:10:fdr=52.73/0.30/0.63/9.42:disc=43.37/6.42/8.38/13.26:power=26.8/38.4:nullGuard=true:checks=5/5",
  "260:0:late:5:fdr=38.37/2.10/2.10/3.80:disc=29.61/2.39/2.75/10.45:power=8.7/32.2:nullGuard=true:checks=5/5",
  "260:0:late:10:fdr=51.70/3.27/3.05/8.07:disc=43.02/2.63/3.04/13.42:power=9.4/39.5:nullGuard=true:checks=5/5",
  "260:8:early:5:fdr=49.66/0.38/0.62/5.59:disc=24.43/4.04/4.92/6.72:power=23.3/30.0:nullGuard=not-applicable:checks=4/4",
  "260:8:early:10:fdr=63.00/1.51/1.69/8.67:disc=38.10/4.74/5.81/8.24:power=27.1/35.4:nullGuard=not-applicable:checks=4/4",
  "260:8:late:5:fdr=49.38/2.34/2.34/5.24:disc=24.33/1.40/1.56/6.72:power=7.3/30.1:nullGuard=not-applicable:checks=4/4",
  "260:8:late:10:fdr=63.20/3.71/3.62/9.64:disc=37.76/1.89/2.08/8.47:power=9.4/36.0:nullGuard=not-applicable:checks=4/4",
  "260:18:early:5:fdr=28.19/0.00/0.00/4.03:disc=37.66/7.89/10.38/17.33:power=22.1/35.3:nullGuard=not-applicable:checks=4/4",
  "260:18:early:10:fdr=40.47/0.47/0.42/8.08:disc=51.81/9.14/12.23/20.93:power=25.9/40.8:nullGuard=not-applicable:checks=4/4",
  "260:18:late:5:fdr=28.97/1.65/1.34/4.13:disc=38.16/3.57/4.14/17.37:power=8.7/35.4:nullGuard=not-applicable:checks=4/4",
  "260:18:late:10:fdr=40.85/2.45/2.18/9.17:disc=52.11/3.72/4.43/21.66:power=9.2/41.6:nullGuard=not-applicable:checks=4/4"
];

function caseFields(shape) {
  const [tests, signalRate, order, target] = shape.split(":");
  return { tests, signalRate: Number(signalRate), order, target };
}

const EXPECTED_CASES = EXPECTED_CASE_SHAPE.length;
const EXPECTED_NULL_CASES = EXPECTED_CASE_SHAPE.filter(
  (shape) => caseFields(shape).signalRate === 0
).length;
const EXPECTED_CHECK_SHAPE = EXPECTED_CASE_SHAPE.flatMap((shape) => {
  const fields = caseFields(shape);
  const caseId = `${fields.tests}:${fields.signalRate}:${fields.order}:${fields.target}`;
  const names = fields.signalRate === 0
    ? EXPECTED_BASE_CHECK_NAMES.concat([EXPECTED_NULL_CHECK_NAME])
    : EXPECTED_BASE_CHECK_NAMES;
  return names.map((name) => `${caseId}:${name}:true`);
});
const EXPECTED_CHECKS = EXPECTED_CHECK_SHAPE.length;

function sameList(actual, expected) {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function pct(value, digits = 2) {
  return (100 * value).toFixed(digits);
}

function caseShape(row) {
  return `${row.tests}:${row.signalRate}:${row.order}:${row.target}:` +
    `fdr=${pct(row.rawFdr)}/${pct(row.spendFdr)}/${pct(row.londFdr)}/${pct(row.bhFdr)}:` +
    `disc=${row.rawDiscoveries.toFixed(2)}/${row.spendDiscoveries.toFixed(2)}/` +
    `${row.londDiscoveries.toFixed(2)}/${row.bhDiscoveries.toFixed(2)}:` +
    `power=${pct(row.londPower, 1)}/${pct(row.bhPower, 1)}:` +
    `nullGuard=${row.signalRate === 0 ? row.nullLondOk : "not-applicable"}:` +
    `checks=${row.passedChecks}/${row.totalChecks}`;
}

function checkRowsFor(row) {
  const result = lab.evaluate({
    tests: row.tests,
    signalRate: row.signalRate,
    strength: 55,
    target: row.target,
    order: row.order
  });
  const lond = result.summary.find((summaryRow) => summaryRow.key === "lond");
  const nullLondOk =
    row.signalRate !== 0 || lond.fdr <= Math.max(0.18, row.target / 100 * 2.6);
  const checks = [
    ["finite outputs", result.audit.finite],
    ["valid thresholds", result.audit.levelsValid],
    ["alpha-spending contained in LOND", result.audit.spendInsideLond],
    ["gamma mass is summable", result.audit.gammaOk]
  ];
  if (row.signalRate === 0) checks.push([EXPECTED_NULL_CHECK_NAME, nullLondOk]);
  return checks.map(([name, passed]) => ({ name, passed }));
}

const audit = lab.auditOnlineFdrLab();
const shape = {
  cases: audit.cases.map(caseShape),
  checks: audit.cases.flatMap((row) =>
    checkRowsFor(row).map(
      (check) => `${row.tests}:${row.signalRate}:${row.order}:${row.target}:` +
        `${check.name}:${check.passed}`
    )
  ),
  maxNullLondPct: pct(audit.maxNullLond)
};
const shapeErrors = [];
if (!sameList(shape.cases, EXPECTED_CASE_SHAPE)) {
  shapeErrors.push({ name: "cases", actual: shape.cases, expected: EXPECTED_CASE_SHAPE });
}
if (!sameList(shape.checks, EXPECTED_CHECK_SHAPE)) {
  shapeErrors.push({
    name: "checks",
    actual: shape.checks,
    expected: EXPECTED_CHECK_SHAPE
  });
}
if (shape.maxNullLondPct !== EXPECTED_MAX_NULL_LOND_PCT) {
  shapeErrors.push({
    name: "maxNullLondPct",
    actual: shape.maxNullLondPct,
    expected: EXPECTED_MAX_NULL_LOND_PCT
  });
}

const failedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const summary =
  `${audit.passed}/${audit.total} audit cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`;
const nullCases = audit.cases.filter((row) => row.signalRate === 0).length;
if (shapeErrors.length ||
    !audit.ok ||
    failedCases.length ||
    nullCases !== EXPECTED_NULL_CASES ||
    audit.total !== EXPECTED_CASES ||
    audit.totalChecks !== EXPECTED_CHECKS ||
    audit.passed !== audit.total ||
    audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    summary,
    shapeErrors,
    failures: audit.failures,
    failedCases,
    totals: {
      nullCases,
      passed: audit.passed,
      passedChecks: audit.passedChecks,
      total: audit.total,
      totalChecks: audit.totalChecks
    }
  }, null, 2));
}

console.log(summary);
console.log(`max all-null LOND FDR: ${(audit.maxNullLond * 100).toFixed(2)}%`);
console.table(audit.cases.map((row) => ({
  tests: row.tests,
  signals: row.signalRate + "%",
  order: row.order,
  q: row.target + "%",
  rawFdr: (row.rawFdr * 100).toFixed(1),
  spendFdr: (row.spendFdr * 100).toFixed(1),
  londFdr: (row.londFdr * 100).toFixed(1),
  bhFdr: (row.bhFdr * 100).toFixed(1),
  londDiscoveries: row.londDiscoveries.toFixed(1),
  bhDiscoveries: row.bhDiscoveries.toFixed(1)
})));
```

The all-null bound in that snippet is an audit tolerance for this finite
simulation grid, not the theoretical FDR guarantee. It is there to catch
implementation regressions that would make the displayed operating curves
misleading.

## What I Would Put In The Run Log

An online discovery system should keep more than a CSV of surviving p-values.
The run log should include:

1. the stream definition and when a new hypothesis is allowed to enter it;
2. the p-value construction and calibration checks under null cases;
3. the online rule that chooses $$\alpha_i$$ before seeing $$p_i$$;
4. the spending sequence or wealth update rule;
5. independence, positive-dependence, or arbitrary-dependence assumptions;
6. every non-discovery, because the denominator is part of the result;
7. every post-procedure human filter, because filtering changes the published
   list.

The last point is where many practical systems leak. If a platform controls
FDR for the automated discovery stream and then a team silently keeps only the
"interesting" survivors, the final list is not the list the procedure
controlled. Online FDR is a contract with the whole clock, not a stamp applied
to whichever rows are left in the slide deck.

## The Useful Sentence

The weak sentence is:

```text
we corrected for multiple testing
```

The useful online sentence is:

```text
for this predeclared stream,
with valid null p-values,
under this dependence story,
we chose each threshold from the past
and controlled the expected false fraction
among discoveries at each prefix
```

That sentence is longer because the claim is real. It names the clock.

[^bh]: Yoav Benjamini and Yosef Hochberg, "Controlling the False Discovery Rate: A Practical and Powerful Approach to Multiple Testing," *Journal of the Royal Statistical Society: Series B*, 1995. [DOI](https://doi.org/10.1111/j.2517-6161.1995.tb02031.x). A public PDF is mirrored by Purdue's statistics course materials: [PDF](https://www.stat.purdue.edu/~doerge/BIOINFORM.D/FALL06/Benjamini%20and%20Y%20FDR.pdf).

[^jm2015]: Adel Javanmard and Andrea Montanari, "On Online Control of False Discovery Rate," arXiv, 2015. [arXiv:1502.06197](https://arxiv.org/abs/1502.06197).

[^jm2016]: Adel Javanmard and Andrea Montanari, "Online Rules for Control of False Discovery Rate and False Discovery Exceedance," arXiv, 2016. [arXiv:1603.09000](https://arxiv.org/abs/1603.09000).

[^foster-stine]: Dean P. Foster and Robert A. Stine, "Alpha-Investing: A Procedure for Sequential Control of Expected False Discoveries," *Journal of the Royal Statistical Society: Series B*, 2008. [DOI](https://doi.org/10.1111/j.1467-9868.2007.00643.x).

[^saffron]: Aaditya Ramdas, Tijana Zrnic, Martin J. Wainwright, and Michael I. Jordan, "SAFFRON: an Adaptive Algorithm for Online Control of the False Discovery Rate," *Proceedings of Machine Learning Research*, 2018. [PMLR](https://proceedings.mlr.press/v80/ramdas18a.html).
