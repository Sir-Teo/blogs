---
layout: post
title: "Ask Random Vectors for the Trace"
description: "Hutchinson's estimator turns random vectors into a matrix-free trace meter. The trick is unbiased; the hard part is controlling variance when the spectrum has a few loud directions."
date: 2026-06-14 17:25:00 -0400
categories: applied-math
tags: [hutchinson-estimator, trace-estimation, randomized-numerical-linear-algebra, hutchplusplus, matrix-free-methods, machine-learning]
excerpt: "If you can multiply by a matrix but cannot afford to look at its diagonal, random quadratic forms can still report the trace."
---

Imagine a matrix behind a curtain.

You are not allowed to read its diagonal. You are not allowed to form it. You
are only allowed to hand it a vector and receive the product back.

This sounds like a bad way to compute a trace. The trace is the diagonal sum:

```text
tr(A) = A_11 + A_22 + ... + A_nn
```

If the diagonal is hidden, what could a random vector possibly know?

The answer is one of those small pieces of randomized numerical linear algebra
that feels like a magic trick until you write the expectation:

```text
E[z z^T] = I
```

Then:

$$
\mathbb{E}[z^\top A z]
= \mathbb{E}[\mathrm{tr}(z^\top A z)]
= \mathbb{E}[\mathrm{tr}(Azz^\top)]
= \mathrm{tr}(A).
$$

The trace can be heard through noise.

This is the Hutchinson trace estimator. Draw random probe vectors, compute the
quadratic forms \(z^\top A z\), and average them. Hutchinson's original 1989
paper used Rademacher probes, entries independently equal to `+1` or `-1`, to
estimate traces of influence matrices in smoothing-spline calculations.[^hutch]
The same primitive now appears in large-scale statistics, scientific computing,
machine learning, graph algorithms, and continuous normalizing flows.

It is not powerful because it is fancy. It is powerful because a lot of modern
matrices are easier to multiply by than to inspect.

## Curtain Is Normal

In a small textbook problem, the matrix is an array.

In real computation, it is often a procedure:

```text
Hessian-vector product
Jacobian-vector product
linear solve
kernel operator
graph diffusion
implicit covariance
automatic-differentiation closure
```

The matrix may have \(10^8\) entries, but a product \(Av\) may be cheap because
it is computed by backpropagation, a sparse operator, an iterative method, or a
structured kernel. If all you need is a global scalar such as trace, effective
dimension, divergence, log-determinant, or a spectral moment, materializing the
whole object can be the wrong shape of work.

The trace estimator changes the access pattern:

```text
do not ask for entries
ask for actions
```

That is why the formula keeps reappearing.

For a random vector with zero mean and identity covariance:

$$
\mathbb{E}[z_i z_j] =
\begin{cases}
1, & i=j,\\
0, & i\ne j.
\end{cases}
$$

Expand the quadratic form:

$$
z^\top A z = \sum_i A_{ii} z_i^2 + \sum_{i\ne j} A_{ij}z_iz_j.
$$

The diagonal terms survive in expectation. The cross terms cancel.

That is the whole unbiasedness proof.

## The Catch Is Variance

Unbiased is not the same as useful.

If one probe gives:

```text
estimate = z^T A z
```

then the Monte Carlo average over `m` probes converges at the usual
\(1/\sqrt{m}\) rate. The key question is how noisy each quadratic form is.

For a symmetric matrix and Gaussian probes, the single-probe variance is:

$$
2\|A\|_F^2.
$$

For Rademacher probes, it is:

$$
2\left(\|A\|_F^2-\sum_i A_{ii}^2\right).
$$

That second formula explains a delightful edge case: if \(A\) is diagonal,
Rademacher Hutchinson is exact in one probe, because \(z_i^2=1\). Gaussian
probes still fluctuate because \(z_i^2\) fluctuates.

So the question is not merely:

```text
Is the estimator unbiased?
```

The useful question is:

```text
Where does the variance live?
```

Avron and Toledo's 2011 analysis made this practical concern explicit by
studying sample counts needed for relative-error guarantees, rather than only
comparing variance formulas.[^avron] Bounds matter because production users do
not ask, "Is the estimator elegant?" They ask, "How many matvecs do I need?"

## A Trace Meter

The lab below builds small synthetic positive semidefinite matrices and then
pretends they are implicit. The code knows the exact trace for auditing, but the
estimators only use matrix-vector products.

The blue estimator is classic Hutchinson with the selected probe distribution.
The green estimator is Hutch++, which spends part of the same matvec budget to
learn a small dominant subspace before probing the residual.[^hpp]

The default matrix is spiked: five directions carry about `76%` of the trace,
and the effective rank is about `5.4`. With the default seed and `36` matvecs,
the exact trace is `63.74`. One Hutchinson run lands at `77.27`, while Hutch++
lands at `64.88`. Over repeated trials, the relative RMSE is about `9.5%` for
classic Hutchinson and `1.4%` for Hutch++.

That is the modern story in miniature: first remove the loud room, then measure
the quieter remainder.

I audited the lab before rewriting. The default matrix has trace 63.741,
top-five trace mass 76.22%, effective rank 5.44, and Hutch++ uses all 36 allowed
matvecs. The built-in checks confirm symmetry, finite positive trace,
trace-diagonal consistency, and budget respect. A 432-case sweep over spectrum
shape, probe distribution, matvec budget, dimension, trial count, and seed had
no check failures. Hutch++ beat classic Hutchinson in 123 cases and lost or tied
in 309, which is exactly the caveat the article needs: deflation helps when
there is a loud subspace. In all 54 diagonal/Rademacher cases, classic
Hutchinson was exact.

<style>
  .hutch-lab {
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

  .hutch-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .hutch-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .hutch-lab__controls input,
  .hutch-lab__controls select {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .hutch-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .hutch-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .hutch-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .hutch-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .hutch-lab__metric span,
  .hutch-lab__legend,
  .hutch-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .hutch-lab__metric span {
    display: block;
  }

  .hutch-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .hutch-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .hutch-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .hutch-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .hutch-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .hutch-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .hutch-lab {
      padding: 0.82rem;
    }

    .hutch-lab__controls,
    .hutch-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .hutch-lab canvas {
      height: 1100px;
    }
  }
</style>

<div class="hutch-lab" data-hutchinson-trace-lab>
  <div class="hutch-lab__controls">
    <label>
      Matrix <output data-value="matrix">spiked low rank</output>
      <select data-param="matrix" aria-label="Matrix type">
        <option value="spiked" selected>spiked low rank</option>
        <option value="power">slow power tail</option>
        <option value="flat">flat spectrum</option>
        <option value="diagonal">diagonal smoother</option>
      </select>
    </label>
    <label>
      Classic probe <output data-value="probe">Rademacher</output>
      <select data-param="probe" aria-label="Classic Hutchinson probe distribution">
        <option value="rademacher" selected>Rademacher</option>
        <option value="gaussian">Gaussian</option>
      </select>
    </label>
    <label>
      Matvec budget <output data-value="probes">36</output>
      <input type="range" min="6" max="72" step="3" value="36" data-param="probes" aria-label="Matrix-vector product budget">
    </label>
    <label>
      Dimension <output data-value="dimension">72</output>
      <input type="range" min="36" max="108" step="6" value="72" data-param="dimension" aria-label="Matrix dimension">
    </label>
    <label>
      Trials <output data-value="trials">72</output>
      <input type="range" min="24" max="144" step="12" value="72" data-param="trials" aria-label="Repeated trial count">
    </label>
    <label>
      Seed <output data-value="seed">29</output>
      <input type="range" min="1" max="9999" step="1" value="29" data-param="seed" aria-label="Random seed">
    </label>
  </div>
  <div class="hutch-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Hutchinson trace estimation lab comparing random probes, Hutch++, spectrum shape, and repeated-trial error"></canvas>
  <div class="hutch-lab__legend">
    <span><i style="background:#2563eb"></i>Hutchinson</span>
    <span><i style="background:#0f766e"></i>Hutch++</span>
    <span><i style="background:#be123c"></i>Exact trace</span>
    <span><i style="background:#7c3aed"></i>Spectrum tail</span>
    <span><i style="background:#b45309"></i>Matrix entries</span>
  </div>
  <p class="hutch-lab__note">
    Deterministic toy model. Matrices are explicit only for auditing and
    visualization; the estimators use matrix-vector products. Hutch++ uses
    Gaussian sketch and residual probes, while the classic estimator uses the
    selected probe distribution.
  </p>
</div>

<script defer src="{{ '/assets/js/hutchinson-trace-lab.js?v=20260614a' | relative_url }}"></script>

Try four moves.

First, keep **spiked low rank** and lower the budget. Hutch++ often remains
stable because the random range sketch captures much of the large eigenspace.
The residual trace is smaller and its Frobenius norm is much smaller.

Second, switch to **flat spectrum**. The advantage shrinks. There is no small
room to discover, so using part of the budget to build a low-rank sketch may
not pay for itself.

Third, switch to **diagonal smoother** with **Rademacher** probes. Classic
Hutchinson becomes exact, because all off-diagonal variance is gone and
Rademacher squares are identically one. Now switch to **Gaussian** probes. The
same diagonal trace starts wobbling again.

Fourth, use **slow power tail** and increase the budget. The estimator improves,
but slowly. This is the quiet lesson: Monte Carlo does not care how badly you
want more digits. If the variance is there, it has to be paid down.

## Hutch++ Is a Variance Budget

Hutch++ starts from the observation that not all variance deserves the same
treatment.

If a positive semidefinite matrix has a few huge eigenvalues, a plain random
quadratic form can be dominated by whether the probe happened to point into
those directions. Averaging fixes this eventually, but eventually can be a lot
of matvecs.

Hutch++ spends roughly one third of the budget on a sketch:

```text
Y = A S
Q = orth(Y)
```

Then it computes the trace captured by that subspace:

```text
tr(Q^T A Q)
```

and uses Hutchinson only on the residual:

```text
(I - QQ^T) A (I - QQ^T)
```

That is the low-rank-plus-residual pattern. Do deterministic work where the
matrix is loud, use randomness where the matrix is quieter.

Meyer, Musco, Musco, and Woodruff show that Hutch++ can obtain a
\((1\pm\epsilon)\) approximation for positive semidefinite matrices using
\(O(1/\epsilon)\) matrix-vector products, improving the \(O(1/\epsilon^2)\)
dependence of classic Hutchinson in that setting.[^hpp]

The lab is not a proof of that theorem. It is the visual shape of the theorem:
when spectral mass is concentrated, deflation changes the game.

## Why Trace Estimation Shows Up In ML

The trace is not always the final quantity. Often it is the inside of a larger
quantity.

For a positive definite matrix \(K\), a log-determinant can be written as:

$$
\log\det(K)=\mathrm{tr}(\log K).
$$

That turns a determinant problem into a trace-of-a-matrix-function problem. You
still need to approximate \(\log(K)v\), but now matrix-vector products and
Krylov methods enter the room. Ubaru, Chen, and Saad combine stochastic trace
estimation with Lanczos quadrature for estimating \(\mathrm{tr}(f(A))\),
including log-determinants, Schatten norms, trace inverses, and related
quantities in machine learning and scientific computing.[^slq]

Continuous normalizing flows give a different example. The instantaneous
change-of-variables formula contains the trace of a Jacobian:

$$
\frac{d}{dt}\log p(z(t))
= -\mathrm{tr}\left(\frac{\partial f}{\partial z(t)}\right).
$$

Computing the exact Jacobian trace can be expensive in high dimension. FFJORD
uses Hutchinson's estimator to get a scalable unbiased estimate of the
log-density while allowing less restricted neural-network dynamics.[^ffjord]
In automatic differentiation terms, the estimator turns a trace into a
vector-Jacobian product against a random vector.

That same pattern appears when people estimate Hessian traces during training,
effective dimensions of kernels, uncertainty terms, graph centrality measures,
or physical observables tied to traces of inverse operators.

The matrix is not always there.

The action of the matrix is.

## What the Estimator Does Not Promise

The simple identity:

```text
E[z^T A z] = tr(A)
```

is easy to oversell.

It does not say one sample is accurate. It does not say relative error is stable
when the true trace is near zero. It does not say Hutch++ is always better than
plain Hutchinson. It does not say the probe distribution is irrelevant. It does
not say your matrix-vector product is exact, cheap, or deterministic.

The diagonal case in the lab is deliberately embarrassing for fancy methods.
Rademacher Hutchinson wins immediately because the matrix has the one structure
that makes its variance vanish. A flat spectrum can also make Hutch++ look
ordinary because the sketch has no dominant room to capture.

This is a good thing. A numerical method that cannot be embarrassed by a simple
counterexample is probably hiding its assumptions.

Here are the practical questions I would ask before using this estimator in a
real system:

```text
Is the target matrix symmetric or positive semidefinite?
Is the trace far from zero?
Do I need additive error or relative error?
Can I reuse probes across time, or does that bias an adaptive loop?
How noisy or approximate are the matrix-vector products?
Does the spectrum have spikes that a low-rank sketch can remove?
```

The estimator is a measuring device, not a spell.

## A Small Philosophy of Matrix-Free Computation

There is a recurring pattern in large-scale computation:

```text
the object is too large to inspect
but not too large to interrogate
```

Randomized SVD asks the matrix where its range is. Johnson-Lindenstrauss
projections ask a point cloud which distances matter. Stochastic Lanczos asks an
operator for spectral moments. Hutchinson asks for the diagonal sum without
looking at the diagonal.

This is not randomness as decoration. It is experiment design.

A random probe is a question with a known expectation. If you know the
expectation and can control the variance, you can replace a forbidden
measurement with a sequence of cheap, auditable measurements.

That is the real beauty here.

The trace was never invisible. It was just hidden in quadratic forms.

[^hutch]: M. F. Hutchinson, ["A Stochastic Estimator of the Trace of the Influence Matrix for Laplacian Smoothing Splines"](https://doi.org/10.1080/03610918908812806), *Communications in Statistics - Simulation and Computation* 18(3), 1989.

[^avron]: Haim Avron and Sivan Toledo, ["Randomized algorithms for estimating the trace of an implicit symmetric positive semi-definite matrix"](https://research.ibm.com/publications/randomized-algorithms-for-estimating-the-trace-of-an-implicit-symmetric-positive-semi-definite-matrix), *Journal of the ACM* 58(2), 2011.

[^hpp]: Raphael A. Meyer, Cameron Musco, Christopher Musco, and David P. Woodruff, ["Hutch++: Optimal Stochastic Trace Estimation"](https://arxiv.org/abs/2010.09649), SOSA 2021.

[^slq]: Shashanka Ubaru, Jie Chen, and Yousef Saad, ["Fast Estimation of tr(f(A)) via Stochastic Lanczos Quadrature"](https://epubs.siam.org/doi/10.1137/16M1104974), *SIAM Journal on Matrix Analysis and Applications* 38(4), 2017.

[^ffjord]: Will Grathwohl, Ricky T. Q. Chen, Jesse Bettencourt, Ilya Sutskever, and David Duvenaud, ["FFJORD: Free-Form Continuous Dynamics for Scalable Reversible Generative Models"](https://openreview.net/forum?id=rJxgknCcK7), ICLR 2019.
