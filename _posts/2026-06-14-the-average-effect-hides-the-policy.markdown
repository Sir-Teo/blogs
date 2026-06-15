---
layout: post
title: "Do Not Spend the Budget on the Already Good"
description: "A treatment can be bad on average and still worth targeting. CATE and uplift models ask who changes because of treatment, not who would have done well anyway."
date: 2026-06-14 14:33:00 -0400
categories: machine-learning
tags: [causal-inference, heterogeneous-treatment-effects, uplift-modeling, policy-learning, cate, machine-learning]
excerpt: "The average treatment effect answers whether to treat everyone. A policy needs the scarce-action question: who changes enough to justify the cost?"
---

The average treatment effect is a blunt instrument with many honorable uses.

Sometimes blunt is exactly right. If a drug helps nearly everyone, if a safety
fix has negligible cost, or if a product change is shipped globally, the average
effect is the object you need.

But many real interventions are rationed. You cannot call every user, discount
every subscription, message every patient, inspect every transaction, or spend
latency budget on every request. Then the question changes:

```text
not: should everyone get the treatment?
but: who should get the treatment?
```

That is a different estimand, and it has a budget attached.

The dangerous shortcut is to build a response model. Predict who will buy after
receiving a coupon. Predict who will survive after receiving the intervention.
Predict who will be profitable after routing to the expensive system. Then
treat the top scores.

That can target the wrong people. High response under treatment may simply mean
"they were going to do well anyway." Uplift is the increment, not the level.

## Missing Twin Outcome

Write the two potential outcomes as \(Y(1)\) and \(Y(0)\). The conditional
average treatment effect is

$$
\tau(x)
=
\mathbb{E}[Y(1)-Y(0)\mid X=x].
$$

The average treatment effect is \(\mathbb{E}[\tau(X)]\). A policy, however,
cares about where \(\tau(x)\) is large enough to beat the cost of action.
Relative to treating no one, a binary policy \(\pi(x)\in\{0,1\}\) has
incremental value

$$
V(\pi)
=
\mathbb{E}\left[\pi(X)\{\tau(X)-c\}\right],
$$

where \(c\) is the treatment cost, annoyance cost, opportunity cost, compute
cost, or risk budget.

This equation is the reason response modeling is not enough. A response model
estimates something like

$$
\mu_1(x)=\mathbb{E}[Y(1)\mid X=x].
$$

But

$$
\mu_1(x)=\mathbb{E}[Y(0)\mid X=x]+\tau(x).
$$

The baseline term can dominate. A customer who was already likely to renew can
have a high treated response and near-zero uplift. A customer who dislikes
being nudged can have a high treated response and negative uplift. The policy
needs the contrast.

This is the core difficulty Athey and Imbens emphasize in causal trees: causal
effects are not observed unit by unit, so ordinary prediction validation does
not directly apply.[^athey-imbens] You see \(Y(1)\) or \(Y(0)\), never both for
the same unit.

## A Budgeted Targeting Lab

The lab below creates a synthetic randomized experiment. The true individual
effects are known to the simulator but hidden from the learners. One region is
**persuadable**: treatment creates value. Another region is **already good**:
treated outcomes are high because baseline outcomes are high, but the treatment
effect is low or harmful.

The default treatment is bad on average after cost. Treating a random 35% of
the population loses value. A CATE policy can still create value by targeting
the few people whose treatment effect is high enough.

<div class="uplift-policy-lab" data-uplift-policy-lab>
  <div class="uplift-policy-lab__controls">
    <label>
      Training rows: <output data-value="n">2200</output>
      <input type="range" min="600" max="5000" step="200" value="2200" data-param="n">
    </label>
    <label>
      Treatment budget: <output data-value="budget">35%</output>
      <input type="range" min="5" max="95" step="5" value="35" data-param="budget">
    </label>
    <label>
      Effect strength: <output data-value="effect">100%</output>
      <input type="range" min="40" max="180" step="5" value="100" data-param="effect">
    </label>
    <label>
      Treatment cost: <output data-value="cost">12%</output>
      <input type="range" min="0" max="40" step="1" value="12" data-param="cost">
    </label>
    <label>
      Outcome noise: <output data-value="noise">45%</output>
      <input type="range" min="10" max="100" step="5" value="45" data-param="noise">
    </label>
    <label>
      Assignment confounding: <output data-value="confounding">0%</output>
      <input type="range" min="-100" max="100" step="10" value="0" data-param="confounding">
    </label>
    <label>
      Minimum overlap: <output data-value="overlap">10%</output>
      <input type="range" min="2" max="30" step="1" value="10" data-param="overlap">
    </label>
  </div>
  <div class="uplift-policy-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="660" aria-label="Uplift policy lab showing heterogeneous treatment effects, policy gain curves, uplift calibration, and overlap diagnostics"></canvas>
  <div class="uplift-policy-lab__legend">
    <span><i style="background:#172026"></i> Oracle</span>
    <span><i style="background:#0f766e"></i> R-learner policy</span>
    <span><i style="background:#b45309"></i> Response targeting</span>
    <span><i style="background:#94a3b8"></i> Random targeting</span>
    <span><i style="background:#7c3aed"></i> Helpful effect</span>
    <span><i style="background:#be123c"></i> Harmful effect</span>
  </div>
  <p class="uplift-policy-lab__note">
    Deterministic synthetic experiment. The R-learner here is a small
    residualized ridge-regression version, not a production causal forest. The
    test set is generated separately so policy value is evaluated out of sample.
  </p>
</div>
<script defer src="{{ '/assets/js/uplift-policy-lab.js?v=20260614a' | relative_url }}"></script>

Start with the defaults. The net ATE is about \(-0.112\): if you treated
everyone, you would lose value on average. Randomly treating 35% is also bad.
The R-learner policy has positive lift, around \(+0.059\) per population member
in this deterministic run, close to the oracle's \(+0.063\). Response targeting
barely helps because it spends budget on people with high treated outcomes,
not necessarily high causal lift.

The first panel shows the real landscape. Purple regions are helpful. Red
regions are harmful. The green outlines are the people selected by the
R-learner policy. The point is not that this toy model is impressive; the point
is that the policy value is a different object from the average effect.

The second panel is the operational plot. Sort people by a score, treat the top
\(k\%\), and draw incremental value. A good uplift score rises quickly; a
response score can flatten or even turn down because it is ranking baseline
outcome, not treatment effect.

Now raise **Treatment cost**. The ATE gets worse, and the policy should become
more selective. In a real product, cost may be money, user annoyance, fairness
budget, latency, or scarce human review. A treatment effect without a cost
model is not yet a policy.

Raise **Outcome noise** or lower **Training rows**. The R-policy pulls away from
oracle because ranking CATE is a hard statistical problem. The harm metric also
matters: it reports the share of treated people whose true net effect is
negative. A policy can have positive average value while still harming a
nontrivial subgroup.

Finally move **Assignment confounding** and lower **Minimum overlap**. The
overlap panel shows treated/control counts by estimated uplift decile. If a high
score region has almost no controls or almost no treated examples, the model is
extrapolating. No uplift method gets causal information from a region where the
experiment never created a comparison.

The source is intentionally inspectable:
[`assets/js/uplift-policy-lab.js`]({{ '/assets/js/uplift-policy-lab.js' | relative_url }}).

## Why the R-Learner Subtracts the Obvious

The lab's "R" score is a small residualized learner inspired by Nie and Wager's
R-learner.[^rlearner] The core equation is the partially linear form

$$
Y - m(X)
=
\{W-e(X)\}\tau(X)+\varepsilon,
$$

where

$$
m(X)=\mathbb{E}[Y\mid X],
\qquad
e(X)=\Pr(W=1\mid X).
$$

The nuisance functions \(m\) and \(e\) soak up baseline outcome and treatment
assignment. The treatment-effect model is then fit to the residual variation
that remains. In the toy lab those nuisance models are deliberately plain; in a
serious system they would be cross-fit and estimated with flexible learners.

This residualization is not decoration. It is what keeps "high baseline
outcome" from masquerading as "high treatment effect," and it helps with
observational treatment assignment when unconfoundedness and overlap are
plausible.

Künzel, Sekhon, Bickel, and Yu's meta-learner framework is useful because it
separates the causal estimand from the supervised learning machinery.[^metalearners]
S-learners, T-learners, X-learners, R-learners, causal forests, and doubly
robust variants are all ways of borrowing prediction tools while remembering
that the target is a contrast.

## The Ground Truth Is Missing

Causal trees and forests grew partly because heterogeneous effects need
adaptive neighborhoods. A global linear interaction model may miss the few
regions where treatment matters; a fully flexible response model may overfit
baseline outcomes.

Athey and Imbens's causal tree work introduced splitting criteria aimed at
treatment-effect heterogeneity rather than outcome prediction.[^athey-imbens]
Wager and Athey developed causal forests with asymptotic inference under
conditions including unconfoundedness and honesty, where one sample is used to
choose tree structure and another to estimate effects inside leaves.[^wager-athey]
Athey, Tibshirani, and Wager's generalized random forests extend that local
estimation idea to quantities identified by moment equations.[^grf]

The technical details matter, but the cultural detail may matter more: a CATE
estimator should be evaluated as a causal estimator and as a policy component.
Ordinary predictive accuracy is not enough, because the individual treatment
effect is not observed.

## A Score Is Not Yet an Action Rule

Estimating \(\tau(x)\) is not the same as choosing a deployable policy.

A policy may have a budget:

$$
\mathbb{E}[\pi(X)] \le b.
$$

It may have fairness constraints, capacity constraints, exploration
requirements, or monotonicity rules. Athey and Wager's policy-learning work
frames this directly as choosing a treatment assignment policy from data under
such constraints.[^policy]

The lab uses the simplest budget rule: treat the top \(b\%\) by estimated net
effect. That is enough to expose the important distinction:

```text
ATE asks whether to treat everyone.
CATE ranks who benefits.
Policy learning decides what action rule is allowed.
```

In production, the policy layer should be explicit. If the treatment is a
discount, the policy should include margin. If it is a notification, it should
include fatigue. If it is a human review, it should include reviewer capacity.
If it is a model fallback, it should include latency and compute.

## The Report I Would Ask For

Before trusting an uplift model, I would want a report that includes:

- the estimand: CATE, net CATE, individualized treatment rule, or constrained
  policy value;
- the experimental or observational design that identifies treatment effects;
- overlap diagnostics by proposed score decile;
- treatment and control counts in every targeted region;
- out-of-sample policy value, preferably from a holdout experiment or doubly
  robust evaluation;
- harm among treated, not only average value;
- calibration of estimated uplift against randomized holdout bins;
- sensitivity to treatment cost and budget;
- a response-model baseline to catch "already good" targeting;
- a plan for exploration, because a deterministic policy can destroy future
  overlap.

That last item is easy to miss. Once the policy stops treating low-score
regions, future data cannot tell whether those regions changed. Personalization
systems need an exploration budget not because exploration is fashionable, but
because causal knowledge decays when comparisons disappear.

## Build the Loop, Not Just the Score

The research direction I find most useful is not "better CATE score" in the
abstract. It is policy-aware causal infrastructure:

```text
estimate effect
price the action
audit overlap
evaluate policy value
reserve exploration
monitor harm
```

That loop should be a first-class production object. Otherwise the uplift model
will be treated like a ranking model, the ranking model will be evaluated like
a response model, and a high-response population will quietly consume the
budget meant for people who could actually be changed.

The average effect is a good scientific summary. It is a bad map for a scarce
action.

[^athey-imbens]: Susan Athey and Guido Imbens, ["Recursive Partitioning for Heterogeneous Causal Effects"](https://www.pnas.org/doi/10.1073/pnas.1510489113), *PNAS*, 2016.

[^rlearner]: Xinkun Nie and Stefan Wager, ["Quasi-Oracle Estimation of Heterogeneous Treatment Effects"](https://academic.oup.com/biomet/article-abstract/108/2/299/5911092), *Biometrika*, 2021. An arXiv version is also available [here](https://arxiv.org/abs/1712.04912).

[^metalearners]: Sören R. Künzel, Jasjeet S. Sekhon, Peter J. Bickel, and Bin Yu, ["Metalearners for estimating heterogeneous treatment effects using machine learning"](https://www.pnas.org/doi/10.1073/pnas.1804597116), *PNAS*, 2019.

[^wager-athey]: Stefan Wager and Susan Athey, ["Estimation and Inference of Heterogeneous Treatment Effects using Random Forests"](https://www.tandfonline.com/doi/full/10.1080/01621459.2017.1319839), *Journal of the American Statistical Association*, 2018.

[^grf]: Susan Athey, Julie Tibshirani, and Stefan Wager, ["Generalized Random Forests"](https://projecteuclid.org/journals/annals-of-statistics/volume-47/issue-2/Generalized-random-forests/10.1214/18-AOS1709.full), *The Annals of Statistics*, 2019.

[^policy]: Susan Athey and Stefan Wager, ["Policy Learning with Observational Data"](https://www.gsb.stanford.edu/faculty-research/publications/policy-learning-observational-data), *Econometrica*, 2021.
