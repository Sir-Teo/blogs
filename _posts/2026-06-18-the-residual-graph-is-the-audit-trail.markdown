---
layout: post
title: "The Residual Graph Is the Audit Trail"
description: "Max-flow algorithms do not just push capacity forward. The residual graph records the unused lanes and the undo lanes, and the final unreachable set becomes the min-cut certificate."
date: 2026-06-18 06:08:00 -0400
categories: computer-science
tags: [max-flow, min-cut, residual-graphs, ford-fulkerson, edmonds-karp, graph-algorithms, algorithms]
excerpt: "A flow is not certified by looking busy. It is certified when the residual graph can no longer route one more unit, and the reachable side names a cut with the same value."
---

A saturated pipe is not a proof.

It might be the wrong pipe. It might be saturated because an earlier routing
choice painted the network into a corner. Maximum flow is subtle because local
fullness is cheap evidence and global optimality is not.

The useful object is the residual graph. It answers two questions at once:

```text
where can one more unit still go?
where can an earlier unit be pulled back?
```

That second question is the part beginners often miss. A max-flow algorithm does
not merely push flow forward. It also keeps an undo ledger. If edge `u -> v`
currently carries 5 units, then the residual graph contains a reverse
possibility `v -> u` of capacity 5. Sending flow backward along that residual
arc means "reroute some of the earlier decision."

Ford and Fulkerson's 1956 paper introduced the problem through a rail-network
formulation: links have capacities, and the task is to find the maximal steady
flow from one city to another.[^ford] The theorem hiding under the algorithm is
stronger than a recipe:

```text
maximum flow value = minimum s-t cut capacity
```

The residual graph is how the algorithm earns that equality.

## The Ledger

A flow has two ordinary constraints:

1. **Capacity:** each edge carries between 0 and its capacity.
2. **Conservation:** every non-source, non-sink vertex sends out exactly what it
   receives.

Given a flow $$f$$ on an edge $$u \to v$$ with capacity $$c$$, the residual
network has:

```text
u -> v with residual capacity c - f(u,v)
v -> u with residual capacity f(u,v)
```

The forward residual arc is spare room. The backward residual arc is permission
to cancel part of the earlier route.

An augmenting path is any source-to-sink path in this residual graph. Its
bottleneck is the minimum residual capacity along the path. Push that much along
the path: increase original-edge flow on forward residual arcs, decrease it on
backward residual arcs, and conservation remains true.

The algorithmic loop is almost too small:

```text
start with zero flow
while the residual graph has an s-t path:
    augment by the path bottleneck
return the flow
```

For integral capacities, each augmentation raises the flow by at least one, so
the basic Ford-Fulkerson method terminates. The path choice still matters.
Edmonds and Karp emphasized that bad choices can cause severe computational
difficulties, then analyzed rules such as choosing a path with the minimum
number of arcs.[^ek] In the lab below, the **bfs** rule is the shortest-path
version usually called Edmonds-Karp; **widest** chooses the path with the largest
bottleneck in the current residual graph; **dfs** follows a fixed depth-first
order.

## Lab: Push Until The Cut Appears

The lab runs small directed networks. Edge labels are `flow/capacity`. Orange is
the next augmenting path. The residual ledger lists forward spare capacity and
blue "undo" arcs. When the algorithm stops, the red side is the set reachable
from the source in the terminal residual graph; edges leaving that set form the
cut certificate.

<style>
  .residual-flow-lab {
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

  .residual-flow-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    margin-bottom: 1rem;
  }

  .residual-flow-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .residual-flow-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .residual-flow-lab input,
  .residual-flow-lab select {
    accent-color: #b45309;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .residual-flow-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .residual-flow-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
    margin: 0 0 0.9rem;
  }

  .residual-flow-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.5rem;
    padding: 0.58rem 0.65rem;
  }

  .residual-flow-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .residual-flow-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.94rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.24rem;
    overflow-wrap: anywhere;
  }

  .residual-flow-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 620px;
    max-width: 100%;
    width: 100%;
  }

  .residual-flow-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .residual-flow-lab__legend span {
    align-items: center;
    color: #5d6872;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    gap: 0.35rem;
  }

  .residual-flow-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .residual-flow-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 620px) {
    .residual-flow-lab {
      padding: 0.75rem;
    }

    .residual-flow-lab__controls {
      grid-template-columns: 1fr;
    }

    .residual-flow-lab canvas {
      height: 760px;
    }
  }
</style>

<div class="residual-flow-lab" data-residual-flow-lab>
  <div class="residual-flow-lab__controls">
    <label>
      Network
      <output data-value="example">rail bottleneck</output>
      <select data-param="example" aria-label="Flow network example">
        <option value="rail" selected>rail bottleneck</option>
        <option value="backedge">undo lane</option>
        <option value="layers">layered supply</option>
      </select>
    </label>
    <label>
      Path rule
      <output data-value="rule">bfs</output>
      <select data-param="rule" aria-label="Augmenting path rule">
        <option value="bfs" selected>bfs shortest path</option>
        <option value="widest">widest bottleneck</option>
        <option value="dfs">fixed dfs order</option>
      </select>
    </label>
    <label>
      Step
      <output data-value="step">0 / 5</output>
      <input data-param="step" type="range" min="0" max="5" value="0" step="1" aria-label="Augmentation step">
    </label>
  </div>

  <div class="residual-flow-lab__metrics">
    <div class="residual-flow-lab__metric"><span>current flow</span><strong data-metric="flow">0</strong></div>
    <div class="residual-flow-lab__metric"><span>next augment</span><strong data-metric="augment">+5</strong></div>
    <div class="residual-flow-lab__metric"><span>max flow</span><strong data-metric="final">18</strong></div>
    <div class="residual-flow-lab__metric"><span>terminal cut</span><strong data-metric="cut">18</strong></div>
    <div class="residual-flow-lab__metric"><span>augmentations</span><strong data-metric="steps">5</strong></div>
    <div class="residual-flow-lab__metric"><span>audit</span><strong data-metric="audit">passes</strong></div>
  </div>

  <canvas width="900" height="620" aria-label="Residual graph max-flow simulator with augmenting path, residual arcs, and min-cut certificate"></canvas>
  <div class="residual-flow-lab__legend">
    <span><i style="background:#b45309"></i> Next augmenting path</span>
    <span><i style="background:#2563eb"></i> Undo residual arc</span>
    <span><i style="background:#be123c"></i> Terminal reachable side / cut</span>
    <span><i style="background:#0f766e"></i> Positive flow</span>
  </div>
  <p class="residual-flow-lab__note">
    Deterministic toy networks. The audit checks capacity, conservation,
    bottlenecks, no terminal residual path, and equality between the final flow
    and a brute-force min-cut oracle.
  </p>
</div>

<script defer src="{{ '/assets/js/residual-flow-lab.js?v=20260618c' | relative_url }}"></script>

In the default rail network, BFS finds five augmenting paths:

```text
s -> A -> C -> t                 +5
s -> A -> D -> t                 +4
s -> B -> D -> t                 +6
s -> B -> D -> C -> t             +2
s -> A -> B -> D -> C -> t         +1
```

The final flow is `18`. The terminal residual graph cannot reach `t` from `s`.
The source side of that final reachability set cuts edges with total capacity
`18`, so the flow and cut certify each other.

Switch **Path rule** to **widest bottleneck**. On the same network it still
finds flow `18`, but in four augmentations. This is not a theorem that widest is
better. It is a warning that "the Ford-Fulkerson method" is a family of path
choices, and the residual graph is the common accounting system.

The implementation is inspectable:
[`assets/js/residual-flow-lab.js`]({{ '/assets/js/residual-flow-lab.js' | relative_url }}).
Its module audit checks all `9` combinations of the three example networks and
three path rules:

```js
const lab = require("./assets/js/residual-flow-lab.js");
const EXPECTED_CASES = 9;
const EXPECTED_CHECKS = 72;

const audit = lab.auditResidualFlowLab();
const auditShape = {
  rows: audit.cases.length,
  passed: audit.passed,
  total: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks
};
if (auditShape.rows !== EXPECTED_CASES ||
    auditShape.total !== EXPECTED_CASES ||
    auditShape.totalChecks !== EXPECTED_CHECKS) {
  throw new Error("unexpected audit size: " + JSON.stringify(auditShape));
}

const failedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (!audit.ok || failedCases.length || audit.passed !== audit.total ||
    audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    failures: audit.failures,
    failedCases,
    auditShape
  }, null, 2));
}

console.log(`${audit.passed}/${audit.total} audit cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`);
console.table(audit.cases.map((row) => ({
  network: row.example,
  rule: row.rule,
  augmentations: row.augmentations,
  flow: row.flow,
  terminalCut: row.cut,
  bruteForceMinCut: row.minCut,
  reachableSideSize: row.reachableCount
})));
```

For each row, it checks every intermediate flow for capacity and conservation,
checks that each augmenting path uses positive residual arcs with the stated
bottleneck, checks that the terminal residual graph has no $$s \to t$$ path,
and checks that the terminal flow equals both the terminal cut and a brute-force
min-cut oracle. The published sweep passed 72/72 named checks.

## Why The Final Cut Proves It

Suppose the algorithm stops. In the final residual graph, let $$S$$ be every
vertex reachable from the source. The sink is not in $$S$$, or else there would
still be an augmenting path.

Now inspect any original edge from $$S$$ to $$T = V \setminus S$$. If it had
spare capacity, the residual graph would contain the forward arc across the
cut, making the head reachable. Contradiction. So every edge leaving $$S$$ is
saturated.

Inspect any original edge from $$T$$ back into $$S$$. If it carried positive
flow, the residual graph would contain the backward undo arc from $$S$$ to
$$T$$, again making the tail reachable. Contradiction. So every edge entering
$$S$$ from $$T$$ carries zero flow.

Therefore the net flow out of $$S$$ is exactly:

```text
capacity of edges from S to T
```

Every valid flow is at most every cut capacity, because any unit that reaches
the sink must cross each source-sink cut somewhere. So when one flow equals one
cut, both are optimal.

That is the proof shape I want engineers to remember:

```text
no residual path
=> reachable set S
=> outgoing edges saturated and incoming edges empty
=> flow value equals cut capacity
=> maximum flow and minimum cut
```

The cut is not a separate after-the-fact visualization. It is the certificate
left by the failed search.

## Where This Abstraction Bites

Max-flow/min-cut is useful whenever a conservation law and a bottleneck
certificate are the right abstraction: routing, image segmentation, bipartite
matching reductions, project selection, baseball elimination, circulation with
demands, and many scheduling or allocation subproblems.

It is also easy to overapply. A max-flow model says:

```text
flow is divisible
capacities are known
intermediate vertices conserve flow
the objective is one scalar source-sink throughput
```

If jobs are indivisible, latencies are nonlinear, capacity changes with load, or
the goal is fairness rather than throughput, the cut certificate may certify the
wrong model very cleanly. The theorem is powerful because it is exact. Exactness
also means it will not quietly absorb requirements that were not encoded in the
network.

Still, the mental model travels well. Many debugging sessions improve when you
ask for the residual graph:

- What capacity is still unused?
- Which previous assignment can be undone?
- Which cut proves the current plan cannot improve?

Busy edges are not enough. The audit trail lives in the residual graph.

[^ford]: L. R. Ford Jr. and D. R. Fulkerson, ["Maximal Flow Through a Network"](https://www.cambridge.org/core/journals/canadian-journal-of-mathematics/article/maximal-flow-through-a-network/5D6E55D3B06C4F7B1043BC1D82D40764), *Canadian Journal of Mathematics* 8, 1956, pp. 399-404. The Cambridge page quotes the original rail-network problem formulation and lists DOI [10.4153/CJM-1956-045-5](https://doi.org/10.4153/CJM-1956-045-5). A PDF copy is hosted by Yale: <https://www.cs.yale.edu/homes/lans/readings/routing/ford-max_flow-1956.pdf>.

[^ek]: Jack Edmonds and Richard M. Karp, ["Theoretical Improvements in Algorithmic Efficiency for Network Flow Problems"](https://dl.acm.org/doi/10.1145/321694.321699), *Journal of the ACM* 19(2), 1972, pp. 248-264. PDF copy: <https://web.eecs.umich.edu/~pettie/matching/Edmonds-Karp-network-flow.pdf>.
