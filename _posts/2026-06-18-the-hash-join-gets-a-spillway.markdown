---
layout: post
title: "The Hash Join Gets a Spillway"
description: "A hash join larger than memory survives by partitioning both inputs into matching batches. Spilling is not a side effect; it is the algorithm's escape hatch."
date: 2026-06-18 09:48:00 -0400
categories: software-engineering
tags: [hash-join, databases, query-execution, spilling, postgresql, join-algorithms, data-systems]
excerpt: "Hash join is usually taught as build a table, then probe it. The larger story is what happens when the build table does not fit."
---

The tiny hash-join story fits on one napkin:

```text
build a hash table from the smaller input
scan the larger input
probe the table for matching keys
```

That is the pleasant case. It is also the case that hides the interesting
engineering.

The executor does not always receive a build side that fits in memory. Cardinality
estimates are wrong. Tuple widths are larger than expected. A key distribution is
not uniform. Several queries are competing for memory. At that point the hash
join needs a spillway: a way to turn one too-large join into many smaller joins
without changing the answer.

The trick is to partition both relations by the join key.

If a build tuple `r` and a probe tuple `s` can join, then their join keys are
equal, so a deterministic partition hash sends them to the same batch:

$$
h(r.key)=h(s.key).
$$

Therefore:

```text
join(R, S)
=
union over batches i of join(R_i, S_i)
```

The hash table only has to hold one build batch at a time.

## Two Hashes, Two Jobs

It helps to separate two hashes that are often blurred together.

The **partition hash** decides which batch a tuple belongs to. It is the spillway
contract. Corresponding build and probe tuples must go to the same batch.

The **lookup hash** is used inside one resident batch to find matching build
tuples quickly.

These are conceptually different jobs. The first bounds memory by cutting the
problem into files. The second avoids comparing every tuple inside a file.

Shapiro's 1986 paper describes three hash-based join strategies: simple hash,
GRACE hash, and hybrid hash.[^shapiro] The shared idea is partitioning. If the
smaller relation cannot fit in memory, partition both inputs into corresponding
subsets, then join matching subsets. The hybrid algorithm keeps one partition
resident while spilling the rest, so it degrades from an in-memory hash join
toward GRACE-style partitioning as memory becomes scarce.

That is the shape modern systems still expose. PostgreSQL's `EXPLAIN ANALYZE`
shows `Buckets`, `Batches`, and hash memory usage on hash nodes; its docs note
that more than one batch implies disk space is involved even when the display
does not show the disk amount.[^pg-explain] PostgreSQL also makes the memory
budget for hash operations depend on `work_mem * hash_mem_multiplier`.[^pg-memory]

So the line:

```text
Buckets: 65536  Batches: 8  Memory Usage: 4096kB
```

is not decoration. It is a field report from the spillway.

## Lab: Batches Are a Memory Promise

The lab below builds deterministic synthetic key-count tables for a build input
and a probe input. It estimates the batch count from the build-side memory
budget, partitions both sides by the same hash, then doubles the batch count
until every build batch fits or a single key is too large to split.

It does not simulate PostgreSQL tuple headers, cache misses, executor state
machines, parallel barriers, filesystem behavior, or output materialization.
The purpose is narrower:

- show why build and probe sides must be partitioned together;
- show why `Batches > 1` means extra temporary writes and reads;
- show why skew can make the original batch estimate grow;
- show the degenerate case where one hot key is larger than memory.

<style>
  .hash-join-lab {
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
  .hash-join-lab__controls {
    display: grid;
    gap: 0.8rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
    margin-bottom: 1rem;
  }
  .hash-join-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
    line-height: 1.25;
  }
  .hash-join-lab input,
  .hash-join-lab select {
    accent-color: #0f766e;
    width: 100%;
  }
  .hash-join-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }
  .hash-join-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }
  .hash-join-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0.85rem 0 0.95rem;
  }
  .hash-join-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }
  .hash-join-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0;
    line-height: 1.2;
    text-transform: uppercase;
  }
  .hash-join-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    margin-top: 0.28rem;
    overflow-wrap: anywhere;
  }
  .hash-join-lab__metric--good strong {
    color: #0f766e;
  }
  .hash-join-lab__metric--warn strong {
    color: #b45309;
  }
  .hash-join-lab__metric--bad strong {
    color: #be123c;
  }
  .hash-join-lab canvas {
    aspect-ratio: 940 / 650;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .hash-join-lab__legend {
    align-items: center;
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.78rem;
    font-weight: 800;
    gap: 0.8rem;
    margin-top: 0.75rem;
  }
  .hash-join-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }
  .hash-join-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }
  .hash-join-lab__note {
    color: #5d6872;
    font-size: 0.88rem;
    margin: 0.75rem 0 0;
  }
</style>

<div class="hash-join-lab" data-hash-join-lab>
  <div class="hash-join-lab__controls">
    <label>
      Key profile
      <select data-param="profile" aria-label="Key distribution profile">
        <option value="zipf" selected>Long-tail keys</option>
        <option value="uniform">Uniform keys</option>
        <option value="hot">Single hot key</option>
        <option value="burst">Two-cluster skew</option>
      </select>
    </label>
    <label>
      Build rows <output data-value="buildRows">240,000</output>
      <input type="range" data-param="buildRows" min="20000" max="800000" step="10000" value="240000" aria-label="Build side rows">
    </label>
    <label>
      Probe rows <output data-value="probeRows">620,000</output>
      <input type="range" data-param="probeRows" min="20000" max="1600000" step="20000" value="620000" aria-label="Probe side rows">
    </label>
    <label>
      Distinct keys <output data-value="keys">12,000</output>
      <input type="range" data-param="keys" min="256" max="65536" step="256" value="12000" aria-label="Number of distinct join keys">
    </label>
    <label>
      Memory rows <output data-value="memoryRows">42,000</output>
      <input type="range" data-param="memoryRows" min="4000" max="240000" step="2000" value="42000" aria-label="Build rows that fit in memory">
    </label>
    <label>
      Skew exponent <output data-value="skew">0.95</output>
      <input type="range" data-param="skew" min="0" max="180" step="5" value="95" aria-label="Distribution skew">
    </label>
    <label>
      Seed <output data-value="seed">29</output>
      <input type="range" data-param="seed" min="1" max="9999" step="1" value="29" aria-label="Random seed">
    </label>
  </div>
  <div class="hash-join-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="650" aria-label="Hash join spill lab showing build-side batches, executor batch growth, temporary I/O, and top skewed keys"></canvas>
  <div class="hash-join-lab__legend">
    <span><i style="background:#0f766e"></i>Build rows</span>
    <span><i style="background:#2563eb"></i>Probe rows / GRACE comparison</span>
    <span><i style="background:#b45309"></i>Memory or write/read boundary</span>
    <span><i style="background:#be123c"></i>Overflow</span>
    <span><i style="background:#7c3aed"></i>Batch growth</span>
  </div>
  <p class="hash-join-lab__note" data-note>
    Long-tail keys: 240,000 build rows, 620,000 probe rows, memory for 42,000
    build rows. The planner-sized 8 batches become 16; all build batches fit.
  </p>
</div>

<script defer src="{{ '/assets/js/hash-join-spill-lab.js?v=20260618b' | relative_url }}"></script>

## The Default Run

The default run has:

- `240,000` build rows;
- `620,000` probe rows;
- `12,000` distinct keys;
- memory for `42,000` build rows;
- a long-tail key distribution with skew exponent `0.95`.

The initial estimate is:

$$
\left\lceil {240000\over 42000} \right\rceil = 6
$$

rounded up to `8` power-of-two batches. Under the actual key distribution, one
of those batches is too large, so the executor model doubles to `16` batches.
The largest build batch then has `35,434` rows, below the `42,000` row memory
budget.

The hybrid spill ledger reports:

| Quantity | Value |
| --- | ---: |
| Original batches | `8` |
| Actual batches | `16` |
| Largest build batch | `35,434` rows |
| Build rows kept in resident batch 0 | `11,523` |
| Temporary rows written plus read | `1,638,784` |
| Top build key | `14,233` rows |
| Estimated output pairs | `1.05B` |

The last number is a separate warning. A spill strategy controls memory. It
does not make a high-multiplicity join small. If many build and probe tuples
share a key, the output can still be enormous.

The exported audit grid is reproducible from Node:

```js
const lab = require("./assets/js/hash-join-spill-lab.js");

const audit = lab.auditGrid();
const failed = audit.cases.filter((row) => !row.passed);
if (failed.length || audit.passed !== audit.total) {
  throw new Error(JSON.stringify({
    failed,
    passed: audit.passed,
    total: audit.total
  }, null, 2));
}

console.table(audit.cases.map((row) => ({
  profile: row.profile,
  batches: `${row.originalBatches}->${row.actualBatches}`,
  fits: row.fits,
  maxBuildBatch: row.maxBuildBatchRows,
  memoryRows: row.memoryRows,
  tempRows: row.hybridTempRows,
  topKeyRows: row.topBuildKeyRows
})));
```

The `hot` row is allowed to fail the fit test only because the audit also
requires a skew explanation. A spill plan that silently overflows memory is not
a valid plan.

## The Spill Invariant

Let the partition function be:

$$
b(k)=h(k) \bmod B.
$$

For each batch `i`, define:

$$
R_i = \{r \in R : b(r.key)=i\}
$$

and

$$
S_i = \{s \in S : b(s.key)=i\}.
$$

If `r.key = s.key`, then `b(r.key) = b(s.key)`. Therefore every true join pair
appears inside exactly one corresponding pair `(R_i, S_i)`. No valid pair is
lost by processing one batch at a time.

This is why the probe side must be spilled too. It is not enough to save the
build partitions. The executor also needs the matching probe tuples waiting in
the same batch files, or it would have to rescan the entire probe input for
every build batch.

The simplified temporary I/O cost for a GRACE-style partitioned hash join is
roughly:

$$
2(|R|+|S|)
$$

temporary rows: write both inputs into partitions, then read them back. A hybrid
hash join saves the resident batch. In the default lab run, batch `0` keeps
`11,523` build rows and its corresponding `29,085` probe rows out of temporary
files, so the hybrid ledger is smaller than the all-partitioned ledger.

## When Batches Explode

PostgreSQL's executor comments describe the modern dynamic version: if the inner
side does not fit, hash join can run in multiple batches; if the real hash table
grows too large, the executor increases the number of batches, always by powers
of two.[^pg-source]

That power-of-two detail is not cosmetic. It lets the executor add one more hash
bit to split every old batch into two possible new batches:

```text
old batch: h(key) & 0b0111
new batch: h(key) & 0b1111
```

Uniform data responds nicely. Long-tail data responds imperfectly. A single
heavy key does not respond at all, because all rows with that key must stay in
the same batch. PostgreSQL's source comments call out this kind of best-effort
edge: if doubling leaves a batch with all or none of its tuples, growth can be
disabled globally, and later oversized batches may exceed the nominal budget.[^pg-source]

In the lab, switch **Key profile** to `Single hot key` and raise **Skew exponent**.
The top-key panel eventually turns red: one key alone is larger than memory.
No partition hash on the join key can split that key while preserving the join
invariant.

Real engines have more choices than this toy:

- skew optimization for most-common values;
- recursive partitioning;
- bloom filters or semijoins to reduce one side before spilling;
- switching join algorithms;
- increasing memory for this operator;
- parallel work sharing;
- pushing predicates earlier;
- changing the query shape so the build side is genuinely smaller.

The invariant remains the same. If a batch is too large because many distinct
keys landed there, more hash bits can help. If a batch is too large because one
key is too large, batch count is the wrong lever.

## Reading The Plan

For a production PostgreSQL plan, I would read a hash join spill with four
questions:

1. Is `Batches` greater than `1`?
2. Did actual batches exceed original batches?
3. Is the build-side row estimate or width estimate badly wrong?
4. Is the join key skewed enough that more batches cannot divide the problem?

The first question says whether the spillway opened. The second says whether
the executor had to resize the spillway while running. The third asks whether
the optimizer walked into the wrong memory budget. The fourth asks whether the
data distribution violated the uniform partition fantasy.

That last phrase is the quiet contract behind hash join:

```text
partitioning is a memory theorem only if the partitions become small enough
```

Hash join is fast because equality makes a partition proof possible. It is
fragile because the proof says where matches go, not how evenly the data will
arrive.

## Sources

[^shapiro]: Leonard D. Shapiro, ["Join Processing in Database Systems with Large Main Memories"](https://cs-people.bu.edu/mathan/reading-groups/papers-classics/join.pdf), *ACM Transactions on Database Systems* 11(3), 239-264, 1986. Shapiro presents simple, GRACE, and hybrid hash joins, with partitioning as the shared mechanism, and discusses partition overflow.

[^pg-explain]: PostgreSQL documentation, ["14.1. Using EXPLAIN"](https://www.postgresql.org/docs/current/using-explain.html). The docs state that hash nodes show buckets, batches, and peak hash memory; if batches exceed one, disk usage is involved even if that disk amount is not displayed.

[^pg-memory]: PostgreSQL documentation, ["19.4. Resource Consumption"](https://www.postgresql.org/docs/current/runtime-config-resource.html). The docs describe `work_mem`, `hash_mem_multiplier`, and the fact that hash-based operations use the product as their memory limit.

[^pg-source]: PostgreSQL source comments, [`nodeHashjoin.c`](https://doxygen.postgresql.org/nodeHashjoin_8c_source.html), lines 26-56 in the generated source view. The comments describe multi-batch hash join, executor batch growth, power-of-two batch doubling, and the skew case where growth can be disabled.
