---
layout: post
title: "The List Grows Towers"
description: "Skip lists replace tree rotations with coin flips. The trick works because a random tower of forward pointers gives logarithmic search in expectation while keeping insertion local."
date: 2026-06-16 21:24:00 -0400
categories: computer-science
tags: [skip-list, data-structures, randomized-algorithms, databases, leveldb, rocksdb, algorithms, visualization]
excerpt: "A skip list is not a balanced tree drawn strangely. It is a sorted linked list that lets randomness decide which nodes become express lanes."
---

A sorted linked list is honest and terrible.

It keeps the keys in order. It gives iteration for free. It inserts by changing
a couple of pointers. Then it asks you to walk one node at a time.

Balanced trees fix that walk with structure. Red-black trees, AVL trees, and
B-trees make the path short by maintaining invariants after updates. The price
is machinery: rotations, colors, heights, page splits, merge cases, and the
little suspicion that the deletion code was written by someone in a difficult
mood.

William Pugh's skip list keeps the list and throws away most of the ceremony.
When a key is inserted, it gets a random height. Height 1 means the node only
appears in the bottom list. Height 2 means it also appears in the list above.
Height 3 means it appears one level higher, and so on. A search starts at the
top left, walks right while it can, and drops down when the next jump would
overshoot.

No rotations.

No stored balance factor.

Just a sorted list that grows towers.

The unsettling part is that this is not a toy. Pugh's 1990 CACM paper framed
skip lists as a probabilistic alternative to balanced trees, with expected
search, insertion, and deletion time of order $$O(\log n)$$ and very simple
local update code.[^pugh-cacm] His later cookbook showed that the same idea can
support richer operations: fingers, split, concatenate, merge, and list-like
indexing.[^pugh-cookbook]

Randomness is doing the balancing.

## Let The Coin Build The Index

Imagine flipping a biased coin for each inserted key.

```text
put the key on level 1
while the coin comes up heads:
    also put the key on the next higher level
```

Let the promotion probability be $$p$$. Then

$$
\Pr(\text{height} \ge k)=p^{k-1}.
$$

So the bottom level has every key, the next level has about $$pn$$ keys, the
next has about $$p^2n$$, and the tower keeps thinning geometrically.

The expected number of forward pointers per key is:

$$
1+p+p^2+p^3+\cdots=\frac{1}{1-p}.
$$

That is the space knob. With $$p=1/2$$, you spend about two pointers per key.
With $$p=1/4$$, you spend about 1.33. Pugh explicitly suggested $$p=1/4$$ as a
good default unless lower variance is more important.[^pugh-cacm]

The search-time knob is slightly subtler. Define

$$
L(n)=\log_{1/p} n.
$$

Around level $$L(n)$$, the expected number of nodes left is constant. Pugh's
backwards analysis bounds the expected path length by roughly

$$
\frac{L(n)}{p}+\frac{1}{1-p}.
$$

The exact constant is not the point. The shape is.

```text
more promotion -> taller, denser express lanes, more pointers
less promotion -> shorter, sparser express lanes, fewer pointers
```

The list is choosing a coordinate system for search.

## The Tower Lab

The lab below builds an actual skip list in the browser. It does not draw a
prebaked diagram. It generates sorted keys, assigns random heights from the
promotion probability, links the levels, runs the search algorithm, and computes
the measured costs.

The default is $$n=96$$, $$p=1/4$$, target rank 67, and a range scan of 18 keys.
With seed 41, the realized list spends `1.45` pointers per key versus the
`1.33` infinite-sample expectation. The selected search takes `15` visual steps.
Across all successful searches, the mean is `10.8`, the 90th percentile is
`15`, and the Pugh-style expected budget shown in the lab is about `15.5`.

The range panel is the practical lesson. Searching for every key in a range is
usually the wrong algorithm. Seek once, then follow bottom-level pointers.

<style>
  .sl-lab {
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

  .sl-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
    margin-bottom: 1rem;
  }

  .sl-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .sl-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .sl-lab input,
  .sl-lab select {
    accent-color: #2563eb;
    width: 100%;
  }

  .sl-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .sl-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .sl-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .sl-lab__metric span,
  .sl-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .sl-lab__metric span {
    display: block;
  }

  .sl-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .sl-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .sl-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="skip-list-tower-lab" class="sl-lab" data-skip-list-tower-lab>
  <div class="sl-lab__controls">
    <label>
      Keys: <output data-value="n">96 keys</output>
      <input type="range" min="24" max="176" step="8" value="96" data-param="n">
    </label>
    <label>
      Promotion probability
      <select data-param="p">
        <option value="0.5">1/2</option>
        <option value="0.3333333333333333">1/3</option>
        <option value="0.25" selected>1/4</option>
        <option value="0.125">1/8</option>
      </select>
    </label>
    <label>
      Target: <output data-value="query">rank 67</output>
      <input type="range" min="1" max="96" step="1" value="67" data-param="query">
    </label>
    <label>
      Range: <output data-value="scan">18 keys</output>
      <input type="range" min="1" max="48" step="1" value="18" data-param="scan">
    </label>
    <label>
      Seed: <output data-value="seed">41</output>
      <input type="range" min="1" max="997" step="1" value="41" data-param="seed">
    </label>
  </div>
  <div class="sl-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="600" aria-label="Skip list tower lab showing search path, height distribution, search costs, and range query budget"></canvas>
  <p class="sl-lab__note">
    Deterministic browser experiment. The top panel traces a successful search;
    the lower panels compare realized tower heights, search costs by rank, and
    the cost of seeking once before scanning a sorted range.
  </p>
</div>
<script defer src="{{ '/assets/js/skip-list-tower-lab.js?v=20260616a' | relative_url }}"></script>

The top panel is the whole algorithm.

Start at the header on the highest non-empty level. Move right until the next
node would pass the target. Drop down. Repeat. At the bottom, the next node is
the target if the key is present.

The search path is a staircase because the data structure is a staircase.

The bottom-left panel is the randomness ledger. For $$p=1/4$$, most nodes have
height 1. A smaller group has height 2. A much smaller group has height 3. The
gray dots show the geometric expectation; the bars show the particular list
generated by the seed.

The bottom-middle panel is more important than a single traced lookup. It shows
the cost of searching for every key in this particular list. Some ranks are
lucky. Some are not. The distribution is lumpy because the tower placement is
lumpy. That is the real bargain: the list is not balanced in the deterministic
sense. It is balanced in distribution.

The bottom-right panel shows why skip lists remained attractive inside storage
engines. A range query is not many independent point lookups. It is:

```text
seek to the first key
walk forward at level 1
```

That keeps the linked-list part of the structure useful rather than embarrassing.

## The Difference From A Random Tree

It is tempting to say a skip list is just a randomized balanced tree in disguise.
That is close, but not quite.

A randomly built binary search tree gets its shape from insertion order. Insert
sorted keys and it degenerates unless the implementation adds balancing.

A skip list gets its shape from node heights. Insert sorted keys, reverse-sorted
keys, or a messy stream. Once the set of keys and random heights are fixed, the
same towers emerge. Pugh emphasized that the sequence of operations does not
determine the balance pattern; the random generator does.[^pugh-cacm]

That is a large conceptual separation:

```text
tree balance: repair structure after updates
skip-list balance: sample structure at insertion time
```

The update path is local. To insert a key, search once while remembering the
rightmost predecessor seen at each level. Then splice the new node into those
levels. To delete, search the same way and splice it out. If the tallest tower
disappears, lower the current list height.

That is why skip lists are so pleasant to implement. The search routine and the
update routine are nearly the same walk.

## The Bad News Is Real

Skip lists have a bad worst case.

The coin can build a useless tower schedule. It is unlikely, but not forbidden.
For a level threshold $$k$$, the chance that any node reaches above that
threshold is at most about $$np^k$$. That decays fast, but it is still a
probabilistic statement.

This matters in two ways.

First, "expected $$O(\log n)$$" is not "worst-case $$O(\log n)$$." If a system
needs a hard deterministic guarantee, a balanced tree may be the right tool.

Second, the random levels should not be adversarially knowable. If an attacker
can observe or predict the height choices, the argument changes. Pugh notes
this explicitly: the operation sequence does not control the worst case unless
the user can exploit the random levels.[^pugh-cacm]

There is also engineering texture. A pointer-rich linked structure can be less
cache-friendly than a packed array or B-tree page. Each horizontal move may be a
pointer chase. The algorithm is simple; the memory hierarchy still gets a vote.

So the right comparison is not:

```text
skip lists are better than trees
```

It is:

```text
skip lists exchange deterministic balance machinery for randomized local splices
```

That exchange is excellent in some systems and merely interesting in others.

## Why Databases Kept Them

LevelDB's in-memory memtable is implemented as a skip list. The source uses a
`RandomHeight` routine that promotes with probability `1 / kBranching`, where
`kBranching` is 4.[^leveldb] In other words, the production default there is the
same $$p=1/4$$ setting from the lab.

RocksDB, which descends from LevelDB, documents the default memtable as
skip-list based and describes the skip list as a sorted set suited to workloads
that interleave writes with range scans.[^rocksdb-memtable] Its overview makes
the same design point: a sorted memtable is necessary when writes and range
scans mix, but other memtable representations can be better for workloads that
do not scan.[^rocksdb-overview]

That is a nice systems lesson.

A skip list is not chosen because it has the prettiest asymptotic line on a
whiteboard. It is chosen because it lets the memtable accept writes cheaply,
answer point lookups reasonably, and then hand out sorted iteration for flushes
and scans.

The sorted list was never discarded. It was upgraded with express lanes.

## The Shape Of The Trick

The trick has three pieces.

First, use levels with a geometric distribution. That makes high levels sparse.

Second, make level choice independent of insertion order. That prevents sorted
inserts from determining the shape.

Third, search greedily. At each level, move right until the next pointer would
overshoot, then descend.

Everything else is bookkeeping.

That is why the structure feels slightly magical the first time it lands. It
does not rebalance after the fact. It does not preserve a delicate tree
invariant. It lets probability lay down just enough long pointers that the
linear list stops feeling linear.

A skip list is a reminder that balance does not always have to be maintained.

Sometimes it can be sampled.

## Paper Trail

[^pugh-cacm]: William Pugh, ["Skip Lists: A Probabilistic Alternative to Balanced Trees"](https://dl.acm.org/doi/10.1145/78973.78977), *Communications of the ACM*, 33(6), 1990. Open course PDF used for line-level checking: [CMU 15-721 mirror](https://15721.courses.cs.cmu.edu/spring2018/papers/08-oltpindexes1/pugh-skiplists-cacm1990.pdf).

[^pugh-cookbook]: William Pugh, ["A Skip List Cookbook"](https://drum.lib.umd.edu/bitstreams/17176ef8-8330-4a6c-8b75-4cd18c570bec/download), UMIACS-TR-89-72.1 / CS-TR-2286.1, revised June 1990.

[^leveldb]: Google LevelDB, [`db/skiplist.h`](https://github.com/google/leveldb/blob/main/db/skiplist.h). The `RandomHeight` implementation increases height with probability `1 in kBranching`, with `kBranching = 4`.

[^rocksdb-memtable]: RocksDB Wiki, ["MemTable"](https://github.com/facebook/rocksdb/wiki/MemTable). It describes the default memtable implementation as skip-list based.

[^rocksdb-overview]: RocksDB Wiki, ["RocksDB Overview"](https://github.com/facebook/rocksdb/wiki/RocksDB-Overview). The overview discusses point lookups, range scans, and why the sorted-set memtable is useful when writes and range scans are interleaved.
