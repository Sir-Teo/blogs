---
layout: post
title: "Bootstrap the Assumption, Not the Wish"
description: "Resampling is not magic. A bootstrap interval works by replaying a data-generating contract, and the wrong contract can be confidently wrong."
date: 2026-06-13 19:16:00 -0400
categories: statistics
tags: [bootstrap, resampling, regression, heteroskedasticity, uncertainty, econometrics]
excerpt: "The bootstrap is a simulator. The unit you resample is the assumption you make executable, so the wrong unit gives you precise fiction."
---

The bootstrap has a dangerous user interface.

It looks like this:

```text
sample with replacement
```

That sentence is so small that it hides the whole model. What is being sampled?
Rows? Residuals? Clusters? Blocks of time? Scores? Treatment assignments? If the
answer is wrong, the bootstrap does not complain. It keeps drawing samples and
returns precise-looking intervals from the wrong imagined world.

The bootstrap is not a machine for avoiding assumptions. It is a machine for
making assumptions runnable.

## The Tiny Spell With a Hidden Clause

Efron's 1979 paper introduced the bootstrap as a general way to estimate the
sampling distribution of a statistic from the empirical distribution of the
observed data.[^efron] If the data are an i.i.d. sample

$$
X_1,\ldots,X_n \sim F,
$$

then the empirical distribution

$$
\widehat F_n = \frac{1}{n}\sum_{i=1}^n \delta_{X_i}
$$

is a natural plug-in estimate of $$F$$. A bootstrap sample draws $$n$$ points
from $$\widehat F_n$$ with replacement, computes the statistic again, and repeats
that many times. The resulting cloud of statistics approximates the sampling
distribution.

That is beautiful because it turns an analytic question into a computational
one:

```text
what would this estimator do if the empirical distribution were the population?
```

But the sentence has a hidden clause:

```text
... and if the original sampling unit really was exchangeable
```

The trouble starts when observations are not exchangeable in the way your code
pretends.

## Regression Has Multiple Worlds

Freedman's regression bootstrap paper is still a wonderful antidote to casual
resampling.[^freedman] The important line is conceptual: the bootstrap
simulation has to reflect the relevant features of the stochastic model that
generated the data.

In regression, there are at least two common stories.

First, the design matrix may be fixed. The analyst chose the $$x_i$$ values, and
randomness enters through homoskedastic errors:

$$
Y_i = \alpha + \beta X_i + \epsilon_i,\qquad
\epsilon_i \stackrel{i.i.d.}{\sim} G.
$$

If this is the story, resampling centered residuals and attaching them back to
the fitted values can make sense. The residuals are treated as exchangeable
draws from one common error distribution.

Second, the rows may be random:

$$
(X_i,Y_i) \stackrel{i.i.d.}{\sim} P.
$$

Now the row is the sampling unit. Resampling pairs $$ (X_i,Y_i) $$ better matches
the data collection process. It lets the distribution of $$X$$ vary across
bootstrap samples, and it preserves any relationship between high-leverage
points and their outcomes.

Those are not cosmetic choices. They are different worlds.

## Where Residuals Betray You

The simulator below creates a simple linear regression with true slope 1. The
error variance can grow with $$|x|$$, and a fraction of observations can live at
high-leverage $$x$$ values. It then runs many experiments and asks how often
different nominal 95% intervals actually cover the true slope.

The five intervals are:

- **classic** OLS normal interval with homoskedastic standard errors;
- **HC1** normal interval using White-style heteroskedasticity-consistent
  standard errors;
- **residual** bootstrap, which resamples centered residuals;
- **pairs** bootstrap, which resamples whole rows;
- **wild** bootstrap, which keeps each row's residual scale and multiplies the
  residual by random signs.

<div id="bootstrap-plan-lab" class="bootstrap-plan-lab" data-bootstrap-plan-lab>
  <div class="bootstrap-plan-lab__controls">
    <label>
      Sample size: <output data-value="n">80</output>
      <input type="range" min="30" max="220" step="10" value="80" data-param="n">
    </label>
    <label>
      Experiments: <output data-value="experiments">120</output>
      <input type="range" min="60" max="300" step="20" value="120" data-param="experiments">
    </label>
    <label>
      Bootstrap draws: <output data-value="bootstraps">90</output>
      <input type="range" min="40" max="220" step="10" value="90" data-param="bootstraps">
    </label>
    <label>
      Heteroskedasticity: <output data-value="hetero">140.0%</output>
      <input type="range" min="0" max="220" step="10" value="140" data-param="hetero">
    </label>
    <label>
      Leverage share: <output data-value="leverage">25.0%</output>
      <input type="range" min="0" max="80" step="5" value="25" data-param="leverage">
    </label>
    <label>
      Noise scale: <output data-value="noise">1.00</output>
      <input type="range" min="40" max="180" step="10" value="100" data-param="noise">
    </label>
  </div>
  <div class="bootstrap-plan-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Bootstrap simulator comparing classic, HC1, residual, pairs, and wild bootstrap confidence interval coverage under heteroskedastic regression"></canvas>
  <div class="bootstrap-plan-lab__legend">
    <span><i style="background:#be123c"></i> Classic</span>
    <span><i style="background:#7c3aed"></i> HC1</span>
    <span><i style="background:#d97706"></i> Residual</span>
    <span><i style="background:#2563eb"></i> Pairs</span>
    <span><i style="background:#0f766e"></i> Wild</span>
  </div>
  <p class="bootstrap-plan-lab__note">
    Deterministic Monte Carlo. Each setting generates repeated synthetic
    regression datasets with true slope 1, then computes nominal 95% intervals.
    The bootstrap intervals use the basic bootstrap form around the observed
    slope. Results are pedagogical, not a universal ranking of methods.
  </p>
</div>
<script defer src="{{ '/assets/js/bootstrap-sampling-plan-lab.js?v=20260613b' | relative_url }}"></script>

At the default setting, the residual bootstrap tends to undercover. It treats
residuals from high-variance, high-leverage regions as if they could have come
from anywhere. The resampling step smears the error distribution across the
design and invents a more uniform world than the one that generated the data.

The pairs bootstrap usually does better here because the row is the sampling
unit. High-leverage rows stay high-leverage rows. The wild bootstrap usually
does better because it keeps each fitted residual attached to its row and only
randomizes its sign. It says: "I believe the conditional mean structure enough to
keep the fitted design, but I do not believe all residuals share one variance."

Now set **Heteroskedasticity** to zero and **Leverage share** to zero. The
methods move closer together. That is not an accident. Under a fixed-design,
homoskedastic error story, the residual bootstrap's exchangeability assumption is
much less offensive.

The point is not "always use pairs" or "always use wild." The point is:

```text
the resampling unit is the assumption
```

## The Sandwich Answers in Closed Form

White's heteroskedasticity-consistent covariance estimator attacked a related
problem analytically.[^white] Ordinary least squares coefficients can remain
consistent under heteroskedasticity, but the usual covariance matrix can be
wrong. The sandwich estimator replaces the constant-variance middle of the
variance formula with residual-weighted score products.

For a simple slope with intercept, the robust variance has the same spirit as:

$$
\widehat{\operatorname{Var}}(\widehat \beta)
\propto
\frac{\sum_i (x_i-\bar x)^2 \widehat \epsilon_i^2}
{\left(\sum_i (x_i-\bar x)^2\right)^2}.
$$

High-leverage observations with large residuals now matter more. The estimator is
not trying to pretend all residuals came from the same urn.

This is why the lab includes HC1 next to the bootstraps. Sometimes a robust
analytic standard error is the right simple answer. Sometimes a bootstrap is
useful because the statistic is complicated, the finite-sample distribution is
awkward, or a design-specific resampling scheme captures the experiment better
than a first-order approximation. They are tools for the same question:

```text
what randomness should this inference procedure replay?
```

## Wild Bootstrap Keeps the Row's Scale

The wild bootstrap is a useful compromise for heteroskedastic regression. In its
simple Rademacher form, after fitting the model it generates

$$
Y_i^\star = \widehat Y_i + v_i \widehat \epsilon_i,
$$

where $$v_i$$ is independently $$+1$$ or $$-1$$ with equal probability. The
residual magnitude remains tied to the original row. The sign changes.

Wu studied resampling methods for regression and emphasized that methods
justified in the i.i.d. case may fail in regression settings with special
structure.[^wu] Later work associated with Liu and Mammen developed the wild
bootstrap as a way to handle non-i.i.d. errors and heteroskedastic regression
problems.[^mammen] A modern score-bootstrap view says the wild bootstrap perturbs
the fitted scores while keeping the Hessian fixed; that interpretation makes the
method easier to generalize beyond ordinary residuals.[^kline-santos]

The implementation in the lab is intentionally plain. It does not studentize the
bootstrap statistic, does not use Mammen's two-point weights, and does not claim
second-order refinements. It just shows the core mechanism:

```text
do not detach residual scale from the row when residual scale belongs to the row
```

## Rows Are Not Always the Unit

Rows are not always the unit either.

In a time series, resampling individual observations usually destroys serial
dependence. If returns cluster by volatility regime, if users arrive in sessions,
if server latency has bursts, if panel observations share a household, school,
cluster, desk, or geography, the i.i.d. row bootstrap may create datasets that no
real sampling process could have produced.

Kunsch's block bootstrap for stationary observations is one classic response:
resample blocks rather than individual observations so short-range dependence is
preserved.[^kunsch] Cluster bootstraps and randomization inference make the same
kind of move in other designs. The unit changes because the source of randomness
changed.

This is the bootstrap's deepest practical lesson. You do not ask:

```text
can I bootstrap this?
```

You ask:

```text
what would have been exchangeable before I saw the data?
```

Then you resample that.

## Before You Resample

Before I trust a bootstrap interval, I want written answers to:

- What is the sampling unit?
- Are observations independent, clustered, stratified, paired, blocked, or
  serially dependent?
- Are regressors fixed by design or random draws from a population?
- Is variance plausibly constant conditional on the regressors?
- Is the statistic smooth enough for ordinary bootstrap approximations?
- Does the resampling scheme preserve treatment assignment, matching,
  stratification, censoring, or survey weights?
- Does the interval use percentile, basic, studentized, BCa, or another form?
- How many bootstrap draws are enough for the reported tail probability?
- What diagnostic simulation would fail if the resampling contract is wrong?

The last question is the one I like most. If you cannot name a world where your
bootstrap fails, you probably have not named the world where it succeeds.

## The Line I Would Keep

The bootstrap is often taught as a recipe. It is better understood as a tiny
simulator of the experiment you believe happened.

If the data really are exchangeable rows, row resampling is natural. If the
design is fixed and errors are homoskedastic, residual resampling may be natural.
If the errors are heteroskedastic, wild bootstrap or robust covariance estimates
may be natural. If the data are dependent, blocks or clusters may be the unit.

The code can be one line. The assumption is not.

```text
resample the unit that nature randomized
```

That is the part worth remembering.

## Paper Trail

[^efron]: Bradley Efron, ["Bootstrap Methods: Another Look at the Jackknife"](https://sites.stat.washington.edu/courses/stat527/s14/readings/ann_stat1979.pdf), *The Annals of Statistics*, 1979. DOI: [10.1214/aos/1176344552](https://doi.org/10.1214/aos/1176344552).

[^freedman]: David A. Freedman, ["Bootstrapping Regression Models"](https://www.ms.uky.edu/~mai/sta662/Freedman.pdf), *The Annals of Statistics*, 1981. DOI: [10.1214/aos/1176345638](https://doi.org/10.1214/aos/1176345638).

[^white]: Halbert White, ["A Heteroskedasticity-Consistent Covariance Matrix Estimator and a Direct Test for Heteroskedasticity"](https://crooker.faculty.unlv.edu/econ441/econ_papers/White-Heteroskedasticity-Correction-1980.pdf), *Econometrica*, 1980. RePEc entry: [EconPapers](https://econpapers.repec.org/article/ecmemetrp/v_3a48_3ay_3a1980_3ai_3a4_3ap_3a817-38.htm).

[^wu]: C. F. J. Wu, ["Jackknife, Bootstrap and Other Resampling Methods in Regression Analysis"](https://www.bauer.uh.edu/rsusmel/phd/wu1986.pdf), *The Annals of Statistics*, 1986. DOI: [10.1214/aos/1176350142](https://doi.org/10.1214/aos/1176350142).

[^mammen]: Enno Mammen, ["Bootstrap and Wild Bootstrap for High Dimensional Linear Models"](https://dml.mathdoc.fr/item/1176349025/), *The Annals of Statistics*, 1993. DOI: [10.1214/aos/1176349025](https://doi.org/10.1214/aos/1176349025).

[^kline-santos]: Patrick Kline and Andres Santos, ["A Score Based Approach to Wild Bootstrap Inference"](https://www.nber.org/system/files/working_papers/w16127/revisions/w16127.rev0.pdf), NBER Working Paper 16127, 2010. The paper reviews the wild bootstrap and interprets it through score perturbations.

[^kunsch]: Hans R. Kunsch, ["The Jackknife and the Bootstrap for General Stationary Observations"](https://projecteuclid.org/journals/annals-of-statistics/volume-17/issue-3/The-Jackknife-and-the-Bootstrap-for-General-Stationary-Observations/10.1214/aos/1176347265.full), *The Annals of Statistics*, 1989. DOI: [10.1214/aos/1176347265](https://doi.org/10.1214/aos/1176347265).
