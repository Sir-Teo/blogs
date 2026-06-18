---
layout: post
title: "The Posting List Splits Its Bits"
description: "Elias-Fano encoding stores a monotone integer list by writing low bits literally and turning high bits into a selectable unary bitmap."
date: 2026-06-18 09:05:00 -0400
categories: computer-science
series: succinct-data-structures
tags: [elias-fano, succinct-data-structures, inverted-indexes, compression, rank-select, search-systems]
excerpt: "A sorted list of document IDs does not have to choose between being compressed and being searchable. Elias-Fano splits each value into low bits plus a high-bit select map."
---

A posting list is already half an index.

For a term in a search engine, the document IDs arrive sorted:

```text
3, 4, 7, 13, 14, 15, 21, ...
```

The classical compression move is to store gaps:

```text
3, 1, 3, 6, 1, 1, 6, ...
```

Small gaps get short codes. That is a good instinct. It is also a sequential
instinct: to find the 10,000th posting or skip to the first posting at least
`x`, the decoder often has to walk through earlier codes or auxiliary skip
blocks.

Elias-Fano takes a different route. It treats the sorted list as a monotone
sequence and stores the absolute values in two pieces:

```text
low bits:  literal fixed-width suffixes
high bits: a unary bitmap with select support
```

The representation is not just a compressed byte stream. It is a compressed
addressing scheme.

The construction is usually traced to Peter Elias's work on static files and
Robert Fano's independent work on associative memory.[^elias-fano]

## Split Each Value

Let the list contain $$n$$ integers:

$$
0 \le x_0 < x_1 < \cdots < x_{n-1} < U.
$$

Pick:

$$
\ell = \left\lfloor \log_2(U/n) \right\rfloor.
$$

Write each value as:

$$
x_i = h_i 2^\ell + l_i,
$$

where $$l_i$$ is the low $$\ell$$-bit suffix and $$h_i$$ is the remaining high
part.

The low parts are easy:

```text
l_0, l_1, l_2, ...
```

stored in fixed width. This costs $$n\ell$$ bits.

The high parts are monotone. Elias-Fano stores them by setting one bit per
element in an upper bitmap:

```text
H[h_i + i] = 1.
```

That `+ i` is the little translation that keeps equal high parts from colliding.
If several values share the same high part, their one-bits appear consecutively.
Zeros in the bitmap mark high-part buckets with no value or with a boundary
between groups.

To read the $$i$$th value, select the $$i$$th one-bit in `H`:

$$
h_i = \operatorname{select}_1(H, i) - i.
$$

Then attach the stored low suffix:

$$
x_i = h_i 2^\ell + l_i.
$$

That is the whole shape. The high bits are not decoded by replaying gaps. They
are recovered by a select query.

## The Space Bargain

The exact bit count in the lab is:

$$
n\ell + n + \left\lfloor \frac{U-1}{2^\ell} \right\rfloor + 1.
$$

The first term is the low-bit array. The rest is the upper bitmap: one bit for
each element plus enough zero slots to name the high buckets.

With the usual choice of $$\ell$$, this is close to:

$$
n \log_2(U/n) + O(n)
$$

bits. Lucene's Elias-Fano encoder documentation phrases the engineering bound
as at most roughly `2 + ceil(log2(upperBound / numValues))` bits per encoded
number, under its upper-bound convention.[^lucene]

That is why the representation is attractive for sparse monotone lists. A raw
fixed-width array spends $$\lceil \log_2 U \rceil$$ bits per value. A bitset
spends $$U$$ bits whether the term appears in ten documents or ten million.
Elias-Fano spends bits according to the average spacing.

The catch is density. If the list is very dense, a bitset can win. Vigna's
quasi-succinct index paper makes this engineering point explicitly by switching
to ranked characteristic bitvectors for dense cases.[^vigna] Lucene's docs make
a similar practical comparison against fixed bitsets.[^lucene]

So the right slogan is not "Elias-Fano beats bitsets." It is:

```text
Elias-Fano is a sparse monotone sequence layout with useful navigation baked in.
```

## The Lab

The lab below builds deterministic synthetic posting lists, encodes them with
Elias-Fano, and compares the bit budget against three baselines:

- fixed-width absolute document IDs;
- a full universe bitset;
- byte-aligned varint gaps; and
- the Elias-Fano split itself.

It also checks two operations:

- `access(i)`, by decoding `select1(i) - i` plus the low bits; and
- `nextGEQ(target)`, implemented here as a binary search over decoded access.

That `nextGEQ` implementation is intentionally simple. Production structures
avoid decoding one item at a time by adding rank/select samples, broadword
search, and skip pointers. The point of the artifact is to expose the invariant,
not to pretend a few dozen lines of JavaScript is a tuned search engine.

<style>
  .elias-fano-lab {
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

  .elias-fano-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .elias-fano-lab label,
  .elias-fano-lab__metric span,
  .elias-fano-lab__note,
  .elias-fano-lab__legend {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .elias-fano-lab label {
    display: grid;
    font-weight: 650;
    gap: 0.35rem;
    min-width: 0;
  }

  .elias-fano-lab input,
  .elias-fano-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .elias-fano-lab select {
    color: #172026;
  }

  .elias-fano-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .elias-fano-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    margin: 0.4rem 0 0.8rem;
  }

  .elias-fano-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .elias-fano-lab__metric--good {
    background: #ecfdf5;
    border-color: #bbf7d0;
  }

  .elias-fano-lab__metric--bad {
    background: #fff1f2;
    border-color: #fecdd3;
  }

  .elias-fano-lab__metric span {
    display: block;
  }

  .elias-fano-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .elias-fano-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .elias-fano-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .elias-fano-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .elias-fano-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .elias-fano-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 680px) {
    .elias-fano-lab {
      padding: 0.8rem;
    }

    .elias-fano-lab__controls,
    .elias-fano-lab__metrics {
      grid-template-columns: 1fr;
    }

    .elias-fano-lab canvas {
      height: 1120px;
    }
  }
</style>

<div class="elias-fano-lab" data-elias-fano-lab>
  <div class="elias-fano-lab__controls">
    <label>
      Scenario <output data-output="scenario">clustered postings</output>
      <select data-param="scenario" aria-label="Posting list scenario">
        <option value="clustered" selected>clustered postings</option>
        <option value="uniform">uniform gaps</option>
        <option value="dense">dense predicate</option>
        <option value="runs">runs and jumps</option>
      </select>
    </label>
    <label>
      Universe <output data-output="universe">100,000</output>
      <input type="range" min="1000" max="1000000" step="1000" value="100000" data-param="universe" aria-label="Document universe">
    </label>
    <label>
      Postings <output data-output="count">900</output>
      <input type="range" min="16" max="8000" step="1" value="900" data-param="count" aria-label="Posting count">
    </label>
    <label>
      Locality <output data-output="locality">45%</output>
      <input type="range" min="0" max="100" step="5" value="45" data-param="locality" aria-label="Posting locality">
    </label>
    <label>
      Access rank <output data-output="queryRank">#42</output>
      <input type="range" min="0" max="899" step="1" value="42" data-param="queryRank" aria-label="Access rank">
    </label>
    <label>
      Skip target <output data-output="target">42,000</output>
      <input type="range" min="0" max="99999" step="1" value="42000" data-param="target" aria-label="Next greater or equal target">
    </label>
    <label>
      Seed <output data-output="seed">17</output>
      <input type="range" min="1" max="9999" step="1" value="17" data-param="seed" aria-label="Deterministic random seed">
    </label>
  </div>
  <div class="elias-fano-lab__metrics" data-metrics></div>
  <canvas data-canvas width="980" height="760" aria-label="Elias-Fano lab showing posting distribution, high-low bit split, storage ledger, and access plus skip query"></canvas>
  <div class="elias-fano-lab__legend">
    <span><i style="background:#0f766e"></i> Elias-Fano</span>
    <span><i style="background:#2563eb"></i> low bits</span>
    <span><i style="background:#b45309"></i> high bits</span>
    <span><i style="background:#be123c"></i> skip target</span>
  </div>
  <p class="elias-fano-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/elias-fano-lab.js?v=20260618c' | relative_url }}"></script>

The lab has a built-in audit. It reports 35 named checks: decode,
monotonicity, high-bit placement, one-bit count, direct access, `nextGEQ`,
and target-sweep lower bounds across five scenarios:

```bash
node - <<'NODE'
const lab = require("./assets/js/elias-fano-lab.js");
const EXPECTED_CASE_KEYS = [
  "1:default-clustered:100000:900:6",
  "2:uniform:4096:64:6",
  "3:clustered:100000:1500:6",
  "4:dense:2048:1200:0",
  "5:runs:250000:2200:6"
];
const EXPECTED_CHECK_NAMES = [
  "decode",
  "monotone-input",
  "high-bit-positions",
  "one-bit-count",
  "access-query",
  "next-geq-query",
  "target-sweep"
];
const EXPECTED_CASES = EXPECTED_CASE_KEYS.length;
const EXPECTED_CHECKS = EXPECTED_CASES * EXPECTED_CHECK_NAMES.length;

function sameList(left, right) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function auditShape(audit) {
  return {
    cases: audit.cases.map(
      (row) => `${row.caseId}:${row.scenario}:${row.universe}:${row.count}:${row.l}`
    ),
    checksByCase: audit.cases.map((row) => row.checks.map((check) => check.name))
  };
}

const audit = lab.auditEliasFanoLab();
const shape = auditShape(audit);
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const shapeErrors = [
  sameList(shape.cases, EXPECTED_CASE_KEYS) ? null : "cases",
  shape.checksByCase.every((checks) => sameList(checks, EXPECTED_CHECK_NAMES))
    ? null
    : "checksByCase"
].filter(Boolean);
console.table(audit.cases.map((row) => ({
  scenario: row.scenario,
  universe: row.universe,
  count: row.count,
  l: row.l,
  efBitsPerValue: row.bitsPerValue.toFixed(2),
  varbyteBitsPerValue: row.varbyteBitsPerValue.toFixed(2),
  checks: `${row.passedChecks}/${row.totalChecks}`,
  targetOk: row.targetOk,
  passed: row.passed
})));
const summary =
  `${audit.passed}/${audit.total} scenarios and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  shapeErrors.length ||
  audit.total !== EXPECTED_CASES ||
  audit.totalChecks !== EXPECTED_CHECKS ||
  failed.length ||
  !audit.ok ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(JSON.stringify({
    summary,
    shapeErrors,
    shape,
    failed,
    errors: audit.errors,
    expectedCases: EXPECTED_CASES,
    expectedChecks: EXPECTED_CHECKS,
    total: audit.total,
    totalChecks: audit.totalChecks
  }, null, 2));
}
console.log(summary);
NODE
```

The checks cover uniform, clustered, dense, and run-heavy lists. They assert
that:

- decoding every index reproduces the original sorted list;
- every one-bit is at position `high(x[i]) + i`;
- the number of one-bits equals the number of postings;
- `access(i)` agrees with the original list; and
- `nextGEQ(target)` agrees with a naive lower-bound scan.

## Why This Is Useful for Search

Vigna's quasi-succinct index paper begins with a contrast against ordinary
gap-compressed inverted indexes: document pointers are stored in increasing
order, and gap compression gives small gaps short codes, but the proposed index
uses a quasi-succinct representation of monotone sequences instead.[^vigna]

That change matters because query engines do not only enumerate postings. They
also skip. A conjunctive query needs to keep several posting lists aligned:

```text
advance the shorter list to at least the current document of the longer list
```

If the compressed representation supports `access` and `nextGEQ` cheaply, the
index can stay compressed while still behaving like an addressable object.

This is the reason Elias-Fano keeps reappearing in search systems, graph
compression, and succinct libraries. The high bitmap is not decorative. It is
where the navigation lives.

## What This Toy Does Not Include

The JavaScript lab stores the `select1` positions explicitly. That would be
wasteful in a real compressed index. Production implementations store sampled
rank/select support, use word-level bit tricks, and often add skip pointers.
Vigna describes longword addressing and broadword bit search as key engineering
pieces for query speed.[^vigna]

The lab also encodes one list at a time. Modern variants exploit clustering and
partitioning. Ottaviano and Venturini's partitioned Elias-Fano work describes a
two-level representation that improves the compression/time tradeoff, especially
when posting lists have locally clustered regions.[^partitioned] Pibiri and
Venturini later show that clustering related posting lists can reduce
redundancy across lists, while still building on Elias-Fano representations of
monotone sequences.[^clustered]

Those refinements do not change the core picture:

```text
low bits carry local offsets
high bits carry a selectable map
```

Once you see that split, Elias-Fano stops looking like just another integer
codec. It is a way to store a sorted list so that the compressed form still has
addresses.

[^lucene]: Apache Lucene 4.10.2 API documentation for [`EliasFanoEncoder`](https://lucene.apache.org/core/4_10_2/core/org/apache/lucene/util/packed/EliasFanoEncoder.html). The docs describe the high-bits/low-bits representation, the choice of `L`, the bits-per-number bound, and the comparison with fixed bitsets.

[^vigna]: Sebastiano Vigna, ["Quasi-Succinct Indices"](https://vigna.di.unimi.it/ftp/papers/QuasiSuccinctIndices.pdf), WSDM 2013; [arXiv page](https://arxiv.org/abs/1206.4300). Vigna applies Elias-Fano-style monotone sequence representations to inverted indexes and discusses random access, skipping, and broadword engineering.

[^partitioned]: Giuseppe Ottaviano and Rossano Venturini, ["Partitioned Elias-Fano Indexes"](https://dl.acm.org/doi/10.1145/2600428.2609615), SIGIR 2014. The abstract describes a two-level representation that partitions lists and encodes chunks and endpoints with Elias-Fano.

[^clustered]: Giulio Ermanno Pibiri and Rossano Venturini, ["Clustered Elias-Fano Indexes"](https://pages.di.unipi.it/rossano/assets/pdf/papers/TOIS17.pdf), ACM Transactions on Information Systems. The paper reviews Elias-Fano for monotone sequences, gives the `H` and `L` encoding layout, and studies clustered posting-list representations.

[^elias-fano]: Original sources: Peter Elias, ["Efficient Storage and Retrieval by Content and Address of Static Files"](https://dl.acm.org/doi/10.1145/321812.321820), *Journal of the ACM* 21(2), 1974; Robert M. Fano, ["On the Number of Bits Required to Implement an Associative Memory"](https://csg.csail.mit.edu/pubs/memos/Memo-61/Memo-61.pdf), MIT Project MAC Memorandum 61, 1971.
