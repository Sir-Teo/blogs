---
layout: post
title: "The Baseline Is a Control Variate"
description: "In policy gradients, a baseline is allowed because the score has zero mean. The best baseline is not always the average reward."
date: 2026-06-15 12:15:00 -0400
categories: machine-learning
tags: [reinforcement-learning, policy-gradients, reinforce, control-variates, variance-reduction, score-function-estimator]
excerpt: "Subtracting a baseline from REINFORCE does not change the expected gradient. It changes the estimator's weather."
---

There is a strange little subtraction in policy-gradient code:

```text
gradient estimate = (return - baseline) * grad_log_probability
```

It looks like bookkeeping. It is not.

The baseline is one of the few places where reinforcement learning lets you
change the learning signal without changing the expected gradient. Pick it well
and the estimator calms down. Pick it lazily and the update is still unbiased,
but you may spend most of your samples paying for avoidable variance.

The usual explanation is:

```text
subtract the value function so actions get advantage, not return
```

That is a good operational slogan. It is not the primitive reason the trick
works. The primitive reason is smaller:

```text
the score has expectation zero.
```

That sentence is the hinge between REINFORCE, score-function estimators,
control variates, actor-critic methods, and a surprising fact from Greensmith,
Bartlett, and Baxter: the average-reward baseline can be suboptimal.[^greensmith]

## The Zero-Mean Handle

Let $$X \sim p_\theta$$ and suppose we want the gradient of an expectation

$$
J(\theta) = E_{p_\theta}[f(X)].
$$

The score-function identity writes this as

$$
\nabla_\theta J(\theta)
= E_{p_\theta}\left[f(X)\nabla_\theta \log p_\theta(X)\right].
$$

This estimator is old enough to have several names: likelihood-ratio gradient,
score-function estimator, and, in reinforcement learning, REINFORCE.[^williams]
Sutton, McAllester, Singh, and Mansour later put the policy itself at the center
of the reinforcement-learning objective, updating explicit stochastic policies
in the direction of expected reward.[^sutton-policy]

Now use the one fact that makes the baseline legal:

$$
E_{p_\theta}\left[\nabla_\theta \log p_\theta(X)\right]
= \nabla_\theta \int p_\theta(x)\,dx
= \nabla_\theta 1
= 0.
$$

So for any constant $$b$$ that does not depend on the sampled action,

$$
E\left[(f(X)-b)\nabla_\theta \log p_\theta(X)\right]
= \nabla_\theta J(\theta).
$$

The baseline is not a correction to the target. It is a zero-mean term inserted
to reduce variance. Mohamed, Rosca, Figurnov, and Mnih's review makes the same
point in general Monte Carlo-gradient language: a baseline keeps the estimator
unbiased because the added score term has zero expectation, and is preferred
because it can reduce variance.[^mc-gradients]

The control-variate question is not:

```text
Which baseline sounds like value?
```

It is:

```text
Which zero-mean subtraction is most correlated with the noise I want gone?
```

## A One-Logit Bandit

Here is the smallest world where the distinction bites.

There are two actions. Action `0` pays mean $$\mu_0$$. Action `1` pays mean
$$\mu_1$$. A one-parameter stochastic policy chooses action `1` with probability

$$
p = \sigma(\theta).
$$

For a sampled action $$A \in \{0,1\}$$, the score is

$$
\nabla_\theta \log \pi_\theta(A) = A - p.
$$

The expected reward is

$$
J(\theta) = (1-p)\mu_0 + p\mu_1,
$$

and the exact gradient is

$$
\nabla_\theta J(\theta)
= p(1-p)(\mu_1-\mu_0).
$$

The REINFORCE estimator with baseline $$b$$ is

$$
g_b = (R-b)(A-p).
$$

Every constant $$b$$ gives the same expectation. Not every constant gives the
same variance.

For this one-parameter bandit, the variance-minimizing constant baseline is

$$
b^* =
\frac{E[R(A-p)^2]}{E[(A-p)^2]}
= (1-p)\mu_1 + p\mu_0.
$$

That is not the average reward

$$
J = (1-p)\mu_0 + p\mu_1.
$$

The weights are flipped.

Why? Because the rare action carries a larger score when it appears. If the
better action has probability `12%`, then a better-action sample has score
`0.88`, while a common-action sample has score `-0.12`. Variance cares about
score squared, so the rare action gets much more leverage in the optimal
baseline.

The value-like baseline is still unbiased. It is just not the variance optimum.

## Baseline Lab

The lab below uses that one-logit bandit. The default policy chooses the better
action with probability `12%`. The common action has mean reward `6.00`; the
better action has mean reward `8.00`; reward noise has standard deviation
`0.60`; each displayed gradient estimate averages a batch of `80` samples.

Default exact facts:

- true gradient: `0.2112`;
- average-reward baseline: `6.24`;
- score-weighted optimal baseline: `7.76`;
- no-baseline batch variance: `0.079962`;
- average-baseline batch variance: `0.003525`;
- optimal-baseline batch variance: `0.000475`;
- optimal baseline cuts batch variance by `99.4%` versus no baseline;
- the average-reward baseline is `7.4x` noisier than the optimal constant
  baseline in this default setting;
- audit grid: `8 / 8` exact configurations passed.

The left panel samples many batch gradients. The middle panel sweeps the
baseline value and plots exact estimator variance. The right panel runs a small
policy-gradient loop so you can see how estimator noise turns into policy
motion.

<style>
  .pg-baseline-lab {
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

  .pg-baseline-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  }

  .pg-baseline-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .pg-baseline-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .pg-baseline-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .pg-baseline-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0;
  }

  .pg-baseline-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .pg-baseline-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .pg-baseline-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.18;
    overflow-wrap: anywhere;
  }

  .pg-baseline-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .pg-baseline-lab__legend,
  .pg-baseline-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .pg-baseline-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .pg-baseline-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    margin-right: 0.35rem;
    vertical-align: -0.06rem;
    width: 0.7rem;
  }

  .pg-baseline-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 680px) {
    .pg-baseline-lab {
      padding: 0.82rem;
    }

    .pg-baseline-lab__controls,
    .pg-baseline-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>

<div class="pg-baseline-lab" data-pg-baseline-lab>
  <div class="pg-baseline-lab__controls">
    <label>
      Better action probability <output data-value="prob">12%</output>
      <input type="range" data-param="prob" min="5" max="95" step="1" value="12" aria-label="Better action probability">
    </label>
    <label>
      Reward offset <output data-value="offset">6.00</output>
      <input type="range" data-param="offset" min="0" max="1200" step="25" value="600" aria-label="Reward offset">
    </label>
    <label>
      Reward gap <output data-value="gap">2.00</output>
      <input type="range" data-param="gap" min="20" max="500" step="10" value="200" aria-label="Reward gap">
    </label>
    <label>
      Reward noise <output data-value="noise">0.60</output>
      <input type="range" data-param="noise" min="0" max="250" step="5" value="60" aria-label="Reward noise">
    </label>
    <label>
      Batch size <output data-value="batch">80</output>
      <input type="range" data-param="batch" min="20" max="300" step="10" value="80" aria-label="Batch size">
    </label>
    <label>
      Learning rate <output data-value="lr">0.08</output>
      <input type="range" data-param="lr" min="1" max="25" step="1" value="8" aria-label="Learning rate">
    </label>
    <label>
      Updates <output data-value="updates">90</output>
      <input type="range" data-param="updates" min="20" max="180" step="10" value="90" aria-label="Updates">
    </label>
    <label>
      Seed <output data-value="seed">43</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="43" aria-label="Random seed">
    </label>
  </div>
  <div class="pg-baseline-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Policy gradient baseline lab showing batch gradient estimates, baseline variance curve, and learning trajectories"></canvas>
  <div class="pg-baseline-lab__legend">
    <span><i style="background:#be123c"></i> no baseline</span>
    <span><i style="background:#7c3aed"></i> average reward</span>
    <span><i style="background:#0f766e"></i> score-weighted baseline</span>
    <span><i style="background:#2563eb"></i> true gradient</span>
    <span><i style="background:#d97706"></i> exact variance curve</span>
  </div>
  <p class="pg-baseline-lab__note">
    Deterministic one-logit Bernoulli bandit. The audit checks finite-difference
    gradients, exact unbiasedness for several baselines, optimal-baseline
    variance minimization, reward-offset invariance after optimal centering, and
    finite learning trajectories across 8 parameter settings.
  </p>
</div>
<script defer src="{{ '/assets/js/policy-gradient-baseline-lab.js?v=20260615a' | relative_url }}"></script>

Move **Reward offset** upward. The no-baseline estimator gets worse because it
multiplies the score by a large constant reward. The optimal centered estimator
barely cares. A constant added to all rewards should not change the decision
problem, and a good baseline makes the gradient estimator act like it knows
that.

Move **Better action probability** toward `50%`. The average baseline and
score-weighted baseline meet. At `50%`, both actions have the same score
magnitude, so ordinary reward averaging and score-squared weighting agree.

Move **Better action probability** toward an edge. The optimal baseline drifts
toward the rare action's reward, because rare actions carry large score
magnitude when they appear.

## Why This Matters More Than the Toy

The bandit formula is scalar, but the warning generalizes.

In a real policy-gradient system, the term multiplying the return is not one
number. It is a vector of log-probability derivatives across actions, states,
tokens, tools, or continuous control dimensions. The variance-minimizing
baseline is therefore not simply "the expected return" in the abstract. It is
the part of the return that best cancels the score-weighted noise you are
actually injecting into the parameter update.

Greensmith, Bartlett, and Baxter analyze this in the broader GPOMDP setting and
show that both baselines and actor-critic methods can be understood as additive
control variates. They also show something that should stay mildly
uncomfortable: using the average reward as a baseline can be suboptimal, and
using the true value function as a critic can be suboptimal for variance in
general.[^greensmith]

That does not mean value functions are bad. It means their job in policy
gradients is not metaphysical truth. Their job is variance reduction without
biasing the gradient you meant to estimate.

The practical questions become sharper:

1. Is the baseline independent of the sampled action at the point where it is
   subtracted?
2. Does it remove reward offsets that should not affect learning?
3. Does it track the score-weighted variance of the actual estimator, not only
   the mean return?
4. Is the variance reduction measured, or merely hoped for?

The last one is the habit I like most. When using a control variate, log the
gradient variance you would have had without it. A baseline that looks elegant
but does not reduce update noise is just an unbiased ornament.

## The Mental Model

A policy-gradient sample has two pieces:

```text
how surprising was the action under the policy?
how good was the outcome?
```

The score answers the first question. The return answers the second.

The baseline is allowed because it only subtracts something from the second
piece that the first piece will average back to zero. It is useful when that
subtraction removes outcome variation that was never informative about the
direction of improvement.

That is the small, durable idea:

```text
do not make the score carry reward scale it cannot learn from.
```

REINFORCE is often introduced as the simple, high-variance ancestor of modern
policy optimization. Fair. But the baseline trick is not an old footnote. It is
the cleanest place to see what policy-gradient learning is doing: building a
usable signal by subtracting everything the score can legally ignore.

[^williams]: Ronald J. Williams, ["Simple statistical gradient-following algorithms for connectionist reinforcement learning"](https://doi.org/10.1007/BF00992696), *Machine Learning* 8:229-256, 1992.
[^sutton-policy]: Richard S. Sutton, David McAllester, Satinder Singh, and Yishay Mansour, ["Policy Gradient Methods for Reinforcement Learning with Function Approximation"](https://papers.nips.cc/paper/1713-policy-gradient-methods-for-reinforcement-learning-with-function-approximation), NeurIPS 1999.
[^greensmith]: Evan Greensmith, Peter L. Bartlett, and Jonathan Baxter, ["Variance Reduction Techniques for Gradient Estimates in Reinforcement Learning"](https://www.jmlr.org/papers/v5/greensmith04a.html), *Journal of Machine Learning Research* 5:1471-1530, 2004.
[^mc-gradients]: Shakir Mohamed, Mihaela Rosca, Michael Figurnov, and Andriy Mnih, ["Monte Carlo Gradient Estimation in Machine Learning"](https://jmlr.org/papers/v21/19-346.html), *Journal of Machine Learning Research* 21(132):1-62, 2020.
