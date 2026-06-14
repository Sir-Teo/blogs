---
layout: post
title: "A* Trusts a Promise, Not a Hunch"
description: "A* is fast when its heuristic makes a mathematical promise about the remaining path cost. Break that promise and the speedup becomes an explicit bet."
date: 2026-06-14 09:18:00 -0400
categories: computer-science
tags: [a-star, dijkstra, pathfinding, heuristic-search, algorithms, games]
excerpt: "A* turns shortest-path search into a bargain: trust the cost already paid, add a lower bound for the cost left, and expand only what the promise permits."
---

A pathfinding heuristic is not a hunch.

It is a contract.

When A* assigns a node the score

$$
f(n) = g(n) + h(n),
$$

the first term is evidence and the second term is a promise. $$g(n)$$ is the
cost already paid to reach the node. $$h(n)$$ is an estimate of the cheapest
remaining cost to the goal.

If $$h(n)$$ never overstates the truth, A* can use it aggressively and still
return an optimal path. If $$h(n)$$ lies upward, the algorithm may become faster,
but the proof is gone. Sometimes the answer is still optimal. Sometimes it is
not. The machine will not apologize when the distinction matters.

That is the whole post.

The rest is just making the promise visible.

## Dijkstra Refuses to Guess

Dijkstra's shortest-path algorithm is a beautiful refusal to guess.[^dijkstra]
It expands the unsettled node with the smallest known cost from the start. If
all edge costs are nonnegative, then when a node is removed from the priority
queue, its shortest distance is known.

For a single source and single goal, Dijkstra can feel wasteful. It may expand
large regions in directions that are obviously not heading toward the target.
But that word, "obviously," is doing work outside the algorithm.

A* imports that outside information.

Hart, Nilsson, and Raphael's 1968 paper gave the formal basis for adding a
heuristic term to best-first graph search.[^astar] The canonical A* score is:

$$
f(n) = g(n) + h(n).
$$

Read it as:

```text
best known cost to get here
+ promised lower bound on cost from here to goal
```

If the promise is valid, a node with $$f(n)$$ larger than the best solution
candidate cannot secretly lead to a cheaper path. This is what lets A* prune
work without changing the answer.

The usual grid-world example uses Manhattan distance:

$$
h(n)=|x_n-x_g|+|y_n-y_g|.
$$

On a four-neighbor grid where every move costs at least 1, Manhattan distance
is a lower bound. Obstacles and swamps can make the true path longer or more
expensive. They cannot make it cheaper than walking the coordinate difference.

That is why Manhattan distance is not merely intuitive. It is admissible.

## Two Ways for h to Tell the Truth

Two related words matter.

A heuristic is **admissible** if:

$$
h(n) \le h^*(n),
$$

where $$h^*(n)$$ is the true cheapest cost from $$n$$ to the goal.

A heuristic is **consistent** if every edge $$n \to m$$ satisfies:

$$
h(n) \le c(n,m) + h(m).
$$

Consistency is a triangle inequality. It says the heuristic cannot drop faster
than the actual price of taking an edge. On ordinary grids, Manhattan distance
with unit lower-bound edge costs is consistent.

Why care about the distinction?

With a consistent heuristic, A* does not need to reopen closed nodes in the
usual graph-search form. The priority queue order behaves like Dijkstra on a
reweighted graph. With an admissible but inconsistent heuristic, optimality can
still be recovered, but implementations must be more careful about reopening
nodes when a better route is found.

Dechter and Pearl sharpened the optimality story around A* and best-first
search: the strong claims depend on the exact class of algorithms and on the
heuristic conditions.[^dechter] The folk sentence "A* is optimal" is missing a
contract clause.

Pearl's broader treatment is still worth reading because it frames heuristics
as explicit information about a problem, not as magic attached to a search
loop.[^pearl]

## Make the Promise Turn Red

The lab below runs a real graph search on a deterministic four-neighbor grid.
It computes a Dijkstra baseline for the optimal path, runs A* with the selected
heuristic, and audits the heuristic against the true distance-to-goal map.

That last part is important. The red audit panel is not opinion. It computes
the true remaining cost from every reachable cell and marks cells where
$$h(n)$$ is too large.

The maps are small on purpose:

- **swamp**: a direct route crosses costly terrain;
- **rooms**: walls and doors make the heuristic repeatedly revise its plan;
- **funnel**: a map that tempts search toward a narrow wrong-looking route;
- **open**: the friendly case where geometric distance is almost all the story.

<style>
  .astar-lab {
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

  .astar-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .astar-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .astar-lab__controls input,
  .astar-lab__controls select {
    accent-color: #7c3aed;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .astar-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .astar-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .astar-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .astar-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .astar-lab__metric span,
  .astar-lab__legend,
  .astar-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .astar-lab__metric span {
    display: block;
  }

  .astar-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .astar-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 700px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .astar-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .astar-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .astar-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .astar-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .astar-lab {
      padding: 0.82rem;
    }

    .astar-lab__controls,
    .astar-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .astar-lab canvas {
      height: 1080px;
    }
  }
</style>

<div class="astar-lab" data-astar-heuristic-lab>
  <div class="astar-lab__controls">
    <label>
      Map
      <select data-param="map">
        <option value="swamp" selected>swamp</option>
        <option value="rooms">rooms</option>
        <option value="funnel">funnel</option>
        <option value="open">open</option>
      </select>
    </label>
    <label>
      Heuristic
      <select data-param="heuristic">
        <option value="manhattan" selected>Manhattan</option>
        <option value="euclidean">Euclidean</option>
        <option value="zero">zero</option>
        <option value="beacon">bad beacon</option>
      </select>
    </label>
    <label>
      Heuristic weight <output data-value="weight">1.20</output>
      <input type="range" min="0" max="260" step="5" value="120" data-param="weight">
    </label>
    <label>
      Swamp cost <output data-value="swamp">7.0</output>
      <input type="range" min="1" max="12" step="0.5" value="7" data-param="swamp">
    </label>
    <label>
      Tie break
      <select data-param="tie">
        <option value="lowH" selected>lower h</option>
        <option value="highG">higher g</option>
      </select>
    </label>
    <label>
      Seed <output data-value="seed">17</output>
      <input type="range" min="1" max="999" step="1" value="17" data-param="seed">
    </label>
  </div>
  <div class="astar-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="A star heuristic search lab comparing Dijkstra, A star, weighted heuristics, explored cells, optimality gap, and heuristic admissibility"></canvas>
  <div class="astar-lab__legend">
    <span><i style="background:#2563eb"></i> Start</span>
    <span><i style="background:#be123c"></i> Goal</span>
    <span><i style="background:#bfdbfe"></i> Explored</span>
    <span><i style="background:#0f766e"></i> Returned path</span>
    <span><i style="background:#fef3c7"></i> Costly terrain</span>
  </div>
  <p class="astar-lab__note">
    Deterministic toy graph. The audit panel computes exact remaining costs by
    a reverse Dijkstra pass, then compares the selected heuristic to those
    costs.
  </p>
</div>
<script defer src="{{ '/assets/js/astar-heuristic-lab.js?v=20260614a' | relative_url }}"></script>

Try four moves.

The default starts slightly over the proof line on purpose. With Manhattan
distance weighted at **1.20**, the swamp map still returns the optimal cost
39.0, but it expands only 109 cells instead of Dijkstra's 706 and the audit
shows a maximum overstatement of 8.6. The answer is fine here. The proof is no
longer doing the work.

First, set **Heuristic weight** to `0.00`. This is Dijkstra. The heuristic
audit is green because $$h=0$$ never overstates anything, but the search does
not know where the goal is.

Second, set **Heuristic weight** to `1.00` with Manhattan distance. The path
cost should match the Dijkstra optimum, while the explored region usually
shrinks. This is the classic A* bargain: less work, same answer, because the
heuristic is a lower bound.

Third, set **Swamp cost** to `3.0` and **Heuristic weight** to about `1.80` on
the swamp map. The audit panel turns red and the path gap can become positive.
The search is not broken. You changed the algorithm into a weighted best-first
policy whose speed is no longer backed by the optimality proof.

Fourth, try **bad beacon**. This heuristic rewards a tempting region of the map.
It is useful as a cartoon of a learned or hand-tuned heuristic that has a local
bias. The search may still succeed, but the audit shows where the promise is no
longer a theorem.

## Games Sometimes Buy the Lie On Purpose

In a game, "optimal" is not always the product requirement.

If a unit needs to move this frame, a slightly longer path found quickly may be
better than a perfect path found too late. This is why weighted A*, greedy
best-first search, hierarchical pathfinding, flow fields, navigation meshes,
jump-point pruning, and cache reuse all show up in practice.

The point is not that inadmissible heuristics are bad. The point is that they
are a different contract.

With admissible A*, the claim is:

```text
if a path exists, the returned path has minimum cost
```

With weighted A*, the claim is closer to:

```text
we are spending optimality margin to reduce search work
```

That may be a perfectly rational trade. But it should be instrumented as a
trade. Track the cost gap on representative maps. Track expansions and latency.
Track failure modes near costly terrain, doors, one-way edges, dynamic
obstacles, and congestion. If the heuristic is learned, audit it against exact
solutions on small instances.

The lab's red panel is the small-instance audit.

## The Heuristic Belongs in the Spec

It is tempting to think of a heuristic as a performance detail.

It is not.

The heuristic states what the algorithm is allowed to ignore. A zero heuristic
ignores nothing and searches broadly. A strong admissible heuristic ignores
regions that cannot beat the current best path. A lying heuristic may ignore
regions that actually contain the cheaper route.

This is why the implementation details matter:

- Is the graph weighted or unweighted?
- Are diagonal moves allowed?
- Are terrain costs lower-bounded by the unit used in the heuristic?
- Is the heuristic consistent, or can closed nodes need reopening?
- Does the algorithm stop when the goal is popped, or does it continue to prove
  a bound?
- Are tie breakers changing only work, or also behavior under an inadmissible
  heuristic?

None of these are aesthetic choices. They are proof obligations.

## The Bill So Far and the Bill Ahead

Think of Dijkstra as expanding a circle of known cost from the start.

Think of A* as bending that circle toward the goal using a lower-bound estimate.

Think of weighted A* as pulling the circle with a stronger magnet. It may reach
the goal faster. It may also pull past the cheaper detour.

The clean version is:

```text
g is what you have paid
h is what you promise remains
f is the cheapest total bill this route can still claim
```

When the promise is honest, A* can be both directed and exact. When the promise
is overconfident, it can still be useful, but it has become policy rather than
proof.

That is the small discipline behind a lot of pathfinding work:

```text
do not ask whether the heuristic is smart
ask what it is allowed to promise
```

[^dijkstra]: Edsger W. Dijkstra, ["A Note on Two Problems in Connexion with Graphs"](https://ir.cwi.nl/pub/9256/9256D.pdf), *Numerische Mathematik*, 1959. DOI record: [Springer](https://link.springer.com/article/10.1007/BF01386390).

[^astar]: Peter E. Hart, Nils J. Nilsson, and Bertram Raphael, ["A Formal Basis for the Heuristic Determination of Minimum Cost Paths"](https://ai.stanford.edu/~nilsson/OnlinePubs-Nils/PublishedPapers/astar.pdf), *IEEE Transactions on Systems Science and Cybernetics*, 1968.

[^dechter]: Rina Dechter and Judea Pearl, ["Generalized Best-First Search Strategies and the Optimality of A*"](https://ics.uci.edu/~dechter/publications/r0.pdf), *Journal of the ACM*, 1985.

[^pearl]: Judea Pearl, *Heuristics: Intelligent Search Strategies for Computer Problem Solving*, Addison-Wesley, 1984. A scanned copy is available from [UAB](https://mat.uab.cat/~alseda/MasterOpt/Judea_Pearl-Heuristics_Intelligent_Search_Strategies_for_Computer_Problem_Solving.pdf).
