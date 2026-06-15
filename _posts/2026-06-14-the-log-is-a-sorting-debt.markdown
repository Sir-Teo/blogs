---
layout: post
title: "Memtables Borrow From Tomorrow"
description: "An LSM tree makes writes cheap by turning random updates into sorted runs. Compaction is where the sorting loan comes due."
date: 2026-06-14 09:08:00 -0400
categories: software-engineering
tags: [lsm-tree, compaction, storage-engines, databases, rocksdb, leveldb, systems]
excerpt: "A memtable is a small loan from the future. It lets writes land quickly, then compaction pays the sorting bill by merging immutable runs."
---

The seductive version of an LSM tree is:

```text
writes are sequential
reads use sorted tables
background compaction cleans everything up
```

That is true enough to be useful and false enough to be dangerous.

The better version is:

```text
the write path borrows sorting work from the future
compaction decides who pays it back
```

An LSM tree does not remove the cost of maintaining an ordered key-value index.
It changes the payment schedule. New writes first land in memory. When the
memory component fills, it is flushed as an immutable sorted run. Later,
background merge jobs combine runs, discard overwritten versions, move
tombstones, and restore a shape that reads can tolerate.

This is why LSM tuning feels like moving pressure around a sealed room. Lower
write amplification and reads may touch more runs. Lower read amplification and
compaction rewrites more data. Lower space amplification and deletes or
overwrites must be cleaned aggressively. The three costs are not independent
knobs. They are the same sorting debt accounted in different columns.

## The Old Bargain Was Physical

O'Neil, Cheng, Gawlick, and O'Neil introduced the LSM-tree as a disk-based data
structure for files with high rates of inserts and deletes.[^lsm] Their central
move was to keep a small memory-resident component and cascade batches of
changes into larger disk-resident components through merge-sort-like work.

The original motivation was physical. Random disk updates are expensive. A
B-tree maintains a tidy index by updating pages in place, which can be excellent
for point lookups but painful under sustained random write traffic. The LSM
tree says: do not immediately force every update to find its final page. Buffer
updates, sort them, and merge them in batches.

Bigtable made the pattern operational at large scale: recent updates live in a
memtable, persistent state is stored in immutable SSTables, and compactions
rewrite SSTables into better-organized files.[^bigtable] LevelDB's
implementation notes describe the same family of mechanics in a compact form:
memtables, immutable tables, levels, and compactions that pick files from one
level plus overlapping files in the next.[^leveldb]

The important word is **immutable**.

An immutable sorted run is friendly to sequential writes, compression, caching,
checksums, and simple crash recovery. It is also an admission that new
information does not edit the old run in place. If key `k` is updated five
times, five versions may exist across the structure until compaction proves
which versions can be forgotten.

Compaction is the forgetting machine.

## A Ledger for the Sorting Loan

The lab below simulates a deliberately simplified LSM tree. It is not RocksDB,
LevelDB, Cassandra, Pebble, or Bigtable. It ignores block caches, file sizes,
prefix filters, snapshots, range tombstones, WAL cost, compression, concurrent
compactions, device bandwidth, and many production details.

What it does model is the core ledger:

1. writes accumulate in a memtable;
2. a full memtable flushes into an immutable sorted run;
3. compaction policies merge runs and keep only the latest version of each key;
4. the final physical layout is measured for write, read, and space
   amplification.

The three policies are:

- **none**: flush only, no compaction;
- **tiered**: merge several similarly aged runs into a larger run;
- **leveled**: keep lower levels compact by merging them into the next level.

RocksDB's documentation frames a similar tradeoff: universal compaction targets
lower write amplification while accepting higher read and space amplification,
whereas leveled compaction usually spends more write work to control read and
space behavior.[^rocks-universal][^rocks-leveled]

<style>
  .lsm-lab {
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

  .lsm-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .lsm-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .lsm-lab__controls input,
  .lsm-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .lsm-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .lsm-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .lsm-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .lsm-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .lsm-lab__metric span,
  .lsm-lab__legend,
  .lsm-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .lsm-lab__metric span {
    display: block;
  }

  .lsm-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .lsm-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 700px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .lsm-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .lsm-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .lsm-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .lsm-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .lsm-lab {
      padding: 0.82rem;
    }

    .lsm-lab__controls,
    .lsm-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .lsm-lab canvas {
      height: 1060px;
    }
  }
</style>

<div class="lsm-lab" data-lsm-compaction-lab>
  <div class="lsm-lab__controls">
    <label>
      Policy
      <select data-param="policy">
        <option value="leveled" selected>leveled</option>
        <option value="tiered">tiered</option>
        <option value="none">none</option>
      </select>
    </label>
    <label>
      Workload
      <select data-param="workload">
        <option value="hot" selected>hot updates</option>
        <option value="uniform">uniform keys</option>
        <option value="append">append-only</option>
      </select>
    </label>
    <label>
      Operations <output data-value="operations">1600</output>
      <input type="range" min="300" max="4000" step="100" value="1600" data-param="operations">
    </label>
    <label>
      Memtable keys <output data-value="memtable">48</output>
      <input type="range" min="16" max="128" step="4" value="48" data-param="memtable">
    </label>
    <label>
      Size ratio <output data-value="ratio">4</output>
      <input type="range" min="2" max="8" step="1" value="4" data-param="ratio">
    </label>
    <label>
      Key space <output data-value="keyspace">384</output>
      <input type="range" min="64" max="1024" step="32" value="384" data-param="keyspace">
    </label>
    <label>
      Hot skew <output data-value="skew">72%</output>
      <input type="range" min="0" max="95" step="1" value="72" data-param="skew">
    </label>
    <label>
      Delete rate <output data-value="deleteRate">6%</output>
      <input type="range" min="0" max="35" step="1" value="6" data-param="deleteRate">
    </label>
    <label>
      Seed <output data-value="seed">37</output>
      <input type="range" min="1" max="999" step="1" value="37" data-param="seed">
    </label>
  </div>
  <div class="lsm-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="LSM tree compaction simulator showing physical levels, write amplification, read checks, space amplification, and compaction events"></canvas>
  <div class="lsm-lab__legend">
    <span><i style="background:#0f766e"></i> Memtable and live data</span>
    <span><i style="background:#2563eb"></i> Level 0 runs</span>
    <span><i style="background:#7c3aed"></i> Leveled runs</span>
    <span><i style="background:#d97706"></i> Tiered compaction</span>
    <span><i style="background:#be123c"></i> Obsolete versions</span>
  </div>
  <p class="lsm-lab__note">
    Deterministic toy model. Write amplification excludes the write-ahead log
    and compression; point checks estimate sorted-run probes, not full device
    latency.
  </p>
</div>
<script defer src="{{ '/assets/js/lsm-compaction-lab.js?v=20260614a' | relative_url }}"></script>

Try five moves.

First, set **Policy** to `none`. Writes look wonderfully cheap: in the default
hot workload the run write amplification is only about 0.55x because repeated
updates collapse in the memtable before flush. Then look at point checks and
obsolete share. The system did not get free storage. It left 19 runs, about
8.04 point checks, 3.39x space amplification, and 604 obsolete entries for
future reads and future compaction to deal with.

Second, switch to `tiered`. In this toy, the default hot workload lands at about
0.98x run write amplification, 2.99 point checks, 1.41x space amplification,
and four runs. Do not read that as a universal win over leveled compaction. It
is the toy workload and the toy policy telling you that update locality and
whole-run merges can dominate the headline labels.

Third, switch to `leveled`. The lab's leveled policy is intentionally coarse:
it merges whole levels rather than doing RocksDB-style partial file picking.
Even so, the shape is visible. The default run does three compactions, leaves
five runs, reports about 3.62 point checks, and keeps space amplification near
1.56x. Compared with no compaction, the debt has clearly moved. Compared with
tiered in this toy, the answer is more interesting than the label.

Fourth, choose **append-only**. Obsolete versions nearly disappear. The sorting
debt becomes easier because old keys are not being rewritten. Many production
engines exploit this with trivial moves or key-range-aware compactions.

Fifth, raise **Delete rate** under a hot workload. Tombstones are promises to
forget later. Until compaction can safely drop them, they occupy space and stop
reads. A delete is not merely the absence of a value; in an LSM tree it is a
piece of evidence.

## Every Run Is Sorted; the Database Is Not

Every immutable run is individually sorted. The whole database is not.

That sentence is the source of most LSM behavior.

If a key has been updated repeatedly, the newest version may be in the
memtable, a level-0 file, or a lower-level run. Reads must find the newest
visible version. Bloom filters, indexes, file metadata, and caches make this
much cheaper than scanning every byte, but the number and overlap of runs still
matter.

Compaction buys several things at once:

1. It merges sorted runs into fewer sorted runs.
2. It removes overwritten versions.
3. It carries tombstones downward until old values can be hidden or discarded.
4. It restores level invariants that make future reads predictable.
5. It converts many small sequential writes into fewer large sequential rewrites.

The cost is also several things at once:

1. It reads old data.
2. It writes surviving data again.
3. It competes with foreground reads and writes for CPU, cache, and I/O.
4. It can create latency spikes if the debt is paid in bursts.

This is why production systems do not merely ask "is compaction enabled?"
They ask which files, how much overlap, how many levels, what size ratio, how
many background jobs, what tombstone rules, what snapshot horizon, and what
write-stall policy.

The shape of the compaction policy is the shape of the database.

## There Is No Free Corner

Tiered compaction waits until it has several comparable runs, then merges them.
It tends to reduce write amplification because data is not repeatedly forced
through tightly maintained levels. The price is that point lookups may need to
consult more runs, and duplicate versions may persist longer.

Leveled compaction tries to maintain tighter level structure. In LevelDB, a
compaction picks a file from level `L` and overlapping files from level `L+1`,
then produces output files in the next level.[^leveldb] This controls overlap
and lookup work, but surviving data can be rewritten multiple times as it moves
down the levels.

RocksDB exposes this as an explicit engineering choice. Universal compaction is
documented as targeting use cases that need lower write amplification while
trading off read and space amplification. Leveled compaction is the more common
default when predictable reads and bounded space matter.[^rocks-universal][^rocks-leveled]

There is no universally best point on this triangle, and the toy above is a
useful warning against treating policy names as outcomes.

An ingest pipeline may accept high read amplification during bulk loading, then
compact later. A latency-sensitive read service may spend more write bandwidth
to keep the run count small. A database with large values may separate keys
from values, as WiscKey does, so compaction need not repeatedly move full
values while sorting keys.[^wisckey]

That last example is a useful reminder: "LSM tree" is not one design. It is a
family of designs organized around deferred, batched merging.

## Workload Shape Changes the Bill

The lab's **hot updates** workload makes one important point: update locality
changes the bill.

If the same small set of keys is updated many times before flush, the memtable
can collapse several user operations into one flushed entry. That can make the
run write amplification metric look surprisingly low. This is real in spirit,
but incomplete. A real system also writes a log for durability, and snapshots
may prevent old versions from being dropped immediately.

If keys are append-only, compaction has less obsolete data to remove. The system
is mostly organizing new ranges. If keys are uniform and repeatedly overwritten,
compaction becomes a version collector. If deletes are common, tombstones become
a second workload: they must be retained long enough to hide older values, then
dropped only when safe.

This is why benchmark results for LSM engines are so workload-sensitive.
The same configuration can look heroic under sequential ingest and miserable
under overwrite-heavy, delete-heavy, read-after-write traffic.

The data structure did not change. The debt schedule did.

## Ask What Debt You Are Moving

Before touching compaction flags, ask what debt you are trying to move.

```text
Are reads point-heavy, range-heavy, or mostly absent-key probes?
Are writes mostly inserts, overwrites, or deletes?
Do snapshots hold old versions open?
Are values large enough that moving them dominates key sorting?
Can ingest and serving happen in different phases?
Is the pain average throughput or tail latency?
```

The correct policy depends on those answers.

A read-heavy service cares about run count, overlap, Bloom-filter quality,
cache hit rate, and how often compaction invalidates useful cached blocks. A
write-heavy ingest system cares about flush rate, compaction bandwidth, write
stalls, and whether a low-priority cleanup job can catch up later. A
delete-heavy workload cares about tombstone horizons and when old data is
provably gone.

The anti-pattern is to treat compaction as janitorial work. It is not cleaning
up after the database. It is the database deciding when sorted order becomes
real.

## The Payment Plan

An LSM tree is not just a log, and it is not just a tree.

The log part makes new writes cheap by appending batches of sorted facts. The
tree part appears gradually, as compaction merges those facts into a searchable
shape. Between those moments, the database contains multiple partial truths:
new values, old values, tombstones, overlapping runs, and level invariants that
may or may not be paid up.

So the operational question is not:

```text
How do I make compaction cheap?
```

It is:

```text
Which bill am I willing to see, and when?
```

The log is a sorting debt. Compaction is the payment plan.

[^lsm]: Patrick O'Neil, Edward Cheng, Dieter Gawlick, and Elizabeth O'Neil, ["The Log-Structured Merge-Tree (LSM-Tree)"](https://dsf.berkeley.edu/cs286/papers/lsm-acta1996.pdf), *Acta Informatica*, 1996. A copy is also available from [UMass Boston](https://www.cs.umb.edu/~poneil/lsmtree.pdf).

[^bigtable]: Fay Chang et al., ["Bigtable: A Distributed Storage System for Structured Data"](https://research.google.com/archive/bigtable-osdi06.pdf), OSDI 2006.

[^leveldb]: Google LevelDB, ["Implementation notes"](https://github.com/google/leveldb/blob/main/doc/impl.md), especially the memtable, levels, and compaction sections.

[^rocks-universal]: RocksDB Wiki, ["Universal Compaction"](https://github.com/facebook/rocksdb/wiki/Universal-Compaction).

[^rocks-leveled]: RocksDB Wiki, ["Leveled Compaction"](https://github.com/facebook/rocksdb/wiki/Leveled-Compaction).

[^wisckey]: Lanyue Lu et al., ["WiscKey: Separating Keys from Values in SSD-Conscious Storage"](https://www.usenix.org/system/files/conference/fast16/fast16-papers-lu.pdf), FAST 2016.
