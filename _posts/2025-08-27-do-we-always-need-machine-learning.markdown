---
layout: post
title: "Do We Always Need Machine Learning? A Fallback Cache Says No"
description: "A practical pattern for estimating sparse, long-tailed quantities with robust statistics, SQL rollups, partial pooling, and observable fallbacks."
date: 2025-08-27 10:00:00 -0400
categories: ai-systems
tags: [machine-learning, statistics, data-systems, sql, robust-statistics]
excerpt: "Sometimes the best production model is not a model at all. It is a statistically disciplined fallback: robust medians, rollups, shrinkage, and monitoring."
---

The most useful question in applied machine learning is often not "Which model
should we train?" It is "What decision needs to survive bad data?"

Imagine a pricing service goes dark during close. The business does not need a
heroic neural network at 3 AM. It needs a number that is defensible, available,
and honest about its uncertainty. If the source system normally returns a
specific surcharge for a specific carrier, cabin, route, date, and flight, a
backup system should first ask for the most specific historical evidence it can
trust. If that evidence is too sparse, it should gracefully climb to a broader
reference class.

This post uses airline YQ-style surcharges as a motivating example, but the
pattern is much more general. It applies to any segmented quantity where the
data are sparse, long-tailed, and operationally important: refund rates,
fulfillment costs, fraud review time, cloud spend, conversion delay, or support
load. The surprising part is that a large fraction of the value comes from
statistics and systems design, not from a predictive model.

<div class="callout">
  <strong>Thesis:</strong> when the failure mode is sparse lookup under
  pressure, start with a robust fallback cache. Use machine learning later only
  if it beats this baseline on accuracy, latency, interpretability, and failure
  behavior.
</div>

## The Shape of the Problem

A naive cache says: group by the fields we care about, take the average, and
join back at prediction time. That fails quickly.

Long-tailed money variables punish means. One bad upstream parse, one refunded
ticket, or one rare premium fare can pull an average away from the value a human
would defend. Robust statistics gives us the right first move: use a median or
another robust quantile. The median is not magic, but it has a useful breakdown
property: roughly half the observations must be contaminated before the estimate
can be pushed arbitrarily far away.[^ripley-robust]

The second failure is sparsity. The most specific key is often the most
tempting:

```text
carrier + cabin + origin + destination + departure_month + flight_number
```

It is also often the least reliable. There may be one observation, or none. A
single local median based on two tickets is not "personalized"; it is fragile.

The third failure is staleness. Old data are not wrong in the same way noisy
data are wrong. They may describe a different world. A good fallback cache has
to say what time window it represents and how often it is rebuilt.

The resulting design goal is modest but hard:

> Always return the most specific estimate that passes a statistical quality
> check, while making the chosen fallback level observable.

## The Fallback Cache

Think of the cache as a hierarchy of reference classes. At the top is a narrow
cell: same carrier, same cabin, same route, same flight. Below it are broader
cells: same carrier and cabin, same carrier, then global.

<figure class="research-figure">
<svg viewBox="0 0 760 260" role="img" aria-labelledby="fallback-title fallback-desc">
  <title id="fallback-title">Fallback hierarchy from specific evidence to global evidence</title>
  <desc id="fallback-desc">A request checks increasingly broad cache levels until it finds enough data.</desc>
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#5d6872"></path>
    </marker>
  </defs>
  <rect x="20" y="30" width="130" height="60" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"></rect>
  <text x="85" y="56" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Level 4</text>
  <text x="85" y="76" text-anchor="middle" font-size="12" fill="#5d6872">flight cell</text>
  <line x1="150" y1="60" x2="205" y2="60" stroke="#5d6872" stroke-width="2" marker-end="url(#arrow)"></line>

  <rect x="210" y="30" width="130" height="60" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"></rect>
  <text x="275" y="56" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Level 3</text>
  <text x="275" y="76" text-anchor="middle" font-size="12" fill="#5d6872">route cell</text>
  <line x1="340" y1="60" x2="395" y2="60" stroke="#5d6872" stroke-width="2" marker-end="url(#arrow)"></line>

  <rect x="400" y="30" width="130" height="60" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"></rect>
  <text x="465" y="56" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Level 2</text>
  <text x="465" y="76" text-anchor="middle" font-size="12" fill="#5d6872">carrier + cabin</text>
  <line x1="530" y1="60" x2="585" y2="60" stroke="#5d6872" stroke-width="2" marker-end="url(#arrow)"></line>

  <rect x="590" y="30" width="130" height="60" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"></rect>
  <text x="655" y="56" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Level 0-1</text>
  <text x="655" y="76" text-anchor="middle" font-size="12" fill="#5d6872">carrier/global</text>

  <path d="M85 115 C85 172, 655 172, 655 115" fill="none" stroke="#b45309" stroke-width="2"></path>
  <text x="380" y="195" text-anchor="middle" font-size="13" fill="#5d6872">fallback only when the narrower cell has too little evidence</text>
  <text x="380" y="225" text-anchor="middle" font-size="13" fill="#172026">prediction = first trustworthy estimate, plus the level that produced it</text>
</svg>
<figcaption>
The key order is the strategy. Put stable, high-signal dimensions early and
sparse, volatile dimensions late.
</figcaption>
</figure>

SQL already has the primitive we need. `GROUP BY ROLLUP` computes totals across
a hierarchy of grouping columns; Athena documents it as a way to generate
subtotals for a set of columns.[^athena-rollup] In Trino/Presto-style engines,
`approx_percentile(x, 0.5)` gives an approximate median over large groups
without sorting all values exactly.[^trino-approx] Athena engine version 3 uses
t-digest for `approx_percentile`, which is designed for compact approximate
quantile summaries.[^athena-tdigest] Quantile sketches are a deep area; the
Greenwald-Khanna algorithm and t-digest are two well-known reference points for
space-efficient approximate quantiles.[^gk], [^tdigest]

The cache table can be built in one pass:

```sql
CREATE TABLE yq_fallback_cache AS
WITH normalized AS (
  SELECT
    CAST(COALESCE(validating_carrier, '') AS VARCHAR) AS carrier,
    CAST(COALESCE(cabin, '') AS VARCHAR) AS cabin,
    CAST(CONCAT(COALESCE(origin_airport, ''), '-', COALESCE(destination_airport, '')) AS VARCHAR) AS route,
    CAST(COALESCE(outbound_flight_number, '') AS VARCHAR) AS flight_number,
    CAST(yq_amount AS DOUBLE) AS yq_amount
  FROM raw_ticket_taxes
  WHERE yq_amount IS NOT NULL
    AND yq_amount >= 0
)
SELECT
  carrier,
  cabin,
  route,
  flight_number,
  4 - (
    grouping(carrier)
    + grouping(cabin)
    + grouping(route)
    + grouping(flight_number)
  ) AS cache_level,
  approx_percentile(yq_amount, 0.5) AS median_yq,
  avg(yq_amount) AS mean_yq,
  count(*) AS n
FROM normalized
GROUP BY ROLLUP (
  carrier,
  cabin,
  route,
  flight_number
);
```

Two details matter more than they look.

First, normalize keys before the rollup and before lookup. `NULL`, empty string,
case differences, integer-vs-string flight numbers, and whitespace should not
decide whether a cache hit exists.

Second, make `cache_level` a first-class output. A fallback cache that only
returns a number is hard to debug. A fallback cache that returns both the number
and the level that served it can be monitored, audited, and tuned.

## The Statistical Contract

The lookup contract is:

$$
\hat{y}(x) = \widehat{Q}_{0.5}(L^\*, x),
\quad
L^\* = \max\{L: n_L(x) \ge n_{\min}\}.
$$

In words: find the most specific level whose cell has enough observations, and
use that cell's median.

That minimum count, $$n_{\min}$$, is not a theorem. It is an operational
threshold. I would start with something like 25 or 30, then tune it against a
time-split validation set. The point is not that 30 is sacred. The point is that
one ticket should not carry the authority of a market.

There is a better version for sparse cells: partial pooling. Instead of dropping
a level entirely when it is small, shrink it toward its parent:

$$
\tilde{Q}_{0.5}(L, x)
=
w_L(x)\widehat{Q}_{0.5}(L, x)
+
\left(1 - w_L(x)\right)\tilde{Q}_{0.5}(L-1, x),
\quad
w_L(x) = \frac{n_L(x)}{n_L(x) + k}.
$$

The constant $$k$$ is a skepticism parameter. Larger $$k$$ means local evidence
has to work harder before it overrides the broader reference class. This is the
same practical instinct behind empirical Bayes and hierarchical modeling:
separate estimates are noisy, and related groups can borrow strength from one
another.[^efron-morris], [^gelman]

## A Small Experiment

The simulator below creates a synthetic surcharge world with carriers, cabins,
routes, and flights. Training data are sparse and contaminated by occasional
large outliers. Test targets are the clean underlying cell values. The chart
compares four strategies:

- global mean,
- most-specific mean,
- median cascade with a fixed $$n_{\min}$$,
- median shrinkage toward parent levels.

It is not a proof. It is a compact stress test for the failure modes above. Try
raising the outlier rate or making the traffic sparser; the brittle local mean
usually gets worse before the fallback strategies do.

<div class="fallback-lab" data-fallback-lab>
  <div class="fallback-lab__controls">
    <label>
      Sparse traffic: <output data-value="sparsity">45%</output>
      <input type="range" min="0" max="85" value="45" data-param="sparsity">
    </label>
    <label>
      Outlier rate: <output data-value="outliers">8%</output>
      <input type="range" min="0" max="25" value="8" data-param="outliers">
    </label>
    <label>
      Shrinkage skepticism: <output data-value="skepticism">30</output>
      <input type="range" min="5" max="180" value="30" data-param="skepticism">
    </label>
  </div>
  <div class="fallback-lab__metrics" data-metrics></div>
  <canvas data-canvas width="760" height="300" aria-label="Mean absolute error by fallback strategy"></canvas>
  <div class="fallback-lab__legend">
    <span><i style="background:#94a3b8"></i> Global mean</span>
    <span><i style="background:#b45309"></i> Local mean</span>
    <span><i style="background:#0f766e"></i> Median cascade</span>
    <span><i style="background:#2563eb"></i> Shrinkage</span>
  </div>
  <p class="fallback-lab__note">
    Deterministic toy data; lower mean absolute error is better. The fixed
    cascade uses n_min = 25.
  </p>
</div>
<script defer src="{{ '/assets/js/fallback-lab.js' | relative_url }}"></script>

The interesting lesson is not that the shrinkage curve always wins. It will not.
The lesson is that the baseline is strong and legible. If a learned model cannot
beat this under a fair time split, with comparable latency and better monitoring,
then the model is probably solving a problem we do not yet have.

## Lookup SQL

At serving time, the simplest implementation is a cascade of left joins. The
first non-null estimate wins:

```sql
WITH request AS (
  SELECT
    CAST(COALESCE(validating_carrier, '') AS VARCHAR) AS carrier,
    CAST(COALESCE(cabin, '') AS VARCHAR) AS cabin,
    CAST(CONCAT(COALESCE(origin_airport, ''), '-', COALESCE(destination_airport, '')) AS VARCHAR) AS route,
    CAST(COALESCE(outbound_flight_number, '') AS VARCHAR) AS flight_number
  FROM requests_to_price
)
SELECT
  request.*,
  COALESCE(l4.median_yq, l3.median_yq, l2.median_yq, l1.median_yq, l0.median_yq) AS estimated_yq,
  COALESCE(l4.cache_level, l3.cache_level, l2.cache_level, l1.cache_level, l0.cache_level) AS cache_hit_level,
  COALESCE(l4.n, l3.n, l2.n, l1.n, l0.n) AS cache_hit_n
FROM request
LEFT JOIN yq_fallback_cache l4
  ON request.carrier = l4.carrier
 AND request.cabin = l4.cabin
 AND request.route = l4.route
 AND request.flight_number = l4.flight_number
 AND l4.cache_level = 4
 AND l4.n >= 30
-- Continue down the hierarchy.
LEFT JOIN yq_fallback_cache l0
  ON l0.cache_level = 0;
```

In production I would usually generate this SQL rather than hand-maintain a
dozen joins. The generated code should still be explicit in the compiled query;
when a fallback system breaks, clever metaprogramming is not what you want to
read first.

For shrinkage, compute parent estimates in the cache build or in a second
materialization step. Serving should stay boring:

```sql
SELECT
  request_id,
  shrunken_median_yq AS estimated_yq,
  cache_level,
  n,
  parent_cache_level
FROM yq_fallback_cache_ready
WHERE lookup_key = :normalized_lookup_key;
```

## Observability Is Part of the Model

The cache is only trustworthy if you can see how it behaves. I would ship it
with four dashboard panels:

1. Hit rate by fallback level. A sudden jump to global is an incident, not a
   harmless detail.
2. Error by fallback level on delayed ground truth. Specific levels should earn
   their specificity.
3. Rejected cells by reason: too few observations, stale window, missing key, or
   quality filter.
4. Drift by major segment. Track medians for top carriers, routes, cabins, and
   date buckets.

Those panels also tell you when machine learning becomes worth it. If the
fallback hierarchy is stable but systematically biased for known feature
interactions, a model may help. If error is mostly from missing recent data, a
model may only make the failure less obvious.

## Where This Pattern Breaks

This is not an argument against machine learning. It is an argument against
using it before the baseline has a spine.

A fallback cache struggles when the relevant signal is not present in the
grouping keys, when the world shifts faster than the rebuild window, when
missingness is highly non-random, or when the target itself is redefined by
policy. It also does not produce calibrated uncertainty intervals by default.
You can add them with bootstrap intervals, Bayesian hierarchy, or conformal
calibration, but they should be designed deliberately.

Approximate quantiles also need testing. They are excellent for large-scale
systems, but they are still approximations. If a financial close process depends
on exact cents, separate "fast estimate" and "official accounting" paths.

## The Takeaway

The best non-ML baseline is not a weak straw man. It is a serious system:
normalized keys, robust quantiles, rollup hierarchy, minimum evidence thresholds,
partial pooling, freshness windows, and level-by-level monitoring.

Only after that baseline exists can we ask the machine-learning question
honestly:

> What does the model learn that the reference-class hierarchy cannot, and is
> that improvement worth the operational surface area?

Sometimes the answer is yes. But a surprising amount of intelligence comes from
knowing when a smaller, more inspectable idea is enough.

## References

[^ripley-robust]: Brian D. Ripley, ["Robust Statistics"](https://www.stats.ox.ac.uk/~ripley/StatMethods/Robust.pdf), Oxford lecture notes. The note summarizes breakdown points and contrasts the mean with the median.

[^athena-rollup]: AWS, ["SELECT - Amazon Athena"](https://docs.aws.amazon.com/athena/latest/ug/select.html), on `GROUPING SETS`, `CUBE`, and `ROLLUP`.

[^trino-approx]: Trino documentation, ["Aggregate functions"](https://trino.io/docs/current/functions/aggregate.html), for `approx_percentile`.

[^athena-tdigest]: AWS, ["Athena engine version 3"](https://docs.aws.amazon.com/athena/latest/ug/engine-versions-reference-0003.html), noting the t-digest implementation change for `approx_percentile`.

[^gk]: Michael Greenwald and Sanjeev Khanna, ["Space-Efficient Online Computation of Quantile Summaries"](https://dl.acm.org/doi/10.1145/375663.375670), SIGMOD 2001.

[^tdigest]: Ted Dunning and Otmar Ertl, ["Computing Extremely Accurate Quantiles Using t-Digests"](https://arxiv.org/abs/1902.04023), 2019.

[^efron-morris]: Bradley Efron and Carl Morris, ["Data Analysis Using Stein's Estimator and Its Generalizations"](https://faculty.ucmerced.edu/jvevea/classes/290_21/readings/week%204/Efron%20and%20Morris.pdf), Journal of the American Statistical Association, 1975.

[^gelman]: Andrew Gelman et al., ["Bayesian Data Analysis, 3rd edition"](https://sites.stat.columbia.edu/gelman/book/BDA3.pdf), for hierarchical modeling and partial pooling.
