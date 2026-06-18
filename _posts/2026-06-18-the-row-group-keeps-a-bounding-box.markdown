---
layout: post
title: "The Row Group Keeps a Bounding Box"
description: "Zone maps and data-skipping indexes do not find rows. They prove that whole row groups cannot match a predicate, and their power comes from physical order."
date: 2026-06-18 07:31:00 -0400
categories: data-systems
tags: [zone-maps, column-stores, parquet, brin-indexes, data-skipping, query-processing, databases]
excerpt: "A min/max summary is a tiny negative proof: if a predicate cannot intersect a row group's bounds, the engine can refuse to read that group."
---

A columnar scan has two separate ways to say no.

The first is vertical:

```text
the query does not need this column
```

That is the basic column-store bargain. Abadi, Boncz, Harizopoulos, Idreos, and
Madden describe the physical layout difference directly: a column-store can
read just the attributes needed by an analytic query, whereas a row-store block
carries surrounding attributes too.[^columnstores]

The second no is horizontal:

```text
the query cannot match this row group
```

That is the zone-map bargain. Store a small summary for a block of adjacent
rows. For an ordered column, the summary can be as plain as:

```text
min_value
max_value
```

Then a predicate becomes a negative proof. For `x BETWEEN lo AND hi`, a row
group can be skipped when:

```text
group.max_x < lo OR group.min_x > hi
```

For a conjunction over several columns, it is enough for any filtered column to
prove disjointness. If the time interval misses, skip. If the tenant interval
misses, skip. If no interval misses, read the group and check the rows.

That last sentence is the fine print. A zone map proves absence. It does not
prove presence.

## The Index Is Lossy On Purpose

DuckDB's performance guide says it automatically creates zonemaps, also called
min-max indexes, and can skip a row group whose range does not contain the
filter value.[^duckdb] The same guide points out the real lever: ordered data
makes zonemaps more valuable; random data can make them almost useless.

PostgreSQL's BRIN index has the same soul in row-store clothing. BRIN stands
for Block Range Index. Its documentation describes block ranges as physically
adjacent pages with summary information stored per range; min/max operator
classes can store the minimum and maximum value in a range, and the index is
lossy, so the executor rechecks tuples in ranges that survive the summary
test.[^brin]

ClickHouse's data-skipping index docs frame the same mechanism for MergeTree:
skip indexes store metadata about blocks, such as min/max values, sets, or
Bloom filters, so execution can avoid reading blocks guaranteed not to match.
They also warn about the limiting case: if even one matching value exists in a
block, the whole block must still be read.[^clickhouse]

The useful mental model is:

```text
not a row locator
not a B-tree
not a proof that a row exists

a cheap certificate that a block can be absent from the answer
```

## Lab: Make The Boxes Narrow

The lab below builds a synthetic table with two filtered columns:

```text
time    continuous coordinate from 0 to 1
tenant  continuous coordinate from 0 to 1
```

Rows are written into fixed-size row groups. Each group stores four numbers:

```text
min(time), max(time), min(tenant), max(tenant)
```

The query predicate is a time band, a tenant band, or a two-column box. A group
is scanned if its min/max box intersects the predicate box. A group is skipped
only if the summary proves disjointness.

<style>
  .zone-lab {
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

  .zone-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  }

  .zone-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .zone-lab__controls input,
  .zone-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .zone-lab__controls select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.05rem;
    padding: 0.25rem 0.45rem;
  }

  .zone-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .zone-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .zone-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.68rem;
  }

  .zone-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .zone-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.42);
  }

  .zone-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .zone-lab__metric span,
  .zone-lab__legend,
  .zone-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.78rem;
  }

  .zone-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.22rem;
    overflow-wrap: anywhere;
  }

  .zone-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 650px;
    max-width: 100%;
    width: 100%;
  }

  .zone-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .zone-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .zone-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .zone-lab__note {
    line-height: 1.45;
    margin: 0.75rem 0 0;
  }

  @media (max-width: 650px) {
    .zone-lab {
      padding: 0.85rem;
    }

    .zone-lab__controls {
      grid-template-columns: 1fr;
    }

    .zone-lab canvas {
      height: 920px;
    }
  }
</style>

<div id="zone-map-pruning-lab" class="zone-lab" data-zone-map-lab>
  <div class="zone-lab__controls">
    <label>
      Rows <output data-value="rows">4096</output>
      <input data-param="rows" type="range" min="1024" max="8192" step="512" value="4096" aria-label="Synthetic table row count">
    </label>
    <label>
      Row group <output data-value="groupSize">128</output>
      <input data-param="groupSize" type="range" min="32" max="512" step="32" value="128" aria-label="Rows per row group">
    </label>
    <label>
      Physical order <output data-value="order">time sort</output>
      <select data-param="order" aria-label="Physical row order">
        <option value="random">random ingest</option>
        <option value="x" selected>time sort</option>
        <option value="y">tenant sort</option>
        <option value="z">z-order sort</option>
      </select>
    </label>
    <label>
      Predicate <output data-value="predicate">time + tenant box</output>
      <select data-param="predicate" aria-label="Query predicate shape">
        <option value="x">time band</option>
        <option value="y">tenant band</option>
        <option value="box" selected>time + tenant box</option>
      </select>
    </label>
    <label>
      Predicate width <output data-value="width">12%</output>
      <input data-param="width" type="range" min="3" max="35" step="1" value="12" aria-label="Predicate width">
    </label>
    <label>
      Outliers <output data-value="outliers">2%</output>
      <input data-param="outliers" type="range" min="0" max="12" step="1" value="2" aria-label="Outlier row rate">
    </label>
    <label>
      Seed <output data-value="seed">37</output>
      <input data-param="seed" type="range" min="1" max="999" step="1" value="37" aria-label="Deterministic simulation seed">
    </label>
  </div>
  <div class="zone-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="650" aria-label="Zone map pruning simulator showing row-group bounding boxes, skipped groups, scanned groups, false positives, and audit checks"></canvas>
  <div class="zone-lab__legend">
    <span><i style="background:#2563eb"></i>Scanned groups</span>
    <span><i style="background:#94a3b8"></i>Skipped groups</span>
    <span><i style="background:#0f766e"></i>Matching rows / predicate</span>
    <span><i style="background:#b45309"></i>False-positive scanned groups</span>
  </div>
  <p class="zone-lab__note">
    The data and ordering are synthetic. The audit checks that every skipped
    row group truly contains no matching row, that bounding boxes contain their
    rows, and that scan accounting balances.
  </p>
</div>

<script defer src="{{ '/assets/js/zone-map-pruning-lab.js?v=20260618c' | relative_url }}"></script>

With the default two-column predicate, `4096` rows, and `128` rows per group,
the same logical table gives these deterministic outcomes:

| Physical order | Groups scanned | Rows skipped | Matching rows | False-positive groups |
| --- | ---: | ---: | ---: | ---: |
| random ingest | 32 / 32 | 0.0% | 84 | 1 |
| time sort | 5 / 32 | 84.4% | 84 | 0 |
| tenant sort | 5 / 32 | 84.4% | 84 | 0 |
| z-order sort | 4 / 32 | 87.5% | 84 | 2 |

The exported audit is reproducible from Node. It reports 17 named checks: four
correctness invariants for each synthetic layout, plus one aligned row-group-size
comparison.

```js
const lab = require("./assets/js/zone-map-pruning-lab.js");
const EXPECTED_CASES = 4;
const EXPECTED_COMPARISONS = 1;
const EXPECTED_ROWS = 5;
const EXPECTED_CHECKS = 17;
const EXPECTED_CHECK_NAMES = [
  "no-skipped-matching-group",
  "rows-in-unit-square",
  "scan-accounting",
  "zone-boxes-bound-rows"
];
const EXPECTED_CASE_SHAPE = [
  "box predicate random ingest:random:box:32:32:4096:0:84:1:4",
  "box predicate z-order:z:box:4:32:512:87.5:84:2:4",
  "tenant band with outliers:y:y:3:32:768:90.6:468:0:4",
  "time band sorted by time:x:x:4:32:256:87.5:165:0:4"
];
const EXPECTED_COMPARISON_SHAPE = [
  "smaller row groups read no more rows for aligned range:256:512:64:384:1"
];

const audit = lab.auditZoneMapLab();
const failed = audit.details.filter((row) => !row.passed || row.passedChecks !== row.totalChecks);
const auditShape = {
  caseChecks: audit.cases.map((row) => [
    row.label,
    row.order,
    row.predicate,
    row.scannedGroups,
    row.groups,
    row.rowsRead,
    Number((row.skipRate * 100).toFixed(1)),
    row.matchRows,
    row.falsePositiveGroups,
    row.totalChecks
  ].join(":")).sort(),
  cases: audit.cases.length,
  checkNames: Array.from(new Set(audit.cases.flatMap(
    (row) => row.checks.map((check) => check.name)
  ))).sort(),
  comparisonChecks: audit.comparisons.map((row) => [
    row.label,
    row.coarseGroupSize,
    row.coarseRowsRead,
    row.fineGroupSize,
    row.fineRowsRead,
    row.totalChecks
  ].join(":")).sort(),
  comparisons: audit.comparisons.length,
  monotone: audit.monotone,
  passed: audit.passed,
  total: audit.total,
  totalChecks: audit.totalChecks
};
if (auditShape.cases !== EXPECTED_CASES ||
    auditShape.comparisons !== EXPECTED_COMPARISONS ||
    auditShape.total !== EXPECTED_ROWS ||
    auditShape.totalChecks !== EXPECTED_CHECKS ||
    JSON.stringify(auditShape.caseChecks) !== JSON.stringify(EXPECTED_CASE_SHAPE) ||
    JSON.stringify(auditShape.checkNames) !== JSON.stringify(EXPECTED_CHECK_NAMES) ||
    JSON.stringify(auditShape.comparisonChecks) !== JSON.stringify(EXPECTED_COMPARISON_SHAPE)) {
  throw new Error("unexpected audit size: " + JSON.stringify(auditShape));
}
const summary =
  `${audit.passed}/${audit.total} audit rows and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (failed.length || !audit.ok || audit.passed !== audit.total || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    summary,
    errors: audit.errors,
    failed,
    auditShape
  }, null, 2));
}

console.table(audit.cases.map((row) => ({
  scenario: row.label,
  order: row.order,
  predicate: row.predicate,
  groups: String(row.scannedGroups) + "/" + row.groups,
  rowsRead: row.rowsRead,
  skipPct: Number((row.skipRate * 100).toFixed(1)),
  matches: row.matchRows,
  falsePositiveGroups: row.falsePositiveGroups,
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
console.table(audit.comparisons);
console.log(summary);
```

Those checks are deliberately negative: skipped groups must contain no matching
rows, min/max boxes must contain their rows, and the scan accounting must
balance. The extra comparison checks that smaller aligned row groups do not read
more rows than a coarser grouping on the same range query.

The random layout is the cautionary case. Each group contains a little bit of
almost everything, so its min/max box is wide. The zone maps are correct and
nearly useless.

The sorted layouts do not change the rows. They change the grouping. Once
neighboring rows have similar values, the boxes shrink, and disjointness becomes
easy to prove.

## Why Outliers Are Expensive

One stray value can widen a group summary. If a group is otherwise tight in
time but contains one old event, `min(time)` moves left. If it contains one
tenant from the other side of the table, `max(tenant)` moves up. The summary is
still true, but it is less selective.

This is why "mostly ordered" is an empirical statement, not a vibe. It depends
on:

```text
row-group size
insert order
sort key
late-arriving records
updates or rewrites
predicate shape
outlier distribution
```

Move **Outliers** up in the lab. The group boxes get fatter. Move **Row group**
up. Each summary covers more rows, so it tends to cover more of the domain.
Move **Predicate width** up. A wider query is harder to prove absent from a
group.

None of those effects is a bug. They are the price of using a tiny summary
instead of a row-level index.

## Row Groups, Pages, And Granules

Different systems put the summary at different physical scales.

Parquet's page-index documentation says earlier format versions stored
statistics in column metadata and data page headers, which meant a reader had
to touch page headers to decide whether pages could be skipped. The page index
adds per-column structures: a `ColumnIndex` for locating pages based on column
values and an `OffsetIndex` for navigating by row index.[^parquet]

PostgreSQL BRIN summarizes page ranges. Its `pages_per_range` parameter sets
the tradeoff: smaller ranges mean a larger index and more precise summaries;
larger ranges mean less metadata and less precision.[^brin]

ClickHouse skip indexes summarize blocks at a configurable granularity.
DuckDB's docs talk in terms of row groups. The names differ, but the invariant
is the same:

```text
summary range too wide -> fewer blocks skipped
summary range tighter  -> more blocks skipped, more metadata or more ordering work
```

That is the whole machine.

## The Multicolumn Trap

One sort order cannot perfectly serve every predicate.

Sorting by time makes time ranges narrow. If most queries are `WHERE time
BETWEEN ...`, that is excellent. If queries often ask for one tenant across all
time, a pure time sort may leave every tenant range broad.

Sorting by tenant flips the tradeoff. Z-order or other space-filling layouts
try to preserve locality across several dimensions, but they are compromises.
They can improve two-dimensional boxes while being less perfect for a single
dominant column.

The lab's z-order setting is not a production-quality clustering algorithm. It
is a visual reminder that physical order is part of the index. The summary
stores only min and max; the layout decides whether those numbers are useful.

## What To Ask Before Trusting The Skip

A data-skipping index is worth inspecting with concrete workload questions:

```text
Which predicates are common and selective?
Are those predicates correlated with physical order?
How many rows or pages does one summary cover?
How often do outliers widen the summary?
Are late records reclustered, compacted, or left in place?
Is the filter a range, equality, set membership, or text search?
How many false-positive blocks survive and still need row checks?
```

The last question is the one that keeps the mental model honest. The skipped
groups are victories. The scanned groups are only candidates.

A row-group min/max box is a small negative proof. It does not find the answer.
It prevents the engine from reading places where the answer cannot be.

The simulator source is in
[`assets/js/zone-map-pruning-lab.js`]({{ '/assets/js/zone-map-pruning-lab.js' | relative_url }}).

[^columnstores]: Daniel Abadi, Peter Boncz, Stavros Harizopoulos, Stratos Idreos, and Samuel Madden, ["The Design and Implementation of Modern Column-Oriented Database Systems"](https://www.cs.umd.edu/~abadi/papers/abadi-column-stores.pdf), *Foundations and Trends in Databases*, 2012.

[^duckdb]: DuckDB documentation, ["Indexing"](https://duckdb.org/docs/current/guides/performance/indexing), especially the sections on zonemaps and ordering.

[^brin]: PostgreSQL documentation, ["BRIN Indexes: Introduction"](https://www.postgresql.org/docs/16/brin-intro.html).

[^clickhouse]: ClickHouse documentation, ["Use data skipping indices where appropriate"](https://clickhouse.com/docs/best-practices/use-data-skipping-indices-where-appropriate).

[^parquet]: Apache Parquet documentation, ["Page Index"](https://parquet.apache.org/docs/file-format/pageindex/).
