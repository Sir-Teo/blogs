---
layout: post
title: "The Distance Table Replaces the Vector"
description: "Product quantization makes vector search fast by turning every stored embedding into a handful of small codebook IDs. The query stays real; the database becomes table lookups."
date: 2026-06-17 03:48:00 -0400
categories: ai-systems
series: vector-search
tags: [product-quantization, vector-search, faiss, approximate-nearest-neighbors, embeddings, retrieval, compression]
excerpt: "A product quantizer does not merely round coordinates. It trains many small codebooks, stores short product codes, and answers queries by summing a distance table."
---

The most useful compression trick in vector search has a strange little
asymmetry:

```text
keep the query as a real vector
replace every database vector with a short code
```

That is product quantization in its working clothes. It is not the same as
saying "store fewer bits per float." It is closer to saying: learn a small set
of replacement parts for each slice of the vector, then remember which part was
used in each slice.

At query time the system does not need to rebuild every stored vector. It builds
a table once:

```text
distance from query slice 1 to every slice-1 codeword
distance from query slice 2 to every slice-2 codeword
...
```

Then a database vector is just a few table indexes. The distance is a sum.

That is the quiet reason product quantization, usually abbreviated PQ, sits
inside so many approximate-nearest-neighbor systems. The vector has been moved
out of the hot loop. The distance table has replaced it.

## The Codebook Is Exponential, But You Do Not Store It

Suppose a vector has dimension $$d$$. Split it into $$m$$ blocks:

$$
x = \left(x^{(1)}, x^{(2)}, \ldots, x^{(m)}\right).
$$

For each block, train a separate $$k$$-means codebook:

$$
C_j = \{c_{j,1}, c_{j,2}, \ldots, c_{j,k}\}.
$$

The encoder stores one integer per block:

$$
z_j(x) = \arg\min_i \left\|x^{(j)} - c_{j,i}\right\|^2.
$$

The reconstructed vector is the concatenation of those selected codewords:

$$
\hat{x}
= \left(c_{1,z_1(x)}, c_{2,z_2(x)}, \ldots, c_{m,z_m(x)}\right).
$$

The full reconstruction codebook has $$k^m$$ possible vectors. That sounds
large, and it is the point. With $$m=8$$ and $$k=256$$, there are $$256^8$$
possible reconstructions, but the trained object stores only $$m k$$ small
centroids, each living in a low-dimensional subspace. Jégou, Douze, and Schmid's
original PQ paper framed this as decomposing the space into a Cartesian product
of low-dimensional subspaces, then quantizing each subspace separately.[^pq]

The database payload is even smaller. Each vector stores $$m$$ codebook
indices. With eight subquantizers and 256 centroids each, that is eight bytes
per vector before any metadata or coarse index overhead. Compare that with a
768-dimensional float32 embedding at 3,072 bytes. The ratio is not a rounding
error. It is a different storage regime.

## ADC Is Where The Trick Becomes Search

Compression alone would be less interesting if search had to decode every
candidate into $$\hat{x}$$. Product quantization gets its speed from asymmetric
distance computation, or ADC.[^faiss-library]

Given a real query $$q$$, precompute:

$$
T[j,i] = \left\|q^{(j)} - c_{j,i}\right\|^2.
$$

For a database vector with code $$z(x)$$, the approximate distance is:

$$
d_{\mathrm{ADC}}(q,x)
= \sum_{j=1}^{m} T[j,z_j(x)].
$$

No coordinate loop over $$d$$. No decode required. The scan over compressed
codes is mostly: read a byte, look up a float, add.

This identity is exact for the reconstructed vector:

$$
d_{\mathrm{ADC}}(q,x) = \left\|q - \hat{x}\right\|^2.
$$

It is only approximate relative to the original vector $$x$$. That distinction
is the whole bargain. PQ does not approximate the distance computation after
compression; it approximates the database vector before distance computation.
Faiss's `ProductQuantizer` API exposes this directly: for one query it computes
an $$M \times k_{\text{sub}}$$ distance table whose entries are squared
distances from each query subvector to each subquantizer centroid.[^faiss-api]

The query remains uncompressed in ADC, which is why the computation is
"asymmetric." Symmetric distance computation also compresses the query, but
Faiss's recent system paper notes that most Faiss indexes prefer ADC because it
keeps query-side accuracy.[^faiss-library]

## A Small PQ Machine Room

The lab below trains product quantizers on synthetic eight-dimensional
embeddings. The projection is intentionally visible and small enough to audit.
For each setting it:

- generates a clustered vector database and one query,
- optionally applies a fixed orthonormal rotation before slicing the vector,
- trains one $$k$$-means codebook per subspace,
- encodes every database vector as a product code,
- compares exact nearest neighbors with ADC nearest neighbors, and
- verifies that ADC equals distance to the reconstructed vector.

The "spread rotation" is not a full optimized product quantizer. It is a toy
orthonormal mixing step that makes the same lesson visible: PQ's split of the
coordinate system is part of the model. Optimized Product Quantization later
made that space-decomposition problem explicit by optimizing both the rotation
and the subspace codebooks.[^opq]

<style>
  .pq-lab {
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

  .pq-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    margin-bottom: 1rem;
  }

  .pq-lab__controls > * {
    min-width: 0;
  }

  .pq-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .pq-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    min-height: 1.2rem;
  }

  .pq-lab input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    height: 1.35rem;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .pq-lab input[type="range"]::-webkit-slider-runnable-track {
    background: #d7dee5;
    border: 1px solid #c4ced8;
    border-radius: 999px;
    height: 0.36rem;
  }

  .pq-lab input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    background: #0f766e;
    border: 2px solid #0f766e;
    border-radius: 999px;
    height: 1rem;
    margin-top: -0.39rem;
    width: 1rem;
  }

  .pq-lab input[type="range"]::-moz-range-track {
    background: #d7dee5;
    border: 1px solid #c4ced8;
    border-radius: 999px;
    height: 0.36rem;
  }

  .pq-lab input[type="range"]::-moz-range-thumb {
    background: #0f766e;
    border: 2px solid #0f766e;
    border-radius: 999px;
    height: 1rem;
    width: 1rem;
  }

  .pq-lab select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
    width: 100%;
  }

  .pq-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.65rem 0 1rem;
  }

  .pq-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    min-height: 4.15rem;
    padding: 0.6rem 0.7rem;
  }

  .pq-lab__metric--good {
    border-color: #dbe4ec;
    box-shadow: inset 3px 0 0 rgba(15, 118, 110, 0.72);
  }

  .pq-lab__metric--warn {
    border-color: #dbe4ec;
    box-shadow: inset 3px 0 0 rgba(217, 119, 6, 0.72);
  }

  .pq-lab__metric--bad {
    border-color: #dbe4ec;
    box-shadow: inset 3px 0 0 rgba(190, 18, 60, 0.72);
  }

  .pq-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.71rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .pq-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.22rem;
    overflow-wrap: anywhere;
  }

  .pq-lab__plots {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: minmax(0, 1.25fr) minmax(240px, 0.75fr);
  }

  .pq-lab__side {
    display: grid;
    gap: 0.8rem;
  }

  .pq-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .pq-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin: 0.75rem 0 0;
  }

  .pq-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    gap: 0.35rem;
  }

  .pq-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .pq-lab__usage {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    display: grid;
    gap: 0.38rem;
    margin-top: 0.85rem;
    padding: 0.7rem;
  }

  .pq-lab__usage div {
    align-items: end;
    display: grid;
    gap: 0.45rem;
    grid-template-columns: 54px 1fr;
  }

  .pq-lab__usage span {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.76rem;
  }

  .pq-lab__usage b {
    align-items: end;
    display: flex;
    gap: 2px;
    min-height: 40px;
  }

  .pq-lab__usage i {
    background: #2563eb;
    border-radius: 2px 2px 0 0;
    display: block;
    flex: 1 1 0;
    min-width: 2px;
  }

  .pq-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 760px) {
    .pq-lab {
      padding: 0.85rem;
    }

    .pq-lab__plots {
      grid-template-columns: 1fr;
    }

    .pq-lab__metric {
      min-height: 3.6rem;
    }
  }
</style>

<div id="product-quantization-lab" class="pq-lab" data-product-quantization-lab>
  <div class="pq-lab__controls">
    <label>
      Vectors <output data-value="points">520</output>
      <input type="range" min="180" max="760" step="20" value="520" data-param="points">
    </label>
    <label>
      Subquantizers <output data-value="subquantizers">4</output>
      <select data-param="subquantizers">
        <option value="2">2 slices</option>
        <option value="4" selected>4 slices</option>
        <option value="8">8 slices</option>
      </select>
    </label>
    <label>
      Codewords per slice <output data-value="codewords">16</output>
      <select data-param="codewords">
        <option value="4">4</option>
        <option value="8">8</option>
        <option value="16" selected>16</option>
        <option value="32">32</option>
      </select>
    </label>
    <label>
      Geometry <output data-value="geometry">spiky covariance</output>
      <select data-param="geometry">
        <option value="spiky" selected>spiky covariance</option>
        <option value="entangled">entangled clusters</option>
        <option value="ring">curved manifold</option>
      </select>
    </label>
    <label>
      Coordinate split <output data-value="rotation">spread rotation</output>
      <select data-param="rotation">
        <option value="raw">raw axes</option>
        <option value="spread" selected>spread rotation</option>
      </select>
    </label>
    <label>
      Seed <output data-value="seed">37</output>
      <input type="range" min="1" max="9999" step="1" value="37" data-param="seed">
    </label>
  </div>

  <div class="pq-lab__metrics" data-role="metrics"></div>

  <div class="pq-lab__plots">
    <div>
      <canvas data-role="map" data-ratio="0.56" aria-label="Latent map comparing exact and product quantized neighbors"></canvas>
      <div class="pq-lab__legend">
        <span><i style="background:#172026"></i>query</span>
        <span><i style="background:#0f766e"></i>exact top-10 circle</span>
        <span><i style="background:#d97706"></i>PQ top-10 square</span>
      </div>
    </div>
    <div class="pq-lab__side">
      <canvas data-role="table" data-ratio="0.82" aria-label="Asymmetric distance computation table"></canvas>
      <canvas data-role="frontier" data-ratio="0.82" aria-label="Recall and compression frontier"></canvas>
    </div>
  </div>

  <div class="pq-lab__usage" data-role="usage" aria-label="Codeword usage histogram"></div>
  <p class="pq-lab__note" data-role="note"></p>
</div>

<script src="{{ '/assets/js/product-quantization-lab.js?v=20260617b' | relative_url }}"></script>

## The Table Has A Failure Mode

PQ can make a vector index feel magical because the arithmetic shrinks so
cleanly. But the method has a very ordinary statistical failure mode: the
codebooks are trained on a distribution.

If the training sample misses a tail, the tail will be badly reconstructed. If
the embedding model changes, the codebooks may become stale. If a filter later
removes most of the natural neighbors, the index might spend its approximate
budget on candidates that the product quantizer thought were close before the
filter was applied. In production systems PQ is often paired with a coarse
candidate generator such as IVF or a graph, and then reranking with exact
vectors recovers quality on a shortlist. Johnson, Douze, and Jégou's GPU Faiss
work discusses brute-force, approximate, and compressed-domain search, with
product quantization appearing as one part of a larger memory-and-throughput
design.[^gpu-faiss]

The lab's recall number is therefore not a universal property of "PQ with 16
codewords." It is a property of this data distribution, this query, this axis
split, this number of subquantizers, and this trained set of centroids. That is
why the small frontier plot is more honest than one large headline number. Every
point is a different compromise between payload bytes and neighborhood damage.

## Why Rotation Matters

The Cartesian-product assumption is the beauty and the weakness of PQ.

The distance decomposition works because squared Euclidean distance is additive
across disjoint coordinate blocks:

$$
\left\|q - \hat{x}\right\|^2
= \sum_j \left\|q^{(j)} - \hat{x}^{(j)}\right\|^2.
$$

But the data does not promise that its information is evenly divided across
those blocks. If the first two dimensions carry most of the semantic variance
and the remaining dimensions are quiet, then equal-size subquantizers are not
equal-value subquantizers. One codebook is asked to model the hard part; the
others spend their centroids on small noise.

An orthonormal rotation preserves exact distances, but it changes which
coordinates fall into which subquantizer. The lab's "spread rotation" is a
fixed Hadamard-style mixing. It often helps the spiky-covariance setting because
it distributes the important variance across all slices before training the
sub-codebooks. It can also fail to help when the raw coordinates were already
well matched to the split. That is the right moral. Rotation is not free
accuracy; it is a modeling decision about where the product structure should
live.

OPQ is the grown-up version of this idea: choose a transformation so the
subspace quantizers waste less capacity. The CVPR 2013 paper by Ge, He, Ke, and
Sun optimized product quantization by minimizing quantization distortion with
respect to both the space decomposition and the codebooks.[^opq]

## What I Would Audit Before Trusting It

For a real retrieval system, I would not stop at a PQ benchmark on random
queries. I would keep separate ledgers:

**Compression error.** Measure reconstruction MSE by slice, by item family, by
embedding norm, and by age of the vector. Averages hide the exact items that
will become embarrassing search results.

**Search recall.** Measure recall at the shortlist size that the next stage
actually sees. If a reranker receives 200 candidates, recall@200 is often more
operationally meaningful than recall@10.

**Latency and memory.** Count the per-vector code payload, shared codebook
overhead, graph or IVF metadata, cache behavior, and reranking reads. PQ saves
the vector payload, but the whole index has more than one column in its budget.

**Distribution shift.** Re-train or at least re-evaluate codebooks when the
embedding model, corpus mix, query mix, normalization convention, or filtering
policy changes.

**Distance convention.** Cosine search is usually handled by normalizing vectors
and using inner product or L2 on the normalized sphere. The quantizer has to be
audited under the same convention the search system will use.

The little invariant in the lab is deliberately narrower: ADC equals squared
distance from the real query to the reconstructed database vector. That is the
piece the implementation must get exactly right. The rest is the statistical
question: whether those reconstructed vectors are good enough for the search
job.

The artifact ships with that invariant as executable code. In the console or in
Node, `ProductQuantizationLab.audit()` trains 18 small PQ machines across three
synthetic geometries, two coordinate systems, and three code budgets. The audit
checks the product-code ranges, the distance-table shape, the non-increasing
$$k$$-means distortion history, exact and ADC ranking order, byte accounting for
codes and codebooks, and the frontier compression ledger. On the current build
it performs 25,746 checks; the largest ADC identity error is
$$2.84 \times 10^{-14}$$, which is numerical roundoff rather than a search
claim.

That distinction matters. A passing audit says the distance table is doing the
mathematics claimed in the article. It does not say this synthetic quantizer is
production-good, or that PQ alone is enough for a retrieval product. The
engineering question remains empirical: once the compressed codes enter a real
index, what shortlist recall, latency, memory footprint, and failure cases do
you actually measure?

[^pq]: Hervé Jégou, Matthijs Douze, and Cordelia Schmid, ["Product Quantization for Nearest Neighbor Search"](https://dl.acm.org/doi/10.1109/TPAMI.2010.57), IEEE TPAMI, 2011. A PubMed record for the same paper is available [here](https://pubmed.ncbi.nlm.nih.gov/21088323/).

[^faiss-library]: Matthijs Douze et al., ["The Faiss Library"](https://arxiv.org/html/2401.08281v4), arXiv, 2024. See the sections on compression levels, vector codecs, ADC, and recall/resource metrics.

[^faiss-api]: Meta's Faiss C++ documentation for [`faiss::ProductQuantizer`](https://faiss.ai/cpp_api/struct/structfaiss_1_1ProductQuantizer.html), especially `compute_distance_table`, which defines the query-by-codeword distance table used by ADC.

[^opq]: Tiezheng Ge, Kaiming He, Qifa Ke, and Jian Sun, ["Optimized Product Quantization for Approximate Nearest Neighbor Search"](https://openaccess.thecvf.com/content_cvpr_2013/html/Ge_Optimized_Product_Quantization_2013_CVPR_paper.html), CVPR 2013.

[^gpu-faiss]: Jeff Johnson, Matthijs Douze, and Hervé Jégou, ["Billion-scale similarity search with GPUs"](https://arxiv.org/abs/1702.08734), arXiv, 2017.
