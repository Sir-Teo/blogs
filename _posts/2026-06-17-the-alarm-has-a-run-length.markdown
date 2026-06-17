---
layout: post
title: "The Alarm Has a Run Length"
description: "CUSUM and Page-Hinkley detectors are not magic drift bells. They are stopping rules that spend false-alarm budget to buy detection delay."
date: 2026-06-17 04:12:00 -0400
categories: statistics
tags: [change-detection, cusum, page-hinkley, concept-drift, sequential-analysis, monitoring, statistics]
excerpt: "A sequential detector is a clock with a threshold. Lower it and the alarm arrives sooner after real changes; lower it too far and the no-change clock rings by itself."
---

A dashboard alarm is usually written as a binary event:

```text
drift detected
```

That sentence hides the real object. A drift detector is not a verdict. It is a
stopping rule:

```text
watch x_1, x_2, ...
stop the first time accumulated evidence crosses a boundary
```

The boundary is not a technicality. It is the price of sleep.

If the boundary is low, the detector reacts quickly when the world changes. It
also raises more false alarms when the world has not changed. If the boundary is
high, the detector becomes calmer, but real changes spend more time undetected.
Sequential detection lives in that trade: average run length to false alarm
versus detection delay.

This is why I distrust drift dashboards that report only the last alarm time.
The missing question is:

```text
How long would this detector run under no change before it cried wolf?
```

## Page's Accumulator

E. S. Page's 1954 continuous inspection scheme introduced the cumulative-sum
idea for detecting a process shift while observations arrive one at a time.[^page]
For a known pre-change density $$p_0$$ and post-change density $$p_1$$, the
natural increment is the log-likelihood ratio

$$
\ell_t = \log \frac{p_1(x_t)}{p_0(x_t)}.
$$

The one-sided CUSUM statistic is

$$
G_t = \max(0, G_{t-1} + \ell_t), \qquad G_0 = 0.
$$

The alarm time is

$$
\tau_h = \inf \{t : G_t \ge h\}.
$$

That reset to zero is the important emotional move. If recent evidence has been
against the change, the detector forgives the past and starts a fresh run. It is
looking for a suffix of the stream whose cumulative evidence is unusually large.

For a Gaussian mean increase with known variance,

$$
p_0 = N(0,\sigma^2),
\qquad
p_1 = N(\delta\sigma,\sigma^2),
$$

the log-likelihood increment is, up to the same units used in the lab,

$$
\ell_t = \delta \left(\frac{x_t}{\sigma} - \frac{\delta}{2}\right).
$$

When the mean is still zero, those increments have negative drift. When the mean
really shifts by about $$\delta\sigma$$, they acquire positive drift. The
detector is a random walk with a reflecting floor and an alarm ceiling.

Lorden later formulated quickest detection as an optimal-stopping problem and
used average run length to false alarm and worst-case detection delay as central
objects.[^lorden] Moustakides proved Page's stopping time optimal in a precise
minimax sense for detecting distribution changes.[^moustakides] The practical
lesson is smaller but sharp: a CUSUM chart is not "sensitive" or "insensitive"
in isolation. It is tuned against a false-alarm clock.

## Lab: Spend the False-Alarm Budget

The lab simulates a 240-tick stream. The default stream has a one-time upward
mean shift at tick 96. Two online detectors watch the same observations:

**CUSUM.** Uses a Gaussian mean-shift log-likelihood ratio with a target shift
you choose.

**Page-Hinkley.** Tracks cumulative deviations from the running mean with a
small slack term. It is often used as a lightweight mean-drift detector in data
streams, but its threshold still needs calibration. Hinkley's 1970 change-point
work is a useful companion because it treats inference about where a distribution
changed, not only whether an alarm should be raised online.[^hinkley]

The frontier plot sweeps thresholds over matched Monte Carlo streams. The
x-axis is the no-change false-alarm rate within the 240-tick horizon. The
y-axis is average delay after the change. Good detectors live down and left, but
no point gets there for free.

<style>
  .seq-change-lab {
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

  .seq-change-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(144px, 1fr));
    margin-bottom: 1rem;
  }

  .seq-change-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .seq-change-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.18rem;
  }

  .seq-change-lab select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.22rem;
    padding: 0.35rem 0.55rem;
    width: 100%;
  }

  .seq-change-lab input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    height: 1.3rem;
    width: 100%;
  }

  .seq-change-lab input[type="range"]::-webkit-slider-runnable-track {
    background: #d7dee5;
    border: 1px solid #c4ced8;
    border-radius: 999px;
    height: 0.34rem;
  }

  .seq-change-lab input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    background: #2563eb;
    border: 2px solid #2563eb;
    border-radius: 999px;
    height: 0.98rem;
    margin-top: -0.38rem;
    width: 0.98rem;
  }

  .seq-change-lab input[type="range"]::-moz-range-track {
    background: #d7dee5;
    border: 1px solid #c4ced8;
    border-radius: 999px;
    height: 0.34rem;
  }

  .seq-change-lab input[type="range"]::-moz-range-thumb {
    background: #2563eb;
    border: 2px solid #2563eb;
    border-radius: 999px;
    height: 0.98rem;
    width: 0.98rem;
  }

  .seq-change-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.7rem 0 1rem;
  }

  .seq-change-lab__metric {
    background: #f8fafc;
    border: 1px solid #dfe7ee;
    border-radius: 7px;
    font-family: var(--font-ui);
    min-height: 4rem;
    padding: 0.6rem 0.7rem;
  }

  .seq-change-lab__metric--good {
    box-shadow: inset 3px 0 0 rgba(15, 118, 110, 0.7);
  }

  .seq-change-lab__metric--warn {
    box-shadow: inset 3px 0 0 rgba(217, 119, 6, 0.74);
  }

  .seq-change-lab__metric--bad {
    box-shadow: inset 3px 0 0 rgba(190, 18, 60, 0.72);
  }

  .seq-change-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.71rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .seq-change-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.22rem;
    overflow-wrap: anywhere;
  }

  .seq-change-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .seq-change-lab__legend {
    color: #4b5563;
    display: flex;
    flex-wrap: wrap;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .seq-change-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .seq-change-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .seq-change-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 760px) {
    .seq-change-lab {
      padding: 0.85rem;
    }

    .seq-change-lab__metric {
      min-height: 3.55rem;
    }
  }
</style>

<div class="seq-change-lab" data-sequential-change-lab>
  <div class="seq-change-lab__controls">
    <label>
      Scenario <output data-value="scenario">abrupt mean shift</output>
      <select data-param="scenario">
        <option value="abrupt" selected>abrupt mean shift</option>
        <option value="ramp">slow drift</option>
        <option value="variance">variance burst</option>
        <option value="stationary">no change</option>
      </select>
    </label>
    <label>
      Shift size <output data-value="shift">1.10</output>
      <input type="range" min="0.25" max="2.2" step="0.05" value="1.1" data-param="shift">
    </label>
    <label>
      Noise scale <output data-value="noise">1</output>
      <input type="range" min="0.55" max="1.85" step="0.05" value="1" data-param="noise">
    </label>
    <label>
      CUSUM target <output data-value="target">1</output>
      <input type="range" min="0.35" max="2.2" step="0.05" value="1" data-param="target">
    </label>
    <label>
      PH slack <output data-value="slack">0.04</output>
      <input type="range" min="0" max="0.2" step="0.01" value="0.04" data-param="slack">
    </label>
    <label>
      Threshold <output data-value="threshold">8.0</output>
      <input type="range" min="3" max="18" step="0.5" value="8" data-param="threshold">
    </label>
    <label>
      Seed <output data-value="seed">29</output>
      <input type="range" min="1" max="9999" step="1" value="29" data-param="seed">
    </label>
  </div>

  <div class="seq-change-lab__metrics" data-role="metrics"></div>

  <canvas data-role="canvas" data-ratio="0.74" aria-label="Sequential change detection lab showing stream, CUSUM and Page-Hinkley evidence, and false alarm delay frontier"></canvas>

  <div class="seq-change-lab__legend">
    <span><i style="background:#2563eb"></i>observations</span>
    <span><i style="background:#d97706"></i>true change/mean</span>
    <span><i style="background:#0f766e"></i>CUSUM</span>
    <span><i style="background:#7c3aed"></i>Page-Hinkley</span>
  </div>
  <p class="seq-change-lab__note" data-role="note"></p>
</div>

<script src="{{ '/assets/js/sequential-change-lab.js?v=20260617a' | relative_url }}"></script>

## The Null Clock Matters

Average run length is easy to ignore because it sounds like a factory-floor
quality-control relic. It is not. It is the monitoring version of a false
positive rate.

Suppose a detector alarms 1% of the time in a 240-sample no-change simulation.
That sounds small. Now run 5,000 independent metrics, model slices, customer
segments, or symbols every hour. A "small" false-alarm probability becomes an
operations policy.

This is the same reason ordinary p-values become dangerous under peeking. A
single fixed-time test asks one question. A sequential detector asks a question
after every new observation. The threshold has to pay for that repeated chance
to stop.

The right unit is not only "did it alarm on this historical incident?" It is:

- average run length to false alarm under plausible no-change streams,
- delay distribution after known or simulated changes,
- pre-change alarm rate when the change time is known,
- miss rate within the response horizon,
- and the cost of the action triggered by the alarm.

Page-Hinkley is a good example. It is attractive because it is light: update a
running mean, accumulate deviations, compare to a threshold. It appears in
concept-drift tooling because many production problems do not give you a clean
pre-change and post-change likelihood ratio.[^gama] But the lab shows the same
law: the threshold and slack parameter determine how often stationarity looks
like a story.

## The Target Shift Is A Model

CUSUM is beautifully sharp when the post-change alternative is well chosen. That
is also its limitation.

If the detector is tuned for a one-sigma mean increase and the real shift is
half a sigma, the log-likelihood increments have weaker drift than promised.
Detection slows down. If the real event is a variance burst rather than a mean
shift, the mean-shift CUSUM is not testing the right alternative at all. It may
still alarm because a high-variance stream produces large positive excursions,
but that alarm is not evidence for the modeled mean shift.

This is where ML monitoring often gets confused. "Distribution drift" is not
one phenomenon. Gama and coauthors' concept-drift survey distinguishes changes
in the relation between inputs and targets from other changes in the data stream
and stresses that adaptation/evaluation have to be matched to the learning
problem.[^gama] A Page-Hinkley alarm on loss, a KS test on a feature, an ADWIN
window shrink, and a CUSUM on residuals are different instruments.

If you want to monitor a model, decide what has permission to move:

```text
input distribution?
label distribution?
conditional label distribution?
calibration?
loss?
latency?
market regime?
sensor noise?
```

Then give the detector a null clock for that object.

## Why This Old Tool Still Feels Modern

Sequential change detection is old enough to have beautiful theorems and
annoying vocabulary. It also keeps reappearing under new names because streaming
systems keep asking the same question:

```text
Should I keep trusting the old state?
```

A recommender watches click-through residuals. A fraud model watches chargeback
loss. A pricing system watches fill quality. A risk process watches spread
residuals. An LLM product watches refusal rate, latency, or judge score. None of
these systems wants to wait for a monthly batch report. None can afford to page
humans every time random variation looks dramatic for five minutes.

That is the small discipline CUSUM teaches:

1. Write down what evidence would accumulate under the change you care about.
2. Reset evidence when recent data argues against that change.
3. Calibrate the boundary under no change.
4. Report detection delay and false-alarm run length together.

The alarm is not the result. The stopping rule is the result.

## Implementation Notes

The browser lab is deterministic for a given seed. It exports
`SequentialChangeLab` for Node and browser checks. Its audit verifies:

```text
CUSUM recurrence equals cumulative log-likelihood minus its running minimum
raising a threshold cannot move an alarm earlier on a fixed evidence path
Page-Hinkley statistics stay nonnegative by construction
a high threshold does not alarm on a fixed stationary stream
Monte Carlo false-alarm and detection rates stay in probability bounds
```

The simulation is intentionally small, not a production calibration engine. A
real detector needs longer null runs, dependence-aware simulations, multiple
testing control across monitored slices, reset policy, and an action policy for
what happens after the alarm.

[^page]: E. S. Page, ["Continuous Inspection Schemes"](https://doi.org/10.1093/biomet/41.1-2.100), *Biometrika* 41(1-2):100-115, 1954.

[^lorden]: Gary Lorden, ["Procedures for reacting to a change in distribution"](https://authors.library.caltech.edu/records/n9ryc-0sr08), *Annals of Mathematical Statistics* 42(6):1897-1908, 1971.

[^moustakides]: George V. Moustakides, ["Optimal Stopping Times for Detecting Changes in Distributions"](https://projecteuclid.org/journals/annals-of-statistics/volume-14/issue-4/Optimal-Stopping-Times-for-Detecting-Changes-in-Distributions/10.1214/aos/1176350164.short), *Annals of Statistics* 14(4):1379-1387, 1986.

[^hinkley]: David V. Hinkley, ["Inference about the change-point in a sequence of random variables"](https://ideas.repec.org/a/oup/biomet/v57y1970i1p1-17..html), *Biometrika* 57(1):1-17, 1970.

[^gama]: Joao Gama, Indre Zliobaite, Albert Bifet, Mykola Pechenizkiy, and Abdelhamid Bouchachia, ["A Survey on Concept Drift Adaptation"](https://mpechen.win.tue.nl/publications/pubs/Gama_ACMCS_AdaptationCD_accepted.pdf), *ACM Computing Surveys* 46(4), 2014. Bifet and Gavalda's ADWIN work is another useful streaming reference: ["Learning from Time-Changing Data with Adaptive Windowing"](https://www.semanticscholar.org/paper/Learning-from-Time-Changing-Data-with-Adaptive-Bifet-Gavald%C3%A0/d7f8d7b89593c5333eb174b2411bf004f5a91f7d), SDM 2007.
