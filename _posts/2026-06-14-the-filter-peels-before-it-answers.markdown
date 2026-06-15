---
layout: post
title: "The Filter Peels Before It Answers"
description: "Xor filters look like a three-probe membership test. The construction is stranger: build a random hypergraph, peel it, then solve a sparse XOR system backward."
date: 2026-06-14 23:44:00 -0400
categories: computer-science
series: probabilistic-data-structures
tags: [xor-filters, approximate-membership, probabilistic-data-structures, hashing, static-filters, hypergraphs, data-structures]
excerpt: "A static membership filter can store no keys and still answer quickly, if its construction first finds an order in which the equations become easy."
---

Here is a small weirdness that took me longer than it should have:

an approximate membership filter does not have to remember where the keys are.

It only has to remember enough constraints that every inserted key can prove it
was inserted, and almost every non-key fails the same proof.

Bloom filters do this by setting bits. Cuckoo filters do it by storing short
fingerprints in a hash table. Xor filters do something that feels closer to a
magic trick: build a table `B` of short integers so that every real key `x`
satisfies one equation,

$$
B[h_0(x)] \oplus B[h_1(x)] \oplus B[h_2(x)]
= \operatorname{fingerprint}(x).
$$

Then lookup is just the same equation again.

No key bytes. No collision chain. No search path. Three locations, one XOR, one
comparison.

The cost is paid before the filter ever answers a query.

## The Query Is the Easy Part

Graf and Lemire's xor filter paper gives the practical version of this idea:
store `k`-bit values in an array whose capacity is slightly larger than the
number of keys, hash each key into three disjoint ranges of that array, and
arrange the table so the XOR of those three entries equals the key's
fingerprint.[^xor]

For an inserted key, the equality is true by construction.

For an absent key, the three table values are not arranged to match its
fingerprint. Under the usual random-hashing model, the XOR result behaves like a
random `k`-bit value, so it matches the absent key's `k`-bit fingerprint
with probability about

$$
2^{-k}.
$$

That is the entire false-positive knob. Eight fingerprint bits means roughly
one false positive per 256 absent queries. Ten bits means one per 1024. Sixteen
bits means one per 65,536.

The information-theoretic lower bound for static approximate membership is
`log2(1 / epsilon)` bits per key. Graf and Lemire emphasize that standard Bloom
filters spend about 44% above that lower bound, while xor filters are designed
to sit much closer in common settings.[^xor] Their canonical capacity choice is
about `1.23n` table slots, plus a small additive term for small sets. With
`k`-bit fingerprints, that rough design point is about

$$
1.23k \text{ bits per key.}
$$

So the attractive story is simple:

```text
Bloom filter: many bit probes, easy incremental inserts
xor filter:  three value probes, compact static table
```

But that story skips the construction. The construction is the interesting
part.

## The Filter Is a Retrieval Structure in Disguise

Dietzfelbinger and Pagh framed a more general problem called retrieval: given a
set `S`, store a function that returns prescribed values on `S`, while anything
may happen outside `S`.[^dietzfelbinger-pagh]

Approximate membership drops out of that. Prescribe

$$
F(x)=\operatorname{fingerprint}(x)
\qquad\text{for }x\in S.
$$

When a query `y` arrives, compute `F(y)` and compare it with
`fingerprint(y)`. If `y` is in `S`, the value was prescribed. If `y` is not in
`S`, the retrieved value is effectively unconstrained, so a match is rare.

An xor filter is one practical retrieval structure. The table entries are the
unknowns. Each inserted key contributes one equation:

$$
B[a_x]\oplus B[b_x]\oplus B[c_x] = f_x.
$$

Bitwise, XOR is addition over `GF(2)`. If the fingerprints have `k` bits, think
of this as `k` parallel sparse linear systems sharing the same
coefficient matrix.

You could solve that system with Gaussian elimination.

Xor filters try very hard not to.

## Peeling Is Cheap Elimination

Draw a 3-uniform hypergraph.

- Every table slot is a vertex.
- Every key is a hyperedge touching its three hashed slots.
- Every hyperedge carries a right-hand side: the key fingerprint.

If some table slot is touched by exactly one remaining key, that key has an
equation with one variable that can be made special. Remove the key from the
hypergraph and push it onto a stack.

Repeat:

```text
find a degree-one slot
remove its one incident key
decrease the degrees of the key's other two slots
push the removed equation onto a stack
```

If all keys are removed, the graph is peelable. Now process the stack backward.
When an equation returns from the stack, two of its three table values may
already have been assigned, but the slot that was degree-one at removal time is
still free. Set that slot to whatever value makes the XOR equation true.

That is sparse elimination without matrix notation.

Botelho, Pagh, and Ziviani used this kind of acyclic random hypergraph
construction in practical minimal perfect hashing.[^botelho] Graf and Lemire's
xor-filter construction follows the same peel-and-assign shape: try random hash
functions, peel, and if a core remains, try a new seed.[^xor]

The failure mode is not a query error. It is a construction failure. The filter
has not been built yet.

## The Lab

The lab below builds the exact toy object just described. It is deliberately
small enough to inspect:

- keys are integers `0,...,n-1`;
- each key hashes to one slot in each of three equal segments;
- the mapping step repeatedly peels degree-one slots;
- a successful peel assigns the table in reverse order;
- absent keys are probed to estimate the false-positive rate.

The default uses 96 keys, 24% slack, 8-bit fingerprints, and seed 1. The build
peels all 96 keys on the first attempt. The table has 120 slots, so the lab uses
10.00 bits per key. In a deterministic audit with 8192 absent probes, it
observes 32 false positives:

```text
32 / 8192 = 0.390625% = 2^-8
```

That equality is too neat to promise in every run. It is a finite probe sample.
The important invariant is stricter: inserted keys have zero false negatives
because their equations were forced to hold.

<style>
  .xor-filter-lab {
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

  .xor-filter-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
  }

  .xor-filter-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .xor-filter-lab__controls input {
    min-width: 0;
    width: 100%;
  }

  .xor-filter-lab__controls input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    height: 1.15rem;
  }

  .xor-filter-lab__controls input[type="range"]::-webkit-slider-runnable-track {
    background: #d7dee5;
    border-radius: 999px;
    height: 4px;
  }

  .xor-filter-lab__controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    background: #0f766e;
    border: 0;
    border-radius: 999px;
    height: 14px;
    margin-top: -5px;
    width: 14px;
  }

  .xor-filter-lab__controls input[type="range"]::-moz-range-track {
    background: #d7dee5;
    border-radius: 999px;
    height: 4px;
  }

  .xor-filter-lab__controls input[type="range"]::-moz-range-thumb {
    background: #0f766e;
    border: 0;
    border-radius: 999px;
    height: 14px;
    width: 14px;
  }

  .xor-filter-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .xor-filter-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .xor-filter-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .xor-filter-lab__metric span,
  .xor-filter-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .xor-filter-lab__metric span {
    display: block;
  }

  .xor-filter-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .xor-filter-lab canvas {
    background: #ffffff;
    display: block;
    height: 760px;
    max-width: 100%;
    width: 100%;
  }

  .xor-filter-lab__note {
    margin: 0.9rem 0 0;
  }

  @media (max-width: 560px) {
    .xor-filter-lab {
      padding: 0.85rem;
    }

    .xor-filter-lab canvas {
      height: 980px;
    }
  }

</style>

<div class="xor-filter-lab" data-xor-filter-lab>
  <div class="xor-filter-lab__controls">
    <label>
      <span>Keys: <output data-value="keys">96</output></span>
      <input type="range" min="24" max="220" step="4" value="96" data-param="keys">
    </label>
    <label>
      <span>Table overhead: <output data-value="overhead">24%</output></span>
      <input type="range" min="4" max="50" step="1" value="24" data-param="overhead">
    </label>
    <label>
      <span>Fingerprint bits: <output data-value="bits">8</output></span>
      <input type="range" min="4" max="14" step="1" value="8" data-param="bits">
    </label>
    <label>
      <span>Rehash attempts: <output data-value="retries">6</output></span>
      <input type="range" min="1" max="16" step="1" value="6" data-param="retries">
    </label>
    <label>
      <span>Sweep trials: <output data-value="trials">48</output></span>
      <input type="range" min="16" max="96" step="4" value="48" data-param="trials">
    </label>
    <label>
      <span>Hash seed: <output data-value="seed">1</output></span>
      <input type="range" min="1" max="9999" step="1" value="1" data-param="seed">
    </label>
  </div>
  <div class="xor-filter-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Xor filter simulator showing a peelable three-part hypergraph, the peeling ledger, assigned xor table values, and construction success under different slack values"></canvas>
  <p class="xor-filter-lab__note">
    Deterministic browser model for the construction mechanism, not a production
    implementation or benchmark. The executable artifact is
    <code>assets/js/xor-filter-lab.js</code>.
  </p>
</div>

<script defer src="{{ '/assets/js/xor-filter-lab.js?v=20260614a' | relative_url }}"></script>

## What the Slack Is Buying

The table is larger than the key set because the hypergraph must be peelable.
Too few slots means the random hypergraph is likely to contain a core: a
subgraph where every remaining slot has degree at least two. Once that happens,
the cheap degree-one elimination process has nowhere to start.

At the default 96-key setting, the lab's one-seed sweep reports this pattern
over 48 seeds:

```text
overhead   one-seed success
   16%          2 / 48
   20%          9 / 48
   24%         18 / 48
   28%         25 / 48
   32%         38 / 48
   42%         47 / 48
```

This is why real builders retry with new hash seeds. A failed peel does not
mean the key set is impossible. It means this particular random system kept a
core. Rehashing resamples the system.

The default build succeeds immediately, but move the seed slider and you will
see failures. The red hyperedges are not false positives. They are equations
that were never assigned because construction stopped before a table existed.

## Static Is a Feature and a Limitation

The word static is doing real work.

A Bloom filter welcomes incremental inserts: set more bits, accept that the
false-positive rate rises as the array fills. A cuckoo filter can support
deletes under its own fingerprint-placement contract.

An xor filter wants the whole set first. Add one key after construction and you
have added one more equation to a solved system. The old table is not generally
valid anymore. You rebuild.

That sounds like a weakness until you are in a workload that already rebuilds
filters in batches:

- immutable SSTables in an LSM tree;
- shipped dictionaries or deny lists;
- compact routing hints;
- static language-model token or string sets;
- read-mostly indexes where memory bandwidth matters more than update latency.

In those places, static construction is not an embarrassment. It is the reason
the representation can be so lean.

## The Family Kept Moving

Xor filters are not the final word. They are a clean point on a larger curve.

Binary fuse filters, also by Graf and Lemire, keep the XOR-based flavor but
improve practical space and construction tradeoffs; their paper reports storage
within 13% of the lower bound and construction more than twice as fast as xor
filters in their experiments.[^binary-fuse] Ribbon filters take another route:
they resemble xor filters, but change the linear system to improve locality and
can push space overhead lower with more construction work.[^ribbon]

The shared theme is the useful one:

```text
static approximate membership can be viewed as a tiny retrieval problem
```

Once you see that, the filter is no longer just "a probabilistic set." It is a
compiled proof system for one fixed set of keys.

## The Useful Lesson

The query path is almost too small to think about:

```text
read three cells
xor them
compare with the fingerprint
```

The construction path is where the intelligence lives:

```text
turn keys into sparse equations
find a peel order
solve backward
retry if a core survives
```

That distinction is the whole personality of the data structure. Xor filters
are fast because they move work out of queries. They are compact because they
store constraints, not keys. They fail to build because random sparse systems
sometimes have cores. They give false positives because an absent key can
accidentally satisfy the same checksum equation.

The filter peels before it answers.

[^xor]: Thomas Mueller Graf and Daniel Lemire, "Xor Filters: Faster and Smaller Than Bloom and Cuckoo Filters", *ACM Journal of Experimental Algorithmics*, 2019. [arXiv](https://arxiv.org/abs/1912.08258), [DOI](https://doi.org/10.1145/3376122).

[^dietzfelbinger-pagh]: Martin Dietzfelbinger and Rasmus Pagh, "Succinct Data Structures for Retrieval and Approximate Membership", ICALP 2008. [arXiv](https://arxiv.org/abs/0803.3693).

[^botelho]: Fabiano C. Botelho, Rasmus Pagh, and Nivio Ziviani, "Perfect Hashing for Data Management Applications", 2007. [arXiv](https://arxiv.org/abs/cs/0702159).

[^binary-fuse]: Thomas Mueller Graf and Daniel Lemire, "Binary Fuse Filters: Fast and Smaller Than Xor Filters", *ACM Journal of Experimental Algorithmics*, 2022. [arXiv](https://arxiv.org/abs/2201.01174), [DOI](https://doi.org/10.1145/3510449).

[^ribbon]: Peter C. Dillinger and Stefan Walzer, "Ribbon filter: practically smaller than Bloom and Xor", 2021. [arXiv](https://arxiv.org/abs/2103.02515).
