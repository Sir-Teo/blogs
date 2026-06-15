---
layout: post
title: "Yesterday Can Tighten an A/B Test"
description: "CUPED borrows pre-period signal to reduce variance. Move the timing line past treatment, and precision quietly turns into bias."
date: 2026-06-13 17:52:00 -0400
categories: statistics
series: trustworthy-experiments
tags: [cuped, ab-testing, variance-reduction, regression-adjustment, experimentation, causal-inference]
excerpt: "CUPED subtracts predictable pre-treatment variation. The power comes from yesterday; the danger starts when the covariate can be moved by the experiment."
---

An A/B test has two ways to become more decisive.

The expensive way is to wait:

```text
more users, more days, more traffic
```

The clever way is to stop wasting variance on things you already knew before
the experiment started.

Suppose yesterday's activity predicts today's activity. Some users are always
heavy users. Some are tourists. Some are power users on weekdays and absent on
weekends. Randomization balances these people in expectation, but any one
experiment still spends noise budget on who happened to land in treatment.

CUPED is the small but powerful idea:

```text
use pre-experiment behavior to remove predictable outcome variation
without changing the estimand
```

The last phrase is the whole game. If the covariate was measured before
treatment, randomization protects it. If the covariate was affected by treatment,
the adjustment can quietly subtract part of the effect you were trying to
measure.

Variance reduction is not free power. It is lawful time travel: yesterday is
available evidence, tomorrow is evidence you may have contaminated.

## The Legal Time Machine

Let $$Y_i$$ be the experiment-period outcome for user $$i$$ and $$X_i$$ be a
pre-experiment covariate. Think of $$X_i$$ as last week's value of the same
metric, or a stable baseline activity score.

Define an adjusted outcome:

$$
Y_i^\star
=
Y_i - \theta (X_i - \bar{X}).
$$

The constant $$\bar{X}$$ only recenters the adjusted outcome. The useful part is
subtracting the predictable component of $$Y$$. The variance-minimizing scalar
coefficient is:

$$
\theta^\star
=
\frac{\operatorname{Cov}(Y,X)}{\operatorname{Var}(X)}.
$$

At that value,

$$
\operatorname{Var}(Y^\star)
=
\operatorname{Var}(Y)(1-\rho_{YX}^2),
$$

where $$\rho_{YX}$$ is the correlation between the outcome and the covariate. A
correlation of 0.7 implies roughly a 51 percent variance reduction. A
correlation of 0.1 implies almost nothing.

In a two-arm experiment, the CUPED treatment effect estimate is:

$$
\hat{\Delta}_\mathrm{cuped}
=
(\bar{Y}_T-\bar{Y}_C)
- \hat{\theta}(\bar{X}_T-\bar{X}_C).
$$

If $$X$$ is pre-treatment, randomization gives:

$$
E[\bar{X}_T-\bar{X}_C]=0.
$$

So the adjustment removes random imbalance without moving the target. Deng, Xu,
Kohavi, and Walker introduced CUPED for online controlled experiments as a
practical way to improve sensitivity using pre-experiment data, reporting large
variance reductions in Bing experiments.[^cuped]

This is why CUPED feels almost unfair when it works. The experiment gets credit
for a week of information collected before the experiment existed.

## Pre-Period Lab

The lab below simulates repeated randomized experiments. Users have a
pre-period covariate, an experiment-period outcome, and a true treatment lift.
It compares three estimators:

1. **Unadjusted**: the ordinary difference in means;
2. **CUPED**: adjustment using the pre-experiment covariate;
3. **Bad adjustment**: adjustment using a covariate contaminated by treatment.

The red estimator is intentionally wrong when **Post-treatment contamination**
is positive. It is there to make the failure visible.

<div id="cuped-lab" class="cuped-lab" data-cuped-lab>
  <div class="cuped-lab__controls">
    <label>
      Users per arm: <output data-value="usersPerArm">1,200</output>
      <input type="range" min="200" max="6000" step="100" value="1200" data-param="usersPerArm">
    </label>
    <label>
      True lift: <output data-value="trueLift">0.080</output>
      <input type="range" min="-0.20" max="0.30" step="0.01" value="0.08" data-param="trueLift">
    </label>
    <label>
      Pre-period correlation: <output data-value="correlation">65.0%</output>
      <input type="range" min="0" max="95" step="5" value="65" data-param="correlation">
    </label>
    <label>
      Pre-period coverage: <output data-value="coverage">100.0%</output>
      <input type="range" min="20" max="100" step="5" value="100" data-param="coverage">
    </label>
    <label>
      Post-treatment contamination: <output data-value="leakage">0.000%</output>
      <input type="range" min="0" max="220" step="10" value="0" data-param="leakage">
    </label>
    <label>
      Simulated experiments: <output data-value="trials">220</output>
      <input type="range" min="60" max="500" step="20" value="220" data-param="trials">
    </label>
  </div>
  <div class="cuped-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="680" aria-label="CUPED simulator showing repeated-experiment estimator distributions, variance reduction curve, covariate deltas, and one-trial confidence intervals"></canvas>
  <div class="cuped-lab__legend">
    <span><i style="background:#64748b"></i> Unadjusted</span>
    <span><i style="background:#0f766e"></i> Proper CUPED</span>
    <span><i style="background:#be123c"></i> Treatment-contaminated adjustment</span>
    <span><i style="background:#7c3aed"></i> True lift</span>
    <span><i style="background:#d97706"></i> Covariate imbalance</span>
  </div>
  <p class="cuped-lab__note">
    Deterministic synthetic experiment. Each trial randomizes equal treatment
    and control arms. CUPED uses a pooled control-variate coefficient estimated
    within the trial. Missing pre-period data are mean-imputed to zero in this
    toy model, which weakens the effective correlation and therefore the
    variance reduction.
  </p>
</div>
<script defer src="{{ '/assets/js/cuped-lab.js?v=20260613a' | relative_url }}"></script>

With the default settings, the pre-period covariate is strongly correlated with
the outcome. The unadjusted estimator is centered near the true lift, but its
distribution is wide. CUPED stays centered and tightens the distribution. The
detection rate rises because the same effect is being divided by a smaller
standard error.

Lower the pre-period correlation. The green distribution expands back toward
the gray one. CUPED is not magic; it is a variance trade powered by correlation.

Lower pre-period coverage. Users without pre-period data contribute less useful
baseline information. Deng et al. discuss this as a practical issue in online
systems, where new users, infrequent users, and cookie churn make covariates
partially missing.[^cuped] In the lab, lower coverage weakens the effective
correlation and the variance reduction fades.

Now raise post-treatment contamination. The red estimator can move
directionally wrong. The simulated treatment increases $$Y$$, and the bad
covariate also moves in treatment. The adjustment then "corrects" away part of
the effect:

$$
\hat{\Delta}_\mathrm{bad}
=
\hat{\Delta}_Y
- \hat{\theta}\hat{\Delta}_{X_\mathrm{bad}}.
$$

If $$X_\mathrm{bad}$$ is affected by treatment, then
$$E[\hat{\Delta}_{X_\mathrm{bad}}]\neq 0$$. That is bias, not sensitivity.

## The Estimand Did Not Move

The adjusted outcome can make CUPED look like it changes the metric. It does
not have to. The estimand is still the average treatment effect on $$Y$$. CUPED
changes the estimator by using baseline information to reduce noise.

A useful way to read the formula is:

```text
ordinary lift
minus
the part of the observed lift explained by accidental pre-period imbalance
```

If treatment users happened to have higher pre-period activity, the raw outcome
difference may be too high. CUPED subtracts some of that imbalance. If treatment
users happened to have lower pre-period activity, CUPED adds some back.

This is the same family of ideas as regression adjustment. Freedman warned that
randomization alone does not justify arbitrary regression models and that
adjustment can introduce bias or misleading variance estimates in finite
samples.[^freedman] Lin later showed that, under large-sample randomization
arguments, interacted regression adjustment can avoid the asymptotic precision
loss and can be at least as efficient as the unadjusted estimator, with robust
standard errors.[^lin]

The practical synthesis is not "always adjust" or "never adjust." It is:

```text
pre-specify valid covariates,
use robust uncertainty,
keep the estimand fixed,
audit the covariate timing
```

## The Line Treatment Must Not Cross

CUPED works because the covariate is not moved by treatment.

Pre-experiment page views? Usually valid.

Country, device class, historical spend, pre-period engagement? Often valid,
subject to identity and missingness issues.

Clicks during the experiment? Dangerous.

Session length after the treatment changes latency? Dangerous.

Early funnel behavior after exposure? Dangerous unless the estimand explicitly
conditions on that post-treatment event, which is a different causal question.

Deng et al. state the requirement directly: the covariate must not be affected
by the experiment's treatment; otherwise the adjusted delta can be biased.[^cuped]
Their paper includes a real Bing example where using a better-correlated
in-experiment covariate produced directionally incorrect results.

This is the most important line in the post:

```text
correlation is not validity
```

A post-treatment variable can be wonderfully predictive precisely because it is
on the causal path. Adjusting for it is then not variance reduction. It is
effect deletion.

## Faster Is Not Always Better

The seductive interpretation of variance reduction is:

```text
we can run shorter tests now
```

Sometimes yes. If CUPED cuts variance by 50 percent, the same standard error can
be reached with roughly half the sample size, all else equal. But "all else
equal" carries a lot:

- seasonality still needs time to reveal itself;
- novelty and learning effects may not be stable early;
- guardrail metrics may need more exposure;
- rare harms may need larger samples;
- delayed outcomes cannot be accelerated by pre-period covariates;
- interference and network effects can violate the unit-level story.

CUPED buys precision on the adjusted metric. It does not certify that the
experiment has run long enough to answer every product question.

## The Boring Parts That Decide It

The coefficient $$\theta$$ should be estimated in a way that does not use
treatment assignment to search for a favorable result. Estimating it from pooled
experiment data is common for CUPED because randomization preserves validity for
pre-treatment covariates, but the covariate set itself should be chosen before
looking at treatment effects.

Missing pre-period data are not a nuisance footnote. New users and churned
identifiers can differ systematically from returning users. A common approach is
to impute a constant and include a missingness indicator, which is equivalent to
separating users with and without pre-period observations. The right choice
depends on the assignment unit, identity system, and metric.

Ratio metrics deserve care. CUPED on a ratio can be done, but the numerator,
denominator, unit of analysis, and delta-method or bootstrap uncertainty need to
be clear. "Queries per user" and "click-through rate" are not the same
statistical object.

Clustered randomization changes the variance calculation. If teams randomize by
account, household, classroom, advertiser, geo, or marketplace side, user-level
standard errors can be overconfident.

Finally, CUPED does not fix peeking. A variance-reduced p-value is still a
p-value. If the experiment is monitored continuously and stopped when the
adjusted metric crosses a threshold, sequential inference issues remain.

## CUPED Intake

Before I would trust a CUPED analysis, I would want to know:

- what estimand remains after adjustment;
- which covariates were pre-specified;
- whether each covariate is pre-treatment or otherwise immune to treatment;
- how identity churn and missing pre-period data are handled;
- what correlation each covariate has with the outcome;
- what variance reduction was observed out of sample or in A/A tests;
- whether robust or randomization-based standard errors are used;
- whether ratio metrics are handled at the right unit;
- whether triggered analyses preserve the same timing rule;
- whether the dashboard still controls optional stopping.

The checklist is boring on purpose. Most CUPED failures are not algebra
failures. They are timing failures, identity failures, and interpretation
failures.

## Borrowed Memory

Randomization gives the experiment its moral authority.

CUPED gives it a memory.

It says: before treatment began, we already knew something about these users.
Let us not spend our experimental budget rediscovering that some people are
habitually high or low. Let us subtract the predictable past and test the
remaining surprise.

That is a beautiful bargain when the past is really past.

But the moment the covariate can be touched by treatment, the bargain changes.
The adjustment stops removing accidental imbalance and starts removing causal
effect. The estimator still produces a neat number. It may even produce a
smaller standard error. That is what makes the mistake dangerous.

Precision is only useful after validity.

## Reading Trail

[^cuped]: Alex Deng, Ya Xu, Ron Kohavi, and Toby Walker, ["Improving the Sensitivity of Online Controlled Experiments by Utilizing Pre-Experiment Data"](https://exp-platform.com/Documents/2013-02-CUPED-ImprovingSensitivityOfControlledExperiments.pdf), *WSDM*, 2013. [ACM record](https://dl.acm.org/doi/10.1145/2433396.2433413).

[^freedman]: David A. Freedman, ["On regression adjustments to experimental data"](https://www.stat.berkeley.edu/~census/neyregr.pdf), *Advances in Applied Mathematics*, 2008; and ["On regression adjustments in experiments with several treatments"](https://arxiv.org/pdf/0803.3757), *Annals of Applied Statistics*, 2008.

[^lin]: Winston Lin, ["Agnostic notes on regression adjustments to experimental data: Reexamining Freedman's critique"](https://arxiv.org/pdf/1208.2301), *Annals of Applied Statistics*, 2013. [Project Euclid](https://projecteuclid.org/journals/annals-of-applied-statistics/volume-7/issue-1/Agnostic-notes-on-regression-adjustments-to-experimental-data--Reexamining/10.1214/12-AOAS583.full).
