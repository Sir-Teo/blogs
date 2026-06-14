---
layout: post
title: "The Dataset Is A Compute Budget"
description: "Scaling laws are not just a slogan about bigger models. Under a fixed training budget, model size and tokens trade off, and data scarcity bends the compute-optimal frontier."
date: 2026-06-14 15:55:00 -0400
categories: ai-systems
tags: [scaling-laws, language-models, compute-optimal-training, chinchilla, training-data, inference]
excerpt: "A model can be too small for its compute budget, or too large for its tokens. The interesting question is not bigger versus smaller. It is where the next FLOP buys the most loss reduction."
---

A training run is a wager on where loss will fall fastest.

That sounds less glamorous than "scale the model," but it is closer to the
engineering decision. If I give you a fixed pile of FLOPs, you can spend them
in at least two obvious ways:

```text
more parameters, fewer tokens
fewer parameters, more tokens
```

Both can be wrong.

A model that is too small sees endless data and cannot store enough structure.
A model that is too large sees too few tokens and never gets trained enough to
use its capacity. The allocation problem is the quiet center of modern language
model training.

## The Old Slogan Was Not Quite Wrong

The original neural scaling law story was beautiful because it turned chaos
into smooth curves. Kaplan et al. studied language models across model size,
dataset size, and compute, and found approximate power-law relationships
between cross-entropy loss and scale.[^kaplan] Their compute analysis also used
the now-familiar approximation:

```text
training FLOPs ~= 6 * parameters * tokens
```

up to architectural and accounting details.

That paper made a provocative recommendation for compute-efficient training:
train very large models on relatively fewer tokens, and stop before full
convergence. In other words, if your only objective is to minimize loss for a
given training compute budget, do not necessarily train every parameter to
death.

Then Chinchilla changed the taste of the field.

Hoffmann et al. trained and analyzed hundreds of models and argued that many
large language models at the time were substantially undertrained: too many
parameters, too few tokens.[^chinchilla] Their headline example was vivid:
Chinchilla used about 70 billion parameters and 1.4 trillion tokens, while
Gopher used about 280 billion parameters and 300 billion tokens; Chinchilla
performed better while using similar training compute.[^chinchilla]

The lesson was not "70B is magic." It was:

```text
for a fixed compute budget, model size and data size are joint variables
```

Scaling laws are not a permission slip to make one axis huge. They are a map
of marginal returns.

## A Tiny Compute-Allocation Lab

The lab below is a pedagogical model, not a reproduction of anyone's private
training curve. It uses the same kind of loss decomposition as Chinchilla's
parametric fit:

```text
loss = irreducible + model term + data term
```

The model term shrinks as parameters increase. The data term shrinks as
effective training tokens increase. The compute constraint is:

```text
C = 6ND
```

where `N` is parameters and `D` is raw training tokens. The default budget is
close to the Chinchilla/Gopher training-compute scale, and the no-data-cap
optimum is anchored near 70B parameters and 1.4T tokens. The exponents are
Chinchilla-ish, but the lab is intentionally normalized so the geometry is
visible rather than pretending to forecast exact benchmark loss.

<div class="compute-optimal-lab" data-compute-optimal-lab>
  <div class="compute-optimal-lab__controls">
    <label>
      Training FLOPs <output data-value="computeLog10">589ZF</output>
      <input type="range" data-param="computeLog10" min="200" max="255" step="0.1" value="237.7" aria-label="Training FLOPs">
    </label>
    <label>
      Model-size tilt <output data-value="modelTilt">+0 (1.00x N)</output>
      <input type="range" data-param="modelTilt" min="-150" max="150" step="5" value="0" aria-label="Model-size tilt">
    </label>
    <label>
      Unique token pool <output data-value="uniqueTokensT">1.0T tok</output>
      <input type="range" data-param="uniqueTokensT" min="2" max="200" step="2" value="10" aria-label="Unique token pool">
    </label>
    <label>
      Free repeat epochs <output data-value="freeEpochs">4</output>
      <input type="range" data-param="freeEpochs" min="1" max="8" step="1" value="4" aria-label="Free repeat epochs">
    </label>
  </div>
  <div class="compute-optimal-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="Compute-optimal scaling simulator showing fixed-compute frontiers, allocation loss curves, loss terms, and data-cap effects"></canvas>
  <div class="compute-optimal-lab__legend">
    <span><i style="background:#2563eb"></i>Fixed compute frontier</span>
    <span><i style="background:#0f766e"></i>Cap-aware optimum</span>
    <span><i style="background:#7c3aed"></i>No-cap optimum</span>
    <span><i style="background:#be123c"></i>Chosen allocation</span>
    <span><i style="background:#b45309"></i>Model term</span>
  </div>
  <p class="compute-optimal-lab__note">
    Deterministic toy model. Repeated data is treated as fully useful for a
    configurable number of epochs and then has diminishing effective-token
    value. That is a simplification for visualizing data scarcity, not a
    universal law about repeated text.
  </p>
</div>

<script defer src="{{ '/assets/js/compute-optimal-lab.js' | relative_url }}"></script>

Start with the default. The chosen point sits near the valley of the
fixed-compute allocation curve. The token-to-parameter ratio is about 20, which
is the memorable Chinchilla heuristic at this scale.

Now push **Model-size tilt** to the right. The model becomes larger while the
compute budget stays fixed, so training tokens must fall. The data term rises.
The model is not "too big" in the abstract. It is too big for the number of
tokens it gets to see.

Push the same slider left. The model becomes small and sees many more tokens.
Eventually the model term dominates: you are spending compute on data a small
model cannot fully exploit.

Finally, lower **Unique token pool**. At some point the green cap-aware optimum
bends away from the purple no-cap optimum. The toy says: if useful fresh data is
scarce, repeatedly spending compute on the same examples has diminishing
returns, so the best allocation may shift toward a larger model and fewer raw
tokens than the no-cap rule would suggest.

The sliders are not the point. The geometry is.

## The Marginal-FLOP View

Here is the clean version. Let loss be approximated by:

```text
L(N, D) = E + A / N^alpha + B / D^beta
```

and let compute be constrained by:

```text
C = 6ND
```

On a fixed compute frontier, increasing `N` forces `D` down. The optimum is the
place where the loss improvement from spending a little more compute on
parameters equals the loss improvement from spending it on tokens.

That is why "larger model" and "more data" are not independent advice. They are
claims about marginal returns under a budget.

If the model term is still large, add capacity. If the data term is still
large, add tokens. If both terms are small relative to irreducible loss, maybe
the next bottleneck is data quality, architecture, objective, evaluation, or
deployment cost.

## The Data Wall Is Not Just A Wall

The phrase "we will run out of data" is too crude.

Data can be repeated. Data can be filtered. Data can be generated. Data can be
curriculum-scheduled, mixed, deduplicated, contaminated, or weighted. The real
question is not whether the token counter reaches a large number. It is how
much marginal loss reduction the next token brings.

Muennighoff et al. study data-constrained language model scaling and explicitly
separate unique data from repeated data.[^data-constrained] One of their
practical findings is that repeating data for a small number of epochs can be
surprisingly benign, while heavier repetition has diminishing returns. That
shape is what the lab's "free repeat epochs" knob is trying to make visible.

A repeated token is not worthless. It is also not fresh evidence forever.

This is where the allocation problem gets interesting. If extra repeated tokens
have low marginal value, the training-compute optimum can move toward more
parameters. If high-quality fresh tokens appear, the optimum can move back
toward longer training. If synthetic tokens are cheap but correlated with model
mistakes, the data term may shrink less than the token count suggests.

The counter is not the dataset.

## Why Production May Overtrain On Purpose

Training-compute optimal is not the same as business optimal.

Suppose two models reach similar loss under different allocations:

```text
larger model, fewer tokens
smaller model, more tokens
```

The smaller model may be cheaper to serve. If it will answer billions of
queries, inference cost can dominate the original training bill. Sardana and
Frankle make this point directly: once inference is included, the optimal
training recipe can shift toward smaller models trained for longer than the
training-only compute optimum would recommend.[^inference-aware]

This is not a contradiction of Chinchilla. It is a different objective.

Chinchilla asks, roughly:

```text
given training compute C, what N and D minimize loss?
```

An inference-aware deployment asks:

```text
given training plus future serving cost, what N and D minimize total cost for
the quality I need?
```

That second question can justify overtraining a smaller model. LLaMA is a
familiar public example of the taste shift: the original LLaMA paper emphasized
training smaller foundation models on far more tokens because inference cost is
important when models are served widely.[^llama]

## What Scaling Laws Do Not Buy

The lab is deliberately quiet about several things that matter enormously:

- data quality and deduplication;
- tokenizer and context length;
- optimizer details and learning-rate schedules;
- architecture and sparsity;
- contamination and benchmark leakage;
- downstream task mixtures;
- inference latency, memory bandwidth, batching, and hardware utilization.

Scaling laws are useful because they compress a region of empirical behavior
into a few terms. They are dangerous when the compression becomes a substitute
for measurement.

The right habit is not to memorize "20 tokens per parameter" as a commandment.
The right habit is to ask which term is still expensive.

## A Training-Run Checklist

Before trusting a scaling plan, I would want to see:

- the compute accounting convention, including forward, backward, optimizer,
  sequence length, and sparsity assumptions;
- the loss model and the range of runs used to fit it;
- the planned `N`, `D`, and tokens per parameter;
- the unique-token pool and expected repetition;
- evidence that repeated or synthetic data is still adding signal;
- the deployment objective: training-only loss, latency-constrained quality, or
  total cost including inference;
- the sensitivity of the optimum to exponents, data quality, and future token
  availability.

Scaling laws are not hype when they are treated as measurement.

They are hype when they become a slogan.

The dataset is not a pile next to the model. Under a compute budget, it is one
side of the model size.

[^kaplan]: Jared Kaplan et al., ["Scaling Laws for Neural Language Models"](https://arxiv.org/abs/2001.08361), 2020.

[^chinchilla]: Jordan Hoffmann et al., ["Training Compute-Optimal Large Language Models"](https://arxiv.org/abs/2203.15556), 2022.

[^data-constrained]: Niklas Muennighoff et al., ["Scaling Data-Constrained Language Models"](https://arxiv.org/abs/2305.16264), 2023.

[^inference-aware]: Nikhil Sardana and Jonathan Frankle, ["Beyond Chinchilla-Optimal: Accounting for Inference in Language Model Scaling Laws"](https://arxiv.org/abs/2401.00448), 2024.

[^llama]: Hugo Touvron et al., ["LLaMA: Open and Efficient Foundation Language Models"](https://arxiv.org/abs/2302.13971), 2023.
