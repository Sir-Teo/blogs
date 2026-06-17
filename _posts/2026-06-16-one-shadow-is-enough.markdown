---
layout: post
title: "One Shadow Is Enough"
description: "A collision detector does not need to understand two convex shapes all at once. If one projection leaves daylight between them, the case is closed."
date: 2026-06-16 23:05:00 -0400
categories: software-engineering
tags: [collision-detection, separating-axis-theorem, game-physics, computational-geometry, convex-geometry, software-engineering, games]
excerpt: "For convex hitboxes, a miss is often easier to prove than a hit. Project both shapes onto a candidate axis; if their shadows do not overlap, the shapes cannot be touching."
---

A collision bug rarely presents itself as a theorem.

It presents itself as a complaint:

```text
that corner hit me
that bullet went through the wall
that crate is vibrating because the solver keeps changing its mind
```

Underneath the complaint is a yes-or-no question asked thousands of times per
frame:

```text
do these two shapes intersect?
```

The pretty answer would be to understand the whole two-dimensional picture.
The useful answer is lazier. Look for one direction in which the shapes cast
separate shadows. If that direction exists, they are not colliding.

One shadow is enough.

## The Test

Take a unit direction $$u$$. A point $$p$$ lands on that axis at the scalar
$$p\cdot u$$. A convex polygon becomes an interval:

$$
I(P,u)=
\left[
\min_{p\in P} p\cdot u,\,
\max_{p\in P} p\cdot u
\right].
$$

For two convex polygons $$A$$ and $$B$$:

```text
if I(A, u) and I(B, u) are disjoint for some u,
then A and B are disjoint.
```

That is the easy half. The slightly surprising half is that, in 2D, we do not
need to try every possible direction. For convex polygons, testing normals to
the edges of both polygons is sufficient.[^eberly] David Eberly's separating
axes note states the projection criterion directly, then specializes it to
convex polygons by testing edge normals.[^eberly]

Why edge normals? Imagine two convex polygons just barely touching. The contact
is supported by a line. In the generic cases, that line is flush with an edge of
one polygon, or the limiting version of such a line. The separating direction is
perpendicular to that supporting line. So the finite candidate list is:

```text
all edge normals of A
all edge normals of B
deduplicate parallel axes
project both shapes
if any projected intervals have a gap, return "separated"
otherwise return "overlap"
```

Here is the whole narrow-phase idea, minus rendering:

```js
function project(poly, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of poly) {
    const value = point[0] * axis[0] + point[1] * axis[1];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function intervalOverlap(a, b) {
  return Math.min(a.max, b.max) - Math.max(a.min, b.min);
}

function sat(polyA, polyB, axes) {
  let minimumOverlap = Infinity;
  let minimumAxis = null;

  for (const axis of axes) {
    const a = project(polyA, axis);
    const b = project(polyB, axis);
    const overlap = intervalOverlap(a, b);

    if (overlap < 0) {
      return { colliding: false, gap: -overlap, axis };
    }

    if (overlap < minimumOverlap) {
      minimumOverlap = overlap;
      minimumAxis = axis;
    }
  }

  return { colliding: true, overlap: minimumOverlap, axis: minimumAxis };
}
```

Notice what the algorithm is optimized to find first: a reason to say no.

## The Lab

The browser experiment below runs the actual SAT calculation from
`assets/js/separating-axis-lab.js`. The rectangle contributes two unique axes,
the pentagon contributes five, and the lab deduplicates parallel directions.

The default state is deliberately near contact:

```text
candidate axes      7
default state       separated
largest gap         12.49 px
critical axis       A#2
pulled-in overlap   19.79 px
farther gap         73.14 px
```

The important panel is not the polygon panel. It is the shadow test. The shapes
look close in the plane, but on one edge-normal axis their projected intervals
leave a visible gap.

<style>
  .sat-lab {
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

  .sat-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(134px, 1fr));
    margin-bottom: 1rem;
  }

  .sat-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .sat-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .sat-lab input {
    accent-color: #0f766e;
    width: 100%;
  }

  .sat-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .sat-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .sat-lab__metric.good {
    border-color: #9ed8c5;
  }

  .sat-lab__metric.warn {
    border-color: #f2b8c4;
  }

  .sat-lab__metric span,
  .sat-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .sat-lab__metric span {
    display: block;
  }

  .sat-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .sat-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .sat-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .sat-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .sat-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .sat-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 520px) {
    .sat-lab {
      padding: 0.75rem;
    }

    .sat-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="separating-axis-lab" class="sat-lab" data-separating-axis-lab>
  <div class="sat-lab__controls">
    <label>
      Offset X: <output data-value="offsetX">68</output>
      <input type="range" min="-40" max="170" step="1" value="68" data-param="offsetX">
    </label>
    <label>
      Offset Y: <output data-value="offsetY">10</output>
      <input type="range" min="-90" max="90" step="1" value="10" data-param="offsetY">
    </label>
    <label>
      Rotate A: <output data-value="angleA">12 deg</output>
      <input type="range" min="-55" max="55" step="1" value="12" data-param="angleA">
    </label>
    <label>
      Rotate B: <output data-value="angleB">-20 deg</output>
      <input type="range" min="-75" max="75" step="1" value="-20" data-param="angleB">
    </label>
    <label>
      Scale B: <output data-value="scaleB">100%</output>
      <input type="range" min="70" max="135" step="1" value="100" data-param="scaleB">
    </label>
  </div>
  <div class="sat-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="700" aria-label="Separating axis theorem collision lab showing convex polygons, projection intervals, candidate axes, and collision margin while moving one polygon"></canvas>
  <div class="sat-lab__legend">
    <span><i style="background:#2563eb"></i> Polygon A</span>
    <span><i style="background:#0f766e"></i> Polygon B</span>
    <span><i style="background:#d97706"></i> Separating gap</span>
    <span><i style="background:#be123c"></i> Overlap / MTV axis</span>
    <span><i style="background:#7c3aed"></i> Offset sweep</span>
  </div>
  <p class="sat-lab__note">
    Deterministic browser experiment. Each frame transforms two convex polygons,
    builds edge-normal candidate axes, projects both polygons onto every axis,
    and reports the first geometric reason to reject collision, or the smallest
    overlap axis when no rejection remains.
  </p>
</div>
<script defer src="{{ '/assets/js/separating-axis-lab.js?v=20260616a' | relative_url }}"></script>

Move **Offset X** left to about `35`. The gap disappears, the state flips to
`overlap`, and the critical axis changes meaning. It is no longer a proof of
separation. It is the shallowest overlap axis, often used as a candidate
minimum-translation vector for simple collision response.

That is useful, but it is not magic. A minimum-translation vector from SAT is a
local geometric hint. A real physics solver still has to care about velocity,
friction, restitution, stacking, constraints, warm starting, and numerical
tolerance.

## The Ledger

SAT is pleasantly auditable because every axis leaves a row in the ledger.

For each candidate axis:

```text
negative margin = projected intervals are apart
positive margin = projected intervals overlap
```

The no-collision case has at least one negative row. The collision case has
none. Among overlapping rows, the smallest positive row is the least expensive
axis along which to separate the shapes.

This makes SAT a good debugging algorithm. When a hitbox feels wrong, you can
print the axis ledger and see whether the claim rests on one barely-negative
gap, a pile of positive overlaps, or an axis that should not have been tested
because the polygon winding or convexity is broken.

The implementation detail I like is that the theorem gives you an audit log for
free:

```js
const rows = axes.map((entry) => {
  const a = project(polyA, entry.axis);
  const b = project(polyB, entry.axis);
  const overlap = Math.min(a.max, b.max) - Math.max(a.min, b.min);

  return {
    axis: entry.axis,
    edge: entry.edge,
    owner: entry.owner,
    gap: Math.max(0, -overlap),
    overlap,
    separated: overlap < 0
  };
});
```

You do not need a separate explanation system. The same values that decide the
answer explain the answer.

## What Convex Buys

The word "convex" is doing almost all the work.

If a shape is convex, every line segment between two points of the shape stays
inside the shape. That prevents a projection from hiding a hole or bite mark.
For concave shapes, shadows can overlap in every tested direction while the
actual shapes miss, unless the shape is decomposed into convex pieces or the
candidate set is changed.

In production game engines this usually becomes a hierarchy:

```text
broad phase     cheap spatial rejection, such as grids, sweep-and-prune, BVHs
narrow phase    SAT, GJK, EPA, clipped features, shape-pair routines
solver          impulses and constraints across contacts
```

SAT is a narrow-phase tool. It should not be asked to compare every object
against every other object. It also should not be treated as the entire physics
engine.

The 3D version has the same spirit and more axes. For convex polyhedra, Eberly
lists face normals plus cross products of one edge from each polyhedron.[^eberly]
For oriented bounding boxes, the OBBTree paper uses a separating-axis test in
which the candidate directions reduce to the three face axes of each box plus
the nine pairwise edge-cross-edge directions.[^obbtree] That finite list is one
reason OBBs became practical bounding volumes for interactive interference
detection: Gottschalk, Lin, and Manocha report OBBTrees detecting contacts
among models with hundreds of thousands of polygons at interactive rates.[^obbtree]

## SAT And GJK

SAT is not the only beautiful answer to convex collision.

The Gilbert-Johnson-Keerthi algorithm, usually called GJK, attacks the same
family of problems through support functions and the Minkowski difference. The
original Gilbert, Johnson, and Keerthi paper gives an algorithm for Euclidean
distance between convex sets in $$\mathbb{R}^m$$ and is still the reference
point for many real-time collision systems.[^gjk]

The cartoon comparison is:

```text
SAT asks: does some projection axis separate the shadows?
GJK asks: does the Minkowski difference contain the origin?
```

SAT is direct when the candidate axes are cheap and explicit, such as boxes and
small convex polygons. GJK is attractive when a shape can cheaply answer support
queries, even if enumerating all useful feature axes is inconvenient. Many
engines use both families somewhere, because "best collision algorithm" is not
a universal category. It depends on shape representation, temporal coherence,
whether you need distance, whether you need contact points, and how much
numerical damage your solver can tolerate.

Christer Ericson's *Real-Time Collision Detection* is still the book I would put
beside this topic for implementation judgment rather than theorem collecting;
the companion site collects the errata and related material.[^ericson]

## The Small Moral

SAT is a reminder that good geometry code often wins by proving absence.

The detector does not need a grand theory of the scene. It needs one separating
axis. One direction in which the shadows do not touch. One signed margin that
survives floating-point tolerance.

When there is a gap, the case is closed.

When there is no gap, the interesting engineering begins.

[^eberly]: David Eberly, ["Intersection of Convex Objects: The Method of Separating Axes"](https://www.geometrictools.com/Documentation/MethodOfSeparatingAxes.pdf), Geometric Tools, created 2001, last modified 2022.

[^obbtree]: Stefan Gottschalk, Ming C. Lin, and Dinesh Manocha, ["OBBTree: A Hierarchical Structure for Rapid Interference Detection"](https://gamma.cs.unc.edu/SSV/obb.pdf), SIGGRAPH 1996.

[^gjk]: Elmer G. Gilbert, Daniel W. Johnson, and S. Sathiya Keerthi, ["A fast procedure for computing the distance between complex objects in three-dimensional space"](https://graphics.stanford.edu/courses/cs448b-00-winter/papers/gilbert.pdf), *IEEE Journal of Robotics and Automation*, 4(2):193-203, 1988. DOI: [10.1109/56.2083](https://doi.org/10.1109/56.2083).

[^ericson]: Christer Ericson, [*Real-Time Collision Detection* companion site](https://realtimecollisiondetection.net/), Morgan Kaufmann, 2005.
