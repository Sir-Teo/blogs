---
layout: post
title: "The Pixel Is an Expectation"
description: "Path tracing works because a pixel can be written as an integral, and a ray can be treated as a random variable."
date: 2026-06-15 10:39:00 -0400
categories: computer-science
tags: [computer-graphics, monte-carlo, path-tracing, rendering-equation, importance-sampling, visualization]
excerpt: "A ray in a path tracer is not just geometry. It is a sample from an estimator. The hard part is choosing which random paths deserve to exist."
---

A pixel is not a little square of color.

It is an unanswered integral.

The renderer asks: among all the ways light could leave a lamp, bounce through
the scene, hit a surface, and arrive at the camera, how much radiance belongs
to this pixel? The answer is usually too large to enumerate. So the renderer
rolls dice.

```text
one ray is a random question
many rays are an estimate
```

That is the quiet mathematical trick behind path tracing. A photorealistic
image can be made from noisy guesses, as long as the guesses are unbiased and
the noise shrinks fast enough to be tolerable.

<div class="callout">
  <strong>Claim:</strong> Monte Carlo rendering is not "shoot random rays and
  hope." It is numerical integration under a brutal budget. The quality of the
  image depends less on randomness itself than on whether the sampling
  distribution matches where the light transport integral has mass.
</div>

## The Equation That Ate Rendering

Kajiya's 1986 rendering equation gave computer graphics a compact language for
global illumination.[^kajiya] In one common surface-scattering form,

$$
L_o(x,\omega_o)
=
L_e(x,\omega_o)
+
\int_{\Omega}
f_r(x,\omega_i,\omega_o)
L_i(x,\omega_i)
(\omega_i \cdot n)
d\omega_i .
$$

The symbols are less frightening than they look:

- $$L_o$$ is light leaving the surface toward the camera.
- $$L_e$$ is light emitted by the surface itself.
- $$f_r$$ is the BRDF, the rule for how the material scatters incoming light.
- $$L_i$$ is light arriving from direction $$\omega_i$$.
- $$(\omega_i \cdot n)$$ is the cosine term: grazing light contributes less.
- The integral runs over incoming directions above the surface.

The recursion is hidden in $$L_i$$. Incoming light from one direction may have
bounced off another surface, which received light from another direction, and
so on. A clean local formula turns into a vast path integral over possible
light histories.

Cook, Porter, and Carpenter's distributed ray tracing paper had already shown
how randomizing ray dimensions could produce soft shadows, glossy reflection,
motion blur, depth of field, and antialiasing in a unified way.[^cook] Kajiya's
equation made the target explicit: these rays are not only visual tricks. They
are samples of an integral.

## The PDF Is Part of the Pixel

Monte Carlo integration starts with a plain identity. If we want

$$
I = \int f(x)\,dx
$$

and we draw samples from a probability density $$p(x)$$, then

$$
\hat{I}
=
\frac{1}{N}
\sum_{k=1}^{N}
\frac{f(X_k)}{p(X_k)}
$$

is unbiased when $$p(x) > 0$$ wherever $$f(x)$$ matters.

The denominator is the whole game. If a renderer samples a direction that was
unlikely under its own PDF, that ray gets a large weight. If it samples a
direction often, that ray gets a smaller weight. The estimator is not "average
the ray colors." It is:

```text
contribution divided by probability of asking
```

A bad sampler wastes questions. Uniformly sample the hemisphere when the light
is a tiny bright patch, and most rays see almost nothing. Sample only the light
when the environment or the material lobe matters, and you miss diffuse
background contribution. Sample only the BRDF when a small lamp is slightly
off-lobe, and the important directions become rare.

Veach and Guibas's multiple importance sampling paper attacked exactly this
problem: combine samples from several distributions so each distribution covers
the cases it understands, while the estimator remains unbiased.[^veach-mis]
Veach's thesis then built a broad theory of robust Monte Carlo light transport
around these ideas.[^veach-thesis]

The sampler is not an implementation detail. It is a hypothesis about where the
answer lives.

## A One-Bounce Light Transport Lab

The lab below is a one-dimensional toy version of a direct-lighting integral.
It is not a full renderer. There is one surface point, one angular domain above
the surface, a bright angular light, a weak environment term, and a
BRDF-shaped surface response. The true integral is computed by a dense
numerical quadrature. The Monte Carlo estimators then try to recover it with a
limited number of samples.

The four estimators are:

- **uniform angles:** every direction is equally likely;
- **BRDF-shaped:** directions are sampled near the material lobe;
- **light-shaped:** most samples are aimed at the bright angular light, with a
  small uniform fallback so the estimator still covers the whole domain;
- **MIS mixture:** samples come from a half-BRDF, half-light mixture and are
  weighted by the mixture PDF.

With the default small bright light, pure light sampling has the lowest RMSE.
MIS still beats uniform by a wide margin, but it does not magically beat the
specialist on the specialist's home field. Change the scene to a broad
environment with a broad material lobe and MIS becomes the safer estimator.

<style>
  .light-transport-lab {
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

  .light-transport-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  }

  .light-transport-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .light-transport-lab__controls input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .light-transport-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0;
  }

  .light-transport-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .light-transport-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .light-transport-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.04rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }

  .light-transport-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .light-transport-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .light-transport-lab__legend span,
  .light-transport-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .light-transport-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    margin-right: 0.35rem;
    vertical-align: -0.06rem;
    width: 0.7rem;
  }

  .light-transport-lab__note {
    margin: 0.7rem 0 0;
  }
</style>

<div class="light-transport-lab" data-light-transport-lab>
  <div class="light-transport-lab__controls">
    <label>
      Seed <output data-value="seed">19</output>
      <input type="range" data-param="seed" min="1" max="99" step="1" value="19">
    </label>
    <label>
      Samples <output data-value="samples">256</output>
      <input type="range" data-param="samples" min="16" max="2048" step="16" value="256">
    </label>
    <label>
      Light angle <output data-value="lightAngle">34 deg</output>
      <input type="range" data-param="lightAngle" min="-72" max="72" step="1" value="34">
    </label>
    <label>
      Light half-size <output data-value="lightSize">12 deg</output>
      <input type="range" data-param="lightSize" min="3" max="42" step="1" value="12">
    </label>
    <label>
      Light power <output data-value="lightPower">9.0</output>
      <input type="range" data-param="lightPower" min="1" max="24" step="0.5" value="9">
    </label>
    <label>
      Environment <output data-value="environment">11%</output>
      <input type="range" data-param="environment" min="0" max="70" step="1" value="11">
    </label>
    <label>
      Lobe angle <output data-value="lobeAngle">24 deg</output>
      <input type="range" data-param="lobeAngle" min="-72" max="72" step="1" value="24">
    </label>
    <label>
      Roughness <output data-value="roughness">18 deg</output>
      <input type="range" data-param="roughness" min="4" max="62" step="1" value="18">
    </label>
  </div>
  <div class="light-transport-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Monte Carlo light transport simulator comparing uniform, BRDF-shaped, light-shaped, and multiple-importance sampling estimators"></canvas>
  <div class="light-transport-lab__legend">
    <span><i style="background:#be123c"></i> Integrand / truth</span>
    <span><i style="background:#2563eb"></i> BRDF-shaped sampling</span>
    <span><i style="background:#d97706"></i> Light-shaped sampling</span>
    <span><i style="background:#0f766e"></i> MIS mixture</span>
    <span><i style="background:#64748b"></i> Uniform sampling</span>
  </div>
  <p class="light-transport-lab__note">
    Deterministic toy model. The audit covers 37 settings for finite estimates,
    positive ground-truth integrals, nonnegative RMSE, and lower default MIS
    RMSE than uniform-angle sampling.
  </p>
</div>
<script defer src="{{ '/assets/js/light-transport-lab.js?v=20260615c' | relative_url }}"></script>

Try these settings:

1. Increase **Light power** and shrink **Light half-size**. Uniform sampling
   collapses because most questions miss the lamp.
2. Move **Lobe angle** away from **Light angle** and lower **Roughness**. The
   BRDF-shaped sampler asks elegant questions in the wrong neighborhood.
3. Raise **Environment** and widen **Roughness**. The light sampler loses its
   monopoly because there is useful contribution outside the direct lamp.
4. Increase **Samples**. Every unbiased estimator converges, but the number of
   samples needed to look stable differs dramatically.

This is why MIS is so beloved in rendering. It is not always the lowest
variance estimator in every scene. It is often a good estimator before you know
which scene you are in.

## Fireflies Are Weighted Mistakes

The bright speckles in a low-sample path-traced image are often called
fireflies. They are not merely random pixels being mischievous. They are large
weights.

If a rare sample finds a high-contribution path and the PDF for that path is
small, the contribution divided by probability becomes enormous. The estimator
is allowed to do this. It may still be unbiased. But the image is unbearable
until enough samples arrive to average those rare events down.

That is why the PDF is part of the image's engineering. A renderer is not only
simulating light. It is designing a distribution over questions:

```text
ask often where the answer is large
and pay honestly for how often you asked
```

There is a pleasing moral here. Photorealism is not obtained by pretending to
know every path. It is obtained by being statistically honest about ignorance.

The pixel is an expectation.

The ray is a sample.

The art is choosing the question.

[^kajiya]: James T. Kajiya, ["The Rendering Equation"](https://www.cs.cmu.edu/afs/cs/academic/class/15462-s13/www/lec_slides/86kajiyaRenderingEquation.pdf), SIGGRAPH, 1986.

[^cook]: Robert L. Cook, Thomas Porter, and Loren Carpenter, ["Distributed Ray Tracing"](https://dl.acm.org/doi/10.1145/964965.808590), SIGGRAPH, 1984.

[^veach-mis]: Eric Veach and Leonidas J. Guibas, ["Optimally Combining Sampling Techniques for Monte Carlo Rendering"](https://graphics.stanford.edu/papers/combine/), SIGGRAPH, 1995.

[^veach-thesis]: Eric Veach, ["Robust Monte Carlo Methods for Light Transport Simulation"](https://graphics.stanford.edu/papers/veach_thesis/), PhD thesis, Stanford University, 1997.
