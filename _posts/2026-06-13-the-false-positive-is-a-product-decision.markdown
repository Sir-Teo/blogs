---
layout: post
title: "Bit Arrays That Only Say Maybe"
description: "A Bloom filter is a memory bargain: it can say definitely not, or maybe, but it never proves membership."
date: 2026-06-13 17:24:00 -0400
categories: computer-science
series: probabilistic-data-structures
tags: [bloom-filter, probabilistic-data-structures, hashing, databases, systems, false-positives]
excerpt: "A Bloom filter is not an approximate set because it forgot data by accident. It is engineered asymmetry: no false negatives, controlled false positives, and a downstream system that knows what maybe costs."
---

A set has a wonderfully blunt personality.

```text
is this key here?
```

Yes or no. If the set is exact, membership is a fact. The cost is that the set
has to remember the members, or enough of their hashes to behave as though it
does. That cost is often fine. Then one day the set is not a sidebar anymore.
It is the thing blocking a disk lookup, a network request, a cache check, a
deduplication pass, a crawl frontier, a fraud rule, or a database join.

At that scale, the interesting question changes from:

```text
can I remember the set?
```

to:

```text
what kind of wrong answer can the rest of the system survive?
```

The Bloom filter is one of the cleanest answers in computer science because it
chooses one side of the error table and refuses to touch the other.

It can say:

```text
definitely not
maybe
```

It cannot say:

```text
definitely yes
```

That asymmetry is the whole instrument.

## How to Say No With Bits

Start with an array of $$m$$ bits, all zero. To insert a key, compute $$k$$ hash
positions and set those bits to one. To query a key, compute the same $$k$$
positions. If any of them is zero, the key was never inserted. If all of them
are one, the key may have been inserted, or it may have walked into bits set by
other keys.

Burton Bloom's 1970 paper framed the bargain as a space/time trade-off for set
membership when a small rate of "errors of commission" is acceptable.[^bloom]
The second method in that paper is the recognizable modern object: a bit field,
several bit addresses per item, rejection if any queried bit is zero, and
acceptance if all queried bits are one.

That is why Bloom filters feel almost too small to be serious:

```text
insert(x): set bits h_1(x), ..., h_k(x)
query(y):  return all those bits are set
```

Nothing stores the key. Nothing stores a count. Nothing stores a witness. A bit
can be set by one item, five items, or no item that you care about anymore. The
data structure works because a zero bit is still an alibi.

## The Price List

Suppose $$n$$ distinct keys have been inserted. Under the usual idealized
hashing assumption, the probability that a particular bit remains zero after
all $$kn$$ placements is:

$$
q_0 =
\left(1 - \frac{1}{m}\right)^{kn}
\approx
e^{-kn/m}.
$$

So the expected fraction of one bits is:

$$
1 - q_0
\approx
1 - e^{-kn/m}.
$$

An absent key is a false positive only when all $$k$$ of its queried positions
are already one. The standard approximation is therefore:

$$
p_\mathrm{fp}
\approx
\left(1 - e^{-kn/m}\right)^k.
$$

This formula has a small drama inside it. Increasing $$k$$ checks more bits,
which should make false positives rarer. But increasing $$k$$ also sets more
bits during insertion, saturating the array faster. Too few hashes leave too
many easy collisions. Too many hashes make the filter cloudy.

The optimum is reached around:

$$
k^\star = \frac{m}{n}\ln 2.
$$

At that point the array is about half full, and the false-positive rate is
roughly:

$$
p_\mathrm{fp}
\approx
(0.6185)^{m/n}.
$$

Here is the price list. With 10 bits per key and about 7 hash probes, the target
false-positive rate is about 0.8 percent. With 20 bits per key, it falls to
about 0.007 percent. To target a rate $$p$$, the familiar back-of-the-envelope
memory budget is:

$$
\frac{m}{n}
\approx
-\frac{\ln p}{(\ln 2)^2}.
$$

Broder and Mitzenmacher's survey makes the systems lesson explicit: Bloom
filters are useful where a set or list would be too large, provided the effect
of false positives can be mitigated.[^broder] That condition is not a footnote.
It is the product requirement.

## Play With the Maybe Machine

The lab below builds a deterministic synthetic filter, queries inserted and
absent keys, and compares empirical false positives with the formula. It uses a
simple 32-bit hash mixer and Kirsch-Mitzenmacher style double hashing to derive
many positions from two base hashes, which is a standard engineering trick for
reducing hash work in Bloom filters.[^kirsch]

Try three moves:

1. lower **Bits per key** until the array saturates;
2. sweep **Hash probes** past the purple optimum line;
3. raise **Duplicate passes** and notice that repeated insertions do not change
   a set membership filter.

<div id="bloom-lab" class="bloom-lab" data-bloom-lab>
  <div class="bloom-lab__controls">
    <label>
      Inserted keys: <output data-value="items">4,000</output>
      <input type="range" min="500" max="12000" step="500" value="4000" data-param="items">
    </label>
    <label>
      Bits per key: <output data-value="bitsPerItem">10.00</output>
      <input type="range" min="3" max="20" step="0.5" value="10" data-param="bitsPerItem">
    </label>
    <label>
      Hash probes: <output data-value="hashes">7</output>
      <input type="range" min="1" max="18" step="1" value="7" data-param="hashes">
    </label>
    <label>
      Absent queries: <output data-value="queries">5,000</output>
      <input type="range" min="500" max="20000" step="500" value="5000" data-param="queries">
    </label>
    <label>
      Present-query share: <output data-value="presentShare">10%</output>
      <input type="range" min="0" max="50" step="5" value="10" data-param="presentShare">
    </label>
    <label>
      Duplicate passes: <output data-value="duplicatePasses">1x</output>
      <input type="range" min="1" max="8" step="1" value="1" data-param="duplicatePasses">
    </label>
    <label>
      Exact key payload: <output data-value="keyBytes">16 B</output>
      <input type="range" min="8" max="64" step="8" value="16" data-param="keyBytes">
    </label>
  </div>
  <div class="bloom-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="650" aria-label="Bloom filter simulator showing bit occupancy, false positive curve, query ledger, and saturation"></canvas>
  <div class="bloom-lab__legend">
    <span><i style="background:#0f766e"></i> Bit set or true positive</span>
    <span><i style="background:#2563eb"></i> Formula curve</span>
    <span><i style="background:#7c3aed"></i> Optimal hash count</span>
    <span><i style="background:#be123c"></i> False positive</span>
    <span><i style="background:#b45309"></i> False negative counter</span>
  </div>
  <p class="bloom-lab__note">
    Deterministic browser experiment. It is meant to expose the shape of the
    trade-off, not to certify a production hash family. The exact-set memory
    estimate counts key payload bytes only; real hash tables also pay pointer,
    allocator, load-factor, and metadata overhead.
  </p>
</div>
<script defer src="{{ '/assets/js/bloom-filter-lab.js?v=20260613a' | relative_url }}"></script>

The default setting is deliberately ordinary: 4,000 inserted keys, 10 bits per
key, 7 hash probes, and 5,000 absent queries. The measured false-positive rate
wiggles because the query tape is finite. The formula is the smoother object:
the false-positive probability under the random hashing model.

Lower the filter to 4 bits per key. The memory savings are real, but the bit
array gets crowded and the "maybe" answer becomes cheap talk. Raise it to 16 or
20 bits per key and the filter becomes calmer, at the cost of more memory.

Now move the hash-probe slider. At 10 bits per key, the optimum is near
$$10\ln 2 \approx 6.9$$ probes. Past that point, extra probes do not keep helping
because they make insertion more aggressive. The minimum is not mystical; it is
the point where "check more evidence" and "pollute more evidence" balance.

Finally, raise duplicate passes. The filter does not grow more saturated,
because setting a one bit to one again has no effect. That idempotence is useful
when logs are replayed or events are retried. It is also a warning: a standard
Bloom filter answers set membership, not frequency.

## The Maybe Branch Has an Owner

The common mistake is to say "the false-positive rate is 1 percent" as if that
were a complete evaluation.

It is not. A false positive is not an abstract blemish. It triggers whatever
the "maybe" branch does.

If the Bloom filter guards a disk lookup, a false positive may cost a wasted
lookup. That can be fine. The filter still saves work when most absent keys are
rejected in memory. Bloom's original motivating examples had this flavor: use a
small resident structure to avoid expensive secondary work most of the time,
then let a slower exact procedure catch the allowable mistakes.[^bloom]

If the filter guards a security decision, a false positive may grant the wrong
permission. That is usually not fine. If the filter blocks reprocessing, a false
positive may silently drop a legitimate item. If it suppresses crawler URLs, it
may create a sampling bias. If it gates a fraud queue, it may shift workload and
fairness properties in a way the false-positive percentage alone does not
describe.

So the useful design variable is not merely:

$$
p_\mathrm{fp}.
$$

It is closer to:

$$
E[\mathrm{cost}]
=
p_\mathrm{fp}
\times
\mathrm{cost}(\mathrm{maybe}\mid\mathrm{absent})
\times
\mathrm{absent\ query\ volume}.
$$

That expression is crude, but it points in the right direction. A false positive
is a product decision because the product, pipeline, or protocol defines the
cost of believing "maybe."

## You Cannot Just Erase a Shadow

A standard Bloom filter has no idea why a bit is one. If you remove an item and
clear its bits, you may erase evidence needed by another item. That would create
false negatives, breaking the main contract.

The usual fix is a counting Bloom filter: replace each bit with a small counter,
increment on insert, decrement on delete, and treat positive counters as one
bits. This recovers deletion if the counters do not overflow, underflow, or get
corrupted by inconsistent updates. It also costs more memory. The survey
literature discusses these variants because production workloads rarely stay as
pure as the textbook API.[^broder]

Cuckoo filters are another answer. They store short fingerprints in cuckoo hash
tables and support dynamic deletion while often improving lookup performance in
moderate false-positive regimes.[^cuckoo] The point is not that one structure
dominates. The point is that the one-sided error contract is only one axis. Once
you need deletion, resizing, mergeability, stable serialization, adversarial-key
defense, or hardware locality, the data-structure choice becomes a systems
choice again.

## Where the Contract Can Leak

First, the hash model is doing work. The clean formulas assume uniform,
independent-looking positions. Real systems use finite hashes, seeded hash
families, and sometimes adversarial inputs. Kirsch and Mitzenmacher showed that
two base hash functions can produce the same asymptotic false-positive behavior
for Bloom filters, which is why double hashing is so common, but that is still a
statement about the algorithmic construction, not a license to ignore bad hash
engineering.[^kirsch]

Second, the inserted count matters. A Bloom filter sized for 10 million keys and
fed 30 million keys is not a slightly worse version of itself. It is a saturated
instrument. The bit occupancy is an operational signal: once the array is too
full, every absent key starts to look familiar.

Third, a negative answer is only meaningful relative to the exact stream of
insertions. If writes are delayed, salts changed, replicas diverge, or the filter
is built from a stale snapshot, the structure can produce practical false
negatives even if the mathematical object cannot. The theorem lives inside the
implementation boundary.

Fourth, a Bloom filter is not anonymization. It is smaller than a set and cannot
enumerate its members, but it remains a queryable artifact derived from the
members. Salts, access controls, retention policy, and threat models still
matter.

## Questions for the Owner

Before shipping one, I would want the owner to answer:

- What exact event turns a key into an inserted member?
- What downstream action follows a "maybe"?
- What is the dollar, latency, safety, or bias cost of a false positive?
- What insert count was the filter sized for, and what happens after that?
- Which hash version and salt define compatibility?
- Is deletion needed, or is rotation/rebuild enough?
- How is bit occupancy monitored?
- Are absent-query samples replayed from real traffic before launch?
- Can the exact fallback audit false positives after launch?
- Is the filter being used as a privacy control when it is only a memory tool?

The most important line is the second one. A Bloom filter is not a generic
optimization. It is a way of moving work from memory into uncertainty. Whether
that is good engineering depends on where the uncertainty lands.

## An Honest Little Machine

An exact set remembers keys.

A Bloom filter remembers shadows cast by keys onto a bit array. Most shadows
overlap harmlessly. Sometimes an absent key happens to stand where enough
shadows already fell, and the filter says maybe.

That may sound like a defect. It is really the contract:

```text
I will never forget an inserted key.
I will sometimes mistake a stranger for someone I know.
Tell me whether that mistake is acceptable.
```

There are not many data structures this honest. A Bloom filter puts its error
on one side of the table, gives you a formula for buying it down, and then asks
the question every system eventually asks anyway:

```text
what does being wrong cost here?
```

## Works Cited

[^bloom]: Burton H. Bloom, ["Space/Time Trade-offs in Hash Coding with Allowable Errors"](https://crystal.uta.edu/~mcguigan/cse6350/papers/Bloom.pdf), *Communications of the ACM*, 1970. [ACM record](https://dl.acm.org/doi/10.1145/362686.362692).

[^broder]: Andrei Broder and Michael Mitzenmacher, ["Network Applications of Bloom Filters: A Survey"](https://www.eecs.harvard.edu/~michaelm/postscripts/im2005b.pdf), *Internet Mathematics*, 2004. [Journal page](https://projecteuclid.org/journals/internet-mathematics/volume-1/issue-4/Network-Applications-of-Bloom-Filters-A-Survey/im/1109191032.full).

[^kirsch]: Adam Kirsch and Michael Mitzenmacher, ["Less Hashing, Same Performance: Building a Better Bloom Filter"](https://www.eecs.harvard.edu/~michaelm/postscripts/rsa2008.pdf), *Random Structures and Algorithms*, 2008.

[^cuckoo]: Bin Fan, David G. Andersen, Michael Kaminsky, and Michael D. Mitzenmacher, ["Cuckoo Filter: Practically Better Than Bloom"](https://www.cs.cmu.edu/~dga/papers/cuckoo-conext2014.pdf), *CoNEXT*, 2014. [ACM record](https://dl.acm.org/doi/10.1145/2674005.2674994).
