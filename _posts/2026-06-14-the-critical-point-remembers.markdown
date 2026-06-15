---
layout: post
title: "The Critical Point Remembers"
description: "At the Ising critical point, local Monte Carlo updates keep revisiting the same large domains. A cluster move changes the unit of motion."
date: 2026-06-14 19:54:00 -0400
categories: physics
tags: [ising-model, monte-carlo, statistical-physics, critical-slowing-down, wolff-algorithm, markov-chain-monte-carlo]
excerpt: "Near a phase transition, the interesting object is not a spin. It is a domain. That is why one-spin-at-a-time Monte Carlo starts to remember too much."
---

At high temperature, the lattice forgets quickly.

One spin points up. Its neighbor points down. A few more flips and the picture
looks different. There is no large object to preserve.

At low temperature, the lattice also has a simple kind of memory. Almost
everything agrees with everything else. The magnet is mostly up or mostly down,
and a single rebellious spin is usually swallowed by its neighbors.

The strange place is between.

At the critical point, the model is full of domains that are too large to be
called noise and too fragile to be called phases. A local Monte Carlo update
still proposes one spin flip at a time. The state, however, is no longer made of
isolated spins in the way the algorithm hopes. It is made of correlated patches.

The sampler has the wrong hand size.

## The Smallest Serious Magnet

The two-dimensional ferromagnetic Ising model puts a spin
\(\sigma_i\in\{-1,+1\}\) on each site of a lattice. Neighboring spins prefer to
agree. With no external field and with \(J=k_B=1\), the energy is

$$
H(\sigma)=-\sum_{\langle i,j\rangle}\sigma_i\sigma_j.
$$

At temperature \(T\), a configuration has probability proportional to

$$
\exp(-H(\sigma)/T).
$$

This is a tiny definition with a large afterlife. Duminil-Copin's survey calls
the Ising model a cornerstone of statistical mechanics and emphasizes the
nearest-neighbor ferromagnetic lattice model as the classical case.[^hdc]

The square-lattice model at zero field is unusually generous: it has exact
answers. Onsager computed the free energy in 1944.[^onsager] C. N. Yang later
computed the spontaneous magnetization.[^yang] In the units above, the critical
temperature is

$$
T_c=\frac{2}{\log(1+\sqrt{2})}
\approx 2.269185.
$$

Below that temperature, the infinite-volume spontaneous magnetization is

$$
m_\infty(T)=
\left(1-\sinh^{-4}(2/T)\right)^{1/8},
\qquad T<T_c,
$$

and it is zero at and above \(T_c\).

That formula is not just a curve. It is a warning about limits.

In a finite box with no magnetic field, the distribution is symmetric. The
lattice can be mostly up, mostly down, or wandering between them. The
spontaneous magnetization appears only after taking the thermodynamic limit in
the right way. The browser lab below keeps the box finite on purpose, because
finite boxes show the computational symptom vividly: memory.

## The Local Move

The Metropolis update is beautifully direct.[^metropolis]

1. Pick a spin.
2. Compute the energy change \(\Delta H\) if it flips.
3. Accept the flip with probability \(\min(1,\exp(-\Delta H/T))\).

For the Ising model, flipping one spin only asks about its four neighbors, so
the move is cheap. That cheapness is why it is tempting to equate "many updates"
with "many independent samples."

Near \(T_c\), that equation breaks.

A proposed flip at the boundary of a domain may be accepted, but the domain is
still there. A flip inside a large aligned patch is usually rejected or quickly
undone by its neighborhood. The chain moves, yet a macroscopic feature keeps
appearing in the mirror.

This is critical slowing down: the correlation length grows, and local dynamics
need more time to decorrelate large-scale observables.

The problem is not that Metropolis is invalid. It targets the right
distribution. The problem is that "right distribution eventually" is a weaker
promise than "fresh information soon."

## The Cluster Move

Swendsen and Wang introduced a cluster approach for spin systems in 1987, and
Wolff introduced a single-cluster version in 1989.[^swendsen-wang][^wolff]

The Wolff move changes the unit of motion:

1. Pick a seed spin.
2. Add same-aligned neighbors to its cluster with probability
   \(p=1-\exp(-2/T)\).
3. Continue growing through newly added sites.
4. Flip the whole cluster.

At high temperature, clusters are small. At low temperature, clusters can be
huge. Near the critical point, the algorithm often grabs a correlated object
whose size is comparable to the thing the local sampler was failing to move.

This is the lovely part. The algorithm does not merely accelerate the same
one-spin story. It changes the vocabulary of the Markov chain so that its
proposal can speak in domains.

## A Finite Box With Two Memories

The lab uses a \(48\times48\) periodic square lattice by default. Both samplers
start from the same initial spins and use the same touched-spin budget:

```text
one Metropolis sweep = N proposed one-spin flips
one Wolff cluster    = however many spins the cluster touched
```

This is not a perfect cost model. A real implementation has queues, random
number costs, memory traffic, and cache behavior. It is a useful normalization
for the question here: if both methods are allowed to touch roughly the same
number of spins, which one forgets the large-scale state faster?

The default temperature is `T=2.27`, just above the exact critical temperature.
For the deterministic seed in the lab, the summary is:

```text
T_c                  2.269185
T / T_c              1.00
Metropolis |m|       0.501
Wolff |m|            0.677
mean Wolff cluster   30.7% of the lattice
Metropolis accept    25.1%
|m| half-life        27 samples for Metropolis, 1 for Wolff
sign flips           1 for Metropolis, 43 for Wolff
```

Do not read the two final magnetizations as thermodynamic measurements. This is
a small finite lattice, a short trace, and one seed. The thing to read is the
memory. The local chain keeps the absolute magnetization correlated over many
sample points. The cluster chain changes sign repeatedly because a large domain
can be flipped as a unit.

The phase transition is not just a property of the model. It is also a stress
test for the sampler's proposal geometry.

<style>
  .ising-lab {
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

  .ising-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(144px, 1fr));
  }

  .ising-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .ising-lab__controls input,
  .ising-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .ising-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .ising-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .ising-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .ising-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .ising-lab__metric span,
  .ising-lab__legend,
  .ising-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .ising-lab__metric span {
    display: block;
  }

  .ising-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .ising-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .ising-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .ising-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .ising-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .ising-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div class="ising-lab" data-ising-lab>
  <div class="ising-lab__controls">
    <label>
      Start state
      <select data-param="start">
        <option value="random" selected>random</option>
        <option value="plus">all plus</option>
        <option value="stripe">stripe</option>
      </select>
    </label>
    <label>
      Temperature: <output data-value="temp">2.27</output>
      <input type="range" min="120" max="380" step="1" value="227" data-param="temp">
    </label>
    <label>
      Lattice: <output data-value="size">48</output>
      <input type="range" min="24" max="72" step="4" value="48" data-param="size">
    </label>
    <label>
      Sweep budget: <output data-value="sweeps">180</output>
      <input type="range" min="60" max="360" step="10" value="180" data-param="sweeps">
    </label>
    <label>
      Seed: <output data-value="seed">17</output>
      <input type="range" min="1" max="9999" step="1" value="17" data-param="seed">
    </label>
  </div>
  <div class="ising-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Ising Monte Carlo lab comparing Metropolis and Wolff cluster updates near the critical temperature"></canvas>
  <div class="ising-lab__legend" aria-hidden="true">
    <span><i style="background:#dc2626"></i>Metropolis</span>
    <span><i style="background:#2563eb"></i>Wolff cluster</span>
    <span><i style="background:#0f766e"></i>exact infinite-volume curve</span>
  </div>
  <p class="ising-lab__note">
    The exact curve is the infinite-volume spontaneous magnetization. The two
    lattices are finite simulations with periodic boundaries, so sign changes
    and rounded transitions are expected rather than bugs.
  </p>
</div>

<script src="{{ '/assets/js/ising-critical-lab.js?v=20260614a' | relative_url }}"></script>

## What Changes When You Move the Temperature

Lower the temperature to around `1.6` and choose the all-plus start.

Metropolis becomes emotionally conservative. Almost every spin agrees with its
neighbors, so many proposed flips are rejected. Wolff clusters, meanwhile, are
often most of the lattice. A cluster flip changes the sign of the magnetization
without changing the fact that the lattice is highly ordered. That is not a
failure to preserve the physics. In zero field, the two signs are equally valid.

Raise the temperature to around `3.2` and choose the stripe start.

Both samplers forget quickly because the model itself has short-range
correlations. Wolff clusters shrink. The fancy move loses its dramatic
advantage because there is no large critical object to grab.

The interesting region is the one in between. Near \(T_c\), the model produces
large, irregular domains, and the local proposal has to erode them from the
edge. The cluster proposal can flip a whole connected patch. The difference is
not merely speed. It is a difference in what each algorithm treats as a
plausible elementary motion.

## Detailed Balance Is Not Enough

It is easy to say "both chains are correct" and move on. That is true, but it
misses the practical question.

For a Monte Carlo estimate, the price is not the number of states printed to a
file. The price is the number of effectively independent states. A chain can
have the right stationary distribution and still spend a long time walking
through similar configurations.

This distinction shows up everywhere:

- in Bayesian posteriors with funnels or ridges;
- in protein and spin-glass energy landscapes;
- in game-tree search when rollouts share the same early choices;
- in finance simulations where rare regimes are sticky.

The Ising model is useful because the failure mode is visible. You can watch
large black and white domains persist under local moves, and then watch a
cluster update flip one.

The toy magnet is doing a serious pedagogical job.

## A Caveat About the Word "Cluster"

The Wolff cluster is not an arbitrary connected component of equal spins. It is
a random bond cluster. Same-aligned neighbors are linked with probability

$$
p=1-\exp(-2/T),
$$

and the resulting connected component is flipped. That probability is tuned to
the Ising Boltzmann distribution. If you simply found every neighboring equal
spin and flipped the whole component, you would not have the same Markov chain.

The move is nonlocal, but not casual. It earns its freedom by matching the
statistical mechanics.

That is the broader lesson I like from cluster methods. Good proposals are not
just larger proposals. They are larger proposals that respect the structure of
the target distribution.

## The Research Taste

When an algorithm slows down, I want to ask what object it is trying to move.

For Metropolis on an ordinary high-temperature Ising lattice, the object is
almost a spin. For Metropolis near \(T_c\), the object is a domain, but the
algorithm still holds tweezers. Wolff gives it a hand.

That sentence transfers.

If a sampler for a neural-network posterior changes one scalar weight at a
time, but the posterior really moves along coordinated feature directions, the
sampler has the wrong hand size. If a database optimizer changes one join order
locally while the cost surface is organized by broad access patterns, the search
has the wrong hand size. If a reinforcement-learning agent treats each action
as local while the game has long tactical motifs, the planner may be making the
same category error.

Criticality is a clean place to see the principle because the model tells the
truth visually: when correlations grow, local motion becomes sticky.

The right move is not always a cluster flip.

But it is often a move that knows what a cluster is.

[^hdc]: Hugo Duminil-Copin, "The Ising model: a simple case study in statistical physics", International Mathematical Union, 2022. [PDF](https://www.mathunion.org/fileadmin/IMU/Prizes/Fields/2022/hdc.pdf).

[^onsager]: Lars Onsager, "Crystal Statistics. I. A Two-Dimensional Model with an Order-Disorder Transition", *Physical Review* 65, 117-149, 1944. [DOI](https://link.aps.org/doi/10.1103/PhysRev.65.117).

[^yang]: C. N. Yang, "The Spontaneous Magnetization of a Two-Dimensional Ising Model", *Physical Review* 85, 808-816, 1952. [DOI](https://link.aps.org/doi/10.1103/PhysRev.85.808); [PDF](https://home.ustc.edu.cn/~weixianhao/ref/cnyang.pdf).

[^metropolis]: Nicholas Metropolis, Arianna W. Rosenbluth, Marshall N. Rosenbluth, Augusta H. Teller, and Edward Teller, "Equation of State Calculations by Fast Computing Machines", *Journal of Chemical Physics* 21, 1087-1092, 1953. [PDF](https://bayes.wustl.edu/Manual/EquationOfState.pdf).

[^swendsen-wang]: Robert H. Swendsen and Jian-Sheng Wang, "Nonuniversal critical dynamics in Monte Carlo simulations", *Physical Review Letters* 58, 86-88, 1987. [DOI](https://link.aps.org/doi/10.1103/PhysRevLett.58.86).

[^wolff]: Ulli Wolff, "Collective Monte Carlo Updating for Spin Systems", *Physical Review Letters* 62, 361-364, 1989. [DOI](https://link.aps.org/doi/10.1103/PhysRevLett.62.361); [PDF](https://stat.duke.edu/~scs/Courses/Stat376/Papers/ClusterSampling/WolffCluster_PhysRevLett_1989.pdf).
