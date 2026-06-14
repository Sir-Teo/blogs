---
layout: post
title: "CRDTs Are Their Merge Functions"
description: "CRDTs are not a trick for avoiding distributed systems. They are a way of making merge algebra explicit: what grows, what can be forgotten, and what must be coordinated."
date: 2026-06-13 06:54:00 -0400
categories: computer-science
tags: [distributed-systems, crdts, eventual-consistency, semilattices, local-first-software, databases]
excerpt: "A collaborative app is not defined only by its UI or storage layer. It is defined by its merge function. If the merge is commutative, associative, and idempotent, replicas can disagree temporarily without becoming different systems."
---

Two people edit the same object while offline.

One deletes a task. The other edits it in another tab. Later the network comes
back, and the product has to answer a deceptively small question:

```text
what is the value now?
```

There are many ways to dodge the question. You can pick the value with the
largest timestamp. You can ask the user to resolve a conflict. You can make a
central server serialize every write. You can declare one client authoritative.
You can keep both versions and hope the UI makes the result intelligible.

A CRDT takes a more mathematical path. It says: choose a data type whose merge
function is already the distributed-system protocol.

That sounds abstract until it fails. Then it becomes very concrete.

## The Three Laws

For a state-based CRDT, replica states live in a join-semilattice. There is a
partial order $$\leq$$ that means "has at least as much information as," and a
merge operation $$\sqcup$$ that computes the least upper bound of two states.
The merge operation must be:

$$
x \sqcup y = y \sqcup x
$$

$$
(x \sqcup y) \sqcup z = x \sqcup (y \sqcup z)
$$

$$
x \sqcup x = x.
$$

Commutativity says message order does not matter. Associativity says batching
does not matter. Idempotence says duplicate delivery does not matter. Those
three properties are not academic ornaments. They are the reason anti-entropy
can be lazy, repeated, partial, and eventually successful.

Local updates also need to be inflationary:

$$
x \leq u(x).
$$

A replica may move forward in the information order, but not backward. If every
replica eventually receives the same updates, and merge is a join, all replicas
converge.

This is the key move in Shapiro, Preguica, Baquero, and Zawirski's CRDT work:
instead of treating eventual consistency as a pile of application-specific
conflict handlers, give data types sufficient algebraic conditions for strong
eventual consistency.[^shapiro] The algebra does not remove product semantics.
It forces them into the open.

## A Bad Merge Is a Product Decision

Try the lab below with **Naive add/remove**. The scenario starts with both
replicas seeing the same item. During a partition, replica A deletes it while
replica B edits it offline by adding a new version of the same item. The
network later delivers the same operations in shuffled orders.

If add and remove are just operations on a plain set, the final result depends
on delivery order. The system has not merely implemented eventual consistency
poorly. It has failed to define the object.

<div class="crdt-lab" data-crdt-lab>
  <div class="crdt-lab__controls">
    <label>
      Data type
      <select data-param="model" style="min-width:0;width:100%">
        <option value="orset">Observed-remove set</option>
        <option value="naive">Naive add/remove</option>
        <option value="lww">Last-writer-wins set</option>
        <option value="gset">Grow-only set</option>
      </select>
    </label>
    <label>
      Scenario
      <select data-param="scenario" style="min-width:0;width:100%">
        <option value="edit">Delete vs offline edit</option>
        <option value="growth">Independent additions</option>
        <option value="readd">Delete while another tab re-adds</option>
      </select>
    </label>
    <label>
      Shuffled deliveries: <output data-value="trials">160</output>
      <input type="range" min="40" max="400" step="20" value="160" data-param="trials">
    </label>
    <label>
      B clock skew: <output data-value="clockSkew">0s</output>
      <input type="range" min="-8" max="8" step="1" value="0" data-param="clockSkew">
    </label>
  </div>
  <div class="crdt-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="620" aria-label="CRDT merge simulator comparing grow-only, naive add-remove, last-writer-wins, and observed-remove sets under shuffled message delivery"></canvas>
  <div class="crdt-lab__legend">
    <span><i style="background:#0f766e"></i> Add or convergent outcome</span>
    <span><i style="background:#be123c"></i> Remove or order-sensitive outcome</span>
    <span><i style="background:#2563eb"></i> Replica A</span>
    <span><i style="background:#7c3aed"></i> Replica B</span>
    <span><i style="background:#fce7f3"></i> Tombstone metadata</span>
  </div>
  <p class="crdt-lab__note">
    Deterministic synthetic experiment. The lab applies the same partitioned
    operations in many shuffled delivery orders. A good merge should produce
    one final state from the same set of updates. The naive model exposes order
    sensitivity; the other models converge, but with different product
    semantics and metadata costs.
  </p>
</div>
<script src="{{ '/assets/js/crdt-merge-lab.js?v=20260613a' | relative_url }}"></script>

The grow-only set converges because it refuses to delete. That is valid algebra
and sometimes valid product design: logs, seen message IDs, feature flags that
only roll forward, accumulated votes, monotone permissions. But it is not a
todo list.

The last-writer-wins set converges because timestamps impose a total order. It
is tempting because it is small and familiar. Move the **B clock skew** slider,
though, and notice what happens. The result can flip without changing user
intent. The clock has become part of the application semantics. That can be
acceptable for a cache entry or status heartbeat. It is less acceptable when a
doctor, designer, trader, or engineer expects both offline actions to be
represented.

The observed-remove set also converges, but it gives delete a more precise
meaning. A remove erases the adds it has observed, not the adds that happen
concurrently somewhere else. This is the small idea that makes add/remove sets
usable under concurrency.

## Delete Is Not the Opposite of Add

A naive set stores only membership:

$$
e \in S.
$$

Then `add(e)` and `remove(e)` fight over one bit. If the operations are
concurrent, there is no fact inside that bit that can tell you which operation
should win.

An observed-remove set stores add events. Let a dot be a unique operation ID,
often derived from a replica ID and counter. The state is:

$$
A \subseteq E \times D,
\qquad
R \subseteq D.
$$

Here $$A$$ is the set of add dots and $$R$$ is the set of removed dots. The
query is:

$$
e \in \mathrm{value}(A,R)
\quad \text{iff} \quad
\exists d : (e,d) \in A \land d \notin R.
$$

Add inserts a fresh dot:

$$
A := A \cup \{(e,d_{\mathrm{fresh}})\}.
$$

Remove records the dots for that element that the remover has actually seen:

$$
R := R \cup \{d : (e,d) \in A\}.
$$

Merge is set union on both components:

$$
(A_1,R_1) \sqcup (A_2,R_2)
=
(A_1 \cup A_2, R_1 \cup R_2).
$$

Union is commutative, associative, and idempotent. The semantics are hidden in
what the dots mean. A concurrent add has a dot the remover did not observe, so
it survives. A later remove that has observed that dot can remove it.

This is why CRDTs often look wasteful at first. They keep metadata because the
metadata is the missing causal evidence. If you delete tombstones before all
relevant replicas have learned about the deletion, an old add can come back
from the network and resurrect the value. Garbage collection is possible, but
it requires knowing a causal stability frontier, not merely wishing metadata
away.

## Monotonicity Is the Larger Pattern

CRDTs are one family inside a bigger idea: coordination is often a tax paid for
non-monotonicity.

The CALM principle connects consistency and logical monotonicity. In the CIDR
Bloom paper, Alvaro, Conway, Hellerstein, and Marczak explain that monotonic
programs can tolerate message reordering and delay because new information
does not revoke earlier conclusions.[^calm-cidr] The later CACM article states
the theorem in its clean form: a program has a consistent, coordination-free
distributed implementation if and only if it is monotonic.[^calm-cacm]

That sentence is worth sitting with.

Counting all current votes is not monotonic unless you know when all votes have
arrived. "No path exists" is not monotonic because a late edge can create the
path. "This username is globally unused" is not monotonic because a hidden
replica may already have assigned it. These computations need a boundary, a
wait, a lease, a lock, a quorum, a transaction, or some other coordination
device.

By contrast, "this add event happened" is monotonic. "This remove observed
these dots" is monotonic. "The maximum timestamp under this total order is X"
is monotonic with respect to the timestamp lattice, though the product meaning
may be questionable. "The set of facts I have heard" is monotonic.

Conway et al.'s BloomL work makes this connection explicit by putting lattices
into a distributed programming language.[^blooml] Instead of representing every
growing fact as a set, programs can use richer monotone types: counters,
thresholds, maps, and other semilattice-valued objects. This is the bridge from
CRDTs as data structures to CRDTs as a programming discipline.

## The Boundary Is Semantic, Not Fashionable

CRDTs are sometimes sold as if they make consistency problems disappear. They
do not. They move the problem from runtime coordination into type design.

If your invariant is monotone, that is a win. A local-first editor, offline
annotation tool, collaborative whiteboard, shopping cart, unread marker, tag
set, or telemetry accumulator can often accept local writes and merge later.
Kleppmann and Beresford's JSON CRDT work shows how far this idea can be pushed:
nested maps and lists can be given formal merge semantics so concurrent edits
are not simply lost.[^json]

If your invariant is non-monotone, the algebra will not save you. "Balance must
never go below zero" is not preserved by two disconnected withdrawals unless
you pre-allocate escrow, coordinate, or weaken the invariant. "Only one user may
own this handle" needs coordination or a partitioned naming scheme. "The final
document must contain exactly one title" requires either a deterministic
conflict representation or a coordinated choice.

Bailis et al.'s work on highly available transactions is useful here because it
does not reduce the design space to a slogan. Some transactional and replica
semantics are compatible with high availability; serializability, snapshot
isolation, and repeatable read are not achievable with high availability under
partitions.[^hat] The interesting work is to identify which guarantees your
application actually needs and where coordination is intrinsic rather than
incidental.

## A Design Review for Merge

When I look at collaborative or offline-capable software, I now want a merge
design review before I want a UI mockup.

**What is the information order?** If state grows, what does "more information"
mean? More dots, larger counters, longer causal frontiers, larger version
vectors, more facts, stronger lower bounds?

**What are the laws?** Can the merge be applied in any order, in any batching,
and more than once? If not, the network schedule is part of the product.

**What is the conflict representation?** Does the system preserve concurrent
intentions, choose one, expose both, or silently collapse them? Every answer is
a product decision.

**What metadata proves causality?** If deletion, undo, move, or uniqueness is
involved, what evidence makes the operation safe? What can be garbage-collected,
and only after which replicas have advanced?

**Which invariants are non-monotone?** These are the places where you either
coordinate, redesign the invariant, pre-allocate rights, or accept anomalies.

**Where is the human in the loop?** A CRDT can preserve concurrent edits, but it
does not guarantee that the merged document is beautiful, legal, balanced, or
meaningful. Convergence is a database property. Usefulness is a product
property.

The best merge functions feel boring when they run. That boringness is earned.
It comes from choosing a shape of state where disorder is harmless.

In distributed systems, you do not get to choose whether time is messy. You
only get to choose whether your data type has made peace with it.

## Source Notes

[^shapiro]: Marc Shapiro, Nuno Preguica, Carlos Baquero, and Marek Zawirski, ["Conflict-Free Replicated Data Types"](https://link.springer.com/chapter/10.1007/978-3-642-24550-3_29), SSS 2011. The broader technical report is ["A comprehensive study of Convergent and Commutative Replicated Data Types"](https://inria.hal.science/inria-00555588/en/).

[^calm-cidr]: Peter Alvaro, Neil Conway, Joseph M. Hellerstein, and William R. Marczak, ["Consistency Analysis in Bloom: a CALM and Collected Approach"](https://www.cidrdb.org/cidr2011/Papers/CIDR11_Paper35.pdf), CIDR 2011.

[^calm-cacm]: Joseph M. Hellerstein and Peter Alvaro, ["Keeping CALM: When Distributed Consistency Is Easy"](https://arxiv.org/pdf/1901.01930), CACM 2019 author version.

[^blooml]: Neil Conway, William R. Marczak, Peter Alvaro, Joseph M. Hellerstein, and David Maier, ["Logic and Lattices for Distributed Programming"](https://www.neilconway.org/docs/socc2012_bloom_lattices.pdf), SoCC 2012.

[^json]: Martin Kleppmann and Alastair R. Beresford, ["A Conflict-Free Replicated JSON Datatype"](https://arxiv.org/abs/1608.03960), IEEE TPDS 2017.

[^hat]: Peter Bailis, Aaron Davidson, Alan Fekete, Ali Ghodsi, Joseph M. Hellerstein, and Ion Stoica, ["Highly Available Transactions: Virtues and Limitations"](https://www.vldb.org/pvldb/vol7/p181-bailis.pdf), VLDB 2014.
