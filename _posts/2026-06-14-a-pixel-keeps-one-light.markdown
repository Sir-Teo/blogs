---
layout: post
title: "Pixels Can Keep One Light"
description: "Reservoir resampling turns a stream of many possible light samples into one carried sample plus a weight ledger. The magic is not the sample; it is the accounting."
date: 2026-06-14 21:58:00 -0400
categories: computer-graphics
tags: [restir, reservoir-sampling, monte-carlo-rendering, many-light-rendering, variance-reduction, computer-graphics]
excerpt: "Many-light rendering looks impossible if every pixel must remember every light. A weighted reservoir keeps one representative sample and the weight sum that makes it auditable."
---

A pixel does not have room for a crowd.

In a path tracer, the direct-lighting question can be brutally simple:

```text
which of these lights should I ask about?
```

If the scene has four lights, you can ask all of them. If it has four million
emissive triangles, that plan has already failed. The renderer needs a way to
look at a few candidates, keep one useful representative, and still remember how
much total light the candidates stood for.

That is the quiet idea behind reservoir resampling.

It is easy to describe as a trick for picking one item from a stream. That is
true, but incomplete. The useful object is not just the selected item. It is the
pair:

```text
selected sample
sum of weights seen so far
```

The sample gives the renderer something concrete to trace, reuse, or share. The
weight sum keeps the probability story from drifting into folklore.

## The Lighting Sum

Strip direct lighting down to a one-dimensional surface and a cloud of point
lights. At surface position `x`, light `i` contributes

$$
f_i(x)=
V_i(x)\,
\frac{P_i \cos\theta_i(x)}{d_i(x)^2+\epsilon}.
$$

Here `P_i` is light power, `d_i` is distance, `cos(theta_i)` is the Lambertian
geometry term, and `V_i` is visibility. The image value at that point is the
finite sum

$$
L(x)=\sum_i f_i(x).
$$

The sum is small enough in the browser lab that we can compute it exactly. In a
renderer, the whole problem is that the sum is too large, too dynamic, or too
expensive because visibility wants shadow rays.

Monte Carlo asks for one index `i` from some proposal distribution `q`. The
unbiased one-sample estimator is

$$
\widehat L(x)=\frac{f_i(x)}{q_i}.
$$

Uniform sampling gives every light equal chance. Power sampling gives bright
lights more chance. Neither is automatically good. A bright light behind a
wall is a bad sample. A weak light almost touching the surface can matter more
than its emitted power suggests. The proposal is only a guess about the target.

Veach and Guibas's multiple-importance-sampling paper is the classic rendering
lesson here: difficult integrals often have several plausible sampling
distributions, and robustness comes from combining them with correct weights,
not from believing one proposal forever.[^veach]

Reservoir resampling is another version of the same moral. Let the proposal give
you candidate lights. Score those candidates under the target you actually care
about. Keep one, but keep the ledger.

## The Weighted Reservoir

For a stream of candidates with nonnegative weights `w_1, ..., w_M`, a
one-sample weighted reservoir maintains:

```text
y = selected candidate
W = sum of weights
```

When a new candidate with weight `w` arrives:

```text
W <- W + w
replace y with probability w / W
```

After the stream, candidate `j` is selected with probability `w_j / W`. Wyman's
Ray Tracing Gems II chapter gives this exact update and the induction proof for
the `K = 1` weighted reservoir.[^wyman] Vitter's 1985 reservoir-sampling paper
is the older streaming ancestor: choose samples in one pass when the population
size may be unknown and looking back is impossible.[^vitter]

For direct lighting, draw candidates `i_j` from a proposal `q`. Give each
candidate the importance weight

$$
w_j=\frac{f_{i_j}(x)}{q_{i_j}}.
$$

Then

$$
\mathbb E[w_j]=\sum_i q_i\frac{f_i(x)}{q_i}=L(x),
$$

so

$$
\frac{1}{M}\sum_{j=1}^M w_j
$$

is an unbiased estimate of the lighting sum. The reservoir lets us also keep one
representative candidate selected according to the weights, without retaining
the whole candidate list.

This is the part that feels too small to matter until it becomes a GPU
architecture. A pixel can stream candidates, keep one light, keep the sum, and
later combine that reservoir with other reservoirs.

## A Tiny Many-Light Bench

The lab below builds a synthetic many-light scene. A surface line sits at the
bottom. Random lights hover above it. Thin blockers cast hard visibility
occlusion. For every pixel, the code computes the exact direct-lighting sum so
the Monte Carlo estimates can be graded.

The four estimators are deliberately different:

- `uniform`: one uniformly chosen light;
- `power`: one light sampled by emitted power;
- `RIS`: `M` power-proposal candidates, scored by `f/q`, with a weighted
  reservoir keeping one representative;
- `temporal`: the same reservoir ledger accumulated across several static
  frames.

The temporal curve is not a claim about free samples. It spends more candidate
streams over time. The point is to make reuse visible: if the scene is static,
a reservoir can carry information forward instead of starting every frame cold.
If the scene moves, reuse needs validity checks and reweighting.

<style>
  .reservoir-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    isolation: isolate;
    margin: 2rem 0;
    max-width: 100%;
    overflow: hidden;
    padding: 1rem;
    position: relative;
  }

  .reservoir-lab__controls {
    clip-path: inset(0);
    contain: paint;
    display: grid;
    gap: 0.85rem 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    overflow: hidden;
    position: relative;
    z-index: 0;
  }

  .reservoir-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
    overflow: hidden;
  }

  .reservoir-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .reservoir-lab__controls input[type="range"] {
    appearance: none;
    background: transparent;
    height: 1.15rem;
  }

  .reservoir-lab__controls input[type="range"]::-webkit-slider-runnable-track {
    background: #e3e8ee;
    border: 1px solid #b7c1cb;
    border-radius: 999px;
    height: 0.36rem;
  }

  .reservoir-lab__controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    background: #0f766e;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #0f766e;
    height: 1rem;
    margin-top: -0.36rem;
    width: 1rem;
  }

  .reservoir-lab__controls input[type="range"]::-moz-range-track {
    background: #e3e8ee;
    border: 1px solid #b7c1cb;
    border-radius: 999px;
    height: 0.36rem;
  }

  .reservoir-lab__controls input[type="range"]::-moz-range-thumb {
    background: #0f766e;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #0f766e;
    height: 0.8rem;
    width: 0.8rem;
  }

  .reservoir-lab__controls input[type="number"] {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .reservoir-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .reservoir-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 1rem 0 0.85rem;
    position: relative;
    z-index: 2;
  }

  .reservoir-lab__metric {
    background: #f8fafc;
    border: 1px solid #dfe6ee;
    border-radius: 6px;
    font-family: var(--font-ui);
    min-width: 0;
    padding: 0.62rem 0.7rem;
  }

  .reservoir-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    letter-spacing: 0;
    line-height: 1.2;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
  }

  .reservoir-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .reservoir-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    max-width: 100%;
    position: relative;
    z-index: 2;
  }

  .reservoir-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.75rem 0 0;
    position: relative;
    z-index: 2;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) .reservoir-lab {
      background: #ffffff;
      color: #172026;
    }
  }

  :root[data-theme="dark"] .reservoir-lab {
    background: #ffffff;
    color: #172026;
  }
</style>

<div class="reservoir-lab" data-reservoir-light-lab>
  <div class="reservoir-lab__controls">
    <label>Lights
      <input data-param="lights" type="range" min="32" max="512" step="1" value="192">
      <output data-value="lights">192</output>
    </label>
    <label>Candidates
      <input data-param="candidates" type="range" min="1" max="28" step="1" value="6">
      <output data-value="candidates">6</output>
    </label>
    <label>Frames
      <input data-param="frames" type="range" min="1" max="96" step="1" value="28">
      <output data-value="frames">28</output>
    </label>
    <label>Power skew
      <input data-param="skew" type="range" min="0" max="100" step="1" value="62">
      <output data-value="skew">62%</output>
    </label>
    <label>Occlusion
      <input data-param="occlusion" type="range" min="0" max="80" step="1" value="42">
      <output data-value="occlusion">42%</output>
    </label>
    <label>Pixel
      <input data-param="pixel" type="range" min="1" max="100" step="1" value="54">
      <output data-value="pixel">54</output>
    </label>
    <label>Seed
      <input data-param="seed" type="number" min="1" max="9999" step="1" value="17">
      <output data-value="seed">17</output>
    </label>
  </div>
  <div class="reservoir-lab__metrics" data-metrics></div>
  <canvas data-canvas width="680" height="780" role="img" aria-label="Interactive many-light reservoir sampling lab"></canvas>
  <p class="reservoir-lab__note">The audit checks finite nonnegative lighting, a weighted-reservoir selection distribution on a known stream, and Monte Carlo unbiasedness for the power and RIS estimators at the selected pixel.</p>
</div>

<script src="{{ '/assets/js/reservoir-light-lab.js?v=20260614b' | relative_url }}"></script>

With the default scene, the exact selected-pixel lighting value is `225.699`.
The final-frame RMSE over the 64-pixel surface is:

```text
uniform one-light RMSE       709.707
power one-light RMSE         624.584
RIS, 6 candidates            161.132
temporal reservoir           34.034
RIS / temporal RMSE ratio      4.73x
audit                        passed
```

Those numbers are not universal. Move the occluders, change the power skew, or
drag the selected pixel. Sometimes power sampling is already good. Sometimes it
keeps proposing bright lights hidden behind blockers. The target/proposal ledger
panel shows why: amber is what emitted-power sampling believes, green is what
actually contributes at the selected surface point.

The important fact is not that `RIS` always wins. It does not. The important fact
is that the estimator is auditable. The code can compare the Monte Carlo average
against the exact sum because this toy scene is small. In production, you rarely
get that luxury, so the estimator derivation has to carry more weight.

## What ReSTIR Adds

Bitterli, Wyman, Pharr, Shirley, Lefohn, and Jarosz introduced ReSTIR for
real-time ray tracing with many dynamic lights.[^restir] Their paper combines
candidate resampling with temporal and spatial reuse, derives an unbiased
estimator, and also describes a biased estimator that trades some energy loss for
lower noise. The headline result is not subtle: scenes with up to millions of
dynamic emissive triangles rendered interactively with far fewer rays per pixel.

The lab above is smaller on purpose. It leaves out:

- BRDF sampling and multiple importance sampling with material lobes;
- area-light geometry;
- shadow-ray scheduling;
- neighbor-reservoir validity;
- temporal rejection under motion;
- the exact ReSTIR reservoir weight used to turn a selected sample into a
  contribution estimate.

What remains is the hinge: weighted reservoir sampling lets a renderer stream
many candidates but carry a fixed-size state. That state is combinable. Wyman's
chapter notes that two independent reservoirs `{R1, W1}` and `{R2, W2}` can be
combined by keeping `R1` with probability `W1/(W1+W2)` and otherwise keeping
`R2`, while the new weight sum is `W1 + W2`.[^wyman] That is the algebraic
reason reuse is possible.

The moment reservoirs are shared across pixels, though, the target can change.
A light useful for one pixel can be blocked or geometrically weak for another.
The sample is portable; its weight is not automatically portable. ReSTIR's
careful reweighting is not paperwork. It is the difference between reuse and
wishful thinking.

## The Mental Model

I find it helpful to think of a reservoir as a receipt, not a cache.

A cache says:

```text
here is the answer I found earlier
```

A reservoir says:

```text
here is one representative sample,
and here is the measure of the candidate stream it represents
```

The second sentence is what makes resampling composable. Without the weight
ledger, a carried light is just a lucky guess. With the ledger, it can be merged,
aged, reweighted, and tested.

There is a broader software lesson hiding here. Many systems want to compress a
stream into a tiny state: telemetry sketches, particle filters, online rankers,
cache admission policies, progressive renderers. The failure mode is usually the
same. We keep the representative object and forget the accounting that made it
representative.

Reservoir resampling is a reminder that the accounting is the algorithm.

[^vitter]: Jeffrey S. Vitter, ["Random Sampling with a Reservoir"](https://www.cs.usfca.edu/~mmalensek/cs677/schedule/papers/vitter1985random.pdf), *ACM Transactions on Mathematical Software* 11(1), 37-57, 1985. The paper studies one-pass sampling when `N` may be unknown and characterizes reservoir algorithms.

[^wyman]: Chris Wyman, ["Weighted Reservoir Sampling: Randomly Sampling Streams"](https://cwyman.org/papers/rtg2-chapter22-preprint.pdf), Chapter 22 in *Ray Tracing Gems II*, 2021. The chapter gives the `K = 1` weighted reservoir update, discusses graphics uses, and cites ReSTIR as a reservoir-based rendering method.

[^restir]: Benedikt Bitterli, Chris Wyman, Matt Pharr, Peter Shirley, Aaron Lefohn, and Wojciech Jarosz, ["Spatiotemporal reservoir resampling for real-time ray tracing with dynamic direct lighting"](https://benedikt-bitterli.me/restir/), *ACM Transactions on Graphics* 39(4), 2020. The project page summarizes ReSTIR as repeated candidate resampling plus spatial and temporal reuse for many dynamic lights.

[^veach]: Eric Veach and Leonidas J. Guibas, ["Optimally Combining Sampling Techniques for Monte Carlo Rendering"](https://graphics.stanford.edu/papers/combine/), SIGGRAPH 1995. The paper frames robust rendering estimators as weighted combinations of samples from different distributions.
