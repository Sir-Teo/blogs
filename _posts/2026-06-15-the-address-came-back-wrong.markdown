---
layout: post
title: "The Address Came Back Wrong"
description: "The ABA problem is what happens when compare-and-swap sees the same pointer twice and mistakes equality for history."
date: 2026-06-15 16:36:00 -0400
categories: software-engineering
tags: [aba-problem, lock-free, compare-and-swap, concurrency, hazard-pointers, memory-reclamation]
excerpt: "A lock-free pop can read head A, pause, watch A disappear and return, then successfully compare the same address against a different story."
---

The dangerous thing about a pointer is that it looks like a name.

It is not a name. It is an address. Addresses can be reused. Sometimes the same
node can even leave and come back. A compare-and-swap instruction only sees the
word you ask it to compare. If that word is equal, it does not tell you where it
has been.

This is the ABA problem:

```text
T1 sees A
T2 changes A -> B -> A
T1 sees A again
T1 assumes nothing changed
```

The second `A` is not evidence that time stood still. It is evidence that the
same visible value is back in the shared location.

That distinction is enough to break a lock-free stack.

## A Pop With One Bad Nap

The classic Treiber stack is beautifully small: a singly linked list with an
atomic top pointer.[^treiber] Its pop operation has the shape below:

```c
Node *old;
Node *next;

do {
  old = top;
  if (old == NULL) return EMPTY;
  next = old->next;
} while (!CAS(&top, old, next));

return old->value;
```

The linearization point is supposed to be the successful CAS. If `top` still
equals `old`, swing the stack to `next` and return the old top. This is exactly
the kind of tiny code that makes lock-free programming feel plausible.

Now start with:

```text
top -> A -> B -> C
```

Thread T1 begins a pop:

```text
old  = A
next = B
```

Then T1 pauses.

Thread T2 runs:

```text
pop A        top -> B -> C
pop B        top -> C
push D@A     top -> D -> C
```

The last line is the evil one. `D@A` means a new node `D` lives at the same
address that used to hold `A`. To a pointer-only CAS, the top address is back to
`A`.

T1 wakes up and asks:

```text
is top still 0xA0?
```

Yes.

So it writes the stale `next` it saved before the nap:

```text
top := B
```

But `B` was already popped. The stack head now points at a retired node, and the
live node `D` is no longer reachable. Nothing in the final pointer comparison
said "two other pops happened here."

That is the bug. Not a crash yet. Not necessarily a failing test. A data
structure whose public face just accepted an impossible private history.

## The Lab

The simulator below runs that exact interleaving. It compares four lanes:

- **Pointer-only CAS** compares only the address stored in `top`.
- **Tagged head** compares `(address, version)`, so `0xA0, v0` differs from
  `0xA0, v3`.
- **Hazard pointer** lets T1 publish "I may still touch A," which prevents the
  allocator from recycling A's address while the hazard is active.
- **Tag + hazard** uses both: one mechanism for history, one for safe reuse.

Change "what comes back on top." The default is allocator address reuse. The
"same A node returns" option is deliberately sharper: it shows why memory
reclamation and logical history are different promises.

<style>
  .aba-lab {
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

  .aba-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  }

  .aba-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 700;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .aba-lab__controls select {
    appearance: none;
    background: #f8fafc;
    border: 1px solid #cbd5df;
    border-radius: 7px;
    box-sizing: border-box;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.5rem 0.62rem;
    width: 100%;
  }

  .aba-lab__summary,
  .aba-lab__legend {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.83rem;
    line-height: 1.45;
  }

  .aba-lab__summary {
    margin: 0.8rem 0 0;
  }

  .aba-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0.95rem 0 0.85rem;
  }

  .aba-lab__metric {
    background: #f8fafc;
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    min-width: 0;
    padding: 0.6rem 0.66rem;
  }

  .aba-lab__metric span {
    color: #62707d;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .aba-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.94rem, 2.5vw, 1.15rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.18;
    margin-top: 0.18rem;
    overflow-wrap: anywhere;
  }

  .aba-lab__canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 880px;
    margin: 0.85rem 0;
    max-width: 100%;
    width: 100%;
  }

  .aba-lab__legend {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.8rem;
    margin: 0.35rem 0 0;
  }

  .aba-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.3rem;
    min-width: 0;
  }

  .aba-lab__legend i {
    border-radius: 3px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .aba-lab__legend .is-pointer,
  .aba-lab__legend .is-bad {
    background: #be123c;
  }

  .aba-lab__legend .is-tag {
    background: #2563eb;
  }

  .aba-lab__legend .is-hp {
    background: #7c3aed;
  }

  .aba-lab__legend .is-good {
    background: #0f766e;
  }

  @media (max-width: 620px) {
    .aba-lab {
      padding: 0.75rem;
    }

    .aba-lab__canvas {
      height: 1310px;
    }
  }
</style>

<div class="aba-lab" data-aba-stack-lab data-scenario="recycle"></div>

<script defer src="{{ '/assets/js/aba-stack-lab.js?v=20260615a' | relative_url }}"></script>

With the default settings, the lab audit checks `15` invariants. The
pointer-only lane succeeds at the stale CAS and ends in a corrupt state:
`reachable retired B` and `live D is unreachable`. The tagged lane rejects the
same CAS because the head version has advanced to `v3`: pop A, pop B, push D.
The hazard-pointer lane also rejects in the default scenario because A's address
is protected, so D is allocated fresh instead of at `0xA0`.

The punchline is not "always add every defense." It is: know which assumption
you are defending.

## A Tag Changes The Second A

The usual tagged-pointer repair stores a counter with the pointer:

```text
head = (ptr, count)
```

Each successful head change increments `count`. T1 no longer compares only
`0xA0`; it compares `(0xA0, 0)`. After T2's three head changes, the visible
address may be `0xA0` again, but the state is `(0xA0, 3)`.

That is not ABA. It is ABA':

```text
(A, 0) -> (B, 1) -> (C, 2) -> (A, 3)
```

The address came back, but the state did not.

This is why many non-blocking algorithms use double-width CAS, pointer tagging,
or an equivalent state word when a single pointer is not enough. The Michael and
Scott queue pseudocode, for example, represents head and tail as a pointer plus
an unsigned count.[^ms] The Rochester synchronization notes also call out
double-width CAS as a way to avoid ABA in related dual-stack and dual-queue
algorithms.[^rochester]

Tags are not magic. A small counter can wrap. A platform may not give you a
cheap double-width CAS for the shape of pointer you want. Pointer low-bit tricks
depend on alignment and address layout. But conceptually the fix is clean:
compare enough state that "the pointer came back" is not confused with "nothing
happened."

## A Hazard Pointer Makes A Stay Put

A tagged head defends the comparison. A hazard pointer defends memory reuse.

Maged Michael's hazard-pointer paper starts from a blunt problem: in lock-free
objects, one thread may remove a node while another thread still holds a private
reference to it.[^michael] With a lock, the remover often knows no one else can
touch the node. Without a lock, that is exactly what you do not know.

The hazard-pointer protocol gives each participating thread a small number of
published pointer slots. Before T1 dereferences `A`, it publishes `A` as
hazardous, then validates that `A` is still the head. When T2 retires a node, it
does not immediately hand that memory back for arbitrary reuse. It scans hazard
pointers. If some hazard pointer still names the retired node, reuse is delayed.

In the default lab scenario, this is enough to stop the allocator from turning
old `A` into new `D@A` while T1 is asleep. D gets a fresh address, the pointer
CAS sees `0xD0` instead of `0xA0`, and the stale CAS fails.

That is a memory-reclamation victory.

It is not the same thing as a history counter.

Switch the lab to "same A node returns." In that scenario, the exact same node A
is removed and later placed back on top. The hazard pointer can make A safe to
read. It does not, by itself, make `top == A` mean "A never left." The hazard
lane is memory-safe but still accepts the stale pointer-only CAS; the tagged lane
rejects it.

This caveat is where lock-free writing stops being folklore and becomes
engineering. Hazard pointers are powerful. Michael's paper shows how to use
them for safe reclamation and ABA prevention under the method's assumptions. But
they are not a license to forget the data structure's ownership and reuse rules.
If your algorithm lets the same node leave and re-enter while another thread
depends on an old `next`, you still need a proof that the comparison state is
strong enough.

## The Linearization Point Is Conditional

Herlihy and Wing's linearizability condition says a concurrent operation should
appear to take effect at some instant between call and return.[^hw] In a Treiber
pop, the successful CAS is the natural instant.

ABA is nasty because it forges the condition for that instant. The CAS succeeds,
so the code believes it found a legal linearization point. But the private value
`next = B` was read in an older stack epoch. By the time the CAS runs, assigning
`top := B` no longer means "remove exactly the node I observed." It means "write
a pointer whose justification expired."

That is why the bug is so compact. Every individual instruction is doing what it
advertised. The failure lives in the assumption that a repeated word implies a
repeated world.

## What I Would Check In Real Code

If I were reviewing a lock-free stack, free list, pool, or intrusive queue, I
would not start by asking whether it has CAS loops. CAS loops are the easy part.
I would ask:

- Can a node address be recycled while another thread may still hold it in a
  register?
- Does every dereference of a possibly removed node have a reclamation discipline
  such as hazard pointers, epochs, reference counts, or a type-preserving
  allocator with clear lifetime bounds?
- Does a successful CAS compare enough state to justify the update computed from
  earlier reads?
- If the design permits nodes to move out and back in, what prevents the
  same-node ABA, not just allocator reuse?
- Are the memory-ordering annotations part of the proof, or only part of the
  performance story?

That last question deserves its own article. ABA is not solved by sprinkling
`memory_order_seq_cst` over stale logic. Ordering can make writes visible in a
coherent way. It does not make a pointer remember the path it took.

The whole lesson fits in one sentence:

```text
CAS validates equality, not biography.
```

If biography matters, put it in the state you compare, or make it impossible for
the old biography to be reused.

[^treiber]: R. Kent Treiber, *Systems Programming: Coping with Parallelism*, IBM Almaden Research Center, Research Report RJ 5118, 1986. For an accessible reproduction of the stack pseudocode and the ABA replay, see Viktor Vafeiadis, ["Shape-Value Abstraction for Verifying Linearizability"](https://people.mpi-sws.org/~viktor/papers/vmcai2009-shapevalue.pdf), VMCAI 2009.

[^ms]: Maged M. Michael and Michael L. Scott, ["Simple, Fast, and Practical Non-Blocking and Blocking Concurrent Queue Algorithms"](https://www.cs.rochester.edu/research/synchronization/pseudocode/queues.html), PODC 1996 pseudocode page, which uses counted pointers for head and tail.

[^rochester]: University of Rochester synchronization pseudocode notes, ["Dual Data Structures"](https://www.cs.rochester.edu/research/synchronization/pseudocode/duals.html), noting double-width CAS as an ABA-avoidance requirement for the listed dual structures.

[^michael]: Maged M. Michael, ["Hazard Pointers: Safe Memory Reclamation for Lock-Free Objects"](https://www.cs.otago.ac.nz/cosc440/readings/hazard-pointers.pdf), *IEEE Transactions on Parallel and Distributed Systems*, 2004.

[^hw]: Maurice P. Herlihy and Jeannette M. Wing, ["Linearizability: A Correctness Condition for Concurrent Objects"](https://cs.brown.edu/people/mph/HerlihyW90/p463-herlihy.pdf), *ACM Transactions on Programming Languages and Systems*, 1990.
