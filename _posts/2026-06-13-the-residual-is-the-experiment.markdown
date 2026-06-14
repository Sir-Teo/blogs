---
layout: post
title: "The Residual Is the Experiment"
description: "Double machine learning does not make confounding disappear. It builds an orthogonal residual score so flexible prediction errors hit the causal estimate only at second order."
date: 2026-06-13 23:40:00 -0400
categories: statistics
tags: [double-machine-learning, causal-inference, orthogonalization, semiparametrics, statistics, econometrics]
excerpt: "A causal effect estimate should not inherit every small mistake made by a flexible prediction model. Orthogonal scores are how double machine learning buys that robustness."
---

Machine learning is very good at predicting the parts of an outcome that are
not the treatment.

That sounds like exactly what causal inference needs. Suppose we want to know
the effect of a treatment, price change, notification, interface, policy, or
exposure. We have many covariates. We fit a powerful model for the outcome. We
"control for" the covariates. We read off the treatment coefficient.

This is where the trap opens.

Prediction models are built to predict. They regularize, select variables,
average trees, stop early, shrink coefficients, and trade bias for variance. A
tiny predictive bias can become a first-order causal bias if it is plugged into
the wrong estimating equation.

Double machine learning is not the claim that machine learning solves causal
identification. It is a narrower, more useful claim:

```text
if the causal parameter is identified,
and the nuisance prediction problems are learned well enough,
then use a score whose first derivative with respect to those nuisances is zero.
```

The magic word is **orthogonal**.

## A partially linear promise

The cleanest version is the partially linear model:

$$
Y = \theta_0 D + g_0(X) + \zeta,
$$

$$
D = m_0(X) + \nu.
$$

Here $$Y$$ is the outcome, $$D$$ is the treatment or exposure, $$X$$ is a vector
of observed controls, and $$\theta_0$$ is the low-dimensional number we care
about. If treatment is as-good-as-random after conditioning on $$X$$, then
$$\theta_0$$ can be read causally. If that identification story is false, no
amount of orthogonalization repairs it.

Robinson's 1988 semiparametric estimator already contains the main idea: remove
from both $$Y$$ and $$D$$ the parts predictable from $$X$$, then regress the
outcome residual on the treatment residual.[^robinson]

The residual treatment is:

$$
V = D - m_0(X).
$$

The residual outcome is:

$$
U = Y - \ell_0(X),
$$

where $$\ell_0(X)=E[Y\mid X]$$. In the partially linear model,
$$\ell_0(X)=\theta_0m_0(X)+g_0(X)$$. The orthogonal score is:

$$
\psi(W;\theta,\ell,m)=\{Y-\ell(X)-\theta(D-m(X))\}\{D-m(X)\}.
$$

Setting its sample average to zero gives:

$$
\hat{\theta}
=
\frac{\sum_i (D_i-\hat m(X_i))(Y_i-\hat\ell(X_i))}
       {\sum_i (D_i-\hat m(X_i))^2}.
$$

This formula is easy to underestimate. It is not just "control for $$X$$." It
is a residual experiment: compare outcome residuals only along variation in
treatment that the controls did not predict.

## Why residualize both sides?

The tempting half-step is to predict the outcome from controls, subtract that
prediction, and regress the remaining outcome on the raw treatment. The lab
below calls this **outcome-only** residualization.

It is wrong for a simple reason. The raw treatment still contains the predictable
component $$m_0(X)$$. Even if the outcome residual is perfect,

$$
Y-\ell_0(X)=\theta_0(D-m_0(X))+\zeta.
$$

Regressing that on raw $$D$$ divides by variation in both $$m_0(X)$$ and
$$D-m_0(X)$$. The treatment signal is diluted by predictable treatment movement.

The treatment must be residualized too.

That is the same instinct behind the Frisch-Waugh-Lovell theorem in ordinary
linear regression, but DML moves the nuisance fits outside the linear comfort
zone.

## Orthogonality buys error tolerance

Chernozhukov, Chetverikov, Demirer, Duflo, Hansen, Newey, and Robins formalized
double/debiased machine learning for treatment and structural parameters.[^dml]
Their two recurring ingredients are:

1. **Neyman-orthogonal scores:** the population moment is locally insensitive to
   first-order nuisance errors.
2. **Cross-fitting:** nuisance models are trained on one fold and scored on
   held-out observations, reducing overfitting bias and avoiding classical
   empirical-process restrictions that are too brittle for modern ML.

For the partially linear score above, the first-order derivative with respect to
the nuisance functions vanishes at the truth. Informally, if $$\hat\ell$$ and
$$\hat m$$ are a little wrong, their first-order errors cancel. The remaining
effect is roughly a product of nuisance errors rather than their sum.

That product structure is the practical miracle. Two imperfect prediction
models can still give a good low-dimensional causal estimate if their errors are
small enough in the right norms.

Belloni, Chernozhukov, and Hansen's post-double-selection work is a close
ancestor in high-dimensional linear settings: select controls useful for the
outcome and controls useful for the treatment, then estimate with the union so
an omitted confounder has fewer places to hide.[^pds] DML generalizes the same
fear into a semiparametric score: nuisance estimation is allowed to be flexible,
but the final moment must protect the target parameter from nuisance mistakes.

## A residual lab

The simulator below creates data from a partially linear model. The true effect
is fixed at $$\theta_0=0.7$$. A nonlinear function of $$X$$ affects both the
treatment and the outcome. The nuisance learner tries to predict $$E[Y\mid X]$$
and $$E[D\mid X]$$ using a small ridge regression basis.

Four estimators are compared across many simulated worlds:

- **Naive:** regress $$Y$$ on $$D$$ and ignore $$X$$.
- **Outcome-only:** subtract predicted $$E[Y\mid X]$$, but do not residualize
  treatment.
- **Same-sample DML:** residualize both sides using nuisance fits trained on the
  same observations.
- **Cross-fit DML:** residualize both sides using held-out nuisance predictions.

<style>
  .dml-lab {
    background: #ffffff;
    border: 1px solid #d8e0e8;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .dml-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
  }

  .dml-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .dml-lab__controls input,
  .dml-lab__controls select {
    accent-color: #0f766e;
    box-sizing: border-box;
    width: 100%;
  }

  .dml-lab__controls select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
  }

  .dml-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .dml-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .dml-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .dml-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.42);
  }

  .dml-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .dml-lab__metric span,
  .dml-lab__note,
  .dml-lab__legend {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .dml-lab__metric span {
    display: block;
  }

  .dml-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.18rem;
    line-height: 1.25;
    margin-top: 0.22rem;
  }

  .dml-lab canvas {
    display: block;
    max-width: 100%;
  }

  .dml-lab__legend {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.7rem;
  }

  .dml-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .dml-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .dml-lab__note {
    margin: 0.65rem 0 0;
  }
</style>

<div id="dml-residual-lab" class="dml-lab" data-dml-lab>
  <div class="dml-lab__controls">
    <label>
      Sample size: <output data-value="n">480</output>
      <input type="range" min="160" max="900" step="20" value="480" data-param="n">
    </label>
    <label>
      Confounding: <output data-value="confounding">1.25x</output>
      <input type="range" min="0" max="2" step="0.25" value="1.25" data-param="confounding">
    </label>
    <label>
      Outcome roughness: <output data-value="roughness">1.00x</output>
      <input type="range" min="0.4" max="1.6" step="0.2" value="1" data-param="roughness">
    </label>
    <label>
      Nuisance learner: <output data-value="learner">rbf</output>
      <select data-param="learner">
        <option value="linear">Linear</option>
        <option value="cubic">Cubic</option>
        <option value="rbf" selected>RBF basis</option>
        <option value="wiggly">Wiggly RBF</option>
      </select>
    </label>
    <label>
      Ridge penalty: <output data-value="lambda">light</output>
      <select data-param="lambda">
        <option value="0">None</option>
        <option value="0.0001">Tiny</option>
        <option value="0.01" selected>Light</option>
        <option value="0.3">Medium</option>
        <option value="3">Strong</option>
      </select>
    </label>
    <label>
      Cross-fit folds: <output data-value="folds">5</output>
      <select data-param="folds">
        <option value="2">2</option>
        <option value="5" selected>5</option>
        <option value="10">10</option>
      </select>
    </label>
    <label>
      Repeated worlds: <output data-value="reps">60</output>
      <select data-param="reps">
        <option value="30">30</option>
        <option value="60" selected>60</option>
        <option value="100">100</option>
      </select>
    </label>
    <label>
      Highlight: <output data-value="highlight">cross-fit DML</output>
      <select data-param="highlight">
        <option value="crossFit" selected>Cross-fit DML</option>
        <option value="sameSample">Same-sample DML</option>
        <option value="residualY">Outcome-only</option>
        <option value="naive">Naive</option>
      </select>
    </label>
  </div>
  <div class="dml-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="620" aria-label="Double machine learning residual simulator showing residual scatter, estimator distributions, and bias bars"></canvas>
  <div class="dml-lab__legend">
    <span><i style="background:#0f766e"></i> cross-fit DML</span>
    <span><i style="background:#2563eb"></i> same-sample DML</span>
    <span><i style="background:#be123c"></i> outcome-only</span>
    <span><i style="background:#b45309"></i> naive</span>
    <span><i style="background:#172026"></i> true effect</span>
  </div>
  <p class="dml-lab__note">
    Deterministic simulation. The true treatment effect is 0.7. The interval
    coverage metric uses the cross-fit DML sandwich standard error in repeated
    simulated worlds.
  </p>
</div>
<script defer src="{{ '/assets/js/dml-residual-lab.js' | relative_url }}"></script>

Try three small experiments.

First, set `Confounding` to zero. The naive estimator becomes much less
interesting because treatment is no longer predictable from $$X$$. Residualizing
treatment cannot save much when there is little confounding to remove.

Second, switch `Nuisance learner` to `Linear`. The nuisance functions in the lab
are nonlinear, so the linear learner leaves confounding in the residuals. DML is
not magic. Orthogonality protects against small nuisance errors; it does not
turn a bad control model into a good one.

Third, choose `Wiggly RBF` with no ridge penalty, especially at small sample
sizes. The nuisance learner becomes unstable. Cross-fitting is important, but it
is not a license to use pathological nuisance models. The score is robust to
first-order nuisance error, not to numerical chaos.

## What the score is saying

The cross-fit DML scatter plot is the essay in miniature. The horizontal axis is
the residualized treatment:

$$
\hat V_i = D_i-\hat m^{(-k(i))}(X_i),
$$

where the superscript means the prediction was made by a model that did not
train on observation $$i$$. The vertical axis is the residualized outcome:

$$
\hat U_i = Y_i-\hat\ell^{(-k(i))}(X_i).
$$

The final estimate is the slope through that residual cloud.

If the causal story is right, this residualized treatment is the part of
treatment not explained by observed controls. It is the variation we are willing
to compare on. This is why the residual is not a preprocessing artifact. It is
the estimand's measuring instrument.

## What DML does not buy

DML is easy to misuse because the word "machine learning" gives it product
energy. The method is not an identification machine.

It does not solve unobserved confounding. It does not decide which covariates are
legitimate controls. It does not fix post-treatment controls, interference,
measurement error, selection bias, weak overlap, or a treatment whose meaning
changes across units. It does not guarantee that a black-box nuisance model is
good enough for the target parameter. It does not make the final estimate immune
to extrapolation.

The right mental model is humbler and more powerful:

```text
causal design chooses the moment;
machine learning estimates nuisance functions;
orthogonality prevents nuisance estimation from dominating the target;
cross-fitting keeps scoring honest.
```

That is already a lot.

## A checklist I would actually use

Before trusting a DML estimate, I would ask:

- What is the identifying assumption, in words?
- Which controls are pre-treatment, and which are forbidden?
- Is there overlap in the residualized treatment, or are we extrapolating?
- Are nuisance predictions evaluated out of sample?
- Does the estimate move smoothly as learner classes and regularization change?
- Are nuisance errors plausibly small enough, or merely impressive on aggregate
  prediction metrics?
- Does residual treatment still correlate with obvious functions of $$X$$?
- Are standard errors clustered or grouped in the same way the data were
  generated?
- Is the target parameter constant enough for a partially linear summary to be
  meaningful?

The lab above is friendly because all confounders are observed and the data
really are partially linear. Real applications are less polite.

## Research direction

The diagnostic I want to see more often is a residual audit.

For every DML estimate, show the residualized treatment distribution, residual
treatment balance against covariates, sensitivity across nuisance learners, and
the contribution of high-leverage residual observations to the final score.

In symbols, the final estimate solves an average score. In a dashboard, that
score should be inspectable observation by observation. Which points are moving
the estimate? Which folds disagree? Which covariate regions have no residual
treatment variation? Which nuisance learner changes the answer?

If the residual is the experiment, then audit the experiment.

## Notes

[^robinson]: Peter M. Robinson, "Root-N-Consistent Semiparametric Regression," *Econometrica*, 1988. [JSTOR](https://www.jstor.org/stable/1912705).

[^dml]: Victor Chernozhukov, Denis Chetverikov, Mert Demirer, Esther Duflo, Christian Hansen, Whitney Newey, and James Robins, "Double/debiased machine learning for treatment and structural parameters," *The Econometrics Journal*, 2018. [Oxford Academic](https://academic.oup.com/ectj/article/21/1/C1/5056401), [arXiv](https://arxiv.org/abs/1608.00060).

[^pds]: Alexandre Belloni, Victor Chernozhukov, and Christian Hansen, "Inference on Treatment Effects after Selection among High-Dimensional Controls," *The Review of Economic Studies*, 2014. [Oxford Academic](https://academic.oup.com/restud/article/81/2/608/1523757).
