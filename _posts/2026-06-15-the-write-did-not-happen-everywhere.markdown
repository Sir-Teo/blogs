---
layout: post
title: "The Write Did Not Happen Everywhere"
description: "A tiny store-buffering litmus test shows why memory order is a contract, not a timestamp."
date: 2026-06-15 11:06:00 -0400
categories: software-engineering
tags: [weak-memory, memory-ordering, concurrency, atomics, litmus-tests, x86-tso, systems]
excerpt: "Two threads can each write before they read, and both reads can still see zero. The bug is not in time. It is in what the machine promised."
---

Here is the whole experiment:

```text
initially: x = 0, y = 0

Thread 0          Thread 1
x = 1             y = 1
r0 = y            r1 = x
```

Ask for the ending that feels most illegal:

```text
r0 = 0 and r1 = 0
```

Both threads wrote first. Both threads read second. And yet each read missed
the other thread's write.

If your mental model is "there is one real order in which memory operations
happen," this outcome is impossible. But that mental model has a name:
sequential consistency. Lamport defined it as the condition that a concurrent
execution looks like some single interleaving of all processors' operations,
while preserving each processor's program order.[^lamport] It is beautiful. It
is also a contract, not a law of physics.

The small program above is the store-buffering litmus test. It is useful
because nothing about it is ornate. There is no lock, queue, compiler trick, or
data structure. It is just the question: when a core has performed a store, who
has seen it?

## The Forbidden Interleaving

Under sequential consistency, each thread has two ordered events:

```text
T0: store x=1 before load y
T1: store y=1 before load x
```

For `r0` to be zero, the load of `y` must happen before Thread 1's store to
`y`. For `r1` to be zero, the load of `x` must happen before Thread 0's store
to `x`.

Put those together:

```text
T0 store x=1
  < T0 load y
  < T1 store y=1
  < T1 load x
  < T0 store x=1
```

The order loops back into itself. A single global timeline cannot contain that
cycle. So sequential consistency forbids the `00` ending.

This is the first lesson: a memory model is not merely about whether values are
atomic. It is about which explanations are allowed.

## The Store Is Still in the Hallway

A store buffer gives the `00` ending an explanation.

The core can retire its store into a private buffer and continue. Later, that
buffer drains to shared memory. A later load from the same core may be allowed
to read shared memory before another core's buffered store has drained. The
core did not travel backward in time. It simply did not make the write globally
visible before the load.

One witness looks like this:

```text
T0 buffers x=1
T0 reads y -> 0
T1 buffers y=1
T1 reads x -> 0
T0 drains x=1
T1 drains y=1
```

This style of operational story is close to the approachable presentation of
x86-TSO: each processor has a FIFO store buffer, loads consult their own buffer
for the same address and otherwise read shared memory, and fences or locked
operations can force stronger ordering.[^x86tso] It is still a model. Real
machines and languages have more detail. But as a first lens, it is the right
kind of wrong.

Adve and Gharachorloo's memory-consistency tutorial is useful because it keeps
the central tension visible: programmers want simple reasoning rules, while
implementations want caches, write buffers, speculation, and reordering freedom
that preserve single-thread behavior but can surface in concurrent code.[^adve]

## A Litmus Lab

The lab exhaustively enumerates the tiny program and then runs a random
operational scheduler. The random frequency is not a CPU probability; it is a
way to make the witness appear and disappear as stores drain earlier or later.

Try these three modes:

- **Sequential consistency**: `00` is crossed out because no interleaving
  preserves both threads' program order and produces it.
- **TSO store buffer**: `00` is allowed. Both writes can sit in private store
  buffers while both loads read old shared values.
- **TSO with fences**: a fence between each store and load makes the core wait
  for its own store buffer to drain before reading.

Default audited facts:

- sequential consistency has `6` exact interleavings and `0` both-zero paths;
- the store-buffer model has `80` exact transition paths and `18` both-zero
  paths;
- adding fences removes both-zero again;
- the default random TSO scheduler sees both-zero about `31.8%` of the time.

<style>
  .litmus-lab {
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

  .litmus-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .litmus-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .litmus-lab__controls input,
  .litmus-lab__controls select {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .litmus-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0;
  }

  .litmus-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .litmus-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .litmus-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.18;
    overflow-wrap: anywhere;
  }

  .litmus-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .litmus-lab__trace {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
    padding-left: 1.2rem;
  }

  .litmus-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }
</style>

<div class="litmus-lab" data-store-buffer-litmus-lab>
  <div class="litmus-lab__controls">
    <label>
      Model
      <select data-param="model">
        <option value="tso" selected>TSO store buffer</option>
        <option value="sc">Sequential consistency</option>
        <option value="fenced">TSO with fences</option>
      </select>
    </label>
    <label>
      Trials <output data-value="trials">2400</output>
      <input type="range" data-param="trials" min="200" max="12000" step="200" value="2400">
    </label>
    <label>
      Drain chance <output data-value="drainRate">35%</output>
      <input type="range" data-param="drainRate" min="0" max="100" step="1" value="35">
    </label>
    <label>
      Seed <output data-value="seed">29</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="29">
    </label>
  </div>
  <div class="litmus-lab__metrics" data-metrics></div>
  <canvas data-canvas width="860" height="540" aria-label="Store-buffering litmus simulator with outcome histogram and witness trace"></canvas>
  <ol class="litmus-lab__trace" data-trace></ol>
  <p class="litmus-lab__note">
    The audit checks that SC forbids both-zero, TSO permits it, fenced TSO
    forbids it, exact outcome counts are finite, and the default simulation
    reaches a both-zero witness.
  </p>
</div>
<script defer src="{{ '/assets/js/store-buffer-litmus-lab.js?v=20260615a' | relative_url }}"></script>

## The Language Has Its Own Contract

There are two layers that are easy to mix together.

At the hardware layer, a model such as x86-TSO describes which machine-code
executions are allowed. At the language layer, C++ atomics describe which
source-level executions are allowed and what compilers may transform. Boehm and
Adve's C++ memory-model paper is explicit about the bargain: ordinary data
races do not get a friendly semantics, while race-free programs are meant to
recover sequentially consistent reasoning for the high-level subset.[^boehm]

So the litmus test should not be written with plain racing C++ variables and
then interpreted as a portable program. Use atomics if you want a language-level
experiment. With relaxed atomics, C++ guarantees atomicity for each object but
does not make the operations synchronization operations.[^cppref] With
`memory_order_seq_cst`, the language adds a single total order over the
sequentially consistent atomic operations, which rules out this particular
both-zero result.

The trap is thinking that "atomic" means "everyone saw it in the same story."
Atomicity is not enough. You also need an ordering relation strong enough for
the invariant you are trying to prove.

## What the Test Teaches

The store-buffering litmus test is small enough to fit in a margin, but it
contains the hard part of concurrent programming:

- Local program order is not automatically global visibility.
- A write can be complete for the writing core before it is visible to another
  core.
- A fence is not ceremonial. It changes the set of legal explanations.
- Testing by repetition is evidence about one environment, not a proof of a
  memory model.
- Tools such as herd7 exist because tiny litmus tests are already too subtle to
  reason about by vibe.[^herd]

The deepest mistake is to imagine memory order as a timestamp attached to each
operation. The useful picture is relational. Which operations must be before
which other operations? Which reads are allowed to see which writes? Which
cycles are forbidden?

The write happened.

The question is where.

[^lamport]: Leslie Lamport, ["How to Make a Multiprocessor Computer That Correctly Executes Multiprocess Programs"](https://lamport.azurewebsites.net/pubs/multi.pdf), IEEE Transactions on Computers, 1979.

[^adve]: Sarita V. Adve and Kourosh Gharachorloo, ["Shared Memory Consistency Models: A Tutorial"](https://rsim.cs.uiuc.edu/consistency/), IEEE Computer, 1996.

[^x86tso]: Peter Sewell, Susmit Sarkar, Scott Owens, Francesco Zappa Nardelli, and Magnus O. Myreen, ["x86-TSO: A Rigorous and Usable Programmer's Model for x86 Multiprocessors"](https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf), Communications of the ACM, 2010.

[^boehm]: Hans-J. Boehm and Sarita V. Adve, ["Foundations of the C++ Concurrency Memory Model"](https://experts.illinois.edu/en/publications/foundations-of-the-c-concurrency-memory-model-2/), PLDI, 2008.

[^cppref]: ["`std::memory_order`"](https://cppreference.com/cpp/atomic/memory_order), cppreference.com.

[^herd]: Jade Alglave and Luc Maranget, ["Simulating memory models with herd7"](https://diy.inria.fr/doc/herd.html), herdtools documentation.
