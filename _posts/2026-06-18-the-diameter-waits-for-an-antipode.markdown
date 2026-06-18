---
layout: post
title: "The Diameter Waits For An Antipode"
description: "The farthest pair in a planar point set is not hiding in the interior. Build the convex hull, rotate a support line around it, and the diameter appears among a linear number of antipodal candidates."
date: 2026-06-18 02:58:00 -0400
categories: computer-science
tags: [computational-geometry, convex-hull, rotating-calipers, algorithms, geometry, visualization]
excerpt: "A quadratic farthest-pair search collapses to a hull walk: interior points cannot win, and a rotating support line makes the opposite hull vertex advance only forward."
---

The farthest pair problem starts with a discouraging ledger.

Given $$n$$ points in the plane, there are:

$$
\binom{n}{2}
$$

distances to check. That is fine for a toy scatterplot and boringly expensive
for a geometry kernel.

But the farthest pair has a useful embarrassment: it cannot hide in the middle.

If point $$p$$ is strictly inside the convex hull, and $$q$$ is some other
point, extend the ray from $$q$$ through $$p$$ until it hits the hull boundary at
$$p'$$. Then:

$$
\|p' - q\| > \|p - q\|.
$$

So an interior point cannot be a unique endpoint of the diameter. The search
belongs on the convex hull.

That reduces the problem from "all points" to "all hull vertices." It does not
yet explain why the remaining search can be linear in the number of hull
vertices.

The missing word is **antipodal**.

## Support Lines Name The Candidates

For a convex polygon, a support line is a line that touches the polygon while
the whole polygon lies on one side of it. Two vertices are antipodal if there
are parallel support lines through them.

A diameter pair must be antipodal. If two farthest vertices did not admit
parallel supports perpendicular to the segment between them, one endpoint could
slide along the hull to make the segment longer. The exact proof is a standard
convexity argument; the useful engineering consequence is simpler:

```text
do not compare every hull pair
compare the pairs exposed by parallel supports
```

Shamos used this idea in his 1978 thesis to compute the diameter of a convex
polygon in linear time. Toussaint later named and generalized the method as
"rotating calipers": rotate support lines around the polygon and emit the
antipodal pairs encountered along the way.[^toussaint-page] Toussaint's 1983
paper describes the diameter procedure as generating all $$O(n)$$ antipodal
vertex pairs and taking the largest distance among them.[^toussaint-paper]

The picture is literal enough to be useful. Put one caliper blade along a hull
edge. Put the parallel blade against the opposite supporting vertex. Rotate the
edge blade to the next hull edge. The opposite vertex may need to advance, but
it never needs to go backward.

## The Area Test Replaces Angles

The lab below uses Andrew's monotone-chain hull construction: sort points
lexicographically, scan the lower and upper chains, and pop the last chain
vertex whenever it would make the wrong turn. The paper is short; CGAL's
bibliography records Andrew's 1979 Information Processing Letters citation as
"Another efficient algorithm for convex hulls in two dimensions."[^andrew]

Once the hull is in counterclockwise order, the caliper walk can avoid measuring
angles. For edge $$h_i h_{i+1}$$, keep an opposite index $$j$$. Advance $$j$$
while the triangle area keeps increasing:

$$
\left|\operatorname{cross}(h_{i+1}-h_i,\; h_{j+1}-h_i)\right|
>
\left|\operatorname{cross}(h_{i+1}-h_i,\; h_j-h_i)\right|.
$$

Area here is just base times height. If the next vertex is farther from the
current support line, the opposite blade has not reached its support position
yet.

The algorithm has a small but important asymmetry:

```text
for each hull edge i -> i+1:
    while opposite vertex j+1 is farther from the edge line:
        j = j + 1
    test candidate pairs involving edge endpoint(s) and j
```

Index $$i$$ moves once around the hull. Index $$j$$ also moves once around the
hull. The loop is nested syntactically, but not quadratically.

That monotonicity is the algorithm.

## The Browser Lab

The lab generates deterministic point sets, computes a monotone-chain hull, runs
the rotating-calipers diameter walk, and checks the result against exhaustive
all-pairs search over the original points.

<style>
  .calipers-lab {
    border: 1px solid #d7dee5;
    padding: 1rem;
    margin: 1.5rem 0;
    background: #ffffff;
  }

  .calipers-lab__controls {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.9rem;
  }

  .calipers-lab__controls label {
    display: grid;
    gap: 0.35rem;
    color: #172026;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
  }

  .calipers-lab__controls select,
  .calipers-lab__controls input {
    width: 100%;
  }

  .calipers-lab__controls output {
    color: #5d6872;
    font-weight: 500;
  }

  .calipers-lab__metrics {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.55rem;
    margin-bottom: 0.9rem;
  }

  .calipers-lab__metric {
    border: 1px solid #d7dee5;
    background: #f8fafc;
    padding: 0.55rem 0.65rem;
    min-width: 0;
  }

  .calipers-lab__metric span {
    display: block;
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .calipers-lab__metric strong {
    display: block;
    color: #172026;
    font-family: var(--font-ui);
    font-size: 0.88rem;
    line-height: 1.25;
    margin-top: 0.2rem;
    overflow-wrap: anywhere;
  }

  .calipers-lab__metric--good strong {
    color: #0f766e;
  }

  .calipers-lab__metric--bad strong {
    color: #be123c;
  }

  .calipers-lab canvas {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid #d7dee5;
    background: #ffffff;
  }

  .calipers-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 820px) {
    .calipers-lab {
      padding: 0.75rem;
    }

    .calipers-lab__controls,
    .calipers-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="calipers-lab" data-rotating-calipers-lab>
  <div class="calipers-lab__controls">
    <label>
      Point set
      <output data-value="shape">tilted cloud</output>
      <select data-param="shape" aria-label="Point set shape">
        <option value="cloud" selected>tilted cloud</option>
        <option value="crescent">crescent</option>
        <option value="rectangle">boxy outline</option>
        <option value="clusters">two clusters</option>
        <option value="thin">nearly flat</option>
      </select>
    </label>
    <label>
      Points
      <output data-value="count">44</output>
      <input type="range" min="8" max="96" step="1" value="44" data-param="count" aria-label="Point count">
    </label>
    <label>
      Seed
      <output data-value="seed">23</output>
      <input type="range" min="1" max="9999" step="1" value="23" data-param="seed" aria-label="Random seed">
    </label>
    <label>
      Caliper step
      <output data-value="step">0 / 0</output>
      <input type="range" min="0" max="1" step="1" value="999" data-param="step" aria-label="Caliper step">
    </label>
  </div>
  <div class="calipers-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="700" aria-label="Rotating calipers lab showing convex hull, support lines, diameter pair, candidate ledger, and distance sweep"></canvas>
  <p class="calipers-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/rotating-calipers-lab.js?v=20260618c' | relative_url }}"></script>

In the default run, `44` generated points produce `14` hull vertices. Exhaustive
search over the original points checks `946` distances. The caliper candidate
ledger checks `14` hull pairs and reports the same diameter.

Move the **Caliper step** slider. Amber marks the current hull edge's support
line. The dashed green line is the parallel support through the current opposite
vertex. The red chord is the best diameter found by the walk.

The important behavior is not the red line. It is the green vertex: as the
orange edge moves around the hull, the opposite support vertex advances forward.
The nested `while` loop has no chance to restart from zero.

## Reproducibility Check

The browser lab is also a CommonJS module. From the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/rotating-calipers-lab.js");
const audit = lab.auditGrid();
console.table(audit.byShape.map((row) => ({
  shape: row.shape,
  cases: row.cases,
  avgHull: row.avgHull.toFixed(1),
  avgCandidates: row.avgCandidates.toFixed(1),
  avgBrutePairs: row.avgBrutePairs.toFixed(1),
  passed: row.passed,
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
console.table(audit.criticalChecks);
if (audit.total !== 100 || audit.totalChecks !== 800) {
  throw new Error(`unexpected audit size: ${audit.total} cases, ${audit.totalChecks} checks`);
}
if (!audit.ok || audit.passed !== audit.total || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify(audit.errors, null, 2));
}
console.log(`${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`);
NODE
```

The current audit grid has 100 deterministic cases and 800 individual checks:
five point-set families, five point counts, and four seeds. Each case verifies:

- the monotone-chain hull is convex;
- every generated point lies inside or on the hull;
- the brute-force farthest pair over all generated points has both endpoints on
  the hull;
- the caliper diameter matches all-pairs brute force;
- the caliper candidate ledger is linear in the hull size; and
- the selected visualization event is a real event from the computed walk.

The implementation is intentionally small:
[`assets/js/rotating-calipers-lab.js`]({{ '/assets/js/rotating-calipers-lab.js' | relative_url }}).

## Where The Toy Stops

The lab uses ordinary JavaScript floating-point arithmetic and synthetic point
sets. That is fine for teaching the shape of the algorithm. It is not enough for
a production geometry kernel.

Convex hull construction and caliper advancement both depend on orientation
predicates: the sign of a cross product. Near-collinear points can make that
sign numerically fragile. Shewchuk's robust-predicate work is the classic
software answer: use fast floating-point filters and adaptive exact arithmetic
when the sign is too close to call.[^shewchuk]

Degeneracy policy also matters. Do collinear boundary points stay in the hull or
get compressed into one edge? If several opposite vertices tie for the same
support line, which candidate pairs are emitted? The lab removes collinear
middle vertices in the hull and adds tie candidates when parallel supports are
detected. A library has to specify that policy, test it, and keep it stable.

Finally, rotating calipers is not magic for every geometric distance. Toussaint's
paper emphasizes the generality of the method for many convex-polygon problems,
but also notes that some natural-looking variants do not reduce to antipodal
vertex pairs.[^toussaint-paper] The method works when the geometric optimum is
exposed by moving support lines.

For the diameter of a finite planar set, that exposure is exactly what we need:

```text
all points -> convex hull -> antipodal candidates -> longest chord
```

The quadratic ledger was real. The hull just knew which rows could not win.

[^toussaint-page]: Godfried T. Toussaint, ["The Rotating Calipers"](https://www-cgrl.cs.mcgill.ca/~godfried/research/calipers.html), McGill Computational Geometry Lab. The page credits Michael Shamos's 1978 thesis for the original diameter method and Toussaint's 1983 paper for the name and generalization.

[^toussaint-paper]: Godfried T. Toussaint, ["Solving Geometric Problems with the Rotating Calipers"](https://web.cs.swarthmore.edu/~adanner/cs97/s08/pdf/calipers.pdf), Proceedings of IEEE MELECON'83, Athens, Greece, May 1983.

[^andrew]: A. M. Andrew, "Another efficient algorithm for convex hulls in two dimensions," *Information Processing Letters* 9(5):216-219, 1979. See the [CGAL 2D Convex Hulls bibliography](https://doc.cgal.org/latest/Convex_hull_2/citelist.html).

[^shewchuk]: Jonathan Richard Shewchuk, ["Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates"](https://people.eecs.berkeley.edu/~jrs/papers/robustr.pdf), *Discrete & Computational Geometry* 18:305-363, 1997. Project page: ["Fast Robust Predicates for Computational Geometry"](https://www.cs.cmu.edu/~quake/robust.html).
