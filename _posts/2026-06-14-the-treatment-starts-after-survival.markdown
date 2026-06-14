---
layout: post
title: "Immortal Time Bias Starts Before Treatment"
description: "Immortal time bias is a time-zero bug in causal survival analysis. A treatment can look protective because the treated group had to survive long enough to receive it."
date: 2026-06-14 14:22:00 -0400
categories: statistics
tags: [causal-inference, survival-analysis, immortal-time-bias, target-trial-emulation, time-varying-treatment]
excerpt: "A feature, drug, or strategy cannot help you before it starts. If the analysis gives treated credit for pre-treatment survival, the denominator has learned a magic trick."
---

A treatment cannot save you before it starts.

That sentence is so obvious that it sounds useless. But a large class of
observational survival analyses violates it. The violation is quiet. It happens
in the denominator.

Call someone "treated" if they ever receive a drug, adopt a feature, enter a
program, or switch to a new execution strategy during follow-up. Then compare
their survival from day zero with people who never receive it. The treated
group will often look better, even when the treatment has no effect at all,
because each treated person had to survive long enough to become treated.

That pre-treatment span is called immortal time: by construction, the outcome
could not have occurred during that span for people who end up classified as
treated.[^suissa] If it had occurred, they would not have become treated.

The bug is not "survival analysis is hard." The bug is that treatment status
was learned after time zero and then projected backward to time zero.

## The Denominator Learned the Future

Suppose follow-up starts at \(t=0\). Person \(i\) has an event time \(Y_i\), a
censoring time \(C_i\), and a treatment start time \(T_i\). A naive analysis
defines

$$
A_i^{\mathrm{ever}}
=
\mathbf{1}\{T_i < \min(Y_i, C_i)\}.
$$

This is already suspicious. The exposure label uses future information. The
person is called "treated" at baseline because a later treatment start was
observed.

If that person is followed for \(Y_i\) months and treatment starts at \(T_i\),
the naive treated denominator contains

$$
\underbrace{T_i}_{\text{pre-treatment, no event possible for future treated}}
+
\underbrace{(Y_i - T_i)}_{\text{actual treated follow-up}}.
$$

The first term is not treated time. It is untreated survival time that has been
credited to the treated group. Worse, it is event-free by definition among
people who become treated. That denominator has stolen a clean stretch of
survival from the past and used it to lower the treated event rate.

The corrected time-dependent exposure is

$$
A_i(t)=\mathbf{1}\{t \ge T_i\}.
$$

Before \(T_i\), the person contributes untreated time. After \(T_i\), the
person contributes treated time. That does not solve every causal problem:
confounding, treatment selection, censoring, adherence, and competing events
still matter. But it fixes this accounting error.

The error has a famous medical name, but the pattern is much broader:

```text
"users who adopted the feature" survived until adoption
"orders that used smart routing" survived until routing was triggered
"accounts that upgraded" survived until upgrade
"players who joined the guild" survived until joining
```

If the group label is assigned by a future milestone, the analysis has a
time-zero problem.

## A Small Accounting Lab

The lab below simulates a cohort with a known truth. The default treatment has
**no causal effect**: the true hazard ratio is 1.00. Some subjects start
treatment later, some have an event before they ever get there, and everyone is
administratively censored at the end of follow-up.

Three estimates are shown:

1. **Naive ever-treated rate ratio:** classify people by whether they ever
   start treatment, then count all follow-up from time zero in that group.
2. **Time-dependent rate ratio:** split each person's follow-up into untreated
   time before treatment and treated time after treatment.
3. **Landmark rate ratio:** pick a month, keep only people still event-free at
   that month, classify treatment status by then, and analyze from that point
   onward.

<div class="immortal-time-lab" data-immortal-time-lab>
  <div class="immortal-time-lab__controls">
    <label>
      Cohort size: <output data-value="cohort">4000</output>
      <input type="range" min="600" max="5000" step="200" value="4000" data-param="cohort">
    </label>
    <label>
      Follow-up: <output data-value="followup">36 mo</output>
      <input type="range" min="12" max="72" step="3" value="36" data-param="followup">
    </label>
    <label>
      Monthly event hazard: <output data-value="eventHazard">4%</output>
      <input type="range" min="1" max="12" step="1" value="4" data-param="eventHazard">
    </label>
    <label>
      True treatment HR: <output data-value="treatmentHr">100%</output>
      <input type="range" min="45" max="180" step="5" value="100" data-param="treatmentHr">
    </label>
    <label>
      Ever-start share: <output data-value="adoptionShare">65%</output>
      <input type="range" min="15" max="90" step="5" value="65" data-param="adoptionShare">
    </label>
    <label>
      Median start delay: <output data-value="medianStart">12 mo</output>
      <input type="range" min="2" max="34" step="1" value="12" data-param="medianStart">
    </label>
    <label>
      Risk heterogeneity: <output data-value="riskSpread">0%</output>
      <input type="range" min="0" max="100" step="5" value="0" data-param="riskSpread">
    </label>
    <label>
      Timing selection: <output data-value="selection">0%</output>
      <input type="range" min="-100" max="100" step="10" value="0" data-param="selection">
    </label>
    <label>
      Landmark month: <output data-value="landmark">12 mo</output>
      <input type="range" min="3" max="33" step="1" value="12" data-param="landmark">
    </label>
  </div>
  <div class="immortal-time-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="660" aria-label="Immortal time bias simulator showing naive survival, corrected time-dependent rate ratios, person-time ledger, and delay sensitivity"></canvas>
  <div class="immortal-time-lab__legend">
    <span><i style="background:#be123c"></i> Naive ever-treated</span>
    <span><i style="background:#0f766e"></i> Time-dependent</span>
    <span><i style="background:#2563eb"></i> Landmark</span>
    <span><i style="background:#b45309"></i> Immortal time</span>
    <span><i style="background:#7c3aed"></i> Actual treated time</span>
  </div>
  <p class="immortal-time-lab__note">
    Deterministic synthetic cohort. The default has no treatment effect and no
    baseline risk heterogeneity, so the time-dependent estimate should hover
    near the true hazard ratio while the naive ever-treated analysis invents a
    benefit from future information.
  </p>
</div>
<script defer src="{{ '/assets/js/immortal-time-lab.js?v=20260614a' | relative_url }}"></script>

Start at the default. The true hazard ratio is 1.00. The time-dependent rate
ratio is close to 1.00. The naive ever-treated rate ratio is much lower, around
0.5 in this deterministic run. Nothing causal happened; the naive analysis
gave the treated group credit for event-free time before treatment started.

The person-time ledger is the main exhibit. The naive treated denominator is
split into two colors. One part is actual treated time. The other part is
immortal pre-treatment time. That orange piece has no treated events because,
for future-treated people, an event before treatment would have moved them out
of the future-treated group.

Now raise **Median start delay**. The longer people must wait to become
treated, the more event-free pre-treatment time can be misclassified. Suissa's
review makes the same point analytically: the magnitude of the rate-ratio bias
increases with the duration of immortal time, and can depend on the shape of
the outcome hazard.[^suissa]

Next set **True treatment HR** to 130%. The treatment is now harmful. The naive
analysis may still make it look protective or nearly neutral because the
immortal denominator is pushing in the opposite direction. This is the dangerous
case: a bad strategy can look good because it starts late.

Finally raise **Risk heterogeneity** and move **Timing selection**. If high-risk
subjects start earlier or later, the time-dependent accounting fix is no longer
the whole causal solution. You have removed the immortal-time misclassification,
but you still need a design and adjustment strategy for confounding by treatment
timing. This is why the right answer is not "always run a time-dependent Cox
model." The right answer is "specify the trial you wish you had run."

The source is here:
[`assets/js/immortal-time-lab.js`]({{ '/assets/js/immortal-time-lab.js' | relative_url }}).

## The Statin Example Is a Warning Label

Lévesque, Hanley, Kezouh, and Suissa's BMJ paper is the canonical short
case-file.[^levesque] They revisited an observational study of statins and
diabetes progression. In the time-fixed analysis, people classified as statin
users carried all their follow-up time in the statin-user group, including the
time before they actually satisfied the exposure definition. In their
time-dependent analysis, person-days were untreated until the definition was
met and treated thereafter.

The result flipped the story. The time-fixed Cox analysis produced an adjusted
hazard ratio of 0.74, suggestive of benefit. The time-dependent analysis
produced 1.97. In the Poisson accounting table, immortal and untreated periods
were about two thirds of the follow-up allocated to statin users in the biased
analysis. The authors also ran the same design with drug classes that should
not plausibly prevent diabetes progression; the apparent protective
associations disappeared after correcting the immortal time.

That is what makes the bias unsettling. It can manufacture biological-looking
effects from administrative timing.

## Why Landmarking Helps, But Changes the Question

A landmark analysis chooses a time \(L\), keeps only those still event-free at
\(L\), classifies exposure status using information available up to \(L\), and
then analyzes outcomes after \(L\). It is often simple and visually convenient:
after the landmark, treatment status can be treated as fixed for that
landmark-defined population.

But it answers a conditional question:

```text
among people who survived event-free until L,
what is the association of treatment status by L with later outcome?
```

That may be exactly the desired question. Or it may be a compromise. A late
landmark throws away early events. An early landmark may leave too few treated
subjects. Simulation work comparing guarantee-time-bias remedies generally
finds that time-dependent models and landmark analyses can both help, but the
landmark's performance depends on the chosen landmark and the scientific
question.[^cho]

The lab's landmark estimate moves around for the same reason. It is not a
universal correction; it is a new estimand.

## Target Trial First, Model Second

Hernán and Robins describe observational causal analyses as attempts to emulate
a target trial: the randomized experiment we would have run if it were
available.[^hernanrobins] For immortal time, the target-trial habit is
especially useful because it forces a synchronization:

```text
eligibility
treatment assignment
start of follow-up
```

If those three clocks do not align, the analysis is already in trouble.

Hernán, Sauer, Hernández-Díaz, Platt, and Shrier make this point directly in
their paper on target-trial specification: immortal time and related
"self-inflicted injuries" arise when follow-up, eligibility, and treatment
assignment are not aligned.[^hernansauer] A newer structural description by
Hernán and coauthors sharpens the language further: the phrase "immortal time
bias" can make it sound as if the immortal interval itself is the cause, but
the underlying source is usually selection or misclassification based on
post-baseline information.[^structural]

That distinction is worth keeping. The time interval is the symptom. The
future-dependent rule is the disease.

## A Production Checklist

Before trusting a survival comparison involving adoption, treatment,
activation, upgrade, routing, escalation, or any other post-baseline milestone,
I would ask:

- What is time zero?
- Could every group member have been assigned to their strategy at time zero?
- Was treatment status defined using information after time zero?
- Are pre-treatment person-days counted as treated?
- Are treated and untreated follow-up starts aligned?
- If there is a grace period, is it part of the strategy definition?
- Are people cloned/censored/weighted, landmarked, or modeled with
  time-dependent exposure for a reason tied to the target trial?
- What events were lost before someone could become treated?
- What estimand does the analysis actually answer?

This checklist applies outside medicine. Product analytics has the same trap
when "users who adopted feature X" are compared with "users who never adopted
feature X" from account creation. Quant research has the same trap when a
strategy is credited for surviving until a trigger fires. Gaming telemetry has
the same trap when guild membership, ranked placement, or tutorial completion
is treated as a baseline attribute.

The future is allowed to explain the future. It is not allowed to relabel the
past.

## A Thread Worth Pulling

The interesting engineering problem is not only estimating one time-dependent
effect. It is building analysis systems that make the impossible denominator
hard to write.

A survival analytics layer should know whether a covariate is baseline,
time-varying, delayed, or defined by future behavior. It should require an
explicit time-zero contract before producing a Kaplan-Meier curve, hazard
ratio, retention lift, or product adoption comparison. It should display the
person-time ledger by default:

```text
untreated time
actual treated time
immortal or grace-period time
censored time
event counts by exposure state
```

The statistical lesson is old. The systems lesson is still underbuilt. Most
bad analyses are not written by people trying to cheat. They are written by
people whose tools make the future label look like an ordinary column.

[^suissa]: Samy Suissa, ["Immortal Time Bias in Pharmacoepidemiology"](https://academic.oup.com/aje/article/167/4/492/233064), *American Journal of Epidemiology*, 2008.

[^levesque]: Linda E. Lévesque, James A. Hanley, Abbas Kezouh, and Samy Suissa, ["Problem of immortal time bias in cohort studies: example using statins for preventing progression of diabetes"](https://doi.org/10.1136/bmj.b5087), *BMJ*, 2010.

[^cho]: In Sung Cho and coauthors, ["Statistical methods for elimination of guarantee-time bias in cohort studies: a simulation study"](https://link.springer.com/article/10.1186/s12874-017-0405-6), *BMC Medical Research Methodology*, 2017.

[^hernanrobins]: Miguel A. Hernán and James M. Robins, ["Using Big Data to Emulate a Target Trial When a Randomized Trial Is Not Available"](https://academic.oup.com/aje/article/183/8/758/1739860), *American Journal of Epidemiology*, 2016.

[^hernansauer]: Miguel A. Hernán, Brian C. Sauer, Sonia Hernández-Díaz, Robert W. Platt, and Ian Shrier, ["Specifying a target trial prevents immortal time bias and other self-inflicted injuries in observational analyses"](https://www.jclinepi.com/article/S0895-4356%2816%2930136-6/abstract), *Journal of Clinical Epidemiology*, 2016.

[^structural]: Miguel A. Hernán, Jonathan A. C. Sterne, Julian P. T. Higgins, Ian Shrier, and Sonia Hernández-Díaz, ["A structural description of biases that generate immortal time"](https://pmc.ncbi.nlm.nih.gov/articles/PMC11598638/), *Epidemiology*, 2025; advance online 2024.
