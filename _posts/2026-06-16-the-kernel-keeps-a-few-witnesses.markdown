---
layout: post
title: "The Kernel Keeps a Few Witnesses"
description: "Nystrom kernel approximation replaces a full Gram matrix with a few landmark columns. The hard part is not the formula; it is choosing which witnesses speak for the matrix."
date: 2026-06-16 20:40:00 -0400
categories: machine-learning
tags: [nystrom-method, kernel-methods, kernel-ridge-regression, low-rank-approximation, leverage-scores, randomized-linear-algebra, machine-learning]
excerpt: "A kernel matrix can be too large to keep. Nystrom says: keep a few columns. The question is which columns, and what kind of error you actually care about."
---

A kernel method begins with a beautiful lie:

```text
we can reason in a high-dimensional feature space without writing the features
down
```

For points $$x_1,\ldots,x_n$$, the kernel matrix

$$
K_{ij}=k(x_i,x_j)
$$

acts as the table of all inner products in that hidden space. Support vector
machines, kernel ridge regression, Gaussian processes, spectral clustering,
kernel PCA: they all learn by touching this table.

Then $$n$$ grows.

The table is $$n\times n$$. Storing it is quadratic. Factoring it is often
cubic. The elegant feature-space trick becomes a memory bill.

The Nystrom move is wonderfully blunt:

```text
keep some columns
```

If $$C$$ is the matrix of selected columns of $$K$$, and $$W$$ is the small
intersection matrix between those selected rows and columns, approximate

$$
K \approx C W^+ C^T.
$$

The formula fits on one line. The problem does not.

The problem is witness selection.

## Columns Are Witnesses

A column of a kernel matrix is not just a column. It is one training point's
similarity story about every other training point.

Keeping a landmark point says:

```text
this point's relationships are useful enough to represent many other
relationships
```

If the landmarks span the important directions of the hidden feature matrix,
the approximation works. If they miss a narrow cluster, a boundary region, or
an isolated high-leverage point, the matrix can look cheap and the downstream
prediction can still pay later.

Williams and Seeger helped bring the Nystrom method into kernel machines,
showing how a subset of columns can approximate the eigendecomposition of a
large Gram matrix and reduce kernel-machine computation.[^williams-seeger]
Drineas and Mahoney then put the column-sampling question into the language of
randomized matrix approximation, emphasizing that the sampling distribution is
not an implementation detail.[^drineas-mahoney]

That is the right frame:

```text
Nystrom is not a compression format; it is a sampling policy
```

## A Landmark Lab

The lab below builds a synthetic two-dimensional regression problem. It forms
the full RBF kernel matrix, fits exact kernel ridge regression, then replaces
the full kernel with a Nystrom approximation.

It compares three landmark policies:

- **uniform**, a deterministic random-looking subset;
- **farthest-point**, a geometric coverage rule in input space;
- **ridge leverage**, an oracle diagnostic that keeps points with large
  diagonal entries of $$K(K+\lambda I)^{-1}$$.

The ridge-leverage option is deliberately labeled as a diagnostic. The browser
computes it from the full kernel matrix, so it is not a scalable production
algorithm. It is there to show what the statistical difficulty of the kernel
ridge problem thinks is important.

<style>
  .nys-lab {
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

  .nys-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .nys-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .nys-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .nys-lab input,
  .nys-lab select {
    accent-color: #7c3aed;
    width: 100%;
  }

  .nys-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .nys-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .nys-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .nys-lab__metric span,
  .nys-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .nys-lab__metric span {
    display: block;
  }

  .nys-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .nys-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .nys-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="nystrom-landmark-lab" class="nys-lab" data-nystrom-landmark-lab>
  <div class="nys-lab__controls">
    <label>
      Scenario
      <select data-param="scenario">
        <option value="islands" selected>clustered islands</option>
        <option value="crescent">curved manifold</option>
        <option value="tail">core plus tail</option>
      </select>
    </label>
    <label>
      Landmark policy
      <select data-param="strategy">
        <option value="uniform">uniform</option>
        <option value="farthest">farthest-point</option>
        <option value="leverage" selected>ridge leverage</option>
      </select>
    </label>
    <label>
      Points: <output data-value="n">72</output>
      <input type="range" min="32" max="112" step="4" value="72" data-param="n">
    </label>
    <label>
      Landmarks: <output data-value="landmarks">14</output>
      <input type="range" min="4" max="48" step="1" value="14" data-param="landmarks">
    </label>
    <label>
      Lengthscale: <output data-value="lengthscale">28%</output>
      <input type="range" min="8" max="70" step="1" value="28" data-param="lengthscale">
    </label>
    <label>
      Label noise: <output data-value="noise">8%</output>
      <input type="range" min="0" max="35" step="1" value="8" data-param="noise">
    </label>
    <label>
      Ridge lambda: <output data-value="ridgeExp">1e-2</output>
      <input type="range" min="-5" max="0" step="1" value="-2" data-param="ridgeExp">
    </label>
    <label>
      Seed: <output data-value="seed">37</output>
      <input type="range" min="1" max="997" step="1" value="37" data-param="seed">
    </label>
  </div>
  <div class="nys-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="760" aria-label="Nystrom landmark lab showing selected kernel columns, matrix approximation error, landmark budget sweep, and kernel ridge regression prediction metrics"></canvas>
  <p class="nys-lab__note">
    Deterministic browser experiment. The ridge-leverage option computes
    diagonal entries of K(K + lambda I)^-1 from the full kernel, so treat it as
    an oracle diagnostic for this small problem, not a scalable implementation.
  </p>
</div>
<script defer src="{{ '/assets/js/nystrom-landmark-lab.js?v=20260616a' | relative_url }}"></script>

The default run keeps `14` columns from a `72 x 72` kernel matrix. The effective
dimension, measured as the sum of the ridge leverage scores, is about `33.8`.
So the default is intentionally under-budgeted.

In the lab audit, the ridge-leverage policy captures more leverage mass than
the uniform sample, but its full-matrix Frobenius error can look worse. That is
not a bug. It is the lesson.

Uniform landmarks may cover the average kernel matrix well. Ridge-leverage
landmarks may focus on points that matter more for kernel ridge regression.
Farthest-point landmarks may cover the geometry of input space while ignoring
where the target function is hard.

Those are three different currencies:

```text
matrix reconstruction
geometric coverage
statistical prediction
```

The Nystrom formula does not choose among them. The landmark policy does.

## The Matrix Error Is Not The Whole Loss

The heatmap panel shows

$$
|K-CW^+C^T|.
$$

This is the obvious numerical linear algebra view: how much of the Gram matrix
did the landmark columns fail to reconstruct?

It is a useful view. It is not the whole view.

Kernel ridge regression solves

$$
\alpha = (K+\lambda I)^{-1}y.
$$

The downstream predictor is not equally sensitive to every entry of $$K$$. The
regularization $$\lambda$$ damps some directions. The target vector $$y$$ loads
some directions more than others. A small-looking matrix error can hurt
prediction if it lands in a direction the regression actually uses. A
large-looking matrix error can matter less if it lives in a direction the ridge
penalty suppresses.

That is why the lab reports both:

- **kernel error**, a relative Frobenius error in the Gram matrix;
- **prediction gap**, the RMSE between exact KRR predictions and Nystrom KRR
  predictions;
- **Nystrom RMSE**, error against the known latent function.

When those disagree, believe the disagreement. It is telling you which problem
you are solving.

## Why Leverage Scores Enter

For a positive semidefinite kernel matrix, the ridge leverage score

$$
\ell_i(\lambda)
=
\left[K(K+\lambda I)^{-1}\right]_{ii}
$$

measures how much point $$i$$ participates in the effective degrees of freedom
of kernel ridge regression. Summing these scores gives

$$
d_{\mathrm{eff}}(\lambda)
=
\operatorname{tr}\!\left(K(K+\lambda I)^{-1}\right),
$$

which is the effective dimension of the regularized problem.

Bach's sharp analysis showed that, for kernel ridge regression, the number of
columns needed by random subset approximations can be tied to this
degrees-of-freedom quantity rather than to a crude ambient dimension.[^bach] El
Alaoui and Mahoney extended this statistical view into fast randomized kernel
ridge regression guarantees based on approximate ridge leverage scores.[^alaoui-mahoney]

This is the pleasant version of the story:

```text
sample columns in proportion to the directions the regularized learner can
actually use
```

The unpleasant version is that computing exact leverage scores already requires
too much knowledge of the full matrix. Practical algorithms approximate them,
use recursive sampling, use random features, cluster landmarks, mix strategies,
or accept a looser guarantee.

The lab is small enough to show the idealized receipt. It is not pretending the
receipt is free.

## Lengthscale Decides The Witness Problem

Move **Lengthscale** down.

The RBF kernel becomes local. Each point mostly speaks for nearby points. The
kernel matrix approaches a spiky table, and the number of landmarks needed
rises. A few columns cannot represent many isolated neighborhoods.

Move **Lengthscale** up.

The kernel becomes smoother. Many rows of the Gram matrix look similar. A small
set of witnesses can speak for more of the table, and the effective dimension
falls.

This is a good way to read kernel hyperparameters operationally. A short
lengthscale does not only say "the function can wiggle." It says:

```text
the Gram matrix has more local stories to remember
```

That memory bill shows up whether you pay it with full kernel methods,
landmarks, random Fourier features, inducing points, or sparse Gaussian process
approximations.

## The Subset Is A Model Choice

It is tempting to treat the landmark subset as an acceleration detail:

```text
same model, faster implementation
```

Sometimes that is a reasonable approximation. But in a finite budget, the
subset changes the model. It changes which neighborhoods can be represented,
which eigen-directions survive, which training points can exert influence, and
which test points receive sensible similarities.

Gittens and Mahoney's later review makes this point from the large-scale matrix
approximation side: Nystrom methods are part of a family of randomized
low-rank approximations, and their behavior depends heavily on coherence,
sampling, and the target task.[^gittens-mahoney]

For a real system, I would want the Nystrom report to include:

- the landmark policy, not just the landmark count;
- a sweep over landmark budgets;
- the kernel hyperparameters and regularization;
- matrix approximation error and downstream validation error;
- leverage-score or coverage diagnostics;
- stability across seeds;
- a comparison to random features or a full-kernel run on a smaller sample;
- the failure case where the landmark budget is too small.

The last item matters. A compression method that never shows where it breaks is
not a method. It is a sales page.

## Keep The Witnesses Honest

The Nystrom approximation is attractive because it keeps the kernel story
interpretable. Unlike a dense random projection, a landmark column is a real
example. You can look at it and ask why it was kept.

That is also the danger. A real example feels like evidence. But a chosen
example is evidence under a sampling policy. Uniform sampling answers one
question. Farthest-point traversal answers another. Ridge leverage answers
another. Clustering answers another. Determinantal point processes, recursive
sampling, and approximate leverage algorithms answer still others.

The one-line formula is:

$$
K \approx C W^+ C^T.
$$

The real question is:

```text
which columns get to tell the story?
```

In kernel methods, every row is a relationship to the whole dataset. Keeping a
few rows is an editorial act. The witnesses may be honest, but they are not
neutral.

## Paper Trail

[^williams-seeger]: Christopher K. I. Williams and Matthias Seeger, ["Using the Nystrom Method to Speed Up Kernel Machines"](https://papers.nips.cc/paper/1866-using-the-nystrom-method-to-speed-up-k), *NeurIPS*, 2000.

[^drineas-mahoney]: Petros Drineas and Michael W. Mahoney, ["On the Nystrom Method for Approximating a Gram Matrix for Improved Kernel-Based Learning"](https://jmlr.org/papers/v6/drineas05a.html), *Journal of Machine Learning Research*, 6, 2005, pp. 2153-2175.

[^bach]: Francis Bach, ["Sharp Analysis of Low-Rank Kernel Matrix Approximations"](https://arxiv.org/abs/1208.2015), *COLT*, 2013. Proceedings PDF: [PMLR](https://proceedings.mlr.press/v30/Bach13.pdf).

[^alaoui-mahoney]: Ahmed El Alaoui and Michael W. Mahoney, ["Fast Randomized Kernel Ridge Regression with Statistical Guarantees"](https://papers.nips.cc/paper/5716-fast-randomized-kernel-ridge-regression-with-statistical-guarantees), *NeurIPS*, 2015. Author PDF: [Berkeley](https://www.stat.berkeley.edu/~mmahoney/pubs/elalaoui-nips15.pdf).

[^gittens-mahoney]: Alex Gittens and Michael W. Mahoney, ["Revisiting the Nystrom Method for Improved Large-scale Machine Learning"](https://www.jmlr.org/papers/v17/gittens16a.html), *Journal of Machine Learning Research*, 17, 2016.
