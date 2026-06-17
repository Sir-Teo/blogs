---
layout: post
title: "The Label Is a Latent Variable"
description: "Majority vote treats annotators as interchangeable sensors. Dawid-Skene style truth inference treats the true label and each worker's confusion matrix as things to estimate together."
date: 2026-06-16 20:08:00 -0400
categories: machine-learning
tags: [crowdsourcing, label-noise, dawid-skene, em-algorithm, data-quality, annotation, machine-learning]
excerpt: "A dataset label is often not an observation of truth. It is a measurement made by a noisy worker, under a task design, with a confusion matrix."
---

The cheapest supervised-learning lie is a column named `label`.

It looks like a fact:

```text
image_id, label
17, cat
```

But many labels are not facts. They are measurements.

A radiologist marks a scan. A content moderator tags a policy violation. A
contractor labels whether a query is navigational. A human preference worker
chooses which answer is better. A benchmark author writes the expected output.

Each act may be careful. Each may also be biased, tired, underspecified,
domain-limited, adversarial, or simply facing a genuinely hard example. The
label in the table is the end of a measurement process, not the beginning of
truth.

Majority vote makes one strong bet:

```text
workers are exchangeable and most are better than chance
```

Sometimes that bet is good enough. Sometimes it is the bug.

## The Old Model Is Still The Useful One

Dawid and Skene's 1979 paper is the clean doorway into this problem.[^dawid-skene]
They were not writing about image datasets or RLHF. They were modeling patient
records with repeated observer errors. The move is timeless:

- every item has an unobserved true class;
- every observer has an error-rate matrix;
- the observed labels are generated from the true class through that observer's
  matrix;
- the EM algorithm estimates the hidden classes and observer error rates
  together.

For a binary task, the cartoon version is:

$$
z_i \sim \operatorname{Bernoulli}(\pi),
$$

and worker $$w$$ emits label $$\ell_{iw}$$ according to a confusion matrix:

$$
P(\ell_{iw}=b \mid z_i=a)=\Theta_{w,a,b}.
$$

If $$z_i$$ were known, estimating worker confusion matrices would be easy. If
the confusion matrices were known, estimating $$z_i$$ would be easy. Neither is
known. EM alternates:

```text
E-step: infer soft truth labels from current worker matrices
M-step: infer worker matrices from current soft truth labels
```

That is a small algorithm with a large cultural correction:

```text
the label is a latent variable
```

## A Crowd-Label Lab

The lab below creates a deterministic binary-labeling world. It simulates true
item labels, item difficulty, workers with different sensitivity/specificity,
biased workers, noisy workers, and adversarial workers. Each item receives a
fixed number of worker labels.

It compares:

- **majority vote**, the raw vote fraction;
- **agreement weighting**, a simple heuristic that trusts workers who agree
  with the initial majority more often;
- **Dawid-Skene**, a binary EM model with per-worker confusion matrices.

The simulator knows the hidden truth. The aggregation methods do not.

<style>
  .crowd-lab {
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

  .crowd-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .crowd-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .crowd-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .crowd-lab input,
  .crowd-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .crowd-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .crowd-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .crowd-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .crowd-lab__metric span,
  .crowd-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .crowd-lab__metric span {
    display: block;
  }

  .crowd-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .crowd-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .crowd-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="crowd-label-lab" class="crowd-lab" data-crowd-label-lab>
  <div class="crowd-lab__controls">
    <label>
      Scenario
      <select data-param="scenario">
        <option value="mixed" selected>mixed reliability</option>
        <option value="adversarial">adversarial minority</option>
        <option value="biased">positive-label bias</option>
        <option value="hard">many hard items</option>
      </select>
    </label>
    <label>
      Items: <output data-value="items">160</output>
      <input type="range" min="60" max="360" step="20" value="160" data-param="items">
    </label>
    <label>
      Workers: <output data-value="workers">22</output>
      <input type="range" min="6" max="60" step="2" value="22" data-param="workers">
    </label>
    <label>
      Labels per item: <output data-value="labelsPerItem">5</output>
      <input type="range" min="1" max="11" step="1" value="5" data-param="labelsPerItem">
    </label>
    <label>
      Adversarial share: <output data-value="adversarial">18%</output>
      <input type="range" min="0" max="45" step="1" value="18" data-param="adversarial">
    </label>
    <label>
      Positive base rate: <output data-value="classPrior">42%</output>
      <input type="range" min="10" max="90" step="2" value="42" data-param="classPrior">
    </label>
    <label>
      Item difficulty: <output data-value="difficulty">46%</output>
      <input type="range" min="0" max="100" step="2" value="46" data-param="difficulty">
    </label>
    <label>
      Seed: <output data-value="seed">31</output>
      <input type="range" min="1" max="997" step="1" value="31" data-param="seed">
    </label>
  </div>
  <div class="crowd-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="760" aria-label="Crowd label inference lab comparing majority vote, agreement weighting, and Dawid-Skene EM"></canvas>
  <p class="crowd-lab__note">
    Deterministic browser experiment. Each worker has hidden sensitivity and
    specificity. Dawid-Skene sees only item-worker-label triples and is
    initialized from smoothed majority vote.
  </p>
</div>
<script defer src="{{ '/assets/js/crowd-label-lab.js?v=20260616a' | relative_url }}"></script>

At the default setting, majority vote is respectable but wasteful. It treats an
expert, a random worker, and an adversarial worker as three identical pieces of
evidence. The agreement-weighted heuristic helps by trusting workers who agree
with the first-pass majority, but that is a circular kind of trust: if the
majority is wrong in a slice, the agreement score can bless the wrong workers.

Dawid-Skene usually does better in the default world because it separates two
questions:

```text
which items are probably positive?
which workers tend to emit which labels for each true class?
```

The worker panel shows this as a calibration problem. The x-axis is the
simulator's true balanced accuracy. The y-axis is the EM estimate. Good workers
should rise. Adversarial workers should sink. Biased workers can be more
interesting: a worker may be good at catching positives and bad at rejecting
negatives, so a single "accuracy" number is already a compression.

## More Labels Is Not The Same As More Truth

Sheng, Provost, and Ipeirotis studied the value of getting additional noisy
labels and showed why repeated labeling can improve data quality, but not in a
uniform way.[^sheng] The next label is most valuable when current uncertainty is
high, the worker is informative, and the answer will change a downstream
decision.

The lab's **Labels per item** slider lets you feel the first-order version. More
labels often help. But if the extra labels come from the same biased pool, the
system is not buying truth. It is buying more samples from the same measurement
process.

This is why active crowd-labeling systems ask a sharper question:

```text
which item should receive which worker's next minute?
```

Raykar and collaborators' *Learning From Crowds* extends the probabilistic
view by learning a classifier and annotator expertise together when there is no
absolute gold standard.[^raykar] Whitehill and collaborators' GLAD model adds
item difficulty and labeler expertise, making explicit something the lab only
simulates: some examples are hard for almost everyone.[^glad]

Difficulty matters because disagreement is ambiguous. It can mean:

- the item is hard;
- the worker is unreliable;
- the task definition is underspecified;
- two real subpopulations disagree;
- the label space is missing a category.

Those require different product responses.

## The Failure Mode Is Identifiability

EM is not magic. It is a likelihood optimizer with assumptions.

Raise **Adversarial share** high enough, increase **Item difficulty**, or lower
**Labels per item**. At some point the system may learn a beautifully confident
wrong story. This is not a browser bug. It is an identifiability problem.

If nearly everyone flips the label, and the algorithm has no trusted anchor, the
data can support a world where the workers are bad or a world where the latent
labels are reversed. Majority initialization, class priors, gold checks,
sentinel items, worker history, and task design all act as anchors.

This is the part people forget when they say "we will just use EM":

```text
unsupervised truth inference still needs a reason to know which way is up
```

Even when orientation is right, a confusion-matrix model can be too small. A
worker might be excellent on sports questions and poor on medical questions. A
moderator might be reliable in English and weak in another language. A model
judge might favor long answers only in open-ended writing tasks. One matrix per
worker is a useful fiction, not a complete psychology.

## A Label Pipeline I Would Trust More

For a serious label operation, I would want the dataset release to include more
than final labels:

- raw item-worker-label triples;
- worker or source identifiers, even if anonymized;
- task version and rubric version;
- gold or sentinel items used for orientation;
- per-slice disagreement and posterior uncertainty;
- estimated confusion matrices or reliability summaries;
- rules for when additional labels were requested;
- examples removed for ambiguity, policy change, or task-design failure.

This is not bureaucratic decoration. It is the difference between a dataset and
a measurement instrument.

The modern ML connection is direct. Preference data, RLHF comparisons,
LLM-as-judge votes, moderation labels, retrieval relevance judgments, medical
annotations, and benchmark answers all inherit the same question:

```text
who observed this label, under what confusion matrix?
```

Majority vote is a fine baseline. It is not a theory of truth.

The label is latent. The annotator is an instrument. The dataset is the
posterior artifact.

## Paper Trail

[^dawid-skene]: A. P. Dawid and A. M. Skene, ["Maximum Likelihood Estimation of Observer Error-Rates Using the EM Algorithm"](https://crowdsourcing-class.org/readings/downloads/ml/EM.pdf), *Applied Statistics*, 28(1), 1979, pp. 20-28. DOI: [10.2307/2346806](https://doi.org/10.2307/2346806). Bibliographic record: [RePEc](https://ideas.repec.org/a/bla/jorssc/v28y1979i1p20-28.html).

[^sheng]: Victor S. Sheng, Foster Provost, and Panagiotis G. Ipeirotis, ["Get Another Label? Improving Data Quality and Data Mining Using Multiple, Noisy Labelers"](https://dl.acm.org/doi/10.1145/1401890.1401965), *KDD*, 2008. Author PDF: [NYU](https://archive.nyu.edu/handle/2451/27818).

[^raykar]: Vikas C. Raykar, Shipeng Yu, Linda H. Zhao, Gerardo Hermosillo Valadez, Charles Florin, Luca Bogoni, and Linda Moy, ["Learning From Crowds"](https://jmlr.csail.mit.edu/papers/v11/raykar10a.html), *Journal of Machine Learning Research*, 11, 2010.

[^glad]: Jacob Whitehill, Paul Ruvolo, Tingfan Wu, Jacob Bergsma, and Javier R. Movellan, ["Whose Vote Should Count More: Optimal Integration of Labels from Labelers of Unknown Expertise"](https://papers.nips.cc/paper/3644-whose-vote-should-count-more-optimal-integration-of-labels-from-labelers-of-unknown-expertise), *NeurIPS*, 2009. Author PDF: [UCSD](https://inc.ucsd.edu/mplab/users/jake/OptimalLabeling.pdf).
