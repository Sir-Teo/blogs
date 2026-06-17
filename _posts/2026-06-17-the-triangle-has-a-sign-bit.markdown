---
layout: post
title: "The Triangle Has a Sign Bit"
description: "The orientation predicate looks like a tiny determinant. In computational geometry, that sign bit is a topology decision, and ordinary floating-point arithmetic can erase it."
date: 2026-06-17 01:46:00 -0400
categories: software-engineering
tags: [computational-geometry, floating-point, robust-predicates, exact-arithmetic, numerical-stability, geometry, algorithms]
excerpt: "A triangle can have area one and still look collinear after rounding. Robust geometry starts by treating the sign of a determinant as a contract."
---

The most dangerous number in a geometry engine is sometimes not a coordinate.

It is a sign.

```text
left turn
right turn
collinear
```

That one-bit-ish answer decides whether a point enters a convex hull, whether
two segments cross, whether a Delaunay edge flips, whether a polygon is inside
out, and whether a sweep-line data structure keeps a coherent topology.

The formula is small enough to memorize:

$$
\operatorname{orient}(A,B,C)
= (B_x-A_x)(C_y-A_y) - (B_y-A_y)(C_x-A_x).
$$

Positive means `A -> B -> C` turns left. Negative means it turns right. Zero
means collinear.

The formula is not the problem.

The problem is that a geometric algorithm usually treats that sign as a
mathematical predicate, while the machine computes it as a rounded arithmetic
program.

## This Is Not Just Numerical Error

Goldberg's floating-point tutorial starts from the unavoidable fact that real
results must often be rounded into a finite representation.[^goldberg] IEEE
754 makes that world dramatically better by specifying formats, operations,
rounding, exceptional values, and interchange behavior.[^ieee] This is a great
engineering contract.

It is not real arithmetic.

For many numerical programs, a small relative error is acceptable. A simulation
with a slightly different final decimal may still be a good simulation. A
linear solve with a small backward error may be perfectly respectable.

Computational geometry is less forgiving because arithmetic decisions become
combinatorial decisions. If one predicate says three points are clockwise while
another nearby predicate says the implied edge order is impossible, the program
may not merely be inaccurate. It may build a data structure that has no
geometric interpretation.

The CGAL manual states the practical issue plainly: geometric algorithms are
usually proved assuming exact arithmetic, while hardware arithmetic does not
implement the real numbers; wrong or contradictory decisions can lead to
crashes or garbage outputs.[^cgal-robust]

So the unit of correctness is not:

```text
small determinant error
```

It is:

```text
correct determinant sign
```

## Two Ways to Lose a Triangle

The lab below separates two failures that often get blended together.

The first is **determinant rounding**. The input coordinates are exactly
representable as JavaScript `Number` values, but the two products in the
determinant are large enough that subtracting them loses the unit difference.

The second is **input rounding**. The intended source coordinates live on an
integer grid, but converting them to binary64 has already rounded away the
small offsets. No predicate over the rounded `Number` values can recover the
original triangle. You need to keep a more exact source representation, or
accept that the input geometry changed.

<style>
  .orient-lab {
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

  .orient-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    margin-bottom: 1rem;
  }

  .orient-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .orient-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .orient-lab input,
  .orient-lab select {
    font: inherit;
    min-height: 2rem;
    width: 100%;
  }

  .orient-lab select {
    background: #ffffff;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    padding: 0.2rem 0.45rem;
  }

  .orient-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .orient-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .orient-lab__metric.good {
    border-color: #9ed8c5;
  }

  .orient-lab__metric.warn {
    border-color: #f1c889;
  }

  .orient-lab__metric.bad {
    border-color: #f0b7b7;
  }

  .orient-lab__metric span,
  .orient-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .orient-lab__metric span {
    display: block;
  }

  .orient-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .orient-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .orient-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .orient-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .orient-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .orient-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 540px) {
    .orient-lab {
      padding: 0.75rem;
    }

    .orient-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="orientation-predicate-lab" class="orient-lab" data-orientation-predicate-lab>
  <div class="orient-lab__controls">
    <label>
      Case: <output data-value="scenario">wide-product cancellation</output>
      <select data-param="scenario" aria-label="Predicate case">
        <option value="product" selected>wide-product cancellation</option>
        <option value="input">lost input bit</option>
        <option value="safe">well-spaced control</option>
      </select>
    </label>
    <label>
      Coordinate scale: <output data-value="scale">power of two 27</output>
      <input type="range" min="20" max="32" step="1" value="27" data-param="scale" aria-label="Coordinate scale">
    </label>
    <label>
      Tolerance: <output data-value="tolerance">off</output>
      <input type="range" min="0" max="8" step="1" value="0" data-param="tolerance" aria-label="Tolerance power">
    </label>
  </div>
  <div class="orient-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="760" aria-label="Orientation predicate lab comparing exact integer, exact rounded binary64, naive double, tolerance, and filtered decisions"></canvas>
  <div class="orient-lab__legend">
    <span><i style="background:#2563eb"></i> point A</span>
    <span><i style="background:#7c3aed"></i> point B</span>
    <span><i style="background:#d97706"></i> point C</span>
    <span><i style="background:#0f766e"></i> certified sign</span>
    <span><i style="background:#be123c"></i> wrong sign</span>
  </div>
  <p class="orient-lab__note">
    Deterministic predicate test bench. The audit verifies determinant-product
    cancellation at scale 2^27, source-coordinate loss at scale 10^16, agreement
    on smaller scales, exact binary64 sign reconstruction, and the filtered
    fallback decision. It is not a complete Shewchuk expansion implementation;
    it is a small source-grid and rounded-input verifier.
  </p>
</div>
<script defer src="{{ '/assets/js/orientation-predicate-lab.js?v=20260617a' | relative_url }}"></script>

With the default **wide-product cancellation** case, the points are:

```text
A = (0, 0)
B = (M,   M + 1)
C = (M+1, M + 2)
M = 2^27
```

The exact determinant is:

$$
M(M+2) - (M+1)(M+1) = -1.
$$

All three coordinates around \(M\) are exactly representable as binary64
numbers. The input is not the issue. The issue is the products. They are around
\(2^{54}\), where binary64 spacing is larger than one, so the two products
round to the same floating-point value. The naive determinant becomes zero.

The exact sign says:

```text
right turn
```

The naive double path says:

```text
collinear
```

That is enough to break an algorithm whose next branch expects a real
orientation predicate.

Now switch to **lost input bit** at scale `10^16`.

The intended source-grid points are:

```text
A = (10^16,     10^16)
B = (10^16 + 1, 10^16 + 1)
C = (10^16 + 2, 10^16 + 3)
```

The exact determinant is `+1`, a left turn. But around `10^16`, a binary64
number cannot represent every adjacent integer. The `+1` offset disappears.
Two vertices partially collapse before the orientation formula runs.

This is a different failure. A robust predicate over binary64 inputs can tell
you the exact sign of the rounded binary64 coordinates. It cannot infer that
the caller meant an integer grid point that was never delivered.

The fix is not "use Shewchuk harder." The fix is to keep the right
representation at the boundary: integer coordinates, fixed-point coordinates,
rationals, decimal strings, or another exact source model when those low bits
matter.

## Why Filters Work

Shewchuk's robust predicates are famous because they do not simply replace
every operation with slow arbitrary precision. The fast path computes an
ordinary floating-point estimate. If an error bound proves that the sign cannot
change, the predicate returns. If the sign is uncertain, the computation
expands precision adaptively until the sign is guaranteed.[^shewchuk]

Fortune and Van Wyk used a related filtering idea for exact integer arithmetic:
try a fast approximate test, then use exact arithmetic only when interval-style
error analysis says the approximate sign is not reliable.[^fortune]

That is the key pattern:

```text
approximate value + certified error bound
```

If zero is outside the error interval, the sign is known. If zero is inside,
the sign is not known yet. Guessing with an epsilon is not the same thing.

The lab's filtered path is deliberately small. It uses a standard-looking
forward-error bound for the 2D orientation estimate and falls back to exact
`BigInt` arithmetic on the source integer grid. It also computes the exact sign
of the rounded binary64 inputs by decoding the `Number` bits into rational
values. That second ledger is there to keep the caveat honest.

## The Epsilon Trap

The common patch is:

```text
if abs(det) < eps:
    pretend collinear
```

Sometimes that is a product decision, not a numerical method. Games, UI
systems, physics engines, and CAD importers may intentionally snap geometry to
a tolerance because the application wants a finite-resolution world.

But then the tolerance is part of the geometry.

It must be tied to the coordinate scale, downstream topology, and user promise.
One global epsilon cannot mean "close enough" for a tiny glyph outline and a
city-scale map at the same time. Worse, tolerance decisions can violate
predicate consistency: one triangle is declared collinear, a neighboring one is
not, and the mesh inherits a crack.

Exact geometric computation takes the opposite stance. CGAL's exact computation
paradigm uses higher precision when needed so that predicates behave according
to their mathematical specification; common kernels distinguish exact
predicates from exact constructions because many algorithms only need the
branch decisions to be exact.[^cgal-exact][^cgal-kernel]

That split is worth remembering:

```text
predicate:     a decision, such as orientation or in-circle
construction:  a new geometric object, such as an intersection point
```

Exact predicates with inexact constructions are often a practical compromise.
The branches are protected. The constructed coordinates may still be rounded.
If later predicates depend on those constructed objects, the contract has to be
revisited.

## A Debugging Checklist

When a geometry bug only appears on some inputs, ask questions in this order:

```text
What predicate made the first wrong topological decision?
Were the source coordinates already rounded before the predicate saw them?
Is the determinant sign wrong, or merely too close for the current fast path?
Does the algorithm require exact predicates, exact constructions, or both?
Is an epsilon being used as a numerical proof or as a deliberate snapping rule?
Are coordinate transforms increasing scale before small offsets are tested?
Can the code isolate predicates behind a kernel instead of scattering arithmetic?
```

The last item is a software-engineering point, not a math point. Robustness is
hard to retrofit when every caller computes its own little determinant. It is
much easier when orientation, incircle, side-of-plane, and distance comparisons
live behind a small predicate API with an explicit arithmetic contract.

The tiny determinant is not just a formula.

It is where continuous coordinates become discrete control flow.

The triangle has a sign bit. Treat it like one.

[^goldberg]: David Goldberg, ["What Every Computer Scientist Should Know About Floating-Point Arithmetic"](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html), *ACM Computing Surveys* 23(1), 1991.

[^ieee]: IEEE Standards Association, ["IEEE 754-2019: Standard for Floating-Point Arithmetic"](https://standards.ieee.org/ieee/754/6210/), approved 2019.

[^cgal-robust]: Olivier Devillers and Stefan Schirra, ["Robustness Issues"](https://doc.cgal.org/latest/Manual/devman_robustness.html), CGAL Manual.

[^shewchuk]: Jonathan Richard Shewchuk, ["Adaptive Precision Floating-Point Arithmetic and Fast Robust Predicates for Computational Geometry"](https://www.cs.cmu.edu/~quake/robust.html), *Discrete & Computational Geometry* 18:305-363, 1997. PDF: [robustr.pdf](https://people.eecs.berkeley.edu/~jrs/papers/robustr.pdf).

[^fortune]: Steven Fortune and Christopher J. Van Wyk, ["Efficient Exact Arithmetic for Computational Geometry"](https://doi.org/10.1145/160985.161015), SCG, 1993. OpenAIRE summary: [publication page](https://oamonitor.ireland.openaire.eu/rpo/rcsi/search/publication?pid=10.1145%2F160985.161015).

[^cgal-exact]: CGAL, ["The Exact Computation Paradigm"](https://www.cgal.org/exact.html).

[^cgal-kernel]: CGAL, ["2D and 3D Linear Geometry Kernel: Predefined Kernels"](https://doc.cgal.org/latest/Kernel_23/index.html).
