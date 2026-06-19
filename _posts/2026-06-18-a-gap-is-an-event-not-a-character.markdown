---
layout: post
title: "A Gap Is an Event, Not a Character"
description: "Needleman-Wunsch alignment is a dynamic program over possible paths through a grid. Gotoh's affine-gap version adds state so one long insertion or deletion is not priced as many unrelated accidents."
date: 2026-06-18 00:38:00 -0400
categories: computer-science
tags: [sequence-alignment, dynamic-programming, affine-gap-penalty, bioinformatics, algorithms]
excerpt: "Linear gap penalties charge every missing symbol the same way. Affine penalties add memory: opening a gap is expensive, extending it is cheaper."
---

An alignment is a hypothesis about history written as typography:

```text
ACGTACGT--ACGTA
AC-TACGTTTAC-TA
```

Each column claims one of three things:

```text
these two symbols correspond
the top sequence has an insertion relative to the bottom
the bottom sequence has an insertion relative to the top
```

The algorithmic problem is that the typography is not observed. We see two
strings. The alignment is the latent path.

## The Grid Is a Storyboard

Needleman and Wunsch's 1970 paper framed sequence comparison as a path problem
through a two-dimensional array of possible amino-acid pairings.[^needleman]
Moving diagonally aligns one symbol from each sequence. Moving vertically or
horizontally creates a gap.

In the familiar global-alignment recurrence, if `F[i][j]` is the best score for
prefixes `a[0:i]` and `b[0:j]`, then:

$$
F_{i,j}
=
\max \begin{cases}
F_{i-1,j-1}+s(a_i,b_j) \\
F_{i-1,j}+g \\
F_{i,j-1}+g
\end{cases}
$$

where `s` scores a match or mismatch and `g` is a per-character gap penalty.

That recurrence has no memory of why it is in a gap. A deletion of length ten is
charged as ten independent gap characters:

$$
\text{linear gap cost}(k)=kg.
$$

For edit distance, that may be exactly the right abstraction. For biological
sequence comparison, it is often too literal. A single insertion or deletion
event can remove a run of residues. Charging every residue as a fresh event can
make the dynamic program prefer a row of small interruptions over one coherent
gap.

## Affine Gaps Add Memory

An affine gap penalty says:

$$
\text{gap cost}(k)=g_\text{open}+(k-1)g_\text{extend}.
$$

Opening a gap is expensive. Extending the gap is cheaper.

Gotoh's 1982 paper gave an efficient dynamic program for this affine model.[^gotoh]
The standard trick is to split the table into states. In a maximization
convention like the lab uses:

```text
M[i,j] = best score ending by aligning a[i] with b[j]
X[i,j] = best score ending with a[i] aligned to a gap
Y[i,j] = best score ending with b[j] aligned to a gap
```

One common recurrence is:

$$
M_{i,j}
=
\max(M_{i-1,j-1},X_{i-1,j-1},Y_{i-1,j-1})
+s(a_i,b_j),
$$

$$
X_{i,j}
=
\max(M_{i-1,j}+g_\text{open},X_{i-1,j}+g_\text{extend}),
$$

$$
Y_{i,j}
=
\max(M_{i,j-1}+g_\text{open},Y_{i,j-1}+g_\text{extend}).
$$

The gap state is the whole point. Once the path has paid to open `X`, staying in
`X` pays only the extension cost.

This is not just bioinformatics trivia. It is a useful pattern:

```text
when a local cost depends on whether you are continuing an event,
put that event in the dynamic-programming state.
```

## Local Alignment Is a Different Question

The lab below does global alignment: both full sequences must be explained.
Smith and Waterman's 1981 local-alignment algorithm asks a different question:
where are the best matching subsequences inside larger strings?[^smith-waterman]
That version lets the path restart at zero and traceback from the best cell.

Global and local alignment often share scoring machinery, but they are not the
same inference problem:

```text
global: explain both complete strings
local: find the strongest shared island
```

The gap model is orthogonal to that choice. You can have linear or affine gaps
inside either a global or local alignment.

## Lab: One Gap Run, Two Objectives

The lab implements:

- Needleman-Wunsch style global alignment with one linear gap state;
- Gotoh-style global alignment with match, insertion, and deletion states;
- deterministic sequence mutation with substitutions, insertions, and deletions;
- a brute-force verifier on tiny sequences.

The default scoring is:

```text
match:        +2
mismatch:     -1
linear gap:   -2 per missing character
affine gap:   -5 to open, -1 to extend
```

With the default synthetic pair:

```text
source length: 52
target length: 36
mutation model: clustered gaps
substitutions: 10%
gap events: 2
mean gap length: 6
seed: 37
```

the measured outputs are:

| Model | Score | Gap runs | Gap chars | Identity |
| --- | ---: | ---: | ---: | ---: |
| linear gap | 31 | 5 | 16 | 91.7% |
| affine gap | 40 | 1 | 16 | 88.9% |

Do not read `40 > 31` as proof that affine alignment is universally "better."
The two rows optimize different scoring functions. The important observation is
the shape: the linear objective fragments the same 16 missing characters into
five runs, while the affine objective spends one opening cost and keeps the
event together.

<style>
  .alignment-lab {
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

  .alignment-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .alignment-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .alignment-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .alignment-lab input,
  .alignment-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .alignment-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .alignment-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 0.9rem;
  }

  .alignment-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .alignment-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.36);
  }

  .alignment-lab__metric--linear {
    border-color: rgba(37, 99, 235, 0.36);
  }

  .alignment-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.36);
  }

  .alignment-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 740;
    letter-spacing: 0;
    line-height: 1.18;
    margin-bottom: 0.22rem;
    text-transform: uppercase;
  }

  .alignment-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.8rem, 2.2vw, 1rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .alignment-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .alignment-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="alignment-lab" data-affine-alignment-lab>
  <div class="alignment-lab__controls">
    <label>
      Source length
      <output data-value="length">52</output>
      <input type="range" min="20" max="96" step="1" value="52" data-param="length">
    </label>
    <label>
      Substitutions
      <output data-value="substitutions">10</output>
      <input type="range" min="0" max="35" step="1" value="10" data-param="substitutions">
    </label>
    <label>
      Gap events
      <output data-value="gapEvents">2</output>
      <input type="range" min="0" max="8" step="1" value="2" data-param="gapEvents">
    </label>
    <label>
      Mean gap length
      <output data-value="gapMean">6</output>
      <input type="range" min="1" max="14" step="1" value="6" data-param="gapMean">
    </label>
    <label>
      Random seed
      <output data-value="seed">37</output>
      <input type="range" min="1" max="9999" step="1" value="37" data-param="seed">
    </label>
    <label>
      Mutation pattern
      <select data-param="pattern" aria-label="Mutation pattern">
        <option value="clustered" selected>clustered gaps</option>
        <option value="longGap">one long gap</option>
        <option value="scattered">scattered gaps</option>
        <option value="substitution">substitution drift</option>
        <option value="repeat">repeat trap</option>
      </select>
    </label>
  </div>
  <div class="alignment-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Interactive affine-gap alignment lab comparing linear-gap and affine-gap global alignments"></canvas>
  <p class="alignment-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/affine-alignment-lab.js?v=20260618c' | relative_url }}"></script>

## What the Audit Checks

The code validates the dynamic programs from two directions.

First, for the generated sequence pair, it checks that each backtrace is a valid
alignment:

- removing gaps from the top row recovers the source string;
- removing gaps from the bottom row recovers the target string;
- no column contains two gaps;
- recomputing the score from the displayed alignment returns the DP score;
- the affine final score is the maximum of the three end states.

Second, for tiny sequence pairs, it enumerates all possible alignment paths and
checks that both dynamic programs match brute force.

The deterministic audit grid is:

| Pattern | Source | Target | Linear score | Affine score | Linear gap runs | Affine gap runs | Affine gap chars |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| clustered gaps | 52 | 36 | 31 | 40 | 5 | 1 | 16 |
| one long gap | 54 | 47 | 53 | 49 | 5 | 2 | 7 |
| scattered gaps | 48 | 45 | 63 | 51 | 5 | 3 | 3 |
| substitution drift | 52 | 52 | 68 | 68 | 0 | 0 | 0 |
| repeat trap | 56 | 52 | 84 | 84 | 1 | 1 | 4 |
| clustered gaps | 80 | 63 | 80 | 89 | 4 | 2 | 17 |

Reproduce it from the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/affine-alignment-lab.js");
const EXPECTED_CASE_SHAPE = [
  "1:clustered:52/36:31/40:5/1/16:10/2/6/37",
  "2:longGap:54/47:53/49:5/2/7:8/2/8/12",
  "3:scattered:48/45:63/51:5/3/3:12/7/1/92",
  "4:substitution:52/52:68/68:0/0/0:24/0/3/5",
  "5:repeat:56/52:84/84:1/1/4:7/2/7/4",
  "6:clustered:80/63:80/89:4/2/17:6/4/5/211"
];
const EXPECTED_CASE_ROWS = [
  "1:clustered:52/36:score=31/40:runs=5/1/16:mut=10/2/6:seed=37:checks=14/14:failed=none:passed=true",
  "2:longGap:54/47:score=53/49:runs=5/2/7:mut=8/2/8:seed=12:checks=14/14:failed=none:passed=true",
  "3:scattered:48/45:score=63/51:runs=5/3/3:mut=12/7/1:seed=92:checks=14/14:failed=none:passed=true",
  "4:substitution:52/52:score=68/68:runs=0/0/0:mut=24/0/3:seed=5:checks=14/14:failed=none:passed=true",
  "5:repeat:56/52:score=84/84:runs=1/1/4:mut=7/2/7:seed=4:checks=14/14:failed=none:passed=true",
  "6:clustered:80/63:score=80/89:runs=4/2/17:mut=6/4/5:seed=211:checks=14/14:failed=none:passed=true"
];
const EXPECTED_CRITICAL_SHAPE = [
  "affine DP matches brute force for AACG/ACCG:6/6",
  "affine DP matches brute force for ACGT/AGT:6/6",
  "affine DP matches brute force for GATT/GCT:6/6",
  "affine DP matches brute force for TGA/TGACA:6/6",
  "affine backtrace is a valid alignment:6/6",
  "affine final score is max of end states:6/6",
  "affine matrix has expected shape:6/6",
  "linear DP matches brute force for AACG/ACCG:6/6",
  "linear DP matches brute force for ACGT/AGT:6/6",
  "linear DP matches brute force for GATT/GCT:6/6",
  "linear DP matches brute force for TGA/TGACA:6/6",
  "linear backtrace is a valid alignment:6/6",
  "linear matrix has expected shape:6/6",
  "scores are finite:6/6"
];
const EXPECTED_PATTERN_SHAPE = [
  "clustered:2 cases/28 checks:111/129:9/3/33",
  "longGap:1 cases/14 checks:53/49:5/2/7",
  "repeat:1 cases/14 checks:84/84:1/1/4",
  "scattered:1 cases/14 checks:63/51:5/3/3",
  "substitution:1 cases/14 checks:68/68:0/0/0"
];
const EXPECTED_CASES = EXPECTED_CASE_SHAPE.length;
const EXPECTED_CHECKS = EXPECTED_CRITICAL_SHAPE.length * EXPECTED_CASES;
const EXPECTED_TOTALS = {
  rows: EXPECTED_CASES,
  patterns: EXPECTED_PATTERN_SHAPE.length,
  criticalChecks: EXPECTED_CRITICAL_SHAPE.length,
  passed: EXPECTED_CASES,
  total: EXPECTED_CASES,
  checked: EXPECTED_CHECKS,
  passedChecks: EXPECTED_CHECKS,
  totalChecks: EXPECTED_CHECKS
};

function sameList(left, right) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function caseRow(row) {
  return `${row.caseId}:${row.pattern}:${row.sourceLength}/${row.targetLength}:` +
    `score=${row.linearScore}/${row.affineScore}:` +
    `runs=${row.linearGapRuns}/${row.affineGapRuns}/${row.affineGapChars}:` +
    `mut=${row.substitutions}/${row.gapEvents}/${row.gapMean}:` +
    `seed=${row.seed}:checks=${row.passedChecks}/${row.totalChecks}:` +
    `failed=${row.failedChecks.length ? row.failedChecks.join("|") : "none"}:` +
    `passed=${row.passed}`;
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

function auditShape(audit) {
  return {
    totals: {
      rows: audit.cases.length,
      patterns: audit.byPattern.length,
      criticalChecks: audit.criticalChecks.length,
      passed: audit.passed,
      total: audit.total,
      checked: audit.checked,
      passedChecks: audit.passedChecks,
      totalChecks: audit.totalChecks
    },
    cases: audit.cases.map(
      (row) => `${row.caseId}:${row.pattern}:${row.sourceLength}/${row.targetLength}:` +
        `${row.linearScore}/${row.affineScore}:` +
        `${row.linearGapRuns}/${row.affineGapRuns}/${row.affineGapChars}:` +
        `${row.substitutions}/${row.gapEvents}/${row.gapMean}/${row.seed}`
    ),
    caseRows: audit.cases.map(caseRow),
    criticalChecks: audit.criticalChecks.map(
      (row) => `${row.check}:${row.passed}/${row.total}`
    ),
    byPattern: audit.byPattern.map(
      (row) => `${row.pattern}:${row.cases} cases/${row.totalChecks} checks:` +
        `${row.linearScore}/${row.affineScore}:` +
        `${row.linearGapRuns}/${row.affineGapRuns}/${row.affineGapChars}`
    )
  };
}

const audit = lab.auditGrid();
const shape = auditShape(audit);
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const failedCriticalChecks = audit.criticalChecks.filter(
  (row) => !row.ok || row.passed !== row.total
);
const caseRowDrifts = rowDrifts(shape.caseRows, EXPECTED_CASE_ROWS);
const shapeErrors = [
  sameJson(shape.totals, EXPECTED_TOTALS) ? null : "totals",
  sameList(shape.cases, EXPECTED_CASE_SHAPE) ? null : "cases",
  hasRowDrift(caseRowDrifts) ? "caseRows" : null,
  sameList(shape.criticalChecks, EXPECTED_CRITICAL_SHAPE) ? null : "criticalChecks",
  sameList(shape.byPattern, EXPECTED_PATTERN_SHAPE) ? null : "byPattern"
].filter(Boolean);
console.table(audit.cases.map((row) => ({
  pattern: row.pattern,
  source: row.sourceLength,
  target: row.targetLength,
  linear: row.linearScore,
  affine: row.affineScore,
  linearGapRuns: row.linearGapRuns,
  affineGapRuns: row.affineGapRuns,
  affineGapChars: row.affineGapChars,
  checks: `${row.passedChecks}/${row.totalChecks}`,
  passed: row.passed
})));
console.table(audit.byPattern);
console.table(audit.criticalChecks);
const summary =
  `${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  shapeErrors.length ||
  failed.length ||
  failedCriticalChecks.length ||
  !audit.ok ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(JSON.stringify({
    summary,
    shapeErrors,
    shape,
    caseRowDrifts,
    failed,
    failedCriticalChecks,
    errors: audit.errors,
    passed: audit.passed,
    total: audit.total,
    passedChecks: audit.passedChecks,
    totalChecks: audit.totalChecks
  }, null, 2));
}
console.log(summary);
NODE
```

The one-long-gap row is a good caution. Its linear score is higher under these
particular numbers because a short set of gaps is not enough to repay affine's
larger opening cost. Affine gaps are not a moral preference; they are a model.

## What This Toy Leaves Out

Real sequence alignment has more knobs:

- substitution matrices such as PAM or BLOSUM for proteins;
- position-specific and composition-specific gap costs;
- local, semiglobal, and banded variants;
- linear-space traceback methods;
- heuristic search for database-scale workloads;
- careful tie handling when many alignments have the same optimal score.

The last item matters. This lab returns one deterministic optimal alignment
under its tie-breaking rule. Altschul and Erickson showed that representing all
optimal affine-gap alignments needs more care than a casual traceback graph.[^altschul-erickson]

Still, the small dynamic program is already enough to change the question. A
linear gap penalty asks:

```text
how many missing characters are there?
```

An affine gap penalty asks:

```text
how many gap events opened, and how long did they continue?
```

That extra bit of memory is the model.

[^needleman]: Saul B. Needleman and Christian D. Wunsch, ["A General Method Applicable to the Search for Similarities in the Amino Acid Sequence of Two Proteins"](https://pubmed.ncbi.nlm.nih.gov/5420325/), *Journal of Molecular Biology* 48(3), 1970. Public PDF copy: <https://courses.cs.duke.edu/spring26/compsci260/resources/AlignmentPapers/1970.needleman.wunsch.pdf>.

[^gotoh]: Osamu Gotoh, ["An improved algorithm for matching biological sequences"](https://pubmed.ncbi.nlm.nih.gov/7166760/), *Journal of Molecular Biology* 162(3), 1982.

[^smith-waterman]: Temple F. Smith and Michael S. Waterman, ["Identification of common molecular subsequences"](https://pubmed.ncbi.nlm.nih.gov/7265238/), *Journal of Molecular Biology* 147(1), 1981. Public PDF copy: <https://courses.cs.duke.edu/compsci260/fall20/resources/AlignmentPapers/1981.smith.waterman.pdf>.

[^altschul-erickson]: Stephen F. Altschul and Bruce W. Erickson, ["Optimal sequence alignment using affine gap costs"](https://pubmed.ncbi.nlm.nih.gov/3580642/), *Bulletin of Mathematical Biology* 48, 1986. Springer record: <https://link.springer.com/article/10.1007/BF02462326>.
