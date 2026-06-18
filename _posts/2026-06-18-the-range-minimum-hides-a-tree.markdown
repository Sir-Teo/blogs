---
layout: post
title: "The Range Minimum Hides a Tree"
description: "A Cartesian tree turns array order into inorder traversal and range minima into lowest common ancestors. The monotone stack is the linear-time receipt."
date: 2026-06-18 07:52:00 -0400
categories: computer-science
tags: [cartesian-tree, range-minimum-query, lowest-common-ancestor, monotonic-stack, data-structures, algorithms]
excerpt: "Range-minimum queries look like array questions, but the array has a tree inside it. Once the Cartesian tree is built, the minimum between two positions is their lowest common ancestor."
---

A range-minimum query sounds like an array problem:

```text
given A[0..n-1], return the index of the smallest value in A[i..j]
```

The surprising answer is that the array is carrying a tree.

A Cartesian tree over an array has two contracts:

```text
inorder traversal visits indices 0, 1, 2, ..., n-1
each parent has value <= each child
```

The first contract preserves array order. The second contract makes small
values rise toward the root. Together they imply the useful fact:

```text
RMQ(i, j) = LCA(i, j) in the Cartesian tree
```

That is a reduction, not just a drawing. It says a contiguous subarray question
can be turned into a tree ancestor question.

## The Splitter

Assume for a moment all values are distinct. Take a query interval `A[i..j]`.
Let `k` be the index of the minimum value inside that interval.

In the Cartesian tree, `k` must sit above every other index in `i..j`. If some
smaller ancestor inside the interval existed, `k` would not be the minimum. If
`k` were below a node inside the interval, the heap property would put that node
no larger than `A[k]`, again contradicting the choice of `k`.

The other half is the inorder contract. Any node whose index lies between `i`
and `j` appears between them in the inorder traversal. The first node that can
separate index `i` from index `j` while still being inside that interval is
their lowest common ancestor. Because the tree is heap-ordered by array value,
that splitter is exactly the minimum.

With duplicate values, the tree needs a tie rule. The lab below lets you choose
leftmost or rightmost duplicate minima. The theorem still holds as long as the
same tie rule is used by the stack construction, the heap comparison, and the
RMQ answer.

## Build It With a Stack

The direct recursive definition is clear but wasteful:

```text
root = index of minimum A[l..r]
left subtree = Cartesian tree of A[l..root-1]
right subtree = Cartesian tree of A[root+1..r]
```

If we scan for a minimum at every recursive call, a sorted array costs quadratic
time. The linear construction uses a monotone stack:

```text
for each index i from left to right:
    last = none
    while stack top is larger than A[i]:
        last = pop stack
    if stack is nonempty:
        i becomes the right child of the stack top
    if last exists:
        last becomes the left child of i
    push i
```

Every index is pushed once. Every index can be popped once. The stack is not a
heuristic; it is the right spine of the partial Cartesian tree.

Jean Vuillemin's 1980 paper introduced Cartesian trees as a geometric data
structure whose labels form both a binary-search order in one coordinate and a
heap-like tournament in the other.[^vuillemin] Gabow, Bentley, and Tarjan used
Cartesian trees in the range-minimum-query lineage a few years later.[^gbt] The
RMQ/LCA connection then became a standard bridge in work on succinct and
constant-time query structures. Bender and Farach-Colton's LCA paper states the
link directly: the RMQ of two array indices is the LCA of the corresponding
nodes in the Cartesian tree.[^bfc]

The lab here stops before the full constant-time preprocessing machinery. It
builds the tree in linear time, answers the displayed LCA by climbing parent
chains, and exhaustively audits every interval in the small example. The point
is to make the structural reduction visible.

## Lab: The Minimum Becomes an Ancestor

<style>
  .cart-rmq-lab {
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

  .cart-rmq-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
    margin-bottom: 1rem;
  }

  .cart-rmq-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .cart-rmq-lab select,
  .cart-rmq-lab input {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    box-sizing: border-box;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.48rem 0.52rem;
    width: 100%;
  }

  .cart-rmq-lab input {
    accent-color: #0f766e;
    padding: 0;
  }

  .cart-rmq-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .cart-rmq-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin-bottom: 0.85rem;
  }

  .cart-rmq-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    min-width: 0;
    padding: 0.62rem 0.68rem;
  }

  .cart-rmq-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .cart-rmq-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.24rem;
  }

  .cart-rmq-lab__metric--good strong {
    color: #0f766e;
  }

  .cart-rmq-lab__metric--bad strong {
    color: #be123c;
  }

  .cart-rmq-lab canvas {
    aspect-ratio: 960 / 680;
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-height: 760px;
    width: 100%;
  }

  .cart-rmq-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 620px) {
    .cart-rmq-lab {
      padding: 0.85rem;
    }

    .cart-rmq-lab canvas {
      aspect-ratio: 430 / 780;
      max-height: none;
    }
  }
</style>

<div class="cart-rmq-lab" data-cartesian-rmq-lab>
  <div class="cart-rmq-lab__controls">
    <label>
      Array
      <select data-param="scenario">
        <option value="jagged" selected>jagged telemetry</option>
        <option value="plateau">duplicate minima</option>
        <option value="valley">wide valley</option>
        <option value="saw">sawtooth</option>
      </select>
    </label>
    <label>
      Duplicate tie
      <select data-param="tie">
        <option value="left" selected>leftmost minimum</option>
        <option value="right">rightmost minimum</option>
      </select>
    </label>
    <label>
      Query start <output data-value="start">2</output>
      <input data-param="start" type="range" min="0" max="11" step="1" value="2">
    </label>
    <label>
      Query end <output data-value="end">9</output>
      <input data-param="end" type="range" min="0" max="11" step="1" value="9">
    </label>
  </div>
  <div class="cart-rmq-lab__metrics" data-metrics></div>
  <canvas data-canvas width="960" height="680" aria-label="Cartesian tree range-minimum-query lab"></canvas>
  <p class="cart-rmq-lab__note">This is a structural RMQ/LCA lab, not a full constant-time RMQ implementation. The displayed LCA is found by parent climbing because the examples are intentionally small.</p>
</div>

<script defer src="{{ '/assets/js/cartesian-rmq-lab.js?v=20260618b' | relative_url }}"></script>

## What The Audit Proves

The exported Node audit runs all four arrays under both duplicate policies. For
each case it checks:

```text
inorder traversal is exactly 0,1,2,...,n-1
the heap property holds under the selected tie rule
there is exactly one root
the displayed RMQ equals the displayed LCA
every interval in the array has RMQ(i,j) = LCA(i,j)
```

Representative outputs from the current script:

```text
jagged telemetry, leftmost, query 2..9:
  RMQ index 6, LCA index 6, value 28
  tree height 5, stack pops 10, max stack 3

duplicate minima, query 4..8:
  leftmost tie  -> RMQ index 4
  rightmost tie -> RMQ index 8

sawtooth, query 0..11:
  RMQ index 11, LCA index 11, value 0
```

The compact reproduction check is:

```js
const lab = require("./assets/js/cartesian-rmq-lab.js");

const audit = lab.auditCartesianRmqLab();
const failed = audit.cases.filter((row) => !row.passed)
  .concat(audit.edgeCases.filter((row) => !row.passed));
if (failed.length || !audit.ok || audit.passed !== audit.total) {
  throw new Error(JSON.stringify({
    failed,
    passed: audit.passed,
    total: audit.total
  }, null, 2));
}

console.table(audit.cases.map((row) => ({
  scenario: row.scenario,
  tie: row.tie,
  intervals: row.intervalsChecked,
  rmq: row.minIndex,
  lca: row.lcaIndex,
  value: row.value,
  height: row.height,
  pops: row.pops
})));
console.table(audit.edgeCases);
```

The duplicate-minimum case is the useful edge. The array contains several `2`
values. Neither answer is inherently wrong. The structure must declare which
equal value wins, then keep that policy consistent everywhere.

## Why This Reduction Matters

Static RMQ has many possible implementations:

```text
scan the interval each time:     O(1) preprocessing, O(width) query
sparse table:                    O(n log n) preprocessing, O(1) query
Cartesian tree plus LCA:         reduce RMQ to a tree problem
succinct RMQ structures:         exploit the tree shape near information limits
```

The Cartesian tree route is beautiful because it separates two ideas that are
easy to confuse:

1. The array-specific part is just the tree construction.
2. The query-speed part can be delegated to an LCA data structure.

Bender and Farach-Colton used an Euler tour to reduce LCA back to an RMQ over
tree depths, then used the plus-minus-one structure of that depth array to get a
simple optimal algorithm.[^bfc] That circular-looking pair of reductions is not
a paradox. It says RMQ and LCA share a core shape, and the implementation wins
by choosing the representation where that shape is easiest to preprocess.

## Where The Stack Gets Its Power

The monotone stack works because only the right spine of the partial tree is
still negotiable.

After scanning `A[0..i-1]`, all earlier nodes have fixed inorder positions. The
new node `i` must be to the right of everything already seen. It can only become
a right child somewhere on the right spine, or it can steal a suffix of that
spine as its left subtree. Popping larger spine nodes finds exactly that suffix.

That is the same shape as many monotone-stack algorithms:

```text
nearest smaller element
largest rectangle in a histogram
stock-span style waits
Cartesian tree construction
```

The stack is a certificate that the algorithm did not rescan old work. Every
element leaves the stack once, at the moment a smaller later value proves where
that element belongs.

## The Card To Keep

For an array that never changes:

```text
build the Cartesian tree once
preprocess for LCA if query volume justifies it
answer interval minima through ancestor structure
```

For an array that changes, this exact structure is no longer the whole answer.
One update can change many ancestor relationships. Then a segment tree, Fenwick
tree for prefix-like operations, block decomposition, or a dynamic tree becomes
the better starting point.

The Cartesian tree earns its place when the data is static and the query is
local in array order but extremal in value. It turns a flat interval into the
first ancestor where the two ends meet.

[^vuillemin]: Jean Vuillemin, ["A Unifying Look at Data Structures"](https://dl.acm.org/doi/10.1145/358841.358852), *Communications of the ACM*, 23(4), 1980. A public PDF copy is hosted in Princeton course materials: [geo-st.pdf](https://www.cs.princeton.edu/courses/archive/spr09/cos423/Lectures/geo-st.pdf).

[^gbt]: Harold N. Gabow, Jon Louis Bentley, and Robert E. Tarjan, ["Scaling and related techniques for geometry problems"](https://dl.acm.org/doi/10.1145/800057.808675), *Proceedings of the 16th Annual ACM Symposium on Theory of Computing*, 1984. The paper is a classic source in the Cartesian-tree/RMQ lineage.

[^bfc]: Michael A. Bender and Martin Farach-Colton, ["The LCA Problem Revisited"](https://www3.cs.stonybrook.edu/~bender/newpub/BenderFa00-lca.pdf), LATIN 2000. The paper states the RMQ and LCA problems together and gives the Cartesian-tree reduction `RMQ_A(i,j) = LCA_C(i,j)`.
