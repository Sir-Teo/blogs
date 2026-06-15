---
layout: post
title: "The Sketch Shrinks Every Direction"
description: "Frequent Directions is a deterministic streaming sketch for covariance. It keeps a tiny matrix, repeatedly shrinks the spectrum, and still promises that no direction is forgotten by too much."
date: 2026-06-14 20:26:00 -0400
categories: computer-science
tags: [frequent-directions, matrix-sketching, streaming-algorithms, pca, covariance, randomized-numerical-linear-algebra]
excerpt: "A stream can be too large to keep, but not too large to cast a covariance shadow. Frequent Directions keeps that shadow by shaving energy from every direction at once."
---

Suppose rows of a matrix arrive one at a time.

They might be user embeddings, document counts, query features, activations,
returns, telemetry, or gradients. The downstream question is familiar: which
directions have large variance? Which small subspace explains most of the
energy? Can I regress, cluster, whiten, or run PCA without storing every row?

The object those questions keep touching is not the raw matrix \(A\). It is the
covariance-shaped shadow

$$
A^\top A.
$$

For any unit direction \(x\),

$$
x^\top A^\top A x = \|Ax\|_2^2.
$$

That scalar asks a concrete question: if I look through direction \(x\), how
much squared mass did the entire stream place there? A streaming covariance
sketch is trying to answer that question for every \(x\), using a matrix \(B\)
with only a few rows:

$$
B^\top B \approx A^\top A.
$$

The tiny matrix is not a sample. It is a promise about all directions.

## A Sketch Is a Contract

Randomized sketches are often introduced as compression. That is true but too
vague. Different sketches keep different promises.

A Gaussian range finder, as in randomized SVD, asks the matrix a few random
questions, orthogonalizes the loud responses, and hopes it found the dominant
subspace.[^hmt] A sparse embedding or CountSketch-style transform uses signed
buckets so multiplication can be fast on sparse input, with guarantees that are
usually probabilistic and often phrased as preserving norms over a subspace or
supporting regression and low-rank approximation.[^clarkson-woodruff]

Frequent Directions has a different personality. It is deterministic. It
receives rows one at a time. It keeps a small dense sketch. And its cleanest
guarantee is a covariance guarantee:

$$
\left\|A^\top A - B^\top B\right\|_2
\le
\frac{\left\|A - A_k\right\|_F^2}{\ell-k},
\qquad \ell > k.
$$

Here \(\ell\) is the number of rows allowed in the sketch, and \(A_k\) is the
best rank-\(k\) approximation to \(A\). The numerator is tail energy: mass that
does not fit in the first \(k\) singular directions. The denominator is slack:
the sketch rows left after you reserve \(k\) directions for the signal.

This theorem is beautiful because it says the sketch pays only for what a
rank-\(k\) model could not have kept anyway. If the stream is close to low
rank, the covariance shadow can be tiny.

The deterministic detail matters. The guarantee is not "with high probability,
unless the seed is unlucky." It is a worst-case statement about the rows that
actually arrived.[^ghashami]

## The Move

Frequent Directions is descended from the old streaming frequent-items idea:
when a small counter table is full, decrement every counter and delete the
zeros.[^misra] That algorithm does not know which item will be important later.
It removes one count from many candidates at once, so no item can be
under-counted by too much.

Liberty's original Frequent Directions paper performs the matrix version of
that trick.[^liberty]

Keep a sketch matrix \(B\). When there is room, append the incoming row. When
the sketch is too full, compute an SVD

$$
B = U\Sigma V^\top.
$$

Then choose a shrink amount \(\delta\), usually the squared singular value at
the cutoff, and replace each singular value by

$$
\sigma_i' = \sqrt{\max(\sigma_i^2-\delta, 0)}.
$$

Finally rebuild

$$
B' = \Sigma' V^\top
$$

and keep only the nonzero rows.

In pseudocode:

```text
for each incoming row a:
    append a to B
    if B is full:
        compute singular values and right singular vectors of B
        delta = squared singular value at the cutoff
        subtract delta from every squared singular value
        discard the rows that became zero
```

The sketch forgets, but it forgets symmetrically. Large directions lose the
same squared amount as medium directions. Small directions disappear. The
algorithm never has to guess which future row will make a weak direction
important; the theorem accounts for the total shrinkage budget.

This is why the name is so good. It does not keep frequent coordinates. It
keeps frequent directions.

## Why Shrinking Works

A single shrink step is a small tragedy. Every direction loses some mass:

$$
\|Bx\|_2^2 - \|B'x\|_2^2 \ge 0.
$$

But the loss in any fixed direction is capped by \(\delta\), because subtracting
\(\delta\) from every squared singular value subtracts at most \(\delta\) from
the quadratic form. Meanwhile the total Frobenius energy removed is larger:
many directions are shaved, and at least one is zeroed.

That asymmetry is the proof engine. Per-direction damage grows like the sum of
the shrink amounts. Total discarded energy also grows like that sum multiplied
by the number of surplus directions. The tail energy of \(A\) upper-bounds how
much discard can happen before a rank-\(k\) approximation would have had to pay
for it.

So the sketch deliberately underestimates covariance. For unit \(x\), the
Frequent Directions analyses give a one-sided form:

$$
0 \le \|Ax\|_2^2 - \|Bx\|_2^2
\le
\frac{\|A-A_k\|_F^2}{\ell-k}.
$$

Spectral norm is just the worst direction version of that statement.

That one-sidedness is useful. An unbiased noisy estimator can be excellent on
average and still produce a covariance matrix that is too large in one
direction and too small in another. Frequent Directions is biased downward, but
its bias is organized.

## A Browser-Sized Covariance Lab

The lab below constructs a synthetic stream with a low-rank signal, isotropic
noise, and optional drift in the underlying directions. It then computes the
exact covariance \(A^\top A\) in the browser and compares three sketches with
the same row budget:

- **Frequent Directions**, using repeated eigendecompositions of \(B^\top B\)
  as a compact browser implementation of the shrink step.
- **CountSketch-style signed buckets**, where each incoming row is assigned to
  one of \(\ell\) buckets with a random sign.
- **Uniform reservoir sample**, scaled so that its expected covariance has the
  right magnitude.

The comparison is intentionally unfair in one respect and fair in another. It
is unfair because production randomized sketching algorithms have many variants
and sharper use cases than this tiny signed-bucket baseline. It is fair because
all three are asked the same question:

```text
How close is B'B to the full covariance A'A?
```

At the default setting, the stream has 800 rows in 28 dimensions, a rank-3
signal, noise level 0.18, 35% directional drift, and a 12-row sketch. A Node
audit of the same code gives:

```text
FD spectral error        49.83
CountSketch error      6374.90
Reservoir error        7205.46
FD theorem bound         78.26
FD top-k energy         100%
CountSketch top-k        98.6%
FD shrink steps           61
```

The important line is not that Frequent Directions wins this toy plot. The
important line is the mismatch between the two diagnostics. CountSketch can
recover nearly all top-k energy here while still being a poor full-covariance
surrogate. PCA capture and covariance spectral error are related, but they are
not the same contract.

<style>
  .fd-lab {
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

  .fd-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
  }

  .fd-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .fd-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .fd-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .fd-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .fd-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .fd-lab__metric span,
  .fd-lab__legend,
  .fd-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .fd-lab__metric span {
    display: block;
  }

  .fd-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .fd-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .fd-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .fd-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .fd-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .fd-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div class="fd-lab" data-fd-lab>
  <div class="fd-lab__controls">
    <label>
      Rows: <output data-value="rows">800</output>
      <input type="range" min="250" max="1400" step="50" value="800" data-param="rows">
    </label>
    <label>
      Dimension: <output data-value="dim">28</output>
      <input type="range" min="16" max="40" step="1" value="28" data-param="dim">
    </label>
    <label>
      Sketch rows: <output data-value="sketch">12</output>
      <input type="range" min="4" max="28" step="1" value="12" data-param="sketch">
    </label>
    <label>
      Target rank: <output data-value="rank">3</output>
      <input type="range" min="2" max="6" step="1" value="3" data-param="rank">
    </label>
    <label>
      Noise: <output data-value="noise">0.18</output>
      <input type="range" min="4" max="45" step="1" value="18" data-param="noise">
    </label>
    <label>
      Drift: <output data-value="drift">35%</output>
      <input type="range" min="0" max="80" step="5" value="35" data-param="drift">
    </label>
    <label>
      Seed: <output data-value="seed">23</output>
      <input type="range" min="1" max="9999" step="1" value="23" data-param="seed">
    </label>
  </div>
  <div class="fd-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Frequent Directions lab comparing deterministic covariance sketching with randomized row sketches"></canvas>
  <div class="fd-lab__legend" aria-hidden="true">
    <span><i style="background:#0f766e"></i>exact covariance</span>
    <span><i style="background:#2563eb"></i>Frequent Directions</span>
    <span><i style="background:#dc2626"></i>CountSketch</span>
    <span><i style="background:#f59e0b"></i>sample</span>
  </div>
  <p class="fd-lab__note">
    The implementation is dense and pedagogical. It uses small browser
    eigensolvers to expose the invariant being checked; production systems
    would use tuned linear algebra, sparse updates, and mergeable variants.
  </p>
</div>

<script src="{{ '/assets/js/frequent-directions-lab.js?v=20260614a' | relative_url }}"></script>

## What to Try

Lower **Sketch rows** toward \(k+1\).

The denominator \(\ell-k\) gets thin, and the bound loosens quickly. The sketch
still behaves deterministically, but there is no magic in a memory budget with
almost no slack.

Raise **Noise**.

Tail energy increases. Frequent Directions does not manufacture a low-rank
world; it exploits one when the world gives it one. As the spectrum flattens,
the covariance shadow needs more rows.

Move **Drift** upward.

The stream stops having one stable subspace. This is exactly where the
covariance contract is clearer than the phrase "find the principal
components." If old and new directions both carry energy, the sketch must
represent the combined covariance, not merely chase the latest basis.

Change **Seed**.

Frequent Directions should be stable in the sense that the theorem does not
depend on the seed. The synthetic data generation and randomized baselines do
depend on it. That distinction is part of the lesson: deterministic sketching
does not remove all randomness from an experiment, but it removes algorithmic
randomness from the sketch guarantee.

## The Trap in "Top-k Energy"

The top-k panel can be misleading in the most educational way.

In many settings, the signed-bucket sketch captures most of the leading
subspace. If the only downstream task is a rough PCA visualization, that may be
fine. Randomized numerical linear algebra is a powerful toolbox, not a straw
man.[^mt]

But covariance error is stricter. A sketch used inside least squares,
preconditioning, whitening, anomaly detection, or online feature diagnostics
may be asked for more than "roughly the same first three principal axes." It may
need not to invent a huge variance direction that was not in the stream. It may
need not to erase a medium direction that later matters for regression.

That is why the spectral norm error is the right villain in this essay:

$$
\left\|A^\top A - B^\top B\right\|_2
=
\max_{\|x\|_2=1}
\left|\,\|Ax\|_2^2 - \|Bx\|_2^2\,\right|.
$$

It asks for the worst direction. Frequent Directions was designed for that
question.

## Centering Is Not a Footnote

The lab sketches \(A^\top A\) for raw rows. PCA on real data often wants the
covariance of centered rows:

$$
\sum_i (a_i-\bar a)(a_i-\bar a)^\top.
$$

A streaming system must track the mean as well as the second moment. You can
combine a running mean with a sketch of centered updates, or keep enough
statistics to correct the raw second moment. The sketch theorem does not excuse
you from defining the matrix whose covariance you are preserving.

This is also where data engineering enters. If embeddings are normalized, if
features have wildly different units, if rare categorical expansions create
high-leverage rows, the covariance shadow changes. Frequent Directions keeps a
matrix promise; it does not decide whether that matrix is the right object.

## Where It Fits

Frequent Directions is most attractive when the stream is large, the dimension
is moderate enough for dense sketch rows, and the downstream computation cares
about covariance-like geometry:

- streaming PCA over logs, documents, embeddings, or activations;
- online feature stores that want compact second-moment summaries;
- distributed systems where workers can sketch partitions and merge summaries;
- iterative modeling pipelines where keeping all historical rows is expensive;
- privacy- or retention-constrained analytics where raw events should expire
  but aggregate geometry may remain.

The mergeability is important. The SIAM paper emphasizes that Frequent
Directions sketches can be combined: sketch chunks separately, stack the
sketches, and sketch again.[^ghashami] That makes the algorithm feel less like
a single-threaded streaming trick and more like a systems primitive.

## A Small Way to Remember It

Random projections ask:

```text
If I look from a few random angles, do I see the important room?
```

Frequent Directions asks:

```text
If I must forget, can I charge every forgotten direction to tail energy?
```

The first question is exploratory. The second is accounting.

That accounting mindset is what makes the algorithm feel almost financial. The
sketch maintains a ledger of covariance mass. Every compression step imposes a
small haircut across the spectrum. No single direction is allowed to be robbed
silently, because the total haircut must show up as discarded Frobenius energy.

The stream is gone. The rows are gone. What remains is a small matrix and a
receipt:

```text
for every direction, this is how much variance I might owe you
```

That is a good shape for memory to have.

## Verification Notes

The browser lab exports its simulator as `FrequentDirectionsLab` and as a
CommonJS module for Node checks. I audited the default setting, a small-sketch
case, a wider dimension case, a high-noise case, and a clamped edge case. The
checks require finite errors, a satisfied Frequent Directions covariance bound
with numerical tolerance, bounded top-k energy ratios, bounded subspace
alignments, sorted exact spectra, and a sketch no larger than the requested row
budget.

This is still a toy. The eigensolver is a Jacobi routine written for small
browser matrices, not a replacement for LAPACK. The CountSketch baseline is a
simple signed row bucket sketch, not the full universe of randomized embedding
methods. The point is to make the covariance contract visible enough that the
sliders can falsify your intuition before the theorem rescues it.

[^liberty]: Edo Liberty, ["Simple and Deterministic Matrix Sketching"](https://edoliberty.github.io/papers/simpleMatrixSketching.pdf), *KDD*, 2013. Liberty presents Frequent Directions as a deterministic row-update sketch inspired by frequent-items algorithms.

[^ghashami]: Mina Ghashami, Edo Liberty, Jeff M. Phillips, and David P. Woodruff, ["Frequent Directions: Simple and Deterministic Matrix Sketching"](https://epubs.siam.org/doi/10.1137/15M1009718), *SIAM Journal on Computing* 45(5), 2016. The paper gives the standard spectral covariance and projection-error guarantees and discusses space optimality and mergeability.

[^misra]: Jayadev Misra and David Gries, ["Finding repeated elements"](https://www.cs.utexas.edu/users/misra/scannedPdf.dir/FindRepeatedElements.pdf), *Science of Computer Programming* 2(2), 1982. The frequent-items decrement idea is the scalar ancestor of the matrix shrink metaphor; Frequent Directions is not literally the same algorithm, but the analogy is structurally useful.

[^hmt]: Nathan Halko, Per-Gunnar Martinsson, and Joel A. Tropp, ["Finding structure with randomness: Probabilistic algorithms for constructing approximate matrix decompositions"](https://arxiv.org/abs/0909.4061), *SIAM Review* 53(2), 2011.

[^clarkson-woodruff]: Kenneth L. Clarkson and David P. Woodruff, ["Low rank approximation and regression in input sparsity time"](https://arxiv.org/abs/1207.6365), *STOC*, 2013. Their work is part of the sparse embedding lineage that makes randomized sketching practical for large sparse matrices.

[^mt]: Per-Gunnar Martinsson and Joel A. Tropp, ["Randomized numerical linear algebra: Foundations and algorithms"](https://arxiv.org/abs/2002.01387), *Acta Numerica* 29, 2020.
