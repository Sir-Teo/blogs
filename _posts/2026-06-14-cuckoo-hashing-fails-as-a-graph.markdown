---
layout: post
title: "Cuckoo Hashing Fails as a Graph"
description: "The basic cuckoo table does not fail because the insertion loop is unlucky. It fails when the hidden bipartite graph contains too many edges for its vertices."
date: 2026-06-14 18:44:00 -0400
categories: computer-science
tags: [cuckoo-hashing, hash-tables, random-graphs, data-structures, probabilistic-analysis, systems]
excerpt: "Cuckoo hashing looks like an eviction game. Underneath, it is a matching problem on a random bipartite graph."
---

Cuckoo hashing has one of the best names in data structures and one of the
strangest failure modes.

A key gets two possible homes. If the first home is occupied, kick out the
resident. The evicted key moves to its other home, possibly evicting another
key, and so on until somebody lands in an empty slot.

It sounds like local motion.

It is really a graph problem.

The insertion loop is only the visible symptom. The table fails when the graph
of choices has a connected component with more keys than available cells. No
sequence of clever kicks can store eleven edges in ten vertices. The loop is not
being dramatic. It has found a certificate.

That certificate is the point of this post.

## Two Homes, One Edge

Start with the cleanest model: two tables, each with \(m\) slots. A key \(x\)
has two candidate locations:

$$
h_1(x) \in L,\qquad h_2(x) \in R.
$$

Think of the slots in the first table as vertices on the left and the slots in
the second table as vertices on the right. Now draw one edge for every key:

$$
x \longmapsto (h_1(x), h_2(x)).
$$

The hash table has become a bipartite multigraph. Parallel edges are allowed:
two distinct keys can have the same pair of candidate slots.

A placement is an orientation of every edge toward one of its two endpoints,
with no vertex receiving more than one edge. If an edge is oriented to a vertex,
that key is stored in that slot.

So lookup is beautifully simple: check the two endpoints. This is the original
appeal of Pagh and Rodler's cuckoo hashing scheme, which gives worst-case
constant lookup time using two independent table probes while keeping expected
amortized update time under the usual randomness assumptions.[^pagh-rodler]

Insertion is the cost of buying that lookup contract.

## The Pigeonhole Theorem Hiding in the Table

Take any connected component of the cuckoo graph. Suppose it has \(v\) vertices
and \(e\) edges.

If \(e > v\), placement is impossible inside that component. Those \(e\) keys
are only allowed to use those \(v\) slots. The rest of the table is irrelevant,
because no edge in the component points outside it.

That is the whole obstruction.

For the two-choice, one-slot-per-bucket model, the converse is also the right
mental model: if every component has at most as many edges as vertices, the
component is a tree or has exactly one cycle. A tree with \(v-1\) edges can be
oriented away from one intentionally empty root slot, so every other vertex
receives one edge. A unicyclic component with \(v\) edges can orient the cycle
around itself and orient any trees hanging from it outward. Every key gets one
home.

Kutzelnigg's analysis states this graph view directly: the cuckoo graph
determines whether the construction succeeds, and a component with \(k\) nodes
and \(k+l\) edges is trying to put \(k+l\) keys into only \(k\) locations.[^kutzelnigg]

This is why the basic two-table scheme has a cliff near half occupancy. If
\(n\) keys are placed into two tables of size \(m\), the total slot load is

$$
\alpha = \frac{n}{2m}.
$$

The original analysis keeps each table a bit larger than the number of keys,
which means the total occupancy is a bit below \(1/2\). In that regime the
random bipartite graph is mostly trees and single-cycle components. Push past
it, and complex components appear often enough that rehashes become part of the
steady-state experience.

Nothing mystical happens at a single insertion. The graph changes phase.

## The Lab

The lab below simulates exactly the simplified graph model just described. It
does not simulate cache behavior, fingerprints, SIMD, buckets with four entries,
or production hash mixing. It asks a narrower question:

```text
given these two candidate slots for every key, does any legal placement exist?
```

The default has 72 slots per side and 86 keys, for total load about `0.597`.
With seed `1`, one connected component has 62 edges and 61 vertices. Direct
placement fails by one key. A stash of size one repairs it.

The red edges mark overfull components. The leaf-peeling panel repeatedly
removes degree-zero and degree-one vertices. What remains is the 2-core, the
part of the graph where cycles live. In the default run, the large component's
witness shrinks to a core with 19 edges and 18 vertices. Same excess, smaller
certificate.

<style>
  .cuckoo-lab {
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

  .cuckoo-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(154px, 1fr));
  }

  .cuckoo-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .cuckoo-lab__controls input {
    accent-color: #7c3aed;
    min-width: 0;
    width: 100%;
  }

  .cuckoo-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .cuckoo-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .cuckoo-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .cuckoo-lab__metric span,
  .cuckoo-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .cuckoo-lab__metric span {
    display: block;
  }

  .cuckoo-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .cuckoo-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .cuckoo-lab__note {
    margin: 0.9rem 0 0;
  }

  @media (min-width: 900px) {
    .cuckoo-lab {
      margin-left: calc((100% - min(92vw, 1040px)) / 2);
      max-width: none;
      width: min(92vw, 1040px);
    }
  }
</style>

<div class="cuckoo-lab" data-cuckoo-core-lab>
  <div class="cuckoo-lab__controls">
    <label>
      Slots per side: <output data-value="slots">72</output>
      <input type="range" min="24" max="180" step="4" value="72" data-param="slots">
    </label>
    <label>
      Keys: <output data-value="keys">86</output> at <output data-value="load">60%</output>
      <input type="range" min="8" max="144" step="1" value="86" data-param="keys">
    </label>
    <label>
      Stash size: <output data-value="stash">1</output>
      <input type="range" min="0" max="8" step="1" value="1" data-param="stash">
    </label>
    <label>
      Trials per sweep: <output data-value="trials">64</output>
      <input type="range" min="20" max="120" step="4" value="64" data-param="trials">
    </label>
    <label>
      Hash seed: <output data-value="seed">1</output>
      <input type="range" min="1" max="9999" step="1" value="1" data-param="seed">
    </label>
  </div>
  <div class="cuckoo-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Cuckoo hashing graph simulator showing components, graph excess, stash repairs, and load sweep success probability"></canvas>
  <p class="cuckoo-lab__note">
    Deterministic toy model: two tables, one item per slot, two independent
    candidate slots per key. The exact simulator is in
    <code>assets/js/cuckoo-core-lab.js</code>.
  </p>
</div>

<script src="{{ '/assets/js/cuckoo-core-lab.js?v=20260614a' | relative_url }}"></script>

## A Stash Is a Graph Surgery Budget

Once the failure is phrased as graph excess, the stash becomes almost too clear.

If a component has \(e=v+3\), then storing three of that component's keys in a
small external stash leaves \(v\) edges for \(v\) vertices. The remaining graph
is no longer overfull. In the simplified model, the minimum stash needed is:

$$
\sum_{\text{components } C} \max(0, |E(C)|-|V(C)|).
$$

That is what the lab computes.

Kirsch, Mitzenmacher, and Wieder showed that a small constant-sized stash can
dramatically reduce the frequency of full rehashing. They report that stashes
of only three or four items give large practical improvements.[^stash] The
reason is visible in the graph: many failures are not huge disasters. They are
small local violations. A stash lets the implementation pay for those violations
without throwing away every hash function.

This does not make the table magically full. It changes the contract.

Without a stash:

```text
every connected component must have e <= v
```

With a stash of size \(s\):

```text
the total excess over all bad components must be at most s
```

In an operational system that distinction matters. A rehash is a global event.
A stash lookup is a tiny extra check. The stash converts some global rebuilds
into a bounded constant tax on lookup.

## Why Kicking Feels Random

The usual insertion procedure does not explicitly build the graph and run a
matching algorithm. It starts from the new key and follows alternating
displacements:

```text
put x in one home
evict y
put y in its other home
evict z
...
```

When there is a free slot reachable through this alternating walk, the process
can terminate. When the component is complex, the walk can cycle because there
is no legal orientation for all edges.

This is why implementations put a maximum number of kicks on insertion. The
original paper does this too: if the insertion loop exceeds a fixed bound, the
table is rehashed with new hash functions.[^pagh-rodler] A bounded kick count
is a systems guardrail, not the mathematical source of the failure.

The graph source is smaller and sharper:

```text
too many edges in one connected component
```

## What This Does Not Say About Production Tables

Real cuckoo tables usually do not use this exact toy model.

They use buckets with several entries. They may use more than two candidate
locations. They may store short fingerprints instead of full keys. They may use
partial-key cuckoo hashing, where the alternate bucket can be computed from the
current bucket and a fingerprint. They may vectorize the lookup path and tune
the maximum number of kicks against cache behavior.

Those engineering choices change the graph. Buckets with four entries are not
one vertex with capacity one; they are capacity-four bins. More choices create a
hypergraph rather than an ordinary bipartite graph. Fingerprints introduce
collisions that are useful for compact approximate membership, but they also
mean the clean full-key analysis no longer transfers exactly.

This is why the cuckoo filter paper is careful about the distinction. Fan,
Andersen, Kaminsky, and Mitzenmacher use cuckoo-style placement to build an
approximate membership structure that supports deletion, but the filter stores
fingerprints and needs partial-key cuckoo hashing to relocate entries without
the original keys.[^cuckoo-filter] They also note that prior standard cuckoo
hashing analyses do not directly hold for that partial-key setting.

So the lab here is not a benchmark and not a claim about every modern cuckoo
table.

It is the base mechanism with the covers removed.

## The Useful Lesson

I used to think of cuckoo hashing as an insertion trick:

```text
two possible homes, plus eviction
```

That is the implementation story. The invariant story is better:

```text
two possible homes, plus a random graph that must remain orientable
```

This explains the otherwise odd personality of the data structure.

Lookups are predictable because the choice set is tiny. Insertions are spiky
because a local update can merge components and create the first overfull core.
Rehashing is not a punishment for a bad loop; it is resampling the graph. A
stash works because most failures near the edge are small excesses, not a table
that is globally out of memory.

And the half-full cliff in the basic model is not wasted space. It is the price
of asking a random graph to stay mostly tree-like while every key insists on
only two possible homes.

[^pagh-rodler]: Rasmus Pagh and Flemming Friche Rodler, "Cuckoo Hashing", BRICS Report Series RS-01-32, 2001. [PDF](https://www.brics.dk/RS/01/32/BRICS-RS-01-32.pdf).

[^kutzelnigg]: Reinhard Kutzelnigg, "Bipartite Random Graphs and Cuckoo Hashing", *Discrete Mathematics and Theoretical Computer Science*, 2006. [PDF](https://dmtcs.episciences.org/3486/pdf).

[^stash]: Adam Kirsch, Michael Mitzenmacher, and Udi Wieder, "More Robust Hashing: Cuckoo Hashing with a Stash", ESA 2008. [PDF](https://www.eecs.harvard.edu/~michaelm/postscripts/esa2008full.pdf).

[^cuckoo-filter]: Bin Fan, David G. Andersen, Michael Kaminsky, and Michael D. Mitzenmacher, "Cuckoo Filter: Practically Better Than Bloom", CoNEXT 2014. [PDF](https://www.cs.cmu.edu/~dga/papers/cuckoo-conext2014.pdf).
