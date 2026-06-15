---
layout: post
title: "Step Sizes Are Dares"
description: "A learning rate is not just speed. It is a numerical stability promise about the sharpest direction the optimizer is willing to survive."
date: 2026-06-14 13:27:00 -0400
categories: machine-learning
tags: [edge-of-stability, gradient-descent, learning-rate, sharpness, optimization, deep-learning]
excerpt: "Gradient descent has a cliff at eta times sharpness equals two. Modern neural nets often train near that cliff instead of politely staying far away from it."
---

A learning rate looks like a speed knob.

That is the first lie.

It is a stability budget.

When you choose a step size, you are making a promise about the sharpest
direction of the loss surface. If the local curvature is gentle, the same step
looks cautious. If the local curvature is large, the same step can turn from
descent into a numerical trampoline.

The old lesson is simple enough to fit on a napkin. The new lesson is stranger:
large neural networks often train near the edge where the napkin says ordinary
gradient descent should be nervous.

This post is about that edge, and about why a run can wobble there without
immediately falling off.

## The One-Mode Cliff

Start with the smallest possible loss surface:

$$
f(z)=\frac{1}{2}\lambda z^2.
$$

Gradient descent with step size $$\eta$$ gives

$$
z_{t+1}
= z_t - \eta \lambda z_t
= (1-\eta\lambda) z_t.
$$

Everything depends on the multiplier:

```text
0 < eta lambda < 1     monotone decay
1 < eta lambda < 2     sign-flipping decay
eta lambda = 2         perfect two-cycle
eta lambda > 2         sign-flipping divergence
```

For a quadratic objective, this is not metaphor. It is the exact recurrence. The
number $$2/\eta$$ is the largest curvature this scalar mode can tolerate. In
many dimensions, the same story appears along each Hessian eigenvector, with the
largest eigenvalue setting the most restrictive local stability condition.

So a fixed learning rate secretly says:

```text
I can survive curvature below 2 / eta.
```

Bottou, Curtis, and Nocedal's review of large-scale machine-learning
optimization emphasizes that ML optimization is not merely classical nonlinear
optimization at larger scale; stochastic gradients, data access, and practical
training dynamics change what methods are useful.[^bottou] Still, the scalar
quadratic remains the right little warning light. When a training run oscillates
violently, the first suspect is often not "nonconvexity." It is a step size that
has overspent its local stability budget.

## An Edge Lab

The lab below compares two systems under the same step size.

The blue panel is the frozen quadratic mode above. Its curvature is fixed. If
`eta x lambda` exceeds `2`, there is nowhere to hide.

The red panels use a tiny nonlinear model:

$$
\hat y = ab,
\qquad
L(a,b)=\frac{1}{2}(ab-y)^2.
$$

It is just a two-parameter deep linear network with one scalar training example.
The Hessian changes as the parameters move. That makes it a microscope for a
different possibility: the optimizer can change the sharpness of the place it is
standing while it trains.

At the default settings:

```text
eta = 1.01
frozen sharpness = 2.00
eta x lambda = 2.02
edge 2 / eta = 1.98
```

The frozen quadratic mode diverges. The nonlinear toy does not politely converge
to zero loss either. Instead, it falls quickly, becomes non-monotone, and settles
into a small oscillation whose tail-average sharpness is almost exactly the
`2 / eta` edge.

That is the shape to notice: short-timescale loss bumps, long-timescale
improvement, and sharpness living near the numerical stability boundary.

I audited the lab before rewriting. At the default controls, the frozen
quadratic multiplier is \(-1.02\), so the scalar mode diverges exactly as the
\(\eta\lambda>2\) rule predicts. The nonlinear toy runs all 140 steps without
diverging, has 68 upward-loss steps, ends at loss 0.0044, and averages sharpness
1.002x the \(2/\eta\) edge over its tail. A 324-case sweep over step size,
curvature, target, initialization, and step count found no phase-classification
errors in the frozen quadratic, 297 finite nonlinear runs, and 27 honest
divergences. I also fixed the lab to export its API through `module.exports`, so
the audit no longer has to reach through `globalThis`.

<style>
  .edge-lab {
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

  .edge-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .edge-lab__controls label,
  .edge-lab__metric span,
  .edge-lab__note,
  .edge-lab__legend {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .edge-lab__controls label {
    display: grid;
    font-weight: 650;
    gap: 0.35rem;
    min-width: 0;
  }

  .edge-lab__controls input {
    accent-color: #be123c;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .edge-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .edge-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .edge-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .edge-lab__metric span {
    display: block;
  }

  .edge-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .edge-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 840px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .edge-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .edge-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .edge-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .edge-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .edge-lab {
      padding: 0.82rem;
    }

    .edge-lab__controls,
    .edge-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .edge-lab canvas {
      height: 1160px;
    }
  }
</style>

<div class="edge-lab" data-edge-stability-lab>
  <div class="edge-lab__controls">
    <label>
      Step size eta <output data-value="eta">1.01</output>
      <input type="range" min="20" max="150" step="1" value="101" data-param="eta">
    </label>
    <label>
      Frozen sharpness <output data-value="curvature">2.00</output>
      <input type="range" min="50" max="350" step="5" value="200" data-param="curvature">
    </label>
    <label>
      Target y <output data-value="target">1.00</output>
      <input type="range" min="40" max="180" step="5" value="100" data-param="target">
    </label>
    <label>
      Init scale <output data-value="init">0.08</output>
      <input type="range" min="2" max="24" step="1" value="8" data-param="init">
    </label>
    <label>
      Steps <output data-value="steps">140</output>
      <input type="range" min="40" max="260" step="5" value="140" data-param="steps">
    </label>
  </div>
  <div class="edge-lab__metrics" data-edge-metrics></div>
  <canvas data-canvas width="980" height="840" aria-label="Gradient descent stability simulator showing a frozen quadratic mode, nonlinear deep linear loss, Hessian sharpness, and parameter trajectory"></canvas>
  <div class="edge-lab__legend">
    <span><i style="background:#2563eb"></i> Frozen quadratic</span>
    <span><i style="background:#be123c"></i> Nonlinear toy</span>
    <span><i style="background:#0f766e"></i> Hessian sharpness</span>
    <span><i style="background:#172026"></i> Stability edge</span>
    <span><i style="background:#7c3aed"></i> Zero-loss curve</span>
  </div>
  <p class="edge-lab__note">
    Deterministic full-batch gradient descent toy. The right-hand model is
    scalar and deep-linear, not a reproduction of a full neural network. It is a
    small dynamical system for inspecting how loss, curvature, and step size can
    interact.
  </p>
</div>
<script defer src="{{ '/assets/js/edge-stability-lab.js?v=20260614b' | relative_url }}"></script>

The source is deliberately inspectable in
[`assets/js/edge-stability-lab.js`]({{ '/assets/js/edge-stability-lab.js' | relative_url }}).
The top Hessian eigenvalue for the two-parameter toy is computed from the exact
Hessian:

$$
\nabla^2 L(a,b)
=
\begin{bmatrix}
b^2 & 2ab-y \\
2ab-y & a^2
\end{bmatrix}.
$$

At a zero-loss point with $$ab=y$$, the Hessian has eigenvalues
$$0$$ and $$a^2+b^2$$. The flat direction is the rescaling symmetry: multiply
$$a$$ by a constant and divide $$b$$ by the same constant. The sharp direction
changes the product.

Already this tiny model contains three warnings.

First, local stability is about the update map, not just the loss value. A point
can have low loss and still be numerically hostile to a large step.

Second, non-monotone loss is not automatically failure. In the default toy, many
steps increase the loss relative to the previous step, but the run has still
moved from roughly `0.49` loss to a small oscillation around `0.005`.

Third, "sharpness" is a dynamical quantity during training. It is not merely a
label stamped on the final model.

## The Neural-Net Surprise

The classical story would be:

```text
choose eta small enough that eta * lambda_max stays below 2
```

Then Cohen, Kaur, Li, Kolter, and Talwalkar measured full-batch gradient descent
on neural networks and reported something more provocative. In their edge of
stability regime, the maximum Hessian eigenvalue hovers just above
$$2/\eta$$, the training loss is non-monotone over short windows, and the loss
still decreases over longer windows.[^cohen]

This was not supposed to be the polite behavior. A textbook local quadratic
approximation would suggest that once the sharpest direction crosses the edge,
gradient descent should become unstable. But real neural training is not a
frozen quadratic. The parameters move. The Hessian changes. The objective has
many nearly flat and scale-sensitive directions. The optimizer can step into a
region, kick itself away, reduce sharpness, and continue.

Lewkowycz, Bahri, Dyer, Sohl-Dickstein, and Gur-Ari studied a related large
learning-rate regime they called the catapult mechanism. Their solvable models
and experiments show a phase transition between small and large learning rates;
in the large-rate phase, training can initially increase loss yet still converge
and can favor flatter minima.[^catapult]

So the learning rate is doing more than setting speed. It is changing the kind
of training dynamics available.

Small step:

```text
follow the local slope, stay inside the local quadratic story
```

Large step:

```text
interact with curvature, bounce across sharp directions,
possibly select a different region of parameter space
```

The second behavior is risky. It is also part of why learning-rate schedules,
warmup, batch size, normalization, architecture, and optimizer choice can change
the result even when the model class and data are fixed.

## The Edge Is Not a Generalization Certificate

It is tempting to say:

```text
large learning rate -> flatter minimum -> better model
```

Sometimes that is directionally useful. As a universal law, it is too neat.

Sharpness is not an invariant property of a represented function. Dinh, Pascanu,
S. Bengio, and Y. Bengio showed that in networks with rectifier symmetries, one
can construct equivalent models with arbitrarily different apparent sharpness;
more broadly, reparameterization can change the geometry of parameters without
changing the function.[^dinh]

That warning does not make Hessian measurements useless. It changes what they
mean.

Sharpness during training is a statement about the local update dynamics of the
parameterization you actually trained. It can explain why a step size oscillates
or fails. It can diagnose when a schedule is driving the optimizer near a
stability boundary. It can compare two runs when the parameterization and
measurement protocol are controlled.

It is not, by itself, a moral ranking of models.

## What to Log When Training Gets Weird

When a training run suddenly becomes jagged, I would rather see a stability
ledger than another screenshot of the loss curve.

Log:

- the learning-rate schedule actually applied after warmup, decay, and optimizer
  scaling;
- the short-window loss increases, not only the smoothed dashboard line;
- the gradient norm and update norm;
- an estimate of the top Hessian eigenvalue or a cheaper curvature proxy;
- the product $$\eta \lambda_\max$$ when that estimate is available;
- whether the same behavior appears with full-batch, large-batch, and noisy
  minibatch updates;
- whether normalization layers, weight decay, clipping, or adaptive
  preconditioning changed the effective coordinate system.

The point is not to worship $$2/\eta$$. The point is to notice that the loss
curve alone hides the numerical mechanism. A run can look noisy because the data
are noisy, because the optimizer is bouncing off a sharp direction, because
momentum is storing old gradients, or because an adaptive method changed units.
Those are different failures and different opportunities.

## The Step Is Part of the Model

A trained model is not only architecture plus data.

It is also the trajectory that found the weights.

The step size decides which local quadratic approximations are trusted, which
sharp regions are rejected, which oscillations are tolerated, and which parts of
the loss surface become reachable. A small learning rate makes training look
like careful descent. A large learning rate makes training look more like a
dynamical system negotiating with its own curvature.

The old quadratic lesson remains true:

```text
eta times sharpness near two is the cliff
```

The newer neural-net lesson is that the cliff is not always a wall. Sometimes it
is a coastline. Training can run along it, wobble, shed sharpness, and keep
making progress.

That does not make large learning rates safe. It makes them interesting. They
are not merely asking "how fast can I go?"

They are asking:

```text
what geometry am I willing to survive?
```

[^bottou]: Leon Bottou, Frank E. Curtis, and Jorge Nocedal, ["Optimization Methods for Large-Scale Machine Learning"](https://arxiv.org/abs/1606.04838), *SIAM Review*, 2018.

[^cohen]: Jeremy M. Cohen, Simran Kaur, Yuanzhi Li, J. Zico Kolter, and Ameet Talwalkar, ["Gradient Descent on Neural Networks Typically Occurs at the Edge of Stability"](https://arxiv.org/abs/2103.00065), ICLR 2021.

[^catapult]: Aitor Lewkowycz, Yasaman Bahri, Ethan Dyer, Jascha Sohl-Dickstein, and Guy Gur-Ari, ["The large learning rate phase of deep learning: the catapult mechanism"](https://arxiv.org/abs/2003.02218), 2020.

[^dinh]: Laurent Dinh, Razvan Pascanu, Samy Bengio, and Yoshua Bengio, ["Sharp Minima Can Generalize For Deep Nets"](https://arxiv.org/abs/1703.04933), ICML 2017.
