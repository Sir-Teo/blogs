---
layout: post
title: "The Cut Has a Denominator"
description: "Minimum cuts like cheap separations. Normalized cuts ask whether the separated set had enough internal graph volume to deserve being called a cluster."
date: 2026-06-16 22:18:00 -0400
categories: machine-learning
tags: [spectral-clustering, normalized-cuts, graph-laplacian, fiedler-vector, graph-algorithms, machine-learning, clustering]
excerpt: "A tiny dangling vertex can be the cheapest cut in the graph. The spectral trick is not the eigenvector by itself; it is the denominator that asks what volume the cut abandoned."
---

There is a bad clustering algorithm hiding inside a good graph algorithm.

Take a weighted graph. Cut the cheapest set of edges. Call the two remaining
pieces clusters.

It sounds reasonable until the graph has a dangling point.

```text
minimum cut:  this vertex has one weak edge, cut it
human eye:    no, that is an outlier, not the main split
```

The failure is not mysterious. A raw cut only sees what leaves a set. It does
not ask how much graph is inside the set.

Normalized cut adds the missing question.

## The Cheap Cut

Let the similarity graph have edge weights $$w_{ij}$$. For a split
$$A, B$$, the ordinary edge cut is

$$
\operatorname{cut}(A,B)=
\sum_{i\in A,\,j\in B} w_{ij}.
$$

If a single vertex is attached by one weak edge, this value is tiny. In fact,
Shi and Malik open their normalized-cuts paper with exactly this warning:
minimum-cut criteria favor small isolated sets.[^shi-malik]

The fix is not to ban small clusters by hand. The fix is to price the cut
relative to the amount of graph mass on each side.

Define the volume of a set by its total weighted degree:

$$
\operatorname{vol}(A)=\sum_{i\in A} d_i,
\qquad
d_i=\sum_j w_{ij}.
$$

Then the normalized cut is

$$
\operatorname{Ncut}(A,B)
=
\frac{\operatorname{cut}(A,B)}{\operatorname{vol}(A)}
+
\frac{\operatorname{cut}(A,B)}{\operatorname{vol}(B)}.
$$

The denominator is doing the moral work. It asks:

```text
of all the edge weight this side had, how much did the cut throw away?
```

A dangling singleton has small raw cut, but almost all of its graph volume points
across the cut. Its normalized cut is therefore large. A real community can have
a larger raw edge boundary and still be the better partition because most of its
volume stays internal.

## A Small Graph That Lies to Minimum Cut

The lab below builds a deterministic weighted graph with two planted
communities, a few low-degree whisker vertices, and controllable bridge weight.
It computes:

- the cheapest singleton cut;
- the planted community split;
- the normalized-Laplacian spectral split found by sorting the second
  eigenvector and sweeping thresholds.

With the default settings:

```text
singleton raw cut      0.0872
community raw cut      3.5690
singleton Ncut         1.0001
spectral/community Ncut 0.0254
lambda2                0.0250
lambda3                0.4857
spectral agreement     100%
```

The edge cut alone would rather peel off a whisker. The denominator refuses.

<style>
  .spectral-cut-lab {
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

  .spectral-cut-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin-bottom: 1rem;
  }

  .spectral-cut-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .spectral-cut-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .spectral-cut-lab input {
    accent-color: #7c3aed;
    width: 100%;
  }

  .spectral-cut-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .spectral-cut-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .spectral-cut-lab__metric.good {
    border-color: #9ed8c5;
  }

  .spectral-cut-lab__metric.warn {
    border-color: #f2b8c4;
  }

  .spectral-cut-lab__metric span,
  .spectral-cut-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .spectral-cut-lab__metric span {
    display: block;
  }

  .spectral-cut-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .spectral-cut-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .spectral-cut-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="spectral-cut-lab" class="spectral-cut-lab" data-spectral-cut-lab>
  <div class="spectral-cut-lab__controls">
    <label>
      Nodes: <output data-value="nodes">56</output>
      <input type="range" min="28" max="84" step="4" value="56" data-param="nodes">
    </label>
    <label>
      Bridge weight: <output data-value="bridge">12%</output>
      <input type="range" min="0" max="55" step="1" value="12" data-param="bridge">
    </label>
    <label>
      Degree skew: <output data-value="degreeSkew">35%</output>
      <input type="range" min="0" max="75" step="1" value="35" data-param="degreeSkew">
    </label>
    <label>
      Cross noise: <output data-value="noise">10%</output>
      <input type="range" min="0" max="55" step="1" value="10" data-param="noise">
    </label>
    <label>
      Kernel width: <output data-value="sigma">0.58</output>
      <input type="range" min="28" max="95" step="1" value="58" data-param="sigma">
    </label>
    <label>
      Whiskers: <output data-value="whiskers">4</output>
      <input type="range" min="0" max="10" step="1" value="4" data-param="whiskers">
    </label>
    <label>
      Whisker edge: <output data-value="whiskerWeight">8%</output>
      <input type="range" min="1" max="40" step="1" value="8" data-param="whiskerWeight">
    </label>
    <label>
      Seed: <output data-value="seed">41</output>
      <input type="range" min="1" max="997" step="1" value="41" data-param="seed">
    </label>
  </div>
  <div class="spectral-cut-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="720" aria-label="Spectral cut lab comparing raw singleton cut, normalized cut, Fiedler-vector sweep, and Laplacian eigenvalues"></canvas>
  <p class="spectral-cut-lab__note">
    Deterministic browser experiment. The graph generator knows the planted
    communities, but the spectral routine sees only the weighted adjacency
    matrix. It solves a dense normalized-Laplacian eigenproblem and sweeps
    thresholds of the second eigenvector.
  </p>
</div>
<script defer src="{{ '/assets/js/spectral-cut-lab.js?v=20260616a' | relative_url }}"></script>

Try two changes.

First, increase **Bridge weight**. The two communities become less separable,
and $$\lambda_2$$ rises. In the default graph, moving bridge weight from `12%`
to `45%` lifts the spectral Ncut from about `0.025` to about `0.075`. The
clusters are still visible, but the graph is spending more edge mass across the
boundary.

Second, set **Whiskers** to `0`. The raw singleton cut stops looking quite so
absurd, but it still usually has a normalized cut near `1`. Normalized cut is
not a special outlier detector. It is a denominator that keeps low-volume sets
from winning merely because they are cheap to separate.

## Why an Eigenvector Appears

Write the weighted adjacency matrix as $$W$$, the degree matrix as $$D$$, and
the graph Laplacian as

$$
L = D-W.
$$

For any vector $$y$$,

$$
y^\top L y
=
\frac{1}{2}\sum_{i,j} w_{ij}(y_i-y_j)^2.
$$

So a low-energy vector is smooth on heavy edges. Neighboring vertices connected
by large weights receive similar values. A cut indicator is one very discontinuous
kind of vector: it is constant on one side, constant on the other, and jumps
across the boundary.

The normalized relaxation asks for a low-energy vector after measuring size with
degree:

$$
\min_{y\perp_D \mathbf{1}}
\frac{y^\top L y}{y^\top D y}.
$$

This leads to the generalized eigenproblem

$$
L y = \lambda D y,
$$

or, after the change of variables $$x=D^{1/2}y$$, to the symmetric normalized
Laplacian

$$
N = D^{-1/2}LD^{-1/2}.
$$

The second eigenvector is the relaxed cut. The final discrete split still needs
a rounding step. The lab sorts vertices by this vector and tries every threshold,
keeping the one with the best normalized cut.

That sweep is not decoration. Cheeger-style arguments connect the second
eigenvalue of the normalized Laplacian to conductance, and obtain a low-conductance
set by thresholding the relaxed vector.[^spielman] The algorithm is not "take an
eigenvector and hope." It is:

```text
relax the discrete cut
solve the smooth problem
sweep back to a discrete set
audit the cut you got
```

## What the Spectrum Is Saying

Fiedler's algebraic-connectivity paper made the second eigenvalue of a graph
Laplacian a central connectivity signal.[^fiedler] In the unnormalized setting,
a connected graph has one zero eigenvalue, and the second eigenvalue says how
hard it is to pull the graph apart.

Normalized cuts adapt that idea to graphs where degree is not uniform. The
degree matrix is not a technical nuisance. It changes the geometry from counting
vertices to counting graph volume.

This is why the lab includes **Degree skew**. When one side is denser than the
other, a vertex-count denominator and a degree-volume denominator stop agreeing.
For data graphs this matters constantly:

- dense region versus sparse region;
- frequent user behavior versus rare user behavior;
- hub document versus niche document;
- common class versus minority class;
- image texture with many local edges versus a smooth region with few.

The graph is not just a set of points. It is a measuring instrument, and the
degree distribution is part of the instrument.

## The Dangerous Part

Spectral clustering can feel cleaner than it is.

The eigenproblem is crisp. The plot is elegant. The clusters often look
convincing.

But every step before the eigenvector is a modeling decision:

```text
which features define similarity
which scale turns distance into weight
which edges are kept or pruned
which normalization defines size
which threshold rounds the relaxation
```

Change the kernel width in the lab. If it is too narrow, the graph becomes
fragile and local. If it is too wide, the bridge becomes too easy. The Laplacian
does exactly what the graph asks; it does not know whether the graph was the
right one.

Ng, Jordan, and Weiss emphasized this pragmatic side of spectral clustering:
there are many eigenvector-based algorithms, and their analysis gives conditions
under which one should expect the method to work.[^ng-jordan-weiss] Von
Luxburg's tutorial is still the best compact map of these choices: which
Laplacian, which relaxation, which rounding, and what can go wrong.[^luxburg]

The method deserves respect precisely because it makes the hidden object
auditable. You can inspect degrees, edge cuts, volumes, eigenvalues, eigengaps,
and threshold curves. A black-box clustering method can hide a bad denominator.
Spectral cuts put it on the table.

## A Receipt for Graph Clusters

Before I trust a graph clustering result, I want the following receipt:

- the graph construction rule, including metric, kernel scale, and pruning;
- the degree distribution and connected-component count;
- raw cut, normalized cut, and conductance for the chosen split;
- the first several Laplacian eigenvalues, not only the labels;
- the threshold sweep curve used to round the eigenvector;
- sensitivity to kernel width and graph sparsification;
- examples of low-degree vertices that a raw minimum cut would peel away.

The last item is the small honesty test.

If the method cannot explain why it did not isolate the cheapest dangling point,
it probably does not understand its own denominator.

## Paper Trail

[^shi-malik]: Jianbo Shi and Jitendra Malik, ["Normalized Cuts and Image Segmentation"](https://people.eecs.berkeley.edu/~malik/papers/SM-ncut.pdf), *IEEE Transactions on Pattern Analysis and Machine Intelligence* 22(8), 2000. The paper defines normalized cut, shows the small-isolated-set failure of minimum cut, and derives the generalized eigenvalue relaxation.

[^fiedler]: Miroslav Fiedler, ["Algebraic connectivity of graphs"](https://dml.cz/dmlcz/101168), *Czechoslovak Mathematical Journal* 23(2), 1973.

[^ng-jordan-weiss]: Andrew Y. Ng, Michael I. Jordan, and Yair Weiss, ["On Spectral Clustering: Analysis and an Algorithm"](https://papers.nips.cc/paper/2092-on-spectral-clustering-analysis-and-an-algorithm), *Advances in Neural Information Processing Systems* 14, 2001.

[^luxburg]: Ulrike von Luxburg, ["A Tutorial on Spectral Clustering"](https://arxiv.org/abs/0711.0189), *Statistics and Computing* 17(4), 2007.

[^spielman]: Daniel A. Spielman, ["Conductance, the Normalized Laplacian, and Cheeger's Inequality"](https://www.cs.yale.edu/homes/spielman/561/lect06-15.pdf), Spectral Graph Theory lecture notes, 2015.
