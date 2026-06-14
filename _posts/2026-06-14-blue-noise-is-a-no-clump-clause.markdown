---
layout: post
title: "Blue Noise Is a No-Clump Clause"
description: "A live graphics and games lab for comparing uniform random points, jittered grids, best-candidate sampling, and Bridson Poisson-disk sampling by nearest-neighbor gaps, voids, and power spectra."
date: 2026-06-14 17:47:00 -0400
categories: computer-graphics
tags: [blue-noise, poisson-disk, sampling, dithering, computer-graphics, procedural-generation, games]
excerpt: "Uniform random dots are fair, but they clump. Blue noise is the trick of making randomness spend its energy where the eye forgives it."
---

Uniform random points are honest.

They are also ugly.

Drop 180 independent points into a square and they will do exactly what the
math promises: sometimes crowd together, sometimes leave holes, never apologize
for either. If those points are stars, grass clumps, stipple dots, shadow rays,
bullet decals, sampling locations, or item spawns, the viewer may read the
clumps as intention and the holes as neglect.

A grid fixes the holes and creates a different crime. It is too legible. Rotate
the camera, move the texture, march the enemy path, and the pattern starts
whispering its lattice.

Blue noise is the compromise I trust most often:

```text
random enough to avoid a grid
repelled enough to avoid clumps
spectrally shaped
so mistakes become fine-grained noise
```

That last line matters. Blue noise is not just "nice random dots." It is a
claim about where the error lives in frequency space.

## The Eye Dislikes Slow Mistakes

Noise has color by analogy with light. White noise spreads power roughly evenly
across frequencies. Blue noise pushes power toward higher frequencies and leaves
a hole near the origin of the spectrum. In images, this is useful because broad,
low-frequency mistakes look like blotches, bands, and cloudy structure. Small
high-frequency mistakes often read as texture.

This is an old graphics lesson. Cook's 1986 paper on stochastic sampling argued
that regularly spaced samples are what turn high frequencies into structured
aliasing; nonuniform samples can turn the same failure into noise that is less
objectionable to vision.[^cook] Ulichney's 1988 work introduced blue-noise
dithering as a way to render halftones with desirable high-frequency
properties.[^ulichney] Mitsa and Parker later designed blue-noise masks whose
thresholded binary patterns keep the pleasant part of ordered dithering while
avoiding periodic artifacts.[^mitsa]

The shared move is not "add randomness." The shared move is "control the
spectrum of the randomness."

If a sampling pattern has too much low-frequency power, it has visible geography:
large clumps and large empty islands. If it has narrow spectral spikes, it has a
hidden grid. A good blue-noise point set is trying to have neither.

## A Small Dot Laboratory

The lab below compares four point generators:

- uniform random: independent points
- jittered grid: one random point per mostly regular cell
- best candidate: pick the farthest among \(k\) random proposals
- Poisson disk: keep every pair at least \(r\) apart

For the default seed, 180 points, radius `54 / 1000`, and 30 candidates, the
numbers are deliberately visible. Uniform random gets a minimum gap of only
`6.0 / 1000`, low-frequency power around `0.89x`, and a 95th-percentile void
radius around `73.4 / 1000`. The Bridson Poisson-disk run emits 180 points from
a filled 215-point pool, keeps a `54.1 / 1000` minimum gap, and drops
low-frequency power to about `0.19x`.

The best-candidate pattern is competitive in this small two-dimensional lab:
its low-frequency power is about `0.18x`. But it paid for that by checking
roughly `483k` candidate-to-sample distances, while the Poisson-disk run used
about `21.8k` local grid checks. That is the algorithmic part of the story.

<style>
  .blue-noise-lab {
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

  .blue-noise-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .blue-noise-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .blue-noise-lab__controls input,
  .blue-noise-lab__controls select {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .blue-noise-lab__controls select,
  .blue-noise-lab__controls input[type="number"] {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .blue-noise-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .blue-noise-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .blue-noise-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .blue-noise-lab__metric span,
  .blue-noise-lab__legend,
  .blue-noise-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .blue-noise-lab__metric span {
    display: block;
  }

  .blue-noise-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .blue-noise-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    max-width: 100%;
    width: 100%;
  }

  .blue-noise-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    margin-top: 0.75rem;
  }

  .blue-noise-lab__legend span::before {
    border-radius: 999px;
    content: "";
    display: inline-block;
    height: 0.72rem;
    margin-right: 0.35rem;
    vertical-align: -0.08rem;
    width: 0.72rem;
  }

  .blue-noise-lab__legend span:nth-child(1)::before {
    background: #be123c;
  }

  .blue-noise-lab__legend span:nth-child(2)::before {
    background: #b45309;
  }

  .blue-noise-lab__legend span:nth-child(3)::before {
    background: #7c3aed;
  }

  .blue-noise-lab__legend span:nth-child(4)::before {
    background: #0f766e;
  }

  .blue-noise-lab__note {
    margin: 0.75rem 0 0;
  }

  @media (max-width: 650px) {
    .blue-noise-lab {
      padding: 0.75rem;
    }

    .blue-noise-lab canvas {
      height: 1120px;
    }
  }
</style>

<div class="blue-noise-lab" data-blue-noise-lab>
  <div class="blue-noise-lab__controls">
    <label>
      Pattern
      <select data-param="pattern">
        <option value="random">uniform random</option>
        <option value="jitter">jittered grid</option>
        <option value="best">best candidate</option>
        <option value="poisson" selected>Bridson Poisson disk</option>
      </select>
    </label>
    <label>
      Samples <output data-output="samples">180</output>
      <input data-param="samples" type="range" min="48" max="420" step="1" value="180">
    </label>
    <label>
      Minimum gap <output data-output="radius">54 / 1000</output>
      <input data-param="radius" type="range" min="18" max="74" step="1" value="54">
    </label>
    <label>
      Candidates <output data-output="candidates">30</output>
      <input data-param="candidates" type="range" min="4" max="48" step="1" value="30">
    </label>
    <label>
      Seed
      <input data-param="seed" type="number" min="1" max="9999" step="1" value="37">
    </label>
  </div>
  <div class="blue-noise-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Blue-noise sampling diagnostics"></canvas>
  <div class="blue-noise-lab__legend">
    <span>uniform random</span>
    <span>jittered grid</span>
    <span>best candidate</span>
    <span>Poisson disk</span>
  </div>
  <p class="blue-noise-lab__note">
    The spectrum panel computes a direct periodogram over integer spatial frequencies and radially averages it. Values below 1 near the origin mean low-frequency energy is suppressed relative to the pattern's average spectral power.
  </p>
</div>

<script defer src="{{ '/assets/js/blue-noise-lab.js?v=20260614a' | relative_url }}"></script>

## How To Read The Picture

The first panel is only the bait. The dots should look plausible, but looking is
not a diagnostic.

The nearest-neighbor histogram is the first audit. Uniform random points have a
long left tail because independence allows arbitrarily close pairs. Jittered
grids reduce the left tail, but adjacent cells can still put points near a
shared edge. Best-candidate and Poisson-disk sampling both push the histogram
rightward.

The spectrum panel is the second audit. In the lab, I use the point-set
periodogram:

$$
P(k)=\frac{1}{n}\left|\sum_{j=1}^n \exp(-2\pi i k\cdot x_j)\right|^2.
$$

Then I average \(P(k)\) over rings of similar \(\lVert k\rVert\). A blue-noise
pattern should have a low-frequency dip and then a noisy ring of energy at
higher frequencies. That is the "blue" part: the power is not evenly distributed.

The void map is the third audit. Each small pixel asks how far it is from the
nearest sample. Warm islands are places the pattern is underserving. This is the
map a level designer secretly cares about when distributing rocks, enemies,
trees, or loot. It is also the map a renderer cares about when deciding whether
some part of an integral has not been sampled well.

## Poisson Disk Is A Hard-Core Promise

"Poisson disk" is a slightly confusing phrase. A homogeneous Poisson process has
independent counts and no minimum spacing. A Poisson-disk pattern is a hard-core
pattern: every pair of samples must be at least distance \(r\) apart. The disk
language comes from imagining a disk of radius \(r/2\) around every point. Those
disks cannot overlap.

That one rule kills the worst clumps.

It does not make the pattern a grid. There is still randomness in angles, local
packing, and boundary behavior. But it deletes the event that independent random
sampling loves to produce: two samples almost on top of each other while some
other region gets nothing.

This is why Poisson-disk points appear in so many practical places:

```text
trees that should not intersect
spawn points that should not overlap
texture stipples that should not band
shadow samples that should not alias into a lattice
particles that should not start as clumps
```

The rule is local, but the visual effect is global.

## Bridson's Useful Trick

Naive dart throwing is simple:

```text
draw a random point
keep it if it is at least r away
from every old point
repeat until tired
```

It works until the domain gets crowded. Then almost every new dart lands too
close to something, and the algorithm spends most of its life rejecting.

Bridson's 2007 sketch gives the version that became a workhorse in graphics
code.[^bridson] It keeps an active list of samples that may still have room
nearby. For an active point, it proposes candidates in the annulus between
radius \(r\) and \(2r\). A background grid with cell width at most
\(r/\sqrt{2}\) makes the distance test local: in two dimensions, each grid cell
can hold at most one sample, so only nearby cells need to be checked.

In pseudocode:

```text
start with one random point
while the active list is not empty:
    pick an active point x
    try k candidates near x
    accept the first candidate
        at least r from its grid neighbors
    if all k candidates fail, retire x
```

Bridson's analysis is pleasingly small. Each loop either emits a sample or
retires one, so the number of active-list iterations is linear in the number of
samples when \(k\) is treated as a constant.

The implementation in this post fills the domain first. If the filled pool has
more points than the slider asks for, it takes a seeded subset. That detail is
important. If you stop the Bridson growth the instant you reach `n`, you do not
get a uniform pattern over the whole square; you get a growing colony around the
initial point with a large empty frontier. I made that mistake while building
the lab, and the void map caught it immediately.

## The Best Candidate Has Taste, But It Is Expensive

Mitchell's best-candidate idea is seductive.[^mitchell] To add the next point,
draw \(k\) random candidates and keep the one farthest from the existing set.
The algorithm is almost a sentence:

```text
many proposals enter
the least crowded proposal leaves
```

For small \(n\), it works beautifully. It is easy to animate. It is easy to
explain. In the default lab run, it slightly beats the Poisson-disk subset on
low-frequency power.

The cost is that "farthest from the existing set" is a global question unless
you add more spatial data structures. With 180 points and 30 candidates, the
lab performs 483,300 candidate-to-sample distance checks. That is still tiny in
JavaScript. It is not tiny if you are generating many patterns per frame, many
dimensions per sample, or many worlds in a build pipeline.

Poisson disk wins not because it is morally better. It wins because it turns a
global aesthetic into a local rejection test.

## Jitter Is Half A Cure

Jittered grids deserve more respect than they sometimes get.

One random point per cell removes the worst voids of independent sampling. It is
also extremely cheap and easy to stratify across pixels, frames, or dimensions.
Cook discussed jitter as a practical stochastic sampling scheme because it
reduces aliasing while keeping a useful amount of regularity.[^cook]

But a jittered grid remembers the grid. Depending on the task, this memory can
be good or bad. If you are integrating one sample per pixel, stratification is
often exactly what you want. If you are placing mushrooms in a forest, the
viewer might eventually sense the invisible checkerboard. If you are sampling
motion blur or a glossy lobe, the grid may interact with other dimensions in
ways that are not visible in a two-dimensional scatter plot.

This is why "blue noise" is not a universal replacement for stratification,
low-discrepancy sequences, multiple importance sampling, or domain-specific
design. Sampling patterns are instruments. Each one has a frequency response.

## What Blue Noise Does Not Promise

Blue noise is a useful aesthetic and numerical bias. It is not magic.

It does not promise independent samples. In fact, it achieves its look by
destroying independence.

It does not promise the lowest variance for every integral. If the integrand has
structure aligned with the pattern's remaining spectral energy, another sampler
may win.

It does not automatically handle nonuniform density. If the desired density
changes across the map, the radius should change too, and then the simple
uniform grid argument needs care.

It does not settle game design. A fair spawn system may need team constraints,
visibility constraints, travel-time constraints, and anti-camping memory. A
Poisson-disk sampler only says "not too close." That is a geometric sentence,
not a design document.

It also has boundary effects. Samples near the edge have less annulus available,
and filled finite domains are not the same as infinite stationary processes.
For tileable textures, you may want periodic distance tests. For streaming
worlds, you may need chunks whose samples agree across chunk boundaries.

The best use of blue noise is modest: use it when low-frequency clumps are more
annoying than high-frequency grain.

## The Practical Rule

When I need plausible randomness in a visual system, I now ask three questions:

```text
Can two samples be too close?
Can a regular grid become visible?
Can broad holes be worse than fine grain?
```

If the answer to all three is yes, I reach for blue noise or Poisson-disk
sampling first.

Then I check the spectrum.

Not because the spectrum is more real than the picture, but because the picture
is too persuasive. A point set can look natural for one seed and fail for the
next. A grid can hide in a scatter plot and announce itself in motion. A random
pattern can look fine until the one clump appears exactly where the player is
staring.

Randomness is not a vibe. It is a distribution, a geometry, and a spectrum.

Blue noise is the version that tells the dots: be random, but give each other a
little room.

[^cook]: Robert L. Cook, ["Stochastic Sampling in Computer Graphics"](https://cseweb.ucsd.edu/~viscomp/classes/cse168/sp24/readings/p51-cook.pdf), *ACM Transactions on Graphics* 5(1), 1986.

[^ulichney]: Robert A. Ulichney, ["Dithering with Blue Noise"](https://cv.ulichney.com/papers/1988-blue-noise.pdf), *Proceedings of the IEEE* 76(1), 1988.

[^mitsa]: Theophano Mitsa and Kevin J. Parker, ["Digital halftoning technique using a blue-noise mask"](https://www.hajim.rochester.edu/ece/sites/parker/assets/pdf/44%20-%20Digital%20halftoning%20technique%20using%20a%20blue-noise%20mask.pdf), *Journal of the Optical Society of America A* 9(11), 1992.

[^mitchell]: Don P. Mitchell, ["Spectrally Optimal Sampling for Distribution Ray Tracing"](https://dl.acm.org/doi/10.1145/127719.122736), SIGGRAPH 1991.

[^bridson]: Robert Bridson, ["Fast Poisson Disk Sampling in Arbitrary Dimensions"](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf), SIGGRAPH 2007 sketch.
