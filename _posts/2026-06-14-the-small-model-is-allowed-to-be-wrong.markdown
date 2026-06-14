---
layout: post
title: "Small Draft Models May Be Wrong"
description: "Speculative decoding is exact because the draft model is only a proposal distribution. The verifier keeps the overlap and samples the missing target mass when the draft fails."
date: 2026-06-14 07:24:00 -0400
categories: ai-systems
tags: [llm-inference, speculative-decoding, rejection-sampling, transformers, serving-systems]
excerpt: "The small model in speculative decoding does not have to be trusted. It only has to propose. Exactness comes from a rejection-sampling correction that reconstructs the target distribution."
---

The suspicious part of speculative decoding is not the speed.

It is the promise that the samples do not change.

A small draft model proposes several future tokens. A large target model checks
them in one parallel pass. Some tokens are accepted, the first failure is
corrected, and the loop begins again. This sounds like approximation wearing a
systems hat. Surely the small model must be biasing the output?

Not if the correction is the right one.

The important sentence is:

```text
the draft model is a proposal distribution, not a replacement model
```

Leviathan, Kalman, and Matias introduced speculative decoding as a way to sample
from autoregressive Transformers faster while preserving the output
distribution.[^leviathan] Chen, Borgeaud, Irving, Lespiau, Sifre, and Jumper
called the stochastic version speculative sampling and gave the compact
modified rejection-sampling proof.[^chen] Their reported speedups are exciting,
but the mathematical contract is the part worth isolating: the small model is
allowed to be wrong because wrong proposals are filtered through an exact
accept/reject rule.

## A One-Token Machine

Forget sequences for a moment. Suppose the target model has next-token
distribution \(p\), and the draft model has next-token distribution \(q\).

The draft samples a token \(y \sim q\). The verifier accepts that token with
probability

$$
a(y)=\min\left(1,\frac{p(y)}{q(y)}\right).
$$

If the token is accepted, emit \(y\). If it is rejected, do not simply sample
from \(p\). Sample from the residual distribution

$$
r(x) \propto \max(0, p(x)-q(x)).
$$

That residual is the missing target mass: tokens the draft under-proposed
relative to the target.

Now compute the probability that the final emitted token is \(x\). It can happen
in two ways. The draft can propose \(x\) and be accepted, contributing
\(\min(p(x), q(x))\). Or some draft token can be rejected, after which the
residual sampler contributes exactly \(\max(0, p(x)-q(x))\). Therefore:

$$
\Pr[X=x]
=
\min(p(x),q(x))+\max(0,p(x)-q(x))
=
p(x).
$$

That is the whole trick. The output distribution is the target distribution.
The draft is only deciding which parts of \(p\) can be cheaply reused.

The total acceptance probability is

$$
\alpha=\sum_x \min(p(x),q(x)).
$$

This is also \(1-\mathrm{TV}(p,q)\), where \(\mathrm{TV}\) is total variation
distance. A better draft increases overlap. It does not change the target
distribution; it changes how often the verifier can keep the proposal.

## A Rejection-Sampling Lab

The lab below builds a tiny Markov language model with eight toy tokens. The
target model is the distribution we must preserve. The draft model is a noisy
proposal model whose similarity to the target you can change.

The visualization separates three ideas that are often blurred together:

1. the draft distribution can be biased,
2. the corrected speculative distribution is algebraically identical to the
   target,
3. speed depends on overlap, lookahead length, and draft cost.

<style>
  .spec-lab {
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

  .spec-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .spec-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .spec-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .spec-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .spec-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .spec-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .spec-lab__metric span,
  .spec-lab__legend,
  .spec-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .spec-lab__metric span {
    display: block;
  }

  .spec-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .spec-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 560px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .spec-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .spec-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .spec-lab__swatch {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .spec-lab__swatch--target {
    background: #0f766e;
  }

  .spec-lab__swatch--draft {
    background: #b45309;
  }

  .spec-lab__swatch--exact {
    background: #2563eb;
  }

  .spec-lab__swatch--reject {
    background: #be123c;
  }

  .spec-lab__note {
    margin-top: 0.55rem;
  }

  @media (max-width: 720px) {
    .spec-lab {
      padding: 0.8rem;
    }

    .spec-lab__controls {
      grid-template-columns: minmax(0, 1fr);
    }

    .spec-lab__metrics {
      grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    }

    .spec-lab canvas {
      height: 780px;
    }
  }
</style>

<div class="spec-lab" data-speculative-decoding-lab>
  <div class="spec-lab__controls">
    <label>
      Target certainty <output data-value="certainty">64%</output>
      <input data-param="certainty" type="range" min="0" max="100" step="2" value="64">
    </label>
    <label>
      Draft match <output data-value="match">72%</output>
      <input data-param="match" type="range" min="0" max="100" step="2" value="72">
    </label>
    <label>
      Draft length <output data-value="gamma">5</output>
      <input data-param="gamma" type="range" min="1" max="12" step="1" value="5">
    </label>
    <label>
      Draft cost <output data-value="draftCost">9%</output>
      <input data-param="draftCost" type="range" min="0" max="40" step="1" value="9">
    </label>
    <label>
      Sequence length <output data-value="length">96</output>
      <input data-param="length" type="range" min="24" max="180" step="4" value="96">
    </label>
    <label>
      Seed <output data-value="seed">23</output>
      <input data-param="seed" type="range" min="1" max="999" step="1" value="23">
    </label>
  </div>
  <div class="spec-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Speculative decoding exactness lab"></canvas>
  <div class="spec-lab__legend">
    <span><i class="spec-lab__swatch spec-lab__swatch--target"></i> target distribution</span>
    <span><i class="spec-lab__swatch spec-lab__swatch--draft"></i> draft proposal</span>
    <span><i class="spec-lab__swatch spec-lab__swatch--exact"></i> corrected / residual</span>
    <span><i class="spec-lab__swatch spec-lab__swatch--reject"></i> rejection mass</span>
  </div>
  <p class="spec-lab__note">
    The corrected TV distance is computed from the exact finite distribution,
    not from the chart. Empirical sequence speed uses this toy Markov model and
    a draft-cost knob; it is an inference accounting model, not a GPU benchmark.
  </p>
</div>

<script defer src="{{ '/assets/js/speculative-decoding-lab.js?v=20260614b' | relative_url }}"></script>

## Why the Residual Matters

The tempting wrong algorithm is:

```text
propose from draft
accept with min(1, p/q)
if rejected, sample from the target p
```

That sounds reasonable. It is not exact.

The accepted part already contains \(\min(p,q)\). If the fallback samples from
the whole target distribution again, it gives probability mass to tokens whose
target mass was already fully covered by the draft. The fallback must sample
only the target mass that is still missing.

This is the role of \((p-q)^+\). It is not an implementation detail. It is the
conservation law.

The lab reports "wrong fallback TV" because this mistake is easy to make when
explaining the method informally. The wrong fallback may look close when the
draft is good. But close is not the same as exact, and speculative decoding's
strongest claim is exactness up to numerical effects.

## From One Token to a Run

For a sequence, apply the same one-token machine repeatedly from left to right.
The draft proposes \(\gamma\) tokens. The target scores the proposed
continuation in parallel. The algorithm checks the draft tokens in order:

```text
accept token 1 or correct it
if accepted, accept token 2 or correct it
if accepted, accept token 3 or correct it
...
```

The first rejection stops the block. If every drafted token is accepted, the
target logits computed at the end of the block can also produce one more token.
That is why the idealized expected yield is

$$
1+\alpha+\alpha^2+\cdots+\alpha^\gamma
=
\frac{1-\alpha^{\gamma+1}}{1-\alpha},
$$

with the obvious \(\gamma+1\) limit when \(\alpha=1\).

This equation is not a law of nature. It assumes a constant independent
acceptance probability. Real language-model acceptance varies by context,
temperature, tokenization, prompt domain, and draft architecture. But it is a
good first accounting identity. A draft length of 8 does not mean 8 free tokens.
It means you bought a geometric tail whose value depends on overlap.

The 2025 "Decoding Speculative Decoding" study is useful here because it pushes
against a naive story: draft-model language-modeling accuracy does not by
itself determine speculative-decoding throughput, and draft latency can become
the bottleneck.[^decoding-spec] A slightly worse but much faster draft can be
the better systems object.

## What Is Actually Being Verified

Speculative decoding turns target decoding into a verifier-shaped operation.
The target model still evaluates the proposed continuation. This is why the
method can preserve the distribution. The expensive model has not been replaced;
its serial interaction pattern has been changed.

That distinction matters for product claims.

If you skip verification, you are no longer doing exact speculative decoding.
If you use approximate acceptance rules, typical acceptance, tree pruning, or
multi-head predictors, you may get a useful engineering tradeoff, but the
contract has changed. Medusa, for example, avoids a separate draft model by
adding multiple decoding heads and verifying candidate continuations with
tree-based attention; its paper distinguishes lossless and quality-preserving
variants rather than pretending every acceleration has the same guarantee.[^medusa]

The clean mental model is borrowed from rejection sampling:

```text
proposal quality controls cost
acceptance correction controls correctness
```

A bad proposal distribution is not invalid. It is expensive. A proposal that
never overlaps with the target will be rejected often, and the system will spend
draft work to get little speed. But as long as the correction is implemented
correctly, the target distribution is still recovered.

## The Shape of a Good Draft

The draft model wants to be close to the target where the target has high mass,
but closeness is not the only objective. It also wants to be cheap, easy to
serve, cache-friendly, and compatible with the target's tokenizer and sampling
policy.

This creates strange design pressure. A draft model can be too large to help. A
small model can have worse benchmark perplexity but better speculative utility
if it produces high-overlap tokens cheaply. N-gram or prompt-copying drafts can
be useful in repetitive regimes even though they are not impressive language
models. The original speculative decoding paper explicitly notes that
negligible-cost approximation models such as n-grams can still have nonzero
acceptance and therefore nonzero speedup in some tasks.[^leviathan]

So "draft quality" should not mean one scalar. For serving, the useful question
is closer to:

```text
how much accepted target mass do we buy per unit draft latency?
```

That ratio is contextual. Code completion, structured JSON, boilerplate agent
traces, and repeated editing tasks may have long stretches where the future is
easy to guess. Open-ended high-temperature writing may not. A static
speculation depth is therefore a compromise across contexts.

## The Theorem Is Small; the System Is Not

The proof fits in three lines. The deployment does not.

The verifier pass must be arranged so that the target scores the candidate
continuation efficiently. Sampling code must apply exactly the same temperature,
top-k, top-p, or other probability transformation to the target and draft
distributions before the accept/reject rule. Floating-point differences can
matter. Batch scheduling can turn a latency win into a throughput loss. KV-cache
pressure can erase the expected gain. Multi-user serving changes the objective
from "one request got faster" to "the tail of the queue got better."

That is why I like the small rejection-sampling view. It refuses two bad
stories at once.

The first bad story is that speculative decoding is just approximation. No: the
exact algorithm reconstructs the target distribution.

The second bad story is that exactness makes speed automatic. Also no: exactness
only says the samples are right. Speed comes from the economics of accepted
draft mass, verifier parallelism, and hardware utilization.

The small model is allowed to be wrong.

It is not allowed to be unpriced.

[^leviathan]: Yaniv Leviathan, Matan Kalman, and Yossi Matias, ["Fast Inference from Transformers via Speculative Decoding"](https://arxiv.org/abs/2211.17192), ICML 2023.

[^chen]: Charlie Chen, Sebastian Borgeaud, Geoffrey Irving, Jean-Baptiste Lespiau, Laurent Sifre, and John Jumper, ["Accelerating Large Language Model Decoding with Speculative Sampling"](https://arxiv.org/abs/2302.01318), 2023.

[^decoding-spec]: Minghao Yan et al., ["Decoding Speculative Decoding"](https://aclanthology.org/2025.naacl-long.328.pdf), NAACL 2025.

[^medusa]: Tianle Cai, Yuhong Li, Zhengyang Geng, Hongwu Peng, Jason D. Lee, Deming Chen, and Tri Dao, ["Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads"](https://arxiv.org/abs/2401.10774), 2024.
