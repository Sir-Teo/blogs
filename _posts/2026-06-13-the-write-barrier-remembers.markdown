---
layout: post
title: "Write Barriers Remember the Dangerous Edge"
description: "A garbage collector is a graph traversal racing a mutating graph. The write barrier is the little piece of memory that keeps the traversal true."
date: 2026-06-13 21:55:00 -0400
categories: software-engineering
tags: [garbage-collection, write-barriers, runtime-systems, memory-management, tri-color-marking, software-engineering]
excerpt: "Incremental garbage collection is not just mark-sweep in smaller slices. Once the program mutates the heap while the collector is tracing it, correctness becomes an invariant about colors."
---

Garbage collection sounds like housekeeping.

It is not.

At the center of a tracing collector is a theorem about reachability. Start from
the roots. Follow pointers. Anything you can reach must survive. Anything you
cannot reach may be reclaimed.

That theorem is simple when the program is stopped.

It becomes slippery when the program keeps running.

The heap is a graph, and the program is allowed to change the graph while the
collector is traversing it. A pointer can be installed after the collector has
already scanned the source object. Another pointer can be deleted before the
collector reaches the old path. A live object can slip between two moments of
the traversal.

That is why a write barrier exists.

Not for performance, at least not first.

A write barrier remembers the mutation that would otherwise make the collector's
proof false.

## The Mark-Sweep Story

The classic tracing abstraction has two phases:

```text
mark:  start from roots and mark everything reachable
sweep: reclaim everything unmarked
```

Wilson's survey organizes garbage collectors around this kind of traversal:
reference counting, mark-sweep, mark-compact, copying, incremental, and
generational variants.[^wilson] The point is not that every production runtime
is literally this simple. The point is that tracing collectors all have to answer
the same question:

```text
Which objects must not be freed?
```

Stop-the-world collectors buy a clean answer by pausing the mutator, the program
that mutates the heap. Incremental and concurrent collectors try to avoid long
pauses by interleaving collector work with mutator work.

Dijkstra, Lamport, Martin, Scholten, and Steffens framed this as cooperation
between processes with weak synchronization: the collector operates while the
computation keeps manipulating a shared data space.[^dijkstra] Lamport's later
note about the paper is charmingly sobering: a convincing proof still hid a
serious error until another proof attempt exposed it.[^lamport]

That is the right emotional posture for garbage collection.

It is a graph algorithm with a hostile scheduler.

## Colors Are a Proof State

Tri-color marking is the clean mental model:

```text
white: not yet reached by the collector
gray:  reached, but outgoing pointers not scanned yet
black: reached, and outgoing pointers already scanned
```

At the end, white objects are swept.

The dangerous state is a black object pointing to a white object that is still
live. The collector will not scan the black object again. If no gray object can
lead to that white object, the white object may be freed while the program still
has a path to it.

So the invariant is not merely "eventually visit all objects." It is more like:

```text
Do not let black objects hide white reachable objects.
```

Write barriers maintain that invariant when the mutator stores pointers during
collection.

## A Small Heap Race

The lab below uses a fixed object graph. The collector begins by scanning root
object `A`, making it black. Then the mutator gets a turn.

The dangerous mutation is:

```text
A gets a pointer to D.
B drops its old pointer to D.
```

Now `D` is live through black object `A`, but the collector has already scanned
`A`. Without a barrier, `D` and `E` remain white and would be swept.

<style>
  .gc-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .gc-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  }

  .gc-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .gc-lab__controls select {
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

  .gc-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .gc-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .gc-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.35);
  }

  .gc-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .gc-lab__metric--warn {
    border-color: rgba(217, 119, 6, 0.35);
  }

  .gc-lab__metric span,
  .gc-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .gc-lab__metric span {
    display: block;
  }

  .gc-lab__metric strong {
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .gc-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .gc-lab__note {
    margin: 0.85rem 0 0;
  }
</style>

<div id="gc-barrier-lab" class="gc-lab" data-gc-lab>
  <div class="gc-lab__controls">
    <label>
      Barrier
      <select data-param="barrier">
        <option value="none" selected>No barrier</option>
        <option value="incremental">Incremental-update barrier</option>
        <option value="snapshot">Snapshot-at-beginning barrier</option>
      </select>
    </label>
    <label>
      Mutator action
      <select data-param="mutation">
        <option value="hide" selected>Hide a white live object</option>
        <option value="delete">Delete a subtree</option>
        <option value="none">No mutation</option>
      </select>
    </label>
  </div>
  <div class="gc-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="650" aria-label="Garbage collection write barrier simulator showing a tri-color heap graph, collector ledger, and invariant status"></canvas>
  <p class="gc-lab__note">
    The collector always scans root object A first. Then the mutator acts. The
    sweep would reclaim every object left white at the end.
  </p>
</div>
<script defer src="{{ '/assets/js/gc-barrier-lab.js?v=20260613a' | relative_url }}"></script>

Start with **No barrier** and **Hide a white live object**. The lab ends with
`A -> D` as a black-to-white edge. `D` and `E` are reachable now, but still
white. A sweep would free live data.

Now switch to **Incremental-update barrier**.

This barrier notices the new pointer from a black object to a white object. It
shades `D` gray, which gives the collector a chance to scan `D` and then mark
`E`. The key event is not the store itself. It is the collector being told:

```text
The graph changed in a way your old scan did not cover.
```

Now switch to **Snapshot-at-beginning barrier**.

This style preserves the object that was overwritten. When `B` drops its old
pointer to `D`, the barrier shades the old referent. The collector completes a
safe approximation of the heap as it existed when collection began. It may keep
objects that died during the cycle, but it will not free objects that were live
in the snapshot.

Try **Delete a subtree** with **Snapshot-at-beginning barrier**. `D` and `E` are
no longer reachable by the end, but they are kept as floating garbage. That is
not a correctness bug. It is the price of a conservative snapshot. The next
collection can reclaim them.

## A Barrier Is a Contract

There are several families of write barriers. Wilson's survey describes
snapshot-at-beginning barriers, incremental-update barriers, read barriers, and
implementation tricks such as coarse page-level dirty bits.[^wilson]

The names can feel like compiler trivia. The contract is simpler:

```text
If the mutator invalidates the collector's partial graph traversal,
record enough information to repair the traversal.
```

The information can be "the new target should be marked" or "the old target
should be remembered." In generational collection, it can be "this old object
now points into the young generation." Ungar's Generation Scavenging exploited
the observation that many young objects die young, but it still had to maintain
remembered sets for old-to-new references as a side effect of stores.[^ungar]

The write barrier is small because it runs on ordinary pointer writes. But it is
semantically large. Remove it, or make it conditional in the wrong way, and the
collector can become unsound.

## Pauses Are Not the Only Story

Baker's real-time list-processing collector was motivated by bounded operations:
ordinary list operations should not suddenly take time proportional to the heap
because allocation triggered a full collection.[^baker] Modern runtimes inherit
that desire for shorter pauses, but the design space is broader than pause time:

1. Does the collector move objects or leave them in place?
2. Does it trace the whole heap or only a young generation?
3. Does it preserve the beginning snapshot or update the traversal as the heap
   changes?
4. Does it require read barriers, write barriers, page protection, remembered
   sets, compiler cooperation, or hardware help?
5. What work is allowed on the hot path of pointer stores?
6. What garbage is allowed to float until the next cycle?

The lab is tiny, but the production lesson is not:

```text
Garbage collection is reachability under mutation.
```

A stop-the-world collector makes mutation stop.

An incremental or concurrent collector lets mutation continue, and then pays
for memory of the mutations.

That memory is the write barrier.

[^dijkstra]: Edsger W. Dijkstra, Leslie Lamport, A. J. Martin, C. S. Scholten, and E. F. M. Steffens, ["On-the-Fly Garbage Collection: An Exercise in Cooperation"](https://lamport.azurewebsites.net/pubs/garbage.pdf), *Communications of the ACM*, 1978.

[^lamport]: Leslie Lamport, ["On-the-fly Garbage Collection: an Exercise in Cooperation"](https://www.microsoft.com/en-us/research/publication/fly-garbage-collection-exercise-cooperation/), Microsoft Research publication note.

[^wilson]: Paul R. Wilson, ["Uniprocessor Garbage Collection Techniques"](https://www.cs.cmu.edu/~fp/courses/15411-f08/misc/wilson94-gc.pdf), International Workshop on Memory Management, 1992.

[^baker]: Henry G. Baker Jr., ["List Processing in Real Time on a Serial Computer"](https://cseweb.ucsd.edu/~schulman/class/cse291_f18/docs/graham_listproc.pdf), *Communications of the ACM*, 1978.

[^ungar]: David Ungar, ["Generation Scavenging: A Non-disruptive High Performance Storage Reclamation Algorithm"](https://people.cs.umass.edu/~emery/classes/cmpsci691s-fall2004/papers/p157-ungar.pdf), ACM SIGSOFT/SIGPLAN Symposium on Practical Software Development Environments, 1984.
