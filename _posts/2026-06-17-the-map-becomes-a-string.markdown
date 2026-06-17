---
layout: post
title: "The Map Becomes a String"
description: "A spatial index is often a strange act of compression: take a rectangle on a grid, turn it into a few one-dimensional key ranges, and hope locality survives the trip."
date: 2026-06-17 00:00:00 -0400
categories: software-engineering
tags: [space-filling-curves, hilbert-curve, morton-order, z-order, spatial-indexing, databases, algorithms, software-engineering]
excerpt: "Space-filling curves are not magic maps. They are bargains: fewer key ranges, more locality, and sometimes extra cells read when the rectangle does not line up with the curve."
---

A map is easy to draw and awkward to put in a B-tree.

The B-tree wants one question:

```text
what comes next?
```

A map answers with two coordinates. North is next to south; east is next to
west; a rectangle is a rectangle. The storage engine has a single sorted order.
If you want to range-scan it, the rectangle must become a list of intervals.

That is the small betrayal behind a lot of spatial indexing:

```text
(x, y)  ->  one key
```

The trick is old. Peano and Hilbert built continuous curves that fill a square
near the end of the nineteenth century.[^hilbert] Database systems later took
finite, grid-sized versions of those curves and used them as filing rules.
Morton's 1966 geodetic database report proposed a new file sequence for map
data.[^morton] The Z-order/Morton key is almost embarrassingly mechanical:
interleave the bits of `x` and `y`.

For a 5-bit grid coordinate:

```text
x = x4 x3 x2 x1 x0
y = y4 y3 y2 y1 y0
z = y4 x4 y3 x3 y2 x2 y1 x1 y0 x0
```

This is why Z-order remains tempting. It is simple, fast, hierarchical, and
friendly to ordinary sorted storage. AWS's DynamoDB Z-order article frames it
in exactly that practical language: compute a fixed-length binary Z-address by
interleaving attributes, then use it as a sort key for bounded queries.[^aws]

Hilbert order asks for more bookkeeping. The curve rotates as it descends into
quadrants, so adjacent pieces tend to reconnect more gently. That is the price
of better clustering.

## The Thing To Count Is Not Distance

The first instinct is to ask:

```text
does the curve preserve Euclidean distance?
```

That is a useful instinct, but it is not quite the database question.

For range queries, the storage engine pays for contiguous runs in key space. A
rectangle is cheap when the cells inside it appear as a small number of
consecutive key intervals. It is expensive when the curve keeps entering,
leaving, and entering the rectangle again.

The old papers call those runs clusters. Faloutsos and Roseman studied Hilbert
curves for secondary-key retrieval because good clustering reduces disk
accesses.[^faloutsos-roseman] Jagadish compared several mappings and found that
a Hilbert-based mapping performed well across operating conditions.[^jagadish]
Moon, Jagadish, Faloutsos, and Saltz later gave a sharper analysis: for Hilbert
order, the expected number of clusters is governed by the boundary of the query
region, not by its area, and in two dimensions the average is asymptotically
about one quarter of the rectangle perimeter.[^moon]

That sentence is the whole post.

Area tells you how many records you truly need. Perimeter tells you how often
the curve crosses into and out of the query.

## The Lab

The lab below uses a discrete $$2^k \times 2^k$$ grid. It compares three ways to
turn cells into one-dimensional keys:

```text
row-major: y * N + x
Z-order:   interleave the coordinate bits
Hilbert:   recursively rotate quadrants to keep the tour connected
```

For the default 32-by-32 grid, the query is a 4-by-20 vertical window. The exact
answer contains 80 cells.

```text
Hilbert exact ranges      3
Z-order exact ranges      5
row-major exact ranges   20
```

The lab also has a deliberately practical knob: **Range budget**. If the exact
answer needs too many ranges, it greedily merges the smallest gaps between
neighboring ranges until the budget is met. That merged scan reads the exact
cells plus whatever unrelated cells fell into the bridged gaps.

At the default budget of 8, Hilbert and Z-order fit without extra reads. Row
major has to merge twelve row gaps and scans `416` cells to return `80`.

<style>
  .space-index-lab {
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

  .space-index-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
    margin-bottom: 1rem;
  }

  .space-index-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .space-index-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .space-index-lab input,
  .space-index-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .space-index-lab select {
    background: #ffffff;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.2rem 0.45rem;
  }

  .space-index-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .space-index-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .space-index-lab__metric.good {
    border-color: #9ed8c5;
  }

  .space-index-lab__metric span,
  .space-index-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .space-index-lab__metric span {
    display: block;
  }

  .space-index-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .space-index-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .space-index-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .space-index-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .space-index-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .space-index-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 540px) {
    .space-index-lab {
      padding: 0.75rem;
    }

    .space-index-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="space-filling-index-lab" class="space-index-lab" data-space-filling-index-lab>
  <div class="space-index-lab__controls">
    <label>
      Focus order: <output data-value="focus">Hilbert</output>
      <select data-param="focus">
        <option value="hilbert" selected>Hilbert</option>
        <option value="morton">Z-order</option>
        <option value="row">row-major</option>
      </select>
    </label>
    <label>
      Grid order: <output data-value="grid">32 x 32</output>
      <input type="range" min="3" max="7" step="1" value="5" data-param="order">
    </label>
    <label>
      Query x: <output data-value="queryX">4</output>
      <input type="range" min="0" max="28" step="1" value="4" data-param="queryX">
    </label>
    <label>
      Query y: <output data-value="queryY">4</output>
      <input type="range" min="0" max="12" step="1" value="4" data-param="queryY">
    </label>
    <label>
      Query width: <output data-value="queryW">4</output>
      <input type="range" min="1" max="32" step="1" value="4" data-param="queryW">
    </label>
    <label>
      Query height: <output data-value="queryH">20</output>
      <input type="range" min="1" max="32" step="1" value="20" data-param="queryH">
    </label>
    <label>
      Range budget: <output data-value="budget">8</output>
      <input type="range" min="1" max="80" step="1" value="8" data-param="budget">
    </label>
    <label>
      Average samples: <output data-value="samples">320</output>
      <input type="range" min="40" max="1600" step="40" value="320" data-param="samples">
    </label>
    <label>
      Seed: <output data-value="seed">73</output>
      <input type="range" min="1" max="999" step="1" value="73" data-param="seed">
    </label>
  </div>
  <div class="space-index-lab__metrics" data-metrics></div>
  <canvas data-canvas width="960" height="750" aria-label="Space filling curve indexing lab comparing row-major, Z-order, and Hilbert range fragmentation"></canvas>
  <div class="space-index-lab__legend">
    <span><i style="background:#0f766e"></i> Hilbert / exact query</span>
    <span><i style="background:#2563eb"></i> Z-order</span>
    <span><i style="background:#d97706"></i> row-major</span>
    <span><i style="background:#f3b391"></i> cells read after merging</span>
    <span><i style="background:#be123c"></i> rectangle boundary / perimeter rule</span>
  </div>
  <p class="space-index-lab__note">
    Deterministic grid experiment. Exact ranges are maximal consecutive runs of
    query cells in the selected one-dimensional order. Budgeted scans merge the
    smallest gaps between exact ranges until the requested range budget is met.
    The average panel moves the same rectangle over all possible positions when
    the grid is small enough, otherwise it uses seeded samples.
  </p>
</div>
<script defer src="{{ '/assets/js/space-filling-index-lab.js?v=20260617a' | relative_url }}"></script>

Try four moves.

First, change **Focus order** to `row-major`. The grid looks boring because
row-major is simple: every row is one contiguous slice. The key-space panel is
where the problem appears. A tall skinny rectangle becomes one range per row.

Second, set **Query width** to `20` and **Query height** to `4`. Row-major now
looks excellent. This is not a contradiction. If your workload is mostly
horizontal strips, row-major is a good index. The index is allowed to have an
opinion about the workload.

Third, lower **Range budget** to `1`. Now every method is forced to describe
the rectangle with one interval from the first included key to the last included
key. You will see the peach cells flood in. A space-filling curve is not a
spell; a bad query plan can still throw away the locality it gave you.

Fourth, move **Grid order** to `7`. The curve drawing disappears because a
128-by-128 tour is too dense to be helpful, but the arithmetic remains. For
large grids the average Hilbert range count tracks the perimeter rule. With the
default 4-by-20 window, perimeter divided by four is `12`; the exhaustive
32-by-32 average is about `11.7`.

## Why Hilbert Usually Clusters Better

Z-order has a recursive quadtree structure. That is good. The trouble is that
the Z jumps at quadrant boundaries. Some consecutive keys are neighbors; others
are diagonally or spatially far apart. Hilbert order keeps the tour connected
through rotations, so it avoids many of those long jumps.

This is visible in the default vertical query:

```text
Z-order visits the window in 5 runs.
Hilbert visits it in 3 runs.
```

It is also visible in the average panel. The Hilbert bar sits near the
perimeter tick because each run begins when the curve crosses the rectangle
boundary. More boundary, more crossings. More area does not necessarily mean
more fragments.

That distinction matters in engineering reviews. The area of a query is a data
volume problem. The boundary of a query is a seek problem.

```text
area      -> records returned
perimeter -> ranges issued
```

One explains bandwidth. The other explains latency and fan-out.

## What Production Systems Actually Do

Real systems rarely stop at the clean square-grid story.

Google's S2 geometry library maps the sphere to cube faces, subdivides those
faces, and encodes cell IDs with a face number plus a Hilbert curve parameter on
that face.[^s2] That gives a hierarchical integer key, not a flat toy square.
Geographic indexes also have to deal with spherical distortion, cell coverings,
mixed levels, polar weirdness, antimeridian splits, and query shapes that are
not rectangles.

Z-order shows up because it is easier to implement and generalize. You can
interleave bits from latitude, longitude, time, user id, or any bounded numeric
attribute. The DynamoDB Z-order design is a good example of the storage-engine
logic: make a single synthetic sort key, then query it with range bounds.[^aws2]

Hilbert shows up when clustering is worth extra algorithmic complexity. Lawder
and King were explicit about the missing piece: mapping to a single dimension
only becomes practical if you also have effective methods for range and partial
match queries over the curve.[^lawder-king] The curve gives you an order; the
query processor still has to decompose a region into intervals.

So the real design space is not:

```text
Hilbert good, Z-order bad.
```

It is more like:

```text
How expensive is key computation?
How many dimensions matter?
Are dimensions equally important?
Are queries boxes, points, nearest neighbors, polygons, or time windows?
Can the engine issue many small ranges?
Does it charge more for false positives or for seeks?
Do inserts preserve locality enough to avoid hot partitions?
```

The lab only models one slice: rectangular queries on a uniform grid with a
fixed range budget. That slice is still useful because it isolates the geometry
of the ordering itself.

## The Uncomfortable Part

Flattening a map is lossy even when the mapping is one-to-one.

Every cell still has a unique key. No information is destroyed in the literal
sense. But neighborhood structure is changed. Some nearby cells are separated
by many keys. Some key-near cells are not as spatially near as you hoped. A
single sorted order cannot preserve all directions equally.

This is the same feeling that shows up in embeddings, projections, cache
layouts, hash tables, and dimensionality reduction:

```text
the representation is exact
the geometry is negotiated
```

Space-filling curves are beautiful because the negotiation is visible. You can
watch the tour cross a rectangle boundary, count the runs, and see the theorem
in the storage bill.

When someone says "we will just put geospatial points in a B-tree," ask one
more question:

```text
what shape does a rectangle have after it becomes a string?
```

[^hilbert]: David Hilbert, ["Ueber die stetige Abbildung einer Line auf ein Flaechenstueck"](https://link.springer.com/article/10.1007/BF01199431), *Mathematische Annalen* 38:459-460, 1891.

[^morton]: G. M. Morton, ["A computer oriented geodetic data base and a new technique in file sequencing"](https://search.worldcat.org/title/A-computer-oriented-geodetic-data-base-and-a-new-technique-in-file-sequencing/oclc/52181262), IBM Ltd., Ottawa, 1966.

[^faloutsos-roseman]: Christos Faloutsos and Shari Roseman, ["Fractals for Secondary Key Retrieval"](https://www.cs.cmu.edu/~christos/PUBLICATIONS.OLDER/pods89.fractals.pdf), PODS 1989.

[^jagadish]: H. V. Jagadish, ["Linear Clustering of Objects with Multiple Attributes"](https://www.cs.cmu.edu/~christos/courses/826-resources/PAPERS%2BBOOK/jagadish-sigmod-90-P332.pdf), SIGMOD 1990.

[^moon]: Bongki Moon, H. V. Jagadish, Christos Faloutsos, and Joel H. Saltz, ["Analysis of the Clustering Properties of the Hilbert Space-Filling Curve"](https://www.cs.cmu.edu/~christos/PUBLICATIONS/ieee-tkde-hilbert.pdf), *IEEE Transactions on Knowledge and Data Engineering* 13(1):124-141, 2001.

[^aws]: Zack Slayton, ["Z-Order Indexing for Multifaceted Queries in Amazon DynamoDB: Part 1"](https://aws.amazon.com/blogs/database/z-order-indexing-for-multifaceted-queries-in-amazon-dynamodb-part-1/), AWS Database Blog, 2017.

[^s2]: S2 Geometry, ["S2 Cells"](https://s2geometry.io/devguide/s2cell_hierarchy.html), developer guide.

[^aws2]: Zack Slayton, ["Z-order indexing for multifaceted queries in Amazon DynamoDB: Part 2"](https://aws.amazon.com/blogs/database/z-order-indexing-for-multifaceted-queries-in-amazon-dynamodb-part-2/), AWS Database Blog, 2018.

[^lawder-king]: J. K. Lawder and P. J. H. King, ["Querying Multi-dimensional Data Indexed Using the Hilbert Space-Filling Curve"](https://sigmodrecord.org/publications/sigmodRecord/0103/3.lawder.pdf), *SIGMOD Record* 30(1), 2001.
