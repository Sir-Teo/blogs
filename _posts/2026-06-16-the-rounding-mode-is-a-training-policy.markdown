---
layout: post
title: "The Rounder Is the Turnstile"
description: "Low-precision training is not just a bit-width choice. Once updates are smaller than a grid step, the gate rule decides whether they are blocked or admitted in expectation."
date: 2026-06-16 09:42:00 -0400
categories: machine-learning
tags: [stochastic-rounding, low-precision-training, numerical-analysis, quantization, floating-point, optimization]
excerpt: "Round-to-nearest can strand a tiny gradient at the gate. Stochastic rounding lets sub-grid updates through with probability proportional to how far they have moved."
---

The first thing to notice about low precision is not the missing bits.

It is the gate.

A calculation walks up with a real number. The format has a fixed set of places
where that number is allowed to stand. At 32-bit or 64-bit precision, the gate
is usually so fine that we keep our attention on the optimizer.

Low-precision training changes the commute. The rounder stops looking like a
minor storage detail and starts acting like a turnstile.

Here is the whole problem in one line:

```text
stored_weight = round(stored_weight - learning_rate * gradient)
```

If the proposed update is smaller than half of one representable grid cell,
round-to-nearest can send the new weight back to the old platform. The optimizer
asked to move. The gate did not open.

Stochastic rounding runs a different gate:

```text
if the proposal is 22% of the way to the next grid cell,
move to that cell with probability 22%
```

Most tiny steps still wait. Some pass through, and the average movement is the
movement the optimizer requested.

That is why the rounding mode belongs in the training recipe. It decides which
small updates get admitted to the stored state.

## The Midpoint Gate

Take a finite grid with spacing $$\Delta$$. If a real value $$x$$ falls between
two adjacent grid points $$a < x < b$$, round-to-nearest chooses the closer
point. Stochastic rounding chooses

$$
b \quad \text{with probability} \quad \frac{x-a}{b-a},
$$

and chooses $$a$$ otherwise. Its conditional expectation is therefore

$$
\mathbb{E}[\operatorname{sr}(x) \mid x] = x.
$$

That is the famous property, but it is easy to say it too quickly. Local
unbiasedness does not mean an entire nonlinear training run is unbiased. It
means the particular act of mapping this real number onto this grid does not
systematically push it up or down, assuming the stochastic rounder is implemented
with enough randomness and the value is not clipped at the edge of the format.

Now put that grid inside gradient descent on the scalar quadratic

$$
L(w) = \frac{1}{2}(w - w^\*)^2.
$$

The exact update is

$$
w_{t+1} = w_t - \eta(w_t - w^\*).
$$

With round-to-nearest storage, a positive update changes the stored weight only
when it crosses the midpoint to the next cell:

$$
\eta |w_t - w^\*| \geq \frac{\Delta}{2}.
$$

So the deterministic rounder has a dead zone:

$$
|w_t - w^\*| < \frac{\Delta}{2\eta}.
$$

That dead zone can be much larger than one grid cell. With
$$\Delta = 0.05$$ and $$\eta = 0.035$$, round-to-nearest can stop once the
remaining gap is below about `0.714`. That is not a tiny numerical scar. It is a
turnstile rule that says small gradients do not board.

Stochastic rounding removes the hard threshold. If the proposed update is only
one fifth of a grid cell, the stored weight moves one grid cell about one fifth
of the time. Learning becomes lumpy, but it does not get stranded at the
midpoint gate.

## Why This Old Gate Keeps Reopening

Stochastic rounding is not new. Higham traces early versions to work from the
1950s and 1960s, long before modern deep learning made low-precision arithmetic
a daily engineering concern.[^higham-blog] The recent revival comes from the
same pressure that keeps returning everywhere in deep learning: memory
bandwidth, energy, and accelerator throughput are too important to leave every
tensor in wide precision.

Gupta, Agrawal, Gopalakrishnan, and Narayanan made the neural-network version
of the point very directly in 2015. In low-precision fixed-point training, they
found the rounding scheme was crucial, and reported that deep networks could be
trained with 16-bit fixed-point representation when stochastic rounding was
used.[^gupta]

Numerical analysts give a second reason to care. Connolly, Higham, and Mary
analyze stochastic rounding through probabilistic backward error, and the
broader literature shows why random signs can make accumulated roundoff behave
less like a one-way drift and more like a controlled fluctuation.[^connolly]
For algorithms dominated by summation, later work on limited-precision
stochastic rounding summarizes a typical contrast: probabilistic bounds can
scale like $$O(\sqrt{n}u)$$ where worst-case deterministic bounds scale like
$$O(nu)$$, under the model assumptions.[^limited-sr]

Modern low-precision training is not simply "use stochastic rounding and relax."
FP8 work, for example, is a whole systems design: E4M3 and E5M2 formats, scaling
rules, higher-precision accumulation, optimizer-state choices, and model-class
experiments.[^fp8] But stochastic rounding remains one of the places where
arithmetic touches optimization rather than merely representing it.

The 2025 wave makes that explicit. Ozkara, Yu, and Park study stochastic
rounding for LLM training under Adam and report BF16+SR results up to 6.7B
parameters, with better perplexity in their setting and up to `1.54x` higher
throughput plus `30%` lower memory than the mixed-precision baseline they
compare against.[^ozkara] Liu, Andronic, Gunduz, and Constantinides study
mini-batch SGD with stochastic rounding for edge LLM training; their core
message is not "rounding fixes everything," but that batch size, weight
quantization, and activation quantization interact differently with the variance
introduced by lower precision.[^liu]

That is the right level of seriousness. Rounding is not garnish. It is a
variance source, a bias source if implemented cheaply, and sometimes the
difference between an update and no update.

## A Pocket Turnstile

The lab below uses a deliberately plain model. It is not an FP8 emulator and it
is not a claim about a real transformer. It stores one scalar weight on a fixed
grid and optimizes the quadratic target $$w^\* = 1$$.

The simplification is the point. If the mechanism is not visible in one
dimension, it will be too easy to hide inside a billion parameters.

<style>
  .sr-lab {
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

  .sr-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .sr-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .sr-lab output {
    color: #172026;
    float: right;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
  }

  .sr-lab input[type="range"] {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .sr-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .sr-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .sr-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    line-height: 1.15;
  }

  .sr-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
  }

  .sr-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .sr-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .sr-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    gap: 0.35rem;
  }

  .sr-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .sr-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="sr-lab" data-sr-lab>
  <div class="sr-lab__controls">
    <label>
      Grid quantum <output data-value="quantum">0.050</output>
      <input type="range" data-param="quantum" min="0.01" max="0.15" step="0.005" value="0.05">
    </label>
    <label>
      Learning rate <output data-value="learningRate">0.035</output>
      <input type="range" data-param="learningRate" min="0.005" max="0.12" step="0.005" value="0.035">
    </label>
    <label>
      Steps <output data-value="steps">180</output>
      <input type="range" data-param="steps" min="60" max="300" step="10" value="180">
    </label>
    <label>
      Batch size <output data-value="batch">16</output>
      <input type="range" data-param="batch" min="1" max="256" step="1" value="16">
    </label>
    <label>
      Gradient noise <output data-value="noise">8%</output>
      <input type="range" data-param="noise" min="0" max="40" step="1" value="8">
    </label>
    <label>
      Micro update <output data-value="microStep">22%</output>
      <input type="range" data-param="microStep" min="1" max="90" step="1" value="22">
    </label>
    <label>
      Seed <output data-value="seed">17</output>
      <input type="range" data-param="seed" min="1" max="99" step="1" value="17">
    </label>
  </div>
  <div class="sr-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="Stochastic rounding simulator showing low precision gradient descent, sub-grid accumulation, final weight distribution, and a dead-zone sweep"></canvas>
  <div class="sr-lab__legend">
    <span><i style="background:#2563eb"></i> Exact arithmetic</span>
    <span><i style="background:#be123c"></i> Round-to-nearest</span>
    <span><i style="background:#0f766e"></i> Stochastic mean</span>
    <span><i style="background:rgba(15,118,110,0.24)"></i> Stochastic 10-90%</span>
    <span><i style="background:#7c3aed"></i> Target</span>
  </div>
  <p class="sr-lab__note">
    Deterministic toy simulation. The optimizer panel reuses the same gradient
    noise sequence for each mode so the visible spread comes from rounding. The
    exported JavaScript audit runs 390 assertions over local unbiasedness,
    threshold decisions, seeded ensembles, deterministic dead-zone settings,
    sub-grid accumulation, and clipping caveats.
  </p>
</div>
<script defer src="{{ '/assets/js/stochastic-rounding-lab.js?v=20260616b' | relative_url }}"></script>

With the default settings, the exact optimizer ends at `0.998`. Round-to-nearest
stops at `0.350`, after step `9`, because the proposed moves become too small
to cross a grid midpoint. The stochastic-rounding ensemble mean ends at `0.999`
over 160 runs. Same route, different gate policy.

The second panel repeats the idea without gradients. It adds a fixed micro
update equal to `22%` of one grid cell. Round-to-nearest keeps every passenger
behind the line, so the accumulator stays at `0`. Stochastic rounding recovers
about `1.95` against an exact total of `1.98`. The default audit reports 390
assertions: exact expectation checks for the rounding operator, deterministic
branch-threshold checks, seeded ensemble reproducibility, 12 dead-zone settings
where stochastic rounding keeps the optimizer closer to the target than
deterministic rounding, and accumulator cases that make the clipping caveat
explicit.

This is not magic. It is gate accounting.

Round-to-nearest preserves the most likely local value. Stochastic rounding
preserves the local mean. When training is made of many small update requests,
those are different operating promises.

## The Gate Needs Real Randomness

There is a practical trap here. The clean formula for stochastic rounding
assumes the rounder can compute the adjacent grid points and choose between them
with probabilities proportional to the distances. Hardware usually cannot spend
infinite randomness and infinite intermediate precision to round one number.

El Arar, Fasi, Filip, and Mikaitis study this exact gap. Their 2025 paper on
limited-precision stochastic rounding models the number of random bits used by
an implementation, and shows that the limited-randomness version can become
biased; the bias disappears as the number of random bits grows.[^limited-sr]

That caveat matters for machine learning. "Use stochastic rounding" is not a
complete implementation note. A serious route map should say:

1. which tensors are stored in low precision;
2. which matrix products accumulate in wider precision;
3. whether gradients, weights, activations, optimizer states, or updates are
   rounded stochastically;
4. how scaling, clipping, subnormals, and overflow are handled;
5. how random bits are generated, shared, or correlated across lanes;
6. whether the claimed gain survives multiple seeds and batch sizes.

The last item is easy to understate. Stochastic rounding adds variance while
removing a certain kind of systematic stagnation. Depending on the optimizer,
loss surface, batch size, and scaling policy, that variance can help, hurt, or
wash out. The right comparison is not a slogan. It is an ablation table.

## The Dispatch Rule

I like to think of low-precision training as a station queue of update requests.

Round-to-nearest says:

```text
ignore every request below the service threshold
```

Stochastic rounding says:

```text
serve small requests with probability proportional to their size
```

That station metaphor is imperfect, but it points at the operational fact. A
low-precision format does not merely compress the state of training. It changes
which update requests are allowed through the gate.

This also explains why stochastic rounding is more than generic noise injection.
Noise injection usually perturbs the computation and hopes the perturbation has
a useful regularizing effect. Stochastic rounding is tied to a conservation law:
conditional on the exact proposal, the rounded value has the right mean. Its
variance is the price paid to buy that conservation on a coarse grid.

Sometimes the price is worth paying. Sometimes wider accumulators, loss scaling,
master weights, or a different format are better. But once updates live near the
grid spacing, "rounding mode" is no longer a numerical footnote.

It is part of the dispatch system.

## Platform Notes

[^higham-blog]: Nick Higham, "What Is Stochastic Rounding?" 2020. [Blog](https://nhigham.com/2020/07/07/what-is-stochastic-rounding/).

[^gupta]: Suyog Gupta, Ankur Agrawal, Kailash Gopalakrishnan, and Pritish Narayanan, "Deep Learning with Limited Numerical Precision," ICML 2015. [PMLR](https://proceedings.mlr.press/v37/gupta15.html).

[^connolly]: Michael P. Connolly, Nicholas J. Higham, and Theo Mary, "Stochastic Rounding and Its Probabilistic Backward Error Analysis," *SIAM Journal on Scientific Computing*, 2021. [SIAM](https://epubs.siam.org/doi/10.1137/20M1334796).

[^limited-sr]: El-Mehdi El Arar, Massimiliano Fasi, Silviu-Ioan Filip, and Mantas Mikaitis, "Probabilistic Error Analysis of Limited-Precision Stochastic Rounding," *SIAM Journal on Scientific Computing*, 2025. [SIAM](https://epubs.siam.org/doi/10.1137/24M1681458), [arXiv](https://arxiv.org/abs/2408.03069).

[^fp8]: Paulius Micikevicius et al., "FP8 Formats for Deep Learning," 2022. [arXiv](https://arxiv.org/abs/2209.05433).

[^ozkara]: Kaan Ozkara, Tao Yu, and Youngsuk Park, "Stochastic Rounding for LLM Training: Theory and Practice," AISTATS 2025. [PMLR](https://proceedings.mlr.press/v258/ozkara25b.html).

[^liu]: Taowen Liu, Marta Andronic, Deniz Gunduz, and George Anthony Constantinides, "Training with Fewer Bits: Unlocking Edge LLMs Training with Stochastic Rounding," Findings of EMNLP 2025. [ACL Anthology](https://aclanthology.org/2025.findings-emnlp.784/).
