---
layout: post
title: "Vector Search Builds a Road Network"
description: "HNSW-style vector search works because the index is navigable. Local edges give accuracy, long edges give reach, and the search beam is the fuel budget."
date: 2026-06-13 23:28:00 -0400
categories: ai-systems
tags: [vector-search, hnsw, approximate-nearest-neighbors, graph-algorithms, retrieval, ai-systems]
excerpt: "A vector database is not just a pile of embeddings plus a distance function. The fast part is a graph that has to be easy to drive through."
---

A vector database looks like a simple promise:

```text
give me the points closest to this query vector
```

The exact algorithm is almost insultingly clear. Compute the distance from the
query to every stored vector. Sort. Return the nearest few.

That is also the problem. If the index has one hundred million vectors, the
honest scan spends one hundred million distance computations before it can say
anything. A retrieval-augmented generation system, recommendation engine, image
search backend, fraud graph, or embedding-powered support tool rarely has that
kind of latency budget.

Approximate nearest-neighbor search buys speed by refusing to look everywhere.
The question is not whether it can find a short path to the right answer when
the whole map is visible. The question is whether it can find that path using
only local road signs.

That is why HNSW is easier to understand as a road network than as a "vector
database feature."

Local roads get you precise once you are in the right neighborhood. Highways
move you between neighborhoods. A hierarchy is one way to build highways, but
not the only way a graph can become navigable.

## A graph, not a table

Hierarchical Navigable Small World graphs, introduced by Malkov and Yashunin,
are built for approximate nearest-neighbor search in general metric spaces.[^hnsw]
The index stores points as nodes in a proximity graph. Edges usually connect
nearby points. Search starts from an entry point and repeatedly moves through
neighbors that are closer to the query.

That greedy idea is too weak by itself. If every edge is local, the search can
get trapped in the wrong cluster. It is like trying to drive from Boston to
Chicago using only residential streets and the rule "take the next road that
points most west."

HNSW adds scale.

Each point is assigned a maximum layer using a random rule with an exponentially
decaying tail. Many points live only in the base layer. Fewer points appear in
higher layers. The top layers are sparse, so their edges span longer distances.
Search greedily descends through those upper layers, then uses a broader
best-first search in the base layer. The familiar parameter `efSearch` is that
base-layer search budget: a wider candidate list costs more distance
computations and usually improves recall.

This is why the skip-list analogy in the HNSW paper is useful. Pugh's skip
lists get fast expected search by keeping probabilistic express lanes above a
linked list.[^pugh] HNSW uses the same broad taste: random promotion creates
coarse levels, then lower levels refine the answer.

But the road-network story is older than HNSW. Kleinberg's work on navigation in
small worlds showed that short paths are not enough; a network must support
decentralized routing from local information.[^kleinberg] A social graph can
have tiny diameter and still be hard to navigate if no one knows which local
choice gets them closer to the target. Vector indexes have the same problem in
geometric clothing.

## The Small Machine

The simulator below builds a two-dimensional synthetic embedding corpus with
several clusters. It then compares four search policies:

- **Exact scan:** compute every distance.
- **Local graph:** build a nearest-neighbor graph and search from one fixed
  entry point.
- **Small-world graph:** add a few long links to the local graph.
- **Hierarchy:** promote some nodes into sparse upper layers, then search
  coarse-to-fine.

The hierarchy is deliberately HNSW-like rather than a production HNSW
implementation. Real systems insert points incrementally, tune `M`,
`efConstruction`, and `efSearch`, use neighbor-selection heuristics, care about
deletions and filters, and sweat over memory layout. This lab strips all of
that down to the thing I want to see: when does a graph become drivable?

<style>
  .hnsw-road-lab {
    background: #ffffff;
    border: 1px solid #d8e0e8;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .hnsw-road-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
  }

  .hnsw-road-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .hnsw-road-lab__controls input,
  .hnsw-road-lab__controls select {
    accent-color: #0f766e;
    box-sizing: border-box;
    width: 100%;
  }

  .hnsw-road-lab__controls select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
  }

  .hnsw-road-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .hnsw-road-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .hnsw-road-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .hnsw-road-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.42);
  }

  .hnsw-road-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .hnsw-road-lab__metric span,
  .hnsw-road-lab__note,
  .hnsw-road-lab__legend {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .hnsw-road-lab__metric span {
    display: block;
  }

  .hnsw-road-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.18rem;
    line-height: 1.25;
    margin-top: 0.22rem;
  }

  .hnsw-road-lab canvas {
    display: block;
    max-width: 100%;
  }

  .hnsw-road-lab__legend {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.7rem;
  }

  .hnsw-road-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .hnsw-road-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .hnsw-road-lab__note {
    margin: 0.65rem 0 0;
  }
</style>

<div id="hnsw-road-lab" class="hnsw-road-lab" data-hnsw-road-lab>
  <div class="hnsw-road-lab__controls">
    <label>
      Points: <output data-value="points">420</output>
      <input type="range" min="180" max="760" step="20" value="420" data-param="points">
    </label>
    <label>
      Degree M: <output data-value="degree">8</output>
      <input type="range" min="4" max="16" step="2" value="8" data-param="degree">
    </label>
    <label>
      Long links: <output data-value="shortcuts">2</output>
      <input type="range" min="0" max="5" step="1" value="2" data-param="shortcuts">
    </label>
    <label>
      Search beam: <output data-value="beam">12</output>
      <input type="range" min="1" max="36" step="1" value="12" data-param="beam">
    </label>
    <label>
      Cluster separation: <output data-value="separation">1.15x</output>
      <input type="range" min="0.75" max="1.65" step="0.05" value="1.15" data-param="separation">
    </label>
    <label>
      Queries: <output data-value="queries">180</output>
      <input type="range" min="80" max="320" step="20" value="180" data-param="queries">
    </label>
    <label>
      Highlight: <output data-value="highlight">hierarchy</output>
      <select data-param="highlight">
        <option value="hierarchy" selected>Hierarchy</option>
        <option value="smallWorld">Small-world</option>
        <option value="local">Local graph</option>
        <option value="exact">Exact scan</option>
      </select>
    </label>
  </div>
  <div class="hnsw-road-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="610" aria-label="Vector search graph simulator comparing local, small-world, hierarchy, and exact nearest-neighbor search"></canvas>
  <div class="hnsw-road-lab__legend">
    <span><i style="background:#2563eb"></i> local</span>
    <span><i style="background:#b45309"></i> long links</span>
    <span><i style="background:#0f766e"></i> hierarchy</span>
    <span><i style="background:#7c3aed"></i> exact nearest</span>
    <span><i style="background:#be123c"></i> wrong return</span>
  </div>
  <p class="hnsw-road-lab__note">
    Deterministic toy index. The plotted work is the number of query-to-point
    distance computations, not wall-clock time.
  </p>
</div>
<script defer src="{{ '/assets/js/hnsw-road-lab.js' | relative_url }}"></script>

Try turning `Long links` down to zero. The local graph still has many correct
edges, but it is provincial. Starting from the same entry point, it can search a
nearby neighborhood very well and still miss an entirely different cluster.

Now increase `Long links`. The graph gets a few highways. Recall jumps because
the search can cross empty space before dropping back onto local roads.

Increase `Search beam`. This is the query-time budget. With a beam of one, the
search is nearly greedy: it takes the locally best-looking road and commits.
With a larger beam, it keeps more candidates alive. Work rises; recall usually
rises too. There is no magic in the knob. It is a latency-accuracy trade.

Increase `Degree M`. Denser neighborhoods give the search more local exits, but
each expanded node also fans out to more neighbors. In real HNSW deployments,
larger `M` usually means more memory, slower construction, and better high-recall
search. The same trade appears here, only in miniature.

## The important failure is not distance

The local graph has accurate local geometry. If search starts inside the right
cluster, it often finds the right point. Its failure is routing.

This is a useful distinction because vector-search bugs often get blamed on the
embedding model too quickly. Sometimes the model has made a bad geometry.
Sometimes cosine similarity is the wrong contract. Sometimes high-dimensional
hubness is polluting the nearest-neighbor lists. But sometimes the problem is
the index: the nearest point exists, the distance function would identify it,
and the search procedure simply does not drive there.

An approximate index therefore has two jobs:

1. Preserve enough neighborhood structure that true near points are reachable.
2. Make the graph navigable from ordinary entry points under a finite work
   budget.

The first job is geometric. The second is algorithmic.

ANN-Benchmarks is valuable partly because it forces algorithms to live on a
quality-performance curve rather than reporting one flattering operating
point.[^annbench] A vector index is not "fast" or "accurate" in isolation. It is
fast at some recall, on some data distribution, with some memory budget, under
some query workload.

## The hierarchy may not be the whole story

The standard HNSW intuition says the upper layers are express lanes. That is
true in the algorithmic design. But recent work asks a mischievous question:
what if flat high-dimensional proximity graphs grow their own express lanes?

Munyampirwa, Lakshman, and Coleman argue, based on extensive benchmarking, that
flat navigable small-world graphs can match HNSW-like hierarchy on many
high-dimensional datasets while using less memory.[^hubs] Their proposed
mechanism is a "hub highway": some nodes become especially reachable and
frequently traversed, giving the graph a routing backbone without explicit upper
layers.

I would not read that as "hierarchy is fake." I would read it as a warning
against worshipping the data structure diagram. The real object is the search
traffic induced by the graph, the data distribution, and the query distribution.
If a hierarchy helps, we should be able to see how it helps. If hubs are carrying
the traffic, we should measure them.

This suggests a concrete audit for production vector systems:

- count how often each node is visited during search, not only how often it is
  returned;
- compare visit concentration before and after index rebuilds;
- remove or downweight the most-traversed nodes in an offline copy and measure
  recall damage;
- compare a memory-matched flat graph against the hierarchical index;
- segment the analysis by query type, because a highway for popular intents may
  be a detour for rare ones;
- log recall and work as a curve over `efSearch`, not as a single dashboard
  number.

That last one matters operationally. If recall is bad at low `efSearch` but good
at high `efSearch`, you have a routing-budget problem. If recall is bad even at
high `efSearch`, you probably have a graph-construction, metric, filtering, or
embedding problem. Those are different incidents.

## What I Would Try After This

I want vector-index monitoring to become more like profiling a program.

Do not just ask whether the answer was right. Ask where the search went. Which
nodes behave like highway interchanges? Which clusters require too many distance
calls? Which filters cut the graph into islands? Which entry points produce
fragile routes? Which queries are saved by hierarchy, and which are saved by
hubs?

The simplest experiment is cheap:

```text
for each query:
  record visited node ids
  record returned neighbors
  record exact neighbors for a sample
  record distance computations

then:
  plot recall versus work
  plot visited-node concentration
  ablate high-traffic nodes
  compare hierarchy against a memory-matched flat graph
```

That would turn HNSW tuning from folklore into something closer to systems
science. The index is a road network. So profile traffic, not just destinations.

## Sources

[^hnsw]: Yu. A. Malkov and D. A. Yashunin, "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs," arXiv, 2016; later in *IEEE TPAMI*. [arXiv](https://arxiv.org/abs/1603.09320).

[^pugh]: William Pugh, "Skip Lists: A Probabilistic Alternative to Balanced Trees," *Communications of the ACM*, 1990. [ACM](https://dl.acm.org/doi/10.1145/78973.78977), [PDF](https://15721.courses.cs.cmu.edu/spring2018/papers/08-oltpindexes1/pugh-skiplists-cacm1990.pdf).

[^kleinberg]: Jon M. Kleinberg, "Navigation in a small world," *Nature*, 2000, and "The Small-World Phenomenon: An Algorithmic Perspective," STOC, 2000. [Nature](https://www.nature.com/articles/35022643), [PDF](https://www.cs.cornell.edu/home/kleinber/swn.pdf).

[^annbench]: Martin Aumueller, Erik Bernhardsson, and Alexander Faithfull, "ANN-Benchmarks: A Benchmarking Tool for Approximate Nearest Neighbor Algorithms," 2018. [arXiv](https://arxiv.org/abs/1807.05614), [project](https://ann-benchmarks.com/).

[^hubs]: Blaise Munyampirwa, Vihan Lakshman, and Benjamin Coleman, "Down with the Hierarchy: The 'H' in HNSW Stands for 'Hubs'," arXiv, 2024. [arXiv](https://arxiv.org/abs/2412.01940).
