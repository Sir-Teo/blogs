---
layout: post
title: "Similar Pages Should Share a Lottery Ticket"
description: "MinHash turns document overlap into a collision event whose probability is the Jaccard similarity."
date: 2026-06-13 17:36:00 -0400
categories: computer-science
tags: [minhash, locality-sensitive-hashing, jaccard, near-duplicate-detection, sketches, information-retrieval]
excerpt: "Near-duplicate search dies if every page meets every other page. MinHash gives similar documents shared lottery tickets, and LSH decides which tickets are worth inspecting."
---

The naive near-duplicate detector has a pleasingly doomed shape:

```text
compare every document to every other document
```

For a thousand documents, that is about half a million pairs. For a million
documents, it is about half a trillion. The algorithm is not wrong because the
similarity function is bad. It is wrong because the pair list becomes the
product.

So the real problem is not:

```text
how do we compare two documents?
```

It is:

```text
how do we arrange for similar documents to find each other?
```

MinHash is one of those ideas that feels like a magic trick until you write the
one-line proof. It turns a set similarity into a collision probability. Two
documents do not need to be compared in full. They each carry a small signature.
The fraction of matching signature rows estimates how much their shingle sets
overlap.

Then locality-sensitive hashing adds the systems move:

```text
do not estimate every pair
only create pairs that collide in at least one signature band
```

The result is not a classifier. It is a candidate generator with a dial.

## First Decide What Counts as Same

Broder's document resemblance framework starts by turning a document into a set
of shingles.[^broder-resemblance] A word shingle of width 5 is a consecutive
5-word phrase. A document becomes a set like:

```text
{ "the model cached the prompt",
  "model cached the prompt tokens",
  "cached the prompt tokens before",
  ... }
```

The resemblance of two documents is the Jaccard similarity of their shingle
sets:

$$
J(A,B)
=
\frac{|A \cap B|}{|A \cup B|}.
$$

This is syntactic resemblance. It is not semantic equivalence. Two documents can
mean the same thing with different words and have low Jaccard. Two templated web
pages can have unrelated core content and still share many boilerplate shingles.
The measure is useful because many real duplicate problems are not semantic
paradoxes. They are copies, mirrors, templates, syndicated text, quoted blocks,
printer-friendly pages, small edits, and crawl artifacts.

That makes Jaccard a good first contract:

```text
same local pieces, same document family
```

## The Minimum Shingle Trick

Imagine applying a random permutation $$\pi$$ to the universe of shingles. For a
set $$A$$, keep only the shingle whose permuted value is smallest:

$$
h_\pi(A) = \arg\min_{x \in A} \pi(x).
$$

Now compare two sets. The minimum element of $$A \cup B$$ must lie either in the
intersection or in one of the two one-sided differences. The two MinHash values
match exactly when that minimum belongs to $$A \cap B$$.

Since a random permutation gives every element of $$A \cup B$$ the same chance
to be the minimum,

$$
\Pr[h_\pi(A) = h_\pi(B)]
=
\frac{|A \cap B|}{|A \cup B|}
=
J(A,B).
$$

That is the trick. Similarity became a Bernoulli probability.

Repeat this with $$k$$ independent permutations, or practical hash functions
that approximate that behavior, and estimate:

$$
\hat{J}
=
\frac{1}{k}
\sum_{i=1}^k
\mathbf{1}\{h_i(A)=h_i(B)\}.
$$

Under the ideal independent-permutation model,

$$
E[\hat{J}] = J,
\qquad
\mathrm{Var}(\hat{J}) = \frac{J(1-J)}{k}.
$$

The signature length is a sampling budget. A 100-row signature is not "the
document." It is 100 noisy chances to observe the same event: does the sampled
minimum of the union come from the intersection?

The min-wise independence literature exists because the phrase "random
permutation of all shingles" hides an impossible object. Broder, Charikar,
Frieze, and Mitzenmacher formalized when smaller permutation families behave
enough like true random permutations for this estimator.[^minwise] In production
systems, this is one of the places where "just use a hash" deserves scrutiny.

## A Little Duplicate Factory

The lab below generates two synthetic documents and one unrelated background
document. All three share a controllable amount of boilerplate. The first two
also share an editable core. The visualization computes exact shingle Jaccard,
builds MinHash signatures, then applies LSH banding.

The important sliders are:

1. **Text drift**: edit the core document and watch exact Jaccard fall;
2. **Boilerplate**: add shared template text and watch background similarity
   rise;
3. **Bands** and **Rows per band**: reshape the candidate probability curve.

<div id="minhash-lab" class="minhash-lab" data-minhash-lab>
  <div class="minhash-lab__controls">
    <label>
      Text drift: <output data-value="editRate">16%</output>
      <input type="range" min="0" max="70" step="1" value="16" data-param="editRate">
    </label>
    <label>
      Boilerplate: <output data-value="boilerplate">15%</output>
      <input type="range" min="0" max="60" step="5" value="15" data-param="boilerplate">
    </label>
    <label>
      Shingle words: <output data-value="shingleSize">4</output>
      <input type="range" min="2" max="8" step="1" value="4" data-param="shingleSize">
    </label>
    <label>
      Bands: <output data-value="bands">20</output>
      <input type="range" min="2" max="40" step="1" value="20" data-param="bands">
    </label>
    <label>
      Rows per band: <output data-value="rowsPerBand">5</output>
      <input type="range" min="1" max="10" step="1" value="5" data-param="rowsPerBand">
    </label>
    <label>
      Corpus documents: <output data-value="corpus">2,000</output>
      <input type="range" min="200" max="8000" step="200" value="2000" data-param="corpus">
    </label>
  </div>
  <div class="minhash-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="660" aria-label="MinHash and locality-sensitive hashing simulator showing shingle overlap, signature matches, banding curve, and candidate screening work"></canvas>
  <div class="minhash-lab__legend">
    <span><i style="background:#0f766e"></i> Shared shingles or matching rows</span>
    <span><i style="background:#2563eb"></i> A-only shingles</span>
    <span><i style="background:#d97706"></i> B-only shingles</span>
    <span><i style="background:#be123c"></i> Current near pair</span>
    <span><i style="background:#64748b"></i> Boilerplate background</span>
  </div>
  <p class="minhash-lab__note">
    Deterministic synthetic experiment. The MinHash rows use compact 32-bit hash
    functions for browser speed. The LSH curve uses the standard independent-row
    approximation: a pair with similarity s becomes a candidate with probability
    1 - (1 - s^r)^b for b bands of r rows.
  </p>
</div>
<script defer src="{{ '/assets/js/minhash-lab.js?v=20260613a' | relative_url }}"></script>

The default setting has 20 bands and 5 rows per band, so the signature has 100
rows. The red point on the S-curve is the current near pair. The gray point is
an unrelated document pair that shares only the boilerplate template.

Raise text drift. Exact Jaccard falls because fewer shingles survive the edits.
The MinHash estimate moves with it, but not perfectly. That noise is the point:
the signature is a sample, not a proof. More rows would reduce variance, but
also increase memory and hash work.

Raise boilerplate. The near pair may still be easy to catch, but the gray
background point starts moving right. This is a classic failure mode. A site
template, legal footer, navigation shell, or repeated product description can
turn unrelated pages into weakly similar pages. MinHash did not misunderstand
the data. The shingling pipeline asked it to count the wrong overlap.

Now change the banding. If a signature has $$b$$ bands of $$r$$ rows, and each
row matches with probability $$s$$, then one band matches with probability
$$s^r$$. The pair becomes a candidate if at least one band matches:

$$
\Pr(\mathrm{candidate}\mid s)
=
1 - (1-s^r)^b.
$$

Increasing rows per band makes a single band stricter. Increasing bands gives
the pair more chances to collide. Together they form an S-shaped screening
curve. The rough threshold is:

$$
s^\star \approx \left(\frac{1}{b}\right)^{1/r}.
$$

This is a dangerous number if read too literally. It is not the probability that
two documents are duplicates. It is only the probability that the LSH stage will
send this pair to the next stage.

## A Candidate Is Not a Verdict

Broder's later near-duplicate filtering work emphasized a practical distinction:
for web indexing, it is often enough to know whether resemblance is above a
threshold, rather than to estimate every resemblance value.[^broder-filter] That
is the mental model I want for LSH.

The output of LSH should be:

```text
please compare these pairs carefully
```

not:

```text
these pairs are definitely duplicates
```

The exact verification step can be another Jaccard computation, a containment
test, a normalized edit distance on selected spans, a domain-specific rule, or a
human review queue. The MinHash and LSH stages earn their keep by making that
verification set small enough to afford.

This is also why false positives and false negatives have different meanings
than they did in the Bloom filter post. A Bloom filter says "maybe" for
membership. LSH says "maybe worth comparing" for similarity. A false positive is
extra work. A false negative is a missed near-duplicate. The right operating
point depends on which one hurts more.

Indyk and Motwani's locality-sensitive hashing framework gives the general
principle: construct hash functions whose collision probability is higher for
near objects than far objects, then use that gap to avoid scanning everything.
Their nearest-neighbor paper treats LSH as the key ingredient for sublinear
search in high-dimensional settings.[^indyk-motwani] MinHash is the Jaccard
version of that idea.

## Copies Can Be Asymmetric

Jaccard is symmetric:

$$
J(A,B)
=
\frac{|A \cap B|}{|A \cup B|}.
$$

But near-duplicate systems often need an asymmetric question:

```text
is the short document mostly contained in the long one?
```

A syndicated paragraph inside a long article may have low Jaccard because the
union is dominated by the long article. Its containment can still be high:

$$
C(A,B)
=
\frac{|A \cap B|}{|A|}.
$$

Broder's resemblance and containment paper treats both measures because web
documents create both problems: copies with small edits, and shorter documents
embedded inside longer ones.[^broder-resemblance] A MinHash resemblance pipeline
will miss some containment cases unless the system also samples or indexes for
containment, uses passage-level chunks, or verifies candidate spans.

This is the same lesson wearing a different coat:

```text
the sketch answers the question you encoded, not the question you meant
```

## Places the Sketch Can Lie

Shingle size is a bias knob. Small shingles give high recall for edited text but
also collide on common phrases. Large shingles are more discriminative but break
under insertions, deletions, and reordering. There is no universally correct
width. There is only a width matched to the copy process you expect.

Tokenization is part of the model. HTML stripping, Unicode normalization,
stemming, punctuation, boilerplate removal, code block handling, and language
segmentation all change the set. If the preprocessing changes, the signature
meaning changes.

Hash collisions are not the same as textual overlap. A finite hash maps many
possible shingles into fewer identifiers. At modest scale this can be harmless.
At web scale, or under adversarial inputs, it becomes another source of
resemblance inflation.

Banding hides variance under a threshold-shaped curve. Two pairs with the same
true Jaccard can land on different sides of the candidate gate because their
signatures are samples. This is why offline replay matters: evaluate recall and
candidate volume on real traffic, not only on the curve.

Embeddings solve a different problem. If the task is semantic similarity,
paraphrase detection, or intent clustering, MinHash over word shingles can be
too literal. If the task is copy detection, crawl deduplication, template
pollution, or quote overlap, that literalness is a feature.

## Near-Dupe Run Sheet

Before I trust a MinHash pipeline, I want to know:

- what text was removed before shingling;
- whether the unit is a whole document, section, paragraph, or passage;
- which shingle width was chosen and what edit process it assumes;
- how many signature rows are stored per item;
- which hash family and seed version define compatibility;
- which banding parameters determine candidate recall;
- how candidate pairs are verified after LSH;
- how boilerplate-heavy domains are handled;
- whether containment matters in addition to resemblance;
- how recall is measured against labeled or replayed near duplicates.

The pleasant mathematical identity does not eliminate these questions. It makes
them explicit.

## The Lottery Ticket Picture

MinHash is not a tiny summary of what a document says.

It is a tiny summary of where the document lands under many randomized orders of
its shingles. If two documents share many shingles, they often choose the same
minimum. If they share few, they rarely do. Similarity becomes a collision
frequency.

That is a strangely elegant bargain. Instead of asking every pair to meet, each
document carries a small set of lottery tickets. Similar documents tend to hold
some of the same tickets. LSH banding tells the system which shared tickets are
interesting enough to inspect.

The exact pairwise comparison does not disappear. It moves to the end, where it
belongs, after the sketch has made the candidate set small enough for truth to
be affordable.

## References

[^broder-resemblance]: Andrei Z. Broder, ["On the Resemblance and Containment of Documents"](https://www.cs.princeton.edu/courses/archive/spr05/cos598E/bib/broder97resemblance.pdf), *Compression and Complexity of Sequences*, 1997.

[^minwise]: Andrei Z. Broder, Moses Charikar, Alan M. Frieze, and Michael Mitzenmacher, ["Min-Wise Independent Permutations"](https://www.eecs.harvard.edu/~michaelm/postscripts/jcss2000.pdf), *Journal of Computer and System Sciences*, 2000. The conference version appeared at STOC 1998.

[^broder-filter]: Andrei Z. Broder, ["Identifying and Filtering Near-Duplicate Documents"](https://cs.brown.edu/courses/cs253/papers/nearduplicate.pdf), *Combinatorial Pattern Matching*, 2000.

[^indyk-motwani]: Piotr Indyk and Rajeev Motwani, ["Approximate Nearest Neighbors: Towards Removing the Curse of Dimensionality"](https://graphics.stanford.edu/courses/cs468-06-fall/Papers/06%20indyk%20motwani%20-%20stoc98.pdf), *STOC*, 1998.
