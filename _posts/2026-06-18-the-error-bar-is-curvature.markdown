---
layout: post
title: "The Error Bar Is Curvature"
description: "Fisher information turns local likelihood curvature into a lower bound on estimator variance. The Cramer-Rao bound is a geometry statement before it is a table formula."
date: 2026-06-18 00:10:00 -0400
categories: statistics
tags: [fisher-information, cramer-rao-bound, maximum-likelihood, estimation, likelihood, statistics]
excerpt: "A sharp likelihood peak is not just visually convincing. Under regularity conditions, its curvature is the local precision budget an unbiased estimator cannot beat."
---

A likelihood curve can look like a hill.

That picture is useful, but slightly backwards. For estimation, the important
part is not the hilltop. It is how fast the hill falls away from the top.

Flat hill:

```text
many nearby parameter values explain the data about equally well
```

Sharp hill:

```text
nearby parameter values stop explaining the data quickly
```

Fisher information is the local spring constant of that second picture. The
Cramer-Rao bound says that, under the usual regularity conditions, an unbiased
estimator cannot have variance smaller than the reciprocal of that information.

So the slogan is:

```text
curvature buys precision
```

But only locally, only under the model, and only with the assumptions visible.

## The Score Is the Local Witness

Let $$X \sim p_\theta(x)$$ and write the log-likelihood for one observation as:

$$
\ell(\theta;X) = \log p_\theta(X).
$$

The **score** is the derivative:

$$
S_\theta(X) = \frac{\partial}{\partial \theta}\ell(\theta;X).
$$

When differentiation and integration can be exchanged, the score has mean zero:

$$
\mathbb{E}_\theta[S_\theta(X)] = 0.
$$

Fisher information is the score variance:

$$
I(\theta) = \mathbb{E}_\theta[S_\theta(X)^2].
$$

Equivalently, in regular cases, it is the negative expected second derivative
of the log-likelihood:

$$
I(\theta)
=
-\mathbb{E}_\theta
\left[
\frac{\partial^2}{\partial\theta^2}
\ell(\theta;X)
\right].
$$

The first form says information is how violently the log-likelihood changes
under the true parameter. The second says information is expected curvature.

R. A. Fisher's 1922 paper made maximum likelihood and information central tools
for theoretical statistics.[^fisher] C. R. Rao's 1945 paper gave the inequality
that now carries both Cramer and Rao's names in much of the literature.[^rao]
The modern name also honors Harald Cramer, whose 1946 text developed the same
lower-bound idea in the asymptotic estimation program.[^cramer]

The history matters less here than the mechanism. The bound is not magic. It is
Cauchy-Schwarz.

## The Bound Is a Covariance Argument

Suppose $$T(X)$$ is an unbiased estimator of $$\theta$$:

$$
\mathbb{E}_\theta[T(X)] = \theta.
$$

Differentiate both sides with respect to $$\theta$$:

$$
\frac{\partial}{\partial\theta}
\mathbb{E}_\theta[T(X)]
= 1.
$$

Under the same regularity assumptions, the derivative can move inside the
integral:

$$
1
=
\int T(x)\frac{\partial}{\partial\theta}p_\theta(x)\,dx
=
\int T(x)S_\theta(x)p_\theta(x)\,dx
=
\mathbb{E}_\theta[T(X)S_\theta(X)].
$$

Because the score has mean zero, this is a covariance:

$$
1 = \mathrm{Cov}_\theta(T,S_\theta).
$$

Now apply Cauchy-Schwarz:

$$
1^2
\le
\mathrm{Var}_\theta(T)
\mathrm{Var}_\theta(S_\theta)
=
\mathrm{Var}_\theta(T) I(\theta).
$$

Therefore:

$$
\mathrm{Var}_\theta(T)
\ge
\frac{1}{I(\theta)}.
$$

For $$n$$ independent observations, information adds:

$$
I_n(\theta) = n I_1(\theta),
$$

so the bound shrinks like:

$$
\frac{1}{I_n(\theta)}.
$$

That is the clean version. The fine print is also part of the theorem: the
support should not move with $$\theta$$ in a troublesome way, derivatives and
integrals need to commute, the estimator is assumed unbiased, and boundary
cases require care. Biased estimators have a modified bound. Misspecified
models need a sandwich-style correction, not blind curvature worship.

## Two Models Where the Bound Is Met

The lab below uses two intentionally friendly estimation problems.

**Normal mean, known variance.**

If $$X_i \sim N(\mu,\sigma^2)$$ and $$\sigma$$ is known, then:

$$
I_n(\mu) = \frac{n}{\sigma^2}.
$$

The sample mean is unbiased and has:

$$
\mathrm{Var}(\bar{X})
=
\frac{\sigma^2}{n}
=
\frac{1}{I_n(\mu)}.
$$

It reaches the Cramer-Rao bound exactly.

**Bernoulli probability.**

If $$X_i \sim \mathrm{Bernoulli}(p)$$, then:

$$
I_n(p) = \frac{n}{p(1-p)}.
$$

The sample proportion is unbiased and has:

$$
\mathrm{Var}(\hat{p})
=
\frac{p(1-p)}{n}
=
\frac{1}{I_n(p)}.
$$

This also reaches the bound. That does not mean every problem is so polite. It
means these two examples are good rulers for checking whether the lab's
curvature, score variance, and estimator variance are speaking the same
language.

<style>
  .fisher-lab {
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

  .fisher-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    margin-bottom: 1rem;
  }

  .fisher-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .fisher-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .fisher-lab input,
  .fisher-lab select {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .fisher-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .fisher-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 0.9rem;
  }

  .fisher-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .fisher-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.36);
  }

  .fisher-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.36);
  }

  .fisher-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.36);
  }

  .fisher-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 740;
    letter-spacing: 0;
    line-height: 1.18;
    margin-bottom: 0.22rem;
    text-transform: uppercase;
  }

  .fisher-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.78rem, 2.2vw, 1rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .fisher-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .fisher-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="fisher-lab" data-fisher-lab>
  <div class="fisher-lab__controls">
    <label>
      Model
      <select data-param="model" aria-label="Statistical model">
        <option value="normal" selected>Normal mean, known sigma</option>
        <option value="bernoulli">Bernoulli probability</option>
      </select>
    </label>
    <label>
      Sample size
      <output data-value="sampleSize">80</output>
      <input type="range" min="5" max="500" step="5" value="80" data-param="sampleSize">
    </label>
    <label>
      Monte Carlo experiments
      <output data-value="experiments">1600</output>
      <input type="range" min="200" max="5000" step="100" value="1600" data-param="experiments">
    </label>
    <label>
      Normal mean
      <output data-value="mu">0.40</output>
      <input type="range" min="-2" max="2" step="0.05" value="0.4" data-param="mu">
    </label>
    <label>
      Normal sigma
      <output data-value="sigma">1.30</output>
      <input type="range" min="0.25" max="3" step="0.05" value="1.3" data-param="sigma">
    </label>
    <label>
      Bernoulli p
      <output data-value="probability">0.35</output>
      <input type="range" min="0.03" max="0.97" step="0.01" value="0.35" data-param="probability">
    </label>
    <label>
      Random seed
      <output data-value="seed">17</output>
      <input type="range" min="1" max="9999" step="1" value="17" data-param="seed">
    </label>
  </div>
  <div class="fisher-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Interactive Fisher information and Cramer-Rao bound lab"></canvas>
  <p class="fisher-lab__note" data-note></p>
</div>

<script src="{{ '/assets/js/fisher-information-lab.js?v=20260618a' | relative_url }}"></script>

## What the Lab Measures

For the default normal-mean setting:

```text
n = 80
sigma = 1.30
Fisher information = 80 / 1.30^2 = 47.3373
CRLB = 1 / I = 0.021125
Monte Carlo estimator variance = 0.021673
variance / bound = 1.026
```

The empirical variance is not exactly the bound because the lab runs a finite
Monte Carlo experiment. The theoretical variance of the sample mean is exactly
the bound. The simulation is there to check the mechanism, not to prove the
theorem by dice.

The score panel checks the companion identity:

$$
\mathrm{Var}_\theta(S_\theta) = I(\theta).
$$

In the default run, score variance divided by information is also `1.026`,
because for the normal mean the score is a scaled version of the sample mean.

## Reproducibility Check

The browser lab is backed by a CommonJS module:

```js
const lab = require("./assets/js/fisher-information-lab.js");

console.table(lab.auditGrid().map((row) => ({
  model: row.params.model,
  n: row.params.sampleSize,
  fisher: row.fisher.toFixed(4),
  crlb: row.crlb.toFixed(6),
  empiricalVariance: row.estimateVariance.toFixed(6),
  varianceRatio: row.varianceRatio.toFixed(3),
  scoreRatio: row.scoreRatio.toFixed(3),
  passed: row.passed
})));
```

The current audit cases are:

| Model | n | Fisher I | CRLB | Empirical variance | Var / bound | Score var / I |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| normal | 80 | 47.3373 | 0.021125 | 0.021673 | 1.026 | 1.026 |
| normal | 25 | 5.1653 | 0.193600 | 0.198498 | 1.025 | 1.025 |
| normal | 220 | 448.9796 | 0.002227 | 0.002288 | 1.027 | 1.027 |
| bernoulli | 60 | 263.7363 | 0.003792 | 0.003795 | 1.001 | 1.001 |
| bernoulli | 180 | 892.8571 | 0.001120 | 0.001037 | 0.926 | 0.926 |

Each row is deterministic for its seed. The audit allows Monte Carlo error but
requires positive information, reciprocal CRLB, small bias, score mean near
zero, score variance near information, and estimator variance near the bound.

## What Curvature Does Not Promise

Curvature is local. It tells you what happens near the parameter value under
the model. It does not promise that the likelihood is globally single-peaked,
that the model is correct, that the estimator is unbiased, or that finite-sample
approximations behave well near boundaries.

It is also coordinate-sensitive in the ordinary scalar form. Reparameterize
from $$p$$ to $$\phi=\log(p/(1-p))$$ and the numeric information changes by the
Jacobian. The meaningful object is the way information transforms with the
parameter. This is the same reason Fisher information becomes a metric tensor
in information geometry and natural-gradient methods.

So a better operational reading is:

```text
information is local distinguishability under a declared model
```

If two nearby parameters generate almost the same distribution, the likelihood
is flat and no unbiased estimator can reliably separate them. If nearby
parameters generate noticeably different distributions, the likelihood has
curvature and precision becomes affordable.

The error bar is not painted on after the estimate. Under the model, it was
already hiding in the curvature.

[^fisher]: R. A. Fisher, ["On the Mathematical Foundations of Theoretical Statistics"](https://jhanley.biostat.mcgill.ca/bios601/Likelihood/Fisher1922.pdf), *Philosophical Transactions of the Royal Society of London. Series A* 222, 1922. Fisher develops likelihood, efficiency, and information as central concepts in estimation theory.

[^rao]: C. R. Rao, ["Information and the Accuracy Attainable in the Estimation of Statistical Parameters"](https://gwern.net/doc/statistics/1992-rao.pdf), *Bulletin of the Calcutta Mathematical Society* 37, 1945; reprinted in *Breakthroughs in Statistics*, 1992. Rao states the information inequality and related efficiency conditions.

[^cramer]: Harald Cramer, *Mathematical Methods of Statistics*, Princeton University Press, 1946. See the [Internet Archive record](https://archive.org/details/in.ernet.dli.2015.223699) for bibliographic access. The book is one source of the Cramer-Rao naming tradition and develops lower bounds for statistical estimation.
