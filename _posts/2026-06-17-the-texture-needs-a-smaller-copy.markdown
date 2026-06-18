---
layout: post
title: "The Texture Needs a Smaller Copy"
description: "Mipmaps are prefiltered promises about pixel footprint: when one screen pixel covers many texels, sample a smaller copy instead of one lucky texel."
date: 2026-06-17 10:50:00 -0400
categories: computer-graphics
tags: [mipmapping, texture-filtering, antialiasing, sampling, computer-graphics, rendering]
excerpt: "A texture lookup is not always a point question. Under minification, one screen pixel covers many texels, so the renderer needs a prefiltered answer at the right scale."
---

A texture lookup looks innocent:

```text
color = texture(u, v)
```

But a screen pixel is not a mathematical point. It is a small measurement
window. If the surface mapping sends that window across six, twelve, or twenty
texels, a single lookup is no longer asking a fair question. It is asking one
texel to speak for a neighborhood.

That is where minification aliasing comes from. The renderer samples a
high-frequency texture below the rate needed to represent it, and the lost
frequencies reappear as crawl, shimmer, stripes, and moire.

The mipmap fix is almost embarrassingly concrete:

```text
if one screen pixel covers many texels,
look up a smaller prefiltered copy of the texture
```

The smaller copy is not just a cache trick. It is a stored approximation to the
area average the pixel was asking for all along.

## A Pixel Asks For an Area

Let a texture be a function $$T(u,v)$$. Let a screen pixel project to some
region $$P$$ in texture coordinates. The antialiasing answer is not:

$$
T(u_0, v_0).
$$

It is closer to:

$$
\frac{1}{|P|}\int_P T(u,v)\,du\,dv.
$$

That integral is the expensive thing. The footprint changes with depth,
surface orientation, projection, UV mapping, and animation. A renderer could
average all source texels under the footprint for every pixel, but that turns a
texture lookup into a variable-size convolution.

Lance Williams' 1983 "Pyramidal Parametrics" paper attacked this cost by
precomputing a pyramid of filtered images.[^williams] Each level halves the
linear resolution of the previous level. Level 0 is the original texture. Level
1 stores averages for roughly 2-by-2 neighborhoods. Level 2 stores averages for
4-by-4 neighborhoods. Continue until the texture has collapsed to a tiny image.

For a square texture, the storage overhead is bounded by the geometric series:

$$
\frac{1}{4}+\frac{1}{16}+\frac{1}{64}+\cdots = \frac{1}{3}.
$$

About one third more storage buys constant-time access to many approximate
filter widths.

## The Third Coordinate

A bilinear texture lookup has two coordinates, $$u$$ and $$v$$. A mipmapped
lookup has a third coordinate: level of detail.

If a pixel footprint is about $$\rho$$ texels wide, the usual scale heuristic is:

$$
\ell = \log_2 \rho.
$$

So:

```text
footprint 1 texel  -> level 0
footprint 2 texels -> level 1
footprint 4 texels -> level 2
footprint 8 texels -> level 3
```

When $$\ell$$ lands between levels, trilinear filtering blends the two adjacent
levels: bilinear inside each image, linear between images. Williams described
this as interpolation within and between the pyramid levels, with a coordinate
often written as $$D$$ for depth in the pyramid.[^williams]

The important part is not the letter. It is the contract:

```text
choose the prefiltered image whose texel size resembles the pixel footprint
```

That converts a moving area-average problem into a few texture reads from a
precomputed hierarchy.

## Why This Is Only an Approximation

The ideal footprint is rarely a square. When a surface is seen at a grazing
angle, one screen pixel may cover a long thin region in texture space. A normal
mipmap is isotropic: each lower level filters equally in both texture axes. It
can choose "smaller" or "larger", but not "long in one direction and narrow in
the other."

Paul Heckbert's 1989 report frames texture mapping and image warping as
resampling problems, with the antialiasing filter generally varying across the
image.[^heckbert] That is the more honest theory: the right filter follows the
mapping. A mipmap is a fast restricted family of filters.

Frank Crow's summed-area tables are a useful contrast.[^crow] Instead of
storing many prefiltered images, a summed-area table stores cumulative sums so
axis-aligned rectangular averages can be queried quickly. That is a different
precomputation for a different filter family. The common idea is the same:
expensive area integration can be moved partly out of the inner pixel loop.

So the evidence line is:

```text
mipmaps are a practical prefiltering approximation, not the ideal texture filter
```

The engineering line is:

```text
the approximation is cheap, stable, cache-friendly, and usually much better
than point sampling under minification
```

## Lab: Make the Texture Smaller First

The lab below builds a procedural 256-by-256 grayscale texture, constructs a
mipmap pyramid by repeated 2-by-2 averaging, then renders a minified strip three
ways:

- point sampling from the original texture;
- trilinear mip sampling with $$\ell=\log_2(\rho)$$;
- a slow supersampled reference that averages many samples over the pixel
  footprint.

The RMS errors are measured against that finite supersampled reference. This is
not a full renderer. There is no perspective triangle rasterization, derivative
tracking, gamma-correct filtering, compression, anisotropic filtering, EWA
filtering, or GPU cache model. The point is narrower: when a pixel footprint
covers multiple texels, prefiltering before lookup should move the result
toward an area average.

With the default settings:

```text
texture frequency: 18
pixel footprint:  6.0 texels
selected LOD:     log2(6) = 2.585
point RMS:        0.10216
mipmap RMS:       0.05651
```

That is a 45% error reduction against the lab's supersampled reference.

<style>
  .mipmap-lab {
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

  .mipmap-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    margin-bottom: 1rem;
  }

  .mipmap-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .mipmap-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .mipmap-lab input[type="range"] {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .mipmap-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
    margin: 0 0 0.9rem;
  }

  .mipmap-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .mipmap-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.36);
  }

  .mipmap-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.36);
  }

  .mipmap-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 740;
    letter-spacing: 0;
    line-height: 1.18;
    margin-bottom: 0.22rem;
    text-transform: uppercase;
  }

  .mipmap-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.86rem, 2.3vw, 1.02rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .mipmap-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .mipmap-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="mipmap-lab" data-mipmap-lab>
  <div class="mipmap-lab__controls">
    <label>
      Texture frequency
      <output data-value="frequency">18</output>
      <input type="range" min="4" max="48" step="1" value="18" data-param="frequency">
    </label>
    <label>
      Pixel footprint
      <output data-value="footprint">6.0</output>
      <input type="range" min="1" max="32" step="0.5" value="6" data-param="footprint">
    </label>
    <label>
      Phase
      <output data-value="phase">17</output>
      <input type="range" min="0" max="255" step="1" value="17" data-param="phase">
    </label>
    <label>
      Contrast
      <output data-value="contrast">85%</output>
      <input type="range" min="20" max="100" step="1" value="85" data-param="contrast">
    </label>
    <label>
      Mip levels
      <output data-value="levels">8</output>
      <input type="range" min="1" max="8" step="1" value="8" data-param="levels">
    </label>
  </div>
  <div class="mipmap-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Interactive mipmap texture filtering lab"></canvas>
  <p class="mipmap-lab__note" data-note></p>
</div>

<script src="{{ '/assets/js/mipmap-lab.js?v=20260617a' | relative_url }}"></script>

## Reproducibility Check

The lab exposes the same computation as a small CommonJS module, so the
headline numbers can be audited without a browser:

```js
const lab = require("./assets/js/mipmap-lab.js");

console.table(lab.auditGrid().map((row) => ({
  frequency: row.params.frequency,
  footprint: row.params.footprint,
  pointRms: row.pointRms.toFixed(5),
  mipRms: row.mipRms.toFixed(5),
  lod: row.selectedLod.toFixed(3),
  passed: row.passed
})));
```

On my run, the cases are:

| Texture frequency | Footprint | Point RMS | Mipmap RMS | Error reduction | LOD |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 18 | 6 | 0.10216 | 0.05651 | 45% | 2.585 |
| 8 | 2 | 0.02676 | 0.00246 | 91% | 1.000 |
| 28 | 12 | 0.21106 | 0.02582 | 88% | 3.585 |
| 40 | 24 | 0.19227 | 0.00549 | 97% | 4.585 |

These numbers should not be read as universal benchmark results. They are for
this procedural texture, this square footprint, this finite supersampled
reference, and this box-filtered pyramid. They do show the qualitative failure:
point sampling has no way to know that the pixel covers many texels.

## What the Pyramid Hides

There are several places where a production renderer has to be more careful
than this lab:

- Color values should be filtered in a space appropriate to the texture's
  meaning. Averaging gamma-encoded color is not the same as averaging linear
  radiance.
- Normal maps, roughness maps, alpha masks, and categorical lookup textures do
  not all want the same averaging rule.
- A square mip level blurs both axes together. Grazing-angle surfaces need
  anisotropic footprints.
- The LOD formula has to come from the actual mapping derivatives, not from a
  user slider.
- Prefiltering reduces aliasing by removing high-frequency detail. It cannot
  preserve detail that the screen pixel no longer has sampling capacity to
  represent.

That last point is the psychological trap. A sharper minified texture is not
automatically more correct. If the pixel cannot support the frequency, the
choice is not between "sharp" and "blurry." It is between a stable filtered
answer and an aliased lie.

The small copy is a promise: when the renderer asks a smaller question, the
texture will answer at the scale of the question.

[^williams]: Lance Williams, ["Pyramidal Parametrics"](https://ohiostate.pressbooks.pub/app/uploads/sites/45/2017/09/williams-pyramidal.pdf), *Computer Graphics* 17(3), SIGGRAPH 1983. The paper describes prefiltered pyramid levels, the "mip" name, and interpolation within and between pyramid levels for texture filtering.

[^heckbert]: Paul S. Heckbert, ["Fundamentals of Texture Mapping and Image Warping"](https://www2.eecs.berkeley.edu/Pubs/TechRpts/1989/5504.html), UCB/CSD-89-516, 1989. The report treats texture mapping and image warping as resampling problems and develops the space-varying antialiasing filter view.

[^crow]: Franklin C. Crow, ["Summed-area tables for texture mapping"](https://history.siggraph.org/learning/summed-area-tables-for-texture-mapping-by-crow/), SIGGRAPH 1984. Crow's abstract contrasts summed-area tables with mip maps as another way to make texture-area computations tractable through precomputation.
