---
layout: post
title: "The Singleton Points Beyond the Sample"
description: "Good-Turing and unseen-species estimators turn one-off observations into evidence about the probability mass you have not seen yet."
date: 2026-06-15 10:51:00 -0400
categories: statistics
tags: [good-turing, unseen-species, missing-mass, chao1, sampling, nlp, ecology]
excerpt: "A type seen once is not just a lonely data point. In a long-tailed distribution, the singletons are shadows cast by the unseen tail."
---

The first time you see a species, word, bug, password, merchant, or customer
behavior, it feels like a discovery.

The second time, it starts to feel like a member of the world.

The awkward question is what to do with the things seen exactly once.

They are not reliable representatives. A singleton might be noise. It might be
a typo. It might be a real but rare type. It might also be the visible edge of a
large unseen tail.

```text
singletons are not clutter
they are a measurement instrument
```

That is the core Good-Turing intuition. If many observed types appeared only
once, then the sample is still discovering new things. The sample is telling
you, indirectly, that a nontrivial amount of probability mass remains outside
the observed set.

<div class="callout">
  <strong>Claim:</strong> the rarest observed counts are often the only evidence
  you have about the unobserved population. Throwing away singletons can make a
  dataset look cleaner while destroying the instrument that estimates what is
  missing.
</div>

## The Count of Counts

Good's 1953 paper, building on Turing's wartime ideas, studied the "population
frequencies of species" problem.[^good] The setup is wonderfully general: draw
a random sample from a population with many possible species. A species could
be a biological taxon, a word type, a phrase, a user action, a malware family,
or any category in a long-tailed distribution.

Let $$n_r$$ be the number of species observed exactly $$r$$ times. The sample
size is

$$
N = \sum_{r \ge 1} r n_r.
$$

The ordinary estimate for the probability of a seen species is its empirical
frequency. But for low counts, especially $$r=1$$, that estimate is too literal.
A type seen once is not merely a type with probability $$1/N$$. It is also a
signal that the sampling frontier is still active.

Good-Turing's most famous first-order missing-mass estimate is:

$$
\widehat{P}(\text{next type is unseen})
\approx
\frac{n_1}{N}.
$$

The formula is almost suspiciously small. Count the singletons. Divide by the
sample size. That is the estimated probability that the next draw belongs to a
type you have not observed at all.

It is not magic. It is a leave-one-out thought experiment. The types that would
have been unseen if one occurrence were removed are exactly the types that
appear once now.

## Richness Is Not Missing Mass

There are two related but different questions:

```text
how much probability is unseen?
how many types are unseen?
```

Good-Turing's $$n_1/N$$ answers the first question: missing probability mass.
Chao's 1984 estimator addresses the second question: a lower-bound style
estimate of total richness using singletons and doubletons.[^chao]

The common Chao1 form is

$$
\widehat{S}_{\text{Chao1}}
=
S_{\text{obs}}
+
\frac{n_1^2}{2n_2},
$$

where $$S_{\text{obs}}$$ is the number of observed species and $$n_2$$ is the
number of doubletons. If there are many singletons and few doubletons, the
bound rises. The sample has many things barely touched and few things that have
started repeating.

Those two estimates answer different operational questions:

- Missing mass asks how likely the next case is to surprise you.
- Richness asks how many different surprises may exist.

A corpus can have modest missing mass but enormous unseen richness if the tail
is very broad and individually tiny. That distinction is why word vocabularies,
ecological surveys, security logs, and product event taxonomies all resist
being summarized by "we saw 90% of the common stuff."

## Shakespeare's Invisible Vocabulary

Efron and Thisted's famous Shakespeare paper asked how many words Shakespeare
knew but did not use in the surviving canon.[^efron] They had a count-of-counts
table: many words used once, fewer used twice, and so on. From that, they
compared models for the unseen vocabulary.

The literal topic is charming. The statistical point is larger. The observed
text is not the author's vocabulary. It is a finite sample from a vocabulary
through a writing process. Rare words are evidence about the unobserved
lexicon.

Modern versions of this problem appear everywhere:

- How many microbial taxa remain unseen after sequencing?
- How many rare queries will hit search next week?
- How many customer intents are absent from a support dataset?
- How many security event types have not appeared in a training period?
- How much probability mass is outside an LLM evaluation set?

The point is not that Good-Turing or Chao1 solves all of these. The point is
that the naive observed set is almost never the population.

## A Long-Tail Sampling Notebook

The lab below creates a synthetic long-tailed population. It samples from that
population, records the frequency-of-frequencies table, and compares:

- the true missing mass, which the simulator knows but a real analyst would not;
- the Good-Turing missing-mass estimate $$n_1/N$$;
- the Chao1 richness estimate;
- a Good-Toulmin forecast for how many new types appear in a future sample up
  to the same order as the original sample.

Default run:

- true population size: `900` types;
- sample size: `420`;
- observed types: `179`;
- singletons: `121`;
- true missing mass: about `26.9%`;
- Good-Turing missing mass: about `28.8%`;
- Chao1 richness estimate: about `415`;
- in the future holdout of `231` draws, the sample sees `53` new types while
  Good-Toulmin predicts about `58`.

<style>
  .unseen-species-lab {
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

  .unseen-species-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  }

  .unseen-species-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .unseen-species-lab__controls input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .unseen-species-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0;
  }

  .unseen-species-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .unseen-species-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .unseen-species-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.04rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }

  .unseen-species-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .unseen-species-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .unseen-species-lab__legend span,
  .unseen-species-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .unseen-species-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    margin-right: 0.35rem;
    vertical-align: -0.06rem;
    width: 0.7rem;
  }

  .unseen-species-lab__note {
    margin: 0.7rem 0 0;
  }
</style>

<div class="unseen-species-lab" data-unseen-species-lab>
  <div class="unseen-species-lab__controls">
    <label>
      Seed <output data-value="seed">37</output>
      <input type="range" data-param="seed" min="1" max="99" step="1" value="37">
    </label>
    <label>
      Population types <output data-value="species">900</output>
      <input type="range" data-param="species" min="80" max="3000" step="20" value="900">
    </label>
    <label>
      Sample size <output data-value="sampleSize">420</output>
      <input type="range" data-param="sampleSize" min="40" max="4000" step="20" value="420">
    </label>
    <label>
      Tail skew <output data-value="skew">1.08</output>
      <input type="range" data-param="skew" min="45" max="185" step="1" value="108">
    </label>
    <label>
      Tail noise <output data-value="tailNoise">32%</output>
      <input type="range" data-param="tailNoise" min="0" max="80" step="1" value="32">
    </label>
    <label>
      Future sample <output data-value="futureRatio">55%</output>
      <input type="range" data-param="futureRatio" min="5" max="100" step="5" value="55">
    </label>
  </div>
  <div class="unseen-species-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Unseen species simulator showing population tail, frequency of frequencies, missing mass, and discovery curve"></canvas>
  <div class="unseen-species-lab__legend">
    <span><i style="background:#2563eb"></i> Observed types</span>
    <span><i style="background:#d97706"></i> Singletons</span>
    <span><i style="background:#0f766e"></i> Good-Turing / Good-Toulmin</span>
    <span><i style="background:#7c3aed"></i> Chao1 richness</span>
    <span><i style="background:#be123c"></i> True unseen quantity</span>
  </div>
  <p class="unseen-species-lab__note">
    Deterministic toy model. The audit covers 28 settings for finite estimates,
    valid probability bounds, Chao1 not below observed richness, and a default
    Good-Turing missing-mass error below eight percentage points.
  </p>
</div>
<script defer src="{{ '/assets/js/unseen-species-lab.js?v=20260615b' | relative_url }}"></script>

Try increasing **Sample size**. The observed set grows, but the singleton count
does not necessarily vanish quickly. In a long tail, more sampling can reveal
new singleton types at the same time it turns old singletons into doubletons.

Lower **Tail skew**. Probability spreads across many types; missing mass and
Chao1 rise. Raise **Tail skew**. The head dominates; the sample repeats the same
types more often, and the singleton instrument weakens.

Increase **Future sample** toward `100%`. The Good-Toulmin forecast is still in
its safer region here because the future sample is no larger than the original
sample. Orlitsky, Suresh, and Wu study the deeper problem of predicting unseen
species as this extrapolation becomes harder and the classical series becomes
unstable.[^orlitsky]

## The Practical Lesson

The rare tail is where product metrics and scientific surveys often lie to us.
If a dashboard says "we saw 179 types," the next question is not only how many
types were observed. It is how the observed types were distributed:

- How many were seen once?
- How many were seen twice?
- How quickly is the discovery curve flattening?
- Is missing probability mass operationally expensive?
- Are singletons real events, data-quality artifacts, or both?
- Does the sample design make rare types discoverable?

Deleting singletons may be reasonable after investigation. But deleting them
because they are awkward is statistical self-harm. They are the only part of the
sample that can point cleanly into the dark.

The singleton is not the tail.

It is the tail's shadow on the wall.

[^good]: I. J. Good, ["The Population Frequencies of Species and the Estimation of Population Parameters"](https://academic.oup.com/biomet/article/40/3-4/237/195998), Biometrika, 1953.

[^chao]: Anne Chao, ["Nonparametric Estimation of the Number of Classes in a Population"](https://www.jstor.org/stable/4615964), Scandinavian Journal of Statistics, 1984.

[^efron]: Bradley Efron and Ronald Thisted, ["Estimating the Number of Unseen Species: How Many Words Did Shakespeare Know?"](https://academic.oup.com/biomet/article-abstract/63/3/435/270845), Biometrika, 1976.

[^orlitsky]: Alon Orlitsky, Ananda Theertha Suresh, and Yihong Wu, ["Optimal Prediction of the Number of Unseen Species"](https://www.pnas.org/doi/10.1073/pnas.1607774113), PNAS, 2016.
