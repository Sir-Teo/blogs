---
layout: post
title: "The Alphabet Splits Into Bits"
description: "A wavelet tree makes rank, select, access, and range quantile queries by recursively turning a large alphabet into stable bitvector decisions."
date: 2026-06-18 08:28:00 -0400
categories: computer-science
tags: [wavelet-tree, rank-select, succinct-data-structures, range-quantile, compressed-indexes, algorithms]
excerpt: "A sequence over many symbols can be queried through binary rank/select if every level asks only one question: does this symbol live in the left half or the right half of the alphabet?"
---

A bitvector knows how to count.

Give it a small rank directory and it can answer:

```text
rank1(B, i) = number of 1 bits in B[0..i)
```

Add select support and it can also answer:

```text
select1(B, k) = position of the k-th 1 bit
```

That is enough for binary strings. The wavelet tree asks what happens when the
sequence is not binary.

The trick is to refuse the large alphabet at the top level. Split the alphabet in
two. Write `0` for symbols in the left half and `1` for symbols in the right
half. Then recursively build the same structure on the two stable subsequences.
After $$\lceil \log_2 \sigma \rceil$$ levels, a symbol has been identified by a path
of binary decisions.

This is not just a cute encoding. It is a query plan.

## The Stored Object

Let $$S[0,n)$$ be a static sequence over alphabet $$\Sigma$$. A balanced wavelet
tree node owns a subalphabet $$A$$ and the subsequence of $$S$$ whose symbols are
in $$A$$.

If $$A$$ contains more than one symbol, split it into $$A_0$$ and $$A_1$$. Store a
bitvector $$B_v$$:

$$
B_v[i] =
\begin{cases}
0 & \text{if } S_v[i] \in A_0 \\
1 & \text{if } S_v[i] \in A_1.
\end{cases}
$$

The left child receives the symbols of $$S_v$$ in $$A_0$$, in the same order. The
right child receives the symbols in $$A_1$$, also in the same order. That stable
partition is the invariant. It is why positions can be translated from a parent
bitmap to a child bitmap with rank.

Grossi, Gupta, and Vitter introduced wavelet trees inside their 2003 work on
high-order entropy-compressed text indexes.[^ggv] Navarro's survey is a good
map of the structure after it escaped that original setting: it can be viewed as
a sequence representation, a permutation/reordering device, or a grid of
points.[^navarro]

The small version in this post is the sequence view.

## Three Primitive Moves

For `access(i)`, start at the root. Read the bit at position `i`.

```text
bit 0: i <- rank0(B, i), go left
bit 1: i <- rank1(B, i), go right
```

When the descent reaches a leaf, that leaf's symbol is `S[i]`.

For `rank(c, i)`, follow the path that would lead to symbol `c`. At every node,
translate the prefix length:

```text
c in left half:  i <- rank0(B, i)
c in right half: i <- rank1(B, i)
```

At the leaf, the remaining `i` is the number of occurrences of `c` in the
original prefix.

For `select(c, k)`, do the inverse. Start at the leaf for `c`, where the `k`-th
copy has local position `k - 1`. Walk upward. If this leaf was reached through a
left edge, ask the parent bitmap for the position of the corresponding zero; if
it was reached through a right edge, ask for the corresponding one.

```text
left edge:  parent_pos <- select0(B, child_pos + 1)
right edge: parent_pos <- select1(B, child_pos + 1)
```

Claude and Navarro's practical study is a useful reminder that this elegant
story lives or dies on the engineering of rank/select over the node
bitvectors.[^claude] The lab here uses visible prefix arrays, not a compressed
RRR or broadword implementation, so the accounting is explanatory rather than
competitive.

## Range Quantile Is The Same Descent

Now ask a different question:

```text
what is the k-th smallest symbol in S[l..r)?
```

At a node, count how many active range items go left:

$$
z =
\mathrm{rank}_0(B_v, r) -
\mathrm{rank}_0(B_v, l).
$$

If $$k \le z$$, the answer is in the left child. Translate the range to:

```text
l <- rank0(B, l)
r <- rank0(B, r)
```

Otherwise, the answer is in the right child. Subtract the left count and
translate with `rank1`:

```text
k <- k - z
l <- rank1(B, l)
r <- rank1(B, r)
```

Repeat until a leaf. Gagie, Puglisi, and Turpin used this observation to support
range quantile queries, including medians as the special case where `k` is the
middle rank, in $$O(\log \sigma)$$ time using a balanced wavelet tree.[^gagie]

The implementation below checks that descent against naive sorting for every
slice of each built-in sequence.

<style>
  .wavelet-tree-lab {
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

  .wavelet-tree-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .wavelet-tree-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .wavelet-tree-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
    overflow-wrap: anywhere;
  }

  .wavelet-tree-lab input,
  .wavelet-tree-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .wavelet-tree-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .wavelet-tree-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0 0 0.9rem;
  }

  .wavelet-tree-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .wavelet-tree-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .wavelet-tree-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.38);
  }

  .wavelet-tree-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 740;
    letter-spacing: 0;
    line-height: 1.18;
    margin-bottom: 0.22rem;
    text-transform: uppercase;
  }

  .wavelet-tree-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.78rem, 2.2vw, 1rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .wavelet-tree-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .wavelet-tree-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="wavelet-tree-lab" data-wavelet-tree-lab>
  <div class="wavelet-tree-lab__controls">
    <label>
      Sequence
      <output data-value="sample">toy genome</output>
      <select data-param="sample" aria-label="Sequence">
        <option value="genome" selected>Toy genome</option>
        <option value="mississippi">Mississippi</option>
        <option value="abracadabra">Abracadabra</option>
        <option value="prices">Price codes</option>
      </select>
    </label>
    <label>
      Symbol
      <output data-value="symbol">A</output>
      <select data-param="symbol" aria-label="Query symbol"></select>
    </label>
    <label>
      Access position
      <output data-value="position">7</output>
      <input type="range" min="0" max="24" step="1" value="7" data-param="position" aria-label="Access position">
    </label>
    <label>
      Rank prefix end
      <output data-value="prefixEnd">16 chars</output>
      <input type="range" min="0" max="25" step="1" value="16" data-param="prefixEnd" aria-label="Rank prefix end">
    </label>
    <label>
      Select occurrence
      <output data-value="selectK">5</output>
      <input type="range" min="1" max="10" step="1" value="5" data-param="selectK" aria-label="Select occurrence">
    </label>
    <label>
      Range start
      <output data-value="rangeStart">3</output>
      <input type="range" min="0" max="24" step="1" value="3" data-param="rangeStart" aria-label="Range start">
    </label>
    <label>
      Range end
      <output data-value="rangeEnd">18</output>
      <input type="range" min="1" max="25" step="1" value="18" data-param="rangeEnd" aria-label="Range end">
    </label>
    <label>
      Range rank
      <output data-value="kth">7</output>
      <input type="range" min="1" max="15" step="1" value="7" data-param="kth" aria-label="Range quantile rank">
    </label>
  </div>
  <div class="wavelet-tree-lab__metrics" data-metrics></div>
  <canvas data-canvas width="980" height="770" aria-label="Wavelet tree lab showing alphabet splits, bitvectors, rank-select ledgers, and range quantile descent"></canvas>
  <p class="wavelet-tree-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/wavelet-tree-lab.js?v=20260618c' | relative_url }}"></script>

## What The Lab Audits

The module exports the same implementation used by the browser:

```bash
node - <<'NODE'
const lab = require("./assets/js/wavelet-tree-lab.js");
const audit = lab.auditWaveletTreeLab();
console.table(audit.bySample);
console.table(audit.criticalChecks);
if (audit.total !== 30 || audit.totalChecks !== 210) {
  throw new Error(`unexpected audit size: ${audit.total} cases, ${audit.totalChecks} checks`);
}
if (!audit.ok || audit.passed !== audit.total || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify(audit.errors, null, 2));
}
console.log(`${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`);
NODE
```

For every built-in sequence, the audit checks:

- `access(i)` returns the original symbol for every position;
- `rank(c, i)` equals a direct prefix scan for every symbol and prefix length;
- `select(c, k)` returns the same position as a direct occurrence scan;
- range quantile agrees with sorting every nonempty slice and taking the
  requested rank;
- every internal bitmap length equals its stable partition children; and
- the sum of zero-order entropy over node bitmaps equals the sequence's
  zero-order empirical entropy.

The last check is the compression ledger. The raw balanced tree stores at most
$$n \lceil \log_2 \sigma \rceil$$ bitmap bits, because every original symbol
contributes one bit per level on its root-to-leaf path. If each node bitmap were
compressed to its own zero-order entropy while keeping rank/select, the entropy
terms telescope to $$nH_0(S)$$. Navarro gives the clean derivation in the survey:
the root separates the alphabet into two groups; children separate those groups
again; after the last split, the sum has become
$$\sum_{c \in \Sigma} n_c \log_2(n/n_c)$$.

## Where This Toy Stops

The implementation is static and intentionally literal. It stores one prefix
count per bit position, so rank is easy to inspect. A production compact sequence
representation would replace those arrays with succinct rank/select structures,
possibly use Huffman-shaped or multiary wavelet trees, or use a wavelet matrix to
remove pointer-heavy tree navigation for large alphabets.

The important invariant survives those engineering choices:

```text
parent range + rank on a stable bitmap = child range
```

Once that invariant clicks, the structure stops looking like a compression
curiosity. It is a way to keep asking binary questions without forgetting where
the original positions went.

[^ggv]: Roberto Grossi, Ankur Gupta, and Jeffrey Scott Vitter, ["High-Order Entropy-Compressed Text Indexes"](https://courses.cs.duke.edu/spring03/cps296.5/presentations/sodaconf03.pdf), *SODA*, 2003. Bibliographic record: [KU ScholarWorks](https://kuscholarworks.ku.edu/entities/publication/f58ebe57-2bcd-48f8-bfb0-0a9e66ad89ed).

[^navarro]: Gonzalo Navarro, ["Wavelet Trees for All"](https://users.dcc.uchile.cl/~gnavarro/ps/cpm12.pdf), *CPM*, 2012. Springer record and DOI: [10.1007/978-3-642-31265-6_2](https://doi.org/10.1007/978-3-642-31265-6_2).

[^claude]: Francisco Claude and Gonzalo Navarro, ["Practical Rank/Select Queries over Arbitrary Sequences"](https://users.dcc.uchile.cl/~gnavarro/ps/spire08.1.pdf), *SPIRE*, 2008. DOI: [10.1007/978-3-540-89097-3_18](https://doi.org/10.1007/978-3-540-89097-3_18).

[^gagie]: Travis Gagie, Simon J. Puglisi, and Andrew Turpin, ["Range Quantile Queries: Another Virtue of Wavelet Trees"](https://arxiv.org/abs/0903.4726), arXiv:0903.4726, 2009/2010. DOI: [10.48550/arXiv.0903.4726](https://doi.org/10.48550/arXiv.0903.4726).
