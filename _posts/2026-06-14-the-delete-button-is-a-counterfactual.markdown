---
layout: post
title: "Delete Buttons Owe Counterfactuals"
description: "Machine unlearning is not just deleting a row. It is the demand that a deployed model behave as if that row had never entered training."
date: 2026-06-14 09:30:00 -0400
categories: machine-learning
tags: [machine-unlearning, privacy, influence-functions, data-deletion, logistic-regression, machine-learning]
excerpt: "The hard part of machine unlearning is not removing data from storage. It is producing evidence about the model you would have trained without that example."
---

A delete button is easy to draw. The promise behind it is not.

The hard part is deciding what it means.

If a user asks a system to delete one training example, the database can remove a
row. The object store can drop a file. The feature pipeline can stop seeing that
record tomorrow.

But a trained model is not a table. It is a compressed consequence of a training
run. The deleted example may have moved a boundary, influenced a feature
selection step, changed a cluster center, tuned a hyperparameter, or affected a
checkpoint that later became the starting point for another model.

So the clean target is counterfactual:

```text
return the model we would have had
if this example had never been in the training set
```

That is why machine unlearning is more subtle than deletion. It is not a storage
operation. It is a claim about the lineage of a computation.

Cao and Yang's 2015 paper made this systems framing explicit: a forgetting
system should remove not only data, but the data's derived lineage, and they
introduced "machine unlearning" for the learning-system part of that
problem.[^cao] Ginart, Guan, Valiant, and Zou later framed data deletion in ML
as the problem of efficiently deleting individual data points from trained
models when full retraining is too expensive.[^ginart]

The exact counterfactual is simple to say and expensive to earn:

$$
\theta_{-i}
=
\arg\min_\theta
\frac{1}{n-1}
\sum_{j \ne i}
\ell(z_j, \theta)
+
\frac{\lambda}{2}\|\theta\|_2^2.
$$

Train without example $$i$$. Compare the result to the deployed model. That is
the gold standard in the small convex lab below.

Real unlearning work asks when we can avoid paying for that full retrain without
silently changing the promise.

## A Tiny Counterfactual You Can See

The lab uses two-dimensional logistic regression because the exact
counterfactual can be computed. One red point is marked for deletion. The gray
boundary is the full model trained with that point. The green boundary is the
exact retrain after removing it. The orange boundary is a first-order influence
approximation. The purple boundary is a few Newton-style repair steps on the
retained data, starting from the full model.

<style>
  .unlearn-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    margin: 1.5rem 0;
    padding: 1rem;
  }

  .unlearn-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    margin-bottom: 0.85rem;
  }

  .unlearn-lab__controls label {
    color: #172026;
    display: grid;
    font-size: 0.84rem;
    font-weight: 700;
    gap: 0.35rem;
  }

  .unlearn-lab__controls output {
    color: #0f766e;
    font-variant-numeric: tabular-nums;
  }

  .unlearn-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .unlearn-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    margin: 0.2rem 0 0.9rem;
  }

  .unlearn-lab__metric {
    background: #f8fafc;
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    padding: 0.62rem 0.7rem;
  }

  .unlearn-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .unlearn-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.2rem;
  }

  .unlearn-lab canvas {
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    display: block;
    width: 100%;
  }

  .unlearn-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    font-size: 0.82rem;
    margin-top: 0.75rem;
  }

  .unlearn-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .unlearn-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .unlearn-lab__note {
    color: #5d6872;
    font-size: 0.86rem;
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }

  @media (max-width: 980px) {
    .unlearn-lab__controls,
    .unlearn-lab__metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .unlearn-lab {
      margin-left: calc(50% - 50vw + 1rem);
      margin-right: calc(50% - 50vw + 1rem);
    }

    .unlearn-lab__controls,
    .unlearn-lab__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 430px) {
    .unlearn-lab__controls,
    .unlearn-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="unlearn-lab" data-unlearning-counterfactual-lab>
  <div class="unlearn-lab__controls">
    <label>
      Retained samples <output data-value="samples">140</output>
      <input type="range" min="80" max="260" step="10" value="140" data-param="samples">
    </label>
    <label>
      Class overlap <output data-value="overlap">42%</output>
      <input type="range" min="20" max="80" step="1" value="42" data-param="overlap">
    </label>
    <label>
      Deleted leverage <output data-value="leverage">65%</output>
      <input type="range" min="0" max="100" step="1" value="65" data-param="leverage">
    </label>
    <label>
      Regularization <output data-value="regularization">0.016</output>
      <input type="range" min="4" max="60" step="1" value="16" data-param="regularization">
    </label>
    <label>
      Repair steps <output data-value="repairSteps">2</output>
      <input type="range" min="0" max="8" step="1" value="2" data-param="repairSteps">
    </label>
    <label>
      Seed <output data-value="seed">17</output>
      <input type="range" min="1" max="999" step="1" value="17" data-param="seed">
    </label>
  </div>
  <div class="unlearn-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Machine unlearning toy lab comparing exact retraining, influence approximation, and repair steps after deleting one logistic-regression training point"></canvas>
  <div class="unlearn-lab__legend">
    <span><i style="background:#2563eb"></i> Class 0 retained</span>
    <span><i style="background:#0f766e"></i> Class 1 retained</span>
    <span><i style="background:#be123c"></i> Deleted point</span>
    <span><i style="background:#64748b"></i> Full model</span>
    <span><i style="background:#0f766e"></i> Exact retrain</span>
    <span><i style="background:#b45309"></i> Influence</span>
    <span><i style="background:#7c3aed"></i> Repair</span>
  </div>
  <p class="unlearn-lab__note">
    Deterministic convex experiment. The exact retrain on retained data is the
    target. The influence and repair models are approximations measured against
    that target, not certified removals.
  </p>
</div>

<script defer src="{{ '/assets/js/unlearning-counterfactual-lab.js?v=20260614a' | relative_url }}"></script>

With the default settings, exact deletion moves the logistic model by about
`0.102` in parameter space. The influence approximation lands close, but leaves
a `0.010` parameter gap from the exact retrain. Two repair steps on the retained
data reduce that gap to about `0.000002`.

The important thing is not that purple wins in a toy problem. The important
thing is that the scoreboard has a target. The target is not "the deleted row is
gone from storage." The target is "how close are we to the model trained on the
retained data?"

Set **Repair steps** to `0`. The purple model is just the old full model. Its
gap from the exact retrain is the whole deletion effect. Set it to `1`. In this
convex problem, one second-order repair step usually gets most of the way there.
Set it to `2` or more, and the repair model nearly coincides with exact
retraining.

Now increase **Deleted leverage**. The deleted point moves from an ordinary
class-1 region into a high-leverage, mislabeled-looking location among class-0
points. Exact deletion moves the boundary more. The influence approximation also
gets less exact, because a first-order approximation is being asked to explain a
larger counterfactual.

Finally lower **Regularization**. The model becomes more sensitive. The lab
prevents the regularization from going all the way to zero because a nearly
separable logistic regression can make the exact target ill-conditioned. That is
not a UI detail; it is part of the unlearning problem. If the training objective
does not define a stable model, the deletion counterfactual is itself unstable.

## Influence Is a Guess, Not a Receipt

Influence functions are useful because they answer a nearby question:

```text
if I upweight this example a tiny bit,
how would the optimum move?
```

For a regularized empirical-risk minimizer with Hessian $$H$$ at the full-data
optimum, the first-order deletion approximation is roughly

$$
\theta_{-i}
\approx
\theta
+
\frac{1}{n}
H^{-1}
\nabla_\theta \ell(z_i,\theta).
$$

Koh and Liang revived influence functions for modern ML interpretability, using
them to trace a model's prediction back to training examples and to approximate
the effect of training points without retraining.[^koh] The same local
sensitivity idea is tempting for unlearning: compute a correction, apply it, and
declare the point forgotten.

The lab shows both why that is attractive and why it is not enough.

When the deleted point is ordinary, the influence boundary is close to exact
retraining. When the point is high-leverage, the approximation error grows. When
the model is nonconvex, nonsmooth, under-regularized, or trained through a messy
pipeline, the gap can be harder to reason about.

Influence is evidence about a deletion.

It is not the deletion guarantee.

## What Kind of Forgetting Are We Promising?

There are several levels of ambition.

The weakest is operational: after a deletion request, stop using the raw data in
future training. That is necessary, but it says little about the already-trained
model.

The clean deterministic target is exact retraining: produce the same model the
training algorithm would have produced on the retained data. In the lab, this is
the green boundary.

Then there are efficient exact or structured approaches. Cao and Yang's
summation-form approach asks the learning system to be designed so that removing
one example updates stored aggregates rather than retraining from scratch.[^cao]
Ginart et al. study deletion-efficient algorithms in specific model families,
including k-means.[^ginart]

SISA training takes a different systems route: shard the data, isolate the
influence of examples, slice training into checkpoints, and aggregate models.
If one example must be removed, only part of the training computation has to be
replayed.[^sisa] This does not make deletion free. It makes the blast radius of a
future deletion smaller by construction.

Certified removal raises the bar further. Guo, Goldstein, Hannun, and van der
Maaten define a guarantee in which a model after removal is statistically
indistinguishable from a model that never saw the removed data, and they develop
a mechanism for regularized linear classifiers.[^certified] Notice the shape:
certification needs both an update rule and a way to bound the residual
information left behind.

So the useful question is not "can we delete data?"

It is:

```text
which unlearning contract are we satisfying,
and what evidence proves it?
```

## The Receipt I Would Ask For

For a real unlearning system, I would want deletion requests to produce a small
technical receipt.

Not a legal receipt. A model receipt.

It would include:

1. the training artifacts affected by the example;
2. whether the removal used exact retraining, cached sufficient statistics,
   sharded replay, an approximate update, or a certified mechanism;
3. the model version before and after removal;
4. retained-data quality metrics before and after removal;
5. a bound or measurement of distance from exact retraining;
6. whether downstream models, indexes, embeddings, caches, or eval reports were
   also derived from the deleted example.

That last item is where many unlearning stories get thin. A model is often not
the only artifact. The training data may have affected a tokenizer, feature
normalizer, hard-negative mining pool, data deduplication table, synthetic data
generator, benchmark split, or retrieval index.

The delete button is asking the system to reason about lineage.

## Forgetting Has to Be Designed In

The comforting fantasy is that unlearning can be bolted on after training, like
a new endpoint.

Sometimes it can, for simple models and narrow contracts.

But the general lesson is less comfortable: if deletion will matter later, the
training system has to be designed for deletion now. Store the right statistics.
Shard the right way. Preserve checkpoints. Track lineage. Keep enough metadata
to know which artifacts are downstream of which examples.

Machine unlearning is therefore not the opposite of machine learning.

It is learning with a counterfactual exit plan.

The lab is small because the counterfactual is visible. The same principle
scales into the hard cases: language models, recommender systems, embedding
indexes, medical models, fraud systems, and human-feedback pipelines. The
question is always the same:

```text
after deletion,
what model are you claiming this is?
```

If the answer is "the model that would have existed without that data," then the
delete button has become a scientific claim, not just a product control.

It deserves a measurement.

---

[^cao]: Yinzhi Cao and Junfeng Yang, ["Towards Making Systems Forget with Machine Unlearning"](https://www.ieee-security.org/TC/SP2015/papers-archived/6949a463.pdf), IEEE Symposium on Security and Privacy 2015.

[^ginart]: Antonio Ginart, Melody Guan, Gregory Valiant, and James Zou, ["Making AI Forget You: Data Deletion in Machine Learning"](https://papers.nips.cc/paper/8611-making-ai-forget-you-data-deletion-in-machine-learning), NeurIPS 2019.

[^koh]: Pang Wei Koh and Percy Liang, ["Understanding Black-box Predictions via Influence Functions"](https://proceedings.mlr.press/v70/koh17a.html), ICML 2017.

[^sisa]: Lucas Bourtoule, Varun Chandrasekaran, Christopher A. Choquette-Choo, Hengrui Jia, Adelin Travers, Baiwu Zhang, David Lie, and Nicolas Papernot, ["Machine Unlearning"](https://arxiv.org/abs/1912.03817), IEEE Symposium on Security and Privacy 2021.

[^certified]: Chuan Guo, Tom Goldstein, Awni Hannun, and Laurens van der Maaten, ["Certified Data Removal from Machine Learning Models"](https://proceedings.mlr.press/v119/guo20c.html), ICML 2020.
