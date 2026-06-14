---
layout: post
title: "The Prompt Is a Ratio, Not a Command"
description: "Classifier-free guidance is not magic obedience. In the score idealization, the slider raises a conditional-vs-unconditional density ratio and buys fidelity with coverage."
date: 2026-06-14 09:54:00 -0400
categories: machine-learning
tags: [diffusion-models, classifier-free-guidance, score-models, generative-models, density-ratios]
excerpt: "The classifier-free guidance slider tilts a diffusion sampler with a density ratio. Push it too far and you do not simply get more prompt following; you get extrapolation."
---

The most famous knob in image generation is too easy to describe badly.

Turn up guidance and the image follows the prompt. Turn it down and the image
gets more diverse. That folk explanation is useful enough to operate a UI, but
it hides the mechanism. A guidance scale is not a small obedience module bolted
onto a diffusion model. In the score view, it is a vector field made from a
density ratio.

That distinction matters because it explains the personality of the knob. A
little guidance can rescue a weak condition. More guidance can sharpen the
sample and throw away plausible alternatives. Too much guidance can amplify
model error, over-concentrate mass, and make a sampler chase a direction that
was never trained as a probability distribution.

This post is a toy microscope for that fact.

No pictures of castles. No aesthetic ranking. Just two exact probability
densities in two dimensions, their scores, and the vector field obtained by
classifier-free guidance.

## Before the Prompt Becomes a Knob

A diffusion model learns to reverse a noising process. In one common
description, the reverse dynamics need the score

$$
\nabla_x \log p_t(x),
$$

the gradient of the log density of the noisy data distribution at noise level
$$t$$. Ho, Jain, and Abbeel connected denoising diffusion probabilistic models
to denoising score matching, and Song et al. gave the continuous-time
score-based SDE formulation where the reverse process depends on this
time-dependent gradient field.[^ddpm][^score]

For a conditional generator, we would like the score

$$
\nabla_x \log p_t(x \mid c),
$$

where $$c$$ is the class label, text prompt, or other condition.

Classifier guidance reaches this score through Bayes' rule:

$$
\log p_t(x \mid c)
=
\log p_t(x) + \log p_t(c \mid x) - \log p_t(c).
$$

The last term is constant in $$x$$, so its gradient vanishes:

$$
\nabla_x \log p_t(x \mid c)
=
\nabla_x \log p_t(x) + \nabla_x \log p_t(c \mid x).
$$

Dhariwal and Nichol used that idea with a separate classifier: take the
unconditional diffusion score, add a classifier gradient, and trade diversity
for fidelity.[^guided] It worked strikingly well, but it required an auxiliary
classifier that understood noisy images at each diffusion time.

Classifier-free guidance removed the classifier. Ho and Salimans trained one
model to behave both conditionally and unconditionally, usually by randomly
dropping the conditioning signal during training. At sampling time, the model is
queried twice: once with the condition and once without it. The two predictions
are combined.[^cfg]

In score notation, the idealized combination is:

$$
s_w(x)
=
s_u(x) + w(s_c(x)-s_u(x)),
$$

where $$s_u(x)=\nabla_x\log p_t(x)$$ and
$$s_c(x)=\nabla_x\log p_t(x\mid c)$$.

The scale $$w$$ is the guidance knob.

At $$w=0$$, the sampler follows the unconditional model. At $$w=1$$, it follows
the conditional model. At $$w>1$$, it extrapolates past the conditional score.

That last sentence is the hinge.

## The Distribution Hiding Behind the Slider

Assume for a moment that the two scores are exact gradients of exact densities.
Then the guided field is also a gradient:

$$
\begin{aligned}
s_w(x)
&=
\nabla_x \log p_t(x) +
w \nabla_x\left[\log p_t(x\mid c)-\log p_t(x)\right] \\
&=
\nabla_x \log
\left[
p_t(x\mid c)^w p_t(x)^{1-w}
\right].
\end{aligned}
$$

So the implicit guided density is

$$
q_w(x) \propto p_t(x\mid c)^w p_t(x)^{1-w}.
$$

Equivalently,

$$
q_w(x) \propto p_t(x)\left(\frac{p_t(x\mid c)}{p_t(x)}\right)^w.
$$

The knob raises a conditional-vs-unconditional density ratio to a power.

This is why the phrase "more prompt adherence" is too small. High guidance does
not merely prefer samples likely under the prompt. It prefers samples where the
prompt makes the point much more likely than the unconditional model would have
made it. It rewards evidence that is distinctive for the condition.

That can be exactly what one wants. It can also be a narrow target.

If a region is realistic but not especially diagnostic of the prompt, guidance
can suppress it. If a mode is prompt-compatible but weaker than another
prompt-compatible mode, guidance can make the stronger mode swallow the sample
budget. If the learned conditional and unconditional predictions have small
errors, extrapolation can magnify the difference between them.

The toy below lets you see this without the distraction of image aesthetics.

## A Toy Without Castles

The lab has an unconditional distribution made from six Gaussian components:
three prompt components and three background components. The conditional
distribution keeps only the prompt components. Because the densities are
analytic, the lab can compute the unconditional score, conditional score, and
guided score exactly.

The heatmap is the implied guided density $$q_w$$. The arrows are the guided
score field. The paths are deterministic score-ascent traces from noisy starts;
they are not a diffusion sampler, but they show where the vector field wants to
pull probability mass.

The metrics are intentionally distributional:

1. **Prompt alignment** is the guided mass assigned back to the prompt
   components under the unconditional mixture.
2. **Effective area** is entropy area: high when mass is spread, low when it is
   concentrated.
3. **Prompt modes** is the effective number of prompt components still covered.
4. **Peak concentration** reports how sharp the largest grid cell is relative
   to uniform mass.

<style>
  .cfg-lab {
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

  .cfg-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .cfg-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .cfg-lab__controls input {
    accent-color: #7c3aed;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .cfg-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .cfg-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .cfg-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .cfg-lab__metric span,
  .cfg-lab__legend,
  .cfg-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .cfg-lab__metric span {
    display: block;
  }

  .cfg-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .cfg-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 680px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .cfg-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .cfg-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .cfg-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .cfg-lab__note {
    margin: 0.75rem 0 0;
  }

  @media (max-width: 620px) {
    .cfg-lab {
      padding: 0.75rem;
    }

    .cfg-lab__controls {
      grid-template-columns: 1fr;
    }

    .cfg-lab canvas {
      height: 980px;
    }
  }
</style>

<div class="cfg-lab" data-cfg-guidance-lab>
  <div class="cfg-lab__controls">
    <label>
      Guidance scale <output data-value="guidance">3.0</output>
      <input type="range" min="0" max="80" step="1" value="30" data-param="guidance">
    </label>
    <label>
      Noise blur <output data-value="sigma">0.62</output>
      <input type="range" min="30" max="120" step="1" value="62" data-param="sigma">
    </label>
    <label>
      Background prior <output data-value="distractor">55%</output>
      <input type="range" min="0" max="85" step="1" value="55" data-param="distractor">
    </label>
    <label>
      Prompt ambiguity <output data-value="ambiguity">42%</output>
      <input type="range" min="0" max="100" step="1" value="42" data-param="ambiguity">
    </label>
    <label>
      Path steps <output data-value="steps">24</output>
      <input type="range" min="6" max="48" step="1" value="24" data-param="steps">
    </label>
    <label>
      Seed <output data-value="seed">19</output>
      <input type="range" min="1" max="999" step="1" value="19" data-param="seed">
    </label>
  </div>
  <div class="cfg-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Classifier-free guidance density-ratio lab"></canvas>
  <div class="cfg-lab__legend">
    <span><i style="background:#0f766e"></i> Prompt components</span>
    <span><i style="background:#64748b"></i> Background components</span>
    <span><i style="background:#7c3aed"></i> Guided score field</span>
    <span><i style="background:#2563eb"></i> Coverage curve</span>
  </div>
  <p class="cfg-lab__note">
    Deterministic analytic toy. The lab uses exact Gaussian-mixture scores, so
    changes in the chart come from guidance geometry rather than model error.
  </p>
</div>
<script defer src="{{ '/assets/js/cfg-guidance-lab.js?v=20260614a' | relative_url }}"></script>

Try this sequence.

Set guidance to **0.0**. The density follows the unconditional mixture. The
background components hold substantial mass because the prompt has not entered
the vector field. In the default setup, prompt alignment is only about 46.8%,
while effective area is still about 71.1%.

Move guidance to **1.0**. This recovers the ordinary conditional score in the
idealized toy. Prompt alignment rises, background mass falls, and the density
still covers several prompt modes if the condition itself is ambiguous.

At guidance **3.0**, the default panel reports about 92.6% prompt alignment,
30.1% effective area, and 2.12 prompt modes. Now push guidance to **6.0** or
**8.0**. Prompt alignment rises again, but the effective area collapses and the
prompt-mode count falls. At **8.0**, the toy reaches about 95.9% alignment, but
only 22.3% effective area and 1.94 prompt modes. The sampler is not just
becoming "more conditional." It is emphasizing points where the conditional
density is large relative to the unconditional density.

Raise **prompt ambiguity** and repeat. Multiple prompt modes can be valid under
the condition, but high guidance still prefers the most ratio-favorable ones.
This is a small version of a common failure mode: fidelity improves in one
sense while coverage quietly gets worse.

Raise **noise blur**. The components overlap more, so the conditional and
unconditional scores become harder to separate. The guidance difference becomes
a softer signal. Lower the blur and the density ratio becomes more decisive,
but the vector field also gets sharper.

The interesting part is not any single setting. It is the shape of the trade:
alignment, area, and mode coverage do not move together.

## What the Slider Compresses

Text-to-image systems usually expose guidance as a single scalar. That is
reasonable interface design, but it compresses several scientific choices.

First, guidance is time-dependent even when the UI scale is constant. A real
diffusion sampler applies the combination at many noise levels. The same number
can be gentle at one noise level and aggressive at another because the score
geometry changes over time. This is one reason later work studies guidance
schedules rather than treating the scale as a universal constant.

Second, models often do not output scores directly. They may predict noise,
clean data, or a velocity-like quantity, and the sampler converts that
prediction into an update. The familiar implementation line

```text
prediction = uncond + scale * (cond - uncond)
```

is simple, but the distributional interpretation depends on how that prediction
maps to a score for the sampler's parameterization.

Third, $$w>1$$ is extrapolation. The model was trained to estimate conditional
and unconditional denoising behavior. It was not necessarily trained on the
field

$$
\nabla_x \log \frac{p_t(x\mid c)^w}{p_t(x)^{w-1}}.
$$

When the two predictions are accurate, the extrapolation can be useful. When
they contain correlated artifacts, calibration error, or saturation behavior,
the extrapolation can strengthen those too. Lin et al. explicitly included
classifier-free guidance rescaling among fixes for over-exposure in a paper on
noise schedules and sampling mismatch.[^lin]

That does not mean high guidance is bad. It means high guidance is a
distributional intervention, not a truth serum.

## Why the Knob Has a Personality

The density-ratio view gives a compact explanation for many observed behaviors.

Guidance improves condition fidelity because it rewards regions that the prompt
makes more likely than the unconditional prior. If "a red cube" competes with
generic plausible images, the ratio emphasizes red-cube evidence.

Guidance reduces diversity because exponentiating a ratio concentrates mass.
Modes that are valid but less distinctive lose probability. The model can
become less exploratory even while looking more decisive.

Guidance can overshoot because $$p_t(x)^{1-w}$$ is a denominator when
$$w>1$$. Low unconditional density is not automatically bad; sometimes it is
exactly where rare prompt-specific samples live. But if the model's estimates
are imperfect, dividing by an uncertain quantity is a good way to make the
uncertainty visible.

Negative prompts fit the same mental model. They modify what counts as the
unconditional or undesirable direction, so the sampler is steered by another
difference of predictions. Operationally this can be useful. Conceptually it is
still vector arithmetic in a learned score space, with all the calibration
questions that implies.

The lab is deliberately too small to settle image-generation practice. It does
not model a U-Net, a text encoder, a latent VAE, attention, discretization
error, or the full reverse SDE. Its value is narrower: it isolates the part of
guidance that is already present before any of those engineering details enter.

If exact densities already show the fidelity-coverage tradeoff, then real
systems should not surprise us when the slider has a personality.

## Ask What Pressure You Are Buying

"What guidance scale should I use?" is not a mathematical question by itself.
It depends on the prompt, the model, the sampler, the noise schedule, the
parameterization, and the loss one cares about.

A sharper question is:

```text
Which errors am I willing to buy with density-ratio pressure?
```

If the cost of a weak condition is high, buy more pressure. If coverage matters,
buy less. If the prompt is underspecified, remember that high guidance can
silence ambiguity rather than resolve it. If the model is poorly calibrated at
some noise levels, a constant scale may be the wrong shape of intervention.

Classifier-free guidance is powerful because it is almost embarrassingly simple:
two model calls, one subtraction, one scale, one addition.

The simplicity should not make it feel mysterious.

The prompt does not become a commandment. It becomes a ratio. The sampler
follows the gradient.

[^ddpm]: Jonathan Ho, Ajay Jain, and Pieter Abbeel, ["Denoising Diffusion Probabilistic Models"](https://arxiv.org/abs/2006.11239), 2020.

[^score]: Yang Song, Jascha Sohl-Dickstein, Diederik P. Kingma, Abhishek Kumar, Stefano Ermon, and Ben Poole, ["Score-Based Generative Modeling through Stochastic Differential Equations"](https://arxiv.org/abs/2011.13456), 2020/2021.

[^guided]: Prafulla Dhariwal and Alex Nichol, ["Diffusion Models Beat GANs on Image Synthesis"](https://arxiv.org/abs/2105.05233), 2021.

[^cfg]: Jonathan Ho and Tim Salimans, ["Classifier-Free Diffusion Guidance"](https://arxiv.org/abs/2207.12598), 2022.

[^lin]: Shanchuan Lin, Bingchen Liu, Jiashi Li, and Xiao Yang, ["Common Diffusion Noise Schedules and Sample Steps are Flawed"](https://arxiv.org/abs/2305.08891), 2023/2024.
