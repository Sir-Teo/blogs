---
layout: post
title: "The Tree Fits in the Parentheses"
description: "Succinct tree representations separate topology from navigation: a rooted ordered tree can live in a balanced-parentheses bitstring, while rank, select, and excess make it usable."
date: 2026-06-18 02:35:00 -0400
categories: computer-science
tags: [succinct-data-structures, rank-select, balanced-parentheses, trees, data-structures, algorithms]
excerpt: "A pointer tree stores where every edge goes. A succinct tree stores the walk around the tree, then teaches the bitstring how to answer navigation questions."
---

A pointer tree is a map with street signs at every intersection.

That is comfortable. It is also expensive. Every child pointer says where to go
next using enough bits to name a memory address. For a large static tree, those
pointers can dominate the thing being represented.

Succinct data structures ask a sharper question:

```text
how close can the representation get to the information-theoretic minimum
without losing the operations?
```

For rooted ordered trees, one of the cleanest answers is almost comic. Walk the
tree in depth-first order. Write an open parenthesis when you enter a node and a
close parenthesis when you leave it.

```text
enter node  ->  (
leave node  ->  )
```

Encode `(` as `1` and `)` as `0`. A tree with $$n$$ nodes becomes exactly
$$2n$$ bits of topology.

The string is not a serialization side effect. It is the data structure.

## The Tape Is The Shape

Take this small ordered tree:

```text
root
  src
    lexer
    parser
    types
  tests
    unit
    golden
  docs
    api
    notes
```

Its depth-first parenthesis tape is:

```text
((()()())(()())(()()))
```

There are 11 nodes and 22 parentheses. The first `(` is `root`. The second `(`
is `src`. The three little `()` pairs inside `src` are `lexer`, `parser`, and
`types`. When the excess returns to the level before `src`, the `src` subtree is
over.

Define the excess after position $$i$$ as:

$$
\mathrm{excess}(i)
=
\#\text{opens up to }i
-
\#\text{closes up to }i.
$$

This is just stack height. It is also the bridge from parentheses to tree
navigation.

If a node opens at position $$p$$, then:

- its preorder number is `rank1(p) - 1`;
- its matching close is the first later position where excess returns to
  `excess_before(p)`;
- its subtree size is `(close(p) - p + 1) / 2`;
- its first child, if any, opens at `p + 1`;
- its next sibling, if any, opens just after its matching close.

The identities are small. The hard part is answering them fast without
reintroducing a pointer table.

Jacobson's 1989 FOCS paper made this tradeoff explicit for static trees and
graphs: use far fewer bits than pointer structures while keeping traversal
operations efficient.[^jacobson] Munro and Raman later gave balanced-parentheses
and static-tree representations using space within a lower-order term of the
information-theoretic minimum, with a rich set of navigation operations in
constant time.[^munro-raman]

That phrase "lower-order term" is the important accounting line. The raw
parentheses carry the topology. Extra index bits carry speed.

## Rank And Select Are The First Index

For a bitvector $$B$$:

```text
rank1(i)   = number of 1 bits in B[0..i]
select1(k) = position of the k-th 1 bit
```

On a balanced-parentheses tree, opens are nodes. That means `select1(k)` jumps
to the open parenthesis of preorder node `k`, and `rank1(open) - 1` recovers a
node's preorder number.

A real succinct rank/select structure uses hierarchical summaries and word-level
tables so most queries do not scan. The lab below uses a deliberately visible
two-level directory:

```text
superblock total + block total + tiny local scan
```

That directory is oversized for the toy tree. It is there to show the invariant,
not to win a compression contest.

<style>
  .succinct-tree-lab {
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

  .succinct-tree-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .succinct-tree-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .succinct-tree-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .succinct-tree-lab input,
  .succinct-tree-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .succinct-tree-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .succinct-tree-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 0.9rem;
  }

  .succinct-tree-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .succinct-tree-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .succinct-tree-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.38);
  }

  .succinct-tree-lab__metric span {
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

  .succinct-tree-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.78rem, 2.2vw, 1rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .succinct-tree-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .succinct-tree-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="succinct-tree-lab" data-succinct-tree-lab>
  <div class="succinct-tree-lab__controls">
    <label>
      Tree shape
      <output data-value="shape">catalog tree</output>
      <select data-param="shape" aria-label="Tree shape">
        <option value="catalog" selected>Catalog tree</option>
        <option value="chain">Deep tree</option>
        <option value="bushy">Bushy tree</option>
        <option value="trie">Tiny trie</option>
      </select>
    </label>
    <label>
      Focus node
      <output data-value="focus">1</output>
      <input type="range" min="0" max="10" step="1" value="1" data-param="focus" aria-label="Focused node id">
    </label>
    <label>
      Rank position
      <output data-value="rankPos">15</output>
      <input type="range" min="0" max="21" step="1" value="15" data-param="rankPos" aria-label="Bit position for rank query">
    </label>
  </div>
  <div class="succinct-tree-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="720" aria-label="Succinct tree lab showing an ordered tree, balanced-parentheses tape, rank directory, and navigation ledger"></canvas>
  <p class="succinct-tree-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/succinct-tree-lab.js?v=20260618c' | relative_url }}"></script>

## What The Default Run Checks

For the default catalog tree:

```text
nodes                 = 11
balanced parens       = 22 bits
rooted-tree floor     = log2(C_10) = 14.0 bits
visible rank directory = 40 bits
pointer-ish ledger     = 132 bits
```

The directory is larger than the topology because this is a small teaching
case. The point is the split: topology bits describe the tree; directory bits
make chosen operations fast.

The focused node is `src`, preorder node `1`:

```text
open position      = 1
matching close     = 8
depth              = 1
parent             = root
first child        = lexer
next sibling       = tests
subtree nodes      = 4
```

At rank position `15`, the visible directory computes:

```text
rank1(15) = superblock rank 0 + block rank 7 + local tail 2 = 9
```

Move the focus slider and watch the green interval expand and contract on the
tape. A leaf is just `()`. An internal node is a balanced substring whose pairs
are exactly the nodes in the subtree.

## Reproducibility Check

The browser lab is also a CommonJS module. From the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/succinct-tree-lab.js");
const EXPECTED_TOTALS = {
  rows: 180,
  shapes: 4,
  passed: 180,
  total: 180,
  passedChecks: 1620,
  totalChecks: 1620
};
const EXPECTED_BY_SHAPE = [
  "catalog:44:11:22:40:44:396/396",
  "chain:44:11:22:40:44:396/396",
  "bushy:48:12:24:40:48:432/432",
  "trie:44:11:22:40:44:396/396"
];
const EXPECTED_FOCUS_SHAPE = [
  "catalog:44:112:11:0,3,11,21:0:11|1:4|2:1|3:1|4:1|5:3|6:1|7:1|8:3|9:1|10:1",
  "chain:44:152:11:0,3,11,21:0:11|1:7|2:1|3:5|4:4|5:3|6:1|7:1|8:3|9:1|10:1",
  "bushy:48:116:12:0,3,12,23:0:12|1:3|2:1|3:4|4:1|5:2|6:1|7:1|8:1|9:1|10:1|11:1",
  "trie:44:124:11:0,3,11,21:0:11|1:4|2:3|3:1|4:1|5:3|6:2|7:1|8:3|9:1|10:1"
];
const EXPECTED_CHECK_NAMES = [
  "balanced parentheses finish at zero",
  "two bits per node",
  "rank directory matches direct rank",
  "select(rank(open)) returns each open",
  "matching closes recover DFS intervals",
  "scanned parents match source tree",
  "first child navigation matches source tree",
  "next sibling navigation matches source tree",
  "focus interval contains full subtree"
];

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const audit = lab.auditGrid();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const totals = {
  rows: audit.cases.length,
  shapes: audit.byShape.length,
  passed: audit.passed,
  total: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks
};
const byShapeRows = audit.byShape.map((row) => [
  row.shape,
  row.cases,
  row.nodes,
  row.topologyBits,
  row.directoryBits,
  row.passed,
  `${row.passedChecks}/${row.totalChecks}`
].join(":"));
const focusGroups = new Map();
for (const row of audit.cases) {
  if (!focusGroups.has(row.shape)) {
    focusGroups.set(row.shape, {
      maxSubtree: 0,
      rankKeys: new Set(),
      rows: 0,
      subtreeSum: 0,
      focusKeys: new Set()
    });
  }
  const group = focusGroups.get(row.shape);
  group.rows += 1;
  group.subtreeSum += row.subtreeNodes;
  group.maxSubtree = Math.max(group.maxSubtree, row.subtreeNodes);
  group.rankKeys.add(String(row.rankPos));
  group.focusKeys.add(`${row.focus}:${row.subtreeNodes}`);
}
const focusShapeRows = audit.byShape.map((row) => {
  const group = focusGroups.get(row.shape);
  return [
    row.shape,
    group.rows,
    group.subtreeSum,
    group.maxSubtree,
    Array.from(group.rankKeys).join(","),
    Array.from(group.focusKeys).join("|")
  ].join(":");
});
const checkRows = audit.cases.map((row) => row.checks.map((check) => check.name));
console.table(audit.byShape);
if (
  !sameJson(totals, EXPECTED_TOTALS) ||
  !sameJson(byShapeRows, EXPECTED_BY_SHAPE) ||
  !sameJson(focusShapeRows, EXPECTED_FOCUS_SHAPE) ||
  !checkRows.every((checks) => sameJson(checks, EXPECTED_CHECK_NAMES))
) {
  throw new Error("unexpected succinct-tree audit shape: " + JSON.stringify({
    totals,
    byShapeRows,
    focusShapeRows,
    firstCheckRows: checkRows.slice(0, 3)
  }, null, 2));
}
const summary =
  `${audit.passed}/${audit.total} cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`;
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

The current audit grid has 180 cases and 1620 named checks. It checks every
focus node in all four tree shapes and several rank positions. The checks
include:

- final excess is zero and never goes negative;
- exactly two topology bits are emitted per node;
- the two-level rank directory matches direct rank;
- `select1(rank1(open) - 1)` returns each node's open position;
- matching closes recover DFS subtree intervals;
- scanned parent, first-child, and next-sibling operations match the source
  tree; and
- the focus interval contains exactly the recursive subtree count.

The implementation is intentionally small:
[`assets/js/succinct-tree-lab.js`]({{ '/assets/js/succinct-tree-lab.js' | relative_url }}).

## Where The Toy Stops

The lab's `findClose` and parent search are readable scans. That is not the
full succinct-tree theorem. Production representations add more indexing over
the excess sequence so matching parentheses, ancestors, descendants, degree,
subtree size, and level-ancestor style operations can be answered quickly.

Navarro and Sadakane's range min-max tree is a useful modern lens: many tree
operations reduce to a small set of primitives over the parenthesis excess
sequence, and the static representation can stay at $$2n + o(n)$$ bits while
supporting a large operation set.[^navarro-sadakane]

So the mental model is:

```text
balanced parentheses: the topology
rank/select: addresses for opens
excess/min-max indexes: navigation without pointers
```

The miracle is not that parentheses can serialize a tree. Anyone can serialize
a tree. The miracle is that the string can remain close to the information
minimum while still behaving like a data structure.

[^jacobson]: Guy Jacobson, ["Space-efficient static trees and graphs"](https://www.computer.org/csdl/proceedings-article/focs/1989/063533/12OmNx2QUHQ), *FOCS*, 1989. DOI: [10.1109/SFCS.1989.63533](https://doi.org/10.1109/SFCS.1989.63533).

[^munro-raman]: J. Ian Munro and Venkatesh Raman, ["Succinct Representation of Balanced Parentheses and Static Trees"](https://epubs.siam.org/doi/abs/10.1137/S0097539799364092), *SIAM Journal on Computing* 31(3), 762-776, 2001.

[^navarro-sadakane]: Gonzalo Navarro and Kunihiko Sadakane, ["Fully-Functional Static and Dynamic Succinct Trees"](https://arxiv.org/abs/0905.0768), arXiv version, 2009; later *ACM Transactions on Algorithms* 10(3), Article 16, 2014, DOI: [10.1145/2601073](https://doi.org/10.1145/2601073).
