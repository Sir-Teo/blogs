---
layout: post
title: "Diffusion Can Break the Symmetry"
description: "Reaction-diffusion systems are a small shock to intuition: local mixing, coupled to nonlinear reactions, can turn a nearly uniform field into spots, worms, and fronts."
date: 2026-06-14 10:12:00 -0400
categories: computer-science
tags: [reaction-diffusion, turing-patterns, gray-scott, simulation, pattern-formation]
excerpt: "Diffusion usually means smoothing. In a reaction-diffusion system, smoothing can become the transport mechanism that lets a local chemical instability write a spatial pattern."
---

Diffusion is supposed to erase structure.

Drop ink in water and the boundary softens. Heat a cold room and the gradients
flatten. Put a Laplacian into a differential equation and it punishes high
frequency variation. Diffusion is the mathematical smell of smoothing.

So the reaction-diffusion story is a little mischievous:

```text
mixing can help make a pattern
```

Not by itself. Pure diffusion still smooths. The trick is that diffusion is
coupled to local reactions. One chemical may catalyze the production of another.
One species may spread faster than the other. A spatially uniform state can be
stable if every point is forced to stay identical, yet unstable to a spatial
perturbation once neighboring points can exchange material.

That is the door Alan Turing opened in 1952. In "The Chemical Basis of
Morphogenesis," he argued that morphogens reacting and diffusing through tissue
could account for the spontaneous emergence of spatial structure from an
initially homogeneous state.[^turing] The modern phrase is
**diffusion-driven instability**: a homogeneous steady state is safe against
well-mixed perturbations but unsafe against perturbations with certain
wavelengths.

The idea is bigger than any one animal stripe. It is a mechanism. Local rules,
spatial transport, and nonlinear feedback can turn sameness into geometry.

## A Toy That Draws Back

The lab below uses the Gray-Scott reaction-diffusion system, a two-species
model popular because it produces a zoo of patterns with only a few parameters.
Pearson's 1993 paper showed that this simple model can generate regular
hexagons, irregular steady patterns, dividing spots, and chaotic
spatiotemporal behavior from finite-amplitude perturbations.[^pearson]

The dimensionless equations are:

$$
\frac{\partial u}{\partial t}
=
D_u \nabla^2 u - u v^2 + F(1-u)
$$

$$
\frac{\partial v}{\partial t}
=
D_v \nabla^2 v + u v^2 - (F+k)v.
$$

There are two chemicals, $$u$$ and $$v$$. The term $$u v^2$$ is autocatalytic:
where enough $$v$$ already exists, it helps make more $$v$$ by consuming $$u$$.
The feed term replenishes $$u$$. The kill term removes $$v$$. Diffusion moves
both species across the grid, but at different rates.

The browser simulation uses periodic boundaries and an explicit finite
difference update. It is intentionally small enough to inspect. The point is not
to make the fastest PDE solver. The point is to see the qualitative regimes:
quiet, spots, crowded texture, and decay.

<style>
  .rd-lab {
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

  .rd-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .rd-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .rd-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .rd-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .rd-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .rd-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .rd-lab__metric span,
  .rd-lab__legend,
  .rd-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .rd-lab__metric span {
    display: block;
  }

  .rd-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .rd-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 660px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .rd-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .rd-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .rd-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .rd-lab__note {
    margin: 0.75rem 0 0;
  }

  @media (max-width: 620px) {
    .rd-lab {
      padding: 0.75rem;
    }

    .rd-lab__controls {
      grid-template-columns: 1fr;
    }

    .rd-lab canvas {
      height: 980px;
    }
  }
</style>

<div class="rd-lab" data-reaction-diffusion-lab>
  <div class="rd-lab__controls">
    <label>
      Feed F <output data-value="feed">0.030</output>
      <input type="range" min="14" max="98" step="1" value="30" data-param="feed">
    </label>
    <label>
      Kill k <output data-value="kill">0.062</output>
      <input type="range" min="45" max="72" step="1" value="62" data-param="kill">
    </label>
    <label>
      V diffusion <output data-value="diffusion">50%</output>
      <input type="range" min="30" max="80" step="1" value="50" data-param="diffusion">
    </label>
    <label>
      Rollout steps <output data-value="steps">900</output>
      <input type="range" min="180" max="1800" step="20" value="900" data-param="steps">
    </label>
    <label>
      Perturbation size <output data-value="size">12%</output>
      <input type="range" min="4" max="24" step="1" value="12" data-param="size">
    </label>
    <label>
      Seed <output data-value="seed">41</output>
      <input type="range" min="1" max="999" step="1" value="41" data-param="seed">
    </label>
  </div>
  <div class="rd-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Gray-Scott reaction diffusion pattern simulation"></canvas>
  <div class="rd-lab__legend">
    <span><i style="background:#2563eb"></i> V concentration</span>
    <span><i style="background:#0f766e"></i> Textured parameter cells</span>
    <span><i style="background:#b45309"></i> Active area trace</span>
    <span><i style="background:#7c3aed"></i> V histogram</span>
  </div>
  <p class="rd-lab__note">
    Deterministic explicit simulation with periodic boundaries. The local
    parameter map reruns nearby feed/kill settings at lower resolution to show
    how narrow the patterning region can be.
  </p>
</div>
<script defer src="{{ '/assets/js/reaction-diffusion-lab.js?v=20260614a' | relative_url }}"></script>

Try this sequence.

First, lower **rollout steps** to watch the pattern before it has had time to
organize. The trace starts with a finite perturbation and records how contrast
and active area evolve. In many settings the field needs a while before it
reveals what regime it is in.

Second, move **feed** and **kill** by only a few ticks. Some changes look
ridiculously small in the equations and large in the field. That is the
parameter-map panel's point: pattern formation often lives on thin regions of
parameter space. Nearby feed/kill pairs can mean spots, worms, or decay.

Third, raise **V diffusion**. If the active species spreads too quickly relative
to the reaction, local peaks can wash out. If it spreads too slowly, patches may
overcrowd and compete. The pattern is not stored in either chemical alone. It is
stored in the loop between reaction and transport.

The metrics are intentionally physical rather than aesthetic. **V mass** says
how much product remains. **Contrast** measures spatial variation. **Active
area** counts cells above a concentration threshold. **Edge energy** responds to
fine boundaries. **Histogram spread** tells you whether the grid is mostly one
state or split across many concentration levels.

## Why the Explanation Is Not "Noise"

The initial perturbation matters. Pearson emphasized that many Gray-Scott
patterns arise in response to finite-amplitude perturbations, not simply from
infinitesimal linear instability.[^pearson] That does not make the pattern
random in the casual sense.

Randomness seeds the field. The equations select and amplify.

This distinction shows up everywhere in simulation work. A random seed is often
less interesting than the attractor landscape it samples. If many seeds end in
the same texture, the system has a robust regime. If tiny parameter changes move
the simulation from spots to extinction, the model is telling you that the
regime boundary matters more than the seed.

Reaction-diffusion systems are therefore a good antidote to a lazy phrase:

```text
emergence means it came from nowhere
```

No. Emergence here means the visible scale is not written explicitly into the
local rule. The local rule says diffuse, feed, kill, and react. The spot size,
spacing, splitting, and decay are consequences of iterating that rule across
space.

## What This Toy Does Not Prove

It is tempting to look at the image and say "nature solved stripes this way."
Sometimes reaction-diffusion is the right mechanistic language. Sometimes it is
only a useful analogy. Real developmental systems include gene regulation,
growth, mechanics, geometry, cell movement, signaling networks, and boundary
conditions. A two-chemical PDE on a square grid is not a universal explanation.

Turing's contribution was more precise and more durable: he showed that known
physical processes could, in principle, break spatial symmetry without a hidden
prepattern. Later work has refined, criticized, extended, and experimentally
tested that idea in many settings. Modern PDE datasets even use Gray-Scott
systems as challenging benchmarks for surrogate models because different
feed/kill parameters produce qualitatively different long-time dynamics.[^well]

That computational angle is worth noticing. A reaction-diffusion simulator is a
tiny world where the prediction problem is not just "next pixel." It is
long-horizon stability, regime change, and sensitivity to parameters. A model
trained only on spots may not understand worms. A one-step predictor may look
good until repeated rollout slowly erases the pattern.

This is why toy physics can be useful for machine learning even when the
biology is not the target. The toy forces us to ask whether a learned simulator
has captured the rule or merely interpolated the pictures.

## The Smoothing That Writes

The good mental picture is not that diffusion creates pattern by opposing
smoothing. It is that diffusion couples local nonlinear reactors.

Every cell is doing simple chemistry. Diffusion lets neighbors perturb one
another. The feedback loop decides whether those perturbations die, spread,
split, or stabilize. Under the right conditions, the smoothing operator becomes
part of a pattern-writing machine.

That is the beautiful discomfort of the subject.

You add diffusion to remove differences. The system uses it to decide which
differences survive.

[^turing]: Alan M. Turing, ["The Chemical Basis of Morphogenesis"](https://royalsocietypublishing.org/rstb/article/237/641/37/112910/The-chemical-basis-of-morphogenesis), *Philosophical Transactions of the Royal Society of London B*, 1952.

[^pearson]: John E. Pearson, ["Complex Patterns in a Simple System"](https://www.science.org/doi/10.1126/science.261.5118.189), *Science*, 1993. A PDF copy is available from the University of Notre Dame: [pearson.pdf](https://www3.nd.edu/~powers/pearson.pdf).

[^well]: The Well, ["Pattern formation in the Gray-Scott reaction-diffusion equations"](https://polymathic-ai.org/the_well/datasets/gray_scott_reaction_diffusion/), accessed June 14, 2026.
