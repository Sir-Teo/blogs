---
layout: post
title: "The Variable Order Is the Algorithm"
description: "Reduced ordered binary decision diagrams are canonical only after you choose an order. The wrong order can make a small Boolean function look enormous."
date: 2026-06-17 02:00:00 -0400
categories: computer-science
tags: [binary-decision-diagrams, robdds, symbolic-algorithms, model-checking, verification, boolean-functions, algorithms]
excerpt: "A Boolean function is not just a truth table waiting to be compressed. In a ROBDD, the variable order decides what the diagram has to remember."
---

A Boolean function with twenty variables has only one truth table.

It has many possible stories.

If the first ten bits are called `x0..x9` and the last ten are called
`y0..y9`, the equality test

```text
x == y
```

can be a tiny ritual:

```text
read x0
read y0
forget both
read x1
read y1
forget both
...
```

Or it can be a memory test:

```text
read all of x
keep every possible prefix alive
then finally read y
```

The function did not change. The representation did.

That is the strange beauty of reduced ordered binary decision diagrams
(ROBDDs): once the variable order is fixed, reduction gives a canonical graph
for the Boolean function. Before the order is fixed, the same function can be
small, medium, or embarrassing.

## The Canonical Form Has a Hidden Parameter

Randal Bryant's 1986 paper introduced the modern ordered BDD discipline: a
Boolean function is represented as a directed acyclic graph whose nonterminal
nodes test variables, and every path respects one shared variable order.[^bryant-1986]
The graph is then reduced by applying two rules:

1. Delete a test if both branches go to the same child.
2. Merge nodes that test the same variable and have identical low and high
   children.

Those two rules are the whole trick. They turn a decision tree into a shared
program. Subproblems that are identical become literally the same node.

In the 1992 survey, Bryant emphasized why this was so useful: OBDDs give a
canonical representation for a fixed order, so equivalence and satisfiability
become graph questions, and many Boolean operations can be implemented by
graph algorithms.[^bryant-1992]

But "for a fixed order" is doing a lot of work.

For an ROBDD, the order is not a formatting preference. It is closer to a
streaming schedule. The graph reads variables in that schedule, and its width
at level `i` measures how many distinct futures the function still has to
remember after seeing the first `i` variables.

If related variables arrive together, reduction can collapse the graph early.
If related variables are separated, the diagram must carry unresolved
information forward.

## A Tiny ROBDD Manager

The lab below builds ROBDDs from scratch. It has a unique table, a recursive
`apply` operation, terminal nodes, exact `BigInt` model counts, and a small
audit suite. It is not CUDD, and it does not try to do dynamic reordering. That
is on purpose: the point is to make the representation pressure visible.

There are two functions:

```text
equality:     accept iff every pair has x_i == y_i
pairwise hit: accept iff at least one pair has x_i == y_i == 1
```

And four fixed orders:

```text
paired:       x0, y0, x1, y1, ...
grouped:      x0, x1, ..., y0, y1, ...
y-first:      y0, x0, y1, x1, ...
outer-first:  x0, y0, x(n-1), y(n-1), ...
```

Move the order selector first. Then move the bit slider.

<style>
  .bdd-lab {
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

  .bdd-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    margin-bottom: 1rem;
  }

  .bdd-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .bdd-lab label span {
    color: #5d6872;
    font-size: 0.76rem;
    font-weight: 560;
  }

  .bdd-lab select,
  .bdd-lab input[type="range"] {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .bdd-lab select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    min-height: 2.35rem;
    padding: 0.35rem 0.5rem;
  }

  .bdd-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 0 0 1rem;
  }

  .bdd-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    min-width: 0;
    padding: 0.7rem 0.75rem;
  }

  .bdd-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 680;
    letter-spacing: 0;
    line-height: 1.2;
    margin-bottom: 0.2rem;
    text-transform: uppercase;
  }

  .bdd-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.9rem, 2.5vw, 1.12rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .bdd-lab__metric.good strong {
    color: #0f766e;
  }

  .bdd-lab__metric.warn strong {
    color: #b45309;
  }

  .bdd-lab__metric.bad strong {
    color: #be123c;
  }

  .bdd-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .bdd-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 640px) {
    .bdd-lab {
      padding: 0.75rem;
    }

    .bdd-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="bdd-order-lab" class="bdd-lab" data-bdd-order-lab>
  <div class="bdd-lab__controls">
    <label>
      Function
      <select data-param="fn" aria-label="Boolean function">
        <option value="eq" selected>bit-vector equality</option>
        <option value="pairOr">pairwise hit</option>
      </select>
      <span data-value="fn">bit-vector equality</span>
    </label>
    <label>
      Bit pairs
      <input type="range" min="2" max="10" step="1" value="6" data-param="bits" aria-label="Number of bit pairs">
      <span><output data-value="bits">6</output> pairs</span>
    </label>
    <label>
      Variable order
      <select data-param="order" aria-label="Variable order">
        <option value="paired" selected>paired x0,y0,x1,y1</option>
        <option value="grouped">grouped x... then y...</option>
        <option value="yfirst">paired y0,x0,y1,x1</option>
        <option value="shuffled">outer bits first</option>
      </select>
      <span data-value="order">paired x0,y0,x1,y1</span>
    </label>
  </div>
  <div class="bdd-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="760" aria-label="ROBDD variable-ordering lab showing width by level, order-tax curve, accepted assignments, and reduction ledger"></canvas>
  <p class="bdd-lab__note">
    Counts are reachable nonterminal ROBDD nodes from the final root. The builder also
    checks the exact number of satisfying assignments against a closed-form count.
  </p>
</div>

<script defer src="{{ '/assets/js/bdd-order-lab.js?v=20260617b' | relative_url }}"></script>

## What the Bad Order Is Remembering

With six bit-pairs, the lab's self-audit gives this contrast:

```text
equality, paired order:   18 reachable ROBDD nodes
equality, grouped order: 189 reachable ROBDD nodes
```

That is not because equality is hard. Equality is one of the cleanest possible
Boolean functions. The problem is that the grouped order asks the diagram to
read all `x` bits before it can compare them with the corresponding `y` bits.

After the first `k` `x` variables, the function still has to distinguish
roughly all `2^k` possible prefixes, because each one implies a different
constraint on the future `y` variables. The diagram is not storing the prefix
as a string, but the width behaves as though unresolved prefixes are a live
liability.

In the paired order, each local obligation can be discharged immediately:

```text
if x_i != y_i: reject
otherwise: keep going
```

The ROBDD stays narrow because the future does not depend on the exact value
of a pair once that pair has passed.

The "pairwise hit" function tells the same story with a different shape. The
paired order can update a one-bit state, "have we seen a hit yet?" The grouped
order must keep track of which `x` positions are available for a later `y`
hit. Same truth table, different memory.

## This Is Why Reordering Is a Discipline

The unhappy news is that the best order is not easy to find in general.
Bollig, Loebbing, and Wegener proved that improving the variable ordering of
OBDDs is NP-complete.[^bollig-wegener]

So production systems do not usually solve "find the best order" exactly. They
use structure, heuristics, and dynamic reordering. The CUDD manual, for
example, documents dynamic reordering methods for BDDs and ADDs; reordering
affects the shared unique table, so the whole manager's diagrams are reordered
together.[^cudd]

This matters historically because BDDs were one of the technologies that made
symbolic model checking practical. Burch, Clarke, McMillan, Dill, and Hwang
described BDDs as a candidate symbolic representation that can exploit
regularity in enormous state spaces, while also noting that BDDs do not
eliminate state explosion in every case.[^symbolic-model-checking]

That is the right level of romance. BDDs are not magic compression. They are
compression when the problem's conditional structure matches the chosen order.

## A Useful Mental Model

I like to think of an ROBDD as a deterministic interview.

It asks variables in a fixed sequence. After each answer, it must decide which
question to ask next using only the reduced state it has kept. If the interview
asks paired questions next to each other, the respondent can resolve local
facts and move on. If the interview asks all first halves before all second
halves, the respondent has to carry a larger working memory.

This is a recurring algorithmic lesson:

```text
representation = data + an order of access
```

The order is often where the algorithm is hiding.

Database join planners know this. Tensor compilers know this. Cache-friendly
programs know this. Even attention implementations know this when they choose
which blocks are materialized, streamed, or recomputed.

For ROBDDs, the lesson is unusually crisp because canonicity tempts you to
forget the choice that made it possible. Yes, the graph is canonical. Yes,
equivalence is easy once both functions live in the same manager. But the
manager's order is a bet about which distinctions should appear early and
which should be postponed.

The variable order is not metadata.

It is the algorithm's memory policy.

## Reproducibility Notes

The implementation is deliberately small enough to audit in one sitting:
[`assets/js/bdd-order-lab.js`]({{ '/assets/js/bdd-order-lab.js' | relative_url }}).

The core invariants are:

```text
mk(level, low, high) returns low if low == high
mk(level, low, high) interns every remaining triple
apply(op, a, b) recursively aligns on the earlier top variable
satCount(root) accounts for skipped variables exactly with BigInt
nodeCount counts reachable nonterminal nodes from the final root
```

The lab tests equality against the closed-form count `2^n`, and tests the
pairwise-hit function against the complement count `4^n - 3^n`: each pair has
four assignments, and exactly three assignments avoid `x_i = y_i = 1`.

[^bryant-1986]: Randal E. Bryant, ["Graph-Based Algorithms for Boolean Function Manipulation"](https://www.cs.cmu.edu/~bryant/pubdir/ieeetc86.pdf), *IEEE Transactions on Computers*, 1986.

[^bryant-1992]: Randal E. Bryant, ["Symbolic Boolean Manipulation with Ordered Binary-Decision Diagrams"](https://dl.acm.org/doi/10.1145/136035.136043), *ACM Computing Surveys*, 1992. A public PDF is also mirrored by [UBC](https://www.cs.ubc.ca/~ajh/courses/cpsc513/bryant-bdd-acmcs92.pdf).

[^bollig-wegener]: Beate Bollig, Martin Loebbing, and Ingo Wegener, ["Improving the Variable Ordering of OBDDs Is NP-Complete"](https://dl.acm.org/doi/10.1109/12.537122), *IEEE Transactions on Computers*, 1996.

[^cudd]: Fabio Somenzi, ["CUDD User's Manual: Variable Reordering for BDDs and ADDs"](https://www.cs.uleth.ca/~rice/cudd_docs/node3.html).

[^symbolic-model-checking]: J. R. Burch, E. M. Clarke, K. L. McMillan, D. L. Dill, and L. J. Hwang, ["Symbolic Model Checking: 10^20 States and Beyond"](https://mcmil.net/pubs/IC92.pdf), *Information and Computation*, 1992.
