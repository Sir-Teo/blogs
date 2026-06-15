---
layout: post
title: "Let the Clause Sleep"
description: "Modern SAT solvers are fast partly because most clauses stay dormant. Two watched literals turn unit propagation into a lazy alarm system for memory traffic."
date: 2026-06-14 08:03:00 -0400
categories: computer-science
tags: [sat-solvers, dpll, cdcl, watched-literals, algorithms, boolean-satisfiability]
excerpt: "A SAT solver does not need to inspect every clause after every assignment. If each clause watches two literals, it wakes only when one of its alarms is falsified."
---

Most clauses in a SAT solver deserve to be ignored most of the time.

That is not a philosophical statement. It is an implementation opportunity.

A clause like

```text
(a OR ~b OR c OR d OR ~e OR f)
```

does not need attention when its first literal becomes false, then its second,
then its third. It only becomes operationally interesting when the assignment
has nearly killed it:

```text
all literals false except one -> force the remaining literal
all literals false            -> conflict
```

Modern SAT solvers spend a large fraction of their time doing Boolean constraint
propagation: repeatedly finding clauses that have become unit, assigning the
forced literal, and stopping when a conflict appears or no more implications can
be found. The Chaff paper put the engineering point bluntly: BCP dominates SAT
runtime on many instances, so the propagation engine is the heart of the
solver.[^chaff]

The trick is to let clauses sleep until there is real news.

## Before Learning, There Is Propagation

The Davis-Putnam-Logemann-Loveland procedure gave the classic backtracking
shape for propositional satisfiability: simplify by unit clauses and pure
literals, split on a variable, and recurse.[^dpll] In modern SAT-solver
language, we usually describe the loop as:

```text
decide a variable
propagate forced consequences
if conflict, analyze and backtrack
repeat
```

Conflict-driven clause learning, developed through systems such as GRASP and
Chaff, made conflicts useful rather than merely terminal. A conflict can explain
which earlier decisions caused trouble, produce a learned clause, and backjump
past irrelevant decisions.[^grasp] MiniSat later became famous partly because it
showed how small and extensible a Chaff-style solver could be while still
containing the essential machinery.[^minisat]

But before conflict analysis can do anything, the solver must discover
implications. That means it must notice clauses that have become unit.

The naive thought is:

```text
when literal L becomes false,
visit every clause containing L
inspect the clause
if it is unit, enqueue the remaining literal
if it is false, report conflict
```

This is already better than scanning the whole formula. It uses occurrence
lists. But it still wakes many clauses that cannot possibly be unit yet.

If a six-literal clause has four live literals left, it is not unit. The solver
does not need to know exactly which four. It only needs a certificate that at
least two are still not false.

That certificate is two watched literals.

## Clause Sets Two Alarms

For every clause, pick two literals to watch. Maintain this invariant:

```text
if the clause might become unit, one of the watched literals will reveal it
```

Operationally, when a watched literal becomes false, the solver visits that
clause and tries to move the watch to another literal that is not false. If it
can move the watch, the clause goes back to sleep. It still has at least two
non-false literals, so it cannot be unit.

If it cannot move the watch, the other watched literal determines the clause's
state:

```text
other watch true       -> clause is already satisfied
other watch unassigned -> clause is unit; assign the other watch
other watch false      -> conflict
```

The solver does not maintain an exact count of false literals in every clause.
It maintains a cheap alarm system.

This is why watched literals are so effective. A clause with ten literals can
ignore the first several falsifications if they are not watched. If a watched
literal is falsified, the clause often pays a short scan to find a replacement
and then goes back to sleep.

The second half of the trick is backtracking. Chaff emphasized that watched
literals do not need to be repaired when variables are unassigned.[^chaff] A
watch that was valid before backtracking remains safe after backtracking because
unassigning variables can only make literals less false. That turns undoing a
decision level into stack popping, not clause surgery.

## Two Engines, Same Trail

The lab below generates a planted CNF formula: random clauses plus a chain of
binary implications. It runs two propagation engines on the same decisions:

1. an occurrence-list engine that visits every clause containing the newly
   falsified literal,
2. a two-watched-literal engine that visits only clauses currently watching that
   falsified literal.

Both engines implement the same unit-propagation semantics. The lab checks that
they agree: if propagation finishes, the final assignments match; if propagation
conflicts, both engines detect a conflict.

<style>
  .watch-lab {
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

  .watch-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .watch-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .watch-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .watch-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .watch-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .watch-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .watch-lab__metric span,
  .watch-lab__legend,
  .watch-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .watch-lab__metric span {
    display: block;
  }

  .watch-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .watch-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 560px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .watch-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .watch-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .watch-lab__swatch {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .watch-lab__swatch--occurrence {
    background: #b45309;
  }

  .watch-lab__swatch--watched {
    background: #2563eb;
  }

  .watch-lab__swatch--imply {
    background: #0f766e;
  }

  .watch-lab__swatch--conflict {
    background: #be123c;
  }

  .watch-lab__note {
    margin-top: 0.55rem;
  }

  @media (max-width: 720px) {
    .watch-lab {
      padding: 0.8rem;
    }

    .watch-lab__controls {
      grid-template-columns: minmax(0, 1fr);
    }

    .watch-lab__metrics {
      grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    }

    .watch-lab canvas {
      height: 780px;
    }
  }
</style>

<div class="watch-lab" data-watched-literals-lab>
  <div class="watch-lab__controls">
    <label>
      Variables <output data-value="variables">72</output>
      <input data-param="variables" type="range" min="18" max="140" step="2" value="72">
    </label>
    <label>
      Random clauses <output data-value="clauses">520</output>
      <input data-param="clauses" type="range" min="80" max="1400" step="20" value="520">
    </label>
    <label>
      Clause width <output data-value="width">6</output>
      <input data-param="width" type="range" min="3" max="10" step="1" value="6">
    </label>
    <label>
      Decisions <output data-value="decisions">28</output>
      <input data-param="decisions" type="range" min="4" max="120" step="1" value="28">
    </label>
    <label>
      Implication chain <output data-value="chain">22</output>
      <input data-param="chain" type="range" min="0" max="120" step="1" value="22">
    </label>
    <label>
      Wrong decisions <output data-value="mistakes">0%</output>
      <input data-param="mistakes" type="range" min="0" max="30" step="1" value="0">
    </label>
    <label>
      Seed <output data-value="seed">31</output>
      <input data-param="seed" type="range" min="1" max="999" step="1" value="31">
    </label>
  </div>
  <div class="watch-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Watched-literal SAT propagation lab"></canvas>
  <div class="watch-lab__legend">
    <span><i class="watch-lab__swatch watch-lab__swatch--occurrence"></i> occurrence-list visits</span>
    <span><i class="watch-lab__swatch watch-lab__swatch--watched"></i> watched-literal visits</span>
    <span><i class="watch-lab__swatch watch-lab__swatch--imply"></i> satisfied / implication</span>
    <span><i class="watch-lab__swatch watch-lab__swatch--conflict"></i> conflict</span>
  </div>
  <p class="watch-lab__note">
    The occurrence-list engine is not a straw man: it only visits clauses that
    contain the literal just falsified. The watched-literal engine asks a
    narrower question: was that falsified literal one of the clause's two alarms?
  </p>
</div>

<script defer src="{{ '/assets/js/watched-literals-lab.js?v=20260614a' | relative_url }}"></script>

## What the Bars Count

The lab is not solving SAT end-to-end. There is no VSIDS heap, learned-clause
database, restart policy, or first-UIP conflict analysis. It isolates the
propagation kernel.

That isolation is deliberate. In a CDCL solver, the famous trick is conflict
learning: turn a contradiction into a clause that prevents repeating the same
mistake. But conflict learning only pays off if the engine can cheaply run the
boring loop:

```text
take one newly assigned literal
find consequences
enqueue consequences
repeat
```

The occurrence-list engine and the watched engine produce the same logical
consequences. Their cost differs because they ask different memory questions.

The occurrence-list engine asks:

```text
which clauses contain this falsified literal?
```

The watched engine asks:

```text
which clauses are currently watching this falsified literal?
```

The second set is much smaller when long clauses have already moved their
watches away from dying literals. In the default lab setting, the watched engine
visits less than half as many clauses and reads about a third as many literals.
Move the clause width up and the effect often gets larger. Add wrong decisions
and the run may stop at a conflict; the engines still agree that propagation has
failed, though their partial trails can differ because the conflict was found
before a unique fixed point was reached.

That last caveat is important. Watched literals are not a theorem that every
micro-count is lower on every input. They are an engineering data structure that
usually removes irrelevant memory traffic from the solver's hottest loop.

## Backtracking Makes the Trick Better

The watch invariant is asymmetric in time.

When assigning variables, a watched literal can become false, so the clause may
need repair. When backtracking, variables become unassigned. A false literal can
become unknown, but an unknown literal cannot make a previously safe clause
more dangerous.

So there is no work to do.

That is the small gift. The solver can pop assignments off the trail without
walking through all affected clauses and repairing their counters. The watched
positions may be arbitrary, but they remain sound. They are not a summary of the
current clause state. They are a lazily maintained alarm.

This is why the data structure feels almost too simple after you see it. A
clause does not need to know exactly how close it is to failure. It only needs
two witnesses that it is not there yet.

## Around the Alarm System

Watched literals are one piece of a larger design.

GRASP helped establish conflict analysis, nonchronological backtracking, and
conflict-induced clauses as core SAT ideas.[^grasp] Chaff combined fast BCP,
VSIDS-style branching, and engineering attention to memory behavior.[^chaff]
MiniSat compressed the design into a solver that became a reference point for
researchers and implementers.[^minisat]

The through-line is not that SAT became easy. SAT remains NP-complete. The
through-line is that solver performance came from a stack of concrete
representational decisions:

- store implications on a trail;
- explain implications by clauses;
- learn clauses from conflicts;
- rank variables by recent conflict activity;
- keep clauses dormant until they can matter.

The last item is the watched-literal trick. It does not reduce the search space
by itself. It makes each node of the search tree cheaper to process.

That distinction is easy to miss. A heuristic changes where the solver walks. A
watch list changes how much it pays for each step.

## Weak Witnesses Are a Design Pattern

The broader software lesson is useful outside Boolean formulas:

```text
do not eagerly maintain the exact statistic if a cheap witness is enough
```

A clause could maintain a counter of false literals. That counter would be more
informative than two watches. It would also be updated constantly. Watched
literals keep a weaker invariant that is exactly strong enough for the next
operational decision.

You see the same pattern in good systems code:

- dirty bits instead of eagerly recomputed state;
- indexes that wake only on relevant keys;
- incremental compilers that invalidate dependency edges, not whole programs;
- caches that keep enough metadata to avoid scanning cold entries;
- streaming sketches that preserve the query contract, not the raw data.

The art is choosing the witness. Too weak, and the system wakes up too late.
Too strong, and the witness becomes the workload.

Two watched literals hit a beautiful point: they are weak enough to be cheap,
strong enough to preserve unit propagation, and stable under backtracking.

That is why this tiny data structure belongs in the same conversation as
conflict learning. Clause learning tells the solver what not to forget. Watched
literals tell the solver what it can safely ignore.

[^dpll]: Martin Davis, George Logemann, and Donald Loveland, ["A Machine Program for Theorem-Proving"](https://archive.org/download/machineprogramfo00davi/machineprogramfo00davi.pdf), New York University Institute of Mathematical Sciences report, 1961; later published in *Communications of the ACM*, 1962.

[^grasp]: Joao P. Marques-Silva and Karem A. Sakallah, ["GRASP: A Search Algorithm for Propositional Satisfiability"](https://eprints.soton.ac.uk/262032/1/jpms-tcomp99.pdf), *IEEE Transactions on Computers*, 1999.

[^chaff]: Matthew W. Moskewicz, Conor F. Madigan, Ying Zhao, Lintao Zhang, and Sharad Malik, ["Chaff: Engineering an Efficient SAT Solver"](https://www.princeton.edu/~chaff/publication/DAC2001v56.pdf), DAC 2001.

[^minisat]: Niklas Een and Niklas Sorensson, ["An Extensible SAT-solver"](https://research.chalmers.se/en/publication/74325), SAT 2003.
