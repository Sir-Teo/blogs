---
layout: post
title: "The Normal Equations Square the Trouble"
description: "Least squares is one objective but not one computation. Forming A^T A can square the condition number; QR keeps the geometry closer to the data."
date: 2026-06-16 20:18:00 -0400
categories: computer-science
tags: [least-squares, qr-factorization, normal-equations, numerical-linear-algebra, householder, gram-schmidt, conditioning]
excerpt: "A least-squares fit is not just a statistical model. It is also a numerical linear algebra choice, and the innocent shortcut A^T A can turn a hard problem into a squared hard problem."
---

Least squares has two faces.

One is statistical:

$$
\min_x \|Ax-b\|_2.
$$

The other is mechanical:

```text
how do we actually compute x on a finite machine?
```

Those are not the same question. They are close enough that it is tempting to
forget the difference, and that is where the trap lives.

The shortest derivation says to differentiate the objective, set the gradient
to zero, and solve

$$
A^T A x = A^T b.
$$

These are the normal equations. They are elegant. They are symmetric. If the
columns of $$A$$ have full rank, $$A^T A$$ is positive definite, so a Cholesky
factorization looks like a clean answer.

It is also the answer that quietly squares the condition number.

If $$A$$ has singular values $$\sigma_1 \ge \cdots \ge \sigma_n > 0$$, then
$$A^T A$$ has eigenvalues $$\sigma_1^2,\ldots,\sigma_n^2$$. Therefore

$$
\kappa_2(A^T A)=\kappa_2(A)^2.
$$

This is not a philosophical complaint. It is a decimal-place complaint. In
double precision, you start with about sixteen decimal digits. A matrix with
$$\kappa(A)\approx 10^8$$ is already delicate. Its normal-equation matrix has
condition number about $$10^{16}$$, which is the size of the whole double
precision budget. Bjorck's least-squares text treats this as one of the central
reasons to distinguish the normal-equation route from QR-based methods.[^bjorck]

The equation did not change the mathematical minimizer. It changed the
computational path to the minimizer.

## A Small Lab With A Big Lever

The lab below builds a deterministic polynomial least-squares problem. It uses
the same hidden curve and the same response vector for three solvers:

- **normal equations**, forming $$A^T A$$ and solving by Cholesky;
- **modified Gram-Schmidt**, orthogonalizing columns one at a time;
- **Householder QR**, reflecting the column space into triangular form.

It also lets the design matrix use three bases:

- raw powers $$1,x,x^2,\ldots$$ on $$[0,1]$$;
- centered powers $$1,t,t^2,\ldots$$ on $$[-1,1]$$;
- Chebyshev polynomials $$T_j(t)$$ on $$[-1,1]$$.

The point is not that Chebyshev polynomials are always the right modeling
choice. The point is that the columns you hand to the solver are part of the
algorithm.

<style>
  .lsq-lab {
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

  .lsq-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .lsq-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .lsq-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .lsq-lab input,
  .lsq-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .lsq-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .lsq-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .lsq-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .lsq-lab__metric span,
  .lsq-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .lsq-lab__metric span {
    display: block;
  }

  .lsq-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .lsq-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .lsq-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="least-squares-qr-lab" class="lsq-lab" data-least-squares-qr-lab>
  <div class="lsq-lab__controls">
    <label>
      Basis
      <select data-param="basis">
        <option value="raw" selected>raw powers</option>
        <option value="centered">centered powers</option>
        <option value="chebyshev">Chebyshev</option>
      </select>
    </label>
    <label>
      Rows: <output data-value="rows">80</output>
      <input type="range" min="24" max="220" step="4" value="80" data-param="rows">
    </label>
    <label>
      Degree: <output data-value="degree">11</output>
      <input type="range" min="2" max="17" step="1" value="11" data-param="degree">
    </label>
    <label>
      Cluster near 1: <output data-value="cluster">42%</output>
      <input type="range" min="0" max="100" step="1" value="42" data-param="cluster">
    </label>
    <label>
      Response noise: <output data-value="noiseExp">1e-12</output>
      <input type="range" min="-16" max="-4" step="1" value="-12" data-param="noiseExp">
    </label>
    <label>
      Seed: <output data-value="seed">19</output>
      <input type="range" min="1" max="997" step="1" value="19" data-param="seed">
    </label>
  </div>
  <div class="lsq-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="760" aria-label="Least-squares QR lab comparing normal equations, modified Gram-Schmidt, and Householder QR under different polynomial bases"></canvas>
  <p class="lsq-lab__note">
    Deterministic browser experiment. The simulator knows the generating
    coefficients. The solvers see only the design matrix and response vector.
    The condition estimate is computed from the Gram matrix for visualization.
    The same JavaScript file exposes a deterministic audit for the claims below.
  </p>
</div>
<script defer src="{{ '/assets/js/least-squares-qr-lab.js?v=20260616b' | relative_url }}"></script>

The default setting is intentionally mean but not exotic: degree 11, raw powers,
clustered points, and tiny response noise.

On my audit run, the design has

```text
cond(A)       ~= 1.28e8
cond(A^T A)   ~= 1.64e16
```

That second number is the problem. The normal equations still often return a
line that looks plausible in the left panel, because prediction can hide
coefficient error when columns are nearly dependent. But the coefficients have
drifted. The default relative coefficient errors were roughly:

```text
normal equations          1.18e-1
modified Gram-Schmidt     1.46e-2
Householder QR            6.32e-5
```

The reproducibility hook is deliberately part of the artifact rather than a
separate notebook. Running `LeastSquaresQrLab.audit()` under Node executes 652
deterministic checks: shape invariants, the displayed
$$\kappa(A^T A)=\kappa(A)^2$$ identity, the default error regression above, the
basis-conditioning drop, a hard raw-power case where Cholesky fails, and input
clamping. If a future edit changes the numerical story, the audit should fail
before the post ships.

Push **Cluster near 1** higher and raise **Degree**. In the harder audit case,
the normal-equation Cholesky factorization fails, modified Gram-Schmidt returns
a wildly wrong coefficient vector, and Householder QR still recovers the
coefficients to about $$3\cdot 10^{-7}$$ relative error.

That is the essay in miniature:

```text
same objective, same data, different numerical geometry
```

## What QR Refuses To Do

QR factorization writes

$$
A = QR,
$$

where the columns of $$Q$$ are orthonormal and $$R$$ is upper triangular. Then
the least-squares problem becomes

$$
\min_x \|QRx-b\|_2.
$$

Because multiplying by an orthogonal matrix preserves Euclidean norm, this is
equivalent to solving

$$
Rx = Q^T b
$$

for the leading triangular part.

The important word is **preserves**. QR does not form every pairwise column dot
product and then solve the squared problem. It rotates or reflects the original
geometry until the answer is easy to read.

Householder's 1958 paper introduced the triangularization idea in terms of
unitary transformations.[^householder] In modern least-squares software, the
Householder version is the default dense-workhorse instinct because the
orthogonal transformations are backward stable in a way that plain normal
equations are not.[^higham] Golub and Van Loan's *Matrix Computations* is the
canonical long-form map of this territory.[^golub-vanloan]

Gram-Schmidt has the right conceptual picture but a less forgiving execution.
Classical Gram-Schmidt subtracts projections in a way that can leave columns
less orthogonal than intended when the columns are nearly dependent. Modified
Gram-Schmidt is better, and often good enough, but the lab shows the familiar
gradient: as the raw-power matrix becomes almost rank deficient, its
orthogonality error grows while Householder stays near roundoff.

The hierarchy is not moral. It is numerical:

```text
normal equations:       cheap, elegant, condition number squared
modified Gram-Schmidt:  explicit orthogonalization, can lose orthogonality
Householder QR:         orthogonal transformations, usually the safer default
SVD:                    most diagnostic for rank trouble, usually more costly
```

There are cases where normal equations are acceptable. If the matrix is well
conditioned, if the accuracy target is modest, if the computation is inside a
carefully designed iterative or regularized pipeline, or if hardware and memory
traffic dominate everything else, engineers may choose them deliberately. The
mistake is not using normal equations. The mistake is using them because the
derivation fit on one line.

## A Basis Can Be A Bug

Now switch the lab basis from **raw powers** to **centered powers**.

Nothing statistical has become more profound. We still fit a polynomial of the
same degree to the same generated response. But the columns are less grotesque.
With the default sliders, the condition number drops from about $$1.28\cdot
10^8$$ to about $$2.38\cdot 10^4$$, and all three solvers behave much better.

Switch to **Chebyshev**. The condition number drops to about $$45.5$$ in the
same setting. The three methods now agree to roughly the response-noise floor.

This is why I dislike saying "polynomial regression is unstable" without
saying which basis, scaling, degree, and sampling pattern were used. Raw powers
on an awkward interval are a bad coordinate system. They make columns that look
different symbolically but nearly identical numerically. A solver cannot
recover information that the representation almost erased before the solve
began.

Chebyshev polynomials are not just pretty orthogonal-polynomial folklore. They
are a technology for representing functions on an interval with more even
numerical behavior. Trefethen's *Approximation Theory and Approximation
Practice* is a good entry point into why Chebyshev methods show up anywhere
polynomial approximation is taken seriously.[^trefethen]

The broader principle is more general than polynomials:

```text
feature scaling is numerical linear algebra
```

Centering predictors, standardizing columns, using orthogonal polynomial bases,
whitening features, choosing contrasts in a statistical model, avoiding
needless collinearity in a design matrix: these are not cosmetic choices. They
decide what problem the computer is actually solving.

## Residuals Can Lie Politely

One unsettling feature of least squares is that a bad coefficient vector can
still have a respectable residual.

In an ill-conditioned design, many coefficient vectors produce nearly the same
predictions on the observed points. If columns are almost dependent, moving a
large amount in one coefficient and compensating in another can barely move
$$Ax$$. The residual sees the product $$Ax$$. It does not care whether the
coefficient vector is scientifically meaningful, stable under new data, or
reasonable outside the observed grid.

This matters in modeling work.

If you only inspect training residuals, the normal-equation answer may look
fine. If you inspect coefficients, extrapolation, uncertainty, or sensitivity
to a new batch of rows, the same answer can be nonsense.

The lab's coefficient-drift panel is there for that reason. It is possible for
the left panel to look calm while the right panel is confessing that the fitted
parameters are no longer the parameters of the generating model.

This is not overfitting in the usual statistical sense. The data can be nearly
noise-free. The model class can be correct. The failure is that finite precision
and a bad coordinate system made the inverse problem too sharp.

## The Useful Checklist

When I see a least-squares solve in production code, I want to know the answer
to five questions.

First, how is the matrix scaled? If columns differ by many orders of magnitude
or encode nearly the same direction, solver choice arrives late.

Second, is the code explicitly forming $$A^T A$$? If yes, is that a deliberate
tradeoff, or did it happen because the derivation was convenient?

Third, is rank deficiency possible? If yes, plain QR may not be enough. Use a
rank-revealing QR, SVD, regularization, or a model redesign.

Fourth, what is the accuracy target? A ranking model, a geometry kernel, a
scientific fit, and a finance risk calculation may have different tolerance for
coefficient instability.

Fifth, what is tested? A unit test with random Gaussian matrices is too polite.
Add a Vandermonde-like case. Add nearly collinear columns. Add a column scaling
case. Add a deterministic seed where the normal equations and QR disagree, and
make the code's promise explicit.

Here is the smallest test smell:

```text
assert close(normal_equations(A, b), qr(A, b))
```

on friendly data only.

I would rather see:

```text
well-conditioned: all methods agree
ill-conditioned: QR/SVD path is used or warning is explicit
rank-deficient: behavior is specified
scaled columns: preprocessing is verified
```

The real engineering boundary is not "never form $$A^T A$$." That slogan is
too blunt. The boundary is:

```text
never form A^T A by accident
```

## The Quiet Moral

Least squares is often introduced as a projection. That is the right geometry.
But the projection has to pass through silicon.

The normal equations turn the projection into a symmetric system by measuring
all pairwise column interactions. QR turns the matrix itself until the
projection is triangular. SVD goes further and exposes the directions where the
problem is barely identified.

Those are different stories about the same minimizer.

The next time a regression looks suspicious, do not ask only whether the model
is statistically wrong. Ask whether the design matrix was numerically rude. Ask
whether the basis made the columns almost indistinguishable. Ask whether the
code squared the trouble before solving it.

Least squares is one objective. It is not one computation.

## Paper Trail

[^householder]: A. S. Householder, ["Unitary Triangularization of a Nonsymmetric Matrix"](https://dl.acm.org/doi/10.1145/320941.320947), *Journal of the ACM*, 5(4), 1958, pp. 339-342. Bibliographic record: [OSTI](https://www.osti.gov/biblio/4291799).

[^bjorck]: Ake Bjorck, ["Numerical Methods for Least Squares Problems"](https://epubs.siam.org/doi/book/10.1137/1.9781611977950), SIAM, 1996. The book gives a detailed treatment of direct least-squares methods, including Cholesky and QR approaches.

[^higham]: Nicholas J. Higham, ["Accuracy and Stability of Numerical Algorithms: Second Edition"](https://epubs.siam.org/doi/10.1137/1.9780898718027), SIAM, 2002. See especially the least-squares chapter covering normal equations, QR methods, and stability.

[^golub-vanloan]: Gene H. Golub and Charles F. Van Loan, ["Matrix Computations"](https://books.google.com/books/about/Matrix_Computations.html?id=5U-l8U3P-VUC), 4th ed., Johns Hopkins University Press, 2013.

[^trefethen]: Lloyd N. Trefethen, ["Approximation Theory and Approximation Practice, Extended Edition"](https://epubs.siam.org/doi/10.1137/1.9781611975949), SIAM, 2019. See also the [Chebfun guide](https://www.chebfun.org/docs/guide/guide04.html) for a computational view of Chebyshev interpolation and polynomial approximation.
