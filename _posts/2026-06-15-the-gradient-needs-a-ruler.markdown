---
layout: post
title: "The Gradient Needs a Ruler"
description: "A gradient is not a direction until a geometry says what a unit step means. On the probability simplex, the wrong ruler can turn a distribution fit into a boundary collision."
date: 2026-06-15 12:36:00 -0400
categories: machine-learning
tags: [natural-gradient, mirror-descent, information-geometry, optimization, simplex, fisher-information, categorical-models]
excerpt: "The same cross-entropy objective behaves differently under Euclidean projection, logits, and the Fisher metric. The gradient did not change. The ruler did."
---

A gradient is a covector with an opinion.

It says which way a function increases when you nudge the coordinates. It does
not, by itself, say what a unit nudge should cost. That missing choice is
usually hidden because Euclidean space is the default wallpaper: square the
coordinate changes, add them, call that distance.

That is fine until the coordinates are probabilities.

A probability vector does not live in a spreadsheet cell with no consequences.
It lives on a simplex:

$$
\Delta^{k-1} = \left\{p_i \ge 0,\ \sum_i p_i = 1\right\}.
$$

The boundary is not a cosmetic edge. Setting $$p_i = 0$$ says an event is
impossible. If the target distribution assigns that event positive mass, the
log loss is infinite.

The ruler matters.

## A Small Distribution Fit

Suppose the target categorical distribution is $$q$$ and the model distribution
is $$p$$. The loss is cross-entropy:

$$
L(p) = -\sum_i q_i \log p_i
     = H(q) + D_{\mathrm{KL}}(q\|p).
$$

The minimizer is obviously $$p=q$$. That is not the interesting part. The
interesting part is how an optimizer moves before it gets there.

In probability coordinates, the ordinary Euclidean gradient is

$$
\nabla_i L(p) = -\frac{q_i}{p_i}.
$$

A projected-gradient update writes

$$
p^+ = \Pi_{\Delta}\left(p - \eta \nabla L(p)\right),
$$

where $$\Pi_{\Delta}$$ is Euclidean projection back onto the simplex.

This sounds reasonable. It is also a strange local model. A unit of probability
mass removed from a rare event is not statistically equivalent to a unit removed
from a common event. Near the boundary, Euclidean distance is still calm while
log loss is screaming.

The Fisher geometry uses a different local squared length for tangent vectors
$$u$$:

$$
\|u\|_p^2 = \sum_i \frac{u_i^2}{p_i},
\qquad \sum_i u_i = 0.
$$

Under this metric, the natural gradient of the same loss is

$$
\widetilde{\nabla} L(p) = p - q.
$$

So the natural-gradient descent step is just

$$
p^+ = p - \eta(p-q) = (1-\eta)p + \eta q.
$$

For this toy problem, the geometry has made the right local motion almost
embarrassingly visible: move probability mass toward the target while staying
inside the simplex.

That does not mean every natural-gradient problem is easy. It means this one is
a clean microscope.

## The Lab

The lab fits a seven-token categorical distribution. Tokens 5, 6, and 7 are the
rare tail. The target tail mass defaults to 8%, while the starting model puts
30% of its mass in the tail.

Three optimizers see the same objective:

- **Euclidean PGD** takes the raw probability-coordinate gradient and projects
  back to the simplex.
- **Natural step** uses the Fisher metric on the simplex.
- **Logit SGD** optimizes unconstrained logits $$z$$ with $$p=\mathrm{softmax}(z)$$.

Logit SGD is included because this is what neural networks usually do. It keeps
probabilities positive by construction, but it is still a choice of
parameterization and step geometry, not a law of nature.

<style>
  .natural-gradient-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .natural-gradient-lab__controls {
    display: grid;
    gap: 0.9rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
  }

  .natural-gradient-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .natural-gradient-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .natural-gradient-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .natural-gradient-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .natural-gradient-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.2rem;
    padding: 0.62rem 0.7rem;
  }

  .natural-gradient-lab__metric span,
  .natural-gradient-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .natural-gradient-lab__metric span {
    display: block;
  }

  .natural-gradient-lab__metric strong {
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .natural-gradient-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .natural-gradient-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="natural-gradient-lab" class="natural-gradient-lab" data-natural-gradient-lab>
  <div class="natural-gradient-lab__controls">
    <label>
      Step size: <output data-value="eta">0.12</output>
      <input type="range" min="2" max="40" step="1" value="12" data-param="eta">
    </label>
    <label>
      Target tail mass: <output data-value="targetTail">8%</output>
      <input type="range" min="1" max="30" step="1" value="8" data-param="targetTail">
    </label>
    <label>
      Starting tail mass: <output data-value="startTail">30%</output>
      <input type="range" min="1" max="60" step="1" value="30" data-param="startTail">
    </label>
    <label>
      Iterations: <output data-value="steps">24</output>
      <input type="range" min="1" max="60" step="1" value="24" data-param="steps">
    </label>
  </div>
  <div class="natural-gradient-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Natural gradient simplex simulator comparing Euclidean projected gradient, natural gradient, and logit SGD"></canvas>
  <p class="natural-gradient-lab__note">
    The simplex panel groups token 1, tokens 2-4, and tokens 5-7. The loss panel
    draws KL with a tiny floor only for visualization; if Euclidean PGD assigns
    zero probability to a positive-mass target event, the reported KL is
    infinite. The audit counter is produced by the same JavaScript file.
  </p>
</div>
<script defer src="{{ '/assets/js/natural-gradient-lab.js?v=20260615a' | relative_url }}"></script>

At the default setting, Euclidean projected gradient reaches the boundary and
sets six token probabilities to zero. Because the target distribution has
positive mass on those tokens, its true $$D_{\mathrm{KL}}(q\|p)$$ is infinite.
The chart still draws a floored value so the failure remains visible instead of
turning the plot into a blank wall.

The natural step ends with KL about `0.00139` after 24 iterations. Its final
tail mass is about 9.0%, close to the 8% target. Logit SGD keeps all bins alive,
but at the same step size it is much slower in this particular coordinate
system, ending around KL `0.144`.

The point is not that the green line wins every optimization problem. It does
not. The point is that the phrase "the gradient direction" is incomplete until
the geometry has been named.

## The Algebra Hiding in the Picture

For a differentiable function on ordinary Euclidean space, the steepest descent
direction is the vector $$g$$ satisfying

$$
\langle g, u\rangle = dL[u]
$$

for every local displacement $$u$$. We quietly use the Euclidean inner product
to identify derivatives with vectors.

On the simplex with Fisher metric,

$$
\langle a, u\rangle_p = \sum_i \frac{a_i u_i}{p_i},
$$

and every valid tangent vector obeys $$\sum_i u_i=0$$.

For cross-entropy,

$$
dL[u] = -\sum_i \frac{q_i}{p_i} u_i.
$$

The vector $$a=p-q$$ satisfies

$$
\sum_i \frac{(p_i-q_i)u_i}{p_i}
= \sum_i u_i - \sum_i \frac{q_i}{p_i}u_i
= -\sum_i \frac{q_i}{p_i}u_i,
$$

because tangent vectors have zero sum. Therefore $$p-q$$ is the natural
gradient, and the descent direction is $$q-p$$.

This is the same loss, the same current point, and the same target. Only the
local ruler changed.

## Why This Shows Up in Real Models

Modern neural networks usually avoid optimizing probability vectors directly.
They emit logits, then softmax turns those logits into probabilities. For a
categorical cross-entropy loss, the gradient with respect to logits is

$$
p - q.
$$

That familiar expression is one reason softmax classifiers feel numerically
well-behaved compared with direct probability-coordinate optimization. The
constraint is built into the parameterization, and the update cannot literally
assign a positive target event probability zero after a finite logit step.

Natural-gradient methods take a broader view: the metric should reflect how a
small parameter change changes the distribution, not merely how large the
coordinate vector looks. Amari's natural gradient uses the Fisher information
matrix for that purpose.[^amari]

Mirror descent attacks the same discomfort from another direction. Instead of
measuring the prox step with Euclidean squared distance, it uses a distance-like
function matched to the domain. Beck and Teboulle present mirror descent as a
nonlinear projected-subgradient method, and the classic exponentiated-gradient
family of Kivinen and Warmuth is a central example of multiplicative rather
than additive motion.[^beck][^kivinen]

Later work makes the bridge explicit: Raskutti and Mukherjee prove an
equivalence between mirror descent with Bregman divergences and natural
gradient descent on the corresponding dual Riemannian manifold.[^raskutti]

That sentence sounds grand, but the lab above is the little version. The
simplex has a geometry. KL is not Euclidean distance. A zero probability is not
"just another point."

## The Audit

The code exports `runAudit()`. It checks:

- Euclidean simplex projection against a known case;
- softmax normalization;
- target and initial distributions across several parameter settings;
- every simulated row for nonnegative probabilities summing to one;
- finite clipped losses for every plotted row;
- monotone improvement for the natural step in the tested cases;
- support preservation for logit SGD;
- the closed-form natural-gradient identity
  $$p_t-q=(1-\eta)^t(p_0-q)$$;
- the default boundary failure of Euclidean PGD.

The default audit currently reports `502/502`. That is not a theorem about
every optimizer. It is a guardrail around this particular interactive
experiment.

## The Sentence to Keep

The gradient tells you how the loss changes. The geometry tells you what it
means to move.

When the parameters are probabilities, that distinction is not philosophical.
It is the difference between approaching a distribution and declaring most of
its events impossible.

## Primary Sources

[^amari]: Shun-ichi Amari, ["Natural Gradient Works Efficiently in Learning"](https://direct.mit.edu/neco/article/10/2/251/6143/Natural-Gradient-Works-Efficiently-in-Learning), *Neural Computation*, 10(2), 1998. DOI: [10.1162/089976698300017746](https://doi.org/10.1162/089976698300017746).

[^beck]: Amir Beck and Marc Teboulle, ["Mirror Descent and Nonlinear Projected Subgradient Methods for Convex Optimization"](https://www.tau.ac.il/~becka/3.pdf), *Operations Research Letters*, 31(3), 2003. DOI: [10.1016/S0167-6377(02)00231-6](https://doi.org/10.1016/S0167-6377(02)00231-6).

[^kivinen]: Jyrki Kivinen and Manfred K. Warmuth, ["Exponentiated Gradient versus Gradient Descent for Linear Predictors"](https://mwarmuth.bitbucket.io/pubs/J36.pdf), *Information and Computation*, 132(1), 1997. DOI: [10.1006/inco.1996.2612](https://doi.org/10.1006/inco.1996.2612).

[^raskutti]: Garvesh Raskutti and Sayan Mukherjee, ["The Information Geometry of Mirror Descent"](https://arxiv.org/abs/1310.7780), *IEEE Transactions on Information Theory*, 61(3), 2015. PDF: [author copy](https://pages.cs.wisc.edu/~raskutti/publication/MirrorDescent.pdf).
