---
layout: post
title: "The Fingerprint Has Two Homes"
description: "A cuckoo filter keeps only short fingerprints, so deletion works because each fingerprint still carries enough information to find its other bucket."
date: 2026-06-17 10:20:00 -0400
categories: computer-science
series: probabilistic-data-structures
tags: [cuckoo-filters, approximate-membership, bloom-filters, cuckoo-hashing, fingerprints, probabilistic-data-structures, data-structures]
excerpt: "A Bloom filter smears each key across bits. A cuckoo filter keeps a tiny fingerprint in one of two buckets, making lookup local and deletion possible, but the fingerprint length pays for every slot you inspect."
---

A Bloom filter answers membership by spreading a key across a bit array.

That is a beautiful trick until you ask to delete one key.

If a key set bit 17, bit 17 may also be needed by many other keys. Clearing it
would create false negatives. Counting Bloom filters repair this by replacing
bits with counters, but the counters spend space. The one-sided guarantee was
cheap because the structure forgot who set each bit.

A cuckoo filter changes what gets forgotten.[^fan]

It still does not store the key. It stores only a short fingerprint. But it
stores that fingerprint in a small bucketed hash table, not smeared across many
unrelated positions. A lookup checks two buckets. A delete removes one matching
fingerprint from those same buckets. An insertion may kick old fingerprints to
their alternate homes.

The whole design lives inside a small invariant:

```text
the table forgets the key
but the fingerprint still knows its other bucket
```

## The Badge Replaces the Key

An approximate membership filter has a one-sided contract:

```text
no  -> definitely absent
yes -> probably present
```

The "probably" comes from collisions. If an absent key receives the same stored
evidence as a present key, the filter says yes. That is allowed. Saying no for
an inserted key is not.

In a cuckoo filter, the stored evidence is a small integer:

$$
f(x) = \operatorname{fingerprint}(x).
$$

The table has \(m\) buckets and \(b\) entries per bucket. A typical practical
choice is \(b=4\), so one lookup checks at most eight short fingerprints.

The two candidate buckets are:

$$
i_1 = h(x),
\qquad
i_2 = i_1 \oplus h(f(x)).
$$

The xor is doing real work. If a fingerprint is currently sitting in bucket
\(i\), its other bucket is:

$$
\operatorname{alt}(i, f) = i \oplus h(f).
$$

Apply that twice:

$$
\operatorname{alt}(\operatorname{alt}(i, f), f)
=
(i \oplus h(f)) \oplus h(f)
=
i.
$$

That is the partial-key cuckoo hashing trick in Fan, Andersen, Kaminsky, and
Mitzenmacher's paper.[^fan] During insertion, the filter may evict a
fingerprint from a bucket. It does not know the original key that produced that
fingerprint. It does not need to. The current bucket and the fingerprint are
enough to compute the alternate bucket.

That is the difference from ordinary cuckoo hashing. In the full-key version,
an evicted item can be rehashed because the table still has the key. In the
filter version, the key is gone. The fingerprint must carry just enough routing
information to keep the eviction walk alive.

## Insertion Is Still a Placement Problem

The insertion procedure is local:

```text
f  = fingerprint(x)
i1 = h(x)
i2 = i1 xor h(f)

if either bucket has room:
    put f there
else:
    choose one candidate bucket
    kick out a resident fingerprint
    move the resident to its alternate bucket
    repeat until a hole appears
```

This is still cuckoo hashing underneath. The earlier cuckoo-hashing note framed
basic two-choice insertion as a graph orientation problem: every key has two
allowed homes, and insertion fails when one connected component has more keys
than capacity.[^pagh]

A cuckoo filter has the same personality, with two complications.

First, buckets usually hold several entries, so capacity is not one key per
vertex. Second, the two homes are not fully independent because the alternate
bucket is derived from a short fingerprint. The cuckoo filter paper is explicit
about this: the standard cuckoo-hashing analyses do not automatically transfer
to partial-key cuckoo hashing.[^fan]

So the operational rule is practical rather than mystical:

```text
keep load below the cliff
cap the kick chain
rehash or resize if insertion fails
```

The payoff is that a successful build gives two-bucket lookup with no false
negatives for inserted keys.

## Deletion Has a Precondition

Deletion looks almost too simple:

```text
f  = fingerprint(x)
i1 = h(x)
i2 = i1 xor h(f)

if f appears in bucket i1 or bucket i2:
    remove one copy
```

That is safe when \(x\) was actually inserted. It is not safe as a blind
"delete if present" command for arbitrary absent keys.

Why? Because the filter can have false positives. An absent key can share a
fingerprint and candidate bucket with a real key. If the caller asks to delete
that absent key, the filter may remove the real key's fingerprint and create a
false negative. Fan et al. state the same precondition: to delete safely, the
item must have been previously inserted.[^fan]

This is a useful systems distinction. A cuckoo filter supports deletion from a
known set. It does not authenticate delete requests by itself.

The structure has another nice collision behavior. If two inserted items share
the same candidate bucket and the same fingerprint, removing one copy leaves
the other copy. Because the alternate bucket is computed from the same
fingerprint, either copy can serve either member's future lookup. Collisions
are still false-positive risk, but they are not automatically deletion bugs.

## The False Positive Bill

Suppose each bucket has \(b\) entries and the fingerprint has \(f\) bits. An
absent lookup checks at most \(2b\) stored fingerprints. If stored fingerprints
behaved like independent random \(f\)-bit strings, the false-positive chance is
bounded by:

$$
1 - \left(1 - 2^{-f}\right)^{2b}
\approx
\frac{2b}{2^f}.
$$

That is the bill for local lookup. Larger buckets help insertion reach higher
load, but each lookup inspects more entries. To keep the same false-positive
rate, larger buckets need longer fingerprints.

The amortized space accounting is simple:

$$
\text{bits per inserted item}
=
\frac{f}{\alpha},
$$

where \(\alpha\) is the occupied-entry fraction of the bucket table. A
space-optimized Bloom filter uses about

$$
1.44 \log_2(1/\epsilon)
$$

bits per item for false-positive rate \(\epsilon\).[^bloom] A cuckoo filter
adds the bucket-inspection term to the fingerprint length, then divides by the
high load it can reach:

$$
f \gtrsim \log_2(1/\epsilon) + \log_2(2b).
$$

This is why the claim is not "cuckoo filters are always smaller." It is more
conditional:

```text
if you need deletion and local lookup,
and the target false-positive rate is in the practical range,
then compact fingerprints in high-load buckets can beat counter-heavy designs
```

Fan et al. report that bucket size matters: in their analysis, larger buckets
improve achievable load, with example load factors around 84%, 95%, and 98%
for bucket sizes 2, 4, and 8 under the studied cuckoo-table assumptions.[^fan]
But the same section also shows the counterweight: larger buckets inspect more
fingerprints, so they require longer fingerprints for the same \(\epsilon\).

There is no free lunch. There is a well-shaped bill.

## Lab: The Two-Bucket Contract

The lab below implements a small cuckoo filter in plain JavaScript:

- fingerprints are nonzero integers with 6 to 16 bits;
- bucket count is a power of two so xor alternation is exact;
- insertion uses bounded kick-out relocation;
- lookup checks two buckets;
- deletion is audited only for known inserted keys;
- absent queries estimate a deterministic false-positive rate.

The default run inserts 450 keys into 128 buckets with 4 entries each. That is
512 table entries, so the actual load is:

```text
450 / 512 = 87.890625%
```

With 10-bit fingerprints, the two-bucket bound is:

```text
1 - (1 - 2^-10)^8 = 0.7786%
```

The deterministic absent-query audit in this implementation observes:

```text
125 / 20,000 = 0.625%
```

Those exact numbers are not universal. They are a reproducible run of this
hashing setup. The invariant that matters more is stricter: every inserted key
is queried after construction, and the lab reports zero false negatives before
calling the audit passed.

<style>
  .cuckoo-filter-lab {
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

  .cuckoo-filter-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .cuckoo-filter-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .cuckoo-filter-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .cuckoo-filter-lab input[type="range"] {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .cuckoo-filter-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0 0 0.9rem;
  }

  .cuckoo-filter-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .cuckoo-filter-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 740;
    letter-spacing: 0;
    line-height: 1.18;
    margin-bottom: 0.22rem;
    text-transform: uppercase;
  }

  .cuckoo-filter-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.86rem, 2.4vw, 1.02rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .cuckoo-filter-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .cuckoo-filter-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 640px) {
    .cuckoo-filter-lab {
      padding: 0.75rem;
    }

    .cuckoo-filter-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="cuckoo-filter-lab" data-cuckoo-filter-lab>
  <div class="cuckoo-filter-lab__controls">
    <label>
      Items <output data-value="items">450</output>
      <input type="range" data-param="items" min="40" max="1400" step="10" value="450" aria-label="Number of inserted keys">
    </label>
    <label>
      Target load <output data-value="targetLoad">88%</output>
      <input type="range" data-param="targetLoad" min="55" max="96" step="1" value="88" aria-label="Target table load before power-of-two rounding">
    </label>
    <label>
      Bucket size <output data-value="bucketSize">4</output>
      <input type="range" data-param="bucketSize" min="2" max="8" step="1" value="4" aria-label="Entries per bucket">
    </label>
    <label>
      Fingerprint bits <output data-value="bits">10</output>
      <input type="range" data-param="bits" min="6" max="16" step="1" value="10" aria-label="Fingerprint size in bits">
    </label>
    <label>
      Max kicks <output data-value="maxKicks">180</output>
      <input type="range" data-param="maxKicks" min="20" max="500" step="10" value="180" aria-label="Maximum relocation kicks per insertion">
    </label>
    <label>
      Seed <output data-value="seed">7</output>
      <input type="range" data-param="seed" min="1" max="9999" step="1" value="7" aria-label="Hash seed">
    </label>
  </div>
  <div class="cuckoo-filter-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="620" aria-label="Cuckoo filter simulator showing bucket occupancy, relocation trace, false-positive rates, and bucket load"></canvas>
  <p class="cuckoo-filter-lab__note" data-note>
    Loading cuckoo filter audit.
  </p>
</div>

<script defer src="{{ '/assets/js/cuckoo-filter-lab.js?v=20260618a' | relative_url }}"></script>

## What Changes When You Move the Sliders

Push the load upward and two things happen. The bits per key improve at first
because the table is fuller. Then the relocation trace starts to matter. Full
buckets become common, kick chains get longer, and a particular seed may fail
to insert before the maximum kick count.

That failure is not a false negative. It is a construction failure. A real
system would resize, stash, or rehash. Once the table reports a successful
build, the lab verifies that every inserted key is found.

Shrink the fingerprint and the table may still build, but absent queries start
matching stored badges more often. The "fingerprint bits" panel draws that
bill. The observed line jiggles because it is a finite deterministic sample;
the bound line falls by roughly a factor of two every time you add one bit.

Increase bucket size and the load histogram becomes more forgiving, but the
false-positive bound rises for a fixed fingerprint length because every query
checks more slots. A bigger bucket gives insertion more room to breathe. It
also asks the fingerprint to distinguish more neighbors.

Those are the two knobs:

```text
load buys space
fingerprint bits buy trust
```

## Where the Toy Stops

This lab is not a performance benchmark.

It does not use SIMD, semi-sorting, stash variants, cache-line packing, careful
hash-family analysis, or concurrent updates. It does not model duplicate
insertions from a multiset. It uses a deterministic JavaScript hash mixer, not
a production hash pipeline. It also rounds the bucket count to a power of two
so that xor alternation is visually and mechanically simple.

The lab is meant to isolate three contracts:

1. `i xor h(f)` lets a stored fingerprint find its alternate bucket.
2. successful construction implies no false negatives for inserted keys.
3. false positives are paid for by the number of inspected slots and the number
   of fingerprint bits.

If you need a static filter, an xor filter may spend fewer probes after a more
expensive build. If you need mergeability or counting, quotient-filter
descendants are a different branch of the design space.[^bender] If you only
need a simple no-delete prefilter and random memory reads are acceptable, a
Bloom filter remains hard to beat.

The cuckoo filter earns its keep in the middle: dynamic approximate membership,
local lookup, and deletion, with the deletion precondition kept explicit.

## The Useful Picture

A Bloom filter forgets by smearing. That is why deletion needs counters.

A cuckoo filter forgets by abbreviating. It keeps a badge, not an identity.
Because the badge has two homes, the table can still rearrange itself after the
identity is gone.

That is the elegant part. The suspicious part is the same thing:

```text
all future certainty now fits in f bits
```

So the engineering question is not whether cuckoo filters are clever. They are.
The question is whether your workload wants exactly this bargain: two local
bucket reads, deletion for known members, bounded construction failures, and a
false-positive rate bought one fingerprint bit at a time.

[^fan]: Bin Fan, David G. Andersen, Michael Kaminsky, and Michael D. Mitzenmacher, ["Cuckoo Filter: Practically Better Than Bloom"](https://www.cs.cmu.edu/~dga/papers/cuckoo-conext2014.pdf), *CoNEXT*, 2014. [ACM DOI](https://dl.acm.org/doi/10.1145/2674005.2674994).

[^pagh]: Rasmus Pagh and Flemming Friche Rodler, ["Cuckoo Hashing"](https://www.brics.dk/RS/01/32/BRICS-RS-01-32.pdf), BRICS Report Series RS-01-32, 2001.

[^bloom]: Burton H. Bloom, ["Space/Time Trade-Offs in Hash Coding with Allowable Errors"](https://dl.acm.org/doi/10.1145/362686.362692), *Communications of the ACM*, 1970.

[^bender]: Michael A. Bender, Martin Farach-Colton, Rob Johnson, Russell Kraner, Bradley C. Kuszmaul, Dzejla Medjedovic, Pablo Montes, Pradeep Shetty, Richard P. Spillane, and Erez Zadok, ["Don't Thrash: How to Cache Your Hash on Flash"](https://arxiv.org/abs/1208.0290), *Proceedings of the VLDB Endowment*, 2012.
