---
layout: post
title: "Two Clean Snapshots Can Break the World"
description: "Database isolation levels are not adjectives about safety. They are claims about which shapes of history are allowed to exist."
date: 2026-06-13 21:35:00 -0400
categories: software-engineering
series: distributed-systems
tags: [database-isolation, serializability, snapshot-isolation, mvcc, concurrency-control, software-engineering]
excerpt: "Snapshot isolation feels serial because every transaction sees a clean past. The trouble is that two clean pasts can assemble a future no serial order could have produced."
---

The dangerous database bugs are often polite.

No crash. No deadlock. No stack trace. Every transaction looked at a consistent
world, made a reasonable local decision, and committed successfully.

Then the invariant was gone.

That is why isolation levels should not be read as a ladder of adjectives:
"read committed", "repeatable read", "serializable". The useful question is
more geometric:

```text
Which shapes of time is the database allowed to produce?
```

Serializable isolation is the cleanest answer. Concurrent transactions may
overlap physically, but the committed result must be equivalent to some serial
order. Maybe `T1` happened before `T2`. Maybe `T2` happened before `T1`. If no
such order exists, the history is not serializable.

That definition is stricter than "each transaction saw a consistent snapshot."
Snapshot isolation can make every reader happy while the combined history is
still impossible.

## Two True Stories, One Broken Invariant

The classic example is write skew.

Alice and Bob are both on call. The rule is that at least one doctor must remain
on call. Alice's transaction checks that Bob is on call, then marks Alice as
reserve. Bob's transaction checks that Alice is on call, then marks Bob as
reserve.

Individually, each transaction is reasonable. If Alice runs alone, Bob remains.
If Bob runs alone, Alice remains.

Together, under snapshot isolation, they can both read the old snapshot:

```text
Alice sees Bob on call -> Alice leaves.
Bob sees Alice on call -> Bob leaves.
```

No row was written by both transactions. There is no dirty read. There is no
non-repeatable read inside either transaction. And yet the final state has nobody
on call.

This is the quiet part of multiversion concurrency control: a clean snapshot is
not the same thing as a serializable history.

The SQL-92 isolation names were famously defined through phenomena such as dirty
reads, non-repeatable reads, and phantoms. Berenson, Bernstein, Gray, Melton,
and the O'Neils showed that those phenomena do not fully characterize real
isolation implementations, especially multiversion ones, and introduced
snapshot isolation as a distinct level worth reasoning about directly.[^berenson]
Adya later gave a more implementation-independent graph vocabulary for weak
isolation levels.[^adya]

Graphs are the right language because the bug is not in one read or one write.
It is in the cycle.

## Smallest Bad Histories

The lab below simulates three small histories:

1. **Write skew**: two doctors each leave because the other appears on call.
2. **Lost update**: two deposits both read 0 and both write 1.
3. **Predicate write skew**: two reservations both pass the same "empty slot"
   predicate, then insert different rows.

The histories are deliberately tiny. They are not meant to model a whole
database engine. They are meant to isolate the shape of the anomaly.

<style>
  .isolation-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .isolation-lab__controls {
    align-items: end;
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  }

  .isolation-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .isolation-lab__controls select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
  }

  .isolation-lab__check {
    align-items: center;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    display: flex;
    gap: 0.55rem;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
  }

  .isolation-lab__check input {
    accent-color: #0f766e;
    inline-size: 1rem;
  }

  .isolation-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .isolation-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.1rem;
    padding: 0.62rem 0.7rem;
  }

  .isolation-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.35);
  }

  .isolation-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .isolation-lab__metric span,
  .isolation-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .isolation-lab__metric span {
    display: block;
  }

  .isolation-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .isolation-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .isolation-lab__note {
    margin: 0.85rem 0 0;
  }
</style>

<div id="isolation-history-lab" class="isolation-lab" data-isolation-lab>
  <div class="isolation-lab__controls">
    <label>
      History
      <select data-param="scenario">
        <option value="doctors" selected>Write skew: doctors</option>
        <option value="counter">Lost update: counter</option>
        <option value="phantom">Predicate skew: reservations</option>
      </select>
    </label>
    <label>
      Isolation mode
      <select data-param="isolation">
        <option value="read_committed">Read committed schedule</option>
        <option value="snapshot" selected>Snapshot isolation</option>
        <option value="serializable">Serializable SSI</option>
      </select>
    </label>
    <label>
      Recovery
      <span class="isolation-lab__check">
        <input type="checkbox" data-param="retry">
        retry aborted transaction
      </span>
    </label>
  </div>
  <div class="isolation-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="620" aria-label="Transaction isolation simulator showing histories, final state, conflict graph, and serializability diagnosis"></canvas>
  <p class="isolation-lab__note">
    The simulator uses a fixed interleaving: both transactions read before
    either commits. Snapshot isolation aborts same-row write conflicts, but not
    disjoint write skew. Serializable SSI aborts the dangerous read/write cycle.
  </p>
</div>
<script defer src="{{ '/assets/js/isolation-history-lab.js?v=20260614a' | relative_url }}"></script>

Start with **Write skew: doctors** and **Snapshot isolation**.

The final state is impossible to explain by either serial order:

```text
Alice then Bob -> Bob stays on call.
Bob then Alice -> Alice stays on call.
Concurrent SI -> nobody stays on call.
```

The conflict graph shows why. Alice read Bob's old row before Bob wrote it.
Bob read Alice's old row before Alice wrote it. In multiversion terminology,
those are read/write anti-dependencies. Each transaction made a decision using
a version that the other transaction later invalidated.

That pair of anti-dependencies forms a cycle:

```text
T1 -> T2 -> T1
```

The database does not need to know anything about doctors. It only needs to see
that the history cannot be placed on a line.

## Snapshot Isolation Earns Its Popularity

Snapshot isolation is attractive for a reason.

A transaction reads from a stable committed snapshot, so readers do not block
writers and writers do not block readers. Implementations usually prevent two
concurrent transactions from both modifying the same item, so the obvious lost
update case is often blocked. In the lab, switch to **Lost update: counter**.
Snapshot isolation aborts the second writer because both transactions write the
same counter.

That is a lot of practical value.

But the doctor and reservation examples write different rows. Snapshot isolation
does not automatically know that "Alice on call" and "Bob on call" are linked by
one application invariant, or that two different reservation rows belong to the
same capacity constraint.

Fekete, Liarokapis, Elizabeth O'Neil, Patrick O'Neil, and Shasha analyzed when
snapshot-isolated applications are serializable and how nonserializable
executions arise through dependency cycles.[^fekete] Their paper is a useful
antidote to a common folk belief:

```text
If every transaction preserves the invariant alone, concurrent execution must
preserve it too.
```

That is false unless the isolation level lets you compose those local proofs.

## Empty Rows Count as Data

The reservation example is the same bug wearing a different coat.

Two transactions ask:

```sql
SELECT count(*)
FROM reservations
WHERE room = 'A' AND slot = '10:00';
```

Each sees zero. Each inserts a different row. A row-level view of the world says
there was no write/write conflict. A logical view says both transactions wrote
into the set that both transactions had just read.

This is why phantoms are not a weird special case. A predicate read is a read of
a set. If another transaction inserts into that set, the read has been made
stale. Eswaran, Gray, Lorie, and Traiger made this point early with predicate
locks: sometimes the thing you must protect is not an existing record, but a
logical subset of the database.[^predicate]

Indexes make this concrete. A database may approximate predicate protection
with index-range locks, SIREAD locks, or dependency tracking. But the semantic
object is still the predicate.

## SSI Remembers the Cycle

Serializable Snapshot Isolation keeps the pleasant part of snapshot isolation:
readers still see snapshots, and reads need not block writes in the ordinary
case. The extra machinery is conflict memory.

Cahill, Roehm, and Fekete proposed detecting dangerous structures in the
multiversion serialization graph at runtime and aborting a transaction before a
nonserializable history can commit.[^cahill] In the lab, choose
**Serializable SSI** for the doctor or reservation history. The second
transaction aborts. Turn on **retry aborted transaction** and it reruns after
the first transaction has committed, now seeing the current state and making a
safe no-op decision.

PostgreSQL's serializable implementation is an important production example.
Ports and Grittner describe an SSI system that tracks predicate reads with
non-blocking SIREAD locks and emphasizes safe retry: if a transaction is aborted
for a serialization failure, retrying it immediately should not fail again for
the same conflict.[^ports]

That last point matters operationally. Serializable isolation is not "turn on
the strongest level and pretend aborts do not exist." The application contract is:

```text
Run transaction. If serialization failure, retry the whole transaction.
```

Partial retries are not the same thing. Retrying only the final write preserves
the stale decision. The unit of retry is the transaction because the read set is
part of the decision.

## When Time Has No Line

When a production bug smells like "two users both did a valid thing and together
created an invalid thing," look for one of these shapes:

1. The transactions read a shared predicate but wrote different rows.
2. The transactions read each other's future write targets.
3. The invariant lives across rows, accounts, slots, limits, or memberships.
4. The application checks a condition outside the write that enforces it.
5. The retry loop repeats only the write, not the reads that justified it.

There are several good repairs, and they are not interchangeable:

1. Put the invariant into a real database constraint when the database can
   express it.
2. Use a unique index or exclusion constraint when the invariant is a capacity
   or non-overlap rule.
3. Lock the logical thing you are deciding about, not just the row you happen
   to update.
4. Use serializable isolation and retry whole transactions.
5. Treat "no rows returned" as a read of a predicate, not as a read of nothing.

The deepest mistake is to treat isolation as a local property of a transaction.

It is a property of a history.

Serializable means the history has a line you can draw through it.

[^berenson]: Hal Berenson, Philip A. Bernstein, Jim Gray, Jim Melton, Elizabeth J. O'Neil, and Patrick E. O'Neil, ["A Critique of ANSI SQL Isolation Levels"](https://arxiv.org/abs/cs/0701157), SIGMOD 1995.

[^adya]: Atul Adya, ["Weak Consistency: A Generalized Theory and Optimistic Implementations for Distributed Transactions"](https://publications.csail.mit.edu/lcs/pubs/pdf/MIT-LCS-TR-786.pdf), MIT PhD thesis, 1999.

[^fekete]: Alan Fekete, Dimitrios Liarokapis, Elizabeth O'Neil, Patrick O'Neil, and Dennis Shasha, ["Making Snapshot Isolation Serializable"](https://dsf.berkeley.edu/cs286/papers/ssi-tods2005.pdf), ACM Transactions on Database Systems, 2005.

[^predicate]: K. P. Eswaran, J. N. Gray, R. A. Lorie, and I. L. Traiger, ["The Notions of Consistency and Predicate Locks in a Database System"](https://dl.acm.org/doi/10.1145/360363.360369), Communications of the ACM, 1976.

[^cahill]: Michael J. Cahill, Uwe Roehm, and Alan D. Fekete, ["Serializable Isolation for Snapshot Databases"](https://people.eecs.berkeley.edu/~kubitron/courses/cs262a-F13/handouts/papers/p729-cahill.pdf), SIGMOD 2008.

[^ports]: Dan R. K. Ports and Kevin Grittner, ["Serializable Snapshot Isolation in PostgreSQL"](https://drkp.net/papers/ssi-vldb12.pdf), PVLDB 2012.
