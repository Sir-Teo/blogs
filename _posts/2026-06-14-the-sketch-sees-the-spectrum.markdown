---
layout: post
title: "The Sketch Sees the Spectrum"
description: "Randomized SVD works because a matrix can be interrogated by random probes. The probes do not discover every entry; they find the subspace where the matrix actually acts."
date: 2026-06-14 04:18:00 -0400
categories: machine-learning
tags: [randomized-svd, randomized-numerical-linear-algebra, pca, matrix-approximation, sketching, ml-systems]
excerpt: "A random sketch is not blind compression. It is a cheap experiment: ask the matrix what it does to random vectors, then keep the directions that answer loudly."
---

A matrix is a machine.

Feed it a vector. Watch what comes out.

That sounds too small to replace an SVD. The singular value decomposition seems
like the opposite of a sketch: exact, global, carefully sorted. But many
real matrices are not equally interesting in every direction. A user-item
matrix, an embedding table update, a document-term matrix, a kernel matrix, a
batch of activations, a Hessian approximation: often there is a small subspace
where most of the action lives, followed by a long tail of smaller motion.

Randomized SVD is built on a surprisingly physical idea:

```text
poke the matrix with random vectors
collect the loud responses
orthogonalize them
do the expensive exact work only in that small room
```

The random sketch is not trying to understand each coordinate. It is trying to
find the room.

## The Expensive Ideal

For a matrix \(A\), the best rank-\(k\) approximation in Frobenius norm is given
by truncating its SVD:

$$
A = U\Sigma V^\top,\qquad
A_k = U_k\Sigma_k V_k^\top.
$$

The approximation error is exactly the energy left in the discarded singular
values:

$$
\|A-A_k\|_F^2 = \sum_{j>k}\sigma_j^2.
$$

Eckart and Young published the classical low-rank approximation result in
1936.[^eckart-young] This baseline is why SVD is so hard to beat conceptually:
if you want the best rank-\(k\) answer, the singular vectors are the answer.

The trouble is that the exact answer may be too expensive. For large dense
matrices, classical partial decompositions can require many passes and a large
amount of communication. For matrices living behind data pipelines, distributed
storage, GPU kernels, or streaming interfaces, moving the data can be more
painful than the floating point arithmetic.

So randomized numerical linear algebra asks a different question:

```text
Can we find a nearly good subspace before we compute a nearly exact factorization?
```

## Stage A: Find the Room

Halko, Martinsson, and Tropp describe randomized matrix approximation as a
two-stage procedure.[^hmt] Stage A constructs a low-dimensional basis \(Q\) that
captures most of the action of \(A\). Stage B compresses the matrix to that
basis and performs a deterministic factorization on the smaller object.

The simplest range finder is almost rude:

$$
\Omega \in \mathbb{R}^{n \times \ell},\qquad
Y = A\Omega,\qquad
Q = \mathrm{orth}(Y),
$$

where \(\ell = k+p\), and \(p\) is a small oversampling parameter. Then

$$
A \approx QQ^\top A.
$$

This is not yet the final rank-\(k\) SVD. It is the "did we find the right room?"
step. Once \(Q\) is good, the matrix \(B = Q^\top A\) is small enough that an
ordinary deterministic SVD is cheap, and the approximation can be lifted back to
the original space.

The wild part is that \(Y=A\Omega\) tends to contain the dominant left singular
directions automatically. Write \(A=U\Sigma V^\top\). A Gaussian \(\Omega\) is
rotationally symmetric, so \(V^\top\Omega\) is still just a Gaussian test matrix.
Multiplication by \(\Sigma\) scales the rows: large singular directions speak
loudly, tiny singular directions whisper.

The sketch hears the loud directions first.

## Oversampling Is Not a Hack

If you need rank \(k\), why draw \(k+p\) test vectors?

Because the \(k\)th direction may be unlucky. A random test vector can land
nearly orthogonal to an important direction. Drawing a few extra columns gives
the sketch slack. Halko, Martinsson, and Tropp note that small constants such as
\(p=5\) or \(p=10\) are common in practice, and that larger sample blocks can
also be computationally convenient because matrix multiplication likes blocking
and parallelism.[^hmt]

That is a useful engineering lesson. Oversampling is not merely theoretical
padding. It buys reliability and often costs little compared with one more pass
through the original matrix.

In the lab below, the blue curve asks how much residual error remains as \(p\)
increases. The "best rank-\(k\)" line is not a randomized algorithm. It is the
Eckart-Young floor. When the sketch uses \(k+p\) columns, it may even beat the
rank-\(k\) floor because it is allowed to keep more than \(k\) dimensions in
Stage A. The stricter comparison is the "best sketch" floor: the best possible
\((k+p)\)-dimensional range.

## Power Iteration Is a Spectral Amplifier

Random sketches are happiest when the singular spectrum drops quickly. If
\(\sigma_k\) and \(\sigma_{k+1}\) are nearly tied, the matrix does not have a
clean answer to "which \(k\) directions matter?"

The standard fix is power iteration:

$$
Y_q = (AA^\top)^q A\Omega.
$$

This changes the singular weights from \(\sigma_j\) to
\(\sigma_j^{2q+1}\). Large singular values become much larger relative to the
tail. The price is additional passes over \(A\) and \(A^\top\), plus more care
with numerical stabilization.

Power iteration is not free intelligence. It is a bargain:

```text
more passes through the matrix
for a sharper spectral gap
```

Rokhlin, Szlam, and Tygert's randomized PCA work is one of the important papers
in this lineage, aimed at low-rank approximation that is close to the best
possible for large matrices.[^rst] The later Acta Numerica survey by Martinsson
and Tropp places these methods inside a larger toolbox: randomized embeddings,
range finding, Krylov methods, adaptive error estimation, streaming sketches,
CUR and Nystrom approximations, and kernel methods.[^mt]

## A Range-Finder Bench

The lab does not pretend to be a production randomized SVD implementation. It
audits Stage A.

We construct a diagonal matrix with a known singular spectrum. This is not a
loss for the question being tested: for Gaussian test matrices, the range-finder
residual is governed by singular values, and rotations of the singular vectors
do not change the distribution of the sketch. The diagonal view simply lets us
measure exactly which singular directions the sketch captured.

The residual is

$$
\|(I-QQ^\top)A\|_F.
$$

The visualization compares:

1. the singular spectrum and the \(k\) versus \(k+p\) cutoffs,
2. residual error as power iterations increase,
3. residual error as oversampling increases,
4. the average capture of each singular direction by the sketch.

<style>
  .rsvd-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .rsvd-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .rsvd-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .rsvd-lab__controls input {
    accent-color: #2563eb;
    width: 100%;
  }

  .rsvd-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .rsvd-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .rsvd-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.25rem;
    padding: 0.62rem 0.7rem;
  }

  .rsvd-lab__metric span,
  .rsvd-lab__legend,
  .rsvd-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .rsvd-lab__metric span {
    display: block;
  }

  .rsvd-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .rsvd-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .rsvd-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 1rem;
    margin-top: 0.65rem;
  }

  .rsvd-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .rsvd-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .rsvd-lab__note {
    margin: 0.65rem 0 0;
  }
</style>

<div class="rsvd-lab" data-rsvd-lab>
  <div class="rsvd-lab__controls">
    <label>
      Matrix size: <output data-value="n">96</output>
      <input type="range" min="48" max="128" step="16" value="96" data-param="n">
    </label>
    <label>
      Target rank: <output data-value="targetRank">12</output>
      <input type="range" min="4" max="32" step="1" value="12" data-param="targetRank">
    </label>
    <label>
      Oversampling: <output data-value="oversampling">8</output>
      <input type="range" min="0" max="24" step="1" value="8" data-param="oversampling">
    </label>
    <label>
      Power iterations: <output data-value="power">1</output>
      <input type="range" min="0" max="3" step="1" value="1" data-param="power">
    </label>
    <label>
      Spectral decay: <output data-value="decay">0.91</output>
      <input type="range" min="70" max="98" step="1" value="91" data-param="decay">
    </label>
    <label>
      Tail floor: <output data-value="floor">4%</output>
      <input type="range" min="0" max="16" step="1" value="4" data-param="floor">
    </label>
    <label>
      Replicates: <output data-value="reps">10</output>
      <input type="range" min="3" max="16" step="1" value="10" data-param="reps">
    </label>
    <label>
      Seed: <output data-value="seed">17</output>
      <input type="range" min="1" max="99" step="1" value="17" data-param="seed">
    </label>
  </div>
  <div class="rsvd-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="680" aria-label="Randomized SVD range finder lab showing singular spectrum, power iteration, oversampling, and captured singular directions"></canvas>
  <div class="rsvd-lab__legend">
    <span><i style="background:#2563eb"></i> Sketch curve</span>
    <span><i style="background:#0f766e"></i> Current power</span>
    <span><i style="background:#be123c"></i> Chosen cutoff</span>
    <span><i style="background:#64748b"></i> Best rank-k floor</span>
  </div>
  <p class="rsvd-lab__note">
    Deterministic toy experiment. The matrix is diagonal with a controlled
    singular spectrum, the sketch matrix is pseudorandom Gaussian, and the
    plotted residuals are averages over replicates. The lab measures the range
    finder \(Q\), not the final small SVD of \(Q^\top A\).
  </p>
</div>
<script defer src="{{ '/assets/js/randomized-svd-lab.js?v=20260614a' | relative_url }}"></script>

Try setting **Power iterations** to 0 with a slow **Spectral decay** such as
0.96. The sketch has a harder time deciding which singular directions are
important because the tail is not much quieter than the head. Now increase power
to 2 or 3. The residual usually drops because the sketch effectively sees
\(\sigma^{5}\) or \(\sigma^{7}\) rather than \(\sigma\).

Then set **Oversampling** to 0. Sometimes the top directions are still captured;
sometimes the run is noticeably worse. That wobble is the point. Oversampling is
a small premium paid against unlucky orientation.

Finally raise **Tail floor**. The bottom of the spectrum stops falling. No sketch
can turn a matrix with many meaningful directions into a truly low-rank object.
Randomization can find structure; it cannot manufacture a spectral gap.

## Why This Belongs in ML Systems

Randomized SVD can sound like a numerical analyst's trick, but it is really a
systems pattern.

Modern ML work often asks for spectral information about objects that are
awkward to materialize:

- principal components of an embedding or activation matrix,
- low-rank adapters and task updates,
- approximate Hessian or Fisher eigenspaces,
- kernel matrices and attention-like similarity matrices,
- compressed diagnostics for large feature tables.

In those settings, the question is rarely "Can I compute the beautiful exact
factorization on my laptop?" The better question is:

```text
How many passes over the object am I allowed?
How much communication can I afford?
How sharp is the spectrum?
How much failure probability is acceptable?
```

The randomized range finder makes these tradeoffs explicit. Oversampling buys
probability. Power iteration buys separation. Blocking buys hardware
efficiency. A posteriori error estimates can decide whether to ask for more
samples. These are algorithmic knobs with operational meanings.

That is the real charm of the method. It turns low-rank approximation from a
single monolithic decomposition into an experiment you can budget.

## The Matrix Answers Probes

There is a tempting but wrong story:

```text
randomness makes linear algebra cheaper
```

The better story is:

```text
random probes reveal where the matrix spends its norm
```

When the spectrum falls quickly, a few probes hear the dominant room. When the
spectrum is flat, the matrix refuses to summarize itself. When the gap is
ambiguous, power iteration asks the same question more forcefully. When a few
directions might be missed, oversampling asks a few extra questions.

The sketch does not know the spectrum.

But if the spectrum is there, the sketch can hear it.

## Notes

[^eckart-young]: Carl Eckart and Gale Young, "The approximation of one matrix by another of lower rank," *Psychometrika*, 1936. [Springer](https://link.springer.com/article/10.1007/BF02288367).

[^hmt]: Nathan Halko, Per-Gunnar Martinsson, and Joel A. Tropp, "Finding Structure with Randomness: Probabilistic Algorithms for Constructing Approximate Matrix Decompositions," *SIAM Review*, 2011. [SIAM](https://epubs.siam.org/doi/10.1137/090771806), [arXiv](https://arxiv.org/abs/0909.4061), [PDF](https://www.cs.cornell.edu/courses/cs6241/2019sp/readings/Halko-2011-randomness.pdf).

[^rst]: Vladimir Rokhlin, Arthur Szlam, and Mark Tygert, "A randomized algorithm for principal component analysis," *SIAM Journal on Matrix Analysis and Applications*, 2009. [arXiv](https://arxiv.org/abs/0809.2274), [PDF](https://ww3.math.ucla.edu/camreport/cam08-60.pdf).

[^mt]: Per-Gunnar Martinsson and Joel A. Tropp, "Randomized numerical linear algebra: Foundations and algorithms," *Acta Numerica*, 2020. [Cambridge Core](https://www.cambridge.org/core/journals/acta-numerica/article/abs/randomized-numerical-linear-algebra-foundations-and-algorithms/4486926746CFF4547F42A2996C7DC09C), [arXiv](https://arxiv.org/abs/2002.01387).
