---
layout: post
title: "The Mask Is a Second Clock"
description: "Discrete diffusion language models make generation a schedule over unknown tokens, not just a left-to-right stream. The hard part is deciding what can safely be unmasked together."
date: 2026-06-15 09:10:00 -0400
categories: ai-systems
tags: [diffusion-language-models, discrete-diffusion, masked-diffusion, llms, decoding, inference]
excerpt: "Autoregressive decoding has one obvious clock: token 1, token 2, token 3. Masked diffusion adds another clock: which unknown positions are safe to commit now?"
---

Autoregressive language models made generation feel inevitable.

First token, second token, third token. The model writes the string in the same
order the reader will read it. That order is so convenient that it starts to
look like a law of language.

It is not a law. It is an inference schedule.

By June 2026, diffusion language models are no longer a tiny curiosity off to
the side of the LLM story. They are still not the default way to build language
models, but the research question has sharpened. The question is not "can text
be diffused?" The answer is clearly yes. The better question is:

```text
what changes when generation
order becomes a choice?
```

That choice is the interesting object. A masked diffusion model does not have to
decide token 7 before it has any opinion about token 40. It can draft easy
tokens, fill anchors, revise uncertain regions, and spend more network calls on
the places where the sentence is still underdetermined.

The mask is a second clock.

<div class="callout">
  <strong>Claim:</strong> diffusion language models are not magic parallel
  autoregressive models. They replace a fixed left-to-right dependency order
  with a denoising schedule. The schedule is where the speed, control, and new
  failure modes live.
</div>

## The Absorbing Mask

The easiest discrete diffusion process to picture is brutal: take a clean token
sequence and replace more and more positions with a special mask token.

One version is:

$$
q_t(x_t^\ell \mid x_0^\ell)
=
\alpha_t \mathbf{1}\{x_t^\ell = x_0^\ell\}
+
(1-\alpha_t)\mathbf{1}\{x_t^\ell = [MASK]\}.
$$

At early noise times, most tokens remain visible. At late noise times, nearly
everything is `[MASK]`. The reverse model learns to predict missing tokens from
the visible ones. Sampling runs that process backward: begin with masks, call a
Transformer denoiser, unmask some positions, repeat.

This sounds close to BERT, and historically that is part of the point. BERT
trained bidirectional representations by predicting randomly masked tokens from
left and right context.[^bert] But BERT's masked language modeling objective was
not, by itself, a clean ancestral generative story. Discrete diffusion papers
turned the mask into a time-indexed corruption process with a reverse sampler.

D3PMs made that bridge explicit. Austin, Johnson, Ho, Tarlow, and van den Berg
studied diffusion-like models in discrete state spaces, including absorbing
states that connect diffusion to autoregressive and mask-based generative
models.[^d3pm] Later work attacked the language gap from several directions:
SEDD used score entropy to estimate ratios of the data distribution on discrete
spaces and reported strong GPT-2-scale results;[^sedd] MDLM showed that simple
masked diffusion, with a strong training recipe and a Rao-Blackwellized
objective, was more competitive than earlier diffusion language results
suggested.[^mdlm]

Then the scale claims arrived. LLaDA trained an 8B diffusion language model from
scratch with a forward masking process and reverse masked-token prediction,
reporting performance comparable to self-constructed autoregressive baselines
and strong instruction-following case studies after supervised fine-tuning.[^llada]
Block Diffusion interpolated between autoregressive and diffusion language
models, adding flexible-length generation, KV caching, and parallel token
sampling to reduce some awkwardness of fixed-length denoising.[^block] Mercury
reported commercial-scale diffusion coding models on a speed-quality frontier,
with very high H100 throughput numbers in its report.[^mercury]

Those results should not be collapsed into one slogan. "Diffusion beats
autoregression" is too blunt. The 2026 scaling paper by Sahoo and collaborators
is useful precisely because it refuses that bluntness: perplexity can be
informative within a diffusion family but misleading across diffusion families,
where a worse likelihood curve may still yield a better practical sampler on
the speed-quality frontier.[^scaling]

For autoregressive models, the basic latency unit is hard to miss: one forward
pass per generated token, unless speculation, batching, or architecture tricks
help. For diffusion language models, the unit is slipperier:

```text
network evaluations
x tokens committed per evaluation
x quality after revision
```

That product is the schedule.

## Parallel Is Not The Same As Independent

The first seductive picture is that a diffusion language model predicts all
tokens at once, so generation is parallel. Sometimes that is directionally true.
It is also where intuition can get lazy.

If every masked position were independent given the prompt, parallel unmasking
would be easy. But language is mostly the opposite of that. A variable name
constrains later uses. A closing parenthesis constrains an earlier opening
choice. A proof step constrains the theorem statement and the next lemma. A
piece of code can be locally plausible and globally inconsistent.

When a sampler unmasks many positions in one call, it is not merely saving
time. It is making a bet that those positions can be committed together without
creating contradictions that the model cannot later undo.

Image models ran into a related idea with MaskGIT: generate masked tokens in
parallel, then iteratively refine by confidence.[^maskgit] In language, the
stakes are sharper because a single token can change the grammar, reference
structure, or program behavior of everything around it.

That makes the denoising policy feel less like a decoding detail and more like a
small scheduler:

```text
anchors?
wait for context?
allowed to change?
real uncertainty,
or schedule artifact?
```

The left-to-right scheduler has a virtue that is easy to underappreciate: it is
simple. Once token 12 is written, token 13 conditions on it. There is no
question about whether token 12 and token 13 were mutually compatible at the
moment they were sampled. The price is that token 12 cannot use evidence from
token 40 unless that evidence was already packed into the hidden state through
the prompt and training distribution.

Masked diffusion pays the opposite price. It can use right context and fill
holes naturally, but it must decide how much context exists before it commits
more text.

## A Tiny Packet Decoder

The lab below is a toy. It is intentionally not a language benchmark.

It generates an 18-token packet over an eight-symbol alphabet. Some positions
are payload. Others are mirrors, complements, or modular checksums:

```text
x_17 = x_0
x_13 + x_2 = 7              mod 8
x_8  = x_0 + x_2 + x_4 + 1  mod 8
x_15 = x_8 + x_9 + x_10     mod 8
```

The simulated denoiser has two sources of evidence:

1. a noisy learned prior that sometimes prefers the true token;
2. exact constraint checks when enough neighboring positions are visible.

The point is to isolate schedule behavior. The left-to-right decoder commits
tokens in display order and never revises. The masked decoder predicts all
remaining positions each round and reveals the most confident ones. The repair
decoder runs a few extra constraint-driven passes that may change tense
positions.

With the default seed, the left-to-right decoder finds a perfectly consistent
packet that is only 61% equal to the hidden target. It made early payload errors
and then built a clean world around them. The masked decoder is closer to the
hidden target, but has constraint violations. The repair passes remove those
violations, although they can also move the string toward a different consistent
packet when the anchors are wrong.

That last sentence is the real lesson: consistency is not correctness.

<style>
  .masked-diffusion-lab {
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

  .masked-diffusion-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .masked-diffusion-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .masked-diffusion-lab__controls input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .masked-diffusion-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 1rem 0;
  }

  .masked-diffusion-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .masked-diffusion-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .masked-diffusion-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }

  .masked-diffusion-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .masked-diffusion-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .masked-diffusion-lab__legend span,
  .masked-diffusion-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .masked-diffusion-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    margin-right: 0.35rem;
    vertical-align: -0.06rem;
    width: 0.7rem;
  }

  .masked-diffusion-lab__note {
    margin: 0.7rem 0 0;
  }
</style>

<div class="masked-diffusion-lab" data-masked-diffusion-lab>
  <div class="masked-diffusion-lab__controls">
    <label>
      Packet seed <output data-value="seed">1</output>
      <input type="range" data-param="seed" min="1" max="80" step="1" value="1">
    </label>
    <label>
      Prior hint <output data-value="prior">58%</output>
      <input type="range" data-param="prior" min="20" max="95" step="1" value="58">
    </label>
    <label>
      Model noise <output data-value="noise">44%</output>
      <input type="range" data-param="noise" min="0" max="90" step="1" value="44">
    </label>
    <label>
      Constraint weight <output data-value="constraints">72%</output>
      <input type="range" data-param="constraints" min="0" max="100" step="1" value="72">
    </label>
    <label>
      Denoising steps <output data-value="steps">6</output>
      <input type="range" data-param="steps" min="1" max="16" step="1" value="6">
    </label>
    <label>
      Reveal rate <output data-value="reveal">30%</output>
      <input type="range" data-param="reveal" min="8" max="70" step="1" value="30">
    </label>
    <label>
      Repair passes <output data-value="repair">2</output>
      <input type="range" data-param="repair" min="0" max="6" step="1" value="2">
    </label>
  </div>
  <div class="masked-diffusion-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="730" aria-label="Masked diffusion decoder simulator with token rows, denoising timeline, speed-quality sweep, and constraint ledger"></canvas>
  <div class="masked-diffusion-lab__legend">
    <span><i style="background:#0f766e"></i> Correct token</span>
    <span><i style="background:#be123c"></i> Wrong token</span>
    <span><i style="background:#2563eb"></i> Masked schedule</span>
    <span><i style="background:#7c3aed"></i> Repair schedule</span>
  </div>
  <p class="masked-diffusion-lab__note">
    Deterministic toy model, not an LLM benchmark. The audit grid checks 144
    seeds and settings for finite probabilities, complete decoding, valid
    modular constraints, and metric bounds.
  </p>
</div>
<script defer src="{{ '/assets/js/masked-diffusion-lab.js?v=20260615a' | relative_url }}"></script>

Try three quick perturbations.

First, raise **Reveal rate**. The masked decoder becomes more impatient. It
spends fewer rounds waiting for anchors and starts committing mutually dependent
positions together. Sometimes this is fine; sometimes it locks in a parallel
mistake.

Second, lower **Constraint weight**. The denoiser behaves more like a pure
token prior. If the prior is good, accuracy can remain high. If the prior is
noisy, the packet stops respecting its own checksums. This is the language
analogue of fluent text that cannot keep its references straight.

Third, increase **Repair passes**. Constraint violations often fall, but token
accuracy does not monotonically improve. A repair policy can make the string
more self-consistent around the wrong anchor. That is why "let the model revise"
is not a complete safety story. Revision needs evidence, not just a second
chance.

## What This Changes In Evaluation

Autoregressive evaluation tends to hide the decoding policy because the policy
is usually obvious. Diffusion evaluation cannot afford that convenience.

For a diffusion language model, I want at least five numbers next to any quality
score:

- network evaluations per generated token block;
- tokens committed per evaluation;
- remasked or revised token fraction;
- quality as a function of denoising depth, not only at one chosen depth;
- latency under the actual serving implementation.

The 2026 scaling result makes this nonoptional. If perplexity can mis-rank
diffusion families relative to practical sampling behavior, then a single
likelihood number is not a model comparison. It is one projection of an
inference algorithm.[^scaling]

This also changes what "controllability" should mean. Infilling is not just a
nice editing feature. It is a stress test for whether the model can use
constraints that appear on both sides of a hole. Arbitrary-order generation is
not just a speed hack. It is a claim that the model has learned conditionals
stable enough to survive many possible schedules.

The schedule should be auditable. If a model writes code in a sketch-first
order, I want to see which identifiers were anchors and which were repaired. If
it solves a math problem by filling the conclusion before the derivation, I want
to know whether the derivation later constrained the conclusion or merely
rationalized it. If a sampler commits 64 tokens at once, I want a conflict
ledger for the tokens that became mutually inconsistent.

## A Research Direction: Denoising Policies As Schedulers

The next useful abstraction may not be "diffusion versus autoregressive." It may
be "what scheduler is allowed to touch the text?"

A scheduler could be hand-written, confidence-based, entropy-based, learned by
reinforcement learning, or specialized by domain. Code might want anchors:
function names, types, tests, then bodies. Translation might want phrase blocks.
Proof search might want theorem statement, subgoals, then connective tissue.
Interactive writing might want user-locked spans that never remask.

That suggests a research program I would like to see more of:

1. Treat unmasking as a first-class policy, not a footnote.
2. Benchmark policies under equal network-evaluation budgets.
3. Log revisions and contradictions, not only final samples.
4. Separate "more internally consistent" from "closer to the intended answer."
5. Study schedules that are domain aware without being brittle templates.

This is also where the old masked-language-model intuition returns with a new
job. BERT showed how powerful bidirectional conditioning could be for
representation learning. Diffusion language models ask whether bidirectional
conditioning can also be a scalable generation engine. The answer will depend
less on the word "diffusion" than on the quality of the clock that decides what
to denoise next.

Left-to-right decoding gives time one direction.

Masked diffusion does not remove time. It gives the model another way to spend
it.

[^bert]: Jacob Devlin, Ming-Wei Chang, Kenton Lee, and Kristina Toutanova, ["BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding"](https://arxiv.org/abs/1810.04805), 2018.

[^d3pm]: Jacob Austin, Daniel D. Johnson, Jonathan Ho, Daniel Tarlow, and Rianne van den Berg, ["Structured Denoising Diffusion Models in Discrete State-Spaces"](https://arxiv.org/abs/2107.03006), 2021; revised 2023.

[^sedd]: Aaron Lou, Chenlin Meng, and Stefano Ermon, ["Discrete Diffusion Modeling by Estimating the Ratios of the Data Distribution"](https://arxiv.org/abs/2310.16834), ICML 2024.

[^mdlm]: Subham Sekhar Sahoo et al., ["Simple and Effective Masked Diffusion Language Models"](https://arxiv.org/abs/2406.07524), NeurIPS 2024.

[^llada]: Shen Nie et al., ["Large Language Diffusion Models"](https://arxiv.org/abs/2502.09992), 2025.

[^block]: Marianne Arriola et al., ["Block Diffusion: Interpolating Between Autoregressive and Diffusion Language Models"](https://arxiv.org/abs/2503.09573), ICLR 2025.

[^mercury]: Inception Labs et al., ["Mercury: Ultra-Fast Language Models Based on Diffusion"](https://arxiv.org/abs/2506.17298), 2025.

[^scaling]: Subham Sekhar Sahoo et al., ["Scaling Beyond Masked Diffusion Language Models"](https://arxiv.org/abs/2602.15014), 2026.

[^maskgit]: Huiwen Chang et al., ["MaskGIT: Masked Generative Image Transformer"](https://arxiv.org/abs/2202.04200), 2022.
