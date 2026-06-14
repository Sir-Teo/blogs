---
layout: post
title: "The Chain Remembers Where It Started"
description: "A Metropolis chain can accept most proposals and still fail to explore. Convergence is not a mood; it is a claim about what the chain has forgotten."
date: 2026-06-14 13:00:00 -0400
categories: statistics
tags: [mcmc, metropolis-hastings, markov-chains, bayesian-inference, diagnostics, monte-carlo]
excerpt: "Acceptance rate is not convergence. A chain can move almost every step, estimate the mean correctly by accident, and still remember which mode it started in."
---

Here is the trap:

```text
the sampler is moving
the acceptance rate is high
the estimate looks plausible
therefore the chain has converged
```

The first three lines can be true while the fourth is false.

Markov chain Monte Carlo is one of the stranger bargains in computational
statistics. Instead of drawing independent samples from a distribution, we build
a machine whose long-run behavior has that distribution as its equilibrium. The
machine is allowed to be dependent. It is allowed to hesitate. It is allowed to
walk through probability space one local proposal at a time.

But in exchange, it must forget.

It must forget its starting point, forget which side of a valley it began on,
forget the warm-up path, and settle into the stationary distribution we intended
to sample. A trace plot is not proof of that. Neither is an acceptance rate.
Neither, by itself, is a pretty posterior mean.

The Metropolis paper began with statistical mechanics: use a modified Monte
Carlo procedure to sample configurations of interacting particles, accepting
moves according to their relative Boltzmann weight.[^metropolis] Hastings
generalized the construction into the Metropolis-Hastings recipe: propose a new
state, correct for the proposal asymmetry, and keep the desired target
distribution stationary.[^hastings]

That stationary word is doing heavy work. It says what happens after the chain
has had enough time. It does not tell you that your finite run has had enough
time.

## A Chain Memory Lab

The lab below samples from a two-dimensional mixture with two symmetric modes.
The exact target mean of the `x` coordinate is zero. That makes the default
run slightly nasty: two chains start on the left, two chains start on the right,
none of them cross the valley, and the pooled mean looks almost perfect anyway.

The diagnostics tell different stories:

- **acceptance** says how often proposals are kept;
- **R-hat** compares between-chain and within-chain variation;
- **ESS / kept** estimates how many independent draws the correlated output is
  worth for the `x` coordinate;
- **mode balance** asks whether retained samples visit the two modes in the
  target's 50/50 proportion;
- **mode switches** counts whether chains actually cross the low-density gap.

<style>
  .mcmc-lab {
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

  .mcmc-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  }

  .mcmc-lab__controls label,
  .mcmc-lab__metric span,
  .mcmc-lab__note,
  .mcmc-lab__legend {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .mcmc-lab__controls label {
    display: grid;
    font-weight: 650;
    gap: 0.35rem;
    min-width: 0;
  }

  .mcmc-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .mcmc-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .mcmc-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .mcmc-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .mcmc-lab__metric span {
    display: block;
  }

  .mcmc-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .mcmc-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 860px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .mcmc-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .mcmc-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .mcmc-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .mcmc-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .mcmc-lab {
      padding: 0.82rem;
    }

    .mcmc-lab__controls,
    .mcmc-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .mcmc-lab canvas {
      height: 1120px;
    }
  }
</style>

<div class="mcmc-lab" data-mcmc-memory-lab>
  <div class="mcmc-lab__controls">
    <label>
      Proposal step <output data-value="proposal">0.35</output>
      <input type="range" min="5" max="320" step="5" value="35" data-param="proposal">
    </label>
    <label>
      Mode gap <output data-value="gap">3.8</output>
      <input type="range" min="0" max="60" step="1" value="38" data-param="gap">
    </label>
    <label>
      Correlation <output data-value="correlation">40%</output>
      <input type="range" min="0" max="90" step="1" value="40" data-param="correlation">
    </label>
    <label>
      Steps <output data-value="steps">2200</output>
      <input type="range" min="600" max="6000" step="100" value="2200" data-param="steps">
    </label>
    <label>
      Burn-in <output data-value="burn">30%</output>
      <input type="range" min="0" max="70" step="5" value="30" data-param="burn">
    </label>
    <label>
      Chains <output data-value="chains">4</output>
      <input type="range" min="2" max="6" step="1" value="4" data-param="chains">
    </label>
    <label>
      Seed <output data-value="seed">29</output>
      <input type="range" min="1" max="999" step="1" value="29" data-param="seed">
    </label>
  </div>

  <div class="mcmc-lab__metrics" data-mcmc-metrics></div>
  <canvas aria-label="Metropolis-Hastings convergence diagnostic lab"></canvas>
  <div class="mcmc-lab__legend">
    <span><i style="background:#2563eb"></i>chain 1</span>
    <span><i style="background:#b45309"></i>chain 2</span>
    <span><i style="background:#7c3aed"></i>chain 3</span>
    <span><i style="background:#0f766e"></i>chain 4</span>
  </div>
  <p class="mcmc-lab__note">The target is a symmetric two-component Gaussian mixture. The proposal is an isotropic random-walk Metropolis proposal, so the acceptance probability is min(1, pi(new) / pi(old)).</p>
</div>

<script defer src="{{ '/assets/js/mcmc-memory-lab.js?v=20260614a' | relative_url }}"></script>

The default run is not subtle:

```text
acceptance: about 70%
R-hat: about 6.44
ESS / kept: about 3.5%
mode switches: 0
pooled mean error: about 0.01
```

That last line is the bait. The target mean is zero and the pooled estimate is
near zero, but only because the chains are stuck symmetrically. Two chains
remember "left." Two chains remember "right." The average has forgotten nothing;
it has merely cancelled two failures.

## Acceptance Is a Throughput Counter

For a symmetric random-walk proposal, the Metropolis-Hastings rule accepts a
proposed state `y` from current state `x` with probability

```text
min(1, pi(y) / pi(x)).
```

That rule is designed to make the target distribution stationary. It is not a
certificate that the proposal scale is useful.

Roberts and Rosenthal give the clean one-dimensional intuition. If the proposal
variance is extremely small, nearly every move is accepted, but the chain
crawls. If it is extremely large, most proposals land in low-density regions and
get rejected, so the chain stays fixed for long stretches.[^roberts-rosenthal]

The lab lets you reproduce both failures. Pull **Proposal step** toward `0.10`.
The acceptance rate climbs. The chain does not become more independent. The
autocorrelation plot is the receipt. Push the step past `2.40`. The chain can
sometimes jump modes, but now the accepted sample is sparse and sticky for a
different reason.

The famous `0.234` acceptance result for high-dimensional random-walk
Metropolis is useful precisely because it is a theorem with conditions, not a
superstition. Roberts, Gelman, and Gilks derived it for a high-dimensional
asymptotic setting; Roberts and Rosenthal review the broader scaling picture
and note different targets for different algorithms, such as MALA.[^roberts-rosenthal]
In this two-dimensional mixture lab, chasing `0.234` is not the point. The point
is to see why acceptance alone is a weak diagnostic.

## R-hat Asks Whether Chains Disagree

Gelman and Rubin's multiple-sequence idea is beautifully practical: start
several chains from overdispersed points and compare variation between chains
to variation within chains.[^gelman-rubin] If each chain has explored the same
target, between-chain disagreement should not dominate.

That is why the default lab is so damning. The chains are individually busy
inside their local modes, but their local worlds disagree. Within a mode, `x`
wiggles. Across modes, the chain means are far apart. R-hat notices.

R-hat is not omniscient. If every chain starts in the same wrong mode, R-hat can
look too friendly. If modes are visited rarely but synchronously, a finite run
can still fool you. But it asks a better question than "did the chain move?"

It asks:

```text
would I believe these chains came from the same settled distribution?
```

## ESS Prices Dependence

Monte Carlo error gets cheap when samples are independent. MCMC samples are not.
Effective sample size is an attempt to price that dependence for a chosen
quantity.

The lab reports ESS for the `x` coordinate. When the proposal step is tiny, the
chain creates a long sequence of almost-duplicates. The retained sample count
can be thousands while the effective count is a small fraction of that. This is
why a thick trace can be false comfort. More rows in the CSV are not the same
as more information.

Roberts and Rosenthal describe efficiency through integrated autocorrelation
time: autocorrelation inflates the variance of Monte Carlo estimates.[^roberts-rosenthal]
The lab's autocorrelation panel is the visual version. Bars that decay slowly
mean the chain is still carrying yesterday's state around.

## The Valley Is a Geometry Problem

The hard part of the default target is not the Gaussian shape inside each mode.
It is the low-density gap between modes. A local random walk proposes nearby
points. To cross the valley, it must either step into a bad region and survive
the acceptance test, or propose a large jump that lands near the other mode.
Both are unlikely under many proposal scales.

This is one reason Hamiltonian Monte Carlo became so important for continuous
Bayesian computation. Neal describes HMC as using auxiliary momentum and
Hamiltonian dynamics to propose distant states that can still have high
acceptance, avoiding the diffusive behavior of simple random walks.[^neal]
HMC is not a magic answer to isolated modes; Neal explicitly notes tempering as
useful when multiple isolated modes exist. But the conceptual contrast is
valuable: good proposals use geometry. Bad proposals ask a random walk to do a
commute.

## A Short Checklist I Trust More Than Vibes

For a serious posterior, I want at least this much evidence:

1. several chains from dispersed starts;
2. trace plots for parameters and transformed quantities that matter;
3. R-hat close to 1 for those quantities, not only for easy marginals;
4. ESS large enough for the decisions I plan to make;
5. posterior predictive or problem-specific checks, because convergence to the
   wrong model is still wrong;
6. stress runs that change initialization, parameterization, and tuning.

The point is not to worship diagnostics. Diagnostics are lossy instruments.
They compress chain behavior into numbers. But they are better than a single
acceptance rate, and much better than a hopeful glance at a plausible mean.

MCMC does not fail only by standing still. Sometimes it moves beautifully inside
the wrong room.

[^metropolis]: Nicholas Metropolis, Arianna W. Rosenbluth, Marshall N. Rosenbluth, Augusta H. Teller, and Edward Teller, ["Equation of State Calculations by Fast Computing Machines"](https://bayes.wustl.edu/Manual/EquationOfState.pdf), Journal of Chemical Physics, 1953.

[^hastings]: W. K. Hastings, ["Monte Carlo Sampling Methods Using Markov Chains and Their Applications"](https://www2.stat.duke.edu/~scs/Courses/Stat376/Papers/Basic/Hastings1970.pdf), Biometrika, 1970.

[^gelman-rubin]: Andrew Gelman and Donald B. Rubin, ["Inference from Iterative Simulation Using Multiple Sequences"](https://sites.stat.columbia.edu/gelman/research/published/itsim.pdf), Statistical Science, 1992.

[^roberts-rosenthal]: Gareth O. Roberts and Jeffrey S. Rosenthal, ["Optimal Scaling for Various Metropolis-Hastings Algorithms"](https://www.math.pku.edu.cn/teachers/xirb/Courses/QR2013/ReadingForFinal/MCMC/euclid.ss.1015346320.pdf), Statistical Science, 2001.

[^neal]: Radford M. Neal, ["MCMC Using Hamiltonian Dynamics"](https://www.dam.brown.edu/people/geman/Homepage/CV/HandbookChapter5.pdf), in Handbook of Markov Chain Monte Carlo, 2011.
