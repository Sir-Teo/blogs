---
layout: post
title: "The Projection Keeps Distances, Not Meaning"
description: "The Johnson-Lindenstrauss lemma is not a slogan about making data smaller. It is a promise about finite geometry, with margins left for the application to defend."
date: 2026-06-13 19:55:00 -0400
categories: computer-science
tags: [random-projection, johnson-lindenstrauss, dimension-reduction, nearest-neighbors, numerical-linear-algebra, ml-systems]
excerpt: "Random projection can preserve pairwise distances with high probability. It still does not know which decisions are fragile, semantic, or nearly tied."
---

Here is a dangerous sentence:

```text
We can reduce the dimension and keep the information.
```

Sometimes it is true. Often it is not even a well-posed claim.

Which information? For which set of points? For which downstream decision? A
cluster assignment, a nearest-neighbor lookup, a least-squares coefficient, a
dot-product ranking, and a human-interpretable feature are not the same object.

The Johnson-Lindenstrauss lemma gives a much cleaner promise. It does not say
"information" survives. It says that for a finite set of points, a random map
into surprisingly few dimensions can preserve all pairwise Euclidean distances
up to a controlled multiplicative distortion.[^jl]

That is already extraordinary. It is also much narrower than the folklore
version people casually repeat in design docs.

The projection is not a semantic compressor. It is a promise about a finite
geometry.

## What the Promise Actually Says

Take $$n$$ points in a high-dimensional Euclidean space. The JL result says,
roughly, that for $$0 < \epsilon < 1$$, there is a map into

$$
k = O(\epsilon^{-2}\log n)
$$

dimensions such that every pairwise distance is preserved within a
$$1 \pm \epsilon$$ factor.

The remarkable part is what is missing from the bound: the original ambient
dimension. Going from 10,000 dimensions to a few hundred can be reasonable if
the number of points and the tolerated distortion allow it.

The second remarkable part is that the map can be oblivious. It can be chosen
without first learning the data distribution. Dasgupta and Gupta's elementary
proof makes the standard probabilistic shape especially visible: a random
projection preserves the length of any fixed vector with high probability, then
a union bound asks that this hold for all differences between pairs of
points.[^dasgupta]

That last phrase is the hinge:

```text
all differences between pairs of points
```

JL preserves the geometry of a finite cloud. It does not preserve every vector
in the original space. It does not preserve labels by magic. It does not promise
that the nearest neighbor is unchanged when two candidates were nearly tied.

## PCA Is Answering Another Question

Principal components and random projections are easy to confuse because both
produce a lower-dimensional representation. They optimize different things.

PCA is data-aware. It finds directions that minimize reconstruction error under
a rank constraint. If your goal is to approximate the matrix itself, PCA is the
natural baseline.

But low reconstruction error is not the same as local distance preservation.
Achlioptas makes this point in his database-friendly random projection paper:
an optimal low-rank approximation can still make a particular pair of points
arbitrarily closer together.[^achlioptas]

Random projection goes the other way. It ignores the data values, refuses to
learn a special subspace, and offers a uniform distance guarantee for the finite
set. That is why it shows up in approximate nearest-neighbor search, clustering,
streaming, and randomized linear algebra.

PCA says:

```text
I kept the directions with the most energy.
```

JL says:

```text
I probably did not move any pair too much.
```

Those are different contracts.

## Distortion Bench

The lab below generates a finite cloud in a high-dimensional ambient space,
projects it with one of three random matrix families, and audits what survives.

It reports pairwise distance distortion and nearest-neighbor stability. The
nearest-neighbor part is intentionally unforgiving: exact nearest neighbors can
change even when the global geometry is mostly preserved, because local margins
are often small.

<style>
  .rp-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .rp-lab__controls {
    display: grid;
    gap: 0.9rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(188px, 1fr));
  }

  .rp-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .rp-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .rp-lab__controls input,
  .rp-lab__controls select {
    accent-color: #2563eb;
    width: 100%;
  }

  .rp-lab__controls select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .rp-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .rp-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.2rem;
    padding: 0.62rem 0.7rem;
  }

  .rp-lab__metric span,
  .rp-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .rp-lab__metric span {
    display: block;
  }

  .rp-lab__metric strong {
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .rp-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .rp-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="random-projection-lab" class="rp-lab" data-rp-lab>
  <div class="rp-lab__controls">
    <label>
      Points: <output data-value="points">140</output>
      <input type="range" min="40" max="220" step="20" value="140" data-param="points">
    </label>
    <label>
      Ambient dimension: <output data-value="dimension">160</output>
      <input type="range" min="32" max="512" step="32" value="160" data-param="dimension">
    </label>
    <label>
      Projected dimension: <output data-value="k">32</output>
      <input type="range" min="4" max="128" step="4" value="32" data-param="k">
    </label>
    <label>
      Cluster gap: <output data-value="gap">1.70</output>
      <input type="range" min="20" max="420" step="10" value="170" data-param="gap">
    </label>
    <label>
      Within-cloud noise: <output data-value="noise">0.80</output>
      <input type="range" min="20" max="180" step="10" value="80" data-param="noise">
    </label>
    <label>
      Projection matrix
      <select data-param="type">
        <option value="rademacher" selected>random signs</option>
        <option value="gaussian">gaussian</option>
        <option value="sparse">sparse signs</option>
      </select>
    </label>
  </div>
  <div class="rp-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="690" aria-label="Random projection lab showing distance distortion, nearest-neighbor preservation, and pairwise scatter"></canvas>
  <p class="rp-lab__note">
    Deterministic synthetic cloud. The projection is redrawn deterministically
    from the current projected dimension and matrix family. The sparse-sign
    option uses an Achlioptas-style matrix with two-thirds zeros; this lab is
    about geometry, not about optimized multiplication kernels.
  </p>
</div>
<script defer src="{{ '/assets/js/random-projection-lab.js?v=20260613a' | relative_url }}"></script>

At the default setting, the median pairwise distance error is small and the
same-cluster nearest neighbor almost always stays in the same cluster. But the
exact nearest-neighbor identity changes a lot.

That is not a contradiction. The projection can preserve the broad geometry
while changing decisions that have tiny margins. If the closest and
second-closest candidates are almost tied, a 5% distance perturbation can flip
the winner.

Raise **Projected dimension**. The pairwise distortion envelope tightens. Exact
nearest-neighbor preservation improves, but not as dramatically as the distance
histogram, because exact neighbor identity is a harder, margin-sensitive
decision.

Lower **Cluster gap** and raise **Within-cloud noise**. The classes overlap.
Now the projection is not the main problem; the original geometry itself has
weak decision margins.

Switch to **sparse signs**. The result is usually in the same family, sometimes
a little worse at very small $$k$$, but much cheaper to apply to sparse feature
vectors. That trade-off is why database-friendly and sparse JL transforms
matter in systems work.[^achlioptas]

## The Decision Margin Is the Catch

Suppose a retrieval system uses nearest neighbors. JL-style reasoning can tell
you that every distance is approximately preserved. It does not directly tell
you that the top result is unchanged.

For a query $$q$$, let $$a$$ be the nearest point and $$b$$ the runner-up. If

$$
\|q-a\|_2 \ll \|q-b\|_2,
$$

the decision has margin. A moderate projection error probably will not change
the answer. If the two distances are nearly equal, the decision is unstable even
before projection.

That distinction matters operationally. A random projection can be excellent
for candidate generation when the next stage reranks in the original space. It
can be risky if the projected nearest neighbor is treated as final truth. The
projection preserves geometry approximately; your decision layer still needs to
know what approximation it can tolerate.

The same issue appears in clustering. Preserving all pairwise distances within
$$1 \pm \epsilon$$ helps if the clustering objective is stable under that
perturbation. It does not rescue a dataset whose clusters were already
ambiguous.

## Gaussian Is Not the Point

The cleanest proof often starts with a Gaussian random matrix, but production
systems care about memory traffic, sparsity, and integer-friendly operations.

Achlioptas showed that one can use much simpler random matrices with entries
from $$\{-1,0,+1\}$$, including sparse constructions that are especially
appealing in database environments.[^achlioptas] The intuition is that exact
rotational symmetry is not the only way to get concentration. What the proof
needs is enough independence and tail control for projected lengths.

Ailon and Chazelle then asked a different systems question: can the transform be
made faster than multiplying by a dense random matrix? Their fast
Johnson-Lindenstrauss transform uses randomized preconditioning plus sparse
projection to speed up the embedding while keeping low distortion.[^fjlt]

This is a pattern worth noticing:

```text
the theorem says what must be preserved; systems work changes how cheaply it is preserved
```

The mathematical contract stays pairwise distance preservation. The engineering
problem is how to honor it with acceptable CPU, memory bandwidth, parallelism,
and implementation complexity.

## When the Invariant Is a Subspace

There is a stronger-looking cousin of this idea in randomized numerical linear
algebra: subspace embeddings.

Instead of preserving distances among a finite list of points, a subspace
embedding preserves norms for every vector in a particular low-dimensional
subspace. This is the right shape for least-squares regression because the
quantity you care about is $$\|Ax-b\|_2$$ over many possible $$x$$'s, not only
over a fixed list of observed rows.

Clarkson and Woodruff's input-sparsity-time work is part of that lineage:
construct a sparse sketching matrix $$S$$ so that $$SA$$ keeps enough geometry
of $$A$$'s column space to solve regression and low-rank approximation much
faster on large sparse inputs.[^clarkson]

This is one of the deep morals of random projection:

```text
compression is useful when it preserves the invariant your algorithm actually reads
```

For nearest neighbors, the invariant is pairwise distance, plus decision margin.
For least squares, it is residual norm over a subspace. For cosine retrieval, it
is angular geometry after normalization. For interpretability, random projection
may preserve the wrong thing entirely.

## Projection Review

Before using a random projection in a real pipeline, I would want answers to
these questions:

- What metric is the projection supposed to preserve?
- Is the downstream decision stable under multiplicative distance error?
- Are the important decisions protected by margins, or are they near ties?
- Is projection used only for candidate generation, with reranking later?
- Are feature vectors normalized before projection, and does that match the
  intended geometry?
- Is the projection matrix fixed and versioned so indexes remain compatible?
- How are new points projected when the dataset grows?
- Does the system need dense Gaussian quality, random-sign simplicity, or sparse
  transform speed?
- Are the empirical distortion tails measured on real traces, not just average
  error?

The last point is the least glamorous and the most practical. The theorem is
worst-case over a finite set, but constants and tails matter. Measure the error
distribution on the data geometry you actually serve.

## The Sentence to Keep

A random projection does not know what your data means.

It knows how to preserve lengths of many difference vectors at once. That is
enough to be powerful, but not enough to be careless. The theorem protects
distances; the application still has to protect decisions.

[^jl]: William B. Johnson and Joram Lindenstrauss, "Extensions of Lipschitz mappings into a Hilbert space," *Contemporary Mathematics*, 26, 1984. DOI: [10.1090/conm/026/737400](https://doi.org/10.1090/conm/026/737400). A reading copy is available from [Stanford CS114](https://web.stanford.edu/class/cs114/readings/JL-Johnson.pdf).

[^dasgupta]: Sanjoy Dasgupta and Anupam Gupta, ["An elementary proof of a theorem of Johnson and Lindenstrauss"](https://cseweb.ucsd.edu/~dasgupta/papers/jl.pdf), *Random Structures & Algorithms*, 22(1), 2003.

[^achlioptas]: Dimitris Achlioptas, ["Database-friendly random projections: Johnson-Lindenstrauss with binary coins"](https://cs-people.bu.edu/evimaria/cs565/achlioptas.pdf), *Journal of Computer and System Sciences*, 66(4), 2003.

[^fjlt]: Nir Ailon and Bernard Chazelle, ["The Fast Johnson-Lindenstrauss Transform and Approximate Nearest Neighbors"](https://epubs.siam.org/doi/10.1137/060673096), *SIAM Journal on Computing*, 39(1), 2009. PDF: [Princeton copy](https://www.cs.princeton.edu/~chazelle/pubs/FJLT-sicomp09.pdf).

[^clarkson]: Kenneth L. Clarkson and David P. Woodruff, ["Low Rank Approximation and Regression in Input Sparsity Time"](https://arxiv.org/abs/1207.6365), STOC 2013.
