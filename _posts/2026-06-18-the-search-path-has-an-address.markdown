---
layout: post
title: "The Search Path Has an Address"
description: "A binary search tree can do the same comparisons and still touch very different memory blocks. A cache-oblivious layout changes the address sequence, not the search rule."
date: 2026-06-18 01:31:00 -0400
categories: computer-science
tags: [cache-oblivious-algorithms, memory-layout, binary-search-trees, data-structures, cache-efficiency, algorithms]
excerpt: "The comparison tree is not the whole data structure. Once nodes live in memory, a root-to-leaf search is also a sequence of addresses."
---

A balanced binary search tree has a tidy story:

$$
O(\log N)
$$

comparisons per search.

That statement forgets where the nodes live.

If a memory block holds $$B$$ node records, the search path is not just a list of
keys. It is a list of addresses, and the same root-to-leaf path can touch many
or few blocks depending on the layout. The tree shape chooses comparisons; the
layout chooses locality.

This is the small idea behind cache-oblivious static search trees. Do not tune
the tree to one cache-line length. Instead, recursively lay out the tree so that
subtrees of many different sizes become contiguous somewhere in memory.

## Four Ways To Put Down The Same Tree

Take a complete binary search tree with keys `1..N`.

The search algorithm is the usual one:

```text
look at the root
go left or right
repeat
```

Only the array order changes.

**Inorder** stores the keys in sorted order. That is excellent for scans, but a
tree search jumps to medians, quartiles, eighths, and so on.

**BFS / heap order** stores the root, then its children, then grandchildren. It
keeps the top of the tree tight, but lower levels sprawl across memory.

**DFS preorder** stores a node followed by its left subtree and then its right
subtree. One side of a search can become pleasantly local; the opposite side can
pay for the asymmetry.

**van Emde Boas layout** splits the tree near the middle level, lays out the top
recursive subtree, then lays out each bottom recursive subtree the same way. The
search still compares root, child, grandchild. The layout is what recurses.

Prokop's 1999 thesis introduced cache-oblivious algorithms in an ideal-cache
model and defined cache obliviousness as avoiding program variables tuned to
hardware cache parameters.[^prokop] In the same thesis, he describes a static
binary-search-tree layout competitive with B-trees without choosing a cache line
length in advance. Demaine's survey notes give the clean search-tree version:
store a complete search tree in van Emde Boas order; a search follows the normal
tree path; recursively contiguous subtrees give an $$O(\log_B N)$$ block-transfer
bound up to constants.[^demaine]

That is a theorem about a model. It is also a useful engineering lens.

## Lab: Count Blocks, Not Comparisons

The lab below builds the same complete tree under four layouts. For every key,
it follows the exact same comparison path and counts unique memory blocks
touched by that cold search. It does not simulate branch prediction, hardware
prefetch, TLBs, allocation overhead, pointer compression, or warm caches. The
only question is:

```text
if B adjacent node records arrive together, how many blocks does this path need?
```

<style>
  .cache-layout-lab {
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
  .cache-layout-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }
  .cache-layout-lab__controls label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .cache-layout-lab__controls input {
    accent-color: #0f766e;
    color: #172026;
    min-width: 0;
  }
  .cache-layout-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .cache-layout-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin-bottom: 1rem;
  }
  .cache-layout-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
  }
  .cache-layout-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 750;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .cache-layout-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.2rem;
  }
  .cache-layout-lab__metric--good strong {
    color: #0f766e;
  }
  .cache-layout-lab__metric--bad strong {
    color: #be123c;
  }
  .cache-layout-lab canvas {
    aspect-ratio: 940 / 650;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .cache-layout-lab__legend {
    align-items: center;
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.78rem;
    font-weight: 700;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .cache-layout-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }
  .cache-layout-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }
  .cache-layout-lab__note {
    color: #5d6872;
    font-size: 0.88rem;
    margin: 0.75rem 0 0;
  }
</style>

<div class="cache-layout-lab" data-cache-layout-lab>
  <div class="cache-layout-lab__controls">
    <label>
      Tree height <output data-value="height">10</output>
      <input type="range" data-param="height" min="4" max="13" step="1" value="10" aria-label="Tree height">
    </label>
    <label>
      Search key <output data-value="key">513</output>
      <input type="range" data-param="key" min="1" max="1023" step="1" value="513" aria-label="Search key">
    </label>
    <label>
      Nodes per block <output data-value="blockSize">8</output>
      <input type="range" data-param="blockSize" min="1" max="64" step="1" value="8" aria-label="Nodes per memory block">
    </label>
  </div>
  <div class="cache-layout-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="650" aria-label="Cache layout lab comparing inorder, heap-order, DFS preorder, and van Emde Boas block transfers"></canvas>
  <div class="cache-layout-lab__legend">
    <span><i style="background:#0f766e"></i>Inorder</span>
    <span><i style="background:#2563eb"></i>BFS / heap order</span>
    <span><i style="background:#7c3aed"></i>DFS preorder</span>
    <span><i style="background:#b45309"></i>van Emde Boas</span>
  </div>
  <p class="cache-layout-lab__note" data-note>
    Height 10 tree, 1023 nodes, 8 nodes per block. The selected key touches 4 vEB
    blocks and 8 BFS blocks.
  </p>
</div>

<script defer src="{{ '/assets/js/cache-layout-lab.js?v=20260618c' | relative_url }}"></script>

## The Default Run

With height `10`, `N = 1023`, block size `B = 8`, and selected key `513`, the
comparison path has ten nodes:

```text
512 -> 768 -> 640 -> 576 -> 544 -> 528 -> 520 -> 516 -> 514 -> 513
```

All four layouts search that same path. The default cold-cache audit reports:

| Layout | Average blocks over all keys | Worst blocks | Blocks for key 513 |
| --- | ---: | ---: | ---: |
| inorder | `6.89` | `8` | `7` |
| BFS / heap order | `6.89` | `8` | `8` |
| DFS preorder | `4.69` | `8` | `3` |
| van Emde Boas | `4.31` | `6` | `4` |

The vEB row is not magic. It is doing one specific thing: every time the tree is
cut around its middle level, the pieces below the cut become contiguous arrays.
A root-to-leaf path therefore passes through a small number of contiguous
recursive pieces at many possible block sizes.

The DFS row is a good warning. It can look excellent for some keys because a
preorder layout hugs one subtree tightly. Its worst case is still poor in this
complete-tree experiment. Locality should be evaluated over the query
distribution, not over the prettiest path.

To reproduce the deterministic layout sweep from the repository root, including
151 named checks for layout coverage, search-path accounting, block counts, and
the default vEB-vs-inorder comparison:

```bash
node - <<'NODE'
const lab = require("./assets/js/cache-layout-lab.js");
const EXPECTED_TOTALS = {
  cases: 5,
  passed: 5,
  total: 5,
  passedChecks: 151,
  totalChecks: 151
};
const EXPECTED_CASE_ROWS = [
  "1:8:255:4:129:8:3.997177:5.788235:5.788235:4.270588:4.223529:6:4:30/30:true",
  "2:10:1023:8:513:10:3.332863:6.889541:6.889541:4.693060:4.313783:6:4:31/31:true",
  "3:11:2047:16:1025:11:2.749824:6.948705:6.948705:4.596483:3.813385:6:4:30/30:true",
  "4:12:4095:32:3021:12:2.399930:6.978266:6.978266:4.548230:3.414408:5:4:30/30:true",
  "5:13:8191:8:7777:13:4.333275:9.877182:9.877182:6.375900:5.848126:8:6:30/30:true"
];
const EXPECTED_BASE_CHECK_NAMES = [
  "inorder key count",
  "inorder first and last key",
  "inorder unique keys",
  "bfs key count",
  "bfs first and last key",
  "bfs unique keys",
  "dfs key count",
  "dfs first and last key",
  "dfs unique keys",
  "veb key count",
  "veb first and last key",
  "veb unique keys",
  "search ends at query key",
  "search length bounded by height",
  "inorder finite average",
  "inorder finite worst",
  "inorder selected path length",
  "inorder block accounting",
  "bfs finite average",
  "bfs finite worst",
  "bfs selected path length",
  "bfs block accounting",
  "dfs finite average",
  "dfs finite worst",
  "dfs selected path length",
  "dfs block accounting",
  "veb finite average",
  "veb finite worst",
  "veb selected path length",
  "veb block accounting"
];
const EXPECTED_DEFAULT_CHECK_NAME = "default vEB improves average over inorder";

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const audit = lab.auditGrid();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const totals = {
  cases: audit.cases.length,
  passed: audit.passed,
  total: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks
};
const caseRows = audit.cases.map((row) => [
  row.caseId,
  row.height,
  row.n,
  row.blockSize,
  row.key,
  row.comparisons,
  row.logBaseB.toFixed(6),
  row.inorderAverageBlocks.toFixed(6),
  row.bfsAverageBlocks.toFixed(6),
  row.dfsAverageBlocks.toFixed(6),
  row.vebAverageBlocks.toFixed(6),
  row.vebWorstBlocks,
  row.vebSelectedBlocks,
  `${row.passedChecks}/${row.totalChecks}`,
  row.passed
].join(":"));
const checkRows = audit.cases.map((row) => ({
  caseId: row.caseId,
  checks: row.checks.map((check) => check.name)
}));
const expectedCheckRows = audit.cases.map((row) => ({
  caseId: row.caseId,
  checks: row.caseId === 2
    ? EXPECTED_BASE_CHECK_NAMES.concat([EXPECTED_DEFAULT_CHECK_NAME])
    : EXPECTED_BASE_CHECK_NAMES
}));
if (
  !sameJson(totals, EXPECTED_TOTALS) ||
  !sameJson(caseRows, EXPECTED_CASE_ROWS) ||
  !sameJson(checkRows, expectedCheckRows)
) {
  throw new Error("unexpected cache-layout audit shape: " + JSON.stringify({
    totals,
    caseRows,
    checkRows
  }, null, 2));
}
console.table(audit.cases.map((row) => ({
  case: row.caseId,
  height: row.height,
  block: row.blockSize,
  inorderAvg: row.inorderAverageBlocks.toFixed(2),
  bfsAvg: row.bfsAverageBlocks.toFixed(2),
  dfsAvg: row.dfsAverageBlocks.toFixed(2),
  vebAvg: row.vebAverageBlocks.toFixed(2),
  vebWorst: row.vebWorstBlocks,
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

## Why This Is Cache-Oblivious

A cache-aware blocked tree chooses a fanout or subtree size from the target
machine. That is often the right engineering move when the target is fixed.

A cache-oblivious layout refuses to choose $$B$$. It recursively creates
contiguous subtrees at many scales, so when a real memory hierarchy later picks a
block size, some level of the recursion is already near that scale.

The usual comparison count remains $$O(\log N)$$. The block-transfer target is

$$
O(\log_B N),
$$

where

$$
\log_B N = {\log N \over \log B}.
$$

In the default run, $$\log_8 1023 \approx 3.33$$. The simulator's vEB average of
`4.31` and worst case of `6` are in that constant-factor neighborhood. The
point is not that the toy equals the theorem. The point is that the address
sequence has moved into the right scale.

## What This Does Not Prove

The simulator assumes:

- a complete static tree;
- equal-size node records;
- cold searches counted by distinct blocks;
- no instruction-level effects;
- no prefetching or branch predictor behavior;
- no update cost.

Those assumptions matter. Prokop explicitly raised the practical question of
cache-oblivious code versus hand-tuned cache-aware code, noting early measurements
where cache-oblivious algorithms could be competitive while tuned cache-aware
programs were often faster.[^prokop-engineering] Brodal, Fagerberg, and Jacob
also compared vEB with BFS, DFS, and inorder layouts experimentally and treated
layout as an empirical systems question, not only an asymptotic one.[^brodal]

So the honest claim is narrower:

> For static binary search trees, the comparison tree and the memory layout are
> separate choices. van Emde Boas layout is a portable way to buy locality across
> block sizes without hard-coding the block size.

Dynamic dictionaries add another layer. Bender, Demaine, and Farach-Colton built
cache-oblivious B-trees that support updates while remaining independent of
memory hierarchy parameters; their result is about a full data structure, not
just a static array permutation.[^bender]

## The Small Moral

An algorithm can be oblivious to a parameter without being oblivious to physics.

The vEB layout never asks for the cache-line length. It still respects the fact
that memory arrives in chunks. That is the neat trick: use recursion to leave
promises at every scale, then let the hardware choose which promises it cashes.

The tree did not get fewer comparisons. It got better addresses.

## Sources

[^prokop]: Harald Prokop, ["Cache-Oblivious Algorithms"](https://ocw.mit.edu/courses/6-895-theory-of-parallel-systems-sma-5509-fall-2003/6dc7de52dcf13b53cebf2fe10ae6752a_cach_oblvs_thsis.pdf), MIT master's thesis, 1999. The thesis defines cache-oblivious algorithms as avoiding hardware-configuration variables such as cache size and line length, and introduces the ideal-cache model.

[^demaine]: Erik D. Demaine, ["Cache-Oblivious Algorithms and Data Structures"](https://erikdemaine.org/papers/BRICS2002/paper.pdf), BRICS Lecture Series, 2002. Section 7 describes the van Emde Boas layout as a recursive memory layout for complete binary search trees while the search algorithm itself remains the usual tree search.

[^prokop-engineering]: Prokop, *Cache-Oblivious Algorithms*, Section 10.1, discusses engineering cache-oblivious algorithms and reports early measurements suggesting cache-oblivious algorithms can rival hand-tuned cache-aware code, while tuned cache-aware code is often faster in practice.

[^brodal]: Gerth Stølting Brodal, Rolf Fagerberg, and Riko Jacob, ["Cache Oblivious Search Trees via Binary Trees of Small Height"](https://www.cs.au.dk/~gerth/papers/soda02.pdf), SODA 2002. The paper compares van Emde Boas, BFS, DFS, and inorder layouts and states the vEB layout's asymptotically optimal search-transfer behavior.

[^bender]: Michael A. Bender, Erik D. Demaine, and Martin Farach-Colton, ["Cache-Oblivious B-Trees"](https://erikdemaine.org/papers/CacheObliviousBTrees_SICOMP/paper.pdf), *SIAM Journal on Computing* 35(2), 2005. The paper presents dynamic search trees independent of block sizes and memory-level speeds, matching B-tree-style search bounds in the cache-oblivious model.
