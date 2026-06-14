---
layout: post
title: "A Sketch That Overcounts on Purpose"
description: "Count-Min is not a tiny dictionary. It is a deliberate one-sided bargain: lose identities, keep upper bounds, and budget the collision mass."
date: 2026-06-13 20:30:00 -0400
categories: computer-science
tags: [count-min-sketch, heavy-hitters, streaming-algorithms, probabilistic-data-structures, frequency-estimation, data-systems]
excerpt: "Count-Min estimates stream frequencies by sharing buckets. The useful trick is not avoiding collisions; it is making every error an overcount with a budget."
---

Exact counting feels innocent until the keyspace refuses to fit in memory.

Then a frequency table becomes a negotiation. Keep every key and pay the memory
bill, or compress the stream and accept a contract weaker than exactness but
stronger than a shrug.

The Count-Min Sketch is one of the cleanest contracts in streaming algorithms:
for nonnegative updates, the estimate of a key is never below its true count,
and with enough rows and columns the overcount is bounded with high
probability.[^cms]

That sentence is dangerously easy to say too quickly.

The sketch is not a small dictionary. It does not remember which keys exist. It
does not make collisions disappear. It keeps several hashed counter arrays and
asks whether at least one row was lucky enough to avoid too much collision mass.

A frequency estimate becomes a receipt for shared buckets.

## The Contract in Counters

Create a table with $$d$$ rows and $$w$$ columns. Each row has its own hash
function. When item $$x$$ appears with positive increment $$c$$, add $$c$$ to
one bucket in every row:

$$
C_{i,h_i(x)} \leftarrow C_{i,h_i(x)} + c.
$$

To estimate the frequency of $$x$$, read the $$d$$ buckets touched by $$x$$ and
take the minimum:

$$
\hat f(x) = \min_i C_{i,h_i(x)}.
$$

Every bucket contains the true count of $$x$$ plus counts from other keys that
collided with $$x$$ in that row. For positive streams, collision mass can only
add. Therefore

$$
\hat f(x) \ge f(x).
$$

The minimum is the escape hatch. If one row had fewer harmful collisions than
the others, the min chooses that row.

With width $$w=\lceil e/\epsilon\rceil$$ and depth
$$d=\lceil \ln(1/\delta)\rceil$$, the classic Count-Min guarantee says the
point-query estimate is at most $$f(x)+\epsilon \|f\|_1$$ with probability at
least $$1-\delta$$, under the usual hash-independence assumptions.[^cms]

The table has $$wd$$ counters.

That is the bargain:

```text
memory buys a collision budget, not exact identities
```

## Collision Bench

The lab below builds a deterministic Zipf-like stream, sketches it, and then
queries every key so the errors are visible. Real systems often do not get to
query every possible key. That is the point: Count-Min answers frequency
queries for candidate keys; it does not by itself enumerate all candidates.

<style>
  .cms-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .cms-lab__controls {
    display: grid;
    gap: 0.9rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(188px, 1fr));
  }

  .cms-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .cms-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .cms-lab__controls input {
    accent-color: #b45309;
    width: 100%;
  }

  .cms-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .cms-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.2rem;
    padding: 0.62rem 0.7rem;
  }

  .cms-lab__metric span,
  .cms-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .cms-lab__metric span {
    display: block;
  }

  .cms-lab__metric strong {
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .cms-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .cms-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="count-min-sketch-lab" class="cms-lab" data-cms-lab>
  <div class="cms-lab__controls">
    <label>
      Stream events: <output data-value="streamLength">40.0k</output>
      <input type="range" min="5000" max="120000" step="5000" value="40000" data-param="streamLength">
    </label>
    <label>
      Distinct keys: <output data-value="universe">512</output>
      <input type="range" min="64" max="1024" step="64" value="512" data-param="universe">
    </label>
    <label>
      Zipf skew: <output data-value="skew">1.10</output>
      <input type="range" min="50" max="200" step="5" value="110" data-param="skew">
    </label>
    <label>
      Sketch width: <output data-value="width">64</output>
      <input type="range" min="8" max="256" step="8" value="64" data-param="width">
    </label>
    <label>
      Sketch depth: <output data-value="depth">4</output>
      <input type="range" min="1" max="8" step="1" value="4" data-param="depth">
    </label>
    <label>
      Heavy threshold: <output data-value="threshold">2.0%</output>
      <input type="range" min="0.5" max="10" step="0.5" value="2" data-param="threshold">
    </label>
    <label>
      Probe rank: <output data-value="probeRank">80</output>
      <input type="range" min="1" max="512" step="1" value="80" data-param="probeRank">
    </label>
  </div>
  <div class="cms-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Count-Min Sketch lab showing top-key overcounts, sketch heatmap, error histogram, and heavy-hitter threshold decisions"></canvas>
  <p class="cms-lab__note">
    Deterministic positive-count stream. The epsilon*N line is the classic
    Count-Min point-query error scale using epsilon = e / width. Actual errors
    depend on the stream and these fixed hash functions.
  </p>
</div>
<script defer src="{{ '/assets/js/count-min-sketch-lab.js?v=20260613a' | relative_url }}"></script>

At the default setting, the top keys are almost exact because their counts are
large enough that a clean row usually exists. Tail keys are messier. The probe
key at rank 80 has true count 62 and estimated count 128 in the default stream:
the extra 66 events are not mysterious error. They are other keys sharing the
least-bad bucket.

Raise **Sketch width**. Buckets get less crowded, so the p95 and maximum
overcounts fall.

Raise **Sketch depth**. The estimate takes the minimum over more independent
rows. For a fixed family of rows, adding rows cannot increase a point estimate;
it gives the key more chances to find a cleaner bucket.

Raise **Zipf skew**. The head becomes heavier. Heavy keys become easier to find,
but a collision with a head key can contaminate a tail estimate badly.

Lower **Heavy threshold**. You ask the sketch to distinguish smaller counts.
False positives become more likely because overcounted tail keys can cross the
gate.

The one-sided nature is visible in the plot: estimates sit above truth, never
below it. That property is useful when false negatives are more expensive than
false positives.

## Counts Are Not Names

There are two related tasks that are easy to blur:

```text
estimate the count of key x
find the keys whose counts are large
```

Count-Min is naturally a point-query sketch. If you know the key, it can give an
upper-biased estimate for that key. But the sketch table contains counters, not
key names. A large counter might be one large key, several medium keys, or many
small keys colliding.

In the lab, we cheat by querying every synthetic key after the stream is built.
Production systems need a candidate source: a sampled dictionary, a heap of
observed keys, a separate heavy-hitter algorithm, a shard-local candidate list,
or a known query set.

Misra and Gries gave an older deterministic streaming algorithm for finding
frequent elements with a bounded number of counters.[^misra] Space-Saving later
became a practical counter-based method for frequent and top-$$k$$ elements in
streams.[^spacesaving] Those algorithms store candidate identities. Count-Min
stores compressed evidence about counts.

That difference is not bookkeeping. It is the boundary between estimating a
known account and discovering which accounts deserve attention.

If your question is "how many times did this account appear?", Count-Min is a
natural fit. If your question is "which accounts are the largest?", Count-Min
needs help remembering candidate names.

## The Shape of the Overcount

A Count-Min estimate can be written as

$$
\hat f(x) = f(x) + \min_i \sum_{y \ne x: h_i(y)=h_i(x)} f(y).
$$

The error is the smallest collision load across the rows.

That formula is more useful than the theorem when debugging a system. It tells
you what to inspect:

- Are there a few very heavy keys contaminating many buckets?
- Are hash functions fixed and independent enough for the workload?
- Did a deployment accidentally change hash seeds, making sketches impossible
  to merge?
- Is the stream positive-only, or do deletions break the one-sided guarantee?
- Are estimates being interpreted as exact counts downstream?

The original Count-Min paper emphasizes a wide range of uses: point queries,
inner products, range queries, quantiles, and heavy hitters, all built around a
small linear sketch.[^cms] The 2008 empirical comparison by Cormode and
Hadjieleftheriou is a useful antidote to treating any sketch as universally
best: different frequency-estimation and heavy-hitter methods win in different
accuracy, memory, update-speed, and query-speed regimes.[^finding]

The practical question is rarely "is the sketch elegant?" It is:

```text
which error shape can this product tolerate?
```

One-sided overcount is excellent for conservative filters. It is awkward for
billing. It is useful for candidate generation. It is dangerous when a
thresholded estimate becomes an irreversible enforcement action.

## When Deletions Enter

The Count-Min story above assumes nonnegative updates: events arrive and counts
increase.

If updates can be negative, the one-sided argument breaks. A bucket collision
can subtract mass as well as add it. The minimum of rows no longer means "least
overcount." In turnstile settings with insertions and deletions, Count Sketch
and related signed sketches are often the right starting point.[^countsketch]

This is not a minor implementation detail. It is a change in the error model.

Cash-register stream:

```text
counts only go up
collision mass only inflates estimates
```

Turnstile stream:

```text
counts can go up or down
collisions can cancel, inflate, or deflate
```

The same table shape does not imply the same promise.

## Before Shipping the Sketch

Before using Count-Min in a real service, I would want a ledger:

- Is the stream positive-only?
- What is the acceptable false-positive cost from overestimation?
- What total mass $$\|f\|_1$$ defines the error scale?
- What $$w,d$$ correspond to the desired $$\epsilon,\delta$$?
- Are hash seeds fixed, versioned, and shared across shards for merging?
- Is there a candidate-key source for heavy-hitter enumeration?
- Are estimates used as upper bounds, approximate features, or final counts?
- Are counters wide enough to avoid overflow?
- Does the workload have adversarial keys or pathological hash interactions?
- Are sketches reset, aged, windowed, or exponentially decayed?
- How are confidence intervals communicated to downstream users?

The reset/windowing line is important. Count-Min is a memory-saving structure,
not a forgetting policy. If you want recent frequency rather than all-time
frequency, the time model has to be designed explicitly.

## The Line I Would Remember

The Count-Min Sketch does not remove keys from memory for free.

It replaces exact identity-indexed counters with a few shared counter arrays.
Every estimate is the true count plus collision mass. Width makes collisions
smaller. Depth gives more chances for a clean row. The minimum is not magic; it
is the least contaminated witness.

[^cms]: Graham Cormode and S. Muthukrishnan, ["An Improved Data Stream Summary: The Count-Min Sketch and its Applications"](https://dimacs.rutgers.edu/~graham/pubs/papers/cm-full.pdf), *Journal of Algorithms*, 55(1), 2005.

[^misra]: J. Misra and David Gries, ["Finding Repeated Elements"](https://www.cs.utexas.edu/users/misra/scannedPdf.dir/FindRepeatedElements.pdf), *Science of Computer Programming*, 2(2), 1982.

[^spacesaving]: Ahmed Metwally, Divyakant Agrawal, and Amr El Abbadi, ["Efficient Computation of Frequent and Top-k Elements in Data Streams"](https://www.cs.ucsb.edu/sites/default/files/documents/2005-23.pdf), ICDT 2005.

[^finding]: Graham Cormode and Marios Hadjieleftheriou, ["Finding Frequent Items in Data Streams"](https://www.vldb.org/pvldb/vol1/1454225.pdf), *PVLDB*, 1(2), 2008.

[^countsketch]: Moses Charikar, Kevin Chen, and Martin Farach-Colton, ["Finding Frequent Items in Data Streams"](https://www.cs.princeton.edu/courses/archive/spring04/cos598B/bib/CharikarCF.pdf), ICALP 2002.
