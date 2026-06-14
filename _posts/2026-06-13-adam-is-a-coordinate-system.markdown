---
layout: post
title: "Adam's Coordinate Trick"
description: "Adam is not just SGD with momentum. It keeps a per-coordinate memory of gradient scale, then changes the units of the update."
date: 2026-06-13 21:23:00 -0400
categories: machine-learning
tags: [adam, adamw, optimization, adaptive-optimizers, sgd, deep-learning]
excerpt: "Adaptive optimizers are easiest to understand as coordinate systems. They can make ill-scaled problems move, but they also change what regularization and convergence mean."
---

Adam is often introduced as the optimizer you try when SGD feels fussy.

That description is useful in the same way "use a car when walking is slow" is
useful. It tells you something about convenience and almost nothing about the
machine.

Adam is not merely SGD with momentum and a nicer default learning rate.

Adam changes the coordinate system of the update.

That is why it can be wonderful on sparse, noisy, badly scaled problems. It is
also why it can behave differently from SGD even when both reduce the training
loss. The optimizer is not just deciding how far to move. It is deciding what a
unit of movement means in each coordinate.

## The Diagonal Memory

Stochastic gradient descent keeps a single global learning rate:

$$
\theta_{t+1} = \theta_t - \alpha g_t.
$$

Momentum adds a smoothed first moment. Adam adds two memories:

$$
m_t = \beta_1 m_{t-1} + (1-\beta_1)g_t,
$$

$$
v_t = \beta_2 v_{t-1} + (1-\beta_2)g_t^2.
$$

After bias correction, Adam updates each coordinate roughly as

$$
\theta_{t+1}
=
\theta_t
-
\alpha
\frac{\hat m_t}{\sqrt{\hat v_t}+\epsilon}.
$$

The denominator is the important object. If a coordinate has historically large
gradients, Adam shrinks its effective step. If a coordinate has small or rare
gradients, Adam gives it a larger effective step.

AdaGrad made this geometry explicit earlier: accumulate squared gradients and
use them to adapt the per-coordinate step size.[^adagrad] Kingma and Ba's Adam
combined adaptive second moments with momentum-like first moments, bias
correction, and an exponentially decaying memory.[^adam]

The slogan I trust is:

```text
Adam divides by a running estimate of the coordinate's gradient unit.
```

That is a coordinate system.

## A Two-Coordinate Lab

The lab below minimizes a toy quadratic:

$$
f(x,y)=\frac{1}{2}(r x^2 + y^2).
$$

The $$x$$ direction is sharp. The $$y$$ direction is flat. The curvature ratio
$$r$$ is the condition number of this little diagonal problem.

SGD uses a stable learning rate capped by the sharp coordinate:

$$
\alpha_{\text{SGD}} = \frac{\alpha}{r}.
$$

That makes the sharp coordinate safe, but it makes the flat coordinate crawl.
Adam uses the same base step $$\alpha$$, but divides each coordinate by its
running second moment. On this diagonal toy, that is almost exactly the missing
unit conversion.

<style>
  .adam-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .adam-lab__controls {
    display: grid;
    gap: 0.9rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(178px, 1fr));
  }

  .adam-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .adam-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .adam-lab__controls input {
    accent-color: #2563eb;
    width: 100%;
  }

  .adam-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .adam-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .adam-lab__metric span,
  .adam-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .adam-lab__metric span {
    display: block;
  }

  .adam-lab__metric strong {
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .adam-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .adam-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="adam-units-lab" class="adam-lab" data-adam-lab>
  <div class="adam-lab__controls">
    <label>
      Curvature ratio: <output data-value="ratio">80</output>
      <input type="range" min="5" max="300" step="5" value="80" data-param="ratio">
    </label>
    <label>
      Base step alpha: <output data-value="alpha">0.04</output>
      <input type="range" min="1" max="12" step="1" value="4" data-param="alpha">
    </label>
    <label>
      Steps: <output data-value="steps">240</output>
      <input type="range" min="60" max="520" step="20" value="240" data-param="steps">
    </label>
    <label>
      Adam beta2: <output data-value="beta2">0.95</output>
      <input type="range" min="80" max="99" step="1" value="95" data-param="beta2">
    </label>
    <label>
      Weight decay: <output data-value="decay">0.02</output>
      <input type="range" min="0" max="12" step="1" value="2" data-param="decay">
    </label>
    <label>
      Gradient noise: <output data-value="noise">0%</output>
      <input type="range" min="0" max="50" step="5" value="0" data-param="noise">
    </label>
  </div>
  <div class="adam-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Adam optimizer simulator comparing SGD, Adam, and AdamW on a two-coordinate ill-conditioned quadratic"></canvas>
  <p class="adam-lab__note">
    Deterministic two-coordinate optimizer toy. SGD uses a stable step
    alpha/ratio. Adam and AdamW use the same base alpha with beta1 fixed at
    0.9. The point is the geometry of the update, not a deep-network benchmark.
  </p>
</div>
<script defer src="{{ '/assets/js/adam-units-lab.js?v=20260613a' | relative_url }}"></script>

At the default setting, the curvature ratio is 80. The stable SGD step is
therefore only 0.0005. After 240 steps, SGD has killed the sharp coordinate, but
the flat coordinate is still about 0.885 away from the optimum.

Adam's effective learning rate in the flat coordinate is about 78x larger than
its effective learning rate in the sharp coordinate. It is not guessing a magic
global step size. It is using the gradient history to define local units.

Raise **Curvature ratio**. SGD slows down in the flat direction because its
single stable step is chained to the sharp direction. Adam increases the unit
ratio because the sharp coordinate has much larger second moments.

Raise **Base step alpha**. Adam can overshoot too. Adaptive scaling is not a
license to ignore the learning rate; it changes which learning rate mistakes are
likely.

Raise **Adam beta2**. The second-moment estimate changes more slowly. A large
$$\beta_2$$ can make the unit system smoother, but less responsive to a changing
gradient scale.

Raise **Gradient noise**. The denominator starts measuring noise as well as
curvature. That is often useful, but it is also the beginning of a different
implicit bias: coordinates with noisy gradients get smaller steps.

## AdamW Is About What Gets Divided

The lab also compares Adam with coupled $$L_2$$ regularization to AdamW.

In plain SGD, adding $$L_2$$ regularization to the gradient and applying weight
decay are essentially the same operation up to the learning rate. In an adaptive
method, they are not.

If Adam receives the regularized gradient

$$
g_t + \lambda \theta_t,
$$

then the regularization term is also divided by

$$
\sqrt{\hat v_t}+\epsilon.
$$

That means the shrinkage is coordinate-dependent. A coordinate with a large
second moment gets less effective decay; a coordinate with a small second moment
gets more. The lab's "L2 decay skew" metric is the ratio of those denominators.
At the default setting it is about 78x.

AdamW, proposed by Loshchilov and Hutter, decouples weight decay from the
adaptive gradient step.[^adamw] Instead of hiding decay inside the gradient that
Adam divides by $$\sqrt{\hat v_t}$$, it applies a direct multiplicative shrink:

$$
\theta \leftarrow (1-\alpha \lambda)\theta
$$

and then takes the adaptive gradient step.

This is a small code change with a large semantic difference:

```text
coupled L2: regularization is measured in Adam's adaptive coordinates
AdamW: weight decay is measured in parameter coordinates
```

The question is not which one is universally correct. The question is which
operation you meant.

## The Convergence Warning

Adam works so often that it is easy to forget it has theory scars.

Reddi, Kale, and Kumar showed that Adam can fail to converge even in simple
convex settings, and proposed AMSGrad as one repair using a long-term maximum of
the second-moment accumulator.[^reddi] The lesson is not that everyone should
replace Adam with AMSGrad in every model. The lesson is that the denominator is
part of the algorithm's memory, and memory can create failure modes.

Wilson, Roelofs, Stern, Srebro, and Recht later argued that adaptive methods can
find different solutions from SGD and sometimes generalize worse, even when
training loss improves faster.[^wilson] Again, the point is not "Adam bad, SGD
good." The point is that an optimizer is an inductive bias. It changes the path
and sometimes the destination.

Once you see Adam as a coordinate system, these warnings feel less mysterious.
Changing coordinates can make an optimization problem easier. It can also change
which solution looks nearby.

## The Engineering Checklist

When Adam is the default, I would still ask:

1. Are gradients sparse or badly scaled, or are we using Adam only because it is
   familiar?
2. Does the task benefit from fast optimization, or does final generalization
   matter more than early training loss?
3. Is weight decay implemented as coupled $$L_2$$, AdamW-style decoupled decay,
   or something else?
4. Are learning rate, $$\beta_2$$, and epsilon logged with the same seriousness
   as model architecture?
5. Do the coordinates with large second moments correspond to noise, curvature,
   rare features, or genuinely important directions?
6. Does the SGD or momentum baseline get a fair schedule, warmup, and decay
   search?

Adam is a brilliant piece of engineering because it lets many models start
moving before we understand their geometry.

But that convenience should not hide the mechanism.

The optimizer is choosing units.

[^adagrad]: John Duchi, Elad Hazan, and Yoram Singer, ["Adaptive Subgradient Methods for Online Learning and Stochastic Optimization"](https://www.jmlr.org/papers/v12/duchi11a.html), *Journal of Machine Learning Research*, 2011.

[^adam]: Diederik P. Kingma and Jimmy Ba, ["Adam: A Method for Stochastic Optimization"](https://arxiv.org/abs/1412.6980), ICLR 2015.

[^reddi]: Sashank J. Reddi, Satyen Kale, and Sanjiv Kumar, ["On the Convergence of Adam and Beyond"](https://openreview.net/forum?id=ryQu7f-RZ), ICLR 2018.

[^adamw]: Ilya Loshchilov and Frank Hutter, ["Decoupled Weight Decay Regularization"](https://openreview.net/forum?id=Bkg6RiCqY7), ICLR 2019.

[^wilson]: Ashia C. Wilson, Rebecca Roelofs, Mitchell Stern, Nathan Srebro, and Benjamin Recht, ["The Marginal Value of Adaptive Gradient Methods in Machine Learning"](https://arxiv.org/abs/1705.08292), NeurIPS 2017.
