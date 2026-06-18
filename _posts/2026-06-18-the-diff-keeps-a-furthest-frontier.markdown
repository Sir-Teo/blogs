---
layout: post
title: "The Diff Keeps a Furthest Frontier"
description: "Myers' diff algorithm turns longest common subsequence into a shortest path problem, then searches by remembering only the furthest point reached on each diagonal."
date: 2026-06-18 03:21:00 -0400
categories: computer-science
tags: [diff, myers-algorithm, lcs, edit-distance, algorithms, software-engineering, visualization]
excerpt: "A shortest insert/delete script is a path through an edit graph. Myers' algorithm does not fill the whole dynamic-programming table; it keeps the furthest-reaching point on every diagonal for each edit budget."
---

A file diff is easy to use and surprisingly easy to misunderstand.

When it says:

```diff
- cache = off
+ cache = on
```

it is not claiming to understand configuration semantics. It is producing a
small script that turns one sequence of tokens into another sequence of tokens.
The tokens might be lines, words, characters, AST nodes, or something else. The
classic problem is narrower still:

```text
delete tokens from A
insert tokens from B
keep equal tokens in order
```

No substitution operation is needed. A replacement is just a delete followed by
an insert.

Myers' 1986 paper frames this as the dual of longest common subsequence:
finding a shortest edit script and finding a longest common subsequence are two
views of the same path through an edit graph.[^myers] The algorithm is famous
because it is fast when the two sequences are similar. If:

$$
N = |A| + |B|
\quad\text{and}\quad
D = \text{length of the shortest insert/delete script},
$$

then the frontier algorithm runs in $$O(ND)$$ time. Small change, small $$D$$,
small search.

That is exactly the workload a file comparison tool hopes for.

## The Edit Graph Is The Ledger

Put the old sequence on the horizontal axis and the new sequence on the vertical
axis. A point $$(x, y)$$ means:

```text
we have consumed A[0..x)
we have consumed B[0..y)
```

From that point there are three possible kinds of edge:

```text
right      delete A[x]
down       insert B[y]
diagonal   keep A[x] == B[y]
```

The diagonal edge is available only when the next tokens are equal. It costs
zero edit operations because keeping an equal token does not appear in the patch.
Horizontal and vertical edges cost one.

So a shortest diff is a path from $$(0,0)$$ to $$(|A|, |B|)$$ with the fewest
non-diagonal edges.

If a path keeps $$L$$ diagonal tokens, then it spends:

$$
D = |A| + |B| - 2L
$$

insert/delete edits. This is the LCS connection: maximizing the number of kept
diagonal edges is the same as minimizing the number of horizontal and vertical
edges.

A full dynamic-programming table can compute that. Myers' algorithm asks for
less.

## Store The Furthest Point Per Diagonal

Number a diagonal by:

$$
k = x - y.
$$

Every delete moves to diagonal $$k+1$$. Every insert moves to diagonal $$k-1$$.
Every run of equal tokens stays on the same diagonal. Myers calls such a maximal
run of diagonal edges a **snake**.

Now fix an edit budget $$d$$. Instead of storing every reachable point, store
only this:

```text
V[k] = the largest x coordinate reachable on diagonal k
       using exactly d insert/delete edits,
       after greedily following equal-token diagonals
```

For the next layer, each diagonal can be reached from one of two neighbors:

```text
from k-1: delete one old token, then snake
from k+1: insert one new token, then snake
```

Keep whichever reaches the larger $$x$$ coordinate. If it reaches farther along
the same diagonal, it dominates the shorter prefix because the future choices on
that diagonal see the same suffixes with more input already consumed.

This gives the search loop:

```text
for d = 0, 1, 2, ...
    for k = -d, -d+2, ..., d
        arrive from k-1 or k+1
        follow the diagonal snake while tokens match
        remember the furthest x on diagonal k
        stop if the frontier reaches (|A|, |B|)
```

The first $$d$$ that reaches the lower-right corner is the shortest edit script
length. Earlier layers have tried every path with fewer edits.

The implementation below stores the whole frontier trace so it can reconstruct
and draw one shortest path. A production implementation can use less memory when
it only needs the distance, and Myers also gives a divide-and-conquer variation
based on middle snakes.[^myers-space]

## The Browser Lab

The lab builds the furthest-reaching frontier, reconstructs a shortest script,
and checks the result against an ordinary dynamic-programming LCS oracle. The
orange points are the selected frontier layer. Purple segments are snakes.
Green is the final kept-token path; red and blue are deletes and inserts.

<style>
  .myers-diff-lab {
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

  .myers-diff-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .myers-diff-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .myers-diff-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .myers-diff-lab input,
  .myers-diff-lab select {
    accent-color: #b45309;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .myers-diff-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .myers-diff-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0 0 0.9rem;
  }

  .myers-diff-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.4rem;
    padding: 0.58rem 0.65rem;
  }

  .myers-diff-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .myers-diff-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.92rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.24rem;
    overflow-wrap: anywhere;
  }

  .myers-diff-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .myers-diff-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 720px) {
    .myers-diff-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="myers-diff-lab" data-myers-diff-lab>
  <div class="myers-diff-lab__controls">
    <label>
      Example
      <output data-value="example">small refactor</output>
      <select data-param="example" aria-label="Diff example">
        <option value="refactor" selected>small refactor</option>
        <option value="moved">moved block</option>
        <option value="repeated">repeated tokens</option>
        <option value="sentence">sentence edit</option>
        <option value="config">config file</option>
      </select>
    </label>
    <label>
      Tie break
      <output data-value="tie">prefer deletes</output>
      <select data-param="tie" aria-label="Tie break rule">
        <option value="delete" selected>prefer deletes</option>
        <option value="insert">prefer inserts</option>
      </select>
    </label>
    <label>
      Frontier layer
      <output data-value="layer">0 / 0</output>
      <input data-param="layer" type="range" min="0" max="0" value="0" step="1" aria-label="Frontier layer">
    </label>
  </div>

  <div class="myers-diff-lab__metrics">
    <div class="myers-diff-lab__metric"><span>old tokens</span><strong data-metric="old">0</strong></div>
    <div class="myers-diff-lab__metric"><span>new tokens</span><strong data-metric="new">0</strong></div>
    <div class="myers-diff-lab__metric"><span>edit distance</span><strong data-metric="distance">0</strong></div>
    <div class="myers-diff-lab__metric"><span>LCS length</span><strong data-metric="lcs">0</strong></div>
    <div class="myers-diff-lab__metric"><span>script ops</span><strong data-metric="ops">0</strong></div>
    <div class="myers-diff-lab__metric"><span>frontier cells</span><strong data-metric="frontier">0</strong></div>
    <div class="myers-diff-lab__metric"><span>DP oracle</span><strong data-metric="oracle">passes</strong></div>
  </div>

  <canvas width="1080" height="700" aria-label="Myers diff edit graph and frontier visualization"></canvas>
  <p class="myers-diff-lab__note">
    The tie break changes which shortest script is drawn when two predecessors
    reach the same furthest point. It should not change the edit distance.
  </p>
</div>

<script defer src="{{ '/assets/js/myers-diff-lab.js?v=20260618c' | relative_url }}"></script>

In the default example, the old sequence has 7 tokens and the new sequence has
8. The LCS keeps 7 tokens, so the shortest script has:

$$
D = 7 + 8 - 2 \cdot 7 = 1
$$

edit. The frontier reaches the lower-right corner at layer 1.

Switch to **moved block**. The example has no semantic move operation. It is a
pure insert/delete diff, so reordering a pair of lines appears as deletions plus
insertions. The oracle reports edit distance 4 and LCS length 5. That is not a
bug; it is the cost model.

Switch to **config file**. The tokens look like key-value updates, but exact
line equality only keeps two lines. The shortest insert/delete script length is
8. A configuration-aware diff could do better for human review, but it would be
solving a different problem.

## Reproducibility Check

The browser file is also a CommonJS module:

```bash
node - <<'NODE'
const lab = require("./assets/js/myers-diff-lab.js");
const EXPECTED_GROUPS = 11;
const EXPECTED_NAMED_CASES = 10;
const EXPECTED_BINARY_CASES = 3969;
const EXPECTED_CHECKS = 35811;

const audit = lab.auditMyersDiff();
console.table(audit.byTie);
const auditShape = {
  namedRows: audit.cases.length,
  exhaustiveBinaryCases: audit.exhaustiveBinaryCases,
  passed: audit.passed,
  total: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks
};
if (auditShape.namedRows !== EXPECTED_NAMED_CASES ||
    auditShape.exhaustiveBinaryCases !== EXPECTED_BINARY_CASES ||
    auditShape.total !== EXPECTED_GROUPS ||
    auditShape.totalChecks !== EXPECTED_CHECKS) {
  throw new Error("unexpected audit size: " + JSON.stringify(auditShape));
}
console.log(audit.exhaustiveBinaryCases + " exhaustive binary pairs checked");
console.table(audit.cases.map((row) => ({
  example: row.label,
  tie: row.tie,
  distance: row.distance,
  lcs: row.lcsLength,
  layers: row.layers,
  checks: `${row.passedChecks}/${row.totalChecks}`,
  passed: row.passed
})));
const summary =
  `${audit.passed}/${audit.total} audit groups and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`;
const failedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const exhaustiveFailures = audit.exhaustive.failedChecks.slice(0, 10);
if (!audit.ok || failedCases.length || !audit.exhaustive.passed ||
    audit.passed !== audit.total || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    issues: audit.issues.slice(0, 10),
    failedCases,
    exhaustiveFailures,
    auditShape
  }, null, 2));
}
console.log(summary);
NODE
```

The audit checks all included examples under both tie-break rules, then checks
every pair of binary sequences of length 0 through 5. That is 3,969 exhaustive
small cases and 35,811 named checks. For each case it verifies:

- the Myers edit distance equals the dynamic-programming LCS distance;
- the reconstructed script replays from the old sequence to the new sequence;
- the number of insert/delete operations equals $$D$$;
- the number of equal operations equals the LCS length;
- equal operations join equal tokens; and
- the drawn path is monotone from $$(0,0)$$ to $$(|A|,|B|)$$.

The implementation is intentionally inspectable:
[`assets/js/myers-diff-lab.js`]({{ '/assets/js/myers-diff-lab.js' | relative_url }}).

## What A Diff Does Not Know

Myers' model is about sequence equality and order. It does not know that two
lines share a key, that a function was renamed, or that a block moved intact.
That is why real review tools often layer heuristics around the core problem:
tokenization choices, unique-line anchors, whitespace handling, syntax-aware
preprocessing, histogram or patience-style matching, and output cleanup.

Those layers can improve human readability. They also change the promise. A
shortest insert/delete script is an optimization problem with a clear certificate.
A readable patch is partly a user-interface problem.

Tie-breaking is the smallest example of that distinction. When two predecessor
diagonals reach the same furthest point, preferring deletes or inserts gives a
different script with the same length. The edit graph proves both are shortest.
Only the reader can say which one is clearer.

Miller and Myers' earlier file-comparison paper described computing a shortest
sequence of insertion and deletion commands for one file to another, especially
when the files are similar.[^miller-myers] The enduring engineering lesson is
not that this is the only way to show changes. It is that a good diff keeps its
mathematical core small:

```text
tokens define equality
the edit graph defines legality
the frontier proves shortestness
the renderer decides how humans see it
```

The algorithm does not understand your code. It does something narrower and more
auditable: it walks the furthest frontier until no shorter script could have
arrived first.

[^myers]: Eugene W. Myers, ["An O(ND) Difference Algorithm and Its Variations"](https://doi.org/10.1007/BF01840446), *Algorithmica* 1, 251-266, 1986. A public PDF copy is available from the [Max Planck Institute of Molecular Cell Biology and Genetics publications server](https://publications.mpi-cbg.de/Myers_1986_6330.pdf).

[^myers-space]: Myers' paper also gives variations, including a linear-space refinement for reconstructing scripts. The lab here deliberately stores the trace so the frontier can be visualized.

[^miller-myers]: Webb Miller and Eugene W. Myers, ["A File Comparison Program"](https://onlinelibrary.wiley.com/doi/abs/10.1002/spe.4380151102), *Software: Practice and Experience* 15(11), 1025-1040, 1985. A PDF copy is indexed by [SciSpace](https://scispace.com/pdf/a-file-comparison-program-49k0a591ua.pdf).
