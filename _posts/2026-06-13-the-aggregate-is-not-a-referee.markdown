---
layout: post
title: "Stop Asking the Aggregate to Referee"
description: "Simpson's paradox is not an arithmetic prank. It is what happens when a mixture is asked to answer a causal question it was not designed to answer."
date: 2026-06-13 19:36:00 -0400
categories: statistics
tags: [simpsons-paradox, collapsibility, odds-ratio, causal-inference, statistics, experimentation]
excerpt: "A treatment can help in every subgroup and still look harmful in the aggregate. The aggregate did not lie; it answered a different question."
---

The aggregate table has a dangerous authority.

It is bigger. It uses all the data. It feels less fussy than subgroup analysis.
When a debate has too many slices, the aggregate promises relief:

```text
just tell me what happened overall
```

Sometimes that is exactly the wrong request.

Simpson's paradox is the case where an association points one way inside every
stratum and the other way after the strata are pooled. Simpson's 1951 paper gave
the contingency-table version, and Blyth later gave the reversal its familiar
name in a discussion of the sure-thing principle.[^simpson][^blyth] A treatment
helps both high-risk and low-risk patients, but the pooled treatment group does
worse. An app feature improves retention in every country, but global retention
falls. A school admits women at higher rates within departments, but the
university-wide admission rate is lower.

The aggregate did not make an arithmetic error. It changed the mixture.

## The Smallest Trap

Suppose there are two strata: easy cases and hard cases. Treatment improves the
success probability in both:

$$
P(Y=1\mid D=1,S=s) > P(Y=1\mid D=0,S=s)
$$

for $$s \in \{\text{easy},\text{hard}\}$$.

The marginal comparison is different:

$$
P(Y=1\mid D=1) - P(Y=1\mid D=0).
$$

That comparison averages over the stratum distribution inside each treatment
group. If the treated group contains many more hard cases than the control group,
the aggregate can reverse sign even when the conditional effect is positive in
every stratum.

This is not a contradiction. It is two estimands:

```text
within-stratum effect
```

versus

```text
effect plus change in case mix
```

Only one of them may answer the causal question.

## A Lab for Reversals and Drift

The lab below uses a binary outcome called success. There are easy and hard
strata. Treatment has the same conditional odds ratio in both strata. The mix
slider changes which stratum is overrepresented in the treatment group.

At the default setting, treatment improves success in both strata. But treatment
also gets mostly hard cases while control gets mostly easy cases, so the marginal
success gap reverses.

<div id="simpson-lab" class="simpson-lab" data-simpson-lab>
  <div class="simpson-lab__controls">
    <label>
      People: <output data-value="n">2.0k</output>
      <input type="range" min="400" max="8000" step="200" value="2000" data-param="n">
    </label>
    <label>
      Baseline success: <output data-value="baseRate">50.0%</output>
      <input type="range" min="10" max="90" step="5" value="50" data-param="baseRate">
    </label>
    <label>
      Stratum gap: <output data-value="stratumGap">50.0 pp</output>
      <input type="range" min="0" max="86" step="2" value="50" data-param="stratumGap">
    </label>
    <label>
      Conditional odds ratio: <output data-value="oddsRatio">2.00</output>
      <input type="range" min="105" max="500" step="5" value="200" data-param="oddsRatio">
    </label>
    <label>
      Mix imbalance: <output data-value="mixSkew">60.0 pp</output>
      <input type="range" min="-90" max="90" step="5" value="60" data-param="mixSkew">
    </label>
  </div>
  <div class="simpson-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Simpson's paradox and odds-ratio collapsibility simulator showing stratum-specific rates, aggregate reversals, balanced odds-ratio drift, and aggregation diagnostics"></canvas>
  <div class="simpson-lab__legend">
    <span><i style="background:#be123c"></i> Control</span>
    <span><i style="background:#2563eb"></i> Treatment</span>
    <span><i style="background:#d97706"></i> Marginal effect</span>
    <span><i style="background:#0f766e"></i> Balanced OR</span>
    <span><i style="background:#7c3aed"></i> Conditional OR</span>
  </div>
  <p class="simpson-lab__note">
    Deterministic two-stratum binary-outcome table. Treatment has the same
    conditional odds ratio in both strata. The mix imbalance slider changes the
    hard-case share in treatment versus control. The balanced-OR panel sets the
    treatment and control stratum mix equal, showing odds-ratio non-collapsibility
    without confounding by stratum mix.
  </p>
</div>
<script defer src="{{ '/assets/js/simpson-collapsibility-lab.js?v=20260613a' | relative_url }}"></script>

Move **Mix imbalance** to zero. The reversal disappears. Treatment and control
now have the same easy/hard composition, so the marginal risk difference is a
reasonable standardized summary of the within-stratum improvements.

But notice the third panel. Even with balanced mix, the marginal odds ratio is
smaller than the conditional odds ratio when the strata have different baseline
risks. That is not Simpson's paradox. It is non-collapsibility of the odds ratio.

The distinction matters:

- Simpson reversal is about changing mixture weights.
- Odds-ratio non-collapsibility can occur without confounding.

Both are ways an aggregate can surprise you. They are not the same surprise.

## The Berkeley Lesson

The most famous real example is the 1973 University of California, Berkeley
graduate admissions data. The aggregate table suggested women had lower admission
rates. Bickel, Hammel, and O'Connell showed that the pattern largely changed
after department was considered: women applied more often to departments with
lower admission rates, while within many departments the apparent bias was
smaller or reversed.[^bickel]

The lesson is often told as "always stratify." That is too blunt.

Department mattered because it was connected to both applicant sex and admission
probability. It changed the case mix. But conditioning on every available
variable is not a law. Some variables are confounders, some are mediators, some
are colliders, and some are irrelevant bookkeeping. The right adjustment set is a
causal question, not a dashboard preference.

Pearl's treatment of Simpson's paradox makes this point sharply: the resolution
depends on whether the stratifying variable is a cause of treatment, a cause of
outcome, an effect of treatment, or something else in the causal graph.[^pearl]
Probability tables tell you where the reversal is. They do not by themselves
tell you which table answers the intervention question.

## Collapsibility Is Not Confounding

The word collapsibility asks whether a measure of association keeps the same
value after averaging over a covariate distribution, assuming the relevant
conditional measure is constant across strata.

Risk differences are collapsible under common conditions. If the treatment raises
success by 10 percentage points in every stratum, then a standardized average
over a common stratum distribution also raises success by 10 points.

Risk ratios are also collapsible in a similar standardized sense when the
conditional risk ratio is constant.

Odds ratios are different. Even when the treatment-control stratum mix is the
same, and even when there is no confounding by that stratum, the marginal odds
ratio can be closer to 1 than the common conditional odds ratio. Greenland,
Robins, and Pearl's review of confounding and collapsibility is useful precisely
because it separates these ideas: confounding is not the same as
non-collapsibility.[^greenland]

Why does the odds ratio behave this way?

Odds are nonlinear:

$$
\operatorname{odds}(p)=\frac{p}{1-p}.
$$

If you average probabilities first and then take odds, you do not get the same
answer as taking odds ratios inside strata and then averaging. The denominator
$$1-p$$ changes shape as baseline risk changes.

In the lab, set **Mix imbalance** to zero and raise **Stratum gap**. The treatment
and control groups have the same stratum mix, so this is not a Simpson reversal.
The balanced odds ratio still drifts away from the conditional odds ratio. The
aggregate odds ratio is answering a marginal association question on a nonlinear
scale.

## Experiments Are Not Immune

Randomization protects the treatment assignment, not every subgroup comparison
you might later make.

In a large randomized A/B test, treatment and control should have the same
expected distribution of risk strata. That makes the marginal risk difference a
legitimate estimand for the randomized population. But if product teams compare
countries, acquisition channels, device classes, or tenure buckets after
traffic allocation changes, the aggregate can move because the user mix moved.

There are two common mistakes.

The first is treating a stratified reversal as proof the aggregate is fake. The
aggregate may be the policy estimand if the policy truly changes the mix in that
way. If opening a clinic changes which patients arrive, the marginal outcome
includes that composition change.

The second is treating the aggregate as the final referee when the decision is
about a conditional intervention. If a treatment will be assigned within
departments, hospitals, countries, or customer segments, the relevant estimand
may be standardized within those strata.

The right question is not:

```text
aggregate or stratified?
```

It is:

```text
which population distribution should define the intervention?
```

## A Small Run Sheet

Before trusting an aggregate binary-outcome comparison, I want to know:

- What is the target estimand: marginal, conditional, or standardized?
- Which variables change the baseline risk?
- Which variables change treatment assignment or exposure?
- Which variables are downstream of treatment?
- Are the treatment and control groups using the same stratum distribution?
- Are the reported effects risk differences, risk ratios, odds ratios, or model
  coefficients?
- Would the qualitative claim survive standardization to a common population?
- If an odds ratio is reported, is the non-collapsibility being interpreted as
  confounding?
- Does the decision act on individuals within strata or on a policy that changes
  the mixture itself?

The last item is the important one. Statistics does not decide whether the
aggregate or the strata are "right" in the abstract. The decision does.

## The Portable Sentence

Simpson's paradox is not a magic trick. It is a warning label on mixtures.

An aggregate comparison combines within-stratum effects with differences in
stratum composition. If the composition is part of the intervention, keep it. If
the composition is a nuisance path, standardize it. If the effect measure is an
odds ratio, remember that even balanced aggregation can move the number.

The aggregate is useful. It is just not a referee.

```text
before asking what the average says, ask what population it averages over
```

That is where the paradox usually goes to rest.

## Works Cited

[^simpson]: Edward H. Simpson, ["The Interpretation of Interaction in Contingency Tables"](https://math.bme.hu/~marib/bsmeur/simpson.pdf), *Journal of the Royal Statistical Society, Series B*, 1951. DOI page: [Wiley](https://rss.onlinelibrary.wiley.com/doi/abs/10.1111/j.2517-6161.1951.tb00088.x).

[^blyth]: Colin R. Blyth, ["On Simpson's Paradox and the Sure-Thing Principle"](https://www.tandfonline.com/doi/abs/10.1080/01621459.1972.10482387), *Journal of the American Statistical Association*, 1972.

[^bickel]: Peter J. Bickel, Eugene A. Hammel, and J. W. O'Connell, ["Sex Bias in Graduate Admissions: Data from Berkeley"](https://homepage.stat.uiowa.edu/~mbognar/1030/Bickel-Berkeley.pdf), *Science*, 1975. DOI: [10.1126/science.187.4175.398](https://doi.org/10.1126/science.187.4175.398).

[^pearl]: Judea Pearl, ["Understanding Simpson's Paradox"](https://ftp.cs.ucla.edu/pub/stat_ser/r414-reprint.pdf), *The American Statistician*, 2014. DOI: [10.1080/00031305.2014.876829](https://doi.org/10.1080/00031305.2014.876829).

[^greenland]: Sander Greenland, James M. Robins, and Judea Pearl, ["Confounding and Collapsibility in Causal Inference"](https://projecteuclid.org/journals/statistical-science/volume-14/issue-1/Confounding-and-Collapsibility-in-Causal-Inference/10.1214/ss/1009211805.full), *Statistical Science*, 1999. PDF mirror: [UBC](https://www.stat.ubc.ca/~rollin/papers/GreenlandStatSci1999).
