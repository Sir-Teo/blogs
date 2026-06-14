---
layout: post
title: "SHAP Bars Need a Chosen World"
description: "SHAP values are not pure feature truth. They are Shapley values for a particular missing-feature game, background population, and prediction scale."
date: 2026-06-13 20:51:00 -0400
categories: machine-learning
tags: [shap, shapley-values, feature-attribution, interpretability, explainable-ai, conditional-expectations]
excerpt: "A feature attribution is not just a property of the model and the row. It also depends on what world the explainer samples when a feature goes missing."
---

The most dangerous SHAP plot is the one that looks self-evident.

A bar points right. A bar points left. The bars add up to the prediction. The
picture seems to say: here are the reasons.

But a Shapley value is not a small truth serum attached to a feature. It is an
allocation rule for a game. In model explanation, that game is created by asking
what the model is worth when only some features are known. The moment you ask
that question, you have already made a decision:

```text
what does it mean for a feature to be missing?
```

That decision can be more important than the model.

## The Plot Is Running a Game

Shapley introduced a value for cooperative games: if a group of players can
create value together, how should the total be divided among them?[^shapley]
The answer averages each player's marginal contribution over every order in
which the coalition could have been assembled.

SHAP imported that idea into model explanations.[^shap] The "players" are
features. The "value" is a prediction, or usually the difference between a
prediction and a baseline.

For a set of known features $$S$$, define a coalition value

$$
v(S) = \text{what the model predicts when the features in } S \text{ are fixed.}
$$

For two features, the Shapley allocation is small enough to write without
combinatorics:

$$
\phi_1 = \frac{1}{2}\left(v(\{1\}) - v(\varnothing)\right)
       + \frac{1}{2}\left(v(\{1,2\}) - v(\{2\})\right),
$$

$$
\phi_2 = \frac{1}{2}\left(v(\{2\}) - v(\varnothing)\right)
       + \frac{1}{2}\left(v(\{1,2\}) - v(\{1\})\right).
$$

The nice accounting identity is

$$
f(x_1, x_2) = v(\varnothing) + \phi_1 + \phi_2.
$$

That identity is real. The catch is hidden inside $$v(S)$$.

If $$S=\{1\}$$, feature 1 is known and feature 2 is missing. But a model usually
does not accept a "missing in the philosophical sense" token. Someone has to
fill feature 2 with something. An expectation. A baseline. A conditional draw. A
masked value. A causal intervention. A local reference point. A sample from a
background table.

Those are different games.

The uniqueness theorem says that, once a game is fixed, the Shapley value is the
unique allocation satisfying certain axioms. It does not say there is only one
reasonable way to turn a model, a row, and a dataset into a game. Sundararajan
and Najmi make this point sharply: many operationalizations of Shapley values
exist for model explanation, and they can disagree.[^many-shapley]

The word "missing" is carrying more furniture than it lets on.

## Two Ways to Pretend a Column Is Gone

Suppose the model uses features $$X_1$$ and $$X_2$$, and the row being explained
is $$x=(x_1,x_2)$$. Two common games are:

**Interventional game.** Fix the known features and draw the missing features
from their marginal background distribution, as if the missing features were
cut loose from the known ones.

$$
v_I(S) = \mathbb{E}\left[f(x_S, X_{\bar S})\right].
$$

This answers a question like: if I set these features to their observed values
and break their statistical dependence with the others, what changes?

**Conditional game.** Fix the known features and draw the missing features from
their conditional distribution given the known ones.

$$
v_C(S) = \mathbb{E}\left[f(x_S, X_{\bar S}) \mid X_S=x_S\right].
$$

This answers a different question: once I know these features, what else would I
expect to be true in this population?

Neither sentence is nonsense. Both can be useful. They are not interchangeable.

Aas, Jullum, and Loland studied the dependent-feature problem directly. Their
motivation was that Kernel SHAP and related approximations often rely on feature
independence, and that assumption can produce wrong explanations even for simple
linear models.[^aas] Janzing, Minorics, and Bloebaum press the issue from a
causal angle: observational and interventional expectations answer different
relevance questions, and confusion about the probability distribution for
dropped features is not a harmless implementation detail.[^janzing]

Here is the strange consequence that every SHAP user should internalize:

```text
a feature can receive conditional attribution even if the model never reads it
```

That sounds like a bug until you name the game.

## The Two-Feature Trap

Let the background distribution be bivariate normal:

$$
\begin{pmatrix}X_1\\X_2\end{pmatrix}
\sim
\mathcal{N}\left(
\begin{pmatrix}0\\0\end{pmatrix},
\begin{pmatrix}1 & \rho\\ \rho & 1\end{pmatrix}
\right).
$$

Let the model be

$$
f(x_1,x_2)=\beta_1x_1+\beta_2x_2+\gamma x_1x_2.
$$

The default lab below sets

$$
\beta_1=1.4,\quad \beta_2=0,\quad \gamma=0,\quad \rho=0.75,
\quad x_1=1.2,\quad x_2=1.1.
$$

The model literally ignores $$x_2$$. Its prediction is $$1.4 \cdot 1.2 = 1.68$$.

In the interventional game, $$X_2$$ gets no attribution:

$$
\phi_{2,I}=0.
$$

In the conditional game, $$X_2$$ gets positive attribution. Why? Because knowing
that $$X_2=1.1$$ makes $$X_1$$ look high in this background population:

$$
\mathbb{E}[X_1 \mid X_2=x_2] = \rho x_2.
$$

So the coalition "only $$x_2$$ is known" has model value

$$
v_C(\{2\})=\beta_1\rho x_2.
$$

The model did not read $$x_2$$. The conditional explainer did.

That sentence is the loose floorboard in the whole post.

<style>
  .shap-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .shap-lab__controls {
    display: grid;
    gap: 0.9rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(178px, 1fr));
  }

  .shap-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .shap-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .shap-lab__controls input {
    accent-color: #7c3aed;
    width: 100%;
  }

  .shap-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .shap-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .shap-lab__metric span,
  .shap-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .shap-lab__metric span {
    display: block;
  }

  .shap-lab__metric strong {
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .shap-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .shap-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="shap-background-lab" class="shap-lab" data-shap-lab>
  <div class="shap-lab__controls">
    <label>
      Correlation rho: <output data-value="rho">0.75</output>
      <input type="range" min="-90" max="90" step="5" value="75" data-param="rho">
    </label>
    <label>
      X1 weight: <output data-value="beta1">1.40</output>
      <input type="range" min="-250" max="250" step="10" value="140" data-param="beta1">
    </label>
    <label>
      X2 linear weight: <output data-value="beta2">0.00</output>
      <input type="range" min="-250" max="250" step="10" value="0" data-param="beta2">
    </label>
    <label>
      Interaction: <output data-value="gamma">0.00</output>
      <input type="range" min="-200" max="200" step="10" value="0" data-param="gamma">
    </label>
    <label>
      Observed x1: <output data-value="x1">1.20</output>
      <input type="range" min="-250" max="250" step="10" value="120" data-param="x1">
    </label>
    <label>
      Observed x2: <output data-value="x2">1.10</output>
      <input type="range" min="-250" max="250" step="10" value="110" data-param="x2">
    </label>
  </div>
  <div class="shap-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="SHAP background distribution lab comparing interventional and conditional feature attributions"></canvas>
  <p class="shap-lab__note">
    Deterministic two-feature experiment. The default model ignores x2, yet the
    conditional game assigns x2 credit because x2 predicts x1 in the background
    distribution. Set rho to zero and the proxy credit disappears.
  </p>
</div>
<script defer src="{{ '/assets/js/shap-background-lab.js?v=20260613a' | relative_url }}"></script>

At the default setting, watch three numbers:

```text
interventional x2 = 0.000
conditional x2    = about 0.578
linear x2 term    = 0.000
```

There is no direct $$x_2$$ term in the model. The conditional game is not
claiming otherwise. It is saying that, in this background distribution, $$x_2$$
is evidence about $$x_1$$, and $$x_1$$ is valuable to the model.

Now set **Correlation rho** to zero. The violet conditional curve collapses onto
the blue interventional curve. $$x_2$$ stops carrying information about $$x_1$$.

Set **Correlation rho** negative. The sign of the proxy attribution flips.
Feature 2 still is not read by the model, but it now predicts a lower $$X_1$$
when it is high.

Turn up **X2 linear weight**. Now $$x_2$$ has direct model use, and both games
must allocate some value to it. The disagreement no longer means "used versus
unused"; it means the direct contribution is mixed with a dependence story.

Turn up **Interaction**. The baseline changes because
$$\mathbb{E}[X_1X_2]=\rho$$. This is a quiet but important detail: the background
distribution does not only affect missing-feature coalitions. It can also change
the reference point from which every bar is measured.

## The Background Is Policy, Not Wallpaper

People often talk about "the SHAP value" as if it is attached to the row:

```text
row + model -> explanation
```

The safer schema is:

```text
row + model + prediction scale + background distribution + missingness game -> explanation
```

Change any one of those inputs and the bars can move.

The background distribution is especially easy to understate. A training set is
not a neutral object. It might mix countries, product tiers, calendar regimes,
clinical sites, fraud eras, market states, or demographic groups. The baseline
$$v(\varnothing)$$ is an expectation over that population. A feature's marginal
contribution is measured relative to that population.

If the explanation is for a credit model, do you want the background to be all
applicants, recently approved applicants, applicants from the same product, or
the counterfactual population the policy could plausibly serve? If it is for a
trading model, is the background all days, high-volatility days, post-event
minutes, or a rolling window? If it is for a medical model, is the background
the development cohort, the hospital currently deploying the model, or patients
with the same presenting complaint?

These are not cosmetic choices. They define the game.

A background can be perfectly reasonable for debugging the model and terrible
for explaining an action to a person affected by the model. Debugging asks,
"what did the model learn to use?" A stakeholder might ask, "what could have
changed the decision?" A regulator might ask, "is a protected attribute or its
proxy carrying influence?" A scientist might ask, "which causal mechanism is
responsible?"

Those are four different questions. A single bar chart should not be expected to
answer all of them.

## Sometimes Proxy Credit Is the Point

It is tempting to declare conditional SHAP guilty because it can credit unused
features. That is too quick.

Suppose a model uses ZIP code but not neighborhood income. In a deployment
population, neighborhood income may be highly predictable from ZIP code. A
conditional explanation that gives income some credit is not describing the
source code. It is describing information flow through the data distribution.
That can be exactly the thing you want when auditing proxies.

Or suppose a model uses lab result A and ignores lab result B, but B is a
cheaper, noisier measurement of the same physiological process. Conditional
credit to B may tell you that the explanation is about a latent state, not a
literal column.

Conditional explanations are often closer to a data analyst's question:

```text
what information does this feature reveal in the population where the model operates?
```

Interventional explanations are often closer to an engineering or causal
sensitivity question:

```text
what happens if this input is set while the others are not updated to match it?
```

Both questions can be useful. The error is to read one as the other and then
act surprised when the bars do not agree.

## Questions Before the Bars Get a Voice

Before using feature attribution as evidence, ask:

1. What exact model output is being explained: logit, probability, loss,
   expected value, rank score, or decision threshold?
2. What is the baseline population?
3. Are missing features sampled independently, conditionally, from a causal
   intervention, or from some application-specific masker?
4. Are dependent features grouped, separated, or both?
5. Could an unused feature receive credit because it is a proxy for a used
   feature?
6. Is the question observational, causal, diagnostic, or communicative?
7. Would the conclusion survive a different plausible background?

If the answer to any of these is "I do not know," the attribution is not yet an
explanation. It is a rendering of unexplained assumptions.

## Accounting Is Not Meaning

The satisfying part of SHAP is the accounting. The bars add up. The baseline
plus the attributions equals the prediction.

But accounting is not meaning.

Meaning lives in the game:

```text
what population supplies the counterfactual rows?
what dependencies are preserved?
what dependencies are broken?
what action, if any, does the explanation pretend is possible?
```

Once those choices are explicit, Shapley values are useful. They can expose
proxy structure, debug model reliance, compare local contributions, and make
baseline dependence visible. Without those choices, they become a very polished
way to forget the hardest part of the question.

The explanation has a background distribution.

[^shapley]: Lloyd S. Shapley, ["A Value for N-Person Games"](https://www.rand.org/content/dam/rand/pubs/papers/2021/P295.pdf), RAND paper version, 1952; later published in *Contributions to the Theory of Games II*, 1953.

[^shap]: Scott M. Lundberg and Su-In Lee, ["A Unified Approach to Interpreting Model Predictions"](https://papers.nips.cc/paper_files/paper/2017/hash/8a20a8621978632d76c43dfd28b67767-Abstract.html), NeurIPS 2017.

[^many-shapley]: Mukund Sundararajan and Amir Najmi, ["The Many Shapley Values for Model Explanation"](https://proceedings.mlr.press/v119/sundararajan20b.html), ICML 2020.

[^aas]: Kjersti Aas, Martin Jullum, and Anders Loland, ["Explaining individual predictions when features are dependent: More accurate approximations to Shapley values"](https://arxiv.org/abs/1903.10464), arXiv 2019; later published in *Artificial Intelligence*, 2021.

[^janzing]: Dominik Janzing, Lenon Minorics, and Patrick Bloebaum, ["Feature relevance quantification in explainable AI: A causal problem"](https://proceedings.mlr.press/v108/janzing20a.html), AISTATS 2020.
