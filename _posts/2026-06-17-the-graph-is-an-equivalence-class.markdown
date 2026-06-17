---
layout: post
title: "The Graph Is an Equivalence Class"
description: "Observational causal discovery usually cannot identify one directed graph. Markov equivalence says the data sees a skeleton and unshielded colliders; the rest lives in a CPDAG until experiments break the tie."
date: 2026-06-17 01:08:00 -0400
categories: statistics
tags: [causal-discovery, markov-equivalence, cpdag, graphical-models, causal-inference, statistics, dags, interventions]
excerpt: "A causal graph learned from conditional independences is not a photograph. It is a class of DAGs that cast the same independence shadow."
---

A causal arrow is easy to draw.

It is harder to earn.

Suppose observational data tells you that three variables form this undirected
skeleton:

```text
A - B - C
```

and suppose no conditional-independence test finds a collider witness at `B`.
There are then several causal stories with the same independence shadow:

```text
A -> B -> C
A <- B -> C
A <- B <- C
```

They disagree causally. They agree observationally.

That is not a bug in a causal-discovery algorithm. It is a theorem-shaped limit.

## The Part the Data Can See

For directed acyclic graphs, Verma and Pearl's Markov-equivalence criterion is
the sentence to keep taped to the monitor:

```text
same skeleton + same unshielded colliders = same conditional independences
```

More formally, two DAGs are Markov equivalent when they imply the same
d-separation statements. The classical characterization says this happens
exactly when they have the same undirected skeleton and the same v-structures,
also called unshielded colliders.[^verma-pearl][^chickering]

A v-structure is the local pattern:

```text
A -> B <- C      with A and C not adjacent
```

The "not adjacent" clause matters. If `A` and `C` are connected, the collider is
shielded by an extra edge, and the same conditional-independence witness no
longer appears.

So the observational target is usually not a single DAG. It is a Markov
equivalence class:

```text
[G] = every DAG with the same skeleton and v-structures as G
```

The clean representation is the essential graph, or CPDAG. Its directed edges
are the arrows shared by every DAG in the class. Its undirected edges are the
arrows the observational data has not oriented.[^andersson]

The lab below enumerates that class exactly for small graphs.

## A Small Exact Enumerator

The code does not estimate from samples. It starts after the idealized
conditional-independence oracle has already done its job. For each small
skeleton, it:

```text
enumerates every acyclic orientation
keeps only orientations with the same v-structures as the drawn DAG
cross-checks that class with an exact d-separation oracle
marks an edge as compelled only if every surviving DAG agrees on its direction
optionally adds one perfect intervention and recomputes the class
```

This is deliberately brute force. That is the point. The picture is not a
metaphor for the theorem; it is a tiny verifier for it. The audit does not
merely restate the skeleton/v-structure rule. It enumerates
conditional-independence statements over the shown variables and checks that the
two views pick the same surviving DAGs.

<style>
  .mec-lab {
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

  .mec-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    margin-bottom: 1rem;
  }

  .mec-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .mec-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .mec-lab select {
    background: #ffffff;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.2rem 0.45rem;
    width: 100%;
  }

  .mec-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .mec-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .mec-lab__metric.good {
    border-color: #9ed8c5;
  }

  .mec-lab__metric.warn {
    border-color: #f1c889;
  }

  .mec-lab__metric span,
  .mec-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .mec-lab__metric span {
    display: block;
  }

  .mec-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .mec-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .mec-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .mec-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .mec-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .mec-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 540px) {
    .mec-lab {
      padding: 0.75rem;
    }

    .mec-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="markov-equivalence-lab" class="mec-lab" data-markov-equivalence-lab>
  <div class="mec-lab__controls">
    <label>
      Graph: <output data-value="scenario">three-node chain</output>
      <select data-param="scenario" aria-label="Graph scenario">
        <option value="chain" selected>three-node chain</option>
        <option value="collider">unshielded collider</option>
        <option value="triangle">shielded triangle</option>
        <option value="diamond">diamond with sink</option>
        <option value="frontdoor">four-node corridor</option>
      </select>
    </label>
    <label>
      Extra data: <output data-value="intervention">observed only</output>
      <select data-param="intervention" aria-label="Intervention target">
        <option value="none" selected>observed only</option>
        <option value="A">do(A)</option>
        <option value="B">do(B)</option>
        <option value="C">do(C)</option>
      </select>
    </label>
  </div>
  <div class="mec-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="760" aria-label="Markov equivalence class lab showing a drawn DAG, its CPDAG, equivalent orientations, and intervention scorecard"></canvas>
  <div class="mec-lab__legend">
    <span><i style="background:#2563eb"></i> drawn DAG</span>
    <span><i style="background:#0f766e"></i> compelled arrow</span>
    <span><i style="background:#5d6872"></i> reversible link</span>
    <span><i style="background:#be123c"></i> v-structure</span>
    <span><i style="background:#d97706"></i> collider witness</span>
  </div>
  <p class="mec-lab__note">
    Exact finite enumeration for small DAGs. Its 22-case audit checks
    acyclicity, d-separation equivalence, CPDAG edge unanimity, scorecard class
    sizes, and monotone refinement under the displayed perfect-intervention
    model.
  </p>
</div>
<script defer src="{{ '/assets/js/markov-equivalence-lab.js?v=20260617b' | relative_url }}"></script>

Start with **three-node chain** and **observed only**. The class has three
DAGs. The CPDAG has two gray links because the conditional independences do not
decide whether `B` is a cause, a mediator, or an effect.

Now switch to **unshielded collider**. The class collapses to one DAG. The
collider is not a vague visual cue; it is an independence fingerprint. Marginally
`A` and `C` can be independent, but conditioning on `B` opens the path. That
pattern singles out the arrowheads into `B`.

Then try **shielded triangle**. A complete three-node skeleton has six acyclic
orientations and no unshielded colliders. The lab shows the annoying truth:
every topological ordering gives a different DAG, and observational
conditional-independence structure alone has nothing local to grab.

## Interventions Shrink the Class

The intervention selector uses a simple ideal model: a perfect intervention on
node `X` cuts incoming arrows into `X` in the intervention graph, while leaving
the rest of the system's arrows intact.

This is the graphical intuition behind interventional Markov equivalence.
Hauser and Buehlmann formalize how observational plus interventional
distributions define a finer equivalence class, represented by an
interventional essential graph.[^hauser]

In the three-node chain:

```text
A -> B -> C
```

observational data leaves three DAGs. But `do(A)` or `do(B)` identifies the
drawn chain in this toy. Why? If `B` caused `A`, intervening on `A` would cut the
incoming `B -> A` edge and change the intervention graph's independence
fingerprint. If `A` causes `B`, there is no incoming edge to cut.

This is why experiments are not decorative causal labels. They change the graph
whose independences you get to observe.

## The Algorithmic Consequence

Once the target is an equivalence class, it is wasteful to search only over
individual DAGs as if each orientation were separately identifiable.

Chickering's Greedy Equivalence Search works over equivalence-class states
rather than raw DAG states, using local operators on CPDAG-like
representations.[^chickering] Modern constraint-based algorithms such as PC
also end in partially directed graphs, with finite-sample complications layered
on top of the population theorem.[^colombo]

The population theorem says:

```text
with the right assumptions and infinite data, observational discovery reaches [G]
```

It does not say:

```text
finite noisy tests recover the right class
hidden confounding is harmless
faithfulness always holds
the CPDAG is the causal graph
```

Those are separate contracts.

## Reproducibility Notes

The executable artifact is
[`assets/js/markov-equivalence-lab.js`]({{ '/assets/js/markov-equivalence-lab.js' | relative_url }}).

Its self-test runs 22 scenario/intervention cases and performs 687 local
checks:

```text
all displayed orientations are acyclic DAGs
the skeleton/v-structure criterion matches an independent d-separation oracle
every accepted orientation has the same observational/interventional CI signature
every rejected orientation differs from that CI signature
directed CPDAG edges are unanimous across the surviving class
undirected CPDAG edges occur in both directions across the surviving class
single-node interventions refine, rather than enlarge, the observational class
displayed class sizes match fixed regression anchors for all graph/target pairs
```

## A Useful Reporting Habit

When a causal-discovery result prints a graph, ask:

```text
Which edges are compelled across the equivalence class?
Which edges are merely one chosen representative?
What assumptions made this a DAG instead of a PAG or other object?
Were interventions used, or only observational independences?
How stable is the class under finite-sample uncertainty?
Does the downstream effect estimate average over the class or pretend it is a singleton?
```

The last question is where many analyses quietly change subject. A model can
draw a single DAG because a plotting function needs arrowheads. But the
scientific claim may only justify a CPDAG.

The honest object is not always:

```text
the graph
```

Sometimes it is:

```text
the set of graphs still alive
```

[^verma-pearl]: Thomas S. Verma and Judea Pearl, ["Equivalence and Synthesis of Causal Models"](https://ftp.cs.ucla.edu/tech-report/1991-reports/910020.pdf), UAI, 1990. See also the arXiv-hosted version, ["On the Equivalence of Causal Models"](https://arxiv.org/abs/1304.1108).

[^chickering]: David M. Chickering, ["Optimal Structure Identification With Greedy Search"](https://www.jmlr.org/papers/volume3/chickering02b/chickering02b.pdf), *Journal of Machine Learning Research* 3:507-554, 2002.

[^andersson]: Steen A. Andersson, David Madigan, and Michael D. Perlman, ["A Characterization of Markov Equivalence Classes for Acyclic Digraphs"](https://projecteuclid.org/journals/annals-of-statistics/volume-25/issue-2/A-characterization-of-Markov-equivalence-classes-for-acyclic-digraphs/10.1214/aos/1031833662.full), *The Annals of Statistics* 25(2):505-541, 1997.

[^hauser]: Alain Hauser and Peter Buehlmann, ["Characterization and Greedy Learning of Interventional Markov Equivalence Classes of Directed Acyclic Graphs"](https://jmlr.org/papers/volume13/hauser12a/hauser12a.pdf), *Journal of Machine Learning Research* 13:2409-2464, 2012.

[^colombo]: Diego Colombo and Marloes H. Maathuis, ["Order-Independent Constraint-Based Causal Structure Learning"](https://www.jmlr.org/papers/volume15/colombo14a/colombo14a.pdf), *Journal of Machine Learning Research* 15:3741-3782, 2014.
