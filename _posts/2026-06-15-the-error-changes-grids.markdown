---
layout: post
title: "The Error Changes Grids"
description: "Multigrid is fast because it does not ask one iteration to see every scale. It smooths oscillatory error, moves the remaining error to a coarser grid, and makes it visible again."
date: 2026-06-15 00:28:00 -0400
categories: applied-math
tags: [multigrid, numerical-linear-algebra, pde, poisson-equation, scientific-computing, iterative-methods]
excerpt: "Relaxation is not stupid. It is nearsighted. Multigrid wins by changing the grid until the error has the right wavelength for the local solver to see."
---

Relaxation is not stupid.

It is nearsighted.

That is the mental picture I wish I had learned first. A Jacobi or
Gauss-Seidel sweep is very good at killing error that alternates from one grid
cell to the next. It is bad at killing error that looks like a slow hill across
the whole domain. Not because the slow hill is small. Because a local stencil
cannot feel much difference between neighboring points on that hill.

Multigrid does not fix this by inventing a heroic smoother.

It changes the grid.

On a coarser grid, the same smooth error has fewer points per wavelength. It is
less invisible. The local solver gets another chance to see it.

That is the whole trick, and it is a good one.

## The Local Solver Has Bad Eyesight

Use the one-dimensional Poisson problem with zero boundary values:

$$
-u''(x)=f(x),\qquad u(0)=u(1)=0.
$$

On a uniform grid, the standard second-difference system is

$$
\frac{2u_i-u_{i-1}-u_{i+1}}{h^2}=f_i.
$$

Weighted Jacobi updates a current guess by looking at the residual through the
diagonal:

$$
u_i^{new}
=u_i+\omega\frac{h^2}{2}
\left(f_i-\frac{2u_i-u_{i-1}-u_{i+1}}{h^2}\right).
$$

For the error, this is a filter. A sine mode with angle `theta` is multiplied
by

$$
1-2\omega\sin^2(\theta/2).
$$

High-frequency error has `theta` near `pi`, so a weight near `2/3` damps it
hard. Low-frequency error has `theta` near zero, so the multiplier is close to
one. The sweep barely notices it.

This is why a residual plot from plain relaxation can feel insulting. The
first few sweeps do something real. Then the curve flattens, not because the
remaining error is mysterious, but because it is smooth.

Brandt's 1977 multilevel paper made this scale separation operational for
boundary-value problems.[^brandt] The tutorial treatment by Briggs, Henson, and
McCormick popularized the clean engineering recipe: smooth, compute residual,
restrict to a coarse grid, solve a correction problem, prolong the correction,
and smooth again.[^briggs]

The method sounds recursive because the obstruction is recursive. A coarse
problem has its own smooth error. So it gets an even coarser problem.

## The Residual Is a Complaint About the Error

Suppose the current guess is `u` and the exact discrete solution is `u*`.
The error is

```text
e = u* - u
```

The residual is

```text
r = f - A u
```

Because `A u* = f`, those two objects satisfy the correction equation

$$
A e = r.
$$

That equation is the permission slip for multigrid. The solver does not know
the error, but it can compute the residual. If the residual is restricted to a
coarser grid, a cheaper problem can estimate the missing smooth correction.

One V-cycle looks like this:

```text
smooth on the fine grid
compute residual
restrict residual to the coarse grid
approximately solve A_coarse e_coarse = r_coarse
prolong e_coarse back to the fine grid
correct the fine-grid solution
smooth again
```

There are many choices hiding in those verbs. Jacobi, Gauss-Seidel, Chebyshev,
block smoothers, Schwarz smoothers, aggregation, Galerkin coarse operators,
geometric coarsening, algebraic coarsening. Modern algebraic multigrid takes
the same idea and asks how to build the hierarchy directly from the matrix,
without an obvious physical grid.[^xu-zikatanov]

But the base bargain remains:

```text
smoother removes oscillatory error
coarse grid removes smooth error
```

Local Fourier analysis is the microscope for this bargain. Thompson, Brown, and
He describe LFA as a way to investigate and tune multigrid methods, including
Jacobi and Chebyshev smoothing choices for two-grid schemes.[^lfa] The details
get sophisticated quickly, but the first diagnostic is humble: which
wavelengths survive one sweep?

## A Browser-Sized V-Cycle

The lab below solves a 1D Poisson system where the exact discrete solution is
known. The right-hand side is built by applying the discrete operator to that
known solution, so a tridiagonal direct solve can audit the whole experiment.

The implementation uses:

- weighted Jacobi smoothing;
- full-weighting residual restriction;
- linear interpolation for prolongation;
- direct tridiagonal solves on the coarsest grid;
- a recursive V-cycle.

The default has 127 interior grid points, Jacobi weight `0.67`, two pre/post
smoothing sweeps, six V-cycles, and a mixed-mode target solution. The audited
numbers from the same JavaScript file are:

```text
V-cycle relative residual        4.23e-7
Jacobi relative residual          0.159
fine-grid work units              46.6
high-mode energy after smoothing  1.33%
low-mode energy after one V       0.211%
direct-solve audit error          5.83e-14
36-case audit grid                36 / 36 passed
```

The comparison is not meant to be a production benchmark. It is a scale
experiment. Jacobi gets roughly the same fine-grid work budget as the V-cycles.
It smooths. It does not change scales.

<style>
  .multigrid-lab {
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

  .multigrid-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
  }

  .multigrid-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .multigrid-lab__controls input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .multigrid-lab__controls input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    height: 1.15rem;
  }

  .multigrid-lab__controls input[type="range"]::-webkit-slider-runnable-track {
    background: #d7dee5;
    border-radius: 999px;
    height: 4px;
  }

  .multigrid-lab__controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    background: #0f766e;
    border: 0;
    border-radius: 999px;
    height: 14px;
    margin-top: -5px;
    width: 14px;
  }

  .multigrid-lab__controls input[type="range"]::-moz-range-track {
    background: #d7dee5;
    border-radius: 999px;
    height: 4px;
  }

  .multigrid-lab__controls input[type="range"]::-moz-range-thumb {
    background: #0f766e;
    border: 0;
    border-radius: 999px;
    height: 14px;
    width: 14px;
  }

  .multigrid-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .multigrid-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .multigrid-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .multigrid-lab__metric span,
  .multigrid-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .multigrid-lab__metric span {
    display: block;
  }

  .multigrid-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .multigrid-lab canvas {
    background: #ffffff;
    display: block;
    height: 780px;
    max-width: 100%;
    width: 100%;
  }

  .multigrid-lab__note {
    margin: 0.9rem 0 0;
  }

  @media (max-width: 560px) {
    .multigrid-lab {
      padding: 0.85rem;
    }

    .multigrid-lab canvas {
      height: 1040px;
    }
  }
</style>

<div class="multigrid-lab" data-multigrid-lab>
  <div class="multigrid-lab__controls">
    <label>
      <span>Grid: <output data-value="level">127 pts</output></span>
      <input type="range" min="5" max="8" step="1" value="7" data-param="level">
    </label>
    <label>
      <span>Jacobi weight: <output data-value="omega">0.67</output></span>
      <input type="range" min="45" max="85" step="1" value="67" data-param="omega">
    </label>
    <label>
      <span>Smoothing sweeps: <output data-value="smooth">2</output></span>
      <input type="range" min="1" max="4" step="1" value="2" data-param="smooth">
    </label>
    <label>
      <span>V-cycles: <output data-value="cycles">6</output></span>
      <input type="range" min="1" max="10" step="1" value="6" data-param="cycles">
    </label>
    <label>
      <span>Right-hand side: <output data-value="shape">mixed modes</output></span>
      <input type="range" min="0" max="3" step="1" value="0" data-param="shape">
    </label>
  </div>
  <div class="multigrid-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Multigrid V-cycle lab showing solution error, residual convergence by work, error spectrum, and grid hierarchy"></canvas>
  <p class="multigrid-lab__note">
    Deterministic 1D Poisson solver for the mechanism, not a replacement for a
    production multigrid package. The executable artifact is
    <code>assets/js/multigrid-error-lab.js</code>.
  </p>
</div>

<script defer src="{{ '/assets/js/multigrid-error-lab.js?v=20260615a' | relative_url }}"></script>

## The Coarse Grid Is Not a Smaller World

A coarse grid is not just a cheap approximation to the fine grid.

It is a change of coordinates for the error.

That distinction matters because it explains why a tiny coarse solve can be
worth so much. The coarse correction does not need to reproduce every
fine-scale wiggle. The smoother already handled those. The coarse solve is
there for the slow components that were invisible to the local iteration.

This also explains why multigrid can fail. If the smoother does not damp the
right high-frequency components, the coarse grid receives garbage. If the
restriction and prolongation operators do not represent the slow error well,
the correction misses the thing it was hired to fix. If coefficients are
anisotropic or discontinuous, a naive geometric hierarchy may stop matching the
physics. Then the method becomes an art again.

The recent high-order discontinuous Galerkin study by Saye is a nice reminder
that this is still active engineering: using a standard V-cycle template, it
tests different block smoothers across Poisson, interface, and Stokes problems,
and reports cases where 4 to 8 iterations reduce residuals by 10 orders of
magnitude.[^saye] The V-cycle is old. The choice of smoother and hierarchy is
still alive.

## Why This Feels Like Cheating

Direct solvers eliminate unknowns.

Krylov methods build better and better polynomials on the spectrum.

Multigrid does something slightly more physical. It asks what wavelength the
remaining error has, then changes the measuring device.

On the fine grid, a slow error mode is a broad hill. Jacobi sees neighboring
points that are almost equal and shrugs. On a coarse grid, that same hill is
sampled with fewer points. It bends more sharply. A local correction can touch
it.

Then the correction is interpolated back, and the fine grid smooths away the
interpolation scars.

That last detail is part of the beauty. Multigrid is not a single clever move.
It is a division of labor:

```text
fine grid: remove oscillations
coarse grid: remove hills
finer grid again: clean up the stitching
```

If the problem really has elliptic, multiscale structure, that division can be
almost embarrassingly efficient. The cost of visiting all coarser grids is a
geometric series. In one dimension, the total number of unknowns across the
hierarchy is less than twice the fine-grid unknown count. In higher dimensions,
the same geometric idea survives even more comfortably.

This is why multigrid has the aura of a trick, but it is not magic.

It is scale accounting.

## The Useful Lesson

The lesson I want to keep is not "use multigrid everywhere."

It is sharper:

```text
slow convergence is often a scale mismatch
```

If the remaining error is smooth, do not keep asking a local fine-grid
iteration to discover it from tiny neighbor differences. Move the complaint to
a grid where it has the right wavelength. Solve there. Come back. Smooth the
seams.

The error changes grids because the solver has eyes at different scales.

[^brandt]: Achi Brandt, "Multi-Level Adaptive Solutions to Boundary-Value Problems", *Mathematics of Computation* 31(138), 1977. [DOI](https://doi.org/10.1090/S0025-5718-1977-0431719-X).

[^briggs]: William L. Briggs, Van Emden Henson, and Steve F. McCormick, *A Multigrid Tutorial*, 2nd edition, SIAM, 2000. [DOI](https://doi.org/10.1137/1.9780898719505).

[^xu-zikatanov]: Jinchao Xu and Ludmil T. Zikatanov, "Algebraic Multigrid Methods", *Acta Numerica* 26, 2017. [arXiv](https://arxiv.org/abs/1611.01917).

[^lfa]: Jeremy L. Thompson, Jed Brown, and Yunhui He, "Local Fourier Analysis of P-Multigrid for High-Order Finite Element Operators", 2021. [arXiv](https://arxiv.org/abs/2108.01751).

[^saye]: Robert I. Saye, "A comparative study of efficient multigrid solvers for high-order local discontinuous Galerkin methods: Poisson, elliptic interface, and multiphase Stokes problems", 2024. [arXiv](https://arxiv.org/abs/2412.12506).
