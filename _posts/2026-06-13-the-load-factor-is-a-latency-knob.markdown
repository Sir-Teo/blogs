---
layout: post
title: "The Load Factor Is a Latency Knob"
description: "Open-addressed hash tables do not merely get fuller. Their probe distributions change shape."
date: 2026-06-13 20:59:00 -0400
categories: computer-science
tags: [hash-tables, linear-probing, robin-hood-hashing, performance, data-structures, software-engineering]
excerpt: "A hash table's load factor is not just a memory-efficiency number. In open addressing, it is a tail-latency control."
---

A hash table is usually introduced as a miracle of average-case thinking.

Hash the key. Jump to a slot. If the slot is occupied, do a little extra work.
Expected constant time. Move on.

That story is true enough to use hash tables everywhere, and false enough to
hide the interesting part.

In an open-addressed table, the entries live directly inside the array. A
collision is not sent to a linked list. It becomes a walk through nearby slots.
That walk is called a probe sequence. The table's memory efficiency, cache
behavior, deletion policy, hash quality, and tail latency are all hiding inside
that sequence.

The load factor is not just a memory knob.

It is a latency knob.

## Why Linear Probing Is So Tempting

Linear probing is almost rudely simple. If a key hashes to slot `h`, try

```text
h, h + 1, h + 2, h + 3, ...
```

wrapping around the table as needed.

This is attractive because computers like contiguous memory. A probe sequence
that walks forward through an array often costs fewer cache misses than a
beautifully balanced pointer structure. This is one reason linear probing keeps
returning in high-performance hash tables even though the analysis has been
known for decades.

But locality has a price: collisions create runs.

Once a run of occupied slots exists, any key that hashes into the run walks to
the end. That extends the run. Worse, an insertion can connect two nearby runs
into one longer run. Bender, Kuszmaul, and Kuszmaul describe this as the real
source of primary clustering: not merely "winner keeps winning," but runs
globbing together.[^graveyard]

At load factor

$$
\alpha = 1 - \frac{1}{x},
$$

the intuitive cost scale is `Theta(x)`: only a `1/x` fraction of slots are empty,
so perhaps we need around `x` probes to find one. Classical linear probing does
worse. Primary clustering makes high-load insertions scale like `Theta(x^2)` in
the insertion-only analysis.[^graveyard]

This is why a table can feel great at 60%, fine at 75%, alarming at 88%, and
catastrophic after one unlucky workload pushes it a little further.

There was no type error. The distribution changed shape.

## Robin Hood Does Not Remove Fullness

Robin Hood hashing changes the collision rule.

When an incoming key collides with a resident key, compare how far each key is
from its home slot. If the incoming key has traveled farther, it steals the slot
and pushes the resident forward. The older probe sequence gets priority over the
younger one.

In the usual slogan:

```text
steal from the rich, give to the poor
```

Here "poor" means far from home.

Celis, Larson, and Munro introduced Robin Hood hashing in the 1980s.[^celis]
The key idea is not that it creates more empty slots. It does not. It changes
the distribution of successful lookup costs by equalizing probe distances. Later
analysis and simulations emphasized the unusually small variance of Robin Hood
search costs.[^poblete]

That distinction matters:

```text
Robin Hood reduces hit variance.
It does not make misses cheap when the table has long occupied runs.
```

A failed lookup still has to walk until it sees an empty slot. If tombstones or
high load leave few empty slots, the miss tail can still be ugly.

## A Probe Lab

The lab below builds the same 256-slot open-addressed table twice:

1. ordinary first-come-first-served linear probing;
2. Robin Hood linear probing.

It then measures successful lookup probes for live keys, unsuccessful lookup
probes for absent keys, run lengths, and tombstone effects. The hash stream is
deterministic so changes come from the knobs, not from animation noise.

This is not a benchmark of any production implementation. It is a microscope for
the shape of probe distributions.

<style>
  .hash-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .hash-lab__controls {
    display: grid;
    gap: 0.9rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(178px, 1fr));
  }

  .hash-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .hash-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .hash-lab__controls input {
    accent-color: #2563eb;
    width: 100%;
  }

  .hash-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .hash-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .hash-lab__metric span,
  .hash-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .hash-lab__metric span {
    display: block;
  }

  .hash-lab__metric strong {
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .hash-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .hash-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="hash-probe-lab" class="hash-lab" data-hash-lab>
  <div class="hash-lab__controls">
    <label>
      Live load: <output data-value="liveLoad">82%</output>
      <input type="range" min="40" max="92" step="1" value="82" data-param="liveLoad">
    </label>
    <label>
      Tombstone slots: <output data-value="tombstones">0%</output>
      <input type="range" min="0" max="36" step="1" value="0" data-param="tombstones">
    </label>
    <label>
      Hot-hash skew: <output data-value="skew">0%</output>
      <input type="range" min="0" max="70" step="5" value="0" data-param="skew">
    </label>
    <label>
      Hash seed: <output data-value="seed">17</output>
      <input type="range" min="1" max="99" step="1" value="17" data-param="seed">
    </label>
  </div>
  <div class="hash-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Open-addressed hash table simulator comparing linear probing and Robin Hood probing under load, tombstones, and hash skew"></canvas>
  <p class="hash-lab__note">
    Deterministic 256-slot open-addressing toy. Probe counts include the first
    slot inspected. Tombstones do not stop lookup probes. The point is not exact
    production throughput; it is the shape of the hit and miss tails.
  </p>
</div>
<script defer src="{{ '/assets/js/hash-probe-lab.js?v=20260613a' | relative_url }}"></script>

At the default setting, the table is about 82% live:

```text
linear hit p95      = 33 probes
Robin Hood hit p95  = 14 probes
miss p95            = 80 probes
```

Robin Hood has not made the table less full. The miss tail is still governed by
occupied runs. What it has done is redistribute pain among successful lookups.
Some keys that were very far from home get pulled closer; some lucky keys get
pushed a little farther away. The average is less interesting than the variance.

Raise **Live load**. The p95 curves do not rise politely. They bend. There are
fewer empty slots to terminate misses, and long runs become easier to create.

Raise **Tombstone slots**. The live load can look moderate while the probe load
is high:

$$
\text{probe load} =
\frac{\text{live slots} + \text{deleted slots}}{\text{table slots}}.
$$

A tombstone is not a live key, but it is also not an empty slot. A lookup cannot
stop there, because the searched-for key might have been displaced beyond it.
This is why deletion policy belongs in the performance model.

Raise **Hot-hash skew**. A table can be only 72% live and still have terrible
probe tails if too many keys start in the same neighborhood. "Expected constant
time" is not a substitute for a hash function that spreads entropy where the
table uses it.

Change **Hash seed**. At small table sizes, the exact run layout is noisy. That
is not a defect in the demo; it is a warning. If a service keeps one large table
for a long time, it experiences one realized probe landscape, not the average
over all possible landscapes.

## Deleted Is Not Empty

Deletion is the part of open addressing that people learn, implement, and then
quietly regret.

If a key is removed by simply clearing its slot, a later lookup may stop too
early. Some other key might have collided, walked past that slot, and landed
farther along the same run. The usual simple fix is a tombstone: mark the slot
deleted. Insertions may reuse it, but lookups must keep probing.

Modern production tables build a lot of engineering around exactly this
distinction. Abseil's SwissTable design stores one byte of metadata per slot,
including whether a slot is empty, deleted, or full, plus seven hash bits used
to cheaply screen candidate matches.[^swiss] Its lookup notes the crucial rule:
deleted slots do not stop probing; empty slots do.

SwissTable also shows why "number of probes" is not identical to wall-clock
time. Metadata can be scanned in groups with SIMD instructions, so a long probe
sequence may be cheaper than a naive key-by-key walk. But metadata changes the
constant; it does not repeal the distribution. If the table creates long runs,
the implementation still has to scan through them.

The recent graveyard-hashing work makes the tombstone story stranger. Bender,
Kuszmaul, and Kuszmaul show that, if managed correctly, tombstones can create an
anti-clustering effect rather than merely degrading performance.[^graveyard]
That result is valuable partly because it breaks a lazy rule of thumb. Deleted
markers are not automatically good or bad. Their placement policy changes the
combinatorics of future probes.

The toy lab above uses ordinary tombstones, not graveyard hashing. It is meant
to show the operational problem:

```text
live load is not the whole load seen by lookup
```

## What Robin Hood Buys

Robin Hood hashing buys fairness of displacement.

In ordinary linear probing, early luck compounds. A key that lands at home may
stay at home, while later keys that collide into the same run get pushed farther
and farther away. Robin Hood interrupts that compounding. If the incoming key is
already farther from home than the resident, the incoming key takes the slot.

This makes successful lookup costs more predictable.

That is useful when hits dominate. Think symbol tables, intern maps, compiler
passes, routing tables, caches, and model-serving dictionaries where most
lookups are expected to succeed. Reducing p95 successful probes can matter more
than shaving a tiny amount off the average.

But there is a boundary to the magic. A negative lookup asks:

```text
when do I first see an empty slot?
```

Robin Hood does not create more empty slots. At the same live load with the same
set of occupied positions, the miss story is mostly a run-length story. This is
why the lab's gray miss curve can remain high even when the violet successful
lookup curve is much better than the blue one.

That separation is the practical lesson:

- hit-heavy workload: probe-age variance is a first-class metric;
- miss-heavy workload: empty-slot spacing and tombstone policy are first-class
  metrics;
- update-heavy workload: insertion and deletion policy decide the future table,
  not only the current one.

## The Benchmark You Actually Want

A useful hash-table benchmark should not report only throughput at one load
factor.

It should report:

1. hit and miss distributions separately;
2. p50, p95, p99, and maximum probes;
3. live load and probe load;
4. deletion rate and tombstone policy;
5. rehash policy and pause behavior;
6. key-comparison cost;
7. hash cost and hash quality;
8. payload size and cache footprint;
9. whether the workload has temporal locality;
10. whether adversarial or low-entropy keys are plausible.

The right table for a compiler's string interner may not be the right table for
a database join, a network cache, a routing policy, or an API gateway's
deduplication set. The first may be hit-heavy and batch-built. The second may be
miss-heavy. The third may churn. The fourth may face hostile keys.

The phrase "O(1)" is too small for all of that.

## The Rule I Trust

I do not trust a hash table because it has a low average probe count.

I trust it when I know what happens to the tail as load, deletion, key quality,
and miss rate move in the direction production will eventually push them.

The invariant I want in an engineering review is:

```text
load factor is budgeted against latency, not just memory
```

If the table is allowed to become denser, there should be a reason. If
tombstones are allowed to accumulate, there should be a rehash or reclamation
story. If misses are common, they deserve their own graph. If Robin Hood is used,
the claim should be about successful lookup variance, not generic magic.

A hash table is not a constant-time box.

It is a probe distribution with an API.

[^graveyard]: Michael A. Bender, Bradley C. Kuszmaul, and William Kuszmaul, ["Linear Probing Revisited: Tombstones Mark the Death of Primary Clustering"](https://arxiv.org/abs/2107.01250), arXiv 2021.

[^celis]: Pedro Celis, Per-Ake Larson, and J. Ian Munro, ["Robin Hood Hashing"](https://cs.uwaterloo.ca/research/tr/1986/CS-86-14.pdf), University of Waterloo technical report CS-86-14, 1986.

[^poblete]: Patricio V. Poblete and Alfredo Viola, ["Robin Hood Hashing really has constant average search cost and variance in full tables"](https://aofa.tcs.uj.edu.pl/presentations/05-07-2016-poblete.pdf), AofA 2016 presentation.

[^swiss]: Abseil, ["Swiss Tables Design Notes"](https://abseil.io/about/design/swisstables), especially the metadata and lookup sections describing empty, deleted, and full metadata states.
