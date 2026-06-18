---
layout: post
title: "The Page Split Climbs Toward the Root"
description: "A B+ tree index stays shallow because each node is a page-sized roster of keys. Insertions are local until a full page splits, promotes a separator, and maybe makes the root grow."
date: 2026-06-18 06:22:00 -0400
categories: data-systems
tags: [b-trees, b-plus-trees, database-indexes, page-splits, data-structures, storage-engines, databases]
excerpt: "A database index does not stay fast by keeping one key per node. It stays fast by making each page broad, keeping leaves at the same depth, and treating a split as an auditable local repair that can climb."
---

A sorted index is not a sorted array with better manners.

If every insertion had to slide half the file, the index would spend its life
making room. If every key lived in its own pointer node, the search path would
be too tall for storage. B-trees won because they turned the problem into a page
budget:

```text
put many ordered keys in one page
keep every leaf at the same depth
split only when a page is full
```

That is the operating shape behind the theorem and the engineering habit. Bayer
and McCreight framed the original problem as maintaining a large ordered index
on a backing store such as a disk or drum, where only small parts of the index
fit in main memory at once.[^bayer] Their abstraction was not "a clever binary
tree." It was a tree whose nodes are pages.

The page is the unit that matters.

## The Broad Node

A B-tree page carries several keys and several child pointers. For a page
capacity controlled by some device-dependent parameter $$k$$, Bayer and
McCreight's paper describes pages that can hold up to $$2k$$ keys, with ordinary
non-root pages kept at least half full. The important consequences are:

- search, insertion, and deletion take time proportional to $$\log_k I$$ for an
  index of size $$I$$;
- storage utilization is at least 50 percent in their model;
- all root-to-leaf paths have the same length;
- splits start at leaves and propagate upward;
- a root split is the only way the tree height increases.[^bayer-pdf]

That last line is the one to keep on the mental clipboard. A B-tree does not
rebalance by rotating after every local tremor. A full page splits. The split
creates a separator key for the parent. If the parent is now full, the same
repair climbs one level. Most inserts never reach the root. Occasionally one
does, and the whole tree gets one level taller.

Comer's 1979 survey calls the B-tree a de facto standard index organization in
database systems and spends much of its attention on variants, especially the
B+-tree.[^comer] In a B+ tree, data entries live in the leaves and internal
pages mostly route searches. That is the shape used by many storage engines
because it makes range scans natural: find the first leaf, then walk leaf pages
in key order.

SQLite's file-format document is a useful concrete witness. It describes
B-tree pages as either leaf pages or interior pages, with interior pages holding
$$K$$ keys and $$K+1$$ child-page pointers. It also states the well-formedness
condition that children of an interior page have the same depth.[^sqlite]

The lab below is a small B+ tree, not SQLite. It keeps unique integer keys,
stores payloads only implicitly in leaves, promotes the first key of the right
leaf after a split, and counts a toy "page write" whenever an insertion dirties
a page. There is no deletion, WAL, latch coupling, prefix compression, variable
cell size, overflow page, free-list, MVCC, or page cache policy. The point is
the page-split mechanism.

## Lab: Insert Until A Page Cracks

<style>
  .btree-lab {
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

  .btree-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    margin-bottom: 1rem;
  }

  .btree-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .btree-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .btree-lab input,
  .btree-lab select {
    accent-color: #b45309;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .btree-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .btree-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
    margin: 0 0 0.9rem;
  }

  .btree-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.5rem;
    padding: 0.58rem 0.65rem;
  }

  .btree-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .btree-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.94rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.24rem;
    overflow-wrap: anywhere;
  }

  .btree-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 720px;
    max-width: 100%;
    width: 100%;
  }

  .btree-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .btree-lab__legend span {
    align-items: center;
    color: #5d6872;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    gap: 0.35rem;
  }

  .btree-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .btree-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 620px) {
    .btree-lab {
      padding: 0.75rem;
    }

    .btree-lab__controls {
      grid-template-columns: 1fr;
    }

    .btree-lab canvas {
      height: 820px;
    }
  }
</style>

<div class="btree-lab" data-btree-split-lab>
  <div class="btree-lab__controls">
    <label>
      Insert order
      <output data-value="pattern">append-only</output>
      <select data-param="pattern" aria-label="Insert order">
        <option value="append" selected>append-only</option>
        <option value="shuffle">seeded shuffle</option>
        <option value="reverse">reverse append</option>
        <option value="alternating">outside-in</option>
      </select>
    </label>
    <label>
      Max keys per page
      <output data-value="maxKeys">5</output>
      <input data-param="maxKeys" type="range" min="3" max="9" value="5" step="2" aria-label="Maximum keys per page">
    </label>
    <label>
      Inserts
      <output data-value="count">42</output>
      <input data-param="count" type="range" min="8" max="96" value="42" step="1" aria-label="Insert count">
    </label>
    <label>
      Shuffle seed
      <output data-value="seed">17</output>
      <input data-param="seed" type="range" min="1" max="99" value="17" step="1" aria-label="Shuffle seed">
    </label>
    <label>
      Step
      <output data-value="step">42 / 42</output>
      <input data-param="step" type="range" min="0" max="42" value="42" step="1" aria-label="Insertion step">
    </label>
  </div>

  <div class="btree-lab__metrics" data-metrics>
    <div class="btree-lab__metric"><span>height</span><strong>3</strong></div>
    <div class="btree-lab__metric"><span>pages</span><strong>18</strong></div>
    <div class="btree-lab__metric"><span>splits</span><strong>15</strong></div>
    <div class="btree-lab__metric"><span>avg leaf fill</span><strong>60.0%</strong></div>
    <div class="btree-lab__metric"><span>avg writes/insert</span><strong>1.71</strong></div>
    <div class="btree-lab__metric"><span>audit</span><strong>passes</strong></div>
  </div>

  <canvas width="900" height="720" aria-label="B plus tree page split simulator showing insertion path, dirty pages, leaf fill, and split timeline"></canvas>
  <div class="btree-lab__legend">
    <span><i style="background:#b45309"></i> Last search path</span>
    <span><i style="background:#2563eb"></i> Dirty page</span>
    <span><i style="background:#be123c"></i> Split page</span>
    <span><i style="background:#7c3aed"></i> New page / root split</span>
    <span><i style="background:#0f766e"></i> Leaf occupancy</span>
  </div>
  <p class="btree-lab__note">
    Deterministic toy B+ tree. The audit checks sorted leaves, equal leaf depth,
    separator routing, occupancy bounds, split accounting, finite metrics, and
    that every inserted key routes back to the leaf that stores it.
  </p>
</div>

<script defer src="{{ '/assets/js/btree-split-lab.js?v=20260618a' | relative_url }}"></script>

With the default settings, the lab inserts keys `1` through `42` into pages that
hold at most five keys. The final tree has:

```text
height:            3 page levels
pages:             18
leaf pages:        14
splits:            15
root splits:       2
average leaf fill: 60.0%
page writes/insert: 1.71
```

The low fill is not a bug in the audit. It is a consequence of naive half
splits under append-only insertion. Every time the rightmost leaf overflows, it
is split roughly in half, then future keys go to the new rightmost page. Many
old leaves remain half full. Real engines often have extra policies for
right-edge growth, fill factors, bulk loading, and page compaction. This lab is
showing the bare split rule.

Switch **Insert order** to **seeded shuffle**. With the same page capacity and
number of keys, the final run ends with 15 pages, 12 splits, and 76.4 percent
average leaf fill. Random-looking inserts revisit old leaves and use space that
append-only splitting left behind.

Now increase **Max keys per page**. In the append-only run with 42 inserts:

```text
max keys 3: height 4, pages 31, splits 27, 2.29 writes/insert
max keys 5: height 3, pages 18, splits 15, 1.71 writes/insert
max keys 7: height 3, pages 13, splits 10, 1.48 writes/insert
max keys 9: height 2, pages  9, splits  7, 1.33 writes/insert
```

This is the fanout bargain in miniature. Larger pages make each inspected node
more expensive internally, but they reduce the number of pages on the route from
root to leaf. On storage, that is usually the right trade: a page read can buy
many key comparisons.

The implementation is inspectable:
[`assets/js/btree-split-lab.js`]({{ '/assets/js/btree-split-lab.js' | relative_url }}).
Its Node audit currently passes all `96` combinations of insert order, page
capacity, count, and seed.

## What A Split Certifies

Here is the insertion repair in the toy B+ tree:

```text
search from root to the target leaf
insert the key into that sorted leaf
if the leaf still fits:
    stop
split the leaf into two leaves
promote the first key of the right leaf to the parent
if the parent overflows:
    split the parent and promote its middle separator
if the root overflows:
    create a new root
```

A split is not merely an allocation event. It is a proof obligation. After the
split:

- the leaves must still appear in sorted order;
- every leaf must still sit at the same depth;
- every internal page with $$K$$ separator keys must have $$K+1$$ child pointers;
- each separator must route keys to the same leaf a search would later inspect;
- non-root pages must not exceed capacity or fall below the chosen occupancy
  floor.

That is why the lab's audit is more important than the picture. Pretty pages can
hide a broken separator. The invariant is the thing being drawn.

## The Cost Is Bursty

B+ tree insert cost is pleasantly small most of the time. One search path is
read, one leaf is changed, and the update is done.

The burst arrives when a page is full. The insertion dirties the leaf, allocates
a sibling, rewrites separators, and may dirty each ancestor up to the root.
That is not the same shape as an LSM tree compaction bill, but it is still a
write-amplification story: maintenance work is concentrated at structural
boundaries.

The burst is also why concurrency protocols around B-trees are careful. Comer
discusses the multiuser problem because reserving too much of the path blocks
other updates, while reserving too little can force the operation to restart
when the page structure changes under it.[^comer-locks] Modern engines vary in
the details, but the shape is inherited from the same page-split fact.

## What This Toy Leaves Out

The lab uses fixed-size integer keys, which makes every page hold exactly
`maxKeys` keys. Real database pages are messier. SQLite's format, for example,
has page headers, cell pointer arrays, unallocated space, cell content areas,
reserved regions, and overflow pages for payloads that do not fit within the
page budget.[^sqlite-layout] A page can be "full" because of bytes, not just
because of a clean key count.

The lab also omits deletion. Deletion has its own repair work: redistribution,
merge, free-space management, and sometimes deliberately postponed cleanup. It
omits logging and recovery. A page split that looks local in memory must become
durable without letting a crash publish half a tree.

So the simulator is not a storage-engine benchmark. It is a mechanical
cross-section. When a B+ tree works, this is the core receipt:

```text
broad pages make the tree shallow
sorted leaves preserve range order
splits repair overflow locally
separator keys make the repair searchable
root splits are the only height increases
```

The index grows by splitting pages.

The split climbs only when it must.

[^bayer]: Rudolf Bayer and Edward M. McCreight, ["Organization and maintenance of large ordered indexes"](https://link.springer.com/article/10.1007/BF00288683), *Acta Informatica* 1, 1972, pp. 173-189. The Springer abstract describes the disk/drum backing-store model, the $$\log_k I$$ operation bound, at-least-50-percent storage utilization, and the use of pages organized as B-trees.

[^bayer-pdf]: Bayer and McCreight's Boeing technical-report version, ["Organization and Maintenance of Large Ordered Indices"](https://infolab.usc.edu/csci585/Spring2010/den_ar/indexing.pdf), July 1970. The report states that pages can hold up to $$2k$$ keys, that splits and catenations start at leaves and propagate toward the root, and that root split is the only height-increase event.

[^comer]: Douglas Comer, ["The Ubiquitous B-Tree"](https://dl.acm.org/doi/10.1145/356770.356776), *ACM Computing Surveys* 11(2), 1979, pp. 121-137. Public PDF copy: <https://carlosproal.com/ir/papers/p121-comer.pdf>.

[^sqlite]: SQLite, ["Database File Format: B-tree Pages"](https://www.sqlite.org/fileformat.html#b_tree_pages). The document describes table and index b-trees, leaf and interior pages, interior pages with $$K$$ keys and $$K+1$$ child-page pointers, ordered separator semantics, and equal child depth in well-formed databases.

[^comer-locks]: Comer, "The Ubiquitous B-Tree," Section 4, "B-Trees in a Multiuser Environment," discusses why reserving an entire root-to-leaf path is undesirable and why reserving too few nodes can force an update to restart.

[^sqlite-layout]: SQLite, ["Database File Format: B-tree Pages"](https://www.sqlite.org/fileformat.html#b_tree_pages), page layout and overflow discussion.
