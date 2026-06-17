---
layout: post
title: "The Record Has No Fields"
description: "Hyperdimensional computing stores symbols as wide random vectors. Binding and bundling let a record live in one vector, but cleanup only works while the crosstalk stays below the nearest impostor."
date: 2026-06-16 21:58:00 -0400
categories: machine-learning
tags: [hyperdimensional-computing, vector-symbolic-architectures, distributed-representations, associative-memory, cognitive-science, robust-computing]
excerpt: "A vector symbolic architecture does not keep a record by allocating fields. It throws random high-dimensional symbols into one superposition and asks cleanup memory to pull them back out."
---

Imagine a record with no fields.

No pointer to the `agent`.

No slot for the `object`.

No little dictionary saying where the `place` lives.

Instead, every role and every item is a wide random vector. To store the fact,
the system multiplies role vectors by item vectors, adds the products together,
and keeps the sum.

That sounds like vandalism until the dimension gets large enough.

The trick has several names and several concrete models: hyperdimensional
computing, vector symbolic architectures, binary spatter codes, holographic
reduced representations, semantic pointers, random indexing. The family
reappears because it offers a strange compromise. It keeps symbolic operations
like binding and composition, but the objects being manipulated are distributed
vectors that tolerate noise and superposition.[^kanerva2009][^plate]

This note uses one small member of the family: bipolar Multiply-Add-Permute
style vectors. It is not the whole field. It is the smallest version I know
that makes the core bargain visible.

## The Three Moves

Start with random bipolar vectors:

$$
R_i, V_j \in \{-1,+1\}^D.
$$

Here `R` might be a role such as `agent`, and `V` might be an item such as
`item-040`. If the entries are independent signs, two unrelated vectors have
cosine close to zero. More precisely, their normalized dot product has standard
deviation about:

$$
\frac{1}{\sqrt{D}}.
$$

That is the first move: **random symbols**. A new symbol can be minted by a
pseudorandom seed instead of a learned embedding table.

The second move is **binding**. In this lab, binding is componentwise
multiplication:

$$
R \odot V.
$$

For bipolar vectors this operation is its own inverse, coordinate by coordinate:

$$
R \odot (R \odot V) = V.
$$

The third move is **bundling**. To store several role-value pairs in one memory
vector:

$$
M = \sum_i R_i \odot V_i.
$$

To ask for the value bound to role $$R_k$$:

$$
R_k \odot M
  = V_k + \sum_{i\ne k} R_k \odot R_i \odot V_i.
$$

The first term is the desired item. The other terms are crosstalk. In high
dimension, they behave like noise. Cleanup memory then compares the noisy query
against the known item vectors and returns the nearest one.

So the whole record query is:

```text
unbind with the role
then clean up to the nearest known item
```

That is not a parser. It is a noisy associative memory.

## A Lab: Binding Without Fields

The lab below creates random role and item hypervectors, bundles several
role-value bindings into one record vector, corrupts the bundled memory by
flipping coordinate signs, and then tries to recover each item by unbinding with
its role.

The default uses `D=2048`, `128` item symbols, `10` role-value bindings, and
`6%` coordinate sign noise. The audit recovers every default binding. The mean
cleanup margin is `0.2272`, the weakest margin is `0.2098`, and the measured
standard deviation of unrelated item cosines is `0.0244`, close to the
theoretical `1/sqrt(D)=0.0221`.

That margin is the receipt. It is the space between "the right item was nearest"
and "an impostor was nearly as good."

<style>
  .hvec-lab {
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

  .hvec-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
    margin-bottom: 1rem;
  }

  .hvec-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .hvec-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .hvec-lab input {
    accent-color: #7c3aed;
    width: 100%;
  }

  .hvec-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .hvec-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .hvec-lab__metric.good {
    border-color: #9ed8c5;
  }

  .hvec-lab__metric.warn {
    border-color: #f2b8c4;
  }

  .hvec-lab__metric span,
  .hvec-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .hvec-lab__metric span {
    display: block;
  }

  .hvec-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .hvec-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .hvec-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="hypervector-binding-lab" class="hvec-lab" data-hypervector-binding-lab>
  <div class="hvec-lab__controls">
    <label>
      Dimension: <output data-value="dimension">2048</output>
      <input type="range" min="256" max="8192" step="256" value="2048" data-param="dimension">
    </label>
    <label>
      Item vocabulary: <output data-value="vocab">128</output>
      <input type="range" min="32" max="512" step="8" value="128" data-param="vocab">
    </label>
    <label>
      Bindings: <output data-value="pairs">10</output>
      <input type="range" min="1" max="64" step="1" value="10" data-param="pairs">
    </label>
    <label>
      Sign noise: <output data-value="signNoise">6%</output>
      <input type="range" min="0" max="45" step="1" value="6" data-param="signNoise">
    </label>
    <label>
      Seed: <output data-value="seed">41</output>
      <input type="range" min="1" max="997" step="1" value="41" data-param="seed">
    </label>
  </div>
  <div class="hvec-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="700" aria-label="Hypervector binding lab showing random cosine concentration, cleanup memory, capacity sweep, sign-noise sweep, and bundled vector coordinates"></canvas>
  <p class="hvec-lab__note">
    Deterministic browser experiment using bipolar MAP-I style hypervectors.
    Binding is componentwise multiplication; bundling is integer addition;
    cleanup is nearest-neighbor search over the item vocabulary.
  </p>
</div>
<script defer src="{{ '/assets/js/hypervector-binding-lab.js?v=20260616a' | relative_url }}"></script>

Lower **Dimension** to `256`, raise **Bindings**, or raise **Sign noise**. The
record does not fail all at once. The first warning is the margin shrinking.
Eventually a random item becomes closer than the correct value.

That is the practical shape of the method:

```text
capacity is not a field count
capacity is a margin budget
```

## Why the Nearest Impostor Matters

If a query vector is compared against one unrelated item, the accidental cosine
is usually near zero. If it is compared against hundreds or millions of items,
the nearest accidental match is not near zero anymore.

A crude scale for the largest random cosine among $$V$$ candidates is:

$$
\sqrt{\frac{2\log V}{D}}.
$$

The lab calls this the **impostor floor**. It is not an exact theorem for every
cleanup memory, but it is the right warning label. More vocabulary items mean
more chances for a random item to look plausible. More bindings mean more
crosstalk in the query. More coordinate noise means less signal survives.

Those three pressures meet at the cleanup decision.

In the default lab, the impostor floor is about `0.0688`, while the weakest
observed cleanup margin is about `0.2098`. That is comfortable. In a stress
case with `D=512`, `48` bindings, `256` item symbols, and `18%` sign noise, the
same audit recovers only `27.1%` of the role-value pairs.

The algebra did not change. The margin budget did.

## This Is Not an Embedding in the Usual Sense

It is tempting to call every vector an embedding and move on. That loses the
interesting part.

A learned embedding usually asks nearby vectors to mean nearby things. A random
hypervector begins with the opposite policy: unrelated atomic symbols are nearly
orthogonal. Similarity is not assigned at birth. It is created by operations.

Bundling creates set-like similarity:

```text
A + B is partly similar to A
A + B is partly similar to B
```

Binding creates a new vector deliberately dissimilar to its arguments:

```text
role * item is not close to role
role * item is not close to item
```

That dissimilarity is useful. If `agent * mary` were still close to `mary`, then
every role-value pair containing Mary would blur together. Binding moves the
item into a role-specific subspace-like disguise. Unbinding removes the
disguise.

Plate's holographic reduced representations used circular convolution for the
same broad purpose: represent compositional structure in fixed-width distributed
vectors, then recover noisy parts through cleanup memory.[^plate] Kanerva's
binary spatter-code line pushed the bit-vector version.[^kanerva2014] Gayler's
VSA framing emphasized the cognitive problem: how can a connectionist system
rapidly build and transform compositional structures without falling back to
ordinary symbolic pointers?[^gayler]

The answer is not "make vectors magic." The answer is:

```text
make the vector space wide enough
that random accidents are measurable
```

## The Fine Print

There are several traps.

First, cleanup memory is doing work. The query vector is not self-describing.
If the dictionary of possible items is wrong, incomplete, or too large for the
margin, the nearest neighbor can be confidently wrong.

Second, superposition is lossy. Bundling ten role-value pairs into one vector is
not like storing ten fields in a struct. The crosstalk is a real term in the
equation. More dimensions buy more room, but they do not repeal the budget.

Third, there is no single VSA. The Kleyko, Rachkovskij, Osipov, and Rahimi
survey is useful partly because it refuses to collapse the field into one
operator set. Tensor products, HRR, MAP, binary spatter codes, sparse binary
distributed representations, and related models make different tradeoffs.[^survey]
The lab uses MAP-I: random sign vectors, addition for bundling, and
elementwise multiplication for binding. Clarkson, Ubaru, and Yang analyze
capacity for several VSA families and explicitly connect some of the behavior
to sketching and Bloom-filter-like data structures.[^capacity]

Fourth, a beautiful vector record is still a data structure. It needs tests:

1. What dictionary is cleanup allowed to search?
2. How many bindings are bundled before retrieval?
3. How many dimensions are used?
4. How large is the nearest-impostor margin?
5. What happens when coordinates are corrupted?
6. Are the symbols random, learned, or reused from another system?

Those questions sound ordinary because they are. Hyperdimensional computing is
not an escape from engineering. It is a different place to spend the engineering
budget.

## The Part I Like

The part I like is that the record does not contain a field table.

It contains evidence.

Ask with the right role and one item rises out of the superposition. Ask with a
wrong role and you get noise. Add too many facts and the cleanup margin thins.
Make the dimension larger and the random vectors move farther apart. Corrupt
coordinates and the system degrades gradually until the impostor wins.

That is a lovely little model of a broader computational mood:

```text
structure can be exact locally
while storage stays statistical
```

The record has no fields. It has enough dimensions for the fields to be
recoverable.

That distinction is the whole machine.

## Paper Trail

[^kanerva2009]: Pentti Kanerva, ["Hyperdimensional Computing: An Introduction to Computing in Distributed Representation with High-Dimensional Random Vectors"](https://redwood.berkeley.edu/wp-content/uploads/2018/01/kanerva2009hyperdimensional.pdf), *Cognitive Computation* 1(2), 2009.

[^kanerva2014]: Pentti Kanerva, ["Computing with 10,000-Bit Words"](https://redwood.berkeley.edu/wp-content/uploads/2018/01/kanerva2014computing.pdf), 52nd Annual Allerton Conference on Communication, Control, and Computing, 2014.

[^plate]: Tony A. Plate, ["Holographic Reduced Representations"](https://redwood.berkeley.edu/wp-content/uploads/2020/08/Plate-HRR-IEEE-TransNN.pdf), *IEEE Transactions on Neural Networks* 6(3), 1995.

[^gayler]: Ross W. Gayler, ["Vector Symbolic Architectures Answer Jackendoff's Challenges for Cognitive Neuroscience"](https://arxiv.org/abs/cs/0412059), arXiv, 2004; originally ICCS/ASCS International Conference on Cognitive Science, 2003.

[^survey]: Denis Kleyko, Dmitri A. Rachkovskij, Evgeny Osipov, and Abbas Rahimi, ["A Survey on Hyperdimensional Computing aka Vector Symbolic Architectures, Part I: Models and Data Transformations"](https://arxiv.org/abs/2111.06077), *ACM Computing Surveys* 55(6), 2022.

[^capacity]: Kenneth L. Clarkson, Shashanka Ubaru, and Elizabeth Yang, ["Capacity Analysis of Vector Symbolic Architectures"](https://arxiv.org/abs/2301.10352), arXiv, 2023.
