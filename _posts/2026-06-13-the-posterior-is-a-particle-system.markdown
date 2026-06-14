---
layout: post
title: "Sometimes the Posterior Needs a Crowd"
description: "Particle filters approximate a nonlinear, non-Gaussian filtering distribution with weighted samples. The hard part is not drawing samples; it is keeping them alive without lying to yourself."
date: 2026-06-13 18:10:00 -0400
categories: statistics
tags: [particle-filter, sequential-monte-carlo, nonlinear-filtering, bayesian-inference, state-space-models]
excerpt: "When the posterior is curved, multimodal, or sign-ambiguous, a mean and variance can be a bad summary. A particle filter keeps a moving crowd of weighted hypotheses instead."
---

The Kalman filter is a beautiful machine because it keeps only what the
linear-Gaussian world requires: a mean and a covariance.

But the world is often rude to that bargain.

A sensor may observe a square. A radar may see a bearing but not a range. A
financial time series may have jumps, heavy tails, and hidden regimes. A robot
may know that it is near a wall but not which side of a corridor it is on. In
those cases, the posterior is not politely summarized by one center and one
ellipse.

Sometimes the posterior has two hills. Sometimes it has a long tail. Sometimes
the mean points to a state that is plausible to nobody.

The particle filter starts from a more literal idea:

```text
carry many possible worlds forward
give each world a weight
kill, copy, and perturb them as evidence arrives
```

That sounds crude. It is crude. Its virtue is that the crudeness is explicit.
The posterior is represented by an empirical measure:

$$
p(x_t \mid y_{1:t})
\approx
\sum_{i=1}^N w_t^{(i)} \delta_{x_t^{(i)}}.
$$

The particles are locations. The weights say how much posterior mass each
location is carrying. The method is not trying to make the posterior Gaussian.
It is trying to keep enough weighted hypotheses alive that the posterior shape
can be approximated numerically.

## The Recursion Under the Crowd

In a hidden Markov model, the latent state evolves by:

$$
x_t \sim f(x_t \mid x_{t-1}),
$$

and observations arrive by:

$$
y_t \sim g(y_t \mid x_t).
$$

The exact Bayesian filter has two steps. Prediction:

$$
p(x_t \mid y_{1:t-1})
=
\int f(x_t \mid x_{t-1})p(x_{t-1}\mid y_{1:t-1})\,dx_{t-1}.
$$

Update:

$$
p(x_t \mid y_{1:t})
\propto
g(y_t \mid x_t)p(x_t \mid y_{1:t-1}).
$$

The equations are simple. The integral is the trap. In nonlinear or non-Gaussian
models, it usually has no convenient closed form.

The bootstrap particle filter, introduced by Gordon, Salmond, and Smith in
1993, replaces the density by samples: propagate particles through the transition
model, weight them by the observation likelihood, normalize, and resample when
the weights become too uneven.[^gordon] Kitagawa developed related Monte Carlo
filtering and smoothing methods for non-Gaussian nonlinear state-space
models.[^kitagawa] Liu and Chen later gave a broad sequential Monte Carlo
framework for dynamic systems.[^liu-chen]

The practical algorithm is almost embarrassingly short:

```text
for each new observation:
  propagate particles through the state dynamics
  compute likelihood weights under the observation model
  normalize weights
  estimate posterior summaries
  resample if the weights have collapsed
```

The embarrassment fades when the posterior is shaped like something a Gaussian
cannot draw.

## A Two-Signed Observation Lab

The lab below uses a standard nonlinear benchmark model:

$$
x_t
=
0.5x_{t-1}
+
\frac{25x_{t-1}}{1+x_{t-1}^2}
+
8\cos(1.2t)
+
q\epsilon_t,
$$

$$
y_t
=
\frac{x_t^2}{20}
+
r\eta_t.
$$

The observation sees roughly $$x_t^2$$, so it often cannot tell positive state
from negative state. A single observation can support two signs. That is the
point of the example: a line is not enough.

Try three moves:

1. set **Resample threshold** to zero and watch effective sample size collapse;
2. lower **Assumed observation noise** and see sharp likelihoods punish almost
   every particle;
3. move **Inspect time** to a moment where the orange observation roots split
   the posterior into two plausible regions.

<div id="particle-filter-lab" class="particle-filter-lab" data-particle-filter-lab>
  <div class="particle-filter-lab__controls">
    <label>
      Particles: <output data-value="particles">420</output>
      <input type="range" min="80" max="1200" step="20" value="420" data-param="particles">
    </label>
    <label>
      Process noise: <output data-value="processNoise">3.00</output>
      <input type="range" min="0.75" max="7.00" step="0.25" value="3.00" data-param="processNoise">
    </label>
    <label>
      Observation noise: <output data-value="observationNoise">1.20</output>
      <input type="range" min="0.35" max="5.00" step="0.05" value="1.20" data-param="observationNoise">
    </label>
    <label>
      Assumed observation noise: <output data-value="assumedObservationNoise">1.20</output>
      <input type="range" min="0.35" max="5.00" step="0.05" value="1.20" data-param="assumedObservationNoise">
    </label>
    <label>
      Resample threshold: <output data-value="resampleThreshold">30.0%</output>
      <input type="range" min="0" max="90" step="5" value="30" data-param="resampleThreshold">
    </label>
    <label>
      Inspect time: <output data-value="inspectTime">72</output>
      <input type="range" min="0" max="109" step="1" value="72" data-param="inspectTime">
    </label>
  </div>
  <div class="particle-filter-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Particle filter simulator showing latent state, particle posterior, effective sample size, resampling events, and filter diagnostics"></canvas>
  <div class="particle-filter-lab__legend">
    <span><i style="background:#0f766e"></i> True state</span>
    <span><i style="background:#2563eb"></i> Posterior mean</span>
    <span><i style="background:#dbeafe"></i> 80% particle band</span>
    <span><i style="background:#d97706"></i> Observation roots</span>
    <span><i style="background:#be123c"></i> Effective sample size</span>
    <span><i style="background:#7c3aed"></i> Resampling event</span>
  </div>
  <p class="particle-filter-lab__note">
    Deterministic synthetic experiment. The state transition and observation
    model are nonlinear. The filter uses the bootstrap proposal: particles are
    propagated through the transition model, weighted by the observation
    likelihood, and systematically resampled when ESS / N falls below the
    selected threshold.
  </p>
</div>
<script defer src="{{ '/assets/js/particle-filter-lab.js?v=20260613a' | relative_url }}"></script>

The orange dots in the state panel are the two signed roots implied by a positive
observation:

$$
x_t \approx \pm\sqrt{20y_t}.
$$

The observation model has thrown away the sign. The dynamics and the particle
history have to recover it. When the filter is uncertain, the particle posterior
can hold mass on both sides. When the data and dynamics agree, one side wins.

This is the first habit particle filters teach:

```text
do not ask only where the posterior center is
ask what shape of uncertainty the data created
```

## The ESS Alarm Bell

Importance weights decay unevenly. After a surprising observation, a few
particles may explain the data well while most explain it terribly. Then the
posterior approximation is formally made of many particles but practically made
of very few.

The usual diagnostic is effective sample size:

$$
\mathrm{ESS}
=
\frac{1}{\sum_i (w_t^{(i)})^2}.
$$

If all $$N$$ weights are equal, ESS is $$N$$. If one particle has nearly all the
weight, ESS is near one. The red panel shows ESS divided by $$N$$.

Set the resample threshold to zero. The filter stops copying high-weight
particles. The unique initial ancestry metric stays high, but this is a
technical victory with bad epistemology: most particles are alive only
nominally. They are not carrying posterior mass. The mean drifts because the
weighted representation has collapsed.

Raise the threshold. The filter resamples when ESS falls below the selected
fraction of $$N$$. Weight degeneracy improves. But resampling has its own cost:
it duplicates successful particles and deletes weak ones. After many rounds,
the final particles may descend from very few early ancestors. That is sample
impoverishment.

This is the central tension:

```text
without resampling: many dead weights
with too much resampling: many copied histories
```

Resampling is not a Bayesian update. It is a representation repair. It changes
the particle set so the next update is numerically usable, while trying to leave
the represented distribution unchanged.

## The Proposal Decides Where Hope Goes

The lab uses the bootstrap proposal:

$$
x_t^{(i)}
\sim
f(x_t \mid x_{t-1}^{(i)}).
$$

That is convenient because it samples from the transition model and then lets
the observation likelihood decide which particles mattered. It is also wasteful
when observations are informative. If the sensor likelihood is sharp, most
particles may be propagated to places the new observation immediately rejects.

Better proposals use the new observation when proposing particles. Auxiliary
particle filters, unscented particle filters, Rao-Blackwellized particle
filters, and many modern sequential Monte Carlo variants are answers to the
same complaint:

```text
do not spend particles where the next observation already says they are useless
```

Doucet, de Freitas, and Gordon's edited volume helped consolidate these methods
under the sequential Monte Carlo name.[^doucet-book] Arulampalam, Maskell,
Gordon, and Clapp's tutorial remains a practical entry point for online
nonlinear and non-Gaussian tracking.[^arulampalam] Doucet and Johansen later
gave a broader tutorial emphasizing particle filtering and smoothing as special
cases of a general SMC framework.[^doucet-johansen]

The important design question is not "particle filter or Kalman filter?" It is:

```text
what proposal distribution keeps posterior mass represented
at the computational budget I actually have?
```

## The Mean Can Point Nowhere

In the lab, the posterior mean is sometimes a useful estimate. It is also
sometimes a compromise between incompatible stories. If particles sit near
$$-8$$ and $$+8$$, the mean may sit near zero, where neither mode believes the
state is likely.

This is not a minor visualization issue. Downstream decisions often consume a
single number: estimated location, latent volatility, demand state, default
risk, hidden intent. If the posterior is multimodal, a single posterior mean can
send the decision maker into a region of low posterior density.

Particle filters let you ask better downstream questions:

- what is the probability the state is positive?
- what is the tail probability above a danger threshold?
- how much mass lies in each regime?
- what action minimizes posterior expected loss, not squared error by default?

The posterior representation is richer than the mean. Use it.

## Ways the Crowd Collapses

Particle filters do not defeat dimension. In high-dimensional state spaces, the
number of particles needed to represent the posterior can become brutal. This is
one reason naive particle filters struggle in weather models, large latent
factor systems, and many deep state-space models.

The likelihood can be too sharp. If observation noise is assumed too small, the
filter becomes overconfident and murders almost every particle at each step. In
the lab, lower **Assumed observation noise** and watch ESS fall.

The transition model can be wrong. A particle filter is not robust merely
because it uses samples. If the true state moves in ways the transition model
does not propose, the filter may never put particles where the posterior should
be.

Parameter learning is harder than state filtering. Filtering $$x_t$$ given known
parameters is already approximate. Learning static parameters online can suffer
from degeneracy because parameters do not naturally rejuvenate through the state
transition. Particle MCMC, SMC squared, iterated filtering, and related methods
exist because this problem is real.

Finally, resampling frequency is a policy. Too little resampling leaves dead
weights. Too much resampling loses diversity. Adding roughening noise, move
steps, better proposals, or analytic marginalization can help, but each fix is a
modeling choice, not a free lunch.

## Questions Before Trusting the Crowd

Before I trust a particle filter, I want to know:

- what state-space model generated the transition and observation densities;
- whether the proposal uses the latest observation or only the transition;
- how ESS behaves through time, not only the final RMSE;
- what resampling scheme is used and at what threshold;
- whether posterior intervals have empirical coverage in simulation;
- whether the posterior is multimodal and whether decisions use that fact;
- how many distinct ancestors survive after repeated resampling;
- whether the filter was tested under misspecified observation noise;
- how performance changes with particle count;
- whether high-dimensional structure was exploited rather than sampled blindly.

The particle filter is not magic dust sprinkled on nonlinear models. It is an
accounting system for uncertainty under simulation. Every particle is a claim
about where the hidden state could be. Every weight is a likelihood receipt.
Every resampling step is an admission that the receipts have become too uneven
to keep carrying forward.

The posterior is not always a bell curve. Sometimes it is a moving particle
system, and the most honest thing you can do is keep the particles visible.

## Primary Sources

[^gordon]: N. J. Gordon, D. J. Salmond, and A. F. M. Smith, ["Novel approach to nonlinear/non-Gaussian Bayesian state estimation"](https://doi.org/10.1049/ip-f-2.1993.0015), *IEE Proceedings F*, 1993.

[^kitagawa]: Genshiro Kitagawa, ["Monte Carlo Filter and Smoother for Non-Gaussian Nonlinear State Space Models"](https://doi.org/10.1080/10618600.1996.10474692), *Journal of Computational and Graphical Statistics*, 1996.

[^liu-chen]: Jun S. Liu and Rong Chen, ["Sequential Monte Carlo Methods for Dynamic Systems"](https://doi.org/10.1080/01621459.1998.10473765), *Journal of the American Statistical Association*, 1998.

[^doucet-book]: Arnaud Doucet, Nando de Freitas, and Neil Gordon, eds., [*Sequential Monte Carlo Methods in Practice*](https://link.springer.com/book/10.1007/978-1-4757-3437-9), Springer, 2001.

[^arulampalam]: M. Sanjeev Arulampalam, Simon Maskell, Neil Gordon, and Tim Clapp, ["A tutorial on particle filters for online nonlinear/non-Gaussian Bayesian tracking"](https://doi.org/10.1109/78.978374), *IEEE Transactions on Signal Processing*, 2002.

[^doucet-johansen]: Arnaud Doucet and Adam M. Johansen, ["A Tutorial on Particle Filtering and Smoothing: Fifteen Years Later"](https://web-static-aws.seas.harvard.edu/courses/cs281/papers/doucet-johansen.pdf), in *The Oxford Handbook of Nonlinear Filtering*, 2011. Repository metadata is also available through [Warwick WRAP](https://wrap.warwick.ac.uk/id/eprint/37961/).
