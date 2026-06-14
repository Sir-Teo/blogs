---
layout: post
title: "The Control Group Holds a Ghost Slope"
description: "Difference-in-differences is not before-minus-after. It is a wager that the control group carries the untreated trend the treated units never got to reveal."
date: 2026-06-13 09:38:00 -0400
categories: statistics
tags: [difference-in-differences, causal-inference, econometrics, panel-data, natural-experiments, policy-evaluation]
excerpt: "DiD works when the control group can stand in for the treated group's missing slope. The algebra is small; the counterfactual claim is the load-bearing beam."
---

Difference-in-differences always has an empty chair.

One state raises the minimum wage. One city changes a policing rule. One app
rolls out a feature. One exchange changes a fee. One team adopts a new workflow.

The question is always the same:

```text
what would have happened to the treated units if they had not been treated?
```

Difference-in-differences answers with a control trend.

That is both the beauty and the trap.

## Four Cells, One Missing Line

In the two-period, two-group version, there is a treated group $$T$$, a control
group $$C$$, a pre period $$0$$, and a post period $$1$$. The estimator is:

$$
\widehat{\tau}_{DiD}
=
(\bar{Y}_{T,1} - \bar{Y}_{T,0})
-
(\bar{Y}_{C,1} - \bar{Y}_{C,0}).
$$

It looks like arithmetic. It is really a counterfactual statement:

$$
\mathbb{E}[Y^0_{T,1} - Y^0_{T,0}]
=
\mathbb{E}[Y^0_{C,1} - Y^0_{C,0}].
$$

The untreated treated group and the untreated control group do not need to have
the same level. They need to have the same change. The control group is allowed
to start higher, lower, richer, poorer, larger, smaller. The identifying claim
is about the missing slope.

Card and Krueger's famous New Jersey/Pennsylvania minimum-wage study is the
canonical applied example: New Jersey raised its minimum wage in 1992 while
Pennsylvania did not, and fast-food employment changes in Pennsylvania served as
the comparison trend.[^card-krueger] Whatever one thinks about the minimum-wage
debate, the design made the estimand vivid: not employment after the policy, but
employment after the policy relative to a plausible no-policy change.

The design lives or dies on that plausibility.

## Bend the Missing Line

The lab below has a treated group and a control group. The purple dashed line is
the treated group's unobserved no-treatment path. You get to change the slope
gap, anticipation, treatment dynamics, and finite-sample noise.

The raw DiD estimator uses all pre periods and all post periods. The
pretrend-fit estimator extrapolates the pre-period treated-control gap forward.
That can help when the violation is a stable linear slope. It can hurt when the
pre-period itself has anticipation or noise. The placebo pre-DiD compares early
pre-period changes to late pre-period changes.

<div class="did-lab" data-did-lab>
  <div class="did-lab__controls">
    <label>
      Treatment effect: <output data-value="effect">+3.20</output>
      <input type="range" min="-400" max="800" step="20" value="320" data-param="effect">
    </label>
    <label>
      Treated slope gap: <output data-value="trendGap">+0.25/period</output>
      <input type="range" min="-180" max="180" step="5" value="25" data-param="trendGap">
    </label>
    <label>
      Anticipation at t=-1: <output data-value="anticipation">0.40</output>
      <input type="range" min="0" max="400" step="10" value="40" data-param="anticipation">
    </label>
    <label>
      Dynamic drift: <output data-value="dynamic">+0.45/period</output>
      <input type="range" min="-140" max="180" step="5" value="45" data-param="dynamic">
    </label>
    <label>
      Late cohort effect: <output data-value="lateEffect">70%</output>
      <input type="range" min="35" max="210" step="5" value="70" data-param="lateEffect">
    </label>
    <label>
      Outcome noise: <output data-value="noise">20%</output>
      <input type="range" min="0" max="110" step="5" value="20" data-param="noise">
    </label>
  </div>
  <div class="did-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="640" aria-label="Difference-in-differences simulator showing two-group trends, estimator bias, event-study shape, and staggered adoption"></canvas>
  <div class="did-lab__legend">
    <span><i style="background:#0f766e"></i> Treated observed</span>
    <span><i style="background:#64748b"></i> Control observed</span>
    <span><i style="background:#7c3aed"></i> Treated no-treatment path</span>
    <span><i style="background:#be123c"></i> Raw DiD / TWFE</span>
  </div>
  <p class="did-lab__note">
    Deterministic synthetic experiment. The staggered panel uses group and time
    fixed-effect residualization to compute a simple TWFE coefficient. The
    "cohort vs never" bar compares each treated cohort to the never-treated
    group around its own adoption time.
  </p>
</div>
<script src="{{ '/assets/js/did-counterfactual-lab.js?v=20260613a' | relative_url }}"></script>

Start with the default. The true post-treatment effect is positive, but the raw
DiD is not exactly the true average effect because the treated group already had
a slightly different untreated slope and a small anticipation bump before the
policy begins. The pre-placebo is not a formal proof, but it is a warning light.

Now set **Treated slope gap** to zero and **Anticipation** to zero. The raw DiD
moves closer to the true effect. That is the canonical picture. The levels can
differ; the slope is what matters.

Next raise **Treated slope gap**. The estimator starts attributing a
pre-existing trend difference to the treatment. This is the mistake behind many
bad natural-experiment stories: the treatment group was already on a different
path, and the control group was asked to carry a counterfactual slope it did not
have.

Finally raise **Anticipation**. The pre-period is no longer clean. People,
firms, schools, or markets may react before the official treatment date. In an
event-study plot, this can look like a pretrend. In the design, it means the
"pre" period is partly treated.

## A Flat Pretrend Is Not a Warranty

It is common to plot event-study coefficients and look for flat pretrends:

$$
\widehat{\tau}_k
\quad\text{for}\quad
k=-4,\ldots,-1,0,1,\ldots
$$

This is useful. It is not a magic test.

Small samples can miss important pretrend violations. Anticipation can corrupt
the last pre-period. Multiple pre-period testing creates its own selection
problem. And a flat-looking pretrend does not prove that post-period untreated
trends would have stayed parallel.

Roth, Sant'Anna, Bilinski, and Poe's survey of the recent DiD literature makes
this framing explicit: modern work is largely about relaxing and diagnosing
pieces of the canonical setup, including multiple periods, staggered timing,
parallel-trends violations, and inference.[^roth]

A pretrend plot is a conversation with the assumption. It is not the assumption
walking into court with identification papers.

## The Standard Error Can Lie Too

Even if the identifying assumption is right, uncertainty can be wrong.

Bertrand, Duflo, and Mullainathan showed how conventional standard errors can
badly overstate precision in DiD settings with serially correlated outcomes and
highly persistent treatment indicators.[^bdm] Their placebo-law exercise is the
kind of result that should stay in every applied researcher's bones: with panel
data and policy treatments, naive standard errors can make noise look like
evidence.

The practical implication is boring and important:

```text
cluster at the level where treatment varies
think about serial correlation
do not confuse many time periods with many independent experiments
```

If the policy turns on at the state level, individual observations inside the
state do not create independent policy shocks. They create more precise
measurement of the same shock.

## Staggered Timing Changes the Cast

The bottom-right panel of the lab adds an early-treated cohort, a late-treated
cohort, and a never-treated group. The TWFE coefficient comes from residualizing
the outcome and treatment indicator by group and time fixed effects:

$$
Y_{gt}
=
\alpha_g + \lambda_t + \beta D_{gt} + \epsilon_{gt}.
$$

With homogeneous constant effects and valid parallel trends, this can behave
well. With heterogeneous or dynamic effects, it can become hard to interpret.
The lab also reports the share of treated group-time cells that receive
essentially zero TWFE residual weight in this small balanced design. Those cells
are treated observations, but they are not where the coefficient is getting its
leverage.

Goodman-Bacon showed that, with variation in treatment timing, the two-way
fixed-effects DiD coefficient can be decomposed into a weighted average of
two-by-two DiD comparisons.[^goodman-bacon] Some of those comparisons use
already-treated units as controls for later-treated units. If treatment effects
change over event time, those comparisons can subtract treated outcomes from
treated outcomes.

Callaway and Sant'Anna instead target group-time average treatment effects,
building comparisons that respect treatment timing.[^callaway-santanna] Sun and
Abraham showed that dynamic event-study coefficients can be contaminated by
treatment effects from other relative periods when treatment timing varies and
effects are heterogeneous.[^sun-abraham] de Chaisemartin and D'Haultfoeuille
made the weight problem even sharper: two-way fixed-effect estimators can put
negative weights on some group-time treatment effects under heterogeneity.[^dcdh]

The vocabulary changes across papers. The practical warning keeps the same
accent:

```text
staggered adoption turns "the DiD estimate" into a weighting problem
```

If the effect grows over time, differs by cohort, or the already-treated units
are used as controls, the regression coefficient may not be the average effect
you thought you were estimating.

## What I Want on the Table

Before I trust a DiD claim, I want to see:

- the raw group trends, not only a regression table;
- the treatment timing and who serves as control for whom;
- a clear definition of the estimand: ATT for which group and period;
- pre-period diagnostics and a discussion of their power;
- anticipation checks around the policy date;
- robustness to group-specific trends only when that estimand still makes sense;
- clustered or otherwise design-appropriate inference;
- in staggered settings, cohort-time estimands or modern DiD estimators rather
  than a reflexive TWFE coefficient;
- a story for why the control group carries the treated group's missing slope.

That last line is the whole thing.

Difference-in-differences is not a formula that turns observational data into
causality. It is a research design that says: the control group tells us how the
treated group would have changed without treatment.

When that sentence is plausible, DiD is one of the most useful tools in applied
statistics.

When it is not, the algebra is still simple.

It is just answering the wrong counterfactual.

## References

[^card-krueger]: David Card and Alan B. Krueger, ["Minimum Wages and Employment: A Case Study of the Fast-Food Industry in New Jersey and Pennsylvania"](https://davidcard.berkeley.edu/papers/njmin-aer.pdf), *American Economic Review*, 1994. NBER working paper page: [w4509](https://www.nber.org/papers/w4509).

[^bdm]: Marianne Bertrand, Esther Duflo, and Sendhil Mullainathan, ["How Much Should We Trust Differences-in-Differences Estimates?"](https://academic.oup.com/qje/article-abstract/119/1/249/1876068), *Quarterly Journal of Economics*, 2004. NBER PDF: [w8841](https://www.nber.org/system/files/working_papers/w8841/w8841.pdf).

[^goodman-bacon]: Andrew Goodman-Bacon, ["Difference-in-Differences with Variation in Treatment Timing"](https://www.nber.org/papers/w25018), *Journal of Econometrics*, 2021.

[^callaway-santanna]: Brantly Callaway and Pedro H. C. Sant'Anna, ["Difference-in-Differences with Multiple Time Periods"](https://arxiv.org/abs/1803.09015), *Journal of Econometrics*, 2021.

[^sun-abraham]: Liyang Sun and Sarah Abraham, ["Estimating Dynamic Treatment Effects in Event Studies with Heterogeneous Treatment Effects"](https://arxiv.org/abs/1804.05785), *Journal of Econometrics*, 2021.

[^dcdh]: Clement de Chaisemartin and Xavier D'Haultfoeuille, ["Two-Way Fixed Effects Estimators with Heterogeneous Treatment Effects"](https://arxiv.org/abs/1803.08807), *American Economic Review*, 2020.

[^roth]: Jonathan Roth, Pedro H. C. Sant'Anna, Alyssa Bilinski, and John Poe, ["What's Trending in Difference-in-Differences? A Synthesis of the Recent Econometrics Literature"](https://arxiv.org/abs/2201.01194), *Journal of Econometrics*, 2023.
