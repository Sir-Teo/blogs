---
layout: post
title: "Waiting for the Wrong Fluctuation"
description: "Kramers escape explains why a system can look settled while rare noise quietly prices the exit."
date: 2026-06-14 21:40:00 -0400
categories: physics
tags: [kramers-escape, stochastic-differential-equations, metastability, langevin-dynamics, first-passage-time, applied-math]
excerpt: "Nothing dramatic happens for a long time. Then one fluctuation pays the whole barrier bill at once."
---

Visit the same valley every morning. The rock is still there.

It is tempting to call that stability. But the rock is not at equilibrium with
the whole mountain. It is only at equilibrium with its valley. Another valley may
be waiting across a ridge, and the current valley can look peaceful right up
until the morning it is not.

That is metastability: local calm with an unpaid exit route. The escape is not a
slow deterministic crawl up the hill. Most days the particle rattles near the
bottom and forgets the last shove. Then one fluctuation spends enough probability
mass in the right direction and the state changes all at once.

Kramers made this picture quantitative for Brownian motion in a force field in
1940. The modern literature has widened it into a theory of rare transitions,
reaction rates, molecular dynamics, Josephson junctions, switching devices, and
large deviations.[^kramers-review]

The slogan is useful and dangerous:

```text
barrier height lives mostly in the exponent
curvature, friction, and coordinates live in the prefactor
```

Mostly is doing the honest work. At finite noise, a simulation still sees the
absorbing boundary, the chosen reaction coordinate, the time step, and the fact
that the noise is not infinitesimal. The exponent is the headline. It is not the
whole newspaper.

## A Basin With an Appointment

Take an overdamped Langevin process

$$
dX_t = -U'(X_t)\,dt + \sqrt{2\epsilon}\,dW_t.
$$

Here \(U\) is a potential, \(W_t\) is Brownian motion, and \(\epsilon\) is the
thermal noise scale. The little instrument below uses the symmetric double well

$$
U_a(x)=a(x^2-1)^2.
$$

The left well is at \(x=-1\). The saddle is at \(x=0\). The barrier height is

$$
\Delta U = U_a(0)-U_a(-1)=a.
$$

For small \(\epsilon\), the Eyring-Kramers law says the mean transition time is
asymptotically

$$
\mathbb{E}\tau
\approx
\frac{2\pi}{\sqrt{U''(-1)\,|U''(0)|}}
\exp\!\left(\frac{\Delta U}{\epsilon}\right).
$$

For this potential, \(U''(-1)=8a\) and \(|U''(0)|=4a\), so the prefactor is
\(2\pi/\sqrt{32a^2}\). Lelievre, Le Peutrec, and Nectoux state the modern
overdamped version as an exit-rate result: a diffusion
\(dX_t=-\nabla f(X_t)dt+\sqrt{h}\,dB_t\) leaves a basin through saddles with
rates parametrized by Eyring-Kramers laws in the small-noise limit.[^ek]

There is also an exact one-dimensional first-passage equation hiding under the
asymptotic slogan. If \(m(x)=\mathbb{E}_x\tau\) is the mean time to hit the
saddle \(0\), then

$$
-1 = -U'(x)m'(x)+\epsilon m''(x),
\qquad m(0)=0.
$$

With a reflecting left boundary pushed far away, this gives

$$
m(-1)=
\frac{1}{\epsilon}
\int_{-1}^{0}
\exp\!\left(\frac{U(y)}{\epsilon}\right)
\int_{-\infty}^{y}
\exp\!\left(-\frac{U(z)}{\epsilon}\right)\,dz\,dy.
$$

That integral is what the workbench calls the MFPT integral. The orange
Arrhenius line is the small-noise Kramers asymptote. The green histogram and
survival curve come from Euler-Maruyama paths, following the practical SDE
simulation recipe in Higham's numerical introduction.[^higham]

<style>
  .kramers-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    isolation: isolate;
    margin: 2rem 0;
    max-width: 100%;
    overflow: hidden;
    padding: 1rem;
    position: relative;
  }

  .kramers-lab__controls {
    clip-path: inset(0);
    contain: paint;
    display: grid;
    gap: 0.85rem 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    overflow: hidden;
    position: relative;
    z-index: 0;
  }

  .kramers-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
    overflow: hidden;
  }

  .kramers-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .kramers-lab__controls input[type="range"] {
    appearance: none;
    background: transparent;
    height: 1.15rem;
  }

  .kramers-lab__controls input[type="range"]::-webkit-slider-runnable-track {
    background: #e3e8ee;
    border: 1px solid #b7c1cb;
    border-radius: 999px;
    height: 0.36rem;
  }

  .kramers-lab__controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    background: #0f766e;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #0f766e;
    height: 1rem;
    margin-top: -0.36rem;
    width: 1rem;
  }

  .kramers-lab__controls input[type="range"]::-moz-range-track {
    background: #e3e8ee;
    border: 1px solid #b7c1cb;
    border-radius: 999px;
    height: 0.36rem;
  }

  .kramers-lab__controls input[type="range"]::-moz-range-thumb {
    background: #0f766e;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #0f766e;
    height: 0.8rem;
    width: 0.8rem;
  }

  .kramers-lab__controls input[type="number"] {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .kramers-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .kramers-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 1rem 0 0.85rem;
    position: relative;
    z-index: 2;
  }

  .kramers-lab__metric {
    background: #f8fafc;
    border: 1px solid #dfe6ee;
    border-radius: 6px;
    font-family: var(--font-ui);
    min-width: 0;
    padding: 0.62rem 0.7rem;
  }

  .kramers-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    letter-spacing: 0;
    line-height: 1.2;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
  }

  .kramers-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .kramers-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    max-width: 100%;
    position: relative;
    z-index: 2;
  }

  .kramers-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.75rem 0 0;
    position: relative;
    z-index: 2;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) .kramers-lab {
      background: #ffffff;
      color: #172026;
    }
  }

  :root[data-theme="dark"] .kramers-lab {
    background: #ffffff;
    color: #172026;
  }
</style>

<div class="kramers-lab" data-kramers-lab>
  <div class="kramers-lab__controls">
    <label>Barrier
      <input data-param="barrier" type="range" min="18" max="110" step="1" value="42">
      <output data-value="barrier">0.42</output>
    </label>
    <label>Noise
      <input data-param="noise" type="range" min="7" max="32" step="1" value="18">
      <output data-value="noise">0.18</output>
    </label>
    <label>Trajectories
      <input data-param="paths" type="range" min="60" max="420" step="1" value="220">
      <output data-value="paths">220</output>
    </label>
    <label>Horizon
      <input data-param="horizon" type="range" min="40" max="260" step="1" value="150">
      <output data-value="horizon">150</output>
    </label>
    <label>Seed
      <input data-param="seed" type="number" min="1" max="9999" step="1" value="43">
      <output data-value="seed">43</output>
    </label>
  </div>
  <div class="kramers-lab__metrics" data-metrics></div>
  <canvas data-canvas width="680" height="720" role="img" aria-label="Interactive Kramers escape and first passage simulation"></canvas>
  <p class="kramers-lab__note">The audit checks finite paths, enough observed escapes, agreement between simulated mean first-passage time and the one-dimensional MFPT integral, and a usable Arrhenius slope fit from nearby noise levels.</p>
</div>

<script src="{{ '/assets/js/kramers-escape-lab.js?v=20260614c' | relative_url }}"></script>

Before publishing, I audited the lab through its exported API instead of trusting
the canvas. At the default settings, all 220 paths escaped before the horizon,
the simulated mean first-passage time was 18.68, the MFPT integral was 15.49,
and the ratio was 1.21. A 90-case sweep over barrier height, noise, and horizon
produced finite outputs everywhere; 77 cases passed the stricter audit gate, and
the remaining cases were exactly the hard censored regimes where the chosen
horizon is too short for the predicted waiting time.

## The Asymptote Tells the Truth Slantwise

The escape time grows like \(\exp(\Delta U/\epsilon)\). This is the part people
remember. It deserves to be remembered. Move the barrier a little higher, or the
noise a little lower, and the waiting time can change by orders of magnitude.

But the exponent is not a literal stopwatch. In the lab, the simulated mean is
usually closer to the MFPT integral than to the asymptotic Kramers prefactor.
That is not a contradiction. It is what asymptotic analysis means.

Kramers tells us the shape of the rare-event economy:

```text
log waiting time ~= barrier / noise + slower terms
```

The MFPT integral tells us what this particular one-dimensional boundary problem
predicts before the noise is small enough for the slower terms to be ignorable.

Freidlin-Wentzell theory pushes the same idea into a broader language. In weak
noise, the probability of a path is controlled by an action functional, and exit
times become exponential on the noise scale.[^fw] In gradient systems, the
minimum action path agrees with the intuitive climb to the relevant saddle. In
non-gradient systems, the "barrier" is no longer just a height on a landscape; it
becomes a quasipotential.

That is the transferable lesson. Rare transitions are often governed by a
geometry that local variance does not reveal.

## After the System Forgets

The survival curve in the lab often looks close to an exponential tail. That is
not because each time step independently tries to jump the barrier. The particle
spends many time steps rattling around the well. Local relaxation is fast. Exit
is slow. After the system has forgotten how it entered the well, the remaining
time to escape looks almost like a fresh copy of the same waiting problem.

This is why metastable dynamics can often be coarse-grained into a Markov jump
process. The continuous path is not a jump process. But if the within-well
mixing time is much shorter than the escape time, the coarse state can behave as
if it has an exponential alarm clock. The Eyring-Kramers law supplies the rate
for that alarm in the small-noise, well-resolved-saddle limit.

The approximation fails in exactly the interesting places:

- the barrier is not large relative to the noise;
- the reaction coordinate misses a hidden slow variable;
- the saddle is flat or degenerate;
- there are several exits with comparable action;
- the dynamics is driven out of equilibrium.

Each failure mode changes what the clock is actually measuring.

## Field Notes for Other Basins

There is a useful mental model here for systems far away from chemistry.

Optimization can sit in a basin and then leave after a noisy minibatch sequence.
A queue can look stable until a burst crosses a buffer threshold. A leveraged
portfolio can appear calm until a drawdown trips a constraint. A game AI can sit
in a locally safe policy until exploration finds a high-variance transition.

The bad version of this analogy says every escape is Kramers escape. The good
version asks three questions:

1. What is the state variable that defines the basin?
2. What is the noise scale?
3. What path has to be paid for?

If you cannot answer those, the exponential law is just poetry with a Greek
letter in it.

If you can answer them, even approximately, then the rare event stops being a
mystery. It becomes a calendar written in barrier units.

[^kramers-review]: P. Hanggi, P. Talkner, and M. Borkovec, ["Reaction-rate theory: fifty years after Kramers"](https://www.weizmann.ac.il/chembiophys/bouchbinder/sites/chemphys.bouchbinder/files/uploads/Courses/2021/TAs/Reaction-rate%20theory_fifty%20years%20after%20Kramers_1990.pdf), *Reviews of Modern Physics*, 1990.

[^ek]: T. Lelievre, D. Le Peutrec, and B. Nectoux, ["Eyring-Kramers exit rates for the overdamped Langevin dynamics"](https://www.idpoisson.fr/lepeutrec/eng/Research_files/eyring-kramers_PC_arxiv-1.pdf), 2019 preprint; see also the arXiv abstract for ["Exit event from a metastable state and Eyring-Kramers law for the overdamped Langevin dynamics"](https://arxiv.org/abs/1811.06786).

[^higham]: D. J. Higham, ["An Algorithmic Introduction to Numerical Simulation of Stochastic Differential Equations"](https://epubs.siam.org/doi/10.1137/S0036144500378302), *SIAM Review*, 2001.

[^fw]: M. I. Freidlin and A. D. Wentzell, *Random Perturbations of Dynamical Systems*. For a compact lecture-note view of the exit-time asymptotics and Kramers law, see Barbara Gentz, ["Diffusion Exit from a Domain"](https://www.math.uni-bielefeld.de/~gentz/slides/SNU_Gentz_1.pdf).
