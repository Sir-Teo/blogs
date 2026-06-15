---
layout: post
title: "The Edge Pixel Is a Contract"
description: "Alpha compositing works when color, coverage, and color space agree. Premultiplied alpha is the contract that keeps filtered edges from lying."
date: 2026-06-15 16:24:00 -0400
categories: computer-graphics
tags: [alpha-compositing, premultiplied-alpha, computer-graphics, color-management, rendering, ui]
excerpt: "The center of a sprite is easy. The edge pixel decides whether the hidden matte leaks, whether filtering is stable, and whether the blend happened in light or in code values."
---

The center pixel is boring.

It is opaque. It knows its color. It does not have to explain itself.

The edge pixel is where the contract lives. Half the pixel belongs to the
object. Half belongs to whatever is behind it. Maybe the texture was filtered.
Maybe the background was unknown when the sprite was authored. Maybe the RGB in
a fully transparent texel still contains a color from an old matte. Maybe the
blend happened in gamma-encoded sRGB because the pipeline was fast, old, or
quietly wrong.

Alpha compositing bugs rarely announce themselves in the middle of the image.
They arrive as halos, dark seams, bright fringes, and particles that look right
on black but wrong on the actual game level.

So the question for a pixel with alpha is not:

```text
what color are you?
```

It is:

```text
what color contribution are you already carrying?
```

## The Lab

The lab below has two deliberately small experiments.

The first samples an edge between an opaque orange sprite pixel and a fully
transparent texel whose hidden RGB is cyan by default. A straight-alpha texture
interpolates RGB and alpha separately, then composites the sampled color. A
premultiplied texture stores color already multiplied by alpha, so the fully
transparent texel contributes no color when filtered.

The second blends the same orange source over a blue destination. One row blends
the displayed sRGB code values directly. The other converts to linear light,
blends, and encodes back to sRGB.

<style>
  .alpha-lab {
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

  .alpha-lab__controls {
    display: grid;
    gap: 0.78rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  }

  .alpha-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.83rem;
    font-weight: 700;
    gap: 0.34rem;
    line-height: 1.25;
    min-width: 0;
  }

  .alpha-lab__controls input,
  .alpha-lab__controls select {
    box-sizing: border-box;
    color: #172026;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .alpha-lab__controls input {
    accent-color: #2563eb;
    margin: 0;
  }

  .alpha-lab__controls select {
    appearance: none;
    background: #f8fafc;
    border: 1px solid #cbd5df;
    border-radius: 7px;
    line-height: 1.25;
    padding: 0.48rem 0.62rem;
  }

  .alpha-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .alpha-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
    margin: 0.95rem 0 0.85rem;
  }

  .alpha-lab__metric {
    background: #f8fafc;
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    min-width: 0;
    padding: 0.58rem 0.62rem;
  }

  .alpha-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .alpha-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(1rem, 2.8vw, 1.28rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    margin-top: 0.16rem;
    overflow-wrap: anywhere;
  }

  .alpha-lab__canvas {
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 720px;
    margin: 0.85rem 0;
    max-width: 100%;
    width: 100%;
  }

  .alpha-lab__legend {
    align-items: center;
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.45rem 0.8rem;
    line-height: 1.45;
    margin: 0.4rem 0 0;
  }

  .alpha-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.3rem;
    min-width: 0;
  }

  .alpha-lab__legend i {
    border-radius: 3px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .alpha-lab__legend .is-ideal {
    background: #0f766e;
  }

  .alpha-lab__legend .is-straight {
    background: #be123c;
  }

  .alpha-lab__legend .is-premul {
    background: #2563eb;
  }

  .alpha-lab__legend .is-gamma {
    background: #d97706;
  }

  .alpha-lab__legend .is-linear {
    background: #7c3aed;
  }

  @media (max-width: 520px) {
    .alpha-lab {
      padding: 0.75rem;
    }

    .alpha-lab__canvas {
      height: 720px;
    }
  }
</style>

<div class="alpha-lab" data-alpha-lab data-edge="50" data-opacity="50" data-matte="cyan" data-backdrop="paper"></div>

<script src="{{ '/assets/js/alpha-compositing-lab.js?v=20260615a' | relative_url }}"></script>

With the default settings, the edge sample has alpha `0.5`. The
straight-alpha sample over white is `#c1b6c2`; the premultiplied sample is
`#ff9685`, exactly the ideal filtered edge. The RMS fringe error from the
straight sample is `0.2108`. The premultiplied error is `0`.

The sRGB-code blend is not a small bookkeeping difference either. In the default
orange-over-blue blend, the code-value blend has only about `56.4%` of the
linear-light luminance.

## Source Over Is Not Just Interpolation

Porter and Duff's 1984 paper gave image compositing an algebra.[^porterduff]
The everyday operator is **source over**: put a source image over a destination
image. In the W3C compositing spec, the operator appears as:

```text
co = alpha_s * Cs + alpha_b * Cb * (1 - alpha_s)
alpha_o = alpha_s + alpha_b * (1 - alpha_s)
```

where `co` is the output color contribution and `alpha_o` is the output
alpha.[^w3ccomp]

That word "contribution" is the useful mental pivot.

If RGB is stored straight, a texel says:

```text
here is my color
here is my opacity
```

If RGB is stored premultiplied, it says:

```text
here is how much color I contribute
here is my opacity
```

For an opaque texel, both statements look the same. For a transparent texel,
they are very different. A fully transparent straight-RGBA texel can have any
RGB at all. The renderer is not supposed to see it after compositing, but
filtering sees it before compositing. That is how a hidden blue matte leaks into
an orange edge.

Premultiplied alpha erases that irrelevant color at storage time. If alpha is
zero, the stored color contribution is zero. Linear filtering can average
contributions without dragging in a color that should not exist.

## The Transparent Texel Is Not Empty

Alvy Ray Smith's history of digital compositing is useful because it separates
several ideas that are easy to collapse: matte creation, matte storage, printing,
and compositing.[^smithhist] His compositing memo is even more direct about the
software consequence: premultiplied alpha is not a minor encoding preference; it
is what makes a shaped image behave like an image object under `over`.[^smithfund]

The lab's first row is the failure case.

Imagine two neighboring texels:

```text
opaque orange:       RGB = orange, alpha = 1
transparent cyan:    RGB = cyan,   alpha = 0
```

A halfway bilinear sample in straight storage gives:

```text
RGB = average(orange, cyan)
alpha = 0.5
```

That averaged RGB is already contaminated. Compositing it later cannot know
which part came from visible orange and which part came from an invisible matte.

In premultiplied storage, the two texels are:

```text
opaque orange:       RGB = orange, alpha = 1
transparent cyan:    RGB = black,  alpha = 0
```

The transparent texel is not black as a color claim. It is black as a
contribution claim. A halfway sample stores half an orange contribution and
alpha `0.5`; over white, that becomes the expected half-covered orange edge.

This is why premultiplied alpha often feels less like a trick and more like a
type system. It refuses to store a color contribution that a pixel does not
make.

## The Other Contract Is Light

The second lab row is a different mistake. Even with alpha handled correctly,
the RGB arithmetic has to happen in a space where addition means adding light.

sRGB code values are nonlinear. CSS Color 4 defines `srgb-linear` as the same
sRGB primaries and whitepoint, but with a linear-light transfer function rather
than gamma encoding.[^csscolor] The spec also gives the familiar conversion from
gamma-encoded sRGB components to linear-light components.

If you blend encoded numbers directly, this operation:

```text
0.5 * orange_code + 0.5 * blue_code
```

does not mean:

```text
half the orange light plus half the blue light
```

It means arithmetic on display code values. The result is typically too dark.
In the lab's default pair, the linear-light blend encodes to `#bc33bc`, while
the direct sRGB-code blend is visibly darker. The luminance ratio tile is the
number to watch.

This is not a demand that every UI engine become a film compositor. There are
compatibility, performance, and platform constraints. But the failure mode
should be named honestly: if the math is done in code values, the blend is not
physically linear.

## Practical Checks

When a sprite has halos, I would check in this order:

1. Are texture colors premultiplied before filtering and mipmap generation?
2. Does the renderer use blend factors compatible with that representation?
3. Are transparent texels padded with plausible edge colors if straight-alpha
   storage is unavoidable?
4. Are colors decoded to linear light before operations that are supposed to add
   light?
5. Is the final result encoded exactly once for display?

The mistake can be surprisingly far from the symptom. The halo may be authored
into the texture atlas. The dark edge may be born in mipmap generation. The
particle may be correct in a linear HDR buffer and wrong only after a UI pass
re-blends encoded color.

The edge pixel keeps the receipts.

## Audit Notes

The lab exports the same formulas used in the page. Its audit checks:

- the Porter-Duff source-over alpha equation;
- premultiplied filtering equals the ideal edge in the default case;
- straight-alpha filtering leaks hidden matte color;
- changing hidden RGB changes the straight edge but not the premultiplied edge;
- fully opaque and fully transparent edge limits behave correctly;
- opaque color blends have no gamma disagreement;
- the sRGB transfer functions round-trip a midpoint;
- rendered hex colors and summary facts are finite.

Default facts:

```json
{
  "edgeAlpha": 0.5,
  "fringeError": 0.2108,
  "premulError": 0,
  "srgbDelta": 0.1692,
  "luminanceRatio": 0.564,
  "straightHex": "#c1b6c2",
  "premulHex": "#ff9685",
  "linearHex": "#bc33bc"
}
```

Alpha is not just transparency. It is a promise about which color is allowed to
count.

[^porterduff]: Thomas Porter and Tom Duff, ["Compositing Digital Images"](https://keithp.com/~keithp/porterduff/p253-porter.pdf), *Computer Graphics*, 1984.

[^w3ccomp]: W3C, ["Compositing and Blending Level 1"](https://www.w3.org/TR/compositing-1/), especially the Porter-Duff source-over operator.

[^smithhist]: Alvy Ray Smith, ["Alpha and the History of Digital Compositing"](https://www.cs.princeton.edu/courses/archive/fall00/cs426/papers/smith95c.pdf), Microsoft Technical Memo 7, 1995.

[^smithfund]: Alvy Ray Smith, ["Image Compositing Fundamentals"](https://alvyray.com/Memos/CG/Microsoft/4_comp.pdf), Microsoft Technical Memo 4, 1995.

[^csscolor]: W3C, ["CSS Color Module Level 4"](https://www.w3.org/TR/css-color-4/), sections on sRGB conversion and the `srgb-linear` color space.
