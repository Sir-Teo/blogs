---
layout: post
title: "The Vacuum Has a Horizon"
description: "MVCC makes reads and writes pass each other by keeping old row versions. Vacuum can clean only behind the oldest snapshot that might still see them."
date: 2026-06-18 06:00:00 -0400
categories: software-engineering
tags: [mvcc, vacuum, postgresql, storage-engines, databases, snapshots, concurrency-control]
excerpt: "A long read transaction is not just a query. In an MVCC engine it is a promise to keep some old row versions alive until the reader lets go."
---

A long query can occupy disk without writing a byte.

That sentence sounds wrong if the query is a `SELECT`. It does not insert rows.
It does not update indexes. It may not even spill to disk. But in a
multiversion storage engine, a read can hold the past open. While the reader's
snapshot is alive, row versions that are dead to the present may still be
visible to that reader.

This is the quieter cost of MVCC.

PostgreSQL's documentation states the nice half first: each SQL statement sees
a snapshot of data, and MVCC lets reads avoid conflicting with writes in the
ordinary case.[^pg-mvcc] That is the bargain that makes many database systems
pleasant to operate under concurrency. Writers append new row versions instead
of editing the only copy in place. Readers pick the version that was visible at
their snapshot.

The second half is an accounting rule:

```text
if a snapshot might still see an old version,
the storage engine has not earned the right to forget it
```

The forgetting machine is vacuum.

## The Row Carries Two Clocks

This post is PostgreSQL-flavored, not a complete PostgreSQL implementation
guide. The core idea generalizes to MVCC engines, but the names here follow
PostgreSQL because its documentation is unusually inspectable.

In a PostgreSQL heap tuple, the row header contains fields such as `t_xmin`,
`t_xmax`, and `t_ctid`.[^pg-page] At the level we need:

- `xmin` says which transaction created this row version;
- `xmax` says which transaction deleted or superseded this row version, if any;
- `ctid` can point through an update chain to this version or a newer one.

A simplified visibility rule looks like this:

```js
function visible(version, snapshotXid) {
  return version.born < snapshotXid &&
    (version.dead == null || version.dead >= snapshotXid);
}
```

Read it as: a snapshot sees versions born before the snapshot, unless the
version was already deleted before the snapshot.

Now suppose vacuum is considering a dead version with `dead = d`. Let `h` be
the oldest active snapshot XID. If `d < h`, then every active snapshot started
after the delete. The version cannot be visible to any active snapshot, so it is
safe to remove. If `d >= h`, the oldest snapshot may still need that old
version. Vacuum has to stop at the horizon.

This is why the PostgreSQL vacuuming docs say an updated or deleted row version
must not be removed while it is still potentially visible to other
transactions.[^pg-vacuum] More frequent vacuuming can reduce the pile that
forms between vacuum runs. It cannot pass a pinned horizon.

## Lab: Hold the Snapshot

The lab below simulates one table with a fixed set of logical rows. Each update
creates a new version for a key and marks the previous version dead. Vacuum runs
every few updates and removes a dead version only when its delete XID is older
than the oldest active snapshot.

It deliberately omits most production details: no WAL, no indexes, no page
pruning, no freezing, no transaction aborts, no lock waits, no HOT redirect
items, no visibility map, no autovacuum worker scheduling, no standby conflict
policy. The point is the retention invariant.

<style>
  .mvcc-lab {
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

  .mvcc-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
  }

  .mvcc-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .mvcc-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .mvcc-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .mvcc-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .mvcc-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.68rem;
  }

  .mvcc-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .mvcc-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.42);
  }

  .mvcc-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .mvcc-lab__metric span,
  .mvcc-lab__legend,
  .mvcc-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.78rem;
  }

  .mvcc-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.22rem;
  }

  .mvcc-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 660px;
    max-width: 100%;
    width: 100%;
  }

  .mvcc-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .mvcc-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .mvcc-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .mvcc-lab__note {
    line-height: 1.45;
    margin: 0.75rem 0 0;
  }

  @media (max-width: 560px) {
    .mvcc-lab {
      padding: 0.85rem;
    }

    .mvcc-lab__controls {
      grid-template-columns: 1fr;
    }

    .mvcc-lab canvas {
      height: 860px;
    }
  }
</style>

<div class="mvcc-lab" data-mvcc-vacuum-lab>
  <div class="mvcc-lab__controls">
    <label>
      Logical rows: <output data-value="keys">48</output>
      <input type="range" min="16" max="120" step="4" value="48" data-param="keys">
    </label>
    <label>
      Updates: <output data-value="updates">360</output>
      <input type="range" min="80" max="1200" step="20" value="360" data-param="updates">
    </label>
    <label>
      Hot update share: <output data-value="hotShare">74%</output>
      <input type="range" min="0" max="95" step="5" value="74" data-param="hotShare">
    </label>
    <label>
      Snapshot hold: <output data-value="readerHold">320</output>
      <input type="range" min="0" max="520" step="20" value="320" data-param="readerHold">
    </label>
    <label>
      Vacuum interval: <output data-value="vacuumEvery">24</output>
      <input type="range" min="4" max="90" step="2" value="24" data-param="vacuumEvery">
    </label>
    <label>
      Page capacity: <output data-value="pageSlots">96</output>
      <input type="range" min="32" max="192" step="8" value="96" data-param="pageSlots">
    </label>
    <label>
      Seed: <output data-value="seed">41</output>
      <input type="range" min="1" max="9999" step="1" value="41" data-param="seed">
    </label>
  </div>
  <div class="mvcc-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="660" aria-label="MVCC vacuum simulator showing version chains, cleanup horizon, and retained dead tuples over time"></canvas>
  <div class="mvcc-lab__legend">
    <span><i style="background:#0f766e"></i> Live version</span>
    <span><i style="background:#b45309"></i> Dead but pinned</span>
    <span><i style="background:#be123c"></i> Reclaimable</span>
    <span><i style="background:#7c3aed"></i> Oldest snapshot</span>
    <span><i style="background:#2563eb"></i> Current time</span>
  </div>
  <p class="mvcc-lab__note">
    Deterministic simulation. The audit replays active snapshots across every
    vacuum event and fails if a version visible to any active snapshot is
    removed.
  </p>
</div>

<script defer src="{{ '/assets/js/mvcc-vacuum-lab.js?v=20260618c' | relative_url }}"></script>

At the default setting, there are `48` logical rows and `360` updates. The long
reader starts at XID `74` and is still active at the end. Vacuum runs `15`
times. It reclaims `72` old versions whose delete XIDs are safely before the
reader's snapshot, but it must retain `288` dead versions that were superseded
after the reader began.

The final table has `336` physical versions for `48` logical rows: exactly
`7.00x` version bloat in this toy model. A current read finds the newest
version in one step on average. The old snapshot averages `7.00` version checks
and the hottest key requires `44`.

Turn **Snapshot hold** to `off` and the same update stream ends with `48`
versions. Vacuum reclaims all `360` superseded versions. The writes did not
change. The reader did.

You can reproduce the audit from Node:

```js
const lab = require("./assets/js/mvcc-vacuum-lab.js");
const EXPECTED_SCENARIO_SHAPE = [
  "1:no reader, cool keys:reader=free:versions=32:pinned=0:bloat=1.00:reclaimed=180:avg=1.00:max=1:horizon=182:vacuumRuns=15:invalid=0:4/4",
  "2:hot keys, long reader:reader=held:versions=176:pinned=144:bloat=5.50:reclaimed=36:avg=5.50:max=36:horizon=38:vacuumRuns=15:invalid=0:4/4",
  "3:larger table, long reader:reader=held:versions=392:pinned=336:bloat=7.00:reclaimed=84:avg=7.00:max=49:horizon=86:vacuumRuns=15:invalid=0:4/4",
  "4:larger table, free horizon:reader=free:versions=80:pinned=0:bloat=1.00:reclaimed=520:avg=1.00:max=1:horizon=522:vacuumRuns=13:invalid=0:4/4"
];
const EXPECTED_CONTRAST_SHAPE = [
  "1:base=default, no reader:48/0/1.00/360:held=default, pinned reader:336/288/7.00/72:failed=none:11/11"
];
const EXPECTED_CASES = EXPECTED_SCENARIO_SHAPE.length + EXPECTED_CONTRAST_SHAPE.length;
const EXPECTED_CHECKS = 27;

function sameList(actual, expected) {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function scenarioShape(row, index) {
  return `${index + 1}:${row.label}:reader=${row.readerActiveAtEnd ? "held" : "free"}:` +
    `versions=${row.versions}:pinned=${row.pinned}:bloat=${row.bloat.toFixed(2)}:` +
    `reclaimed=${row.reclaimed}:avg=${row.avgReadSteps.toFixed(2)}:max=${row.maxReadSteps}:` +
    `horizon=${row.horizon}:vacuumRuns=${row.vacuumRuns}:invalid=${row.invalidRemovals}:` +
    `${row.passedChecks}/${row.totalChecks}`;
}

function contrastShape(row, index) {
  return `${index + 1}:base=${row.base.label}:` +
    `${row.base.versions}/${row.base.pinned}/${row.base.bloat.toFixed(2)}/${row.base.reclaimed}:` +
    `held=${row.held.label}:` +
    `${row.held.versions}/${row.held.pinned}/${row.held.bloat.toFixed(2)}/${row.held.reclaimed}:` +
    `failed=${row.failedChecks.join("|") || "none"}:${row.passedChecks}/${row.totalChecks}`;
}

const audit = lab.auditMvccVacuumLab();
const shape = {
  comparisons: audit.comparisons.map(contrastShape),
  scenarios: audit.cases.map(scenarioShape)
};
const auditShape = {
  comparisons: audit.comparisons.length,
  scenarioRows: audit.cases.length,
  passed: audit.passed,
  total: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks
};
const shapeErrors = [];
if (!sameList(shape.scenarios, EXPECTED_SCENARIO_SHAPE)) {
  shapeErrors.push({ name: "scenarios", actual: shape.scenarios, expected: EXPECTED_SCENARIO_SHAPE });
}
if (!sameList(shape.comparisons, EXPECTED_CONTRAST_SHAPE)) {
  shapeErrors.push({
    name: "comparisons",
    actual: shape.comparisons,
    expected: EXPECTED_CONTRAST_SHAPE
  });
}
const failedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const failedComparisons = audit.comparisons.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (!audit.ok || failedCases.length || failedComparisons.length ||
    shapeErrors.length ||
    auditShape.total !== EXPECTED_CASES ||
    auditShape.totalChecks !== EXPECTED_CHECKS ||
    audit.passed !== audit.total || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    failures: audit.failures,
    failedCases,
    failedComparisons,
    shapeErrors,
    auditShape
  }, null, 2));
}

console.log(`${audit.passed}/${audit.total} audit cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`);
console.table(audit.cases.map((row) => ({
  scenario: row.label,
  reader: row.readerActiveAtEnd ? "held" : "free",
  versions: row.versions,
  pinned: row.pinned,
  bloat: row.bloat.toFixed(2),
  reclaimed: row.reclaimed,
  avgRead: row.avgReadSteps.toFixed(2),
  invalidRemovals: row.invalidRemovals
})));

const contrast = audit.comparisons[0];
console.table([contrast.base, contrast.held].map((row) => ({
  scenario: row.label,
  versions: row.versions,
  pinned: row.pinned,
  bloat: row.bloat.toFixed(2),
  reclaimed: row.reclaimed,
  maxRead: row.maxReadSteps
})));
```

The first table exercises four visibility-safety cases. The second table holds
the update stream fixed and changes only the snapshot horizon, which is the
claim the lab is meant to isolate. Together the sweep passed 27/27 named
checks: finite trace metrics, one live version per logical row, sane vacuum
horizons, active-snapshot visibility preservation on every vacuum replay, and
the pinned-reader contrast that retains more versions, increases bloat, and
reclaims fewer obsolete versions.

The source is intentionally small:
[`assets/js/mvcc-vacuum-lab.js`]({{ '/assets/js/mvcc-vacuum-lab.js' | relative_url }}).

## Why The Wall Is Real

The safe vacuum rule is not a tuning superstition. It is a proof obligation.

Let active snapshots be $$s_1, \ldots, s_n$$ and let
$$h = \min_i s_i$$. A dead version with delete XID $$d$$ can be removed if
$$d < h$$.

For every active snapshot $$s_i$$:

```text
d < h <= s_i
```

So the delete happened before that snapshot. Under the simplified visibility
rule, the old version is not visible to any active reader. Removing it cannot
change any active snapshot's answer.

For a version with $$d \ge h$$, the oldest snapshot may still see it. If the
version was born before $$h$$ and deleted at or after $$h$$, removing it would
change that snapshot. The engine can sometimes use more detailed information to
prune within a page or collapse update chains. PostgreSQL's HOT optimization,
for example, can avoid new index entries for certain updates and can remove
intermediate versions that are no longer visible to anyone.[^pg-hot] But the
global rule remains conservative: do not remove the past while some active
reader may still live there.

This is also why the operational phrase "dead tuples" is slightly misleading.
Some dead tuples are dead to the present. They are not dead to every contract
the database has already signed.

## The Horizon Has More Than One Owner

The oldest snapshot does not have to be a dramatic analytical query. PostgreSQL
lists long-running open transactions as one thing to end when old XIDs become a
problem; it specifically points operators toward `backend_xid` and
`backend_xmin` age in `pg_stat_activity`.[^pg-wrap] An application that opens a
transaction, performs a read, and then idles can become a storage-retention
device.

Replication can hold a horizon too. PostgreSQL's `pg_replication_slots` view
documents an `xmin` field: the oldest transaction a slot needs retained, with
vacuum unable to remove tuples deleted by later transactions.[^pg-slots] That
does not make replication slots bad. It makes them real storage contracts. A
forgotten logical slot is a read that never finishes.

Autovacuum is therefore not magic dust. If the horizon is free to move,
autovacuum can keep dead versions from accumulating for too long. If the
horizon is pinned, more vacuum attempts will keep discovering the same
boundary.

There is a second accounting detail: standard `VACUUM` normally marks space for
reuse rather than returning it to the operating system. `VACUUM FULL` rewrites
the table more compactly, but needs a strong table lock and extra temporary
space.[^pg-vacuum] If a table grew because a horizon was pinned, the first fix
is usually to release the horizon and let normal cleanup catch up. Shrinking the
file is a separate question.

## What I Would Watch

For a PostgreSQL system with update-heavy tables, the run log I want is not just
"autovacuum is on." I want the oldest active horizons:

```sql
select pid, state, age(backend_xmin), query
from pg_stat_activity
where backend_xmin is not null
order by age(backend_xmin) desc
limit 10;

select slot_name, active, age(xmin), age(catalog_xmin), restart_lsn
from pg_replication_slots
order by greatest(age(xmin), age(catalog_xmin)) desc nulls last;

select relname, n_live_tup, n_dead_tup, last_autovacuum, autovacuum_count
from pg_stat_user_tables
order by n_dead_tup desc
limit 20;
```

The first query asks who is pinning snapshots. The second asks whether a
replication slot is pinning tuple or catalog history. The third asks where the
storage bill is showing up. PostgreSQL's statistics view exposes estimated live
and dead row counts, plus vacuum and autovacuum timestamps and counts, which is
the right level for a first pass.[^pg-stats]

The remediation depends on which contract is legitimate. A long analytical read
may belong on a replica or a bounded snapshot export. An idle transaction may
need a timeout. A logical slot may need a consumer, a rebuild, or deletion. An
update-heavy table may need fillfactor, HOT-friendly indexes, more aggressive
autovacuum settings, partitioning, or a rewrite after the horizon is clear.

The important thing is to name the wall correctly. Vacuum is not failing when it
refuses to erase a version that an active snapshot might still see. It is
keeping the database from lying.

[^pg-mvcc]: PostgreSQL documentation, ["13.1. Introduction"](https://www.postgresql.org/docs/current/mvcc-intro.html). The docs describe PostgreSQL's multiversion model, snapshots, and the fact that reading and writing do not block each other under MVCC.

[^pg-page]: PostgreSQL documentation, ["66.6. Database Page Layout"](https://www.postgresql.org/docs/current/storage-page-layout.html). The heap tuple header table documents fields including `t_xmin`, `t_xmax`, and `t_ctid`.

[^pg-vacuum]: PostgreSQL documentation, ["24.1. Routine Vacuuming"](https://www.postgresql.org/docs/current/routine-vacuuming.html). The docs explain that updates and deletes leave old row versions in place while they may be visible, and compare standard `VACUUM` with `VACUUM FULL`.

[^pg-hot]: PostgreSQL documentation, ["66.7. Heap-Only Tuples (HOT)"](https://www.postgresql.org/docs/current/storage-hot.html). HOT updates can avoid new index entries in suitable cases and can remove intermediate row versions that are no longer visible to anyone.

[^pg-wrap]: PostgreSQL documentation, ["24.1.5. Preventing Transaction ID Wraparound Failures"](https://www.postgresql.org/docs/current/routine-vacuuming.html#VACUUM-FOR-WRAPAROUND). The recovery checklist calls out long-running open transactions with old `backend_xid` or `backend_xmin`, and old replication slots with large `xmin` or `catalog_xmin`.

[^pg-slots]: PostgreSQL documentation, ["53.20. pg_replication_slots"](https://www.postgresql.org/docs/current/view-pg-replication-slots.html). The `xmin` and `catalog_xmin` columns describe retention horizons that constrain vacuum.

[^pg-stats]: PostgreSQL documentation, ["27.2. The Cumulative Statistics System"](https://www.postgresql.org/docs/current/monitoring-stats.html). The `pg_stat_all_tables` view includes estimated live and dead tuple counts and vacuum/autovacuum timestamps and counts.
