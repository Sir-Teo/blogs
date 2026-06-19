---
layout: post
title: "The Piles Remember the Frontier"
description: "Patience sorting computes a longest increasing subsequence by keeping one small tail value for every possible length. The piles are not the answer; they are a frontier."
date: 2026-06-18 01:47:00 -0400
categories: computer-science
tags: [longest-increasing-subsequence, patience-sorting, algorithms, dynamic-programming, combinatorics]
excerpt: "A longest increasing subsequence sounds like a global search. Patience sorting turns it into a small frontier of best tail cards."
---

A longest increasing subsequence sounds like a global object.

Given

```text
7 2 8 1 3 4 10 6 9 5
```

one longest increasing subsequence is

```text
1 3 4 6 9
```

The brute-force thought is: there are too many subsequences, so we need dynamic
programming. That is true. But for the length, and for one witness subsequence,
there is a sharper memory:

> For each possible length, remember the smallest tail value seen so far.

That memory is the pile frontier.

## The Pile Rule

Patience sorting reads the sequence from left to right. Each new card goes on
the leftmost pile whose top card is at least as large. If no such pile exists,
start a new pile to the right.

For a strict increasing subsequence, the pile-top update is exactly a
`lower_bound` search:

```text
find first top >= x
replace it with x
```

The pile tops stay increasing from left to right. More importantly, after any
prefix of the input:

```text
top[k] = smallest possible tail value
         of an increasing subsequence of length k + 1
```

Small tails are useful because they leave more room for future values. A tail
of `3` is a better length-2 promise than a tail of `8`, even if both are valid.

Aldous and Diaconis use the same ten-card example above in their patience
sorting survey. Under the greedy leftmost-pile rule, it ends with five piles;
they prove this is no coincidence: greedy patience sorting ends with exactly
the length of the longest increasing subsequence, and predecessor pointers can
recover a witness subsequence.[^aldous-diaconis]

Schensted's 1961 paper gives the older tableau-centered view: in the
correspondence he studies, the number of columns equals the length of the
longest increasing subsequence.[^schensted] Patience sorting is the small
algorithmic doorway into that larger combinatorial room.

## Lab: Watch the Frontier Move

The lab below implements two algorithms:

- patience sorting with binary search over pile tops and predecessor pointers;
- a quadratic dynamic program that checks every earlier predecessor.

The audit asserts that both lengths agree, that the reconstructed subsequence is
strictly increasing, that pile tops stay increasing after every step, and that
the dynamic program uses exactly `n(n-1)/2` pair comparisons.

<style>
  .lis-lab {
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
  .lis-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }
  .lis-lab__controls label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .lis-lab__controls input,
  .lis-lab__controls select {
    accent-color: #0f766e;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.35rem 0.45rem;
  }
  .lis-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .lis-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin-bottom: 1rem;
  }
  .lis-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
  }
  .lis-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 750;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .lis-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.2rem;
  }
  .lis-lab__metric--good strong {
    color: #0f766e;
  }
  .lis-lab__metric--bad strong {
    color: #be123c;
  }
  .lis-lab canvas {
    aspect-ratio: 940 / 700;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .lis-lab__legend {
    align-items: center;
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.78rem;
    font-weight: 700;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .lis-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }
  .lis-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }
  .lis-lab__note {
    color: #5d6872;
    font-size: 0.88rem;
    margin: 0.75rem 0 0;
  }
</style>

<div class="lis-lab" data-lis-patience-lab>
  <div class="lis-lab__controls">
    <label>
      Scenario <output data-value="scenario">Aldous-Diaconis example</output>
      <select data-param="scenario" aria-label="Sequence scenario">
        <option value="classic" selected>Aldous-Diaconis example</option>
        <option value="random">Random permutation</option>
        <option value="nearly">Nearly sorted</option>
        <option value="layered">Decreasing blocks</option>
        <option value="zigzag">Interleaved halves</option>
      </select>
    </label>
    <label>
      Length <output data-value="length">10</output>
      <input type="range" data-param="length" min="10" max="96" step="1" value="10" aria-label="Sequence length">
    </label>
    <label>
      Seed <output data-value="seed">23</output>
      <input type="range" data-param="seed" min="1" max="9999" step="1" value="23" aria-label="Random seed">
    </label>
    <label>
      Focus step <output data-value="focus">10</output>
      <input type="range" data-param="focus" min="1" max="96" step="1" value="10" aria-label="Focused prefix step">
    </label>
  </div>
  <div class="lis-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="700" aria-label="Patience sorting lab showing piles, LIS points, pile-top frontier, and audit counts"></canvas>
  <div class="lis-lab__legend">
    <span><i style="background:#2563eb"></i>Input point or ordinary card</span>
    <span><i style="background:#0f766e"></i>Recovered LIS</span>
    <span><i style="background:#b45309"></i>Focused prefix</span>
  </div>
  <p class="lis-lab__note" data-note>
    Aldous-Diaconis example: 7 2 8 1 3 4 10 6 9 5. One LIS is 1 3 4 6 9; DP agrees at length 5.
  </p>
</div>

<script defer src="{{ '/assets/js/lis-patience-lab.js?v=20260618c' | relative_url }}"></script>

## The Default Run

For the ten-card example, the lab reports:

| Quantity | Value |
| --- | ---: |
| patience piles | `5` |
| dynamic-programming LIS length | `5` |
| patience comparisons | `16` |
| DP comparisons | `45` |
| recovered LIS | `1 3 4 6 9` |

The exported audit grid is reproducible from Node:

```js
const lab = require("./assets/js/lis-patience-lab.js");
const EXPECTED_CASE_SHAPE = [
  "1:classic:10:seed=23:5:16/45:1,3,4,6,9:12/12",
  "2:random:48:seed=11:10:134/1128:10,14,19,25,31,34,35,36,41,45:10/10",
  "3:nearly:64:seed=41:47:248/2016:1,2,4,6,7,8,9,10,11,12,15,16,17,19,20,21,22,23,24,26,28,29,31,32,33,34,35,36,39,41,42,43,44,46,47,48,49,50,51,52,55,56,57,60,62,63,64:10/10",
  "4:layered:72:seed=19:9:170/2556:1,9,17,25,33,41,49,57,65:10/10",
  "5:zigzag:60:seed=77:30:207/1770:1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30:10/10"
];
const EXPECTED_BY_SCENARIO_SHAPE = [
  "classic:10:5:1/1:12/12",
  "random:48:10:1/1:10/10",
  "nearly:64:47:1/1:10/10",
  "layered:72:9:1/1:10/10",
  "zigzag:60:30:1/1:10/10"
];
const EXPECTED_COMMON_CHECK_NAMES = [
  "sequence is permutation of 1..n",
  "patience agrees with dynamic program",
  "reconstructed patience subsequence has right length",
  "reconstructed patience subsequence is increasing",
  "dynamic program subsequence is increasing",
  "pile tops stay increasing",
  "one step per input",
  "comparison counts finite",
  "quadratic comparison count exact",
  "monte carlo finite"
];
const EXPECTED_CLASSIC_CHECK_NAMES = EXPECTED_COMMON_CHECK_NAMES.concat([
  "classic example has five piles",
  "classic recovered LIS"
]);
const EXPECTED_CASES = EXPECTED_CASE_SHAPE.length;
const EXPECTED_CHECKS =
  EXPECTED_CASES * EXPECTED_COMMON_CHECK_NAMES.length +
  (EXPECTED_CLASSIC_CHECK_NAMES.length - EXPECTED_COMMON_CHECK_NAMES.length);
const EXPECTED_CHECK_ROWS = EXPECTED_CASE_SHAPE.map((shape, index) => {
  const scenario = shape.split(":")[1];
  const names =
    scenario === "classic" ? EXPECTED_CLASSIC_CHECK_NAMES : EXPECTED_COMMON_CHECK_NAMES;
  return `${index + 1}:` + names.map((name) => `${name}=true`).join("|");
});

function sameList(actual, expected) {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function caseShape(row, index) {
  return `${index + 1}:${row.scenario}:${row.length}:seed=${row.seed}:` +
    `${row.lisLength}:${row.patienceComparisons}/${row.dpComparisons}:` +
    `${row.lis.join(",")}:${row.passedChecks}/${row.totalChecks}`;
}

function byScenarioShape(row) {
  return `${row.scenario}:${row.length}:${row.lisLength}:` +
    `${row.passed}/${row.total}:${row.passedChecks}/${row.totalChecks}`;
}

function checkRow(row, index) {
  return `${index + 1}:` +
    row.checks.map((check) => `${check.name}=${check.ok}`).join("|");
}

function rowDrifts(actual, expected) {
  return {
    missing: expected.filter((row) => !actual.includes(row)),
    extra: actual.filter((row) => !expected.includes(row))
  };
}

function hasRowDrift(drift) {
  return drift.missing.length > 0 || drift.extra.length > 0;
}

const audit = lab.auditGrid();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
console.table(audit.byScenario);
const shape = {
  byScenario: audit.byScenario.map(byScenarioShape),
  cases: audit.cases.map(caseShape),
  checkRows: audit.cases.map(checkRow)
};
const checkRowDrifts = rowDrifts(shape.checkRows, EXPECTED_CHECK_ROWS);
const shapeErrors = [];
if (!sameList(shape.cases, EXPECTED_CASE_SHAPE)) {
  shapeErrors.push({ name: "cases", actual: shape.cases, expected: EXPECTED_CASE_SHAPE });
}
if (!sameList(shape.byScenario, EXPECTED_BY_SCENARIO_SHAPE)) {
  shapeErrors.push({
    name: "byScenario",
    actual: shape.byScenario,
    expected: EXPECTED_BY_SCENARIO_SHAPE
  });
}
audit.cases.forEach((row, index) => {
  const names = row.checks.map((check) => check.name);
  const expected =
    row.scenario === "classic" ? EXPECTED_CLASSIC_CHECK_NAMES : EXPECTED_COMMON_CHECK_NAMES;
  if (!sameList(names, expected)) {
    shapeErrors.push({
      name: `case ${index + 1} check names`,
      actual: names,
      expected
    });
  }
});
if (hasRowDrift(checkRowDrifts)) {
  shapeErrors.push({ name: "checkRows", drift: checkRowDrifts });
}
const summary =
  `${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  shapeErrors.length ||
  failed.length ||
  !audit.ok ||
  audit.total !== EXPECTED_CASES ||
  audit.totalChecks !== EXPECTED_CHECKS ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(JSON.stringify({
    summary,
    failed,
    shapeErrors,
    shape,
    checkRowDrifts,
    passed: audit.passed,
    total: audit.total,
    passedChecks: audit.passedChecks,
    totalChecks: audit.totalChecks
  }, null, 2));
}

console.table(audit.cases.map((row) => ({
  scenario: row.scenario,
  n: row.length,
  lisLength: row.lisLength,
  patienceComparisons: row.patienceComparisons,
  dpComparisons: row.dpComparisons,
  checks: `${row.passedChecks}/${row.totalChecks}`,
  witnessPrefix: row.lis.slice(0, 8).join(" ")
})));
console.log(summary);
```

The current grid covers five scenario rows and 52 named checks. Each returned
row also carries the full reconstructed `lis` array, so the audit checks both
the length and an actual witness sequence. The named checks include permutation
validity, patience/DP agreement, increasing reconstructed witnesses, increasing
pile-top frontiers after every prefix, exact quadratic DP comparison counts,
and the two classic-example facts used in the prose.

The piles are not themselves the subsequence. The final top cards can even be
misleading. Aldous and Diaconis point this out in the example: the top cards are
not generally an increasing subsequence because a later small card may sit on
top of a pile whose earlier card was needed for the witness.[^aldous-diaconis]

The predecessor pointers are the important extra bookkeeping. When a card lands
on pile `k`, point it to the current top card of pile `k-1`. Following those
pointers backward from the rightmost pile gives one real increasing subsequence.

## Why The Frontier Works

The invariant is a dominance argument.

Suppose two length-`k` increasing subsequences have tails `a` and `b`, with
`a < b`. For every future value `x`, if `b < x`, then also `a < x`. The smaller
tail is never worse. So the algorithm does not need to remember every length-`k`
subsequence. It only needs the smallest tail.

That is why replacing a pile top is not losing the answer. It is improving a
promise:

```text
old tail: larger, fewer future options
new tail: smaller, same length, more future options
```

The quadratic DP is still the clearest certificate:

$$
dp[i] = 1 + \max_{j < i,\; x_j < x_i} dp[j].
$$

Patience sorting compresses the same search into a frontier indexed by length.

## Random Permutations

The lab also runs a small deterministic Monte Carlo sweep on random permutations
of the selected length. That panel is only a toy empirical cue. The classical
asymptotic story is much deeper: for a random permutation of size `n`, the LIS
length is on the order of

$$
2\sqrt{n}.
$$

Aldous and Diaconis's later Bulletin article explicitly frames the bridge from
patience sorting to the Baik-Deift-Johansson theorem.[^aldous-diaconis-bams]
BDJ itself proves the Tracy-Widom fluctuation limit for the centered and scaled
LIS length.[^bdj]
The interactive sweep is not trying to reproduce that theorem. It is there to
show that LIS length is usually much smaller than `n` for a random permutation,
while nearly sorted and structured inputs can be very different.

## Boundaries

This implementation assumes a permutation, so all values are distinct. With
duplicates, the binary-search predicate encodes a choice:

- strict increasing subsequence: first pile top `>= x`;
- nondecreasing subsequence: first pile top `> x`.

That one character changes the meaning of the frontier. The lab keeps the
permutation setting so the invariant is uncluttered.

Patience sorting is also not a complete replacement for DP in every subsequence
problem. Add weights, edit costs, multiple sequences, or side constraints, and
the frontier may need more state. The lesson is narrower and sturdier:

> When the future only cares about length and tail value, one best tail per
> length is enough memory.

The piles remember a frontier, not a history.

## Sources

[^aldous-diaconis]: David Aldous and Persi Diaconis, ["Patience Sorting, Longest Increasing Subsequences and a Continuous Space Analog of the Simple Asymmetric Exclusion Process"](https://www.stat.berkeley.edu/~aldous/Research/OP/patience.pdf), 1993 manuscript. The manuscript gives the ten-card example, proves the pile-count/LIS lemma for greedy patience sorting, and reviews the random-permutation theory then available.

[^aldous-diaconis-bams]: David Aldous and Persi Diaconis, ["Longest Increasing Subsequences: From Patience Sorting to the Baik-Deift-Johansson Theorem"](https://statistics.stanford.edu/technical-reports/longest-increasing-subsequences-patience-sorting-baik-deift-johansson-theorem), Stanford Statistics Technical Report 1999-04; published in *Bulletin of the American Mathematical Society* 36(4), 1999.

[^bdj]: Jinho Baik, Percy Deift, and Kurt Johansson, ["On the Distribution of the Length of the Longest Increasing Subsequence of Random Permutations"](https://arxiv.org/abs/math/9810105), 1998 preprint; published in *Journal of the American Mathematical Society* 12(4), 1999.

[^schensted]: C. Schensted, ["Longest Increasing and Decreasing Subsequences"](https://sites.math.washington.edu/~billey/classes/561.fall.2019/articles/schensted.1961.pdf), *Canadian Journal of Mathematics* 13, 1961. The paper proves that the number of columns in the associated symbol equals the length of the longest increasing subsequence.
