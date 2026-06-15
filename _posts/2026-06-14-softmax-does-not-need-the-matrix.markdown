---
layout: post
title: "Matrices Were Never Required"
description: "FlashAttention is exact attention scheduled differently: keep the running max, rescale the denominator, and avoid writing the full attention matrix to memory."
date: 2026-06-14 00:23:00 -0400
categories: ai-systems
series: faster-llm-inference
tags: [flashattention, transformers, softmax, gpu-kernels, memory-hierarchy, ai-systems]
excerpt: "The attention equation invites an n by n matrix. The kernel does not have to keep one: exact attention can stream through tiles if the softmax normalizer travels with it."
---

The attention equation is a little too persuasive as notation.

$$
\operatorname{Attention}(Q,K,V)
=
\operatorname{softmax}\left(\frac{QK^\top}{\sqrt{d}}\right)V.
$$

It looks like a recipe:

```text
make the score matrix
softmax the score matrix
multiply by V
```

That is a fine way to teach the Transformer.[^attention] It is not a contract
that a kernel must obey.

The matrix in the middle can be a mathematical object without becoming a
resident memory object. You can compute exact attention while visiting keys and
values in blocks, updating a small state, and throwing each block away. The
output is the same. The memory traffic is not.

This is the heart of FlashAttention.[^flash] It did not win by replacing
attention with a clever approximation. It won by noticing that the old equation
was forcing the hardware to keep a giant diary of facts it only needed briefly.

## Carry the Normalizer

Start with one query row. Let the scores be

$$
s_j = q^\top k_j / \sqrt{d}.
$$

The usual numerically stable softmax writes

$$
p_j = \frac{\exp(s_j - m)}{\sum_i \exp(s_i - m)},
\qquad
m = \max_i s_i.
$$

Then the attention output is

$$
o = \sum_j p_j v_j.
$$

The apparent problem is that the denominator needs all scores. If you have only
seen the first half of the keys, you do not yet know whether the second half
contains a larger score. If a larger score appears, all previous exponentials
were normalized against the wrong maximum.

The small trick is to carry enough state to repair that mistake.

After seeing some scores, keep three quantities:

$$
m = \max s,
\qquad
\ell = \sum_j \exp(s_j - m),
\qquad
a = \sum_j \exp(s_j - m)v_j.
$$

Here $$a$$ is the unnormalized numerator. The output is $$a / \ell$$.

Now a new block arrives. Its maximum is $$m_b$$. The new maximum is

$$
m' = \max(m, m_b).
$$

The old numerator and denominator were measured in units of $$\exp(m)$$. The new
ones must be measured in units of $$\exp(m')$$. So rescale:

$$
\ell'
=
e^{m-m'}\ell
+
\sum_{j \in b} e^{s_j-m'},
$$

and

$$
a'
=
e^{m-m'}a
+
\sum_{j \in b} e^{s_j-m'}v_j.
$$

That is the whole invariant. It is just the online normalizer for softmax,
extended to the value-weighted numerator. Milakov and Gimelshein described the
online normalizer as a way to reduce memory accesses for ordinary softmax.[^online-softmax]
Rabe and Staats later made the broader point that self-attention does not
inherently require $$O(n^2)$$ memory, even though the time complexity remains
quadratic.[^rabe-staats]

FlashAttention puts this invariant inside an IO-aware tiled GPU algorithm:
bring blocks of $$Q,K,V$$ into fast on-chip memory, update the running softmax
state, and avoid writing the full score or probability matrices to high
bandwidth memory.

The math did not become sparse. The bookkeeping became local.

## The GPU Cares Where the Matrix Lives

Modern accelerators are strange cities. Arithmetic is cheap if data is already
near the compute units. Moving data back and forth to high bandwidth memory is
expensive. A naive attention implementation can do good matrix multiplication
and still lose time by writing the $$n \times n$$ score matrix, reading it back
for softmax, writing probabilities, and reading them again to multiply by
values.

For sequence length $$n$$, those intermediates are quadratic. A single head with
an 8,192-token sequence has about 67 million score entries. In fp16, one such
matrix is roughly 128 MiB. If you materialize both scores and probabilities, the
intermediate footprint doubles before counting gradients, masks, dropout,
activations, or any other model state.

FlashAttention's first paper framed the missing principle as IO awareness:
account for reads and writes between GPU memory levels, not only arithmetic
operations.[^flash] FlashAttention-2 kept the exactness and attacked the next
bottlenecks: non-matmul FLOPs, parallelism across sequence length, and warp-level
work partitioning.[^flash2] The Hazy Research implementation note puts the
engineering lesson plainly: the algorithm reorders attention with tiling and
recomputation, reducing memory usage from quadratic to linear in sequence
length, without approximation.[^flash2-blog]

That last phrase matters. Many long-context ideas change the attention pattern.
Some are valuable. Some are approximations. FlashAttention is a different kind
of improvement: for dense attention, it computes the same result while asking
the memory system a better question.

## A Row You Can Stream

The lab below computes one synthetic attention row two ways:

1. **Materialized:** compute all scores, subtract the row max, form all
   probabilities, then multiply by values.
2. **Online tiled:** visit scores in blocks, carry $$(m,\ell,a)$$, and normalize
   once at the end.

The output error should stay at floating-point noise. The memory model is not a
GPU benchmark; it counts the off-chip intermediate score/probability matrices
that a materialized implementation would create, and contrasts them with the
online state and tile scratch space.

<style>
  .online-attn-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .online-attn-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .online-attn-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .online-attn-lab__controls input {
    accent-color: #2563eb;
    width: 100%;
  }

  .online-attn-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .online-attn-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .online-attn-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .online-attn-lab__metric span,
  .online-attn-lab__legend,
  .online-attn-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .online-attn-lab__metric span {
    display: block;
  }

  .online-attn-lab__metric strong {
    display: block;
    font-size: 1.03rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .online-attn-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .online-attn-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.85rem;
    margin-top: 0.7rem;
  }

  .online-attn-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.3rem;
  }

  .online-attn-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .online-attn-lab__note {
    margin: 0.8rem 0 0;
  }
</style>

<div class="online-attn-lab" data-online-attention-lab>
  <div class="online-attn-lab__controls">
    <label>
      Sequence length: <output data-value="tokens">768</output>
      <input type="range" min="128" max="4096" step="64" value="768" data-param="tokens">
    </label>
    <label>
      Head dimension: <output data-value="headDim">64</output>
      <input type="range" min="16" max="192" step="16" value="64" data-param="headDim">
    </label>
    <label>
      Tile size: <output data-value="tile">64</output>
      <input type="range" min="16" max="192" step="16" value="64" data-param="tile">
    </label>
    <label>
      Score spread: <output data-value="spread">55%</output>
      <input type="range" min="10" max="120" step="1" value="55" data-param="spread">
    </label>
    <label>
      Element format: <output data-value="precision">fp16/bf16</output>
      <input type="range" min="2" max="4" step="2" value="2" data-param="precision">
    </label>
  </div>
  <div class="online-attn-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="650" aria-label="Online attention simulator comparing materialized attention memory with exact tiled softmax state"></canvas>
  <div class="online-attn-lab__legend">
    <span><i style="background:#be123c"></i> Materialized scores/probabilities</span>
    <span><i style="background:#0f766e"></i> Online softmax state</span>
    <span><i style="background:#2563eb"></i> Tile scratch</span>
    <span><i style="background:#b45309"></i> Attention row weights</span>
  </div>
  <p class="online-attn-lab__note">
    The memory chart counts intermediate attention objects, not model weights,
    Q/K/V storage, optimizer state, or the persistent KV cache used during
    autoregressive decoding. Tile scratch is shown as an algorithmic working
    set; real kernels map this onto hardware-specific SRAM/register/shared
    memory layouts.
  </p>
</div>
<script defer src="{{ '/assets/js/online-attention-lab.js?v=20260614a' | relative_url }}"></script>

Drag **Sequence length** upward. The output error does not move in any meaningful
way, because both methods compute the same normalized weighted sum. The red
curve, however, bends upward on the log plot because it represents an
$$n \times n$$ intermediate. The green line is the softmax state:

```text
running max, running denominator
```

That state is not a heuristic summary. It is enough information to continue the
exact softmax later.

Now raise **Score spread**. The row becomes peakier. The rescale spikes in the
second panel become more visible because a later block sometimes discovers a
larger maximum and forces the old numerator and denominator to be re-expressed
under the new max. This is the numerically stable part. We are not summing
enormous exponentials and hoping.

## Quadratic Time Did Not Vanish

It is tempting to say "FlashAttention makes attention linear." That sentence is
usually wrong unless one specifies the resource.

Dense attention still compares many query-key pairs. The arithmetic count is
still quadratic in sequence length. If you double the sequence length, there are
roughly four times as many dot products. FlashAttention is not magic against
that fact.

What changes is the memory behavior. The algorithm avoids the quadratic
intermediate matrix in high bandwidth memory. That can be the difference between
"fits" and "does not fit," or between a kernel waiting on memory and a kernel
feeding the matrix-multiply units.

This distinction matters when reading long-context claims:

```text
time complexity
activation memory
intermediate memory traffic
persistent KV cache
```

These are different bills. A method can reduce one and leave another untouched.
FlashAttention primarily attacks the intermediate attention computation. It does
not remove the need to store keys and values for future autoregressive decoding.
Paged KV caches, sliding windows, grouped-query attention, and attention sinks
live in that other bill.

## Notation Is Not a Schedule

The larger lesson is not only about attention.

Machine learning papers often present tensor formulas in the most transparent
algebraic form. That is good. But an algebraic expression also suggests a data
layout, and that suggestion can be accidentally expensive.

The implementation question is:

```text
Which intermediate facts must exist at the same time,
and at which level of the memory hierarchy?
```

For softmax attention, the full probability matrix does not need to exist at
once. A row needs a maximum, a denominator, and a numerator. A block needs to
live just long enough to update those quantities. The algorithm can forget the
block because it has preserved the invariant.

That is why I like FlashAttention as a systems paper. It does not treat the GPU
as a faster calculator for the written equation. It rewrites the schedule of the
same equation around the machine that must execute it.

The matrix was real.

It just did not have to be written down.

## Further Reading

[^attention]: Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Lukasz Kaiser, and Illia Polosukhin, "Attention Is All You Need," NeurIPS 2017. [arXiv](https://arxiv.org/abs/1706.03762), [NeurIPS](https://papers.nips.cc/paper/7181-attention-is-all-you-need).

[^flash]: Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, and Christopher Re, "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness," NeurIPS 2022. [arXiv](https://arxiv.org/abs/2205.14135), [OpenReview PDF](https://openreview.net/pdf?id=H4DqfPSibmx).

[^online-softmax]: Maxim Milakov and Natalia Gimelshein, "Online Normalizer Calculation for Softmax," arXiv, 2018. [arXiv](https://arxiv.org/abs/1805.02867).

[^rabe-staats]: Markus N. Rabe and Charles Staats, "Self-attention Does Not Need O(n^2) Memory," arXiv, 2021, revised 2022. [arXiv](https://arxiv.org/abs/2112.05682).

[^flash2]: Tri Dao, "FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning," arXiv, 2023. [arXiv](https://arxiv.org/abs/2307.08691).

[^flash2-blog]: Tri Dao, "FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning," Hazy Research blog, July 17, 2023. [Hazy Research](https://hazyresearch.stanford.edu/blog/2023-07-17-flash2).
