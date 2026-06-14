---
layout: post
title: "Reliability Diagrams Need Rulers"
description: "Probability calibration is not accuracy with decimals. Reliability diagrams, ECE, and Brier decompositions are measurement instruments, and each has a resolution limit."
date: 2026-06-13 18:18:00 -0400
categories: machine-learning
tags: [calibration, reliability-diagram, expected-calibration-error, brier-score, evaluation, uncertainty]
excerpt: "A probability forecast is a promise about long-run frequencies. The hard part is that every diagnostic of that promise has its own binning, sampling, and subgroup choices."
---

A probability is not a mood.

When a model says 0.8, it is making a frequency claim:

```text
among cases like this, the event should happen about 80 percent of the time
```

That claim is different from being accurate. It is different from ranking
examples correctly. It is different from having a high AUC. A model can sort
cases well while systematically overpricing every probability. Another model can
be calibrated by always predicting the base rate and still be useless for
ranking.

Calibration is the discipline of asking whether the numbers mean what they say.

The catch is that calibration is not directly observed. We never get infinitely
many copies of exactly the same 0.73 forecast under exactly the same conditions.
We group forecasts into bins, smooth them, score them, slice them by subgroup,
and hope the diagnostic we drew is close to the property we care about.

The reliability diagram has a bin width. That small fact is where many confident
calibration claims start to wobble.

## The Promise

For a binary event $$Y\in\{0,1\}$$ and a forecast $$P\in[0,1]$$, perfect
calibration means:

$$
E[Y \mid P=p] = p.
$$

Equivalently:

```text
among all cases assigned probability p,
the empirical event rate should be p
```

Dawid's "well-calibrated Bayesian" paper made calibration a central property of
sequential probability forecasts, while also showing that coherence and
calibration have a subtle relationship.[^dawid] Forecast verification had
already been using this idea for weather probabilities: if you say 30 percent
rain often enough, roughly 30 percent of those days should rain.

In machine learning, the same question shows up whenever a probability becomes
an action: triage, lending, fraud review, recommender throttles, medical
screening, abstention, tool-use gates, human handoff, or position sizing.

If 0.8 means "pretty high" rather than "80 percent," downstream systems will
eventually charge interest.

## A Calibration Lab

The lab below simulates a binary classifier. There is a true latent probability,
a model score, a calibration split used to fit one temperature parameter, and an
evaluation split used for diagnostics.

The raw model is intentionally overconfident by default. Temperature scaling
divides logits by a fitted scalar $$T$$:

$$
\tilde p
=
\sigma\left(\frac{z}{T}\right).
$$

For an overconfident model, the fitted $$T$$ is usually greater than one. This
softens probabilities without changing the score ordering.

Try four moves:

1. raise **Confidence scale** and watch the red reliability curve bend away from
   the diagonal;
2. change **Reliability bins** and watch ECE move even though the data did not;
3. raise **Group skew** and notice that a tolerable global curve can hide
   subgroup damage;
4. change **Decision threshold** and remember that calibrated probabilities are
   inputs to decisions, not decisions by themselves.

<div id="calibration-lab" class="calibration-lab" data-calibration-lab>
  <div class="calibration-lab__controls">
    <label>
      Cases: <output data-value="cases">5,200</output>
      <input type="range" min="1200" max="9000" step="200" value="5200" data-param="cases">
    </label>
    <label>
      Calibration rows: <output data-value="calibration">1,200</output>
      <input type="range" min="200" max="3000" step="100" value="1200" data-param="calibration">
    </label>
    <label>
      Signal spread: <output data-value="signal">1.250</output>
      <input type="range" min="0.30" max="2.60" step="0.05" value="1.25" data-param="signal">
    </label>
    <label>
      Confidence scale: <output data-value="confidence">1.750</output>
      <input type="range" min="0.40" max="3.00" step="0.05" value="1.75" data-param="confidence">
    </label>
    <label>
      Global logit bias: <output data-value="bias">0.200</output>
      <input type="range" min="-1.20" max="1.20" step="0.05" value="0.20" data-param="bias">
    </label>
    <label>
      Group skew: <output data-value="groupSkew">0.350</output>
      <input type="range" min="-1.20" max="1.20" step="0.05" value="0.35" data-param="groupSkew">
    </label>
    <label>
      Score noise: <output data-value="scoreNoise">0.200</output>
      <input type="range" min="0" max="1.20" step="0.05" value="0.20" data-param="scoreNoise">
    </label>
    <label>
      Reliability bins: <output data-value="bins">12</output>
      <input type="range" min="4" max="40" step="2" value="12" data-param="bins">
    </label>
    <label>
      Decision threshold: <output data-value="threshold">50.0%</output>
      <input type="range" min="0.05" max="0.95" step="0.05" value="0.50" data-param="threshold">
    </label>
  </div>
  <div class="calibration-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Calibration simulator showing reliability diagram, ECE sensitivity to bin count, Brier decomposition, subgroup calibration, and threshold selection"></canvas>
  <div class="calibration-lab__legend">
    <span><i style="background:#be123c"></i> Raw model</span>
    <span><i style="background:#0f766e"></i> Temperature scaled</span>
    <span><i style="background:#172026"></i> Perfect reliability</span>
    <span><i style="background:#2563eb"></i> Group A</span>
    <span><i style="background:#d97706"></i> Group B</span>
    <span><i style="background:#7c3aed"></i> Threshold / bins</span>
  </div>
  <p class="calibration-lab__note">
    Deterministic synthetic experiment. A temperature is fitted on the
    calibration split by minimizing log loss, then reliability, ECE, Brier score,
    and subgroup diagnostics are computed on the evaluation split. The displayed
    Brier decomposition uses equal-width bins, so the residual term is a warning
    about binning error rather than a new law of nature.
  </p>
</div>
<script defer src="{{ '/assets/js/calibration-lab.js?v=20260613a' | relative_url }}"></script>

In the default run, the raw model is a familiar neural-network caricature:
mostly right about ranking, too confident about magnitude. The red curve bends
away from the diagonal. Temperature scaling, fitted on held-out calibration
rows, softens logits and pulls the green curve closer to the diagonal.

Guo, Pleiss, Sun, and Weinberger documented this pattern in modern neural
networks and found that temperature scaling is a surprisingly strong
post-processing baseline across several architectures and datasets.[^guo]

The word "baseline" matters. Temperature scaling can fix a global confidence
scale. It cannot repair every local pathology. If a subgroup is overpredicted
and another is underpredicted, one global temperature may make the average plot
look calmer while the local plots remain sick.

## ECE Is an Estimate, Not a Property

Expected calibration error is often written as:

$$
\mathrm{ECE}
=
\sum_{b=1}^B
\frac{n_b}{n}
\left|
\operatorname{acc}(b)-\operatorname{conf}(b)
\right|.
$$

For each bin $$b$$, $$\operatorname{conf}(b)$$ is the average predicted
probability and $$\operatorname{acc}(b)$$ is the observed event rate. The formula
is useful because it compresses a reliability diagram into one number.

It is also an estimate with knobs:

- how many bins;
- equal-width or equal-frequency bins;
- whether empty bins count;
- whether labels are scarce in the tails;
- whether subgroups are pooled;
- whether the same sample was used for fitting and evaluation.

Move **Reliability bins**. The underlying forecasts do not change. The ECE does.
That does not make ECE useless. It makes it a measurement with a resolution
limit.

Naeini, Cooper, and Hauskrecht proposed Bayesian binning into quantiles partly
because calibration by naive binning can be unstable and sensitive to bin
choice.[^naeini] More recent work on reliability diagrams makes the same
practical point: the diagram is a statistical estimator, not a photograph of a
population truth.[^metrics-calibration]

The right habit is to show the curve, the histogram or point sizes, the sample
size, the binning scheme, and subgroup slices. A single ECE number without those
details is a screenshot of a ruler with the tick marks cropped out.

## The Brier Score Knows More Than Calibration

Brier's original probability score is the mean squared error of probability
forecasts:[^brier]

$$
\mathrm{Brier}
=
\frac{1}{n}
\sum_i (p_i-y_i)^2.
$$

It is a proper scoring rule for binary probabilities: truthful probabilities
minimize expected score. But it is not only a calibration metric. Murphy's
decomposition separates the Brier score into uncertainty, reliability, and
resolution terms:[^murphy]

$$
\mathrm{Brier}
=
\mathrm{reliability}
-
\mathrm{resolution}
+
\mathrm{uncertainty}.
$$

Reliability penalizes probabilities that do not match observed frequencies.
Resolution rewards forecasts that separate cases into bins with different event
rates. Uncertainty is the irreducible base-rate term.

This matters because a model can improve calibration while losing useful
resolution. A forecaster that always predicts the base rate can be calibrated
and still dull. Gneiting and Raftery's review of proper scoring rules emphasizes
the old forecast-verification distinction: calibration is necessary, but
sharpness or refinement is also part of useful probabilistic forecasting.[^gneiting]

In the lab's Brier panel, the green temperature-scaled forecast usually improves
both reliability and total Brier score under the default overconfidence setting.
But do not promote this into a universal theorem. A calibration method is a
post-processing model. It can overfit, underfit, or improve the wrong slice.

## Global Calibration Can Be a Mask

The subgroup panel is there because global calibration can average away local
harm.

Suppose group A is underpredicted and group B is overpredicted. If the groups
appear in the right proportions, the global reliability curve may look
acceptable. The model is not calibrated for either group; it is calibrated for a
mixture.

That distinction matters whenever decisions are made on individuals or
subpopulations. A global statement like:

```text
our 80 percent scores happen 80 percent of the time
```

does not imply:

```text
our 80 percent scores mean the same thing for every slice that matters
```

This is the same reason calibration monitoring should be sliced by deployment
regime, language, device, geography, market condition, data source, label delay,
and any subgroup where error has asymmetric cost.

## Calibration Is Not the Decision Rule

A calibrated probability still needs a utility function.

If false negatives cost three times as much as false positives, the optimal
threshold is not necessarily 0.5. If review capacity is fixed, the rule might be
"send the top 2 percent to humans." If abstention is allowed, the rule might
depend on the value of information. If the forecast enters a Kelly sizing rule,
small probability errors can become large leverage errors.

Calibration makes probabilities usable. It does not decide what use is wise.

This is why I like to separate four layers:

```text
score ranking
probability calibration
decision threshold or policy
outcome monitoring
```

Mixing them creates confusion. Accuracy can improve while calibration worsens.
Calibration can improve while utility falls under a bad threshold. Utility can
look good in aggregate while a subgroup is systematically mispriced.

## A Run Sheet for Calibration Claims

Before I trust a probability-calibration report, I want to know:

- whether calibration was fit on data separate from evaluation;
- which scoring rules were reported, not only ECE;
- the binning scheme and bin count used for reliability diagrams;
- whether point sizes or confidence intervals were shown;
- whether ECE is stable across plausible bin counts;
- whether Brier reliability, resolution, and uncertainty were inspected;
- whether subgroups and deployment regimes were sliced separately;
- whether calibration was monitored after distribution shift;
- whether the decision threshold was chosen from a cost model;
- whether the model is calibrated where the action boundary actually lies.

The reliability diagram is one of the most useful plots in machine learning
evaluation. It is also easy to overread. It estimates a conditional frequency
function from finite data using bins that you chose.

That does not make it weak. It makes it honest. A probability forecast is a
contract with future frequencies, and every contract needs an audit trail:
sample size, slices, scores, bin widths, and the downstream decisions that will
spend the numbers.

## Primary Sources

[^dawid]: A. Philip Dawid, ["The Well-Calibrated Bayesian"](https://doi.org/10.1080/01621459.1982.10477856), *Journal of the American Statistical Association*, 1982.

[^guo]: Chuan Guo, Geoff Pleiss, Yu Sun, and Kilian Q. Weinberger, ["On Calibration of Modern Neural Networks"](https://proceedings.mlr.press/v70/guo17a.html), *Proceedings of Machine Learning Research*, 2017.

[^naeini]: Mahdi Pakdaman Naeini, Gregory Cooper, and Milos Hauskrecht, ["Obtaining Well Calibrated Probabilities Using Bayesian Binning"](https://doi.org/10.1609/aaai.v29i1.9602), *AAAI*, 2015.

[^metrics-calibration]: Mikhail Popoviciu, Michael P. Kim, and S. Matthew Weinberg, ["Metrics of Calibration for Probabilistic Predictions"](https://www.jmlr.org/papers/v23/22-0658.html), *Journal of Machine Learning Research*, 2022.

[^brier]: Glenn W. Brier, ["Verification of Forecasts Expressed in Terms of Probability"](https://journals.ametsoc.org/view/journals/mwre/78/1/1520-0493_1950_078_0001_vofeit_2_0_co_2.xml), *Monthly Weather Review*, 1950.

[^murphy]: Allan H. Murphy, ["A New Vector Partition of the Probability Score"](https://doi.org/10.1175/1520-0450(1973)012%3C0595:ANVPOT%3E2.0.CO;2), *Journal of Applied Meteorology*, 1973.

[^gneiting]: Tilmann Gneiting and Adrian E. Raftery, ["Strictly Proper Scoring Rules, Prediction, and Estimation"](https://doi.org/10.1198/016214506000001437), *Journal of the American Statistical Association*, 2007.
