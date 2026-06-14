---
layout: post
title: "The Solver Is a Polynomial Filter"
description: "Conjugate gradient is not just gradient descent with a better memory. It builds a polynomial that suppresses the eigenmodes of a positive definite system."
date: 2026-06-14 18:10:00 -0400
categories: applied-math
tags: [conjugate-gradient, krylov-methods, numerical-linear-algebra, preconditioning, optimization, scientific-computing]
excerpt: "CG converges when it finds a small polynomial on the eigenvalues that still equals one at zero. The spectrum, not just the condition number, is the terrain."
---

Linear solvers are often introduced as machinery.

You have a matrix. You have a right-hand side. You call something named `solve`.
Maybe it factors. Maybe it iterates. Maybe it complains about conditioning.

Conjugate gradient deserves a better mental model.

For a symmetric positive definite system

$$
Ax=b,
$$

CG is solving the quadratic bowl:

$$
\phi(x)=\frac{1}{2}x^\top A x-b^\top x.
$$

That story is true, but incomplete. The story I reach for now is spectral:

> CG is building a polynomial filter that tries to be small on the eigenvalues
> of \(A\), while being forced to equal one at zero.

Once you see that, several solver superstitions become ordinary facts.

- A big condition number can be survivable.
- A clustered spectrum can converge absurdly fast.
- A single bad eigenvalue can be isolated.
- Preconditioning is not a magic speed knob; it changes the eigenvalue terrain.
- The residual can tell a different story from the error.

The solver is not walking through coordinate space. It is editing the spectrum.

## The Bowl Is Not Round

Steepest descent is honest. At each step, it follows the negative gradient of
the quadratic. If the bowl is round, this is fine. If the bowl is a long skinny
valley, steepest descent zigzags.

The reason is eigenvalues. In an eigenbasis of \(A\), each direction has a
curvature \(\lambda_i\). Large eigenvalues are stiff directions. Small
eigenvalues are flat directions. One step size must negotiate all of them.

CG uses a different bargain. It chooses search directions that are conjugate
with respect to \(A\):

$$
p_i^\top A p_j = 0 \qquad i\neq j.
$$

The original Hestenes and Stiefel paper gave an iterative method for solving
linear systems and showed exact finite termination in at most \(n\) steps in
exact arithmetic.[^hestenes] That finite-step fact is beautiful, but it is not
the reason CG is useful on huge sparse systems. We do not run a billion steps
for a billion unknowns.

CG is useful because the first few steps often remove the modes that matter.

## The Krylov Room

After \(k\) iterations, CG has searched inside a Krylov subspace:

$$
\mathcal K_k(A,r_0)=
\mathrm{span}\{r_0,Ar_0,A^2r_0,\ldots,A^{k-1}r_0\}.
$$

Trefethen and Bau describe CG as producing the iterate in this subspace that
minimizes the error in the \(A\)-norm.[^trefethen] Shewchuk's guide develops the
same geometry through quadratic forms, eigenvectors, conjugate directions, and
preconditioning.[^shewchuk]

The polynomial view comes from writing the error after \(k\) iterations as:

$$
e_k = p_k(A)e_0,
$$

where \(p_k\) is a degree-\(k\) polynomial satisfying \(p_k(0)=1\). If
\(Aq_i=\lambda_i q_i\), then

$$
p_k(A)e_0 =
\sum_i p_k(\lambda_i)\langle e_0,q_i\rangle q_i.
$$

So the solver's job is brutally specific:

> make \(p_k(\lambda_i)\) small where the initial error has energy.

This is why the actual eigenvalue distribution matters. The condition number
\(\kappa=\lambda_{\max}/\lambda_{\min}\) gives a worst-case interval. CG sees
the points inside that interval.

## A Spectrum Lab

The lab below constructs diagonal positive definite systems in an eigenbasis, so
the spectrum is visible instead of hidden behind matrix entries. It compares:

- steepest descent with exact line search;
- ordinary conjugate gradient;
- preconditioned CG with a diagonal spectral preconditioner.

The default uses 96 eigenmodes spread across a log ramp with
\(\kappa=10^4\), 28 iterations, and a 70 percent preconditioner. In that run,
steepest descent leaves relative \(A\)-norm error around `0.6310`, ordinary CG
leaves about `0.3534`, and preconditioned CG drives it to about `4.91e-7`.

Switch the spectrum to **two clusters**. The nominal condition number gets even
worse, around `2.88e4`, but ordinary CG reaches about `0.0060`. Switch to
**one outlier** and ordinary CG reaches about `3.76e-5`. Same family of
algorithms, different eigenvalue geography.

<style>
  .cg-lab {
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

  .cg-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .cg-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .cg-lab__controls input,
  .cg-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .cg-lab__controls select,
  .cg-lab__controls input[type="number"] {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .cg-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .cg-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .cg-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .cg-lab__metric span,
  .cg-lab__legend,
  .cg-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .cg-lab__metric span {
    display: block;
  }

  .cg-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .cg-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    max-width: 100%;
    width: 100%;
  }

  .cg-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    margin-top: 0.75rem;
  }

  .cg-lab__legend span::before {
    border-radius: 999px;
    content: "";
    display: inline-block;
    height: 0.72rem;
    margin-right: 0.35rem;
    vertical-align: -0.08rem;
    width: 0.72rem;
  }

  .cg-lab__legend span:nth-child(1)::before {
    background: #be123c;
  }

  .cg-lab__legend span:nth-child(2)::before {
    background: #2563eb;
  }

  .cg-lab__legend span:nth-child(3)::before {
    background: #0f766e;
  }

  .cg-lab__legend span:nth-child(4)::before {
    background: #7c3aed;
  }

  .cg-lab__note {
    margin: 0.75rem 0 0;
  }

  @media (max-width: 650px) {
    .cg-lab {
      padding: 0.75rem;
    }

    .cg-lab canvas {
      height: 1120px;
    }
  }
</style>

<div class="cg-lab" data-cg-spectrum-lab>
  <div class="cg-lab__controls">
    <label>
      Spectrum
      <select data-param="spectrum">
        <option value="ramp" selected>log ramp</option>
        <option value="cluster">two clusters</option>
        <option value="outlier">one outlier</option>
      </select>
    </label>
    <label>
      Condition <output data-output="condition">1e4</output>
      <input data-param="condition" type="range" min="1" max="6" step="1" value="4">
    </label>
    <label>
      Dimension <output data-output="dimension">96</output>
      <input data-param="dimension" type="range" min="32" max="160" step="8" value="96">
    </label>
    <label>
      Iterations <output data-output="iterations">28</output>
      <input data-param="iterations" type="range" min="0" max="120" step="1" value="28">
    </label>
    <label>
      Preconditioner <output data-output="preconditioner">70%</output>
      <input data-param="preconditioner" type="range" min="0" max="100" step="5" value="70">
    </label>
    <label>
      Seed
      <input data-param="seed" type="number" min="1" max="9999" step="1" value="23">
    </label>
  </div>
  <div class="cg-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Conjugate-gradient spectrum lab"></canvas>
  <div class="cg-lab__legend">
    <span>steepest descent</span>
    <span>conjugate gradient</span>
    <span>preconditioned CG</span>
    <span>worst-case bound</span>
  </div>
  <p class="cg-lab__note">
    The matrix is diagonal in the displayed eigenbasis. The preconditioner is a controlled diagonal approximation, so the lab isolates the spectral mechanism rather than sparse-matrix engineering.
  </p>
</div>

<script defer src="{{ '/assets/js/cg-spectrum-lab.js?v=20260614a' | relative_url }}"></script>

## How To Read The Panels

The spectrum ledger shows where the remaining CG energy lives after the selected
iteration. Low eigenvalues are on the left, high eigenvalues on the right.

The convergence panel plots relative \(A\)-norm error. The dashed purple line is
the standard Chebyshev-style worst-case envelope:

$$
\frac{\|e_k\|_A}{\|e_0\|_A}
\le
2\left(
\frac{\sqrt{\kappa}-1}{\sqrt{\kappa}+1}
\right)^k.
$$

That bound only knows the interval
\([\lambda_{\min},\lambda_{\max}]\). It does not know whether the eigenvalues
fill the interval, form two clusters, or consist of a tame cloud plus one
outlier. This is why the bound can be pessimistic in the lab.

The error-filter panel plots \(|e_{k,i}/e_{0,i}|\) per eigenmode. It is the
most literal panel: each solver has multiplied the initial error by some
function of \(\lambda_i\). For CG, that function is the polynomial chosen by the
Krylov process.

The bottom-right ledger asks a practical question: after the solver has run,
which part of the spectrum still owns the error budget?

## Why Clusters Are A Gift

If a matrix has only two distinct eigenvalues, exact-arithmetic CG can solve it
in at most two steps. More generally, if the eigenvalues form tight clusters, a
low-degree polynomial can be small on those clusters without being small on a
whole interval.

This is the difference between drawing a function through points and controlling
it on every point in a long interval.

The Chebyshev bound answers the interval problem. CG often gets the point-set
problem.

This is why condition number is both useful and incomplete. A spectrum with
\(\kappa=10^5\) but two tight clusters may be easier than a log-uniform ramp
with \(\kappa=10^3\). The condition number tells you how far apart the endpoints
are. It does not tell you how much mass lives between them.

## Preconditioning Changes The Question

A preconditioner \(M\) replaces the original system with one that has the same
solution but a better effective spectrum. In the simplest left-preconditioned
story, we think about:

$$
M^{-1}Ax=M^{-1}b.
$$

For CG, the clean symmetric positive definite version is more careful, but the
intent is the same: make the operator look closer to the identity in the metric
the algorithm uses.

Saad emphasizes the practical importance of combining preconditioning with
Krylov iterations for sparse linear systems.[^saad] This is the real engineering
problem. A perfect preconditioner would be the inverse of \(A\), but then we
would already have solved the problem. A useful preconditioner is cheap enough
to apply and good enough to improve the spectrum.

The lab's preconditioner is deliberately artificial:

$$
M_i \approx \lambda_i^\rho.
$$

At \(\rho=0\), it does nothing. At \(\rho=1\), it is essentially perfect in
this diagonal world. Real preconditioners are not handed the eigenbasis. They
come from incomplete factorizations, multigrid, domain decomposition, diagonal
scaling, approximate inverses, or problem-specific physics.

Still, the toy gets the point across: preconditioning is not "making CG faster"
as a slogan. It is moving the eigenvalues into a shape a low-degree polynomial
can suppress.

## Residual Is Not Always Error

The residual is:

$$
r_k=b-Ax_k=Ae_k.
$$

So residual weights eigenmodes by \(\lambda_i\). Large-eigenvalue error is loud
in the residual. Small-eigenvalue error is quiet.

That means a small residual can coexist with nontrivial error in flat modes.
Conversely, high-curvature error can make the residual look bad even if the
solution error is already tolerable in the application's metric.

This is not an argument against residual stopping rules. Residuals are cheap,
available, and often exactly what the backward-error story wants. It is an
argument for knowing which norm you care about.

If the downstream quantity is energy, monitor energy when you can. If the
downstream quantity is a PDE observable, check the observable. If the system is
ill-conditioned, remember that \(A\) can hide and amplify different modes in
different diagnostics.

## What The Lab Leaves Out

The lab is spectral and exact enough to teach the mechanism. It is not a full
sparse solver benchmark.

It leaves out:

- sparse matrix-vector memory traffic;
- finite precision loss of orthogonality;
- indefinite or nonsymmetric systems;
- preconditioner setup cost;
- parallel communication;
- matrix-free operators;
- stopping rules tied to application error.

Those omissions matter. In production, CG's cost is usually dominated by
matrix-vector products, preconditioner applications, reductions, and memory
movement. Exact arithmetic finite termination is not the operating regime.

But the spectral picture survives. Roundoff perturbs it. Sparse implementation
costs constrain it. Preconditioners reshape it. The polynomial still wants to
be small where the eigenvalues and initial error live.

## The Practical Habit

When CG is slow, I try not to say "the matrix is ill-conditioned" and stop
thinking. I ask a more specific set of questions:

- Are the eigenvalues spread across an interval or clustered?
- Is the initial error mostly in hard modes?
- Does the residual norm match the error norm I care about?
- Would a cheap preconditioner collapse the spectral interval?
- Is the solver dominated by iteration count or by per-iteration cost?
- Is the matrix actually symmetric positive definite?

The last question is not ceremonial. CG is built for SPD systems. If the matrix
is nonsymmetric, indefinite, changing under your feet, or only accidentally
positive, the pretty theory can stop describing the computation.

The method is elegant, not forgiving.

## The Picture I Keep

I picture each CG step as buying one more degree of polynomial freedom.

At step zero, the error multiplier is \(p_0(\lambda)=1\). Nothing has been
filtered.

After a few steps, the polynomial has learned where some eigenvalues are. It
drops near them. If the spectrum has clusters, the drops cover many modes at
once. If there is an outlier, one degree can spend itself on that outlier. If
the eigenvalues fill a long interval, the polynomial has a harder job.

That is a nicer picture than a point zigzagging down a bowl.

The bowl is geometry in coordinates.

The solver is geometry in the spectrum.

[^hestenes]: Magnus R. Hestenes and Eduard Stiefel, ["Methods of Conjugate Gradients for Solving Linear Systems"](https://nvlpubs.nist.gov/nistpubs/jres/049/jresv49n6p409_a1b.pdf), *Journal of Research of the National Bureau of Standards* 49(6), 1952.

[^shewchuk]: Jonathan R. Shewchuk, ["An Introduction to the Conjugate Gradient Method Without the Agonizing Pain"](https://www.cs.cmu.edu/~quake-papers/painless-conjugate-gradient.pdf), Carnegie Mellon University, 1994.

[^saad]: Yousef Saad, ["Iterative Methods for Sparse Linear Systems"](https://www-users.cse.umn.edu/~saad/IterMethBook_2ndEd.pdf), 2nd ed., SIAM, 2003.

[^trefethen]: Lloyd N. Trefethen and David Bau III, ["Numerical Linear Algebra, Lecture 38: Conjugate Gradients"](https://www.cs.cmu.edu/afs/cs/academic/class/15859n-f16/Handouts/TrefethenBau/NumericalLinearAlgebrachapter38.pdf), 1997.
