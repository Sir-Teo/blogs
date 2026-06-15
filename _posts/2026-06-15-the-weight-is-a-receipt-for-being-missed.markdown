---
layout: post
title: "The Weight Is a Receipt for Being Missed"
description: "Horvitz-Thompson weighting turns unequal sampling chances into a finite-population estimator, but the variance bill arrives in the weights."
date: 2026-06-15 11:30:00 -0400
categories: statistics
tags: [survey-sampling, horvitz-thompson, inverse-probability-weighting, design-effect, finite-population, causal-inference]
excerpt: "A sample is not self-explanatory. If some units had a smaller chance to be observed, their weights are not decoration. They are receipts for the population mass that came with them."
---

A row in a dataset often arrives with a number attached:

```text
weight = 37.2
```

It is tempting to treat that number as administrative clutter. Maybe the data
warehouse needed it. Maybe the survey vendor needed it. Maybe the causal
pipeline needed it. The analyst just wants the average.

But a weight is not decoration. In the cleanest finite-population story, it is a
receipt for being hard to observe.

If unit $$i$$ had inclusion probability $$\pi_i$$, then a sampled unit represents
roughly $$1/\pi_i$$ units like itself. A person sampled with probability `0.20`
carries a weight of `5`; a person sampled with probability `0.02` carries a
weight of `50`.

That is not a moral statement about importance. It is accounting.

## The Average Is a Design Claim

Suppose there is a finite population of $$N$$ units with outcomes
$$y_1,\ldots,y_N$$. The target is the population mean:

$$
\bar y
=
\frac{1}{N}
\sum_{i=1}^N y_i.
$$

If every unit has the same chance to appear, the plain sample mean has a good
claim to represent the population. If high-income users, active accounts, urban
households, liquid stocks, or logged-in customers are more likely to appear,
the plain mean estimates the observed design, not the population.

Horvitz and Thompson's 1952 estimator fixes the accounting by dividing each
observed outcome by its inclusion probability.[^ht] For the population mean:

$$
\widehat{\bar y}_{HT}
=
\frac{1}{N}
\sum_{i \in s}
\frac{y_i}{\pi_i}.
$$

Under the sampling design, each term has the right expectation because
$$E[I_i/\pi_i] = 1$$. The unit either appears or does not, but in expectation it
contributes its full finite-population value.

That is the whole trick. It is also the whole danger.

Small $$\pi_i$$ creates large weights. Large weights create variance.

## A Lab With an Unfair Sample

The simulator below builds a finite population. The horizontal coordinate is a
latent covariate; the outcome increases with it. The sampling design oversamples
the high-covariate end, so the unweighted sample mean is too high by default.

Each repeated sample is a Poisson design with known inclusion probabilities, so
the realized sample size wanders around the target instead of being forced to
equal it. The lab compares four estimates:

- **Naive mean**: average only the sampled outcomes.
- **Horvitz-Thompson**: sum $$y_i/\pi_i$$ and divide by known $$N$$.
- **Hajek ratio**: normalize the inverse-probability weights by their sampled
  total.
- **Clipped ratio**: cap large weights before normalizing.

Default audited facts:

- true finite-population mean: about `35.12`;
- expected sample size: `260`;
- naive bias: about `+9.68`;
- Horvitz-Thompson bias: about `+0.01` in `700` repeated samples;
- average effective sample size: about `105`, far below the raw sample count;
- clipping lowers the weight tail but buys that stability with bias.

<style>
  .survey-lab {
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

  .survey-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  }

  .survey-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .survey-lab__controls input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .survey-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0;
  }

  .survey-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .survey-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .survey-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.18;
    overflow-wrap: anywhere;
  }

  .survey-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .survey-lab__legend,
  .survey-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .survey-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .survey-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    margin-right: 0.35rem;
    vertical-align: -0.06rem;
    width: 0.7rem;
  }

  .survey-lab__note {
    margin: 0.8rem 0 0;
  }
</style>

<div class="survey-lab" data-survey-weight-lab>
  <div class="survey-lab__controls">
    <label>
      Population <output data-value="population">1800</output>
      <input type="range" data-param="population" min="600" max="5000" step="100" value="1800">
    </label>
    <label>
      Expected sample <output data-value="expectedSample">260</output>
      <input type="range" data-param="expectedSample" min="80" max="900" step="20" value="260">
    </label>
    <label>
      Selection tilt <output data-value="tilt">1.80</output>
      <input type="range" data-param="tilt" min="-250" max="250" step="5" value="180">
    </label>
    <label>
      Outcome slope <output data-value="outcomeSlope">1.65</output>
      <input type="range" data-param="outcomeSlope" min="-150" max="300" step="5" value="165">
    </label>
    <label>
      Weight cap <output data-value="cap">18</output>
      <input type="range" data-param="cap" min="4" max="80" step="1" value="18">
    </label>
    <label>
      Repeated samples <output data-value="trials">700</output>
      <input type="range" data-param="trials" min="120" max="2000" step="20" value="700">
    </label>
    <label>
      Seed <output data-value="seed">47</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="47">
    </label>
  </div>
  <div class="survey-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Survey weighting simulator comparing naive, Horvitz-Thompson, Hajek, and clipped-weight estimators"></canvas>
  <div class="survey-lab__legend">
    <span><i style="background:#be123c"></i> Naive mean</span>
    <span><i style="background:#2563eb"></i> Horvitz-Thompson</span>
    <span><i style="background:#0f766e"></i> Hajek ratio</span>
    <span><i style="background:#7c3aed"></i> Clipped ratio</span>
    <span><i style="background:#d97706"></i> Inclusion probability / weight cap</span>
  </div>
  <p class="survey-lab__note">
    Deterministic finite-population simulation. The audit checks equal-probability
    behavior, positive and negative selection bias, finite estimates, and
    effective sample size loss under unequal weights.
  </p>
</div>
<script defer src="{{ '/assets/js/survey-weight-lab.js?v=20260615a' | relative_url }}"></script>

Move **Selection tilt** to zero. The sampling probabilities flatten, the naive
mean stops being systematically wrong, and the effective sample size climbs
toward the raw sample size.

Raise **Selection tilt** while the outcome slope is positive. The sample
overrepresents high-outcome units. The naive estimator becomes very stable and
very wrong. That is the seductive failure: low variance around the wrong target.

Lower **Weight cap**. The clipped estimator tightens because the largest weights
cannot dominate. It also drifts toward the biased naive estimate. Clipping is
not a free lunch. It is a bias-variance decision with a business owner.

## Why the Ratio Often Looks Better

The Horvitz-Thompson mean divides by known population size $$N$$. The Hajek ratio
estimator divides by the estimated population size implied by the sampled
weights:

$$
\widehat{\bar y}_{Hajek}
=
\frac{\sum_{i \in s} y_i/\pi_i}
{\sum_{i \in s} 1/\pi_i}.
$$

The ratio form is not exactly design-unbiased in finite samples. But for means
it often has smaller variance, especially when the realized weighted population
total bounces around. Modern survey-weighting work often lives in this tension:
keep the design information, but stabilize the estimator enough that one rare
unit does not run the whole report.[^chen-et-al]

This is also where effective sample size earns its keep. Kish-style unequal
weighting diagnostics summarize how much precision was lost to weight
dispersion:

$$
n_{\text{eff}}
=
\frac{\left(\sum_{i \in s} w_i\right)^2}{\sum_{i \in s} w_i^2}.
$$

A sample of `260` rows can behave like far fewer independent rows if a small
number of observations carry huge weights.[^kish]

The diagnostic is not a verdict. Sometimes those weights are the only honest
way to represent under-sampled people. And the Kish formula is only a
weight-dispersion proxy; it does not magically account for clustering, estimated
weights, or a sharp relationship between the weights and the outcome. But it
tells you when the estimator is being powered by a narrow part of the data.

## The Causal Echo

Survey inclusion probabilities and causal propensities are not the same object,
but they rhyme. In a survey, $$\pi_i$$ is the chance the unit enters the sample.
In an observational causal study, the propensity score is the chance of
treatment given observed covariates.[^rosenbaum-rubin] In both cases,
inverse-probability weighting tries to reconstruct a target population from a
biased observed process.

The same warnings travel with it:

- If the probabilities are wrong, the weights faithfully correct the wrong
  design.
- If some probabilities are tiny, variance can dominate.
- If a group has probability zero, no amount of weighting can recover it.
- If you clip weights, you should report the target you changed.

Weights are not a ritual for making bias disappear. They are a compact statement
of the sampling story you are willing to defend.

## The Practical Lesson

Before averaging rows, ask:

- Who had a smaller chance to be in this table?
- Are the inclusion probabilities known, estimated, or guessed?
- Are large weights attached to high-leverage outcomes?
- What is the effective sample size after weighting?
- Is clipping a statistical choice, an operational necessity, or a hidden
  target change?

The naive mean answers a question. It may simply be the wrong question.

The weight tells you which population the row is speaking for.

Ignore that receipt, and the sample starts speaking only for itself.

[^ht]: D. G. Horvitz and D. J. Thompson, ["A Generalization of Sampling Without Replacement From a Finite Universe"](https://www.stat.cmu.edu/~brian/905-2008/papers/Horvitz-Thompson-1952-jasa.pdf), Journal of the American Statistical Association, 1952. [JSTOR record](https://www.jstor.org/stable/2280784).

[^chen-et-al]: Qixuan Chen, Michael R. Elliott, David Haziza, Yang Yang, Malay Ghosh, Roderick J. A. Little, Joseph Sedransk, and Mary Thompson, ["Approaches to Improving Survey-Weighted Estimates"](https://projecteuclid.org/journals/statistical-science/volume-32/issue-2/Approaches-to-Improving-Survey-Weighted-Estimates/10.1214/17-STS609.full), *Statistical Science*, 2017.

[^kish]: Leslie Kish introduced design-effect language in *Survey Sampling* (1965). For the unequal-weight effective-sample-size formula and caveats, see the PracTools note ["Design Effects and Effective Sample Size"](https://cran.r-universe.dev/articles/PracTools/Design-effects.html).

[^rosenbaum-rubin]: Paul R. Rosenbaum and Donald B. Rubin, ["The Central Role of the Propensity Score in Observational Studies for Causal Effects"](https://academic.oup.com/biomet/article/70/1/41/240879), Biometrika, 1983.
