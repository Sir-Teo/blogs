---
layout: post
title: "The Parent Pointer Learns a Shortcut"
description: "Union-find keeps a changing partition by storing parent pointers. Union by rank keeps the trees shallow; path compression makes every search repair the road it just used."
date: 2026-06-18 00:18:00 -0400
categories: computer-science
tags: [union-find, disjoint-set-union, data-structures, path-compression, amortized-analysis, algorithms]
excerpt: "A disjoint-set forest is not fast because every pointer is perfect. It is fast because finds are allowed to improve the forest they traverse."
---

A union-find structure keeps track of a partition:

```text
which items are known to belong together?
```

It supports two ordinary questions:

```text
find(x)       -> which representative names x's set?
union(x, y)   -> merge the two sets
```

That sounds too small to deserve a famous data structure. But the operation
shows up wherever equality, connectivity, or "these two things now belong to
the same component" arrives incrementally: Kruskal's minimum spanning tree,
type unification, connected-component labeling, offline graph algorithms,
percolation simulations, image segmentation, and compiler bookkeeping.

The trick is not that the forest is always tidy.

The trick is that every lookup is allowed to tidy it.

## Representatives Are Just Roots

The forest representation is almost embarrassingly plain. Every item stores one
parent pointer. A root points to itself. The representative of `x` is the root
reached by following parents:

```text
find(x):
  while parent[x] != x:
    x = parent[x]
  return x
```

To merge two sets, find both roots and attach one root under the other:

```text
union(x, y):
  rx = find(x)
  ry = find(y)
  if rx != ry:
    parent[rx] = ry
```

This already maintains the partition invariant. It also admits a terrible
shape. If unions keep attaching the older root under the newer root, the forest
can become a chain:

```text
0 -> 1 -> 2 -> 3 -> ... -> n-1
```

Now `find(0)` costs $$n-1$$ parent traversals.

Galler and Fischer's 1964 paper introduced an improved tree-based equivalence
algorithm for compiler storage assignment in Fortran-like `EQUIVALENCE`,
`DIMENSION`, and `COMMON` settings.[^galler-fischer] The modern disjoint-set
forest grew from exactly this kind of mundane pressure: many equivalence claims,
many representative queries, and no appetite for rewriting whole sets on every
merge.

## Rank Prevents Ambition

The first repair is to stop attaching large trees under small ones. A common
rule is union by rank:

```text
if rank[rx] < rank[ry]: parent[rx] = ry
if rank[rx] > rank[ry]: parent[ry] = rx
if ranks tie:
  parent[ry] = rx
  rank[rx] += 1
```

Rank is not necessarily the current height after path compression begins. It is
a certificate left behind by earlier balanced merges.

The useful invariant is:

```text
if a root has rank r, its component contains at least 2^r items
```

That is an induction. Rank starts at zero with one item. A rank only increases
when two roots of equal rank merge. If both roots of rank `r` have at least
`2^r` items, the new root of rank `r+1` has at least `2^(r+1)` items.

So rank cannot grow past $$\lfloor \log_2 n \rfloor$$. This alone prevents the
obvious chain disaster.

## Compression Repairs the Road

Path compression changes `find`. After walking from `x` to the root, it points
the nodes on that path directly to the root:

```text
find(x):
  walk x -> ... -> root
  for every node on the path:
    parent[node] = root
  return root
```

This does not change the partition. It only changes the route by which future
queries discover the representative.

That distinction is the whole data structure:

```text
membership is invariant
parent pointers are negotiable
```

Hopcroft and Ullman studied set-merging algorithms before the final modern
bound was understood.[^hopcroft-ullman] Tarjan's 1975 paper gave the classic
analysis for the good forest algorithm, showing that the combined heuristics
run in amortized time governed by an inverse-Ackermann function.[^tarjan] Galil
and Italiano's survey is a useful map of the broader family of disjoint-set
union results and variants.[^galil-italiano]

I am not going to rederive Tarjan's proof here. The useful engineering reading
is narrower and safer:

```text
rank stops trees from becoming tall quickly
compression spends each find to make later finds cheaper
the amortized cost is effectively constant for ordinary input sizes
```

"Effectively constant" is interpretation, not the theorem. The theorem has an
inverse-Ackermann term. The reason programmers treat it as constant is that the
function grows so slowly on any input size they will see.

## Lab: Let the Forest Rewrite Itself

The lab below runs the same deterministic workload through four policies:

- plain linking;
- path compression only;
- union by rank only;
- union by rank plus path compression.

The workload intentionally mixes a chain-shaped prefix with random unions and
repeated finds. Plain linking uses the bad rule `parent[rootA] = rootB`, so it
is allowed to demonstrate the failure mode.

With the default settings:

```text
items:          48
chain unions:   20
random unions:  90
repeated finds: 120
seed:           111
```

the measured results are:

| Policy | Parent traversals | Parent writes | Max depth | Avg depth |
| --- | ---: | ---: | ---: | ---: |
| plain linking | 4451 | 46 | 31 | 12.250 |
| compression only | 411 | 191 | 2 | 1.000 |
| rank only | 442 | 46 | 2 | 1.604 |
| rank + compression | 318 | 76 | 2 | 0.979 |

Do not read those as universal benchmarks. They are this workload. The point is
that the same final partition can be represented by very different parent
forests.

<style>
  .union-find-lab {
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

  .union-find-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .union-find-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .union-find-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .union-find-lab input,
  .union-find-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .union-find-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .union-find-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 0.9rem;
  }

  .union-find-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .union-find-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.36);
  }

  .union-find-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.36);
  }

  .union-find-lab__metric span {
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

  .union-find-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.8rem, 2.2vw, 1rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .union-find-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .union-find-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="union-find-lab" data-union-find-lab>
  <div class="union-find-lab__controls">
    <label>
      Items
      <output data-value="items">48</output>
      <input type="range" min="8" max="96" step="1" value="48" data-param="items">
    </label>
    <label>
      Chain unions
      <output data-value="chainUnions">20</output>
      <input type="range" min="0" max="120" step="1" value="20" data-param="chainUnions">
    </label>
    <label>
      Random unions
      <output data-value="randomUnions">90</output>
      <input type="range" min="0" max="180" step="1" value="90" data-param="randomUnions">
    </label>
    <label>
      Repeated finds
      <output data-value="repeatedFinds">120</output>
      <input type="range" min="0" max="240" step="1" value="120" data-param="repeatedFinds">
    </label>
    <label>
      Random seed
      <output data-value="seed">111</output>
      <input type="range" min="1" max="9999" step="1" value="111" data-param="seed">
    </label>
    <label>
      Focus view
      <select data-param="focus" aria-label="Focused union-find variant">
        <option value="plain">plain linking</option>
        <option value="compression">compression only</option>
        <option value="rank">rank only</option>
        <option value="rankCompression" selected>rank + compression</option>
      </select>
    </label>
  </div>
  <div class="union-find-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Interactive union-find lab comparing plain linking, path compression, union by rank, and the combined structure"></canvas>
  <p class="union-find-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/union-find-lab.js?v=20260618c' | relative_url }}"></script>

## What the Audit Checks

The lab does not trust the forest to validate itself. It runs a naive partition
oracle beside every variant. The oracle stores one label per item and rewrites
all labels on every union. That is slow, but easy to inspect.

The audit checks:

- every variant agrees with the oracle partition;
- rank variants satisfy the rank-size invariant;
- the fast variant is no deeper than plain linking on the tested workloads;
- the fast variant uses no more parent traversals than plain linking;
- path compression shortens a deliberately constructed chain;
- all variants execute the same operation counts;
- all variants end with the same component count.

The exported audit reports 35 named checks: seven invariants across each of the
five deterministic workloads below.

The current deterministic audit grid is:

| Items | Chain unions | Random unions | Finds | Plain traversals | Fast traversals | Plain depth | Fast depth |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 48 | 20 | 90 | 120 | 4451 | 318 | 31 | 2 |
| 16 | 15 | 0 | 64 | 657 | 59 | 15 | 1 |
| 48 | 8 | 70 | 120 | 1323 | 247 | 13 | 1 |
| 72 | 0 | 150 | 120 | 2468 | 374 | 19 | 1 |
| 96 | 95 | 60 | 200 | 19123 | 356 | 95 | 1 |

You can reproduce that table from the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/union-find-lab.js");
const audit = lab.auditGrid();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (audit.total !== 5 || audit.totalChecks !== 35) {
  throw new Error(
    `unexpected audit size: ${audit.total} cases, ${audit.totalChecks} checks`
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
  throw new Error(`${summary}: ${JSON.stringify(failed, null, 2)}`);
}
console.table(audit.cases.map((row) => ({
  items: row.items,
  chain: row.chainUnions,
  random: row.randomUnions,
  finds: row.repeatedFinds,
  plainTraversals: row.plainTraversals,
  fastTraversals: row.fastTraversals,
  plainDepth: row.plainMaxDepth,
  fastDepth: row.fastMaxDepth,
  checks: `${row.passedChecks}/${row.totalChecks}`,
  passed: row.passed
})));
console.log(summary);
NODE
```

## Why the Shortcut Is Safe

Path compression can feel suspicious because it rewrites many parent pointers
during a query. The reason it is safe is that those pointers are not the data.
The data is the partition.

If every node on a path already reaches root `r`, then replacing its parent with
`r` preserves the representative:

```text
before: x -> ... -> r
after:  x -> r
```

The route changes. The set membership does not.

That is also why union-find is a nice example of amortized thinking. A `find`
operation is allowed to pay a little extra bookkeeping because that bookkeeping
changes the cost of future operations. Looking at one call in isolation misses
the contract. The structure is not promising:

```text
every operation has the same worst-case pointer count
```

It is promising something closer to:

```text
over a sequence of operations,
the expensive walks flatten the forest that caused them
```

That is the mood of the Tarjan result. The forest learns from being traversed.

[^galler-fischer]: Bernard A. Galler and Michael J. Fischer, ["An Improved Equivalence Algorithm"](https://moscova.inria.fr/~levy/courses/X/IF/03/pi/levy2/fischer-galler.pdf), *Communications of the ACM* 7(5), 1964. ACM record: <https://dl.acm.org/doi/10.1145/364099.364331>.

[^hopcroft-ullman]: John E. Hopcroft and Jeffrey D. Ullman, ["Set Merging Algorithms"](https://epubs.siam.org/doi/10.1137/0202024), *SIAM Journal on Computing* 2(4), 1973.

[^tarjan]: Robert Endre Tarjan, ["Efficiency of a Good But Not Linear Set Union Algorithm"](https://dl.acm.org/doi/pdf/10.1145/321879.321884), *Journal of the ACM* 22(2), 1975. The paper gives the classic inverse-Ackermann amortized analysis for the combined forest heuristics.

[^galil-italiano]: Zvi Galil and Giuseppe F. Italiano, ["Data Structures and Algorithms for Disjoint Set Union Problems"](https://academiccommons.columbia.edu/doi/10.7916/D8FB5B0J/download), *ACM Computing Surveys* 23(3), 1991. The survey organizes the union-find family and its historical analyses.
