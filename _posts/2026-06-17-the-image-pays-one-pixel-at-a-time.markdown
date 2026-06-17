---
layout: post
title: "The Image Pays One Pixel at a Time"
description: "Seam carving turns resizing into a shortest-path problem: remove one low-energy connected pixel path, recompute the image, and audit what the resize actually spent."
date: 2026-06-17 10:22:00 -0400
categories: computer-graphics
tags: [seam-carving, content-aware-resizing, dynamic-programming, image-retargeting, computer-graphics, visualization]
excerpt: "A content-aware resize is not a scalar. Seam carving makes the image pay for width one connected pixel path at a time."
---

A resize sounds like a number.

Make the image `70%` as wide. Keep the height. Done.

That is fine for a texture atlas, a thumbnail with no subject, or a crop whose
losses are obvious. It is a bad mental model for a photograph. An image is not
width and height. It is sky, pavement, a face, a pole, a logo, a smooth wall,
and a hundred places where the viewer will forgive one missing pixel but not
the next one.

Seam carving is the old, sharp version of this idea. Instead of squeezing every
column, it asks a stranger question:

```text
which connected one-pixel-wide path can the image afford to lose?
```

Remove that path. Stitch the neighbors together. Recompute the bill. Do it
again.

The algorithm became famous after Avidan and Shamir's 2007 SIGGRAPH paper on
content-aware image resizing.[^avidan] The reason it still feels worth
rebuilding is not nostalgia. It is a compact case study in algorithmic taste:
turn a subjective editing problem into an energy function, solve the exact
discrete subproblem with dynamic programming, then admit that the energy
function is the whole contract.

## A Pixel Path, Not a Rectangle

A vertical seam contains one pixel in every row. Consecutive rows may stay in
the same column or move left or right by one column. That monotonicity rule is
small, but it is everything. It turns the search space into a layered graph:

```text
row y can only receive a seam from row y - 1
column x can only receive it from x - 1, x, or x + 1
```

Give each pixel an energy `e(y, x)`. The simplest version uses image gradients,
so flat sky and flat walls are cheap, edges and texture are expensive. The
minimum cost seam obeys:

$$
M(y,x)=e(y,x)+\min_{d\in\{-1,0,1\}} M(y-1,x+d).
$$

The recurrence is ordinary. The consequence is not. Cropping spends whole
rectangles. Uniform scaling taxes every object. Seam carving spends a skinny
connected path, then asks the new image what the next cheap path is.

That repeated recomputation matters. The first seam may slip through a smooth
column of sky. The twentieth seam may have used all the slack near the sky and
be forced into pavement, hair, or text. A content-aware resize has a marginal
cost curve.

## Browser Lab: The Resize Ledger

The lab uses deterministic synthetic images rather than external photos. That
makes the experiment auditable: the code knows which pixels belong to the
protected subject, can recompute the true seam cost, and can compare the carved
result to a uniform squeeze.

The default scene removes `34` vertical seams from a `104 x 70` image. With the
subject-protection mask on, the final image is `70` pixels wide while retaining
`100%` of the protected subject pixels. A uniform horizontal squeeze to the
same width would leave the subject at `67.3%` of its original width.

<style>
  .carve-lab {
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

  .carve-lab__controls {
    display: grid;
    gap: 0.78rem 0.9rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .carve-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.83rem;
    font-weight: 720;
    gap: 0.34rem;
    line-height: 1.25;
    min-width: 0;
  }

  .carve-lab__controls input,
  .carve-lab__controls select {
    box-sizing: border-box;
    color: #172026;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .carve-lab__controls input {
    accent-color: #e11d48;
    margin: 0;
  }

  .carve-lab__controls select {
    appearance: none;
    background: #f8fafc;
    border: 1px solid #cbd5df;
    border-radius: 7px;
    line-height: 1.25;
    padding: 0.48rem 0.62rem;
  }

  .carve-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .carve-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0.95rem 0 0.85rem;
  }

  .carve-lab__metric {
    background: #f8fafc;
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    min-width: 0;
    padding: 0.58rem 0.62rem;
  }

  .carve-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .carve-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(1rem, 2.8vw, 1.28rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    margin-top: 0.16rem;
    overflow-wrap: anywhere;
  }

  .carve-lab__canvas {
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin: 0.85rem 0;
    max-width: 100%;
    width: 100%;
  }

  .carve-lab__legend {
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

  .carve-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.3rem;
    min-width: 0;
  }

  .carve-lab__legend i {
    border-radius: 3px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .carve-lab__legend .is-seam {
    background: #e11d48;
  }

  .carve-lab__legend .is-low {
    background: #2b6cb0;
  }

  .carve-lab__legend .is-high {
    background: #d97706;
  }

  .carve-lab__legend .is-subject {
    background: #7c3aed;
  }

  @media (max-width: 620px) {
    .carve-lab {
      padding: 0.75rem;
    }

    .carve-lab__canvas {
      height: 980px;
    }
  }
</style>

<div class="carve-lab" data-seam-carving-lab data-scene="plaza" data-mode="backward" data-seams="34" data-protection="650"></div>

<script src="{{ '/assets/js/seam-carving-lab.js?v=20260617a' | relative_url }}"></script>

Try turning subject protection down to zero on the plaza scene. Gradient energy
does not understand objects. It understands contrast. A smooth, important
object can be cheaper than a textured, unimportant background. That is the
central bargain: seam carving is exact with respect to its energy, not exact
with respect to human meaning.

The energy selector changes the ledger. Backward energy charges the pixels
removed from the current image. Forward-style energy adds a transition cost for
the new neighbors that will be stitched together after removal. Rubinstein,
Shamir, and Avidan introduced this forward-looking idea when extending seam
carving to images and video retargeting.[^forward] The lab keeps it to the
image case: if removing a pixel would join two very different neighbors, that
removal is less attractive.

## The Greedy Part Is Not the Dynamic Program

One seam is globally optimal for the current image under the current energy.
Many seams are usually found greedily:

```text
find the cheapest seam
remove it
recompute energy
repeat
```

That distinction is easy to lose. The dynamic program is exact. The sequence of
many removals is a policy.

If you knew the final width in advance, you might want a joint optimization
over all removed pixels, with penalties for where removals concentrate. If you
were resizing video, a seam in one frame might flicker in the next. The 2008
video paper replaces independent frame decisions with surfaces in a
spacetime volume and uses graph cuts to enforce valid connected seams.[^forward]

The browser lab is intentionally smaller. It shows the still-image primitive,
then leaves the marginal curve visible. The plot on the lower right is the
resize getting more expensive as cheap paths are spent.

## The Mask Is Not a Hack

A protection mask can feel like cheating. It is not.

It is an honest declaration that the energy function is incomplete.

Avidan and Shamir already allowed user-specified regions for protection and
object removal.[^avidan] The later video work notes that higher-level detectors
or user scribbles can be folded into the pixel energy.[^forward] This is the
right abstraction: the dynamic program does not need to know what a face,
umbrella, logo, or product shot is. It needs a scalar cost for deleting each
pixel.

That scalar may come from:

- gradient magnitude;
- a saliency model;
- a segmentation mask;
- a face detector;
- a user paint stroke;
- a downstream task loss.

The algorithm stays the same. The ethics of the edit move into the energy.

This is also where seam carving differs from many machine-learning demos. The
optimizer is not mysterious. If the output is bad, there are only a few places
to look: the energy map, the transition cost, the removal policy, or the
assumption that a thin path can be removed without changing meaning.

## When It Fails

Seam carving likes images with expendable low-energy regions: sky, water,
walls, repeated texture, blank margin. It struggles when every region matters,
when straight lines must stay straight, when repeated removals concentrate in
one semantic object, or when a textured background looks more important than a
smooth foreground.

That is why the stronger media-retargeting literature does not crown a single
operator. Rubinstein, Shamir, and Avidan's multi-operator work explicitly
combines cropping, scaling, and seam carving because different target sizes and
images prefer different distortions.[^multiop] Setlur and coauthors' earlier
automatic image retargeting work also framed the problem around preserving
recognizable important regions on small displays, not around one universal
resize rule.[^setlur]

The practical lesson is simple:

```text
first ask what kind of damage is acceptable
then choose the operator that makes that damage visible and steerable
```

Cropping deletes context. Scaling changes shape. Seam carving deletes a path
and hides the join. Hiding the join is powerful, but it is also the risk.

## Lab Manifest

The JavaScript exports the same functions used by the page. Its audit checks:

- parameter cleanup and deterministic image dimensions;
- the generated scene contains protected subject pixels;
- every seam is in bounds and moves at most one column per row;
- the reported seam cost equals the sum of selected pixel energies;
- seam removal shrinks every row by exactly one pixel;
- zero removals leave the image and subject count unchanged;
- protection keeps at least as much subject as raw gradient energy;
- the default protected carve keeps more subject area than uniform squeezing;
- forward mode returns finite results and changes the accounting on a textured
  scene;
- center-crop dimensions and summary facts are finite.

Default facts from the audit:

```json
{
  "scene": "plaza",
  "mode": "backward",
  "removedSeams": 34,
  "newWidth": 70,
  "subjectKeptPct": 100,
  "cropSubjectKeptPct": 100,
  "uniformSubjectPct": 67.3,
  "meanSeamEnergy": 0.028,
  "meanJoinCost": 0.013,
  "subjectSeamRate": 0
}
```

A content-aware resize is not a scalar. It is an argument about which pixels
are allowed to pay.

[^avidan]: Shai Avidan and Ariel Shamir, ["Seam Carving for Content-Aware Image Resizing"](https://www.merl.com/publications/docs/TR2007-087.pdf), ACM SIGGRAPH 2007. DOI: [10.1145/1275808.1276390](https://doi.org/10.1145/1275808.1276390).

[^forward]: Michael Rubinstein, Ariel Shamir, and Shai Avidan, ["Improved Seam Carving for Video Retargeting"](https://www.merl.com/publications/docs/TR2008-064.pdf), ACM Transactions on Graphics 27(3), 2008. DOI: [10.1145/1360612.1360615](https://doi.org/10.1145/1360612.1360615).

[^multiop]: Michael Rubinstein, Ariel Shamir, and Shai Avidan, ["Multi-operator Media Retargeting"](https://research.google/pubs/multi-operator-media-retargeting/), ACM Transactions on Graphics 28(3), 2009.

[^setlur]: Vidya Setlur, Saeko Takagi, Ramesh Raskar, Michael Gleicher, and Bruce Gooch, ["Automatic Image Retargeting"](https://graphics.cs.wisc.edu/Papers/2005/STRGG05/), International Conference on Mobile and Ubiquitous Multimedia, 2005.
