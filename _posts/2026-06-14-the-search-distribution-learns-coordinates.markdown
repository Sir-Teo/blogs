---
layout: post
title: "The Search Distribution Learns Coordinates"
description: "CMA-ES is not magic mutation. It is a rank-based optimizer that lets a Gaussian search distribution learn the valley it is walking through."
date: 2026-06-14 23:10:00 -0400
categories: machine-learning
tags: [cma-es, evolution-strategies, black-box-optimization, derivative-free-optimization, covariance-adaptation, optimization]
excerpt: "When gradients are missing or untrustworthy, the optimizer can still learn geometry from which mutations survived."
---

Some optimizers ask the function for a derivative.

CMA-ES asks a colder question: which sampled points survived?

That sounds primitive until the objective is rotated, scaled, noisy, discontinuous,
or hidden behind a simulator. Then a derivative-free method with a memory for
successful directions starts to look less like a genetic metaphor and more like
a small statistical instrument.

<div class="callout">
  <strong>Thesis:</strong> the key object in covariance matrix adaptation is not
  the individual mutation. It is the search distribution. CMA-ES learns a
  coordinate system by increasing probability mass in directions that repeatedly
  produced better samples.
</div>

Nikolaus Hansen's tutorial introduces CMA-ES as a randomized method for
continuous, nonlinear, non-convex black-box optimization.[^hansen-tutorial] The
classic Hansen-Ostermeier paper put derandomization and cumulation at the center
of evolution strategies: do not let each lucky mutation vanish; accumulate the
directional evidence it provides.[^hansen-ostermeier]

The official CMA-ES notes are blunt about the use case. If BFGS or conjugate
gradient works, they are usually faster. CMA-ES is attractive when gradients are
unavailable, unreliable, or not even meaningful: rugged landscapes, sharp bends,
noise, local optima, discontinuities, outliers.[^cma-notes] It is a second-order
flavored method without asking for first derivatives.

That distinction matters. "Evolution strategy" can sound like a population of
little agents trying random stunts. The more useful picture is:

```text
sample points from a distribution
rank them by observed objective value
move and reshape the distribution toward the winners
repeat
```

Natural Evolution Strategies make this distributional view explicit: optimize
the parameters of a search distribution using a natural-gradient idea.[^nes]
CMA-ES arrived from a different lineage, but the family resemblance is strong.
The optimizer is not merely trying points. It is learning where future tries
should come from.

## A Rotated Bowl Is Already a Trap

Consider the quadratic:

$$
f(x) = z_1^2 + \kappa z_2^2,
$$

where \(z\) is a rotated version of \(x\). The optimum is still at the origin.
The function is smooth, convex, and almost embarrassingly simple.

But if \(\kappa\) is large, the landscape is a narrow tilted valley. A spherical
search distribution wastes most of its samples across the steep wall. It must
shrink its step size to avoid overshooting, and then it crawls along the flat
axis.

A full covariance matrix can do something different. It can become long in the
flat direction and short in the steep direction. In a quadratic basin, that is
why people say CMA-ES learns something like an inverse Hessian. The covariance
is not the Hessian, but its eigensystem becomes a practical coordinate system
for sampling.

The algorithm below is a compact two-dimensional implementation:

- weighted recombination from the top half of each sampled population;
- cumulative step-size adaptation;
- rank-one and rank-\(\mu\) covariance updates;
- no restarts, active covariance update, constraints, integer variables,
  surrogate modeling, or noisy-ranking machinery.

So treat it as a microscope, not as a replacement for a production library.

<style>
  .cma-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .cma-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  }

  .cma-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .cma-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .cma-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .cma-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(122px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .cma-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.1rem;
    padding: 0.62rem 0.68rem;
  }

  .cma-lab__metric span,
  .cma-lab__legend,
  .cma-lab__note {
    color: #5d6872;
    font-size: 0.78rem;
  }

  .cma-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.08rem;
    line-height: 1.2;
    margin-top: 0.22rem;
  }

  .cma-lab canvas {
    display: block;
    height: 760px;
    max-width: 100%;
    width: 100%;
  }

  .cma-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .cma-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .cma-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .cma-lab__note {
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }

  @media (max-width: 560px) {
    .cma-lab {
      padding: 0.85rem;
    }

    .cma-lab canvas {
      height: 980px;
    }
  }
</style>

<div class="cma-lab" data-cma-coordinate-lab>
  <div class="cma-lab__controls">
    <label>
      Valley rotation: <output data-value="angle">42 deg</output>
      <input type="range" min="0" max="80" step="1" value="42" data-param="angle">
    </label>
    <label>
      Condition number: <output data-value="condition">120x</output>
      <input type="range" min="10" max="400" step="10" value="120" data-param="condition">
    </label>
    <label>
      Generations: <output data-value="generations">32</output>
      <input type="range" min="8" max="48" step="1" value="32" data-param="generations">
    </label>
    <label>
      Population: <output data-value="lambda">24</output>
      <input type="range" min="8" max="64" step="2" value="24" data-param="lambda">
    </label>
    <label>
      Seed: <output data-value="seed">7</output>
      <input type="range" min="1" max="999" step="1" value="7" data-param="seed">
    </label>
  </div>
  <div class="cma-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="CMA-ES search distribution lab comparing covariance adaptation against a spherical evolution strategy on a rotated quadratic valley"></canvas>
  <div class="cma-lab__legend">
    <span><i style="background:#0f766e"></i> CMA-ES mean, samples, covariance</span>
    <span><i style="background:#b45309"></i> Spherical evolution strategy</span>
    <span><i style="background:#2563eb"></i> True flat valley axis</span>
    <span><i style="background:#be123c"></i> Best sampled point</span>
  </div>
  <p class="cma-lab__note">
    Deterministic two-dimensional experiment. The audit checks finite positive
    covariance matrices, monotone best-so-far ledgers, default CMA advantage over
    the spherical baseline, and covariance-axis alignment across a small grid of
    rotations, condition numbers, and seeds.
  </p>
</div>

<script defer src="{{ '/assets/js/cma-coordinate-lab.js?v=20260614b' | relative_url }}"></script>

With the default settings, the lab starts both optimizers at the same point with
the same population size. The objective has a `120x` condition number and a
`42 deg` rotation. After 32 generations:

```text
CMA-ES best value:       4.15e-10
spherical ES best value: 7.81e-3
learned axis error:      0.14 degrees
learned covariance cond: 103.5x
```

The exact numbers belong to this seeded toy, not to all optimization problems.
The shape is the point. The spherical baseline can reduce its step size, but it
cannot rotate its sampling distribution. CMA-ES can keep sampling broadly along
the valley while becoming stingy across it.

Move **Valley rotation** to zero. The spherical baseline improves because the
problem is now aligned with the coordinate axes. Move **Condition number** upward.
The cost of using the wrong coordinates rises. Reduce **Generations** to 8 or
12. Adaptation is not free: the optimizer first has to spend samples learning
the metric it wishes it had started with.

The exported lab API also runs a small verification grid. For rotations
`0 deg`, `25 deg`, and `50 deg`, condition numbers `30x`, `120x`, and `300x`,
and two seeds, all 18 cases produce finite positive covariance matrices, monotone
best-so-far histories, and strong CMA improvement from the initial point.

## Ranking Is the Interface

CMA-ES does not need the actual scale of the objective in the way gradient
descent does. In its basic form, it sorts candidate points and uses the ranks.
If one sampled point is better than another, it gets more influence. If a
monotone transformation changes all objective values while preserving the order,
the ranking information is the same.

That is a quiet superpower. Simulator objectives are often arbitrary mixtures of
penalties:

$$
\text{loss} =
10^4 \cdot \text{crash}
+ 7.2 \cdot \text{energy}
+ 0.03 \cdot \text{latency}
+ \text{soft constraint}.
$$

The absolute numbers may be ugly. The ordering may still be meaningful enough
to learn from.

But rank-only information is also a limitation. If the objective is flat across
most samples and cliffs near failure, ranking can be poor evidence. If the
evaluation noise is larger than the differences between candidates, the
optimizer adapts to noise. If constraints hide all interesting feasible points,
the search distribution can confidently learn the wrong region.

Derivative-free does not mean assumption-free. It means the assumptions have
changed: sample budget, ranking reliability, variable scaling, restart policy,
and constraint handling become first-class modeling choices.

## The Covariance Is a Memory

At generation \(t\), write the search distribution as roughly

$$
x \sim m_t + \sigma_t \mathcal{N}(0, C_t).
$$

The mean \(m_t\) says where the optimizer currently believes good points live.
The scalar \(\sigma_t\) says how far it is willing to jump. The covariance
matrix \(C_t\) says which directions deserve larger or smaller mutations.

The best \(\mu\) samples form a weighted displacement:

$$
y_w =
\sum_{i=1}^{\mu} w_i
\frac{x_{i:\lambda} - m_t}{\sigma_t}.
$$

The lab updates the mean by this weighted step, accumulates an evolution path,
and updates the covariance using a rank-one path term plus a rank-\(\mu\) sample
covariance term. The production algorithm has many careful details, but the
statistical sentence is compact:

```text
directions that repeatedly contain selected points become easier to sample
```

This is why the covariance ellipse in the lab slowly turns into the valley.
Individual samples are noisy. A path of selected samples is a memory.

## Why Not Always Use It?

Because function evaluations are expensive.

On a clean convex quadratic with reliable gradients, quasi-Newton methods should
usually win. The CMA-ES documentation says this plainly: second-order
derivative-based methods are usually faster when they are successful, and CMA-ES
is aimed at harder black-box settings.[^cma-notes]

The more interesting decision is not "CMA-ES or gradient descent?" It is:

- Can I compute a trustworthy derivative?
- Is the objective smooth enough for that derivative to mean what I need?
- Is the evaluation budget closer to hundreds, thousands, or millions?
- Are variables scaled so a shared initial step size is sane?
- Do constraints, simulator failures, or noise dominate the ranking?
- Should I use restarts or a larger population for multimodal search?

Salimans, Ho, Chen, Sidor, and Sutskever revived evolution strategies in a
modern reinforcement-learning context partly because ES communicates only scalar
returns and parallelizes easily.[^salimans] That is a different regime from
small-dimensional CMA-ES, but the shared moral is useful: sometimes the expensive
thing is not taking a derivative. Sometimes it is coordinating the experiment.

## A Coordinate System You Earned

The lab's rotated bowl is deliberately too simple. It is a picture of one
mechanism, not a benchmark claim.

Still, the picture contains the lesson I want to remember. A black-box optimizer
is not blind just because it lacks gradients. It can infer geometry from
selection. It can learn that one direction is safe to explore and another is a
wall. It can carry that memory forward as a covariance matrix.

The search distribution is the optimizer's notebook.

[^hansen-tutorial]: Nikolaus Hansen, "The CMA Evolution Strategy: A Tutorial," arXiv:1604.00772, 2016; revised 2023. [arXiv](https://arxiv.org/abs/1604.00772).

[^hansen-ostermeier]: Nikolaus Hansen and Andreas Ostermeier, "Completely Derandomized Self-Adaptation in Evolution Strategies," *Evolutionary Computation* 9(2), 159-195, 2001. [PDF](https://www.cmap.polytechnique.fr/~nikolaus.hansen/cmaartic.pdf), [MIT Press](https://direct.mit.edu/evco/article/9/2/159/892/Completely-Derandomized-Self-Adaptation-in).

[^cma-notes]: The CMA-ES project page describes CMA-ES as a method for difficult nonlinear, non-convex black-box optimization and notes both the inverse-Hessian analogy and the cases where derivative-based methods are usually faster. [CMA-ES project](https://cma-es.github.io/). The bundled `c-cmaes` documentation gives similar practical guidance. [c-cmaes doc](https://github.com/CMA-ES/c-cmaes/blob/master/doc.txt).

[^nes]: Daan Wierstra, Tom Schaul, Tobias Glasmachers, Yi Sun, Jan Peters, and Juergen Schmidhuber, "Natural Evolution Strategies," *Journal of Machine Learning Research* 15, 949-980, 2014. [JMLR](https://jmlr.org/papers/v15/wierstra14a.html), [PDF](https://www.jmlr.org/papers/volume15/wierstra14a/wierstra14a.pdf).

[^salimans]: Tim Salimans, Jonathan Ho, Xi Chen, Szymon Sidor, and Ilya Sutskever, "Evolution Strategies as a Scalable Alternative to Reinforcement Learning," arXiv:1703.03864, 2017. [arXiv](https://arxiv.org/abs/1703.03864).
