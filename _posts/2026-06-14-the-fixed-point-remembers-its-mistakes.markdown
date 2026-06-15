---
layout: post
title: "The Fixed Point Remembers Its Mistakes"
description: "Anderson acceleration turns a slow fixed-point iteration into a small residual-canceling least-squares problem. The magic is real, but only if you respect memory, damping, and safeguards."
date: 2026-06-14 20:44:00 -0400
categories: applied-math
tags: [anderson-acceleration, fixed-point-iteration, numerical-linear-algebra, optimization, solvers, quasi-newton]
excerpt: "A fixed-point solver that forgets every residual is condemned to repeat the same mistake. Anderson acceleration keeps a short memory and asks which mistakes cancel."
---

Some algorithms look too simple to deserve a name.

Start with a guess \(x_0\). Apply a map \(g\). Repeat:

$$
x_{k+1} = g(x_k).
$$

If the sequence settles, the limit satisfies

$$
x_\star = g(x_\star).
$$

This is fixed-point iteration, also called Picard iteration. It appears wherever
a computational problem is phrased as "feed the current answer through the
machine and get a better answer back." Self-consistent field calculations,
operator splitting, value iteration, EM-like updates, alternating projections,
deep equilibrium layers, implicit simulation, and many calibration loops all
have this shape.

The residual is

$$
f_k = g(x_k) - x_k.
$$

It tells you the direction in which the fixed-point machine wants to move. A
plain fixed-point iteration listens to the newest residual and forgets all the
old ones.

Anderson acceleration asks a sharper question:

```text
What affine combination of recent residuals is smallest?
```

That one sentence is the trick. The solver keeps a short memory of its recent
mistakes, then chooses weights that make those mistakes cancel.

## The Slow Loop

Fixed-point iteration is attractive because it is a wrapper, not a rewrite. You
do not need a Jacobian. You do not need to expose the internals of \(g\). You
just call the same update rule repeatedly.

That convenience is also why it can be painfully slow. If the map is a
contraction, the Banach fixed-point theorem gives a clean convergence story:
nearby points get pulled closer. But "closer" can mean "barely closer." A
contraction factor of 0.98 is mathematically comforting and operationally
annoying. Each iteration removes only about two percent of the remaining error.

Worse, even a stable map can keep pushing in nearly the same wrong direction.
You see the residual shrink, but the path bends slowly. The solver is paying for
amnesia.

Donald Anderson's 1965 paper introduced the acceleration idea in the setting of
nonlinear integral equations.[^anderson] The modern numerical-analysis view is
often stated for a fixed-point problem

$$
x = g(x).
$$

Given recent iterates \(x_{k-m},\ldots,x_k\) and residuals
\(f_i=g(x_i)-x_i\), the type-II Anderson step solves

$$
\min_\alpha
\left\|
\sum_i \alpha_i f_i
\right\|_2
\quad\text{subject to}\quad
\sum_i \alpha_i = 1.
$$

Then it moves using the same affine weights, typically as

$$
x_{k+1} =
\sum_i \alpha_i g(x_i),
$$

or with a damping parameter \(\beta\),

$$
x_{k+1} =
\sum_i \alpha_i\left[(1-\beta)x_i+\beta g(x_i)\right].
$$

If \(m=0\), there is only one residual and one weight. You are back at ordinary
fixed-point iteration.

So Anderson acceleration does not replace your update rule. It wraps it with a
small least-squares problem.

## The Residual Is the Data

The least-squares problem is easy to misread. It is not fitting the fixed point.
It is fitting the residual.

That distinction matters. The method is not saying "average the last few
iterates because averaging is stable." The weights can be negative. They can
extrapolate outside the convex hull of recent iterates. In a good step, those
negative weights are not a bug; they are how the method says:

```text
the last move overcorrected in this direction
```

This is why Anderson often behaves like a derivative-free quasi-Newton method.
Fang and Saad put the method into a multisecant family: instead of building an
explicit Jacobian, the algorithm uses differences between recent residuals to
infer how the fixed-point map has been responding.[^fang-saad] The memory window
is a tiny local model of the inverse error dynamics.

Walker and Ni sharpened another connection. On linear fixed-point problems, full
memory Anderson acceleration is essentially equivalent to GMRES applied to the
corresponding linear system, under the usual nonstagnation conditions.[^walker-ni]
That is the cleanest reason the method can look almost suspiciously powerful on
linear or nearly linear problems. It is not just momentum. It is residual
minimization in disguise.

## A Two-Dimensional Self-Consistency Toy

The lab below solves a small fixed-point problem with a known solution. The map
has:

- a slow mode, which makes ordinary iteration crawl;
- a shear term, which makes the path bend;
- a bounded nonlinear term, which prevents the example from being only GMRES in
  costume;
- a damping parameter and a safeguard, because unguarded extrapolation can do
  foolish things.

At the default setting, the same 24 calls to the fixed-point map produce:

```text
Picard final residual      3.914e-4
damped Picard residual     1.292e-2
Anderson final residual    8.436e-7
speedup vs Picard          464x
safeguarded mixes          3
largest coefficient L1     71.3
```

The high coefficient norm is not a typo. Some candidate mixes are aggressive;
the lab rejects steps that make the residual too large and falls back to a
damped Picard step. That is part of the point. Anderson acceleration is a
memory, not a conscience.

<style>
  .aa-lab {
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

  .aa-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  }

  .aa-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .aa-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .aa-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .aa-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .aa-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .aa-lab__metric span,
  .aa-lab__legend,
  .aa-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .aa-lab__metric span {
    display: block;
  }

  .aa-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .aa-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .aa-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .aa-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .aa-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .aa-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div class="aa-lab" data-anderson-acceleration-lab>
  <div class="aa-lab__controls">
    <label>
      Slow mode: <output data-value="slow">94%</output>
      <input type="range" min="70" max="98" step="1" value="94" data-param="slow">
    </label>
    <label>
      Shear: <output data-value="shear">48%</output>
      <input type="range" min="0" max="80" step="1" value="48" data-param="shear">
    </label>
    <label>
      Nonlinearity: <output data-value="curve">18%</output>
      <input type="range" min="0" max="45" step="1" value="18" data-param="curve">
    </label>
    <label>
      Memory: <output data-value="memory">4</output>
      <input type="range" min="0" max="7" step="1" value="4" data-param="memory">
    </label>
    <label>
      Damping beta: <output data-value="beta">1.00</output>
      <input type="range" min="35" max="120" step="5" value="100" data-param="beta">
    </label>
    <label>
      Start radius: <output data-value="start">1.40</output>
      <input type="range" min="45" max="210" step="5" value="140" data-param="start">
    </label>
    <label>
      Start angle: <output data-value="angle">125 deg</output>
      <input type="range" min="0" max="360" step="5" value="125" data-param="angle">
    </label>
    <label>
      Steps: <output data-value="steps">24</output>
      <input type="range" min="8" max="50" step="1" value="24" data-param="steps">
    </label>
  </div>
  <div class="aa-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Anderson acceleration lab comparing Picard iteration, damped Picard iteration, and safeguarded Anderson mixing"></canvas>
  <div class="aa-lab__legend" aria-hidden="true">
    <span><i style="background:#64748b"></i>Picard</span>
    <span><i style="background:#d97706"></i>damped</span>
    <span><i style="background:#2563eb"></i>Anderson</span>
    <span><i style="background:#0f766e"></i>fixed point</span>
    <span><i style="background:#dc2626"></i>safeguard</span>
  </div>
  <p class="aa-lab__note">
    The toy map is two-dimensional and deliberately small enough to audit in the
    browser. The safeguard rejects extrapolated mixes whose residual grows too
    much, then restarts memory with a damped fixed-point step.
  </p>
</div>

<script src="{{ '/assets/js/anderson-acceleration-lab.js?v=20260614a' | relative_url }}"></script>

## What the Panels Mean

The residual terrain is not an objective function. It is the norm
\(\|g(x)-x\|\) over the plane. The fixed point is the dark green dot. The three
paths are three ways of spending the same map evaluations.

Picard follows the newest residual. Damped Picard follows a smaller version of
that residual. Anderson constructs an affine combination of recent mapped points
whose residual combination is small. When the blue path jumps across the
terrain, that is extrapolation.

The residual history is on a log scale. A straight line means linear
convergence. A sudden drop means the memory window found a combination that
canceled the slow mode.

The "last Anderson mix" panel shows the final affine weights. Negative bars
mean extrapolation. If all weights are nonnegative, the method is only
interpolating within the recent history. Anderson's power usually appears when
it is allowed to step outside that little polygon.

The memory sweep asks a practical question: how many old residuals are worth
remembering? More memory is not automatically better. A longer window can solve
a richer least-squares problem, but it can also become ill-conditioned, noisy, or
too eager to extrapolate from stale geometry.

## Why This Is Not Just Momentum

Momentum stores a direction. Anderson stores a small residual subspace.

For a linear fixed-point map

$$
g(x) = Ax + b,
$$

the residual is affine:

$$
f(x) = g(x)-x = b - (I-A)x.
$$

Minimizing a combination of recent residuals is then closely related to
minimizing the linear-system residual over a Krylov subspace. That is the
GMRES connection in Walker and Ni. In this case, Anderson is not merely pushing
harder along yesterday's direction. It is asking a small linear algebra problem
which mixture of recent errors has the smallest remaining residual.

On nonlinear maps, the same picture becomes local and fragile. Recent residuals
approximate how the map has behaved nearby. If the map is smooth enough and the
iterates are close enough, that local model can be excellent. If the map changes
shape, if the residuals are noisy, or if the least-squares coefficients become
wild, the local model can confidently lie.

That is why serious implementations rarely use naked Anderson acceleration
without practical controls.

## The Coefficients Are a Warning Light

Toth and Kelley proved a useful local convergence result: Anderson(\(m\)) is
locally r-linearly convergent when the fixed-point map is a contraction and the
linear-combination coefficients stay bounded.[^toth-kelley]

That last phrase is not decoration.

Large coefficients mean the method is canceling residuals by subtracting nearly
equal large quantities. In exact arithmetic on a friendly local model, that can
be brilliant. In floating point, with noise, delayed updates, approximate
subproblem solves, or a map that changes curvature, it can be a flare.

The lab exposes this deliberately. Turn **Damping beta** above one, increase
**Shear**, and add **Nonlinearity**. The method may still win, but safeguards
start firing. Turn **Memory** to zero and Anderson becomes Picard. Turn memory
too high on a curved problem and the window may remember old geometry that no
longer deserves trust.

This is the real engineering lesson:

```text
residual memory is useful only when the memory is local enough to be true
```

## Safeguards Are Part of the Algorithmic Taste

The lab uses a simple safeguard: if an extrapolated Anderson candidate makes the
residual too large, reject it, take a damped Picard step, and restart the memory.
This is not a theorem-grade production method. It is a readable version of an
important design principle.

Modern work on Anderson acceleration often treats stabilization as central, not
optional. Zhang, O'Donoghue, and Boyd proposed a globally convergent type-I
Anderson variant for nonsmooth nonexpansive fixed-point problems by combining
safeguarding, Powell-type regularization, and restart checks.[^zhang-boyd] Their
paper is also a useful reminder of how common fixed-point formulations are in
optimization: many first-order algorithms are fixed-point iterations in disguise.

That is where Anderson acceleration becomes relevant to machine learning and
software systems. If your training, inference, or simulation loop solves an
implicit equation by repeatedly applying an operator, then there may be a small
residual-canceling problem hiding beside it.

Examples include:

- fixed-point layers and deep equilibrium models;
- implicit differentiation pipelines that repeatedly solve linear or nonlinear
  systems;
- ADMM, Douglas-Rachford, proximal-gradient, and other operator-splitting
  loops;
- EM and alternating-minimization updates;
- physics simulation and geometry optimization loops;
- self-consistent field calculations in electronic structure.

The wrapper is attractive because it can be black-box. The danger is attractive
for the same reason. A black-box accelerator sees residuals, not physics,
constraints, units, or invariants. The safeguard is where the algorithm admits
it does not understand the whole problem.

## A Tiny Implementation Contract

For this post I wrote the lab as a browser-native implementation rather than
importing a numerical package. That makes the contract visible:

1. Keep recent pairs \((x_i, f_i)\).
2. Solve the constrained least-squares problem
   \(\min \|\sum_i \alpha_i f_i\|_2\) with \(\sum_i\alpha_i=1\).
3. Form the mixed candidate from the same weights.
4. Reject the candidate if its residual grows too much.
5. Plot the residual norm, not just the pretty path.

The exported simulator checks that residuals remain finite, paths stay bounded,
the memory sweep has the expected size, Anderson with memory improves over the
initial residual, and the final affine weights sum to one. I also ran a stress
sweep over linear, curved, zero-memory, aggressive, and clamped parameter cases.

Those checks do not prove Anderson acceleration works in general. They prove
the visualization is doing what the essay says it is doing.

## What to Remember

Fixed-point iteration has a severe interface:

```text
give me x
I will give you g(x)
```

Newton's method asks for more. It wants derivatives, or at least a way to build
and solve with a Jacobian. Anderson acceleration stays inside the fixed-point
interface and adds only memory.

That is why it is so portable. It is also why it is easy to misuse.

The useful mental model is:

```text
Picard repeats the newest mistake.
Momentum remembers one direction.
Anderson asks which recent mistakes cancel.
```

When the local residual geometry is coherent, that question can turn a crawling
solver into a fast one. When the geometry is stale or noisy, the same question
can produce a beautiful extrapolation into nonsense.

So the fixed point remembers its mistakes. The solver still needs judgment about
which memories to trust.

[^anderson]: Donald G. Anderson, ["Iterative Procedures for Nonlinear Integral Equations"](https://doi.org/10.1145/321296.321305), *Journal of the ACM* 12(4), 1965.

[^walker-ni]: Homer F. Walker and Peng Ni, ["Anderson Acceleration for Fixed-Point Iterations"](https://users.wpi.edu/~walker/Papers/Walker-Ni%2CSINUM%2CV49%2C1715-1735.pdf), *SIAM Journal on Numerical Analysis* 49(4), 2011. The SIAM page is [here](https://epubs.siam.org/doi/10.1137/10078356X).

[^fang-saad]: Haw-ren Fang and Yousef Saad, ["Two classes of multisecant methods for nonlinear acceleration"](https://cseweb.ucsd.edu/classes/sp24/cse291-e/papers/Newton/MultisecantFangSaad.pdf), *Numerical Linear Algebra with Applications* 16, 2009.

[^toth-kelley]: Alex Toth and C. T. Kelley, ["Convergence Analysis for Anderson Acceleration"](https://epubs.siam.org/doi/10.1137/130919398), *SIAM Journal on Numerical Analysis* 53(2), 2015.

[^zhang-boyd]: Junzi Zhang, Brendan O'Donoghue, and Stephen Boyd, ["Globally Convergent Type-I Anderson Acceleration for Nonsmooth Fixed-Point Iterations"](https://web.stanford.edu/~boyd/papers/pdf/scs_2.0_v_global.pdf), *SIAM Journal on Optimization* 30(4), 2020.
