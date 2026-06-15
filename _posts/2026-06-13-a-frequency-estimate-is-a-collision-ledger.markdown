---
layout: post
title: "Collisions Keep the Receipts"
description: "Count-Min is not a tiny dictionary. It is a one-sided bargain: lose identities, keep upper bounds, and budget the collision mass."
date: 2026-06-13 20:30:00 -0400
categories: computer-science
series: probabilistic-data-structures
tags: [count-min-sketch, heavy-hitters, streaming-algorithms, probabilistic-data-structures, frequency-estimation, data-systems]
excerpt: "Count-Min estimates stream frequencies by sharing buckets. The useful trick is not avoiding collisions; it is making every error an overcount with a budget."
---

Exact counting feels innocent right up to the moment the keyspace refuses to fit
in memory.

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

## Counter Contract

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
    max-width: 100%;
    overflow: hidden;
    padding: 1rem;
  }

  .cms-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .cms-lab__controls label,
  .cms-lab__metric span,
  .cms-lab__note,
  .cms-lab__legend {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .cms-lab__controls label {
    display: grid;
    font-weight: 650;
    gap: 0.35rem;
    min-width: 0;
  }

  .cms-lab__controls input {
    accent-color: #be123c;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .cms-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
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
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .cms-lab__metric span {
    display: block;
  }

  .cms-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .cms-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .cms-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .cms-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .cms-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .cms-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 680px) {
    .cms-lab {
      padding: 0.8rem;
    }

    .cms-lab__controls,
    .cms-lab__metrics {
      grid-template-columns: 1fr;
    }

    .cms-lab canvas {
      height: 1120px;
    }
  }
</style>

<div id="count-min-sketch-lab" class="cms-lab" data-count-min-sketch-lab>
  <div class="cms-lab__controls">
    <label>
      Stream events <output data-output="events">50,000</output>
      <input type="range" min="5000" max="120000" step="5000" value="50000" data-param="events" aria-label="Stream events">
    </label>
    <label>
      Vocabulary <output data-output="vocabulary">2,000</output>
      <input type="range" min="100" max="8000" step="100" value="2000" data-param="vocabulary" aria-label="Vocabulary size">
    </label>
    <label>
      Zipf skew <output data-output="skew">1.05</output>
      <input type="range" min="0" max="150" step="5" value="105" data-param="skew" aria-label="Zipf skew">
    </label>
    <label>
      Width <output data-output="width">128</output>
      <input type="range" min="32" max="512" step="16" value="128" data-param="width" aria-label="Sketch width">
    </label>
    <label>
      Depth <output data-output="depth">5</output>
      <input type="range" min="1" max="8" step="1" value="5" data-param="depth" aria-label="Sketch depth">
    </label>
    <label>
      Heavy threshold <output data-output="threshold">1.0%</output>
      <input type="range" min="2" max="60" step="1" value="10" data-param="threshold" aria-label="Heavy hitter threshold">
    </label>
    <label>
      Query rank <output data-output="queryRank">#6</output>
      <input type="range" min="1" max="40" step="1" value="6" data-param="queryRank" aria-label="Query rank">
    </label>
    <label>
      Seed <output data-output="seed">37</output>
      <input type="range" min="1" max="9999" step="1" value="37" data-param="seed" aria-label="Random seed">
    </label>
  </div>
  <div class="cms-lab__metrics" data-metrics></div>
  <canvas data-canvas width="980" height="760" aria-label="Count-Min Sketch lab comparing exact counts, classic Count-Min estimates, conservative updates, collision heat, and heavy-hitter threshold decisions"></canvas>
  <div class="cms-lab__legend">
    <span><i style="background:#334155"></i> Exact count</span>
    <span><i style="background:#be123c"></i> Classic Count-Min</span>
    <span><i style="background:#0f766e"></i> Conservative update</span>
    <span><i style="background:#7c3aed"></i> Query / bound</span>
    <span><i style="background:#d97706"></i> Collision heat</span>
  </div>
  <p class="cms-lab__note">
    Deterministic insertion-only stream. The lab keeps exact counts for
    verification, but the sketches see only hashed updates. The epsilon*N line is
    the classic Count-Min point-query error scale using epsilon = e / width.
    Conservative update is shown as an engineering comparison; the displayed
    epsilon/delta contract is the standard Count-Min contract.
  </p>
</div>
<script defer src="{{ '/assets/js/count-min-sketch-lab.js?v=20260614b' | relative_url }}"></script>

The default stream has `50,000` events over a `2,000` key vocabulary with a
moderate Zipf skew. The sixth-ranked key appears `1,067` times. The classic
Count-Min estimate is `1,145`; conservative update lands exactly on `1,067` for
this seed. That does not mean conservative update is exact. It means the
least-contaminated counters for this key were protected from some unnecessary
increments.

Raise **Width**. Buckets get less crowded, so the p95 overcount and false
positive count usually fall. Lower it to `32` and the threshold panel becomes a
small disaster: almost every tail key can be pushed over a `1%` gate by
collision mass.

Raise **Depth**. The estimate takes the minimum over more rows. More rows give a
key more chances to find a clean bucket, but they also cost update work and
memory. With depth `1`, "minimum" means "the only row," and the sketch is just a
single shared hash table.

Move **Zipf skew**. A heavy head makes the true heavy hitters easier to spot,
but a collision with a head key can poison a tail estimate. Uniform streams have
less spectacular head collisions, yet many similarly sized keys compete near the
threshold.

Lower **Heavy threshold**. You ask the sketch to distinguish smaller counts.
Because estimates sit above truth, false positives are the natural failure mode
when the candidate set is enumerated. The lab's audit checks exactly this:
classic Count-Min and conservative update do not miss enumerated true heavy
keys in the positive stream, but they may accuse extra keys.

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

## Anatomy of an Overcount

A Count-Min estimate can be written as

$$
\hat f(x) = f(x) + \min_i \sum_{y \ne x: h_i(y)=h_i(x)} f(y).
$$

The error is the smallest collision load across the rows.

Conservative update changes the write rule, not the query rule. Instead of
incrementing every touched counter, it reads the current minimum for the key and
increments only the counters that equal that minimum. Estan and Varghese used
this idea in traffic-measurement filters as one of several practical
optimizations for detecting large flows.[^estan]

The intuition is simple: if one row is already inflated, do not inflate it
again merely because the key arrived. This can sharply reduce overcount in
practice, as the lab shows. It is still a sketch, not a certificate of truth.
Its behavior is more delicate to analyze than the classic Count-Min update, and
the standard $$\epsilon,\delta$$ line in the lab belongs to the classic
construction.

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

## When Deletions Walk In

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

## Preflight for the Sketch

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

[^countsketch]: Moses Charikar, Kevin Chen, and Martin Farach-Colton, ["Finding Frequent Items in Data Streams"](https://www.cs.princeton.edu/courses/archive/spr04/cos598B/bib/CharikarCF.pdf), ICALP 2002.

[^estan]: Cristian Estan and George Varghese, ["New Directions in Traffic Measurement and Accounting: Focusing on the Elephants, Ignoring the Mice"](https://cse.ucsd.edu/~varghese/PAPERS/tocs2003.pdf), *ACM Transactions on Computer Systems*, 21(3), 2003.
