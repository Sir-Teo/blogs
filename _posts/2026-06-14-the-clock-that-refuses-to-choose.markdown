---
layout: post
title: "Clocks Can Say Concurrent"
description: "Lamport clocks preserve causal order, but scalar timestamps still sort concurrent events. Vector clocks keep the partial order visible instead of inventing certainty."
date: 2026-06-14 08:42:00 -0400
categories: computer-science
tags: [distributed-systems, vector-clocks, lamport-clocks, causality, concurrency, logical-time]
excerpt: "A distributed timestamp is a claim about causality, not a wall clock. Vector clocks are useful because they can say two events are unrelated."
---

The strange thing about a distributed clock is that sometimes the honest answer
is "I will not choose."

Two servers write two values. Neither saw the other write. No message connects
them. A wall clock may put one before the other. A database may need a tie-break
anyway. But the system's causal history says something more delicate:

```text
these events are concurrent
```

That is not indecision. It is information the system should not throw away too
early.

Lamport's 1978 paper introduced the happened-before relation and showed how
logical clocks can assign numbers to events so that causality is respected:
if \(a \rightarrow b\), then \(C(a) < C(b)\).[^lamport] The converse is not
promised. A smaller timestamp does not prove causality. It may only prove that a
tie-breaker chose a side.

Vector clocks keep the missing information. Instead of one counter, each event
carries one counter per process. Fidge and Mattern independently developed this
style of timestamp to preserve the partial order of message-passing
systems.[^fidge][^mattern] A vector timestamp can say:

```text
a happened before b
b happened before a
neither happened before the other
```

The third answer is the whole reason to keep the vector around.

## Lamport Gave Causality a Skeleton

Lamport's relation has three rules.

First, events on the same process are ordered by local sequence.

Second, sending a message happens before receiving that message.

Third, the relation is transitive.

That is it. No synchronized clocks. No global observer. No assumption that
network delay has a reliable bound. Causality is built from local order and
message edges.

A Lamport clock implements a scalar summary of this relation. Each process
increments its counter for local events. A message carries the sender's counter.
On receive, the receiver moves above the message timestamp and increments.

The guarantee is one-way:

$$
a \rightarrow b \implies C(a) < C(b).
$$

This is already useful. If a log entry has timestamp 17 and another has
timestamp 9, the second cannot be caused by the first. But if timestamp 9 is
less than timestamp 17, that does not prove the first caused the second. They
may be concurrent.

Scalar time is a compression. It preserves one promise and loses the shape of
the partial order.

## The Vector Keeps the Missing Shape

A vector clock stores one counter per process. On a local event at process
\(i\), increment component \(i\). On send, attach the vector. On receive, take
the componentwise maximum with the message vector, then increment the receiver's
component.

Then compare two vectors \(u\) and \(v\):

$$
u \le v
$$

when every component of \(u\) is at most the corresponding component of \(v\).
If \(u \le v\) and \(u \ne v\), then the event with vector \(u\) happened before
the event with vector \(v\). If neither \(u \le v\) nor \(v \le u\), the events
are concurrent.

The storage cost is obvious. A vector timestamp has size \(O(n)\) for \(n\)
participants. That cost is why systems do not blindly attach full vectors to
everything. But the semantics are clean:

```text
component j says how much of process j's history this event has seen
```

That sentence is much stronger than "this event has a smaller number."

## A Trace With No Global Referee

The lab below simulates a message-passing system. Each event is an internal
step, a send, or a receive. The generator computes the true happened-before
relation from local edges and delivered message edges, then compares it with the
Lamport scalar clock and the vector clock.

The code checks two invariants:

```text
Lamport: happened-before never goes backward
Vector: vector comparison exactly matches happened-before
```

<style>
  .clock-lab {
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

  .clock-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .clock-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .clock-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .clock-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .clock-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .clock-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .clock-lab__metric span,
  .clock-lab__legend,
  .clock-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .clock-lab__metric span {
    display: block;
  }

  .clock-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .clock-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 560px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .clock-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .clock-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .clock-lab__swatch {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .clock-lab__swatch--message {
    background: #7c3aed;
  }

  .clock-lab__swatch--causal {
    background: #0f766e;
  }

  .clock-lab__swatch--concurrent {
    background: #cbd5e1;
  }

  .clock-lab__swatch--false {
    background: #b45309;
  }

  .clock-lab__note {
    margin-top: 0.55rem;
  }

  @media (max-width: 720px) {
    .clock-lab {
      padding: 0.8rem;
    }

    .clock-lab__controls {
      grid-template-columns: minmax(0, 1fr);
    }

    .clock-lab__metrics {
      grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    }

    .clock-lab canvas {
      height: 780px;
    }
  }
</style>

<div class="clock-lab" data-vector-clock-lab>
  <div class="clock-lab__controls">
    <label>
      Processes <output data-value="processes">5</output>
      <input data-param="processes" type="range" min="3" max="8" step="1" value="5">
    </label>
    <label>
      Events <output data-value="events">96</output>
      <input data-param="events" type="range" min="24" max="180" step="4" value="96">
    </label>
    <label>
      Send rate <output data-value="sendRate">34%</output>
      <input data-param="sendRate" type="range" min="0" max="80" step="2" value="34">
    </label>
    <label>
      Receive bias <output data-value="receiveBias">68%</output>
      <input data-param="receiveBias" type="range" min="0" max="100" step="2" value="68">
    </label>
    <label>
      Seed <output data-value="seed">41</output>
      <input data-param="seed" type="range" min="1" max="999" step="1" value="41">
    </label>
  </div>
  <div class="clock-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Vector-clock causality lab"></canvas>
  <div class="clock-lab__legend">
    <span><i class="clock-lab__swatch clock-lab__swatch--message"></i> delivered message</span>
    <span><i class="clock-lab__swatch clock-lab__swatch--causal"></i> happened-before</span>
    <span><i class="clock-lab__swatch clock-lab__swatch--concurrent"></i> concurrent</span>
    <span><i class="clock-lab__swatch clock-lab__swatch--false"></i> scalar false order</span>
  </div>
  <p class="clock-lab__note">
    Scalar false order counts concurrent event pairs with different Lamport
    timestamps. A scalar total order can sort them, but the trace contains no
    causal path between them.
  </p>
</div>

<script defer src="{{ '/assets/js/vector-clock-lab.js?v=20260614a' | relative_url }}"></script>

## The Orange Cells Are the Lesson

The pair classifier is the important panel. Green cells are event pairs ordered
by happened-before. Gray cells are concurrent pairs with equal scalar
timestamps. Orange cells are concurrent pairs that a Lamport scalar timestamp
would still place in one order or the other.

The orange cells are not bugs in Lamport clocks. Lamport's guarantee was never
the converse. The scalar clock is doing exactly what it promised:

```text
causal order implies timestamp order
timestamp order does not imply causal order
```

The vector mismatch metric should stay at zero. The lab computes the true
transitive closure of local and message edges, then compares it with vector
timestamp ordering. Across generated traces, vector comparison recovers the
same partial order.

The frontier panel gives the most concrete reading of a vector. If a selected
event has vector \([18, 11, 13, 25, 20]\), it means that event's causal past has
seen 18 events from process 0, 11 from process 1, and so on. It is not a time.
It is a receipt for history, not a date.

## When Storage Needs Siblings

The most familiar application is versioning under replication.

Suppose two replicas accept writes while disconnected. If each write carries a
vector-like version, then when the replicas meet again the system can ask:

```text
did one version causally descend from the other?
or are these siblings?
```

Dynamo used vector clocks to detect divergent object versions and return
siblings for reconciliation rather than silently choosing a last writer by
timestamp.[^dynamo] That design has tradeoffs: vector metadata can grow,
clients must reconcile, and production systems often add pruning heuristics.
But the semantic distinction is valuable. A causal descendant can replace its
ancestor. Concurrent siblings need a merge policy.

A last-write-wins register collapses that distinction. It chooses a winner even
when the system does not know a causal winner exists. Sometimes that is exactly
what the product wants. But then the policy should be named honestly:

```text
we are resolving concurrency by a tie-breaker
```

not:

```text
we discovered which update came first
```

## Honesty Has Metadata

Vector clocks are not free. In the simplest form, a timestamp carries one
integer per process. That is fine for five processes in a demo. It is awkward
for thousands of clients, mobile devices, or ephemeral actors.

That cost explains a lot of real engineering:

- dotted version vectors compress the "one actor, one event" case;
- version vectors track replicas rather than individual clients;
- hybrid logical clocks combine physical time with a logical counter;
- CRDTs choose data types whose merge semantics reduce the need for conflict
  inspection;
- some systems deliberately use last-write-wins because metadata and merge
  complexity are not worth the product semantics.

The right choice depends on what a conflict means. If overwriting a concurrent
shopping-cart update is unacceptable, pay for causal metadata or design a merge.
If overwriting a cache entry is harmless, a scalar timestamp may be enough.

The mistake is pretending these are the same decision.

## A Partial Order Is a Product Fact

Programmers often want a single log because single logs are easy to read. One
line before another. One event after another. One winner.

Distributed systems keep producing partial orders anyway.

The partial order is not an implementation nuisance. It is a fact about what the
system observed. If no message path connects two events, the system does not
know that one caused the other. A scalar clock can serialize them. A database
can pick a winner. A user interface can hide the sibling. Those are policies
layered on top of uncertainty.

Vector clocks are beautiful because they preserve the shape of that uncertainty.
They do not say "I do not know" in a vague way. They say exactly which histories
are included in an event's past, and therefore which comparisons are justified.

The clock refuses to choose because choosing would be a policy, not an
observation.

[^lamport]: Leslie Lamport, ["Time, Clocks, and the Ordering of Events in a Distributed System"](https://lamport.azurewebsites.net/pubs/time-clocks.pdf), *Communications of the ACM*, 21(7), 1978.

[^fidge]: Colin J. Fidge, ["Timestamps in Message-Passing Systems That Preserve the Partial Ordering"](https://classpages.cselabs.umn.edu/Spring-2018/csci8980/Papers/Foundations/fidge.pdf), *Proceedings of the 11th Australian Computer Science Conference*, 1988.

[^mattern]: Friedemann Mattern, ["Virtual Time and Global States of Distributed Systems"](https://www.vs.inf.ethz.ch/publ/papers/VirtTimeGlobStates.pdf), 1989.

[^dynamo]: Giuseppe DeCandia et al., ["Dynamo: Amazon's Highly Available Key-value Store"](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf), SOSP 2007.
