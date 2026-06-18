---
layout: post
title: "The Minima March Right"
description: "SMAWK searches a totally monotone matrix without materializing it. The row minima are not independent; total monotonicity lets one comparison discard a column from a whole subproblem."
date: 2026-06-18 01:56:00 -0400
categories: computer-science
tags: [smawk, monge-arrays, dynamic-programming, algorithms, optimization]
excerpt: "A Monge matrix has a quiet promise: as rows move down, their leftmost minima can only move right. SMAWK turns that promise into a row-minimum search that skips most cells."
---

Some dynamic programs hide a table that is much larger than the thing you
actually need from it.

You may only need, for every row,

```text
argmin_j A[i,j]
```

but the obvious implementation still evaluates every `A[i,j]`. If the table is
implicit and expensive, that is a strange kind of waste: the program spends most
of its time proving that columns it did not need were not winners.

SMAWK is the sharper question for one important family of tables:

> If the row minima have order, can we search the order instead of the table?

## The Promise

A matrix is Monge for minimization when

$$
A[i,j] + A[k,\ell] \le A[i,\ell] + A[k,j]
$$

for all `i < k` and `j < l`. Read it as a no-crossing inequality: pairing
the earlier row with the earlier column and the later row with the later column
is no worse than crossing those assignments.

That inequality implies the leftmost row minima are nondecreasing. As the row
index moves down, the best column can stay put or move right, but it cannot jump
left.

The lab uses a generated family

$$
A[i,j] = (j - s_i)^2 + \alpha_i + \beta_j,
$$

where the centers satisfy `s_i <= s_k` for `i < k`. The Monge check is
not mysterious:

$$
\begin{aligned}
&A[i,j] + A[k,\ell] - A[i,\ell] - A[k,j] \\
&\quad = 2(\ell-j)(s_i-s_k) \le 0.
\end{aligned}
$$

The row and column offsets `alpha_i` and `beta_j` change the values, but
they cancel out of the inequality. That lets the lab tilt and shape the table
without breaking the certificate.

## What Total Monotonicity Adds

Plain monotone row minima are useful, but not enough for SMAWK. Aggarwal,
Klawe, Moran, Shor, and Wilber's matrix-searching paper separates the weaker
condition from total monotonicity: every submatrix must have monotone row
optima.[^smawk]

That submatrix clause is the engine. SMAWK deletes columns, recurses on a
smaller set of rows, and then searches between neighboring answers. Those
deleted-column subproblems must keep the same ordered-minima promise after rows
and columns have been removed.

For Monge matrices, that promise survives because every submatrix is still
Monge. Monge is stronger than SMAWK needs, but it is often how the structure
appears in dynamic programs and geometry.[^monge-survey]

## Lab: Search Without Filling

The lab below compares two row-minimum algorithms on the same implicit matrix:

- brute force evaluates every cell;
- SMAWK uses only comparisons requested by its reduce-and-interpolate recursion.

The audit checks that the SMAWK minima match brute force, that the minima are
nondecreasing, that every adjacent Monge inequality holds, and that SMAWK touches
fewer unique cells than the full table scan.

The heatmap is drawn after the audit for explanation. The work counters measure
only the metered lookups made by the search algorithms, not the pixels used to
paint the matrix.

<style>
  .smawk-lab {
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
  .smawk-lab * {
    box-sizing: border-box;
  }
  .smawk-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .smawk-lab label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
  }
  .smawk-lab output {
    color: #172026;
    font-weight: 800;
  }
  .smawk-lab select,
  .smawk-lab input[type="range"] {
    width: 100%;
  }
  .smawk-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    margin: 0.9rem 0;
  }
  .smawk-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    min-width: 0;
    padding: 0.65rem;
  }
  .smawk-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.15;
  }
  .smawk-lab__metric strong {
    color: #172026;
    display: block;
    font-size: clamp(0.92rem, 1.4vw, 1.15rem);
    line-height: 1.2;
    margin-top: 0.22rem;
  }
  .smawk-lab__metric--good strong {
    color: #0f766e;
  }
  .smawk-lab__metric--bad strong {
    color: #be123c;
  }
  .smawk-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .smawk-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    font-size: 0.78rem;
    font-weight: 650;
    margin-top: 0.7rem;
  }
  .smawk-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.32rem;
  }
  .smawk-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }
  .smawk-lab__note {
    color: #5d6872;
    font-size: 0.88rem;
    margin: 0.75rem 0 0;
  }
  @media (max-width: 760px) {
    .smawk-lab__controls,
    .smawk-lab__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>

<div class="smawk-lab" data-smawk-monge-lab>
  <div class="smawk-lab__controls">
    <label>
      Scenario <output data-value="scenario">wide convex drift</output>
      <select data-param="scenario" aria-label="Matrix scenario">
        <option value="wide" selected>Wide convex drift</option>
        <option value="staircase">Staircase optima</option>
        <option value="tall">Tall implicit table</option>
        <option value="jitter">Sorted noisy centers</option>
        <option value="tilted">Tilted column costs</option>
      </select>
    </label>
    <label>
      Rows <output data-value="rows">28</output>
      <input type="range" data-param="rows" min="4" max="96" step="1" value="28" aria-label="Row count">
    </label>
    <label>
      Columns <output data-value="cols">84</output>
      <input type="range" data-param="cols" min="6" max="140" step="1" value="84" aria-label="Column count">
    </label>
    <label>
      Column tilt <output data-value="tilt">0.18</output>
      <input type="range" data-param="tilt" min="-60" max="60" step="1" value="18" aria-label="Column tilt">
    </label>
    <label>
      Seed <output data-value="seed">37</output>
      <input type="range" data-param="seed" min="1" max="9999" step="1" value="37" aria-label="Random seed">
    </label>
  </div>
  <div class="smawk-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="700" aria-label="SMAWK and Monge matrix lab comparing brute force row minima with implicit totally monotone matrix search"></canvas>
  <div class="smawk-lab__legend">
    <span><i style="background:#0f766e"></i>Row minima</span>
    <span><i style="background:#b45309"></i>SMAWK-touched cells</span>
    <span><i style="background:#7c3aed"></i>Generating center</span>
  </div>
  <p class="smawk-lab__note" data-note>
    Wide convex drift: leftmost row minima move from column 1 to 84. SMAWK matches brute force while touching 236 of 2,352 cells.
  </p>
</div>

<script defer src="{{ '/assets/js/smawk-monge-lab.js?v=20260618a' | relative_url }}"></script>

## The Default Run

With the default `28 x 84` implicit matrix, the audited run reports:

| Quantity | Value |
| --- | ---: |
| brute-force cell evaluations | `2,352` |
| SMAWK unique cell evaluations | `236` |
| SMAWK comparisons | `256` |
| unique cells saved | `90.0%` |
| adjacent Monge violations | `0` |
| minima path | column `1` to column `84` |

The exact numbers are not universal. They depend on the table shape and on the
implementation's caching policy. The important fact is structural: the brute
force method scales with `rows * columns`, while SMAWK's recursion keeps asking
only the cells needed to preserve the ordered-minimum certificate.

## The Two Moves

SMAWK has two recurring moves.

First, **reduce columns**. Scan columns left to right with a stack of surviving
columns. A comparison at one row can prove that a previous column cannot be the
leftmost minimum for any row that remains in this level's subproblem. The stack
ends with at most as many columns as active rows.

Second, **interpolate rows**. Recursively solve every other row. If row `i-1`
has minimum column `a` and row `i+1` has minimum column `b`, total monotonicity
says row `i` only needs to search columns from `a` through `b`.

That is the whole personality of the algorithm: delete columns globally, recurse
on half the rows, and fill the gaps locally.

In the default run, the first reduction level shrinks `84` columns to `28`.
The next levels shrink `28 -> 14`, then `14 -> 7`, then `7 -> 3`, then `3 -> 1`.
Those are not approximations. The final row minima still match the full table
scan exactly.

## Where This Shows Up

The original SMAWK paper is written in a row-maximum convention and uses the
algorithm for geometric problems such as all-farthest neighbors of convex polygon
vertices.[^smawk] Minimization is the same idea after changing signs or reversing
the inequality.

In dynamic programming, the hidden matrix is often a transition-cost table:

$$
dp[i] = \min_j \{ previous[j] + cost(j,i) \}.
$$

If the induced table is Monge or totally monotone, the best predecessor indices
move in order. Then a layer of DP can sometimes be computed by searching row
minima rather than scanning every predecessor for every state.

That last sentence hides the hard part. The Monge property is a mathematical
claim about the cost function, not a vibe from a plot. Before replacing a full
scan with SMAWK, I would want a proof, a property test for generated instances,
and a brute-force audit on small cases.

## Boundaries

SMAWK is exact under its assumptions. It is not a heuristic for any matrix whose
argmins happen to look smooth.

Three failure modes matter:

1. The full matrix has monotone row minima, but a submatrix does not. SMAWK may
   delete a column that becomes necessary after other columns are removed.
2. The tie-breaking rule is inconsistent. This lab uses leftmost minima and
   strict replacement so equal values keep the earlier column.
3. The matrix-entry function is not actually constant time. SMAWK reduces the
   number of entries requested, but if each entry hides a large computation, the
   entry function still deserves profiling.

The useful mental model is small:

```text
Monge inequality -> total monotonicity -> ordered row minima
ordered subproblems -> reduce columns + interpolate rows
```

The minima march right. SMAWK notices that they do not need a full parade route.

## Sources

[^smawk]: Alok Aggarwal, Maria M. Klawe, Shlomo Moran, Peter Shor, and Robert Wilber, ["Geometric Applications of a Matrix-Searching Algorithm"](https://hcsoso.github.io/teaching/topology-f21/papers/SMAWK.pdf), *Algorithmica* 2, 195-208, 1987. Publication records: [IBM Research](https://research.ibm.com/publications/geometric-applications-of-a-matrix-searching-algorithm), [DOI](https://doi.org/10.1007/BF01840359).

[^monge-survey]: Rainer E. Burkard, Bettina Klinz, and Rudiger Rudolf, ["Perspectives of Monge Properties in Optimization"](https://doi.org/10.1016/0166-218X(95)00103-X), *Discrete Applied Mathematics* 70(2), 95-161, 1996.
