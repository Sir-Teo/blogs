---
layout: post
title: "Your Example Brought Its Neighbors"
description: "Batch normalization is stateful and contextual: in training mode each activation is normalized by the mini-batch around it, then eval mode switches to running statistics."
date: 2026-06-14 13:36:00 -0400
categories: machine-learning
tags: [batch-normalization, normalization, deep-learning, optimization, train-eval-mismatch, ml-systems]
excerpt: "BatchNorm can make optimization easier, but the same example can produce a different activation depending on who sits beside it and which mode the layer is in."
---

Here is a sentence that sounds wrong until you have debugged it at 1 a.m.:

```text
the model's output depends on the other examples in the batch
```

For an ordinary feed-forward network, you would start looking for a shape bug,
a stale tensor, or a data loader doing something it never admitted to doing.

For batch normalization in training mode, it is the definition.

BatchNorm became ordinary by being useful. It made networks easier to train,
supported larger learning rates, softened initialization sensitivity, and often
acted like a regularizer. Now it can vanish into a model summary as a small line
between a convolution and a nonlinearity.

But a BatchNorm layer has two lives and a memory.

In training mode, it uses the current mini-batch. In evaluation mode, it uses
running statistics accumulated during training. Those are not the same
computation. Usually the difference is harmless or helpful. Sometimes it is the
entire incident report.

## Layer Asks the Room

For one activation channel, BatchNorm takes a mini-batch
$$B=\{x_1,\ldots,x_m\}$$ and computes

$$
\mu_B = \frac{1}{m}\sum_{i=1}^m x_i,
$$

$$
\sigma_B^2 = \frac{1}{m}\sum_{i=1}^m (x_i-\mu_B)^2.
$$

Then each activation is normalized:

$$
\hat{x}_i
=
\frac{x_i-\mu_B}{\sqrt{\sigma_B^2+\epsilon}},
$$

and the layer learns a scale and shift:

$$
y_i = \gamma \hat{x}_i + \beta.
$$

That formula is the whole twist. During training, $$\hat{x}_i$$ is not a
function of $$x_i$$ alone. It is a function of $$x_i$$ and the batch around it.
The example is being judged by the room.

Ioffe and Szegedy introduced BatchNorm as a way to reduce what they called
internal covariate shift: changing layer-input distributions as earlier
parameters move during training. Their paper made normalization part of the
architecture, using mini-batch statistics during training, and reported much
faster training and higher tolerance for large learning rates.[^bn]

That original story is historically important, but it is not the whole
mechanism. Santurkar, Tsipras, Ilyas, and Madry later argued that the success of
BatchNorm is not mainly explained by stabilizing activation distributions.
Instead, their experiments and analysis point to smoother optimization: gradients
become more predictive, and the training landscape behaves more gently for
first-order methods.[^santurkar]

So BatchNorm is doing two things at once, and the two are easy to accidentally
merge in your head:

```text
it reparameterizes the optimization problem
and
it makes the mini-batch part of the forward pass
```

The first is why it is loved. The second is why it can bite.

## One Channel, Several Rooms

The lab below is deliberately small: one channel, two latent groups, one running
mean, one running variance. It is not pretending to be a network. It is a glass
slide under the microscope.

There are two latent groups. Group A activations are centered lower; group B
activations are centered higher. Training batches are globally balanced on
average, but the **Batch sorting** slider controls whether individual mini-batches
are well mixed or locally homogeneous. Evaluation can have a different group mix.

The layer tracks running mean and variance during training. At eval time, it
normalizes with those running statistics instead of the current batch statistics.

Start with the default settings:

```text
batch size = 16
group gap = 1.70
batch sorting = 70%
eval group-B share = 75%
```

the train-mode gate rate is about `50%`, while the eval-mode gate rate is about
`68%`. The same fixed group-A activation moves by almost `2.0` normalized units
as its batch neighbors change.

<style>
  .bn-lab {
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

  .bn-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .bn-lab__controls label,
  .bn-lab__metric span,
  .bn-lab__note,
  .bn-lab__legend {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .bn-lab__controls label {
    display: grid;
    font-weight: 650;
    gap: 0.35rem;
    min-width: 0;
  }

  .bn-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .bn-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .bn-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .bn-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .bn-lab__metric span {
    display: block;
  }

  .bn-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .bn-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 840px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .bn-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .bn-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .bn-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .bn-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .bn-lab {
      padding: 0.82rem;
    }

    .bn-lab__controls,
    .bn-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .bn-lab canvas {
      height: 1180px;
    }
  }
</style>

<div class="bn-lab" data-batch-norm-context-lab>
  <div class="bn-lab__controls">
    <label>
      Batch size <output data-value="batchSize">16</output>
      <input type="range" min="2" max="128" step="1" value="16" data-param="batchSize">
    </label>
    <label>
      Group gap <output data-value="gap">1.70</output>
      <input type="range" min="40" max="260" step="5" value="170" data-param="gap">
    </label>
    <label>
      Batch sorting <output data-value="sort">70%</output>
      <input type="range" min="0" max="100" step="1" value="70" data-param="sort">
    </label>
    <label>
      Eval group-B share <output data-value="testShare">75%</output>
      <input type="range" min="0" max="100" step="1" value="75" data-param="testShare">
    </label>
    <label>
      EMA momentum <output data-value="momentum">0.90</output>
      <input type="range" min="0" max="99" step="1" value="90" data-param="momentum">
    </label>
    <label>
      Noise sd <output data-value="noise">0.70</output>
      <input type="range" min="20" max="140" step="5" value="70" data-param="noise">
    </label>
    <label>
      Steps <output data-value="steps">120</output>
      <input type="range" min="20" max="260" step="5" value="120" data-param="steps">
    </label>
    <label>
      Seed <output data-value="seed">53</output>
      <input type="range" min="1" max="999" step="1" value="53" data-param="seed">
    </label>
  </div>
  <div class="bn-lab__metrics" data-bn-metrics></div>
  <canvas data-canvas width="980" height="840" aria-label="Batch normalization simulator showing training batch statistics, running statistics, same-example context dependence, and batch-size sensitivity"></canvas>
  <div class="bn-lab__legend">
    <span><i style="background:#2563eb"></i> Group A</span>
    <span><i style="background:#be123c"></i> Group B</span>
    <span><i style="background:#d97706"></i> Batch statistic</span>
    <span><i style="background:#0f766e"></i> Running statistic</span>
    <span><i style="background:#7c3aed"></i> Eval mode</span>
  </div>
  <p class="bn-lab__note">
    Deterministic toy simulation of one BatchNorm channel. Train mode uses the
    current mini-batch mean and variance. Eval mode uses exponential moving
    averages accumulated during training. The gate rate is the fraction of
    normalized activations above zero.
  </p>
</div>
<script defer src="{{ '/assets/js/batch-norm-context-lab.js?v=20260614a' | relative_url }}"></script>

The code is in
[`assets/js/batch-norm-context-lab.js`]({{ '/assets/js/batch-norm-context-lab.js' | relative_url }}).
There is no learned classifier hiding in the demo, which is the point. The
normalization itself changes when the batch composition, running statistics, or
eval distribution changes.

The most important panel is the lower left one. It holds one group-A activation
fixed and changes only its neighbors. In training mode, the normalized value
changes because the batch mean and variance change. In eval mode, the same
activation has one value because the running statistics are fixed.

That is the hidden input: the room around the example.

## Why the Weirdness Helps

Most of the time, this contextual behavior is a feature, not a bug.

Mini-batch statistics inject noise. The layer cannot rely on a perfectly fixed
coordinate system. It sees small random rescalings as training proceeds. This
can regularize the model, and the original BatchNorm paper explicitly notes that
BatchNorm can reduce the need for Dropout in some settings.[^bn]

The optimization effect can be even more important. By recentering and rescaling
activations, BatchNorm changes the local geometry of the training problem.
Santurkar et al. show that BatchNorm can make gradients more stable and
predictive, improving the smoothness of the optimization landscape.[^santurkar]

That helps explain why BatchNorm often lets you use a more aggressive learning
rate. The layer is not merely keeping activations pretty. It is changing the
problem the optimizer sees.

The same mechanism has operational preconditions, though:

```text
mini-batches should be representative enough
running statistics should track the deployment distribution
train and eval semantics should be respected
```

If those are false, BatchNorm becomes a small distribution-shift machine.

## The Failure Has a Shape

The dangerous cases are not exotic.

**Small batches.** With few examples, the batch mean and variance are noisy.
This is why BatchNorm becomes awkward for detection, segmentation, video, large
models, and fine-tuning regimes where memory constraints force tiny per-device
batches. Wu and He's Group Normalization paper makes this explicit: BN error can
rise rapidly as batch size shrinks because batch-statistic estimates become
inaccurate, while GroupNorm avoids dependence on batch size by normalizing over
channel groups within each example.[^gn]

**Non-iid batches.** If a data loader groups examples by sequence length, camera,
class, user, time, hospital, market regime, prompt template, or resolution, then
mini-batches may not look like the population. In the lab, this is **Batch
sorting**. The global training mixture can be balanced while each local batch is
not.

**Train/eval mismatch.** During training, outputs depend on the current batch.
During inference, outputs depend on running estimates. Ioffe's Batch
Renormalization paper directly targets this problem, noting that BatchNorm's
effectiveness diminishes with small or non-iid mini-batches and hypothesizing
that the issue comes from mini-batch dependence and different activations between
training and inference.[^renorm]

**Deployment shift.** If the eval population has a different group mix from
training, the running mean and variance may be honest about training and wrong
for deployment. In the lab, raising **Eval group-B share** changes the eval
activation distribution even though the BatchNorm layer did exactly what it was
told during training.

The shape of the failure is not mysterious:

```text
train-mode output = function(example, current batch)
eval-mode output  = function(example, running training statistics)
deployment data   = possibly a third distribution
```

The model summary only shows the layer. It does not show which of those
distributions is currently steering the arithmetic.

## My BatchNorm Bug Report

When BatchNorm is involved, I want the bug report to include more than "loss is
weird." I want the batch path written down.

Check:

- Are validation and inference definitely using eval mode?
- Are BatchNorm running statistics being saved, loaded, and restored with the
  weights?
- Are per-device batches tiny even when the global batch is large?
- Are statistics synchronized across devices, or does each device normalize its
  own slice?
- Does the data loader accidentally group examples by class, length, domain,
  user, time, or augmentation strength?
- Are running statistics recomputed or adapted after fine-tuning?
- Does the deployment population have a different activation mixture from the
  training population?
- Would LayerNorm, GroupNorm, InstanceNorm, frozen BatchNorm, synchronized
  BatchNorm, or Batch Renormalization better match the data path?

This is not a recommendation to remove BatchNorm everywhere. It is a
recommendation to treat it as a stateful, mode-dependent layer rather than a
stateless arithmetic trick.

## Treat the Batch as Part of the Model

BatchNorm works because it changes the learning problem.

That is exactly why it deserves respect.

It is a layer with memory, modes, and neighbors. That complexity often pays for
itself: faster training, smoother optimization, useful noise, and easier
initialization are not small gifts.

But when a model behaves differently after exporting, fine-tuning, changing
batch size, changing data order, or moving from research batches to production
traffic, BatchNorm belongs near the top of the suspect list.

The mini-batch is not just how you feed the model. In training mode, it is part
of the model.

[^bn]: Sergey Ioffe and Christian Szegedy, ["Batch Normalization: Accelerating Deep Network Training by Reducing Internal Covariate Shift"](https://arxiv.org/abs/1502.03167), ICML 2015.

[^santurkar]: Shibani Santurkar, Dimitris Tsipras, Andrew Ilyas, and Aleksander Madry, ["How Does Batch Normalization Help Optimization?"](https://arxiv.org/abs/1805.11604), NeurIPS 2018.

[^gn]: Yuxin Wu and Kaiming He, ["Group Normalization"](https://arxiv.org/abs/1803.08494), ECCV 2018.

[^renorm]: Sergey Ioffe, ["Batch Renormalization: Towards Reducing Minibatch Dependence in Batch-Normalized Models"](https://arxiv.org/abs/1702.03275), 2017.
