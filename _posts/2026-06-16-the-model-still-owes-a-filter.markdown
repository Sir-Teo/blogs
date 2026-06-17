---
layout: post
title: "The Model Still Owes a Filter"
description: "Learned Bloom filters are not classifiers with nicer marketing. The model may save bits, but the one-sided membership guarantee still has to be paid for."
date: 2026-06-16 18:36:00 -0400
categories: computer-science
series: probabilistic-data-structures
tags: [learned-bloom-filters, learned-indexes, bloom-filters, approximate-membership, data-structures, machine-learning]
excerpt: "A learned Bloom filter is a classifier plus a debt instrument: every true key the classifier rejects must be backed by an ordinary filter, or the data structure has stopped being a membership filter."
---

The dangerous sentence is:

```text
the model knows what the keys look like
```

Sometimes it does. Email addresses from one domain have a shape. URLs from a
crawl frontier have a shape. Fraudulent account identifiers, blocked domains,
protein k-mers, product IDs, and hot database keys can all have distributional
texture. If a classifier can separate members from nonmembers, why spend so many
bits on a Bloom filter?

That question is exactly what made learned indexes feel exciting. Kraska,
Beutel, Chi, Dean, and Polyzotis argued that many index structures can be seen
as models: a B-tree predicts position in a sorted array; a hash index predicts a
bucket; a Bloom-filter-like structure predicts existence.[^learned-indexes] If
the data has learnable regularity, perhaps a small model can replace a large
generic structure.

For membership queries, though, there is a trap hiding in the word "predicts."
A Bloom filter is not merely a classifier with a funny implementation. It has a
one-sided contract:

```text
if the key was inserted, the answer is never no
```

A learned model does not naturally have that contract. It can be well calibrated,
accurate on a test set, and still reject a true key. The moment that happens, it
is not an approximate membership filter anymore. It is just a classifier making
a false negative.

So the model still owes a filter.

## The Backup Is Not a Detail

Let $$S$$ be the set of true keys. A classifier gives a score $$g(x)$$, and a
threshold $$\tau$$ turns that score into a first membership decision:

$$
g(x) \ge \tau \quad \Rightarrow \quad \text{say maybe}.
$$

For nonkeys, those model accepts are false positives. That is annoying but
allowed. For keys, model rejects are fatal unless something else catches them.
The standard learned Bloom filter therefore stores the rejected keys in a
backup Bloom filter:

$$
B = \{x \in S : g(x) < \tau\}.
$$

The query rule is:

```text
if model accepts x:
    return maybe
else:
    return backup_bloom_filter(x)
```

Every inserted key is now safe. If the model accepts it, the learned half says
maybe. If the model rejects it, the backup filter was built from exactly those
rejected keys and cannot false-negative them.

For an absent query, define

$$
\alpha(\tau) =
\Pr[g(x) \ge \tau \mid x \notin S]
$$

as the classifier false-positive rate against the query distribution. If the
backup filter has false-positive rate $$\beta(\tau)$$, the learned Bloom filter
has false-positive rate

$$
p_{\mathrm{LBF}}(\tau)
=
\alpha(\tau) + (1-\alpha(\tau))\beta(\tau).
$$

This little formula is the whole bargain. Raise the threshold and
$$\alpha(\tau)$$ usually falls, but more true keys drop into the backup set, so
the backup needs more bits. Lower the threshold and the backup shrinks, but the
model starts waving through more absent queries.

Mitzenmacher's learned Bloom filter model is valuable because it forces that
accounting into the open: the learned function has a size, the backup has a
size, the guarantee is not automatic, and the system can be optimized by placing
ordinary filters around the learned component.[^mitzenmacher]

## A Tiny Experiment With a Mean Little Classifier

The lab below builds a one-dimensional synthetic world. True keys are clustered
near four hidden centers. A model gives high scores near those centers. Nonkeys
are mostly uniform, but a slider controls how many are lookalikes near the same
centers.

There are three competitors under the same total memory budget:

**Classic.** One ordinary Bloom filter stores every key.

**Learned.** A model consumes some bits. The remaining bits build a backup Bloom
filter for keys below the score threshold.

**Sandwich.** A front Bloom filter first rejects easy absent queries, then the
model and backup run only on what passes the front filter. This is the
"sandwiching" idea: ordinary filter, learned filter, ordinary filter.[^mitzenmacher]

The default is intentionally uncomfortable. The model is helpful, but not free.
The naive learned filter loses to the classical Bloom filter. The sandwiched
version recovers the bit budget because the front filter prevents many nonkeys
from ever touching the model's broad false-positive regions.

<style>
  .learned-bloom-lab {
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

  .learned-bloom-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
    margin-bottom: 1rem;
  }

  .learned-bloom-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .learned-bloom-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    min-height: 1.2rem;
  }

  .learned-bloom-lab input[type="range"] {
    accent-color: #0f766e;
    width: 100%;
  }

  .learned-bloom-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .learned-bloom-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .learned-bloom-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .learned-bloom-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
  }

  .learned-bloom-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .learned-bloom-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .learned-bloom-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    gap: 0.35rem;
  }

  .learned-bloom-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .learned-bloom-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="learned-bloom-lab" data-learned-bloom-lab>
  <div class="learned-bloom-lab__controls">
    <label>
      Inserted keys <output data-value="keyCount">1000</output>
      <input type="range" min="400" max="1800" step="50" value="1000" data-param="keyCount">
    </label>
    <label>
      Total bits <output data-value="totalBits">7000</output>
      <input type="range" min="3000" max="18000" step="500" value="7000" data-param="totalBits">
    </label>
    <label>
      Model bits <output data-value="modelBits">1100</output>
      <input type="range" min="0" max="3600" step="100" value="1100" data-param="modelBits">
    </label>
    <label>
      Score threshold <output data-value="threshold">0.84</output>
      <input type="range" min="5" max="95" step="1" value="84" data-param="threshold">
    </label>
    <label>
      Front-filter share <output data-value="frontShare">40%</output>
      <input type="range" min="0" max="70" step="2" value="40" data-param="frontShare">
    </label>
    <label>
      Overlapping nonkeys <output data-value="negativeOverlap">12%</output>
      <input type="range" min="0" max="80" step="2" value="12" data-param="negativeOverlap">
    </label>
    <label>
      Lookalike pressure <output data-value="adversary">4%</output>
      <input type="range" min="0" max="80" step="2" value="4" data-param="adversary">
    </label>
    <label>
      Seed <output data-value="seed">19</output>
      <input type="range" min="1" max="999" step="1" value="19" data-param="seed">
    </label>
  </div>
  <div class="learned-bloom-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Learned Bloom filter experiment showing score histograms, memory budget, threshold sweep, and feature-space queries"></canvas>
  <div class="learned-bloom-lab__legend">
    <span><i style="background:#64748b"></i> Classic Bloom</span>
    <span><i style="background:#0f766e"></i> Learned</span>
    <span><i style="background:#7c3aed"></i> Sandwich</span>
    <span><i style="background:#b45309"></i> Backup</span>
    <span><i style="background:#2563eb"></i> Keys</span>
    <span><i style="background:#be123c"></i> Nonkeys</span>
  </div>
  <p class="learned-bloom-lab__note">
    Deterministic browser experiment. The model is a fixed score function over a
    synthetic feature, not a trained neural net. The Bloom filters are real bit
    arrays with double-hashed probes. The audit tile runs 6,482 deterministic
    checks across 217 replayed cases: no false negatives, backup accounting,
    memory-ledger conservation, bounded rates, threshold-sweep monotonicity,
    and the default classic/learned/sandwich comparison used in the text.
  </p>
</div>
<script defer src="{{ '/assets/js/learned-bloom-lab.js?v=20260616b' | relative_url }}"></script>

On the default setting, the model rejects 565 of 1,000 true keys, so the backup
is not small. The classical Bloom filter sees a false-positive rate around 4
percent. The naive learned filter is worse because the model itself accepts too
many lookalike nonkeys, and it has already spent 1,100 bits before building the
backup. The sandwiched filter is slightly better than the classic filter because
the front Bloom filter kills many easy misses before the learned component gets
a chance to be overconfident.

Move the score threshold down. The backup shrinks because fewer true keys miss
the model. But the classifier false-positive rate rises because the model is
now more generous to nonkeys.

Move the threshold up. The classifier gets stricter, but the backup absorbs more
true keys. If the backup is underfunded, its own false positives dominate.

Now increase lookalike pressure. This is the learned-filter nightmare: nonkeys
come from places in feature space that resemble keys. The model still preserves
the no-false-negative guarantee only because the backup exists, but the model's
false-positive surface becomes easier to hit.

## The Model Budget Is Real Memory

The most common unfair comparison is:

```text
learned filter backup bits < classical filter bits
```

That is not the comparison. The model has to live somewhere. If it is a neural
net, a table, a feature normalizer, a vector quantizer, or a hand-built score
program, it consumes memory and query time. It may also consume deployment
complexity: retraining, calibration, versioning, cold-start behavior, fallback
logic, and distribution monitoring.

The fair comparison is:

$$
\text{model bits} + \text{backup bits}
\quad \text{versus} \quad
\text{ordinary filter bits}.
$$

Or, for the sandwiched construction:

$$
\text{front bits}
+ \text{model bits}
+ \text{backup bits}
\quad \text{versus} \quad
\text{ordinary filter bits}.
$$

This is why learned Bloom filters are a systems idea rather than a slogan. A
small, sharp model can be excellent. A large, mushy model can lose to a Bloom
filter that never pretended to understand the data.

There is a second accounting issue: the query distribution matters. A standard
Bloom filter's false-positive probability is driven mainly by its hash
occupancy, assuming the query hashes behave like random positions. A learned
filter's false positives are shaped by the model. If absent queries shift toward
the model's high-score region, the empirical FPR can rise even though the stored
set did not change.

That is not a theoretical nit. The recent adversarial-resilience literature
studies learned Bloom filters under adaptive querying, where an adversary can
try to discover and exploit high-false-positive regions.[^adversarial] The
classical filter can also be attacked under some hash models, but learned
filters add a visible surface: the classifier's notion of "looks like a key."

## Sandwiching Is a Humble Trick

The sandwich construction sounds almost too simple:

```text
front Bloom filter -> model -> backup Bloom filter
```

The front filter stores all keys. If it says no, the query is definitely absent,
and the model is never asked. If it says maybe, the learned filter handles the
remaining query. The backup still exists for true keys that the model rejects.

Ignoring dependence, the nonkey false-positive rate has the shape

$$
p_{\mathrm{sandwich}}
\approx
p_{\mathrm{front}}
\left(
  \alpha(\tau) + (1-\alpha(\tau))\beta(\tau)
\right).
$$

The approximation is not a proof for arbitrary hash/model dependence, but it is
the right mental model. The front filter multiplies the learned component by a
generic rejection stage. That is valuable when the model is expensive, badly
calibrated on easy misses, or too willing to accept broad regions.

The front filter also changes the threshold choice. A threshold that looked bad
for a naive learned filter may become good when most absent queries are removed
before reaching the model. Mitzenmacher's point is not merely "add another
Bloom filter." It is that the memory split can be optimized once the model's
score behavior and size are known.[^mitzenmacher]

## Scores Contain More Than a Threshold

The simple learned Bloom filter throws away much of the classifier output. It
keeps only:

```text
score >= threshold
```

Ada-BF, proposed by Dai and Shrivastava, makes a more flexible move. Instead of
one backup filter behind one threshold, it partitions the score range and uses
the full probability-score spectrum to allocate memory more efficiently across
regions.[^adabf] Intuitively, a query with score 0.99 and a query with score
0.51 should not necessarily be treated the same just because both exceed one
threshold. The score is a ranking of confidence, and a better data structure can
spend bits where the score is least trustworthy.

That direction is important because it turns learned Bloom filters from a cute
wrapper around a classifier into an optimization problem:

```text
given a score distribution, a memory budget, and a target FPR,
where should the exact one-sided guarantee be repaired?
```

The answer can be "do not use a learned filter." That is a perfectly respectable
result.

## When Would I Actually Use One?

I would want all of the following to be true.

First, keys have stable learnable structure. If the model cannot separate keys
from likely nonkeys under the production query distribution, it is decoration.

Second, the model is small relative to the saved filter memory. A 200 KB model
that saves 20 KB of Bloom bits is not a win unless it is already loaded for
another reason.

Third, false positives have tolerable cost and false negatives are unacceptable.
If false negatives are acceptable, then this is probably a classifier problem,
not a membership-filter problem. If false positives are dangerous, a Bloom-like
maybe answer may be the wrong primitive.

Fourth, the query distribution can be monitored. The model's FPR is not a
universal constant. It is a property of absent queries seen after deployment.

Fifth, the fallback story is boring. Rebuilds, version skew, delayed inserts,
feature extraction failures, and model rollouts must not create false negatives.
The backup filter repairs classifier misses only for the keys it was built to
repair.

The learned Bloom filter is most attractive when the set is large, the key
distribution is structured, the query distribution is not too adversarial, and a
very small model can reject or accept a large fraction of traffic in a way that
ordinary hashes cannot.

## The Line I Trust

The learned-index idea is powerful because it asks a real question:

```text
is a generic data structure wasting bits by ignoring the data distribution?
```

But approximate membership has a moral spine. It does not merely ask for high
accuracy. It asks for a particular kind of wrongness.

The classical Bloom filter is allowed to hallucinate membership, but it is not
allowed to forget an inserted key. A learned Bloom filter inherits that contract
only by making the misses explicit and storing them somewhere ordinary.

That is the part I like. The model gets to be clever, but the data structure
still has to keep receipts.

[^learned-indexes]: Tim Kraska, Alex Beutel, Ed H. Chi, Jeffrey Dean, and Neoklis Polyzotis, ["The Case for Learned Index Structures"](https://arxiv.org/abs/1712.01208), arXiv, 2017; revised 2018.

[^mitzenmacher]: Michael Mitzenmacher, ["A Model for Learned Bloom Filters, and Optimizing by Sandwiching"](https://arxiv.org/abs/1901.00902), arXiv, 2019. The arXiv page notes this is the complete version of the NeurIPS 2018 paper.

[^adabf]: Zhenwei Dai and Anshumali Shrivastava, ["Adaptive Learned Bloom Filter (Ada-BF): Efficient Utilization of the Classifier with Application to Real-Time Information Filtering on the Web"](https://proceedings.neurips.cc/paper/2020/hash/86b94dae7c6517ec1ac767fd2c136580-Abstract.html), NeurIPS 2020.

[^adversarial]: Ghada Almashaqbeh, Allison Bishop, and Hayder Tirmazi, ["Adversary Resilient Learned Bloom Filters"](https://arxiv.org/abs/2409.06556), arXiv, 2024; revised version listed as ASIACRYPT 2025.
