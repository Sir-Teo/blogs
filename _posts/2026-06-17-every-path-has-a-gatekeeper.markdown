---
layout: post
title: "Every Path Has a Gatekeeper"
description: "Dominator trees turn control flow into a question a compiler can answer: which blocks must every path pass through before reaching this point?"
date: 2026-06-17 00:15:00 -0400
categories: computer-science
tags: [dominators, dominance-frontier, compilers, control-flow-graphs, static-single-assignment, data-flow-analysis, programming-languages]
excerpt: "A dominator is not a graph-theory ornament. It is the receipt that says every execution path paid the same toll before reaching a block."
---

The compiler looks at a function and sees a city map.

Basic blocks are intersections. Edges are streets. The entry block is the one
gate into town. A branch is a fork. A loop is a street that sends you back to a
previous intersection. A join is where different stories become one story again.

Then the compiler asks a question that sounds almost bureaucratic:

```text
Did every path to this block pass through that block first?
```

If yes, the first block dominates the second.

That definition is older than the modern phrase "SSA form." Prosser introduced
dominance in flow-diagram analysis in 1959.[^prosser] Frances Allen's 1970
control-flow analysis paper describes the point of these graph summaries in a
compiler: they codify flow relationships so the compiler can answer questions
about loops, motion, placement, and reaching definitions.[^allen]

I like dominators because they are one of the places where compiler theory
keeps its hands clean. No probabilistic model. No heuristic vibe. Just:

```text
all paths from entry to B include A
```

That tiny sentence ends up organizing loop detection, code motion, control
dependence, and the placement of SSA phi functions.

## The Equation

Let `Dom(n)` be the set of blocks that dominate block `n`.

The entry block dominates only itself:

$$
Dom(entry) = \{entry\}.
$$

Every other block must be reached through one of its predecessors. A block
dominates `n` exactly when it dominates every predecessor of `n`, plus `n`
itself:

$$
Dom(n) = \{n\} \cup \bigcap_{p \in pred(n)} Dom(p).
$$

This is a fixed-point equation. Start pessimistically:

```text
entry dominates entry
every other block might be dominated by every block
```

Then keep intersecting predecessor sets until nothing changes. The sets can
only shrink, so the process settles.

Lengauer and Tarjan gave the classic fast dominator algorithm in 1979, using
depth-first search and union-find machinery to compute dominator trees with
near-linear asymptotic behavior.[^lengauer-tarjan] That algorithm matters. But
for learning, testing, and many ordinary compiler sizes, the simple iterative
view is not just a toy. Cooper, Harvey, and Kennedy argued for a carefully
engineered iterative algorithm, noting that it can be simpler and faster in
practice on realistic CFGs despite weaker asymptotic bounds.[^cooper]

The lab below uses the deliberately transparent version: solve the data-flow
equation, extract immediate dominators, compute dominance frontiers, and place
phi nodes for one variable.

## The Lab

In the default diamond:

```text
entry -> test -> then -> join -> exit
              \-> else -/
```

The selected block is `then`. Its dominators are:

```text
entry, test, then
```

Its dominance frontier is:

```text
join
```

That last line is the interesting one. The `then` block dominates one
predecessor of `join`, but it does not dominate `join` itself, because the
`else` path can reach `join` without going through `then`.

If `then` defines `x` and `else` defines `x`, the compiler needs a phi at
`join`.

<style>
  .dominator-lab {
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

  .dominator-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(152px, 1fr));
    margin-bottom: 1rem;
  }

  .dominator-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .dominator-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .dominator-lab select {
    background: #ffffff;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.2rem 0.45rem;
    width: 100%;
  }

  .dominator-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .dominator-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .dominator-lab__metric.good {
    border-color: #9ed8c5;
  }

  .dominator-lab__metric.warn {
    border-color: #f0b7b7;
  }

  .dominator-lab__metric span,
  .dominator-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .dominator-lab__metric span {
    display: block;
  }

  .dominator-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .dominator-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .dominator-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .dominator-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .dominator-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .dominator-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 540px) {
    .dominator-lab {
      padding: 0.75rem;
    }

    .dominator-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="dominator-frontier-lab" class="dominator-lab" data-dominator-frontier-lab>
  <div class="dominator-lab__controls">
    <label>
      CFG: <output data-value="scenario">diamond</output>
      <select data-param="scenario">
        <option value="diamond" selected>diamond</option>
        <option value="loop">loop-carried value</option>
        <option value="irreducible">two-entry cycle</option>
        <option value="switch">many-way switch</option>
      </select>
    </label>
    <label>
      Selected block: <output data-value="focus">then</output>
      <select data-param="focus">
        <option value="then" selected>then</option>
      </select>
    </label>
  </div>
  <div class="dominator-lab__metrics" data-metrics></div>
  <canvas data-canvas width="960" height="760" aria-label="Dominator frontier lab showing control-flow graph dominators, fixed-point iterations, immediate dominator tree, and phi placement"></canvas>
  <div class="dominator-lab__legend">
    <span><i style="background:#d8f1e8"></i> dominates selected</span>
    <span><i style="background:#0f766e"></i> selected block</span>
    <span><i style="background:#2563eb"></i> selected frontier</span>
    <span><i style="background:#d97706"></i> definition of x</span>
    <span><i style="background:#be123c"></i> phi placement</span>
  </div>
  <p class="dominator-lab__note">
    Deterministic CFG analysis. The solver uses the textbook fixed-point
    equation for dominator sets, derives immediate dominators from the final
    sets, computes dominance frontiers by definition, and places phi nodes with
    the iterated dominance frontier of the blocks that define x.
  </p>
</div>
<script defer src="{{ '/assets/js/dominator-frontier-lab.js?v=20260617a' | relative_url }}"></script>

Try four moves.

First, select `join`. The green set becomes `entry, test, join`: both arms of
the branch can reach the join, so neither arm dominates it. The frontier of
`join` is empty in this acyclic diamond, but the phi still sits there because
the definitions in `then` and `else` have frontiers there.

Second, switch to `loop-carried value` and select `latch`. The frontier is the
loop header. That is the loop version of the same story: a value assigned before
the loop and a value assigned on the backedge must meet at the header.

Third, switch to `many-way switch`. Three definitions flow into one join. The
phi count remains one. Phi placement is not "one phi per incoming value." It is
one merge point for the variable, with one argument per predecessor.

Fourth, switch to `two-entry cycle`. This graph is intentionally unpleasant.
The cycle can be entered through either side, so neither side dominates the
other. The iterated frontier places phis at both cycle heads and the final
merge. Irreducible control flow is what happens when the city map refuses to be
structured like `if` and `while`.

## Why The Frontier Is The Edge Of Authority

Dominance is authority over all paths.

If `A` dominates `B`, then anything proven at `A` is guaranteed to have happened
before `B`. That is why dominators are useful for code motion and loop
reasoning. If a computation can be safely hoisted to a dominator, every later
use still sees it.

But a dominance frontier is where this authority runs out.

A block `x` is in the story of a block `y`'s frontier when:

```text
y has a predecessor dominated by x
but y itself is not strictly dominated by x
```

That means some incoming edge to `y` carries the authority of `x`, while another
incoming route may not. The compiler has found a merge boundary.

This is exactly why dominance frontiers became central to SSA construction.
Cytron, Ferrante, Rosen, Wegman, and Zadeck introduced dominance frontiers as
the structure that makes efficient SSA and control-dependence construction
practical.[^cytron] In SSA, every variable assignment gets a unique name. At a
join where different names can arrive, the compiler inserts a phi function:

```text
then: x1 = 1
else: x2 = 2
join: x3 = phi(x1, x2)
```

The phi is not a runtime function in the ordinary sense. It is a bookkeeping
node saying: the name of `x` after this join depends on which predecessor edge
was taken.

Dominance frontiers tell the compiler where those bookkeeping nodes belong.

## What The Tree Forgets

The dominator tree is beautiful because it turns an all-paths statement into a
parent relation:

```text
idom(B) = the closest strict dominator of B
```

In the diamond, the tree says:

```text
entry -> test -> then
              -> else
              -> join -> exit
```

That tree is a compression of facts:

```text
entry dominates everything
test dominates then, else, join, exit
join dominates exit
```

But the tree alone does not tell you where values merge. For that, you need the
frontier. A tree says who owns a region. A frontier says where the ownership
stops being exclusive.

That is the reason the lab draws both. The dominator tree is the skeleton; the
frontier is the skin.

## A Small Engineering Moral

The fixed-point solver in the lab is intentionally simple. It is not the
algorithm you would choose for every production compiler. But it has a virtue
that should not be underrated: it exposes the invariant.

Each pass through the equation removes impossible dominators. The bar chart is
not measuring runtime performance. It is measuring uncertainty disappearing.

That matters when debugging a compiler pass. If a block is not dominated by the
thing you expected, the graph has found a real counterexample path. Maybe the
pass forgot an exceptional edge. Maybe an early return bypasses the setup code.
Maybe a loop has two entries. Maybe the function is not as structured as the
source syntax made it look.

Dominators turn those surprises into a crisp question:

```text
show me the path that did not pay the toll
```

That is a good kind of compiler fact. It is not a guess. It is a path claim.

[^prosser]: Reese T. Prosser, ["Applications of Boolean Matrices to the Analysis of Flow Diagrams"](https://dl.acm.org/doi/10.1145/1460299.1460314), Eastern Joint IRE-AIEE-ACM Computer Conference, 1959.

[^allen]: Frances E. Allen, ["Control Flow Analysis"](https://se421-fall2018.github.io/resources/readings/p1-allen.pdf), *SIGPLAN Notices*, July 1970.

[^lengauer-tarjan]: Thomas Lengauer and Robert E. Tarjan, ["A Fast Algorithm for Finding Dominators in a Flowgraph"](https://www.cs.princeton.edu/courses/archive/fall03/cs528/handouts/a%20fast%20algorithm%20for%20finding.pdf), *ACM Transactions on Programming Languages and Systems* 1(1):121-141, 1979.

[^cooper]: Keith D. Cooper, Timothy J. Harvey, and Ken Kennedy, ["A Simple, Fast Dominance Algorithm"](https://www.cs.tufts.edu/~nr/cs257/archive/keith-cooper/dom14.pdf), Rice University technical report, 2001/2006.

[^cytron]: Ron Cytron, Jeanne Ferrante, Barry K. Rosen, Mark N. Wegman, and F. Kenneth Zadeck, ["Efficiently Computing Static Single Assignment Form and the Control Dependence Graph"](https://www.cs.utexas.edu/~pingali/CS380C/2010/papers/ssaCytron.pdf), *ACM Transactions on Programming Languages and Systems* 13(4):451-490, 1991.
