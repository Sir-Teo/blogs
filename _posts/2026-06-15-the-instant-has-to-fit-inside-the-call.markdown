---
layout: post
title: "The Instant Has to Fit Inside the Call"
description: "Linearizability asks whether every concurrent operation can be assigned one legal instant between invocation and response."
date: 2026-06-15 11:18:00 -0400
categories: software-engineering
tags: [linearizability, concurrency, distributed-systems, correctness, jepsen, cas, testing]
excerpt: "A concurrent history is not judged by whether it feels plausible. It is judged by whether there exists a sequential explanation whose instants fit inside the calls."
---

A concurrent object gives you a pleasant lie:

```text
operations overlap in time
but the object behaves
as if each operation happened
at one instant
```

Linearizability is the discipline of making that lie precise.

The point is not that operations literally take effect at visible timestamps.
The point is that the history must admit a legal fiction. For every completed
operation, you should be able to choose one instant between its invocation and
its response. If you sort operations by those chosen instants, the resulting
sequential story must obey the object's ordinary specification.

For a register, that specification is boring:

```text
write(v) sets the value to v
read() returns the current value
cas(expected, update)
  succeeds iff current == expected
```

The boringness is the feature. Linearizability lets you reason about concurrent
objects using their sequential meanings, while still permitting real overlap.
Herlihy and Wing's original paper framed the condition exactly this way: each
operation appears to take effect instantaneously somewhere between call and
return, and non-overlapping operations must keep their real-time order.[^hw]

That "somewhere" does a lot of work.

## The Window Is Evidence

Consider this register history, initially `0`:

```text
time: 1  2  3  4  5  6  7  8
W1:   write(1) --------------
R0:      read() -> 0 ---
R1:               read() -> 1 ---
```

This history can be linearizable. Put `R0` before `W1`, because their intervals
overlap and `R0` returned the old value. Put `R1` after `W1`, because its
interval also overlaps enough to let the write take effect first.

One legal sequential explanation is:

```text
read -> 0
write 1
read -> 1
```

No thread observed magic. We just used the uncertainty inside the overlapping
call intervals.

Now make one tiny edit:

```text
W1: write(1) returns before R0 starts
R0: read() -> 0
```

The overlap is gone. Real time creates a hard edge: `W1` must be before `R0`.
The sequential register says a read after `write(1)` must return `1`. There is
no legal instant left for `R0`.

That is the shape of a linearizability bug. Not "a stale read feels bad," but
"no sequential explanation exists."

## A Tiny Checker

The lab below performs an exact search over small histories. It builds the
real-time precedence graph, then tries every operation whose predecessors have
already been placed. Each candidate is applied to a sequential register or
compare-and-set model. If the return value does not match the current state, that
branch dies.

This is essentially the small version of the history-search idea that appears
in testing work by Wing and Gong, later explored and optimized in linearizability
testing algorithms such as Lowe's.[^wing-gong][^lowe] Production checkers have
to care about state explosion. This notebook keeps the histories tiny so the
reasoning remains visible.

Try these cases:

- **Overlap can save a read**: a read returning `0` is legal because it can be
  placed before an overlapping write.
- **Completed write ignored**: a read starts after `write(1)` returns but still
  reports `0`; the checker exhausts every branch.
- **Read sees future**: a read finishes before the write begins yet returns the
  future value.
- **Two successful CAS calls**: overlap cannot make two `cas(0, *)` calls both
  succeed on one register.

<style>
  .linear-lab {
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

  .linear-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: minmax(0, 1fr);
  }

  .linear-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .linear-lab__controls select {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .linear-lab__summary,
  .linear-lab__explanation,
  .linear-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .linear-lab__summary {
    margin: 0.8rem 0 0;
  }

  .linear-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0;
  }

  .linear-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .linear-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .linear-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.18;
    overflow-wrap: anywhere;
  }

  .linear-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .linear-lab__explanation {
    margin: 0.8rem 0 0;
    padding-left: 1.2rem;
  }

  .linear-lab__note {
    margin: 0.8rem 0 0;
  }
</style>

<div class="linear-lab" data-linearizability-lab>
  <div class="linear-lab__controls">
    <label>
      History
      <select data-param="scenario">
        <option value="overlap" selected>Overlap can save a read</option>
        <option value="stale">Completed write ignored</option>
        <option value="future">Read sees future</option>
        <option value="writeRace">Read slips between two writes</option>
        <option value="casDuel">Two successful CAS calls</option>
        <option value="casRace">One CAS wins, one CAS loses</option>
      </select>
    </label>
  </div>
  <p class="linear-lab__summary" data-summary></p>
  <div class="linear-lab__metrics" data-metrics></div>
  <canvas data-canvas width="860" height="540" aria-label="Linearizability checker showing operation intervals and a sequential explanation or failure search"></canvas>
  <ol class="linear-lab__explanation" data-explanation></ol>
  <p class="linear-lab__note">
    The audit covers six histories, checks expected valid/invalid verdicts,
    verifies the overlap witness order, and confirms that the CAS-duel case
    dies by sequential semantics rather than by timing alone.
  </p>
</div>
<script defer src="{{ '/assets/js/linearizability-lab.js?v=20260615a' | relative_url }}"></script>

## Why Checkers Search

The reason a checker searches rather than simply sorting by start time is that
overlap creates freedom. A slow `write(1)` may linearize near the beginning of
its call or near the end. A read overlapping it may legally return either old or
new value, depending on where the chosen instants land.

But the freedom is not unlimited. The chosen order must satisfy two constraints:

- Real-time constraint: if operation `A` returns before operation `B` is called,
  then `A` must be before `B`.
- Object constraint: the sequential return values must be legal for the data
  type.

The lab's backtracking search is tiny, but it captures that structure. For the
CAS duel, both calls overlap completely, so real time does not decide the order.
The object does. If `cas(0,1)` succeeds first, the value is no longer `0`, so
`cas(0,2)` cannot also succeed. Reversing the order has the same problem. The
history is nonlinearizable even though there is plenty of overlap.

This is why linearizability is stricter than "could be concurrent." It demands
a single sequential explanation, not just a collection of individually plausible
responses.

## Distributed Systems Make the Histories Messy

In distributed testing, the object might be a key-value register, a queue, a set,
or a compare-and-set register exposed over a network. Clients record invocations
and completions. A checker such as Knossos then asks whether the observed
history can be explained by a sequential model.[^knossos] Jepsen uses this kind
of checker for linearizable objects, while also using other checkers for weaker
or transactional guarantees.[^jepsen]

This matters because a single successful read can be more damning than a pile of
timeouts. A timeout may leave an operation pending; maybe it happened, maybe it
did not. But a completed read returning a value that cannot fit anywhere in the
history is a proof-shaped failure.

There is a second practical lesson: linearizability is local. Herlihy and Wing
emphasized that a system is linearizable if each individual object is
linearizable.[^hw] That locality is why many tests split histories by key. It is
also why a single-key register can be easier to verify than a multi-key
transactional story. The hard part moves from "one object" to "which object did
this operation really touch?"

## The Useful Lie

Linearizability does not say the implementation is simple. It says the outside
history has a simple explanation.

That distinction is the whole trick. Inside the object there may be locks,
compare-and-swap loops, replication, retries, leader changes, speculative reads,
or cache effects. Outside, if the object is linearizable, clients may pretend
there was one instant per operation.

When the checker fails, it is not accusing the system of being slow. It is
accusing the system of having no possible instant.

The operation did not merely return the wrong value.

It returned a value that had nowhere to stand.

[^hw]: Maurice P. Herlihy and Jeannette M. Wing, ["Linearizability: A Correctness Condition for Concurrent Objects"](https://cs.brown.edu/people/mph/HerlihyW90/p463-herlihy.pdf), ACM Transactions on Programming Languages and Systems, 1990.

[^wing-gong]: Jeannette M. Wing and Chun Gong, ["Testing and Verifying Concurrent Objects"](https://www.cs.columbia.edu/~wing/publications/WingGong93.pdf), Journal of Parallel and Distributed Computing, 1993.

[^lowe]: Gavin Lowe, ["Testing for Linearizability"](https://www.cs.ox.ac.uk/people/gavin.lowe/LinearizabiltyTesting/paper.pdf), 2015.

[^knossos]: Jepsen, ["Knossos"](https://github.com/jepsen-io/knossos), a checker for experimentally accessible linearizability histories.

[^jepsen]: Jepsen checker documentation, ["linearizable"](https://jepsen-io.github.io/jepsen/jepsen.checker.html), which describes validation through Knossos.
