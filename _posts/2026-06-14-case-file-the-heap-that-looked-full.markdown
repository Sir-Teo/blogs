---
layout: post
title: "Heap Case File: When Full Was a Lie"
description: "A memory leak is only one way a process gets fat. Fragmentation, size classes, phase changes, and per-thread caches can make the allocator's ledger diverge from the program's live data."
date: 2026-06-14 09:52:00 -0400
categories: software-engineering
tags: [memory-allocation, fragmentation, malloc, systems, performance, c, cpp]
excerpt: "When RSS is too high, the first suspect is a leak. Often the heap is telling a subtler story: live bytes, rounding waste, free holes, and private caches are different line items."
---

Incident report:

```text
process is too large
heap profiler says live objects are much smaller
the allocator insists nothing illegal happened
```

This is not rare. It is also not one bug.

The tempting word is "leak." A leak is clean: some object is still reachable by
the allocator even though the program has lost the right to use it. Find the
owner, cut the reference, watch the graph fall.

But many heap incidents are not leaks. They are accounting disagreements. The
application asks for one number of bytes. The allocator rounds, splits, caches,
coalesces, and maps pages in a different number of bytes. The operating system
sees yet another number. RSS is the invoice, not the explanation.

So this post is a small memory forensics lab. The question is not:

```text
is malloc fast?
```

The question is:

```text
where did the bytes go?
```

Wilson, Johnstone, Neely, and Boles gave the allocator literature a useful
warning label in their 1995 survey: random synthetic models can miss the
regularities of real programs, and allocator policy often matters more than the
low-level mechanism used to implement it.[^wilson-survey] Johnstone and Wilson
later showed a more optimistic side of the same point: on several real C and C++
programs, conventional allocators could exhibit near-zero fragmentation once
implementation overheads were accounted for.[^fragmentation-solved]

Those two claims are not contradictory. They say: do not diagnose a heap with a
folk theorem.

## Exhibit A: A Heap Ledger

The simulator below runs the same allocation/free trace through four simplified
allocators:

- **first fit**: scan from low addresses and use the first free block that fits;
- **best fit**: use the smallest free block that fits;
- **size classes**: round requests to allocator classes, then place by best fit;
- **private caches**: size classes plus one cached object per size class per
  thread, so a freed object may be quick to reuse by that thread but invisible
  to the central free list.

The private-cache row is a stress model, not a production allocator. It is there
to make one question visible: when one thread frees an object, who is allowed to
reuse that memory next?

<style>
  .heap-lab {
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

  .heap-lab__header {
    align-items: start;
    border-bottom: 1px solid #e3e9ef;
    display: grid;
    gap: 0.35rem 1rem;
    grid-template-columns: minmax(0, 1fr) auto;
    margin: -0.1rem 0 1rem;
    padding-bottom: 0.85rem;
  }

  .heap-lab__kicker,
  .heap-lab__header p,
  .heap-lab__controls label,
  .heap-lab__metric span,
  .heap-lab__legend,
  .heap-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .heap-lab__kicker {
    font-weight: 760;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .heap-lab__header strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1.15rem;
    line-height: 1.2;
    margin-top: 0.15rem;
  }

  .heap-lab__header p {
    margin: 0;
    max-width: 54ch;
  }

  .heap-lab__badge {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 999px;
    color: #172026;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 760;
    padding: 0.35rem 0.62rem;
    white-space: nowrap;
  }

  .heap-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .heap-lab__controls label {
    display: grid;
    font-weight: 650;
    gap: 0.35rem;
    min-width: 0;
  }

  .heap-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .heap-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .heap-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .heap-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .heap-lab__metric span {
    display: block;
  }

  .heap-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .heap-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 820px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .heap-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .heap-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .heap-lab__legend i {
    border: 1px solid #d7dee5;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .heap-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .heap-lab {
      padding: 0.82rem;
    }

    .heap-lab__header {
      grid-template-columns: 1fr;
    }

    .heap-lab__badge {
      justify-self: start;
    }

    .heap-lab__controls,
    .heap-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .heap-lab canvas {
      height: 1060px;
    }
  }
</style>

<div class="heap-lab" data-heap-fragmentation-lab>
  <div class="heap-lab__header">
    <div>
      <div class="heap-lab__kicker">Allocator forensics</div>
      <strong>Same trace, four ledgers</strong>
      <p>The canvas separates requested live bytes, rounding waste, free holes, and private cached slack. Nothing here moves an allocated object after the program receives a pointer.</p>
    </div>
    <div class="heap-lab__badge">synthetic trace</div>
  </div>

  <div class="heap-lab__controls">
    <label>
      Operations <output data-value="operations">1500</output>
      <input type="range" min="300" max="3200" step="50" value="1500" data-param="operations">
    </label>
    <label>
      Live set <output data-value="liveSet">100</output>
      <input type="range" min="40" max="360" step="10" value="100" data-param="liveSet">
    </label>
    <label>
      Phase shift <output data-value="phaseShift">80%</output>
      <input type="range" min="0" max="100" step="1" value="80" data-param="phaseShift">
    </label>
    <label>
      Small-object bias <output data-value="smallBias">45%</output>
      <input type="range" min="5" max="95" step="1" value="45" data-param="smallBias">
    </label>
    <label>
      Cross-thread frees <output data-value="handoff">65%</output>
      <input type="range" min="0" max="100" step="1" value="65" data-param="handoff">
    </label>
    <label>
      Threads <output data-value="threads">4</output>
      <input type="range" min="1" max="8" step="1" value="4" data-param="threads">
    </label>
    <label>
      Seed <output data-value="seed">39</output>
      <input type="range" min="1" max="999" step="1" value="39" data-param="seed">
    </label>
  </div>

  <div class="heap-lab__metrics" data-heap-metrics></div>
  <canvas aria-label="Heap fragmentation simulator comparing allocator policies"></canvas>
  <div class="heap-lab__legend">
    <span><i style="background:#0f766e"></i>live request</span>
    <span><i style="background:#d97706"></i>rounding waste</span>
    <span><i style="background:#e6edf4"></i>free hole</span>
    <span><i style="background:#7c3aed"></i>private cached slack</span>
  </div>
  <p class="heap-lab__note">This is a policy microscope, not an allocator benchmark. Real allocators have page runs, arenas, huge-object paths, decay, scavenging, metadata, locks, NUMA effects, and OS return policies.</p>
</div>

<script defer src="{{ '/assets/js/heap-fragmentation-lab.js?v=20260614a' | relative_url }}"></script>

On the default trace, the program has about `22.6 KiB` of live requested
payload at the final snapshot. Best fit has committed `28 KiB`, or about
`1.27x` the live bytes. First fit commits one extra page, `32 KiB`, even though
it has slightly less internal rounding waste. The size-class policy commits the
same number of pages as best fit but spends about `8.3%` of live payload on
rounding. The private-cache stressor commits `60 KiB`; about `26.7 KiB` sits in
per-thread cached blocks.

None of those numbers alone is "the fragmentation." Each is a different line
item.

## Suspect 1: The Allocator Cannot Move the Body

Conventional C and C++ heap allocators are boxed in by a simple promise: after
`malloc` returns a pointer, the allocator cannot later move the object and fix
all copies of that pointer. Wilson et al. make this explicit in their model of
general-purpose heap storage: the allocator knows sizes and free events, not the
types and pointer graph inside the blocks.[^wilson-survey]

That constraint is why fragmentation is not just "run compaction." A copying
garbage collector can move live objects because it controls or discovers the
references. A `malloc` implementation usually cannot. It must arrange the map
without moving the houses.

This turns allocation into a historical process. Two heaps can contain the same
live requests and still have different futures because the holes sit in
different places. A large object does not care that total free memory is large.
It cares whether a sufficiently large contiguous hole exists.

The lab's "largest best-fit hole" metric is a small reminder of that fact.
Free bytes are an inventory. The largest hole is a capability.

## Suspect 2: Rounding Is Not Always Waste

Size classes look suspicious because they create internal fragmentation on
purpose. Ask for 177 bytes and the allocator may hand you a 192-byte or
224-byte slot. That trailing space is real.

But the alternative is not free. Exact-size allocation can produce a zoo of tiny
remainders, harder free-list searches, poor locality, and expensive metadata
paths. Lea's dlmalloc is an old but still instructive engineering document
because it shows the allocator as a bundle of compromises: compatibility,
portability, space, time, tunability, locality, and error detection all pull in
different directions.[^lea]

jemalloc's 2006 design makes the size-class trade explicit. Evans describes
quantum-spaced classes for small allocations: more classes reduce average
internal fragmentation, while segregated runs and bitmaps try to keep packing
and lookup costs under control.[^jemalloc] The point is not that rounding is
good or bad. The point is that rounding buys a simpler reuse market.

In the default lab trace, the size-class policy has more internal waste than
best fit, but it does not commit more pages. Change the phase shift or seed and
the answer can move. That is exactly the allocator problem: mechanism only has
meaning under a workload.

## Suspect 3: A Free Is Not Necessarily Reusable

Single-threaded diagrams make `free(x)` look like a coin dropped back into one
jar. Multithreaded allocators have more jars.

Per-thread caches and arenas reduce synchronization and often improve locality.
They also introduce a question that a global heap never had to ask: if thread A
allocates an object and thread B frees it, is that memory immediately useful to
thread A's next allocation?

Berger, McKinley, Blumofe, and Wilson put this problem at the center of Hoard.
They call out producer-consumer patterns where memory consumption can grow
because freed memory is not available to the thread that later needs it, and
they design Hoard around per-processor heaps plus a global heap discipline that
bounds this blowup.[^hoard]

The private-cache row in the lab is a deliberately small version of that
pressure. It caches at most one block per size class per thread. Even that is
enough for visible slack when cross-thread frees are frequent. Set
`Cross-thread frees` to zero and the story changes; increase `Threads` and the
number of small private ledgers grows.

Modern allocators spend a lot of design effort making this trade livable.
jemalloc, for example, emphasizes fragmentation avoidance and scalable
concurrency, and its production story includes profiling and tuning hooks
because the allocator has to be observable at scale.[^meta-jemalloc]

## The Bad Autopsy

A bad heap autopsy reports one number:

```text
RSS is high
```

A better one separates at least five:

```text
requested live payload
allocated size after rounding
free bytes inside allocator spans
largest reusable hole or run
private or retained bytes not currently reusable by the caller that needs them
```

Then it asks when the peak occurred. Fragmentation at the final snapshot can be
uninteresting if the incident happened during a phase transition. Wilson et al.
argued that real programs have ramps, peaks, plateaus, phase behavior, and
ordering dependencies that simple random traces erase.[^wilson-survey] That is
why allocator evaluation by "random sizes, random lifetimes" can be worse than
uninformative. It can train your intuition on a workload your software never
runs.

The default lab trace includes a phase shift for this reason. Early allocations
are drawn from one size mix; later allocations drift toward another. Long-lived
objects from the first phase survive into the second. Those survivors are the
rocks in the river. The later allocations have to flow around them.

## What I Would Measure First

If I saw this in production, I would not start by changing allocators.

I would first ask for a ledger:

1. live requested bytes by allocation site;
2. live allocated bytes after allocator rounding;
3. mapped, committed, resident, and returned-to-OS bytes over time;
4. per-thread or per-arena retained bytes;
5. object lifetime histograms by size class;
6. the trace shape around the peak, not only the after-the-fire snapshot.

Only then would I choose a remedy. A real leak wants ownership work. Too much
internal waste may want different object layout or size-class-aware pooling. A
phase-change hole pattern may want lifetime segregation. Cross-thread retained
slack may want allocator tuning, cache flushing, fewer arenas, different handoff
patterns, or a workload-specific allocator.

The dangerous move is to collapse all of those into one word.

Fragmentation is not one substance. It is a ledger whose columns happen to add
up to memory you paid for.

[^wilson-survey]: Paul R. Wilson, Mark S. Johnstone, Michael Neely, and David Boles, ["Dynamic Storage Allocation: A Survey and Critical Review"](https://jyywiki.cn/OS/manuals/malloc-survey.pdf), International Workshop on Memory Management, 1995.

[^fragmentation-solved]: Mark S. Johnstone and Paul R. Wilson, ["The Memory Fragmentation Problem: Solved?"](https://www.cs.tufts.edu/~nr/cs257/archive/paul-wilson/fragmentation.pdf), 1998.

[^lea]: Doug Lea, ["A Memory Allocator"](https://www.cs.tufts.edu/~nr/cs257/archive/doug-lea/malloc.html), describing dlmalloc's goals and design tradeoffs.

[^jemalloc]: Jason Evans, ["A Scalable Concurrent malloc(3) Implementation for FreeBSD"](https://people.freebsd.org/~jasone/jemalloc/bsdcan2006/jemalloc.pdf), BSDCan 2006.

[^hoard]: Emery D. Berger, Kathryn S. McKinley, Robert D. Blumofe, and Paul R. Wilson, ["Hoard: A Scalable Memory Allocator for Multithreaded Applications"](https://www.cs.umass.edu/~emery/pubs/berger-asplos2000.pdf), ASPLOS 2000.

[^meta-jemalloc]: Jason Evans, ["Scalable memory allocation using jemalloc"](https://engineering.fb.com/2011/01/03/core-infra/scalable-memory-allocation-using-jemalloc/), Meta Engineering, 2011.
