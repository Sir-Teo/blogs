---
layout: post
title: "A Cluster Remembers by Overlap"
description: "Replicas do not remember because they agree in spirit. They remember when the next decision is forced to meet the last one."
date: 2026-06-13 19:00:00 -0400
categories: computer-science
tags: [distributed-systems, consensus, paxos, raft, quorums, replication, consistency]
excerpt: "A quorum is not a majority sticker. It is the overlap that makes the next read, leader, or configuration bump into the past."
---

The word quorum has a stiff little ceremonial smell.

It belongs to committees, bylaws, and the minimum number of people required
before a meeting can pretend to be real. In distributed systems the word is more
physical. A quorum is how a cluster prevents the future from walking around the
past.

One replica is easy to understand and easy to lose. It can fail, pause,
partition, reboot, drop messages, or come back with a new disk and an innocent
face. So we spread facts across replicas. Then every future operation has to ask
enough of them that it cannot quietly miss the fact that made the previous
operation count.

Put the invariant on the whiteboard:

```text
past information must intersect future authority
```

Majorities are one way to force that intersection. They are not the only way.
They are just the easiest arithmetic people trust at 3 a.m.

## Start With One Register

Start with one replicated register. There are $$N$$ replicas. A write completes
after reaching $$W$$ replicas. A read consults $$R$$ replicas and returns the
newest version it sees.

For every read to intersect every completed write, we need

$$
R + W > N.
$$

For every completed write to intersect every other completed write, the usual
weighted-voting register rule also requires

$$
2W > N.
$$

Gifford's weighted voting paper framed this in terms of read and write quorums
whose votes must overlap.[^gifford] The idea survives because it is brutally
simple. A read cannot miss the latest write if every possible read quorum shares
at least one replica with every possible write quorum, and that shared replica
can carry a version.

Move the sliders in the lab. It constructs explicit counterexamples when an
intersection rule fails.

<div id="quorum-intersection-lab" class="quorum-intersection-lab" data-quorum-intersection-lab>
  <div class="quorum-intersection-lab__controls">
    <label>
      Replicas: <output data-value="nodes">5</output>
      <input type="range" min="3" max="9" step="1" value="5" data-param="nodes">
    </label>
    <label>
      Read quorum: <output data-value="read">3</output>
      <input type="range" min="1" max="9" step="1" value="3" data-param="read">
    </label>
    <label>
      Write quorum: <output data-value="write">3</output>
      <input type="range" min="1" max="9" step="1" value="3" data-param="write">
    </label>
    <label>
      Paxos phase 1: <output data-value="phase1">3</output>
      <input type="range" min="1" max="9" step="1" value="3" data-param="phase1">
    </label>
    <label>
      Paxos phase 2: <output data-value="phase2">3</output>
      <input type="range" min="1" max="9" step="1" value="3" data-param="phase2">
    </label>
    <label>
      Live replicas: <output data-value="live">3</output>
      <input type="range" min="0" max="9" step="1" value="3" data-param="live">
    </label>
  </div>
  <div class="quorum-intersection-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Quorum intersection simulator showing read-write quorum witnesses, Paxos phase quorum witnesses, and crash availability tradeoffs"></canvas>
  <div class="quorum-intersection-lab__legend">
    <span><i style="background:#be123c"></i> Write quorum</span>
    <span><i style="background:#2563eb"></i> Read quorum</span>
    <span><i style="background:#7c3aed"></i> Paxos phase 2</span>
    <span><i style="background:#d97706"></i> Paxos phase 1</span>
    <span><i style="background:#0f766e"></i> Intersection</span>
  </div>
  <p class="quorum-intersection-lab__note">
    Deterministic quorum arithmetic. The register panel checks the classic
    read/write conditions R+W>N and 2W>N. The Paxos panel checks the
    cross-phase condition Q1+Q2>N used by majority Paxos and generalized by
    Flexible Paxos. Availability numbers assume independent 95% replica
    availability and count how many live replicas each operation needs.
  </p>
</div>
<script defer src="{{ '/assets/js/quorum-intersection-lab.js?v=20260613a' | relative_url }}"></script>

With five replicas and majority quorums, everything is boring in the useful
way. A read quorum of three intersects a write quorum of three. Any two write
quorums of three intersect. The system can lose two replicas and still have
three left.

Now do the tempting, bad thing: set **Read quorum** to 2 and **Write quorum** to
2. The lab draws a stale-read witness. One write can complete on replicas 1 and
2, while a later read can consult replicas 3 and 4 and never see it.

The system did not merely become "a little less consistent." It stopped having
the intersection property that made the latest write observable.

## Paxos Uses the Same Memory Trick

Paxos has a marble-statue reputation, partly deserved. It is about choosing
values while messages wander and machines disappear, not merely reading and
writing versions. Still, the memory trick is the same overlap.

Lamport's "Part-Time Parliament" and "Paxos Made Simple" describe how a value
can be chosen even while processes fail and messages are delayed.[^part-time][^paxos-simple]
The essential safety problem is this:

1. Some value may already have been accepted by enough acceptors to be chosen.
2. A later proposer starts a higher-numbered round.
3. That proposer must learn enough history that it cannot accidentally choose a
   conflicting value.

In classic majority Paxos, both phases use majorities. Any two majorities
intersect, so a later phase-1 quorum must touch an earlier phase-2 quorum. The
later proposer can learn what was previously accepted and preserve safety.

But majority is stronger than the exact requirement. Flexible Paxos observes
that phase-1 quorums do not need to intersect other phase-1 quorums, and phase-2
quorums do not need to intersect other phase-2 quorums. The key requirement is
cross-phase intersection: every phase-1 quorum must intersect every relevant
phase-2 quorum.[^flexible-paxos]

For simple uniform quorum sizes, that means:

$$
Q_1 + Q_2 > N.
$$

Set **Paxos phase 1** to 2 and **Paxos phase 2** to 3 in a five-replica cluster.
The lab draws the failure: a value can be accepted by one phase-2 quorum, and a
later leader can run phase 1 on a disjoint quorum. The new leader asks the
system what it remembers, but asks the wrong witnesses.

Consensus safety is not stored in a leader. It is stored in the impossibility of
missing the past.

## Majority Is a Design Point

Majorities are popular because they collapse several constraints into one easy
rule:

$$
\left\lfloor \frac{N}{2} \right\rfloor + 1.
$$

If every quorum is a majority, any two quorums intersect. With $$N=2f+1$$
replicas, a majority quorum survives $$f$$ crash failures.

That symmetry is kind to operators and implementers. It is also conservative.

In the lab, set **Replicas** to 7, **Paxos phase 1** to 5, and **Paxos phase 2**
to 3. Cross-phase intersection still holds because $$5+3>7$$. Steady-state
phase-2 replication can now run with only three live acceptors, tolerating four
crashes for that operation. But electing a new leader needs five live acceptors,
tolerating only two crashes.

That is a real trade, not a loophole. You bought cheaper steady-state
replication by making recovery and leadership changes harder. Maybe that is
exactly right for a stable-leader system. Maybe it is a terrible bargain in a
fleet with frequent leader churn.

The point is not "use Flexible Paxos everywhere." The point is:

```text
quorum sizes are workload assumptions made executable
```

## Raft Makes the Overlap Feel Ordinary

Raft was designed to be easier to understand than Paxos by decomposing consensus
into leader election, log replication, and safety.[^raft] Its standard form uses
majorities. A leader is elected by a majority, and log entries are committed
after replication to a majority.

The intersection is doing the same work. A committed entry sits on a majority.
A future leader must win a majority. Those two majorities overlap, so a future
leader cannot be elected entirely from servers that missed the committed entry.
Raft adds log freshness rules to make that overlap useful, not merely present.

Raft's joint consensus reconfiguration makes the overlap visible. During a
membership change, the system requires agreement from overlapping old and new
configurations so that a committed entry cannot vanish between cluster shapes.
The mechanism is different from the small register rule, but the invariant has
the same flavor:

```text
the next legitimate configuration must touch the previous legitimate memory
```

## Dynamo-Style Quorums Promise Something Else

Dynamo-style systems use tunable $$N$$, $$R$$, and $$W$$ parameters, but they are
not the same as Paxos.[^dynamo] Dynamo was built for high availability and used
versioning, hinted handoff, sloppy quorums, and application-assisted conflict
resolution. A read/write inequality like $$R+W>N$$ is part of the story, not a
complete linearizability proof for all failure modes.

This is where slogans do real damage.

If a system uses sloppy quorums, a write may be acknowledged by healthy nodes
outside the nominal replica set and repaired later. If the system accepts
concurrent writes, a read may need to return multiple versions. If clocks are
used to pick winners, the quorum math does not rescue you from clock behavior.

The read/write intersection idea remains useful. The contract has changed.
Sometimes the system is not trying to make every read return the latest write.
It is trying to keep accepting writes, expose conflicts later, and let the
application reconcile.

That is not a lesser system. It is a different promise.

## Split Brain Is Authority Without Overlap

A split brain is not caused by a network partition alone. Partitions are just the
weather. Split brain happens when both sides can gather enough authority to make
conflicting decisions.

If a five-node cluster requires three votes to elect a leader, a 2-3 partition
allows only the three-node side to elect. The two-node side can be alive, angry,
and full of logs, but it cannot form a quorum.

If you reduce the election quorum to two, the 2-3 partition can produce two
leaders. You did not discover extra availability. You spent the intersection
that prevented independent authority.

The lab's crash panel is intentionally separate from its safety panels. Being
able to run with fewer live replicas is availability. Making sure two successful
operations cannot miss each other is safety. A quorum choice changes both, but
not in the same direction.

## Linearizability Needs a History Path

Herlihy and Wing's linearizability condition gives one formal way to say a
concurrent object behaves as if each operation took effect at a single instant
between invocation and response.[^linearizability] Quorums do not automatically
give linearizability; protocols do. But quorums often supply the memory that a
linearizable protocol needs.

For a replicated register, the read must see enough write history. For
consensus, later rounds must see enough accepted history. For reconfiguration,
new membership must see enough old membership. For lease protocols, clock and
expiration assumptions must ensure two owners do not both hold valid authority.

Every time the system says "this decision is real," ask:

```text
which future decision is forced to learn that?
```

If the answer is "none," the system has not remembered. It has merely logged.

## Questions Before Choosing Quorums

Before I trust a replicated design, I want to know:

- what operation each quorum authorizes;
- which pairs of quorums must intersect for safety;
- whether the intersection carries version numbers, accepted values, log terms,
  leases, or something else interpretable;
- how many crash failures each operation tolerates;
- whether partitions can create two authorities;
- whether membership changes use overlapping configurations;
- whether "sloppy" or fallback replicas preserve the same contract;
- whether reads are linearizable, monotonic, bounded-stale, or best-effort;
- whether writes can conflict and how conflicts are represented;
- whether the availability target assumes steady state or leader recovery.

A quorum is not a majority sticker on a distributed system. It is a memory path.

If the next decision can walk around the previous decision without touching it,
the system may still be fast, available, and useful. But it is not remembering
the thing you thought it remembered.

## Source Notes

[^gifford]: David K. Gifford, ["Weighted Voting for Replicated Data"](https://dl.acm.org/doi/10.1145/800215.806583), *Proceedings of the Seventh Symposium on Operating System Principles*, 1979. A course-hosted PDF is available from [Cornell](https://www.cs.cornell.edu/courses/cs614/2003sp/papers/Gif79.pdf).

[^part-time]: Leslie Lamport, ["The Part-Time Parliament"](https://www.microsoft.com/en-us/research/publication/part-time-parliament/), *ACM Transactions on Computer Systems*, 1998. DOI: [10.1145/279227.279229](https://dl.acm.org/doi/10.1145/279227.279229).

[^paxos-simple]: Leslie Lamport, ["Paxos Made Simple"](https://www.microsoft.com/en-us/research/publication/paxos-made-simple/), *ACM SIGACT News*, 2001. PDF: [paxos-simple.pdf](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf).

[^flexible-paxos]: Heidi Howard, Dahlia Malkhi, and Alexander Spiegelman, ["Flexible Paxos: Quorum Intersection Revisited"](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2016.25), OPODIS 2016, LIPIcs 70, 2017. Preprint: [arXiv:1608.06696](https://arxiv.org/abs/1608.06696).

[^raft]: Diego Ongaro and John Ousterhout, ["In Search of an Understandable Consensus Algorithm"](https://www.usenix.org/conference/atc14/technical-sessions/presentation/ongaro), USENIX ATC, 2014. The paper site also hosts the [extended version](https://raft.github.io/).

[^dynamo]: Giuseppe DeCandia and coauthors, ["Dynamo: Amazon's Highly Available Key-value Store"](https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store), SOSP, 2007. PDF: [allthingsdistributed.com](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf).

[^linearizability]: Maurice P. Herlihy and Jeannette M. Wing, ["Linearizability: A Correctness Condition for Concurrent Objects"](https://dl.acm.org/doi/10.1145/78969.78972), *ACM Transactions on Programming Languages and Systems*, 1990.
