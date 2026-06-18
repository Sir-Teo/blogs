---
layout: post
title: "The Quantile Keeps Five Markers"
description: "The P2 algorithm estimates one streaming quantile with five moving markers. Its strength is fixed memory; its price is that the error is empirical, not a mergeable rank guarantee."
date: 2026-06-18 08:05:00 -0400
categories: statistics
tags: [p2-algorithm, quantiles, streaming-statistics, online-algorithms, sketches, visualization]
excerpt: "A running mean can update one number. A running quantile has to remember rank. Jain and Chlamtac's P2 algorithm tries to do that with five markers and a parabolic nudge."
---

A running average has a friendly recurrence. A running quantile does not.

If the next observation is huge, the mean knows exactly how much to move. The
median has a different problem: it is not a sum, it is a rank. To know whether
the middle moved, the obvious algorithm stores the observations, sorts them, and
asks for the item at the target rank.

The P2 algorithm is a small, useful gamble against that storage bill. Raj Jain
and Imrich Chlamtac introduced it in 1985 for dynamic quantile and histogram
calculation without storing the observations.[^p2] For one target quantile
`p`, it keeps five markers:

```text
q1 = current minimum
q2 = current estimate of the p/2 quantile
q3 = current estimate of the p quantile
q4 = current estimate of the (1+p)/2 quantile
q5 = current maximum
```

The third marker is the answer. The other four markers are there so the answer
has a local shape to lean on.

## What The Markers Remember

Each marker has two coordinates:

```text
q_i   height: the value estimate
n_i   position: how many observations should sit at or below it
n_i*  desired position: where that marker would be on the ideal CDF
```

After the first five observations are sorted, the marker heights are just those
five values. From then on, each new observation finds the cell it belongs to,
increments the actual positions to its right, and advances the desired positions
by fixed amounts:

```text
dn* = [0, p/2, p, (1+p)/2, 1]
```

For a prefix of length `n`, the desired positions are:

```text
n1* = 1
n2* = 1 + (n-1)p/2
n3* = 1 + (n-1)p
n4* = 1 + (n-1)(1+p)/2
n5* = n
```

When a middle marker is at least one position away from where it wants to be,
and moving it would not collide with a neighbor, P2 moves it by one position.
The height update first tries the parabolic interpolation through the three
adjacent markers:

```text
d in {-1, +1}

q_i' = q_i + d/(n_{i+1} - n_{i-1}) * (
  (n_i - n_{i-1} + d) * (q_{i+1} - q_i) / (n_{i+1} - n_i)
  + (n_{i+1} - n_i - d) * (q_i - q_{i-1}) / (n_i - n_{i-1})
)
```

If that prediction would break the sorted order of marker heights, the algorithm
falls back to a linear step toward the neighbor in the direction of travel:

```text
q_i' = q_i + d * (q_{i+d} - q_i) / (n_{i+d} - n_i)
```

This is why the estimator feels unlike a histogram. It is not counting in fixed
buckets. It is dragging a tiny sketch of the empirical CDF through the stream.

## Lab: The Markers Chase The Rank

The lab compares the P2 estimate with an exact prefix quantile computed from
the stored sorted observations. The exact line is allowed to cheat. The P2 line
only sees one observation at a time and keeps five marker heights.

<style>
  .p2-lab {
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

  .p2-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .p2-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .p2-lab select,
  .p2-lab input {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    box-sizing: border-box;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.48rem 0.52rem;
    width: 100%;
  }

  .p2-lab input {
    accent-color: #2563eb;
    padding: 0;
  }

  .p2-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .p2-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin-bottom: 0.85rem;
  }

  .p2-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    min-width: 0;
    padding: 0.62rem 0.68rem;
  }

  .p2-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .p2-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.24rem;
  }

  .p2-lab__metric--good strong {
    color: #0f766e;
  }

  .p2-lab__metric--warn strong {
    color: #b45309;
  }

  .p2-lab canvas {
    aspect-ratio: 980 / 720;
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-height: 760px;
    width: 100%;
  }

  .p2-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 620px) {
    .p2-lab {
      padding: 0.85rem;
    }

    .p2-lab canvas {
      aspect-ratio: 430 / 860;
      max-height: none;
    }
  }
</style>

<div class="p2-lab" data-p2-quantile-lab>
  <div class="p2-lab__controls">
    <label>
      Stream
      <select data-param="scenario">
        <option value="latency" selected>bursty latency</option>
        <option value="drift">slow drift</option>
        <option value="shift">regime shift</option>
      </select>
    </label>
    <label>
      Quantile <output data-value="percentile">p95</output>
      <input data-param="percentile" type="range" min="50" max="99" step="1" value="95">
    </label>
    <label>
      Samples <output data-value="samples">4.2k</output>
      <input data-param="samples" type="range" min="400" max="6000" step="100" value="4200">
    </label>
    <label>
      Seed <output data-value="seed">17</output>
      <input data-param="seed" type="range" min="1" max="99" step="1" value="17">
    </label>
  </div>
  <div class="p2-lab__metrics" data-metrics></div>
  <canvas data-canvas width="980" height="720" aria-label="P2 streaming quantile estimator lab with exact prefix quantile, marker positions, and error trace"></canvas>
  <p class="p2-lab__note">The exact reference stores the whole prefix and uses the paper-style rounded order statistic. P2 keeps only five marker heights for this one target quantile.</p>
</div>

<script defer src="{{ '/assets/js/p2-quantile-lab.js?v=20260618a' | relative_url }}"></script>

On the default run, the stored exact p95 and the P2 estimate nearly agree, but
that is an empirical result of this stream, not a theorem. Change the stream to
the regime shift and watch the interpretation change: P2 is estimating the
quantile of the whole prefix, not the latest regime. The "lag" is not a bug in
that setting. It is the question being asked.

## What The Audit Checks

The exported Node audit runs three stream families at p50, p90, and p95. For
each run it checks:

```text
the generated sample count matches the requested count
marker heights stay in nondecreasing order
actual marker positions stay strictly increasing
desired marker positions stay monotone and finite
the estimate remains inside the observed value range
the exact and estimated history are finite
the final estimate has rank error no larger than 0.12
```

The default run currently reports:

```json
{
  "defaultAbsError": 0.981,
  "defaultRankError": 0.0036,
  "ok": true,
  "scenarios": 3
}
```

That last rank-error threshold is deliberately loose because P2 is a heuristic.
The useful fact to test is not "this always nails p95." It is:

```text
with five markers, on these deterministic streams,
the estimator remains ordered, finite, inspectable, and close enough to compare
```

## What This Is Not

P2 is not a mergeable quantile sketch. If two machines each keep five P2
markers, there is no general operation that combines those ten markers into the
same result as processing the raw observations in one order. That is a major
difference from the sketching problem faced by distributed observability
systems.

P2 also does not give the deterministic rank-error contract associated with
formal streaming summaries. It is appealing because the memory is tiny and
constant. That appeal is real. So is the cost: accuracy is something you measure
for the streams you care about.

The five markers are a good mental model for a broader lesson. Approximate
statistics are not just smaller exact statistics. They carry a contract. Here
the contract is:

```text
one target quantile
one pass
fixed memory
not mergeable
empirical accuracy
```

That is a perfectly respectable contract, as long as it is the one you meant to
sign.

[^p2]: Raj Jain and Imrich Chlamtac, ["The P2 algorithm for dynamic calculation of quantiles and histograms without storing observations"](https://dl.acm.org/doi/10.1145/4372.4378), *Communications of the ACM* 28(10), 1985, pp. 1076-1085. Metadata and abstract are available through [WashU Research Profiles](https://profiles.wustl.edu/en/publications/the-psup2sup-algorithm-for-dynamic-calculation-of-quantiles-and-h/). A public PDF is hosted by Raj Jain's Washington University page: [psqr.pdf](https://www.cse.wustl.edu/~jain/papers/ftp/psqr.pdf).
