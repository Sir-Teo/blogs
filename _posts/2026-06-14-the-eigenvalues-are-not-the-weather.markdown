---
layout: post
title: "Eigenvalues Are Not Weather"
description: "A stable matrix can amplify disturbances before it damps them. The missing diagnostic is not another eigenvalue, but the geometry of the eigenvectors and the pseudospectrum around them."
date: 2026-06-14 19:20:17 -0400
categories: applied-math
tags: [pseudospectra, nonnormal-matrices, transient-growth, numerical-linear-algebra, dynamical-systems, stability]
excerpt: "Eigenvalues tell the far future. Nonnormal matrices can hide a violent middle."
---

There is a stability test I used to trust too quickly.

You linearize a system. You compute the eigenvalues. Every real part is negative.
The modes decay. The equilibrium is stable.

And yet the experiment still blows up before the asymptotic theorem has time to
be right.

That sentence is not mystical. It is a geometry problem. Eigenvalues say what
happens to pure eigenvectors. Many initial conditions are not pure eigenvectors.
If the eigenvectors are nearly parallel, writing an ordinary vector as a
combination of them can require huge cancelling coefficients. The individual
modes decay, but the cancellation can decay faster than the modes themselves.
For a while, what was hidden becomes visible.

The far future is calm.

The middle can still have weather.

## A Stable Matrix With a Bad Afternoon

Start with the smallest continuous-time example I know that still contains the
crime:

$$
A =
\begin{bmatrix}
-a & K \\
0 & -b
\end{bmatrix},
\qquad a>b>0.
$$

The eigenvalues are boring:

$$
\lambda_1=-a,\qquad \lambda_2=-b.
$$

Both are negative. Nothing oscillates. Nothing grows asymptotically.

But the matrix is not normal unless \(K=0\). The second coordinate feeds the
first. The exponential is exact:

$$
e^{tA} =
\begin{bmatrix}
e^{-at} &
K\frac{e^{-bt}-e^{-at}}{a-b}\\
0 & e^{-bt}
\end{bmatrix}.
$$

The diagonal entries decay. The off-diagonal entry can grow from zero before it
decays, because it is the difference between a fast decay and a slow decay,
scaled by \(K\).

That is already enough.

For the default lab settings,

```text
a = 2.10
b = 0.35
K = 22
```

the largest real part of any eigenvalue is still only `-0.35`. But the operator
norm of \(e^{tA}\) peaks at about `7.35x` near `t = 1.04`.

No eigenvalue is lying.

The question was incomplete.

## Why Eigenvectors Matter More Than They Look

For this triangular matrix, one eigenvector points along the first coordinate.
The other is approximately

$$
\begin{bmatrix}
K/(a-b)\\
1
\end{bmatrix}.
$$

When \(K\) is large, those two eigenvectors nearly point in the same direction.
At the default settings their angle is about `4.55` degrees.

This is the small-angle version of a lever arm. A harmless-looking initial
condition can be represented as

```text
large multiple of eigenvector 1
minus almost the same large multiple of eigenvector 2
```

At time zero, the two large pieces cancel. Then one mode decays faster than the
other. The cancellation breaks. The state vector grows even though each modal
coefficient is attached to a decaying exponential.

This is why normal matrices feel so civilized. For a normal matrix, orthogonal
eigenvectors keep modal bookkeeping honest. In the 2-norm, the worst
amplification of \(e^{tA}\) is governed directly by the largest real part of the
eigenvalues. The pseudospectrum is just round disks around the spectrum.

Nonnormal matrices do not give you that discount.

## The Diagnostic That Looks Around the Eigenvalues

The object that notices this fragility is the pseudospectrum.

For a matrix \(A\), the \(\epsilon\)-pseudospectrum can be described two
equivalent ways:

$$
\Lambda_\epsilon(A)
=
\{z: z\in\Lambda(A+E)\ \text{for some}\ \|E\|_2\le \epsilon\},
$$

and, away from eigenvalues,

$$
\Lambda_\epsilon(A)
=
\{z: \|(zI-A)^{-1}\|_2\ge \epsilon^{-1}\}.
$$

The first form says: where could the eigenvalues move if the matrix were
perturbed a little?

The second form says: where is the resolvent large, so the matrix behaves as if
it has a spectral feature nearby?

Higham's review of Trefethen and Embree's *Spectra and Pseudospectra* gives
these equivalent definitions as the central entry point.[^higham-review]
Trefethen and Embree's book is the canonical modern reference for the larger
story: nonnormal matrices, operators, numerical experiments, and the many places
where eigenvalues alone are the wrong lens.[^trefethen-embree]

The important visual rule is simple:

```text
normal matrix: tiny pseudospectral neighborhoods
nonnormal matrix: swollen pseudospectral weather systems
```

If a small \(\epsilon\)-pseudospectrum reaches into the unstable half-plane,
that does not mean the original matrix has an unstable eigenvalue. It means
nearby matrices do, and it usually means the resolvent is large enough that
transient growth deserves attention.

The connection is not just folk wisdom. Bounds related to the Kreiss matrix
theorem tie resolvent growth and pseudospectral protrusions to possible growth
of \(e^{tA}\) or, in discrete time, powers of a matrix.[^trefethen-linear]
The constants and exact statements matter in real work, but the practical
message is sturdy:

```text
if the pseudospectrum bulges toward instability, simulate the transient
```

Do not stop at the eigenvalues.

## Instrument Panel

The lab below uses the exact \(2\times2\) matrix exponential, not Euler steps.
The heatmap is the resolvent norm \(\|(zI-A)^{-1}\|_2\). The black dots are the
two stable eigenvalues. The purple vertical line is the rightmost grid point in
the selected \(\epsilon\)-pseudospectrum. The blue/red point cloud perturbs the
matrix with random Frobenius-norm-\(\epsilon\) perturbations and plots the
resulting eigenvalues.

The default is intentionally modest: `epsilon = 0.04`. Even there, the
pseudospectrum crosses slightly into positive real part, while the original
eigenvalues remain fixed at negative real parts.

Set **coupling** to zero and the story disappears: the eigenvectors become
orthogonal, the peak amplification falls to `1.00x`, and the pseudospectrum
shrinks back around the eigenvalues.

<style>
  .pseudo-lab {
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

  .pseudo-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    min-width: 0;
  }

  .pseudo-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .pseudo-lab__controls input {
    accent-color: #7c3aed;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .pseudo-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .pseudo-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .pseudo-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .pseudo-lab__metric span,
  .pseudo-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .pseudo-lab__metric span {
    display: block;
  }

  .pseudo-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .pseudo-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .pseudo-lab__note {
    margin: 0.9rem 0 0;
  }

</style>

<div class="pseudo-lab" data-pseudospectrum-lab>
  <div class="pseudo-lab__controls">
    <label>
      Slow decay: <output data-value="slow">0.35</output>
      <input type="range" min="5" max="120" step="5" value="35" data-param="slow">
    </label>
    <label>
      Fast decay: <output data-value="fast">2.10</output>
      <input type="range" min="40" max="420" step="10" value="210" data-param="fast">
    </label>
    <label>
      Coupling: <output data-value="coupling">22</output>
      <input type="range" min="0" max="60" step="1" value="22" data-param="coupling">
    </label>
    <label>
      Epsilon: <output data-value="epsilon">0.04</output>
      <input type="range" min="1" max="15" step="1" value="4" data-param="epsilon">
    </label>
    <label>
      Initial angle: <output data-value="angle">80</output>
      <input type="range" min="0" max="180" step="5" value="80" data-param="angle">
    </label>
    <label>
      Seed: <output data-value="seed">23</output>
      <input type="range" min="1" max="9999" step="1" value="23" data-param="seed">
    </label>
  </div>
  <div class="pseudo-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Pseudospectrum and transient growth lab for a stable nonnormal two by two matrix"></canvas>
  <p class="pseudo-lab__note">
    Synthetic two-dimensional system. Perturbation dots use random Frobenius-norm
    perturbations, so they are a sample inside the spectral-norm pseudospectrum,
    not a full contour-tracing algorithm.
  </p>
</div>

<script src="{{ '/assets/js/pseudospectrum-lab.js?v=20260614a' | relative_url }}"></script>

## The Fluid-Mechanics Version of This Warning

This toy is not Navier-Stokes. It is the small diagram you draw before opening
the heavy book.

The historically important place where this lesson mattered was hydrodynamic
stability. Classical linear stability analysis looked for unstable eigenvalues
of a linearized operator. But several shear flows become turbulent in regimes
where the relevant linearized operators have no eigenvalues in the unstable
half-plane.

In 1993, Reddy, Schmid, and Henningson studied pseudospectra of the
Orr-Sommerfeld operator for plane Poiseuille flow, explicitly using the
resolvent definition of pseudospectra and showing strong eigenvalue sensitivity
as Reynolds number increased.[^reddy-schmid-henningson] The same year,
Trefethen, Trefethen, Reddy, and Driscoll argued in *Science* that hydrodynamic
stability can require "without eigenvalues" analysis: pseudoresonance,
transient growth, and destabilizing perturbations are different faces of the
same nonnormal operator geometry.[^hydro]

The point is not that turbulence is solved by a \(2\times2\) matrix. It is that
the \(2\times2\) matrix contains the missing warning label:

```text
asymptotic modal stability does not bound finite-time amplification
```

If a nonlinear system has thresholds, finite-time amplification can be the
bridge from "small perturbation" to "large state where the linear model no
longer applies." The eigenvalues only tell you that infinitesimal disturbances
eventually decay if they remain in the linear neighborhood.

Sometimes "eventually" arrives too late.

## Numerical Algorithms Have This Personality Too

The same pattern shows up in numerical computing.

An iteration matrix can have spectral radius less than one, yet converge
painfully or show large transient error if it is nonnormal. A discretized
differential operator can have eigenvalues in the stable half-plane, yet have
resolvent growth that makes time stepping delicate. A least-squares or Krylov
method can look harmless if you inspect only eigenvalues and miss the geometry
of the basis it is building.

Trefethen's survey on pseudospectra of linear operators emphasizes exactly this
spread of applications: numerical instability, stiffness, hydrodynamic
stability, and nonsymmetric iterative algorithms all become clearer when one
looks at resolvent growth rather than only the spectrum.[^trefethen-linear]

The slogan I now use in code review for numerical experiments is:

```text
spectral radius answers "eventually?"
resolvent and transient norms answer "what can happen on the way?"
```

If the matrix is symmetric, Hermitian, orthogonal, unitary, or otherwise normal,
the slogan collapses to the familiar spectral story. The pseudospectrum does not
buy much drama.

If the matrix is nonnormal, the drama is the point.

## A Small Checklist For Real Work

When I see a stability claim based on eigenvalues, I now want four follow-up
checks before I relax.

First, measure nonnormality. At minimum, inspect whether \(A^*A\) and \(AA^*\)
are close, or look at eigenvector conditioning when the eigendecomposition is
available. A beautiful spectrum with an ill-conditioned eigenvector matrix is a
warning sign.

Second, compute a transient curve. For continuous time, sample or bound
\(\|e^{tA}\|\) over the time window the application actually cares about. For
discrete time, inspect \(\|A^k\|\), not just \(\rho(A)^k\).

Third, estimate a pseudospectrum or resolvent profile. You do not always need a
publication-quality contour plot. Even coarse probes of
\(\|(zI-A)^{-1}\|\) near the stability boundary can reveal whether the spectrum
is fragile.

Fourth, perturb in a physically meaningful way. The mathematical
\(\epsilon\)-pseudospectrum allows arbitrary perturbations in a chosen norm.
Your application may only allow structured perturbations: boundary conditions,
roundoff, modeling error in one block, missing damping, correlated coefficients.
The full pseudospectrum is a diagnostic, not a substitute for domain structure.

The last point matters. Pseudospectra can also be overused. A giant
pseudospectral set under arbitrary perturbations may overstate risk if the
dangerous perturbations are physically impossible. Conversely, a norm that looks
natural to the algebra may be wrong for the energy in the system.

The correct question is not:

```text
are the eigenvalues stable?
```

It is:

```text
stable under what norm, under what perturbations, over what time window?
```

## What I Think The Picture Is Saying

The eigenvalue plot is a weather report for the infinite horizon.

It says that if the system remains linear, and if you wait long enough, the
slowest decaying mode wins and the origin attracts. That is valuable.

But for nonnormal systems, the path to that future may pass through a region of
large amplification. The dangerous object is not the eigenvalue. It is the
almost-cancellation between eigenvectors, plus the resolvent bulge that tells
you small errors can make the spectrum look as if it crossed the boundary.

That is why the lab's default feels wrong the first time you see it:

```text
eigenvalue abscissa: -0.35
peak amplification: 7.35x
epsilon-pseudo abscissa: +0.03
```

The equilibrium is asymptotically stable.

The afternoon is not.

[^higham-review]: Nicholas J. Higham, review of Lloyd N. Trefethen and Mark Embree, *Spectra and Pseudospectra: The Behavior of Nonnormal Matrices and Operators*, *Bulletin of the American Mathematical Society*, 2007. The review summarizes the perturbation and resolvent definitions of pseudospectra. [PDF](https://eprints.maths.manchester.ac.uk/303/01/covered/MIMS_ep2006_133.pdf).

[^trefethen-embree]: Lloyd N. Trefethen and Mark Embree, *Spectra and Pseudospectra: The Behavior of Nonnormal Matrices and Operators*, Princeton University Press, 2005. [Book record](https://books.google.com/books/about/Spectra_and_Pseudospectra.html?id=7gIbT-Y7-AIC).

[^trefethen-linear]: Lloyd N. Trefethen, "Pseudospectra of Linear Operators", *SIAM Review* 39(3), 383-406, 1997. [PDF](https://people.maths.ox.ac.uk/trefethen/publication/PDF/1997_72.pdf).

[^reddy-schmid-henningson]: Satish C. Reddy, Peter J. Schmid, and Dan S. Henningson, "Pseudospectra of the Orr-Sommerfeld Operator", *SIAM Journal on Applied Mathematics* 53(1), 15-47, 1993. [Publisher page](https://epubs.siam.org/doi/10.1137/0153002).

[^hydro]: Lloyd N. Trefethen, Anne E. Trefethen, Satish C. Reddy, and Tobin A. Driscoll, "Hydrodynamic Stability Without Eigenvalues", *Science* 261(5121), 578-584, 1993. [PDF](https://people.maths.ox.ac.uk/trefethen/publication/PDF/1993_57.pdf).
