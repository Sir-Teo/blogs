---
layout: post
title: "The Tree Gets More Lottery Tickets"
description: "Greedy tree splits compare the best cut each feature can find. A feature with many possible cuts gets more chances to look important by accident."
date: 2026-06-16 23:30:00 -0400
categories: machine-learning
tags: [decision-trees, random-forests, feature-importance, cart, variable-selection-bias, model-interpretability, machine-learning, statistics]
excerpt: "A noisy continuous variable can beat a real binary signal at a tree node because it is allowed to try many more thresholds. The split criterion is also a multiple-testing procedure."
---

A decision tree has a wonderfully legible sales pitch:

```text
ask one question
split the data
repeat
```

That is why trees are everywhere. They feel less like a black box than a
neural net and less like algebra than a generalized linear model. The root node
looks like an explanation.

But the root node is not just an explanation.

It is the winner of a contest.

For a CART-style classifier, the tree searches over candidate splits and chooses
the one that most reduces node impurity.[^cart] That works beautifully when the
contest is fair. It gets strange when one feature gets one ticket and another
feature gets a hundred.

The quiet bias is:

```text
the tree compares each feature's best accident
```

## The Small Crime Scene

Imagine three predictors:

```text
signal          binary, genuinely predictive
binary noise    binary, independent of the label
many-cut noise  continuous, independent of the label
```

At a stump, the signal feature has one natural split. The binary-noise feature
also has one. The continuous-noise feature can try many thresholds.

Even when the continuous feature is pure noise, its **best** threshold is the
maximum of many random impurity reductions. The maximum of many accidents is not
an average accident. It is a selected accident.

That selection step is where interpretability leaks.

Hothorn, Hornik, and Zeileis state the issue bluntly in their conditional
inference tree paper: exhaustive-search tree algorithms have both overfitting
and selection bias toward covariates with many possible splits or missing
values.[^hothorn] Pruning can shrink an overgrown tree, but it does not undo
the biased choice of which variable was invited into the tree.[^hothorn]

Strobl, Boulesteix, Zeileis, and Hothorn made the same warning concrete for
random forests and variable importance: when predictors differ in measurement
scale or number of categories, the usual variable-importance measures can
artificially prefer suboptimal predictors.[^strobl]

This is not a moral failure of trees. It is a multiple-comparisons problem
wearing a friendly shape.

## The Lab

The browser lab below fits a single greedy classification stump and then repeats
the same experiment many times. The data-generating process is simple:

```text
one binary signal changes the class probability
one binary noise feature is independent of the label
one ordered categorical noise feature is independent of the label
one many-cut continuous noise feature is independent of the label
```

The split criterion is Gini impurity decrease. The holdout set is freshly
generated from the same process, so a noise split that won the training contest
has nowhere to hide.

Default settings:

```text
samples              160
signal effect         22%
many-cut candidates  120
category levels       36
repeated samples     260

single fitted stump:  signal
training gain         0.0366
holdout gain          0.0120
holdout accuracy      57.7%

signal wins           73%
all noise wins        27%
many-cut noise wins   15%
```

The signal is real. The noise is also competitive.

<style>
  .tree-bias-lab {
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

  .tree-bias-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin-bottom: 1rem;
  }

  .tree-bias-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .tree-bias-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .tree-bias-lab input {
    accent-color: #0f766e;
    width: 100%;
  }

  .tree-bias-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .tree-bias-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .tree-bias-lab__metric.good {
    border-color: #9ed8c5;
  }

  .tree-bias-lab__metric.warn {
    border-color: #f2b8c4;
  }

  .tree-bias-lab__metric span,
  .tree-bias-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .tree-bias-lab__metric span {
    display: block;
  }

  .tree-bias-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .tree-bias-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .tree-bias-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .tree-bias-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .tree-bias-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .tree-bias-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 520px) {
    .tree-bias-lab {
      padding: 0.75rem;
    }

    .tree-bias-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="tree-split-bias-lab" class="tree-bias-lab" data-tree-split-bias-lab>
  <div class="tree-bias-lab__controls">
    <label>
      Samples: <output data-value="n">160</output>
      <input type="range" min="60" max="420" step="10" value="160" data-param="n">
    </label>
    <label>
      Signal effect: <output data-value="effect">22%</output>
      <input type="range" min="0" max="44" step="1" value="22" data-param="effect">
    </label>
    <label>
      Noise cut points: <output data-value="noiseCuts">120</output>
      <input type="range" min="2" max="260" step="2" value="120" data-param="noiseCuts">
    </label>
    <label>
      Category levels: <output data-value="categories">36</output>
      <input type="range" min="2" max="90" step="1" value="36" data-param="categories">
    </label>
    <label>
      Minimum leaf: <output data-value="minLeaf">8</output>
      <input type="range" min="2" max="30" step="1" value="8" data-param="minLeaf">
    </label>
    <label>
      Repetitions: <output data-value="repetitions">260</output>
      <input type="range" min="80" max="700" step="20" value="260" data-param="repetitions">
    </label>
    <label>
      Seed: <output data-value="seed">47</output>
      <input type="range" min="1" max="999" step="1" value="47" data-param="seed">
    </label>
  </div>
  <div class="tree-bias-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="720" aria-label="Decision tree split bias lab showing greedy stump gains, repeated winner rates, pure-noise split lottery, and training versus holdout gains"></canvas>
  <div class="tree-bias-lab__legend">
    <span><i style="background:#0f766e"></i> Signal</span>
    <span><i style="background:#be123c"></i> Many-cut noise</span>
    <span><i style="background:#7c3aed"></i> Category noise</span>
    <span><i style="background:#d97706"></i> Binary noise</span>
    <span><i style="background:#2563eb"></i> Training statistic</span>
  </div>
  <p class="tree-bias-lab__note">
    Deterministic browser experiment. Each repetition draws a new training
    sample, fits a one-split CART-style stump by exhaustive Gini-gain search,
    and evaluates the selected split on an independent holdout sample from the
    same data-generating process.
  </p>
</div>
<script defer src="{{ '/assets/js/tree-split-bias-lab.js?v=20260616a' | relative_url }}"></script>

Try three moves.

First, lower **Signal effect** to `10%`. In the default seed, the repeated
simulation gives the signal only about `18%` of stump wins; noise features win
the rest. The single fitted stump may still say `signal`, but the repeated
ledger tells you the procedure is unstable.

Second, raise **Noise cut points**. Under a pure-noise null, the expected best
training gain rises as the number of candidate thresholds rises. That bottom
left panel is the whole lesson in miniature: the split statistic is being
optimized over a larger menu.

Third, raise **Samples**. The fake gains shrink. This is why the problem is
most visible in small-to-medium data, wide tables, mixed feature types, and
feature-importance workflows where people read the tree as a ranked list of
causes.

## Why A Forest Does Not Magically Fix It

A random forest changes many things at once:

```text
bootstrap or subsampling
random feature subsets at each node
many high-variance trees averaged together
feature importance accumulated over many splits
```

It is excellent prediction machinery. But the default impurity importance is
still built from split gains. Louppe and coauthors describe mean decrease
impurity as the weighted impurity decrease accumulated over nodes where a
variable is used.[^louppe] If a variable is selected too often because it had
many candidate thresholds, that bias can flow into the importance score.

Strobl et al. separate two issues: biased variable selection inside individual
trees and bootstrap-sampling effects.[^strobl] That matters because "just use
permutation importance" is not a universal cleanup spell either. Permutation
importance answers a prediction question under a chosen fitted model and data
distribution. It is often safer than impurity importance for high-cardinality
noise, but it can still be affected by correlated predictors, leakage, grouped
features, and the model's learned structure.

So the practical hierarchy is:

```text
impurity importance: fast, inspectable, biased toward many split opportunities
permutation importance: closer to predictive reliance, needs a holdout contract
conditional inference: changes the split-selection test itself
domain audit: asks whether the feature was allowed to know the answer
```

## The Repair Is To Separate Two Questions

Greedy CART asks a combined question:

```text
which variable and which split give the biggest impurity drop?
```

Conditional inference trees separate it:

```text
which variable is associated with the response?
given that variable, where should it split?
```

Hothorn, Hornik, and Zeileis build that separation through permutation-test
machinery and stopping criteria based on multiple testing.[^hothorn] The point
is not that every project should swap algorithms immediately. The point is that
the bias has a statistical shape, not merely a software shape.

Once you see it, the root split of a tree starts to look less like:

```text
the most important feature is X
```

and more like:

```text
among the candidate questions this algorithm allowed itself to ask,
X produced the largest in-sample impurity decrease
```

That sentence is less pretty. It is also much closer to the truth.

## The Checklist I Use

Before interpreting tree features, I want to know:

```text
How many candidate splits did each feature get?
Were high-cardinality categoricals encoded as ordered integers?
Was feature importance impurity-based, permutation-based, or conditional?
Was importance measured on training data, out-of-bag data, or a real holdout?
Do grouped or correlated features split credit across substitutes?
Could a feature be a proxy for leakage, sampling, time, or row identity?
```

The lab is deliberately only a stump. That is enough. If the first split can be
biased before the tree grows, a forest of trees deserves an audit before it
becomes a story about the world.

The tree did not lie.

It just got more lottery tickets.

[^cart]: Leo Breiman, Jerome H. Friedman, Richard A. Olshen, and Charles J. Stone, [*Classification and Regression Trees*](https://books.google.com/books/about/Classification_and_Regression_Trees.html?id=JwQx-WOmSyQC), Wadsworth/Taylor & Francis, 1984.

[^hothorn]: Torsten Hothorn, Kurt Hornik, and Achim Zeileis, ["Unbiased Recursive Partitioning: A Conditional Inference Framework"](https://www.zeileis.org/papers/Hothorn%2BHornik%2BZeileis-2006.pdf), *Journal of Computational and Graphical Statistics* 15(3):651-674, 2006. DOI: [10.1198/106186006X133933](https://doi.org/10.1198/106186006X133933).

[^strobl]: Carolin Strobl, Anne-Laure Boulesteix, Achim Zeileis, and Torsten Hothorn, ["Bias in random forest variable importance measures: Illustrations, sources and a solution"](https://link.springer.com/article/10.1186/1471-2105-8-25), *BMC Bioinformatics* 8, article 25, 2007. DOI: [10.1186/1471-2105-8-25](https://doi.org/10.1186/1471-2105-8-25).

[^louppe]: Gilles Louppe, Louis Wehenkel, Antonio Sutera, and Pierre Geurts, ["Understanding variable importances in forests of randomized trees"](https://proceedings.neurips.cc/paper/4928-understanding-variable-importances-in-forests-of-randomized-trees.pdf), NeurIPS 2013.
