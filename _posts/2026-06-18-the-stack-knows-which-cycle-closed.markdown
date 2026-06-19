---
layout: post
title: "The Stack Knows Which Cycle Closed"
description: "Tarjan's SCC algorithm turns one depth-first search into a component partition by keeping lowlink values and popping only when an open cycle can no longer reach earlier stack nodes."
date: 2026-06-18 03:38:00 -0400
categories: computer-science
tags: [strongly-connected-components, tarjan, depth-first-search, graph-algorithms, lowlink, algorithms, visualization]
excerpt: "A strongly connected component is not discovered when the first cycle appears. It is discovered when the DFS stack proves that no open vertex in the region can reach an earlier open root."
---

A directed graph can look tangled even when its large-scale structure is simple.

Inside a cycle, vertices can reach one another. Between cycles, reachability may
only go forward. Collapse each mutually reachable region into one node and the
graph becomes a DAG. Those regions are the **strongly connected components**.

The definition is global:

```text
u and v are in the same component if u reaches v and v reaches u
```

Tarjan's algorithm finds the partition during one depth-first search.[^tarjan]
It does not run a reachability search from every vertex. It does not reverse the
graph. It keeps a stack of vertices whose component is still open, and a number
that tells each vertex how far back into that open stack it can still reach.

That number is the lowlink.

## Lowlink Is A Claim About The Open Stack

When DFS first visits a vertex $$v$$, assign it an index:

```text
index[v] = next discovery number
low[v]   = index[v]
push v onto the open stack
```

Then inspect each outgoing edge $$v \to w$$.

If $$w$$ has not been visited, recurse into $$w$$. When the recursion returns,
anything that $$w$$'s subtree can reach is also reachable from $$v$$, so:

$$
\mathrm{low}[v] = \min(\mathrm{low}[v], \mathrm{low}[w]).
$$

If $$w$$ has already been visited and is still on the stack, then $$v$$ has found
an edge back into the currently open DFS region:

$$
\mathrm{low}[v] = \min(\mathrm{low}[v], \mathrm{index}[w]).
$$

If $$w$$ has already been assigned to a closed component, ignore it for lowlink
purposes. That edge points to a finished component. It cannot help the current
open region reach an earlier open root.

This is the common place to make the algorithm mysterious. Lowlink is not the
smallest discovery index reachable anywhere in the graph. It is the smallest
discovery index reachable through the DFS subtree while staying relevant to the
open stack.

That is why the stack flag matters.

## Roots Pop Components

After all outgoing edges of $$v$$ have been processed, one test decides whether a
component is complete:

$$
\mathrm{low}[v] = \mathrm{index}[v].
$$

If this holds, no vertex in $$v$$'s open DFS subtree can reach an open vertex
discovered before $$v$$. The component rooted at $$v$$ is exactly the suffix of
the stack from the top down to $$v$$. Pop that suffix and emit it.

If the inequality is strict, leave $$v$$ on the stack. Some path below it reaches
an earlier open vertex, so the component is not closed yet.

The pop rule is small, but it carries a lot of meaning:

```text
low[v] < index[v]  -> v still belongs to an older open region
low[v] = index[v]  -> v is the first open vertex of its SCC
```

Tarjan's 1972 paper presents the strongly connected component algorithm as one
of the examples showing the value of depth-first search for linear graph
algorithms.[^tarjan-pdf] Each vertex is discovered once. Each edge is examined
once. The stack records the unresolved boundary.

## The Browser Lab

The lab below runs Tarjan's algorithm, records every discovery, lowlink update,
stack pop, and emitted component, and checks the result against a brute-force
reachability oracle. Each node label is `index/lowlink`. Green nodes are still
on the stack. Purple outlines are components that have already been emitted.

<style>
  .tarjan-scc-lab {
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

  .tarjan-scc-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .tarjan-scc-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .tarjan-scc-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .tarjan-scc-lab input,
  .tarjan-scc-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .tarjan-scc-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .tarjan-scc-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0 0 0.9rem;
  }

  .tarjan-scc-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.4rem;
    padding: 0.58rem 0.65rem;
  }

  .tarjan-scc-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .tarjan-scc-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.92rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.24rem;
    overflow-wrap: anywhere;
  }

  .tarjan-scc-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .tarjan-scc-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 720px) {
    .tarjan-scc-lab {
      padding: 0.75rem;
    }
  }
</style>

<div class="tarjan-scc-lab" data-tarjan-scc-lab>
  <div class="tarjan-scc-lab__controls">
    <label>
      Graph
      <output data-value="example">bow-tie loops</output>
      <select data-param="example" aria-label="Directed graph example">
        <option value="bowtie" selected>bow-tie loops</option>
        <option value="compiler">module imports</option>
        <option value="dag">plain DAG</option>
        <option value="nested">nested escape</option>
      </select>
    </label>
    <label>
      Event
      <output data-value="step">0 / 0</output>
      <input data-param="step" type="range" min="0" max="0" value="0" step="1" aria-label="Tarjan trace event">
    </label>
  </div>

  <div class="tarjan-scc-lab__metrics">
    <div class="tarjan-scc-lab__metric"><span>nodes</span><strong data-metric="nodes">0</strong></div>
    <div class="tarjan-scc-lab__metric"><span>edges</span><strong data-metric="edges">0</strong></div>
    <div class="tarjan-scc-lab__metric"><span>components</span><strong data-metric="components">0</strong></div>
    <div class="tarjan-scc-lab__metric"><span>events</span><strong data-metric="events">0</strong></div>
    <div class="tarjan-scc-lab__metric"><span>stack depth</span><strong data-metric="stack">0</strong></div>
    <div class="tarjan-scc-lab__metric"><span>DAG edges</span><strong data-metric="dag">0</strong></div>
    <div class="tarjan-scc-lab__metric"><span>oracle</span><strong data-metric="audit">passes</strong></div>
  </div>

  <canvas width="1080" height="720" aria-label="Tarjan strongly connected components trace visualization"></canvas>
  <p class="tarjan-scc-lab__note">
    Orange edges update lowlink through an open stack vertex. Gray dashed edges
    point into already-closed components and are ignored for lowlink.
  </p>
</div>

<script defer src="{{ '/assets/js/tarjan-scc-lab.js?v=20260618c' | relative_url }}"></script>

On the default graph, 7 vertices and 10 directed edges collapse into 3 strongly
connected components. The condensation graph has 3 inter-component edges and is
acyclic.

Move the event slider slowly. The interesting moments are the orange stack
edges: they lower a vertex's lowlink because a still-open ancestor is reachable.
Later, gray dashed edges do not lower lowlink, because their target has already
been popped into a finished component. The graph still has that edge; it just no
longer changes the identity of the current open component.

## Reproducibility Check

The browser file is also a CommonJS module. From the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/tarjan-scc-lab.js");
const EXPECTED_CHECKS = [
  { name: "vertices-appear-once", ok: true },
  { name: "partition-matches-oracle", ok: true },
  { name: "components-strongly-connected", ok: true },
  { name: "condensation-is-dag", ok: true },
  { name: "lowlinks-in-index-range", ok: true }
];
const EXPECTED_CASES = [
  {
    example: "bowtie", label: "bow-tie loops", nodes: 7, edges: 10,
    components: 3, condensationEdges: 3, maxStackDepth: 7, events: 37,
    passed: true, passedChecks: 5, totalChecks: 5
  },
  {
    example: "compiler", label: "module imports", nodes: 8, edges: 10,
    components: 3, condensationEdges: 2, maxStackDepth: 8, events: 40,
    passed: true, passedChecks: 5, totalChecks: 5
  },
  {
    example: "dag", label: "plain DAG", nodes: 6, edges: 7,
    components: 6, condensationEdges: 7, maxStackDepth: 5, events: 37,
    passed: true, passedChecks: 5, totalChecks: 5
  },
  {
    example: "nested", label: "nested escape", nodes: 7, edges: 10,
    components: 1, condensationEdges: 0, maxStackDepth: 7, events: 33,
    passed: true, passedChecks: 5, totalChecks: 5
  }
];
const EXPECTED_COMPONENT_GROUPS = [
  {
    components: 1, cases: 1, graphs: "nested", maxCondensationEdges: 0,
    maxStackDepth: 7, passed: 1, passedChecks: 5, totalChecks: 5
  },
  {
    components: 3, cases: 2, graphs: "bowtie, compiler",
    maxCondensationEdges: 3, maxStackDepth: 8, passed: 2,
    passedChecks: 10, totalChecks: 10
  },
  {
    components: 6, cases: 1, graphs: "dag", maxCondensationEdges: 7,
    maxStackDepth: 5, passed: 1, passedChecks: 5, totalChecks: 5
  }
];
const EXPECTED_EXHAUSTIVE_BY_SIZE = [
  { nodes: 1, cases: 2, failed: 0, passed: true, passedChecks: 10, totalChecks: 10 },
  { nodes: 2, cases: 16, failed: 0, passed: true, passedChecks: 80, totalChecks: 80 },
  { nodes: 3, cases: 512, failed: 0, passed: true, passedChecks: 2560, totalChecks: 2560 },
  { nodes: 4, cases: 65536, failed: 0, passed: true, passedChecks: 327680, totalChecks: 327680 }
];
const EXPECTED_TOTALS = {
  namedCases: 4,
  auditGroups: 5,
  exhaustiveSizes: 4,
  exhaustiveCases: 66066,
  passedGroups: 5,
  totalGroups: 5,
  passedChecks: 330350,
  totalChecks: 330350
};

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function rowDrifts(actualRows, expectedRows) {
  const drifts = [];
  const rows = Math.max(actualRows.length, expectedRows.length);
  for (let index = 0; index < rows; index += 1) {
    const actual = index < actualRows.length ? actualRows[index] : null;
    const expected = index < expectedRows.length ? expectedRows[index] : null;
    if (!sameJson(actual, expected)) {
      drifts.push({ index, actual, expected });
    }
  }
  return drifts;
}

const audit = lab.auditTarjanScc();
const caseRows = audit.cases.map((row) => ({
  example: row.example,
  label: row.label,
  nodes: row.nodes,
  edges: row.edges,
  components: row.components,
  condensationEdges: row.condensationEdges,
  maxStackDepth: row.maxStackDepth,
  events: row.events,
  passed: row.passed,
  passedChecks: row.passedChecks,
  totalChecks: row.totalChecks
}));
const componentRows = audit.byComponentCount.map((row) => ({
  components: row.components,
  cases: row.cases,
  graphs: row.graphs,
  maxCondensationEdges: row.maxCondensationEdges,
  maxStackDepth: row.maxStackDepth,
  passed: row.passed,
  passedChecks: row.passedChecks,
  totalChecks: row.totalChecks
}));
const exhaustiveRows = audit.exhaustive.bySize.map((row) => ({
  nodes: row.nodes,
  cases: row.cases,
  failed: row.failed,
  passed: row.passed,
  passedChecks: row.passedChecks,
  totalChecks: row.totalChecks
}));
const checkRows = audit.cases.map((row) => ({
  example: row.example,
  checks: row.checks.map((check) => ({
    name: check.name,
    ok: check.ok
  }))
}));
const expectedCheckRows = EXPECTED_CASES.map((row) => ({
  example: row.example,
  checks: EXPECTED_CHECKS
}));
const auditShape = {
  namedCases: audit.cases.length,
  auditGroups: audit.total,
  exhaustiveSizes: audit.exhaustive.bySize.length,
  exhaustiveCases: audit.exhaustiveCases,
  passedGroups: audit.passed,
  totalGroups: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks
};
const caseRowDrifts = rowDrifts(caseRows, EXPECTED_CASES);
const componentRowDrifts = rowDrifts(componentRows, EXPECTED_COMPONENT_GROUPS);
const exhaustiveRowDrifts = rowDrifts(exhaustiveRows, EXPECTED_EXHAUSTIVE_BY_SIZE);
const checkRowDrifts = rowDrifts(checkRows, expectedCheckRows);
const driftShape = {
  auditShape,
  caseRowDrifts,
  componentRowDrifts,
  exhaustiveRowDrifts,
  checkRowDrifts
};
const shapeErrors = [
  sameJson(auditShape, EXPECTED_TOTALS) ? null : "totals",
  caseRowDrifts.length === 0 ? null : "caseRows",
  componentRowDrifts.length === 0 ? null : "componentRows",
  exhaustiveRowDrifts.length === 0 ? null : "exhaustiveRows",
  checkRowDrifts.length === 0 ? null : "checkRows"
].filter(Boolean);
if (shapeErrors.length) {
  throw new Error(
    `Tarjan audit shape drifted in ${shapeErrors.join(", ")}:\n` +
    JSON.stringify(driftShape, null, 2)
  );
}
console.log(audit.exhaustiveCases + " exhaustive graphs checked");
console.table(componentRows);
console.table(exhaustiveRows);
console.table(caseRows.map((row) => ({
  graph: row.label,
  components: row.components,
  condensationEdges: row.condensationEdges,
  maxStack: row.maxStackDepth,
  events: row.events,
  checks: `${row.passedChecks}/${row.totalChecks}`,
  passed: row.passed
})));
const summary =
  `${audit.passed}/${audit.total} audit groups and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`;
const failedNamedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const failedExhaustiveSizes = audit.exhaustive.bySize.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (!audit.ok || failedNamedCases.length || failedExhaustiveSizes.length ||
    audit.passed !== audit.total || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    issues: audit.issues,
    failedNamedCases,
    failedExhaustiveSizes,
    auditShape
  }, null, 2));
}
console.log(summary);
NODE
```

The audit checks the named examples and every directed graph with self-loops on
1 through 4 vertices. That is 66,066 exhaustive small graphs and 330,350 named
checks. For each case it verifies:

- Tarjan's component partition matches a brute-force reachability oracle;
- every vertex appears in exactly one component;
- every emitted component is mutually reachable;
- the condensation graph is acyclic; and
- every final lowlink value is in range for its discovery index.

The implementation is intentionally small:
[`assets/js/tarjan-scc-lab.js`]({{ '/assets/js/tarjan-scc-lab.js' | relative_url }}).

## Why This Is Not Just Cycle Detection

Cycles are local. Strong components are maximal mutual-reachability regions.

If a graph has one cycle feeding another cycle, those are not automatically one
component. The first cycle can reach the second, but the second may not reach
back. Tarjan's stack rule handles this cleanly: once the second cycle closes and
pops, later edges into it are ignored for the first cycle's lowlink.

That is also why the component graph is a DAG. If two emitted components could
reach each other, they were never separate strongly connected components. They
would have belonged to one maximal mutual-reachability region.

In compilers, SCCs show up in module cycles, recursive definitions, dataflow
systems, and dependency scheduling. In distributed systems, they show up when
you compress a directed reachability relation into failure domains or replication
dependencies. In graph analytics, they are often the first pass before running a
more expensive algorithm on the condensation graph.

The algorithm's charm is that the expensive-looking global claim is settled by a
local stack invariant:

```text
open vertices stay on the stack
lowlink records the earliest open vertex reachable from a DFS subtree
low[v] == index[v] means the suffix above v is sealed
```

The stack does not remember every path. It remembers exactly which roots are
still negotiable.

[^tarjan]: Robert E. Tarjan, ["Depth-First Search and Linear Graph Algorithms"](https://epubs.siam.org/doi/10.1137/0201010), *SIAM Journal on Computing* 1(2):146-160, 1972.

[^tarjan-pdf]: A public PDF copy of Tarjan's paper is hosted by Carnegie Mellon: ["Depth-First Search and Linear Graph Algorithms"](https://www.cs.cmu.edu/~cdm/resources/Tarjan1972-sccs.pdf). The SCC pseudocode stores reached-but-not-yet-assigned vertices on a stack and emits components when `LOWLINK(v) = NUMBER(v)`.
