---
layout: post
title: "The Count That Forgets Names"
description: "HyperLogLog is the strange bargain behind large-scale distinct counts: forget identities, keep rare hash patterns, and still estimate how many unique things passed by."
date: 2026-06-13 07:58:00 -0400
categories: computer-science
tags: [hyperloglog, streaming-algorithms, cardinality-estimation, sketches, probabilistic-data-structures, databases]
excerpt: "A set answers by remembering every identity. HyperLogLog answers by keeping only the rarest hash patterns, and that loss of memory is the useful part."
---

A dashboard asks a harmless question:

```text
how many distinct users did this?
```

The literal answer is a set. Put every user ID into memory, deduplicate, count
the set. This is perfect at small scale and silly at large scale. The object
that answers the question becomes a second copy of the data you were trying to
summarize.

There is a different kind of answer. It does not store the users. It stores a
compressed statistical accident of their hashes. The result is not exact, but it
is mergeable, streaming, and small enough to live inside systems where exact
sets would be operational furniture.

That answer is HyperLogLog, a counter with almost no guest list.

It is a beautiful algorithm because it makes a very sharp bargain:

```text
forget the identities, remember the surprise
```

## Rare Zeros Do the Talking

Hash each identity into a string of random-looking bits. If the hash begins with
one zero before its first one, that is common. Two leading zeros are less common.
Ten leading zeros are rare. Seeing a very rare pattern is weak evidence that
many distinct items have passed through the stream.

For an ideal hash, the probability that a hash has at least $$r$$ leading zeros
is:

$$
P(\rho \ge r) = 2^{-r}.
$$

So if the largest observed value of $$\rho$$ is around 16, the stream was
probably not tiny. A single extreme is noisy, though. It is like estimating the
height of a population from the tallest person you happened to meet.

Flajolet and Martin's probabilistic counting made this idea useful for database
applications: hash the stream, look for rare bit patterns, and estimate
cardinality in one pass with small memory.[^flajolet-martin] Morris's earlier
approximate counter was not a distinct counter, but it had the same spirit:
store a logarithmic trace of a large count rather than the count itself.[^morris]

HyperLogLog adds a second trick: do not trust one tall tale.

## Many Buckets, Many Rumors

LogLog already split the stream into many sub-estimators and averaged their
signals.[^loglog] HyperLogLog keeps that bucketed intuition and changes how the
signals are combined.

Split the hash into two pieces. The first $$p$$ bits choose a bucket:

$$
j(x) \in \{1,\dots,m\},
\qquad
m = 2^p.
$$

The remaining bits produce the rarity score $$\rho(x)$$. For each bucket, keep
only the largest rarity ever seen:

$$
R_j
= \max_{x: j(x)=j} \rho(x).
$$

That is the whole sketch: $$m$$ small registers. Duplicates are harmless because
the same identity hashes to the same bucket and the same rarity. Re-seeing it
does not change the maximum.

The raw HyperLogLog estimate is:

$$
E =
\alpha_m m^2
\left(\sum_{j=1}^{m}2^{-R_j}\right)^{-1}.
$$

The harmonic mean is doing real work. A few buckets will see unusually large
rarities. An arithmetic mean would let those lucky buckets shout. The harmonic
mean puts more weight on the quieter buckets and makes the combined estimator
less excitable.

The famous rule of thumb is:

$$
\mathrm{standard\ error} \approx \frac{1.04}{\sqrt{m}}.
$$

The original HyperLogLog paper gives this accuracy, single-pass behavior, and
small-memory story explicitly; it also reports estimates beyond $$10^9$$ with
about 2 percent typical accuracy using roughly 1.5 kilobytes.[^hll] Later
engineering work by Heule, Nunkesser, and Hall improved bias behavior and memory
use in important cardinality ranges, giving the version many people meet as
HyperLogLog++.[^hll-practice]

The algorithm is not magic. It is a carefully tuned extreme-value instrument.

## A Counter With No Guest List

The lab below uses a compact 32-bit hash for browser speed. That is fine for the
toy ranges here. Production systems usually use larger hashes and more careful
engineering because hash collisions eventually become the experiment.

Try three things:

1. lower **Register exponent** and watch the error band widen;
2. increase **Distinct keys** and notice that HLL memory does not move;
3. increase **Duplicate passes** and notice that the stream gets longer while
   the distinct estimate stays pointed at the same question.

The purple curve is a linear-counting bitmap with the same bit budget as the
HLL registers. It is a good foil. A bitmap is excellent while many bits are
empty. Once nearly all bits are occupied, the zeros disappear and the estimator
has no air left to breathe.

<div class="hll-lab" data-hll-lab>
  <div class="hll-lab__controls">
    <label>
      Distinct keys: <output data-value="uniques">50,000</output>
      <input type="range" min="1000" max="160000" step="1000" value="50000" data-param="uniques">
    </label>
    <label>
      Register exponent: <output data-value="precision">p=10 / 1,024 regs</output>
      <input type="range" min="4" max="14" step="1" value="10" data-param="precision">
    </label>
    <label>
      Duplicate passes: <output data-value="duplicates">5x</output>
      <input type="range" min="1" max="20" step="1" value="5" data-param="duplicates">
    </label>
    <label>
      Trials: <output data-value="trials">28</output>
      <input type="range" min="8" max="40" step="1" value="28" data-param="trials">
    </label>
    <label>
      Shards to merge: <output data-value="shards">4</output>
      <input type="range" min="1" max="16" step="1" value="4" data-param="shards">
    </label>
    <label>
      Exact key bytes: <output data-value="exactBytes">16 B/key</output>
      <input type="range" min="8" max="48" step="4" value="16" data-param="exactBytes">
    </label>
  </div>
  <div class="hll-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="660" aria-label="HyperLogLog simulator showing error distribution, register histogram, load curve, and memory comparison"></canvas>
  <div class="hll-lab__legend">
    <span><i style="background:#0f766e"></i> HyperLogLog</span>
    <span><i style="background:#7c3aed"></i> Same-bit bitmap</span>
    <span><i style="background:#be123c"></i> Exact set memory</span>
    <span><i style="background:#2563eb"></i> Register histogram</span>
  </div>
  <p class="hll-lab__note">
    Deterministic synthetic experiment. It uses the classical HLL estimator with
    the small-range linear-counting correction. Memory assumes 6-bit registers
    and a simple exact-set payload estimate; real hash tables have overhead and
    production HLL implementations use additional engineering.
  </p>
</div>
<script src="{{ '/assets/js/hyperloglog-lab.js?v=20260613a' | relative_url }}"></script>

The default setting uses $$m=1024$$ registers, which predicts a standard error
near 3.25 percent. That number is not a worst-case guarantee for every hash
family and every input adversary. It is the sampling scale of the estimator
under the usual idealized hashing assumption.

Move the register exponent from 10 to 14. Memory rises from 768 bytes to 12
kilobytes if we budget 6 bits per register, while the expected standard error
falls from about 3.25 percent to about 0.81 percent. That square-root law is the
price list. To halve error, spend about four times as many registers.

Move the duplicate slider. The lab reports more stream events, but the sketch
does not care. This is the idempotence hiding in the algorithm. Each update is:

$$
R_j := \max(R_j, \rho(x)).
$$

Applying the same update twice changes nothing. That is why HLL can survive
retries, replay, and duplicate logs as long as the identity being counted is
stable.

Move the shard slider. Each shard builds its own sketch, then the lab merges
the sketches by taking the registerwise maximum. The merged sketch is exactly
the same as the direct sketch over the union:

$$
R^{A \cup B}_j
= \max(R^A_j, R^B_j).
$$

This is why HLL is such a natural systems primitive. It does not merely fit in
memory. It composes. A database partition, a browser client, a data center, and
a batch job can each carry a small sketch; the union is another small sketch.

## What Empty Bits Teach

A bitmap counter is the simpler cousin. Hash each distinct key into one of
$$B$$ bits. Let $$V$$ be the number of empty bits. Then:

$$
\hat{n} = -B \log(V/B).
$$

When many bits are empty, this is excellent. It is also intuitive: occupancy
tells you how many balls were thrown into bins. But if $$V$$ goes to zero, the
estimate saturates. There is no remaining empty-space signal.

HyperLogLog throws away the exact occupancy pattern and keeps a coarser record
of rare events inside many buckets. That is a worse use of memory for very small
cardinalities, which is why practical implementations use sparse modes and
small-range corrections. It is a much better use of memory once the stream grows
large relative to the sketch.

The lesson is not "HLL beats everything." The lesson is sharper:

```text
the right sketch depends on which statistic will remain informative
after the data becomes too large to remember
```

## Three Unquiet Assumptions

The first assumption is identity. "Distinct users" sounds easy until one person
has three devices, one bot has ten thousand cookies, and privacy policy changes
which joins are allowed. HyperLogLog estimates the number of distinct keys you
feed it. It does not decide whether the keys mean people, browsers, accounts,
households, queries, or accidents of instrumentation.

The second assumption is hash quality. The math wants uniform, stable,
independent-looking bits. A weak hash can turn structure in the input into
structure in the registers. A 32-bit hash is also the wrong tool for enormous
cardinalities because collisions become material. The sketch is only as clean
as the randomized lens in front of it.

The third assumption is downstream humility. An HLL count is a noisy statistic.
If you put it inside an A/B test, a billing system, a risk report, or an alert,
the estimator variance becomes part of the next calculation. The sketch made
one number cheap. It did not make uncertainty disappear.

## Before Trusting the Number

Before trusting an approximate distinct count, I want to know:

- what exact identity is being counted;
- whether the hash is stable across languages, services, and time;
- how many registers are used and what standard error that implies;
- whether the implementation uses sparse mode, bias correction, and large-hash
  safeguards;
- whether sketches are merged only across compatible versions and salts;
- whether downstream decisions can tolerate the estimator noise;
- whether the sketch is being mistaken for anonymization.

The privacy line matters. A sketch is not a list of user IDs, which is good. But
"not a list" is not the same as "safe under all joins, salts, and side
information." Treat it as reduced data, not purified data.

## The Shape It Leaves Behind

Exact counting remembers every witness.

HyperLogLog keeps a row of small registers, each one saying something like:

```text
in my bucket, the rarest hash I saw had 11 leading zeros
```

No register knows who caused that event. No register can enumerate the stream.
Together, the registers form a statistical silhouette of cardinality.

That is the strange power of the algorithm. It answers a question about a set by
not keeping the set. It turns identity into randomness, randomness into
extremes, extremes into a harmonic mean, and a harmonic mean into an operational
number small enough to ship around a distributed system.

Counting without remembering is not free. It costs accuracy, assumptions, and
some mathematical trust.

But in the right place, that is a magnificent trade.

## References

[^morris]: Robert Morris, ["Counting Large Numbers of Events in Small Registers"](https://graphics.stanford.edu/courses/cs321/Private/Readings/p840-morris.pdf), *Communications of the ACM*, 1978. Morris's counter estimates event counts rather than distinct counts, but it is a classic ancestor of probabilistic counting with tiny state.

[^flajolet-martin]: Philippe Flajolet and G. Nigel Martin, ["Probabilistic Counting Algorithms for Data Base Applications"](https://algo.inria.fr/flajolet/Publications/FlMa85.pdf), *Journal of Computer and System Sciences*, 1985.

[^loglog]: Marianne Durand and Philippe Flajolet, ["LogLog Counting of Large Cardinalities"](https://algo.inria.fr/flajolet/Publications/DuFl03-LNCS.pdf), *ESA 2003*. LogLog is the direct predecessor that HyperLogLog improves.

[^hll]: Philippe Flajolet, Eric Fusy, Olivier Gandouet, and Frederic Meunier, ["HyperLogLog: the analysis of a near-optimal cardinality estimation algorithm"](https://dmtcs.episciences.org/3545), *Discrete Mathematics and Theoretical Computer Science Proceedings*, 2007. [PDF](https://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf).

[^hll-practice]: Stefan Heule, Marc Nunkesser, and Alex Hall, ["HyperLogLog in Practice: Algorithmic Engineering of a State of The Art Cardinality Estimation Algorithm"](https://research.google/pubs/hyperloglog-in-practice-algorithmic-engineering-of-a-state-of-the-art-cardinality-estimation-algorithm/), *EDBT*, 2013. [PDF](https://research.google.com/pubs/archive/40671.pdf).
