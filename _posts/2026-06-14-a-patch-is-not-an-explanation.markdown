---
layout: post
title: "Patching Activations Without Fooling Yourself"
description: "Activation patching is a real causal intervention, but a restored logit is evidence about a contrast, a metric, and a patch site. It is not automatically a circuit."
date: 2026-06-14 13:58:00 -0400
categories: machine-learning
tags: [mechanistic-interpretability, activation-patching, causal-tracing, transformers, causal-mediation]
excerpt: "Activation patching can move a model from a corrupted answer back toward a clean answer. The trap is treating that restoration as the whole explanation."
---

There is a small ritual in mechanistic interpretability that feels almost
scientific enough to be dangerous.

Run the model on a clean prompt. Cache an activation. Run the model on a
corrupted prompt. Replace one internal state with the clean one. If the answer
comes back, color the component red on a heatmap.

The result is compelling because it is not merely observational. A probe says
"this information is present." Attention patterns say "this token attended
there." A patch changes the computation.

That is why activation patching matters.

It is also why it is easy to overread.

```text
a patch is an intervention, not an explanation
```

The intervention can be decisive and still answer a narrower question than the
one we want. It tells us that replacing this activation, in this clean/corrupt
contrast, under this metric, changes the output in this way. It does not by
itself prove minimality, rule out redundant paths, identify the right feature
basis, or show that the patched state is on the distribution the downstream
network normally sees.

This post is a toy microscope for that gap.

## The Three-Run Argument

The common denoising version of activation patching has three runs:

1. a **clean run** $$x_{\mathrm{clean}}$$ that produces the behavior of
   interest;
2. a **corrupt run** $$x_{\mathrm{corr}}$$ where a controlled input change
   breaks or changes the behavior;
3. a **patched run** where one activation in the corrupt run is overwritten
   with the corresponding activation from the clean run.

For a target answer $$a$$ and a foil $$b$$, a common metric is logit difference:

$$
\Delta(x) = \ell_a(x) - \ell_b(x).
$$

The normalized recovery of a patch is

$$
R
=
\frac{\Delta_{\mathrm{patched}}-\Delta_{\mathrm{corr}}}
{\Delta_{\mathrm{clean}}-\Delta_{\mathrm{corr}}}.
$$

If $$R=1$$, the patch restored the clean metric. If $$R=0$$, it did nothing by
this metric. If $$R<0$$ or $$R>1$$, the patch pushed the model away from the
clean behavior or overshot it.

This style of experiment connects naturally to causal mediation analysis. Vig
et al. explicitly framed neural components as mediators in causal paths from
input to output, applying the method to gender bias in pretrained language
models.[^vig] ROME's causal tracing used a related restore-a-state experiment:
corrupt a factual computation, restore individual states, and locate where
information about a factual association appears to flow.[^rome]

The method became especially vivid in circuit work. Wang et al.'s IOI paper
used causal interventions among several tools to reverse-engineer a 26-head
circuit in GPT-2 small for indirect object identification, while evaluating the
explanation with faithfulness, completeness, and minimality criteria.[^ioi]

Those criteria are the part worth lingering on. A colorful patch map is not the
same thing as a complete circuit explanation. It is evidence one can use while
building and testing such an explanation.

## A Tiny Patch Lab

The lab below is a deliberately small residual computation. It has a clean
input where the correct logit difference is positive and a corrupted input
where it is negative. Information flows through:

- `S`, a source residual state that carries the task variable and a nuisance
  variable;
- `M`, an internal mediator that mostly carries the task-relevant feature;
- `B`, a backup path that can also support the answer;
- `C`, a competing/copy path;
- `G`, the merge site that turns contributions into a logit difference.

You can patch whole nodes, individual feature coordinates, or direct paths into
the merge site. The toy has ground truth, so it can also report a consistency
penalty: how far a patched internal state is from what the corrupt upstream
parents would normally have produced.

<div class="activation-patching-lab" data-activation-patching-lab>
  <div class="activation-patching-lab__controls">
    <label>
      Mediator strength: <output data-value="mediator">1.00</output>
      <input type="range" min="20" max="180" step="5" value="100" data-param="mediator">
    </label>
    <label>
      Direct shortcut: <output data-value="shortcut">0.45</output>
      <input type="range" min="0" max="150" step="5" value="45" data-param="shortcut">
    </label>
    <label>
      Nuisance carry: <output data-value="nuisance">0.70</output>
      <input type="range" min="0" max="160" step="5" value="70" data-param="nuisance">
    </label>
    <label>
      Backup path: <output data-value="backup">0.35</output>
      <input type="range" min="0" max="140" step="5" value="35" data-param="backup">
    </label>
    <label>
      Residual mixing: <output data-value="mixing">45%</output>
      <input type="range" min="0" max="100" step="5" value="45" data-param="mixing">
    </label>
    <label>
      Saturation: <output data-value="saturation">70%</output>
      <input type="range" min="0" max="160" step="5" value="70" data-param="saturation">
    </label>
  </div>
  <div class="activation-patching-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="650" aria-label="Activation patching lab showing whole-node patch recovery, path patch recovery, logit difference, and off-manifold consistency penalty"></canvas>
  <div class="activation-patching-lab__legend">
    <span><i style="background:#0f766e"></i> Whole-node patch</span>
    <span><i style="background:#2563eb"></i> Path patch</span>
    <span><i style="background:#7c3aed"></i> High or overshooting recovery</span>
    <span><i style="background:#b45309"></i> Partial recovery</span>
  </div>
  <p class="activation-patching-lab__note">
    Deterministic synthetic experiment. `S` and `G` are shown as controls:
    patching the input-like source or the final merge site can trivially restore
    behavior. The headline "best node patch" excludes those bookends and reports
    the strongest internal whole-node patch.
  </p>
</div>
<script defer src="{{ '/assets/js/activation-patching-lab.js?v=20260614a' | relative_url }}"></script>

Start with the defaults. `M` is the strongest internal node patch, but the
direct `M->G` path patch is smaller. That is the first warning. Patching the
whole mediator state restores both the task feature and whatever else happens
to be bundled in the same activation. The path patch asks a narrower question:
how much of the behavior comes from this specific contribution into the merge
site?

Now raise **nuisance carry** and **direct shortcut**. The direct/nuisance share
increases. Some node patches look more impressive because the clean activation
contains correlated baggage. The patch is not lying. It really changes the
output. But the interpretation changes from "this component implements the
task" to "this component contains enough of the clean/corrupt difference to
restore the metric."

Raise **backup path**. The mediator becomes less visually dominant because
another route can partially do the job. This is the OR-gate problem in toy
form. If two paths are sufficient substitutes, noising one path in a clean run
may look mild because the other path compensates; denoising one path in a
corrupt run may look strong because either route can rescue part of the answer.

Finally raise **saturation**. The logit metric becomes less linear. A patch
that changes an internal preactivation by a modest amount can produce a
disproportionate movement in the output, or no visible movement if the merge
site is saturated. The intervention remains causal, but the metric has become a
nonlinear lens.

## What the Patch Actually Claims

A useful patching result has a grammar:

```text
In this prompt pair, replacing activation A at site i from source run s into
destination run d changes metric m by amount r.
```

Every noun matters.

**Prompt pair.** Activation patching is contrastive. It locates machinery
responsible for the difference between the clean and corrupted inputs. If the
corrupt prompt changes subject, language, syntax, position, and answer type at
once, the patch can restore any mixture of those differences. Heimersheim and
Nanda emphasize this prompt-choice sensitivity directly: patching evidence is
scoped to the prompt distributions used.[^heimersheim]

**Site.** Patching a residual stream, an attention head output, an MLP output,
one token position, one feature direction, or one path are different
interventions. Low-granularity patches are good scouts. They are not usually
the final claim.

**Source and destination.** Clean-to-corrupt denoising asks what is sufficient
to restore behavior. Corrupt-to-clean noising asks what is necessary to break
behavior. These are not equivalent in circuits with AND gates, OR gates,
backup heads, or negative components. The best-practices literature stresses
that methodological choices can lead to different localization conclusions.[^zhang]

**Metric.** Logit difference, log probability, probability, rank, accuracy, and
KL divergence can disagree. A component can restore the chosen answer while
distorting the rest of the distribution. A full-circuit claim needs a metric
that matches the behavior being explained.

The patch is not "the explanation." It is an experimental result with a
well-defined scope.

## Why Whole-Node Patches Can Mislead

The most intuitive patch is also the most suspicious: replace an entire vector.

An activation vector is a bundle. It may contain the task feature, token
identity, position, language, style, frequency, syntax, cacheable boilerplate,
and several features we do not know how to name. If the clean and corrupt
examples differ along several axes, a whole-vector patch may restore the output
for the wrong reason, or for a mixture of reasons.

There is also a distribution issue. The downstream network was trained on
activations produced by upstream computation. A patched activation from the
clean run can be paired with corrupted upstream and side-channel states that
would not normally co-occur. Sometimes that is exactly the counterfactual one
wants. Sometimes it is an off-manifold chimera.

Path patching is one response. Instead of asking whether a node matters, it
tests a hypothesis about an interaction between components. Goldowsky-Dill et
al. introduce path patching as a way to express and quantitatively test claims
that behaviors are localized to specific paths, refining induction-head
explanations and characterizing GPT-2 behaviors.[^pathpatching]

The toy lab makes the difference visible. The `M` whole-node patch is a large
intervention with a large consistency penalty. The `M->G` path patch is a
narrower intervention. It may recover less of the metric, but it answers a more
specific question.

Specificity is not always better. Sometimes the low-granularity patch is the
right first probe. The mistake is to stop there and name the heatmap a circuit.

## Circuit Evidence Has Shape

The IOI paper is a useful model because it did not merely show patching
heatmaps. It asked whether the proposed circuit was:

- **faithful**, preserving much of the model's behavior;
- **complete**, containing the important pieces;
- **minimal**, not padded with irrelevant pieces.[^ioi]

Those words should be harder to say than "this head lit up."

Faithfulness without minimality can be a copy of the whole model. Minimality
without faithfulness can be a charming story that does not run. Completeness
without robust prompt controls can be a circuit for the artifact in the
corruption scheme rather than the behavior one cared about.

Causal scrubbing pushes the confirmatory version of this mindset: turn an
interpretability hypothesis into a set of resampling interventions that should
preserve behavior, then test whether behavior is actually preserved.[^scrubbing]
That is the right direction philosophically. Explanations should make
counterfactual promises.

## The Research Habit I Want

If I were reading a mechanistic-interpretability result built on patching, I
would want a small ledger beside every heatmap:

- clean and corrupted prompt distributions;
- exact patched object: token, layer, head, MLP, residual stream, feature, or
  path;
- direction of intervention: clean-to-corrupt, corrupt-to-clean, mean ablation,
  zero ablation, or another baseline;
- metric and normalization;
- endpoint controls showing how much recovery is trivially possible;
- granularity sweep from broad node patches to feature or path patches;
- off-distribution checks or resampling controls where feasible;
- redundancy checks for backup paths and negative components;
- faithfulness, completeness, and minimality tests for the proposed circuit.

The ledger sounds fussy, but it is what makes patching scientific rather than
decorative.

Activation patching is one of the best tools we have because it touches the
computation instead of only staring at it. But a good intervention is still a
question. The answer becomes an explanation only after the question is repeated
from enough angles that the surviving mechanism has nowhere vague left to hide.

## Primary Sources

[^vig]: Jesse Vig, Sebastian Gehrmann, Yonatan Belinkov, Sharon Qian, Daniel Nevo, Simas Sakenis, Jason Huang, Yaron Singer, and Stuart Shieber, "Causal Mediation Analysis for Interpreting Neural NLP: The Case of Gender Bias," NeurIPS 2020. [arXiv](https://arxiv.org/abs/2004.12265).

[^rome]: Kevin Meng, David Bau, Alex Andonian, and Yonatan Belinkov, "Locating and Editing Factual Associations in GPT," NeurIPS 2022. [Project page](https://rome.baulab.info/).

[^ioi]: Kevin Wang, Alexandre Variengien, Arthur Conmy, Buck Shlegeris, and Jacob Steinhardt, "Interpretability in the Wild: a Circuit for Indirect Object Identification in GPT-2 small," ICLR 2023. [arXiv](https://arxiv.org/abs/2211.00593), [OpenReview](https://openreview.net/forum?id=NpsVSN6o4ul).

[^heimersheim]: Stefan Heimersheim and Neel Nanda, "How to use and interpret activation patching," 2024. [arXiv](https://arxiv.org/html/2404.15255v1).

[^zhang]: Fred Zhang and Neel Nanda, "Towards Best Practices of Activation Patching in Language Models: Metrics and Methods," ICLR 2024. [OpenReview PDF](https://openreview.net/pdf?id=Hf17y6u9BC).

[^pathpatching]: Nicholas Goldowsky-Dill, Chris MacLeod, Lucas Sato, and Aryaman Arora, "Localizing Model Behavior with Path Patching," 2023. [arXiv](https://arxiv.org/abs/2304.05969).

[^scrubbing]: Lawrence Chan, Adrià Garriga-Alonso, Nicholas Goldowsky-Dill, Ryan Greenblatt, Jenny Nitishinskaya, Ansh Radhakrishnan, Buck Shlegeris, and Nate Thomas, "Causal Scrubbing: a method for rigorously testing interpretability hypotheses," 2022. [AI Alignment Forum](https://www.alignmentforum.org/s/h95ayYYwMebGEYN5y), [summary page](https://chanlawrence.me/publication/chan-2022-causal/).
