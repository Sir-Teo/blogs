---
layout: post
title: "The Best Candidate Waits For A Record"
description: "The secretary problem is not really about hiring. It is a finite optimal-stopping contract: spend a sample, then accept the first record, and verify the cutoff by dynamic programming."
date: 2026-06-18 08:20:00 -0400
categories: statistics
tags: [secretary-problem, optimal-stopping, dynamic-programming, decision-theory, simulation, probability]
excerpt: "The famous 37% rule is the limit. The finite problem is cleaner: compute every cutoff, run the backward induction, and watch where a record first becomes worth taking."
---

The secretary problem is usually remembered as a slogan:

```text
look at about 37% of the candidates,
then take the next one who beats everyone so far
```

That slogan is memorable, but it hides the actual object. This is not a general
rule for hiring, dating, search, or life. It is an optimal-stopping theorem for
a narrow information contract:

```text
n candidates arrive in uniformly random order
you see only relative ranks among candidates already seen
you must accept or reject immediately
you win only if you select the single best candidate
```

Under that contract, the only candidates worth accepting are **records**:
someone better than every earlier candidate. A non-record is already known not
to be the global best.

The decision is therefore not "is this person good?" It is:

```text
has the sampling period been long enough
that a new record is worth stopping on?
```

## The Finite Formula

Pick a cutoff `r`. Reject candidates `1..r-1`. From candidate `r` onward, accept
the first record. If no record appears, the final candidate is taken and usually
loses.

For `r > 1`, this rule succeeds exactly when the best candidate appears at some
position `i >= r` and the best among the first `i-1` candidates lies inside the
sample window `1..r-1`. Conditional on the global best appearing at position
`i`, the previous maximum is equally likely to occupy any of the first `i-1`
positions. So

```text
P(success | cutoff r)
  = (r-1)/n * sum_{i=r}^n 1/(i-1).
```

For `r = 1`, the rule accepts the first candidate and succeeds with probability
`1/n`.

Let `n` grow and write `x = r/n`. The harmonic sum becomes an integral and the
success probability approaches

```text
-x log x.
```

The maximum is at `x = 1/e`, with value `1/e`. That is where the 37% rule comes
from. Ferguson's historical survey gives this derivation and points to Gilbert
and Mosteller's 1966 paper as the basic treatment with many extensions.[^ferguson]

## The Backward View

The formula above proves the best cutoff among cutoff rules. The dynamic program
shows why a cutoff rule appears at all.

Suppose candidate `i` has arrived and is a record. If we stop, the chance that
this record is the global best is:

```text
i / n
```

That may look backwards at first. A record at position `i` is the best of the
first `i` candidates; by exchangeability, the best-so-far is the global best
with probability `i/n`.

Let `V[i]` be the optimal success probability before seeing candidate `i`. If
candidate `i` is a record, stopping pays `i/n`; continuing pays `V[i+1]`. If it
is not a record, stopping pays zero, so continuing is the only rational move.
Because candidate `i` is a record with probability `1/i`,

```text
V[i] = (1/i) * max(i/n, V[i+1])
     + (1 - 1/i) * V[i+1].
```

Run this recurrence backward from the end. The first index where `i/n >= V[i+1]`
is the same cutoff found by the finite formula.

## Lab: Where The Record Becomes Worth It

The lab computes:

- the exact finite success curve for every cutoff;
- the backward dynamic program's accept-record boundary;
- a seeded simulation of the selected cutoff;
- one visible shuffled order, with records and the selected candidate marked.

<style>
  .secretary-lab {
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

  .secretary-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .secretary-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .secretary-lab input {
    accent-color: #2563eb;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    box-sizing: border-box;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0;
    width: 100%;
  }

  .secretary-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .secretary-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin-bottom: 0.85rem;
  }

  .secretary-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    min-width: 0;
    padding: 0.62rem 0.68rem;
  }

  .secretary-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .secretary-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.24rem;
  }

  .secretary-lab__metric--good strong {
    color: #0f766e;
  }

  .secretary-lab__metric--bad strong {
    color: #be123c;
  }

  .secretary-lab canvas {
    aspect-ratio: 980 / 720;
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-height: 760px;
    width: 100%;
  }

  .secretary-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 620px) {
    .secretary-lab {
      padding: 0.85rem;
    }

    .secretary-lab canvas {
      aspect-ratio: 430 / 860;
      max-height: none;
    }
  }
</style>

<div class="secretary-lab" data-secretary-stopping-lab>
  <div class="secretary-lab__controls">
    <label>
      Candidates <output data-value="n">80</output>
      <input data-param="n" type="range" min="5" max="200" step="1" value="80">
    </label>
    <label>
      First eligible record <output data-value="cutoff">30</output>
      <input data-param="cutoff" type="range" min="1" max="80" step="1" value="30">
    </label>
    <label>
      Simulation trials <output data-value="trials">5.0k</output>
      <input data-param="trials" type="range" min="500" max="12000" step="500" value="5000">
    </label>
    <label>
      Seed <output data-value="seed">23</output>
      <input data-param="seed" type="range" min="1" max="99" step="1" value="23">
    </label>
  </div>
  <div class="secretary-lab__metrics" data-metrics></div>
  <canvas data-canvas width="980" height="720" aria-label="Secretary problem optimal stopping lab with finite cutoff curve, backward dynamic program, simulation, and sample order"></canvas>
  <p class="secretary-lab__note">The candidates are represented only by random ranks. The model does not include measurement noise, interviews with costs, multiple hires, actual score values, recall, fairness constraints, or strategic behavior.</p>
</div>

<script defer src="{{ '/assets/js/secretary-stopping-lab.js?v=20260618c' | relative_url }}"></script>

For `n = 80`, the exact optimum is to reject 29 candidates and make candidate
30 the first eligible record. The exact success probability is about `0.3719`.
The limiting `1/e` answer is already a good mental model, but the finite curve
is the real answer.

## What The Audit Checks

The exported Node audit does four things:

```text
enumerates all permutations for n = 5, 6, 7
checks every cutoff against the closed-form probability
runs backward induction for n = 12, 25, 80, 150
checks that the DP cutoff and value equal the exact finite optimum
```

It also runs the default seeded simulation and checks that the simulated success
rate is within a small tolerance of the exact probability. Ignoring the returned
case rows, the current top-level audit reports:

```json
{
  "exactAtCutoff": 0.3719,
  "ok": true,
  "optimalCutoff": 30,
  "optimalProbability": 0.3719,
  "passed": 26,
  "passedChecks": 30,
  "totalChecks": 30,
  "total": 26
}
```

The compact reproduction check is:

```bash
node - <<'NODE'
const lab = require("./assets/js/secretary-stopping-lab.js");
const EXPECTED_EXACT_CASE_SHAPE = [
  "5:1:0.200000000000:0.200000000000:0.000e+0:1/1:closed form equals brute force",
  "5:2:0.416666666667:0.416666666667:5.551e-17:1/1:closed form equals brute force",
  "5:3:0.433333333333:0.433333333333:5.551e-17:1/1:closed form equals brute force",
  "5:4:0.350000000000:0.350000000000:0.000e+0:1/1:closed form equals brute force",
  "5:5:0.200000000000:0.200000000000:0.000e+0:1/1:closed form equals brute force",
  "6:1:0.166666666667:0.166666666667:0.000e+0:1/1:closed form equals brute force",
  "6:2:0.380555555556:0.380555555556:0.000e+0:1/1:closed form equals brute force",
  "6:3:0.427777777778:0.427777777778:0.000e+0:1/1:closed form equals brute force",
  "6:4:0.391666666667:0.391666666667:5.551e-17:1/1:closed form equals brute force",
  "6:5:0.300000000000:0.300000000000:0.000e+0:1/1:closed form equals brute force",
  "6:6:0.166666666667:0.166666666667:0.000e+0:1/1:closed form equals brute force",
  "7:1:0.142857142857:0.142857142857:0.000e+0:1/1:closed form equals brute force",
  "7:2:0.350000000000:0.350000000000:0.000e+0:1/1:closed form equals brute force",
  "7:3:0.414285714286:0.414285714286:5.551e-17:1/1:closed form equals brute force",
  "7:4:0.407142857143:0.407142857143:5.551e-17:1/1:closed form equals brute force",
  "7:5:0.352380952381:0.352380952381:0.000e+0:1/1:closed form equals brute force",
  "7:6:0.261904761905:0.261904761905:0.000e+0:1/1:closed form equals brute force",
  "7:7:0.142857142857:0.142857142857:0.000e+0:1/1:closed form equals brute force"
];
const EXPECTED_EXACT_SUMMARY_SHAPE = [
  "5:5:5/5:5.55e-17",
  "6:6:6/6:5.55e-17",
  "7:7:7/7:5.55e-17"
];
const EXPECTED_DP_CASE_SHAPE = [
  "12:5:5:0.395514670515:0.395514670515:0.000e+0:2/2:DP cutoff equals finite optimum|DP value equals finite optimum",
  "25:10:10:0.380916372563:0.380916372563:5.551e-17:2/2:DP cutoff equals finite optimum|DP value equals finite optimum",
  "80:30:30:0.371855486992:0.371855486992:1.110e-16:2/2:DP cutoff equals finite optimum|DP value equals finite optimum",
  "150:56:56:0.369997293685:0.369997293685:6.106e-16:2/2:DP cutoff equals finite optimum|DP value equals finite optimum"
];
const EXPECTED_DEFAULT_CHECK_SHAPE = [
  "cutoff range:1/1",
  "curve bounded:1/1",
  "formula finite:1/1",
  "simulation close:1/1"
];
const EXPECTED_ROWS =
  EXPECTED_EXACT_CASE_SHAPE.length +
  EXPECTED_DP_CASE_SHAPE.length +
  EXPECTED_DEFAULT_CHECK_SHAPE.length;
const EXPECTED_CHECKS = [
  ...EXPECTED_EXACT_CASE_SHAPE,
  ...EXPECTED_DP_CASE_SHAPE,
  ...EXPECTED_DEFAULT_CHECK_SHAPE
].reduce((sum, row) => sum + Number(row.match(/:(\d+)\/(\d+)(?::|$)/)[2]), 0);

function sameList(actual, expected) {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function checkNames(row) {
  return row.checks.map((check) => check.name).join("|");
}

function exactCaseShape(row) {
  return `${row.n}:${row.cutoff}:${row.exact.toFixed(12)}:` +
    `${row.brute.toFixed(12)}:${row.difference.toExponential(3)}:` +
    `${row.passedChecks}/${row.totalChecks}:${checkNames(row)}`;
}

function exactSummaryShape(row) {
  return `${row.n}:${row.cutoffs}:${row.checks}:${row.maxDifference}`;
}

function dpCaseShape(row) {
  return `${row.n}:${row.bestCutoff}:${row.dpFirstAccept}:` +
    `${row.bestProbability.toFixed(12)}:${row.dpValue.toFixed(12)}:` +
    `${row.valueDifference.toExponential(3)}:` +
    `${row.passedChecks}/${row.totalChecks}:${checkNames(row)}`;
}

function defaultCheckShape(row) {
  return `${row.name}:${row.passedChecks}/${row.totalChecks}`;
}

const audit = lab.auditSecretaryStoppingLab();
const exactSummary = [5, 6, 7].map((n) => {
  const rows = audit.exactCases.filter((row) => row.n === n);
  return {
    n,
    cutoffs: rows.length,
    checks: `${rows.reduce((sum, row) => sum + row.passedChecks, 0)}/${rows.reduce((sum, row) => sum + row.totalChecks, 0)}`,
    maxDifference: Math.max(...rows.map((row) => row.difference)).toExponential(2)
  };
});
console.table(exactSummary);
console.table(audit.dpCases.map((row) => ({
  n: row.n,
  bestCutoff: row.bestCutoff,
  dpFirstAccept: row.dpFirstAccept,
  bestProbability: row.bestProbability.toFixed(4),
  valueDifference: row.valueDifference,
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
console.table(audit.defaultChecks.map((row) => ({
  check: row.name,
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
const shape = {
  defaultChecks: audit.defaultChecks.map(defaultCheckShape),
  dpCases: audit.dpCases.map(dpCaseShape),
  exactCases: audit.exactCases.map(exactCaseShape),
  exactSummary: exactSummary.map(exactSummaryShape)
};
const auditShape = {
  exactRows: audit.exactCases.length,
  dpRows: audit.dpCases.length,
  defaultChecks: audit.defaultChecks.length,
  passed: audit.passed,
  total: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks
};
const shapeErrors = [
  ["exactCases", shape.exactCases, EXPECTED_EXACT_CASE_SHAPE],
  ["exactSummary", shape.exactSummary, EXPECTED_EXACT_SUMMARY_SHAPE],
  ["dpCases", shape.dpCases, EXPECTED_DP_CASE_SHAPE],
  ["defaultChecks", shape.defaultChecks, EXPECTED_DEFAULT_CHECK_SHAPE]
].filter((row) => !sameList(row[1], row[2]))
  .map(([name, actual, expected]) => ({ name, actual, expected }));

const failedExactCases = audit.exactCases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const failedDpCases = audit.dpCases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const failedDefaultChecks = audit.defaultChecks.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (shapeErrors.length ||
    auditShape.total !== EXPECTED_ROWS ||
    auditShape.totalChecks !== EXPECTED_CHECKS ||
    !audit.ok || failedExactCases.length || failedDpCases.length ||
    failedDefaultChecks.length || audit.passed !== audit.total ||
    audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    failures: audit.failures,
    failedExactCases,
    failedDpCases,
    failedDefaultChecks,
    shapeErrors,
    auditShape
  }, null, 2));
}
console.log(
  `${audit.passed}/${audit.total} audit rows and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`
);
NODE
```

That simulation tolerance is not the theorem. It is only a smoke test that the
Monte Carlo path agrees with the exact calculation. The theorem is in the
finite formula and the backward recurrence.

## The Boundary Of The Story

The classic problem uses only relative ranks. That makes it robust to the scale
of candidate quality, but it also throws away information. If actual scores are
visible and drawn from a known distribution, the problem changes. Gilbert and
Mosteller studied that full-information version too.[^gilbert-mosteller] The
right rule becomes an adaptive threshold on observed values, not merely "wait
for the next record."

Real decisions are further away. Hiring is not a random permutation with a
single hidden total order. Search often has costs, correlated arrivals, multiple
acceptable choices, delayed information, legal constraints, and humans who
deserve more than a toy objective function.

So the useful artifact is not the slogan. It is the receipt:

```text
what information arrives,
what decisions are irrevocable,
what payoff is being maximized,
and which stopping rule was priced into that payoff
```

Under the classic receipt, the best candidate waits for a record. Under a
different receipt, the number `37%` may be nothing but folklore wearing a lab
coat.

[^ferguson]: Thomas S. Ferguson, ["Who Solved the Secretary Problem?"](https://projecteuclid.org/journals/statistical-science/volume-4/issue-3/Who-Solved-the-Secretary-Problem/10.1214/ss/1177012493.full), *Statistical Science* 4(3), 1989, pp. 282-289. A public PDF copy is hosted by Penn Math: [Secretary.pdf](https://www2.math.upenn.edu/~ted/210F10/References/Secretary.pdf).

[^gilbert-mosteller]: John P. Gilbert and Frederick Mosteller, ["Recognizing the Maximum of a Sequence"](https://www.jstor.org/stable/2283044), *Journal of the American Statistical Association* 61(313), 1966, pp. 35-73. JSTOR's stable record is DOI-compatible: [10.2307/2283044](https://doi.org/10.2307/2283044).
