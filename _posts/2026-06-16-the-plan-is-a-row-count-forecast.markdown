---
layout: post
title: "The Plan Is a Row-Count Forecast"
description: "A SQL optimizer does not merely choose joins. It makes a forecast about intermediate rows, then spends real I/O and CPU as if that forecast were true."
date: 2026-06-16 19:06:00 -0400
categories: software-engineering
tags: [query-optimization, cardinality-estimation, databases, postgresql, cost-models, joins, software-engineering]
excerpt: "EXPLAIN is a weather report for tuples. When the row-count forecast is wrong, the join order can still look locally rational while buying a globally expensive plan."
---

`EXPLAIN` is not just a tree.

It is a forecast.

Every node in the plan carries a row-count prediction. The optimizer believes
some predicate will keep 8% of a table, some join will emit 35,000 rows, some
later step will see only 1,014 rows, and therefore an index nested loop is cheap.
The executor then discovers whether the forecast was weather or astrology.

This is the delicate part of SQL's bargain. You write:

```sql
SELECT ...
FROM fact
JOIN region
JOIN product
JOIN promo
JOIN account
WHERE region.name = 'west'
  AND product.category = 'gpu'
  AND promo.clicked = true
  AND account.is_new = true;
```

You do not say which table to read first. You do not say whether to hash, sort,
or probe an index. The database is supposed to choose. That was the central
trick of System R: SQL statements do not specify access paths or join order; the
optimizer chooses a plan that minimizes estimated total cost.[^selinger]

The hard word is *estimated*.

## The Forecast Has A Shape

The lab below is a synthetic star query. A large fact table joins to six filtered
dimensions. Four filters are tied together by a hidden launch segment: west
region, mobile app, promo click, and GPU category are individually selective,
but they tend to occur in the same slice of traffic. Two other filters are
independent.

The optimizer sees marginal selectivities unless the **Extended stats** slider
lets it partially see the joint distribution. It then chooses a left-deep join
order and physical join methods using estimated rows. The "oracle" plan is the
best plan under the true row counts.

<style>
  .join-order-lab {
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

  .join-order-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    margin-bottom: 1rem;
  }

  .join-order-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .join-order-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    min-height: 1.2rem;
  }

  .join-order-lab input[type="range"],
  .join-order-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .join-order-lab select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.28rem 0.45rem;
  }

  .join-order-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .join-order-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .join-order-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .join-order-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
    overflow-wrap: anywhere;
  }

  .join-order-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .join-order-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .join-order-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .join-order-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .join-order-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 520px) {
    .join-order-lab {
      padding: 0.75rem;
    }

    .join-order-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="join-order-lab" class="join-order-lab" data-join-order-lab>
  <div class="join-order-lab__controls">
    <label>
      Fact rows: <output data-value="factRows">8M</output>
      <input type="range" min="1" max="30" step="1" value="8" data-param="factRows">
    </label>
    <label>
      Hidden correlation: <output data-value="correlation">80%</output>
      <input type="range" min="0" max="95" step="5" value="80" data-param="correlation">
    </label>
    <label>
      Extended stats: <output data-value="extendedStats">0%</output>
      <input type="range" min="0" max="100" step="5" value="0" data-param="extendedStats">
    </label>
    <label>
      Index temptation: <output data-value="indexTemptation">78%</output>
      <input type="range" min="0" max="100" step="5" value="78" data-param="indexTemptation">
    </label>
    <label>
      Planner:
      <select data-param="planner">
        <option value="dp" selected>dynamic programming</option>
        <option value="greedy">greedy next join</option>
      </select>
    </label>
  </div>
  <div class="join-order-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="Join-order cardinality-estimation lab showing hidden correlations, chosen join plan, row-count errors, and plan regret"></canvas>
  <div class="join-order-lab__legend">
    <span><i style="background:#7c3aed"></i> Hidden segment</span>
    <span><i style="background:#b45309"></i> Estimated rows</span>
    <span><i style="background:#2563eb"></i> Actual rows</span>
    <span><i style="background:#be123c"></i> Underestimate / regret</span>
    <span><i style="background:#0f766e"></i> Hash join / fact side</span>
  </div>
  <p class="join-order-lab__note">
    Deterministic synthetic experiment. The plan search enumerates six-table
    left-deep orders for dynamic programming and a local next-join heuristic for
    greedy mode. The cost model is intentionally small: hash joins pay for
    intermediate rows, while index probes look cheap when estimated rows are
    tiny and become expensive when the actual outer side is large.
  </p>
</div>
<script defer src="{{ '/assets/js/join-order-lab.js?v=20260616a' | relative_url }}"></script>

At the default setting, the optimizer chooses:

```text
G -> P -> R -> N -> M -> S
```

The oracle chooses:

```text
G -> S -> P -> R -> N -> M
```

The difference is not that the optimizer is stupid. The estimated plan is
locally coherent. It thinks `gpu category`, `promo click`, and `region = west`
will multiply down quickly:

```text
0.055 * 0.08 * 0.12
```

But in the synthetic data, those predicates are symptoms of the same hidden
launch segment. After the first one, the next two do not buy as much reduction
as independence promised. The default run estimates about 103 final fact rows;
the true final count is about 4,687. The final q-error is about 45x, and the
chosen plan costs about 1.74x the oracle plan.

Raise **Extended stats** toward 80%. The q-error collapses and the regret curve
almost flattens. Switch **Planner** to greedy. The same row-count errors now
interact with a smaller search strategy, and the plan tends to get worse.

The point is not that this toy cost model is PostgreSQL. It is that the shape of
the failure is recognizable:

```text
wrong rows -> wrong join order -> wrong join method -> real work
```

## Independence Was The Convenient Fiction

System R needed a way to turn predicates into cardinalities. For a conjunction,
the classic selectivity arithmetic multiplied factors. The paper explicitly
notes the independence assumption behind that multiplication.[^selinger-select]

That assumption is often good enough. It is also often false in exactly the
places people write interesting queries.

Products, geographies, seasons, devices, promotions, fraud signals, account
ages, language, price bands, and marketing channels are not independent. They
are the compressed surface of social processes, product launches, bot campaigns,
regional habits, and application design. A benchmark generator can make them
independent. A production database usually cannot.

Leis, Gubichev, Mirchev, Boncz, Kemper, and Neumann made this point in the Join
Order Benchmark. They argued that TPC-H-like generators can be too easy for
cardinality estimation because they share simplifying assumptions with the
estimators themselves, while real-world data is full of correlations and
non-uniform distributions.[^job] Their experiment separated the effects of
cardinality estimation, cost models, and plan enumeration. The uncomfortable
conclusion was that row-count errors are often the dominant problem.[^job]

A later retrospective states it even more plainly: their findings showed that
cardinality-estimation errors were widespread and often the dominant cause of
poor plans, while cost-model and enumeration effects were usually smaller.[^still]

That is why a row estimate is not a harmless annotation in an `EXPLAIN` plan. It
is the premise under the whole tree.

## Error Propagates Downstream

One bad selectivity estimate is annoying. A multi-join query turns it into a
compound instrument.

If the optimizer underestimates an intermediate result by 20x, the next join is
planned as if its outer side were 20x smaller. The next predicate may then be
applied under another independence assumption. The error is not merely
reported; it is consumed by later decisions.

Ioannidis and Christodoulakis studied this directly in their 1991 paper on
propagation of join-size errors.[^ioannidis] The phrase "error propagation" is
the right mental handle. Estimates are not isolated guesses. They are inputs to
other estimates.

The lab's "Error propagation" panel makes that visible. The first filter is
fine. The second and third filters are already in trouble. By the time the plan
chooses index probes, the estimate says "tiny outer side" while the executor is
still carrying tens of thousands of rows.

This is also why final-cardinality accuracy is not enough. A final estimate can
be acceptable while an intermediate estimate is disastrous, and intermediate
rows are where join methods, memory, spills, and probe counts are chosen.

## Indexes Can Sharpen The Mistake

Indexes are supposed to help. Usually they do. But an index nested loop has a
particular failure mode:

```text
estimated outer rows: 100
actual outer rows: 100,000
```

The first number makes repeated index probes look elegant. The second number
makes them a tax.

The Join Order Benchmark work found that the performance degradation from
misestimation is more pronounced when more indexes are available.[^still] That
is not because indexes are bad. It is because indexes create more tempting
physical plans whose cost depends sharply on cardinality.

Hash joins and scans can be boringly robust: read a lot, hash a lot, move on.
Index nested loops can be brilliant when the outer side is truly small and
punishing when the outer side was only small in the estimate.

The **Index temptation** slider in the lab controls how willing the model is to
believe those probes are cheap. High values make underestimated prefixes more
dangerous. Low values push the optimizer toward blunter hash plans that may do
extra work but fail less dramatically.

## What Better Statistics Buy

PostgreSQL's planner documentation says the planner needs row estimates to make
good plan choices, and that table and index row counts are approximate even when
freshly updated.[^pgstats] Single-column statistics give histograms, most-common
values, null fractions, and distinct counts. They are useful. They also cannot
fully describe a joint distribution.

PostgreSQL's extended statistics are an admission of that fact. Functional
dependency statistics can prevent underestimation when one column determines
another; n-distinct statistics help with distinct-count estimates over column
groups.[^pgextended] The docs are careful about limitations: functional
dependencies apply only to certain equality and `IN` conditions, and they do not
prove incompatible conditions impossible.[^pgextended]

So "run ANALYZE" is not a magic spell. It is the beginning of a contract:

- Which columns are correlated?
- Which predicates appear together in real queries?
- Which estimates are wrong in `EXPLAIN ANALYZE`?
- Which wrong estimates change join order or join method?
- Which stats objects, indexes, rewrites, or materialized summaries make the
  forecast better?

The lab's **Extended stats** slider is intentionally optimistic. It directly
interpolates between independence estimates and the true joint distribution.
Real systems have to discover which joint facts are worth storing, keep them
fresh, and apply them only where the estimator knows how.

## Reading A Bad Plan

When a query goes sideways, I do not start by asking whether the optimizer is
"bad." I ask where the forecast first diverged from reality.

A useful plan-reading sequence:

1. Run the query with actuals, not only estimates.
2. Find the first node where estimated rows and actual rows split badly.
3. Ask whether the split is caused by stale row counts, skew, correlation,
   missing most-common values, bad distinct counts, parameter sensitivity, or
   a predicate the estimator does not model.
4. Check whether the bad estimate changed join order, join method, memory, or
   parallelism.
5. Fix the forecast if possible; only then argue about hints, rewrites, or
   forcing a plan.

The distinction matters. A forced plan can be a useful tourniquet, but it is not
the same as repairing the measurement instrument. If the data distribution moves
again, the forced plan can become the next incident.

## The Optimizer Is A Scientist With A Budget

A cost-based optimizer is a little scientist under time pressure.

It has a hypothesis class: plan shapes and physical operators. It has a dataset:
catalog statistics, histograms, distinct counts, maybe extended stats. It has a
loss function: estimated execution cost. It has a search budget. It makes a
decision before seeing the full outcome.

That framing makes the work feel less mysterious. Bad plans are not random acts
of database weather. They are usually failed forecasts under limited
measurement:

```text
the data had structure
the statistics compressed it
the estimator assumed through the gaps
the search procedure optimized the assumption
```

SQL is declarative because we want the database to choose the path. But the path
is only as good as the rows it believes are waiting there.

## Further Reading

[^selinger]: P. Griffiths Selinger, M. M. Astrahan, Donald D. Chamberlin, Raymond A. Lorie, and Thomas G. Price, ["Access Path Selection in a Relational Database Management System"](https://courses.cs.duke.edu/compsci516/cps216/spring03/papers/selinger-etal-1979.pdf), SIGMOD 1979. The paper presents the System R optimizer and says SQL users do not specify access paths or join order; the optimizer chooses a minimum estimated total-cost plan.

[^selinger-select]: Selinger et al., same paper. In the selectivity section, the paper gives the conjunction rule `F = F(pred1) * F(pred2)` and notes that this assumes independent column values.

[^job]: Viktor Leis, Andrey Gubichev, Atanas Mirchev, Peter Boncz, Alfons Kemper, and Thomas Neumann, ["How Good Are Query Optimizers, Really?"](https://www.vldb.org/pvldb/vol9/p204-leis.pdf), *Proceedings of the VLDB Endowment* 9(3), 2015. The paper introduces the Join Order Benchmark and studies cardinality estimation, cost modeling, and plan enumeration on realistic multi-join queries.

[^still]: Viktor Leis, Andrey Gubichev, Atanas Mirchev, Peter Boncz, Alfons Kemper, and Thomas Neumann, ["Still Asking: How Good Are Query Optimizers, Really?"](https://www.vldb.org/pvldb/vol18/p5531-viktor.pdf), *Proceedings of the VLDB Endowment* 18(12), 2025.

[^ioannidis]: Yannis E. Ioannidis and Stavros Christodoulakis, ["On the propagation of errors in the size of join results"](https://sigmodrecord.org/1991/08/29/on-the-propagation-of-errors-in-the-size-of-join-results/), SIGMOD 1991. [DOI record](https://doi.org/10.1145/119995.115835).

[^pgstats]: PostgreSQL documentation, ["Statistics Used by the Planner"](https://www.postgresql.org/docs/current/planner-stats.html). The documentation describes table row-count estimates such as `reltuples`, selectivity statistics in `pg_statistic`, and the planner's need to estimate retrieved rows.

[^pgextended]: PostgreSQL documentation, ["Extended Statistics"](https://www.postgresql.org/docs/current/planner-stats.html#PLANNER-STATS-EXTENDED). The section covers functional dependencies and multivariate n-distinct statistics, including limitations of dependency statistics.
