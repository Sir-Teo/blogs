---
layout: post
title: "The Delta Is the Query"
description: "Incremental view maintenance works when change is smaller than state. The hard part is choosing which partial answers deserve to be remembered."
date: 2026-06-16 23:18:00 -0400
categories: software-engineering
tags: [incremental-view-maintenance, materialized-views, differential-dataflow, databases, rule-engines, streaming-systems, software-engineering]
excerpt: "A materialized view is not just a cached answer. It is a promise to keep an answer fresh while the base tables move. The derivative of the query becomes the code path."
---

The most expensive query is often the one you already answered.

That sounds backwards until the database changes.

You have a dashboard, an alert, a rule engine, a fraud score, a ranking table, a
feature store, a recommendation edge list. The thing is not a one-shot query.
It is a standing question. Every insert, delete, status flip, or dimension-table
edit asks:

```text
what changed in the answer?
```

Refreshing the whole answer is honest, but sometimes absurd. If one order moves
from `pending` to `paid`, recomputing a million-row revenue cube is a dramatic
way to add three numbers.

The old database phrase is **incremental view maintenance**. The better mental
model is:

```text
the query has a derivative
```

When the base tables move by $$\Delta R$$, the view moves by $$\Delta V$$. The
interesting engineering object is not only $$V$$. It is the program that maps
base-table changes to view changes.

## A Query With Four Doors

Here is a deliberately ordinary analytic view:

```sql
SELECT users.region, products.category, SUM(items.amount) AS revenue
FROM users
JOIN orders   ON orders.user_id = users.id
JOIN items    ON items.order_id = orders.id
JOIN products ON products.sku = items.sku
WHERE orders.paid
GROUP BY users.region, products.category;
```

There are four kinds of base-table changes:

```text
new item row
order status flips between pending and paid
product moves category
user moves region
```

They are not equally expensive.

For a new item, the delta is tiny:

```text
look up its order
if paid, look up user and product
add amount to one view cell
```

For a product-category edit, the delta can be wide. Every paid historical item
with that SKU moves from the old category cell to the new category cell. A
first-order delta path still has to walk the fanout.

That is where auxiliary views appear. They are not a philosophical flourish.
They are stored derivatives:

```text
order -> revenue by category
sku   -> paid revenue by region
user  -> paid revenue by category
```

Now a status flip can move one order's category ledger. A product recategorized
from `tools` to `ai` can move one SKU's regional ledger. A user-region edit can
move one user's category ledger. The base query and its deltas are both
materialized.

The bill is also obvious: more memory, more writes, more invariants.

## The Lineage Is Older Than The Branding

Rule engines learned this early. Forgy's Rete algorithm was built for the
many-pattern/many-object match problem in production systems, where pattern
matching could dominate execution time.[^rete] Rete compiles patterns into a
network and stores partial matches so new working-memory changes can be
propagated through the network instead of matching everything against
everything again.[^rete]

Databases developed the same reflex in their own language. Gupta and Mumick's
survey framed materialized views as stored query results that must be kept
consistent with changing base relations, and organized the view-maintenance
problem around what information is available and how changes are propagated.[^gupta]

The modern systems lineage pushes the idea harder. DBToaster's "viewlet
transform" materializes a query and higher-order deltas of the query, so those
delta views help maintain one another.[^dbtoaster] Differential dataflow
generalizes incremental computation to changing, possibly iterative dataflows:
collections are represented through differences, and output changes remain
sparse when input changes are sparse.[^differential]

The recurring move is the same:

```text
do not store only the answer
store enough nearby answers that change has a short path
```

## The Lab

The browser lab below uses the revenue query above. It generates a deterministic
synthetic database, applies a batch of base-table changes, recomputes the exact
answer after the batch, and compares three maintenance budgets:

```text
full refresh       scan the joined view again
first-order delta  walk affected base rows and join them through indexes
auxiliary delta    use maintained derivative views to shorten fanout
```

The default case has `180` users, `691` orders, `2,899` items, and `70`
products. With an 18-change mixed batch:

```text
full refresh probes       8,697
first-order delta probes  2,497
auxiliary delta probes      204
auxiliary entries         3,472
touched view cells        26 / 30
```

The important sentence is not "204 is smaller than 8,697." The important
sentence is "204 was purchased by keeping 3,472 auxiliary entries correct."

<style>
  .ivm-lab {
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

  .ivm-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
    margin-bottom: 1rem;
  }

  .ivm-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .ivm-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .ivm-lab input,
  .ivm-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .ivm-lab select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.28rem 0.45rem;
  }

  .ivm-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .ivm-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .ivm-lab__metric.good {
    border-color: #9ed8c5;
  }

  .ivm-lab__metric.warn {
    border-color: #f2b8c4;
  }

  .ivm-lab__metric span,
  .ivm-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .ivm-lab__metric span {
    display: block;
  }

  .ivm-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .ivm-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .ivm-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .ivm-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .ivm-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .ivm-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 520px) {
    .ivm-lab {
      padding: 0.75rem;
    }

    .ivm-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="incremental-view-lab" class="ivm-lab" data-incremental-view-lab>
  <div class="ivm-lab__controls">
    <label>
      Users: <output data-value="users">180</output>
      <input type="range" min="40" max="420" step="10" value="180" data-param="users">
    </label>
    <label>
      Orders / user: <output data-value="ordersPerUser">4</output>
      <input type="range" min="1" max="8" step="1" value="4" data-param="ordersPerUser">
    </label>
    <label>
      Items / order: <output data-value="itemsPerOrder">5</output>
      <input type="range" min="1" max="12" step="1" value="5" data-param="itemsPerOrder">
    </label>
    <label>
      SKUs: <output data-value="skus">70</output>
      <input type="range" min="20" max="180" step="5" value="70" data-param="skus">
    </label>
    <label>
      SKU skew: <output data-value="skew">55%</output>
      <input type="range" min="0" max="90" step="1" value="55" data-param="skew">
    </label>
    <label>
      Batch changes: <output data-value="batch">18</output>
      <input type="range" min="1" max="80" step="1" value="18" data-param="batch">
    </label>
    <label>
      Change mix:
      <select data-param="mode">
        <option value="mixed" selected>mixed</option>
        <option value="inserts">new items</option>
        <option value="status">status flips</option>
        <option value="sku">sku category edits</option>
        <option value="user">user region edits</option>
      </select>
    </label>
    <label>
      Seed: <output data-value="seed">31</output>
      <input type="range" min="1" max="999" step="1" value="31" data-param="seed">
    </label>
  </div>
  <div class="ivm-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="720" aria-label="Incremental view maintenance lab comparing full refresh, first-order delta maintenance, auxiliary delta views, changed revenue cells, and batch-size work"></canvas>
  <div class="ivm-lab__legend">
    <span><i style="background:#be123c"></i> Full refresh</span>
    <span><i style="background:#2563eb"></i> First-order delta</span>
    <span><i style="background:#0f766e"></i> Auxiliary delta</span>
    <span><i style="background:#d97706"></i> Base table</span>
  </div>
  <p class="ivm-lab__note">
    Deterministic browser experiment. Probe counts are a transparent work model,
    not a database benchmark: they count indexed lookups, affected-row fanout,
    and aggregate-cell updates needed to keep the materialized view exact after
    a batch of base-table changes.
  </p>
</div>
<script defer src="{{ '/assets/js/incremental-view-lab.js?v=20260616a' | relative_url }}"></script>

Try three moves.

First, set **Change mix** to `sku category edits` and raise **SKU skew**. Hot
SKUs make first-order maintenance walk many historical item rows. The auxiliary
`sku -> paid revenue by region` view turns that into a handful of regional
moves. With `20` SKU edits and `80%` skew in the default database, the lab
reports about `4,994` first-order probes versus `242` auxiliary probes.

Second, set **Change mix** to `new items`. The auxiliary path loses some of its
drama, because an item insert is already local. It still has to update the main
view and the auxiliary ledgers. Incrementality is not one trick; it is a menu of
maintenance obligations.

Third, push **Batch changes** toward `80`. The batch-sweep panel shows the shape
of the trade. Full refresh is almost flat because it pays for the whole current
database once. Delta paths grow with the amount of change. If the batch becomes
large enough, or if most rows churn every cycle, the Rete caveat returns:
remembering state helps when the set of objects changes relatively slowly.[^rete]

## The Derivative Of A Join

For a two-way join, the delta identity is already enough to explain the flavor:

$$
V = R \bowtie S
$$

If both sides change:

$$
\Delta V =
(\Delta R \bowtie S)
\cup
(R \bowtie \Delta S)
\cup
(\Delta R \bowtie \Delta S).
$$

For aggregates, the signs matter. Inserts add. Deletes subtract. Updates are
often a delete plus an insert. In systems with duplicates, counts or
multiplicities must be carried through carefully.

The lab's query is a grouped sum over four relations. Its useful deltas are
closer to:

```text
item insert:
  amount -> one (region, category) cell

order status flip:
  sign * orderCategory[order_id] -> one user's region

product category edit:
  skuRegion[sku] moves from old category to new category

user region edit:
  userCategory[user_id] moves from old region to new region
```

Those auxiliary ledgers are partial derivatives of the query with respect to
different base tables. They make some changes cheap because the expensive join
work has already been condensed.

## The Cost Has Three Names

Incremental systems fail when they talk about only one cost.

**Refresh cost** is the obvious one: how much work does it take to produce the
next correct view?

**Maintenance cost** is the steady tax: every ordinary insert now updates not
only the main view but also whatever auxiliary views might help some future
change.

**State cost** is the memory and correctness burden: indexes, arrangements,
partial matches, materialized deltas, compaction, recovery, invalidation, and
schema evolution.

Naiad's timely dataflow paper is useful here because it puts iteration,
streaming, and interactive queries into the same systems frame: users want
low-latency answers while updates arrive and subcomputations iterate.[^naiad]
Differential dataflow's contribution is not merely "cache more." It is a way to
organize differences at logical times so iterative computations can reuse prior
work without pretending there is only one current version.[^differential]

That sophistication is why the toy lab should not be mistaken for a database.
It is a pocket model of the accounting question:

```text
which partial answers are worth keeping fresh?
```

## When Not To Do This

Incremental maintenance is a bet on locality of change.

It is a bad bet when:

```text
most rows change every refresh
the query shape changes constantly
the auxiliary state is larger than the saved work
the update path is harder to make correct than recomputation
late or out-of-order data changes the semantics
the system cannot recover auxiliary state after failure
```

It is also easy to hide a product decision inside the word "fresh." Does the
dashboard need transactionally current answers? Is a few seconds of lag okay?
Can errors be corrected later with retractions? Is the view read often enough to
justify eager maintenance?

Lazy maintenance, eager maintenance, micro-batch refresh, and full recomputation
are not moral categories. They are contracts about staleness, cost, and
operational risk.

## The Small Useful Habit

When someone proposes a materialized view, I now ask for its delta plan.

Not just:

```text
what is the query?
```

but:

```text
what base changes can happen?
what is the fanout of each change?
which partial joins are materialized?
how are deletes represented?
how is auxiliary state recovered?
when does full refresh become cheaper?
```

A cache stores an answer and hopes the world stays still.

A maintained view admits the world will move, then writes code for the motion.

[^rete]: Charles L. Forgy, ["Rete: A Fast Algorithm for the Many Pattern/Many Object Pattern Match Problem"](https://www.csl.sri.com/users/mwfong/public_html/Technical/RETE%20Match%20Algorithm%20-%20Forgy%20OCR.pdf), *Artificial Intelligence* 19(1):17-37, 1982. DOI: [10.1016/0004-3702(82)90020-0](https://doi.org/10.1016/0004-3702(82)90020-0).

[^gupta]: Ashish Gupta and Inderpal Singh Mumick, ["Maintenance of Materialized Views: Problems, Techniques, and Applications"](https://homepages.inf.ed.ac.uk/wenfei/qsx/reading/gupta95maintenance.pdf), *IEEE Data Engineering Bulletin* 18(2):3-18, 1995.

[^dbtoaster]: Yanif Ahmad, Oliver Kennedy, Christoph Koch, and Milos Nikolic, ["DBToaster: Higher-order Delta Processing for Dynamic, Frequently Fresh Views"](https://vldb.org/pvldb/vol5/p968_yanifahmad_vldb2012.pdf), *Proceedings of the VLDB Endowment* 5(10):968-979, 2012. DOI: [10.14778/2336664.2336670](https://doi.org/10.14778/2336664.2336670).

[^differential]: Frank McSherry, Derek G. Murray, Rebecca Isaacs, and Michael Isard, ["Differential Dataflow"](https://www.cidrdb.org/cidr2013/Papers/CIDR13_Paper111.pdf), CIDR 2013. Microsoft Research page: [Differential dataflow](https://www.microsoft.com/en-us/research/publication/differential-dataflow/).

[^naiad]: Derek G. Murray, Frank McSherry, Rebecca Isaacs, Michael Isard, Paul Barham, and Martin Abadi, ["Naiad: A Timely Dataflow System"](https://sigops.org/s/conferences/sosp/2013/papers/p439-murray.pdf), SOSP 2013. DOI: [10.1145/2517349.2522738](https://doi.org/10.1145/2517349.2522738).
