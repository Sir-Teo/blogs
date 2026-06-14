---
layout: post
title: "A Copy Machine Small Enough to See"
description: "Instead of treating in-context learning as magic, build a browser-sized induction circuit that finds a repeated pattern and copies what followed it."
date: 2026-06-13 01:27:00 -0400
categories: machine-learning
tags: [mechanistic-interpretability, transformers, induction-heads, in-context-learning, attention]
excerpt: "A tiny attention circuit can turn the prompt into a lookup table. It is not a language model, and that is exactly why the mechanism stays visible."
---

I want to build a machine small enough that it cannot hide.

Not a language model. Not a trained transformer. Just the smallest browser-sized
object that makes one piece of in-context learning feel mechanical.

The trick is this:

```text
... red moon fish ... red moon ?
```

If earlier in the prompt the pair `red moon` was followed by `fish`, then a
useful next-token guess after the second `red moon` is `fish`. A model that does
this is not retrieving a fact from weights. It is using the prompt as temporary
memory.

Transformer Circuits calls one version of this behavior an induction head:
an attention head that recognizes a repeated pattern and copies the token that
came after the earlier occurrence.[^olsson] In its simplest slogan:

$$
[A][B] \ldots [A] \rightarrow [B].
$$

The slogan is almost too small. Good. Small enough means we can put it under
glass.

## The Lookup You Can See

The transformer paper introduced scaled dot-product attention as a way to map
queries, keys, and values into a weighted average of values.[^vaswani]

$$
\operatorname{Attention}(Q,K,V)
=
\operatorname{softmax}\left(\frac{QK^\top}{\sqrt{d}}\right)V.
$$

In a trained model, $$Q$$, $$K$$, and $$V$$ are learned projections of residual
stream activations. In this post, I will cheat. I will hand-code a tiny attention
score so we can see the algorithm without waiting for training:

```text
score(position j)
  = current-token match
  + prefix-token match
  + a small recency bias
```

The value at position $$j$$ is the token after $$j$$. If the current query is
`red moon`, then positions where the prompt previously contained `red moon`
receive high attention, and the value copied from that position is whatever
came next.

This is not meant to be a faithful implementation of a particular model. It is
a glass box version of a circuit motif. The Transformer Circuits framework makes
this kind of decomposition useful by studying attention-only transformers and
asking what algorithms individual heads can implement.[^framework]

## The Prompt Trapdoor

The lab below creates a synthetic sequence.

It first chooses a hidden rule:

```text
prefix current -> target
```

For example:

```text
red moon -> fish
```

Then it scatters several demonstrations of that rule into a longer stream. It
also adds distractors: places where `moon` is followed by something other than
`fish`. The query at the end is `red moon`, and the model must guess the next
token.

Three predictors compete:

- **unigram prior:** guess the most common token in the context;
- **copy current:** find previous `moon` tokens and copy what followed them;
- **induction:** find previous `red moon` pairs and copy what followed them.

The difference between the second and third predictor is the whole point. The
current token alone can be ambiguous. The short prefix turns a noisy lookup into
a more specific one.

<div class="induction-lab" data-induction-lab>
  <div class="induction-lab__controls">
    <label>
      Vocabulary: <output data-value="vocab">16</output>
      <input type="range" min="8" max="28" value="16" data-param="vocab">
    </label>
    <label>
      Context length: <output data-value="length">72</output>
      <input type="range" min="36" max="120" step="4" value="72" data-param="length">
    </label>
    <label>
      Demonstrations: <output data-value="demos">5</output>
      <input type="range" min="1" max="12" value="5" data-param="demos">
    </label>
    <label>
      Distractors: <output data-value="distractors">16</output>
      <input type="range" min="0" max="24" value="16" data-param="distractors">
    </label>
    <label>
      Prefix strength: <output data-value="prefix">100%</output>
      <input type="range" min="0" max="160" step="5" value="100" data-param="prefix">
    </label>
    <label>
      Temperature: <output data-value="temperature">0.55</output>
      <input type="range" min="20" max="160" value="55" data-param="temperature">
    </label>
  </div>
  <div class="induction-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="520" aria-label="Tiny induction head simulation showing prompt tokens, attention weights, and predictor accuracy"></canvas>
  <div class="induction-lab__legend">
    <span><i style="background:#0f766e"></i> Induction predictor</span>
    <span><i style="background:#b45309"></i> Copy-current predictor</span>
    <span><i style="background:#2563eb"></i> Query tokens</span>
    <span><i style="background:#7c3aed"></i> Attention mass</span>
  </div>
  <p class="induction-lab__note">
    Deterministic synthetic experiment. Each setting evaluates 240 generated
    prompts and redraws one representative prompt with its attention weights.
  </p>
</div>
<script defer src="{{ '/assets/js/induction-head-lab.js' | relative_url }}"></script>

Try breaking it.

Turn prefix strength to zero. The induction predictor becomes almost the same
as the current-token copy rule, so distractors matter much more. Increase
distractors. The current-token rule gets confused because the token after
`moon` is no longer stable. Raise the temperature. Attention spreads out, and
the copied answer becomes less decisive. Lower demonstrations to one. The
circuit can still work, but it has no redundancy.

This is the feeling I wanted: in-context learning as a data structure. The
prompt contains little records. Attention searches the records. The value path
copies an answer out.

## Keep the Claim Small

This toy circuit does not prove that all in-context learning is induction. It
does not contain MLPs, learned embeddings, multiple layers, semantic features,
optimizer dynamics, or long-horizon reasoning. Real models can do many things
that this toy cannot.

Olsson et al. are careful about that distinction. They give strong causal
evidence for induction heads in small attention-only models, and more
correlational evidence in larger models with MLPs.[^olsson] Later work continues
to debate which heads matter, when they matter, and how semantic variants of
induction behave. The safe claim is not "this explains transformers." The safe
claim is "this is one concrete algorithm transformers can learn."

That is still useful. Mechanistic interpretability becomes less mystical when
the target is an algorithm one can implement in a few lines. A circuit is not a
vibe. It should have inputs, intermediate quantities, outputs, failure modes,
and ablations.

## A Habit for Tiny Circuits

When a model succeeds on a few-shot prompt, ask a blunt question:

```text
Which earlier token, span, example, or latent feature did the answer come from?
```

Sometimes the answer may be "nowhere obvious." But when it is a copy, a lookup,
a nearest-neighbor effect, or a repeated template, the answer should leave a
trace. Induction heads are one trace: attention pointing to the earlier place
where the current pattern already happened.

The next useful lab would not be larger for its own sake. It would add just one
complication at a time: noisy embeddings, two competing rules, semantic aliases,
multiple heads, then a learned version trained from scratch. The point is to
keep the phenomenon visible while adding reality.

Small machines are good teachers. They do not explain everything. They explain
one thing without hiding behind scale.

## Where This Came From

[^vaswani]: Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Lukasz Kaiser, and Illia Polosukhin, "Attention Is All You Need," NeurIPS 2017. [arXiv](https://arxiv.org/abs/1706.03762).

[^framework]: Nelson Elhage, Neel Nanda, Catherine Olsson, Tom Henighan, Nicholas Joseph, Ben Mann, Amanda Askell, Yuntao Bai, Anna Chen, Tom Conerly, Nova DasSarma, Dawn Drain, Deep Ganguli, Zac Hatfield-Dodds, Danny Hernandez, Andy Jones, Jackson Kernion, Liane Lovitt, Kamal Ndousse, Dario Amodei, Tom Brown, Jack Clark, Jared Kaplan, Sam McCandlish, and Chris Olah, "A Mathematical Framework for Transformer Circuits," 2021. [Transformer Circuits](https://transformer-circuits.pub/2021/framework/index.html).

[^olsson]: Catherine Olsson, Nelson Elhage, Neel Nanda, Nicholas Joseph, Nova DasSarma, Tom Henighan, Ben Mann, Amanda Askell, Yuntao Bai, Anna Chen, Tom Conerly, Dawn Drain, Deep Ganguli, Zac Hatfield-Dodds, Danny Hernandez, Scott Johnston, Andy Jones, Jackson Kernion, Liane Lovitt, Kamal Ndousse, Dario Amodei, Tom Brown, Jack Clark, Jared Kaplan, Sam McCandlish, and Chris Olah, "In-context Learning and Induction Heads," 2022. [Transformer Circuits](https://transformer-circuits.pub/2022/in-context-learning-and-induction-heads/index.html), [arXiv](https://arxiv.org/abs/2209.11895).
