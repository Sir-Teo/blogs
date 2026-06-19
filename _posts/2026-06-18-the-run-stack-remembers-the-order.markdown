---
layout: post
title: "The Run Stack Remembers the Order"
description: "Timsort is often summarized as mergesort plus insertion sort. The more interesting idea is that it treats existing order as data: find natural runs, extend short ones, and let a stack decide which adjacent runs are safe to merge."
date: 2026-06-18 00:31:00 -0400
categories: computer-science
tags: [timsort, sorting, stable-sort, adaptive-sorting, merge-sort, algorithms]
excerpt: "A stable sort cannot merge arbitrary pieces just because their sizes look convenient. Timsort's run stack is a compact memory of the order already present in the input."
---

Timsort is usually introduced as:

```text
merge sort + insertion sort + real-world data
```

That is true, but it hides the part that makes the algorithm feel like an
engineered object instead of a recipe.

Timsort does not begin by pretending the input is structureless. It scans from
left to right, discovers already ordered stretches called *runs*, turns each run
into a stable ascending run, extends short runs with binary insertion sort, and
then merges only adjacent runs. The stack of pending runs is the memory of what
the scan has learned.

The phrase "only adjacent" is not a small detail. It is the price of stability.

## Why Runs Matter

Suppose the input is already sorted. A fixed recursive mergesort still builds
its merge tree. It may do less work inside each merge than it would on random
data, but it has not changed its plan. A natural mergesort can instead notice:

```text
this whole array is one run
```

and stop after the scan.

Tim Peters' original Python design note describes Timsort as an adaptive,
stable, natural mergesort. It walks once over the array, alternately identifying
the next run and merging it into earlier runs.[^peters] The same note is also
careful about what "descending" means. Reversing a descending run can destroy
the relative order of equal keys, so older Timsort used a strictly descending
test; equal adjacent keys belong to an ascending run instead.[^peters]

That is the first stability contract:

```text
ascending run:   a0 <= a1 <= a2 <= ...
descending run:  a0 >  a1 >  a2 >  ...
```

After reversing a strictly descending run, no equal-key pair has been reversed.

Short runs are the next contract. Timsort does not want a long tail of tiny
pending runs, so a natural run shorter than `minrun` is extended by sorting
enough following elements with a stable binary insertion sort. The purpose is
not that insertion sort is magic. It is that short local repairs can make the
later merge schedule better balanced.

## Why the Stack Cannot Merge Anything It Wants

Imagine three consecutive runs:

```text
A | B | C
```

If the same key occurs in all three runs, stability requires all copies from
`A` to appear before all copies from `B`, and those before all copies from `C`.
Merging `A` with `C` first is therefore illegal. It skips over `B`.

So Timsort's merge policy has a narrow action space:

```text
merge A+B, or merge B+C
```

The classic run-stack policy pushes each prepared run onto a stack and then
checks size relationships among the top runs. In the old Python notes, the
merge pattern section gives the intuition: natural run lengths are useful, but
can be wildly unbalanced, and stability constrains merging to consecutive
runs.[^peters]

A simplified version of the classic top-of-stack rule looks like this:

```text
while the top of stack is badly balanced:
  if X <= Y + Z:
    merge the smaller-neighbor pair among X+Y or Y+Z
  else if Y <= Z:
    merge Y+Z
  else:
    stop for now
```

where `X, Y, Z` are the third, second, and top run lengths. The exact production
implementations have had important details, repairs, and successors. This post
is about the core mechanism, not a clone of any current standard library.

## The Complexity Story Is Subtle

The slogan "adaptive to existing order" is evidence, not a theorem. The theorem
needs a model of presortedness.

Peter McIlroy's 1993 paper on optimistic sorting is one root of this line of
work: use information-theoretic measures of disorder and design sorting methods
that spend less work when the input is not a uniformly random permutation.[^mcilroy]
Later, Auger, Juge, Nicaud, and Pivoteau gave a proof that the Python version of
Timsort runs in $$O(n \log n)$$ and also in $$O(n + n \log \rho)$$ where
$$\rho$$ is the number of monotonic runs.[^auger]

That second bound matches the engineering story. If the input has few long
runs, the number of pending pieces is small. If the input is random, the
`minrun` extension pushes the algorithm back toward ordinary balanced merging.

The run stack has also been a real correctness object, not just a performance
trick. A 2015 verification case study by de Gouw, Rot, de Boer, Bubel, and
Hahnle found a crash bug in OpenJDK's Timsort implementation while trying to
prove it correct mechanically; their paper characterizes the failing conditions
and gives a verified repair.[^degouw] Later work by Munro and Wild introduced
Powersort and Peeksort, stable natural mergesorts with nearly optimal run-merge
orders; modern CPython's sort has evolved in that direction.[^munro-wild]

So the safest statement is:

```text
the run stack is a compact online policy for choosing legal adjacent merges;
proving that policy good enough is its own algorithmic problem.
```

## Lab: A Small Run-Stack Sorter

The lab below implements three deterministic sorters over stable `(key, id)`
items:

- fixed merge sort;
- natural-run queue merging, which detects runs and merges adjacent runs in
  left-to-right passes;
- a Timsort-shaped run stack using the simplified classic top-of-stack rules.

The accounting counts key comparisons and item writes. For the run-aware methods
it includes run detection, descending reversal, min-run extension, and merges.
It is not a wall-clock benchmark.

With the default settings:

```text
items:     128
minrun:     16
pattern:    natural runs
disorder:   34
seed:       29
```

the generated input becomes five prepared runs. The measured comparison counts
are:

| Method | Comparisons | Item writes | Max stack depth |
| --- | ---: | ---: | ---: |
| fixed merge sort | 602 | 896 | - |
| natural queue | 335 | 364 | 5 |
| run stack | 351 | 296 | 3 |

The queue happens to use fewer comparisons here, while the stack writes fewer
items because it chooses a different adjacent merge tree. That is typical of
this topic: the question is not "does a stack always win one scalar metric?"
but "which legal merge tree did the policy create?"

<style>
  .timsort-lab {
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

  .timsort-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .timsort-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .timsort-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .timsort-lab input,
  .timsort-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .timsort-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .timsort-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 0.9rem;
  }

  .timsort-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .timsort-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.36);
  }

  .timsort-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.36);
  }

  .timsort-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.36);
  }

  .timsort-lab__metric span {
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

  .timsort-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.8rem, 2.2vw, 1rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .timsort-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .timsort-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="timsort-lab" data-timsort-lab>
  <div class="timsort-lab__controls">
    <label>
      Items
      <output data-value="items">128</output>
      <input type="range" min="32" max="256" step="1" value="128" data-param="items">
    </label>
    <label>
      Min run
      <output data-value="minRun">16</output>
      <input type="range" min="4" max="64" step="1" value="16" data-param="minRun">
    </label>
    <label>
      Disorder
      <output data-value="disorder">34</output>
      <input type="range" min="0" max="100" step="1" value="34" data-param="disorder">
    </label>
    <label>
      Random seed
      <output data-value="seed">29</output>
      <input type="range" min="1" max="9999" step="1" value="29" data-param="seed">
    </label>
    <label>
      Pattern
      <select data-param="pattern" aria-label="Input pattern">
        <option value="runs" selected>natural runs</option>
        <option value="nearly">nearly sorted</option>
        <option value="sawtooth">sawtooth</option>
        <option value="descending">descending</option>
        <option value="random">random</option>
      </select>
    </label>
  </div>
  <div class="timsort-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Interactive Timsort run-stack lab comparing fixed merge sort, natural queue merging, and a stack merge policy"></canvas>
  <p class="timsort-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/timsort-run-lab.js?v=20260618c' | relative_url }}"></script>

## What the Audit Checks

The lab does not use JavaScript's built-in sort to produce its outputs. It uses
the built-in sort only to construct a stable reference order by `(key, id)`.

The audit checks:

- fixed merge sort matches the stable reference;
- the natural queue matches the stable reference;
- the run stack matches the stable reference;
- every output is sorted and stable;
- detected runs cover the input exactly;
- every prepared run is sorted after reversal and min-run extension;
- the queue and stack each perform exactly one merge per run reduction;
- stack merge records conserve run length;
- accounting values are finite.

The deterministic audit grid reports 60 named checks: ten invariants across
each of the six input patterns below.

| Pattern | Items | Minrun | Prepared runs | Fixed cmp | Queue cmp | Stack cmp | Stack writes | Stack depth |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| natural runs | 128 | 16 | 5 | 602 | 335 | 351 | 296 | 3 |
| nearly sorted | 128 | 16 | 8 | 550 | 564 | 564 | 653 | 4 |
| sawtooth | 144 | 12 | 12 | 804 | 801 | 801 | 897 | 4 |
| descending | 128 | 16 | 1 | 448 | 127 | 127 | 128 | 1 |
| random | 128 | 16 | 8 | 743 | 741 | 741 | 1027 | 4 |
| natural runs | 224 | 24 | 6 | 1129 | 678 | 678 | 620 | 3 |

You can reproduce the grid from the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/timsort-run-lab.js");
const EXPECTED_TOTALS = {
  rows: 6,
  passed: 6,
  total: 6,
  passedChecks: 60,
  totalChecks: 60
};
const EXPECTED_CASE_ROWS = [
  "1:runs:128:16:34:29:5:127:602:335:351:896:296:3:10/10:true",
  "2:nearly:128:16:22:11:8:341:550:564:564:896:653:4:10/10:true",
  "3:sawtooth:144:12:55:43:12:294:804:801:801:1040:897:4:10/10:true",
  "4:descending:128:16:0:5:1:127:448:127:127:896:128:1:10/10:true",
  "5:random:128:16:80:71:8:366:743:741:741:896:1027:4:10/10:true",
  "6:runs:224:24:48:202:6:223:1129:678:678:1760:620:3:10/10:true"
];
const EXPECTED_CHECK_NAMES = [
  "fixed merge sort matches stable reference",
  "natural queue matches stable reference",
  "run stack matches stable reference",
  "all outputs are sorted and stable",
  "detected runs cover the input",
  "detected runs are sorted after extension",
  "stack performs one merge per pending-run reduction",
  "queue performs one merge per pending-run reduction",
  "stack merge records conserve run length",
  "run-aware methods include finite accounting"
];

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
  passed: audit.passed,
  total: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks
};
const caseRows = audit.cases.map((row) => [
  row.caseId,
  row.pattern,
  row.items,
  row.minRun,
  row.disorder,
  row.seed,
  row.runs,
  row.naturalComparisons,
  row.fixedComparisons,
  row.queueComparisons,
  row.stackComparisons,
  row.fixedMoves,
  row.stackMoves,
  row.stackDepth,
  `${row.passedChecks}/${row.totalChecks}`,
  row.passed
].join(":"));
const checkRows = audit.cases.map((row) => ({
  caseId: row.caseId,
  checks: row.checks.map((check) => check.name)
}));
const expectedCheckRows = EXPECTED_CASE_ROWS.map((row) => ({
  caseId: Number(row.split(":")[0]),
  checks: EXPECTED_CHECK_NAMES
}));
const caseRowDrifts = rowDrifts(caseRows, EXPECTED_CASE_ROWS);
const checkRowDrifts = rowDrifts(checkRows, expectedCheckRows);
const driftShape = {
  totals,
  caseRowDrifts,
  checkRowDrifts
};
const shapeErrors = [
  sameJson(totals, EXPECTED_TOTALS) ? null : "totals",
  caseRowDrifts.length === 0 ? null : "caseRows",
  checkRowDrifts.length === 0 ? null : "checkRows"
].filter(Boolean);
if (shapeErrors.length) {
  throw new Error(
    `Timsort run-stack audit shape drifted in ${shapeErrors.join(", ")}:\n` +
    JSON.stringify(driftShape, null, 2)
  );
}
console.table(audit.cases.map((row) => ({
  pattern: row.pattern,
  items: row.items,
  minRun: row.minRun,
  runs: row.runs,
  fixed: row.fixedComparisons,
  queue: row.queueComparisons,
  stack: row.stackComparisons,
  stackMoves: row.stackMoves,
  stackDepth: row.stackDepth,
  checks: `${row.passedChecks}/${row.totalChecks}`,
  passed: row.passed
})));
const summary =
  `${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  failed.length ||
  !audit.ok ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(`${summary}: ${JSON.stringify(failed, null, 2)}`);
}
console.log(summary);
NODE
```

Notice the nearly sorted row. Run awareness is not automatically fewer
comparisons in this toy accounting, because detecting runs and extending short
ones also costs comparisons. The advantage appears when the structure found by
the scan is strong enough to pay for that scan.

## What This Toy Leaves Out

This is not production Timsort. It deliberately omits:

- galloping mode;
- trimming merge ranges before copying temporary memory;
- exception safety and comparator side effects;
- key caching and type-specialized comparison fast paths;
- the exact `minrun` computation used by production implementations;
- the later Powersort merge policy now used in modern CPython.

Those omissions are the point. Once they are gone, the central object is easier
to see:

```text
the input already contains a partial merge tree;
the sorter has to discover it without breaking stability.
```

The run stack is the small piece of memory that makes that negotiation online.

[^peters]: Tim Peters, ["listsort.txt"](https://raw.githubusercontent.com/python/cpython/3.10/Objects/listsort.txt), CPython source notes for the classic Python Timsort design. The current CPython notes have continued to evolve: <https://raw.githubusercontent.com/python/cpython/main/Objects/listsort.txt>.

[^mcilroy]: Peter McIlroy, ["Optimistic Sorting and Information Theoretic Complexity"](https://dl.acm.org/doi/10.5555/313559.313859), *Proceedings of the Fourth Annual ACM-SIAM Symposium on Discrete Algorithms*, 1993.

[^auger]: Nicolas Auger, Vincent Juge, Cyril Nicaud, and Carine Pivoteau, ["On the Worst-Case Complexity of TimSort"](https://arxiv.org/abs/1805.08612), arXiv:1805.08612, 2018/2019.

[^degouw]: Stijn de Gouw, Jurriaan Rot, Frank S. de Boer, Richard Bubel, and Reiner Hahnle, ["OpenJDK's java.utils.Collection.sort() is broken: The good, the bad and the worst case?"](https://ir.cwi.nl/pub/23709/23709A.pdf), CAV 2015.

[^munro-wild]: J. Ian Munro and Sebastian Wild, ["Nearly-Optimal Mergesorts: Fast, Practical Sorting Methods That Optimally Adapt to Existing Runs"](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ESA.2018.63), ESA 2018.
