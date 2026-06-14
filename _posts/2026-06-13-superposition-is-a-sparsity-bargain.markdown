---
layout: post
title: "Superposition Buys Space With Sparsity"
description: "Why neural networks may store more features than dimensions, why sparse autoencoders help, and why reconstruction error is not the same thing as understanding."
date: 2026-06-13 02:47:00 -0400
categories: machine-learning
tags: [mechanistic-interpretability, sparse-autoencoders, superposition, dictionary-learning, representation-learning]
excerpt: "Superposition is not just a weird interpretability story. It is a budget: sparse features can share dimensions, but they pay in interference, false positives, and feature recovery ambiguity."
---

The cleanest interpretability fantasy is that every neuron has a name.

One neuron for French text. One neuron for bridge openings. One neuron for
quoted sarcasm, protein motifs, SQL injection, moral uncertainty, and the
feeling that a proof step is too convenient. Open the model, read the labels,
debug the machine.

Real networks are less polite. A single neuron can respond to multiple unrelated
contexts, while a single human-readable concept can be spread across many
coordinates. This is the old problem of **polysemanticity**. It is frustrating
because it breaks the simplest microscope: if the unit of inspection is the
neuron, and the neuron is a shared container, then the explanation is already
mixed before we start.

The superposition hypothesis gives a sharper version of that frustration. Maybe
the model has more useful features than it has convenient orthogonal directions.
If most features are inactive on most inputs, the model can store them as
non-orthogonal directions in the same activation space. The benefit is
compression. The cost is interference.[^toy]

This post is a small lab for that bargain.

It is not a trained language model. It is not a sparse autoencoder trained on
Claude, GPT-4, Pythia, or anything else. It is a controlled sparse dictionary
experiment in the browser. The reason to build a toy is that toys can tell the
truth without looking impressive.

## The Bargain

Suppose an activation vector $$x \in \mathbb{R}^d$$ is built from a sparse set
of latent features:

$$
x = D z + \epsilon.
$$

The columns of $$D$$ are feature directions. The coefficient vector $$z$$ is
sparse: most entries are zero for a given input. The noise term $$\epsilon$$
stands in for everything the toy omits.

If the number of possible features $$m$$ is less than or equal to the number of
dimensions $$d$$, life can be easy. Give every feature its own nearly orthogonal
direction. Read off the active coefficients. Interpretability looks like
coordinate inspection.

The interesting regime is $$m > d$$. There are more possible features than
dimensions. Orthogonality is no longer available for everyone. Some feature
directions must overlap:

$$
\langle D_i, D_j \rangle \neq 0.
$$

That overlap is not automatically fatal. If features are sparse enough, two
overlapping features may rarely activate together. The model can use a shared
space because the input distribution usually asks for only a few features at a
time. This is the same kind of logic that makes sparse coding and compressed
representation useful in signal processing and neuroscience: natural data often
has many possible causes, but only a small active subset in any given scene.[^olshausen]

The catch is that the decoder must now separate true signal from spillover. A
feature can look active because it is active, or because a correlated neighbor
is active and leaked score into it. Superposition therefore changes the question
from:

```text
What does this coordinate mean?
```

to:

```text
Which sparse set of directions best explains this activation?
```

That is a different kind of object. It is not a labeled axis. It is an inverse
problem.

## A Tiny Recovery Lab

The lab below makes an overcomplete dictionary, samples sparse feature vectors,
constructs activations, and then tries to recover the active features with a
simple positive matching-pursuit decoder. The chart shows the feature
directions, their pairwise interference, usage across latents, and a threshold
sweep.

The most important sliders:

1. **Features / dimensions** controls how aggressively the toy overbooks the
   space.
2. **Active density** controls how many features tend to be present together.
3. **Cluster overlap** makes feature directions more correlated.
4. **Threshold** decides how much score is required before a latent is treated
   as active.
5. **Top k** is the decoder's sparsity budget.

<div class="superposition-lab" data-superposition-lab>
  <div class="superposition-lab__controls">
    <label>
      Features: <output data-value="features">18</output>
      <input type="range" min="6" max="42" step="2" value="18" data-param="features">
    </label>
    <label>
      Dimensions: <output data-value="dims">8</output>
      <input type="range" min="2" max="18" step="1" value="8" data-param="dims">
    </label>
    <label>
      Active density: <output data-value="density">7%</output>
      <input type="range" min="2" max="34" step="1" value="7" data-param="density">
    </label>
    <label>
      Cluster overlap: <output data-value="cluster">18%</output>
      <input type="range" min="0" max="95" step="5" value="18" data-param="cluster">
    </label>
    <label>
      Noise: <output data-value="noise">6%</output>
      <input type="range" min="0" max="40" step="1" value="6" data-param="noise">
    </label>
    <label>
      Threshold: <output data-value="threshold">0.28</output>
      <input type="range" min="0" max="110" step="2" value="28" data-param="threshold">
    </label>
    <label>
      Top k: <output data-value="topK">4</output>
      <input type="range" min="1" max="10" step="1" value="4" data-param="topK">
    </label>
  </div>
  <div class="superposition-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="640" aria-label="Sparse dictionary superposition simulation showing feature recovery and interference"></canvas>
  <div class="superposition-lab__legend">
    <span><i style="background:#0f766e"></i> Recovered often</span>
    <span><i style="background:#be123c"></i> Missed or confused</span>
    <span><i style="background:#7c3aed"></i> Feature overlap</span>
    <span><i style="background:#b45309"></i> F1 recovery</span>
  </div>
  <p class="superposition-lab__note">
    Deterministic synthetic experiment. The decoder is deliberately simple:
    score dictionary directions, keep positive scores above a threshold, and
    greedily reconstruct from the selected atoms.
  </p>
</div>
<script defer src="{{ '/assets/js/superposition-lab.js' | relative_url }}"></script>

Try three moves.

First, keep density low and raise the number of features. The model is now
storing more possible causes than dimensions. Recovery often remains tolerable
because most samples use only a few causes. This is the compression side of the
bargain.

Second, raise active density. The same dictionary becomes harder to decode. More
features collide in the same example, so overlap that was harmless in isolation
becomes an error source. This is why sparsity is not decoration. It is the
condition that made sharing legal.

Third, raise cluster overlap. The interference matrix gets hot. Precision tends
to fall because neighboring directions borrow each other's evidence. If you
raise the threshold, precision improves, but recall falls. The threshold did not
solve superposition. It chose which kind of mistake to prefer.

That tradeoff is the point. In an overcomplete representation, understanding is
not just finding directions. It is proving that the directions can be recovered
under the distribution and decision rule you care about.

## Why Sparse Autoencoders Enter the Story

Sparse autoencoders try to learn a dictionary like this from real model
activations. Given an activation $$x$$, the encoder maps it to a sparse latent
vector $$z$$; the decoder reconstructs $$x$$ from those latents:

$$
x \rightarrow z \rightarrow \hat{x}.
$$

The hope is not merely compression. The hope is that the sparse latents are
closer to the model's real features than the original neuron basis. That hope
became concrete in language-model interpretability when Cunningham et al. showed
that sparse autoencoders trained on residual-stream activations could produce
more interpretable and monosemantic features than several alternatives, and
could support more precise interventions on the indirect object identification
task.[^cunningham]

Anthropic's monosemanticity work pushed the same idea further: use dictionary
learning to find feature directions that are more useful units of analysis than
individual neurons.[^bricken] Scaling work then asked whether the method
survives contact with frontier-sized activations. Anthropic reported sparse
autoencoders with up to 34 million features on Claude 3 Sonnet's middle-layer
residual stream.[^templeton] OpenAI reported k-sparse autoencoders, scaling
laws over SAE size and sparsity, and a 16 million latent autoencoder trained on
GPT-4 activations over 40 billion tokens.[^gao]

Those are real advances. They are also easy to misread.

A sparse autoencoder is not a truth oracle. It is a learned measuring
instrument. It can miss features. It can split one feature into several latents.
It can merge nearby features. It can produce latents that look interpretable on
top examples but behave badly under interventions. It can improve reconstruction
without improving the feature story one wanted.

The important shift is methodological: interpretability moves from "look at a
neuron" to "train a decomposition, then validate the decomposition."

That second clause carries most of the scientific weight.

## Reconstruction Is Not Understanding

The lab's reconstruction loss is useful, but it is intentionally not the only
metric. A decoder can reconstruct a vector while assigning credit to the wrong
latent causes. In the toy, we have ground truth, so we can measure precision and
recall directly. In a real language model, ground truth features are usually not
available.

This is why SAE evaluation has become its own research problem. Gao et al. argue
that reconstruction and sparsity are not the final objective, and introduce
metrics tied to hypothesized feature recovery, activation-pattern
explainability, and sparse downstream effects.[^gao] Karvonen et al. evaluate
SAEs through targeted concept-erasure tasks, because a useful feature
decomposition should support interventions that remove the intended concept
without breaking everything nearby.[^karvonen] Chanin and Garriga-Alonso's
SynthSAEBench makes the same point with synthetic ground truth: realistic
benchmark data can reveal failures where reconstruction improves while latent
quality does not.[^synth]

The toy version is simple:

```text
low reconstruction error + low feature recall = pretty compression, bad audit
high recall + low precision = every shadow becomes a feature
high precision + low recall = clean labels with missing machinery
```

A serious interpretability claim needs more than one line on this ledger.

## The Canonical-Feature Temptation

There is a very tempting endpoint story:

1. train a huge enough SAE;
2. recover the model's true features;
3. explain the model in those units.

I want this story to be true. It would be lovely if the right autoencoder size
revealed the periodic table of cognition.

But the evidence so far suggests a more pragmatic view. Sparse features may be
useful without being canonical. Leask et al. argue that SAE latents should not
be treated as unique atomic units: larger-SAE latents can decompose into
combinations of smaller-SAE latents, and smaller SAEs can be incomplete.[^canonical]
Anthropic's attribution-graph work makes a related practical move: features are
building blocks for tracing computation, but the authors explicitly warn that
the feature concept remains fuzzy and that interactions between features matter
as much as the inventory itself.[^biology]

This sounds disappointing only if we expected interpretability to hand us the
one true basis.

The better analogy is measurement science. A microscope does not reveal
"reality" without choices. It has magnification, staining, field of view,
resolution limits, artifacts, sample preparation, and a trained human deciding
what the image means. Sparse autoencoders may become microscopes for activation
space. That makes their artifacts more important, not less.

## A Useful Next Experiment

The next experiments I would trust most are not bigger by default. They are more
diagnostic.

I would want a benchmark family where the data generator is known, but not
cartoonishly clean:

1. sparse features with controllable frequency, hierarchy, and correlation;
2. feature directions with controllable coherence;
3. nonlinear downstream computations that depend on only some recovered
   features;
4. nuisance features that reconstruct well but are irrelevant to behavior;
5. distribution shifts that change feature frequency without changing feature
   meaning;
6. interventions that can measure whether a latent is causal, redundant, or
   merely correlated.

Then every SAE recipe would have to report a full ledger:

$$
\text{reconstruction},\quad
\text{sparsity},\quad
\text{feature precision},\quad
\text{feature recall},\quad
\text{causal selectivity},\quad
\text{stability}.
$$

The browser lab is a small piece of that ledger. It lets us change the
overbooking ratio, sparsity, coherence, noise, and decoder budget while watching
the mistakes move around. A richer version would train actual SAE variants
against the same synthetic generator, then compare reconstruction to ground
truth recovery and downstream intervention quality.

That is the direction I find exciting: not "SAEs solve interpretability," and
not "SAEs are fake because the units are imperfect." The useful question is:

```text
Which decomposition is good enough for which intervention?
```

Sometimes we need human-readable labels. Sometimes we need reliable steering.
Sometimes we need circuit discovery. Sometimes we need anomaly monitors. Those
may ask for different dictionaries.

Superposition is a budget. Sparse autoencoders are one way to audit the budget.
The scientific work is to keep the ledger honest.

## Sources

[^toy]: Nelson Elhage, Tristan Hume, Catherine Olsson, Nicholas Schiefer, Tom Henighan, Shauna Kravec, Zac Hatfield-Dodds, Robert Lasenby, Dawn Drain, Carol Chen, Roger Grosse, Sam McCandlish, Jared Kaplan, Dario Amodei, Martin Wattenberg, and Christopher Olah, "Toy Models of Superposition," 2022. [Transformer Circuits](https://transformer-circuits.pub/2022/toy_model/index.html), [arXiv](https://arxiv.org/abs/2209.10652).

[^olshausen]: Bruno A. Olshausen and David J. Field, "Emergence of simple-cell receptive field properties by learning a sparse code for natural images," *Nature* 381, 607-609, 1996. [Nature](https://www.nature.com/articles/381607a0).

[^cunningham]: Hoagy Cunningham, Aidan Ewart, Logan Riggs, Robert Huben, and Lee Sharkey, "Sparse Autoencoders Find Highly Interpretable Features in Language Models," 2023. [arXiv](https://arxiv.org/abs/2309.08600).

[^bricken]: Trenton Bricken, Adly Templeton, Joshua Batson, Brian Chen, Adam Jermyn, Tom Conerly, Nicholas L. Turner, Cem Anil, Carson Denison, Amanda Askell, Robert Lasenby, Yifan Wu, Shauna Kravec, Nicholas Schiefer, Tim Maxwell, Nicholas Joseph, Zac Hatfield-Dodds, Alex Tamkin, Karina Nguyen, Brayden McLean, Josiah E. Burke, Tristan Hume, Shan Carter, Tom Henighan, and Christopher Olah, "Towards Monosemanticity: Decomposing Language Models With Dictionary Learning," 2023. [Transformer Circuits](https://transformer-circuits.pub/2023/monosemantic-features).

[^templeton]: Adly Templeton et al., "Extracting Interpretable Features from Claude 3 Sonnet," 2024. [Transformer Circuits](https://transformer-circuits.pub/2024/scaling-monosemanticity/).

[^gao]: Leo Gao, Tom Dupre la Tour, Henk Tillman, Gabriel Goh, Rajan Troll, Alec Radford, Ilya Sutskever, Jan Leike, and Jeffrey Wu, "Scaling and evaluating sparse autoencoders," 2024. [arXiv](https://arxiv.org/abs/2406.04093), [OpenAI summary](https://openai.com/index/extracting-concepts-from-gpt-4/).

[^karvonen]: Adam Karvonen, Can Rager, Samuel Marks, and Neel Nanda, "Evaluating Sparse Autoencoders on Targeted Concept Erasure Tasks," 2024. [arXiv](https://arxiv.org/abs/2411.18895).

[^synth]: David Chanin and Adria Garriga-Alonso, "SynthSAEBench: Evaluating Sparse Autoencoders on Scalable Realistic Synthetic Data," 2026. [arXiv](https://arxiv.org/abs/2602.14687).

[^canonical]: Patrick Leask, Bart Bussmann, Michael Pearce, Joseph Bloom, Curt Tigges, Noura Al Moubayed, Lee Sharkey, and Neel Nanda, "Sparse Autoencoders Do Not Find Canonical Units of Analysis," 2025. [arXiv](https://arxiv.org/html/2502.04878v1).

[^biology]: Jack Lindsey et al., "On the Biology of a Large Language Model," 2025. [Transformer Circuits](https://transformer-circuits.pub/2025/attribution-graphs/biology.html).
