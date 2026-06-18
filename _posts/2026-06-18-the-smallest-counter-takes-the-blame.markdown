---
layout: post
title: "The Smallest Counter Takes the Blame"
description: "Space-Saving finds stream heavy hitters by replacing the smallest counter and carrying its value forward as an explicit error receipt."
date: 2026-06-18 08:36:00 -0400
categories: computer-science
series: streaming-algorithms
tags: [space-saving, heavy-hitters, streaming-algorithms, top-k, frequency-estimation, data-structures]
excerpt: "Space-Saving is a deterministic heavy-hitter algorithm with a useful audit trail: each monitored item has an upper count and a stored error that says how much blame came from previous occupants of the same counter."
---

A frequency table is the honest solution until the vocabulary stops fitting.

The hard part is not counting. It is naming. A Count-Min Sketch can answer
"how many times did this key appear?" for a key you already know how to ask
about, but it does not remember the keys themselves. Heavy-hitter detection has
a different shape: after a stream has passed, the algorithm must say which
items were common.

Space-Saving is one of the cleanest counter-based answers to that problem. It
keeps a small table of named items. When a new unmonitored item arrives and the
table is full, it evicts the item with the smallest stored count. The newcomer
inherits that count as blame for the past.

That little inheritance rule is the whole trick.

```text
if x is monitored:
  count[x] += 1
else if an empty counter exists:
  monitor x with count = 1 and error = 0
else:
  let y be an item with minimum stored count m
  stop monitoring y
  monitor x with count = m + 1 and error = m
```

The stored count is not presented as truth. It is a receipt:

```text
true count of x lies in [count[x] - error[x], count[x]]
```

The right endpoint is the optimistic estimate. The left endpoint is the part
that survived the audit.

## The Minimum Counter Is a Certificate Boundary

Let the table have $$k$$ counters. After $$n$$ stream updates, the sum of all
stored counts is exactly $$n$$, because every event increments exactly one
counter. Therefore the current minimum counter $$m_{\min}$$ is at most
$$n/k$$.

Space-Saving's more interesting invariant is about names:

```text
any item whose true frequency is greater than the current minimum counter
must be monitored
```

The invariant is easy to miss because evictions look destructive. The
destruction is tracked.

If an item is monitored with stored count $$c$$ and stored error $$e$$, then
its true count $$f$$ is bounded by:

$$
c - e \le f \le c.
$$

The upper bound exists because every stored count may include mass from earlier
items that occupied the same counter. The lower bound exists because
`error = m` records exactly how much prehistory the newcomer inherited at its
most recent insertion. Future arrivals of the same item increment the counter
honestly.

For an unmonitored item $$z$$, the invariant says:

$$
f(z) \le m_{\min}.
$$

Sketch of the induction:

- Before the table fills, unmonitored items have frequency zero.
- If an unmonitored item arrives while the table is full, it immediately
  becomes monitored.
- If a monitored item is evicted, it was sitting in a minimum counter, so its
  true count was no larger than that counter. The global minimum counter never
  decreases after the replacement.

So the minimum counter is not just an implementation detail. It is the boundary
between "could still be hiding" and "must have a named counter."

That boundary gives the threshold rule:

```text
if the heavy-hitter threshold phi n is greater than m_min,
then Space-Saving has no false negatives above that threshold.
```

False positives are still possible if you report by the upper count. The stored
lower bound separates those cases:

```text
count[x] >= threshold          -> candidate
count[x] - error[x] >= threshold -> certified heavy hitter
```

That difference is where the algorithm stops being a vibe and becomes an
auditable data structure.

## The Lab

The lab below generates a deterministic Zipf-like stream with optional drift,
runs Space-Saving, and compares the summary against the exact frequency table.
The exact table is used only for the audit and visualization.

The panels show:

- exact top items, with monitored items ringed;
- stored counters as intervals `[count - error, count]`;
- threshold candidates, guaranteed hits, and misses; and
- one exact-rank query interpreted through the Space-Saving receipt.

The default setting uses 64 counters for 50,000 events. The threshold is 1.2%
of the stream, which is above the current minimum counter in the generated run.
That makes the no-miss certificate visible on first load.

<style>
  .space-saving-lab {
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

  .space-saving-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    margin-bottom: 1rem;
  }

  .space-saving-lab label,
  .space-saving-lab__metric span,
  .space-saving-lab__note,
  .space-saving-lab__legend {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .space-saving-lab label {
    display: grid;
    font-weight: 650;
    gap: 0.35rem;
    min-width: 0;
  }

  .space-saving-lab input {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .space-saving-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .space-saving-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    margin: 0.4rem 0 0.8rem;
  }

  .space-saving-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .space-saving-lab__metric--good {
    background: #ecfdf5;
    border-color: #bbf7d0;
  }

  .space-saving-lab__metric--bad {
    background: #fff1f2;
    border-color: #fecdd3;
  }

  .space-saving-lab__metric span {
    display: block;
  }

  .space-saving-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .space-saving-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .space-saving-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .space-saving-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .space-saving-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .space-saving-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 680px) {
    .space-saving-lab {
      padding: 0.8rem;
    }

    .space-saving-lab__controls,
    .space-saving-lab__metrics {
      grid-template-columns: 1fr;
    }

    .space-saving-lab canvas {
      height: 1120px;
    }
  }
</style>

<div class="space-saving-lab" data-space-saving-lab>
  <div class="space-saving-lab__controls">
    <label>
      Stream events <output data-output="events">50,000</output>
      <input type="range" min="5000" max="120000" step="5000" value="50000" data-param="events" aria-label="Stream events">
    </label>
    <label>
      Vocabulary <output data-output="vocabulary">2,000</output>
      <input type="range" min="100" max="8000" step="100" value="2000" data-param="vocabulary" aria-label="Vocabulary size">
    </label>
    <label>
      Zipf exponent <output data-output="skew">1.05</output>
      <input type="range" min="0" max="160" step="5" value="105" data-param="skew" aria-label="Zipf exponent scaled by one hundred">
    </label>
    <label>
      Counters <output data-output="counters">64</output>
      <input type="range" min="8" max="160" step="4" value="64" data-param="counters" aria-label="Number of Space-Saving counters">
    </label>
    <label>
      Threshold <output data-output="threshold">1.2%</output>
      <input type="range" min="2" max="60" step="1" value="12" data-param="threshold" aria-label="Heavy hitter threshold in permille">
    </label>
    <label>
      Top-k audit <output data-output="topK">10</output>
      <input type="range" min="3" max="25" step="1" value="10" data-param="topK" aria-label="Top k audit size">
    </label>
    <label>
      Query rank <output data-output="queryRank">#8</output>
      <input type="range" min="1" max="40" step="1" value="8" data-param="queryRank" aria-label="Exact rank to query">
    </label>
    <label>
      Midstream drift <output data-output="drift">25%</output>
      <input type="range" min="0" max="100" step="5" value="25" data-param="drift" aria-label="Midstream vocabulary drift">
    </label>
    <label>
      Seed <output data-output="seed">41</output>
      <input type="range" min="1" max="9999" step="1" value="41" data-param="seed" aria-label="Deterministic random seed">
    </label>
  </div>
  <div class="space-saving-lab__metrics" data-metrics></div>
  <canvas data-canvas width="980" height="760" aria-label="Space-Saving heavy hitters lab showing exact leaders, counter intervals, threshold audit, and rank query receipt"></canvas>
  <div class="space-saving-lab__legend">
    <span><i style="background:#334155"></i> exact count</span>
    <span><i style="background:#0f766e"></i> certified lower mass</span>
    <span><i style="background:#2563eb"></i> upper estimate</span>
    <span><i style="background:#7c3aed"></i> query interval</span>
  </div>
  <p class="space-saving-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/space-saving-lab.js?v=20260618c' | relative_url }}"></script>

The audit is part of the artifact, not just a visual sanity check:

```bash
node - <<'NODE'
const lab = require("./assets/js/space-saving-lab.js");
const audit = lab.auditSpaceSavingLab();
console.table(audit.cases.map((row) => ({
  scenario: row.scenario,
  events: row.events,
  vocabulary: row.vocabulary,
  counters: row.counters,
  minCount: row.minCount,
  threshold: row.thresholdCount,
  trueHeavy: row.trueHeavy,
  reported: row.reported,
  noMiss: row.noMissCondition,
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
if (
  !audit.ok ||
  audit.passed !== 6 ||
  audit.total !== 6 ||
  audit.passedChecks !== 36 ||
  audit.totalChecks !== 36
) {
  throw new Error(JSON.stringify(audit.failures, null, 2));
}
console.log(
  `${audit.passed}/${audit.total} audit scenarios and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`
);
NODE
```

The 36 named checks cover five parameter settings plus a fixed-seed replay.
They assert that:

- the sum of stored counters equals the stream length;
- every monitored item's exact count lies in its stored interval;
- every unmonitored item's exact count is at most the current minimum counter;
- when the threshold is above the minimum counter, no true heavy hitter is
  unmonitored;
- any item whose lower bound crosses the threshold is truly above threshold;
- the top-`k` precision/recall summaries stay in probability range; and
- the implementation is deterministic for a fixed seed.

## Why This Is Not Just Misra-Gries With Different Labels

Misra and Gries gave the older and beautifully terse repeated-elements
algorithm: keep at most $$k-1$$ candidates; if a new item arrives and no empty
counter exists, decrement all counters and delete zeros.[^misra-gries] It is a
deletion ledger. Each global decrement cancels a group of distinct items.

Space-Saving uses a different ledger. It never decrements all counters. It
replaces the minimum counter and records that minimum as the new item's error.
Metwally, Agrawal, and El Abbadi presented this as an integrated algorithm for
frequent items and top-$$k$$ queries in data streams.[^space-saving] Their
analysis gives the interval and rank-style properties the lab is exercising.

Both algorithms are deterministic and both are about the same bottleneck:
the stream has more possible names than the memory budget. But they leave
different receipts. Misra-Gries is especially clean for proving that all
items above $$n/k$$ remain candidates. Space-Saving is especially convenient
when the table itself needs to rank candidates online by stored counts and
carry item-level error bounds.

Cormode and Hadjieleftheriou's survey-style experimental comparison is useful
here because it evaluates frequent-item algorithms under shared conditions
rather than treating each sketch in isolation.[^frequent-items] Their concise
description of Space-Saving matches the implementation above: keep item-count
pairs, increment a monitored item, otherwise replace the smallest counter with
the new item and increment it.

## Reading a Space-Saving Table in Production

The most common mistake is to treat `count` as exact.

It is safer to expose three views:

| View | Rule | Meaning |
| --- | --- | --- |
| candidate | `count >= threshold` | May be heavy; can include false positives |
| certified | `count - error >= threshold` | Heavy under the stored interval |
| hidden bound | unmonitored item `<= m_min` | No unmonitored item can exceed the current minimum |

That third row is the one that feels least natural at first. The algorithm can
say something useful about keys it is not storing. It cannot name them, but it
can bound them.

This also explains the table-size rule of thumb. Since
$$m_{\min} \le n/k$$, any threshold above $$n/k$$ is protected from false
negatives. If the product question is "show me everything above 1% of traffic,"
then a table with a little more than 100 counters puts the minimum-counter
certificate in the right range. More counters reduce candidate ambiguity; they
do not make the upper counts exact.

## What the Lab Does Not Claim

The implementation is deliberately simple. It scans the counter array to find
the minimum, so each update costs $$O(k)$$. That is fine for a visible browser
experiment with at most 160 counters. A production implementation usually
keeps counters in a heap or a stream-summary structure so the minimum can be
found and updated efficiently.

The stream generator is synthetic. It uses a Zipf-like distribution and an
optional midstream item shift to create churn. This is good for exercising the
invariants, but it is not a benchmark for cache behavior, adversarial keys,
distributed merging, sliding windows, deletions, or weighted updates.

The deterministic guarantee is also narrower than a product guarantee. The
data structure can certify threshold coverage relative to its processed stream.
It cannot decide whether the stream is the right measurement of user behavior,
whether bot traffic was filtered correctly, whether a delayed pipeline double
counted events, or whether the dashboard threshold is the right operational
decision.

Space-Saving earns its place because the internal contract is crisp:

```text
small memory, named candidates, explicit error receipts
```

That is often exactly the contract a streaming system needs.

[^space-saving]: Ahmed Metwally, Divyakant Agrawal, and Amr El Abbadi, ["Efficient Computation of Frequent and Top-k Elements in Data Streams"](https://www.cs.ucsb.edu/sites/default/files/documents/2005-23.pdf), UCSB technical report 2005-23. The report introduces Space-Saving as an online algorithm for frequent and top-k elements and proves the count/error and minimum-counter properties used here.

[^misra-gries]: Jayadev Misra and David Gries, ["Finding Repeated Elements"](https://www.khoury.northeastern.edu/home/pandey/courses/cs7280/spring25/papers/mg.pdf), *Science of Computer Programming*, 1982. Their paper gives the classic counter algorithm for finding all values that occur more than $$N/k$$ times.

[^frequent-items]: Graham Cormode and Marios Hadjieleftheriou, ["Finding frequent items in data streams"](https://www.vldb.org/pvldb/vol1/1454225.pdf), PVLDB 2008; journal version in *The VLDB Journal*, DOI [10.1007/s00778-009-0172-z](https://link.springer.com/article/10.1007/s00778-009-0172-z). The paper compares frequent-item methods under common experimental conditions and summarizes Space-Saving's update rule and error scale.
