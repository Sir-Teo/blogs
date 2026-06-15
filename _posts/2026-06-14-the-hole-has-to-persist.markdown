---
layout: post
title: "The Hole Has to Persist"
description: "Persistent homology turns a point cloud into a scale experiment. Components and loops are allowed to appear and die; the barcode records which ones survive long enough to be believed."
date: 2026-06-14 20:56:00 -0400
categories: applied-math
tags: [persistent-homology, topological-data-analysis, vietoris-rips, barcodes, computational-topology, machine-learning]
excerpt: "A point cloud does not have one topology. It has a story across scale. Persistent homology asks which connected components and holes survive that story."
---

The most dangerous sentence in data analysis is:

```text
I can see the shape.
```

Sometimes you can. A scatterplot bends around an empty center. A trajectory
looks cyclic. A representation space separates into islands. A sensor trace
returns to a loop. But the eye is an impatient topologist. It picks one scale,
forgives missing samples, ignores outliers, and promotes a visual impression
into a claim.

Persistent homology makes that claim slower.

It says: do not ask whether the point cloud has a hole. Ask when the hole is
born, when it dies, and how long it survives while the scale changes.

That shift is small and deep. The object is no longer a picture. It is an
experiment over radius.

## The Radius Is the Experiment

Start with points \(x_1,\ldots,x_n\). At radius \(r=0\), every point is alone.
As \(r\) grows, connect points whose distance is at most \(r\). Whenever three
points are mutually connected, fill in the triangle. Whenever four are mutually
connected, the full Vietoris-Rips complex would also include a tetrahedron, and
so on.

For this post, the browser lab builds the 2-skeleton:

- vertices,
- edges,
- triangles.

That is enough to compute \(H_0\), connected components, and \(H_1\), loops, for
the toy point clouds below.

The growing family

$$
K_0 \subseteq K_{r_1} \subseteq K_{r_2} \subseteq \cdots
$$

is a filtration. Edelsbrunner, Letscher, and Zomorodian described persistence as
a way to classify topological changes during such growth as features or noise
depending on their lifetime.[^elz] That lifetime is the key. A tiny accidental
gap may appear at one radius and disappear almost immediately. A real loop
should remain alive across a range of radii.

The barcode is the receipt.

```text
birth radius ---------------- death radius
```

A long bar is not proof that the world truly contains a circle. It is evidence
that, under this metric and this filtration, a topological feature survived many
scale choices.

## What Is Being Counted

The Betti numbers are the small integers behind the picture:

$$
\beta_0 = \text{number of connected components},
\qquad
\beta_1 = \text{number of independent loops}.
$$

At small radius, \(\beta_0\) is large because every point is isolated. As edges
appear, components merge and \(\beta_0\) falls. If the points sit around a ring,
there is often a middle band of radii where the graph has closed around the
center but triangles have not yet filled the center. During that band,
\(\beta_1=1\).

At larger radius, the same triangles that make the complex less stringy can
also kill the loop. The hole was not false because it died. Death is part of the
measurement.

Ghrist's barcode survey frames this as replacing a data set with a family of
simplicial complexes indexed by a proximity parameter, then reading global
topological objects from that family.[^ghrist] Carlsson's "Topology and Data"
made the broader case that topology gives data analysis tools for qualitative
structure: connectedness, loops, flares, branches, and invariants less tied to
coordinates than ordinary geometric summaries.[^carlsson]

The lab is a small version of that program.

## The Reduction Algorithm, Briefly

The code does not draw fake bars. It computes them.

For a Vietoris-Rips filtration, each simplex enters at a radius:

- a vertex enters at 0;
- an edge \([i,j]\) enters at \(d(x_i,x_j)\);
- a triangle \([i,j,k]\) enters when all three of its edges exist, so at
  \(\max(d_{ij}, d_{ik}, d_{jk})\).

Sort all simplices by filtration value, with faces before cofaces at ties. Then
build the boundary matrix over \(\mathbb{F}_2\), so addition is xor. A triangle's
boundary is its three edges. An edge's boundary is its two vertices.

The standard reduction reads columns from left to right:

```text
reduce the current boundary column by earlier columns
if the reduced column is zero:
    this simplex births a homology class
else:
    its lowest remaining face identifies the class it kills
```

Zomorodian and Carlsson placed persistent homology in an algebraic framework and
derived a natural algorithm for computing interval decompositions over fields,
which is the setting used here.[^zc] The browser implementation is deliberately
small, but it follows this same face-before-coface filtration and mod-2 boundary
reduction idea.

## A Barcode Bench

The default point cloud is a noisy ring: 24 points, one outlier, noise level 8%,
and selected radius \(r=0.28\). The lab builds 2324 simplices and computes all
finite \(H_0\) and \(H_1\) intervals in the 2-skeleton.

The Node audit of the same code reports:

```text
default beta0 at r        1
default beta1 at r        1
longest H1 persistence    0.4137
finite H1 bars            1
simplices                 2324
```

For comparison:

```text
clean ring longest H1     0.4781
figure-eight beta1 at r   2
figure-eight top H1 bars  0.1218, 0.1137
clusters beta0 at r       3
clusters beta1 at r       0
clusters longest H1       0.0445
```

That last line is the sanity check. Random clustered points can make tiny loops.
Persistence does not say "holes never happen by accident." It says accidental
holes tend to be short-lived under the scale experiment.

<style>
  .ph-lab {
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

  .ph-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
  }

  .ph-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .ph-lab__controls input,
  .ph-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .ph-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .ph-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .ph-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .ph-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .ph-lab__metric span,
  .ph-lab__legend,
  .ph-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .ph-lab__metric span {
    display: block;
  }

  .ph-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .ph-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .ph-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .ph-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .ph-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .ph-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div class="ph-lab" data-persistent-homology-lab>
  <div class="ph-lab__controls">
    <label>
      Shape
      <select data-param="shape">
        <option value="ring" selected>ring</option>
        <option value="figure8">figure-eight</option>
        <option value="clusters">clusters</option>
        <option value="crescent">crescent</option>
      </select>
    </label>
    <label>
      Points: <output data-value="points">24</output>
      <input type="range" min="14" max="28" step="1" value="24" data-param="points">
    </label>
    <label>
      Noise: <output data-value="noise">8%</output>
      <input type="range" min="0" max="28" step="1" value="8" data-param="noise">
    </label>
    <label>
      Outliers: <output data-value="outliers">1</output>
      <input type="range" min="0" max="5" step="1" value="1" data-param="outliers">
    </label>
    <label>
      Radius: <output data-value="radius">0.28</output>
      <input type="range" min="4" max="95" step="1" value="28" data-param="radius">
    </label>
    <label>
      Seed: <output data-value="seed">17</output>
      <input type="range" min="1" max="9999" step="1" value="17" data-param="seed">
    </label>
  </div>
  <div class="ph-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Persistent homology lab showing a Vietoris-Rips complex, barcode, persistence diagram, and Betti curves"></canvas>
  <div class="ph-lab__legend" aria-hidden="true">
    <span><i style="background:#172026"></i>sample</span>
    <span><i style="background:#b45309"></i>outlier</span>
    <span><i style="background:#64748b"></i>H0</span>
    <span><i style="background:#0f766e"></i>H1</span>
    <span><i style="background:#dc2626"></i>chosen radius</span>
  </div>
  <p class="ph-lab__note">
    The implementation computes Vietoris-Rips persistence up to triangles over
    F2 coefficients. It is sized for inspection in the browser, not for large
    production TDA workloads.
  </p>
</div>

<script src="{{ '/assets/js/persistent-homology-lab.js?v=20260614a' | relative_url }}"></script>

## How to Read It

In the first panel, the chosen radius draws edges and filled triangles. If the
edges close a loop before the triangles fill it, the complex has a live \(H_1\)
class.

The barcode panel is the main evidence. Gray \(H_0\) bars are connected
components. Green \(H_1\) bars are loops. The red vertical line is the selected
radius. A feature counts toward the Betti number at that radius if the red line
crosses its bar.

The persistence diagram plots birth against death. The diagonal is where
features die almost as soon as they are born. Points far above the diagonal have
long lifetimes.

The Betti curves show the same information as a time series. A good ring has a
middle plateau where \(\beta_0=1\) and \(\beta_1=1\). Clusters have a different
signature: \(\beta_0\) stays above one until bridges form, while \(\beta_1\)
usually remains near zero except for small accidental loops.

## What to Try

Switch to **clusters**.

The barcode becomes mostly a story about connected components. A few short
\(H_1\) bars may still appear, because finite samples can form little cycles.
They die quickly.

Switch to **figure-eight**.

There should be two meaningful loops for a band of radii. The two longest
\(H_1\) bars are close in length in the default audit, which is exactly what the
two-loop geometry suggests.

Raise **Noise**.

Noise does not merely jiggle the picture. It changes the birth and death
radii. If points fail to bridge around the loop evenly, the loop may be born
late. If triangles fill the center early, it may die early.

Raise **Outliers**.

Outliers stretch \(H_0\). They can also introduce spurious \(H_1\) bars by
creating accidental polygons with nearby points. Persistence helps, but it does
not delete outliers for free.

Move **Radius**.

This is the most important control. A single radius can make the same point
cloud look disconnected, loop-like, or filled in. Persistent homology is the
habit of refusing to trust only one of those views.

## What This Is Not

Persistent homology is sometimes sold as a machine that finds the true shape of
data. That is too strong.

The pipeline makes choices:

- the metric,
- the filtration,
- the coefficient field,
- the sampling density,
- the maximum dimension,
- the numerical threshold for calling a bar meaningful.

Change the metric and the barcode changes. In high-dimensional embedding
spaces, Euclidean distance may be an artifact of representation training rather
than a faithful geometry. In time-series data, delay coordinates may reveal
cycles that raw coordinates hide. In neural activations, a loop may reflect task
structure, sampling bias, periodic nuisance variation, or preprocessing.

The barcode is not an oracle. It is a disciplined summary of a scale experiment.

## Why ML People Should Care

Machine learning often reduces structure to loss, accuracy, likelihood, or
nearest-neighbor statistics. Those are powerful, but they can miss global shape.

Topology asks questions like:

- Did this representation collapse several classes into one connected region?
- Does a latent trajectory loop because the underlying process is periodic?
- Do generated samples cover a manifold or only isolated patches?
- Does an embedding have flares and branches that a cluster count hides?
- Do adversarial or out-of-distribution samples create tunnels in feature space?

The answer is rarely "run persistent homology and believe the longest bar."
The better answer is: use persistence as a stress test for geometry. If a
feature appears only at one fragile scale, be suspicious. If it survives across
reasonable scales and resampling choices, it becomes harder to dismiss.

This is why the method feels philosophically different from many summaries. It
does not choose the scale first. It lets the scale vary, then asks what remains.

## Verification Notes

The lab exports `PersistentHomologyLab` and a CommonJS API for Node checks. I
audited the default ring, a clean ring, a noisy ring with outliers, a
figure-eight, clusters, a crescent, and clamped parameter input. The checks
require finite summary values, the requested point count, nontrivial simplex
construction, face-before-coface filtration order, valid birth/death intervals,
and nonnegative Betti numbers.

The default ring has one live loop at \(r=0.28\). The figure-eight has
\(\beta_1=2\) at \(r=0.22\). The clusters case has \(\beta_0=3\) and
\(\beta_1=0\) at \(r=0.18\). Those are toy examples, but they are useful toy
examples: they show the difference between a long-lived hole and a momentary
gap.

[^elz]: Herbert Edelsbrunner, David Letscher, and Afra Zomorodian, ["Topological Persistence and Simplification"](https://pub.ista.ac.at/~edels/Papers/2002-04-TopologicalPersistence.pdf), *Discrete & Computational Geometry* 28, 2002. Springer record: <https://link.springer.com/article/10.1007/s00454-002-2885-2>.

[^ghrist]: Robert Ghrist, ["Barcodes: The persistent topology of data"](https://www2.math.upenn.edu/~ghrist/preprints/barcodes.pdf), *Bulletin of the American Mathematical Society* 45(1), 2008.

[^carlsson]: Gunnar Carlsson, ["Topology and data"](https://www.ams.org/bull/2009-46-02/S0273-0979-09-01249-X/), *Bulletin of the American Mathematical Society* 46(2), 2009.

[^zc]: Afra Zomorodian and Gunnar Carlsson, ["Computing Persistent Homology"](https://graphics.stanford.edu/courses/cs233-25-spring/ReferencedPapers/Computing%20Persistent%20Homology%20zc-cph-05.pdf), *Discrete & Computational Geometry* 33, 2005.
