---
layout: post
title: "The Interior Path Keeps Its Distance"
description: "Interior-point methods solve constrained optimization by making every wall expensive before touching it. A small LP lab follows the central path and audits the m/t gap."
date: 2026-06-17 02:25:00 -0400
categories: mathematics
tags: [interior-point-methods, convex-optimization, linear-programming, newton-method, duality, algorithms]
excerpt: "A constraint is not only a wall. In a logarithmic-barrier method, it is a price signal that gets louder as the solver approaches the boundary."
---

The simplex picture of linear programming is cinematic: walk from vertex to
vertex, improve the objective, stop when no adjacent edge helps.

Interior-point methods are quieter. They do not want to touch the vertices
until the end.

They move through the feasible region as though every wall emits heat. The
closer the iterate gets to a constraint, the more that constraint pushes back.
The answer is still on the boundary, usually at a vertex. But the computation
arrives there by following a path through the middle.

That path is the object of this post.

## The Wall Becomes a Term in the Objective

Start with a two-dimensional linear program in inequality form:

$$
\begin{aligned}
\text{minimize} \quad & c^T x \\
\text{subject to} \quad & a_i^T x \le b_i,\quad i=1,\ldots,m.
\end{aligned}
$$

Define the slack of constraint $$i$$ as

$$
s_i(x) = b_i - a_i^T x.
$$

Strict feasibility means every slack is positive. The logarithmic-barrier
subproblem is

$$
x^\star(t)
= \arg\min_x
\left[
t c^T x - \sum_{i=1}^m \log s_i(x)
\right].
$$

The parameter $$t$$ decides how much the original objective matters relative to
the boundary tax. Small $$t$$ asks for a very central point. Large $$t$$ asks the
objective to dominate, so the point moves toward the LP optimum.

The gradient and Hessian in the lab are exactly the two-dimensional formulas:

$$
\nabla =
t c + \sum_i {a_i \over s_i},
\qquad
H = \sum_i {a_i a_i^T \over s_i^2}.
$$

Newton's method solves each smooth barrier subproblem. A backtracking line
search keeps the next point strictly feasible.

This is not Karmarkar's original projective algorithm. Karmarkar's 1984 paper
was a landmark because it gave a new polynomial-time algorithm for linear
programming, improving the ellipsoid-method bound in its setting and launching
the interior-point era.[^karmarkar] The plain log-barrier path below is a
smaller teaching instrument. The family resemblance is the decision to search
from the interior.

## The Central Path Has a Receipt

The reason the barrier path is more than a pretty curve is duality.

At an exact barrier minimizer, define

$$
\lambda_i(t) = {1 \over t s_i(x^\star(t))}.
$$

For the LP above, these quantities behave like dual multipliers. Each wall has
a price. A wall with tiny slack receives a large multiplier. A wall with
generous slack receives a small multiplier.

Their product is especially clean:

$$
\lambda_i(t)s_i(x^\star(t)) = {1 \over t}.
$$

Summing over the $$m$$ inequalities gives the central-path duality gap

$$
c^T x^\star(t) - p^\star \le {m \over t}.
$$

Boyd and Vandenberghe's convex optimization notes derive this central-path
dual point and the associated gap; their textbook develops the broader
barrier-method machinery and the tradeoff controlled by the growth parameter
used between centering stages.[^boyd-slides][^boyd-book]

That is why a barrier method can stop before it lands on the boundary. It does
not merely say:

```text
I look close.
```

It says:

```text
my remaining objective regret is paid for by m/t
```

The lab audits that claim by computing the exact 2D LP optimum from the
feasible polygon's vertices and comparing the regret to the displayed gap.

## Follow the Path

The experiment solves three small LPs. For each one, it:

1. builds the feasible polygon by intersecting half-spaces;
2. finds the exact LP optimum by checking vertices;
3. follows the log-barrier central path with damped Newton steps;
4. computes slacks, multipliers, and the bound $$m/t$$;
5. checks that the exact vertex regret is below the barrier gap.

Try two moves.

First, raise **Barrier t**. The red current point should move closer to the
purple optimum, while the displayed gap shrinks.

Second, change **Growth factor**. A larger factor takes fewer outer centering
stages but asks each warm-started Newton solve to work harder. In production,
this tradeoff is wrapped into more sophisticated primal-dual methods; Wright's
book is a standard reference for the practical primal-dual family, including
path-following and predictor-corrector algorithms.[^wright]

<style>
  .barrier-lab {
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

  .barrier-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    margin-bottom: 1rem;
  }

  .barrier-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .barrier-lab label span {
    color: #5d6872;
    font-size: 0.76rem;
    font-weight: 560;
  }

  .barrier-lab select,
  .barrier-lab input[type="range"] {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .barrier-lab select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    min-height: 2.35rem;
    padding: 0.35rem 0.5rem;
  }

  .barrier-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0 0 1rem;
  }

  .barrier-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    min-width: 0;
    padding: 0.7rem 0.75rem;
  }

  .barrier-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 680;
    letter-spacing: 0;
    line-height: 1.2;
    margin-bottom: 0.2rem;
    text-transform: uppercase;
  }

  .barrier-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.9rem, 2.5vw, 1.1rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .barrier-lab__metric.good strong {
    color: #0f766e;
  }

  .barrier-lab__metric.bad strong {
    color: #be123c;
  }

  .barrier-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .barrier-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 640px) {
    .barrier-lab {
      padding: 0.75rem;
    }

    .barrier-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="barrier-lp-lab" class="barrier-lab" data-barrier-lp-lab>
  <div class="barrier-lab__controls">
    <label>
      Scenario
      <select data-param="scenario" aria-label="LP scenario">
        <option value="blend" selected>factory blend</option>
        <option value="corridor">narrow corridor</option>
        <option value="redundant">redundant walls</option>
      </select>
      <span data-value="scenario">factory blend</span>
    </label>
    <label>
      Objective tilt
      <input type="range" min="-30" max="30" step="1" value="0" data-param="tilt" aria-label="Objective tilt in degrees">
      <span data-value="tilt">0 deg</span>
    </label>
    <label>
      Barrier t
      <input type="range" min="0" max="30" step="1" value="20" data-param="logT" aria-label="Logarithmic barrier parameter">
      <span data-value="logT">10^2</span>
    </label>
    <label>
      Growth factor
      <input type="range" min="15" max="60" step="1" value="30" data-param="growth" aria-label="Barrier growth factor">
      <span data-value="growth">3x</span>
    </label>
  </div>
  <div class="barrier-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="760" aria-label="Interior-point barrier method lab showing feasible polygon, central path, gap ledger, slack prices, and centering schedule"></canvas>
  <p class="barrier-lab__note">
    Toy 2D inequality-only LP solver. Its 60-case audit checks exact vertex
    optima, strict feasibility, stationarity, complementarity, finite-difference
    derivatives, and the displayed m/t regret bound.
  </p>
</div>

<script defer src="{{ '/assets/js/barrier-lp-lab.js?v=20260617c' | relative_url }}"></script>

## The Strange Part Is the Middle

In two dimensions, the optimum is easy to find. Check every vertex. Pick the
best one. Done.

That is why the lab uses 2D: not because anyone needs a solver for toy polygons,
but because the exact answer is visible. The interesting object is the path, not
the final vertex.

At low $$t$$, the point sits near the analytic center of the region. It is not
trying very hard to optimize. It is trying to keep all slacks healthy.

As $$t$$ grows, the objective pulls harder. The walls nearest the final optimum
acquire larger multipliers. Loose constraints become cheap. The path narrows
from "respect every wall" to "pay attention to the walls that will matter."

This is the version of constrained optimization I wish I had met first:

```text
constraints are not Boolean gates;
constraints are local prices
```

The line search still treats feasibility as sacred. It will not step outside
the polygon. But the Newton direction is shaped by a smooth model of every
constraint at once, so the solver can move globally before it knows the final
active set.

## What This Lab Is Not

It is not a production linear-programming solver. It has no sparse factorization,
no presolve, no degeneracy machinery, no equality constraints, no infeasible
start, and no predictor-corrector step. Modern primal-dual codes live or die by
their linear algebra and by careful implementation choices; Wright's discussion
of practical aspects makes that point directly.[^wright]

It is also not a proof of polynomial complexity. Nesterov and Nemirovskii built
the general theory of polynomial-time interior-point methods around
self-concordant functions and barriers, extending the interior-point viewpoint
beyond linear programming to broader convex programs.[^nesterov]

The lab is smaller than that on purpose.

It lets you inspect three receipts:

```text
slack:        how much room remains before a wall
multiplier:   how expensive that wall is at the current t
gap m/t:      how much objective regret the barrier certificate allows
```

If the red point looks close but the regret audit fails, the implementation is
wrong. If the point stays feasible and the regret is below $$m/t$$, the picture
is doing something more serious than drawing a curve.

## A Design Smell

There is a broader software lesson here.

Many systems handle constraints as final checks:

```text
generate candidate
reject if invalid
try again
```

That can work, but it wastes information. A failed check says only "no." A
barrier says "not that close, not that fast, and especially not through this
wall."

You see this pattern outside convex optimization:

```text
rate limits as prices rather than hard crashes
cache pressure as eviction cost rather than a cliff
risk limits as shadow costs rather than after-the-fact vetoes
type systems with useful diagnostics rather than a single red light
```

The interior path is a mathematical example of a humane interface between a
search process and its constraints. The walls are still real. The solver just
gets to hear them before impact.

## Reproducibility Notes

The executable artifact is
[`assets/js/barrier-lp-lab.js`]({{ '/assets/js/barrier-lp-lab.js' | relative_url }}).

The audit uses only local computations:

```text
polygon vertices = all feasible pairwise constraint intersections
LP optimum       = best vertex under c^T x
central point    = damped Newton solution of t c^T x - sum log slack
lambda_i         = 1 / (t slack_i)
gap bound        = m / t
```

The lab's self-test runs 60 parameter cases across all three scenarios and
performs 1,282 local checks:

```text
the feasible polygon has at least three vertices
every enumerated vertex is feasible
the exact vertex optimum dominates every other vertex
the warm-start point is strictly feasible
the central-path point stays strictly feasible
regret is nonnegative and below the displayed m/t gap
regret decreases as t is increased
lambda_i slack_i t = 1 for every inequality
||c + A^T lambda||_infinity is small at the solved point
finite-difference gradients and Hessians match at an interior probe
parameter sanitization clamps invalid UI input
Newton work is nonzero under the warm-start schedule
```

[^karmarkar]: Narendra Karmarkar, ["A new polynomial-time algorithm for linear programming"](https://link.springer.com/article/10.1007/BF02579150), *Combinatorica* 4, 373-395, 1984.

[^boyd-slides]: Stephen Boyd and Lieven Vandenberghe, ["Interior-point methods"](https://web.stanford.edu/class/ee364a/lectures/barrier.pdf), Stanford EE364a lecture notes. The central-path dual construction and gap formula appear in the barrier-method lecture.

[^boyd-book]: Stephen Boyd and Lieven Vandenberghe, [*Convex Optimization*](https://web.stanford.edu/~boyd/cvxbook/bv_cvxbook.pdf), Cambridge University Press, 2004.

[^wright]: Stephen J. Wright, [*Primal-Dual Interior-Point Methods*](https://epubs.siam.org/doi/book/10.1137/1.9781611971453), SIAM, 1997.

[^nesterov]: Yurii Nesterov and Arkadii Nemirovskii, [*Interior-Point Polynomial Algorithms in Convex Programming*](https://epubs.siam.org/doi/10.1137/1.9781611970791), SIAM, 1994.
