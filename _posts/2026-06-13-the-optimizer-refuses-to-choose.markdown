---
layout: post
title: "Equality Saturation Refuses to Pick a Winner"
description: "Equality saturation turns compiler optimization from a brittle sequence of rewrites into a search over equivalent programs."
date: 2026-06-13 22:16:00 -0400
categories: computer-science
tags: [e-graphs, equality-saturation, compilers, term-rewriting, program-optimization, programming-languages]
excerpt: "A greedy rewrite pass has to commit. An equality-saturation optimizer keeps the old program, the new program, and the alternatives they unlock, then extracts the cheapest expression at the end."
---

The easiest compiler bug to understand is a wrong rewrite.

The more interesting compiler bug is a right rewrite at the wrong time.

Suppose the optimizer sees:

```text
(a * 2) / 2
```

Strength reduction says:

```text
a * 2  ->  a << 1
```

That is locally attractive. Shifts are cheap. So a destructive optimizer can
turn the program into:

```text
(a << 1) / 2
```

But another path was waiting:

```text
(a * 2) / 2
-> a * (2 / 2)
-> a * 1
-> a
```

Both first steps were valid. One made the expression cheaper immediately. The
other preserved the shape needed for cancellation.

This is the phase-ordering problem in miniature. Optimizations are individually
reasonable, but the sequence matters. Once a compiler destructively rewrites a
program, it may erase the syntactic opportunity that a later optimization
needed.

Equality saturation attacks the problem by refusing to choose too early.

## Rewrites Are Equations With a Cursor

Term rewriting is an old and powerful idea: find a subterm matching the left
side of a rule, replace it with the right side, repeat.[^dershowitz] In a
compiler, the rules are often familiar algebra or machine facts:

```text
x * 1       -> x
x + 0       -> x
(x * y) / z -> x * (y / z)
x * 2       -> x << 1
```

The arrow is operational. It says where the optimizer moves next.

That operational arrow is useful because it makes progress concrete. But it is
also a commitment. If there are several possible rewrites, the optimizer must
pick one. If the rewrite system is not confluent, different choices can land in
different normal forms. If some rewrites temporarily increase cost, a local
profitability check can reject the only path to a better final expression.

Traditional compilers manage this with pass ordering, fixed points, peephole
passes, canonical forms, and a great deal of engineering taste. That work is
real. It is also fragile. A new optimization can help one benchmark and block
another optimization somewhere else.

Equality saturation changes the arrow back into an equality.

Instead of replacing:

```text
old -> new
```

it records:

```text
old == new
```

The old expression remains available. The new expression becomes available. The
next rewrite can match either one.

Only at the end does an extraction procedure choose the cheapest expression
according to a cost model.

## The Data Structure Under the Trick

The production version of this idea uses e-graphs.

An e-graph stores equivalence classes of expressions. If `a` is equivalent to
`b`, then `f(a)` must be equivalent to `f(b)`. That closure property is called
congruence. Nelson and Oppen's congruence-closure work is one of the classic
roots of the data structure lineage.[^nelson]

Willsey, Nandi, Wang, Flatt, Tatlock, and Panchekha describe an e-graph as a
compact representation of a congruence relation over many expressions.[^egg]
The compactness matters because the explicit set of equivalent programs can
grow explosively. E-graphs share substructure and merge equivalence classes
rather than storing every expression as a separate tree.

Equality saturation uses that representation like this:

1. Insert the original program.
2. Repeatedly apply rewrite rules, adding equivalent expressions to the
   e-graph.
3. Stop when saturated, timed out, or budgeted out.
4. Extract the lowest-cost represented program.

Tate, Stepp, Tatlock, and Lerner's equality-saturation paper framed this as a
new optimizer architecture: analyses add equality information to a shared
intermediate representation, and a later heuristic picks the final program.[^tate]
The key shift is not a clever peephole rule. It is the separation of two jobs
that destructive rewriting entangles:

```text
discover equivalences
choose a representative
```

That separation is why equality saturation feels so different from ordinary
rewrite passes. It turns optimization into search without constant regret.

## A Tiny Saturation Lab

The lab below is deliberately small.

It is not a production e-graph. It explicitly enumerates a bounded set of
expressions so the idea is visible in the browser. A real system like `egg`
uses e-classes, e-nodes, union-find, hashconsing, rebuilding, and e-class
analyses to do this compactly and efficiently.[^egg]

Still, the tiny version is enough to see the phase-ordering problem.

The **Phase-ordering trap** scenario starts from:

```text
(a * 2) / 2
```

The greedy optimizer applies only rewrites that immediately reduce the local
cost. It takes the strength-reduction rule and stops at:

```text
(a << 1) / 2
```

The saturation search keeps that expression, but it also keeps the original
shape. That lets it find:

```text
(a * 2) / 2
-> a * (2 / 2)
-> a * 1
-> a
```

<style>
  .eqsat-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .eqsat-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .eqsat-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .eqsat-lab__controls select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
    width: 100%;
  }

  .eqsat-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .eqsat-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.35rem;
    padding: 0.62rem 0.7rem;
  }

  .eqsat-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.35);
  }

  .eqsat-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .eqsat-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.35);
  }

  .eqsat-lab__metric span,
  .eqsat-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .eqsat-lab__metric span {
    display: block;
  }

  .eqsat-lab__metric strong {
    display: block;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .eqsat-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .eqsat-lab__note {
    margin: 0.85rem 0 0;
  }
</style>

<div class="eqsat-lab" data-eqsat-lab>
  <div class="eqsat-lab__controls">
    <label>
      Scenario
      <select data-param="scenario">
        <option value="phase" selected>Phase-ordering trap</option>
        <option value="factor">Common-factor cleanup</option>
      </select>
    </label>
    <label>
      Saturation rounds
      <select data-param="rounds">
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5" selected>5</option>
        <option value="6">6</option>
      </select>
    </label>
    <label>
      Expression size limit
      <select data-param="maxSize">
        <option value="9">9 nodes</option>
        <option value="11">11 nodes</option>
        <option value="13" selected>13 nodes</option>
        <option value="15">15 nodes</option>
      </select>
    </label>
  </div>
  <div class="eqsat-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="650" aria-label="Equality saturation lab showing a rewrite frontier, a greedy path, and the best extracted path"></canvas>
  <p class="eqsat-lab__note" data-note>
    A bounded equality-saturation explorer. The production version stores this
    space compactly as an e-graph.
  </p>
</div>
<script defer src="{{ '/assets/js/equality-saturation-lab.js?v=20260613a' | relative_url }}"></script>

Start with **Phase-ordering trap**.

The `greedy result` is not wrong. It applied a valid rule. It even lowered the
cost immediately. The problem is that local improvement was not the same thing
as global extraction.

Now switch to **Common-factor cleanup**.

The greedy optimizer and saturation search both find:

```text
x * 2 + x * 3
-> x * (2 + 3)
-> x * 5
```

This is important. Equality saturation is not a claim that greedy rewriting is
always bad. Greedy rewriting is often excellent. The claim is narrower: when
rewrite order matters, committing early is a source of missed opportunities.

## What Gets Hard

The lab cheats in three ways.

First, it stores expressions explicitly. An e-graph stores equivalence classes
and shared e-nodes. This is why it can represent many expressions without
materializing every tree.

Second, it has a tiny rewrite set. Real optimizers may have hundreds of rules,
some purely syntactic and some conditional on analysis facts. The `egg` paper's
e-class analysis mechanism is important because many optimizations need facts
like constant values, free variables, shapes, units, or numerical intervals, not
just tree patterns.[^egg]

Third, it uses a toy cost model. Production extraction is where engineering
judgment re-enters. The cheapest expression depends on the target: latency,
instruction selection, vectorization, numerical accuracy, code size, hardware
ports, allocation, readability, or some Pareto frontier among them.

Equality saturation does not remove cost modeling.

It gives the cost model more choices.

## Why This Feels Like Search

There are two ways to view a rewrite rule:

```text
as a command:  replace this with that
as a theorem:  this equals that
```

The command view is fast and decisive. It is also path-dependent.

The theorem view is slower and more memory-hungry. But it lets independent
facts compose. A strength-reduction rule, a division reassociation rule, a
constant folder, and an identity rule can all add their little pieces of truth
without having to know which pass should run first.

That is the taste of equality saturation. It is a compiler architecture that
tries to make local facts commute.

The slogan I find useful is:

```text
Do not ask a rewrite to be profitable.
Ask it to be true.
```

Profitability belongs at extraction time.

## The Broader Pattern

This idea shows up wherever we are tempted to optimize by taking irreversible
local steps.

In numerical programming, equivalent real expressions can have very different
floating-point error. Herbie-style tools use rewrite search to find more
accurate forms, and later work has connected that ecosystem to e-graph
infrastructure.[^herbie]

In deep-learning compilers, graph optimizers face algebraic identities, layout
choices, fusion choices, and hardware cost models. In CAD and hardware
synthesis, the same high-level object may have many equivalent constructions.
The common shape is:

```text
many equivalent representations
expensive local commitments
domain-specific cost function
```

An e-graph is a way to hold the ambiguity long enough to make a better choice.

That is why the tiny `(a * 2) / 2` example is not trivial. It is the smallest
version of a serious design principle:

```text
separate discovery from choice
```

Destructive optimization mixes them together.

Equality saturation pulls them apart.

---

## Sources

[^dershowitz]: Nachum Dershowitz and Jean-Pierre Jouannaud, "Rewrite Systems," in *Handbook of Theoretical Computer Science, Volume B*, 1990. A freely available draft is hosted by Tel Aviv University: [Rewrite Systems](https://www.cs.tau.ac.il/~nachum/papers/survey-draft.pdf).

[^nelson]: Greg Nelson and Derek C. Oppen, ["Fast Decision Procedures Based on Congruence Closure"](https://www.sigmod.org/publications/dblp/db/journals/jacm/NelsonO80.html), *Journal of the ACM*, 1980.

[^tate]: Ross Tate, Michael Stepp, Zachary Tatlock, and Sorin Lerner, ["Equality Saturation: A New Approach to Optimization"](https://www.cs.cornell.edu/~lerner/papers/lmcs11-eqsat.pdf), *Logical Methods in Computer Science*, 2011; earlier version POPL 2009.

[^egg]: Max Willsey, Chandrakana Nandi, Yisu Remy Wang, Oliver Flatt, Zachary Tatlock, and Pavel Panchekha, ["egg: Fast and Extensible Equality Saturation"](https://arxiv.org/pdf/2004.03082), POPL 2021.

[^herbie]: Pavel Panchekha, Alex Sanchez-Stern, James R. Wilcox, and Zachary Tatlock, ["Automatically Improving Accuracy for Floating Point Expressions"](https://jamesrwilcox.com/herbie.pdf), PLDI 2015. For a practical bridge between Herbie and equality infrastructure, see Flatt and Zhang, ["egglog In Practice: Automatically Improving Floating-point Error"](https://effect.systems/doc/egraphs-2023-egglog/paper.pdf).
