---
layout: post
title: "The Memory Chooses Its Decay"
description: "Mamba-style state-space models are recurrent, but the important move is selectivity: the update rule can decide which tokens write, which tokens fade, and which tokens pass through."
date: 2026-06-16 21:38:00 -0400
categories: machine-learning
tags: [mamba, state-space-models, selective-scan, sequence-modeling, transformers, recurrent-neural-networks, parallel-scan, machine-learning]
excerpt: "A fixed recurrence forgets by schedule. A selective state-space model makes the schedule depend on the token."
---

The old recurrent promise was beautiful:

```text
read one token
update a fixed-size state
repeat
```

No growing key-value cache. No quadratic attention matrix. Just a state moving
through time.

The old recurrent disappointment was also beautiful, in the tragic sense:

```text
the state has to remember everything
```

If the model compresses the past too aggressively, a fact disappears before the
query arrives. If it updates too eagerly, distractors overwrite the thing that
mattered. Transformers avoided that bargain by storing many past vectors and
letting the query look back. That is powerful, but the stored context grows with
sequence length.

Mamba-style state-space models reopen the recurrent bargain with a small but
important change:

```text
the memory chooses its decay
```

The coefficients of the recurrence are allowed to depend on the current token.
That is the "selective" in selective state-space model.

## The Recurrence

A simple discrete state-space model looks like:

$$
h_t = A h_{t-1} + B x_t,
$$

$$
y_t = C h_t.
$$

If $$A$$, $$B$$, and $$C$$ are fixed through time, the model is linear
time-invariant. That case has a useful second life: it can be evaluated as a
convolution. This is one reason structured state-space models such as S4 became
interesting for long sequences.[^s4]

But language is not time-invariant.

The token `the` should usually not overwrite a name. A closing parenthesis may
need to interact with a previous opening parenthesis. A user ID might deserve to
survive hundreds of tokens; a filler adjective might not. A fixed decay schedule
is too polite. It treats the stream as if importance were stationary.

Mamba's key move is to make the SSM parameters input-dependent. In the original
Mamba paper, Gu and Dao describe selectivity as letting the model filter out
irrelevant information and remember relevant information, while still using a
hardware-aware scan rather than materializing a huge state tensor.[^mamba]

For a scalar toy version, write:

$$
h_t = a_t h_{t-1} + b_t x_t.
$$

When $$a_t$$ is near 1 and $$b_t$$ is near 0, the model mostly carries memory
forward. When $$a_t$$ is small and $$b_t$$ is large, the model overwrites memory
with the current token.

That is the whole personality change.

## A Selective Scan Lab

The lab below creates a toy copy task. There is a marked value in the sequence,
a long run of distractor tokens, and a query near the end. A fixed-decay
recurrence updates at the same rate for nearly every token. A selective
recurrence uses a large update gate on marked tokens and a tiny update gate on
distractors.

The default run has 128 tokens. The target is at position `70`; the query is at
position `122`; the gap is `52` tokens. The fixed recurrence misses the target
by about `0.951`. The selective recurrence misses by about `0.040`. Both paths
are also recomputed through an associative scan of affine maps, and the default
scan mismatch is exactly `0`.

<style>
  .ss-lab {
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

  .ss-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
    margin-bottom: 1rem;
  }

  .ss-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .ss-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .ss-lab input {
    accent-color: #0f766e;
    width: 100%;
  }

  .ss-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .ss-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .ss-lab__metric span,
  .ss-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .ss-lab__metric span {
    display: block;
  }

  .ss-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .ss-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .ss-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="selective-scan-lab" class="ss-lab" data-selective-scan-lab>
  <div class="ss-lab__controls">
    <label>
      Length: <output data-value="length">128 tokens</output>
      <input type="range" min="64" max="192" step="8" value="128" data-param="length">
    </label>
    <label>
      Query gap: <output data-value="gap">52 tokens</output>
      <input type="range" min="8" max="104" step="1" value="52" data-param="gap">
    </label>
    <label>
      Fixed half-life: <output data-value="halfLife">18 tokens</output>
      <input type="range" min="6" max="80" step="1" value="18" data-param="halfLife">
    </label>
    <label>
      Selectivity: <output data-value="selectivity">96%</output>
      <input type="range" min="0" max="100" step="1" value="96" data-param="selectivity">
    </label>
    <label>
      Seed: <output data-value="seed">73</output>
      <input type="range" min="1" max="997" step="1" value="73" data-param="seed">
    </label>
  </div>
  <div class="ss-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="620" aria-label="Selective scan lab comparing fixed and selective recurrent memory, influence at a query, and affine scan composition"></canvas>
  <p class="ss-lab__note">
    Deterministic browser experiment. The toy recurrence is scalar so the gates
    and scan are inspectable; real selective SSMs use learned projections,
    higher-dimensional states, fused kernels, and trained readouts.
  </p>
</div>
<script defer src="{{ '/assets/js/selective-scan-lab.js?v=20260616a' | relative_url }}"></script>

Move **Selectivity** down.

The green trajectory starts behaving like the purple one. It writes too weakly
when the marked value appears and lets distractors leak into the state. Move
**Query gap** up. A fixed half-life becomes painful: the value is not wrong
because the query is hard; it is wrong because the state followed a clock.

The bottom-right panel is the computation trick. Each step

$$
h \mapsto a_t h + b_t x_t
$$

is an affine map. Represent it as a pair:

$$
(a_t, u_t), \quad u_t=b_t x_t.
$$

Composing two maps is associative:

$$
(a_2,u_2) \circ (a_1,u_1) =
(a_2 a_1,\; a_2 u_1 + u_2).
$$

That means the recurrence can be parallelized with a scan. The model is
recurrent in meaning, but the training-time computation does not have to be a
one-token-at-a-time loop. Blelloch's prefix-sum work is the classical reference
for this kind of all-prefix operation.[^blelloch]

The lab's scan is deliberately tiny. Mamba's implementation problem is the
serious version: avoid writing expanded states through slow memory, fuse the
discretization, scan, and output projection, and recompute intermediate states
when useful. The public `selective_scan_ref` in the Mamba repository shows the
plain recurrence; the optimized path is built to make that recurrence fast on
modern accelerators.[^mamba-code]

## The Mask Hidden Inside The Recurrence

Unroll the scalar recurrence:

$$
h_t =
\sum_{j \le t} b_j x_j
\left(\prod_{k=j+1}^{t} a_k\right).
$$

The formatting hides a simple object: every earlier token contributes to the
current state with a product of all the intervening decays. If the gates after a
marked token stay near 1 for carry and near 0 for overwrite, that token can
survive. If a later token opens the write gate, the old token is erased.

This is an attention-like story without a stored attention matrix.

Attention says:

```text
for this query, compare against stored keys and mix stored values
```

A selective recurrence says:

```text
while reading the stream, decide what enters the state and how long it persists
```

The Mamba-2 paper makes this connection formal through structured state-space
duality. Dao and Gu connect SSMs and variants of attention through structured
semiseparable matrices, and use that view to design a faster Mamba-2 core
layer.[^mamba2] In the toy scalar recurrence, the lower-triangular influence
matrix is already visible: entry $$(t,j)$$ is the product of the decays between
$$j$$ and $$t$$, times the write strength at $$j$$.

That is not softmax attention. It is not trying to be. It is a compressed,
structured memory map.

## The Bottleneck Is The Feature

A Transformer context grows.

A recurrent state does not.

That fixed-size state is the advantage and the wound. It makes autoregressive
inference cheap per token because there is no KV cache growing with the
sequence. It also forces the model to compress the past. If a task needs exact
access to many independent old facts, the recurrence has to store enough
statistics to answer later. Sometimes it can. Sometimes it cannot.

This is why "linear-time model beats Transformer" is the wrong headline.

The real question is:

```text
what kind of memory does the task need?
```

State-space models are attractive when the past can be summarized into a
moderate state that evolves predictably. Attention is attractive when the model
benefits from direct pairwise access to many previous positions. Hybrids are
attractive because real language asks for both.

## The 2026 Turn

Mamba-3 is interesting because it does not merely say "make the recurrence
bigger." The March 2026 paper frames the next step as state-space engineering:
an exponential-trapezoidal discretization, complex-valued state updates for
richer state tracking, and a multi-input multi-output formulation aimed at
better inference efficiency.[^mamba3] The official repository now exposes
Mamba-3 modules alongside Mamba and Mamba-2.[^mamba-repo]

That matters because it moves the discussion away from architecture slogans.

The hard questions are becoming more specific:

- Which discretization gives the state the right dynamics?
- When should the transition be scalar, diagonal, complex, or richer?
- How much state is enough for retrieval and state tracking?
- Which parts should use recurrence and which parts still need attention?
- Can the kernel keep arithmetic units busy instead of just moving memory?

That last question is not cosmetic. Mamba's original paper emphasized that a
theoretically linear scan still has to respect the GPU memory hierarchy. Mamba-2
then used the SSD view to get more matrix-multiplication-friendly algorithms.
Mamba-3 pushes from an inference-first angle.

The math and the machine are negotiating.

## What The Lab Is Not

The lab is not a Mamba implementation.

It hand-codes gates. Mamba learns them. It uses one scalar state. Real models
use many channels and learned projections. It uses a toy copy task. Language
models need syntax, semantics, retrieval, calibration, and robustness. It draws
the scan in JavaScript. Production kernels are written to avoid expensive
traffic between memory levels.

The lab is only trying to isolate the idea:

```text
fixed recurrence: forget by schedule
selective recurrence: forget by content
scan: compute recurrence prefixes in parallel because affine maps compose
```

That is enough to make the architecture feel less mysterious.

The model is not storing the past as a shelf of old tokens. It is continuously
renegotiating a state. Every token asks:

```text
do I write?
do I preserve?
do I erase?
```

The answer is the memory.

## Paper Trail

[^s4]: Albert Gu, Karan Goel, and Christopher Re, ["Efficiently Modeling Long Sequences with Structured State Spaces"](https://arxiv.org/abs/2111.00396), ICLR 2022.

[^mamba]: Albert Gu and Tri Dao, ["Mamba: Linear-Time Sequence Modeling with Selective State Spaces"](https://arxiv.org/abs/2312.00752), ICLR 2024. The paper describes input-dependent SSM parameters, a hardware-aware scan, linear scaling in sequence length, and constant-time autoregressive inference state.

[^blelloch]: Guy E. Blelloch, ["Prefix Sums and Their Applications"](https://www.cs.cmu.edu/~scandal/papers/CMU-CS-90-190.html), CMU-CS-90-190, 1990. PDF: [CMU mirror](https://www.cs.cmu.edu/~guyb/papers/Ble93.pdf).

[^mamba-code]: State Spaces Mamba repository, [`selective_scan_interface.py`](https://github.com/state-spaces/mamba/blob/main/mamba_ssm/ops/selective_scan_interface.py). The reference path updates `x = deltaA * x + deltaB_u` in a time loop; optimized kernels avoid the naive materialization pattern.

[^mamba2]: Tri Dao and Albert Gu, ["Transformers are SSMs: Generalized Models and Efficient Algorithms Through Structured State Space Duality"](https://arxiv.org/abs/2405.21060), ICML 2024.

[^mamba3]: Aakash Lahoti, Kevin Y. Li, Berlin Chen, Caitlin Wang, Aviv Bick, J. Zico Kolter, Tri Dao, and Albert Gu, ["Mamba-3: Improved Sequence Modeling using State Space Principles"](https://arxiv.org/abs/2603.15569), ICLR 2026. OpenReview PDF: [Mamba-3](https://openreview.net/pdf?id=HwCvaJOiCj).

[^mamba-repo]: State Spaces, ["Mamba SSM architecture"](https://github.com/state-spaces/mamba). The repository documents Mamba, Mamba-2, SSD minimal code, and Mamba-3 usage.
