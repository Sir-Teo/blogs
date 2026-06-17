---
layout: post
title: "The Conflict Writes a Clause"
description: "CDCL solvers do not just backtrack when a SAT branch fails. They turn the failure into a resolvent, jump past irrelevant decisions, and make the same mistake impossible to repeat."
date: 2026-06-17 05:16:00 -0400
categories: computer-science
series: solver-internals
tags: [sat-solvers, cdcl, first-uip, conflict-analysis, algorithms, boolean-satisfiability, proof-systems]
excerpt: "A SAT conflict is not a dead end. With reason clauses and first-UIP resolution, it becomes a small lemma that tells the solver exactly how far back to jump."
---

A backtracking SAT solver can spend years, in machine time, being politely
wrong.

It chooses a variable, propagates the consequences, chooses again, propagates
again, and eventually walks into a contradiction. The naive move is to undo the
last choice and try the other branch. That is honest, but forgetful. It treats
the contradiction as a local inconvenience rather than evidence.

Conflict-driven clause learning, or CDCL, changed the status of failure. A
conflict became a proof object in miniature: the solver records why each forced
assignment happened, resolves those reasons backward from the contradiction,
learns a new clause, and jumps to the earliest level where that clause can
immediately propagate.[^grasp][^handbook]

The useful sentence is:

```text
do not merely retreat from a bad branch; explain why the branch was bad
```

That explanation is just another clause. Once learned, it joins the formula and
prevents the solver from reconstructing the same doomed partial assignment.

## The Trail Is A Stack Of Reasons

The Davis-Putnam-Logemann-Loveland procedure gave the classic recursive shape:
simplify by unit propagation, split on a literal, and backtrack when a branch
cannot satisfy the formula.[^dpll] CDCL keeps that shape but annotates it.

Every assigned literal on the trail has one of two origins:

```text
decision:  the solver guessed it at a new level
implied:   a clause became unit and forced it
```

For an implied literal, the solver stores the clause that forced it. If

```text
(~a OR x)
```

forces `x` after `a` is true, that binary clause is the reason for `x`. In graph
language, the falsified literal `~a` points toward the forced literal `x`.

Keep doing this and the trail becomes more than a stack. It is an implication
graph whose edges are clauses. When a clause finally becomes false, the graph
contains the evidence needed to explain the falsehood.

The important part is not mystical. It is resolution:

```text
(A OR  p)    reason for p
(B OR ~p)    current conflict clause mentions ~p
-----------------------------------------------
(A OR B)     p has been explained away
```

The pivot variable disappears. The new clause is still a logical consequence of
the original formula. Repeat this on current-level implied literals and the
conflict clause becomes less like a symptom and more like a diagnosis.

## The First Gate Back To The Decision

A decision level can contain many implications. In the implication graph, every
path from the current decision to the final conflict must pass through certain
cut points called unique implication points, or UIPs. The first-UIP learning
scheme stops resolution at the first such gate when walking backward from the
conflict. Operationally, it is simple:

```text
start with the falsified conflict clause
while the clause contains more than one literal from the current decision level:
    choose the latest assigned current-level literal that has a reason
    resolve it with its reason clause
learn the remaining clause
```

When only one current-level literal remains, the clause is assertive. That means
after the solver backjumps to the second-highest decision level appearing in the
learned clause, all other literals in the learned clause are already false, and
the remaining literal becomes unit.

The solver does not just go back. It lands somewhere where the new clause has a
job to do.

This is why first-UIP clauses are so convenient in practice. They are local
enough to derive cheaply, but sharp enough to force a different continuation.
The SAT Handbook's CDCL chapter describes first-UIP as the dominant conflict
analysis scheme in modern CDCL solvers; MiniSat's system descriptions then show
how much subsequent engineering went into making those learned clauses smaller
and cheaper to keep.[^handbook][^minisat]

## Lab: Make The Failure Explain Itself

The lab below builds a small formula with a deliberate conflict. The formula has
two real support decisions, then a configurable number of irrelevant detour
decision levels, then one final bad decision.

The final conflict depends on `x`, `y`, and `c`, but not on the detours:

```text
a -> x
b -> y
c -> z
c -> w
x and z -> p1
y and p1 -> p2
...
last p and w -> conflict
```

The simulator runs actual unit propagation over the generated clauses. Then it
performs first-UIP-style resolution over the recorded reason clauses. In the
default case it learns:

```text
(~x OR ~y OR ~c)
```

Since `x` and `y` were caused by earlier decisions, this clause tells the solver
to jump back before the detours and force `~c`. The detour decisions were real
levels on the trail. The learned clause simply proves they were irrelevant to
this failure.

<style>
  .cdcl-lab {
    --cdcl-text: #0f172a;
    --cdcl-muted: #64748b;
    --cdcl-border: #dbe3ea;
    --cdcl-bg: #f8fafc;
    --cdcl-good: #0f766e;
    --cdcl-warn: #b45309;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    border: 1px solid var(--cdcl-border);
    border-radius: 8px;
    color: var(--cdcl-text);
    margin: 1.5rem 0;
    padding: 1rem;
  }

  .cdcl-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .cdcl-lab label {
    color: #334155;
    display: grid;
    font-size: 0.82rem;
    font-weight: 750;
    gap: 0.35rem;
    min-width: 0;
  }

  .cdcl-lab output {
    color: var(--cdcl-text);
    display: block;
    font-size: 0.95rem;
    font-weight: 850;
    min-height: 1.2em;
  }

  .cdcl-lab input {
    accent-color: #be123c;
    min-width: 0;
    width: 100%;
  }

  .cdcl-lab input[type="range"] {
    appearance: none;
    background: transparent;
    display: block;
    height: 1.35rem;
    margin-top: 0.25rem;
  }

  .cdcl-lab input[type="range"]::-webkit-slider-runnable-track {
    background: #cbd5e1;
    border-radius: 999px;
    height: 0.36rem;
  }

  .cdcl-lab input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    background: #0f766e;
    border: 0;
    border-radius: 999px;
    height: 0.95rem;
    margin-top: -0.3rem;
    width: 0.95rem;
  }

  .cdcl-lab input[type="range"]::-moz-range-track {
    background: #cbd5e1;
    border-radius: 999px;
    height: 0.36rem;
  }

  .cdcl-lab input[type="range"]::-moz-range-thumb {
    background: #0f766e;
    border: 0;
    border-radius: 999px;
    height: 0.95rem;
    width: 0.95rem;
  }

  .cdcl-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    margin: 1rem 0;
  }

  .cdcl-lab__metric {
    background: rgba(248, 250, 252, 0.88);
    border: 1px solid var(--cdcl-border);
    border-radius: 7px;
    min-height: 4rem;
    padding: 0.65rem 0.7rem;
  }

  .cdcl-lab__metric--good {
    box-shadow: inset 3px 0 0 var(--cdcl-good);
  }

  .cdcl-lab__metric--warn {
    box-shadow: inset 3px 0 0 var(--cdcl-warn);
  }

  .cdcl-lab__metric span {
    color: var(--cdcl-muted);
    display: block;
    font-size: 0.64rem;
    font-weight: 750;
    letter-spacing: 0.03em;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .cdcl-lab__metric strong {
    display: block;
    font-size: clamp(0.92rem, 1.8vw, 1.25rem);
    line-height: 1.15;
    margin-top: 0.35rem;
    overflow-wrap: anywhere;
  }

  .cdcl-lab canvas {
    display: block;
    height: 1020px;
    max-width: 100%;
    width: 100%;
  }

  .cdcl-lab__legend {
    color: var(--cdcl-muted);
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    margin-top: 0.8rem;
  }

  .cdcl-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .cdcl-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .cdcl-lab__note {
    color: var(--cdcl-muted);
    font-size: 0.86rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 800px) {
    .cdcl-lab {
      padding: 0.85rem;
    }

    .cdcl-lab__controls,
    .cdcl-lab__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .cdcl-lab canvas {
      height: 1080px;
    }
  }

  @media (max-width: 520px) {
    .cdcl-lab__controls,
    .cdcl-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="cdcl-lab" data-cdcl-conflict-lab>
  <div class="cdcl-lab__controls">
    <label>
      Implication chain <output data-value="chain">4</output>
      <input type="range" min="2" max="7" step="1" value="4" data-param="chain">
    </label>
    <label>
      Detour levels <output data-value="detours">2</output>
      <input type="range" min="0" max="4" step="1" value="2" data-param="detours">
    </label>
    <label>
      Resolution step <output data-value="step">99</output>
      <input type="range" min="0" max="14" step="1" value="99" data-param="step">
    </label>
  </div>

  <div class="cdcl-lab__metrics" data-role="metrics"></div>

  <canvas data-role="canvas" aria-label="CDCL conflict analysis lab showing trail levels, implication graph, first-UIP resolution, and nonchronological backjump"></canvas>

  <div class="cdcl-lab__legend">
    <span><i style="background:#7c3aed"></i>decision</span>
    <span><i style="background:#0f766e"></i>implied support</span>
    <span><i style="background:#d97706"></i>detour</span>
    <span><i style="background:#be123c"></i>asserting literal</span>
  </div>
  <p class="cdcl-lab__note" data-role="note"></p>
</div>

<script defer src="{{ '/assets/js/cdcl-conflict-lab.js?v=20260617a' | relative_url }}"></script>

The **Resolution step** slider is intentionally a little strange: it lets you
pause the proof, not the search. Step `0` is the raw conflict clause. Each later
row resolves one recently implied current-level variable with the clause that
forced it. When the ledger says `1 current`, the learned clause has become
assertive.

Push **Detour levels** upward. The trail grows, but the learned clause does not.
The backjump skips exactly those irrelevant levels because the final clause has
no literal from them. Push **Implication chain** upward and the proof gets
longer; more current-level implications must be explained away before the same
small learned clause appears.

This is not a benchmark. It is a glass-box instance whose point is auditability.
The JavaScript lab exports a small verifier that checks three invariants across
several generated formulas:

```text
1. propagation reaches a real conflicting clause
2. resolution ends with exactly one current-level literal
3. after the computed backjump, the learned clause is unit and asserts ~c
```

That is the contract conflict analysis must satisfy. Without it, a learned
clause is just a story.

## Why The Learned Clause Is Allowed

The learned clause is not a heuristic memo. It is an implicate of the original
formula.

Every resolution step combines clauses that are already known consequences:
original reason clauses plus the current conflict clause or its resolvents.
Resolution preserves entailment. So adding the final clause cannot remove a
valid satisfying assignment. It only removes assignments that were impossible
anyway.

That distinction matters because CDCL solvers learn enormous numbers of
clauses. If learning were merely a cache of observed bad branches, correctness
would be fragile. Instead, the learned database is a growing proof trace. Modern
SAT solving is search mixed with proof construction.

The backjump level follows from the same clause. Suppose the learned clause is

```text
(~x OR ~y OR ~c)
```

and the current trail has `x` true at level 1, `y` true at level 2, and `c` true
at level 5. Backjump to level 2. Then `~x` and `~y` are false, while `c` is
unassigned. The clause becomes unit and forces `~c`. Levels 3 and 4 were not
chronologically undone because they were the last choices. They were undone
because the proof no longer mentions them.

This is nonchronological backtracking in one line:

```text
return to the highest remaining reason, not to yesterday's decision
```

## The Machinery Around The Idea

The tiny algorithm above is not a modern solver by itself.

Chaff's leap was not only learning. It paired clause learning with extremely
efficient Boolean constraint propagation, two watched literals, and low-overhead
branching machinery.[^chaff] MiniSat later became a reference implementation
because it made a compact CDCL architecture easy to study and modify, including
learned-clause minimization.[^minisat]

Production solvers also need restarts, variable activity scores, phase saving,
clause deletion, preprocessing, inprocessing, proof logging, and careful memory
layout. Those systems-level choices decide whether the beautiful little clause
above arrives fast enough to matter.

But the heart is still visible in the lab:

```text
propagation creates reasons
reasons create a conflict graph
resolution creates a learned clause
the learned clause chooses the backjump
the backjump makes the clause assert
```

SAT is NP-complete, so no clever clause makes the worst case disappear. The
surprise is that many industrial instances are full of repeated structure. CDCL
survives by turning local mistakes into reusable lemmas. A branch fails once,
then the formula remembers.

## A Solver Is A Debugger For Its Own Search

The most useful mental model for CDCL is not "try things faster." It is
"debug the search as it runs."

The trail is the stack trace. Reason clauses are stack frames. The conflict is
the thrown exception. First-UIP analysis walks backward until it finds the
smallest current-level explanation that can force a different future.

That is a strong software-engineering idea hiding inside a theorem-proving
algorithm:

```text
when a system fails, keep the weakest explanation that prevents repetition
```

Too weak, and the solver revisits the same contradiction through another door.
Too strong, and the learned clause is bloated, expensive to propagate, and
likely to be deleted. The first-UIP clause is a practical compromise: local,
assertive, and usually small enough to be useful.

Failure is only waste if the solver leaves without a note.

CDCL writes the note as a clause.

[^dpll]: Martin Davis, George Logemann, and Donald Loveland, ["A Machine Program for Theorem-Proving"](https://cacm.acm.org/research/a-machine-program-for-theorem-proving/), *Communications of the ACM*, 1962.

[^grasp]: Joao P. Marques-Silva and Karem A. Sakallah, ["GRASP: A Search Algorithm for Propositional Satisfiability"](https://eprints.soton.ac.uk/262032/1/jpms-tcomp99.pdf), *IEEE Transactions on Computers*, 1999.

[^chaff]: Matthew W. Moskewicz, Conor F. Madigan, Ying Zhao, Lintao Zhang, and Sharad Malik, ["Chaff: Engineering an Efficient SAT Solver"](https://www.princeton.edu/~chaff/publication/DAC2001v56.pdf), DAC 2001.

[^handbook]: Joao Marques-Silva, Ines Lynce, and Sharad Malik, ["Conflict-Driven Clause Learning SAT Solvers"](https://www.cs.princeton.edu/~zkincaid/courses/fall18/readings/SATHandbook-CDCL.pdf), in *Handbook of Satisfiability*, 2009.

[^minisat]: Niklas Een and Niklas Sorensson, ["MiniSat v1.13 - A SAT Solver with Conflict-Clause Minimization"](https://minisat.se/downloads/MiniSat_v1.13_short.pdf), SAT Competition 2005 system description.
