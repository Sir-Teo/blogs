---
layout: post
title: "Type Checking, Seen as Abstract Execution"
description: "Static analysis works by running the program in a smaller universe: types, signs, intervals, shapes, effects, or any other abstraction that is cheap enough to compute and sound enough to trust."
date: 2026-06-13 22:40:00 -0400
categories: software-engineering
tags: [static-analysis, abstract-interpretation, type-systems, compilers, intervals, software-engineering]
excerpt: "A type checker is not an oracle bolted onto a compiler. It is one point in a larger design space: execute the program over approximate values, compute a fixed point, and report only what the abstraction can justify."
---

A type checker is an interpreter with bad eyesight.

That is a compliment.

The ordinary interpreter runs a program over concrete values:

```text
3
"hello"
{ x: 1 }
```

A type checker runs a related program over abstract values:

```text
number
string
object with field x
```

It does not know the exact integer. It knows enough to reject `"hello" / 2`.
It does not know the exact object. It knows enough to reject `point.z` when
there is no `z`. The program has been executed in a smaller semantic universe.

Abstract interpretation is the theory that takes this intuition seriously.
Instead of treating type checking, constant propagation, null analysis, interval
analysis, taint tracking, liveness, and effect systems as unrelated compiler
tricks, it asks a more general question:

```text
What property of all possible executions do we want,
and what abstract universe is precise enough to prove it?
```

The answer is never free. If the abstract universe is too small, the analyzer is
fast and vague. If it is too rich, it may be slow, memory-hungry, or unable to
converge. Static analysis is the art of choosing what to forget.

## The Lattice Habit

Kildall's 1973 paper on global program optimization already has the shape of
modern dataflow analysis: represent program flow as a graph, attach facts to
program points, and iterate until the facts stop changing.[^kildall] The facts
live in an ordered space. More precise facts sit below less precise facts. Merges
at control-flow joins use a least upper bound.

For a type checker, a tiny lattice might be:

```text
        unknown
       /   |   \
   number string object
       \   |   /
      impossible
```

For an interval analyzer:

```text
[0, 0] <= [0, 1] <= [0, 10] <= [-inf, inf]
```

The ordering means "is at least as precise as." The interval `[0, 1]` tells a
strictly sharper story than `[0, 10]`. The top interval `[-inf, inf]` says only
"it is a number." That is still information. It just may not be enough
information for the proof you wanted.

Cousot and Cousot's 1977 abstract-interpretation paper made this a unifying
semantic framework: compute properties by approximating program semantics and
their fixed points.[^cousot-1977] A later line of work made the type-system
connection explicit. Cousot's "Types as Abstract Interpretations" starts from a
lambda-calculus semantics with runtime errors and derives type systems as
abstract semantics approximating a collecting semantics.[^types-ai]

That phrase, "collecting semantics," is the key. Imagine collecting every
reachable runtime state at every program point. That would answer many questions
perfectly. It would also be infinite or undecidable for real languages. Abstract
interpretation replaces that huge set with a summary.

The summary must be conservative:

```text
every concrete behavior is represented
```

If the analyzer says "no division by zero," there must be no hidden execution
where the denominator becomes zero. If the analyzer is not sure, it must warn.
This is why a sound analyzer can be annoying. It is allowed to cry wolf; it is
not allowed to miss the wolf.

## The Fixed Point Is the Program

Loops are where the metaphor stops being cute and starts earning rent.

Consider:

```text
i = 0
while (i < 10) {
  i = i + 1
}
assert(i <= 10)
```

A concrete run visits `i = 0, 1, 2, ..., 10`. An interval analyzer can discover
the loop invariant:

```text
i in [0, 10]
```

but it does not get it in one step. It begins with `[0, 0]`, applies the loop
body, joins the new information with the old information, and repeats:

```text
[0, 0]
[0, 1]
[0, 2]
...
[0, 10]
```

At the fixed point, another pass through the loop does not change the abstract
state. The analysis is done.

Now change `10` to `1000000000`. The same iteration can take too long. For
infinite-height domains, it may never terminate. Abstract interpretation solves
this with **widening**:

```text
[0, 0], [0, 1], [0, 2], ...
```

is accelerated to:

```text
[0, inf]
```

The analyzer terminates, but it has forgotten the useful upper bound. Widening
is a controlled loss of memory. Threshold widening remembers selected constants
like `10`, `100`, or `1000`, so the jump can land on a meaningful invariant
instead of the sky.

This is not a toy issue. The Astree analyzer, built for proving absence of
runtime errors in safety-critical C, is based on abstract interpretation and
combines intervals with thresholds, loop unrolling, trace partitioning, and
domain-specific abstractions.[^astree-design] Its public project page describes
the same bargain: a sound analyzer must signal all possible errors, may report
false alarms, and gains practical precision by composing abstract domains and
widening/narrowing strategies.[^astree]

The beautiful engineering lesson is that precision is not one knob. It is a
portfolio.

## A Tiny Abstract Interpreter

The lab below runs four little programs without running them concretely. It
interprets them over one of three abstract universes:

- **type**, where every number is just `number`;
- **sign**, where numbers become negative, zero, positive, or mixtures;
- **interval**, where numbers become lower and upper bounds.

It also lets you choose a loop strategy. Plain widening terminates quickly but
may forget a bound. Threshold widening remembers selected constants from the
program. No widening is precise on small loops and useless on large ones unless
the iteration budget is big enough.

<style>
  .abstract-lab {
    background: #ffffff;
    border: 1px solid #d8e0e8;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .abstract-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
  }

  .abstract-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .abstract-lab__controls select {
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

  .abstract-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .abstract-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .abstract-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .abstract-lab__metric--warn {
    border-color: rgba(217, 119, 6, 0.42);
  }

  .abstract-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .abstract-lab__metric span,
  .abstract-lab__note,
  .abstract-lab__legend {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .abstract-lab__metric span {
    display: block;
  }

  .abstract-lab__metric strong {
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .abstract-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .abstract-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.65rem;
  }

  .abstract-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .abstract-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .abstract-lab__note {
    margin: 0.8rem 0 0;
  }
</style>

<div class="abstract-lab" id="abstract-lab" data-abstract-interpretation-lab>
  <div class="abstract-lab__controls">
    <label>
      Program
      <select data-param="program">
        <option value="division" selected>Guarded division</option>
        <option value="counter">Small counter loop</option>
        <option value="widening">Widening staircase</option>
        <option value="correlation">Lost correlation</option>
      </select>
    </label>
    <label>
      Abstract domain
      <select data-param="domain">
        <option value="type">type</option>
        <option value="sign">sign</option>
        <option value="interval" selected>interval</option>
      </select>
    </label>
    <label>
      Loop strategy
      <select data-param="widening">
        <option value="none">no widening</option>
        <option value="plain">plain widening</option>
        <option value="threshold" selected>threshold widening</option>
      </select>
    </label>
    <label>
      Iteration budget
      <select data-param="budget">
        <option value="8">8</option>
        <option value="16" selected>16</option>
        <option value="32">32</option>
        <option value="64">64</option>
      </select>
    </label>
  </div>
  <div class="abstract-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Abstract interpretation workbench showing program facts, loop fixed-point iteration, and static-analysis alarms"></canvas>
  <div class="abstract-lab__legend">
    <span><i style="background:#0f766e"></i> proved</span>
    <span><i style="background:#d97706"></i> possible alarm</span>
    <span><i style="background:#be123c"></i> real counterexample possible</span>
    <span><i style="background:#7c3aed"></i> current abstraction</span>
    <span><i style="background:#2563eb"></i> loop upper bound</span>
  </div>
  <p class="abstract-lab__note">
    The analyzer is sound for this toy language: if it proves an assertion, all
    concrete executions represented by the input intervals satisfy it. A warning
    means the abstraction cannot justify the claim; it may be a real bug or a
    false alarm caused by lost precision.
  </p>
</div>
<script defer src="{{ '/assets/js/abstract-interpretation-lab.js?v=20260613a' | relative_url }}"></script>

Use the default **Guarded division** program. With the interval domain, the
analyzer knows `x in [1, 12]`, so `10 / x` cannot divide by zero and `y <= 10`
is proved. Switch to **type**: everything numeric becomes `number`, zero comes
back into view, and the analyzer must warn. Switch to **sign**: division by
zero is gone, but the `y <= 10` bound is too fine for a sign domain.

Now select **Widening staircase**. With **no widening**, the upper bound climbs
one step per iteration and the analyzer fails to reach a fixed point within a
small budget. With **plain widening**, it reaches a fixed point quickly but
forgets the upper bound. With **threshold widening**, it remembers the loop
constant and proves the final assertion.

Finally try **Lost correlation**. The program copies `x` into `y` and asserts
`y - x == 0`. The interval analyzer knows:

```text
x in [0, 20]
y in [0, 20]
```

but it does not know they are the same value. It computes:

```text
y - x in [-20, 20]
```

and warns. A relational domain could prove it. This is the core experience of
static-analysis engineering: when the warning is spurious, do not merely silence
the warning. Ask what relation the abstraction forgot.

## The Next Question I Care About

Most teams experience static analysis as a list of warnings. That hides the
interesting object: a proof economy.

Every warning is a failed proof attempt. The right next question is not only
"is this warning true?" but:

```text
What fact would have made the proof go through,
and is that fact local, relational, temporal, probabilistic, or domain-specific?
```

For production code, this suggests a different interface. A static analyzer
should expose a precision ledger:

- which abstraction proved each claim;
- where widening lost a bound;
- where a merge lost a branch condition;
- where a non-relational domain lost equality or ordering;
- which user annotation or domain extension would remove the alarm;
- how much analysis cost that extra precision would add.

That would make static analysis feel less like scolding and more like debugging
the proof. It would also make type checking feel less separate from other
program analyses. A type checker is one useful abstraction. It is not the end of
the ladder.

The most valuable analyzers will not be the ones with the loudest warning list.
They will be the ones that can explain, with engineering honesty, exactly what
they forgot.

[^kildall]: Gary A. Kildall, "A Unified Approach to Global Program Optimization," *Proceedings of the 1st ACM Symposium on Principles of Programming Languages*, 1973. [ACM](https://dl.acm.org/doi/10.1145/512927.512945), [PDF copy](https://haoxintu.github.io/files/1-A%20Unified%20Approach%20to%20Global%20Program%20Optimization.pdf).

[^cousot-1977]: Patrick Cousot and Radhia Cousot, "Abstract Interpretation: A Unified Lattice Model for Static Analysis of Programs by Construction or Approximation of Fixpoints," *POPL*, 1977. [ACM](https://dl.acm.org/doi/10.1145/512950.512973), [PDF](https://www.di.ens.fr/~cousot/publications.www/CousotCousot-POPL-77-ACM-p238--252-1977.pdf).

[^types-ai]: Patrick Cousot, "Types as Abstract Interpretations," invited paper, *POPL*, 1997. [Author page](https://www.di.ens.fr/~cousot/COUSOTpapers/POPL97.shtml), [PDF](https://cs.nyu.edu/~pmc309/publications.www/Cousot-POPL97-p316-331-1997.pdf).

[^astree-design]: Bruno Blanchet, Patrick Cousot, Radhia Cousot, Jerome Feret, Laurent Mauborgne, Antoine Mine, David Monniaux, and Xavier Rival, "Design and Implementation of a Special-Purpose Static Program Analyzer for Safety-Critical Real-Time Embedded Software," 2002. [Project page](https://software.imdea.org/~mauborgn/publi/jones.html), [PDF](https://perso.lip6.fr/Antoine.Mine/publi/BlanchetCousotEtAl-LNCS-v2566-p85-108-2002.pdf).

[^astree]: The Astree Static Analyzer project page. [Objectives and theoretical background](https://www.astree.ens.fr/).
