---
layout: post
title: "The Query Remembers Only New Facts"
description: "Recursive Datalog queries are fixed points over relations. Semi-naive evaluation makes the fixed point fast by propagating only the facts that were just discovered."
date: 2026-06-15 01:12:00 -0400
categories: software-engineering
tags: [datalog, semi-naive-evaluation, recursive-queries, databases, static-analysis, fixed-points]
excerpt: "Naive bottom-up evaluation keeps re-proving facts it already knows. The semi-naive trick is to make the frontier explicit: only new facts can produce new consequences."
---

The first time I saw Datalog used for program analysis, I thought the language
looked too small to be useful.

No loops. No mutable maps. No work queue in sight. Just relations and rules:

```prolog
path(x, y) :- edge(x, y).
path(x, z) :- path(x, y), edge(y, z).
```

Then the unsettling thing happens. That tiny program is a transitive-closure
engine. Feed it a graph and it computes every reachable pair.

The trick is not that Datalog hides a loop from you. It hides a fixed point.
The relation `path` starts with the known edges. The recursive rule grows it.
When the rule can no longer add a pair, the meaning of the program has settled.

This is where the implementation question becomes interesting:

```text
how do you run a recursive query without re-running the past?
```

The answer is semi-naive evaluation. The name is under-selling it. The idea is
one of those useful little algorithmic hinges: after each round, remember only
what changed.

## The Meaning Is a Least Fixed Point

Datalog sits in the old and fruitful overlap between relational databases and
logic programming. A relation is a set of tuples. A rule says how to derive
tuples for one relation from tuples in others. For positive Datalog programs,
the standard model-theoretic, proof-theoretic, and fixed-point views agree:
the program denotes the least set of facts closed under its rules.[^ceri]

For the reachability program, write the immediate-consequence operator as `T`.
Given a current set of `path` facts, `T` adds:

```text
all direct edges
all pairs (x,z) where path(x,y) and edge(y,z)
```

Starting from the empty relation and repeatedly applying `T` gives an ascending
chain:

```text
P0 = empty
P1 = T(P0)
P2 = T(P1)
P3 = T(P2)
...
```

Because the active domain is finite, this chain eventually stops. The stopped
set is the least fixed point. Abiteboul, Hull, and Vianu build a large part of
database theory around this kind of connection between logic, recursion, and
query languages.[^foundations]

The naive implementation follows the math directly:

```text
path = edge
repeat
  old_size = size(path)
  for every (x,y) in path:
    for every edge(y,z):
      add path(x,z)
until size(path) == old_size
```

This is correct. It is also wasteful in a very specific way. If `path(a,b)` was
known ten rounds ago, the naive loop still joins it with outgoing edges in the
current round. It keeps asking old facts whether they have anything new to say.

They usually do not.

## Only New Facts Can Surprise You

Let `Delta_i` be the facts discovered in the previous round:

```text
Delta_i = P_i - P_{i-1}
```

For the one-recursive-relation reachability rule, the next frontier is:

```text
Delta_next(x,z) :- Delta(x,y), edge(y,z), not_already_known(path(x,z)).
```

That last test is not logical negation in the source program. It is duplicate
elimination in the engine. The declarative program is still the two-rule
transitive closure above; the engine is just avoiding facts that are already in
the materialized relation.

Here is the same loop with the frontier made explicit:

```text
path = edge
delta = edge
while delta is not empty:
  next = empty
  for every (x,y) in delta:
    for every edge(y,z):
      if path(x,z) is new:
        add path(x,z) to next
  path = path union next
  delta = next
```

It has the same fixed point as naive evaluation. The difference is the unit of
attention. Naive evaluation says: "rerun the whole recursive join." Semi-naive
evaluation says: "only the newest layer can cause the next layer."

For this simple rule, the analogy to breadth-first search is literal. Round
zero contains paths of length one. Round one discovers some length-two paths.
Round two discovers longer paths, and so on. In a cyclic graph the layers are
not as clean, because a short derivation can rediscover a pair already reached
by another path. The frontier view still works: if no new tuple appears, the
fixed point has been reached.

## Why This Still Matters

Modern Datalog engines are not toy transitive-closure loops. Souffle, for
example, presents Datalog as a language for recursive queries and static
analysis; its tutorial starts from transitive closure and then moves into
data-flow analysis over control-flow graphs.[^souffle-tutorial] Recent systems
work treats high-performance Datalog as a stack of techniques: semi-naive
evaluation, compilation or specialization, join planning, indexing, parallel
data structures, and sometimes GPUs.[^formulog][^gpulog]

That stack matters because a realistic static analysis is just a pile of
relations:

```text
Assign(dst, src)
Load(dst, base, field)
Store(base, field, src)
Call(site, target)
PointsTo(var, object)
Reachable(block)
```

The recursive rules are the analysis. A points-to fact creates another
points-to fact. A reachable block unlocks another reachable block. A call edge
brings another function body into the reachable program. The language is small,
but the fixed point can contain millions of tuples.

Semi-naive evaluation is the first bargain that makes the declarative style
credible: write rules as if the whole relation is being defined, but execute
rounds as if only the fresh consequences are alive.

It is not the whole bargain. The 2024 Formulog work by Bembenek, Greenberg, and
Chong is especially useful here because it warns against treating semi-naive
evaluation as magic. For SMT-heavy Datalog variants, they found that changing
the order of inference could beat the conventional semi-naive schedule on their
benchmarks.[^formulog] In other words, semi-naive is a default engine shape,
not a law of nature.

The deeper lesson survives the caveat: recursive query performance is often
about controlling the frontier.

## A Browser-Sized Fixed Point

The lab below computes the transitive closure of a generated directed graph in
three independent ways:

- a plain BFS from every source node;
- naive bottom-up evaluation of the recursive Datalog rule;
- semi-naive bottom-up evaluation that joins only the delta frontier.

The default graph has 34 nodes and 120 edge facts. All three methods derive
561 reachable pairs. The JavaScript audit then repeats the comparison over 48
graph settings:

```text
default graph shape       chain + skips
edge facts                120
reachable path facts      561
naive join probes         5,462
semi-naive join probes    1,477
work saved                72.96%
fixed-point audit grid    48 / 48 passed
```

The work counter is intentionally humble: it counts adjacency probes in this
one join shape. A production Datalog engine would care about indexes, join
order, memory layout, parallel scheduling, and relation representation. Still,
the core duplication is visible enough in a browser. Drag the graph toward
cycles or add edge noise and watch the frontier thicken; the fixed point is the
same object, but the path to it changes.

<style>
  .datalog-lab {
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

  .datalog-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
  }

  .datalog-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .datalog-lab__controls input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .datalog-lab__controls input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    accent-color: #7c3aed;
    background: linear-gradient(#d7dee5, #d7dee5) center / 100% 4px no-repeat;
    border: 0;
    border-radius: 999px;
    height: 1.15rem;
    margin: 0;
    outline: none;
  }

  .datalog-lab__controls input[type="range"]::-webkit-slider-runnable-track {
    background: transparent;
    border-radius: 999px;
    height: 4px;
  }

  .datalog-lab__controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    background: #7c3aed;
    border: 0;
    border-radius: 999px;
    height: 14px;
    margin-top: -5px;
    width: 14px;
  }

  .datalog-lab__controls input[type="range"]::-moz-range-track {
    background: #d7dee5;
    border: 0;
    border-radius: 999px;
    height: 4px;
  }

  .datalog-lab__controls input[type="range"]::-moz-range-thumb {
    background: #7c3aed;
    border: 0;
    border-radius: 999px;
    height: 14px;
    width: 14px;
  }

  .datalog-lab__value {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .datalog-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 1rem 0;
  }

  .datalog-lab__metric {
    background: #f8fafc;
    border: 1px solid #dfe6ee;
    border-radius: 8px;
    min-width: 0;
    padding: 0.62rem 0.68rem;
  }

  .datalog-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.25;
    margin-bottom: 0.2rem;
  }

  .datalog-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.94rem, 2vw, 1.08rem);
    font-variant-numeric: tabular-nums;
    font-weight: 780;
    line-height: 1.12;
    overflow-wrap: anywhere;
  }

  .datalog-lab canvas {
    border: 0;
    display: block;
    height: 760px;
    max-width: 100%;
    width: 100%;
  }

  .datalog-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 640px) {
    .datalog-lab {
      padding: 0.82rem;
    }

    .datalog-lab canvas {
      height: 980px;
    }
  }
</style>

<div class="datalog-lab" data-datalog-delta-lab>
  <div class="datalog-lab__controls">
    <label>
      Nodes <span class="datalog-lab__value" data-value="nodes">34</span>
      <input type="range" min="12" max="64" step="2" value="34" data-param="nodes" aria-label="Node count">
    </label>
    <label>
      Graph shape <span class="datalog-lab__value" data-value="shape">chain + skips</span>
      <input type="range" min="0" max="3" step="1" value="0" data-param="shape" aria-label="Graph shape">
    </label>
    <label>
      Edge noise <span class="datalog-lab__value" data-value="extra">14%</span>
      <input type="range" min="0" max="36" step="1" value="14" data-param="extra" aria-label="Extra edge density">
    </label>
    <label>
      Seed <span class="datalog-lab__value" data-value="seed">11</span>
      <input type="range" min="1" max="9999" step="1" value="11" data-param="seed" aria-label="Random seed">
    </label>
  </div>
  <div class="datalog-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Semi-naive Datalog lab showing reachability closure, join work by round, delta frontier size, and recursive rules"></canvas>
  <p class="datalog-lab__note">
    The executable artifact is <code>assets/js/seminaive-datalog-lab.js</code>.
    It checks both fixed-point evaluators against an independent BFS closure.
  </p>
</div>

## What the Delta Buys

The most important invariant in the lab is not "semi-naive is faster on this
graph." It is:

```text
naive_path == semi_naive_path == bfs_closure
```

The optimization is allowed only because it preserves the least fixed point.
Every derived fact still has a proof. The engine merely observes that a proof
whose recursive premise was already present in the previous round would have
already had its chance to fire.

For a rule with several recursive inputs, the rewrite has several delta cases.
If a rule uses `A` and `B`, and both are recursive relations, the next round has
to consider the ways one side or the other changed. Real engines also group
relations into strongly connected components, choose join orders, select
indexes, and schedule work across threads. Subotic, Jordan, Chang, Fekete, and
Scholz make automatic index selection one of the core engineering problems for
large-scale Datalog computation.[^indexes]

So the tiny reachability lab is not a replacement for a Datalog engine. It is
the part of the engine I like to keep in my head:

```text
the fixed point grows by differences
```

Once you see that, a lot of systems start rhyming. Incremental view
maintenance. Differential dataflow. Data-flow analysis. Build systems. Even
human debugging, on a good day: stop rereading the whole world; ask what just
changed.

That is the small useful idea hiding behind the dry name. A recursive query
does not have to forget its past. It can keep the old facts still and let only
the new ones move.

<script defer src="{{ '/assets/js/seminaive-datalog-lab.js?v=20260615a' | relative_url }}"></script>

[^ceri]: Stefano Ceri, Georg Gottlob, and Letizia Tanca, "What you always wanted to know about Datalog (and never dared to ask)," *IEEE Transactions on Knowledge and Data Engineering*, 1989. DOI: [10.1109/69.43410](https://doi.org/10.1109/69.43410).

[^foundations]: Serge Abiteboul, Richard Hull, and Victor Vianu, *Foundations of Databases*, Addison-Wesley, 1995. The authors host the book online at [webdam.inria.fr/Alice](http://webdam.inria.fr/Alice/).

[^souffle-tutorial]: The Souffle tutorial describes Datalog as a recursive query language and gives transitive closure and data-flow analysis examples. See [Souffle: Tutorial](https://souffle-lang.github.io/tutorial).

[^formulog]: Aaron Bembenek, Michael Greenberg, and Stephen Chong, "Making Formulog Fast: An Argument for Unconventional Datalog Evaluation," OOPSLA 2024. The paper is useful both for the conventional high-performance recipe around semi-naive evaluation and for the caveat that some SMT-heavy workloads prefer a different inference order. See [arXiv:2408.14017](https://arxiv.org/abs/2408.14017).

[^gpulog]: Yihao Sun, Ahmedur Rahman Shovon, Thomas Gilray, Kristopher Micinski, and Sidharth Kumar, "Optimizing Datalog for the GPU," arXiv:2311.02206, revised 2024. The abstract names query planning, semi-naive evaluation, and parallelization as the engine work hidden behind declarative Datalog queries. See [arXiv:2311.02206](https://arxiv.org/abs/2311.02206).

[^indexes]: Pavle Subotic, Herbert Jordan, Lijun Chang, Alan Fekete, and Bernhard Scholz, "Automatic Index Selection for Large-scale Datalog Computation," *Proceedings of the VLDB Endowment*, 2018.
