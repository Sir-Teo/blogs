---
layout: post
title: "Sinkhorn Turns Matching Soft"
description: "Entropic optimal transport turns a hard matching problem into matrix scaling. Sinkhorn's algorithm is just row and column normalization, but the fixed point is a transport plan."
date: 2026-06-14 10:03:00 -0400
categories: machine-learning
tags: [optimal-transport, sinkhorn, matrix-scaling, wasserstein, numerical-methods]
excerpt: "Sinkhorn scaling looks too simple to be optimal transport: normalize rows, normalize columns, repeat. The trick is that entropy has changed the geometry of the matching problem."
---

Some algorithms are suspicious because they are complicated.

Sinkhorn's algorithm is suspicious because it is not.

Start with a positive matrix. Normalize every row to the supply you want.
Normalize every column to the demand you want. Repeat. The entries settle into a
matrix whose rows and columns have the prescribed sums.

That sounds like accounting. It is also, under the right exponential matrix, a
solver for a regularized optimal transport problem.

This is the kind of trick that deserves to be seen slowly.

## The Plan, Not the Map

Optimal transport begins with two distributions and a cost of moving mass from
one support point to another. In the discrete case, there is a source histogram
$$a$$, a target histogram $$b$$, and a cost matrix $$C$$. A transport plan
$$P$$ says how much mass moves from source $$i$$ to target $$j$$.

The plan must satisfy the marginal constraints:

$$
\sum_j P_{ij}=a_i,
\qquad
\sum_i P_{ij}=b_j.
$$

Among all such couplings, classical Kantorovich optimal transport minimizes

$$
\langle P,C\rangle=\sum_{ij} P_{ij}C_{ij}.
$$

This is already an important change from the naive phrase "match each point to
one point." A coupling is not necessarily a permutation. If weights differ, one
source may split across targets. If the supports are empirical samples, the
transport plan is a joint distribution with fixed marginals.

Peyre and Cuturi describe optimal transport as a geometric way to compare
probability distributions: choose the cheapest global reshaping, measured by
local movement cost.[^computational] Villani's book gives the broader
mathematical landscape.[^villani] For data work, though, the beautiful linear
program has an annoying practical habit: exact solvers can become expensive
once the supports grow.

Cuturi's 2013 move was to pay for entropy.[^cuturi]

Instead of minimizing only cost, solve

$$
\min_{P \ge 0}
\langle P,C\rangle
+ \varepsilon \sum_{ij} P_{ij}(\log P_{ij}-1)
$$

subject to the same row and column sums.

The parameter $$\varepsilon$$ is the softness. Small $$\varepsilon$$ wants a
sharp, low-cost plan. Large $$\varepsilon$$ tolerates more diffuse transport.
The entropy term makes the problem smooth and changes the solution into a
scaled Gibbs kernel:

$$
P^\star = \operatorname{diag}(u)\,K\,\operatorname{diag}(v),
\qquad
K_{ij}=\exp(-C_{ij}/\varepsilon).
$$

Now the job is not to search all plans directly. The job is to find two positive
scaling vectors $$u$$ and $$v$$ so that this matrix has the right marginals.

That is why row and column normalization suddenly matters.

## The Old Engine

Sinkhorn and Knopp studied when alternating row and column scaling of a
nonnegative matrix converges to a doubly stochastic limit.[^sinkhorn] In the
strictly positive case used by entropic transport, the practical loop is almost
embarrassingly short:

```text
u <- a / (K v)
v <- b / (K^T u)
```

Repeat until the rows of $$\operatorname{diag}(u)K\operatorname{diag}(v)$$ sum
to $$a$$ and the columns sum to $$b$$.

There is something pleasingly physical about it. The kernel $$K$$ says which
routes are naturally cheap. The row updates enforce supply. The column updates
enforce demand. The scalings tug against one another until cost preference and
marginal feasibility are both satisfied.

The lab below is a small deterministic transport problem. The source points are
green circles. The target points are purple squares. Circle and square sizes
are probability masses. Lines show the strongest entries of the current
coupling.

The coupling matrix is the plan itself. Rows are sources, columns are targets.
The trace shows the marginal error during alternating normalization. The epsilon
curve shows the tradeoff: lower cost usually means fewer effective links.

<style>
  .sinkhorn-lab {
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

  .sinkhorn-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .sinkhorn-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .sinkhorn-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .sinkhorn-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .sinkhorn-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .sinkhorn-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .sinkhorn-lab__metric span,
  .sinkhorn-lab__legend,
  .sinkhorn-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .sinkhorn-lab__metric span {
    display: block;
  }

  .sinkhorn-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .sinkhorn-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 660px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .sinkhorn-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .sinkhorn-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .sinkhorn-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .sinkhorn-lab__note {
    margin: 0.75rem 0 0;
  }

  @media (max-width: 620px) {
    .sinkhorn-lab {
      padding: 0.75rem;
    }

    .sinkhorn-lab__controls {
      grid-template-columns: 1fr;
    }

    .sinkhorn-lab canvas {
      height: 980px;
    }
  }
</style>

<div class="sinkhorn-lab" data-sinkhorn-transport-lab>
  <div class="sinkhorn-lab__controls">
    <label>
      Epsilon <output data-value="epsilon">0.24</output>
      <input type="range" min="12" max="120" step="1" value="24" data-param="epsilon">
    </label>
    <label>
      Scaling iterations <output data-value="iterations">90</output>
      <input type="range" min="4" max="220" step="2" value="90" data-param="iterations">
    </label>
    <label>
      Support points <output data-value="points">14</output>
      <input type="range" min="6" max="28" step="1" value="14" data-param="points">
    </label>
    <label>
      Mass skew <output data-value="skew">35%</output>
      <input type="range" min="0" max="90" step="1" value="35" data-param="skew">
    </label>
    <label>
      Target warp <output data-value="shift">42%</output>
      <input type="range" min="0" max="100" step="1" value="42" data-param="shift">
    </label>
    <label>
      Seed <output data-value="seed">31</output>
      <input type="range" min="1" max="999" step="1" value="31" data-param="seed">
    </label>
  </div>
  <div class="sinkhorn-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Entropic optimal transport Sinkhorn scaling lab"></canvas>
  <div class="sinkhorn-lab__legend">
    <span><i style="background:#0f766e"></i> Source mass</span>
    <span><i style="background:#7c3aed"></i> Target mass</span>
    <span><i style="background:#2563eb"></i> Transport links</span>
    <span><i style="background:#b45309"></i> Coupling mass</span>
  </div>
  <p class="sinkhorn-lab__note">
    Deterministic synthetic experiment. The plan is
    diag(u) exp(-C / epsilon) diag(v), with u and v found by alternating
    row and column scaling.
  </p>
</div>
<script defer src="{{ '/assets/js/sinkhorn-transport-lab.js?v=20260614a' | relative_url }}"></script>

Try three moves.

First, lower **epsilon**. The transport lines become more selective. The
coupling matrix gets hotter along a smaller set of cells. Cost falls, row focus
rises, and the effective number of links shrinks. The plan is becoming closer
to a hard matching, but it is still a coupling: if the masses demand splitting,
mass splits.

Second, raise **epsilon**. The plan becomes blurrier. More routes receive
nontrivial probability. Cost rises because entropy is being purchased with
longer moves. This is not a bug. It is the regularization term doing exactly
what it was asked to do.

Third, drag **scaling iterations** down. The plan still reflects the kernel, but
the marginal L1 error grows. This is the part that makes Sinkhorn useful as a
numerical method rather than just a formula: the stopping rule controls how much
constraint violation you tolerate.

The most important invariant is boring and unforgiving. A transport plan is not
valid because the lines look plausible. It is valid because every row and every
column has the right sum.

## The Bias Entropy Buys

Entropic OT is not exact OT. It is a different problem.

That distinction is easy to lose because the regularized answer often behaves
like a fast, smooth approximation to the unregularized transport distance. But
the entropy term has real consequences:

1. It spreads mass across multiple routes.
2. It makes the objective strongly smoother.
3. It turns the solution into a differentiable object useful inside larger
   machine-learning pipelines.
4. It introduces bias relative to the unregularized cost.

The bias is not merely philosophical. In the lab, as epsilon grows, the plan
chooses more links and pays higher movement cost. If you were comparing two
distributions, this blur would change the measured discrepancy.

Modern OT practice therefore often treats epsilon as a numerical and statistical
knob, not a universal constant. Too small and the kernel becomes ill-conditioned
or slow. Too large and the geometry washes out. The sweet spot depends on the
scale of the cost matrix, the support size, the desired accuracy, and the role
of the transport loss in the surrounding system.

This is one reason the computational OT literature distinguishes several
objects that sound similar in casual conversation: regularized OT cost,
Sinkhorn distance, debiased Sinkhorn divergence, and exact Wasserstein distance.
They are related, but not interchangeable.

## Why This Became a Machine-Learning Tool

The appeal is not only speed. It is differentiability.

Once the transport plan is computed by smooth matrix operations, a model can be
trained through it. That made entropic OT useful in settings where one wants a
loss between distributions but cannot sort examples into independent labels:
domain adaptation, generative modeling, representation alignment, color
transfer, shape processing, and many other problems surveyed by Peyre and
Cuturi.[^computational]

The coupling viewpoint is especially useful when the data are sets rather than
vectors. A set of embeddings, a set of pixels, a set of particles, a bag of
features: these are not naturally compared coordinate by coordinate. OT asks a
more geometric question:

```text
What joint distribution between the two sets would make them look most alike,
given the cost of pairing each element?
```

Entropy then softens the answer enough that it can be computed at scale and
optimized through.

That softness is not an implementation detail. It changes what the model is
being rewarded for.

## What to Remember

The mnemonic version is:

```text
cost builds the kernel
entropy makes the plan soft
row scaling enforces supply
column scaling enforces demand
```

The non-mnemonic version is better:

Sinkhorn is not a heuristic for making a matrix pretty. It is coordinate ascent
in the dual of entropic optimal transport, written in the humble language of
matrix scaling. The row and column sums are the constraints. The exponential
cost kernel is the geometry. The entropy is the price paid for smoothness.

When it works, it feels like cheating. The global plan appears from repeated
local normalizations.

But the trick has a contract. The plan is only meaningful after the marginals
are close enough, the epsilon scale matches the cost scale, and the blur is an
acceptable bias for the question you are asking.

Soft matching is still matching. It just admits, correctly, that sometimes one
unit of mass needs more than one destination.

[^computational]: Gabriel Peyre and Marco Cuturi, ["Computational Optimal Transport"](https://arxiv.org/abs/1803.00567), *Foundations and Trends in Machine Learning*, 2019.

[^villani]: Cedric Villani, *Optimal Transport: Old and New*, Springer, 2009.

[^cuturi]: Marco Cuturi, ["Sinkhorn Distances: Lightspeed Computation of Optimal Transportation Distances"](https://arxiv.org/abs/1306.0895), NeurIPS 2013.

[^sinkhorn]: Richard Sinkhorn and Paul Knopp, ["Concerning Nonnegative Matrices and Doubly Stochastic Matrices"](https://msp.org/pjm/1967/21-2/pjm-v21-n2-p14-s.pdf), *Pacific Journal of Mathematics*, 1967.
