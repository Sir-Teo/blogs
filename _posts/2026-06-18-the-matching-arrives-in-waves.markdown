---
layout: post
title: "The Matching Arrives in Waves"
description: "Hopcroft-Karp speeds up bipartite maximum matching by batching a maximal set of shortest augmenting paths instead of repairing the matching one path at a time."
date: 2026-06-18 03:30:00 -0400
categories: computer-science
tags: [bipartite-matching, hopcroft-karp, augmenting-paths, graph-algorithms, algorithms, visualization]
excerpt: "An augmenting path is proof that a matching is not done. Hopcroft-Karp asks for all shortest disjoint proofs in the current layer graph, flips them together, and only then searches deeper."
---

A matching is a set of edges that do not share endpoints.

That definition is modest enough to hide the algorithmic drama. In a bipartite
graph, the left side might be workers and the right side jobs, or tests and
machines, or pending tasks and available slots. The maximum-cardinality question
does not ask whether the assignment is stable, weighted, fair, or human-readable.
It asks one clean thing:

```text
how many disjoint pairs can this graph support?
```

The basic repair operation is an **augmenting path**. Start at an unmatched left
vertex. Walk across an unmatched edge, then a matched edge, then an unmatched
edge, alternating until you end at an unmatched right vertex.

If the path is:

```text
free left -- unmatched -- right -- matched -- left -- unmatched -- free right
```

then flip every edge on it:

```text
unmatched edges become matched
matched edges become unmatched
```

The endpoints become matched, and every interior vertex stays matched. The
matching grows by one.

Berge's theorem gives the certificate: a matching is maximum if and only if no
augmenting path exists.[^berge] So a simple algorithm is already available:
keep finding any augmenting path and flipping it.

Hopcroft-Karp asks a sharper question:

```text
why flip one path when the current shortest layer contains many disjoint ones?
```

## The Alternating Forest Is A Search Index

Given a current matching $$M$$, orient the search by parity:

- from a free left vertex, cross **unmatched** edges to the right side;
- from a reached right vertex that is already matched, cross its **matched**
  edge back to the left side;
- stop when a free right vertex is reached.

This is not an ordinary BFS over the graph. It is a BFS over the alternating
structure induced by the current matching.

The BFS distances live on left vertices. Distance 0 is every free left vertex.
From a left vertex at distance $$d$$, an unmatched edge can reveal a right vertex.
If that right vertex is matched, its mate becomes a left vertex at distance
$$d+1$$. If the right vertex is free, a shortest augmenting path has been found.

Hopcroft-Karp then runs DFS only inside this layered alternating graph and finds
a maximal set of vertex-disjoint shortest augmenting paths. All of those paths
can be flipped at once because they do not touch the same vertices.

That is the wave:

```text
BFS:  expose the current shortest augmenting layer
DFS:  pack disjoint augmenting paths inside that layer
flip: grow the matching by all packed paths
repeat
```

Hopcroft and Karp's original paper proves an $$O((m+n)\sqrt n)$$ time bound for
a bipartite graph with $$n$$ vertices and $$m$$ edges.[^hopcroft-karp] The
important structural claim is not just "BFS plus DFS." It is that after enough
shortest augmenting paths are exhausted, the shortest possible augmenting path
gets longer, and that can happen only a controlled number of times.

## Why Shortest Paths Matter

If you find one augmenting path at a time, an unlucky path can leave many other
easy repairs for later. That still converges, but it may spend one full search
per unit of matching growth.

Hopcroft-Karp refuses to leave the current depth half-used. Once the BFS has
identified the shortest augmenting distance, the DFS phase tries to saturate that
layer with vertex-disjoint repairs. It does not chase longer paths yet.

This gives two useful invariants:

```text
within a phase, all augmenting paths have minimum length
between phases, the next successful path length strictly increases
```

The proof of the full bound is more delicate than those two lines, but the
engineering intuition is already visible: the algorithm amortizes search over a
batch of equally urgent repairs.

## The Browser Lab

The lab below runs Hopcroft-Karp, a one-path-at-a-time DFS baseline, a brute
force maximum-matching oracle, and the standard alternating-reachability vertex
cover certificate. Green edges are matched. Orange edges are augmenting paths in
the selected phase. Blue dashed edges show the alternating BFS layer. Purple
nodes form the final cover certificate.

<style>
  .hopcroft-karp-lab {
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

  .hopcroft-karp-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .hopcroft-karp-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .hopcroft-karp-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .hopcroft-karp-lab input,
  .hopcroft-karp-lab select {
    accent-color: #b45309;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .hopcroft-karp-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .hopcroft-karp-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0 0 0.9rem;
  }

  .hopcroft-karp-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.4rem;
    padding: 0.58rem 0.65rem;
  }

  .hopcroft-karp-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .hopcroft-karp-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.92rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.24rem;
    overflow-wrap: anywhere;
  }

  .hopcroft-karp-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .hopcroft-karp-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 720px) {
    .hopcroft-karp-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="hopcroft-karp-lab" data-hopcroft-karp-lab>
  <div class="hopcroft-karp-lab__controls">
    <label>
      Graph
      <output data-value="example">two chain traps</output>
      <select data-param="example" aria-label="Bipartite graph example">
        <option value="traps" selected>two chain traps</option>
        <option value="applicants">applicant shortlist</option>
        <option value="bottleneck">shared bottleneck</option>
        <option value="grid">staggered grid</option>
      </select>
    </label>
    <label>
      Phase
      <output data-value="phase">0 / 0</output>
      <input data-param="phase" type="range" min="0" max="0" value="0" step="1" aria-label="Hopcroft-Karp phase">
    </label>
  </div>

  <div class="hopcroft-karp-lab__metrics">
    <div class="hopcroft-karp-lab__metric"><span>left</span><strong data-metric="left">0</strong></div>
    <div class="hopcroft-karp-lab__metric"><span>right</span><strong data-metric="right">0</strong></div>
    <div class="hopcroft-karp-lab__metric"><span>edges</span><strong data-metric="edges">0</strong></div>
    <div class="hopcroft-karp-lab__metric"><span>matching</span><strong data-metric="matching">0</strong></div>
    <div class="hopcroft-karp-lab__metric"><span>HK phases</span><strong data-metric="phases">0</strong></div>
    <div class="hopcroft-karp-lab__metric"><span>single-path flips</span><strong data-metric="dfs">0</strong></div>
    <div class="hopcroft-karp-lab__metric"><span>cover size</span><strong data-metric="cover">0</strong></div>
    <div class="hopcroft-karp-lab__metric"><span>audit</span><strong data-metric="audit">passes</strong></div>
  </div>

  <canvas width="1080" height="720" aria-label="Hopcroft-Karp bipartite matching phase visualization"></canvas>
  <p class="hopcroft-karp-lab__note">
    The terminal phase has no augmenting path. Its alternating reachability set
    gives the vertex-cover certificate drawn in purple.
  </p>
</div>

<script defer src="{{ '/assets/js/hopcroft-karp-lab.js?v=20260618c' | relative_url }}"></script>

In the default graph, the maximum matching has 6 edges. A one-path-at-a-time
baseline performs 6 flips. Hopcroft-Karp still flips 6 augmenting paths total,
but it batches them into 2 successful phases:

```text
phase 0: four length-1 repairs
phase 1: two longer repairs exposed by the new alternating forest
```

Then the terminal phase finds no augmenting path. The purple vertex cover has
size 6, matching the 6-edge matching.

That cover is not decoration. In a bipartite graph, the alternating-reachability
construction from a maximum matching gives a minimum vertex cover; Kőnig's
theorem says the two cardinalities are equal.[^konig] The lab also checks the
answer by brute force on these small graphs, so the visual certificate is not
trusted blindly.

## Reproducibility Check

The browser file is also a CommonJS module. From the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/hopcroft-karp-lab.js");
const EXPECTED_GROUPS = 5;
const EXPECTED_NAMED_CASES = 4;
const EXPECTED_EXHAUSTIVE_CASES = 74954;
const EXPECTED_CHECKS = 1174332;

const audit = lab.auditHopcroftKarp();
console.table(audit.byPhaseCount);
const auditShape = {
  namedRows: audit.cases.length,
  exhaustiveCases: audit.exhaustiveCases,
  passed: audit.passed,
  total: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks
};
if (auditShape.namedRows !== EXPECTED_NAMED_CASES ||
    auditShape.exhaustiveCases !== EXPECTED_EXHAUSTIVE_CASES ||
    auditShape.total !== EXPECTED_GROUPS ||
    auditShape.totalChecks !== EXPECTED_CHECKS) {
  throw new Error("unexpected audit size: " + JSON.stringify(auditShape));
}

const failedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const exhaustiveFailures = audit.exhaustive.failedChecks.slice(0, 10);
if (!audit.ok || failedCases.length || !audit.exhaustive.passed ||
    audit.passed !== audit.total || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    failures: audit.failures,
    issues: audit.issues.slice(0, 10),
    failedCases,
    exhaustiveFailures,
    auditShape
  }, null, 2));
}
console.log(audit.exhaustiveCases + " exhaustive bipartite graphs checked");
console.table(audit.cases.map((row) => ({
  graph: row.label,
  matching: row.matching,
  brute: row.bruteForceSize,
  phases: row.phases,
  paths: row.phasePathCounts,
  cover: row.coverSize,
  passed: row.passed
})));
console.log(`${audit.passed}/${audit.total} audit groups and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`);
NODE
```

The current audit checks the four named graph scenarios and every bipartite
graph with 1 to 4 left vertices and 1 to 4 right vertices. That is 74,954
exhaustive small graphs and 1,174,332 named checks. For each case it verifies:

- Hopcroft-Karp returns a valid matching;
- the one-path DFS baseline returns a valid matching;
- both matching sizes equal a brute-force maximum-matching oracle;
- every phase path is a real augmenting path relative to that phase's incoming
  matching;
- paths batched in one phase are vertex-disjoint;
- the matching size increases by the number of phase paths; and
- the final alternating-reachability vertex cover covers every edge and has size
  equal to the matching.

The implementation is deliberately small:
[`assets/js/hopcroft-karp-lab.js`]({{ '/assets/js/hopcroft-karp-lab.js' | relative_url }}).

## Where The Model Stops

This is maximum-cardinality bipartite matching. It is not stable matching and it
is not weighted assignment.

Stable matching asks whether any pair would rather leave their assigned partners
for each other. Maximum matching ignores preferences entirely. Weighted
assignment asks for the best total weight, usually with the Hungarian algorithm
or min-cost flow. Hopcroft-Karp ignores weights entirely.

Those distinctions matter in product systems. A scheduler that merely maximizes
the number of filled slots may create bad allocations. A market design that
merely avoids blocking pairs may leave cardinality or welfare on the table. A
weighted assignment solver may be the wrong tool if the graph is huge, sparse,
and the first requirement is simply "match as many as possible."

Hopcroft-Karp earns its place when the contract is exactly:

```text
bipartite graph in
maximum number of disjoint edges out
```

Under that contract, the wave idea is precise. Do not repair one complaint and
restart. Find the shortest complaints, pack all disjoint ones, flip them
together, and only then ask whether the next complaint must be longer.

The matching grows because every augmenting path is local evidence. It arrives
in waves because the algorithm refuses to waste a shortest layer.

[^berge]: Claude Berge, ["Two Theorems in Graph Theory"](https://pmc.ncbi.nlm.nih.gov/articles/PMC534337/), *Proceedings of the National Academy of Sciences* 43(9):842-844, 1957. PubMed record: <https://pubmed.ncbi.nlm.nih.gov/16590096/>.

[^hopcroft-karp]: John E. Hopcroft and Richard M. Karp, ["An $$n^{5/2}$$ Algorithm for Maximum Matchings in Bipartite Graphs"](https://epubs.siam.org/doi/10.1137/0202019), *SIAM Journal on Computing* 2(4):225-231, 1973. A PDF copy is hosted by the University of Michigan: <https://web.eecs.umich.edu/~pettie/matching/Hopcroft-Karp-bipartite-matching.pdf>.

[^konig]: The vertex-cover certificate used in the lab is the standard constructive form of Kőnig's theorem for bipartite graphs. See, for example, Princeton ORF 523 notes, ["Bipartite matching and vertex covers"](https://www.princeton.edu/~aaa/Public/Teaching/ORF523/ORF523_Lec6.pdf).
