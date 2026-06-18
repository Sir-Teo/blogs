---
layout: post
title: "The Ready Queue Is a Proof"
description: "Topological sorting is not just a way to print a build order. The zero-indegree queue is a local certificate of legality, and the critical path says how much parallelism cannot help."
date: 2026-06-18 07:43:00 -0400
categories: computer-science
tags: [topological-sort, kahn-algorithm, critical-path, scheduling, dag, build-systems, algorithms]
excerpt: "A dependency graph is legal only if the ready queue never has to lie. Kahn's algorithm turns that fact into an audit trail, while critical-path scheduling explains why more workers do not always buy more time."
---

A build order is a witness.

It says more than "I found a sequence." It says every target appeared only
after its prerequisites had already appeared. That is a small certificate, and
small certificates are gold in systems work: they let a build tool, workflow
engine, spreadsheet evaluator, migration runner, or package manager explain why
it was allowed to move.

Topological sorting is the old name for this certificate. Kahn's 1962 CACM
paper framed it as a method for ordering large networks, with PERT as one of the
motivating applications.[^kahn] The modern recipe is almost disarmingly simple:

```text
count incoming edges for every node
put every zero-indegree node in a ready set
while the ready set is nonempty:
    remove one ready node and emit it
    delete its outgoing edges
    newly zero-indegree nodes become ready
if un-emitted nodes remain, report a cycle
```

The word "ready" is doing real work. It is not a priority. It is a proof
obligation.

## A Source Must Exist

The central fact is this:

```text
every finite nonempty DAG has a vertex with indegree zero
```

Proof sketch: pick any vertex. If it has a predecessor, move to that
predecessor. If that predecessor has a predecessor, move again. In a finite
graph, an infinite backward walk must eventually repeat a vertex. A repeated
vertex is a directed cycle. Therefore, if there is no cycle, the walk must stop
at a vertex with no predecessor.

Kahn's algorithm is that proof turned into bookkeeping. At each step, the
remaining graph is still a DAG after removing the emitted node and its outgoing
edges, so another source must exist unless the graph is empty. Conversely, if
the ready set is empty while nodes remain, the remaining subgraph has no source.
Following predecessors inside that finite remainder eventually finds a cycle.

This is why the algorithm's failure mode is as useful as its success mode. A
cycle report is not "the sort got confused." It is evidence that no legal order
exists.

## The Queue Is Not The Schedule

Once several nodes are ready, the theorem stops talking. It permits any ready
node. A build system still has to choose:

```text
oldest ready task first?
alphabetical for reproducibility?
shortest task first to clear small work?
largest downstream critical path first?
```

All of those choices can produce valid topological orders. They do not produce
the same wall-clock time once tasks have durations and workers are scarce.

Critical-path planning made this distinction explicit in project scheduling.
Kelley and Walker's 1959 paper describes a network whose jobs have durations and
precedence constraints, then studies the path that controls the earliest
possible finish under the model's assumptions.[^kw] In a DAG of tasks:

```text
earliest_start(v)  = max earliest_finish(u) over predecessors u
earliest_finish(v) = earliest_start(v) + duration(v)
critical_path      = max earliest_finish(v)
```

That number is a lower bound. If a chain of dependent tasks takes 13 units, ten
workers cannot finish the graph in 8 units. The work bound is the other obvious
lower bound:

```text
makespan >= total_work / workers
```

So a static DAG schedule must satisfy:

```text
makespan >= max(critical_path, total_work / workers)
```

This lower bound is not an optimal scheduler. It is only a speed limit. List
scheduling, the family of "always start some ready job on an idle processor"
rules, has its own deep theory; Graham's timing-anomaly work is one of the
classic references around these greedy multiprocessor schedules.[^graham] The
important engineering point is humbler: legality and goodness are different
claims.

## Lab: Watch The Ready Set

The lab below runs a small implementation of Kahn's algorithm plus a
nonpreemptive worker scheduler. The left panel is the dependency graph. Orange
marks the critical path when the graph is acyclic. Red marks the residual cycle
when it is not. The worker chart is deliberately a list scheduler, not an
optimizer: it starts ready tasks according to the selected tie rule.

Try the **tie-breaking trap** with two workers. The **shortest task** rule
spends early worker slots on easy leaves and delays the long dependency chain.
The **critical tail** rule gives the long chain priority and reaches the lower
bound.

<style>
  .topo-lab {
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

  .topo-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .topo-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .topo-lab select,
  .topo-lab input {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    box-sizing: border-box;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.48rem 0.52rem;
    width: 100%;
  }

  .topo-lab input {
    accent-color: #0f766e;
    padding: 0;
  }

  .topo-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .topo-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin-bottom: 0.85rem;
  }

  .topo-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    min-width: 0;
    padding: 0.62rem 0.68rem;
  }

  .topo-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .topo-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.24rem;
  }

  .topo-lab__metric--good strong {
    color: #0f766e;
  }

  .topo-lab__metric--warn strong {
    color: #b45309;
  }

  .topo-lab__metric--bad strong {
    color: #be123c;
  }

  .topo-lab canvas {
    aspect-ratio: 960 / 620;
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-height: 720px;
    width: 100%;
  }

  .topo-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 620px) {
    .topo-lab {
      padding: 0.85rem;
    }

    .topo-lab canvas {
      aspect-ratio: 440 / 760;
      max-height: none;
    }
  }
</style>

<div class="topo-lab" data-topological-ready-lab>
  <div class="topo-lab__controls">
    <label>
      Graph
      <select data-param="scenario">
        <option value="build" selected>package build</option>
        <option value="trap">tie-breaking trap</option>
        <option value="cycle">cycle introduced</option>
      </select>
    </label>
    <label>
      Ready tie rule
      <select data-param="rule">
        <option value="critical" selected>critical tail</option>
        <option value="shortest">shortest task</option>
        <option value="fifo">input order</option>
        <option value="alpha">alphabetical</option>
      </select>
    </label>
    <label>
      Workers <output data-value="workers">3</output>
      <input data-param="workers" type="range" min="1" max="4" step="1" value="3">
    </label>
  </div>
  <div class="topo-lab__metrics" data-metrics></div>
  <canvas data-canvas width="960" height="620" aria-label="Topological sort and critical path scheduling lab"></canvas>
  <p class="topo-lab__note">The implementation is deterministic and static. It ignores cache effects, remote execution overhead, communication cost, retries, incremental rebuilds, and resource types beyond identical workers.</p>
</div>

<script defer src="{{ '/assets/js/topological-ready-lab.js?v=20260618c' | relative_url }}"></script>

## What The Audit Checks

The JavaScript exports a Node-friendly audit function. The same function used by
the page checks 26 named invariants across five deterministic cases:

```text
1. every emitted node had indegree zero at emission time
2. every edge points forward in the emitted order
3. every scheduled task starts after all predecessors finish
4. a rejected cyclic graph leaves no zero-indegree node in the remainder
5. every acyclic schedule respects the critical-path and work lower bounds
```

On the current examples, the reproducible run is:

```text
package build, critical tail, 3 workers:
  emitted 10 / 10 nodes
  total work 27
  critical path 13
  work / workers 9
  makespan 13

tie-breaking trap, critical tail, 2 workers:
  critical path 16
  work / workers 10.5
  makespan 16

tie-breaking trap, shortest task, 2 workers:
  critical path 16
  work / workers 10.5
  makespan 17

cycle introduced:
  emitted 2 / 6 nodes
  remaining types, lower, link, test
```

The compact reproduction check is:

```bash
node - <<'NODE'
const lab = require("./assets/js/topological-ready-lab.js");
const EXPECTED_CASES = 5;
const EXPECTED_CHECKS = 26;
const EXPECTED_MAKESPANS = {
  default: 13,
  trapCritical: 16,
  trapShortest: 17
};
const EXPECTED_TOTALS = {
  rows: EXPECTED_CASES,
  passed: EXPECTED_CASES,
  total: EXPECTED_CASES,
  passedChecks: EXPECTED_CHECKS,
  totalChecks: EXPECTED_CHECKS
};
const EXPECTED_CYCLE_REMAINING = ["types", "lower", "link", "test"];
const EXPECTED_CASE_SHAPE = [
  "cycle introduced:cycle:n/a:n/a:2:n/a:n/a:n/a:3",
  "package build:build:critical:3:10:13:13:27:6",
  "single worker build:build:critical:1:10:27:13:27:6",
  "trap critical tail:trap:critical:2:8:16:16:21:6",
  "trap shortest task:trap:shortest:2:8:17:16:21:5"
];
const EXPECTED_CHECK_SHAPE = [
  "cycle introduced:cycle remainder has no zero-indegree node|cycle was detected|partial pass selected only zero-indegree nodes",
  "package build:critical path names tasks|edges point forward in emitted order|makespan respects critical-path lower bound|makespan respects work lower bound|schedule respects dependencies|selected node had zero indegree",
  "single worker build:edges point forward in emitted order|makespan respects critical-path lower bound|makespan respects work lower bound|one worker takes total work time|schedule respects dependencies|selected node had zero indegree",
  "trap critical tail:critical rule beats shortest in trap|edges point forward in emitted order|makespan respects critical-path lower bound|makespan respects work lower bound|schedule respects dependencies|selected node had zero indegree",
  "trap shortest task:edges point forward in emitted order|makespan respects critical-path lower bound|makespan respects work lower bound|schedule respects dependencies|selected node had zero indegree"
];

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const audit = lab.auditTopologicalReadyLab();
console.table(audit.cases.map((row) => ({
  case: row.label,
  scenario: row.scenario,
  rule: row.rule || "n/a",
  workers: row.workers || "n/a",
  emitted: row.emitted,
  makespan: row.makespan || "n/a",
  criticalPath: row.criticalPath || "n/a",
  totalWork: row.totalWork || "n/a",
  remaining: row.remaining ? row.remaining.join(" ") : "",
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
const auditShape = {
  totals: {
    rows: audit.cases.length,
    passed: audit.passed,
    total: audit.total,
    passedChecks: audit.passedChecks,
    totalChecks: audit.totalChecks
  },
  makespans: {
    default: audit.defaultMakespan,
    trapCritical: audit.trapCritical,
    trapShortest: audit.trapShortest
  },
  caseChecks: audit.cases.map((row) => [
    row.label,
    row.scenario,
    row.rule || "n/a",
    row.workers || "n/a",
    row.emitted,
    row.makespan || "n/a",
    row.criticalPath || "n/a",
    row.totalWork || "n/a",
    row.totalChecks
  ].join(":")).sort(),
  checkNames: audit.cases.map((row) => (
    row.label + ":" + row.checks.map((check) => check.name).sort().join("|")
  )).sort(),
  cycleRemaining: audit.cycleRemaining
};
const shapeErrors = [
  sameJson(auditShape.totals, EXPECTED_TOTALS) ? null : "totals",
  sameJson(auditShape.makespans, EXPECTED_MAKESPANS) ? null : "makespans",
  sameJson(auditShape.cycleRemaining, EXPECTED_CYCLE_REMAINING) ? null : "cycleRemaining",
  sameJson(auditShape.caseChecks, EXPECTED_CASE_SHAPE) ? null : "caseChecks",
  sameJson(auditShape.checkNames, EXPECTED_CHECK_SHAPE) ? null : "checkNames"
].filter(Boolean);
if (shapeErrors.length) {
  throw new Error(
    `audit shape drifted in ${shapeErrors.join(", ")}:\n` +
    JSON.stringify(auditShape, null, 2)
  );
}

const failedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (!audit.ok || failedCases.length ||
    audit.passed !== audit.total ||
    audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    failures: audit.failures,
    failedCases,
    shapeErrors,
    auditShape
  }, null, 2));
}
console.log(
  `${audit.passed}/${audit.total} audit cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`
);
NODE
```

The interesting line is the trap. Both schedules are legal. Both pass the edge
audit. The shorter-looking local choice still loses a unit of wall-clock time
because it postpones the only chain that can never run in parallel with itself.

## Build Systems Want Both Ledgers

For a static build graph, the topological ledger answers:

```text
is this dependency graph legal?
what order can explain the run?
which residual nodes prove a cycle?
```

The scheduling ledger answers:

```text
which ready task should get a worker?
how much idle capacity was unavoidable?
which chain limited the whole run?
```

These ledgers are related but not interchangeable. A reproducible alphabetical
topological order is excellent for debugging and stable output. A
critical-tail heuristic may be better for finishing quickly. A shortest-task
heuristic may make a dashboard feel busy while damaging the long chain. A
resource-aware scheduler may need to ignore all of these simple priorities
because "ready" does not mean "can run on this machine without saturating the
network."

Kahn's algorithm gives the system permission to run. Critical-path analysis
explains how much time the permission can possibly save.

## The Useful Mental Model

When a dependency executor behaves strangely, ask two separate questions:

1. Did it ever run a task without a zero-indegree certificate?
2. Among the tasks that were ready, did it spend scarce workers on the chain
   that mattered?

The first question is correctness. The second is policy. Mixing them is how
perfectly legal builds become mysteriously slow.

[^kahn]: A. B. Kahn, ["Topological sorting of large networks"](https://dl.acm.org/doi/10.1145/368996.369025), *Communications of the ACM*, 5(11), 558-562, 1962. Metadata and abstract are also available from [Semantic Scholar](https://www.semanticscholar.org/paper/Topological-sorting-of-large-networks-Kahn/7724172425879e96bd4deee1c175ba840ebac5a6).

[^kw]: J. E. Kelley Jr. and M. R. Walker, ["Critical-Path Planning and Scheduling"](https://dl.acm.org/doi/10.1145/1460299.1460318), *Proceedings of the Eastern Joint IRE-AIEE-ACM Computer Conference*, 1959. A scanned copy from the Computer History Museum collection is mirrored by [Mosaic Projects](https://mosaicprojects.com.au/PDF/PM-History_Critical_Path_Planning_%26_Scheduling_Kelley_and_Walker_1959.pdf).

[^graham]: R. L. Graham, ["Bounds on Multiprocessing Timing Anomalies"](https://epubs.siam.org/doi/10.1137/0117039), *SIAM Journal on Applied Mathematics*, 17(2), 263-269, 1969.
