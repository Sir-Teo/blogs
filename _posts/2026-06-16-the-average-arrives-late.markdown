---
layout: post
title: "The Average Arrives Late"
description: "Robbins-Monro stochastic approximation learns a root from noisy experiments. The step size has to keep moving long enough to find the target, then quiet down enough for averaging to matter."
date: 2026-06-16 22:06:00 -0400
categories: statistics
tags: [stochastic-approximation, robbins-monro, polyak-ruppert-averaging, stochastic-gradient-descent, online-learning, optimization, statistics]
excerpt: "A noisy iterate can keep wandering after it has learned the neighborhood of the answer. Polyak-Ruppert averaging asks the path, not the last point, what it knows."
---

The most useful estimator in an experiment is sometimes not the last estimate.

It is the average of the estimates after the experiment has stopped flailing.

That sentence sounds too plain to deserve a theory. Robbins and Monro made it
precise in 1951 by asking a small, stubborn question:

```text
how do you solve M(theta) = alpha
when M(theta) is only visible through noisy experiments?
```

No closed-form curve. No batch dataset. At each step you choose a point
$$\theta_n$$, observe a random response $$Y_n$$ whose expectation is
$$M(\theta_n)$$, and move again.[^robbins-monro]

The classical update is:

$$
\theta_{n+1}
  =
\theta_n - a_n\left(Y_n-\alpha\right).
$$

If the observed response is too often above the target, move down. If it is too
often below the target, move up. The algorithm is a thermostat for an unknown
regression curve.

The step sizes $$a_n$$ have to obey a peculiar contract:

$$
\sum_n a_n = \infty,
\qquad
\sum_n a_n^2 < \infty.
$$

The first condition says the algorithm never fully loses the ability to correct
a bad early guess. The second says the accumulated noise does not keep the
iterate shaking forever.

That contract is the whole mood of stochastic approximation.

## A Binary Experiment

The lab below hides a monotone response curve. The target response probability
is `65%`, and the true root is `0.350`. At each iteration the algorithm chooses
the current $$\theta$$, receives one or more Bernoulli responses, and applies a
Robbins-Monro update.

It also keeps a tail average of the iterates. This is the Polyak-Ruppert move:
let the noisy path search, then average the part of the path that is plausibly
near the root.[^ruppert][^polyak-juditsky]

With the default settings, across `80` deterministic replicas:

```text
raw final RMSE        0.0445
tail-averaged RMSE   0.0417
final step size      0.00565
```

That is deliberately not a miraculous difference. The point is subtler. The
last iterate is one noisy endpoint. The average is a low-pass report from the
late path.

<style>
  .sa-lab {
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

  .sa-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    margin-bottom: 1rem;
  }

  .sa-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .sa-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .sa-lab input {
    accent-color: #7c3aed;
    width: 100%;
  }

  .sa-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .sa-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .sa-lab__metric.good {
    border-color: #9ed8c5;
  }

  .sa-lab__metric.warn {
    border-color: #f2b8c4;
  }

  .sa-lab__metric span,
  .sa-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .sa-lab__metric span {
    display: block;
  }

  .sa-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .sa-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .sa-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="stochastic-approximation-lab" class="sa-lab" data-stochastic-approximation-lab>
  <div class="sa-lab__controls">
    <label>
      Steps: <output data-value="steps">1600</output>
      <input type="range" min="240" max="5000" step="40" value="1600" data-param="steps">
    </label>
    <label>
      Replicas: <output data-value="replicas">80</output>
      <input type="range" min="24" max="180" step="4" value="80" data-param="replicas">
    </label>
    <label>
      Target: <output data-value="target">65%</output>
      <input type="range" min="15" max="85" step="1" value="65" data-param="target">
    </label>
    <label>
      Curve slope: <output data-value="slope">1.40</output>
      <input type="range" min="40" max="320" step="5" value="140" data-param="slope">
    </label>
    <label>
      Start theta: <output data-value="start">-140</output>
      <input type="range" min="-260" max="260" step="5" value="-140" data-param="start">
    </label>
    <label>
      Gain: <output data-value="gain">0.80</output>
      <input type="range" min="5" max="220" step="5" value="80" data-param="gain">
    </label>
    <label>
      Delay: <output data-value="delay">25</output>
      <input type="range" min="1" max="240" step="1" value="25" data-param="delay">
    </label>
    <label>
      Exponent: <output data-value="exponent">0.67</output>
      <input type="range" min="35" max="125" step="1" value="67" data-param="exponent">
    </label>
    <label>
      Batch: <output data-value="batch">1</output>
      <input type="range" min="1" max="32" step="1" value="1" data-param="batch">
    </label>
    <label>
      Average starts: <output data-value="avgStart">35%</output>
      <input type="range" min="0" max="90" step="1" value="35" data-param="avgStart">
    </label>
    <label>
      Seed: <output data-value="seed">53</output>
      <input type="range" min="1" max="997" step="1" value="53" data-param="seed">
    </label>
  </div>
  <div class="sa-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="700" aria-label="Stochastic approximation lab showing hidden response curve, Robbins-Monro trajectory, averaged iterate error, step-size regime, and exponent sweep"></canvas>
  <p class="sa-lab__note">
    Deterministic browser experiment. The displayed curve is known to the lab
    for auditing, but the Robbins-Monro iterate only sees noisy Bernoulli
    responses at the current probe point.
  </p>
</div>
<script defer src="{{ '/assets/js/stochastic-approximation-lab.js?v=20260616a' | relative_url }}"></script>

Now try two small vandalism tests.

Set **Exponent** to `0.45`. The square-sum condition fails. The raw endpoint
keeps jittering; in the audited run the raw RMSE is `0.1095`, while the tail
average is `0.0416`.

Set **Exponent** to `1.15`. The total remaining movement becomes finite. The
algorithm stops correcting too soon; the raw RMSE is about `1.08`, and the
average cannot save it.

The average is not a cure for a broken step schedule. It is a way to spend the
noise left by a basically sane one.

## The Root Is Not Observed

The original Robbins-Monro paper framed the problem as an unknown monotone
regression function. The experimenter can prescribe levels, but only receives
random responses. Their motivating example was quantile-like response /
nonresponse data: choose a level, observe whether the random quantity fell below
it, then move the next level.[^robbins-monro]

That matters because the algorithm is not merely "SGD with old notation."

In a deterministic root finder, you might evaluate $$M(\theta)$$ directly. In a
batch estimator, you might collect a dataset and solve the estimating equation
afterward. Robbins-Monro instead changes the future data collection point using
the current noisy response.

The estimate is also an intervention.

Every point visited by the path is a small experimental design decision.

## The Step Size Has Two Jobs

A step schedule $$a_n=c(n+n_0)^{-\gamma}$$ has two visible jobs:

1. reach the neighborhood of the root;
2. keep late noise from dominating the report.

The famous condition

$$
\sum_n a_n = \infty,
\qquad
\sum_n a_n^2 < \infty
$$

turns into the rough exponent window:

```text
1/2 < gamma <= 1
```

But that window is asymptotic. The lab's `gamma=1.00` can still be poor at
finite time with the default gain and delay. It is technically in the window,
but the path has not been given enough effective movement from the chosen start.

This is why step-size folklore is dangerous. The theorem says what must happen
eventually under assumptions. A run still has a budget, an initial condition, a
local slope, observation noise, and a finite patience.

## Why Averaging Works

Polyak and Juditsky showed that averaging stochastic approximation trajectories
can achieve the best possible asymptotic convergence rate in broad classical
settings.[^polyak-juditsky] Ruppert's earlier technical report gave the same
statistical intuition from a slowly convergent Robbins-Monro process.[^ruppert]

The informal picture is simple.

The raw iterate has two late components:

```text
small bias from not being exactly at the root
fresh noise from the latest observations
```

Averaging many late iterates does not remove the systematic bias if the path is
still far away. But once the path is wandering around the target, the independent
parts of the noise begin to cancel.

That is why the average arrives late. Start averaging too early and you bake in
the approach path. Start too late and you throw away useful variance reduction.
Use a step size that dies too fast and both raw and averaged estimates inherit
the same missed correction.

The lab's **Average starts** control is a reminder that "average the iterates"
is still a design choice.

## SGD Is a Descendant, Not a Replacement

Modern stochastic gradient descent is one of the descendants of this idea.
Bottou, Curtis, and Nocedal describe large-scale machine learning as a setting
where stochastic gradient methods became central because exact deterministic
optimization steps are often too expensive or too tied to one finite
dataset.[^bottou]

But the Robbins-Monro lens keeps one fact bright:

```text
the stochastic step is an estimator before it is an optimizer
```

That framing changes the questions I would ask in a training run:

1. What estimating equation is the update trying to solve?
2. Is the step schedule still able to correct early bias?
3. Is the late noise being reported as if it were signal?
4. Would tail averaging, exponential moving averaging, or checkpoint averaging
   change the estimator being deployed?
5. Are we judging the endpoint, the average, or the best validation checkpoint?

Those are not the same object.

## A Receipt for Online Estimates

Before trusting an online stochastic estimate, I want a small receipt:

- the exact step-size schedule, including warmup, delay, and decay;
- the scale of the noisy observation used in the update;
- a path plot, not only the endpoint;
- a late-window average and the window used to compute it;
- a repeated-run error distribution under a known simulator or replay;
- a stress run where the step schedule fails.

The last item is important. A method that never shows how it fails is hard to
recognize in production.

Robbins-Monro is beautiful because it is not overconfident. It says:

```text
probe, move, shrink, average
```

The average is not more intelligent than the path.

It is just patient enough to ask the path what it kept seeing.

## Paper Trail

[^robbins-monro]: Herbert Robbins and Sutton Monro, ["A Stochastic Approximation Method"](https://projecteuclid.org/journals/annals-of-mathematical-statistics/volume-22/issue-3/A-Stochastic-Approximation-Method/10.1214/aoms/1177729586.short), *The Annals of Mathematical Statistics* 22(3), 1951. A readable PDF mirror is available from [Columbia](https://www.columbia.edu/~ww2040/8100F16/RM51.pdf).

[^ruppert]: David Ruppert, ["Efficient Estimations from a Slowly Convergent Robbins-Monro Process"](https://ecommons.cornell.edu/entities/publication/9a14790e-66a6-4460-9280-e9fb146fd02d), Cornell University Operations Research and Industrial Engineering Technical Report No. 781, 1988.

[^polyak-juditsky]: Boris T. Polyak and Anatoli B. Juditsky, ["Acceleration of Stochastic Approximation by Averaging"](https://epubs.siam.org/doi/10.1137/0330046), *SIAM Journal on Control and Optimization* 30(4), 1992.

[^bottou]: Leon Bottou, Frank E. Curtis, and Jorge Nocedal, ["Optimization Methods for Large-Scale Machine Learning"](https://arxiv.org/abs/1606.04838), *SIAM Review* 60(2), 2018.
