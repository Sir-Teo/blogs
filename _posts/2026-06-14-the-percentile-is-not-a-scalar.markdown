---
layout: post
title: "Percentiles Need Their Population"
description: "A p95 is a rank statement about a population, not a mergeable number. Averaging shard percentiles can be wildly wrong; sketches work because they preserve rank information."
date: 2026-06-14 05:58:00 -0400
categories: data-systems
tags: [quantiles, streaming-algorithms, sketches, latency, percentiles, observability]
excerpt: "The average of shard p95s is not the global p95. A percentile is an order statistic, and order statistics need rank information to survive distributed aggregation."
---

Here is a sentence that has quietly lied inside many dashboards:

```text
global p95 = average(service p95s)
```

Sometimes the lie is small. Sometimes it is enormous.

A percentile is not a scalar measurement like total bytes or request count. It
is a rank statement about a population:

```text
95% of the observations are at or below this value
```

If you split that population across shards, hosts, regions, tenants, or time
windows, each local p95 answers a different question. Averaging those answers
does not reconstruct the global order statistic. Even traffic-weighting the
local p95s does not generally fix it.

The missing object is not a better mean.

The missing object is rank information.

## The Rank Contract

For sorted observations

$$
x_{(1)} \le x_{(2)} \le \cdots \le x_{(n)},
$$

one common empirical \(p\)-quantile is the item at rank

$$
\lceil pn \rceil.
$$

That definition is already a warning. The quantile depends on the relative order
of all observations. It is not a linear statistic:

$$
q_p(A \cup B) \ne \frac{|A|q_p(A)+|B|q_p(B)}{|A|+|B|}
$$

in general.

The counterexample can be tiny. Suppose shard A has 950 fast requests and 50
slow ones. Shard B has 10 very slow requests. The p95 of B is very slow, but B
may contribute too few samples to move the global p95 much. Or the reverse can
happen: a small shard can hide a concentrated tail that matters for a tenant but
barely moves the service-level percentile.

The number is answering a population question. Change the population, change
the question.

## Why Dashboards Get Tempted

Distributed systems love associative aggregates:

```text
sum counts locally, then sum again globally
sum bytes locally, then sum again globally
sum errors locally, then sum again globally
```

Percentiles do not behave like that. A local p95 throws away almost everything
about the local distribution except one threshold. Once the other ranks are
gone, the central aggregator cannot know whether the local p95 was surrounded
by a dense wall of samples or by a sparse tail.

This is the same reason histograms, sketches, and raw samples exist. They keep
some shape.

Greenwald and Khanna's 2001 paper framed the streaming quantile problem as
maintaining a small summary that can answer any quantile query within rank error
\(\epsilon n\), without storing the whole stream.[^gk] That phrase is the key:
the approximation is about rank, not directly about milliseconds or dollars or
feature values.

Later work sharpened the space tradeoffs. Karnin, Lang, and Liberty's KLL sketch
resolved an important randomized version of the streaming quantile problem,
giving a compact sketch with additive rank-error guarantees.[^kll] Dunning and
Ertl's t-digest takes a different practical route, clustering samples so it can
give especially good tail accuracy and support merging separately computed
summaries.[^tdigest]

The algorithms differ. The contract is shared:

```text
preserve enough rank structure to answer quantile questions later
```

## A Merge Lab

The lab below simulates latency streams split across shards. One shard may be
small but hot-tailed; another may be large and boring. It compares:

1. the true global percentile from all raw samples,
2. the unweighted average of local shard percentiles,
3. the traffic-weighted average of local shard percentiles,
4. a small mergeable toy rank sketch.

The sketch in this article is deliberately simple: each shard sorts its samples,
keeps weighted rank buckets, and the coordinator merges and recompresses those
buckets. It is not GK, KLL, or t-digest. It is a pedagogical sketch so the
invariant is visible: a mergeable summary carries weighted rank mass, not only a
single local percentile.

<style>
  .quantile-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .quantile-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .quantile-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .quantile-lab__controls input {
    accent-color: #2563eb;
    width: 100%;
  }

  .quantile-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .quantile-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .quantile-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.25rem;
    padding: 0.62rem 0.7rem;
  }

  .quantile-lab__metric span,
  .quantile-lab__legend,
  .quantile-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .quantile-lab__metric span {
    display: block;
  }

  .quantile-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .quantile-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .quantile-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 1rem;
    margin-top: 0.65rem;
  }

  .quantile-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .quantile-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .quantile-lab__note {
    margin: 0.65rem 0 0;
  }
</style>

<div class="quantile-lab" data-quantile-merge-lab>
  <div class="quantile-lab__controls">
    <label>
      Shards: <output data-value="shards">6</output>
      <input type="range" min="2" max="12" step="1" value="6" data-param="shards">
    </label>
    <label>
      Samples: <output data-value="samples">6k</output>
      <input type="range" min="1000" max="16000" step="500" value="6000" data-param="samples">
    </label>
    <label>
      Traffic imbalance: <output data-value="imbalance">72%</output>
      <input type="range" min="0" max="95" step="1" value="72" data-param="imbalance">
    </label>
    <label>
      Tail severity: <output data-value="tail">55%</output>
      <input type="range" min="0" max="100" step="1" value="55" data-param="tail">
    </label>
    <label>
      Percentile: <output data-value="percentile">p95</output>
      <input type="range" min="50" max="99" step="1" value="95" data-param="percentile">
    </label>
    <label>
      Sketch budget: <output data-value="budget">64</output>
      <input type="range" min="8" max="192" step="8" value="64" data-param="budget">
    </label>
    <label>
      Seed: <output data-value="seed">29</output>
      <input type="range" min="1" max="99" step="1" value="29" data-param="seed">
    </label>
  </div>
  <div class="quantile-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="680" aria-label="Mergeable quantile lab comparing true global percentile, averaged shard percentiles, weighted shard percentiles, and a compact rank sketch"></canvas>
  <div class="quantile-lab__legend">
    <span><i style="background:#0f766e"></i> True global percentile</span>
    <span><i style="background:#be123c"></i> Average of shard percentiles</span>
    <span><i style="background:#b45309"></i> Traffic-weighted average</span>
    <span><i style="background:#2563eb"></i> Merged sketch</span>
  </div>
  <p class="quantile-lab__note">
    Deterministic toy experiment. The sketch uses weighted rank buckets and
    merge/recompress; it is for visualization, not a production implementation
    or formal replacement for GK, KLL, DDSketch, HDR Histogram, or t-digest.
  </p>
</div>
<script defer src="{{ '/assets/js/quantile-merge-lab.js?v=20260614b' | relative_url }}"></script>

Start with the default. The small hot-tailed shard has a dramatic local p95, but
it has few requests. The unweighted average treats that shard as equal to the
busy shard. The traffic-weighted average is better, but it is still averaging
thresholds rather than merging ranks.

Now raise **Percentile** toward p99. Tail estimates become harder because there
are fewer samples in the region that matters. The value error can jump even when
rank error remains modest. This is why quantile sketch guarantees are usually
phrased in rank space.

Finally lower **Sketch budget**. The blue estimate starts to wobble. A sketch is
not magic; it is a controlled loss of rank information. More centroids buy more
rank resolution.

## Value Error Is Not Rank Error

A one-percent rank mistake can be harmless near a flat part of a distribution
and catastrophic in a steep tail.

Latency distributions often have exactly that shape. The median may live in a
dense cluster of ordinary requests. The p99 may sit on a cliff where a tiny rank
change moves the reported value from "slow" to "incident."

That is why a sketch can have a clean rank guarantee and still surprise you in
value units. The guarantee says something like:

```text
the returned item has rank within epsilon n of the requested rank
```

It does not say:

```text
the returned latency is within epsilon milliseconds
```

If the service distribution has a vertical wall in the tail, rank-accurate
answers can have large value movement. This is not a failure of the guarantee.
It is the shape of the data talking.

## Mergeability Is an Interface

For a distributed observability system, a quantile sketch is not only a data
structure. It is an interface contract between local collectors and central
aggregation.

The collector promises:

```text
I will send a compact object that preserves enough weighted rank mass
```

The coordinator promises:

```text
I will merge those objects and answer rank queries from the merged population
```

That is a different contract from "send me p95." Sending one percentile makes
the upstream system choose the query before the population is even assembled.
Sending a sketch delays that choice.

This matters operationally:

- you can ask for p50, p95, p99, and p99.9 from the same summary;
- you can merge regions, tenants, or time windows without raw samples;
- you can inspect rank error instead of pretending local thresholds average;
- you can choose different sketches depending on whether you care about tails,
  worst-case rank guarantees, merge cost, update speed, memory, or deletions.

The right sketch depends on the system. The wrong aggregator is easier to name:
do not average percentiles and call the result global.

## The Percentile Needs Its Population

The median of medians is not generally the median.

The average of p95s is not generally the p95.

The traffic-weighted average of p95s is still not generally the p95.

These facts feel annoying because dashboards want simple merge functions. But
the annoyance is the point. A percentile is not a scalar. It is a question about
where a rank lands in a population. If the population is distributed, the
evidence you merge has to preserve enough of the ordering.

The global p95 is not hiding inside the local p95s.

It is hiding inside the ranks they threw away.

## Reading Notes

[^gk]: Michael Greenwald and Sanjeev Khanna, "Space-Efficient Online Computation of Quantile Summaries," *SIGMOD*, 2001. [ACM](https://dl.acm.org/doi/10.1145/376284.375670), [PDF](https://infolab.stanford.edu/~datar/courses/cs361a/papers/quantiles.pdf).

[^kll]: Zohar S. Karnin, Kevin Lang, and Edo Liberty, "Optimal Quantile Approximation in Streams," *FOCS*, 2016. [arXiv](https://arxiv.org/abs/1603.05346), [PDF](https://ieee-focs.org/FOCS-2016-Papers/3933a071.pdf).

[^tdigest]: Ted Dunning and Otmar Ertl, "Computing Extremely Accurate Quantiles Using t-Digests," arXiv, 2019. [arXiv](https://arxiv.org/abs/1902.04023), [project](https://github.com/tdunning/t-digest), [paper PDF](https://raw.githubusercontent.com/tdunning/t-digest/master/docs/t-digest-paper/histo.pdf).
