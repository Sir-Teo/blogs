---
layout: post
title: "The Sampler Borrows Momentum"
description: "Hamiltonian Monte Carlo works because it proposes by moving like a physical system: conserve energy, preserve volume, then let Metropolis audit the numerical error."
date: 2026-06-14 17:35:00 -0400
categories: statistics
tags: [hamiltonian-monte-carlo, mcmc, bayesian-computation, leapfrog, symplectic-integration, statistical-physics]
excerpt: "A random walk asks where to step. HMC asks where the posterior would carry a particle if it borrowed momentum and had to give the energy back."
---

A random-walk sampler is polite.

It stands at the current point and asks for a nearby one. If the nearby point is
plausible, it moves. If not, it stays. This is enough for a theorem, and often
not enough for a computation.

Hamiltonian Monte Carlo begins with a stranger bargain:

```text
borrow momentum
move like a physical particle
give the energy back
```

The borrowed momentum is fake. The energy is a construction. The motion is only
numerical. But the resulting proposal can cross long posterior valleys without
behaving like a diffusive drunkard.

This is why HMC feels different from many Markov chain methods. It does not ask
for a random local perturbation. It asks for a trajectory.

## The Posterior Becomes Potential Energy

Let the target density be:

$$
\pi(q) \propto \exp(-U(q)).
$$

The variable \(q\) is the position. The function \(U(q)\) is potential energy:
low where the posterior is dense, high where the posterior is unlikely.

Now introduce an auxiliary momentum \(p\), usually Gaussian, and define:

$$
H(q,p)=U(q)+K(p).
$$

For the simple kinetic energy in the lab:

$$
K(p)=\frac{1}{2m}p^\top p.
$$

The joint density is:

$$
\pi(q,p) \propto \exp(-H(q,p)).
$$

If we sample a fresh momentum and then follow Hamiltonian dynamics, two things
make the trick usable:

1. exact Hamiltonian dynamics preserve \(H\);
2. exact Hamiltonian dynamics preserve volume.

Energy preservation means a trajectory can move far while staying on a plausible
level set. Volume preservation means the transformation does not need a nasty
Jacobian correction. Neal emphasizes exactly these features: HMC uses
Hamiltonian dynamics to make distant Metropolis proposals and avoids the slow
diffusion of simple random-walk proposals.[^neal]

The posterior did not change. We changed the proposal mechanism.

## The Computer Breaks The Physics

Continuous Hamiltonian dynamics are beautiful:

$$
\frac{dq}{dt}=\frac{\partial H}{\partial p},\qquad
\frac{dp}{dt}=-\frac{\partial H}{\partial q}.
$$

The computer cannot follow them exactly. It must take steps.

The usual HMC stepper is leapfrog:

```text
p <- p - (epsilon / 2) grad U(q)
q <- q + epsilon p / m
p <- p - (epsilon / 2) grad U(q)
```

Repeated `L` times, this produces a proposal. Then a Metropolis step accepts it
with probability:

```text
min(1, exp(-(H_new - H_old)))
```

This is the small miracle: the integrator is allowed to make numerical error,
and the accept/reject step audits that error.

But not every integrator is equally forgivable. Forward Euler also takes steps,
but it tends to drift in energy. Leapfrog is time reversible and
volume-preserving, the two discrete properties HMC needs in order for the
Metropolis correction to be simple. Neal's review introduces the leapfrog scheme
as the standard discretization for computer implementation of HMC.[^neal]

In practice, HMC lives in the gap between exact physics and finite arithmetic.

## A Small Energy Lab

The lab below simulates HMC proposals in two dimensions. It is intentionally
small enough to audit. The target density is visible, the trajectory is visible,
and the energy error is measured instead of guessed.

The default target is a highly correlated Gaussian. With step size `0.18`,
`24` leapfrog steps, and `72` independent proposal audits, the lab gets about
`98%` expected acceptance, an expected jump of about `2.01`, no divergences,
and a reverse error near machine precision. On the same starting point, forward
Euler sends the energy error into the thousands.

That contrast is the essay in one picture.

<style>
  .hmc-lab {
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

  .hmc-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .hmc-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .hmc-lab__controls input,
  .hmc-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .hmc-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .hmc-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .hmc-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .hmc-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .hmc-lab__metric span,
  .hmc-lab__legend,
  .hmc-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .hmc-lab__metric span {
    display: block;
  }

  .hmc-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .hmc-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .hmc-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .hmc-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .hmc-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .hmc-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .hmc-lab {
      padding: 0.82rem;
    }

    .hmc-lab__controls,
    .hmc-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .hmc-lab canvas {
      height: 1100px;
    }
  }
</style>

<div class="hmc-lab" data-hmc-leapfrog-lab>
  <div class="hmc-lab__controls">
    <label>
      Target <output data-value="target">correlated Gaussian</output>
      <select data-param="target" aria-label="Target density">
        <option value="gaussian" selected>correlated Gaussian</option>
        <option value="banana">banana posterior</option>
        <option value="funnel">funnel neck</option>
      </select>
    </label>
    <label>
      Step size <output data-value="epsilon">0.18</output>
      <input type="range" min="4" max="80" step="1" value="18" data-param="epsilon" aria-label="Leapfrog step size">
    </label>
    <label>
      Leapfrog steps <output data-value="steps">24</output>
      <input type="range" min="4" max="72" step="1" value="24" data-param="steps" aria-label="Number of leapfrog steps">
    </label>
    <label>
      Mass scale <output data-value="mass">1.00</output>
      <input type="range" min="35" max="220" step="5" value="100" data-param="mass" aria-label="Momentum mass scale">
    </label>
    <label>
      Proposal audits <output data-value="proposals">72</output>
      <input type="range" min="24" max="144" step="12" value="72" data-param="proposals" aria-label="Number of proposal audits">
    </label>
    <label>
      Seed <output data-value="seed">41</output>
      <input type="range" min="1" max="9999" step="1" value="41" data-param="seed" aria-label="Random seed">
    </label>
  </div>
  <div class="hmc-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Hamiltonian Monte Carlo lab showing target density, leapfrog trajectory, energy error, Metropolis audit, and step size sweep"></canvas>
  <div class="hmc-lab__legend">
    <span><i style="background:#2563eb"></i>Leapfrog</span>
    <span><i style="background:#be123c"></i>Euler / divergence</span>
    <span><i style="background:#0f766e"></i>Accepting energy</span>
    <span><i style="background:#b45309"></i>Discounted proposal</span>
    <span><i style="background:#7c3aed"></i>Step-size sweep</span>
  </div>
  <p class="hmc-lab__note">
    Deterministic toy model. The Metropolis audit uses the leapfrog proposal
    and reports expected acceptance over independently sampled positions and
    momenta. Forward Euler is shown only as an energy-drift contrast.
  </p>
</div>

<script defer src="{{ '/assets/js/hmc-leapfrog-lab.js?v=20260614a' | relative_url }}"></script>

Try four moves.

First, leave the default alone and watch the energy panel. The leapfrog line
does not stay exactly at zero, but it oscillates near zero. That is good enough
for the Metropolis audit to accept most proposals.

Second, increase **Step size**. At first the expected jump can improve because
the trajectory moves more aggressively. Then the energy error grows, the sweep
panel collapses, and divergences appear. A divergent transition is the sampler
telling you that the numerical physics has stopped being credible.

Third, switch to **banana posterior**. The target is curved, but not terribly
pathological. HMC can follow the bend if the step size is not too ambitious.
Raise **Mass scale** and notice that the same momentum produces slower position
motion, so a formerly aggressive step can become tame.

Fourth, switch to **funnel neck**. This is the geometry that gives HMC its bad
days. In the wide part of the funnel, big moves are harmless. In the narrow
neck, the same step size can be too large by orders of magnitude. A single
global step size is now trying to satisfy incompatible local scales.

## The Two Knobs Are Really One Clock

The two obvious HMC tuning parameters are:

```text
epsilon = step size
L       = number of leapfrog steps
```

Their product is the integration time:

```text
trajectory length = epsilon * L
```

If the trajectory is too short, HMC degenerates toward local behavior. It may
have a beautiful acceptance rate and still crawl. If the trajectory is too long,
it can waste computation, loop back toward where it started, or accumulate
unnecessary numerical error.

Hoffman and Gelman's No-U-Turn Sampler was designed around this pain point:
HMC is sensitive to both step size and path length, so NUTS adaptively grows a
trajectory and stops when it begins to turn back on itself.[^nuts] This is not a
minor convenience. It is a recognition that "how long should I simulate the
physics?" is not an easy scalar question across a curved posterior.

In the lab, the step-size sweep is a crude version of what real software has to
learn. It is not enough to ask whether a proposal is accepted. You also care how
far accepted proposals move per gradient evaluation.

## Why Reversibility Is Not A Nicety

The Metropolis correction is not a forgiveness machine for arbitrary numerical
schemes.

For the usual HMC proposal, the deterministic map produced by the integrator
must be reversible and volume-preserving. Leapfrog has these properties. Forward
Euler does not. That is why the lab does not use Euler proposals for the
Metropolis audit; it uses Euler only as a warning.

The reverse-error metric checks the involution idea. Run the leapfrog trajectory
forward, flip the momentum, run the same number of steps again, and you should
come back to the starting position and opposite momentum. In the default case,
the error is around floating point roundoff.

This is not decorative physics. It is the algebra that lets a deterministic
trajectory become a valid Markov transition after an accept/reject step.

## Good Acceptance Can Still Be Bad Sampling

An HMC run with 99% acceptance can be excellent.

It can also be timid.

Acceptance measures energy error, not exploration. If `epsilon` is tiny and `L`
is small, almost every proposal is accepted because almost nothing happened.
This is why the lab reports expected jump alongside acceptance. In real
diagnostics you would look at effective sample size per gradient evaluation,
divergences, tree depth, R-hat across chains, energy diagnostics, and posterior
predictive checks.

Betancourt's conceptual introduction makes this broader point: HMC succeeds
when its simulated trajectories align with the geometry of the target, and it
fails when that geometry cannot be resolved by the chosen numerical
implementation.[^betancourt]

High acceptance is not a certificate of geometry.

## The Funnel Is Not Just Hard; It Is Inhomogeneous

The funnel target in the lab is a two-dimensional cartoon of a hierarchical
model:

```text
y controls the scale
x | y gets narrower as y decreases
```

In the neck, the curvature is high. In the mouth, the curvature is low. A
single Euclidean mass and a single global step size must serve both regions.
That is unfair.

This is why reparameterization can matter more than heroic tuning. A centered
hierarchical parameterization can create funnel geometry; a non-centered
parameterization may remove much of it. HMC is a powerful geometric sampler, but
it is still sampling the geometry you gave it.

If the geometry has cliffs, necks, ridges, or separated islands, the sampler
will report that through divergences, small step sizes, poor energy behavior, or
slow exploration.

The sampler is not being dramatic. It is reading the landscape.

## What HMC Does Not Buy

HMC buys long-distance proposals in differentiable continuous spaces.

It does not buy:

```text
discrete variables without extra machinery
easy jumps between isolated modes
immunity to bad parameterization
cheap gradients
automatic correctness under discontinuities
```

Duane, Kennedy, Pendleton, and Roweth introduced hybrid Monte Carlo in lattice
field theory, combining molecular-dynamics trajectories with a Monte Carlo
accept/reject step.[^duane] That ancestry is still visible. HMC is at its best
when gradients are meaningful and the posterior is a connected terrain that can
be traversed by dynamics.

When the target has isolated rooms separated by low-density walls, ordinary HMC
may still stay in one room. When the target has a funnel neck, ordinary HMC may
need a small step size set by the worst local curvature. When the log density is
not differentiable, the method loses the vector field it was built to follow.

Physics is not a free lunch. It is a better proposal language.

## The Metaphor I Trust

I like to think of HMC as a loan.

The sampler borrows momentum from a Gaussian bank, spends it moving through the
posterior, and then has to repay the Hamiltonian. If leapfrog keeps the books
nearly balanced, Metropolis signs off. If the numerical trajectory invents or
destroys too much energy, Metropolis rejects the loan.

That is why the energy plot matters more than the animation.

The path is pretty. The audit is the algorithm.

[^duane]: Simon Duane, A. D. Kennedy, Brian J. Pendleton, and Duncan Roweth, ["Hybrid Monte Carlo"](https://doi.org/10.1016/0370-2693(87)91197-X), *Physics Letters B* 195(2), 1987.

[^neal]: Radford M. Neal, ["MCMC Using Hamiltonian Dynamics"](https://www.dam.brown.edu/people/geman/Homepage/CV/HandbookChapter5.pdf), in *Handbook of Markov Chain Monte Carlo*, 2011.

[^betancourt]: Michael Betancourt, ["A Conceptual Introduction to Hamiltonian Monte Carlo"](https://arxiv.org/abs/1701.02434), 2017.

[^nuts]: Matthew D. Hoffman and Andrew Gelman, ["The No-U-Turn Sampler: Adaptively Setting Path Lengths in Hamiltonian Monte Carlo"](https://arxiv.org/abs/1111.4246), *Journal of Machine Learning Research* 15, 2014.
