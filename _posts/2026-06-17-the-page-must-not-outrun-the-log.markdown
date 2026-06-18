---
layout: post
title: "The Page Must Not Outrun the Log"
description: "Write-ahead logging makes durability a recoverable story: before a dirty page reaches disk, the log record that explains it must already be durable."
date: 2026-06-17 10:40:00 -0400
categories: data-systems
tags: [write-ahead-log, crash-recovery, databases, aries, durability, transactions, storage-engines, data-systems]
excerpt: "A dirty page is allowed to be ahead of the database file, but not ahead of the durable log. After a crash, recovery can only replay facts the log remembers."
---

A database page is not allowed to freestyle.

It can sit dirty in memory. It can reach disk before the transaction commits.
It can be rewritten later by a checkpoint. It can contain work that will
eventually be rolled back.

But it must not contain a change whose log record did not survive.

That is the write-ahead part of write-ahead logging:

```text
before the page image reaches stable storage,
the log record that explains that page image must be stable too
```

PostgreSQL's documentation states the operational rule plainly: changes to data
files must be written only after the corresponding WAL records have been
flushed to permanent storage.[^postgres] SQLite's WAL mode gives the same idea
a different physical shape: the database file can remain unchanged while
updates are appended to a WAL file, and a commit is represented by a commit
record in that WAL.[^sqlite]

The shared principle is not "write to a log because logs are fast." It is:

```text
after a crash, every durable byte needs an explanation
```

The log is that explanation.

## The Log Is the Witness

Suppose a transaction changes page `B` from `0` to `20`. The buffer manager may
now have a dirty page in memory:

```text
page B: value 20, pageLSN 4
```

The `pageLSN` says which log record last modified the page. If page `B` is
written to disk, recovery must be able to find log record `4`. Otherwise the
disk contains a fact the log cannot testify about. If that transaction later
turns out to be uncommitted at crash time, recovery also needs the before-image
or logical undo information needed to remove it.

ARIES made this discipline precise and influential.[^aries] It uses log
sequence numbers, pageLSNs, dirty-page tracking, checkpoints, redo, and undo.
One of its memorable ideas is "repeating history": during redo, recovery
reapplies logged actions to reconstruct the state at the instant of crash, then
undoes loser transactions that did not commit.

That can sound backwards. Why redo work you will undo?

Because the disk after a crash is not necessarily a clean committed database.
It is a prefix of flushed pages plus a prefix of flushed log records. Some
uncommitted page writes may have reached disk. Some committed page writes may
not have. The log lets recovery turn that messy physical state into the logical
state promised by durable commits.

## Commit Is a Log Fact First

There are two different questions that people often merge:

1. Has the transaction committed?
2. Have the changed data pages reached their final home?

With WAL, the first can be true before the second. That is the point.

If the commit record is durable, the transaction has a durable claim. Recovery
can redo its page changes even if the main data file missed them before the
crash. If the commit record is not durable, recovery must treat the transaction
as a loser, even if some of its dirty pages reached disk.

So a committed transaction is initially a statement in the log, not necessarily
a set of freshly written database pages.

```text
commit durable in log -> redo can make pages catch up
page durable without log -> recovery has no safe story
```

That second line is the failure mode the lab exposes.

## Lab: Crash the Tiny Engine

The lab below uses a deliberately small ARIES-shaped world. It is not a full
database engine. It has no indexes, locks, physiological logging, compensation
log records, media recovery, torn-page handling, group commit, replication,
checksums, or real fsync behavior.

It has just enough machinery to make the recovery contract visible:

- a fixed log with three transactions;
- four pages, each carrying a value and a `pageLSN`;
- a durable log horizon;
- a page-flush horizon;
- a checkpoint horizon;
- redo of durable update records after the checkpoint;
- undo of transactions whose commit record is not durable.

The default crash has:

```text
durable log LSN: 10
page flush LSN: 8
checkpoint LSN: 5
```

Transaction `T1` committed at LSN 6, so its changes to pages `A` and `C`
survive. Transaction `T2` changed page `B` but never committed, so recovery
undoes it. Transaction `T3` updated page `D` at LSN 10, but its commit at LSN
11 did not reach the durable log, so recovery also undoes it.

The recovered durable state is:

```text
A=10, B=0, C=30, D=0
```

Now turn on unsafe page flushing and let page flushes outrun the durable log.
The page image can contain a change whose log record is gone. Recovery cannot
safely derive the final state from the durable log anymore. That is the
contract breach.

<style>
  .wal-lab {
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

  .wal-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .wal-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .wal-lab__check {
    align-content: center;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    display: grid;
    grid-template-columns: auto 1fr;
    min-height: 2.3rem;
    padding: 0.45rem 0.6rem;
  }

  .wal-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .wal-lab input[type="range"] {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .wal-lab input[type="checkbox"] {
    accent-color: #be123c;
    inline-size: 1rem;
    margin: 0 0.45rem 0 0;
  }

  .wal-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 0.9rem;
  }

  .wal-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .wal-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.35);
  }

  .wal-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .wal-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 740;
    letter-spacing: 0;
    line-height: 1.18;
    margin-bottom: 0.22rem;
    text-transform: uppercase;
  }

  .wal-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.86rem, 2.4vw, 1.02rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .wal-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .wal-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 640px) {
    .wal-lab {
      padding: 0.75rem;
    }

    .wal-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="wal-lab" data-wal-lab>
  <div class="wal-lab__controls">
    <label>
      Durable log LSN <output data-value="durableLsn">10</output>
      <input type="range" data-param="durableLsn" min="0" max="12" step="1" value="10" aria-label="Durable log sequence number">
    </label>
    <label>
      Page flush LSN <output data-value="pageFlushLsn">8</output>
      <input type="range" data-param="pageFlushLsn" min="0" max="12" step="1" value="8" aria-label="Highest log sequence number whose page image may have reached disk">
    </label>
    <label>
      Checkpoint LSN <output data-value="checkpointLsn">5</output>
      <input type="range" data-param="checkpointLsn" min="0" max="12" step="1" value="5" aria-label="Checkpoint log sequence number">
    </label>
    <label class="wal-lab__check">
      <input type="checkbox" data-param="unsafeFlush" aria-label="Allow page flushes ahead of the durable log">
      <span>Allow unsafe page flush</span>
    </label>
  </div>
  <div class="wal-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="640" aria-label="Write-ahead logging recovery simulator showing durable log records, pageLSNs, redo, undo, and WAL violations"></canvas>
  <p class="wal-lab__note" data-note>
    Loading WAL recovery audit.
  </p>
</div>

<script defer src="{{ '/assets/js/wal-recovery-lab.js?v=20260617a' | relative_url }}"></script>

## What the Slider Is Really Moving

The durable log horizon says which facts recovery is allowed to believe after a
crash. In a real system, that boundary depends on write ordering, fsync,
storage hardware, configuration, and failure model. The lab does not simulate
the operating system. It treats the horizon as the contract boundary.

The page-flush horizon says which dirty pages may already be in the database
file. In safe mode the lab caps this at the durable log horizon. That is the
WAL rule. In unsafe mode it deliberately lets page bytes outrun log facts.

The checkpoint horizon says recovery need not redo earlier updates in this toy,
because those pages are assumed to have a stable image. Real ARIES checkpoint
logic is richer: it records transaction and dirty-page information so restart
can do analysis and choose a redo starting point. The slider here is just a
small visible hook for that idea.

The important asymmetry is:

```text
log ahead of page: normal, recoverable
page ahead of log: dangerous, unexplained
```

## Why Redo Then Undo

At first glance, undoing `T3` in the default run looks wasteful. Its update at
LSN 10 is redone, and then the transaction is undone because the commit record
at LSN 11 was not durable.

That is the repeat-history habit. Redo first reconstructs the physical state
described by the durable log. Undo then removes the effects of loser
transactions. In a complete ARIES implementation, undo itself is logged with
compensation log records so recovery can survive another crash while rolling
back. This lab marks undo with synthetic pageLSNs instead of modeling those
records.

The lesson still holds:

```text
redo answers: what logged page actions might be missing from disk?
undo answers: which logged page actions did not belong to durable commits?
```

Those are separate questions.

## The Useful Picture

The database file is not the source of truth during a crash. It is a partially
updated artifact. The log is the witness that makes that artifact interpretable.

This is why the write-ahead rule feels stricter than ordinary buffering:

```text
dirty pages may be early
commit pages may be late
but the log must be able to explain every durable page
```

If the log is ahead, recovery can replay. If an uncommitted change reached a
page, recovery can undo. If a committed change missed the page, recovery can
redo. If the page is ahead of the log, the system has let the evidence leave
the courthouse before the testimony was recorded.

That is the line WAL draws.

[^postgres]: PostgreSQL documentation, ["Write-Ahead Logging (WAL)"](https://www.postgresql.org/docs/current/wal-intro.html), accessed June 2026.

[^sqlite]: SQLite documentation, ["Write-Ahead Logging"](https://sqlite.org/wal.html), especially the description of commits as WAL records and checkpointing changes back into the database file.

[^aries]: C. Mohan, Don Haderle, Bruce Lindsay, Hamid Pirahesh, and Peter Schwarz, ["ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging"](https://web.stanford.edu/class/cs345d-01/rl/aries.pdf), *ACM Transactions on Database Systems* 17(1), 1992. DOI: [10.1145/128765.128770](https://dl.acm.org/doi/10.1145/128765.128770).
