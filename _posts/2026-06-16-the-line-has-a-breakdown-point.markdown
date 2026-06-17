---
layout: post
title: "The Line Has a Breakdown Point"
description: "Least squares is a voting rule with a very loud microphone for far-away points. Robust regression is not one trick; Huber, Theil-Sen, and RANSAC fail for different reasons."
date: 2026-06-16 19:58:00 -0400
categories: statistics
tags: [robust-regression, outliers, ransac, huber-loss, theil-sen, statistics, machine-learning]
excerpt: "A regression line is not just a formula through a cloud. It is a policy for which points get to vote, how loudly they speak, and when the vote itself becomes invalid."
---

A regression line looks democratic.

Every point gets a residual. The algorithm squares the residuals, adds them up,
and chooses the line with the smallest total:

$$
\min_{\alpha,\beta} \sum_i (y_i-\alpha-\beta x_i)^2.
$$

That is ordinary least squares. It is beautiful when the noise model is close to
the story: independent, centered, roughly Gaussian errors with no funny business
in the design.

But it is not democratic.

Squaring is a voting rule. A point with ten times the residual gets one hundred
times the vote. A point far away in the `x` direction also gets a special kind
of power: moving the slope can make that point look less wrong while making
many ordinary points a little worse. That is leverage.

So the question is not:

```text
what line goes through the cloud?
```

The question is:

```text
who is allowed to move the line?
```

Robust regression is the engineering of that answer.

## Outlier Is Not One Word

There are at least three different cases hiding under the word "outlier":

- a **vertical outlier**, where `x` is ordinary but `y` is corrupted;
- a **leverage point**, where `x` is far from the rest of the design;
- a **competing structure**, where a second population has its own line.

These are not morally different. They are computationally different.

A vertical outlier has a big residual under a reasonable line, so a residual
downweighting rule can notice it. A leverage point may not keep a big residual
after it has already rotated the fitted line. A competing cluster may be a
minority, a majority, or a second valid regime. Calling all three "bad data"
does not choose an estimator.

Cook's 1977 paper on influential observations made this distinction operational
for linear regression: influence is not just residual size; it combines residual
information with the variance of predicted values, which is where leverage
enters.[^cook]

That is why robust regression cannot be a sticker you put on a dashboard. It is
a contract about the failure mode.

## A Lab With Four Ways To Draw One Line

The lab below creates a deterministic two-dimensional regression problem. The
clean data follow a slightly wavy line with noise. The contaminated points can
be vertical outliers, leverage points, a competing cluster, or heavy-tail bursts.

It compares four estimators:

- **OLS**, minimizing squared residuals;
- **Huber**, quadratic near zero and linear in the tails;
- **Theil-Sen**, the median of pairwise slopes with a median intercept;
- **RANSAC**, repeated two-point proposals scored by consensus.

The score shown in the right panel is **clean-point RMSE**. In real life we do
not get to know which observations are clean. Here we do, because the purpose is
to make the failure modes visible.

<style>
  .robust-line-lab {
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

  .robust-line-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .robust-line-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .robust-line-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .robust-line-lab input,
  .robust-line-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .robust-line-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .robust-line-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .robust-line-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .robust-line-lab__metric span,
  .robust-line-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .robust-line-lab__metric span {
    display: block;
  }

  .robust-line-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .robust-line-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .robust-line-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="robust-regression-lab" class="robust-line-lab" data-robust-line-lab>
  <div class="robust-line-lab__controls">
    <label>
      Contamination
      <select data-param="mode">
        <option value="vertical">vertical outliers</option>
        <option value="leverage" selected>leverage points</option>
        <option value="cluster">competing cluster</option>
        <option value="heavy">heavy-tail bursts</option>
      </select>
    </label>
    <label>
      Points: <output data-value="n">96</output>
      <input type="range" min="36" max="180" step="4" value="96" data-param="n">
    </label>
    <label>
      Bad fraction: <output data-value="contamination">24%</output>
      <input type="range" min="0" max="55" step="1" value="24" data-param="contamination">
    </label>
    <label>
      Outlier strength: <output data-value="strength">70%</output>
      <input type="range" min="0" max="100" step="5" value="70" data-param="strength">
    </label>
    <label>
      RANSAC threshold: <output data-value="threshold">0.85</output>
      <input type="range" min="0.25" max="3" step="0.05" value="0.85" data-param="threshold">
    </label>
    <label>
      RANSAC trials: <output data-value="trials">120</output>
      <input type="range" min="20" max="420" step="20" value="120" data-param="trials">
    </label>
    <label>
      Huber delta: <output data-value="huberDelta">1.35</output>
      <input type="range" min="0.5" max="3" step="0.05" value="1.35" data-param="huberDelta">
    </label>
    <label>
      Seed: <output data-value="seed">23</output>
      <input type="range" min="1" max="997" step="1" value="23" data-param="seed">
    </label>
  </div>
  <div class="robust-line-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="740" aria-label="Robust regression lab comparing OLS, Huber, Theil-Sen, and RANSAC under contamination"></canvas>
  <p class="robust-line-lab__note">
    Deterministic browser experiment. The clean line is known to the simulator
    but hidden from the estimators. RANSAC samples two-point line proposals;
    Huber is fit by iteratively reweighted least squares with a MAD scale.
  </p>
</div>
<script defer src="{{ '/assets/js/robust-regression-lab.js?v=20260616a' | relative_url }}"></script>

At the default setting, the contamination is made of leverage points. OLS is
pulled hard. Huber is also pulled, because Huber primarily reacts to residual
size. Once the high-leverage points rotate the line, their residuals are not
always dramatic enough to be ignored. Theil-Sen moves less, but the median of
pairwise slopes is still listening to many pairs that include the leverage
cluster.

RANSAC does best in the default scene because the clean line is still the
largest tight consensus. That is exactly the assumption RANSAC was built to
exploit.

Now switch to **vertical outliers**. Huber, Theil-Sen, and RANSAC all look good.
The corrupted points sit far above or below the line, so residual-based
downweighting has something obvious to downweight.

Switch to **competing cluster** and push the bad fraction upward. RANSAC can now
become philosophical in the worst possible way: if the wrong line gathers the
largest consensus under the threshold, it is not "fooled" according to its own
objective. It did what you asked. You asked for a line with many agreeing
points, not for the causal or scientific line.

That is the main lesson:

```text
robust to what?
```

## Huber Loss: Stop Letting Residuals Shout

Huber's 1964 paper is about robust location, but the idea travels naturally to
regression.[^huber] Replace the squared loss with a function that is quadratic
near zero and linear in the tails:

$$
\rho_\delta(r)=
\begin{cases}
r^2, & |r|\le \delta,\\
2\delta |r|-\delta^2, & |r|>\delta.
\end{cases}
$$

Small residuals still get the efficient least-squares treatment. Large residuals
stop receiving squared-loss amplification.

The computational version in the lab is iteratively reweighted least squares:
fit a line, estimate a robust residual scale from the median absolute deviation,
downweight residuals outside the Huber cutoff, and refit. The resulting line is
usually much calmer under vertical contamination.

But Huber is not a shield against every bad point. If a leverage point changes
the slope enough, its residual under the changed slope may no longer look like a
tail event. Downweighting residuals does not remove leverage from the design.

This is a recurring pattern in robust statistics: a method's protection is
defined in the coordinate system where it detects trouble.

## Theil-Sen: Let Slopes Vote By Median

Theil-Sen regression does something almost comically direct. Compute the slope
between every pair of points:

$$
\frac{y_j-y_i}{x_j-x_i}.
$$

Take the median slope. Then take a median intercept from $$y_i-\hat\beta x_i$$.

Sen's 1968 paper studies this through Kendall's tau and explicitly frames the
least-squares slope as vulnerable to gross errors and non-normality.[^sen] The
appeal is easy to feel in the lab: a few absurd vertical points create many
absurd pairwise slopes, but not enough to move the median if the clean majority
is strong.

The cost is also visible. Pairwise slopes are a different vote, not a miracle.
If the contamination creates many coherent pairs, or if leverage points occupy
enough of the design, the median can drift. In higher-dimensional regression,
the simple pairwise-slope story does not transfer as cleanly.

Still, for one-dimensional trend estimation, Theil-Sen is a lovely piece of
engineering: spend quadratic pair comparisons to get a slope that is much less
impressed by a few loud observations.

## RANSAC: Fit The Consensus, Not The Average

Fischler and Bolles introduced RANSAC for model fitting in image analysis and
cartography, where feature detections can contain many gross errors.[^ransac]
The template is:

```text
sample a minimal set
fit a candidate model
count how many points agree with it
keep the model with the largest consensus
refit on the consensus set
```

For a line, the minimal set is two points. If the clean fraction is $$w$$ and a
trial samples $$s=2$$ points, the probability that one trial is all-clean is
$$w^2$$. After $$N$$ independent trials, the usual success calculation is:

$$
1-(1-w^2)^N.
$$

That little formula is why the lab reports a "clean sample chance." It is not a
guarantee that RANSAC chose the right line. It is only the chance that at least
one proposal was seeded by clean points under the simulator's labels. The
threshold, scoring rule, and refit still matter.

RANSAC is wonderfully explicit about its worldview:

```text
there is a model, and many points are not from it
```

If that worldview is right, RANSAC can be astonishingly effective. If the data
contain several real regimes, RANSAC may choose the dominant regime and call the
others outliers. That may be correct for feature matching. It may be dangerous
for social data, finance, epidemiology, or product analytics.

Consensus is a model assumption.

## Breakdown Point Is The Stress Test

The phrase "breakdown point" asks how much contamination an estimator can
tolerate before its answer can be driven arbitrarily far away. OLS has a
terrible answer: one sufficiently extreme point can move the line as much as it
wants.

Rousseeuw's least-median-of-squares work made this contrast especially sharp by
replacing the sum of squared residuals with the median of squared residuals; the
resulting estimator can resist nearly 50% contamination in the data.[^rousseeuw]
That does not make least median squares the right tool for every job. It makes
the axis of comparison clear.

A regression estimator is not only:

```text
bias, variance, compute
```

It is also:

```text
what fraction of bad data can take control?
```

The lab is not implementing least median squares, but it is organized around
that question. Move the bad fraction past 40%. Give the outliers their own
line. Widen RANSAC's threshold until both lines count as consensus. Lower the
threshold until the clean noisy points stop agreeing with themselves. Each
change reveals a different way a line can break.

## What I Would Put In A Regression Test Suite

If a production system fits lines, trends, calibrations, demand curves, risk
models, or dashboard slopes, I would not only test it on Gaussian noise.

I would include:

- vertical gross errors;
- high-leverage points with plausible residuals;
- a coherent second cluster;
- heavy-tailed noise bursts;
- sorted and unsorted input order, if the implementation is approximate;
- missingness or censoring mechanisms that create nonrandom leverage;
- several contamination fractions near the claimed operating boundary.

The expected answer does not have to be "use robust regression everywhere."
Sometimes OLS is the right estimator because the assumptions are credible and
efficiency matters. Sometimes a robust estimator is a diagnostic, not the final
model. Sometimes the correct response to a competing cluster is segmentation,
not a stronger loss function.

The important move is to stop treating the regression line as a neutral summary.

It is a voting system. Squared loss gives large residuals more votes. Leverage
gives far-away design points a longer handle. Huber clips residual voices.
Theil-Sen asks pairwise slopes for a median. RANSAC lets a consensus subset
elect the model.

Every one of those choices can be right.

Every one can be wrong.

The line has a breakdown point.

## Paper Trail

[^cook]: R. Dennis Cook, ["Detection of Influential Observation in Linear Regression"](https://www.tandfonline.com/doi/abs/10.1080/00401706.1977.10489493), *Technometrics*, 19(1), 1977. DOI: [10.1080/00401706.1977.10489493](https://doi.org/10.1080/00401706.1977.10489493).

[^huber]: Peter J. Huber, ["Robust Estimation of a Location Parameter"](https://projecteuclid.org/journals/annals-of-mathematical-statistics/volume-35/issue-1/Robust-Estimation-of-a-Location-Parameter/10.1214/aoms/1177703732.full), *Annals of Mathematical Statistics*, 35(1), 1964. DOI: [10.1214/aoms/1177703732](https://doi.org/10.1214/aoms/1177703732).

[^sen]: Pranab Kumar Sen, ["Estimates of the Regression Coefficient Based on Kendall's Tau"](https://www.tandfonline.com/doi/abs/10.1080/01621459.1968.10480934), *Journal of the American Statistical Association*, 63(324), 1968. DOI: [10.1080/01621459.1968.10480934](https://doi.org/10.1080/01621459.1968.10480934).

[^ransac]: Martin A. Fischler and Robert C. Bolles, ["Random Sample Consensus: A Paradigm for Model Fitting with Applications to Image Analysis and Automated Cartography"](https://dl.acm.org/doi/10.1145/358669.358692), *Communications of the ACM*, 24(6), 1981. DOI: [10.1145/358669.358692](https://doi.org/10.1145/358669.358692).

[^rousseeuw]: Peter J. Rousseeuw, ["Least Median of Squares Regression"](https://www.tandfonline.com/doi/abs/10.1080/01621459.1984.10477105), *Journal of the American Statistical Association*, 79(388), 1984. Author PDF: [KU Leuven](https://wis.kuleuven.be/stat/robust/papers/publications-1984/rousseeuw-leastmediansquaresregression-jasa-1984.pdf).
