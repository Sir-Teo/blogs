---
layout: post
title: "The Puzzle Chooses Its Tightest Column"
description: "Algorithm X is backtracking with an accounting discipline: express the puzzle as exact cover, branch on the most constrained uncovered column, and let conflicting rows delete themselves."
date: 2026-06-18 03:10:00 -0400
categories: computer-science
tags: [exact-cover, algorithm-x, dancing-links, sudoku, backtracking, algorithms, visualization]
excerpt: "A Sudoku move is not just a digit in a square. It is a row in a sparse matrix that satisfies four constraints at once. Algorithm X searches by choosing the uncovered constraint with the fewest remaining rows."
---

A backtracking program usually begins as a story about choices:

```text
try a digit here
if it breaks a rule, undo it
try the next digit
```

That story is true, but it hides the useful accounting.

For many puzzles, the better representation is not "choose a variable, assign a
value." It is:

```text
choose rows from a 0-1 matrix so every column is covered exactly once
```

This is the **exact cover** problem. A row is a possible move. A column is a
constraint. A solution is a set of compatible rows whose 1s hit every constraint
once and only once.

Knuth's Algorithm X is the direct depth-first search for exact cover: choose an
uncovered column, try each row containing a 1 in that column, delete the columns
covered by that row, delete every row that conflicts with those columns, and
recurse.[^knuth] If the matrix has no columns left, the selected rows are a
solution. If the chosen column has no rows, the branch is dead.

The trick is that the puzzle now chooses what to branch on.

## A Move Covers Four Facts

Use 4x4 Sudoku because the whole matrix is small enough to draw. The digits are
1 through 4, and each 2x2 box must contain every digit once.

An assignment like:

```text
r2c3 = 1
```

is a row in the exact-cover matrix. It covers four columns:

```text
C23      the cell at row 2, column 3 is filled
R2=1     row 2 contains digit 1
K3=1     column 3 contains digit 1
B2=1     box 2 contains digit 1
```

There are $$4 \times 4 \times 4 = 64$$ possible assignments, so the matrix has
64 rows. There are also 64 constraints:

$$
16\ \text{cell constraints}
+
16\ \text{row-digit constraints}
+
16\ \text{column-digit constraints}
+
16\ \text{box-digit constraints}.
$$

Every assignment row has exactly four 1s. The solution to a completed 4x4
Sudoku has 16 selected rows, and across those rows every one of the 64 columns is
covered exactly once.

Clues are just preselected rows. If the puzzle says `r1c1 = 1`, choose that row
before search begins. Every row that also touches `C11`, `R1=1`, `K1=1`, or
`B1=1` is now impossible.

That is the accounting advantage: a clue does not call four special-case Sudoku
checks. It performs one exact-cover row selection.

## The Narrowest Column Is The Local Question

Algorithm X works with any deterministic rule for choosing the next column, but
some rules create much smaller search trees than others. Knuth's paper discusses
this directly: choose a column with the smallest number of remaining 1s, and the
next nondeterministic branch has the fewest alternatives.[^knuth-heuristic]

That heuristic is not a proof that the global tree is minimal. It is a local
branching-factor rule. In constraint-solver language, it is the "most
constrained" column.

In the lab, compare:

```text
smallest column: choose the uncovered constraint with fewest active rows
leftmost column: choose the first active constraint in fixed matrix order
```

On the included 4x4 instances, the smallest-column rule visits fewer recursive
search nodes:

| instance | solutions | smallest-column nodes | leftmost-column nodes |
| --- | ---: | ---: | ---: |
| six clues | 2 | 19 | 25 |
| diagonal clues | 1 | 11 | 12 |
| four corners | 2 | 21 | 31 |
| blank grid | 288 | 2157 | 2753 |

These are toy numbers. They are still useful because the measurement is tied to
the exact artifact below, and the two solvers enumerate the same completions.
The node count is not a DLX pointer-update count; it is the number of recursive
search calls made by this small JavaScript implementation after clue rows have
been pre-covered.

## The Browser Lab

The lab below builds the 64-by-64 exact-cover representation, applies the clue
rows, runs Algorithm X, and checks its solution count against an independent
Sudoku backtracker. The bars show active constraint columns; shorter bars are
tighter columns. The trace ledger shows the column chosen and the assignment row
being tried.

<style>
  .exact-cover-lab {
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

  .exact-cover-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .exact-cover-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .exact-cover-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .exact-cover-lab input,
  .exact-cover-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .exact-cover-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .exact-cover-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0 0 0.9rem;
  }

  .exact-cover-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.4rem;
    padding: 0.58rem 0.65rem;
  }

  .exact-cover-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .exact-cover-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.92rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.24rem;
    overflow-wrap: anywhere;
  }

  .exact-cover-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .exact-cover-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 720px) {
    .exact-cover-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="exact-cover-lab" data-exact-cover-lab>
  <div class="exact-cover-lab__controls">
    <label>
      Instance
      <output data-value="puzzle">six clues</output>
      <select data-param="puzzle" aria-label="Sudoku instance">
        <option value="six" selected>six clues</option>
        <option value="diagonal">diagonal clues</option>
        <option value="thin">four corners</option>
        <option value="blank">blank grid</option>
        <option value="conflict">conflicting clues</option>
      </select>
    </label>
    <label>
      Column rule
      <output data-value="heuristic">smallest column</output>
      <select data-param="heuristic" aria-label="Column selection rule">
        <option value="min" selected>smallest column</option>
        <option value="first">leftmost column</option>
      </select>
    </label>
    <label>
      Trace step
      <output data-value="step">0 / 0</output>
      <input data-param="step" type="range" min="0" max="0" value="0" step="1" aria-label="Trace step">
    </label>
  </div>

  <div class="exact-cover-lab__metrics">
    <div class="exact-cover-lab__metric"><span>columns</span><strong data-metric="columns">64</strong></div>
    <div class="exact-cover-lab__metric"><span>rows</span><strong data-metric="rows">64</strong></div>
    <div class="exact-cover-lab__metric"><span>givens</span><strong data-metric="givens">0</strong></div>
    <div class="exact-cover-lab__metric"><span>solutions</span><strong data-metric="solutions">0</strong></div>
    <div class="exact-cover-lab__metric"><span>nodes</span><strong data-metric="nodes">0</strong></div>
    <div class="exact-cover-lab__metric"><span>dead ends</span><strong data-metric="dead">0</strong></div>
    <div class="exact-cover-lab__metric"><span>rows removed</span><strong data-metric="removed">0</strong></div>
    <div class="exact-cover-lab__metric"><span>first grid</span><strong data-metric="audit">valid</strong></div>
  </div>

  <canvas width="1120" height="690" aria-label="Algorithm X exact cover trace"></canvas>
  <p class="exact-cover-lab__note">
    A selected row removes every still-active row that shares any covered
    constraint. The conflicting-clues instance shows the same machinery failing
    before recursive search begins.
  </p>
</div>

<script defer src="{{ '/assets/js/exact-cover-lab.js?v=20260618a' | relative_url }}"></script>

## Where Dancing Links Enters

The lab copies arrays at each branch because clarity matters more than speed at
64 rows. Knuth's DLX implementation does something sharper: it stores the sparse
matrix in circular doubly linked lists, so covering a column and uncovering it
during backtracking are local reversible pointer operations.[^knuth-dlx]

The key observation predates Knuth's paper. Hitotumatu and Noshita used
reversible deletion in doubly linked lists for backtracking in 1979; Knuth
credits that idea and generalizes it into the dancing-links implementation of
Algorithm X.[^hitotumatu]

In an array-copying implementation, choosing a row means constructing a smaller
matrix:

```text
covered columns = columns where selected row has a 1
remaining rows  = rows that touch none of those columns
```

In DLX, the same logical operation is a series of unlink operations. Backtracking
links the nodes back in the reverse order. The search tree is the same exact
cover tree; the representation changes the cost of moving around inside it.

That distinction matters. Algorithm X is the problem-level rule. Dancing links
is the data structure that makes the rule cheap for sparse exact-cover
instances.

## Reproducibility Check

The browser file is also a CommonJS module:

```js
const lab = require("./assets/js/exact-cover-lab.js");

const audit = lab.auditExactCover();
console.log(audit.ok);
console.table(audit.reports.map((row) => ({
  puzzle: row.label,
  solutions: row.exactSolutions,
  brute: row.bruteSolutions,
  minNodes: row.minNodes,
  firstNodes: row.firstNodes
})));
```

The audit checks:

- the exact-cover matrix has 64 assignment rows and 64 constraint columns;
- every assignment row covers four unique constraints;
- Algorithm X and an independent Sudoku backtracker return the same solution
  count on every included instance;
- each exact-cover solution covers every matrix column once;
- each decoded grid is a valid 4x4 Sudoku grid; and
- each decoded grid respects the original clues.

The implementation is small enough to inspect:
[`assets/js/exact-cover-lab.js`]({{ '/assets/js/exact-cover-lab.js' | relative_url }}).

## What The Toy Leaves Out

This is not a competitive Sudoku solver. It is a microscope slide.

A production DLX implementation would avoid copying row and column arrays,
would count pointer updates, and would expose primary versus secondary columns.
Secondary columns are useful for constraints that may be used at most once but
do not have to be covered. Knuth uses that distinction in examples such as N
queens, where some diagonal constraints are optional.[^knuth-conclusion]

The 4x4 Sudoku instances also make the smallest-column heuristic look
unreasonably well-behaved. On larger exact-cover problems, it can still face an
exponential tree. The heuristic reduces the local branching factor; it does not
remove NP-completeness from exact cover.

Still, the representation earns its keep. Once a puzzle becomes rows and
columns, "is this move legal?" is no longer a custom predicate scattered through
the solver. It is a set intersection:

```text
if a candidate row touches a covered column, it is gone
if an uncovered column has no rows, this branch is impossible
if no columns remain, the selected rows are the certificate
```

That is the quiet power of exact cover. The puzzle stops being a nest of
special cases and becomes an accounting system for conflict.

[^knuth]: Donald E. Knuth, ["Dancing links"](https://arxiv.org/abs/cs/0011047), submitted to arXiv on November 15, 2000; journal reference *Millennial Perspectives in Computer Science*, 187-214. The paper defines the exact-cover matrix view and Algorithm X.

[^knuth-heuristic]: Knuth, ["Dancing links"](https://arxiv.org/pdf/cs/0011047), Section "Solving an exact cover problem." The algorithm permits any deterministic column choice, but Knuth discusses choosing columns with few remaining 1s as an important ordering heuristic.

[^knuth-dlx]: Knuth, ["Dancing links"](https://arxiv.org/pdf/cs/0011047), opening sections. The paper explains reversible deletion and restoration in doubly linked lists, then uses those operations to implement Algorithm X as DLX.

[^hitotumatu]: Hirosi Hitotumatu and Kohei Noshita, ["A Technique for Implementing Backtrack Algorithms and its Application"](https://dl.acm.org/doi/10.1016/0020-0190%2879%2990016-4), *Information Processing Letters* 8(4):174-175, 1979. DBLP also lists the record [here](https://dblp.org/rec/journals/ipl/HitotumatuN79).

[^knuth-conclusion]: Knuth, ["Dancing links"](https://arxiv.org/pdf/cs/0011047), concluding discussion and N queens examples. The distinction between primary and secondary columns lets DLX express constraints that are optional but still mutually exclusive when used.
