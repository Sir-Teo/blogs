---
layout: post
title: "Grids Have Speed Limits"
description: "The CFL condition is not a magic stability spell. It is a geometric warning: a time step cannot outrun the stencil that is supposed to carry information."
date: 2026-06-14 21:34:00 -0400
categories: physics
tags: [cfl-condition, finite-difference, advection, numerical-methods, pde, simulation, computational-physics]
excerpt: "A finite-difference solver fails when physics moves farther than the code can see. The browser lab makes upwind diffusion, Lax-Wendroff ringing, and centered-scheme instability visible."
---

A simulation can be wrong before it looks wrong.

The graph is smooth. The units are plausible. The wave moves in the right
direction. Then one knob crosses an invisible line and the field explodes into
oscillations that were never in the equation.

The invisible line has a name: the Courant-Friedrichs-Lewy condition.

It is often taught as a time-step formula. That undersells it. CFL is not mainly
a formula. It is a demand that the numerical stencil be wide enough to hear the
part of the initial condition that the differential equation says matters.

If the physics sends information across one and a half grid cells in one time
step, but your update formula only looks one cell upstream, your code is not
being bold. It is guessing.

## The Smallest Place It Breaks

Use the scalar advection equation on a periodic line:

$$
q_t + a q_x = 0,\qquad a>0.
$$

The exact solution is not mysterious. The whole profile simply translates:

$$
q(x,t)=q_0(x-at).
$$

That is why advection is such a good lab animal for numerical methods. There is
nowhere for the algorithm to hide. If the method diffuses the wave, it added
viscosity. If it rings near a jump, it added dispersion. If the amplitude grows
without bound, it manufactured energy.

Put a grid spacing `dx` under the line and a time step `dt` under the clock. The
dimensionless number

$$
C=\frac{a\,dt}{dx}
$$

is the Courant number. In this post the wave speed is positive, so "upstream"
means the cell on the left.

Here are three explicit one-step schemes for the same equation:

$$
\text{upwind:}\qquad
q_i^{n+1}=q_i^n-C(q_i^n-q_{i-1}^n),
$$

$$
\text{centered FTCS:}\qquad
q_i^{n+1}=q_i^n-\frac{C}{2}(q_{i+1}^n-q_{i-1}^n),
$$

$$
\text{Lax-Wendroff:}\qquad
q_i^{n+1}=q_i^n
-\frac{C}{2}(q_{i+1}^n-q_{i-1}^n)
+\frac{C^2}{2}(q_{i+1}^n-2q_i^n+q_{i-1}^n).
$$

They all look local. They all look reasonable. They are not equally sane.

Courant, Friedrichs, and Lewy made the core observation in 1928, long before
digital computers made it a practical engineering nuisance. For hyperbolic
initial-value problems, convergence depends on inequalities between mesh-width
ratios and the characteristic directions of the PDE.[^cfl] Trefethen's lecture
notes phrase the same idea in the language that is easiest to remember: the
mathematical domain of dependence must be contained inside the numerical domain
of dependence.[^trefethen]

For this one-dimensional advection stencil, that geometric warning becomes
roughly `C <= 1`.

Roughly is important.

## Necessary Is Not Sufficient

CFL can tell you that a scheme is doomed. It cannot, by itself, bless a scheme.

The centered FTCS update sees both neighboring cells, so its stencil is not
obviously too narrow when `C < 1`. But Fourier analysis catches the bug. Insert
a mode `exp(i theta i)` and each time step multiplies it by an amplification
factor.

For the centered scheme:

$$
G_{\text{centered}}(\theta)=1-iC\sin\theta.
$$

Its magnitude is

$$
|G_{\text{centered}}(\theta)|
=\sqrt{1+C^2\sin^2\theta}.
$$

That is bigger than 1 for any nonzero `C` and any Fourier mode with
`sin(theta) != 0`. So the method grows small oscillations even though its stencil
passes the naive CFL picture.

Upwind and Lax-Wendroff are better behaved for `0 <= C <= 1`:

$$
G_{\text{upwind}}(\theta)
=1-C+C e^{-i\theta},
$$

$$
G_{\text{LW}}(\theta)
=1-iC\sin\theta+C^2(\cos\theta-1).
$$

For scalar advection these stay bounded by one in magnitude when the Courant
number is at most one. But they pay different prices. Upwind damps high
frequencies; sharp edges smear. Lax-Wendroff is second order on smooth data, but
near discontinuities it tends to ring.

This is why "stable" is not the same as "good". A stable method may be
diffusive. An accurate method on smooth waves may misbehave near jumps. A
conservative method may preserve mass while inventing enormous oscillations.

## Crash Bench

The lab below evolves the same periodic profile with upwind, centered FTCS, and
Lax-Wendroff. It also computes a discrete exact translator by shifting the
sampled initial data with periodic linear interpolation. That detail matters:
for a square wave, re-sampling the continuous step after a fractional shift can
change grid mass just because a jump moved across a sample point.

The four panels show the transported profile, RMS amplitude over time, Fourier
amplification, and a sweep over Courant numbers.

<style>
  .cfl-lab {
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

  .cfl-lab__controls {
    display: grid;
    gap: 0.85rem 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    overflow: hidden;
  }

  .cfl-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
    overflow: hidden;
  }

  .cfl-lab__controls input,
  .cfl-lab__controls select {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .cfl-lab__controls input[type="range"] {
    appearance: none;
    background: transparent;
    height: 1.15rem;
  }

  .cfl-lab__controls input[type="range"]::-webkit-slider-runnable-track {
    background: #e3e8ee;
    border: 1px solid #b7c1cb;
    border-radius: 999px;
    height: 0.36rem;
  }

  .cfl-lab__controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    background: #0f766e;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #0f766e;
    height: 1rem;
    margin-top: -0.36rem;
    width: 1rem;
  }

  .cfl-lab__controls input[type="range"]::-moz-range-track {
    background: #e3e8ee;
    border: 1px solid #b7c1cb;
    border-radius: 999px;
    height: 0.36rem;
  }

  .cfl-lab__controls input[type="range"]::-moz-range-thumb {
    background: #0f766e;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #0f766e;
    height: 0.8rem;
    width: 0.8rem;
  }

  .cfl-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .cfl-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .cfl-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .cfl-lab__metric {
    background: #f8fafc;
    border: 1px solid #dfe6ee;
    border-radius: 6px;
    font-family: var(--font-ui);
    min-width: 0;
    padding: 0.62rem 0.7rem;
  }

  .cfl-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    letter-spacing: 0;
    line-height: 1.2;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
  }

  .cfl-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .cfl-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    max-width: 100%;
  }

  .cfl-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.75rem 0 0;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) .cfl-lab {
      background: #ffffff;
      color: #172026;
    }
  }

  :root[data-theme="dark"] .cfl-lab {
    background: #ffffff;
    color: #172026;
  }
</style>

<div class="cfl-lab" data-cfl-advection-lab>
  <div class="cfl-lab__controls">
    <label>Profile
      <select data-param="shape">
        <option value="packet" selected>Two pulses</option>
        <option value="gaussian">Gaussian</option>
        <option value="square">Square wave</option>
        <option value="sine">Smooth sine</option>
      </select>
      <output data-value="shape">packet</output>
    </label>
    <label>Cells
      <input data-param="cells" type="range" min="48" max="256" step="1" value="128">
      <output data-value="cells">128</output>
    </label>
    <label>Courant number
      <input data-param="cfl" type="range" min="5" max="135" step="1" value="82">
      <output data-value="cfl">0.82</output>
    </label>
    <label>Steps
      <input data-param="steps" type="range" min="1" max="260" step="1" value="96">
      <output data-value="steps">96</output>
    </label>
    <label>Scheme
      <select data-param="mode">
        <option value="all" selected>All schemes</option>
        <option value="upwind">Upwind</option>
        <option value="laxWendroff">Lax-Wendroff</option>
        <option value="centered">Centered FTCS</option>
      </select>
      <output data-value="mode">all schemes</output>
    </label>
    <label>Artificial viscosity
      <input data-param="viscosity" type="range" min="0" max="30" step="1" value="0">
      <output data-value="viscosity">0.00</output>
    </label>
  </div>
  <div class="cfl-lab__metrics" data-metrics></div>
  <canvas data-canvas width="680" height="780" role="img" aria-label="Interactive CFL advection lab comparing finite difference schemes"></canvas>
  <p class="cfl-lab__note">The audit checks finite values, exact-grid mass conservation, scheme mass conservation, and the expected Fourier amplification behavior below and above the unit CFL boundary.</p>
</div>

<script src="{{ '/assets/js/cfl-advection-lab.js?v=20260614a' | relative_url }}"></script>

The default two-pulse case uses `128` cells, `C = 0.82`, and `96` time steps.
The browser and Node implementation agree on these checks:

```text
upwind L1 error              0.0222600
Lax-Wendroff L1 error        0.00371175
centered FTCS L1 error       11.3404
centered max amplification   1.29321
upwind RMS start -> end      0.3087 -> 0.2886
Lax-Wendroff RMS start -> end 0.3087 -> 0.3083
centered RMS start -> end    0.3087 -> 16.50
audit                        passed
```

Now switch to the square wave. Upwind preserves total mass and stays stable, but
it rounds the corners. Lax-Wendroff keeps the transition sharper, but the total
variation rises because the method rings around the jump:

```text
square wave, C = 0.82, 96 steps
upwind total variation       2.000 -> 2.000
Lax-Wendroff total variation 2.000 -> 2.913
centered total variation     2.000 -> 4.336e7
```

Push `C` past one and the failure mode changes character. With `C = 1.15`, the
upwind scheme's worst Fourier amplification is `1.30000`; Lax-Wendroff's is
`1.64500`. Both are now beyond the speed limit. The profile may survive for a
few frames, especially if the initial data is smooth, but the unstable modes
have already been invited in.

## Conservation Is Not Enough

There is a tempting trap here: each update above can be written so neighboring
cells exchange flux. On a periodic grid, the sum of all cell values is preserved
to roundoff. The lab's centered scheme preserves mass even while it explodes.

That is not a paradox. Conservation says the average did not change. Stability
says perturbations did not grow uncontrollably. They are different promises.

LeVeque's finite-volume framing is the right mental upgrade for conservation
laws: evolve cell averages by fluxes through cell edges, because discontinuous
solutions must still satisfy the integral conservation law even where the
pointwise PDE has stopped making classical sense.[^leveque] But a conservative
flux still has to be chosen carefully. Conservation is the accounting system,
not the whole constitution.

Lax-Wendroff sits in this history as a beautiful second-order idea for hyperbolic
conservation laws.[^laxwendroff] The catch is visible in the square-wave panel.
Second order accuracy on smooth profiles is bought by a less monotone response
near nonsmooth profiles. Modern high-resolution methods use limiters, Riemann
solvers, and finite-volume structure to balance those competing demands.

The little lab here deliberately stops before those fixes. It is more useful as
a microscope than as a production solver.

## What To Remember While Debugging

The Courant number is a geometry number before it is a performance knob.

When `C = 0.5`, a characteristic travels half a cell per update. A one-cell
upstream stencil can plausibly contain the data needed for the next value. When
`C = 1.2`, the characteristic crosses more than one cell per update. A local
one-cell stencil cannot reconstruct information it never read.

But the centered FTCS failure is the warning that geometry is only the first
gate. After the domain-of-dependence check, you still need a stability check.
Fourier amplification is the clean one for linear constant-coefficient schemes;
energy estimates, monotonicity, total variation bounds, entropy conditions, and
problem-specific invariants take over in harder settings.

This is also why making the time step smaller is not always the same as making
the simulation correct. Smaller `dt` may satisfy the CFL constraint, but it does
not fix a spatial discretization that has the wrong kind of numerical diffusion
or the wrong behavior at discontinuities. The method and the time step are a
pair.

The speed limit is not a bureaucratic nuisance. It is the grid admitting what it
can and cannot know.

## Code Notes

The implementation in `assets/js/cfl-advection-lab.js` is intentionally small:

- it constructs the initial condition on a periodic grid;
- it advances three explicit schemes from the same sampled data;
- it compares against a mass-preserving discrete translator;
- it computes L1 error, RMS amplitude, total variation, and Fourier
  amplification;
- it sweeps `C` from `0.1` to `1.4` to expose the unit-CFL boundary.

The audit is not a theorem, but it is a useful tripwire. It caught an early
mistake in this post: the "exact" square-wave reference was initially sampled
from the continuous step function after a fractional shift, which made the
reference mass jump when the discontinuity crossed a grid point. The fixed
version shifts the sampled grid data instead.

That is the practical moral of numerical analysis in miniature: write the
plotting code, but make the plot answer to a test.

[^cfl]: Richard Courant, Kurt Friedrichs, and Hans Lewy, ["On the Partial Difference Equations of Mathematical Physics"](https://web.stanford.edu/class/cme324/classics/courant-friedrichs-lewy.pdf), English translation of the 1928 *Mathematische Annalen* paper, republished in *IBM Journal of Research and Development*, 1967.

[^trefethen]: Lloyd N. Trefethen, ["The CFL Condition"](https://people.maths.ox.ac.uk/trefethen/4all.pdf), Chapter 4 notes on accuracy, stability, and convergence. The notes emphasize domains of dependence and the point that the CFL condition is necessary rather than sufficient for stability.

[^leveque]: Randall J. LeVeque, ["Finite Volume Methods for Hyperbolic Problems"](https://depts.washington.edu/clawpack/book2/sample.pdf), Cambridge University Press, 2002. The sample chapter introduces conservation laws, discontinuous solutions, finite-volume cell averages, fluxes, Riemann problems, and the CFL condition.

[^laxwendroff]: Peter D. Lax and Burton Wendroff, ["Systems of conservation laws"](https://doi.org/10.1002/cpa.3160130205), *Communications on Pure and Applied Mathematics* 13(2), 217-237, 1960. See also the historical summary by Eymard, Gallouet, Herbin, and Latche, ["Finite volume schemes and Lax-Wendroff consistency"](https://comptes-rendus.academie-sciences.fr/mecanique/articles/10.5802/crmeca.132/), *Comptes Rendus. Mecanique*, 2022/2024.
