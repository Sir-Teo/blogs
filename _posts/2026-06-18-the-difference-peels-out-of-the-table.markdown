---
layout: post
title: "The Difference Peels Out of the Table"
description: "An invertible Bloom lookup table lets two large, similar sets subtract their summaries and recover only the keys that differ by peeling pure cells."
date: 2026-06-18 09:22:00 -0400
categories: data-systems
series: probabilistic-data-structures
tags: [iblt, invertible-bloom-lookup-tables, set-reconciliation, bloom-filters, graph-peeling, distributed-systems]
excerpt: "A Bloom filter can say maybe. An IBLT can sometimes list what it forgot: subtract two summaries, find pure cells, and peel out the symmetric difference."
---

A Bloom filter is a one-way kind of memory. It can answer:

```text
is this key possibly present?
```

It cannot answer:

```text
which keys are in you?
```

That second question sounds too much like asking a shadow to produce the object
that cast it. Most of the time, that is exactly right. A saturated Bloom filter
does not contain a recoverable list.

An invertible Bloom lookup table changes the bargain. It stores a small
algebraic receipt per cell: a count, an XOR of keys, and a checksum XOR. If a
cell is holding exactly one remaining key, the table can recognize that fact,
recover the key, delete it from its other cells, and possibly reveal more single
keys.

That makes the structure feel less like a membership filter and more like a
peelable puzzle.

The useful systems move is subtraction. If Alice and Bob hold two huge, mostly
equal sets, they can build compatible IBLTs, subtract the tables cell by cell,
and try to list only the symmetric difference. Shared keys cancel. The residue
is the part they need to exchange.

## The Problem Is Not Membership

Suppose two replicas each hold file-block IDs, calendar event IDs, routing
updates, or content-addressed chunks:

```text
Alice: many keys
Bob:   many keys
```

The expensive but simple reconciliation protocol is:

```text
exchange sorted lists, diff them
```

That spends bandwidth proportional to the total set sizes. A log can do better
when both sides share prior context, but logs have their own operational price:
they have to be maintained, retained, compacted, and interpreted correctly.

Eppstein, Goodrich, Uyeda, and Varghese framed the no-prior-context version
cleanly in their Difference Digest paper: compute the set difference in a single
round with communication proportional to the size of the difference, not the
size of the original sets.[^difference-digest]

That is the shape of the problem:

```text
large sets, small difference, no shared update log
```

An ordinary Bloom filter is the wrong tool for this particular job. It can help
one side guess which of its keys the other might have, but it still communicates
information shaped by the full set and it has false positives. Set
reconciliation needs a way for common keys to disappear.

## The Cell Receipt

In the key-only IBLT used by the lab, each cell stores:

```text
count    = signed number of mapped keys
keyXor   = XOR of mapped keys
hashXor  = XOR of checksum(key) for mapped keys
```

Each key maps to `k` cells. Insert updates every mapped cell:

```text
count   += 1
keyXor  ^= key
hashXor ^= checksum(key)
```

Deletion uses the same XOR updates and subtracts from the count:

```text
count   -= 1
keyXor  ^= key
hashXor ^= checksum(key)
```

Goodrich and Mitzenmacher's IBLT paper describes the general key-value version
with a count field, a key-sum field, and a value-sum field; it also notes that
XOR can replace sums in many settings to avoid overflow issues.[^iblt]

For reconciliation, Alice builds a table for her set. Bob builds a table with
the same size, hash functions, and checksum function. Then one side subtracts:

```text
diff.count   = alice.count - bob.count
diff.keyXor  = alice.keyXor ^ bob.keyXor
diff.hashXor = alice.hashXor ^ bob.hashXor
```

A shared key appears once in Alice's table and once in Bob's table. It maps to
the same cells. In the subtraction, its count contribution becomes zero and its
XOR contribution cancels.

Only disagreement remains.

## The Peel

A cell is *pure* when it looks like exactly one remaining key:

```text
abs(count) == 1
hashXor == checksum(keyXor)
```

If `count == 1`, the key belongs to Alice but not Bob. If `count == -1`, it
belongs to Bob but not Alice. After recording that key, the decoder removes it
from every cell it hashes to.

That deletion can expose new pure cells:

```text
find pure cell
recover key and side
delete that key from its k cells
repeat
```

This is not merely a convenient implementation. Goodrich and Mitzenmacher point
out that IBLT listing is the same peeling process used to find the 2-core of a
random hypergraph: cells are vertices, keys are hyperedges, and decoding stops
when every remaining vertex has degree at least two.[^iblt-core]

That gives the most important failure mode a concrete shape:

```text
no pure cells left, but nonempty cells remain
```

The table is not lying. It is stuck.

## The Lab

The lab below builds two full synthetic sets, inserts both into compatible IBLTs,
subtracts the tables, and runs the pure-cell peeling decoder. It also runs a
small deterministic capacity sweep so the failure cliff is visible.

The byte accounting is intentionally simple: each cell is treated as three
32-bit words, `count`, `keyXor`, and `hashXor`. Real systems choose wider
checksums, salts, encodings, and failure budgets.

<style>
  .iblt-lab {
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

  .iblt-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    margin-bottom: 1rem;
  }

  .iblt-lab label,
  .iblt-lab__metric span,
  .iblt-lab__legend,
  .iblt-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .iblt-lab label {
    display: grid;
    font-weight: 650;
    gap: 0.35rem;
    min-width: 0;
  }

  .iblt-lab input,
  .iblt-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .iblt-lab select {
    color: #172026;
  }

  .iblt-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .iblt-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    margin: 0.4rem 0 0.8rem;
  }

  .iblt-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .iblt-lab__metric--good {
    background: #ecfdf5;
    border-color: #bbf7d0;
  }

  .iblt-lab__metric--bad {
    background: #fff1f2;
    border-color: #fecdd3;
  }

  .iblt-lab__metric span {
    display: block;
  }

  .iblt-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .iblt-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .iblt-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .iblt-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .iblt-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .iblt-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 680px) {
    .iblt-lab {
      padding: 0.8rem;
    }

    .iblt-lab__controls,
    .iblt-lab__metrics {
      grid-template-columns: 1fr;
    }

    .iblt-lab canvas {
      height: 1120px;
    }
  }
</style>

<div class="iblt-lab" data-iblt-lab>
  <div class="iblt-lab__controls">
    <label>
      Scenario <output data-output="scenario">balanced edits</output>
      <select data-param="scenario" aria-label="Set reconciliation scenario">
        <option value="balanced" selected>balanced edits</option>
        <option value="alice">Alice has more</option>
        <option value="bob">Bob has more</option>
        <option value="split">partition burst</option>
      </select>
    </label>
    <label>
      Shared keys <output data-output="common">2,500</output>
      <input type="range" min="100" max="8000" step="100" value="2500" data-param="common" aria-label="Shared key count">
    </label>
    <label>
      Difference <output data-output="difference">84</output>
      <input type="range" min="6" max="360" step="6" value="84" data-param="difference" aria-label="Symmetric difference size">
    </label>
    <label>
      Cells per diff <output data-output="factor">2.20x</output>
      <input type="range" min="1.05" max="2.8" step="0.05" value="2.2" data-param="factor" aria-label="IBLT cells per difference key">
    </label>
    <label>
      Hashes <output data-output="hashes">3</output>
      <input type="range" min="3" max="6" step="1" value="3" data-param="hashes" aria-label="Hash functions per key">
    </label>
    <label>
      Seed <output data-output="seed">29</output>
      <input type="range" min="1" max="9999" step="1" value="29" data-param="seed" aria-label="Deterministic random seed">
    </label>
  </div>
  <div class="iblt-lab__metrics" data-metrics></div>
  <canvas data-canvas width="980" height="760" aria-label="IBLT reconciliation lab showing two sets, subtracted cells, peeling order, and capacity sweep"></canvas>
  <div class="iblt-lab__legend">
    <span><i style="background:#64748b"></i> shared keys</span>
    <span><i style="background:#2563eb"></i> Alice-only</span>
    <span><i style="background:#be123c"></i> Bob-only</span>
    <span><i style="background:#0f766e"></i> IBLT capacity</span>
    <span><i style="background:#b45309"></i> stuck residue</span>
  </div>
  <p class="iblt-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/iblt-reconciliation-lab.js?v=20260618c' | relative_url }}"></script>

The default run has `2,500` shared keys and `84` differing keys. The two full
lists would cost about `20.3 KB` under the lab's 32-bit key model; the IBLT
message costs about `2.2 KB` and decodes the exact difference.

The exported audit checks five deterministic scenarios. It verifies that:

- a shared set cancels to an empty subtracted table;
- decoded Alice-only and Bob-only keys match the exact generated difference;
- every peeled cell has a valid side, `+1` or `-1`;
- successful decodes leave no residual cells; and
- the subtracted table's nonempty cells are bounded by the number of difference
  keys times the hash count.

The compact reproduction check is:

```bash
node - <<'NODE'
const lab = require("./assets/js/iblt-reconciliation-lab.js");
const audit = lab.auditIBLTLab();
const failed = audit.cases.filter((row) => !row.passed);
if (failed.length || !audit.ok || audit.passed !== audit.total) {
  throw new Error(JSON.stringify({
    failed,
    passed: audit.passed,
    total: audit.total
  }, null, 2));
}

console.table(audit.cases.map((row) => ({
  scenario: row.scenario,
  diff: row.diffSize,
  cells: row.cells,
  hashes: row.hashes,
  factor: row.factor,
  initialPure: row.initialPure,
  peeled: row.peeled,
  residual: row.residual,
  messageKB: (row.bytesIblt / 1024).toFixed(1),
  listKB: (row.bytesLists / 1024).toFixed(1),
  passed: row.passed
})));
console.log(`${audit.passed}/${audit.total} scenarios passed`);
NODE
```

## Sizing Is the Algorithm

The lab's **Cells per diff** slider is the important one.

Push it down toward `1.05x`. Many runs stop with residual cells. The decoder is
not confused; it has reached a 2-core. Every remaining key is entangled with
other remaining keys, so no cell can testify alone.

Push it up. Pure cells appear, the peeling cascade starts, and the table lists
the whole difference.

Goodrich and Mitzenmacher give 2-core threshold constants for several hash
counts; for example, the table in their paper lists about `1.222` for `k = 3`,
`1.295` for `k = 4`, and `1.425` for `k = 5`.[^iblt-core] Those are asymptotic
thresholds under random-hypergraph assumptions, not a promise that a tiny
browser demo with a 32-bit checksum should run exactly at the constant. In
production, the sizing question belongs to a failure budget.

This is also why the number of hash locations is not monotone magic. Difference
Digest notes the tradeoff directly: too few hashes do not propagate enough
peeling information, while too many hashes can make it hard to find a pure cell
at the start; values like 3 or 4 work well in practice.[^difference-hashes]

## What This Toy Leaves Out

The lab assumes the difference size is known well enough to size the table.
Difference Digest adds a Strata Estimator for that missing first step, because an
IBLT that is too small may fail and an IBLT that is too large wastes
bandwidth.[^difference-digest]

The lab also uses a short checksum. Real deployments choose checksum widths so
that a false pure cell is negligible relative to the system's risk budget. They
also have to version the hash functions, salt them, serialize cell fields
unambiguously, and decide what to do about duplicate keys, value changes, and
malicious peers.

The conceptual invariant is still compact:

```text
common keys cancel
single remaining keys reveal themselves
revealed keys delete themselves
```

An IBLT is not a smaller list. It is a table that can sometimes turn a set
difference back into a list by finding enough places where only one key is left
standing.

[^difference-digest]: David Eppstein, Michael T. Goodrich, Frank Uyeda, and George Varghese, ["What's the Difference? Efficient Set Reconciliation without Prior Context"](https://conferences.sigcomm.org/sigcomm/2011/papers/sigcomm/p218.pdf), SIGCOMM 2011. The paper describes a Difference Digest for one-round set reconciliation with communication proportional to the set difference, adapts whole-IBF subtraction for reconciliation, and adds a Strata Estimator for difference-size estimation. Google Research also hosts the [publication summary](https://research.google/pubs/whats-the-difference-efficient-set-reconciliation-without-prior-context/).

[^iblt]: Michael T. Goodrich and Michael Mitzenmacher, ["Invertible Bloom Lookup Tables"](https://arxiv.org/abs/1101.2245), Allerton 2011 / arXiv version. The paper defines an IBLT as a Bloom-filter-like table for key-value pairs supporting insert, delete, lookup, and listing; the PDF describes the count, keySum, and valueSum fields and notes XOR variants for many settings.

[^iblt-core]: Goodrich and Mitzenmacher, ["Invertible Bloom Lookup Tables"](https://arxiv.org/pdf/1101.2245), Section 2.4. Their listing algorithm repeatedly removes cells of count 1, connects the process to the 2-core of a random hypergraph, and gives threshold constants for several hash counts.

[^difference-hashes]: Eppstein et al., ["What's the Difference?"](https://conferences.sigcomm.org/sigcomm/2011/papers/sigcomm/p218.pdf), Section 3. The paper discusses `hash_count`, checksum fields for purity checks, negative counts after subtraction, and reports that hash counts 3 or 4 work well in practice.
