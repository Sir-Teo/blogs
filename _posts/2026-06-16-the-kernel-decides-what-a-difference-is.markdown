---
layout: post
title: "The Kernel Decides What a Difference Is"
description: "Maximum mean discrepancy turns a vague distribution-shift question into a precise measurement. The catch is that the kernel is not decoration: it decides the scale and geometry of the difference."
date: 2026-06-16 18:06:00 -0400
categories: statistics
tags: [mmd, kernel-methods, two-sample-testing, distribution-shift, permutation-tests, statistics]
excerpt: "Two samples can have the same mean, different tails, a rare bump, or a changed shape. MMD can see all of these, but only after the kernel tells it what kind of difference to look for."
---

A machine learning system often fails long before its loss curve says anything.

The data has moved.

Maybe the average transaction is unchanged, but the tail is heavier. Maybe the
language distribution has shifted from ordinary support tickets to angry
support tickets. Maybe an image generator still matches the first-order color
histogram while forgetting a texture. Maybe two A/B buckets have identical
means and different shapes. The most dangerous word in the incident review is
usually not "different". It is "similar".

Similar under what measurement?

A mean is a measurement. A histogram is a measurement. A classifier trained to
separate two samples is a measurement, even if it arrives dressed as a model.
Maximum mean discrepancy, or MMD, is another measurement. Its useful trick is
that it compares distributions without asking us to estimate their densities.
Its useful warning is that the kernel decides what counts as visible.

That warning is the post.

## The Question That Is Too Large

Suppose we have samples

$$
x_1,\ldots,x_n \sim P,
\qquad
y_1,\ldots,y_m \sim Q.
$$

The two-sample problem asks whether $$P=Q$$. Written that way, the question is
too large to touch directly. A distribution is not a scalar. It is an infinite
object. Any test has to compress the question into a statistic.

The classical move is to choose a feature:

```text
compare the means
compare the variances
compare a few quantiles
compare bins
```

That works when the chosen feature is the one that moved. It fails quietly when
the distribution changes somewhere else.

MMD chooses a much larger family of features. Pick a reproducing kernel Hilbert
space, call it $$\mathcal{H}$$, with kernel $$k$$. Then define

$$
\operatorname{MMD}(P,Q;\mathcal{H})
=
\sup_{\|f\|_{\mathcal{H}}\leq 1}
\left(
\mathbb{E}_{X\sim P} f(X)
-
\mathbb{E}_{Y\sim Q} f(Y)
\right).
$$

Gretton, Borgwardt, Rasch, Scholkopf, and Smola use this as the statistic for a
kernel two-sample test: the largest difference in expectations over functions
in the unit ball of an RKHS.[^gretton2012] That sentence is easy to read past.
It says the test is not looking at one feature. It is looking for the most
separating smooth feature the kernel allows.

There is an equivalent and more computable form. Every distribution has a
kernel mean embedding:

$$
\mu_P = \mathbb{E}_{X\sim P} k(X,\cdot).
$$

Then

$$
\operatorname{MMD}(P,Q)
=
\|\mu_P-\mu_Q\|_{\mathcal{H}}.
$$

Squaring and expanding the norm gives the population formula:

$$
\operatorname{MMD}^2(P,Q)
=
\mathbb{E}k(X,X')
+
\mathbb{E}k(Y,Y')
-
2\mathbb{E}k(X,Y),
$$

where $$X,X'\sim P$$ and $$Y,Y'\sim Q$$ independently.

The whole method is hiding in that expression. Points from the same sample
should be similar to each other under the kernel. Points from opposite samples
should be similar to each other if the samples came from the same distribution.
When within-sample similarity beats cross-sample similarity, something is
different.

But "similar" now means "similar according to $$k$$".

## The Kernel Is the Lens

In the browser lab below, the kernel is the one-dimensional Gaussian kernel

$$
k_\sigma(x,y)
=
\exp\left(-\frac{(x-y)^2}{2\sigma^2}\right).
$$

The bandwidth $$\sigma$$ is a scale knob.

At tiny bandwidths, the kernel mostly notices near-coincidences. Each point is
a little island. At very large bandwidths, many points look mutually similar,
and the statistic becomes insensitive to small-scale structure. Somewhere in
between, the test can see bumps, tails, and shape changes.

That does not make the median heuristic silly. The median pairwise distance is
a decent first instrument setting. It is just not a law of nature. Schrab and
coauthors make this explicit in their MMDAgg work: arbitrary kernel choices,
including the median heuristic, can lose power; aggregating over bandwidths can
adapt while still controlling the test level.[^schrab2023]

So MMD has two layers:

1. The population distance asks how far apart the kernel mean embeddings are.
2. The finite-sample test asks whether the observed distance is too large under
   a null model where the labels are exchangeable.

The lab uses the second layer. It computes a biased empirical
$$\operatorname{MMD}^2$$,

$$
\frac{1}{n^2}\sum_{i,j}k(x_i,x_j)
+
\frac{1}{m^2}\sum_{i,j}k(y_i,y_j)
-
\frac{2}{nm}\sum_{i,j}k(x_i,y_j),
$$

then shuffles the sample labels 99 times to build a small permutation null. The
biased version includes the diagonal terms. That makes the displayed statistic
nonnegative. The permutation calibration absorbs that finite-sample bias because
the same statistic is recomputed after each shuffle.

The point is not to publish a 99-permutation p-value. The point is to watch the
measurement breathe.

<style>
  .mmd-lab {
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

  .mmd-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    margin-bottom: 1rem;
  }

  .mmd-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .mmd-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    min-height: 1.2rem;
  }

  .mmd-lab input[type="range"],
  .mmd-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .mmd-lab select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    padding: 0.36rem 0.45rem;
  }

  .mmd-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .mmd-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .mmd-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .mmd-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
  }

  .mmd-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .mmd-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .mmd-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    gap: 0.35rem;
  }

  .mmd-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .mmd-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="mmd-lab" data-mmd-lab>
  <div class="mmd-lab__controls">
    <label>
      Scenario <output data-value="scenario">small mean shift</output>
      <select data-param="scenario">
        <option value="0">same Gaussian</option>
        <option value="1" selected>small mean shift</option>
        <option value="2">wider tails</option>
        <option value="3">rare tail bump</option>
        <option value="4">same center, different shape</option>
      </select>
    </label>
    <label>
      Sample size per group <output data-value="n">72</output>
      <input type="range" data-param="n" min="36" max="128" step="1" value="72">
    </label>
    <label>
      Kernel bandwidth <output data-value="bandwidth">0.82</output>
      <input type="range" data-param="bandwidth" min="0" max="100" step="1" value="57">
    </label>
    <label>
      Seed <output data-value="seed">31</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="31">
    </label>
  </div>
  <div class="mmd-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="MMD two-sample lab showing samples, witness function, permutation null, and bandwidth sweep"></canvas>
  <div class="mmd-lab__legend">
    <span><i style="background:#2563eb"></i> Sample P</span>
    <span><i style="background:#be123c"></i> Sample Q</span>
    <span><i style="background:#0f766e"></i> Witness function</span>
    <span><i style="background:#7c3aed"></i> Chosen bandwidth</span>
    <span><i style="background:#b45309"></i> Median heuristic</span>
  </div>
  <p class="mmd-lab__note">
    Deterministic toy test. The audit checks MMD symmetry, zero self-distance,
    valid permutation p-values, positive median bandwidths, and detection of the
    default mean-shift case.
  </p>
</div>
<script defer src="{{ '/assets/js/mmd-two-sample-lab.js?v=20260616a' | relative_url }}"></script>

Try the null case first. The observed line should usually sit inside the shuffled
histogram. Now switch to a mean shift, a scale shift, a rare bump, and a
different shape. Then move the bandwidth.

The interesting behavior is not just whether the p-value goes up or down. It is
where the witness function points.

## The Witness Is the Local Explanation

The empirical witness function in the lab is

$$
\widehat{w}(z)
=
\frac{1}{n}\sum_i k(z,x_i)
-
\frac{1}{m}\sum_j k(z,y_j).
$$

It is positive where the first sample has more kernel-smoothed mass and negative
where the second sample has more. Gretton's MMD code page describes the same
idea as finding a smooth witness function that is large on points from $$P$$ and
as negative as possible on points from $$Q$$.[^gatsby]

This is the part I like most. MMD is sometimes introduced as a test statistic,
but the witness function makes it feel less like a courtroom verdict and more
like a microscope slide.

In the mean-shift scenario, the witness usually goes positive on the left and
negative on the right. That says "sample Q moved right". In the wider-tail
scenario, the middle may become positive and the shoulders negative. That says
"one sample is less concentrated". In the rare-bump scenario, the witness may
not scream globally, but it can show a local tail excess.

The witness is not a complete explanation. It is still kernel-smoothed and
sample-dependent. But it is a better object than a lonely p-value.

This is why later work on interpretable distribution features is natural.
Jitkrittum, Szabo, Chwialkowski, and Gretton choose spatial or frequency
locations to maximize test power and return an interpretable indication of where
distributions differ locally.[^jitkrittum2016] That is a different test, not just
a visualization. But the instinct is the same: a distribution test should tell
you something about the location or frequency of the change.

## Characteristic Does Not Mean Omniscient

There is a mathematical comfort story about MMD:

> with a characteristic kernel, MMD is zero if and only if the distributions are
> equal.

That story is true in the population limit. Sriperumbudur, Gretton, Fukumizu,
Scholkopf, and Lanckriet studied when kernel mean embeddings are injective,
calling such kernels characteristic; for translation-invariant kernels on
Euclidean space, they give Fourier-support conditions that include familiar
choices such as the Gaussian kernel.[^sriperumbudur2010]

But "characteristic" is not the same as "powerful at your sample size".

At finite $$n$$, the test has a budget. It spends that budget according to the
kernel. If the bandwidth is too small, the statistic can become noisy. If the
bandwidth is too large, the statistic can blur away the feature you care about.
If the data are high-dimensional, distances can concentrate, and a homogeneous
radial kernel may need help. If you search over many kernels and report the best
one without recalibrating, you have performed a multiple-testing experiment
while pretending you did not.

This is the recurring shape of modern two-sample testing:

```text
more adaptive measurement -> more power
more adaptivity -> more calibration debt
```

MMDAgg pays that debt by aggregating over kernels with level control.[^schrab2023]
Deep kernel tests pay it differently. Liu, Xu, Lu, Zhang, Gretton, and Sutherland
train kernels parameterized by neural networks to maximize test power, adapting
to spatial variation and high-dimensional structure.[^liu2020] That is powerful,
but it moves the method closer to the world of representation learning, data
splits, and careful null calibration.

There is no free difference detector. There are only instruments and their
calibration records.

## A Practical Drift-Test Recipe

If I were using MMD as a production drift probe, I would not wire the median
heuristic to a pager and call it done.

I would start with a boring, documented protocol:

1. Pick a representation before seeing the incident sample. Raw pixels, model
   embeddings, text embeddings, tabular features, and residuals answer different
   questions.
2. Pick a small family of kernels and bandwidths. Include a median-heuristic
   scale, smaller local scales, and larger global scales.
3. Calibrate the whole selection rule, not just the final statistic. Use
   permutation tests, held-out reference periods, wild bootstrap where
   appropriate, or an aggregated test with guarantees.
4. Report the statistic, p-value, witness or feature-level localization, sample
   size, time window, and preprocessing.
5. Treat significance as triage, not diagnosis.

That last point matters. A two-sample test can say "the current window differs
from the reference window under this measurement". It cannot say the product is
broken, the model is unfair, fraud is up, or the generator has memorized.
Those are domain claims. MMD can aim the flashlight.

This distinction also matters for generative models. MMD is not only a testing
tool. It has been used as a critic in MMD GANs, and Binkowski, Sutherland,
Arbel, and Gretton discuss kernel choice for that critic while proposing Kernel
Inception Distance as a convergence measure for GANs.[^binkowski2018] KID is
popular partly because it makes the feature representation explicit: compare
generated and real images after passing them through an Inception network. Again
the lesson repeats. The representation and kernel are part of the claim.

## What The Lab Actually Verifies

The JavaScript backing the lab is intentionally small, but it is not a drawing
with numbers painted on top. It samples data from five scenarios, computes the
Gaussian kernel matrix, evaluates empirical MMD, builds a deterministic
permutation null, draws the witness function, and sweeps bandwidths.

The Node audit checks:

```text
MMD(P, Q) = MMD(Q, P)
MMD(P, P) = 0 for the biased self-comparison
k(x, x) = 1 for the Gaussian kernel
all scenario p-values are valid probabilities
all witness peaks are finite
all median-heuristic bandwidths are positive
the default mean shift is detected under the chosen seed
```

Those checks do not prove the test is universally good. They prove the article's
instrument is internally coherent. For a blog experiment, that is the right
standard: make the claim, expose the code, test the mechanical invariants, and
let the reader move the knobs.

The deeper lesson is smaller and sharper:

```text
MMD does not ask whether two samples are different.
It asks whether their kernel means are farther apart than exchangeability can
explain.
```

That is a scientific sentence. It names the object, the metric, and the null.

Most vague dashboards would be improved by that much honesty.

[^gretton2012]: Arthur Gretton, Karsten M. Borgwardt, Malte J. Rasch, Bernhard Scholkopf, and Alexander Smola, "A Kernel Two-Sample Test," *Journal of Machine Learning Research* 13(25):723-773, 2012. [JMLR](https://jmlr.csail.mit.edu/papers/v13/gretton12a.html).

[^gatsby]: Arthur Gretton et al., "Kernel Two-Sample Test" software notes, Gatsby Computational Neuroscience Unit. [Gatsby](https://www.gatsby.ucl.ac.uk/~gretton/mmd/mmd.htm).

[^schrab2023]: Antonin Schrab, Ilmun Kim, Melisande Albert, Beatrice Laurent, Benjamin Guedj, and Arthur Gretton, "MMD Aggregated Two-Sample Test," *Journal of Machine Learning Research* 24(194):1-81, 2023. [JMLR](https://jmlr.org/papers/v24/21-1289.html).

[^jitkrittum2016]: Wittawat Jitkrittum, Zoltan Szabo, Kacper P. Chwialkowski, and Arthur Gretton, "Interpretable Distribution Features with Maximum Testing Power," *NeurIPS 2016*. [NeurIPS](https://papers.nips.cc/paper/6148-interpretable-distribution-features-with-maximum-testing-power).

[^sriperumbudur2010]: Bharath K. Sriperumbudur, Arthur Gretton, Kenji Fukumizu, Bernhard Scholkopf, and Gert R. G. Lanckriet, "Hilbert Space Embeddings and Metrics on Probability Measures," *Journal of Machine Learning Research* 11:1517-1561, 2010. [JMLR](https://jmlr.csail.mit.edu/papers/v11/sriperumbudur10a.html).

[^liu2020]: Feng Liu, Wenkai Xu, Jie Lu, Guangquan Zhang, Arthur Gretton, and Danica J. Sutherland, "Learning Deep Kernels for Non-Parametric Two-Sample Tests," *ICML 2020*, PMLR 119:6316-6326. [arXiv](https://arxiv.org/abs/2002.09116).

[^binkowski2018]: Mikolaj Binkowski, Danica J. Sutherland, Michael Arbel, and Arthur Gretton, "Demystifying MMD GANs," *ICLR 2018*. [arXiv](https://arxiv.org/abs/1801.01401).
